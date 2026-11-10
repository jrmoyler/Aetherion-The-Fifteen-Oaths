import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { frame } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { WEAVE_LOOK, WEAVE_STYLES } from './WeaveLook.js';
import { weaveExit } from './WeaveExit.js';

/**
 * WeaveShaders — the bespoke GLSL of the weave family and the per-draw sync
 * that keeps it live.
 *
 * ## One material per style, one state per draw
 *
 * Materials are pooled per weave style (see `WeaveHeroGeometry`), so three
 * anchors of the same weave share one program and one uniform block. What
 * differs between them — how far each has burnt up out of its sigil, how close
 * it is to expiring, how wounded it is — is written by an `onBeforeRender`
 * hook immediately before *that* object draws, followed by
 * `uniformsNeedUpdate`, which makes three re-upload the block for the next
 * draw. Every hook also re-reads `WEAVE_LOOK` and `settings.global`, which is
 * what makes every editor value live on a weave that is already standing.
 *
 * The per-object state is a plain record in the `WEAVE_FX` WeakMap rather
 * than in `userData`, so `Object3D#toJSON` (used by the tests to fingerprint
 * rigs) never walks into the presentation, and a pruned mesh's record is
 * collected with it.
 *
 * ## Clocks
 *
 * Animated GLSL reads `animClock`: the presentation's `terrainTime` box
 * (combat seconds, deterministic, pinned to zero under
 * `prefers-reduced-motion`) times `uAnim`, one uniform box shared by every
 * weave material and set from `settings.global.animationSpeed`. Reveal and
 * cue progress come from combat ticks, so pausing the sandbox freezes a
 * reveal half-woven instead of letting it finish behind the pause.
 *
 * ## Globals
 *
 * Every hook folds the matching `settings.global.*` in: `glow` and
 * `shaderIntensity` on every emissive layer, `opacity`, `fresnel`,
 * `noiseStrength` × `turbulence` / `noiseFrequency` / `noiseSpeed` on the
 * noise, `particleCount` / `particleSize` / `particleSpeed` /
 * `particleLifetime` on the point systems, `distortion` on the shimmer and
 * `explosionIntensity` on the cue layers.
 *
 * ## Exit
 *
 * Anchor and link layers read `weaveExit(root)` (see `WeaveExit`) into
 * `uExit`: 1 while standing, falling to 0 as the group burns out. The ribbon,
 * sigil and trail dissolve through noise with a hot rim (`burnMask`); the
 * point systems and the shimmer fade with it.
 *
 * ## The programs
 *
 *  - **ribbon** — the hero helix and link braid. Noise-broken filaments with a
 *    per-style signature (fire flickers, frost steps, storm strikes in
 *    segments, water swells, earth grinds, crystal glints, wind streaks), a
 *    fresnel lift, a burning reveal front, and an expiry gutter.
 *  - **sigil** — the ground rosette: soft strokes, a rune rim whose lit arc is
 *    the anchor's remaining life, voronoi cracking as the anchor is damaged.
 *  - **motes / sparks / anchor motes** — GPU point systems; the shader places
 *    every point from a fixed seed, so their capacity is fixed and nothing is
 *    simulated on the CPU.
 *  - **trail** — the link's ground treatment in world-space noise.
 *  - **shock / beam / flood** — the cue layers, each fading on its own cue age
 *    so nothing pops when the presentation prunes it.
 *  - **shimmer** — a screen-space distortion proxy on `LAYER.DISTORTION`.
 */

/** Per-object fx records: Object3D → { view, start, style, kind, ... }. */
export const WEAVE_FX = new WeakMap();

const STYLE_INDEX = Object.fromEntries(WEAVE_STYLES.map((s, i) => [s, i]));
// Precomputed palette keys, so the per-draw sync never builds a string.
const PALETTE = Object.fromEntries(WEAVE_STYLES.map((s) => [s, [`${s}A`, `${s}B`, `${s}C`, `${s}D`]]));
// How hard each style warps the air above its pylon (fire boils, earth barely).
const SHIMMER_WEIGHT = { fire: 1, frost: 0.35, storm: 0.6, water: 0.45, earth: 0.25, crystal: 0.5, wind: 0.9 };

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** `settings.global.animationSpeed`, shared by identity with every weave material. */
const ANIM = { value: 1 };

/** Emissive multiplier common to every lit-by-itself layer. */
const glowOf = (g) => g.glow * g.shaderIntensity;

/**
 * Burn-out mask for the graceful exit. `dissolveMask()` from the common lib
 * keeps fragments above the threshold; its edge term is always zero
 * (smoothstep − step never goes positive), so the hot rim just above the
 * threshold is computed here, and suppressed while nothing is burning.
 */
const BURN_GLSL = /* glsl */ `
  vec2 burnMask(float n, float threshold, float width) {
    vec2 d = dissolveMask(n, threshold, width);
    d.y = d.x * (1.0 - smoothstep(threshold, threshold + width, n)) * step(0.001, threshold);
    return d;
  }
`;

/* ------------------------------------------------------------------------ */
/* Shared uniform plumbing                                                   */
/* ------------------------------------------------------------------------ */

/** Gradient uniforms for one style, seeded from the look so tests see tints. */
function paletteUniforms(style) {
  const [a, b, c, d] = PALETTE[style];
  return {
    uCore: { value: new Color(WEAVE_LOOK[a]) },
    tint: { value: new Color(WEAVE_LOOK[b]) },
    uEdge: { value: new Color(WEAVE_LOOK[c]) },
    uTail: { value: new Color(WEAVE_LOOK[d]) },
    character: { value: STYLE_INDEX[style] ?? 0 }
  };
}

/** Copy the live palette into a material's gradient uniforms (no allocation). */
function paint(u, style) {
  const [a, b, c, d] = PALETTE[style] ?? PALETTE.fire;
  u.uCore.value.copy(getColor(WEAVE_LOOK[a]));
  u.tint.value.copy(getColor(WEAVE_LOOK[b]));
  u.uEdge.value.copy(getColor(WEAVE_LOOK[c]));
  u.uTail.value.copy(getColor(WEAVE_LOOK[d]));
}

