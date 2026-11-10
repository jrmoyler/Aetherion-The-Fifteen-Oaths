import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  NormalBlending,
  ShaderMaterial,
  Vector4,
} from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Hydraulic Marionette — the bespoke shaders.
 *
 *  - **the liquid** — one lit shader for everything made of the water itself:
 *    the control's bars, bulbs and reservoir, the strings and their hooks.
 *    Opaque and on the world layer (it shadows); shaded like water rather
 *    than glass: thick water looks *through* to the deep tone, the rim turns
 *    pale with fresnel, the room reflects off a surface that is flowing
 *    (normals perturbed by noise scrolled along the jet), caustic veins
 *    swim inside, a tight specular lobe glints white-hot, and pulses pumped
 *    down a string (`aGlow`) light it from within. On the exit it rains
 *    out through a noise dissolve with a foam edge.
 *  - **the pool** — the floor under the control: a dark wet spill that
 *    spreads from the hooks, rings of ripples running out from every
 *    string's tip on each tug (and from the centre at the slam), glints on
 *    the ripple crests from a normal built from the ripple field, foam lace
 *    at the rim. Drains through noise on the exit.
 *  - **the crown** — instanced splash crowns: a flared cup whose rim is torn
 *    into spikes in the vertex stage, rising and thinning over its life.
 *  - **the lens** — `LAYER.DISTORTION` disc: the pool's ripples refract
 *    the floor; a pressure ring at the slam.
 *
 * Every material reads `settings.hydraulicMarionette` in
 * `userData.sync(state)`.
 */

const ID = config.id;
/** Strings + feed line tips the pool listens to. */
export const POOL_TIPS = 8;

/* -------------------------------------------------------------------- */
/* The liquid                                                           */
/* -------------------------------------------------------------------- */

const LIQUID_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vGlow;
  #ifdef USE_GLOW_ATTR
  attribute float aGlow;
  #endif
  void main() {
    vUv = uv;
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 world = modelMatrix * local;
    vWorld = world.xyz;
    // Inverse-transpose: the bars are scaled non-uniformly (length vs girth).
    vNormalW = normalize(transpose(inverse(mat3(modelMatrix))) * n);
    #ifdef USE_GLOW_ATTR
      vGlow = aGlow;
    #else
      vGlow = 0.0;
    #endif
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const LIQUID_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uShaderIntensity;
  uniform float uGlobalGlow;
  uniform sampler2D uEnvMap;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uEnv;
  uniform float uFresnelPow;
  uniform float uRim;
  uniform float uFlow;
  uniform float uRipple;
  uniform float uCaustic;
  uniform float uGlow;
  uniform float uTugGlow;
  uniform float uFlash;
  uniform float uDissolve;
  uniform float uEdge;
  uniform float uScale;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vGlow;

  ${noiseGLSL}
  ${commonGLSL}

  vec2 equirect(vec3 d) {
    return vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
  }

  void main() {
    float t = uTime * uFlow;
    // Flowing surface: noise scrolled along the jet (uv.x runs along every
    // bar and down every string), sampled in world space so neighbouring
    // pieces agree where they meet.
    vec3 q = vWorld * 2.6 * uScale + vec3(0.0, -t * 0.9, 0.0);
    vec3 flow = vec3(snoise(q + vec3(vUv.x * 4.0 - t, 0.0, 0.0)),
                     snoise(q + vec3(5.1, 2.3 + vUv.x * 4.0 - t, 1.7)),
                     snoise(q + vec3(1.3, 7.7, 3.1 - t)));
    vec3 N = normalize(vNormalW + flow * uRipple * 0.45);

    // Rain-out on the exit: noise mask with a foam edge.
    float dn = snoise01(vWorld * 3.1 * uScale + vec3(0.0, t * 0.6, 0.0));
    vec2 dm = dissolveMask(dn, uDissolve, uEdge);
    if (dm.x < 0.5) discard;

    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    vec3 L = normalize(uLightDir);
    float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);

    // Thick water seen straight on is deep; the rim, thin, goes pale.
    float thickness = pow(ndv, 1.4);
    vec3 water = mix(uBody, uDeep, 0.25 + thickness * 0.6);
    water *= 0.35 + 0.65 * wrap;

    float fres = pow(1.0 - ndv, uFresnelPow);
    vec3 env = texture2D(uEnvMap, equirect(reflect(-V, N))).rgb;
    vec3 H = normalize(L + V);
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), uGloss) * uSpecular;

    // Caustic veins: the light focused through the moving water.
    vec3 cp = vWorld * 3.4 * uScale + vec3(0.0, -t * 1.3, t * 0.4);
    float vein = pow(1.0 - abs(snoise(cp)), 7.0) + 0.6 * pow(1.0 - abs(snoise(cp * 1.9 + 3.0)), 9.0);

    vec3 col = water;
    col += env * uEnv * (0.15 + 0.85 * fres);
    col += uTint * fres * uRim;
    col += uTint * vein * uCaustic * (1.0 - fres) * 0.6 * uShaderIntensity;
    col += uBody * uGlow;
    col += uCore * spec;
    // A pulse pumped down a string lights it from inside.
    col += mix(uTint, uCore, clamp(vGlow - 0.6, 0.0, 1.0)) * vGlow * uTugGlow;
    col += uCore * uFlash * (0.3 + fres);
    col += uTint * dm.y * 3.0;
    // Same soft ceiling the originals use, so sliders keep biting at the top.
    col /= 1.0 + col * 0.12;
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

