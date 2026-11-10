import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, IcosahedronGeometry, PlaneGeometry, Shape } from 'three';

/**
 * Hematite Arsenal — procedural geometry.
 *
 * Every weapon is built here from numbers, no model files:
 *
 *  - **blades are lofted**: a fourteen-point cross-section (a lens with a
 *    fuller groove down each face, or a single-edged wedge with a thick spine)
 *    swept along the length, its width, thickness and centre line written as
 *    functions of `f` (0 at the tip → 1 at the base). The tip collapses to a
 *    point, the fuller fades in behind the tip, the falx's centre line hooks
 *    toward its edge.
 *  - **hafts, grips, collars and pommels are lathed** from authored (r, y)
 *    profiles, with ridged wraps where a hand or a binding would sit.
 *  - **the greatsword's guard is an extruded outline** with quillons hooked
 *    toward the point and a langet running down the blade.
 *
 * Everything is flat-shaded on purpose: polished hematite is a cut stone,
 * and the facets catch the sun one plane at a time.
 *
 * Every weapon shares one local frame: the **tip is the origin** and the
 * weapon runs up +Y to the pommel; the blade's width is X and its thickness
 * Z. So the ability can place a weapon by its point — planted in the floor,
 * or aimed at a body — with nothing else to compute.
 *
 * Attribute `aWeapon` (vec4): `x` part (0 blade, 1 fittings, 2 grip/haft),
 * `y` along (0 tip → 1 pommel), `z` fuller channel 0..1 (where the blood
 * runs), `w` cutting edge 0..1.
 */

/** The three weapon kinds the arsenal alternates through. */
export const WEAPON_KINDS = Object.freeze(['greatsword', 'spear', 'falx']);

/* Cross-sections: [x / halfWidth, z / halfThickness, fuller, edge]. */
const LENS = [
  [1, 0, 0, 1], [0.62, 0.85, 0, 0], [0.3, 1, 0, 0], [0.22, 0.45, 1, 0], [-0.22, 0.45, 1, 0], [-0.3, 1, 0, 0], [-0.62, 0.85, 0, 0],
  [-1, 0, 0, 1], [-0.62, -0.85, 0, 0], [-0.3, -1, 0, 0], [-0.22, -0.45, 1, 0], [0.22, -0.45, 1, 0], [0.3, -1, 0, 0], [0.62, -0.85, 0, 0],
];
const SINGLE = [
  [1, 0, 0, 1], [0.6, 0.6, 0, 0], [0.25, 0.9, 0, 0], [0.05, 0.45, 1, 0], [-0.3, 0.45, 1, 0], [-0.5, 1, 0, 0], [-1, 1, 0, 0],
  [-1.04, 0, 0, 0], [-1, -1, 0, 0], [-0.5, -1, 0, 0], [-0.3, -0.45, 1, 0], [0.05, -0.45, 1, 0], [0.25, -0.9, 0, 0], [0.6, -0.6, 0, 0],
];

const sat = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Flat-shaded triangle soup with outward-oriented facets. */
class Soup {
  constructor() {
    this.p = [];
    this.n = [];
    this.w = [];
  }

  /**
   * Add a triangle. `hint` is any point *inside* the solid: a facet whose
   * normal points toward it is flipped, so winding never has to be right.
   * Degenerate triangles (the collapsed tip) are skipped — they would carry
   * a NaN normal.
   */
  tri(a, b, c, wa, wb, wc, hint) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-10) return;
    nx /= len; ny /= len; nz /= len;
    const cx = (a[0] + b[0] + c[0]) / 3 - hint[0];
    const cy = (a[1] + b[1] + c[1]) / 3 - hint[1];
    const cz = (a[2] + b[2] + c[2]) / 3 - hint[2];
    if (nx * cx + ny * cy + nz * cz < 0) {
      [b, c] = [c, b];
      [wb, wc] = [wc, wb];
      nx = -nx; ny = -ny; nz = -nz;
    }
    for (const [v, w] of [[a, wa], [b, wb], [c, wc]]) {
      this.p.push(v[0], v[1], v[2]);
      this.n.push(nx, ny, nz);
      this.w.push(w[0], w[1], w[2], w[3]);
    }
  }

  quad(a, b, c, d, wa, wb, wc, wd, hint) {
    this.tri(a, b, c, wa, wb, wc, hint);
    this.tri(a, c, d, wa, wc, wd, hint);
  }

  build() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.n, 3));
    g.setAttribute('aWeapon', new Float32BufferAttribute(this.w, 4));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * Loft a blade along +Y.
 * @param {Soup} soup
 * @param {object} o { y0, length, stations, section, width(f), thick(f), centre(f), total }
 */
