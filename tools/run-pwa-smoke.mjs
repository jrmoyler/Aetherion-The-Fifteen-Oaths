// Keep preview and browser in one process tree for isolated execution environments.
// Build first: npm run mmo:build
// CHROMIUM_PATH=/path/to/chrome node tools/run-pwa-smoke.mjs
import { spawn } from 'node:child_process';
const port = process.env.PWA_TEST_PORT || '4181';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: process.cwd() + '/game', stdio: ['ignore', 'pipe', 'pipe'] });
let started = false;
let test;
const timer = setTimeout(() => { console.error('Preview startup timed out'); server.kill(); process.exitCode = 1; }, 15000);
server.stderr.on('data', chunk => process.stderr.write(chunk));
server.on('error', error => { clearTimeout(timer); console.error(error); process.exitCode = 1; });
server.stdout.on('data', chunk => {
  if (started || !chunk.toString().includes('Local:')) return;
  started = true;
  clearTimeout(timer);
  test = spawn(process.execPath, ['tests/pwa-offline.browser.mjs', `http://127.0.0.1:${port}`], { env: process.env, stdio: 'inherit' });
  test.on('error', error => { console.error(error); server.kill(); process.exitCode = 1; });
  test.on('exit', code => { server.kill(); process.exitCode = code ?? 1; });
});
server.on('exit', code => {
  clearTimeout(timer);
  if (!started) process.exitCode = code || 1;
});
process.on('SIGINT', () => { test?.kill(); server.kill(); });
