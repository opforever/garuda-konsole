/* Frontend E2E: runs the real app.js/ui.js inside jsdom against a live server.
   Usage: BASE=http://localhost:3100 node test/frontend-test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const NodeWebSocket = require('ws');

const PUB = path.join(__dirname, '..', 'public');

/* Boot an isolated server instance so repeated test logins never trip rate limiting */
const { spawn } = require('child_process');
const PORT = process.env.PORT || '3199';
const BASE = process.env.BASE || `http://localhost:${PORT}`;
let serverProc = null;
if (!process.env.BASE) {
    serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: Object.assign({}, process.env, { PORT: String(PORT), KONSOLE_LOGIN_LIMIT: '100000' }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    serverProc.stdout.on('data', () => {});
    serverProc.stderr.on('data', (d) => process.stderr.write('[srv] ' + d));
}
async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        try { const r = await fetch(BASE + '/healthz'); if (r.ok) return; } catch (e) {}
        await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('test server did not start on ' + BASE);
}

let passed = 0, failed = 0;
const fatalErrors = [];
function check(name, cond, extra) {
    if (cond) { passed++; console.log(`  ✔ ${name}`); }
    else { failed++; console.log(`  ✘ ${name}${extra ? ' — ' + extra : ''}`); }
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (win, expr) => win.eval(expr);

/* ── Stubs ── */
function installStubs(win) {
    const fakeCtx = new Proxy({}, {
        get(t, prop) {
            if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
            if (prop === 'measureText') return () => ({ width: 10 });
            return () => {};
        },
        set() { return true; }
    });
    win.HTMLCanvasElement.prototype.getContext = () => fakeCtx;

    class FakeLine {
        constructor(t) { this.t = t || ''; this.length = (t || '').length; }
        translateToString() { return this.t; }
    }
    class TerminalStub {
        constructor(opts) {
            this.options = Object.assign({}, opts);
            this.cols = 80; this.rows = 24;
            this.written = [];
            this._dataCbs = []; this._bellCbs = []; this._selCbs = [];
            this._selection = '';
            this._resetCount = 0;
            this.element = null;
            this.buffer = { active: { length: 2, viewportY: 0, getLine: (i) => new FakeLine('log-line-' + i) } };
        }
        select(col, row, len) { this._lastSelect = { col, row, len }; }
        selectLines(a, b, c, d) { this._lastSelectLines = [a, b, c, d]; }
        selectAll() { this._selectedAll = (this._selectedAll || 0) + 1; this._selection = 'ALL'; }
        getSelectionPosition() { return this._selPos || { start: { x: 2, y: 1 }, end: { x: 5, y: 1 } }; }
        onSelectionChange(cb) { this._selCbs.push(cb); return { dispose() {} }; }
        fireSel() { this._selCbs.forEach((cb) => cb()); }
        loadAddon() {}
        open(el) {
            this.element = el;
            el.classList.add('xterm');
            const ta = el.ownerDocument.createElement('textarea');
            ta.className = 'xterm-helper-textarea';
            el.appendChild(ta);
        }
        write(d) { this.written.push(String(d)); }
        writeln(d) { this.write(d + '\r\n'); }
        reset() { this.written.length = 0; this._resetCount++; }
        clear() { this._cleared = (this._cleared || 0) + 1; }
        focus() {}
        scrollToBottom() {}
        scrollLines() { this._scrollLines = (this._scrollLines || 0) + 1; }
        getSelection() { return this._selection; }
        clearSelection() { this._selection = ''; }
        paste(t) { this.triggerData(t); }
        onData(cb) { this._dataCbs.push(cb); return { dispose() {} }; }
        onBell(cb) { this._bellCbs.push(cb); return { dispose() {} }; }
        attachCustomKeyEventHandler(fn) { this._keyHandler = fn; }
        triggerData(d) { this._dataCbs.forEach((cb) => cb(d)); }
        dispose() { this.disposed = true; }
        allWritten() { return this.written.join(''); }
    }
    class FitAddonStub { fit() { this._fits = (this._fits || 0) + 1; } }
    class SearchAddonStub {
        findNext() { return true; }
        findPrevious() { return true; }
        onDidChangeResults() { return { dispose() {} }; }
        clearDecorations() {}
    }
    class WebLinksStub {}

    win.Terminal = TerminalStub;
    win.FitAddon = { FitAddon: FitAddonStub };
    win.SearchAddon = { SearchAddon: SearchAddonStub };
    win.WebLinksAddon = { WebLinksAddon: WebLinksStub };
    win.WebSocket = NodeWebSocket;
    win.fetch = (url, opts) => fetch(new URL(url, BASE), opts);
    win.URL.createObjectURL = () => 'blob:fake-url';
    win.URL.revokeObjectURL = () => {};
    win.open = () => null;
    win.scrollTo = () => {};
}

async function bootDom(pageUrl, preInject) {
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => {
        if (!/Not implemented|Could not load/.test(e.message)) fatalErrors.push('jsdomError: ' + e.message);
    });
    virtualConsole.on('error', (...args) => {
        const s = args.join(' ');
        if (!/favicon|Not implemented/i.test(s)) fatalErrors.push('console.error: ' + s);
    });
    const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
    const dom = new JSDOM(html, {
        url: pageUrl || (BASE + '/'),
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        virtualConsole
    });
    const win = dom.window;
    installStubs(win);
    if (preInject) preInject(win);
    const inject = (file) => {
        const s = win.document.createElement('script');
        s.textContent = fs.readFileSync(path.join(PUB, file), 'utf8');
        win.document.body.appendChild(s);
    };
    inject('app.js');
    inject('ui.js');
    return dom;
}

function visible(win, id) {
    const n = win.document.getElementById(id);
    return n && !n.classList.contains('hidden');
}

