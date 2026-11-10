import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Spellwright's Gambit — the bespoke shaders.
 *
 *  - **the sigil field** — the ink disc under the armillary: a bezel and two
 *    script rings whose radius is bled by fbm so the line looks brushed, a
 *    turning scan wedge, ripple rings, and a wash that deepens as each beat
 *    charges. Inked round on arrival, eaten by a noise dissolve on the exit.
 *  - **the sigil linework** — the authored star polygons and glyph ring,
 *    written on stroke by stroke from the geometry's `aDraw` order with a hot
 *    nib at the writing front, and a band-by-band pulse on every release.
 *  - **the footprints** — the exact disc-clipped stripe or annulus the next
 *    beat will strike. They are the hit test drawn on the floor, so their
 *    `width` uniform keeps its original name and meaning (fraction of reach);
 *    they brighten and march as the beat approaches — the telegraph.
 *  - **the armillary bands** — brass-and-light rings with a scrolling band of
 *    runes and a fresnel rim, shared by the floor rings and the hero rings.
 *  - **the release** — one flare per beat in the shape that struck: an
 *    expanding annulus, a streaming stripe of chevrons, or a spoked disc.
 *  - **the beam** — the column of light the core drives into the floor on a
 *    release.
 *  - **the motes** — a GPU point cloud spiralling up off the sigil, cinched
 *    inward by the charge and thrown outward by each release.
 *  - **the warp** — `LAYER.DISTORTION` disc: a pressure ring running out from
 *    the centre on each release, and a slow swirl while the beat charges.
 *
 * Every material reads `settings.spellwrightsGambit` in `userData.sync(state)`.
 */

const ID = config.id;

/* -------------------------------------------------------------------- */
/* Shared vertex stages                                                 */
/* -------------------------------------------------------------------- */

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

const LIT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const additive = (extra) => ({
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: AdditiveBlending,
  side: DoubleSide,
  toneMapped: false,
  ...extra,
});

/* -------------------------------------------------------------------- */
/* Scars — the struck shapes burnt into the floor                       */
/* -------------------------------------------------------------------- */

/**
 * Shared by the ink pool (which darkens the floor in the struck shape) and
 * the sigil field (which lights the same shape's cracks while it cools), so
 * the dark burn and its hot seams always line up. Everything is in the floor
 * quad's own space `q` (unit disc = the reach); `uRingW` / `uLineW` are the
 * hit test's own fractions, `uLineDir` the aimed direction in that space.
 * Returns the three shape masks (ring band, line stripe, burst spokes) with a
 * cracked, noise-eaten edge.
 */
const SCAR_GLSL = /* glsl */ `
  uniform vec3  uScarHeat;    // ring, line, burst: 1 when struck, cooling to 0
  uniform vec3  uScarMask;    // ring, line, burst: 1 once struck (the burn stays)
  uniform float uRingW;
  uniform float uLineW;
  uniform vec2  uLineDir;
  uniform float uCrack;

  vec3 scarShapes(vec2 q, float n) {
    float r = length(q);
    float edgeN = (n - 0.5) * 0.08;
    float ring = smoothstep(1.0 - uRingW - 0.03, 1.0 - uRingW + 0.02, r + edgeN) * (1.0 - smoothstep(0.97, 1.0, r));
    float lateral = abs(q.x * uLineDir.y - q.y * uLineDir.x);
    float line = (1.0 - smoothstep(uLineW - 0.02, uLineW + 0.03, lateral + edgeN)) * (1.0 - smoothstep(0.9, 1.0, r));
    float spokes = pow(abs(cos(atan(q.y, q.x) * 4.0 + n * 0.6)), 10.0) * smoothstep(0.08, 0.3, r) * (1.0 - smoothstep(0.75, 0.98, r));
    float burst = max(spokes, (1.0 - smoothstep(0.0, 0.35, r)) * 0.8);
    return vec3(ring, line, burst);
  }

  /** F2 − F1 of a jittered grid: zero on the cell walls. */
  float scarEdge(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    }
    return sqrt(d2) - sqrt(d1);
  }

  /** Hot seams inside a scar: cell walls, thinner as it cools. */
  float scarCracks(vec2 q, float cool) {
    return 1.0 - smoothstep(0.0, mix(0.16, 0.06, cool), scarEdge(q * 5.5 * uCrack));
  }
`;

