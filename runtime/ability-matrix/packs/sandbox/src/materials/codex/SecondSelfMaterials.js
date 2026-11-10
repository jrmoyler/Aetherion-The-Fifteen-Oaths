import {
  AdditiveBlending,
  Color,
  CustomBlending,
  DoubleSide,
  FrontSide,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector3
} from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Second Self — the bespoke shaders the golden double is drawn with.
 *
 *  - **the figure** (`createFigureMaterial`) — instanced capsules, one per
 *    limb, each swept between two joint positions the CPU poses every frame
 *    (per-instance `aA`, `aB`, `aR`, `aFade`). Additive, hollow light: a hot
 *    gold fresnel rim and a dim core, time-bands falling down the body, a
 *    heartbeat that brightens all of it, flicker, and a per-figure dissolve so
 *    the afterimages are eaten away the further back in time they are.
 *  - **the run** (`createRunMaterial`) — a strip on the floor down the line:
 *    the gold thread the heartbeat runs along, and the *footprints* the
 *    double will step in, worked out analytically from the same path the CPU
 *    runs the double along — laid down glowing when the heartbeat passes,
 *    flaring when the double lands in them, cooling to embers.
 *  - **the braid** (`createBraidMaterial`) — a camera-facing ribbon twisted
 *    round the double's path behind it; two of them, half a turn apart, are
 *    the braid it leaves in the air.
 *  - **the wake** (`createWakeMaterial`) — LAYER.DISTORTION: a ripple round
 *    the running double, and the finale's shock ring.
 *
 * `PATH_GLSL` is the path; `SecondSelfAbility#_pathLat` is its CPU twin.
 * Every material reads `settings.secondself` in `userData.sync(state)`.
 */

const ID = 'secondself';

/** The path the double runs, in the line's own frame. CPU twin: `_pathLat`. */
const PATH_GLSL = /* glsl */ `
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uWeave;
  uniform float uPitch;
  uniform float uStepOut;

  float pathLat(float a) {
    float env = smoothstep(0.0, 1.6, a) * (1.0 - smoothstep(uLength - 1.4, uLength, a));
    float stepOut = uStepOut * (1.0 - smoothstep(0.0, 1.6, a));
    return uWeave * sin(6.2831853 * a / max(uPitch, 0.1)) * env + stepOut;
  }

  vec3 pathPoint(float a) {
    return uOrigin + uDir * a + uSide * pathLat(a);
  }
`;

function pathUniforms() {
  return {
    uOrigin: { value: new Vector3() },
    uDir: { value: new Vector3(0, 0, 1) },
    uSide: { value: new Vector3(1, 0, 0) },
    uLength: { value: 10 },
    uWeave: { value: 0.9 },
    uPitch: { value: 4 },
    uStepOut: { value: 0.3 }
  };
}

/** @param {object} p { origin, dir, side, length } */
function syncPath(u, p) {
  const c = settings[ID];
  u.uOrigin.value.copy(p.origin);
  u.uDir.value.copy(p.dir);
  u.uSide.value.copy(p.side);
  u.uLength.value = p.length;
  u.uWeave.value = c.braidWidth * settings.global.randomness;
  u.uPitch.value = c.braidPitch;
  u.uStepOut.value = c.stepOut;
}

/* -------------------------------------------------------------------- */
/* The figure                                                           */
/* -------------------------------------------------------------------- */

