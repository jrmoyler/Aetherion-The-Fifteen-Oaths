// Real keyboard input + imported models in the existing actor harness.
// Run: node tools/test-character-runtime.mjs
// Set PLAYWRIGHT_EXECUTABLE_PATH when using a system Chromium installation.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { chromium } from '../game/node_modules/playwright/index.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'docs/upgrades/evidence');
await fs.mkdir(output, { recursive: true });
const port = process.env.CHARACTER_TEST_PORT ?? '5193';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: path.join(root, 'game'), stdio: 'ignore' });
let browser;
try {
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}/src/actors/dev.html?mode=play&oath=oath-04&cls=ninja&nointro=1&remotes=0&mobs=1`);
  await page.waitForFunction(() => window.__dev?.actors.player?.bodyUrl, null, { timeout: 60000 });
  const initial = await page.evaluate(() => ({ x: __dev.actors.player.position.x, z: __dev.actors.player.position.z }));
  await page.keyboard.down('KeyW');
  await page.waitForFunction(({ x, z }) => Math.hypot(__dev.actors.player.position.x - x, __dev.actors.player.position.z - z) > 2, initial, { timeout: 30000 });
  await page.keyboard.up('KeyW');
  await page.waitForFunction(() => __dev.actors.player.controller.groundSpeed < 0.1 && __dev.actors.player.controller.grounded, null, { timeout: 30000 });
  const moved = await page.evaluate(() => ({ x: __dev.actors.player.position.x, z: __dev.actors.player.position.z }));
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !__dev.actors.player.controller.grounded, null, { timeout: 30000 });
  const jumped = await page.evaluate(() => ({ state: __dev.actors.player.body.animator.state, grounded: __dev.actors.player.controller.grounded }));
  await page.waitForFunction(() => __dev.actors.player.controller.grounded && __dev.actors.player.body.animator.state === 'loco', null, { timeout: 30000 });
  const result = await page.evaluate(() => ({
    playerModel: __dev.actors.player.bodyUrl,
    playerState: __dev.actors.player.body.animator.state,
    grounded: __dev.actors.player.controller.grounded,
    entities: [...__dev.actors.entities.values()].map((a) => ({ name: a.name, kind: a.kind, model: a.bodyUrl ?? 'procedural' })),
    meshCount: __dev.ctx.scene.meshes.length,
    activeMeshes: __dev.ctx.scene.getActiveMeshes().length,
    observedFps: __dev.ctx.engine.getFps(),
  }));
  result.initial = initial; result.moved = moved;
  result.distance = Math.hypot(moved.x - initial.x, moved.z - initial.z);
  result.jump = jumped; result.errors = errors;
  result.runtime = 'Headless Chromium, ANGLE SwiftShader software WebGL; not a physical-device performance benchmark.';
  await page.screenshot({ path: path.join(output, 'character-runtime.png') });
  await fs.writeFile(path.join(output, 'character-runtime.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (errors.length || result.distance <= 2 || !result.grounded) throw new Error('Character runtime regression');
} finally {
  await browser?.close();
  server.kill();
}
