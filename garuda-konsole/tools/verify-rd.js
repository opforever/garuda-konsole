/* Verify Remote Desktop end-to-end in headless Chromium:
   - fixture webm streamed by the server (GK_RD_CAPTURE_FILE) plays in the drawer via MSE
   - pointer click round-trips (echo input backend)
   - mobile viewport: no overlap / no horizontal overflow (user requirement) */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
/* Usage: sh tools/browser-env.sh && node tools/verify-rd.js
   Env: REPRO_APP, GK_PASSWORD. Exits 1 on any failure. */
const APP = process.env.REPRO_APP || path.join(__dirname, '..');
const FIX = path.join(APP, 'test', 'fixtures', 'rd-test.webm');
const PORT = String(4700 + Math.floor(Math.random() * 90));
const SHOTS = fs.mkdtempSync(path.join(os.tmpdir(), 'gkrd-'));
function loadPlaywright() {
    try { return require('playwright-core'); } catch (e) {}
    for (const p of ['/tmp/pwenv/node_modules/playwright-core', '/tmp/node_modules/playwright-core', path.join(__dirname, '..', '..', '..', 'vendor', 'playwright-core')]) { try { return require(p); } catch (e) {} }
    throw new Error('playwright-core missing');
}
async function login(page) {
    for (let a = 0; a < 6; a++) {
        if (!(await page.$('#password-input'))) break;
        const ready = await page.evaluate(() => typeof window.showToast === 'function');
        if (!ready) { await page.waitForTimeout(900); continue; }
        await page.fill('#password-input', process.env.GK_PASSWORD || '20090228');
        await page.click('#login-btn');
        try { await page.waitForSelector('.xterm', { timeout: 8000 }); break; } catch (e) {}
    }
    await page.waitForTimeout(1800);
}
(async () => {
    const srv = spawn(process.execPath, [path.join(APP, 'server.js')], {
        cwd: APP,
        env: Object.assign({}, process.env, { PORT, KONSOLE_LOGIN_LIMIT: '100000', GK_RD_CAPTURE_FILE: FIX, GK_RD_MIME: 'video/webm; codecs=vp8', GK_RD_INPUT: 'echo', GK_RD_WIDTH: '640', GK_RD_HEIGHT: '360' }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    srv.on('error', (e) => { console.log('SPAWN-ERR', e.message); process.exit(1); });
    for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/healthz`); if (r.ok) break; } catch (e) {} await new Promise((r) => setTimeout(r, 250)); }
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const results = [];
    const ck = (n, c, x) => { results.push({ n, ok: !!c }); console.log((c ? '  ✔ ' : '  ✘ ') + n + (x ? ' — ' + x : '')); };

    for (const vp of [{ width: 1280, height: 860, tag: 'desktop' }, { width: 390, height: 844, tag: 'mobile' }]) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        page.on('pageerror', (e) => console.log('[pageexception]', String(e).slice(0, 200)));
        await page.addInitScript(() => { try { localStorage.setItem('gk_tour_done', 'true'); localStorage.setItem('gk_news_seen', JSON.stringify('5.3.0')); } catch (e) {} });
        await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        await login(page);
        const skip = await page.$('[data-action="tour-skip"]');
        if (skip) { await skip.click({ force: true }).catch(() => {}); await page.waitForTimeout(800); }
        await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden')));
        await page.waitForTimeout(300);
        await page.evaluate(() => { const d = $('rd-drawer'); if (d.classList.contains('hidden')) toggleRd(); });
        await page.waitForTimeout(400);
        await page.evaluate(() => rdConnect());
        await page.waitForFunction(() => { const v = document.getElementById('rd-video'); return v && v.readyState >= 2 && v.currentTime > 0.2; }, { timeout: 15000 }).catch(() => {});
        const vst = await page.evaluate(() => { const v = document.getElementById('rd-video'); return { t: v.currentTime, rs: v.readyState, w: v.videoWidth, h: v.videoHeight }; });
        ck(`[${vp.tag}] MSE plays the streamed capture`, vst.rs >= 2 && vst.t > 0.2 && vst.w > 0, JSON.stringify(vst));
        ck(`[${vp.tag}] status chip reports live+backends`, /live · file · in:echo/.test(await page.evaluate(() => document.getElementById('rd-status-chip').textContent)));
        // pointer round-trip
        const box = await page.locator('#rd-video').boundingBox();
        if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        let echo = null;
        for (let i = 0; i < 20 && !echo; i++) { echo = await page.evaluate(() => rdState.lastEcho || null); if (!echo) await page.waitForTimeout(150); }
        ck(`[${vp.tag}] pointer event round-trips`, !!echo && typeof echo.x === 'number', JSON.stringify(echo));
        // layout hygiene: no horizontal overflow, toolbar below the stage (never overlapping)
        const lay = await page.evaluate(() => {
            const stage = document.querySelector('.rd-stage').getBoundingClientRect();
            const tb = document.querySelector('.rd-toolbar').getBoundingClientRect();
            const hd = document.querySelector('#rd-drawer .drawer-header').getBoundingClientRect();
            const v = document.getElementById('rd-video').getBoundingClientRect();
            return {
                overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
                tbBelowStage: tb.top >= stage.bottom - 2,
                hdAboveStage: hd.bottom <= stage.top + 2,
                videoInStage: v.top >= stage.top - 2 && v.bottom <= stage.bottom + 2,
                tbInViewport: tb.bottom <= window.innerHeight + 2
            };
        });
        ck(`[${vp.tag}] layout: no overflow / no overlap`, !lay.overflowX && lay.tbBelowStage && lay.hdAboveStage && lay.videoInStage && lay.tbInViewport, JSON.stringify(lay));
        const shot = path.join(SHOTS, `rd-${vp.tag}.png`);
        await page.screenshot({ path: shot });
        console.log('  shot:', shot);
        await page.close();
    }
    const failed = results.filter((r) => !r.ok);
    console.log(`RD VERIFY: ${results.length - failed.length}/${results.length} passed`);
    await browser.close();
    srv.kill();
    process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('VERIFY CRASH:', e && e.stack || e); process.exit(1); });
