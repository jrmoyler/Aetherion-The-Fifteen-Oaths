// Architecture QA harness: engine + sun/sky/IBL + terrain patch from heightAt + the architecture
// module, camera framed like the reference ENVIRONMENT panels.
// URL params: oath=oath-09, cam=dist,height,yawDeg,lookZ,lookY  sun=azDeg,elDeg  q=high  all=1  fov=0.9
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { OATH_BY_ID } from '@shared/oaths.js';
import { heightAt, SANCTUARY_HEIGHT } from '@shared/terrain.js';
import { TIERS } from '../core/quality.js';
import { CollisionWorld } from '../core/collision.js';
import { getMaterial, materialStats } from '../materials/index.js';
import * as Arch from './index.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, false);
engine.setHardwareScalingLevel(Number(params.get('hw') || 1));
const scene = new Scene(engine);
const quality = { ...(TIERS[params.get('q') || 'high']) };
const oathId = params.get('oath') || 'oath-09';
const oath = OATH_BY_ID[oathId];
const [cx, cz] = oath.center; const Y = SANCTUARY_HEIGHT[oathId];

const SKY = {
  'oath-01': ['#5a6270', '#b8a898', '#3a3330'], 'oath-02': ['#6a7c90', '#c8d2dc', '#4a5058'], 'oath-03': ['#3a4458', '#8a92a2', '#3a3c40'],
  'oath-04': ['#5a8cc0', '#dce8f0', '#6a7a70'], 'oath-05': ['#7a9cc0', '#e0d4c4', '#7a6248'], 'oath-06': ['#5a90c8', '#e4ecf0', '#5a6a4a'],
  'oath-07': ['#6a9ac8', '#e0e8dc', '#4a5a30'], 'oath-08': ['#7a8a9a', '#c8ccc4', '#4a4a3a'], 'oath-09': ['#6aa0d8', '#eaf0f4', '#8a8a78'],
  'oath-10': ['#4a5470', '#a8b0c4', '#3a3c48'], 'oath-11': ['#7a7c84', '#c8c8cc', '#5a5a5c'], 'oath-12': ['#8a7a80', '#d8c4b8', '#6a4a40'],
  'oath-13': ['#8a9cc0', '#e0e4ec', '#6a6a70'], 'oath-14': ['#7a92b0', '#d4dce4', '#5a5a58'], 'oath-15': ['#8a929c', '#ccd0d4', '#5a5c60'],
};
const GROUND = { volcanic: '#2e2a28', glacial: '#c8d0d8', alpine: '#4a5048', coast: '#9a9a70', canyon: '#a8845c', cliffs: '#6a7a4a', forest: '#4a5a2a', marsh: '#5a5a3a', meadow: '#6a7a42', highland: '#5a5c58', badlands: '#8a8478', crimson: '#6a4a40', terraces: '#6a7058', plateau: '#8a8270', industrial: '#5a5a58' };

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const [zen, hor, gnd] = (SKY[oathId] || SKY['oath-09']).map(hex);
scene.clearColor = new Color4(hor[0], hor[1], hor[2], 1);

// ------------------------------------------------ procedural environment cube (gradient sky)
{
  const N = 32; const faces = [];
  const dir = (f, u, v) => { switch (f) { case 0: return [1, -v, -u]; case 1: return [-1, -v, u]; case 2: return [u, 1, v]; case 3: return [u, -1, -v]; case 4: return [u, -v, 1]; default: return [-u, -v, -1]; } };
  for (let f = 0; f < 6; f++) {
    const d = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N * 2 - 1, v = (j + 0.5) / N * 2 - 1; const [x, y, z] = dir(f, u, v); const l = Math.hypot(x, y, z); const yy = y / l;
      let c; if (yy > 0) { const t = Math.pow(yy, 0.6); c = hor.map((h, k) => h + (zen[k] - h) * t); } else { const t = Math.min(1, -yy * 4); c = hor.map((h, k) => h * 0.8 + (gnd[k] - h * 0.8) * t); }
      const o = (j * N + i) * 4; d[o] = c[0] * 255; d[o + 1] = c[1] * 255; d[o + 2] = c[2] * 255; d[o + 3] = 255;
    }
    faces.push(d);
  }
  const env = new RawCubeTexture(scene, faces, N, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, true, false);
  env.gammaSpace = true;
  scene.environmentTexture = env;
  scene.environmentIntensity = 0.7;
}

