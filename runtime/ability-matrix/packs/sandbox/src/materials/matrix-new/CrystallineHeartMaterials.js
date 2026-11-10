import { AdditiveBlending, BackSide, Color, DoubleSide, FrontSide, MeshStandardMaterial, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Ripple slots the ring and shock shaders track at once: two per beat (the lub
 * and the dub), sixteen beats. The ability writes slot `2k` for beat k's lub
 * and `2k + 1` for its dub.
 */
export const HEART_MAX_RINGS = 32;

/**
 * Crystalline Heart — the four bespoke surfaces of the heart.
 *
 *  - `createHeartCrystalMaterial(back)` — the gem. Drawn twice, back faces
 *    first (`back = true`) and then front faces, so the far facets show
 *    through the near ones the way they do in a cut stone. A refractive look
 *    without a refraction pass: the stage's own sky (`frame.uEnvMap`) is
 *    sampled along the *refracted* view ray, once per channel at a slightly
 *    different index (the dispersion), tinted rose and darkened with depth;
 *    the reflected ray gives the fresnel sheen, the sun a hard highlight, the
 *    barycentrics the bright cut edges. Inside, the light: the refracted ray
 *    is traced through object space and its closest approach to the heart's
 *    centre lights it — so the core glow slides around inside the stone as it
 *    turns — and every beat punches it.
 *  - `createHeartRingMaterial` — the floor: a faint faceted sigil under the
 *    heart, and one ripple ring per beat running outward from it with a
 *    caustic sparkle in its wake. All beats in one quad, from a uniform array.
 *  - `createHeartShardMaterial` — the pieces it shatters into: the same rose
 *    crystal, cheaper — env reflection, rim, a hot edge — per-instance fade.
 *  - `createHeartShockMaterial` — LAYER.DISTORTION: one view-space disc
 *    carrying every beat's shockwave front at once.
 *
 * Every material reads `settings.crystallineheart` in `userData.sync(state)`.
 */

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* ==================================================================== */
/* The gem                                                               */
/* ==================================================================== */

const CRYSTAL_VERTEX = /* glsl */ `
  attribute vec3  aBary;
  attribute float aFacet;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vObj;
  varying vec3  vObjN;
  varying vec3  vObjCam;
  varying vec3  vBary;
  varying float vFacet;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vObj = position;
    vObjN = normal;
    // The camera in the heart's own space, for the inner-light trace. The
    // heart is scaled uniformly, so the inverse is safe and cheap enough for
    // a few hundred vertices.
    vObjCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    vBary = aBary;
    vFacet = aFacet;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CRYSTAL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uBack;          // 1 = drawing the far facets
  uniform float uIOR;
  uniform float uDispersion;
  uniform float uEnv;
  uniform float uFresnel;
  uniform float uFresnelPower;
  uniform float uTint;
  uniform float uFacetLines;
  uniform float uSpecular;
  uniform float uGloss;
  uniform float uInner;
  uniform float uInnerSize;
  uniform float uInnerNoise;
  uniform float uBeat;          // 0..1+ the current swell
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3  uColorCrystal;
  uniform vec3  uColorDeep;
  uniform vec3  uColorInner;
  uniform vec3  uColorFacet;
  uniform vec3  uColorSpec;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vObj;
  varying vec3  vObjN;
  varying vec3  vObjCam;
  varying vec3  vBary;
  varying float vFacet;

  ${noiseGLSL}
  ${ENV_GLSL}

  /** The core light seen along a ray through the stone. */
  float innerLight(vec3 P, vec3 Rd) {
    float tc = max(-dot(P, Rd), 0.0);
    vec3 closest = P + Rd * tc;
    float swim = snoise(closest * 3.0 + vec3(uSeed, uTime * 0.7, -uTime * 0.4)) * uInnerNoise * 0.15;
    float r = length(closest) + swim;
    float size = uInnerSize * 0.5 * (1.0 + uBeat * 0.35);
    return exp(-(r * r) / max(size * size, 1e-4));
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    // Facing the camera from whichever side is being drawn.
    if (uBack > 0.5) N = -N;
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, uFresnelPower) * uFresnel;

    /* --- refraction: the sky bent through the stone, split per channel --- */
    float eta = 1.0 / (1.0 + uIOR);
    float spread = uDispersion * uIOR;
    vec3 rr = refract(-V, N, eta * (1.0 - spread));
    vec3 rg = refract(-V, N, eta);
    vec3 rb = refract(-V, N, eta * (1.0 + spread));
    vec3 refr = vec3(
      texture2D(uEnvMap, equirectUv(normalize(rr + vec3(1e-5)))).r,
      texture2D(uEnvMap, equirectUv(normalize(rg + vec3(1e-5)))).g,
      texture2D(uEnvMap, equirectUv(normalize(rb + vec3(1e-5)))).b
    );
    // Through a lot of stone at grazing angles: deeper, redder.
    vec3 body = mix(vec3(1.0), uColorCrystal, uTint);
    vec3 through = refr * body * uEnv;
    through = mix(through, uColorDeep, (1.0 - ndv) * 0.6 + uBack * 0.3);

    /* --- reflection & highlight --- */
    vec3 refl = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uEnv;
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), uGloss) * uSpecular * (1.0 - uBack);
    // Facets catch the light unevenly, the way a cut stone glitters.
    float glint = smoothstep(0.82, 1.0, vFacet) * pow(clamp(dot(reflect(-V, N), L), 0.0, 1.0), 8.0) * 2.0;

    /* --- the cut edges --- */
    float edge = min(vBary.x, min(vBary.y, vBary.z));
    float w = fwidth(edge) * 1.4 + 1e-4;
    float line = 1.0 - smoothstep(0.0, w, edge);

    /* --- the light inside --- */
    vec3 Vo = normalize(vObj - vObjCam);
    vec3 No = normalize(vObjN) * (uBack > 0.5 ? -1.0 : 1.0);
    vec3 Ro = refract(Vo, No, eta);
    if (dot(Ro, Ro) < 1e-6) Ro = Vo;
    float core = innerLight(vObj, normalize(Ro)) * uInner * (1.0 + uBeat * 1.0);

    vec3 color = through * (1.0 - fres * 0.5)
               + refl * fres
               + uColorSpec * (spec + glint)
               + uColorFacet * line * uFacetLines * (0.5 + uBeat) * (1.0 - uBack * 0.5)
               + uColorInner * core;
    color *= mix(1.0, uShaderIntensity, 0.5);

    float alpha = clamp(mix(0.55, 1.0, clamp(fres, 0.0, 1.0)) + core * 0.3 + line * 0.3, 0.0, 1.0) * uOpacity;
    if (uBack > 0.5) alpha *= 0.7;
    gl_FragColor = vec4(color * uGlobalGlow, alpha);
  }
`;

/** @param {boolean} back draw the far facets (BackSide) */
export function createHeartCrystalMaterial(back = false) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: back ? BackSide : FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uBack: { value: back ? 1 : 0 },
      uIOR: { value: 0.55 },
      uDispersion: { value: 0.12 },
      uEnv: { value: 0.9 },
      uFresnel: { value: 1.6 },
      uFresnelPower: { value: 3 },
      uTint: { value: 0.75 },
      uFacetLines: { value: 1.2 },
      uSpecular: { value: 3 },
      uGloss: { value: 90 },
      uInner: { value: 1.6 },
      uInnerSize: { value: 0.45 },
      uInnerNoise: { value: 0.5 },
      uBeat: { value: 0 },
      uOpacity: { value: 0.92 },
      uSeed: { value: 0 },
      uColorCrystal: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorInner: { value: new Color() },
      uColorFacet: { value: new Color() },
      uColorSpec: { value: new Color() }
    }),
    vertexShader: CRYSTAL_VERTEX,
    fragmentShader: CRYSTAL_FRAGMENT
  });

  /** @param {object} state { beat, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.crystallineheart;
    const g = settings.global;
    const u = material.uniforms;
    u.uBeat.value = state.beat;
    u.uSeed.value = state.seed;
    u.uIOR.value = c.crystalIOR;
    u.uDispersion.value = c.crystalDispersion;
    u.uEnv.value = c.crystalEnv;
    u.uFresnel.value = c.crystalFresnel * g.fresnel;
    u.uFresnelPower.value = c.crystalFresnelPower;
    u.uTint.value = c.crystalTint;
    u.uFacetLines.value = c.crystalFacetLines * g.glow;
    u.uSpecular.value = c.crystalSpecular;
    u.uGloss.value = c.crystalGloss;
    u.uInner.value = (c.innerGlow + c.innerBeat * state.beat) * g.glow;
    u.uInnerSize.value = c.innerSize;
    u.uInnerNoise.value = c.innerNoise * g.noiseStrength;
    u.uOpacity.value = c.crystalOpacity * g.opacity * state.fade;
    u.uColorCrystal.value.copy(getColor(c.colorCrystal));
    u.uColorDeep.value.copy(getColor(c.colorCrystalDeep));
    u.uColorInner.value.copy(getColor(c.colorInner));
    u.uColorFacet.value.copy(getColor(c.colorFacet));
    u.uColorSpec.value.copy(getColor(c.colorSpec));
  };

  return material;
}

/* ==================================================================== */
/* The floor: sigil and ripple rings                                     */
/* ==================================================================== */

