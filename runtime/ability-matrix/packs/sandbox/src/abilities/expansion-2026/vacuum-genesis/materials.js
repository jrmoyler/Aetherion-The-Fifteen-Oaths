import { AdditiveBlending, BackSide, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { LIP_T, profileGLSL } from './geometry.js';
import config from './config.js';

/**
 * Vacuum Genesis — the bespoke shaders.
 *
 *  - **the seed** — a faceted spindle with a black heart: the facets facing
 *    you are vacuum-dark, the silhouette burns violet → white. Opaque.
 *  - **the halo** — an accretion swirl round the seed in flight.
 *  - **the skin** (hero) — the pocket's surface, *placed* in the vertex
 *    shader from the live radius / height / lip (`profileGLSL`), inflated with
 *    an overshoot, rippled by standing waves that ring down. Fresnel rim on
 *    the four-stop ramp, a thin-film sheen that slides with the film's noise
 *    thickness, a hot meniscus where it meets the floor, Voronoi fractures
 *    that open just before the shell is born, and a crown-down noise dissolve.
 *  - **the void** — the same bubble seen from inside (back faces), *normal*
 *    blended: it darkens what is behind the pocket, so the circle reads as a
 *    hole in the world, with a violet nebula and stars being born in it.
 *  - **the web** — tubes whose spines are placed on the skin from (azimuth,
 *    elevation) and whose cross-section is offset in the skin's frame; they
 *    grow up the dome with a white-hot tip, then carry pulses.
 *  - **the knots** — fresnel condensation knots where the threads meet.
 *  - **the floor** — the stripped floor: a dark vacuum stain, streaks where
 *    the air was dragged out, a burning tear at the lip, and cracks of new
 *    crystal spreading underneath while the web grows.
 *  - **the lens** — the skin again on `LAYER.DISTORTION`: rim refraction and
 *    a pressure pulse at the birth and the rupture.
 *
 * Every material reads `settings.vacuumGenesis` in `userData.sync(state)`.
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

/** Pocket placement uniforms shared in shape (not identity) by skin, void, lens and web. */
const pocketUniforms = () => ({
  uRadius: { value: 3.4 },
  uHeight: { value: 2.8 },
  uLip: { value: 0.16 },
  uInflate: { value: 1 },
  uClock: { value: 0 },
  uWobble: { value: 0 },
  uModes: { value: 5 },
  uWobbleSpeed: { value: 3 },
  uShrink: { value: 1 },
});

/** Mirror the pocket shape from a state object every frame. */
function syncPocket(u, s) {
  u.uRadius.value = s.radius;
  u.uHeight.value = s.height;
  u.uLip.value = s.lip;
  u.uInflate.value = s.inflate;
  u.uClock.value = s.clock;
  u.uWobble.value = s.wobble;
  u.uModes.value = s.modes;
  u.uWobbleSpeed.value = s.wobbleSpeed;
}

const POCKET_PLACE = /* glsl */ `
  uniform float uRadius;
  uniform float uHeight;
  uniform float uLip;
  uniform float uInflate;
  uniform float uClock;
  uniform float uWobble;
  uniform float uModes;
  uniform float uWobbleSpeed;
  uniform float uShrink;
  ${profileGLSL}
  vec3 pocketPos(float az, float t) {
    vec2 pr = pocketProfile(clamp(t, 0.0, 1.0), uRadius, uHeight, uLip);
    return vec3(cos(az) * pr.x, pr.y, sin(az) * pr.x);
  }
  // Outward normal of the undisplaced skin, by central differences.
  vec3 pocketNormal(float az, float t, vec3 p) {
    vec3 up = pocketPos(az, t + 0.004) - pocketPos(az, t - 0.004);
    vec3 east = pocketPos(az + 0.02, t) - p;
    vec3 n = cross(up, east);
    float l = length(n);
    return l > 1e-6 ? n / l : vec3(0.0, 1.0, 0.0);
  }
`;

const POCKET_VERTEX = /* glsl */ `
  ${POCKET_PLACE}
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vViewNormal;
  void main() {
    vUv = uv;
    float az = uv.x * 6.2831853;
    float t = uv.y;
    vec3 p = pocketPos(az, t);
    vec3 n = pocketNormal(az, t, p);
    p += n * pocketWobble(az, t, uClock, uWobble, uModes, uWobbleSpeed);
    p *= uInflate * uShrink;
    vLocal = p / max(uRadius, 0.01);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * n);
    vViewNormal = normalize(normalMatrix * n);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

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

const LIT_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vObj;
  void main() {
    mat4 local = mat4(1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix;
    #endif
    vObj = position;
    vec4 world = modelMatrix * local * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * mat3(local) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/** Ramp uniforms (four stops + film). */
const rampUniforms = () => ({
  uCore: { value: new Color('#f6efff') },
  uTint: { value: new Color('#c9a9ff') },
  uBody: { value: new Color('#7b3dff') },
  uDeep: { value: new Color('#12082c') },
  uFilm: { value: new Color('#6fe6ff') },
});
function syncRamp(u, c) {
  u.uCore.value.copy(getColor(c.colorCore));
  u.uTint.value.copy(getColor(c.colorTint));
  u.uBody.value.copy(getColor(c.colorBody));
  u.uDeep.value.copy(getColor(c.colorDeep));
  if (u.uFilm) u.uFilm.value.copy(getColor(c.colorFilm));
}
const RAMP_GLSL = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  uniform vec3 uFilm;
`;

/* A Voronoi edge distance (F2 − F1) for fractures. */
const CRACK_GLSL = /* glsl */ `
  float crackEdge(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    }
    return sqrt(d2) - sqrt(d1);
  }
`;

/* -------------------------------------------------------------------- */
/* The seed and its halo                                                */
/* -------------------------------------------------------------------- */

const SEED_FRAGMENT = /* glsl */ `
  ${RAMP_GLSL}
  uniform float uGlow;
  uniform float uPulse;
  uniform float uFresnel;
  uniform float uGlobalGlow;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vObj;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, 1.6, uFresnel);
    // Each facet flickers on its own: a hash of its (flat) normal.
    float facet = hash13(floor(normalize(vNormalW) * 7.0 + 0.5));
    vec3 col = uDeep * 0.6;
    col = mix(col, uBody, smoothstep(0.15, 0.6, rim));
    col = mix(col, uTint, smoothstep(0.55, 0.95, rim));
    col += uCore * pow(rim, 3.0) * (1.4 + uPulse);
    col += uBody * facet * 0.25 * (0.5 + 0.5 * uPulse);
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, 1.0);
  }
`;

/** The faceted seed. Opaque: its black heart must hide what is behind it. */
export function createSeedMaterial() {
  const material = new ShaderMaterial({
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...rampUniforms(),
      uGlow: { value: 2 },
      uPulse: { value: 0 },
      uFresnel: { value: 1 },
    }),
    vertexShader: LIT_VERTEX,
    fragmentShader: SEED_FRAGMENT,
  });
  /** @param {object} s { pulse } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncRamp(u, c);
    u.uGlow.value = c.seedGlow * g.glow;
    u.uPulse.value = s.pulse;
    u.uFresnel.value = g.fresnel;
  };
  return material;
}

const HALO_FRAGMENT = /* glsl */ `
  ${RAMP_GLSL}
  uniform float uSpin;
  uniform float uFade;
  uniform float uGlow;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    // Two spiral arms of accreting light round a dark throat.
    float arms = pow(0.5 + 0.5 * cos(2.0 * a - log(max(r, 0.02)) * 5.0 + uSpin), 3.0);
    float disc = smoothstep(0.22, 0.38, r) * (1.0 - smoothstep(0.6, 1.0, r));
    float ring = exp(-abs(r - 0.3) * 28.0);
    float grain = 0.7 + 0.3 * snoise(vec3(p * 5.0, uSpin * 0.2));
    float i = (disc * arms * grain * 0.9 + ring * 1.4) * uFade;
    vec3 col = mix(uBody, uTint, arms) + uCore * ring * 1.5;
    gl_FragColor = vec4(col * i * uGlow * uGlobalGlow, clamp(i, 0.0, 1.0));
  }
`;

