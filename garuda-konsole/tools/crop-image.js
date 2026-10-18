/* Crop + zoom a PNG region (for inspecting user screenshots pixel-by-pixel).
   Usage: node tools/crop-image.js <src.png> <out.png> <x> <y> <w> <h> [zoom]

   WHY NOT THE NAIVE WAY: opening file://image.png in Chromium and moving the
   <img> with negative offsets does NOT work — Chrome's built-in image viewer
   auto-fits large images to the viewport, so every "crop" returns the whole
   picture scaled down (or black bars). The reliable way is a <canvas> fed by
   a data: URI (no file-access restrictions), drawImage with a source rect. */
'use strict';
const fs = require('fs');
const path = require('path');

function loadPlaywright() {
    try { return require('playwright-core'); } catch (e) {}
    for (const p of ['/tmp/pwenv/node_modules/playwright-core', '/tmp/node_modules/playwright-core']) {
        try { return require(p); } catch (e) {}
    }
    throw new Error('playwright-core not found — run: sh tools/browser-env.sh');
}

(async () => {
    const [src, out, X, Y, W, H, Z] = [process.argv[2], process.argv[3], +process.argv[4], +process.argv[5], +process.argv[6], +process.argv[7], +(process.argv[8] || 2)];
    if (!src || !out || ![X, Y, W, H].every((n) => Number.isFinite(n))) {
        console.log('usage: node tools/crop-image.js <src.png> <out.png> <x> <y> <w> <h> [zoom]');
        process.exit(1);
    }
    const b64 = fs.readFileSync(path.resolve(src)).toString('base64');
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const cw = Math.ceil(W * Z), ch = Math.ceil(H * Z);
    const page = await browser.newPage({ viewport: { width: cw, height: ch } });
    await page.setContent(`<body style="margin:0;background:#222"><canvas id="c" width="${cw}" height="${ch}"></canvas>
    <script>
      const img = new Image();
      img.onload = () => {
        const c = document.getElementById('c').getContext('2d');
        c.drawImage(img, ${X}, ${Y}, ${W}, ${H}, 0, 0, ${cw}, ${ch});
        document.title = 'done';
      };
      img.src = 'data:image/png;base64,${b64}';
    </script></body>`);
    await page.waitForFunction(() => document.title === 'done', { timeout: 15000 });
    await page.locator('#c').screenshot({ path: out });
    await browser.close();
    console.log('saved', out);
})().catch((e) => { console.error(e); process.exit(1); });