/** Seconds of combat time since the record was attached. */
function age(rec) {
  const m = rec.view.s.m;
  return (m.tick - rec.start) / m.budget.tickRate;
}

/**
 * The live anchor record behind an fx record. Anchors are built before the
 * presentation stores their item, so the record finds its item lazily, once,
 * by its root group and keeps the reference (the anchor object itself is the
 * combat record, mutated in place as it takes damage).
 */
function anchorOf(rec) {
  if (rec.anchor) return rec.anchor;
  if (!rec.root) return null;
  for (const item of rec.view.items.values()) {
    if (item.g !== rec.root) continue;
    rec.anchor = item.data;
    const preset = rec.view.s.preset(item.data);
    rec.lifeTicks = Math.max(1, rec.view.s.t(preset?.life ?? 12));
    rec.maxHealth = Math.max(1e-6, preset?.anchorHealth ?? 2);
    return rec.anchor;
  }
  return null;
}

/** 0 → healthy, 1 → about to expire: the expiry gutter of one anchor. */
function warnOf(view, anchor) {
  if (!anchor || !Number.isFinite(anchor.expiresTick) || WEAVE_LOOK.warnTime <= 0) return 0;
  const remaining = (anchor.expiresTick - view.s.m.tick) / view.s.m.budget.tickRate;
  return 1 - clamp01(remaining / WEAVE_LOOK.warnTime);
}

/** Expiry gutter for whatever this record belongs to (anchor or link). */
function warning(rec) {
  if (rec.link) {
    const anchors = rec.view.s.weave.anchors, ids = rec.link.anchorIds;
    if (!ids) return 0;
    return Math.max(warnOf(rec.view, anchors.get(ids[0])), warnOf(rec.view, anchors.get(ids[1])));
  }
  return warnOf(rec.view, anchorOf(rec));
}

/** Reveal progress 0..1 (always 1 under reduced motion). */
function reveal(rec) {
  return rec.view.reducedMotion ? 1 : clamp01(age(rec) / Math.max(1e-3, WEAVE_LOOK.revealTime));
}

/** Attach an fx record and its sync hook to a mesh or point system. */
export function attachWeaveFx(object, view, record) {
  record.view = view;
  record.start = view.s.m.tick;
  WEAVE_FX.set(object, record);
  object.onBeforeRender = HOOKS[record.kind];
  return object;
}

/* ------------------------------------------------------------------------ */
/* Ribbon                                                                    */
/* ------------------------------------------------------------------------ */

const RIBBON_VERTEX = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float uSway;
  attribute float aStrand;
  varying vec2 vUv;
  varying float vStrand;
  varying vec3 vNormalV;
  varying vec3 vViewPos;

  void main() {
    vUv = uv;
    vStrand = aStrand;
    vec3 p = position;
    // Lateral breathing, zero at both ends and capped at 4 cm so a link's
    // ribbon can never leave the collision capsule it decorates.
    p.x += min(uSway, 0.04) * sin(uv.x * 22.0 - animClock * 4.0 + aStrand * 2.0) * sin(uv.x * 3.14159265);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewPos = -mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const RIBBON_FRAGMENT = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float character;
  uniform float uReveal;
  uniform float uWarn;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uFlow;
  uniform float uFilaments;
  uniform float uNoise;
  uniform float uNoiseScale;
  uniform float uEdgeSoft;
  uniform float uFresnel;
  uniform float uExit;
  uniform vec3 uCore;
  uniform vec3 tint;
  uniform vec3 uEdge;
  uniform vec3 uTail;
  varying vec2 vUv;
  varying float vStrand;
  varying vec3 vNormalV;
  varying vec3 vViewPos;

  ${noiseGLSL}
  ${commonGLSL}
  ${BURN_GLSL}

  void main() {
    float across = abs(vUv.y * 2.0 - 1.0);
    float soft = 1.0 - smoothstep(1.0 - max(uEdgeSoft, 0.02), 1.0, across);
    float n = snoise(vec3(vUv.x * uNoiseScale - animClock * uFlow * 0.3, vStrand * 4.7, character * 3.1 + animClock * 0.2));
    float phase = vUv.x * uFilaments - animClock * uFlow + vStrand * 1.7 + n * uNoise * 2.5;
    float filament = pow(max(0.0, sin(phase)), 4.0);

    // Each identity reshapes the same filament field.
    int c = int(character + 0.5);
    if (c == 0) {
      // Fire: hotter toward the tip, with licking noise tongues.
      filament = filament * (0.6 + 0.8 * vUv.x)
        + 0.3 * smoothstep(0.55, 0.95, snoise01(vec3(vUv * vec2(9.0, 2.0), animClock * 2.0)));
    } else if (c == 1) {
      // Frost: quantised steps, ice growing in facets rather than flowing.
      filament = 0.7 * pow(max(0.0, sin(floor(phase * 1.5) / 1.5)), 2.0) + 0.3 * step(0.86, fract(phase * 0.5));
    } else if (c == 2) {
      // Storm: whole segments strike at once, re-rolled 14 times a second.
      float strike = step(0.72, hash11(floor(animClock * 14.0) + floor(vUv.x * 10.0) * 7.0 + vStrand * 13.0));
      filament = filament * 0.5 + strike;
    } else if (c == 3) {
      // Water: a slow swell instead of discrete filaments.
      filament = 0.5 + 0.5 * sin(phase * 0.5 + sin(vUv.x * 7.0 + animClock * 1.5) * 1.5);
    } else if (c == 4) {
      // Earth: broad, heavy bands grinding past.
      filament = smoothstep(0.35, 0.8, 1.0 - abs(fract(phase * 0.25) * 2.0 - 1.0)) * (0.6 + 0.4 * n);
    } else if (c == 5) {
      // Crystal: razor glints plus sparse facet flashes.
      filament = pow(max(0.0, sin(phase)), 10.0) + 0.35 * step(0.9, fract(vUv.x * 6.0 + animClock * 0.4));
    } else {
      // Wind: long saw-tooth streaks with trailing tails.
      float s = fract(phase * 0.2);
      filament = smoothstep(0.0, 1.0, s) * (1.0 - s) * 3.0;
    }
    filament = clamp(filament, 0.0, 1.5);

    // Reveal: a ragged burning front climbs (anchor) or runs along (link).
    float front = uReveal * 1.15 - vUv.x + n * 0.05;
    float shown = smoothstep(0.0, 0.06, front);
    float burn = (1.0 - smoothstep(0.0, 0.1, abs(front - 0.04))) * (1.0 - smoothstep(0.85, 1.0, uReveal));

    float rim = fresnelTerm(vViewPos, vNormalV, 2.0, uFresnel);
    // The expiry gutter: a dimming flicker that deepens as the end nears.
    float gutter = 1.0 - uWarn * (0.5 + 0.5 * sin(animClock * 17.0 + vUv.x * 5.0));

    // Exit: the ribbon burns away through coarse noise, leaving a hot rim.
    vec2 gone = burnMask(snoise01(vec3(vUv * vec2(7.0, 2.0), vStrand + character * 1.3)), (1.0 - uExit) * 1.05, 0.09);

    float f = min(filament, 1.0);
    vec3 col = gradient4(uCore, tint, uEdge, uTail, across * 0.75 + (1.0 - f) * 0.35);
    col *= (0.55 + 1.2 * filament + 0.35 * rim) * uGlow * gutter;
    col += uCore * (burn * 2.5 + gone.y * 3.0) * uGlow;
    float alpha = (soft * (0.32 + 0.68 * f) * uOpacity * shown * gutter + burn * soft) * gone.x + gone.y * soft;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export function createWeaveRibbonMaterial(style, clock) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      ...paletteUniforms(style),
      uReveal: { value: 1 },
      uWarn: { value: 0 },
      uOpacity: { value: WEAVE_LOOK.ribbonOpacity },
      uGlow: { value: WEAVE_LOOK.ribbonGlow },
      uFlow: { value: WEAVE_LOOK.ribbonFlow },
      uFilaments: { value: WEAVE_LOOK.ribbonFilaments },
      uNoise: { value: WEAVE_LOOK.ribbonNoise },
      uNoiseScale: { value: WEAVE_LOOK.ribbonNoiseScale },
      uSway: { value: WEAVE_LOOK.ribbonSway },
      uEdgeSoft: { value: WEAVE_LOOK.ribbonEdge },
      uFresnel: { value: 1 },
      uExit: { value: 1 }
    },
    vertexShader: RIBBON_VERTEX,
    fragmentShader: RIBBON_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false
  });
}