/** The seed's accretion halo. Additive, camera-facing. */
export function createHaloMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({ ...rampUniforms(), uSpin: { value: 0 }, uFade: { value: 1 }, uGlow: { value: 1 } }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: HALO_FRAGMENT,
  });
  /** @param {object} s { spin, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncRamp(u, c);
    u.uSpin.value = s.spin;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.seedGlow * g.glow;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The skin                                                             */
/* -------------------------------------------------------------------- */

const SKIN_FRAGMENT = /* glsl */ `
  ${RAMP_GLSL}
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFresnelPow;
  uniform float uFresnelScale;
  uniform float uFilmStrength;
  uniform float uFilmScale;
  uniform float uFade;
  uniform float uFlash;       // white-hot flush at the birth
  uniform float uCrack;       // 0..1 fractures opening before the rupture
  uniform float uDissolve;    // 0..1 crown-down dissolve on the exit
  uniform float uEdge;
  uniform float uGrowth;      // web growth, warms the skin under it
  uniform float uNoiseScale;
  uniform float uNoiseAmt;
  uniform float uClock;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  ${commonGLSL}
  ${CRACK_GLSL}
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = abs(dot(N, V));
    float rim = clamp(pow(1.0 - ndv, uFresnelPow) * uFresnelScale, 0.0, 1.5);

    // Thin film: a noisy thickness drifts over the skin; the interference
    // colour slides between film and body as thickness and angle change.
    float thick = fbm3(vLocal * uFilmScale * uNoiseScale + vec3(0.0, uClock * 0.12, 0.0)) * uNoiseAmt;
    float phase = thick * 9.0 + ndv * 5.0 + uClock * 0.4;
    float band = 0.5 + 0.5 * cos(phase);
    float band2 = 0.5 + 0.5 * cos(phase * 1.63 + 2.1);
    vec3 film = mix(mix(uBody, uFilm, band), uTint, band2 * 0.5);
    float sheen = pow(band, 3.0) * (0.25 + 0.75 * (1.0 - ndv));

    // Hot meniscus where the skin meets the floor.
    float lip = 1.0 - smoothstep(0.0, ${(LIP_T * 1.3).toFixed(4)}, vUv.y);

    // Fractures that open along the skin before the shell is born.
    vec2 cp = vec2(vUv.x * 14.0, vUv.y * 7.0);
    float e = crackEdge(cp + vec2(0.0, 0.0));
    float crack = (1.0 - smoothstep(0.0, 0.06 + 0.06 * uCrack, e)) * uCrack;

    // Crown-down noise dissolve with a burning edge.
    float dn = mix(snoise01(vLocal * 3.1 + vec3(1.7)), 1.0 - vUv.y, 0.55);
    float keep = smoothstep(uDissolve - 0.004, uDissolve + 0.004, dn);
    float burn = (1.0 - smoothstep(uDissolve, uDissolve + uEdge, dn)) * keep * step(0.001, uDissolve);

    vec3 col = gradient4(uCore, uTint, uBody, uDeep, 1.0 - clamp(rim, 0.0, 1.0)) * rim;
    col += film * sheen * uFilmStrength * uShaderIntensity;
    col += mix(uBody, uTint, lip) * lip * 1.2;
    col += uBody * uGrowth * 0.12 * (1.0 - ndv);
    col += mix(uTint, uCore, crack) * crack * 3.0;
    col += uCore * burn * 4.0;
    col += uCore * uFlash * (0.4 + rim);
    float a = (rim + sheen * uFilmStrength * 0.35 + lip * 0.6 + 0.04 + crack + burn + uFlash * 0.5) * keep;
    a *= uOpacity * uFade;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * keep * uFade, clamp(a, 0.0, 1.0));
  }
`;

