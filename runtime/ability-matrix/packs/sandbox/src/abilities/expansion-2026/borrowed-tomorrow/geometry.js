import {
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Path,
  PlaneGeometry,
  Shape,
  Vector2,
} from 'three';

/**
 * Borrowed Tomorrow — procedural geometry. A clock, built as a clockmaker
 * would: turned brass, cut gears, sculpted hands.
 *
 *  - **bezels** — turned rings: authored (radius, height) profiles revolved
 *    round Y, so each has a real stepped section with a lip and a chamfer.
 *  - **the gear train** — cut gears: trapezoid teeth, a hub, and spoke
 *    windows punched through, extruded with a small bevel.
 *  - **hands and indices** — spade hour hand, counterweighted minute hand and
 *    crowned hour indices, all extruded from authored outlines with a bevel.
 *  - **the pendulum** — a pierced rod and a lens-shaped turned bob.
 *  - **the glass** — irregular bevelled cut-glass fragments.
 *  - **the sand** — a fixed seed cloud placed entirely in the shader.
 *
 * Everything is built once per pool member and disposed with it.
 */

const TAU = Math.PI * 2;

/* ---------------------------------------------------------------------- */
/* Turned bezels                                                           */
/* ---------------------------------------------------------------------- */

/** Bezel profiles: [radius, height] pairs, outside → inside, unit radius. */
const PROFILES = {
  // Heavy outer bezel: chamfered lip, a bead, a step down to the glass.
  outer: [[0.95, 0], [1.0, 0], [1.02, 0.03], [1.01, 0.06], [0.985, 0.075], [0.96, 0.06], [0.94, 0.045], [0.93, 0]],
  // Slim inner bezel with a single bead.
  inner: [[0.97, 0], [1.0, 0], [1.008, 0.025], [0.995, 0.045], [0.975, 0.035], [0.965, 0]],
  // The chapter ring the hour indices sit on: a flat band with raised edges.
  chapter: [[0.58, 0], [0.59, 0.02], [0.6, 0.012], [0.64, 0.012], [0.65, 0.02], [0.66, 0]],
};

/** A turned ring from one of `PROFILES`. Lies flat (revolved round Y). */
export function createBezelGeometry(kind = 'outer', segments = 128) {
  const points = PROFILES[kind].map(([r, y]) => new Vector2(r, y));
  const g = new LatheGeometry(points, segments);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* The gear train                                                          */
/* ---------------------------------------------------------------------- */

/**
 * A cut gear lying flat (XZ), `thickness` tall.
 * @param {object} o { teeth, radius, depth, hub, spokes, thickness }
 */
export function createGearGeometry({ teeth = 24, radius = 0.5, depth = 0.06, hub = 0.08, spokes = 5, thickness = 0.04 } = {}) {
  const shape = new Shape();
  const root = radius - depth;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    const w = TAU / teeth;
    // Trapezoid tooth: root, flank up, flat top, flank down.
    const pts = [
      [a, root], [a + w * 0.18, radius], [a + w * 0.5, radius], [a + w * 0.68, root],
    ];
    for (let k = 0; k < pts.length; k++) {
      const [ang, r] = pts[k];
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      if (i === 0 && k === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
  }
  shape.closePath();
  // Spoke windows: annular sectors between the hub and the rim.
  const rimIn = root - 0.06 * radius / 0.5;
  const hubOut = hub + 0.04;
  if (spokes > 0 && rimIn > hubOut + 0.02) {
    for (let s = 0; s < spokes; s++) {
      const a0 = (s / spokes) * TAU + 0.18;
      const a1 = ((s + 1) / spokes) * TAU - 0.18;
      const hole = new Path();
      hole.absarc(0, 0, rimIn, a0, a1, false);
      hole.absarc(0, 0, hubOut, a1, a0, true);
      hole.closePath();
      shape.holes.push(hole);
    }
  }
  const axle = new Path();
  axle.absarc(0, 0, hub * 0.4, 0, TAU, true);
  shape.holes.push(axle);
  const g = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.2,
    bevelSize: Math.min(0.008, depth * 0.15),
    bevelSegments: 1,
    curveSegments: 12,
  });
  g.rotateX(-Math.PI / 2); // lie flat, thickness up +Y
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* Hands, indices, pendulum                                                */
/* ---------------------------------------------------------------------- */

const extrudeFlat = (shape, depth = 0.05) => {
  const g = new ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: depth * 0.35, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
};

/**
 * A clock hand in XY pointing +Y from its arbor at the origin, unit length.
 * `'hour'` — a spade tip; `'minute'` — a slim baton with a ring counterweight.
 */
export function createHandGeometry(kind = 'hour') {
  const s = new Shape();
  if (kind === 'hour') {
    s.moveTo(-0.035, -0.16);
    s.lineTo(0.035, -0.16);
    s.lineTo(0.03, 0.55);
    // spade: a heart-shaped swell, then the point
    s.bezierCurveTo(0.16, 0.6, 0.15, 0.82, 0.0, 1.0);
    s.bezierCurveTo(-0.15, 0.82, -0.16, 0.6, -0.03, 0.55);
    s.closePath();
    const eye = new Path();
    eye.absarc(0, 0.72, 0.035, 0, TAU, true);
    s.holes.push(eye);
  } else if (kind === 'minute') {
    s.moveTo(-0.025, -0.3);
    s.lineTo(0.025, -0.3);
    s.lineTo(0.018, 0.9);
    s.lineTo(0.0, 1.0);
    s.lineTo(-0.018, 0.9);
    s.closePath();
    // counterweight ring on the tail
    const ring = new Shape();
    ring.absarc(0, -0.3, 0.08, 0, TAU, false);
    const hole = new Path();
    hole.absarc(0, -0.3, 0.045, 0, TAU, true);
    ring.holes.push(hole);
    const a = extrudeFlat(s, 0.04);
    const b = extrudeFlat(ring, 0.04);
    return mergeGeometries([a, b]);
  } else {
    // 'rod' — a pierced pendulum rod, hung from y = 0 down to y = −1.
    s.moveTo(-0.03, 0.05);
    s.lineTo(0.03, 0.05);
    s.lineTo(0.02, -1.0);
    s.lineTo(-0.02, -1.0);
    s.closePath();
    for (let i = 0; i < 4; i++) {
      const slot = new Path();
      const y = -0.18 - i * 0.2;
      slot.moveTo(-0.008, y);
      slot.lineTo(0.008, y);
      slot.lineTo(0.008, y - 0.12);
      slot.lineTo(-0.008, y - 0.12);
      slot.closePath();
      s.holes.push(slot);
    }
  }
  return extrudeFlat(s, 0.04);
}

/** A crowned hour index (XY, pointing +Y, unit length), bevelled. */
export function createIndexGeometry() {
  const s = new Shape();
  s.moveTo(0, 0);
  s.lineTo(-0.11, 0.18);
  s.lineTo(-0.08, 0.75);
  s.lineTo(0, 1);
  s.lineTo(0.08, 0.75);
  s.lineTo(0.11, 0.18);
  s.closePath();
  return extrudeFlat(s, 0.06);
}

/**
 * The dial and its case, one turned solid (revolved round Y, unit radius):
 * a shallow enamel dome on the front with a raised arbor boss, a rolled rim,
 * and a deep stepped case behind — so the suspended clock has *mass* seen
 * edge-on, not just rings. Face up (+Y) is the dial.
 */
export function createDialGeometry(segments = 96) {
  const profile = [
    [0, -0.34], [0.32, -0.33], [0.58, -0.29], [0.78, -0.21], [0.88, -0.13], [0.9, -0.1],
    [0.94, -0.08], [0.95, -0.02], [0.935, 0.0], [0.9, 0.012], [0.6, 0.03], [0.25, 0.045],
    [0.09, 0.05], [0.085, 0.075], [0.05, 0.09], [0, 0.092],
  ];
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);
  g.computeVertexNormals();
  return g;
}

