import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'sirennote';

/**
 * Siren Note — the four bespoke shaders.
 *
 *  - **the sheet** (`createSirenSheetMaterial`) — a strip in parameter space
 *    (x = 0 hand .. 1 front, y = −1 .. 1 across) laid flat at chest height in
 *    the vertex stage and *vibrating*: a standing wave whose nodes are fixed
 *    every half wavelength from the hand, plus a travelling ripple just behind
 *    the front. The fragment draws the note: taut lengthwise strands, bright
 *    at the antinodes and dark at the nodes, over a thin-film membrane whose
 *    iridescence is driven by the displacement (colour *is* the vibration),
 *    a white leading edge, feathered sides, a soft depth fade, and a shred
 *    dissolve that tears the sheet into its own strands from the far end.
 *  - **the lens** (`createSirenLensMaterial`) — the sheet again, wider, on
 *    `LAYER.DISTORTION`. Its offset is the slope of the wave, so the world
 *    under a crest is pushed and under a trough pulled: you see the air ring.
 *  - **the wavefront** (`createSirenFrontMaterial`) — a disc standing across
 *    the line at the front, facing back at the caster: concentric pressure
 *    arcs racing outward, split red/green/blue at the rim. At the end of the
 *    line it is the scream — it blooms to many times its size and thins out.
 *  - **the Chladni floor** (`createSirenGroundMaterial`) — a strip on the
 *    floor under the line where the note has sorted the dust into the nodal
 *    lines of a vibrating plate: pale ridges where nothing moves, a scoured
 *    dark band everywhere else, only behind the front, eroding at the end.
 *
 * Every material reads `settings.sirennote` in `userData.sync()`.
 */

const SHEET_GLSL = /* glsl */ `
  uniform vec3  uHand;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uReach;      // metres from the hand to the front
  uniform float uWidth;      // full width of the sheet, metres
  uniform float uPinch;      // width at the hand, metres
  uniform float uFlare;      // metres over which it opens out
  uniform float uHeight;     // metres off the floor once open
  uniform float uBank;       // radians of roll about the line
  uniform float uAmp;        // metres of standing-wave amplitude
  uniform float uWaveLen;    // metres per wavelength
  uniform float uPhase;      // integrated note phase
  uniform float uRipple;     // metres of travelling ripple behind the front
  uniform float uRipplePhase;
  uniform float uScale;      // width multiplier (the lens is a wider sheet)

  float sheetOpen(float d) { return smoothstep(0.0, max(uFlare, 0.05), d); }

  /** Standing wave + travelling ripple, metres, at d metres from the hand. */
  float sheetDisp(float d, float v) {
    float k = 6.2831853 / max(uWaveLen, 0.1);
    float standing = sin(k * d) * cos(uPhase);
    float behind = max(uReach - d, 0.0);
    float ripple = sin(k * 2.0 * behind - uRipplePhase) * exp(-behind / max(uRipple, 0.05));
    return (uAmp * standing * (1.0 - 0.35 * v * v) + uAmp * 0.6 * ripple) * sheetOpen(d);
  }

  vec3 sheetPoint(float s, float v) {
    float d = s * uReach;
    float o = sheetOpen(d);
    float halfW = mix(uPinch, uWidth, o) * 0.5 * uScale;
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 p = uHand + uDir * d;
    p.y = mix(uHand.y, uHeight, o);
    vec3 across = uSide * cos(uBank) + up * sin(uBank);
    vec3 normal = -uSide * sin(uBank) + up * cos(uBank);
    return p + across * (v * halfW) + normal * sheetDisp(d, v);
  }
`;

