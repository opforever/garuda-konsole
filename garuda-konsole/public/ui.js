/* ═══════════════════════════════════════════════════════════════
   Garuda Konsole 2.0 — UI Systems (ui.js)
   Toasts · Palette · Files · Stats · Share · Macros · Mobile deck
   Auroras · Boot sequence · Context menus · Modals
   Loaded right after app.js. Relies on core globals from app.js.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ─────────────── Toasts ─────────────── */

const TOAST_ICONS = { success: '#i-check', error: '#i-alert', warn: '#i-alert', info: '#i-info' };

function showToast(opts) {
    const o = (typeof opts === 'string') ? { text: opts } : (opts || {});
    const container = $('toast-container');
    if (!container) return null;

    if (o.id) {
        const existing = container.querySelector(`.toast[data-id="${o.id}"]`);
        if (existing) existing.remove();
    }

    while (container.children.length >= 4) container.removeChild(container.firstElementChild);

    const type = ['success', 'error', 'warn', 'info'].includes(o.type) ? o.type : 'info';
    const duration = o.duration || 4200;
    const toast = el('div', `toast ${type}`);
    if (o.id) toast.dataset.id = o.id;
    toast.innerHTML = `
        <span class="toast-ic"><svg class="ic"><use href="${TOAST_ICONS[type]}"></use></svg></span>
        <div class="toast-text">${o.title ? `<strong>${escHtml(o.title)}</strong>` : ''}${o.text ? `<span>${escHtml(o.text)}</span>` : ''}</div>
        <button class="toast-close" aria-label="Dismiss">×</button>
        <div class="toast-progress" style="animation-duration:${duration}ms"></div>`;
    toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
    container.appendChild(toast);

    toast._timer = setTimeout(() => dismissToast(toast), duration);
    if (!o.silent && (type === 'success' || type === 'error')) playUI(type);
    return toast;
}

function dismissToast(toast) {
    if (!toast || toast._gone) return;
    toast._gone = true;
    clearTimeout(toast._timer);
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 320);
}

/* ─────────────── Prompt / Confirm dialogs ─────────────── */

let promptResolver = null;
let confirmResolver = null;

function showPrompt(opts) {
    const o = opts || {};
    return new Promise((resolve) => {
        const modal = $('prompt-modal');
        if (!modal) { resolve(null); return; }
        promptResolver = resolve;
        $('prompt-title').textContent = o.title || 'Enter value';
        const msg = $('prompt-message');
        msg.textContent = o.message || '';
        msg.classList.toggle('hidden', !o.message);
        const input = $('prompt-input');
        input.value = o.value || '';
        input.placeholder = o.placeholder || '';
        const ok = $('prompt-ok');
        ok.textContent = o.okLabel || 'OK';
        modal.classList.remove('hidden');
        setTimeout(() => { input.focus(); input.select(); }, 60);
    });
}
function resolvePromptOk() {
    const input = $('prompt-input');
    const v = input ? input.value : '';
    $('prompt-modal').classList.add('hidden');
    if (promptResolver) { const r = promptResolver; promptResolver = null; r(v); }
}
function resolvePromptCancel() {
    const modal = $('prompt-modal');
    if (modal) modal.classList.add('hidden');
    if (promptResolver) { const r = promptResolver; promptResolver = null; r(null); }
}

function showConfirm(opts) {
    const o = opts || {};
    return new Promise((resolve) => {
        const modal = $('confirm-modal');
        if (!modal) { resolve(true); return; }
        confirmResolver = resolve;
        $('confirm-title').textContent = o.title || 'Are you sure?';
        $('confirm-message').textContent = o.message || '';
        $('confirm-ok').textContent = o.okLabel || 'Confirm';
        modal.classList.remove('hidden');
    });
}
function resolveConfirmOk() {
    $('confirm-modal').classList.add('hidden');
    if (confirmResolver) { const r = confirmResolver; confirmResolver = null; r(true); }
}
function resolveConfirmCancel() {
    const modal = $('confirm-modal');
    if (modal) modal.classList.add('hidden');
    if (confirmResolver) { const r = confirmResolver; confirmResolver = null; r(false); }
}

/* ─────────────── Ripple & micro FX ─────────────── */

function spawnRipple(target, ev) {
    if (document.body.classList.contains('reduce-motion')) return;
    try {
        const rect = target.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = (ev && ev.clientX ? ev.clientX - rect.left : rect.width / 2) - size / 2;
        const y = (ev && ev.clientY ? ev.clientY - rect.top : rect.height / 2) - size / 2;
        const span = el('span', 'ripple');
        span.style.width = span.style.height = size + 'px';
        span.style.left = x + 'px';
        span.style.top = y + 'px';
        const prevOverflow = target.style.overflow;
        target.style.overflow = 'hidden';
        target.appendChild(span);
        span.addEventListener('animationend', () => { span.remove(); target.style.overflow = prevOverflow; });
    } catch (e) {}
}

/* ─────────────── Aurora canvas ─────────────── */

let aurora = { canvas: null, ctx: null, particles: [], raf: null, running: false, colors: { a: '61,174,233', b: '155,89,182' } };

function initAurora() {
    const canvas = $('aurora-canvas');
    if (!canvas || !canvas.getContext) return;
    aurora.canvas = canvas;
    aurora.ctx = canvas.getContext('2d');
    window.addEventListener('resize', debounce(() => { sizeAurora(); seedAurora(); }, 250));
    sizeAurora();
    seedAurora();
    refreshAuroraColors();
    refreshAuroraMotion();
}

function sizeAurora() {
    if (!aurora.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    aurora.canvas.width = Math.floor(window.innerWidth * dpr);
    aurora.canvas.height = Math.floor(window.innerHeight * dpr);
    aurora.dpr = dpr;
}

function seedAurora() {
    const area = window.innerWidth * window.innerHeight;
    const count = clamp(Math.floor(area / 17000), 26, 84);
    aurora.particles = [];
    for (let i = 0; i < count; i++) {
        aurora.particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            vx: (Math.random() - 0.5) * 0.32,
            vy: (Math.random() - 0.5) * 0.32,
            r: Math.random() * 1.7 + 0.5,
            hue: Math.random() < 0.5 ? 'a' : 'b'
        });
    }
}

function refreshAuroraColors() {
    try {
        const cs = getComputedStyle(document.documentElement);
        const accent = (cs.getPropertyValue('--accent') || '#3daee9').trim();
        const accent2 = (cs.getPropertyValue('--accent-2') || '#9b59b6').trim();
        const a = hexToRgb(accent), b = hexToRgb(accent2);
        if (a) aurora.colors.a = `${a.r},${a.g},${a.b}`;
        if (b) aurora.colors.b = `${b.r},${b.g},${b.b}`;
    } catch (e) {}
}

function refreshAuroraMotion() {
    /* The aurora is lockscreen ambience. Once unlocked it sits behind the
       opaque terminal UI — animating it there burns CPU/GPU every frame
       (an O(n²) particle-link pass + full-canvas repaint) for pixels nobody
       can see. So it runs ONLY while the lockscreen is visible and motion
       isn't reduced; otherwise the loop is cancelled and the canvas is
       display:none so it isn't even composited. */
    const lockEl = $('lockscreen');
    const lockVisible = !lockEl || !lockEl.classList.contains('hidden');
    const want = lockVisible && !document.body.classList.contains('reduce-motion');
    if (!want) {
        aurora.running = false;
        if (aurora.raf) cancelAnimationFrame(aurora.raf);
        aurora.raf = null;
        if (aurora.ctx && aurora.canvas) aurora.ctx.clearRect(0, 0, aurora.canvas.width, aurora.canvas.height);
        if (aurora.canvas) aurora.canvas.style.display = 'none';
    } else {
        if (aurora.canvas) aurora.canvas.style.display = '';
        if (!aurora.running) {
            aurora.running = true;
            auroraLoop();
        }
    }
}

function auroraLoop() {
    if (!aurora.running || !aurora.ctx) return;
    aurora.raf = requestAnimationFrame(auroraLoop);
    if (document.hidden) return;
    const { ctx, canvas, particles } = aurora;
    const dpr = aurora.dpr || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
    }
    /* links */
    ctx.lineWidth = 0.6;
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const a = particles[i], b = particles[j];
            const dx = a.x - b.x, dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 12100) {
                const alpha = (1 - d2 / 12100) * 0.16;
                ctx.strokeStyle = `rgba(${aurora.colors.a},${alpha})`;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }
    }
    /* dots */
    for (const p of particles) {
        ctx.fillStyle = `rgba(${aurora.colors[p.hue]},0.5)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
    }
}

/* ─────────────── Boot sequence ─────────────── */

let bootActive = false;
let bootTimers = [];

const BOOT_LINES = [
    { html: '<span class="boot-acc">Garuda Konsole v' + APP_VERSION + '</span> <span class="boot-dim">— secure command center</span>', d: 240 },
    { html: '<span class="boot-dim">›</span> verifying session token <span class="boot-dim">..............</span> <span class="boot-acc">[ ok ]</span>', d: 200 },
    { html: '<span class="boot-dim">›</span> attaching persistent shell bridge <span class="boot-dim">....</span> <span class="boot-acc">[ ok ]</span>', d: 220 },
    { html: '<span class="boot-dim">›</span> replaying scrollback buffer <span class="boot-dim">..........</span> <span class="boot-acc">[ ok ]</span>', d: 200 },
    { html: '<span class="boot-dim">›</span> calibrating neon matrix <span class="boot-dim">..............</span> <span class="boot-acc">[ ok ]</span>', d: 240 },
    { html: '<span class="boot-dim">›</span> arming live-share antenna <span class="boot-dim">............</span> <span class="boot-acc">[ ok ]</span>', d: 200 },
    { html: '<span class="boot-dim">›</span> indexing command palette <span class="boot-dim">.............</span> <span class="boot-acc">[ ok ]</span>', d: 200 },
    { html: '<span class="boot-acc">✓ all systems nominal — welcome back, commander</span>', d: 320 }
];

function isBootActive() { return bootActive; }

function playBootSequence() {
    const overlay = $('boot-overlay');
    const linesEl = $('boot-lines');
    const bar = $('boot-bar');
    if (!overlay || !linesEl) return;
    bootActive = true;
    overlay.classList.remove('hidden', 'fade-out');
    linesEl.innerHTML = '';
    if (bar) bar.style.width = '0%';

    const finish = () => {
        if (!bootActive) return;
        bootActive = false;
        bootTimers.forEach(clearTimeout);
        bootTimers = [];
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.classList.add('hidden'), 480);
    };
    bootSkipFn = finish;
    overlay.onclick = finish;
    overlay.onpointerdown = finish; // any button (incl. right-click) skips — never swallow input

    let delay = 180;
    BOOT_LINES.forEach((line, i) => {
        bootTimers.push(setTimeout(() => {
            if (!bootActive) return;
            const div = el('div', 'boot-line', line.html);
            div.style.animation = 'fade-in 0.25s ease';
            linesEl.appendChild(div);
            if (bar) bar.style.width = Math.round(((i + 1) / BOOT_LINES.length) * 100) + '%';
            if (i === BOOT_LINES.length - 1) bootTimers.push(setTimeout(finish, 550));
        }, delay));
        delay += line.d;
    });
}

function skipBoot() {
    if (bootSkipFn) bootSkipFn();
}

/* ─────────────── Clock & status chips ─────────────── */

function startClock() {
    const tick = () => {
        const chip = $('clock-chip');
        if (chip) {
            const d = new Date();
            chip.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
        }
    };
    tick();
    setInterval(tick, 1000);
    onFontSizeChanged(defaultFontSize());
}

function onFontSizeChanged(size) {
    const chip = $('font-chip');
    if (chip) chip.textContent = size + 'px';
    const slider = $('setting-font-size');
    if (slider && document.activeElement !== slider) slider.value = size;
    const val = $('font-size-value');
    if (val) val.textContent = size + 'px';
}

/* ─────────────── System monitor ─────────────── */

let cpuHistory = [];
let statsTimer = null;
let lastStats = null;

function startStatsPoller() {
    loadStats();
    if (statsTimer) clearInterval(statsTimer);
    statsTimer = setInterval(() => {
        if (document.hidden || !token || isViewerSession) return;
        loadStats();
        if (typeof refreshMonitorExtras === 'function') refreshMonitorExtras();
    }, 4000);
}

async function loadStats(force) {
    if (!token || isViewerSession) return;
    const drawerOpen = $('stats-drawer') && !$('stats-drawer').classList.contains('hidden');
    if (!force && !drawerOpen && document.hidden) return;
    try {
        const s = await api('/api/stats');
        lastStats = s;
        cpuHistory.push(s.cpu.usage);
        if (cpuHistory.length > 90) cpuHistory.shift();

        const cpuChip = $('cpu-chip');
        if (cpuChip) cpuChip.textContent = `cpu ${Math.round(s.cpu.usage)}%`;
        const memChip = $('mem-chip');
        if (memChip) memChip.textContent = `mem ${Math.round((s.mem.used / s.mem.total) * 100)}%`;

        if (!drawerOpen) return;
        $('stat-cpu-pct').textContent = Math.round(s.cpu.usage);
        $('stat-cpu-cores').textContent = `${s.cpu.cores} cores`;
        const memPct = Math.round((s.mem.used / s.mem.total) * 100);
        $('stat-mem-text').textContent = `${fmtBytes(s.mem.used)} / ${fmtBytes(s.mem.total)} (${memPct}%)`;
        const memBar = $('stat-mem-bar');
        memBar.style.width = memPct + '%';
        memBar.classList.toggle('over', memPct > 88);

        if (s.disk && s.disk.total > 0) {
            const diskBlock = $('stat-disk-block');
            if (diskBlock) diskBlock.classList.remove('hidden');
            const usedPct = Math.round((s.disk.used / s.disk.total) * 100);
            $('stat-disk-text').textContent = `${fmtBytes(s.disk.used)} / ${fmtBytes(s.disk.total)} (${usedPct}%)`;
            const diskBar = $('stat-disk-bar');
            diskBar.style.width = usedPct + '%';
            diskBar.classList.toggle('over', usedPct > 90);
        } else {
            const diskBlock = $('stat-disk-block');
            if (diskBlock) diskBlock.classList.add('hidden');
        }

        $('stat-load').textContent = s.cpu.load.map((l) => l.toFixed(2)).join(' · ');
        $('stat-uptime').textContent = fmtUptime(s.uptime);
        $('stat-sessions').textContent = String(s.sessions);
        $('stat-viewers').textContent = String(s.viewers);
        $('stat-hostname').textContent = s.hostname;
        $('stat-cpu-model').textContent = s.cpu.model;
        $('stat-platform').textContent = `${s.platform} · node ${s.nodeVersion}`;
        drawSparkline();
    } catch (e) { /* silent — chips keep last value */ }
}

function drawSparkline() {
    const canvas = $('cpu-spark');
    if (!canvas || !canvas.getContext) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 68;
    if (canvas.width !== Math.floor(w * dpr)) canvas.width = Math.floor(w * dpr);
    if (canvas.height !== Math.floor(h * dpr)) canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cs = getComputedStyle(document.documentElement);
    const accent = (cs.getPropertyValue('--accent') || '#3daee9').trim();
    const rgb = hexToRgb(accent) || { r: 61, g: 174, b: 233 };

    /* grid */
    ctx.strokeStyle = 'rgba(125,145,175,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        const y = (h / 4) * i;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    if (cpuHistory.length < 2) return;

    const stepX = w / (90 - 1);
    const startIdx = Math.max(0, cpuHistory.length - 90);
    const pts = cpuHistory.slice(startIdx).map((v, i) => [
        (i + (90 - cpuHistory.length)) * stepX,
        h - 3 - (clamp(v, 0, 100) / 100) * (h - 8)
    ]);

    /* area */
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.34)`);
    grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0.02)`);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], h);
    pts.forEach((p) => ctx.lineTo(p[0], p[1]));
    ctx.lineTo(pts[pts.length - 1][0], h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    /* line */
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.95)`;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},0.8)`;
    ctx.shadowBlur = 7;
    ctx.stroke();
    ctx.shadowBlur = 0;

    /* last dot */
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last[0], last[1], 2.8, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
}

function toggleStats() {
    if (isViewerSession) { showToast({ type: 'info', title: 'Host only', text: 'The system monitor belongs to the host session.' }); return; }
    const drawer = $('stats-drawer');
    if (!drawer) return;
    const opening = drawer.classList.contains('hidden');
    closeDrawer('files-drawer');
    closeDrawer('ai-drawer');
    drawer.classList.toggle('hidden', !opening);
    if (opening) { loadStats(true); setTimeout(drawSparkline, 60); }
}

/* ─────────────── Drawers (generic) ─────────────── */

function closeDrawer(id) {
    const d = $(id);
    if (d) d.classList.add('hidden');
}
function closeDrawerIfOpen() {
    let closed = false;
    ['stats-drawer', 'files-drawer', 'chat-drawer', 'activity-drawer', 'ai-drawer', 'tasks-drawer', 'rd-drawer'].forEach((id) => {
        const d = $(id);
        if (d && !d.classList.contains('hidden')) { d.classList.add('hidden'); closed = true; }
    });
    return closed;
}

/* ─────────────── File manager ─────────────── */

let filesRequestedPath = null;  // null = shell cwd
let filesCurrentPath = null;
let filesHomePath = null;
let filesEntries = [];
let filesSort = 'name';
let filesUpPath = null;
let previewPath = null;
let filesView = storeGet('gk_files_view', 'list');
let filesSelMode = false;
let filesSelected = new Set();

const CODE_EXT = new Set(['js', 'ts', 'jsx', 'tsx', 'py', 'c', 'h', 'cpp', 'hpp', 'rs', 'go', 'java', 'kt', 'sh', 'bash', 'fish', 'zsh', 'json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'html', 'htm', 'css', 'scss', 'md', 'txt', 'log', 'xml', 'sql', 'php', 'rb', 'pl', 'lua', 'vim', 'el', 'service', 'env', 'gitignore', 'dockerfile']);
const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);
const ARCH_EXT = new Set(['zip', 'tar', 'gz', 'tgz', 'xz', 'bz2', '7z', 'rar', 'zst', 'iso', 'pkg', 'deb', 'rpm', 'apk', 'jar']);

function fileIconFor(entry) {
    if (entry.dir) return entry.link ? '#i-link' : '#i-folder';
    if (entry.link) return '#i-link';
    const ext = (entry.name.split('.').pop() || '').toLowerCase();
    if (entry.exec) return '#i-zap';
    if (IMG_EXT.has(ext)) return '#i-image';
    if (ARCH_EXT.has(ext)) return '#i-archive';
    if (CODE_EXT.has(ext) || ext === '' ) return '#i-code';
    return '#i-file';
}

function getFilesCurrentPath() { return filesCurrentPath; }
function getFilesHome() { return filesHomePath || null; }

function toggleFiles() {
    if (isViewerSession) { showToast({ type: 'info', title: 'Host only', text: 'Spectators cannot browse the server files.' }); return; }
    const drawer = $('files-drawer');
    if (!drawer) return;
    const opening = drawer.classList.contains('hidden');
    closeDrawer('stats-drawer');
    closeDrawer('ai-drawer');
    drawer.classList.toggle('hidden', !opening);
    if (opening) loadFiles();
}

function filesNavigate(path) {
    filesRequestedPath = path;
    loadFiles();
}

async function loadFiles(showSkeleton) {
    const list = $('files-list');
    const status = $('files-status');
    if (!list) return;
    if (!token) return;
    if (showSkeleton !== false) {
        list.innerHTML = '<div class="files-skeleton">' + '<div class="skel-row"></div>'.repeat(7) + '</div>';
        if (status) status.textContent = 'loading…';
    }
    try {
        const qs = filesRequestedPath
            ? `?path=${encodeURIComponent(filesRequestedPath)}`
            : `?tabId=${encodeURIComponent(activeTabId || '')}`;
        const data = await api('/api/files' + qs);
        filesCurrentPath = data.path;
        filesHomePath = data.home || '/';
        filesUpPath = data.parent;
        filesEntries = data.entries || [];
        renderFilesCrumbs(data.path);
        renderFilesList();
        const total = filesEntries.reduce((s, e) => s + (e.dir ? 0 : e.size || 0), 0);
        if (status) {
            status.textContent = `${filesEntries.length} item${filesEntries.length === 1 ? '' : 's'} · ${fmtBytes(total)}${filesRequestedPath ? '' : ' · shell cwd'} · ${fmtAgo(Date.now())}`;
        }
    } catch (err) {
        if (list) {
            list.innerHTML = `<div class="files-empty"><svg class="ic"><use href="#i-alert"></use></svg><span>${escHtml(err.message || 'Failed to load folder')}</span></div>`;
        }
        if (status) status.textContent = '';
        if (!err.network) showToast({ type: 'error', title: 'Files', text: err.message });
    }
}

function renderFilesCrumbs(absPath) {
    const box = $('files-crumbs');
    if (!box) return;
    box.innerHTML = '';
    const parts = absPath.split('/').filter(Boolean);
    const mkCrumb = (label, path, isCurrent) => {
        const c = el('span', isCurrent ? 'crumb crumb-current' : 'crumb');
        c.textContent = label;
        if (!isCurrent && path) {
            c.addEventListener('click', () => filesNavigate(path));
        }
        return c;
    };
    box.appendChild(mkCrumb('/', '/', parts.length === 0));
    let acc = '';
    parts.forEach((part, i) => {
        acc += '/' + part;
        const sep = el('span', 'crumb-sep', '/');
        box.appendChild(sep);
        box.appendChild(mkCrumb(part, acc, i === parts.length - 1));
    });
    box.scrollTop = box.scrollHeight;
}

function sortEntries(entries) {
    const sorted = entries.slice();
    sorted.sort((a, b) => {
        if (a.dir !== b.dir) return a.dir ? -1 : 1;
        switch (filesSort) {
            case 'size': return (b.size || 0) - (a.size || 0);
            case 'mtime': return (b.mtime || 0) - (a.mtime || 0);
            case 'type': {
                const ea = (a.name.split('.').pop() || '').toLowerCase();
                const eb = (b.name.split('.').pop() || '').toLowerCase();
                return ea.localeCompare(eb) || a.name.localeCompare(b.name);
            }
            default: return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        }
    });
    return sorted;
}

function syncFilesViewBtn() {
    const b = $('files-view-btn');
    if (b) b.innerHTML = filesView === 'grid'
        ? '<svg class="ic ic-sm"><use href="#i-list"></use></svg> List'
        : '<svg class="ic ic-sm"><use href="#i-grid"></use></svg> Grid';
    const sb = $('files-select-btn');
    if (sb) sb.classList.toggle('toggled', filesSelMode);
}

function setFilesSelMode(on) {
    filesSelMode = !!on;
    if (!filesSelMode) filesSelected.clear();
    syncFilesViewBtn();
    renderFilesList();
}

function updateFilesSelbar() {
    const bar = $('files-selbar');
    const cnt = $('files-sel-count');
    if (!bar) return;
    bar.classList.toggle('hidden', !(filesSelMode && filesSelected.size >= 0 && filesSelMode));
    if (cnt) cnt.textContent = `${filesSelected.size} selected`;
    if (!filesSelMode) bar.classList.add('hidden');
}

async function bulkDownloadSelected() {
    const paths = Array.from(filesSelected);
    if (!paths.length || !token) return;
    showToast({ type: 'info', title: `Downloading ${paths.length} file(s)…`, duration: 2500 });
    for (const p of paths) {
        const a = el('a');
        a.href = `/download?path=${encodeURIComponent(p)}&auth=${encodeURIComponent(token)}`;
        a.download = '';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 600);
        await new Promise((r) => setTimeout(r, 350));
    }
}

async function bulkDeleteSelected() {
    const paths = Array.from(filesSelected);
    if (!paths.length) return;
    const ok = await showConfirm({ title: `Delete ${paths.length} item(s)?`, message: paths.slice(0, 6).map((p) => p.split('/').pop()).join(', ') + (paths.length > 6 ? '…' : ''), okLabel: 'Delete all' });
    if (!ok) return;
    let done = 0, failed = 0;
    for (const p of paths) {
        try { await api('/api/files/delete', { method: 'POST', body: { path: p } }); done++; } catch (e) { failed++; }
    }
    showToast(failed ? { type: 'warn', title: `Deleted ${done}, ${failed} failed` } : { type: 'success', title: `Deleted ${done} item(s)` });
    logActivity(failed ? 'warn' : 'success', `Bulk delete: ${done} item(s)${failed ? `, ${failed} failed` : ''}`);
    filesSelected.clear();
    loadFiles(false);
}

function renderFilesList() {
    const list = $('files-list');
    if (!list) return;
    list.innerHTML = '';
    list.classList.toggle('grid-view', filesView === 'grid');
    updateFilesSelbar();
    syncFilesViewBtn();
    if (!filesEntries.length) {
        list.innerHTML = `<div class="files-empty"><svg class="ic"><use href="#i-folder"></use></svg><span>This folder is empty</span><button class="btn-mini" data-action="files-upload"><svg class="ic ic-sm"><use href="#i-upload"></use></svg> Upload something</button></div>`;
        return;
    }
    const frag = document.createDocumentFragment();
    sortEntries(filesEntries).forEach((entry, i) => {
        const full = joinPath(filesCurrentPath, entry.name);
        const row = el('div', 'file-row' + (entry.dir ? ' is-dir' : '') + (entry.link ? ' is-link' : '') + (entry.name.startsWith('.') ? ' is-hidden-file' : ''));
        row.dataset.path = full;
        row.dataset.name = entry.name;
        row.dataset.dir = entry.dir ? '1' : '';
        row.style.animationDelay = Math.min(i * 14, 280) + 'ms';
        row.title = full;

        const metaParts = entry.dir
            ? (entry.link ? 'symlink · folder' : 'folder')
            : `${fmtBytes(entry.size)}${entry.exec ? ' · exec' : ''}${entry.link ? ' · link' : ''}`;

        let actions = '';
        if (!entry.dir) {
            actions += `<button class="icon-btn" data-action="file-download" data-path="${escHtml(full)}" title="Download"><svg class="ic"><use href="#i-download"></use></svg></button>`;
            actions += `<button class="icon-btn" data-action="files-edit" data-path="${escHtml(full)}" title="Edit in browser"><svg class="ic"><use href="#i-edit"></use></svg></button>`;
            actions += `<button class="icon-btn" data-action="fileshare-open" data-path="${escHtml(full)}" title="Share via expiring public link"><svg class="ic"><use href="#i-ext-link"></use></svg></button>`;
        } else {
            actions += `<button class="icon-btn" data-action="file-cd" data-path="${escHtml(full)}" title="cd here in terminal"><svg class="ic"><use href="#i-corner"></use></svg></button>`;
        }
        if (!entry.dir && AUDIO_EXT_CLIENT.has(String(entry.name.split('.').pop() || '').toLowerCase())) {
            actions += `<button class="icon-btn" data-action="file-transcribe" data-path="${escHtml(full)}" data-name="${escHtml(entry.name)}" title="Transcribe audio (Whisper)"><svg class="ic"><use href="#i-chat"></use></svg></button>`;
        }
        actions += `<button class="icon-btn" data-action="file-details" data-path="${escHtml(full)}" title="Details"><svg class="ic"><use href="#i-info"></use></svg></button>`;
        actions += `<button class="icon-btn" data-action="file-rename" data-path="${escHtml(full)}" data-name="${escHtml(entry.name)}" title="Rename"><svg class="ic"><use href="#i-edit"></use></svg></button>`;
        actions += `<button class="icon-btn del" data-action="file-delete" data-path="${escHtml(full)}" data-name="${escHtml(entry.name)}" data-dir="${entry.dir ? '1' : ''}" title="Delete"><svg class="ic"><use href="#i-trash"></use></svg></button>`;

        const ext = (entry.name.split('.').pop() || '').toLowerCase();
        const thumbable = !entry.dir && IMG_EXT_UI.has(ext) && (entry.size || 0) < 12 * 1024 * 1024;
        const checked = filesSelected.has(full);
        row.classList.toggle('selected', checked);
        const inner = filesView === 'grid' && thumbable
            ? `<img class="file-thumb" loading="lazy" alt="" src="/download?path=${encodeURIComponent(full)}&auth=${encodeURIComponent(token || '')}">`
            : `<span class="file-ic"><svg class="ic"><use href="${fileIconFor(entry)}"></use></svg></span>`;
        row.innerHTML = `
            ${filesSelMode ? `<span class="file-check">${checked ? '✓' : ''}</span>` : ''}
            ${inner}
            <div class="file-main">
                <span class="file-name">${escHtml(entry.name)}</span>
                <span class="file-meta"><span>${escHtml(metaParts)}</span><span>${escHtml(entry.mtime ? fmtAgo(entry.mtime) : '')}</span></span>
            </div>
            <div class="file-actions">${actions}</div>`;
        frag.appendChild(row);
    });
    list.appendChild(frag);
}

function joinPath(base, name) {
    if (!base) return name;
    return base.endsWith('/') ? base + name : base + '/' + name;
}

function shellQuote(p) {
    return `'${String(p).replace(/'/g, `'\\''`)}'`;
}

async function actionFileDownload(node) {
    const p = node.dataset.path;
    if (!p || !token) return;
    window.open(`/download?path=${encodeURIComponent(p)}&auth=${encodeURIComponent(token)}`, '_blank');
}

async function actionFileCd(node) {
    const p = node.dataset.path;
    if (!p) return;
    const ok = runCommandInActiveTab('cd ' + shellQuote(p));
    if (ok) showToast({ type: 'success', title: 'Sent to terminal', text: 'cd ' + p, duration: 2600 });
}

async function actionFileRename(node) {
    const p = node.dataset.path;
    const oldName = node.dataset.name || '';
    const newName = await showPrompt({ title: 'Rename', message: oldName, value: oldName, okLabel: 'Rename' });
    if (!newName || newName === oldName) return;
    try {
        await api('/api/files/rename', { method: 'POST', body: { path: p, newName } });
        showToast({ type: 'success', title: 'Renamed', text: `${oldName} → ${newName}` });
        loadFiles(false);
    } catch (err) {
        showToast({ type: 'error', title: 'Rename failed', text: err.message });
    }
}

async function actionFileDelete(node) {
    const p = node.dataset.path;
    const name = node.dataset.name || p;
    const isDir = node.dataset.dir === '1';
    const ok = await showConfirm({
        title: `Delete ${isDir ? 'folder' : 'file'}?`,
        message: `"${name}" will be permanently removed${isDir ? ' with everything inside it' : ''}.`,
        okLabel: 'Delete'
    });
    if (!ok) return;
    try {
        await api('/api/files/delete', { method: 'POST', body: { path: p } });
        showToast({ type: 'success', title: 'Deleted', text: name });
        loadFiles(false);
    } catch (err) {
        showToast({ type: 'error', title: 'Delete failed', text: err.message });
    }
}

async function actionFilesMkdir() {
    if (!filesCurrentPath) { showToast({ type: 'warn', title: 'Open a folder first' }); return; }
    const name = await showPrompt({ title: 'New folder', message: `Inside ${filesCurrentPath}`, placeholder: 'folder-name', okLabel: 'Create' });
    if (!name || !name.trim()) return;
    try {
        await api('/api/files/mkdir', { method: 'POST', body: { dir: filesCurrentPath, name: name.trim() } });
        showToast({ type: 'success', title: 'Folder created', text: name.trim() });
        loadFiles(false);
    } catch (err) {
        showToast({ type: 'error', title: 'Could not create folder', text: err.message });
    }
}

