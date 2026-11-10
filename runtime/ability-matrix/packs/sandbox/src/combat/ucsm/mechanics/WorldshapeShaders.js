import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector2 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { frame } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { WORLDSHAPE_LOOK, WORLDSHAPE_TERRAINS } from './WorldshapeLook.js';

/**
 * WorldshapeShaders — the bespoke GLSL of the reshaped ground, and the
 * per-draw sync that keeps it live.
 *
 * Same scheme as the weave family: one material per terrain identity, pooled
 * by the presentation; per-field state (how far the field has spread, whether
 * a damage pulse is gathering, how close it is to expiring, how far it has
 * retracted) written by an `onBeforeRender` hook just before that field's
 * draw, then `uniformsNeedUpdate` so the shared block re-uploads.
 *
 * The beats a field shows, all read from the combat record:
 *
 *  - **rise** — a burning front spreads from the centre to the rim over
 *    `riseTime` (the presentation also grows the solids up over 0.35 s).
 *  - **charge** — in the last `chargeTime` seconds before each `nextPulse`
 *    tick the ground gathers light, so every damage pulse is telegraphed.
 *  - **gutter** — the last `warnTime` seconds before `expiresTick` flicker.
 *  - **retract** — when the region ends, the presentation shrinks the root for
 *    0.3 s; the shaders read that scale and dissolve through noise instead of
 *    just shrinking.
 *
 * `clock` is the presentation's `terrainTime` (combat seconds, 0 under
 * reduced motion), shared by identity with every terrain material; the GLSL
 * reads `animClock`, that clock times `uAnim` — one box shared by every
 * terrain material and set from `settings.global.animationSpeed`.
 *
 * Globals folded in by the hooks: `glow` × `shaderIntensity` on every
 * emissive layer, `opacity`, `noiseStrength` × `turbulence`,
 * `noiseFrequency`, `noiseSpeed`, `particleCount` / `particleSize` /
 * `particleLifetime` on the points, `distortion` on the shimmer and
 * `explosionIntensity` on the pulse ring.
 *
 * Programs: field **lines** (the hero surface), the **ground** treatment, the
 * boundary **veil**, rising **motes**, drifting **spray**, the pulse
 * **shock** ring and a **shimmer** distortion proxy.
 */

/** Per-object fx records: Object3D → { view, start, terrain, kind, root, ... }. */
export const WORLDSHAPE_FX = new WeakMap();

const SLUGS = Object.keys(WORLDSHAPE_TERRAINS);
const PALETTE = Object.fromEntries(Object.values(WORLDSHAPE_TERRAINS).map((p) => [p, [`${p}A`, `${p}B`, `${p}C`, `${p}D`]]));
// How hard each terrain warps the air above it.
const SHIMMER_WEIGHT = { scorched: 1, glacier: 0.3, stormground: 0.55, floodplain: 0.4, glass: 0.45, continental: 0.3 };

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** `settings.global.animationSpeed`, shared by identity with every terrain material. */
const ANIM = { value: 1 };

/** Emissive multiplier common to every lit-by-itself layer. */
const glowOf = (g) => g.glow * g.shaderIntensity;

/**
 * Retract mask. `dissolveMask()` from the common lib keeps fragments above
 * the threshold, but its edge term is always zero (smoothstep − step never
 * goes positive), so the burning rim of the retract is computed here, and is
 * suppressed while nothing is dissolving.
 */
const BURN_GLSL = /* glsl */ `
  vec2 burnMask(float n, float threshold, float width) {
    vec2 d = dissolveMask(n, threshold, width);
    d.y = d.x * (1.0 - smoothstep(threshold, threshold + width, n)) * step(0.001, threshold);
    return d;
  }
`;

/** Shader identity index of a hero slug (matches `WORLDSHAPE_HEROES` order). */
export const terrainIdentity = (slug) => Math.max(0, SLUGS.indexOf(slug));

/* ------------------------------------------------------------------------ */
/* Shared plumbing                                                           */
/* ------------------------------------------------------------------------ */

function paletteUniforms(slug) {
  const [a, b, c, d] = PALETTE[WORLDSHAPE_TERRAINS[slug]];
  return {
    uCore: { value: new Color(WORLDSHAPE_LOOK[a]) },
    tint: { value: new Color(WORLDSHAPE_LOOK[b]) },
    uEdge: { value: new Color(WORLDSHAPE_LOOK[c]) },
    uTail: { value: new Color(WORLDSHAPE_LOOK[d]) },
    identity: { value: terrainIdentity(slug) }
  };
}