function ribbonHook(renderer, scene, camera, geometry, material) {
  const rec = WEAVE_FX.get(this);
  if (!rec) return;
  const c = WEAVE_LOOK, g = settings.global, u = material.uniforms;
  ANIM.value = g.animationSpeed;
  u.uReveal.value = reveal(rec);
  u.uWarn.value = warning(rec) * c.warnFlicker;
  u.uExit.value = weaveExit(rec.root);
  u.uOpacity.value = c.ribbonOpacity * g.opacity;
  u.uGlow.value = c.ribbonGlow * glowOf(g);
  u.uFlow.value = c.ribbonFlow * g.noiseSpeed;
  u.uFilaments.value = c.ribbonFilaments;
  u.uNoise.value = c.ribbonNoise * g.noiseStrength * g.turbulence;
  u.uNoiseScale.value = c.ribbonNoiseScale * g.noiseFrequency;
  // Turbulence also stirs the sway, still capped at the capsule's 4 cm.
  u.uSway.value = Math.min(0.04, c.ribbonSway * g.turbulence);
  u.uEdgeSoft.value = c.ribbonEdge;
  u.uFresnel.value = g.fresnel;
  paint(u, rec.style);
  material.uniformsNeedUpdate = true;
}

/* ------------------------------------------------------------------------ */
/* Point systems                                                             */
/* ------------------------------------------------------------------------ */

const POINT_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 tint;
  uniform float uOpacity;
  uniform float uGlow;
  varying float vFade;
  varying float vHeat;

  void main() {
    float r = length(gl_PointCoord - vec2(0.5));
    float disk = 1.0 - smoothstep(0.08, 0.5, r);
    float alpha = disk * vFade * uOpacity;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(mix(tint, uCore, vHeat) * (1.1 + vHeat) * uGlow, alpha);
  }