/* -------------------------------------------------------------------- */
/* The sigil field                                                      */
/* -------------------------------------------------------------------- */

const FIELD_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uDraw;        // 0..1 inked round
  uniform float uCharge;      // 0..1 toward the next beat
  uniform float uBeats;       // 0, .5, 1 — how many shapes have released
  uniform float uFade;
  uniform float uDissolve;    // 0..1 eaten away on the exit
  uniform float uGlow;
  uniform float uBleed;
  uniform float uWash;
  uniform float uScale;
  uniform vec3  uInk;
  uniform vec3  uEdge;
  uniform vec3  uDeep;
  uniform float uScarGlow;
  uniform float uScarRest;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}
  ${SCAR_GLSL}

  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    if (r > 1.0) discard;
    float a = atan(q.y, q.x);

    // Brushed ink: the radius every ring is drawn at wanders with fbm.
    float n = fbm3(vec3(q * 2.2 * uScale, uClock * 0.15));
    float rr = r + (n - 0.5) * 0.06 * uBleed;

    float boundary = exp(-abs(rr - 0.94) * 85.0);
    float script = exp(-abs(rr - 0.615) * 140.0) + exp(-abs(rr - 0.725) * 140.0);
    float marks = pow(abs(cos(a * 12.0)), 32.0) * smoothstep(0.58, 0.88, rr);
    float ripples = pow(max(0.0, cos(rr * 40.0 - uClock * 1.5)), 16.0) * (1.0 - smoothstep(0.3, 0.9, rr));
    float scan = pow(max(0.0, cos(a - uClock * 0.8)), 40.0) * smoothstep(0.2, 0.9, r);

    // Inked round from angle 0: only what the brush has passed is drawn.
    float around = fract(a / 6.2831853 + 1.0);
    float drawn = 1.0 - smoothstep(uDraw * 1.04 - 0.03, uDraw * 1.04, around);
    float nib = exp(-abs(around - uDraw) * 50.0) * step(uDraw, 0.999) * smoothstep(0.85, 0.94, r);

    // A wash of ink inside the bezel that deepens as the beat charges.
    float wash = uWash * (0.4 + 0.6 * n) * (1.0 - smoothstep(0.2, 0.96, r)) * (0.35 + 0.65 * uCharge) * uShaderIntensity;

    vec2 dm = dissolveMask(snoise01(vec3(q * 3.1, 1.7)), uDissolve, 0.08);

    float lines = (boundary * 0.8 + script * 0.28 + marks * 0.3 + ripples * 0.16 + scan * 0.12) * drawn + nib * 1.5;
    float alpha = (lines * (0.55 + 0.45 * uBeats) * (1.0 + uCharge * 0.6) + wash) * dm.x * uFade;
    vec3 col = mix(uInk, uEdge, clamp(boundary + ripples * 0.5 + nib + dm.y * 2.0, 0.0, 1.0));
    col += uEdge * dm.y * 3.0;
    vec3 outCol = col * uGlow * uGlobalGlow * alpha;

    // The struck shapes' seams: white-hot on the beat, cooling through the
    // ink to the deep tone, a faint ember line kept for the rest of the linger.
    vec3 shapes = scarShapes(q, n) * uScarMask;
    vec3 heat = shapes * max(uScarHeat, vec3(uScarRest));
    float h = max(heat.x, max(heat.y, heat.z));
    if (h > 0.002) {
      float cool = 1.0 - max(uScarHeat.x * shapes.x, max(uScarHeat.y * shapes.y, uScarHeat.z * shapes.z));
      float seam = scarCracks(q, cool) * h;
      vec3 ramp = gradient4(uEdge, uInk, uDeep * 2.5, uDeep, cool);
      outCol += ramp * seam * uScarGlow * uGlobalGlow * uShaderIntensity * dm.x * uFade;
    }
    gl_FragColor = vec4(outCol, 1.0);
  }
