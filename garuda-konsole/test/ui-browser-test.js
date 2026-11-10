/* Real Chromium regression checks for control appearance and stylesheet updates.
 * npm run test:browser  (first run: npx playwright install chromium)
 * CHROMIUM_PATH may point to a system Chromium. No Groq key, shell, or CDN
 * access is needed: this serves the real HTML/CSS and loads app.js/ui.js after
 * DOMContentLoaded, exercising their menu/theme functions without starting the
 * terminal backend. This complements, not replaces, the full frontend suite.
 * UI_TEST_APP can point at an older checkout for red/green verification.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require('playwright');

const APP = path.resolve(process.env.UI_TEST_APP || path.join(__dirname, '..'));
const PUB = path.join(APP, 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*https:\/\/[^>]*>/gi, '');
const cssSource = fs.readFileSync(path.join(PUB, 'style.css'), 'utf8');
const swSource = fs.readFileSync(path.join(PUB, 'sw.js'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
let passed = 0, failed = 0, failStylesheet = false;
function check(name, condition, details = '') {
    if (condition) { passed++; console.log('  PASS ' + name); }
    else { failed++; console.error('  FAIL ' + name + (details ? ': ' + details : '')); }
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/__controls__') {
        res.setHeader('Content-Type', 'text/html'); res.end(html); return;
    }
    if (url.pathname === '/__cache__') {
        res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Cache regression test</title>'); return;
    }
    if (failStylesheet && url.pathname === '/style.css') { res.writeHead(503); res.end('temporary test outage'); return; }
    const file = path.resolve(PUB, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(PUB + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); res.end('not found'); return;
    }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
});

async function bootControls(browser, base, mobile = false, withoutColorMix = false) {
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1100, height: 800 },
        isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block'
    });
    await context.route('https://**/*', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    if (withoutColorMix) {
        await context.route('**/style.css*', route => route.fulfill({
            contentType: 'text/css',
            // Model unsupported declarations, not just CSS.supports() (which
            // does not change how an engine actually parses its stylesheet).
            body: cssSource.replace(/[\w-]+:\s*[^;{}]*color-mix\([^;{}]*;/g, '')
        }));
    }
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/__controls__');
    // Measure settled states, not intermediate colors while switching 28 themes.
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
    await page.addScriptTag({ url: base + '/app.js' });
    await page.addScriptTag({ url: base + '/ui.js' });
    await page.evaluate(() => {
        document.body.classList.add('reduce-motion');
        document.getElementById('lockscreen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        const fixture = document.createElement('div');
        fixture.id = 'control-fixture';
        fixture.style.cssText = 'position:fixed;top:60px;left:10px;right:10px;padding:12px;display:flex;flex-wrap:wrap;gap:10px;background:var(--surface-solid)';
        const classes = ['icon-btn', 'btn-mini', 'btn-ghost', 'sb-btn', 'pin-chip', 'ai-mode-btn', 'ai-speak-btn', 'select-mini', 'theme-select-sm', 'tab'];
        classes.forEach(cls => {
            const el = document.createElement(cls.includes('select') ? 'select' : 'button');
            el.className = cls; el.dataset.testControl = cls;
            if (el.tagName === 'SELECT') el.innerHTML = '<option>Choose</option>';
            else el.textContent = cls === 'ai-speak-btn' ? 'Read aloud' : 'Action';
            if (cls === 'ai-speak-btn') el.style.position = 'static';
            fixture.appendChild(el);
        });
        document.body.appendChild(fixture);
        window.openTestMenu = selection => {
            window.__menuSelection = selection;
            // Use the real terminal-menu builder and the real enabled/disabled
            // decisions. Only terminal text selection is a deterministic input.
            openTermContextMenu({ clientX: 70, clientY: 205 }, {
                id: 'ui-test', term: { getSelection: () => window.__menuSelection }
            });
        };
        window.controlSnapshot = () => {
            const rgb = s => {
                const n = s.match(/[\d.]+/g).map(Number);
                return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
            };
            const blend = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])).concat(1);
            const lum = c => c.slice(0, 3).map(v => {
                v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
            }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
            const contrast = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
            const menu = document.getElementById('context-menu');
            const surface = rgb(getComputedStyle(document.getElementById('control-fixture')).backgroundColor);
            const menuSurface = rgb(getComputedStyle(menu).backgroundColor);
            const effectiveMenu = blend(menuSurface, surface);
            const inspect = (el, bg) => {
                const s = getComputedStyle(el);
                const fill = blend(rgb(s.backgroundColor), bg);
                const fg = rgb(s.color); fg[3] *= Number(s.opacity);
                return { label: el.textContent.trim(), color: s.color, opacity: Number(s.opacity),
                    disabled: el.disabled === true, contrast: contrast(blend(fg, fill), fill),
                    background: s.backgroundColor, cursor: s.cursor };
            };
            return {
                theme: getSettings().themeId, menuAlpha: menuSurface[3],
                items: Array.from(menu.querySelectorAll('button')).map(el => inspect(el, effectiveMenu)),
                hints: Array.from(menu.querySelectorAll('.ctx-key')).map(el => inspect(el, effectiveMenu)),
                icons: Array.from(menu.querySelectorAll('button:not(:disabled) .ic')).map(el => inspect(el, effectiveMenu)),
                controls: Array.from(document.querySelectorAll('[data-test-control]')).map(el => ({ cls: el.className, ...inspect(el, surface) }))
            };
        };
        applyThemeToCssVars(getThemeData('palenight'));
        openTestMenu('notes.txt');
    });
    // Let genuine transitions settle; screenshot() also waits for visual stability.
    await page.locator('#context-menu').screenshot();
    return { context, page, errors };
}

