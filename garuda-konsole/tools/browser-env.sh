#!/bin/sh
# Install the headless-browser visual-verification environment.
#
# WHY: the sandbox image ships Node but NO browser. The tools/repro-*.js
# harnesses drive the real app in headless Chromium (screenshots, computed
# styles, layout measurements). Playwright + Chromium live in /tmp, which
# does NOT persist between sessions — re-run this script whenever a fresh
# session starts (it is idempotent).
#
# NOTE: HOME=/tmp in this sandbox, so browsers land in /tmp/.cache/ms-playwright.
set -e
mkdir -p /tmp/pwenv
cd /tmp/pwenv
[ -f package.json ] || echo '{"name":"pwenv","private":true}' > package.json
if [ ! -d node_modules/playwright-core ]; then
    echo "installing playwright-core…"
    npm install playwright-core >/dev/null 2>&1
fi
if [ ! -d /tmp/.cache/ms-playwright ]; then
    echo "downloading chromium headless shell…"
    npx playwright-core install chromium 2>&1 | tail -2
fi
echo "browser env ready → require('/tmp/pwenv/node_modules/playwright-core')"