function paint(u, terrain) {
  const [a, b, c, d] = PALETTE[terrain] ?? PALETTE.continental;
  u.uCore.value.copy(getColor(WORLDSHAPE_LOOK[a]));
  u.tint.value.copy(getColor(WORLDSHAPE_LOOK[b]));
  u.uEdge.value.copy(getColor(WORLDSHAPE_LOOK[c]));
  u.uTail.value.copy(getColor(WORLDSHAPE_LOOK[d]));
}

function age(rec) {
  const m = rec.view.s.m;
  return (m.tick - rec.start) / m.budget.tickRate;
}

/** The live region behind a field, found once by its root group. */
function regionOf(rec) {
  if (rec.region) return rec.region;
  for (const item of rec.view.items.values()) {
    if (item.g !== rec.root) continue;
    rec.region = item.data;
    const preset = rec.view.s.preset(item.data);
    rec.pulseTicks = Math.max(1, rec.view.s.t(preset?.pulse ?? preset?.life ?? 10));
    return rec.region;
  }
  return null;
}

/** Shared beat state, written into the fx record (no allocation). */
function beats(rec) {
  const c = WORLDSHAPE_LOOK, view = rec.view, m = view.s.m, rate = m.budget.tickRate;
  const region = regionOf(rec);
  ANIM.value = settings.global.animationSpeed;
  rec.rise = view.reducedMotion ? 1 : clamp01(age(rec) / Math.max(1e-3, c.riseTime));
  // The presentation retracts a field by scaling its root's x/z; 1 until then.
  rec.exit = clamp01(rec.root?.scale.x ?? 1);
  rec.warn = 0;
  rec.charge = 0;
  if (region) {
    if (Number.isFinite(region.expiresTick) && c.warnTime > 0)
      rec.warn = (1 - clamp01((region.expiresTick - m.tick) / rate / c.warnTime)) * c.warnFlicker;
    if (Number.isFinite(region.nextPulse) && c.chargeTime > 0 && !view.reducedMotion)
      rec.charge = 1 - clamp01((region.nextPulse - m.tick) / rate / c.chargeTime);
  }
}

/** Attach an fx record and its sync hook. */
export function attachWorldshapeFx(object, view, record) {
  record.view = view;
  record.start = view.s.m.tick;
  WORLDSHAPE_FX.set(object, record);
  object.onBeforeRender = HOOKS[record.kind];
  return object;
}

/* ------------------------------------------------------------------------ */
/* Field lines (hero surface)                                                */
/* ------------------------------------------------------------------------ */

