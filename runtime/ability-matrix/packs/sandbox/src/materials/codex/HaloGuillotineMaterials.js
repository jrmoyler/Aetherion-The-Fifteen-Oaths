import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Halo Guillotine — the bespoke shaders.
 *
 *  - **the halo** — a torus grid placed round any axis in the vertex stage. It
 *    forms flat over the caster's head and *hinges*: its axis turns from the
 *    sky to the caster's side, so it ends standing in the plane of the line as
 *    the knuckle the blade swings on. Gold, a white inner lip, a band of runes
 *    turning round it.
 *  - **the blade** — a sheet in parameter space hung off the hinge: a straight
 *    spine along `uA` and a crescent cutting edge bellied out along `uN`. The
 *    ability turns `uA/uN` round the hinge pin to swing it; the CPU twin of
 *    `edgeDepth` finds where the edge meets the floor. Light-forged: gold
 *    body, white-hot edge, an engraved filigree band, a sheen running along
 *    it, dissolving tip → hinge on the exit, clipped (embedded) under the
 *    floor.
 *  - **the smear** — the locus of the cutting edge between the angle it was
 *    at a moment ago and now: a fan of light dragged behind the swing, and its
 *    twin on `LAYER.DISTORTION`, the air the blade cuts.
 *  - **the cut** — a ground strip down the line: a faint marching telegraph
 *    while the blade is raised, then a white-hot slit that only exists behind
 *    the point of contact, shards of light radiating off it, cooling to a
 *    gold seam that erodes away.
 *  - **the glint** — camera-facing star: on the halo while it forms, riding
 *    the point of contact while it runs down the line.
 *
 * Every material reads `settings.haloguillotine` in `userData.sync(state)`.
 */

const ID = 'haloguillotine';

/* -------------------------------------------------------------------- */
/* The halo                                                             */
/* -------------------------------------------------------------------- */

const HALO_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform vec3  uU1;
  uniform vec3  uU2;
  uniform vec3  uAxis;
  uniform float uRadius;
  uniform float uTube;

  varying float vA;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vOuter;

  void main() {
    float a = position.x * 6.2831853;
    float b = position.y * 6.2831853;
    vec3 ring = cos(a) * uU1 + sin(a) * uU2;
    vec3 n = cos(b) * ring + sin(b) * uAxis;
    vec3 world = uCenter + ring * uRadius + n * uTube;
    vA = position.x;
    vNormalW = n;
    vOuter = cos(b);
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSpin;
  uniform float uRunes;
  uniform float uGlow;
  uniform float uRuneGlow;
  uniform float uPower;
  uniform float uDraw;        // 0..1 drawn round from the front
  uniform vec3  uColorGold;
  uniform vec3  uColorCore;
  uniform vec3  uColorRune;
  uniform float uGlobalGlow;

  varying float vA;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vOuter;

  ${noiseGLSL}

  void main() {
    float a = fract(vA + uSpin);
    if (vA > uDraw) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float facing = abs(dot(N, V));
    float rim = pow(1.0 - facing, 2.5);
    // A band of runes on the outer face: one glyph per cell, three strokes of
    // it lit at random.
    float cells = max(uRunes, 1.0);
    float cell = floor(a * cells);
    vec2 g = vec2(fract(a * cells), vOuter * 0.5 + 0.5);
    float h = hash11(cell * 7.31 + 1.7);
    float bars = step(0.5, fract(h * 3.0 + floor(g.x * 3.0) * 0.37)) * (1.0 - smoothstep(0.32, 0.4, abs(g.x * 3.0 - floor(g.x * 3.0) - 0.5)));
    float band = smoothstep(0.55, 0.8, vOuter);
    float rune = bars * band * (0.6 + 0.4 * sin(uTime * 4.0 + cell));
    float inner = smoothstep(0.2, -0.6, vOuter);
    vec3 col = uColorGold * (0.6 + 0.8 * facing) + uColorCore * (inner * 1.5 + rim * 0.8) + uColorRune * rune * uRuneGlow;
    float m = uPower * (0.75 + 0.25 * facing) * (1.0 - smoothstep(uDraw - 0.02, uDraw, vA) * step(uDraw, 0.999));
    if (m < 0.004) discard;
    gl_FragColor = vec4(col * uGlow * m * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

/** The hinge halo. Additive gold. */
export function createHaloMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uU1: { value: new Vector3(1, 0, 0) },
      uU2: { value: new Vector3(0, 0, 1) },
      uAxis: { value: new Vector3(0, 1, 0) },
      uRadius: { value: 0.8 },
      uTube: { value: 0.06 },
      uSpin: { value: 0 },
      uRunes: { value: 16 },
      uGlow: { value: 2 },
      uRuneGlow: { value: 3 },
      uPower: { value: 1 },
      uDraw: { value: 1 },
      uColorGold: { value: new Color() },
      uColorCore: { value: new Color() },
      uColorRune: { value: new Color() }
    }),
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT
  });

  /** @param {object} state { center, u1, u2, axis, radius, spin, power, draw } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uU1.value.copy(state.u1);
    u.uU2.value.copy(state.u2);
    u.uAxis.value.copy(state.axis);
    u.uRadius.value = Math.max(0.05, state.radius);
    u.uTube.value = Math.max(0.005, c.haloTube);
    u.uSpin.value = state.spin;
    u.uRunes.value = Math.max(1, Math.round(c.haloRunes));
    u.uGlow.value = c.haloGlow * g.glow;
    u.uRuneGlow.value = c.runeGlow * g.shaderIntensity;
    u.uPower.value = state.power * g.opacity;
    u.uDraw.value = state.draw;
    u.uColorGold.value.copy(getColor(c.colorHaloGold));
    u.uColorCore.value.copy(getColor(c.colorHaloCore));
    u.uColorRune.value.copy(getColor(c.colorRune));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The blade                                                            */
