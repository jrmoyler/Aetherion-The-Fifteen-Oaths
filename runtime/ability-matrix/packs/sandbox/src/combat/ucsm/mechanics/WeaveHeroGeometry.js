import { BufferGeometry, Float32BufferAttribute } from 'three';
import {
  createWeaveRibbonMaterial,
  createWeaveLinkMotesMaterial,
  createWeaveAnchorMotesMaterial,
  createWeaveSigilMaterial,
  createWeaveTrailMaterial,
  createWeaveShockMaterial,
  createWeaveBeamMaterial,
  createWeaveFloodMaterial,
  createWeaveShimmerMaterial
} from './WeaveShaders.js';

/**
 * WeaveHeroGeometry — the authored procedural geometry of the weave family,
 * and the pooled registry that hands it to the presentation.
 *
 * Nothing here is per-cast. Every geometry and material is built once per
 * weave *style* the first time a cast of that style needs it, registered in the
 * presentation's `geo` / `mat` tables and its `resources` list, and freed by
 * `MechanicPresentation#dispose`. A cast only ever creates `Mesh` / `Points`
 * wrappers around these shared resources, which is why a pruned or cleared
 * item needs no disposal of its own.
 *
 * The shapes:
 *
 *  - **Surface** (`createWeaveSurface`) — the hero ribbons. An anchor gets five
 *    strands wound into a helix whose pitch, waist and facets are the style's
 *    signature (wind winds tight, earth squats, frost and crystal kink into
 *    facets). A link gets two or three braided strands in a unit box that the
 *    link scales to its length; their lateral extent plus the shader's capped
 *    sway stays inside the authoritative collision capsule.
 *  - **Sigil** (`createWeaveSigil`) — the rosette burnt into the ground under an
 *    anchor: a rune rim (which also carries the remaining-life arc), an inner
 *    ring, and a glyph that is unique per style. Built as flat strips with
 *    `uv.y` across the stroke so the shader can draw soft-edged lines.
 *  - **Pylon** (`createWeavePylon`) — a lathed solid body for each themed
 *    anchor, with a facet count and profile per style: a storm insulator stack,
 *    a water teardrop, a pentagonal earth monolith, a crystal bipyramid and a
 *    slender wind mast.
 *  - **Trail / shock / flood / shimmer / motes** — the small utility meshes the
 *    other layers ride on (see each builder).
 *
 * Every builder is deterministic: no `Math.random`, only index-derived hashes,
 * so two casts of the same style are identical and tests can hash them.
 */

/** The seven implemented weave identities, in shader `character` order. */
export const WEAVE_HERO_STYLES = Object.freeze(['fire', 'frost', 'storm', 'water', 'earth', 'crystal', 'wind']);

const TAU = Math.PI * 2;

/** Resolve a weave uid to its visual style. The default weave is fire. */
export function weaveStyle(uid = '') {
  if (uid.includes('cryostasis')) return 'frost';
  if (uid.includes('thunder')) return 'storm';
  if (uid.includes('hydrostatic')) return 'water';
  if (uid.includes('tectonic')) return 'earth';
  if (uid.includes('prismatic')) return 'crystal';
  if (uid.includes('jetstream')) return 'wind';
  return 'fire';
}

