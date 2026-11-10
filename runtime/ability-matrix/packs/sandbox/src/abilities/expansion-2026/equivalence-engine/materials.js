import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Equivalence Engine — the bespoke shaders.
 *
 *  - **mass shell** — the counterweights. Opaque and *lit* (key light from
 *    the shared sun direction, sky/ground ambient, a glossy lobe), so they
 *    read as cast iron-stone on `LAYER.WORLD` and cast shadows. Ridged noise
 *    cuts seams into the shell that run white-hot as the weight gains mass
 *    and go cold as it loses it — the inverse link made visible on the
 *    silhouette itself. A slam flashes the seams; the exit dissolves them.
 *  - **mass stream** — an additive sheath pushed out along the beam's
 *    normals; pulses run toward whichever end is gaining, brighter the
 *    faster the mass pours.
 *  - **potential field** — the floor: the equipotential contours of the two
 *    masses (φ = mA/|p−a| + mB/|p−b|), so the lines bunch round the heavy
 *    weight and open round the light one, and swap as the mass swaps. A
 *    slam runs a shock front out from its strike point; the exit dissolves.
 *  - **the well** — normal-blended: darkens the floor into a basin under the
 *    heavy weight (the deep tone that grounds the cast).
 *  - **mass grains** — GPU points. Each grain owns a fixed share of the one
 *    unit of mass; grains whose share is below mA orbit A, the rest orbit B,
 *    and the grains whose share the pour is crossing ride an arch over the
 *    beam from one weight to the other.
 *  - **the lens** — `LAYER.DISTORTION`: a gravitational pinch round the
 *    heavy weight and a pressure ring on each slam.
 *
 * Every material reads `settings.equivalenceEngine` in `userData.sync(state)`.
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

const ramp = () => ({
  uColorA: { value: new Color() },
  uColorB: { value: new Color() },
  uColorC: { value: new Color() },
  uColorD: { value: new Color() },
});
const syncRamp = (u, c) => {
  u.uColorA.value.copy(getColor(c.colorA));
  u.uColorB.value.copy(getColor(c.colorB));
  u.uColorC.value.copy(getColor(c.colorC));
  u.uColorD.value.copy(getColor(c.colorD));
};
const RAMP_GLSL = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uColorD;
  // 0 = deep, 1 = white-hot.
  vec3 massRamp(float t) { return gradient4(uColorD, uColorC, uColorB, uColorA, t); }
`;

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/* -------------------------------------------------------------------- */
/* Mass shell — the counterweights (lit, opaque)                         */
/* -------------------------------------------------------------------- */

const SHELL_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHELL_FRAGMENT = /* glsl */ `
  uniform float uMass;        // 0..1 share of the engine's one unit of mass
  uniform float uHeat;        // slam flash 0..1
  uniform float uDissolve;    // 0..1 exit
  uniform float uSeamGlow;
  uniform float uSeamScale;
  uniform float uRimGlow;
  uniform float uGloss;
  uniform float uFresnel;
  uniform float uNoise;
  uniform float uClock;
  uniform vec3  uStone;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(uLightDir);
    // Seams: ridged noise on the shell, flowing slowly downward (mass sinking).
    vec3 q = vLocal * uSeamScale + vec3(0.0, uClock * 0.25, 0.0);
    float seam = ridged(q * (0.8 + 0.4 * uNoise), 4);
    float crack = smoothstep(0.78 - 0.1 * uMass, 0.92, seam);
    float grain = fbm3(vLocal * 9.0) * 0.5;
    vec2 dm = dissolveMask(snoise01(vLocal * 3.1 + 4.0), uDissolve, 0.08);
    if (dm.x < 0.5) discard;

    // Lit stone: key light, sky / ground ambient, a glossy lobe.
    float diff = max(dot(N, L), 0.0);
    float hemi = 0.5 + 0.5 * N.y;
    vec3 albedo = uStone * (0.75 + 0.5 * grain);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 48.0) * uGloss;
    vec3 col = albedo * (diff * 1.6 + mix(0.18, 0.42, hemi)) + vec3(spec) * mix(vec3(1.0), uColorB, 0.4);

    // Heavier = hotter: the seams climb the ramp with the mass.
    float heat = clamp(uMass * 0.85 + uHeat * 0.6, 0.0, 1.0);
    vec3 seamCol = massRamp(heat) * crack * uSeamGlow * (0.15 + 1.1 * uMass + uHeat) * uShaderIntensity;
    float rim = fresnelTerm(V, N, 3.0, uFresnel);
    vec3 rimCol = mix(uColorC, uColorB, uMass) * rim * uRimGlow * (0.35 + 0.65 * uMass);
    col += (seamCol + rimCol + uColorA * dm.y * 4.0) * uGlobalGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Counterweight shell: one instance per weight (each has its own mass). */