const FIGURE_VERTEX = /* glsl */ `
  attribute vec3  aA;
  attribute vec3  aB;
  attribute float aR;
  attribute float aFade;      // this figure's share: 1 the double, less for echoes
  attribute float aSeed;

  uniform float uHalfLen;     // the capsule geometry's half cylinder length

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vWorld;
  varying float vFade;
  varying float vSeed;
  varying float vViewZ;

  void main() {
    vec3 axis = aB - aA;
    float len = length(axis);
    vec3 Y = len > 1e-4 ? axis / len : vec3(0.0, 1.0, 0.0);
    vec3 ref = abs(Y.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 X = normalize(cross(ref, Y));
    vec3 Z = cross(X, Y);
    // The capsule's cylinder runs y in [-h, h]; its caps beyond. Where along
    // A→B a vertex sits comes from the clamped y; the rest is the sphere swept.
    float t = clamp(position.y / max(2.0 * uHalfLen, 1e-4) + 0.5, 0.0, 1.0);
    vec3 off = position - vec3(0.0, clamp(position.y, -uHalfLen, uHalfLen), 0.0);
    vec3 world = mix(aA, aB, t) + (X * off.x + Y * off.y + Z * off.z) * aR;
    vNormalW = normalize(X * normal.x + Y * normal.y + Z * normal.z);
    vWorld = world;
    vViewDir = cameraPosition - world;
    vFade = aFade;
    vSeed = aSeed;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FIGURE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uBeat;        // 0..1+ the heartbeat right now
  uniform float uBeatGlow;
  uniform float uBodyGlow;    // albedo brightness of the gold
  uniform float uRimGlow;
  uniform float uRimPower;
  uniform float uBandScale;
  uniform float uBandSpeed;
  uniform float uBandGlow;
  uniform float uFlicker;
  uniform float uOpacity;
  uniform float uFlare;       // the finale: a hot flash through it
  uniform float uWrap;        // how far the sun wraps round the limbs
  uniform float uSpec;        // the polished-gold highlight
  uniform float uSandY;       // world height above which it has gone to sand
  uniform float uSandEdge;    // metres of glowing edge on the dissolve
  uniform float uSandGlow;
  uniform vec3  uCore;
  uniform vec3  uBody;
  uniform vec3  uRim;
  uniform vec3  uDeep;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vWorld;
  varying float vFade;
  varying float vSeed;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    if (vFade <= 0.002) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float rim = pow(1.0 - ndv, max(uRimPower, 0.3));

    // An afterimage is a figure being forgotten: eaten by noise, harder the
    // further back it is.
    float n = snoise01(vWorld * 3.5 + vec3(0.0, uTime * 0.8, vSeed));
    float keep = smoothstep(1.0 - vFade - 0.08, 1.0 - vFade + 0.08, n * 0.85 + 0.15);
    if (keep < 0.5) discard;

    // Running out of time: it pours away as sand from the crown down.
    float sn = snoise(vWorld * 7.0 + vec3(0.0, -uTime * 1.5, vSeed)) * 0.09;
    float cut = vWorld.y + sn - uSandY;
    if (cut > 0.0) discard;
    float sandEdge = 1.0 - smoothstep(0.0, max(uSandEdge, 0.005), -cut);

    // A solid, sunlit body of gold: a four-stop ramp keyed off the light.
    // deep bronze in shadow → saturated gold → pale tint → white-hot highlight.
    float lam = dot(N, normalize(uLightDir));
    float diff = clamp((lam + uWrap) / (1.0 + uWrap), 0.0, 1.0);
    float up = N.y * 0.5 + 0.5;
    vec3 base = mix(uDeep, uBody, smoothstep(0.05, 0.75, diff * (0.75 + 0.25 * up)));
    base = mix(base, uRim, smoothstep(0.8, 1.0, diff) * 0.45);
    vec3 H = normalize(normalize(uLightDir) + V);
    float spec = pow(max(dot(N, H), 0.0), 36.0) * uSpec;

    // Bands of time running down the body (engraved, glowing faintly).
    float bands = smoothstep(0.6, 1.0, sin((vWorld.y + uTime * uBandSpeed) * uBandScale * 6.2831853 * 0.25) * 0.5 + 0.5);
    float flick = 1.0 - uFlicker * 0.5 * (0.5 + 0.5 * snoise(vec3(uTime * 9.0, vSeed, 0.0)));

    vec3 col = base * (0.3 + 0.9 * diff) * uBodyGlow;
    col += uCore * spec;
    col += uBody * bands * uBandGlow * 0.35 * uShaderIntensity * (0.4 + 0.6 * diff);
    col += uRim * rim * uRimGlow * flick;
    col += uBody * uBeat * uBeatGlow * 0.18;
    col += uCore * sandEdge * uSandGlow;
    col *= 1.0 + uFlare * 1.2;

    float a = uOpacity * mix(0.55, 1.0, vFade);
    gl_FragColor = vec4(col * uGlobalGlow, a);
  }
`;

