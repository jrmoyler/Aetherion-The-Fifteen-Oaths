import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms, frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Stasis Bell — the bespoke shaders the bell and its fence are drawn with.
 *
 *  - **brass** (`createBellMaterial`, `createTineMaterial`) — one fragment
 *    stage for the bell, its clapper, its escapement wheel and the tines:
 *    sun-lit, sky-reflecting brass with verdigris in the crevices and
 *    engraved inscription bands, a warm fresnel, and a lip that blazes when
 *    struck. The bell *turns itself into being* like work on a lathe — a
 *    sweep round its axis with a glowing cut edge — and is unmade the same
 *    way. Its vertex stage flexes the rim in the (2,0) mode of a struck bell:
 *    an oval squeezing one way then the other, decaying.
 *  - **the tines** — tuning forks built in the vertex stage from (s, angle)
 *    tube parameters: prong, U-bend, prong, and a stem into the floor; stood
 *    round the rim per instance, rising out of the floor in a staggered wave,
 *    quivering when a sound front reaches them.
 *  - **the strings** (`createStringMaterial`) — ribbons strung between
 *    neighbouring tines, three rows high, each a standing wave (fixed ends,
 *    `stringModes` antinodes) that snaps at its middle on the release.
 *  - **the fronts** (`createFrontMaterial`) — a band per toll running down a
 *    cone from the bell's mouth to the tines, rippled.
 *  - **the floor** (`createFloorMaterial`) — a brass resonance band engraved
 *    with a running sine round the rim, and inside it standing-wave rings
 *    (nodes fixed, amplitude beating with the tolls).
 *  - **the held field** (`createCurtainMaterial`) — a wall of stopped
 *    sound standing on the rim between the tines once the first toll lands:
 *    dark umber at the floor, amber standing bands up it that beat with
 *    each toll, seams where the tines hold it; torn away upward on release.
 *  - **the air** (`createAirMaterial`) — LAYER.DISTORTION: a ring per toll,
 *    and a still shimmer over the held circle.
 *
 * Every material reads `settings.stasisbell` in `userData.sync(state)`.
 */

const ID = 'stasisbell';
export const MAX_TINES = 20;
export const STRING_ROWS = 3;

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* -------------------------------------------------------------------- */
/* Brass                                                                */
/* -------------------------------------------------------------------- */