/** Deterministic 0..1 hash of an integer, for authored jitter. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Pack plain arrays into an indexed BufferGeometry with bounds computed. */
function finish(name, positions, uvs, indices, extra = null, normals = false) {
  const g = new BufferGeometry();
  g.name = name;
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  if (uvs) g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  if (extra) for (const [key, [data, size]] of Object.entries(extra)) g.setAttribute(key, new Float32BufferAttribute(data, size));
  if (indices) g.setIndex(indices);
  if (normals) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------------ */
/* Hero ribbons                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Anchor helix or link braid for one style.
 *
 * The vertex layout (strands × steps × 2) and every position are part of the
 * family's tested contract: 100–300 vertices, unique per style, and for links
 * `|x| + 0.04 <= 0.625` so the 0.04 m shader sway can never leave the capsule
 * once the link scales the box by `1.6 × width`.
 *
 * `aStrand` (0..1 per strand) lets the shader phase each strand separately.
 */
export function createWeaveSurface(style, role) {
  const index = WEAVE_HERO_STYLES.indexOf(style);
  if (index < 0 || !['anchor', 'link'].includes(role)) throw new Error('Unknown weave surface');
  const link = role === 'link';
  const positions = [], uvs = [], indices = [], strand = [];
  const strips = link ? (style === 'storm' ? 3 : 2) : 5; // storm braids a third live wire
  const steps = link ? 32 : 24;
  const width = link ? 0.06 : 0.075;
  for (let n = 0; n < strips; n++) {
    const start = positions.length / 3;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let x, y, z;
      if (link) {
        const phase = n * 2.1 + index * 0.31;
        // Storm snaps between rails, earth steps in thirds, the rest undulate
        // with a style-specific number of waves along the span.
        const wave = style === 'storm' ? (i % 2 ? 1 : -1) * 0.1
          : style === 'earth' ? ((i % 3) - 1) * 0.055
          : Math.sin(t * TAU * (1 + (index % 3)) + phase) * 0.09;
        x = wave + (n - (strips - 1) / 2) * 0.07;
        y = 0.02 * Math.sin(t * Math.PI * 4 + phase);
        z = t - 0.5;
      } else {
        // Pitch of the helix: wind winds tight, earth barely turns.
        const pitch = style === 'wind' ? 2.5 : style === 'water' ? 1.4 : style === 'storm' ? 0.8 : 0.4;
        const a = (n * TAU) / strips + t * Math.PI * pitch;
        // A waist that swells mid-height; earth stays squat and close.
        const radius = 0.22 + 0.28 * Math.sin(Math.PI * t) * (style === 'earth' ? 0.55 : 1);
        x = Math.sin(a) * radius;
        y = 0.15 + t * 1.55;
        z = Math.cos(a) * radius;
        if (style === 'frost' || style === 'crystal') {
          // Faceted kinks: the strand snaps between planes instead of curving.
          const facets = style === 'crystal' ? 4 : 3;
          x *= 0.5 + Math.abs(Math.sin(t * Math.PI * facets));
          z *= 0.5 + Math.abs(Math.cos(t * Math.PI * facets));
        }
        if (style === 'fire') x += Math.sin(t * 12 + n) * 0.12 * t; // licks wider toward the tip
        if (style === 'storm') x += (i % 2 ? 1 : -1) * 0.11; // zig-zag discharge
      }
      // Taper both ends so a strand never starts or stops as a hard square.
      const w = width * (0.3 + 0.7 * Math.sin((Math.PI * (i + 0.5)) / (steps + 1)));
      positions.push(x - w, y, z, x + w, y, z);
      uvs.push(t, 0, t, 1);
      strand.push(n / Math.max(1, strips - 1), n / Math.max(1, strips - 1));
      if (i) {
        const a = start + (i - 1) * 2, b = start + i * 2;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const g = finish(`weave-${role}:${style}`, positions, uvs, indices, { aStrand: [strand, 1] });
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------------ */
/* Ground sigil                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Flat stroke builder shared by the sigil: a polyline in the XZ plane turned
 * into a strip `width` wide. `uv.x` runs along, `uv.y` across, and `aBand`
 * tags which part of the drawing the stroke belongs to (0 rim, 1 glyph,
 * 2 inner ring) so one shader can treat them differently.
 */
function strokeBuilder() {
  const positions = [], uvs = [], bands = [], indices = [];
  const stroke = (points, width, band, closed = false) => {
    const start = positions.length / 3, count = points.length;
    for (let i = 0; i < count; i++) {
      const [x, z] = points[i];
      const prev = points[closed ? (i - 1 + count) % count : Math.max(0, i - 1)];
      const next = points[closed ? (i + 1) % count : Math.min(count - 1, i + 1)];
      const dx = next[0] - prev[0], dz = next[1] - prev[1], len = Math.hypot(dx, dz) || 1;
      // Open strokes taper to points; closed loops keep their width.
      const w = closed ? width : width * (0.35 + 0.65 * Math.sin((Math.PI * (i + 0.5)) / count));
      positions.push(x - (dz / len) * w, 0, z + (dx / len) * w, x + (dz / len) * w, 0, z - (dx / len) * w);
      const u = i / (count - 1);
      uvs.push(u, 0, u, 1);
      bands.push(band, band);
      if (i) {
        const a = start + (i - 1) * 2, b = start + i * 2;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  };
  const circle = (r, segments = 64) => {
    const out = [];
    for (let i = 0; i <= segments; i++) out.push([Math.sin((i / segments) * TAU) * r, Math.cos((i / segments) * TAU) * r]);
    return out;
  };
  return { positions, uvs, bands, indices, stroke, circle };
}

/** The unique rosette of one weave style, unit radius, lying at y = 0. */
export function createWeaveSigil(style) {
  if (!WEAVE_HERO_STYLES.includes(style)) throw new Error('Unknown weave sigil');
  const b = strokeBuilder();
  b.stroke(b.circle(0.9), 0.05, 0, true); // rune rim + life arc
  b.stroke(b.circle(0.36, 40), 0.028, 2, true); // inner ring
  const polar = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];
  if (style === 'fire') {
    // Seven flame tongues curling clockwise off the inner ring.
    for (let k = 0; k < 7; k++) {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12, a = (k * TAU) / 7 + Math.sin(t * Math.PI) * 0.35 + t * 0.25;
        pts.push(polar(a, 0.38 + t * 0.46));
      }
      b.stroke(pts, 0.045, 1);
    }
  } else if (style === 'frost') {
    // Six-fold snowflake: spokes with two pairs of barbs.
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6;
      b.stroke([polar(a, 0.38), polar(a, 0.6), polar(a, 0.86)], 0.03, 1);
      for (const r of [0.55, 0.72]) for (const side of [-1, 1])
        b.stroke([polar(a, r), polar(a + side * 0.22, r + 0.12)], 0.022, 1);
    }
  } else if (style === 'storm') {
    // A jagged mid-ring and four forked bolts.
    const zig = [];
    for (let i = 0; i <= 36; i++) zig.push(polar((i / 36) * TAU, 0.62 + (i % 2 ? 0.05 : -0.05)));
    b.stroke(zig, 0.022, 1, true);
    for (let k = 0; k < 4; k++) {
      const a = (k * TAU) / 4 + 0.4;
      b.stroke([polar(a, 0.36), polar(a + 0.18, 0.52), polar(a - 0.1, 0.68), polar(a + 0.12, 0.86)], 0.032, 1);
    }
  } else if (style === 'water') {
    // Three spiral arms, a whirlpool drawn in one stroke each.
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let i = 0; i <= 28; i++) {
        const t = i / 28;
        pts.push(polar((k * TAU) / 3 + t * TAU * 0.7, 0.2 + t * 0.66));
      }
      b.stroke(pts, 0.035, 1);
    }
  } else if (style === 'earth') {
    // Two offset pentagons and five buttress spokes: a surveyed foundation.
    for (const [r, off] of [[0.62, 0], [0.78, Math.PI / 5]]) {
      const pts = [];
      for (let i = 0; i <= 5; i++) pts.push(polar((i * TAU) / 5 + off, r));
      b.stroke(pts, 0.035, 1, true);
    }
    for (let k = 0; k < 5; k++) b.stroke([polar((k * TAU) / 5, 0.38), polar((k * TAU) / 5, 0.62)], 0.04, 1);
  } else if (style === 'crystal') {
    // Hexagram over an inner hexagon.
    for (const off of [0, Math.PI / 3]) {
      const pts = [];
      for (let i = 0; i <= 3; i++) pts.push(polar((i * TAU) / 3 + off, 0.86));
      b.stroke(pts, 0.026, 1, true);
    }
    const hex = [];
    for (let i = 0; i <= 6; i++) hex.push(polar((i * TAU) / 6 + Math.PI / 6, 0.5));
    b.stroke(hex, 0.024, 1, true);
  } else {
    // Wind: four swept crescent vanes, a turbine seen from above.
    for (let k = 0; k < 4; k++) {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        pts.push(polar((k * TAU) / 4 + t * 1.1, 0.4 + Math.sin(t * Math.PI) * 0.3 + t * 0.14));
      }
      b.stroke(pts, 0.04, 1);
    }
  }
  return finish(`weave-sigil:${style}`, b.positions, b.uvs, b.indices, { aBand: [b.bands, 1] });
}

