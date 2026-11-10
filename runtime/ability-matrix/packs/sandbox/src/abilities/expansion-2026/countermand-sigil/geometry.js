import {
  ExtrudeGeometry,
  LatheGeometry,
  Path,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  Vector2,
} from 'three';

/**
 * Countermand Sigil — procedural geometry. Built once per pool member, in
 * unit space (the seal's outer radius is 1); the ability scales from settings.
 *
 *  - **the seal** — an extruded, bevelled ring whose outer edge is cut into
 *    sixteen crenellations with four heavier clasps between them. Stands in
 *    the XY plane, thickness along Z, centred on the origin.
 *  - **the glyph ring** — a thinner annulus pierced right through by twelve
 *    glyph-shaped holes (slot, diamond, wedge, cross-slot): the runes are cut
 *    out of the metal, so the iris light shows through them.
 *  - **the veto bar** — a bevelled blade with chisel ends and a waisted
 *    middle, along X, the length of the ring's diameter plus overhang.
 *  - **the writ** — a hexagonal rune-nail turned on a lathe and flat-shaded:
 *    tip at y = 0, head at y = 1.
 */

const TAU = Math.PI * 2;

/** Seal outline radius at angle `a` — teeth, gaps and four clasps. */
function sealRadius(a, cells) {
  const u = ((a / TAU) % 1 + 1) % 1;
  const cell = u * cells;
  const f = cell - Math.floor(cell);
  // Steep smooth flanks: a tooth spans 58 % of a cell.
  const edge = (x, w) => {
    const t = Math.max(0, Math.min(1, x / w));
    return t * t * (3 - 2 * t);
  };
  const tooth = edge(f - 0.18, 0.05) * (1 - edge(f - 0.76, 0.05));
  let r = 0.93 + 0.07 * tooth;
  // Clasps: one every four cells, offset half a cell, a broad flat lug.
  const claspCell = Math.floor(cell + 2) % 4 === 0;
  if (claspCell) {
    const g = (cell + 2) - Math.floor(cell + 2);
    const lug = edge(g - 0.1, 0.06) * (1 - edge(g - 0.84, 0.06));
    r = Math.max(r, 0.93 + 0.17 * lug);
  }
  return r;
}

/** The standing seal: crenellated, clasped, bevelled ring. */
export function createSealGeometry({ cells = 16, inner = 0.74, depth = 0.26, samples = 640 } = {}) {
  const shape = new Shape();
  for (let i = 0; i <= samples; i++) {
    const a = (i / samples) * TAU;
    const r = sealRadius(a, cells);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const hole = new Path();
  const holeSamples = 160;
  for (let i = 0; i <= holeSamples; i++) {
    const a = -(i / holeSamples) * TAU;
    const x = Math.cos(a) * inner;
    const y = Math.sin(a) * inner;
    if (i === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  shape.holes.push(hole);
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** One glyph hole centred at polar (r, a), sized `s`, wound clockwise. */
function glyphHole(kind, r, a, s) {
  const c = Math.cos(a);
  const sn = Math.sin(a);
  // Local frame: t along the tangent, n along the radius.
  const at = (t, n) => new Vector2((r + n) * c - t * sn, (r + n) * sn + t * c);
  let pts;
  switch (kind % 4) {
    case 0: // tangential slot
      pts = [at(-s * 0.9, -s * 0.28), at(-s * 0.9, s * 0.28), at(s * 0.9, s * 0.28), at(s * 0.9, -s * 0.28)];
      break;
    case 1: // diamond
      pts = [at(0, -s * 0.62), at(-s * 0.55, 0), at(0, s * 0.62), at(s * 0.55, 0)];
      break;
    case 2: // wedge pointing outward
      pts = [at(-s * 0.6, -s * 0.5), at(0, s * 0.62), at(s * 0.6, -s * 0.5)];
      break;
    default: // radial slot with a notch (a stave)
      pts = [at(-s * 0.2, -s * 0.66), at(-s * 0.2, s * 0.66), at(s * 0.2, s * 0.66), at(s * 0.2, s * 0.1), at(s * 0.42, 0), at(s * 0.2, -s * 0.1), at(s * 0.2, -s * 0.66)];
  }
  const path = new Path();
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  path.lineTo(pts[0].x, pts[0].y);
  return path;
}

/** The silver glyph ring, its runes cut right through. */
export function createGlyphRingGeometry({ inner = 0.53, outer = 0.71, glyphs = 12, depth = 0.12 } = {}) {
  const shape = new Shape();
  const n = 128;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    if (i === 0) shape.moveTo(Math.cos(a) * outer, Math.sin(a) * outer);
    else shape.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
  }
  const rim = new Path();
  for (let i = 0; i <= n; i++) {
    const a = -(i / n) * TAU;
    if (i === 0) rim.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    else rim.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
  }
  shape.holes.push(rim);
  const mid = (inner + outer) * 0.5;
  const size = (outer - inner) * 0.36;
  for (let i = 0; i < glyphs; i++) {
    // A fixed, hand-ordered glyph sequence so the ring reads as writing.
    const kind = [0, 1, 3, 2, 1, 0, 2, 3, 0, 3, 1, 2][i % 12];
    shape.holes.push(glyphHole(kind, mid, (i / glyphs) * TAU + 0.13, size));
  }
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.012,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** The veto bar: chisel-ended, waisted blade along X, unit seal space. */
export function createBarGeometry({ length = 2.36, width = 0.26, depth = 0.16 } = {}) {
  const h = length / 2;
  const w = width / 2;
  const shape = new Shape();
  shape.moveTo(-h, 0);
  shape.lineTo(-h + 0.22, w);
  shape.lineTo(-0.3, w * 0.86);
  shape.lineTo(-0.12, w * 1.25); // the guard notch at the waist
  shape.lineTo(0.12, w * 1.25);
  shape.lineTo(0.3, w * 0.86);
  shape.lineTo(h - 0.22, w);
  shape.lineTo(h, 0);
  shape.lineTo(h - 0.22, -w);
  shape.lineTo(0.3, -w * 0.86);
  shape.lineTo(0.12, -w * 1.25);
  shape.lineTo(-0.12, -w * 1.25);
  shape.lineTo(-0.3, -w * 0.86);
  shape.lineTo(-h + 0.22, -w);
  shape.lineTo(-h, 0);
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** The writ: a hexagonal rune-nail, tip at y = 0, head at y = 1, flat-shaded. */
export function createWritGeometry() {
  const profile = [
    [0.0, 0.0],
    [0.05, 0.1],
    [0.075, 0.36],
    [0.085, 0.6],
    [0.06, 0.7],
    [0.06, 0.74],
    [0.17, 0.8],
    [0.19, 0.86],
    [0.11, 0.9],
    [0.13, 0.95],
    [0.08, 0.99],
    [0.0, 1.0],
  ].map(([x, y]) => new Vector2(x, y));
  const lathe = new LatheGeometry(profile, 6);
  const geometry = lathe.toNonIndexed();
  lathe.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

/** Unit quad (floor brand, iris, lens). */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}

/** Carrier for the N·V aura shell. */
export function createAuraGeometry() {
  return new SphereGeometry(1, 40, 20);
}