`;

/**
 * Link motes (`spark = false`) scroll along the braid like the original
 * twenty; link sparks (`spark = true`) are the second system, behaving per
 * style: fire embers rise, frost rime drifts down, storm sparks jump rails,
 * water drips, earth grit hops, crystal glints hang and twinkle, wind streaks.
 * Lateral reach is ≤ 0.22 local units, i.e. ≤ 0.35 × width once the link
 * scales the box, so no point ever leaves the capsule.
 */
const LINK_POINTS_VERTEX = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float character;
  uniform float uSize;
  uniform float uSpeed;
  uniform float uScatter;
  uniform float uSpark;
  uniform float uReveal;
  uniform float uExit;
  uniform float uLifeRate;
  varying float vFade;
  varying float vHeat;

  ${noiseGLSL}

  void main() {
    vec3 p = position;
    int c = int(character + 0.5);
    if (uSpark < 0.5) {
      // Motes: ride the braid end to end, wrapping; one pass is one life.
      p.z = fract(p.z + 0.5 + animClock * 0.3 * uSpeed * uLifeRate) - 0.5;
      p.x += 0.025 * sin(animClock * 4.0 + position.z * 31.0);
      vFade = sin(3.14159265 * (p.z + 0.5));
      vHeat = 0.35;
    } else {
      float seed = position.y;
      float life = fract(position.z + animClock * (0.6 + 0.8 * seed) * uSpeed * uLifeRate);
      p.z = fract(position.z * 7.31 + seed) - 0.5;
      float lat = position.x * 0.22 * uScatter;
      float y = 0.0;
      if (c == 0) { y = 0.05 + life * 0.6; lat *= 1.0 - life * 0.5; }
      else if (c == 1) { y = 0.45 - life * 0.4; lat *= 0.6; }
      else if (c == 2) {
        // Jump between the two rails on a strobe; never between frames.
        lat = sign(hash11(floor(animClock * 20.0) + seed * 91.0) - 0.5) * 0.22 * uScatter * (0.5 + 0.5 * seed);
        y = 0.05 * sin(life * 40.0);
        p.z = fract(position.z + animClock * 1.6 * uSpeed) - 0.5;
      }
      else if (c == 3) { y = 0.35 * (1.0 - life * life) - 0.1; }
      else if (c == 4) { y = 0.25 * sin(3.14159265 * life) * (0.4 + seed) - 0.45; }
      else if (c == 5) { y = 0.15 + seed * 0.35; }
      else { p.z = fract(position.z + animClock * 1.2 * uSpeed) - 0.5; y = 0.12 * sin(life * 6.2831853 + seed * 9.0); }
      p.x = lat;
      p.y = y;
      vFade = sin(3.14159265 * life) * (c == 5 ? pow(abs(sin(animClock * 3.0 + seed * 40.0)), 6.0) : 1.0);
      vHeat = 1.0 - life;
    }
    vFade *= smoothstep(-0.5, -0.4, p.z) * (1.0 - smoothstep(0.4, 0.5, p.z));
    // Points only appear behind the link's weaving front, and fade on the exit.
    vFade *= step(p.z + 0.5, uReveal * 1.05) * uExit;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * (uSpark > 0.5 ? 16.0 : 20.0) / max(1.0, -mv.z), 1.0, 7.0 * max(uSize, 0.2));
  }
`;

export function createWeaveLinkMotesMaterial(style, clock, spark = false) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      ...paletteUniforms(style),
      uSize: { value: 1 },
      uSpeed: { value: 1 },
      uScatter: { value: WEAVE_LOOK.sparkScatter },
      uSpark: { value: spark ? 1 : 0 },
      uReveal: { value: 1 },
      uExit: { value: 1 },
      uLifeRate: { value: 1 },
      uOpacity: { value: spark ? WEAVE_LOOK.sparkOpacity : WEAVE_LOOK.linkMoteOpacity },
      uGlow: { value: 1.4 }
    },
    vertexShader: LINK_POINTS_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false
  });
}

/**
 * Anchor motes: 48 seeds orbiting the pylon. `position` is (angle seed,
 * radius seed, phase); the shader turns that into a per-style orbit.
 */
const ANCHOR_POINTS_VERTEX = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float character;
  uniform float uSize;
  uniform float uRise;
  uniform float uSwirl;
  uniform float uRadius;
  uniform float uReveal;
  uniform float uExit;
  uniform float uLifeRate;
  varying float vFade;
  varying float vHeat;

  ${noiseGLSL}

  void main() {
    int c = int(character + 0.5);
    float rate = c == 0 ? 0.7 : c == 1 ? 0.3 : c == 2 ? 1.1 : c == 3 ? 0.5 : c == 4 ? 0.35 : c == 5 ? 0.2 : 0.9;
    float life = fract(position.z + animClock * rate * uLifeRate);
    float a = position.x * 6.2831853 + animClock * uSwirl * (c == 6 ? 3.5 : c == 2 ? 2.4 : 0.8);
    float r = uRadius * (0.45 + 0.55 * position.y);
    float y = 0.1 + life * uRise;
    if (c == 0) { r *= 1.0 - 0.6 * life; a += life * 1.5; }
    else if (c == 1) { y = 0.1 + (1.0 - life) * uRise; }
    else if (c == 2) { y = 0.35 + position.y * uRise * 0.8; r *= 0.8 + 0.4 * step(0.5, hash11(floor(animClock * 15.0) + position.x * 57.0)); }
    else if (c == 3) { y = 0.1 + (1.0 - life) * uRise; a += life * 4.0; }
    else if (c == 4) { y = 0.12 + 0.3 * sin(3.14159265 * life) * position.y; r *= 1.25; }
    else if (c == 5) { y = 0.3 + position.y * uRise * 0.9; }
    else { y = 0.2 + position.y * uRise * 0.6; r *= 0.7 + 0.6 * life; }
    vec3 p = vec3(sin(a) * r, y, cos(a) * r);
    vFade = sin(3.14159265 * life) * uReveal * uExit;
    if (c == 5) vFade *= 0.3 + 0.7 * pow(abs(sin(animClock * 2.5 + position.x * 31.0)), 4.0);
    vHeat = 1.0 - life;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * 18.0 / max(1.0, -mv.z), 1.0, 6.0 * max(uSize, 0.2));
  }
