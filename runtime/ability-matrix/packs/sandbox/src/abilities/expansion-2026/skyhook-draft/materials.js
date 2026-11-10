import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Skyhook Draft — the bespoke shaders.
 *
 * Every colour comes from one four-stop ramp (`coreColor` white-hot →
 * `tintColor` pale sky → `bodyColor` sky blue → `deepColor` storm navy).
 *
 *  - **hook core** — the crook's streamline body. The vertex stage *builds
 *    the crook* from parameter space (HOOK_PATH, mirrored by `hookPoint` in
 *    geometry.js): bowed stem, curl, barb, a foot that flares into the floor,
 *    a breathing wobble. The fragment winds `streamCount` helical streamlines
 *    up the tube, breaks them with fbm, adds a fresnel rim, a white-hot
 *    growth head while it erupts, and a burning edge while it unravels.
 *  - **hook sheath** — the same tube a little wider, *normal* blended: ragged
 *    storm-dust lit by the scene sun from storm navy to sky blue. It is what
 *    gives the hook mass on the dark floor — air you can see because of what
 *    it carries — instead of a glowing outline.
 *  - **the braid** — the draft's streamlines, also placed in the vertex
 *    stage: they ride the lane, converge, wind round the stem and climb it.
 *    Dashes flow downstream; the leading edge is white-hot while it travels.
 *  - **the scour** — the floor answers: a dark combed groove along the lane
 *    with streaks and chevrons crawling toward the hook, and a spiral vortex
 *    torn into the floor at the hook's foot. Normal blended, so the deep tone
 *    really darkens the floor. Dissolves through noise on the exit.
 *  - **the lens** — `LAYER.DISTORTION` proxy: the draft's shimmer streaming
 *    downstream and a pressure ring at the eruption.
 *
 * Every material reads `settings.skyhookDraft` in `userData.sync(state)`.
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

/** Copy the ramp into a material's four colour uniforms. */
function syncRamp(u, c) {
  u.uCore.value.copy(getColor(c.coreColor));
  u.uTint.value.copy(getColor(c.tintColor));
  u.uBody.value.copy(getColor(c.bodyColor));
  u.uDeep.value.copy(getColor(c.deepColor));
}

const rampUniforms = () => ({
  uCore: { value: new Color('#ffffff') },
  uTint: { value: new Color('#cfeaff') },
  uBody: { value: new Color('#4f9ae6') },
  uDeep: { value: new Color('#13233f') },
});

/* -------------------------------------------------------------------- */
/* The hook                                                             */
/* -------------------------------------------------------------------- */

/** The crook path — keep in step with `hookPoint` in geometry.js. */
const HOOK_PATH = /* glsl */ `
  uniform float uH;     // stem height (m)
  uniform float uR;     // curl radius (m)
  uniform float uD;     // barb drop (m)
  uniform float uBow;   // stem bow (m)
  float hookTotal() { return uH + 3.14159265 * uR + uD; }
  vec3 hookPath(float s) {
    float d = clamp(s, 0.0, 1.0) * hookTotal();
    if (d < uH) return vec3(uBow * sin(3.14159265 * d / uH), d, 0.0);
    d -= uH;
    float arc = 3.14159265 * uR;
    if (d < arc) {
      float phi = d / uR;
      return vec3(-uR + uR * cos(phi), uH + uR * sin(phi), 0.0);
    }
    d -= arc;
    return vec3(-2.0 * uR, uH - d, 0.0);
  }
`;

