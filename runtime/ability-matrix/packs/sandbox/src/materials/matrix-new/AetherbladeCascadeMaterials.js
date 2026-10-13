import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Aetherblade Cascade — the two bespoke shaders the cascade is drawn with.
 *
 *  - **the spectral sword** — instanced, additive, double-sided glass. Five
 *    terms, each a slider:
 *      1. a *fresnel shell*: almost nothing head-on, bright at the silhouette,
 *         so the sword reads as a hollow of light rather than a solid;
 *      2. a sharp *sky reflection* (`frame.uEnvMap` along the reflected ray) on
 *         every flat facet — the facets of the diamond blade catch different
 *         pieces of sky, which is what makes it glass;
 *      3. *rune-light* inside: a channel down the middle of each blade face
 *         filled with procedural glyphs (line-segment SDFs picked per cell by a
 *         hash), with a pulse running from the guard to the point;
 *      4. glowing *cutting edges*;
 *      5. the *dissolve-in from the tip*: the sword exists only below a noisy
 *         threshold that climbs from the point to the pommel as it forms, with
 *         a hot burn line riding the threshold. The shatter is a voronoi crack
 *         field that lights up and then drops its cells out one by one.
 *    Per-instance state arrives in one `vec4 aState` (form, shatter, seed,
 *    flare) the ability writes every frame — no per-instance uniforms, one
 *    draw call for the whole cascade.
 *  - **the rune circle** — instanced ground quads, one per blade, signed
 *    distance all the way down: a double outer ring, a band of glyphs between
 *    the rings, a rotating inscribed polygon and a hub. It is *drawn on* while
 *    its blade hovers (target mark), flares white when the blade lands, then
 *    burns down to embers. Per-instance `vec4 aRune` (draw, flare, fade, seed).
 *
 * Every material reads `settings.aetherblade` in `userData.sync()`.
 */

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/**
 * A procedural glyph in a unit cell: three or four strokes chosen from a
 * fixed vocabulary by a hash, so every rune is different but every rune looks
 * like it belongs to the same alphabet. Returns a distance in cell units.
 */
const RUNE_GLSL = /* glsl */ `
  float segD(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
    return length(pa - ba * h);
  }

  float glyph(vec2 p, float id) {
    // p in [-0.5, 0.5]^2
    float d = 1e3;
    float h1 = hash11(id * 1.37 + 0.11);
    float h2 = hash11(id * 2.71 + 0.53);
    float h3 = hash11(id * 4.13 + 0.97);
    float h4 = hash11(id * 7.77 + 0.29);
    // A spine every rune has, offset a little.
    float sx = (h1 - 0.5) * 0.3;
    d = min(d, segD(p, vec2(sx, -0.38), vec2(sx, 0.38)));
    // A diagonal from one of the corners.
    vec2 c0 = vec2(h2 < 0.5 ? -0.3 : 0.3, 0.32);
    d = min(d, segD(p, c0, vec2(sx, h3 * 0.4 - 0.1)));
    // A crossbar at one of three heights.
    float cy = (floor(h3 * 3.0) - 1.0) * 0.25;
    if (h4 > 0.35) d = min(d, segD(p, vec2(-0.28, cy), vec2(0.28, cy)));
    // A hook at the foot.
    if (h1 > 0.5) d = min(d, segD(p, vec2(sx, -0.38), vec2(sx + (h2 - 0.5) * 0.6, -0.2)));
    // A dot.
    if (h2 > 0.7) d = min(d, length(p - vec2(-sx, 0.3)) - 0.03);
    return d;
  }
`;

/* -------------------------------------------------------------------- */
/* the spectral sword                                                   */
/* -------------------------------------------------------------------- */

