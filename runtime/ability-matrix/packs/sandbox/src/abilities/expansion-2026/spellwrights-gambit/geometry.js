import { BufferGeometry, Float32BufferAttribute, PlaneGeometry } from 'three';

/**
 * Spellwright's Gambit — procedural geometry.
 *
 * Nothing here is a stock primitive standing in for a form. Every piece is
 * authored for the armillary it builds:
 *
 *  - **the sigil** — intersecting star polygons, a graduated outer bezel and a
 *    ring of written glyphs, all as line segments in polar coordinates. Each
 *    vertex carries `aDraw` (the order it is inked in) and `aBand` (which ring
 *    it belongs to) so the shader can write the sigil on stroke by stroke.
 *  - **the armillary band** — a ring of rectangular section with crenellated
 *    teeth on its outer rim, the brass band of an armillary sphere; `uv.x`
 *    runs round it and `uv.y` across it for the rune band in the shader.
 *  - **the focus gem** — a faceted bipyramid whose rows are offset by half a
 *    facet, flat-shaded so each face catches the light on its own.
 *  - **the runic blade** — a diamond-section kite blade with a raised ridge
 *    down both faces.
 *  - **the motes** — a fixed cloud of seeds; the shader moves every point, the
 *    CPU never touches them after construction.
 *
 * Everything is built once per pool member and disposed with it.
 */

const TAU = Math.PI * 2;

/* ---------------------------------------------------------------------- */
/* The sigil                                                               */
/* ---------------------------------------------------------------------- */

/**
 * Unit-radius sigil linework lying on the floor (XZ). Built from three
 * intersecting star polygons {5/2}, {7/3}, {9/2}, a graduated bezel and a
 * glyph ring of 18 cells whose strokes are picked from a fixed hash.
 */