`;

/** The ink disc. Additive. */
export function createSigilFieldMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uDraw: { value: 1 },
      uCharge: { value: 0 },
      uBeats: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uGlow: { value: 1.8 },
      uBleed: { value: 1 },
      uWash: { value: 0.2 },
      uScale: { value: 1 },
      uInk: { value: new Color() },
      uEdge: { value: new Color() },
      uDeep: { value: new Color() },
      uScarGlow: { value: 2 },
      uScarRest: { value: 0.2 },
      ...scarUniforms(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FIELD_FRAGMENT,
  });
  /** @param {object} s { clock, draw, charge, beats, fade, dissolve, scar } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uDraw.value = s.draw;
    u.uCharge.value = s.charge;
    u.uBeats.value = s.beats;
    u.uFade.value = s.fade * g.opacity;
    u.uDissolve.value = s.dissolve;
    u.uGlow.value = c.fieldGlow * g.glow;
    u.uBleed.value = c.inkBleed * g.noiseStrength;
    u.uWash.value = c.inkWash;
    u.uScale.value = g.noiseFrequency;
    u.uInk.value.copy(getColor(c.inkColor));
    u.uEdge.value.copy(getColor(c.edgeColor));
    u.uDeep.value.copy(getColor(c.deepColor));
    u.uScarGlow.value = c.scarGlow * g.glow;
    u.uScarRest.value = c.scarRest;
    syncScar(u, s.scar);
  };
  return material;
}

/** The scar uniforms, one fresh set per material. */
function scarUniforms() {
  return {
    uScarHeat: { value: new Vector3() },
    uScarMask: { value: new Vector3() },
    uRingW: { value: 0.2 },
    uLineW: { value: 0.2 },
    uLineDir: { value: new Vector2(0, 1) },
    uCrack: { value: 1 },
  };
}

/** Copy the ability's scar state ({ heat, mask, ringW, lineW, dirX, dirY }) in. */
function syncScar(u, scar) {
  if (!scar) return;
  u.uScarHeat.value.copy(scar.heat);
  u.uScarMask.value.copy(scar.mask);
  u.uRingW.value = scar.ringW;
  u.uLineW.value = scar.lineW;
  u.uLineDir.value.set(scar.dirX, scar.dirY);
  u.uCrack.value = settings[ID].scarCrack * settings.global.noiseFrequency;
}

/* -------------------------------------------------------------------- */
/* The ink pool — the deep tone under everything                        */
/* -------------------------------------------------------------------- */

const INK_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uDraw;
  uniform float uFade;
  uniform float uDissolve;
  uniform float uDark;
  uniform float uScarDark;
  uniform float uScale;
  uniform float uReach;
  uniform vec3  uDeep;
  uniform vec3  uInk;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}
  ${SCAR_GLSL}

  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    if (r > 1.0) discard;
    float n = fbm3(vec3(q * 2.2 * uScale, uClock * 0.15));
    // Soaks outward from the centre as the sigil is inked, with a bled edge.
    float soak = 1.0 - smoothstep(uDraw * uReach - 0.12, uDraw * uReach + 0.02, r + (n - 0.5) * 0.12);
    float pool = soak * (0.75 + 0.25 * n) * uDark;
    // Struck shapes are burnt darker, and the burn stays.
    vec3 shapes = scarShapes(q, n) * uScarMask;
    float burn = max(shapes.x, max(shapes.y, shapes.z)) * uScarDark;
    vec2 dm = dissolveMask(snoise01(vec3(q * 3.1, 1.7)), uDissolve, 0.08);
    float a = clamp(max(pool, burn) * dm.x * uFade, 0.0, 0.96);
    if (a < 0.003) discard;
    // A faint ink sheen in the pool so it reads as wet ink, not a hole.
    vec3 col = mix(uDeep, uInk * 0.35, (1.0 - burn) * 0.25 * n);
    gl_FragColor = vec4(col, a);
  }
`;