/* -------------------------------------------------------------------- */

/**
 * `edgeDepth(s)` — metres from the spine to the cutting edge at `s` (0 hinge
 * .. 1 tip). The CPU twin is `HaloGuillotineAbility#_edgeDepth`.
 */
const BLADE_GLSL = /* glsl */ `
  uniform vec3  uHinge;
  uniform vec3  uA;           // along the spine, hinge → tip
  uniform vec3  uN;           // spine → cutting edge
  uniform float uLength;
  uniform float uWidth;
  uniform float uRoot;
  uniform float uBelly;
  uniform float uTipTaper;
  uniform float uSpine;

  float edgeDepth(float s) {
    float belly = sin(3.14159265 * pow(clamp(s, 0.0, 1.0), max(uBelly, 0.05)));
    float tip = 1.0 - 0.92 * smoothstep(1.0 - max(uTipTaper, 0.01), 1.0, s);
    return uWidth * (uRoot + (1.0 - uRoot) * belly) * tip;
  }
`;

const BLADE_VERTEX = /* glsl */ `
  varying float vS;
  varying float vQ;
  varying float vC;
  varying float vWorldY;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${BLADE_GLSL}

  void main() {
    float s = position.x;
    float q = position.y;
    float e = edgeDepth(s);
    float across = mix(-uSpine * (1.0 - smoothstep(0.9, 1.0, s)), e, q);
    vec3 world = uHinge + uA * (s * uLength) + uN * across;
    vS = s;
    vQ = q;
    vC = across;
    vWorldY = world.y;
    vViewDir = cameraPosition - world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BLADE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3  uFace;        // the blade's face normal (the hinge pin)
  uniform float uLength;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uEdgeGlow;
  uniform float uEdgeWidth;
  uniform float uFiligree;
  uniform float uSheen;       // 0..1 where the sheen band is
  uniform float uSheenGlow;
  uniform float uFlare;
  uniform float uFresnel;
  uniform float uOpacity;
  uniform float uPower;
  uniform float uDissolve;
  uniform float uSoftFade;
  uniform vec3  uColorBody;
  uniform vec3  uColorHot;
  uniform vec3  uColorEdge;
  uniform vec3  uColorEngrave;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying float vS;
  varying float vQ;
  varying float vC;
  varying float vWorldY;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    if (vWorldY < 0.0) discard;
    float d = vS * uLength;
    vec3 V = normalize(vViewDir);
    float graze = pow(1.0 - abs(dot(normalize(uFace), V)), 3.0) * uFresnel;

    float n = fbm3(vec3(d * 0.9, vC * 2.0, uSeed)) * 0.5 + 0.5;
    float edge = smoothstep(1.0 - uEdgeWidth, 1.0, vQ);
    float edgeCore = smoothstep(1.0 - uEdgeWidth * 0.3, 1.0, vQ);
    float spine = exp(-pow(vC / 0.025, 2.0));
    // Engraved filigree: a band of scrolling lines down the middle of the blade.
    float scroll = abs(sin(d * 6.0 + sin(vC * 16.0 + d * 0.7) * 1.4 + uSeed));
    float band = smoothstep(0.12, 0.25, vQ) * (1.0 - smoothstep(0.55, 0.7, vQ));
    float filigree = (1.0 - smoothstep(0.0, 0.14, scroll)) * band * uFiligree;
    float sheen = exp(-pow((vS - uSheen) * 7.0, 2.0)) * uSheenGlow;

    vec3 col = mix(uColorBody, uColorHot, vQ * vQ) * (0.45 + 0.5 * n * uShaderIntensity);
    col += uColorEngrave * filigree * 1.5;
    col += uColorEdge * (edge * uEdgeGlow + edgeCore * uEdgeGlow * 1.5);
    col += uColorEdge * spine * 0.8;
    col += uColorHot * (sheen + graze + uFlare * 0.6);

    // Dissolves tip → hinge into light.
    float dn = snoise(vec3(d * 1.6, vC * 4.0, uSeed * 2.0)) * 0.5 + 0.5;
    float field = (1.0 - vS) * 0.8 + dn * 0.2;
    float thr = uDissolve * 1.1 - 0.05;
    float keep = uDissolve <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.02, field);
    float fray = uDissolve <= 0.0 ? 0.0 : smoothstep(thr - 0.01, thr + 0.02, field) - smoothstep(thr + 0.02, thr + 0.08, field);

    float body = 0.35 + 0.65 * max(edge, max(filigree, sheen * 0.5));
    float mask = body * keep * uPower * uOpacity * smoothstep(0.0, 0.02, vS);
    mask *= smoothstep(0.0, 0.06, vWorldY);
    if (mask < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (mask < 0.004) discard;
    vec3 color = col * uGlow * (1.0 + uFlare) + uColorEdge * fray * 5.0;
    gl_FragColor = vec4(color * uGlobalGlow, clamp(mask, 0.0, 1.0));
  }
`;