export function createFigureMaterial(halfLen) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHalfLen: { value: halfLen },
      uBeat: { value: 0 },
      uBeatGlow: { value: 1 },
      uBodyGlow: { value: 1 },
      uRimGlow: { value: 3 },
      uRimPower: { value: 2 },
      uBandScale: { value: 8 },
      uBandSpeed: { value: 2 },
      uBandGlow: { value: 1 },
      uFlicker: { value: 0.2 },
      uOpacity: { value: 1 },
      uFlare: { value: 0 },
      uWrap: { value: 0.4 },
      uSpec: { value: 1 },
      uSandY: { value: 1e3 },
      uSandEdge: { value: 0.12 },
      uSandGlow: { value: 3 },
      uCore: { value: new Color() },
      uBody: { value: new Color() },
      uRim: { value: new Color() },
      uDeep: { value: new Color() }
    }),
    vertexShader: FIGURE_VERTEX,
    fragmentShader: FIGURE_FRAGMENT
  });

  /** @param {object} state { beat, flare, sandY } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uBeat.value = state.beat;
    u.uBeatGlow.value = c.beatGlow;
    u.uBodyGlow.value = c.bodyGlow;
    u.uRimGlow.value = c.rimGlow * g.glow * g.fresnel;
    u.uRimPower.value = c.rimPower;
    u.uBandScale.value = c.bandScale * g.noiseFrequency;
    u.uBandSpeed.value = c.bandSpeed * g.noiseSpeed;
    u.uBandGlow.value = c.bandGlow * g.glow;
    u.uFlicker.value = c.flicker * g.noiseStrength;
    u.uOpacity.value = Math.min(1, c.opacity * g.opacity);
    u.uFlare.value = state.flare;
    u.uWrap.value = c.lightWrap;
    u.uSpec.value = c.specular * g.glow;
    u.uSandY.value = state.sandY;
    u.uSandEdge.value = c.sandEdge;
    u.uSandGlow.value = c.sandGlow * g.glow;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uRim.value.copy(getColor(c.colorRim));
    u.uDeep.value.copy(getColor(c.colorDeep));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The run — thread and footprints                                      */
/* -------------------------------------------------------------------- */

