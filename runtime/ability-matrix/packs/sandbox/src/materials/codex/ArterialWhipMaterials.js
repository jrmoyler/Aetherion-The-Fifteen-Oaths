import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Arterial Whip — the bespoke shaders the vessel whip is drawn with.
 *
 *  - **the vessel** — a tube grid bent along the whip's centreline in the
 *    vertex stage. The centreline is a straight run hand → tip plus a high
 *    *overhead* arch and a travelling vertical wave, both scaled by the whip's
 *    slack. It is cracked downward: at the snap the slack goes negative, the
 *    arch inverts, and the floor clamp lays the vessel flat along the line —
 *    the slam. The radius is beaded into segments with pinched joints (an
 *    artery, a string of vertebrae) and swollen by peristaltic pulses that run
 *    hand → tip. Shading is *lit and wet*, not plasma: flesh-dark crimson,
 *    wrapped diffuse off the stage's sun, a hard wet specular, dark joint
 *    grooves, faint capillaries, and blood glowing through the thin wall of
 *    each bead as a pulse passes. It recoils by bleeding away tip-first.
 *  - **the splatter** — a ground strip down the line, revealed hand → tip at
 *    the slam: a smeared central stroke and a spatter of droplets, denser and
 *    smaller near the stroke, larger and flung outward away from it, wet and
 *    glinting; it dries matte and brown and erodes.
 *  - **the wound glow** — a camera-facing bloom at the hand, where the vessel
 *    leaves the caster.
 *  - **the rupture warp** — a flat ring on `LAYER.DISTORTION` thrown out from
 *    the tip at the crack.
 *
 * Every material reads `settings.arterial` in `userData.sync(state)`.
 */

const ID = 'arterial';

/* -------------------------------------------------------------------- */
/* The vessel                                                           */
/* -------------------------------------------------------------------- */

/**
 * `vesselPoint(s)` — the CPU twin is `ArterialWhipAbility#_vesselPoint`;
 * keep them together.
 */
const VESSEL_GLSL = /* glsl */ `
  uniform vec3  uHand;
  uniform vec3  uTip;
  uniform vec3  uSide;
  uniform float uSlack;       // 1 loose (arched up) .. 0 taut .. <0 slammed flat
  uniform float uArch;
  uniform float uWaveAmp;
  uniform float uWaveLen;
  uniform float uWavePhase;
  uniform float uSway;
  uniform float uFloor;       // the vessel lies on the floor, not through it
  uniform float uRootR;
  uniform float uTipR;
  uniform float uTaper;
  uniform float uSegLen;
  uniform float uPinch;
  uniform float uSwell;
  uniform float uPulse;       // integrated pulse phase
  uniform float uPulseSpacing;

  vec3 vesselPoint(float s) {
    vec3 p = mix(uHand, uTip, s);
    float L = distance(uHand, uTip);
    float env = smoothstep(0.0, 0.2, s) * (0.35 + 0.65 * s);
    float ph = 6.2831853 * s * L / max(uWaveLen, 0.1) - uWavePhase;
    float bow = sin(3.14159265 * s) * (1.0 - 0.35 * s);
    p.y += (uArch * bow + uWaveAmp * env * sin(ph)) * uSlack;
    p += uSide * (uSway * env * cos(ph * 0.7)) * abs(uSlack);
    p.y = max(p.y, uFloor);
    return p;
  }

  float pulseAt(float d) {
    return pow(0.5 + 0.5 * sin(6.2831853 * (d / max(uPulseSpacing, 0.1) - uPulse)), 10.0);
  }

  float beadAt(float d) {
    return pow(sin(3.14159265 * fract(d / max(uSegLen, 0.02))), 0.55);
  }

  float vesselR(float s, float L) {
    float d = s * L;
    float r = mix(uRootR, uTipR, pow(clamp(s, 0.0, 1.0), max(uTaper, 0.05)));
    r *= 1.0 - uPinch + uPinch * beadAt(d);
    r *= 1.0 + uSwell * pulseAt(d) * smoothstep(0.0, 0.1, s);
    return r * (1.0 - 0.8 * smoothstep(0.975, 1.0, s));
  }
`;

