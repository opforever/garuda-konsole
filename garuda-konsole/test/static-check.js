/* Static consistency checks: IDs, data-actions, icons, CSS, cross-file functions */
'use strict';
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const uijs = fs.readFileSync(path.join(PUB, 'ui.js'), 'utf8');
const css = fs.readFileSync(path.join(PUB, 'style.css'), 'utf8');
const js = appjs + '\n' + uijs;

let errors = 0;
function fail(msg) { errors++; console.log('  ✘ ' + msg); }
function ok(msg) { console.log('  ✔ ' + msg); }

/* 1. IDs referenced via $('...') / getElementById must exist in HTML or be created dynamically in JS */
console.log('═══ ID cross-check ═══');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const jsCreatedIds = new Set();
// el(...); node.id = '...' patterns and template id="..." in JS
for (const m of js.matchAll(/\.id\s*=\s*['"`]([^'"`]+)['"`]/g)) jsCreatedIds.add(m[1].replace(/\$\{.*$/, '*'));
for (const m of js.matchAll(/id="([^"$]+)"/g)) jsCreatedIds.add(m[1]);
const referencedIds = new Set();
for (const m of js.matchAll(/\$\(\s*['"]([\w-]+)['"]\s*\)/g)) referencedIds.add(m[1]);
for (const m of js.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)) referencedIds.add(m[1]);
const missingIds = [...referencedIds].filter((id) => !htmlIds.has(id) && !jsCreatedIds.has(id));
if (missingIds.length) fail('JS references missing IDs: ' + missingIds.join(', '));
else ok(`all ${referencedIds.size} referenced IDs exist`);

/* unused HTML ids (informational) */
const unused = [...htmlIds].filter((id) => !referencedIds.has(id) && !js.includes(`'${id}'`) && !js.includes(`"${id}"`) && !js.includes(id));
if (unused.length) console.log('  ℹ HTML ids not referenced in JS: ' + unused.join(', '));

/* 2. data-action coverage */
console.log('═══ data-action cross-check ═══');
const htmlActions = new Set([...html.matchAll(/data-action="([\w-]+)"/g)].map((m) => m[1]));
const jsActions = new Set([...js.matchAll(/data-action="([\w-]+)"/g)].map((m) => m[1]));
for (const m of js.matchAll(/data-action=\\?"([\w-]+)\\?"/g)) jsActions.add(m[1]);
const registry = new Set([...uijs.matchAll(/^\s{4}'([\w-]+)':/gm)].map((m) => m[1]));
const allUsed = new Set([...htmlActions, ...jsActions]);
const unregistered = [...allUsed].filter((a) => !registry.has(a));
if (unregistered.length) fail('data-action without registry entry: ' + unregistered.join(', '));
else ok(`all ${allUsed.size} data-actions registered`);
const deadRegistry = [...registry].filter((a) => !allUsed.has(a));
if (deadRegistry.length) console.log('  ℹ registry entries never used in markup: ' + deadRegistry.join(', '));

/* 3. data-mkey coverage */
console.log('═══ data-mkey cross-check ═══');
const mkeys = new Set([...html.matchAll(/data-mkey="([\w:-]+)"/g)].map((m) => m[1]));
mkeys.add('char:X'); // dynamic symbol row
const handled = [];
for (const m of uijs.matchAll(/case '([\w:-]+)':/g)) handled.push(m[1]);
const handledSet = new Set(handled);
// special keys handled in sendSpecialKey (app.js)
const specialHandled = new Set(['esc', 'tab', 'up', 'down', 'left', 'right', 'home', 'end', 'pgup', 'pgdn', 'del', 'enter', ...Object.keys({ 'ctrl-a': 1, 'ctrl-c': 1, 'ctrl-d': 1, 'ctrl-e': 1, 'ctrl-k': 1, 'ctrl-l': 1, 'ctrl-r': 1, 'ctrl-u': 1, 'ctrl-z': 1 })]);
const unhandledMkeys = [...mkeys].filter((k) => !handledSet.has(k) && !specialHandled.has(k) && !k.startsWith('char:') && !k.startsWith('scroll-') && k !== 'ctrl-mod' && k !== 'backspace');
if (unhandledMkeys.length) fail('data-mkey not handled: ' + unhandledMkeys.join(', '));
else ok(`all ${mkeys.size} mobile keys handled`);

/* 4. Icon sprite references */
console.log('═══ icon cross-check ═══');
const symbols = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map((m) => m[1]));
const usedIcons = new Set();
for (const m of html.matchAll(/href="#(i-[\w-]+)"/g)) usedIcons.add(m[1]);
for (const m of js.matchAll(/#(i-[\w-]+)/g)) usedIcons.add(m[1]);
const missingIcons = [...usedIcons].filter((i) => !symbols.has(i));
if (missingIcons.length) fail('missing icon symbols: ' + missingIcons.join(', '));
else ok(`all ${usedIcons.size} icon refs defined (${symbols.size} symbols)`);
const unusedIcons = [...symbols].filter((i) => !usedIcons.has(i));
if (unusedIcons.length) console.log('  ℹ unused symbols: ' + unusedIcons.join(', '));

/* 5. CSS sanity */
console.log('═══ CSS sanity ═══');
const opens = (css.match(/{/g) || []).length;
const closes = (css.match(/}/g) || []).length;
if (opens !== closes) fail(`unbalanced braces: ${opens} { vs ${closes} }`);
else ok(`braces balanced (${opens})`);
// key classes used in JS/HTML should exist in CSS
const mustHaveClasses = ['toast', 'palette-item', 'file-row', 'macro-row', 'srv-row', 'ctx-item', 'session-ended-overlay', 'tab-rename-input', 'ripple', 'boot-line', 'crumb', 'skel-row', 'ctm-row', 'mk', 'conn-ok', 'conn-bad', 'toast-progress', 'files-empty', 'palette-section', 'meter-fill'];
const missingClasses = mustHaveClasses.filter((c) => !css.includes('.' + c));
if (missingClasses.length) fail('classes missing in CSS: ' + missingClasses.join(', '));
else ok('all dynamic classes styled');
// CSS var refs used in CSS should be defined in :root or set by JS
const cssVarUses = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
const cssVarDefs = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
const jsVarDefs = new Set([...js.matchAll(/setProperty\(\s*'(--[\w-]+)'/g)].map((m) => m[1]));
const undefVars = [...cssVarUses].filter((v) => !cssVarDefs.has(v) && !jsVarDefs.has(v));
if (undefVars.length) fail('CSS vars used but never defined: ' + undefVars.join(', '));
else ok(`all ${cssVarUses.size} CSS vars defined`);

/* 5b. Interactive affordance (5.1.4): enabled controls must not look disabled.
   Guards the central override section so the muted-idle regression can't
   sneak back in through a theme pass or CSS reorg. */
const affStart = css.indexOf('AFFORDANCE:START');
const affEnd = css.indexOf('AFFORDANCE:END');
if (affStart === -1 || affEnd === -1 || affEnd < affStart) {
    fail('affordance section missing in style.css (AFFORDANCE:START/END markers)');
} else {
    const aff = css.slice(affStart, affEnd);
    const mustBrighten = ['.icon-btn', '.btn-ghost', '.btn-mini', '.sb-btn', '.ctx-item', '.pin-chip', '.ai-mode-btn', '.tab'];
    const notCovered = mustBrighten.filter((c) => !aff.includes(c));
    if (notCovered.length) fail('affordance section missing idle-brighten for: ' + notCovered.join(', '));
    else if (!/color-mix\(in srgb, var\(--text\)/.test(aff)) fail('affordance section lost the theme-aware color-mix blend');
    else if (!/button:disabled/.test(aff) || !/not-allowed/.test(aff)) fail('affordance section lost the disabled-state styling');
    else ok('enabled controls out-bright the disabled look (affordance section intact)');
}

/* 5b. 5.1.6 context-menu affordance + cache-busting guard */
const swjs = fs.readFileSync(path.join(PUB, 'sw.js'), 'utf8');
const ctxStart = css.indexOf('CTX-AFFORDANCE:START');
const ctxEnd = css.indexOf('CTX-AFFORDANCE:END');
if (ctxStart === -1 || ctxEnd === -1 || ctxEnd < ctxStart) {
    fail('context-menu affordance section missing in style.css (CTX-AFFORDANCE:START/END markers)');
} else {
    const seg = css.slice(ctxStart, ctxEnd);
    if (!/\.ctx-item\s*{\s*color:\s*var\(--text\);\s*\}/.test(seg)) fail('ctx-item must idle at the full theme text color (no color-mix dependency)');
    else if (!/\.ctx-item\.danger\s*{\s*color:\s*var\(--danger\);\s*\}/.test(seg)) fail('danger ctx-item idle tint missing');
    else ok('context menu idles crisp: enabled full-text, danger tinted (5.1.6 section intact)');
}
if (!/btn\.disabled\s*=\s*true/.test(uijs)) fail('openCtxMenu must make inert entries natively disabled (btn.disabled = true)');
else if (/btn\.style\.opacity\s*=\s*'0\.4'/.test(uijs)) fail('openCtxMenu must not fake disabled with inline opacity hacks');
else ok('context menu disabled entries are natively inert (gray always means off)');
const pkgVersion = require(path.join(__dirname, '..', 'package.json')).version;
if (!html.includes('style.css?v=' + pkgVersion) || !html.includes('app.js?v=' + pkgVersion) || !html.includes('ui.js?v=' + pkgVersion)) {
    fail('index.html must reference version-busted style.css/app.js/ui.js (stale service-worker cache trap)');
} else if (!swjs.includes("const CACHE = 'garuda-konsole-v" + pkgVersion + "'")) {
    fail('sw.js CACHE name must track the package version');
} else if (!swjs.includes('/style.css?v=' + pkgVersion) || !swjs.includes('/app.js?v=' + pkgVersion) || !swjs.includes('/ui.js?v=' + pkgVersion)) {
    fail('sw.js SHELL must pre-cache the version-busted asset URLs');
} else {
    ok('asset URLs version-busted in lockstep with package version (stale-SW trap closed)');
}

/* 5c. 5.1.7 scroll-crush guard: scrollable flex columns must never compress children */
const crushStart = css.indexOf('SCROLL-CRUSH:START');
const crushEnd = css.indexOf('SCROLL-CRUSH:END');
if (crushStart === -1 || crushEnd === -1 || crushEnd < crushStart) {
    fail('scroll-crush section missing in style.css (SCROLL-CRUSH:START/END markers)');
} else {
    const seg = css.slice(crushStart, crushEnd);
    const needCrush = ['.ai-messages > *', '.chat-messages > *', '.drawer-body > *', '.server-sessions-list > *'];
    const missCrush = needCrush.filter((s) => !seg.includes(s));
    if (missCrush.length) fail('scroll-crush section must protect: ' + missCrush.join(', '));
    else if (!/flex-shrink:\s*0/.test(seg) || !/\.ai-cmd-card\s*{\s*flex-shrink:\s*0;\s*}/.test(seg)) fail('scroll-crush section lost its flex-shrink: 0 guarantees');
    else ok('scrollable flex columns scroll instead of crushing children (5.1.7 section intact)');
}

/* 5d. 5.2 feature-surface guard */
const replayHtmlPath = path.join(PUB, 'replay.html');
const replayHtml = fs.existsSync(replayHtmlPath) ? fs.readFileSync(replayHtmlPath, 'utf8') : '';
if (!replayHtml) fail('public/replay.html (standalone replay player) is missing');
else if (!/api\/replay\//.test(replayHtml)) fail('replay player must fetch /api/replay/<token>');
    else if (!/Emu\.prototype\.sgr/.test(replayHtml)) fail('replay player lost its SGR color emulator (players must render colors, not strip ANSI)');
else ok('standalone replay player present');
const srvjs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const missingRoutes = ['/api/layouts', '/api/files/write', '/api/processes', '/api/stats/history', '/api/replay/share', '/api/recordings'].filter((r) => !srvjs.includes(r));
if (!srvjs.includes("url.pathname === '/ws/rd'")) fail('server missing the /ws/rd websocket branch');
if (!fs.existsSync(path.join(__dirname, 'fixtures', 'rd-test.webm'))) fail('rd test fixture missing — run: node tools/make-rd-fixture.js');
if (missingRoutes.length) fail('server routes missing: ' + missingRoutes.join(', '));
else ok('5.2 server routes present (layouts / write / processes / history / replay)');
const missingFns = ['handleTabHealth', 'openEditor', 'restoreLayout', 'shareReplayLink', 'renderProcList'].filter((f) => !uijs.includes('function ' + f));
if (missingFns.length) fail('ui.js missing 5.2 functions: ' + missingFns.join(', '));
else ok('5.2 client functions present (badge / editor / layouts / replay / procs)');

/* 6. Cross-file function references */
console.log('═══ cross-file function check ═══');
const definedFns = new Set();
for (const m of js.matchAll(/function\s+([\w$]+)\s*\(/g)) definedFns.add(m[1]);
for (const m of js.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?\(/g)) definedFns.add(m[1]);
for (const m of js.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?function/g)) definedFns.add(m[1]);
const calledFns = new Set();
for (const m of js.matchAll(/(?<![.\w'"$])([a-z][\w$]*)\s*\(/gi)) calledFns.add(m[1]);
const builtins = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'fetch', 'require', 'console', 'String', 'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'Promise', 'Set', 'Map', 'Blob', 'URL', 'encodeURIComponent', 'decodeURIComponent', 'alert', 'confirm', 'prompt', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'Terminal', 'FitAddon', 'SearchAddon', 'WebLinksAddon', 'WebSocket', 'XMLHttpRequest', 'FormData', 'Notification', 'AudioContext', 'webkitAudioContext', 'Uint8Array', 'Buffer', 'Set', 'do', 'else', 'try', 'new', 'delete', 'void', 'instanceof', 'case', 'default', 'throw', 'super', 'this', 'null', 'true', 'false', 'from', 'of', 'in', 'toFixed', 'toString', 'includes', 'filter', 'map', 'reduce', 'push', 'slice', 'join', 'split', 'replace', 'trim', 'test', 'exec', 'match', 'sort', 'find', 'forEach', 'some', 'every', 'keys', 'values', 'entries', 'assign', 'stringify', 'parse', 'catch', 'then', 'resolve', 'reject', 'all', 'allSettled', 'max', 'min', 'round', 'floor', 'ceil', 'random', 'abs', 'now', 'from', 'isArray', 'log', 'error', 'warn', 'getElementById', 'querySelector', 'querySelectorAll', 'addEventListener', 'removeEventListener', 'createElement', 'appendChild', 'removeChild', 'remove', 'setAttribute', 'getAttribute', 'removeAttribute', 'focus', 'blur', 'select', 'click', 'scrollIntoView', 'open', 'send', 'close', 'write', 'writeln', 'fit', 'dispose', 'reset', 'clear', 'scrollLines', 'scrollToBottom', 'getSelection', 'clearSelection', 'selectAll', 'paste', 'loadAddon', 'attachCustomKeyEventHandler', 'onData', 'onBell', 'findNext', 'findPrevious', 'clearDecorations', 'onDidChangeResults', 'getLine', 'translateToString', 'match', 'startsWith', 'endsWith', 'indexOf', 'charCodeAt', 'toLowerCase', 'toUpperCase', 'padStart', 'charAt', 'substring', 'search', 'localeCompare', 'codePointAt', 'fromCharCode', 'getRandomValues', 'vibrate', 'resume', 'suspend', 'createOscillator', 'createGain', 'createBuffer', 'createBufferSource', 'createBiquadFilter', 'getChannelData', 'connect', 'start', 'stop', 'play', 'add', 'has', 'get', 'set', 'delete', 'clear', 'register', 'unregister', 'writeText', 'readText', 'requestPermission', 'reload', 'href', 'click', 'preventDefault', 'stopPropagation', 'closest', 'contains', 'toggle', 'add', 'matches', 'remove', 'append', 'prepend', 'before', 'after', 'insertBefore', 'replaceChild', 'cloneNode', 'getContext', 'clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'closePath', 'createLinearGradient', 'addColorStop', 'setTransform', 'measureText', 'fillText', 'scale', 'save', 'restore', 'translate', 'rotate', 'upload', 'setRequestHeader', 'getResponseHeader', 'files', 'readAsText', 'item', 'normalize', 'now', 'toFixed', 'getTime', 'toISOString', 'toLocaleString', 'toLocaleTimeString', 'getHours', 'getMinutes', 'getSeconds', 'getDay', 'getFullYear', 'getMonth', 'getDate', 'setTime', 'UTC', 'random']);
const unresolved = [...calledFns].filter((f) => !definedFns.has(f) && !builtins.has(f) && !/^[A-Z]/.test(f));
if (unresolved.length) console.log('  ⚠ possibly-undefined functions (verify manually): ' + unresolved.join(', '));
else ok('no obviously-undefined function calls');

/* 7. HTML tag balance quick check */
console.log('═══ HTML sanity ═══');
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'stop', 'use', 'feGaussianBlur', 'feComposite']);
const stack = [];
let htmlErr = null;
for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, close, tag, attrs, selfClose] = m;
    if (selfClose === '/' || voidTags.has(tag)) continue;
    if (!close) stack.push(tag);
    else {
        const top = stack.pop();
        if (top !== tag) { htmlErr = `mismatch: </${tag}> closes <${top}>`; break; }
    }
}
if (htmlErr) fail(htmlErr);
else if (stack.length) fail('unclosed tags: ' + stack.join(', '));
else ok('HTML tags balanced');

console.log(errors ? `\n═══ ${errors} PROBLEM(S) ═══` : '\n═══ ALL STATIC CHECKS PASSED ═══');
process.exit(errors ? 1 : 0);
