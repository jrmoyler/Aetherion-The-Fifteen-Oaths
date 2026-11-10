import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  MeshStandardMaterial,
  NormalBlending,
  ShaderMaterial,
  Vector4,
} from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { patchOnBeforeCompile, replaceChunk } from '../../../utils/shaderPatch.js';
import config from './config.js';

/**
 * Martyr's Accord — the bespoke shaders. One four-stop holy ramp runs through
 * all of them: white-hot core → pale gold → saturated amber → oxblood deep
 * (`colorCore`, `colorTint`, `colorBody`, `colorDeep`).
 *
 *  - **the reliquary gold** (`createHeartMaterial`) — the heart and its
 *    shards. A real `MeshStandardMaterial` (lit by the sun, casts shadows,
 *    `LAYER.WORLD`) patched so the gold is *hammered* and *chased*: a bright
 *    belt, dark enamel pooled in the cleft and the tip, and — the story — a
 *    **wound** glowing white where each sword has gone in, and a crack network
 *    (a cellular F2−F1 edge field) that spreads out from the wounds as the
 *    accord takes its blows. The shards keep the cracks and cool from white to
 *    oxblood as they fall.
 *  - **the aura** (`createAuraMaterial`) — a fresnel shell inflated round the
 *    heart in the vertex stage, breathing with the heartbeat.
 *  - **the blades** (`createBladeMaterial`) — instanced swords of light. Each
 *    blade *forms* from guard to point (a hot front), carries a white ridge
 *    and gold body with the deep at the guard, and after the sacrifice a
 *    pulse runs back up it from point to hilt — the blow returned — while it
 *    dissolves point-first through noise.
 *  - **the flame** (`createFlameMaterial`) — the sacred heart's crown of
 *    fire: a tube carrier pinched and torn into tongues in the vertex stage,
 *    fbm fire in the fragment.
 *  - **the glory** (`createGloryMaterial`) — the radiant sunburst behind the
 *    heart: long and short rays, a nimbus ring, a soft core; it gathers with
 *    every blow and flares at the sacrifice.
 *  - **the consecrated floor** (`createSigilMaterial`) — the telegraph rim
 *    scribing itself during the throw, a filled sanctified field (amber body,
 *    oxblood rim), a seven-pointed star joining the swords' bearings, an
 *    *accord ray* out to every bound enemy, and the sear: a white-hot ring
 *    that runs out at the sacrifice and leaves cooling cracks. Normal
 *    blending, so the deep tone really darkens the floor.
 *  - **the lens** (`createLensMaterial`, `LAYER.DISTORTION`) — heat over the
 *    flame and the pressure ring of the sacrifice.
 *
 * Every material reads `settings.martyrsAccord` in `userData.sync(state)`.
 */

const ID = config.id;
export const MAX_WOUNDS = 7;

const additive = (extra) => ({
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: AdditiveBlending,
  side: DoubleSide,
  toneMapped: false,
  ...extra,
});

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/** Shared GLSL: a cellular edge field (F2 − F1) for crack lines. */
const CRACK_GLSL = /* glsl */ `
  float maCrackEdge(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(12.9898, 78.233)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    }
    return sqrt(d2) - sqrt(d1);
  }
`;

/* -------------------------------------------------------------------- */
/* The reliquary gold — a patched, lit, shadowing standard material     */
/* -------------------------------------------------------------------- */

const GOLD_VERTEX_HEAD = /* glsl */ `
  attribute float aBelt;
  attribute float aCleft;
  varying float vBelt;
  varying float vCleft;
  varying vec3  vObj;
`;