function bladeShapeUniforms() {
  return {
    uHinge: { value: new Vector3() },
    uA: { value: new Vector3(0, 0, 1) },
    uN: { value: new Vector3(0, -1, 0) },
    uLength: { value: 10 },
    uWidth: { value: 1 },
    uRoot: { value: 0.5 },
    uBelly: { value: 0.8 },
    uTipTaper: { value: 0.12 },
    uSpine: { value: 0.1 }
  };
}

/** @param {object} state { hinge, a, n, length } */
function syncBladeShape(u, state) {
  const c = settings[ID];
  u.uHinge.value.copy(state.hinge);
  u.uA.value.copy(state.a);
  u.uN.value.copy(state.n);
  u.uLength.value = Math.max(0.05, state.length);
  u.uWidth.value = Math.max(0.02, c.bladeWidth);
  u.uRoot.value = c.bladeRoot;
  u.uBelly.value = c.bladeBelly;
  u.uTipTaper.value = c.bladeTipTaper;
  u.uSpine.value = c.bladeSpine;
}

/** The blade itself. Additive light, both faces. */
export function createBladeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...bladeShapeUniforms(),
      uFace: { value: new Vector3(1, 0, 0) },
      uSeed: { value: 0 },
      uGlow: { value: 1.5 },
      uEdgeGlow: { value: 4 },
      uEdgeWidth: { value: 0.12 },
      uFiligree: { value: 1 },
      uSheen: { value: 0 },
      uSheenGlow: { value: 1.5 },
      uFlare: { value: 0 },
      uFresnel: { value: 1 },
      uOpacity: { value: 1 },
      uPower: { value: 1 },
      uDissolve: { value: 0 },
      uSoftFade: { value: 0.2 },
      uColorBody: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorEngrave: { value: new Color() }
    }),
    vertexShader: BLADE_VERTEX,
    fragmentShader: BLADE_FRAGMENT
  });

  /** @param {object} state { hinge, a, n, face, length, sheen, flare, power, dissolve, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncBladeShape(u, state);
    u.uFace.value.copy(state.face);
    u.uSeed.value = state.seed;
    u.uGlow.value = c.bladeGlow * g.glow;
    u.uEdgeGlow.value = c.edgeGlow * g.glow;
    u.uEdgeWidth.value = Math.max(0.01, c.edgeWidth);
    u.uFiligree.value = c.filigree;
    u.uSheen.value = state.sheen;
    u.uSheenGlow.value = c.sheenGlow;
    u.uFlare.value = state.flare;
    u.uFresnel.value = c.bladeFresnel * g.fresnel;
    u.uOpacity.value = c.bladeOpacity * g.opacity;
    u.uPower.value = state.power;
    u.uDissolve.value = state.dissolve;
    u.uSoftFade.value = c.softFade;
    u.uColorBody.value.copy(getColor(c.colorBladeBody));
    u.uColorHot.value.copy(getColor(c.colorBladeHot));
    u.uColorEdge.value.copy(getColor(c.colorBladeEdge));
    u.uColorEngrave.value.copy(getColor(c.colorEngrave));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The swing smear                                                      */