/** The pocket's skin — the hero. Additive, both faces (you see the far wall's rim through it). */
export function createSkinMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      ...pocketUniforms(),
      ...rampUniforms(),
      uGlow: { value: 1.6 },
      uOpacity: { value: 0.85 },
      uFresnelPow: { value: 2.6 },
      uFresnelScale: { value: 1 },
      uFilmStrength: { value: 0.8 },
      uFilmScale: { value: 2.2 },
      uFade: { value: 1 },
      uFlash: { value: 0 },
      uCrack: { value: 0 },
      uDissolve: { value: 0 },
      uEdge: { value: 0.08 },
      uGrowth: { value: 0 },
      uNoiseScale: { value: 1 },
      uNoiseAmt: { value: 1 },
    }),
    vertexShader: POCKET_VERTEX,
    fragmentShader: SKIN_FRAGMENT,
  });
  /** @param {object} s pocket shape + { fade, flash, crack, dissolve, growth } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncPocket(u, s);
    syncRamp(u, c);
    u.uShrink.value = 1;
    u.uGlow.value = c.skinGlow * g.glow;
    u.uOpacity.value = c.skinOpacity * g.opacity;
    u.uFresnelPow.value = c.skinFresnel;
    u.uFresnelScale.value = g.fresnel;
    u.uFilmStrength.value = c.filmStrength;
    u.uFilmScale.value = c.filmScale;
    u.uFade.value = s.fade;
    u.uFlash.value = s.flash;
    u.uCrack.value = s.crack;
    u.uDissolve.value = s.dissolve;
    u.uEdge.value = c.dissolveEdge;
    u.uGrowth.value = s.growth;
    u.uNoiseScale.value = g.noiseFrequency;
    u.uNoiseAmt.value = g.noiseStrength;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The void                                                             */