const RING_VERTEX = /* glsl */ `
  uniform float uQuadSize;
  varying vec2 vFlat;
  void main() {
    vFlat = (uv - 0.5) * uQuadSize;
    vFlat.y = -vFlat.y;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAGMENT = /* glsl */ `
  #define MAX_RINGS ${HEART_MAX_RINGS}
  #define TAU 6.28318530718

  uniform float uTime;
  uniform float uRingAge[MAX_RINGS];   // seconds since that beat; < 0 not yet
  uniform float uRingPower[MAX_RINGS]; // 1 for a lub, less for a dub, more for the shatter
  uniform float uSpeed;
  uniform float uReach;                // metres a ring dies at
  uniform float uWidth;
  uniform float uGlow;
  uniform float uCaustic;
  uniform float uOpacity;
  uniform float uSigil;                // 0..1 presence of the sigil
  uniform float uSigilRadius;
  uniform float uSigilGlow;
  uniform float uBeat;
  uniform float uFade;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorGlow;
  uniform vec3  uColorWake;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    float r = length(vFlat);
    float ang = atan(vFlat.y, vFlat.x);
    float rings = 0.0;
    float wake = 0.0;

    for (int i = 0; i < MAX_RINGS; i++) {
      float age = uRingAge[i];
      if (age < 0.0) continue;
      float front = age * uSpeed;
      if (front > uReach * 1.05) continue;
      float life = 1.0 - smoothstep(uReach * 0.55, uReach, front);
      // A faceted ring: the front wobbles in angular steps, like light
      // through a cut stone rather than a ripple in water.
      float facet = floor(ang / TAU * 14.0 + float(i) * 3.7);
      float jag = (hash11(facet + float(i) * 11.0 + uSeed) - 0.5) * uWidth * 0.8;
      float d = r - front + jag;
      float band = exp(-(d * d) / max(uWidth * uWidth * 0.25, 1e-4));
      rings += band * life * uRingPower[i];
      // Caustic sparkle in the wake, inside the front.
      float inside = smoothstep(0.0, uWidth * 4.0, -d) * (1.0 - smoothstep(uWidth * 4.0, uWidth * 14.0, -d));
      wake += inside * life * uRingPower[i];
    }

    float caustic = 0.0;
    if (wake > 0.001) {
      vec2 v = voronoi2(vFlat * 3.2 + uSeed);
      caustic = pow(1.0 - clamp(v.x * 2.2, 0.0, 1.0), 6.0) * (0.5 + 0.5 * sin(uTime * 9.0 + v.y * 40.0));
    }

    /* the sigil under the heart: a faceted star of light */
    float sig = 0.0;
    if (uSigil > 0.001) {
      float k = 7.0;
      float a = mod(ang + uTime * 0.2, TAU / k) - TAU / k * 0.5;
      float star = r * cos(a) - uSigilRadius * 0.55;
      float outline = exp(-abs(star) / 0.02) + exp(-abs(r - uSigilRadius) / 0.025);
      float fill = (1.0 - smoothstep(0.0, uSigilRadius, r)) * 0.15;
      sig = (outline + fill) * uSigil * uSigilGlow * (1.0 + uBeat * 1.5);
    }

    float energy = (rings + wake * caustic * uCaustic + sig) * uFade;
    if (energy < 0.003) discard;
    vec3 color = uColorWake * wake * caustic * uCaustic + uColorGlow * (rings + sig) + uColorCore * rings * rings * 0.5;
    color /= max(energy / max(uFade, 1e-3), 1e-3);
    gl_FragColor = vec4(color * energy * uGlow * uGlobalGlow, clamp(energy, 0.0, 1.0) * uOpacity);
  }