/* ------------------------------------------------------------------------ */
/* Lathed pylons                                                             */
/* ------------------------------------------------------------------------ */

/** Profiles as [radius, height] pairs, bottom to top, plus facet count. */
const PYLON_PROFILES = {
  storm: {
    facets: 10,
    profile: [[0.2, 0], [0.16, 0.25], [0.3, 0.32], [0.14, 0.42], [0.28, 0.6], [0.13, 0.7], [0.26, 0.88],
      [0.12, 0.98], [0.24, 1.16], [0.11, 1.26], [0.2, 1.42], [0.08, 1.62], [0.0, 1.78]]
  },
  water: {
    facets: 16,
    profile: [[0.18, 0], [0.1, 0.38], [0.12, 0.74], [0.27, 0.98], [0.33, 1.14], [0.3, 1.28], [0.2, 1.42], [0.08, 1.56], [0.0, 1.64]]
  },
  earth: {
    facets: 5,
    profile: [[0.36, 0], [0.35, 0.34], [0.28, 0.36], [0.27, 0.9], [0.21, 0.93], [0.2, 1.42], [0.11, 1.56], [0.0, 1.62]]
  },
  crystal: {
    facets: 6,
    profile: [[0.02, 0.22], [0.27, 0.66], [0.25, 1.22], [0.0, 1.96]]
  },
  wind: {
    facets: 8,
    profile: [[0.15, 0], [0.09, 0.3], [0.065, 1.32], [0.12, 1.42], [0.06, 1.5], [0.0, 1.72]]
  }
};

