import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/** Glyphs one cast can stamp — the length of the rune shader's uniform arrays. */
export const GLYPH_MAX = 12;
/** Floating fragments per glyph, at most. */
export const GLYPH_RUNES_MAX = 10;

/**
 * Glyph Barrage — the five bespoke shaders the sigil chain is drawn with.
 *
 *  - **the sigil** — one ground quad per glyph, everything on it a signed
 *    distance evaluated per fragment: an outer double ring, a band of
 *    procedural runes (each assembled from up to eight strokes chosen by a
 *    hash of its cell), a ring of radial ticks, a star of two overlapping
 *    n-gons with a ring at every vertex, dashed spokes, a rotating square and
 *    an eye at the centre. Each element is drawn as a white-hot core and a
 *    coloured halo, so the same distance gives the line and its glow. The
 *    elements carry an index from the outside in; the stamp draws them on
 *    round their circumference in that order, and the fade takes them off
 *    ring by ring in the same order. The eruption flares it, sends a
 *    shockwave ring out across the floor from it, and leaves it spent.
 *  - **the rune fragments** — one InstancedMesh for every fragment of every
 *    glyph. Each instance only knows which glyph it belongs to and a seed; the
 *    glyph's position and clocks come from two uniform arrays, so the whole
 *    swarm is one draw call and nothing is uploaded per instance per frame.
 *    Billboards in the vertex stage; each draws a rune with the sigil's stroke
 *    code. They orbit and bob over their glyph, and are flung up the pillar
 *    when it erupts.
 *  - **the pillar** — an open cylinder flared at its foot. Additive: a
 *    white-hot core where the column is seen face-on, fresnel-bright edges,
 *    streaks of light racing up it, fading to nothing at the top.
 *  - **the pillar's lens** — the same cylinder, wider, on `LAYER.DISTORTION`:
 *    the air round the column is bent outward from its axis.
 *  - **the ley line** — the thread drawn along the floor from glyph to glyph:
 *    a fine line of dashes with pulses running down it while the chain
 *    charges.
 *
 * Every material reads `settings.glyphs` in `userData.sync(state)`; `state`
 * carries only the per-glyph clocks the ability keeps.
 */

/* -------------------------------------------------------------------- */
/* Shared GLSL — strokes and runes                                      */
/* -------------------------------------------------------------------- */

const RUNE_GLSL = /* glsl */ `
  float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  /**
   * Distance to a rune inside a box of half-size \`box\`, its strokes chosen by
   * \`id\`. Up to eight strokes on a 3 × 3 lattice; the stem is nearly always
   * there, so every rune reads as a letter rather than as noise.
   */
  float runeDist(vec2 q, vec2 box, float id) {
    float d = 1e3;
    vec2 n = q / max(box, vec2(1e-4));
    float s = min(box.x, box.y);
    if (hash11(id * 1.31 + 0.7) > 0.18) d = min(d, sdSegment(n, vec2(0.0, -1.0), vec2(0.0, 1.0)));
    if (hash11(id * 2.17 + 1.3) > 0.6)  d = min(d, sdSegment(n, vec2(-1.0, 1.0), vec2(1.0, 1.0)));
    if (hash11(id * 3.11 + 2.9) > 0.65) d = min(d, sdSegment(n, vec2(-1.0, -1.0), vec2(1.0, -1.0)));
    if (hash11(id * 4.73 + 3.1) > 0.62) d = min(d, sdSegment(n, vec2(-1.0, 1.0), vec2(1.0, -0.2)));
    if (hash11(id * 5.37 + 4.7) > 0.62) d = min(d, sdSegment(n, vec2(-1.0, -1.0), vec2(1.0, 0.2)));
    if (hash11(id * 6.91 + 5.3) > 0.6)  d = min(d, sdSegment(n, vec2(-0.8, 0.0), vec2(0.8, 0.0)));
    if (hash11(id * 7.29 + 6.1) > 0.55) d = min(d, sdSegment(n, vec2(0.0, 1.0), vec2(1.0, 0.35)));
    if (hash11(id * 8.83 + 7.7) > 0.7)  d = min(d, sdSegment(n, vec2(-1.0, -0.6), vec2(-1.0, 0.6)));
    if (hash11(id * 9.41 + 8.3) > 0.75) d = min(d, abs(length(n - vec2(0.55, -0.55)) - 0.22));
    return d * s;
  }
`;

