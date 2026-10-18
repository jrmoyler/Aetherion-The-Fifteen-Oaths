// Actors dev harness: engine + light + terrain + collision props + the actors module + a fake
// net that streams snapshots (remote players, mobs, NPCs). Independent of the other agents' modules.
//   ?mode=play (default) | lineup   &which=humans|creatures|all  &view=front|back|side|three
//   &oath=oath-04&cls=ninja  &q=high  &remotes=8  &mobs=10
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import '@babylonjs/core/Rendering/edgesRenderer.js';
import { Bus } from '../core/bus.js';
import { createInput } from '../core/input.js';
import { CollisionWorld } from '../core/collision.js';
import { TIERS } from '../core/quality.js';
import { heightAt, normalAt } from '@shared/terrain.js';
import { OATHS, OATH_BY_ID, regionAt } from '@shared/oaths.js';
import { CREATURES } from '@shared/creatures.js';
import * as Actors from './index.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'play';
const canvas = document.getElementById('game');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, false);
engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio, 1.5));
const scene = new Scene(engine);
scene.clearColor = new Color4(0.62, 0.68, 0.74, 1);
scene.ambientColor = new Color3(0.2, 0.2, 0.22);
scene.imageProcessingConfiguration.toneMappingEnabled = true;
scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
scene.imageProcessingConfiguration.exposure = 1.15;
scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.0025; scene.fogColor = new Color3(0.62, 0.68, 0.74);