// `elevation*max(...)` lifts the lines onto the same cone the combat height
// query samples (glacier ramp, continental mound); flat fields pass 0.
const LINES_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying float vR;
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float elevation;

  void main() {
    vUv = uv;
    vec3 p = position;
    vR = length(position.xz);
    p.y = elevation*max(0.0, 1.0 - length(position.xz)) + 0.08 + 0.012 * sin(uv.x * 18.0 - animClock * 2.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const LINES_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  varying float vR;
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float identity;
  uniform float uRise;
  uniform float uExit;
  uniform float uWarn;
  uniform float uCharge;
  uniform float uChargeGlow;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uFlow;
  uniform float uNoise;
  uniform vec3 uCore;
  uniform vec3 tint;
  uniform vec3 uEdge;
  uniform vec3 uTail;

  ${noiseGLSL}
  ${commonGLSL}
  ${BURN_GLSL}

  void main() {
    float across = abs(vUv.y * 2.0 - 1.0);
    float edge = 1.0 - across;
    float n = snoise(vec3(vUv.x * 6.0, vR * 4.0, animClock * 0.4 + identity * 5.0));
    float speed = (1.8 + identity * 0.4) * uFlow;
    float pulse = pow(max(0.0, sin(vUv.x * (18.0 + identity * 2.0) - animClock * speed + n * uNoise * 2.0)), 4.0);
    int k = int(identity + 0.5);
    if (k == 0) pulse = pulse * 0.7 + 0.5 * smoothstep(0.6, 0.95, snoise01(vec3(vUv.x * 12.0, animClock * 1.7, 0.0))); // lava flicker
    else if (k == 1) pulse = pulse * 0.6 + 0.4 * step(0.92, fract(vUv.x * 5.0 - animClock * 0.15)); // rime glints
    else if (k == 2) pulse = pulse * 0.4 + step(0.7, hash11(floor(animClock * 16.0) + floor(vUv.x * 12.0) * 3.7)); // strobing arcs
    else if (k == 3) pulse = 0.4 + 0.6 * (0.5 + 0.5 * sin(vUv.x * 10.0 - animClock * speed * 0.8)); // a smooth current
    else if (k == 4) pulse = pow(pulse, 3.0) * 1.6 + 0.2 * step(0.85, fract(vUv.x * 8.0 + animClock * 0.3)); // prism edges
    else pulse = smoothstep(0.3, 0.9, pulse) * (0.6 + 0.4 * n); // heavy strata

    // Rise: lines light from the centre outward. Retract: dissolve through noise.
    float shown = smoothstep(0.0, 0.06, uRise * 1.15 - vR);
    vec2 d = burnMask(snoise01(vec3(vUv * vec2(9.0, 3.0), identity)), 1.0 - uExit, 0.08);
    float gutter = 1.0 - uWarn * (0.5 + 0.5 * sin(animClock * 15.0 + vR * 6.0));
    float charge = 1.0 + uCharge * uChargeGlow;

    vec3 col = gradient4(uCore, tint, uEdge, uTail, across * 0.6 + (1.0 - clamp(pulse, 0.0, 1.0)) * 0.4);
    col *= (0.9 + pulse * 0.9) * uGlow * gutter * charge;
    col += uCore * d.y * 2.0;
    float alpha = (0.25 + 0.5 * edge) * (0.7 + 0.3 * clamp(pulse, 0.0, 1.0)) * uOpacity * shown * d.x * gutter + d.y * edge;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export function createWorldshapeLinesMaterial(slug, clock, elevation) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      elevation: { value: elevation },
      ...paletteUniforms(slug),
      uRise: { value: 1 },
      uExit: { value: 1 },
      uWarn: { value: 0 },
      uCharge: { value: 0 },
      uChargeGlow: { value: WORLDSHAPE_LOOK.chargeGlow },
      uOpacity: { value: WORLDSHAPE_LOOK.lineOpacity },
      uGlow: { value: WORLDSHAPE_LOOK.lineGlow },
      uFlow: { value: WORLDSHAPE_LOOK.lineFlow },
      uNoise: { value: WORLDSHAPE_LOOK.lineNoise }
    },
    vertexShader: LINES_VERTEX,
    fragmentShader: LINES_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false
  });
}

function linesHook(renderer, scene, camera, geometry, material) {
  const rec = WORLDSHAPE_FX.get(this);
  if (!rec) return;
  const c = WORLDSHAPE_LOOK, g = settings.global, u = material.uniforms;
  beats(rec);
  u.uRise.value = rec.rise;
  u.uExit.value = rec.exit;
  u.uWarn.value = rec.warn;
  u.uCharge.value = rec.charge;
  u.uChargeGlow.value = c.chargeGlow;
  u.uOpacity.value = c.lineOpacity * g.opacity;
  u.uGlow.value = c.lineGlow * glowOf(g);
  u.uFlow.value = c.lineFlow * g.noiseSpeed;
  u.uNoise.value = c.lineNoise * g.noiseStrength * g.turbulence;
  paint(u, rec.terrain);
  material.uniformsNeedUpdate = true;
}

/* ------------------------------------------------------------------------ */
/* Ground treatment                                                          */
/* ------------------------------------------------------------------------ */