const HOOK_VERTEX = /* glsl */ `
  ${HOOK_PATH}
  uniform float uThick;
  uniform float uTaper;
  uniform float uFlare;
  uniform float uRadiusScale;
  uniform float uWobble;
  uniform float uClock;
  varying float vS;
  varying float vTheta;
  varying float vDist;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    float s = uv.x;
    float th = uv.y * 6.2831853;
    vec3 p = hookPath(s);
    vec3 T = normalize(hookPath(min(1.0, s + 0.004)) - hookPath(max(0.0, s - 0.004)));
    vec3 B = vec3(0.0, 0.0, 1.0);
    vec3 N = vec3(-T.y, T.x, 0.0);
    float d = s * hookTotal();
    float rad = uThick * mix(1.0, uTaper, smoothstep(0.1, 0.95, s));
    // The foot opens into the floor like a funnel drinking the draft.
    float foot = 1.0 - smoothstep(0.0, 1.2, d);
    rad += uFlare * foot * foot;
    // A closed, rounded barb.
    rad *= sqrt(1.0 - smoothstep(0.965, 1.0, s));
    // Air, not metal: the tube breathes.
    rad *= 1.0 + 0.12 * uWobble * sin(d * 5.0 - uClock * 6.0 + th * 2.0);
    rad *= uRadiusScale;
    vec3 dir = N * cos(th) + B * sin(th);
    vec3 pos = p + dir * rad;
    pos.z += sin(d * 1.3 - uClock * 2.2) * 0.08 * uWobble * smoothstep(0.0, 4.0, d);
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * dir);
    vViewDir = cameraPosition - world.xyz;
    vS = s;
    vTheta = uv.y;
    vDist = d;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HOOK_CORE_FRAGMENT = /* glsl */ `
  uniform float uGrow;      // 0..1 of the path drawn (the eruption)
  uniform float uUnravel;   // 0..1 of the path gone from the foot (the exit)
  uniform float uClock;
  uniform float uStreams;
  uniform float uTwist;
  uniform float uFlow;
  uniform float uGlow;
  uniform float uFresnel;
  uniform float uFade;
  uniform float uNoise;
  uniform float uFreq;
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying float vS;
  varying float vTheta;
  varying float vDist;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    if (vS > uGrow || vS < uUnravel) discard;
    float stream = vTheta * uStreams + vS * uTwist - uClock * uFlow;
    float st = pow(0.5 + 0.5 * cos(stream * 6.2831853), 6.0);
    float n = fbm3(vec3(vDist * 0.8 * uFreq - uClock * uFlow * 0.6, vTheta * 4.0, uClock * 0.3));
    n = mix(0.6, n, clamp(uNoise, 0.0, 1.0));
    float rim = fresnelTerm(vViewDir, vNormalW, uFresnel, 1.0);
    float head = exp(-abs(vS - uGrow) * 55.0) * step(uGrow, 0.995);
    float burn = exp(-abs(vS - uUnravel) * 70.0) * step(0.001, uUnravel);
    float body = 0.35 + 0.5 * n;
    float I = (body + st * (0.45 + 0.9 * n)) * uShaderIntensity + rim * 0.7 + head * 2.2 + burn * 1.6;
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, clamp(1.05 - I * 0.75, 0.0, 1.0));
    float a = (body * 0.35 + st * 0.65 * (0.4 + n) + rim * 0.55 + head + burn) * uFade;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * (0.35 + I), clamp(a, 0.0, 1.0));
  }
`;

const HOOK_SHEATH_FRAGMENT = /* glsl */ `
  uniform float uGrow;
  uniform float uUnravel;
  uniform float uClock;
  uniform float uFlow;
  uniform float uOpacity;
  uniform float uFresnel;
  uniform float uFade;
  uniform float uNoise;
  uniform float uFreq;
  uniform vec3 uLightDir;
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  varying float vS;
  varying float vTheta;
  varying float vDist;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    if (vS > uGrow - 0.015 || vS < uUnravel + 0.02) discard;
    // Storm dust dragged up the tube: stretched along it, sheared round it.
    float n = fbm3(vec3(vDist * 0.9 * uFreq - uClock * uFlow * 0.45, vTheta * 5.0 + vDist * 0.6, uClock * 0.25));
    n = mix(0.62, n, clamp(uNoise, 0.0, 1.0));
    vec3 N = normalize(vNormalW);
    float ndl = dot(N, uLightDir) * 0.5 + 0.5;
    float rim = fresnelTerm(vViewDir, N, uFresnel, 1.0);
    vec3 col = mix(uDeep, uBody, ndl * (0.35 + 0.7 * n)) + uTint * rim * 0.35;
    float ragged = smoothstep(0.3, 0.68, n);
    float ends = smoothstep(uUnravel, uUnravel + 0.08, vS) * (1.0 - smoothstep(uGrow - 0.08, uGrow, vS));
    float a = uOpacity * ragged * (1.0 - 0.55 * rim) * ends * uFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

