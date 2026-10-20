/* ═══════════════════════════════════════════════════════════════
   Garuda Konsole 2.0 — Core Engine (app.js)
   State · Auth · Tabs · WebSocket · Terminal · Themes · Settings
   UI subsystems live in ui.js (loaded right after this file).
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ─────────────── Constants ─────────────── */

const APP_VERSION = '5.5.0';
const K = {
    token: 'gk_token',
    tabs: 'gk_tabs_v3',
    activeTab: 'gk_active_tab_v3',
    settings: 'gk_settings_v3',
    macros: 'gk_macros_v3',
    recents: 'gk_recents_v2',
    triggers: 'gk_triggers_v3',
    activity: 'gk_activity_v3',
    insights: 'gk_insights_v3',
    kbCollapsed: 'gk_kb_collapsed',
    tourDone: 'gk_tour_done',
    newsSeen: 'gk_news_seen'
};

const DEFAULT_SETTINGS = {
    themeId: 'garuda_dragonized',
    fontFamily: "'Fira Code', monospace",
    fontSize: null, // null → responsive default
    cursorStyle: 'block',
    cursorBlink: true,
    opacity: 100,
    mechKeyboard: false,
    uiSounds: false,
    haptics: true,
    completionNotifications: true,
    healthPush: false,
    autoSaveRecordings: true,
    fileShareExpiry: 24,
    bootAnim: true,
    reducedMotion: false,
    scrollSpeed: 4,
    autoTheme: false,
    lightThemeId: 'github_light',
    darkThemeId: 'garuda_dragonized',
    showPinBar: true,
    aiMode: 'ask',
    aiTimeout: 20,
    ringSecs: 60,
    floatBall: null,
    aiVoice: false,
    aiVoiceName: 'autumn'
};

const BUILTIN_THEMES = {
    garuda_dragonized: {
        name: 'Garuda Dragonized',
        theme: {
            background: '#181d24', foreground: '#f8f8f2', cursor: '#00f2fe',
            selectionBackground: '#3daee960', black: '#232629', red: '#ed1515', green: '#11d116',
            yellow: '#f67400', blue: '#1d99f3', magenta: '#9b59b6', cyan: '#00f2fe', white: '#eff0f1'
        }
    },
    dracula: {
        name: 'Dracula',
        theme: {
            background: '#282a36', foreground: '#f8f8f2', cursor: '#ff79c6',
            selectionBackground: '#44475a', black: '#21222c', red: '#ff5555', green: '#50fa7b',
            yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2'
        }
    },
    nord: {
        name: 'Nord Frost',
        theme: {
            background: '#2e3440', foreground: '#d8dee9', cursor: '#88c0d0',
            selectionBackground: '#434c5e', black: '#3b4252', red: '#bf616a', green: '#a3be8c',
            yellow: '#ebcb8b', blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0'
        }
    },
    cyberpunk: {
        name: 'Cyberpunk 2077',
        theme: {
            background: '#0d0d1a', foreground: '#00ffcc', cursor: '#fcee0a',
            selectionBackground: '#ff005540', black: '#1b1b3a', red: '#ff0055', green: '#00ff66',
            yellow: '#fcee0a', blue: '#00ccff', magenta: '#ff00aa', cyan: '#00ffcc', white: '#ffffff'
        }
    },
    tokyo_night: {
        name: 'Tokyo Night',
        theme: {
            background: '#1a1b26', foreground: '#a9b1d6', cursor: '#c0caf5',
            selectionBackground: '#283457', black: '#32344a', red: '#f7768e', green: '#9ece6a',
            yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#c0caf5'
        }
    },
    gruvbox_dark: {
        name: 'Gruvbox Dark',
        theme: {
            background: '#282828', foreground: '#ebdbb2', cursor: '#fe8019',
            selectionBackground: '#504945', black: '#282828', red: '#cc241d', green: '#98971a',
            yellow: '#d79921', blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984'
        }
    },
    monokai_pro: {
        name: 'Monokai Pro',
        theme: {
            background: '#2d2a2e', foreground: '#fcfcfa', cursor: '#ffd866',
            selectionBackground: '#5b595c', black: '#403e41', red: '#ff6188', green: '#a9dc76',
            yellow: '#ffd866', blue: '#fc9867', magenta: '#ab9df2', cyan: '#78dce8', white: '#fcfcfa'
        }
    },
    catppuccin_mocha: {
        name: 'Catppuccin Mocha',
        theme: {
            background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc',
            selectionBackground: '#45475a', black: '#45475a', red: '#f38ba8', green: '#a6e3a1',
            yellow: '#f9e2af', blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de'
        }
    },
    one_dark_pro: {
        name: 'One Dark Pro',
        theme: {
            background: '#21252b', foreground: '#abb2bf', cursor: '#528bff',
            selectionBackground: '#3e4451', black: '#282c34', red: '#e06c75', green: '#98c379',
            yellow: '#e5c07b', blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf'
        }
    },
    synthwave_84: {
        name: "Synthwave '84",
        theme: {
            background: '#241b2f', foreground: '#f92aad', cursor: '#ff7edb',
            selectionBackground: '#34294f', black: '#2b213a', red: '#fe4450', green: '#72f1b8',
            yellow: '#fede5d', blue: '#03edf9', magenta: '#ff7edb', cyan: '#03edf9', white: '#ffffff'
        }
    },
    solarized_dark: {
        name: 'Solarized Dark',
        theme: {
            background: '#002b36', foreground: '#839496', cursor: '#93a1a1',
            selectionBackground: '#073642', black: '#073642', red: '#dc322f', green: '#859900',
            yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5'
        }
    },
    material_ocean: {
        name: 'Material Deep Ocean',
        theme: {
            background: '#0f111a', foreground: '#8f93a2', cursor: '#ffcc00',
            selectionBackground: '#1e2233', black: '#000000', red: '#ff5370', green: '#c3e88d',
            yellow: '#ffcb6b', blue: '#82aaff', magenta: '#c792ea', cyan: '#89ddff', white: '#eeffff'
        }
    },
    matrix_green: {
        name: 'Retro Matrix CRT',
        theme: {
            background: '#080d08', foreground: '#20c20e', cursor: '#00ff41',
            selectionBackground: '#143314', black: '#041004', red: '#ff3333', green: '#20c20e',
            yellow: '#99ff33', blue: '#00cc66', magenta: '#00ff99', cyan: '#55ff55', white: '#ccffcc'
        }
    },
    cobalt2: {
        name: 'Cobalt2',
        theme: {
            background: '#193549', foreground: '#ffffff', cursor: '#ffc600',
            selectionBackground: '#0d2334', black: '#000000', red: '#ff0000', green: '#38de21',
            yellow: '#ffe50a', blue: '#1451e2', magenta: '#ff005d', cyan: '#00ffff', white: '#ffffff'
        }
    },
    aura_dark: {
        name: 'Aura Dark',
        theme: {
            background: '#15141b', foreground: '#edecee', cursor: '#a277ff',
            selectionBackground: '#29263c', black: '#110f18', red: '#ff6767', green: '#61ffca',
            yellow: '#ffca85', blue: '#82e2ff', magenta: '#a277ff', cyan: '#61ffca', white: '#edecee'
        }
    },
    palenight: {
        name: 'Palenight',
        theme: {
            background: '#292d3e', foreground: '#bfc7d5', cursor: '#ffcc00',
            selectionBackground: '#3a3f58', black: '#292d3e', red: '#ff5370', green: '#c3e88d',
            yellow: '#ffcb6b', blue: '#82aaff', magenta: '#c792ea', cyan: '#89ddff', white: '#d0d0d0'
        }
    },
    rose_pine: {
        name: 'Rosé Pine',
        theme: {
            background: '#191724', foreground: '#e0def4', cursor: '#ebbcba',
            selectionBackground: '#2a283e', black: '#26233a', red: '#eb6f92', green: '#31748f',
            yellow: '#f6c177', blue: '#9ccfd8', magenta: '#c4a7e7', cyan: '#ebbcba', white: '#e0def4'
        }
    },
    inferno: {
        name: 'Neon Inferno',
        theme: {
            background: '#120b0b', foreground: '#ffeedd', cursor: '#ff4500',
            selectionBackground: '#3a1a1a', black: '#241414', red: '#ff2200', green: '#ffaa00',
            yellow: '#ffd700', blue: '#ff6600', magenta: '#ff0055', cyan: '#ff8800', white: '#fff5ee'
        }
    },
    midnight_amethyst: {
        name: 'Midnight Amethyst',
        theme: {
            background: '#140c1e', foreground: '#e6dbf4', cursor: '#e056fd',
            selectionBackground: '#2d1845', black: '#1f132f', red: '#ff5252', green: '#69f0ae',
            yellow: '#ffd740', blue: '#7c4dff', magenta: '#e056fd', cyan: '#18ffff', white: '#ffffff'
        }
    },
    ghost_black: {
        name: 'Ghost Stealth OLED',
        theme: {
            background: '#000000', foreground: '#e0e0e0', cursor: '#00e5ff',
            selectionBackground: '#222222', black: '#1c1c1c', red: '#ff1744', green: '#00e676',
            yellow: '#ffea00', blue: '#2979ff', magenta: '#d500f9', cyan: '#00e5ff', white: '#ffffff'
        }
    },
    github_light: {
        name: 'GitHub Light',
        theme: {
            background: '#ffffff', foreground: '#24292f', cursor: '#0969da',
            selectionBackground: '#b6d8ff', black: '#24292f', red: '#cf222e', green: '#116329',
            yellow: '#4d2d00', blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#ffffff'
        }
    },
    solarized_light: {
        name: 'Solarized Light',
        theme: {
            background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75',
            selectionBackground: '#eee8d5', black: '#073642', red: '#dc322f', green: '#859900',
            yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5'
        }
    },
    one_light: {
        name: 'One Light',
        theme: {
            background: '#fafafa', foreground: '#383a42', cursor: '#526eff',
            selectionBackground: '#e5e5e6', black: '#383a42', red: '#e45649', green: '#50a14f',
            yellow: '#c18401', blue: '#0184bc', magenta: '#a626a4', cyan: '#0997b3', white: '#fafafa'
        }
    },
    catppuccin_latte: {
        name: 'Catppuccin Latte',
        theme: {
            background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78',
            selectionBackground: '#ccd0da', black: '#5c5f77', red: '#d20f39', green: '#40a02b',
            yellow: '#df8e1d', blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#acb0be'
        }
    },
    rose_pine_dawn: {
        name: 'Rosé Pine Dawn',
        theme: {
            background: '#faf4ed', foreground: '#575279', cursor: '#d7827e',
            selectionBackground: '#f2e9e1', black: '#6e6a86', red: '#b4637a', green: '#286983',
            yellow: '#ea9d34', blue: '#56949f', magenta: '#907aa9', cyan: '#d7827e', white: '#575279'
        }
    },
    snow_storm: {
        name: 'Snow Storm',
        theme: {
            background: '#f4f6fa', foreground: '#333a45', cursor: '#5e81ac',
            selectionBackground: '#d8dee9', black: '#3b4252', red: '#bf616a', green: '#4f9c5d',
            yellow: '#c29128', blue: '#5e81ac', magenta: '#9456a8', cyan: '#398e9a', white: '#eceff4'
        }
    }
};

const LIGHT_THEME_IDS = ['github_light', 'solarized_light', 'one_light', 'catppuccin_latte', 'rose_pine_dawn', 'snow_storm'];

/* ─────────────── Global state ─────────────── */

let token = null;
let serverMeta = { shell: 'shell', hostname: 'host', version: APP_VERSION, platform: '' };
const tabs = Object.create(null);   // tabId -> tab
let activeTabId = null;
let isAltLocked = false;
let ctrlSticky = false;
let customThemes = {};
let tabShareStatus = {};            // tabId -> { isShared, token, mode, viewerCount }

let isViewerSession = false;
let viewerWs = null;
let viewerTerm = null;
let viewerFitAddon = null;
let viewerSearchAddon = null;
let viewerMode = 'readonly';
let viewerRevoked = false;

let audioCtx = null;
let scrollInterval = null;
let pendingUploadDest = null;       // null → shell cwd | 'files' → files drawer cwd
let bootSkipFn = null;

/* 3.0 state */
let splitState = { mode: null, tabs: [null, null], focus: 0 }; // mode: null | 'h' | 'v'
let viewerClientId = null;
let shellsCache = null;             // [{name,path,isDefault}]
let gitPollTimer = null;
let recTimer = null;
let replayState = null;             // { chunks, idx, playing, speed, timer, totalMs, term, fitAddon }
const triggerCache = new Map();     // triggerId -> RegExp
const triggerCooldown = new Map();  // `${triggerId}:${tabId}` -> lastFiredMs
let autoThemeTimer = null;
let pageStartedAt = Date.now();
let tourPlanned = false;   // set when a tour will start; the news modal waits for it

/* ─────────────── Tiny helpers ─────────────── */