`;

export function createHeartRingMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 14 },
      uRingAge: { value: new Float32Array(HEART_MAX_RINGS).fill(-1) },
      uRingPower: { value: new Float32Array(HEART_MAX_RINGS).fill(1) },
      uSpeed: { value: 6 },
      uReach: { value: 6 },
      uWidth: { value: 0.22 },
      uGlow: { value: 2.4 },
      uCaustic: { value: 0.6 },
      uOpacity: { value: 0.9 },
      uSigil: { value: 0 },
      uSigilRadius: { value: 1 },
      uSigilGlow: { value: 0.6 },
      uBeat: { value: 0 },
      uFade: { value: 1 },
      uSeed: { value: 0 },
      uColorCore: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorWake: { value: new Color() }
    }),
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT
  });

  /**
   * @param {object} state { quadSize, reach, ages (Float32Array), powers, sigil, sigilRadius, beat, fade, seed }
   *   The two arrays are copied, never kept.
   */
  material.userData.sync = (state) => {
    const c = settings.crystallineheart;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize;
    u.uReach.value = state.reach;
    u.uRingAge.value.set(state.ages);
    u.uRingPower.value.set(state.powers);
    u.uSigil.value = state.sigil;
    u.uSigilRadius.value = state.sigilRadius;
    u.uBeat.value = state.beat;
    u.uFade.value = state.fade;
    u.uSeed.value = state.seed;
    u.uSpeed.value = c.ringSpeed * g.speed;
    u.uWidth.value = c.ringWidth;
    u.uGlow.value = c.ringGlow * g.glow;
    u.uCaustic.value = c.ringCaustic * g.shaderIntensity;
    u.uOpacity.value = c.ringOpacity * g.opacity;
    u.uSigilGlow.value = c.sigilGlow;
    u.uColorCore.value.copy(getColor(c.colorRingCore));
    u.uColorGlow.value.copy(getColor(c.colorRingGlow));
    u.uColorWake.value.copy(getColor(c.colorRingWake));
  };

  return material;
}

/* ==================================================================== */
/* The shards                                                            */
/* ==================================================================== */

const SHARD_VERTEX = /* glsl */ `
  attribute float aFade;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vObj;
  varying float vFade;

  void main() {
    mat4 inst = mat4(1.0);
    #ifdef USE_INSTANCING
      inst = instanceMatrix;
    #endif
    vec4 world = modelMatrix * inst * vec4(position, 1.0);
    mat3 m = mat3(modelMatrix) * mat3(inst);
    vNormalW = normalize(transpose(inverse(m)) * normal);
    vWorld = world.xyz;
    vObj = position;
    vFade = aFade;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHARD_FRAGMENT = /* glsl */ `
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uEnv;
  uniform float uFresnel;
  uniform float uGlow;
  uniform float uOpacity;
  uniform vec3  uColorCrystal;
  uniform vec3  uColorDeep;
  uniform vec3  uColorInner;
  uniform vec3  uColorSpec;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vObj;
  varying float vFade;

  ${ENV_GLSL}

  void main() {
    if (vFade < 0.003) discard;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 2.5) * uFresnel;
    vec3 refl = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uEnv;
    vec3 refr = texture2D(uEnvMap, equirectUv(normalize(refract(-V, N, 0.66) + vec3(1e-5)))).rgb * uEnv;
    float spec = pow(clamp(dot(reflect(-normalize(uLightDir), N), -V), 0.0, 1.0), 40.0) * 2.5;
    // The inner light the heart held, cooling as the shard flies.
    float hot = vFade * vFade * smoothstep(0.2, 1.0, vObj.y);
    vec3 color = mix(uColorDeep, uColorCrystal * refr * 1.5, ndv)
               + refl * fres
               + uColorSpec * spec
               + uColorInner * hot * 1.5;
    float alpha = clamp(0.6 + fres * 0.5 + hot * 0.3, 0.0, 1.0) * uOpacity * vFade;
    gl_FragColor = vec4(color * uGlow * uGlobalGlow, alpha);
  }
`;

export function createHeartShardMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uEnv: { value: 0.9 },
      uFresnel: { value: 1.6 },
      uGlow: { value: 1 },
      uOpacity: { value: 0.92 },
      uColorCrystal: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorInner: { value: new Color() },
      uColorSpec: { value: new Color() }
    }),
    vertexShader: SHARD_VERTEX,
    fragmentShader: SHARD_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.crystallineheart;
    const g = settings.global;
    const u = material.uniforms;
    u.uEnv.value = c.crystalEnv;
    u.uFresnel.value = c.crystalFresnel * g.fresnel;
    u.uGlow.value = g.glow;
    u.uOpacity.value = c.crystalOpacity * g.opacity;
    u.uColorCrystal.value.copy(getColor(c.colorCrystal));
    u.uColorDeep.value.copy(getColor(c.colorCrystalDeep));
    u.uColorInner.value.copy(getColor(c.colorInner));
    u.uColorSpec.value.copy(getColor(c.colorSpec));
  };

  return material;
}