const SWORD_VERTEX = /* glsl */ `
  attribute float aV;
  attribute float aEdge;
  attribute float aPart;
  attribute vec4  aState;     // x form 0..1, y shatter 0..1, z seed, w flare

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vV;
  varying float vEdge;
  varying float vPart;
  varying vec4  vState;

  void main() {
    vV = aV;
    vEdge = aEdge;
    vPart = aPart;
    vState = aState;
    vLocal = position;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SWORD_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uBodyGlow;
  uniform float uFresnel;
  uniform float uFresnelPower;
  uniform float uEnv;
  uniform float uSpecular;
  uniform float uGloss;
  uniform float uEdgeGlow;
  uniform float uRuneGlow;
  uniform float uRuneCount;
  uniform float uRuneWidth;
  uniform float uRuneStroke;
  uniform float uPulseSpeed;
  uniform float uPulseWidth;
  uniform float uDissolveSoft;
  uniform float uDissolveNoise;
  uniform float uBurnGlow;
  uniform float uCrackScale;
  uniform float uCrackGlow;
  uniform float uHiltDim;
  uniform float uOpacity;
  uniform vec3  uColorBody;
  uniform vec3  uColorRim;
  uniform vec3  uColorRune;
  uniform vec3  uColorEdge;
  uniform vec3  uColorBurn;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vV;
  varying float vEdge;
  varying float vPart;
  varying vec4  vState;

  ${noiseGLSL}
  ${ENV_GLSL}
  ${RUNE_GLSL}

  void main() {
    float form = vState.x;
    float shatter = vState.y;
    float seed = vState.z;
    float flare = vState.w;

    /* 5 · dissolve in from the tip: exists below a noisy rising threshold */
    float n = snoise(vec3(vLocal.x * 30.0, vV * 9.0, seed * 3.1)) * uDissolveNoise;
    float soft = max(uDissolveSoft, 0.005);
    float front = form * (1.0 + soft + uDissolveNoise) - soft * 0.5;
    float into = front - (vV + n * 0.5);
    if (into < 0.0) discard;
    float burn = 1.0 - smoothstep(0.0, soft, into);

    /* the shatter: voronoi cells crack, glow, and drop out */
    vec2 cp = vec2(vEdge * 1.4 + seed, vV * uCrackScale);
    vec2 vor = voronoi2(cp * 2.0);
    float crackLine = 1.0 - smoothstep(0.0, 0.09, abs(vor.x - 0.55) * (0.4 + shatter));
    float crack = crackLine * smoothstep(0.0, 0.25, shatter);
    if (shatter > 0.0 && vor.y < shatter * 1.25 - 0.2) discard;

    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float ndv = abs(dot(N, V));
    float isBlade = 1.0 - step(0.5, vPart);

    /* 1 · the fresnel shell */
    float fres = pow(1.0 - ndv, max(uFresnelPower, 0.2)) * uFresnel;

    /* 2 · glass: the sky in each facet and a hard glint */
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    float spec = pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), uGloss) * uSpecular;

    /* 3 · rune-light down the middle of each face */
    float rune = 0.0;
    if (isBlade > 0.5 && vV > 0.08) {
      float count = max(uRuneCount, 1.0);
      float cell = floor(vV * count);
      vec2 p = vec2(vEdge / max(uRuneWidth, 0.05), fract(vV * count) - 0.5);
      float d = glyph(vec2(p.x * 0.5, p.y), cell + floor(seed * 13.0));
      float stroke = 1.0 - smoothstep(uRuneStroke * 0.5, uRuneStroke, d);
      float inChannel = 1.0 - smoothstep(0.8, 1.0, abs(p.x));
      // The pulse: guard → point, so the light runs *down* into what it strikes.
      float ph = fract(-vV * 1.3 + uTime * uPulseSpeed + seed);
      float pulse = smoothstep(1.0 - max(uPulseWidth, 0.01), 1.0, ph);
      rune = stroke * inChannel * (0.35 + 1.4 * pulse) * uShaderIntensity;
    }

    /* 4 · the cutting edges */
    float edges = smoothstep(0.75, 1.0, abs(vEdge)) * isBlade;

    float hilt = mix(1.0, uHiltDim, step(0.5, vPart));
    vec3 color = uColorBody * uBodyGlow * (0.25 + 0.75 * fres)
               + uColorRim * fres * (1.0 + flare)
               + env * uEnv * (0.15 + fres)
               + uColorRim * spec
               + uColorRune * rune * uRuneGlow * (1.0 + flare * 0.8)
               + uColorEdge * edges * uEdgeGlow;
    color *= hilt;
    color += uColorBurn * (burn * uBurnGlow + crack * uCrackGlow);
    color += uColorEdge * flare * 0.6;

    float fadeOut = 1.0 - smoothstep(0.6, 1.0, shatter);
    gl_FragColor = vec4(color * uGlobalGlow * uOpacity * fadeOut, 1.0);
  }
`;