const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html !== undefined) node.innerHTML = html;
    return node;
}

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function uid(prefix) {
    let rnd = '';
    try {
        const buf = new Uint8Array(6);
        (window.crypto || {}).getRandomValues ? crypto.getRandomValues(buf) : buf.forEach((_, i) => (buf[i] = Math.floor(Math.random() * 256)));
        rnd = Array.from(buf, (b) => b.toString(36).padStart(2, '0').slice(-2)).join('').slice(0, 8);
    } catch (e) {
        rnd = Math.random().toString(36).slice(2, 10);
    }
    return (prefix || 'gk') + '_' + rnd.replace(/[^a-z0-9]/g, 'x');
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function debounce(fn, ms) {
    let t = null;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

function storeGet(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
}
function storeSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}
function sessGet(key, fallback) {
    try {
        const raw = sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
}
function sessSet(key, val) {
    try {
        if (val === null) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
}

function fmtBytes(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n < 1024) return n + ' B';
    const units = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
    return (n >= 100 ? Math.round(n) : n.toFixed(1)) + ' ' + units[i];
}

function fmtUptime(sec) {
    if (sec == null) return '—';
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
}

function fmtAgo(ms) {
    if (!ms) return '—';
    const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
}

/* Color utilities (theme → CSS variables) */
function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    let h = hex.trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function rgbToHex(r, g, b) {
    const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
}
function mixColors(hex1, hex2, w) {
    const a = hexToRgb(hex1), b = hexToRgb(hex2);
    if (!a || !b) return hex1;
    return rgbToHex(a.r + (b.r - a.r) * w, a.g + (b.g - a.g) * w, a.b + (b.b - a.b) * w);
}
function lighten(hex, w) { return mixColors(hex, '#ffffff', w); }
function darken(hex, w) { return mixColors(hex, '#000000', w); }
function rgba(hex, alpha) {
    const c = hexToRgb(hex);
    if (!c) return hex;
    return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

/* Fuzzy subsequence match; returns score or -1 */
function fuzzyScore(query, text) {
    if (!query) return 1;
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    const idx = t.indexOf(q);
    if (idx === 0) return 1000 - t.length * 0.01;
    if (idx > 0) return 700 - idx * 0.5;
    let ti = 0, score = 0, streak = 0;
    for (let qi = 0; qi < q.length; qi++) {
        const found = t.indexOf(q[qi], ti);
        if (found === -1) return -1;
        streak = (found === ti) ? streak + 1 : 0;
        score += 10 + streak * 6 - Math.min(found - ti, 8);
        ti = found + 1;
    }
    return score;
}

/* ─────────────── Settings ─────────────── */

function getSettings() {
    const s = storeGet(K.settings, {});
    return Object.assign({}, DEFAULT_SETTINGS, s || {});
}
function saveSettings(patch) {
    const s = Object.assign(getSettings(), patch || {});
    storeSet(K.settings, s);
    return s;
}
function defaultFontSize() {
    const s = getSettings();
    if (s.fontSize) return s.fontSize;
    return window.innerWidth < 768 ? 12 : 14;
}

/* ─────────────── Themes ─────────────── */

function getActiveThemeId() {
    const id = getSettings().themeId;
    return (customThemes[id] || BUILTIN_THEMES[id]) ? id : 'garuda_dragonized';
}
function getThemeData(id) {
    if (customThemes[id]) return customThemes[id].theme;
    if (BUILTIN_THEMES[id]) return BUILTIN_THEMES[id].theme;
    return BUILTIN_THEMES.garuda_dragonized.theme;
}
function getActiveTheme() { return getThemeData(getActiveThemeId()); }

function themeWithOpacity(themeData, opacityPct) {
    const out = Object.assign({}, themeData);
    if (opacityPct < 100) {
        out.background = rgba(themeData.background || '#10131a', opacityPct / 100);
    }
    return out;
}

function applyThemeToCssVars(themeData) {
    const root = document.documentElement;
    const bg = themeData.background || '#10131a';
    const fg = themeData.foreground || '#e8edf4';
    const accent = themeData.cyan || themeData.cursor || '#3daee9';
    const accent2 = themeData.magenta || '#9b59b6';

    const bgRgb = hexToRgb(bg) || { r: 16, g: 19, b: 26 };
    const luminance = (0.299 * bgRgb.r + 0.587 * bgRgb.g + 0.114 * bgRgb.b) / 255;
    const isLight = luminance > 0.55;

    root.style.setProperty('--bg', bg);
    root.style.setProperty('--bg-deep', isLight ? darken(bg, 0.045) : darken(bg, 0.35));
    root.style.setProperty('--surface', isLight ? rgba(mixColors(bg, '#ffffff', 0.55), 0.85) : rgba(lighten(bg, 0.05), 0.78));
    root.style.setProperty('--surface-solid', isLight ? mixColors(bg, '#ffffff', 0.4) : lighten(bg, 0.05));
    root.style.setProperty('--surface-2', isLight ? darken(bg, 0.028) : lighten(bg, 0.08));
    root.style.setProperty('--surface-3', isLight ? darken(bg, 0.075) : lighten(bg, 0.14));
    root.style.setProperty('--border', isLight ? 'rgba(20, 30, 50, 0.13)' : rgba(mixColors(fg, bg, 0.5), 0.14));
    root.style.setProperty('--border-strong', rgba(accent, isLight ? 0.5 : 0.4));
    root.style.setProperty('--text', fg);
    root.style.setProperty('--text-dim', mixColors(fg, bg, 0.62));
    root.style.setProperty('--text-faint', mixColors(fg, bg, 0.4));
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-2', accent2);
    root.style.setProperty('--accent-soft', rgba(accent, isLight ? 0.14 : 0.13));
    root.style.setProperty('--accent-glow', rgba(accent, isLight ? 0.3 : 0.35));

    /* Chrome surfaces (toolbar / status bar / keyboard / sheets) adapt to light & dark */
    if (isLight) {
        root.style.setProperty('--chrome-1', `linear-gradient(180deg, ${rgba(mixColors(bg, '#ffffff', 0.5), 0.9)}, ${rgba(bg, 0.94)})`);
        root.style.setProperty('--chrome-2', `linear-gradient(180deg, ${rgba(darken(bg, 0.02), 0.95)}, ${rgba(darken(bg, 0.05), 0.98)})`);
        root.style.setProperty('--chrome-3', `linear-gradient(180deg, ${darken(bg, 0.05)}, ${darken(bg, 0.09)})`);
        root.style.setProperty('--sheet-grad', `linear-gradient(168deg, ${mixColors(bg, '#ffffff', 0.65)}, ${bg})`);
    } else {
        root.style.setProperty('--chrome-1', 'linear-gradient(180deg, rgba(30, 37, 49, 0.82), rgba(18, 22, 30, 0.88))');
        root.style.setProperty('--chrome-2', 'linear-gradient(180deg, rgba(17, 21, 29, 0.9), rgba(12, 15, 21, 0.95))');
        root.style.setProperty('--chrome-3', 'linear-gradient(180deg, rgba(14, 17, 24, 0.97), rgba(9, 11, 16, 0.99))');
        root.style.setProperty('--sheet-grad', 'linear-gradient(168deg, rgba(30, 37, 49, 0.96), rgba(15, 19, 26, 0.98))');
    }

    try { document.documentElement.style.colorScheme = isLight ? 'light' : 'dark'; } catch (e) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', bg);
    if (typeof refreshAuroraColors === 'function') refreshAuroraColors();
}

function applyTheme(themeId) {
    let id = themeId;
    if (!customThemes[id] && !BUILTIN_THEMES[id]) id = 'garuda_dragonized';
    const themeData = getThemeData(id);
    const settings = saveSettings({ themeId: id });
    const effective = themeWithOpacity(themeData, clamp(parseInt(settings.opacity, 10) || 100, 40, 100));

    for (const tab of Object.values(tabs)) {
        if (tab && tab.term) {
            try { tab.term.options.theme = effective; } catch (e) {}
        }
    }
    if (viewerTerm) {
        try { viewerTerm.options.theme = effective; } catch (e) {}
    }

    const wrapper = $('terminals-wrapper');
    if (wrapper) wrapper.style.backgroundColor = effective.background;

    applyThemeToCssVars(themeData);
    if (typeof updateThemeSwatch === 'function') updateThemeSwatch(themeData);
    if (typeof syncThemeSelects === 'function') syncThemeSelects(id);
}

async function loadCustomThemes() {
    try {
        const list = await api('/api/custom-themes');
        customThemes = {};
        (Array.isArray(list) ? list : []).forEach((item) => {
            if (item && item.id && item.theme) customThemes[item.id] = item;
        });
    } catch (e) { customThemes = {}; }
}

/* ─────────────── Audio & haptics ─────────────── */

function ensureAudio() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        if (!audioCtx) audioCtx = new Ctx();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    } catch (e) { return null; }
}

function playMechanicalClick(isHeavy) {
    const s = getSettings();
    if (!s.mechKeyboard) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(isHeavy ? 240 : 400 + Math.random() * 80, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.03);
        oscGain.gain.setValueAtTime(0.045, now);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
        osc.connect(oscGain); oscGain.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.035);

        const len = Math.floor(ctx.sampleRate * 0.012);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.4;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = isHeavy ? 1800 : 3200 + Math.random() * 500;
        filter.Q.value = 3.5;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.035, now);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);
        noise.connect(filter); filter.connect(ng); ng.connect(ctx.destination);
        noise.start(now); noise.stop(now + 0.02);
    } catch (e) {}
}

function playUI(kind) {
    const s = getSettings();
    if (!s.uiSounds) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
        const now = ctx.currentTime;
        const notes = kind === 'error' ? [330, 220] : kind === 'success' ? [523, 784] : [660];
        notes.forEach((f, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, now + i * 0.08);
            g.gain.exponentialRampToValueAtTime(0.05, now + i * 0.08 + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.16);
            o.connect(g); g.connect(ctx.destination);
            o.start(now + i * 0.08); o.stop(now + i * 0.08 + 0.18);
        });
    } catch (e) {}
}

/* The ONE way to notify: Service Worker first (required on Android Chrome &
   installed iOS PWAs), Notification constructor as desktop fallback.
   Returns true if a notification was actually shown. */
async function notifyUser(title, body, opts) {
    const o = opts || {};
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const icon = 'icons/icon-192.png';
    try {
        if (navigator.serviceWorker) {
            const reg = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise((r) => setTimeout(() => r(null), 1500))
            ]);
            if (reg && reg.showNotification) {
                await reg.showNotification(title, {
                    body: body || '',
                    icon, badge: icon,
                    tag: o.tag || 'garuda',
                    vibrate: [100, 50, 100],
                    data: { url: '/' }
                });
                return true;
            }
        }
    } catch (e) { /* fall through */ }
    try { new Notification(title, { body: body || '' }); return true; } catch (e) { return false; }
}

/* ─────────────── Live-connection alerts (server 'notify' mirror) ───────────────
   Every server push event (tasks waiting/finished, triggers, …) is also
   broadcast over the existing WebSocket connections. This needs no push
   service (FCM) and no subscription, so alerts still arrive on networks
   where Web Push is unreachable — as long as any tab is open. Deduped by
   tag so N open tabs alert once, and so a locally-handled event (e.g. a
   trigger this page already toasted/notified) suppresses its server mirror. */
const recentNotifyTags = new Map();
function markNotifyTag(tag) {
    const now = Date.now();
    if (recentNotifyTags.size > 100) {
        for (const [k, v] of recentNotifyTags) if (now - v > 15000) recentNotifyTags.delete(k);
    }
    recentNotifyTags.set(String(tag), now);
}
function notifyTagFresh(tag) {
    const t = recentNotifyTags.get(String(tag));
    return !!t && Date.now() - t < 15000;
}
function handleServerNotify(ctrl) {
    const tag = String(ctrl.tag || 'garuda');
    if (notifyTagFresh(tag)) return;
    markNotifyTag(tag);
    const title = String(ctrl.title || 'Garuda Konsole');
    const body = String(ctrl.body || '');
    if (document.hidden) {
        notifyUser(title, body, { tag });
    } else if (!tag.startsWith('exit:') && !tag.startsWith('trigger:')) {
        /* Foreground: in-app toast. Shell exits draw their own overlay and
           triggers already toast locally (fireTrigger) — don't double up. */
        showToastSafe('info', title, body);
    }
}

/* ─────────────── Text-to-speech (Orpheus via server proxy) ─────────────── */
let speakAudio = null;
/* Generation guard: stopSpeaking() — and every new speakText() — invalidates
   any in-flight TTS render. Without it, pressing Stop while the voice was
   still being fetched started playback AFTER the stop (speakAudio is null
   until the response arrives, so there was nothing to pause yet). */
let speakGeneration = 0;

