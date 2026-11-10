import {
  AdditiveBlending,
  Color,
  CustomBlending,
  DoubleSide,
  MeshStandardMaterial,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector3
} from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { MAX_TETHER_POINTS } from '../../assets/atlas/ArcRelayGeometry.js';

/* ====================================================================== */
/* 1 · The tether                                                          */
/* ====================================================================== */

/**
 * One relay tether — two braided strands of current hung between relays.
 *
 * Chain Arc's bolts are re-rolled on the CPU because they are *events*. A
 * tether is a standing connection: it hangs for seconds while the lattice
 * grows, so it is placed entirely in the vertex stage from parameter space
 * (see `ArcRelayGeometry`). Per vertex the shader evaluates
 *
 *   base     the straight line from `uFrom` to `uTo`, bowed by `uBow`
 *   braid    each strand orbits that line by `uBraidRadius`, half a turn
 *            apart, `uBraidTwists` times end to end, rolling at `uBraidPhase`
 *   crackle  a two-octave *piecewise-linear* hash walk — straight runs and
 *            hard kinks, which is what reads as electricity; a smooth noise
 *            here reads as a rope. `uSeed` is re-rolled `crackleRate` times a
 *            second by the ability, so the kinks snap rather than slide.
 *
 * All three are pinned to zero at both ends by `sin(πt)`, so a tether always
 * lands exactly on its relay. The tangent is finite-differenced from the same
 * function and the strip is swung across the line of sight, so it is always
 * seen face-on.
 *
 * The fragment stage draws a hard core inside a falloff glow, the second strand
 * in its own colour, **packets** of current riding toward the relay, a hot head
 * on the growth front, a quantised strobe, and — on discharge — tears the whole
 * thing into pieces (`uSnap`).
 */
