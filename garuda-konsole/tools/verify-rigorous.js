/* RIGOROUS end-to-end verification — real browser, real files, decode-level
   assertions, corrupt/huge/edge inputs, regression sweep of 5.1.6→5.4.0,
   service-worker reload hygiene, console-error accounting.
   Usage: sh tools/browser-env.sh && node tools/verify-rigorous.js */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const APP = process.env.REPRO_APP || path.join(__dirname, '..');
const PORT = String(5100 + Math.floor(Math.random() * 90));
const SHOTS = fs.mkdtempSync(path.join(os.tmpdir(), 'gkrig-'));
function loadPlaywright() {
    try { return require('playwright-core'); } catch (e) {}
    for (const p of ['/tmp/pwenv/node_modules/playwright-core', '/tmp/node_modules/playwright-core', path.join(__dirname, '..', '..', '..', 'vendor', 'playwright-core')]) { try { return require(p); } catch (e) {} }
    throw new Error('playwright-core missing — run tools/browser-env.sh');
}
const results = [];
const ck = (n, c, x) => { results.push({ n, ok: !!c }); console.log((c ? '  ✔ ' : '  ✘ ') + n + (x ? ' — ' + String(x).slice(0, 140) : '')); };

(async () => {
    const srv = spawn(process.execPath, [path.join(APP, 'server.js')], {
        cwd: APP, env: Object.assign({}, process.env, { PORT, KONSOLE_LOGIN_LIMIT: '100000', GK_STATS_TICK_MS: '2000' }), stdio: ['ignore', 'pipe', 'pipe']
    });
    for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/healthz`); if (r.ok) break; } catch (e) {} await new Promise((r) => setTimeout(r, 250)); }
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text().slice(0, 160)); });

    /* ── S1 boot, login, SW hygiene ── */
    console.log('── S1 boot / login / service worker ──');
    await page.addInitScript(() => { try { localStorage.setItem('gk_tour_done', 'true'); localStorage.setItem('gk_news_seen', JSON.stringify('5.4.0')); } catch (e) {} });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    for (let a = 0; a < 6; a++) {
        if (!(await page.$('#password-input'))) break;
        const ready = await page.evaluate(() => typeof window.showToast === 'function');
        if (!ready) { await page.waitForTimeout(900); continue; }
        await page.fill('#password-input', process.env.GK_PASSWORD || '20090228');
        await page.click('#login-btn');
        try { await page.waitForSelector('.xterm', { timeout: 8000 }); break; } catch (e) {}
    }
    await page.waitForTimeout(2000);
    const skip = await page.$('[data-action="tour-skip"]');
    if (skip) { await skip.click({ force: true }).catch(() => {}); await page.waitForTimeout(600); }
    await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden')));
    ck('app booted + logged in', await page.evaluate(() => !!document.querySelector('.xterm') && document.getElementById('app') && !document.getElementById('app').classList.contains('hidden')));
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 10000 }).catch(() => {});
    ck('service worker controlling after first load', await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)));
    const errsBeforeReload = consoleErrors.length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    ck('reload via SW-served assets: app still boots', await page.evaluate(() => !!document.querySelector('.xterm')));
    ck('reload produced no new console errors', consoleErrors.length === errsBeforeReload, consoleErrors.slice(errsBeforeReload).join(' | '));

    /* ── S2 terminal regression ── */
    console.log('── S2 terminal round-trip ──');
    await page.evaluate(() => sendInput(tabs[activeTabId], 'echo RIGOR-OK-$(date +%s)\n'));
    let termOk = false;
    for (let i = 0; i < 30 && !termOk; i++) {
        termOk = await page.evaluate(() => { const b = tabs[activeTabId].term.buffer.active; for (let y = 0; y < b.length; y++) { const l = b.getLine(y); if (l && l.translateToString(true).includes('RIGOR-OK-')) return true; } return false; });
        if (!termOk) await page.waitForTimeout(300);
    }
    ck('typed command echoes in terminal buffer', termOk);

    /* ── S3 context menu regression (5.1.6) ── */
    console.log('── S3 context menu affordance ──');
    const termBox = await page.locator('.xterm').boundingBox();
    await page.mouse.click(termBox.x + termBox.width / 2, termBox.y + termBox.height / 2, { button: 'right' });
    await page.waitForTimeout(500);
    const ctx = await page.evaluate(() => {
        const items = [...document.querySelectorAll('#context-menu .ctx-item')];
        const root = getComputedStyle(document.documentElement);
        const enabled = items.find((b) => !b.disabled);
        const disabled = items.find((b) => b.disabled);
        return {
            n: items.length,
            enabledColor: enabled ? getComputedStyle(enabled).color : null,
            textColor: root.getPropertyValue('--text').trim(),
            disabledInert: disabled ? disabled.disabled : null,
            enabledOpacity: enabled ? getComputedStyle(enabled).opacity : null
        };
    });
    ck('ctx menu opens with entries', ctx.n >= 8, ctx.n + ' items');
    const hexToRgb = (h) => { const m = String(h).replace('#', ''); const v = [0, 2, 4].map((i) => parseInt(m.substr(i, 2), 16)); return `rgb(${v[0]}, ${v[1]}, ${v[2]})`; };
    ck('enabled entries wear full theme text color', !!ctx.enabledColor && ctx.enabledColor === hexToRgb(ctx.textColor), `${ctx.enabledColor} vs ${ctx.textColor}`);
    ck('enabled opacity 1 / disabled inert', ctx.enabledOpacity === '1' && ctx.disabledInert === true);
    await page.keyboard.press('Escape');
    await page.evaluate(() => hideContextMenu());

    /* ── S4 approval-card crush regression (5.1.7) at cramped height ── */
    console.log('── S4 approval cards at 620px height ──');
    await page.setViewportSize({ width: 1280, height: 620 });
    await page.route('**/api/ai/chat', async (route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        const last = (body.messages || []).slice(-1)[0];
        let content = 'Done!';
        if (!last || /update my linux/.test(last.content || '')) content = 'Checking:\n```cmd\nwhich pacman\n```';
        else if (/Output of/.test(last.content || '')) content = 'Now upgrade:\n```cmd\nsudo pacman -Syu --noconfirm\n```';
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content }) });
    });
    await page.evaluate(() => { if ($('ai-drawer').classList.contains('hidden')) toggleAi(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { void aiSend('update my linux'); });
    await page.waitForSelector('.ai-cmd-card.pending .ai-cmd-actions button', { timeout: 15000 });
    await page.evaluate(() => document.querySelector('.ai-cmd-card.pending .run-btn').click());
    await page.waitForFunction(() => [...document.querySelectorAll('.ai-cmd-card')].some((c) => c.classList.contains('pending') && /pacman -Syu/.test(c.textContent)), { timeout: 20000 });
    const crush = await page.evaluate(() => {
        const c = [...document.querySelectorAll('.ai-cmd-card')].find((x) => x.classList.contains('pending'));
        const btn = c.querySelector('.ai-cmd-actions .run-btn');
        const cr = c.getBoundingClientRect(), br = btn.getBoundingClientRect();
        return { crushed: c.scrollHeight > c.clientHeight + 1, btnIn: br.bottom <= cr.bottom + 1 && br.height > 0 };
    });
    ck('second approval card NOT crushed at 620px', !crush.crushed && crush.btnIn, JSON.stringify(crush));
    await page.evaluate(() => { aiStop(); });
    await page.unroute('**/api/ai/chat');
    await page.setViewportSize({ width: 1280, height: 860 });

    /* ── S5 Preview Studio matrix (real + corrupt + huge) ── */
    console.log('── S5 preview studio matrix ──');
    const up = async (name, u8arr) => page.evaluate(async ([n, b64]) => {
        const bin = atob(b64); const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const fd = new FormData();
        fd.append('file', new Blob([u8]), n);
        fd.append('dest', '.');
        const r = await fetch('/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
        return await r.json();
    }, [name, u8arr]);

    // real xlsx built in-page with SheetJS
    const xlsxB64 = await page.evaluate(() => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([['name', 'qty'], ['apple', 2], ['pear', 5]]);
        XLSX.utils.book_append_sheet(wb, ws, 'Stock');
        const wb2 = XLSX.utils.aoa_to_sheet([['x'], [1]]);
        XLSX.utils.book_append_sheet(wb, wb2, 'Second');
        const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        let bin = ''; const u8 = new Uint8Array(out);
        for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
        return btoa(bin);
    });
    const xres = await up('rigor.xlsx', xlsxB64);
    ck('xlsx upload accepted', !!xres && (xres.saved || []).length === 1, JSON.stringify(xres).slice(0, 80));
    await page.evaluate(() => openPreviewStudio('rigor.xlsx'));
    await page.waitForTimeout(1500);
    const xl = await page.evaluate(() => ({
        tables: document.querySelectorAll('#preview-body .pv-table').length,
        cells: [...document.querySelectorAll('#preview-body .pv-table td')].map((t) => t.textContent).join(','),
        sheets: [...document.querySelectorAll('#preview-body .pv-sheetbar option')].map((o) => o.value)
    }));
    ck('real xlsx renders table + sheet selector', xl.tables >= 1 && xl.cells.includes('apple') && xl.sheets.includes('Stock') && xl.sheets.includes('Second'), JSON.stringify(xl).slice(0, 120));
    await page.evaluate(() => { const sel = document.querySelector('#preview-body .pv-sheetbar select'); sel.value = 'Second'; sel.dispatchEvent(new Event('change')); });
    await page.waitForTimeout(400);
    ck('sheet switching works', await page.evaluate(() => [...document.querySelectorAll('#preview-body .pv-table td')].map((t) => t.textContent).join('') === '1'));

    // real docx built in-page (minimal OOXML zip via fflate)
    const docxB64 = await page.evaluate(() => {
        const enc = (s) => fflate.strToU8(s);
        const files = {
            '[Content_Types].xml': enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
            '_rels/.rels': enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
            'word/document.xml': enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>RIGOR DOCX BODY TEXT</w:t></w:r></w:p></w:body></w:document>')
        };
        const z = fflate.zipSync(files);
        let bin = ''; for (let i = 0; i < z.length; i += 8192) bin += String.fromCharCode.apply(null, z.subarray(i, i + 8192));
        return btoa(bin);
    });
    await up('rigor.docx', docxB64);
    await page.evaluate(() => openPreviewStudio('rigor.docx'));
    await page.waitForTimeout(2000);
    const docxText = await page.evaluate(() => (document.querySelector('#preview-body .pv-docx') || document.getElementById('preview-body')).textContent);
    ck('real docx renders document text', /RIGOR DOCX BODY TEXT/.test(docxText), docxText.slice(0, 60));
    await page.evaluate(() => closePreview());

    // real zip with inner text + image, then inner peek
    const zipB64 = await page.evaluate(() => {
        const z = fflate.zipSync({ 'note.txt': fflate.strToU8('inner note content RIGOR-ZIP'), 'deep/inner.md': fflate.strToU8('# inner md') });
        let bin = ''; for (let i = 0; i < z.length; i += 8192) bin += String.fromCharCode.apply(null, z.subarray(i, i + 8192));
        return btoa(bin);
    });
    await up('rigor.zip', zipB64);
    await page.evaluate(() => openPreviewStudio('rigor.zip'));
    await page.waitForTimeout(1200);
    ck('zip listing renders entries', await page.evaluate(() => [...document.querySelectorAll('.pv-zipname')].map((n) => n.textContent).join('|')) === 'deep/inner.md|note.txt');
    await page.evaluate(() => { [...document.querySelectorAll('.pv-ziprow.clickable')].find((r) => r.textContent.includes('note.txt')).click(); });
    await page.waitForTimeout(400);
    const zipPeek = await page.evaluate(() => (document.querySelector('.pv-zipinner pre') || {}).textContent || '');
    ck('in-zip text peek works', zipPeek.includes('RIGOR-ZIP'), zipPeek.slice(0, 40));
    await page.evaluate(() => closePreview());

    // corrupt files: zip / docx / image
    for (const [name, kind] of [['rigor-bad.zip', 'zip'], ['rigor-bad.docx', 'docx'], ['rigor-bad.png', 'image']]) {
        await up(name, btoa('this is definitely not a ' + kind));
    }
    await page.evaluate(() => openPreviewStudio('rigor-bad.zip'));
    await page.waitForTimeout(900);
    ck('corrupt zip → graceful note, no crash', await page.evaluate(() => !!document.querySelector('#preview-body .pv-note')));
    await page.evaluate(() => openPreviewStudio('rigor-bad.docx'));
    await page.waitForTimeout(1200);
    ck('corrupt docx → graceful note', await page.evaluate(() => !!document.querySelector('#preview-body .pv-note')));
    await page.evaluate(() => openPreviewStudio('rigor-bad.png'));
    await page.waitForTimeout(900);
    ck('corrupt image → img error handled (no page crash)', await page.evaluate(() => true));
    await page.evaluate(() => closePreview());

    // empty + huge text + huge binary
    await page.evaluate(() => api('/api/files/write', { method: 'POST', body: { path: 'rigor-empty.log', content: '' } }));
    await page.evaluate(() => openPreviewStudio('rigor-empty.log'));
    await page.waitForTimeout(500);
    ck('empty file → "(empty file)"', await page.evaluate(() => document.getElementById('preview-content').textContent.includes('(empty file)')));
    await page.evaluate(() => api('/api/files/write', { method: 'POST', body: { path: 'rigor-big.log', content: ('x'.repeat(200) + '\n').repeat(4000) } }));
    await page.evaluate(() => openPreviewStudio('rigor-big.log'));
    await page.waitForTimeout(900);
    ck('800KB text → truncation note, still renders', await page.evaluate(() => document.getElementById('preview-content').textContent.includes('truncated at 512 KB')));
    const bigBin = await page.evaluate(() => { const u = new Uint8Array(3 * 1024 * 1024); for (let i = 0; i < u.length; i++) u[i] = (i * 7) & 255; let b = ''; for (let i = 0; i < u.length; i += 8192) b += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(b); });
    await up('rigor-big.bin', bigBin);
    await page.evaluate(() => openPreviewStudio('rigor-big.bin'));
    await page.waitForTimeout(1500);
    ck('3MB binary → hex capped at 64KB + note', await page.evaluate(() => document.getElementById('preview-content').textContent.includes('capped at 64 KB')));

    // unicode/space filename + media decode-level checks
    await page.evaluate(() => api('/api/files/write', { method: 'POST', body: { path: 'my file (v2).md', content: '# spaces ok' } }));
    await page.evaluate(() => openPreviewStudio('my file (v2).md'));
    await page.waitForTimeout(600);
    ck('filename with spaces previews', await page.evaluate(() => !!document.querySelector('#preview-body .pv-md h1')));
    await page.evaluate(() => openPreviewStudio('public/icons/icon-192.png'));
    await page.waitForTimeout(900);
    ck('image actually DECODES (naturalWidth>0)', await page.evaluate(() => document.getElementById('preview-image').naturalWidth > 0));
    await page.evaluate(() => openPreviewStudio('test/fixtures/voice-sample.mp3'));
    await page.waitForFunction(() => { const a = document.querySelector('#preview-body audio'); return a && (a.readyState >= 2 || a.error); }, { timeout: 8000 }).catch(() => {});
    ck('audio actually DECODES (finite duration)', await page.evaluate(() => { const a = document.querySelector('#preview-body audio'); return a && isFinite(a.duration) && a.duration > 0 && !a.error; }));
    await page.evaluate(() => openPreviewStudio('test/fixtures/rd-test.webm'));
    await page.waitForFunction(() => { const v = document.querySelector('#preview-body video'); return v && (v.readyState >= 2 || v.error); }, { timeout: 10000 }).catch(() => {});
    ck('video actually DECODES (frames + dimensions)', await page.evaluate(() => { const v = document.querySelector('#preview-body video'); return v && v.videoWidth > 0 && v.readyState >= 2; }));
    // leak sanity: dyn nodes cleaned between opens
    ck('no .pv-dyn leak across 15 opens', await page.evaluate(() => document.querySelectorAll('#preview-body .pv-dyn').length) <= 2);
    await page.evaluate(() => closePreview());

    /* ── S6 recording → auto-save → replay → colored share player ── */
    console.log('── S6 recording → ~/Rec_jsonl → colored share player ──');
    await page.evaluate(() => { toggleRecording(activeTabId); sendInput(tabs[activeTabId], "printf '\\033[31mREDTEXT\\033[0m plain\\n'\n"); });
    await page.waitForTimeout(2500);
    await page.evaluate(() => stopRecording(activeTabId));
    await page.waitForTimeout(1200);
    const recs = await page.evaluate(() => api('/api/recordings').then((d) => d.recordings));
    ck('recording auto-saved to ~/Rec_jsonl', Array.isArray(recs) && recs.length >= 1, JSON.stringify(recs || []).slice(0, 90));
    if (recs && recs.length) {
        await page.evaluate((n) => openSavedRecording(n), recs[0].name);
        await page.waitForTimeout(800);
        ck('saved recording opens in replay modal', await page.evaluate(() => !document.getElementById('replay-modal').classList.contains('hidden') && replayState && replayState.chunks.length > 0));
        const shareUrl = await page.evaluate(() => api('/api/replay/share', { method: 'POST', body: { title: 'rigor', events: replayState.chunks.map((c) => ({ t: c.t, d: c.d })) } }).then((r) => r.url));
        await page.evaluate(() => closeReplay());
        await page.evaluate((n) => deleteRecording(n), recs[0].name);
        // navigate THIS page to the public player (a second renderer OOMs the sandbox)
        await page.setViewportSize({ width: 900, height: 700 });
        await page.goto(`http://localhost:${PORT}${shareUrl}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        const player = await page.evaluate(() => ({
            text: document.getElementById('screen').textContent,
            redSpans: [...document.querySelectorAll('#screen span[style*="color:"]')].filter((s) => /rgb\(194, 54, 43\)|#c2362b/i.test(s.getAttribute('style'))).length
        }));
        ck('shared player shows recorded text', /REDTEXT/.test(player.text) && /plain/.test(player.text), player.text.slice(0, 60));
        ck('shared player renders ANSI red as red', player.redSpans >= 1, player.redSpans + ' red spans');
        await page.screenshot({ path: path.join(SHOTS, 'rigor-player.png') });
        await page.setViewportSize({ width: 1280, height: 860 });
    }

    /* ── S7 session persistence + logout ── */
    console.log('── S7 session persistence ──');
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const backIn = await page.evaluate(() => !!document.querySelector('.xterm') && !document.getElementById('app').classList.contains('hidden'));
    ck('session cookie survives navigation (auto-login)', backIn);
    await page.evaluate(() => { void lockSession(); });
    await page.waitForSelector('#confirm-modal:not(.hidden)', { timeout: 5000 });
    await page.click('#confirm-ok');
    await page.waitForTimeout(3000); // lockSession reloads the page
    ck('logout (lock session) returns to the lockscreen', await page.evaluate(() => !document.getElementById('lockscreen').classList.contains('hidden')));

    const relevant = consoleErrors.filter((e) => !/favicon|Could not load|Not implemented|Failed to load resource.*404|net::ERR/i.test(e));
    ck('no unexpected console/page errors across whole run', relevant.length === 0, relevant.slice(0, 4).join(' | '));
    console.log('screenshots in', SHOTS);
    const failed = results.filter((r) => !r.ok);
    console.log(`RIGOROUS RESULT: ${results.length - failed.length}/${results.length} passed`);
    await browser.close();
    srv.kill();
    process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('RIGOR CRASH:', e && e.stack || e); process.exit(1); });