/* ─────────────── 5.4: universal Preview Studio ───────────────
   One modal, every openable type: images, audio, video, pdf, markdown,
   json, csv/tsv tables, sandboxed html, docx (docx-preview), xlsx/xls/ods
   (SheetJS), zip listings (fflate), font specimens, text/code with line
   numbers, and a hex dump as the universal binary fallback.
   Mobile: the sheet goes fullscreen; body scrolls internally; header and
   footer are fixed rows — nothing overlaps (column flex, min-height:0). */
const PV_EXT = {
    image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'],
    audio: ['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus'],
    video: ['mp4', 'webm', 'ogv', 'ogg', 'mov', 'm4v', 'mkv', 'avi'],
    pdf: ['pdf'],
    md: ['md', 'markdown', 'mdown'],
    json: ['json', 'jsonl', 'ndjson'],
    csv: ['csv', 'tsv'],
    html: ['html', 'htm', 'xhtml'],
    docx: ['docx'],
    sheet: ['xlsx', 'xls', 'ods'],
    zip: ['zip'],
    font: ['ttf', 'otf', 'woff', 'woff2']
};
function pvKind(path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    for (const k of Object.keys(PV_EXT)) if (PV_EXT[k].includes(ext)) return k;
    return 'probe'; // unknown → text probe → hex fallback
}
function pvAuthUrl(path) { return `/download?path=${encodeURIComponent(path)}&auth=${encodeURIComponent(token || '')}`; }
function pvDyn(tag, cls) { const n = el(tag, 'pv-dyn ' + (cls || '')); $('preview-body').appendChild(n); return n; }
function pvClearBody() {
    const img = $('preview-image'); const pre = $('preview-content');
    if (img) { img.classList.add('hidden'); img.removeAttribute('src'); img.classList.remove('pv-zoomed'); }
    if (pre) { pre.classList.add('hidden'); pre.textContent = ''; }
    const body = $('preview-body');
    if (body) body.querySelectorAll('.pv-dyn').forEach((n) => n.remove());
    const zb = $('preview-zoom-btn'); if (zb) zb.classList.add('hidden');
    const ed = $('preview-edit-btn'); if (ed) ed.classList.add('hidden');
}
function pvHeader(kind, editable) {
    const chip = $('preview-type'); if (chip) chip.textContent = String(kind).toUpperCase();
    const ed = $('preview-edit-btn'); if (ed) ed.classList.toggle('hidden', !editable);
}
function pvMeta(path, size, mtime, extra) {
    const m = $('preview-meta');
    if (!m) return;
    const parts = [];
    if (size != null && !isNaN(size)) parts.push(fmtBytes(size));
    if (mtime) parts.push(new Date(mtime).toLocaleString());
    if (extra) parts.push(extra);
    parts.push(path);
    m.textContent = parts.join(' · ');
    m.title = path;
}
function pvNote(text, icon) {
    const d = pvDyn('div', 'pv-note');
    d.innerHTML = `<svg class="ic"><use href="${icon || '#i-info'}"></use></svg><span></span>`;
    d.querySelector('span').textContent = text;
    return d;
}
function mdToHtml(src) {
    let h = escHtml(src);
    h = h.replace(/```([\s\S]*?)```/g, (m, c) => `<pre class="pv-code">${c}</pre>`);
    h = h.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>').replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>')
         .replace(/^####\s+(.*)$/gm, '<h4>$1</h4>').replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
         .replace(/^##\s+(.*)$/gm, '<h2>$1</h2>').replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
    h = h.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');
    h = h.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
    h = h.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');
    h = h.replace(/^(-{3,}|_{3,})$/gm, '<hr/>');
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    h = h.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    h = h.replace(/\n{2,}/g, '</p><p>');
    return '<p>' + h + '</p>';
}
function csvParse(text, sep) {
    const rows = []; let row = []; let cur = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
            else cur += c;
        } else if (c === '"') q = true;
        else if (c === sep) { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (c !== '\r') cur += c;
    }
    row.push(cur); rows.push(row);
    return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}
function jsonHighlight(src) {
    const h = escHtml(src);
    return h.replace(/(&quot;(?:[^&\\]|\\.)*&quot;)(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g,
        (m, str, colon, kw) => {
            if (str) return colon ? `<span class="pv-jk">${str}</span>${colon}` : `<span class="pv-js">${str}</span>`;
            if (kw) return `<span class="pv-jb">${kw}</span>`;
            return `<span class="pv-jn">${m}</span>`;
        });
}
function pvRenderText(content, truncated) {
    const pre = $('preview-content');
    pre.classList.remove('hidden');
    pre.innerHTML = '';
    const code = document.createElement('code');
    code.textContent = (content || '(empty file)') + (truncated ? '\n\n… truncated at 512 KB …' : '');
    pre.appendChild(code);
}
function pvRenderHex(buf) {
    const pre = $('preview-content');
    pre.classList.remove('hidden');
    const u8 = new Uint8Array(buf);
    const lines = [];
    for (let off = 0; off < u8.length; off += 16) {
        const slice = u8.subarray(off, Math.min(off + 16, u8.length));
        const hex = Array.from(slice).map((b) => b.toString(16).padStart(2, '0')).join(' ');
        const asc = Array.from(slice).map((b) => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
        lines.push(off.toString(16).padStart(8, '0') + '  ' + hex.padEnd(47) + '  |' + asc + '|');
    }
    pre.textContent = lines.join('\n') + (u8.length >= 65536 ? '\n\n… hex view capped at 64 KB …' : '');
}
async function pvFetchBytes(path, cap) {
    const res = await fetch(pvAuthUrl(path), { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    if (!res.ok) throw new Error('fetch failed ' + res.status);
    if (cap) {
        const reader = res.body ? res.body.getReader() : null;
        if (reader) {
            const chunks = []; let n = 0;
            for (;;) { const r = await reader.read(); if (r.done) break; chunks.push(r.value); n += r.value.length; if (n >= cap) break; }
            const out = new Uint8Array(Math.min(n, cap)); let o = 0;
            for (const c of chunks) { out.set(c.subarray(0, Math.min(c.length, out.length - o)), o); o += Math.min(c.length, out.length - o); if (o >= cap) break; }
            return out.buffer;
        }
    }
    const ab = await res.arrayBuffer();
    return cap ? ab.slice(0, cap) : ab;
}
async function openPreviewStudio(path, entryOpt) {
    const modal = $('preview-modal');
    if (!modal) return;
    previewPath = path;
    const nameEl = $('preview-name');
    if (nameEl) nameEl.textContent = path.split('/').pop() || path;
    setPreviewDownloadVisible(true);
    pvClearBody();
    modal.classList.remove('hidden');
    const kind = pvKind(path);
    let meta = entryOpt || null;
    if (!meta || meta.size == null) { try { meta = await api('/api/files/stat?path=' + encodeURIComponent(path)); } catch (e) { meta = meta || {}; } }
    pvMeta(path, meta && meta.size, meta && meta.mtime, kind !== 'probe' ? kind : '');
    const url = pvAuthUrl(path);

    if (kind === 'image') {
        pvHeader('image', false);
        const img = $('preview-image');
        img.classList.remove('hidden');
        img.src = url;
        const zb = $('preview-zoom-btn'); if (zb) zb.classList.remove('hidden');
        return;
    }
    if (kind === 'audio') {
        pvHeader('audio', false);
        const wrap = pvDyn('div', 'pv-media');
        wrap.innerHTML = `<svg class="ic pv-media-ic"><use href="#i-chat"></use></svg>`;
        const a = document.createElement('audio');
        a.controls = true; a.src = url; a.className = 'pv-audio';
        wrap.appendChild(a);
        a.onerror = () => pvNote('This browser cannot decode this audio codec — use Download.', '#i-alert');
        return;
    }
    if (kind === 'video') {
        pvHeader('video', false);
        const v = document.createElement('video');
        v.controls = true; v.playsInline = true; v.src = url; v.className = 'pv-dyn pv-video';
        $('preview-body').appendChild(v);
        v.onerror = () => pvNote('This browser cannot decode this container/codec (try mp4/webm) — use Download.', '#i-alert');
        return;
    }
    if (kind === 'pdf') {
        pvHeader('pdf', false);
        const f = document.createElement('iframe');
        f.className = 'pv-dyn pv-frame'; f.src = url + '#toolbar=1'; f.title = 'PDF preview';
        $('preview-body').appendChild(f);
        return;
    }
    if (kind === 'html') {
        pvHeader('html', true);
        const data = await api(`/api/files/content?path=${encodeURIComponent(path)}`).catch(() => null);
        if (!data || data.binary) { pvNote('Cannot read this HTML file.'); return; }
        const f = document.createElement('iframe');
        f.className = 'pv-dyn pv-frame'; f.sandbox = ''; f.srcdoc = data.content || '';
        $('preview-body').appendChild(f);
        return;
    }
    if (kind === 'md') {
        pvHeader('markdown', true);
        const data = await api(`/api/files/content?path=${encodeURIComponent(path)}`).catch(() => null);
        if (!data || data.binary) { pvNote('Cannot read this file as text.'); return; }
        const d = pvDyn('div', 'pv-md');
        d.innerHTML = mdToHtml(data.content || '');
        return;
    }
    if (kind === 'json') {
        pvHeader('json', true);
        const data = await api(`/api/files/content?path=${encodeURIComponent(path)}`).catch(() => null);
        if (!data || data.binary) { pvNote('Cannot read this file as text.'); return; }
        let pretty = data.content || '';
        try { pretty = JSON.stringify(JSON.parse(data.content), null, 2); } catch (e) {}
        const pre = $('preview-content');
        pre.classList.remove('hidden');
        pre.innerHTML = `<code>${jsonHighlight(pretty)}</code>`;
        return;
    }
    if (kind === 'csv') {
        pvHeader('csv', true);
        const data = await api(`/api/files/content?path=${encodeURIComponent(path)}`).catch(() => null);
        if (!data || data.binary) { pvNote('Cannot read this file as text.'); return; }
        const rows = csvParse(data.content || '', path.toLowerCase().endsWith('.tsv') ? '\t' : ',').slice(0, 800);
        const wrap = pvDyn('div', 'pv-tablewrap');
        const t = document.createElement('table');
        t.className = 'pv-table';
        rows.forEach((r, i) => {
            const tr = document.createElement('tr');
            r.forEach((c) => {
                const cell = document.createElement(i === 0 ? 'th' : 'td');
                cell.textContent = c;
                tr.appendChild(cell);
            });
            t.appendChild(tr);
        });
        wrap.appendChild(t);
        if (rows.length >= 800) pvNote('Showing first 800 rows.');
        return;
    }
    if (kind === 'docx') {
        pvHeader('docx', false);
        if (typeof window.docxPreview === 'undefined' && typeof window.docx === 'undefined') { pvNote('docx renderer not loaded (offline?) — use Download.', '#i-alert'); return; }
        try {
            const buf = await pvFetchBytes(path);
            const host = pvDyn('div', 'pv-docx');
            const lib = window.docxPreview || window.docx;
            await lib.renderAsync(buf, host); // 0.3.3 UMD crashes with extra args; wrapper styled via CSS
        } catch (e) { pvNote('docx render failed: ' + (e.message || e), '#i-alert'); }
        return;
    }
    if (kind === 'sheet') {
        pvHeader('sheet', false);
        if (typeof window.XLSX === 'undefined') { pvNote('Spreadsheet renderer not loaded (offline?) — use Download.', '#i-alert'); return; }
        try {
            const buf = await pvFetchBytes(path);
            const wb = window.XLSX.read(buf, { type: 'array' });
            const bar = pvDyn('div', 'pv-sheetbar');
            const sel = document.createElement('select');
            sel.className = 'select-mini';
            wb.SheetNames.forEach((n) => { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
            bar.appendChild(sel);
            const host = pvDyn('div', 'pv-tablewrap');
            const draw = (name) => {
                const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false }).slice(0, 800);
                host.innerHTML = '';
                const t = document.createElement('table'); t.className = 'pv-table';
                rows.forEach((r, i) => {
                    const tr = document.createElement('tr');
                    (r || []).forEach((c) => { const cell = document.createElement(i === 0 ? 'th' : 'td'); cell.textContent = String(c == null ? '' : c); tr.appendChild(cell); });
                    t.appendChild(tr);
                });
                host.appendChild(t);
            };
            sel.addEventListener('change', () => draw(sel.value));
            draw(wb.SheetNames[0]);
        } catch (e) { pvNote('Spreadsheet render failed: ' + (e.message || e), '#i-alert'); }
        return;
    }
    if (kind === 'zip') {
        pvHeader('zip', false);
        if (typeof window.fflate === 'undefined') { pvNote('Zip renderer not loaded (offline?) — use Download.', '#i-alert'); return; }
        try {
            const buf = await pvFetchBytes(path);
            const entries = window.fflate.unzipSync(new Uint8Array(buf)); // UMD unzip() is callback-style
            const list = pvDyn('div', 'pv-ziplist');
            const names = Object.keys(entries).sort();
            names.slice(0, 400).forEach((n) => {
                const row = document.createElement('div');
                row.className = 'pv-ziprow';
                const bytes = entries[n].length;
                row.innerHTML = `<span class="pv-zipname"></span><span class="pv-zipsize">${fmtBytes(bytes)}</span>`;
                row.querySelector('.pv-zipname').textContent = n;
                const ext = (n.split('.').pop() || '').toLowerCase();
                if (bytes < 2 * 1024 * 1024 && (PV_EXT.image.includes(ext) || ext === 'txt' || ext === 'md' || ext === 'json' || ext === 'csv' || ext === 'log')) {
                    row.classList.add('clickable');
                    row.addEventListener('click', () => {
                        const inner = list.querySelector('.pv-zipinner');
                        inner.innerHTML = '';
                        if (PV_EXT.image.includes(ext)) {
                            const blob = new Blob([entries[n]], { type: 'image/' + (ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext) });
                            const im = document.createElement('img'); im.className = 'pv-zipimg'; im.src = URL.createObjectURL(blob); inner.appendChild(im);
                        } else {
                            const pre = document.createElement('pre'); pre.className = 'pv-zippre';
                            pre.textContent = new TextDecoder().decode(entries[n]).slice(0, 200000);
                            inner.appendChild(pre);
                        }
                    });
                }
                list.appendChild(row);
            });
            const inner = document.createElement('div');
            inner.className = 'pv-zipinner';
            list.appendChild(inner);
            if (names.length > 400) pvNote('Showing first 400 entries.');
        } catch (e) { pvNote('Zip parse failed: ' + (e.message || e), '#i-alert'); }
        return;
    }
    if (kind === 'font') {
        pvHeader('font', false);
        try {
            const buf = await pvFetchBytes(path);
            const face = new FontFace('pv-font-' + Date.now(), buf);
            await face.load();
            const d = pvDyn('div', 'pv-font');
            d.style.fontFamily = `"${face.family}"`;
            d.innerHTML = '<div class="pv-font-lg">The quick brown fox jumps over the lazy dog 0123456789</div><div class="pv-font-sm">ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz !?@#&*()[]{}<>/*-+=$€£¥</div>';
        } catch (e) { pvNote('Font could not be parsed by this browser.', '#i-alert'); }
        return;
    }

    /* probe: text → rendered text/code; binary → hex dump */
    pvHeader('file', true);
    try {
        const data = await api(`/api/files/content?path=${encodeURIComponent(path)}`);
        if (!data.binary) {
            pvHeader((path.split('.').pop() || 'txt').toUpperCase().slice(0, 8), true);
            pvRenderText(data.content, data.truncated);
            return;
        }
        pvHeader('binary', false);
        const buf = await pvFetchBytes(path, 65536);
        pvRenderHex(buf);
        pvNote('Binary file — showing hex view. Use Download for the full file.');
    } catch (err) {
        pvHeader('error', false);
        pvNote('Preview failed: ' + (err.message || 'unknown error'), '#i-alert');
    }
}
async function previewFile(path) { return openPreviewStudio(path); }

function setPreviewDownloadVisible(on) {
    const dl = $('preview-download-btn');
    if (dl) dl.classList.toggle('hidden', !on);
}

function closePreview() {
    const modal = $('preview-modal');
    if (modal) modal.classList.add('hidden');
    if (typeof pvClearBody === 'function') pvClearBody();
    previewPath = null;
    stopTaskLogPoll();
    setPreviewDownloadVisible(true);
}

function downloadPreviewFile() {
    if (!previewPath || !token) return;
    window.open(`/download?path=${encodeURIComponent(previewPath)}&auth=${encodeURIComponent(token)}`, '_blank');
}

/* ─────────────── Command palette ─────────────── */

let paletteItems = [];
let paletteIndex = 0;

function paletteActionItems() {
    const tab = getActiveTab();
    const items = [
        { sec: 'Actions', icon: '#i-plus', title: 'New tab', sub: 'spawn a fresh shell', kw: 'terminal session create', run: () => createNewTab() },
        { sec: 'Actions', icon: '#i-x', title: 'Close current tab', sub: tab ? tab.title : '', kw: 'kill close exit', run: () => { if (activeTabId) closeTab(activeTabId); } },
        { sec: 'Actions', icon: '#i-edit', title: 'Rename current tab', kw: 'title label', run: () => { if (activeTabId) startRenameTab(activeTabId); } },
        { sec: 'Actions', icon: '#i-chev-right', title: 'Next tab', kw: 'switch cycle', run: () => cycleTab(1) },
        { sec: 'Actions', icon: '#i-chev-left', title: 'Previous tab', kw: 'switch cycle', run: () => cycleTab(-1) },
        { sec: 'Actions', icon: '#i-refresh', title: 'Clear screen', kw: 'cls reset scroll', run: clearTerminal },
        { sec: 'Actions', icon: '#i-search', title: 'Search terminal output', kw: 'find grep', run: openSearch },
        { sec: 'Actions', icon: '#i-save', title: 'Export scrollback as .log', kw: 'download save text', run: exportLog },
        { sec: 'Actions', icon: '#i-sparkle', title: 'AI Guide', sub: aiState.mode.toUpperCase() + ' mode — natural-language shell agent', kw: 'ai assistant agent groq automatic commands', run: toggleAi },
        { sec: 'Actions', icon: '#i-folder', title: 'Toggle file manager', kw: 'browser files upload download', run: toggleFiles },
        { sec: 'Actions', icon: '#i-activity', title: 'Toggle system monitor', kw: 'stats cpu memory', run: toggleStats },
        { sec: 'Actions', icon: '#i-split', title: splitState.mode ? `Split view: ${splitState.mode === 'v' ? 'side-by-side → stacked' : 'off'}` : 'Split view: side by side', sub: 'Alt+S cycles modes', kw: 'pane panes split vertical horizontal tiling', run: splitCycle },
        { sec: 'Actions', icon: '#i-split', title: 'Split with new tab', kw: 'pane new session', run: splitWithNewTab },
        { sec: 'Actions', icon: '#i-record', title: (getActiveTab() && getActiveTab().recording) ? 'Stop recording' : 'Record active tab output', kw: 'capture session video', run: () => toggleRecording() },
        { sec: 'Actions', icon: '#i-chev-left', title: 'Replay last 60 seconds', sub: 'instant ring-buffer rewind', kw: 'rewind recent history what happened', run: () => { const rec = getRingRecording(getActiveTab()); if (rec) openReplay(rec); else showToast({ type: 'info', title: 'Ring buffer empty' }); } },
        { sec: 'Actions', icon: '#i-rocket', title: 'Background tasks', sub: 'launch & monitor detached jobs', kw: 'task launcher background jobs detached', run: toggleTasks },
        { sec: 'Actions', icon: '#i-clock', title: 'Scheduler', sub: 'cron-like automations on the server', kw: 'cron timer schedule automate recurring', run: openSchedule },
        { sec: 'Actions', icon: '#i-play', title: 'Replay last recording', kw: 'playback video scrub', run: openReplay },
        { sec: 'Actions', icon: '#i-chat', title: 'Session chat', kw: 'message talk viewer pair', run: toggleChat },
        { sec: 'Actions', icon: '#i-list', title: 'Activity center & insights', kw: 'log history events', run: toggleActivity },
        { sec: 'Actions', icon: '#i-bell', title: 'Manage output triggers', kw: 'alerts regex watch error notify', run: openTriggers },
        { sec: 'Actions', icon: '#i-terminal', title: 'New tab with profile…', sub: 'choose shell, folder, name, color', kw: 'spawn create bash fish zsh', run: openProfileModal },
        { sec: 'Actions', icon: '#i-users', title: 'Live share this tab', kw: 'pair spectator watch', run: openShareModal },
        { sec: 'Actions', icon: '#i-play', title: 'Manage macros', kw: 'snippets commands', run: openMacros },
        { sec: 'Actions', icon: '#i-upload', title: 'Upload file to shell folder', kw: 'push send', run: triggerUpload },
        { sec: 'Actions', icon: '#i-download', title: 'Toggle Alt-Lock download mode', sub: isAltLocked ? 'currently ON' : 'currently OFF', kw: 'select text grab', run: () => toggleAltLock() },
        { sec: 'Actions', icon: '#i-maximize', title: 'Toggle fullscreen', kw: 'zoom screen', run: toggleFullScreen },
        { sec: 'Actions', icon: '#i-plus', title: 'Increase font size', kw: 'zoom bigger', run: () => changeFontSize(1) },
        { sec: 'Actions', icon: '#i-minimize', title: 'Decrease font size', kw: 'zoom smaller', run: () => changeFontSize(-1) },
        { sec: 'Actions', icon: '#i-palette', title: 'Surprise theme', kw: 'random color appearance', run: randomTheme },
        { sec: 'Actions', icon: '#i-sliders', title: 'Open settings', kw: 'preferences config theme', run: openSettings },
        { sec: 'Actions', icon: '#i-help', title: 'Help & shortcuts', kw: 'docs about', run: openHelp },
        { sec: 'Actions', icon: '#i-help', title: 'Take the onboarding tour', kw: 'guide welcome intro features', run: () => startTour() },
        { sec: 'Actions', icon: '#i-lock', title: 'Lock session', kw: 'logout signout password', run: lockSession }
    ];
    if (tab && tab.exited) {
        items.unshift({ sec: 'Actions', icon: '#i-power', title: 'Restart exited shell', sub: tab.title, kw: 'respawn revive', run: () => respawnSession(tab.id) });
    }
    return items;
}

function buildPaletteItems(query) {
    const q = (query || '').trim();
    const out = [];

    const pushScored = (item, matchText) => {
        const score = fuzzyScore(q, matchText);
        if (score >= 0) out.push({ item, score });
    };

    for (const a of paletteActionItems()) pushScored(a, `${a.title} ${a.kw || ''} ${a.sub || ''}`);
    for (const m of getMacros()) pushScored({ sec: 'Macros', icon: '#i-play', title: m.name, sub: m.cmd, kw: m.cmd, run: () => { runCommandInActiveTab(m.cmd); closePalette(); } }, `${m.name} ${m.cmd}`);
    pushScored({ sec: 'Voice', icon: '#i-chat', title: 'Read last output aloud', sub: 'text-to-speech', kw: 'speak tts voice read aloud output', run: () => { closePalette(); speakLastOutput(); } }, 'speak read aloud output tts');
    pushScored({ sec: 'Voice', icon: '#i-chat', title: 'Dictate a shell command', sub: 'voice → confirm → run', kw: 'voice dictation whisper command microphone', run: () => { closePalette(); aiMicToggle('cmd'); } }, 'voice dictate command whisper');
    pushScored({ sec: 'Voice', icon: '#i-download', title: 'Save last AI reply as audio (WAV)', sub: 'download spoken audio', kw: 'wav mp3 export download voice reply', run: () => { closePalette(); const it = aiState.ui.slice().reverse().find((i) => i.text); if (it) downloadTextAsMp3(it.text, it.id); else showToast({ type: 'info', title: 'No AI reply to export yet' }); } }, 'mp3 export reply voice');
    for (const r of getRecentCommands().slice(0, 40)) pushScored({ sec: 'Recent', icon: '#i-clock', title: r, sub: 'run again', kw: r, run: () => { runCommandInActiveTab(r); closePalette(); } }, r);
    /* 5.2: saved workspace layouts */
    pushScored({ sec: 'Actions', icon: '#i-split', title: 'Run in branch sandbox…', sub: 'disposable write layer over HOME', kw: 'sandbox bubblewrap branch overlay test safe', run: () => { closePalette(); openSandboxModal(); } }, 'sandbox branch bubblewrap run safe');
    pushScored({ sec: 'Actions', icon: '#i-monitor', title: 'Remote Desktop: open panel', sub: 'stream this machine\'s screen', kw: 'remote desktop vnc screen stream control', run: () => { closePalette(); toggleRd(); } }, 'remote desktop open panel');
    pushScored({ sec: 'Actions', icon: '#i-monitor', title: rdState.connected ? 'Remote Desktop: stop streaming' : 'Remote Desktop: connect', sub: 'screen + input + audio', kw: 'remote desktop connect stop stream', run: () => { closePalette(); const d = $('rd-drawer'); if (d && d.classList.contains('hidden')) toggleRd(); rdState.connected ? rdDisconnect() : rdConnect(); } }, 'remote desktop connect stop');
    pushScored({ sec: 'Layouts', icon: '#i-save', title: 'Save current layout…', sub: 'tabs + splits + colors', kw: 'layout save workspace snapshot arrange', run: () => { closePalette(); saveCurrentLayoutPrompt(); } }, 'save layout workspace snapshot');
    for (const r of recordingsCache.slice(0, 12)) {
        const rn = r.name.replace(/^garuda-replay-/, '').replace(/\.jsonl$/, '');
        pushScored({ sec: 'Recordings', icon: '#i-record', title: 'Play recording: ' + rn, sub: Math.round(r.size / 1024) + ' KB · saved', kw: 'recording replay open saved jsonl', run: () => { closePalette(); openSavedRecording(r.name); } }, 'play recording replay open ' + r.name);
        pushScored({ sec: 'Recordings', icon: '#i-trash', title: 'Delete recording: ' + rn, sub: 'remove from ~/Rec_jsonl', kw: 'recording delete remove', run: () => { closePalette(); deleteRecording(r.name); } }, 'delete recording ' + r.name);
    }
    for (const l of layoutsCache) {
        pushScored({ sec: 'Layouts', icon: '#i-split', title: 'Restore layout: ' + l.name, sub: `${l.tabs.length} tab(s)${l.split ? ' + split' : ''}`, kw: 'layout restore workspace', run: () => { closePalette(); restoreLayout(l); } }, 'restore layout ' + l.name);
        pushScored({ sec: 'Layouts', icon: '#i-trash', title: 'Delete layout: ' + l.name, sub: 'remove saved snapshot', kw: 'layout delete remove', run: () => { closePalette(); deleteLayout(l.id); } }, 'delete layout ' + l.name);
    }
    if (q) {
        for (const id of Object.keys(BUILTIN_THEMES)) pushScored({ sec: 'Themes', icon: '#i-palette', title: BUILTIN_THEMES[id].name, sub: 'switch theme', kw: 'theme color ' + id, run: () => { applyTheme(id); showToast({ type: 'success', title: 'Theme applied', text: BUILTIN_THEMES[id].name, duration: 2200 }); } }, BUILTIN_THEMES[id].name + ' theme ' + id);
        for (const id of Object.keys(customThemes)) pushScored({ sec: 'Themes', icon: '#i-star', title: customThemes[id].name, sub: 'custom theme', kw: 'theme color custom ' + id, run: () => applyTheme(id) }, customThemes[id].name + ' theme ' + id);
    }

    out.sort((a, b) => b.score - a.score);
    const SEC_ORDER = { Actions: 0, Macros: 1, Recent: 2, Themes: 3, Layouts: 4, Recordings: 5 };
    let limited = q ? out.slice(0, 42) : limitNoQuery(out);
    limited.sort((a, b) => (SEC_ORDER[a.item.sec] - SEC_ORDER[b.item.sec]) || (b.score - a.score));
    return limited.map((o) => o.item);
}

function limitNoQuery(scored) {
    const caps = { Actions: 99, Macros: 5, Recent: 6, Themes: 0, Layouts: 10, Recordings: 12 };
    const counts = {};
    return scored.filter((o) => {
        const c = counts[o.item.sec] || 0;
        if (c >= (caps[o.item.sec] ?? 0)) return false;
        counts[o.item.sec] = c + 1;
        return true;
    });
}

function renderPalette(query) {
    const listEl = $('palette-list');
    if (!listEl) return;
    paletteItems = buildPaletteItems(query);
    paletteIndex = 0;
    listEl.innerHTML = '';
    if (!paletteItems.length) {
        listEl.innerHTML = '<div class="palette-empty">No matches — try a different search</div>';
        return;
    }
    let lastSec = null;
    const q = (query || '').trim().toLowerCase();
    paletteItems.forEach((item, idx) => {
        if (item.sec !== lastSec) {
            lastSec = item.sec;
            listEl.appendChild(el('div', 'palette-section', escHtml(item.sec)));
        }
        const row = el('div', 'palette-item' + (idx === paletteIndex ? ' selected' : ''));
        row.dataset.idx = String(idx);
        let titleHtml = escHtml(item.title);
        if (q && item.title.toLowerCase().includes(q)) {
            const i = item.title.toLowerCase().indexOf(q);
            titleHtml = escHtml(item.title.slice(0, i)) + '<mark>' + escHtml(item.title.slice(i, i + q.length)) + '</mark>' + escHtml(item.title.slice(i + q.length));
        }
        row.innerHTML = `
            <span class="pi-icon"><svg class="ic"><use href="${item.icon || '#i-zap'}"></use></svg></span>
            <span class="pi-main"><span class="pi-title">${titleHtml}</span>${item.sub ? `<span class="pi-sub">${escHtml(item.sub)}</span>` : ''}</span>
            ${item.hint ? `<span class="pi-hint">${escHtml(item.hint)}</span>` : ''}`;
        row.addEventListener('click', () => runPaletteItem(idx));
        row.addEventListener('mouseenter', () => selectPaletteIndex(idx));
        listEl.appendChild(row);
    });
}

function selectPaletteIndex(idx) {
    const listEl = $('palette-list');
    if (!listEl) return;
    paletteIndex = clamp(idx, 0, Math.max(0, paletteItems.length - 1));
    $$('.palette-item', listEl).forEach((n) => n.classList.remove('selected'));
    const sel = listEl.querySelector(`.palette-item[data-idx="${paletteIndex}"]`);
    if (sel) {
        sel.classList.add('selected');
        sel.scrollIntoView({ block: 'nearest' });
    }
}

function runPaletteItem(idx) {
    const item = paletteItems[idx];
    if (!item) return;
    closePalette();
    setTimeout(() => { try { item.run(); } catch (e) { console.error(e); } }, 30);
}

function togglePalette() {
    const ov = $('palette-overlay');
    if (!ov) return;
    if (ov.classList.contains('hidden')) openPalette();
    else closePalette();
}

function openPalette() {
    if (typeof refreshLayoutsCache === 'function') refreshLayoutsCache();
    if (typeof refreshRecordingsCache === 'function') refreshRecordingsCache();
    const ov = $('palette-overlay');
    const input = $('palette-input');
    if (!ov || !input) return;
    input.value = '';
    renderPalette('');
    ov.classList.remove('hidden');
    setTimeout(() => input.focus(), 30);
    playUI('click');
}

function closePalette() {
    const ov = $('palette-overlay');
    if (ov) ov.classList.add('hidden');
}
function closePaletteIfOpen() {
    const ov = $('palette-overlay');
    if (ov && !ov.classList.contains('hidden')) { closePalette(); return true; }
    return false;
}

/* ─────────────── Macros ─────────────── */

const DEFAULT_MACROS = [
    { id: 'm_default_update', name: 'Update system', cmd: 'sudo pacman -Syu' },
    { id: 'm_default_fetch', name: 'System info', cmd: 'fastfetch' },
    { id: 'm_default_htop', name: 'Process monitor', cmd: 'htop' },
    { id: 'm_default_ls', name: 'List files', cmd: 'ls -la' },
    { id: 'm_default_git', name: 'Git status', cmd: 'git status' },
    { id: 'm_default_disk', name: 'Disk usage', cmd: 'df -h' },
    { id: 'm_default_clear', name: 'Clear screen', cmd: 'clear' }
];

function getMacros() {
    const m = storeGet(K.macros, null);
    if (!Array.isArray(m)) {
        storeSet(K.macros, DEFAULT_MACROS);
        return DEFAULT_MACROS.slice();
    }
    return m;
}
function saveMacros(list) { storeSet(K.macros, list); }

let macroEditId = null;

function openMacros() {
    const modal = $('macros-modal');
    if (!modal) return;
    renderMacros();
    resetMacroForm();
    modal.classList.remove('hidden');
}
function closeMacros() {
    const modal = $('macros-modal');
    if (modal) modal.classList.add('hidden');
}

function resetMacroForm() {
    macroEditId = null;
    const name = $('macro-name');
    const cmd = $('macro-command');
    const label = $('macro-save-label');
    if (name) name.value = '';
    if (cmd) cmd.value = '';
    if (label) label.textContent = 'Add macro';
}

function renderMacros() {
    const listEl = $('macro-list');
    if (!listEl) return;
    const macros = getMacros();
    listEl.innerHTML = '';
    if (!macros.length) {
        listEl.innerHTML = '<div class="files-empty"><svg class="ic"><use href="#i-play"></use></svg><span>No macros yet — add your first above</span></div>';
        return;
    }
    macros.forEach((m, i) => {
        const row = el('div', 'macro-row');
        row.style.animationDelay = Math.min(i * 20, 240) + 'ms';
        row.innerHTML = `
            <div class="macro-main" data-action="macro-run" data-id="${escHtml(m.id)}" title="Run now">
                <div class="macro-name"><svg class="ic ic-sm"><use href="#i-play"></use></svg>${escHtml(m.name)}${m.pinned ? '<span class="macro-badge">pinned</span>' : ''}</div>
                <div class="macro-cmd">${escHtml(m.cmd)}</div>
            </div>
            <div class="macro-actions">
                <button class="icon-btn macro-run" data-action="macro-run" data-id="${escHtml(m.id)}" title="Run"><svg class="ic"><use href="#i-send"></use></svg></button>
                <button class="icon-btn${m.pinned ? ' toggled' : ''}" data-action="macro-pin" data-id="${escHtml(m.id)}" title="Pin to quick bar"><svg class="ic"><use href="#i-pin"></use></svg></button>
                <button class="icon-btn" data-action="macro-edit" data-id="${escHtml(m.id)}" title="Edit"><svg class="ic"><use href="#i-edit"></use></svg></button>
                <button class="icon-btn macro-del" data-action="macro-del" data-id="${escHtml(m.id)}" title="Delete"><svg class="ic"><use href="#i-trash"></use></svg></button>
            </div>`;
        listEl.appendChild(row);
    });
}

function saveMacroFromForm() {
    const nameEl = $('macro-name');
    const cmdEl = $('macro-command');
    const name = (nameEl.value || '').trim();
    const cmd = (cmdEl.value || '').trim();
    if (!name) { showToast({ type: 'warn', title: 'Macro needs a name' }); nameEl.focus(); return; }
    if (!cmd) { showToast({ type: 'warn', title: 'Macro needs a command' }); cmdEl.focus(); return; }
    const macros = getMacros();
    if (macroEditId) {
        const m = macros.find((x) => x.id === macroEditId);
        if (m) { m.name = name.slice(0, 40); m.cmd = cmd.slice(0, 2000); }
        showToast({ type: 'success', title: 'Macro updated', text: name });
    } else {
        macros.unshift({ id: uid('m'), name: name.slice(0, 40), cmd: cmd.slice(0, 2000) });
        showToast({ type: 'success', title: 'Macro added', text: name });
    }
    saveMacros(macros);
    renderMacros();
    resetMacroForm();
}

function macroRun(id) {
    const m = getMacros().find((x) => x.id === id);
    if (!m) return;
    closeMacros();
    runCommandInActiveTab(m.cmd);
    buzz(12);
}
function macroEdit(id) {
    const m = getMacros().find((x) => x.id === id);
    if (!m) return;
    macroEditId = id;
    $('macro-name').value = m.name;
    $('macro-command').value = m.cmd;
    $('macro-save-label').textContent = 'Update macro';
    $('macro-name').focus();
}
async function macroDelete(id) {
    const m = getMacros().find((x) => x.id === id);
    if (!m) return;
    const ok = await showConfirm({ title: 'Delete macro?', message: `"${m.name}" will be removed.`, okLabel: 'Delete' });
    if (!ok) return;
    saveMacros(getMacros().filter((x) => x.id !== id));
    renderMacros();
    if (macroEditId === id) resetMacroForm();
    showToast({ type: 'info', title: 'Macro deleted', text: m.name, duration: 2400 });
}

/* ─────────────── Live share ─────────────── */

function openShareModal() {
    if (isViewerSession) { showToast({ type: 'info', title: 'Host only', text: 'Spectators cannot create share links.' }); return; }
    const modal = $('share-modal');
    const select = $('share-tab-select');
    if (!modal || !select) return;
    select.innerHTML = '';
    Object.values(tabs).forEach((t) => {
        const opt = el('option');
        opt.value = t.id;
        opt.textContent = t.title;
        select.appendChild(opt);
    });
    if (activeTabId) select.value = activeTabId;
    modal.classList.remove('hidden');
    onShareTabSelectChange(select.value);
}
function closeShareModal() {
    const modal = $('share-modal');
    if (modal) modal.classList.add('hidden');
}

async function onShareTabSelectChange(tabId) {
    if (!tabId || !token) return;
    const activeBox = $('share-active-box');
    const btnGenerateLabel = $('btn-generate-share-label');
    const btnStop = $('btn-stop-share');
    const linkInput = $('share-link-input');
    try {
        const data = await api(`/api/share/status?tabId=${encodeURIComponent(tabId)}`);
        tabShareStatus[tabId] = data;
        if (data.isShared) {
            activeBox.classList.remove('hidden');
            btnStop.classList.remove('hidden');
            if (btnGenerateLabel) btnGenerateLabel.textContent = 'Update mode / rotate link';
            linkInput.value = `${window.location.origin}/?share=${data.token}`;
            $('modal-viewers-count').textContent = data.viewerCount || 0;
            const exp = $('share-expires-text');
            if (exp && data.expiresAt) exp.textContent = 'expires ' + new Date(data.expiresAt).toLocaleString();
            const ro = $('mode-choice-readonly');
            const inter = $('mode-choice-interactive');
            if (ro && inter) {
                inter.checked = data.mode === 'interactive';
                ro.checked = data.mode !== 'interactive';
            }
        } else {
            activeBox.classList.add('hidden');
            btnStop.classList.add('hidden');
            if (btnGenerateLabel) btnGenerateLabel.textContent = 'Generate live link';
        }
        updateViewersChip();
    } catch (e) { /* silent */ }
}

async function createOrUpdateShareLink() {
    const select = $('share-tab-select');
    const tabId = select ? select.value : null;
    if (!tabId) { showToast({ type: 'warn', title: 'Pick a tab first' }); return; }
    const modeRadio = document.querySelector('input[name="share-mode-choice"]:checked');
    const mode = modeRadio ? modeRadio.value : 'readonly';
    const label = $('btn-generate-share-label');
    if (label) label.textContent = 'Generating…';
    try {
        const data = await api('/api/share/create', { method: 'POST', body: { tabId, mode } });
        tabShareStatus[tabId] = { isShared: true, token: data.token, mode: data.mode, viewerCount: 0 };
        await onShareTabSelectChange(tabId);
        updateViewersChip();
        showToast({ type: 'success', title: 'Live link ready', text: mode === 'interactive' ? 'Interactive pair mode' : 'Read-only spectator mode' });
    } catch (err) {
        showToast({ type: 'error', title: 'Could not create link', text: err.message });
        if (label) label.textContent = 'Generate live link';
    }
}

async function revokeShareLink() {
    const select = $('share-tab-select');
    const tabId = select ? select.value : null;
    if (!tabId) return;
    try {
        await api('/api/share/revoke', { method: 'POST', body: { tabId } });
        tabShareStatus[tabId] = { isShared: false, viewerCount: 0 };
        onShareTabSelectChange(tabId);
        updateViewersChip();
        showToast({ type: 'info', title: 'Sharing stopped', text: 'Viewers were disconnected.' });
    } catch (err) {
        showToast({ type: 'error', title: 'Could not stop sharing', text: err.message });
    }
}

async function copyShareLink() {
    const input = $('share-link-input');
    if (!input || !input.value) return;
    let copied = false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(input.value);
            copied = true;
        }
    } catch (e) { copied = false; }
    if (!copied) {
        try {
            input.select();
            copied = document.execCommand('copy');
        } catch (e) {}
    }
    const t = $('share-copy-toast');
    if (copied && t) {
        t.classList.remove('hidden');
        setTimeout(() => t.classList.add('hidden'), 2200);
    }
    if (copied) {
        showToast({ type: 'success', title: 'Link copied', text: 'Share it with your teammate', duration: 2400 });
        buzz(10);
    } else {
        showToast({ type: 'warn', title: 'Copy failed', text: 'Select the link and copy manually.' });
    }
}

function onPresenceForUI(tabId, count) {
    const select = $('share-tab-select');
    const modal = $('share-modal');
    if (modal && !modal.classList.contains('hidden') && select && select.value === tabId) {
        const c = $('modal-viewers-count');
        if (c) c.textContent = count;
    }
}

/* ─────────────── Settings UI ─────────────── */

function openSettings() {
    const modal = $('settings-modal');
    if (!modal) return;
    syncSettingsUI();
    loadServerSessions();
    modal.classList.remove('hidden');
}
function closeSettings() {
    const modal = $('settings-modal');
    if (modal) modal.classList.add('hidden');
}

function renderThemeOptions() {
    const builtinGroup = $('builtin-themes-group');
    const customGroup = $('custom-themes-group');
    if (!builtinGroup || !customGroup) return;
    builtinGroup.innerHTML = '';
    Object.keys(BUILTIN_THEMES).forEach((id) => {
        const opt = el('option');
        opt.value = id;
        opt.textContent = BUILTIN_THEMES[id].name;
        builtinGroup.appendChild(opt);
    });
    customGroup.innerHTML = '';
    const keys = Object.keys(customThemes);
    if (!keys.length) {
        const opt = el('option');
        opt.disabled = true;
        opt.textContent = '(none saved yet)';
        customGroup.appendChild(opt);
    } else {
        keys.forEach((id) => {
            const opt = el('option');
            opt.value = id;
            opt.textContent = '★ ' + customThemes[id].name;
            customGroup.appendChild(opt);
        });
    }
    syncThemeSelects(getActiveThemeId());
    populateAutoThemeSelects();
    updateThemeSwatch(getThemeData(getActiveThemeId()));
    renderCustomThemesManage();
}

function populateAutoThemeSelects() {
    ['setting-light-theme', 'setting-dark-theme'].forEach((id) => {
        const sel = $(id);
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '';
        const addGroup = (label, ids, source) => {
            const g = document.createElement('optgroup');
            g.label = label;
            ids.forEach((tid) => {
                const opt = el('option');
                opt.value = tid;
                opt.textContent = source[tid].name;
                g.appendChild(opt);
            });
            sel.appendChild(g);
        };
        addGroup('Light', LIGHT_THEME_IDS.filter((t) => BUILTIN_THEMES[t]), BUILTIN_THEMES);
        addGroup('Dark', Object.keys(BUILTIN_THEMES).filter((t) => !LIGHT_THEME_IDS.includes(t)), BUILTIN_THEMES);
        const ck = Object.keys(customThemes);
        if (ck.length) addGroup('Custom', ck, customThemes);
        if (prev) sel.value = prev;
    });
}

function syncThemeSelects(id) {
    const s = $('setting-theme-select');
    if (s) s.value = id;
    const v = $('viewer-theme-select');
    if (v && Array.from(v.options).some((o) => o.value === id)) v.value = id;
}

function updateThemeSwatch(themeData) {
    const swatch = $('theme-swatch');
    if (!swatch || !themeData) return;
    swatch.style.background = `linear-gradient(135deg, ${themeData.background} 45%, ${themeData.cyan || themeData.cursor} 55%, ${themeData.magenta || themeData.foreground} 100%)`;
}

function syncSettingsUI() {
    const s = getSettings();
    const set = (id, v) => { const n = $(id); if (n) n.value = v; };
    const chk = (id, v) => { const n = $(id); if (n) n.checked = !!v; };

    syncThemeSelects(getActiveThemeId());
    populateAutoThemeSelects();
    const at = $('setting-auto-theme');
    if (at) at.checked = !!s.autoTheme;
    const picks = $('auto-theme-picks');
    if (picks) picks.classList.toggle('hidden', !s.autoTheme);
    const lt = $('setting-light-theme');
    if (lt) lt.value = s.lightThemeId;
    const dt = $('setting-dark-theme');
    if (dt) dt.value = s.darkThemeId;
    const pb = $('setting-pin-bar');
    if (pb) pb.checked = s.showPinBar !== false;
    const av = $('setting-ai-voice-on');
    if (av) av.checked = !!s.aiVoice;
    const avn = $('setting-ai-voice');
    if (avn && s.aiVoiceName && Array.from(avn.options).some((o) => o.value === s.aiVoiceName)) avn.value = s.aiVoiceName;
    set('setting-font-family', s.fontFamily);
    set('setting-font-size', defaultFontSize());
    const fsv = $('font-size-value');
    if (fsv) fsv.textContent = defaultFontSize() + 'px';
    set('setting-cursor-style', s.cursorStyle);
    chk('setting-cursor-blink', s.cursorBlink);
    set('setting-opacity', s.opacity);
    const ov = $('opacity-value');
    if (ov) ov.textContent = s.opacity + '%';
    chk('setting-mech-keyboard', s.mechKeyboard);
    chk('setting-ui-sounds', s.uiSounds);
    chk('setting-haptics', s.haptics);
    chk('setting-completion-notif', s.completionNotifications);
    chk('setting-health-push', !!s.healthPush);
    chk('setting-auto-save-rec', s.autoSaveRecordings !== false);
    chk('setting-boot-anim', s.bootAnim);
    chk('setting-reduced-motion', s.reducedMotion);
    set('setting-scroll-speed', s.scrollSpeed);
    const ssv = $('scroll-speed-value');
    if (ssv) ssv.textContent = s.scrollSpeed;
    set('setting-ai-timeout', s.aiTimeout || 20);
    const atv = $('ai-timeout-value');
    if (atv) atv.textContent = (s.aiTimeout || 20) + 's';
    set('setting-ring-secs', s.ringSecs === undefined ? 60 : s.ringSecs);
    const fb = $('setting-float-ball');
    if (fb) fb.checked = s.floatBall === null ? isCoarsePointer() : !!s.floatBall;
    loadPushStatus();
    refreshNotifStatus();
    renderCustomThemesManage();
}

function toggleThemeCreator() {
    const c = $('custom-theme-creator');
    if (!c) return;
    c.classList.toggle('hidden');
    if (!c.classList.contains('hidden')) updateCustomPreview();
}

function updateCustomPreview() {
    const bg = $('custom-color-bg').value;
    const fg = $('custom-color-fg').value;
    const cursor = $('custom-color-cursor').value;
    const accent = $('custom-color-accent').value;
    const setHex = (id, v) => { const n = $(id); if (n) n.textContent = v; };
    setHex('hex-bg', bg); setHex('hex-fg', fg); setHex('hex-cursor', cursor); setHex('hex-accent', accent);
    const chip = $('custom-creator-preview');
    if (chip) {
        chip.style.backgroundColor = bg;
        chip.style.color = fg;
        chip.innerHTML = `<span style="color:${accent};font-weight:bold">garuda@linux</span>:<span style="color:${fg}">~</span>$ <span style="background:${cursor};color:${bg};padding:0 2px">_</span>`;
    }
}

async function saveCustomTheme() {
    const nameInput = $('custom-theme-name');
    const name = (nameInput.value || '').trim();
    const statusEl = $('custom-theme-status');
    if (!name) {
        showToast({ type: 'warn', title: 'Give your theme a name' });
        nameInput.focus();
        return;
    }
    const bg = $('custom-color-bg').value;
    const fg = $('custom-color-fg').value;
    const cursor = $('custom-color-cursor').value;
    const accent = $('custom-color-accent').value;
    const safeId = ('custom_' + name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')).slice(0, 64);
    const payload = {
        name: name.slice(0, 40),
        theme: {
            background: bg, foreground: fg, cursor: cursor,
            selectionBackground: accent + '55',
            black: mixColors(bg, '#000000', 0.2), red: '#ed1515', green: '#11d116',
            yellow: '#f67400', blue: accent, magenta: mixColors(accent, '#ff66cc', 0.45),
            cyan: accent, white: fg
        }
    };
    if (statusEl) statusEl.textContent = 'saving…';
    try {
        const res = await api('/api/custom-themes', { method: 'POST', body: payload });
        const saved = res.theme;
        customThemes[saved.id] = saved;
        renderThemeOptions();
        applyTheme(saved.id);
        nameInput.value = '';
        if (statusEl) statusEl.textContent = '';
        showToast({ type: 'success', title: 'Theme saved', text: `${saved.name} → public/custom-themes/${saved.id}.json` });
    } catch (err) {
        if (statusEl) statusEl.textContent = '';
        showToast({ type: 'error', title: 'Save failed', text: err.message });
    }
}

function renderCustomThemesManage() {
    const box = $('custom-themes-manage');
    if (!box) return;
    const keys = Object.keys(customThemes);
    if (!keys.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = '';
    keys.forEach((id) => {
        const t = customThemes[id];
        const row = el('div', 'ctm-row');
        row.innerHTML = `
            <span class="ctm-swatch" style="background:linear-gradient(135deg, ${escHtml(t.theme.background)} 50%, ${escHtml(t.theme.cyan || t.theme.cursor)} 50%)"></span>
            <span class="ctm-name">${escHtml(t.name)}</span>
            <button class="icon-btn" data-action="theme-apply" data-id="${escHtml(id)}" title="Apply"><svg class="ic ic-sm"><use href="#i-check"></use></svg></button>
            <button class="ctm-del" data-action="theme-del" data-id="${escHtml(id)}" title="Delete">×</button>`;
        box.appendChild(row);
    });
}

async function deleteCustomTheme(id) {
    const t = customThemes[id];
    if (!t) return;
    const ok = await showConfirm({ title: 'Delete theme?', message: `"${t.name}" will be removed from the server.`, okLabel: 'Delete' });
    if (!ok) return;
    try {
        await api(`/api/custom-themes/${encodeURIComponent(id)}`, { method: 'DELETE' });
        delete customThemes[id];
        renderThemeOptions();
        if (getActiveThemeId() === id || getSettings().themeId === id) applyTheme('garuda_dragonized');
        showToast({ type: 'info', title: 'Theme deleted', text: t.name });
    } catch (err) {
        showToast({ type: 'error', title: 'Delete failed', text: err.message });
    }
}

function randomTheme() {
    const ids = Object.keys(BUILTIN_THEMES).concat(Object.keys(customThemes));
    const current = getActiveThemeId();
    let pick = ids[Math.floor(Math.random() * ids.length)];
    if (ids.length > 1 && pick === current) pick = ids[(ids.indexOf(pick) + 1) % ids.length];
    applyTheme(pick);
    const name = (customThemes[pick] || BUILTIN_THEMES[pick] || {}).name || pick;
    showToast({ type: 'success', title: 'Theme applied', text: name, duration: 2400 });
    playUI('success');
}

function refreshNotifStatus() {
    const el = $('notif-status');
    if (!el) return;
    const has = 'Notification' in window;
    const perm = has ? Notification.permission : 'unsupported';
    if (!has) {
        el.textContent = 'No Notification API here. On iPhone/iPad: install to Home Screen first (iOS 16.4+), then reopen from the icon.';
    } else if (!window.isSecureContext) {
        el.textContent = 'This page is HTTP — browsers block notifications on insecure origins. Use HTTPS or localhost (README → “Install it like a real app”).';
    } else if (storeGet('gk_push_lasterr', null)) {
        el.textContent = 'Last push error: ' + String(storeGet('gk_push_lasterr', '')).slice(0, 90) + ' — tap Enable to retry.';
    } else if (perm === 'granted') {
        el.textContent = '✓ Enabled on this device.';
    } else if (perm === 'denied') {
        el.textContent = 'Blocked in browser site settings — allow notifications there, then reload.';
    } else {
        el.textContent = 'Not enabled yet — tap Enable (one tap, real permission prompt).';
    }
}

async function enableNotifications() {
    if (!('Notification' in window)) {
        showToast({ type: 'warn', title: 'Not supported here', text: 'On iPhone: install the PWA to Home Screen first. On Android/desktop: use HTTPS or localhost.' });
        refreshNotifStatus();
        return;
    }
    if (!window.isSecureContext) {
        showToast({ type: 'warn', title: 'HTTPS required', text: 'Browsers block notification permission on plain HTTP origins.' });
        refreshNotifStatus();
        return;
    }
    let p = Notification.permission;
    if (p === 'default') {
        try { p = await Notification.requestPermission(); } catch (e) { p = Notification.permission; }
    }
    refreshNotifStatus();
    if (p === 'granted') {
        const shown = await notifyUser('Garuda Konsole', 'Notifications are working 🎉', { tag: 'test' });
        showToast(shown
            ? { type: 'success', title: 'Notifications enabled', text: 'Test notification shown.' }
            : { type: 'warn', title: 'Permission granted', text: 'This device could not display the test — background push (below) still works.' });
        playUI('success');
    } else {
        showToast({ type: 'warn', title: 'Permission ' + p, text: p === 'denied' ? 'Allow notifications in browser site settings, then reload.' : 'Maybe later.' });
    }
}

/* ─────────────── Voice input (Whisper via server proxy) ─────────────── */
const AUDIO_EXT_CLIENT = new Set(['mp3', 'wav', 'm4a', 'webm', 'ogg', 'oga', 'flac', 'aac', 'mp4', 'mpeg', 'mpga']);
let micRec = null;
let micStream = null;
let micChunks = [];

function pickMicMime() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    for (const mt of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
        if (MediaRecorder.isTypeSupported(mt)) return mt;
    }
    return '';
}

let micTarget = 'ai';
async function aiMicToggle(target) {
    const btn = $('ai-mic');
    if (micRec) { try { micRec.stop(); } catch (e) {} return; }
    micTarget = target === 'cmd' ? 'cmd' : 'ai';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
        showToast({ type: 'warn', title: 'Microphone unsupported', text: 'Needs HTTPS and a modern browser with MediaRecorder.' });
        return;
    }
    try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        showToast({ type: 'warn', title: 'Mic permission denied', text: 'Allow microphone in browser site settings to dictate.' });
        return;
    }
    micChunks = [];
    const mime = pickMicMime();
    try { micRec = mime ? new MediaRecorder(micStream, { mimeType: mime }) : new MediaRecorder(micStream); }
    catch (e) { micRec = new MediaRecorder(micStream); }
    micRec.ondataavailable = (e) => { if (e.data && e.data.size) micChunks.push(e.data); };
    micRec.onstop = async () => {
        if (btn) btn.classList.remove('recording');
        if (micStream) micStream.getTracks().forEach((t) => t.stop());
        micStream = null; micRec = null;
        const blob = new Blob(micChunks, { type: mime || 'audio/webm' });
        micChunks = [];
        if (!blob.size) return;
        if (btn) btn.classList.add('busy');
        try {
            const fd = new FormData();
            fd.append('file', blob, 'voice.webm');
            const res = await api('/api/ai/transcribe', { method: 'POST', body: fd });
            const text = (res.text || '').trim();
            if (text && micTarget === 'cmd') {
                runVoiceCommand(text);
                return;
            }
            const input = $('ai-input');
            if (input && text) {
                input.value = (input.value ? input.value.replace(/\s+$/, '') + ' ' : '') + text;
                aiAutosizeInput(input);
                input.focus();
                buzz(10);
            } else if (!text) {
                showToast({ type: 'info', title: 'No speech detected' });
            }
        } catch (err) {
            showToast({ type: 'error', title: 'Transcription failed', text: err.message });
        } finally {
            if (btn) btn.classList.remove('busy');
        }
    };
    micRec.start();
    if (btn) btn.classList.add('recording');
    showToast({ type: 'info', title: micTarget === 'cmd' ? 'Listening for a command…' : 'Listening…', text: 'Tap the mic again when done.', duration: 2500 });
}

async function testNotification() {
    refreshNotifStatus();
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        enableNotifications();
        return;
    }
    const shown = await notifyUser('Garuda Konsole', 'Test notification — looking good!', { tag: 'test' });
    if (shown) showToast({ type: 'success', title: 'Test notification sent' });
    else showToast({ type: 'error', title: 'Could not display notification', text: 'Permission is granted but this device refused to show it.' });
}