const GROUND_VERTEX = /* glsl */ `
  uniform float elevation;
  varying vec2 vUnit;
  varying vec3 vWorld;
  void main() {
    vUnit = position.xz; // unit disc coordinates
    vec3 p = position;
    // Sits on the same cone as the combat height query, just above the solids' floor.
    p.y = elevation*max(0.0, 1.0 - length(position.xz)) + 0.065;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float identity;
  uniform float uRise;
  uniform float uExit;
  uniform float uWarn;
  uniform float uCharge;
  uniform float uChargeGlow;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uScale;
  uniform float uFlowSpeed;
  uniform float uEdgeFeather;
  uniform vec2 uFlowDir;
  uniform float uTurb;
  uniform vec3 uCore;
  uniform vec3 tint;
  uniform vec3 uEdge;
  uniform vec3 uTail;
  varying vec2 vUnit;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}
  ${BURN_GLSL}

  void main() {
    float r = length(vUnit);
    vec2 w = vWorld.xz * uScale;
    float t = animClock * uFlowSpeed;
    // Turbulence pushes the crust noise away from its mean.
    float n = 0.5 + (fbm3(vec3(w * 0.7, identity * 3.3)) - 0.5) * uTurb;
    float body = 0.0;  // how much crust / base colour shows
    float glow = 0.0;  // how much emissive light shows
    int k = int(identity + 0.5);
    if (k == 0) {
      // Scorched: dark crust split by glowing lava seams that breathe.
      float f = voronoi2(w * 1.3).x;
      float seam = smoothstep(0.42, 0.66, f + (n - 0.5) * 0.25);
      body = 0.85;
      glow = seam * (0.65 + 0.35 * snoise01(vec3(w * 2.0, t * 0.9)));
    } else if (k == 1) {
      // Glacier: blue-white rime with thin crystalline fracture lines.
      vec2 cell = voronoi2(w * 1.8);
      float frac = smoothstep(0.5, 0.62, cell.x);
      body = 0.55 + 0.45 * n;
      glow = frac * 0.8 + step(0.985, hash13(floor(vec3(w * 14.0, floor(t * 3.0))))) * 1.5;
    } else if (k == 2) {
      // Stormground: an ionised lattice; cells strobe as charge hops across.
      vec2 grid = abs(fract(w * 0.9) - 0.5);
      float lattice = 1.0 - smoothstep(0.0, 0.04, min(grid.x, grid.y));
      float strobe = step(0.6, hash13(vec3(floor(w * 0.9), floor(t * 10.0))));
      body = 0.6 + 0.3 * n;
      glow = lattice * (0.25 + 0.9 * strobe);
    } else if (k == 3) {
      // Floodplain: caustics drifting with the actual current direction.
      vec2 drift = uFlowDir * t * 0.6;
      float caustic = pow(1.0 - voronoi2(w * 1.6 - drift).x, 4.0);
      float streak = smoothstep(0.6, 1.0, sin(dot(w, uFlowDir) * 6.0 - t * 4.0 + n * 3.0));
      body = 0.5;
      glow = caustic * 1.2 + streak * 0.35;
    } else if (k == 4) {
      // Glass: prismatic facets, each cell its own shade, bright facet edges.
      vec2 cell = voronoi2(w * 1.1);
      float facetEdge = smoothstep(0.45, 0.6, cell.x);
      body = 0.4 + 0.6 * cell.y;
      glow = facetEdge + 0.25 * step(0.9, fract(cell.y * 7.0 + t * 0.3));
    } else {
      // Continental: contour strata of raised rock.
      float contour = abs(fract(r * 9.0 + n * 1.5) - 0.5);
      body = 0.7 + 0.3 * n;
      glow = (1.0 - smoothstep(0.0, 0.06, contour)) * 0.45;
    }

    float rim = 1.0 - smoothstep(1.0 - max(uEdgeFeather, 0.01), 1.0, r);
    float shown = smoothstep(0.0, 0.05, uRise * 1.12 - r);
    float front = (1.0 - smoothstep(0.0, 0.07, abs(uRise * 1.12 - r - 0.03))) * (1.0 - smoothstep(0.85, 1.0, uRise));
    vec2 d = burnMask(snoise01(vec3(w * 1.7, identity)), 1.0 - uExit, 0.06);
    float gutter = 1.0 - uWarn * (0.5 + 0.5 * sin(animClock * 15.0));
    float charge = 1.0 + uCharge * uChargeGlow * (0.6 + 0.4 * sin(r * 14.0 - animClock * 10.0));

    vec3 crust = mix(uTail, uEdge, body * 0.45);
    vec3 light = mix(tint, uCore, clamp(glow - 0.4, 0.0, 1.0)) * glow * uGlow * charge * gutter;
    vec3 col = crust + light + uCore * (front + d.y) * 2.0;
    float alpha = (0.45 * body + 0.55 * clamp(glow, 0.0, 1.0)) * rim * shown * d.x * uOpacity + (front + d.y) * rim;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export function createWorldshapeGroundMaterial(slug, clock, elevation) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      elevation: { value: elevation },
      ...paletteUniforms(slug),
      uRise: { value: 1 },
      uExit: { value: 1 },
      uWarn: { value: 0 },
      uCharge: { value: 0 },
      uChargeGlow: { value: WORLDSHAPE_LOOK.chargeGlow },
      uOpacity: { value: WORLDSHAPE_LOOK.groundOpacity },
      uGlow: { value: WORLDSHAPE_LOOK.groundGlow },
      uScale: { value: WORLDSHAPE_LOOK.groundScale },
      uFlowSpeed: { value: WORLDSHAPE_LOOK.groundFlow },
      uEdgeFeather: { value: WORLDSHAPE_LOOK.groundEdge },
      uFlowDir: { value: new Vector2(0, 1) },
      uTurb: { value: 1 }
    },
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
}

function groundHook(renderer, scene, camera, geometry, material) {
  const rec = WORLDSHAPE_FX.get(this);
  if (!rec) return;
  const c = WORLDSHAPE_LOOK, g = settings.global, u = material.uniforms;
  beats(rec);
  u.uRise.value = rec.rise;
  u.uExit.value = rec.exit;
  u.uWarn.value = rec.warn;
  u.uCharge.value = rec.charge;
  u.uChargeGlow.value = c.chargeGlow;
  u.uOpacity.value = c.groundOpacity * g.opacity;
  u.uGlow.value = c.groundGlow * glowOf(g);
  u.uScale.value = c.groundScale * g.noiseFrequency;
  u.uFlowSpeed.value = c.groundFlow * g.noiseSpeed;
  u.uEdgeFeather.value = c.groundEdge;
  u.uTurb.value = g.noiseStrength * g.turbulence;
  // The flood current runs along the cast direction, like the chevrons.
  const dir = rec.region?.direction;
  const dx = dir?.[0] ?? 0, dz = dir?.[2] ?? 1, len = Math.hypot(dx, dz) || 1;
  u.uFlowDir.value.x = dx / len;
  u.uFlowDir.value.y = dz / len;
  paint(u, rec.terrain);
  material.uniformsNeedUpdate = true;
}

/* ------------------------------------------------------------------------ */
/* Boundary veil                                                             */
/* ------------------------------------------------------------------------ */

const VEIL_VERTEX = /* glsl */ `
  uniform float uHeight;
  uniform float uRise;
  uniform float elevation;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    // The curtain grows up out of the ground as the field rises.
    vec3 p = vec3(position.x, position.y * uHeight * uRise, position.z);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewPos = -mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const VEIL_FRAGMENT = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float identity;
  uniform float uExit;
  uniform float uWarn;
  uniform float uCharge;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uBands;
  uniform vec3 uCore;
  uniform vec3 tint;
  uniform vec3 uEdge;
  uniform vec3 uTail;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;

  ${noiseGLSL}
  ${commonGLSL}
  ${BURN_GLSL}

  void main() {
    float y = vUv.y;
    float around = vUv.x;
    float n = snoise(vec3(around * 18.0, y * 3.0 - animClock * 0.8, identity * 2.0));
    float bands = 0.55 + 0.45 * sin(around * 6.2831853 * uBands + n * 1.5 + animClock * 0.6);
    int k = int(identity + 0.5);
    float fall = pow(1.0 - y, 2.2);
    if (k == 0) fall *= 0.6 + 0.6 * snoise01(vec3(around * 30.0, y * 4.0 - animClock * 2.5, 0.0)); // heat licks
    else if (k == 2) bands *= 0.3 + 1.2 * step(0.75, hash11(floor(around * 60.0) + floor(animClock * 14.0))); // vertical arcs
    else if (k == 3) fall *= smoothstep(0.55 + 0.1 * sin(around * 40.0 + animClock * 2.0), 0.0, y); // a low wave wall
    else if (k == 4) bands = step(0.5, fract(around * uBands * 2.0)) * 0.7 + 0.3; // glass panes
    // Brightest seen edge-on: the curtain reads as a boundary, not a wall.
    float rim = fresnelTerm(vViewPos, vNormalV, 1.5, 1.0);
    vec2 d = burnMask(snoise01(vec3(around * 20.0, y * 5.0, identity)), 1.0 - uExit, 0.06);
    float gutter = 1.0 - uWarn * (0.5 + 0.5 * sin(animClock * 15.0 + around * 30.0));
    vec3 col = gradient4(uCore, tint, uEdge, uTail, y * 0.8 + (1.0 - bands) * 0.3) * uGlow * (0.6 + rim) * (1.0 + uCharge);
    float alpha = fall * bands * (0.35 + 0.65 * clamp(rim, 0.0, 1.0)) * uOpacity * d.x * gutter + d.y * fall;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col + uCore * d.y * 2.0, clamp(alpha, 0.0, 1.0));
  }