// procedural sky cube for IBL
{
  const size = 32, faces = [];
  const sky = [0.55, 0.66, 0.8], hor = [0.86, 0.82, 0.74], gnd = [0.28, 0.25, 0.22];
  const dirs = [(u, v) => [1, -v, -u], (u, v) => [-1, -v, u], (u, v) => [u, 1, v], (u, v) => [u, -1, -v], (u, v) => [u, -v, 1], (u, v) => [-u, -v, -1]];
  for (const f of dirs) {
    const d = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const [dx, dy, dz] = f((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
      const l = Math.hypot(dx, dy, dz), ny = dy / l;
      const c = ny > 0 ? hor.map((h, i) => h + (sky[i] - h) * Math.pow(ny, 0.6)) : hor.map((h, i) => h + (gnd[i] - h) * Math.pow(-ny, 0.4));
      const sun = Math.max(0, (dx * 0.4 + dy * 0.75 + dz * -0.5) / l) ** 64 * 3;
      const i = (y * size + x) * 4;
      d[i] = Math.min(255, (c[0] + sun) * 255); d[i + 1] = Math.min(255, (c[1] + sun * 0.95) * 255); d[i + 2] = Math.min(255, (c[2] + sun * 0.85) * 255); d[i + 3] = 255;
    }
    faces.push(d);
  }
  const env = new RawCubeTexture(scene, faces, size, undefined, undefined, true);
  scene.environmentTexture = env;
  scene.environmentIntensity = 0.85;
}

const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
hemi.intensity = 0.35; hemi.groundColor = new Color3(0.25, 0.22, 0.2);
const sun = new DirectionalLight('sun', new Vector3(-0.4, -0.75, 0.5).normalize(), scene);
sun.intensity = 3.0; sun.diffuse = new Color3(1, 0.95, 0.86);
const shadows = new ShadowGenerator(2048, sun);
shadows.usePercentageCloserFiltering = true; shadows.bias = 0.002; shadows.normalBias = 0.02;
shadows.getShadowMap().refreshRate = 1;

const bus = new Bus();
const quality = { ...(TIERS[params.get('q')] ?? TIERS.high) };
const collision = new CollisionWorld();
const updaters = [];
const center = mode === 'lineup' ? { x: 0, z: 0 } : (() => { const o = OATH_BY_ID[params.get('oath') ?? 'oath-04'] ?? OATHS[3]; return { x: o.center[0] + 12, z: o.center[1] - 18 }; })();
const flat = mode === 'lineup';
const hAt = flat ? () => 0 : heightAt;

const ctx = {
  engine, scene, canvas, bus, quality, params, collision,
  input: createInput(canvas, bus),
  clock: { time: 0, dt: 0, frame: 0 },
  addUpdate(fn, order = 50) { updaters.push({ fn, order }); updaters.sort((a, b) => a.order - b.order); },
  render: {
    sun, hemi, shadows,
    attachCamera(cam) { scene.activeCamera = cam; },
    addShadowCaster(m) { shadows.addShadowCaster(m, false); },
    removeShadowCaster(m) { shadows.removeShadowCaster(m, false); },
  },
  world: {
    heightAt: hAt, normalAt: flat ? () => ({ x: 0, y: 1, z: 0 }) : (x, z) => { const n = normalAt(x, z); return Array.isArray(n) ? { x: n[0], y: n[1], z: n[2] } : n; },
    groundAt: (x, z, y) => collision.groundAt(x, z, y), waterLevel: 0, regionAt, focus() {}, ready: async () => {}, isWater: (x, z) => hAt(x, z) < 0,
  },
  architecture: { sanctuaries: [] },
  assetBase: '/assets/',
  character: null,
};
window.__aetherion = ctx;

// ground
{
  const S = flat ? 120 : 360;
  const g = MeshBuilder.CreateGround('ground', { width: S, height: S, subdivisions: flat ? 2 : 180, updatable: true }, scene);
  g.position.set(center.x, 0, center.z);
  if (!flat) {
    const pos = g.getVerticesData(VertexBuffer.PositionKind);
    for (let i = 0; i < pos.length; i += 3) pos[i + 1] = heightAt(pos[i] + center.x, pos[i + 2] + center.z);
    g.updateVerticesData(VertexBuffer.PositionKind, pos); g.createNormals(true);
  }
  const m = new PBRMaterial('groundMat', scene); m.albedoColor = flat ? new Color3(0.42, 0.4, 0.37) : new Color3(0.36, 0.38, 0.28); m.roughness = 0.95; m.metallic = 0;
  g.material = m; g.receiveShadows = true;
  if (!flat) {
    const water = MeshBuilder.CreateGround('water', { width: S, height: S }, scene);
    water.position.set(center.x, 0.0, center.z);
    const wm = new PBRMaterial('waterMat', scene); wm.albedoColor = new Color3(0.05, 0.16, 0.22); wm.roughness = 0.08; wm.alpha = 0.78; wm.metallic = 0;
    water.material = wm;
    // architecture-like props: a walkable platform with a ramp and a wall
    const gy = heightAt(center.x + 8, center.z + 10);
    const plat = MeshBuilder.CreateBox('plat', { width: 6, depth: 6, height: 1.2 }, scene);
    plat.position.set(center.x + 8, gy + 0.6, center.z + 14);
    const pm = new PBRMaterial('stone', scene); pm.albedoColor = new Color3(0.6, 0.57, 0.52); pm.roughness = 0.85; pm.metallic = 0; plat.material = pm; plat.receiveShadows = true;
    shadows.addShadowCaster(plat);
    collision.addBox(center.x + 8, center.z + 14, 3, 3, 0, gy - 2, gy + 1.2, { walkable: true });
    const step = MeshBuilder.CreateBox('step', { width: 2, depth: 1, height: 0.45 }, scene);
    step.position.set(center.x + 8, gy + 0.225, center.z + 10.5); step.material = pm;
    collision.addBox(center.x + 8, center.z + 10.5, 1, 0.5, 0, gy - 2, gy + 0.45, { walkable: true });
    const wall = MeshBuilder.CreateBox('wall', { width: 0.6, depth: 8, height: 3 }, scene);
    wall.position.set(center.x + 2, gy + 1.5, center.z + 14); wall.material = pm; shadows.addShadowCaster(wall);
    collision.addBox(center.x + 2, center.z + 14, 0.3, 4, 0, gy - 2, gy + 3);
  }
}

const actors = await Actors.init(ctx);
ctx.actors = actors;

// ---------------------------------------------------------------- fake net
const remotes = [];
const N_REMOTE = +(params.get('remotes') ?? 8), N_MOB = +(params.get('mobs') ?? 10);
const sent = [];
ctx.net = { mode: 'offline', selfId: 'me', send(m) { sent.push(m); if (sent.length > 50) sent.shift(); }, rtt: 0, serverTime: () => Date.now() };
let simT = 0;
if (mode === 'play') {
  for (let i = 0; i < N_REMOTE; i++) {
    const o = OATHS[(i * 4 + 2) % 15];
    remotes.push({ id: `p${i}`, k: 'p', name: ['Ysolde', 'Kaito', 'Brannoch', 'Imre', 'Sefa', 'Odalys', 'Tarek', 'Liesl', 'Mahon', 'Quill'][i % 10], oath: o.id, cls: i % 2 ? 'sorcerer' : 'ninja', lvl: 3 + i, hp: 120, mhp: 140,
      cx: center.x + (i % 4) * 9 - 14, cz: center.z + Math.floor(i / 4) * 9 - 2, r: 3 + (i % 3) * 2, sp: [0, 1.4, 5.8, 8.5][i % 4], ph: i });
  }
  const pick = CREATURES.filter((c) => c.role !== 'boss');
  for (let i = 0; i < N_MOB; i++) {
    const c = pick[(i * 7) % pick.length];
    remotes.push({ id: `m${i}`, k: 'm', name: c.name, model: c.id, oath: c.oath, lvl: 4 + (i % 6), hp: 80 - i * 5, mhp: 100,
      cx: center.x - 30 + (i % 5) * 12, cz: center.z + 22 + Math.floor(i / 5) * 12, r: 2 + (i % 3), sp: [0, 1.5, 4.5][i % 3], ph: i * 1.3 });
  }
  remotes.push({ id: 'n0', k: 'n', name: 'Maren of the Tide', oath: 'oath-04', cls: 'sorcerer', lvl: 30, hp: 100, mhp: 100, role: 'oathkeeper', cx: center.x + 4, cz: center.z + 4, r: 0, sp: 0, ph: 0 });
  setInterval(() => {
    simT += 0.1;
    const ents = remotes.map((e) => {
      const a = e.ph + simT * (e.sp / Math.max(1, e.r));
      const x = e.cx + Math.cos(a) * e.r * (e.sp ? 1 : 0), z = e.cz + Math.sin(a) * e.r * (e.sp ? 1 : 0);
      const ry = e.sp ? Math.atan2(-Math.sin(a), Math.cos(a)) : 0;
      let anim = e.sp === 0 ? 'idle' : e.sp < 2 ? 'walk' : e.sp < 7 ? 'run' : 'sprint';
      const cyc = (simT + e.ph) % 9;
      if (e.sp === 0 && cyc > 6 && cyc < 7.5) anim = e.k === 'p' && e.cls === 'sorcerer' ? 'cast' : 'attack';
      if (e.k === 'm' && e.id === 'm3' && cyc > 8) anim = 'dead';
      return { id: e.id, k: e.k, name: e.name, oath: e.oath, cls: e.cls, model: e.model, lvl: e.lvl, x, y: heightAt(x, z), z, ry, anim, hp: anim === 'dead' ? 0 : e.hp, mhp: e.mhp, role: e.role };
    });
    bus.emit('net:snap', { t: 'snap', time: Date.now(), timeOfDay: 10, ents, gone: [] });
  }, 100);
  const ch = { name: params.get('name') ?? 'Tester', oath: params.get('oath') ?? 'oath-04', cls: params.get('cls') ?? 'ninja' };
  ctx.character = ch;
  bus.emit('game:character', ch);
  bus.emit('net:welcome', { id: 'me', you: {} });
  bus.emit('game:start', ch);
  setTimeout(() => bus.emit('combat:target', { id: 'm1' }), 1500);
} else {
  // lineup: static camera framing
  const which = params.get('which') ?? 'all';
  const oaths = params.get('oaths')?.split(',').map((n) => `oath-${n.padStart(2, '0')}`);
  const perRow = +(params.get('perRow') ?? 10), spacing = +(params.get('spacing') ?? 1.5);
  actors.lineup({ which, flat: true, origin: { x: 0, z: 0 }, oaths, cls: params.get('lcls') ?? undefined, perRow, spacing });
  const view = params.get('view') ?? 'front';
  const cam = actors.camera;
  const target = which === 'creatures' ? new Vector3(0, 1.2, 13.5) : new Vector3(0, 1.0, which === 'humans' ? 1.6 : 6);
  const dist = +(params.get('dist') ?? (which === 'creatures' ? 21 : which === 'humans' ? 15 : 26));
  if (params.get('ty')) target.y = +params.get('ty');
  const ang = { front: 0, back: Math.PI, side: Math.PI / 2, three: Math.PI / 5 }[view] ?? 0;
  actors.orbit.target = null;
  actors.orbit.update = () => {
    cam.position.set(target.x + Math.sin(ang) * dist, target.y + 1.2 + (params.get('high') ? 6 : 0), target.z - Math.cos(ang) * dist);
    cam.setTarget(target);
  };
  cam.fov = +(params.get('fov') ?? 0.8);
  // freeze animation phase for clean comparison if requested
  if (params.get('anim')) setTimeout(() => actors.forEach((a) => a.playAnim(params.get('anim'))), 600);
}

// HUD
const hud = document.getElementById('hud');
let hudT = 0;
engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
  ctx.clock.dt = dt; ctx.clock.time += dt; ctx.clock.frame++;
  ctx.input.poll();
  for (const u of updaters) u.fn(dt);
  scene.render();
  ctx.input.endFrame();
  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.5;
    const p = actors.player;
    const c = p?.controller;
    hud.textContent = `fps ${engine.getFps().toFixed(0)}  meshes ${scene.meshes.length}  active ${scene.getActiveMeshes().length}  ents ${actors.entities.size}\n` +
      (p ? `pos ${p.position.x.toFixed(1)},${p.position.y.toFixed(1)},${p.position.z.toFixed(1)}  spd ${c.groundSpeed.toFixed(2)}  state ${p.body.animator.state}  anim ${c.animString()}  ground ${c.grounded} swim ${c.swimming}\nlast send ${JSON.stringify(sent[sent.length - 1] ?? null)}` : '');
  }
});
addEventListener('resize', () => engine.resize());
window.__dev = { actors, ctx, sent };
