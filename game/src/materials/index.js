// Procedural PBR material library (owned by architecture, shared by every module).
// Every texture is baked in code at runtime (tileable noise + patterns -> albedo / normal / ORM
// [+ emissive] RawTextures). No image files.
//
//   getMaterial(scene, key, { tint, uvScale, emissive, emissiveIntensity, alpha, roughness,
//                             metallic, wind, id, albedoTexture, backFaceCulling })
//
// Materials are cached per (scene, key, options) and frozen unless animated (wind / flowing
// liquids / lava). Textures are cached per (scene, key, uvScale). Texture coordinates are in
// metres (world/box projected by the architecture builder); each material scales them by its
// physical tile size, so modules tile without stretching.
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { MATERIALS, MATERIAL_KEYS } from './library.js';
import { srgbToLinear, linearToSrgb, hexToRgb } from './noise.js';
import { bake } from './bake.js';

export { MATERIAL_KEYS };

let TEX_SIZE = 256;
/** Texture bake resolution (power of two). Call before the first getMaterial. */
export function setTextureSize(n) { TEX_SIZE = n; }
export function textureSizeForQuality(q) { return q && (q.name === 'high' || q.name === 'ultra') ? 512 : 256; }

const SCENE_CACHE = new WeakMap(); // scene -> {tex: Map, mat: Map, anim: [], windMats: []}
const WIND = { time: 0 };

function sceneCache(scene) {
  let c = SCENE_CACHE.get(scene);
  if (!c) { c = { tex: new Map(), mat: new Map(), anim: [], bakeMs: 0 }; SCENE_CACHE.set(scene, c); }
  return c;
}

/** Replace a placeholder texture's GPU storage with full-resolution data (same texture object,
 * so materials - frozen or not - keep their references). */
function swapIn(tex, data, N, gamma) {
  const scene = tex.getScene(); if (!scene) return;
  if (tex._texture && tex._texture.width === N) { tex.update(data); return; }
  const fresh = rawTex(scene, data, N, gamma, tex.name);
  const old = tex._texture; tex._texture = fresh._texture; fresh._texture = null; fresh.dispose();
  if (old) old.dispose();
}

function rawTex(scene, data, N, gamma, name) {
  const t = RawTexture.CreateRGBATexture(data, N, N, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  t.name = name; t.gammaSpace = gamma; t.wrapU = Texture.WRAP_ADDRESSMODE; t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  return t;
}

// ---------------------------------------------------------------- async full-res baking
// A 64px set is baked synchronously (a few ms) and upsampled as an immediate placeholder; the
// full-resolution set is baked in Web Workers and uploaded in place (same texture objects), so
// boot never waits on texture generation.
const COARSE = 64;
const REG = new Map(); // key -> [texture sets]
const STATS = { workerMs: 0, done: 0, queued: 0 };
let workers = null; const queue = []; const inflight = new Set(); const waiters = [];
function ensureWorkers() {
  if (workers !== null) return workers;
  workers = [];
  try {
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./bakeWorker.js', import.meta.url), { type: 'module' });
      w.busy = false;
      w.onmessage = (e) => { w.busy = false; onBaked(e.data); pump(); };
      w.onerror = (e) => { console.warn('[materials] bake worker error', e.message); w.busy = false; w.dead = true; pump(); };
      workers.push(w);
    }
  } catch (err) { console.warn('[materials] workers unavailable, baking on main thread', err); workers = []; }
  return workers;
}
function pump() {
  const ws = ensureWorkers().filter((w) => !w.dead);
  if (!ws.length) {
    // main-thread fallback, one set per tick
    if (queue.length) setTimeout(() => { const key = queue.shift(); if (key) { const r = bake(key, TEX_SIZE, false); onBaked({ key, N: TEX_SIZE, ...r }); } pump(); }, 0);
    return;
  }
  for (const w of ws) {
    if (w.busy || !queue.length) continue;
    const key = queue.shift(); w.busy = true; w.postMessage({ key, N: TEX_SIZE });
  }
  if (!queue.length && !inflight.size) while (waiters.length) waiters.shift()();
}
function requestBake(key) {
  if (inflight.has(key)) return;
  inflight.add(key); queue.push(key); STATS.queued++; pump();
}
function onBaked(r) {
  inflight.delete(r.key);
  if (r.error) { console.warn('[materials] bake failed', r.key, r.error); return; }
  STATS.workerMs += r.ms || 0; STATS.done++;
  // full-res CPU data is not retained (memory); later uv-scale variants re-request a bake
  for (const s of REG.get(r.key) || []) {
    swapIn(s.albedo, r.albedo, r.N, true); swapIn(s.normal, r.normal, r.N, false); swapIn(s.orm, r.orm, r.N, false);
    if (s.emissive && r.emis) swapIn(s.emissive, r.emis, r.N, true);
  }
  if (!queue.length && !inflight.size) while (waiters.length) waiters.shift()();
}
/** Resolves when every requested full-resolution texture set has been uploaded. */
export function texturesReady() { return new Promise((res) => { if (!queue.length && !inflight.size) res(); else waiters.push(res); }); }

