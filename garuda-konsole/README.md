# Garuda Konsole 5.0.0 🦅

A complete web terminal **command center** — persistent shells, an **AI agent that runs commands for you**, split panes, session replay, output triggers, live chat, file management and system monitoring, wrapped in a themed glass-neon UI that works beautifully on phones.

![version](https://img.shields.io/badge/version-5.0.0-3daee9) ![node](https://img.shields.io/badge/node-%3E%3D18-2fd07a) ![tests](https://img.shields.io/badge/tests-315%20passing-2fd07a)

---

## 🎉 What's new in 4.0 — “Mission Control”

### 📲 Installable PWA (finally)
Chrome refused to install before because PWAs need **PNG icons** (SVG doesn't count) and a **secure context**. Now shipped: generated `icon-192.png` / `icon-512.png` / maskable icon, manifest `id`, `prefer_related_applications:false`, home-screen **shortcuts** and **share-target**.
**Install requires HTTPS or localhost.** Three easy ways:
1. **USB / adb (quickest for your phone):** `adb reverse tcp:3000 tcp:3000` → open `http://localhost:3000` on the phone → Chrome menu shows **Install app**.
2. **Built-in TLS:** put a cert on the box and run with `KONSOLE_SSL_CERT=/path/cert.pem KONSOLE_SSL_KEY=/path/key.pem node server.js` (e.g. `mkcert` or a Caddy-generated LAN cert) → `https://192.168.x.x:3000` installs cleanly.
3. **Reverse proxy:** Caddy (`tls internal`) or nginx + Let's Encrypt in front of port 3000.

### 🔔 Web Push — notifications with the browser fully closed
VAPID push via the server: background **tasks finishing**, **scheduled runs**, **shell exits**, **long commands finishing while nobody watches**, and **server-side triggers** (your trigger regexes are mirrored to the server and evaluated on pty output). Enable per-device in Settings → Notifications → *Background push*. Requires HTTPS/localhost (push API rule, not ours).

### 🚀 Task Launcher + ⏰ Scheduler
Detached background jobs in their own ptys with ring-buffered tails, kill/re-run, live drawer with running-count badge — plus cron-lite schedules (**every N min / daily HH:MM / once**) that execute **server-side** even with every browser closed. Each run is a task; each task can push-notify.

### 📱 Mobile superpowers
- **Floating control ball** — drag anywhere (edge-snaps, position remembered), tap for a key pad: Esc/Tab/sticky-Ctrl/arrows/C-c/C-l + deck toggle. Collapse the whole keyboard deck permanently.
- **Touch selection that works** — long-press selects the word, horizontal drag selects a range; the soft keyboard and the native copy/paste bubble are suppressed; a custom action bar appears: **Copy · Explain with AI · Fix with AI · Download file · Clear**. Vertical drags still scroll.
- File manager: **thumbnail grid view**, **multi-select** (long-press) with bulk download/delete, and Android **share-sheet → app** uploads into `~/GarudaUploads`.

## 🧠 What's new in 5.0 — voice, brains & polish

### 🗣️ All Groq model families, wired in
| Family | Models | What it powers |
|---|---|---|
| Chat / agent | `qwen/qwen3.8-27b` (default), `openai/gpt-oss-120b`, `openai/gpt-oss-20b` + custom ids | the AI Guide (pick in Settings → AI Guide) |
| TTS | `canopylabs/orpheus-v1-english` (8 voices) | **voice replies**: toggle “Voice replies” or tap 🔊 on any assistant message |
| STT | `whisper-large-v3-turbo`, `whisper-large-v3` | **mic dictation**: the 🎙 button in the AI input bar transcribes your speech into the prompt |

All audio proxies through the server (key never leaves it). *Orpheus needs a one-time terms acceptance in your Groq console — the app shows the exact upstream hint until then.*

### 🩹 Flaw sweep (real-user reported + audit)
- **News modal no longer covers the onboarding tour** — it queues and appears after the tour ends/skips.
- **Task logs are actually readable now**: the tail box scrolls, and the full-log viewer **auto-refreshes every 2 s while the task runs** (title shows “(live)”), auto-follows the bottom, and stops polling when closed.
- **Push “subscribe failed” fixed**: stale subscriptions from rotated VAPID keys are dropped first, subscribe retries once, and the last error is shown in Settings with a retry hint.
- Poll payload shrank 3× (task tails capped in the list; full log on demand).
- Native pickers (time/number/color) follow your theme via `color-scheme`; momentum scrolling on iOS; preview modal hides Download for logs and clears stale images; tour re-positions on rotate.

### 🔔 4.1.3 — notifications that actually fire on mobile
- **One notifier, done right**: Service-Worker `showNotification()` first (the *only* path Android Chrome and installed iOS PWAs honour), `new Notification()` as desktop fallback. Every alert (command finished, trigger, AI approval, task waiting for input) now routes through it.
- **Visible Enable flow**: Settings → Notifications now has a *Device notifications* row with live status (“✓ enabled” / “blocked in site settings” / “HTTP — needs HTTPS or localhost” / “iPhone: install to Home Screen first”) and a one-tap **Enable** button that triggers the real permission prompt inside a user gesture (the old silent page-load request was auto-denied by Chrome without ever showing).
- One-time friendly nudge toast after first login when permission is still undecided.
- Waiting-task alerts also fire as local notifications when the tab is hidden (in addition to server push).

### 🩹 4.1.2 — focus-safe rendering (soft-keyboard killer fixed)
The Tasks poll re-appended rows to keep ordering — and **moving a DOM node blurs a focused input**, so the mobile soft keyboard died mid-typing. Reordering now happens only when the order genuinely changes, placeholders stop churning on focused inputs, and the replay scrubber no longer fights your finger while dragging. Regression-tested: focus survives polls; scrub value survives playback ticks.

### 🩹 4.1.1 — the “pulsing lists” fix
Periodically-refreshed panels (Tasks drawer on its 2.5 s poll, chat on new messages, the AI conversation on every agent update, Activity on new events) used to **rebuild their whole DOM each refresh**, replaying every row's entry animation — a visible pulse/flicker, and on Tasks it could even wipe a password you were mid-typing. All four are now **diff-aware**: existing rows are updated in place (inputs, focus and scroll position preserved), only genuinely new rows animate, and a `.no-anim` guard double-protects against replay. Covered by regression tests (DOM-node identity + typed-input survival).

### ⌨️ 4.1 — Interactive background tasks
- Tasks that **ask for a password / y-n / any prompt** are detected server-side (idle + prompt-pattern heuristic): you get a **push notification** (“Task needs input”), a pulsing **needs-input chip**, and an **input line right in the Tasks drawer** (plus quick `y` / `n` / `^C` buttons). Answers go straight into the task's pty.
- The AI agent also recognises when a command it ran is stuck at a prompt and tells you how to answer or re-run non-interactively.
- Scheduler jobs never stack overlapping runs; task forms default to the shell's current folder.

### ✂️ 4.0.1/4.0.2 — mobile selection & keyboard, tuned on real-device feedback
- Selection stays **simple and predictable**: long-press selects the word and shows the action bar (Copy · Explain · Fix · File · ✕); a horizontal drag extends the range; vertical drag scrolls as always.
- The action bar is anchored at the **top of the screen**, wraps instead of overflowing, and can never end up behind the keyboard deck or off-screen.
- **On-screen keys (deck, floating ball, pinned chips) no longer dismiss your soft keyboard** — pointer-down focus stealing is cancelled and the terminal is re-focused as a safety net, with a JS-driven pressed effect for feedback.

### ⏪ Instant replay & AI polish
- **Replay last 60 s** of any tab from the right-click menu or palette. The ring buffer prunes *inline with incoming output* — no timers, no intervals, zero work while idle, hard-capped at 2 MB/tab (configurable 30 s–5 min or off).
- AI approval cards can never hide: they auto-scroll into view, auto-open the drawer, and notify when the page is hidden. Auto-mode cards are badged. The second-consecutive-task button regression is covered by an E2E test.

---

## 🤖 What's new in 3.1 — AI Guide

Tell it what you want in plain language; it plans the work and **runs the shell commands for you**, reading each result before deciding the next step (powered by Groq · `qwen/qwen3.8-27b`).

| Mode | Behaviour |
|---|---|
| **💬 Chat** | Advisor only. Commands appear as suggestion cards with a manual *Run once* button. |
| **🔐 Ask** (default) | Every command shows an approval card: **Run / Edit / Skip**. The agent waits for you, and skipped commands make it re-plan. |
| **⚡ Auto** | Commands execute as they are proposed — output loops back automatically until the task is done. |

**Hard safety rails, even in Auto:**
- Catastrophic patterns (`rm -rf /` or `~`, `mkfs`, `dd of=/dev/…`, fork bombs, `shutdown/reboot`, raw device writes, `chmod 777 /`, `curl | sh`, `DROP TABLE`, force-push…) **always** demand explicit confirmation with a red warning card.
- Max **12 commands per request** (step limit), per-command output timeout (5–120 s, configurable), **Stop** button that interrupts and sends `Ctrl+C`.
- Your **API key lives server-side only** (`garuda.config.json`, mode 600, or `GROQ_API_KEY` env) — the browser only ever talks to the built-in proxy, which is authenticated, rate-limited (30/min) and input-validated. Spectators cannot use the AI at all.

**Low-tier friendly:** Groq's on-demand tier allows ~1000 output tokens/minute, so requests are capped at 800 `max_tokens` by default (slider in Settings → AI Guide, or `GROQ_MAX_TOKENS`). If a rate limit is still hit mid-task, the agent shows *"waiting Ns…"*, backs off and **retries automatically** instead of failing the run.

Also new: **live cwd + git branch** aware system prompt (the model knows where your shell is), command output capture with ANSI stripping and intelligent trimming, one-tap example prompts, connection test in Settings, and the model id is editable (persisted server-side).

---

## 🚀 What 3.0 brought

### 🧩 Split view
Run **two tabs side by side** (vertical or horizontal), click to focus a pane, `Alt+S` cycles off → side-by-side → stacked. Each pane is a fully independent shell with its own size.

### 🎥 Session recorder & time-travel replay
Record any tab's raw output (up to 8 MB), then **replay it like a video**: play/pause, scrub the timeline, restart, 0.5×–16× speed, and export as `.jsonl`. Recordings live for the page session; the red **REC** chip shows elapsed time.

### ⚡ Triggers & alerts
Watch terminal output with **regular expressions**. When a line matches (`error`, `BUILD SUCCESS`, your name…), fire a **toast**, a **sound**, and/or a **push notification** — per trigger, per scope (all tabs / active tab), with a live test field and a 3 s re-fire cooldown.

### 💬 Session chat
Everyone connected to a tab — host, pair partners, spectators — can **chat in a side drawer** without leaving the terminal. Unread badges, system messages when viewers join/leave, flood-limited on the server.

### 🧬 Tab profiles
Right-click (or long-press) the **+** button: choose the **shell** (fish/bash/zsh/… from a server whitelist), a **start directory**, a **name** and a **color dot** for each new tab.

### 📍 Live cwd + git branch
The server tracks each shell's directory via `/proc` and pushes changes live — the status bar always shows where the active shell is, plus the **git branch with a dirty flag** when inside a repo.

### 🎨 Themes v2
- **6 new light themes** (GitHub Light, Solarized Light, One Light, Catppuccin Latte, Rosé Pine Dawn, Snow Storm) — the entire UI adapts, chrome included
- **Day/night auto-switch** (light 07:00–19:00, dark otherwise, both picks configurable)
- **Export / import themes as JSON** — share your look with friends

### 📜 Activity center & insights
A timeline of everything that matters — long commands and their durations, shell exits/restarts, triggers fired, viewers joining, uploads, recordings — plus session insights (commands run, longest run, triggers fired, session age). Survives refreshes.

### 🗂️ File manager v2
- **Recursive name search** under any folder (depth-limited, loop-safe, 4 s budget)
- **Image preview** (png/jpg/gif/webp/svg/…)
- **Full file details**: permissions, owner uid/gid, size, modified/accessed/created times, symlink targets

### 📌 Pinned macro bar
Pin your favorite macros to a **quick-launch strip** under the toolbar — one tap from anywhere, on desktop and mobile. Pin/unpin from the Macros manager.

### 🧭 Onboarding tour
First login gets a **spotlight tour** of the new UI (also replayable from Settings). Skippable at any keystroke.

### ⚙️ Performance
Terminal output is now **frame-batched** (rAF with a timer safety net so background tabs keep notifying) — huge outputs like `yes | head -n 1000000` stay smooth, and completion notifications still fire when the tab is hidden.

---

## ✨ Everything from 2.0, kept & polished
Session restore on refresh · command palette (`Ctrl+Shift+P`) · file manager with drag & drop upload · system monitor with CPU sparkline · shell revive overlay · mobile command deck (sticky Ctrl, arrows, symbol row, collapsible) · 20 dark themes + custom theme creator · live share & pair programming (24 h expiry) · Alt-Lock select-to-download · toasts everywhere · context menus · log export · PWA install · token auth + rate limiting + hardened file APIs · boot sequence & aurora background (with reduce-motion).

---

## 📁 Project layout

```
garuda-konsole/
├── server.js               # Express 5 + ws + node-pty + Groq AI proxy (never web-served)
├── package.json            # v4.0.0 (deps: express, ws, express-fileupload, node-pty, web-push)
├── garuda.config.json      # created on demand: AI key/model (chmod 600, never web-served)
├── public/                 # everything web-served
│   ├── index.html
│   ├── style.css
│   ├── app.js              # core engine (tabs, split, ws, recorder, triggers…)
│   ├── ui.js               # UI systems (palette, files, chat, replay, tour…)
│   ├── sw.js               # service worker (cache v4.0.0 + web-push handlers)
│   ├── manifest.webmanifest
│   ├── icons/icon.svg / icon-192.png / icon-512.png / icon-maskable-512.png
│   └── custom-themes/      # saved & imported themes (auto-created)
├── tools/make-icons.js     # dependency-free PNG icon generator (rerun to regenerate)
└── test/
    ├── api-test.js         # 109 server/API/WebSocket/AI/tasks/push/share tests (self-booting)
    ├── frontend-test.js    # 163 jsdom E2E tests against a live server
    ├── ai-doctor.js        # shows which Groq key/source is active + live-tests it
    ├── static-check.js     # ID/action/icon/CSS cross-consistency checks
    ├── setup-sandbox.sh    # test env bootstrap when node-pty can't compile
    └── stubs/node-pty/     # child_process stub used only by setup-sandbox.sh
```

## 🚀 Run it

```bash
npm install        # node-pty needs build tools (Debian/Ubuntu: sudo apt install build-essential python3)
npm start          # → http://localhost:3000
```

Default password: `20090228` (unchanged). Override everything via env:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP/WS port |
| `HOST` | `0.0.0.0` | Bind address |
| `KONSOLE_PASSWORD` | `20090228` | Unlock password |
| `KONSOLE_SHELL` | auto (`fish→bash→zsh→sh`) | Default shell |
| `KONSOLE_MAX_SESSIONS` | `40` | Session cap |
| `KONSOLE_LOGIN_LIMIT` | `8` | Login attempts/min/IP |
| `GROQ_API_KEY` | built-in key | Groq key for the AI Guide (Settings UI overrides, saved to `garuda.config.json`) |
| `GROQ_MODEL` | `qwen/qwen3.8-27b` | AI model id |
| `GROQ_MAX_TOKENS` | `800` | Output-token cap per call — keep under your plan's OTPM limit |
| `KONSOLE_SSL_CERT` / `KONSOLE_SSL_KEY` | – | PEM paths → serve HTTPS (enables PWA install + push on LAN) |
| `KONSOLE_INBOX` | `~/GarudaUploads` | Where share-sheet uploads land |

## ⌨️ Shortcuts
`Ctrl+Shift+P` palette · `Ctrl+Shift+F` search · `Alt+T` new tab · `Alt+W` close tab · `Alt+←/→` cycle tabs · **`Alt+S` split cycle** · **`Ctrl+Alt+←/→` pane focus** · `Ctrl+,` settings · `Esc` close overlays. The AI Guide lives in the toolbar (✨), the mobile sheet, and the palette.

## 🧪 Tests
```bash
npm test           # api-test (121) + frontend-test (194) + static-check
```
Each suite boots its own isolated server instance — no manual setup needed.
The AI E2E tests stub `/api/ai/chat` in-page, so they never consume your Groq quota
(the API suite makes exactly two tiny live calls to verify the proxy).
Without build tools for node-pty, run `./test/setup-sandbox.sh` first (swaps in a child_process stub).

## 🔐 Security notes
- Run behind **HTTPS/WSS** (Caddy/nginx) when exposing beyond your LAN.
- Password is exchanged once for a **random session token**; login is rate-limited; the token store is size-capped.
- Share links expire after **24 h**, are revocable, and chat is flood-limited.
- **AI Guide keys never reach the browser** — the server proxies Groq, validates messages, rate-limits (30/min/IP) and sanitizes model ids (no traversal). Destructive shell patterns always require explicit confirmation, in every mode.
- File APIs guard path traversal, refuse to delete protected system paths, and only whitelisted shells can be spawned via profiles.
- `server.js` and `package.json` are **not** web-accessible.

## What's new in 5.1.0 — voice & model toolkit

Everything below rides on the same three model families (chat: Qwen3.8-27B / GPT-OSS-120B / GPT-OSS-20B · TTS: Orpheus · STT: Whisper):

- **Save any AI reply as MP3** — ⬇ button next to the 🔊 on every reply bubble (Orpheus renders it, your browser downloads `garuda-voice-*.mp3`).
- **Read last output aloud** — command palette → “Read last output aloud” speaks the last ~8 lines of the active terminal (handy hands-free).
- **Dictate shell commands** — More sheet → “Voice cmd” (or palette): speak → Whisper transcribes → a confirm gate shows the exact command → it runs in the active tab. Nothing runs without confirmation.
- **Transcribe audio files in the file manager** — any `.mp3/.wav/.m4a/.webm/.ogg/.flac/...` row now has a 💬 transcribe button (server-side, new `GET /api/files/transcribe?path=`, 20 MB cap, auth + rate limited). Result opens in the preview modal.
- **Quick model switcher in the AI drawer** — select next to the model chip; changes the server-side conversation model instantly (no Settings dive).
- **Explain before you run** — every pending approval card has a ❔ Explain button: the chat model describes what the command does and its risks, inline on the card.
- **Voice demo with real artifacts** — `node test/voice-demo.js` boots the server, transcribes a real spoken fixture through your Groq key and writes `test/out/transcription.txt` (+ attempts an MP3 render → `test/out/tts-sample.mp3` once Orpheus terms are accepted).

> TTS note: Orpheus needs a **one-time terms acceptance** in the Groq console (the server surfaces the exact URL if it's missing). STT works out of the box.

Test totals: API **125**, frontend **212**, static checks clean.