const GOLD_FRAGMENT_HEAD = /* glsl */ `
  uniform float uCrack;       // 0..1 how far the crack network has spread
  uniform float uCrackScale;
  uniform float uCrackGlow;
  uniform float uWoundGlow;
  uniform float uWoundSize;
  uniform vec4  uWounds[${MAX_WOUNDS}]; // xyz entry bearing (heart space), w strength
  uniform float uBeat;        // 0..1 heartbeat envelope
  uniform float uBeltGlow;
  uniform float uHeat;        // 1 = white hot (shards cool to 0)
  uniform float uHammer;
  uniform float uClock;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform vec3  uEnamel;
  varying float vBelt;
  varying float vCleft;
  varying vec3  vObj;
  ${noiseGLSL}
  ${CRACK_GLSL}

  // The four-stop ramp (commonGLSL may not go into a built-in material).
  vec3 maRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 a = mix(uCore, uTint, smoothstep(0.0, 0.34, t));
    vec3 b = mix(a, uBody, smoothstep(0.30, 0.68, t));
    return mix(b, uDeep, smoothstep(0.64, 1.0, t));
  }

  float maWound() {
    vec3 dir = normalize(vObj + vec3(0.0, 0.0, 1e-4));
    float w = 0.0;
    for (int i = 0; i < ${MAX_WOUNDS}; i++) {
      vec4 k = uWounds[i];
      w += k.w * smoothstep(1.0 - uWoundSize, 1.0, dot(dir, k.xyz));
    }
    return clamp(w, 0.0, 1.5);
  }

  float maCrack(float wound) {
    vec2 q = (vObj.xy + vObj.z * vec2(0.7, -0.4)) * uCrackScale * 3.0;
    q += vec2(snoise(vObj * 4.0), snoise(vObj * 4.0 + 7.1)) * 0.22;
    float line = 1.0 - smoothstep(0.0, 0.07, maCrackEdge(q));
    // The network spreads out of the wounds first, then over the whole heart.
    float reach = uCrack * 1.3 - 0.3 + wound * 0.9 + (snoise01(vObj * 2.3) - 0.5) * 0.45;
    return line * smoothstep(0.3, 0.7, reach);
  }
`;

const GOLD_COLOR = /* glsl */ `
  #include <color_fragment>
  {
    // Hammered gold: fine planishing marks and a broad lustre variation.
    float hammer = fbm3(vObj * 11.0) * 0.5 + snoise(vObj * 2.2) * 0.25;
    diffuseColor.rgb *= 0.86 + hammer * 0.32 * uHammer;
    // The chased belt is brighter; dark enamel pools in the cleft and the tip.
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.35 + uTint * 0.08, clamp(vBelt, 0.0, 1.0));
    float tip = smoothstep(-0.18, -0.46, vObj.y);
    float enamel = clamp(vCleft * 0.9 + tip * 0.75, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, uEnamel, enamel * 0.8);
    float wound = maWound();
    float crack = maCrack(wound);
    // The cracks are gaps: dark where they open (their light is emissive).
    diffuseColor.rgb *= 1.0 - crack * 0.85;
  }
`;

const GOLD_EMISSIVE = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float wound = maWound();
    float crack = maCrack(wound);
    float flicker = 0.75 + 0.25 * snoise(vObj * 5.0 + vec3(0.0, uClock * 2.3, 0.0));
    vec3 hot = maRamp(1.0 - uHeat * (0.55 + 0.45 * flicker));
    totalEmissiveRadiance += hot * crack * uCrackGlow * flicker;
    totalEmissiveRadiance += mix(uTint, uCore, clamp(wound, 0.0, 1.0)) * wound * uWoundGlow;
    // The belt and the cleft answer the heartbeat.
    totalEmissiveRadiance += uBody * (vBelt * 0.8 + vCleft * 0.6) * uBeat * uBeltGlow;
  }
