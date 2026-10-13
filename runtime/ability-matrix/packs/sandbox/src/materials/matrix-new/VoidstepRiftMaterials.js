import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Voidstep Rift — the four bespoke surfaces of the step.
 *
 *  - `createVoidstepRiftMaterial` — one tall slit portal. An upright quad
 *    turned about world Y to face the camera, whose fragment stage is a signed
 *    distance to a torn slit: pinched at top and bottom, meandering, its two
 *    lips torn by independent noise. Inside, the void: three layers of stars
 *    and violet gas, each *parallaxed* by the real view ray as if it sat
 *    `voidDepth` metres behind the tear, and swirled harder toward the middle,
 *    so the inside reads as a hole and not as a picture. Round it, a white-hot
 *    lip and a violet halo. `uOpen` 0..1 tears it open and slams it shut —
 *    shut, it is a hairline crack of light that fades.
 *  - `createVoidstepFilamentMaterial` — crackling arcs off both rifts' lips,
 *    every filament of both rifts in one draw: built in the vertex stage from
 *    a parameter-space ribbon, re-struck `filamentRate` times a second, each
 *    strike kinked, tapered and camera-facing.
 *  - `createVoidstepThreadMaterial` — the faint thread of void joining the
 *    rifts, with a knot of light riding it where the caster is in transit.
 *  - `createVoidstepLensMaterial` — LAYER.DISTORTION: a twisting pull toward
 *    each open rift, and the ring the exit pulse throws when they slam shut.
 *
 * Every material reads `settings.voidstep` in `userData.sync(state)`; `state`
 * carries only what the ability knows that settings do not.
 */

/** The slit's half-width at height `y` (0..1), shared by the rift and the filaments. */
const SLIT_GLSL = /* glsl */ `
  float slitProfile(float y, float pinch) {
    return pow(clamp(4.0 * y * (1.0 - y), 0.0, 1.0), max(pinch, 0.05) * 0.5);
  }
`;

/* ==================================================================== */
/* The rift                                                              */
/* ==================================================================== */

const RIFT_VERTEX = /* glsl */ `
  uniform float uWidth;     // metres, fully open
  uniform float uHeight;    // metres
  uniform float uLift;      // metres the tear floats off the floor

  varying vec2  vQ;         // x metres across the rift, y 0..1 up it
  varying vec3  vWorld;
  varying vec3  vRight;
  varying vec3  vNormal;    // toward the camera, flat

  void main() {
    vec3 base = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 toCam = cameraPosition - base;
    toCam.y = 0.0;
    toCam = length(toCam) > 1e-4 ? normalize(toCam) : vec3(0.0, 0.0, 1.0);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));

    // Room round the slit for the torn lips, the halo and the hairline tips.
    float qw = uWidth * 2.4 + 0.4;
    float qh = uHeight * 1.2;
    float x = position.x * qw;
    float y = (position.y + 0.5) * qh - uHeight * 0.1;

    vec3 P = base + right * x + vec3(0.0, uLift + y, 0.0);
    vQ = vec2(x, y / max(uHeight, 1e-3));
    vWorld = P;
    vRight = right;
    vNormal = toCam;
    gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  }
`;