const RUN_VERTEX = /* glsl */ `
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uHalfWidth;

  varying vec2 vFlat;         // x: metres across, y: metres along

  void main() {
    float across = position.y * uHalfWidth;
    float along = position.x * (uLength + 1.0) - 0.5;
    vec3 world = uOrigin + uSide * across + uDir * along;
    world.y = 0.018;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RUN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uFront;       // where the heartbeat has got to, metres
  uniform float uDouble;      // where the double has got to
  uniform float uSpeed;
  uniform float uStep;        // metres between footprints (half a stride)
  uniform float uFoot;
  uniform float uFootSide;
  uniform float uFootGlow;
  uniform float uStepGlow;
  uniform float uCool;
  uniform float uThreadGlow;
  uniform float uThreadWidth;
  uniform float uBeat;
  uniform float uFade;
  uniform vec3  uHot;
  uniform vec3  uWarm;
  uniform vec3  uCold;
  uniform vec3  uThread;
  uniform float uTrailWidth;   // metres either side of the path the worn band covers
  uniform float uTrailOpacity;
  uniform float uTrailGlow;
  uniform vec3  uTrailDeep;
  uniform vec3  uTrailBody;
  uniform float uShadow;       // the double's contact shadow
  uniform float uShadowSize;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}
  ${PATH_GLSL}

  /** A footprint in its own frame: u heel → toe, v across. */
  float print(vec2 p, float F) {
    vec2 a = (p - vec2(0.16 * F, 0.0)) / vec2(0.34 * F, 0.17 * F);
    vec2 b = (p - vec2(-0.3 * F, 0.0)) / vec2(0.2 * F, 0.13 * F);
    float m = max(1.0 - smoothstep(0.75, 1.0, length(a)), 1.0 - smoothstep(0.7, 1.0, length(b)));
    // Toes: a row of four beads at the front.
    float toes = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec2 tc = vec2(0.56 * F - abs(fi - 1.5) * 0.05 * F, (fi - 1.5) * 0.085 * F);
      toes = max(toes, 1.0 - smoothstep(0.035 * F, 0.055 * F, length(p - tc)));
    }
    return max(m, toes);
  }

  void main() {
    float x = vFlat.x;
    float y = vFlat.y;
    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // The footprints the double will run in, laid down ahead of it.
    float k0 = floor(y / max(uStep, 0.05));
    for (int j = -1; j <= 1; j++) {
      float k = k0 + float(j);
      if (k < 1.0) continue;
      float a = k * uStep;
      if (a > uLength) continue;
      float lat = pathLat(a);
      float dl = (pathLat(a + 0.05) - pathLat(a - 0.05)) / 0.1;
      vec2 T = normalize(vec2(dl, 1.0));
      vec2 Nn = vec2(T.y, -T.x);
      float side = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
      vec2 c = vec2(lat, a) + Nn * side * uFootSide;
      vec2 d = vec2(x, y) - c;
      vec2 q = vec2(dot(d, T), dot(d, Nn) * side);
      float m = print(q, uFoot);
      if (m <= 0.0) continue;
      float laid = (uFront - a) / max(uSpeed, 0.1);           // seconds since the heartbeat put it there
      float trod = (uDouble - a) / max(uSpeed, 0.1);          // seconds since the double landed in it
      if (laid < 0.0) continue;
      float glow = uFootGlow * (0.55 + 0.45 * exp(-laid * 6.0)) * (1.0 + uBeat * 0.6);
      vec3 c0 = uWarm;
      if (trod >= 0.0) {
        float h = exp(-trod / max(uCool, 0.05));
        glow = mix(uFootGlow * 0.12, uStepGlow, h);
        c0 = mix(uCold, mix(uWarm, uHot, smoothstep(0.4, 1.0, h)), smoothstep(0.0, 0.25, h));
      }
      float flick = 0.8 + 0.2 * snoise(vec3(q * 6.0, uSeed + k));
      col += c0 * glow * m * flick;
      alpha = max(alpha, m);
    }

    // The thread: the heartbeat's own path, brightest at its running head.
    float lat = pathLat(y);
    float dx = x - lat;
    float tm = exp(-(dx * dx) / max(uThreadWidth * uThreadWidth, 1e-6));
    float exists = smoothstep(-0.2, 0.3, y) * (1.0 - smoothstep(uFront - 0.05, uFront + 0.05, y));
    float head = exp(-pow((uFront - y) / 0.5, 2.0)) * 3.0;
    float pulse = 0.6 + 0.4 * sin((y - uTime * uSpeed * 0.5) * 2.0);
    // Behind the double the thread has been spent.
    float spent = mix(1.0, 0.3, smoothstep(uDouble - 0.5, uDouble - 2.5, y));
    float th = tm * exists * (pulse + head) * spent * (1.0 + uBeat);
    col += uThread * th * uThreadGlow;
    alpha = max(alpha, clamp(th * 0.8, 0.0, 1.0));

    // The worn band: the strip of floor the heartbeat has already run over —
    // filled, dark bronze, grained, with a faint gold seam running through it.
    float bw = max(uTrailWidth, 0.05);
    float across = abs(dx) / bw;
    float g1 = snoise01(vec3(x * 2.2, y * 1.1, uSeed));
    float g2 = snoise01(vec3(x * 9.0, y * 6.0, uSeed + 3.0));
    float edgeN = (g1 - 0.5) * 0.35;
    float band = 1.0 - smoothstep(0.55, 1.0, across + edgeN);
    float laidBand = smoothstep(-0.2, 0.4, y) * (1.0 - smoothstep(uFront - 0.6, uFront + 0.05, y));
    band *= laidBand;
    float trodBand = smoothstep(uDouble + 0.8, uDouble - 0.6, y);
    vec3 bandCol = mix(uTrailDeep, uTrailBody, (0.25 + 0.55 * g2) * (0.4 + 0.6 * (1.0 - across)));
    float seam = exp(-across * across * 10.0) * (0.35 + 0.65 * trodBand);
    vec3 bandGlow = uTrailBody * seam * uTrailGlow * (0.6 + 0.4 * g2) * (1.0 + uBeat * 0.5);
    float bandA = band * uTrailOpacity;

    // The double's contact shadow, so it stands on the floor.
    float sl = pathLat(clamp(uDouble, 0.0, uLength));
    vec2 sd = vec2(x - sl, (y - clamp(uDouble, 0.0, uLength)) * 0.7) / max(uShadowSize, 0.05);
    float shadow = uShadow * exp(-dot(sd, sd) * 2.2) * step(-1.0, uDouble);

    float pa = clamp(alpha, 0.0, 1.0);
    float a = max(max(bandA, shadow), pa * 0.85);
    vec3 under = bandCol * bandA * (1.0 - shadow);
    vec3 outCol = (under + bandGlow * band + col) * uFade;
    a *= uFade;
    if (a < 0.004 && dot(outCol, outCol) < 1e-5) discard;
    gl_FragColor = vec4(outCol * uGlobalGlow, a);
  }
`;

