/* AI Doctor — shows EXACTLY which Groq key your server will use, and live-tests it.
   Run:  node test/ai-doctor.js
   Mirrors server.js resolution order: garuda.config.json → GROQ_API_KEY env → built-in default */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'garuda.config.json');
const SERVER_FILE = path.join(ROOT, 'server.js');

function mask(k) {
    if (typeof k !== 'string' || k.length < 12) return '(none)';
    return k.slice(0, 10) + '•'.repeat(8) + k.slice(-4) + `  [len ${k.length}]`;
}

/* 1. Config file */
let cfg = {};
if (fs.existsSync(CONFIG_FILE)) {
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) {
        console.log(`⚠ ${CONFIG_FILE} exists but is corrupt JSON — the server will ignore it.`);
    }
} else {
    console.log('· no garuda.config.json (nothing stored via the Settings UI)');
}

/* 2. Env */
const envKey = process.env.GROQ_API_KEY || null;

/* 3. Built-in default parsed straight from server.js (always matches your deploy) */
let defKey = null;
try {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    const m = src.match(/DEFAULT_GROQ_KEY\s*=\s*process\.env\.GROQ_API_KEY\s*\|\|\s*'([^']+)'/);
    if (m) defKey = m[1];
} catch (e) {}

let key, source;
if (typeof cfg.groqKey === 'string' && cfg.groqKey.length >= 8) { key = cfg.groqKey; source = 'garuda.config.json (Settings UI save)'; }
else if (envKey) { key = envKey; source = 'GROQ_API_KEY environment variable'; }
else { key = defKey; source = 'built-in default in server.js'; }

console.log('──────────────────────────────────────────────');
console.log('Key source :', source);
console.log('Key value  :', mask(key));
console.log('Config key :', cfg.groqKey ? mask(cfg.groqKey) : '(not set)');
console.log('Env key    :', envKey ? mask(envKey) : '(not set)');
console.log('Default key:', mask(defKey));

const model = (typeof cfg.groqModel === 'string' && cfg.groqModel) || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const maxTok = parseInt(cfg.groqMaxTokens ?? process.env.GROQ_MAX_TOKENS ?? '800', 10) || 800;
console.log('Model      :', model, '| max_tokens:', maxTok);
console.log('──────────────────────────────────────────────');

if (!key) {
    console.log('✖ No key found anywhere. Fix: unset the env var / delete the config file / restore server.js default.');
    process.exit(1);
}

(async () => {
    /* Live test 1: key validity */
    let r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) {
        const body = await r.json().catch(() => null);
        console.log(`✖ LIVE TEST FAILED — HTTP ${r.status}:`, JSON.stringify(body).slice(0, 240));
        console.log('');
        console.log('  → If 401 "Invalid API Key": the key above (from "' + source + '") is wrong/revoked.');
        console.log('    Fix: rm -f garuda.config.json   (and in fish:  set -e GROQ_API_KEY )');
        console.log('    Then re-run this doctor — it should fall back to the built-in default.');
        process.exit(1);
    }
    console.log('✓ key accepted by Groq (HTTP 200 on /models)');

    /* Live test 2: chat completion with your real model + token cap */
    const t0 = Date.now();
    r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: DOCTOR_OK' }], max_tokens: Math.min(maxTok, 64), temperature: 0 })
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
        console.log(`✖ CHAT TEST FAILED — HTTP ${r.status}:`, JSON.stringify(j).slice(0, 300));
        if (r.status === 429) console.log('  → Rate limit: wait a minute, or lower max_tokens (Settings → AI Guide).');
        process.exit(1);
    }
    console.log(`✓ chat completion OK in ${Date.now() - t0} ms — model replied: ${JSON.stringify((j.choices && j.choices[0].message.content || '').slice(0, 60))}`);
    console.log('');
    console.log('ALL GOOD — if the app still shows "Invalid API Key", your RUNNING server process');
    console.log('was started before the fix: stop it (Ctrl+C) and run  node server.js  again.');
})().catch((e) => { console.log('✖ network error:', e.message); process.exit(1); });