const VESSEL_VERTEX = /* glsl */ `
  uniform float uSeed;
  uniform float uScale;

  varying float vS;
  varying float vAng;
  varying float vD;
  varying vec3  vNormalW;
  varying vec3  vWorld;

  ${VESSEL_GLSL}

  void main() {
    float s = position.x;
    float ang = position.y * 6.2831853;
    vec3 c = vesselPoint(s);
    vec3 T = vesselPoint(min(s + 0.006, 1.0)) - vesselPoint(max(s - 0.006, 0.0));
    T = normalize(T + vec3(0.0, 0.0, 1e-5));
    vec3 ref = abs(T.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 N1 = normalize(cross(T, ref));
    vec3 B = cross(N1, T);
    vec3 radial = cos(ang) * N1 + sin(ang) * B;
    float L = distance(uHand, uTip);
    float r = vesselR(s, L) * uScale;
    // The slope of the radius tilts the normal: the beads read round.
    float dr = (vesselR(min(s + 0.004, 1.0), L) - vesselR(max(s - 0.004, 0.0), L)) / max(0.008 * L, 1e-4);
    vec3 world = c + radial * r;
    vS = s;
    vAng = ang;
    vD = s * L;
    vNormalW = normalize(radial - T * dr);
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const VESSEL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uSeed;
  uniform float uSegLen;
  uniform float uPulse;
  uniform float uPulseSpacing;
  uniform float uPulseGlow;
  uniform float uBaseGlow;
  uniform float uCapScale;
  uniform float uCapAmount;
  uniform float uWet;
  uniform float uRim;
  uniform float uDissolve;
  uniform float uDissolveEdge;
  uniform float uFlash;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorHot;
  uniform vec3  uColorRim;
  uniform vec3  uColorCap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying float vS;
  varying float vAng;
  varying float vD;
  varying vec3  vNormalW;
  varying vec3  vWorld;

  ${noiseGLSL}

  void main() {
    // Bleeding away from the tip back, with a bright wet edge.
    float dn = snoise(vec3(vD * 2.6, vAng, uSeed * 3.0)) * 0.5 + 0.5;
    float field = (1.0 - vS) * 0.8 + dn * 0.2;
    float thr = uDissolve * 1.1 - 0.05;
    if (uDissolve > 0.0 && field < thr) discard;
    float fray = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, uDissolveEdge, field - thr) : 0.0;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float facing = abs(dot(N, V));
    float diff = max(dot(N, L), 0.0) * 0.7 + 0.3;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 90.0) * uWet;
    float fres = pow(1.0 - facing, 3.0) * uRim;

    float bead = pow(sin(3.14159265 * fract(vD / max(uSegLen, 0.02))), 0.55);
    float groove = pow(1.0 - bead, 4.0);
    float pulse = pow(0.5 + 0.5 * sin(6.2831853 * (vD / max(uPulseSpacing, 0.1) - uPulse)), 10.0);

    // Capillaries on the wall.
    float cap = 1.0 - abs(snoise(vec3(vD * uCapScale, cos(vAng) * 2.0 + uSeed, sin(vAng) * 2.0)));
    cap = pow(cap, 14.0) * uCapAmount;

    vec3 col = mix(uColorDeep, uColorBody, bead * 0.75) * diff;
    col = mix(col, uColorCap, cap * 0.6);
    col *= 1.0 - groove * 0.8;
    // Blood glowing through the thin wall, brightest at the silhouette.
    float through = (uBaseGlow + pulse * uPulseGlow + uFlash * 2.0) * bead * (0.35 + 0.65 * (1.0 - facing)) * uShaderIntensity;
    col += uColorHot * through * uGlobalGlow;
    col += uColorRim * fres * uGlobalGlow + vec3(spec);
    col += uColorHot * fray * 3.0 * uGlobalGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The vessel: opaque wet flesh, bent from parameter space. */
export function createVesselMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHand: { value: new Vector3() },
      uTip: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uSlack: { value: 1 },
      uArch: { value: 2 },
      uWaveAmp: { value: 0.3 },
      uWaveLen: { value: 3 },
      uWavePhase: { value: 0 },
      uSway: { value: 0.2 },
      uFloor: { value: 0.05 },
      uRootR: { value: 0.1 },
      uTipR: { value: 0.03 },
      uTaper: { value: 1 },
      uSegLen: { value: 0.3 },
      uPinch: { value: 0.4 },
      uSwell: { value: 0.5 },
      uPulse: { value: 0 },
      uPulseSpacing: { value: 2.5 },
      uSeed: { value: 0 },
      uScale: { value: 1 },
      uPulseGlow: { value: 3 },
      uBaseGlow: { value: 0.3 },
      uCapScale: { value: 3 },
      uCapAmount: { value: 0.6 },
      uWet: { value: 1.2 },
      uRim: { value: 1 },
      uDissolve: { value: 0 },
      uDissolveEdge: { value: 0.06 },
      uFlash: { value: 0 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorCap: { value: new Color() }
    }),
    vertexShader: VESSEL_VERTEX,
    fragmentShader: VESSEL_FRAGMENT
  });

  /** @param {object} state { hand, tip, side, slack, wavePhase, pulse, seed, dissolve, flash } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHand.value.copy(state.hand);
    u.uTip.value.copy(state.tip);
    u.uSide.value.copy(state.side);
    u.uSlack.value = state.slack;
    u.uArch.value = c.arch;
    u.uWaveAmp.value = c.waveAmp * g.noiseStrength;
    u.uWaveLen.value = c.waveLength;
    u.uWavePhase.value = state.wavePhase;
    u.uSway.value = c.sway * g.randomness;
    u.uFloor.value = Math.max(0.01, c.rootRadius * 0.8);
    u.uRootR.value = Math.max(0.005, c.rootRadius);
    u.uTipR.value = Math.max(0.003, c.tipRadius);
    u.uTaper.value = c.taper;
    u.uSegLen.value = Math.max(0.02, c.segmentLength);
    u.uPinch.value = c.pinch;
    u.uSwell.value = c.pulseSwell;
    u.uPulse.value = state.pulse;
    u.uPulseSpacing.value = c.pulseSpacing;
    u.uSeed.value = state.seed;
    u.uPulseGlow.value = c.pulseGlow * g.glow;
    u.uBaseGlow.value = c.wallGlow * g.glow;
    u.uCapScale.value = c.capillaryScale * g.noiseFrequency;
    u.uCapAmount.value = c.capillaries;
    u.uWet.value = c.wetness;
    u.uRim.value = c.rimGlow * g.fresnel;
    u.uDissolve.value = state.dissolve;
    u.uDissolveEdge.value = c.dissolveEdge;
    u.uFlash.value = state.flash;
    u.uColorDeep.value.copy(getColor(c.colorVesselDeep));
    u.uColorBody.value.copy(getColor(c.colorVesselBody));
    u.uColorHot.value.copy(getColor(c.colorVesselHot));
    u.uColorRim.value.copy(getColor(c.colorVesselRim));
    u.uColorCap.value.copy(getColor(c.colorCapillary));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The splatter                                                         */
/* -------------------------------------------------------------------- */

const SPLATTER_VERTEX = /* glsl */ `
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

