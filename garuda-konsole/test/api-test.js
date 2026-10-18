/* API smoke tests for Garuda Konsole server (uses node fetch + ws) */
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const PORT = process.env.PORT || '3198';
const B = process.env.BASE || `http://localhost:${PORT}`;
const WebSocket = require('ws');

let serverProc = null;
if (!process.env.BASE) {
    serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: Object.assign({}, process.env, { PORT: String(PORT), KONSOLE_TASK_REMIND_MS: process.env.KONSOLE_TASK_REMIND_MS || '3000', GK_HEALTH_CPU: process.env.GK_HEALTH_CPU || '30', GK_STATS_TICK_MS: process.env.GK_STATS_TICK_MS || '2000' }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    serverProc.stdout.on('data', () => {});
    serverProc.stderr.on('data', (d) => process.stderr.write('[srv] ' + d));
}
async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        try { const r = await fetch(B + '/healthz'); if (r.ok) return; } catch (e) {}
        await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('test server did not start on ' + B);
}

let passed = 0, failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log(`  ✔ ${name}`); }
    else { failed++; console.log(`  ✘ ${name}${extra ? ' — ' + extra : ''}`); }
}

async function j(url, opts) {
    const res = await fetch(url, opts);
    let body = null;
    try { body = await res.json(); } catch (e) {}
    return { status: res.status, body };
}

function wsConnect(qs) {
    return new Promise((resolve) => {
        const ws = new WebSocket(`ws://${B.replace('http://', '')}${qs}`);
        const msgs = [];
        ws.on('message', (d) => msgs.push(d.toString()));
        ws.on('open', () => resolve({ ws, msgs }));
        ws.on('error', (e) => resolve({ ws, msgs, error: e.message }));
    });
}

function waitCtrl(msgs, type, timeout = 3000) {
    return new Promise((resolve) => {
        const start = Date.now();
        const iv = setInterval(() => {
            for (const m of msgs) {
                if (m.charCodeAt(0) === 0) {
                    try {
                        const p = JSON.parse(m.slice(1));
                        if (p.type === type) { clearInterval(iv); return resolve(p); }
                    } catch (e) {}
                }
            }
            if (Date.now() - start > timeout) { clearInterval(iv); resolve(null); }
        }, 25);
    });
}