/* -------------------------------------------------------------------- */

const SMEAR_VERTEX = /* glsl */ `
  uniform vec3 uA0;
  uniform vec3 uN0;
  varying float vS;
  varying float vT;

  ${BLADE_GLSL}

  void main() {
    float s = position.x;
    float t = position.y;
    // From where the edge was a moment ago (t = 0) to where it is now (t = 1).
    vec3 A = normalize(mix(uA0, uA, t));
    vec3 N = normalize(mix(uN0, uN, t));
    vec3 world = uHinge + A * (s * uLength) + N * edgeDepth(s);
    vS = s;
    vT = t;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SMEAR_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uLength;
  uniform float uPower;
  uniform float uGlow;
  uniform float uTime;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying float vS;
  varying float vT;

  ${noiseGLSL}

  void main() {
    float d = vS * uLength;
    float streak = 0.55 + 0.45 * snoise(vec3(d * 2.2, vT * 0.6, uSeed));
    float lead = pow(vT, 2.4);
    float m = lead * streak * smoothstep(0.0, 0.08, vS) * (1.0 - smoothstep(0.92, 1.0, vS)) * uPower;
    if (m < 0.004) discard;
    vec3 col = mix(uColorB, uColorA, pow(vT, 6.0));
    gl_FragColor = vec4(col * m * uGlow * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

const SMEAR_WARP_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uLength;
  uniform float uPower;
  uniform float uTime;
  uniform float uStrength;
  uniform float uShaderIntensity;

  varying float vS;
  varying float vT;

  ${noiseGLSL}

  void main() {
    float d = vS * uLength;
    vec2 n = vec2(snoise(vec3(d * 1.4, vT * 2.0, uSeed + uTime * 3.0)), snoise(vec3(d * 1.4 + 9.1, vT * 2.0, uSeed - uTime * 3.0)));
    float mask = pow(vT, 1.5) * smoothstep(0.0, 0.1, vS) * (1.0 - smoothstep(0.9, 1.0, vS)) * uPower;
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(n * 0.5 + 0.5, strength, mask);
  }
`;

function smearUniforms() {
  return {
    ...bladeShapeUniforms(),
    uA0: { value: new Vector3(0, 0, 1) },
    uN0: { value: new Vector3(0, -1, 0) },
    uSeed: { value: 0 },
    uPower: { value: 0 }
  };
}