/** A lens-shaped turned bob facing ±Z (it swings in the XY plane). */
export function createBobGeometry() {
  const profile = [[0, -0.055], [0.1, -0.045], [0.16, -0.02], [0.18, 0], [0.16, 0.02], [0.1, 0.045], [0, 0.055]];
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 48);
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* Glass, sand, quads                                                      */
/* ---------------------------------------------------------------------- */

/** Irregular bevelled cut-glass fragment, ~0.22 m, pointing +Y. */
export function createFragmentGeometry() {
  const outline = [[0, 0.22], [-0.05, 0.1], [-0.07, -0.01], [-0.02, -0.08], [0.05, -0.05], [0.07, 0.06]];
  const h = 0.025;
  const position = [];
  const tri = (a, b, c) => position.push(...a, ...b, ...c);
  const n = outline.length;
  const cf = [0, 0.05, h * 1.8];
  const cb = [0, 0.05, -h * 1.8];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[(i + 1) % n];
    tri(cf, [ax, ay, h], [bx, by, h]);
    tri(cb, [bx, by, -h], [ax, ay, -h]);
    tri([ax, ay, -h], [bx, by, -h], [ax, ay, h]);
    tri([ax, ay, h], [bx, by, -h], [bx, by, h]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.computeVertexNormals();
  return g;
}

/** `count` seeds for the GPU sand. Positions are placeholders. */
export function createSandGeometry(count) {
  const position = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  let h = 0x6a09e667;
  const rand = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
  for (let i = 0; i < count; i++) {
    seed[i * 4 + 0] = rand();
    seed[i * 4 + 1] = rand();
    seed[i * 4 + 2] = rand();
    seed[i * 4 + 3] = i / count;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('aSeed', new Float32BufferAttribute(seed, 4));
  return g;
}

/** A flat unit quad. */
export function createQuad() {
  return new PlaneGeometry(1, 1);
}

/** The strike's column of light: an open, slightly flared tube. */
export function createPillarGeometry() {
  return new CylinderGeometry(0.75, 1, 1, 40, 8, true);
}

/** Concatenate non-indexed or indexed geometries with matching attributes. */
function mergeGeometries(list) {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = Object.keys(flat[0].attributes);
  const out = new BufferGeometry();
  for (const name of names) {
    const size = flat[0].attributes[name].itemSize;
    let total = 0;
    for (const g of flat) total += g.attributes[name].array.length;
    const array = new Float32Array(total);
    let at = 0;
    for (const g of flat) { array.set(g.attributes[name].array, at); at += g.attributes[name].array.length; }
    out.setAttribute(name, new Float32BufferAttribute(array, size));
  }
  for (const g of list) g.dispose();
  for (const g of flat) g.dispose();
  out.computeBoundingSphere();
  return out;
}