`;

export function createWorldshapeVeilMaterial(slug, clock, elevation) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      elevation: { value: elevation },
      ...paletteUniforms(slug),
      uHeight: { value: WORLDSHAPE_LOOK.veilHeight },
      uRise: { value: 1 },
      uExit: { value: 1 },
      uWarn: { value: 0 },
      uCharge: { value: 0 },
      uOpacity: { value: WORLDSHAPE_LOOK.veilOpacity },
      uGlow: { value: WORLDSHAPE_LOOK.veilGlow },
      uBands: { value: WORLDSHAPE_LOOK.veilBands }
    },
    vertexShader: VEIL_VERTEX,
    fragmentShader: VEIL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false
  });
}

function veilHook(renderer, scene, camera, geometry, material) {
  const rec = WORLDSHAPE_FX.get(this);
  if (!rec) return;
  const c = WORLDSHAPE_LOOK, g = settings.global, u = material.uniforms;
  beats(rec);
  u.uHeight.value = c.veilHeight;
  u.uRise.value = rec.rise;
  u.uExit.value = rec.exit;
  u.uWarn.value = rec.warn;
  u.uCharge.value = rec.charge * c.chargeGlow * 0.5;
  u.uOpacity.value = c.veilOpacity * g.opacity;
  u.uGlow.value = c.veilGlow * glowOf(g);
  u.uBands.value = Math.round(c.veilBands);
  paint(u, rec.terrain);
  material.uniformsNeedUpdate = true;
}

/* ------------------------------------------------------------------------ */
/* Point systems                                                             */
/* ------------------------------------------------------------------------ */

const POINT_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 tint;
  uniform float uGlow;
  varying float vFade;
  varying float vHeat;
  void main() {
    float r = length(gl_PointCoord - vec2(0.5));
    float a = (1.0 - smoothstep(0.1, 0.5, r)) * vFade;
    if (a < 0.002) discard;
    gl_FragColor = vec4(mix(tint, uCore, vHeat) * 1.45 * uGlow, a);
  }
`;