`;

/**
 * The heart's (and its shards') gold. Lit, opaque, shadowing.
 * @param {'heart'|'shard'} role shards have no wounds and cool over the fall
 */
export function createHeartMaterial(role = 'heart') {
  const material = new MeshStandardMaterial({ color: 0xc98a2e, roughness: 0.28, metalness: 0.92 });
  const wounds = [];
  for (let i = 0; i < MAX_WOUNDS; i++) wounds.push(new Vector4(0, 1, 0, 0));
  const uniforms = {
    uCrack: { value: 0 },
    uCrackScale: { value: 3 },
    uCrackGlow: { value: 3 },
    uWoundGlow: { value: 4 },
    uWoundSize: { value: 0.3 },
    uWounds: { value: wounds },
    uBeat: { value: 0 },
    uBeltGlow: { value: 1 },
    uHeat: { value: 1 },
    uHammer: { value: 1 },
    uClock: { value: 0 },
    uCore: { value: new Color() },
    uTint: { value: new Color() },
    uBody: { value: new Color() },
    uDeep: { value: new Color() },
    uEnamel: { value: new Color() },
  };
  material.userData.uniforms = uniforms;
  patchOnBeforeCompile(material, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = replaceChunk(shader.vertexShader, '#include <common>', `#include <common>\n${GOLD_VERTEX_HEAD}`);
    shader.vertexShader = replaceChunk(shader.vertexShader, '#include <begin_vertex>',
      '#include <begin_vertex>\n  vBelt = aBelt; vCleft = aCleft; vObj = position;');
    shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <common>', `#include <common>\n${GOLD_FRAGMENT_HEAD}`);
    shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <color_fragment>', GOLD_COLOR);
    shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <emissivemap_fragment>', GOLD_EMISSIVE);
  }, 'martyrs-accord-gold');
  /** @param {object} s { crack, beat, heat, clock, wounds?: Float32Array(4·7) } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = uniforms;
    material.color.copy(getColor(c.heartColor));
    material.emissive.copy(getColor(c.heartEmissive));
    material.emissiveIntensity = c.heartEmissiveGlow * g.glow;
    material.metalness = c.heartMetalness;
    material.roughness = c.heartRoughness;
    const glow = g.glow * g.shaderIntensity;
    u.uCrack.value = s.crack;
    u.uCrackScale.value = c.crackScale * g.noiseFrequency;
    u.uCrackGlow.value = c.crackGlow * glow;
    u.uWoundGlow.value = role === 'heart' ? c.woundGlow * glow : 0;
    u.uWoundSize.value = c.woundSize;
    u.uBeat.value = s.beat;
    u.uBeltGlow.value = c.beltGlow * glow;
    u.uHeat.value = s.heat;
    u.uHammer.value = g.noiseStrength;
    u.uClock.value = s.clock;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
    u.uEnamel.value.copy(getColor(c.enamelColor));
    if (s.wounds) {
      for (let i = 0; i < MAX_WOUNDS; i++) {
        u.uWounds.value[i].set(s.wounds[i * 4], s.wounds[i * 4 + 1], s.wounds[i * 4 + 2], s.wounds[i * 4 + 3]);
      }
    }
  };
  return material;
}

/** Lit solid metal for the hilts and the crown — plain standard, synced. */
export function createMetalMaterial(colorKey, metalKey, roughKey, emissiveScale = 0) {
  const material = new MeshStandardMaterial({ color: 0x8a5a1e, metalness: 0.9, roughness: 0.35 });
  /** @param {object} s { glow } extra emissive (0..1) */
  material.userData.sync = (s) => {
    const c = settings[ID];
    material.color.copy(getColor(c[colorKey]));
    material.metalness = c[metalKey];
    material.roughness = c[roughKey];
    material.emissive.copy(getColor(c.colorBody));
    material.emissiveIntensity = emissiveScale * (s?.glow ?? 0) * settings.global.glow;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The aura                                                             */
/* -------------------------------------------------------------------- */

const AURA_VERTEX = /* glsl */ `
  uniform float uInflate;
  uniform float uBeat;
  uniform float uClock;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vObj;
  ${noiseGLSL}
  void main() {
    vObj = position;
    float wobble = snoise(position * 3.0 + vec3(0.0, uClock * 0.9, 0.0)) * 0.35;
    vec3 p = position + normal * uInflate * (1.0 + uBeat * 0.8 + wobble);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const AURA_FRAGMENT = /* glsl */ `
  uniform float uFade;
  uniform float uGlow;
  uniform float uFresnel;
  uniform float uOpacity;
  uniform float uBeat;
  uniform float uClock;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vObj;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, uFresnel, 1.0);
    float n = snoise01(vObj * 5.0 + vec3(0.0, -uClock * 1.6, 0.0));
    float lick = smoothstep(0.35, 0.95, n) * rim;
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, 1.0 - clamp(rim * 1.2 + lick * 0.4, 0.0, 1.0));
    float a = (rim * (0.7 + 0.5 * uBeat) + lick * 0.4) * uFade * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * (1.0 + uBeat * 0.6), clamp(a, 0.0, 1.0));
  }