// ------------------------------------------------ sky dome
{
  const P = [], C = [], I = []; const R = 5000, seg = 32, rings = 16;
  for (let r = 0; r <= rings; r++) {
    const t = -0.2 + (r / rings) * 1.2; const phi = t * Math.PI / 2; const y = Math.sin(phi), rr = Math.cos(phi);
    let c; if (y > 0) { const k = Math.pow(y, 0.55); c = hor.map((h, i) => h + (zen[i] - h) * k); } else c = hor.map((h, i) => h * 0.9 + (gnd[i] - h) * Math.min(1, -y * 3));
    for (let s = 0; s <= seg; s++) { const a = (s / seg) * Math.PI * 2; P.push(Math.cos(a) * rr * R, y * R, Math.sin(a) * rr * R); C.push(Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2), 1); }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) { const a = r * (seg + 1) + s, b = a + seg + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
  const sky = new Mesh('sky', scene); const vd = new VertexData(); vd.positions = P; vd.colors = C; vd.indices = I; vd.applyToMesh(sky);
  const m = new PBRMaterial('skyMat', scene); m.unlit = true; m.backFaceCulling = false; m.albedoColor = new Color3(1, 1, 1); m.disableDepthWrite = true; sky.material = m;
  sky.infiniteDistance = true; sky.applyFog = false; sky.isPickable = false;
}

// ------------------------------------------------ lights
const [saz, sel] = (params.get('sun') || '215,38').split(',').map(Number);
const sunDir = new Vector3(-Math.sin(saz * Math.PI / 180) * Math.cos(sel * Math.PI / 180), -Math.sin(sel * Math.PI / 180), -Math.cos(saz * Math.PI / 180) * Math.cos(sel * Math.PI / 180));
const sun = new DirectionalLight('sun', sunDir, scene); sun.intensity = 3.6; sun.diffuse = new Color3(1, 0.93, 0.82);
sun.position = new Vector3(cx, Y, cz).subtract(sunDir.scale(400));
const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene); hemi.intensity = 0.25; hemi.diffuse = new Color3(zen[0], zen[1], zen[2]); hemi.groundColor = new Color3(gnd[0], gnd[1], gnd[2]);
const sg = new ShadowGenerator(quality.shadowSize || 2048, sun);
sg.usePercentageCloserFiltering = true; sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM; sg.bias = 0.0008; sg.normalBias = 0.02;
sun.shadowMinZ = 1; sun.shadowMaxZ = 900; sun.autoUpdateExtends = false;
sun.orthoLeft = -190; sun.orthoRight = 190; sun.orthoTop = 190; sun.orthoBottom = -190;

scene.imageProcessingConfiguration.toneMappingEnabled = true;
scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
scene.imageProcessingConfiguration.exposure = 1.0;
scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.0006; scene.fogColor = new Color3(hor[0], hor[1], hor[2]);