const TETHER_VERTEX = /* glsl */ `
  attribute vec3 aParam;   // x t 0..1, y side -1/+1, z strand 0/1

  uniform vec3  uFrom;
  uniform vec3  uTo;
  uniform float uBow;
  uniform float uBraidRadius;
  uniform float uBraidTwists;
  uniform float uBraidPhase;
  uniform float uJag;
  uniform float uJagMax;
  uniform float uJagFreq;
  uniform float uSeed;
  uniform float uPoints;
  uniform float uGlowWidth;
  uniform float uWidthScale;

  varying vec3  vCoord;    // x side, y t, z strand
  varying float vWidth;

  ${noiseGLSL}

  const float PI = 3.14159265359;

  vec3 tetherAt(float t, float strand, vec3 a, vec3 b, float len) {
    float env = sin(PI * t);
    vec3 p = mix(uFrom, uTo, t);
    p.y += uBow * len * 4.0 * t * (1.0 - t);

    // The braid: half a turn apart, pinched shut at the ends.
    float ang = t * uBraidTwists * 2.0 * PI + uBraidPhase + strand * PI;
    p += (a * cos(ang) + b * sin(ang)) * uBraidRadius * sqrt(max(env, 0.0));

    // Crackle: a piecewise-linear walk, two octaves, re-seeded per strike.
    float s = uSeed * 17.0 + strand * 5.31;
    float k = t * uJagFreq;
    float i0 = floor(k);
    vec2 j = mix(hash21(i0 + s), hash21(i0 + 1.0 + s), k - i0) * 2.0 - 1.0;
    float k2 = t * uJagFreq * 3.7;
    float i2 = floor(k2);
    j += (mix(hash21(i2 + s * 1.7 + 101.0), hash21(i2 + 1.0 + s * 1.7 + 101.0), k2 - i2) * 2.0 - 1.0) * 0.35;
    p += (a * j.x + b * j.y) * min(uJag * len, uJagMax) * env;
    return p;
  }

  void main() {
    // Quantise onto the live point count; the unused tail collapses onto the
    // last point (zero-area quads).
    float n = max(2.0, uPoints);
    float idx = floor(aParam.x * ${(MAX_TETHER_POINTS - 1).toFixed(1)} + 0.5);
    float t = min(idx, n - 1.0) / (n - 1.0);
    float strand = aParam.z;

    vec3 d = uTo - uFrom;
    float len = max(length(d), 1e-3);
    d /= len;
    vec3 a = cross(d, vec3(0.0, 1.0, 0.0));
    a = length(a) < 1e-4 ? vec3(1.0, 0.0, 0.0) : normalize(a);
    vec3 b = normalize(cross(a, d));

    vec3 p = tetherAt(t, strand, a, b, len);
    vec3 p0 = tetherAt(max(t - 0.012, 0.0), strand, a, b, len);
    vec3 p1 = tetherAt(min(t + 0.012, 1.0), strand, a, b, len);
    vec3 tangent = normalize(p1 - p0 + vec3(1e-5));

    vec3 toCamera = normalize(cameraPosition - p);
    vec3 across = cross(tangent, toCamera);
    float l = length(across);
    across = l > 1e-4 ? across / l : vec3(0.0, 1.0, 0.0);

    float taper = 0.55 + 0.45 * sin(PI * t);
    float width = uGlowWidth * uWidthScale * taper * mix(1.0, 0.72, strand);
    p += across * aParam.y * width;

    vCoord = vec3(aParam.y, t, strand);
    vWidth = width;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const TETHER_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uSeed;
  uniform float uGrow;
  uniform float uLevel;
  uniform float uSnap;
  uniform float uSnapScale;
  uniform float uOverload;
  uniform float uCoreWidth;
  uniform float uFalloff;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uStrandBalance;
  uniform float uPulseCount;
  uniform float uPulseSpeed;
  uniform float uPulseGlow;
  uniform float uFlicker;
  uniform vec3  uColorCore;
  uniform vec3  uColorGlow;
  uniform vec3  uColorEdge;
  uniform vec3  uColorAlt;

  varying vec3  vCoord;
  varying float vWidth;

  ${noiseGLSL}

  void main() {
    float t = vCoord.y;
    if (t > uGrow) discard;
    float strand = vCoord.z;
    float across = abs(vCoord.x);

    /* --- the snap: torn into pieces, re-diced every few frames --- */
    float piece = floor(t * uSnapScale + strand * 3.1 + uSeed * 7.0);
    if (hash11(piece + floor(uTime * 20.0) * 0.31) < uSnap) discard;

    /* --- profiles --- */
    float coreFrac = clamp(uCoreWidth / max(vWidth, 1e-4), 0.03, 0.9);
    float aa = fwidth(across) * 1.2;
    float core = 1.0 - smoothstep(coreFrac - aa, coreFrac + aa, across);
    float glow = pow(clamp(1.0 - across, 0.0, 1.0), uFalloff);

    /* --- packets of current running toward the relay --- */
    float ph = fract(t * uPulseCount - uTime * uPulseSpeed + strand * 0.5);
    float packet = exp(-pow((ph - 0.5) * 8.0, 2.0)) * uPulseGlow * uShaderIntensity;

    /* --- the hot head on the growth front (none once it has landed) --- */
    float head = smoothstep(uGrow - 0.14, uGrow, t) * (1.0 - step(1.0, uGrow)) * 2.0;

    /* --- strobe, quantised; faster under overload --- */
    float strobe = hash11(floor(uTime * mix(18.0, 46.0, uOverload)) + uSeed * 13.0 + strand * 3.0);
    float flick = 1.0 - uFlicker * step(0.7, strobe) * 0.8;

    vec3 strandColor = mix(uColorGlow, uColorAlt, strand);
    vec3 tint = mix(uColorEdge, strandColor, smoothstep(0.0, 0.7, glow));
    tint = mix(tint, uColorCore, uOverload * 0.45);
    vec3 color = tint * glow * (1.0 + packet) + uColorCore * core * (1.0 + head + packet * 0.5);

    float energy = uLevel * flick * mix(1.0, uStrandBalance, strand) * (1.0 + uOverload * 0.8);
    color *= energy * uIntensity * uGlobalGlow;
    float alpha = clamp(max(glow, core) * energy, 0.0, 1.0) * uOpacity;
    if (alpha < 0.003) discard;

    gl_FragColor = vec4(color * uOpacity, alpha);
  }
`;