/** The deep ink pool and the burnt shapes. Normal blending: it darkens the floor. */
export function createInkPoolMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uDraw: { value: 1 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uDark: { value: 0.6 },
      uScarDark: { value: 0.8 },
      uScale: { value: 1 },
      uReach: { value: 0.98 },
      uDeep: { value: new Color() },
      uInk: { value: new Color() },
      ...scarUniforms(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: INK_FRAGMENT,
  });
  /** @param {object} s { clock, draw, fade, dissolve, scar } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uDraw.value = s.draw;
    u.uFade.value = s.fade * g.opacity;
    u.uDissolve.value = s.dissolve;
    u.uDark.value = c.inkDarkness;
    u.uScarDark.value = c.scarDarkness;
    u.uScale.value = g.noiseFrequency;
    u.uReach.value = Math.min(1, Math.max(0.05, c.inkPoolReach));
    u.uDeep.value.copy(getColor(c.deepColor));
    u.uInk.value.copy(getColor(c.inkColor));
    syncScar(u, s.scar);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The glyph wall                                                       */
/* -------------------------------------------------------------------- */

const WALL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WALL_FRAGMENT = /* glsl */ `
  uniform float uProgress;    // 0..1 through the wall's life
  uniform float uRise;        // 0..1 risen
  uniform float uColumns;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uClock;
  uniform vec3  uEdge;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float y = vUv.y;
    // Risen to here; the top edge is torn by noise and white-hot.
    float n = snoise(vec3(vUv.x * uColumns * 0.5, y * 3.0, uClock * 1.3));
    float top = uRise * (1.0 - 0.55 * uProgress) + n * 0.06;
    if (y > top) discard;
    float lip = exp(-(top - y) * 22.0);
    // Columns of rune cells streaming upward: three of six strokes per cell.
    float cx = vUv.x * uColumns;
    float col = floor(cx);
    float cy = y * 6.0 - uClock * 1.8 + hash11(col * 1.7) * 4.0;
    vec2 cell = vec2(fract(cx), fract(cy));
    float id = hash13(vec3(col, floor(cy), 3.1));
    float stroke = 0.0;
    stroke += step(0.5, fract(id * 7.0))  * (1.0 - smoothstep(0.05, 0.11, abs(cell.y - 0.25)));
    stroke += step(0.5, fract(id * 13.0)) * (1.0 - smoothstep(0.05, 0.11, abs(cell.y - 0.75)));
    stroke += step(0.5, fract(id * 29.0)) * (1.0 - smoothstep(0.05, 0.11, abs(cell.x - 0.5)));
    stroke *= step(0.15, cell.x) * step(cell.x, 0.85) * step(0.12, cell.y) * step(cell.y, 0.88);
    float gap = smoothstep(0.0, 0.08, fract(cx)) * (1.0 - smoothstep(0.92, 1.0, fract(cx)));
    // Body heat: hot at the foot and on the torn lip, deep toward the top.
    float heat = clamp(1.0 - y / max(top, 0.05) * 0.85 + lip, 0.0, 1.0);
    vec3 ramp = gradient4(uDeep, uBody, uTint, uEdge, heat * (0.6 + 0.4 * stroke));
    float body = (0.18 + 0.55 * stroke * gap) * (0.4 + 0.6 * heat) + lip * 1.4;
    float fadeOut = pow(1.0 - uProgress, 1.3);
    float a = body * fadeOut * uOpacity * smoothstep(0.0, 0.04, y);
    if (a < 0.003) discard;
    gl_FragColor = vec4(ramp * uGlow * uGlobalGlow * (0.7 + 0.3 * uShaderIntensity), clamp(a, 0.0, 1.0));
  }
`;

/** A curtain of runes rising out of the floor in the struck shape. */
export function createWallMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uProgress: { value: 0 },
      uRise: { value: 0 },
      uColumns: { value: 28 },
      uOpacity: { value: 0 },
      uGlow: { value: 1.6 },
      uClock: { value: 0 },
      uEdge: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: WALL_VERTEX,
    fragmentShader: WALL_FRAGMENT,
  });
  /** @param {object} s { progress, rise, columns, fade, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uProgress.value = s.progress;
    u.uRise.value = s.rise;
    u.uColumns.value = Math.max(1, s.columns);
    u.uOpacity.value = c.wallOpacity * s.fade * g.opacity;
    u.uGlow.value = c.wallGlow * g.glow;
    u.uClock.value = s.clock;
    u.uEdge.value.copy(getColor(c.edgeColor));
    u.uTint.value.copy(getColor(c.coreColor));
    u.uBody.value.copy(getColor(c.inkColor));
    u.uDeep.value.copy(getColor(c.deepColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The sigil linework                                                   */
