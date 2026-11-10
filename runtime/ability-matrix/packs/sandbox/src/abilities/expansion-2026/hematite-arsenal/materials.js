import { AdditiveBlending, Color, DoubleSide, FrontSide, MeshStandardMaterial, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Hematite Arsenal — the bespoke materials.
 *
 *  - **hematite** (`createWeaponMaterial`) — the weapons are *solid*: a
 *    `MeshStandardMaterial` (lit by the sun, the HDR probe, casting shadows)
 *    patched with the cast's own GLSL. Polished near-black iron with a red
 *    under-sheen; living blood runs in the fuller channel and its **level is
 *    the weapon's remaining vitality** — it drains from the point toward the
 *    hilt as strikes are paid for. A congealing weapon glows molten through
 *    the four-stop ramp; a spent one oxidises into blotched rust and crumbles
 *    through a noisy discard front with an ember-orange lip.
 *  - **the pool** (`createPoolMaterial`) — the floor: a wet blood pool with
 *    a ragged spreading edge, rivulets running from every socket to the
 *    centre, a wet specular sheen from the real sun direction, rings thrown
 *    by striking weapons, and a crust of dried hematite with voronoi cracks
 *    on the way out.
 *  - **the knot** (`createKnotMaterial`) — the blood knot at the hand the
 *    arsenal is forged from: a boiling sphere, displaced in the vertex stage,
 *    brightest through its middle (`N·V`), ramped core → deep.
 *  - **the streak** (`createStreakMaterial`) — the crimson smear a lunging
 *    weapon leaves along its path, white-hot at the head.
 *  - **the lens** (`createLensMaterial`) — `LAYER.DISTORTION` disc: a
 *    pressure ring when the arsenal lands, a puff at every strike, a low
 *    shimmer over the pool.
 *
 * Every material reads `settings.hematiteArsenal` in `userData.sync(state)`.
 */

const ID = config.id;

const additive = (extra) => ({
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: AdditiveBlending,
  side: DoubleSide,
  toneMapped: false,
  ...extra,
});

/** Write the four-stop ramp into `uCore/uTint/uBody/uDeep`. */
function syncRamp(u, c) {
  u.uCore.value.copy(getColor(c.coreColor));
  u.uTint.value.copy(getColor(c.tintColor));
  u.uBody.value.copy(getColor(c.bodyColor));
  u.uDeep.value.copy(getColor(c.deepColor));
}
const ramp = () => ({
  uCore: { value: new Color() },
  uTint: { value: new Color() },
  uBody: { value: new Color() },
  uDeep: { value: new Color() },
});

/* -------------------------------------------------------------------- */
/* Hematite — the weapons                                               */
/* -------------------------------------------------------------------- */

/**
 * One weapon's material. Each pool member owns one so its vitality, rust,
 * form and crumble are its own; they share one compiled program.
 */
export function createWeaponMaterial() {
  const material = new MeshStandardMaterial({ color: 0x3b3a40, metalness: 0.92, roughness: 0.26 });
  const u = {
    uVital: { value: 1 }, // 0..1 of the weapon's vitality left — the blood level
    uForm: { value: 1 }, // 0 molten → 1 cooled hematite
    uHeat: { value: 0 }, // extra molten glow (landing, strikes)
    uRust: { value: 0 }, // 0..1 oxidised
    uCrumble: { value: 0 }, // 0..1 crumbled away
    uClock: { value: 0 },
    uSeed: { value: 0 },
    uFullerGlow: { value: 2 },
    uFlow: { value: 1 },
    uEdgeGlow: { value: 0.5 },
    uRim: { value: 1 },
    uFormGlow: { value: 3 },
    uSheen: { value: new Color() },
    uRustColor: { value: new Color() },
    uRustRough: { value: 0.9 },
    uNoiseScale: { value: 1 },
    ...ramp(),
  };
  material.userData.uniforms = u;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aWeapon;\nvarying vec4 vWeapon;\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWeapon = aWeapon;\nvLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec4 vWeapon;
        varying vec3 vLocal;
        uniform float uVital, uForm, uHeat, uRust, uCrumble, uClock, uSeed;
        uniform float uRim, uFullerGlow, uFlow, uEdgeGlow, uFormGlow, uRustRough, uNoiseScale;
        uniform vec3 uSheen, uRustColor, uCore, uTint, uBody, uDeep;
        float haHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float haNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(haHash(i), haHash(i + vec3(1,0,0)), f.x), mix(haHash(i + vec3(0,1,0)), haHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(haHash(i + vec3(0,0,1)), haHash(i + vec3(1,0,1)), f.x), mix(haHash(i + vec3(0,1,1)), haHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float haFbm(vec3 p) { return haNoise(p) * 0.55 + haNoise(p * 2.3 + 4.1) * 0.3 + haNoise(p * 5.1 + 9.7) * 0.15; }
        vec3 haRamp(float t) {
          t = clamp(t, 0.0, 1.0);
          vec3 a = mix(uCore, uTint, smoothstep(0.0, 0.34, t));
          vec3 b = mix(a, uBody, smoothstep(0.3, 0.68, t));
          return mix(b, uDeep, smoothstep(0.64, 1.0, t));
        }`
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        // Crumble: whole flakes go, from the point up, with a burning lip.
        float haCrumbleN = haFbm(vLocal * 14.0 * uNoiseScale + uSeed * 17.0) * 0.75 + (1.0 - vWeapon.y) * 0.25;
        if (uCrumble > 0.0 && haCrumbleN < uCrumble * 1.08) discard;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // Polished hematite with a red under-sheen in the hollows; rust blotches spread in.
          float grain = haFbm(vLocal * vec3(30.0, 6.0, 30.0) * uNoiseScale + uSeed);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSheen, 0.35 * grain);
          float blot = smoothstep(1.0 - uRust, 1.0 - uRust + 0.18, haFbm(vLocal * 9.0 * uNoiseScale + uSeed * 3.0) * 0.8 + 0.2);
          diffuseColor.rgb = mix(diffuseColor.rgb, uRustColor * (0.7 + 0.6 * grain), clamp(blot + uRust * 0.35, 0.0, 1.0));
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, uRustRough, uRust);`
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.15, uRust);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float along = vWeapon.y;
          // The blood level: full fuller at vitality 1, drained from the point
          // toward the hilt as vitality is spent.
          float level = smoothstep(1.0 - uVital - 0.02, 1.0 - uVital + 0.04, along * 1.25 - 0.05);
          float flow = haNoise(vec3(along * 34.0 - uClock * uFlow * 3.0, vLocal.x * 30.0, uSeed));
          float fuller = vWeapon.z * level * (0.55 + 0.45 * flow) * uFullerGlow * (1.0 - uRust);
          float meniscus = vWeapon.z * exp(-abs(along * 1.25 - 0.05 - (1.0 - uVital)) * 40.0) * step(0.01, uVital) * step(uVital, 0.99);
          vec3 blood = haRamp(0.62 - 0.3 * flow) * fuller + uCore * meniscus * uFullerGlow * 1.5;
          float edge = vWeapon.w * uEdgeGlow * uVital * (1.0 - uRust);
          vec3 edgeC = uBody * edge;
          // Molten while congealing / on impact: the whole weapon runs the ramp.
          float molten = clamp((1.0 - uForm) + uHeat, 0.0, 1.5);
          float moltenField = haFbm(vLocal * 8.0 + vec3(0.0, -uClock * 2.0, uSeed));
          vec3 hot = haRamp(1.0 - molten * (0.55 + 0.45 * moltenField)) * molten * uFormGlow;
          // The crumble lip burns rust-orange.
          float lip = uCrumble > 0.0 ? smoothstep(uCrumble * 1.08 + 0.08, uCrumble * 1.08, haCrumbleN) : 0.0;
          // Polished hematite's red fresnel rim — the iron oxide under the shine.
          float rimT = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
          vec3 rimC = mix(uBody, uTint, rimT) * rimT * uRim * (1.0 - 0.7 * uRust);
          totalEmissiveRadiance += blood + edgeC + hot + rimC + uRustColor * lip * 4.0;
        }`
      );
  };
  material.customProgramCacheKey = () => 'hematite-arsenal-weapon-v1';

  /** @param {object} s { vital, form, heat, rust, crumble, clock, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    material.color.copy(getColor(c.metalColor));
    material.metalness = c.metalness;
    material.roughness = c.roughness;
    u.uVital.value = s.vital;
    u.uForm.value = s.form;
    u.uHeat.value = s.heat;
    u.uRust.value = s.rust;
    u.uCrumble.value = s.crumble;
    u.uClock.value = s.clock * g.noiseSpeed;
    u.uSeed.value = s.seed;
    u.uFullerGlow.value = c.fullerGlow * g.glow * g.shaderIntensity;
    u.uFlow.value = c.fullerFlow;
    u.uEdgeGlow.value = c.edgeGlow * g.glow;
    u.uRim.value = c.rimGlow * g.glow * g.fresnel;
    u.uFormGlow.value = c.formGlow * g.glow;
    u.uSheen.value.copy(getColor(c.metalSheen));
    u.uRustColor.value.copy(getColor(c.rustColor));
    u.uRustRough.value = c.rustRoughness;
    u.uNoiseScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The pool                                                             */
/* -------------------------------------------------------------------- */

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

export const MAX_POOL_SEATS = 8;

const POOL_FRAGMENT = /* glsl */ `
  uniform float uReach;        // quad half-size in units of the zone radius
  uniform float uGrow;         // 0..1 spread of the pool
  uniform float uDry;          // 0..1 crusted
  uniform float uFade;
  uniform float uClock;
  uniform float uGlow;
  uniform float uSheen;
  uniform float uVeins;
  uniform float uRipple;
  uniform float uOpacity;
  uniform float uNoiseScale;
  uniform vec3 uSeats[${MAX_POOL_SEATS}];   // xy socket in zone-radius units, z = ring 0..1 (or -1)
  uniform float uVital[${MAX_POOL_SEATS}];  // vitality left in each socket's weapon (rivulet strength)
  uniform int uCount;
  uniform vec3 uCore, uTint, uBody, uDeep, uCrust;
  uniform vec3 uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}

  float segDist(vec2 p, vec2 a, vec2 b, out float h) {
    vec2 pa = p - a, ba = b - a;
    h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0 * uReach;   // zone-radius units, 1 = the rim
    float r = length(p);
    float edgeN = fbm3(vec3(p * 2.2 * uNoiseScale, 1.7)) * 0.16;
    float extent = uGrow * (1.0 + edgeN);
    float body = 1.0 - smoothstep(extent - 0.06, extent, r);
    if (body <= 0.001) discard;

    // Rivulets: blood running from every socket in to the centre, carried
    // by the weapon's remaining vitality.
    float veins = 0.0, rings = 0.0;
    for (int i = 0; i < ${MAX_POOL_SEATS}; i++) {
      if (i >= uCount) break;
      vec2 s = uSeats[i].xy;
      float h;
      float wob = snoise(vec3(p * 3.0, float(i) * 3.1)) * 0.05;
      float d = segDist(p, s, vec2(0.0), h) + wob;
      float flow = 0.6 + 0.4 * sin(h * 22.0 + uClock * 6.0 + float(i));
      veins += exp(-d * d / 0.0018) * flow * (0.35 + 0.65 * uVital[i]);
      // A pool round each socket.
      veins += exp(-pow(length(p - s) / 0.16, 2.0)) * 0.8;
      if (uSeats[i].z >= 0.0) {
        float k = uSeats[i].z;
        rings += exp(-pow((length(p - s) - k * 0.65) / 0.035, 2.0)) * (1.0 - k);
      }
    }
    veins *= uVeins;
    rings *= uRipple;

    // Wet sheen: a fake normal from the fbm surface, lit by the real sun.
    vec3 q = vec3(p * 4.0 * uNoiseScale, uClock * 0.15);
    float hC = fbm3(q);
    vec2 grad = vec2(fbm3(q + vec3(0.04, 0.0, 0.0)) - hC, fbm3(q + vec3(0.0, 0.04, 0.0)) - hC) / 0.04;
    vec3 n = normalize(vec3(-grad.x * 0.18, 1.0, -grad.y * 0.18));
    vec3 h = normalize(normalize(uLightDir) + vec3(0.0, 1.0, 0.35));
    float spec = pow(max(dot(n, h), 0.0), 60.0) * uSheen;

    // Colour: a dark clotted body, saturated rivulets, a hot core in the rings.
    float depth = smoothstep(0.0, 1.0, r / max(extent, 1e-3));
    vec3 col = mix(uDeep * 1.6, uDeep * 0.7, depth);
    col = mix(col, uBody, clamp(veins, 0.0, 1.0) * 0.85);
    col += uTint * rings * 1.5 + uCore * rings * rings;
    col += uTint * spec;
    float emissive = (veins * 0.35 + rings) * uGlow * uGlobalGlow * uShaderIntensity;
    col += uBody * emissive;

    // Crust: the pool dries into hematite plates with dark cracks.
    vec2 vor = voronoi2(p * 5.0 * uNoiseScale);
    float crack = 1.0 - smoothstep(0.0, 0.06, vor.x);
    vec3 crust = uCrust * (0.75 + 0.5 * vor.y) * (1.0 - crack * 0.8);
    col = mix(col, crust, uDry);

    float alpha = body * (0.82 + 0.18 * clamp(veins, 0.0, 1.0)) * uFade * uOpacity;
    vec2 dm = dissolveMask(snoise01(vec3(p * 3.0, 4.1)), 1.0 - uFade, 0.06);
    alpha *= dm.x;
    col += uBody * dm.y * 2.0;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The blood pool on the floor. Normal-blended: it has to be *dark*. */
export function createPoolMaterial() {
  const seats = [];
  for (let i = 0; i < MAX_POOL_SEATS; i++) seats.push(new Vector3(0, 0, -1));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uReach: { value: 1.1 },
      uGrow: { value: 0 },
      uDry: { value: 0 },
      uFade: { value: 1 },
      uClock: { value: 0 },
      uGlow: { value: 1 },
      uSheen: { value: 1 },
      uVeins: { value: 1 },
      uRipple: { value: 1 },
      uOpacity: { value: 1 },
      uNoiseScale: { value: 1 },
      uSeats: { value: seats },
      uVital: { value: new Array(MAX_POOL_SEATS).fill(1) },
      uCount: { value: 0 },
      uCrust: { value: new Color() },
      ...ramp(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: POOL_FRAGMENT,
  });
  /** @param {object} s { reach, grow, dry, fade, clock } — seats are written by the ability */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uReach.value = s.reach;
    u.uGrow.value = s.grow;
    u.uDry.value = s.dry;
    u.uFade.value = s.fade;
    u.uClock.value = s.clock * g.noiseSpeed;
    u.uGlow.value = c.poolGlow * g.glow;
    u.uSheen.value = c.poolSheen;
    u.uVeins.value = c.poolVeins;
    u.uRipple.value = c.poolRipple;
    u.uOpacity.value = g.opacity;
    u.uNoiseScale.value = g.noiseFrequency;
    u.uCrust.value.copy(getColor(c.crustColor));
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The knot                                                             */
/* -------------------------------------------------------------------- */

const KNOT_VERTEX = /* glsl */ `
  uniform float uClock;
  uniform float uChurn;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vBoil;
  ${noiseGLSL}
  void main() {
    float boil = snoise(normal * 2.4 + vec3(0.0, uClock * 1.7, uClock * 0.6));
    boil += 0.5 * snoise(normal * 5.3 - vec3(uClock * 2.3));
    vBoil = boil;
    vec3 p = position * (1.0 + boil * 0.22 * uChurn);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const KNOT_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uFade;
  uniform float uGlobalGlow;
  uniform vec3 uCore, uTint, uBody, uDeep;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vBoil;
  void main() {
    float nv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    float t = 1.0 - pow(nv, 1.6) * (0.75 + 0.25 * vBoil);
    vec3 a = mix(uCore, uTint, smoothstep(0.0, 0.34, t));
    vec3 b = mix(a, uBody, smoothstep(0.3, 0.68, t));
    vec3 col = mix(b, uDeep, smoothstep(0.64, 1.0, t));
    float body = pow(nv, 0.8);
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * (0.35 + body), body * uFade);
  }
`;

/** The blood knot at the hand: the arsenal's raw material. Additive. */
export function createKnotMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uChurn: { value: 1 },
      uGlow: { value: 1 },
      uFade: { value: 1 },
      ...ramp(),
    }),
    vertexShader: KNOT_VERTEX,
    fragmentShader: KNOT_FRAGMENT,
  });
  /** @param {object} s { clock, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock * g.noiseSpeed;
    u.uChurn.value = c.knotChurn * g.noiseStrength * g.turbulence;
    u.uGlow.value = c.knotGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The streak                                                           */