export function createShellMaterial() {
  const material = new ShaderMaterial({
    side: FrontSide,
    uniforms: sharedUniforms({
      uMass: { value: 0.5 },
      uHeat: { value: 0 },
      uDissolve: { value: 0 },
      uSeamGlow: { value: 2.4 },
      uSeamScale: { value: 2.6 },
      uRimGlow: { value: 1.3 },
      uGloss: { value: 0.55 },
      uFresnel: { value: 1 },
      uNoise: { value: 1 },
      uClock: { value: 0 },
      uStone: { value: new Color() },
      ...ramp(),
    }),
    vertexShader: SHELL_VERTEX,
    fragmentShader: SHELL_FRAGMENT,
  });
  /** @param {object} s { mass, heat, dissolve, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uMass.value = s.mass;
    u.uHeat.value = s.heat;
    u.uDissolve.value = s.dissolve;
    u.uClock.value = s.clock;
    u.uSeamGlow.value = c.seamGlow * g.glow;
    u.uSeamScale.value = c.seamScale * g.noiseFrequency;
    u.uRimGlow.value = c.rimGlow;
    u.uGloss.value = c.weightGloss;
    u.uFresnel.value = g.fresnel;
    u.uNoise.value = g.noiseStrength;
    u.uStone.value.copy(getColor(c.stoneColor));
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Mass stream — the flow sheath on the beam                             */
/* -------------------------------------------------------------------- */

const STREAM_VERTEX = /* glsl */ `
  uniform float uWidth;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec3 p = position + normal * uWidth;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const STREAM_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFlow;        // signed pour rate: + toward A (x−), − toward B (x+)
  uniform float uImbalance;   // mA − mB
  uniform float uFade;
  uniform float uGlow;
  uniform float uFresnel;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    // x: −1 at A's end, +1 at B's end.
    float x = vUv.x * 2.0 - 1.0;
    float dir = uFlow >= 0.0 ? -1.0 : 1.0;
    float rate = clamp(abs(uFlow), 0.0, 1.0);
    float pulses = pow(fract(x * 3.0 * dir - uClock), 6.0);
    float n = snoise(vec3(x * 6.0 - uClock * dir, vUv.y * 6.2831, uClock * 0.3)) * 0.5 + 0.5;
    // The heavy end of the beam glows with the mass it carries.
    float heavyEnd = smoothstep(0.2, 1.0, -x * uImbalance);
    float rim = fresnelTerm(vViewDir, vNormalW, 2.0, uFresnel);
    float a = (pulses * (0.25 + 1.4 * rate) * (0.6 + 0.6 * n) + heavyEnd * 0.35 + rim * 0.25) * uFade;
    if (a < 0.003) discard;
    vec3 col = massRamp(clamp(0.35 + pulses * 0.6 * (0.4 + rate) + heavyEnd * 0.3, 0.0, 1.0));
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The flow sheath riding the beam (shares the beam's geometry). */
export function createStreamMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uWidth: { value: 0.1 },
      uClock: { value: 0 },
      uFlow: { value: 0 },
      uImbalance: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.8 },
      uFresnel: { value: 1 },
      ...ramp(),
    }),
    vertexShader: STREAM_VERTEX,
    fragmentShader: STREAM_FRAGMENT,
  });
  /** @param {object} s { clock, flow, imbalance, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = c.beamThickness * 0.5 * Math.max(0, c.streamWidth - 1);
    u.uClock.value = s.clock * c.streamSpeed;
    u.uFlow.value = s.flow;
    u.uImbalance.value = s.imbalance;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.streamGlow * g.glow;
    u.uFresnel.value = g.fresnel;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Potential field — the floor                                           */
/* -------------------------------------------------------------------- */

const POTENTIAL_GLSL = /* glsl */ `
  uniform vec2  uA;           // weight positions in field space (−1..1 = zone)
  uniform vec2  uB;
  uniform float uMassA;
  uniform float uMassB;
  float potential(vec2 p) {
    return uMassA / sqrt(dot(p - uA, p - uA) + 0.012) + uMassB / sqrt(dot(p - uB, p - uB) + 0.012);
  }
`;

const FIELD_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uCount;
  uniform float uWidth;
  uniform float uNoise;
  uniform float uScale;
  uniform float uEnergy;
  uniform float uFade;
  uniform float uDissolve;
  uniform vec3  uSlam;        // xy strike point, z progress 0..1 (−1 = none)
  uniform float uGlow;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  ${POTENTIAL_GLSL}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float wob = fbm3(vec3(p * 2.2 * uScale, uClock * 0.2)) * 0.35 * uNoise;
    float phi = potential(p) + wob;
    // Equipotential lines: log-spaced so they read evenly from rim to weight.
    float lv = log(max(phi, 1e-3)) * uCount * 0.9 - uClock * 0.6;
    float fw = fwidth(lv);
    float line = 1.0 - smoothstep(0.0, max(fw * 1.5, uWidth * 4.0), abs(fract(lv) - 0.5) * 2.0 - (1.0 - uWidth * 4.0));
    line = clamp(line, 0.0, 1.0);
    // Heat near the masses, the circle's own rim, a faint axis between them.
    float heat = clamp((phi - 1.2) * 0.35, 0.0, 1.0);
    float rim = exp(-abs(r - 0.965) * 60.0);
    vec2 ab = uB - uA;
    float t = clamp(dot(p - uA, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    float axis = exp(-length(p - uA - ab * t) * 60.0) * 0.4;
    float shock = 0.0;
    if (uSlam.z >= 0.0) {
      float d = length(p - uSlam.xy);
      float front = uSlam.z * 1.1;
      shock = exp(-abs(d - front) * 22.0) * (1.0 - uSlam.z) * 2.2;
    }
    vec2 dm = dissolveMask(snoise01(vec3(p * 3.0, 1.7)), uDissolve, 0.08);
    float inside = 1.0 - smoothstep(0.93, 1.0, r);
    float a = ((line * (0.18 + 0.75 * heat) * inside + rim * 0.8 + axis) * uEnergy * uShaderIntensity + shock) * dm.x * uFade;
    a += dm.y * 0.8 * uFade;
    if (a < 0.003) discard;
    vec3 col = massRamp(clamp(0.18 + heat * 0.62 + shock * 0.35 + rim * 0.15, 0.0, 1.0));
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

const fieldUniforms = () => ({
  uA: { value: new Vector2(-0.6, 0) },
  uB: { value: new Vector2(0.6, 0) },
  uMassA: { value: 0.5 },
  uMassB: { value: 0.5 },
});
const syncField = (u, s) => {
  u.uA.value.set(s.ax, s.az);
  u.uB.value.set(s.bx, s.bz);
  u.uMassA.value = s.massA;
  u.uMassB.value = 1 - s.massA;
};

/** The equipotential floor. Additive. */
export function createFieldMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      ...fieldUniforms(),
      uClock: { value: 0 },
      uCount: { value: 7 },
      uWidth: { value: 0.07 },
      uNoise: { value: 1 },
      uScale: { value: 1 },
      uEnergy: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uSlam: { value: new Vector3(0, 0, -1) },
      uGlow: { value: 1.6 },
      ...ramp(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FIELD_FRAGMENT,
  });
  /** @param {object} s { ax, az, bx, bz, massA, clock, energy, fade, dissolve, slamX, slamZ, slam } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncField(u, s);
    u.uClock.value = s.clock;
    u.uCount.value = c.contourCount;
    u.uWidth.value = c.contourWidth;
    u.uNoise.value = c.fieldNoise * g.noiseStrength;
    u.uScale.value = g.noiseFrequency;
    u.uEnergy.value = s.energy;
    u.uFade.value = s.fade * g.opacity;
    u.uDissolve.value = s.dissolve;
    u.uSlam.value.x = s.slamX;
    u.uSlam.value.y = s.slamZ;
    u.uSlam.value.z = s.slam;
    u.uGlow.value = c.fieldGlow * g.glow;
    syncRamp(u, c);
  };
  return material;
}

const WELL_FRAGMENT = /* glsl */ `
  uniform float uDepth;
  uniform float uFade;
  uniform float uDissolve;
  varying vec2 vUv;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}
  ${POTENTIAL_GLSL}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float phi = potential(p);
    float basin = clamp((phi - 0.9) * 0.28, 0.0, 1.0);
    float edge = 1.0 - smoothstep(0.7, 1.0, r);
    vec2 dm = dissolveMask(snoise01(vec3(p * 3.0, 1.7)), uDissolve, 0.08);
    float a = (0.35 * edge + 0.65 * basin) * uDepth * dm.x * uFade;
    if (a < 0.003) discard;
    // Body at the outer slope, deep in the basin: the floor sags into violet-black.
    vec3 col = mix(uColorC * 0.12, uColorD * 0.2, basin);
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
  }