const SPLATTER_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uReveal;      // metres of the line splattered so far
  uniform float uStroke;      // half-width of the central smear
  uniform float uSpread;      // metres the spatter reaches either side
  uniform float uDotScale;    // spatter cell size, metres
  uniform float uDensity;
  uniform float uFling;       // how stretched the far drops are
  uniform float uWet;
  uniform float uDry;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform float uSheen;
  uniform vec3  uColorFresh;
  uniform vec3  uColorDark;
  uniform vec3  uColorDry;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  /** Spatter: one drop per cell, kept or not by density, stretched outward. */
  float spatter(vec2 p) {
    vec2 cell = p / uDotScale;
    vec2 ic = floor(cell);
    float best = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 id = ic + vec2(float(i), float(j));
        float h1 = hash13(vec3(id, uSeed));
        float h2 = hash13(vec3(id, uSeed + 7.1));
        float h3 = hash13(vec3(id, uSeed + 3.3));
        vec2 c = (id + vec2(h1, h2)) * uDotScale;
        float side = abs(c.x) / max(uSpread, 0.05);
        float keep = step(h3, uDensity * (1.0 - side * 0.85));
        if (keep < 0.5 || side > 1.0) continue;
        float rad = uDotScale * mix(0.12, 0.42, pow(hash13(vec3(id, uSeed + 9.9)), 2.0)) * (1.0 - side * 0.5);
        vec2 q = p - c;
        // Flung outward: stretched across the line, more the further out.
        float st = 1.0 + uFling * side;
        q.x /= st;
        float d = length(q) / rad;
        best = max(best, 1.0 - smoothstep(0.75, 1.0, d));
      }
    }
    return best;
  }

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;
    if (along < 0.0 || along > uReveal) discard;

    float wig = snoise(vec3(along * 0.4, uSeed, 0.0)) * uStroke * 0.8;
    float w = uStroke * (0.55 + 0.45 * snoise(vec3(along * 1.3, uSeed + 2.0, 0.0)));
    float stroke = 1.0 - smoothstep(w * 0.55, w, abs(x - wig));
    // the smear breaks up where the vessel's joints struck
    stroke *= 0.7 + 0.3 * smoothstep(-0.3, 0.4, snoise(vec3(along * 3.0, x * 4.0, uSeed)));
    float dots = spatter(vFlat);
    float m = max(stroke, dots);
    m *= smoothstep(0.0, 0.5, along) * (1.0 - smoothstep(uReveal - 0.3, uReveal, along) * 0.0);

    // wet sheen
    float g = snoise(vec3(vFlat * 6.0, uSeed));
    vec3 V = normalize(cameraPosition);
    float spec = pow(max(g, 0.0), 6.0) * uWet * (1.0 - uDry);
    vec3 col = mix(uColorDark, uColorFresh, stroke * 0.5 + dots * 0.3);
    col += uColorFresh * uSheen * (1.0 - uDry) * uGlobalGlow * stroke * 0.4;
    col += vec3(spec * 0.6);
    col = mix(col, uColorDry, uDry);

    float n = snoise(vec3(vFlat * 1.8, uSeed * 4.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, n);
    float a = m * vis * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The splatter down the line. Normal blending — it has to be dark. */
export function createSplatterMaterial() {
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
      uReveal: { value: 0 },
      uStroke: { value: 0.2 },
      uSpread: { value: 1.5 },
      uDotScale: { value: 0.3 },
      uDensity: { value: 0.6 },
      uFling: { value: 2 },
      uWet: { value: 1 },
      uDry: { value: 0 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uSheen: { value: 0.5 },
      uColorFresh: { value: new Color() },
      uColorDark: { value: new Color() },
      uColorDry: { value: new Color() }
    }),
    vertexShader: SPLATTER_VERTEX,
    fragmentShader: SPLATTER_FRAGMENT
  });

  /** @param {object} state { start, dir, side, length, reveal, dry, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uHalfWidth.value = Math.max(c.spatterSpread, c.strokeWidth) + 0.3;
    u.uSeed.value = state.seed;
    u.uReveal.value = state.reveal;
    u.uStroke.value = Math.max(0.01, c.strokeWidth);
    u.uSpread.value = Math.max(0.05, c.spatterSpread);
    u.uDotScale.value = Math.max(0.03, c.spatterScale);
    u.uDensity.value = c.spatterDensity * g.randomness;
    u.uFling.value = c.spatterFling;
    u.uWet.value = c.splatterGloss;
    u.uDry.value = state.dry;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = c.splatterOpacity * g.opacity;
    u.uSheen.value = c.splatterSheen;
    u.uColorFresh.value.copy(getColor(c.colorSplatterFresh));
    u.uColorDark.value.copy(getColor(c.colorSplatterDark));
    u.uColorDry.value.copy(getColor(c.colorSplatterDry));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The wound glow                                                       */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
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

