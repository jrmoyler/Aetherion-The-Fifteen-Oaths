import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms, frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Pendulum Cleaver — the bespoke shaders the pendulum is drawn with.
 *
 *  - **the metal** — one fragment stage shared by the blade, the rod and the
 *    pivot ring: steel (or brass) lit by the sun, reflecting the stage's sky,
 *    etched with a filigree, a gold fresnel rim (the thing is half in another
 *    time), a honed edge that glows gold-white and runs hot on the cleave,
 *    and a materialise / dissolve along a burning gold edge.
 *  - **the blade** (`createBladeMaterial`) — a crescent shaped entirely in the
 *    vertex stage from (q, v, w) parameters: two elliptic arcs that meet at
 *    swept-up tips, a convex honed edge underneath and a concave spine on
 *    top, thick at the spine and tapering to nothing at the edge. Normals are
 *    finite differences of the same function, so every slider reshapes it
 *    with correct lighting.
 *  - **the rod** (`createRodMaterial`) — a tube stretched between the pivot
 *    and the collar, swelling into a collar at the blade end.
 *  - **the smear** (`createSmearMaterial`) — an additive fan swept round the
 *    pivot behind the blade: the swing's wake, streaked, brightest at the
 *    blade and gone a few degrees back. Its span is the swing's own angular
 *    speed, so it vanishes when the swing stalls — the stop is *visible*.
 *  - **the scars** (`createScarMaterial`) — a strip down the line holding up
 *    to 24 gouges, each a slanted slash across the line where the edge passed
 *    low, white-hot when cut and cooling to a dark groove; plus a faint gold
 *    timeline under the pivot's path.
 *  - **the halo** (`createHaloMaterial`) — a billboard behind the stopped
 *    blade: a ring of gold light and a slow tick of radial marks.
 *  - **the warp** (`createWarpMaterial`) — LAYER.DISTORTION: a slow
 *    eddy round the blade while it hangs, then a hard shock ring on the cleave.
 *
 * Every material reads `settings.pendulum` in `userData.sync(state)`.
 */

const ID = 'pendulum';
export const MAX_SCARS = 24;

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* -------------------------------------------------------------------- */
/* The metal                                                            */
/* -------------------------------------------------------------------- */

const METAL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  uniform vec3  uSteel;
  uniform vec3  uSteelDark;
  uniform vec3  uBrass;
  uniform vec3  uEdge;
  uniform vec3  uEdgeHot;
  uniform vec3  uRim;
  uniform vec3  uRevealColor;
  uniform float uEnv;
  uniform float uSpecular;
  uniform float uGloss;
  uniform float uEngrave;
  uniform float uEngraveScale;
  uniform float uEdgeGlow;
  uniform float uEdgeWidth;
  uniform float uRimGlow;
  uniform float uHeat;        // 0..1 the edge running hot on the cleave
  uniform float uHalo;        // 0..1 the stall: the rim burns brighter
  uniform float uReveal;      // 0 gone .. 1 whole
  uniform float uRevealEdge;
  uniform float uSeed;
  uniform float uGlowMul;     // the pivot's rune core is brighter than the blade

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;
  varying float vEdge;        // 0 on the honed edge .. 1 at the spine
  varying float vBrass;       // 0 steel .. 1 brass

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    // Materialise / dissolve: noise plus a sweep from the pivot outward.
    float rn = snoise01(vLocal * 2.3 + uSeed) * 0.75 + 0.25 * (1.0 - vEdge);
    float thr = 1.08 - uReveal * 1.16;
    if (rn < thr) discard;
    float revealEdge = 1.0 - smoothstep(thr, thr + uRevealEdge, rn);
    if (uReveal >= 1.0) revealEdge = 0.0;

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (dot(N, V) < 0.0) N = -N;

    // Etched filigree: thin curling lines, and a hammered roughness.
    vec3 lp = vLocal * uEngraveScale;
    float curl = sin(lp.x * 5.0 + snoise(lp * 0.7 + uSeed) * 3.5) * sin(lp.y * 5.0 + snoise(lp.yzx * 0.7) * 3.5);
    float etch = smoothstep(0.82, 0.98, abs(curl)) * uEngrave * smoothstep(0.25, 0.45, vEdge);
    N = normalize(N + vec3(snoise(vLocal * 11.0), snoise(vLocal * 11.0 + 7.0), snoise(vLocal * 11.0 + 13.0)) * 0.025);

    vec3 base = mix(uSteel, uBrass, vBrass);
    // A dark fuller groove runs along the blade under the spine.
    float fuller = smoothstep(0.55, 0.62, vEdge) * (1.0 - smoothstep(0.72, 0.8, vEdge)) * (1.0 - vBrass);
    base = mix(base, uSteelDark, max(etch * 0.8, fuller * 0.85));

    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    vec3 F0 = mix(vec3(0.35), base, 0.6);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
    vec3 color = base * 0.18 * (0.3 + 0.7 * max(dot(N, L), 0.0));
    color += env * F * uEnv;
    color += base * pow(max(dot(N, H), 0.0), uGloss) * uSpecular;
    color += base * 0.1;

    // The honed edge — a bevel of gold light along the convex edge.
    float edge = 1.0 - smoothstep(0.0, max(uEdgeWidth, 0.01), vEdge);
    float shimmer = 0.75 + 0.25 * snoise(vec3(vLocal.x * 3.0 - uTime * 2.0, uSeed, 0.0));
    vec3 edgeCol = mix(uEdge, uEdgeHot, clamp(uHeat + (1.0 - edge) * 0.4, 0.0, 1.0));
    color += edgeCol * edge * edge * uEdgeGlow * (1.0 + uHeat * 2.0) * shimmer * uGlobalGlow * uGlowMul;

    // Half of it is in another time: a gold fresnel rim, brighter at the stall.
    float rim = pow(1.0 - ndv, 3.0);
    color += uRim * rim * uRimGlow * (1.0 + uHalo * 2.5) * uGlobalGlow;
    color += uRevealColor * revealEdge * 5.0 * uGlobalGlow;
    // The etching is not ink: it is lit from inside, faintly, in gold.
    color += uRim * etch * 0.9 * (0.6 + 0.4 * sin(uTime * 3.0 + vLocal.x * 2.0)) * uGlobalGlow;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** The blade's outline and section, in metres, from (q, v, w). Shared with the CPU. */