function hookUniforms() {
  return sharedUniforms({
    uH: { value: 4.2 },
    uR: { value: 1.1 },
    uD: { value: 0.7 },
    uBow: { value: 0.2 },
    uThick: { value: 0.34 },
    uTaper: { value: 0.45 },
    uFlare: { value: 1.1 },
    uRadiusScale: { value: 1 },
    uWobble: { value: 1 },
    uClock: { value: 0 },
    uGrow: { value: 1 },
    uUnravel: { value: 0 },
    uStreams: { value: 7 },
    uTwist: { value: 3.5 },
    uFlow: { value: 2.6 },
    uGlow: { value: 2 },
    uOpacity: { value: 0.6 },
    uFresnel: { value: 2.2 },
    uFade: { value: 1 },
    uNoise: { value: 1 },
    uFreq: { value: 1 },
    ...rampUniforms(),
  });
}

/** Shared per-frame sync for both hook layers. */
function syncHook(material, s, sheath) {
  const c = settings[ID];
  const g = settings.global;
  const u = material.uniforms;
  u.uH.value = s.height;
  u.uR.value = s.curl;
  u.uD.value = s.drop;
  u.uBow.value = s.bow;
  u.uThick.value = c.hookThickness;
  u.uTaper.value = c.hookTaper;
  u.uFlare.value = c.hookFlare;
  u.uRadiusScale.value = sheath ? c.sheathScale : 1;
  u.uWobble.value = s.wobble * g.turbulence;
  u.uClock.value = s.clock;
  u.uGrow.value = s.grow;
  u.uUnravel.value = s.unravel;
  u.uStreams.value = Math.max(1, Math.round(c.streamCount));
  u.uTwist.value = c.streamTwist;
  u.uFlow.value = c.streamSpeed * g.noiseSpeed;
  u.uGlow.value = c.coreGlow * g.glow;
  u.uOpacity.value = c.sheathOpacity * g.opacity;
  u.uFresnel.value = c.hookFresnel * g.fresnel;
  u.uFade.value = s.fade * (sheath ? 1 : g.opacity);
  u.uNoise.value = g.noiseStrength;
  u.uFreq.value = g.noiseFrequency;
  syncRamp(u, c);
}

/** The crook's streamline core. Additive. */
export function createHookCoreMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: DoubleSide }),
    uniforms: hookUniforms(),
    vertexShader: HOOK_VERTEX,
    fragmentShader: HOOK_CORE_FRAGMENT,
  });
  /** @param {object} s { height, curl, drop, bow, wobble, clock, grow, unravel, fade } */
  material.userData.sync = (s) => syncHook(material, s, false);
  return material;
}

/** The crook's storm-dust sheath. Normal blended, sun-lit. */
export function createHookSheathMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: hookUniforms(),
    vertexShader: HOOK_VERTEX,
    fragmentShader: HOOK_SHEATH_FRAGMENT,
  });
  material.userData.sync = (s) => syncHook(material, s, true);
  return material;
}

/* -------------------------------------------------------------------- */
/* The braid                                                            */
/* -------------------------------------------------------------------- */