`;

export function createWeaveAnchorMotesMaterial(style, clock) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      ...paletteUniforms(style),
      uSize: { value: 1 },
      uRise: { value: WEAVE_LOOK.moteRise },
      uSwirl: { value: WEAVE_LOOK.moteSwirl },
      uRadius: { value: WEAVE_LOOK.moteRadius },
      uReveal: { value: 1 },
      uExit: { value: 1 },
      uLifeRate: { value: 1 },
      uOpacity: { value: WEAVE_LOOK.moteOpacity },
      uGlow: { value: 1.4 }
    },
    vertexShader: ANCHOR_POINTS_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false
  });
}

/** Scale a shared point geometry's draw range by the global particle count. */
function pointBudget(geometry) {
  const count = geometry.attributes.position.count;
  geometry.drawRange.count = Math.max(0, Math.min(count, Math.round(count * settings.global.particleCount)));
}

function linkMotesHook(renderer, scene, camera, geometry, material) {
  const rec = WEAVE_FX.get(this);
  if (!rec) return;
  const c = WEAVE_LOOK, g = settings.global, u = material.uniforms;
  const spark = u.uSpark.value > 0.5;
  ANIM.value = g.animationSpeed;
  u.uSize.value = (spark ? c.sparkSize : c.linkMoteSize) * g.particleSize;
  u.uSpeed.value = (spark ? c.sparkSpeed : 1) * g.particleSpeed;
  u.uLifeRate.value = 1 / Math.max(0.05, g.particleLifetime);
  // Randomness widens the scatter, but never past the capsule (≤ 1).
  u.uScatter.value = Math.min(1, c.sparkScatter * g.randomness);
  u.uReveal.value = reveal(rec);
  u.uExit.value = weaveExit(rec.root);
  u.uOpacity.value = (spark ? c.sparkOpacity : c.linkMoteOpacity) * g.opacity * (1 - warning(rec) * c.warnFlicker * 0.6);
  u.uGlow.value = c.ribbonGlow * glowOf(g);
  paint(u, rec.style);
  pointBudget(geometry);
  material.uniformsNeedUpdate = true;
}

function anchorMotesHook(renderer, scene, camera, geometry, material) {
  const rec = WEAVE_FX.get(this);
  if (!rec) return;
  const c = WEAVE_LOOK, g = settings.global, u = material.uniforms;
  ANIM.value = g.animationSpeed;
  u.uSize.value = c.moteSize * g.particleSize;
  u.uRise.value = c.moteRise;
  u.uSwirl.value = c.moteSwirl * g.particleSpeed;
  u.uLifeRate.value = 1 / Math.max(0.05, g.particleLifetime);
  u.uRadius.value = c.moteRadius;
  u.uReveal.value = reveal(rec);
  u.uExit.value = weaveExit(rec.root);
  u.uOpacity.value = c.moteOpacity * g.opacity * (1 - warning(rec) * c.warnFlicker * 0.6);
  u.uGlow.value = c.ribbonGlow * glowOf(g);
  paint(u, rec.style);
  pointBudget(geometry);
  material.uniformsNeedUpdate = true;
}

/* ------------------------------------------------------------------------ */
/* Sigil                                                                     */
/* ------------------------------------------------------------------------ */

const SIGIL_VERTEX = /* glsl */ `
  uniform float uRadius;
  attribute float aBand;
  varying vec2 vUv;
  varying vec2 vPos;
  varying float vBand;

  void main() {
    vUv = uv;
    vPos = position.xz; // unit-radius drawing space, whatever the live radius
    vBand = aBand;
    // The radius is a uniform rather than a mesh scale so the editor value is
    // live on a sigil that is already burnt into the ground.
    vec3 p = vec3(position.x * uRadius, position.y, position.z * uRadius);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const SIGIL_FRAGMENT = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float character;
  uniform float uReveal;
  uniform float uWarn;
  uniform float uLife;
  uniform float uHealth;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uSpin;
  uniform float uRunes;
  uniform float uCountdown;
  uniform float uDamage;
  uniform float uExit;
  uniform vec3 uCore;
  uniform vec3 tint;
  uniform vec3 uEdge;
  uniform vec3 uTail;
  varying vec2 vUv;
  varying vec2 vPos;
  varying float vBand;

  ${noiseGLSL}
  ${commonGLSL}
  ${BURN_GLSL}

  void main() {
    float r = length(vPos);
    float ang = atan(vPos.x, vPos.y) / 6.2831853 + 0.5;
    float across = abs(vUv.y * 2.0 - 1.0);
    float line = 1.0 - smoothstep(0.35, 1.0, across);
    float core = 1.0 - smoothstep(0.0, 0.45, across);
    float glow = line * 0.6 + core * 0.9;

    if (vBand < 0.5) {
      // Rim: rune notches turning, and the lit arc is the remaining life.
      float rune = step(0.45, fract(ang * uRunes + animClock * uSpin));
      glow *= 0.45 + 0.55 * rune;
      float lit = step(ang, uLife);
      glow *= mix(1.0, 0.2 + 1.15 * lit, uCountdown);
    } else if (vBand < 1.5) {
      // Glyph: a slow breath travelling outward.
      glow *= 0.72 + 0.28 * sin(animClock * 3.0 - r * 9.0 + character);
    } else {
      glow *= 0.8 + 0.2 * sin(animClock * 5.0 + ang * 30.0);
    }

    // Damage: voronoi cells of the drawing stutter out as health drops.
    vec2 cell = voronoi2(vPos * 6.0 + character);
    float wound = (1.0 - uHealth) * uDamage;
    float out_ = step(0.5, hash11(cell.y * 31.0 + floor(animClock * 9.0)));
    glow *= 1.0 - wound * out_ * 0.75;

    // Reveal: burnt outward from the anchor's foot.
    float front = uReveal * 1.1 - r;
    float shown = smoothstep(0.0, 0.05, front);
    float burn = (1.0 - smoothstep(0.0, 0.08, abs(front - 0.03))) * (1.0 - smoothstep(0.85, 1.0, uReveal));
    float gutter = 1.0 - uWarn * (0.5 + 0.5 * sin(animClock * 17.0));

    // Exit: the drawing burns out cell by cell, the same cells that crack.
    vec2 gone = burnMask(fract(cell.y * 7.13) * 0.6 + 0.4 * snoise01(vec3(vPos * 3.0, character)), (1.0 - uExit) * 1.05, 0.1);

    vec3 col = gradient4(uCore, tint, uEdge, uTail, 1.0 - core * 0.8 + vBand * 0.1) * glow * uGlow * gutter;
    col += uCore * (burn * 2.0 + gone.y * 2.5 * line) * uGlow;
    float alpha = ((glow * shown * gutter + burn) * gone.x + gone.y * line) * uOpacity;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export function createWeaveSigilMaterial(style, clock) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      ...paletteUniforms(style),
      uRadius: { value: WEAVE_LOOK.sigilRadius },
      uReveal: { value: 1 },
      uWarn: { value: 0 },
      uLife: { value: 1 },
      uHealth: { value: 1 },
      uOpacity: { value: WEAVE_LOOK.sigilOpacity },
      uGlow: { value: WEAVE_LOOK.sigilGlow },
      uSpin: { value: WEAVE_LOOK.sigilSpin },
      uRunes: { value: WEAVE_LOOK.sigilRunes },
      uCountdown: { value: WEAVE_LOOK.sigilCountdown },
      uDamage: { value: WEAVE_LOOK.sigilDamage },
      uExit: { value: 1 }
    },
    vertexShader: SIGIL_VERTEX,
    fragmentShader: SIGIL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    // Lies on the floor: pull it forward in depth so it never z-fights.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
}

