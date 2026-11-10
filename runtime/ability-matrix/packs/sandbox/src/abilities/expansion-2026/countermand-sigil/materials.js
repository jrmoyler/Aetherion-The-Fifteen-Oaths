import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  MeshStandardMaterial,
  NormalBlending,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { patchOnBeforeCompile, replaceChunk } from '../../../utils/shaderPatch.js';
import config from './config.js';

/**
 * Countermand Sigil — the bespoke shaders. One four-stop arcane ramp runs
 * through every layer: white-hot core → pale orchid → saturated violet →
 * black-violet deep (`colorCore`, `colorTint`, `colorBody`, `colorDeep`).
 *
 *  - **the engraved glass** (`createEngravedMaterial`) — a real
 *    `MeshStandardMaterial` (sun-lit, shadowing, env reflections) patched with
 *    the rune work. Four roles share it: the obsidian *seal* (sixteen glyph
 *    cells engraved round the face, lit one by one clockwise from twelve as
 *    the verdict nears — the countdown is written on the seal itself), the
 *    silver *glyph ring* (its cut-through runes glow from their walls), the
 *    *bar* (a channel of chevrons that races at the lock) and the *writs*
 *    (a spiral groove and a hot tip). Grooves are darkened in the albedo and
 *    lit in the emission, so they read as cut, not painted. All four dissolve
 *    through noise with a burning edge.
 *  - **the iris** (`createIrisMaterial`) — the eye membrane filling the ring:
 *    swirling fbm ink, two counter-turning tick rings, and an almond slit
 *    pupil that narrows as the verdict nears and *looks* at the target the
 *    seal is watching. Collapses to a point at the lock.
 *  - **the aura** (`createAuraMaterial`) — an N·V-weighted volume shell round
 *    the seal: brightest where the view ray crosses most of it, so it reads
 *    as lit air, not a bubble.
 *  - **the brand** (`createBrandMaterial`) — the floor under the jurisdiction.
 *    Normal-blended so the deep stop really darkens the floor: charred glass,
 *    a voronoi crack network radiating from the seal's foot, the glowing
 *    slot the seal stands in, and a burned reticle under every writ.
 *  - **the lens** (`createLensMaterial`) — `LAYER.DISTORTION` proxy standing
 *    in the ring: inward pull while it watches, a pressure ring at the
 *    verdict.
 *
 * Every material reads `settings.countermandSigil` in `userData.sync(state)`.
 */

const ID = config.id;
/** Writs and countermand writs drawn per pool member (reticles on the brand). */
export const MAX_WRITS = 10;

const additive = (extra) => ({
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: AdditiveBlending,
  side: DoubleSide,
  toneMapped: false,
  ...extra,
});

const RAMP_GLSL = /* glsl */ `
  vec3 csRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 a = mix(uCore, uTint, smoothstep(0.0, 0.34, t));
    vec3 b = mix(a, uBody, smoothstep(0.30, 0.68, t));
    return mix(b, uDeep, smoothstep(0.64, 1.0, t));
  }
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
/* The engraved glass (seal, glyph ring, bar, writs)                     */
/* -------------------------------------------------------------------- */

const ROLE_INDEX = { seal: 0, glyph: 1, bar: 2, writ: 3 };

const ENGRAVE_VERTEX_HEAD = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vObjN;
`;

