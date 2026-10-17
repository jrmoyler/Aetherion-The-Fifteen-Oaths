// Dev harness: boots only engine + render + world (no other modules). URL params:
// ?q=high&cam=x,y,z|spawn=x,z&yaw=deg&pitch=deg&time=16.8&weather=rain,1&freecam=1&hud=1
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Bus } from '../core/bus.js';
import { detectQuality } from '../core/quality.js';
import { CollisionWorld } from '../core/collision.js';
import * as Render from '../render/index.js';
import * as World from './index.js';

const canvas = document.getElementById('game');
const quality = detectQuality();
const engine = new Engine(canvas, quality.name !== 'low', { preserveDrawingBuffer: true, stencil: true, antialias: false }, false);
engine.setHardwareScalingLevel(1 / (Math.min(devicePixelRatio, 2) * quality.renderScale));
const scene = new Scene(engine);
const updaters = [];
const ctx = {
  engine, scene, canvas, bus: new Bus(), quality, collision: new CollisionWorld(), clock: { time: 0, dt: 0, frame: 0 },
  params: new URLSearchParams(location.search),
  __updaters: updaters,
  addUpdate(fn, order = 50) { updaters.push({ fn, order }); updaters.sort((a, b) => a.order - b.order); },
  setLoading(p, l) { hud.textContent = `loading ${(p * 100) | 0}% ${l}`; },
};
window.__aetherion = ctx;
const hud = document.getElementById('hud');
(async () => {
  const t0 = performance.now();
  ctx.render = await Render.init(ctx);
  ctx.world = await World.init(ctx);
  ctx.bootMs = performance.now() - t0;
  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1); ctx.clock.dt = dt; ctx.clock.time += dt; ctx.clock.frame++;
    for (const u of updaters) u.fn(dt);
    scene.render();
    if (ctx.params.get('hud') && ctx.clock.frame % 15 === 0) {
      const s = ctx.world.stats(); const c = scene.activeCamera.position;
      hud.textContent = `fps ${engine.getFps().toFixed(0)} draw ${engine._drawCalls?.current} meshes ${scene.getActiveMeshes().length}\nt ${ctx.render.timeOfDay.toFixed(2)} cam ${c.x.toFixed(0)},${c.y.toFixed(0)},${c.z.toFixed(0)}\n${JSON.stringify(s)}`;
    } else if (!ctx.params.get('hud')) hud.style.display = 'none';
  });
})().catch((e) => { console.error(e); hud.textContent = String(e.stack || e); });
addEventListener('resize', () => engine.resize());
