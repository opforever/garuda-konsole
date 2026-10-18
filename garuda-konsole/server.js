/*
 * ═══════════════════════════════════════════════════════════════
 *  Garuda Konsole 2.0 — Server Core
 *  Persistent web terminal with live sharing, file management,
 *  system monitoring and hardened token-based authentication.
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execSync, execFile } = require('child_process');
const WebSocket = require('ws');
const fileUpload = require('express-fileupload');

let pty = null;
try {
    pty = require('node-pty');
} catch (err) {
    console.error('✖ node-pty failed to load. Run: npm rebuild node-pty (needs build tools).');
    console.error('  Server will still boot so you can read the UI, but terminals need node-pty.');
}

let webpush = null;
try {
    webpush = require('web-push');
} catch (err) {
    console.error('⚠ web-push not installed — background push notifications disabled. Run: npm install');
}

/* ──────────────────────────── Configuration ──────────────────────────── */

const VERSION = '5.4.0';
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PASSWORD = process.env.KONSOLE_PASSWORD || '20090228';

const MAX_SESSIONS = parseInt(process.env.KONSOLE_MAX_SESSIONS || '40', 10);
const MAX_HISTORY_CHUNKS = 6000;
const MAX_HISTORY_BYTES = 12 * 1024 * 1024;      // per-session replay cap
const SHARE_TTL_MS = 24 * 60 * 60 * 1000;        // share links expire after 24h
const IDLE_DEAD_SESSION_MS = 30 * 60 * 1000;     // dead + unwatched sessions GC'd
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;
const CTRL_PREFIX = '\u0000';                    // control-frame sentinel
const TAB_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const PUBLIC_DIR = path.join(__dirname, 'public');
const CUSTOM_THEMES_DIR = path.join(PUBLIC_DIR, 'custom-themes');
const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), 'garuda-konsole-uploads');
const CONFIG_FILE = path.join(__dirname, 'garuda.config.json'); // never web-served (outside public/)

/* AI (Groq) configuration — key stays server-side, clients only get a proxy */
const DEFAULT_GROQ_KEY = process.env.GROQ_API_KEY || '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';
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_RE = /^[A-Za-z0-9][\w.\/:@-]{0,79}$/;
function isValidModelId(m) { return typeof m === 'string' && MODEL_RE.test(m) && !m.includes('..'); }

/* ──────────────────────────── State stores ──────────────────────────── */

const sessions = new Map();      // tabId -> session
const shareTokens = new Map();   // token -> { token, tabId, mode, createdAt }
const activeShareByTab = new Map(); // tabId -> token
const authTokens = new Map();    // token -> { createdAt, ip }
const loginAttempts = new Map(); // ip -> { count, resetAt }

let previousCpu = null;          // for CPU-usage delta sampling

/* ──────────────────────────── Small helpers ──────────────────────────── */

function log(...args) {
    const stamp = new Date().toISOString().slice(11, 19);
    console.log(`[${stamp}]`, ...args);
}

function safeResolve(base, target) {
    // Resolve and guarantee the result stays inside `base`.
    const resolved = path.resolve(base, target);
    if (resolved !== base && !resolved.startsWith(base.endsWith(path.sep) ? base : base + path.sep)) {
        return null;
    }
    return resolved;
}

function sanitizeName(name) {
    if (typeof name !== 'string') return null;
    if (name.includes('\u0000')) return null;
    if (name.includes('/') || name.includes('\\')) return null; // no path separators allowed
    const base = name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!base || base === '.' || base === '..') return null;
    if (base.length > 200) return null;
    return base;
}

function clampInt(v, min, max, fallback) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function resolveShell() {
    if (process.env.KONSOLE_SHELL) return process.env.KONSOLE_SHELL;
    const candidates = ['fish', 'bash', 'zsh', 'sh'];
    for (const c of candidates) {
        try {
            const found = execSync(`command -v ${c}`, { stdio: ['ignore', 'pipe', 'ignore'] })
                .toString().trim();
            if (found) return found;
        } catch (e) { /* try next */ }
    }
    return process.env.SHELL || '/bin/sh';
}

const SHELL_PATH = resolveShell();
const SHELL_NAME = path.basename(SHELL_PATH);