/** 36 motes rising off the field, lifted onto the elevation cone. */
const MOTES_VERTEX = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float elevation;
  uniform float identity;
  uniform float uSize;
  uniform float uRise;
  uniform float uOpacity;
  uniform float uShown;
  uniform float uLifeRate;
  varying float vFade;
  varying float vHeat;
  void main() {
    vec3 p = position;
    float speed = identity < 0.5 ? 0.32 : identity < 1.5 ? 0.12 : identity < 2.5 ? 0.45 : 0.22;
    float phase = fract(animClock * speed * uLifeRate + position.y);
    p.y = elevation*max(0.0, 1.0 - length(position.xz)) + 0.1 + phase * uRise;
    vFade = sin(phase * 3.14159265) * uOpacity * uShown;
    vHeat = 1.0 - phase;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * 22.0 / max(1.0, -mv.z), 1.5, 6.0 * max(uSize, 0.2));
  }
`;

export function createWorldshapeMotesMaterial(slug, clock, elevation) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      elevation: { value: elevation },
      ...paletteUniforms(slug),
      uSize: { value: WORLDSHAPE_LOOK.moteSize },
      uRise: { value: WORLDSHAPE_LOOK.moteRise },
      uOpacity: { value: WORLDSHAPE_LOOK.moteOpacity },
      uShown: { value: 1 },
      uLifeRate: { value: 1 },
      uGlow: { value: 1 }
    },
    vertexShader: MOTES_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false
  });
}

/**
 * 48 spray points with per-terrain behaviour: scorched ash falls, glacier
 * snow drifts down in swirls, storm sparks hop along the floor, flood bubbles
 * rise and pop, glass glints hang and twinkle, continental dust kicks up low.
 * Seeds are (angle, radius, phase) in the unit disc; the field scales them.
 */
const SPRAY_VERTEX = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float elevation;
  uniform float identity;
  uniform float uSize;
  uniform float uHeight;
  uniform float uOpacity;
  uniform float uShown;
  uniform float uLifeRate;
  varying float vFade;
  varying float vHeat;

  ${noiseGLSL}

  void main() {
    int k = int(identity + 0.5);
    float a = position.x * 6.2831853;
    float r = sqrt(position.y) * 0.92;
    float rate = k == 0 ? 0.18 : k == 1 ? 0.1 : k == 2 ? 0.9 : k == 3 ? 0.5 : k == 4 ? 0.15 : 0.35;
    float life = fract(position.z + animClock * rate * uLifeRate);
    float y = 0.0;
    if (k == 0) { y = uHeight * (1.0 - life); a += life * 0.6; }
    else if (k == 1) { y = uHeight * (1.0 - life); a += sin(life * 6.2831853 + position.x * 9.0) * 0.25; }
    else if (k == 2) { y = 0.08 + 0.15 * abs(sin(life * 25.0)); a += floor(animClock * 8.0 + position.z * 5.0) * 0.37; }
    else if (k == 3) { y = 0.05 + life * 0.6; }
    else if (k == 4) { y = 0.3 + position.z * uHeight * 0.5; }
    else { y = 0.05 + 0.5 * sin(3.14159265 * life) * position.z; r *= 0.9 + 0.1 * life; }
    vec3 p = vec3(sin(a) * r, y, cos(a) * r);
    p.y += elevation*max(0.0, 1.0 - r);
    float fade = sin(3.14159265 * life);
    if (k == 4) fade = pow(abs(sin(animClock * 2.0 + position.x * 40.0)), 8.0);
    if (k == 3) fade *= 1.0 - smoothstep(0.85, 1.0, life);
    vFade = fade * uOpacity * uShown;
    vHeat = k == 0 ? life * 0.4 : 1.0 - life;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = k == 1 ? 1.2 : k == 2 ? 0.8 : k == 3 ? 1.1 : 1.0;
    gl_PointSize = clamp(uSize * size * 20.0 / max(1.0, -mv.z), 1.0, 6.0 * max(uSize, 0.2));
  }
`;