/** One material per tether slot: each has its own endpoints and envelope. */
export function createRelayTetherMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFrom: { value: new Vector3() },
      uTo: { value: new Vector3(0, 0, 1) },
      uBow: { value: 0.08 },
      uBraidRadius: { value: 0.1 },
      uBraidTwists: { value: 3 },
      uBraidPhase: { value: 0 },
      uJag: { value: 0.05 },
      uJagMax: { value: 0.6 },
      uJagFreq: { value: 7 },
      uSeed: { value: Math.random() * 10 },
      uPoints: { value: 48 },
      uGlowWidth: { value: 0.22 },
      uWidthScale: { value: 1 },
      uGrow: { value: 1.01 },
      uLevel: { value: 1 },
      uSnap: { value: 0 },
      uSnapScale: { value: 14 },
      uOverload: { value: 0 },
      uCoreWidth: { value: 0.025 },
      uFalloff: { value: 2.2 },
      uIntensity: { value: 3.6 },
      uOpacity: { value: 1 },
      uStrandBalance: { value: 0.55 },
      uPulseCount: { value: 3 },
      uPulseSpeed: { value: 1.6 },
      uPulseGlow: { value: 2 },
      uFlicker: { value: 0.35 },
      uColorCore: { value: new Color(1, 1, 1) },
      uColorGlow: { value: new Color(0.5, 0.9, 1) },
      uColorEdge: { value: new Color(0.2, 0.4, 1) },
      uColorAlt: { value: new Color(0.7, 0.5, 1) }
    }),
    vertexShader: TETHER_VERTEX,
    fragmentShader: TETHER_FRAGMENT
  });

  /**
   * @param {object} s { from, to, grow, level, snap, overload, widthScale,
   *   seed, phase } — what the ability decided. Everything else is read from
   *   `settings.relay` here, so every slider is live on a hanging tether.
   */
  material.userData.sync = (s) => {
    const c = settings.relay;
    const g = settings.global;
    const u = material.uniforms;

    u.uFrom.value.copy(s.from);
    u.uTo.value.copy(s.to);
    u.uGrow.value = s.grow;
    u.uLevel.value = s.level;
    u.uSnap.value = s.snap;
    u.uOverload.value = s.overload;
    u.uWidthScale.value = s.widthScale;
    u.uSeed.value = s.seed;
    u.uBraidPhase.value = s.phase;

    u.uBow.value = c.bow;
    u.uBraidRadius.value = c.braidRadius;
    u.uBraidTwists.value = c.braidTwists;
    u.uJag.value = c.jag * g.noiseStrength;
    u.uJagMax.value = c.jagMax;
    u.uJagFreq.value = c.jagFrequency * g.noiseFrequency;
    u.uPoints.value = Math.max(2, Math.min(MAX_TETHER_POINTS, Math.round(c.tetherSegments)));
    u.uGlowWidth.value = c.glowWidth;
    u.uCoreWidth.value = c.coreWidth;
    u.uFalloff.value = c.glowFalloff;
    u.uIntensity.value = c.tetherIntensity * g.glow;
    u.uOpacity.value = c.tetherOpacity * g.opacity;
    u.uStrandBalance.value = c.strandBalance;
    u.uPulseCount.value = c.pulseCount;
    u.uPulseSpeed.value = c.pulseSpeed * g.animationSpeed;
    u.uPulseGlow.value = c.pulseGlow;
    u.uFlicker.value = c.tetherFlicker * g.shaderIntensity;
    u.uSnapScale.value = c.snapScale;

    u.uColorCore.value.copy(getColor(c.colorTetherCore));
    u.uColorGlow.value.copy(getColor(c.colorTetherGlow));
    u.uColorEdge.value.copy(getColor(c.colorTetherEdge));
    u.uColorAlt.value.copy(getColor(c.colorTetherAlt));
  };

  return material;
}

/* ====================================================================== */
/* 2 · The relay core                                                      */
/* ====================================================================== */