async function speakText(text, opts) {
    const clean = String(text || '')
        .replace(/```[\s\S]*?```/g, ' (command block) ')
        .replace(/[`*#>_]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1500);
    if (!clean) return false;
    const gen = ++speakGeneration;
    try {
        if (speakAudio) { try { speakAudio.pause(); speakAudio.src = ''; } catch (e) {} speakAudio = null; }
        const res = await fetch('/api/ai/speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ text: clean, voice: (opts && opts.voice) || getSettings().aiVoiceName || 'autumn' })
        });
        if (gen !== speakGeneration) return false; // stopped (or superseded) while rendering
        if (!res.ok) {
            const j = await res.json().catch(() => null);
            const msg = (j && j.error) || 'Speech failed';
            if (typeof showToast === 'function') showToast({ type: 'warn', title: 'Voice unavailable', text: msg.slice(0, 140), duration: 5000 });
            return false;
        }
        const blob = await res.blob();
        if (gen !== speakGeneration) return false; // stopped (or superseded) during transfer
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        speakAudio = audio;
        audio.onended = () => { URL.revokeObjectURL(url); if (speakAudio === audio) speakAudio = null; };
        await audio.play();
        return true;
    } catch (e) {
        return false;
    }
}

function stopSpeaking() {
    speakGeneration++; // abort any in-flight render so nothing starts AFTER this stop
    if (speakAudio) { try { speakAudio.pause(); speakAudio.src = ''; } catch (e) {} speakAudio = null; }
}

/* Speak the tail of the active terminal (last ~8 non-empty lines, ANSI stripped) */
function speakLastOutput() {
    const t = tabs[activeTabId];
    if (!t || !t.term) { showToast({ type: 'info', title: 'No terminal output to read' }); return false; }
    const buf = t.term.buffer && t.term.buffer.active;
    const lines = [];
    if (buf && typeof buf.length === 'number') {
        for (let r = Math.max(0, buf.length - (t.term.rows || 24)); r < buf.length; r++) {
            const line = buf.getLine(r);
            const s = line && line.translateToString ? line.translateToString(true) : '';
            if (s && s.trim()) lines.push(s.trim());
        }
    }
    const text = lines.slice(-8).join('. ').replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ');
    if (!text.trim()) { showToast({ type: 'info', title: 'Screen is empty' }); return false; }
    return speakText(text.slice(0, 900));
}

/* Download any text as a spoken audio file (Orpheus TTS) — returns true on save.
   Historical name: Groq retired MP3 output for Orpheus, so the server now serves
   WAV; the saved file's extension follows the actual response content-type. */
async function downloadTextAsMp3(text, nameHint) {
    if (!text || !text.trim()) return false;
    showToast({ type: 'info', title: 'Rendering voice…', duration: 1500 });
    try {
        const res = await fetch('/api/ai/speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ text: String(text).slice(0, 5000), voice: getSettings().aiVoiceName || 'autumn' })
        });
        if (!res.ok) {
            const j = await res.json().catch(() => null);
            showToast({ type: 'warn', title: 'Voice render failed', text: ((j && j.error) || ('HTTP ' + res.status)).slice(0, 160), duration: 6000 });
            return false;
        }
        let ext = 'wav';
        try {
            const ct = String((res.headers && res.headers.get && res.headers.get('content-type')) || '');
            if (ct.includes('mpeg')) ext = 'mp3';
        } catch (e) {}
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'garuda-voice-' + (nameHint || Date.now()) + '.' + ext;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
        showToast({ type: 'success', title: `Voice saved to Downloads (.${ext})` });
        return true;
    } catch (e) {
        showToast({ type: 'error', title: 'Voice render failed', text: 'Network error while rendering voice.' });
        return false;
    }
}

/* Voice → shell: dictate a command; ALWAYS confirmed before it runs */
async function runVoiceCommand(text) {
    const cmd = String(text || '').trim();
    if (!cmd) { showToast({ type: 'info', title: 'Nothing recognized' }); return; }
    const ok = await showConfirm({
        title: 'Run this voice command?',
        message: cmd.slice(0, 500) + '\n\nDictated via Whisper — review carefully, it runs in the active tab.',
        okLabel: 'Run it'
    });
    if (ok && activeTabId) runCommandInActiveTab(cmd);
}

/* Plain-language explanation of a shell command (chat model, no side effects) */
async function explainCommandText(cmd) {
    try {
        const res = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: 'You explain shell commands for a terminal app. Reply in at most 2 short sentences: what the command does and any risk (data loss, network, permissions). Plain text only.' },
                    { role: 'user', content: String(cmd || '').slice(0, 2000) }
                ]
            })
        });
        const data = await res.json().catch(() => null);
        const msg = data && (typeof data.content === 'string' ? data.content : data.message);
        if (res.ok && typeof msg === 'string' && msg.trim()) return msg.trim();
        return 'Could not reach the model: ' + ((data && data.error) || ('HTTP ' + res.status));
    } catch (e) {
        return 'Could not reach the model (network).';
    }
}

function buzz(ms) {
    try {
        if (getSettings().haptics && navigator.vibrate) navigator.vibrate(ms || 8);
    } catch (e) {}
}

/* ─────────────── API helper ─────────────── */

async function api(path, opts) {
    const options = Object.assign({ headers: {} }, opts || {});
    options.headers = Object.assign({}, options.headers);
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }
    let res;
    try {
        res = await fetch(path, options);
    } catch (e) {
        const err = new Error('Network unreachable');
        err.network = true;
        throw err;
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* non-JSON */ }
    if (!res.ok) {
        const err = new Error((body && body.error) || `Request failed (${res.status})`);
        err.status = res.status;
        throw err;
    }
    return body;
}

/* ─────────────── Auth flow ─────────────── */

function showLockError(msg) {
    const box = $('lock-error');
    const txt = $('lock-error-text');
    if (txt) txt.textContent = msg || 'Incorrect password';
    if (box) {
        box.classList.remove('hidden');
        const lb = document.querySelector('.lock-box');
        if (lb) {
            lb.classList.remove('shake');
            void lb.offsetWidth;
            lb.classList.add('shake');
        }
    }
    playUI('error');
}

async function doLogin() {
    const input = $('password-input');
    const btn = $('login-btn');
    const spinner = $('login-spinner');
    if (!input) return;
    const password = input.value;
    if (!password) { showLockError('Please enter your password'); input.focus(); return; }

    if (btn) btn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');
    const errBox = $('lock-error');
    if (errBox) errBox.classList.add('hidden');

    try {
        const data = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) }));

        if (data.ok && data.body && data.body.token) {
            token = data.body.token;
            serverMeta = data.body;
            sessSet(K.token, token);
            input.value = '';
            playUI('success');
            await enterApp(false);
        } else {
            showLockError(data.status === 429 ? 'Too many attempts — wait a minute' : (data.body && data.body.error) || 'Incorrect password');
            input.select();
        }
    } catch (e) {
        showLockError('Cannot reach the server');
    } finally {
        if (btn) btn.disabled = false;
        if (spinner) spinner.classList.add('hidden');
    }
}

async function tryAutoLogin() {
    const saved = sessGet(K.token, null);
    if (!saved) return false;
    token = saved;
    try {
        const meta = await api('/api/bootstrap');
        serverMeta = meta;
        return true;
    } catch (e) {
        token = null;
        sessSet(K.token, null);
        return false;
    }
}

async function enterApp(silent) {
    const lock = $('lockscreen');
    const appEl = $('app');
    if (lock) lock.classList.add('hidden');
    if (appEl) appEl.classList.remove('hidden');
    /* The aurora is lockscreen ambience — stop its animation loop now that
       it's behind the opaque app UI (it would repaint invisible pixels
       forever otherwise). */
    if (typeof refreshAuroraMotion === 'function') refreshAuroraMotion();

    const brandShell = $('brand-shell');
    if (brandShell) brandShell.textContent = (serverMeta && serverMeta.shell) || 'konsole';

    if ('Notification' in window && Notification.permission === 'default') {
        try { Notification.requestPermission(); } catch (e) {}
    }

    await loadCustomThemes();
    if (typeof renderThemeOptions === 'function') renderThemeOptions();
    applyTheme(getActiveThemeId());
    applySettingsAll();

    initViewportEngine();
    if (typeof startClock === 'function') startClock();
    if (typeof startStatsPoller === 'function') startStatsPoller();
    startLatencyPinger();
    startGitPoller();

    const restored = restoreTabs();
    if (!restored) createNewTab();
    refreshShareStatuses();
    applyAutoTheme(false);
    startAutoThemeWatcher();
    if (typeof renderPinBar === 'function') renderPinBar();
    if (typeof showNewsIfNew === 'function') setTimeout(() => showNewsIfNew(), 1500);
    if (typeof offerLayoutRestore === 'function') setTimeout(() => offerLayoutRestore(), 2200);
    if (typeof initFloatBall === 'function') setTimeout(() => initFloatBall(), 900);
    aiState.mode = ['chat', 'ask', 'auto'].includes(getSettings().aiMode) ? getSettings().aiMode : 'ask';
    if (typeof syncAiModeUI === 'function') syncAiModeUI();
    if (typeof loadAiConfig === 'function') loadAiConfig();
    logActivity('info', `Session started on ${serverMeta.hostname || 'host'} (${serverMeta.shell || 'shell'})`);

    if (!silent && getSettings().bootAnim && !document.body.classList.contains('reduce-motion')) {
        if (typeof playBootSequence === 'function') playBootSequence();
    }
    if (!silent && 'Notification' in window && Notification.permission === 'default' &&
        window.isSecureContext && !storeGet('gk_notif_nudge', false)) {
        storeSet('gk_notif_nudge', true);
        setTimeout(() => {
            showToastSafe('info', 'Never miss an alert', 'Enable notifications in Settings → Notifications & Motion (one tap).', 8000);
        }, 5000);
    }
    if (!silent && !storeGet(K.tourDone, false) && typeof startTour === 'function') {
        tourPlanned = true;
        setTimeout(() => startTour(), getSettings().bootAnim ? 3200 : 700);
    }
    if (typeof registerSW === 'function') registerSW();
}

function startGitPoller() {
    if (gitPollTimer) clearInterval(gitPollTimer);
    gitPollTimer = setInterval(() => {
        if (document.hidden || !token || isViewerSession || !activeTabId) return;
        const tab = getActiveTab();
        if (tab && tab.cwd) refreshGitChip(activeTabId);
    }, 12000);
}

/* Day/night automatic theme switching */
function applyAutoTheme(force) {
    const s = getSettings();
    if (!s.autoTheme) return;
    const h = new Date().getHours();
    const wantLight = h >= 7 && h < 19;
    const want = wantLight ? (s.lightThemeId || 'github_light') : (s.darkThemeId || 'garuda_dragonized');
    if (force || getActiveThemeId() !== want) applyTheme(want);
}
function startAutoThemeWatcher() {
    if (autoThemeTimer) clearInterval(autoThemeTimer);
    autoThemeTimer = setInterval(() => applyAutoTheme(false), 5 * 60 * 1000);
}

async function lockSession() {
    const ok = typeof showConfirm === 'function'
        ? await showConfirm({ title: 'Lock session?', message: 'Your shells keep running on the server. You will need the password to return.', okLabel: 'Lock' })
        : true;
    if (!ok) return;
    try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
    token = null;
    sessSet(K.token, null);
    window.location.reload();
}

function togglePasswordVisibility() {
    const input = $('password-input');
    const btn = $('toggle-password-btn');
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    if (btn) {
        const use = btn.querySelector('use');
        if (use) use.setAttribute('href', show ? '#i-eye-off' : '#i-eye');
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    }
    input.focus();
}

/* ─────────────── Tab management ─────────────── */

function getActiveTab() {
    return activeTabId ? tabs[activeTabId] : null;
}

function termOptions() {
    const s = getSettings();
    const themeData = getActiveTheme();
    return {
        cursorBlink: !!s.cursorBlink,
        cursorStyle: s.cursorStyle || 'block',
        fontFamily: s.fontFamily || "'Fira Code', monospace",
        fontSize: defaultFontSize(),
        scrollback: 99999,
        allowProposedApi: true,
        theme: themeWithOpacity(themeData, clamp(parseInt(s.opacity, 10) || 100, 40, 100))
    };
}

function createNewTab(existingId, existingTitle, profile) {
    if (isViewerSession && !existingId) {
        showToastSafe('info', 'Spectator mode', 'Viewers cannot open shell tabs — this session belongs to the host.');
        return null;
    }
    const tabId = (existingId && /^[A-Za-z0-9_-]{1,64}$/.test(existingId)) ? existingId : uid('gk');
    if (tabs[tabId]) { switchTab(tabId); return tabId; }
    const prof = profile || null;

    const tabBar = $('tab-bar');
    const newTabBtn = $('new-tab-btn');

    /* Tab chip */
    const tabEl = el('div', 'tab');
    tabEl.dataset.tabId = tabId;
    const colorDot = el('span', 'tab-color-dot hidden');
    if (prof && prof.color) {
        colorDot.classList.remove('hidden');
        colorDot.style.background = prof.color;
        colorDot.style.color = prof.color;
    }
    const activityEl = el('span', 'tab-activity hidden');
    const healthEl = el('span', 'tab-health hidden');   // 5.2: 🔥 process-health badge
    const titleEl = el('span', 'tab-title');
    const initialTitle = existingTitle || (prof && prof.name) || `${(prof && prof.shell) || serverMeta.shell || 'shell'} ${Object.keys(tabs).length + 1}`;
    titleEl.textContent = initialTitle;
    titleEl.title = 'Double-click to rename';
    const closeBtn = el('button', 'close-tab-btn', '×');
    closeBtn.title = 'Close tab';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tabId); });
    tabEl.append(colorDot, activityEl, titleEl, healthEl, closeBtn);
    tabEl.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('tab-rename-input')) return;
        switchTab(tabId);
    });
    tabEl.addEventListener('dblclick', (e) => {
        if (e.target && (e.target.classList.contains('close-tab-btn') || e.target.classList.contains('tab-rename-input'))) return;
        e.preventDefault();
        startRenameTab(tabId);
    });
    tabEl.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tabId); } });
    tabEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (typeof openTabContextMenu === 'function') openTabContextMenu(e, tabId);
    });
    if (tabBar && newTabBtn) tabBar.insertBefore(tabEl, newTabBtn);
    else if (tabBar) tabBar.appendChild(tabEl);

    /* Terminal container */
    const termEl = el('div', 'terminal-container');
    termEl.id = 'container_' + tabId;
    const wrapper = $('terminals-wrapper');
    if (wrapper) wrapper.appendChild(termEl);

    let term;
    try {
        term = new Terminal(termOptions()); // eslint-disable-line no-undef
    } catch (err) {
        showToastSafe('error', 'Terminal engine failed to load', 'Check your network connection to the CDN and reload.');
        return null;
    }
    const fitAddon = new FitAddon.FitAddon();          // eslint-disable-line no-undef
    const searchAddon = new SearchAddon.SearchAddon();  // eslint-disable-line no-undef
    const webLinksAddon = new WebLinksAddon.WebLinksAddon(); // eslint-disable-line no-undef
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);
    term.open(termEl);
    /* 5.5: shell semantic prompts (fish emits OSC 133 with $status) → fail chips */
    try {
        if (term.parser && term.parser.registerOscHandler) {
            term.parser.registerOscHandler(133, (data) => handleOsc133(tabs[tabId], data));
        }
    } catch (e) {}

    const tab = {
        id: tabId,
        title: initialTitle,
        tabEl, titleEl, activityEl, healthEl, termEl, colorDot,
        term, fitAddon, searchAddon, webLinksAddon,
        ws: null,
        wsConnected: false,
        reconnectTimer: null,
        reconnectDelay: 1000,
        intentionalClose: false,
        exited: false,
        overlayEl: null,
        dataBound: false,
        isCommandRunning: false,
        commandStartTime: 0,
        hasNotified: true,
        idleTimer: null,
        cmdBuffer: '',
        latency: null,
        /* 3.0 */
        profile: prof ? { shell: prof.shell || null, cwd: prof.cwd || null } : null,
        color: (prof && prof.color) || null,
        cwd: null,
        clientId: null,
        pendingWrites: [],
        flushScheduled: false,
        lineBuf: '',
        recording: null
    };
    tabs[tabId] = tab;

    /* Click a pane to focus it in split view */
    termEl.addEventListener('pointerdown', () => {
        if (splitState.mode && activeTabId !== tabId) {
            const idx = splitState.tabs.indexOf(tabId);
            if (idx >= 0) setSplitFocus(idx);
        }
    }, { capture: true, passive: true });

    bindTerminalEvents(tab);
    bindTouchSelection(tab);
    bindTerminalData(tab);   // bound exactly once per tab (fixes duplicate-send bug)
    connectWebSocket(tab);
    persistTabList();
    if (splitState.mode) addTabToSplit(tabId);
    else switchTab(tabId);
    return tabId;
}

function showToastSafe(type, title, text) {
    if (typeof showToast === 'function') showToast({ type, title, text });
}

function bindTerminalEvents(tab) {
    const { term, termEl } = tab;

    /* Alt-lock keyboard suppression on touch */
    termEl.addEventListener('pointerdown', () => {
        if (isAltLocked) {
            const ta = termEl.querySelector('.xterm-helper-textarea');
            if (ta) {
                ta.setAttribute('inputmode', 'none');
                ta.setAttribute('readonly', 'readonly');
                ta.blur();
            }
        }
    }, { passive: true });
    termEl.addEventListener('touchend', () => {
        if (isAltLocked && document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }
    }, { passive: true });

    /* Visual bell */
    try {
        term.onBell(() => {
            termEl.classList.remove('bell-ring');
            void termEl.offsetWidth;
            termEl.classList.add('bell-ring');
            buzz(20);
        });
    } catch (e) {}

    /* Right click → rich context menu */
    termEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (typeof openTermContextMenu === 'function') openTermContextMenu(e, tab);
    });

    /* Alt-lock: selection downloads the matching file */
    termEl.addEventListener('mouseup', () => {
        if (!isAltLocked) return;
        const selection = (term.getSelection() || '').trim();
        if (selection) {
            term.clearSelection();
            downloadBySelection(tab.id, selection);
        }
    });

    /* Terminal-level shortcuts */
    term.attachCustomKeyEventHandler((e) => {
        if (e.type !== 'keydown') return true;
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyF') { if (typeof openSearch === 'function') openSearch(); return false; }
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyP') { if (typeof togglePalette === 'function') togglePalette(); return false; }
        if (e.ctrlKey && !e.shiftKey && e.code === 'Comma') { if (typeof openSettings === 'function') openSettings(); return false; }
        if (e.ctrlKey && e.altKey && splitState.mode) {
            if (e.code === 'ArrowRight') { setSplitFocus(1); return false; }
            if (e.code === 'ArrowLeft') { setSplitFocus(0); return false; }
        }
        if (e.altKey && !e.ctrlKey && !e.metaKey) {
            if (e.code === 'KeyT') { createNewTab(); return false; }
            if (e.code === 'KeyW') { closeTab(tab.id); return false; }
            if (e.code === 'KeyS') { splitCycle(); return false; }
            if (e.code === 'ArrowRight') { cycleTab(1); return false; }
            if (e.code === 'ArrowLeft') { cycleTab(-1); return false; }
        }
        return true;
    });
}

function bindTerminalData(tab) {
    if (tab.dataBound) return;
    tab.dataBound = true;
    tab.term.onData((rawData) => {
        let data = rawData;
        if (tab.exited) return;

        /* Sticky Ctrl for mobile soft keyboards */
        if (ctrlSticky && typeof data === 'string' && data.length === 1 && /[a-zA-Z]/.test(data)) {
            data = String.fromCharCode(data.toLowerCase().charCodeAt(0) - 96);
            setCtrlSticky(false);
        }

        playMechanicalClick(data === '\r' || data === ' ' || data === '\x7f');
        sendInput(tab, data);
        trackCommandInput(tab, data);
    });
}

function trackCommandInput(tab, data) {
    if (typeof data !== 'string') return;
    if (data === '\x03') { // Ctrl+C cancels
        tab.cmdBuffer = '';
        tab.isCommandRunning = false;
        tab.hasNotified = true;
        if (tab.idleTimer) clearTimeout(tab.idleTimer);
        return;
    }
    for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
            const cmd = tab.cmdBuffer.trim();
            tab.cmdBuffer = '';
            if (cmd) {
                addRecentCommand(cmd);
                tab.cmdLast = cmd;
                bumpInsight('cmds');
            }
            tab.isCommandRunning = true;
            tab.commandStartTime = Date.now();
            tab.hasNotified = false;
        } else if (ch === '\x7f' || ch === '\b') {
            tab.cmdBuffer = tab.cmdBuffer.slice(0, -1);
        } else if (ch >= ' ' || ch === '\t') {
            if (tab.cmdBuffer.length < 2000) tab.cmdBuffer += ch;
        }
    }
}

function addRecentCommand(cmd) {
    if (!cmd || cmd.length > 500) return;
    let recents = storeGet(K.recents, []);
    if (!Array.isArray(recents)) recents = [];
    recents = recents.filter((c) => c !== cmd);
    recents.unshift(cmd);
    if (recents.length > 150) recents.length = 150;
    storeSet(K.recents, recents);
}

function getRecentCommands() {
    const r = storeGet(K.recents, []);
    return Array.isArray(r) ? r : [];
}

function sendInput(tab, data) {
    if (!tab) return false;
    if (tab.ws && tab.ws.readyState === WebSocket.OPEN) {
        try {
            tab.ws.send(JSON.stringify({ type: 'input', data }));
            tab.term.scrollToBottom();
            return true;
        } catch (e) {}
    }
    return false;
}

function runCommandInActiveTab(cmd) {
    const tab = getActiveTab();
    if (!tab) { showToastSafe('error', 'No active terminal', 'Create a tab first.'); return false; }
    if (tab.exited) { showToastSafe('warn', 'Shell has exited', 'Restart it from the terminal overlay.'); return false; }
    const payload = String(cmd).endsWith('\n') || String(cmd).endsWith('\r') ? String(cmd) : String(cmd) + '\n';
    if (!sendInput(tab, payload)) {
        showToastSafe('error', 'Not connected', 'Waiting for the session to reconnect…');
        return false;
    }
    playMechanicalClick(true);
    addRecentCommand(String(cmd).replace(/[\r\n]+$/, ''));
    tab.cmdLast = String(cmd).replace(/[\r\n]+$/, '');
    bumpInsight('cmds');
    tab.isCommandRunning = true;
    tab.commandStartTime = Date.now();
    tab.hasNotified = false;
    return true;
}

function aiExplainSelection(text, kind) {
    const clean = String(text || '').trim().slice(0, 2500);
    if (!clean) return;
    const prompt = kind === 'fix'
        ? `My terminal printed this. Diagnose the problem and fix it with commands if needed:\n\`\`\`\n${clean}\n\`\`\``
        : `Explain this terminal output in plain language (what it means, anything to worry about):\n\`\`\`\n${clean}\n\`\`\``;
    if (typeof toggleAi === 'function' && $('ai-drawer') && $('ai-drawer').classList.contains('hidden')) toggleAi();
    setTimeout(() => aiSend(prompt), 120);
}

function downloadBySelection(tabId, selection) {
    if (!token || !selection) return;
    const url = `/download?tabId=${encodeURIComponent(tabId)}&filename=${encodeURIComponent(selection)}&auth=${encodeURIComponent(token)}`;
    window.open(url, '_blank');
}

/* ─────────────── 5.5: failure awareness (OSC 133 + fail chips) ─────────────── */
function handleOsc133(tab, data) {
    if (!tab) return true;
    const d = String(data == null ? '' : data);
    if (d.charAt(0) === 'C') {
        try {
            const b = tab.term.buffer.active;
            tab.oscMark = b.baseY + b.cursorY;
        } catch (e) { tab.oscMark = null; }
        const m = d.match(/cmdline_url=([^;\x07]+)/);
        if (m) { try { tab.oscCmd = decodeURIComponent(m[1]); } catch (e) { tab.oscCmd = m[1]; } }
    } else if (d.charAt(0) === 'D') {
        const status = parseInt(d.slice(2), 10) || 0;
        if (status !== 0) failEvent(tab, tab.oscCmd || '(command)', oscSlice(tab), status);
        tab.oscMark = null;
    }
    return true;
}
function oscSlice(tab) {
    try {
        const b = tab.term.buffer.active;
        const from = tab.oscMark != null ? Math.max(0, tab.oscMark) : Math.max(0, b.length - 40);
        const lines = [];
        for (let y = from; y < b.length; y++) {
            const l = b.getLine(y);
            if (l) lines.push(l.translateToString(true));
        }
        return lines.join('\n').slice(-6000);
    } catch (e) { return ''; }
}
function failEvent(tab, cmd, output, status) {
    if (!tab) return;
    tab.lastFail = { cmd, output, status, at: Date.now() };
    if (typeof showFailChip === 'function') showFailChip(tab, cmd, status);
    aiPush({ kind: 'fail', cmd: String(cmd).slice(0, 200), output: String(output || '').slice(-6000), status });
}
function aiExplainFailure(cmd, output, status) {
    const ctx = `Command: ${cmd}\nExit status: ${status}\nOutput:\n${String(output || '').slice(-4000)}`;
    if (typeof aiExplainSelection === 'function') aiExplainSelection(ctx, 'fix');
}

function persistTabList() {
    const list = Object.values(tabs).map((t) => ({ id: t.id, title: t.title, color: t.color || null }));
    sessSet(K.tabs, list);
    sessSet(K.activeTab, activeTabId);
}

function restoreTabs() {
    const list = sessGet(K.tabs, null);
    if (!Array.isArray(list) || !list.length) return false;
    let restored = 0;
    for (const entry of list) {
        if (entry && typeof entry.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(entry.id)) {
            createNewTab(entry.id, entry.title, entry.color ? { color: entry.color } : null);
            restored++;
        }
    }
    const wantActive = sessGet(K.activeTab, null);
    if (wantActive && tabs[wantActive]) switchTab(wantActive);
    return restored > 0;
}

function switchTab(tabId) {
    const tab = tabs[tabId];
    if (!tab) return;

    if (splitState.mode) {
        /* In split mode, switching replaces the focused slot */
        const other = splitState.tabs[1 - splitState.focus];
        if (other === tabId) {
            setSplitFocus(1 - splitState.focus);
            return;
        }
        splitState.tabs[splitState.focus] = tabId;
        applySplitLayout();
    } else {
        if (activeTabId && tabs[activeTabId] && activeTabId !== tabId) {
            tabs[activeTabId].tabEl.classList.remove('active');
            tabs[activeTabId].termEl.classList.remove('active');
        }
        activeTabId = tabId;
        tab.tabEl.classList.add('active');
        tab.termEl.classList.add('active');
    }
    tab.activityEl.classList.add('hidden');

    try { tab.tabEl.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (e) {}

    updateStatusBarTab();
    updateViewersChip();
    if (typeof onTermSelectionChange === 'function') onTermSelectionChange(tab);
    updateCwdChip(tab.cwd || '');
    if (tab.cwd) refreshGitChip(tabId);
    else { const gc = $('git-chip'); if (gc) gc.classList.add('hidden'); }
    persistTabList();

    setTimeout(() => {
        if (document.querySelector('.tab-rename-input')) return;
        fitTab(tab);
        try { tab.term.focus(); tab.term.scrollToBottom(); } catch (e) {}
        sendResize(tab);
    }, 40);
}

/* ─────────────── Split view engine ─────────────── */

function splitCycle() {
    if (window.innerWidth < 769) {
        showToastSafe('info', 'Split view', 'Rotate to landscape or use a wider window for split view.');
        return;
    }
    if (!splitState.mode) startSplit('v');
    else if (splitState.mode === 'v') startSplit('h');
    else closeSplit();
}

function startSplit(mode, secondTabId) {
    const ids = Object.keys(tabs);
    if (!ids.length) return;
    const focusId = (activeTabId && tabs[activeTabId]) ? activeTabId : ids[0];
    let other = secondTabId && tabs[secondTabId] && secondTabId !== focusId ? secondTabId : null;
    if (!other) other = ids.find((id) => id !== focusId) || null;
    if (!other) {
        /* Only one tab — spawn a companion (createNewTab switches active; we re-pin below) */
        other = createNewTab();
        if (!other) return;
    }
    splitState.mode = mode;
    splitState.tabs = [focusId, other];
    splitState.focus = 0;
    applySplitLayout();
    const btn = $('split-btn');
    if (btn) btn.classList.add('split-on');
    logActivity('info', `Split view enabled (${mode === 'v' ? 'side by side' : 'stacked'})`);
}

function addTabToSplit(tabId) {
    if (!splitState.mode) return;
    splitState.tabs[splitState.focus] = tabId;
    applySplitLayout();
}

function closeSplit() {
    if (!splitState.mode) return;
    const keep = (activeTabId && tabs[activeTabId]) ? activeTabId : (splitState.tabs.find((id) => id && tabs[id]) || null);
    splitState = { mode: null, tabs: [null, null], focus: 0 };
    const wrapper = $('terminals-wrapper');
    if (wrapper) wrapper.classList.remove('split-h', 'split-v');
    for (const t of Object.values(tabs)) {
        t.termEl.classList.remove('pane', 'pane-focused');
        t.termEl.classList.remove('active');
        t.tabEl.classList.remove('in-split');
    }
    const btn = $('split-btn');
    if (btn) btn.classList.remove('split-on');
    if (keep && tabs[keep]) switchTab(keep);
    setTimeout(debouncedFit, 60);
}

function setSplitFocus(idx) {
    if (!splitState.mode) return;
    const id = splitState.tabs[idx];
    if (!id || !tabs[id]) return;
    splitState.focus = idx;
    activeTabId = id;
    applySplitLayout(true);
    updateStatusBarTab();
    updateViewersChip();
    updateCwdChip(tabs[id] && tabs[id].cwd ? tabs[id].cwd : '');
    persistTabList();
    try { tabs[id].term.focus(); } catch (e) {}
    sendResize(tabs[id]);
}

function applySplitLayout(skipActiveSync) {
    const wrapper = $('terminals-wrapper');
    if (!wrapper || !splitState.mode) return;
    wrapper.classList.toggle('split-v', splitState.mode === 'v');
    wrapper.classList.toggle('split-h', splitState.mode === 'h');
    splitState.tabs.forEach((id, i) => {
        if (!id || !tabs[id]) return;
        const t = tabs[id];
        t.termEl.classList.add('active', 'pane');
        t.termEl.classList.toggle('pane-focused', i === splitState.focus);
        t.tabEl.classList.toggle('active', i === splitState.focus);
        t.tabEl.classList.add('in-split');
    });
    for (const t of Object.values(tabs)) {
        if (!splitState.tabs.includes(t.id)) {
            t.termEl.classList.remove('active', 'pane', 'pane-focused');
            t.tabEl.classList.remove('active', 'in-split');
        }
    }
    if (!skipActiveSync) activeTabId = splitState.tabs[splitState.focus];
    setTimeout(() => {
        splitState.tabs.forEach((id) => { if (id && tabs[id]) { fitTab(tabs[id]); sendResize(tabs[id]); } });
    }, 50);
}

function splitWithNewTab() {
    if (window.innerWidth < 769) {
        showToastSafe('info', 'Split view', 'Rotate to landscape or use a wider window for split view.');
        return;
    }
    if (!splitState.mode) startSplit('v');
    else createNewTab(); // lands in the focused pane via addTabToSplit
}

function cycleTab(dir) {
    const ids = Object.keys(tabs);
    if (ids.length < 2) return;
    const idx = ids.indexOf(activeTabId);
    const next = ids[(idx + dir + ids.length) % ids.length];
    switchTab(next);
}

function closeTab(tabId, opts) {
    const options = opts || {};
    const tab = tabs[tabId];
    if (!tab) return;
    const ids = Object.keys(tabs);
    const idx = ids.indexOf(tabId);

    tab.intentionalClose = true;
    if (!options.remote) {
        try {
            if (tab.ws && (tab.ws.readyState === WebSocket.OPEN || tab.ws.readyState === WebSocket.CONNECTING)) {
                tab.ws.send(JSON.stringify({ type: 'kill' }));
            }
        } catch (e) {}
    }
    try { if (tab.ws) tab.ws.onclose = null; } catch (e) {}
    try { if (tab.ws) tab.ws.close(); } catch (e) {}
    if (tab.reconnectTimer) clearTimeout(tab.reconnectTimer);
    if (tab.idleTimer) clearTimeout(tab.idleTimer);
    if (tab.recording) logActivity('warn', `Recording discarded for "${tab.title}" (tab closed)`);
    try { tab.term.dispose(); } catch (e) {}
    try { tab.tabEl.remove(); tab.termEl.remove(); } catch (e) {}
    delete tabs[tabId];
    delete tabShareStatus[tabId];

    /* Split bookkeeping: a split with only one surviving pane is pointless — collapse it */
    if (splitState.mode && splitState.tabs.includes(tabId)) {
        const other = splitState.tabs.find((id) => id && id !== tabId && tabs[id]);
        closeSplit();
        if (other) switchTab(other);
    }

    const remaining = Object.keys(tabs);
    if (!remaining.length) {
        activeTabId = null;
        createNewTab();
    } else if (!activeTabId || !tabs[activeTabId]) {
        const nextIdx = Math.min(idx, remaining.length - 1);
        switchTab(remaining[Math.max(0, nextIdx)]);
    } else {
        updateStatusBarTab();
    }
    persistTabList();
}

function focusTermTimeoutGuard() { /* placeholder for symmetry with rename flow */ }

let renameFocusTimer = null;
function startRenameTab(tabId) {
    const tab = tabs[tabId];
    if (!tab || !tab.titleEl) return;
    if (tab.tabEl.querySelector('.tab-rename-input')) return;
    clearTimeout(renameFocusTimer);

    const titleEl = tab.titleEl;
    const currentText = titleEl.textContent;
    const input = el('input', 'tab-rename-input');
    input.type = 'text';
    input.value = currentText;
    input.maxLength = 40;

    titleEl.style.display = 'none';
    tab.tabEl.insertBefore(input, titleEl);

    setTimeout(() => { input.focus(); input.select(); }, 20);

    let committed = false;
    const commit = () => {
        if (committed) return;
        committed = true;
        const newText = input.value.trim() || currentText;
        titleEl.textContent = newText;
        titleEl.style.display = '';
        tab.title = newText;
        input.remove();
        persistTabList();
        updateStatusBarTab();
        renameFocusTimer = setTimeout(() => { try { tab.term.focus(); } catch (e) {} }, 60);
    };
    const cancel = () => {
        if (committed) return;
        committed = true;
        titleEl.style.display = '';
        input.remove();
        renameFocusTimer = setTimeout(() => { try { tab.term.focus(); } catch (e) {} }, 60);
    };

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());
    setTimeout(() => input.addEventListener('blur', commit), 200);
}

function updateStatusBarTab() {
    const t = $('sb-title');
    const tab = getActiveTab();
    if (t) t.textContent = tab ? tab.title : 'garuda konsole';
    try {
        document.title = tab ? `${tab.title} · Garuda Konsole` : 'Garuda Konsole';
    } catch (e) {}
}

/* ─────────────── Session ended overlay ─────────────── */

function showSessionEnded(tab, info) {
    if (!tab || tab.overlayEl) return;
    tab.exited = true;
    const overlay = el('div', 'session-ended-overlay');
    const code = info && info.exitCode != null ? info.exitCode : '?';
    overlay.innerHTML = `
        <div class="session-ended-icon"><svg class="ic"><use href="#i-power"></use></svg></div>
        <div class="session-ended-title">Shell process exited</div>
        <div class="session-ended-sub">exit code ${escHtml(code)}${info && info.signal ? ' · ' + escHtml(info.signal) : ''}</div>
        <div class="session-ended-actions">
            <button class="btn-primary" data-action="respawn-session" data-tab="${tab.id}">Restart shell</button>
            <button class="btn-ghost" data-action="close-tab-action" data-tab="${tab.id}">Close tab</button>
        </div>`;
    tab.termEl.appendChild(overlay);
    tab.overlayEl = overlay;
}

function hideSessionEnded(tab) {
    if (!tab) return;
    tab.exited = false;
    if (tab.overlayEl) {
        tab.overlayEl.remove();
        tab.overlayEl = null;
    }
}

function respawnSession(tabId) {
    const tab = tabs[tabId];
    if (!tab) return;
    if (tab.ws && tab.ws.readyState === WebSocket.OPEN) {
        tab.ws.send(JSON.stringify({ type: 'respawn', cols: tab.term.cols, rows: tab.term.rows }));
        buzz(12);
    } else {
        showToastSafe('warn', 'Reconnecting…', 'The session will restart once the link is back.');
    }
}

/* ─────────────── Touch selection engine ───────────────
   Custom selection for touch screens: long-press selects a word, horizontal
   drag selects a range. No native copy/paste bubble, no keyboard pop-up —
   a custom action bar (Copy / Explain / Fix / Download) appears instead.
   Vertical drags still scroll the terminal as usual. */

function suppressKeyboardFor(tab, on) {
    if (!tab || !tab.termEl) return;
    const ta = tab.termEl.querySelector('.xterm-helper-textarea');
    if (!ta) return;
    if (on) {
        ta.setAttribute('inputmode', 'none');
        ta.setAttribute('readonly', 'readonly');
        if (ta.blur) ta.blur();
        document.body.classList.add('sel-active');
    } else {
        ta.removeAttribute('inputmode');
        ta.removeAttribute('readonly');
        document.body.classList.remove('sel-active');
    }
}

/* ─────────────── Touch selection engine ───────────────
   Simple, predictable rules (reverted to the classic behaviour per user
   feedback, v4.0.2):
   • long-press (finger still ≥380 ms) selects the word under it and shows the
     action bar (Copy / Explain / Fix / Download);
   • a horizontal-dominant drag selects a range (multi-line supported);
   • a vertical-dominant drag scrolls the terminal as usual;
   • while a selection exists the soft keyboard and native callouts stay
     suppressed; a plain tap restores typing. */

function bindTouchSelection(tab) {
    const termEl = tab.termEl;
    if (!termEl || !('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;
    const st = { gesture: false, selecting: false, from: null, sx: 0, sy: 0, lx: 0, ly: 0, moved: 0, lpTimer: null, longFired: false };

    const cellAt = (x, y) => {
        const screen = termEl.querySelector('.xterm-screen') || termEl.querySelector('.xterm-rows');
        if (!screen || !tab.term.cols || !tab.term.rows) return null;
        const r = screen.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        const col = clamp(Math.floor((x - r.left) / (r.width / tab.term.cols)), 0, tab.term.cols - 1);
        const vrow = clamp(Math.floor((y - r.top) / (r.height / tab.term.rows)), 0, tab.term.rows - 1);
        try { return { col, row: vrow + tab.term.buffer.active.viewportY }; } catch (e) { return null; }
    };
    const wordAt = (cell) => {
        try {
            const line = tab.term.buffer.active.getLine(cell.row);
            const text = line ? line.translateToString(true) : '';
            if (!text.length) return null;
            const isW = (c) => /[\w.\-\/~=:'"]/.test(c);
            let a = Math.min(cell.col, text.length - 1), b = a;
            if (!isW(text[a] || '')) return { a, b: a + 1 };
            while (a > 0 && isW(text[a - 1])) a--;
            while (b < text.length && isW(text[b])) b++;
            return { a, b };
        } catch (e) { return null; }
    };
    const applySel = (from, to) => {
        try {
            if (from.row === to.row) {
                const a = Math.min(from.col, to.col);
                const b = Math.max(from.col, to.col) + 1;
                tab.term.select(a, from.row, b - a);
            } else if (from.row < to.row) {
                tab.term.selectLines(from.row, to.row, from.col, to.col + 1);
            } else {
                tab.term.selectLines(to.row, from.row, to.col + 1, from.col);
            }
        } catch (e) {}
        if (typeof onTermSelectionChange === 'function') onTermSelectionChange(tab);
    };
    const begin = (from) => {
        st.selecting = true;
        st.from = from;
        suppressKeyboardFor(tab, true);
    };
    const reset = () => {
        clearTimeout(st.lpTimer);
        st.gesture = false; st.selecting = false; st.longFired = false; st.from = null; st.moved = 0;
    };

    termEl.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { reset(); return; }
        const t = e.touches[0];
        st.sx = st.lx = t.clientX; st.sy = st.ly = t.clientY; st.moved = 0; st.gesture = true;
        clearTimeout(st.lpTimer);
        st.lpTimer = setTimeout(() => {
            if (!st.gesture || st.moved > 12 || st.selecting) return;
            const cell = cellAt(st.sx, st.sy);
            if (!cell) return;
            const w = wordAt(cell);
            begin(w ? { col: w.a, row: cell.row } : cell);
            applySel(st.from, w ? { col: w.b - 1, row: cell.row } : { col: cell.col + 1, row: cell.row });
            st.longFired = true;
            buzz(10);
        }, 380);
    }, { capture: true, passive: true });

    termEl.addEventListener('touchmove', (e) => {
        if (!st.gesture || e.touches.length !== 1) return;
        const t = e.touches[0];
        st.moved += Math.abs(t.clientX - st.lx) + Math.abs(t.clientY - st.ly);
        const dx = Math.abs(t.clientX - st.sx), dy = Math.abs(t.clientY - st.sy);
        if (!st.selecting) {
            const wantsSelect = st.longFired || (st.moved > 26 && (isAltLocked || dx > dy * 1.5));
            if (!wantsSelect) { st.lx = t.clientX; st.ly = t.clientY; return; } // vertical → normal scroll
            const from = cellAt(st.sx, st.sy);
            if (!from) return;
            begin(from);
        }
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        const to = cellAt(t.clientX, t.clientY);
        if (to && st.from) applySel(st.from, to);
        st.lx = t.clientX; st.ly = t.clientY;
    }, { capture: true, passive: false });

    termEl.addEventListener('touchend', () => {
        const wasSelecting = st.selecting;
        reset();
        if (!wasSelecting && !isAltLocked) suppressKeyboardFor(tab, false);  // plain tap: keyboard may return
        else if (wasSelecting && typeof onTermSelectionChange === 'function') onTermSelectionChange(tab);
    }, { capture: true, passive: true });
    termEl.addEventListener('touchcancel', () => reset(), { capture: true, passive: true });
}

/* ─────────────── WebSocket engine ─────────────── */

function connectWebSocket(tab) {
    if (!tab || tab.intentionalClose) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let url;
    try {
        url = `${proto}//${window.location.host}/?tabId=${encodeURIComponent(tab.id)}&auth=${encodeURIComponent(token || '')}&cols=${tab.term.cols || 80}&rows=${tab.term.rows || 24}`;
        if (tab.profile && tab.profile.shell) url += `&shell=${encodeURIComponent(tab.profile.shell)}`;
        if (tab.profile && tab.profile.cwd) url += `&cwd=${encodeURIComponent(tab.profile.cwd)}`;
    } catch (e) { return; }

    let ws;
    try { ws = new WebSocket(url); } catch (e) { scheduleReconnect(tab); return; }
    tab.ws = ws;

    ws.onopen = () => {
        if (tab.intentionalClose) return;
        tab.wsConnected = true;
        tab.reconnectDelay = 1000;
        if (tab.id === activeTabId) setConnUI('ok');
        setTimeout(() => {
            if (tab.intentionalClose) return;
            fitTab(tab);
            try { tab.term.scrollToBottom(); } catch (e) {}
            if (tab.id === activeTabId) sendResize(tab);
        }, 60);
    };

    ws.onmessage = (event) => {
        if (tab.intentionalClose) return;
        const data = event.data;
        if (typeof data === 'string' && data.charCodeAt(0) === 0) {
            let ctrl = null;
            try { ctrl = JSON.parse(data.slice(1)); } catch (e) { ctrl = null; }
            if (ctrl && ctrl.type) { handleHostCtrl(tab, ctrl); return; }
            // Not ours → treat as terminal data
        }
        handleTerminalOutput(tab, data);
    };

    ws.onclose = () => {
        if (tab.intentionalClose || !tabs[tab.id]) return;
        tab.wsConnected = false;
        if (tab.id === activeTabId) setConnUI('bad');
        scheduleReconnect(tab);
    };

    ws.onerror = () => { /* onclose follows */ };
}

function scheduleReconnect(tab) {
    if (tab.intentionalClose || tab.reconnectTimer || !tabs[tab.id]) return;
    const delay = tab.reconnectDelay || 1000;
    tab.reconnectDelay = Math.min(30000, delay * 1.7);
    tab.reconnectTimer = setTimeout(() => {
        tab.reconnectTimer = null;
        if (!tab.intentionalClose && tabs[tab.id]) connectWebSocket(tab);
    }, delay);
}

function handleHostCtrl(tab, ctrl) {
    switch (ctrl.type) {
        case 'init': {
            try { tab.term.reset(); } catch (e) {}
            if (ctrl.history) tab.term.write(ctrl.history);
            tab.wsConnected = true;
            tab.clientId = ctrl.clientId || null;
            if (ctrl.cwd) setTabCwd(tab, ctrl.cwd, true);
            if (tab.id === activeTabId) setConnUI('ok');
            if (!ctrl.alive) {
                showSessionEnded(tab, ctrl.exitInfo);
            } else {
                hideSessionEnded(tab);
            }
            if (ctrl.shell && serverMeta) serverMeta.shell = ctrl.shell;
            break;
        }
        case 'cwd': {
            setTabCwd(tab, ctrl.cwd, false);
            break;
        }
        case 'chat': {
            if (typeof addChatMessage === 'function') {
                addChatMessage({
                    from: ctrl.from, text: ctrl.text, t: ctrl.t,
                    self: ctrl.fromId && ctrl.fromId === tab.clientId,
                    tabId: tab.id
                });
            }
            break;
        }
        case 'exit': {
            try { tab.term.write(`\r\n\x1b[91m── shell exited (code ${ctrl.exitCode != null ? ctrl.exitCode : '?'}) ──\x1b[0m\r\n`); } catch (e) {}
            showSessionEnded(tab, { exitCode: ctrl.exitCode, signal: ctrl.signal });
            tab.isCommandRunning = false;
            logActivity('error', `Shell exited in "${tab.title}" (code ${ctrl.exitCode != null ? ctrl.exitCode : '?'})`);
            break;
        }
        case 'restarted': {
            hideSessionEnded(tab);
            try { tab.term.write('\r\n\x1b[96m── shell restarted ──\x1b[0m\r\n'); } catch (e) {}
            showToastSafe('success', 'Shell restarted', `Tab "${tab.title}" is live again.`);
            logActivity('success', `Shell restarted in "${tab.title}"`);
            break;
        }
        case 'session_closed': {
            showToastSafe('warn', 'Session closed', `"${tab.title}" was closed from another window or the settings panel.`);
            logActivity('warn', `Session "${tab.title}" closed remotely`);
            closeTab(tab.id, { remote: true });
            break;
        }
        case 'presence': {
            handlePresenceUpdate(ctrl.tabId, ctrl.viewerCount || 0);
            break;
        }
        case 'notify': {
            handleServerNotify(ctrl);
            break;
        }
        case 'tab-health': {
            if (typeof handleTabHealth === 'function') handleTabHealth(tab, ctrl);
            break;
        }
        case 'pong': {
            if (typeof ctrl.t === 'number') {
                tab.latency = Math.max(0, Date.now() - ctrl.t);
                if (tab.id === activeTabId) updatePingChip(tab.latency);
            }
            break;
        }
        case 'error': {
            showToastSafe('error', 'Server', ctrl.message || 'Unknown error');
            break;
        }
        default:
            break;
    }
}

/* Live cwd tracking (status bar + git chip) */
function setTabCwd(tab, cwd, silent) {
    if (!cwd || tab.cwd === cwd) {
        if (cwd && tab.id === activeTabId) updateCwdChip(cwd);
        return;
    }
    const prev = tab.cwd;
    tab.cwd = cwd;
    if (tab.id === activeTabId) {
        updateCwdChip(cwd);
        refreshGitChip(tab.id);
    }
    if (!silent && prev) {
        try { tab.termEl.title = cwd; } catch (e) {}
    }
}

function updateCwdChip(cwd) {
    const chip = $('sb-cwd');
    if (!chip) return;
    let display = cwd || '~';
    const home = (typeof getFilesHome === 'function' && getFilesHome()) || null;
    if (home && home.length > 1) {
        if (display === home) display = '~';
        else if (display.startsWith(home + '/')) display = '~' + display.slice(home.length);
    }
    chip.textContent = display;
    chip.title = cwd || '';
}

let gitFetchInFlight = false;
async function refreshGitChip(tabId) {
    const chip = $('git-chip');
    const branch = $('git-branch');
    if (!chip || !branch || !token || isViewerSession) return;
    if (gitFetchInFlight) return;
    gitFetchInFlight = true;
    try {
        const g = await api(`/api/git?tabId=${encodeURIComponent(tabId || '')}`);
        if (tabId && tabId !== activeTabId) return; // stale
        if (g && g.isRepo) {
            chip.classList.remove('hidden');
            chip.classList.toggle('dirty', !!g.dirty);
            branch.textContent = g.branch + (g.dirty ? ' •' : '');
        } else {
            chip.classList.add('hidden');
        }
    } catch (e) {
        chip.classList.add('hidden');
    } finally {
        gitFetchInFlight = false;
    }
}

function handleTerminalOutput(tab, data) {
    /* Frame-batched writes keep huge outputs fluid.
       rAF stalls in hidden tabs, so a timer always backs it up — this is what
       keeps completion notifications & triggers working in the background. */
    tab.pendingWrites.push(data);
    if (!tab.flushScheduled) {
        tab.flushScheduled = true;
        const run = () => {
            if (!tabs[tab.id]) { tab.flushScheduled = false; return; }
            const batch = tab.pendingWrites.splice(0, tab.pendingWrites.length).join('');
            if (!batch) { tab.flushScheduled = false; return; }
            tab.flushScheduled = false;
            try { tab.term.write(batch); } catch (e) { return; }
            ringPush(tab, batch);
            if (tab.capture) {
                tab.capture.buf.push(batch);
                tab.capture.lastAt = Date.now();
                if (tab.capture.bytes < 400000) tab.capture.bytes += batch.length;
            }
            recordChunk(tab, batch);
            matchTriggers(tab, batch);
            onOutputSideEffects(tab);
        };
        if (!document.hidden && window.requestAnimationFrame) requestAnimationFrame(run);
        setTimeout(run, document.hidden ? 60 : 24);
    }
}

function onOutputSideEffects(tab) {
    /* Activity dot on background tabs */
    if (tab.id !== activeTabId) tab.activityEl.classList.remove('hidden');

    /* Completion notification + insights bookkeeping */
    if (!tab.isCommandRunning || tab.hasNotified) return;
    if (tab.idleTimer) clearTimeout(tab.idleTimer);
    tab.idleTimer = setTimeout(() => {
        if (!tabs[tab.id] || !tab.isCommandRunning || tab.hasNotified) return;
        const duration = Date.now() - tab.commandStartTime;
        const settings = getSettings();
        if (duration >= 2000) {
            bumpInsight('longest', duration, tab.cmdLast || '');
            logActivity(duration >= 10000 ? 'warn' : 'success',
                `Command finished in "${tab.title}" after ${(duration / 1000).toFixed(1)}s${tab.cmdLast ? ': ' + tab.cmdLast.slice(0, 60) : ''}`);
            if (document.hidden && settings.completionNotifications) {
                notifyUser('Command finished', `"${tab.title}" completed after ${Math.round(duration / 1000)}s`, { tag: 'cmd-' + tab.id });
            }
        }
        tab.isCommandRunning = false;
        tab.hasNotified = true;
    }, 1800);
}

/* ─────────────── Trigger engine ─────────────── */

function getTriggers() {
    const t = storeGet(K.triggers, null);
    return Array.isArray(t) ? t : [];
}
function saveTriggers(list) {
    storeSet(K.triggers, list);
    triggerCache.clear();
    /* Mirror push-enabled triggers to the server so they fire even when the browser is closed */
    try {
        if (token && !isViewerSession) {
            api('/api/triggers/sync', { method: 'POST', body: { triggers: list } }).catch(() => {});
        }
    } catch (e) {}
}

function compiledTrigger(trig) {
    let re = triggerCache.get(trig.id);
    if (!re) {
        try {
            re = new RegExp(trig.pattern, trig.caseSensitive ? '' : 'i');
        } catch (e) {
            re = null;
        }
        triggerCache.set(trig.id, re);
    }
    return re;
}

function matchTriggers(tab, text) {
    const triggers = getTriggers();
    if (!triggers.length) return;
    /* Line-oriented matching with carry-over for partial lines */
    tab.lineBuf = ((tab.lineBuf || '') + text);
    if (tab.lineBuf.length > 20000) tab.lineBuf = tab.lineBuf.slice(-20000);
    const parts = tab.lineBuf.split('\n');
    tab.lineBuf = parts.pop() || '';
    if (!parts.length) return;

    const now = Date.now();
    for (const trig of triggers) {
        if (!trig.enabled) continue;
        if (trig.scope === 'active' && tab.id !== activeTabId) continue;
        const re = compiledTrigger(trig);
        if (!re) continue;
        for (let i = parts.length - 1; i >= 0; i--) {
            const line = stripAnsi(parts[i]).trim();
            if (!line) continue;
            if (re.test(line)) {
                const key = trig.id + ':' + tab.id;
                if (now - (triggerCooldown.get(key) || 0) < 3000) break;
                triggerCooldown.set(key, now);
                fireTrigger(trig, tab, line);
                break;
            }
        }
    }
}

function stripAnsi(s) {
    return String(s).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/[\x00-\x08\x0b-\x1f]/g, '');
}

function fireTrigger(trig, tab, line) {
    const acts = trig.actions || { toast: true };
    const short = line.length > 140 ? line.slice(0, 140) + '…' : line;
    if (acts.toast !== false) {
        showToast({ type: 'warn', title: '⚡ ' + (trig.name || 'Trigger'), text: `[${tab.title}] ${short}`, duration: 6000 });
    }
    if (acts.sound) playTriggerSound();
    if (acts.notify && document.hidden) {
        notifyUser('⚡ ' + (trig.name || 'Trigger'), `[${tab.title}] ${short}`, { tag: 'trg-' + trig.id });
        /* Suppress the server-side trigger mirror of this same event (the
           server tags its push copies 'trigger:<id>'). */
        markNotifyTag('trigger:' + trig.id);
    }
    bumpInsight('triggers', 1);
    logActivity('warn', `Trigger "${trig.name}" fired in "${tab.title}": ${short.slice(0, 80)}`);
    if (tab.id !== activeTabId) tab.activityEl.classList.remove('hidden');
}

function playTriggerSound() {
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
        const now = ctx.currentTime;
        [880, 660, 880].forEach((f, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'square';
            o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, now + i * 0.12);
            g.gain.exponentialRampToValueAtTime(0.028, now + i * 0.12 + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.1);
            o.connect(g); g.connect(ctx.destination);
            o.start(now + i * 0.12); o.stop(now + i * 0.12 + 0.12);
        });
    } catch (e) {}
}