const RIFT_FRAGMENT = /* glsl */ `
  #define TAU 6.28318530718

  uniform float uTime;
  uniform float uWidth;
  uniform float uHeight;
  uniform float uOpen;        // 0 shut .. 1 open (may overshoot)
  uniform float uFade;        // the hairline dying after it shuts
  uniform float uPinch;
  uniform float uJag;
  uniform float uJagScale;
  uniform float uJagSpeed;
  uniform float uEdgeWidth;
  uniform float uEdgeGlow;
  uniform float uEdgeFlicker;
  uniform float uDepth;
  uniform float uSwirl;
  uniform float uTwist;
  uniform float uStarDensity;
  uniform float uStarSize;
  uniform float uStarBright;
  uniform float uNebula;
  uniform float uNebulaScale;
  uniform float uVoidGlow;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3  uColorDeep;
  uniform vec3  uColorGas;
  uniform vec3  uColorStar;
  uniform vec3  uColorEdgeCore;
  uniform vec3  uColorEdgeGlow;
  uniform vec3  uColorEdgeOuter;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vQ;
  varying vec3 vWorld;
  varying vec3 vRight;
  varying vec3 vNormal;

  ${noiseGLSL}
  ${SLIT_GLSL}

  /** One layer of the void: stars and gas at a depth, swirled. */
  vec3 voidLayer(vec2 p, float layer, float depth, vec3 V) {
    // Parallax: the point seen through p lies depth metres behind the plane
    // along the view ray. Clamped so a grazing view does not smear to infinity.
    float vz = max(dot(V, vNormal), 0.25);
    vec2 view = vec2(dot(V, vRight), V.y) / vz;
    vec2 q = p - view * depth;

    // The swirl: everything turns, and winds tighter toward the middle.
    float r = length(q);
    float a = uTime * uSwirl * (1.0 + layer * 0.35) + uTwist / (r + 0.35);
    float cs = cos(a), sn = sin(a);
    q = mat2(cs, -sn, sn, cs) * q;

    // Stars: one candidate per cell, most cells empty.
    float density = uStarDensity * (0.25 + layer * 0.18);
    vec2 g = q * density + layer * 17.3 + uSeed;
    vec2 cell = floor(g);
    float h = hash13(vec3(cell, layer));
    vec2 at = cell + 0.2 + 0.6 * vec2(hash13(vec3(cell, layer + 7.1)), hash13(vec3(cell, layer + 3.7)));
    float d = length(g - at);
    float twinkle = 0.6 + 0.4 * sin(uTime * (3.0 + h * 9.0) + h * 40.0);
    float star = exp(-d * d / max(uStarSize * uStarSize, 1e-5)) * step(0.72, h) * twinkle;

    // Gas, thinning with depth.
    float gas = fbm3(vec3(q * uNebulaScale, layer * 3.1 + uTime * 0.08 + uSeed));
    gas = smoothstep(-0.15, 0.7, gas) * uNebula / (1.0 + layer * 0.6);

    return uColorStar * star * uStarBright / (1.0 + layer * 0.5) + uColorGas * gas;
  }

  void main() {
    float y = vQ.y;
    float x = vQ.x;

    /* --- the slit: a meandering axis and two independently torn lips --- */
    float meander = snoise(vec3(y * 1.3, uSeed, uTime * 0.25)) * 0.12 * uWidth;
    float rel = x - meander;
    float lip = rel < 0.0 ? 0.0 : 1.0;
    float torn = fbm3(vec3(y * uJagScale * uHeight, lip * 13.7 + uSeed, uTime * uJagSpeed));
    float halfW = 0.5 * uWidth * uOpen * slitProfile(y, uPinch) * max(0.0, 1.0 + uJag * 2.0 * torn);
    float d = abs(rel) - halfW;      // metres; negative inside the void

    // The tear runs a little past the slit's tips as a hairline crack.
    float tips = smoothstep(-0.08, 0.02, y) * (1.0 - smoothstep(0.98, 1.08, y));

    /* --- the lip: white-hot core, violet glow, a wide dim halo --- */
    float flick = 1.0 - uEdgeFlicker * (0.5 + 0.5 * snoise(vec3(y * 6.0, uTime * 14.0, uSeed)));
    float ew = max(uEdgeWidth, 1e-3);
    float core = exp(-abs(d) / (ew * 0.35));
    float glow = exp(-abs(d) / ew);
    float halo = exp(-max(d, 0.0) / (ew * 5.0)) * 0.3;
    float lipE = (core * 1.6 + glow + halo) * tips * flick * uEdgeGlow;
    // Shut, the slit is a crack of light that dies on uFade.
    lipE *= uFade * mix(0.6, 1.0, clamp(uOpen, 0.0, 1.0));
    vec3 lipColor = uColorEdgeOuter * halo + uColorEdgeGlow * glow + uColorEdgeCore * core;
    lipColor /= max(core + glow + halo, 1e-3);

    /* --- the void --- */
    float aa = fwidth(d) + 1e-4;
    float inside = (1.0 - smoothstep(-aa, aa, d)) * step(0.001, halfW);
    vec3 voidColor = vec3(0.0);
    if (inside > 0.0) {
      vec3 V = normalize(cameraPosition - vWorld);
      vec2 p = vec2(rel, (y - 0.5) * uHeight);
      vec3 stars = vec3(0.0);
      for (int i = 0; i < 3; i++) {
        float layer = float(i);
        stars += voidLayer(p, layer, uDepth * (0.35 + layer * 0.45), V);
      }
      // Darker against the lips, a faint glow in the depths: it falls away.
      float depthShade = smoothstep(0.0, 1.0, -d / max(halfW, 1e-3));
      voidColor = uColorDeep + stars * (0.35 + 0.65 * depthShade);
      voidColor *= uVoidGlow * mix(1.0, uShaderIntensity, 0.5);
    }

    float lipA = clamp(lipE, 0.0, 1.0);
    float alpha = max(inside * uOpacity, lipA);
    if (alpha < 0.003) discard;
    // Premultiplied into a normal blend: the void darkens what is behind it,
    // the lip adds on top. out = void·inside + lip + dst·(1 − alpha).
    vec3 color = voidColor * inside * uOpacity * (1.0 - lipA) + lipColor * lipE * uGlobalGlow;
    gl_FragColor = vec4(color / alpha, alpha);
  }
`;

