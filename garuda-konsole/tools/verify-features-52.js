/* Verify the 5.2 feature set in headless Chromium:
   A) file editor  B) monitor sparklines+processes  C) layouts  D) health badge  E) replay player
   Usage: sh tools/browser-env.sh && node tools/verify-features-52.js
   Env:   REPRO_APP (project dir), REPRO_VH, GK_PASSWORD
   Exits 1 if any feature check fails. Screenshots land in a temp dir (printed). */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const APP = process.env.REPRO_APP || path.join(__dirname, '..');
const PORT = String(4300 + Math.floor(Math.random() * 90));
const SHOTS = fs.mkdtempSync(path.join(os.tmpdir(), 'gk52-'));

function loadPlaywright() {
    try { return require('playwright-core'); } catch (e) {}
    for (const p of ['/tmp/pwenv/node_modules/playwright-core', '/tmp/node_modules/playwright-core', path.join(__dirname, '..', '..', '..', 'vendor', 'playwright-core')]) {
        try { return require(p); } catch (e) {}
    }
    throw new Error('playwright-core missing — run: sh tools/browser-env.sh');
}

(async () => {
    const srv = spawn(process.execPath, [path.join(APP, 'server.js')], {
        cwd: APP,
        env: Object.assign({}, process.env, { PORT, KONSOLE_LOGIN_LIMIT: '100000', GK_HEALTH_CPU: '30', GK_STATS_TICK_MS: '2000' }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    srv.on('error', (e) => { console.log('SPAWN-ERR', e.message); process.exit(1); });
    for (let i = 0; i < 60; i++) {
        try { const r = await fetch(`http://localhost:${PORT}/healthz`); if (r.ok) break; } catch (e) {}
        await new Promise((r) => setTimeout(r, 250));
    }
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', (e) => console.log('[pageexception]', String(e).slice(0, 200)));
    const results = [];
    const ck = (name, cond, extra) => { results.push({ name, ok: !!cond, extra }); console.log((cond ? '  ✔ ' : '  ✘ ') + name + (extra ? ' — ' + extra : '')); };

    await page.addInitScript(() => { try { localStorage.setItem('gk_tour_done', 'true'); localStorage.setItem('gk_news_seen', JSON.stringify('5.2.0')); } catch (e) {} });
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
    await page.waitForTimeout(2000);

    /* A — file editor */
    await page.evaluate(() => api('/api/files/write', { method: 'POST', body: { path: 'gk-verify.txt', content: 'line one\nline two' } }));
    await page.evaluate(() => openEditor('gk-verify.txt'));
    await page.waitForTimeout(600);
    ck('editor opens with content', await page.evaluate(() => document.getElementById('editor-area').value) === 'line one\nline two');
    await page.evaluate(() => { const a = document.getElementById('editor-area'); a.value += '\nline three'; a.dispatchEvent(new Event('input', { bubbles: true })); });
    ck('dirty dot shows', await page.evaluate(() => !document.getElementById('editor-dirty').classList.contains('hidden')));
    const edShot = path.join(SHOTS, 'editor.png');
    await page.locator('#editor-modal').screenshot({ path: edShot });
    await page.evaluate(() => editorSave(false));
    await page.waitForTimeout(500);
    ck('save persists', await page.evaluate(() => api('/api/files/content?path=gk-verify.txt').then((d) => d.content)) === 'line one\nline two\nline three');
    ck('backup exists', await page.evaluate(() => api('/api/files/content?path=gk-verify.txt.bak').then((d) => d.content)) === 'line one\nline two');
    await page.evaluate(() => closeEditor());
    await page.waitForTimeout(300);

    /* B — monitor extras */
    await page.evaluate(() => document.getElementById('stats-drawer').classList.remove('hidden'));
    await page.waitForTimeout(9500);
    const procRows = await page.evaluate(() => document.querySelectorAll('#proc-list .proc-row').length);
    ck('process list renders', procRows > 0, procRows + ' rows');
    ck('history span filled', await page.evaluate(() => document.getElementById('stat-hist-span').textContent) !== '—');
    const monShot = path.join(SHOTS, 'monitor.png');
    await page.locator('#stats-drawer').screenshot({ path: monShot });
    await page.evaluate(() => document.getElementById('stats-drawer').classList.add('hidden'));

    /* C — layouts */
    await page.evaluate(() => { createNewTab(); });
    await page.waitForTimeout(1200);
    await page.evaluate(() => saveCurrentLayout('verify layout'));
    await page.waitForTimeout(600);
    const layouts = await page.evaluate(() => api('/api/layouts').then((d) => d.layouts));
    ck('layout saved server-side', layouts.some((l) => l.id === 'verify-layout'), JSON.stringify((layouts[0] || {}).tabs || []).slice(0, 120));
    ck('palette offers restore', await page.evaluate(() => buildPaletteItems('restore layout').some((i) => /Restore layout: verify layout/.test(i.title))));

    /* D — health badge */
    await page.evaluate(() => { const t = tabs[activeTabId]; sendInput(t, 'end=$((SECONDS+12)); while [ $SECONDS -lt $end ]; do :; done\n'); });
    let badge = false;
    for (let i = 0; i < 30; i++) {
        badge = await page.evaluate(() => { const t = tabs[activeTabId]; return !!(t.healthEl && !t.healthEl.classList.contains('hidden')); });
        if (badge) break;
        await page.waitForTimeout(700);
    }
    ck('hot badge appears on tab', badge);
    const tabShot = path.join(SHOTS, 'tab-badge.png');
    await page.locator('#tab-bar').screenshot({ path: tabShot });
    let cleared = false;
    for (let i = 0; i < 30; i++) {
        cleared = await page.evaluate(() => { const t = tabs[activeTabId]; return !t.health || t.healthEl.classList.contains('hidden'); });
        if (cleared) break;
        await page.waitForTimeout(700);
    }
    ck('badge clears when idle', cleared);

    /* E — replay share + public player */
    const url = await page.evaluate(() => api('/api/replay/share', { method: 'POST', body: { title: 'verify replay', events: [{ t: 0, d: 'hello from garuda\r\n' }, { t: 400, d: 'second line of the replay\r\n' }, { t: 800, d: 'done.\r\n' }] } }).then((r) => r.url));
    ck('share url minted', typeof url === 'string' && url.startsWith('/replay.html?r='), url);
    await page.evaluate(() => { api('/api/files/delete', { method: 'POST', body: { path: 'gk-verify.txt' } }); api('/api/files/delete', { method: 'POST', body: { path: 'gk-verify.txt.bak' } }); api('/api/layouts/verify-layout', { method: 'DELETE' }); });
    await page.close().catch(() => {}); // free the first renderer before opening the player page (sandbox RAM)
    const page2 = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page2.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
    await page2.waitForTimeout(2500);
    const playerText = await page2.evaluate(() => document.getElementById('screen').textContent);
    ck('public player replays content (no login)', /hello from garuda/.test(playerText) && /done\./.test(playerText));
    const playShot = path.join(SHOTS, 'replay-player.png');
    await page2.screenshot({ path: playShot });

    console.log('screenshots in', SHOTS);
    const failed = results.filter((r) => !r.ok);
    console.log(`VERIFY RESULT: ${results.length - failed.length}/${results.length} passed`);
    await browser.close();
    srv.kill();
    process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('VERIFY CRASH:', e && e.stack || e); process.exit(1); });