/* ─────────────── Instant-replay ring buffer ───────────────
   Keeps the last N seconds of output per tab. Resource guarantees:
   • pruning happens INLINE when new output arrives — no timers, no intervals;
   • when nothing is printed, absolutely nothing runs;
   • hard byte cap (2 MB per tab) and time cap (setting) bound memory. */

const RING_MAX_BYTES = 2 * 1024 * 1024;

function ringPush(tab, batch) {
    const secs = parseInt(getSettings().ringSecs, 10);
    if (!secs) { if (tab.ring) { tab.ring = null; } return; }
    if (!tab.ring) tab.ring = { chunks: [], bytes: 0 };
    const now = Date.now();
    tab.ring.chunks.push({ t: now, d: batch });
    tab.ring.bytes += batch.length;
    const cutoff = now - secs * 1000;
    const ch = tab.ring.chunks;
    while (ch.length && (ch[0].t < cutoff || tab.ring.bytes > RING_MAX_BYTES)) {
        tab.ring.bytes -= ch.shift().d.length;
    }
}

function getRingRecording(tab) {
    if (!tab || !tab.ring || !tab.ring.chunks.length) return null;
    const src = tab.ring.chunks;
    const t0 = src[0].t;
    return {
        title: `${tab.title} — last ${Math.round((src[src.length - 1].t - t0) / 1000)}s`,
        chunks: src.map((c) => ({ t: c.t - t0, d: c.d })),
        live: false
    };
}

