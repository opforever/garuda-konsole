/* TEST STUB — emulates the node-pty API with child_process for sandbox E2E testing.
   Used only when real node-pty cannot be built (no compiler). Never shipped to node_modules
   automatically — see test/setup-sandbox.sh */
'use strict';
const { spawn } = require('child_process');

function spawnPty(file, args, opts) {
    opts = opts || {};
    const child = spawn(file, args || [], {
        cwd: opts.cwd || process.cwd(),
        env: opts.env || process.env,
        stdio: ['pipe', 'pipe', 'pipe']
    });
    const dataHandlers = [];
    const exitHandlers = [];
    let exited = false;

    child.stdout.on('data', (d) => dataHandlers.slice().forEach((h) => { try { h(d.toString('utf8')); } catch (e) {} }));
    child.stderr.on('data', (d) => dataHandlers.slice().forEach((h) => { try { h(d.toString('utf8')); } catch (e) {} }));
    child.on('exit', (code, signal) => {
        if (exited) return;
        exited = true;
        exitHandlers.slice().forEach((h) => { try { h({ exitCode: code == null ? 0 : code, signal: signal || undefined }); } catch (e) {} });
    });
    child.on('error', () => {
        if (exited) return;
        exited = true;
        exitHandlers.slice().forEach((h) => { try { h({ exitCode: -1, signal: undefined }); } catch (e) {} });
    });

    return {
        pid: child.pid,
        onData(cb) { dataHandlers.push(cb); return { dispose() { const i = dataHandlers.indexOf(cb); if (i >= 0) dataHandlers.splice(i, 1); } }; },
        onExit(cb) { exitHandlers.push(cb); return { dispose() { const i = exitHandlers.indexOf(cb); if (i >= 0) exitHandlers.splice(i, 1); } }; },
        write(data) { try { if (child.stdin.writable) child.stdin.write(String(data).replace(/\r/g, '\n')); } catch (e) {} }, // emulate ICRNL line discipline
        resize() { /* no-op in stub */ },
        kill(signal) { try { child.kill(signal || 'SIGTERM'); } catch (e) {} },
        get killed() { return child.killed || exited; }
    };
}

module.exports = { spawn: spawnPty };
