/** Build with npm --prefix game run build, then run node game/test/story-first-play.browser.mjs.
 * Optional: PLAYWRIGHT_CHROMIUM_EXECUTABLE, AETHERION_STORY_CAPTURES (directory),
 * AETHERION_STORY_DEVICE (desktop or touch), AETHERION_STORY_DEV=1 for Vite dev,
 * AETHERION_STORY_REDUCED_MOTION=1 for the accessible arrival bypass,
 * or AETHERION_STORY_COMBAT=1 to load a local checkpoint at the first fight.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';
import { routedWaypoint } from '../src/ui/questNavigation.js';
import { createSim } from '../../shared/sim/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const captureDir = process.env.AETHERION_STORY_CAPTURES;
const runDevice = process.env.AETHERION_STORY_DEVICE;
const dev = process.env.AETHERION_STORY_DEV === '1';
const reducedMotion = process.env.AETHERION_STORY_REDUCED_MOTION === '1';
const combatCheckpoint = process.env.AETHERION_STORY_COMBAT === '1';
const appTimeout = 150_000;
const actionTimeout = 45_000;
const dimensions = { desktop: { width: 1120, height: 730 }, touch: { width: 390, height: 844 } };

if (captureDir) await mkdir(captureDir, { recursive: true });
const listen = { host: '127.0.0.1', port: 0 };
const server = dev
  ? await createServer({ root, server: { ...listen, hmr: false, watch: { ignored: ['**/*'] } } })
  : await preview({ root, preview: listen });