/* -------------------------------------------------------------------- */
/* The sigil                                                            */
/* -------------------------------------------------------------------- */

const SIGIL_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uHalf;      // metres, half the quad
  uniform float uLift;
  uniform float uSpin;      // a per-glyph base rotation

  varying vec2 vFlat;       // metres from the centre, in the glyph's own frame

  void main() {
    vec2 q = position.xy * 2.0 * uHalf;
    vec3 world = vec3(uCenter.x + q.x, uLift, uCenter.z + q.y);
    float c = cos(uSpin), s = sin(uSpin);
    vFlat = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SIGIL_FRAGMENT = /* glsl */ `
  #define PI  3.14159265
  #define TAU 6.2831853

  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;
  uniform float uScale;     // the stamp's punch: > 1 while it slams down
  uniform float uStamp;     // 0..1 drawn on
  uniform float uBright;
  uniform float uSpent;
  uniform float uFade;      // 0..1 taken off ring by ring
  uniform float uFadeSoft;
  uniform float uShockR;
  uniform float uShockA;
  uniform float uShockW;
  uniform float uShockGlow;
  uniform float uRotA;
  uniform float uRotB;
  uniform float uRotC;
  uniform float uLineW;
  uniform float uHaloW;
  uniform float uLineGlow;
  uniform float uHaloGlow;
  uniform float uFillGlow;
  uniform float uRunes;
  uniform float uBand;
  uniform float uTicks;
  uniform float uStar;
  uniform float uSpokes;
  uniform float uOpacity;
  uniform vec3  uColorLine;
  uniform vec3  uColorGlyph;
  uniform vec3  uColorDeep;
  uniform vec3  uColorRune;
  uniform vec3  uColorShock;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vFlat;

  ${noiseGLSL}
  ${RUNE_GLSL}

  vec2 rot(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  }

  /** Distance to the outline of a regular n-gon of circumradius r. */
  float ngonEdge(vec2 p, float r, float n) {
    float an = PI / n;
    float a = atan(p.y, p.x);
    float bn = mod(a + an, 2.0 * an) - an;
    vec2 q = length(p) * vec2(cos(bn), abs(sin(bn)));
    return length(vec2(q.x - r * cos(an), max(q.y - r * sin(an), 0.0)));
  }

  // Accumulated by every element: the white-hot core and the coloured halo.
  float gCore;
  float gHalo;
  vec3  gTint;

  void addStroke(float d, float vis, vec3 tint) {
    float w = max(uLineW, fwidth(d) * 1.2);
    float core = 1.0 - smoothstep(w * 0.45, w, d);
    float halo = exp(-d / max(uHaloW, 1e-3));
    gCore += core * vis;
    gHalo += halo * vis * 0.5;
    gTint += tint * halo * vis * 0.5;
  }

  /** Element \`k\` (0 outermost .. 6 the eye): drawn on by the stamp, taken off by the fade. */
  float visOf(float k, float ang01) {
    float kk = k / 6.0;
    // Drawn on round the circle, outer elements first.
    float draw = clamp(uStamp * 1.7 - kk * 0.7, 0.0, 1.0);
    float on = (1.0 - smoothstep(draw - 0.04, draw, ang01)) * step(0.001, draw);
    if (draw >= 1.0) on = 1.0;
    // Taken off ring by ring, outermost first.
    float off = 1.0 - smoothstep(kk * (1.0 - uFadeSoft), kk * (1.0 - uFadeSoft) + uFadeSoft, uFade);
    return on * off;
  }

  void main() {
    vec2 p = vFlat / max(uScale, 0.05);
    float R = uRadius;
    float r = length(p);
    if (r > max(R * 1.12, uShockR + uShockW * 6.0)) discard;

    float a = atan(p.y, p.x);
    float ang01 = fract(a / TAU + 0.5 + uSeed * 0.13);
    gCore = 0.0;
    gHalo = 0.0;
    gTint = vec3(0.0);

    /* 0 · the outer double ring */
    float v0 = visOf(0.0, ang01);
    addStroke(abs(r - R), v0, uColorGlyph);
    addStroke(abs(r - R * 0.955), v0 * 0.7, uColorGlyph);

    /* 1 · the rune band, turning */
    float v1 = visOf(1.0, ang01);
    float rm = R * (0.94 - uBand * 0.5);
    float hb = R * uBand * 0.5;
    addStroke(abs(r - (rm - hb)), v1, uColorRune);
    {
      float N = max(floor(uRunes + 0.5), 3.0);
      float ar = fract((a + uRotA) / TAU + 1.0) * N;
      float cell = floor(ar);
      float arc = TAU * rm / N;
      vec2 q = vec2((fract(ar) - 0.5) * arc, r - rm);
      vec2 box = vec2(min(arc * 0.3, hb * 0.75), hb * 0.72);
      float d = runeDist(q, box, cell + floor(uSeed * 37.0));
      // Clip to the band so strokes never spill onto the next cell's ring.
      d = max(d, abs(r - rm) - hb);
      addStroke(d, v1, uColorRune);
    }

    /* 2 · the tick ring */
    float v2 = visOf(2.0, ang01);
    float rt = R * 0.72;
    addStroke(abs(r - rt), v2, uColorGlyph);
    {
      float T = max(floor(uTicks + 0.5), 4.0);
      float stepA = TAU / T;
      float idx = floor((a + uRotA * 0.5) / stepA + 0.5);
      float da = abs((a + uRotA * 0.5) - idx * stepA) * r;
      float len = mod(idx, 6.0) < 0.5 ? R * 0.075 : R * 0.035;
      float d = length(vec2(da, max(abs(r - (rt + len * 0.5)) - len * 0.5, 0.0)));
      addStroke(d, v2 * 0.9, uColorGlyph);
    }

    /* 3 · the star: two n-gons, a ring at every point */
    float v3 = visOf(3.0, ang01);
    {
      float n = max(floor(uStar + 0.5), 3.0);
      float rs = R * 0.66;
      vec2 ps = rot(p, uRotB);
      addStroke(ngonEdge(ps, rs, n), v3, uColorGlyph);
      addStroke(ngonEdge(rot(ps, PI / n), rs, n), v3, uColorGlyph);
      // The nearest vertex of either polygon (they alternate every PI/n).
      float as = atan(ps.y, ps.x);
      float sector = PI / n;
      float vi = floor(as / sector + 0.5);
      // An n-gon from ngonEdge has its edges centred on angle 0, so its points
      // sit at odd multiples of PI/n; the rotated copy fills the even ones.
      vec2 vp = rs * vec2(cos(vi * sector), sin(vi * sector));
      addStroke(abs(length(ps - vp) - R * 0.055), v3 * 0.9, uColorRune);
    }

    /* 4 · the middle ring and its dashed spokes */
    float v4 = visOf(4.0, ang01);
    addStroke(abs(r - R * 0.46), v4, uColorGlyph);
    {
      float S = max(floor(uSpokes + 0.5), 2.0);
      float stepA = TAU / S;
      float aa = a - uRotB * 0.5;
      float idx = floor(aa / stepA + 0.5);
      float da = abs(aa - idx * stepA) * r;
      float dash = step(0.45, fract(r / R * 9.0 - uTime * 0.6));
      float inside = step(R * 0.27, r) * step(r, R * 0.45);
      addStroke(da + (1.0 - dash * inside) * 1e3, v4 * 0.85, uColorRune);
    }

    /* 5 · the inner square, turning fast, and its ring */
    float v5 = visOf(5.0, ang01);
    addStroke(ngonEdge(rot(p, uRotC), R * 0.3, 4.0), v5, uColorGlyph);
    addStroke(abs(r - R * 0.22), v5 * 0.8, uColorGlyph);

    /* 6 · the eye */
    float v6 = visOf(6.0, ang01);
    addStroke(abs(r - R * 0.1), v6, uColorRune);
    addStroke(max(r - R * 0.03, 0.0), v6, uColorLine);

    /* a faint wash inside the outer ring, crawling */
    float wash = (1.0 - smoothstep(R * 0.85, R, r)) * (0.55 + 0.45 * fbm3(vec3(p * 1.8 / R, uTime * 0.3 + uSeed)));
    float washVis = visOf(0.0, 0.0) * (1.0 - uFade);

    vec3 color = uColorLine * gCore * uLineGlow
               + gTint * uHaloGlow
               + uColorDeep * wash * washVis * uFillGlow;
    color *= uBright * uSpent;   // uSpent: 1 fresh .. spentDim once it has erupted

    /* the shockwave ring leaving the glyph as it erupts */
    if (uShockA > 0.001) {
      float ds = abs(length(vFlat) - uShockR);
      float w = max(uShockW, 0.005);
      float ring = exp(-ds / w) + (1.0 - smoothstep(w * 0.3, w, ds)) * 1.5;
      // Broken into arcs, so it reads as energy rather than a hoop.
      float arcs = 0.55 + 0.45 * snoise(vec3(a * 3.0, uSeed, uTime * 2.0));
      color += uColorShock * ring * arcs * uShockA * uShockGlow;
    }

    color *= uOpacity * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** One glyph on the floor. Additive, so overlapping sigils simply add up. */
export function createGlyphSigilMaterial() {
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
      uCenter: { value: new Vector3() },
      uHalf: { value: 3 },
      uLift: { value: 0.016 },
      uSpin: { value: 0 },
      uSeed: { value: 0 },
      uRadius: { value: 1.3 },
      uScale: { value: 1 },
      uStamp: { value: 0 },
      uBright: { value: 1 },
      uSpent: { value: 1 },
      uFade: { value: 0 },
      uFadeSoft: { value: 0.18 },
      uShockR: { value: 0 },
      uShockA: { value: 0 },
      uShockW: { value: 0.08 },
      uShockGlow: { value: 3 },
      uRotA: { value: 0 },
      uRotB: { value: 0 },
      uRotC: { value: 0 },
      uLineW: { value: 0.022 },
      uHaloW: { value: 0.09 },
      uLineGlow: { value: 3.2 },
      uHaloGlow: { value: 0.9 },
      uFillGlow: { value: 0.18 },
      uRunes: { value: 18 },
      uBand: { value: 0.17 },
      uTicks: { value: 72 },
      uStar: { value: 3 },
      uSpokes: { value: 8 },
      uOpacity: { value: 1 },
      uColorLine: { value: new Color() },
      uColorGlyph: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorRune: { value: new Color() },
      uColorShock: { value: new Color() }
    }),
    vertexShader: SIGIL_VERTEX,
    fragmentShader: SIGIL_FRAGMENT
  });

  /**
   * @param {object} state { x, z, lift, spin, seed, scale, stamp, bright,
   *   spent (1 = full, < 1 dimmed), fade, shockR, shockA, rotA, rotB, rotC }
   */
  material.userData.sync = (state) => {
    const c = settings.glyphs;
    const g = settings.global;
    const u = material.uniforms;
    const R = Math.max(0.1, c.glyphRadius);
    u.uCenter.value.set(state.x, 0, state.z);
    u.uRadius.value = R;
    // Big enough for the shockwave to run its full course across the floor.
    u.uHalf.value = R * Math.max(1.2, c.shockReach + 0.3) * Math.max(1, state.scale);
    u.uLift.value = state.lift;
    u.uSpin.value = state.spin;
    u.uSeed.value = state.seed;
    u.uScale.value = state.scale;
    u.uStamp.value = state.stamp;
    u.uBright.value = state.bright;
    u.uSpent.value = state.spent;
    u.uFade.value = state.fade;
    u.uFadeSoft.value = Math.min(0.9, Math.max(0.01, c.fadeSoftness));
    u.uShockR.value = state.shockR;
    u.uShockA.value = state.shockA;
    u.uShockW.value = c.shockWidth;
    u.uShockGlow.value = c.shockGlow * g.glow;
    u.uRotA.value = state.rotA;
    u.uRotB.value = state.rotB;
    u.uRotC.value = state.rotC;
    u.uLineW.value = c.lineWidth;
    u.uHaloW.value = c.haloWidth;
    u.uLineGlow.value = c.lineGlow * g.glow;
    u.uHaloGlow.value = c.haloGlow * g.glow;
    u.uFillGlow.value = c.fillGlow * g.glow;
    u.uRunes.value = c.runeCount;
    u.uBand.value = c.runeBand;
    u.uTicks.value = c.tickCount;
    u.uStar.value = c.starPoints;
    u.uSpokes.value = c.spokeCount;
    u.uOpacity.value = g.opacity;
    u.uColorLine.value.copy(getColor(c.colorLine));
    u.uColorGlyph.value.copy(getColor(c.colorGlyph));
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorRune.value.copy(getColor(c.colorRune));
    u.uColorShock.value.copy(getColor(c.colorShock));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The rune fragments                                                   */
/* -------------------------------------------------------------------- */

const FRAG_VERTEX = /* glsl */ `
  attribute vec4 aRune;      // x: glyph index, y: slot, z: seed

  uniform vec4  uGlyphA[${GLYPH_MAX}];   // x, z, radius, seconds since stamped
  uniform vec4  uGlyphB[${GLYPH_MAX}];   // seconds since erupted (< 0 not yet), fade, charge, active
  uniform float uTime;
  uniform float uSize;
  uniform float uHeight;
  uniform float uOrbit;
  uniform float uBob;
  uniform float uRise;

  varying vec2  vUv;
  varying float vAlpha;
  varying float vId;
  varying float vHot;

  float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }

  void main() {
    int gi = int(aRune.x + 0.5);
    vec4 A = uGlyphA[gi];
    vec4 B = uGlyphB[gi];
    float seed = aRune.z;

    float appear = smoothstep(0.0, 0.35, A.w - aRune.y * 0.04);
    float dir = h1(seed * 3.3) > 0.5 ? 1.0 : -1.0;
    float ang = seed * 6.2831853 + uTime * uOrbit * dir * (0.6 + 0.8 * h1(seed * 5.1));
    float rad = A.z * (0.3 + 0.55 * h1(seed * 7.31));
    float h = uHeight * (0.45 + 0.75 * h1(seed * 3.7)) * appear + uBob * sin(uTime * 2.2 + seed * 20.0);
    float alpha = appear * (1.0 - B.y) * (1.0 + B.z * 0.6);
    float hot = B.z;

    float er = B.x;
    if (er >= 0.0) {
      // Flung up the pillar, drawn in to its axis as they go.
      h += er * uRise * (0.6 + 0.8 * h1(seed * 9.1)) + er * er * 5.0;
      rad *= 1.0 - smoothstep(0.0, 0.2, er) * 0.75;
      alpha *= 1.0 - smoothstep(0.2, 0.75, er);
      hot = 1.0 + 2.0 * exp(-er / 0.15);
    }

    vec3 c = vec3(A.x + cos(ang) * rad, h, A.y + sin(ang) * rad);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float s = uSize * (0.7 + 0.6 * h1(seed * 11.3)) * appear;
    vec3 wp = c + (right * position.x + up * position.y) * s;

    vUv = position.xy * 2.0;
    vAlpha = alpha;
    vId = floor(seed * 997.0);
    vHot = hot;
    gl_Position = (B.w < 0.5 || alpha < 0.002) ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const FRAG_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform vec3  uColor;
  uniform vec3  uColorLine;
  uniform float uOpacity;
  uniform float uGlobalGlow;

  varying vec2  vUv;
  varying float vAlpha;
  varying float vId;
  varying float vHot;

  ${noiseGLSL}
  ${RUNE_GLSL}

  void main() {
    float d = runeDist(vUv, vec2(0.55, 0.8), vId);
    float w = max(0.07, fwidth(d) * 1.2);
    float core = 1.0 - smoothstep(w * 0.4, w, d);
    float halo = exp(-d / 0.16) * 0.6;
    float edge = 1.0 - smoothstep(0.75, 1.0, length(vUv));
    vec3 color = (uColorLine * core + uColor * halo) * uGlow * (0.7 + 0.5 * vHot);
    float a = vAlpha * edge * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(color * a * uGlobalGlow, 1.0);
  }
`;

/** The swarm of rune fragments over every glyph: one instanced draw. */
export function createGlyphRuneMaterial() {
  const glyphA = [];
  const glyphB = [];
  for (let i = 0; i < GLYPH_MAX; i++) {
    glyphA.push(new Vector4());
    glyphB.push(new Vector4(-1, 0, 0, 0));
  }
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uGlyphA: { value: glyphA },
      uGlyphB: { value: glyphB },
      uSize: { value: 0.26 },
      uHeight: { value: 0.9 },
      uOrbit: { value: 0.6 },
      uBob: { value: 0.12 },
      uRise: { value: 7 },
      uGlow: { value: 2.4 },
      uOpacity: { value: 1 },
      uColor: { value: new Color() },
      uColorLine: { value: new Color() }
    }),
    vertexShader: FRAG_VERTEX,
    fragmentShader: FRAG_FRAGMENT
  });

  /** Per-frame look; the per-glyph arrays are written by the ability directly. */
  material.userData.sync = () => {
    const c = settings.glyphs;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = c.runeSize * g.particleSize;
    u.uHeight.value = c.runeHeight;
    u.uOrbit.value = c.runeOrbit * g.animationSpeed;
    u.uBob.value = c.runeBob;
    u.uRise.value = c.runeRise * g.particleSpeed;
    u.uGlow.value = c.runeGlow * g.glow;
    u.uOpacity.value = g.opacity;
    u.uColor.value.copy(getColor(c.colorRuneFrag));
    u.uColorLine.value.copy(getColor(c.colorLine));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The pillar                                                           */
/* -------------------------------------------------------------------- */

/**
 * A unit open cylinder with its foot at y = 0 (see the ability), scaled here:
 * flared at the foot, `uHeight` tall. The lens uses the same vertex stage,
 * wider.
 */
const PILLAR_VERTEX = /* glsl */ `
  uniform float uRadius;
  uniform float uHeight;
  uniform float uFlare;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vCyl;       // x: bearing, y: 0 foot .. 1 top
  varying float vViewZ;

  void main() {
    float y01 = position.y;
    float flare = 1.0 + uFlare * pow(1.0 - y01, 4.0);
    vec3 p = vec3(position.x * uRadius * flare, y01 * uHeight, position.z * uRadius * flare);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * vec3(position.x, 0.0, position.z));
    vCyl = vec2(atan(position.z, position.x), y01);
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const PILLAR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uGlow;
  uniform float uCore;
  uniform float uStreaks;
  uniform float uStreakSpeed;
  uniform float uFresnel;
  uniform float uSoftFade;
  uniform float uOpacity;
  uniform vec3  uColorCore;
  uniform vec3  uColorA;
  uniform vec3  uColorB;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vCyl;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float y = vCyl.y;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    float facing = abs(dot(N, V));
    float fres = pow(1.0 - facing, max(uFresnel, 0.1));

    // Streaks racing up the column, many around, few along.
    float th = vCyl.x;
    vec3 sp = vec3(cos(th) * uStreaks * 0.35, sin(th) * uStreaks * 0.35, y * 2.2 - uTime * uStreakSpeed * 0.35 + uSeed);
    float streak = pow(clamp(snoise(sp) * 0.5 + 0.5, 0.0, 1.0), 3.0) * 2.2;

    float top = 1.0 - smoothstep(0.35, 1.0, y);
    float foot = smoothstep(0.0, 0.02, y);
    float hotFoot = exp(-y * 14.0) * 2.0;

    vec3 col = mix(uColorA, uColorB, smoothstep(0.1, 0.9, y + fres * 0.3));
    vec3 color = col * (fres * 1.4 + streak * (0.4 + fres) * uShaderIntensity)
               + uColorCore * (pow(facing, 3.0) * uCore * (0.4 + 0.6 * top) + hotFoot);

    float a = top * foot * uIntensity * uOpacity;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (a < 0.003) discard;
    gl_FragColor = vec4(color * a * uGlow * uGlobalGlow, 1.0);
  }