`;

/** The dark basin under the heavy weight. Normal-blended. */
export function createWellMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...fieldUniforms(),
      uDepth: { value: 0.85 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      ...ramp(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: WELL_FRAGMENT,
  });
  /** @param {object} s same state as the field */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncField(u, s);
    u.uDepth.value = c.wellDepth * s.energy;
    u.uFade.value = s.fade * g.opacity;
    u.uDissolve.value = s.dissolve;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Mass grains                                                           */
/* -------------------------------------------------------------------- */

const MOTE_VERTEX = /* glsl */ `
  attribute vec4 aSeed;       // (angle, band, phase, share)
  uniform vec3  uA;           // weight centres (local to the engine root)
  uniform vec3  uB;
  uniform float uMassA;
  uniform float uOrbitA;
  uniform float uOrbitB;
  uniform float uArc;
  uniform float uClock;
  uniform float uSize;
  uniform float uFade;
  uniform float uCount;
  uniform vec2  uResolution;
  varying float vAlpha;
  varying float vHeat;
  vec3 orbitAround(vec3 c, float radius, float ang, float tilt) {
    return c + vec3(cos(ang) * radius, sin(ang * 2.0 + tilt) * radius * 0.35, sin(ang) * radius);
  }
  void main() {
    if (aSeed.z >= uCount) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      vHeat = 0.0;
      return;
    }
    float ang = aSeed.x * 6.2831853 + uClock * (0.6 + aSeed.y);
    float band = mix(0.75, 1.25, aSeed.y);
    vec3 onA = orbitAround(uA, uOrbitA * band, ang, aSeed.z * 6.0);
    vec3 onB = orbitAround(uB, uOrbitB * band, -ang, aSeed.z * 6.0);
    // Inverse link: share < mA → A. The grains near the boundary are in transit.
    float transit = smoothstep(uMassA - 0.12, uMassA + 0.12, aSeed.w); // 0 = on A, 1 = on B
    vec3 p = mix(onA, onB, transit);
    p.y += sin(transit * 3.14159265) * uArc;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float moving = sin(transit * 3.14159265);
    vAlpha = uFade * (0.55 + 0.45 * moving);
    vHeat = moving;
    gl_PointSize = uSize * (1.0 + moving) * uResolution.y * projectionMatrix[1][1] * 0.5 / max(0.1, -mv.z);
  }