function sigilHook(renderer, scene, camera, geometry, material) {
  const rec = WEAVE_FX.get(this);
  if (!rec) return;
  const c = WEAVE_LOOK, g = settings.global, u = material.uniforms, view = rec.view;
  const anchor = anchorOf(rec);
  ANIM.value = g.animationSpeed;
  u.uRadius.value = c.sigilRadius;
  u.uReveal.value = reveal(rec);
  u.uWarn.value = warning(rec) * c.warnFlicker;
  u.uExit.value = weaveExit(rec.root);
  u.uLife.value = anchor && Number.isFinite(anchor.expiresTick)
    ? clamp01((anchor.expiresTick - view.s.m.tick) / rec.lifeTicks) : 1;
  u.uHealth.value = anchor && Number.isFinite(anchor.health) ? clamp01(anchor.health / rec.maxHealth) : 1;
  u.uOpacity.value = c.sigilOpacity * g.opacity;
  u.uGlow.value = c.sigilGlow * glowOf(g);
  u.uSpin.value = c.sigilSpin * g.noiseSpeed;
  u.uRunes.value = Math.round(c.sigilRunes);
  u.uCountdown.value = c.sigilCountdown;
  u.uDamage.value = c.sigilDamage;
  paint(u, rec.style);
  material.uniformsNeedUpdate = true;
}

/* ------------------------------------------------------------------------ */
/* Link ground trail                                                         */
/* ------------------------------------------------------------------------ */

const WORLD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float character;
  uniform float uReveal;
  uniform float uWarn;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uNoiseScale;
  uniform float uTurb;
  uniform float uExit;
  uniform vec3 uCore;
  uniform vec3 tint;
  uniform vec3 uEdge;
  uniform vec3 uTail;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}
  ${BURN_GLSL}

  void main() {
    // World-space noise, so the trail is welded to the floor.
    float n = fbm3(vec3(vWorld.xz * uNoiseScale, character * 1.7));
    float across = abs(vUv.x * 2.0 - 1.0);
    float edge = 1.0 - smoothstep(0.35, 1.0, across + (n - 0.5) * 0.5 * uTurb);
    float heat = 0.0;
    float body = 0.5 + 0.5 * n;
    int c = int(character + 0.5);
    if (c == 0) {
      heat = pow(snoise01(vec3(vWorld.xz * 6.0, animClock * 0.8)), 6.0) * 3.0; // embers in char
    } else if (c == 1) {
      heat = 1.0 - smoothstep(0.0, 0.14, voronoi2(vWorld.xz * 5.0).x); // rime cells
    } else if (c == 2) {
      float vein = 1.0 - smoothstep(0.0, 0.06, abs(snoise(vec3(vWorld.xz * 3.0, 1.3))));
      heat = vein * (0.4 + 0.6 * step(0.5, hash11(floor(animClock * 10.0)))); // flickering burn veins
    } else if (c == 3) {
      heat = 0.5 + 0.5 * sin(vWorld.x * 9.0 + vWorld.z * 6.0 + n * 6.0 + animClock * 2.0); // wet sheen
      body *= 0.7;
    } else if (c == 4) {
      heat = 1.0 - smoothstep(0.0, 0.08, abs(vUv.x - 0.5 + (n - 0.5) * 0.35)); // a furrow crack
    } else if (c == 5) {
      heat = step(0.965, hash13(floor(vec3(vWorld.xz * 26.0, floor(animClock * 6.0))))) * 2.0; // glitter
    } else {
      heat = smoothstep(0.6, 1.0, sin(vUv.y * 40.0 - animClock * 6.0 + n * 4.0)); // swept streaks
    }
    float front = uReveal * 1.1 - vUv.y;
    float shown = smoothstep(0.0, 0.05, front);
    float gutter = 1.0 - uWarn * 0.5;
    // Exit: the mark cools away patchily, through the same world-space noise.
    vec2 gone = burnMask(n, (1.0 - uExit) * 1.05, 0.08);
    vec3 col = mix(uTail * 0.6, uEdge, body) + mix(tint, uCore, clamp(heat - 0.5, 0.0, 1.0)) * heat;
    col += uCore * gone.y * 1.5;
    float alpha = edge * ((0.25 + 0.45 * body + 0.3 * clamp(heat, 0.0, 1.0)) * uOpacity * shown * gutter * gone.x + gone.y * 0.6);
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col * uGlow * gutter, clamp(alpha, 0.0, 1.0));
  }