/**
 * The water the control and its strings are made of. Opaque, lit, on the
 * world layer. `instanced` for the bulbs and hooks; `glow` for the strings
 * (reads the per-vertex pumped pulse).
 */
export function createLiquidMaterial({ glow = false, side = FrontSide } = {}) {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side,
    toneMapped: false,
    defines: glow ? { USE_GLOW_ATTR: '' } : {},
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uCore: { value: new Color('#f2feff') },
      uTint: { value: new Color('#8fe9ff') },
      uBody: { value: new Color('#1c8ad4') },
      uDeep: { value: new Color('#04223f') },
      uGloss: { value: 110 },
      uSpecular: { value: 2.4 },
      uEnv: { value: 0.9 },
      uFresnelPow: { value: 2.6 },
      uRim: { value: 1.1 },
      uFlow: { value: 1.6 },
      uRipple: { value: 0.45 },
      uCaustic: { value: 0.9 },
      uGlow: { value: 0.35 },
      uTugGlow: { value: 2.4 },
      uFlash: { value: 0 },
      uDissolve: { value: 0 },
      uEdge: { value: 0.09 },
      uScale: { value: 1 },
      uOpacity: { value: 1 },
    }),
    vertexShader: LIQUID_VERTEX,
    fragmentShader: LIQUID_FRAGMENT,
  });
  /** @param {object} s { flash, dissolve } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
    u.uGloss.value = c.liquidGloss;
    u.uSpecular.value = c.liquidSpecular * g.glow;
    u.uEnv.value = c.liquidEnv;
    u.uFresnelPow.value = Math.max(0.2, c.liquidFresnel / Math.max(0.05, g.fresnel));
    u.uRim.value = c.liquidRim * g.glow;
    u.uFlow.value = c.liquidFlow * g.noiseSpeed;
    u.uRipple.value = c.liquidRipple * g.noiseStrength * (0.5 + 0.5 * g.turbulence);
    u.uCaustic.value = c.liquidCaustic;
    u.uGlow.value = c.liquidGlow * g.glow;
    u.uTugGlow.value = c.tugGlow * g.glow;
    u.uFlash.value = s.flash;
    u.uDissolve.value = s.dissolve;
    u.uEdge.value = c.dissolveEdge;
    u.uScale.value = g.noiseFrequency;
    u.uOpacity.value = g.opacity;
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

const POOL_FRAGMENT = /* glsl */ `
  #define TIPS ${POOL_TIPS}
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform vec4  uTips[TIPS];   // xy: tip in pool space (−1..1), z: tug energy, w: ring clock
  uniform float uRadius;       // metres, for the ring spacing
  uniform float uSpread;       // 0..1 the spill has spread
  uniform float uDrain;        // 0..1 drained on the exit
  uniform float uSlam;         // slam ring radius 0..1, −1 when none
  uniform float uOpacity;
  uniform float uRipple;
  uniform float uRingFreq;
  uniform float uRingSpeed;
  uniform float uFoam;
  uniform float uSpecular;
  uniform float uGlow;
  uniform float uClock;
  uniform float uScale;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}

  // Height of the water surface at p (pool space): rings off every tip.
  float surface(vec2 p) {
    float h = 0.0;
    for (int i = 0; i < TIPS; i++) {
      vec4 tip = uTips[i];
      if (tip.z <= 0.001) continue;
      float d = length(p - tip.xy) * uRadius;
      float ring = sin(d * uRingFreq - tip.w * uRingSpeed * uRingFreq * 0.35);
      h += ring * tip.z * exp(-d * 0.9) * smoothstep(0.0, 0.25, d);
    }
    if (uSlam >= 0.0) {
      float r = length(p);
      h += exp(-pow((r - uSlam) * 7.0, 2.0)) * (1.0 - uSlam) * 2.5;
    }
    return h * uRipple;
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    // A spill, not a disc: the edge is pushed about by noise.
    float edgeN = fbm3(vec3(p * 2.2 * uScale, uClock * 0.05)) - 0.5;
    float reach = uSpread * (0.92 + edgeN * 0.22) * (1.0 - uDrain * 1.05);
    float pool = 1.0 - smoothstep(reach - 0.06, reach, r);
    // Drains in patches, not as a shrinking circle.
    float patchN = snoise01(vec3(p * 3.0 * uScale, 4.1));
    pool *= 1.0 - smoothstep(patchN - 0.1, patchN + 0.02, uDrain * 1.15);
    if (pool < 0.003) discard;

    // A normal from the ripple field (finite differences).
    float e = 0.012;
    float h = surface(p);
    float hx = surface(p + vec2(e, 0.0)) - h;
    float hy = surface(p + vec2(0.0, e)) - h;
    vec3 n = normalize(vec3(-hx * 6.0, 1.0, -hy * 6.0));
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float spec = pow(clamp(dot(n, normalize(L + V)), 0.0, 1.0), 60.0) * uSpecular;
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);

    float rim = smoothstep(reach - 0.14, reach - 0.02, r) * pool;
    float lace = smoothstep(0.55, 0.8, snoise01(vec3(p * 9.0 * uScale, uClock * 0.4)));
    float foam = (rim * (0.6 + 0.6 * lace) + clamp(h, 0.0, 1.0) * lace * 0.6) * uFoam;

    // Deep everywhere it is wet; body where the water is stirred.
    float stir = clamp(abs(h) * 1.4, 0.0, 1.0);
    vec3 col = mix(uDeep, uBody, stir * 0.8 + 0.12);
    col += uTint * (fres * 0.5 + foam);
    col += uCore * spec;
    col *= uGlow;
    float alpha = pool * clamp(uOpacity * (0.75 + 0.25 * stir) + foam * 0.5 + spec * 0.3, 0.0, 1.0);
    gl_FragColor = vec4(col * uGlobalGlow, alpha);
  }
`;