const SHEET_VERTEX = /* glsl */ `
  varying float vS;
  varying float vV;
  varying float vD;
  varying float vDisp;
  varying float vSlope;
  varying vec3  vWorld;
  varying float vViewZ;

  ${SHEET_GLSL}

  void main() {
    float s = position.x;
    float v = position.y;
    vec3 world = sheetPoint(s, v);
    float d = s * uReach;
    vS = s;
    vV = v;
    vD = d;
    vDisp = sheetDisp(d, v) / max(uAmp, 1e-3);
    vSlope = (sheetDisp(d + 0.05, v) - sheetDisp(d - 0.05, v)) / 0.1;
    vWorld = world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHEET_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uReach;
  uniform float uWaveLen;
  uniform float uPhase;
  uniform float uStrands;
  uniform float uStrandWidth;
  uniform float uStrandGlow;
  uniform float uMembrane;
  uniform float uIridescence;
  uniform float uFrontGlow;
  uniform float uFrontWidth;
  uniform float uEdgeFeather;
  uniform float uScream;
  uniform float uShred;
  uniform float uShredEdge;
  uniform float uSoftFade;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorFront;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying float vS;
  varying float vV;
  varying float vD;
  varying float vDisp;
  varying float vSlope;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  vec3 spectrum(float t) { return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67))); }

  void main() {
    float k = 6.2831853 / max(uWaveLen, 0.1);
    // How hard this part of the sheet is moving: 1 at an antinode, 0 at a node.
    float anti = abs(sin(k * vD));
    float swing = 0.55 + 0.45 * abs(cos(uPhase));

    // Taut strands running the length of the sheet.
    float across = vV * 0.5 + 0.5;
    float f = fract(across * uStrands);
    float idx = floor(across * uStrands);
    float sw = max(uStrandWidth, 0.01);
    float strand = exp(-pow((f - 0.5) / sw, 2.0));
    float jitter = snoise(vec3(vD * 0.7 - uTime * 2.0, idx * 3.1, uSeed)) * 0.5 + 0.5;
    float strands = strand * (0.25 + anti * swing * 1.1) * (0.7 + 0.6 * jitter);

    // Thin-film membrane: hue from the displacement, so the colour shivers with the note.
    float film = vDisp * 0.35 + vV * 0.15 + vD * 0.03 + uSeed;
    vec3 irid = mix(uColorB, spectrum(film), clamp(uIridescence, 0.0, 1.0));
    float membrane = uMembrane * (0.35 + 0.65 * anti) * (0.6 + 0.4 * abs(vSlope));

    // The leading edge, white.
    float toFront = max(uReach - vD, 0.0);
    float front = exp(-toFront / max(uFrontWidth, 0.02));

    vec3 col = uColorA * strands * uStrandGlow * (1.0 + uScream * 2.0);
    col += irid * membrane;
    col += uColorC * pow(anti, 4.0) * 0.4 * swing;
    col += uColorFront * front * uFrontGlow * (1.0 + uScream);

    // Feathered sides and hand.
    float side = 1.0 - smoothstep(1.0 - max(uEdgeFeather, 0.01), 1.0, abs(vV));
    float hand = smoothstep(0.0, 0.04, vS);
    float mask = side * hand;

    // Shred: the sheet tears into its own strands from the far end back.
    if (uShred > 0.0) {
      float r = hash11(idx * 17.13 + uSeed * 3.7);
      float n = snoise(vec3(vD * 0.9, idx * 1.7, uSeed)) * 0.5 + 0.5;
      float field = (1.0 - vS) * 0.55 + r * 0.25 + n * 0.2;
      float thr = uShred * 1.1 - 0.05;
      float keep = smoothstep(thr, thr + 0.03, field);
      float edge = keep * (1.0 - smoothstep(thr + 0.03, thr + 0.03 + uShredEdge, field));
      // Only the strands survive the tear — the membrane goes first.
      mask *= mix(keep, keep * strand, clamp(uShred * 2.0, 0.0, 1.0));
      col += uColorFront * edge * 3.0;
    }

    mask *= uOpacity;
    if (mask < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (mask < 0.004) discard;
    gl_FragColor = vec4(col * mask * uGlobalGlow * mix(1.0, uShaderIntensity, 0.5), 1.0);
  }
`;