function waitRaw(msgs, needle, timeout = 4000) {
    return new Promise((resolve) => {
        const start = Date.now();
        const iv = setInterval(() => {
            for (const m of msgs) {
                if (m.charCodeAt(0) !== 0 && m.includes(needle)) { clearInterval(iv); return resolve(m); }
            }
            if (Date.now() - start > timeout) { clearInterval(iv); resolve(null); }
        }, 25);
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    await waitForServer();
    console.log('═══ REST API ═══');
    let r = await j(`${B}/healthz`);
    check('healthz public', r.status === 200 && r.body.ok === true);

    r = await j(`${B}/server.js`);
    check('server.js NOT served (source hidden)', r.status === 404);

    /* ── PWA shell assets ──
       Regression: the manifest once shipped renamed to
       "manifest.webmanifest.temporaryextension.txt" (upload artifact), so the
       <link rel="manifest"> in index.html and the sw.js precache both 404'd —
       PWA install broke and two frontend tests failed. These checks pin the
       HTML/manifest/SW references to files that actually exist on disk. */
    const idxText = await (await fetch(`${B}/index.html`)).text();
    const manHref = (idxText.match(/rel="manifest"\s+href="([^"]+)"/) || [])[1];
    check('index.html declares a manifest link', !!manHref);

    const manRes = await fetch(`${B}/${(manHref || 'manifest.webmanifest').replace(/^\//, '')}`);
    let man = null;
    try { man = await manRes.json(); } catch (e) {}
    check('manifest served at the linked path as valid JSON', manRes.status === 200 && !!man && !!man.name && !!man.start_url);

    if (man && Array.isArray(man.icons)) {
        const iconResults = await Promise.all(man.icons.map((ic) => fetch(`${B}/${String(ic.src).replace(/^\//, '')}`).then((x) => x.status)));
        check('every manifest icon src resolves', iconResults.length > 0 && iconResults.every((s) => s === 200), iconResults.join(','));
        check('manifest ships a PNG icon (Chrome install requirement)', man.icons.some((ic) => String(ic.src).endsWith('.png')));
    } else {
        check('every manifest icon src resolves', false, 'manifest.icons missing');
        check('manifest ships a PNG icon (Chrome install requirement)', false, 'manifest.icons missing');
    }

    const swText = await (await fetch(`${B}/sw.js`)).text();
    const shellMatch = swText.match(/const SHELL = \[([\s\S]*?)\];/);
    check('sw.js served with parseable precache list', !!shellMatch);
    if (shellMatch) {
        const localUrls = [...shellMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
        const shellResults = await Promise.all(localUrls.map((u) => fetch(`${B}${u}`).then((x) => x.status).catch(() => 0)));
        check('every locally precached shell asset resolves', shellResults.every((s) => s === 200), localUrls.filter((_, i) => shellResults[i] !== 200).join(', '));
    } else {
        check('every locally precached shell asset resolves', false, 'SHELL list not found in sw.js');
    }

    r = await j(`${B}/api/sessions`);
    check('sessions requires auth', r.status === 401);

    r = await j(`${B}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong-pass' }) });
    check('login rejects wrong password', r.status === 401);

    r = await j(`${B}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: '20090228' }) });
    check('login accepts correct password', r.status === 200 && !!r.body.token);
    const TOK = r.body.token;
    const H = { Authorization: `Bearer ${TOK}` };
    check('login returns meta', !!r.body.shell && !!r.body.hostname && r.body.ptyReady === true);

    r = await j(`${B}/api/bootstrap`, { headers: H });
    check('bootstrap with token', r.status === 200 && r.body.ok === true);

    r = await j(`${B}/api/bootstrap`, { headers: { Authorization: '20090228' } });
    check('bootstrap with raw password (compat)', r.status === 200);

    r = await j(`${B}/api/stats`, { headers: H });
    check('stats shape', r.status === 200 && r.body.cpu && r.body.mem && Array.isArray(r.body.cpu.load));

    r = await j(`${B}/api/files?path=/tmp`, { headers: H });
    check('files listing /tmp', r.status === 200 && Array.isArray(r.body.entries) && r.body.path === '/tmp');

    r = await j(`${B}/api/files?path=/etc/passwd`, { headers: H });
    check('files rejects non-directory', r.status === 400);

    r = await j(`${B}/api/files/content?path=/etc/hostname`, { headers: H });
    check('file content preview', r.status === 200 && typeof r.body.content === 'string');

    r = await j(`${B}/api/files/mkdir`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: '/tmp', name: 'gk-test-dir' }) });
    check('mkdir', r.status === 200 && r.body.success);

    r = await j(`${B}/api/files/mkdir`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: '/tmp', name: '../../evil' }) });
    check('mkdir rejects traversal in name', r.status === 400);

    r = await j(`${B}/api/files/delete`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '/' }) });
    check('delete refuses protected path /', r.status === 403);

    r = await j(`${B}/api/files/delete`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '/etc' }) });
    check('delete refuses protected /etc', r.status === 403);

    r = await j(`${B}/api/files/delete`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '/tmp/gk-test-dir' }) });
    check('delete own test dir', r.status === 200 && r.body.success);

    // custom themes
    r = await j(`${B}/api/custom-themes`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test Theme', theme: { background: '#101010', foreground: '#f0f0f0', cursor: '#00f2fe' } }) });
    check('custom theme save', r.status === 200 && r.body.success && r.body.theme.id === 'custom_test_theme');

    r = await j(`${B}/api/custom-themes`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Bad', theme: { background: 'javascript:evil', foreground: '#fff', cursor: '#000' } }) });
    check('custom theme rejects invalid color', r.status === 400);

    r = await j(`${B}/api/custom-themes`, { headers: H });
    check('custom theme list', r.status === 200 && Array.isArray(r.body) && r.body.some((t) => t.id === 'custom_test_theme'));

    r = await j(`${B}/api/custom-themes/custom_test_theme`, { method: 'DELETE', headers: H });
    check('custom theme delete', r.status === 200);

    r = await j(`${B}/api/custom-themes/garuda_dragonized`, { method: 'DELETE', headers: H });
    check('cannot delete builtin id', r.status === 400);

    console.log('═══ WebSocket flows ═══');
    const tabId = 'gk_test_' + Date.now();

    // Unauthorized WS
    {
        const c = await wsConnect(`?tabId=x1&auth=bogus`);
        const err = await waitCtrl(c.msgs, 'error', 1500);
        check('WS rejects bad auth', !!err && err.message.includes('Unauthorized'));
        c.ws.close();
    }

    // Host connect + input + echo
    const host = await wsConnect(`?tabId=${tabId}&auth=${TOK}&cols=100&rows=30`);
    const init = await waitCtrl(host.msgs, 'init');
    check('WS host init frame', !!init && init.tabId === tabId && init.alive === true && typeof init.history === 'string');

    host.ws.send(JSON.stringify({ type: 'input', data: 'echo GKHELLOWORLD\r' }));
    const echoed = await waitRaw(host.msgs, 'GKHELLOWORLD');
    check('WS input -> pty echo', !!echoed);

    // Latency ping
    host.ws.send(JSON.stringify({ type: 'ping', t: 12345 }));
    const pong = await waitCtrl(host.msgs, 'pong');
    check('WS ping/pong', !!pong && pong.t === 12345);

    // Second host connection replays history (no duplication issue: it's a fresh term)
    const host2 = await wsConnect(`?tabId=${tabId}&auth=${TOK}`);
    const init2 = await waitCtrl(host2.msgs, 'init');
    check('WS reconnect gets history replay', !!init2 && init2.history.includes('GKHELLOWORLD'));

    // Presence: share readonly
    let rs = await j(`${B}/api/share/create`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ tabId, mode: 'readonly' }) });
    check('share create', rs.status === 200 && rs.body.token.startsWith('share_'));
    const shareToken = rs.body.token;

    const viewer = await wsConnect(`?shareToken=${shareToken}`);
    const vinit = await waitCtrl(viewer.msgs, 'init');
    check('viewer init + history', !!vinit && vinit.role === 'viewer' && vinit.mode === 'readonly' && vinit.history.includes('GKHELLOWORLD'));

    const pres = await waitCtrl(host.msgs, 'presence');
    // presence frames were sent earlier too; find the latest with viewerCount 1
    let sawPresence1 = false;
    for (const m of host.msgs) {
        if (m.charCodeAt(0) === 0) {
            try { const p = JSON.parse(m.slice(1)); if (p.type === 'presence' && p.viewerCount === 1) sawPresence1 = true; } catch (e) {}
        }
    }
    check('presence broadcast viewerCount=1', sawPresence1);

    // Readonly viewer cannot type
    viewer.ws.send(JSON.stringify({ type: 'input', data: 'echo SHOULD_NOT_RUN\r' }));
    await sleep(400);
    const bad = host.msgs.some((m) => m.charCodeAt(0) !== 0 && m.includes('SHOULD_NOT_RUN') && m.includes('$'));
    // 'SHOULD_NOT_RUN' should never be echoed by pty since input is dropped
    let ranEcho = false;
    host.msgs.length = 0;
    viewer.ws.send(JSON.stringify({ type: 'input', data: 'echo VIEWER_INJECT\r' }));
    const inj = await waitRaw(host.msgs, 'VIEWER_INJECT', 800);
    check('readonly viewer input blocked', !inj);

    // Share status
    rs = await j(`${B}/api/share/status?tabId=${tabId}`, { headers: H });
    check('share status active', rs.status === 200 && rs.body.isShared && rs.body.viewerCount === 1);

    // Public share info (no auth)
    rs = await j(`${B}/api/share/info/${shareToken}`);
    check('share info public', rs.status === 200 && rs.body.valid && rs.body.mode === 'readonly');

    // Revoke kicks viewer
    rs = await j(`${B}/api/share/revoke`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ tabId }) });
    check('share revoke', rs.status === 200);
    const revoked = await waitCtrl(viewer.msgs, 'share_revoked', 1500);
    check('viewer receives revoke notice', !!revoked);
    await sleep(200);
    check('viewer ws closed after revoke', viewer.ws.readyState === WebSocket.CLOSED || viewer.ws.readyState === WebSocket.CLOSING);

    // Interactive share CAN resize/type
    rs = await j(`${B}/api/share/create`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ tabId, mode: 'interactive' }) });
    const viewer2 = await wsConnect(`?shareToken=${rs.body.token}`);
    await waitCtrl(viewer2.msgs, 'init');
    viewer2.ws.send(JSON.stringify({ type: 'input', data: 'echo PAIRWORKS\r' }));
    const pair = await waitRaw(host.msgs, 'PAIRWORKS');
    check('interactive pair can type', !!pair);
    await j(`${B}/api/share/revoke`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ tabId }) });
    viewer2.ws.close();

    // Invalid tab ids rejected
    {
        const c = await wsConnect(`?tabId=../etc&auth=${TOK}`);
        const err = await waitCtrl(c.msgs, 'error', 1500);
        check('WS rejects invalid tabId', !!err);
        c.ws.close();
    }

    // Kill closes everyone
    host.ws.send(JSON.stringify({ type: 'kill' }));
    const closed = await waitCtrl(host2.msgs, 'session_closed', 1500);
    check('kill notifies other clients', !!closed);
    await sleep(300);
    rs = await j(`${B}/api/sessions`, { headers: H });
    check('session removed from list', rs.status === 200 && !rs.body.sessions.some((s) => s.tabId === tabId));

    // Upload test
    const form = new FormData();
    form.append('tabId', 'does-not-matter');
    form.append('dest', '/tmp');
    form.append('file', new Blob(['hello upload'], { type: 'text/plain' }), 'gk-upload-test.txt');
    const upRes = await fetch(`${B}/upload`, { method: 'POST', headers: H, body: form });
    const upBody = await upRes.json();
    check('upload saves file', upRes.status === 200 && upBody.success && upBody.saved.includes('gk-upload-test.txt'));

    // upload rejects traversal filename
    const form2 = new FormData();
    form2.append('dest', '/tmp');
    form2.append('file', new Blob(['x']), '../../evil.txt');
    const up2 = await fetch(`${B}/upload`, { method: 'POST', headers: H, body: form2 });
    const up2b = await up2.json();
    check('upload sanitizes traversal filename', up2.status === 200 && !require('fs').existsSync('/evil.txt') && !require('fs').existsSync('/home/evil.txt'));

    // download direct path
    const dl = await fetch(`${B}/download?path=/tmp/gk-upload-test.txt&auth=${TOK}`);
    const dlText = await dl.text();
    check('download direct', dl.status === 200 && dlText === 'hello upload');

    const dl401 = await fetch(`${B}/download?path=/tmp/gk-upload-test.txt`);
    check('download requires auth', dl401.status === 401);
    require('fs').unlinkSync('/tmp/gk-upload-test.txt');

    // sessions list & API kill
    const t2 = 'gk_api_' + Date.now();
    const c2 = await wsConnect(`?tabId=${t2}&auth=${TOK}`);
    await waitCtrl(c2.msgs, 'init');
    rs = await j(`${B}/api/sessions`, { headers: H });
    check('sessions list shows session', rs.status === 200 && rs.body.sessions.some((s) => s.tabId === t2));
    rs = await j(`${B}/api/sessions/kill`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ tabId: t2 }) });
    check('API kill session', rs.status === 200 && rs.body.killed);
    const sc = await waitCtrl(c2.msgs, 'session_closed', 1500);
    check('killed client notified', !!sc);

    // ═══ 3.0 features ═══
    console.log('═══ 3.0: shells, profiles, cwd push, git, search, stat, chat ═══');

    rs = await j(`${B}/api/shells`, { headers: H });
    check('shells list', rs.status === 200 && Array.isArray(rs.body.shells) && rs.body.shells.length > 0 && rs.body.shells.some((s) => s.name === 'bash'));
    check('shells requires auth', (await j(`${B}/api/shells`)).status === 401);

    // Session profile: custom shell + start cwd
    const profTab = 'gk_prof_' + Date.now();
    const prof = await wsConnect(`?tabId=${profTab}&auth=${TOK}&shell=bash&cwd=/tmp`);
    const profInit = await waitCtrl(prof.msgs, 'init');
    check('profile init shell=bash', !!profInit && profInit.shell === 'bash');
    check('profile init cwd=/tmp', profInit && profInit.cwd === '/tmp', profInit && profInit.cwd);
    check('init carries clientId', profInit && typeof profInit.clientId === 'string' && profInit.clientId.length >= 8);

    // Reject non-whitelisted shell → falls back to default (no spawn of arbitrary binaries)
    const evilTab = 'gk_evilsh_' + Date.now();
    const evil = await wsConnect(`?tabId=${evilTab}&auth=${TOK}&shell=python3`);
    const evilInit = await waitCtrl(evil.msgs, 'init');
    check('non-whitelisted shell ignored', !!evilInit && evilInit.shell !== 'python3', evilInit && evilInit.shell);
    evil.ws.send(JSON.stringify({ type: 'kill' }));

    // cwd change is pushed to clients
    prof.ws.send(JSON.stringify({ type: 'input', data: 'cd /etc\r' }));
    let cwdMsg = null;
    for (let i = 0; i < 40 && !cwdMsg; i++) {
        await sleep(150);
        for (const m of prof.msgs) {
            if (m.charCodeAt(0) === 0) {
                try { const p = JSON.parse(m.slice(1)); if (p.type === 'cwd') { cwdMsg = p; break; } } catch (e) {}
            }
        }
    }
    check('cwd change pushed via ctrl frame', !!cwdMsg && cwdMsg.cwd === '/etc', cwdMsg && cwdMsg.cwd);

    // git endpoint (positive + negative)
    const { execSync: ex } = require('child_process');
    const repoDir = '/tmp/gk-git-test-' + Date.now();
    ex(`mkdir -p ${repoDir} && cd ${repoDir} && git init -q -b main && git config user.email t@t.t && git config user.name t && echo hi > f.txt && git add . && git commit -qm init && echo dirty >> f.txt`);
    rs = await j(`${B}/api/git?path=${encodeURIComponent(repoDir)}`, { headers: H });
    check('git branch detected', rs.status === 200 && rs.body.isRepo === true && rs.body.branch === 'main', JSON.stringify(rs.body));
    check('git dirty detected', rs.body.dirty === true);
    rs = await j(`${B}/api/git?path=/tmp`, { headers: H });
    check('non-repo → isRepo false', rs.status === 200 && rs.body.isRepo === false);
    ex(`rm -rf ${repoDir}`);

    // file search
    ex('mkdir -p /tmp/gk-search-root/sub && touch /tmp/gk-search-root/hello_world_gk.txt /tmp/gk-search-root/sub/nested_gk_file.log');
    rs = await j(`${B}/api/files/search?path=/tmp/gk-search-root&q=gk_file`, { headers: H });
    check('search finds nested file', rs.status === 200 && rs.body.results.some((r) => r.name === 'nested_gk_file.log'), JSON.stringify(rs.body.results || []).slice(0, 120));
    rs = await j(`${B}/api/files/search?path=/tmp/gk-search-root&q=hello`, { headers: H });
    check('search finds top file', rs.status === 200 && rs.body.results.some((r) => r.name === 'hello_world_gk.txt'));
    rs = await j(`${B}/api/files/search?path=/tmp/gk-search-root`, { headers: H });
    check('search requires q', rs.status === 400);
    ex('rm -rf /tmp/gk-search-root');

    // file stat
    ex('echo data > /tmp/gk-stat-file.txt');
    rs = await j(`${B}/api/files/stat?path=/tmp/gk-stat-file.txt`, { headers: H });
    check('stat returns mode/size/times', rs.status === 200 && /^-r[w-]/.test(rs.body.mode) && rs.body.size === 5 && typeof rs.body.mtime === 'number', JSON.stringify(rs.body).slice(0, 140));
    rs = await j(`${B}/api/files/stat?path=/tmp/definitely-not-here-xyz`, { headers: H });
    check('stat 404 on missing', rs.status === 404);
    ex('rm -f /tmp/gk-stat-file.txt');

    // chat relay: host + interactive viewer
    const chatTab = 'gk_chat_' + Date.now();
    const chatHost = await wsConnect(`?tabId=${chatTab}&auth=${TOK}`);
    const chatHostInit = await waitCtrl(chatHost.msgs, 'init');
    check('chat host init', !!chatHostInit);
    rs = await j(`${B}/api/share/create`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ tabId: chatTab, mode: 'interactive' }) });
    const chatViewer = await wsConnect(`?shareToken=${rs.body.token}`);
    const chatViewerInit = await waitCtrl(chatViewer.msgs, 'init');
    check('chat viewer init has clientId', !!chatViewerInit && !!chatViewerInit.clientId);

    chatViewer.ws.send(JSON.stringify({ type: 'chat', text: 'hello from viewer' }));
    let hostGotChat = null;
    for (let i = 0; i < 30 && !hostGotChat; i++) {
        await sleep(100);
        for (const m of chatHost.msgs) {
            if (m.charCodeAt(0) === 0) {
                try { const p = JSON.parse(m.slice(1)); if (p.type === 'chat') { hostGotChat = p; break; } } catch (e) {}
            }
        }
    }
    check('viewer chat relayed to host', !!hostGotChat && hostGotChat.text === 'hello from viewer' && hostGotChat.from.startsWith('viewer-'));

    chatHost.ws.send(JSON.stringify({ type: 'chat', text: 'hi viewer' }));
    let viewerGotChat = null;
    for (let i = 0; i < 30 && !viewerGotChat; i++) {
        await sleep(100);
        for (const m of chatViewer.msgs) {
            if (m.charCodeAt(0) === 0) {
                try { const p = JSON.parse(m.slice(1)); if (p.type === 'chat' && p.text === 'hi viewer') { viewerGotChat = p; break; } } catch (e) {}
            }
        }
    }
    check('host chat relayed to viewer', !!viewerGotChat && viewerGotChat.from === 'host');
    check('chat frame carries sender id', viewerGotChat && viewerGotChat.fromId === chatHostInit.clientId);

    // chat flood control: 12 rapid messages → ≤ 5+1 relayed (viewer already sent 1 earlier in same window? fresh window)
    chatHost.msgs.length = 0;
    for (let i = 0; i < 12; i++) chatHost.ws.send(JSON.stringify({ type: 'chat', text: 'flood ' + i }));
    await sleep(700);
    const relayed = chatHost.msgs.filter((m) => {
        if (m.charCodeAt(0) !== 0) return false;
        try { return JSON.parse(m.slice(1)).type === 'chat'; } catch (e) { return false; }
    }).length;
    check('chat flood limited (≤6 of 12 relayed)', relayed > 0 && relayed <= 6, `relayed=${relayed}`);

    await j(`${B}/api/share/revoke`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ tabId: chatTab }) });
    chatHost.ws.send(JSON.stringify({ type: 'kill' }));
    prof.ws.send(JSON.stringify({ type: 'kill' }));
    await sleep(200);
    prof.ws.close();
    chatViewer.ws.close();

    // ═══ 3.1: AI Guide proxy ═══
    console.log('═══ 3.1: AI config & chat proxy ═══');

    // Deterministic state: never inherit a config file from a previous crashed run,
    // and guarantee cleanup even if an assertion/network failure occurs mid-section.
    const CFG_PATH = require('path').join(__dirname, '..', 'garuda.config.json');
    try { require('fs').unlinkSync(CFG_PATH); } catch (e) {}
    try {

    rs = await j(`${B}/api/ai/config`, { headers: H });
    check('ai config readable', rs.status === 200 && rs.body.hasKey === true && /•/.test(rs.body.keyPreview || '') && rs.body.model.length > 0);
    check('ai config masked (no raw key leak)', rs.status === 200 && !JSON.stringify(rs.body).includes('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'.slice(10, 40)));
    check('ai config requires auth', (await j(`${B}/api/ai/config`)).status === 401);

    rs = await j(`${B}/api/ai/config`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: '../../etc' }) });
    check('ai model traversal rejected', rs.status === 400);
    rs = await j(`${B}/api/ai/config`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'short' }) });
    check('ai short key rejected', rs.status === 400);
    rs = await j(`${B}/api/ai/config`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'qwen/qwen3.8-27b' }) });
    check('ai model set accepted', rs.status === 200 && rs.body.model === 'qwen/qwen3.8-27b');

    check('ai config exposes maxTokens', (await j(`${B}/api/ai/config`, { headers: H })).body.maxTokens === 800);
    rs = await j(`${B}/api/ai/config`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ maxTokens: 500 }) });
    check('maxTokens save accepted', rs.status === 200 && rs.body.maxTokens === 500);
    rs = await j(`${B}/api/ai/config`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ maxTokens: 99999 }) });
    check('maxTokens out-of-range rejected', rs.status === 400);
    rs = await j(`${B}/api/ai/config`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ maxTokens: 800 }) });
    check('maxTokens restored', rs.status === 200 && rs.body.maxTokens === 800);

    rs = await j(`${B}/api/ai/chat`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: 'not-an-array' }) });
    check('ai chat validates messages', rs.status === 400);
    rs = await j(`${B}/api/ai/chat`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'hacker', content: 'x' }] }) });
    check('ai chat validates roles', rs.status === 400);
    check('ai chat requires auth', (await j(`${B}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) })).status === 401);

    // Live proxy round-trip through real Groq (one tiny call)
    const t0 = Date.now();
    rs = await j(`${B}/api/ai/chat`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Reply with exactly: GUIDE_READY' }] }) });
    check('ai chat proxies to Groq', rs.status === 200 && (rs.body.content || '').includes('GUIDE_READY'), JSON.stringify(rs.body).slice(0, 160));
    check('ai latency sane (<20s)', Date.now() - t0 < 20000);

    // cmd-block protocol adherence (what the agent parser relies on)
    rs = await j(`${B}/api/ai/chat`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [
        { role: 'system', content: 'To run a command output exactly one fenced block labeled cmd:\n```cmd\n<command>\n```' },
        { role: 'user', content: 'list files in current folder' }
    ] }) });
    check('model emits ```cmd block', rs.status === 200 && /```(cmd|sh|bash|shell)\s*\n[\s\S]+?```/.test(rs.body.content || ''), (rs.body.content || '').slice(0, 100));

    // bad stored key → clear upstream error, then restore default
    rs = await j(`${B}/api/ai/config`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'gsk_invalid_key_for_test_000' }) });
    check('custom key accepted+stored', rs.status === 200 && rs.body.keySource === 'settings');
    rs = await j(`${B}/api/ai/chat`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) });
    check('invalid key → 502 with groq error', rs.status === 502 && typeof rs.body.error === 'string' && rs.body.error.length > 0, `${rs.status}`);
    rs = await j(`${B}/api/ai/config`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ key: '' }) });
    check('key removal falls back to default', rs.status === 200 && rs.body.keySource === 'default');

    } finally {
        try { require('fs').unlinkSync(CFG_PATH); } catch (e) {}
    }

    // ═══ 4.0: tasks, scheduler, push, share-upload ═══
    console.log('═══ 4.0: tasks / scheduler / push / share-target ═══');

    rs = await j(`${B}/api/tasks`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'API task', cmd: 'echo TASK_HELLO; sleep 0.2; echo TASK_DONE' }) });
    check('task create', rs.status === 200 && !!rs.body.id);
    const taskId = rs.body.id;
    await sleep(1400);
    rs = await j(`${B}/api/tasks`, { headers: H });
    const trow = (rs.body.tasks || []).find((t) => t.id === taskId);
    check('task finished with output tail', !!trow && trow.alive === false && trow.exitCode === 0 && trow.tail.includes('TASK_HELLO') && trow.tail.includes('TASK_DONE'));
    rs = await j(`${B}/api/tasks/${taskId}/log`, { headers: H });
    check('task log endpoint', rs.status === 200 && rs.body.log.includes('TASK_DONE'));
    rs = await j(`${B}/api/tasks/${taskId}/rerun`, { method: 'POST', headers: H });
    check('task rerun', rs.status === 200 && rs.body.id !== taskId);
    rs = await j(`${B}/api/tasks`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: '' }) });
    check('task empty cmd rejected', rs.status === 400);
    check('tasks require auth', (await j(`${B}/api/tasks`)).status === 401);

    // interactive task: prompt detection + stdin input
    rs = await j(`${B}/api/tasks`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'interactive', cmd: `printf 'Password: '; read -r p; echo "GOT=$p"`, notify: false }) });
    const interId = rs.body.id;
    let waited = null;
    for (let i = 0; i < 30 && !waited; i++) {
        await sleep(400);
        const tl = await j(`${B}/api/tasks`, { headers: H });
        waited = (tl.body.tasks || []).find((t) => t.id === interId && t.waiting);
    }
    check('task prompt detected (waiting=true)', !!waited, waited ? '' : 'never flagged waiting');
    rs = await j(`${B}/api/tasks/${interId}/input`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'hunter2\n' }) });
    check('task input accepted', rs.status === 200 && rs.body.success);
    let gotIt = false;
    for (let i = 0; i < 20 && !gotIt; i++) {
        await sleep(300);
        const lg = await j(`${B}/api/tasks/${interId}/log`, { headers: H });
        gotIt = (lg.body.log || '').includes('GOT=hunter2');
    }
    check('interactive task consumed stdin', gotIt);
    rs = await j(`${B}/api/tasks/${interId}/input`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x\n' }) });
    check('input to finished task rejected', rs.status === 400);

    /* ── 5.1.1: live-connection notifications (WS mirror of push events) ──
       Web Push rides FCM, which is unreachable on some networks; every server
       alert must ALSO reach open host tabs over the existing WS connections. */
    console.log('── 5.1.1: live WS notifications (push-service fallback) ──');
    const nTab = 'gk-notify-tab';
    const nHost = await wsConnect(`?tabId=${nTab}&auth=${TOK}`);
    await waitCtrl(nHost.msgs, 'init');
    const nHost2 = await wsConnect(`?tabId=${nTab}&auth=${TOK}`);
    await waitCtrl(nHost2.msgs, 'init');
    rs = await j(`${B}/api/share/create`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ tabId: nTab, mode: 'readonly' }) });
    const nViewer = await wsConnect(`?shareToken=${rs.body.token}`);
    await waitCtrl(nViewer.msgs, 'init');

    const notifyFrames = (msgs, tag) => {
        const out = [];
        for (const m of msgs) {
            if (m.charCodeAt(0) !== 0) continue;
            try { const p = JSON.parse(m.slice(1)); if (p.type === 'notify' && p.tag === tag) out.push(p); } catch (e) {}
        }
        return out;
    };
    const waitNotifyCount = async (msgs, tag, minCount, timeout = 10000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const frames = notifyFrames(msgs, tag);
            if (frames.length >= minCount) return frames;
            await sleep(150);
        }
        return notifyFrames(msgs, tag);
    };

    /* task completion → live notify (no push subscription involved) */
    rs = await j(`${B}/api/tasks`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'notify-finish', cmd: 'echo NF_DONE' }) });
    const finId = rs.body.id;
    let frames = await waitNotifyCount(nHost.msgs, 'task:' + finId, 1, 6000);
    check('task completion mirrored to live WS clients', frames.length >= 1 && /Task finished/.test(frames[0].title) && frames[0].body.includes('notify-finish'));
    frames = await waitNotifyCount(nHost2.msgs, 'task:' + finId, 1, 2000);
    check('every host connection receives the alert', frames.length >= 1);
    await sleep(400);
    check('viewers never receive task alerts (host-private)', notifyFrames(nViewer.msgs, 'task:' + finId).length === 0);

    /* waiting task → needs-input alert carrying the prompt line, reminders
       while still stuck, and re-alert on a SECOND prompt episode */
    rs = await j(`${B}/api/tasks`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'notify-wait', cmd: `printf 'Password: '; read -r p; printf 'Token: '; read -r t; echo NW_DONE` }) });
    const waitId = rs.body.id;
    frames = await waitNotifyCount(nHost.msgs, 'taskwait:' + waitId, 1, 10000);
    check('waiting task alerts live clients without push', frames.length >= 1 && /needs input/i.test(frames[0].title));
    check('waiting alert shows the actual prompt line', frames.length >= 1 && frames[0].body.includes('Password:'));
    frames = await waitNotifyCount(nHost.msgs, 'taskwait:' + waitId, 2, 9000);
    check('still-waiting task re-alerts (reminder)', frames.length >= 2 && /still needs input/i.test(frames[frames.length - 1].title));

    rs = await j(`${B}/api/tasks/${waitId}/input`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'hunter2\n' }) });
    check('answer accepted for waiting task', rs.status === 200 && rs.body.success);
    const beforeEpisode2 = notifyFrames(nHost.msgs, 'taskwait:' + waitId).length;
    frames = await waitNotifyCount(nHost.msgs, 'taskwait:' + waitId, beforeEpisode2 + 1, 10000);
    check('second prompt episode re-notifies (flag reset on output)', frames.length > beforeEpisode2 && frames[frames.length - 1].body.includes('Token:'));

    rs = await j(`${B}/api/tasks/${waitId}/kill`, { method: 'POST', headers: H });
    check('waiting task killed cleanly', rs.status === 200);
    nHost.ws.close(); nHost2.ws.close(); nViewer.ws.close();

    // rename onto itself = no-op success
    require('fs').writeFileSync('/tmp/gk-rename-self.txt', 'x');
    rs = await j(`${B}/api/files/rename`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '/tmp/gk-rename-self.txt', newName: 'gk-rename-self.txt' }) });
    check('rename onto itself is a no-op success', rs.status === 200 && rs.body.noop === true);
    require('fs').unlinkSync('/tmp/gk-rename-self.txt');

    rs = await j(`${B}/api/schedules`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'API sched', cmd: 'echo S', when: { type: 'interval', everyMin: 5 } }) });
    check('schedule create', rs.status === 200 && !!rs.body.schedule.id && !!rs.body.schedule.nextRun);
    const schId = rs.body.schedule.id;
    rs = await j(`${B}/api/schedules/${schId}/run`, { method: 'POST', headers: H });
    check('schedule run-now spawns task', rs.status === 200 && !!rs.body.taskId);
    rs = await j(`${B}/api/schedules/${schId}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
    check('schedule toggle', rs.status === 200 && rs.body.schedule.enabled === false);
    rs = await j(`${B}/api/schedules`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', cmd: 'y', when: { type: 'daily', at: '99:99' } }) });
    check('schedule bad time rejected', rs.status === 400);
    rs = await j(`${B}/api/schedules/${schId}`, { method: 'DELETE', headers: H });
    check('schedule delete', rs.status === 200);

    rs = await j(`${B}/api/push/vapid`, { headers: H });
    check('vapid keys served', rs.status === 200 && rs.body.supported === true && (rs.body.publicKey || '').length > 40);
    rs = await j(`${B}/api/push/subscribe`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: { endpoint: 'https://push.test/ep1', keys: { p256dh: 'a', auth: 'b' } } }) });
    check('push subscribe stored', rs.status === 200 && rs.body.count === 1);
    rs = await j(`${B}/api/push/status`, { headers: H });
    check('push status', rs.status === 200 && rs.body.count === 1);
    rs = await j(`${B}/api/push/subscribe`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: { endpoint: 'nope' } }) });
    check('push bad subscription rejected', rs.status === 400);
    rs = await j(`${B}/api/push/unsubscribe`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: 'https://push.test/ep1' }) });
    check('push unsubscribe', rs.status === 200 && rs.body.count === 0);

    rs = await j(`${B}/api/triggers/sync`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ triggers: [{ id: 't1', name: 'err', pattern: 'error', push: true }, { id: 'bad' }] }) });
    check('trigger sync filters invalid', rs.status === 200 && rs.body.count === 1);

    // share-target upload authenticated by httpOnly cookie only
    const loginRes = await fetch(`${B}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: '20090228' }) });
    const setCookie = loginRes.headers.get('set-cookie') || '';
    check('login sets httpOnly session cookie', /gk_session=/.test(setCookie) && /HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie));
    const fd = new FormData();
    fd.append('files', new Blob(['shared via sheet']), 'share_e2e.txt');
    const shareRes = await fetch(`${B}/share-upload`, { method: 'POST', headers: { Cookie: setCookie.split(';')[0] }, body: fd });
    const shareHtml = await shareRes.text();
    check('share-upload works via cookie', shareRes.status === 200 && shareHtml.includes('Uploaded'));
    const inboxFile = require('path').join(require('os').homedir(), 'GarudaUploads', 'share_e2e.txt');
    check('shared file landed in inbox', require('fs').existsSync(inboxFile));
    require('fs').rmSync(require('path').join(require('os').homedir(), 'GarudaUploads'), { recursive: true, force: true });
    const fd2 = new FormData();
    fd2.append('files', new Blob(['x']), 'no.txt');
    check('share-upload rejects anon', (await fetch(`${B}/share-upload`, { method: 'POST', body: fd2 })).status === 401);

    // ═══ 5.0: model catalog, TTS/STT proxies, task tail cap ═══
    console.log('═══ 5.0: models / speech / transcription ═══');
    rs = await j(`${B}/api/ai/models`, { headers: H });
    check('model catalog served', rs.status === 200 && rs.body.models.some((m) => m.id === 'openai/gpt-oss-120b') && rs.body.models.some((m) => m.id === 'openai/gpt-oss-20b') && rs.body.models.some((m) => m.id === 'qwen/qwen3.8-27b'));
    check('tts voices + stt models listed', rs.body.tts.voices.length >= 4 && rs.body.stt.models.includes('whisper-large-v3-turbo'));
    /* 5.1.3: the catalog must track upstream — Groq retired the original eight
       Orpheus voices (tara/leah/…), which made every TTS & MP3-export request
       fail with "voice must be one of the following voices: […]". */
    check('tts catalog is the current upstream voice set', ['autumn', 'diana', 'hannah', 'austin', 'daniel', 'troy'].every((v) => rs.body.tts.voices.includes(v)));
    check('tts catalog dropped the retired voices', !rs.body.tts.voices.some((v) => ['tara', 'leah', 'jordan', 'kyle', 'carlos', 'annie', 'matthew', 'nicole'].includes(v)));

    // STT round-trip with a silent wav (plumbing test)
    const mkWav = () => {
        const b = Buffer.alloc(44 + 32000);
        b.write('RIFF', 0); b.writeUInt32LE(36 + 32000, 4); b.write('WAVE', 8); b.write('fmt ', 12);
        b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24);
        b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(32000, 40);
        return b;
    };
    const fdw = new FormData();
    fdw.append('file', new Blob([mkWav()], { type: 'audio/wav' }), 'silent.wav');
    const wr = await fetch(`${B}/api/ai/transcribe`, { method: 'POST', headers: { Authorization: 'Bearer ' + TOK }, body: fdw });
    const wj = await wr.json();
    check('whisper proxy round-trip', wr.status === 200 && typeof wj.text === 'string', `${wr.status}`);

    // ═══ 5.1: file-manager transcription (server-side whisper on real audio) ═══
    console.log('═══ 5.1: files/transcribe ═══');
    const fixturePath = require('path').join(__dirname, 'fixtures', 'voice-sample.mp3');
    rs = await j(`${B}/api/files/transcribe?path=${encodeURIComponent(fixturePath)}`, { headers: H });
    check('files/transcribe hears the real spoken fixture', rs.status === 200 && /fox|brown|lazy/i.test((rs.body && rs.body.text) || ''), `${rs.status} ${JSON.stringify(rs.body).slice(0, 140)}`);
    rs = await j(`${B}/api/files/transcribe?path=${encodeURIComponent(require('path').join(__dirname, '..', 'server.js'))}`, { headers: H });
    check('files/transcribe rejects non-audio', rs.status === 400);
    rs = await j(`${B}/api/files/transcribe?path=${encodeURIComponent('/nope/missing-file.mp3')}`, { headers: H });
    check('files/transcribe 404s for missing file', rs.status === 404);
    rs = await j(`${B}/api/files/transcribe?path=${encodeURIComponent(fixturePath)}`);
    check('files/transcribe requires auth', rs.status === 401);

    /* TTS: either audio (terms accepted) or a descriptive upstream error — never
       a crash. 'tara' is a RETIRED legacy voice: the server must map it onto the
       current catalog instead of forwarding it (that forward was the MP3 bug —
       upstream answered "voice must be one of the following voices"). */
    const sr = await fetch(`${B}/api/ai/speech`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hello', voice: 'tara' }) });
    if (sr.status === 200) {
        const ab = Buffer.from(await sr.arrayBuffer());
        check('legacy voice "tara" maps onto the catalog and returns audio', ab.length > 500 && (sr.headers.get('content-type') || '').includes('audio'));
    } else {
        const sj = await sr.json();
        check('legacy voice speech fails gracefully (never a voice/format rejection)', sr.status === 502 && /terms|error/i.test(sj.error || '') && !/voice must be one of/i.test(sj.error || '') && !/response_format/i.test(sj.error || ''), sj.error);
    }
    const sr2r = await fetch(`${B}/api/ai/speech`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hello', voice: 'diana' }) });
    if (sr2r.status === 200) {
        const ab2 = Buffer.from(await sr2r.arrayBuffer());
        check('current-catalog voice returns audio (wav)', ab2.length > 500 && (sr2r.headers.get('content-type') || '').includes('audio'));
    } else {
        const sj2 = await sr2r.json();
        check('current-catalog voice fails gracefully (never a voice/format rejection)', sr2r.status === 502 && !/voice must be one of/i.test(sj2.error || '') && !/response_format/i.test(sj2.error || ''), sj2.error);
    }
    rs = await j(`${B}/api/ai/speech`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '' }) });
    check('speech rejects empty text', rs.status === 400);

    // task tail capped in the polled list
    rs = await j(`${B}/api/tasks`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'bigout', cmd: 'head -c 6000 /dev/zero | tr "\\0" "x"; echo END_MARK', notify: false }) });
    const bigId = rs.body.id;
    await sleep(1500);
    rs = await j(`${B}/api/tasks`, { headers: H });
    const bigRow = (rs.body.tasks || []).find((t) => t.id === bigId);
    check('polled task tail capped small', !!bigRow && bigRow.tail.length <= 1400, bigRow && String(bigRow.tail.length));
    rs = await j(`${B}/api/tasks/${bigId}/log`, { headers: H });
    check('full log still complete', (rs.body.log || '').includes('END_MARK'));

    // rate limit check (8/min): do 9 wrong logins quickly
    let limited = false;
    for (let i = 0; i < 10; i++) {
        const rr = await j(`${B}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x' }) });
        if (rr.status === 429) { limited = true; break; }
    }
    check('login rate limiting kicks in', limited);

    host.ws.close();
    host2.ws.close();
    await sleep(200);


    /* ── 5.2: layouts, file editor, process manager, stats history, replay share, tab health ── */
    console.log('── 5.2: saved layouts CRUD ──');
    const z52_JH = Object.assign({ 'Content-Type': 'application/json' }, H);
    const z52_l1 = await j(`${B}/api/layouts`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ name: 'Test Layout', tabs: [{ tabId: 't1', title: 'web', color: '#ff0000' }], split: { mode: 'v', focus: 0 }, active: 0 }) });
    check('layout save returns enriched snapshot', z52_l1.status === 200 && z52_l1.body.layout && z52_l1.body.layout.id === 'test-layout' && Array.isArray(z52_l1.body.layout.tabs) && 'cwd' in z52_l1.body.layout.tabs[0]);
    const z52_l2 = await j(`${B}/api/layouts`, { headers: H });
    check('layout list contains saved layout', z52_l2.status === 200 && (z52_l2.body.layouts || []).some((l) => l.id === 'test-layout'));
    const z52_l2b = await j(`${B}/api/layouts`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ name: '' }) });
    check('layout save rejects empty name', z52_l2b.status === 400);
    const z52_l3 = await j(`${B}/api/layouts/test-layout`, { method: 'DELETE', headers: H });
    const z52_l4 = await j(`${B}/api/layouts`, { headers: H });
    check('layout delete removes it', z52_l3.status === 200 && !(z52_l4.body.layouts || []).some((l) => l.id === 'test-layout'));

    console.log('── 5.2: file editor write (atomic + .bak + conflict) ──');
    const z52_w1 = await j(`${B}/api/files/write`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ path: 'gk-edit-test.txt', content: 'hello v1' }) });
    check('write creates a new file', z52_w1.status === 200 && z52_w1.body.success === true);
    const z52_r1 = await j(`${B}/api/files/content?path=gk-edit-test.txt`, { headers: H });
    check('written content reads back', z52_r1.body && z52_r1.body.content === 'hello v1');
    const z52_w2 = await j(`${B}/api/files/write`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ path: 'gk-edit-test.txt', content: 'hello v2' }) });
    check('overwrite succeeds and reports backup', z52_w2.status === 200 && !!z52_w2.body.backup);
    const z52_rb = await j(`${B}/api/files/content?path=gk-edit-test.txt.bak`, { headers: H });
    check('.bak holds the previous generation', z52_rb.body && z52_rb.body.content === 'hello v1');
    const z52_w3 = await j(`${B}/api/files/write`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ path: 'gk-edit-test.txt', content: 'stale', mtime: 1 }) });
    check('stale mtime → 409 conflict', z52_w3.status === 409);
    const z52_w4 = await j(`${B}/api/files/write`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ path: 'gk-edit-test.txt', content: 'forced', mtime: 1, force: true }) });
    check('force overwrites a conflict', z52_w4.status === 200);
    const z52_w5 = await j(`${B}/api/files/write`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ path: '/', content: 'x' }) });
    check('protected path refused (403)', z52_w5.status === 403);
    const z52_w6 = await j(`${B}/api/files/write`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ path: 'gk-no-dir/x.txt', content: 'x' }) });
    check('missing parent dir → 404', z52_w6.status === 404);
    await j(`${B}/api/files/delete`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ path: 'gk-edit-test.txt' }) });
    await j(`${B}/api/files/delete`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ path: 'gk-edit-test.txt.bak' }) });

    console.log('── 5.2: process manager guards ──');
    const z52_p1 = await j(`${B}/api/processes`, { headers: H });
    check('process list returns rows', z52_p1.status === 200 && Array.isArray(z52_p1.body.processes) && z52_p1.body.processes.length > 0);
    const z52_p2 = await j(`${B}/api/processes/kill`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ pid: 1 }) });
    check('kill refuses pid 1', z52_p2.status === 403);
    const z52_p3 = await j(`${B}/api/processes/kill`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ pid: process.pid }) });
    check('kill refuses the server ancestor chain', z52_p3.status === 403);
    const z52_p4 = await j(`${B}/api/processes/nice`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ pid: 1, value: 5 }) });
    check('renice refuses pid 1', z52_p4.status === 403);
    const z52_p4b = await j(`${B}/api/processes/nice`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ pid: 1234567, value: 5 }) });
    check('renice refuses unknown pid', z52_p4b.status === 403);
    const z52_sleeper = require('child_process').spawn('sleep', ['30'], { stdio: 'ignore' });
    await sleep(400);
    const z52_p5 = await j(`${B}/api/processes/kill`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ pid: z52_sleeper.pid, signal: 'TERM' }) });
    check('kill terminates a real process', z52_p5.status === 200);
    await sleep(400);
    await new Promise((r) => { z52_sleeper.on('exit', r); setTimeout(r, 1500); }); // reap so /proc forgets it
    const z52_p6 = await j(`${B}/api/processes/kill`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ pid: z52_sleeper.pid }) });
    check('kill on a reaped pid refused', z52_p6.status === 403 || z52_p6.status === 404);

    console.log('── 5.2: stats history + replay share ──');
    const z52_h1 = await j(`${B}/api/stats/history`, { headers: H });
    check('stats history ring served (authed)', z52_h1.status === 200 && Array.isArray(z52_h1.body.ring) && typeof z52_h1.body.tickMs === 'number');
    const z52_rs = await j(`${B}/api/replay/share`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ title: 'demo', events: [{ t: 0, d: 'hello' }, { t: 100, d: ' world' }] }) });
    check('replay share creates token + url', z52_rs.status === 200 && z52_rs.body.token && z52_rs.body.url.includes('/replay.html?r='));
    const z52_rp = await j(`${B}/api/replay/${z52_rs.body.token}`);
    check('replay readable WITHOUT auth (token = capability)', z52_rp.status === 200 && z52_rp.body.events.length === 2 && z52_rp.body.title === 'demo');
    const z52_rq = await j(`${B}/api/replay/replay_deadbeefdeadbeef`);
    check('unknown replay token → 404', z52_rq.status === 404);
    const z52_rhtml = await fetch(`${B}/replay.html`);
    check('public player page served', z52_rhtml.status === 200 && (await z52_rhtml.text()).includes('Garuda Konsole'));
    const z52_rbad = await j(`${B}/api/replay/share`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ events: [{ t: 'x' }] }) });
    check('bad event shape rejected', z52_rbad.status === 400);
    const z52_rnoauth = await j(`${B}/api/replay/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: [{ t: 0, d: 'x' }] }) });
    check('replay share requires auth', z52_rnoauth.status === 401 || z52_rnoauth.status === 403);

    console.log('── 5.2: tab health badge push (busy loop → z52_hot → ctrl-c → ok) ──');
    const z52_hws = await wsConnect(`?tabId=health1&auth=${TOK}&cols=80&rows=24`);
    const z52_hinit = await waitCtrl(z52_hws.msgs, 'init', 4000);
    check('health tab session starts', !!z52_hinit);
    z52_hws.ws.send(JSON.stringify({ type: 'input', data: 'end=$((SECONDS+8)); while [ $SECONDS -lt $end ]; do :; done\n' })); // stub pty = pipes: no SIGINT from ^C, so spin with a self-terminating loop
    // cursor-based wait: skip the initial ok transition, wait for a hot push
    const waitHealth52 = (from, level, timeout) => new Promise((resolve) => {
        const t0 = Date.now();
        let cur = from;
        const iv = setInterval(() => {
            for (let i = cur; i < z52_hws.msgs.length; i++) {
                const m = z52_hws.msgs[i];
                if (m.charCodeAt(0) === 0) {
                    try {
                        const p = JSON.parse(m.slice(1));
                        if (p.type === 'tab-health' && p.level === level) { clearInterval(iv); return resolve({ msg: p, at: i + 1 }); }
                    } catch (e) {}
                }
            }
            cur = z52_hws.msgs.length;
            if (Date.now() - t0 > timeout) { clearInterval(iv); resolve(null); }
        }, 100);
    });
    const z52_hot = await waitHealth52(z52_hws.msgs.length, 'hot', 25000);
    check('busy loop triggers hot badge push', !!z52_hot && z52_hot.msg.tabId === 'health1' && z52_hot.msg.cpu >= 50, z52_hot ? JSON.stringify(z52_hot.msg) : 'no hot push');
    const z52_ok = await waitHealth52(z52_hot ? z52_hot.at : 0, 'ok', 30000); // loop ends by itself → ok push
    check('idle clears the badge (ok push)', !!z52_ok);
    z52_hws.ws.close();
    await sleep(300);


    console.log('── 5.2.1: recording library (~/Rec_jsonl) ──');
    const z521_save = await j(`${B}/api/recordings`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ title: 'api rec', chunks: [{ t: 0, d: 'hello\r\n' }, { t: 50, d: 'world\r\n' }] }) });
    check('recording saved into ~/Rec_jsonl', z521_save.status === 200 && /^garuda-replay-.*\.jsonl$/.test(z521_save.body.name || '') && String(z521_save.body.dir).endsWith('Rec_jsonl'));
    const z521_list = await j(`${B}/api/recordings`, { headers: H });
    check('library lists the recording', z521_list.status === 200 && (z521_list.body.recordings || []).some((r) => r.name === z521_save.body.name));
    const z521_get = await j(`${B}/api/recordings/${z521_save.body.name}`, { headers: H });
    check('recording reads back with header + chunks', z521_get.status === 200 && z521_get.body.chunks.length === 2 && z521_get.body.title === 'api rec');
    const z521_trav = await j(`${B}/api/recordings/..%2F..%2Fetc%2Fpasswd`, { headers: H });
    check('path traversal in name refused', z521_trav.status === 400 || z521_trav.status === 404);
    const z521_big = await j(`${B}/api/recordings`, { method: 'POST', headers: z52_JH, body: JSON.stringify({ chunks: [] }) });
    check('empty recording rejected', z521_big.status === 400);
    const z521_del = await j(`${B}/api/recordings/${z521_save.body.name}`, { method: 'DELETE', headers: H });
    const z521_list2 = await j(`${B}/api/recordings`, { headers: H });
    check('delete removes the file', z521_del.status === 200 && !(z521_list2.body.recordings || []).some((r) => r.name === z521_save.body.name));


    console.log('── 5.3: remote desktop (status, ws auth, stream, echo input) ──');
    const z53_st = await j(`${B}/api/rd/status`, { headers: H });
    check('rd status shape', z53_st.status === 200 && 'capture' in z53_st.body && 'input' in z53_st.body && typeof z53_st.body.enabled === 'boolean' && typeof z53_st.body.width === 'number');
    const z53_noauth = await j(`${B}/api/rd/status`);
    check('rd status requires auth', z53_noauth.status === 401 || z53_noauth.status === 403);

    // second server with fixture capture + echo input (sandbox has no compositor/ffmpeg)
    const RD_PORT = '3197';
    const rdSrv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: Object.assign({}, process.env, {
            PORT: RD_PORT, KONSOLE_LOGIN_LIMIT: '100000',
            GK_RD_CAPTURE_FILE: path.join(__dirname, 'fixtures', 'rd-test.webm'),
            GK_RD_MIME: 'video/webm; codecs=vp8',
            GK_RD_INPUT: 'echo'
        }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const RDB = `http://localhost:${RD_PORT}`;
    for (let i = 0; i < 60; i++) { try { const r = await fetch(RDB + '/healthz'); if (r.ok) break; } catch (e) {} await sleep(150); }
    const z53_login = await j(`${RDB}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: '20090228' }) });
    const z53_tok = z53_login.body && z53_login.body.token;
    const z53_st2 = await j(`${RDB}/api/rd/status`, { headers: { Authorization: `Bearer ${z53_tok}` } });
    check('rd status reports file capture + echo input', z53_st2.body.capture === 'file' && z53_st2.body.input === 'echo');

    const rdWsUnauth = await new Promise((resolve) => {
        const w = new WebSocket(`ws://localhost:${RD_PORT}/ws/rd?auth=bogus`);
        w.on('close', (code) => resolve(code));
        w.on('error', () => resolve('err'));
        setTimeout(() => resolve('timeout'), 4000);
    });
    check('rd socket rejects bad auth', rdWsUnauth === 4401 || rdWsUnauth === 'err');

    const rdWs = await new Promise((resolve) => {
        const w = new WebSocket(`ws://localhost:${RD_PORT}/ws/rd?auth=${z53_tok}`);
        const st = { ws: w, msgs: [], bin: 0, binBytes: 0, meta: null };
        w.on('message', (d) => {
            if (typeof d === 'string' || d[0] === 0 || (d.byteLength === undefined)) {
                const str = d.toString ? d.toString() : String(d);
                st.msgs.push(str);
                if (str.charCodeAt(0) === 0) { try { const p = JSON.parse(str.slice(1)); if (p.type === 'rd-meta') st.meta = p; } catch (e) {} }
            } else { st.bin++; st.binBytes += d.byteLength || d.length; }
        });
        w.binaryType = 'arraybuffer';
        w.on('open', () => resolve(st));
        w.on('error', () => resolve(null));
    });
    check('rd socket connects with token', !!rdWs);
    if (rdWs) {
        let meta = rdWs.meta;
        for (let i = 0; i < 40 && !meta; i++) { await sleep(100); meta = rdWs.meta; }
        check('rd-meta announces mime + backends', !!meta && /video\/webm/.test(meta.mime) && meta.capture === 'file' && meta.input === 'echo');
        for (let i = 0; i < 60 && rdWs.binBytes < 20000; i++) await sleep(100);
        check('media bytes stream over the socket', rdWs.binBytes > 20000, rdWs.binBytes + ' bytes');
        rdWs.ws.send(JSON.stringify({ type: 'rd-pointer', x: 0.5, y: 0.5, button: 0, down: true }));
        let echoed = null;
        for (let i = 0; i < 40 && !echoed; i++) {
            await sleep(80);
            for (const m of rdWs.msgs) if (m.charCodeAt(0) === 0 && m.includes('rd-input-echo')) { echoed = JSON.parse(m.slice(1)); break; }
        }
        check('input event round-trips (echo backend)', !!echoed && echoed.ev && echoed.ev.x === 0.5);
        rdWs.ws.close();
    }
    await sleep(400);
    rdSrv.kill();

    console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
    if (serverProc) serverProc.kill();
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH:', e); if (serverProc) serverProc.kill(); process.exit(2); });