/* ==================================================================== */
/* Shockwaves (LAYER.DISTORTION)                                         */
/* ==================================================================== */

/**
 * A view-space disc, so `position.xy` is the screen direction from its centre.
 * Every beat's front at once: each is a ring at `age / uShockTime` across the
 * disc, pushing the frame outward and dying as it goes.
 */
const SHOCK_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy * 2.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize * 2.0;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHOCK_FRAGMENT = /* glsl */ `
  #define MAX_RINGS ${HEART_MAX_RINGS}

  uniform float uTime;
  uniform float uRingAge[MAX_RINGS];
  uniform float uRingPower[MAX_RINGS];
  uniform float uShockTime;
  uniform float uStrength;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    if (r > 1.0 || r < 1e-3) discard;
    float wob = snoise(vec3(vP * 3.0, uTime * 2.0 + uSeed)) * 0.03;
    float push = 0.0;
    for (int i = 0; i < MAX_RINGS; i++) {
      float age = uRingAge[i];
      if (age < 0.0) continue;
      float t = age / max(uShockTime, 1e-3);
      if (t >= 1.0) continue;
      float front = mix(0.05, 0.95, 1.0 - pow(1.0 - t, 3.0));
      float d = r - front + wob;
      push += exp(-(d * d) / 0.004) * (1.0 - t) * clamp(t * 10.0, 0.0, 1.0) * uRingPower[i];
    }
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = push * uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4((vP / r) * 0.5 + 0.5, strength, mask);
  }
`;