`;

/** The breathing fresnel shell round the heart. Additive. */
export function createAuraMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uInflate: { value: 0.06 },
      uBeat: { value: 0 },
      uClock: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.4 },
      uFresnel: { value: 2.4 },
      uOpacity: { value: 0.8 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: AURA_VERTEX,
    fragmentShader: AURA_FRAGMENT,
  });
  /** @param {object} s { beat, clock, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uInflate.value = c.auraInflate;
    u.uBeat.value = s.beat;
    u.uClock.value = s.clock;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.auraGlow * g.glow;
    u.uFresnel.value = c.auraFresnel / Math.max(0.2, g.fresnel);
    u.uOpacity.value = c.auraOpacity;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The blades                                                           */
/* -------------------------------------------------------------------- */

const BLADE_VERTEX = /* glsl */ `
  attribute vec4 aState;      // x formed, y returning pulse, z bound, w dissolve
  varying vec2 vUv;
  varying vec4 vState;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vSeed;
  void main() {
    vUv = uv;
    vState = aState;
    mat4 local = mat4(1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix;
    #endif
    vec4 world = modelMatrix * local * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * mat3(local) * normal);
    vViewDir = cameraPosition - world.xyz;
    vSeed = fract(local[3].x * 1.37 + local[3].z * 2.91);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BLADE_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uBound;
  uniform float uFresnel;
  uniform float uClock;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec4 vState;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vSeed;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    float y = vUv.y;
    float ridge = vUv.x;
    // Formed from the guard toward the point, with a hot front.
    float formed = 1.0 - smoothstep(vState.x - 0.015, vState.x, y);
    float front = exp(-abs(y - vState.x) * 38.0) * step(0.001, vState.x) * step(vState.x, 0.999);
    // After the sacrifice: dissolves point-first through noise.
    float n = snoise01(vec3(y * 9.0, ridge * 3.0, vSeed * 17.0 + uClock * 0.6));
    vec2 dm = dissolveMask((1.0 - y) * 0.82 + n * 0.18, vState.w, 0.06);
    // The blow returned: a pulse running back up the blade, point to guard.
    float pulse = exp(-pow((y - (1.0 - vState.y)) * 7.0, 2.0)) * step(0.001, vState.y) * step(vState.y, 0.999);
    float rim = fresnelTerm(vViewDir, vNormalW, 2.0, uFresnel);
    float shimmer = 0.85 + 0.15 * sin(y * 40.0 - uClock * 9.0 + vSeed * 6.0);
    float t = 1.0 - clamp(ridge * 0.55 + rim * 0.35 + pulse + front, 0.0, 1.0);
    t = mix(t, 1.0, smoothstep(0.08, 0.0, y) * 0.8);
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, t);
    float bound = mix(1.0, uBound, vState.z);
    col *= uGlow * uGlobalGlow * bound * shimmer * (1.0 + 2.5 * front + 2.0 * pulse);
    col += uCore * dm.y * 4.0;
    float a = (0.45 + 0.4 * ridge + rim) * formed * dm.x * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** Instanced swords of light (per-instance `aState`). Additive. */
export function createBladeMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: DoubleSide }),
    uniforms: sharedUniforms({
      uGlow: { value: 2 },
      uOpacity: { value: 1 },
      uBound: { value: 1.5 },
      uFresnel: { value: 1 },
      uClock: { value: 0 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: BLADE_VERTEX,
    fragmentShader: BLADE_FRAGMENT,
  });
  material.userData.instanced = true;
  /** @param {object} s { clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.bladeGlow * g.glow;
    u.uOpacity.value = c.bladeOpacity * g.opacity;
    u.uBound.value = c.boundBoost;
    u.uFresnel.value = g.fresnel;
    u.uClock.value = s.clock;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The flame                                                            */
/* -------------------------------------------------------------------- */

const FLAME_VERTEX = /* glsl */ `
  uniform float uClock;
  uniform float uTurb;
  varying vec2 vUv;
  varying float vH;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  void main() {
    vUv = uv;
    float h = clamp(position.y, 0.0, 1.0);
    vH = h;
    float ang = atan(position.z, position.x);
    // A teardrop that pinches to a point, torn into tongues near the top.
    float width = pow(1.0 - h, 0.65) * (0.55 + 0.9 * h * (1.0 - h));
    float tongue = snoise(vec3(cos(ang) * 1.3, sin(ang) * 1.3, h * 2.5 - uClock * 2.2)) * h * 0.55 * uTurb;
    vec3 p = vec3(position.x * width * (1.0 + tongue), h, position.z * width * (1.0 + tongue));
    // The whole flame sways, more at the tip.
    p.x += sin(uClock * 2.7 + h * 2.0) * 0.12 * h * h * uTurb;
    p.z += cos(uClock * 2.1 + h * 1.6) * 0.08 * h * h * uTurb;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FLAME_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uGlow;
  uniform float uScale;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying float vH;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    float around = vUv.x * 6.2831853;
    vec3 q = vec3(cos(around) * 1.5, sin(around) * 1.5, vH * 3.2 - uClock * 2.6) * uScale;
    float f = fbm3(q) * 0.5 + 0.5;
    float body = smoothstep(0.0, 0.25, (1.0 - vH) * 1.25 + (f - 0.5) * 0.9 - 0.15);
    float facing = pow(abs(dot(normalize(vViewDir), normalize(vNormalW))), 0.7);
    float a = body * facing * uFade * smoothstep(0.0, 0.06, vH + 0.02);
    if (a < 0.003) discard;
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, clamp(vH * 1.1 + (1.0 - f) * 0.35, 0.0, 1.0));
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * (0.6 + facing), clamp(a, 0.0, 1.0));
  }
`;

/** The heart's crown of fire. Additive. */
export function createFlameMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: DoubleSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uTurb: { value: 1 },
      uFade: { value: 1 },
      uGlow: { value: 2 },
      uScale: { value: 1 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: FLAME_VERTEX,
    fragmentShader: FLAME_FRAGMENT,
  });
  /** @param {object} s { clock, fade, flare } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock * c.flameSpeed;
    u.uTurb.value = g.turbulence;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.flameGlow * g.glow * (1 + s.flare);
    u.uScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The glory                                                            */