const BLADE_GLSL = /* glsl */ `
  uniform float uWidth;
  uniform float uDepth;
  uniform float uInner;
  uniform float uTipUp;
  uniform float uThick;

  vec3 bladeShape(float q, float v, float w) {
    float s = sqrt(max(1.0 - q * q, 0.0));
    float up = uTipUp * q * q;
    float yb = up - uDepth * s;
    float yt = up - uDepth * uInner * s;
    float y = mix(yb, yt, v);
    float z = w * uThick * 0.5 * pow(max(v, 0.0), 0.6) * pow(s, 0.35);
    return vec3(q * uWidth * 0.5, y, z);
  }
`;

const BLADE_VERTEX = /* glsl */ `
  attribute float aCap;

  uniform vec3 uAttach;       // the collar, world
  uniform vec3 uAcross;       // the swing's tangent — the blade's x
  uniform vec3 uDown;         // pivot → blade — the blade's −y
  uniform vec3 uFlat;         // the line — the blade's thickness axis

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;
  varying float vEdge;
  varying float vBrass;

  ${BLADE_GLSL}

  vec3 toWorld(vec3 l) { return uAcross * l.x - uDown * l.y + uFlat * l.z; }

  void main() {
    float q = position.x;
    float v = position.y;
    float w = position.z;
    vec3 l = bladeShape(q, v, w);
    vec3 n;
    if (aCap > 0.5) {
      // The spine strip: its normal is the spine's own outward direction.
      float e = 0.01;
      vec3 a = bladeShape(q - e, 1.0, 0.0);
      vec3 b = bladeShape(q + e, 1.0, 0.0);
      vec3 t = normalize(b - a);
      n = normalize(vec3(-t.y, t.x, 0.0));
      if (n.y < 0.0) n = -n;
    } else {
      float e = 0.01;
      vec3 dq = bladeShape(min(q + e, 1.0), v, w) - bladeShape(max(q - e, -1.0), v, w);
      vec3 dv = bladeShape(q, min(v + e, 1.0), w) - bladeShape(q, max(v - e, 0.0), w);
      n = normalize(cross(dq, dv) + vec3(0.0, 0.0, 1e-5)) * sign(w);
    }
    vec3 world = uAttach + toWorld(l);
    vWorld = world;
    vNormalW = normalize(toWorld(n));
    vLocal = l;
    vEdge = v;
    vBrass = 0.0;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const ROD_VERTEX = /* glsl */ `
  uniform vec3  uP0;          // the pivot
  uniform vec3  uP1;          // the collar
  uniform float uRodR;
  uniform float uCollarR;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;
  varying float vEdge;
  varying float vBrass;

  void main() {
    float s = position.x;
    float ang = position.y * 6.2831853;
    vec3 T = normalize(uP1 - uP0 + vec3(0.0, 1e-5, 0.0));
    vec3 ref = abs(T.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 A = normalize(cross(T, ref));
    vec3 B = cross(T, A);
    vec3 radial = cos(ang) * A + sin(ang) * B;
    // A collar where it meets the blade, a knuckle where it hangs.
    float collar = smoothstep(0.9, 0.97, s) * (1.0 - smoothstep(0.995, 1.0, s));
    float knuckle = 1.0 - smoothstep(0.0, 0.04, s);
    float bands = 0.12 * smoothstep(0.6, 1.0, sin(s * 60.0)) * step(0.82, s);
    float r = uRodR * (1.0 + bands) + (uCollarR - uRodR) * collar + uRodR * 0.8 * knuckle;
    vec3 c = mix(uP0, uP1, s);
    vec3 world = c + radial * r;
    vWorld = world;
    vNormalW = radial;
    vLocal = vec3(cos(ang) * 0.3, s * 6.0, sin(ang) * 0.3);
    vEdge = 1.0;
    vBrass = collar > 0.1 || knuckle > 0.1 ? 1.0 : 0.25;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const PIVOT_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform vec3  uAxisA;       // the ring's plane
  uniform vec3  uAxisB;
  uniform float uRingR;
  uniform float uTubeR;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;
  varying float vEdge;
  varying float vBrass;

  void main() {
    // The rod geometry, read as a torus: x round the ring, y round the tube.
    float a = position.x * 6.2831853;
    float b = position.y * 6.2831853;
    vec3 radial = cos(a) * uAxisA + sin(a) * uAxisB;
    vec3 axis = normalize(cross(uAxisA, uAxisB));
    // Notched like an escapement crown: a tooth every 30 degrees.
    float tooth = smoothstep(0.6, 0.95, cos(a * 12.0)) * 0.45;
    vec3 n = cos(b) * radial + sin(b) * axis;
    vec3 world = uCenter + radial * (uRingR + uTubeR * tooth * max(cos(b), 0.0)) + n * uTubeR;
    vWorld = world;
    vNormalW = n;
    vLocal = vec3(cos(a), sin(a), b) * 1.5;
    vEdge = 1.0;
    vBrass = 1.0;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

function metalUniforms() {
  return sharedUniforms({
    uEnvMap: frame.uEnvMap,
    uSteel: { value: new Color() },
    uSteelDark: { value: new Color() },
    uBrass: { value: new Color() },
    uEdge: { value: new Color() },
    uEdgeHot: { value: new Color() },
    uRim: { value: new Color() },
    uRevealColor: { value: new Color() },
    uEnv: { value: 1.3 },
    uSpecular: { value: 2 },
    uGloss: { value: 60 },
    uEngrave: { value: 0.5 },
    uEngraveScale: { value: 3 },
    uEdgeGlow: { value: 4 },
    uEdgeWidth: { value: 0.2 },
    uRimGlow: { value: 1 },
    uHeat: { value: 0 },
    uHalo: { value: 0 },
    uReveal: { value: 1 },
    uRevealEdge: { value: 0.08 },
    uSeed: { value: 0 },
    uGlowMul: { value: 1 }
  });
}

/** @param {object} state { reveal, heat, halo, seed } */
function syncMetal(u, state) {
  const c = settings[ID];
  const g = settings.global;
  u.uSteel.value.copy(getColor(c.colorSteel));
  u.uSteelDark.value.copy(getColor(c.colorSteelDark));
  u.uBrass.value.copy(getColor(c.colorBrass));
  u.uEdge.value.copy(getColor(c.colorEdge));
  u.uEdgeHot.value.copy(getColor(c.colorEdgeHot));
  u.uRim.value.copy(getColor(c.colorRim));
  u.uRevealColor.value.copy(getColor(c.colorReveal));
  u.uEnv.value = c.metalEnv;
  u.uSpecular.value = c.metalSpecular;
  u.uGloss.value = Math.max(1, c.metalGloss);
  u.uEngrave.value = c.engrave;
  u.uEngraveScale.value = c.engraveScale * g.noiseFrequency;
  u.uEdgeGlow.value = c.edgeGlow * g.glow * g.shaderIntensity;
  u.uEdgeWidth.value = c.edgeWidth;
  u.uRimGlow.value = c.rimGlow * g.fresnel;
  u.uHeat.value = state.heat;
  u.uHalo.value = state.halo;
  u.uReveal.value = state.reveal;
  u.uRevealEdge.value = Math.max(0.005, c.revealEdge);
  u.uSeed.value = state.seed;
}

function metalMaterial(vertexShader, extra) {
  return new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: { ...metalUniforms(), ...extra },
    vertexShader,
    fragmentShader: METAL_FRAGMENT
  });
}

/** The crescent. */
export function createBladeMaterial() {
  const material = metalMaterial(BLADE_VERTEX, {
    uAttach: { value: new Vector3() },
    uAcross: { value: new Vector3(1, 0, 0) },
    uDown: { value: new Vector3(0, -1, 0) },
    uFlat: { value: new Vector3(0, 0, 1) },
    uWidth: { value: 3 },
    uDepth: { value: 1.2 },
    uInner: { value: 0.4 },
    uTipUp: { value: 0.4 },
    uThick: { value: 0.16 }
  });

  /** @param {object} state { attach, across, down, flat, reveal, heat, halo, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const u = material.uniforms;
    syncMetal(u, state);
    u.uAttach.value.copy(state.attach);
    u.uAcross.value.copy(state.across);
    u.uDown.value.copy(state.down);
    u.uFlat.value.copy(state.flat);
    u.uWidth.value = Math.max(0.2, c.bladeWidth);
    u.uDepth.value = Math.max(0.1, c.bladeDepth);
    u.uInner.value = Math.min(0.95, Math.max(0, c.bladeInner));
    u.uTipUp.value = c.bladeTipUp;
    u.uThick.value = Math.max(0.005, c.bladeThickness);
  };

  return material;
}

/** The rod, pivot to collar. */
export function createRodMaterial() {
  const material = metalMaterial(ROD_VERTEX, {
    uP0: { value: new Vector3() },
    uP1: { value: new Vector3(0, -1, 0) },
    uRodR: { value: 0.05 },
    uCollarR: { value: 0.16 }
  });

  /** @param {object} state { pivot, attach, reveal, heat, halo, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const u = material.uniforms;
    syncMetal(u, state);
    u.uHeat.value = 0;
    u.uP0.value.copy(state.pivot);
    u.uP1.value.copy(state.attach);
    u.uRodR.value = Math.max(0.005, c.rodRadius);
    u.uCollarR.value = Math.max(c.rodRadius, c.collarRadius);
  };

  return material;
}

/** The pivot ring — the rod's tube grid read as a notched torus. */
export function createPivotMaterial() {
  const material = metalMaterial(PIVOT_VERTEX, {
    uCenter: { value: new Vector3() },
    uAxisA: { value: new Vector3(1, 0, 0) },
    uAxisB: { value: new Vector3(0, 1, 0) },
    uRingR: { value: 0.5 },
    uTubeR: { value: 0.07 }
  });
  /** @param {object} state { pivot, axisA, axisB, reveal, halo, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const u = material.uniforms;
    syncMetal(u, state);
    u.uHeat.value = 0;
    u.uRimGlow.value = c.rimGlow * settings.global.fresnel * (0.6 + c.pivotGlow * 0.4);
    u.uCenter.value.copy(state.pivot);
    u.uAxisA.value.copy(state.axisA);
    u.uAxisB.value.copy(state.axisB);
    u.uRingR.value = Math.max(0.02, c.pivotRadius);
    u.uTubeR.value = Math.max(0.005, c.pivotTube);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The smear                                                            */
/* -------------------------------------------------------------------- */

const SMEAR_VERTEX = /* glsl */ `
  uniform vec3  uPivot;
  uniform vec3  uSide;
  uniform float uTheta;       // the blade's angle now
  uniform float uSpan;        // signed radians the smear trails back
  uniform float uR0;
  uniform float uR1;
  uniform float uBladeFrom;
  uniform float uTipUp;
  uniform float uHalfW;       // half the blade's width, metres

  varying vec2  vFan;
  varying float vViewZ;

  void main() {
    // The wake starts at the blade's *trailing tip*, not its middle: a blade
    // this wide would otherwise hide its own smear.
    float r0 = mix(uR0, uR1, position.y);
    float bl = smoothstep(uBladeFrom - uTipUp, uBladeFrom + 0.04, position.y);
    float lead = sign(uSpan) * bl * min(uHalfW / max(r0, 0.1), 0.8);
    float a = uTheta - lead - uSpan * position.x;
    float r = mix(uR0, uR1, position.y);
    vec3 world = uPivot + (uSide * sin(a) - vec3(0.0, 1.0, 0.0) * cos(a)) * r;
    vFan = position.xy;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SMEAR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uStreaks;
  uniform float uBladeFrom;   // radial share where the blade starts
  uniform float uRodShare;
  uniform float uTipUp;       // radial share the tips sweep above the collar
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying vec2  vFan;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float back = vFan.x;
    float r = vFan.y;
    // Mostly the blade's band; a thin share up the rod.
    float blade = smoothstep(uBladeFrom - uTipUp, uBladeFrom + 0.04, r);
    float body = mix(uRodShare, 1.0, blade);
    // Streaks: the edge and the tips draw lines through the air.
    float streak = 0.72 + 0.28 * sin(r * uStreaks * 6.2831853 + snoise(vec3(r * 9.0, back * 2.0, uSeed)) * 2.0);
    float edgeLine = exp(-pow((r - 0.985) / 0.02, 2.0)) * 1.6;
    float tail = pow(1.0 - back, 2.2);
    float lead = smoothstep(0.0, 0.06, back);
    float a = tail * lead * body * (streak + edgeLine) * uOpacity;
    if (a < 0.003) discard;
    vec2 suv = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, suv, vViewZ, uCameraNear, uCameraFar, 0.3);
    vec3 col = mix(uColorB, uColorA, clamp(tail * 1.2 + edgeLine * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * a, a);
  }
`;

export function createSmearMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uPivot: { value: new Vector3() },
      uSide: { value: new Vector3(1, 0, 0) },
      uTheta: { value: 0 },
      uSpan: { value: 0 },
      uR0: { value: 4 },
      uR1: { value: 7 },
      uSeed: { value: 0 },
      uGlow: { value: 2 },
      uOpacity: { value: 0.5 },
      uStreaks: { value: 20 },
      uBladeFrom: { value: 0.6 },
      uRodShare: { value: 0.2 },
      uTipUp: { value: 0.1 },
      uHalfW: { value: 1.5 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: SMEAR_VERTEX,
    fragmentShader: SMEAR_FRAGMENT
  });

  /** @param {object} state { pivot, side, theta, span, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    const r1 = c.rodLength + c.bladeDepth;
    const r0 = Math.max(0.1, c.rodLength * 0.35);
    u.uPivot.value.copy(state.pivot);
    u.uSide.value.copy(state.side);
    u.uTheta.value = state.theta;
    u.uSpan.value = state.span;
    u.uR0.value = r0;
    u.uR1.value = r1;
    u.uBladeFrom.value = (c.rodLength + c.bladeDepth * c.bladeInner - r0) / Math.max(0.1, r1 - r0);
    u.uTipUp.value = Math.max(0, c.bladeTipUp + c.bladeDepth * c.bladeInner) / Math.max(0.1, r1 - r0);
    u.uHalfW.value = c.bladeWidth * 0.5;
    u.uRodShare.value = c.smearRod;
    u.uSeed.value = state.seed;
    u.uGlow.value = c.smearGlow * g.glow;
    u.uOpacity.value = c.smearOpacity * g.opacity * state.fade;
    u.uStreaks.value = c.smearStreaks;
    u.uColorA.value.copy(getColor(c.colorSmearA));
    u.uColorB.value.copy(getColor(c.colorSmearB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The scars                                                            */
/* -------------------------------------------------------------------- */

const SCAR_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uHalfWidth;

  varying vec2 vFlat;         // x: metres across, y: metres along

  void main() {
    float across = position.y * uHalfWidth;
    float along = position.x * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = 0.016;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SCAR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform vec4  uScars[${MAX_SCARS}]; // x along (m), y swing sign, z birth time, w strength
  uniform int   uCount;
  uniform float uHalf;
  uniform float uWidth;
  uniform float uSkew;
  uniform float uGlow;
  uniform float uCool;
  uniform float uGroove;
  uniform float uLineGlow;
  uniform float uLineWidth;
  uniform float uLineTo;      // the timeline exists up to here (m)
  uniform float uFade;
  uniform vec3  uHot;
  uniform vec3  uWarm;
  uniform vec3  uGrooveColor;
  uniform vec3  uLineColor;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    float x = vFlat.x;
    float y = vFlat.y;
    vec3 col = vec3(0.0);
    float alpha = 0.0;
    float emit = 0.0;

    for (int i = 0; i < ${MAX_SCARS}; i++) {
      if (i >= uCount) break;
      vec4 s = uScars[i];
      float age = uTime - s.z;
      float hl = uHalf * s.w;
      // A slash across the line, slanted the way the pivot was carrying it,
      // bowed slightly (the edge is an arc, not a ruler), ragged.
      float bow = 0.12 * (1.0 - (x * x) / max(hl * hl, 1e-3));
      float d = (y - s.x) - x * uSkew * s.y - bow;
      float rag = snoise(vec3(x * 3.0, s.x, uSeed)) * 0.35 + 0.65;
      float w = uWidth * rag * (0.4 + 0.6 * (1.0 - smoothstep(0.4, 1.0, abs(x) / hl)));
      float m = exp(-(d * d) / max(w * w, 1e-5)) * (1.0 - smoothstep(hl * 0.7, hl, abs(x)));
      // It is cut in a sweep: the gouge opens across from the side it came from.
      float open = clamp(age * 14.0, 0.0, 1.0);
      float side = -s.y * x / hl;
      m *= step(side, open * 2.0 - 1.0);
      float heat = exp(-max(age, 0.0) / max(uCool, 0.05));
      vec3 c = mix(uWarm, uHot, smoothstep(0.35, 1.0, heat));
      col += c * m * heat * uGlow;
      emit = max(emit, m * heat);
      alpha = max(alpha, m * mix(uGroove, 1.0, heat));
      // The lip: a dull bloom either side of a hot cut.
      float lip = exp(-(d * d) / max(9.0 * w * w, 1e-5)) * (1.0 - smoothstep(hl * 0.5, hl, abs(x)));
      col += uWarm * lip * heat * heat * 0.6;
    }

    // The timeline: a faint gold thread under the pivot's path.
    float lm = exp(-(x * x) / max(uLineWidth * uLineWidth, 1e-6)) * smoothstep(0.0, 0.6, y) * (1.0 - smoothstep(uLineTo - 0.4, uLineTo, y));
    float tick = 0.6 + 0.4 * smoothstep(0.7, 1.0, sin(y * 6.0 - uTime * 3.0));
    col += uLineColor * lm * uLineGlow * tick;
    alpha = max(alpha, lm * 0.6 * uLineGlow);

    float a = clamp(alpha, 0.0, 1.0) * uFade;
    if (a < 0.004) discard;
    // Dark groove under the glow: the cut is in the floor.
    vec3 base = mix(uGrooveColor, vec3(0.0), 0.0);
    vec3 outc = mix(base, col / max(alpha, 1e-3), clamp(emit + lm * uLineGlow, 0.0, 1.0));
    gl_FragColor = vec4(outc * uGlobalGlow, a);
  }
`;

export function createScarMaterial() {
  const scars = [];
  for (let i = 0; i < MAX_SCARS; i++) scars.push(new Vector4());
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
      uScars: { value: scars },
      uCount: { value: 0 },
      uHalf: { value: 1.6 },
      uWidth: { value: 0.07 },
      uSkew: { value: 0.2 },
      uGlow: { value: 4 },
      uCool: { value: 1.2 },
      uGroove: { value: 0.7 },
      uLineGlow: { value: 0.5 },
      uLineWidth: { value: 0.05 },
      uLineTo: { value: 0 },
      uFade: { value: 1 },
      uHot: { value: new Color() },
      uWarm: { value: new Color() },
      uGrooveColor: { value: new Color() },
      uLineColor: { value: new Color() }
    }),
    vertexShader: SCAR_VERTEX,
    fragmentShader: SCAR_FRAGMENT
  });

  /**
   * @param {object} state { start, dir, side, length, scars: Float32Array(4·N), count, lineTo, fade, seed }
   */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.5, state.length);
    u.uHalfWidth.value = c.scarHalf * 1.3 + 0.3;
    u.uSeed.value = state.seed;
    const src = state.scars;
    for (let i = 0; i < state.count; i++) {
      u.uScars.value[i].set(src[i * 4], src[i * 4 + 1], src[i * 4 + 2], src[i * 4 + 3]);
    }
    u.uCount.value = state.count;
    u.uHalf.value = Math.max(0.1, c.scarHalf);
    u.uWidth.value = Math.max(0.005, c.scarWidth);
    u.uSkew.value = c.scarSkew;
    u.uGlow.value = c.scarGlow * g.glow;
    u.uCool.value = c.scarCool * g.lifetime;
    u.uGroove.value = c.grooveOpacity;
    u.uLineGlow.value = c.lineGlow * g.glow;
    u.uLineWidth.value = Math.max(0.005, c.lineWidth);
    u.uLineTo.value = state.lineTo;
    u.uFade.value = state.fade * g.opacity;
    u.uHot.value.copy(getColor(c.colorScarHot));
    u.uWarm.value.copy(getColor(c.colorScarWarm));
    u.uGrooveColor.value.copy(getColor(c.colorGroove));
    u.uLineColor.value.copy(getColor(c.colorLine));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The halo and the warp — billboards                                   */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
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

const HALO_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uTick;        // integrated: the marks step round, slowly
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0 || uIntensity <= 0.001) discard;
    float a = atan(vUv.y, vUv.x);
    float ring = exp(-pow((r - 0.78) / 0.035, 2.0));
    float inner = exp(-pow((r - 0.62) / 0.012, 2.0)) * 0.6;
    // Twelve marks round the ring, stepping — time held, not stopped dead.
    float marks = smoothstep(0.92, 0.99, cos((a + uTick) * 12.0)) * smoothstep(0.6, 0.68, r) * (1.0 - smoothstep(0.74, 0.8, r));
    float glow = exp(-r * 3.5) * 0.35;
    float breakup = 0.7 + 0.3 * snoise(vec3(cos(a) * 2.0, sin(a) * 2.0, uTime * 0.6 + uSeed));
    float m = (ring + inner + marks * 1.4 + glow) * breakup;
    gl_FragColor = vec4(uColor * m * uIntensity * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

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
      uSize: { value: 2 },
      uSeed: { value: 0 },
      uIntensity: { value: 0 },
      uTick: { value: 0 },
      uColor: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: HALO_FRAGMENT
  });

  /** @param {object} state { center, size, intensity, gain, tick, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.05, state.size);
    u.uIntensity.value = state.intensity * state.gain * g.glow;
    u.uTick.value = state.tick;
    u.uSeed.value = state.seed;
    u.uColor.value.copy(getColor(c.colorHalo));
  };

  return material;
}

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uHold;        // 0..1 the slow eddy round the stopped blade
  uniform float uShock;       // 0..1 the shock ring's progress (0 = none)
  uniform float uStrength;
  uniform float uShockStrength;
  uniform float uShaderIntensity;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    vec2 dir = vUv / max(r, 1e-4);
    vec2 tang = vec2(-dir.y, dir.x);
    // The eddy: air wound round the blade, slowly, as if thick.
    float eddy = uHold * (1.0 - smoothstep(0.3, 1.0, r)) * smoothstep(0.0, 0.25, r);
    vec2 off = tang * eddy * (0.6 + 0.4 * snoise(vec3(vUv * 2.0, uTime * 0.4)));
    float strength = uStrength * eddy;
    // The shock: a ring pushed out from the cleave.
    if (uShock > 0.0) {
      float R = 0.1 + 0.9 * uShock;
      float d = (r - R) / 0.09;
      float slope = -d * exp(-d * d);
      float m = exp(-d * d) * (1.0 - uShock);
      off += dir * clamp(slope * 2.0, -1.0, 1.0) * m;
      strength = max(strength, uShockStrength * m);
    }
    strength *= uShaderIntensity;
    if (strength < 0.002) discard;
    float len = length(off);
    if (len > 1.0) off /= len;
    gl_FragColor = vec4(off * 0.5 + 0.5, strength, 1.0);
  }
`;

export function createWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 2 },
      uHold: { value: 0 },
      uShock: { value: 0 },
      uStrength: { value: 1 },
      uShockStrength: { value: 1 }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} state { center, size, hold, shock } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.1, state.size);
    u.uHold.value = state.hold;
    u.uShock.value = state.shock;
    u.uStrength.value = c.holdWarp * g.distortion;
    u.uShockStrength.value = c.ringWarp * g.distortion;
  };

  return material;
}
