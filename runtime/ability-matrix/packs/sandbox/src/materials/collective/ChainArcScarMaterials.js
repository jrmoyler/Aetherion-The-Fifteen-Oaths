import { Color, DoubleSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * What the Chain Arc leaves behind: the fulgurite glass and the Lichtenberg
 * scorch under it. Both are coloured from the bolt's own four-stop ramp —
 * `colorCore` (white-hot) → `colorGlow` (pale blue) → `colorEdge` (violet) →
 * the new dark deep stops (`colorGlassDeep`, `colorScarChar`) — so the strike
 * and its scar read as one material cooling.
 */

/* ==================================================================== */
/* Fulgurite — opaque, sun-lit fused glass with charge in its cracks      */
/* ==================================================================== */

const GLASS_VERTEX = /* glsl */ `
  attribute float aTip;
  varying float vTip;
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;

  void main() {
    vTip = aTip;
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const GLASS_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uHeat;        // 1 the instant it is struck, cools toward the floor
  uniform float uCharge;      // 0..1 residual charge crawling up the spikes
  uniform float uPulseSpeed;
  uniform float uVeins;
  uniform float uVeinScale;
  uniform float uGlow;
  uniform float uSpec;
  uniform float uDissolve;    // 0..1 — crumbles on the way out
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorEdge;
  uniform vec3  uColorGlow;
  uniform vec3  uColorCore;
  uniform vec3  uLightDir;
  uniform float uShaderIntensity;
  uniform float uGlobalGlow;

  varying float vTip;
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;

  ${noiseGLSL}

  /** The bolt's ramp, hot → cold. */
  vec3 ramp(float h) {
    h = clamp(h, 0.0, 1.0);
    vec3 c = mix(uColorDeep, uColorEdge, smoothstep(0.0, 0.35, h));
    c = mix(c, uColorGlow, smoothstep(0.3, 0.7, h));
    return mix(c, uColorCore, smoothstep(0.7, 1.0, h));
  }

  void main() {
    float n0 = snoise(vLocal * 7.0 + uSeed);
    if (uDissolve > 0.0 && n0 * 0.5 + 0.5 < uDissolve * 1.15 - vTip * 0.15) discard;

    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 H = normalize(L + V);

    // Dark glass: deep at the root, the body tone toward the points, mottled.
    vec3 albedo = mix(uColorDeep, uColorBody, clamp(vTip * 0.9 + n0 * 0.25, 0.0, 1.0));
    float lambert = max(dot(N, L), 0.0);
    float hemi = 0.5 + 0.5 * N.y;
    vec3 color = albedo * (0.22 + 0.25 * hemi + 0.9 * lambert);
    // Glassy: a hard sun glint and a cold rim.
    color += vec3(pow(max(dot(N, H), 0.0), 70.0)) * uSpec * (0.4 + lambert);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    color += uColorEdge * fres * 0.35;

    /* --- charge in the cracks --- */
    float r = 1.0 - abs(snoise(vLocal * uVeinScale + vec3(uSeed, 0.0, uSeed * 0.7)));
    float crack = smoothstep(0.9, 0.985, r) * uVeins;
    // A band of residual charge crawling up the spikes, again and again.
    float band = fract(vTip * 1.6 - uTime * uPulseSpeed + uSeed);
    float pulse = exp(-(band - 0.5) * (band - 0.5) * 49.0) * uCharge;
    // The points hold the charge longest.
    float tipGlow = smoothstep(0.88, 1.0, vTip) * (0.35 + 0.65 * uHeat);
    float heat = uHeat * (0.55 + 0.45 * vTip);
    float e = crack * (heat * 1.8 + pulse * 1.6) + pulse * 0.12 * vTip + tipGlow * (0.6 + pulse);
    color += ramp(heat * 0.7 + pulse * 0.55 + tipGlow * 0.3) * e * uGlow * uGlobalGlow * uShaderIntensity;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** One fulgurite's glass. Each slot owns one so its heat is its own. */
export function createChainFulguriteMaterial() {
  const material = new ShaderMaterial({
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: Math.random() * 10 },
      uHeat: { value: 1 },
      uCharge: { value: 1 },
      uPulseSpeed: { value: 1.2 },
      uVeins: { value: 1 },
      uVeinScale: { value: 5 },
      uGlow: { value: 2 },
      uSpec: { value: 0.8 },
      uDissolve: { value: 0 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorCore: { value: new Color() }
    }),
    vertexShader: GLASS_VERTEX,
    fragmentShader: GLASS_FRAGMENT
  });

  /** @param {object} s { seed, heat, charge, dissolve } — the slot's envelope */
  material.userData.sync = (s) => {
    const c = settings.chain;
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = s.seed;
    u.uHeat.value = s.heat;
    u.uCharge.value = s.charge;
    u.uDissolve.value = s.dissolve;
    u.uPulseSpeed.value = c.fulguritePulseSpeed * g.noiseSpeed;
    u.uVeins.value = c.fulguriteVeins;
    u.uVeinScale.value = c.fulguriteVeinScale * g.noiseFrequency;
    u.uGlow.value = c.fulguriteGlow * g.glow;
    u.uSpec.value = c.fulguriteSpec;
    u.uColorDeep.value.copy(getColor(c.colorGlassDeep));
    u.uColorBody.value.copy(getColor(c.colorGlassBody));
    u.uColorEdge.value.copy(getColor(c.colorEdge));
    u.uColorGlow.value.copy(getColor(c.colorGlow));
    u.uColorCore.value.copy(getColor(c.colorCore));
  };
  return material;
}

/* ==================================================================== */
/* Lichtenberg scorch — a charred disc with branching burnt veins          */
/* ==================================================================== */

const SCAR_VERTEX = /* glsl */ `
  uniform float uQuadSize;
  varying vec2 vLocal;
  void main() {
    vLocal = (uv - 0.5) * uQuadSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SCAR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;      // metres
  uniform float uReveal;      // 0..1 — how far the figure has burnt out
  uniform float uHeat;        // 1 hot → cools
  uniform float uCharge;      // residual charge pulses running out the veins
  uniform float uPulseSpeed;
  uniform float uFade;
  uniform float uCharOpacity;
  uniform float uVeinScale;
  uniform float uVeinSharp;
  uniform float uGlow;
  uniform vec3  uColorChar;
  uniform vec3  uColorDeep;
  uniform vec3  uColorEdge;
  uniform vec3  uColorGlow;
  uniform vec3  uColorCore;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vLocal;

  ${noiseGLSL}

  vec3 ramp(float h) {
    h = clamp(h, 0.0, 1.0);
    vec3 c = mix(uColorDeep, uColorEdge, smoothstep(0.0, 0.35, h));
    c = mix(c, uColorGlow, smoothstep(0.3, 0.7, h));
    return mix(c, uColorCore, smoothstep(0.7, 1.0, h));
  }

  /** Dendritic, radial filaments: ridged noise in log-polar space, warped. */
  float lichtenberg(vec2 p, float r) {
    vec2 w = p + 0.35 * vec2(snoise(vec3(p * 1.4, uSeed)), snoise(vec3(p * 1.4 + 7.3, uSeed)));
    float a = atan(w.y, w.x);
    float lr = log(max(length(w), 0.05));
    float sum = 0.0;
    float amp = 1.0;
    float freq = 1.0;
    for (int i = 0; i < 4; i++) {
      vec3 q = vec3(cos(a) * freq * uVeinScale * 0.5, sin(a) * freq * uVeinScale * 0.5, lr * 1.6 * freq + uSeed + float(i) * 3.1);
      float ridge = 1.0 - abs(snoise(q));
      sum += pow(ridge, uVeinSharp) * amp;
      amp *= 0.55;
      freq *= 2.05;
    }
    // Trunks near the centre are thick; the tips thin out.
    return sum * (1.15 - 0.6 * r);
  }

  void main() {
    float d = length(vLocal);
    float r = d / max(uRadius, 0.01);
    if (r > 1.2) discard;
    float edgeN = snoise(vec3(vLocal * 1.7, uSeed * 2.0)) * 0.14;

    // The char: dark, densest at the strike, frayed at the edge.
    float charMask = 1.0 - smoothstep(0.45, 1.0, r + edgeN);
    charMask *= smoothstep(0.0, 0.25, uReveal);

    // The figure burns outward with the reveal.
    float within = 1.0 - smoothstep(uReveal - 0.12, uReveal + 0.02, r + edgeN * 0.5);
    float vein = smoothstep(0.4, 0.8, lichtenberg(vLocal / max(uRadius, 0.01) * 2.0, r)) * within;

    // Charge running out along the veins, ring after ring.
    float band = fract(r * 1.3 - uTime * uPulseSpeed + uSeed);
    float pulse = exp(-(band - 0.5) * (band - 0.5) * 36.0) * uCharge;
    float heat = uHeat * (1.0 - r * 0.55);
    float front = exp(-(r - uReveal) * (r - uReveal) * 81.0) * step(uReveal, 1.02) * uHeat;

    float hot = clamp(heat + pulse * 0.6 + front, 0.0, 1.0);
    float emit = vein * (0.25 + heat * 1.6 + pulse * 1.3 + front * 2.0);
    vec3 color = mix(uColorChar, ramp(hot * 0.95), clamp(vein * (0.35 + hot), 0.0, 1.0));
    color += ramp(hot) * emit * uGlow * uGlobalGlow * uShaderIntensity * 0.6;

    float alpha = max(charMask * uCharOpacity, clamp(vein * (0.6 + hot), 0.0, 1.0)) * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

/** One Lichtenberg scorch. Each slot owns one. */
export function createChainScarMaterial() {
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
      uSeed: { value: Math.random() * 10 },
      uQuadSize: { value: 4 },
      uRadius: { value: 1.8 },
      uReveal: { value: 0 },
      uHeat: { value: 1 },
      uCharge: { value: 1 },
      uPulseSpeed: { value: 0.8 },
      uFade: { value: 1 },
      uCharOpacity: { value: 0.85 },
      uVeinScale: { value: 7 },
      uVeinSharp: { value: 6 },
      uGlow: { value: 2 },
      uColorChar: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorCore: { value: new Color() }
    }),
    vertexShader: SCAR_VERTEX,
    fragmentShader: SCAR_FRAGMENT
  });

  /** @param {object} s { seed, radius, reveal, heat, charge, fade } */
  material.userData.sync = (s) => {
    const c = settings.chain;
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = s.seed;
    u.uRadius.value = s.radius;
    u.uQuadSize.value = s.radius * 2.5;
    u.uReveal.value = s.reveal;
    u.uHeat.value = s.heat;
    u.uCharge.value = s.charge;
    u.uFade.value = s.fade;
    u.uPulseSpeed.value = c.scarPulseSpeed * g.noiseSpeed;
    u.uCharOpacity.value = c.scarOpacity * g.opacity;
    u.uVeinScale.value = c.scarVeinScale * g.noiseFrequency;
    u.uVeinSharp.value = c.scarVeinSharp;
    u.uGlow.value = c.scarGlow * g.glow;
    u.uColorChar.value.copy(getColor(c.colorScarChar));
    u.uColorDeep.value.copy(getColor(c.colorGlassDeep));
    u.uColorEdge.value.copy(getColor(c.colorEdge));
    u.uColorGlow.value.copy(getColor(c.colorGlow));
    u.uColorCore.value.copy(getColor(c.colorCore));
  };
  return material;
}