const WOUND_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uBeat;
  uniform vec3  uColorCore;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0 || uIntensity <= 0.001) discard;
    float a = atan(vUv.y, vUv.x);
    float core = exp(-r * r * 30.0);
    float rag = 0.7 + 0.3 * snoise(vec3(cos(a) * 3.0, sin(a) * 3.0, uTime * 2.0 + uSeed));
    float halo = exp(-r * (4.0 - uBeat * 1.5) / rag) * (1.0 - smoothstep(0.7, 1.0, r));
    vec3 col = uColorHalo * halo + uColorCore * core * 2.0;
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, clamp(halo + core, 0.0, 1.0));
  }
`;

/** A ragged bloom where the vessel leaves the hand. */
export function createWoundGlowMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 0.5 },
      uSeed: { value: 0 },
      uIntensity: { value: 0 },
      uBeat: { value: 0 },
      uColorCore: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: WOUND_FRAGMENT
  });

  /** @param {object} state { center, size, intensity, beat, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.01, state.size);
    u.uIntensity.value = state.intensity * c.woundGlow * g.glow;
    u.uBeat.value = state.beat;
    u.uSeed.value = state.seed;
    u.uColorCore.value.copy(getColor(c.colorWoundCore));
    u.uColorHalo.value.copy(getColor(c.colorWoundHalo));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The rupture warp — LAYER.DISTORTION                                  */
/* -------------------------------------------------------------------- */

const FLAT_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RUPTURE_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float R = 0.06 + 0.9 * uProgress;
    float d = (r - R) / 0.1;
    float slope = -d * exp(-d * d);
    vec2 dir = vUv / max(r, 1e-4);
    float mask = exp(-d * d) * (1.0 - uProgress);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * clamp(slope * 2.0, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** The crack's bend in the air, flat over the floor at the tip. */
export function createRuptureWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 3 },
      uProgress: { value: 0 },
      uStrength: { value: 1 }
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: RUPTURE_FRAGMENT
  });

  /** @param {object} state { center, progress } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.2, c.ruptureSize * g.explosionIntensity);
    u.uProgress.value = state.progress;
    u.uStrength.value = c.ruptureWarp * g.distortion;
  };

  return material;
}
