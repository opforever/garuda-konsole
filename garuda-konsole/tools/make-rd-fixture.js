/* Generate test/fixtures/rd-test.webm — a few seconds of canvas-captured VP8
   video via MediaRecorder, used by the Remote-Desktop file-capture mode in
   tests/verification (the sandbox has no ffmpeg/gstreamer). */
'use strict';
const path = require('path');
const fs = require('fs');
function loadPlaywright() {
    try { return require('playwright-core'); } catch (e) {}
    for (const p of ['/tmp/pwenv/node_modules/playwright-core', '/tmp/node_modules/playwright-core', path.join(__dirname, '..', '..', '..', 'vendor', 'playwright-core')]) { try { return require(p); } catch (e) {} }
    throw new Error('playwright-core missing — run: sh tools/browser-env.sh');
}
(async () => {
    const out = process.argv[2] || path.join(__dirname, '..', 'test', 'fixtures', 'rd-test.webm');
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('about:blank');
    const b64 = await page.evaluate(() => new Promise((resolve) => {
        const cv = document.createElement('canvas');
        cv.width = 640; cv.height = 360;
        const ctx = cv.getContext('2d');
        const stream = cv.captureStream(24);
        const rec = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8', videoBitsPerSecond: 800000 });
        const parts = [];
        rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
        rec.onstop = async () => {
            const blob = new Blob(parts, { type: 'video/webm' });
            const buf = await blob.arrayBuffer();
            let bin = '';
            const u8 = new Uint8Array(buf);
            for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
            resolve(btoa(bin));
        };
        let t = 0;
        rec.start(200);
        const iv = setInterval(() => {
            t++;
            ctx.fillStyle = t % 2 ? '#101418' : '#141a20';
            ctx.fillRect(0, 0, 640, 360);
            ctx.fillStyle = '#3daee9';
            ctx.fillRect(40 + (t * 7) % 480, 60, 80, 40);
            ctx.fillStyle = '#2fd07a';
            ctx.font = '28px monospace';
            ctx.fillText('GARUDA RD TEST ' + t, 40, 200);
            ctx.fillStyle = '#f6a609';
            ctx.fillText('frame ' + t, 40, 250);
            if (t >= 72) { clearInterval(iv); rec.stop(); }
        }, 1000 / 24);
    }));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    console.log('wrote', out, fs.statSync(out).size, 'bytes');
    await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