async function loadServerSessions() {
    const box = $('server-sessions-list');
    if (!box) return;
    if (!token) { box.innerHTML = '<div class="sessions-empty">Host sessions — available after unlock</div>'; return; }
    box.innerHTML = '<div class="sessions-empty">loading…</div>';
    try {
        const data = await api('/api/sessions');
        const list = data.sessions || [];
        box.innerHTML = '';
        if (!list.length) {
            box.innerHTML = '<div class="sessions-empty">No sessions on the server</div>';
            return;
        }
        list.forEach((s, i) => {
            const row = el('div', 'srv-row');
            row.style.animationDelay = Math.min(i * 25, 250) + 'ms';
            row.innerHTML = `
                <span class="srv-dot ${s.alive ? 'srv-alive' : 'srv-dead'}"></span>
                <div class="srv-main">
                    <div class="srv-id">${escHtml(s.tabId)}${s.tabId === activeTabId ? ' · this window' : ''}</div>
                    <div class="srv-meta">
                        <span>${escHtml(s.shell || '')}</span>
                        <span class="ellipsis" style="max-width:130px" title="${escHtml(s.cwd || '')}">${escHtml(s.cwd || '')}</span>
                        <span>${s.clients} conn · ${s.viewers} view</span>
                        <span>${fmtAgo(s.createdAt)}</span>
                    </div>
                </div>
                <button class="srv-kill" data-action="session-kill" data-tab="${escHtml(s.tabId)}" title="Terminate session"><svg class="ic ic-sm"><use href="#i-power"></use></svg></button>`;
            box.appendChild(row);
        });
    } catch (err) {
        box.innerHTML = `<div class="sessions-empty">${escHtml(err.message || 'Failed to load')}</div>`;
    }
}

async function killServerSession(tabId) {
    const ok = await showConfirm({
        title: 'Terminate session?',
        message: `Shell "${tabId}" will be killed on the server${tabs[tabId] ? ' and its tab closed here' : ''}.`,
        okLabel: 'Terminate'
    });
    if (!ok) return;
    try {
        await api('/api/sessions/kill', { method: 'POST', body: { tabId } });
        showToast({ type: 'success', title: 'Session terminated', text: tabId });
        loadServerSessions();
    } catch (err) {
        showToast({ type: 'error', title: 'Kill failed', text: err.message });
    }
}

async function resetSettings() {
    const ok = await showConfirm({
        title: 'Reset all settings?',
        message: 'Theme, sounds, font and behaviour settings return to defaults. Macros and recent commands are kept.',
        okLabel: 'Reset'
    });
    if (!ok) return;
    try { localStorage.removeItem(K.settings); localStorage.removeItem(K.kbCollapsed); } catch (e) {}
    window.location.reload();
}

/* ─────────────── Help & mobile more ─────────────── */

function openHelp() {
    const modal = $('help-modal');
    const ver = $('help-version');
    if (ver) ver.textContent = `Garuda Konsole v${(serverMeta && serverMeta.version) || APP_VERSION} · ${serverMeta.hostname || ''}`;
    if (modal) modal.classList.remove('hidden');
}
function closeHelp() {
    const modal = $('help-modal');
    if (modal) modal.classList.add('hidden');
}

function openMobileMore() {
    const modal = $('mobile-more-modal');
    if (modal) modal.classList.remove('hidden');
}
function closeMobileMore() {
    const modal = $('mobile-more-modal');
    if (modal) modal.classList.add('hidden');
}
function closeMobileMoreIfOpen() {
    const modal = $('mobile-more-modal');
    if (modal && !modal.classList.contains('hidden')) { closeMobileMore(); return true; }
    return false;
}

/* ─────────────── Context menus ─────────────── */

function hideContextMenu() {
    const menu = $('context-menu');
    if (menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
        menu.innerHTML = '';
        return true;
    }
    return false;
}

function openCtxMenu(x, y, items) {
    const menu = $('context-menu');
    if (!menu) return;
    menu.innerHTML = '';
    items.forEach((it) => {
        if (it.sep) { menu.appendChild(el('div', 'ctx-sep')); return; }
        const btn = el('button', 'ctx-item' + (it.danger ? ' danger' : ''));
        btn.innerHTML = `<svg class="ic"><use href="${it.icon || '#i-zap'}"></use></svg><span>${escHtml(it.label)}</span>${it.key ? `<span class="ctx-key">${escHtml(it.key)}</span>` : ''}`;
        if (it.disabled) {
            /* Truly inert: native disabled state (also styled by the AFFORDANCE
               section — dimmed, desaturated, not-allowed). No inline-style hacks,
               so "gray" can never mean "still clickable". */
            btn.disabled = true;
        } else {
            btn.addEventListener('click', () => { hideContextMenu(); it.run(); });
        }
        menu.appendChild(btn);
    });
    menu.classList.remove('hidden');
    /* Position relative to the offset parent (.app-body), not the viewport */
    const parent = menu.offsetParent || document.body;
    const prect = parent.getBoundingClientRect ? parent.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const rect = menu.getBoundingClientRect();
    const localX = x - prect.left;
    const localY = y - prect.top;
    const maxX = prect.width - rect.width - 8;
    const maxY = prect.height - rect.height - 8;
    menu.style.left = Math.max(8, Math.min(localX, maxX)) + 'px';
    menu.style.top = Math.max(8, Math.min(localY, maxY)) + 'px';
}