const BRASS_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  uniform vec3  uBrass;
  uniform vec3  uBrassDark;
  uniform vec3  uPatinaColor;
  uniform vec3  uGlowColor;
  uniform vec3  uFormColor;
  uniform float uEnv;
  uniform float uSpecular;
  uniform float uGloss;
  uniform float uEngrave;
  uniform float uPatina;
  uniform float uRimGlow;
  uniform float uTollGlow;
  uniform float uForm;        // 0..1 how much of the turn exists
  uniform float uFormEdge;
  uniform float uSeed;
  uniform float uInscribe;    // 1 on the bell: the inscription bands

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;
  varying float vAng;         // 0..1 round the axis
  varying float vHot;         // 0..1 how hard it is ringing here

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    // Turned into being: the sweep round the axis, its cut edge burning.
    float wob = snoise(vec3(vLocal.y * 4.0, uSeed, 0.0)) * 0.015;
    float a = vAng + wob;
    if (a > uForm + 1e-4) discard;
    float cut = uForm >= 1.0 ? 0.0 : 1.0 - smoothstep(0.0, max(uFormEdge, 0.002), uForm - a);

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (dot(N, V) < 0.0) N = -N;

    // Inscription bands round the waist and the sound-bow: a row of glyph
    // dashes between two rules.
    float y = vLocal.y;
    float band1 = smoothstep(0.012, 0.0, abs(y + 0.47) - 0.05);
    float band2 = smoothstep(0.012, 0.0, abs(y + 0.86) - 0.025);
    float rules = smoothstep(0.006, 0.0, abs(abs(y + 0.47) - 0.05)) + smoothstep(0.006, 0.0, abs(abs(y + 0.86) - 0.025));
    float glyph = step(0.55, hash13(vec3(floor(vAng * 64.0), floor((y + 0.47) * 40.0), 3.0))) * band1;
    float engr = clamp((rules + glyph * 0.8 + band2 * step(0.5, fract(vAng * 48.0))) * uInscribe, 0.0, 1.0) * uEngrave;
    // Turned rings on everything else.
    engr = max(engr, smoothstep(0.85, 1.0, abs(sin(y * 60.0))) * uEngrave * 0.35 * (1.0 - uInscribe));

    float pat = smoothstep(0.45, 0.85, snoise01(vLocal * 5.0 + uSeed)) * uPatina;
    pat = max(pat, engr * uPatina * 1.2);
    vec3 base = mix(uBrass, uBrassDark, engr * 0.8);
    base = mix(base, uPatinaColor, clamp(pat, 0.0, 1.0));

    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    vec3 F0 = mix(vec3(0.04), base, 0.85);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
    vec3 color = base * 0.15 * (0.2 + 0.8 * max(dot(N, L), 0.0));
    color += env * F * uEnv * (1.0 - pat * 0.7);
    color += base * pow(max(dot(N, H), 0.0), uGloss) * uSpecular * (1.0 - pat);
    color += base * 0.1;
    color += uGlowColor * pow(1.0 - ndv, 2.5) * uRimGlow * uGlobalGlow;

    // Struck: the lip and the inscription blaze.
    color += uGlowColor * vHot * uTollGlow * (0.4 + engr * 2.0) * uGlobalGlow;
    color += uFormColor * cut * 5.0 * uGlobalGlow;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const BELL_VERTEX = /* glsl */ `
  uniform float uRing;        // 0..1 how hard it is ringing
  uniform float uRingAmp;
  uniform float uRingPhase;   // integrated on the CPU
  uniform float uRingAxis;    // the mode's orientation
  uniform float uFlex;        // 1 on the bell, 0 on the gear and clapper

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;
  varying float vAng;
  varying float vHot;

  void main() {
    vec3 p = position;
    float ang = atan(p.z, p.x);
    // The (2,0) mode: the mouth squeezes to an oval one way, then the other,
    // growing toward the lip.
    float depth = clamp(-p.y, 0.0, 1.0);
    float flex = uFlex * uRing * uRingAmp * cos(2.0 * (ang - uRingAxis)) * sin(uRingPhase) * depth * depth;
    vec2 radial = length(p.xz) > 1e-4 ? normalize(p.xz) : vec2(0.0);
    p.xz += radial * flex;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vLocal = position;
    vAng = fract(ang * 0.15915494 + 1.0);
    vHot = uRing * (uFlex > 0.5 ? smoothstep(0.55, 1.0, depth) : 0.6);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

function brassUniforms(extra) {
  return sharedUniforms({
    uEnvMap: frame.uEnvMap,
    uBrass: { value: new Color() },
    uBrassDark: { value: new Color() },
    uPatinaColor: { value: new Color() },
    uGlowColor: { value: new Color() },
    uFormColor: { value: new Color() },
    uEnv: { value: 1.2 },
    uSpecular: { value: 2 },
    uGloss: { value: 50 },
    uEngrave: { value: 0.5 },
    uPatina: { value: 0.3 },
    uRimGlow: { value: 0.5 },
    uTollGlow: { value: 3 },
    uForm: { value: 1 },
    uFormEdge: { value: 0.06 },
    uSeed: { value: 0 },
    uInscribe: { value: 1 },
    ...extra
  });
}

function syncBrass(u, form, seed) {
  const c = settings[ID];
  const g = settings.global;
  u.uBrass.value.copy(getColor(c.colorBrass));
  u.uBrassDark.value.copy(getColor(c.colorBrassDark));
  u.uPatinaColor.value.copy(getColor(c.colorPatina));
  u.uGlowColor.value.copy(getColor(c.colorGlow));
  u.uFormColor.value.copy(getColor(c.colorForm));
  u.uEnv.value = c.brassEnv;
  u.uSpecular.value = c.brassSpecular;
  u.uGloss.value = Math.max(1, c.brassGloss);
  u.uEngrave.value = c.engrave;
  u.uPatina.value = c.patina;
  u.uRimGlow.value = c.rimGlow * g.fresnel;
  u.uTollGlow.value = c.tollGlow * g.glow * g.shaderIntensity;
  u.uForm.value = form;
  u.uFormEdge.value = c.formEdge;
  u.uSeed.value = seed;
}

/**
 * Brass for the bell (`flex` 1: it rings), the clapper and the wheel (0).
 * @param {number} flex
 */
export function createBellMaterial(flex) {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: brassUniforms({
      uRing: { value: 0 },
      uRingAmp: { value: 0.05 },
      uRingPhase: { value: 0 },
      uRingAxis: { value: 0 },
      uFlex: { value: flex }
    }),
    vertexShader: BELL_VERTEX,
    fragmentShader: BRASS_FRAGMENT
  });
  material.uniforms.uInscribe.value = flex;

  /** @param {object} state { form, ring, ringPhase, ringAxis, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const u = material.uniforms;
    syncBrass(u, state.form, state.seed);
    u.uRing.value = state.ring;
    u.uRingAmp.value = c.ringAmp;
    u.uRingPhase.value = state.ringPhase;
    u.uRingAxis.value = state.ringAxis;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The tines                                                            */
/* -------------------------------------------------------------------- */

/** Where tine `i` stands and how far it has risen. Shared by tines and strings. */
const RIM_GLSL = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;
  uniform float uCount;
  uniform float uSpin;        // the fence's starting angle
  uniform float uRiseClock;   // seconds since the tines began to rise
  uniform float uRiseTime;
  uniform float uStagger;
  uniform float uSink;        // 0..1 sinking back at the end
  uniform float uTineH;
  uniform float uTineW;

  float tineAngle(float i) { return uSpin + 6.2831853 * i / max(uCount, 1.0); }

  float tineRise(float i) {
    float t = (uRiseClock - uStagger * i / max(uCount, 1.0)) / max(uRiseTime, 0.01);
    t = clamp(t, 0.0, 1.0);
    float up = 1.0 - pow(1.0 - t, 3.0);
    // A small overshoot as it locks into place.
    up += 0.06 * sin(3.14159 * t) * (1.0 - t);
    return up * (1.0 - uSink);
  }

  /** Tine frame: x along the rim, y up, z out from the centre. */
  void tineFrame(float i, out vec3 base, out vec3 X, out vec3 Z) {
    float a = tineAngle(i);
    Z = vec3(cos(a), 0.0, sin(a));
    X = vec3(-Z.z, 0.0, Z.x);
    base = uCenter + Z * uRadius;
  }
`;