const ENGRAVE_FRAGMENT_HEAD = /* glsl */ `
  uniform float uFill;        // 0..1 rune cells lit, clockwise from twelve
  uniform float uCharge;      // 0..1 how close the verdict is
  uniform float uFlash;       // transient flare (plant, countermand, verdict)
  uniform float uDissolve;    // 0..1 noise dissolve
  uniform float uRuneGlow;
  uniform float uEdgeGlow;
  uniform float uFresnelGlow;
  uniform float uCells;
  uniform float uWidth;
  uniform float uClock;
  uniform float uNoiseScale;
  uniform float uSeed;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  varying vec3 vObj;
  varying vec3 vObjN;
  ${noiseGLSL}
  ${RAMP_GLSL}

  float csSeg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  // One glyph in a cell: three to five strokes picked by the cell's hash.
  float csGlyph(vec2 q, float id, float w) {
    float h1 = hash11(id * 7.31 + 1.7);
    float h2 = hash11(id * 3.17 + 9.2);
    float h3 = hash11(id * 5.53 + 4.4);
    float d = csSeg(q, vec2(0.5, 0.12), vec2(0.5, 0.88));                       // stave
    if (h1 > 0.35) d = min(d, csSeg(q, vec2(0.22, 0.78), vec2(0.78, 0.78)));   // bar
    if (h1 < 0.7)  d = min(d, csSeg(q, vec2(0.5, 0.5), vec2(0.82, 0.22)));     // branch
    if (h2 > 0.5)  d = min(d, csSeg(q, vec2(0.5, 0.5), vec2(0.18, 0.22)));
    if (h3 > 0.45) d = min(d, abs(length(q - vec2(0.5, 0.36)) - 0.15));        // eye
    else           d = min(d, csSeg(q, vec2(0.25, 0.3), vec2(0.75, 0.3)));
    return 1.0 - smoothstep(w, w + 0.035, d);
  }

  // Rune work for this role: x = groove (0..1), y = emission level (0..∞).
  vec2 csRunes() {
    vec3 p = vObj;
    float face = smoothstep(0.45, 0.8, abs(vObjN.z));
    #if CS_ROLE == 0
      // The seal: sixteen glyph cells in the band just inside the teeth.
      float r = length(p.xy);
      float a = atan(p.y, p.x);
      float clockA = fract(0.25 - a / 6.2831853);
      float cellF = clockA * uCells;
      float cell = floor(cellF);
      float band = smoothstep(0.765, 0.775, r) * (1.0 - smoothstep(0.905, 0.915, r));
      vec2 q = vec2(fract(cellF), (r - 0.775) / 0.13);
      float glyph = csGlyph(q, cell, uWidth) * band * face;
      // A continuous channel round the inner lip and a seam on the bevel.
      float lip = exp(-abs(r - 0.745) * 140.0) * face;
      float seam = exp(-abs(p.z) * 55.0) * (1.0 - face);
      float cellT = (cell + 0.5) / uCells;
      float lit = step(cellT, uFill);
      float lead = exp(-abs(cellT - uFill) * uCells * 1.6) * step(0.001, uFill);
      float level = glyph * (0.18 + lit * 0.9 + lead * 1.6) * uRuneGlow
                  + lip * (0.35 + uCharge) * uRuneGlow * 0.6
                  + seam * uEdgeGlow * (0.4 + uCharge);
      return vec2(max(glyph, lip * 0.6), level);
    #elif CS_ROLE == 1
      // The silver glyph ring: the cut-through runes glow from their walls.
      float r = length(p.xy);
      float wall = (1.0 - face) * smoothstep(0.545, 0.56, r) * (1.0 - smoothstep(0.69, 0.705, r));
      float level = wall * (0.5 + uCharge * 1.5) * uRuneGlow;
      return vec2(0.0, level);
    #elif CS_ROLE == 2
      // The bar: a centre channel of chevrons racing toward the waist.
      float chan = 1.0 - smoothstep(0.022, 0.032, abs(p.y));
      float chev = smoothstep(0.55, 0.7, fract(abs(p.x) * 4.0 + abs(p.y) * 6.0 + uClock * (1.0 + uCharge * 6.0)));
      float groove = face * chan * (0.6 + 0.4 * chev);
      float level = groove * (0.3 + uCharge * 1.4) * uRuneGlow;
      return vec2(groove, level);
    #else
      // The writ: a spiral groove up the shaft, the tip white-hot.
      float a = atan(p.z, p.x) / 6.2831853;
      float spiral = smoothstep(0.86, 0.94, fract(a * 2.0 + p.y * 5.0 - uClock * 0.5)) * step(p.y, 0.72);
      float tip = exp(-p.y * 9.0);
      float head = smoothstep(0.78, 0.82, p.y) * (1.0 - smoothstep(0.86, 0.9, p.y));
      float level = (spiral * 0.9 + tip * 2.2 + head * 0.7) * (0.4 + uCharge) * uRuneGlow;
      return vec2(spiral * 0.8, level);
    #endif
  }

  vec2 csDissolve() {
    if (uDissolve <= 0.0) return vec2(1.0, 0.0);
    float n = snoise01(vObj * 3.1 * uNoiseScale + vec3(uSeed));
    float m = step(uDissolve, n);
    // A burning lip just above the cut.
    float edge = (1.0 - smoothstep(0.0, 0.08, n - uDissolve)) * m;
    return vec2(m, edge);
  }
`;

