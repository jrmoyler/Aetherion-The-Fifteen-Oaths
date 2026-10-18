// VFX studio harness (dev only): dark-grey studio floor, PBR mannequin stand-ins (caster + target dummy),
// any castable frozen at a time, or a gallery cycling all 100.
//   ?ability=<uid>&phase=<seconds>   render one ability, freeze at that effect time
//   ?gallery=1[&element=fire][&every=4]   cycle all castables (optionally one element)
//   ?basic=ninja|sorcerer&element=<el>   basic attacks;  ?status=burning  status visuals
//   ?cam=side|top|hero|front   ?q=low|medium|high|ultra   ?gpu=0   ?bloom=0   ?dist=8
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { ReflectionProbe } from '@babylonjs/core/Probes/reflectionProbe.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import '@babylonjs/core/Rendering/outlineRenderer.js';
import { Bus } from '../core/bus.js';
import { TIERS } from '../core/quality.js';
import { ABILITIES_BY_OATH, ABILITY_BY_ID } from '@shared/abilities.js';
import { init as initVfx } from './index.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.07, 0.075, 0.085, 1);
scene.imageProcessingConfiguration.toneMappingEnabled = true;
scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
scene.imageProcessingConfiguration.exposure = 1.1;

const DIST = +(params.get('dist') ?? 8);
const cam = new ArcRotateCamera('cam', 0, 1, 10, new Vector3(0, 1.4, DIST * 0.55), scene);
const camMode = params.get('cam') ?? 'side';
if (camMode === 'top') { cam.alpha = -Math.PI / 2; cam.beta = 0.05; cam.radius = DIST * 2; cam.target = new Vector3(0, 0, DIST * 0.6); }
else if (camMode === 'hero') { cam.alpha = -0.3; cam.beta = 1.32; cam.radius = DIST * 1.05; }
else if (camMode === 'front') { cam.alpha = Math.PI / 2 + 0.5; cam.beta = 1.2; cam.radius = DIST * 1.3; }
else { cam.alpha = -0.62; cam.beta = 1.22; cam.radius = DIST * 1.35; }
cam.minZ = 0.1; cam.attachControl(canvas, true);

const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, -0.3), scene); hemi.intensity = 0.35; hemi.groundColor = new Color3(0.08, 0.08, 0.09);
const sun = new DirectionalLight('key', new Vector3(0.4, -1, 0.6), scene); sun.intensity = 1.6; sun.diffuse = new Color3(0.95, 0.93, 0.9);

// --- studio floor: dark grey flagstones painted procedurally
const floorTex = new DynamicTexture('floor', { width: 1024, height: 1024 }, scene, true);
{
  const c = floorTex.getContext(); c.fillStyle = '#3a3c40'; c.fillRect(0, 0, 1024, 1024);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = 52 + Math.floor(r() * 22); c.fillStyle = `rgb(${v},${v + 1},${v + 4})`; c.fillRect(x * 128 + 3, y * 128 + 3, 122, 122);
    for (let k = 0; k < 60; k++) { const w = 40 + r() * 30; c.fillStyle = `rgba(${w},${w},${w + 3},0.25)`; c.fillRect(x * 128 + r() * 120, y * 128 + r() * 120, 2 + r() * 6, 2 + r() * 6); }
  }
  floorTex.update();
}
const floorMat = new PBRMaterial('floorMat', scene);
floorMat.albedoTexture = floorTex; floorMat.albedoTexture.uScale = floorMat.albedoTexture.vScale = 6; floorMat.metallic = 0; floorMat.roughness = 0.55; floorMat.environmentIntensity = 0.5;
const ground = CreateGround('ground', { width: 120, height: 120 }, scene); ground.material = floorMat; ground.position.z = DIST / 2;

