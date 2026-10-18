/* Visual/layout check: AI approval cards (Run/Edit/Explain/Skip).
   Stubs /api/ai/chat at the network layer so the REAL agent loop + approval
   UI run end-to-end without a model key: reply 1 proposes `which pacman`,
   reply 2 proposes `sudo pacman -Syu --noconfirm`, reply 3 summarises.
   Then verifies the second pending card is NOT crushed (the 5.1.7 bug:
   scrollable flex columns compressed children and the card's overflow:hidden
   clipped its action row).

   Usage:  sh tools/browser-env.sh
           node tools/repro-approval-flow.js        # cramped 640px viewport
           REPRO_VH=900 node tools/repro-approval-flow.js
   Env:    REPRO_APP, REPRO_VH (default 640), GK_PASSWORD
   Reads:  "CLIP CHECK" line — crushed:false + btnVisibleInCard:true = healthy.
           Run against an OLD commit (git worktree) to see the bug red. */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const APP = process.env.REPRO_APP || path.join(__dirname, '..');
const PORT = String(3900 + Math.floor(Math.random() * 90));
const SHOTS = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-shots-'));

function loadPlaywright() {
    try { return require('playwright-core'); } catch (e) {}
    for (const p of ['/tmp/pwenv/node_modules/playwright-core', '/tmp/node_modules/playwright-core']) {
        try { return require(p); } catch (e) {}
    }
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
    const VH = +(process.env.REPRO_VH || 640);
    const page = await browser.newPage({ viewport: { width: 1280, height: VH } });
    page.on('pageerror', (e) => console.log('[pageexception]', String(e).slice(0, 300)));

    // scripted model replies (no API key needed)
    let calls = 0;
    await page.route('**/api/ai/chat', async (route) => {
        calls++;
        let content;
        if (calls === 1) content = 'Checking the package manager first:\n```cmd\nwhich pacman\n```';
        else if (calls === 2) content = 'Pacman is available. Now the full upgrade:\n```cmd\nsudo pacman -Syu --noconfirm\n```';
        else content = 'All done — system is up to date!';
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content }) });
    });

    await page.addInitScript(() => {
        try {
            localStorage.setItem('gk_tour_done', 'true');
            localStorage.setItem('gk_news_seen', JSON.stringify('5.1.7'));
        } catch (e) {}
    });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    for (let attempt = 0; attempt < 6; attempt++) {
        if (!(await page.$('#password-input'))) break;
        const ready = await page.evaluate(() => typeof window.showToast === 'function');
        if (!ready) { await page.waitForTimeout(900); continue; }
        await page.fill('#password-input', process.env.GK_PASSWORD || '20090228');
        await page.click('#login-btn');
        try { await page.waitForSelector('.xterm', { timeout: 8000 }); break; } catch (e) {}
    }
    await page.waitForTimeout(2000);

    // open AI drawer, start task (fire-and-forget: the agent promise only
    // resolves when the whole task finishes — never await aiSend()!)
    await page.evaluate(() => { if ($('ai-drawer').classList.contains('hidden')) toggleAi(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { void aiSend('update my linux'); });
    console.log('task sent, waiting for card 1…');

    await page.waitForSelector('.ai-cmd-card.pending .ai-cmd-actions button', { timeout: 15000 });
    const first = await page.evaluate(() => {
        const c = document.querySelector('.ai-cmd-card.pending');
        return { btns: c.querySelectorAll('.ai-cmd-actions button').length, cmd: c.querySelector('.ai-cmd-head span').textContent };
    });
    console.log('CARD1 pending buttons:', JSON.stringify(first));
    // click via DOM: the pane re-renders constantly, Playwright stability waits fail
    await page.evaluate(() => document.querySelector('.ai-cmd-card.pending .run-btn').click());
    console.log('card 1 approved, waiting for card 2…');

    await page.waitForFunction(() => {
        const cards = [...document.querySelectorAll('.ai-cmd-card')];
        return cards.some((c) => c.classList.contains('pending') && /pacman -Syu/.test(c.textContent));
    }, { timeout: 20000 });
    await page.waitForTimeout(700);

    const clip = await page.evaluate(() => {
        const box = document.getElementById('ai-messages');
        const c = [...document.querySelectorAll('.ai-cmd-card')].find((x) => x.classList.contains('pending'));
        if (!c) return null;
        const btn = c.querySelector('.ai-cmd-actions .run-btn');
        const cr = c.getBoundingClientRect();
        const br = btn ? btn.getBoundingClientRect() : null;
        return {
            cardScrollH: c.scrollHeight, cardClientH: c.clientHeight,
            crushed: c.scrollHeight > c.clientHeight + 1,
            btnVisibleInCard: br ? (br.bottom <= cr.bottom + 1 && br.top >= cr.top - 1 && br.height > 0) : false,
            boxScrollable: box.scrollHeight > box.clientHeight
        };
    });
    console.log('CLIP CHECK @VH=' + VH + ':', JSON.stringify(clip));
    if (!clip || clip.crushed || !clip.btnVisibleInCard) console.log('*** BUG PRESENT: pending card crushed / buttons clipped ***');
    else console.log('*** OK: pending card intact, buttons inside card box ***');

    await page.evaluate(() => { const b = document.getElementById('ai-messages'); b.scrollTop = b.scrollHeight; });
    await page.waitForTimeout(300);
    const full = path.join(SHOTS, 'approval-cards.png');
    const crop = path.join(SHOTS, 'approval-cards-crop.png');
    await page.screenshot({ path: full });
    const drawer = await page.$('#ai-drawer');
    if (drawer) await drawer.screenshot({ path: crop }).catch(() => {});
    console.log('screenshots:', full, crop, '| model calls:', calls);

    await browser.close();
    srv.kill();
    process.exit(0);
})().catch((e) => { console.error('REPRO FAILED:', e && e.stack || e); process.exit(1); });