async function clipboardCopy(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) {}
    return false;
}
async function clipboardRead() {
    try {
        if (navigator.clipboard && navigator.clipboard.readText) return await navigator.clipboard.readText();
    } catch (e) {}
    return null;
}

function openTermContextMenu(e, tab) {
    const selection = tab.term.getSelection ? (tab.term.getSelection() || '') : '';
    const items = [
        { icon: '#i-copy', label: 'Copy', disabled: !selection, run: async () => { if (await clipboardCopy(selection)) { tab.term.clearSelection(); showToast({ type: 'success', title: 'Copied', duration: 1600, silent: true }); } } },
        { icon: '#i-copy', label: 'Paste', run: async () => { const t = await clipboardRead(); if (t) { tab.term.paste(t); } else showToast({ type: 'warn', title: 'Clipboard unavailable', text: 'Browser denied clipboard read.' }); } },
        { icon: '#i-terminal', label: 'Select all', run: () => { try { tab.term.selectAll(); } catch (err) {} } },
        { sep: true },
        { icon: '#i-refresh', label: 'Clear screen', key: 'Ctrl+L', run: clearTerminal },
        { icon: '#i-search', label: 'Search output…', key: 'Ctrl+Shift+F', run: openSearch },
        { icon: '#i-record', label: tab.recording ? 'Stop recording' : 'Record output', run: () => toggleRecording(tab.id) },
        { icon: '#i-chev-left', label: 'Replay last 60 s', run: () => { const rec = getRingRecording(tab); if (rec) openReplay(rec); else showToast({ type: 'info', title: 'Ring buffer empty' }); } },
        { icon: '#i-sparkle', label: 'Explain selection with AI', disabled: !selection, run: () => aiExplainSelection(selection, 'explain') },
        { icon: '#i-robot', label: 'Fix selection with AI', disabled: !selection, run: () => aiExplainSelection(selection, 'fix') },
        { icon: '#i-save', label: 'Export scrollback (.log)', run: exportLog },
        { sep: true },
        { icon: '#i-download', label: 'Download selection', disabled: !selection, run: () => downloadBySelection(tab.id, selection.trim()) }
    ];
    if (tab.exited) {
        items.push({ sep: true });
        items.push({ icon: '#i-power', label: 'Restart shell', run: () => respawnSession(tab.id) });
    }
    openCtxMenu(e.clientX, e.clientY, items);
}

function openTabContextMenu(e, tabId) {
    const tab = tabs[tabId];
    if (!tab) return;
    openCtxMenu(e.clientX, e.clientY, [
        { icon: '#i-edit', label: 'Rename tab', run: () => startRenameTab(tabId) },
        { icon: '#i-palette', label: 'Cycle tab color', run: () => cycleTabColor(tabId) },
        { icon: '#i-plus', label: 'New tab', run: () => createNewTab() },
        { icon: '#i-split', label: 'Split with this tab', run: () => { if (!splitState.mode) startSplit('v', tabId); else { splitState.tabs[1 - splitState.focus] = tabId; applySplitLayout(); } } },
        { icon: '#i-record', label: tab.recording ? 'Stop recording' : 'Record this tab', run: () => toggleRecording(tabId) },
        { icon: '#i-refresh', label: 'Clear screen', run: () => { switchTab(tabId); clearTerminal(); } },
        { sep: true },
        {
            icon: '#i-x', label: 'Close other tabs', run: () => {
                Object.keys(tabs).forEach((id) => { if (id !== tabId) closeTab(id, { keepSwitch: true }); });
                switchTab(tabId);
            }
        },
        { icon: '#i-x', label: 'Close tab', danger: true, run: () => closeTab(tabId) }
    ]);
}

/* ─────────────── Mobile keyboard deck ─────────────── */

const SYMBOL_KEYS = ['/', '\\', '|', '~', '-', '_', '.', ',', ':', ';', '=', '+', '*', '#', '@', '$', '%', '&', '?', '!', '^', '<', '>', '(', ')', '[', ']', '{', '}', '"', "'", '`'];

function buildSymbolRow() {
    const row = $('kb-row-symbols');
    if (!row || row.dataset.built) return;
    row.dataset.built = '1';
    SYMBOL_KEYS.forEach((ch) => {
        const b = el('button', 'mk');
        b.dataset.mkey = 'char:' + ch;
        b.textContent = ch;
        row.appendChild(b);
    });
    const backspace = el('button', 'mk mk-danger');
    backspace.dataset.mkey = 'backspace';
    backspace.textContent = '⌫';
    backspace.style.flex = '1.4';
    row.appendChild(backspace);
    const enter = el('button', 'mk mk-accent');
    enter.dataset.mkey = 'enter';
    enter.textContent = '⏎';
    enter.style.flex = '1.4';
    row.appendChild(enter);
}

function syncCtrlStickyUI(on) {
    const btn = $('kb-ctrl');
    if (btn) btn.classList.toggle('sticky-on', !!on);
    const fb = $('fb-ctrl');
    if (fb) fb.classList.toggle('sticky-on', !!on);
}

function handleMKey(mkey, btnEl) {
    if (!mkey) return;
    if (mkey.startsWith('scroll-')) return; // handled by pointer events
    buzz(8);
    playMechanicalClick(mkey.startsWith('ctrl-'));

    if (mkey.startsWith('char:')) { sendChar(mkey.slice(5)); return; }
    switch (mkey) {
        case 'ctrl-mod': setCtrlSticky(!ctrlSticky); playUI('click'); return;
        case 'sym-toggle': toggleSymbolRow(); return;
        case 'backspace': transmit('\x7f'); return;
        case 'enter': {
            transmit('\r');
            const tab = getActiveTab();
            if (tab) {
                const cmd = tab.cmdBuffer.trim();
                tab.cmdBuffer = '';
                if (cmd) addRecentCommand(cmd);
                tab.isCommandRunning = true;
                tab.commandStartTime = Date.now();
                tab.hasNotified = false;
            }
            return;
        }
        case 'tab-prev': cycleTab(-1); return;
        case 'tab-next': cycleTab(1); return;
        case 'altlock': toggleAltLock(); return;
        case 'upload': triggerUpload(); return;
        case 'files': toggleFiles(); return;
        case 'palette': togglePalette(); return;
        case 'font-up': changeFontSize(1); return;
        case 'font-down': changeFontSize(-1); return;
        case 'share': openShareModal(); return;
        case 'fullscreen': toggleFullScreen(); return;
        case 'settings': openSettings(); return;
        case 'clear': clearTerminal(); return;
        case 'help': openHelp(); return;
        case 'kb-collapse': collapseKeyboard(); return;
        case 'kb-toggle': { const kb = $('mobile-keyboard'); if (kb && kb.classList.contains('hidden')) expandKeyboard(); else collapseKeyboard(); return; }
        case 'ball-close': toggleBallPad(false); return;
        default:
            sendSpecialKey(mkey);
            return;
    }
}

function toggleSymbolRow() {
    const row = $('kb-row-symbols');
    const btn = $('kb-sym-toggle');
    if (!row) return;
    row.classList.toggle('hidden');
    if (btn) btn.classList.toggle('toggled', !row.classList.contains('hidden'));
    setTimeout(debouncedFit, 60);
}

function collapseKeyboard() {
    const kb = $('mobile-keyboard');
    const handle = $('kb-expand-handle');
    if (kb) kb.classList.add('hidden');
    if (handle) handle.classList.remove('hidden');
    storeSet(K.kbCollapsed, true);
    setTimeout(debouncedFit, 80);
}
function expandKeyboard() {
    const kb = $('mobile-keyboard');
    const handle = $('kb-expand-handle');
    if (kb) kb.classList.remove('hidden');
    if (handle) handle.classList.add('hidden');
    storeSet(K.kbCollapsed, false);
    setTimeout(debouncedFit, 80);
}
function restoreKeyboardState() {
    if (storeGet(K.kbCollapsed, false)) {
        const kb = $('mobile-keyboard');
        const handle = $('kb-expand-handle');
        if (kb) kb.classList.add('hidden');
        if (handle) handle.classList.remove('hidden');
    }
}

/* ─────────────── Action registry & event wiring ─────────────── */

const ACTIONS = {
    'toggle-password': () => togglePasswordVisibility(),
    'login': () => doLogin(),
    'new-tab': () => createNewTab(),
    'palette': () => togglePalette(),
    'share': () => { closeMobileMore(); openShareModal(); },
    'share-close': () => closeShareModal(),
    'files': () => { closeMobileMore(); toggleFiles(); },
    'files-close': () => closeDrawer('files-drawer'),
    'files-up': () => { if (filesUpPath) filesNavigate(filesUpPath); },
    'files-home': () => filesNavigate(filesHomePath),
    'files-cwd': () => { filesRequestedPath = null; loadFiles(); },
    'files-refresh': () => loadFiles(),
    'files-mkdir': () => actionFilesMkdir(),
    'files-upload': () => triggerUploadToFiles(),
    'stats': () => { closeMobileMore(); toggleStats(); },
    'stats-close': () => closeDrawer('stats-drawer'),
    'rd-open': () => toggleRd(),
    'rd-close': () => closeDrawer('rd-drawer'),
    'rd-connect': () => rdConnect(),
    'rd-disconnect': () => rdDisconnect(),
    'rd-kbd': () => rdSetKb(!rdState.kb),
    'rd-mute': (n) => { const v = $('rd-video'); if (!v) return; v.muted = !v.muted; n.textContent = v.muted ? '🔇 Muted' : '🔊 Audio'; },
    'rd-full': () => { const st = document.querySelector('.rd-stage'); if (st && st.requestFullscreen) st.requestFullscreen().catch(() => {}); },
    'clear': () => { closeMobileMore(); clearTerminal(); },
    'font-up': () => changeFontSize(1),
    'font-down': () => changeFontSize(-1),
    'fullscreen': () => { closeMobileMore(); toggleFullScreen(); },
    'altlock': () => { closeMobileMore(); toggleAltLock(); },
    'upload': () => { closeMobileMore(); triggerUpload(); },
    'macros': () => { closeMobileMore(); openMacros(); },
    'macros-close': () => closeMacros(),
    'macro-save': () => saveMacroFromForm(),
    'settings': () => { closeMobileMore(); openSettings(); },
    'settings-close': () => closeSettings(),
    'theme-random': () => randomTheme(),
    'theme-apply': (node) => applyTheme(node.dataset.id),
    'theme-del': (node) => deleteCustomTheme(node.dataset.id),
    'toggle-theme-creator': () => toggleThemeCreator(),
    'save-custom-theme': () => saveCustomTheme(),
    'notif-test': () => testNotification(),
    'notif-enable': () => enableNotifications(),
    'sessions-refresh': () => loadServerSessions(),
    'session-kill': (node) => killServerSession(node.dataset.tab),
    'reset-settings': () => resetSettings(),
    'lock': () => { closeMobileMore(); lockSession(); },
    'help': () => { closeMobileMore(); openHelp(); },
    'help-close': () => closeHelp(),
    'mobile-more': () => openMobileMore(),
    'mobile-more-close': () => closeMobileMore(),
    'copy-share-link': () => copyShareLink(),
    'generate-share': () => createOrUpdateShareLink(),
    'revoke-share': () => revokeShareLink(),
    'prompt-ok': () => resolvePromptOk(),
    'prompt-cancel': () => resolvePromptCancel(),
    'confirm-ok': () => resolveConfirmOk(),
    'confirm-cancel': () => resolveConfirmCancel(),
    'preview-close': () => closePreview(),
    'preview-download': () => downloadPreviewFile(),
    'preview-edit': () => { const p = previewPath; closePreview(); if (p) openEditor(p); },
    'preview-zoom': () => { const img = $('preview-image'); if (img) img.classList.toggle('pv-zoomed'); },
    'kb-expand': () => expandKeyboard(),
    'search': () => { closeMobileMore(); openSearch(); },
    'search-case': () => toggleSearchCase(),
    'search-regex': () => toggleSearchRegex(),
    'search-next': () => findNext(),
    'search-prev': () => findPrev(),
    'search-close': () => closeSearch(),
    'export-log': () => { closeMobileMore(); exportLog(); },
    'respawn-session': (node) => respawnSession(node.dataset.tab),
    'close-tab-action': (node) => closeTab(node.dataset.tab),
    'file-download': (node) => actionFileDownload(node),
    'file-cd': (node) => actionFileCd(node),
    'file-rename': (node) => actionFileRename(node),
    'file-delete': (node) => actionFileDelete(node),
    'file-details': (node) => actionFileDetails(node),
    'files-cwd-open': () => openFilesAtShellCwd(),
    'files-search-clear': () => exitFilesSearch(),
    'macro-run': (node) => macroRun(node.dataset.id),
    'macro-edit': (node) => macroEdit(node.dataset.id),
    'macro-del': (node) => macroDelete(node.dataset.id),
    'macro-pin': (node) => macroTogglePin(node.dataset.id),
    'pin-run': (node) => {
        macroRun(node.dataset.id);
        if (typeof refocusIfShellKey === 'function') refocusIfShellKey('char:x'); // macros type into the shell
    },
    /* 3.0 */
    'split-cycle': () => splitCycle(),
    'split-new': () => splitWithNewTab(),
    'record-toggle': () => { toggleRecording(); },
    'replay-open': () => openReplay(),
    'replay-close': () => closeReplay(),
    'replay-play': () => replayPlayPause(),
    'replay-restart': () => replayRestart(),
    'replay-export': () => replayExport(),
    'chat-toggle': () => { closeMobileMore(); toggleChat(); },
    'chat-close': () => closeDrawer('chat-drawer'),
    'chat-send': () => chatSendFromInput(),
    'chat-clear': () => { chatLog = []; chatRenderedSig = ''; chatRenderedCount = 0; renderChat(); },
    'activity-toggle': () => { closeMobileMore(); toggleActivity(); },
    'activity-close': () => closeDrawer('activity-drawer'),
    'activity-clear': () => clearActivity(),
    'triggers': () => { closeMobileMore(); openTriggers(); },
    'triggers-close': () => closeTriggers(),
    'trigger-save': () => saveTriggerFromForm(),
    'trigger-test': () => triggerTest(),
    'trigger-edit': (node) => triggerEdit(node.dataset.id),
    'trigger-del': (node) => triggerDelete(node.dataset.id),
    'profile-open': () => { closeMobileMore(); openProfileModal(); },
    'profile-close': () => closeProfileModal(),
    'profile-create': () => createProfileTab(),
    'profile-use-cwd': () => profileUseCwd(),
    'profile-use-home': () => profileUseHome(),
    'theme-export': () => exportTheme(),
    'theme-import': () => importThemePick(),
    'tour-start': () => { closeSettings(); startTour(); },
    'tour-next': () => tourNext(),
    'tour-skip': () => endTour(true),
    /* 3.1 — AI Guide */
    'ai-toggle': () => { closeMobileMore(); toggleAi(); },
    'ai-close': () => closeDrawer('ai-drawer'),
    'ai-clear': () => { aiClearConversation(); showToast({ type: 'info', title: 'Conversation cleared', duration: 1800, silent: true }); },
    'ai-send': () => aiSendFromInput(),
    'ai-stop': () => { aiStop(); },
    'ai-mode': (node) => setAiMode(node.dataset.mode),
    'ai-hint': (node) => { const i = $('ai-input'); if (i) { i.value = node.dataset.text || ''; aiSendFromInput(); } },
    'ai-cmd-run': (node) => aiResolveDecision('run'),
    'ai-cmd-skip': (node) => aiResolveDecision('skip'),
    'files-edit': (node) => openEditor(node.dataset.path),
    'editor-save': () => editorSave(false),
    'editor-close': () => closeEditor(),
    'replay-share': () => shareReplayLink(),
    'replay-cast': () => downloadReplayCast(),
    'proc-kill': (node) => procSignal(node.dataset.pid, 'TERM'),
    'proc-kill9': (node) => procSignal(node.dataset.pid, 'KILL'),
    'proc-nice-up': (node) => procRenice(node.dataset.pid, (parseInt(node.dataset.nice, 10) || 0) + 1),
    'proc-nice-down': (node) => procRenice(node.dataset.pid, (parseInt(node.dataset.nice, 10) || 0) - 1),
    'layout-save': () => saveCurrentLayoutPrompt(),
    'ai-fail-explain': (node) => { const it = aiState.ui.find((x) => x.id === node.dataset.id); if (it) aiExplainFailure(it.cmd, it.output, it.status); },
    'fileshare-open': (node) => openFileShare(node.dataset.path),
    'fileshare-close': () => { const m = $('fileshare-modal'); if (m) m.classList.add('hidden'); },
    'fileshare-create': () => createFileShare(),
    'fileshare-copy': () => { const i = $('fileshare-url'); if (i && i.value) { navigator.clipboard && navigator.clipboard.writeText(i.value); showToast({ type: 'success', title: 'Link copied', text: i.value, duration: 4000 }); } },
    'fileshare-revoke': (node) => revokeFileShare(node.dataset.token),
    'fileshare-copy-row': (node) => { const url = location.origin + node.dataset.url; if (navigator.clipboard) navigator.clipboard.writeText(url); showToast({ type: 'success', title: 'Link copied', text: url, duration: 4000 }); },
    'sandbox-open': () => openSandboxModal(),
    'sandbox-close': () => { const m = $('sandbox-modal'); if (m) m.classList.add('hidden'); sandboxPollStop(); },
    'sandbox-run': () => runSandbox(),
    'sandbox-promote': () => promoteSandbox(),
    'sandbox-discard': () => discardSandbox(),
    'sandbox-refresh': () => refreshSandboxChanges(),
    'ai-cmd-edit': (node) => aiCmdEdit(node.dataset.id),
    'ai-suggestion-run': (node) => aiRunSuggestion(node.dataset.id),
    'ai-save-config': () => saveAiConfig(),
    'ai-reset-key': () => resetAiKey(),
    'ai-test': () => testAiConnection(),
    /* 4.0 */
    'tasks-toggle': () => { closeMobileMore(); toggleTasks(); },
    'tasks-close': () => { closeDrawer('tasks-drawer'); stopTasksPoll(); },
    'tasks-refresh': () => renderTasks(),
    'task-create': () => createTaskFromForm(),
    'task-kill': (n) => taskAction('kill', n.dataset.id),
    'task-input-send': (n) => {
        const input = document.querySelector(`[data-task-input="${n.dataset.id}"]`);
        const val = input ? input.value : '';
        if (!val) { if (input) input.focus(); return; }
        sendTaskInput(n.dataset.id, val + '\n', input);
    },
    'task-input-quick': (n) => {
        const v = n.dataset.val;
        sendTaskInput(n.dataset.id, v === 'cc' ? '\x03' : v + '\n');
    },
    'task-rerun': (n) => taskAction('rerun', n.dataset.id),
    'task-log': (n) => taskAction('log', n.dataset.id),
    'schedule-open': () => { closeMobileMore(); openSchedule(); },
    'schedule-close': () => closeSchedule(),
    'schedule-save': () => saveScheduleFromForm(),
    'schedule-run': (n) => scheduleRunNow(n.dataset.id),
    'schedule-edit': (n) => scheduleEdit(n.dataset.id),
    'schedule-del': (n) => scheduleDelete(n.dataset.id),
    'sel-copy': async () => {
        if (!lastSelection) return;
        if (await clipboardCopy(lastSelection)) showToast({ type: 'success', title: 'Copied to clipboard', duration: 1600, silent: true });
        else showToast({ type: 'warn', title: 'Clipboard blocked by browser' });
        selectionClear();
    },
    'sel-explain': () => { const t = lastSelection; selectionClear(); aiExplainSelection(t, 'explain'); },
    'sel-fix': () => { const t = lastSelection; selectionClear(); aiExplainSelection(t, 'fix'); },
    'sel-download': () => { const t = lastSelection; const id = lastSelectionTabId; selectionClear(); if (id) downloadBySelection(id, t.trim()); },
    'sel-clear': () => selectionClear(),
    'replay-ring': () => {
        const rec = getRingRecording(getActiveTab());
        if (!rec) { showToast({ type: 'info', title: 'Nothing in the ring buffer yet', text: 'Run some output first (or enable the ring in Settings).' }); return; }
        openReplay(rec);
    },
    'files-view': () => { filesView = filesView === 'grid' ? 'list' : 'grid'; storeSet('gk_files_view', filesView); renderFilesList(); syncFilesViewBtn(); },
    'files-select-mode': () => { setFilesSelMode(!filesSelMode); },
    'files-sel-download': () => bulkDownloadSelected(),
    'files-sel-delete': () => bulkDeleteSelected(),
    'files-sel-clear': () => { filesSelected.clear(); renderFilesList(); },
    'push-test': () => testPush(),
    'news-close': () => closeNews(),
    'ai-mic': () => aiMicToggle(),
    'ai-speak': (n) => {
        const item = aiState.ui.find((x) => x.id === n.dataset.id);
        if (item && item.text) speakText(item.text);
    },
    'ai-mp3': (n) => {
        const item = aiState.ui.find((x) => x.id === n.dataset.id);
        if (item && item.text) downloadTextAsMp3(item.text, item.id);
    },
    'voice-cmd': () => aiMicToggle('cmd'),
    'ai-cmd-explain': async (n) => {
        const item = aiState.ui.find((x) => x.id === n.dataset.id);
        if (!item) return;
        n.disabled = true;
        const old = n.textContent;
        n.textContent = '…';
        item.expl = await explainCommandText(item.cmd);
        n.disabled = false;
        n.textContent = old;
        renderAiMessages();
    },
    'file-transcribe': async (n) => {
        const p = n.dataset.path;
        const modal = $('preview-modal');
        const content = $('preview-content');
        const nameEl = $('preview-name');
        if (!modal || !content || !p) return;
        if (nameEl) nameEl.textContent = (n.dataset.name || p.split('/').pop() || p) + ' — transcription';
        setPreviewDownloadVisible(false);
        const imgEl = $('preview-image');
        if (imgEl) imgEl.classList.add('hidden');
        content.classList.remove('hidden');
        content.textContent = 'Transcribing with Whisper…';
        modal.classList.remove('hidden');
        try {
            const data = await api('/api/files/transcribe?path=' + encodeURIComponent(p));
            content.textContent = (data.text && data.text.trim()) ? data.text : '(no speech detected)';
        } catch (e) {
            content.textContent = 'Transcription failed: ' + (e && e.message ? e.message : 'unknown error');
        }
    }
};