const BRAID_VERTEX = /* glsl */ `
  attribute vec4 aRibbon;   // lane slot 0..1, phase, index, —
  uniform float uL;         // lane length (m) — the hook's foot is at x = uL
  uniform float uHalf;      // lane half width (m)
  uniform float uHeight;
  uniform float uLayer;
  uniform float uWave;
  uniform float uWaveLen;
  uniform float uClock;
  uniform float uClimb;     // metres the braid climbs the stem
  uniform float uFlare;
  uniform float uHoist;
  uniform float uWidth;
  uniform float uCount;
  varying float vAlong;
  varying float vAcross;
  varying float vPhase;
  varying float vU;
  vec3 braidPoint(float u, float slot, float phase) {
    float x = u * uL;
    float conv = smoothstep(0.5, 1.0, u);
    float lane = (slot * 2.0 - 1.0) * uHalf * 0.85;
    float k = 6.2831853 / max(0.3, uWaveLen);
    float y = uHeight + (phase - 0.5) * uLayer + uWave * sin(x * k + phase * 6.2831853 - uClock * 2.0) * (1.0 - conv);
    float z = lane * (1.0 - conv) + uWave * 0.6 * cos(x * k * 0.7 + phase * 9.0 - uClock * 1.6) * (1.0 - conv);
    vec3 p = vec3(x, y, z);
    // The last half winds round the stem and climbs it.
    float w = conv * conv;
    float ang = phase * 6.2831853 + w * 7.0 - uClock * 1.5;
    float rs = mix(uFlare * 0.95, uFlare * 0.4, w);
    vec3 coil = vec3(uL + cos(ang) * rs, y + w * w * uClimb + w * uHoist, sin(ang) * rs);
    return mix(p, coil, smoothstep(0.0, 1.0, w * 1.4));
  }
  void main() {
    if (aRibbon.z >= uCount) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vAlong = 0.0; vAcross = 0.0; vPhase = 0.0; vU = 0.0;
      return;
    }
    float u = uv.x;
    vec3 p = braidPoint(u, aRibbon.x, aRibbon.y);
    vec3 T = braidPoint(min(1.0, u + 0.003), aRibbon.x, aRibbon.y) - braidPoint(max(0.0, u - 0.003), aRibbon.x, aRibbon.y);
    vec3 side = cross(normalize(T + vec3(0.0, 1e-4, 0.0)), vec3(0.0, 1.0, 0.0));
    float sl = length(side);
    side = sl > 1e-3 ? side / sl : vec3(0.0, 0.0, 1.0);
    // Ribbons narrow as they climb the stem.
    float width = uWidth * mix(1.0, 0.55, smoothstep(0.6, 1.0, u));
    p += side * (uv.y - 0.5) * width;
    vAlong = u * uL;
    vAcross = uv.y;
    vPhase = aRibbon.y;
    vU = u;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const BRAID_FRAGMENT = /* glsl */ `
  uniform float uReach;     // the front, metres along the lane
  uniform float uTravel;    // 1 while the front is running
  uniform float uClock;
  uniform float uFlow;
  uniform float uDash;
  uniform float uGlow;
  uniform float uFade;
  uniform float uDissolve;
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying float vAlong;
  varying float vAcross;
  varying float vPhase;
  varying float vU;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    if (vAlong > uReach) discard;
    float edge = 1.0 - pow(abs(vAcross * 2.0 - 1.0), 2.0);
    float f = fract((vAlong - uClock * uFlow) / max(0.2, uDash) + vPhase * 3.0);
    float dash = smoothstep(0.0, 0.3, f) * (1.0 - smoothstep(0.3, 0.95, f));
    // Feathered in from the caster's feet, so the near ribbons never end in a hard cut.
    float start = smoothstep(0.0, 2.5, vAlong);
    float head = exp(-(uReach - vAlong) * 2.5) * uTravel;
    float climb = smoothstep(0.75, 1.0, vU);
    float I = (0.22 + dash * 0.95 * uShaderIntensity) * edge + head * 1.8 + climb * 0.3;
    vec2 dm = dissolveMask(snoise01(vec3(vAlong * 0.6, vPhase * 7.0, 1.7)), uDissolve, 0.08);
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, clamp(1.0 - I * 0.8, 0.0, 1.0)) + uTint * dm.y * 2.0;
    float a = I * edge * dm.x * uFade * start;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The draft's streamline braid. Additive. */
export function createBraidMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uL: { value: 10 },
      uHalf: { value: 1.3 },
      uHeight: { value: 0.35 },
      uLayer: { value: 0.55 },
      uWave: { value: 0.22 },
      uWaveLen: { value: 3.2 },
      uClock: { value: 0 },
      uClimb: { value: 3 },
      uFlare: { value: 1.1 },
      uHoist: { value: 0 },
      uWidth: { value: 0.16 },
      uCount: { value: 9 },
      uReach: { value: 0 },
      uTravel: { value: 1 },
      uFlow: { value: 6 },
      uDash: { value: 1.4 },
      uGlow: { value: 1.6 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      ...rampUniforms(),
    }),
    vertexShader: BRAID_VERTEX,
    fragmentShader: BRAID_FRAGMENT,
  });
  /** @param {object} s { length, reach, travel, clock, hoist, climb, fade, dissolve, capacity } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uL.value = s.length;
    u.uHalf.value = c.laneWidth * 0.5;
    u.uHeight.value = c.ribbonHeight;
    u.uLayer.value = c.ribbonLayer;
    u.uWave.value = c.ribbonWave * g.turbulence;
    u.uWaveLen.value = c.ribbonWaveLength;
    u.uClock.value = s.clock;
    u.uClimb.value = s.climb;
    u.uFlare.value = c.hookFlare;
    u.uHoist.value = s.hoist;
    u.uWidth.value = c.ribbonWidth;
    u.uCount.value = Math.min(s.capacity, Math.round(c.ribbonCount));
    u.uReach.value = s.reach;
    u.uTravel.value = s.travel;
    u.uFlow.value = c.ribbonFlow;
    u.uDash.value = c.ribbonDash;
    u.uGlow.value = c.ribbonGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    u.uDissolve.value = s.dissolve;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The scour (floor) and the lens share the lane quad                    */