/* -------------------------------------------------------------------- */

const GLORY_FRAGMENT = /* glsl */ `
  uniform float uIntensity;   // gathers with every blow, flares at the sacrifice
  uniform float uSpin;
  uniform float uRays;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uClock;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x) + uSpin;
    float k = a / 6.2831853 * uRays;
    float idx = floor(k + 0.5);
    // Alternate long and short rays, each a little different in reach.
    float longRay = mod(idx, 2.0);
    float reach = mix(0.62, 0.98, longRay) - hash11(idx * 7.13) * 0.12;
    float across = abs(fract(k + 0.5) - 0.5) * 2.0;
    float taper = mix(0.55, 0.15, clamp(r / reach, 0.0, 1.0));
    float ray = (1.0 - smoothstep(taper * 0.6, taper, across)) * (1.0 - smoothstep(reach - 0.2, reach, r)) * smoothstep(0.18, 0.32, r);
    ray *= 0.75 + 0.25 * snoise(vec3(idx * 1.7, r * 4.0 - uClock * 1.5, 0.3));
    float nimbus = exp(-pow((r - 0.36) / 0.018, 2.0)) * 0.9 + exp(-pow((r - 0.41) / 0.01, 2.0)) * 0.5;
    float core = exp(-r * 4.5) * 0.7;
    float lum = ray * 0.85 + nimbus + core;
    float alpha = lum * uIntensity * uOpacity;
    if (alpha < 0.003) discard;
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, clamp(r * 1.15 - nimbus * 0.4, 0.0, 1.0));
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * (0.6 + uIntensity * 0.6), clamp(alpha, 0.0, 1.0));
  }
`;

/** The radiant sunburst behind the heart (camera-facing). Additive. */
export function createGloryMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uIntensity: { value: 0 },
      uSpin: { value: 0 },
      uRays: { value: 28 },
      uGlow: { value: 1.3 },
      uOpacity: { value: 0.55 },
      uClock: { value: 0 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: GLORY_FRAGMENT,
  });
  /** @param {object} s { intensity, spin, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uIntensity.value = s.intensity;
    u.uSpin.value = s.spin;
    u.uRays.value = Math.max(4, Math.round(c.gloryRays / 2) * 2);
    u.uGlow.value = c.gloryGlow * g.glow;
    u.uOpacity.value = c.gloryOpacity * g.opacity;
    u.uClock.value = s.clock;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The consecrated floor                                                */
/* -------------------------------------------------------------------- */