/* ─────────────── Session recorder ─────────────── */

const RECORD_MAX_BYTES = 8 * 1024 * 1024;

function recordChunk(tab, batch) {
    const rec = tab.recording;
    if (!rec) return;
    rec.bytes += batch.length;
    if (rec.bytes > RECORD_MAX_BYTES) {
        stopRecording(tab.id, true);
        return;
    }
    rec.chunks.push({ t: Date.now() - rec.startedAt, d: batch });
}

function toggleRecording(tabId) {
    const id = tabId || activeTabId;
    const tab = tabs[id];
    if (!tab) return;
    if (tab.recording) stopRecording(id);
    else startRecording(id);
}

function startRecording(tabId) {
    const tab = tabs[tabId];
    if (!tab || tab.recording) return;
    tab.recording = { startedAt: Date.now(), chunks: [], bytes: 0 };
    logActivity('info', `Recording started for "${tab.title}"`);
    updateRecordingUI();
    showToast({ type: 'success', title: 'Recording started', text: `${tab.title} — output is being captured (max 8 MB)`, duration: 2800 });
    buzz(14);
}

function stopRecording(tabId, auto) {
    const tab = tabs[tabId];
    if (!tab || !tab.recording) return;
    const rec = tab.recording;
    tab.recording = null;
    tab.lastRecording = { title: tab.title, startedAt: rec.startedAt, stoppedAt: Date.now(), chunks: rec.chunks };
    updateRecordingUI();
    /* 5.2.1: persist to the server-side library (~/Rec_jsonl) */
    if (rec.chunks.length && getSettings().autoSaveRecordings !== false && !isViewerSession && token) {
        api('/api/recordings', { method: 'POST', body: { title: `${tab.title} — ${new Date(rec.startedAt).toLocaleString()}`, chunks: rec.chunks } })
            .then((r) => showToast({ type: 'success', title: 'Recording saved', text: `${r.name} → server ~/Rec_jsonl`, duration: 3200 }))
            .catch(() => showToast({ type: 'warn', title: 'Recording not saved', text: 'Server recording library unavailable.', duration: 3200 }));
    }
    if (auto) {
        showToast({ type: 'warn', title: 'Recording limit reached', text: `8 MB captured for "${tab.title}" — recording stopped. Replay or export it anytime this session.` });
        logActivity('warn', `Recording hit 8 MB limit in "${tab.title}"`);
    } else {
        showToast({ type: 'success', title: 'Recording saved', text: `${rec.chunks.length} frames — open Replay from the palette, status chip or toolbar.` });
        logActivity('success', `Recording stopped for "${tab.title}" (${rec.chunks.length} frames)`);
    }
    buzz(10);
}