/* -------------------------------------------------------------------- */

const LANE_VERTEX = /* glsl */ `
  varying vec2 vLocal;      // x 0..1 downstream, y −0.5..0.5 across (unscaled)
  void main() {
    vLocal = vec2(position.x, position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LANE_COMMON = /* glsl */ `
  uniform float uStart;     // lane metres at the quad's upstream edge
  uniform float uSpan;      // metres the quad spans downstream
  uniform float uWidth;     // metres it spans across
  uniform float uL;         // lane length — the hook's foot
  uniform float uHalf;
  uniform float uReach;
  uniform float uClock;
  uniform float uFlare;
  varying vec2 vLocal;
  vec2 laneXZ() { return vec2(uStart + vLocal.x * uSpan, vLocal.y * uWidth); }
  float laneMask(vec2 p) {
    return (1.0 - smoothstep(uHalf * 0.7, uHalf * 1.08, abs(p.y)))
      * smoothstep(-0.4, 0.5, p.x)
      * (1.0 - smoothstep(uReach - 0.3, uReach + 0.5, p.x));
  }
`;

const SCOUR_FRAGMENT = /* glsl */ `
  ${LANE_COMMON}
  uniform float uFlow;
  uniform float uStreaks;
  uniform float uDark;
  uniform float uGlow;
  uniform float uVortexGlow;
  uniform float uVortexTwist;
  uniform float uErupt;     // 0..1 the vortex torn at the foot
  uniform float uFade;
  uniform float uDissolve;
  uniform float uNoise;
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec2 p = laneXZ();
    float lane = laneMask(p);
    // Combed streaks crawling downstream.
    float n = snoise(vec3((p.x - uClock * uFlow) * 0.32, p.y * 3.2 * uStreaks, uClock * 0.15));
    float streak = pow(max(0.0, n), 3.0) * mix(1.0, 0.6 + 0.8 * snoise01(vec3(p * 0.7, 3.1)), uNoise);
    // Chevrons pointing at the hook.
    float cf = fract((p.x - uClock * uFlow) / 1.8 + abs(p.y) * 0.5 / max(0.3, uHalf));
    float chev = smoothstep(0.0, 0.05, cf) * (1.0 - smoothstep(0.08, 0.2, cf)) * 0.18;
    // The vortex torn into the floor at the hook's foot.
    vec2 q = vec2(p.x - uL, p.y);
    float r = length(q);
    float vr = (1.0 - smoothstep(uFlare * 1.1, uFlare * 2.6, r)) * uErupt;
    float arms = pow(0.5 + 0.5 * sin(atan(q.y, q.x) * 3.0 + log(r + 0.05) * uVortexTwist * 2.0 - uClock * 4.0), 5.0) * vr;
    float eye = exp(-r * r / max(0.05, uFlare * uFlare * 0.4)) * uErupt;
    float dark = max(lane, vr) * uDark;
    float bright = ((streak * 0.9 + chev) * lane * uGlow + (arms + eye * 0.6) * uVortexGlow) * uShaderIntensity;
    vec2 dm = dissolveMask(snoise01(vec3(p * 0.9, 4.2)), uDissolve, 0.06);
    vec3 col = mix(uDeep, mix(uBody, uTint, clamp(bright - 0.3, 0.0, 1.0)) * (0.6 + bright), clamp(bright * 1.6, 0.0, 1.0));
    col += uCore * dm.y * 1.5;
    float a = clamp(dark * 0.6 + bright * 0.75, 0.0, 0.95) * dm.x * uFade;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * mix(1.0, uGlobalGlow, step(0.2, bright)), a);
  }