/**
 * The overload node that hangs over a claimed body.
 *
 * A camera-facing quad drawn entirely in polar coordinates:
 *
 *   - **the ball** — a white-hot centre in a boiling plasma skin (fbm on the
 *     radius), growing with the relay's charge and swelling under overload;
 *   - **filaments** — `uFilaments` angular cells, each a sharpened line
 *     reaching out of the ball to a hashed length. The cells are jittered by a
 *     noise of radius and *quantised* time, so the filaments jump between
 *     strikes rather than wave, and some drop out on each strike;
 *   - **the containment ring** — a broken ring that spins, which is what makes
 *     it read as a *device* (a relay) rather than a spark;
 *   - **the burst** — on discharge `uBurst` runs 0→1: the ball and filaments
 *     go out and a thin hot shell races to the edge of the quad.
 *
 * The quad is pushed toward the camera by the ability (`nodeLift`) so the
 * body it sits on never slices it.
 */
const CORE_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;

  void main() {
    vUv = position.xy;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uSeed;
  uniform float uCharge;
  uniform float uOverload;
  uniform float uBurst;
  uniform float uFade;
  uniform float uBall;
  uniform float uBoil;
  uniform float uBoilScale;
  uniform float uFilaments;
  uniform float uReach;
  uniform float uSharp;
  uniform float uCrackle;
  uniform float uRingRadius;
  uniform float uRingWidth;
  uniform float uGaps;
  uniform float uRingPhase;
  uniform float uIntensity;
  uniform float uFlicker;
  uniform float uOpacity;
  uniform vec3  uColorHot;
  uniform vec3  uColorMid;
  uniform vec3  uColorEdge;
  uniform vec3  uColorRing;

  varying vec2 vUv;

  ${noiseGLSL}

  const float TAU = 6.28318530718;

  void main() {
    vec2 p = vUv;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float strike = floor(uTime * uCrackle);
    float alive = 1.0 - uBurst;

    /* --- the ball --- */
    float boil = fbm3(vec3(p * uBoilScale, uTime * 1.7 + uSeed));
    float ballR = uBall * (0.55 + 0.45 * uCharge) * (1.0 + uOverload * 0.4) + boil * uBoil * 0.12;
    ballR = max(ballR, 0.02);
    float ball = 1.0 - smoothstep(ballR * 0.5, ballR, r);
    float hot = 1.0 - smoothstep(0.0, ballR * 0.6, r);
    float halo = exp(-max(r - ballR * 0.6, 0.0) * 6.0);

    /* --- filaments: jittered angular cells, re-struck on the crackle clock --- */
    float u = (a / TAU + 0.5) * uFilaments;
    float jit = snoise(vec3(r * 5.0, strike * 0.37, uSeed)) * 0.45 * uShaderIntensity;
    float cell = floor(u + jit);
    float dc = abs(fract(u + jit) - 0.5) * 2.0;
    float line = pow(clamp(1.0 - dc, 0.0, 1.0), uSharp);
    float reach = uReach * (0.3 + 0.7 * uCharge) * (0.55 + 0.45 * hash11(cell + strike * 1.31 + uSeed));
    float filament = line * smoothstep(ballR * 0.6, ballR, r) * (1.0 - smoothstep(reach * 0.55, reach, r));
    filament *= step(0.3 - uOverload * 0.3, hash11(cell * 3.7 + strike + uSeed));

    /* --- the containment ring, broken into arcs, spinning --- */
    float ringR = uRingRadius * (1.0 + uOverload * 0.18);
    float ringAA = fwidth(r) * 1.5;
    float ring = 1.0 - smoothstep(uRingWidth, uRingWidth + ringAA, abs(r - ringR));
    float g = fract((a / TAU + 0.5) * uGaps + uRingPhase);
    ring *= smoothstep(0.0, 0.06, g) * (1.0 - smoothstep(0.64, 0.7, g));
    ring *= smoothstep(0.1, 0.6, uCharge);

    /* --- the burst shell --- */
    float shellR = uBurst * 0.96;
    float shell = (1.0 - smoothstep(0.0, 0.06 + ringAA, abs(r - shellR))) * (1.0 - uBurst) * step(0.001, uBurst);

    float strobe = 1.0 - uFlicker * step(0.74, hash11(strike + uSeed * 11.0));
    float level = uCharge * (1.0 + uOverload * 1.6) * strobe;

    vec3 color = uColorHot * hot * 2.2
               + mix(uColorEdge, uColorMid, ball) * ball
               + uColorMid * halo * 0.35
               + mix(uColorMid, uColorHot, line) * filament * 1.6
               + uColorRing * ring * 1.4;
    color *= level * alive;
    color += uColorHot * shell * 4.0;

    float edge = 1.0 - smoothstep(0.86, 1.0, r);
    float alpha = clamp((max(max(ball, filament), max(ring, halo * 0.35)) * level * alive + shell) * edge, 0.0, 1.0);
    alpha *= uOpacity * uFade;
    if (alpha < 0.003) discard;

    gl_FragColor = vec4(color * uIntensity * uGlobalGlow * uOpacity * uFade, alpha);
  }
`;

export function createRelayCoreMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 0.6 },
      uSeed: { value: Math.random() * 10 },
      uCharge: { value: 0 },
      uOverload: { value: 0 },
      uBurst: { value: 0 },
      uFade: { value: 1 },
      uBall: { value: 0.3 },
      uBoil: { value: 0.5 },
      uBoilScale: { value: 3 },
      uFilaments: { value: 9 },
      uReach: { value: 0.85 },
      uSharp: { value: 18 },
      uCrackle: { value: 18 },
      uRingRadius: { value: 0.78 },
      uRingWidth: { value: 0.035 },
      uGaps: { value: 6 },
      uRingPhase: { value: 0 },
      uIntensity: { value: 3 },
      uFlicker: { value: 0.3 },
      uOpacity: { value: 1 },
      uColorHot: { value: new Color(1, 1, 1) },
      uColorMid: { value: new Color(0.5, 0.9, 1) },
      uColorEdge: { value: new Color(0.2, 0.3, 1) },
      uColorRing: { value: new Color(0.8, 0.6, 1) }
    }),
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT
  });

  /** @param {object} s { size, charge, overload, burst, fade, ringPhase, seed } */
  material.userData.sync = (s) => {
    const c = settings.relay;
    const g = settings.global;
    const u = material.uniforms;

    u.uSize.value = s.size;
    u.uCharge.value = s.charge;
    u.uOverload.value = s.overload;
    u.uBurst.value = s.burst;
    u.uFade.value = s.fade;
    u.uRingPhase.value = s.ringPhase;
    u.uSeed.value = s.seed;

    u.uBall.value = c.coreBall;
    u.uBoil.value = c.coreBoil * g.noiseStrength;
    u.uBoilScale.value = c.coreBoilScale * g.noiseFrequency;
    u.uFilaments.value = Math.max(1, Math.round(c.coreFilaments));
    u.uReach.value = c.filamentReach;
    u.uSharp.value = c.filamentSharp;
    u.uCrackle.value = c.crackleRate * g.noiseSpeed;
    u.uRingRadius.value = c.ringRadius;
    u.uRingWidth.value = c.ringWidth;
    u.uGaps.value = Math.max(1, Math.round(c.ringGaps));
    u.uIntensity.value = c.coreIntensity * g.glow;
    u.uFlicker.value = c.coreFlicker * g.shaderIntensity;
    u.uOpacity.value = g.opacity;

    u.uColorHot.value.copy(getColor(c.colorCoreHot));
    u.uColorMid.value.copy(getColor(c.colorCoreMid));
    u.uColorEdge.value.copy(getColor(c.colorCoreEdge));
    u.uColorRing.value.copy(getColor(c.colorCoreRing));
  };

  return material;
}

/* ====================================================================== */
/* 3 · The ground sigil                                                    */
/* ====================================================================== */

/**
 * The relay seal under a claimed body.
 *
 * A flat quad drawn as signed distances in polar space: two concentric rings,
 * `uSpokes` ticks between them, and an inner polygon with the same number of
 * sides, all turning at `uSpin`. It **draws in** from the middle as the relay
 * charges (`uReveal`), throbs with the lattice under overload, and is wiped
 * outward by the discharge (`uBurst`) — the floor half of the burst.
 *
 * Under the lines it is a **filled charged plate**, not a diagram: a deep,
 * floor-darkening disc (premultiplied blending, so the deep stop really is
 * dark on the floor), a slow plasma field in the body colour and veins of
 * current crawling through it that thicken under the overload.
 */
const SIGIL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SIGIL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;

  uniform float uReveal;
  uniform float uOverload;
  uniform float uBurst;
  uniform float uFade;
  uniform float uSpin;
  uniform float uSpokes;
  uniform float uLine;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uFill;
  uniform float uField;
  uniform float uFieldScale;
  uniform float uVeins;
  uniform float uSeed;
  uniform vec3  uColor;
  uniform vec3  uColorHot;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;

  varying vec2 vUv;

  const float PI = 3.14159265359;

  ${noiseGLSL}

  float band(float d, float w) {
    float aa = fwidth(d) * 1.2;
    return 1.0 - smoothstep(w, w + aa, abs(d));
  }

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = atan(vUv.y, vUv.x) + uSpin;
    float n = max(3.0, uSpokes);
    float sector = 2.0 * PI / n;

    float lines = band(r - 0.93, uLine) + band(r - 0.66, uLine * 0.7);

    // Ticks between the rings.
    float am = mod(a + sector * 0.5, sector) - sector * 0.5;
    float tick = band(am * r, uLine * 0.8) * step(0.66, r) * step(r, 0.93);

    // The inner polygon, counter-turning.
    float b = atan(vUv.y, vUv.x) - uSpin * 1.6;
    float bm = mod(b, sector) - sector * 0.5;
    float poly = cos(PI / n) / max(cos(bm), 1e-3);
    float polygon = band(r - 0.42 * poly, uLine * 0.8);

    float shape = clamp(lines + tick + polygon, 0.0, 1.0);

    // Draws in from the centre.
    float reveal = 1.0 - smoothstep(uReveal - 0.08, uReveal, r);

    // Under overload: a pulse running inward. On discharge: a wipe outward.
    float pulse = 0.5 + 0.5 * sin((r * 9.0 + uTime * 14.0));
    float throb = 1.0 + uOverload * (0.6 + 1.2 * pulse);
    float burstEdge = band(r - uBurst, 0.05) * step(0.001, uBurst) * (1.0 - uBurst);
    float keep = uBurst > 0.0 ? smoothstep(uBurst - 0.2, uBurst, r) : 1.0;

    /* --- the charged field: a filled disc, not a diagram --- */
    // A deep, floor-darkening plate (the deep stop) inside the outer ring,
    // lit from within by a slow plasma field (the body stop) and crawled by
    // branching veins of current (ridged noise, the tint stop) that thicken
    // and quicken under overload.
    vec2 q = vUv * uFieldScale;
    float t = uTime * (0.6 + uOverload * 2.4);
    float plasma = fbm3(vec3(q * 0.7, t * 0.35 + uSeed)) * 0.5 + 0.5;
    float vein = 1.0 - abs(snoise(vec3(q * 1.3 + vec2(uSeed), t * 0.9)));
    vein = pow(clamp(vein, 0.0, 1.0), mix(14.0, 6.0, uOverload));
    float plate = 1.0 - smoothstep(0.88, 0.95, r);
    float centre = 1.0 - smoothstep(0.0, 0.9, r);
    float field = plate * uField * (plasma * (0.35 + 0.65 * centre) * (1.0 + uOverload * 1.5));
    float veins = plate * vein * uVeins * (0.5 + uOverload * 1.5);

    float m = keep * reveal;
    vec3 light = uColorBody * field
               + mix(uColor, uColorHot, uOverload * 0.5) * veins
               + mix(uColor, uColorHot, clamp(uOverload * 0.7 + burstEdge, 0.0, 1.0)) * shape * throb
               + uColorHot * burstEdge * 3.0;
    light *= uIntensity * uGlobalGlow * m * uFade;
    // Premultiplied over: the deep plate darkens the floor, the light adds.
    float cover = plate * uFill * m * (0.75 + 0.25 * (1.0 - centre));
    vec3 color = light + uColorDeep * cover * 0.6;
    float alpha = clamp(cover * uOpacity * uFade, 0.0, 1.0);
    if (alpha < 0.003 && dot(light, vec3(1.0)) < 0.003) discard;
    gl_FragColor = vec4(color * uOpacity, alpha);
  }
`;

export function createRelaySigilMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // Premultiplied "over": the plate darkens the floor, the lines add light.
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uReveal: { value: 0 },
      uOverload: { value: 0 },
      uBurst: { value: 0 },
      uFade: { value: 1 },
      uSpin: { value: 0 },
      uSpokes: { value: 6 },
      uLine: { value: 0.03 },
      uIntensity: { value: 1.8 },
      uOpacity: { value: 0.85 },
      uFill: { value: 0.8 },
      uField: { value: 0.8 },
      uFieldScale: { value: 3 },
      uVeins: { value: 1 },
      uSeed: { value: 0 },
      uColor: { value: new Color(0.4, 0.85, 1) },
      uColorHot: { value: new Color(1, 1, 1) },
      uColorBody: { value: new Color(0.18, 0.42, 1) },
      uColorDeep: { value: new Color(0.03, 0.04, 0.12) }
    }),
    vertexShader: SIGIL_VERTEX,
    fragmentShader: SIGIL_FRAGMENT
  });

  /** @param {object} s { reveal, overload, burst, fade, spin, seed } */
  material.userData.sync = (s) => {
    const c = settings.relay;
    const g = settings.global;
    const u = material.uniforms;
    u.uReveal.value = s.reveal;
    u.uOverload.value = s.overload;
    u.uBurst.value = s.burst;
    u.uFade.value = s.fade;
    u.uSpin.value = s.spin;
    u.uSpokes.value = Math.max(3, Math.round(c.sigilSpokes));
    u.uLine.value = c.sigilLine;
    u.uIntensity.value = c.sigilIntensity * g.glow;
    u.uOpacity.value = c.sigilOpacity * g.opacity;
    u.uColor.value.copy(getColor(c.colorSigil));
    u.uColorHot.value.copy(getColor(c.colorSigilHot));
    u.uColorBody.value.copy(getColor(c.colorSigilBody));
    u.uColorDeep.value.copy(getColor(c.colorSigilDeep));
    u.uFill.value = c.sigilFill;
    u.uField.value = c.sigilField * g.shaderIntensity;
    u.uFieldScale.value = c.sigilFieldScale * g.noiseFrequency;
    u.uVeins.value = c.sigilVeins * g.noiseStrength;
    u.uSeed.value = s.seed ?? 0;
  };

  return material;
}