(async () => {
    server.listen(0, '0.0.0.0');
    await once(server, 'listening');
    const base = `http://localhost:${server.address().port}`;
    const browser = await chromium.launch({
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    try {
        console.log('=== Rendered control appearance (Chromium, actual stylesheet) ===');
        for (const [label, mobile, withoutColorMix] of [['desktop', false, false], ['touch / no color-mix', true, true]]) {
            const { context, page, errors } = await bootControls(browser, base, mobile, withoutColorMix);
            try {
                const initial = await page.evaluate(() => controlSnapshot());
                check(label + ': menu uses an opaque surface', initial.menuAlpha === 1);
                check(label + ': available menu actions are fully opaque and readable', initial.items.every(i => !i.disabled && i.opacity === 1 && i.contrast >= 4.5), JSON.stringify(initial.items.filter(i => i.contrast < 4.5)));
                check(label + ': keyboard hints remain readable', initial.hints.every(i => i.contrast >= 4.5), JSON.stringify(initial.hints));
                check(label + ': available menu icons are readable and accented', initial.icons.every(i => i.contrast >= 3) && initial.icons[0].color !== initial.items[0].color);
                check(label + ': enabled voice buttons are not faded', initial.controls.filter(i => i.cls === 'ai-speak-btn').every(i => i.opacity === 1 && i.contrast >= 4.5));

                const failures = await page.evaluate(() => {
                    const failures = [];
                    const themes = Object.entries(BUILTIN_THEMES).map(([name, t]) => [name, t.theme]);
                    themes.push(['custom-dark', { background: '#172637', foreground: '#dce8f4', cyan: '#76c9ec', magenta: '#c69fe6' }]);
                    themes.push(['custom-low-contrast', { background: '#30343c', foreground: '#6f747e', cyan: '#91c7ee', magenta: '#ae9fdf' }]);
                    for (const [name, theme] of themes) {
                        applyThemeToCssVars(theme);
                        // Do not sample halfway through a CSS transition.
                        document.querySelectorAll('[data-test-control], .ctx-item, .ctx-key').forEach(el => el.style.transition = 'none');
                        const s = controlSnapshot();
                        for (const item of [...s.items, ...s.hints, ...s.icons, ...s.controls]) {
                            if (!item.disabled && (item.opacity !== 1 || item.contrast < 4.5)) failures.push({ theme: name, control: item.cls || item.label, contrast: +item.contrast.toFixed(2), opacity: item.opacity });
                        }
                    }
                    applyThemeToCssVars(getThemeData('palenight'));
                    return failures;
                });
                check(label + ': contrast >=4.5:1 on actual surfaces for every built-in and two custom themes', failures.length === 0, JSON.stringify(failures.slice(0, 12)) + (failures.length > 12 ? ` (${failures.length} failures total)` : ''));

                await page.evaluate(() => openTestMenu(''));
                await page.locator('#context-menu').screenshot();
                const disabled = await page.evaluate(() => controlSnapshot());
                check(label + ': only selection-dependent actions are disabled without selection', disabled.items.filter(i => i.disabled).length === 4 && disabled.items.filter(i => !i.disabled).every(i => i.opacity === 1));
                await page.getByRole('button', { name: 'Copy', exact: true }).hover({ force: true });
                const hover = await page.getByRole('button', { name: 'Copy', exact: true }).evaluate(el => ({ disabled: el.disabled, bg: getComputedStyle(el).backgroundColor }));
                check(label + ': unavailable actions do not acquire enabled hover styling', hover.disabled && hover.bg === 'rgba(0, 0, 0, 0)');

                await page.evaluate(() => {
                    window.__clicked = 0;
                    openCtxMenu(70, 205, [
                        { label: 'Available test action', run: () => { window.__clicked++; } },
                        { label: 'Unavailable test action', disabled: true, run: () => { window.__clicked += 100; } }
                    ]);
                });
                await page.getByRole('button', { name: 'Unavailable test action', exact: true }).evaluate(el => el.click());
                check(label + ': disabled action cannot execute', await page.evaluate(() => __clicked === 0));
                await page.getByRole('button', { name: 'Available test action', exact: true }).focus();
                await page.keyboard.press('Enter');
                check(label + ': keyboard activation executes the enabled action and closes the menu', await page.evaluate(() => __clicked === 1 && document.getElementById('context-menu').classList.contains('hidden')));
                check(label + ': no runtime errors', errors.length === 0, errors.join('; '));

                if (process.env.UI_SHOT_DIR && !mobile) {
                    await page.mouse.move(1, 1);
                    fs.mkdirSync(process.env.UI_SHOT_DIR, { recursive: true });
                    await page.evaluate(() => openTestMenu('notes.txt'));
                    await page.locator('#context-menu').screenshot({ path: path.join(process.env.UI_SHOT_DIR, 'menu-enabled.png') });
                    await page.evaluate(() => openTestMenu(''));
                    await page.locator('#context-menu').screenshot({ path: path.join(process.env.UI_SHOT_DIR, 'menu-without-selection.png') });
                }
            } finally { await context.close(); }
        }

        console.log('=== Real service worker: stale CSS must not mask an online fix ===');
        const cacheContext = await browser.newContext();
        // Dependency responses for the worker's precache; UI dependencies are
        // not executed in this cache test. No third-party requests leave it.
        await cacheContext.route('https://**/*', route => route.fulfill({ body: '/* offline test dependency */', contentType: 'text/javascript' }));
        const cachePage = await cacheContext.newPage();
        await cachePage.goto(base + '/__cache__');
        const cacheName = swSource.match(/const CACHE = '([^']+)'/)[1];
        const asset = swSource.match(/'(\/style\.css[^']*)'/)[1];
        await cachePage.evaluate(async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
        });
        await cachePage.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 15000 });
        await cachePage.evaluate(async ({ cacheName, asset }) => {
            const cache = await caches.open(cacheName);
            await cache.put(asset, new Response('/* stale gray control styles */', { headers: { 'Content-Type': 'text/css' } }));
        }, { cacheName, asset });
        const online = await cachePage.evaluate(async asset => (await fetch(asset)).text(), asset);
        check('first online stylesheet request returns current CSS, not poisoned cached CSS', online === cssSource);
        failStylesheet = true;
        const duringOutage = await cachePage.evaluate(async asset => (await fetch(asset)).text(), asset);
        check('temporary server error falls back to the last good stylesheet', duringOutage === cssSource);
        failStylesheet = false;
        await cacheContext.setOffline(true);
        const offline = await cachePage.evaluate(async asset => (await fetch(asset)).text(), asset);
        check('offline stylesheet fallback remains available', offline === cssSource);
        await cacheContext.close();
    } finally { await browser.close(); }
})().catch(error => { failed++; console.error(error.stack || error); }).finally(() => {
    server.closeAllConnections();
    server.close();
    console.log(`\nUI BROWSER RESULT: ${passed} passed, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
});