/** Glass and rune-light. Additive, so the cascade never has to be sorted. */
export function createAetherSwordMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uBodyGlow: { value: 0.3 },
      uFresnel: { value: 1.6 },
      uFresnelPower: { value: 2.4 },
      uEnv: { value: 0.6 },
      uSpecular: { value: 3 },
      uGloss: { value: 160 },
      uEdgeGlow: { value: 1.6 },
      uRuneGlow: { value: 2.4 },
      uRuneCount: { value: 7 },
      uRuneWidth: { value: 0.55 },
      uRuneStroke: { value: 0.07 },
      uPulseSpeed: { value: 1.2 },
      uPulseWidth: { value: 0.25 },
      uDissolveSoft: { value: 0.08 },
      uDissolveNoise: { value: 0.12 },
      uBurnGlow: { value: 4 },
      uCrackScale: { value: 6 },
      uCrackGlow: { value: 3 },
      uHiltDim: { value: 0.6 },
      uOpacity: { value: 1 },
      uColorBody: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorRune: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorBurn: { value: new Color() }
    }),
    vertexShader: SWORD_VERTEX,
    fragmentShader: SWORD_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings.aetherblade;
    const g = settings.global;
    const u = material.uniforms;
    u.uBodyGlow.value = c.swordBodyGlow;
    u.uFresnel.value = c.swordFresnel * g.fresnel;
    u.uFresnelPower.value = c.swordFresnelPower;
    u.uEnv.value = c.swordEnv;
    u.uSpecular.value = c.swordSpecular * g.glow;
    u.uGloss.value = c.swordGloss;
    u.uEdgeGlow.value = c.swordEdgeGlow * g.glow;
    u.uRuneGlow.value = c.runeLight * g.glow;
    u.uRuneCount.value = Math.max(1, Math.round(c.runeLightCount));
    u.uRuneWidth.value = c.runeLightWidth;
    u.uRuneStroke.value = c.runeLightStroke;
    u.uPulseSpeed.value = c.runePulseSpeed * g.noiseSpeed;
    u.uPulseWidth.value = c.runePulseWidth;
    u.uDissolveSoft.value = c.formSoft;
    u.uDissolveNoise.value = c.formNoise * g.noiseStrength;
    u.uBurnGlow.value = c.formBurnGlow * g.glow;
    u.uCrackScale.value = c.shatterCells * g.noiseFrequency;
    u.uCrackGlow.value = c.shatterCrackGlow * g.glow;
    u.uHiltDim.value = c.hiltDim;
    u.uOpacity.value = c.swordOpacity * g.opacity;
    u.uColorBody.value.copy(getColor(c.colorSwordBody));
    u.uColorRim.value.copy(getColor(c.colorSwordRim));
    u.uColorRune.value.copy(getColor(c.colorSwordRune));
    u.uColorEdge.value.copy(getColor(c.colorSwordEdge));
    u.uColorBurn.value.copy(getColor(c.colorSwordBurn));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the rune circle                                                      */
/* -------------------------------------------------------------------- */

const CIRCLE_VERTEX = /* glsl */ `
  attribute vec4 aRune;       // x draw 0..1, y flare, z fade, w seed
  varying vec2 vC;            // -1..1 across the quad
  varying vec4 vRune;

  void main() {
    vC = (uv - 0.5) * 2.0;
    vRune = aRune;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    gl_Position = projectionMatrix * viewMatrix * model * vec4(position, 1.0);
  }
`;