export function createHeartShockMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 3.5 },
      uRingAge: { value: new Float32Array(HEART_MAX_RINGS).fill(-1) },
      uRingPower: { value: new Float32Array(HEART_MAX_RINGS).fill(1) },
      uShockTime: { value: 0.45 },
      uStrength: { value: 0.9 },
      uSeed: { value: 0 }
    }),
    vertexShader: SHOCK_VERTEX,
    fragmentShader: SHOCK_FRAGMENT
  });

  /** @param {object} state { ages, powers, seed } — arrays are copied */
  material.userData.sync = (state) => {
    const c = settings.crystallineheart;
    const g = settings.global;
    const u = material.uniforms;
    u.uRingAge.value.set(state.ages);
    u.uRingPower.value.set(state.powers);
    u.uSeed.value = state.seed;
    u.uSize.value = c.shockSize * 0.5;
    u.uShockTime.value = c.shockTime;
    u.uStrength.value = c.shockStrength * g.distortion;
  };

  return material;
}

/* ==================================================================== */
/* The cage: crystal ribs that cradle the heart                         */
/* ==================================================================== */

/**
 * Rose quartz, lit by the scene sun: the ribs are solid stone, so they are a
 * flat-shaded `MeshStandardMaterial` on the world layer (the ability flags
 * them to cast and receive shadows). Body from the crystal colour pulled
 * toward the deep tone; the emissive is the heart's light, which the ability
 * pumps on every beat (`state.glow`).
 */
export function createHeartRibMaterial() {
  const material = new MeshStandardMaterial({
    color: 0xc04a80,
    emissive: 0xff7ab8,
    emissiveIntensity: 0.3,
    metalness: 0.15,
    roughness: 0.18,
    flatShading: true
  });
  /** @param {object} state { glow } */
  material.userData.sync = (state) => {
    const c = settings.crystallineheart;
    const g = settings.global;
    material.color.copy(getColor(c.colorRib));
    material.emissive.copy(getColor(c.colorRibGlow));
    material.emissiveIntensity = c.ribGlow * state.glow * g.glow;
    material.roughness = c.ribRoughness;
    material.metalness = c.ribMetalness;
  };
  return material;
}

/* ==================================================================== */
/* The floor: rose-quartz plates that grow with the beats                */
/* ==================================================================== */

/**
 * A filled crystal floor under the heart, normal-blended so the deep tone
 * darkens the ground: voronoi plates of rose quartz, each lit by a fake
 * facet slope (the cell's own gradient against a fixed sun), deep in the
 * cells and bright on the seams. It grows outward a step with every beat
 * (`uGrowth` 0..1 of `uReach`), its front a bright crystallising edge; every
 * beat flashes the plates from the centre out; after the shatter cracks open
 * along the seams and glow, crawling outward and cooling. Burns out through
 * noise on the exit.
 *
 * Four-stop ramp: uCore → uTint → uBody → uDeep.
 */