/* ====================================================================== */
/* 4 · The heat warp                                                       */
/* ====================================================================== */

/**
 * Screen-space strain round a relay, on LAYER.DISTORTION.
 *
 * The same contract as the acid fume (`vec4(dir * 0.5 + 0.5, strength,
 * mask)`), but the offset is mostly **radial** — the air round an overloaded
 * node is being pushed out from it — with a fast noise on top so it shivers.
 * The ability drives `strength` up through the overload and spikes it on the
 * discharge.
 */
const WARP_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vUv = position.xy;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    vec3 np = vec3(vUv * uScale, uTime * uSpeed + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(19.3, 7.7, 31.1)));
    vec2 radial = vUv / max(r, 1e-3);
    vec2 offset = normalize(radial * 0.8 + n * 0.6 + 1e-4);

    // A ring of strain, strongest just outside the core, feathered to nothing.
    float mask = smoothstep(0.0, 0.3, r) * (1.0 - smoothstep(0.5, 1.0, r));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

export function createRelayWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 1.4 },
      uStrength: { value: 0 },
      uScale: { value: 2.4 },
      uSpeed: { value: 2.2 },
      uSeed: { value: Math.random() * 10 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { strength, seed } */
  material.userData.sync = (s) => {
    const c = settings.relay;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = c.warpSize;
    u.uStrength.value = s.strength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
    u.uSeed.value = s.seed;
  };

  return material;
}