/* -------------------------------------------------------------------- */

const RUNE_VERTEX = /* glsl */ `
  attribute float aDraw;
  attribute float aBand;
  varying float vDraw;
  varying float vBand;
  void main() {
    vDraw = aDraw;
    vBand = aBand;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RUNE_FRAGMENT = /* glsl */ `
  uniform float uDraw;
  uniform float uWave;        // band index the release pulse is passing, 0..1+
  uniform float uPulse;       // strength of that pulse
  uniform float uFade;
  uniform float uDissolve;
  uniform float uGlow;
  uniform vec3  uEtch;
  uniform vec3  uEdge;
  uniform float uGlobalGlow;

  varying float vDraw;
  varying float vBand;

  void main() {
    float inked = 1.0 - smoothstep(uDraw - 0.015, uDraw, vDraw);
    float nib = exp(-abs(vDraw - uDraw) * 60.0) * step(uDraw, 1.0);
    float pulse = exp(-abs(vBand - uWave) * 7.0) * uPulse;
    // Exit: the outer bands go first, as the field itself dissolves inward.
    float keep = 1.0 - smoothstep(1.0 - uDissolve * 1.3, 1.25 - uDissolve * 1.3, vBand);
    float a = (inked * (0.7 + pulse) + nib * 1.4) * keep * uFade;
    if (a < 0.003) discard;
    vec3 col = mix(uEtch, uEdge, clamp(nib + pulse, 0.0, 1.0));
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The authored sigil linework, written on along `aDraw`. */
export function createRuneLineMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uDraw: { value: 1 },
      uWave: { value: -1 },
      uPulse: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uGlow: { value: 1 },
      uEtch: { value: new Color() },
      uEdge: { value: new Color() },
    }),
    vertexShader: RUNE_VERTEX,
    fragmentShader: RUNE_FRAGMENT,
  });
  /** @param {object} s { draw, wave, pulse, fade, dissolve } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uDraw.value = s.draw;
    u.uWave.value = s.wave;
    u.uPulse.value = s.pulse;
    u.uFade.value = s.fade * g.opacity;
    u.uDissolve.value = s.dissolve;
    u.uGlow.value = c.etchGlow * g.glow;
    u.uEtch.value.copy(getColor(c.etchColor));
    u.uEdge.value.copy(getColor(c.edgeColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The footprints                                                       */
/* -------------------------------------------------------------------- */

const FOOTPRINT_COMMON = /* glsl */ `
  uniform vec3  color;
  uniform float fade;
  uniform float width;        // fraction of the reach — the hit test's own number
  uniform float uCharge;
  uniform float uClock;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
`;

const LINE_FOOTPRINT = /* glsl */ `
  ${FOOTPRINT_COMMON}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float disc = 1.0 - smoothstep(0.985, 1.0, length(p));
    float stripe = 1.0 - smoothstep(width - 0.01, width + 0.01, abs(p.x));
    // Its two edges are the hit boundary: drawn hard, the body soft.
    float rails = exp(-abs(abs(p.x) - width) * 140.0);
    // Chevrons march down the stripe faster as the beat comes due.
    float chev = pow(max(0.0, sin((p.y * 6.0 - abs(p.x) / max(width, 0.01) * 0.6) * 3.14159 - uClock * (2.0 + 6.0 * uCharge))), 8.0);
    float grain = 0.75 + 0.25 * snoise(vec3(vWorld.xz * 1.7, uClock * 0.4));
    float a = disc * (stripe * (0.35 + chev * 0.35 * uCharge) * grain + rails * (0.6 + 0.8 * uCharge)) * fade * uOpacity * (0.6 + 0.4 * uCharge);
    gl_FragColor = vec4(color * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

const RING_FOOTPRINT = /* glsl */ `
  ${FOOTPRINT_COMMON}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float band = smoothstep(1.0 - width - 0.01, 1.0 - width + 0.01, r) * (1.0 - smoothstep(0.985, 1.0, r));
    float rails = exp(-abs(r - (1.0 - width)) * 140.0) + exp(-abs(r - 0.985) * 140.0);
    float a0 = atan(p.y, p.x);
    float dashes = step(0.5, fract(a0 * 9.549 + uClock * (0.4 + 1.6 * uCharge)));
    float grain = 0.75 + 0.25 * snoise(vec3(vWorld.xz * 1.7, uClock * 0.4));
    float a = (band * (0.35 + dashes * 0.3 * uCharge) * grain + rails * (0.5 + 0.8 * uCharge)) * fade * uOpacity * (0.6 + 0.4 * uCharge);
    gl_FragColor = vec4(color * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/**
 * The next beat's exact footprint.
 * @param {'line'|'ring'} kind
 */
export function createFootprintMaterial(kind = 'ring') {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      color: { value: new Color('#b6a4ff') },
      fade: { value: 1 },
      width: { value: 0.2 },
      uCharge: { value: 0 },
      uClock: { value: 0 },
      uGlow: { value: 1.6 },
      uOpacity: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: kind === 'line' ? LINE_FOOTPRINT : RING_FOOTPRINT,
  });
  /** @param {object} s { width, fade, charge, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.width.value = s.width;
    u.fade.value = s.fade;
    u.uCharge.value = s.charge;
    u.uClock.value = s.clock;
    u.uGlow.value = c.footprintGlow * g.glow;
    u.uOpacity.value = c.footprintOpacity * g.opacity;
    u.color.value.copy(getColor(c.edgeColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The armillary bands                                                  */