function updateRecordingUI() {
    const anyRec = Object.values(tabs).find((t) => t.recording);
    const chip = $('rec-chip');
    const btn = $('record-btn');
    if (btn) btn.classList.toggle('recording', !!anyRec);
    if (chip) chip.classList.toggle('hidden', !anyRec);
    if (!anyRec) {
        if (recTimer) { clearInterval(recTimer); recTimer = null; }
        return;
    }
    if (!recTimer) {
        recTimer = setInterval(() => {
            const rec = Object.values(tabs).find((t) => t.recording);
            const timeEl = $('rec-time');
            if (!rec || !timeEl) return;
            const s = Math.floor((Date.now() - rec.recording.startedAt) / 1000);
            timeEl.textContent = `REC ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        }, 1000);
    }
    const timeEl = $('rec-time');
    if (timeEl) timeEl.textContent = 'REC 0:00';
}

function getLatestRecording() {
    /* Prefer a live recording; else the most recent finished one */
    const live = Object.values(tabs).find((t) => t.recording);
    if (live) {
        return {
            title: live.title + ' (live)',
            chunks: live.recording.chunks,
            live: true,
            tabId: live.id
        };
    }
    let best = null;
    for (const t of Object.values(tabs)) {
        if (t.lastRecording && (!best || t.lastRecording.stoppedAt > best.stoppedAt)) best = t.lastRecording;
    }
    if (best) return { title: best.title, chunks: best.chunks, live: false };
    return null;
}

/* ─────────────── Chat (client side) ─────────────── */

function sendChat(text) {
    const clean = String(text || '').trim().slice(0, 2000);
    if (!clean) return false;
    let ws = null, meId = null;
    if (isViewerSession) { ws = viewerWs; meId = viewerClientId; }
    else {
        const tab = getActiveTab();
        if (tab) { ws = tab.ws; meId = tab.clientId; }
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showToastSafe('error', 'Chat unavailable', 'No live connection to the session.');
        return false;
    }
    try {
        ws.send(JSON.stringify({ type: 'chat', text: clean }));
        return true;
    } catch (e) { return false; }
}

/* ─────────────── AI Guide: agent engine ─────────────── */

const AI_MAX_STEPS = 12;
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

const aiState = {
    mode: 'ask',            // chat | ask | auto
    busy: false,
    stopped: false,
    awaitingModel: false,
    messages: [],           // LLM conversation [{role, content}]
    ui: [],                 // rendered items
    uiSeq: 1,
    gen: 0,                 // generation guard: stale loops can't touch newer state
    tabId: null,
    steps: 0,
    pending: null           // { id, resolve } for approval cards
};

/* Catastrophic patterns always require explicit confirmation — even in Auto mode */
const AI_DANGER_PATTERNS = [
    { re: /\brm\s+(-[a-z]*\s+)*-[a-z]*r[a-z]*f[a-z]*\s+(-[a-z]*\s+)*(\/|~\/?|\$HOME)(\s|$|;|&&)/i, why: 'recursive force-delete of a root/home path' },
    { re: /\brm\s+(-[a-z]*\s+)*-[a-z]*f[a-z]*r[a-z]*\s+(-[a-z]*\s+)*(\/|~\/?|\$HOME)(\s|$|;|&&)/i, why: 'recursive force-delete of a root/home path' },
    { re: /\bmkfs(\.\w+)?\b/i, why: 'filesystem format' },
    { re: /\bdd\b[^|;&]*\bof=\/dev\//i, why: 'raw write to a block device' },
    { re: /:\(\)\s*\{[^}]*\|[^}]*&\s*\}\s*;\s*:/, why: 'fork bomb' },
    { re: /\b(shutdown|poweroff|halt|reboot|init\s+0|init\s+6)\b/i, why: 'power state change' },
    { re: />\s*\/dev\/(sd|nvme|hd|vd|xvd)/i, why: 'raw write to a block device' },
    { re: /\bwipefs\b|\bfdisk\b[^|;&]*\/dev\/|\bparted\b[^|;&]*\/dev\//i, why: 'partition table modification' },
    { re: /\bchmod\s+(-R\s+)?(777|666)\s+\//, why: 'world-writable permissions on a root path' },
    { re: /\b(curl|wget)\b[^|;]*\|\s*(sudo\s+)?(ba)?sh\b/i, why: 'piping a remote script straight into a shell' },
    { re: /\bDROP\s+(TABLE|DATABASE)\b/i, why: 'destructive SQL' },
    { re: /\bgit\s+push\b[^|;&]*--force\b|\bgit\s+push\b[^|;&]*\s-f\b/i, why: 'force-push rewrites remote history' },
    { re: /\bcrontab\s+-r\b/i, why: 'deletes all scheduled jobs' },
    { re: /\btruncate\b[^|;&]*\/dev\/|\bshred\b[^|;&]*\/dev\//i, why: 'destructive device operation' }
];

function aiIsDangerous(cmd) {
    const c = String(cmd || '');
    for (const p of AI_DANGER_PATTERNS) {
        if (p.re.test(c)) return p.why;
    }
    return null;
}

function aiSystemPrompt() {
    const tab = aiState.tabId ? tabs[aiState.tabId] : getActiveTab();
    const mode = aiState.mode;
    const ctx = [
        `host: ${serverMeta.hostname || 'unknown'} (${serverMeta.platform || 'Linux'})`,
        `shell: ${serverMeta.shell || 'sh'}`,
        `current folder: ${(tab && tab.cwd) || 'unknown'}`
    ].join(' · ');
    const modeNote = mode === 'auto'
        ? 'The user has enabled AUTO mode: your commands run automatically and their output returns to you. Work step by step and finish with a short summary (no cmd block) when done.'
        : mode === 'ask'
            ? 'The user approves each command manually before it runs. Just follow the protocol — do not ask "should I run it?", the UI handles approval.'
            : 'CHAT mode: you are an advisor. Do NOT output cmd blocks unless the user explicitly wants a runnable command — they will be offered as manual suggestions and NOT auto-executed.';
    return [
        'You are the Garuda AI Guide, an expert Linux terminal assistant embedded in the Garuda Konsole web terminal.',
        `Environment — ${ctx}.`,
        '',
        'PROTOCOL:',
        '1. To execute a shell command, output EXACTLY ONE fenced block labeled cmd:',
        '```cmd',
        '<command>',
        '```',
        '2. Any block labeled cmd/sh/bash/shell is treated as a command to run.',
        '3. After execution, the next user message contains the command output. Then continue with the next single command, or finish with a short explanation and NO cmd block.',
        '4. Never output more than one cmd block per message.',
        '5. Prefer non-interactive commands: avoid htop/vim/nano/less/top; use top -bn1, cat, sed, and pipe long output through | head -n 60.',
        '6. Use the fewest commands possible. If you can answer from knowledge alone, answer without a cmd block.',
        '7. Never propose destructive actions (deleting data, formatting, power-off) unless the user explicitly asked for exactly that — then warn in the same message.',
        '8. If a command fails, read the error, adapt, and try a corrected approach (max 2 retries per idea).',
        '',
        modeNote
    ].join('\n');
}

function aiTrimMessages() {
    const out = [{ role: 'system', content: aiSystemPrompt() }];
    const recent = aiState.messages.slice(-24);
    for (const m of recent) {
        out.push({ role: m.role, content: String(m.content).slice(0, 9000) });
    }
    return out;
}

async function aiChatCall() {
    const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ messages: aiTrimMessages() })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const msg = (data && data.error) || `AI request failed (${res.status})`;
        const err = new Error(msg);
        err.status = res.status;
        err.retryAfter = data && data.retryAfter ? data.retryAfter : null;
        err.hint = data && data.hint ? data.hint : null;
        throw err;
    }
    return typeof data.content === 'string' ? data.content : '';
}

/* Rate-limit aware call: on 429 (Groq TPM limits on free/on-demand tiers),
   wait it out once and retry instead of killing the task. */
let aiRetryDelayMs = 20000;

async function aiChatWithRetry(myGen) {
    for (let attempt = 0; attempt < 2; attempt++) {
        aiSetThinking(true);
        try {
            const content = await aiChatCall();
            aiSetThinking(false);
            return content;
        } catch (e) {
            aiSetThinking(false);
            if (aiState.gen !== myGen) return null;
            const rateLimited = e.status === 429 || /rate.?limit|OTPM|TPM|tokens per minute|too many requests/i.test(String(e.message || ''));
            if (rateLimited && attempt === 0 && !aiState.stopped) {
                const waitMs = e.retryAfter ? clamp(e.retryAfter * 1000, 2000, 90000) : aiRetryDelayMs;
                aiPush({ kind: 'sys', text: `Groq token limit reached — waiting ${Math.round(waitMs / 1000)}s, then retrying… (press Stop to abort)` });
                const waited = await sleepInterruptible(waitMs, myGen);
                if (!waited) return null;
                continue;
            }
            aiPush({ kind: 'sys', level: 'error', text: 'AI error: ' + (e.message || e) + (e.hint ? ' — ' + e.hint : (e.status === 502 ? ' — check Settings → AI Guide (key/model).' : '')) });
            return null;
        }
    }
    return null;
}

/* Sleep that can be aborted by Stop or by a conversation clear/new task */
async function sleepInterruptible(ms, myGen) {
    const step = 400;
    let waited = 0;
    while (waited < ms) {
        if (aiState.stopped || aiState.gen !== myGen) return false;
        const slice = Math.min(step, ms - waited);
        await sleepMs(slice);
        waited += slice;
    }
    return !aiState.stopped && aiState.gen === myGen;
}

function parseAiReply(content) {
    const commands = [];
    const re = /```(?:cmd|sh|shell|bash)[ \t]*\r?\n([\s\S]*?)```/gi;
    let m;
    while ((m = re.exec(content)) !== null) {
        const cmd = m[1].trim();
        if (cmd) commands.push(cmd);
    }
    const text = content.replace(re, '').trim();
    return { text, commands };
}

/* Run a command in the tab's shell and capture its output until the line goes idle */
async function captureCommandOutput(tab, cmd, opts, gen) {
    const o = opts || {};
    const timeoutMs = (o.timeoutMs || (parseInt(getSettings().aiTimeout, 10) || 20)) * (o.timeoutMs ? 1 : 1000);
    const idleMs = o.idleMs || 900;
    if (!tab || !tabs[tab.id]) return { output: '[error] target tab was closed', failed: true };
    if (tab.exited) return { output: '[error] the shell has exited — restart it first', failed: true };
    if (!sendInput(tab, cmd + '\n')) return { output: '[error] shell not connected', failed: true };

    const startedAt = Date.now();
    tab.capture = { buf: [], lastAt: Date.now(), bytes: 0 };
    tab.isCommandRunning = false;
    tab.hasNotified = true;
    tab.cmdLast = cmd;
    bumpInsight('cmds');
    addRecentCommand(String(cmd).split('\n')[0].slice(0, 500));

    let note = '';
    for (;;) {
        await sleepMs(120);
        if (!tabs[tab.id] || !tab.capture) { note = '[the tab was closed during execution]'; break; }
        if (gen !== undefined && aiState.gen !== gen) { note = '[task superseded]'; break; }
        const now = Date.now();
        const elapsed = now - startedAt;
        const idle = now - tab.capture.lastAt;
        if (aiState.stopped) {
            note = '[STOPPED by user — interrupt sent]';
            sendInput(tab, '\x03');
            await sleepMs(300);
            break;
        }
        if (elapsed >= timeoutMs) {
            const tailNow = stripAnsi(tab.capture.buf.join('').slice(-300)).split('\n').filter((l) => l.trim()).pop() || '';
            const looksPrompt = /(password|passwd|passphrase|username|login)\s*[:?]\s*$/i.test(tailNow) ||
                /\[(y|n|Y|N)[^\]]*\]\s*$/.test(tailNow) || /\(y\/n\)\s*$/i.test(tailNow) || /\?\s*$/.test(tailNow) || /:\s*$/.test(tailNow);
            note = looksPrompt
                ? `[timeout — the command appears to be WAITING FOR INTERACTIVE INPUT (last line: "${tailNow.slice(0, 60)}"). Answer it directly in the terminal, or re-run it non-interactively (e.g. -y, --no-input, env vars).]`
                : `[timeout after ${Math.round(timeoutMs / 1000)}s — the command may still be running in the terminal]`;
            break;
        }
        if (elapsed > 400 && idle >= idleMs && tab.capture.buf.length) break;
    }
    const raw = tab.capture ? tab.capture.buf.join('') : '';
    if (tabs[tab.id]) tab.capture = null;

    let text = stripAnsi(raw).replace(/\r/g, '');
    const firstLine = String(cmd).split('\n')[0];
    const echoIdx = text.indexOf(firstLine);
    if (echoIdx !== -1 && echoIdx < 80) text = text.slice(echoIdx + firstLine.length);
    text = text.replace(/^\n+/, '').replace(/\s+$/, '');
    if (text.length > 8000) {
        text = text.slice(0, 2600) + `\n…[trimmed ${text.length - 7600} chars]…\n` + text.slice(-5000);
    }
    if (!text.trim()) text = '(no output)';
    if (note) text += '\n' + note;
    return { output: text, note, failed: !!note && note.startsWith('[error') };
}

function aiPush(item) {
    const id = 'ai' + (aiState.uiSeq++);
    aiState.ui.push(Object.assign({ id }, item));
    if (typeof renderAiMessages === 'function') renderAiMessages();
    return id;
}
function aiUpdateItem(id, patch) {
    const item = aiState.ui.find((x) => x.id === id);
    if (item) Object.assign(item, patch);
    if (typeof renderAiMessages === 'function') renderAiMessages();
}
function aiSetThinking(on) {
    aiState.awaitingModel = on;
    if (typeof renderAiMessages === 'function') renderAiMessages();
    if (typeof syncAiBusyUI === 'function') syncAiBusyUI();
}

function aiAskApproval(cmd, dangerWhy) {
    return new Promise((resolve) => {
        const id = aiPush({ kind: 'cmd', cmd, state: 'pending', danger: dangerWhy || null });
        aiState.pending = { id, resolve };
        /* Visibility guarantee: an approval card must never sit unseen */
        if (typeof ensureAiDrawerVisible === 'function') ensureAiDrawerVisible();
        if (document.hidden) {
            notifyUser('AI needs your approval', cmd.slice(0, 140), { tag: 'ai-approval' });
        }
    });
}

function aiResolveDecision(action, overrideCmd) {
    const p = aiState.pending;
    if (!p) return;
    aiState.pending = null;
    const item = aiState.ui.find((x) => x.id === p.id);
    if (item) {
        if (action === 'run') { item.state = 'running'; if (overrideCmd) item.cmd = overrideCmd; }
        else if (action === 'skip') item.state = 'skipped';
    }
    if (typeof renderAiMessages === 'function') renderAiMessages();
    p.resolve({ action, cmd: overrideCmd || (item ? item.cmd : null), id: p.id });
}

async function aiSend(text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    if (aiState.busy) {
        showToastSafe('warn', 'Agent is busy', 'Press Stop to interrupt the current task first.');
        return;
    }
    if (isViewerSession || !token) {
        showToastSafe('info', 'Host only', 'The AI Guide is available to the host session.');
        return;
    }
    const tab = getActiveTab();
    if (!tab) { showToastSafe('error', 'No active terminal'); return; }

    const myGen = ++aiState.gen;
    aiState.busy = true;
    aiState.stopped = false;
    aiState.steps = 0;
    aiState.tabId = tab.id;
    if (typeof syncAiBusyUI === 'function') syncAiBusyUI();

    aiPush({ kind: 'user', text: clean });
    aiState.messages.push({ role: 'user', content: clean });
    playUI('click');

    try {
        await agentLoop(myGen);
    } catch (e) {
        if (aiState.gen === myGen) aiPush({ kind: 'sys', level: 'error', text: e.message || String(e) });
    } finally {
        if (aiState.gen === myGen) {
            aiState.busy = false;
            aiState.pending = null;
            if (typeof syncAiBusyUI === 'function') syncAiBusyUI();
        }
    }
}

async function agentLoop(myGen) {
    const stale = () => aiState.gen !== myGen;
    while (!aiState.stopped && aiState.steps < AI_MAX_STEPS) {
        const tab = tabs[aiState.tabId];
        if (!tab) { aiPush({ kind: 'sys', level: 'error', text: 'Target tab was closed — task aborted.' }); return; }

        const content = await aiChatWithRetry(myGen);
        if (content === null) return;
        if (stale() || aiState.stopped) return;

        if (!content || !content.trim()) { aiPush({ kind: 'sys', text: '(the model returned an empty response)' }); return; }
        aiState.messages.push({ role: 'assistant', content });
        const parsed = parseAiReply(content);
        if (parsed.text) {
            aiPush({ kind: 'assistant', text: parsed.text });
            if (getSettings().aiVoice) speakText(parsed.text);
        }
        if (!parsed.commands.length) {
            logActivity('success', 'AI Guide finished a task');
            return;
        }

        for (const cmd of parsed.commands) {
            if (aiState.stopped || stale()) return;
            const danger = aiIsDangerous(cmd);
            const mode = aiState.mode;
            let decision;

            if (mode === 'chat') {
                aiPush({ kind: 'cmd', cmd, state: 'suggestion', danger });
                return; // chat mode never loops
            } else if (mode === 'auto' && !danger) {
                const id = aiPush({ kind: 'cmd', cmd, state: 'running', danger: null, auto: true });
                if (!aiState.autoToasted) {
                    aiState.autoToasted = true;
                    showToastSafe('info', 'Auto mode', 'Commands run without per-step approval. Destructive patterns still ask. Switch modes any time.');
                }
                decision = { action: 'run', cmd, id };
            } else {
                decision = await aiAskApproval(cmd, danger);
                if (stale()) return;
                if (aiState.stopped) return;
                if (decision.action === 'run' && danger) {
                    logActivity('warn', `AI Guide ran a flagged command after confirmation: ${cmd.slice(0, 80)}`);
                }
            }

            if (decision.action === 'run') {
                const itemId = decision.id || aiPush({ kind: 'cmd', cmd: decision.cmd, state: 'running', danger });
                aiUpdateItem(itemId, { state: 'running', cmd: decision.cmd });
                const cap = await captureCommandOutput(tabs[aiState.tabId], decision.cmd, null, myGen);
                if (stale()) return;
                aiUpdateItem(itemId, { state: cap.failed ? 'error' : 'done', output: cap.output });
                if (aiState.stopped) { aiPush({ kind: 'sys', text: 'Agent stopped.' }); return; }
                aiState.messages.push({
                    role: 'user',
                    content: `Output of \`${String(decision.cmd).split('\n')[0]}\`:\n\`\`\`\n${cap.output}\n\`\`\``
                });
                aiState.steps++;
            } else {
                aiState.messages.push({ role: 'user', content: '[The user chose to SKIP that command. Propose an alternative approach or finish with a summary — no cmd block unless offering a different command.]' });
                aiState.steps++;
                break; // let the model re-plan
            }
        }
    }
    if (stale()) return;
    if (!aiState.stopped && aiState.steps >= AI_MAX_STEPS) {
        aiPush({ kind: 'sys', text: `Step limit reached (${AI_MAX_STEPS} commands). Send another message to continue the task.` });
    }
    if (aiState.stopped) aiPush({ kind: 'sys', text: 'Agent stopped.' });
}