/* Whitelist of shells users may pick for new tabs (profiles feature) */
function buildShellWhitelist() {
    const found = new Map();
    for (const c of ['fish', 'bash', 'zsh', 'sh', 'dash', 'ksh']) {
        try {
            const p = execSync(`command -v ${c}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            if (p) found.set(c, p);
        } catch (e) { /* not installed */ }
    }
    const defName = path.basename(SHELL_PATH);
    if (!found.has(defName)) found.set(defName, SHELL_PATH);
    return found;
}
const SHELL_WHITELIST = buildShellWhitelist();

function resolveWhitelistedShell(param) {
    if (typeof param !== 'string' || !param) return null;
    const base = path.basename(param);
    if (SHELL_WHITELIST.has(base)) return SHELL_WHITELIST.get(base);
    for (const p of SHELL_WHITELIST.values()) {
        if (p === param) return p;
    }
    return null;
}

function clientIp(req) {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
    return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

/* ──────────────────────────── Auth engine ──────────────────────────── */

function issueToken(ip) {
    // Cap growth: evict oldest tokens beyond a sane limit
    if (authTokens.size > 64) {
        const oldest = Array.from(authTokens.entries())
            .sort((a, b) => a[1].createdAt - b[1].createdAt)
            .slice(0, authTokens.size - 64);
        for (const [t] of oldest) authTokens.delete(t);
    }
    const token = crypto.randomBytes(24).toString('hex');
    authTokens.set(token, { createdAt: Date.now(), ip });
    return token;
}

function isValidToken(t) {
    return typeof t === 'string' && t.length >= 16 && authTokens.has(t);
}

/** Accepts either a session token (preferred) or the raw password (compat). */
function credentialFrom(req) {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
    if (isValidToken(bearer)) return { kind: 'token', value: bearer };
    if (bearer && bearer === PASSWORD) return { kind: 'password', value: bearer };
    const q = req.query.auth;
    if (typeof q === 'string') {
        if (isValidToken(q)) return { kind: 'token', value: q };
        if (q === PASSWORD) return { kind: 'password', value: q };
    }
    // httpOnly session cookie (set at login) — enables PWA share-target uploads
    const cookies = parseCookies(req);
    if (cookies.gk_session) {
        if (isValidToken(cookies.gk_session)) return { kind: 'token', value: cookies.gk_session };
        if (cookies.gk_session === PASSWORD) return { kind: 'password', value: cookies.gk_session };
    }
    return null;
}

function parseCookies(req) {
    const out = {};
    const h = req.headers.cookie;
    if (typeof h === 'string') {
        h.split(';').forEach((part) => {
            const i = part.indexOf('=');
            if (i > 0) {
                try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) {}
            }
        });
    }
    return out;
}

function requireAuth(req, res, next) {
    if (!credentialFrom(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

const LOGIN_LIMIT = parseInt(process.env.KONSOLE_LOGIN_LIMIT || '8', 10); // attempts/min/IP

let globalLoginWindow = { count: 0, resetAt: 0 };
function rateLimitLogin(ip) {
    const now = Date.now();
    if (now > globalLoginWindow.resetAt) globalLoginWindow = { count: 0, resetAt: now + 60 * 1000 };
    globalLoginWindow.count += 1;
    if (globalLoginWindow.count > 40) return false; // global ceiling regardless of spoofed IPs
    // Opportunistic cleanup so the map cannot grow forever
    if (loginAttempts.size > 500) {
        for (const [key, entry] of Array.from(loginAttempts.entries())) {
            if (now > entry.resetAt) loginAttempts.delete(key);
        }
    }
    let entry = loginAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + 60 * 1000 };
        loginAttempts.set(ip, entry);
    }
    entry.count += 1;
    return entry.count <= LOGIN_LIMIT;
}

/* ──────────────────────────── Express app ──────────────────────────── */

const app = express();
/* Optional built-in TLS: set KONSOLE_SSL_CERT + KONSOLE_SSL_KEY to serve HTTPS
   (needed for PWA install & web push on phones over the LAN) */
let server;
try {
    if (process.env.KONSOLE_SSL_CERT && process.env.KONSOLE_SSL_KEY) {
        const https = require('https');
        server = https.createServer({
            cert: fs.readFileSync(process.env.KONSOLE_SSL_CERT),
            key: fs.readFileSync(process.env.KONSOLE_SSL_KEY)
        }, app);
    } else {
        server = http.createServer(app);
    }
} catch (err) {
    console.error('TLS init failed, falling back to HTTP:', err.message);
    server = http.createServer(app);
}
const IS_TLS = !!server.addContext;
const wss = new WebSocket.Server({ server, maxPayload: 1024 * 1024 });

app.disable('x-powered-by');
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});
app.use(express.json({ limit: '1mb' }));
app.use(fileUpload({
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 20 },
    useTempFiles: true,
    tempFileDir: TEMP_UPLOAD_DIR,
    abortOnLimit: true
}));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

fs.mkdirSync(CUSTOM_THEMES_DIR, { recursive: true });
fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });

/* ──────────────────────────── Session engine ──────────────────────────── */

function getSessionCwd(session) {
    try {
        if (session && session.alive && session.ptyProcess && session.ptyProcess.pid) {
            return fs.readlinkSync(`/proc/${session.ptyProcess.pid}/cwd`);
        }
    } catch (e) { /* fall through */ }
    return session && session.lastCwd ? session.lastCwd : (process.env.HOME || os.homedir() || '/');
}

function pushHistory(session, data) {
    session.history.push(data);
    session.historyBytes += Buffer.byteLength(data, 'utf8');
    while (session.history.length > MAX_HISTORY_CHUNKS ||
           (session.historyBytes > MAX_HISTORY_BYTES && session.history.length > 1)) {
        const removed = session.history.shift();
        session.historyBytes -= Buffer.byteLength(removed, 'utf8');
    }
}

function sendCtrl(ws, obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(CTRL_PREFIX + JSON.stringify(obj)); } catch (e) {}
    }
}

function broadcastCtrl(session, obj) {
    if (!session) return;
    for (const client of session.clients) sendCtrl(client.ws, obj);
}

/* Live-connection alert channel — complements Web Push. Web Push rides the
   browser's push service (FCM on Android Chrome), which is unreachable on
   some networks and needs a working per-device subscription; this delivers
   the same alerts to every open host/pair tab instantly over the WebSocket
   connections that already exist. Viewers are excluded: task names, prompts
   and trigger lines are host-private. */
function notifyClients(title, body, tag) {
    const msg = {
        type: 'notify',
        title: String(title || 'Garuda Konsole').slice(0, 120),
        body: String(body || '').slice(0, 300),
        tag: String(tag || 'garuda').slice(0, 100)
    };
    let n = 0;
    for (const session of sessions.values()) {
        for (const client of session.clients) {
            if (client.role === 'viewer') continue;
            sendCtrl(client.ws, msg);
            n++;
        }
    }
    return n;
}

function broadcastRaw(session, data) {
    for (const client of session.clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
            try { client.ws.send(data); } catch (e) {}
        }
    }
}

function broadcastPresence(tabId) {
    const session = sessions.get(tabId);
    if (!session) return;
    let viewers = 0, hosts = 0;
    for (const c of session.clients) {
        if (c.role === 'viewer') viewers++; else hosts++;
    }
    broadcastCtrl(session, { type: 'presence', tabId, viewerCount: viewers, hostCount: hosts });
}

function spawnPtyFor(session, cols, rows) {
    const cwd = session.lastCwd || process.env.HOME || os.homedir() || '/';
    const shellPath = session.shell || SHELL_PATH;
    const env = Object.assign({}, process.env, {
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
    });
    const ptyProcess = pty.spawn(shellPath, [], {
        name: 'xterm-256color',
        cols: clampInt(cols, 2, 400, 80),
        rows: clampInt(rows, 2, 200, 24),
        cwd,
        env
    });

    session.ptyProcess = ptyProcess;
    session.alive = true;
    session.exitInfo = null;
    session.lastActivity = Date.now();
    try { session.lastCwd = cwd; } catch (e) {}

    ptyProcess.onData((data) => {
        session.lastActivity = Date.now();
        session.lastOutputAt = Date.now();
        pushHistory(session, data);
        broadcastRaw(session, data);
        try { evalPushTriggers(session, data); } catch (e) {}
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
        session.alive = false;
        session.ptyProcess = null;
        session.exitInfo = { exitCode: exitCode == null ? 0 : exitCode, signal: signal || null, at: Date.now() };
        try { session.lastCwd = fs.readlinkSync(`/proc/${ptyProcess.pid}/cwd`); } catch (e) {}
        log(`Session ${session.tabId}: shell exited (code ${exitCode}${signal ? ', ' + signal : ''})`);
        broadcastCtrl(session, { type: 'exit', tabId: session.tabId, exitCode: session.exitInfo.exitCode, signal: session.exitInfo.signal });
        broadcastPresence(session.tabId);
        if (session.clients.size === 0) {
            pushNotify('Shell exited', `Session "${session.tabId}" ended (code ${session.exitInfo.exitCode}). It will revive when you return.`, 'exit:' + session.tabId).catch(() => {});
        }
    });

    return ptyProcess;
}

function getOrCreateSession(tabId, opts) {
    opts = opts || {};
    let session = sessions.get(tabId);

    if (session) {
        if (!session.alive && opts.autoRespawn && pty) {
            session.history = [];
            session.historyBytes = 0;
            spawnPtyFor(session, opts.cols, opts.rows);
            broadcastCtrl(session, { type: 'restarted', tabId });
        }
        return session;
    }

    if (!pty) return null;
    if (sessions.size >= MAX_SESSIONS) return null;

    session = {
        tabId,
        ptyProcess: null,
        alive: false,
        shell: (opts.shell && resolveWhitelistedShell(opts.shell)) || SHELL_PATH,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        history: [],
        historyBytes: 0,
        clients: new Set(),
        exitInfo: null,
        lastCwd: (opts.cwd && isExistingDir(opts.cwd)) ? path.resolve(opts.cwd) : (process.env.HOME || os.homedir() || '/'),
        pushedCwd: null,
        respawnCount: 0,
        lastOutputAt: 0,
        cmdPending: null,
        pushNotified: false
    };
    sessions.set(tabId, session);
    try {
        spawnPtyFor(session, opts.cols, opts.rows);
        log(`Session ${tabId} created (shell: ${session.shell}) — ${sessions.size} active`);
    } catch (err) {
        sessions.delete(tabId);
        log(`Failed to spawn shell for ${tabId}:`, err.message);
        return null;
    }
    return session;
}

function isExistingDir(p) {
    try {
        return typeof p === 'string' && p.length > 0 && !p.includes('\u0000') &&
            fs.existsSync(p) && fs.statSync(p).isDirectory();
    } catch (e) { return false; }
}

function killSession(tabId, reason) {
    const session = sessions.get(tabId);
    if (!session) return false;
    broadcastCtrl(session, { type: 'session_closed', tabId, reason: reason || 'closed' });
    for (const client of Array.from(session.clients)) {
        try { client.ws.close(4000, 'session closed'); } catch (e) {}
        session.clients.delete(client);
    }
    if (session.ptyProcess && session.alive) {
        try { session.ptyProcess.kill(); } catch (e) {}
    }
    session.alive = false;
    sessions.delete(tabId);
    serverLineBufs.delete(tabId);
    // Revoke any share link pointing at this tab
    const shareToken = activeShareByTab.get(tabId);
    if (shareToken) {
        shareTokens.delete(shareToken);
        activeShareByTab.delete(tabId);
    }
    log(`Session ${tabId} terminated (${reason || 'no reason'})`);
    return true;
}

function countViewers(session) {
    if (!session) return 0;
    let n = 0;
    for (const c of session.clients) if (c.role === 'viewer') n++;
    return n;
}

/* ──────────────────────────── REST: auth & meta ──────────────────────────── */

app.post('/api/login', (req, res) => {
    const ip = clientIp(req);
    if (!rateLimitLogin(ip)) {
        return res.status(429).json({ error: 'Too many attempts. Please wait a minute.' });
    }
    const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
    if (password !== PASSWORD) {
        return res.status(401).json({ error: 'Incorrect password' });
    }
    const token = issueToken(ip);
    try {
        res.cookie('gk_session', token, {
            httpOnly: true,
            sameSite: 'strict',
            secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
        });
    } catch (e) {}
    res.json({
        token,
        shell: SHELL_NAME,
        shellPath: SHELL_PATH,
        hostname: os.hostname(),
        platform: `${os.type()} ${os.release()}`,
        version: VERSION,
        ptyReady: !!pty
    });
});

app.post('/api/logout', (req, res) => {
    const cred = credentialFrom(req);
    if (cred && cred.kind === 'token') authTokens.delete(cred.value);
    res.json({ success: true });
});

app.get('/api/bootstrap', requireAuth, (req, res) => {
    res.json({
        ok: true,
        shell: SHELL_NAME,
        shellPath: SHELL_PATH,
        hostname: os.hostname(),
        platform: `${os.type()} ${os.release()}`,
        version: VERSION,
        ptyReady: !!pty,
        sessionCount: sessions.size
    });
});

app.get('/healthz', (req, res) => res.json({ ok: true, version: VERSION }));

/* ──────────────────────────── REST: sessions ──────────────────────────── */

app.get('/api/sessions', requireAuth, (req, res) => {
    const list = [];
    for (const session of sessions.values()) {
        list.push({
            tabId: session.tabId,
            alive: session.alive,
            shell: path.basename(session.shell || SHELL_PATH),
            clients: session.clients.size,
            viewers: countViewers(session),
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            cwd: getSessionCwd(session),
            historyBytes: session.historyBytes
        });
    }
    list.sort((a, b) => a.createdAt - b.createdAt);
    res.json({ sessions: list, maxSessions: MAX_SESSIONS });
});

app.post('/api/sessions/kill', requireAuth, (req, res) => {
    const tabId = req.body && req.body.tabId;
    if (typeof tabId !== 'string' || !TAB_ID_RE.test(tabId)) {
        return res.status(400).json({ error: 'Invalid tabId' });
    }
    const killed = killSession(tabId, 'killed via API');
    res.json({ success: true, killed });
});

/* ──────────────────────────── REST: system stats ──────────────────────────── */

app.get('/api/stats', requireAuth, (req, res) => {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const cpu of cpus) {
        idle += cpu.times.idle;
        total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
    }
    let cpuUsage = 0;
    if (previousCpu && total > previousCpu.total) {
        const totalDelta = total - previousCpu.total;
        const idleDelta = idle - previousCpu.idle;
        cpuUsage = Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
    }
    previousCpu = { idle, total };

    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    let disk = null;
    try {
        if (typeof fs.statfsSync === 'function') {
            const st = fs.statfsSync(process.env.HOME || '/');
            disk = {
                total: st.blocks * st.bsize,
                free: st.bavail * st.bsize,
                used: (st.blocks - st.bavail) * st.bsize
            };
        }
    } catch (e) { /* disk info optional */ }

    let viewers = 0;
    for (const s of sessions.values()) viewers += countViewers(s);

    res.json({
        cpu: {
            usage: Math.round(cpuUsage * 10) / 10,
            cores: cpus.length,
            model: cpus.length ? cpus[0].model.replace(/\s+/g, ' ').trim() : 'unknown',
            load: os.loadavg().map((l) => Math.round(l * 100) / 100)
        },
        mem: { total: totalMem, used: totalMem - freeMem, free: freeMem },
        disk,
        uptime: os.uptime(),
        hostname: os.hostname(),
        platform: `${os.type()} ${os.release()} (${os.arch()})`,
        nodeVersion: process.version,
        sessions: sessions.size,
        viewers,
        version: VERSION
    });
});

/* ─────────────── 5.2: monitor history ring, process manager, tab health ─────────────── */

const STATS_RING_MAX = 720;                 // 5 s ticks → 1 hour of history
const STATS_TICK_MS = clampInt(process.env.GK_STATS_TICK_MS, 200, 600000, 5000);
const HEALTH_CPU = clampInt(process.env.GK_HEALTH_CPU, 1, 100, 90);           // % of one core, per tab tree
const HEALTH_RSS_MB = clampInt(process.env.GK_HEALTH_RSS_MB, 64, 65536, 1536);
const HEALTH_MIN = clampInt(process.env.GK_HEALTH_MIN, 1, 600, 10);           // long-running foreground command
const statsRing = [];
const ringCpuStore = { ref: null };
let netPrev = null;
const procJiffPrev = new Map();   // pid → { jiff, at }  (process list cpu%)
const healthPrev = new Map();     // pid → { jiff, at }  (tab health cpu%)

function cpuSample(store) {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const c of cpus) {
        idle += c.times.idle;
        total += c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle;
    }
    let pct = 0;
    if (store.ref && total > store.ref.total) {
        pct = Math.max(0, Math.min(100, (1 - (idle - store.ref.idle) / (total - store.ref.total)) * 100));
    }
    store.ref = { idle, total };
    return Math.round(pct * 10) / 10;
}

function readNetBytes() {
    try {
        const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2);
        let rx = 0, tx = 0;
        for (const line of lines) {
            const halves = line.split(':');
            if (halves.length < 2) continue;
            const f = halves[1].trim().split(/\s+/).map(Number);
            rx += f[0] || 0;
            tx += f[8] || 0;
        }
        return { rx, tx, at: Date.now() };
    } catch (e) { return null; }
}

function diskPct() {
    try {
        if (typeof fs.statfsSync === 'function') {
            const st = fs.statfsSync(process.env.HOME || '/');
            if (st.blocks > 0) return Math.round((1 - st.bavail / st.blocks) * 1000) / 10;
        }
    } catch (e) {}
    return null;
}

/* Parse /proc into a pid map: { pid: {pid,ppid,comm,state,utime,stime,nice,rss,cmd} } */
function readProcTable() {
    const table = new Map();
    let dirs = [];
    try { dirs = fs.readdirSync('/proc'); } catch (e) { return table; }
    const pageSize = 4096;
    for (const d of dirs) {
        if (!/^\d+$/.test(d)) continue;
        const pid = +d;
        try {
            const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
            const lp = stat.indexOf('(');
            const rp = stat.lastIndexOf(')');
            if (lp === -1 || rp === -1) continue;
            const comm = stat.slice(lp + 1, rp);
            const f = stat.slice(rp + 2).split(' ');
            const state = f[0];
            const ppid = +f[1] || 0;
            const utime = +f[11] || 0;
            const stime = +f[12] || 0;
            const nice = +f[16] || 0;
            let rss = 0;
            try {
                const statm = fs.readFileSync(`/proc/${pid}/statm`, 'utf8').trim().split(/\s+/).map(Number);
                rss = (statm[1] || 0) * pageSize;
            } catch (e) {}
            let cmd = comm;
            try {
                const cl = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
                if (cl) cmd = cl.slice(0, 120);
            } catch (e) {}
            table.set(pid, { pid, ppid, comm, state, utime, stime, nice, rss, cmd });
        } catch (e) { /* process vanished mid-scan */ }
    }
    return table;
}

function cpuPctFor(pid, jiff, map, now) {
    const prev = map.get(pid);
    map.set(pid, { jiff, at: now });
    if (!prev) return 0;
    const dtMs = now - prev.at;
    if (dtMs <= 0) return 0;
    // 100 jiffies/s = one full core → pct = dj * 1000 / dtMs
    return Math.max(0, Math.round(((jiff - prev.jiff) * 1000 / dtMs) * 10) / 10);
}

/* Per-tab health: sum CPU/RSS over the session's process subtree; flag long runners */
function collectTabHealth(now, table) {
    const children = new Map();
    for (const p of table.values()) {
        if (!children.has(p.ppid)) children.set(p.ppid, []);
        children.get(p.ppid).push(p.pid);
    }
    for (const [tabId, session] of sessions.entries()) {
        const rootPid = session.ptyProcess && session.ptyProcess.pid;
        if (!rootPid || !session.alive) {
            if (session.healthLevel) {
                session.healthLevel = null;
                broadcastCtrl(session, { type: 'tab-health', tabId, level: 'ok', cpu: 0, rssMb: 0, mins: 0 });
            }
            continue;
        }
        let cpu = 0, rss = 0, running = false;
        const queue = [rootPid];
        const seen = new Set();
        while (queue.length) {
            const pid = queue.shift();
            if (seen.has(pid)) continue;
            seen.add(pid);
            const p = table.get(pid);
            if (!p) continue;
            cpu += cpuPctFor(pid, p.utime + p.stime, healthPrev, now);
            rss += p.rss;
            if (p.state === 'R' && pid !== rootPid) running = true;
            const kids = children.get(pid);
            if (kids) for (const k of kids) queue.push(k);
        }
        cpu = Math.round(cpu * 10) / 10;
        const rssMb = Math.round(rss / 1048576);
        if (running) { if (!session.longSince) session.longSince = now; } else session.longSince = null;
        const mins = session.longSince ? Math.floor((now - session.longSince) / 60000) : 0;
        const level = (cpu >= HEALTH_CPU || rssMb >= HEALTH_RSS_MB || mins >= HEALTH_MIN) ? 'hot' : 'ok';
        if (level !== session.healthLevel) {
            session.healthLevel = level;
            broadcastCtrl(session, { type: 'tab-health', tabId, level, cpu, rssMb, mins });
            if (level === 'hot') log(`[health] tab ${tabId} hot: cpu=${cpu}% rss=${rssMb}MB mins=${mins}`);
        }
    }
}

function collectStatsTick() {
    const now = Date.now();
    const cpu = cpuSample(ringCpuStore);
    const totalMem = os.totalmem();
    const memPct = totalMem ? Math.round(((totalMem - os.freemem()) / totalMem) * 1000) / 10 : null;
    const net = readNetBytes();
    let rx = 0, tx = 0;
    if (net && netPrev && net.at > netPrev.at) {
        const dt = (net.at - netPrev.at) / 1000;
        rx = Math.max(0, Math.round((net.rx - netPrev.rx) / dt));
        tx = Math.max(0, Math.round((net.tx - netPrev.tx) / dt));
    }
    netPrev = net;
    statsRing.push({ t: now, cpu, mem: memPct, rx, tx, disk: diskPct() });
    while (statsRing.length > STATS_RING_MAX) statsRing.shift();
    collectTabHealth(now, readProcTable());
}
setInterval(collectStatsTick, STATS_TICK_MS);

app.get('/api/stats/history', requireAuth, (req, res) => {
    res.json({ tickMs: STATS_TICK_MS, ring: statsRing.slice(-STATS_RING_MAX) });
});

function pidGuard(pid) {
    if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return 'refused pid';
    const table = readProcTable();
    if (!table.has(pid)) return 'no such process';
    try {
        const st = fs.statSync(`/proc/${pid}`);
        if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return 'not your process';
    } catch (e) { return 'no such process'; }
    let cur = process.pid;
    for (let hop = 0; hop < 32 && cur > 1; hop++) {
        if (cur === pid) return 'refused: ancestor of the server';
        const p = table.get(cur);
        if (!p) break;
        cur = p.ppid;
    }
    return null;
}

app.get('/api/processes', requireAuth, (req, res) => {
    const now = Date.now();
    const rows = [];
    for (const p of readProcTable().values()) {
        rows.push({
            pid: p.pid, ppid: p.ppid, comm: p.comm, cmd: p.cmd, state: p.state,
            cpu: cpuPctFor(p.pid, p.utime + p.stime, procJiffPrev, now),
            rssMb: Math.round((p.rss / 1048576) * 10) / 10,
            nice: p.nice
        });
    }
    rows.sort((a, b) => b.cpu - a.cpu || b.rssMb - a.rssMb);
    res.json({ processes: rows.slice(0, 60) });
});

app.post('/api/processes/kill', requireAuth, (req, res) => {
    const pid = (req.body && req.body.pid) | 0;
    const name = ['TERM', 'INT', 'HUP', 'KILL'].includes(req.body && req.body.signal) ? req.body.signal : 'TERM';
    const err = pidGuard(pid);
    if (err) return res.status(403).json({ error: err });
    try {
        process.kill(pid, 'SIG' + name); // this Node build rejects bare names
        res.json({ success: true, pid, signal: name });
    } catch (e) {
        res.status(e.code === 'ESRCH' ? 404 : 500).json({ error: 'kill failed: ' + (e.code || e.message) });
    }
});

app.post('/api/processes/nice', requireAuth, (req, res) => {
    const pid = (req.body && req.body.pid) | 0;
    const value = clampInt(req.body && req.body.value, -20, 19, null);
    if (value === null) return res.status(400).json({ error: 'value must be -20..19' });
    const err = pidGuard(pid);
    if (err) return res.status(403).json({ error: err });
    require('child_process').execFile('renice', ['-n', String(value), '-p', String(pid)], { timeout: 5000 }, (e, out, stderr) => {
        if (e) return res.status(500).json({ error: String(stderr || e.message).slice(0, 200) });
        res.json({ success: true, pid, value });
    });
});

/* ─────────────── 5.2: saved workspace layouts (server-side → any device) ─────────────── */

app.get('/api/layouts', requireAuth, (req, res) => {
    const cfg = loadConfigFile();
    res.json({ layouts: Array.isArray(cfg.layouts) ? cfg.layouts : [] });
});

app.post('/api/layouts', requireAuth, (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!Array.isArray(body.tabs) || !body.tabs.length) return res.status(400).json({ error: 'tabs are required' });
    const tabs = body.tabs.slice(0, 12).map((t) => {
        const session = sessions.get(String(t.tabId || ''));
        return {
            tabId: String(t.tabId || '').slice(0, 40),
            title: String(t.title || 'tab').slice(0, 60),
            color: String(t.color || '').slice(0, 20),
            cwd: session ? getSessionCwd(session) : null,
            alive: !!session
        };
    });
    const layout = {
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'layout',
        name,
        tabs,
        split: body.split && body.split.mode ? { mode: body.split.mode === 'h' ? 'h' : 'v', focus: body.split.focus === 1 ? 1 : 0 } : null,
        active: clampInt(body.active, 0, 11, 0),
        updatedAt: Date.now()
    };
    const cfg = loadConfigFile();
    if (!Array.isArray(cfg.layouts)) cfg.layouts = [];
    const at = cfg.layouts.findIndex((l) => l && l.id === layout.id);
    if (at >= 0) cfg.layouts[at] = layout; else cfg.layouts.push(layout);
    cfg.layouts = cfg.layouts.slice(-20);
    saveConfigFile(cfg);
    res.json({ success: true, layout });
});

app.delete('/api/layouts/:id', requireAuth, (req, res) => {
    const cfg = loadConfigFile();
    if (!Array.isArray(cfg.layouts)) return res.json({ success: true });
    cfg.layouts = cfg.layouts.filter((l) => l && l.id !== req.params.id);
    saveConfigFile(cfg);
    res.json({ success: true });
});

/* ─────────────── 5.2: in-browser file editor (atomic write + .bak) ─────────────── */

app.post('/api/files/write', requireAuth, (req, res) => {
    try {
        const body = req.body || {};
        const target = typeof body.path === 'string' ? path.resolve(body.path) : null;
        const content = typeof body.content === 'string' ? body.content : null;
        if (!target || content === null) return res.status(400).json({ error: 'path and content are required' });
        if (target.includes('\u0000')) return res.status(400).json({ error: 'Invalid path' });
        if (Buffer.byteLength(content, 'utf8') > 5 * 1024 * 1024) return res.status(413).json({ error: 'Refusing to write more than 5 MB' });
        const exists = fs.existsSync(target);
        if (exists) {
            if (PROTECTED_PATHS.has(target)) return res.status(403).json({ error: 'Refusing to write a protected system path' });
            if (!fs.statSync(target).isFile()) return res.status(400).json({ error: 'Not a file' });
            const mtime = fs.statSync(target).mtimeMs;
            if (typeof body.mtime === 'number' && !body.force && Math.abs(mtime - body.mtime) > 1) {
                return res.status(409).json({ error: 'File changed on disk since you opened it', mtime });
            }
            fs.copyFileSync(target, target + '.bak'); // one backup generation
        } else {
            if (!isExistingDir(path.dirname(target))) return res.status(404).json({ error: 'Parent directory not found' });
        }
        const tmp = target + '.gk-tmp';
        fs.writeFileSync(tmp, content, 'utf8');
        fs.renameSync(tmp, target); // atomic replace
        const st = fs.statSync(target);
        res.json({ success: true, bytes: st.size, mtime: st.mtimeMs, backup: exists ? target + '.bak' : null });
    } catch (err) {
        const code = err && err.code === 'EACCES' ? 403 : 500;
        res.status(code).json({ error: 'Failed to write file' });
    }
});

/* ─────────────── 5.2: replay share links (public 24 h player page) ─────────────── */

const replayShares = new Map(); // token → { token, title, events, createdAt }
const REPLAY_TTL_MS = 24 * 60 * 60 * 1000;
function purgeReplayShares() {
    const now = Date.now();
    for (const [t, r] of replayShares.entries()) if (now - r.createdAt > REPLAY_TTL_MS) replayShares.delete(t);
    while (replayShares.size > 50) replayShares.delete(replayShares.keys().next().value);
}
setInterval(purgeReplayShares, 60 * 60 * 1000);

app.post('/api/replay/share', requireAuth, (req, res) => {
    const body = req.body || {};
    const events = Array.isArray(body.events) ? body.events : null;
    if (!events || !events.length) return res.status(400).json({ error: 'events are required' });
    let bytes = 0;
    for (const ev of events) {
        if (!ev || typeof ev.t !== 'number' || typeof ev.d !== 'string') return res.status(400).json({ error: 'bad event shape' });
        bytes += ev.d.length;
        if (bytes > 4 * 1024 * 1024) return res.status(413).json({ error: 'replay too large to share (4 MB cap)' });
    }
    purgeReplayShares();
    const token = 'replay_' + crypto.randomBytes(10).toString('hex');
    replayShares.set(token, { token, title: String(body.title || 'Terminal replay').slice(0, 80), events, createdAt: Date.now() });
    res.json({ success: true, token, url: '/replay.html?r=' + token, expiresAt: Date.now() + REPLAY_TTL_MS });
});

app.get('/api/replay/:token', (req, res) => {
    const share = replayShares.get(req.params.token);
    if (!share || Date.now() - share.createdAt > REPLAY_TTL_MS) return res.status(404).json({ error: 'Replay not found or expired' });
    res.json({ title: share.title, createdAt: share.createdAt, events: share.events });
});

/* ─────────────── 5.3: Remote Desktop — screen + input (+audio) over WS/MSE ───────────────
   Capture is pluggable (the sandbox has no compositor; real machines do):
     1. GK_RD_CAPTURE_CMD  — any shell command writing streamable fMP4/WebM to stdout
                             (tools/rd-screencast-kwin.sh = zero-prompt KDE Wayland path)
     2. GK_RD_CAPTURE_FILE — loop-stream a file (tests, demos)
     3. none               — status reports unavailable + setup hints
   Input backends: ydotoold socket (no prompts) → ydotool CLI → echo (tests) → none.
   Approval model: web login is the gate; KWin D-Bus screencast + ydotoold need no
   per-session consent (one-time setup via tools/rd-setup.sh). */

const RD = {
    enabled: process.env.GK_RD !== '0',
    captureCmd: process.env.GK_RD_CAPTURE_CMD || '',
    captureFile: process.env.GK_RD_CAPTURE_FILE || '',
    inputMode: process.env.GK_RD_INPUT || '',
    width: clampInt(process.env.GK_RD_WIDTH, 320, 7680, 1920),
    height: clampInt(process.env.GK_RD_HEIGHT, 240, 4320, 1080),
    mime: process.env.GK_RD_MIME || ''
};
let rdSession = null; // { kind, proc, clients:Set, mime, startedAt, bytes }

function rdHasBin(b) {
    try { return require('child_process').spawnSync('which', [b], { stdio: 'ignore' }).status === 0; } catch (e) { return false; }
}
function rdYdotoolSocket() {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
    const xdg = process.env.XDG_RUNTIME_DIR || `/run/user/${uid}`;
    // ydotool >=1.0 defaults to a DOT-prefixed socket in XDG_RUNTIME_DIR
    const cands = [process.env.YDOTOOL_SOCKET, path.join(xdg, '.ydotool_socket'), path.join(xdg, 'ydotool.socket'), '/tmp/.ydotool_socket'].filter(Boolean);
    for (const c of cands) { try { fs.accessSync(c, fs.constants.W_OK); return c; } catch (e) {} }
    return null;
}
function rdInputBackend() {
    if (RD.inputMode === 'echo') return 'echo';
    if (RD.inputMode === 'none') return 'none';
    if (rdYdotoolSocket()) return 'ydotoold';
    if (rdHasBin('ydotool')) return 'ydotool-cli';
    return 'none';
}
function rdDetectCapture() {
    if (RD.captureCmd) return { kind: 'cmd', cmd: RD.captureCmd };
    if (RD.captureFile && fs.existsSync(RD.captureFile)) return { kind: 'file', file: RD.captureFile };
    const kwinScript = path.join(__dirname, 'tools', 'rd-screencast-kwin.sh');
    if (process.env.GK_RD_KWIN !== '0' && fs.existsSync(kwinScript) && rdHasBin('busctl') && rdHasBin('gst-launch-1.0')) {
        return { kind: 'cmd', cmd: `sh '${kwinScript}'` };
    }
    return null;
}
function rdMimeFor(capture) {
    if (RD.mime) return RD.mime;
    if (capture && capture.kind === 'file') {
        return /\.webm$/i.test(capture.file) ? 'video/webm; codecs=vp8' : 'video/mp4; codecs=avc1.42E01E';
    }
    return 'video/mp4; codecs=avc1.42E01E';
}

app.get('/api/rd/status', requireAuth, (req, res) => {
    const capture = rdDetectCapture();
    res.json({
        enabled: RD.enabled,
        capture: capture ? capture.kind : null,
        input: rdInputBackend(),
        mime: rdMimeFor(capture),
        width: RD.width, height: RD.height,
        active: !!rdSession,
        clients: rdSession ? rdSession.clients.size : 0,
        ydotoolSocket: rdYdotoolSocket(),
        hint: capture ? null : 'No capture source. Set GK_RD_CAPTURE_CMD (see tools/rd-screencast-kwin.sh) or GK_RD_CAPTURE_FILE.'
    });
});

/* linux input_event: {time_sec u64, time_usec u64, type u16, code u16, value s32} = 24 B */
function rdInputEvent(type, code, value) {
    const b = Buffer.alloc(24);
    const now = Date.now();
    b.writeBigUInt64LE(BigInt(Math.floor(now / 1000)), 0);
    b.writeBigUInt64LE(BigInt((now % 1000) * 1000), 8);
    b.writeUInt16LE(type, 16);
    b.writeUInt16LE(code, 18);
    b.writeInt32LE(value | 0, 20);
    return b;
}
const RD_KEYMAP = {
    KeyA: 30, KeyB: 48, KeyC: 46, KeyD: 32, KeyE: 18, KeyF: 33, KeyG: 34, KeyH: 35, KeyI: 23, KeyJ: 36, KeyK: 37, KeyL: 38, KeyM: 50, KeyN: 49, KeyO: 24, KeyP: 25, KeyQ: 16, KeyR: 19, KeyS: 31, KeyT: 20, KeyU: 22, KeyV: 47, KeyW: 17, KeyX: 45, KeyY: 21, KeyZ: 44,
    Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6, Digit6: 7, Digit7: 8, Digit8: 9, Digit9: 10, Digit0: 11,
    Enter: 28, Escape: 1, Backspace: 14, Tab: 15, Space: 57, Minus: 12, Equal: 13, BracketLeft: 26, BracketRight: 27, Backslash: 43, Semicolon: 39, Quote: 40, Backquote: 41, Comma: 51, Period: 52, Slash: 53,
    ArrowUp: 103, ArrowLeft: 105, ArrowRight: 106, ArrowDown: 108, Home: 102, End: 107, PageUp: 104, PageDown: 109, Delete: 111, Insert: 110,
    F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64, F7: 65, F8: 66, F9: 67, F10: 68, F11: 87, F12: 88,
    ControlLeft: 29, ControlRight: 97, ShiftLeft: 42, ShiftRight: 54, AltLeft: 56, AltRight: 100, MetaLeft: 125, MetaRight: 126, CapsLock: 58
};
let rdSock = null;
let rdSpawnAt = 0;
function rdSpawnYdotoold(sock) {
    // self-heal: stale socket (ECONNREFUSED) or missing daemon → relaunch once per 10 s
    if (!rdHasBin('ydotoold')) return;
    const now = Date.now();
    if (now - rdSpawnAt < 10000) return;
    rdSpawnAt = now;
    try {
        if (sock) { try { fs.unlinkSync(sock); } catch (e) {} } // stale socket file left by a dead daemon
        const child = require('child_process').spawn('ydotoold', [], { stdio: 'ignore', detached: true });
        child.unref();
        log('[rd] spawned ydotoold (self-heal)');
    } catch (e) {}
}
function rdSendYdotoold(bufs) {
    const sock = rdYdotoolSocket();
    if (!sock) { rdSpawnYdotoold(null); return false; }
    try {
        const net = require('net');
        if (!rdSock || rdSock.destroyed) {
            rdSock = net.connect(sock);
            rdSock.on('error', (e) => {
                try { rdSock.destroy(); } catch (e2) {}
                rdSock = null;
                if (e && e.code === 'ECONNREFUSED') rdSpawnYdotoold(sock); // stale socket → relaunch daemon
            });
        }
        rdSock.write(Buffer.concat(bufs));
        return true;
    } catch (e) { return false; }
}
function rdApplyInput(ev) {
    const backend = rdInputBackend();
    if (backend === 'echo') return { ok: true, backend, echo: ev };
    if (backend === 'none') return { ok: false, backend, error: 'no input backend (enable ydotoold — see tools/rd-setup.sh)' };
    const bufs = [];
    const SYN = [0, 0, 0];
    if (ev.type === 'rd-pointer') {
        if (typeof ev.x === 'number' && typeof ev.y === 'number') {
            bufs.push(rdInputEvent(3, 0, Math.max(0, Math.min(32767, Math.round(ev.x * 32767)))));
            bufs.push(rdInputEvent(3, 1, Math.max(0, Math.min(32767, Math.round(ev.y * 32767)))));
        }
        if (typeof ev.wheel === 'number' && ev.wheel) bufs.push(rdInputEvent(2, 8, ev.wheel > 0 ? -1 : 1));
        if (typeof ev.button === 'number' && ev.button >= 0 && typeof ev.down === 'boolean') {
            const btn = ev.button === 2 ? 0x111 : ev.button === 1 ? 0x112 : 0x110;
            bufs.push(rdInputEvent(1, btn, ev.down ? 1 : 0));
        }
        bufs.push(rdInputEvent(SYN[0], SYN[1], SYN[2]));
    } else if (ev.type === 'rd-key') {
        const code = RD_KEYMAP[ev.code];
        if (code == null) return { ok: false, backend, error: 'unmapped key ' + ev.code };
        bufs.push(rdInputEvent(1, code, ev.down ? 1 : 0));
        bufs.push(rdInputEvent(0, 0, 0));
    } else {
        return { ok: false, backend, error: 'unknown rd event' };
    }
    if (backend === 'ydotoold') {
        if (rdSendYdotoold(bufs)) return { ok: true, backend };
        return { ok: false, backend, error: 'ydotoold socket write failed' };
    }
    return { ok: false, backend, error: 'input backend unavailable' };
}

function rdBroadcastCtrl(obj) {
    if (!rdSession) return;
    const msg = CTRL_PREFIX + JSON.stringify(obj);
    for (const ws of rdSession.clients) { try { if (ws.readyState === WebSocket.OPEN) ws.send(msg); } catch (e) {} }
}
function rdStop(reason) {
    if (!rdSession) return;
    const s = rdSession;
    rdSession = null;
    try { if (s.proc) s.proc.kill(); } catch (e) {}
    if (s.fileTimer) clearInterval(s.fileTimer);
    for (const ws of s.clients) { try { sendCtrl(ws, { type: 'rd-ended', reason: reason || 'stopped' }); } catch (e) {} }
    log(`[rd] session stopped (${reason || 'done'})`);
}
function rdStart(ws) {
    if (rdSession) { rdSession.clients.add(ws); sendCtrl(ws, { type: 'rd-meta', mime: rdSession.mime, width: RD.width, height: RD.height, capture: rdSession.kind, input: rdInputBackend(), joined: true }); return; }
    const capture = rdDetectCapture();
    if (!RD.enabled || !capture) {
        sendCtrl(ws, { type: 'rd-ended', reason: 'no-capture', hint: 'Set GK_RD_CAPTURE_CMD (tools/rd-screencast-kwin.sh on KDE) or GK_RD_CAPTURE_FILE.' });
        return;
    }
    const mime = rdMimeFor(capture);
    rdSession = { kind: capture.kind, proc: null, clients: new Set([ws]), mime, startedAt: Date.now(), bytes: 0, fileTimer: null };
    sendCtrl(ws, { type: 'rd-meta', mime, width: RD.width, height: RD.height, capture: capture.kind, input: rdInputBackend() });
    const feed = (chunk) => {
        if (!rdSession) return;
        rdSession.bytes += chunk.length;
        for (const c of rdSession.clients) { try { if (c.readyState === WebSocket.OPEN) c.send(chunk); } catch (e) {} }
    };
    if (capture.kind === 'file') {
        let pos = 0;
        const buf = fs.readFileSync(capture.file);
        rdSession.fileTimer = setInterval(() => {
            if (!rdSession) return;
            const chunk = buf.subarray(pos, pos + 32768);
            pos += chunk.length;
            feed(chunk);
            if (pos >= buf.length) {
                clearInterval(rdSession.fileTimer);
                rdSession.fileTimer = null;
                rdBroadcastCtrl({ type: 'rd-stream-ended' }); // media done; session (input) stays alive
                log('[rd] file stream ended (session kept for input)');
            }
        }, 120);
    } else {
        const startProc = (cmd, canFallback) => {
            const proc = require('child_process').spawn('sh', ['-c', cmd], { stdio: ['ignore', 'pipe', 'pipe'] });
            rdSession.proc = proc;
            proc.stdout.on('data', feed);
            proc.stderr.on('data', (d) => log('[rd-capture] ' + d.toString().slice(0, 300)));
            proc.on('exit', (code) => {
                if (!rdSession) return;
                const portalScript = path.join(__dirname, 'tools', 'rd-screencast-portal.sh');
                const early = canFallback && rdSession.bytes === 0 && (Date.now() - rdSession.startedAt) < 8000;
                if (early && fs.existsSync(portalScript) && rdHasBin('gdbus')) {
                    log('[rd] capture failed early — falling back to portal ScreenCast (approve once, silent after)');
                    rdSession.kind = 'cmd-portal';
                    rdBroadcastCtrl({ type: 'rd-meta', mime: rdSession.mime, width: RD.width, height: RD.height, capture: 'portal', input: rdInputBackend() });
                    startProc(`sh '${portalScript}'`, false);
                    return;
                }
                rdStop('capture exited ' + code);
            });
        };
        startProc(capture.cmd, true);
    }
    log(`[rd] session started (${capture.kind}, ${mime})`);
}
function handleRdSocket(ws) {
    ws.on('message', (raw) => {
        let ev;
        try { ev = JSON.parse(raw.toString()); } catch (e) { return; }
        if (!ev || typeof ev.type !== 'string') return;
        if (!rdSession || !rdSession.clients.has(ws)) { rdStart(ws); if (ev.type !== 'rd-hello') return; }
        if (ev.type === 'rd-pointer' || ev.type === 'rd-key') {
            const res = rdApplyInput(ev);
            if (res.echo) sendCtrl(ws, { type: 'rd-input-echo', ev });
            else if (!res.ok) sendCtrl(ws, { type: 'rd-input-error', error: res.error, backend: res.backend });
        } else if (ev.type === 'rd-stop') {
            rdSession.clients.delete(ws);
            if (!rdSession.clients.size) rdStop('client left');
        }
    });
    ws.on('close', () => {
        if (rdSession && rdSession.clients.has(ws)) {
            rdSession.clients.delete(ws);
            if (!rdSession.clients.size) rdStop('last client left');
        }
    });
    rdStart(ws);
}

/* ─────────────── 5.2.1: persistent recording library (~/Rec_jsonl) ─────────────── */

const REC_DIR = path.resolve(process.env.GK_REC_DIR || path.join(os.homedir(), 'Rec_jsonl'));
const REC_NAME_RE = /^garuda-replay-[\w.-]+\.jsonl$/;
function ensureRecDir() {
    try { fs.mkdirSync(REC_DIR, { recursive: true }); return true; } catch (e) { return false; }
}

app.post('/api/recordings', requireAuth, (req, res) => {
    const body = req.body || {};
    const chunks = Array.isArray(body.chunks) ? body.chunks : null;
    if (!chunks || !chunks.length) return res.status(400).json({ error: 'chunks are required' });
    let bytes = 0;
    for (const c of chunks) {
        if (!c || typeof c.t !== 'number' || typeof c.d !== 'string') return res.status(400).json({ error: 'bad chunk shape' });
        bytes += c.d.length;
        if (bytes > 20 * 1024 * 1024) return res.status(413).json({ error: 'recording too large (20 MB cap)' });
    }
    if (!ensureRecDir()) return res.status(500).json({ error: 'cannot create ' + REC_DIR });
    const name = 'garuda-replay-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(2).toString('hex') + '.jsonl';
    const header = { app: 'garuda-konsole', version: VERSION, title: String(body.title || 'recording').slice(0, 120), frames: chunks.length };
    const lines = [JSON.stringify(header)];
    for (const c of chunks) lines.push(JSON.stringify({ t: c.t, d: c.d }));
    try {
        fs.writeFileSync(path.join(REC_DIR, name), lines.join('\n') + '\n', 'utf8');
    } catch (e) {
        return res.status(500).json({ error: 'write failed' });
    }
    res.json({ success: true, name, dir: REC_DIR, bytes });
});

app.get('/api/recordings', requireAuth, (req, res) => {
    if (!ensureRecDir()) return res.json({ recordings: [], dir: REC_DIR });
    const out = [];
    for (const f of fs.readdirSync(REC_DIR)) {
        if (!REC_NAME_RE.test(f)) continue;
        try {
            const st = fs.statSync(path.join(REC_DIR, f));
            out.push({ name: f, size: st.size, mtime: st.mtimeMs });
        } catch (e) {}
    }
    out.sort((a, b) => b.mtime - a.mtime);
    res.json({ recordings: out.slice(0, 100), dir: REC_DIR });
});

app.get('/api/recordings/:name', requireAuth, (req, res) => {
    if (!REC_NAME_RE.test(req.params.name)) return res.status(400).json({ error: 'invalid recording name' });
    const abs = path.join(REC_DIR, req.params.name);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return res.status(404).json({ error: 'not found' });
    try {
        const lines = fs.readFileSync(abs, 'utf8').split('\n').filter(Boolean);
        let header = null, start = 0;
        try {
            const h = JSON.parse(lines[0]);
            if (h && h.app === 'garuda-konsole') { header = h; start = 1; }
        } catch (e) {}
        const chunks = lines.slice(start)
            .map((l) => { try { return JSON.parse(l); } catch (e) { return null; } })
            .filter((c) => c && typeof c.t === 'number' && typeof c.d === 'string')
            .map((c) => ({ t: c.t, d: c.d }));
        res.json({ title: (header && header.title) || req.params.name, chunks });
    } catch (e) {
        res.status(500).json({ error: 'read failed' });
    }
});

app.delete('/api/recordings/:name', requireAuth, (req, res) => {
    if (!REC_NAME_RE.test(req.params.name)) return res.status(400).json({ error: 'invalid recording name' });
    try {
        fs.unlinkSync(path.join(REC_DIR, req.params.name));
        res.json({ success: true });
    } catch (e) {
        res.status(404).json({ error: 'not found' });
    }
});

/* ──────────────────────────── REST: shells & git ──────────────────────────── */

app.get('/api/shells', requireAuth, (req, res) => {
    const list = [];
    for (const [name, p] of SHELL_WHITELIST.entries()) {
        list.push({ name, path: p, isDefault: p === SHELL_PATH });
    }
    res.json({ shells: list, default: SHELL_NAME });
});

const gitCache = new Map(); // dir -> { res, at }

app.get('/api/git', requireAuth, (req, res) => {
    try {
        let dir = typeof req.query.path === 'string' && req.query.path.length
            ? path.resolve(req.query.path)
            : null;
        if (!dir) {
            const tabId = typeof req.query.tabId === 'string' ? req.query.tabId : '';
            dir = getSessionCwd(sessions.get(tabId));
        }
        if (!isExistingDir(dir)) return res.json({ isRepo: false });

        const cached = gitCache.get(dir);
        if (cached && Date.now() - cached.at < 4000) return res.json(cached.res);
        if (gitCache.size > 300) gitCache.clear();

        execFile('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 900, maxBuffer: 64 * 1024 }, (err, stdout) => {
            if (err) {
                const out = { isRepo: false };
                gitCache.set(dir, { res: out, at: Date.now() });
                return res.json(out);
            }
            const branch = String(stdout).trim().slice(0, 200);
            execFile('git', ['-C', dir, 'status', '--porcelain'], { timeout: 1500, maxBuffer: 512 * 1024 }, (err2, stdout2) => {
                const out = {
                    isRepo: true,
                    branch: branch || 'HEAD',
                    dirty: !err2 && String(stdout2).trim().length > 0
                };
                gitCache.set(dir, { res: out, at: Date.now() });
                res.json(out);
            });
        });
    } catch (e) {
        res.json({ isRepo: false });
    }
});

/* ──────────────────────────── REST: file manager ──────────────────────────── */

function listDirectory(absPath) {
    const names = fs.readdirSync(absPath);
    const entries = [];
    for (const name of names.slice(0, 5000)) {
        let isDir = false, isLink = false, size = 0, mtime = 0, isExec = false;
        try {
            const lst = fs.lstatSync(path.join(absPath, name));
            isLink = lst.isSymbolicLink();
            size = lst.size;
            mtime = lst.mtimeMs;
            isDir = lst.isDirectory();
            if (isLink && !isDir) {
                try { isDir = fs.statSync(path.join(absPath, name)).isDirectory(); } catch (e) {}
            }
            isExec = !isDir && ((lst.mode & 0o111) !== 0);
        } catch (e) { /* entry vanished or unreadable */ }
        entries.push({ name, dir: isDir, link: isLink, exec: isExec, size, mtime });
    }
    return entries;
}

app.get('/api/files', requireAuth, (req, res) => {
    try {
        let target = typeof req.query.path === 'string' ? req.query.path : '';
        if (target.includes('\u0000')) return res.status(400).json({ error: 'Invalid path' });

        if (!target) {
            const tabId = typeof req.query.tabId === 'string' ? req.query.tabId : '';
            const session = sessions.get(tabId);
            target = getSessionCwd(session);
        }
        const abs = path.resolve(target);
        if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Path not found', path: abs });
        const st = fs.statSync(abs);
        if (!st.isDirectory()) return res.status(400).json({ error: 'Not a directory', path: abs });

        res.json({
            path: abs,
            parent: path.dirname(abs) === abs ? null : path.dirname(abs),
            home: process.env.HOME || os.homedir() || '/',
            entries: listDirectory(abs)
        });
    } catch (err) {
        const code = err && err.code === 'EACCES' ? 403 : 500;
        res.status(code).json({ error: err && err.code === 'EACCES' ? 'Permission denied' : 'Failed to list directory' });
    }
});

app.get('/api/files/content', requireAuth, (req, res) => {
    try {
        const target = typeof req.query.path === 'string' ? req.query.path : '';
        if (!target || target.includes('\u0000')) return res.status(400).json({ error: 'Invalid path' });
        const abs = path.resolve(target);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            return res.status(404).json({ error: 'File not found' });
        }
        const size = fs.statSync(abs).size;
        const MAX_PREVIEW = 512 * 1024;
        const fd = fs.openSync(abs, 'r');
        const readLen = Math.min(size, MAX_PREVIEW);
        const buf = Buffer.alloc(readLen);
        fs.readSync(fd, buf, 0, readLen, 0);
        fs.closeSync(fd);

        let binary = false;
        const sniff = buf.subarray(0, Math.min(8192, buf.length));
        for (const byte of sniff) {
            if (byte === 0) { binary = true; break; }
        }
        if (binary) {
            return res.json({ name: path.basename(abs), size, binary: true, content: null });
        }
        res.json({
            name: path.basename(abs),
            size,
            binary: false,
            truncated: size > MAX_PREVIEW,
            content: buf.toString('utf8')
        });
    } catch (err) {
        const code = err && err.code === 'EACCES' ? 403 : 500;
        res.status(code).json({ error: 'Failed to read file' });
    }
});

const SEARCH_SKIP_DIRS = new Set(['node_modules', '.git', '.cache', '.npm', '.venv', '__pycache__', '.Trash', '.local/share/Trash']);

app.get('/api/files/search', requireAuth, (req, res) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
        if (!q || q.length > 200) return res.status(400).json({ error: 'Query "q" is required' });
        let root = typeof req.query.path === 'string' && req.query.path.length
            ? path.resolve(req.query.path)
            : null;
        if (!root) {
            const tabId = typeof req.query.tabId === 'string' ? req.query.tabId : '';
            root = getSessionCwd(sessions.get(tabId));
        }
        if (!isExistingDir(root)) return res.status(404).json({ error: 'Search root not found' });

        const maxDepth = clampInt(req.query.depth, 1, 8, 4);
        const LIMIT = 300;
        const deadline = Date.now() + 4000;
        const results = [];
        const queue = [{ dir: root, depth: 0 }];
        let scanned = 0;

        while (queue.length && results.length < LIMIT && Date.now() < deadline && scanned < 20000) {
            const { dir, depth } = queue.shift();
            let names;
            try { names = fs.readdirSync(dir); } catch (e) { continue; }
            for (const name of names.slice(0, 2000)) {
                scanned++;
                if (results.length >= LIMIT || Date.now() > deadline) break;
                const full = path.join(dir, name);
                let lst;
                try { lst = fs.lstatSync(full); } catch (e) { continue; }
                const isDir = lst.isDirectory();
                if (name.toLowerCase().includes(q)) {
                    results.push({ path: full, name, dir: isDir, link: lst.isSymbolicLink(), size: lst.size, mtime: lst.mtimeMs });
                }
                // descend (never follow symlinked dirs → loop-safe)
                if (isDir && depth + 1 < maxDepth && !SEARCH_SKIP_DIRS.has(name) && !name.startsWith('.Trash')) {
                    queue.push({ dir: full, depth: depth + 1 });
                }
            }
        }
        res.json({ root, q, results, truncated: results.length >= LIMIT || Date.now() >= deadline });
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
});

function modeString(m) {
    const t = (m & 0o170000) === 0o040000 ? 'd' : (m & 0o170000) === 0o120000 ? 'l' : '-';
    const rwx = (bits) => (bits & 4 ? 'r' : '-') + (bits & 2 ? 'w' : '-') + (bits & 1 ? 'x' : '-');
    return t + rwx((m >> 6) & 7) + rwx((m >> 3) & 7) + rwx(m & 7);
}

app.get('/api/files/stat', requireAuth, (req, res) => {
    try {
        const target = typeof req.query.path === 'string' ? path.resolve(req.query.path) : '';
        if (!target || !fs.existsSync(target)) return res.status(404).json({ error: 'Not found' });
        const lst = fs.lstatSync(target);
        let linkTarget = null;
        if (lst.isSymbolicLink()) {
            try { linkTarget = fs.readlinkSync(target); } catch (e) {}
        }
        res.json({
            name: path.basename(target),
            path: target,
            size: lst.size,
            isDir: lst.isDirectory(),
            isLink: lst.isSymbolicLink(),
            linkTarget,
            mode: modeString(lst.mode),
            uid: lst.uid,
            gid: lst.gid,
            mtime: lst.mtimeMs,
            atime: lst.atimeMs,
            birthtime: lst.birthtimeMs
        });
    } catch (err) {
        const code = err && err.code === 'EACCES' ? 403 : 500;
        res.status(code).json({ error: 'Cannot stat path' });
    }
});

const PROTECTED_PATHS = new Set([
    '/', '/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64', '/boot',
    '/dev', '/proc', '/sys', '/var', '/root', '/home', '/opt', '/run', '/tmp'
]);
try { PROTECTED_PATHS.add(path.resolve(os.homedir() || '/')); } catch (e) {}

app.post('/api/files/mkdir', requireAuth, (req, res) => {
    try {
        const dir = typeof req.body.dir === 'string' ? path.resolve(req.body.dir) : null;
        const name = sanitizeName(req.body.name);
        if (!dir || !name) return res.status(400).json({ error: 'Invalid directory or name' });
        const target = safeResolve(dir, name);
        if (!target) return res.status(400).json({ error: 'Invalid name' });
        fs.mkdirSync(target, { recursive: false });
        res.json({ success: true, path: target });
    } catch (err) {
        res.status(err.code === 'EEXIST' ? 409 : 500).json({ error: err.code === 'EEXIST' ? 'Already exists' : 'Failed to create folder' });
    }
});

app.post('/api/files/rename', requireAuth, (req, res) => {
    try {
        const src = typeof req.body.path === 'string' ? path.resolve(req.body.path) : null;
        const newName = sanitizeName(req.body.newName);
        if (!src || !newName || !fs.existsSync(src)) return res.status(400).json({ error: 'Invalid request' });
        const target = safeResolve(path.dirname(src), newName);
        if (!target) return res.status(400).json({ error: 'Invalid name' });
        if (target === src) return res.json({ success: true, path: target, noop: true });
        if (fs.existsSync(target)) return res.status(409).json({ error: 'Target already exists' });
        fs.renameSync(src, target);
        res.json({ success: true, path: target });
    } catch (err) {
        res.status(500).json({ error: 'Failed to rename' });
    }
});

app.post('/api/files/delete', requireAuth, (req, res) => {
    try {
        const target = typeof req.body.path === 'string' ? path.resolve(req.body.path) : null;
        if (!target || !fs.existsSync(target)) return res.status(404).json({ error: 'Not found' });
        if (PROTECTED_PATHS.has(target)) {
            return res.status(403).json({ error: 'Refusing to delete a protected system path' });
        }
        const st = fs.lstatSync(target);
        if (st.isDirectory() && !st.isSymbolicLink()) {
            fs.rmSync(target, { recursive: true, force: false });
        } else {
            fs.unlinkSync(target);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete' });
    }
});

/* ──────────────────────────── REST: uploads & downloads ──────────────────────────── */

app.post('/upload', requireAuth, (req, res) => {
    try {
        const tabId = req.body && typeof req.body.tabId === 'string' ? req.body.tabId : '';
        const session = sessions.get(tabId);

        let destDir = null;
        if (req.body && typeof req.body.dest === 'string' && req.body.dest.length) {
            destDir = path.resolve(req.body.dest);
        } else {
            destDir = getSessionCwd(session);
        }
        if (!fs.existsSync(destDir) || !fs.statSync(destDir).isDirectory()) {
            return res.status(400).json({ error: 'Destination folder does not exist' });
        }

        let files = req.files ? req.files.file : null;
        if (!files) return res.status(400).json({ error: 'No files provided' });
        if (!Array.isArray(files)) files = [files];

        const saved = [];
        const errors = [];
        let pending = files.length;
        if (!pending) return res.status(400).json({ error: 'No files provided' });

        files.forEach((f) => {
            const clean = sanitizeName(f.name);
            if (!clean) {
                errors.push('Skipped a file with an invalid name');
                if (--pending === 0) finish();
                return;
            }
            let target = path.join(destDir, clean);
            // Avoid clobbering: append (1), (2), ... when name is taken
            if (fs.existsSync(target)) {
                const ext = path.extname(clean);
                const stem = path.basename(clean, ext);
                let i = 1;
                while (fs.existsSync(target) && i < 1000) {
                    target = path.join(destDir, `${stem} (${i})${ext}`);
                    i++;
                }
            }
            f.mv(target, (err) => {
                if (err) {
                    errors.push(`Failed to save ${clean}`);
                    log('Upload error:', err.message);
                } else {
                    saved.push(path.basename(target));
                }
                if (--pending === 0) finish();
            });
        });

        function finish() {
            res.json({ success: errors.length === 0, folder: destDir, saved, errors });
        }
    } catch (err) {
        log('Upload handler error:', err.message);
        res.status(500).json({ error: 'Upload failed' });
    }
});

app.get('/download', requireAuth, (req, res) => {
    try {
        let targetFile = null;

        if (typeof req.query.path === 'string' && req.query.path.length) {
            // Direct download (file manager)
            const abs = path.resolve(req.query.path);
            if (fs.existsSync(abs) && fs.statSync(abs).isFile()) targetFile = abs;
        } else {
            // Alt-Lock smart match inside the shell's current directory
            const tabId = typeof req.query.tabId === 'string' ? req.query.tabId : '';
            const session = sessions.get(tabId);
            const currentDir = getSessionCwd(session);
            const rawSelection = String(req.query.filename || '').trim();
            if (!rawSelection) return res.status(400).send('No filename provided');

            const exact = safeResolve(currentDir, rawSelection);
            if (exact && fs.existsSync(exact) && fs.statSync(exact).isFile()) {
                targetFile = exact;
            } else {
                const filesInDir = fs.readdirSync(currentDir).sort((a, b) => b.length - a.length);
                for (const f of filesInDir) {
                    if (f.length > 0 && rawSelection.includes(f)) {
                        const testPath = path.join(currentDir, f);
                        try {
                            if (fs.statSync(testPath).isFile()) { targetFile = testPath; break; }
                        } catch (e) {}
                    }
                }
            }
        }

        if (targetFile) {
            res.download(targetFile, path.basename(targetFile), (err) => {
                if (err && !res.headersSent) res.status(500).send('Download failed');
            });
        } else {
            res.status(404).json({ error: 'No matching file found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Download error' });
    }
});

/* ──────────────────────────── REST: custom themes ──────────────────────────── */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function validateThemePayload(theme) {
    if (!theme || typeof theme !== 'object') return 'Invalid theme data';
    if (typeof theme.name !== 'string' || !theme.name.trim() || theme.name.length > 40) return 'Invalid theme name';
    if (!theme.theme || typeof theme.theme !== 'object') return 'Invalid theme colors';
    const required = ['background', 'foreground', 'cursor'];
    for (const key of required) {
        if (!HEX_RE.test(theme.theme[key] || '')) return `Invalid color for ${key}`;
    }
    for (const [k, v] of Object.entries(theme.theme)) {
        if (typeof v !== 'string' || v.length > 24) return `Invalid color entry ${k}`;
    }
    return null;
}

app.get('/api/custom-themes', requireAuth, (req, res) => {
    try {
        const files = fs.readdirSync(CUSTOM_THEMES_DIR).filter((f) => f.endsWith('.json'));
        const themes = [];
        for (const file of files.slice(0, 200)) {
            try {
                const content = JSON.parse(fs.readFileSync(path.join(CUSTOM_THEMES_DIR, file), 'utf8'));
                if (content && content.id && content.theme) themes.push(content);
            } catch (e) { /* skip broken file */ }
        }
        res.json(themes);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read custom themes' });
    }
});

app.post('/api/custom-themes', requireAuth, (req, res) => {
    try {
        const theme = req.body;
        const problem = validateThemePayload(theme);
        if (problem) return res.status(400).json({ error: problem });

        const safeId = ('custom_' + String(theme.name).toLowerCase().replace(/[^a-z0-9_-]/g, '_')).slice(0, 64);
        theme.id = safeId;

        const existing = fs.readdirSync(CUSTOM_THEMES_DIR).filter((f) => f.endsWith('.json'));
        if (existing.length >= 100 && !existing.includes(`${safeId}.json`)) {
            return res.status(400).json({ error: 'Theme limit reached (100). Delete some first.' });
        }
        fs.writeFileSync(path.join(CUSTOM_THEMES_DIR, `${safeId}.json`), JSON.stringify(theme, null, 2), 'utf8');
        res.json({ success: true, theme });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save custom theme' });
    }
});

app.delete('/api/custom-themes/:id', requireAuth, (req, res) => {
    try {
        const safeId = String(req.params.id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        if (!safeId.startsWith('custom_')) return res.status(400).json({ error: 'Only custom themes can be deleted' });
        const filePath = path.join(CUSTOM_THEMES_DIR, `${safeId}.json`);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Theme not found' });
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete theme' });
    }
});

/* ──────────────────────────── AI Guide (Groq proxy) ──────────────────────────── */

function loadConfigFile() {
    try {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) { return {}; }
}
function saveConfigFile(cfg) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { encoding: 'utf8', mode: 0o600 });
}

function getGroqKey() {
    const cfg = loadConfigFile();
    if (typeof cfg.groqKey === 'string' && cfg.groqKey.length >= 8) return { key: cfg.groqKey, source: 'settings' };
    if (process.env.GROQ_API_KEY) return { key: process.env.GROQ_API_KEY, source: 'env' };
    return { key: DEFAULT_GROQ_KEY, source: 'default' };
}
function getGroqModel() {
    const cfg = loadConfigFile();
    if (isValidModelId(cfg.groqModel)) return cfg.groqModel;
    return DEFAULT_GROQ_MODEL;
}
/* Output token cap — must stay under the account's OTPM (output tokens per minute)
   limit; Groq on-demand tier for qwen models is often 1000 OTPM. */
function getGroqMaxTokens() {
    const cfg = loadConfigFile();
    const n = parseInt(cfg.groqMaxTokens !== undefined ? cfg.groqMaxTokens : process.env.GROQ_MAX_TOKENS, 10);
    if (Number.isFinite(n) && n >= 16 && n <= 4096) return n;
    return 800;
}
function maskKey(key) {
    if (typeof key !== 'string' || key.length < 12) return '••••';
    return key.slice(0, 7) + '•'.repeat(10) + key.slice(-4);
}

/* AI rate limit: 30 chat calls / minute / IP */
const aiAttempts = new Map();
function rateLimitAi(ip) {
    const now = Date.now();
    if (aiAttempts.size > 500) {
        for (const [k, v] of Array.from(aiAttempts.entries())) if (now > v.resetAt) aiAttempts.delete(k);
    }
    let entry = aiAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + 60 * 1000 };
        aiAttempts.set(ip, entry);
    }
    entry.count += 1;
    return entry.count <= 30;
}

app.get('/api/ai/config', requireAuth, (req, res) => {
    const { key, source } = getGroqKey();
    res.json({
        hasKey: !!key,
        keyPreview: key ? maskKey(key) : null,
        keySource: source,
        model: getGroqModel(),
        maxTokens: getGroqMaxTokens(),
        provider: 'groq'
    });
});

app.post('/api/ai/config', requireAuth, (req, res) => {
    try {
        const cfg = loadConfigFile();
        const body = req.body || {};
        if (body.key !== undefined) {
            if (body.key === null || body.key === '') {
                delete cfg.groqKey; // fall back to env / default
            } else if (typeof body.key === 'string' && body.key.length >= 8 && body.key.length <= 300 && /^[\w.-]+$/.test(body.key)) {
                cfg.groqKey = body.key;
            } else {
                return res.status(400).json({ error: 'Invalid API key format' });
            }
        }
        if (body.model !== undefined) {
            if (isValidModelId(body.model)) cfg.groqModel = body.model;
            else return res.status(400).json({ error: 'Invalid model id' });
        }
        if (body.maxTokens !== undefined) {
            const n = parseInt(body.maxTokens, 10);
            if (Number.isFinite(n) && n >= 16 && n <= 4096) cfg.groqMaxTokens = n;
            else return res.status(400).json({ error: 'maxTokens must be an integer between 16 and 4096' });
        }
        saveConfigFile(cfg);
        const { key, source } = getGroqKey();
        log(`AI config updated (key source: ${source}, model: ${getGroqModel()}, maxTokens: ${getGroqMaxTokens()})`);
        res.json({ success: true, hasKey: !!key, keyPreview: key ? maskKey(key) : null, keySource: source, model: getGroqModel(), maxTokens: getGroqMaxTokens() });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save AI config' });
    }
});

const AI_MODEL_CATALOG = [
    { id: 'qwen/qwen3.8-27b', name: 'Qwen3.8 27B (default, fast)', kind: 'chat' },
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (smartest)', kind: 'chat' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B (balanced)', kind: 'chat' }
];
const TTS_MODEL = 'canopylabs/orpheus-v1-english';
/* Orpheus voice catalog — must match what Groq currently accepts. The original
   eight voices (tara/leah/jordan/kyle/carlos/annie/matthew/nicole) were retired
   upstream; the /api/ai/speech handler additionally retries with the default
   voice if upstream ever rejects one again, so a catalog churn can't hard-fail TTS. */
const TTS_VOICES = ['autumn', 'diana', 'hannah', 'austin', 'daniel', 'troy'];
const STT_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'];

app.get('/api/ai/models', requireAuth, (req, res) => {
    const current = getGroqModel();
    const list = AI_MODEL_CATALOG.slice();
    if (!list.some((m) => m.id === current)) list.push({ id: current, name: current + ' (custom)', kind: 'chat' });
    res.json({ models: list, current, tts: { model: TTS_MODEL, voices: TTS_VOICES }, stt: { models: STT_MODELS } });
});

/* Text-to-speech proxy (Orpheus) */
app.post('/api/ai/speech', requireAuth, async (req, res) => {
    const ip = clientIp(req);
    if (!rateLimitAi(ip)) return res.status(429).json({ error: 'Rate limit reached' });
    const text = typeof (req.body || {}).text === 'string' ? req.body.text.slice(0, 4000) : '';
    if (!text.trim()) return res.status(400).json({ error: 'text is required' });
    const voice = TTS_VOICES.includes(req.body.voice) ? req.body.voice : TTS_VOICES[0];
    const { key } = getGroqKey();
    if (!key) return res.status(400).json({ error: 'No Groq API key configured' });
    const doTts = (v) => fetch('https://api.groq.com/openai/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        /* Upstream retired MP3 output for Orpheus ("response_format must be one
           of [wav]") — WAV is the format the API accepts now. */
        body: JSON.stringify({ model: TTS_MODEL, voice: v, input: text, response_format: 'wav' }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(45000) : undefined
    });
    try {
        let up = await doTts(voice);
        let lastMsg = '';
        if (!up.ok) {
            const j = await up.json().catch(() => null);
            lastMsg = (j && j.error && (j.error.message || j.error)) || `Groq TTS error ${up.status}`;
            /* Upstream has churned the Orpheus voice catalog before (the original
               eight voices were retired without notice, breaking every TTS/MP3
               request). If the voice itself is what got rejected, retry once
               with our current default instead of failing the request. */
            if (up.status === 400 && /voice/i.test(String(lastMsg)) && voice !== TTS_VOICES[0]) {
                log(`TTS voice "${voice}" rejected upstream — retrying with "${TTS_VOICES[0]}"`);
                up = await doTts(TTS_VOICES[0]);
                if (!up.ok) {
                    const j2 = await up.json().catch(() => null);
                    lastMsg = (j2 && j2.error && (j2.error.message || j2.error)) || `Groq TTS error ${up.status}`;
                }
            }
        }
        if (!up.ok) {
            log(`TTS upstream ${up.status}: ${String(lastMsg).slice(0, 200)}`);
            return res.status(502).json({ error: lastMsg || `Groq TTS error ${up.status}` });
        }
        const buf = Buffer.from(await up.arrayBuffer());
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Cache-Control', 'no-store');
        res.send(buf);
    } catch (e) {
        res.status(500).json({ error: 'TTS request failed' });
    }
});

/* Speech-to-text core (Whisper) — shared by the upload + file-manager endpoints */
const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'webm', 'ogg', 'oga', 'flac', 'aac', 'mp4', 'mpeg', 'mpga']);
const AUDIO_MIME = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', webm: 'audio/webm', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', mp4: 'audio/mp4', mpeg: 'audio/mpeg', mpga: 'audio/mpeg' };

async function transcribeBytes(bytes, mime, name, model) {
    const { key } = getGroqKey();
    if (!key) { const e = new Error('No Groq API key configured'); e.status = 400; throw e; }
    const mdl = STT_MODELS.includes(model) ? model : STT_MODELS[0];
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mime || 'audio/webm' }), name || 'audio.webm');
    form.append('model', mdl);
    const up = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined
    });
    const j = await up.json().catch(() => null);
    if (!up.ok) {
        log(`STT upstream ${up.status}: ${JSON.stringify(j).slice(0, 200)}`);
        const e = new Error((j && j.error && (j.error.message || j.error)) || `Groq STT error ${up.status}`);
        e.status = 502;
        throw e;
    }
    return { text: (j && typeof j.text === 'string') ? j.text : '', model: mdl };
}

/* Speech-to-text proxy (Whisper) — multipart passthrough */
app.post('/api/ai/transcribe', requireAuth, async (req, res) => {
    const ip = clientIp(req);
    if (!rateLimitAi(ip)) return res.status(429).json({ error: 'Rate limit reached' });
    const file = req.files && (req.files.file || req.files.audio);
    if (!file) return res.status(400).json({ error: 'audio file required (field: file)' });
    if (file.size > 20 * 1024 * 1024) return res.status(400).json({ error: 'audio too large (20 MB max)' });
    /* express-fileupload with useTempFiles keeps bytes on disk, not in .data */
    let bytes = file.data;
    if (!bytes || bytes.length === 0) {
        if (!file.tempFilePath || !fs.existsSync(file.tempFilePath)) return res.status(400).json({ error: 'audio file is empty' });
        bytes = fs.readFileSync(file.tempFilePath);
    }
    try {
        const out = await transcribeBytes(bytes, file.mimetype, file.name, (req.body || {}).model);
        res.json(out);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

/* Transcribe an audio file that already lives on the server (file manager → Whisper) */
app.get('/api/files/transcribe', requireAuth, async (req, res) => {
    const ip = clientIp(req);
    if (!rateLimitAi(ip)) return res.status(429).json({ error: 'Rate limit reached' });
    try {
        const target = typeof req.query.path === 'string' ? path.resolve(req.query.path) : '';
        if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) return res.status(404).json({ error: 'File not found' });
        if (fs.statSync(target).size > 20 * 1024 * 1024) return res.status(400).json({ error: 'audio too large (20 MB max)' });
        const ext = (path.extname(target).slice(1) || '').toLowerCase();
        if (!AUDIO_EXT.has(ext)) return res.status(400).json({ error: 'Not an audio file (supported: ' + Array.from(AUDIO_EXT).join(', ') + ')' });
        const out = await transcribeBytes(fs.readFileSync(target), AUDIO_MIME[ext], path.basename(target), req.query.model);
        res.json(out);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

app.post('/api/ai/chat', requireAuth, async (req, res) => {
    const ip = clientIp(req);
    if (!rateLimitAi(ip)) {
        return res.status(429).json({ error: 'AI rate limit reached (30/min). Slow down a little.' });
    }
    try {
        const body = req.body || {};
        const messages = body.messages;
        if (!Array.isArray(messages) || !messages.length || messages.length > 40) {
            return res.status(400).json({ error: 'messages must be an array of 1..40 items' });
        }
        const clean = [];
        for (const m of messages) {
            if (!m || typeof m.content !== 'string' || !['system', 'user', 'assistant'].includes(m.role)) {
                return res.status(400).json({ error: 'each message needs role (system|user|assistant) and string content' });
            }
            clean.push({ role: m.role, content: m.content.slice(0, 32768) });
        }
        const model = isValidModelId(body.model) ? body.model : getGroqModel();
        const temperature = Number.isFinite(parseFloat(body.temperature)) ? Math.min(1, Math.max(0, parseFloat(body.temperature))) : 0.2;

        const { key, source: keySource } = getGroqKey();
        if (!key) return res.status(400).json({ error: 'No Groq API key configured. Add one in Settings → AI Guide.' });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);
        let upstream;
        try {
            upstream = await fetch(GROQ_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                body: JSON.stringify({ model, messages: clean, temperature, max_tokens: getGroqMaxTokens(), stream: false }),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }

        const data = await upstream.json().catch(() => null);
        if (!upstream.ok) {
            const groqMsg = (data && data.error && (data.error.message || data.error)) || `Groq responded ${upstream.status}`;
            log(`AI upstream error ${upstream.status} (key source: ${keySource}): ${String(groqMsg).slice(0, 200)}`);
            const outStatus = upstream.status === 429 ? 429 : 502;
            const payload = { error: String(groqMsg).slice(0, 500), upstreamStatus: upstream.status };
            const retryAfter = upstream.headers.get('retry-after');
            if (retryAfter) payload.retryAfter = parseInt(retryAfter, 10) || null;
            if (upstream.status === 401 || upstream.status === 403) {
                payload.hint = `Rejected key came from: ${keySource}. Fix: Settings → AI Guide → “Reset key” (or delete garuda.config.json / unset GROQ_API_KEY), then retry.`;
            }
            return res.status(outStatus).json(payload);
        }
        const choice = data && data.choices && data.choices[0];
        const content = choice && choice.message && typeof choice.message.content === 'string' ? choice.message.content : '';
        res.json({ content, model: (data && data.model) || model, usage: data && data.usage ? data.usage : null });
    } catch (err) {
        const msg = err && err.name === 'AbortError' ? 'Groq request timed out (45s)' : 'AI request failed';
        log('AI chat error:', err && err.message);
        res.status(500).json({ error: msg });
    }
});

/* ──────────────────────────── REST: live share ──────────────────────────── */

function purgeExpiredShares() {
    const now = Date.now();
    for (const [token, share] of Array.from(shareTokens.entries())) {
        if (now - share.createdAt > SHARE_TTL_MS) {
            const session = sessions.get(share.tabId);
            if (session) {
                for (const client of Array.from(session.clients)) {
                    if (client.role === 'viewer' && client.shareToken === token) {
                        sendCtrl(client.ws, { type: 'share_revoked', message: 'This share link has expired.' });
                        try { client.ws.close(4002, 'expired'); } catch (e) {}
                        session.clients.delete(client);
                    }
                }
                broadcastPresence(share.tabId);
            }
            if (activeShareByTab.get(share.tabId) === token) activeShareByTab.delete(share.tabId);
            shareTokens.delete(token);
        }
    }
}
setInterval(purgeExpiredShares, 10 * 60 * 1000).unref();

app.post('/api/share/create', requireAuth, (req, res) => {
    const tabId = req.body && req.body.tabId;
    if (typeof tabId !== 'string' || !TAB_ID_RE.test(tabId)) {
        return res.status(400).json({ error: 'tabId is required' });
    }
    if (!sessions.has(tabId)) {
        return res.status(404).json({ error: 'Session not found' });
    }
    const mode = req.body.mode === 'interactive' ? 'interactive' : 'readonly';

    const old = activeShareByTab.get(tabId);
    if (old) shareTokens.delete(old);

    const token = 'share_' + crypto.randomBytes(8).toString('hex');
    shareTokens.set(token, { token, tabId, mode, createdAt: Date.now() });
    activeShareByTab.set(tabId, token);

    // Update mode for any viewers already connected under this tab
    const session = sessions.get(tabId);
    if (session) {
        for (const client of session.clients) {
            if (client.role === 'viewer') client.mode = mode;
        }
    }
    res.json({ success: true, token, tabId, mode, expiresAt: Date.now() + SHARE_TTL_MS });
});

app.get('/api/share/info/:token', (req, res) => {
    const share = shareTokens.get(req.params.token);
    if (!share || Date.now() - share.createdAt > SHARE_TTL_MS) {
        return res.status(404).json({ error: 'Invalid or expired share link' });
    }
    const session = sessions.get(share.tabId);
    res.json({
        valid: true,
        token: share.token,
        tabId: share.tabId,
        mode: share.mode,
        alive: session ? session.alive : false,
        shell: SHELL_NAME,
        viewerCount: countViewers(session)
    });
});

app.post('/api/share/revoke', requireAuth, (req, res) => {
    const tabId = req.body && typeof req.body.tabId === 'string' ? req.body.tabId : null;
    const token = (req.body && typeof req.body.token === 'string' ? req.body.token : null)
        || (tabId ? activeShareByTab.get(tabId) : null);
    if (token && shareTokens.has(token)) {
        const share = shareTokens.get(token);
        const session = sessions.get(share.tabId);
        if (session) {
            for (const client of Array.from(session.clients)) {
                if (client.role === 'viewer') {
                    sendCtrl(client.ws, { type: 'share_revoked', message: 'The host has ended this live share session.' });
                    try { client.ws.close(4001, 'revoked'); } catch (e) {}
                    session.clients.delete(client);
                }
            }
            broadcastPresence(share.tabId);
        }
        activeShareByTab.delete(share.tabId);
        shareTokens.delete(token);
    }
    res.json({ success: true });
});

app.get('/api/share/status', requireAuth, (req, res) => {
    const tabId = typeof req.query.tabId === 'string' ? req.query.tabId : '';
    const token = activeShareByTab.get(tabId);
    const share = token ? shareTokens.get(token) : null;
    if (share && Date.now() - share.createdAt <= SHARE_TTL_MS) {
        return res.json({
            isShared: true,
            token,
            mode: share.mode,
            createdAt: share.createdAt,
            expiresAt: share.createdAt + SHARE_TTL_MS,
            viewerCount: countViewers(sessions.get(tabId))
        });
    }
    if (token) { // expired
        shareTokens.delete(token);
        activeShareByTab.delete(tabId);
    }
    res.json({ isShared: false, viewerCount: 0 });
});

/* ──────────────────────────── Web Push (VAPID) ──────────────────────────── */

function getVapidKeys() {
    if (!webpush) return null;
    const cfg = loadConfigFile();
    if (cfg.vapid && cfg.vapid.publicKey && cfg.vapid.privateKey) return cfg.vapid;
    const keys = webpush.generateVAPIDKeys();
    cfg.vapid = keys;
    saveConfigFile(cfg);
    log('Generated new VAPID key pair for web push');
    return keys;
}

function getPushSubscriptions() {
    const cfg = loadConfigFile();
    return Array.isArray(cfg.pushSubscriptions) ? cfg.pushSubscriptions : [];
}
function savePushSubscriptions(list) {
    const cfg = loadConfigFile();
    cfg.pushSubscriptions = list.slice(-20);
    saveConfigFile(cfg);
}

async function pushNotify(title, body, tag, opts) {
    /* Mirror every alert to live-connected clients too, so task/trigger events
       reach open tabs even when the push service is unreachable from the
       device's network or no subscription exists. (Shell-exit and
       command-finished callers only fire when NO client is connected, so
       this never doubles up with those.) */
    if (!opts || opts.live !== false) {
        try { notifyClients(title, body, tag); } catch (e) {}
    }
    if (!webpush) return 0;
    const subs = getPushSubscriptions();
    if (!subs.length) return 0;
    const vapid = getVapidKeys();
    try {
        webpush.setVapidDetails('mailto:admin@' + (os.hostname() || 'garuda.local'), vapid.publicKey, vapid.privateKey);
    } catch (e) { return 0; }
    const payload = JSON.stringify({ title, body, tag: tag || 'garuda', url: '/' });
    let sent = 0;
    const dead = new Set();
    for (const sub of subs) {
        try {
            await webpush.sendNotification(sub, payload, { TTL: 120 });
            sent++;
        } catch (err) {
            if (err && (err.statusCode === 404 || err.statusCode === 410)) dead.add(sub.endpoint); // gone
        }
    }
    if (dead.size) {
        /* re-read so subscriptions added during the await window are not lost */
        const current = getPushSubscriptions().filter((s2) => !dead.has(s2.endpoint));
        savePushSubscriptions(current);
    }
    return sent;
}

app.get('/api/push/vapid', requireAuth, (req, res) => {
    if (!webpush) return res.json({ supported: false });
    const keys = getVapidKeys();
    res.json({ supported: true, publicKey: keys.publicKey });
});

app.post('/api/push/subscribe', requireAuth, (req, res) => {
    const sub = req.body && req.body.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('http')) {
        return res.status(400).json({ error: 'Invalid push subscription' });
    }
    const subs = getPushSubscriptions().filter((s) => s.endpoint !== sub.endpoint);
    subs.push(sub);
    savePushSubscriptions(subs);
    res.json({ success: true, count: subs.length });
});

app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
    const endpoint = req.body && req.body.endpoint;
    const subs = getPushSubscriptions().filter((s) => s.endpoint !== endpoint);
    savePushSubscriptions(subs);
    res.json({ success: true, count: subs.length });
});

app.get('/api/push/status', requireAuth, (req, res) => {
    res.json({ supported: !!webpush, count: getPushSubscriptions().length });
});

app.post('/api/push/test', requireAuth, async (req, res) => {
    const sent = await pushNotify('Garuda Konsole', 'Background push is working! 🦅', 'test', { live: false });
    res.json({ success: sent > 0, sent });
});

/* ──────────────────────────── Task Launcher ──────────────────────────── */
/* Detached background jobs: spawned in their own pty, ring-buffered server-side,
   completely independent of any browser tab. Push notification on completion. */

const tasks = new Map();
const MAX_TASKS = 40;
const TASK_BUF_BYTES = 256 * 1024;

function runTask(opts) {
    if (!pty) return { error: 'pty unavailable' };
    const running = Array.from(tasks.values()).filter((t) => t.alive).length;
    if (running >= MAX_TASKS) return { error: `Too many running tasks (${MAX_TASKS})` };
    const id = 'task_' + crypto.randomBytes(5).toString('hex');
    const cwd = (opts.cwd && isExistingDir(opts.cwd)) ? path.resolve(opts.cwd) : (process.env.HOME || os.homedir() || '/');
    const shellPath = (opts.shell && resolveWhitelistedShell(opts.shell)) || SHELL_PATH;

    const task = {
        id,
        name: String(opts.name || opts.cmd || 'task').slice(0, 80),
        cmd: String(opts.cmd || '').slice(0, 8000),
        cwd,
        shell: path.basename(shellPath),
        startedAt: Date.now(),
        finishedAt: null,
        alive: true,
        exitCode: null,
        notify: opts.notify !== false,
        buf: [],
        bufBytes: 0,
        ptyProcess: null,
        lastOutputAt: 0,
        waiting: false,
        waitingNotified: false,
        waitSince: 0,
        waitRemindAt: 0,
        waitReminds: 0
    };
    tasks.set(id, task);

    try {
        const proc = pty.spawn(shellPath, ['-c', task.cmd], {
            name: 'xterm-256color', cols: 100, rows: 30, cwd,
            env: Object.assign({}, process.env, { TERM: 'xterm-256color' })
        });
        task.ptyProcess = proc;
        proc.onData((data) => {
            task.buf.push(data);
            task.bufBytes += data.length;
            while (task.bufBytes > TASK_BUF_BYTES && task.buf.length > 1) {
                task.bufBytes -= task.buf.shift().length;
            }
            task.lastOutputAt = Date.now();
            /* Fresh output ends the current waiting episode AND re-arms its
               notification — otherwise a task that prompts a second time
               (e.g. password, then OTP) would never alert again. */
            if (task.waiting) { task.waiting = false; task.waitingNotified = false; task.waitReminds = 0; }
        });
        proc.onExit(({ exitCode }) => {
            task.alive = false;
            task.finishedAt = Date.now();
            task.exitCode = exitCode == null ? 0 : exitCode;
            task.ptyProcess = null;
            log(`Task ${id} ("${task.name}") exited with code ${task.exitCode}`);
            if (task.notify) {
                pushNotify(
                    task.exitCode === 0 ? '✓ Task finished' : '✗ Task failed',
                    `${task.name} — exit ${task.exitCode} (${fmtDur(task.finishedAt - task.startedAt)})`,
                    'task:' + id
                ).catch(() => {});
            }
        });
        log(`Task ${id} started: "${task.name}" in ${cwd}`);
    } catch (err) {
        task.alive = false;
        task.finishedAt = Date.now();
        task.exitCode = -1;
        task.buf.push('Failed to spawn: ' + err.message);
    }
    return { id };
}

function fmtDur(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}

/* Heuristics: does the task's last line look like an interactive prompt? */
const PROMPT_PATTERNS = [
    /(password|passwd|passphrase)\s*[:?]\s*$/i,
    /(username|login|user)\s*[:?]\s*$/i,
    /(token|otp|code)\s*[:?]\s*$/i,
    /\[(y|n)\/(y|n|Y|N)\]\s*$/i, /\(y\/n\)\s*$/i, /\(yes\/no\)\s*$/i,
    /\?\s*(\[y\/n\]|\(y\/n\)|\[Y\/n\]|\[y\/N\])?\s*$/i, /continue\s*\?/i, /overwrite\s*\?/i,
    /press (enter|any key)/i,
    /:\s*$/
];
function tailLooksLikePrompt(tail) {
    const lines = String(tail || '').split('\n').map((l) => l.replace(/\r/g, '').trim()).filter(Boolean);
    if (!lines.length) return false;
    const last = lines[lines.length - 1];
    if (last.length > 120) return false;
    return PROMPT_PATTERNS.some((re) => re.test(last));
}

function taskSummary(t) {
    return {
        id: t.id, name: t.name, cmd: t.cmd, cwd: t.cwd, shell: t.shell,
        startedAt: t.startedAt, finishedAt: t.finishedAt, alive: t.alive,
        exitCode: t.exitCode, notify: t.notify,
        waiting: !!t.waiting,
        elapsedMs: (t.finishedAt || Date.now()) - t.startedAt,
        tail: stripAnsiServer(t.buf.join('').slice(-1200))
    };
}

function stripAnsiServer(s) {
    return String(s).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/[\x00-\x08\x0b-\x1f\r]/g, '');
}

app.get('/api/tasks', requireAuth, (req, res) => {
    const list = Array.from(tasks.values()).map(taskSummary);
    list.sort((a, b) => b.startedAt - a.startedAt);
    res.json({ tasks: list.slice(0, 60) });
});

app.post('/api/tasks', requireAuth, (req, res) => {
    const cmd = req.body && typeof req.body.cmd === 'string' ? req.body.cmd.trim() : '';
    if (!cmd || cmd.length > 8000) return res.status(400).json({ error: 'cmd is required (max 8000 chars)' });
    const result = runTask({
        name: (req.body.name || '').trim() || cmd.split('\n')[0].slice(0, 60),
        cmd,
        cwd: req.body.cwd || null,
        notify: req.body.notify !== false
    });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true, id: result.id });
});

app.post('/api/tasks/:id/input', requireAuth, (req, res) => {
    const t = tasks.get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Task not found' });
    if (!t.alive || !t.ptyProcess) return res.status(400).json({ error: 'Task is not running' });
    const data = typeof req.body.data === 'string' ? req.body.data.slice(0, 16 * 1024) : '';
    if (!data) return res.status(400).json({ error: 'data is required' });
    try { t.ptyProcess.write(data); } catch (e) { return res.status(500).json({ error: 'Write failed' }); }
    t.waiting = false;
    t.waitingNotified = false;
    t.waitReminds = 0;
    res.json({ success: true });
});

/* Detect tasks that are sitting at an interactive prompt and alert about it.
   Alerts ride BOTH channels: Web Push (browser fully closed) and the live WS
   mirror inside pushNotify (any open tab — works on networks where the push
   service is unreachable). A periodic reminder re-alerts while the task is
   still stuck, so a missed first alert never strands the task forever. */
const TASK_REMIND_MS = Math.max(3000, parseInt(process.env.KONSOLE_TASK_REMIND_MS || '300000', 10) || 300000);
const taskWaitTracker = setInterval(() => {
    const now = Date.now();
    for (const t of tasks.values()) {
        if (!t.alive) continue;
        const idle = now - (t.lastOutputAt || t.startedAt);
        if (idle < 1500) continue;
        const plain = stripAnsiServer(t.buf.join('').slice(-600));
        const looks = tailLooksLikePrompt(plain);
        if (looks && !t.waiting) {
            t.waiting = true;
            if (!t.waitingNotified) {
                t.waitingNotified = true;
                t.waitSince = now;
                t.waitRemindAt = now;
                t.waitReminds = 0;
                const lines = plain.split('\n').map((l) => l.replace(/\r/g, '').trim()).filter(Boolean);
                const promptLine = (lines[lines.length - 1] || '').slice(0, 80);
                pushNotify('⌨️ Task needs input', `"${t.name}" is waiting at a prompt${promptLine ? ` — "${promptLine}"` : ''}. Open Tasks to answer.`, 'taskwait:' + t.id).catch(() => {});
            }
        } else if (t.waiting && t.waitingNotified && t.waitReminds < 3 && now - (t.waitRemindAt || now) >= TASK_REMIND_MS) {
            t.waitReminds++;
            t.waitRemindAt = now;
            pushNotify('⌨️ Task still needs input', `"${t.name}" has been waiting at a prompt for ${fmtDur(now - (t.waitSince || t.startedAt))}. Open Tasks to answer.`, 'taskwait:' + t.id).catch(() => {});
        } else if (!looks && t.waiting && idle < 3000) {
            t.waiting = false;
        }
    }
}, 2000);
taskWaitTracker.unref();

app.get('/api/tasks/:id/log', requireAuth, (req, res) => {
    const t = tasks.get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Task not found' });
    res.json({ id: t.id, name: t.name, alive: t.alive, exitCode: t.exitCode, log: stripAnsiServer(t.buf.join('')) });
});

app.post('/api/tasks/:id/kill', requireAuth, (req, res) => {
    const t = tasks.get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Task not found' });
    if (t.alive && t.ptyProcess) { try { t.ptyProcess.kill(); } catch (e) {} }
    res.json({ success: true });
});

app.post('/api/tasks/:id/rerun', requireAuth, (req, res) => {
    const t = tasks.get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Task not found' });
    const result = runTask({ name: t.name, cmd: t.cmd, cwd: t.cwd, notify: t.notify });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true, id: result.id });
});

/* GC: keep at most 60 finished tasks, drop the oldest beyond that */
const taskGc = setInterval(() => {
    const finished = Array.from(tasks.values()).filter((t) => !t.alive).sort((a, b) => a.finishedAt - b.finishedAt);
    while (finished.length > 60) tasks.delete(finished.shift().id);
}, 10 * 60 * 1000);
taskGc.unref();

/* ──────────────────────────── Scheduler ──────────────────────────── */
/* Cron-lite: interval / daily / once — jobs run server-side even with the browser closed. */

function getSchedules() {
    const cfg = loadConfigFile();
    return Array.isArray(cfg.schedules) ? cfg.schedules : [];
}
function saveSchedules(list) {
    const cfg = loadConfigFile();
    cfg.schedules = list;
    saveConfigFile(cfg);
}

function nextRunFor(s, now) {
    const when = s.when || {};
    if (when.type === 'interval') {
        const everyMs = Math.max(1, parseInt(when.everyMin, 10) || 60) * 60 * 1000;
        return (s.lastRun ? s.lastRun + everyMs : (s.createdAt || now) + everyMs);
    }
    if (when.type === 'daily') {
        const m = /^(\d{1,2}):(\d{2})$/.exec(when.at || '03:00');
        const hh = m ? Math.min(23, parseInt(m[1], 10)) : 3;
        const mm = m ? Math.min(59, parseInt(m[2], 10)) : 0;
        const d = new Date(now);
        d.setHours(hh, mm, 0, 0);
        let t = d.getTime();
        if (t <= now || (s.lastRun && t <= s.lastRun)) t += 24 * 60 * 60 * 1000;
        return t;
    }
    if (when.type === 'once') return parseInt(when.at, 10) || now;
    return now + 60 * 60 * 1000;
}

const scheduler = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const s of getSchedules()) {
        if (!s.enabled) continue;
        if (s.nextRun === undefined) { s.nextRun = nextRunFor(s, now); changed = true; }
        if (now >= s.nextRun) {
            /* never stack runs: skip a tick if this job's previous task is still alive */
            if (s.lastTaskId && tasks.has(s.lastTaskId) && tasks.get(s.lastTaskId).alive) {
                s.lastStatus = 'skipped — previous run still active';
                s.nextRun = nextRunFor(Object.assign({}, s, { lastRun: now }), now);
                continue;
            }
            const r = runTask({ name: '📅 ' + s.name, cmd: s.cmd, cwd: s.cwd || null, notify: s.notify !== false });
            s.lastRun = now;
            if (r.id) s.lastTaskId = r.id;
            s.lastStatus = r.error ? ('error: ' + r.error) : ('started (task ' + r.id + ')');
            if (s.when && s.when.type === 'once') {
                s.enabled = false;
                s.nextRun = null;
            } else {
                s.nextRun = nextRunFor(s, now);
            }
            changed = true;
            log(`Scheduler ran "${s.name}"`);
        }
    }
    if (changed) saveSchedules(getSchedules());
}, 15000);
scheduler.unref();

function validateSchedule(body) {
    if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 60) return 'Invalid name';
    if (typeof body.cmd !== 'string' || !body.cmd.trim() || body.cmd.length > 8000) return 'Invalid command';
    const w = body.when;
    if (!w || !['interval', 'daily', 'once'].includes(w.type)) return 'Invalid schedule type';
    if (w.type === 'interval') {
        const n = parseInt(w.everyMin, 10);
        if (!Number.isFinite(n) || n < 1 || n > 525600) return 'everyMin must be 1..525600';
    }
    if (w.type === 'daily') {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(w.at || ''));
        if (!m || parseInt(m[1], 10) > 23 || parseInt(m[2], 10) > 59) return 'daily needs at "HH:MM"';
    }
    if (w.type === 'once' && !Number.isFinite(parseInt(w.at, 10))) return 'once needs epoch ms "at"';
    return null;
}

app.get('/api/schedules', requireAuth, (req, res) => {
    const now = Date.now();
    res.json({
        schedules: getSchedules().map((s) => Object.assign({}, s, {
            nextRun: s.enabled ? (s.nextRun !== undefined ? s.nextRun : nextRunFor(s, now)) : null
        }))
    });
});

app.post('/api/schedules', requireAuth, (req, res) => {
    const problem = validateSchedule(req.body);
    if (problem) return res.status(400).json({ error: problem });
    const list = getSchedules();
    if (list.length >= 50) return res.status(400).json({ error: 'Schedule limit reached (50)' });
    const s = {
        id: 'sch_' + crypto.randomBytes(4).toString('hex'),
        name: req.body.name.trim().slice(0, 60),
        cmd: req.body.cmd.trim(),
        cwd: (typeof req.body.cwd === 'string' && isExistingDir(req.body.cwd)) ? path.resolve(req.body.cwd) : null,
        when: req.body.when,
        enabled: req.body.enabled !== false,
        notify: req.body.notify !== false,
        createdAt: Date.now(),
        lastRun: null,
        lastStatus: null
    };
    s.nextRun = nextRunFor(s, Date.now());
    list.push(s);
    saveSchedules(list);
    res.json({ success: true, schedule: s });
});

app.post('/api/schedules/:id', requireAuth, (req, res) => {
    const list = getSchedules();
    const s = list.find((x) => x.id === req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    const body = req.body || {};
    if (body.enabled !== undefined) s.enabled = !!body.enabled;
    if (body.notify !== undefined) s.notify = !!body.notify;
    if (body.name !== undefined || body.cmd !== undefined || body.when !== undefined) {
        const problem = validateSchedule(Object.assign({}, s, body));
        if (problem) return res.status(400).json({ error: problem });
        if (body.name !== undefined) s.name = String(body.name).slice(0, 60);
        if (body.cmd !== undefined) s.cmd = String(body.cmd);
        if (body.when !== undefined) s.when = body.when;
    }
    if (s.enabled) s.nextRun = nextRunFor(s, Date.now());
    saveSchedules(list);
    res.json({ success: true, schedule: s });
});

app.delete('/api/schedules/:id', requireAuth, (req, res) => {
    const list = getSchedules().filter((x) => x.id !== req.params.id);
    saveSchedules(list);
    res.json({ success: true });
});

app.post('/api/schedules/:id/run', requireAuth, (req, res) => {
    const s = getSchedules().find((x) => x.id === req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    const r = runTask({ name: '📅 ' + s.name, cmd: s.cmd, cwd: s.cwd || null, notify: s.notify !== false });
    if (r.error) return res.status(400).json({ error: r.error });
    s.lastRun = Date.now();
    s.lastStatus = 'started (task ' + r.id + ')';
    saveSchedules(getSchedules());
    res.json({ success: true, taskId: r.id });
});

/* ──────────────────────────── Server-side trigger sync (push when browser closed) ──────────────────────────── */

app.post('/api/triggers/sync', requireAuth, (req, res) => {
    const list = req.body && req.body.triggers;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'triggers array required' });
    const clean = list.slice(0, 30).filter((t) => t && typeof t.pattern === 'string' && t.pattern.length <= 200 && t.push)
        .map((t) => ({
            id: String(t.id || '').slice(0, 40),
            name: String(t.name || 'trigger').slice(0, 40),
            pattern: t.pattern,
            caseSensitive: !!t.caseSensitive,
            push: true
        }));
    const cfg = loadConfigFile();
    cfg.pushTriggers = clean;
    saveConfigFile(cfg);
    res.json({ success: true, count: clean.length });
});

function getPushTriggers() {
    const cfg = loadConfigFile();
    const list = Array.isArray(cfg.pushTriggers) ? cfg.pushTriggers : [];
    return list.map((t) => {
        if (!t._re) { try { t._re = new RegExp(t.pattern, t.caseSensitive ? '' : 'i'); } catch (e) { t._re = null; } }
        return t;
    }).filter((t) => t._re);
}

const pushTriggerCooldown = new Map(); // `${trigId}:${tabId}` -> ts
setInterval(() => {
    if (pushTriggerCooldown.size < 500) return;
    const now = Date.now();
    for (const [k, v] of Array.from(pushTriggerCooldown.entries())) if (now - v > 60000) pushTriggerCooldown.delete(k);
}, 60000).unref();
const serverLineBufs = new Map();      // tabId -> partial line

function evalPushTriggers(session, data) {
    let triggers;
    try { triggers = getPushTriggers(); } catch (e) { return; }
    if (!triggers.length) return;
    let buf = (serverLineBufs.get(session.tabId) || '') + data;
    if (buf.length > 16000) buf = buf.slice(-16000);
    const parts = buf.split('\n');
    serverLineBufs.set(session.tabId, parts.pop() || '');
    const now = Date.now();
    for (const line of parts) {
        const cleanLine = stripAnsiServer(line).trim();
        if (!cleanLine) continue;
        for (const t of triggers) {
            if (!t._re.test(cleanLine)) continue;
            const key = t.id + ':' + session.tabId;
            if (now - (pushTriggerCooldown.get(key) || 0) < 10000) continue;
            pushTriggerCooldown.set(key, now);
            pushNotify('⚡ ' + t.name, cleanLine.slice(0, 160), 'trigger:' + t.id).catch(() => {});
        }
    }
}

/* ──────────────────────────── Share-target upload (PWA share sheet) ──────────────────────────── */

const INBOX_DIR = process.env.KONSOLE_INBOX || path.join(process.env.HOME || os.homedir() || '/tmp', 'GarudaUploads');

app.post('/share-upload', (req, res) => {
    const send = (code, msg, ok) => {
        res.status(code).type('html').send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Garuda upload</title></head>
        <body style="background:#0c0f15;color:#e8edf4;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0;padding:16px;text-align:center">
        <div><div style="font-size:44px">${ok ? '✅' : '⚠️'}</div><h2 style="margin:10px 0 6px;font-size:18px">${msg}</h2>
        <p style="color:#93a0b0;font-size:13px">You can close this tab and return to Garuda Konsole.</p></div></body></html>`);
    };
    if (!credentialFrom(req)) return send(401, 'Not signed in — open Garuda Konsole and unlock first.', false);
    try {
        let files = req.files ? (req.files.files || req.files.file) : null;
        if (!files) return send(400, 'No files were shared.', false);
        if (!Array.isArray(files)) files = [files];
        fs.mkdirSync(INBOX_DIR, { recursive: true });
        const saved = [];
        let pending = files.length;
        files.forEach((f) => {
            const clean = sanitizeName(f.name);
            if (!clean) { if (--pending === 0) finish(); return; }
            let target = path.join(INBOX_DIR, clean);
            if (fs.existsSync(target)) {
                const ext = path.extname(clean), stem = path.basename(clean, ext);
                let i = 1;
                while (fs.existsSync(target) && i < 1000) { target = path.join(INBOX_DIR, `${stem} (${i})${ext}`); i++; }
            }
            f.mv(target, (err) => {
                if (!err) saved.push(path.basename(target));
                if (--pending === 0) finish();
            });
        });
        function finish() {
            log(`Share-target upload → ${saved.length} file(s) into ${INBOX_DIR}`);
            if (saved.length) send(200, `Uploaded ${saved.length} file${saved.length > 1 ? 's' : ''} to GarudaUploads`, true);
            else send(500, 'Upload failed.', false);
        }
    } catch (e) {
        send(500, 'Upload failed.', false);
    }
});