/**
 * A solid lathed body. Earth's rings get a deterministic per-vertex chip so
 * the monolith reads as quarried rather than turned on a lathe.
 */
export function createWeavePylon(style) {
  const spec = PYLON_PROFILES[style];
  if (!spec) throw new Error('Unknown weave pylon');
  const { facets, profile } = spec;
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j < profile.length; j++) {
    const [r, y] = profile[j];
    for (let i = 0; i <= facets; i++) {
      const a = ((i % facets) / facets) * TAU + (style === 'earth' ? 0.3 : 0);
      const chip = style === 'earth' ? 1 + 0.08 * (hash(i * 13 + j * 7) - 0.5) : 1;
      positions.push(Math.sin(a) * r * chip, y, Math.cos(a) * r * chip);
      uvs.push(i / facets, j / (profile.length - 1));
      if (j && i < facets) {
        const a0 = (j - 1) * (facets + 1) + i, b0 = j * (facets + 1) + i;
        indices.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
      }
    }
  }
  return finish(`weave-pylon:${style}`, positions, uvs, indices, null, true);
}

/* ------------------------------------------------------------------------ */
/* Utility meshes                                                            */
/* ------------------------------------------------------------------------ */

/** Unit ground strip (x, z in -0.5..0.5) the link scales to its capsule. */
export function createWeaveTrail() {
  const positions = [], uvs = [], indices = [];
  const rows = 24, cols = 2;
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) {
      positions.push(i / cols - 0.5, 0, j / rows - 0.5);
      uvs.push(i / cols, j / rows);
      if (i < cols && j < rows) {
        const a = j * (cols + 1) + i, b = a + cols + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  return finish('weave-trail', positions, uvs, indices);
}

/** Unit disc with radial `uv.y`, the canvas every shockwave is drawn on. */
export function createWeaveShock() {
  const positions = [0, 0, 0], uvs = [0, 0], indices = [];
  const rings = 8, segments = 64;
  for (let j = 1; j <= rings; j++)
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU, r = j / rings;
      positions.push(Math.sin(a) * r, 0, Math.cos(a) * r);
      uvs.push(i / segments, r);
    }
  for (let i = 0; i < segments; i++) indices.push(0, 1 + i, 2 + i);
  for (let j = 1; j < rings; j++)
    for (let i = 0; i < segments; i++) {
      const a = 1 + (j - 1) * (segments + 1) + i, b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  return finish('weave-shock', positions, uvs, indices);
}

/**
 * Unit right triangle with a barycentric attribute. A flood cue maps it onto
 * the real anchor triangle with an affine matrix, so no per-cue geometry is
 * ever allocated (and none is left behind for the presentation to leak).
 */
export function createWeaveFloodTriangle() {
  return finish('weave-flood', [0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 0, 1, 0, 0, 1], [0, 2, 1],
    { aBary: [[1, 0, 0, 0, 1, 0, 0, 0, 1], 3] });
}

/** Unit quad (x -0.5..0.5, y 0..1) billboarded by the shimmer shader. */
export function createWeaveShimmerQuad() {
  return finish('weave-shimmer', [-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], [0, 0, 1, 0, 0, 1, 1, 1], [0, 1, 2, 2, 1, 3]);
}

/** Seed cloud for the anchor motes: the shader places every point. */
export function createWeaveAnchorMoteSeeds(count = 48) {
  const positions = [];
  for (let i = 0; i < count; i++) positions.push(hash(i * 3.1), hash(i * 7.7 + 1), (i + 0.5) / count);
  return finish('weave-anchor-motes', positions, null, null);
}

/** Twenty points spread along a unit link; the shader scrolls them. */
function createWeaveLinkMoteSeeds() {
  const positions = [];
  for (let i = 0; i < 20; i++) positions.push(Math.sin(i * 2.399) * 0.13, 0.04 + ((i * 7) % 9) * 0.012, (i + 0.5) / 20 - 0.5);
  return finish('weaveMotes:geometry', positions, null, null);
}

/** Thirty-two seeds for the link's second (spark) system. */
function createWeaveSparkSeeds() {
  const positions = [];
  for (let i = 0; i < 32; i++) positions.push(hash(i * 5.3) * 2 - 1, hash(i * 9.1 + 3), (i + 0.5) / 32);
  return finish('weaveSparks:geometry', positions, null, null);
}

/* ------------------------------------------------------------------------ */
/* Registry: build once per style, owned and disposed by the presentation    */
/* ------------------------------------------------------------------------ */

function ensureGeometry(v, key, build) {
  if (!v.geo[key]) {
    const g = build();
    v.geo[key] = g;
    v.resources.push(g);
  }
  return key;
}

function ensureMaterial(v, key, build) {
  if (!v.mat[key]) {
    const m = build();
    m.name = key;
    v.mat[key] = m;
    v.resources.push(m);
  }
  return key;
}

/** Hero ribbon for an anchor or link. Anchor and link share one material. */
export function ensureWeaveSurface(v, style, role) {
  return {
    geometry: ensureGeometry(v, `weaveHero:${role}:${style}`, () => createWeaveSurface(style, role)),
    material: ensureMaterial(v, `weaveGlow:${style}`, () => createWeaveRibbonMaterial(style, v.terrainTime))
  };
}

/** The twenty link motes. Geometry is shared across every style. */
export function ensureWeaveMotes(v, style) {
  return {
    geometry: ensureGeometry(v, 'weaveMotes:geometry', createWeaveLinkMoteSeeds),
    material: ensureMaterial(v, `weaveMotes:${style}`, () => createWeaveLinkMotesMaterial(style, v.terrainTime))
  };
}

/** Thirty-two link sparks. */
export function ensureWeaveSparks(v, style) {
  return {
    geometry: ensureGeometry(v, 'weaveSparks:geometry', createWeaveSparkSeeds),
    material: ensureMaterial(v, `weaveSparks:${style}`, () => createWeaveLinkMotesMaterial(style, v.terrainTime, true))
  };
}

/** Forty-eight motes orbiting an anchor. */
export function ensureWeaveAnchorMotes(v, style) {
  return {
    geometry: ensureGeometry(v, 'weaveAnchorMotes:geometry', () => createWeaveAnchorMoteSeeds(48)),
    material: ensureMaterial(v, `weaveAnchorMotes:${style}`, () => createWeaveAnchorMotesMaterial(style, v.terrainTime))
  };
}

/** Ground sigil of one style. */
export function ensureWeaveSigil(v, style) {
  return {
    geometry: ensureGeometry(v, `weaveSigil:${style}`, () => createWeaveSigil(style)),
    material: ensureMaterial(v, `weaveSigil:${style}`, () => createWeaveSigilMaterial(style, v.terrainTime))
  };
}

/** Solid lathed pylon, drawn with one of the presentation's lit materials. */
export function ensureWeavePylon(v, style) {
  return ensureGeometry(v, `weavePylon:${style}`, () => createWeavePylon(style));
}

/** Link ground trail. */
export function ensureWeaveTrail(v, style) {
  return {
    geometry: ensureGeometry(v, 'weaveTrail:geometry', createWeaveTrail),
    material: ensureMaterial(v, `weaveTrail:${style}`, () => createWeaveTrailMaterial(style, v.terrainTime))
  };
}

/** Cue shockwave disc. */
export function ensureWeaveShock(v, style) {
  return {
    geometry: ensureGeometry(v, 'weaveShock:geometry', createWeaveShock),
    material: ensureMaterial(v, `weaveShock:${style}`, () => createWeaveShockMaterial(style, v.terrainTime))
  };
}

/** Energy beam / shard material for cue geometry (rides stock shapes). */
export function ensureWeaveBeam(v, style) {
  return ensureMaterial(v, `weaveBeam:${style}`, () => createWeaveBeamMaterial(style, v.terrainTime));
}

/** Flooded triangle fill. */
export function ensureWeaveFlood(v) {
  return {
    geometry: ensureGeometry(v, 'weaveFlood:geometry', createWeaveFloodTriangle),
    material: ensureMaterial(v, 'weaveFlood:water', () => createWeaveFloodMaterial(v.terrainTime))
  };
}

/** Screen-space shimmer proxy (one material for every style). */
export function ensureWeaveShimmer(v) {
  return {
    geometry: ensureGeometry(v, 'weaveShimmer:geometry', createWeaveShimmerQuad),
    material: ensureMaterial(v, 'weaveShimmer', () => createWeaveShimmerMaterial(v.terrainTime))
  };
}