function aiStop() {
    /* Stop means stop — silence the agent's voice too. The spoken reply of
       the run being stopped (and any TTS still rendering for it) would
       otherwise keep talking over the stopped agent. */
    stopSpeaking();
    if (!aiState.busy) return;
    aiState.stopped = true;
    if (aiState.pending) aiResolveDecision('skip');
    const tab = tabs[aiState.tabId];
    if (tab && tab.capture) { try { sendInput(tab, '\x03'); } catch (e) {} }
}

function aiClearConversation() {
    if (aiState.busy) aiStop();
    aiState.gen++;                 // invalidate any unwinding loop
    aiState.busy = false;
    aiState.pending = null;
    aiState.messages = [];
    aiState.ui = [];
    aiState.steps = 0;
    aiState.tabId = null;
    aiState.awaitingModel = false;
    if (typeof syncAiBusyUI === 'function') syncAiBusyUI();
    if (typeof renderAiMessages === 'function') renderAiMessages();
}

/* Run a chat-mode suggestion once (no agent loop) */
async function aiRunSuggestion(itemId) {
    const item = aiState.ui.find((x) => x.id === itemId);
    if (!item || item.state !== 'suggestion') return;
    const tab = getActiveTab();
    if (!tab) { showToastSafe('error', 'No active terminal'); return; }
    if (item.danger) {
        const ok = typeof showConfirm === 'function'
            ? await showConfirm({ title: 'Dangerous command', message: `This command was flagged (${item.danger}). Run it anyway?\n\n${item.cmd}`, okLabel: 'Run anyway' })
            : false;
        if (!ok) return;
    }
    aiState.tabId = tab.id;
    aiUpdateItem(itemId, { state: 'running' });
    const cap = await captureCommandOutput(tab, item.cmd, null, aiState.gen);
    aiUpdateItem(itemId, { state: cap.failed ? 'error' : 'done', output: cap.output });
}

/* ─────────────── Activity log & insights ─────────────── */

function getActivityLog() {
    const a = sessGet(K.activity, []);
    return Array.isArray(a) ? a : [];
}

function logActivity(kind, text) {
    try {
        const log = getActivityLog();
        log.unshift({ t: Date.now(), kind, text: String(text).slice(0, 220) });
        if (log.length > 200) log.length = 200;
        sessSet(K.activity, log);
        if (typeof onActivityLogged === 'function') onActivityLogged();
    } catch (e) {}
}

function getInsights() {
    const i = sessGet(K.insights, null);
    return (i && typeof i === 'object') ? i : { cmds: 0, triggers: 0, longestMs: 0, longestCmd: '' };
}
function saveInsights(i) { sessSet(K.insights, i); }
function bumpInsight(kind, value, cmd) {
    const i = getInsights();
    if (kind === 'cmds') i.cmds = (i.cmds || 0) + 1;
    else if (kind === 'triggers') i.triggers = (i.triggers || 0) + 1;
    else if (kind === 'longest') {
        if (value > (i.longestMs || 0)) { i.longestMs = value; i.longestCmd = (cmd || '').slice(0, 80); }
    }
    saveInsights(i);
    if (typeof renderInsights === 'function') renderInsights();
}

function sendResize(tab) {
    if (!tab || !tab.ws || tab.ws.readyState !== WebSocket.OPEN) return;
    if (!tab.term.cols || tab.term.cols < 2) return;
    try {
        tab.ws.send(JSON.stringify({ type: 'resize', cols: tab.term.cols, rows: tab.term.rows }));
    } catch (e) {}
}

function fitTab(tab) {
    try {
        if (tab && tab.termEl && tab.termEl.clientWidth > 20 && tab.termEl.clientHeight > 20) {
            tab.fitAddon.fit();
        }
    } catch (e) {}
}

function fitAllTabs() {
    for (const tab of Object.values(tabs)) fitTab(tab);
    if (viewerTerm && viewerFitAddon) {
        try { viewerFitAddon.fit(); } catch (e) {}
    }
}

function setConnUI(state) {
    const dot = $('conn-dot');
    const txt = $('conn-text');
    if (dot) {
        dot.classList.remove('conn-ok', 'conn-bad', 'conn-wait');
        dot.classList.add(state === 'ok' ? 'conn-ok' : state === 'bad' ? 'conn-bad' : 'conn-wait');
    }
    if (txt) txt.textContent = state === 'ok' ? 'connected' : state === 'bad' ? 'reconnecting…' : 'idle';
}

function startLatencyPinger() {
    setInterval(() => {
        if (document.hidden || isViewerSession) return;
        const tab = getActiveTab();
        if (!tab || !tab.ws || tab.ws.readyState !== WebSocket.OPEN) return;
        try { tab.ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {}
    }, 5000);
}

async function refreshShareStatuses() {
    if (!token || isViewerSession) return;
    for (const id of Object.keys(tabs)) {
        try {
            const st = await api(`/api/share/status?tabId=${encodeURIComponent(id)}`);
            tabShareStatus[id] = st;
        } catch (e) { /* ignore */ }
    }
    updateViewersChip();
}

function updatePingChip(ms) {
    const chip = $('ping-chip');
    if (chip) chip.textContent = ms != null ? `${ms} ms` : '—';
}

function updateViewersChip() {
    const chip = $('viewers-chip');
    const count = $('viewers-chip-count');
    if (!chip || !count) return;
    const st = activeTabId ? tabShareStatus[activeTabId] : null;
    if (st && st.isShared) {
        chip.classList.remove('hidden');
        count.textContent = st.viewerCount || 0;
    } else {
        chip.classList.add('hidden');
    }
}

function handlePresenceUpdate(tabId, count) {
    const prev = tabShareStatus[tabId] ? (tabShareStatus[tabId].viewerCount || 0) : 0;
    if (!tabShareStatus[tabId]) tabShareStatus[tabId] = {};
    tabShareStatus[tabId].viewerCount = count;
    if (count > prev) {
        logActivity('success', `${count - prev} viewer${count - prev > 1 ? 's' : ''} joined "${(tabs[tabId] && tabs[tabId].title) || tabId}"`);
        if (typeof addChatSystemMessage === 'function' && tabId === activeTabId) addChatSystemMessage('A viewer joined the session');
    } else if (count < prev && prev > 0) {
        logActivity('info', `Viewer left "${(tabs[tabId] && tabs[tabId].title) || tabId}" (${count} watching)`);
    }
    if (tabId === activeTabId) updateViewersChip();
    if (typeof onPresenceForUI === 'function') onPresenceForUI(tabId, count);
}

/* ─────────────── Terminal operations ─────────────── */

function clearTerminal() {
    const tab = getActiveTab();
    if (!tab) return;
    try { tab.term.clear(); } catch (e) {}
    sendInput(tab, '\x0c');
}

function changeFontSize(delta) {
    changeFontSizeTo(defaultFontSize() + delta);
}

function changeFontSizeTo(size) {
    const s = clamp(Math.round(size), 8, 28);
    saveSettings({ fontSize: s });
    for (const tab of Object.values(tabs)) {
        try { tab.term.options.fontSize = s; } catch (e) {}
        fitTab(tab);
    }
    if (viewerTerm) {
        try { viewerTerm.options.fontSize = s; } catch (e) {}
        if (viewerFitAddon) fitTab({ termEl: viewerTerm.element ? viewerTerm.element.parentElement : null, fitAddon: viewerFitAddon });
    }
    const active = getActiveTab();
    if (active) {
        try { active.term.scrollToBottom(); } catch (e) {}
        sendResize(active);
    }
    if (typeof onFontSizeChanged === 'function') onFontSizeChanged(s);
}

function applySettingsAll() {
    const s = getSettings();
    document.body.classList.toggle('reduce-motion', !!s.reducedMotion);
    for (const tab of Object.values(tabs)) {
        try {
            tab.term.options.fontFamily = s.fontFamily;
            tab.term.options.cursorStyle = s.cursorStyle;
            tab.term.options.cursorBlink = !!s.cursorBlink;
            tab.term.options.fontSize = defaultFontSize();
        } catch (e) {}
        fitTab(tab);
    }
    if (viewerTerm) {
        try {
            viewerTerm.options.fontFamily = s.fontFamily;
            viewerTerm.options.cursorStyle = s.cursorStyle;
            viewerTerm.options.cursorBlink = !!s.cursorBlink;
            viewerTerm.options.fontSize = defaultFontSize();
        } catch (e) {}
    }
    if (typeof refreshAuroraMotion === 'function') refreshAuroraMotion();
}

function toggleFullScreen() {
    try {
        if (!document.fullscreenElement) {
            const p = document.documentElement.requestFullscreen();
            if (p && p.catch) p.catch(() => {});
        } else if (document.exitFullscreen) {
            const p = document.exitFullscreen();
            if (p && p.catch) p.catch(() => {});
        }
    } catch (e) {}
}

function exportLog() {
    let term = null;
    let title = 'terminal';
    if (isViewerSession && viewerTerm) {
        term = viewerTerm;
        title = 'spectator';
    } else {
        const tab = getActiveTab();
        if (!tab) { showToastSafe('error', 'No active terminal'); return; }
        term = tab.term;
        title = tab.title;
    }
    try {
        const buf = term.buffer.active;
        const lines = [];
        for (let i = 0; i < buf.length; i++) {
            const line = buf.getLine(i);
            lines.push(line ? line.translateToString(true) : '');
        }
        let text = lines.join('\n').replace(/\n{3,}/g, '\n\n');
        if (!text.trim()) { showToastSafe('warn', 'Nothing to export', 'The scrollback buffer is empty.'); return; }
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const safeTitle = title.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'terminal';
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const a = el('a');
        a.href = URL.createObjectURL(blob);
        a.download = `garuda-${safeTitle}-${stamp}.log`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
        showToastSafe('success', 'Log exported', `${a.download}`);
        playUI('success');
    } catch (e) {
        showToastSafe('error', 'Export failed', e.message || 'Unknown error');
    }
}

/* ─────────────── Search ─────────────── */

let searchCase = false;
let searchRegex = false;

function openSearch() {
    const bar = $('search-bar');
    const input = $('search-input');
    if (!bar || !input) return;
    bar.classList.add('active');
    input.focus();
    input.select();
    runSearch();
}
function getSearchTarget() {
    if (isViewerSession && viewerTerm && viewerSearchAddon) {
        return { term: viewerTerm, searchAddon: viewerSearchAddon };
    }
    return getActiveTab();
}

function closeSearch() {
    const bar = $('search-bar');
    if (bar) bar.classList.remove('active');
    const target = getSearchTarget();
    if (target) {
        try { target.searchAddon.clearDecorations && target.searchAddon.clearDecorations(); } catch (e) {}
        try { target.term.focus(); } catch (e) {}
    }
    const count = $('search-count');
    if (count) count.textContent = '';
}
function searchOptions() {
    return {
        caseSensitive: searchCase,
        regex: searchRegex,
        decorations: {
            matchBackground: '#f6a60955',
            matchBorder: '#f6a609',
            matchOverviewRuler: '#f6a609',
            activeMatchBackground: '#ff556688',
            activeMatchBorder: '#ff5566',
            activeMatchColorOverviewRuler: '#ff5566'
        }
    };
}
function runSearch(next) {
    const tab = getSearchTarget();
    const input = $('search-input');
    if (!tab || !input) return;
    const q = input.value;
    const count = $('search-count');
    if (!q) { if (count) count.textContent = ''; return; }
    try {
        let ok;
        if (next === false) ok = tab.searchAddon.findPrevious(q, searchOptions());
        else ok = tab.searchAddon.findNext(q, searchOptions());
        if (count && !tab.searchAddon._resultsBound) {
            tab.searchAddon._resultsBound = true;
            try {
                tab.searchAddon.onDidChangeResults && tab.searchAddon.onDidChangeResults((ev) => {
                    const c = $('search-count');
                    if (!c) return;
                    if (!ev || ev.resultCount === undefined) { c.textContent = ''; return; }
                    c.textContent = ev.resultCount === 0 ? 'no results'
                        : ev.resultCount === -1 ? 'many'
                        : `${ev.resultIndex != null ? ev.resultIndex + 1 : '?'}/${ev.resultCount}`;
                });
            } catch (e) {}
        }
        if (count && ok === false) count.textContent = 'no results';
    } catch (e) {
        if (count) count.textContent = '';
    }
}
function findNext() { runSearch(true); }
function findPrev() { runSearch(false); }
function toggleSearchCase() {
    searchCase = !searchCase;
    const b = $('search-case-btn');
    if (b) b.classList.toggle('on', searchCase);
    runSearch();
}
function toggleSearchRegex() {
    searchRegex = !searchRegex;
    const b = $('search-regex-btn');
    if (b) b.classList.toggle('on', searchRegex);
    runSearch();
}

/* ─────────────── Alt-lock ─────────────── */

function toggleAltLock(force) {
    isAltLocked = (typeof force === 'boolean') ? force : !isAltLocked;
    const btn = $('alt-lock-btn');
    const mob = $('mobile-alt-lock');
    if (btn) btn.classList.toggle('active-lock', isAltLocked);
    if (mob) mob.classList.toggle('active-lock', isAltLocked);

    const textareas = $$('.xterm-helper-textarea');
    if (isAltLocked) {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        textareas.forEach((ta) => {
            ta.setAttribute('inputmode', 'none');
            ta.setAttribute('readonly', 'readonly');
            ta.blur();
        });
        showToastSafe('info', 'Alt-Lock ON', 'Select any filename in the output to download it.');
    } else {
        textareas.forEach((ta) => {
            ta.removeAttribute('inputmode');
            ta.removeAttribute('readonly');
        });
    }
    buzz(14);
}

/* ─────────────── Uploads ─────────────── */

function triggerUpload() {
    if (!token) { showToastSafe('info', 'Host only', 'Spectators cannot upload files to this session.'); return; }
    pendingUploadDest = null;
    const input = $('file-upload');
    if (input) input.click();
}

function triggerUploadToFiles() {
    pendingUploadDest = 'files';
    const input = $('file-upload');
    if (input) input.click();
}

function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const dest = pendingUploadDest;
    pendingUploadDest = null;

    const formData = new FormData();
    if (activeTabId) formData.append('tabId', activeTabId);
    if (dest === 'files') {
        const cwd = typeof getFilesCurrentPath === 'function' ? getFilesCurrentPath() : null;
        if (cwd) formData.append('dest', cwd);
    }
    files.forEach((f) => formData.append('file', f));

    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const label = files.length === 1 ? files[0].name : `${files.length} files`;
    showToastSafe('info', 'Uploading…', `${label} (${fmtBytes(totalBytes)})`);

    const xhr = new XMLHttpRequest();
    let lastToastAt = 0;
    xhr.upload.addEventListener('progress', (e) => {
        if (!e.lengthComputable) return;
        const now = Date.now();
        if (now - lastToastAt < 350 && e.loaded < e.total) return;
        lastToastAt = now;
        const pct = Math.round((e.loaded / e.total) * 100);
        if (typeof showToast === 'function') {
            showToast({ id: 'upload-progress', type: 'info', title: `Uploading… ${pct}%`, text: label, duration: 1500, silent: true });
        }
    });
    xhr.onload = () => {
        let body = null;
        try { body = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200 && body && body.success) {
            const names = (body.saved || []).join(', ') || label;
            showToast({ id: 'upload-progress', type: 'success', title: 'Upload complete', text: `${names} → ${body.folder || 'folder'}` });
            playUI('success');
            if (dest === 'files' && typeof loadFiles === 'function') loadFiles();
        } else {
            const msg = (body && (body.error || (body.errors || []).join('; '))) || `Server responded ${xhr.status}`;
            showToast({ id: 'upload-progress', type: 'error', title: 'Upload failed', text: msg });
            playUI('error');
        }
    };
    xhr.onerror = () => {
        showToast({ id: 'upload-progress', type: 'error', title: 'Upload failed', text: 'Network error' });
        playUI('error');
    };
    xhr.open('POST', '/upload', true);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.send(formData);

    const input = $('file-upload');
    if (input) input.value = '';
}

/* ─────────────── Smooth scrolling engine ─────────────── */

function getScrollTargetTerm() {
    if (isViewerSession && viewerTerm) return viewerTerm;
    const tab = getActiveTab();
    return tab ? tab.term : null;
}

function startScroll(direction) {
    const term = getScrollTargetTerm();
    if (!term) return;
    const speed = clamp(parseInt(getSettings().scrollSpeed, 10) || 4, 1, 12);
    const delta = direction === 'up' ? -speed : speed;
    try { term.scrollLines(delta); } catch (e) {}
    stopScroll();
    scrollInterval = setInterval(() => {
        const t = getScrollTargetTerm();
        if (!t) { stopScroll(); return; }
        try { t.scrollLines(delta); } catch (e) { stopScroll(); }
    }, 60);
}

function stopScroll() {
    if (scrollInterval) { clearInterval(scrollInterval); scrollInterval = null; }
}

/* ─────────────── Mobile key transmitter ─────────────── */

function getInputChannel() {
    if (isViewerSession) {
        if (viewerMode !== 'interactive' || !viewerWs || viewerWs.readyState !== WebSocket.OPEN) return null;
        return { ws: viewerWs, term: viewerTerm, exited: false };
    }
    const tab = getActiveTab();
    if (!tab || tab.exited) return null;
    return tab;
}

function transmit(seq) {
    const ch = getInputChannel();
    if (!ch) {
        if (!isViewerSession) showToastSafe('warn', 'Cannot send key', 'No live shell connected.');
        return false;
    }
    if (ch.ws.readyState !== WebSocket.OPEN) return false;
    try {
        ch.ws.send(JSON.stringify({ type: 'input', data: seq }));
        if (ch.term) ch.term.scrollToBottom();
        return true;
    } catch (e) { return false; }
}