`;

export function createWeaveTrailMaterial(style, clock) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      ...paletteUniforms(style),
      uReveal: { value: 1 },
      uWarn: { value: 0 },
      uOpacity: { value: WEAVE_LOOK.scorchOpacity },
      uGlow: { value: WEAVE_LOOK.scorchGlow },
      uNoiseScale: { value: WEAVE_LOOK.scorchNoise },
      uTurb: { value: 1 },
      uExit: { value: 1 }
    },
    vertexShader: WORLD_VERTEX,
    fragmentShader: TRAIL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
}

function trailHook(renderer, scene, camera, geometry, material) {
  const rec = WEAVE_FX.get(this);
  if (!rec) return;
  const c = WEAVE_LOOK, g = settings.global, u = material.uniforms;
  ANIM.value = g.animationSpeed;
  u.uReveal.value = reveal(rec);
  u.uWarn.value = warning(rec) * c.warnFlicker;
  u.uExit.value = weaveExit(rec.root);
  u.uOpacity.value = c.scorchOpacity * g.opacity;
  u.uGlow.value = c.scorchGlow * glowOf(g);
  u.uNoiseScale.value = c.scorchNoise * g.noiseFrequency;
  u.uTurb.value = g.noiseStrength * g.turbulence;
  paint(u, rec.style);
  material.uniformsNeedUpdate = true;
}

/* ------------------------------------------------------------------------ */
/* Cue layers: shock, beam, flood                                            */
/* ------------------------------------------------------------------------ */

const DISC_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHOCK_FRAGMENT = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float character;
  uniform float uProgress;
  uniform float uWidth;
  uniform float uFade;
  uniform float uFill;
  uniform float uOpacity;
  uniform float uGlow;
  uniform vec3 uCore;
  uniform vec3 tint;
  uniform vec3 uEdge;
  uniform vec3 uTail;
  varying vec2 vUv;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float r = vUv.y;
    float ang = vUv.x;
    float n = snoise(vec3(ang * 14.0, r * 3.0, animClock * 1.5 + character));
    float w = max(uWidth * 0.5, 0.01);
    float d = (r - uProgress) / w;
    float band = exp(-d * d) * (0.7 + 0.3 * n);
    int c = int(character + 0.5);
    if (c == 2) band *= 0.4 + 0.9 * step(0.45, hash11(floor(ang * 40.0) + floor(animClock * 18.0))); // arcing teeth
    else if (c == 5) band *= 0.55 + 0.45 * step(0.5, fract(ang * 12.0)); // prismatic facets
    else if (c == 4) band *= 0.6 + 0.4 * smoothstep(-0.2, 0.6, n); // dusty, uneven
    // A faint wash behind the front so the ring reads as a wave, not a line.
    float wash = (1.0 - smoothstep(0.0, max(uProgress, 1e-3), r)) * uFill;
    float rim = 1.0 - smoothstep(0.94, 1.0, r);
    vec3 col = gradient4(uCore, tint, uEdge, uTail, 1.0 - clamp(band, 0.0, 1.0)) * (band * 1.6 + wash * 0.5) * uGlow;
    float alpha = (band + wash * 0.35) * uFade * uOpacity * rim;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export function createWeaveShockMaterial(style, clock) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      ...paletteUniforms(style),
      uProgress: { value: 0.5 },
      uWidth: { value: WEAVE_LOOK.shockWidth },
      uFade: { value: 1 },
      uFill: { value: 0.4 },
      uOpacity: { value: WEAVE_LOOK.shockOpacity },
      uGlow: { value: WEAVE_LOOK.shockGlow }
    },
    vertexShader: DISC_VERTEX,
    fragmentShader: SHOCK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
}

/**
 * Shock records carry `life` (the cue's presentation lifetime), `radius`
 * (the gameplay radius the ring must read at), `scale` (the mesh's world
 * radius) and `inward` (expiry implodes; everything else bursts).
 */
function shockHook(renderer, scene, camera, geometry, material) {
  const rec = WEAVE_FX.get(this);
  if (!rec) return;
  const c = WEAVE_LOOK, g = settings.global, u = material.uniforms;
  const t = clamp01(age(rec) / rec.life);
  const reduced = rec.view.reducedMotion;
  ANIM.value = g.animationSpeed;
  // Ease out: the front is fast at birth and settles at the gameplay radius
  // plus the overshoot. Reduced motion holds the ring at the radius and fades.
  const ease = reduced ? 1 : 1 - (1 - t) * (1 - t) * (1 - t);
  const world = rec.inward
    ? rec.radius * (1 + c.shockGrowth) * (1 - 0.75 * ease)
    : rec.radius * (0.25 + (0.75 + c.shockGrowth) * ease);
  u.uProgress.value = Math.min(0.98, world / rec.scale);
  u.uWidth.value = c.shockWidth;
  u.uFade.value = (1 - t) * (1 - t) * g.explosionIntensity;
  u.uFill.value = rec.inward ? 0.15 : 0.4;
  u.uOpacity.value = c.shockOpacity * g.opacity;
  u.uGlow.value = c.shockGlow * glowOf(g);
  paint(u, rec.style);
  material.uniformsNeedUpdate = true;
}

const BEAM_VERTEX = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float character;
  uniform float uAge;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uFresnel;
  uniform vec3 uCore;
  uniform vec3 tint;
  uniform vec3 uEdge;
  uniform vec3 uTail;
  varying vec3 vLocal;
  varying vec3 vNormalV;
  varying vec3 vViewPos;

  ${noiseGLSL}
  ${commonGLSL}
  ${BURN_GLSL}

  void main() {
    float rim = fresnelTerm(vViewPos, vNormalV, 1.6, uFresnel);
    float n = snoise01(vLocal * 4.0 + vec3(0.0, animClock * 3.0, character));
    // Hold solid for the first third of the cue, then dissolve with a hot edge.
    vec2 d = burnMask(n, smoothstep(0.35, 1.0, uAge) * 1.02, 0.08);
    float crackle = int(character + 0.5) == 2 ? 0.6 + 0.8 * step(0.4, hash11(floor(animClock * 24.0) + vLocal.y * 13.0)) : 1.0;
    vec3 col = gradient4(uCore, tint, uEdge, uTail, 1.0 - clamp(rim, 0.0, 1.0)) * (0.8 + rim * 1.4) * uGlow * crackle;
    col += uCore * d.y * 3.0 * uGlow;
    float alpha = ((0.55 + 0.45 * clamp(rim, 0.0, 1.0)) * d.x + d.y) * uOpacity;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export function createWeaveBeamMaterial(style, clock) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      ...paletteUniforms(style),
      uAge: { value: 0 },
      uOpacity: { value: 1 },
      uGlow: { value: WEAVE_LOOK.shockGlow },
      uFresnel: { value: 1 }
    },
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false
  });
}

function beamHook(renderer, scene, camera, geometry, material) {
  const rec = WEAVE_FX.get(this);
  if (!rec) return;
  const c = WEAVE_LOOK, g = settings.global, u = material.uniforms;
  ANIM.value = g.animationSpeed;
  u.uAge.value = clamp01(age(rec) / rec.life);
  u.uOpacity.value = c.shockOpacity * g.opacity;
  u.uGlow.value = c.shockGlow * glowOf(g) * g.explosionIntensity;
  u.uFresnel.value = g.fresnel;
  paint(u, rec.style);
  material.uniformsNeedUpdate = true;
}

const FLOOD_VERTEX = /* glsl */ `
  attribute vec3 aBary;
  varying vec3 vBary;
  varying vec3 vWorld;
  void main() {
    vBary = aBary;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FLOOD_FRAGMENT = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float uAge;
  uniform float uOpacity;
  uniform float uGlow;
  uniform vec3 uCore;
  uniform vec3 tint;
  uniform vec3 uEdge;
  uniform vec3 uTail;
  uniform float character;
  varying vec3 vBary;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float edge = min(min(vBary.x, vBary.y), vBary.z); // 0 on the edges, 1/3 at the centroid
    // The water pours in from the three links toward the middle...
    float fill = smoothstep(0.0, 0.25, uAge) * 0.34;
    float shown = 1.0 - smoothstep(fill - 0.02, fill, edge);
    // ...then drains: the whole sheet fades through the second half.
    float fade = 1.0 - smoothstep(0.5, 1.0, uAge);
    float caustic = pow(1.0 - voronoi2(vWorld.xz * 2.2 + vec2(animClock * 0.4, -animClock * 0.3)).x, 4.0);
    float lip = 1.0 - smoothstep(0.0, 0.04, abs(edge - fill));
    float banks = 1.0 - smoothstep(0.0, 0.03, edge);
    vec3 col = mix(uEdge, uCore, caustic) * (0.5 + caustic) + tint * (lip + banks) * 1.5;
    float alpha = (shown * (0.35 + 0.65 * caustic) + lip * 0.8 + banks * 0.6) * fade * uOpacity;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col * uGlow, clamp(alpha, 0.0, 1.0));
  }