export function createWorldshapeSprayMaterial(slug, clock, elevation) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      elevation: { value: elevation },
      ...paletteUniforms(slug),
      uSize: { value: WORLDSHAPE_LOOK.spraySize },
      uHeight: { value: WORLDSHAPE_LOOK.sprayHeight },
      uOpacity: { value: WORLDSHAPE_LOOK.sprayOpacity },
      uShown: { value: 1 },
      uLifeRate: { value: 1 },
      uGlow: { value: 1 }
    },
    vertexShader: SPRAY_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false
  });
}

function pointBudget(geometry) {
  const count = geometry.attributes.position.count;
  geometry.drawRange.count = Math.max(0, Math.min(count, Math.round(count * settings.global.particleCount)));
}

function motesHook(renderer, scene, camera, geometry, material) {
  const rec = WORLDSHAPE_FX.get(this);
  if (!rec) return;
  const c = WORLDSHAPE_LOOK, g = settings.global, u = material.uniforms;
  beats(rec);
  const spray = rec.kind === 'spray';
  u.uSize.value = (spray ? c.spraySize : c.moteSize) * g.particleSize;
  if (spray) u.uHeight.value = c.sprayHeight;
  else u.uRise.value = c.moteRise;
  u.uOpacity.value = (spray ? c.sprayOpacity : c.moteOpacity) * g.opacity * (1 - rec.warn * 0.5);
  u.uShown.value = rec.rise * rec.exit;
  u.uGlow.value = glowOf(g) * (1 + rec.charge * 0.5);
  u.uLifeRate.value = 1 / Math.max(0.05, g.particleLifetime);
  paint(u, rec.terrain);
  pointBudget(geometry);
  material.uniformsNeedUpdate = true;
}

/* ------------------------------------------------------------------------ */
/* Pulse shockwave                                                           */
/* ------------------------------------------------------------------------ */

const SHOCK_VERTEX = /* glsl */ `
  uniform float elevation;
  varying vec2 vUnit;
  void main() {
    vUnit = position.xz;
    vec3 p = position;
    p.y = elevation*max(0.0, 1.0 - length(position.xz)) + 0.1;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const SHOCK_FRAGMENT = /* glsl */ `
  uniform float clock;
  uniform float uAnim;
  // The presentation clock, scaled by settings.global.animationSpeed.
  #define animClock (clock * uAnim)
  uniform float identity;
  uniform float uProgress;
  uniform float uWidth;
  uniform float uFade;
  uniform float uOpacity;
  uniform float uGlow;
  uniform vec3 uCore;
  uniform vec3 tint;
  uniform vec3 uEdge;
  uniform vec3 uTail;
  varying vec2 vUnit;

  ${noiseGLSL}
  ${commonGLSL}
  ${BURN_GLSL}

  void main() {
    float r = length(vUnit);
    float ang = atan(vUnit.x, vUnit.y);
    float n = snoise(vec3(ang * 3.0, r * 6.0, animClock * 2.0 + identity));
    float w = max(uWidth * 0.5, 0.01);
    float d = (r - uProgress) / w;
    float band = exp(-d * d) * (0.75 + 0.25 * n);
    int k = int(identity + 0.5);
    if (k == 2) band *= 0.35 + step(0.5, hash11(floor(ang * 12.0) + floor(animClock * 20.0)));
    else if (k == 4) band *= 0.6 + 0.4 * step(0.5, fract(ang * 1.909859)); // twelve facets
    float wash = (1.0 - smoothstep(0.0, max(uProgress, 1e-3), r)) * 0.25;
    vec3 col = gradient4(uCore, tint, uEdge, uTail, 1.0 - clamp(band, 0.0, 1.0)) * (band * 1.7 + wash) * uGlow;
    float alpha = (band + wash) * uFade * uOpacity * (1.0 - smoothstep(0.96, 1.0, r));
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * Pulse rings expose `material.color` (the same Color as their `tint`
 * uniform) so they read like the presentation's other pulse meshes to any
 * code that inspects `material.color`.
 */
export function createWorldshapeShockMaterial(slug, clock, elevation) {
  const material = new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      elevation: { value: elevation },
      ...paletteUniforms(slug),
      uProgress: { value: 0.9 },
      uWidth: { value: WORLDSHAPE_LOOK.shockWidth },
      uFade: { value: 1 },
      uOpacity: { value: WORLDSHAPE_LOOK.shockOpacity },
      uGlow: { value: WORLDSHAPE_LOOK.shockGlow }
    },
    vertexShader: SHOCK_VERTEX,
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
  material.color = material.uniforms.tint.value;
  return material;
}

