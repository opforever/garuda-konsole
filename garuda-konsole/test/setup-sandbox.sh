#!/bin/sh
# Prepare a sandbox test environment when real node-pty cannot be compiled
# (no build tools). Installs JS deps without running install scripts and
# swaps in the child_process-based node-pty stub. NOT needed on a normal
# machine with build-essential — there, plain `npm install` is correct.
set -e
cd "$(dirname "$0")/.."
npm install --ignore-scripts
rm -rf node_modules/node-pty
cp -r test/stubs/node-pty node_modules/node-pty
echo "sandbox test environment ready"