export function createSigilGeometry() {
  const position = [];
  const draw = [];
  const band = [];
  const Y = 0.02;
  const seg = (ax, az, bx, bz, d0, d1, b) => {
    position.push(ax, Y, az, bx, Y, bz);
    draw.push(d0, d1);
    band.push(b, b);
  };

  // Star polygons: each inked in the order it is walked, inner first.
  const stars = [
    { n: 5, step: 2, r: 0.35, start: 0.0, span: 0.3 },
    { n: 7, step: 3, r: 0.58, start: 0.2, span: 0.3 },
    { n: 9, step: 2, r: 0.81, start: 0.4, span: 0.3 },
  ];
  for (let j = 0; j < stars.length; j++) {
    const { n, step, r, start, span } = stars[j];
    for (let i = 0; i < n; i++) {
      const a = (i * TAU) / n - Math.PI / 2;
      const b = ((i + step) * TAU) / n - Math.PI / 2;
      seg(Math.cos(a) * r, Math.sin(a) * r, Math.cos(b) * r, Math.sin(b) * r,
        start + (span * i) / n, start + (span * (i + 1)) / n, j / 4);
    }
  }

  // Graduated bezel: a major tick every third division, minors between.
  const TICKS = 48;
  for (let i = 0; i < TICKS; i++) {
    const a = (i * TAU) / TICKS;
    const inner = i % 3 === 0 ? 0.89 : 0.94;
    const d = 0.65 + (0.15 * i) / TICKS;
    seg(Math.cos(a) * inner, Math.sin(a) * inner, Math.cos(a) * 0.985, Math.sin(a) * 0.985, d, d + 0.02, 0.75);
    // the bezel circle itself, one chord per tick
    const b = ((i + 1) * TAU) / TICKS;
    seg(Math.cos(a) * 0.985, Math.sin(a) * 0.985, Math.cos(b) * 0.985, Math.sin(b) * 0.985, d, d + 0.02, 1);
  }

  // Glyph ring: 18 cells between r 0.6 and 0.72, three of six strokes lit
  // per cell from a fixed hash, so the script reads as writing, not texture.
  const CELLS = 18;
  const strokes = [
    [0, 0, 1, 0], [0, 1, 1, 1], [0, 0, 0, 1], [1, 0, 1, 1], [0, 0, 1, 1], [0.5, 0, 0.5, 1],
  ];
  for (let i = 0; i < CELLS; i++) {
    const a0 = (i + 0.18) * (TAU / CELLS);
    const a1 = (i + 0.82) * (TAU / CELLS);
    const pick = (i * 2654435761) >>> 0;
    for (let k = 0; k < strokes.length; k++) {
      if (((pick >>> (k * 3)) & 7) < 4) continue;
      const [u0, v0, u1, v1] = strokes[k];
      const ra = 0.62 + v0 * 0.09, rb = 0.62 + v1 * 0.09;
      const aa = a0 + (a1 - a0) * u0, ab = a0 + (a1 - a0) * u1;
      const d = 0.8 + (0.18 * i) / CELLS;
      seg(Math.cos(aa) * ra, Math.sin(aa) * ra, Math.cos(ab) * rb, Math.sin(ab) * rb, d, d + 0.02, 0.5);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('aDraw', new Float32BufferAttribute(draw, 1));
  g.setAttribute('aBand', new Float32BufferAttribute(band, 1));
  g.computeBoundingSphere();
  return g;
}

/* ---------------------------------------------------------------------- */
/* The armillary band                                                      */
/* ---------------------------------------------------------------------- */

/**
 * A ring in the XY plane (like `TorusGeometry`, so the same rotations lay it
 * flat) with a rectangular section `width` × `thickness` and `teeth`
 * crenellations on the outer rim. Unit mean radius.
 */
export function createBandGeometry({ width = 0.06, thickness = 0.03, segments = 192, teeth = 24 } = {}) {
  const position = [];
  const uv = [];
  const index = [];
  // Four corners of the section, walked round: outer-front, outer-back,
  // inner-back, inner-front. Each side gets its own pair of vertices so the
  // normals stay square.
  const corners = [
    [1, 1], [1, -1], [1, -1], [-1, -1], [-1, -1], [-1, 1], [-1, 1], [1, 1],
  ];
  const perRing = corners.length;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = t * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    // Square teeth on the outer rim, flattened tops.
    const tooth = Math.sin(t * TAU * teeth) > 0.35 ? 1 : 0;
    for (let k = 0; k < perRing; k++) {
      const [radial, depth] = corners[k];
      const r = 1 + radial * width * 0.5 + (radial > 0 ? tooth * width * 0.45 : 0);
      position.push(c * r, s * r, depth * thickness * 0.5);
      uv.push(t, (radial * 0.5 + 0.5) * 0.5 + (depth * 0.5 + 0.5) * 0.5);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < perRing; k += 2) {
      const a = i * perRing + k, b = a + 1;
      const c = a + perRing, d = b + perRing;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* The focus gem                                                           */
/* ---------------------------------------------------------------------- */

/** A faceted bipyramid: lathe profile with alternate rows offset half a facet. */
export function createFocusGemGeometry({ facets = 8 } = {}) {
  // [radius, height] from top apex to bottom apex.
  const profile = [[0, 0.44], [0.13, 0.2], [0.26, 0.03], [0.24, -0.06], [0.12, -0.24], [0, -0.4]];
  const position = [];
  const point = (row, i) => {
    const [r, y] = profile[row];
    const a = ((i + (row % 2) * 0.5) * TAU) / facets;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  };
  const tri = (a, b, c) => position.push(...a, ...b, ...c);
  for (let row = 0; row < profile.length - 1; row++) {
    for (let i = 0; i < facets; i++) {
      const a = point(row, i), b = point(row, i + 1);
      const c = point(row + 1, i), d = point(row + 1, i + 1);
      // Offset rows interleave: split each quad along the short diagonal.
      if (row % 2 === 0) { tri(a, d, c); tri(a, b, d); }
      else { tri(a, b, c); tri(b, d, c); }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.computeVertexNormals(); // non-indexed: flat facets
  return g;
}

/* ---------------------------------------------------------------------- */
/* The runic blade                                                         */
/* ---------------------------------------------------------------------- */

/** Diamond-section kite blade, ridged on both faces. Points up +Y. */
export function createRunicBladeGeometry() {
  const T = [0, 0.34, 0];      // tip
  const L = [-0.09, -0.1, 0];  // left shoulder
  const R = [0.09, -0.1, 0];   // right shoulder
  const B = [0, -0.3, 0];      // tang
  const F = [0, -0.02, 0.045]; // front ridge
  const K = [0, -0.02, -0.045];// back ridge
  const position = [];
  const tri = (a, b, c) => position.push(...a, ...b, ...c);
  tri(T, L, F); tri(T, F, R); tri(L, B, F); tri(F, B, R);
  tri(T, K, L); tri(T, R, K); tri(L, K, B); tri(K, R, B);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* Motes                                                                   */
/* ---------------------------------------------------------------------- */

/** `count` seeds for the GPU mote cloud. Positions are placeholders. */
export function createMoteGeometry(count) {
  const position = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  // Fixed hash, so every pool member's cloud is identical and deterministic.
  let h = 0x9e3779b9;
  const rand = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
  for (let i = 0; i < count; i++) {
    seed[i * 4 + 0] = rand(); // angle
    seed[i * 4 + 1] = rand(); // radius
    seed[i * 4 + 2] = rand(); // phase
    seed[i * 4 + 3] = i / count; // index, for the live count cut-off
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('aSeed', new Float32BufferAttribute(seed, 4));
  g.boundingSphere = null;
  return g;
}

/** Unit quad for floor treatments and release flares. */
export function createQuad() {
  return new PlaneGeometry(1, 1);
}