export function createRunMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // Premultiplied: the worn band darkens the floor, the prints add light.
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      ...pathUniforms(),
      uHalfWidth: { value: 2 },
      uSeed: { value: 0 },
      uFront: { value: 0 },
      uDouble: { value: 0 },
      uSpeed: { value: 10 },
      uStep: { value: 1.1 },
      uFoot: { value: 0.3 },
      uFootSide: { value: 0.15 },
      uFootGlow: { value: 3 },
      uStepGlow: { value: 6 },
      uCool: { value: 1 },
      uThreadGlow: { value: 1.5 },
      uThreadWidth: { value: 0.04 },
      uBeat: { value: 0 },
      uFade: { value: 1 },
      uHot: { value: new Color() },
      uWarm: { value: new Color() },
      uCold: { value: new Color() },
      uThread: { value: new Color() },
      uTrailWidth: { value: 0.8 },
      uTrailOpacity: { value: 0.8 },
      uTrailGlow: { value: 1 },
      uTrailDeep: { value: new Color() },
      uTrailBody: { value: new Color() },
      uShadow: { value: 0.5 },
      uShadowSize: { value: 0.6 }
    }),
    vertexShader: RUN_VERTEX,
    fragmentShader: RUN_FRAGMENT
  });

  /** @param {object} state { origin, dir, side, length, front, double, speed, beat, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncPath(u, state);
    u.uHalfWidth.value = c.braidWidth + c.stepOut + Math.max(c.footSide + c.footSize, c.trailWidth * (c.figureHeight / 1.85)) + 0.4;
    u.uSeed.value = state.seed;
    u.uFront.value = state.front;
    u.uDouble.value = state.double;
    u.uSpeed.value = state.speed;
    u.uStep.value = Math.max(0.1, c.stride * 0.5 * (c.figureHeight / 1.85));
    u.uFoot.value = Math.max(0.05, c.footSize);
    u.uFootSide.value = c.footSide;
    u.uFootGlow.value = c.footGlow * g.glow;
    u.uStepGlow.value = c.footStepGlow * g.glow;
    u.uCool.value = c.footCool * g.lifetime;
    u.uThreadGlow.value = c.threadGlow * g.glow;
    u.uThreadWidth.value = Math.max(0.005, c.threadWidth);
    u.uBeat.value = state.beat;
    u.uFade.value = state.fade * g.opacity;
    u.uHot.value.copy(getColor(c.colorFootHot));
    u.uWarm.value.copy(getColor(c.colorFootWarm));
    u.uCold.value.copy(getColor(c.colorFootCold));
    u.uThread.value.copy(getColor(c.colorThread));
    u.uTrailWidth.value = c.trailWidth * (c.figureHeight / 1.85);
    u.uTrailOpacity.value = c.trailOpacity;
    u.uTrailGlow.value = c.trailGlow * g.glow;
    u.uTrailDeep.value.copy(getColor(c.colorTrailDeep));
    u.uTrailBody.value.copy(getColor(c.colorTrailBody));
    u.uShadow.value = c.shadowOpacity * state.shadow;
    u.uShadowSize.value = c.shadowSize * (c.figureHeight / 1.85);
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The braid                                                            */
/* -------------------------------------------------------------------- */

