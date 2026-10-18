import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'sigilgate';

/**
 * Sigil Gate — the four bespoke shaders, and the one sigil they share.
 *
 * `SIGIL_GLSL` draws the seal procedurally in a unit disc: a double outer
 * ring; a band of runes, each one built from strokes picked by a hash
 * (`glyph`); an inner ring; a seven-pointed star polygon {7/3} that turns;
 * a ring of small orbs; twelve spokes; and a slit eye at the heart. Every
 * element has its own place in the `draw` order and sweeps on round the
 * circle, so the seal is *inscribed*, not faded in. The same function draws
 * the gate's membrane and the brand it burns into the floor, so the brand is
 * exactly the seal that fell on it.
 *
 *  - **frame** (`createSigilFrameMaterial`) — opaque, on `LAYER.WORLD`: the
 *    gate's ring, spikes and the two obelisks. Dark polished stone with a
 *    sheen off the sky, runes inlaid along it that glow (`runeGlow`), heat
 *    that floods the inlay at the slam, and a dissolve that lifts it away
 *    into motes behind a bright edge.
 *  - **membrane** (`createSigilMembraneMaterial`) — the disc in the ring:
 *    a faint, rippling violet film with the seal blazing on it, its rings
 *    counter-rotating. Additive.
 *  - **brand** (`createSigilBrandMaterial`) — the floor under the gate:
 *    while the gate falls, the seal is *projected* faintly where it will
 *    land; at the slam it is burnt in white-hot, cools through the brand
 *    colour to a violet scar and fades, over a charred disc. Normal blending
 *    so the char can darken the floor; the hot lines are > 1 for bloom.
 *  - **slam** (`createSigilWarpMaterial`) — a flat ring of bent air racing
 *    out from the circle on `LAYER.DISTORTION`.
 *
 * Every material reads `settings.sigilgate` in `userData.sync()`.
 */

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/** The seal. `p` in the unit disc; returns line intensity (0..~1.5). */
export const SIGIL_GLSL = /* glsl */ `
  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  /** One rune: up to six strokes on a 3×3 lattice, chosen by the bits of a hash. */
  float glyph(vec2 q, float id, float w) {
    float d = 1e3;
    float h1 = hash11(id * 1.37 + 0.11);
    float h2 = hash11(id * 2.71 + 0.53);
    // Always a spine, so every rune has a body.
    d = min(d, segDist(q, vec2(0.0, -0.8), vec2(0.0, 0.8)));
    if (h1 > 0.5) d = min(d, segDist(q, vec2(-0.6, 0.8), vec2(0.6, 0.8)));
    if (fract(h1 * 7.0) > 0.45) d = min(d, segDist(q, vec2(-0.6, -0.1), vec2(0.6, 0.3)));
    if (fract(h1 * 13.0) > 0.55) d = min(d, segDist(q, vec2(0.0, 0.8), vec2(0.6, 0.0)));
    if (h2 > 0.5) d = min(d, segDist(q, vec2(-0.6, -0.8), vec2(0.0, -0.2)));
    if (fract(h2 * 5.0) > 0.5) d = min(d, segDist(q, vec2(-0.6, 0.4), vec2(-0.6, -0.4)));
    if (fract(h2 * 11.0) > 0.6) d = min(d, abs(length(q - vec2(0.3, -0.5)) - 0.25));
    return 1.0 - smoothstep(w * 0.5, w, d);
  }

  /** A ring at radius r, drawn on round the circle as k goes 0..1. */
  float ringLine(float rr, float ang01, float r, float w, float k) {
    float on = step(ang01, k);
    return (1.0 - smoothstep(w * 0.5, w, abs(rr - r))) * on;
  }

  float sigil(vec2 p, float draw, float spinA, float spinB, float seed, float w) {
    float rr = length(p);
    if (rr > 1.04) return 0.0;
    float ang = atan(p.y, p.x);
    float a01 = ang / 6.2831853 + 0.5;
    float k;
    float v = 0.0;

    // Outer double ring.
    k = clamp(draw / 0.18, 0.0, 1.0);
    v = max(v, ringLine(rr, a01, 0.97, w * 1.3, k));
    v = max(v, ringLine(rr, fract(a01 + 0.5), 0.91, w, k));

    // The rune band, turning with the outer rings.
    k = clamp((draw - 0.12) / 0.3, 0.0, 1.0);
    float ra = fract((ang + spinA) / 6.2831853 + 0.5);
    float cells = 30.0;
    float cell = floor(ra * cells);
    float cu = fract(ra * cells) * 2.0 - 1.0;
    float cv = (rr - 0.835) / 0.055;
    float runes = glyph(vec2(cu * 1.1, cv), cell + seed * 31.0, w * 9.0) * step(abs(cv), 1.2);
    v = max(v, runes * step(cell / cells, k) * 0.9);

    // Inner ring.
    k = clamp((draw - 0.3) / 0.15, 0.0, 1.0);
    v = max(v, ringLine(rr, a01, 0.75, w, k));

    // The turning star {7/3}.
    k = clamp((draw - 0.4) / 0.3, 0.0, 1.0);
    float star = 1e3;
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float a0 = spinB + fi * 6.2831853 / 7.0;
      float a1 = spinB + (fi + 3.0) * 6.2831853 / 7.0;
      vec2 A = vec2(cos(a0), sin(a0)) * 0.73;
      vec2 B = vec2(cos(a1), sin(a1)) * 0.73;
      // Each stroke draws from A towards B in turn.
      float t = clamp(k * 7.0 - fi, 0.0, 1.0);
      if (t > 0.0) star = min(star, segDist(p, A, mix(A, B, t)));
    }
    v = max(v, 1.0 - smoothstep(w * 0.5, w, star));

    // A ring of small orbs, turning against the star.
    k = clamp((draw - 0.62) / 0.15, 0.0, 1.0);
    float oa = ang - spinB * 1.6;
    float oc = floor((oa / 6.2831853 + 0.5) * 9.0 + 0.5);
    float ocAng = (oc / 9.0 - 0.5) * 6.2831853 + spinB * 1.6;
    vec2 oPos = vec2(cos(ocAng), sin(ocAng)) * 0.46;
    float orb = abs(length(p - oPos) - 0.055);
    v = max(v, (1.0 - smoothstep(w * 0.5, w, orb)) * step(fract(oc / 9.0 + 1.0), k + 0.001));

    // Spokes.
    k = clamp((draw - 0.7) / 0.15, 0.0, 1.0);
    float sa = fract((ang + spinA * 0.5) / 6.2831853 * 12.0 + 0.5) - 0.5;
    float spoke = (1.0 - smoothstep(w * 0.4, w, abs(sa) * rr * 0.52)) * step(0.22, rr) * step(rr, 0.38 + 0.3 * k);
    v = max(v, spoke * step(0.001, k));

    // The eye.
    k = clamp((draw - 0.82) / 0.18, 0.0, 1.0);
    v = max(v, ringLine(rr, a01, 0.19, w * 1.2, k));
    vec2 e = p / vec2(0.07, 0.17);
    float slit = abs(length(e) - 1.0) * 0.07;
    v = max(v, (1.0 - smoothstep(w * 0.5, w, slit)) * k);
    v += (1.0 - smoothstep(0.0, 0.05, length(p))) * k * 0.8;
    return v;
  }
`;

