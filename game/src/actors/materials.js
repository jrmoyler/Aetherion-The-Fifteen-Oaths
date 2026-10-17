// Shared actor materials. Colour comes from vertex colours (palette baked per character),
// so every character in the world shares the same handful of PBR materials — crowds cost
// one draw call per material channel. Surface detail comes from procedural normal maps.
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { noise3 } from './geom.js';

const cache = new WeakMap();

function normalMap(scene, size, heightFn, strength) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = heightFn(x / size, y / size);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
    const hy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
    let nx = -hx * strength, ny = -hy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4;
    data[i] = (nx * 0.5 + 0.5) * 255; data[i + 1] = (ny * 0.5 + 0.5) * 255; data[i + 2] = (nz * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 4;
  return t;
}

// periodic noise helper (tileable on [0,1)^2)
const pn = (u, v, f, seed = 0) => {
  const a = u * Math.PI * 2, b = v * Math.PI * 2;
  return noise3(Math.cos(a) * f / 6.283 + seed, Math.sin(a) * f / 6.283 + Math.cos(b) * f / 6.283, Math.sin(b) * f / 6.283 - seed);
};

const HEIGHTS = {
  weave: (u, v) => {
    const N = 96;
    const wu = u * N, wv = v * N;
    const cu = Math.floor(wu), cv = Math.floor(wv);
    const over = ((cu + cv) & 1) === 0; // plain weave
    const fu = wu - cu, fv = wv - cv;
    const thread = over ? Math.sin(fv * Math.PI) * 0.6 + Math.sin(fu * Math.PI) * 0.4 : Math.sin(fu * Math.PI) * 0.6 + Math.sin(fv * Math.PI) * 0.4;
    return thread * 0.6 + pn(u, v, 24) * 0.25 + pn(u, v, 5, 3) * 0.35;
  },
  leather: (u, v) => {
    const g = Math.abs(pn(u, v, 40)) * 0.6 + Math.abs(pn(u, v, 90, 2)) * 0.3;
    return -g + pn(u, v, 6, 7) * 0.5;
  },
  metal: (u, v) => {
    let s = pn(u * 0.05, v, 160) * 0.12 + pn(u, v, 7, 4) * 0.25;
    // scratches
    for (let k = 0; k < 6; k++) {
      const off = (k * 0.173) % 1, ang = k * 1.7;
      const d = Math.abs(((u * Math.cos(ang) + v * Math.sin(ang) + off) % 0.25) - 0.125);
      if (d < 0.003) s -= 0.4;
    }
    return s;
  },
  skin: (u, v) => pn(u, v, 120) * 0.15 + pn(u, v, 12, 9) * 0.2,
  hair: (u, v) => pn(u * 0.04, v, 220) * 0.5 + pn(u * 0.1, v, 60, 3) * 0.3,
};

export function getActorMaterials(scene) {
  let m = cache.get(scene);
  if (m) return m;
  const q = scene.metadata?.quality ?? 'high';
  const size = q === 'low' ? 128 : 256;
  const maps = {
    weave: normalMap(scene, size, HEIGHTS.weave, 3.2),
    leather: normalMap(scene, size, HEIGHTS.leather, 2.4),
    metal: normalMap(scene, size, HEIGHTS.metal, 2.0),
    skin: normalMap(scene, 128, HEIGHTS.skin, 1.2),
    hair: normalMap(scene, 128, HEIGHTS.hair, 3.0),
  };
  const mk = (name, o) => {
    const mat = new PBRMaterial(`actor.${name}`, scene);
    mat.albedoColor = Color3.White();
    mat.metallic = o.metal ?? 0;
    mat.roughness = o.rough ?? 0.8;
    if (o.bump) { mat.bumpTexture = o.bump; mat.bumpTexture.level = o.bumpLevel ?? 0.8; }
    mat.environmentIntensity = o.env ?? 0.9;
    mat.directIntensity = 1;
    if (o.twoSided) { mat.backFaceCulling = false; mat.twoSidedLighting = true; }
    if (o.sheen && q !== 'low') { mat.sheen.isEnabled = true; mat.sheen.intensity = o.sheen; mat.sheen.color = new Color3(1, 1, 1); mat.sheen.roughness = 0.6; }
    if (o.clear && (q === 'high' || q === 'ultra')) { mat.clearCoat.isEnabled = true; mat.clearCoat.intensity = o.clear; mat.clearCoat.roughness = 0.25; }
    mat.maxSimultaneousLights = 4;
    return mat;
  };
  m = {
    cloth: mk('cloth', { rough: 0.93, bump: maps.weave, bumpLevel: 0.18, twoSided: true, sheen: 0.25, env: 0.7 }),
    leather: mk('leather', { rough: 0.62, bump: maps.leather, bumpLevel: 0.4, env: 0.8 }),
    metal: mk('metal', { metal: 0.92, rough: 0.36, bump: maps.metal, bumpLevel: 0.35, env: 1.0 }),
    enamel: mk('enamel', { rough: 0.32, bump: maps.skin, bumpLevel: 0.25, clear: 0.6, env: 0.9 }),
    skin: mk('skin', { rough: 0.52, bump: maps.skin, bumpLevel: 0.35, env: 0.6 }),
    hair: mk('hair', { rough: 0.5, bump: maps.hair, bumpLevel: 0.22, twoSided: true, env: 0.6 }),
  };
  const glow = new PBRMaterial('actor.glow', scene);
  glow.unlit = true; glow.albedoColor = Color3.White();
  m.glow = glow;
  const glass = new PBRMaterial('actor.glass', scene);
  glass.albedoColor = new Color3(1, 1, 1); glass.metallic = 0; glass.roughness = 0.06;
  glass.alpha = 0.42; glass.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  glass.environmentIntensity = 1.2; glass.backFaceCulling = true;
  m.glass = glass;
  m.maps = maps;
  // ensure fog etc. stays consistent with scene
  for (const mat of Object.values(m)) if (mat && mat.getClassName) mat.fogEnabled = true;
  cache.set(scene, m);
  return m;
}

export const ALPHA_BLEND = Constants.ALPHA_COMBINE;