/* -------------------------------------------------------------------- */

const VOID_FRAGMENT = /* glsl */ `
  ${RAMP_GLSL}
  uniform float uDark;
  uniform float uStars;
  uniform float uDensity;
  uniform float uNebula;
  uniform float uBirth;       // 0..1, how many stars have been born
  uniform float uFade;
  uniform float uDissolve;
  uniform float uClock;
  uniform float uGlow;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = abs(dot(N, V));
    float dn = mix(snoise01(vLocal * 3.1 + vec3(1.7)), 1.0 - vUv.y, 0.55);
    if (dn < uDissolve) discard;

    // The sky behind the pocket, as seen through it: stars on a sphere of
    // directions from the pocket's heart, a drifting violet nebula.
    vec3 dir = normalize(vLocal - vec3(0.0, 0.3, 0.0));
    vec2 sph = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0)));
    vec2 cell = sph * uDensity;
    vec2 id = floor(cell);
    vec2 f = fract(cell) - 0.5;
    float h = hash13(vec3(id, 3.7));
    vec2 jitter = (hash21(h * 91.7) - 0.5) * 0.6;
    float d = length(f - jitter);
    float born = step(h, uBirth * 0.55);
    float twinkle = 0.6 + 0.4 * sin(uClock * (2.0 + 5.0 * h) + h * 40.0);
    float star = exp(-d * d * 260.0) * born * twinkle * uStars;
    float neb = fbm3(dir * 2.4 + vec3(uClock * 0.05));
    neb = smoothstep(0.45, 0.85, neb) * uNebula;

    float lipFade = smoothstep(0.0, 0.2, vUv.y);
    vec3 col = uDeep + uBody * neb * 0.35 + uTint * star * 2.5 + uCore * star * star * 2.0;
    float a = uDark * (0.6 + 0.4 * ndv) * lipFade;
    a = max(a, clamp(star, 0.0, 1.0));
    gl_FragColor = vec4(col * mix(1.0, uGlow * uGlobalGlow, step(0.01, star + neb)), clamp(a * uFade, 0.0, 1.0));
  }
`;

