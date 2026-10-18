/* Verify the 5.4 Preview Studio in headless Chromium: kinds render, and the
   modal respects desktop AND mobile viewports (nothing out of place). */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
/* Usage: sh tools/browser-env.sh && node tools/verify-preview.js
   Env: REPRO_APP, GK_PASSWORD. Exits 1 on any failure. */
const APP = process.env.REPRO_APP || path.join(__dirname, '..');
const PORT = String(4900 + Math.floor(Math.random() * 90));
const SHOTS = fs.mkdtempSync(path.join(os.tmpdir(), 'gkpv-'));
function loadPlaywright() {
    try { return require('playwright-core'); } catch (e) {}
    for (const p of ['/tmp/pwenv/node_modules/playwright-core', '/tmp/node_modules/playwright-core', path.join(__dirname, '..', '..', '..', 'vendor', 'playwright-core')]) { try { return require(p); } catch (e) {} }
    throw new Error('playwright-core missing');
}
(async () => {
    const srv = spawn(process.execPath, [path.join(APP, 'server.js')], {
        cwd: APP, env: Object.assign({}, process.env, { PORT, KONSOLE_LOGIN_LIMIT: '100000' }), stdio: ['ignore', 'pipe', 'pipe']
    });
    for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/healthz`); if (r.ok) break; } catch (e) {} await new Promise((r) => setTimeout(r, 250)); }
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const results = [];
    const ck = (n, c, x) => { results.push({ n, ok: !!c }); console.log((c ? '  ✔ ' : '  ✘ ') + n + (x ? ' — ' + x : '')); };

    for (const vp of [{ width: 1280, height: 860, tag: 'desktop' }, { width: 390, height: 844, tag: 'mobile' }]) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        page.on('pageerror', (e) => console.log('[pageexception]', String(e).slice(0, 200)));
        await page.addInitScript(() => { try { localStorage.setItem('gk_tour_done', 'true'); localStorage.setItem('gk_news_seen', JSON.stringify('5.4.0')); } catch (e) {} });
        await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        for (let a = 0; a < 6; a++) {
            if (!(await page.$('#password-input'))) break;
            const ready = await page.evaluate(() => typeof window.showToast === 'function');
            if (!ready) { await page.waitForTimeout(900); continue; }
            await page.fill('#password-input', process.env.GK_PASSWORD || '20090228');
            await page.click('#login-btn');
            try { await page.waitForSelector('.xterm', { timeout: 8000 }); break; } catch (e) {}
        }
        await page.waitForTimeout(1500);
        const skip = await page.$('[data-action="tour-skip"]');
        if (skip) { await skip.click({ force: true }).catch(() => {}); await page.waitForTimeout(600); }
        await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden')));
        await page.evaluate(() => api('/api/files/write', { method: 'POST', body: { path: 'gk-pv-demo.md', content: '# Preview Studio\n\nRenders **every** openable type.\n\n- images, audio, video\n- pdf, docx, xlsx, zip\n- markdown, json, csv, html\n- fonts + hex fallback\n' } }));
        await page.evaluate(() => api('/api/files/write', { method: 'POST', body: { path: 'gk-pv-demo.csv', content: 'service,cpu,mem\nkonsole,12,140\nydotoold,1,4\n' } }));

        const layout = async (label) => page.evaluate((label) => {
            const sheet = document.querySelector('#preview-modal .modal-sheet').getBoundingClientRect();
            const hd = document.querySelector('#preview-modal .modal-header').getBoundingClientRect();
            const bd = document.getElementById('preview-body').getBoundingClientRect();
            const ft = document.querySelector('#preview-modal .pv-footer').getBoundingClientRect();
            return {
                label,
                inViewport: sheet.left >= -1 && sheet.top >= -1 && sheet.right <= window.innerWidth + 1 && sheet.bottom <= window.innerHeight + 1,
                noOverlap: hd.bottom <= bd.top + 2 && bd.bottom <= ft.top + 2,
                noPageOverflowX: document.documentElement.scrollWidth <= window.innerWidth + 1
            };
        }, label);

        const cases = [
            ['image', 'public/icons/icon-512.png', () => page.evaluate(() => { const i = document.getElementById('preview-image'); return !i.classList.contains('hidden') && i.src.includes('/download'); })],
            ['video', 'test/fixtures/rd-test.webm', () => page.evaluate(() => { const v = document.querySelector('#preview-body video'); return !!v && v.controls; })],
            ['audio', 'test/fixtures/voice-sample.mp3', () => page.evaluate(() => !!document.querySelector('#preview-body audio'))],
            ['markdown', 'gk-pv-demo.md', () => page.evaluate(() => !!document.querySelector('#preview-body .pv-md h1'))],
            ['csv', 'gk-pv-demo.csv', () => page.evaluate(() => document.querySelectorAll('#preview-body .pv-table th').length === 3)],
            ['hex', 'gk-pv-demo.bin', () => page.evaluate(() => document.getElementById('preview-content').textContent.length > 40)]
        ];
        await page.evaluate(() => api('/api/files/write', { method: 'POST', body: { path: 'gk-pv-demo.bin', content: 'GARUDA\u0000\u0001\u0002BIN' } }));
        for (const [label, file, probe] of cases) {
            await page.evaluate((f) => openPreviewStudio(f), file);
            await page.waitForTimeout(900);
            const okKind = await probe();
            const lay = await layout(label);
            ck(`[${vp.tag}] ${label}: renders`, okKind);
            ck(`[${vp.tag}] ${label}: layout clean`, lay.inViewport && lay.noOverlap && lay.noPageOverflowX, JSON.stringify(lay));
            if (['video', 'image', 'markdown'].includes(label)) {
                const shot = path.join(SHOTS, `pv-${vp.tag}-${label}.png`);
                await page.screenshot({ path: shot });
            }
        }
        await page.evaluate(() => { ['gk-pv-demo.md', 'gk-pv-demo.csv', 'gk-pv-demo.bin'].forEach((f) => api('/api/files/delete', { method: 'POST', body: { path: f } }).catch(() => {})); });
        await page.close();
    }
    const failed = results.filter((r) => !r.ok);
    console.log('screenshots in', SHOTS);
    console.log(`PV VERIFY: ${results.length - failed.length}/${results.length} passed`);
    await browser.close();
    srv.kill();
    process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('VERIFY CRASH:', e && e.stack || e); process.exit(1); });