function sheetShapeUniforms() {
  return {
    uHand: { value: new Vector3() },
    uDir: { value: new Vector3(0, 0, 1) },
    uSide: { value: new Vector3(1, 0, 0) },
    uReach: { value: 0 },
    uWidth: { value: 2 },
    uPinch: { value: 0.1 },
    uFlare: { value: 2.5 },
    uHeight: { value: 1.3 },
    uBank: { value: 0 },
    uAmp: { value: 0.3 },
    uWaveLen: { value: 3 },
    uPhase: { value: 0 },
    uRipple: { value: 2 },
    uRipplePhase: { value: 0 },
    uScale: { value: 1 }
  };
}

/** @param {object} st { hand, dir, side, reach, phase, ripplePhase, scream } */
function syncSheetShape(u, st) {
  const c = settings[ID];
  const g = settings.global;
  u.uHand.value.copy(st.hand);
  u.uDir.value.copy(st.dir);
  u.uSide.value.copy(st.side);
  u.uReach.value = Math.max(0.01, st.reach);
  u.uWidth.value = c.sheetWidth;
  u.uPinch.value = c.sheetPinch;
  u.uFlare.value = c.sheetFlare;
  u.uHeight.value = c.sheetHeight;
  u.uBank.value = c.sheetBank;
  u.uAmp.value = c.waveAmp * g.noiseStrength * (1 + st.scream * c.screamAmp);
  u.uWaveLen.value = c.waveLength;
  u.uPhase.value = st.phase;
  u.uRipple.value = c.rippleLength;
  u.uRipplePhase.value = st.ripplePhase;
}

/** The vibrating sheet. Additive, so it reads as light held in the air. */
export function createSirenSheetMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...sheetShapeUniforms(),
      uStrands: { value: 9 },
      uStrandWidth: { value: 0.12 },
      uStrandGlow: { value: 3 },
      uMembrane: { value: 0.6 },
      uIridescence: { value: 0.7 },
      uFrontGlow: { value: 4 },
      uFrontWidth: { value: 0.35 },
      uEdgeFeather: { value: 0.3 },
      uScream: { value: 0 },
      uShred: { value: 0 },
      uShredEdge: { value: 0.06 },
      uSoftFade: { value: 0.3 },
      uOpacity: { value: 1 },
      uSeed: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorFront: { value: new Color() }
    }),
    vertexShader: SHEET_VERTEX,
    fragmentShader: SHEET_FRAGMENT
  });

  /** @param {object} st the shape state plus { scream, shred, fade, seed } */
  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncSheetShape(u, st);
    u.uScale.value = 1;
    u.uStrands.value = Math.max(1, Math.round(c.strands));
    u.uStrandWidth.value = c.strandWidth;
    u.uStrandGlow.value = c.strandGlow * g.glow;
    u.uMembrane.value = c.membraneGlow * g.glow;
    u.uIridescence.value = c.iridescence;
    u.uFrontGlow.value = c.edgeGlow * g.glow;
    u.uFrontWidth.value = c.edgeWidth;
    u.uEdgeFeather.value = c.sideFeather;
    u.uScream.value = st.scream;
    u.uShred.value = st.shred;
    u.uShredEdge.value = c.shredEdge;
    u.uSoftFade.value = c.softFade;
    u.uOpacity.value = c.sheetOpacity * g.opacity * st.fade;
    u.uSeed.value = st.seed;
    u.uColorA.value.copy(getColor(c.colorStrand));
    u.uColorB.value.copy(getColor(c.colorMembrane));
    u.uColorC.value.copy(getColor(c.colorAntinode));
    u.uColorFront.value.copy(getColor(c.colorEdge));
  };

  return material;
}

/* ==================================================================== */
/* The lens                                                               */
/* ==================================================================== */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying float vS;
  varying float vV;
  varying float vSlope;
  varying float vDisp;

  void main() {
    float side = 1.0 - smoothstep(0.55, 1.0, abs(vV));
    float mask = side * smoothstep(0.0, 0.06, vS);
    // The wave's own slope bends the world: crests push, troughs pull.
    vec2 dir = vec2(vV * 0.6, 1.0);
    float bend = clamp(vSlope * 1.5 + vDisp * 0.4, -1.0, 1.0);
    float s = uStrength * uShaderIntensity * mask;
    if (s < 0.002) discard;
    gl_FragColor = vec4(normalize(dir) * bend * 0.5 + 0.5, s, mask);
  }
