import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Vitriol Rain — the bespoke shaders the storm is drawn with.
 *
 *  - **the seed** — a camera-facing glob of light with a boiling fringe,
 *    lobbed from the hand to the sky over the circle.
 *  - **the cloud** — a sphere squashed into a thick lens and displaced in the
 *    vertex stage: cauliflower lumps on top, *mammatus* bulges hanging off the
 *    belly (which is what makes a sick sky look sick). The top is a dark
 *    olive, the belly lit from inside by a roiling, throbbing toxic glow, the
 *    silhouette rim-lit. It breaks up on a noise threshold when it is spent.
 *  - **the rain** — hundreds of instanced streaks, every one placed in the
 *    vertex stage: a disc point, a fall phase on an integrated clock, a
 *    per-cycle coin toss against the density so the rain thins drop by drop
 *    rather than vanishing, a slant, and a cylindrical billboard so a streak
 *    is never seen edge-on.
 *  - **the pitted floor** — a disc on the floor. A grid of pit sites; each
 *    one is *born* at its own moment of the rain (hash × rate), opens with a
 *    bright splash ring, and leaves a hole with hot acid in it that cools to
 *    a dark eaten pock. Over that, a finer grid of raindrop splash rings on
 *    their own clocks, and a wet acid sheen that spreads with the rain.
 *  - **the shimmer** — an open cylinder round the circle on
 *    `LAYER.DISTORTION`: the air bending as the acid fumes.
 *
 * Every material reads `settings.vitriol` in `userData.sync(state)`.
 */

const ID = 'vitriol';

/* -------------------------------------------------------------------- */
/* The seed                                                             */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2  vUv;
  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SEED_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  uniform vec3  uColorCore;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    float r = length(vUv);
    if (r > 1.0 || uIntensity <= 0.001) discard;
    float a = atan(vUv.y, vUv.x);
    float fringe = 0.45 + 0.2 * snoise(vec3(cos(a) * 2.0, sin(a) * 2.0, uTime * 3.0 + uSeed));
    float body = 1.0 - smoothstep(fringe - 0.08, fringe, r);
    float core = exp(-r * r * 18.0);
    float halo = exp(-r * 3.5) * (1.0 - smoothstep(0.7, 1.0, r));
    vec3 col = uColorHalo * (body * 1.2 + halo) + uColorCore * core * 2.5;
    float m = clamp(body + halo + core, 0.0, 1.0);
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, m);
  }