function wireUIEvents() {
    buildSymbolRow();
    restoreKeyboardState();

    /* Global data-action click delegation */
    document.addEventListener('click', (e) => {
        const target = e.target.closest ? e.target.closest('[data-action]') : null;
        if (!target) return;
        const fn = ACTIONS[target.dataset.action];
        if (!fn) return;
        e.preventDefault();
        spawnRipple(target, e);
        try { fn(target, e); } catch (err) { console.error('Action failed:', target.dataset.action, err); }
    });

    /* Ripple on press for tactile elements */
    document.addEventListener('pointerdown', (e) => {
        const t = e.target.closest ? e.target.closest('.mk, .tab, .more-tile, .palette-item, .btn-primary') : null;
        if (t) spawnRipple(t, e);
    }, { passive: true });

    /* Only shell-bound keys should pull the soft keyboard back; keys that open
       panels (settings, files, palette…) must not yank focus from the panel. */
    const SHELL_KEY_RE = /^(char:|ctrl-|esc|tab|up|down|left|right|enter|backspace|home|end|pgup|pgdn|del|scroll-)/;
    window.refocusIfShellKey = function (mkey) {
        if (!kbFocusSafety) return;
        kbFocusSafety = false;
        if (!SHELL_KEY_RE.test(mkey || '')) return;
        const tab = getActiveTab();
        if (tab && tab.term && tab.term.focus) { try { tab.term.focus(); } catch (err) {} }
    };

    /* On-screen keys must NOT dismiss the open soft keyboard:
       cancel the focus-stealing default of pointerdown, add a pressed look
       manually, and re-focus the terminal as a safety net on click. */
    const holdKeyboard = (rootSel) => {
        const root = $(rootSel);
        if (!root) return;
        root.addEventListener('pointerdown', (e) => {
            const btn = e.target.closest ? e.target.closest('button') : null;
            if (!btn) return;
            const ta = document.activeElement;
            kbFocusSafety = !!(ta && ta.classList && ta.classList.contains('xterm-helper-textarea'));
            if (e.cancelable) e.preventDefault();
            btn.classList.add('pressed');
        }, { capture: true });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((evn) => {
            root.addEventListener(evn, () => { $$('#' + rootSel + ' button.pressed').forEach((b) => b.classList.remove('pressed')); }, { capture: true });
        });
    };
    holdKeyboard('mobile-keyboard');
    holdKeyboard('float-ball-pad');
    document.addEventListener('pointerdown', (e) => {
        const chip = e.target.closest ? e.target.closest('.pin-chip') : null;
        if (!chip) return;
        kbFocusSafety = !!(document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('xterm-helper-textarea'));
        if (e.cancelable) e.preventDefault();
    }, { capture: true });

    /* Mobile keyboard: pointer-based scroll + click keys */
    const kb = $('mobile-keyboard');
    if (kb) {
        kb.addEventListener('pointerdown', (e) => {
            const btn = e.target.closest('[data-mkey]');
            if (!btn) return;
            const key = btn.dataset.mkey;
            if (key === 'scroll-up') { e.preventDefault(); startScroll('up'); }
            else if (key === 'scroll-down') { e.preventDefault(); startScroll('down'); }
        });
        kb.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-mkey]');
            if (!btn) return;
            handleMKey(btn.dataset.mkey, btn);
            refocusIfShellKey(btn.dataset.mkey);
        });
    }
    ['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, () => stopScroll(), { passive: true }));
    window.addEventListener('blur', () => stopScroll());

    /* Settings controls */
    const bindChange = (id, fn) => {
        const n = $(id);
        if (n) n.addEventListener('change', () => fn(n));
    };
    const bindInput = (id, fn) => {
        const n = $(id);
        if (n) n.addEventListener('input', () => fn(n));
    };

    bindChange('setting-theme-select', (n) => applyTheme(n.value));
    bindChange('setting-font-family', (n) => { saveSettings({ fontFamily: n.value }); applySettingsAll(); });
    bindInput('setting-font-size', (n) => changeFontSizeTo(parseInt(n.value, 10)));
    bindChange('setting-cursor-style', (n) => { saveSettings({ cursorStyle: n.value }); applySettingsAll(); });
    bindChange('setting-cursor-blink', (n) => { saveSettings({ cursorBlink: n.checked }); applySettingsAll(); });
    bindInput('setting-opacity', (n) => {
        const v = parseInt(n.value, 10);
        const chip = $('opacity-value');
        if (chip) chip.textContent = v + '%';
        saveSettings({ opacity: v });
        applyTheme(getActiveThemeId());
    });
    bindChange('setting-mech-keyboard', (n) => { saveSettings({ mechKeyboard: n.checked }); if (n.checked) { ensureAudio(); playMechanicalClick(true); } });
    bindChange('setting-ui-sounds', (n) => { saveSettings({ uiSounds: n.checked }); if (n.checked) { ensureAudio(); playUI('success'); } });
    bindChange('setting-haptics', (n) => { saveSettings({ haptics: n.checked }); buzz(20); });
    bindChange('setting-completion-notif', (n) => {
        saveSettings({ completionNotifications: n.checked });
    bindChange('setting-health-push', (n) => { saveSettings({ healthPush: n.checked }); });
    bindChange('setting-auto-save-rec', (n) => { saveSettings({ autoSaveRecordings: n.checked }); });
        if (n.checked && 'Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission().catch(() => {});
        }
    });
    bindChange('setting-boot-anim', (n) => saveSettings({ bootAnim: n.checked }));
    bindChange('setting-reduced-motion', (n) => { saveSettings({ reducedMotion: n.checked }); applySettingsAll(); });
    bindInput('setting-scroll-speed', (n) => {
        const v = parseInt(n.value, 10);
        const chip = $('scroll-speed-value');
        if (chip) chip.textContent = v;
        saveSettings({ scrollSpeed: v });
    });

    ['custom-color-bg', 'custom-color-fg', 'custom-color-cursor', 'custom-color-accent'].forEach((id) => bindInput(id, updateCustomPreview));

    /* Prompt dialog Enter key */
    const promptInput = $('prompt-input');
    if (promptInput) {
        promptInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); resolvePromptOk(); }
        });
    }

    /* Palette input */
    const palInput = $('palette-input');
    if (palInput) {
        palInput.addEventListener('input', debounce(() => renderPalette(palInput.value), 90));
        palInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'ArrowDown') { e.preventDefault(); selectPaletteIndex(paletteIndex + 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); selectPaletteIndex(paletteIndex - 1); }
            else if (e.key === 'Enter') { e.preventDefault(); runPaletteItem(paletteIndex); }
            else if (e.key === 'Tab') { e.preventDefault(); selectPaletteIndex(paletteIndex + (e.shiftKey ? -1 : 1)); }
        });
    }
    const palOverlay = $('palette-overlay');
    if (palOverlay) {
        palOverlay.addEventListener('mousedown', (e) => { if (e.target === palOverlay) closePalette(); });
    }

    /* Files list navigation (row clicks) */
    const filesList = $('files-list');
    if (filesList) {
        filesList.addEventListener('click', (e) => {
            if (e.target.closest('[data-action]')) return; // action buttons handled globally
            const row = e.target.closest('.file-row');
            if (!row) return;
            const p = row.dataset.path;
            if (filesSelMode) {
                if (filesSelected.has(p)) filesSelected.delete(p); else filesSelected.add(p);
                renderFilesList();
                return;
            }
            if (row.dataset.dir) {
                if (filesSearchActive) { exitFilesSearch(); }
                filesNavigate(p);
            } else {
                previewFileSmart(p);
            }
        });
        /* long-press enters multi-select */
        let lpRow = null, lpTimer2 = null;
        filesList.addEventListener('pointerdown', (e) => {
            const row = e.target.closest('.file-row');
            if (!row || e.target.closest('[data-action]')) return;
            lpRow = row;
            clearTimeout(lpTimer2);
            lpTimer2 = setTimeout(() => {
                if (!lpRow) return;
                if (!filesSelMode) setFilesSelMode(true);
                const p = lpRow.dataset.path;
                if (p) { filesSelected.has(p) ? filesSelected.delete(p) : filesSelected.add(p); renderFilesList(); }
                buzz(12);
                lpRow = null;
            }, 480);
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((evn) => filesList.addEventListener(evn, () => { clearTimeout(lpTimer2); lpRow = null; }));
        filesList.addEventListener('pointermove', () => { if (lpRow && lpTimer2) { /* small moves ok; big scroll cancels via pointercancel */ } }, { passive: true });
    }
    const filesSortSel = $('files-sort');
    if (filesSortSel) {
        filesSortSel.addEventListener('change', () => { filesSort = filesSortSel.value; renderFilesList(); });
    }

    /* Drag & drop upload */
    const dz = $('files-dropzone');
    if (dz) {
        const hint = $('files-drop-hint');
        let dragDepth = 0;
        dz.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; dz.classList.add('dragover'); if (hint) hint.classList.remove('hidden'); });
        dz.addEventListener('dragover', (e) => { e.preventDefault(); });
        dz.addEventListener('dragleave', (e) => { e.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { dz.classList.remove('dragover'); if (hint) hint.classList.add('hidden'); } });
        dz.addEventListener('drop', (e) => {
            e.preventDefault();
            dragDepth = 0;
            dz.classList.remove('dragover');
            if (hint) hint.classList.add('hidden');
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length) {
                uploadToCurrentFilesFolder(dt.files);
            }
        });
    }

    /* Share tab select */
    const shareSelect = $('share-tab-select');
    if (shareSelect) shareSelect.addEventListener('change', () => onShareTabSelectChange(shareSelect.value));

    /* Macro form Enter-to-save */
    const macroName = $('macro-name');
    if (macroName) {
        macroName.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); saveMacroFromForm(); }
        });
    }
    const macroCmd = $('macro-command');
    if (macroCmd) {
        macroCmd.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveMacroFromForm(); }
        });
    }

    /* Hide context menu on any outside interaction */
    document.addEventListener('pointerdown', (e) => {
        const menu = $('context-menu');
        if (menu && !menu.classList.contains('hidden') && !(e.target.closest && e.target.closest('#context-menu'))) {
            hideContextMenu();
        }
    }, { capture: true, passive: true });
    window.addEventListener('resize', () => hideContextMenu());

    /* Share link input click-to-select */
    const linkInput = $('share-link-input');
    if (linkInput) linkInput.addEventListener('click', () => linkInput.select());

    /* ── 3.0 bindings ── */

    /* Chat input */
    const chatInput = $('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); chatSendFromInput(); }
        });
    }

    /* Files search input */
    const filesSearch = $('files-search-input');
    if (filesSearch) {
        filesSearch.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); runFilesSearch(filesSearch.value); }
            if (e.key === 'Escape') { e.preventDefault(); exitFilesSearch(); filesSearch.blur(); }
        });
    }

    /* Trigger enable/disable toggles (delegated) */
    document.addEventListener('change', (e) => {
        const t = e.target.closest ? e.target.closest('[data-action-input="trigger-toggle"]') : null;
        if (!t) return;
        const list = getTriggers();
        const trig = list.find((x) => x.id === t.dataset.id);
        if (trig) {
            trig.enabled = t.checked;
            saveTriggers(list);
            renderTriggers();
        }
    });

    /* Trigger form Enter-to-save */
    ['trigger-name', 'trigger-pattern'].forEach((id) => {
        const n = $(id);
        if (n) n.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); saveTriggerFromForm(); }
        });
    });

    /* Replay controls */
    const scrub = $('replay-scrub');
    if (scrub) {
        scrub.addEventListener('pointerdown', () => { scrubDragging = true; });
        ['pointerup', 'pointercancel'].forEach((evn) => window.addEventListener(evn, () => { scrubDragging = false; }));
        scrub.addEventListener('keydown', (e) => { e.stopPropagation(); });
        scrub.addEventListener('input', () => {
            if (replayState) replaySeek(parseInt(scrub.value, 10) / 1000);
        });
    }
    const speedSel = $('replay-speed');
    if (speedSel) {
        speedSel.addEventListener('change', () => {
            if (replayState) replayState.speed = parseFloat(speedSel.value) || 1;
        });
    }

    /* Theme import file input */
    const themeImport = $('theme-import-input');
    if (themeImport) {
        themeImport.addEventListener('change', () => {
            const f = themeImport.files && themeImport.files[0];
            if (f) importThemeFile(f);
            themeImport.value = '';
        });
    }

    /* Profile modal Enter-to-create */
    ['profile-name', 'profile-cwd'].forEach((id) => {
        const n = $(id);
        if (n) n.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); createProfileTab(); }
        });
    });

    /* Task input rows: Enter sends the line */
    document.addEventListener('keydown', (e) => {
        const inp = e.target && e.target.closest ? e.target.closest('[data-task-input]') : null;
        if (!inp) return;
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            sendTaskInput(inp.dataset.taskInput, inp.value + '\n', inp);
        }
    }, true);

    /* Float-ball pad keys reuse the mobile deck transmitter */
    const pad = $('float-ball-pad');
    if (pad) {
        pad.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-mkey]');
            if (!btn) return;
            e.stopPropagation();
            handleMKey(btn.dataset.mkey, btn);
            if (btn.dataset.mkey !== 'ball-close' && btn.dataset.mkey !== 'kb-toggle') toggleBallPad(false);
            refocusIfShellKey(btn.dataset.mkey);
        });
    }

    /* Schedule type select shows/hides the right input */
    const schedType = $('sched-type');
    if (schedType) schedType.addEventListener('change', syncScheduleInputs);
    ['sched-name', 'sched-cmd'].forEach((id) => {
        const n = $(id);
        if (n) n.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); saveScheduleFromForm(); } });
    });
    document.addEventListener('change', (e) => {
        const t = e.target.closest ? e.target.closest('[data-action-input="sched-toggle"]') : null;
        if (t) scheduleToggle(t.dataset.id, t.checked);
    });

    /* Ring / float-ball / task form settings */
    bindChange('setting-ring-secs', (n) => { saveSettings({ ringSecs: parseInt(n.value, 10) }); });
    bindChange('setting-float-ball', (n) => { saveSettings({ floatBall: n.checked }); initFloatBall(); });
    bindChange('setting-push', (n) => togglePush(n.checked));
    bindChange('setting-ai-voice-on', (n) => {
        saveSettings({ aiVoice: n.checked });
        if (!n.checked) stopSpeaking();
        else showToast({ type: 'info', title: 'Voice replies on', text: 'Assistant answers will be read aloud (Orpheus TTS).', duration: 2600 });
    });
    bindChange('setting-ai-voice', (n) => saveSettings({ aiVoiceName: n.value }));
    bindChange('ai-model-quick', async (n) => {
        const v = n.value;
        if (!v) return;
        try {
            const res = await api('/api/ai/config', { method: 'POST', body: { model: v } });
            const chip = $('ai-model-chip');
            if (chip) { chip.textContent = ((res && res.model) || v).split('/').pop(); chip.title = (res && res.model) || v; }
            showToast({ type: 'success', title: 'Model switched', text: ((res && res.model) || v) });
        } catch (e) {
            showToast({ type: 'error', title: 'Model switch failed', text: e && e.message ? e.message : '' });
            loadAiConfig();
        }
    });
    bindChange('setting-ai-model', (n) => {
        const row = $('ai-model-custom-row');
        if (row) row.classList.toggle('hidden', n.value !== '__custom');
    });
    ['task-name', 'task-cmd', 'task-cwd'].forEach((id) => {
        const n = $(id);
        if (n) n.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || id !== 'task-cmd')) { e.preventDefault(); createTaskFromForm(); } });
    });

    /* AI input: Enter sends, Shift+Enter newline, autosize */
    const aiInput = $('ai-input');
    if (aiInput) {
        aiInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSendFromInput(); }
        });
        aiInput.addEventListener('input', () => aiAutosizeInput(aiInput));
    }
    bindInput('setting-ai-timeout', (n) => {
        const v = parseInt(n.value, 10) || 20;
        const chip = $('ai-timeout-value');
        if (chip) chip.textContent = v + 's';
        saveSettings({ aiTimeout: v });
    });
    bindInput('setting-ai-maxtokens', (n) => {
        const chip = $('ai-maxtokens-value');
        if (chip) chip.textContent = n.value;
    });

    /* Auto-theme settings controls */
    bindChange('setting-auto-theme', (n) => {
        saveSettings({ autoTheme: n.checked });
        const picks = $('auto-theme-picks');
        if (picks) picks.classList.toggle('hidden', !n.checked);
        applyAutoTheme(true);
        if (n.checked) showToast({ type: 'success', title: 'Auto theme on', text: 'Light 07:00–19:00, dark otherwise.', duration: 2800 });
    });
    bindChange('setting-light-theme', (n) => { saveSettings({ lightThemeId: n.value }); applyAutoTheme(true); });
    bindChange('setting-dark-theme', (n) => { saveSettings({ darkThemeId: n.value }); applyAutoTheme(true); });
    bindChange('setting-pin-bar', (n) => { saveSettings({ showPinBar: n.checked }); renderPinBar(); });

    startTasksBadgePoll();

    /* Keep replay sized with the window; reposition tour on rotate/resize */
    window.addEventListener('resize', debounce(() => {
        if (replayState && replayState.fitAddon) { try { replayState.fitAddon.fit(); } catch (e) {} }
        const tourEl = $('tour-overlay');
        if (tourEl && !tourEl.classList.contains('hidden')) showTourStep();
    }, 150));

    /* Right-click (or long-press) the + button for a profiled tab */
    const newTabBtn = $('new-tab-btn');
    if (newTabBtn) {
        let lpTimer = null;
        let lpFired = false;
        newTabBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openProfileModal();
        });
        newTabBtn.addEventListener('pointerdown', () => {
            lpFired = false;
            lpTimer = setTimeout(() => { lpTimer = null; lpFired = true; openProfileModal(); }, 600);
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((evName) => {
            newTabBtn.addEventListener(evName, () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
        });
        newTabBtn.addEventListener('click', (e) => {
            if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
            if (lpFired) { e.stopPropagation(); e.preventDefault(); lpFired = false; }
        });
    }

    /* Font chip click → settings */
    const fontChip = $('font-chip');
    if (fontChip) fontChip.style.cursor = 'pointer';
}

function uploadToCurrentFilesFolder(fileList) {
    const dest = filesCurrentPath;
    if (!dest) { showToast({ type: 'warn', title: 'Open a folder first' }); return; }
    const files = Array.from(fileList);
    const formData = new FormData();
    if (activeTabId) formData.append('tabId', activeTabId);
    formData.append('dest', dest);
    files.forEach((f) => formData.append('file', f));

    const label = files.length === 1 ? files[0].name : `${files.length} files`;
    showToast({ id: 'upload-progress', type: 'info', title: 'Uploading…', text: `${label} → ${dest}`, duration: 60000, silent: true });

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        showToast({ id: 'upload-progress', type: 'info', title: `Uploading… ${pct}%`, text: `${label} → ${dest}`, duration: 60000, silent: true });
    });
    xhr.onload = () => {
        let body = null;
        try { body = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200 && body && body.success) {
            showToast({ id: 'upload-progress', type: 'success', title: 'Upload complete', text: (body.saved || []).join(', ') || label });
            loadFiles(false);
        } else {
            showToast({ id: 'upload-progress', type: 'error', title: 'Upload failed', text: (body && (body.error || (body.errors || []).join('; '))) || `HTTP ${xhr.status}` });
        }
    };
    xhr.onerror = () => showToast({ id: 'upload-progress', type: 'error', title: 'Upload failed', text: 'Network error' });
    xhr.open('POST', '/upload', true);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.send(formData);
}

/* ─────────────── PWA ─────────────── */

function registerSW() {
    try {
        if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
    } catch (e) {}
}

/* ─────────────── Theme change hook for viewer select ─────────────── */

function onThemeSelectChange(themeId) { applyTheme(themeId); }

/* ═══════════════════════ 3.0 SUBSYSTEMS ═══════════════════════ */

/* ─────────────── Session chat ─────────────── */

let chatLog = [];
let chatUnread = 0;

function addChatMessage(msg) {
    chatLog.push(msg);
    if (chatLog.length > 300) chatLog.shift();
    const open = $('chat-drawer') && !$('chat-drawer').classList.contains('hidden');
    if (!open && !msg.self) {
        chatUnread++;
        if (typeof playUI === 'function') playUI('click');
    }
    updateChatBadges();
    renderChat();
}

function addChatSystemMessage(text) {
    chatLog.push({ system: true, text, t: Date.now() });
    if (chatLog.length > 300) chatLog.shift();
    renderChat();
}

function updateChatBadges() {
    const btnBadge = $('chat-btn-badge');
    const chipBadge = $('chat-chip-badge');
    const viewerBadge = $('viewer-chat-badge');
    const chip = $('chat-chip');
    [btnBadge, chipBadge, viewerBadge].forEach((b) => {
        if (!b) return;
        b.textContent = chatUnread > 99 ? '99+' : String(chatUnread);
        b.classList.toggle('hidden', chatUnread === 0);
    });
    if (chip) chip.classList.toggle('hidden', !(chatUnread > 0 || chatLog.length > 0));
}

let chatRenderedCount = 0;
let chatRenderedSig = '';