/* ──────────────────────────── WebSocket gateway ──────────────────────────── */

wss.on('connection', (ws, req) => {
    let url;
    try {
        url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch (e) {
        ws.close(4400, 'bad url');
        return;
    }

    const authParam = url.searchParams.get('auth');
    const shareToken = url.searchParams.get('shareToken');
    let tabId = url.searchParams.get('tabId') || '';
    let role = null;
    let mode = 'full';

    const credOk = authParam && (isValidToken(authParam) || authParam === PASSWORD);
    const share = shareToken ? shareTokens.get(shareToken) : null;
    if (url.pathname === '/ws/rd') {
        if (!credOk) {
            sendCtrl(ws, { type: 'error', message: 'Unauthorized' });
            ws.close(4401, 'unauthorized');
            return;
        }
        handleRdSocket(ws);
        return;
    }
    const shareValid = share && Date.now() - share.createdAt <= SHARE_TTL_MS;

    if (credOk) {
        role = 'host';
        if (!TAB_ID_RE.test(tabId)) {
            sendCtrl(ws, { type: 'error', message: 'Invalid tab id' });
            ws.close(4400, 'bad tab id');
            return;
        }
    } else if (shareValid) {
        role = 'viewer';
        tabId = share.tabId;
        mode = share.mode;
    } else {
        sendCtrl(ws, { type: 'error', message: 'Unauthorized connection' });
        ws.close(4401, 'unauthorized');
        return;
    }

    const wantCols = clampInt(url.searchParams.get('cols'), 2, 400, 80);
    const wantRows = clampInt(url.searchParams.get('rows'), 2, 200, 24);
    const wantShell = url.searchParams.get('shell');
    const wantCwd = url.searchParams.get('cwd');

    let session = sessions.get(tabId);
    if (role === 'host') {
        session = getOrCreateSession(tabId, {
            cols: wantCols, rows: wantRows, autoRespawn: true,
            shell: wantShell, cwd: wantCwd
        });
        if (!session) {
            const reason = !pty ? 'Terminal engine unavailable (node-pty not loaded)'
                : `Session limit reached (${MAX_SESSIONS})`;
            sendCtrl(ws, { type: 'error', message: reason });
            ws.close(4500, 'no session');
            return;
        }
    } else if (!session) {
        sendCtrl(ws, { type: 'error', message: 'The shared session no longer exists' });
        ws.close(4404, 'no session');
        return;
    }

    const client = {
        ws,
        role,
        mode,
        shareToken: shareValid ? shareToken : null,
        id: crypto.randomBytes(6).toString('hex'),
        isAlive: true
    };
    session.clients.add(client);

    // Handshake: send the full replay buffer as one control frame
    const initCwd = getSessionCwd(session);
    session.pushedCwd = initCwd;
    sendCtrl(ws, {
        type: 'init',
        tabId: session.tabId,
        role,
        mode: role === 'viewer' ? mode : 'full',
        clientId: client.id,
        shell: path.basename(session.shell || SHELL_PATH),
        cwd: initCwd,
        alive: session.alive,
        history: session.history.join(''),
        exitInfo: session.exitInfo
    });
    broadcastPresence(tabId);

    ws.on('pong', () => { client.isAlive = true; });

    ws.on('message', (raw) => {
        let payload;
        try {
            payload = JSON.parse(raw.toString());
        } catch (e) {
            return; // ignore non-JSON frames
        }
        if (!payload || typeof payload.type !== 'string') return;
        session.lastActivity = Date.now();

        switch (payload.type) {
            case 'ping': {
                sendCtrl(ws, { type: 'pong', t: payload.t });
                break;
            }
            case 'input': {
                const canInput = client.role === 'host' || (client.role === 'viewer' && client.mode === 'interactive');
                if (canInput && typeof payload.data === 'string' && payload.data.length <= 16 * 1024) {
                    if (session.alive && session.ptyProcess) {
                        try { session.ptyProcess.write(payload.data); } catch (e) {}
                        /* Track command lines so we can push "finished" when nobody is watching */
                        if (/[\r\n]/.test(payload.data)) {
                            session.cmdPending = {
                                at: Date.now(),
                                firstLine: stripAnsiServer(payload.data.split(/[\r\n]/)[0]).slice(0, 80)
                            };
                            session.pushNotified = false;
                        }
                    } else {
                        sendCtrl(ws, { type: 'error', message: 'Shell is not running. Restart the session.' });
                    }
                }
                break;
            }
            case 'resize': {
                const canResize = client.role === 'host' || (client.role === 'viewer' && client.mode === 'interactive');
                if (canResize && session.alive && session.ptyProcess) {
                    const cols = clampInt(payload.cols, 2, 400, 0);
                    const rows = clampInt(payload.rows, 2, 200, 0);
                    if (cols && rows) {
                        try { session.ptyProcess.resize(cols, rows); } catch (e) {}
                    }
                }
                break;
            }
            case 'respawn': {
                if (client.role === 'host' && pty) {
                    if (!session.alive) {
                        session.history = [];
                        session.historyBytes = 0;
                        session.respawnCount = (session.respawnCount || 0) + 1;
                        try {
                            spawnPtyFor(session, payload.cols, payload.rows);
                            broadcastCtrl(session, { type: 'restarted', tabId: session.tabId });
                        } catch (err) {
                            sendCtrl(ws, { type: 'error', message: 'Failed to restart shell: ' + err.message });
                        }
                    }
                }
                break;
            }
            case 'chat': {
                const text = typeof payload.text === 'string' ? payload.text.slice(0, 2000).trim() : '';
                if (!text) break;
                // Simple anti-flood: max 5 messages per 2 seconds per client
                const now = Date.now();
                client.chatTimes = (client.chatTimes || []).filter((t) => now - t < 2000);
                if (client.chatTimes.length >= 5) break;
                client.chatTimes.push(now);
                const from = client.role === 'host' ? 'host' : `viewer-${client.id.slice(0, 4)}`;
                broadcastCtrl(session, { type: 'chat', from, fromId: client.id, text, t: now });
                break;
            }
            case 'kill': {
                if (client.role === 'host') killSession(tabId, 'closed by user');
                break;
            }
            default:
                break;
        }
    });

    ws.on('error', () => { /* swallow socket errors; close will follow */ });

    ws.on('close', () => {
        const s = sessions.get(tabId);
        if (s) {
            s.clients.delete(client);
            broadcastPresence(tabId);
        }
    });
});

/* Dead-socket reaper */
const heartbeat = setInterval(() => {
    for (const session of sessions.values()) {
        for (const client of Array.from(session.clients)) {
            if (!client.isAlive) {
                try { client.ws.terminate(); } catch (e) {}
                session.clients.delete(client);
                continue;
            }
            client.isAlive = false;
            try { client.ws.ping(); } catch (e) {}
        }
    }
}, 30000);
heartbeat.unref();

/* Keep lastCwd fresh, push cwd changes to clients, and detect finished commands
   for background push notifications (only when no client is connected).
   Cost note: this piggybacks on one 3 s interval — no per-output work beyond a
   few timestamp comparisons. */
const cwdTracker = setInterval(() => {
    const now = Date.now();
    for (const session of sessions.values()) {
        if (!session.alive || !session.ptyProcess) continue;
        try {
            const cwd = fs.readlinkSync(`/proc/${session.ptyProcess.pid}/cwd`);
            if (cwd && cwd !== session.lastCwd) {
                session.lastCwd = cwd;
            }
            if (cwd && cwd !== session.pushedCwd) {
                session.pushedCwd = cwd;
                broadcastCtrl(session, { type: 'cwd', tabId: session.tabId, cwd });
            }
        } catch (e) { /* keep previous */ }

        /* Command-completion push: input line seen, output went quiet, nobody watching */
        if (session.cmdPending && !session.pushNotified && session.clients.size === 0) {
            const ranFor = (session.lastOutputAt || session.cmdPending.at) - session.cmdPending.at;
            const idleFor = now - (session.lastOutputAt || session.cmdPending.at);
            if (ranFor >= 2000 && idleFor >= 3000) {
                session.pushNotified = true;
                pushNotify(
                    '✓ Command finished',
                    `"${session.cmdPending.firstLine || 'command'}" completed in ${session.tabId} after ${fmtDur(ranFor)}`,
                    'cmd:' + session.tabId
                ).catch(() => {});
            }
        }
    }
}, 3000);
cwdTracker.unref();

/* GC for dead, unwatched sessions */
const gc = setInterval(() => {
    const now = Date.now();
    for (const [tabId, session] of Array.from(sessions.entries())) {
        if (!session.alive && session.clients.size === 0 && now - session.lastActivity > IDLE_DEAD_SESSION_MS) {
            sessions.delete(tabId);
            log(`GC removed dead session ${tabId}`);
        }
    }
}, 5 * 60 * 1000);
gc.unref();

/* ──────────────────────────── Error handling & boot ──────────────────────────── */

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    log('Unhandled route error:', err && err.message);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
});