/** The inside of the pocket: normal-blended, back faces — a hole in the world. */
export function createVoidMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: BackSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...pocketUniforms(),
      ...rampUniforms(),
      uDark: { value: 0.6 },
      uStars: { value: 1 },
      uDensity: { value: 26 },
      uNebula: { value: 0.7 },
      uBirth: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uGlow: { value: 1 },
    }),
    vertexShader: POCKET_VERTEX,
    fragmentShader: VOID_FRAGMENT,
  });
  /** @param {object} s pocket shape + { fade, birth, dissolve } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncPocket(u, s);
    syncRamp(u, c);
    u.uShrink.value = 0.985;
    u.uDark.value = c.voidDarkness * g.opacity;
    u.uStars.value = c.voidStars;
    u.uDensity.value = c.voidStarDensity;
    u.uNebula.value = c.nebulaStrength * g.noiseStrength;
    u.uBirth.value = s.birth;
    u.uFade.value = s.fade;
    u.uDissolve.value = s.dissolve;
    u.uGlow.value = g.glow;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The cosmic web                                                       */
/* -------------------------------------------------------------------- */

const WEB_VERTEX = /* glsl */ `
  ${POCKET_PLACE}
  attribute vec2 aArc;
  attribute vec2 aCross;
  attribute vec4 aEdge;
  attribute vec2 aTan;
  uniform float uThick;
  uniform float uGrowth;
  uniform float uSpan;
  uniform float uReach;
  varying float vT;
  varying float vProg;
  varying float vHash;
  varying float vShow;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    float t = LIP_T + (1.0 - LIP_T) * aArc.y;
    vec3 p = pocketPos(aArc.x, t);
    vec3 n = pocketNormal(aArc.x, t, p);
    p += n * pocketWobble(aArc.x, t, uClock, uWobble, uModes, uWobbleSpeed);
    // The spine's heading on the skin and the side vector of its section.
    vec3 q = pocketPos(aArc.x + aTan.x * 0.03, LIP_T + (1.0 - LIP_T) * (aArc.y + aTan.y * 0.03));
    vec3 tangent = q - pocketPos(aArc.x, t);
    tangent = length(tangent) > 1e-6 ? normalize(tangent) : vec3(1.0, 0.0, 0.0);
    vec3 side = normalize(cross(tangent, n) + vec3(1e-5));

    float prog = clamp((uGrowth - aEdge.y) / max(uSpan, 0.01), 0.0, 1.0);
    float show = step(aEdge.x, prog) * step(aEdge.z, uReach);
    // Thicker at the growing tip, as though it were still condensing.
    float tip = exp(-abs(aEdge.x - prog) * 18.0) * step(prog, 0.999);
    float w = uThick * show * (1.0 + 0.8 * tip);
    vec3 offset = (n * aCross.x + side * aCross.y) * w;
    vec3 pos = (p + n * uThick * 1.5 + offset) * uInflate;

    vT = aEdge.x;
    vProg = prog;
    vHash = aEdge.z;
    vShow = show;
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * (n * aCross.x + side * aCross.y));
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WEB_FRAGMENT = /* glsl */ `
  ${RAMP_GLSL}
  uniform float uGlow;
  uniform float uTipHeat;
  uniform float uPulse;
  uniform float uFade;
  uniform float uFlare;       // all threads flare at the birth of the shell
  uniform float uClock;
  uniform float uGlobalGlow;
  varying float vT;
  varying float vProg;
  varying float vHash;
  varying float vShow;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${commonGLSL}
  void main() {
    if (vShow < 0.5) discard;
    float rim = fresnelTerm(vViewDir, vNormalW, 1.4, 1.0);
    float tip = exp(-abs(vT - vProg) * 26.0) * step(vProg, 0.999);
    float done = step(0.999, vProg);
    float pulse = pow(0.5 + 0.5 * sin((vT * 3.0 - uClock * 1.4 + vHash * 6.2831) * 3.14159), 10.0) * done * uPulse;
    float heat = clamp(0.35 + rim * 0.4 + pulse * 0.6 + uFlare, 0.0, 1.0);
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, 1.0 - heat * 0.8);
    col += uCore * tip * uTipHeat;
    col += uCore * pulse * 0.8;
    col += uCore * uFlare * 1.5;
    float a = (0.55 + 0.45 * rim + tip) * uFade;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * uFade, clamp(a, 0.0, 1.0));
  }