/* ==================================================================== */
/* Frame                                                                  */
/* ==================================================================== */

const FRAME_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying vec3 vLocal;

  void main() {
    vUv = uv;
    vLocal = position;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAME_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColorStone;
  uniform vec3  uColorVein;
  uniform vec3  uColorRune;
  uniform vec3  uColorHot;
  uniform float uRuneScale;
  uniform float uRuneGlow;
  uniform float uHeat;
  uniform float uDissolve;
  uniform float uSheen;
  uniform float uSpecular;
  uniform float uSeed;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying vec3 vLocal;

  ${noiseGLSL}
  ${ENV_GLSL}

  float segDistF(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    // Lifting away into motes behind a bright edge.
    float n = snoise(vLocal * 1.7 + uSeed) * 0.5 + 0.5;
    if (n < uDissolve) discard;
    float edge = (1.0 - smoothstep(0.0, 0.08, n - uDissolve)) * step(0.001, uDissolve);

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormal);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);

    // Polished dark stone with faint pale veining.
    float vein = 1.0 - smoothstep(0.0, 0.05, abs(snoise(vLocal * 0.9 + uSeed * 2.0)));
    vec3 albedo = mix(uColorStone, uColorVein, vein * 0.5);
    float ndl = max(dot(N, L), 0.0);
    vec3 col = albedo * (0.25 + 0.75 * ndl);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    col += texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uSheen * F;
    col += vec3(pow(max(dot(N, H), 0.0), 60.0)) * uSpecular;

    // Inlaid runes, laid along the surface's own u.
    vec2 ru = vec2(vUv.x * uRuneScale, vUv.y * 3.0);
    float cell = floor(ru.x);
    vec2 q = vec2(fract(ru.x) * 2.0 - 1.0, fract(ru.y) * 2.0 - 1.0);
    float h = hash11(cell * 3.3 + floor(ru.y) * 17.0 + uSeed);
    float d = segDistF(q, vec2(0.0, -0.7), vec2(0.0, 0.7));
    if (h > 0.3) d = min(d, segDistF(q, vec2(-0.5, 0.5), vec2(0.5, 0.5)));
    if (fract(h * 7.0) > 0.5) d = min(d, segDistF(q, vec2(-0.5, -0.3), vec2(0.5, 0.1)));
    if (fract(h * 13.0) > 0.5) d = min(d, segDistF(q, vec2(0.0, 0.7), vec2(0.5, -0.1)));
    float rune = 1.0 - smoothstep(0.08, 0.16, d);
    float pulse = 0.75 + 0.25 * sin(uTime * 4.0 + cell * 0.7);
    vec3 glow = mix(uColorRune, uColorHot, uHeat) * rune * uRuneGlow * pulse * (1.0 + uHeat * 2.0);
    col = mix(col, col * 0.3, rune * 0.6);
    col += (glow + uColorHot * edge * 4.0) * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The gate's stone. Opaque; lives on LAYER.WORLD. */