const BRAID_VERTEX = /* glsl */ `
  uniform float uHead;        // along the path where the braid meets the double
  uniform float uTail;        // metres of braid behind it
  uniform float uRadius;
  uniform float uTwist;
  uniform float uPhase;       // which strand
  uniform float uHeight;
  uniform float uWidth;
  uniform float uScale;

  varying vec2  vRib;
  varying float vViewZ;

  ${PATH_GLSL}

  vec3 braidPoint(float x) {
    float a = max(uHead - uTail * (1.0 - x), 0.0);
    vec3 p = pathPoint(a);
    vec3 T = normalize(pathPoint(a + 0.05) - pathPoint(a - 0.05) + vec3(1e-5, 0.0, 0.0));
    vec3 S = normalize(cross(T, vec3(0.0, 1.0, 0.0)));
    float phi = a * uTwist * 6.2831853 + uPhase;
    // The strands gather into the body right at the double.
    float r = uRadius * uScale * (1.0 - 0.6 * smoothstep(0.88, 1.0, x));
    return p + vec3(0.0, uHeight * uScale, 0.0) + (S * cos(phi) + vec3(0.0, 1.0, 0.0) * sin(phi)) * r;
  }

  void main() {
    float x = position.x;
    vec3 c = braidPoint(x);
    vec3 T = braidPoint(min(x + 0.01, 1.0)) - braidPoint(max(x - 0.01, 0.0));
    vec3 toCam = normalize(cameraPosition - c);
    vec3 W = normalize(cross(T + vec3(1e-5, 0.0, 0.0), toCam));
    vec3 world = c + W * position.y * uWidth;
    vRib = vec2(x, position.y);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BRAID_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlow;
  uniform float uBeat;
  uniform float uFade;
  uniform float uSeed;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying vec2  vRib;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float x = vRib.x;
    float edge = 1.0 - smoothstep(0.35, 1.0, abs(vRib.y));
    float tail = pow(x, 1.6);
    float breakup = smoothstep(0.15, 0.6, snoise01(vec3(x * 14.0 - uTime * 3.0, vRib.y, uSeed)) + x * 0.5);
    float a = edge * tail * breakup * uFade;
    if (a < 0.004) discard;
    vec3 col = mix(uColorB, uColorA, smoothstep(0.5, 1.0, x) * (1.0 - abs(vRib.y) * 0.5));
    gl_FragColor = vec4(col * uGlow * (1.0 + uBeat * 0.8) * a * uGlobalGlow, a);
  }
`;

export function createBraidMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...pathUniforms(),
      uHead: { value: 0 },
      uTail: { value: 6 },
      uRadius: { value: 0.4 },
      uTwist: { value: 2.5 },
      uPhase: { value: 0 },
      uHeight: { value: 1 },
      uWidth: { value: 0.07 },
      uScale: { value: 1 },
      uGlow: { value: 2 },
      uBeat: { value: 0 },
      uFade: { value: 1 },
      uSeed: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: BRAID_VERTEX,
    fragmentShader: BRAID_FRAGMENT
  });

  /** @param {object} state { origin, dir, side, length, head, phase, beat, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncPath(u, state);
    u.uHead.value = state.head;
    u.uTail.value = Math.max(0.1, c.braidLength);
    u.uRadius.value = c.braidRadius;
    u.uTwist.value = c.braidTwist;
    u.uPhase.value = state.phase;
    u.uScale.value = c.figureHeight / 1.85;
    u.uHeight.value = c.braidHeight;
    u.uWidth.value = Math.max(0.005, c.braidWidthRibbon);
    u.uGlow.value = c.braidGlow * g.glow;
    u.uBeat.value = state.beat;
    u.uFade.value = state.fade * g.opacity;
    u.uSeed.value = state.seed;
    u.uColorA.value.copy(getColor(c.colorBraidA));
    u.uColorB.value.copy(getColor(c.colorBraidB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The dial — the floor at the end of the line                          */
/* -------------------------------------------------------------------- */