function loftBlade(soup, o) {
  const rings = [];
  for (let s = 0; s <= o.stations; s++) {
    const f = s / o.stations;
    const y = o.y0 + f * o.length;
    const w = o.width(f), t = o.thick(f), cx = o.centre(f);
    const fullerFade = smooth(0.16, 0.34, f) * (1 - smooth(0.94, 1, f));
    const ring = [];
    for (const [sx, sz, fuller, edge] of o.section) {
      ring.push({
        v: [cx + sx * w, y, sz * t],
        w: [0, y / o.total, fuller * fullerFade, edge],
      });
    }
    rings.push({ ring, hint: [cx, y, 0] });
  }
  const n = o.section.length;
  for (let s = 0; s < o.stations; s++) {
    const A = rings[s], B = rings[s + 1];
    const hint = [(A.hint[0] + B.hint[0]) / 2, (A.hint[1] + B.hint[1]) / 2, 0];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      soup.quad(A.ring[i].v, A.ring[j].v, B.ring[j].v, B.ring[i].v, A.ring[i].w, A.ring[j].w, B.ring[j].w, B.ring[i].w, hint);
    }
  }
  // Close the base (the tip closes itself by collapsing to a point).
  const top = rings[o.stations];
  const centre = [top.hint[0], top.hint[1], 0];
  const cw = [0, top.hint[1] / o.total, 0, 0];
  const inside = [centre[0], centre[1] - 0.05, 0];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    soup.tri(top.ring[i].v, top.ring[j].v, centre, top.ring[i].w, top.ring[j].w, cw, inside);
  }
}

/**
 * Lathe a profile of [radius, y] pairs (bottom → top) round +Y.
 * Ends with r > 0 are capped.
 */
function lathe(soup, profile, segments, part, total) {
  const ring = (r, y) => {
    const out = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    return out;
  };
  const rings = profile.map(([r, y]) => ({ r, y, pts: ring(r, y) }));
  const wt = (y) => [part, y / total, 0, 0];
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1];
    const hint = [0, (A.y + B.y) / 2, 0];
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      soup.quad(A.pts[i], A.pts[j], B.pts[j], B.pts[i], wt(A.y), wt(A.y), wt(B.y), wt(B.y), hint);
    }
  }
  for (const [end, dir] of [[rings[0], 1], [rings[rings.length - 1], -1]]) {
    if (end.r < 1e-4) continue;
    const c = [0, end.y, 0];
    const inside = [0, end.y + dir * 0.02, 0];
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      soup.tri(end.pts[i], end.pts[j], c, wt(end.y), wt(end.y), wt(end.y), inside);
    }
  }
}

/** Append a three.js geometry (non-indexed or indexed), offset, as flat facets. */
function appendGeometry(soup, geometry, offset, part, total, scale = [1, 1, 1]) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.attributes.position;
  const P = (i) => [p.getX(i) * scale[0] + offset[0], p.getY(i) * scale[1] + offset[1], p.getZ(i) * scale[2] + offset[2]];
  // three's extrusion already winds every facet outward (CCW), so its own
  // winding is kept: the "inside" hint is placed just behind each facet.
  for (let i = 0; i < p.count; i += 3) {
    const a = P(i), b = P(i + 1), c = P(i + 2);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const hint = [(a[0] + b[0] + c[0]) / 3 - nx, (a[1] + b[1] + c[1]) / 3 - ny, (a[2] + b[2] + c[2]) / 3 - nz];
    const w = (v) => [part, v[1] / total, 0, 0];
    soup.tri(a, b, c, w(a), w(b), w(c), hint);
  }
  if (g !== geometry) g.dispose();
  geometry.dispose();
}

/** The greatsword's crossguard outline: quillons hooked toward the point, a langet down the blade. */
function guardShape() {
  const half = [
    [0.05, 0.075], [0.2, 0.07], [0.29, 0.05], [0.345, 0.0], [0.36, -0.085], [0.33, -0.15],
    [0.305, -0.12], [0.3, -0.06], [0.26, -0.015], [0.12, -0.02], [0.05, -0.04], [0.035, -0.12],
  ];
  const shape = new Shape();
  shape.moveTo(0, -0.15);
  for (const [x, y] of [...half].reverse()) shape.lineTo(x, y);
  shape.lineTo(0, 0.085);
  for (const [x, y] of half) shape.lineTo(-x, y);
  shape.lineTo(0, -0.15);
  return shape;
}

