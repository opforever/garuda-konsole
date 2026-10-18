/* Voice pipeline demo — produces REAL artifact files you can open:
     test/out/voice-sample.mp3     (input fixture copy — the spoken test phrase)
     test/out/transcription.txt    (what YOUR Groq Whisper heard)
     test/out/transcription.json   (raw API response)
     test/out/tts-sample.wav       (Orpheus TTS output — only if terms accepted)
     test/out/tts-status.txt       (what happened with TTS either way)
   Usage: node test/voice-demo.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || '3197';
const B = `http://localhost:${PORT}`;
const OUT = path.join(__dirname, 'out');
const FIXTURE = path.join(__dirname, 'fixtures', 'voice-sample.mp3');

fs.mkdirSync(OUT, { recursive: true });

const serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), KONSOLE_LOGIN_LIMIT: '100000' }),
    stdio: ['ignore', 'pipe', 'pipe']
});
serverProc.stdout.on('data', () => {});
serverProc.stderr.on('data', (d) => process.stderr.write('[srv] ' + d));

async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        try { const r = await fetch(B + '/healthz'); if (r.ok) return; } catch (e) {}
        await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('demo server did not start on ' + B);
}

(async () => {
    let exitCode = 0;
    try {
        await waitForServer();
        console.log('═══ Garuda Konsole voice demo ═══\n');

        const lr = await fetch(`${B}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: '20090228' }) });
        const lj = await lr.json();
        const H = { Authorization: `Bearer ${lj.token}` };

        /* 1) Speech-to-text round trip with a REAL spoken mp3 (via file-manager endpoint) */
        fs.copyFileSync(FIXTURE, path.join(OUT, 'voice-sample.mp3'));
        console.log('1) STT: transcribing the spoken fixture via /api/files/transcribe …');
        const tr = await fetch(`${B}/api/files/transcribe?path=${encodeURIComponent(FIXTURE)}`, { headers: H });
        const tj = await tr.json().catch(() => null);
        fs.writeFileSync(path.join(OUT, 'transcription.json'), JSON.stringify(tj, null, 2));
        if (tr.status === 200 && tj && tj.text) {
            fs.writeFileSync(path.join(OUT, 'transcription.txt'), tj.text + '\n');
            const lower = tj.text.toLowerCase();
            const heard = ['fox', 'brown', 'lazy', 'dog', 'terminal'].filter((w) => lower.includes(w));
            console.log(`   ✔ Whisper heard: "${tj.text}"`);
            console.log(`   ✔ matched spoken words: ${heard.join(', ') || '(none!)'}  [model: ${tj.model}]`);
            if (!heard.length) { console.log('   ⚠ transcription did not contain the expected words'); exitCode = 1; }
        } else {
            fs.writeFileSync(path.join(OUT, 'transcription.txt'), `FAILED: HTTP ${tr.status} ${JSON.stringify(tj)}\n`);
            console.log(`   ✘ STT failed: HTTP ${tr.status} ${JSON.stringify(tj)}`);
            exitCode = 1;
        }

        /* 2) Text-to-speech: render audio through /api/ai/speech (WAV — upstream retired MP3) */
        console.log('\n2) TTS: rendering audio via /api/ai/speech …');
        const sr = await fetch(`${B}/api/ai/speech`, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, H),
            body: JSON.stringify({ text: 'Hello from Garuda Konsole. Voice rendering works.' })
        });
        if (sr.status === 200) {
            const buf = Buffer.from(await sr.arrayBuffer());
            fs.writeFileSync(path.join(OUT, 'tts-sample.wav'), buf);
            fs.writeFileSync(path.join(OUT, 'tts-status.txt'), `OK — wrote tts-sample.wav (${buf.length} bytes)\n`);
            console.log(`   ✔ Audio written: test/out/tts-sample.wav (${buf.length} bytes) — play it!`);
        } else {
            const sj = await sr.json().catch(() => null);
            const msg = `HTTP ${sr.status}: ${JSON.stringify(sj)}`;
            fs.writeFileSync(path.join(OUT, 'tts-status.txt'), msg + '\n\nIf this says "terms acceptance", open the console URL once (org admin), accept, and re-run.\n');
            console.log(`   ⚠ TTS not available yet — ${msg}`);
            console.log('   ⚠ (expected until Orpheus terms are accepted in the Groq console — see tts-status.txt)');
        }

        console.log('\nArtifacts in test/out/:');
        for (const f of fs.readdirSync(OUT)) console.log('  •', f);
        console.log(exitCode === 0 ? '\n═══ DEMO PASSED ═══' : '\n═══ DEMO COMPLETED WITH WARNINGS ═══');
    } catch (e) {
        console.error('demo crashed:', e);
        exitCode = 1;
    } finally {
        serverProc.kill('SIGTERM');
        process.exit(exitCode);
    }
})();