export function createSigilFrameMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uColorStone: { value: new Color() },
      uColorVein: { value: new Color() },
      uColorRune: { value: new Color() },
      uColorHot: { value: new Color() },
      uRuneScale: { value: 40 },
      uRuneGlow: { value: 2 },
      uHeat: { value: 0 },
      uDissolve: { value: 0 },
      uSheen: { value: 0.6 },
      uSpecular: { value: 0.6 },
      uSeed: { value: 0 }
    }),
    vertexShader: FRAME_VERTEX,
    fragmentShader: FRAME_FRAGMENT
  });

  /** @param {object} s { runeScale, heat, dissolve, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uColorStone.value.copy(getColor(c.colorStone));
    u.uColorVein.value.copy(getColor(c.colorStoneVein));
    u.uColorRune.value.copy(getColor(c.colorRune));
    u.uColorHot.value.copy(getColor(c.colorHot));
    u.uRuneScale.value = s.runeScale;
    u.uRuneGlow.value = c.runeGlow * g.glow;
    u.uHeat.value = s.heat;
    u.uDissolve.value = s.dissolve;
    u.uSheen.value = c.stoneSheen * g.fresnel;
    u.uSpecular.value = c.stoneSpecular;
    u.uSeed.value = s.seed;
  };

  return material;
}

/* ==================================================================== */
/* Membrane                                                               */
/* ==================================================================== */