export function createVoidstepRiftMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 1 },
      uHeight: { value: 2.6 },
      uLift: { value: 0.05 },
      uOpen: { value: 0 },
      uFade: { value: 1 },
      uPinch: { value: 1.6 },
      uJag: { value: 0.18 },
      uJagScale: { value: 4.5 },
      uJagSpeed: { value: 1.6 },
      uEdgeWidth: { value: 0.06 },
      uEdgeGlow: { value: 5 },
      uEdgeFlicker: { value: 0.35 },
      uDepth: { value: 3 },
      uSwirl: { value: 1.4 },
      uTwist: { value: 2.5 },
      uStarDensity: { value: 34 },
      uStarSize: { value: 0.08 },
      uStarBright: { value: 3 },
      uNebula: { value: 0.75 },
      uNebulaScale: { value: 1.8 },
      uVoidGlow: { value: 1 },
      uOpacity: { value: 1 },
      uSeed: { value: 0 },
      uColorDeep: { value: new Color() },
      uColorGas: { value: new Color() },
      uColorStar: { value: new Color() },
      uColorEdgeCore: { value: new Color() },
      uColorEdgeGlow: { value: new Color() },
      uColorEdgeOuter: { value: new Color() }
    }),
    vertexShader: RIFT_VERTEX,
    fragmentShader: RIFT_FRAGMENT
  });

  /** @param {object} state { open, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.voidstep;
    const g = settings.global;
    const u = material.uniforms;
    u.uOpen.value = state.open;
    u.uFade.value = state.fade;
    u.uSeed.value = state.seed;
    u.uWidth.value = c.riftWidth;
    u.uHeight.value = c.riftHeight;
    u.uLift.value = c.riftLift;
    u.uPinch.value = c.riftPinch;
    u.uJag.value = c.riftJag * g.noiseStrength;
    u.uJagScale.value = c.riftJagScale * g.noiseFrequency;
    u.uJagSpeed.value = c.riftJagSpeed * g.noiseSpeed;
    u.uEdgeWidth.value = c.edgeWidth;
    u.uEdgeGlow.value = c.edgeGlow * g.glow;
    u.uEdgeFlicker.value = c.edgeFlicker;
    u.uDepth.value = c.voidDepth;
    u.uSwirl.value = c.voidSwirl * g.noiseSpeed;
    u.uTwist.value = c.voidTwist;
    u.uStarDensity.value = c.starDensity;
    u.uStarSize.value = c.starSize;
    u.uStarBright.value = c.starBright;
    u.uNebula.value = c.nebula * g.noiseStrength;
    u.uNebulaScale.value = c.nebulaScale * g.noiseFrequency;
    u.uVoidGlow.value = c.voidGlow;
    u.uOpacity.value = c.riftOpacity * g.opacity;
    u.uColorDeep.value.copy(getColor(c.colorVoidDeep));
    u.uColorGas.value.copy(getColor(c.colorVoidGas));
    u.uColorStar.value.copy(getColor(c.colorStar));
    u.uColorEdgeCore.value.copy(getColor(c.colorEdgeCore));
    u.uColorEdgeGlow.value.copy(getColor(c.colorEdgeGlow));
    u.uColorEdgeOuter.value.copy(getColor(c.colorEdgeOuter));
  };

  return material;
}

/* ==================================================================== */
/* Filaments                                                             */
/* ==================================================================== */

/**
 * Runs on `createBoltRibbonGeometry(nodes, 2 × MAX)`: every vertex is
 * `(t, side, 0)`, and `aStrand` picks rift (first half / second half) and
 * filament. Nothing is in metres, so the arcs are laid out entirely here from
 * the two rifts' feet and open amounts.
 *
 * Each filament re-strikes `uRate` times a second, staggered by its index. A
 * strike picks — from a hash of its strike number — a height on the slit, a
 * lip, an angle out from it and a length, so no two strikes land the same.
 */
