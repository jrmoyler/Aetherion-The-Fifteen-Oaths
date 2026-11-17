/** npm run build --prefix game && node game/test/three-gameplay.browser.mjs
 * Optional: PLAYWRIGHT_CHROMIUM_EXECUTABLE, AETHERION_SCREENSHOT path.
 * Software rendering verifies integration, not hardware FPS.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../', import.meta.url));
let server, browser;
try {
  server = await preview({ root, preview: { host: '127.0.0.1', port: 0 } });
  const fallback = '/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell';
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(chromium.executablePath()) ? undefined : existsSync(fallback) ? fallback : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [], failures = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?offline=1&q=low&oath=oath-09&cls=ninja&name=ReviewKnight&cinematic=0&nointro=1`);
  await page.waitForFunction(() => !!window.__aetherion?.dispose, null, { timeout: 180000 });
  // Skip only the introductory camera rail; the production controller stays active.
  await page.evaluate(() => { window.__aetherion.actors.orbit.intro = null; });
  await page.waitForTimeout(1000);
  const before = await page.evaluate(() => ({ ...window.__aetherion.actors.player.position }));
  await page.keyboard.down('KeyW');
  try {
    await page.waitForFunction(b => {
      const p = window.__aetherion.actors.player.position;
      return Math.hypot(p.x - b.x, p.z - b.z) > .25;
    }, before, { timeout: 60000 });
  } finally { await page.keyboard.up('KeyW'); }
  const moved = await page.evaluate(b => { const p = window.__aetherion.actors.player.position; return Math.hypot(p.x - b.x, p.z - b.z); }, before);
  assert.ok(moved > .1, `Player must move; observed ${moved} m`);
  await page.keyboard.press('Digit2');
  await page.waitForFunction(() => window.__aetherion.combat.cooldowns[1] > 0);
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click({ timeout: 1000 }).catch(() => {});
  await page.waitForFunction(() => window.__aetherion.actors.player.body.armorHandle?.meshes.length);
  const result = await page.evaluate(() => {
    const c = window.__aetherion;
    const player = c.actors.player;
    const vertex = player.position.clone();
    let armorReach = 0;
    for (const mesh of player.body.armorHandle.meshes) {
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
        armorReach = Math.max(armorReach, vertex.distanceTo(player.position));
      }
    }
    const bones = player.body.sheetCostume.mesh.skeleton.bones;
    const fingers = bones.filter(bone => /^(thumb|index|middle|ring|little)[012]\.[LR]$/.test(bone.name));
    return { armorReach, fingerJoints: fingers.length, armorMeshes: player.body.armorHandle.meshes.map(m => m.name), renderer: c.renderer.isWebGLRenderer, frames: c.clock.frame, model: c.actors.player.bodyUrl,
      skinnedMeshes: c.actors.player.body.meshes.filter(m => m.isSkinnedMesh).length,
      drawCalls: c.renderer.info.render.calls, triangles: c.renderer.info.render.triangles,
      world: c.world.stats(), svg: document.querySelectorAll('svg').length,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.ok(result.armorReach > .3 && result.armorReach < 2.5, `Starter armor extends ${result.armorReach} m from its wearer`);
  assert.equal(result.fingerJoints, 30);
  assert.ok(result.armorMeshes.some(name => /^arsenal-armor-field-(robe|chest)$/.test(name)), 'Starter armor uses the fitted outfit');
  // Simulate two equipment snapshots arriving in the same frame. A late fit
  // must not add a second torso piece after the wearer reverted to the first.
  const stableOutfit = await page.evaluate(async () => {
    const c = window.__aetherion;
    const body = c.actors.player.body;
    const original = body.armorHandle.ids[0];
    const alternate = original.includes('/robe/') ? 'arsenal:armor/chest/01' : 'arsenal:armor/robe/01';
    for (const arsenal of [alternate, original])
      c.bus.emit('net:you', { equipment: { chest: { arsenal } } });
    await new Promise(resolve => requestAnimationFrame(resolve));
    let fitted = 0;
    body.root.traverse(node => { if (node.name.startsWith('arsenal-armor-field-')) fitted++; });
    return body.arsenalArmor === original && fitted === 1;
  });
  assert.ok(stableOutfit, 'The latest equipped outfit must win');
  assert.equal(result.renderer, true); assert.ok(result.frames > 0); assert.ok(result.model);
  assert.ok(result.skinnedMeshes > 0); assert.ok(result.drawCalls > 0);
  assert.equal(result.svg, 0); assert.equal(result.horizontalOverflow, false);
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  if (process.env.AETHERION_SCREENSHOT) {
    await page.waitForTimeout(11000); // Let the informational offline-ready notice expire.
    await page.evaluate(() => window.__aetherion.renderer.setAnimationLoop(null));
    await page.screenshot({ path: process.env.AETHERION_SCREENSHOT, timeout: 90000 });
  }
  console.log(JSON.stringify({ ...result, moved, errors, failures }, null, 2));
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