`;

const MOTE_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uGlobalGlow;
  varying float vAlpha;
  varying float vHeat;
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    float soft = exp(-d * 3.0);
    gl_FragColor = vec4(massRamp(0.45 + 0.55 * vHeat) * uGlow * uGlobalGlow, soft * vAlpha);
  }
`;

/** GPU mass grains orbiting and crossing between the weights. */
export function createMoteMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uA: { value: new Vector3() },
      uB: { value: new Vector3() },
      uMassA: { value: 0.5 },
      uOrbitA: { value: 1 },
      uOrbitB: { value: 1 },
      uArc: { value: 1 },
      uClock: { value: 0 },
      uSize: { value: 0.07 },
      uFade: { value: 1 },
      uCount: { value: 1 },
      uGlow: { value: 2 },
      ...ramp(),
    }),
    vertexShader: MOTE_VERTEX,
    fragmentShader: MOTE_FRAGMENT,
  });
  /** @param {object} s { a: Vector3, b: Vector3, massA, orbitA, orbitB, clock, fade, capacity } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uA.value.copy(s.a);
    u.uB.value.copy(s.b);
    u.uMassA.value = s.massA;
    u.uOrbitA.value = s.orbitA;
    u.uOrbitB.value = s.orbitB;
    u.uArc.value = c.moteArc;
    u.uClock.value = s.clock * c.moteSpin;
    u.uSize.value = c.moteSize * g.particleSize;
    u.uFade.value = s.fade * g.opacity;
    u.uCount.value = Math.min(1, (c.moteCount * g.particleCount) / s.capacity);
    u.uGlow.value = c.moteGlow * g.glow;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens                                                              */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform vec2  uHeavy;       // heavy weight in lens space (−1..1)
  uniform float uPinch;
  uniform float uShock;
  uniform float uWave;
  uniform vec2  uSlam;
  uniform float uClock;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    vec2 toH = uHeavy - q;
    float dh = length(toH);
    vec2 pull = toH / max(dh, 1e-3);
    float pinch = exp(-dh * dh * 6.0) * uPinch;
    vec2 fromS = q - uSlam;
    float ds = length(fromS);
    float ring = exp(-pow((ds - uWave) / 0.12, 2.0)) * uShock;
    vec3 np = vec3(q * 2.0 * uScale, uClock * 0.3);
    vec2 n = vec2(snoise(np), snoise(np + vec3(4.1, 2.7, 9.3))) * 0.25;
    vec2 dir = (pull + n) * pinch + (fromS / max(ds, 1e-3) + n) * ring;
    float mask = 1.0 - smoothstep(0.8, 1.0, length(q));
    float strength = uShaderIntensity * mask * clamp(pinch + ring, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** `LAYER.DISTORTION` disc (opaque on purpose, like Borrowed Tomorrow's lens). */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHeavy: { value: new Vector2() },
      uPinch: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uSlam: { value: new Vector2() },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { hx, hz, pinch, shock, wave, slamX, slamZ, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHeavy.value.set(s.hx, s.hz);
    u.uPinch.value = s.pinch * c.lensStrength * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uSlam.value.set(s.slamX, s.slamZ);
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