const FILAMENT_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec3  uBaseA;
  uniform vec3  uBaseB;
  uniform float uOpenA;
  uniform float uOpenB;
  uniform float uMax;       // filaments per rift (capacity)
  uniform float uCount;     // live per rift
  uniform float uWidthRift;
  uniform float uHeightRift;
  uniform float uLift;
  uniform float uPinch;
  uniform float uLength;
  uniform float uWidth;
  uniform float uJag;
  uniform float uRate;

  attribute float aStrand;

  varying float vT;
  varying float vAcross;
  varying float vLife;      // 0 at the strike .. 1 when it is gone

  ${noiseGLSL}
  ${SLIT_GLSL}

  void main() {
    float rift = aStrand < uMax ? 0.0 : 1.0;
    float k = aStrand - rift * uMax;
    float open = rift < 0.5 ? uOpenA : uOpenB;
    vec3 base = rift < 0.5 ? uBaseA : uBaseB;

    float clock = uTime * uRate + k * 0.37 + rift * 0.61;
    float strike = floor(clock);
    vLife = fract(clock);

    if (k >= uCount || open <= 0.02) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off screen
      vT = 0.0; vAcross = 0.0;
      return;
    }

    float s = strike * 13.31 + k * 7.17 + rift * 91.3;
    vec3 toCam = cameraPosition - base;
    toCam.y = 0.0;
    toCam = length(toCam) > 1e-4 ? normalize(toCam) : vec3(0.0, 0.0, 1.0);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));

    float y0 = mix(0.12, 0.88, hash11(s));
    float side = hash11(s + 1.3) > 0.5 ? 1.0 : -1.0;
    float halfW = 0.5 * uWidthRift * open * slitProfile(y0, uPinch);
    vec3 start = base + right * side * halfW * 0.9 + vec3(0.0, uLift + y0 * uHeightRift, 0.0);

    float tilt = (hash11(s + 2.7) - 0.5) * 1.6;
    vec3 dir = normalize(right * side + vec3(0.0, tilt, 0.0) + toCam * (hash11(s + 4.1) - 0.5) * 0.6);
    float len = uLength * mix(0.45, 1.0, hash11(s + 5.9)) * open;

    float t = position.x;
    vec3 P = start + dir * len * t;
    vec3 perp = normalize(cross(dir, toCam) + vec3(1e-5));
    // Kinks: big ones along the arc, pinned to zero at the lip.
    float kink = snoise(vec3(t * 5.0, s, uTime * 2.0)) * 0.7 + snoise(vec3(t * 13.0, s + 3.0, uTime * 4.0)) * 0.3;
    P += perp * kink * uJag * sin(t * 3.14159);

    vec3 across = normalize(cross(dir, normalize(cameraPosition - P)) + vec3(1e-5));
    float w = uWidth * (1.0 - t * 0.8) * (1.0 - vLife * 0.5);
    P += across * position.y * w;

    vT = t;
    vAcross = position.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  }
`;

const FILAMENT_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uOpacity;
  uniform vec3  uColor;
  uniform vec3  uColorCore;
  uniform float uGlobalGlow;

  varying float vT;
  varying float vAcross;
  varying float vLife;

  void main() {
    float a = abs(vAcross);
    float core = exp(-a * a * 9.0);
    float body = 1.0 - smoothstep(0.3, 1.0, a);
    // A strike flashes, then decays; the far end dies first.
    float strike = pow(1.0 - vLife, 2.5) * (1.0 - smoothstep(0.55, 1.0, vT + vLife * 0.6));
    float energy = (body * 0.6 + core) * strike;
    if (energy < 0.003) discard;
    vec3 color = mix(uColor, uColorCore, core * 0.7);
    gl_FragColor = vec4(color * energy * uGlow * uGlobalGlow, clamp(energy, 0.0, 1.0) * uOpacity);
  }
`;