const TINE_VERTEX = /* glsl */ `
  attribute float aPart;
  attribute float aIndex;

  uniform float uTineR;
  uniform float uQuiver;      // radians, decaying, set when a front arrives
  uniform float uQuiverPhase;
  uniform float uHotTine;     // 0..1 the flare when a front arrives

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;
  varying float vAng;
  varying float vHot;

  ${RIM_GLSL}

  /** The fork's centreline in its own frame (x across, y up). */
  vec3 forkPoint(float s, float part) {
    float H = uTineH;
    float W = uTineW * 0.5;
    float Hb = H * 0.55;
    if (part > 0.5) {
      // The stem, from the bottom of the bend down into the floor.
      return vec3(0.0, mix(Hb - W, -0.3, s), 0.0);
    }
    float L1 = H - Hb;
    float arc = 3.14159265 * W;
    float total = 2.0 * L1 + arc;
    float d = s * total;
    if (d < L1) return vec3(-W, H - d, 0.0);
    if (d < L1 + arc) {
      float a = 3.14159265 * (1.0 + (d - L1) / arc);
      return vec3(W * cos(a), Hb + W * sin(a), 0.0);
    }
    return vec3(W, Hb + (d - L1 - arc), 0.0);
  }

  void main() {
    if (aIndex >= uCount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float s = position.x;
    float ang = position.y * 6.2831853;
    vec3 c = forkPoint(s, aPart);
    vec3 T = normalize(forkPoint(min(s + 0.01, 1.0), aPart) - forkPoint(max(s - 0.01, 0.0), aPart) + vec3(0.0, 1e-5, 0.0));
    vec3 B = vec3(0.0, 0.0, 1.0);
    vec3 Nn = normalize(cross(B, T));
    vec3 radial = cos(ang) * Nn + sin(ang) * B;
    // The prongs taper to their tips; the stem is thicker.
    float r = uTineR * (aPart > 0.5 ? 1.5 : 1.0);
    vec3 l = c + radial * r;

    // Quiver: the prongs ring, bending sideways more toward their tips.
    float tip = smoothstep(uTineH * 0.5, uTineH, l.y);
    l.x += uQuiver * tip * sin(uQuiverPhase + aIndex * 1.7) * uTineH * 0.5 * sign(l.x + 1e-4);

    vec3 base;
    vec3 X;
    vec3 Z;
    tineFrame(aIndex, base, X, Z);
    float rise = tineRise(aIndex);
    vec3 world = base + X * l.x + vec3(0.0, 1.0, 0.0) * (l.y - (1.0 - rise) * (uTineH + 0.4)) + Z * l.z;
    vNormalW = normalize(X * radial.x + vec3(0.0, 1.0, 0.0) * radial.y + Z * radial.z);
    vWorld = world;
    vLocal = vec3(l.x, l.y / max(uTineH, 0.1), aIndex);
    vAng = 0.0;
    vHot = uHotTine * (0.4 + 0.6 * tip);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TINE_FRAGMENT = BRASS_FRAGMENT.replace(
  'void main() {',
  `void main() {
    if (vWorld.y < -0.01) discard;`
);

function rimUniforms() {
  return {
    uCenter: { value: new Vector3() },
    uRadius: { value: 4 },
    uCount: { value: 12 },
    uSpin: { value: 0 },
    uRiseClock: { value: 0 },
    uRiseTime: { value: 0.4 },
    uStagger: { value: 0.3 },
    uSink: { value: 0 },
    uTineH: { value: 2.4 },
    uTineW: { value: 0.26 }
  };
}

/** @param {object} rim { center, spin, riseClock, sink } */
function syncRim(u, rim) {
  const c = settings[ID];
  const g = settings.global;
  u.uCenter.value.copy(rim.center);
  u.uRadius.value = Math.max(0.3, c.zoneRadius);
  u.uCount.value = Math.max(3, Math.min(MAX_TINES, Math.round(c.tines)));
  u.uSpin.value = rim.spin;
  u.uRiseClock.value = rim.riseClock;
  u.uRiseTime.value = Math.max(0.02, c.riseTime * g.lifetime);
  u.uStagger.value = Math.max(0, c.riseStagger * g.lifetime);
  u.uSink.value = rim.sink;
  u.uTineH.value = Math.max(0.2, c.tineHeight);
  u.uTineW.value = Math.max(0.02, c.tineWidth);
}

export function createTineMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: brassUniforms({
      ...rimUniforms(),
      uTineR: { value: 0.045 },
      uQuiver: { value: 0 },
      uQuiverPhase: { value: 0 },
      uHotTine: { value: 0 }
    }),
    vertexShader: TINE_VERTEX,
    fragmentShader: TINE_FRAGMENT
  });
  material.uniforms.uInscribe.value = 0;

  /** @param {object} rim { center, spin, riseClock, sink, quiver, quiverPhase, hot, seed } */
  material.userData.sync = (rim) => {
    const c = settings[ID];
    const u = material.uniforms;
    syncBrass(u, 1, rim.seed);
    syncRim(u, rim);
    u.uTollGlow.value = c.tineGlow * settings.global.glow;
    u.uTineR.value = Math.max(0.005, c.tineThickness);
    u.uQuiver.value = rim.quiver;
    u.uQuiverPhase.value = rim.quiverPhase;
    u.uHotTine.value = rim.hot;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The strings                                                          */
/* -------------------------------------------------------------------- */

const STRING_VERTEX = /* glsl */ `
  attribute float aGap;
  attribute float aRow;

  uniform float uRows;
  uniform float uLow;
  uniform float uHigh;
  uniform float uAmp;
  uniform float uPhase;       // integrated ωt
  uniform float uModes;
  uniform float uWidth;
  uniform float uSnap;        // 0..1 the release: each string parts at its middle and recoils

  varying vec2  vRib;
  varying float vSwing;
  varying float vViewZ;

  ${RIM_GLSL}

  vec3 endA(float i, float h) {
    vec3 base; vec3 X; vec3 Z;
    tineFrame(i, base, X, Z);
    return base + X * (uTineW * 0.5) + vec3(0.0, h * tineRise(i), 0.0);
  }
  vec3 endB(float i, float h) {
    float j = mod(i + 1.0, max(uCount, 1.0));
    vec3 base; vec3 X; vec3 Z;
    tineFrame(j, base, X, Z);
    return base - X * (uTineW * 0.5) + vec3(0.0, h * tineRise(j), 0.0);
  }

  vec3 stringPoint(float s, float gap, float row) {
    float h = uTineH * mix(uLow, uHigh, uRows > 1.5 ? row / (uRows - 1.0) : 0.5);
    vec3 A = endA(gap, h);
    vec3 B = endB(gap, h);
    // Snapped: each hf curls back toward its own tine.
    float hf = s < 0.5 ? s * 2.0 : (1.0 - s) * 2.0;
    float keep = 1.0 - uSnap;
    float sh = hf * keep;
    float s2 = s < 0.5 ? sh * 0.5 : 1.0 - sh * 0.5;
    vec3 p = mix(A, B, s2);
    vec3 out_ = normalize(vec3((A + B).x * 0.5 - uCenter.x, 0.0, (A + B).z * 0.5 - uCenter.z) + vec3(1e-4, 0.0, 0.0));
    float wave = sin(3.14159265 * uModes * s2) * cos(uPhase + gap * 1.3 + row * 2.1);
    p += (vec3(0.0, 0.75, 0.0) + out_ * 0.45) * uAmp * wave * keep;
    // The recoil whips the loose ends up and out.
    p += (vec3(0.0, 0.6, 0.0) + out_) * uSnap * (1.0 - hf) * 0.6;
    return p;
  }

  void main() {
    if (aGap >= uCount || aRow >= uRows) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float s = position.x;
    vec3 c = stringPoint(s, aGap, aRow);
    vec3 T = stringPoint(min(s + 0.02, 1.0), aGap, aRow) - stringPoint(max(s - 0.02, 0.0), aGap, aRow);
    vec3 toCam = normalize(cameraPosition - c);
    vec3 W = normalize(cross(T + vec3(1e-5, 0.0, 0.0), toCam));
    vec3 world = c + W * position.y * uWidth;
    vRib = vec2(s, position.y);
    vSwing = abs(sin(3.14159265 * uModes * s));
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const STRING_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlow;
  uniform float uStrung;      // 0..1 how much the strings exist
  uniform float uPulse;       // the toll running along them
  uniform float uSnap;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying vec2  vRib;
  varying float vSwing;
  varying float vViewZ;

  void main() {
    // Strung from both ends toward the middle.
    float strung = 1.0 - smoothstep(uStrung * 0.5 - 0.02, uStrung * 0.5 + 0.02, abs(vRib.x - 0.5) * -1.0 + 0.5);
    float core = 1.0 - smoothstep(0.0, 1.0, abs(vRib.y));
    float a = core * strung * (1.0 - uSnap * uSnap);
    if (a < 0.004) discard;
    vec3 col = mix(uColorB, uColorA, core * core + vSwing * 0.3);
    float bright = uGlow * (0.6 + 0.6 * vSwing + uPulse * 1.5);
    gl_FragColor = vec4(col * bright * a * uGlobalGlow, a);
  }
`;

export function createStringMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...rimUniforms(),
      uRows: { value: 3 },
      uLow: { value: 0.6 },
      uHigh: { value: 0.95 },
      uAmp: { value: 0.1 },
      uPhase: { value: 0 },
      uModes: { value: 2 },
      uWidth: { value: 0.03 },
      uSnap: { value: 0 },
      uGlow: { value: 3 },
      uStrung: { value: 0 },
      uPulse: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: STRING_VERTEX,
    fragmentShader: STRING_FRAGMENT
  });

  /** @param {object} st { center, spin, riseClock, sink, phase, strung, amp, pulse, snap } */
  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncRim(u, st);
    u.uRows.value = Math.max(1, Math.min(STRING_ROWS, Math.round(c.strings)));
    u.uLow.value = c.stringLow;
    u.uHigh.value = c.stringHigh;
    u.uAmp.value = c.stringAmp * st.amp;
    u.uPhase.value = st.phase;
    u.uModes.value = Math.max(1, Math.round(c.stringModes));
    u.uWidth.value = Math.max(0.003, c.stringWidth);
    u.uSnap.value = st.snap;
    u.uGlow.value = c.stringGlow * g.glow;
    u.uStrung.value = st.strung;
    u.uPulse.value = st.pulse;
    u.uColorA.value.copy(getColor(c.colorStringA));
    u.uColorB.value.copy(getColor(c.colorStringB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The sound fronts                                                     */
/* -------------------------------------------------------------------- */

const FRONT_VERTEX = /* glsl */ `
  uniform vec3  uMouth;       // centre of the bell's mouth when it was struck
  uniform float uMouthR;
  uniform vec3  uCenter;      // the circle on the floor
  uniform float uRadius;
  uniform float uHeight;      // where it meets the tines
  uniform float uProgress;
  uniform float uWidth;

  varying vec2  vBand;
  varying float vViewZ;

  vec3 conePoint(float p, float a) {
    float r = mix(uMouthR, uRadius, p);
    // It sags as it spreads: sound falling on the circle.
    vec3 c = mix(uMouth, uCenter + vec3(0.0, uHeight, 0.0), p);
    return c + vec3(cos(a), 0.0, sin(a)) * r;
  }

  void main() {
    float a = position.x * 6.2831853;
    float p = uProgress;
    vec3 c = conePoint(p, a);
    vec3 slant = normalize(conePoint(min(p + 0.02, 1.0), a) - conePoint(max(p - 0.02, 0.0), a) + vec3(0.0, -1e-4, 0.0));
    vec3 world = c + slant * position.y * uWidth * 0.5;
    vBand = vec2(position.x, position.y);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRONT_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uProgress;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uRipples;
  uniform float uSeed;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying vec2  vBand;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float across = vBand.y;
    float edge = 1.0 - smoothstep(0.3, 1.0, abs(across));
    float lead = exp(-pow((across + 0.6) / 0.25, 2.0));
    float rip = 0.5 + 0.5 * cos(across * uRipples * 3.14159 + uTime * 12.0);
    float breakup = 0.75 + 0.25 * snoise(vec3(vBand.x * 24.0, uSeed, uTime * 2.0));
    float life = sin(3.14159 * clamp(uProgress, 0.0, 1.0)) * (1.0 - 0.5 * uProgress);
    float a = edge * (0.4 * rip + lead) * breakup * life * uOpacity;
    if (a < 0.003) discard;
    vec2 suv = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, suv, vViewZ, uCameraNear, uCameraFar, 0.4);
    vec3 col = mix(uColorB, uColorA, lead + rip * 0.3);
    gl_FragColor = vec4(col * uGlow * a * uGlobalGlow, a);
  }
`;

export function createFrontMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uMouth: { value: new Vector3() },
      uMouthR: { value: 1.2 },
      uCenter: { value: new Vector3() },
      uRadius: { value: 4 },
      uHeight: { value: 1.6 },
      uProgress: { value: 0 },
      uWidth: { value: 0.5 },
      uGlow: { value: 2 },
      uOpacity: { value: 0.5 },
      uRipples: { value: 5 },
      uSeed: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: FRONT_VERTEX,
    fragmentShader: FRONT_FRAGMENT
  });

  /** @param {object} f { mouth, mouthR, center, progress, scale, seed } */
  material.userData.sync = (f) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uMouth.value.copy(f.mouth);
    u.uMouthR.value = f.mouthR;
    u.uCenter.value.copy(f.center);
    u.uRadius.value = Math.max(0.3, c.zoneRadius);
    u.uHeight.value = c.tineHeight * mix(c.stringLow, c.stringHigh, 0.5);
    u.uProgress.value = f.progress;
    u.uWidth.value = c.frontWidth * f.scale;
    u.uGlow.value = c.frontGlow * g.glow * f.scale;
    u.uOpacity.value = c.frontOpacity * g.opacity;
    u.uRipples.value = c.frontRipples;
    u.uSeed.value = f.seed;
    u.uColorA.value.copy(getColor(c.colorFrontA));
    u.uColorB.value.copy(getColor(c.colorFrontB));
  };

  return material;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

/* -------------------------------------------------------------------- */
/* The floor                                                            */
/* -------------------------------------------------------------------- */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vXZ;
  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    world.y = 0.02;
    vXZ = position.xy * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;
  uniform float uDraw;        // 0..1 the band drawn round as the cast arrives
  uniform float uBandWidth;
  uniform float uBandGlow;
  uniform float uWaveScale;
  uniform float uWaveGlow;
  uniform float uHold;        // 0..1 how held the circle is
  uniform float uToll;        // 0..1 the latest toll, decaying
  uniform float uOpacity;
  uniform vec3  uBand;
  uniform vec3  uWave;
  uniform vec3  uHeld;
  uniform float uWash;
  uniform float uGlobalGlow;

  varying vec2 vXZ;

  ${noiseGLSL}

  void main() {
    float r = length(vXZ);
    float ang = atan(vXZ.y, vXZ.x);
    float a01 = fract(ang * 0.15915494 + 1.0);
    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // The resonance band: two rules and a sine running round between them,
    // drawn round as the cast arrives.
    float bw = max(uBandWidth, 0.02);
    float dr = r - uRadius;
    float drawn = step(a01, uDraw);
    float rules = exp(-pow((abs(dr) - bw * 0.5) / 0.018, 2.0));
    float sineY = sin(ang * 24.0 - uTime * 2.0 * uHold) * bw * 0.32;
    float sineL = exp(-pow((dr - sineY) / 0.02, 2.0));
    float band = (rules + sineL * 0.8) * drawn;
    col += uBand * band * uBandGlow * (1.0 + uToll * 2.0);
    alpha = max(alpha, band);

    // Inside: standing waves — rings whose nodes stay put while their
    // amplitude beats with the tolls.
    float inside = 1.0 - smoothstep(uRadius - 0.3, uRadius, r);
    float k = uWaveScale * 6.2831853;
    float standing = cos(k * r) * cos(k * (uRadius - r) * 0.5);
    float amp = uHold * (0.35 + 0.65 * uToll) * (0.75 + 0.25 * sin(uTime * 3.0));
    float wave = smoothstep(0.55, 1.0, abs(standing)) * amp * inside;
    // The held wash fills the circle: a dial of minute ticks round the inside
    // of the band, and a slow amber tide over the floor.
    float ticks = step(0.82, abs(cos(ang * 30.0))) * smoothstep(uRadius - 0.9, uRadius - 0.55, r) * (1.0 - smoothstep(uRadius - 0.35, uRadius - 0.25, r));
    float wash = inside * uHold * uWash * (0.6 + 0.4 * snoise(vec3(vXZ * 0.6, uSeed)));
    wave = max(wave, ticks * uHold * 0.9);
    col += uWave * wave * uWaveGlow + uHeld * wash;
    alpha = max(alpha, max(wave, wash));

    float a = clamp(alpha, 0.0, 1.0) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, a);
  }
`;

export function createFloorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 5 },
      uSeed: { value: 0 },
      uRadius: { value: 4 },
      uDraw: { value: 0 },
      uBandWidth: { value: 0.4 },
      uBandGlow: { value: 1.5 },
      uWaveScale: { value: 3 },
      uWaveGlow: { value: 1 },
      uHold: { value: 0 },
      uToll: { value: 0 },
      uOpacity: { value: 1 },
      uBand: { value: new Color() },
      uWave: { value: new Color() },
      uHeld: { value: new Color() },
      uWash: { value: 0.5 }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} f { center, draw, hold, toll, fade, seed } */
  material.userData.sync = (f) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(f.center);
    u.uSize.value = c.zoneRadius + c.bandWidth + 0.6;
    u.uSeed.value = f.seed;
    u.uRadius.value = Math.max(0.3, c.zoneRadius);
    u.uDraw.value = f.draw;
    u.uBandWidth.value = c.bandWidth;
    u.uBandGlow.value = c.bandGlow * g.glow;
    u.uWaveScale.value = c.waveScale * g.noiseFrequency;
    u.uWaveGlow.value = c.waveGlow * g.glow;
    u.uHold.value = f.hold;
    u.uToll.value = f.toll;
    u.uOpacity.value = c.floorOpacity * g.opacity * f.fade;
    u.uBand.value.copy(getColor(c.colorBand));
    u.uWave.value.copy(getColor(c.colorWave));
    u.uHeld.value.copy(getColor(c.colorHeld));
    u.uWash.value = c.washStrength;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The held field — the curtain of stopped sound                        */