const ENGRAVE_CLIP = /* glsl */ `
  #include <clipping_planes_fragment>
  vec2 csCut = csDissolve();
  if (csCut.x < 0.5) discard;
`;

const ENGRAVE_COLOR = /* glsl */ `
  #include <color_fragment>
  vec2 csRune = csRunes();
  {
    // Glass grain and cut grooves: dark where the surface is carved away.
    float grain = fbm3(vObj * 9.0 * uNoiseScale) - 0.5;
    diffuseColor.rgb *= 0.9 + grain * 0.35;
    diffuseColor.rgb *= 1.0 - csRune.x * 0.75;
  }
`;

const ENGRAVE_EMISSIVE = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float heat = clamp(csRune.y, 0.0, 3.0);
    // Low levels sit in the saturated body, high levels climb to the core.
    vec3 runeCol = csRamp(1.0 - clamp(0.35 + heat * 0.32, 0.0, 1.0)) * (1.0 + step(1.4, heat) * heat * 0.6);
    totalEmissiveRadiance += runeCol * csRune.y;
    float nv = abs(dot(normalize(normal), normalize(vViewPosition)));
    float rim = pow(1.0 - nv, 3.0);
    totalEmissiveRadiance += uTint * rim * uFresnelGlow * (0.35 + uCharge * 0.65);
    totalEmissiveRadiance += csRamp(0.25) * uFlash * (0.25 + rim);
    totalEmissiveRadiance += uCore * csCut.y * 4.0;
  }
`;

/**
 * The engraved glass, lit and shadowing.
 * @param {'seal'|'glyph'|'bar'|'writ'} role
 */
export function createEngravedMaterial(role = 'seal') {
  const material = new MeshStandardMaterial({
    color: 0x1d0b2a,
    roughness: 0.16,
    metalness: 0.35,
    side: FrontSide,
  });
  const uniforms = {
    uFill: { value: 0 },
    uCharge: { value: 0 },
    uFlash: { value: 0 },
    uDissolve: { value: 0 },
    uRuneGlow: { value: 1 },
    uEdgeGlow: { value: 1 },
    uFresnelGlow: { value: 1 },
    uCells: { value: 16 },
    uWidth: { value: 0.07 },
    uClock: { value: 0 },
    uNoiseScale: { value: 1 },
    uSeed: { value: ROLE_INDEX[role] * 3.7 },
    uCore: { value: new Color() },
    uTint: { value: new Color() },
    uBody: { value: new Color() },
    uDeep: { value: new Color() },
  };
  material.userData.uniforms = uniforms;
  const define = `#define CS_ROLE ${ROLE_INDEX[role] ?? 0}\n`;
  patchOnBeforeCompile(material, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = replaceChunk(shader.vertexShader, '#include <common>', `#include <common>\n${ENGRAVE_VERTEX_HEAD}`);
    shader.vertexShader = replaceChunk(shader.vertexShader, '#include <begin_vertex>',
      '#include <begin_vertex>\n  vObj = position; vObjN = normal;');
    shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <common>', `#include <common>\n${define}${ENGRAVE_FRAGMENT_HEAD}`);
    shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <clipping_planes_fragment>', ENGRAVE_CLIP);
    shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <color_fragment>', ENGRAVE_COLOR);
    shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <emissivemap_fragment>', ENGRAVE_EMISSIVE);
  }, `countermand-sigil-engraved-${role}`);

  /** @param {object} s { fill, charge, flash, dissolve, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = uniforms;
    const silver = role === 'glyph' || role === 'writ';
    material.color.copy(getColor(silver ? c.silverColor : c.obsidianColor));
    material.roughness = silver ? c.silverRoughness : c.obsidianRoughness;
    material.metalness = silver ? c.silverMetalness : c.obsidianMetalness;
    material.opacity = 1;
    const glow = g.glow * g.shaderIntensity;
    u.uFill.value = s.fill;
    u.uCharge.value = s.charge;
    u.uFlash.value = s.flash * g.glow;
    u.uDissolve.value = s.dissolve;
    u.uRuneGlow.value = (role === 'bar' ? c.barGlow : role === 'writ' ? c.writGlow : c.runeGlow) * glow;
    u.uEdgeGlow.value = c.edgeGlow * glow;
    u.uFresnelGlow.value = c.fresnelGlow * g.fresnel * g.glow;
    u.uCells.value = Math.max(4, Math.round(c.runeCells));
    u.uWidth.value = c.runeWidth;
    u.uClock.value = s.clock;
    u.uNoiseScale.value = g.noiseFrequency;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The iris                                                             */