`;

/** The sheet's refraction. LAYER.DISTORTION — see `createAcidFumeMaterial`. */
export function createSirenLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...sheetShapeUniforms(),
      uStrength: { value: 1 }
    }),
    vertexShader: SHEET_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncSheetShape(u, st);
    u.uScale.value = c.lensWidth;
    u.uStrength.value = c.lensWarp * g.distortion * st.fade * (1 + st.scream);
  };

  return material;
}

/* ==================================================================== */
/* The wavefront                                                          */
/* ==================================================================== */

const FRONT_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform vec3  uAxisU;
  uniform vec3  uAxisV;
  uniform float uSize;
  varying vec2 vUv;
  varying float vViewZ;

  void main() {
    vUv = position.xy;
    vec3 world = uCenter + (uAxisU * position.x + uAxisV * position.y) * uSize;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRONT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uBands;
  uniform float uPhase;
  uniform float uWidth;
  uniform float uIntensity;
  uniform float uSplit;
  uniform float uOpen;        // 0..1 how far the scream has bloomed
  uniform float uSeed;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  varying vec2 vUv;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  float arcs(float r) {
    float x = r * uBands - uPhase;
    float f = fract(x);
    float w = max(uWidth, 0.01);
    return exp(-pow((f - 0.5) / w, 2.0)) * smoothstep(0.0, 0.2, r);
  }

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float wob = snoise(vec3(vUv * 2.0, uTime * 1.5 + uSeed)) * 0.03;
    float rr = r + wob;
    // Three taps a hair apart: the rim splits into a spectrum.
    float s = uSplit * 0.02;
    vec3 band = vec3(arcs(rr - s), arcs(rr), arcs(rr + s));
    float env = (1.0 - smoothstep(0.7, 1.0, r)) * (0.35 + 0.65 * r);
    // While blooming, the inner arcs thin out and only the rim is left.
    env *= mix(1.0, smoothstep(uOpen * 0.85 - 0.1, uOpen * 0.85 + 0.1, r), step(0.001, uOpen));
    vec3 col = mix(uColorB, uColorA, band) * band * env * uIntensity;
    col += uColorA * exp(-r * r * 14.0) * uIntensity * 0.6 * (1.0 - uOpen);
    float m = max(max(band.r, band.g), band.b) * env;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    float soft = softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.3);
    if (m * uIntensity * soft < 0.003) discard;
    gl_FragColor = vec4(col * soft * uGlobalGlow, 1.0);
  }
`;

/** The note's pressure front, standing across the line. Additive. */
export function createSirenFrontMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uAxisU: { value: new Vector3(1, 0, 0) },
      uAxisV: { value: new Vector3(0, 1, 0) },
      uSize: { value: 1 },
      uBands: { value: 4 },
      uPhase: { value: 0 },
      uWidth: { value: 0.12 },
      uIntensity: { value: 1 },
      uSplit: { value: 1 },
      uOpen: { value: 0 },
      uSeed: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: FRONT_VERTEX,
    fragmentShader: FRONT_FRAGMENT
  });

  /** @param {object} st { center, axisU, axisV, size, phase, intensity, open, seed } */
  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(st.center);
    u.uAxisU.value.copy(st.axisU);
    u.uAxisV.value.copy(st.axisV);
    u.uSize.value = st.size;
    u.uBands.value = c.frontBands;
    u.uPhase.value = st.phase;
    u.uWidth.value = c.frontBandWidth;
    u.uIntensity.value = st.intensity * c.frontGlow * g.glow * g.opacity;
    u.uSplit.value = c.frontSplit;
    u.uOpen.value = st.open;
    u.uSeed.value = st.seed;
    u.uColorA.value.copy(getColor(c.colorEdge));
    u.uColorB.value.copy(getColor(c.colorAntinode));
  };

  return material;
}