`;

/** Cosmic web threads crawling up the skin. Additive. */
export function createWebMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      ...pocketUniforms(),
      ...rampUniforms(),
      uThick: { value: 0.1 },
      uGrowth: { value: 0 },
      uSpan: { value: 0.35 },
      uReach: { value: 1 },
      uGlow: { value: 2 },
      uTipHeat: { value: 2 },
      uPulse: { value: 1 },
      uFade: { value: 1 },
      uFlare: { value: 0 },
    }),
    vertexShader: WEB_VERTEX,
    fragmentShader: WEB_FRAGMENT,
  });
  /** @param {object} s pocket shape + { growth, fade, flare } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncPocket(u, s);
    syncRamp(u, c);
    u.uThick.value = 0.035 * c.webThickness * s.radius / 3.4 * Math.sqrt(s.radius / 3.4 + 0.5);
    u.uGrowth.value = s.growth;
    u.uSpan.value = c.webGrowSpan;
    u.uReach.value = c.webReach;
    u.uGlow.value = c.webGlow * g.glow;
    u.uTipHeat.value = c.webTipHeat;
    u.uPulse.value = c.webPulse;
    u.uFade.value = s.fade * g.opacity;
    u.uFlare.value = s.flare;
  };
  return material;
}

const KNOT_FRAGMENT = /* glsl */ `
  ${RAMP_GLSL}
  uniform float uGlow;
  uniform float uFade;
  uniform float uFresnel;
  uniform float uGlobalGlow;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vObj;
  ${commonGLSL}
  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, 2.0, uFresnel);
    float core = 1.0 - clamp(rim, 0.0, 1.0);
    vec3 col = uCore * core * 1.6 + mix(uBody, uTint, rim) * rim;
    float a = (0.6 * core + rim) * uFade;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * uFade, clamp(a, 0.0, 1.0));
  }