/* -------------------------------------------------------------------- */

const IRIS_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uCharge;      // 0..1 toward the verdict
  uniform float uPupil;       // slit half-width at rest (× radius)
  uniform vec2  uLook;        // where the pupil looks (−1..1, the ring's plane)
  uniform float uCollapse;    // 0..1 the membrane pinches to a point at the lock
  uniform float uFlash;
  uniform float uFade;
  uniform float uGlow;
  uniform float uSwirl;
  uniform float uNoise;
  uniform float uNoiseScale;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}
  ${RAMP_GLSL}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float keep = max(1.0 - uCollapse, 0.02);
    p /= keep;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    // Ink: swirled fbm, faster toward the centre (differential rotation).
    float sw = a + uClock * uSwirl * (0.4 + 0.9 / (0.35 + r)) ;
    vec2 sp = vec2(cos(sw), sin(sw)) * r;
    float ink = fbm3(vec3(sp * 2.6 * uNoiseScale, uClock * 0.22));
    ink = mix(0.5, ink, uNoise);
    // Two tick rings turning against each other.
    float ticks1 = pow(abs(sin(a * 18.0 + uClock * 0.9)), 24.0) * exp(-abs(r - 0.86) * 40.0);
    float ticks2 = pow(abs(sin(a * 11.0 - uClock * 1.4)), 18.0) * exp(-abs(r - 0.66) * 46.0);
    // The almond slit pupil, looking toward the watched target.
    vec2 q = p - uLook * 0.32;
    float w = uPupil * (1.0 - uCharge * 0.72) + 0.012;
    float h = 0.62 + 0.08 * uCharge;
    float almond = abs(q.x) / max(w * sqrt(max(0.0, 1.0 - (q.y * q.y) / (h * h))), 1e-3);
    float pupil = (1.0 - smoothstep(0.65, 1.0, almond)) * step(abs(q.y), h);
    float irisRing = exp(-abs(length(q * vec2(1.0, 0.75)) - 0.36) * 14.0);
    float edge = smoothstep(0.78, 1.0, r);
    float body = (1.0 - edge) * (0.35 + ink * 0.9);
    float level = body * 0.55 + irisRing * (0.5 + uCharge) + (ticks1 + ticks2) * 0.9 * uShaderIntensity + pupil * 2.4;
    // Ramp: rim deep → body → tint → core at the pupil.
    float t = clamp(1.0 - (ink * 0.35 + irisRing * 0.35 + pupil * 0.9 + (1.0 - r) * 0.25), 0.0, 1.0);
    vec3 col = csRamp(t) * level;
    col += uCore * pupil * (1.5 + uCharge * 2.0);
    col += uCore * uFlash * (1.0 - r);
    float alpha = clamp(level, 0.0, 1.0) * (1.0 - smoothstep(0.92, 1.0, r)) * uFade;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow * uFade, alpha);
  }
`;

/** The eye membrane inside the ring. Additive, double-sided. */
export function createIrisMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uCharge: { value: 0 },
      uPupil: { value: 0.22 },
      uLook: { value: new Vector2() },
      uCollapse: { value: 0 },
      uFlash: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1 },
      uSwirl: { value: 1 },
      uNoise: { value: 1 },
      uNoiseScale: { value: 1 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: IRIS_FRAGMENT,
  });
  /** @param {object} s { clock, charge, lookX, lookY, collapse, flash, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uCharge.value = s.charge;
    u.uPupil.value = c.pupilWidth;
    u.uLook.value.set(s.lookX, s.lookY);
    u.uCollapse.value = s.collapse;
    u.uFlash.value = s.flash;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.irisGlow * g.glow;
    u.uSwirl.value = c.irisSwirl * g.noiseSpeed;
    u.uNoise.value = Math.min(1.5, g.noiseStrength);
    u.uNoiseScale.value = g.noiseFrequency;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The aura                                                             */
/* -------------------------------------------------------------------- */

const AURA_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vObj;
  void main() {
    vObj = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const AURA_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uPower;
  uniform float uFade;
  uniform float uFresnel;
  uniform float uNoiseScale;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vObj;
  ${noiseGLSL}
  ${RAMP_GLSL}
  void main() {
    float nv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    // Volume brightness: the view ray crosses most air through the middle.
    float body = pow(nv, 2.6);
    float rim = pow(1.0 - nv, 4.0) * 0.35 * uFresnel;
    float flow = fbm3(vObj * 2.2 * uNoiseScale + vec3(0.0, -uClock * 0.6, uClock * 0.2));
    float level = (body * (0.55 + flow * 0.9) + rim) * uPower;
    vec3 col = csRamp(0.62 - body * 0.4 - flow * 0.12) * level;
    gl_FragColor = vec4(col * uGlobalGlow * uFade, clamp(level, 0.0, 1.0) * uFade);
  }
`;

