import { BufferAttribute, BufferGeometry, PlaneGeometry } from 'three';

/**
 * Prism Choir — procedural geometry.
 *
 *  - **the lance** — a doubly-terminated quartz crystal: a slightly irregular
 *    hexagonal prism with a long pyramidal point and a short butt, the apex
 *    knocked off-centre so it reads as grown, not machined. Long axis is local
 *    +Y (the ability turns +Y onto the flight direction). Non-indexed, so every
 *    facet is flat; each vertex carries a barycentric (`aBary`) for the facet
 *    edge glow and a per-facet dice (`aFacet`) for the dispersion.
 *  - **a shard** — a single-terminated fragment of the same habit: five sides,
 *    a broken, tilted base and a long point.
 *  - **the trail** — two ribbons crossed along local +Z (0..1), one flat and
 *    one standing, so a trail reads from behind *and* from above. `uv.x` runs
 *    along it, `uv.y` across.
 *  - **the splinters** — 120 directions on a Fibonacci sphere with a seed each;
 *    the vertex stage throws them out from the split.
 *  - **the lightfall** — a subdivided ground plane for the caustics the
 *    crystal throws on the floor.
 *  - **the lens** — a unit billboard quad for the refraction proxy.
 */

export const SPLINTER_COUNT = 120;