/* -------------------------------------------------------------------- */

const BAND_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uGlow;
  uniform float uFlare;
  uniform float uRunes;
  uniform float uFresnel;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uGlobalGlow;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, 2.5, uFresnel);
    // A band of rune cells scrolling round the ring.
    float cells = max(uRunes, 1.0);
    float x = fract(vUv.x * cells - uClock * 0.35);
    float cell = floor(vUv.x * cells - uClock * 0.35);
    float lit = step(0.45, hash11(cell * 3.17 + 0.5));
    float glyph = lit * (1.0 - smoothstep(0.28, 0.36, abs(x - 0.5))) * smoothstep(0.3, 0.5, vUv.y) * (1.0 - smoothstep(0.6, 0.8, vUv.y));
    float a = (0.35 + 0.65 * rim + glyph * 0.9 + uFlare) * uFade;
    vec3 col = mix(uColor, uHot, clamp(rim * 0.6 + glyph + uFlare * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * (1.0 + uFlare), clamp(a, 0.0, 1.0));
  }
`;

/** Brass-of-light armillary bands. Shared by floor rings and hero rings. */
export function createBandMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1 },
      uFlare: { value: 0 },
      uRunes: { value: 24 },
      uFresnel: { value: 1 },
      uColor: { value: new Color() },
      uHot: { value: new Color() },
    }),
    vertexShader: LIT_VERTEX,
    fragmentShader: BAND_FRAGMENT,
  });
  /** @param {object} s { clock, fade, flare } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uFade.value = s.fade * g.opacity;
    u.uFlare.value = s.flare;
    u.uGlow.value = c.bandGlow * g.glow;
    u.uRunes.value = Math.max(1, Math.round(c.bandRunes));
    u.uFresnel.value = g.fresnel;
    u.uColor.value.copy(getColor(c.bandColor));
    u.uHot.value.copy(getColor(c.edgeColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The release                                                          */
/* -------------------------------------------------------------------- */

const RELEASE_FRAGMENT = /* glsl */ `
  uniform float uKind;        // 0 ring, 1 line, 2 burst
  uniform float uProgress;    // 0..1 through the flare
  uniform float uWidth;       // ring band as a fraction of the reach
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uClock;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uGlobalGlow;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float t = uProgress;
    float crackle = 0.7 + 0.3 * snoise(vec3(vWorld.xz * 2.3, uClock * 3.0));
    float shape = 0.0;
    float hot = 0.0;
    if (uKind < 0.5) {
      // The annulus that struck, its leading rim white-hot.
      float band = smoothstep(1.0 - uWidth - 0.02, 1.0 - uWidth + 0.02, r) * (1.0 - smoothstep(0.97, 1.0, r));
      float rim = exp(-abs(r - 0.97) * 60.0);
      shape = band * 0.6 + rim;
      hot = rim;
    } else if (uKind < 1.5) {
      // The stripe: a soft beam whose chevrons stream out along the line.
      float core = 1.0 - smoothstep(0.0, 1.0, abs(p.x));
      float ends = 1.0 - smoothstep(0.85, 1.0, abs(p.y));
      float chev = pow(max(0.0, sin((abs(p.y) * 5.0 - abs(p.x) * 0.8 - t * 6.0) * 3.14159)), 6.0);
      shape = core * ends * (0.5 + chev);
      hot = core * core * ends;
    } else {
      // The burst: a spoked disc whose centre flashes and empties out.
      float spokes = pow(abs(cos(atan(p.y, p.x) * 8.0)), 20.0) * smoothstep(0.15, 0.6, r);
      float disc = 1.0 - smoothstep(0.9, 1.0, r);
      float hollow = smoothstep(t * 0.9 - 0.2, t * 0.9, r);
      shape = disc * (0.3 * hollow + spokes) + exp(-r * 6.0) * (1.0 - t) * 1.5;
      hot = exp(-r * 4.0);
    }
    float a = shape * crackle * uOpacity * pow(1.0 - t, 1.4);
    if (a < 0.003) discard;
    vec3 col = mix(uColor, uHot, clamp(hot, 0.0, 1.0));
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** One beat's flare, in the shape that struck. One instance per release record. */
export function createReleaseMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uKind: { value: 0 },
      uProgress: { value: 0 },
      uWidth: { value: 0.2 },
      uOpacity: { value: 0 },
      uGlow: { value: 2 },
      uClock: { value: 0 },
      uColor: { value: new Color() },
      uHot: { value: new Color() },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: RELEASE_FRAGMENT,
  });
  /** @param {object} s { kind, progress, width, fade, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uKind.value = s.kind === 'ring' ? 0 : s.kind === 'line' ? 1 : 2;
    u.uProgress.value = s.progress;
    u.uWidth.value = s.width;
    u.uOpacity.value = c.releaseOpacity * s.fade * g.opacity;
    u.uGlow.value = c.releaseGlow * g.glow;
    u.uClock.value = s.clock;
    u.uColor.value.copy(getColor(c.coreColor));
    u.uHot.value.copy(getColor(c.edgeColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The beam                                                             */