/** Pulse records carry `life` (the cue's 0.35 s presentation life). */
function shockHook(renderer, scene, camera, geometry, material) {
  const rec = WORLDSHAPE_FX.get(this);
  if (!rec) return;
  const c = WORLDSHAPE_LOOK, g = settings.global, u = material.uniforms;
  const t = clamp01(age(rec) / rec.life);
  ANIM.value = g.animationSpeed;
  // Bursts from the centre to the rim; reduced motion holds it at the rim and fades.
  u.uProgress.value = rec.view.reducedMotion ? 0.92 : 0.15 + 0.8 * (1 - (1 - t) * (1 - t));
  u.uWidth.value = c.shockWidth;
  u.uFade.value = (1 - t) * g.explosionIntensity;
  u.uOpacity.value = c.shockOpacity * g.opacity;
  u.uGlow.value = c.shockGlow * glowOf(g);
  paint(u, rec.terrain);
  material.uniformsNeedUpdate = true;
}

/* ------------------------------------------------------------------------ */
/* Shimmer (distortion proxy)                                                */
/* ------------------------------------------------------------------------ */

const SHIMMER_VERTEX = /* glsl */ `
  uniform float uHeight;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position.x, position.y * uHeight, position.z, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
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
    // tint only decorrelates the noise between terrains.
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.5 - animClock * uSpeed) + tint * 5.0;
    float nx = snoise(np);
    float ny = snoise(np + vec3(19.3, 7.7, 31.1));
    float mask = (1.0 - smoothstep(0.25, 1.0, vUv.y)) * smoothstep(0.0, 0.08, vUv.y);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, strength, mask);
  }
`;

export function createWorldshapeShimmerMaterial(clock) {
  return new ShaderMaterial({
    uniforms: {
      clock,
      uAnim: ANIM,
      tint: { value: new Color(WORLDSHAPE_LOOK.scorchedB) },
      uHeight: { value: WORLDSHAPE_LOOK.shimmerHeight },
      uStrength: { value: WORLDSHAPE_LOOK.shimmerStrength },
      uScale: { value: WORLDSHAPE_LOOK.shimmerScale },
      uSpeed: { value: WORLDSHAPE_LOOK.shimmerSpeed },
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
  const rec = WORLDSHAPE_FX.get(this);
  if (!rec) return;
  const c = WORLDSHAPE_LOOK, g = settings.global, u = material.uniforms;
  beats(rec);
  u.uHeight.value = c.shimmerHeight;
  u.uStrength.value = c.shimmerStrength * (SHIMMER_WEIGHT[rec.terrain] ?? 0.4) * g.distortion * rec.rise * rec.exit;
  u.uScale.value = c.shimmerScale * g.noiseFrequency;
  u.uSpeed.value = c.shimmerSpeed * g.noiseSpeed;
  u.tint.value.copy(getColor(WORLDSHAPE_LOOK[PALETTE[rec.terrain]?.[1] ?? 'scorchedB']));
  material.uniformsNeedUpdate = true;
}

const HOOKS = {
  lines: linesHook,
  ground: groundHook,
  veil: veilHook,
  motes: motesHook,
  spray: motesHook,
  shock: shockHook,
  shimmer: shimmerHook
};
