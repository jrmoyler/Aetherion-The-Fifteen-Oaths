// Shared atmosphere state: single-scattering sky model (JS twin of the sky shader), aerial
// perspective / height fog uniforms and a global material plugin that applies the same fog to
// every Standard/PBR material created after render init (terrain, architecture, actors, props).
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { RegisterMaterialPlugin } from '@babylonjs/core/Materials/materialPluginManager.js';

/** Live atmosphere state, written by render each frame, read by shaders of render/world. */
export const atmo = {
  sunDir: new Vector3(0.3, 0.5, -0.8).normalize(), // direction TOWARD the sun
  moonDir: new Vector3(-0.3, 0.4, 0.8).normalize(),
  lightDir: new Vector3(0.3, 0.5, -0.8).normalize(), // dominant light (sun by day, moon by night)
  sunColor: new Color3(1, 0.9, 0.8), // transmitted sun radiance at the ground (scaled)
  fogColor: new Color3(0.6, 0.65, 0.72), // in-scatter colour looking away from the sun
  fogSunColor: new Color3(0.9, 0.8, 0.6), // in-scatter colour looking toward the sun
  fogDensity: 0.00032, // extinction per metre at fogBase
  fogFalloff: 0.0042, // exponential height falloff (1/m)
  fogBase: 0,
  fogMax: 0.97,
  camPos: new Vector3(),
  time: 0,
  wetness: 0, // 0..1, rain darkening / gloss on terrain
  snowCover: 0, // 0..1, extra snow from weather
  flash: 0, // lightning flash 0..1
  night: 0, // 0 day .. 1 full night
};

// ---------------------------------------------------------------------------------------------
// Physically based single scattering (Rayleigh + Mie), Nishita-style with few samples.
// Used in JS for sun colour, fog colours and SH ambient; the same code lives in the sky shader.
const RE = 6360e3, RA = 6420e3, HR = 7994, HM = 1200;
const BR = [5.802e-6, 13.558e-6, 33.1e-6], BM = 3.996e-6 * 1.11, MIE_EXT = 1.11;
export const SKY_CONST = { RE, RA, HR, HM, BR, BM, MIE_EXT };

function raySphere(oy, dx, dy, dz, r) { // origin (0, oy, 0)
  const b = oy * dy; const c = oy * oy - r * r; const d = b * b - c;
  if (d < 0) return -1;
  return -b + Math.sqrt(d);
}

/** Transmittance from altitude h (m) toward direction with y component `mu` → [r,g,b]. */
export function transmittance(h, mu, out = [0, 0, 0]) {
  const oy = RE + h; const dx = Math.sqrt(Math.max(0, 1 - mu * mu));
  const t = raySphere(oy, dx, mu, 0, RA);
  // planet occlusion
  const b = oy * mu, disc = b * b - (oy * oy - RE * RE);
  if (disc > 0 && -b - Math.sqrt(disc) > 0) { out[0] = out[1] = out[2] = 0; return out; }
  const N = 12, ds = t / N; let odR = 0, odM = 0;
  for (let i = 0; i < N; i++) {
    const s = (i + 0.5) * ds; const px = dx * s, py = oy + mu * s;
    const hh = Math.sqrt(px * px + py * py) - RE;
    odR += Math.exp(-hh / HR) * ds; odM += Math.exp(-hh / HM) * ds;
  }
  for (let c = 0; c < 3; c++) out[c] = Math.exp(-(BR[c] * odR + BM * MIE_EXT * odM));
  return out;
}

const _tr = [0, 0, 0];
/**
 * Sky radiance for view direction d (unit, y up) with sun direction s, viewer altitude h.
 * Returns [r,g,b] (relative units; multiply by sun intensity).
 */
export function skyRadiance(d, s, h = 200, out = [0, 0, 0], haze = 1) {
  const dy = Math.max(d[1], 0.0), dl = Math.hypot(d[0], dy, d[2]) || 1;
  const vx = d[0] / dl, vy = dy / dl, vz = d[2] / dl;
  const oy = RE + h; const tmax = raySphere(oy, 0, vy, 0, RA);
  const N = 10, ds = tmax / N;
  let rR = 0, rG = 0, rB = 0, mR = 0, mG = 0, mB = 0, odR = 0, odM = 0;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * ds; const px = vx * t, py = oy + vy * t, pz = vz * t;
    const r = Math.sqrt(px * px + py * py + pz * pz); const hh = r - RE;
    const dR = Math.exp(-hh / HR) * ds, dM = Math.exp(-hh / HM) * ds * haze;
    odR += dR * 0.5; odM += dM * 0.5;
    const mus = (px * s[0] + py * s[1] + pz * s[2]) / r;
    transmittance(hh, Math.max(-1, Math.min(1, mus)), _tr);
    const aR = Math.exp(-(BR[0] * odR + BM * MIE_EXT * odM)) * _tr[0];
    const aG = Math.exp(-(BR[1] * odR + BM * MIE_EXT * odM)) * _tr[1];
    const aB = Math.exp(-(BR[2] * odR + BM * MIE_EXT * odM)) * _tr[2];
    rR += aR * dR; rG += aG * dR; rB += aB * dR; mR += aR * dM; mG += aG * dM; mB += aB * dM;
    odR += dR * 0.5; odM += dM * 0.5;
  }
  const mu = vx * s[0] + vy * s[1] + vz * s[2];
  const pR = 3 / (16 * Math.PI) * (1 + mu * mu);
  const g = 0.76; const pM = 3 / (8 * Math.PI) * ((1 - g * g) * (1 + mu * mu)) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
  out[0] = rR * BR[0] * pR + mR * BM * pM;
  out[1] = rG * BR[1] * pR + mG * BM * pM;
  out[2] = rB * BR[2] * pR + mB * BM * pM;
  return out;
}