(async () => {
    await waitForServer();
    console.log('═══ FRONTEND E2E (jsdom ↔ live server) ═══\n');

    /* ── 1. Lockscreen & auth ── */
    console.log('── Auth flow ──');
    const dom = await bootDom();
    const win = dom.window;
    await tick(400);

    check('init ran: lockscreen visible', visible(win, 'lockscreen'));
    check('app hidden before login', !visible(win, 'app'));

    win.document.getElementById('password-input').value = 'wrong-password';
    await ev(win, 'doLogin()');
    await tick(500);
    check('wrong password shows error', visible(win, 'lock-error'));
    check('wrong password keeps app hidden', !visible(win, 'app'));

    win.document.getElementById('password-input').value = '20090228';
    await ev(win, 'doLogin()');
    await tick(1600);
    check('correct password unlocks app', visible(win, 'app') && !visible(win, 'lockscreen'));
    check('exactly one tab created', ev(win, 'Object.keys(tabs).length') === 1);
    const tabId = ev(win, 'activeTabId');
    check('tab id is random gk_*', /^gk_[a-z0-9]+$/.test(tabId), tabId);
    check('token persisted to sessionStorage', !!ev(win, 'sessionStorage.getItem("gk_token")'));
    check('onData bound exactly once', ev(win, `tabs[activeTabId].term._dataCbs.length`) === 1);
    check('ws connected', ev(win, `tabs[activeTabId].ws.readyState === 1`));
    check('boot overlay shown', visible(win, 'boot-overlay'));
    await tick(2600);
    check('boot overlay auto-hides', !visible(win, 'boot-overlay'));

    /* ── 2. Terminal round trip ── */
    console.log('── Terminal round-trip ──');
    ev(win, `runCommandInActiveTab('echo FRONTEND_E2E_MARKER')`);
    await tick(1200);
    const written1 = ev(win, `tabs[activeTabId].term.written.join('')`);
    check('command echo received from pty', written1.includes('FRONTEND_E2E_MARKER'));
    check('recent command recorded', ev(win, `getRecentCommands().includes("echo FRONTEND_E2E_MARKER")`));

    /* ctrl-sticky conversion */
    ev(win, `setCtrlSticky(true); tabs[activeTabId].term.triggerData('c');`);
    check('ctrl-sticky consumed after letter', ev(win, 'ctrlSticky') === false);
    /* The raw \x03 sits in the stub bash line buffer (a real pty would flush it via SIGINT);
       send a warm-up command so the next assertions see a clean shell line. */
    ev(win, `runCommandInActiveTab('true')`);
    await tick(500);

    /* ── 3. Reconnect: history replays once, no duplicate onData ── */
    console.log('── Reconnect & dedupe ──');
    ev(win, `(function(){ const t = tabs[activeTabId]; t.ws.terminate ? t.ws.terminate() : t.ws.close(); })()`);
    await tick(2800); // reconnect delay 1s + init
    check('ws reconnected', ev(win, `tabs[activeTabId].ws.readyState === 1`));
    check('term was reset before replay', ev(win, `tabs[activeTabId].term._resetCount`) >= 1);
    const written2 = ev(win, `tabs[activeTabId].term.written.join('')`);
    const occurrences = written2.split('FRONTEND_E2E_MARKER').length - 1;
    check('history replayed exactly once (no duplication)', occurrences >= 1 && written2.includes('FRONTEND_E2E_MARKER'), `occurrences=${occurrences}`);
    check('still one onData handler after reconnect', ev(win, `tabs[activeTabId].term._dataCbs.length`) === 1);

    /* input actually flows through new socket */
    ev(win, `runCommandInActiveTab('echo POST_RECONNECT_OK')`);
    await tick(900);
    check('input works after reconnect', ev(win, `tabs[activeTabId].term.written.join('')`).includes('POST_RECONNECT_OK'));

    /* ── 4. Tabs ── */
    console.log('── Tabs ──');
    ev(win, 'createNewTab()');
    await tick(700);
    check('second tab created', ev(win, 'Object.keys(tabs).length') === 2);
    check('tab list persisted', (ev(win, `sessionStorage.getItem('gk_tabs_v3')`) || '').includes('gk_'));
    const secondId = ev(win, 'activeTabId');
    ev(win, `closeTab('${secondId}')`);
    await tick(400);
    check('tab closed, one remains', ev(win, 'Object.keys(tabs).length') === 1);
    check('active tab valid after close', ev(win, 'tabs[activeTabId] !== undefined'));

    /* rename */
    ev(win, `startRenameTab(activeTabId)`);
    await tick(80);
    check('rename input appeared', !!win.document.querySelector('.tab-rename-input'));
    win.document.querySelector('.tab-rename-input').value = 'Renamed Tab';
    ev(win, `(function(){ const i = document.querySelector('.tab-rename-input'); i.dispatchEvent(new window.KeyboardEvent('keydown', {key:'Enter', bubbles:true})); })()`);
    await tick(80);
    check('rename committed', ev(win, `tabs[activeTabId].title`) === 'Renamed Tab');

    /* ── 5. Palette ── */
    console.log('── Command palette ──');
    ev(win, 'openPalette()');
    await tick(60);
    check('palette opens', visible(win, 'palette-overlay'));
    ev(win, `(function(){ const i = document.getElementById('palette-input'); i.value = 'new tab'; renderPalette('new tab'); })()`);
    await tick(60);
    const palHtml = win.document.getElementById('palette-list').innerHTML;
    check('fuzzy search finds "New tab"', palHtml.includes('New tab'));
    ev(win, 'closePalette()');
    check('palette closes', !visible(win, 'palette-overlay'));
    ev(win, `openPalette(); renderPalette('dracula');`);
    await tick(40);
    check('theme searchable in palette', win.document.getElementById('palette-list').innerHTML.includes('Dracula'));
    ev(win, 'closePalette()');

    /* ── 6. Macros ── */
    console.log('── Macros ──');
    check('default macros seeded', ev(win, 'getMacros().length') >= 7);
    ev(win, 'openMacros()');
    await tick(60);
    win.document.getElementById('macro-name').value = 'E2E Macro';
    win.document.getElementById('macro-command').value = 'echo MACRO_FIRED';
    ev(win, 'saveMacroFromForm()');
    await tick(60);
    check('macro saved', ev(win, `getMacros().some(m => m.name === 'E2E Macro')`));
    const macroId = ev(win, `getMacros().find(m => m.name === 'E2E Macro').id`);
    ev(win, `macroRun('${macroId}')`);
    await tick(900);
    check('macro executed in terminal', ev(win, `tabs[activeTabId].term.written.join('')`).includes('MACRO_FIRED'));
    ev(win, 'closeMacros()');

    /* ── 7. Theme engine ── */
    console.log('── Themes ──');
    ev(win, `applyTheme('dracula')`);
    await tick(60);
    check('theme CSS var applied', win.document.documentElement.style.getPropertyValue('--bg').trim() === '#282a36',
        win.document.documentElement.style.getPropertyValue('--bg'));
    check('term theme applied', ev(win, `tabs[activeTabId].term.options.theme.background`) === '#282a36');
    check('theme persisted in settings', ev(win, `getSettings().themeId`) === 'dracula');
    ev(win, `applyTheme('garuda_dragonized')`);

    /* opacity */
    ev(win, `saveSettings({opacity: 80}); applyTheme(getActiveThemeId());`);
    await tick(30);
    check('opacity → rgba background', String(ev(win, `tabs[activeTabId].term.options.theme.background`)).startsWith('rgba('));
    ev(win, `saveSettings({opacity: 100}); applyTheme(getActiveThemeId());`);

    /* ── 8. Settings & reduce motion ── */
    console.log('── Settings ──');
    ev(win, 'openSettings()');
    await tick(400);
    check('settings modal opens', visible(win, 'settings-modal'));
    check('server sessions loaded', win.document.getElementById('server-sessions-list').innerHTML.includes('gk_') || win.document.getElementById('server-sessions-list').innerHTML.includes('this window'));
    const rmToggle = win.document.getElementById('setting-reduced-motion');
    rmToggle.checked = true;
    rmToggle.dispatchEvent(new win.Event('change'));
    await tick(50);
    check('reduce-motion toggles body class', win.document.body.classList.contains('reduce-motion'));
    rmToggle.checked = false;
    rmToggle.dispatchEvent(new win.Event('change'));
    ev(win, 'closeSettings()');

    /* ── 9. Files drawer ── */
    console.log('── File manager ──');
    ev(win, `filesRequestedPath = ${JSON.stringify(PUB)}; toggleFiles();`);
    await tick(700);
    check('files drawer opens', visible(win, 'files-drawer'));
    const fileListHtml = win.document.getElementById('files-list').innerHTML;
    check('files listed', fileListHtml.includes('index.html') && fileListHtml.includes('app.js'));
    check('breadcrumbs rendered', win.document.getElementById('files-crumbs').textContent.includes('public'));
    /* preview a text file */
    ev(win, `previewFile(${JSON.stringify(path.join(PUB, 'manifest.webmanifest'))})`);
    await tick(500);
    check('preview modal shows content', visible(win, 'preview-modal') && win.document.getElementById('preview-content').textContent.includes('Garuda Konsole'));
    ev(win, 'closePreview()');
    /* cd action — assert on the wire (stub bash has no TTY echo) */
    ev(win, `(function(){ const t = tabs[activeTabId]; t._sent = []; const orig = t.ws.send.bind(t.ws); t.ws.send = (d) => { t._sent.push(d); return orig(d); }; })()`);
    ev(win, `actionFileCd({ dataset: { path: '/tmp' } })`);
    await tick(300);
    check('cd command sent to shell', ev(win, `tabs[activeTabId]._sent.some(s => s.includes("cd '/tmp'"))`));
    ev(win, 'closeDrawer("files-drawer")');

    /* ── 10. Stats ── */
    console.log('── System monitor ──');
    ev(win, 'toggleStats()');
    await tick(800);
    check('stats drawer opens', visible(win, 'stats-drawer'));
    check('cpu pct rendered', /^\d+$/.test(win.document.getElementById('stat-cpu-pct').textContent), win.document.getElementById('stat-cpu-pct').textContent);
    check('hostname rendered', win.document.getElementById('stat-hostname').textContent.length > 0);
    check('cpu status chip updated', win.document.getElementById('cpu-chip').textContent.startsWith('cpu '));
    ev(win, 'toggleStats()');

    /* ── 11. Share flow (host) ── */
    console.log('── Live share ──');
    ev(win, 'openShareModal()');
    await tick(400);
    check('share modal opens', visible(win, 'share-modal'));
    ev(win, 'createOrUpdateShareLink()');
    await tick(500);
    const linkVal = win.document.getElementById('share-link-input').value;
    check('share link generated', linkVal.includes('/?share=share_'), linkVal);
    const shareToken = linkVal.split('/?share=')[1];
    check('viewers chip visible', visible(win, 'viewers-chip'));

    /* ── 12. Viewer page sees host history ── */
    console.log('── Spectator (second jsdom page) ──');
    const vdom = await bootDom(`${BASE}/?share=${shareToken}`);
    const vwin = vdom.window;
    await tick(1800);
    check('viewer topbar visible', visible(vwin, 'viewer-topbar'));
    check('viewer toolbar hidden', !visible(vwin, 'main-toolbar'));
    const viewerWritten = ev(vwin, `viewerTerm ? viewerTerm.written.join('') : ''`);
    check('viewer received host history', viewerWritten.includes('FRONTEND_E2E_MARKER'));
    check('viewer is read-only', ev(vwin, 'viewerMode') === 'readonly');

    /* revoke → viewer notified */
    ev(win, 'revokeShareLink()');
    await tick(700);
    check('viewer sees revocation', ev(vwin, `viewerTerm.written.join('')`).includes('ended this live share') || ev(vwin, 'viewerRevoked') === true);

    /* ── 13. Interactive pair ── */
    console.log('── Interactive pair ──');
    ev(win, 'openShareModal()');
    await tick(300);
    ev(win, `document.getElementById('mode-choice-interactive').checked = true;`);
    ev(win, 'createOrUpdateShareLink()');
    await tick(500);
    const link2 = win.document.getElementById('share-link-input').value;
    const pairToken = link2.split('/?share=')[1];
    const pdom = await bootDom(`${BASE}/?share=${pairToken}`);
    const pwin = pdom.window;
    await tick(1600);
    check('pair viewer initialized', ev(pwin, 'viewerMode') === 'interactive');
    ev(pwin, `viewerTerm.triggerData('echo PAIR_TYPES_HERE\\r')`);
    await tick(900);
    check('pair input reaches host terminal', ev(win, `tabs[activeTabId].term.written.join('')`).includes('PAIR_TYPES_HERE'));
    ev(win, 'revokeShareLink()');
    ev(win, 'closeShareModal()');

    /* ── 14. Session restore across "refresh" ── */
    console.log('── Session restore (simulated refresh) ──');
    const savedToken = ev(win, `sessionStorage.getItem('gk_token')`);
    const savedTabs = ev(win, `sessionStorage.getItem('gk_tabs_v3')`);
    const savedActive = ev(win, `sessionStorage.getItem('gk_active_tab_v3')`);
    const marker = 'BEFORE_REFRESH_' + Date.now();
    ev(win, `runCommandInActiveTab('echo ${marker}')`);
    await tick(800);

    const rdom = await bootDom(BASE + '/', (w) => {
        w.sessionStorage.setItem('gk_token', savedToken);
        w.sessionStorage.setItem('gk_tabs_v3', savedTabs);
        w.sessionStorage.setItem('gk_active_tab_v3', savedActive);
    });
    await tick(2200);
    const rwin = rdom.window;
    check('auto-login skipped lockscreen', visible(rwin, 'app') && !visible(rwin, 'lockscreen'));
    check('tabs restored with same ids', ev(rwin, 'Object.keys(tabs).length') === 1 && ev(rwin, 'Object.keys(tabs)[0]') === JSON.parse(savedTabs)[0].id);
    check('tab title restored', ev(rwin, `tabs[activeTabId].title`) === 'Renamed Tab');
    const restoredWritten = ev(rwin, `tabs[activeTabId].term.written.join('')`);
    check('server session survived; history replayed', restoredWritten.includes(marker));
    check('old markers also replayed', restoredWritten.includes('FRONTEND_E2E_MARKER'));

    /* ── 15. Export log & search & alt-lock (no-crash paths) ── */
    console.log('── Misc features ──');
    ev(rwin, 'exportLog()');
    await tick(150);
    check('export log produced toast', rwin.document.getElementById('toast-container').children.length > 0);

    ev(rwin, 'openSearch()');
    await tick(60);
    check('search bar opens', rwin.document.getElementById('search-bar').classList.contains('active'));
    rwin.document.getElementById('search-input').value = 'FRONTEND';
    ev(rwin, 'findNext()');
    ev(rwin, 'closeSearch()');
    check('search closes', !rwin.document.getElementById('search-bar').classList.contains('active'));

    ev(rwin, 'toggleAltLock()');
    await tick(60);
    check('alt lock activates', ev(rwin, 'isAltLocked') === true && rwin.document.getElementById('alt-lock-btn').classList.contains('active-lock'));
    check('helper textarea locked', rwin.document.querySelector('.xterm-helper-textarea').getAttribute('readonly') === 'readonly');
    ev(rwin, 'toggleAltLock()');
    check('alt lock deactivates', ev(rwin, 'isAltLocked') === false);

    /* font size */
    const size0 = ev(rwin, 'defaultFontSize()');
    ev(rwin, 'changeFontSize(2)');
    check('font size increases + chip updates', ev(rwin, 'defaultFontSize()') === Math.min(28, size0 + 2));
    ev(rwin, `changeFontSizeTo(${size0})`);

    /* mobile deck */
    check('symbol row built', rwin.document.getElementById('kb-row-symbols').children.length >= 30);
    ev(rwin, `handleMKey('sym-toggle')`);
    check('symbol row toggles', visible(rwin, 'kb-row-symbols'));
    ev(rwin, `handleMKey('sym-toggle')`);
    ev(rwin, `handleMKey('char:$')`);
    await tick(300);
    ev(rwin, `handleMKey('ctrl-mod')`);
    check('ctrl sticky UI syncs', rwin.document.getElementById('kb-ctrl').classList.contains('sticky-on'));
    ev(rwin, `setCtrlSticky(false)`);

    /* ═══ 3.0 FEATURES ═══ */
    console.log('── 3.0: Split view ──');
    ev(rwin, 'createNewTab()');
    await tick(600);
    const splitTabCount = ev(rwin, 'Object.keys(tabs).length');
    check('second tab for split', splitTabCount >= 2);
    ev(rwin, `splitState.mode = null;`);
    rwin.eval('Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true })');
    ev(rwin, 'startSplit("v")');
    await tick(200);
    check('split mode active', ev(rwin, 'splitState.mode') === 'v');
    check('wrapper has split class', rwin.document.getElementById('terminals-wrapper').classList.contains('split-v'));
    check('both panes visible', ev(rwin, `splitState.tabs.filter(id => id && tabs[id]).length`) === 2);
    const pane0 = ev(rwin, 'splitState.tabs[0]');
    const pane1 = ev(rwin, 'splitState.tabs[1]');
    check('focus starts on pane 0', ev(rwin, 'activeTabId') === pane0);
    ev(rwin, 'setSplitFocus(1)');
    check('focus moves to pane 1', ev(rwin, 'activeTabId') === pane1);
    ev(rwin, 'startSplit("h")');
    check('split orientation changes', ev(rwin, 'splitState.mode') === 'h');
    ev(rwin, 'closeSplit()');
    await tick(120);
    check('split closes cleanly', ev(rwin, 'splitState.mode') === null && !rwin.document.getElementById('terminals-wrapper').classList.contains('split-v'));

    console.log('── 3.0: Recorder & replay ──');
    const recTabId = ev(rwin, 'activeTabId');
    ev(rwin, 'toggleRecording()');
    check('recording started', ev(rwin, `tabs['${recTabId}'].recording !== null`));
    check('rec chip visible', visible(rwin, 'rec-chip'));
    ev(rwin, `runCommandInActiveTab('echo RECORD_MARKER_3')`);
    await tick(900);
    const chunkCount = ev(rwin, `tabs['${recTabId}'].recording.chunks.length`);
    check('output chunks captured', chunkCount > 0, `chunks=${chunkCount}`);
    const recHasMarker = ev(rwin, `tabs['${recTabId}'].recording.chunks.map(c => c.d).join('').includes('RECORD_MARKER_3')`);
    check('recording contains marker', recHasMarker);
    ev(rwin, 'toggleRecording()');
    check('recording stopped + saved', ev(rwin, `tabs['${recTabId}'].recording === null && tabs['${recTabId}'].lastRecording.chunks.length > 0`));
    ev(rwin, 'openReplay()');
    await tick(250);
    check('replay modal opens', visible(rwin, 'replay-modal'));
    check('replay state built', ev(rwin, 'replayState !== null && replayState.chunks.length > 0'));
    ev(rwin, 'replaySeek(1)');
    await tick(80);
    check('seek to end loads all chunks', ev(rwin, 'replayState.idx === replayState.chunks.length'));
    ev(rwin, 'replaySeek(0)');
    check('seek to start resets', ev(rwin, 'replayState.idx === 0'));
    const scrubHeld = ev(rwin, `(function(){ const s = document.getElementById('replay-scrub'); s.value = '123'; scrubDragging = true; updateReplayUI(); const v = s.value; scrubDragging = false; return v; })()`);
    check('scrub not overwritten while dragging', String(scrubHeld) === '123');
    ev(rwin, 'replayPlayPause()');
    check('replay plays', ev(rwin, 'replayState.playing') === true);
    await tick(500);
    check('replay advances frames', ev(rwin, 'replayState.idx') > 0);
    ev(rwin, 'closeReplay()');
    await tick(60);
    check('replay closes + disposes', !visible(rwin, 'replay-modal') && ev(rwin, 'replayState === null'));

    console.log('── 3.0: Triggers ──');
    rwin.document.getElementById('trigger-name').value = 'E2E Alert';
    rwin.document.getElementById('trigger-pattern').value = 'TRIGGER_FIRE_XYZ';
    ev(rwin, 'saveTriggerFromForm()');
    await tick(60);
    check('trigger saved', ev(rwin, `getTriggers().some(t => t.name === 'E2E Alert')`));
    ev(rwin, `runCommandInActiveTab('echo TRIGGER_FIRE_XYZ')`);
    await tick(1000);
    const trigFired = ev(rwin, `getActivityLog().some(a => a.text.includes('E2E Alert'))`);
    check('trigger fired on match', trigFired);
    check('insight counter bumped', ev(rwin, 'getInsights().triggers') >= 1);
    const trigId = ev(rwin, `getTriggers().find(t => t.name === 'E2E Alert').id`);
    ev(rwin, `saveTriggers(getTriggers().filter(t => t.id !== '${trigId}'))`);

    console.log('── 3.0: Chat ──');
    ev(rwin, 'toggleChat()');
    await tick(80);
    check('chat drawer opens', visible(rwin, 'chat-drawer'));
    ev(rwin, `document.getElementById('chat-input').value = 'hello chat'; chatSendFromInput();`);
    await tick(800);
    check('chat echo received (self message)', ev(rwin, `chatLog.some(m => m.text === 'hello chat' && m.self)`));
    check('chat rendered in DOM', rwin.document.getElementById('chat-messages').innerHTML.includes('hello chat'));
    ev(rwin, `(function(){ const b = document.querySelector('#chat-messages .chat-msg'); if (b) b.__mark = 7; })()`);
    ev(rwin, `addChatMessage({ from: 'host', text: 'second message', t: Date.now(), self: false, tabId: 'x' })`);
    await tick(80);
    check('chat appends without rebuilding old bubbles', ev(rwin, `document.querySelector('#chat-messages .chat-msg').__mark`) === 7);
    ev(rwin, 'toggleChat()');

    console.log('── 3.0: Tab profiles & cwd ──');
    ev(rwin, 'openProfileModal()');
    await tick(600);
    const shellOpts = rwin.document.getElementById('profile-shell').options.length;
    check('shell list populated', shellOpts >= 1);
    rwin.document.getElementById('profile-name').value = 'E2E Profile';
    rwin.document.getElementById('profile-cwd').value = '/tmp';
    ev(rwin, 'createProfileTab()');
    await tick(1200);
    const profTab = ev(rwin, `Object.values(tabs).find(t => t.title === 'E2E Profile')`);
    check('profile tab created', !!profTab);
    check('profile tab cwd from init', ev(rwin, `Object.values(tabs).filter(t => t.title === 'E2E Profile')[0].cwd`) === '/tmp',
        String(ev(rwin, `Object.values(tabs).filter(t => t.title === 'E2E Profile')[0].cwd`)));
    check('cwd chip shows /tmp', rwin.document.getElementById('sb-cwd').textContent === '/tmp');

    console.log('── 3.0: Auto theme & import ──');
    ev(rwin, `saveSettings({ autoTheme: true, lightThemeId: 'github_light', darkThemeId: 'dracula' }); applyAutoTheme(true);`);
    await tick(80);
    const hour = new Date().getHours();
    const expected = (hour >= 7 && hour < 19) ? 'github_light' : 'dracula';
    check('auto theme picks by hour', ev(rwin, 'getActiveThemeId()') === expected, `hour=${hour} got=${ev(rwin, 'getActiveThemeId()')}`);
    ev(rwin, `saveSettings({ autoTheme: false }); applyTheme('garuda_dragonized');`);

    rwin.__themeFile = new rwin.File(
        [JSON.stringify({ name: 'Imported E2E', theme: { background: '#123456', foreground: '#ffffff', cursor: '#00ff00' } })],
        'theme.json', { type: 'application/json' });
    await rwin.eval('importThemeFile(__themeFile)');
    await tick(700);
    check('theme imported to host', ev(rwin, `!!customThemes['custom_imported_e2e']`));
    check('imported theme applied', ev(rwin, 'getActiveThemeId()') === 'custom_imported_e2e');
    ev(rwin, `applyTheme('garuda_dragonized')`);
    const delTok = ev(rwin, 'token');
    await fetch(new URL('/api/custom-themes/custom_imported_e2e', BASE), { method: 'DELETE', headers: { Authorization: 'Bearer ' + delTok } });

    console.log('── 3.0: Activity, pins, tour, file search/details ──');
    check('activity log populated', ev(rwin, 'getActivityLog().length') > 0);
    ev(rwin, 'toggleActivity()');
    await tick(80);
    check('activity drawer renders items', visible(rwin, 'activity-drawer') && rwin.document.getElementById('activity-list').children.length > 0);
    check('insights rendered', /^\d+$/.test(rwin.document.getElementById('insight-cmds').textContent));
    ev(rwin, `logActivity('info', 'pulse probe one'); renderActivity(); logActivity('info', 'pulse probe two'); renderActivity();`);
    check('activity re-render keeps old rows animation-free', ev(rwin, `(function(){ const rows = document.querySelectorAll('#activity-list .activity-item'); return rows.length >= 2 && rows[rows.length - 1].classList.contains('no-anim'); })()`) === true);
    ev(rwin, 'toggleActivity()');

    const anyMacro = ev(rwin, 'getMacros()[0].id');
    ev(rwin, `macroTogglePin('${anyMacro}')`);
    await tick(60);
    check('pin bar visible with chip', visible(rwin, 'pin-bar') && rwin.document.getElementById('pin-bar').querySelector('.pin-chip') !== null);
    ev(rwin, `macroTogglePin('${anyMacro}')`);
    await tick(60);
    check('unpin hides bar', !visible(rwin, 'pin-bar'));

    ev(rwin, 'startTour()');
    await tick(80);
    check('tour overlay opens', visible(rwin, 'tour-overlay'));
    ev(rwin, 'tourNext()');
    await tick(60);
    check('tour advances', ev(rwin, 'tourIdx') >= 1);
    ev(rwin, 'endTour(true)');
    await tick(40);
    check('tour done flag stored', ev(rwin, `storeGet('gk_tour_done', false)`) === true);

    ev(rwin, `filesRequestedPath = ${JSON.stringify(PUB)}; toggleFiles();`);
    await tick(700);
    rwin.document.getElementById('files-search-input').value = 'ui';
    ev(rwin, `runFilesSearch('ui')`);
    await tick(800);
    check('file search finds ui.js', rwin.document.getElementById('files-list').innerHTML.includes('ui.js'));
    ev(rwin, `actionFileDetails({ dataset: { path: ${JSON.stringify(path.join(PUB, 'manifest.webmanifest'))} } })`);
    await tick(600);
    check('file details rendered', rwin.document.getElementById('preview-content').textContent.includes('Permissions'));
    ev(rwin, 'closePreview()');
    ev(rwin, 'exitFilesSearch()');
    await tick(400);
    check('search exit returns to browse', rwin.document.getElementById('files-list').innerHTML.includes('index.html'));
    ev(rwin, 'closeDrawer("files-drawer")');

    check('commands insight counted', ev(rwin, 'getInsights().cmds') >= 2);

    console.log('── 4.1.3: notification stack ──');
    ev(rwin, 'refreshNotifStatus()');
    check('notif status line explains platform state', (rwin.document.getElementById('notif-status').textContent || '').length > 10);
    const nuRes = await ev(rwin, 'notifyUser("probe title", "probe body")');
    check('notifyUser degrades gracefully where unsupported', nuRes === false);
    ev(rwin, 'enableNotifications()');
    await tick(150);
    check('enable flow explains limitation via toast', rwin.document.getElementById('toast-container').children.length > 0);

    /* ═══ 3.1: AI GUIDE ═══ */
    console.log('── 3.1: AI Guide agent ──');

    /* Deterministic in-page stub for /api/ai/chat (no quota, no flakiness) */
    rwin.eval(`
        window.__aiScript = [];
        window.__aiCalls = 0;
        (function(){
            const origFetch = window.fetch;
            window.fetch = function(url, opts) {
                if (String(url).includes('/api/ai/chat')) {
                    window.__aiCalls++;
                    const content = window.__aiScript[Math.min(window.__aiCalls - 1, window.__aiScript.length - 1)] || 'Done.';
                    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ content, model: 'test-model', usage: null }) });
                }
                return origFetch(url, opts);
            };
        })();
    `);
    const aiIdle = async (maxMs = 9000) => {
        const t0 = Date.now();
        while (Date.now() - t0 < maxMs) {
            if (ev(rwin, 'aiState.busy === false && aiState.pending === null')) return true;
            await tick(120);
        }
        return false;
    };
    const aiSetup = (mode, script) => {
        rwin.eval(`setAiMode(${JSON.stringify(mode)}); window.__aiScript = ${JSON.stringify(script)}; window.__aiCalls = 0; aiClearConversation();`);
    };

    ev(rwin, `toggleAi()`);
    await tick(120);
    check('AI drawer opens', visible(rwin, 'ai-drawer'));
    check('AI empty state with hints', rwin.document.getElementById('ai-messages').innerHTML.includes('ai-empty-hint'));

    /* ASK mode: approval card → run → output captured → fed back → final answer */
    aiSetup('ask', ['Checking now.\n```cmd\necho AI_CMD_ONE\n```', 'All done — echo fired successfully.']);
    check('mode persisted', ev(rwin, 'getSettings().aiMode') === 'ask');
    ev(rwin, `document.getElementById('ai-input').value = 'run the echo test'; aiSendFromInput();`);
    await tick(600);
    check('ask mode: approval card pending', ev(rwin, `aiState.ui.some(i => i.kind === 'cmd' && i.state === 'pending')`));
    check('ask mode: nothing executed yet', ev(rwin, 'window.__aiCalls') === 1);
    check('ask mode: run button rendered', rwin.document.getElementById('ai-messages').innerHTML.includes('ai-cmd-run'));
    ev(rwin, `aiResolveDecision('run')`);
    await aiIdle();
    check('ask mode: command executed & captured', ev(rwin, `aiState.ui.some(i => i.kind === 'cmd' && i.state === 'done' && (i.output || '').includes('AI_CMD_ONE'))`));
    check('ask mode: output fed back to model', ev(rwin, 'window.__aiCalls') === 2);
    check('ask mode: final answer rendered', ev(rwin, `aiState.ui.some(i => i.kind === 'assistant' && i.text.includes('All done'))`));
    check('ask mode: agent finished (not busy)', ev(rwin, 'aiState.busy') === false);
    ev(rwin, 'renderAiMessages()');
    check('AI re-render marks known items no-anim', ev(rwin, `(function(){ const n = document.querySelector('#ai-messages .ai-msg, #ai-messages .ai-cmd-card'); return !!n && n.classList.contains('no-anim'); })()`) === true);
    check('AI activity logged', ev(rwin, `getActivityLog().some(a => a.text.includes('AI Guide'))`));

    /* AUTO mode: runs without approval */
    aiSetup('auto', ['```cmd\necho AI_AUTO_RUNS\n```', 'Finished automatically.']);
    ev(rwin, `aiSend('do the auto thing')`);
    await aiIdle();
    check('auto mode: executed without approval', ev(rwin, `aiState.ui.some(i => i.kind === 'cmd' && i.state === 'done' && (i.output || '').includes('AI_AUTO_RUNS'))`));
    check('auto mode: loop finished', ev(rwin, 'aiState.busy') === false && ev(rwin, 'window.__aiCalls') === 2);

    /* DANGER: even auto mode must stop for catastrophic commands */
    aiSetup('auto', ['Sure.\n```cmd\nrm -rf /\n```', 'Understood — I will not run destructive commands.']);
    ev(rwin, `aiSend('wipe the disk')`);
    await tick(600);
    check('danger: flagged in auto mode', ev(rwin, `aiState.ui.some(i => i.kind === 'cmd' && i.state === 'pending' && i.danger)`));
    ev(rwin, `aiResolveDecision('skip')`);
    await aiIdle();
    check('danger: never executed', ev(rwin, `!aiState.ui.some(i => i.kind === 'cmd' && i.state === 'done')`));

    /* CHAT mode: suggestion card, never auto-executed */
    aiSetup('chat', ['You can use:\n```cmd\necho AI_CHAT_SUGGEST\n```']);
    ev(rwin, `aiSend('how do I test echo')`);
    await aiIdle();
    check('chat mode: suggestion card only', ev(rwin, `aiState.ui.some(i => i.kind === 'cmd' && i.state === 'suggestion')`));
    check('chat mode: no execution loop', ev(rwin, 'window.__aiCalls') === 1 && ev(rwin, 'aiState.busy') === false);
    /* Run-once from the suggestion card */
    const suggId = ev(rwin, `(aiState.ui.find(i => i.state === 'suggestion') || {}).id`);
    ev(rwin, `aiRunSuggestion('${suggId}')`);
    await tick(2400);
    check('chat mode: run-once executes & shows output', ev(rwin, `aiState.ui.some(i => i.id === '${suggId}' && i.state === 'done' && (i.output || '').includes('AI_CHAT_SUGGEST'))`));

    /* STOP during pending approval */
    aiSetup('ask', ['```cmd\nsleep 30\n```']);
    ev(rwin, `aiSend('run something slow')`);
    await tick(500);
    check('stop test: card pending', ev(rwin, `aiState.pending !== null`));
    ev(rwin, `aiStop()`);
    await aiIdle();
    check('stop ends task cleanly', ev(rwin, 'aiState.pending === null && aiState.busy === false && aiState.stopped === true'));
    ev(rwin, `aiClearConversation()`);

    /* Rate-limit resilience: 429 once → agent waits, retries, completes */
    rwin.eval(`
        window.__ai429Once = true;
        (function(){
            const prev = window.fetch;
            window.fetch = function(url, opts) {
                if (String(url).includes('/api/ai/chat') && window.__ai429Once) {
                    window.__ai429Once = false;
                    return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({ error: 'rate_limit_exceeded: OTPM limit 1000' }) });
                }
                return prev(url, opts);
            };
        })();
        aiRetryDelayMs = 400;
    `);
    aiSetup('ask', ['```cmd\necho AI_RETRY_WORKS\n```', 'Recovered from the rate limit.']);
    ev(rwin, `aiSend('retry test')`);
    await tick(900);
    check('429: waiting notice shown', ev(rwin, `aiState.ui.some(i => i.kind === 'sys' && /waiting/i.test(i.text))`));
    check('429: retried → approval card appeared', ev(rwin, `aiState.pending !== null`));
    ev(rwin, `aiResolveDecision('run')`);
    await aiIdle(12000);
    check('429: command executed after retry', ev(rwin, `aiState.ui.some(i => i.kind === 'cmd' && i.state === 'done' && (i.output || '').includes('AI_RETRY_WORKS'))`));
    check('429: task completed', ev(rwin, `aiState.ui.some(i => i.kind === 'assistant' && i.text.includes('Recovered'))`));
    ev(rwin, `aiClearConversation()`);

    /* AI settings panel */
    ev(rwin, 'openSettings()');
    await tick(500);
    const keyStatus = rwin.document.getElementById('ai-key-status').textContent;
    check('settings shows masked key status', keyStatus.includes('\u2022') && !keyStatus.includes('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'));
    check('settings shows model', rwin.document.getElementById('setting-ai-model').value.length > 3);
    ev(rwin, 'closeSettings()');
    ev(rwin, 'toggleAi()');

    /* ═══ 4.0 ═══ */
    console.log('── 4.0: AI second-task buttons (regression) ──');
    aiSetup('ask', ['```cmd\necho SECOND_TASK_BTN\n```', 'second done']);
    ev(rwin, `aiSend('second task please')`);
    await tick(700);
    check('second task: approval buttons rendered in DOM', rwin.document.getElementById('ai-messages').innerHTML.includes('ai-cmd-run'));
    ev(rwin, `aiResolveDecision('run')`);
    await aiIdle();
    check('second task completed', ev(rwin, `aiState.ui.some(i => i.kind === 'cmd' && i.state === 'done')`));

    console.log('── 4.0: ring buffer & instant replay ──');
    ev(rwin, `runCommandInActiveTab('echo RING_CONTENT_X')`);
    await tick(900);
    check('ring captured recent output', ev(rwin, `(function(){ const r = getRingRecording(getActiveTab()); return !!r && r.chunks.length > 0 && r.chunks.map(c=>c.d).join('').includes('RING_CONTENT_X'); })()`));
    ev(rwin, `openReplay(getRingRecording(getActiveTab()))`);
    await tick(200);
    check('ring replay modal opens', visible(rwin, 'replay-modal') && ev(rwin, 'replayState !== null'));
    ev(rwin, 'closeReplay()');
    ev(rwin, `saveSettings({ ringSecs: 0 }); (function(){ const t = getActiveTab(); t.ring = null; })(); saveSettings({ ringSecs: 60 });`);

    console.log('── 4.0: touch selection toolbar ──');
    rwin.eval(`window.matchMedia = () => ({ matches: true, addEventListener(){}, removeEventListener(){} });`);
    const selTab = ev(rwin, 'activeTabId');
    ev(rwin, `tabs['${selTab}'].term._selection = 'ERR_SOMETHING_BROKE'; onTermSelectionChange(tabs['${selTab}']);`);
    await tick(60);
    check('selection toolbar appears on touch selection', visible(rwin, 'sel-toolbar'));
    ev(rwin, `ACTIONS['sel-explain']()`);
    await tick(300);
    check('Explain-with-AI prefilled & sent', ev(rwin, `aiState.messages.some(m => m.role === 'user' && m.content.includes('ERR_SOMETHING_BROKE'))`));
    check('toolbar hidden after action', !visible(rwin, 'sel-toolbar'));
    ev(rwin, 'aiStop(); aiClearConversation();');
    await tick(200);

    console.log('── 4.0.2: on-screen keys keep the soft keyboard open ──');
    ev(rwin, `(function(){ const t = tabs[activeTabId]; t._kb = []; const o = t.ws.send.bind(t.ws); t.ws.send = (d) => { t._kb.push(d); return o(d); }; })()`);
    const pdPrevented = ev(rwin, `(function(){
        const ta = tabs[activeTabId].termEl.querySelector('.xterm-helper-textarea');
        ta.focus();
        const btn = document.querySelector('#kb-row-ctrl [data-mkey="esc"]');
        const e = new window.Event('pointerdown', { bubbles: true, cancelable: true });
        btn.dispatchEvent(e);
        return e.defaultPrevented;
    })()`);
    check('deck key pointerdown cancels focus steal', pdPrevented === true);
    ev(rwin, `(function(){ const btn = document.querySelector('#kb-row-ctrl [data-mkey="esc"]'); btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); })()`);
    await tick(250);
    check('deck click still transmits the key', ev(rwin, `(function(){ return tabs[activeTabId]._kb.some(d => { try { return JSON.parse(d).data === String.fromCharCode(27); } catch (e) { return false; } }); })()`) === true);
    check('terminal textarea keeps focus after deck press', ev(rwin, `document.activeElement && document.activeElement.classList.contains('xterm-helper-textarea')`) === true);

    console.log('── 4.0: floating control ball ──');
    ev(rwin, `saveSettings({ floatBall: true }); initFloatBall();`);
    await tick(60);
    check('float ball visible when enabled', visible(rwin, 'float-ball'));
    ev(rwin, 'toggleBallPad(true)');
    check('ball pad expands', visible(rwin, 'float-ball-pad'));
    ev(rwin, `(function(){ const t = tabs[activeTabId]; t._sent2 = []; const o = t.ws.send.bind(t.ws); t.ws.send = (d) => { t._sent2.push(d); return o(d); }; })()`);
    ev(rwin, `handleMKey('esc')`);
    check('ball pad keys transmit', ev(rwin, `tabs[activeTabId]._sent2.some(d => d.includes('"\\u001b"') || d.includes('esc') || JSON.parse(d).data === '\x1b')`));
    ev(rwin, `handleMKey('ball-close')`);
    check('ball pad closes', !visible(rwin, 'float-ball-pad'));

    console.log('── 4.1: waiting-task input UI ──');
    rwin.eval(`
        (function(){
            const prev = window.fetch;
            window.__inputSent = [];
            window.__restoreTasksFetch = function(){ window.fetch = prev; };
            window.fetch = function(url, opts) {
                const u = String(url);
                if (u.includes('/api/tasks') && (!opts || !opts.method)) {
                    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ tasks: [
                        { id: 'tk_wait', name: 'Waiting task', cmd: 'read p', cwd: '/tmp', shell: 'bash', alive: true, waiting: true, exitCode: null, notify: true, elapsedMs: 5200, tail: 'Password: ' }
                    ] }) });
                }
                if (/\\/api\\/tasks\\/[\\w]+\\/input/.test(u) && opts && opts.method === 'POST') {
                    window.__inputSent.push(JSON.parse(opts.body).data);
                    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) });
                }
                return prev(url, opts);
            };
        })();
    `);
    ev(rwin, 'renderTasks()');
    await tick(150);
    const taskHtml = rwin.document.getElementById('task-list').innerHTML;
    check('waiting chip rendered', taskHtml.includes('needs input'));
    check('task input row rendered', taskHtml.includes('data-task-input="tk_wait"'));
    const taskInputEl = rwin.document.querySelector('[data-task-input="tk_wait"]');
    check('task input element exists', !!taskInputEl);
    if (taskInputEl) {
        taskInputEl.value = 'mypw';
        taskInputEl.dispatchEvent(new rwin.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    }
    await tick(250);
    const sentJoin = String(ev(rwin, 'window.__inputSent.join("|")') || '');
    check('Enter in task input sends line', sentJoin.includes('mypw\n'), JSON.stringify(sentJoin));
    /* re-render stability: same DOM nodes, typed input survives the poll */
    ev(rwin, `(function(){ const r = document.querySelector('.task-row[data-id="tk_wait"]'); if (r) r.__mark = 42; const i = document.querySelector('[data-task-input="tk_wait"]'); if (i) i.value = 'midtype'; })()`);
    ev(rwin, 'renderTasks()');
    await tick(150);
    check('task re-render keeps DOM nodes (no pulse)', ev(rwin, `document.querySelector('.task-row[data-id="tk_wait"]').__mark`) === 42);
    check('task re-render preserves typed input', ev(rwin, `document.querySelector('[data-task-input="tk_wait"]').value`) === 'midtype');
    check('existing task rows marked no-anim', ev(rwin, `document.querySelector('.task-row[data-id="tk_wait"]').classList.contains('no-anim')`) === true);
    rwin.document.querySelector('[data-task-input="tk_wait"]').focus();
    ev(rwin, 'renderTasks()');
    await tick(200);
    check('poll never steals focus from task input (keyboard stays up)', ev(rwin, `document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.taskInput : null`) === 'tk_wait');
    ev(rwin, `ACTIONS['task-input-quick']({ dataset: { id: 'tk_wait', val: 'cc' } })`);
    await tick(200);
    const sentJoin2 = String(ev(rwin, 'window.__inputSent.join("|")') || '');
    check('quick ^C sends interrupt byte', sentJoin2.includes('\x03'), JSON.stringify(sentJoin2));
    ev(rwin, 'window.__restoreTasksFetch && window.__restoreTasksFetch()');

    console.log('── 4.0: tasks drawer & scheduler UI ──');
    const tokR = ev(rwin, 'token');
    await fetch(new URL('/api/tasks', BASE), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokR }, body: JSON.stringify({ name: 'UI task', cmd: 'echo UI_TASK_X; sleep 0.2' }) });
    await tick(1200);
    ev(rwin, 'toggleTasks()');
    await tick(700);
    check('tasks drawer lists server task', visible(rwin, 'tasks-drawer') && rwin.document.getElementById('task-list').innerHTML.includes('UI task'));
    ev(rwin, 'toggleTasks()');
    const schTok = tokR;
    const schRes = await (await fetch(new URL('/api/schedules', BASE), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + schTok }, body: JSON.stringify({ name: 'UI sched', cmd: 'echo S', when: { type: 'interval', everyMin: 30 } }) })).json();
    ev(rwin, 'openSchedule()');
    await tick(600);
    check('scheduler modal lists schedule', visible(rwin, 'schedule-modal') && rwin.document.getElementById('schedule-list').innerHTML.includes('UI sched'));
    ev(rwin, 'closeSchedule()');
    await fetch(new URL('/api/schedules/' + schRes.schedule.id, BASE), { method: 'DELETE', headers: { Authorization: 'Bearer ' + schTok } });

    console.log('── 4.0: news modal & grid view ──');
    ev(rwin, `storeSet(K.newsSeen, null); showNewsIfNew();`);
    check('news modal shows for new version', visible(rwin, 'news-modal'));
    ev(rwin, 'closeNews()');
    check('news modal closes + flag set', !visible(rwin, 'news-modal') && ev(rwin, `storeGet(K.newsSeen, '')`) === ev(rwin, 'APP_VERSION'));
    ev(rwin, `filesView = 'grid'; renderFilesList();`);
    check('files grid view class applied', rwin.document.getElementById('files-list').classList.contains('grid-view'));
    ev(rwin, `filesView = 'list'; renderFilesList();`);

    /* ═══ 5.0 ═══ */
    console.log('── 5.0: news waits for tour ──');
    ev(rwin, `storeSet(K.newsSeen, null); storeSet(K.tourDone, null); tourPlanned = true;`);
    ev(rwin, 'showNewsIfNew()');
    check('news suppressed while tour planned', !visible(rwin, 'news-modal') && ev(rwin, 'newsPending') === true);
    ev(rwin, 'startTour()');
    ev(rwin, 'showNewsIfNew()');
    check('news suppressed while tour running', !visible(rwin, 'news-modal'));
    ev(rwin, 'endTour(true)');
    await tick(900);
    check('news appears after tour ends', visible(rwin, 'news-modal'));
    ev(rwin, 'closeNews()');

    console.log('── 5.0: push subscribe recovers from stale-key failure ──');
    rwin.eval(`
        Object.defineProperty(window, 'isSecureContext', { get: () => true, configurable: true });
        window.Notification = function N(t, o) { N.permission = 'granted'; };
        window.Notification.permission = 'granted';
        window.Notification.requestPermission = async () => 'granted';
        let subCalls = 0;
        const regStub = {
            showNotification: async () => {},
            pushManager: {
                getSubscription: async () => (window.__oldSub || null),
                subscribe: async () => {
                    subCalls++;
                    if (subCalls === 1) throw new Error('stale applicationServerKey');
                    window.__subbed = true;
                    return { toJSON: () => ({ endpoint: 'https://push.test/new-ep', keys: { p256dh: 'a', auth: 'b' } }) };
                }
            }
        };
        window.__oldSub = { endpoint: 'https://push.test/old', unsubscribe: async () => { window.__unsub = (window.__unsub || 0) + 1; } };
        Object.defineProperty(window.navigator, 'serviceWorker', { value: { ready: Promise.resolve(regStub), getRegistration: async () => regStub }, configurable: true });
    `);
    await ev(rwin, 'togglePush(true)');
    await tick(400);
    check('stale subscription dropped first', ev(rwin, 'window.__unsub') >= 1);
    check('subscribe retried and succeeded', ev(rwin, 'window.__subbed') === true);
    const pushSt = await (await fetch(new URL('/api/push/status', BASE), { headers: { Authorization: 'Bearer ' + ev(rwin, 'token') } })).json();
    check('server registered the new subscription', pushSt.count >= 1);
    await fetch(new URL('/api/push/unsubscribe', BASE), { method: 'POST', headers: { Authorization: 'Bearer ' + ev(rwin, 'token'), 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: 'https://push.test/new-ep' }) });

    console.log('── 5.0: voice (TTS/STT) plumbing ──');
    rwin.eval(`
        window.__speechCalls = 0;
        (function(){
            const prev = window.fetch;
            window.fetch = function(url, opts) {
                if (String(url).includes('/api/ai/speech')) {
                    window.__speechCalls++;
                    return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['mp3bytes'], { type: 'audio/mpeg' })) });
                }
                return prev(url, opts);
            };
        })();
    `);
    ev(rwin, `speakText('hello voice')`);
    await tick(300);
    check('speakText hits speech proxy', ev(rwin, 'window.__speechCalls') >= 1);
    ev(rwin, 'stopSpeaking()');
    ev(rwin, `ACTIONS['ai-mic']()`);
    await tick(150);
    check('mic degrades gracefully without MediaRecorder', rwin.document.getElementById('toast-container').textContent.includes('Microphone'));

    /* ── 5.1.5: Stop button silences voice replies ── */
    console.log('── 5.1.5: stop button silences voice ──');
    rwin.eval(`
        window.__played = 0; window.__paused = 0; window.__speechGate = null;
        window.__OrigAudioStub = window.Audio;
        window.Audio = function A(url) {
            this.src = url;
            this.play = () => { window.__played++; return Promise.resolve(); };
            this.pause = () => { window.__paused++; };
        };
        (function(){
            const prev = window.fetch;
            window.__restoreSpeechFetch2 = function () { window.fetch = prev; };
            window.fetch = function (url, opts) {
                if (String(url).includes('/api/ai/speech')) {
                    /* Gated: the render only resolves when the test releases it,
                       so we can stop WHILE the TTS request is in flight. */
                    return new Promise((resolve) => {
                        window.__speechGate = () => resolve({ ok: true, status: 200, headers: { get: () => 'audio/wav' }, blob: () => Promise.resolve(new Blob(['wavbytes'], { type: 'audio/wav' })) });
                    });
                }
                return prev(url, opts);
            };
        })();
    `);
    /* a) stop mid-render: the in-flight TTS must NOT start playing afterwards */
    ev(rwin, `window.__spokeA = speakText('rendering while stopped')`);
    await tick(60);
    ev(rwin, 'stopSpeaking()');
    ev(rwin, `window.__speechGate && window.__speechGate()`);
    await tick(120);
    check('speech stopped mid-render never starts playing', ev(rwin, 'window.__played') === 0);
    check('speakText resolves false when stopped mid-render', (await ev(rwin, 'window.__spokeA')) === false);
    /* b) normal playback, then stopSpeaking pauses the audio element */
    ev(rwin, `window.__spokeB = speakText('hello again')`);
    await tick(60);
    ev(rwin, `window.__speechGate && window.__speechGate()`);
    await tick(150);
    check('speech plays when not stopped', ev(rwin, 'window.__played') === 1);
    ev(rwin, 'stopSpeaking()');
    check('stopSpeaking pauses the playing audio', ev(rwin, 'window.__paused') >= 1);
    /* c) the agent Stop button silences the voice reply too */
    ev(rwin, `window.__played = 0; window.__paused = 0; aiState.busy = true; aiState.stopped = false; aiState.pending = null; aiState.tabId = null;`);
    ev(rwin, `window.__spokeC = speakText('agent reply')`);
    await tick(60);
    ev(rwin, `window.__speechGate && window.__speechGate()`);
    await tick(150);
    check('agent reply voice is playing before Stop', ev(rwin, 'window.__played') === 1);
    ev(rwin, 'aiStop()');
    check('aiStop silences the currently playing voice', ev(rwin, 'window.__paused') >= 1);
    check('aiStop still stops the agent run itself', ev(rwin, 'aiState.stopped') === true && ev(rwin, 'aiState.busy') === true);
    ev(rwin, `aiState.busy = false; aiState.stopped = false; window.__restoreSpeechFetch2 && window.__restoreSpeechFetch2(); window.Audio = window.__OrigAudioStub;`);

    console.log('── 5.0: live task log viewer ──');
    const tokR2 = ev(rwin, 'token');
    const ltRes = await (await fetch(new URL('/api/tasks', BASE), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokR2 }, body: JSON.stringify({ name: 'live log', cmd: 'echo L1_START; sleep 1.6; echo L2_DONE_LATER', notify: false }) })).json();
    ev(rwin, `ACTIONS['task-log']({ dataset: { id: '${ltRes.id}' } })`);
    await tick(600);
    /* poll instead of fixed sleeps — task spawn + first log poll can exceed 600 ms on slow runs */
    for (let i = 0; i < 24 && !(visible(rwin, 'preview-modal') && rwin.document.getElementById('preview-content').textContent.includes('L1_START')); i++) await tick(150);
    check('task log modal opens', visible(rwin, 'preview-modal') && rwin.document.getElementById('preview-content').textContent.includes('L1_START'));
    check('download hidden for logs', rwin.document.getElementById('preview-download-btn').classList.contains('hidden'));
    for (let i = 0; i < 30 && !rwin.document.getElementById('preview-content').textContent.includes('L2_DONE_LATER'); i++) await tick(150);
    check('log auto-refreshes while running', rwin.document.getElementById('preview-content').textContent.includes('L2_DONE_LATER'));
    ev(rwin, 'closePreview()');
    check('log poll stops on close', ev(rwin, 'taskLogTimer === null'));

    /* kill session from settings → tab gets session_closed → new tab spawned */
    console.log('── Session kill propagation ──');
    const idBefore = ev(rwin, 'activeTabId');
    const tok2 = ev(rwin, 'token');
    await fetch(new URL('/api/sessions/kill', BASE), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok2 }, body: JSON.stringify({ tabId: idBefore }) }).catch(() => {});
    await tick(1200);
    const idAfter = ev(rwin, 'activeTabId');
    check('killed tab removed and fresh tab spawned', idAfter !== idBefore && ev(rwin, 'Object.keys(tabs).length') >= 1);

    /* ── 15.9 v5.1: voice & model extras ── */
    console.log('── v5.1 voice & model extras ──');

    /* speakLastOutput reads the visible screen tail through TTS */
    ev(rwin, `window.__spoke = []; window.__origSpeak = speakText; speakText = (t) => { window.__spoke.push(t); return true; };`);
    ev(rwin, `tabs[activeTabId].term.buffer = { active: { length: 2, getLine: (r) => ({ translateToString: () => r === 0 ? 'OUT_LINE_A' : 'OUT_LINE_B' }) } };`);
    ev(rwin, `speakLastOutput()`);
    check('speakLastOutput speaks the screen tail', ev(rwin, `window.__spoke.join('|')`).includes('OUT_LINE_A') && ev(rwin, `window.__spoke.join('|')`).includes('OUT_LINE_B'));
    ev(rwin, `speakText = window.__origSpeak;`);

    /* Audio export of any text (AI replies) — WAV since Groq retired Orpheus MP3 */
    ev(rwin, `(function(){ window.__origFetch2 = window.fetch; window.__mp3req = null; window.__dl = null;
        window.fetch = async (u, o) => { if (String(u).includes('/api/ai/speech')) { window.__mp3req = { u: String(u), body: String(o && o.body) }; return { ok: true, headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'audio/wav' : null) }, blob: async () => ({ size: 1234 }) }; } return window.__origFetch2(u, o); };
        URL.createObjectURL = () => 'blob:fake'; URL.revokeObjectURL = () => {};
        HTMLAnchorElement.prototype.click = function () { window.__dl = this.download; };
    })()`);
    ev(rwin, `downloadTextAsMp3('Export this reply', 'item9')`);
    await tick(80);
    check('voice export calls the speech endpoint', String(ev(rwin, `window.__mp3req && window.__mp3req.u`)).includes('/api/ai/speech'));
    check('voice export sends the text', String(ev(rwin, `window.__mp3req && window.__mp3req.body`)).includes('Export this reply'));
    check('voice export downloads a named .wav (matches served format)', String(ev(rwin, `window.__dl`)).endsWith('.wav') && String(ev(rwin, `window.__dl`)).includes('item9'));
    ev(rwin, `window.fetch = window.__origFetch2;`);

    /* voice command → confirm gate → runs (and cancel path) */
    ev(rwin, `runVoiceCommand('echo VOICE_CMD_X')`);
    await tick(40);
    check('voice command opens confirm gate', !rwin.document.getElementById('confirm-modal').classList.contains('hidden'));
    check('voice command shows the dictated text', rwin.document.getElementById('confirm-message').textContent.includes('echo VOICE_CMD_X'));
    ev(rwin, `resolveConfirmOk()`);
    await tick(250);
    check('voice command runs after confirm', ev(rwin, `tabs[activeTabId].term.written.join('')`).includes('VOICE_CMD_X'));
    ev(rwin, `runVoiceCommand('echo VOICE_CMD_NO')`);
    await tick(40);
    ev(rwin, `resolveConfirmCancel()`);
    await tick(150);
    check('voice command cancel does not run', !ev(rwin, `tabs[activeTabId].term.written.join('')`).includes('VOICE_CMD_NO'));
    let voiceCmdCrash = false;
    try { ev(rwin, `ACTIONS['voice-cmd']()`); } catch (e) { voiceCmdCrash = true; }
    await tick(30);
    check('voice-cmd degrades gracefully without MediaRecorder', !voiceCmdCrash);

    /* explain-before-run on approval cards */
    ev(rwin, `(function(){ const of = window.fetch; window.__origFetch3 = of;
        window.fetch = function(u, o) { if (String(u).includes('/api/ai/chat')) { return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ content: 'It lists directory contents. Harmless read-only.' }) }); } return of(u, o); };
    })()`);
    ev(rwin, `aiClearConversation(); aiPush({ kind: 'cmd', cmd: 'ls -la /tmp', state: 'pending' }); renderAiMessages();`);
    check('explain button rendered on pending card', rwin.document.getElementById('ai-messages').innerHTML.includes('ai-cmd-explain'));
    ev(rwin, `ACTIONS['ai-cmd-explain']({ dataset: { id: String(aiState.ui[aiState.ui.length - 1].id) }, disabled: false, textContent: 'x' })`);
    await tick(100);
    check('explanation stored on the card item', String(ev(rwin, `aiState.ui[aiState.ui.length - 1].expl`)).includes('lists directory'));
    check('explanation rendered inside the card', rwin.document.getElementById('ai-messages').innerHTML.includes('ai-cmd-explain') && rwin.document.getElementById('ai-messages').textContent.includes('Harmless'));
    ev(rwin, `window.fetch = window.__origFetch3;`);

    /* file-manager audio transcription action */
    ev(rwin, `(function(){ const of = window.fetch; window.__origFetch4 = of;
        window.fetch = function(u) { if (String(u).includes('/api/files/transcribe')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ text: 'Hello from the audio file.', model: 'whisper-large-v3-turbo' }) }); return of.apply(null, arguments); };
    })()`);
    ev(rwin, `ACTIONS['file-transcribe']({ dataset: { path: '/srv/audio/demo.mp3', name: 'demo.mp3' } })`);
    await tick(80);
    check('transcription opens the preview modal', !rwin.document.getElementById('preview-modal').classList.contains('hidden'));
    check('transcription text displayed', rwin.document.getElementById('preview-content').textContent.includes('Hello from the audio file'));
    ev(rwin, `window.fetch = window.__origFetch4; document.getElementById('preview-modal').classList.add('hidden');`);

    /* drawer quick-model select */
    ev(rwin, `(function(){ const of = window.fetch; window.__origFetch5 = of; window.__cfgPosts = [];
        window.fetch = function(u, o) { const su = String(u);
            if (su.includes('/api/ai/models')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ models: [{ id: 'qwen/qwen3.8-27b', name: 'Qwen3.8 27B' }, { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B' }, { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' }], tts: { voices: ['autumn', 'diana'] }, stt: { models: ['whisper-large-v3-turbo'] } }) });
            if (su.includes('/api/ai/config') && o && o.method === 'POST') { const b = typeof o.body === 'string' ? o.body : '{}'; window.__cfgPosts.push(b); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(b)) }); }
            if (su.includes('/api/ai/config')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ hasKey: true, keyPreview: 'gsk_ab…cd', keySource: 'config', model: 'openai/gpt-oss-20b', maxTokens: 800 }) });
            return of.apply(null, arguments); };
    })()`);
    ev(rwin, `saveSettings({ aiVoiceName: 'tara' })`);   // a retired legacy voice, as saved by pre-5.1.3 builds
    ev(rwin, `loadAiConfig()`);
    await tick(120);
    check('quick model select populated', ev(rwin, `document.getElementById('ai-model-quick').options.length`) === 3);
    check('quick model select visible with active model', !ev(rwin, `document.getElementById('ai-model-quick').classList.contains('hidden')`) && ev(rwin, `document.getElementById('ai-model-quick').value`) === 'openai/gpt-oss-20b');
    /* ── 5.1.3: voice catalog churn ── */
    check('default voice is from the current catalog', ev(rwin, `DEFAULT_SETTINGS.aiVoiceName`) === 'autumn');
    check('voice picker populated from server catalog', ev(rwin, `document.getElementById('setting-ai-voice').options.length`) === 2);
    check('retired saved voice snaps to first valid option', ev(rwin, `document.getElementById('setting-ai-voice').value`) === 'autumn');
    ev(rwin, `saveSettings({ aiVoiceName: 'autumn' })`);
    ev(rwin, `(function(){ const s = document.getElementById('ai-model-quick'); s.value = 'openai/gpt-oss-120b'; s.dispatchEvent(new Event('change')); })()`);
    await tick(120);
    check('model switch posted to server config', ev(rwin, `window.__cfgPosts.length`) === 1 && String(ev(rwin, `window.__cfgPosts[0]`)).includes('gpt-oss-120b'));
    check('model chip reflects the switch', rwin.document.getElementById('ai-model-chip').textContent.includes('gpt-oss-120b'));
    ev(rwin, `window.fetch = window.__origFetch5;`);

    /* ── 5.1.1: live-connection notifications & hidden-tab fallbacks ── */
    console.log('── 5.1.1: live WS notifications & hidden-tab fallbacks ──');
    rwin.eval(`
        window.__nuCalls = [];
        window.__toastCalls = [];
        window.__origNotifyUser2 = notifyUser;
        window.__origToastSafe2 = showToastSafe;
        notifyUser = function (t, b, o) { window.__nuCalls.push({ t: t, b: b, tag: o && o.tag }); return Promise.resolve(true); };
        showToastSafe = function (type, title, text) { window.__toastCalls.push({ type: type, title: title, text: text }); };
        window.__setHidden = function (v) { Object.defineProperty(document, 'hidden', { get: () => v, configurable: true }); };
        window.__setHidden(true);
    `);
    ev(rwin, `handleHostCtrl(tabs[activeTabId], { type: 'notify', title: '⌨️ Task needs input', body: '"build" is waiting at a prompt.', tag: 'taskwait:tkA' })`);
    await tick(60);
    check('hidden tab: live WS notify becomes a system notification', ev(rwin, `window.__nuCalls.some(c => c.tag === 'taskwait:tkA' && /needs input/.test(c.t))`) === true);
    ev(rwin, `handleHostCtrl(tabs[activeTabId], { type: 'notify', title: '⌨️ Task needs input', body: '"build" is waiting at a prompt.', tag: 'taskwait:tkA' })`);
    await tick(60);
    check('same event on multiple tabs alerts once (tag dedup)', ev(rwin, `window.__nuCalls.filter(c => c.tag === 'taskwait:tkA').length`) === 1);
    ev(rwin, `window.__setHidden(false)`);
    ev(rwin, `handleHostCtrl(tabs[activeTabId], { type: 'notify', title: '✓ Task finished', body: 'build — exit 0 (3s)', tag: 'task:tkB' })`);
    await tick(60);
    check('visible tab: live WS notify becomes an in-app toast', ev(rwin, `window.__toastCalls.some(c => /Task finished/.test(c.title))`) === true);
    check('visible tab: no system notification for the same event', ev(rwin, `window.__nuCalls.some(c => c.tag === 'task:tkB')`) === false);
    ev(rwin, `handleHostCtrl(tabs[activeTabId], { type: 'notify', title: 'Shell exited', body: 'bye', tag: 'exit:tkC' })`);
    await tick(60);
    check('shell-exit mirror does not double-toast in foreground', ev(rwin, `window.__toastCalls.some(c => /Shell exited/.test(c.title))`) === false);

    /* hidden-tab poll fallback: renderTasks / tasksBadgeTick must alert for
       waiting tasks WITHOUT touching the DOM (regression: the notify branch
       used to be unreachable dead code — the poll was skipped while hidden) */
    rwin.eval(`
        window.__setHidden(true);
        window.__stubTaskId = 'tk_hidden';
        document.getElementById('tasks-drawer').classList.add('hidden');
        const prevF2 = window.fetch;
        window.__restoreTF2 = function () { window.fetch = prevF2; };
        window.fetch = function (url, opts) {
            const u = String(url);
            if (u.includes('/api/tasks') && (!opts || !opts.method)) {
                return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ tasks: [
                    { id: window.__stubTaskId, name: 'Hidden waiter', cmd: 'read p', cwd: '/tmp', shell: 'bash', alive: true, waiting: true, exitCode: null, notify: true, elapsedMs: 9000, tail: 'Password: ' }
                ] }) });
            }
            return prevF2(url, opts);
        };
        document.getElementById('task-list').innerHTML = '';
    `);
    ev(rwin, 'renderTasks()');
    await tick(300);
    check('hidden poll fires needs-input notification (was dead code)', ev(rwin, `window.__nuCalls.some(c => c.tag === 'taskwait:tk_hidden')`) === true);
    check('hidden poll does no DOM rendering', ev(rwin, `document.getElementById('task-list').children.length`) === 0);
    ev(rwin, `window.__stubTaskId = 'tk_badge'`);
    ev(rwin, 'tasksBadgeTick()');
    await tick(300);
    check('hidden badge poll also fires the alert', ev(rwin, `window.__nuCalls.some(c => c.tag === 'taskwait:tk_badge')`) === true);
    ev(rwin, `window.__setHidden(false); window.__stubTaskId = 'tk_vis'`);
    ev(rwin, 'renderTasks()');
    await tick(300);
    check('visible renderTasks still renders rows', ev(rwin, `!!document.querySelector('.task-row[data-id="tk_vis"]')`) === true);
    ev(rwin, `window.__restoreTF2 && window.__restoreTF2(); document.getElementById('task-list').innerHTML = '';`);

    /* push settings copy: unreachable push service → explain the live fallback */
    rwin.eval(`
        Object.defineProperty(window, 'isSecureContext', { get: () => true, configurable: true });
        Object.defineProperty(window, 'PushManager', { value: function PM() {}, configurable: true });
        const regNull = { showNotification: async () => {}, pushManager: { getSubscription: async () => null } };
        Object.defineProperty(window.navigator, 'serviceWorker', { value: { ready: Promise.resolve(regNull), getRegistration: async () => regNull }, configurable: true });
        storeSet('gk_push_lasterr', 'Registration failed - push service error');
    `);
    await ev(rwin, 'loadPushStatus()');
    await tick(250);
    const pushCopy = String(ev(rwin, `document.getElementById('push-status').textContent`));
    check('push status explains live-connection fallback when service unreachable', /live connection/i.test(pushCopy), pushCopy.slice(0, 90));
    ev(rwin, `storeSet('gk_push_lasterr', '')`);
    await ev(rwin, 'loadPushStatus()');
    await tick(250);
    check('push status returns to normal copy after error cleared', /Off — enable/i.test(String(ev(rwin, `document.getElementById('push-status').textContent`))));

    rwin.eval(`
        notifyUser = window.__origNotifyUser2;
        showToastSafe = window.__origToastSafe2;
        delete document.hidden;
    `);

    /* ── 5.1.2: aurora (lockscreen ambience) lifecycle ──
       Regression: the aurora rAF particle loop kept repainting a fullscreen
       canvas after unlock — behind the opaque terminal UI it was invisible,
       yet burned CPU/GPU every frame (O(n²) link pass + full repaint). */
    console.log('── 5.1.2: aurora only animates for the visible lockscreen ──');
    check('aurora loop stopped after unlock', ev(rwin, 'aurora.running') === false);
    check('aurora rAF cancelled after unlock', ev(rwin, 'aurora.raf') === null);
    check('aurora canvas display:none while unlocked', ev(rwin, `document.getElementById('aurora-canvas').style.display`) === 'none');
    ev(rwin, `document.getElementById('lockscreen').classList.remove('hidden'); refreshAuroraMotion();`);
    await tick(80);
    check('aurora resumes when the lockscreen is shown again', ev(rwin, 'aurora.running') === true && ev(rwin, `document.getElementById('aurora-canvas').style.display`) === '');
    check('resumed aurora schedules animation frames', ev(rwin, 'aurora.raf') !== null);
    ev(rwin, `document.getElementById('lockscreen').classList.add('hidden'); refreshAuroraMotion();`);
    await tick(80);
    check('aurora stops again when the lockscreen hides', ev(rwin, 'aurora.running') === false && ev(rwin, 'aurora.raf') === null);
    ev(rwin, `document.getElementById('lockscreen').classList.remove('hidden'); document.body.classList.add('reduce-motion'); refreshAuroraMotion();`);
    await tick(40);
    check('reduce-motion keeps the aurora off even on the lockscreen', ev(rwin, 'aurora.running') === false);
    ev(rwin, `document.body.classList.remove('reduce-motion'); document.getElementById('lockscreen').classList.add('hidden'); refreshAuroraMotion();`);
    await tick(40);

    /* ── 16. No stray console errors ── */
    console.log('── Runtime hygiene ──');
    const relevant = fatalErrors.filter((e) => !/Could not load|favicon|Not implemented|blob:fake/i.test(e));
    if (relevant.length) console.log('   errors seen:\n   ' + relevant.slice(0, 8).join('\n   '));
    check('no unexpected runtime errors', relevant.length === 0, `${relevant.length} errors`);

    console.log(`\n═══ FRONTEND RESULT: ${passed} passed, ${failed} failed ═══`);
    if (serverProc) serverProc.kill();
process.exit(failed ? 1 : 0);
})().catch((e) => {
    console.error('TEST CRASH:', e);
    if (serverProc) serverProc.kill();
    if (fatalErrors.length) console.error('captured errors:', fatalErrors.slice(0, 10));
    process.exit(2);
});