const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uReach;
  uniform float uGrowth;
  uniform float uBeat;
  uniform float uShatter;   // seconds since the shatter, < 0 before
  uniform float uDissolve;
  uniform float uFacets;
  uniform float uFlash;
  uniform float uCrack;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uSeed;
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    vec2 p = vFlat;
    float r = length(p);
    float n = snoise01(vec3(p * 0.8, uSeed));
    float R = uReach * uGrowth * (0.86 + 0.28 * n);
    if (r > R + 0.05 || R <= 0.001) discard;
    float cover = 1.0 - smoothstep(R - 0.25, R, r);
    float front = (1.0 - smoothstep(0.0, 0.18, R - r)) * step(0.0, R - r);

    vec2 cell = voronoi2(p * uFacets + uSeed);
    float seam = 1.0 - smoothstep(0.02, 0.08, cell.x);
    // A fake facet slope per plate: brighter on the plates that face the sun.
    float slope = fract(cell.y * 7.31);
    vec3 col = mix(uDeep, uBody * 0.7, 0.3 + 0.5 * slope);
    col += uTint * seam * 0.9;

    // Every beat: a flash running out across the plates.
    float flash = uBeat * exp(-r / max(uReach * 0.5, 0.1)) * (0.5 + 0.5 * slope);
    col += mix(uTint, uCore, 0.5) * flash * uFlash;
    col += uCore * front * (0.8 + uBeat);

    // After the shatter: the seams crack open and glow, crawling outward, cooling.
    float alive = 1.0;
    float burnEdge = 0.0;
    if (uShatter >= 0.0) {
      float wave = 1.0 - smoothstep(0.0, 0.6, abs(r - uShatter * 9.0));
      float cool = exp(-uShatter * 1.3);
      vec2 cr = voronoi2(p * uFacets * 0.55 + 4.0 + uSeed);
      float crack = 1.0 - smoothstep(0.0, 0.05, cr.x);
      float crawl = 0.5 + 0.5 * sin(cr.y * 25.0 - uTime * 6.0 + r * 2.0);
      col += mix(uBody * 1.6, uCore, wave) * crack * (cool * crawl + wave) * uCrack;
      col += uCore * wave * 0.6;
    }
    if (uDissolve > 0.0) {
      float k = n * 0.8 + 0.2 * r / max(uReach, 0.1);
      alive = 1.0 - smoothstep(uDissolve - 0.04, uDissolve + 0.02, 1.0 - k);
      burnEdge = 1.0 - smoothstep(0.0, 0.05, abs((1.0 - k) - uDissolve));
      col += uTint * burnEdge * 1.5;
    }
    float alpha = (0.72 + 0.28 * seam + front) * cover * alive * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlow, clamp(alpha, 0.0, 1.0));
  }
`;

export function createHeartFloorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 12 },
      uReach: { value: 4.5 },
      uGrowth: { value: 0 },
      uBeat: { value: 0 },
      uShatter: { value: -1 },
      uDissolve: { value: 0 },
      uFacets: { value: 1.6 },
      uFlash: { value: 1.2 },
      uCrack: { value: 1.4 },
      uOpacity: { value: 0.85 },
      uGlow: { value: 1 },
      uSeed: { value: 0 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() }
    }),
    vertexShader: RING_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });
  /** @param {object} state { quadSize, reach, growth, beat, shatter, dissolve, seed } */
  material.userData.sync = (state) => {
    const c = settings.crystallineheart;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize;
    u.uReach.value = state.reach;
    u.uGrowth.value = state.growth;
    u.uBeat.value = state.beat;
    u.uShatter.value = state.shatter;
    u.uDissolve.value = state.dissolve;
    u.uSeed.value = state.seed;
    u.uFacets.value = c.floorFacets * g.noiseFrequency;
    u.uFlash.value = c.floorFlash;
    u.uCrack.value = c.floorCrack * g.shaderIntensity;
    u.uOpacity.value = c.floorOpacity * g.opacity;
    u.uGlow.value = c.floorGlow * g.glow;
    u.uCore.value.copy(getColor(c.colorRingCore));
    u.uTint.value.copy(getColor(c.colorRingGlow));
    u.uBody.value.copy(getColor(c.colorCrystal));
    u.uDeep.value.copy(getColor(c.colorFloorDeep));
  };
  return material;
}
