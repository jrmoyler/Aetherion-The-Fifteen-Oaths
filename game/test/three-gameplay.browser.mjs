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
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?offline=1&q=low&oath=oath-09&cls=ninja&name=ReviewKnight`);
  await page.waitForFunction(() => window.__aetherion?.ui?.state?.inGame, null, { timeout: 60000 });
  // Skip only the introductory camera rail; the production controller stays active.
  await page.evaluate(() => { window.__aetherion.actors.orbit.intro = null; });
  await page.waitForTimeout(1000);
  const before = await page.evaluate(() => ({ ...window.__aetherion.actors.player.position }));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  const moved = await page.evaluate(b => { const p = window.__aetherion.actors.player.position; return Math.hypot(p.x - b.x, p.z - b.z); }, before);
  assert.ok(moved > .1, `Player must move; observed ${moved} m`);
  await page.keyboard.press('Digit2');
  await page.waitForFunction(() => window.__aetherion.combat.cooldowns[1] > 0);
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click({ timeout: 1000 }).catch(() => {});
  const result = await page.evaluate(() => {
    const c = window.__aetherion;
    return { renderer: c.renderer.isWebGLRenderer, frames: c.clock.frame, model: c.actors.player.bodyUrl,
      skinnedMeshes: c.actors.player.body.meshes.filter(m => m.isSkinnedMesh).length,
      drawCalls: c.renderer.info.render.calls, triangles: c.renderer.info.render.triangles,
      world: c.world.stats(), svg: document.querySelectorAll('svg').length,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.equal(result.renderer, true); assert.ok(result.frames > 0); assert.ok(result.model);
  assert.ok(result.skinnedMeshes > 0); assert.ok(result.drawCalls > 0);
  assert.equal(result.svg, 0); assert.equal(result.horizontalOverflow, false);
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  if (process.env.AETHERION_SCREENSHOT) {
    await page.waitForTimeout(11000); // Let the informational offline-ready notice expire.
    await page.screenshot({ path: process.env.AETHERION_SCREENSHOT });
  }
  console.log(JSON.stringify({ ...result, moved, errors, failures }, null, 2));
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
