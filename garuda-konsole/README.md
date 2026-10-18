# Garuda Konsole 5.2.0 🦅

A complete web terminal **command center** — persistent shells, an **AI agent that runs commands for you**, split panes, session replay, output triggers, live chat, file management and system monitoring, wrapped in a themed glass-neon UI that works beautifully on phones.

![version](https://img.shields.io/badge/version-5.2.0-3daee9) ![node](https://img.shields.io/badge/node-%3E%3D18-2fd07a) ![tests](https://img.shields.io/badge/tests-433%20passing-2fd07a)

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
| TTS | `canopylabs/orpheus-v1-english` (6 voices) | **voice replies**: toggle “Voice replies” or tap 🔊 on any assistant message |
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
npm test           # api-test (143) + frontend-test (240) + static-check
```
Each suite boots its own isolated server instance — no manual setup needed.
The AI E2E tests stub `/api/ai/chat` in-page, so they never consume your Groq quota
(the API suite makes a handful of tiny live calls to verify the proxies).
Without build tools for node-pty, run `./test/setup-sandbox.sh` first (swaps in a child_process stub).

## 🔐 Security notes
- Run behind **HTTPS/WSS** (Caddy/nginx) when exposing beyond your LAN.
- Password is exchanged once for a **random session token**; login is rate-limited; the token store is size-capped.
- Share links expire after **24 h**, are revocable, and chat is flood-limited.
- **AI Guide keys never reach the browser** — the server proxies Groq, validates messages, rate-limits (30/min/IP) and sanitizes model ids (no traversal). Destructive shell patterns always require explicit confirmation, in every mode.
- File APIs guard path traversal, refuse to delete protected system paths, and only whitelisted shells can be spawned via profiles.
- `server.js` and `package.json` are **not** web-accessible.

## 🚀 What's new in 5.2.0 — five requested features, one release

1. **Per-tab process-health badge** — the server samples every session's process subtree from `/proc` each tick (CPU jiffies + RSS); a tab whose tree spikes gets a pulsing **🔥** (or **⏳** for a command running past the threshold) with a details tooltip, plus an *optional* push via Settings → "Tab health alerts". Thresholds are env knobs: `GK_HEALTH_CPU` (default 90 %/core), `GK_HEALTH_RSS_MB` (1536), `GK_HEALTH_MIN` (10), `GK_STATS_TICK_MS` (5000). With never-dying tabs, you can finally see *which* tab eats the box.
2. **Saved workspace layouts (any device)** — palette → *"Save current layout…"* stores tabs (id/title/color), split mode/focus, active tab and each shell's **live cwd** server-side. *"Restore layout: …"* reconnects to still-alive shells (persistent memory!) or spawns fresh ones and `cd`s back. On a brand-new device with no local tabs, login **offers to restore** your newest layout.
3. **In-browser file editor** — Files → ✎ opens a mono sheet: Ctrl+S saves, dirty dot, discard guard on close. Server writes **atomically** (tmp + rename), keeps one `.bak` generation, answers **409** when the file changed on disk since you opened it (with an overwrite confirm), caps at 5 MB and refuses protected system paths. Fix a config line from your phone at last.
4. **System monitor: last hour + process manager** — a server-side ring buffer (720 samples: cpu/mem/net/disk) renders as four sparklines ("Last hour"), and a top-60 **process list** adds per-row renice ↑/↓, `stop` (SIGTERM) and `kill` (SIGKILL, confirmed) — all behind `pidGuard`: pid 1, the server itself, its whole ancestor chain and other users' pids are refused.
5. **Replay share links** — the replay modal gains *share as public link*: the recording is stored for 24 h and minted into a token URL serving a **dependency-free public player** (`replay.html`: play/pause, speed, scrubber, ANSI-stripped timeline, read-only badge) — plus *download .cast* (asciinema v2) for `agg`/`asciinema` tooling. The token is the capability; creating shares still requires auth.

Guards & proof: 29 new API checks (layouts CRUD; write/.bak/409/protected/missing-dir; kill & renice guard matrix incl. a real spawned process; history ring; replay share → public fetch → 404; **live busy-loop → hot push → idle ok over a real WS**), 16 new frontend E2E checks, a static-guard for the 5.2 surface, and `tools/verify-features-52.js` — a 12-point headless-Chromium feature verification with screenshots (editor sheet, monitor drawer, 🔥 tab badge, public player). Suite: **API 172, frontend 261, statics green**. Version lockstep 5.2.0 incl. `?v=` cache-bust and SW cache; `replay.html` added to the SW shell.

## 🩹 What's new in 5.1.7 — approval buttons can't hide anymore (scroll, never crush)

Real-world bug report: *"the second approval card gives no Run/Edit/Skip buttons at 100% zoom — at 90% zoom they appear; ctrl+ / ctrl− zoom breaks things visible on the page."*

Root cause: `.ai-messages` (and `.chat-messages`, `.drawer-body`, `.server-sessions-list`) are **scrollable flex columns**, but their children kept the default `flex-shrink: 1`. The moment a conversation grew taller than the pane, the browser **compressed the children** instead of scrolling — and because `.ai-cmd-card` clips with `overflow: hidden`, a squeezed approval card lost exactly its action row. The buttons were always in the DOM; zooming out made everything fit again, which is why 90% "fixed" it and 100% hid them.

- **Children of scrollable flex columns are now `flex-shrink: 0`** — the pane scrolls instead of squashing its content, at every zoom level and viewport size (this is also why ctrl+/− appeared to "break" panels: each zoom level produced a different crush).
- Approval cards carry an explicit extra `flex-shrink: 0` guard for any nested flex context.
- Guarded by a static check (`SCROLL-CRUSH:START/END`), and verified in headless Chromium at 560/640/900px-tall viewports: the pre-fix build crushes the pending card (83px of content in a 77px box, pane never scrolls); the fixed build keeps the card intact and the pane scrolls.

Usual version lockstep: asset URLs `?v=5.1.7`, SW cache `garuda-konsole-v5.1.7`, package/server/APP_VERSION, README.

## 🎨 What's new in 5.1.6 — the right-click menu finally looks clickable

Real-world bug report: *"the buttons that appear when you right click the screen are still grayed out even though they still work."*

Two root causes, both closed:

- **Gray in engines without `color-mix()`.** The 5.1.4 idle-brightening blends with `color-mix()`; engines without it (older WebViews/Safari) fell back to `var(--text-dim)` — the literal grayed-out look — on every menu entry. Context-menu items now idle in the theme's **full `--text` color** (no blend, no fallback trap): crisp in every engine, all 26 built-in themes and custom JSON themes. Destructive entries idle in the danger hue so their intent reads at a glance; keyboard hints were lifted from `--text-faint` to `--text-dim`.
- **"Disabled" that wasn't.** Inert entries were faked with inline `opacity:.4; pointer-events:none` on *live* buttons. `openCtxMenu()` now sets the native `disabled` attribute — the browser makes them truly inert and the AFFORDANCE `:disabled` rule styles them (dimmed, desaturated, `not-allowed`). **Gray now always means off; everything that works is full-brightness.**

**Bonus — stale-cache trap closed:** the PWA service worker serves `style.css` / `app.js` / `ui.js` cache-first under unversioned URLs, so clients riding an old service worker could keep rendering old (gray) styles no matter how many fixes shipped. Asset URLs are now **version-busted** (`style.css?v=5.1.6`) in lockstep with the package version (static-check enforced); an old SW can never have the new URLs in cache, so the first load after a deploy always fetches the fresh assets.

Guards: static checks enforce the `CTX-AFFORDANCE` section, the native-disabled behavior in `openCtxMenu`, and the version-bust lockstep (index.html ↔ sw.js ↔ package.json); the frontend E2E opens a real context menu and asserts enabled entries are crisp & clickable while gray entries are inert.

Suite green: API 143, frontend 245, static checks. Version 5.1.6 (package, lock, server, APP_VERSION, sw cache + SHELL), README.

## 🩹 What's new in 5.1.5 — Stop means stop (silences the voice too)

Real-world bug report: *with voice replies enabled, the AI keeps talking after you hit the agent's **Stop** button.*

Two bugs, one fix:

- **`aiStop()` never touched the speech player** — it stopped the agent run, but the spoken reply already playing (or still rendering) kept talking over it. Stop now calls `stopSpeaking()` first.
- **A race made Stop unreliable even in principle**: `speakText()` awaits the TTS network render before an audio element exists, so hitting Stop *while a reply was still rendering* found nothing to pause — and the voice then **started playing after the stop**. Speech now carries a generation token: `stopSpeaking()` (and every newer speech) invalidates any in-flight render, which aborts instead of playing late.
- Bonus hardening: an ending clip can no longer null out a *newer* clip's audio reference (stale `onended` guard), and clearing the conversation silences speech too (it routes through `aiStop`).

Tests (+7, verified red against pre-fix code): stop-mid-render never plays, `speakText` resolves false when stopped, normal playback + pause works, **`aiStop` silences the playing voice** while still stopping the run. Frontend **240**, API **143**, static checks clean.

## 🎨 What's new in 5.1.4 — buttons finally look clickable

Real-world bug report: *"most of the buttons seem grayed out like we can't use them — even though we can. It's a design flaw."*

Correct — and systemic. Every secondary control (toolbar icon buttons, ghost/mini buttons, tabs, status-bar buttons, context-menu items, pinned chips, AI-mode buttons, selects…) idled in `--text-dim`, which themes derive as text mixed **62% toward the background**. Result: washed-out controls that read as "disabled", while *actually* disabled controls had almost no distinct styling — so enabled and disabled were visually the same muted gray.

- **Idle interactive elements now use a theme-aware blend** (`color-mix` of the theme's own `--text`/`--text-dim`), applied in one central section that wins the cascade. Measured WCAG contrast of idle controls vs background:
  - dark themes: **3.2:1 → 11.6:1** (derived themes; the static default goes 7.1:1 → 11.6:1)
  - light themes: **2.2:1 → 8.9:1** — the old value was *below the 3:1 WCAG minimum for UI components*, which is exactly why everything looked off
  - works for all 26 built-in themes **and custom theme JSON** (it blends each theme's own variables); engines without `color-mix()` keep the previous color via declaration fallback
- **Real disabled states are now visually distinct**: dimmed, desaturated, `not-allowed` cursor (buttons, selects, inputs) — "off" finally looks off, so "on" looks on.
- State styles (`.toggled`, `.active`, `.on`, hover glows) keep precedence — the neon look is untouched, just no longer muted at rest.
- Guarded by a new static check (the `AFFORDANCE:START/END` section must stay intact), so a future theme pass can't silently reintroduce the flaw.

## 🩹 What's new in 5.1.3 — voice replies & MP3 export work again (upstream churn)

Real-world bug report: *"MP3 failed — voice must be one of the following voices: [autumn diana hannah austin daniel troy]"*.

Groq churned the Orpheus TTS API twice, and the app had the old contract hardcoded:

- **Voice catalog retired**: the original eight voices (`tara`, `leah`, `jordan`, `kyle`, `carlos`, `annie`, `matthew`, `nicole`) are gone — upstream now accepts only **`autumn`, `diana`, `hannah`, `austin`, `daniel`, `troy`**. Every TTS request (🔊 voice replies, ⬇ MP3 export, "read last output aloud") failed with the error above — even the default voice was a dead one.
- **MP3 output retired**: `response_format` now only accepts **`wav`** — discovered live while testing the voice fix.

Fixes:
- Server catalog updated to the six current voices; default is `autumn`. Unknown/retired voices in a request (or in your saved settings) are mapped onto the catalog instead of being forwarded to fail.
- **Self-healing against future churn**: if upstream ever rejects a voice again, the server retries once with its current default before giving up (a voice error can no longer hard-fail TTS).
- Speech endpoint now requests/serves **WAV**; the download button saves `garuda-voice-*.wav` (extension follows the served content-type), labels/toasts say "audio (WAV)" instead of MP3. Playback paths are format-agnostic and unchanged.
- The voice picker in Settings populates from the server catalog (as before) and a stale saved voice now snaps to the first valid option instead of showing a blank select.

Tests (+6 net; verified red against pre-fix code — the old code reproduces the exact upstream error): API **143** (catalog currency, retired-voice exclusion, legacy-voice mapping with a live upstream call, current-voice live call), frontend **233** (default voice, picker normalization, `.wav` download naming).

## 🩹 What's new in 5.1.2 — stop painting pixels nobody can see

Real-world bug report: *"why is there a background animation running? wasting resources for no reason and you can't even see it — the terminal is solid."*

Exactly right. The **aurora canvas is lockscreen ambience** (the HTML comment says so), but `enterApp()` hid the lockscreen and never stopped the animation: a `requestAnimationFrame` loop kept doing an **O(n²) particle-link pass (up to ~3.5k pair checks) plus a full-screen canvas repaint — every frame, forever**, behind the opaque terminal UI. On a phone that's constant CPU/GPU burn (and battery) for invisible pixels. The CSS orbs/grid were already free once the lockscreen went `display:none` — the canvas was the leak.

- `refreshAuroraMotion()` now runs the loop **only while the lockscreen is visible** (and motion isn't reduced): on unlock the rAF is cancelled, the canvas is cleared *and* set `display:none` so it isn't even composited.
- Wired into every transition: host unlock (`enterApp`), viewer sessions, and re-shown lockscreen (logout reloads, so ambience returns naturally).
- The lockscreen itself keeps its full animated look — nothing visible was removed.

Tests: frontend **230** (+7 lifecycle checks — stopped after unlock, rAF cancelled, canvas not composited, resumes for the lockscreen, reduce-motion still honored). Verified red against the pre-fix code.

## 🩹 What's new in 5.1.1 — notifications that survive blocked push services

Real-world bug report: *"Push subscribe failed — push service error"* and *"no notification when a task needs input"*. Root causes & fixes:

- **Web Push needs FCM, and FCM isn't reachable everywhere** (blocked networks, offline devices). That part is environmental — but alerts no longer depend on it: **every server alert (task waiting / task finished / triggers) is now also mirrored to open tabs over the existing WebSocket connections**. Any open Garuda tab = instant in-app alerts, no push service, no subscription needed. System notifications fire from hidden tabs; a toast appears when you're looking at the app. Viewers never receive them (host-private).
- **The local fallback for waiting tasks was unreachable dead code**: the Tasks poll only ran while the tab was *visible*, but its notification only fired while the tab was *hidden* — mutually exclusive, so it could never alert. The poll now evaluates waiting-task alerts even when hidden (and skips DOM work), and the 20 s badge poll does the same when the Tasks drawer is closed.
- **A task that prompts twice only alerted once**: new output cleared the `waiting` flag but not the "already notified" flag, so the second prompt (e.g. password → OTP) was silent. Flags now reset together, and every new prompt episode re-alerts.
- **Waiting tasks re-alert while still stuck** — a reminder every 5 min (`KONSOLE_TASK_REMIND_MS`, max 3) so a missed first alert never strands a task. The first alert now quotes the actual prompt line.
- **Honest push settings copy**: when subscribing fails because the push service is unreachable, Settings → Notifications explains that it's a device/network limitation and that in-app alerts over the live connection still work — instead of a scary generic error.

Test totals: API **140** (+9: WS mirror delivery, multi-host broadcast, viewer exclusion, reminders, re-prompt episodes), frontend **223** (+11: hidden-tab notification paths, tag dedup, toast-vs-notification routing, push copy). All new tests were verified to fail against the pre-fix code.

## What's new in 5.1.0 — voice & model toolkit

Everything below rides on the same three model families (chat: Qwen3.8-27B / GPT-OSS-120B / GPT-OSS-20B · TTS: Orpheus · STT: Whisper):

- **Save any AI reply as MP3** — ⬇ button next to the 🔊 on every reply bubble (Orpheus renders it, your browser downloads `garuda-voice-*.mp3`).
- **Read last output aloud** — command palette → “Read last output aloud” speaks the last ~8 lines of the active terminal (handy hands-free).
- **Dictate shell commands** — More sheet → “Voice cmd” (or palette): speak → Whisper transcribes → a confirm gate shows the exact command → it runs in the active tab. Nothing runs without confirmation.
- **Transcribe audio files in the file manager** — any `.mp3/.wav/.m4a/.webm/.ogg/.flac/...` row now has a 💬 transcribe button (server-side, new `GET /api/files/transcribe?path=`, 20 MB cap, auth + rate limited). Result opens in the preview modal.
- **Quick model switcher in the AI drawer** — select next to the model chip; changes the server-side conversation model instantly (no Settings dive).
- **Explain before you run** — every pending approval card has a ❔ Explain button: the chat model describes what the command does and its risks, inline on the card.
- **Voice demo with real artifacts** — `node test/voice-demo.js` boots the server, transcribes a real spoken fixture through your Groq key and writes `test/out/transcription.txt` (+ attempts an audio render → `test/out/tts-sample.wav` once Orpheus terms are accepted).

> TTS note: Orpheus needs a **one-time terms acceptance** in the Groq console (the server surfaces the exact URL if it's missing). STT works out of the box.

Test totals: API **140**, frontend **223**, static checks clean.

---

# 🤖 AI Maintainer Handbook — session handoff

> Written for the next AI/human session picking this repo up cold. Everything
> below was learned the hard way in sandboxed sessions; the reusable harnesses
> live in `tools/`. Read this before changing anything.

## 1. Repo & runtime layout

- The git root contains **one nested project dir**: `garuda-konsole/`
  (`package.json`, `server.js`, `public/`, `test/`, `tools/`). Paths in commits
  are therefore `garuda-konsole/public/…` etc.
- Server: Express 5 + ws + node-pty (`server.js`, default port from `PORT` env).
  Client: classic scripts `public/app.js` + `public/ui.js` (no bundler), styled
  by `public/style.css`, shell in `public/index.html`, PWA via `public/sw.js`.
- Login password default `20090228` (`KONSOLE_PASSWORD` env overrides).
  Tests run with `KONSOLE_LOGIN_LIMIT=100000` to disable rate limiting.
- `node-pty` needs build tools; sandboxes usually lack them → run
  `sh test/setup-sandbox.sh` (installs deps `--ignore-scripts` and swaps in the
  `child_process`-based stub from `test/stubs/node-pty`). On a real machine
  plain `npm install` is correct.
- `garuda.config.json` is **runtime state** (VAPID keys, push subscriptions,
  triggers, schedules): test runs REWRITE it. Always
  `git checkout -- garuda-konsole/garuda.config.json` before committing.

## 2. Sandbox environment facts (why things behave strangely)

- **Node is preinstalled** in the image (`/usr/local/bin/node`, v20.x) with npm
  and registry access. There is **no browser** — see §3.
- **Only `/home/user` (the workspace) persists across sessions.** `/tmp`,
  background processes and the downloaded Chromium: all gone next session.
  Two nuances:
  - **npm packages do NOT persist if installed as `node_modules`** — the
    workspace snapshot excludes directories named `node_modules` (and
    `dist`, `build`, `out`, …). That is why project deps are reinstalled per
    session (`sh test/setup-sandbox.sh`), and why the persisted
    playwright-core copy lives at **`vendor/playwright-core`** (a name the
    snapshot keeps; not in git on purpose). `tools/browser-env.sh` and the
    `tools/repro-*.js` harnesses resolve it via relative paths.
  - **The Chromium binaries can NOT be persisted**: 273 MB extracted (~120 MB
    compressed) vs the ~128 MB best-effort workspace-snapshot cap — storing
    them risks truncating the entire workspace backup (the repo included).
    They are re-downloaded per session by `sh tools/browser-env.sh`
    (~3-4 min, hands-off) into `/tmp/.cache/ms-playwright`.
  So at session start: `sh test/setup-sandbox.sh && sh tools/browser-env.sh`.
- **Path-literal remap quirk (biggest trap).** The tool layer rewrites
  `/home/user` literals inside *bash command text* to the real tenant mount
  (a `/tmp/arena/tenants/…/workspace` path), but does **not** rewrite file
  contents written by the file tools. Consequences observed:
  | What you did | Result |
  |---|---|
  | `node -e "…'/home/user/x'…"` inline | works (literal rewritten, bash re-expands) |
  | `cat > f.js <<'EOF'` heredoc containing `/home/user` | file corrupted with literal `"$ARENA_WORKSPACE"` |
  | script file (written via file tool) using `/home/user/…` at runtime | `ENOENT` / `existsSync:false` — node's view has no such path |
  | script deriving paths from `__dirname` / `process.cwd()` / `process.env` | always works |
  **Rule: never hardcode absolute workspace paths in scripts; derive them at
  runtime.** Same reason: never author repo-file content through bash
  heredocs — this very handbook section was born corrupted by one (its
  `/home/user` mentions arrived as `"$ARENA_WORKSPACE"`); use the file tools.
- **Missing CLI tools:** no `curl`, `wget`, `pkill`, `pgrep`, `file`, `nc`.
  Use `node -e "fetch(…)"` for HTTP; kill processes by scanning `/proc`:
  `for d in /proc/[0-9]*; do tr '\0' ' ' < "$d/cmdline" | grep -q server.js && kill -9 ${d#/proc/}; done`
- `HOME=/tmp` → playwright browsers land in `/tmp/.cache/ms-playwright`.

## 3. Visual verification playbook (how the AI "sees" the UI)

- `sh tools/browser-env.sh` — resolves the persisted workspace copy of
  `playwright-core` (`vendor/playwright-core`, 14 MB) and downloads headless
  Chromium into `/tmp` only if not cached (idempotent; once per session).
- `node tools/repro-context-menu.js` — boots server+app headless, logs in,
  right-clicks the terminal, dumps computed color/opacity/cursor of every menu
  entry, saves full + cropped screenshots.
- `node tools/repro-approval-flow.js` — stubs `POST /api/ai/chat` at the
  network layer (scripted replies, **no model key needed**) so the real agent
  loop + approval cards run end-to-end; measures whether a pending approval
  card is *crushed* (scrollHeight vs clientHeight, button rect vs card rect).
  `REPRO_VH=560|640|900` to test viewport heights; point `REPRO_APP` at a
  `git worktree` of an old commit to see bugs **red** before fixing.
- `node tools/crop-image.js src out x y w h [zoom]` — crop/zoom user-supplied
  screenshots. **Naive cropping fails**: Chromium's built-in `file://` image
  viewer auto-fits large images, so offsetting an `<img>` yields the whole
  picture scaled (or black). The canvas + `data:` URI approach in this tool is
  the one that works.
- How images reach the AI: user attachments are saved under `uploads/`;
  reading any workspace `.png/.jpg/…` with the file-read tool renders it as
  visible content; playwright `page.screenshot()` / element screenshots write
  PNGs the same way. Element screenshots of the AI drawer look blurry because
  of its `backdrop-filter` — judge layout by measurements, not pixels.
- **Headless login recipe:** seed `localStorage` (`gk_tour_done=true`,
  `gk_news_seen=JSON.stringify(APP_VERSION)`) via `addInitScript`; wait until
  app scripts are *bound* (`typeof window.showToast === 'function'`) before
  clicking `#login-btn` (CDN xterm scripts can lag); force-close leftovers with
  `.modal-overlay → classList.add('hidden')`.
- **Orphan-server trap:** always use a random port per run and ALWAYS kill the
  server on exit. An orphaned server degrades after a while — `POST /api/login`
  hangs forever while `/healthz` still answers (symptom: login button stuck
  disabled, no login response). Kill orphans via the `/proc` scan above.
- Clicks on AI-pane elements must go through `page.evaluate(el.click())`:
  the pane re-renders on every state change (`innerHTML` rebuild), so
  Playwright's stability waits time out on detached nodes.
- Never `await page.evaluate(() => aiSend(…))` — the agent promise resolves
  only when the whole task ends (i.e. after approvals you haven't clicked yet).
  Use `void aiSend(…)`.

## 4. Test suite map (`npm test`)

1. `test/api-test.js` (143) — REST/WS against a live server.
2. `test/frontend-test.js` (245) — real `app.js`+`ui.js` inside **jsdom**
   against a live server; `ev(win, expr)` evaluates in page scope; stubs for
   canvas/xterm/audio. jsdom has **no layout engine** — anything
   geometry-related (flex crush, clipping) can NOT be tested here; use the
   Chromium harnesses (§3) for that.
3. `test/static-check.js` — ID/data-action/icon cross-checks, CSS sanity,
   cross-file function refs, and the **guard invariants** (§5).

## 5. Guard invariants (static-check will fail the build if broken)

- `AFFORDANCE:START/END` (style.css, 5.1.4): idle interactive color blend +
  real `:disabled` styling; `.ctx-item`, `.icon-btn`, … must stay listed.
- `CTX-AFFORDANCE:START/END` (5.1.6): `.ctx-item { color: var(--text); }`
  (no color-mix dependency), danger idle tint, `btn.disabled = true` in
  `openCtxMenu`, no inline-opacity fakes.
- `SCROLL-CRUSH:START/END` (5.1.7): children of scrollable flex columns
  (`.ai-messages`, `.chat-messages`, `.drawer-body`,
  `.server-sessions-list`) keep `flex-shrink: 0`; `.ai-cmd-card` guarded.
- **Version lockstep**: `package.json` version == `package-lock` (both root
  entries) == `APP_VERSION` (app.js) == `VERSION` (server.js) ==
  `sw.js` `CACHE` name suffix == `?v=` query on `style.css`/`app.js`/`ui.js`
  in `index.html` AND in the `sw.js` SHELL list. The `?v=` bust is what makes
  old service workers (cache-first!) fetch fresh assets on first load after a
  deploy — never drop it.

## 6. Release routine (the loop every change follows)

1. Reproduce first — headless Chromium (§3) or jsdom test; measure, don't guess.
2. Fix the *systemic* cause (cascade/layout/state), not the symptom.
3. Add regression tests: jsdom E2E where possible + a static-check guard for
   CSS/JS invariants; layout bugs get a Chromium harness in `tools/`.
4. `npm test` green (all three suites).
5. Visual red/green: run the harness against a `git worktree` of the previous
   commit (expect red) and the fixed tree (expect green), several viewport sizes.
6. Bump version in ALL lockstep places (§5) + README title/badge/changelog.
7. Commit in repo style (`fix(scope): X.Y.Z — summary` + detailed body),
   restore `garuda.config.json`, ensure `node_modules/` untracked (.gitignore).
8. Push to `origin main`. The remote URL carries a PAT; a `403 … denied` on
   push means the token lacks write grants (verify with a temp-ref POST via
   the REST API: `403 Resource not accessible by personal access token`).
9. Report with measurements + screenshots, not adjectives.

## 7. Case studies (methodology examples)

- **5.1.6 "right-click menu grayed out but works"** — three stacked causes:
  color-mix() fallback gray on old engines; disabled faked with inline
  opacity on live buttons; and the stale-SW cache-first trap that kept old
  CSS alive across deploys (→ version-busted URLs). Verified by computed
  styles in Chromium, not by eyeballing.
- **5.1.7 "approval buttons missing at 100% zoom, visible at 90%"** — user's
  own zoom experiment cracked it: buttons always in DOM; scrollable flex
  column compressed children (`flex-shrink:1`) and `.ai-cmd-card`
  `overflow:hidden` clipped the action row. Proven red on the old commit
  (83px content in 77px box, pane never scrolls), green after
  `flex-shrink: 0` at 560/640/900px. Same mechanism explained the
  "ctrl+/− breaks the page" report.