/* ====================================================================== */
/* 5 · The conductor cage — the hero solid                                 */
/* ====================================================================== */

/**
 * The prongs of a relay cage: lit, shadow-casting blued steel
 * (MeshStandardMaterial, `LAYER.WORLD`) patched so the conductor *heats*.
 *
 * Per instance `aHeat` = (heat, reach, seed, flicker). `reach` (0..1) is how
 * far down from the point the heat has crept; inside it the steel is driven
 * through the four-stop ramp — deep at the cool edge, the saturated body, the
 * pale tint and a white-hot point, which is the only place it goes above 1.
 * The insulator grooves (`aRing`) take the charge first, so a held relay reads
 * as a cage of hot rings before the overload whitens the whole rod. On the
 * discharge the heat spikes and then cools through the same ramp to the deep
 * tone while the prongs topple and sink.
 */
export function createRelayProngMaterial() {
  const material = new MeshStandardMaterial({
    color: 0x1a2036,
    roughness: 0.32,
    metalness: 0.75,
    flatShading: true
  });
  const uniforms = {
    uProngHot: { value: new Color('#ffffff') },
    uProngTint: { value: new Color('#9fe9ff') },
    uProngBody: { value: new Color('#2f6bff') },
    uProngDeep: { value: new Color('#0b1030') },
    uProngGlow: { value: 2.4 },
    uProngGroove: { value: 0.8 },
    uProngTime: frame.uTime
  };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aT;\nattribute float aRing;\nattribute vec4 aHeat;\nvarying float vProngT;\nvarying float vProngRing;\nvarying vec4 vHeat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvProngT = aT;\nvProngRing = aRing;\nvHeat = aHeat;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform vec3 uProngHot;',
        'uniform vec3 uProngTint;',
        'uniform vec3 uProngBody;',
        'uniform vec3 uProngDeep;',
        'uniform float uProngGlow;',
        'uniform float uProngGroove;',
        'uniform float uProngTime;',
        'varying float vProngT;',
        'varying float vProngRing;',
        'varying vec4 vHeat;',
        'vec3 prongRamp(float k) {',
        '  k = clamp(k, 0.0, 1.0);',
        '  if (k < 0.33) return mix(uProngDeep, uProngBody, k / 0.33);',
        '  if (k < 0.75) return mix(uProngBody, uProngTint, (k - 0.33) / 0.42);',
        '  return mix(uProngTint, uProngHot, (k - 0.75) / 0.25);',
        '}'
      ].join('\n'))
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float heat = vHeat.x;
          float reach = clamp(vHeat.y, 0.0, 1.0);
          // How deep into the heated length this point is: 1 at the tip.
          float into = clamp((vProngT - (1.0 - reach)) / max(reach, 1e-3), 0.0, 1.0) * step(1e-3, reach);
          float crackle = 0.75 + 0.25 * sin(uProngTime * 37.0 + vHeat.z * 11.0 + vProngT * 23.0) * vHeat.w;
          float tip = pow(into, 1.6);
          float groove = vProngRing * uProngGroove * smoothstep(0.0, 0.25, heat) * (0.35 + 0.65 * into + 0.25 * reach);
          float k = clamp(heat * (tip * 0.85 + groove * 0.6), 0.0, 1.2);
          // The four-stop ramp; HDR only at the white point.
          vec3 hot = prongRamp(k) * (k * k * 1.6 + k * 0.5);
          totalEmissiveRadiance += hot * uProngGlow * crackle;
        }`);
  };
  material.customProgramCacheKey = () => 'arc-relay-prong';
  /** Read settings into the patch every frame. */
  material.userData.sync = () => {
    const c = settings.relay;
    const g = settings.global;
    material.color.copy(getColor(c.colorProng));
    material.roughness = c.prongRoughness;
    material.metalness = c.prongMetalness;
    uniforms.uProngHot.value.copy(getColor(c.colorProngHot));
    uniforms.uProngTint.value.copy(getColor(c.colorProngTint));
    uniforms.uProngBody.value.copy(getColor(c.colorProngBody));
    uniforms.uProngDeep.value.copy(getColor(c.colorProngDeep));
    uniforms.uProngGlow.value = c.prongGlow * g.glow * g.shaderIntensity;
    uniforms.uProngGroove.value = c.prongGroove;
  };
  return material;
}