const SIGIL_FRAGMENT = /* glsl */ `
  uniform float uExtent;      // quad half-size in zone radii
  uniform float uScribe;      // 0..1 telegraph rim drawn
  uniform float uFill;        // 0..1 consecration
  uniform float uSear;        // 0..1 sear ring after the sacrifice (−1 before)
  uniform float uCool;        // 0..1 the seared ground cooling
  uniform float uDissolve;
  uniform float uBeat;
  uniform float uClock;
  uniform float uGlow;
  uniform float uFillAmount;
  uniform float uRayGlow;
  uniform float uLineWidth;
  uniform float uSearGlow;
  uniform float uNoise;
  uniform float uScale;
  uniform float uStartAngle;
  uniform vec4  uRays[${MAX_WOUNDS}]; // xy bearing, z drawn 0..1, w bound
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}
  ${CRACK_GLSL}

  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0 * uExtent;    // 1.0 = zone rim
    float r = length(p);
    if (r > uExtent) discard;
    float ang = atan(p.y, p.x);
    float w = uLineWidth;
    float mottle = fbm3(vec3(p * 2.2 * uScale, 1.7)) * uNoise;

    // Telegraph rim, scribed from the caster's side round both ways.
    float swept = abs(atan(sin(ang - uStartAngle), cos(ang - uStartAngle))) / 3.14159265;
    float scribed = 1.0 - smoothstep(uScribe - 0.02, uScribe, swept);
    float head = exp(-abs(swept - uScribe) * 60.0) * step(0.001, uScribe) * step(uScribe, 0.999);
    float rim = exp(-abs(r - 1.0) / w) * scribed;
    float inner = exp(-abs(r - 0.86) / (w * 0.6)) * scribed * uFill;
    // Seven-point star and accord rays.
    float star = 0.0;
    float rays = 0.0;
    float hot = 0.0;
    for (int i = 0; i < ${MAX_WOUNDS}; i++) {
      vec4 k = uRays[i];
      vec4 n3 = uRays[int(mod(float(i + 3), ${MAX_WOUNDS}.0))];
      vec2 a = k.xy * 0.86;
      vec2 b = n3.xy * 0.86;
      star += exp(-segDist(p, a, b) / (w * 0.55)) * min(k.z, n3.z);
      // Each ray draws outward to the rim (to its bound enemy) as its sword forms.
      float d = segDist(p, vec2(0.0), k.xy * mix(0.86, 1.0, k.w) * k.z);
      float ray = exp(-d / (w * mix(0.5, 0.9, k.w))) * step(0.001, k.z);
      rays += ray * mix(0.45, 1.0, k.w);
      hot += ray * k.w;
    }
    star = min(star, 1.5) * uFill;
    rays = min(rays, 1.5);

    // The filled field: amber near the heart, oxblood toward the rim.
    float inside = 1.0 - smoothstep(0.96, 1.02, r);
    float field = inside * uFill * uFillAmount * (0.55 + 0.45 * mottle);
    float pool = exp(-r * r * 6.0) * (0.6 + 0.4 * uBeat) * uFill * (uSear >= 0.0 ? 0.25 : 1.0);

    // The sear: a white-hot ring runs out, the ground behind it cracks and cools.
    float sear = 0.0;
    float scorch = 0.0;
    float cracks = 0.0;
    if (uSear >= 0.0) {
      float front = uSear * 1.15;
      sear = exp(-abs(r - front) * 14.0) * (1.0 - uSear * 0.7);
      float behind = 1.0 - smoothstep(front - 0.05, front + 0.05, r);
      scorch = behind * inside;
      float e = maCrackEdge(p * 3.2 * uScale + mottle * 0.6);
      cracks = (1.0 - smoothstep(0.0, 0.08, e)) * behind * (1.0 - uCool * 0.75);
    }

    vec2 dm = dissolveMask(snoise01(vec3(p * 2.6, 3.1)) * 0.85 + (1.0 - r) * 0.15, uDissolve, 0.06);

    float lines = rim * 1.2 + inner * 0.6 + star * 0.55 + head * 2.0;
    float lum = lines + rays * uRayGlow + pool * 0.8 + sear * uSearGlow + cracks * uSearGlow * 0.6;
    float t = 1.0 - clamp(lines * 0.6 + rays * 0.5 * uRayGlow + hot * 0.4 + sear + cracks * 0.6 + pool * 0.5, 0.0, 1.0);
    vec3 light = gradient4(uCore, uTint, uBody, uDeep, t);
    // Field colour (normal-blended): amber body → oxblood deep, dark scorch.
    vec3 fieldCol = mix(uBody * 0.55, uDeep, smoothstep(0.2, 1.0, r));
    fieldCol = mix(fieldCol, uDeep * 0.35, scorch * 0.7);
    float fieldA = clamp(field * 0.7 * (1.0 - scorch * uCool * 0.5) + scorch * 0.55 * uFill, 0.0, 0.85);
    vec3 col = fieldCol * fieldA + light * lum * uGlow * uGlobalGlow;
    float alpha = clamp(fieldA + lum * 0.9, 0.0, 1.0);
    // Un-premultiply: normal blending multiplies by alpha again.
    vec3 rgb = col / max(alpha, 1e-3) + uCore * dm.y * 2.0;
    alpha = max(alpha * dm.x, dm.y * 0.6 * step(0.003, alpha));
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(rgb, alpha);
  }
`;