function chatMsgNode(m) {
    const div = el('div', 'chat-msg ' + (m.system ? 'system' : m.self ? 'me' : 'them'));
    const time = m.t ? new Date(m.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    if (m.system) {
        div.innerHTML = `<div class="chat-bubble">${escHtml(m.text)}</div>`;
    } else {
        div.innerHTML = `<div class="chat-bubble">${escHtml(m.text)}</div><div class="chat-meta">${escHtml(m.self ? 'you' : (m.from || 'guest'))} · ${escHtml(time)}</div>`;
    }
    return div;
}

function renderChat() {
    const box = $('chat-messages');
    if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    const sig = chatLog.length ? ('m' + String(chatLog[0].t || 0)) : 'empty';
    if (sig !== chatRenderedSig) {
        box.innerHTML = '';
        chatRenderedCount = 0;
        chatRenderedSig = sig;
        if (!chatLog.length) {
            box.innerHTML = '<div class="activity-empty">No messages yet. Say hello 👋</div>';
            return;
        }
    }
    const emptyEl = box.querySelector('.activity-empty');
    if (emptyEl && chatLog.length) emptyEl.remove();
    for (let i = chatRenderedCount; i < chatLog.length; i++) box.appendChild(chatMsgNode(chatLog[i]));
    const grew = chatLog.length > chatRenderedCount;
    chatRenderedCount = chatLog.length;
    if (atBottom || grew) box.scrollTop = box.scrollHeight;
}

function toggleChat() {
    const drawer = $('chat-drawer');
    if (!drawer) return;
    const opening = drawer.classList.contains('hidden');
    if (opening) {
        closeDrawer('files-drawer');
        closeDrawer('stats-drawer');
        closeDrawer('activity-drawer');
        closeDrawer('ai-drawer');
    }
    drawer.classList.toggle('hidden', !opening);
    if (opening) {
        chatUnread = 0;
        updateChatBadges();
        renderChat();
        const input = $('chat-input');
        if (input) setTimeout(() => input.focus(), 120);
        const box = $('chat-messages');
        if (box) box.scrollTop = box.scrollHeight;
    }
}

function chatSendFromInput() {
    const input = $('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    if (sendChat(text)) {
        input.value = '';
        buzz(8);
    }
}

/* ─────────────── Activity center & insights ─────────────── */

let activityUnread = 0;

function onActivityLogged() {
    const open = $('activity-drawer') && !$('activity-drawer').classList.contains('hidden');
    if (!open) {
        activityUnread++;
        const badge = $('activity-btn-badge');
        if (badge) {
            badge.textContent = activityUnread > 99 ? '99+' : String(activityUnread);
            badge.classList.remove('hidden');
        }
    } else {
        renderActivity();
    }
    renderInsights();
}

const ACTIVITY_ICONS = {
    success: '#i-check', error: '#i-alert', warn: '#i-bell', info: '#i-info'
};

let activityRenderedFirstKey = null;

function renderActivity() {
    const box = $('activity-list');
    if (!box) return;
    const log = getActivityLog();
    if (!log.length) {
        box.innerHTML = '<div class="activity-empty">Nothing has happened yet — run a command!</div>';
        activityRenderedFirstKey = null;
        return;
    }
    /* how many entries are new since the last render? (log is unshifted) */
    let newCount = log.length;
    if (activityRenderedFirstKey !== null) {
        const idx = log.findIndex((x) => x.t + '|' + x.text === activityRenderedFirstKey);
        if (idx >= 0) newCount = idx;
    }
    activityRenderedFirstKey = log[0].t + '|' + log[0].text;
    box.innerHTML = '';
    log.slice(0, 120).forEach((item, i) => {
        const row = el('div', 'activity-item kind-' + (item.kind || 'info') + (i >= newCount ? ' no-anim' : ''));
        row.style.animationDelay = Math.min(i * 12, 200) + 'ms';
        row.innerHTML = `
            <span class="act-icon"><svg class="ic ic-sm"><use href="${ACTIVITY_ICONS[item.kind] || '#i-info'}"></use></svg></span>
            <span class="act-text">${escHtml(item.text)}</span>
            <span class="act-time">${escHtml(new Date(item.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>`;
        box.appendChild(row);
    });
}

function renderInsights() {
    const i = getInsights();
    if (!i.startedAt) { i.startedAt = pageStartedAt; saveInsights(i); }
    const setTxt = (id, v) => { const n = $(id); if (n) n.textContent = v; };
    setTxt('insight-cmds', String(i.cmds || 0));
    setTxt('insight-triggers', String(i.triggers || 0));
    setTxt('insight-longest', i.longestMs ? (i.longestMs / 1000).toFixed(1) + 's' : '—');
    setTxt('insight-age', fmtUptime((Date.now() - (i.startedAt || Date.now())) / 1000));
}

function toggleActivity() {
    const drawer = $('activity-drawer');
    if (!drawer) return;
    const opening = drawer.classList.contains('hidden');
    if (opening) {
        closeDrawer('files-drawer');
        closeDrawer('stats-drawer');
        closeDrawer('chat-drawer');
        closeDrawer('ai-drawer');
        renderActivity();
        renderInsights();
    }
    drawer.classList.toggle('hidden', !opening);
    if (opening) {
        activityUnread = 0;
        const badge = $('activity-btn-badge');
        if (badge) badge.classList.add('hidden');
    }
}

function clearActivity() {
    sessSet(K.activity, []);
    renderActivity();
    showToast({ type: 'info', title: 'Activity log cleared', duration: 2000 });
}

/* ─────────────── Replay engine ─────────────── */

function openReplay(forcedRec) {
    const rec = forcedRec || getLatestRecording();
    if (!rec || !rec.chunks || !rec.chunks.length) {
        showToast({ type: 'info', title: 'No recording yet', text: 'Hit the record button (or “Record active tab” in the palette) first.' });
        return;
    }
    const modal = $('replay-modal');
    const holder = $('replay-term');
    const title = $('replay-title');
    if (!modal || !holder) return;
    if (title) title.textContent = `Replay — ${rec.title}`;

    disposeReplayTerm();
    const term = new Terminal(Object.assign(termOptions(), { disableStdin: true, scrollback: 200000 })); // eslint-disable-line no-undef
    const fit = new FitAddon.FitAddon(); // eslint-disable-line no-undef
    term.loadAddon(fit);
    term.open(holder);
    modal.classList.remove('hidden');
    setTimeout(() => { try { fit.fit(); } catch (e) {} }, 90);

    replayState = {
        chunks: rec.chunks,
        idx: 0,
        playing: false,
        speed: parseFloat(($('replay-speed') || {}).value || '1'),
        timer: null,
        term,
        fitAddon: fit,
        live: !!rec.live
    };
    updateReplayPlayIcon();
    updateReplayUI();
    playUI('click');
}

function disposeReplayTerm() {
    if (replayState) {
        if (replayState.timer) clearTimeout(replayState.timer);
        try { replayState.term.dispose(); } catch (e) {}
    }
    replayState = null;
}

function closeReplay() {
    disposeReplayTerm();
    const modal = $('replay-modal');
    if (modal) modal.classList.add('hidden');
}

function replayTotalMs() {
    if (!replayState || !replayState.chunks.length) return 0;
    return replayState.chunks[replayState.chunks.length - 1].t || 0;
}

let scrubDragging = false;

function updateReplayUI() {
    if (!replayState) return;
    const total = replayTotalMs();
    const cur = replayState.idx > 0 ? (replayState.chunks[Math.min(replayState.idx, replayState.chunks.length) - 1].t || 0) : 0;
    const scrub = $('replay-scrub');
    if (scrub && !scrubDragging) scrub.value = total > 0 ? Math.round((cur / total) * 1000) : 0;
    const fmt = (ms) => {
        const s = Math.floor(ms / 1000);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    const t = $('replay-time');
    if (t) t.textContent = `${fmt(cur)} / ${fmt(total)}`;
}

function updateReplayPlayIcon() {
    const btn = $('replay-play-btn');
    if (!btn) return;
    const use = btn.querySelector('use');
    if (use) use.setAttribute('href', replayState && replayState.playing ? '#i-pause' : '#i-play');
}

function replayTick() {
    if (!replayState || !replayState.playing) return;
    const rs = replayState;
    if (rs.idx >= rs.chunks.length) {
        rs.playing = false;
        updateReplayPlayIcon();
        return;
    }
    const prevT = rs.idx > 0 ? rs.chunks[rs.idx - 1].t : 0;
    const chunk = rs.chunks[rs.idx];
    try { rs.term.write(chunk.d); } catch (e) {}
    rs.idx++;
    updateReplayUI();
    let delay = (chunk.t - prevT) / (rs.speed || 1);
    delay = Math.max(0, Math.min(delay, 2500));
    rs.timer = setTimeout(replayTick, delay);
}

function replayPlayPause() {
    if (!replayState) return;
    if (replayState.playing) {
        replayState.playing = false;
        if (replayState.timer) clearTimeout(replayState.timer);
    } else {
        if (replayState.idx >= replayState.chunks.length) replaySeek(0);
        replayState.playing = true;
        replayState.timer = setTimeout(replayTick, 30);
    }
    updateReplayPlayIcon();
}

function replayRestart() {
    if (!replayState) return;
    replaySeek(0);
    if (!replayState.playing) replayPlayPause();
}

function replaySeek(frac) {
    const rs = replayState;
    if (!rs) return;
    const total = replayTotalMs();
    const targetMs = clamp(frac, 0, 1) * total;
    try { rs.term.reset(); } catch (e) {}
    let i = 0;
    let buf = '';
    while (i < rs.chunks.length && rs.chunks[i].t <= targetMs) {
        buf += rs.chunks[i].d;
        i++;
        if (buf.length > 250000) { try { rs.term.write(buf); } catch (e) {} buf = ''; }
    }
    if (buf) { try { rs.term.write(buf); } catch (e) {} }
    rs.idx = i;
    updateReplayUI();
    if (rs.playing) {
        if (rs.timer) clearTimeout(rs.timer);
        rs.timer = setTimeout(replayTick, 40);
    }
}

function replayExport() {
    const rec = getLatestRecording();
    if (!rec || !rec.chunks.length) { showToast({ type: 'warn', title: 'Nothing to export' }); return; }
    const lines = rec.chunks.map((c) => JSON.stringify({ t: c.t, d: c.d }));
    const blob = new Blob(['{"app":"garuda-konsole","version":' + JSON.stringify(APP_VERSION) + ',"frames":' + lines.length + '}\n' + lines.join('\n')], { type: 'application/x-ndjson' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = `garuda-replay-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.jsonl`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    showToast({ type: 'success', title: 'Recording exported', text: a.download });
}

/* ─────────────── Triggers UI ─────────────── */

let triggerEditId = null;

function openTriggers() {
    const modal = $('triggers-modal');
    if (!modal) return;
    renderTriggers();
    resetTriggerForm();
    modal.classList.remove('hidden');
}
function closeTriggers() {
    const modal = $('triggers-modal');
    if (modal) modal.classList.add('hidden');
}

function resetTriggerForm() {
    triggerEditId = null;
    ['trigger-name', 'trigger-pattern', 'trigger-test-input'].forEach((id) => { const n = $(id); if (n) n.value = ''; });
    const c = $('trigger-case'); if (c) c.checked = false;
    const t = $('trigger-act-toast'); if (t) t.checked = true;
    const s = $('trigger-act-sound'); if (s) s.checked = true;
    const n = $('trigger-act-notify'); if (n) n.checked = false;
    const sc = $('trigger-scope'); if (sc) sc.value = 'all';
    const label = $('trigger-save-label'); if (label) label.textContent = 'Add trigger';
    const res = $('trigger-test-result'); if (res) { res.textContent = ''; res.className = 'trigger-test-result'; }
}

function renderTriggers() {
    const box = $('trigger-list');
    if (!box) return;
    const list = getTriggers();
    box.innerHTML = '';
    if (!list.length) {
        box.innerHTML = '<div class="files-empty"><svg class="ic"><use href="#i-bell"></use></svg><span>No triggers yet — add your first above.<br>Try: <code>error|failed</code> or <code>BUILD SUCCESS</code></span></div>';
        return;
    }
    list.forEach((t, i) => {
        const row = el('div', 'trigger-row' + (t.enabled === false ? ' disabled' : ''));
        row.style.animationDelay = Math.min(i * 20, 240) + 'ms';
        const acts = [];
        if ((t.actions || {}).toast !== false) acts.push('toast');
        if ((t.actions || {}).sound) acts.push('sound');
        if ((t.actions || {}).notify) acts.push('push');
        row.innerHTML = `
            <div class="trigger-main">
                <div class="trigger-name">${escHtml(t.name)}
                    <span class="trigger-badge">${t.scope === 'active' ? 'active tab' : 'all tabs'}</span>
                    <span class="trigger-badge">${escHtml(acts.join(' · ') || 'silent')}</span>
                </div>
                <div class="trigger-pattern">/${escHtml(t.pattern)}/${t.caseSensitive ? '' : 'i'}</div>
            </div>
            <div class="trigger-actions">
                <label class="toggle-switch" style="width:38px;height:21px"><input type="checkbox" data-action-input="trigger-toggle" data-id="${escHtml(t.id)}" ${t.enabled !== false ? 'checked' : ''} /><span class="toggle-track"></span></label>
                <button class="icon-btn" data-action="trigger-edit" data-id="${escHtml(t.id)}" title="Edit"><svg class="ic"><use href="#i-edit"></use></svg></button>
                <button class="icon-btn macro-del" data-action="trigger-del" data-id="${escHtml(t.id)}" title="Delete"><svg class="ic"><use href="#i-trash"></use></svg></button>
            </div>`;
        box.appendChild(row);
    });
}

function saveTriggerFromForm() {
    const name = ($('trigger-name').value || '').trim();
    const pattern = ($('trigger-pattern').value || '').trim();
    if (!name) { showToast({ type: 'warn', title: 'Trigger needs a name' }); return; }
    if (!pattern) { showToast({ type: 'warn', title: 'Trigger needs a regex pattern' }); return; }
    let re;
    try { re = new RegExp(pattern); } catch (e) {
        showToast({ type: 'error', title: 'Invalid regex', text: e.message });
        return;
    }
    const list = getTriggers();
    const actions = {
        toast: $('trigger-act-toast').checked,
        sound: $('trigger-act-sound').checked,
        notify: $('trigger-act-notify').checked
    };
    if (actions.notify && 'Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission().catch(() => {});
    }
    const entry = {
        name: name.slice(0, 40),
        pattern: pattern.slice(0, 200),
        caseSensitive: $('trigger-case').checked,
        scope: $('trigger-scope').value === 'active' ? 'active' : 'all',
        actions,
        enabled: true
    };
    if (triggerEditId) {
        const idx = list.findIndex((t) => t.id === triggerEditId);
        if (idx >= 0) list[idx] = Object.assign(list[idx], entry);
        showToast({ type: 'success', title: 'Trigger updated', text: entry.name });
    } else {
        entry.id = uid('trg');
        list.unshift(entry);
        showToast({ type: 'success', title: 'Trigger armed', text: `/${entry.pattern}/ watching output` });
        logActivity('info', `Trigger "${entry.name}" created`);
    }
    saveTriggers(list);
    renderTriggers();
    resetTriggerForm();
}

function triggerEdit(id) {
    const t = getTriggers().find((x) => x.id === id);
    if (!t) return;
    triggerEditId = id;
    $('trigger-name').value = t.name;
    $('trigger-pattern').value = t.pattern;
    $('trigger-case').checked = !!t.caseSensitive;
    $('trigger-act-toast').checked = (t.actions || {}).toast !== false;
    $('trigger-act-sound').checked = !!(t.actions || {}).sound;
    $('trigger-act-notify').checked = !!(t.actions || {}).notify;
    $('trigger-scope').value = t.scope === 'active' ? 'active' : 'all';
    $('trigger-save-label').textContent = 'Update trigger';
    $('trigger-name').focus();
}

async function triggerDelete(id) {
    const t = getTriggers().find((x) => x.id === id);
    if (!t) return;
    const ok = await showConfirm({ title: 'Delete trigger?', message: `"${t.name}" will stop watching output.`, okLabel: 'Delete' });
    if (!ok) return;
    saveTriggers(getTriggers().filter((x) => x.id !== id));
    renderTriggers();
    if (triggerEditId === id) resetTriggerForm();
}

function triggerTest() {
    const pattern = ($('trigger-pattern').value || '').trim();
    const sample = $('trigger-test-input').value || '';
    const res = $('trigger-test-result');
    if (!pattern || !sample) { res.textContent = 'need pattern + sample'; res.className = 'trigger-test-result miss'; return; }
    let hit = false;
    try {
        const re = new RegExp(pattern, $('trigger-case').checked ? '' : 'i');
        hit = re.test(sample);
    } catch (e) {
        res.textContent = 'bad regex';
        res.className = 'trigger-test-result miss';
        return;
    }
    res.textContent = hit ? '✓ MATCH' : '✗ no match';
    res.className = 'trigger-test-result ' + (hit ? 'hit' : 'miss');
    if (hit) playUI('success');
}

/* ─────────────── Tab profiles UI ─────────────── */

const TAB_COLORS = ['#ff5566', '#f6a609', '#2fd07a', '#00c8ff', '#3d7bff', '#a78bfa', '#ff6bcb', '#94a3b8'];
let profileColor = null;

async function openProfileModal() {
    const modal = $('profile-modal');
    if (!modal) return;
    $('profile-name').value = '';
    $('profile-cwd').value = '';
    profileColor = null;
    renderProfileColors();
    modal.classList.remove('hidden');
    await populateProfileShells();
    $('profile-name').focus();
}
function closeProfileModal() {
    const modal = $('profile-modal');
    if (modal) modal.classList.add('hidden');
}

async function populateProfileShells() {
    const sel = $('profile-shell');
    if (!sel) return;
    if (!shellsCache) {
        try {
            const data = await api('/api/shells');
            shellsCache = data.shells || [];
        } catch (e) {
            shellsCache = [{ name: serverMeta.shell || 'sh', path: '', isDefault: true }];
        }
    }
    sel.innerHTML = '';
    shellsCache.forEach((s) => {
        const opt = el('option');
        opt.value = s.name;
        opt.textContent = s.name + (s.isDefault ? ' · default' : '');
        sel.appendChild(opt);
    });
}

function renderProfileColors() {
    const box = $('profile-colors');
    if (!box) return;
    box.innerHTML = '';
    const none = el('button', 'color-dot none-dot' + (profileColor === null ? ' selected' : ''), '∅');
    none.type = 'button';
    none.title = 'No color';
    none.addEventListener('click', () => { profileColor = null; renderProfileColors(); });
    box.appendChild(none);
    TAB_COLORS.forEach((c) => {
        const d = el('button', 'color-dot' + (profileColor === c ? ' selected' : ''));
        d.type = 'button';
        d.style.background = c;
        d.style.color = c;
        d.title = c;
        d.addEventListener('click', () => { profileColor = c; renderProfileColors(); });
        box.appendChild(d);
    });
}

function createProfileTab() {
    const name = ($('profile-name').value || '').trim();
    const shell = ($('profile-shell').value || '') || null;
    const cwd = ($('profile-cwd').value || '').trim() || null;
    closeProfileModal();
    const id = createNewTab(null, name || undefined, { shell, cwd, color: profileColor, name: name || null });
    if (id) {
        showToast({ type: 'success', title: 'Tab created', text: `${name || shell || 'shell'}${cwd ? ' in ' + cwd : ''}`, duration: 2600 });
        logActivity('info', `New profile tab${name ? ' "' + name + '"' : ''}${shell ? ' (' + shell + ')' : ''}${cwd ? ' in ' + cwd : ''}`);
    }
}

function profileUseCwd() {
    const tab = getActiveTab();
    const input = $('profile-cwd');
    if (!input) return;
    input.value = (tab && tab.cwd) || (typeof getFilesCurrentPath === 'function' && getFilesCurrentPath()) || '';
    if (!input.value) showToast({ type: 'info', title: 'cwd not known yet', text: 'Wait a moment for the shell to report it.' });
}
function profileUseHome() {
    const input = $('profile-cwd');
    if (input) input.value = filesHomePath || '~';
}

function cycleTabColor(tabId) {
    const tab = tabs[tabId];
    if (!tab) return;
    const idx = tab.color ? TAB_COLORS.indexOf(tab.color) : -1;
    const next = TAB_COLORS[(idx + 1) % (TAB_COLORS.length + 1)];
    tab.color = (idx + 1) % (TAB_COLORS.length + 1) === TAB_COLORS.length ? null : next;
    if (tab.color) {
        tab.colorDot.style.background = tab.color;
        tab.colorDot.style.color = tab.color;
        tab.colorDot.classList.remove('hidden');
    } else {
        tab.colorDot.classList.add('hidden');
    }
    persistTabList();
}

/* ─────────────── Pinned macro bar ─────────────── */

function renderPinBar() {
    const bar = $('pin-bar');
    if (!bar) return;
    const s = getSettings();
    const pins = getMacros().filter((m) => m.pinned);
    if (!s.showPinBar || !pins.length || isViewerSession) {
        bar.classList.add('hidden');
        bar.innerHTML = '';
        return;
    }
    bar.classList.remove('hidden');
    bar.innerHTML = '<span class="pin-bar-label"><svg class="ic ic-sm"><use href="#i-pin"></use></svg>Pinned</span>';
    pins.forEach((m) => {
        const chip = el('button', 'pin-chip');
        chip.dataset.action = 'pin-run';
        chip.dataset.id = m.id;
        chip.title = m.cmd;
        chip.innerHTML = `<svg class="ic"><use href="#i-play"></use></svg>${escHtml(m.name)}`;
        bar.appendChild(chip);
    });
}

function macroTogglePin(id) {
    const macros = getMacros();
    const m = macros.find((x) => x.id === id);
    if (!m) return;
    m.pinned = !m.pinned;
    saveMacros(macros);
    renderMacros();
    renderPinBar();
    showToast({ type: 'info', title: m.pinned ? 'Pinned to quick bar' : 'Unpinned', text: m.name, duration: 1800, silent: true });
}

/* ─────────────── Theme import / export ─────────────── */

function exportTheme() {
    const id = getActiveThemeId();
    const data = customThemes[id] || BUILTIN_THEMES[id];
    if (!data) return;
    const payload = { name: data.name, theme: data.theme };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = `garuda-theme-${data.name.toLowerCase().replace(/[^\w]+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    showToast({ type: 'success', title: 'Theme exported', text: a.download });
}

function importThemePick() {
    const input = $('theme-import-input');
    if (input) input.click();
}

function readBlobText(file) {
    return new Promise((resolve, reject) => {
        if (file && typeof file.text === 'function') {
            file.text().then(resolve, reject);
            return;
        }
        try {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => reject(fr.error || new Error('Could not read file'));
            fr.readAsText(file);
        } catch (e) { reject(e); }
    });
}

async function importThemeFile(file) {
    if (!file) return;
    try {
        const text = await readBlobText(file);
        const data = JSON.parse(text);
        if (!data || typeof data.name !== 'string' || !data.theme || !/^#[0-9a-fA-F]{6}$/.test(data.theme.background || '')) {
            throw new Error('File must contain { name, theme: { background: "#rrggbb", … } }');
        }
        const res = await api('/api/custom-themes', { method: 'POST', body: data });
        customThemes[res.theme.id] = res.theme;
        renderThemeOptions();
        applyTheme(res.theme.id);
        showToast({ type: 'success', title: 'Theme imported', text: res.theme.name });
        logActivity('success', `Theme "${res.theme.name}" imported`);
    } catch (err) {
        showToast({ type: 'error', title: 'Import failed', text: err.message || 'Invalid theme file' });
    }
}

/* ─────────────── File search & details ─────────────── */

let filesSearchActive = false;

async function runFilesSearch(q) {
    const list = $('files-list');
    const status = $('files-status');
    if (!list) return;
    q = String(q || '').trim();
    if (!q) { exitFilesSearch(); return; }
    filesSearchActive = true;
    const clearBtn = $('files-search-clear');
    if (clearBtn) clearBtn.classList.remove('hidden');
    list.innerHTML = '<div class="files-skeleton">' + '<div class="skel-row"></div>'.repeat(5) + '</div>';
    if (status) status.textContent = 'searching…';
    try {
        const root = filesCurrentPath || '';
        const data = await api(`/api/files/search?path=${encodeURIComponent(root)}&q=${encodeURIComponent(q)}`);
        const results = data.results || [];
        list.innerHTML = '';
        if (!results.length) {
            list.innerHTML = `<div class="files-empty"><svg class="ic"><use href="#i-search"></use></svg><span>No matches for “${escHtml(q)}” under ${escHtml(data.root)}</span></div>`;
            if (status) status.textContent = '';
            return;
        }
        results.forEach((r, i) => {
            const rel = r.path.startsWith(data.root) ? r.path.slice(data.root.length) : r.path;
            const row = el('div', 'file-row' + (r.dir ? ' is-dir' : '') + (r.link ? ' is-link' : ''));
            row.dataset.path = r.path;
            row.dataset.name = r.name;
            row.dataset.dir = r.dir ? '1' : '';
            row.style.animationDelay = Math.min(i * 12, 240) + 'ms';
            row.innerHTML = `
                <span class="file-ic"><svg class="ic"><use href="${fileIconFor(r)}"></use></svg></span>
                <div class="file-main">
                    <span class="file-name">${escHtml(r.name)}</span>
                    <span class="file-rel-path">${escHtml(rel || r.path)}</span>
                </div>
                <div class="file-actions">
                    ${r.dir ? '' : `<button class="icon-btn" data-action="file-download" data-path="${escHtml(r.path)}" title="Download"><svg class="ic"><use href="#i-download"></use></svg></button>`}
                    <button class="icon-btn" data-action="file-details" data-path="${escHtml(r.path)}" title="Details"><svg class="ic"><use href="#i-info"></use></svg></button>
                </div>`;
            list.appendChild(row);
        });
        if (status) status.textContent = `${results.length} match${results.length === 1 ? '' : 'es'}${data.truncated ? ' (truncated — refine query)' : ''} under ${data.root}`;
    } catch (err) {
        if (status) status.textContent = '';
        list.innerHTML = `<div class="files-empty"><svg class="ic"><use href="#i-alert"></use></svg><span>${escHtml(err.message || 'Search failed')}</span></div>`;
    }
}

function exitFilesSearch() {
    filesSearchActive = false;
    const input = $('files-search-input');
    if (input) input.value = '';
    const clearBtn = $('files-search-clear');
    if (clearBtn) clearBtn.classList.add('hidden');
    loadFiles();
}

async function actionFileDetails(node) {
    const p = node.dataset.path;
    if (!p) return;
    const modal = $('preview-modal');
    const content = $('preview-content');
    const img = $('preview-image');
    const nameEl = $('preview-name');
    if (!modal || !content) return;
    previewPath = p;
    nameEl.textContent = p.split('/').pop() || p;
    if (img) img.classList.add('hidden');
    content.classList.remove('hidden');
    content.textContent = 'Loading details…';
    modal.classList.remove('hidden');
    try {
        const s = await api(`/api/files/stat?path=${encodeURIComponent(p)}`);
        const rows = [
            ['Name', s.name],
            ['Path', s.path],
            ['Type', s.isLink ? 'symlink' + (s.linkTarget ? ' → ' + s.linkTarget : '') : s.isDir ? 'directory' : 'file'],
            ['Size', fmtBytes(s.size)],
            ['Permissions', s.mode],
            ['Owner uid/gid', `${s.uid} / ${s.gid}`],
            ['Modified', new Date(s.mtime).toLocaleString()],
            ['Accessed', new Date(s.atime).toLocaleString()],
            ['Created', s.birthtime ? new Date(s.birthtime).toLocaleString() : '—']
        ];
        content.textContent = rows.map(([k, v]) => `${k.padEnd(15, ' ')}  ${v}`).join('\n');
    } catch (err) {
        content.textContent = 'Could not read details: ' + (err.message || 'unknown error');
    }
}

/* image preview support */
const IMG_EXT_UI = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);

async function previewFileSmart(path, entryOpt) { return openPreviewStudio(path, entryOpt); }


/* ═══════════════════════ 3.1: AI GUIDE UI ═══════════════════════ */

const AI_MODE_DESC = {
    chat: 'Advisor only — commands appear as suggestions with a manual Run button.',
    ask: 'Every command shows an approval card first: Run, Edit or Skip.',
    auto: 'Commands run automatically as proposed. Catastrophic patterns still require explicit confirmation.'
};
const AI_EMPTY_HINTS = [
    'Show disk usage and the 10 largest folders in my home directory',
    'What is eating my RAM right now?',
    'Show git status and my last 5 commits here',
    'Find all .log files bigger than 50 MB',
    'Explain what this machine\'s load average means for me'
];

function ensureAiDrawerVisible() {
    const drawer = $('ai-drawer');
    if (drawer && drawer.classList.contains('hidden')) toggleAi();
}

function toggleAi() {
    if (isViewerSession) { showToast({ type: 'info', title: 'Host only', text: 'Spectators cannot use the AI Guide.' }); return; }
    const drawer = $('ai-drawer');
    if (!drawer) return;
    const opening = drawer.classList.contains('hidden');
    if (opening) {
        closeDrawer('files-drawer');
        closeDrawer('stats-drawer');
        closeDrawer('chat-drawer');
        closeDrawer('activity-drawer');
        syncAiModeUI();
        renderAiMessages();
        syncAiBusyUI();
        loadAiConfig();
    }
    drawer.classList.toggle('hidden', !opening);
    if (opening) {
        const input = $('ai-input');
        if (input) setTimeout(() => input.focus(), 150);
    }
}

function syncAiModeUI() {
    $$('.ai-mode-btn').forEach((b) => b.classList.toggle('on', b.dataset.mode === aiState.mode));
    const desc = $('ai-mode-desc');
    if (desc) desc.textContent = AI_MODE_DESC[aiState.mode] || '';
    const t = $('ai-target-tab');
    if (t) {
        const tab = getActiveTab();
        t.textContent = tab ? tab.title : 'active tab';
    }
}

function setAiMode(mode) {
    if (!['chat', 'ask', 'auto'].includes(mode)) return;
    aiState.mode = mode;
    saveSettings({ aiMode: mode });
    syncAiModeUI();
    if (mode === 'auto') {
        showToast({ type: 'warn', title: 'Auto mode engaged', text: 'Commands now run without per-step approval. Destructive patterns still ask.', duration: 5200 });
        logActivity('warn', 'AI Guide switched to AUTO mode');
    }
    playUI('click');
}

function syncAiBusyUI() {
    const send = $('ai-send-btn');
    const stop = $('ai-stop-btn');
    const input = $('ai-input');
    if (send) send.classList.toggle('hidden', aiState.busy);
    if (stop) stop.classList.toggle('hidden', !aiState.busy);
    if (input) input.disabled = false;
    ['ai-btn-dot', 'ai-btn-dot-m'].forEach((id) => {
        const d = $(id);
        if (d) d.classList.toggle('hidden', !aiState.busy);
    });
    const t = $('ai-target-tab');
    if (t) {
        const tab = tabs[aiState.tabId] || getActiveTab();
        t.textContent = tab ? tab.title : 'active tab';
    }
}

function aiFormatText(text) {
    /* minimal, safe markdown-lite: escape, then inline code + bold */
    let h = escHtml(text);
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    return h;
}

let aiRenderedIds = new Set();

function renderAiMessages() {
    const box = $('ai-messages');
    if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = '';
    if (!aiState.ui.length) aiRenderedIds.clear();

    if (!aiState.ui.length && !aiState.busy) {
        const empty = el('div', 'ai-empty');
        empty.innerHTML = `<svg class="ic"><use href="#i-sparkle"></use></svg>
            <span>Describe a task — I will plan it and run the commands for you.<br><strong style="color:var(--text-dim)">Mode: ${escHtml(aiState.mode.toUpperCase())}</strong></span>
            <div class="ai-empty-hints"></div>`;
        const hints = empty.querySelector('.ai-empty-hints');
        AI_EMPTY_HINTS.forEach((h) => {
            const b = el('button', 'ai-empty-hint');
            b.textContent = h;
            b.dataset.action = 'ai-hint';
            b.dataset.text = h;
            hints.appendChild(b);
        });
        box.appendChild(empty);
        return;
    }

    for (const item of aiState.ui) {
        const seen = aiRenderedIds.has(item.id);
        if (!seen) aiRenderedIds.add(item.id);
        let d = null;
        if (item.kind === 'user') {
            d = el('div', 'ai-msg user');
            d.innerHTML = `<div class="ai-bubble">${escHtml(item.text)}</div>`;
        } else if (item.kind === 'assistant') {
            d = el('div', 'ai-msg assistant');
            d.innerHTML = `<div class="ai-bubble">${aiFormatText(item.text)}<span class="ai-bubble-btns"><button class="ai-speak-btn" data-action="ai-speak" data-id="${item.id}" title="Read aloud">🔊</button><button class="ai-speak-btn ai-mp3-btn" data-action="ai-mp3" data-id="${item.id}" title="Save as audio (WAV)">⬇</button></span></div>`;
        } else if (item.kind === 'sys') {
            d = el('div', 'ai-msg sysmsg' + (item.level === 'error' ? ' error' : ''));
            d.innerHTML = `<div class="ai-bubble">${escHtml(item.text)}</div>`;
        } else if (item.kind === 'cmd') {
            d = renderAiCmdCard(item);
        } else if (item.kind === 'fail') {
            d = el('div', 'ai-msg sysmsg error');
            d.innerHTML = `<div class="ai-bubble">✖ <code class="fail-cmd"></code> exited ${item.status}
                <div class="ai-cmd-actions"><button class="btn-mini run-btn" data-action="ai-fail-explain" data-id="${item.id}">🤖 Why did this fail?</button></div></div>`;
            d.querySelector('.fail-cmd').textContent = String(item.cmd).slice(0, 120);
        }
        if (d) {
            if (seen) d.classList.add('no-anim');
            box.appendChild(d);
        }
    }

    if (aiState.awaitingModel) {
        const t = el('div', 'ai-thinking');
        t.innerHTML = '<span></span><span></span><span></span>';
        box.appendChild(t);
    }
    const hasPending = aiState.ui.some((i) => i.kind === 'cmd' && i.state === 'pending');
    if (atBottom || hasPending) box.scrollTop = box.scrollHeight;
    if (hasPending) {
        const card = box.querySelector('.ai-cmd-card.pending');
        if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
    }
}

function renderAiCmdCard(item) {
    const card = el('div', 'ai-cmd-card ' + (item.state === 'pending' ? 'pending' : item.state) + (item.danger ? ' danger' : ''));
    const stateLabels = { pending: 'needs approval', running: 'running…', done: 'done', skipped: 'skipped', error: 'failed', suggestion: 'suggestion' };
    let html = `
        <div class="ai-cmd-head">
            <svg class="ic ic-sm"><use href="${item.danger ? '#i-alert' : '#i-terminal'}"></use></svg>
            <span>${escHtml(item.cmd)}</span>
            ${item.auto ? '<span class="ai-cmd-state" style="color:var(--warn);background:rgba(246,166,9,.14)">auto</span>' : ''}
            <span class="ai-cmd-state">${stateLabels[item.state] || item.state}</span>
        </div>`;
    if (item.danger && (item.state === 'pending' || item.state === 'suggestion')) {
        html += `<div class="ai-cmd-warn"><svg class="ic ic-sm"><use href="#i-alert"></use></svg>Flagged: ${escHtml(item.danger)}</div>`;
    }
    if (item.expl) {
        html += `<div class="ai-cmd-explain">💡 ${escHtml(item.expl)}</div>`;
    }
    if (item.output) {
        const out = item.output.length > 1600 ? item.output.slice(0, 600) + '\n… (see terminal for full output) …\n' + item.output.slice(-900) : item.output;
        html += `<div class="ai-cmd-output">${escHtml(out)}</div>`;
    }
    if (item.state === 'pending') {
        html += `
        <div class="ai-cmd-actions">
            <button class="btn-mini run-btn${item.danger ? ' danger-btn' : ''}" data-action="ai-cmd-run" data-id="${item.id}">${item.danger ? 'Run anyway' : '▶ Run'}</button>
            <button class="btn-mini" data-action="ai-cmd-edit" data-id="${item.id}">✎ Edit</button>
            <button class="btn-mini" data-action="ai-cmd-explain" data-id="${item.id}">❔ Explain</button>
            <button class="btn-mini" data-action="ai-cmd-skip" data-id="${item.id}">⏭ Skip</button>
        </div>`;
    } else if (item.state === 'suggestion') {
        html += `
        <div class="ai-cmd-actions">
            <button class="btn-mini run-btn${item.danger ? ' danger-btn' : ''}" data-action="ai-suggestion-run" data-id="${item.id}">▶ Run once</button>
        </div>`;
    }
    card.innerHTML = html;
    return card;
}

function aiSendFromInput() {
    const input = $('ai-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    aiAutosizeInput(input);
    const drawer = $('ai-drawer');
    if (drawer && drawer.classList.contains('hidden')) toggleAi();
    aiSend(text);
}

function aiAutosizeInput(input) {
    input.style.height = 'auto';
    input.style.height = Math.min(96, input.scrollHeight) + 'px';
}

async function aiCmdEdit(id) {
    const item = aiState.ui.find((x) => x.id === id);
    if (!item || item.state !== 'pending') return;
    const edited = await showPrompt({ title: 'Edit command', message: 'Adjust before running:', value: item.cmd, okLabel: 'Run edited' });
    if (edited === null) return;
    const clean = edited.trim();
    if (!clean) { aiResolveDecision('skip'); return; }
    aiResolveDecision('run', clean);
}

/* AI settings (key/model live server-side) */
async function loadAiConfig() {
    if (!token || isViewerSession) return;
    try {
        const cfg = await api('/api/ai/config');
        const status = $('ai-key-status');
        if (status) {
            status.textContent = cfg.hasKey
                ? `✓ ${cfg.keyPreview} · source: ${cfg.keySource} · model: ${cfg.model}`
                : '✗ no key configured';
            status.style.color = cfg.hasKey ? 'var(--ok)' : 'var(--danger)';
        }
        const chip = $('ai-model-chip');
        if (chip) {
            chip.textContent = (cfg.model || '').split('/').pop() || 'ai';
            chip.title = cfg.model || '';
        }
        const modelSel = $('setting-ai-model');
        let aiCat = null;
        if (modelSel) {
            try {
                const cat = await api('/api/ai/models');
                aiCat = cat;
                modelSel.innerHTML = '';
                (cat.models || []).forEach((m) => {
                    const o = el('option');
                    o.value = m.id;
                    o.textContent = m.name;
                    modelSel.appendChild(o);
                });
                const oc = el('option');
                oc.value = '__custom';
                oc.textContent = 'Custom model id…';
                modelSel.appendChild(oc);
                const voiceSel = $('setting-ai-voice');
                if (voiceSel && cat.tts) {
                    voiceSel.innerHTML = '';
                    (cat.tts.voices || []).forEach((v) => {
                        const o = el('option');
                        o.value = v;
                        o.textContent = v;
                        voiceSel.appendChild(o);
                    });
                    /* Saved voice may be retired upstream (e.g. the old 'tara'
                       catalog) — snap the picker to the first valid option
                       instead of showing a blank select. */
                    const saved = getSettings().aiVoiceName;
                    voiceSel.value = Array.from(voiceSel.options).some((o) => o.value === saved)
                        ? saved
                        : ((cat.tts.voices && cat.tts.voices[0]) || 'autumn');
                }
            } catch (e) {}
            if (Array.from(modelSel.options).some((o) => o.value === cfg.model)) modelSel.value = cfg.model;
            else {
                modelSel.value = '__custom';
                const ci = $('setting-ai-model-custom');
                if (ci) { ci.value = cfg.model || ''; const row = $('ai-model-custom-row'); if (row) row.classList.remove('hidden'); }
            }
        }
        /* drawer quick-model select (no settings dive needed mid-chat) */
        const quick = $('ai-model-quick');
        if (quick) {
            try {
                if (!aiCat) aiCat = await api('/api/ai/models');
                if (!quick.options.length) {
                    (aiCat.models || []).forEach((m) => {
                        const o = el('option');
                        o.value = m.id;
                        o.textContent = m.name;
                        quick.appendChild(o);
                    });
                }
                if (Array.from(quick.options).some((o) => o.value === cfg.model)) {
                    quick.value = cfg.model;
                    quick.classList.remove('hidden');
                } else {
                    quick.classList.add('hidden');
                }
            } catch (e) { quick.classList.add('hidden'); }
        }
        const keyInput = $('setting-ai-key');
        if (keyInput) keyInput.placeholder = cfg.hasKey ? `Saved (${cfg.keyPreview}) — paste to replace` : 'Paste your Groq key (gsk_…)';
        const mt = $('setting-ai-maxtokens');
        if (mt) mt.value = cfg.maxTokens || 800;
        const mtv = $('ai-maxtokens-value');
        if (mtv) mtv.textContent = String(cfg.maxTokens || 800);
    } catch (e) { /* silent */ }
}

async function saveAiConfig() {
    const keyInput = $('setting-ai-key');
    const modelInput = $('setting-ai-model');
    const body = {};
    const key = keyInput ? keyInput.value.trim() : '';
    if (key) body.key = key;
    const modelSel = $('setting-ai-model');
    let model = '';
    if (modelSel && modelSel.value === '__custom') model = (($('setting-ai-model-custom') || {}).value || '').trim();
    else if (modelSel) model = modelSel.value;
    if (model) body.model = model;
    const mt = $('setting-ai-maxtokens');
    if (mt && mt.value) body.maxTokens = parseInt(mt.value, 10);
    if (!Object.keys(body).length) { showToast({ type: 'info', title: 'Nothing to save' }); return; }
    try {
        const res = await api('/api/ai/config', { method: 'POST', body });
        if (keyInput) keyInput.value = '';
        showToast({ type: 'success', title: 'AI settings saved', text: `model: ${res.model}` });
        logActivity('success', 'AI Guide settings updated');
        loadAiConfig();
    } catch (err) {
        showToast({ type: 'error', title: 'Save failed', text: err.message });
    }
}

async function testAiConnection() {
    const out = $('ai-test-result');
    if (out) { out.textContent = 'testing…'; out.style.color = 'var(--text-faint)'; }
    const t0 = Date.now();
    try {
        const res = await api('/api/ai/chat', {
            method: 'POST',
            body: { messages: [{ role: 'user', content: 'Reply with exactly: GUIDE_READY' }] }
        });
        const ms = Date.now() - t0;
        const ok = (res.content || '').includes('GUIDE_READY');
        if (out) {
            out.textContent = ok ? `✓ responded in ${ms} ms via ${res.model || 'groq'}` : `⚠ unexpected reply in ${ms} ms: ${(res.content || '').slice(0, 40)}`;
            out.style.color = ok ? 'var(--ok)' : 'var(--warn)';
        }
        if (ok) playUI('success');
    } catch (err) {
        if (out) { out.textContent = '✗ ' + (err.message || 'failed'); out.style.color = 'var(--danger)'; }
        playUI('error');
    }
}

async function resetAiKey() {
    const ok = await showConfirm({
        title: 'Reset AI key?',
        message: 'Forgets the key stored via this UI and falls back to the server default (env variable or the built-in key in server.js).',
        okLabel: 'Reset'
    });
    if (!ok) return;
    try {
        const res = await api('/api/ai/config', { method: 'POST', body: { key: '' } });
        showToast({ type: 'success', title: 'Key reset', text: `Now using: ${res.keySource} (${res.keyPreview})` });
        loadAiConfig();
    } catch (err) {
        showToast({ type: 'error', title: 'Reset failed', text: err.message });
    }
}

/* ─────────────── Selection toolbar (touch) ─────────────── */

let lastSelection = '';
let lastSelectionTabId = null;
let kbFocusSafety = false;   // true while the soft keyboard was open before an on-screen key press

function isCoarsePointer() {
    try { return window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window); } catch (e) { return false; }
}

function onTermSelectionChange(tab) {
    const sel = tab && tab.term && tab.term.getSelection ? (tab.term.getSelection() || '') : '';
    lastSelection = sel;
    lastSelectionTabId = tab ? tab.id : null;
    const bar = $('sel-toolbar');
    if (!bar) return;
    bar.classList.toggle('hidden', !(sel && isCoarsePointer()));
}

function selectionClear() {
    const tab = tabs[lastSelectionTabId] || getActiveTab();
    if (tab && tab.term.clearSelection) tab.term.clearSelection();
    lastSelection = '';
    const bar = $('sel-toolbar');
    if (bar) bar.classList.add('hidden');
    if (tab && !isAltLocked) suppressKeyboardFor(tab, false);
}

/* ─────────────── Floating control ball ─────────────── */

let ballExpanded = false;
let ballDrag = null;

function floatBallEnabled() {
    const v = getSettings().floatBall;
    if (v === true || v === false) return v;
    return isCoarsePointer();
}

function initFloatBall() {
    const ball = $('float-ball');
    if (!ball) return;
    const show = floatBallEnabled() && !isViewerSession;
    ball.classList.toggle('hidden', !show);
    if (!show) return;
    restoreBallPos();
    if (!ball.dataset.wired) {
        ball.dataset.wired = '1';
        ball.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            ballDrag = { x: e.clientX, y: e.clientY, bx: ball.offsetLeft, by: ball.offsetTop, moved: false, t0: Date.now() };
            try { ball.setPointerCapture(e.pointerId); } catch (err) {}
        });
        ball.addEventListener('pointermove', (e) => {
            if (!ballDrag) return;
            const dx = e.clientX - ballDrag.x, dy = e.clientY - ballDrag.y;
            if (Math.abs(dx) + Math.abs(dy) > 8) ballDrag.moved = true;
            if (ballDrag.moved) {
                ball.style.left = clamp(ballDrag.bx + dx, 6, window.innerWidth - 58) + 'px';
                ball.style.top = clamp(ballDrag.by + dy, 6, window.innerHeight - 58) + 'px';
                ball.style.right = 'auto';
                ball.style.bottom = 'auto';
            }
        });
        const up = (e) => {
            if (!ballDrag) return;
            const wasDrag = ballDrag.moved;
            ballDrag = null;
            if (wasDrag) { snapBall(); saveBallPos(); }
            else toggleBallPad();
        };
        ball.addEventListener('pointerup', up);
        ball.addEventListener('pointercancel', () => { ballDrag = null; });
    }
}

function snapBall() {
    const ball = $('float-ball');
    if (!ball) return;
    const mid = window.innerWidth / 2;
    const x = ball.offsetLeft + 26 < mid ? 10 : window.innerWidth - 62;
    ball.style.left = x + 'px';
    ball.style.right = 'auto';
    ball.style.transition = 'left 0.25s cubic-bezier(0.16,1,0.3,1), top 0.25s cubic-bezier(0.16,1,0.3,1)';
    setTimeout(() => { ball.style.transition = ''; }, 300);
}

function saveBallPos() {
    const ball = $('float-ball');
    if (!ball) return;
    storeSet('gk_ball_pos', { x: ball.offsetLeft / Math.max(1, window.innerWidth), y: ball.offsetTop / Math.max(1, window.innerHeight) });
}
function restoreBallPos() {
    const ball = $('float-ball');
    if (!ball) return;
    const p = storeGet('gk_ball_pos', null);
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        ball.style.left = clamp(p.x * window.innerWidth, 6, window.innerWidth - 58) + 'px';
        ball.style.top = clamp(p.y * window.innerHeight, 6, window.innerHeight - 58) + 'px';
        ball.style.right = 'auto';
        ball.style.bottom = 'auto';
    } else {
        ball.style.right = '12px';
        ball.style.bottom = '110px';
    }
}

function toggleBallPad(force) {
    const pad = $('float-ball-pad');
    const ball = $('float-ball');
    if (!pad || !ball) return;
    ballExpanded = force !== undefined ? force : !ballExpanded;
    pad.classList.toggle('hidden', !ballExpanded);
    ball.classList.toggle('expanded', ballExpanded);
    if (ballExpanded) {
        const bw = 52, pw = pad.offsetWidth || 200, ph = pad.offsetHeight || 140;
        let px = ball.offsetLeft + bw / 2 - pw / 2;
        let py = ball.offsetTop - ph - 10;
        if (py < 8) py = ball.offsetTop + bw + 10;
        pad.style.left = clamp(px, 8, window.innerWidth - pw - 8) + 'px';
        pad.style.top = clamp(py, 8, window.innerHeight - ph - 8) + 'px';
    }
}

/* ─────────────── Background tasks UI ─────────────── */

let tasksTimer = null;
let tasksBadgeTimer = null;
const taskWaitNotified = new Set();

function toggleTasks() {
    if (isViewerSession) { showToast({ type: 'info', title: 'Host only' }); return; }
    const drawer = $('tasks-drawer');
    if (!drawer) return;
    const opening = drawer.classList.contains('hidden');
    if (opening) {
        closeDrawer('files-drawer'); closeDrawer('stats-drawer'); closeDrawer('chat-drawer');
        closeDrawer('activity-drawer'); closeDrawer('ai-drawer');
    }
    drawer.classList.toggle('hidden', !opening);
    if (opening) { renderTasks(); startTasksPoll(); } else stopTasksPoll();
}

function startTasksPoll() {
    stopTasksPoll();
    /* Tick even while the tab is hidden: renderTasks() fetches and evaluates
       waiting-task alerts regardless, and skips only the DOM work when hidden.
       (It used to skip the whole tick when hidden — but hidden is exactly when
       the alerts matter, so the local fallback could never fire.) */
    tasksTimer = setInterval(() => { renderTasks(); }, 2500);
}
function stopTasksPoll() { if (tasksTimer) { clearInterval(tasksTimer); tasksTimer = null; } }

function startTasksBadgePoll() {
    if (tasksBadgeTimer) return;
    tasksBadgeTimer = setInterval(() => { tasksBadgeTick(); }, 20000);
}
async function tasksBadgeTick() {
    if (!token || isViewerSession) return;
    const drawer = $('tasks-drawer');
    if (drawer && !drawer.classList.contains('hidden')) return; // live poll already on
    let d;
    try { d = await api('/api/tasks'); } catch (e) { return; }
    const list = d.tasks || [];
    /* Waiting-task alerts are evaluated even while hidden (fallback channel
       for when the live WS notify was missed); DOM only updates in front. */
    checkWaitingTaskAlerts(list);
    if (document.hidden) return;
    const running = list.filter((t) => t.alive).length;
    const badge = $('tasks-badge');
    if (badge) {
        badge.textContent = String(running);
        badge.classList.toggle('hidden', running === 0);
    }
}

/* Local fallback alert for tasks stuck at a prompt. The primary channel is
   the server's live WS 'notify' mirror (instant, no push service needed);
   this poll covers a temporarily-down WS. The tag matches the server's
   ('taskwait:<id>') and the WS dedup registry is consulted, so the same
   event never alerts twice. Only fires while the tab is hidden — in front,
   the row's "needs input" chip + WS toast already tell the story. */
function checkWaitingTaskAlerts(tasksList) {
    for (const t of tasksList) {
        if (t.waiting && document.hidden && !taskWaitNotified.has(t.id)) {
            const tag = 'taskwait:' + t.id;
            taskWaitNotified.add(t.id);
            if (typeof notifyTagFresh === 'function' && notifyTagFresh(tag)) continue; // WS mirror already alerted
            notifyUser('⌨️ Task needs input', `"${t.name}" is waiting at a prompt.`, { tag });
        }
        if (!t.waiting && taskWaitNotified.has(t.id)) taskWaitNotified.delete(t.id);
    }
}

function buildTaskRow(t) {
    const row = el('div', 'task-row');
    row.dataset.id = t.id;
    row.innerHTML = `
        <div class="task-head">
            <span class="task-dot"></span>
            <span class="task-name"></span>
            <span class="task-wait-chip hidden">needs input</span>
            <span class="task-meta"></span>
        </div>
        <div class="task-cmd"></div>
        <div class="task-tail hidden"></div>
        <div class="task-input-row hidden">
            <input type="text" class="task-input" data-task-input="${escHtml(t.id)}" autocomplete="off" />
            <button class="btn-mini task-send" data-action="task-input-send" data-id="${escHtml(t.id)}" title="Send line"><svg class="ic ic-sm"><use href="#i-send"></use></svg></button>
            <button class="btn-mini" data-action="task-input-quick" data-id="${escHtml(t.id)}" data-val="y">y</button>
            <button class="btn-mini" data-action="task-input-quick" data-id="${escHtml(t.id)}" data-val="n">n</button>
            <button class="btn-mini" data-action="task-input-quick" data-id="${escHtml(t.id)}" data-val="cc">^C</button>
        </div>
        <div class="task-actions">
            <button class="icon-btn" data-action="task-log" data-id="${escHtml(t.id)}" title="Full log"><svg class="ic ic-sm"><use href="#i-file"></use></svg></button>
            <button class="icon-btn" data-action="task-rerun" data-id="${escHtml(t.id)}" title="Run again"><svg class="ic ic-sm"><use href="#i-refresh"></use></svg></button>
            <button class="icon-btn macro-del task-kill-btn" data-action="task-kill" data-id="${escHtml(t.id)}" title="Kill"><svg class="ic ic-sm"><use href="#i-power"></use></svg></button>
        </div>`;
    return row;
}

function updateTaskRow(row, t) {
    const q = (sel) => row.querySelector(sel);
    const state = t.alive ? (t.waiting ? 'waiting' : 'running') : (t.exitCode === 0 ? 'ok' : 'fail');
    const dot = q('.task-dot');
    dot.className = 'task-dot ' + state;
    q('.task-name').textContent = t.name;
    q('.task-wait-chip').classList.toggle('hidden', !t.waiting);
    q('.task-meta').textContent = t.alive ? fmtUptime(t.elapsedMs / 1000) : 'exit ' + t.exitCode;
    const cmdEl = q('.task-cmd');
    cmdEl.textContent = '$ ' + t.cmd;
    cmdEl.title = t.cmd;
    const tailLines = (t.tail || '').split('\n').filter(Boolean).slice(-3).join('\n');
    const tailEl = q('.task-tail');
    tailEl.classList.toggle('hidden', !tailLines);
    tailEl.classList.toggle('waiting', !!t.waiting);
    if (tailLines && tailEl.textContent !== tailLines) tailEl.textContent = tailLines;
    const inputRow = q('.task-input-row');
    inputRow.classList.toggle('hidden', !t.alive);
    const input = q('.task-input');
    if (input) {
        const ph = t.waiting ? 'Answer the prompt + Enter…' : 'Send input…';
        if (input.placeholder !== ph) input.placeholder = ph;   // never churn a focused input
    }
    q('.task-kill-btn').classList.toggle('hidden', !t.alive);
}

async function renderTasks() {
    const list = $('task-list');
    if (!list) return;
    let data;
    try { data = await api('/api/tasks'); } catch (e) {
        if (document.hidden) return; // background poll failure: stay silent
        list.innerHTML = `<div class="activity-empty">${escHtml(e.message || 'Failed to load')}</div>`;
        return;
    }
    const tasksList = (data.tasks || []).slice(0, 40);
    /* Waiting-task alerts run even while the tab is hidden — that is exactly
       when they matter (this used to be unreachable dead code: the poll only
       ran while visible, the notify only fired while hidden). */
    checkWaitingTaskAlerts(tasksList);
    if (document.hidden) return; // no DOM churn for a hidden tab
    const badge = $('tasks-badge');
    if (badge) {
        const running = (data.tasks || []).filter((t) => t.alive).length;
        badge.textContent = String(running);
        badge.classList.toggle('hidden', running === 0);
    }

    const ids = new Set(tasksList.map((t) => t.id));
    $$('.task-row', list).forEach((r) => { if (!ids.has(r.dataset.id)) r.remove(); });
    const emptyEl = list.querySelector('.activity-empty');
    if (!tasksList.length) {
        if (!emptyEl) list.innerHTML = '<div class="activity-empty">No background tasks yet.<br>Launch one above — it keeps running even if you close the browser.</div>';
        return;
    }
    if (emptyEl) emptyEl.remove();

    for (const t of tasksList) {
        let row = list.querySelector(`.task-row[data-id="${t.id}"]`);
        if (!row) {
            row = buildTaskRow(t);
            list.appendChild(row);
        } else {
            row.classList.add('no-anim'); // existing row: never replay the entry animation
        }
        updateTaskRow(row, t);
    }
    /* Keep server ordering WITHOUT moving nodes unnecessarily: re-appending a
       row that contains a focused input blurs it (which dismisses the mobile
       soft keyboard mid-typing). Only reorder when the order actually differs. */
    const desired = [];
    for (const t of tasksList) {
        const row = list.querySelector(`.task-row[data-id="${t.id}"]`);
        if (row) desired.push(row);
    }
    let orderDiffers = desired.length !== list.children.length;
    if (!orderDiffers) {
        for (let i = 0; i < desired.length; i++) {
            if (list.children[i] !== desired[i]) { orderDiffers = true; break; }
        }
    }
    if (orderDiffers) desired.forEach((n) => list.appendChild(n));
}

async function createTaskFromForm() {
    const cmd = ($('task-cmd').value || '').trim();
    if (!cmd) { showToast({ type: 'warn', title: 'Task needs a command' }); return; }
    const body = {
        cmd,
        name: ($('task-name').value || '').trim() || cmd.split('\n')[0].slice(0, 60),
        notify: $('task-notify').checked
    };
    let cwd = ($('task-cwd').value || '').trim();
    if (!cwd) {
        const tab = getActiveTab();
        if (tab && tab.cwd) cwd = tab.cwd;
    }
    if (cwd) body.cwd = cwd;
    try {
        await api('/api/tasks', { method: 'POST', body });
        $('task-cmd').value = '';
        $('task-name').value = '';
        showToast({ type: 'success', title: 'Task launched', text: 'Running in the background — push on finish.' });
        logActivity('info', `Background task started: ${body.name}`);
        renderTasks();
    } catch (err) {
        showToast({ type: 'error', title: 'Task failed to start', text: err.message });
    }
}

async function sendTaskInput(id, data, fromInputEl) {
    try {
        await api(`/api/tasks/${encodeURIComponent(id)}/input`, { method: 'POST', body: { data } });
        if (fromInputEl) fromInputEl.value = '';
        buzz(6);
        renderTasks();
    } catch (err) {
        showToast({ type: 'error', title: 'Input failed', text: err.message });
    }
}

async function taskAction(action, id) {
    try {
        if (action === 'kill') await api(`/api/tasks/${encodeURIComponent(id)}/kill`, { method: 'POST' });
        else if (action === 'rerun') await api(`/api/tasks/${encodeURIComponent(id)}/rerun`, { method: 'POST' });
        else if (action === 'log') {
            openTaskLog(id);
            return;
        }
        renderTasks();
    } catch (err) {
        showToast({ type: 'error', title: 'Task action failed', text: err.message });
    }
}

let taskLogTimer = null;
let taskLogId = null;

async function openTaskLog(id) {
    const modal = $('preview-modal');
    const content = $('preview-content');
    const img = $('preview-image');
    if (!modal || !content) return;
    previewPath = null;
    if (img) img.classList.add('hidden');
    setPreviewDownloadVisible(false);
    content.classList.remove('hidden');
    content.textContent = 'Loading…';
    modal.classList.remove('hidden');
    stopTaskLogPoll();
    taskLogId = id;
    const paint = async () => {
        if (!taskLogId || taskLogId !== id) return;
        try {
            const d = await api(`/api/tasks/${encodeURIComponent(id)}/log`);
            const nearBottom = content.scrollHeight - content.scrollTop - content.clientHeight < 60;
            $('preview-name').textContent = `Task log — ${d.name}${d.alive ? '  (live)' : ''}`;
            const txt = d.log || '(empty log)';
            if (content.textContent !== txt) content.textContent = txt;
            if (nearBottom) content.scrollTop = content.scrollHeight;
            if (!d.alive) stopTaskLogPoll();
        } catch (e) { stopTaskLogPoll(); }
    };
    await paint();
    taskLogTimer = setInterval(paint, 2000);
}

function stopTaskLogPoll() {
    if (taskLogTimer) { clearInterval(taskLogTimer); taskLogTimer = null; }
    taskLogId = null;
}

/* ─────────────── Scheduler UI ─────────────── */

let scheduleEditId = null;

function openSchedule() {
    const modal = $('schedule-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    resetScheduleForm();
    renderSchedules();
}
function closeSchedule() {
    const modal = $('schedule-modal');
    if (modal) modal.classList.add('hidden');
}

function scheduleWhenFromForm() {
    const type = $('sched-type').value;
    if (type === 'interval') return { type, everyMin: parseInt($('sched-every').value, 10) || 60 };
    if (type === 'daily') return { type, at: $('sched-at-time').value || '03:00' };
    return { type, at: parseInt($('sched-at-epoch').value, 10) || (Date.now() + 60000) };
}

function scheduleWhenLabel(s) {
    const w = s.when || {};
    if (w.type === 'interval') return `every ${w.everyMin} min`;
    if (w.type === 'daily') return `daily at ${w.at}`;
    if (w.type === 'once') return 'once @ ' + new Date(parseInt(w.at, 10)).toLocaleString();
    return '—';
}

function resetScheduleForm() {
    scheduleEditId = null;
    $('sched-name').value = '';
    $('sched-cmd').value = '';
    $('sched-type').value = 'interval';
    $('sched-every').value = '60';
    $('sched-at-time').value = '03:00';
    $('sched-notify').checked = true;
    $('schedule-save-label').textContent = 'Add schedule';
    syncScheduleInputs();
}

function syncScheduleInputs() {
    const t = $('sched-type').value;
    $('sched-every').classList.toggle('hidden', t !== 'interval');
    $('sched-at-time').classList.toggle('hidden', t !== 'daily');
    $('sched-at-epoch').classList.toggle('hidden', t !== 'once');
}

async function renderSchedules() {
    const box = $('schedule-list');
    if (!box) return;
    let data;
    try { data = await api('/api/schedules'); } catch (e) { box.innerHTML = `<div class="activity-empty">${escHtml(e.message || '')}</div>`; return; }
    const list = data.schedules || [];
    box.innerHTML = '';
    if (!list.length) {
        box.innerHTML = '<div class="files-empty"><svg class="ic"><use href="#i-clock"></use></svg><span>No schedules yet — these run on the server even when every browser is closed.</span></div>';
        return;
    }
    list.forEach((sc, i) => {
        const row = el('div', 'sched-row' + (sc.enabled ? '' : ' disabled'));
        row.style.animationDelay = Math.min(i * 18, 200) + 'ms';
        row.innerHTML = `
            <div class="sched-main">
                <div class="sched-name">${escHtml(sc.name)}</div>
                <div class="sched-when">${escHtml(scheduleWhenLabel(sc))} · ${sc.nextRun ? 'next ' + new Date(sc.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'paused'}</div>
                <div class="sched-last">${sc.lastStatus ? escHtml(sc.lastStatus.slice(0, 60)) + ' · ' : ''}${sc.lastRun ? fmtAgo(sc.lastRun) : 'never run'}</div>
            </div>
            <div class="sched-actions">
                <label class="toggle-switch" style="width:38px;height:21px"><input type="checkbox" data-action-input="sched-toggle" data-id="${escHtml(sc.id)}" ${sc.enabled ? 'checked' : ''} /><span class="toggle-track"></span></label>
                <button class="icon-btn" data-action="schedule-run" data-id="${escHtml(sc.id)}" title="Run now"><svg class="ic ic-sm"><use href="#i-play"></use></svg></button>
                <button class="icon-btn" data-action="schedule-edit" data-id="${escHtml(sc.id)}" title="Edit"><svg class="ic ic-sm"><use href="#i-edit"></use></svg></button>
                <button class="icon-btn macro-del" data-action="schedule-del" data-id="${escHtml(sc.id)}" title="Delete"><svg class="ic ic-sm"><use href="#i-trash"></use></svg></button>
            </div>`;
        box.appendChild(row);
    });
}

async function saveScheduleFromForm() {
    const name = ($('sched-name').value || '').trim();
    const cmd = ($('sched-cmd').value || '').trim();
    if (!name || !cmd) { showToast({ type: 'warn', title: 'Schedule needs a name and a command' }); return; }
    const body = { name, cmd, when: scheduleWhenFromForm(), notify: $('sched-notify').checked };
    try {
        if (scheduleEditId) {
            await api(`/api/schedules/${encodeURIComponent(scheduleEditId)}`, { method: 'POST', body });
            showToast({ type: 'success', title: 'Schedule updated', text: name });
        } else {
            await api('/api/schedules', { method: 'POST', body });
            showToast({ type: 'success', title: 'Schedule added', text: `${name} · ${scheduleWhenLabel({ when: body.when })}` });
            logActivity('info', `Schedule created: ${name}`);
        }
        resetScheduleForm();
        renderSchedules();
    } catch (err) {
        showToast({ type: 'error', title: 'Schedule error', text: err.message });
    }
}

function scheduleEdit(id) {
    api('/api/schedules').then((d) => {
        const sc = (d.schedules || []).find((x) => x.id === id);
        if (!sc) return;
        scheduleEditId = id;
        $('sched-name').value = sc.name;
        $('sched-cmd').value = sc.cmd;
        $('sched-type').value = (sc.when || {}).type || 'interval';
        $('sched-every').value = String((sc.when || {}).everyMin || 60);
        $('sched-at-time').value = (sc.when || {}).at && (sc.when.type === 'daily') ? sc.when.at : '03:00';
        $('sched-at-epoch').value = (sc.when || {}).type === 'once' ? String(sc.when.at) : '';
        $('sched-notify').checked = sc.notify !== false;
        $('schedule-save-label').textContent = 'Update schedule';
        syncScheduleInputs();
    }).catch(() => {});
}

async function scheduleToggle(id, on) {
    try {
        await api(`/api/schedules/${encodeURIComponent(id)}`, { method: 'POST', body: { enabled: on } });
        renderSchedules();
    } catch (err) { showToast({ type: 'error', title: 'Toggle failed', text: err.message }); }
}

async function scheduleRunNow(id) {
    try {
        const r = await api(`/api/schedules/${encodeURIComponent(id)}/run`, { method: 'POST' });
        showToast({ type: 'success', title: 'Scheduled run started', text: 'Check the Tasks list for live output.', duration: 2600 });
        renderSchedules();
        renderTasks();
        return r;
    } catch (err) { showToast({ type: 'error', title: 'Run failed', text: err.message }); }
}

async function scheduleDelete(id) {
    const ok = await showConfirm({ title: 'Delete schedule?', message: 'It will stop running everywhere.', okLabel: 'Delete' });
    if (!ok) return;
    try {
        await api(`/api/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
        renderSchedules();
    } catch (err) { showToast({ type: 'error', title: 'Delete failed', text: err.message }); }
}

/* ─────────────── Web Push UI ─────────────── */

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

async function loadPushStatus() {
    const status = $('push-status');
    const toggle = $('setting-push');
    if (!status) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        status.textContent = 'Not supported by this browser.';
        if (toggle) { toggle.checked = false; toggle.disabled = true; }
        return;
    }
    if (!window.isSecureContext) {
        status.textContent = 'Needs HTTPS or localhost (see README for 3 easy ways).';
        if (toggle) { toggle.checked = false; toggle.disabled = true; }
        return;
    }
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        const st = await api('/api/push/status');
        if (toggle) { toggle.disabled = false; toggle.checked = !!sub; }
        if (sub) {
            status.textContent = `✓ This device is subscribed (${st.count} device${st.count === 1 ? '' : 's'} total)`;
        } else {
            const lastErr = String(storeGet('gk_push_lasterr', '') || '');
            status.textContent = /push service|registration failed|network|terms|service unavailable/i.test(lastErr)
                ? 'Background push can’t reach the push service from this device/network (e.g. FCM blocked). Task & trigger alerts still arrive in-app over the live connection while any tab is open — you can retry later.'
                : 'Off — enable to get pushes with the browser closed.';
        }
    } catch (e) {
        status.textContent = 'Status unavailable: ' + (e.message || '');
    }
}

async function togglePush(on) {
    if (on) {
        if (!window.isSecureContext) {
            showToast({ type: 'error', title: 'HTTPS required', text: 'Web push only works over HTTPS or localhost. See README → “Installing on your phone”.' });
            loadPushStatus();
            return;
        }
        try {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') { showToast({ type: 'warn', title: 'Notification permission denied' }); loadPushStatus(); return; }
            const reg = await navigator.serviceWorker.ready;
            const vapid = await api('/api/push/vapid');
            if (!vapid.supported) { showToast({ type: 'error', title: 'Push unavailable on server' }); loadPushStatus(); return; }
            /* A subscription made against an older VAPID key makes subscribe() throw —
               drop any stale subscription first, then retry once on failure. */
            try {
                const oldSub = await reg.pushManager.getSubscription();
                if (oldSub) await oldSub.unsubscribe();
            } catch (e) {}
            const keyBuf = urlBase64ToUint8Array(vapid.publicKey);
            let sub = null;
            let lastErr = null;
            for (let attempt = 0; attempt < 2 && !sub; attempt++) {
                try {
                    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBuf });
                } catch (err) {
                    lastErr = err;
                    try { const s2 = await reg.pushManager.getSubscription(); if (s2) await s2.unsubscribe(); } catch (e2) {}
                }
            }
            if (!sub) {
                const msg = (lastErr && (lastErr.message || lastErr.name)) || 'subscribe failed';
                storeSet('gk_push_lasterr', msg);
                throw new Error(msg);
            }
            await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
            storeSet('gk_push_lasterr', '');
            showToast({ type: 'success', title: 'Background push enabled', text: 'Tasks, triggers & finished commands will reach this device.' });
            logActivity('success', 'Web push enabled on this device');
        } catch (err) {
            const msg = err.message || String(err);
            storeSet('gk_push_lasterr', msg);
            if (/terms|service unavailable|push service|registration failed|network/i.test(msg)) {
                /* Typically FCM being unreachable (blocked network / offline).
                   Not a server bug — and alerts still work over the live WS. */
                showToast({ type: 'warn', title: 'Background push unavailable here', text: 'This device can’t reach the push service (FCM) — a network/browser limitation. Alerts still reach you in-app over the live connection while any Garuda tab is open.', duration: 9000 });
            } else {
                showToast({ type: 'error', title: 'Push subscribe failed', text: msg.slice(0, 120), duration: 7000 });
            }
        }
        loadPushStatus();
    } else {
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            const sub = reg ? await reg.pushManager.getSubscription() : null;
            if (sub) {
                await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
                await sub.unsubscribe();
            }
            showToast({ type: 'info', title: 'Background push disabled' });
        } catch (err) { /* ignore */ }
        loadPushStatus();
    }
}