/** The pool under the control. Normal blending: it darkens the floor. */
export function createPoolMaterial() {
  const tips = [];
  for (let i = 0; i < POOL_TIPS; i++) tips.push(new Vector4());
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTips: { value: tips },
      uRadius: { value: 3.4 },
      uSpread: { value: 0 },
      uDrain: { value: 0 },
      uSlam: { value: -1 },
      uOpacity: { value: 0.8 },
      uRipple: { value: 1 },
      uRingFreq: { value: 9 },
      uRingSpeed: { value: 3.2 },
      uFoam: { value: 0.75 },
      uSpecular: { value: 1.5 },
      uGlow: { value: 1.1 },
      uClock: { value: 0 },
      uScale: { value: 1 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: POOL_FRAGMENT,
  });
  /** @param {object} s { radius, spread, drain, slam, clock } — tips are written directly to `uTips`. */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = s.radius;
    u.uSpread.value = s.spread;
    u.uDrain.value = s.drain;
    u.uSlam.value = s.slam;
    u.uClock.value = s.clock;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uRipple.value = c.poolRipple * g.noiseStrength;
    u.uRingFreq.value = c.poolRingFreq;
    u.uRingSpeed.value = c.poolRingSpeed * g.animationSpeed;
    u.uFoam.value = c.poolFoam;
    u.uSpecular.value = c.poolSpecular * g.glow;
    u.uGlow.value = c.poolGlow * g.glow;
    u.uScale.value = g.noiseFrequency;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Splash crowns                                                        */