/** @param {number} max filaments per rift (capacity of the geometry / 2) */
export function createVoidstepFilamentMaterial(max) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uBaseA: { value: new Vector3() },
      uBaseB: { value: new Vector3() },
      uOpenA: { value: 0 },
      uOpenB: { value: 0 },
      uMax: { value: max },
      uCount: { value: 5 },
      uWidthRift: { value: 1 },
      uHeightRift: { value: 2.6 },
      uLift: { value: 0.05 },
      uPinch: { value: 1.6 },
      uLength: { value: 0.9 },
      uWidth: { value: 0.025 },
      uJag: { value: 0.18 },
      uRate: { value: 9 },
      uGlow: { value: 4 },
      uOpacity: { value: 1 },
      uColor: { value: new Color() },
      uColorCore: { value: new Color() }
    }),
    vertexShader: FILAMENT_VERTEX,
    fragmentShader: FILAMENT_FRAGMENT
  });

  /** @param {object} state { baseA, baseB, openA, openB } */
  material.userData.sync = (state) => {
    const c = settings.voidstep;
    const g = settings.global;
    const u = material.uniforms;
    u.uBaseA.value.copy(state.baseA);
    u.uBaseB.value.copy(state.baseB);
    u.uOpenA.value = state.openA;
    u.uOpenB.value = state.openB;
    u.uCount.value = Math.min(max, Math.max(0, Math.round(c.filamentCount)));
    u.uWidthRift.value = c.riftWidth;
    u.uHeightRift.value = c.riftHeight;
    u.uLift.value = c.riftLift;
    u.uPinch.value = c.riftPinch;
    u.uLength.value = c.filamentLength;
    u.uWidth.value = c.filamentWidth;
    u.uJag.value = c.filamentJag * g.randomness;
    u.uRate.value = c.filamentRate * g.animationSpeed;
    u.uGlow.value = c.filamentGlow * g.glow;
    u.uOpacity.value = g.opacity;
    u.uColor.value.copy(getColor(c.colorFilament));
    u.uColorCore.value.copy(getColor(c.colorEdgeCore));
  };

  return material;
}

/* ==================================================================== */
/* The thread                                                            */
/* ==================================================================== */

/**
 * A camera-facing ribbon from the entry rift toward the exit, at
 * `threadHeight`. `uHead` is how far along it has reached (it runs out with
 * the caster), `uKnot` where the knot of light rides.
 */
const THREAD_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec3  uFrom;
  uniform vec3  uDir;
  uniform float uHead;
  uniform float uHeight;
  uniform float uWidth;

  varying float vS;
  varying float vT;
  varying float vAcross;

  void main() {
    float t = position.x;
    float s = uHead * t;
    vec3 up = vec3(0.0, 1.0, 0.0);
    // A slow sag and sway, pinned at both rifts.
    float pin = sin(t * 3.14159);
    vec3 P = uFrom + uDir * s + up * (uHeight - pin * 0.08 + sin(s * 1.7 - uTime * 2.0) * 0.04 * pin);
    vec3 toCam = normalize(cameraPosition - P);
    vec3 across = cross(uDir, toCam);
    float len = length(across);
    across = len > 1e-4 ? across / len : normalize(cross(uDir, up) + vec3(1e-5));
    P += across * position.y * uWidth;
    vS = s;
    vT = t;
    vAcross = position.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  }
`;

const THREAD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uKnot;
  uniform float uKnotGlow;
  uniform float uKnotSize;
  uniform float uNoise;
  uniform float uNoiseScale;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorEdge;
  uniform float uGlobalGlow;

  varying float vS;
  varying float vT;
  varying float vAcross;

  ${noiseGLSL}

  void main() {
    float a = abs(vAcross);
    float body = 1.0 - smoothstep(0.2, 1.0, a);
    float core = exp(-a * a * 14.0);
    float n = fbm3(vec3(vS * uNoiseScale - uTime * 3.0, a, uSeed));
    float torn = mix(1.0, smoothstep(-0.3, 0.4, n), clamp(uNoise, 0.0, 1.0));
    float knot = exp(-pow((vS - uKnot) / max(uKnotSize, 1e-3), 2.0)) * uKnotGlow;
    float ends = smoothstep(0.0, 0.04, vT) * (1.0 - smoothstep(0.96, 1.0, vT));
    float energy = ((body * 0.4 + core) * torn + knot * (body + core)) * ends * uFade;
    if (energy < 0.003) discard;
    vec3 color = mix(uColorEdge, uColorCore, clamp(core * 0.7 + knot * 0.4, 0.0, 1.0));
    gl_FragColor = vec4(color * energy * uGlow * uGlobalGlow, clamp(energy, 0.0, 1.0) * uOpacity);
  }
`;