/** Flat placeholder (sampled average colour / roughness / metalness) until the full bake lands. */
const PH = new Map();
function placeholder(key, N) {
  let p = PH.get(key);
  if (!p) {
    const def = MATERIALS[key]; const o = { h: 0.5, r: 0.5, g: 0.5, b: 0.5, rough: 0.8, metal: 0, er: 0, eg: 0, eb: 0 };
    let r = 0, g = 0, b = 0, ro = 0, me = 0, er = 0, eg = 0, eb = 0, lr = 0, lg = 0, lb = 0; const K = 96;
    for (let i = 0; i < K; i++) {
      o.er = o.eg = o.eb = 0; def.gen(((i * 0.618034) % 1), ((i * 0.381966 + 0.13) % 1), o);
      const k = 0.9; r += o.r * k; g += o.g * k; b += o.b * k; ro += o.rough; me += o.metal; er += o.er; eg += o.eg; eb += o.eb;
      lr += srgbToLinear(Math.min(1, o.r * k)); lg += srgbToLinear(Math.min(1, o.g * k)); lb += srgbToLinear(Math.min(1, o.b * k));
    }
    p = { c: [r / K, g / K, b / K], orm: [0.85, ro / K, me / K], e: def.emissiveTex ? [er / K, eg / K, eb / K] : null, avgLin: [lr / K, lg / K, lb / K] };
    PH.set(key, p);
  }
  const fill = (rgb) => { const a = new Uint8Array(N * N * 4); const v = rgb.map((x) => Math.max(0, Math.min(255, Math.round(x * 255)))); for (let i = 0; i < a.length; i += 4) { a[i] = v[0]; a[i + 1] = v[1]; a[i + 2] = v[2]; a[i + 3] = 255; } return a; };
  return { albedo: fill(p.c), normal: fill([0.5, 0.5, 1]), orm: fill(p.orm), emis: p.e ? fill(p.e) : null, avgLin: p.avgLin };
}

/** Texture set for a key (and uv scale). {albedo, normal, orm, emissive, avgLin} */
export function getTextureSet(scene, key, uvScale = 1) {
  const c = sceneCache(scene);
  const def = MATERIALS[key];
  if (!def || def.flat) return null;
  const us = Array.isArray(uvScale) ? uvScale : [uvScale, uvScale];
  const id = `${key}@${us[0]},${us[1]}`;
  let s = c.tex.get(id);
  if (s) return s;
  const t0 = performance.now();
  const N = 4;
  const ph = placeholder(key, N);
  const up = (a) => a;
  const sx = us[0] / def.size[0], sy = us[1] / def.size[1];
  s = {
    albedo: rawTex(scene, ph.albedo, N, true, `${key}.albedo`),
    normal: rawTex(scene, ph.normal, N, false, `${key}.normal`),
    orm: rawTex(scene, ph.orm, N, false, `${key}.orm`),
    emissive: ph.emis ? rawTex(scene, ph.emis, N, true, `${key}.emissive`) : null,
    avgLin: ph.avgLin,
  };
  for (const t of [s.albedo, s.normal, s.orm, s.emissive]) if (t) { t.uScale = sx; t.vScale = sy; }
  if (def.animated) c.anim.push({ tex: [s.albedo, s.normal, s.orm, s.emissive].filter(Boolean), du: def.animated[0] * sx, dv: def.animated[1] * sy });
  c.tex.set(id, s);
  { let arr = REG.get(key); if (!arr) REG.set(key, (arr = [])); arr.push(s); requestBake(key); }
  c.bakeMs += performance.now() - t0;
  return s;
}

// ---------------------------------------------------------------- wind plugin
class WindPlugin extends MaterialPluginBase {
  constructor(material) {
    super(material, 'AetherWind', 200, { AETHER_WIND: false });
    this._enable(true);
  }
  prepareDefines(defines) { defines.AETHER_WIND = true; }
  getClassName() { return 'AetherWindPlugin'; }
  getUniforms() {
    return { ubo: [{ name: 'aetherWindTime', size: 1, type: 'float' }], vertex: '#ifdef AETHER_WIND\nuniform float aetherWindTime;\n#endif\n' };
  }
  bindForSubMesh(ubo) { ubo.updateFloat('aetherWindTime', WIND.time); }
  getCustomCode(shaderType) {
    if (shaderType !== 'vertex') return null;
    return {
      CUSTOM_VERTEX_UPDATE_POSITION: `
#ifdef AETHER_WIND
#ifdef UV1
{
  float aw = clamp(1.0 - uvUpdated.y, 0.0, 1.0); aw = aw * aw;
  float aph = positionUpdated.x * 0.31 + positionUpdated.z * 0.23;
  float as1 = sin(aetherWindTime * 2.3 + aph + uvUpdated.y * 5.0) * 0.6 + sin(aetherWindTime * 3.9 + aph * 1.7 + uvUpdated.x * 4.0) * 0.25;
  positionUpdated += normalUpdated * as1 * aw * 0.32;
  positionUpdated.y += abs(as1) * aw * 0.05;
}
#endif
#endif
`,
    };
  }
}