const MEMBRANE_VERTEX = /* glsl */ `
  varying vec2 vP;
  varying vec3 vWorld;
  void main() {
    vP = position.xy;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const MEMBRANE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uDraw;
  uniform float uSpinA;
  uniform float uSpinB;
  uniform float uSeed;
  uniform float uLineWidth;
  uniform float uLineGlow;
  uniform float uFilm;
  uniform float uFlare;
  uniform float uFade;
  uniform vec3  uColorLine;
  uniform vec3  uColorFilm;
  uniform vec3  uColorHot;

  varying vec2 vP;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${SIGIL_GLSL}

  void main() {
    vec2 p = vP;
    float rr = length(p);
    if (rr > 1.0) discard;
    float lines = sigil(p, uDraw, uSpinA, uSpinB, uSeed, uLineWidth);
    // A faint film rippling out from the eye, brighter toward the rim.
    float ripple = 0.5 + 0.5 * sin(rr * 26.0 - uTime * 5.0 + snoise(vec3(p * 3.0, uTime * 0.6)) * 2.0);
    float film = uFilm * (0.25 + 0.75 * rr * rr) * (0.6 + 0.4 * ripple) * smoothstep(0.0, 0.3, uDraw);
    vec3 col = uColorFilm * film;
    col += mix(uColorLine, uColorHot, clamp(uFlare * 0.5, 0.0, 1.0)) * lines * uLineGlow * (1.0 + uFlare);
    col *= (1.0 - uFade) * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The seal in the ring. Additive. */
export function createSigilMembraneMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uDraw: { value: 0 },
      uSpinA: { value: 0 },
      uSpinB: { value: 0 },
      uSeed: { value: 0 },
      uLineWidth: { value: 0.012 },
      uLineGlow: { value: 2 },
      uFilm: { value: 0.3 },
      uFlare: { value: 0 },
      uFade: { value: 0 },
      uColorLine: { value: new Color() },
      uColorFilm: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: MEMBRANE_VERTEX,
    fragmentShader: MEMBRANE_FRAGMENT
  });

  /** @param {object} s { draw, spinA, spinB, seed, flare, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uDraw.value = s.draw;
    u.uSpinA.value = s.spinA;
    u.uSpinB.value = s.spinB;
    u.uSeed.value = s.seed;
    u.uFlare.value = s.flare;
    u.uFade.value = s.fade;
    u.uLineWidth.value = c.sealLineWidth;
    u.uLineGlow.value = c.sealGlow * g.glow;
    u.uFilm.value = c.filmGlow * g.glow * g.opacity;
    u.uColorLine.value.copy(getColor(c.colorSeal));
    u.uColorFilm.value.copy(getColor(c.colorFilm));
    u.uColorHot.value.copy(getColor(c.colorHot));
  };

  return material;
}

/* ==================================================================== */
/* Brand                                                                  */
/* ==================================================================== */

const BRAND_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uRadius;
  uniform float uMargin;
  uniform vec3  uAxisU;
  uniform vec3  uAxisV;
  varying vec2 vP;    // unit-disc coordinates of the seal
  varying vec2 vM;    // metres
  void main() {
    float ext = (uRadius + uMargin) / max(uRadius, 0.01);
    vec2 p = position.xy * ext;
    vP = p;
    vM = p * uRadius;
    vec3 world = uCentre + (uAxisU * p.x + uAxisV * p.y) * uRadius;
    world.y = 0.02;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const BRAND_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uRadius;
  uniform float uMargin;
  uniform float uPreview;   // 0..1 the seal projected while the gate falls
  uniform float uBurn;      // 0..1 at the slam, then cooling to 0
  uniform float uScar;      // 0..1 how much scar remains
  uniform float uChar;
  uniform float uSpinA;
  uniform float uSpinB;
  uniform float uSeed;
  uniform float uLineWidth;
  uniform float uGlow;
  uniform float uOpacity;
  uniform vec3  uColorHot;
  uniform vec3  uColorBrand;
  uniform vec3  uColorScar;
  uniform vec3  uColorChar;
  uniform vec3  uColorSeal;

  varying vec2 vP;
  varying vec2 vM;

  ${noiseGLSL}
  ${SIGIL_GLSL}

  void main() {
    vec2 p = vP;
    float rr = length(p);
    float lines = sigil(p, 1.0, uSpinA, uSpinB, uSeed, uLineWidth * (1.0 + uBurn * 0.6));
    float bloom = sigil(p, 1.0, uSpinA, uSpinB, uSeed, uLineWidth * 4.0) * 0.35;

    // Charred disc with a ragged, scorched margin.
    float rag = snoise(vec3(vM * 0.8, uSeed)) * uMargin * 0.6;
    float disc = 1.0 - smoothstep(1.0, 1.0 + uMargin / max(uRadius, 0.01), rr + rag / max(uRadius, 0.01));
    float mottle = fbm3(vec3(vM * 0.9, uSeed + 3.0)) * 0.5 + 0.5;

    // Hot → brand → scar.
    vec3 hot = mix(uColorBrand, uColorHot, smoothstep(0.55, 1.0, uBurn));
    vec3 lineCol = mix(uColorScar, hot, smoothstep(0.0, 0.35, uBurn));
    float glow = (lines + bloom) * (uBurn * 3.0 + uScar * 0.6) * uGlow;
    float preview = (lines * 0.6 + bloom) * uPreview * uGlow * 0.5;

    vec3 col = uColorChar * (0.7 + 0.3 * mottle);
    col = mix(col, uColorScar * 0.4, lines * uScar);
    col += lineCol * glow * uGlobalGlow * uShaderIntensity;
    col += uColorSeal * preview * uGlobalGlow * uShaderIntensity;

    float a = max(disc * uChar * uScar * (0.6 + 0.4 * mottle), min(1.0, lines * max(uScar, uBurn) + preview + glow * 0.3));
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The seal burnt into the floor. */
export function createSigilBrandMaterial() {
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
      uCentre: { value: new Vector3() },
      uAxisU: { value: new Vector3(1, 0, 0) },
      uAxisV: { value: new Vector3(0, 0, 1) },
      uRadius: { value: 4 },
      uMargin: { value: 0.8 },
      uPreview: { value: 0 },
      uBurn: { value: 0 },
      uScar: { value: 0 },
      uChar: { value: 0.7 },
      uSpinA: { value: 0 },
      uSpinB: { value: 0 },
      uSeed: { value: 0 },
      uLineWidth: { value: 0.012 },
      uGlow: { value: 1 },
      uOpacity: { value: 1 },
      uColorHot: { value: new Color() },
      uColorBrand: { value: new Color() },
      uColorScar: { value: new Color() },
      uColorChar: { value: new Color() },
      uColorSeal: { value: new Color() }
    }),
    vertexShader: BRAND_VERTEX,
    fragmentShader: BRAND_FRAGMENT
  });

  /** @param {object} s { centre, axisU, axisV, radius, preview, burn, scar, spinA, spinB, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uAxisU.value.copy(s.axisU);
    u.uAxisV.value.copy(s.axisV);
    u.uRadius.value = s.radius;
    u.uMargin.value = c.charMargin;
    u.uPreview.value = s.preview;
    u.uBurn.value = s.burn;
    u.uScar.value = s.scar;
    u.uChar.value = c.charDarkness;
    u.uSpinA.value = s.spinA;
    u.uSpinB.value = s.spinB;
    u.uSeed.value = s.seed;
    u.uLineWidth.value = c.sealLineWidth;
    u.uGlow.value = c.brandGlow * g.glow;
    u.uOpacity.value = g.opacity;
    u.uColorHot.value.copy(getColor(c.colorHot));
    u.uColorBrand.value.copy(getColor(c.colorBrand));
    u.uColorScar.value.copy(getColor(c.colorScar));
    u.uColorChar.value.copy(getColor(c.colorChar));
    u.uColorSeal.value.copy(getColor(c.colorSeal));
  };

  return material;
}

/* ==================================================================== */
/* Slam warp                                                              */
/* ==================================================================== */

const WARP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    // Two shells: the pressure front and a weaker echo behind it.
    float R1 = 0.15 + 0.85 * uProgress;
    float R2 = 0.1 + 0.6 * uProgress;
    float d1 = (r - R1) / 0.08;
    float d2 = (r - R2) / 0.06;
    float slope = -d1 * exp(-d1 * d1) - 0.5 * d2 * exp(-d2 * d2);
    float wob = snoise(vec3(vUv * 6.0, uTime * 3.0)) * 0.3;
    vec2 dir = vUv / max(r, 1e-4);
    float mask = max(exp(-d1 * d1), exp(-d2 * d2) * 0.5) * (1.0 - uProgress);
    float s = uStrength * uShaderIntensity * mask;
    if (s < 0.002) discard;
    gl_FragColor = vec4(dir * clamp(slope * 2.0 + wob, -1.0, 1.0) * 0.5 + 0.5, s, mask);
  }
`;

/** The slam in the air. LAYER.DISTORTION — see `createAcidFumeMaterial`. */
export function createSigilWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uProgress: { value: 1 },
      uStrength: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  material.userData.sync = (progress) => {
    const c = settings[ID];
    const g = settings.global;
    material.uniforms.uProgress.value = progress;
    material.uniforms.uStrength.value = progress < 1 ? c.slamWarp * g.distortion : 0;
  };

  return material;
}
