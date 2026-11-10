import { AdditiveBlending, Color, DoubleSide, FrontSide, MeshStandardMaterial, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { PETAL_BANDS } from './geometry.js';
import config from './config.js';

/**
 * Impact Dividend — materials.
 *
 *  - **forged bronze** (`createPetalMaterial`) — the petals are matter: a
 *    `MeshStandardMaterial` (lit by the sun, shadowing, on the world layer)
 *    patched with hammered grain in colour and roughness, **lamella seams**
 *    that glow along each band's lip, a ledger rule (bands light from the
 *    root up, one per compound beat — the balance is legible on the metal),
 *    a hot heaved root, and the core's light on the inner faces.
 *  - **the core** (`createCoreMaterial`) — the banked impulse as a forged
 *    knot: opaque, sun-shaded deep body, displaced into a lumpy knot in the
 *    vertex stage and squashed on every beat; crawling pressure cracks glow
 *    through the four-stop ramp; fresnel rim; noise dissolve.
 *  - **the crater** (`createCraterMaterial`) — the pressed floor: a dark
 *    disc stepped into pressure terraces with radial grooves and hot cracks;
 *    deposit pulses run *inward* on every beat; it cools after the payout and
 *    dissolves on the exit. Normal-blended, so it darkens the floor (the
 *    deep stop that grounds the cast).
 *  - **the ledger ring** (`createRingMaterial`) — one floor ring whose radius
 *    the cast drives out, back in (the blocked blow being banked), in on
 *    every beat and out at the payout; broken by noise, chevroned by angle.
 *  - **the lens** (`createLensMaterial`) — `LAYER.DISTORTION` proxy: inward
 *    pull while banking, a pressure ring at the payout.
 *
 * Every material reads `settings.impactDividend` in `userData.sync(state)`.
 */

const ID = config.id;

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function rampUniforms(c) {
  return {
    uCore: { value: new Color(c.coreColor) },
    uTint: { value: new Color(c.tintColor) },
    uBody: { value: new Color(c.bodyColor) },
    uDeep: { value: new Color(c.deepColor) },
  };
}
function syncRamp(u, c) {
  u.uCore.value.copy(getColor(c.coreColor));
  u.uTint.value.copy(getColor(c.tintColor));
  u.uBody.value.copy(getColor(c.bodyColor));
  u.uDeep.value.copy(getColor(c.deepColor));
}

/* -------------------------------------------------------------------- */
/* Forged bronze (petals)                                               */
/* -------------------------------------------------------------------- */

const PETAL_COMMON = /* glsl */ `
  uniform float uHeat;      // 0..1 overall heat in the metal
  uniform float uLit;       // lamella bands lit (0..BANDS)
  uniform float uInner;     // core light on the inner faces
  uniform float uSeamGlow;
  uniform float uGrain;
  uniform float uPulse;     // 0..1 beat flash
  uniform float uFade;
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  varying vec2 vPetal;
  varying float vInner;
  varying vec3 vGrainP;
  float idHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float idNoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float n000 = idHash(i), n100 = idHash(i + vec3(1,0,0)), n010 = idHash(i + vec3(0,1,0)), n110 = idHash(i + vec3(1,1,0));
    float n001 = idHash(i + vec3(0,0,1)), n101 = idHash(i + vec3(1,0,1)), n011 = idHash(i + vec3(0,1,1)), n111 = idHash(i + vec3(1,1,1));
    return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
  }
  float idGrain(vec3 p) { return idNoise(p * 9.0) * 0.6 + idNoise(p * 23.0) * 0.4; }
`;

/** Lit, shadowing forged bronze with glowing lamella seams. Instanced. */
export function createPetalMaterial() {
  const c = settings[ID] ?? config.settings;
  const material = new MeshStandardMaterial({
    color: new Color(c.bronzeColor),
    metalness: c.bronzeMetalness,
    roughness: c.bronzeRoughness,
    side: FrontSide,
  });
  const uniforms = {
    uHeat: { value: 0 },
    uLit: { value: 0 },
    uInner: { value: 0 },
    uSeamGlow: { value: 3 },
    uGrain: { value: 0.6 },
    uPulse: { value: 0 },
    uFade: { value: 1 },
    ...rampUniforms(c),
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aInner;
        varying vec2 vPetal;
        varying float vInner;
        varying vec3 vGrainP;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPetal = uv;
        vInner = aInner;
        vGrainP = position * vec3(1.0, 3.0, 1.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${PETAL_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grain = idGrain(vGrainP);
        diffuseColor.rgb *= mix(1.0, 0.7 + 0.6 * grain, uGrain);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.65 + 0.7 * grain, uGrain), 0.04, 1.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float s = vPetal.y;
          float a = vPetal.x * 2.0 - 1.0;
          float bands = ${PETAL_BANDS.toFixed(1)};
          float f = fract(s * bands);
          float band = floor(s * bands);
          // The lip of every lamella; brighter on bands the ledger has lit.
          float lip = smoothstep(0.86, 0.985, f) * (1.0 - smoothstep(0.985, 1.0, f));
          float litBand = clamp(uLit - band, 0.0, 1.0);
          float seam = lip * (0.12 + 0.88 * litBand) * (1.0 - vInner);
          // The spine ridge carries a thin hot line once a band is lit.
          seam += exp(-pow(a / 0.05, 2.0)) * litBand * 0.35 * (1.0 - vInner);
          // Heaved root still glowing from the floor.
          float root = exp(-s * 7.0) * uHeat;
          // Core light pooling on the inner faces, strongest mid-height.
          float inner = vInner * uInner * (0.35 + 0.65 * sin(3.14159 * clamp(s * 1.1, 0.0, 1.0)));
          float t = clamp(seam * (0.6 + 0.4 * uHeat) + uPulse * lip * 0.6, 0.0, 1.0);
          vec3 ramp = t > 0.66 ? mix(uTint, uCore, (t - 0.66) / 0.34) : t > 0.33 ? mix(uBody, uTint, (t - 0.33) / 0.33) : mix(uDeep, uBody, t / 0.33);
          totalEmissiveRadiance += ramp * seam * uSeamGlow * (0.5 + uHeat + uPulse);
          totalEmissiveRadiance += mix(uDeep, uBody, 0.7) * root * 1.6;
          totalEmissiveRadiance += mix(uBody, uTint, 0.5) * inner;
          totalEmissiveRadiance *= uFade;
        }`);
  };
  material.customProgramCacheKey = () => 'impact-dividend-petal';
  /** @param {object} s { heat, lit, inner, pulse, fade } */
  material.userData.sync = (s) => {
    const cfg = settings[ID];
    const g = settings.global;
    material.color.copy(getColor(cfg.bronzeColor));
    material.metalness = cfg.bronzeMetalness;
    material.roughness = cfg.bronzeRoughness;
    uniforms.uHeat.value = s.heat;
    uniforms.uLit.value = s.lit;
    uniforms.uInner.value = s.inner * cfg.innerGlow * g.glow;
    uniforms.uSeamGlow.value = cfg.seamGlow * g.glow * g.shaderIntensity;
    uniforms.uGrain.value = cfg.hammerGrain * g.noiseStrength;
    uniforms.uPulse.value = s.pulse;
    uniforms.uFade.value = s.fade;
    syncRamp(uniforms, cfg);
  };
  material.userData.uniforms = uniforms;
  return material;
}

/* -------------------------------------------------------------------- */
/* The core                                                             */
/* -------------------------------------------------------------------- */

const CORE_VERTEX = /* glsl */ `
  uniform float uClock;
  uniform float uKnot;
  uniform float uSquash;
  varying vec3 vObj;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  void main() {
    vec3 p = position;
    float lump = snoise(p * 1.7 + vec3(0.0, uClock * 0.25, 0.0)) * 0.6 + snoise(p * 3.9 - uClock * 0.15) * 0.25;
    p *= 1.0 + lump * 0.2 * uKnot;
    p.y *= uSquash;
    p.xz *= 1.0 + (1.0 - uSquash) * 0.6;
    vObj = position;
    vec4 world = modelMatrix * vec4(p, 1.0);
    // Shading normal: the sphere's, tilted by the lump gradient's proxy.
    vNormalW = normalize(mat3(modelMatrix) * normalize(position + position * lump * 0.35 * uKnot));
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uHeat;
  uniform float uGlow;
  uniform float uFresnel;
  uniform float uCrack;
  uniform float uChurn;
  uniform float uDissolve;
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  uniform vec3 uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec3 vObj;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec3 q = vObj * uCrack + vec3(0.0, uClock * uChurn, 0.0);
    float n1 = abs(snoise(q));
    float n2 = abs(snoise(q * 2.3 + 4.1));
    float crack = (1.0 - smoothstep(0.0, 0.045, n1)) + (1.0 - smoothstep(0.0, 0.03, n2)) * 0.5;
    vec2 dm = dissolveMask(snoise01(vObj * 3.0 + 1.7), uDissolve, 0.08);
    if (dm.x < 0.5 && uDissolve > 0.0) discard;
    vec3 N = normalize(vNormalW);
    float lambert = max(dot(N, normalize(uLightDir)), 0.0);
    float rim = fresnelTerm(vViewDir, N, 2.5, uFresnel);
    vec3 col = uDeep * (0.25 + 0.9 * lambert) + uBody * 0.08;
    float heat = clamp(crack * uHeat * uShaderIntensity, 0.0, 1.0);
    col += gradient4(uDeep, uBody, uTint, uCore, heat) * heat * uGlow * uGlobalGlow;
    col += mix(uBody, uTint, uHeat) * rim * (0.25 + 0.6 * uHeat) * uGlobalGlow;
    col += uCore * pow(uHeat, 4.0) * 0.2 * uGlobalGlow;
    col += uCore * dm.y * 2.0;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The banked impulse: an opaque forged knot with crawling hot cracks. */
export function createCoreMaterial() {
  const c = settings[ID] ?? config.settings;
  const material = new ShaderMaterial({
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uKnot: { value: 1 },
      uSquash: { value: 1 },
      uHeat: { value: 0.5 },
      uGlow: { value: 2 },
      uFresnel: { value: 1.5 },
      uCrack: { value: 3 },
      uChurn: { value: 1 },
      uDissolve: { value: 0 },
      ...rampUniforms(c),
    }),
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT,
  });
  /** @param {object} s { clock, heat, squash, dissolve } */
  material.userData.sync = (s) => {
    const cfg = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uHeat.value = s.heat;
    u.uSquash.value = s.squash;
    u.uDissolve.value = s.dissolve;
    u.uKnot.value = g.noiseStrength;
    u.uGlow.value = cfg.coreGlow * g.glow;
    u.uFresnel.value = cfg.coreFresnel * g.fresnel;
    u.uCrack.value = cfg.coreCrackScale * g.noiseFrequency;
    u.uChurn.value = cfg.coreChurn * g.noiseSpeed;
    syncRamp(u, cfg);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The crater                                                           */
/* -------------------------------------------------------------------- */

const CRATER_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uEnergy;     // 0..1 how hot the bank is
  uniform float uBeat;       // 0..1 through the latest deposit pulse, −1 none
  uniform float uPayout;     // 0..1 through the payout blast, −1 before
  uniform float uCool;       // 0..1 cooling after the payout
  uniform float uDissolve;
  uniform float uFade;
  uniform float uGlow;
  uniform float uDark;
  uniform float uTerraces;
  uniform float uCracks;
  uniform float uScale;
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float warp = (fbm3(vec3(p * 2.2 * uScale, 3.1)) - 0.5) * 0.12;
    float tr = (r + warp) * uTerraces;
    float lip = smoothstep(0.8, 0.97, fract(tr)) * (1.0 - smoothstep(0.97, 1.0, fract(tr)));
    float grooves = pow(abs(sin(a * 14.0 + warp * 9.0)), 10.0) * smoothstep(0.15, 0.6, r);
    float n = snoise(vec3(p * 2.6 * uScale, 1.7));
    float cracks = (1.0 - smoothstep(0.0, 0.05, abs(n))) * smoothstep(0.08, 0.3, r) * (1.0 - smoothstep(0.85, 1.0, r));
    float pulse = uBeat >= 0.0 ? exp(-abs(r - (1.0 - uBeat)) * 14.0) * (1.0 - uBeat * 0.6) : 0.0;
    float blast = uPayout >= 0.0 ? exp(-abs(r - uPayout) * 10.0) * (1.0 - uPayout) * 1.5 : 0.0;
    float heat = cracks * uCracks * (0.35 + 0.65 * uEnergy) * (1.0 - 0.55 * uCool)
      + lip * 0.22 * uEnergy + grooves * 0.12 * uEnergy + pulse * 0.9 + blast;
    heat *= uShaderIntensity;
    vec2 dm = dissolveMask(snoise01(vec3(p * 3.3, 7.0)), uDissolve, 0.06);
    float rim = 1.0 - smoothstep(0.82, 1.0, r);
    float dark = uDark * rim * (0.75 + 0.25 * lip);
    float t = clamp(heat * (1.0 - 0.4 * uCool), 0.0, 1.0);
    vec3 glow = gradient4(uDeep, uBody, uTint, uCore, t) * heat * uGlow * uGlobalGlow;
    glow += uBody * dm.y * 2.0;
    vec3 col = uDeep * 0.35 * (0.6 + 0.4 * lip) + glow;
    float alpha = clamp(max(dark, heat), 0.0, 1.0) * dm.x * uFade;
    gl_FragColor = vec4(col, alpha);
  }
`;

/** The pressed floor. Normal blending: it darkens before it glows. */
export function createCraterMaterial() {
  const c = settings[ID] ?? config.settings;
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uEnergy: { value: 0 },
      uBeat: { value: -1 },
      uPayout: { value: -1 },
      uCool: { value: 0 },
      uDissolve: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.5 },
      uDark: { value: 0.8 },
      uTerraces: { value: 5 },
      uCracks: { value: 1 },
      uScale: { value: 1 },
      ...rampUniforms(c),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: CRATER_FRAGMENT,
  });
  /** @param {object} s { clock, energy, beat, payout, cool, dissolve, fade } */
  material.userData.sync = (s) => {
    const cfg = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uEnergy.value = s.energy;
    u.uBeat.value = s.beat;
    u.uPayout.value = s.payout;
    u.uCool.value = s.cool;
    u.uDissolve.value = s.dissolve;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = cfg.craterGlow * g.glow;
    u.uDark.value = cfg.craterDark;
    u.uTerraces.value = cfg.craterTerraces;
    u.uCracks.value = cfg.craterCracks;
    u.uScale.value = g.noiseFrequency;
    syncRamp(u, cfg);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The ledger ring                                                      */
/* -------------------------------------------------------------------- */

const RING_FRAGMENT = /* glsl */ `
  uniform float uRadius;    // 0..1 of the quad
  uniform float uWidth;
  uniform float uPower;
  uniform float uInward;    // 1 when the ring runs inward (chevrons flip)
  uniform float uClock;
  uniform float uGlow;
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float d = (r - uRadius) / max(uWidth, 1e-3);
    // Leading edge hard, trailing edge feathered: behind the run direction.
    float behind = mix(d, -d, uInward);
    float band = behind > 0.0 ? exp(-behind * behind * 6.0) : exp(-behind * behind * 0.6);
    float chev = 0.65 + 0.35 * pow(abs(sin(a * 18.0 + behind * 1.5)), 3.0);
    float breakup = 0.55 + 0.45 * snoise(vec3(a * 5.0, r * 6.0, uClock * 2.0));
    float v = band * chev * breakup * uPower;
    if (v < 0.003) discard;
    float t = clamp(exp(-d * d * 4.0) * uPower, 0.0, 1.0);
    vec3 col = gradient4(uDeep, uBody, uTint, uCore, t);
    gl_FragColor = vec4(col * v * uGlow * uGlobalGlow, clamp(v, 0.0, 1.0));
  }
`;

/** The floor ring that carries the blow out, back in and out again. Additive. */
export function createRingMaterial() {
  const c = settings[ID] ?? config.settings;
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRadius: { value: 0 },
      uWidth: { value: 0.05 },
      uPower: { value: 0 },
      uInward: { value: 0 },
      uClock: { value: 0 },
      uGlow: { value: 2 },
      ...rampUniforms(c),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: RING_FRAGMENT,
  });
  /** @param {object} s { radius, width, power, inward, clock } */
  material.userData.sync = (s) => {
    const cfg = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = s.radius;
    u.uWidth.value = s.width;
    u.uPower.value = s.power * g.opacity;
    u.uInward.value = s.inward;
    u.uClock.value = s.clock;
    u.uGlow.value = cfg.ringGlow * g.glow;
    syncRamp(u, cfg);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens                                                             */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uPull;
  uniform float uShock;
  uniform float uWave;
  uniform float uClock;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    vec2 radial = q / max(r, 1e-3);
    float body = smoothstep(0.05, 0.4, r) * (1.0 - smoothstep(0.5, 1.0, r));
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    vec3 np = vec3(q * 2.5 * uScale, uClock * 0.5);
    vec2 n = vec2(snoise(np), snoise(np + vec3(5.2, 1.3, 7.7))) * 0.25;
    vec2 dir = (-radial + n) * body * uPull + (radial + n) * ring * uShock;
    float mask = 1.0 - smoothstep(0.88, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uPull + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** `LAYER.DISTORTION` disc — inward pull while banking, ring at the payout. */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uPull: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { pull, shock, wave, clock } */
  material.userData.sync = (s) => {
    const cfg = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPull.value = s.pull * cfg.lensPull * g.distortion;
    u.uShock.value = s.shock * cfg.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