// ---------------------------------------------------------------------------------------------
// GLSL shared by custom shaders (sky, water, grass…) and the global aerial-perspective plugin.
export const AERIAL_GLSL = /* glsl */`
uniform vec4 aeFogA; // rgb: in-scatter colour away from sun, a: density
uniform vec4 aeFogB; // rgb: in-scatter colour toward sun, a: height falloff
uniform vec4 aeFogC; // xyz: sun direction, w: fog base height
uniform vec4 aeFogD; // xyz: camera position, w: max opacity
float aeFogAmount(vec3 wp, out vec3 fogCol) {
  vec3 rd = wp - aeFogD.xyz; float dist = length(rd); rd /= max(dist, 1e-3);
  float b = aeFogB.w; float h0 = aeFogD.y - aeFogC.w;
  float k = b * rd.y;
  float integ = aeFogA.w * exp(-b * h0) * (abs(k) > 1e-5 ? (1.0 - exp(-k * dist)) / k : dist);
  float s = max(dot(rd, aeFogC.xyz), 0.0);
  fogCol = mix(aeFogA.rgb, aeFogB.rgb, s * s * s * s * s * s);
  return min(1.0 - exp(-max(integ, 0.0)), aeFogD.w);
}
vec3 aeApply(vec3 col, vec3 wp) { vec3 fc; float f = aeFogAmount(wp, fc); return mix(col, fc, f); }
`;

/** Bind aerial perspective uniforms on an effect. */
export function bindAerial(effect) {
  const a = atmo;
  effect.setFloat4('aeFogA', a.fogColor.r, a.fogColor.g, a.fogColor.b, a.fogDensity);
  effect.setFloat4('aeFogB', a.fogSunColor.r, a.fogSunColor.g, a.fogSunColor.b, a.fogFalloff);
  effect.setFloat4('aeFogC', a.sunDir.x, a.sunDir.y, a.sunDir.z, a.fogBase);
  effect.setFloat4('aeFogD', a.camPos.x, a.camPos.y, a.camPos.z, a.fogMax);
}
export const AERIAL_UNIFORMS = ['aeFogA', 'aeFogB', 'aeFogC', 'aeFogD'];

const SUPPORTED = new Set(['PBRMaterial', 'StandardMaterial', 'PBRMetallicRoughnessMaterial', 'PBRSpecularGlossinessMaterial']);

/** Aerial perspective plugin: replaces linear fog with height fog + sky-tinted in-scatter. */
export class AerialPerspectivePlugin extends MaterialPluginBase {
  constructor(material) {
    super(material, 'AerialPerspective', 300, { AERIAL: false });
    this._enabled = true;
    this.registerForExtraEvents = true; this._enable(true);
  }
  get enabled() { return this._enabled; }
  set enabled(v) { if (v === this._enabled) return; this._enabled = v; this.markAllDefinesAsDirty(); }
  prepareDefines(defines) { defines.AERIAL = this._enabled; }
  getClassName() { return 'AerialPerspectivePlugin'; }
  getUniforms() { return { externalUniforms: AERIAL_UNIFORMS }; }
  hardBindForSubMesh(_ubo, _scene, _engine, subMesh) { const e = subMesh.effect; if (e && this._enabled) bindAerial(e); }
  isCompatible(lang) { return lang === 0; }
  getCustomCode(shaderType) {
    if (shaderType !== 'fragment') return null;
    const isPBR = this._material.getClassName().startsWith('PBR');
    const col = isPBR ? 'finalColor' : 'color';
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef AERIAL\n${AERIAL_GLSL}\n#endif\n`,
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `#ifdef AERIAL\n${col}.rgb = aeApply(${col}.rgb, vPositionW);\n#endif\n`,
    };
  }
}

let registered = false;
/** Attach the aerial-perspective plugin to every supported material created from now on. */
export function registerAerialPlugin() {
  if (registered) return; registered = true;
  RegisterMaterialPlugin('AerialPerspective', (material) => {
    try {
      if (!SUPPORTED.has(material.getClassName())) return null;
      if (material.metadata?.noAerial) return null;
      return new AerialPerspectivePlugin(material);
    } catch (e) { console.warn('[render] aerial plugin failed', e); return null; }
  });
}
