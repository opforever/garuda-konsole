#!/bin/sh
# Prepare the headless-browser visual-verification environment (idempotent).
#
# WHAT PERSISTS BETWEEN SESSIONS (workspace /home/user):
#   - vendor/playwright-core  → the playwright-core package (14 MB), copied
#     here so it survives across sessions. NOT in git on purpose.
# WHAT CAN NOT PERSIST (too big for the ~128 MB workspace snapshot):
#   - the Chromium binaries (273 MB extracted / ~120 MB compressed). They live
#     in /tmp/.cache/ms-playwright and are re-downloaded per session by this
#     script (~3-4 min, hands-free). Do NOT try to store them in the workspace:
#     exceeding the snapshot cap risks truncating the whole workspace backup.
#
# Usage: sh tools/browser-env.sh     # once per session, then use tools/repro-*.js
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
VENDOR="$HERE/../../../vendor/playwright-core"

if [ -d "$VENDOR" ]; then
    PW="$VENDOR"
    echo "playwright-core: using persisted workspace copy ($VENDOR)"
else
    mkdir -p /tmp/pwenv
    cd /tmp/pwenv
    [ -f package.json ] || echo '{"name":"pwenv","private":true}' > package.json
    [ -d node_modules/playwright-core ] || npm install playwright-core >/dev/null 2>&1
    PW="/tmp/pwenv/node_modules/playwright-core"
    echo "playwright-core: no workspace vendor copy — installed to $PW"
    echo "  (tip: cp -r $PW <workspace>/vendor/playwright-core to persist it)"
fi

if [ ! -d /tmp/.cache/ms-playwright ]; then
    echo "downloading chromium headless shell (one-time per session)…"
    NODE_PATH="$(dirname "$PW")" node "$PW/cli.js" install chromium 2>&1 | tail -2
else
    echo "chromium: already cached in /tmp/.cache/ms-playwright"
fi
# system libraries for the headless shell (missing on fresh sandboxes)
if ! node -e "process.exit(0)" 2>/dev/null; then :; fi
if [ ! -e /usr/lib/x86_64-linux-gnu/libglib-2.0.so.0 ] && ! ldconfig -p 2>/dev/null | grep -q libglib-2.0; then
    echo "installing chromium system dependencies…"
    (cd "$(dirname "$PW")/.." && npx --yes playwright-core install-deps chromium) >/dev/null 2>&1 || echo "  (install-deps failed — try: npx playwright-core install-deps chromium)"
fi
echo "browser env ready"