/* -------------------------------------------------------------------- */

const CROWN_VERTEX = /* glsl */ `
  attribute vec2 aCrown;      // x progress 0..1 (≥ 1 is spent), y seed
  varying vec2 vUv;
  varying float vLife;
  varying vec3 vNormalW;
  varying vec3 vView;
  uniform float uTime;
  ${noiseGLSL}
  void main() {
    vUv = uv;
    float life = aCrown.x;
    vLife = life;
    vec3 p = position;
    float a = uv.x * 6.2831853;
    // The rim is torn into spikes: a few tall fingers, a lot of small ones.
    float spikes = pow(abs(sin(a * 5.0 + aCrown.y * 11.0)), 3.0) * 0.35 +
                   pow(abs(sin(a * 13.0 + aCrown.y * 5.0)), 4.0) * 0.18 +
                   snoise(vec3(a * 1.5, aCrown.y * 7.0, 0.0)) * 0.12;
    float h = uv.y;
    // Rises fast, flares out, then the wall falls back as it thins.
    float rise = sin(min(life, 1.0) * 3.1415927) * (1.0 + spikes * h * 0.8);
    float flare = 1.0 + life * 0.9 + h * life * 0.6;
    p.xz *= flare;
    p.y *= rise;
    vec4 local = vec4(p, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 world = modelMatrix * local;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vView = cameraPosition - world.xyz;
    if (life <= 0.0 || life >= 1.0) world.xyz = vec3(0.0, -1000.0, 0.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CROWN_FRAGMENT = /* glsl */ `
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying float vLife;
  varying vec3 vNormalW;
  varying vec3 vView;
  ${commonGLSL}
  void main() {
    float rim = fresnelTerm(vView, vNormalW, 1.5, 1.0);
    // Thin sheet near the lip, solid water at the foot.
    float sheet = gradient4(vec3(1.0), vec3(0.8), vec3(0.45), vec3(0.15), vUv.y).r;
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, 1.0 - vUv.y * 0.8 + vLife * 0.4);
    col += uCore * rim * 0.6;
    float alpha = (0.35 + 0.65 * rim) * sheet * (1.0 - smoothstep(0.55, 1.0, vLife)) * uOpacity;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** Instanced splash crowns. Additive; vertex-shaped, so VFX layer only. */
export function createCrownMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
      uGlow: { value: 1.6 },
      uOpacity: { value: 1 },
    }),
    vertexShader: CROWN_VERTEX,
    fragmentShader: CROWN_FRAGMENT,
  });
  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
    u.uGlow.value = c.crownGlow * g.glow;
    u.uOpacity.value = g.opacity;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens                                                             */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uRefract;     // the pool's ripples bending the floor
  uniform float uShock;       // the slam's pressure ring
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
    float body = 1.0 - smoothstep(0.55, 1.0, r);
    float ripples = sin(r * 26.0 - uClock * 5.0);
    vec3 np = vec3(q * 3.0 * uScale, uClock * 0.5);
    vec2 n = vec2(snoise(np), snoise(np + vec3(5.2, 1.3, 7.7)));
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    vec2 dir = (radial * ripples * 0.6 + n * 0.5) * body * uRefract + radial * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uRefract * 0.6 + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc over the pool. Opaque on purpose: the offset
 * buffer wants the proxy's own value, and an opaque proxy keeps the
 * expansion's "transparent ⇒ VFX layer" routing from pulling it out of the
 * warp pass.
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
      uRefract: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { refract, shock, wave, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uRefract.value = s.refract * c.lensStrength * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