/* -------------------------------------------------------------------- */

const CURTAIN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vXZ;
  varying vec3 vWorld;
  varying float vViewZ;
  void main() {
    vUv = uv;
    vXZ = position.xz;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const CURTAIN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uHold;        // 0..1 how much of the field stands
  uniform float uToll;        // the latest toll, decaying
  uniform float uSnap;        // 0..1 the release tears it upward
  uniform float uBands;       // standing bands up the wall
  uniform float uCount;       // tines, for the seams
  uniform float uSpin;
  uniform float uGlow;
  uniform float uOpacity;
  uniform vec3  uColorA;      // the hot crest
  uniform vec3  uColorB;      // the amber body
  uniform vec3  uColorDeep;   // the dark umber the wall is made of
  uniform float uGlobalGlow;

  varying vec2 vUv;
  varying vec2 vXZ;
  varying vec3 vWorld;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float y = vUv.y;
    // Measured like the fence: from +x toward +z.
    float ang = atan(vXZ.y, vXZ.x);
    // Standing bands: nodes fixed up the wall, their brightness beating with
    // the tolls — sound that has stopped where it was.
    float st = abs(sin(y * uBands * 3.14159265));
    float crest = pow(st, 6.0) * (0.55 + 0.45 * uToll);
    // Seams where each tine holds the wall, and a fine grain of held dust.
    float seam = exp(-pow(sin((ang - uSpin) * uCount * 0.5) * 6.0, 2.0));
    float grain = snoise(vec3(vXZ * 3.0, y * 10.0 + uSeed + uTime * 0.05)) * 0.5 + 0.5;
    // Solid at the floor, thinning to nothing at the top.
    float body = (1.0 - smoothstep(0.35, 1.0, y)) * (0.65 + 0.35 * grain);
    // The release tears it away from the floor upward.
    float tear = snoise(vec3(vXZ * 1.5, y * 2.0 + uSeed)) * 0.5 + 0.5;
    float keep = smoothstep(uSnap * 1.3 - 0.15, uSnap * 1.3, tear + y * 0.3);
    float a = (body * 0.55 + crest * 0.6 + seam * 0.35) * uHold * keep * uOpacity;
    if (a < 0.004) discard;
    // Umber at the floor and in the troughs, amber through the body, the
    // crests hot: the four-stop ramp of the cast, deep stop first.
    vec3 col = mix(uColorDeep, uColorB, clamp(0.25 + body * 0.5 + crest + seam * 0.5, 0.0, 1.0));
    col += uColorB * body * 0.45 * uGlow * uGlobalGlow;
    col += uColorA * crest * uGlow * (0.5 + uToll) * uGlobalGlow;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createCurtainMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uHold: { value: 0 },
      uToll: { value: 0 },
      uSnap: { value: 0 },
      uBands: { value: 6 },
      uCount: { value: 14 },
      uSpin: { value: 0 },
      uGlow: { value: 1.4 },
      uOpacity: { value: 0.5 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: CURTAIN_VERTEX,
    fragmentShader: CURTAIN_FRAGMENT
  });

  /** @param {object} f { hold, toll, snap, spin, seed } */
  material.userData.sync = (f) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = f.seed;
    u.uHold.value = f.hold;
    u.uToll.value = f.toll;
    u.uSnap.value = f.snap;
    u.uBands.value = c.curtainBands;
    u.uCount.value = Math.max(3, Math.min(MAX_TINES, Math.round(c.tines)));
    u.uSpin.value = f.spin;
    u.uGlow.value = c.curtainGlow * g.glow * g.shaderIntensity;
    u.uOpacity.value = c.curtainOpacity * g.opacity;
    u.uColorA.value.copy(getColor(c.colorCurtainA));
    u.uColorB.value.copy(getColor(c.colorCurtainB));
    u.uColorDeep.value.copy(getColor(c.colorCurtainDeep));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The air — LAYER.DISTORTION                                           */