`;

/** The glob of vitriol lobbed to the sky. */
export function createSeedMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 0.4 },
      uSeed: { value: 0 },
      uIntensity: { value: 1 },
      uColorCore: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: SEED_FRAGMENT
  });
  /** @param {object} state { center, scale, intensity, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.02, c.seedSize * 2.2 * state.scale);
    u.uSeed.value = state.seed;
    u.uIntensity.value = state.intensity * c.seedGlow * g.glow;
    u.uColorCore.value.copy(getColor(c.colorSeedCore));
    u.uColorHalo.value.copy(getColor(c.colorSeedHalo));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The cloud                                                            */
/* -------------------------------------------------------------------- */

const CLOUD_VERTEX = /* glsl */ `
  uniform vec3  uCenter;      // the middle of its belly
  uniform float uRadius;
  uniform float uThick;
  uniform float uGrow;
  uniform float uLump;
  uniform float uLumpScale;
  uniform float uMamma;
  uniform float uMammaScale;
  uniform float uChurn;       // integrated
  uniform float uSeed;

  varying vec3  vLocal;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  varying float vBelly;
  varying float vBulge;

  ${noiseGLSL}

  void main() {
    vec3 p = normalize(position);
    // A lens: flat-ish belly, domed top.
    float top = max(p.y, 0.0);
    float bot = max(-p.y, 0.0);
    vec3 shape = vec3(p.x * uRadius, (top * 0.8 - bot * 0.2) * uThick, p.z * uRadius);
    vec3 q = vec3(p.x * uRadius, p.y * uThick, p.z * uRadius);
    float lump = fbm3(q * uLumpScale + vec3(uChurn * 0.6, uChurn * 0.3, uSeed)) * uLump;
    // Mammatus: round pouches hanging off the belly.
    float pouch = snoise(vec3(q.x * uMammaScale, uSeed * 1.7, q.z * uMammaScale) + vec3(0.0, uChurn * 0.4, 0.0));
    float bulge = smoothstep(0.05, 0.75, pouch) * bot * uMamma;
    vec3 n = normalize(vec3(p.x / max(uRadius, 0.01), p.y / max(uThick, 0.01), p.z / max(uRadius, 0.01)));
    vec3 local = shape + n * lump * (0.4 + 0.6 * top) - vec3(0.0, bulge, 0.0);
    // The edge thins so the silhouette is not a hard ellipse.
    float edge = 1.0 - abs(p.y);
    local.xz *= 1.0 + 0.12 * snoise(vec3(p.xz * 2.0, uSeed + uChurn * 0.2)) * edge;
    vec3 world = uCenter + local * uGrow;

    vLocal = q;
    vNormalW = normalize(n + vec3(0.0, -bulge, 0.0));
    vViewDir = cameraPosition - world;
    vBelly = bot;
    vBulge = bulge / max(uMamma, 0.01);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const CLOUD_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uChurn;
  uniform float uOpacity;
  uniform float uBellyGlow;
  uniform float uRimLight;
  uniform float uPulse;       // integrated throb phase
  uniform float uRain;        // 0..1 how hard it is pouring
  uniform float uBreak;       // 0 whole .. 1 gone
  uniform vec3  uColorTop;
  uniform vec3  uColorMid;
  uniform vec3  uColorBelly;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3  vLocal;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  varying float vBelly;
  varying float vBulge;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float fres = pow(1.0 - abs(dot(N, V)), 2.5);

    float roil = fbm4(vLocal * 0.55 + vec3(0.0, -uChurn, uSeed)) * 0.5 + 0.5;
    vec3 col = mix(uColorMid, uColorTop, smoothstep(-0.2, 0.7, N.y));
    col *= 0.7 + 0.6 * roil;

    // The belly is lit from inside: throbs wander through it.
    float throb = pow(0.5 + 0.5 * sin(uPulse * 6.2831853 + roil * 5.0 + vLocal.x * 0.4), 3.0);
    float belly = smoothstep(0.0, 0.6, vBelly) * (0.35 + 0.65 * roil) * (0.6 + 0.4 * uRain + throb * 0.6);
    col += uColorBelly * belly * uBellyGlow * uShaderIntensity * (0.6 + 0.6 * vBulge);
    col += uColorRim * fres * uRimLight;

    float a = uOpacity * (1.0 - fres * 0.45);
    // Breaking up: holes eat through it on noise, with a glowing fringe.
    float n = snoise(vLocal * 0.7 + vec3(uSeed, uChurn * 0.5, 0.0)) * 0.5 + 0.5;
    float thr = uBreak * 1.15 - 0.08;
    float keep = uBreak <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.15, n);
    float fringe = uBreak <= 0.0 ? 0.0 : (1.0 - smoothstep(thr + 0.0, thr + 0.12, n)) * keep;
    col += uColorBelly * fringe * 1.5;
    a *= keep;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The sick cloud. */
export function createCloudMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 5 },
      uThick: { value: 1.5 },
      uGrow: { value: 1 },
      uLump: { value: 0.5 },
      uLumpScale: { value: 0.9 },
      uMamma: { value: 0.6 },
      uMammaScale: { value: 1.4 },
      uChurn: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 0.9 },
      uBellyGlow: { value: 2.5 },
      uRimLight: { value: 0.8 },
      uPulse: { value: 0 },
      uRain: { value: 0 },
      uBreak: { value: 0 },
      uColorTop: { value: new Color() },
      uColorMid: { value: new Color() },
      uColorBelly: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: CLOUD_VERTEX,
    fragmentShader: CLOUD_FRAGMENT
  });
  /** @param {object} state { center, grow, churn, pulse, rain, breakUp, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uRadius.value = Math.max(0.3, c.zoneRadius * c.cloudRadius);
    u.uThick.value = Math.max(0.1, c.cloudThickness);
    u.uGrow.value = state.grow;
    u.uLump.value = c.lumpAmount * g.noiseStrength;
    u.uLumpScale.value = c.lumpScale * g.noiseFrequency;
    u.uMamma.value = c.mammaAmount * g.noiseStrength;
    u.uMammaScale.value = c.mammaScale * g.noiseFrequency;
    u.uChurn.value = state.churn;
    u.uSeed.value = state.seed;
    u.uOpacity.value = c.cloudOpacity * g.opacity;
    u.uBellyGlow.value = c.bellyGlow * g.glow;
    u.uRimLight.value = c.rimLight * g.fresnel;
    u.uPulse.value = state.pulse;
    u.uRain.value = state.rain;
    u.uBreak.value = state.breakUp;
    u.uColorTop.value.copy(getColor(c.colorCloudTop));
    u.uColorMid.value.copy(getColor(c.colorCloudMid));
    u.uColorBelly.value.copy(getColor(c.colorCloudBelly));
    u.uColorRim.value.copy(getColor(c.colorCloudRim));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The rain                                                             */