// --- environment for PBR reflections (procedural gradient dome captured once by a probe)
const skyTex = new DynamicTexture('sky', { width: 16, height: 256 }, scene, false);
{ const c = skyTex.getContext(); const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#5a6070'); g.addColorStop(0.5, '#2a2d34'); g.addColorStop(1, '#101114'); c.fillStyle = g; c.fillRect(0, 0, 16, 256); skyTex.update(); }
const sky = CreateSphere('sky', { diameter: 400, segments: 8, sideOrientation: 1 }, scene);
const skyMat = new StandardMaterial('skyMat', scene); skyMat.emissiveTexture = skyTex; skyMat.disableLighting = true; skyMat.backFaceCulling = false; sky.material = skyMat; sky.infiniteDistance = true;
const probe = new ReflectionProbe('probe', 128, scene); probe.renderList.push(sky); probe.refreshRate = 0; probe.position = new Vector3(0, 2, DIST / 2);
scene.environmentTexture = probe.cubeTexture;

// --- mannequins
function mannequin(name, color, robe) {
  const root = new TransformNode(name, scene);
  const m = new PBRMaterial(`${name}.mat`, scene); m.albedoColor = Color3.FromHexString(color); m.metallic = robe ? 0.1 : 0.25; m.roughness = robe ? 0.75 : 0.4;
  const parts = [];
  const add = (mesh, x, y, z, rx = 0, rz = 0) => { mesh.parent = root; mesh.position.set(x, y, z); mesh.rotation.x = rx; mesh.rotation.z = rz; mesh.material = m; parts.push(mesh); return mesh; };
  if (robe) add(CreateCylinder(`${name}.robe`, { height: 1.15, diameterTop: 0.42, diameterBottom: 0.85, tessellation: 18 }, scene), 0, 0.58, 0);
  else { add(CreateCapsule(`${name}.legL`, { radius: 0.09, height: 0.9 }, scene), -0.11, 0.45, 0); add(CreateCapsule(`${name}.legR`, { radius: 0.09, height: 0.9 }, scene), 0.11, 0.45, 0); }
  add(CreateCapsule(`${name}.torso`, { radius: 0.19, height: 0.7 }, scene), 0, 1.27, 0);
  add(CreateSphere(`${name}.head`, { diameter: 0.24, segments: 12 }, scene), 0, 1.72, 0);
  add(CreateCapsule(`${name}.armL`, { radius: 0.06, height: 0.62 }, scene), -0.27, 1.25, 0, 0, 0.15);
  const armR = add(CreateCapsule(`${name}.armR`, { radius: 0.06, height: 0.62 }, scene), 0.22, 1.36, 0.25, -1.25, 0);
  const hand = new TransformNode(`${name}.hand`, scene); hand.parent = root; hand.position.set(0.22, 1.4, 0.6);
  return {
    id: name, root, name, kind: 'player', position: root.position, headY: 1.8, alive: true, hp: 100, mhp: 100, parts, armR,
    socket: (s) => (s === 'hand.R' ? hand : root), playAnim() {}, getChildMeshes: () => parts,
  };
}
const caster = mannequin('caster', '#1d2433', true); caster.root.position.set(0, 0, 0);
const target = mannequin('target', '#8d8f93', false); target.root.position.set(0, 0, DIST); target.root.rotation.y = Math.PI;

if (params.get('bloom') !== '0') {
  const pipe = new DefaultRenderingPipeline('dev', true, scene, [cam]);
  pipe.bloomEnabled = true; pipe.bloomThreshold = 0.75; pipe.bloomWeight = 0.55; pipe.bloomKernel = 48; pipe.bloomScale = 0.5;
  pipe.imageProcessingEnabled = true; pipe.imageProcessing.toneMappingEnabled = true; pipe.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES; pipe.imageProcessing.exposure = 1.1;
  pipe.fxaaEnabled = true;
}

// --- ctx stub mirroring the game's
const updaters = [];
const q = TIERS[params.get('q') ?? 'high'] ?? TIERS.high;
const ctx = {
  engine, scene, canvas, bus: new Bus(), quality: { ...q }, params, clock: { time: 0, dt: 0, frame: 0 },
  addUpdate(fn, order = 50) { updaters.push({ fn, order }); updaters.sort((a, b) => a.order - b.order); return () => {}; },
};
window.__aetherion = ctx;
ctx.bus.on('camera:shake', (s) => { shakeT = s.duration; shakeS = s.strength; });
let shakeT = 0; let shakeS = 0;

const vfx = await initVfx(ctx);
ctx.vfx = vfx;
const hud = document.getElementById('hud');
const ALL = Object.values(ABILITIES_BY_OATH).flat();

const phase = params.has('phase') ? +params.get('phase') : null;
let current = null; let frozen = false;

function playAbility(id) {
  vfx.stopAll(); vfx.setTimeScale(1); frozen = false;
  const ab = ABILITY_BY_ID[id];
  const tgtPos = ab?.shape === 'self' || ab?.shape === 'summon' ? null : target.root.position.clone();
  current = vfx.castEffect({ ...ab, castTime: ab?.castTime ?? 0.35 }, { caster, target: tgtPos, dir: { x: 0, z: 1 }, local: true, shake: true, seed: 7 });
  hud.innerHTML = `${ab?.name ?? id}<small>${ab?.element ?? ''} · ${ab?.shape ?? ''} · ${id}${phase !== null ? ` · t=${phase}s` : ''}</small>`;
}

// Batch QA hook: render ability `id` frozen at `t` seconds; resolves when frozen.
let showPhase = null;
window.__vfxShow = (id, t, cam) => new Promise((res) => {
  if (cam) setCam(cam);
  showPhase = { t, res }; playAbility(id);
});
function setCam(mode) {
  if (mode === 'top') { cam.alpha = -Math.PI / 2; cam.beta = 0.05; cam.radius = DIST * 2; cam.target.set(0, 0, DIST * 0.6); }
  else if (mode === 'hero') { cam.alpha = -0.3; cam.beta = 1.32; cam.radius = DIST * 1.05; cam.target.set(0, 1.4, DIST * 0.55); }
  else { cam.alpha = -0.62; cam.beta = 1.22; cam.radius = DIST * 1.35; cam.target.set(0, 1.4, DIST * 0.55); }
}
const gallery = params.get('gallery'); const basic = params.get('basic'); const status = params.get('status');
let list = ALL.map((a) => a.id);
if (params.get('element')) list = ALL.filter((a) => a.element === params.get('element')).map((a) => a.id);
let gi = 0; let gt = 0; const every = +(params.get('every') ?? 4);

if (basic) {
  const el = params.get('element') ?? 'fire';
  const fire = () => { current = vfx.play(`basic:${basic}:${el}`, { caster, target: target.root.position.clone(), dir: { x: 0, z: 1 }, local: true, combo: Math.floor(Math.random() * 3) }); };
  fire(); setInterval(fire, 1200);
  hud.innerHTML = `Basic ${basic}<small>${el}</small>`;
} else if (status) {
  const kinds = status.split(',');
  kinds.forEach((k, i) => vfx.play(`status:${k}`, { pos: target.root.position.clone().add(new Vector3((i - (kinds.length - 1) / 2) * 1.6, 0, 0)), duration: 999, follow: (() => { const p = target.root.position.clone().add(new Vector3((i - (kinds.length - 1) / 2) * 1.6, 0, 0)); return () => p; })() }));
  hud.innerHTML = `Status<small>${status}</small>`;
} else if (gallery) {
  playAbility(list[0]);
} else {
  playAbility(params.get('ability') ?? 'codex/riptide');
}

engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
  ctx.clock.dt = dt; ctx.clock.time += dt; ctx.clock.frame++;
  for (const u of updaters) u.fn(dt);
  if (phase !== null && current?.effect && !frozen && current.effect.t >= phase) { vfx.setTimeScale(0); frozen = true; }
  if (showPhase && current?.effect && current.effect.t >= showPhase.t) { vfx.setTimeScale(0); const r = showPhase.res; showPhase = null; setTimeout(() => r(true), 400); }
  else if (showPhase && (!current || current.done)) { const r = showPhase.res; showPhase = null; r(false); }
  if (gallery) { gt += dt; if (gt > every) { gt = 0; gi = (gi + 1) % list.length; playAbility(list[gi]); } }
  else if (!basic && !status && phase === null && !params.has('batch') && current?.done) { setTimeout(() => playAbility(params.get('ability') ?? 'codex/riptide'), 600); current = null; }
  if (shakeT > 0) { shakeT -= dt; cam.target.x += (Math.random() - 0.5) * shakeS * 0.05; }
  scene.render();
});
addEventListener('resize', () => engine.resize());