/* -------------------------------------------------------------------- */

const STREAK_FRAGMENT = /* glsl */ `
  uniform float uHead;     // 0..1 where the weapon's point is along the ribbon
  uniform float uAlpha;
  uniform float uGlow;
  uniform float uSeed;
  uniform float uNoiseScale;
  uniform vec3 uCore, uTint, uBody, uDeep;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    float x = vUv.x;
    if (x > uHead) discard;
    float across = abs(vUv.y - 0.5) * 2.0;
    float smear = snoise(vec3(x * 6.0 * uNoiseScale, vUv.y * 3.0, uSeed)) * 0.25;
    float width = mix(0.15, 1.0, pow(x / max(uHead, 1e-3), 1.5));
    float core = exp(-pow(across / (0.25 * width), 2.0));
    float sheet = (1.0 - smoothstep(width * 0.6, width, across + smear));
    float head = exp(-(uHead - x) * 9.0);
    float t = 1.0 - clamp(core * head * 1.2 + sheet * 0.25, 0.0, 1.0);
    vec3 a = mix(uCore, uTint, smoothstep(0.0, 0.34, t));
    vec3 b = mix(a, uBody, smoothstep(0.3, 0.68, t));
    vec3 col = mix(b, uDeep, smoothstep(0.64, 1.0, t));
    float alpha = (core * (0.4 + head) + sheet * 0.35) * uAlpha * smoothstep(0.0, 0.15, x);
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** The lunge streak. Additive; one per weapon. */
export function createStreakMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uHead: { value: 1 },
      uAlpha: { value: 0 },
      uGlow: { value: 1 },
      uSeed: { value: 0 },
      uNoiseScale: { value: 1 },
      ...ramp(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: STREAK_FRAGMENT,
  });
  /** @param {object} s { head, alpha, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHead.value = s.head;
    u.uAlpha.value = s.alpha * g.opacity;
    u.uGlow.value = c.streakGlow * g.glow * g.shaderIntensity;
    u.uSeed.value = s.seed;
    u.uNoiseScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens                                                             */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uShock;   // landing ring strength
  uniform float uWave;    // its radius 0..1
  uniform float uHaze;    // shimmer over the pool
  uniform float uPuff;    // strike puff strength
  uniform vec2 uPuffAt;   // where (quad uv, −1..1)
  uniform float uClock;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    vec2 radial = q / max(r, 1e-3);
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    vec3 np = vec3(q * 3.0 * uScale, uClock * 0.6);
    vec2 n = vec2(snoise(np), snoise(np + vec3(5.2, 1.3, 7.7)));
    vec2 pq = q - uPuffAt;
    float puff = exp(-dot(pq, pq) / 0.03);
    vec2 dir = radial * ring * uShock + n * uHaze * (1.0 - smoothstep(0.6, 1.0, r)) + normalize(pq + 1e-4) * puff * uPuff;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(ring * uShock + uHaze * 0.5 + puff * uPuff, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc. Opaque on purpose (see Borrowed Tomorrow): the
 * offset buffer wants the proxy's own value.
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
      uShock: { value: 0 },
      uWave: { value: 0 },
      uHaze: { value: 0 },
      uPuff: { value: 0 },
      uPuffAt: { value: new Vector2() },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { shock, wave, haze, puff, puffX, puffY, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uHaze.value = s.haze * c.lensHaze * g.distortion;
    u.uPuff.value = s.puff * c.lensStrike * g.distortion;
    u.uPuffAt.value.x = s.puffX;
    u.uPuffAt.value.y = s.puffY;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