/* ==================================================================== */
/* The Chladni floor                                                      */
/* ==================================================================== */

const GROUND_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uWidth;
  varying vec2 vP;   // x = metres along, y = metres across

  void main() {
    float along = position.x * uLength;
    float across = position.y * uWidth * 0.5;
    vP = vec2(along, across);
    vec3 world = uStart + uDir * along + uSide * across;
    world.y = 0.013;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uReach;
  uniform float uWidth;
  uniform float uWaveLen;
  uniform float uModes;
  uniform float uLineWidth;
  uniform float uLineGlow;
  uniform float uScour;
  uniform float uHeat;
  uniform float uErode;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3  uColorSand;
  uniform vec3  uColorLine;
  uniform vec3  uColorScour;
  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float halfW = uWidth * 0.5;
    float x = vP.x / max(uWaveLen * 0.5, 0.05);
    float y = vP.y / max(halfW, 0.05);
    // Chladni: nodal lines of a square plate's (n, m) mode pair.
    float n = 1.0;
    float m = max(uModes, 1.0);
    float pi = 3.14159265;
    float wob = snoise(vec3(vP * 0.8, uSeed)) * 0.08;
    float f = cos(n * pi * (x + wob)) * cos(m * pi * (y * 0.5 + 0.5)) - cos(m * pi * (x + wob) * 0.5) * cos(n * pi * (y * 0.5 + 0.5));
    float line = 1.0 - smoothstep(uLineWidth * 0.3, uLineWidth, abs(f));

    float behind = step(vP.x, uReach);
    float lip = smoothstep(uReach - 0.4, uReach, vP.x) * behind;
    float sideFade = 1.0 - smoothstep(0.75, 1.0, abs(y));
    float startFade = smoothstep(0.3, 1.2, vP.x);
    float lit = behind * sideFade * startFade;

    float grain = snoise(vec3(vP * 6.0, uSeed)) * 0.5 + 0.5;
    vec3 col = mix(uColorScour, uColorSand, line * (0.7 + 0.3 * grain));
    col += uColorLine * line * uLineGlow * uHeat * uGlobalGlow * uShaderIntensity;
    col += uColorLine * lip * uLineGlow * 0.6;

    float a = lit * max(uScour * (1.0 - line), line);
    float en = snoise(vec3(vP * 1.4, uSeed * 2.0)) * 0.5 + 0.5;
    float t = uErode * 1.3 - 0.15;
    a *= smoothstep(t, t + 0.15, mix(en, line, 0.35));
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The dust the note has sorted. Normal blending: the scour has to darken. */
export function createSirenGroundMaterial() {
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
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uWidth: { value: 3 },
      uReach: { value: 0 },
      uWaveLen: { value: 3 },
      uModes: { value: 3 },
      uLineWidth: { value: 1 },
      uLineGlow: { value: 1 },
      uScour: { value: 0.5 },
      uHeat: { value: 1 },
      uErode: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uColorSand: { value: new Color() },
      uColorLine: { value: new Color() },
      uColorScour: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT
  });

  /** @param {object} st { start, dir, side, length, reach, heat, erode, seed } */
  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(st.start);
    u.uDir.value.copy(st.dir);
    u.uSide.value.copy(st.side);
    u.uLength.value = Math.max(0.1, st.length);
    u.uWidth.value = c.groundWidth;
    u.uReach.value = st.reach;
    u.uWaveLen.value = c.waveLength;
    u.uModes.value = c.groundModes;
    u.uLineWidth.value = c.groundLineWidth;
    u.uLineGlow.value = c.groundGlow * g.glow;
    u.uScour.value = c.groundScour;
    u.uHeat.value = st.heat;
    u.uErode.value = st.erode;
    u.uSeed.value = st.seed;
    u.uOpacity.value = g.opacity;
    u.uColorSand.value.copy(getColor(c.colorSand));
    u.uColorLine.value.copy(getColor(c.colorAntinode));
    u.uColorScour.value.copy(getColor(c.colorScour));
  };

  return material;
}