/** The consecrated floor: telegraph, field, star, accord rays, sear. */
export function createSigilMaterial() {
  const rays = [];
  for (let i = 0; i < MAX_WOUNDS; i++) rays.push(new Vector4(1, 0, 0, 0));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uExtent: { value: 1.25 },
      uScribe: { value: 0 },
      uFill: { value: 0 },
      uSear: { value: -1 },
      uCool: { value: 0 },
      uDissolve: { value: 0 },
      uBeat: { value: 0 },
      uClock: { value: 0 },
      uGlow: { value: 1.6 },
      uFillAmount: { value: 0.55 },
      uRayGlow: { value: 1.6 },
      uLineWidth: { value: 0.015 },
      uSearGlow: { value: 2.4 },
      uNoise: { value: 1 },
      uScale: { value: 1 },
      uStartAngle: { value: 0 },
      uRays: { value: rays },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: SIGIL_FRAGMENT,
  });
  /** @param {object} s { extent, scribe, fill, sear, cool, dissolve, beat, clock, startAngle, rays: Float32Array(4·7), radius } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uExtent.value = s.extent;
    u.uScribe.value = s.scribe;
    u.uFill.value = s.fill;
    u.uSear.value = s.sear;
    u.uCool.value = s.cool;
    u.uDissolve.value = s.dissolve;
    u.uBeat.value = s.beat;
    u.uClock.value = s.clock;
    u.uGlow.value = c.floorGlow * g.glow * s.fade * g.opacity;
    u.uFillAmount.value = c.floorFill * g.opacity * s.fade;
    u.uRayGlow.value = c.floorRayGlow;
    // `sealWidth` is metres; the shader works in zone radii.
    u.uLineWidth.value = Math.max(0.002, c.sealWidth / Math.max(0.5, s.radius));
    u.uSearGlow.value = c.searGlow * g.shaderIntensity;
    u.uNoise.value = c.floorNoise * g.noiseStrength;
    u.uScale.value = g.noiseFrequency;
    u.uStartAngle.value = s.startAngle;
    for (let i = 0; i < MAX_WOUNDS; i++) {
      u.uRays.value[i].set(s.rays[i * 4], s.rays[i * 4 + 1], s.rays[i * 4 + 2], s.rays[i * 4 + 3]);
    }
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens                                                             */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uHeat;        // shimmer over the flame
  uniform float uShock;       // the sacrifice's pressure ring
  uniform float uWave;        // its radius 0..1
  uniform float uClock;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    vec2 radial = q / max(r, 1e-3);
    // Heat rises in a column above the heart (upper half of the quad).
    float column = smoothstep(0.55, 0.0, abs(q.x)) * smoothstep(-0.1, 0.25, q.y) * (1.0 - smoothstep(0.7, 1.0, q.y));
    vec3 np = vec3(q * 3.0 * uScale, uClock * 0.8);
    vec2 n = vec2(snoise(np + vec3(0.0, -uClock * 1.5, 0.0)), snoise(np + vec3(5.2, 1.3, 7.7)));
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    vec2 dir = n * column * uHeat + (radial + n * 0.3) * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(column * uHeat + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` quad facing the camera. Opaque on purpose, like the
 * other expansion lenses: the offset buffer wants the proxy's own value, and
 * an opaque proxy is kept out of the "transparent ⇒ VFX layer" routing.
 */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHeat: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { heat, shock, wave, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHeat.value = s.heat * c.lensHeat * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}

/* -------------------------------------------------------------------- */

function syncRamp(u, c) {
  u.uCore.value.copy(getColor(c.colorCore));
  u.uTint.value.copy(getColor(c.colorTint));
  u.uBody.value.copy(getColor(c.colorBody));
  u.uDeep.value.copy(getColor(c.colorDeep));
}