function hash(n) {
  const s = Math.sin(n * 91.7 + 47.3) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Build a crystal from rings of (radius, height) and an apex/base point.
 * Every triangle is emitted with its own three vertices and barycentrics.
 */
function crystal({ sides, radii, rings, apex, base, seed }) {
  const positions = [];
  const bary = [];
  const facet = [];
  const ring = (k, i) => {
    const a = ((i % sides) / sides) * Math.PI * 2 + 0.11 * (hash(seed + i) - 0.5);
    const r = radii[k] * (0.88 + 0.24 * hash(seed * 3.1 + i * 1.7));
    return [Math.cos(a) * r, rings[k], Math.sin(a) * r];
  };
  let face = 0;
  const tri = (a, b, c) => {
    positions.push(...a, ...b, ...c);
    bary.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
    const f = hash(seed * 7.3 + face++);
    facet.push(f, f, f);
  };
  // The prism body, ring to ring, two triangles per side.
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < sides; i++) {
      const a = ring(k, i), b = ring(k, i + 1), c = ring(k + 1, i), d = ring(k + 1, i + 1);
      tri(a, c, b);
      tri(b, c, d);
    }
  }
  // Terminations: a pyramid onto the apex and one onto the base point.
  const top = rings.length - 1;
  for (let i = 0; i < sides; i++) {
    tri(ring(top, i), apex, ring(top, i + 1));
    tri(ring(0, i + 1), base, ring(0, i));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aBary', new BufferAttribute(new Float32Array(bary), 3));
  geometry.setAttribute('aFacet', new BufferAttribute(new Float32Array(facet), 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** The travelling lance, ~2.4 m long at scale 1, point toward +Y. */
export function createLanceGeometry() {
  return crystal({
    sides: 6,
    // A waist slightly forward of centre: the point is the long end.
    radii: [0.34, 0.42, 0.4, 0.3],
    rings: [-0.62, -0.1, 0.42, 0.78],
    apex: [0.05, 1.3, -0.03],
    base: [-0.02, -1.1, 0.02],
    seed: 1.3
  });
}

/** One split shard: five-sided, single point, broken base. */
export function createShardGeometry() {
  return crystal({
    sides: 5,
    radii: [0.36, 0.33, 0.24],
    rings: [-0.55, 0.1, 0.62],
    apex: [0.03, 1.25, 0.04],
    base: [0.08, -0.72, -0.05],
    seed: 4.9
  });
}

/** Crossed ribbon along local +Z, `segments` slices along it. */
export function createTrailGeometry(segments = 24) {
  const positions = [];
  const uvs = [];
  const index = [];
  for (let plane = 0; plane < 2; plane++) {
    const offset = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      for (let j = 0; j < 2; j++) {
        const s = j ? 0.5 : -0.5;
        // Plane 0 lies flat (across = X), plane 1 stands (across = Y).
        positions.push(plane ? 0 : s, plane ? s : 0, u);
        uvs.push(u, j);
      }
      if (i < segments) {
        const n = offset + i * 2;
        index.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(index);
  return geometry;
}

/** 120 unit directions on a Fibonacci sphere, each with a 0..1 seed. */
export function createSplinterGeometry() {
  const positions = new Float32Array(SPLINTER_COUNT * 3);
  const seeds = new Float32Array(SPLINTER_COUNT);
  for (let i = 0; i < SPLINTER_COUNT; i++) {
    const a = i * 2.399963;
    const y = 1 - (2 * (i + 0.5)) / SPLINTER_COUNT;
    const r = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(a) * r;
    seeds[i] = (i * 0.618034) % 1;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new BufferAttribute(seeds, 1));
  return geometry;
}

/** Unit ground plane in XZ (Y up), subdivided so the floor caustics stay smooth. */
export function createLightfallGeometry() {
  const geometry = new PlaneGeometry(1, 1, 8, 8);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** Unit quad in XY for view-space billboards. */
export function createLensGeometry() {
  return new PlaneGeometry(1, 1, 1, 1);
}

/**
 * The choir: one cluster of seven crystal pipes that erupts where a shard
 * lands. Organ-pipe grading — the middle pipe tallest (2.4 m at scale 1),
 * the outer ones knee-high — set on a shallow arc that curves away from the
 * split, each pipe a five- or six-sided quartz habit with its own tip, leaning
 * outward a little so the cluster fans like a pipe-organ front. Base at y = 0
 * (each pipe's butt is buried 0.15 m), front faces local +Z.
 *
 * Non-indexed (flat facets) with `aBary`, `aFacet` like the lance, plus
 * `aRise` (0 at the floor … 1 at that pipe's tip) and `aPipe` (0..1 across
 * the cluster) for the climbing light of the glow shell.
 */
export function createChoirSpireGeometry() {
  const PIPES = 7;
  const parts = [];
  for (let k = 0; k < PIPES; k++) {
    const m = (k - (PIPES - 1) / 2) / ((PIPES - 1) / 2); // -1 … 1
    const height = 0.85 + 1.55 * Math.pow(1 - Math.abs(m), 0.85);
    const radius = 0.15 + 0.1 * (1 - Math.abs(m)) + 0.03 * hash(k * 5.7);
    const g = crystal({
      sides: k % 2 ? 5 : 6,
      radii: [radius * 1.08, radius, radius * 0.92],
      rings: [0, height * 0.45, height * 0.8],
      apex: [0.04 * (hash(k * 2.3) - 0.5), height, 0.04 * (hash(k * 3.9) - 0.5)],
      base: [0, -0.15, 0],
      seed: 7.1 + k * 3.3
    });
    parts.push({ g, m, height });
  }
  const positions = [];
  const bary = [];
  const facet = [];
  const rise = [];
  const pipe = [];
  for (const { g, m, height } of parts) {
    const p = g.attributes.position.array;
    const b = g.attributes.aBary.array;
    const f = g.attributes.aFacet.array;
    // Lean outward along the arc and a little back, then set on the arc.
    const lean = -m * 0.2;
    const back = -0.08;
    const cx = m * 1.05;
    const cz = -0.32 * m * m;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i];
      const y = p[i + 1];
      const z = p[i + 2];
      // Rotate about Z (lean), then about X (tilt back).
      const x1 = x * Math.cos(lean) - y * Math.sin(lean);
      const y1 = x * Math.sin(lean) + y * Math.cos(lean);
      const y2 = y1 * Math.cos(back) - z * Math.sin(back);
      const z2 = y1 * Math.sin(back) + z * Math.cos(back);
      positions.push(x1 + cx, y2, z2 + cz);
      rise.push(Math.max(0, y) / height);
      pipe.push((m + 1) / 2);
    }
    for (let i = 0; i < b.length; i++) bary.push(b[i]);
    for (let i = 0; i < f.length; i++) facet.push(f[i]);
    g.dispose();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aBary', new BufferAttribute(new Float32Array(bary), 3));
  geometry.setAttribute('aFacet', new BufferAttribute(new Float32Array(facet), 1));
  geometry.setAttribute('aRise', new BufferAttribute(new Float32Array(rise), 1));
  geometry.setAttribute('aPipe', new BufferAttribute(new Float32Array(pipe), 1));
  geometry.computeVertexNormals();
  return geometry;
}
