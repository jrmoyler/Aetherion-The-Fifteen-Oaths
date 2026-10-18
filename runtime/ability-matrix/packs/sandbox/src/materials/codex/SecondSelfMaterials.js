import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
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
  uniform float uBodyGlow;
  uniform float uRimGlow;
  uniform float uRimPower;
  uniform float uBandScale;
  uniform float uBandSpeed;
  uniform float uBandGlow;
  uniform float uFlicker;
  uniform float uOpacity;
  uniform float uFlare;       // the finale: it burns brighter as it comes apart
  uniform vec3  uCore;
  uniform vec3  uBody;
  uniform vec3  uRim;
  uniform vec3  uDeep;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

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
    float ndv = abs(dot(N, V));
    float rim = pow(1.0 - ndv, max(uRimPower, 0.3));

    // An afterimage is a figure being forgotten: eaten by noise, harder the
    // further back it is.
    float n = snoise01(vWorld * 3.5 + vec3(0.0, uTime * 0.8, vSeed));
    float keep = smoothstep(1.0 - vFade - 0.08, 1.0 - vFade + 0.08, n * 0.85 + 0.15);
    if (keep < 0.01) discard;

    // Bands of time running down the body.
    float bands = smoothstep(0.55, 1.0, sin((vWorld.y + uTime * uBandSpeed) * uBandScale * 6.2831853 * 0.25) * 0.5 + 0.5);
    float flick = 1.0 - uFlicker * (0.5 + 0.5 * snoise(vec3(uTime * 9.0, vSeed, 0.0)));
    float beat = 1.0 + uBeat * uBeatGlow;

    vec3 col = uDeep * 0.35 + uBody * (uBodyGlow * (0.35 + 0.65 * ndv)) + uCore * pow(ndv, 6.0) * 0.4;
    col += uBody * bands * uBandGlow * uShaderIntensity;
    col += uRim * rim * uRimGlow;
    col *= flick * beat * (1.0 + uFlare * 2.5);

    float a = (0.22 + 0.78 * rim + bands * 0.25) * vFade * keep * uOpacity;
    vec2 suv = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, suv, vViewZ, uCameraNear, uCameraFar, 0.12);
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * a * uGlobalGlow, a);
  }
`;

export function createFigureMaterial(halfLen) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
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
      uCore: { value: new Color() },
      uBody: { value: new Color() },
      uRim: { value: new Color() },
      uDeep: { value: new Color() }
    }),
    vertexShader: FIGURE_VERTEX,
    fragmentShader: FIGURE_FRAGMENT
  });

  /** @param {object} state { beat, flare } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uBeat.value = state.beat;
    u.uBeatGlow.value = c.beatGlow;
    u.uBodyGlow.value = c.bodyGlow * g.glow;
    u.uRimGlow.value = c.rimGlow * g.glow * g.fresnel;
    u.uRimPower.value = c.rimPower;
    u.uBandScale.value = c.bandScale * g.noiseFrequency;
    u.uBandSpeed.value = c.bandSpeed * g.noiseSpeed;
    u.uBandGlow.value = c.bandGlow;
    u.uFlicker.value = c.flicker * g.noiseStrength;
    u.uOpacity.value = c.opacity * g.opacity;
    u.uFlare.value = state.flare;
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

    float a = clamp(alpha, 0.0, 1.0) * uFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, a);
  }
`;

export function createRunMaterial() {
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
      uThread: { value: new Color() }
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
    u.uHalfWidth.value = c.braidWidth + c.stepOut + c.footSide + c.footSize + 0.3;
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