const DIAL_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform vec3  uFwd;         // twelve o'clock: back toward the caster
  uniform vec3  uRight;
  uniform float uRadius;
  varying vec2  vP;           // −1..1 in the dial's own frame
  void main() {
    vP = position.xy;
    vec3 world = uCenter + uRight * position.x * uRadius + uFwd * position.y * uRadius;
    world.y = 0.024;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const DIAL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uOpen;        // 0..1 the face spreading out from the centre
  uniform float uFade;
  uniform float uHand;        // the hand's angle, radians (it runs backwards)
  uniform float uWave;        // 0..1 the dub's bright front running out (0 = none)
  uniform float uBeat;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uTicks;       // hour marks round the face
  uniform vec3  uDeep;
  uniform vec3  uBody;
  uniform vec3  uTint;
  uniform vec3  uCore;
  uniform float uGlobalGlow;

  varying vec2 vP;

  ${noiseGLSL}

  float wrapA(float a) { return mod(a + 3.14159265, 6.2831853) - 3.14159265; }

  void main() {
    float r = length(vP);
    if (r > 1.02) discard;
    float th = atan(vP.x, vP.y);              // 0 at twelve, clockwise positive
    float g = snoise01(vec3(vP * 3.0, uSeed));
    float gf = snoise01(vec3(vP * 14.0, uSeed + 7.0));

    // The face spreads from the centre on the lub.
    float open = smoothstep(uOpen + 0.04, uOpen - 0.04, r + (g - 0.5) * 0.12);
    float disc = (1.0 - smoothstep(0.93, 1.0, r)) * open;

    // Field: a filled, dark-bronze face, warmer toward the centre.
    vec3 field = mix(uDeep, uBody, (1.0 - smoothstep(0.0, 0.9, r)) * 0.45 + gf * 0.18);
    float fieldA = disc * uOpacity * (0.75 + 0.25 * g);

    // Light written into the face.
    float e = 0.0;
    // the bezel and an inner ring
    e += exp(-pow((r - 0.95) / 0.025, 2.0)) * 1.4;
    e += exp(-pow((r - 0.58) / 0.018, 2.0)) * 0.7;
    // hour wedges
    float n = max(uTicks, 1.0);
    float cell = 6.2831853 / n;
    float ta = abs(wrapA(th - cell * floor(th / cell + 0.5)));
    float wedge = (1.0 - smoothstep(0.035, 0.06, ta * r)) * smoothstep(0.66, 0.7, r) * (1.0 - smoothstep(0.86, 0.9, r));
    e += wedge * 1.2;
    // minute ticks
    float mc = cell / 5.0;
    float tm = abs(wrapA(th - mc * floor(th / mc + 0.5)));
    e += (1.0 - smoothstep(0.008, 0.016, tm * r)) * smoothstep(0.86, 0.88, r) * (1.0 - smoothstep(0.92, 0.93, r)) * 0.8;

    // the hand, and the fan of time it has swept back through
    float dh = wrapA(th - uHand);
    float blade = (1.0 - smoothstep(0.02, 0.05 * (1.0 - r * 0.6), abs(dh) * r)) * (1.0 - smoothstep(0.78, 0.84, r));
    float fan = (dh > 0.0 ? exp(-dh * 1.6) : 0.0) * (1.0 - smoothstep(0.82, 0.9, r)) * smoothstep(0.05, 0.2, r);
    e += blade * 2.6;
    vec3 fanCol = mix(uBody, uTint, fan) * fan * 0.9;
    // the hub
    float hub = 1.0 - smoothstep(0.05, 0.08, r);

    // the dub's front running out
    float wv = 0.0;
    if (uWave > 0.0) {
      float R = uWave * 1.0;
      wv = exp(-pow((r - R) / 0.06, 2.0)) * (1.0 - uWave * 0.6);
      wv += (1.0 - smoothstep(R - 0.25, R, r)) * step(r, R) * (1.0 - uWave) * 0.35;
    }

    vec3 light = mix(uBody, uTint, 0.5) * e * (1.0 + uBeat * 0.6)
               + fanCol
               + uCore * (hub * 2.0 + blade * smoothstep(0.3, 0.8, r) * 0.8)
               + mix(uTint, uCore, 0.5) * wv * 2.0;
    light *= disc * uGlow;

    float a = clamp(max(fieldA, max(e, wv) * disc * 0.6), 0.0, 1.0) * uFade;
    vec3 col = (field * fieldA + light) * uFade;
    if (a < 0.003 && dot(col, col) < 1e-5) discard;
    gl_FragColor = vec4(col * uGlobalGlow, a);
  }
`;

export function createDialMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uFwd: { value: new Vector3(0, 0, -1) },
      uRight: { value: new Vector3(1, 0, 0) },
      uRadius: { value: 3 },
      uSeed: { value: 0 },
      uOpen: { value: 0 },
      uFade: { value: 1 },
      uHand: { value: 0 },
      uWave: { value: 0 },
      uBeat: { value: 0 },
      uOpacity: { value: 0.85 },
      uGlow: { value: 1 },
      uTicks: { value: 12 },
      uDeep: { value: new Color() },
      uBody: { value: new Color() },
      uTint: { value: new Color() },
      uCore: { value: new Color() }
    }),
    vertexShader: DIAL_VERTEX,
    fragmentShader: DIAL_FRAGMENT
  });

  /** @param {object} state { center, fwd, right, radius, open, fade, hand, wave, beat, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uFwd.value.copy(state.fwd);
    u.uRight.value.copy(state.right);
    u.uRadius.value = Math.max(0.1, state.radius);
    u.uSeed.value = state.seed;
    u.uOpen.value = state.open;
    u.uFade.value = state.fade * g.opacity;
    u.uHand.value = state.hand;
    u.uWave.value = state.wave;
    u.uBeat.value = state.beat;
    u.uOpacity.value = c.dialOpacity;
    u.uGlow.value = c.dialGlow * g.glow;
    u.uTicks.value = Math.max(1, Math.round(c.dialTicks));
    u.uDeep.value.copy(getColor(c.colorDialDeep));
    u.uBody.value.copy(getColor(c.colorDialBody));
    u.uTint.value.copy(getColor(c.colorDialTint));
    u.uCore.value.copy(getColor(c.colorDialCore));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The wake — LAYER.DISTORTION                                          */
/* -------------------------------------------------------------------- */

const WAKE_VERTEX = /* glsl */ `
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

const WAKE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uRipple;      // 0..1 the running ripple
  uniform float uShock;       // 0..1 the finale's ring (0 = none)
  uniform float uStrength;
  uniform float uShockStrength;
  uniform float uBeat;
  uniform float uShaderIntensity;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    vec2 dir = vUv / max(r, 1e-4);
    // A heartbeat ripple: rings running outward off the double.
    float ring = sin(r * 18.0 - uTime * 9.0) * (1.0 - smoothstep(0.2, 1.0, r)) * smoothstep(0.0, 0.2, r);
    vec2 off = dir * ring * 0.6 + vec2(snoise(vec3(vUv * 3.0, uTime)), snoise(vec3(vUv * 3.0 + 9.0, uTime))) * 0.3;
    float strength = uStrength * uRipple * (0.6 + 0.6 * uBeat) * (1.0 - smoothstep(0.4, 1.0, r));
    if (uShock > 0.0) {
      float R = 0.08 + 0.92 * uShock;
      float d = (r - R) / 0.08;
      float m = exp(-d * d) * (1.0 - uShock);
      off += dir * clamp(-d * exp(-d * d) * 2.0, -1.0, 1.0) * m;
      strength = max(strength, uShockStrength * m);
    }
    strength *= uShaderIntensity;
    if (strength < 0.002) discard;
    float len = length(off);
    if (len > 1.0) off /= len;
    gl_FragColor = vec4(off * 0.5 + 0.5, strength, 1.0);
  }
`;

export function createWakeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 1.5 },
      uRipple: { value: 0 },
      uShock: { value: 0 },
      uStrength: { value: 1 },
      uShockStrength: { value: 1 },
      uBeat: { value: 0 }
    }),
    vertexShader: WAKE_VERTEX,
    fragmentShader: WAKE_FRAGMENT
  });

  /** @param {object} state { center, size, ripple, shock, beat } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.1, state.size);
    u.uRipple.value = state.ripple;
    u.uShock.value = state.shock;
    u.uBeat.value = state.beat;
    u.uStrength.value = c.warp * g.distortion;
    u.uShockStrength.value = c.ringWarp * g.distortion;
  };

  return material;
}