/** The fan of light the edge drags behind it as it swings. */
export function createSmearMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...smearUniforms(),
      uGlow: { value: 3 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: SMEAR_VERTEX,
    fragmentShader: SMEAR_FRAGMENT
  });

  /** @param {object} state { hinge, a, n, a0, n0, length, power, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncBladeShape(u, state);
    u.uA0.value.copy(state.a0);
    u.uN0.value.copy(state.n0);
    u.uSeed.value = state.seed;
    u.uPower.value = state.power * g.opacity;
    u.uGlow.value = c.smearGlow * g.glow;
    u.uColorA.value.copy(getColor(c.colorSmearA));
    u.uColorB.value.copy(getColor(c.colorSmearB));
  };
  return material;
}

/** The air the blade cuts — LAYER.DISTORTION. */
export function createSmearWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...smearUniforms(),
      uStrength: { value: 1 }
    }),
    vertexShader: SMEAR_VERTEX,
    fragmentShader: SMEAR_WARP_FRAGMENT
  });

  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncBladeShape(u, state);
    u.uA0.value.copy(state.a0);
    u.uN0.value.copy(state.n0);
    u.uSeed.value = state.seed;
    u.uPower.value = state.power;
    u.uStrength.value = c.smearWarp * g.distortion;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The cut                                                              */
/* -------------------------------------------------------------------- */