`;

/** The scoured lane and the foot's vortex. Normal blended (it darkens the floor). */
export function createScourMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStart: { value: -1 },
      uSpan: { value: 12 },
      uWidth: { value: 6 },
      uL: { value: 10 },
      uHalf: { value: 1.3 },
      uReach: { value: 0 },
      uClock: { value: 0 },
      uFlare: { value: 1.1 },
      uFlow: { value: 1.6 },
      uStreaks: { value: 1 },
      uDark: { value: 0.7 },
      uGlow: { value: 1.2 },
      uVortexGlow: { value: 1.4 },
      uVortexTwist: { value: 3 },
      uErupt: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uNoise: { value: 1 },
      ...rampUniforms(),
    }),
    vertexShader: LANE_VERTEX,
    fragmentShader: SCOUR_FRAGMENT,
  });
  /** @param {object} s { start, span, width, length, reach, clock, erupt, fade, dissolve } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value = s.start;
    u.uSpan.value = s.span;
    u.uWidth.value = s.width;
    u.uL.value = s.length;
    u.uHalf.value = c.laneWidth * 0.5;
    u.uReach.value = s.reach;
    u.uClock.value = s.clock;
    u.uFlare.value = c.hookFlare;
    u.uFlow.value = c.scourFlow * g.noiseSpeed;
    u.uStreaks.value = c.scourStreaks * g.noiseFrequency;
    u.uDark.value = c.scourDark;
    u.uGlow.value = c.scourGlow * g.glow;
    u.uVortexGlow.value = c.vortexGlow * g.glow;
    u.uVortexTwist.value = c.vortexTwist;
    u.uErupt.value = s.erupt;
    u.uFade.value = s.fade * g.opacity;
    u.uDissolve.value = s.dissolve;
    u.uNoise.value = g.noiseStrength;
    syncRamp(u, c);
  };
  return material;
}

const LENS_FRAGMENT = /* glsl */ `
  ${LANE_COMMON}
  uniform float uStrength;  // the draft's shimmer
  uniform float uShock;     // the eruption's pressure ring
  uniform float uWave;      // its radius (m)
  uniform float uScale;
  uniform float uShaderIntensity;
  ${noiseGLSL}
  void main() {
    vec2 p = laneXZ();
    float lane = laneMask(p);
    vec3 np = vec3(p.x * 0.8 * uScale - uClock * 2.5, p.y * 1.5 * uScale, uClock * 0.4);
    vec2 n = vec2(snoise(np), snoise(np + vec3(4.1, 2.7, 9.3)));
    // Downstream in the quad's own frame (+x), wavering.
    vec2 flow = vec2(1.0, 0.0) * (0.6 + 0.4 * n.x) + vec2(0.0, n.y * 0.5);
    vec2 q = vec2(p.x - uL, p.y);
    float r = length(q);
    float ring = exp(-pow((r - uWave) / 0.5, 2.0));
    vec2 radial = q / max(r, 1e-3);
    vec2 dir = flow * lane * uStrength + (radial + n * 0.3) * ring * uShock;
    float strength = uShaderIntensity * clamp(lane * uStrength * (0.5 + 0.5 * n.x) + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, 1.0);
  }
`;

/**
 * `LAYER.DISTORTION` proxy over the lane. Opaque on purpose (see Borrowed
 * Tomorrow's lens): the offset buffer wants the proxy's own value, and an
 * opaque proxy is not re-routed to the VFX layer by the transparency router.
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
      uStart: { value: -1 },
      uSpan: { value: 12 },
      uWidth: { value: 6 },
      uL: { value: 10 },
      uHalf: { value: 1.3 },
      uReach: { value: 0 },
      uClock: { value: 0 },
      uFlare: { value: 1.1 },
      uStrength: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: LANE_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { start, span, width, length, reach, clock, strength, shock, wave } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value = s.start;
    u.uSpan.value = s.span;
    u.uWidth.value = s.width;
    u.uL.value = s.length;
    u.uHalf.value = c.laneWidth * 0.5;
    u.uReach.value = s.reach;
    u.uClock.value = s.clock;
    u.uFlare.value = c.hookFlare;
    u.uStrength.value = s.strength * c.lensStrength * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