export function createVoidstepThreadMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFrom: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uHead: { value: 0 },
      uHeight: { value: 1.1 },
      uWidth: { value: 0.07 },
      uKnot: { value: 0 },
      uKnotGlow: { value: 1 },
      uKnotSize: { value: 1.2 },
      uNoise: { value: 0.6 },
      uNoiseScale: { value: 1.4 },
      uGlow: { value: 2.2 },
      uOpacity: { value: 0.7 },
      uFade: { value: 1 },
      uSeed: { value: 0 },
      uColorCore: { value: new Color() },
      uColorEdge: { value: new Color() }
    }),
    vertexShader: THREAD_VERTEX,
    fragmentShader: THREAD_FRAGMENT
  });

  /** @param {object} state { from, dir, head, knot, knotGlow, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.voidstep;
    const g = settings.global;
    const u = material.uniforms;
    u.uFrom.value.copy(state.from);
    u.uDir.value.copy(state.dir);
    u.uHead.value = state.head;
    u.uKnot.value = state.knot;
    u.uKnotGlow.value = c.threadPulse * state.knotGlow;
    u.uFade.value = state.fade;
    u.uSeed.value = state.seed;
    u.uHeight.value = c.threadHeight;
    u.uWidth.value = c.threadWidth;
    u.uKnotSize.value = c.threadPulseSize;
    u.uNoise.value = c.threadNoise * g.noiseStrength;
    u.uNoiseScale.value = c.threadNoiseScale * g.noiseFrequency;
    u.uGlow.value = c.threadGlow * g.glow;
    u.uOpacity.value = c.threadOpacity * g.opacity;
    u.uColorCore.value.copy(getColor(c.colorThreadCore));
    u.uColorEdge.value.copy(getColor(c.colorThreadEdge));
  };

  return material;
}

/* ==================================================================== */
/* Lenses (LAYER.DISTORTION)                                             */
/* ==================================================================== */

/**
 * A view-space disc, so `position.xy` is the screen direction from its centre.
 * Stretched tall (`uAspect`) to sit over a slit rather than a ball. Two terms:
 * the *pull* — the frame dragged in toward the tear and twisted round it — and
 * the *pulse*, a hard ring pushed outward when the rifts slam shut.
 */
const LENS_VERTEX = /* glsl */ `
  uniform float uSize;
  uniform float uAspect;
  varying vec2 vP;
  void main() {
    vP = position.xy * 2.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.x += position.x * uSize;
    mv.y += position.y * uSize * uAspect;
    gl_Position = projectionMatrix * mv;
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uPull;
  uniform float uSwirl;
  uniform float uPulse;
  uniform float uPulseAt;
  uniform float uSeed;
  uniform vec2  uResolution;
  uniform float uShaderIntensity;
  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    if (r > 1.0 || r < 1e-3) discard;
    vec2 dir = vP / r;
    vec2 tang = vec2(-dir.y, dir.x);
    float wob = snoise(vec3(vP * 3.0, uTime * 2.5 + uSeed)) * 0.06;

    // Strongest a little way out from the tear, dying at the rim.
    float band = smoothstep(0.0, 0.3, r) * (1.0 - smoothstep(0.55, 1.0, r));
    vec2 pull = (-dir * (1.0 - uSwirl) + tang * uSwirl) * uPull * band * (1.0 + wob * 4.0);

    float ring = exp(-pow((r - uPulseAt + wob) / 0.07, 2.0)) * uPulse;
    vec2 offset = pull + dir * ring;

    float strength = length(offset);
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    if (strength * mask < 0.002) discard;
    vec2 o = offset / max(strength, 1e-4);
    float aspect = max(uResolution.x, 1.0) / max(uResolution.y, 1.0);
    o.x /= aspect;
    gl_FragColor = vec4(normalize(o) * 0.5 + 0.5, strength * uShaderIntensity, mask);
  }
`;

export function createVoidstepLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 2.6 },
      uAspect: { value: 1.6 },
      uPull: { value: 0 },
      uSwirl: { value: 0.6 },
      uPulse: { value: 0 },
      uPulseAt: { value: 0 },
      uSeed: { value: 0 }
    }),
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} state { open, pulse (0..1 envelope), pulseAt (0..1), size, aspect, seed } */
  material.userData.sync = (state) => {
    const c = settings.voidstep;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = state.size;
    u.uAspect.value = state.aspect;
    u.uPull.value = state.open * c.lensStrength * g.distortion;
    u.uSwirl.value = c.lensSwirl;
    u.uPulse.value = state.pulse * c.pulseStrength * g.distortion;
    u.uPulseAt.value = state.pulseAt;
    u.uSeed.value = state.seed;
  };

  return material;
}