/* -------------------------------------------------------------------- */

const RAIN_VERTEX = /* glsl */ `
  uniform vec3  uCenter;      // on the floor
  uniform float uRadius;
  uniform float uTop;         // metres the drops start at
  uniform float uClock;       // integrated fall clock, seconds of rain
  uniform float uFall;
  uniform float uStreak;
  uniform float uWidth;
  uniform float uDensity;     // 0..1 coin toss per cycle
  uniform vec2  uSlant;
  uniform float uSeed;

  attribute vec4 aDrop;

  varying vec2  vUv;
  varying float vLive;

  ${noiseGLSL}

  void main() {
    float period = uTop / max(uFall, 0.1);
    float speedJ = 0.85 + 0.3 * aDrop.w;
    float cycle = uClock / max(period, 0.01) * speedJ + aDrop.z;
    float id = floor(cycle);
    float f = fract(cycle);
    // A drop only falls if its cycle began after the rain did, and wins the toss.
    float coin = hash13(vec3(aDrop.xy * 37.0, id + uSeed));
    float live = step(1.0, cycle) * step(coin, uDensity);

    vec2 jitter = (vec2(hash13(vec3(aDrop.xy, id * 1.3 + 2.0)), hash13(vec3(aDrop.yx, id * 0.7 + 5.0))) - 0.5) * 0.35;
    vec2 disc = clamp(aDrop.xy + jitter, -1.0, 1.0);
    float fallen = f * uTop;
    float headY = uTop - fallen;
    vec3 head = uCenter + vec3(disc.x * uRadius, headY, disc.y * uRadius);
    head.xz += uSlant * fallen;
    // The tail trails back up along the slant.
    vec3 tailDir = normalize(vec3(-uSlant.x, 1.0, -uSlant.y));
    float len = min(uStreak, max(fallen, 0.0));
    vec3 along = head + tailDir * position.y * len;
    vec3 toCam = normalize(cameraPosition - along);
    vec3 right = normalize(cross(tailDir, toCam));
    vec3 world = along + right * position.x * uWidth;
    live *= step(0.0, headY);
    vUv = position.xy;
    vLive = live;
    gl_Position = projectionMatrix * viewMatrix * vec4(world * live + (1.0 - live) * vec3(0.0, -50.0, 0.0), 1.0);
  }
`;

const RAIN_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  varying vec2  vUv;
  varying float vLive;
  void main() {
    if (vLive < 0.5) discard;
    float across = 1.0 - abs(vUv.x);
    float m = pow(across, 2.0) * pow(1.0 - vUv.y, 1.5);
    if (m < 0.004) discard;
    gl_FragColor = vec4(uColor * uGlow * m * uGlobalGlow, m);
  }