// ---------------------------------------------------------------- materials
function toColor3Lin(c) { const [r, g, b] = hexToRgb(c); return new Color3(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)); }

/**
 * Get (or create) a cached PBR material.
 * @param {Scene} scene
 * @param {string} key one of MATERIAL_KEYS
 * @param {{tint?:string|number[], uvScale?:number|number[], emissive?:string|number[], emissiveIntensity?:number,
 *          alpha?:number, roughness?:number, metallic?:number, wind?:boolean, id?:string, albedoTexture?:any,
 *          backFaceCulling?:boolean, maxLights?:number}} opts
 */
export function getMaterial(scene, key, opts = {}) {
  const c = sceneCache(scene);
  if (!MATERIALS[key]) { console.warn('[materials] unknown key', key); key = 'stone.limestone'; }
  const cacheKey = `${key}|${JSON.stringify(opts.tint ?? '')}|${JSON.stringify(opts.uvScale ?? 1)}|${JSON.stringify(opts.emissive ?? '')}|${opts.emissiveIntensity ?? ''}|${opts.alpha ?? ''}|${opts.roughness ?? ''}|${opts.metallic ?? ''}|${opts.wind ? 1 : 0}|${opts.id ?? ''}|${opts.backFaceCulling ?? ''}`;
  let m = c.mat.get(cacheKey);
  if (m) return m;
  const def = MATERIALS[key];
  m = new PBRMaterial(`mat:${key}${opts.id ? ':' + opts.id : ''}`, scene);
  m.maxSimultaneousLights = opts.maxLights ?? 6;
  if (def.flat) {
    const col = toColor3Lin(opts.emissive ?? opts.tint ?? linearArrToHex(def.color));
    m.albedoColor = col.scale(0.15);
    m.emissiveColor = col;
    m.emissiveIntensity = opts.emissiveIntensity ?? 2.2;
    m.metallic = 0; m.roughness = 0.6;
  } else {
    const s = getTextureSet(scene, key, opts.uvScale ?? 1);
    m.albedoTexture = opts.albedoTexture ?? s.albedo;
    m.bumpTexture = s.normal;
    m.metallicTexture = s.orm;
    m.useAmbientOcclusionFromMetallicTextureRed = true;
    m.useRoughnessFromMetallicTextureGreen = true;
    m.useMetallnessFromMetallicTextureBlue = true;
    m.metallic = opts.metallic ?? 1;
    m.roughness = opts.roughness ?? 1;
    if (opts.tint && !opts.albedoTexture) {
      const t = toColor3Lin(opts.tint);
      const a = s.avgLin;
      m.albedoColor = new Color3(Math.min(6, t.r / Math.max(a[0], 1e-3)), Math.min(6, t.g / Math.max(a[1], 1e-3)), Math.min(6, t.b / Math.max(a[2], 1e-3)));
    }
    if (s.emissive) {
      m.emissiveTexture = s.emissive;
      m.emissiveColor = opts.emissive ? toColor3Lin(opts.emissive) : new Color3(1, 1, 1);
      m.emissiveIntensity = opts.emissiveIntensity ?? 1;
    } else if (opts.emissive) {
      m.emissiveColor = toColor3Lin(opts.emissive);
      m.emissiveIntensity = opts.emissiveIntensity ?? 1;
    }
    const alpha = opts.alpha ?? def.alpha;
    if (alpha !== undefined && alpha < 1) {
      m.alpha = alpha;
      m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      m.backFaceCulling = false;
    }
  }
  if (opts.backFaceCulling !== undefined) { m.backFaceCulling = opts.backFaceCulling; if (!opts.backFaceCulling) m.twoSidedLighting = true; }
  if (opts.wind) { m.aetherWind = new WindPlugin(m); m.backFaceCulling = false; m.twoSidedLighting = true; }
  const animated = opts.wind || def.animated;
  if (!animated) m.freeze();
  c.mat.set(cacheKey, m);
  return m;
}

function linearArrToHex(arr) { return '#' + arr.map((v) => Math.round(Math.min(1, v) * 255).toString(16).padStart(2, '0')).join(''); }

/** Advance animated materials (flowing water/lava texture scroll, banner wind). */
export function tickMaterials(scene, dt) {
  WIND.time += dt;
  const c = SCENE_CACHE.get(scene);
  if (!c) return;
  for (const a of c.anim) {
    for (const t of a.tex) { t.uOffset = (t.uOffset + a.du * dt) % 1; t.vOffset = (t.vOffset + a.dv * dt) % 1; }
  }
}

export function materialStats(scene) {
  const c = SCENE_CACHE.get(scene);
  return c ? { materials: c.mat.size, textureSets: c.tex.size, mainMs: Math.round(c.bakeMs), workerMs: Math.round(STATS.workerMs), baked: STATS.done, queued: STATS.queued } : null;
}

export { linearToSrgb };