const CTRL_CODES = {
    'ctrl-a': '\x01', 'ctrl-b': '\x02', 'ctrl-c': '\x03', 'ctrl-d': '\x04',
    'ctrl-e': '\x05', 'ctrl-f': '\x06', 'ctrl-g': '\x07', 'ctrl-h': '\x08',
    'ctrl-k': '\x0b', 'ctrl-l': '\x0c', 'ctrl-n': '\x0e', 'ctrl-p': '\x10',
    'ctrl-r': '\x12', 'ctrl-t': '\x14', 'ctrl-u': '\x15', 'ctrl-w': '\x17',
    'ctrl-z': '\x1a', 'ctrl-_': '\x1f'
};

function sendSpecialKey(key) {
    switch (key) {
        case 'esc': return transmit('\x1b');
        case 'tab': return transmit('\x09');
        case 'up': return transmit('\x1b[A');
        case 'down': return transmit('\x1b[B');
        case 'right': return transmit('\x1b[C');
        case 'left': return transmit('\x1b[D');
        case 'home': return transmit('\x1b[H');
        case 'end': return transmit('\x1b[F');
        case 'pgup': return transmit('\x1b[5~');
        case 'pgdn': return transmit('\x1b[6~');
        case 'del': return transmit('\x1b[3~');
        case 'enter': return transmit('\r');
        default: {
            if (CTRL_CODES[key]) {
                if (key === 'ctrl-c') {
                    const tab = getActiveTab();
                    if (tab) {
                        tab.isCommandRunning = false;
                        tab.hasNotified = true;
                        tab.cmdBuffer = '';
                        if (tab.idleTimer) clearTimeout(tab.idleTimer);
                    }
                }
                return transmit(CTRL_CODES[key]);
            }
            return false;
        }
    }
}

function sendChar(c) {
    if (ctrlSticky && /^[a-zA-Z]$/.test(c)) {
        const code = c.toLowerCase().charCodeAt(0) - 96;
        setCtrlSticky(false);
        return transmit(String.fromCharCode(code));
    }
    return transmit(c);
}

function setCtrlSticky(on) {
    ctrlSticky = !!on;
    if (typeof syncCtrlStickyUI === 'function') syncCtrlStickyUI(ctrlSticky);
}

/* ─────────────── Viewport & resize engine ─────────────── */

const debouncedFit = debounce(() => {
    fitAllTabs();
    if (splitState.mode) {
        for (const id of splitState.tabs) {
            if (id && tabs[id]) sendResize(tabs[id]);
        }
    } else {
        const active = getActiveTab();
        if (active) {
            try { active.term.scrollToBottom(); } catch (e) {}
            sendResize(active);
        }
    }
    if (isViewerSession && viewerWs && viewerWs.readyState === WebSocket.OPEN && viewerMode === 'interactive') {
        try {
            viewerWs.send(JSON.stringify({ type: 'resize', cols: viewerTerm.cols, rows: viewerTerm.rows }));
        } catch (e) {}
    }
}, 120);

function initViewportEngine() {
    syncViewport();
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', syncViewport);
        window.visualViewport.addEventListener('scroll', syncViewport);
    }
    window.addEventListener('resize', () => {
        syncViewport();
        debouncedFit();
        if (splitState.mode && window.innerWidth < 769) closeSplit();
    });
    window.addEventListener('orientationchange', () => setTimeout(() => { syncViewport(); debouncedFit(); }, 250));
}

function syncViewport() {
    try {
        const vv = window.visualViewport;
        const h = vv ? Math.round(vv.height) : window.innerHeight;
        if (h > 0) document.documentElement.style.setProperty('--app-height', h + 'px');
    } catch (e) {}
}

/* ─────────────── Viewer / spectator mode ─────────────── */

async function checkAndInitViewerSession() {
    const params = new URLSearchParams(window.location.search);
    const shareTokenParam = params.get('share');
    if (!shareTokenParam) return false;

    isViewerSession = true;
    const lock = $('lockscreen');
    const appEl = $('app');
    if (lock) lock.classList.add('hidden');
    if (appEl) appEl.classList.remove('hidden');
    if (typeof refreshAuroraMotion === 'function') refreshAuroraMotion(); // stop lockscreen ambience
    const toolbar = $('main-toolbar');
    if (toolbar) toolbar.classList.add('hidden');
    const topbar = $('viewer-topbar');
    if (topbar) topbar.classList.remove('hidden');

    let info;
    try {
        const res = await fetch(`/api/share/info/${encodeURIComponent(shareTokenParam)}`);
        if (!res.ok) throw new Error('invalid');
        info = await res.json();
    } catch (e) {
        renderInvalidSharePage();
        return true;
    }

    viewerMode = info.mode === 'interactive' ? 'interactive' : 'readonly';

    const titleEl = $('viewer-tab-title');
    if (titleEl) titleEl.textContent = info.tabId.replace(/^gk_/, 'session ').replace('_', ' ');
    const badge = $('viewer-mode-badge');
    if (badge) {
        badge.textContent = viewerMode === 'interactive' ? 'Interactive pair' : 'Read-only spectator';
        badge.style.color = viewerMode === 'interactive' ? 'var(--ok)' : 'var(--accent)';
        badge.style.borderColor = viewerMode === 'interactive' ? 'var(--ok)' : 'var(--accent)';
    }
    const countEl = $('viewer-connected-count');
    if (countEl) countEl.textContent = info.viewerCount || 1;

    /* Theme selector for viewers */
    const sel = $('viewer-theme-select');
    if (sel) {
        sel.innerHTML = '';
        Object.keys(BUILTIN_THEMES).forEach((id) => {
            const opt = el('option');
            opt.value = id;
            opt.textContent = BUILTIN_THEMES[id].name;
            sel.appendChild(opt);
        });
        sel.value = getActiveThemeId();
        sel.addEventListener('change', () => applyTheme(sel.value));
    }

    /* Viewer chrome: hide host-only furniture */
    const kbDeck = $('mobile-keyboard');
    const kbHandle = $('kb-expand-handle');
    const statusBar = $('status-bar');
    if (viewerMode !== 'interactive') {
        if (kbDeck) kbDeck.classList.add('hidden');
        if (kbHandle) kbHandle.classList.add('hidden');
    }
    if (statusBar) {
        ['cpu-chip', 'mem-chip'].forEach((id) => { const n = $(id); if (n) n.classList.add('hidden'); });
    }

    /* Spectator terminal */
    const wrapper = $('terminals-wrapper');
    const termEl = el('div', 'terminal-container active');
    if (wrapper) wrapper.appendChild(termEl);

    viewerTerm = new Terminal(Object.assign(termOptions(), {  // eslint-disable-line no-undef
        cursorBlink: viewerMode === 'interactive',
        disableStdin: viewerMode !== 'interactive'
    }));
    viewerFitAddon = new FitAddon.FitAddon(); // eslint-disable-line no-undef
    viewerTerm.loadAddon(viewerFitAddon);
    try {
        viewerSearchAddon = new SearchAddon.SearchAddon(); // eslint-disable-line no-undef
        viewerTerm.loadAddon(viewerSearchAddon);
    } catch (e) { viewerSearchAddon = null; }
    try { viewerTerm.loadAddon(new WebLinksAddon.WebLinksAddon()); } catch (e) {} // eslint-disable-line no-undef
    viewerTerm.open(termEl);
    applyTheme(getActiveThemeId());

    requestAnimationFrame(() => { try { viewerFitAddon.fit(); } catch (e) {} });

    /* Viewer websocket */
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    connectViewerWs(proto, shareTokenParam);

    if (viewerMode === 'interactive') {
        viewerTerm.onData((data) => {
            playMechanicalClick(data === '\r' || data === ' ' || data === '\x7f');
            if (viewerWs && viewerWs.readyState === WebSocket.OPEN) {
                try { viewerWs.send(JSON.stringify({ type: 'input', data })); } catch (e) {}
            }
        });
    }

    if (typeof startClock === 'function') startClock();
    syncViewport();
    window.addEventListener('resize', debouncedFit);
    return true;
}

function connectViewerWs(proto, shareTokenParam) {
    let ws;
    try {
        ws = new WebSocket(`${proto}//${window.location.host}/?shareToken=${encodeURIComponent(shareTokenParam)}`);
    } catch (e) { return; }
    viewerWs = ws;

    ws.onopen = () => {
        setConnUI('ok');
        setTimeout(() => {
            try {
                viewerFitAddon.fit();
                if (viewerMode === 'interactive') {
                    ws.send(JSON.stringify({ type: 'resize', cols: viewerTerm.cols, rows: viewerTerm.rows }));
                }
            } catch (e) {}
        }, 80);
    };

    ws.onmessage = (event) => {
        const data = event.data;
        if (typeof data === 'string' && data.charCodeAt(0) === 0) {
            let ctrl = null;
            try { ctrl = JSON.parse(data.slice(1)); } catch (e) {}
            if (ctrl && ctrl.type) {
                switch (ctrl.type) {
                    case 'init':
                        try { viewerTerm.reset(); } catch (e) {}
                        if (ctrl.history) viewerTerm.write(ctrl.history);
                        if (!ctrl.alive) viewerTerm.write('\r\n\x1b[91m── the host shell has exited ──\x1b[0m\r\n');
                        viewerClientId = ctrl.clientId || null;
                        setConnUI('ok');
                        break;
                    case 'chat': {
                        if (typeof addChatMessage === 'function') {
                            addChatMessage({
                                from: ctrl.from, text: ctrl.text, t: ctrl.t,
                                self: ctrl.fromId && ctrl.fromId === viewerClientId,
                                tabId: 'viewer'
                            });
                        }
                        break;
                    }
                    case 'presence': {
                        const c = $('viewer-connected-count');
                        if (c) c.textContent = ctrl.viewerCount || 0;
                        break;
                    }
                    case 'share_revoked':
                        viewerRevoked = true;
                        try { viewerTerm.write('\r\n\x1b[31;1m[' + (ctrl.message || 'Share session ended') + ']\x1b[0m\r\n'); } catch (e) {}
                        showToastSafe('warn', 'Share ended', ctrl.message || 'The host ended this session.');
                        setConnUI('bad');
                        break;
                    case 'exit':
                        try { viewerTerm.write('\r\n\x1b[91m── host shell exited ──\x1b[0m\r\n'); } catch (e) {}
                        break;
                    case 'restarted':
                        try { viewerTerm.write('\r\n\x1b[96m── host shell restarted ──\x1b[0m\r\n'); } catch (e) {}
                        break;
                    case 'error':
                        showToastSafe('error', 'Server', ctrl.message || 'Unknown error');
                        break;
                    default: break;
                }
                return;
            }
        }
        try { viewerTerm.write(data); } catch (e) {}
    };

    ws.onclose = () => {
        if (viewerRevoked) return;
        setConnUI('bad');
        try { viewerTerm.write('\r\n\x1b[33m[disconnected — retrying…]\x1b[0m\r\n'); } catch (e) {}
        setTimeout(() => {
            if (!viewerRevoked) connectViewerWs(proto, shareTokenParam);
        }, 4000);
    };
}

function renderInvalidSharePage() {
    document.body.innerHTML = `
    <div style="display:flex;height:100dvh;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 30%, #141922, #07090d);color:#eff0f1;font-family:Inter,sans-serif;text-align:center;padding:24px;gap:10px">
        <div style="font-size:44px">🔗</div>
        <h2 style="color:#ff6b85;font-size:22px;font-weight:800;letter-spacing:.4px">Invalid or expired share link</h2>
        <p style="color:#9aa4b2;max-width:420px;line-height:1.6;font-size:14px">This live session does not exist any more, or the host ended it. Ask them for a fresh link.</p>
        <a href="/" style="margin-top:14px;color:#3daee9;text-decoration:none;font-weight:700;border:1px solid rgba(61,174,233,.4);padding:10px 20px;border-radius:10px;background:rgba(61,174,233,.08)">← Open Garuda Konsole</a>
    </div>`;
}

/* ─────────────── Global keyboard shortcuts ─────────────── */

function closeTopmostOverlay() {
    if (typeof hideContextMenu === 'function' && hideContextMenu()) return true;
    if (typeof closePaletteIfOpen === 'function' && closePaletteIfOpen()) return true;
    const search = $('search-bar');
    if (search && search.classList.contains('active')) { closeSearch(); return true; }
    if (typeof closeMobileMoreIfOpen === 'function' && closeMobileMoreIfOpen()) return true;
    const modalIds = ['preview-modal', 'confirm-modal', 'prompt-modal', 'replay-modal', 'profile-modal', 'triggers-modal', 'mobile-more-modal', 'macros-modal', 'share-modal', 'help-modal', 'settings-modal'];
    for (const id of modalIds) {
        const m = $(id);
        if (m && !m.classList.contains('hidden')) {
            m.classList.add('hidden');
            if (id === 'prompt-modal' && typeof resolvePromptCancel === 'function') resolvePromptCancel();
            if (id === 'confirm-modal' && typeof resolveConfirmCancel === 'function') resolveConfirmCancel();
            return true;
        }
    }
    if (typeof closeDrawerIfOpen === 'function' && closeDrawerIfOpen()) return true;
    return false;
}

function initGlobalShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (typeof isBootActive === 'function' && isBootActive()) {
            if (typeof skipBoot === 'function') skipBoot();
            return;
        }
        const target = e.target;
        const tag = (target && target.tagName) || '';
        const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable);
        const inTerm = !!(target && target.closest && target.closest('.xterm'));

        if (e.key === 'Escape') {
            if (inField && tag !== 'INPUT') { target.blur && target.blur(); return; }
            if (closeTopmostOverlay()) { e.preventDefault(); e.stopPropagation(); return; }
            if (ctrlSticky) { setCtrlSticky(false); }
            return;
        }

        if (e.ctrlKey && e.shiftKey && e.code === 'KeyP') {
            e.preventDefault(); e.stopPropagation();
            if (typeof togglePalette === 'function') togglePalette();
            return;
        }
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyF') {
            e.preventDefault(); e.stopPropagation();
            openSearch();
            return;
        }
        if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyK' && !inTerm) {
            e.preventDefault(); e.stopPropagation();
            if (typeof togglePalette === 'function') togglePalette();
            return;
        }
        if (e.ctrlKey && !e.shiftKey && e.code === 'Comma' && !inTerm) {
            e.preventDefault(); e.stopPropagation();
            if (typeof openSettings === 'function') openSettings();
            return;
        }
        if (e.altKey && !e.ctrlKey && !e.metaKey && !inField && !inTerm) {
            if (e.code === 'KeyT') { e.preventDefault(); e.stopPropagation(); createNewTab(); return; }
            if (e.code === 'KeyW') { e.preventDefault(); e.stopPropagation(); if (activeTabId) closeTab(activeTabId); return; }
            if (e.code === 'KeyS') { e.preventDefault(); e.stopPropagation(); splitCycle(); return; }
            if (e.code === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); cycleTab(1); return; }
            if (e.code === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); cycleTab(-1); return; }
        }
        if (e.ctrlKey && e.altKey && splitState.mode) {
            if (e.code === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); setSplitFocus(1); return; }
            if (e.code === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); setSplitFocus(0); return; }
        }
    }, true);
}

/* ─────────────── Boot orchestration ─────────────── */

async function init() {
    try {
        if (typeof initAurora === 'function') initAurora();
        if (typeof wireUIEvents === 'function') wireUIEvents();
        initGlobalShortcuts();
        wireCoreEvents();
        applyEarlyTheme();

        const asViewer = await checkAndInitViewerSession();
        if (typeof registerSW === 'function') registerSW();
        if (asViewer) return;
        handleDeepLinks();

        const auto = await tryAutoLogin();
        if (auto) {
            await enterApp(true);
        } else {
            const lock = $('lockscreen');
            if (lock) lock.classList.remove('hidden');
            if (typeof refreshAuroraMotion === 'function') refreshAuroraMotion(); // lockscreen visible → ambience on
            const input = $('password-input');
            if (input) setTimeout(() => input.focus(), 300);
        }
    } catch (err) {
        console.error('Init failed:', err);
        showToastSafe('error', 'Startup error', String(err && err.message || err));
    }
}

function applyEarlyTheme() {
    /* Paint saved theme before login so the lockscreen matches */
    const s = getSettings();
    document.body.classList.toggle('reduce-motion', !!s.reducedMotion);
    const themeData = getThemeData(s.themeId);
    applyThemeToCssVars(themeData);
}

function handleDeepLinks() {
    try {
        const action = new URLSearchParams(window.location.search).get('action');
        if (action === 'newtab') setTimeout(() => createNewTab(), 600);
        else if (action === 'ai' && typeof toggleAi === 'function') setTimeout(() => toggleAi(), 600);
    } catch (e) {}
}

function wireCoreEvents() {
    const pwInput = $('password-input');
    if (pwInput) {
        pwInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); doLogin(); }
        });
    }
    const fileInput = $('file-upload');
    if (fileInput) {
        fileInput.addEventListener('change', () => uploadFiles(fileInput.files));
    }
    const searchInput = $('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) findPrev(); else findNext(); }
            else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
        });
        searchInput.addEventListener('input', debounce(() => runSearch(), 250));
    }
    document.addEventListener('fullscreenchange', () => {
        setTimeout(debouncedFit, 100);
    });
}

document.addEventListener('DOMContentLoaded', init);