// ------------------------------------------------ terrain patch
{
  const half = 700, step = 5; const n = Math.floor((half * 2) / step) + 1;
  const P = new Float32Array(n * n * 3), N = new Float32Array(n * n * 3), U = new Float32Array(n * n * 2); const I = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + i * step, z = -half + j * step; const k = j * n + i;
    P[k * 3] = x; P[k * 3 + 1] = heightAt(cx + x, cz + z) - 0.05; P[k * 3 + 2] = z; U[k * 2] = x; U[k * 2 + 1] = z;
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i; I.push(a, a + 1, a + n, a + 1, a + n + 1, a + n); }
  VertexData.ComputeNormals(P, I, N);
  const t = new Mesh('terrain', scene); const vd = new VertexData(); vd.positions = P; vd.normals = N; vd.uvs = U; vd.indices = I; vd.applyToMesh(t);
  t.position.set(cx, 0, cz); t.receiveShadows = true; t.isPickable = false;
  t.material = getMaterial(scene, 'ground.rock', { tint: GROUND[oath.biome] || '#6a7a42', uvScale: 0.6 });
  // sea
  const sea = new Mesh('sea', scene); const sv = new VertexData(); sv.positions = [-3000, 0, -3000, 3000, 0, -3000, 3000, 0, 3000, -3000, 0, 3000]; sv.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]; sv.uvs = [0, 0, 600, 0, 600, 600, 0, 600]; sv.indices = [0, 2, 1, 0, 3, 2]; sv.applyToMesh(sea);
  sea.position.set(cx, -0.3, cz); sea.material = getMaterial(scene, 'liquid.water');
}

// ------------------------------------------------ ctx + architecture
const updaters = [];
const ctx = {
  engine, scene, canvas, quality, params, bus: { on() { return () => {}; }, emit() {} },
  collision: new CollisionWorld(), clock: { time: 0, dt: 0, frame: 0 },
  render: { sun, shadows: sg, addShadowCaster: (m) => sg.addShadowCaster(m, false), removeShadowCaster: (m) => sg.removeShadowCaster(m, false) },
  addUpdate(fn, order = 50) { updaters.push({ fn, order }); updaters.sort((a, b) => a.order - b.order); },
};
window.__aetherion = ctx;

const camP = (params.get('cam') || '84,44,180,16,4').split(',').map(Number);
const cam = new FreeCamera('cam', new Vector3(cx, Y + 40, cz - 80), scene);
cam.fov = Number(params.get('fov') || 0.85); cam.minZ = 0.5; cam.maxZ = 6000;
scene.activeCamera = cam;
cam.attachControl(canvas, true); cam.speed = 2;

const t0 = performance.now();
const arch = await Arch.init(ctx);
const tInit = performance.now() - t0;
const sanct = arch.sanctuaries.find((s) => s.oathId === oathId);
{
  const th = sanct.theta ?? 0; const [dist, hgt, yawD, lookZ, lookY] = camP; const yaw = yawD * Math.PI / 180;
  const lx = Math.sin(yaw) * dist, lz = Math.cos(yaw) * dist;
  const w = (x, z) => [cx + x * Math.cos(th) + z * Math.sin(th), cz - x * Math.sin(th) + z * Math.cos(th)];
  const [ex, ez] = w(lx, lz); const [tx, tz] = w(0, lookZ ?? 16);
  cam.position.set(ex, Y + hgt, ez); cam.setTarget(new Vector3(tx, Y + (lookY ?? 4), tz));
}
if (params.get('all')) for (const s of arch.sanctuaries) arch.ensureBuilt(s.oathId);
window.__arch = arch;

const hud = document.getElementById('hud');
let acc = 0;
engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
  ctx.clock.dt = dt; ctx.clock.time += dt; ctx.clock.frame++;
  for (const u of updaters) u.fn(dt);
  scene.render();
  acc += dt;
  if (acc > 0.5) { acc = 0; const st = arch.stats().find((s) => s.id === oathId); hud.textContent = `${oath.name}  init ${tInit.toFixed(0)}ms ${JSON.stringify({...(window.__archTiming||{}), mat: undefined})} ${JSON.stringify(materialStats(scene))}  fps ${engine.getFps().toFixed(1)}  meshes ${scene.getActiveMeshes().length}/${scene.meshes.length}  draws ${engine._drawCalls?.current ?? '?'}\n${JSON.stringify(st)}`; }
});
addEventListener('resize', () => engine.resize());
