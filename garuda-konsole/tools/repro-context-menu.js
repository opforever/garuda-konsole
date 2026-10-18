/* Visual check: the right-click (context) menu.
   Boots the real server + real app in headless Chromium, logs in, right-clicks
   the terminal, then dumps computed styles of every menu entry and saves
   screenshots. Used to verify 5.1.6 (enabled = crisp, disabled = inert).

   Usage:  sh tools/browser-env.sh          # once per session
           node tools/repro-context-menu.js # prints styles, saves shots
   Env:    REPRO_APP  → project dir (default: repo dir containing tools/)
           REPRO_VH   → viewport height (default 800)
           GK_PASSWORD→ login password (default 20090228)

   PATH RULE (sandbox): never hardcode absolute workspace paths in scripts —
   derive them from __dirname/process.cwd(). See README → "AI maintainer
   handbook". */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const APP = process.env.REPRO_APP || path.join(__dirname, '..');
const PORT = String(3300 + Math.floor(Math.random() * 600));
const SHOTS = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-shots-'));

function loadPlaywright() {
    const candidates = [
        'playwright-core',
        path.join(__dirname, '..', '..', '..', 'vendor', 'playwright-core'), // persisted workspace copy
        '/tmp/pwenv/node_modules/playwright-core',
        '/tmp/node_modules/playwright-core'
    ];
    for (const p of candidates) { try { return require(p); } catch (e) {} }
    throw new Error('playwright-core not found — run: sh tools/browser-env.sh');
}

(async () => {
    const srv = spawn(process.execPath, [path.join(APP, 'server.js')], {
        cwd: APP,
        env: Object.assign({}, process.env, { PORT, KONSOLE_LOGIN_LIMIT: '100000' }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    srv.on('error', (e) => { console.log('SPAWN-ERR', e.message); process.exit(1); });
    for (let i = 0; i < 60; i++) {
        try { const r = await fetch(`http://localhost:${PORT}/healthz`); if (r.ok) break; } catch (e) {}
        await new Promise((r) => setTimeout(r, 250));
    }

    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: +(process.env.REPRO_VH || 800) } });
    page.on('pageerror', (e) => console.log('[pageexception]', String(e).slice(0, 200)));
    page.on('response', async (r) => {
        if (r.url().includes('/api/login')) console.log('[login]', r.status());
    });

    await page.addInitScript(() => {
        try {
            localStorage.setItem('gk_tour_done', 'true');
            localStorage.setItem('gk_news_seen', JSON.stringify('5.1.7'));
        } catch (e) {}
    });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // login (retry until app scripts are bound — CDN scripts can be slow)
    for (let attempt = 0; attempt < 6; attempt++) {
        if (!(await page.$('#password-input'))) break;
        const ready = await page.evaluate(() => typeof window.showToast === 'function' && typeof window.openCtxMenu === 'function');
        if (!ready) { await page.waitForTimeout(1000); continue; }
        await page.fill('#password-input', process.env.GK_PASSWORD || '20090228');
        await page.click('#login-btn');
        try { await page.waitForSelector('.xterm', { timeout: 8000 }); break; } catch (e) { console.log('[login retry]', attempt); }
    }
    await page.waitForTimeout(2500);

    const skip = await page.$('[data-action="tour-skip"]');
    if (skip) { await skip.click({ force: true }).catch(() => {}); await page.waitForTimeout(1000); }
    await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden')));
    await page.waitForTimeout(300);

    // right-click the terminal surface
    const term = await page.$('.xterm');
    const box = term ? await term.boundingBox() : { x: 400, y: 400, width: 200, height: 200 };
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(700);

    const styles = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('#context-menu .ctx-item').forEach((b) => {
            const cs = getComputedStyle(b);
            out.push({
                label: ((b.querySelector('span') || {}).textContent || '').slice(0, 28),
                color: cs.color, opacity: cs.opacity, cursor: cs.cursor,
                disabled: b.disabled, inlineStyle: b.getAttribute('style') || ''
            });
        });
        const root = getComputedStyle(document.documentElement);
        return { items: out, text: root.getPropertyValue('--text').trim(), dim: root.getPropertyValue('--text-dim').trim() };
    });
    console.log(JSON.stringify(styles, null, 1));

    const full = path.join(SHOTS, 'ctx-menu-full.png');
    const crop = path.join(SHOTS, 'ctx-menu-crop.png');
    await page.screenshot({ path: full });
    const mEl = await page.$('#context-menu:not(.hidden)');
    if (mEl) await mEl.screenshot({ path: crop }).catch(() => {});
    console.log('screenshots:', full, crop);

    await browser.close();
    srv.kill();
    process.exit(0);
})().catch((e) => { console.error('REPRO FAILED:', e && e.stack || e); process.exit(1); });