/* -------------------------------------------------------------------- */

const BEAM_FRAGMENT = /* glsl */ `
  uniform float uPower;
  uniform float uClock;
  uniform float uGlow;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    // Edge-on the column is bright, face-on thin: a tube of light, not a pipe.
    float edge = fresnelTerm(vViewDir, vNormalW, 1.6, 1.0);
    float bands = pow(max(0.0, sin(vUv.y * 28.0 - uClock * 14.0)), 6.0) * uShaderIntensity;
    float flicker = 0.75 + 0.25 * snoise(vec3(vUv.x * 6.0, vUv.y * 3.0 - uClock * 4.0, 0.0));
    float ends = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    float a = (0.25 + edge + bands * 0.4) * flicker * ends * uPower;
    if (a < 0.003) discard;
    vec3 col = mix(uColor, uHot, clamp(1.0 - vUv.y + bands * 0.3, 0.0, 1.0));
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The column the core drives into the floor on each release. */
export function createBeamMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uPower: { value: 0 },
      uClock: { value: 0 },
      uGlow: { value: 3 },
      uColor: { value: new Color() },
      uHot: { value: new Color() },
    }),
    vertexShader: LIT_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
  });
  /** @param {object} s { power, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPower.value = s.power * g.opacity;
    u.uClock.value = s.clock;
    u.uGlow.value = c.beamGlow * g.glow;
    u.uColor.value.copy(getColor(c.coreColor));
    u.uHot.value.copy(getColor(c.beamColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The motes                                                            */
/* -------------------------------------------------------------------- */

const MOTE_VERTEX = /* glsl */ `
  attribute vec4 aSeed;       // angle, radius, phase, index
  uniform float uClock;
  uniform float uRadius;
  uniform float uRise;
  uniform float uSwirl;
  uniform float uSize;
  uniform float uCharge;
  uniform float uBurst;
  uniform float uFade;
  uniform float uCount;       // live fraction of the cloud
  uniform vec2  uResolution;
  varying float vAlpha;
  varying float vHot;

  void main() {
    if (aSeed.w >= uCount) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      vHot = 0.0;
      return;
    }
    float life = fract(aSeed.z + uClock * (0.22 + 0.2 * aSeed.y));
    float ang = aSeed.x * 6.2831853 + uClock * uSwirl * (0.6 + 0.8 * aSeed.y) + life * 2.0;
    // Charge cinches the cloud toward the core; a release throws it out.
    float rad = uRadius * mix(0.2, 1.0, aSeed.y) * (1.0 - 0.5 * life * uCharge) + uBurst * uRadius * 0.6 * aSeed.y;
    vec3 p = vec3(cos(ang) * rad, 0.08 + life * uRise * (0.6 + 0.8 * aSeed.x), sin(ang) * rad);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float env = sin(3.14159265 * life);
    vAlpha = env * uFade;
    vHot = aSeed.y;
    gl_PointSize = uSize * env * uResolution.y * projectionMatrix[1][1] * 0.5 / max(0.1, -mv.z);
  }