`;

/** The vitriol itself — additive streaks. */
export function createRainMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 4.8 },
      uTop: { value: 6 },
      uClock: { value: 0 },
      uFall: { value: 14 },
      uStreak: { value: 0.9 },
      uWidth: { value: 0.02 },
      uDensity: { value: 0 },
      uSlant: { value: new Vector2() },
      uSeed: { value: 0 },
      uGlow: { value: 3 },
      uColor: { value: new Color() }
    }),
    vertexShader: RAIN_VERTEX,
    fragmentShader: RAIN_FRAGMENT
  });
  /** @param {object} state { center, top, clock, density, slantX, slantZ, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uRadius.value = Math.max(0.3, c.zoneRadius);
    u.uTop.value = Math.max(0.5, state.top);
    u.uClock.value = state.clock;
    u.uFall.value = Math.max(0.5, c.fallSpeed * g.speed);
    u.uStreak.value = c.streakLength;
    u.uWidth.value = c.streakWidth * g.particleSize;
    u.uDensity.value = state.density;
    u.uSlant.value.x = state.slantX;
    u.uSlant.value.y = state.slantZ;
    u.uSeed.value = state.seed;
    u.uGlow.value = c.rainGlow * g.glow * g.opacity;
    u.uColor.value.copy(getColor(c.colorRain));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The pitted floor                                                     */
/* -------------------------------------------------------------------- */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vXZ;
  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    world.y = 0.018;
    vXZ = position.xy * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;
  uniform float uClock;       // seconds of rain so far
  uniform float uWet;         // 0..1 acid sheen spreading
  uniform float uRain;        // 0..1 how hard it pours now
  uniform float uPitScale;
  uniform float uPitSize;
  uniform float uPitRate;
  uniform float uPitCool;
  uniform float uPitGlow;
  uniform float uSplashScale;
  uniform float uSplashRate;
  uniform float uSplashGlow;
  uniform float uWetGlow;
  uniform float uRagged;
  uniform float uErode;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorHot;
  uniform vec3  uColorAcid;
  uniform vec3  uColorHole;
  uniform vec3  uColorWet;
  uniform vec3  uColorEtched;
  uniform float uGlobalGlow;

  varying vec2 vXZ;

  ${noiseGLSL}

  void main() {
    float r = length(vXZ);
    float a = atan(vXZ.y, vXZ.x);
    float edge = uRadius * (1.0 + uRagged * 0.25 * fbm3(vec3(cos(a) * 1.5, sin(a) * 1.5, uSeed)));
    float inside = 1.0 - smoothstep(edge * 0.9, edge * 1.02, r);
    if (inside <= 0.001) discard;

    // The wet acid sheen spreads from the middle as the rain comes on.
    float wet = (1.0 - smoothstep(uWet * edge * 0.85, uWet * edge * 1.02, r)) * inside;
    float flow = snoise(vec3(vXZ * 1.2, uTime * 0.5 + uSeed)) * 0.5 + 0.5;
    float pocks = smoothstep(0.4, 0.75, fbm3(vec3(vXZ * 4.0, uSeed * 3.0)));

    // Pits: every cell is born at its own moment of the rain.
    vec2 p = vXZ * uPitScale;
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float pitHole = 0.0;
    float pitHot = 0.0;
    float pitRing = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 id = cell + g;
        float h = hash13(vec3(id, uSeed));
        vec2 o = vec2(hash13(vec3(id, 3.1 + uSeed)), hash13(vec3(id, 7.7 + uSeed))) * 0.7 + 0.15;
        float born = h / max(uPitRate, 0.01);
        float age = uClock - born;
        if (age <= 0.0) continue;
        float size = uPitSize * (0.55 + 0.6 * hash13(vec3(id, 11.0)));
        float d = length(g + o - f);
        float open = smoothstep(0.0, 0.25, age);
        float R = size * open;
        float in_ = 1.0 - smoothstep(R * 0.75, R, d);
        pitHole = max(pitHole, in_ * (1.0 - smoothstep(0.0, R * 0.9, d) * 0.35));
        pitHot = max(pitHot, in_ * exp(-age * uPitCool));
        float rr = size * (0.6 + age * 3.5);
        pitRing = max(pitRing, exp(-pow((d - rr) / 0.04, 2.0)) * exp(-age * 4.0));
      }
    }
    pitHole *= inside;
    pitHot *= inside;
    pitRing *= inside;

    // Splash rings: drops striking everywhere, while it pours.
    vec2 v = voronoi2(vXZ * uSplashScale + uSeed);
    float ph = fract(uTime * uSplashRate * (0.7 + 0.6 * v.y) + v.y * 13.0);
    float sr = 0.45 * ph;
    float live = step(v.y, uRain);
    float splash = exp(-pow((v.x - sr) / 0.045, 2.0)) * (1.0 - ph) * live * wet;

    vec3 col = uColorEtched * (1.0 - 0.4 * pocks);
    col = mix(col, uColorWet * (0.8 + 0.4 * flow), wet * 0.85);
    col = mix(col, uColorHole, pitHole);
    vec3 glow = uColorAcid * (wet * uWetGlow * (0.4 + 0.6 * flow) * (0.3 + 0.7 * uRain) + splash * uSplashGlow)
              + mix(uColorAcid, uColorHot, pitHot) * pitHot * uPitGlow
              + uColorHot * pitRing * uSplashGlow;
    col += glow * uGlobalGlow;

    float alpha = max(inside * 0.55 * smoothstep(0.0, 0.3, uWet), max(wet * 0.9, pitHole));
    alpha = max(alpha, max(pitRing, splash));
    float n = snoise(vec3(vXZ * 0.9, uSeed * 5.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.55, n, uErode));
    alpha *= vis * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The floor the vitriol eats. */
export function createPitFloorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 6 },
      uSeed: { value: 0 },
      uRadius: { value: 4.8 },
      uClock: { value: 0 },
      uWet: { value: 0 },
      uRain: { value: 0 },
      uPitScale: { value: 1.5 },
      uPitSize: { value: 0.3 },
      uPitRate: { value: 0.5 },
      uPitCool: { value: 0.9 },
      uPitGlow: { value: 3 },
      uSplashScale: { value: 3 },
      uSplashRate: { value: 2 },
      uSplashGlow: { value: 2 },
      uWetGlow: { value: 0.5 },
      uRagged: { value: 0.35 },
      uErode: { value: 0.7 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorHot: { value: new Color() },
      uColorAcid: { value: new Color() },
      uColorHole: { value: new Color() },
      uColorWet: { value: new Color() },
      uColorEtched: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });
  /** @param {object} state { center, clock, wet, rain, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    const R = Math.max(0.3, c.zoneRadius);
    u.uCenter.value.copy(state.center);
    u.uSize.value = R * (1.15 + c.edgeRagged * 0.3);
    u.uSeed.value = state.seed;
    u.uRadius.value = R;
    u.uClock.value = state.clock;
    u.uWet.value = state.wet;
    u.uRain.value = state.rain;
    u.uPitScale.value = c.pitScale * g.noiseFrequency;
    u.uPitSize.value = c.pitSize;
    u.uPitRate.value = c.pitRate;
    u.uPitCool.value = c.pitCool;
    u.uPitGlow.value = c.pitGlow * g.glow;
    u.uSplashScale.value = c.splashScale * g.noiseFrequency;
    u.uSplashRate.value = c.splashRate * g.animationSpeed;
    u.uSplashGlow.value = c.splashGlow * g.glow;
    u.uWetGlow.value = c.wetGlow * g.glow;
    u.uRagged.value = c.edgeRagged * g.randomness;
    u.uErode.value = c.erode;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorHot.value.copy(getColor(c.colorPitHot));
    u.uColorAcid.value.copy(getColor(c.colorPitAcid));
    u.uColorHole.value.copy(getColor(c.colorPitHole));
    u.uColorWet.value.copy(getColor(c.colorWet));
    u.uColorEtched.value.copy(getColor(c.colorEtched));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The shimmer                                                          */
/* -------------------------------------------------------------------- */

const SHELL_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;
  uniform float uHeight;
  varying vec2 vP;
  void main() {
    float a = position.x * 6.2831853;
    vec3 world = uCenter + vec3(cos(a) * uRadius, position.y * uHeight, sin(a) * uRadius);
    vP = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SHIMMER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2 vP;
  ${noiseGLSL}
  void main() {
    vec3 np = vec3(vP.x * 18.0 * uScale, vP.y * 3.0 * uScale - uTime * uSpeed, uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(9.1, 3.7, 1.3)) * 0.5 + 0.5);
    float mask = smoothstep(0.0, 0.15, vP.y) * (1.0 - smoothstep(0.4, 1.0, vP.y));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(n * 0.5 + 0.5, strength, mask);
  }
`;

/** The air bending over the fuming circle — LAYER.DISTORTION. */
export function createShimmerMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 4 },
      uHeight: { value: 2 },
      uStrength: { value: 0 },
      uScale: { value: 1.5 },
      uSpeed: { value: 1.4 },
      uSeed: { value: 0 }
    }),
    vertexShader: SHELL_VERTEX,
    fragmentShader: SHIMMER_FRAGMENT
  });
  /** @param {object} state { center, amount, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uRadius.value = Math.max(0.3, c.zoneRadius * 0.85);
    u.uHeight.value = Math.max(0.1, c.shimmerHeight);
    u.uStrength.value = c.shimmerStrength * g.distortion * state.amount;
    u.uScale.value = c.shimmerScale * g.noiseFrequency;
    u.uSpeed.value = c.shimmerSpeed * g.noiseSpeed;
    u.uSeed.value = state.seed;
  };
  return material;
}