function greatsword() {
  const soup = new Soup();
  const L = 1.3, total = 1.74;
  loftBlade(soup, {
    y0: 0, length: L, stations: 22, section: LENS, total,
    width: (f) => 0.15 * Math.pow(sat(f / 0.24), 0.62) * (0.86 + 0.14 * f) * (1 + 0.07 * Math.sin(f * Math.PI * 1.2)),
    thick: (f) => 0.032 * (0.35 + 0.65 * sat(f / 0.24)),
    centre: () => 0,
  });
  const guard = new ExtrudeGeometry(guardShape(), {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 1, curveSegments: 4,
  });
  appendGeometry(soup, guard, [0, L + 0.02, -0.025], 1, total);
  lathe(soup, [
    [0.03, L + 0.09], [0.034, L + 0.1], [0.034, L + 0.12], [0.03, L + 0.15], [0.034, L + 0.18], [0.03, L + 0.21],
    [0.034, L + 0.24], [0.03, L + 0.27], [0.034, L + 0.3], [0.032, L + 0.33],
  ], 10, 2, total);
  lathe(soup, [
    [0.02, L + 0.33], [0.05, L + 0.35], [0.062, L + 0.38], [0.055, L + 0.41], [0.03, L + 0.435], [0.0, L + 0.44],
  ], 10, 1, total);
  return soup.build();
}

function spear() {
  const soup = new Soup();
  const H = 0.58, total = 2.35;
  loftBlade(soup, {
    y0: 0, length: H, stations: 16, section: LENS, total,
    // A leaf head: swells two thirds of the way up, pinches into the socket.
    width: (f) => 0.13 * Math.sin(Math.pow(sat(f), 0.7) * Math.PI * 0.92) * (1 - 0.55 * smooth(0.85, 1, f)) + 0.012 * smooth(0.8, 1, f),
    thick: (f) => 0.022 * (0.4 + 0.6 * sat(f / 0.3)),
    centre: () => 0,
  });
  // Socket, lugs collar, a haft with blood-bound wraps, and a butt spike.
  lathe(soup, [
    [0.012, H - 0.01], [0.03, H + 0.02], [0.036, H + 0.1], [0.05, H + 0.13], [0.05, H + 0.16], [0.03, H + 0.18],
    [0.034, H + 0.2],
  ], 10, 1, total);
  const haft = [[0.034, H + 0.2]];
  for (let k = 0; k < 7; k++) {
    const y = H + 0.26 + k * 0.05;
    haft.push([0.034, y - 0.012], [0.04, y], [0.034, y + 0.012]);
  }
  haft.push([0.025, total - 0.12], [0.032, total - 0.1], [0.03, total - 0.06], [0.0, total]);
  lathe(soup, haft, 9, 2, total);
  return soup.build();
}

function falx() {
  const soup = new Soup();
  const L = 0.82, total = 2.25;
  loftBlade(soup, {
    y0: 0, length: L, stations: 20, section: SINGLE, total,
    // The blade widens toward the hook and the point curls toward the edge.
    width: (f) => 0.16 * Math.pow(sat(f / 0.18), 0.55) * (1.15 - 0.45 * f),
    thick: (f) => 0.03 * (0.4 + 0.6 * sat(f / 0.2)),
    centre: (f) => 0.2 * Math.pow(1 - f, 2.2) - 0.03 * f,
  });
  lathe(soup, [
    [0.015, L - 0.02], [0.034, L + 0.02], [0.045, L + 0.05], [0.045, L + 0.09], [0.03, L + 0.11], [0.034, L + 0.13],
  ], 10, 1, total);
  const haft = [[0.034, L + 0.13]];
  for (let k = 0; k < 5; k++) {
    const y = L + 0.75 + k * 0.06;
    haft.push([0.034, y - 0.015], [0.041, y], [0.034, y + 0.015]);
  }
  haft.push([0.034, total - 0.14], [0.045, total - 0.11], [0.05, total - 0.07], [0.03, total - 0.04], [0, total]);
  lathe(soup, haft, 9, 2, total);
  return soup.build();
}

/**
 * One weapon of the arsenal. Tip at the origin, +Y to the pommel.
 * @param {'greatsword'|'spear'|'falx'} kind
 */
export function createWeaponGeometry(kind) {
  if (kind === 'spear') return spear();
  if (kind === 'falx') return falx();
  return greatsword();
}

/** Length (m, unscaled) of each weapon kind from tip to pommel. */
export const WEAPON_LENGTH = Object.freeze({ greatsword: 1.74, spear: 2.35, falx: 2.25 });

/** A unit quad in XY, centred — carrier for the floor, the lens. */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}

/** The lunge streak: a ribbon from x = 0 (tail) to x = 1 (head), in XY. */
export function createStreakGeometry() {
  const g = new PlaneGeometry(1, 1, 24, 2);
  g.translate(0.5, 0, 0);
  return g;
}

/** The blood knot: a dense sphere the vertex shader boils. */
export function createKnotGeometry() {
  return new IcosahedronGeometry(1, 4);
}