`;

const MOTE_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uGlobalGlow;
  varying float vAlpha;
  varying float vHot;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    float soft = exp(-d * 3.0);
    vec3 col = mix(uColor, uHot, soft * vHot);
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, soft * vAlpha);
  }
`;

/** GPU mote cloud. Every point is placed in the vertex stage. */
export function createMoteMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uRadius: { value: 3 },
      uRise: { value: 1.4 },
      uSwirl: { value: 1 },
      uSize: { value: 0.06 },
      uCharge: { value: 0 },
      uBurst: { value: 0 },
      uFade: { value: 1 },
      uCount: { value: 1 },
      uGlow: { value: 2 },
      uColor: { value: new Color() },
      uHot: { value: new Color() },
    }),
    vertexShader: MOTE_VERTEX,
    fragmentShader: MOTE_FRAGMENT,
  });
  /** @param {object} s { clock, radius, charge, burst, fade, capacity } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uRadius.value = s.radius;
    u.uRise.value = c.moteRise;
    u.uSwirl.value = c.moteSwirl;
    u.uSize.value = c.moteSize * g.particleSize;
    u.uCharge.value = s.charge;
    u.uBurst.value = s.burst;
    u.uFade.value = s.fade * g.opacity;
    u.uCount.value = Math.min(1, (c.moteCount * g.particleCount) / s.capacity);
    u.uGlow.value = c.moteGlow * g.glow;
    u.uColor.value.copy(getColor(c.etchColor));
    u.uHot.value.copy(getColor(c.moteColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The warp                                                             */
/* -------------------------------------------------------------------- */

const WARP_FRAGMENT = /* glsl */ `
  uniform float uWave;        // radius of the release pressure ring, 0..1
  uniform float uWidth;
  uniform float uStrength;
  uniform float uSwirl;
  uniform float uClock;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    float ring = exp(-pow((r - uWave) / max(uWidth, 0.01), 2.0));
    float swirl = uSwirl * (1.0 - smoothstep(0.2, 1.0, r));
    vec2 radial = q / max(r, 1e-3);
    vec2 dir = radial * ring + vec2(-q.y, q.x) * swirl * 0.6;
    vec3 np = vec3(q * 3.0 * uScale, uClock * 0.5);
    dir += vec2(snoise(np), snoise(np + vec3(7.1, 3.3, 1.9))) * 0.25 * (ring + swirl);
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uStrength * uShaderIntensity * mask * clamp(ring + swirl, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc. Opaque on purpose (`transparent: false`, so
 * NormalBlending writes straight through): the offset buffer wants the last
 * proxy's value, not a blend, and an opaque proxy keeps the expansion's
 * "transparent ⇒ VFX layer" routing from pulling it out of the warp pass.
 */
export function createWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWave: { value: 0 },
      uWidth: { value: 0.12 },
      uStrength: { value: 0 },
      uSwirl: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: WARP_FRAGMENT,
  });
  /** @param {object} s { wave, strength, swirl, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uWave.value = s.wave;
    u.uWidth.value = c.warpWidth;
    u.uStrength.value = s.strength * c.warpStrength * g.distortion;
    u.uSwirl.value = s.swirl;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