`;

export function createWeaveFloodMaterial(clock) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      ...paletteUniforms('water'),
      uAge: { value: 0 },
      uOpacity: { value: WEAVE_LOOK.floodOpacity },
      uGlow: { value: 1 }
    },
    vertexShader: FLOOD_VERTEX,
    fragmentShader: FLOOD_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
}

function floodHook(renderer, scene, camera, geometry, material) {
  const rec = WEAVE_FX.get(this);
  if (!rec) return;
  const c = WEAVE_LOOK, g = settings.global, u = material.uniforms;
  u.uAge.value = rec.view.reducedMotion ? Math.max(0.25, clamp01(age(rec) / rec.life)) : clamp01(age(rec) / rec.life);
  ANIM.value = g.animationSpeed;
  u.uOpacity.value = c.floodOpacity * g.opacity;
  u.uGlow.value = c.shockGlow * 0.7 * glowOf(g) * g.explosionIntensity;
  paint(u, 'water');
  material.uniformsNeedUpdate = true;
}

/* ------------------------------------------------------------------------ */
/* Shimmer (distortion proxy)                                                */
/* ------------------------------------------------------------------------ */

const SHIMMER_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    // Cylindrical billboard: faces the camera but stays upright, so the
    // shimmer column is welded to the pylon it rises from.
    vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
    vec3 world = center + right * position.x * uWidth + vec3(0.0, position.y * uHeight, 0.0);
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SHIMMER_FRAGMENT = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uShaderIntensity;
  uniform vec3 tint;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    // The element colour only decorrelates the noise between identities; the
    // distortion buffer stores offsets, not light.
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.6 - animClock * uSpeed) + tint * 7.0;
    float nx = snoise(np);
    float ny = snoise(np + vec3(19.3, 7.7, 31.1));
    vec2 cc = (vUv - 0.5) * 2.0;
    float mask = (1.0 - smoothstep(0.2, 1.0, abs(cc.x)))
               * (1.0 - smoothstep(0.3, 1.0, vUv.y))
               * smoothstep(0.0, 0.1, vUv.y);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, strength, mask);
  }
`;

export function createWeaveShimmerMaterial(clock) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      tint: { value: new Color(WEAVE_LOOK.fireB) },
      uWidth: { value: 1.1 },
      uHeight: { value: WEAVE_LOOK.shimmerHeight },
      uStrength: { value: WEAVE_LOOK.shimmerStrength },
      uScale: { value: WEAVE_LOOK.shimmerScale },
      uSpeed: { value: WEAVE_LOOK.shimmerSpeed },
      uShaderIntensity: frame.uShaderIntensity
    },
    vertexShader: SHIMMER_VERTEX,
    fragmentShader: SHIMMER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false
  });
}

function shimmerHook(renderer, scene, camera, geometry, material) {
  const rec = WEAVE_FX.get(this);
  if (!rec) return;
  const c = WEAVE_LOOK, g = settings.global, u = material.uniforms;
  ANIM.value = g.animationSpeed;
  u.uHeight.value = c.shimmerHeight;
  u.uStrength.value = c.shimmerStrength * (SHIMMER_WEIGHT[rec.style] ?? 0.5) * g.distortion
    * reveal(rec) * (1 - warning(rec) * 0.5) * weaveExit(rec.root);
  u.uScale.value = c.shimmerScale * g.noiseFrequency;
  u.uSpeed.value = c.shimmerSpeed * g.noiseSpeed;
  u.tint.value.copy(getColor(WEAVE_LOOK[PALETTE[rec.style]?.[1] ?? 'fireB']));
  material.uniformsNeedUpdate = true;
}

const HOOKS = {
  ribbon: ribbonHook,
  linkMotes: linkMotesHook,
  anchorMotes: anchorMotesHook,
  sigil: sigilHook,
  trail: trailHook,
  shock: shockHook,
  beam: beamHook,
  flood: floodHook,
  shimmer: shimmerHook
};