async function testPush() {
    try {
        const r = await api('/api/push/test', { method: 'POST' });
        showToast(r.sent ? { type: 'success', title: 'Test push sent', text: `Delivered to ${r.sent} device(s)` } : { type: 'warn', title: 'No devices subscribed', text: 'Enable push on a device first.' });
    } catch (err) {
        showToast({ type: 'error', title: 'Push test failed', text: err.message });
    }
}

/* ─────────────── What's-new modal ─────────────── */

let newsPending = false;

function showNewsIfNew() {
    if (storeGet(K.newsSeen, null) === APP_VERSION) return;
    const tourEl = $('tour-overlay');
    const tourRunning = tourEl && !tourEl.classList.contains('hidden');
    if (tourPlanned || tourRunning) { newsPending = true; return; }  // never cover the tour
    const modal = $('news-modal');
    if (modal) modal.classList.remove('hidden');
}
function flushNews() {
    if (!newsPending) return;
    newsPending = false;
    setTimeout(() => showNewsIfNew(), 600);
}
function closeNews() {
    const modal = $('news-modal');
    if (modal) modal.classList.add('hidden');
    storeSet(K.newsSeen, APP_VERSION);
}

/* ─────────────── Onboarding tour ─────────────── */

const TOUR_STEPS = [
    { sel: '#tab-bar', title: 'Tabs that never die', text: 'Every tab is a real shell living in server memory. Close the browser, come back later — all tabs reconnect with full scrollback.', place: 'bottom' },
    { sel: '[data-action="palette"]', title: 'Command palette', text: 'Ctrl+Shift+P opens fuzzy search across every action, macro, recent command and theme. It is the fastest way around.', place: 'bottom' },
    { sel: '[data-action="files"]', title: 'File manager', text: 'Browse, search, preview, upload and download files — or send the shell into any folder with one tap.', place: 'bottom' },
    { sel: '[data-action="stats"]', title: 'System monitor', text: 'Live CPU sparkline, memory, disk, load — plus every session living on the server.', place: 'bottom' },
    { sel: '#record-btn', title: 'Record & replay', text: 'Capture a tab\u2019s output and replay it like a video: scrub, pause, 0.5–16× speed, export as JSONL.', place: 'bottom', optional: true },
    { sel: '[data-action="triggers"]', title: 'Triggers & alerts', text: 'Watch output with regex — get a toast, sound or push the moment “error” or “build complete” scrolls by.', place: 'bottom', optional: true },
    { sel: '#mobile-keyboard', title: 'Mobile command deck', text: 'Sticky Ctrl, arrows, symbols, smooth scroll and tab controls — collapse it for maximum screen.', place: 'top', optional: true },
    { sel: '[data-action="settings"]', title: 'Make it yours', text: '26 themes including light ones with day/night auto-switch, fonts, opacity, sounds, haptics and more.', place: 'bottom' },
    { sel: '#tasks-btn', title: 'Tasks & scheduler', text: 'Launch detached background jobs and cron-like schedules — they keep running (and pushing notifications) with every browser closed.', place: 'bottom', optional: true },
    { sel: '#float-ball', title: 'Floating control ball', text: 'Drag me anywhere. Tap for Esc, Tab, sticky Ctrl and arrows — then collapse the whole keyboard deck for maximum screen.', place: 'top', optional: true }
];
let tourIdx = 0;

function pickVisible(sel) {
    try {
        const nodes = document.querySelectorAll(sel);
        for (const n of nodes) {
            const r = n.getBoundingClientRect();
            if (r.width > 4 && r.height > 4) return n;
        }
    } catch (e) {}
    return null;
}

function startTour() {
    tourIdx = 0;
    const ov = $('tour-overlay');
    if (!ov) return;
    ov.classList.remove('hidden');
    showTourStep();
}

function showTourStep() {
    const ov = $('tour-overlay');
    if (!ov || ov.classList.contains('hidden')) return;
    /* Skip steps whose target is not visible */
    let step = null, target = null;
    let scan = tourIdx;
    while (scan < TOUR_STEPS.length) {
        const cand = TOUR_STEPS[scan];
        const node = pickVisible(cand.sel);
        if (node) { step = cand; target = node; tourIdx = scan; break; }
        scan++;
    }
    const ring = $('tour-ring');
    const tip = $('tour-tooltip');
    if (!step) {
        /* No measurable targets (unusual environment): show the step centered without a ring */
        step = TOUR_STEPS[Math.min(tourIdx, TOUR_STEPS.length - 1)];
        if (ring) ring.style.opacity = '0';
        $('tour-step-count').textContent = `${tourIdx + 1} / ${TOUR_STEPS.length}`;
        $('tour-title').textContent = step.title;
        $('tour-text').textContent = step.text;
        $('tour-next-btn').textContent = tourIdx >= TOUR_STEPS.length - 1 ? 'Finish ✓' : 'Next →';
        const tw2 = tip.offsetWidth || 300, th2 = tip.offsetHeight || 160;
        tip.style.left = Math.max(10, (window.innerWidth - tw2) / 2) + 'px';
        tip.style.top = Math.max(10, (window.innerHeight - th2) / 2) + 'px';
        tip.style.visibility = 'visible';
        return;
    }
    if (ring) ring.style.opacity = '1';

    const r = target.getBoundingClientRect();
    const pad = 7;
    ring.style.left = (r.left - pad) + 'px';
    ring.style.top = (r.top - pad) + 'px';
    ring.style.width = (r.width + pad * 2) + 'px';
    ring.style.height = (r.height + pad * 2) + 'px';

    $('tour-step-count').textContent = `${tourIdx + 1} / ${TOUR_STEPS.length}`;
    $('tour-title').textContent = step.title;
    $('tour-text').textContent = step.text;
    $('tour-next-btn').textContent = tourIdx >= TOUR_STEPS.length - 1 ? 'Finish ✓' : 'Next →';

    tip.style.visibility = 'hidden';
    tip.style.left = '0px';
    tip.style.top = '0px';
    const tw = tip.offsetWidth || 300;
    const th = tip.offsetHeight || 160;
    let left = clamp(r.left, 10, window.innerWidth - tw - 10);
    let top = step.place === 'top' ? r.top - th - 16 : r.bottom + 16;
    if (top + th > window.innerHeight - 10) top = Math.max(10, r.top - th - 16);
    if (top < 10) top = Math.min(r.bottom + 16, window.innerHeight - th - 10);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.style.visibility = 'visible';
}

function tourNext() {
    tourIdx++;
    if (tourIdx >= TOUR_STEPS.length) endTour(true);
    else showTourStep();
}

function endTour(completed) {
    const ov = $('tour-overlay');
    if (ov) ov.classList.add('hidden');
    if (completed) storeSet(K.tourDone, true);
    tourPlanned = false;
    flushNews();
}

/* ─────────────── Files drawer: cwd shortcut from status bar ─────────────── */

function openFilesAtShellCwd() {
    filesRequestedPath = null;
    const drawer = $('files-drawer');
    if (drawer && !drawer.classList.contains('hidden')) loadFiles();
    else toggleFiles();
}

/* ═══════════════════ 5.2: health badges · editor · monitor · layouts · replay share ═══════════════════ */

/* ── Per-tab process-health badge (server pushes 'tab-health' ctrl msgs) ── */
function handleTabHealth(tab, ctrl) {
    if (!tab || !ctrl) return;
    const hot = ctrl.level === 'hot';
    tab.health = hot ? ctrl : null;
    if (tab.healthEl) {
        tab.healthEl.classList.toggle('hidden', !hot);
        tab.healthEl.textContent = hot ? ((ctrl.mins || 0) > 0 ? '⏳' : '🔥') : '';
        tab.healthEl.title = hot ? `High usage — cpu ${ctrl.cpu}% · mem ${ctrl.rssMb} MB · running ${ctrl.mins} min` : '';
    }
    if (hot && document.hidden && getSettings().healthPush && typeof notifyUser === 'function') {
        notifyUser(`Tab "${tab.title}" needs attention`, `cpu ${ctrl.cpu}% · mem ${ctrl.rssMb} MB · ${ctrl.mins} min running`, { tag: 'tab-health-' + tab.id });
    }
}

/* ── In-browser file editor ── */
const editorState = { path: null, mtime: null, dirty: false };
function syncEditorDirty() {
    const dot = $('editor-dirty');
    if (dot) dot.classList.toggle('hidden', !editorState.dirty);
}
function bindEditorOnce() {
    const area = $('editor-area');
    if (!area || area.dataset.bound) return;
    area.dataset.bound = '1';
    area.addEventListener('input', () => { editorState.dirty = true; syncEditorDirty(); });
    area.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); editorSave(false); }
    });
}
async function openEditor(p) {
    const modal = $('editor-modal');
    if (!modal || !p) return;
    try {
        const data = await api('/api/files/content?path=' + encodeURIComponent(p));
        if (data.binary) { showToast({ type: 'warn', title: 'Binary file', text: 'The editor handles text files only.' }); return; }
        let mtime = null;
        try { mtime = (await api('/api/files/stat?path=' + encodeURIComponent(p))).mtime || null; } catch (e) {}
        editorState.path = p;
        editorState.mtime = mtime;
        editorState.dirty = false;
        $('editor-path').textContent = p;
        const area = $('editor-area');
        area.value = data.content || '';
        syncEditorDirty();
        bindEditorOnce();
        modal.classList.remove('hidden');
        $('editor-status').textContent = `${data.size} bytes${data.truncated ? ' · showing first 512 KB' : ''} · Ctrl+S saves · backup .bak kept`;
        setTimeout(() => area.focus(), 60);
    } catch (e) {
        showToast({ type: 'error', title: 'Cannot open file', text: String(e.message || e) });
    }
}
async function editorSave(force) {
    if (!editorState.path) return;
    const area = $('editor-area');
    try {
        const res = await api('/api/files/write', {
            method: 'POST',
            body: { path: editorState.path, content: area.value, mtime: editorState.mtime, force: !!force }
        });
        editorState.mtime = res.mtime;
        editorState.dirty = false;
        syncEditorDirty();
        $('editor-status').textContent = `Saved ${res.bytes} bytes${res.backup ? ' · backup: ' + res.backup.split('/').pop() : ''} · ${new Date().toLocaleTimeString()}`;
        showToast({ type: 'success', title: 'Saved', text: editorState.path.split('/').pop(), duration: 1600, silent: true });
        if (typeof loadFiles === 'function') loadFiles();
    } catch (e) {
        if (e.status === 409) {
            const ok = await showConfirm({ title: 'File changed on disk', message: 'This file was modified after you opened it. Overwrite with your version?', okLabel: 'Overwrite', danger: true });
            if (ok) editorSave(true);
            return;
        }
        showToast({ type: 'error', title: 'Save failed', text: String(e.message || e) });
    }
}
async function closeEditor() {
    if (editorState.dirty) {
        const ok = await showConfirm({ title: 'Discard changes?', message: 'The editor has unsaved changes. Close anyway?', okLabel: 'Discard', danger: true });
        if (!ok) return;
    }
    const modal = $('editor-modal');
    if (modal) modal.classList.add('hidden');
    editorState.path = null;
    editorState.dirty = false;
}

