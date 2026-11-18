// Real browser pointer events through the production touch controls and core input.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));

async function center(locator, id) {
  const { x, y, width, height } = await locator.boundingBox();
  return { x: x + width / 2, y: y + height / 2, id };
}

let server, browser;
try {
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0, hmr: false, watch: { ignored: ['**/*'] } } });
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const page = await browser.newPage({
    isMobile: true, hasTouch: true, deviceScaleFactor: 1, viewport: { width: 390, height: 844 },
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const client = await page.context().newCDPSession(page);
  const touch = async (type, touchPoints = []) => {
    await client.send('Input.dispatchTouchEvent', { type, touchPoints });
    // The compositor may acknowledge touch before its pointer events reach the page.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  await page.route('**/touch-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<style>#ui{position:fixed;inset:0;pointer-events:none}</style>
<canvas></canvas><div id="ui" class="is-touch"></div>
<script type="module">
  import '/src/ui/ui.css';
  import { createTouch } from '/src/ui/touch.js';
  import { createInput } from '/src/core/input.js';
  import { Bus } from '/src/core/bus.js';
  const root = document.getElementById('ui');
  const bus = new Bus();
  const input = createInput(document.querySelector('canvas'), bus);
  const ctx = { input, net: { mode: 'offline' }, actors: { pick: () => ({ id: 'actor' }) },
    combat: { setTarget: id => { target = id; } } };
  let target, menu;
  const actions = [];
  bus.on('input:action', action => actions.push(action));
  const touch = createTouch({
    ctx, root, sfx() {}, chat: { focus: () => { menu = 'chat'; } },
    toggleWindow(id) { touch.reset(); input.setTyping(true); menu = id; },
  });
  root.append(touch.el, touch.ctrl);
  touch.build(Array.from({ length: 6 }, (_, i) => ({
    name: 'Technique ' + i, glyphSvg: '', accent: '#e4c17f', accentRgb: '228,193,127', ult: i === 5,
  })));
  touch.show();
  window.fixture = {
    snapshot() {
      input.poll();
      const frame = { ...input.state, attack: input.isDown('slot0'), menu, target, actions: actions.splice(0) };
      input.endFrame();
      return frame;
    },
    resume() { input.setTyping(false); menu = null; },
    online() { ctx.net.mode = 'online'; touch.show(); },
  };
</script>`,
  }));
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(`${url}/touch-fixture`);
  await page.waitForFunction(() => !!window.fixture);
  const snapshot = () => page.evaluate(() => window.fixture.snapshot());

  const stick = await center(page.locator('.ae-joy'), 1);
  const pushed = { ...stick, y: stick.y - 52 };
  await touch('touchStart', [stick]);
  await touch('touchMove', [pushed]);
  const movement = await snapshot();
  assert.ok(movement.moveY > .9 && movement.sprint, 'A full drag should press forward and sprint');

  const look = { x: 285, y: 375, id: 2 };
  await touch('touchStart', [pushed, look]);
  await touch('touchMove', [pushed, { ...look, x: 331 }]);
  const simultaneous = await snapshot();
  assert.ok(simultaneous.lookDX > 0 && simultaneous.sprint, 'Moving and looking must work at the same time');
  await touch('touchCancel');
  const cleared = await snapshot();
  assert.ok(!cleared.sprint && !cleared.moveX && !cleared.moveY);

  const secondFinger = { ...look, x: 323, id: 3 };
  await touch('touchStart', [look]);
  await touch('touchStart', [look, secondFinger]);
  await touch('touchMove', [{ ...look, x: 240 }, { ...secondFinger, x: 365 }]);
  const pinch = await snapshot();
  assert.ok(pinch.zoom < 0 && !pinch.lookDX, 'Pinching outward should zoom inward without orbiting');
  await touch('touchEnd');

  await touch('touchStart', [look]);
  await touch('touchMove', [{ ...look, x: look.x + 3 }]);
  await touch('touchEnd');
  const tap = await snapshot();
  assert.equal(tap.target, 'actor');
  assert.equal(tap.lookDX, 0, 'A tap with slight jitter must leave the camera alone');

  const attack = page.locator('.ae-tbtn--slot-0');
  await touch('touchStart', [await center(attack, 4)]);
  assert.equal((await snapshot()).attack, true);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => !document.querySelector('.ae-tbtn--slot-0').classList.contains('is-down'));
  assert.equal((await snapshot()).attack, false, 'Rotating must release held attacks');
  await touch('touchEnd');

  const jump = page.locator('.ae-tbtn--jump');
  await touch('touchStart', [await center(jump, 5)]);
  assert.equal((await snapshot()).jump, true);
  await touch('touchEnd');
  assert.equal((await snapshot()).jump, false);
  await page.getByRole('button', { name: 'Dodge', exact: true }).tap();
  assert.deepEqual((await snapshot()).actions, ['dodge']);

  const toolbar = page.getByRole('navigation', { name: 'Game menus' });
  await toolbar.getByRole('button', { name: 'World map' }).tap();
  assert.equal((await snapshot()).menu, 'map');
  await page.getByRole('button', { name: 'Target', exact: true }).tap();
  assert.deepEqual((await snapshot()).actions, [], 'Actions are blocked while a window owns input');
  await page.evaluate(() => window.fixture.resume());
  await toolbar.getByRole('button', { name: 'Journal', exact: true }).tap();
  assert.equal((await snapshot()).menu, 'journal');
  await page.evaluate(() => { window.fixture.resume(); window.fixture.online(); });
  await toolbar.getByRole('button', { name: 'Chat', exact: true }).tap();
  assert.equal((await snapshot()).menu, 'chat');

  assert.deepEqual(errors, []);
  console.log('Touch input passed movement, sprint, simultaneous look, pinch, tap, attack hold, rotation, jump, dodge and menus.');
} finally {
  await browser?.close();
  await server?.close();
}