const CIRCLE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uRing;        // radius of the outer ring, fraction of the quad
  uniform float uBand;        // width of the glyph band, fraction
  uniform float uLine;        // stroke width, fraction
  uniform float uGlyphs;
  uniform float uSides;
  uniform float uSpin;        // radians, integrated on the CPU
  uniform float uCoreGlow;
  uniform float uHaloGlow;
  uniform float uOpacity;
  uniform vec3  uColorCore;
  uniform vec3  uColorGlow;
  uniform vec3  uColorFlare;

  varying vec2 vC;
  varying vec4 vRune;

  ${noiseGLSL}
  ${RUNE_GLSL}

  const float TAU = 6.28318530718;

  /** Distance to a regular polygon with \`n\` sides inscribed in radius r. */
  float polyD(vec2 p, float n, float r) {
    float a = atan(p.y, p.x);
    float k = TAU / n;
    float f = mod(a + k * 0.5, k) - k * 0.5;
    return length(p) * cos(f) - r * cos(k * 0.5);
  }

  void main() {
    float draw = vRune.x;
    float flare = vRune.y;
    float fade = vRune.z;
    float seed = vRune.w;
    if (fade <= 0.002) discard;

    vec2 p = vC;
    float r = length(p);
    if (r > 1.0) discard;
    float ang = atan(p.y, p.x);
    // Drawn on: everything is masked by a sweep round the circle.
    float sweep = fract((ang + 3.14159265) / TAU + seed);
    float drawn = step(sweep, draw * 1.02);

    float R = uRing;
    float lw = max(uLine, 0.002);
    float d = 1e3;
    d = min(d, abs(r - R));
    d = min(d, abs(r - (R - uBand)));
    d = min(d, abs(r - R * 1.06) * 1.6);

    // The band of glyphs between the two rings, turning with the circle.
    float count = max(uGlyphs, 3.0);
    float a2 = ang + uSpin;
    float cell = floor((a2 / TAU + 0.5) * count);
    float local = fract((a2 / TAU + 0.5) * count) - 0.5;
    float mid = R - uBand * 0.5;
    vec2 gp = vec2(local * (TAU * mid / count) / (uBand * 0.8), (r - mid) / (uBand * 0.8));
    float gd = glyph(gp, cell + floor(seed * 31.0)) * uBand * 0.8;
    float inBand = step(abs(r - mid), uBand * 0.5);
    d = min(d, mix(1e3, gd, inBand));

    // An inscribed polygon counter-rotating, and its star.
    vec2 q = mat2(cos(-uSpin * 1.6), -sin(-uSpin * 1.6), sin(-uSpin * 1.6), cos(-uSpin * 1.6)) * p;
    float inner = R - uBand;
    d = min(d, abs(polyD(q, uSides, inner * 0.98)));
    vec2 q2 = mat2(cos(3.14159265 / uSides), -sin(3.14159265 / uSides), sin(3.14159265 / uSides), cos(3.14159265 / uSides)) * q;
    d = min(d, abs(polyD(q2, uSides, inner * 0.62)));
    d = min(d, abs(r - inner * 0.18));

    float core = 1.0 - smoothstep(lw * 0.5, lw, d);
    float halo = exp(-max(d, 0.0) / (lw * 4.0));
    float shimmer = 0.8 + 0.2 * snoise(vec3(p * 6.0, uTime * 1.5 + seed));

    vec3 color = uColorCore * core * uCoreGlow + uColorGlow * halo * uHaloGlow * shimmer;
    color += uColorFlare * (core * 2.0 + halo) * flare;
    // A soft glow pooled under the circle.
    color += uColorGlow * (1.0 - smoothstep(0.0, R, r)) * 0.12 * (0.4 + flare);

    float alpha = drawn * fade * uOpacity;
    gl_FragColor = vec4(color * alpha * uGlobalGlow * uShaderIntensity, 1.0);
  }
`;

/** The circles each blade lands in. Additive ground quads, instanced. */
export function createAetherCircleMaterial() {
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
      uRing: { value: 0.86 },
      uBand: { value: 0.2 },
      uLine: { value: 0.012 },
      uGlyphs: { value: 12 },
      uSides: { value: 6 },
      uSpin: { value: 0 },
      uCoreGlow: { value: 3 },
      uHaloGlow: { value: 0.8 },
      uOpacity: { value: 1 },
      uColorCore: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorFlare: { value: new Color() }
    }),
    vertexShader: CIRCLE_VERTEX,
    fragmentShader: CIRCLE_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {number} spin radians, integrated by the ability */
  material.userData.sync = (spin) => {
    const c = settings.aetherblade;
    const g = settings.global;
    const u = material.uniforms;
    u.uRing.value = 0.86;
    u.uBand.value = Math.min(0.6, Math.max(0.04, c.circleBand));
    u.uLine.value = c.circleLine;
    u.uGlyphs.value = Math.max(3, Math.round(c.circleGlyphs));
    u.uSides.value = Math.max(3, Math.round(c.circleSides));
    u.uSpin.value = spin;
    u.uCoreGlow.value = c.circleCoreGlow * g.glow;
    u.uHaloGlow.value = c.circleHaloGlow * g.glow;
    u.uOpacity.value = c.circleOpacity * g.opacity;
    u.uColorCore.value.copy(getColor(c.colorCircleCore));
    u.uColorGlow.value.copy(getColor(c.colorCircleGlow));
    u.uColorFlare.value.copy(getColor(c.colorCircleFlare));
  };

  return material;
}