/* ── Monitor extras: 1 h sparklines + process manager ── */
let monitorTick = 0;
async function refreshMonitorExtras() {
    if (!token || isViewerSession) return;
    const drawer = $('stats-drawer');
    if (!drawer || drawer.classList.contains('hidden')) return;
    if (++monitorTick % 2 !== 0) return; // every other poll
    try {
        const hist = await api('/api/stats/history');
        drawSparkRow(hist.ring || []);
    } catch (e) {}
    try {
        const pr = await api('/api/processes');
        renderProcList(pr.processes || []);
    } catch (e) {}
}
function drawSpark(canvasId, vals, color, maxFixed) {
    const cv = $(canvasId);
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    const nums = vals.filter((v) => typeof v === 'number' && !isNaN(v));
    if (!nums.length) return;
    const max = maxFixed || Math.max(1, ...nums);
    ctx.beginPath();
    const n = vals.length;
    let started = false;
    for (let i = 0; i < n; i++) {
        const v = vals[i];
        if (typeof v !== 'number' || isNaN(v)) { started = false; continue; }
        const x = (i / Math.max(1, n - 1)) * (w - 2) + 1;
        const y = h - 2 - (v / max) * (h - 6);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.stroke();
}
function drawSparkRow(ring) {
    const span = $('stat-hist-span');
    if (span) span.textContent = ring.length ? `${ring.length} samples · ${Math.round((ring[ring.length - 1].t - ring[0].t) / 60000)} min` : '—';
    const pad = (arr) => { const out = arr.slice(); return out; };
    drawSpark('spark-cpu', pad(ring.map((r) => r.cpu)), '#3daee9', 100);
    drawSpark('spark-mem', pad(ring.map((r) => r.mem)), '#9b59b6', 100);
    drawSpark('spark-net', pad(ring.map((r) => (r.rx || 0) + (r.tx || 0))), '#2fd07a');
    drawSpark('spark-disk', pad(ring.map((r) => r.disk)), '#f6a609', 100);
}
function fmtBytesShort(b) {
    if (b >= 1048576) return (b / 1048576).toFixed(1) + 'M';
    if (b >= 1024) return (b / 1024).toFixed(0) + 'K';
    return String(b);
}
function renderProcList(rows) {
    const list = $('proc-list');
    const count = $('proc-count');
    if (!list) return;
    if (count) count.textContent = `${rows.length} top`;
    if (!rows.length) { list.innerHTML = '<div class="setting-subtitle">No processes visible.</div>'; return; }
    list.innerHTML = rows.slice(0, 14).map((p) => `
        <div class="proc-row" title="${escHtml(p.cmd)}">
            <span class="proc-pid">${p.pid}</span>
            <span class="proc-name">${escHtml(p.comm)}</span>
            <span class="proc-num">${p.cpu.toFixed(0)}%</span>
            <span class="proc-num">${p.rssMb.toFixed(0)}M</span>
            <span class="proc-num proc-nice" title="nice ${p.nice}">n${p.nice}</span>
            <span class="proc-btns">
                <button class="btn-mini" data-action="proc-nice-down" data-pid="${p.pid}" data-nice="${p.nice}" title="Raise priority (nice -1)">↑</button>
                <button class="btn-mini" data-action="proc-nice-up" data-pid="${p.pid}" data-nice="${p.nice}" title="Lower priority (nice +1)">↓</button>
                <button class="btn-mini" data-action="proc-kill" data-pid="${p.pid}" title="Send SIGTERM">stop</button>
                <button class="btn-mini danger-mini" data-action="proc-kill9" data-pid="${p.pid}" title="Send SIGKILL">kill</button>
            </span>
        </div>`).join('');
}
async function procSignal(pid, signal) {
    if (signal === 'KILL') {
        const ok = await showConfirm({ title: 'SIGKILL process ' + pid + '?', message: 'SIGKILL cannot be caught or ignored — data may be lost.', okLabel: 'SIGKILL', danger: true });
        if (!ok) return;
    }
    try {
        await api('/api/processes/kill', { method: 'POST', body: { pid: Number(pid), signal } });
        showToast({ type: 'success', title: signal + ' sent', text: 'pid ' + pid, duration: 1500, silent: true });
        refreshMonitorExtras();
    } catch (e) { showToast({ type: 'error', title: 'Signal failed', text: String(e.message || e) }); }
}
async function procRenice(pid, value) {
    try {
        await api('/api/processes/nice', { method: 'POST', body: { pid: Number(pid), value } });
        refreshMonitorExtras();
    } catch (e) { showToast({ type: 'error', title: 'renice failed', text: String(e.message || e) }); }
}

/* ── Saved workspace layouts (server-side → restore on any device) ── */
let layoutsCache = [];
async function refreshLayoutsCache() {
    try { layoutsCache = (await api('/api/layouts')).layouts || []; } catch (e) { layoutsCache = []; }
    return layoutsCache;
}
async function saveCurrentLayout(name) {
    const ids = Object.keys(tabs);
    if (!ids.length) { showToast({ type: 'warn', title: 'No tabs to save' }); return; }
    try {
        const res = await api('/api/layouts', {
            method: 'POST',
            body: {
                name,
                tabs: ids.map((id) => ({ tabId: id, title: tabs[id].title, color: tabs[id].color || (tabs[id].colorDot && tabs[id].colorDot.style.background) || '' })),
                split: splitState && splitState.mode ? { mode: splitState.mode, focus: splitState.focus } : null,
                active: Math.max(0, ids.indexOf(activeTabId))
            }
        });
        await refreshLayoutsCache();
        showToast({ type: 'success', title: 'Layout saved', text: `"${res.layout.name}" — ${res.layout.tabs.length} tab(s), restore from any device via the palette`, duration: 4000 });
    } catch (e) { showToast({ type: 'error', title: 'Save failed', text: String(e.message || e) }); }
}
async function saveCurrentLayoutPrompt() {
    const name = await showPrompt({ title: 'Save layout', message: 'Name this arrangement (tabs, splits, colors, working dirs):', value: 'my layout', okLabel: 'Save' });
    if (!name || !name.trim()) return;
    saveCurrentLayout(name.trim());
}
async function restoreLayout(layout) {
    if (!layout || !Array.isArray(layout.tabs) || !layout.tabs.length) return;
    const created = [];
    for (const entry of layout.tabs) {
        const id = createNewTab(entry.tabId, entry.title, entry.color ? { color: entry.color } : null);
        if (id) {
            created.push(id);
            const t = tabs[id];
            if (t && entry.color) {
                t.color = entry.color;
                if (t.colorDot) { t.colorDot.classList.remove('hidden'); t.colorDot.style.background = entry.color; t.colorDot.style.color = entry.color; }
            }
        }
    }
    for (let i = 0; i < layout.tabs.length; i++) {
        const entry = layout.tabs[i];
        const t = tabs[created[i]];
        if (!t || !entry.cwd || entry.alive) continue; // reconnecting shells keep their cwd
        for (let w = 0; w < 25 && !t.wsConnected; w++) await new Promise((r) => setTimeout(r, 100));
        if (t.wsConnected && typeof sendInput === 'function') {
            sendInput(t, `cd '${String(entry.cwd).replace(/'/g, "'\\''")}'\n`);
        }
    }
    if (layout.split && created.length >= 2 && typeof applySplitLayout === 'function') {
        if (typeof startSplit === 'function' && !splitState.mode) startSplit(layout.split.mode, created[0]);
        splitState.mode = layout.split.mode;
        splitState.tabs = [created[0], created[1]];
        splitState.focus = layout.split.focus === 1 ? 1 : 0;
        applySplitLayout();
    }
    if (created[layout.active || 0]) switchTab(created[layout.active || 0]);
    showToast({ type: 'success', title: 'Layout restored', text: layout.name, duration: 2500, silent: true });
}
async function offerLayoutRestore() {
    if (isViewerSession || !token) return;
    const layouts = await refreshLayoutsCache();
    if (!layouts.length) return;
    let stored = [];
    try { stored = JSON.parse(localStorage.getItem(K.tabs) || '[]'); } catch (e) {}
    if (Array.isArray(stored) && stored.length) return; // existing device keeps its own tabs
    const latest = layouts.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    const ok = await showConfirm({
        title: 'Restore saved layout?',
        message: `"${latest.name}" — ${latest.tabs.length} tab(s)${latest.split ? ' + split' : ''}. Restore this workspace on this device?`,
        okLabel: 'Restore'
    });
    if (ok) restoreLayout(latest);
}
async function deleteLayout(id) {
    try {
        await api('/api/layouts/' + encodeURIComponent(id), { method: 'DELETE' });
        await refreshLayoutsCache();
        showToast({ type: 'success', title: 'Layout deleted', duration: 1600, silent: true });
    } catch (e) { showToast({ type: 'error', title: 'Delete failed', text: String(e.message || e) }); }
}

/* ── Replay: share link + .cast export ── */
function currentReplayRec() {
    if (replayState && replayState.chunks && replayState.chunks.length) {
        return { title: ($('replay-title') || {}).textContent || 'Terminal replay', chunks: replayState.chunks };
    }
    const rec = typeof getLatestRecording === 'function' ? getLatestRecording() : null;
    return rec && rec.chunks && rec.chunks.length ? rec : null;
}
async function shareReplayLink() {
    const rec = currentReplayRec();
    if (!rec) { showToast({ type: 'warn', title: 'Nothing to share', text: 'Open a replay or record the tab first.' }); return; }
    try {
        const res = await api('/api/replay/share', {
            method: 'POST',
            body: { title: String(rec.title).replace(/^Replay — /, ''), events: rec.chunks.map((c) => ({ t: c.t, d: c.d })) }
        });
        const url = location.origin + res.url;
        try { await navigator.clipboard.writeText(url); } catch (e) {}
        showToast({ type: 'success', title: 'Replay link copied (24 h)', text: url, duration: 7000 });
    } catch (e) { showToast({ type: 'error', title: 'Share failed', text: String(e.message || e) }); }
}
function downloadReplayCast() {
    const rec = currentReplayRec();
    if (!rec) { showToast({ type: 'warn', title: 'Nothing to export' }); return; }
    const header = { version: 2, width: 100, height: 30, timestamp: Math.floor(Date.now() / 1000), title: rec.title, env: { SHELL: 'sh', TERM: 'xterm-256color' } };
    const lines = [JSON.stringify(header)];
    for (const c of rec.chunks) lines.push(JSON.stringify([Math.round((c.t / 1000) * 1000000) / 1000000, 'o', c.d]));
    const blob = new Blob([lines.join('\n')], { type: 'application/x-asciicast' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = String(rec.title).replace(/[^\w-]+/g, '_').slice(0, 40) + '.cast';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    showToast({ type: 'success', title: 'asciicast exported', text: a.download });
}

/* ── 5.2.1: saved recording library (server-side ~/Rec_jsonl) ── */
let recordingsCache = [];
async function refreshRecordingsCache() {
    try { recordingsCache = (await api('/api/recordings')).recordings || []; } catch (e) { recordingsCache = []; }
    return recordingsCache;
}
async function openSavedRecording(name) {
    try {
        const rec = await api('/api/recordings/' + encodeURIComponent(name));
        if (!rec || !rec.chunks || !rec.chunks.length) { showToast({ type: 'warn', title: 'Empty recording' }); return; }
        openReplay({ title: rec.title, chunks: rec.chunks, live: false });
    } catch (e) { showToast({ type: 'error', title: 'Open failed', text: String(e.message || e) }); }
}
async function deleteRecording(name) {
    try {
        await api('/api/recordings/' + encodeURIComponent(name), { method: 'DELETE' });
        await refreshRecordingsCache();
        showToast({ type: 'success', title: 'Recording deleted', duration: 1500, silent: true });
    } catch (e) { showToast({ type: 'error', title: 'Delete failed', text: String(e.message || e) }); }
}

/* ═══════════════════ 5.3: Remote Desktop client (MSE over WS) ═══════════════════ */
const rdState = { ws: null, ms: null, sb: null, queue: [], mime: null, kb: false, connected: false, backends: null, lpTimer: null, objUrl: null };

function rdSetChip(txt) { const c = $('rd-status-chip'); if (c) c.textContent = txt; }
function rdSetButtons(on) {
    ['rd-kbd-btn', 'rd-mute-btn', 'rd-full-btn', 'rd-disconnect-btn'].forEach((id) => {
        const n = $(id); if (n) n.classList.toggle('hidden', !on);
    });
    const cb = $('rd-connect-btn'); if (cb) cb.classList.toggle('hidden', on);
    const hint = $('rd-hint'); if (hint) hint.classList.toggle('hidden', on);
    const v = $('rd-video'); if (v) v.classList.toggle('hidden', !on);
}
function toggleRd() {
    if (isViewerSession) { showToast({ type: 'info', title: 'Host only', text: 'Remote Desktop belongs to the host session.' }); return; }
    const drawer = $('rd-drawer');
    if (!drawer) return;
    const opening = drawer.classList.contains('hidden');
    closeDrawer('files-drawer'); closeDrawer('ai-drawer'); closeDrawer('stats-drawer'); closeDrawer('chat-drawer'); closeDrawer('activity-drawer'); closeDrawer('tasks-drawer');
    drawer.classList.toggle('hidden', !opening);
    if (opening) rdRefreshStatus();
}
async function rdRefreshStatus() {
    try {
        const st = await api('/api/rd/status');
        rdSetChip(rdState.connected ? 'live' : (st.capture ? `ready · ${st.capture} · in:${st.input}` : 'no capture source'));
        if (!st.capture && !rdState.connected) {
            const h = $('rd-hint');
            if (h) h.innerHTML = 'No capture source on this machine yet.<br>Run <code>sh tools/rd-setup.sh</code> once on the host, or set <code>GK_RD_CAPTURE_CMD</code> / <code>GK_RD_CAPTURE_FILE</code>.<br>See README → Remote Desktop.';
        }
    } catch (e) { rdSetChip('status unavailable'); }
}
function rdConnect() {
    if (rdState.connected) return;
    if (typeof MediaSource === 'undefined' || !window.MediaSource) {
        showToast({ type: 'error', title: 'Unsupported browser', text: 'This browser lacks MediaSource Extensions (MSE).' });
        return;
    }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws;
    try { ws = new WebSocket(`${proto}://${location.host}/ws/rd?auth=${encodeURIComponent(token)}`); } catch (e) { showToast({ type: 'error', title: 'Cannot open stream socket' }); return; }
    ws.binaryType = 'arraybuffer';
    rdState.ws = ws; rdState.queue = []; rdState.sb = null; rdState.ms = null;
    rdSetChip('connecting…');
    ws.onopen = () => { rdState.connected = true; rdSetChip('live'); rdSetButtons(true); };
    ws.onmessage = (e) => {
        if (typeof e.data === 'string') {
            const txt = e.data.charCodeAt(0) === 0 ? e.data.slice(1) : e.data; // ctrl frames are NUL-prefixed
            let m; try { m = JSON.parse(txt); } catch (err) { return; }
            if (m.type === 'rd-meta') rdOnMeta(m);
            else if (m.type === 'rd-ended') {
                rdTeardown();
                rdSetChip('ended: ' + (m.reason || ''));
                if (m.hint) showToast({ type: 'warn', title: 'Remote Desktop unavailable', text: m.hint, duration: 7000 });
            } else if (m.type === 'rd-input-echo') { rdState.lastEcho = m.ev; }
            else if (m.type === 'rd-stream-ended') {
                if (rdState.ms && rdState.ms.readyState === 'open') { try { rdState.ms.endOfStream(); } catch (e) {} }
                rdSetChip('stream ended · in:' + ((rdState.backends && rdState.backends.input) || '?'));
            } else if (m.type === 'rd-input-error') {
                rdSetChip('input off: ' + (m.backend || 'none'));
            }
        } else {
            rdState.queue.push(new Uint8Array(e.data));
            rdDrain();
        }
    };
    ws.onclose = () => { if (rdState.ws === ws) { rdTeardown(); rdSetChip('disconnected'); } };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
}
function rdOnMeta(m) {
    rdState.mime = m.mime;
    rdState.backends = { capture: m.capture, input: m.input };
    rdSetChip(`live · ${m.capture} · in:${m.input}`);
    const video = $('rd-video');
    if (!video) return;
    rdBindVideoOnce(video);
    const ms = new MediaSource();
    rdState.ms = ms;
    if (rdState.objUrl) { try { URL.revokeObjectURL(rdState.objUrl); } catch (e) {} }
    rdState.objUrl = URL.createObjectURL(ms);
    video.src = rdState.objUrl;
    video.muted = true;
    ms.addEventListener('sourceopen', () => {
        try { rdState.sb = ms.addSourceBuffer(m.mime); } catch (e) {
            showToast({ type: 'error', title: 'Codec unsupported here', text: m.mime + ' — try Chrome/Firefox.' });
            return;
        }
        rdState.sb.mode = 'segments';
        rdState.sb.addEventListener('updateend', rdDrain);
        rdDrain();
    });
    rdBindInput(true);
    const mb = $('rd-mute-btn'); if (mb) mb.textContent = '🔇 Muted';
}
function rdDrain() {
    const sb = rdState.sb;
    if (!sb || sb.updating || !rdState.queue.length) return;
    const chunk = rdState.queue.shift();
    try { sb.appendBuffer(chunk); } catch (e) {
        if (e.name === 'QuotaExceededError') rdState.queue.unshift(chunk);
        else if (e.name === 'InvalidStateError') rdState.sb = null;
    }
    if (rdState.queue.length && sb && !sb.updating) setTimeout(rdDrain, 0);
}
function rdBindVideoOnce(video) {
    if (video.dataset.rdBound) return;
    video.dataset.rdBound = '1';
    video.addEventListener('timeupdate', () => {
        if (!video.buffered || !video.buffered.length) return;
        const end = video.buffered.end(video.buffered.length - 1);
        if (end - video.currentTime > 1.6) video.currentTime = Math.max(0, end - 0.3); // stay at the live edge
        if (video.paused) video.play().catch(() => {});
    });
}
function rdNorm(e) {
    const v = $('rd-video');
    if (!v || !v.videoWidth) return null;
    const r = v.getBoundingClientRect();
    const scale = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
    const dw = v.videoWidth * scale, dh = v.videoHeight * scale;
    const ox = r.left + (r.width - dw) / 2, oy = r.top + (r.height - dh) / 2;
    const x = (e.clientX - ox) / dw, y = (e.clientY - oy) / dh;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}
function rdSend(obj) {
    if (rdState.ws && rdState.ws.readyState === WebSocket.OPEN) { try { rdState.ws.send(JSON.stringify(obj)); } catch (e) {} }
}
function rdBindInput(on) {
    const v = $('rd-video');
    if (!v || v.dataset.rdInputBound) return;
    v.dataset.rdInputBound = '1';
    v.setAttribute('tabindex', '0');
    v.addEventListener('pointermove', (e) => { const p = rdNorm(e); if (p && e.pointerType !== 'touch' || (p && e.buttons)) rdSend({ type: 'rd-pointer', x: p.x, y: p.y }); });
    v.addEventListener('pointerdown', (e) => {
        const p = rdNorm(e); if (!p) return;
        v.focus({ preventScroll: true });
        if (e.pointerType === 'touch') {
            rdSend({ type: 'rd-pointer', x: p.x, y: p.y });
            rdState.lpTimer = setTimeout(() => { rdSend({ type: 'rd-pointer', x: p.x, y: p.y, button: 2, down: true }); rdSend({ type: 'rd-pointer', x: p.x, y: p.y, button: 2, down: false }); rdState.lpTimer = 'fired'; }, 550);
            return;
        }
        rdSend({ type: 'rd-pointer', x: p.x, y: p.y, button: e.button === 2 ? 2 : e.button === 1 ? 1 : 0, down: true });
    });
    v.addEventListener('pointerup', (e) => {
        if (rdState.lpTimer === 'fired') { rdState.lpTimer = null; return; }
        if (rdState.lpTimer) { clearTimeout(rdState.lpTimer); rdState.lpTimer = null; }
        const p = rdNorm(e); if (!p || e.pointerType === 'touch') { if (p && e.pointerType === 'touch') rdSend({ type: 'rd-pointer', x: p.x, y: p.y, button: 0, down: true }), rdSend({ type: 'rd-pointer', x: p.x, y: p.y, button: 0, down: false }); return; }
        rdSend({ type: 'rd-pointer', x: p.x, y: p.y, button: e.button === 2 ? 2 : e.button === 1 ? 1 : 0, down: false });
    });
    v.addEventListener('contextmenu', (e) => e.preventDefault());
    v.addEventListener('wheel', (e) => { e.preventDefault(); rdSend({ type: 'rd-pointer', wheel: Math.sign(e.deltaY) || 1 }); }, { passive: false });
    const key = (down) => (e) => {
        if (!rdState.kb) return;
        if (e.key === 'Escape') { rdSetKb(false); return; }
        e.preventDefault(); e.stopPropagation();
        rdSend({ type: 'rd-key', code: e.code, down });
    };
    v.addEventListener('keydown', key(true));
    v.addEventListener('keyup', key(false));
}
function rdSetKb(on) {
    rdState.kb = on;
    const b = $('rd-kbd-btn'); if (b) b.textContent = on ? '⌨ Capturing…' : '⌨ Keyboard';
    const stage = document.querySelector('.rd-stage'); if (stage) stage.classList.toggle('kb-capture', on);
    if (on) { const v = $('rd-video'); if (v) v.focus({ preventScroll: true }); }
}
function rdTeardown() {
    rdState.connected = false;
    rdState.kb = false;
    if (rdState.ws) { try { rdState.ws.onclose = null; rdState.ws.close(); } catch (e) {} rdState.ws = null; }
    if (rdState.ms && rdState.ms.readyState === 'open') { try { rdState.ms.endOfStream(); } catch (e) {} }
    rdState.ms = null; rdState.sb = null; rdState.queue = [];
    const v = $('rd-video');
    if (v) { try { v.removeAttribute('src'); v.load(); } catch (e) {} }
    if (rdState.objUrl) { try { URL.revokeObjectURL(rdState.objUrl); } catch (e) {} rdState.objUrl = null; }
    rdSetButtons(false);
    rdSetKb(false);
}
function rdDisconnect() {
    if (rdState.ws && rdState.ws.readyState === WebSocket.OPEN) rdSend({ type: 'rd-stop' });
    rdTeardown();
    rdSetChip('idle');
    rdRefreshStatus();
}


/* ─────────────── 5.5: fail chip over the terminal ─────────────── */
function showFailChip(tab, cmd, status) {
    const host = tab && tab.termEl;
    if (!host) return;
    let chip = host.querySelector('.fail-chip');
    if (!chip) {
        chip = document.createElement('button');
        chip.className = 'fail-chip';
        host.appendChild(chip);
    }
    chip.textContent = `✖ exit ${status} — why?`;
    chip.title = String(cmd).slice(0, 140);
    chip.classList.remove('hidden');
    chip.onclick = (e) => {
        e.stopPropagation();
        chip.classList.add('hidden');
        if (tab.lastFail) aiExplainFailure(tab.lastFail.cmd, tab.lastFail.output, tab.lastFail.status);
    };
    clearTimeout(chip._t);
    chip._t = setTimeout(() => chip.classList.add('hidden'), 25000);
}

/* ─────────────── 5.5: single-file share links ─────────────── */
let filesharePath = null;
let fileshareResult = null;
async function openFileShare(p) {
    const modal = $('fileshare-modal');
    if (!modal || !p) return;
    filesharePath = p;
    fileshareResult = null;
    $('fileshare-path').textContent = p;
    const res = $('fileshare-result');
    if (res) res.classList.add('hidden');
    const s = getSettings();
    const exp = $('fileshare-exp');
    if (exp) exp.value = String([1, 6, 24, 168].includes(s.fileShareExpiry) ? s.fileShareExpiry : 24);
    const mv = $('fileshare-maxviews');
    if (mv) mv.value = '0';
    const mode = $('fileshare-mode');
    if (mode) mode.value = 'view';
    modal.classList.remove('hidden');
    renderFileShareList();
}
async function createFileShare() {
    if (!filesharePath) return;
    const mode = ($('fileshare-mode') || {}).value || 'view';
    let hours = parseInt(($('fileshare-exp') || {}).value, 10) || 24;
    if (hours === -1) hours = clamp(parseInt(($('fileshare-exp-custom') || {}).value, 10) || 24, 1, 336);
    const maxViews = clamp(parseInt(($('fileshare-maxviews') || {}).value, 10) || 0, 0, 10000);
    saveSettings({ fileShareExpiry: hours });
    try {
        const r = await api('/api/fileshare/create', { method: 'POST', body: { path: filesharePath, mode, expiresH: hours, maxViews } });
        fileshareResult = r;
        const url = location.origin + r.url;
        const box = $('fileshare-result');
        const input = $('fileshare-url');
        if (box && input) { box.classList.remove('hidden'); input.value = url; }
        try { await navigator.clipboard.writeText(url); } catch (e) {}
        showToast({ type: 'success', title: 'Share link copied', text: `${mode} · ${hours} h${maxViews ? ' · max ' + maxViews + ' views' : ''}`, duration: 4500 });
        renderFileShareList();
    } catch (e) { showToast({ type: 'error', title: 'Share failed', text: String(e.message || e) }); }
}
async function renderFileShareList() {
    const host = $('fileshare-list');
    if (!host) return;
    try {
        const d = await api('/api/fileshare/list');
        if (!d.shares.length) { host.innerHTML = '<div class="setting-subtitle">No active share links.</div>'; return; }
        host.innerHTML = d.shares.map((f) => `
            <div class="fshare-row" title="${escHtml(f.path)}">
                <span class="fshare-name">${escHtml(f.path.split('/').pop())}</span>
                <span class="fshare-meta">${f.mode} · ${Math.max(0, Math.round((f.expiresAt - Date.now()) / 3600000))}h left · ${f.views}${f.maxViews ? '/' + f.maxViews : ''} views</span>
                <span class="fshare-btns">
                    <button class="btn-mini" data-action="fileshare-copy-row" data-token="${f.token}" data-url="${f.mode === 'view' ? '/fs.html?r=' : '/api/fileshare/'}${f.token}">copy</button>
                    <button class="btn-mini danger-mini" data-action="fileshare-revoke" data-token="${f.token}">revoke</button>
                </span>
            </div>`).join('');
    } catch (e) { host.innerHTML = ''; }
}
async function revokeFileShare(token) {
    try {
        await api('/api/fileshare/revoke', { method: 'POST', body: { token } });
        showToast({ type: 'success', title: 'Link revoked', duration: 1500, silent: true });
        renderFileShareList();
    } catch (e) { showToast({ type: 'error', title: 'Revoke failed', text: String(e.message || e) }); }
}

/* ─────────────── 5.5: branch sandbox UI ─────────────── */
let sandboxState = { id: null, taskId: null, timer: null, done: false };
function sandboxPollStop() { if (sandboxState.timer) { clearInterval(sandboxState.timer); sandboxState.timer = null; } }
async function openSandboxModal() {
    const modal = $('sandbox-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const st = await api('/api/sandbox/status').catch(() => null);
    const note = $('sandbox-note');
    if (note) {
        if (!st || !st.available) { note.textContent = 'bubblewrap is NOT installed on the host — install with: sudo pacman -S bubblewrap'; note.classList.remove('hidden'); }
        else if (!st.overlay) { note.textContent = 'bwrap present but without --overlay: sandbox home will be an empty tmpfs (writes isolated, reads invisible).'; note.classList.remove('hidden'); }
        else { note.textContent = 'Writes land in a throwaway layer over your HOME; reads see the real system. Promote or discard afterwards.'; note.classList.remove('hidden'); }
    }
}
async function runSandbox() {
    const cmd = ($('sandbox-cmd') || {}).value || '';
    if (!cmd.trim()) return;
    sandboxPollStop();
    sandboxState = { id: null, taskId: null, timer: null, done: false };
    const log = $('sandbox-log');
    const acts = $('sandbox-actions');
    if (log) log.textContent = 'starting…';
    if (acts) acts.classList.add('hidden');
    try {
        const r = await api('/api/sandbox/run', { method: 'POST', body: { cmd } });
        sandboxState.id = r.id;
        sandboxState.taskId = r.taskId;
        let cursor = 0;
        sandboxState.timer = setInterval(async () => {
            try {
                const d = await api(`/api/tasks/${sandboxState.taskId}/log?from=${cursor}`);
                if (d && typeof d.log === 'string') { cursor = d.next || cursor + d.log.length; if (log) log.textContent += d.log; if (log) log.scrollTop = log.scrollHeight; }
                const t = await api('/api/tasks');
                const task = (t.tasks || []).find((x) => x.id === sandboxState.taskId);
                if (!task || !task.alive) {
                    sandboxPollStop();
                    sandboxState.done = true;
                    if (log) log.textContent += '\n— sandbox run finished —';
                    if (acts) acts.classList.remove('hidden');
                    refreshSandboxChanges();
                }
            } catch (e) {}
        }, 900);
    } catch (e) {
        if (log) log.textContent = 'sandbox error: ' + (e.message || e);
    }
}
async function refreshSandboxChanges() {
    const host = $('sandbox-changes');
    if (!host || !sandboxState.id) return;
    try {
        const d = await api(`/api/sandbox/${sandboxState.id}/changes`);
        host.innerHTML = d.files.length
            ? d.files.map((f) => `<div class="fshare-row"><span class="fshare-name">${escHtml(f.rel)}</span><span class="fshare-meta">${fmtBytes(f.size)}</span></div>`).join('')
            : '<div class="setting-subtitle">No files written in the sandbox layer.</div>';
    } catch (e) { host.innerHTML = ''; }
}
async function promoteSandbox() {
    if (!sandboxState.id) return;
    const ok = await showConfirm({ title: 'Promote sandbox writes?', message: 'Copies every file the sandbox wrote over your REAL home (existing files get a .bak). Continue?', okLabel: 'Promote' });
    if (!ok) return;
    try {
        const r = await api(`/api/sandbox/${sandboxState.id}/promote`, { method: 'POST', body: {} });
        showToast({ type: 'success', title: `Promoted ${r.done.length} file(s)`, text: r.skipped.length ? r.skipped.length + ' skipped (protected)' : '', duration: 4000 });
        await discardSandbox(true);
    } catch (e) { showToast({ type: 'error', title: 'Promote failed', text: String(e.message || e) }); }
}
async function discardSandbox(silent) {
    if (!sandboxState.id) return;
    try {
        await api(`/api/sandbox/${sandboxState.id}/discard`, { method: 'POST', body: {} });
        if (!silent) showToast({ type: 'success', title: 'Sandbox layer discarded', duration: 1800, silent: true });
    } catch (e) {}
    const host = $('sandbox-changes');
    if (host) host.innerHTML = '';
    const acts = $('sandbox-actions');
    if (acts) acts.classList.add('hidden');
    sandboxState.id = null;
}