`;

/** A pillar of arcane light. Additive and double-sided, so it has a far wall. */
export function createGlyphPillarMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRadius: { value: 0.75 },
      uHeight: { value: 9 },
      uFlare: { value: 0.9 },
      uSeed: { value: 0 },
      uIntensity: { value: 0 },
      uGlow: { value: 2.6 },
      uCore: { value: 2 },
      uStreaks: { value: 10 },
      uStreakSpeed: { value: 6 },
      uFresnel: { value: 2.2 },
      uSoftFade: { value: 0.5 },
      uOpacity: { value: 1 },
      uColorCore: { value: new Color() },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: PILLAR_VERTEX,
    fragmentShader: PILLAR_FRAGMENT
  });

  /** @param {object} state { radius, height, intensity, seed } */
  material.userData.sync = (state) => {
    const c = settings.glyphs;
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = Math.max(0.02, state.radius);
    u.uHeight.value = Math.max(0.05, state.height);
    u.uFlare.value = c.pillarFlare;
    u.uSeed.value = state.seed;
    u.uIntensity.value = state.intensity;
    u.uGlow.value = c.pillarGlow * g.glow;
    u.uCore.value = c.pillarCore;
    u.uStreaks.value = c.pillarStreaks * g.noiseFrequency;
    u.uStreakSpeed.value = c.pillarStreakSpeed * g.noiseSpeed;
    u.uFresnel.value = c.pillarFresnel * g.fresnel;
    u.uSoftFade.value = c.pillarSoftFade;
    u.uOpacity.value = g.opacity;
    u.uColorCore.value.copy(getColor(c.colorPillarCore));
    u.uColorA.value.copy(getColor(c.colorPillarA));
    u.uColorB.value.copy(getColor(c.colorPillarB));
  };

  return material;
}

const PILLAR_WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vCyl;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float y = vCyl.y;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    // Bent outward from the axis: strongest where the column is seen edge-on.
    float edge = 1.0 - abs(dot(N, V));
    vec2 dir = normalize((viewMatrix * vec4(N, 0.0)).xy + 1e-5);
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.4 - uTime * uSpeed + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(13.1, 7.3, 2.9)));
    vec2 offset = dir * 0.6 + n * 0.4;
    float len = length(offset);
    if (len > 1.0) offset /= len;
    float mask = (1.0 - smoothstep(0.4, 1.0, y)) * smoothstep(0.0, 0.03, y) * (0.3 + 0.7 * edge);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

/** The air bent round a pillar. */
export function createGlyphPillarWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRadius: { value: 1.2 },
      uHeight: { value: 9 },
      uFlare: { value: 0.9 },
      uSeed: { value: 0 },
      uStrength: { value: 0 },
      uScale: { value: 2.2 },
      uSpeed: { value: 5 }
    }),
    vertexShader: PILLAR_VERTEX,
    fragmentShader: PILLAR_WARP_FRAGMENT
  });

  /** @param {object} state the pillar's state */
  material.userData.sync = (state) => {
    const c = settings.glyphs;
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = Math.max(0.02, state.radius * c.warpWidth);
    u.uHeight.value = Math.max(0.05, state.height);
    u.uFlare.value = c.pillarFlare;
    u.uSeed.value = state.seed;
    u.uStrength.value = Math.min(1.5, state.intensity) * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The ley line                                                         */
/* -------------------------------------------------------------------- */

const LEY_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uWidth;
  uniform float uLift;

  varying vec2 vFlat;

  void main() {
    float across = position.x * uWidth;
    float along = (position.y + 0.5) * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = uLift;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const LEY_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uDrawn;     // metres drawn so far
  uniform float uLineW;
  uniform float uGlow;
  uniform float uDash;
  uniform float uPulse;
  uniform float uCharge;
  uniform float uFade;
  uniform float uOpacity;
  uniform vec3  uColor;
  uniform vec3  uColorLine;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;
    if (along > uDrawn) discard;
    float wob = snoise(vec3(along * 0.6, uSeed, 0.0)) * 0.04;
    float d = abs(x - wob);
    float w = max(uLineW, fwidth(d) * 1.2);
    float dash = step(0.35, fract(along * uDash));
    float core = (1.0 - smoothstep(w * 0.4, w, d)) * dash;
    float halo = exp(-d / max(uLineW * 3.0, 1e-3));
    // Pulses running out along the thread while the chain charges.
    float pulse = pow(0.5 + 0.5 * sin(along * 1.8 - uTime * uPulse), 8.0) * uCharge;
    float head = exp(-max(uDrawn - along, 0.0) / 0.6);   // the freshly drawn end is hot
    float b = (0.45 + pulse * 2.5 + head * 1.5) * (1.0 - uFade);
    vec3 color = (uColorLine * core * 1.5 + uColor * halo) * b * uGlow * uOpacity * uGlobalGlow;
    if (max(color.r, max(color.g, color.b)) < 0.002) discard;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** The thread that binds the glyphs. Additive. */
export function createGlyphLeyMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: sharedUniforms({
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 1 },
      uWidth: { value: 1 },
      uLift: { value: 0.013 },
      uSeed: { value: 0 },
      uDrawn: { value: 0 },
      uLineW: { value: 0.05 },
      uGlow: { value: 1.6 },
      uDash: { value: 2.5 },
      uPulse: { value: 5 },
      uCharge: { value: 0 },
      uFade: { value: 0 },
      uOpacity: { value: 1 },
      uColor: { value: new Color() },
      uColorLine: { value: new Color() }
    }),
    vertexShader: LEY_VERTEX,
    fragmentShader: LEY_FRAGMENT
  });

  /** @param {object} state { start, dir, side, length, drawn, charge, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.glyphs;
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.05, state.length);
    u.uWidth.value = Math.max(0.3, c.leyWidth * 12 + 0.4);
    u.uSeed.value = state.seed;
    u.uDrawn.value = state.drawn;
    u.uLineW.value = Math.max(0.005, c.leyWidth);
    u.uGlow.value = c.leyGlow * g.glow;
    u.uDash.value = c.leyDash;
    u.uPulse.value = c.leyPulse * g.animationSpeed;
    u.uCharge.value = state.charge;
    u.uFade.value = state.fade;
    u.uOpacity.value = g.opacity;
    u.uColor.value.copy(getColor(c.colorLey));
    u.uColorLine.value.copy(getColor(c.colorLine));
  };

  return material;
}