const CUT_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uHalfWidth;

  varying vec2 vFlat;          // x: metres across, y: metres along

  void main() {
    float across = position.y * uHalfWidth;
    float along = position.x * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = 0.015;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const CUT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uLength;
  uniform float uCut;          // metres cut so far
  uniform float uTelegraph;    // 0..1 the guide line before the swing
  uniform float uHeat;         // 1 white-hot .. 0 cold
  uniform float uSlit;
  uniform float uGlowWidth;
  uniform float uShards;
  uniform float uShardLength;
  uniform float uFresh;
  uniform float uGlow;
  uniform float uJitter;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorHot;
  uniform vec3  uColorGold;
  uniform vec3  uColorCool;
  uniform vec3  uColorScorch;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    float x = vFlat.x;
    float y = vFlat.y;
    if (y < 0.0 || y > uLength) discard;
    float j = snoise(vec3(y * 1.3, uSeed, 0.0)) * uJitter;
    float ax = abs(x - j);

    // Before the swing: a thin marching guide line, the blade's shadow.
    float march = 0.5 + 0.5 * sin(y * 4.0 - uTime * 10.0);
    float guide = (1.0 - smoothstep(0.015, 0.05, ax)) * (0.35 + 0.65 * march) * uTelegraph;

    float cut = 1.0 - smoothstep(uCut - 0.05, uCut, y);
    float fresh = exp(-max(uCut - y, 0.0) / max(uFresh, 0.05));
    float T = clamp(uHeat * (0.55 + 0.45 * fresh), 0.0, 1.0);
    float slit = 1.0 - smoothstep(uSlit * 0.3, uSlit, ax);
    float glow = exp(-ax * ax / max(uGlowWidth * uGlowWidth, 1e-4));
    // Shards of light radiating off the cut, perpendicular to it.
    float cellY = floor(y * uShards);
    float h = hash11(cellY + uSeed);
    float lane = 1.0 - smoothstep(0.0, 0.18, abs(fract(y * uShards) - 0.5 - (h - 0.5) * 0.5));
    float shard = lane * step(0.45, h) * exp(-ax / max(uShardLength * (0.4 + h), 0.02)) * smoothstep(uSlit, uSlit * 2.5, ax);
    float scorch = (1.0 - smoothstep(uSlit, uSlit * 4.0 + 0.15, ax)) * cut;

    float lit = cut * max(slit, max(glow * 0.45, shard * 0.7));
    vec3 hot = mix(uColorCool, uColorGold, smoothstep(0.1, 0.5, T * lit));
    hot = mix(hot, uColorHot, smoothstep(0.5, 0.95, T * max(slit, shard * 0.6)));
    vec3 color = mix(uColorScorch, hot * uGlow * (0.25 + 1.2 * T) * uGlobalGlow, smoothstep(0.0, 0.15, lit * (0.2 + T)));
    color += uColorGold * guide * uGlow * uGlobalGlow;

    float a = max(scorch * 0.55, lit * (0.25 + 0.75 * T));
    a = max(a, guide);
    float n = snoise(vec3(x * 2.5, y * 0.8, uSeed * 4.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.2 - 0.1;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, n);
    a *= vis * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(color, clamp(a, 0.0, 1.0));
  }
`;

/** The cut down the line. Normal blending: the scorch must darken; the slit is HDR. */
export function createCutMaterial() {
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
      uHalfWidth: { value: 2 },
      uSeed: { value: 0 },
      uCut: { value: 0 },
      uTelegraph: { value: 0 },
      uHeat: { value: 1 },
      uSlit: { value: 0.08 },
      uGlowWidth: { value: 0.5 },
      uShards: { value: 2 },
      uShardLength: { value: 0.8 },
      uFresh: { value: 3 },
      uGlow: { value: 3 },
      uJitter: { value: 0.04 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorHot: { value: new Color() },
      uColorGold: { value: new Color() },
      uColorCool: { value: new Color() },
      uColorScorch: { value: new Color() }
    }),
    vertexShader: CUT_VERTEX,
    fragmentShader: CUT_FRAGMENT
  });

  /** @param {object} state { start, dir, side, length, cut, telegraph, heat, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uHalfWidth.value = Math.max(0.2, c.shardLength * 2 + c.cutGlowWidth * 2 + 0.3);
    u.uSeed.value = state.seed;
    u.uCut.value = state.cut;
    u.uTelegraph.value = state.telegraph * c.telegraph;
    u.uHeat.value = state.heat;
    u.uSlit.value = Math.max(0.005, c.cutWidth);
    u.uGlowWidth.value = Math.max(0.01, c.cutGlowWidth);
    u.uShards.value = Math.max(0.05, c.shardDensity);
    u.uShardLength.value = c.shardLength;
    u.uFresh.value = c.freshLength;
    u.uGlow.value = c.cutGlow * g.glow;
    u.uJitter.value = c.cutJitter * g.noiseStrength;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorHot.value.copy(getColor(c.colorCutHot));
    u.uColorGold.value.copy(getColor(c.colorCutGold));
    u.uColorCool.value.copy(getColor(c.colorCutCool));
    u.uColorScorch.value.copy(getColor(c.colorScorch));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The glint                                                            */
/* -------------------------------------------------------------------- */

const GLINT_VERTEX = /* glsl */ `
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

const GLINT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  void main() {
    float r = length(vUv);
    if (r > 1.0 || uIntensity <= 0.001) discard;
    float core = exp(-r * r * 30.0);
    float halo = exp(-r * 3.5) * (1.0 - smoothstep(0.6, 1.0, r));
    // A four-pointed star, slowly turning.
    vec2 p = vUv;
    float a = uTime * 0.4 + uSeed;
    p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
    float star = (exp(-abs(p.x) * 40.0) + exp(-abs(p.y) * 40.0)) * exp(-r * 2.0);
    vec3 col = uColorHalo * (halo + star * 1.2) + uColorCore * core * 2.5;
    float m = clamp(halo + star + core, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, r));
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, m);
  }
`;

/** A star of light: on the halo, and riding the point of contact. */
export function createGlintMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 1 },
      uIntensity: { value: 0 },
      uSeed: { value: 0 },
      uColorCore: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: GLINT_VERTEX,
    fragmentShader: GLINT_FRAGMENT
  });

  /** @param {object} state { center, size, intensity, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.01, state.size);
    u.uIntensity.value = state.intensity * c.glintGlow * g.glow;
    u.uSeed.value = state.seed;
    u.uColorCore.value.copy(getColor(c.colorGlintCore));
    u.uColorHalo.value.copy(getColor(c.colorGlintHalo));
  };
  return material;
}
