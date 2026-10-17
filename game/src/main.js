// Aetherion client boot. Owns module wiring and the frame loop only; every subsystem lives
// in its own directory and exposes `async init(ctx)` -> api (see game/CONTRACTS.md).
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import '@babylonjs/core/Loading/loadingScreen.js';

import { Bus } from './core/bus.js';
import { detectQuality } from './core/quality.js';
import { createInput } from './core/input.js';
import { CollisionWorld } from './core/collision.js';

import * as UI from './ui/index.js';
import * as Render from './render/index.js';
import * as World from './world/index.js';
import * as Architecture from './architecture/index.js';
import * as Net from './net/index.js';
import * as Actors from './actors/index.js';
import * as VFX from './vfx/index.js';
import * as Combat from './combat/index.js';

const canvas = document.getElementById('game');
const bus = new Bus();
const quality = detectQuality();

const engine = new Engine(canvas, quality.name !== 'low', {
  preserveDrawingBuffer: false, stencil: true, antialias: false, powerPreference: 'high-performance',
  adaptToDeviceRatio: false, doNotHandleContextLost: false,
}, false);
engine.setHardwareScalingLevel(1 / (Math.min(devicePixelRatio, 2) * quality.renderScale));

const scene = new Scene(engine);
scene.clearColor = new Color4(0.05, 0.06, 0.08, 1);
scene.skipPointerMovePicking = true;
scene.autoClear = true;

const updaters = [];
const ctx = {
  engine, scene, canvas, bus, quality,
  input: createInput(canvas, bus),
  collision: new CollisionWorld(),
  clock: { time: 0, dt: 0, frame: 0 },
  params: new URLSearchParams(location.search),
  /** Register a per-frame update. Lower order runs first. */
  addUpdate(fn, order = 50) { updaters.push({ fn, order }); updaters.sort((a, b) => a.order - b.order); return () => updaters.splice(updaters.findIndex((u) => u.fn === fn), 1); },
  setLoading(p, label) { bus.emit('loading', { p, label }); },
};
window.__aetherion = ctx; // debugging / automated QA hook

async function boot() {
  ctx.ui = await UI.init(ctx);                    // title screen, loading screen, HUD shell
  ctx.setLoading(0.05, 'Kindling the renderer');
  ctx.render = await Render.init(ctx);            // sky, sun, IBL, shadows, post-processing
  ctx.setLoading(0.15, 'Raising the continent');
  ctx.world = await World.init(ctx);              // terrain, water, vegetation, weather
  ctx.setLoading(0.45, 'Building the fifteen sanctuaries');
  ctx.architecture = await Architecture.init(ctx); // sanctuary cities, shrines, props, colliders
  ctx.setLoading(0.65, 'Opening the Weave');
  ctx.net = await Net.init(ctx);                  // online WebSocket or in-browser LocalServer
  ctx.vfx = await VFX.init(ctx);                  // particle/mesh effect library
  ctx.setLoading(0.75, 'Summoning the Oathbound');
  ctx.actors = await Actors.init(ctx);            // characters, controller, camera, mobs, NPCs
  ctx.combat = await Combat.init(ctx);            // targeting, casting, ability visuals, damage
  ctx.setLoading(1, 'Ready');

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
    ctx.clock.dt = dt; ctx.clock.time += dt; ctx.clock.frame++;
    ctx.input.poll();
    for (const u of updaters) u.fn(dt);
    scene.render();
    ctx.input.endFrame();
  });

  const character = await ctx.ui.chooseCharacter(); // {name, oath, cls}
  ctx.character = character;
  bus.emit('game:character', character);
  await ctx.net.connect(character);
  ctx.ui.enterGame();
  bus.emit('game:start', character);
}

addEventListener('resize', () => engine.resize());
boot().catch((err) => {
  console.error(err);
  bus.emit('fatal', err);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:auto 0 0 0;color:#f88;background:#000c;padding:12px;font:12px monospace;white-space:pre-wrap;z-index:99';
  el.textContent = `Boot failed: ${err?.stack ?? err}`;
  document.body.appendChild(el);
});