/* -------------------------------------------------------------------- */

const AIR_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const AIR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uRing;        // 0..1 the latest toll's ring progress (0 = none)
  uniform float uHold;        // 0..1 the still shimmer
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    vec2 dir = vUv / max(r, 1e-4);
    vec2 off = vec2(0.0);
    float strength = 0.0;
    if (uRing > 0.0 && uRing < 1.0) {
      float R = 0.1 + 0.9 * uRing;
      float d = (r - R) / 0.07;
      float m = exp(-d * d) * (1.0 - uRing);
      off += dir * clamp(-d * exp(-d * d) * 2.0, -1.0, 1.0) * m;
      strength = uStrength * m;
    }
    // Held air: barely moving, a slow vertical shimmer.
    float hold = uHold * (1.0 - smoothstep(0.5, 1.0, r)) * 0.35;
    off += vec2(snoise(vec3(vUv * 4.0, uTime * 0.15)), snoise(vec3(vUv * 4.0 + 5.0, uTime * 0.15))) * hold;
    strength = max(strength, uStrength * hold);
    strength *= uShaderIntensity;
    if (strength < 0.002) discard;
    float len = length(off);
    if (len > 1.0) off /= len;
    gl_FragColor = vec4(off * 0.5 + 0.5, strength, 1.0);
  }
`;

export function createAirMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 5 },
      uRing: { value: 0 },
      uHold: { value: 0 },
      uStrength: { value: 1 }
    }),
    vertexShader: AIR_VERTEX,
    fragmentShader: AIR_FRAGMENT
  });

  /** @param {object} a { center, size, ring, hold } */
  material.userData.sync = (a) => {
    const c = settings[ID];
    const u = material.uniforms;
    u.uCenter.value.copy(a.center);
    u.uSize.value = a.size;
    u.uRing.value = a.ring;
    u.uHold.value = a.hold;
    u.uStrength.value = c.tollWarp * settings.global.distortion;
  };

  return material;
}