if (dev) await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/?q=low`;
const evidence = [];
let browser;

async function capture(page, label) {
  if (!captureDir) return;
  try {
    await page.screenshot({ path: join(captureDir, `${label}.jpg`), type: 'jpeg', quality: 85, timeout: 25_000 });
  } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    console.warn(`Software browser could not capture ${label} before the screenshot deadline.`);
  }
}

async function readWorld(page) {
  return page.evaluate(() => {
    const client = window.__aetherion;
    const { x, z } = client.actors.player.position;
    const quests = client.net.you.quests ?? [];
    return {
      x, z,
      yaw: client.actors.orbit.yaw,
      hp: client.net.you.hp,
      active: quests.find(quest => quest.id.startsWith('story-') && !quest.done),
    };
  });
}

async function waitForStage(page, stage) {
  await page.waitForFunction(id => window.__aetherion?.net?.you?.quests?.some(q => q.id === id && !q.done),
    `story-oath-09-${stage}`, { timeout: actionTimeout });
  return readWorld(page);
}

/** Steer with keyboard or the same joystick pointer sequence a player uses. */
async function makeSteering(page, touch) {
  if (!touch) {
    return async (right, forward, wait) => {
      const keys = [right > .3 && 'KeyD', right < -.3 && 'KeyA', forward > .3 && 'KeyW', forward < -.3 && 'KeyS'].filter(Boolean);
      for (const key of keys) await page.keyboard.down(key);
      try { await wait(); }
      finally { for (const key of keys) await page.keyboard.up(key); }
    };
  }
  const client = await page.context().newCDPSession(page);
  const send = (type, touchPoints) => client.send('Input.dispatchTouchEvent', { type, touchPoints });
  return async (right, forward, wait) => {
    const box = await page.locator('.ae-joy').boundingBox();
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await send('touchStart', [start]);
    try {
      await send('touchMove', [{ x: start.x + 64 * right, y: start.y - 64 * forward }]);
      await wait();
    } finally { await send('touchEnd', []); }
  };
}

async function moveTo(page, steer, target, radius) {
  let position = await readWorld(page);
  let blocked = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const destination = routedWaypoint(position, target);
    const dx = destination.x - position.x, dz = destination.z - position.z;
    const distance = Math.hypot(dx, dz);
    const arrivalRadius = destination === target ? radius : 0;
    if (distance <= arrivalRadius) return position;
    const fx = Math.sin(position.yaw), fz = Math.cos(position.yaw);
    const right = (-fz * dx + fx * dz) / distance;
    const forward = (fx * dx + fz * dz) / distance;
    const stride = Math.min(10, Math.max(.5, (distance - arrivalRadius) * .75));
    await steer(right, forward, () => page.waitForFunction(({ x, z, metres }) => {
      const p = window.__aetherion.actors.player.position;
      return Math.hypot(p.x - x, p.z - z) >= metres;
    }, { ...position, metres: stride }, { timeout: 3500 }).catch(error => {
      if (error.name !== 'TimeoutError') throw error;
    }));
    const next = await readWorld(page);
    blocked = Math.hypot(next.x - position.x, next.z - position.z) < .1 ? blocked + 1 : 0;
    position = next;
    if (blocked >= 6) break;
  }
  throw new Error(`Could not walk within ${radius} m of ${target.label} from (${position.x}, ${position.z})`);
}

async function finishConversation(page, activate, touch, waypoint) {
  const interact = page.locator('.ae-interact:visible').filter({ hasText: waypoint.label });
  await interact.waitFor({ timeout: actionTimeout });
  if (touch) await activate(interact);
  else await page.keyboard.press('KeyF');
  const dialogue = page.locator('.ae-dialog:visible');
  await dialogue.waitFor({ timeout: actionTimeout });
  const line = await dialogue.locator('.ae-dialog__text').innerText();
  await activate(dialogue.getByRole('button', { name: /Continue/ }));
  return line;
}

async function fight(page, steer, encounter) {
  await moveTo(page, steer, encounter.waypoint, 19);
  console.log(`desktop: reached ${encounter.title}`);
  const start = Date.now();
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => !!window.__aetherion.combat.target, null, { timeout: actionTimeout });
  await page.keyboard.press('KeyR');
  await page.keyboard.down('Digit1');
  try {
    while ((await readWorld(page)).active?.id === encounter.id) {
      assert.ok(Date.now() - start < 90000, `Combat did not finish for ${encounter.title}`);
      assert.ok((await readWorld(page)).hp > 0, `Player died during ${encounter.title}`);
      const hasTarget = await page.evaluate(() => {
        const { combat, actors } = window.__aetherion;
        return combat.target && actors.get(combat.target)?.alive;
      });
      if (!hasTarget) await page.keyboard.press('Tab');
      for (const key of ['KeyQ', 'Digit4', 'Digit5', 'Digit2', 'Digit3']) {
        await page.keyboard.press(key);
        await page.waitForTimeout(650);
      }
    }
  } finally { await page.keyboard.up('Digit1'); }
}

async function loadCombatCheckpoint(page) {
  const id = 'story-combat-qa';
  const hero = { name: 'Ward Witness', oath: 'oath-09', cls: 'sorcerer' };
  const sim = createSim({ campaign: true, bots: 0 });
  const start = sim.addPlayer(id, hero);
  const witness = start.world.sanctuaries.find(s => s.oathId === hero.oath).npcs.find(npc => npc.role === 'chronicler');
  const player = sim._S.players.get(id);
  sim._S.place(player, witness.x, witness.z, 'qa');
  sim.handle(id, { t: 'interact', id: witness.id });
  const ambush = sim._S.storyEncounters.find(site => site.oath === hero.oath && site.storyEncounter === 'ambush');
  sim._S.place(player, ambush.x - 18 * ambush.direction.x, ambush.z - 18 * ambush.direction.z, 'qa');
  const saved = sim.serialize(id);
  assert.equal(saved.campaignStep, 2);
  await page.addInitScript(({ hero, saved, token }) => {
    localStorage.setItem('aetherion.character', JSON.stringify(hero));
    localStorage.setItem(`aeth.tok.offline.local.${hero.name}|${hero.oath}|${hero.cls}`, token);
    localStorage.setItem(`aeth.save.${token}`, JSON.stringify(saved));
  }, { hero, saved, token: start.token });
  const destination = new URL(url);
  Object.entries({ offline: '1', cinematic: '0', nointro: '1' }).forEach(([key, value]) => destination.searchParams.set(key, value));
  await page.goto(destination.href);
  const resume = page.getByRole('button', { name: 'Continue Story', exact: true });
  await resume.click({ timeout: appTimeout });
  await page.waitForFunction(() => window.__aetherion?.input?.gameplayEnabled, null, { timeout: appTimeout });
  await page.evaluate(() => {
    const client = window.__aetherion;
    const events = window.__storyCombatEvidence = [];
    client.bus.on('combat:cast', event => { events.push({ type: 'input', slot: event.slot }); });
    client.bus.on('net:ev', event => {
      if (['cast', 'hit', 'death', 'fail'].includes(event.type) &&
        [event.src, event.id, event.dst, event.killer].includes(client.net.selfId)) events.push(event);
    });
  });
  return waitForStage(page, 2);
}

async function checkTouchControls(page, portrait) {
  const controls = await page.locator('.ae-touch-ui button:visible').evaluateAll(buttons => buttons.map(button => {
    const { x, y, width, height } = button.getBoundingClientRect();
    return {
      label: button.getAttribute('aria-label'), x, y, width, height,
      reachable: button.contains(document.elementFromPoint(x + width / 2, y + height / 2)),
    };
  }));
  assert.ok(controls.length >= 6, 'Touch HUD includes action and navigation controls');
  for (const control of controls) {
    assert.ok(control.reachable, `${control.label} is blocked by another element in ${portrait ? 'portrait' : 'landscape'}`);
    assert.ok(control.width >= 40 && control.height >= 40, `${control.label} has a ${control.width}×${control.height} touch target`);
  }
  return controls;
}

try {
  for (const [device, viewport] of Object.entries(dimensions)) {
    if (runDevice && device !== runDevice) continue;
    if (combatCheckpoint && device !== 'desktop') continue;
    if (browser) await browser.close();
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      headless: true,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const touch = device === 'touch';
    const renderViewport = combatCheckpoint ? { width: 800, height: 560 } : viewport;
    const page = await browser.newPage({
      viewport: renderViewport, isMobile: touch, hasTouch: touch,
      reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
      serviceWorkers: 'block',
    });
    const record = { device, viewport: renderViewport, errors: [], failedResponses: [], checkpoints: [] };
    evidence.push(record);
    page.on('pageerror', error => record.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') record.errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) record.failedResponses.push(`${response.status()} ${response.url()}`); });
    const activate = locator => touch ? locator.tap({ timeout: actionTimeout }) : locator.click({ timeout: actionTimeout });
    try {
      if (combatCheckpoint) {
        const checkpoint = await loadCombatCheckpoint(page);
        record.checkpoints.push(checkpoint);
        assert.equal(await page.evaluate(() => window.__aetherion.renderer.isWebGLRenderer), true);
        await fight(page, await makeSteering(page, false), checkpoint.active);
        record.checkpoints.push(await waitForStage(page, 3));
        await capture(page, 'desktop-evacuation-road-cleared');
        assert.deepEqual(record.errors, []);
        assert.deepEqual(record.failedResponses, []);
        record.passed = true;
        console.log('PASS desktop: real combat clears both ambush defenders');
        continue;
      }
      await page.goto(url);
      const begin = page.getByRole('button', { name: /^Begin Story\b/i });
      await begin.waitFor({ timeout: appTimeout });
      console.log(`${device}: title ready`);
      await capture(page, `${device}-title`);
      await activate(begin);
      await activate(page.locator('.ae-oath-card[data-oath="oath-09"]'));
      if (touch) await activate(page.getByRole('button', { name: /Choose fighting style/i }));
      await activate(page.locator('.ae-cls-card[data-cls="sorcerer"]'));
      const name = await page.locator('#ae-name').inputValue();
      assert.ok(name, 'Default story flow does not require typing a name');
      await capture(page, `${device}-character`);
      await activate(page.getByRole('button', { name: /^Enter the world\b/i }));
      console.log(`${device}: hero selected`);
      if (!reducedMotion) {
        const skip = page.getByRole('button', { name: 'Skip arrival and enter the realm' });
        await skip.waitFor({ timeout: appTimeout });
        await capture(page, `${device}-arrival`);
        if (await skip.isVisible()) await activate(skip);
      }
      await page.waitForFunction(() => window.__aetherion?.ui?.state?.inGame && window.__aetherion.input.gameplayEnabled, null, { timeout: appTimeout });
      record.mode = await page.evaluate(() => window.__aetherion.net.mode);
      assert.equal(record.mode, 'offline');
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('aetherion.character'))),
        { name, oath: 'oath-09', cls: 'sorcerer' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const spawn = await waitForStage(page, 1);
      console.log(`${device}: entered the world`);
      record.checkpoints.push(spawn);
      const objective = page.locator('.ae-story-objective:visible');
      assert.match(await objective.innerText(), /The Broken Ward/i);
      await capture(page, `${device}-first-objective`);
      await activate(objective);
      const journal = page.getByRole('dialog', { name: 'Story journal' });
      assert.match(await journal.innerText(), /The Broken Ward/i);
      await activate(journal.getByRole('button', { name: 'Close journal' }));

      const steer = await makeSteering(page, touch);
      if (touch) {
        record.portraitControls = await checkTouchControls(page, true);
        const yaw = await page.evaluate(() => window.__aetherion.actors.orbit.yaw);
        const session = await page.context().newCDPSession(page);
        const start = { x: Math.round(viewport.width * .8), y: Math.round(viewport.height * .52) };
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        try {
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...start, x: start.x - 64 }] });
          await page.waitForFunction(previous => Math.abs(window.__aetherion.actors.orbit.yaw - previous) > .06, yaw, { timeout: actionTimeout });
        } finally { await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
        await steer(0, 1, () => page.waitForFunction(before => {
          const p = window.__aetherion.actors.player.position;
          return Math.hypot(p.x - before.x, p.z - before.z) > .4;
        }, spawn, { timeout: actionTimeout }));
      }

      await moveTo(page, steer, spawn.active.waypoint, 5);
      record.firstDialogue = await finishConversation(page, activate, touch, spawn.active.waypoint);
      const ambush = await waitForStage(page, 2);
      console.log(`${device}: heard the witness`);
      record.checkpoints.push(ambush);
      await capture(page, `${device}-ambush-objective`);
      if (touch) {
        // Headless Chromium rejects setWindowBounds while the page is fullscreen.
        await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForFunction(() => innerWidth === 844 && innerHeight === 390);
        record.landscapeControls = await checkTouchControls(page, false);
        await capture(page, 'touch-landscape');
        await page.setViewportSize({ width: 320, height: 568 });
        await page.waitForFunction(() => innerWidth === 320 && innerHeight === 568);
        record.compactControls = await checkTouchControls(page, true);
        await capture(page, 'touch-compact');
      } else {
        await page.reload();
        const resume = page.getByRole('button', { name: /^Continue Story\b/i });
        await resume.waitFor({ timeout: appTimeout });
        await activate(resume);
        await page.waitForFunction(() => window.__aetherion?.ui?.state?.inGame, null, { timeout: appTimeout });
        record.resumed = await waitForStage(page, 2);
      }
      assert.deepEqual(record.errors, []);
      assert.deepEqual(record.failedResponses, []);
      record.passed = true;
      console.log(`PASS ${device}: fresh title, character, arrival, controls and first campaign objective`);
    } catch (error) {
      record.error = error.stack;
      record.failedAt = await readWorld(page).catch(() => null);
      record.screen = await page.locator('#ui').innerText({ timeout: 3000 }).then(text => text.slice(0, 1000)).catch(() => null);
      if (!captureDir) console.error({ lastWorldState: record.failedAt, screen: record.screen });
      await capture(page, `${device}-failed`).catch(() => {});
      throw error;
    } finally {
      if (combatCheckpoint) record.combatEvents = await page.evaluate(() => window.__storyCombatEvidence).catch(() => []);
      if (captureDir) await writeFile(join(captureDir, 'browser-results.json'), JSON.stringify(evidence, null, 2));
    }
  }
} finally {
  await browser?.close();
  if (dev) await server.close();
  else await new Promise(resolve => server.httpServer.close(resolve));
}
