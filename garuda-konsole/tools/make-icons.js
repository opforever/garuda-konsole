/* Generates the PWA PNG icons (192, 512, maskable 512) with zero dependencies.
   Usage: node tools/make-icons.js   → writes public/icons/icon-192.png, icon-512.png, icon-maskable-512.png
   PNG encoding is done manually (IHDR/IDAT/IEND + zlib) — deterministic, no canvas needed. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ── CRC32 ── */
const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}
function encodePNG(size, rgba) {
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // color type RGBA
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    // scanlines with filter byte 0
    const raw = Buffer.alloc(size * (size * 4 + 1));
    for (let y = 0; y < size; y++) {
        const rowStart = y * (size * 4 + 1);
        raw[rowStart] = 0;
        rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
    }
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ── drawing helpers ── */
function hex(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
const C_TOP = hex('#182031');
const C_BOT = hex('#080b11');
const C_STAR_A = hex('#00f2fe');
const C_STAR_B = hex('#3daee9');
const C_STAR_C = hex('#9b59b6');
const C_CORE = hex('#ffffff');

function starRadius(angle, Ro, Ri) {
    /* 8-point star: |cos(4θ)|^1.4 interpolation between inner and outer radius */
    const lobes = Math.pow(Math.abs(Math.cos(4 * angle)), 1.4);
    return Ri + (Ro - Ri) * lobes;
}

function renderIcon(size, opts) {
    const maskable = !!opts.maskable;
    const buf = Buffer.alloc(size * size * 4);
    const cx = size / 2, cy = size / 2;
    const cornerR = size * 0.21;
    const scale = maskable ? 0.62 : 0.86; // maskable keeps art inside the safe zone
    const Ro = size * 0.40 * scale;
    const Ri = Ro * 0.44;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            let r = 0, g = 0, b = 0, a = 0;

            /* rounded-rect mask (skip for maskable = full bleed) */
            let cover = 1;
            if (!maskable) {
                const dx = Math.max(cornerR - x, x - (size - 1 - cornerR), 0);
                const dy = Math.max(cornerR - y, y - (size - 1 - cornerR), 0);
                const d = Math.sqrt(dx * dx + dy * dy);
                cover = Math.min(1, Math.max(0, cornerR - d + 0.5));
            }
            if (cover <= 0) { buf[i + 3] = 0; continue; }

            /* background vertical gradient + center glow */
            const t = y / size;
            let bg = mix(C_TOP, C_BOT, t);
            const dc = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / (size * 0.55);
            const glow = Math.max(0, 1 - dc) * 0.16;
            bg = mix(bg, C_STAR_B, glow);
            r = bg[0]; g = bg[1]; b = bg[2]; a = 1;

            /* star */
            const sx = x - cx, sy = y - cy;
            const dist = Math.sqrt(sx * sx + sy * sy);
            const ang = Math.atan2(sy, sx);
            const edge = starRadius(ang, Ro, Ri);
            const aa = 1.4;
            const sc = Math.min(1, Math.max(0, (edge - dist) / aa + 0.5));
            if (sc > 0) {
                const diag = ((x + y) / (2 * size));
                let col = diag < 0.5 ? mix(C_STAR_A, C_STAR_B, diag * 2) : mix(C_STAR_B, C_STAR_C, (diag - 0.5) * 2);
                r = r + (col[0] - r) * sc; g = g + (col[1] - g) * sc; b = b + (col[2] - b) * sc;
            }
            /* white core */
            const coreR = Ro * 0.20;
            const cc = Math.min(1, Math.max(0, (coreR - dist) / aa + 0.5));
            if (cc > 0) { r = r + (C_CORE[0] - r) * cc; g = g + (C_CORE[1] - g) * cc; b = b + (C_CORE[2] - b) * cc; }
            /* core glow */
            const glowR = Ro * 0.34;
            if (dist < glowR && dist >= coreR) {
                const gl = (1 - (dist - coreR) / (glowR - coreR)) * 0.35;
                r = r + (255 - r) * gl; g = g + (255 - g) * gl; b = b + (255 - b) * gl;
            }

            buf[i] = Math.round(r);
            buf[i + 1] = Math.round(g);
            buf[i + 2] = Math.round(b);
            buf[i + 3] = Math.round(a * 255 * cover);
        }
    }
    return encodePNG(size, buf);
}

const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });
const jobs = [
    ['icon-192.png', 192, {}],
    ['icon-512.png', 512, {}],
    ['icon-maskable-512.png', 512, { maskable: true }]
];
for (const [name, size, opts] of jobs) {
    const png = renderIcon(size, opts);
    fs.writeFileSync(path.join(OUT, name), png);
    console.log(`✓ ${name} (${png.length} bytes, ${size}×${size})`);
}
console.log('done');