process.on('uncaughtException', (err) => {
    log('Uncaught exception (server kept alive):', err && err.stack ? err.stack.split('\n')[0] : err);
});
process.on('unhandledRejection', (reason) => {
    log('Unhandled rejection:', reason);
});

function shutdown(signal) {
    log(`${signal} received — shutting down gracefully...`);
    try { clearInterval(heartbeat); clearInterval(gc); clearInterval(cwdTracker); clearInterval(scheduler); clearInterval(taskGc); clearInterval(taskWaitTracker); } catch (e) {}
    for (const session of sessions.values()) {
        if (session.ptyProcess && session.alive) {
            try { session.ptyProcess.kill(); } catch (e) {}
        }
    }
    try { wss.close(); } catch (e) {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(PORT, HOST, () => {
    const proto = IS_TLS ? 'https' : 'http';
    log('──────────────────────────────────────────────');
    log(`  Garuda Konsole v${VERSION}${IS_TLS ? ' (TLS)' : ''}`);
    log(`  ➜ Local:    ${proto}://localhost:${PORT}`);
    log(`  ➜ Network:  ${proto}://${getLanIp()}:${PORT}`);
    log(`  ➜ Shell:    ${SHELL_PATH}`);
    log(`  ➜ pty:      ${pty ? 'ready' : 'MISSING (terminals disabled)'}`);
    log('──────────────────────────────────────────────');
});

function getLanIp() {
    try {
        const ifaces = os.networkInterfaces();
        for (const name of Object.keys(ifaces)) {
            for (const iface of ifaces[name] || []) {
                if (iface.family === 'IPv4' && !iface.internal) return iface.address;
            }
        }
    } catch (e) {}
    return 'localhost';
}

module.exports = { app, server };