/** N·V volume shell round the seal. Additive, back faces culled. */
export function createAuraMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uPower: { value: 0 },
      uFade: { value: 1 },
      uFresnel: { value: 1 },
      uNoiseScale: { value: 1 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: AURA_VERTEX,
    fragmentShader: AURA_FRAGMENT,
  });
  /** @param {object} s { clock, power, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uPower.value = s.power * c.auraGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    u.uFresnel.value = g.fresnel;
    u.uNoiseScale.value = g.noiseFrequency;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The brand (floor)                                                    */
/* -------------------------------------------------------------------- */

const BRAND_FRAGMENT = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uRadius;
  uniform float uChar;        // 0..1 the floor burns in under the jurisdiction
  uniform float uHeat;        // seam heat: rises with the watch, flares at the verdict, cools
  uniform float uDissolve;
  uniform vec2  uSlotDir;     // the seal's plane on the floor
  uniform float uSlotLen;     // half-length of the slot (m)
  uniform float uSlotWidth;
  uniform float uSlotOpen;    // 0..1 the slot tears open from the centre
  uniform vec3  uMarks[${MAX_WRITS}]; // (x, z, strength) per writ
  uniform float uMarkRadius;
  uniform float uCrackScale;
  uniform float uCharStrength;
  uniform float uGlow;
  uniform float uClock;
  uniform float uOpacity;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}

  float csEdge(vec2 p) {
    // F2 − F1 by brute force over the 3×3 neighbourhood: crack lines.
    vec2 n = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
    return d2 - d1;
  }

  void main() {
    vec2 P = vWorld.xz - uCentre.xz;
    float r = length(P);
    float rn = r / max(uRadius, 0.01);
    if (rn > 1.15) discard;
    // Exit: the brand dissolves from the rim in.
    vec2 dm = dissolveMask(snoise01(vec3(P * 0.9, 3.1)) * 0.7 + (1.0 - rn) * 0.3, uDissolve, 0.06);
    if (dm.x < 0.5) discard;

    float wob = snoise(vec3(P * 1.3, 0.7)) * 0.08;
    float disc = 1.0 - smoothstep(0.82 + wob, 1.02 + wob, rn);

    // The slot: a straight glowing gash along the seal's plane.
    vec2 perp = vec2(-uSlotDir.y, uSlotDir.x);
    float along = abs(dot(P, uSlotDir));
    float across = abs(dot(P, perp));
    float len = uSlotLen * uSlotOpen;
    float slotMask = (1.0 - smoothstep(len - 0.05, len + 0.12, along));
    float slot = slotMask * (1.0 - smoothstep(uSlotWidth * 0.5, uSlotWidth * 0.5 + 0.05, across));
    float lip = slotMask * exp(-max(0.0, across - uSlotWidth * 0.5) * 7.0);

    // Cracks radiate from the slot: dense near it, thinning to the rim.
    vec2 cp = P * uCrackScale / 2.2;
    cp += vec2(snoise(vec3(P * 0.8, 1.0)), snoise(vec3(P * 0.8, 5.0))) * 0.35;
    float crack = 1.0 - smoothstep(0.0, 0.07, csEdge(cp));
    float reach = smoothstep(1.05, 0.15, rn + across * 0.12 / max(uRadius, 0.01)) * uSlotOpen;
    crack *= reach;

    // Reticles burned under the writs.
    float marks = 0.0;
    for (int i = 0; i < ${MAX_WRITS}; i++) {
      vec3 m = uMarks[i];
      if (m.z <= 0.0) continue;
      vec2 d = vWorld.xz - m.xy;
      float dl = length(d);
      float ring = exp(-abs(dl - uMarkRadius) * 18.0);
      float inner = exp(-abs(dl - uMarkRadius * 0.55) * 26.0) * step(0.5, fract(atan(d.y, d.x) * 1.273 + uClock * 0.2));
      float cross = (exp(-abs(d.x) * 30.0) + exp(-abs(d.y) * 30.0)) * (1.0 - smoothstep(uMarkRadius * 0.2, uMarkRadius * 0.45, dl)) * step(uMarkRadius * 0.12, dl);
      marks += (ring + inner * 0.7 + cross * 0.6) * m.z;
    }

    float heat = uHeat * uShaderIntensity;
    float glowLevel = slot * (1.2 + heat * 1.6) + lip * 0.35 * (0.5 + heat)
                    + crack * (0.25 + heat * 1.5)
                    + marks * 0.8;
    glowLevel *= uGlow;
    // Char: deep stop, mottled, strongest under the seal.
    float charN = 0.75 + 0.25 * fbm3(vec3(P * 0.7, 2.0));
    float charA = disc * uChar * uCharStrength * charN;
    vec3 glowCol = csRamp(1.0 - clamp(0.3 + heat * 0.35 + slot * 0.35, 0.0, 1.0));
    vec3 col = mix(uDeep * 0.6, glowCol * (1.0 + slot * heat * 2.0), clamp(glowLevel, 0.0, 1.0));
    col += uCore * dm.y * 2.0;
    float alpha = clamp(max(charA, glowLevel * uChar), 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(col * uGlobalGlow, alpha);
  }
`;

/** The branded floor. Normal-blended so it darkens as well as glows. */
export function createBrandMaterial() {
  const marks = [];
  for (let i = 0; i < MAX_WRITS; i++) marks.push(new Vector3());
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uRadius: { value: 3.6 },
      uChar: { value: 0 },
      uHeat: { value: 0 },
      uDissolve: { value: 0 },
      uSlotDir: { value: new Vector2(1, 0) },
      uSlotLen: { value: 2 },
      uSlotWidth: { value: 0.3 },
      uSlotOpen: { value: 0 },
      uMarks: { value: marks },
      uMarkRadius: { value: 0.7 },
      uCrackScale: { value: 2 },
      uCharStrength: { value: 0.8 },
      uGlow: { value: 1 },
      uClock: { value: 0 },
      uOpacity: { value: 1 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: BRAND_FRAGMENT,
  });
  /**
   * @param {object} s { cx, cz, radius, char, heat, dissolve, slotX, slotZ,
   *   slotLen, slotOpen, clock, marks: Float32Array(3·MAX_WRITS) }
   */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.set(s.cx, 0, s.cz);
    u.uRadius.value = s.radius;
    u.uChar.value = s.char;
    u.uHeat.value = s.heat;
    u.uDissolve.value = s.dissolve;
    u.uSlotDir.value.set(s.slotX, s.slotZ);
    u.uSlotLen.value = s.slotLen;
    u.uSlotWidth.value = c.slotWidth;
    u.uSlotOpen.value = s.slotOpen;
    for (let i = 0; i < MAX_WRITS; i++) u.uMarks.value[i].set(s.marks[i * 3], s.marks[i * 3 + 1], s.marks[i * 3 + 2]);
    u.uMarkRadius.value = c.markRadius;
    u.uCrackScale.value = c.crackScale * g.noiseFrequency;
    u.uCharStrength.value = c.floorChar;
    u.uGlow.value = c.floorGlow * g.glow;
    u.uClock.value = s.clock;
    u.uOpacity.value = g.opacity;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens                                                             */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uPull;        // inward pull through the ring while it watches
  uniform float uShock;       // pressure ring strength at the verdict
  uniform float uWave;        // its radius, 0..1
  uniform float uClock;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    vec2 radial = q / max(r, 1e-3);
    vec2 tangent = vec2(-radial.y, radial.x);
    float body = 1.0 - smoothstep(0.2, 0.75, r);
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    vec3 np = vec3(q * 2.2 * uScale, uClock * 0.5);
    vec2 n = vec2(snoise(np), snoise(np + vec3(4.1, 2.7, 9.3))) * 0.25;
    vec2 dir = (-radial * 0.8 + tangent * 0.35 + n) * body * uPull + (radial + n) * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uPull + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` proxy standing in the ring. Opaque on purpose: the
 * offset buffer wants the proxy's own value, and an opaque proxy keeps the
 * expansion's "transparent ⇒ VFX layer" routing from pulling it out of the
 * warp pass.
 */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uPull: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { pull, shock, wave, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPull.value = s.pull * c.lensPull * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