`;

/** Condensation knots (instanced). Additive. */
export function createKnotMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({ ...rampUniforms(), uGlow: { value: 2 }, uFade: { value: 1 }, uFresnel: { value: 1 } }),
    vertexShader: LIT_VERTEX,
    fragmentShader: KNOT_FRAGMENT,
  });
  /** @param {object} s { fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncRamp(u, c);
    u.uGlow.value = c.knotGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    u.uFresnel.value = g.fresnel;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The floor                                                            */
/* -------------------------------------------------------------------- */

const FLOOR_FRAGMENT = /* glsl */ `
  ${RAMP_GLSL}
  uniform float uReach;       // floor radius in pocket radii
  uniform float uTear;        // 0..1 the tear running out at the birth
  uniform float uGrowth;      // the crystal cracks spread under the web
  uniform float uFade;
  uniform float uDissolve;
  uniform float uDark;
  uniform float uStreaks;
  uniform float uRim;
  uniform float uGlow;
  uniform float uLip;
  uniform float uClock;
  uniform float uNoiseScale;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}
  ${CRACK_GLSL}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0 * uReach;   // in pocket radii
    float r = length(p);
    if (r > uReach) discard;
    float a = atan(p.y, p.x);
    float edge = 1.0 + uLip;                 // where the lip meets the floor
    float open = uTear * edge * 1.05;        // how far the tear has run

    float inside = 1.0 - smoothstep(open - 0.12, open, r);
    float stain = inside * (1.0 - smoothstep(edge * 0.9, edge * 1.1, r));
    // Streaks dragged outward by the escaping air, bent by noise.
    float bend = snoise(vec3(p * 1.4 * uNoiseScale, 0.3)) * 0.35;
    float streak = pow(abs(sin(a * 34.0 + bend * 6.0)), 18.0);
    streak *= smoothstep(0.4, 1.0, r) * (1.0 - smoothstep(edge, uReach, r)) * inside;
    // The burning tear at the lip.
    float rim = exp(-abs(r - min(open, edge)) * 26.0) * step(0.02, uTear);
    // Crystal cracks spreading under the pocket from the middle.
    float ce = crackEdge(p * 3.2 + vec2(3.1, 7.7));
    float crack = (1.0 - smoothstep(0.0, 0.07, ce)) * step(r, uGrowth * edge) * inside;
    // Faint dust swirl in the stain.
    float swirl = fbm3(vec3(rot2(uClock * 0.3) * p * 2.0 * uNoiseScale, uClock * 0.1));

    float dn = snoise01(vec3(p * 2.6, 5.1));
    float keep = step(uDissolve, dn);

    vec3 col = uDeep * (0.6 + 0.4 * swirl);
    col = mix(col, uBody * 1.4, streak * uStreaks * 0.6);
    col = mix(col, gradient4(uCore, uTint, uBody, uDeep, 0.35) * 2.0, crack);
    col += mix(uTint, uCore, rim) * rim * uRim * 2.5;
    float alpha = stain * uDark + streak * uStreaks * 0.35 + crack * 0.9 + rim * uRim * 0.8;
    alpha *= keep * uFade;
    vec3 glowCol = col * mix(1.0, uGlow * uGlobalGlow * uShaderIntensity, clamp(rim + crack + streak, 0.0, 1.0));
    gl_FragColor = vec4(glowCol, clamp(alpha, 0.0, 1.0));
  }
`;

/** The stripped floor. Normal blended so the vacuum stain can darken the ground. */
export function createFloorMaterial() {
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
      ...rampUniforms(),
      uReach: { value: 1.3 },
      uTear: { value: 0 },
      uGrowth: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uDark: { value: 0.7 },
      uStreaks: { value: 1 },
      uRim: { value: 1.6 },
      uGlow: { value: 1.4 },
      uLip: { value: 0.16 },
      uClock: { value: 0 },
      uNoiseScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FLOOR_FRAGMENT,
  });
  /** @param {object} s { tear, growth, fade, dissolve, clock, lip } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncRamp(u, c);
    u.uReach.value = Math.max(1.05, c.floorRadius);
    u.uTear.value = s.tear;
    u.uGrowth.value = s.growth;
    u.uFade.value = s.fade * g.opacity;
    u.uDissolve.value = s.dissolve;
    u.uDark.value = c.floorDarkness;
    u.uStreaks.value = c.floorStreaks;
    u.uRim.value = c.floorRim;
    u.uGlow.value = c.floorGlow * g.glow;
    u.uLip.value = s.lip;
    u.uClock.value = s.clock;
    u.uNoiseScale.value = g.noiseFrequency;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens                                                             */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uShock;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vViewNormal;
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float rim = pow(1.0 - abs(dot(N, V)), 2.0);
    vec2 dir = normalize(vViewNormal.xy + vec2(1e-5));
    float strength = uShaderIntensity * clamp(rim * uStrength + uShock * (0.4 + rim), 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(-dir * 0.5 + 0.5, strength, 1.0);
  }
`;

/**
 * The skin on `LAYER.DISTORTION`: the bubble bends the world at its rim like
 * a lens. Opaque on purpose (see Borrowed Tomorrow's lens): the offset
 * buffer wants the proxy's own value, and an opaque proxy is not re-routed
 * to the VFX layer by `routeExpansionTransparency`.
 */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({ ...pocketUniforms(), uStrength: { value: 0 }, uShock: { value: 0 } }),
    vertexShader: POCKET_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s pocket shape + { strength, shock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncPocket(u, s);
    u.uShrink.value = 1.01;
    u.uStrength.value = s.strength * c.lensStrength * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
  };
  return material;
}
