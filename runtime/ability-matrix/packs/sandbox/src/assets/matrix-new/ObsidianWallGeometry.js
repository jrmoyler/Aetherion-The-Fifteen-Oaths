import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Procedural geometry for the Obsidian Wall: the slab and the shard.
 *
 * Volcanic glass does not break into blocks. It breaks *conchoidally* — in
 * curved, shell-like scoops — so a slab of it is a thick irregular plate with
 * a few large flat-ish facets, sharp arrises between them, and a top that is
 * not a ridge but a jagged run of two or three points. Every term below is a
 * function of `(seed, column, row)` so a variant is stable across rebuilds.
 *
 * Both meshes are **unindexed** and flat-shaded (one normal per triangle): a
 * facet that catches a single sharp reflection of the sky is the whole read of
 * glass, and smoothed normals smear it into plastic.
 *
 * Unit space for the slab: the base at y = 0, the top at y ≈ 1, the width
 * across ±0.5 in X (the wall's run), the thickness ±0.5 in Z (scaled down per
 * instance). A skirt runs below zero so a slab rising out of the floor never
 * shows its cut end. The shard is a centred unit chunk.
 *
 * Attribute `aV` is the 0..1 height fraction the material uses to keep the
 * crack glow hottest at the root.
 */

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function finish(pos, v) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('aV', new BufferAttribute(new Float32Array(v), 1));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * @param {object} [options]
 * @param {number} [options.seed]
 * @param {number} [options.sides]  facets round the slab (even numbers read best)
 * @param {number} [options.rows]   bands up its height — each a new set of facets
 * @param {number} [options.jag]    how ragged the top is, × the height
 * @param {number} [options.lumps]  how much the facets wander, × the width
 * @param {number} [options.taper]  how much narrower the top is than the base
 */
export function createObsidianSlabGeometry({ seed = 1, sides = 8, rows = 4, jag = 0.35, lumps = 0.12, taper = 0.35 } = {}) {
  const pos = [];
  const v = [];
  const skirt = -0.2;

  // Ring heights, crowded toward the top where the jag happens.
  const heights = [skirt];
  for (let j = 0; j <= rows; j++) heights.push(Math.pow(j / rows, 0.85));

  // Each ring is a jittered ellipse; the top ring is pulled up into points.
  const rings = heights.map((h, j) => {
    const f = Math.max(0, h);
    const width = 0.5 * (1 - taper * Math.pow(f, 1.4));
    const thick = 0.5 * (1 - taper * 0.6 * f);
    const pts = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + (hash(seed * 7.1 + k) - 0.5) * 0.25;
      const wob = 1 + (hash(seed * 13.7 + k * 3.1 + j * 17.3) - 0.5) * 2 * lumps;
      let x = Math.cos(a) * width * wob;
      let z = Math.sin(a) * thick * wob;
      let y = h;
      if (j === heights.length - 1) {
        // The jagged top: points of different heights along the run of the
        // wall, the faces between them falling away.
        const along = Math.cos(a);
        const peak = 0.5 + 0.5 * Math.sin(along * 3.2 + seed * 5.3);
        y = 1 - jag + jag * (0.25 + 0.75 * peak) * (0.7 + 0.6 * hash(seed + k * 1.7));
        x *= 0.55;
        z *= 0.35;
      }
      pts.push([x, y, z]);
    }
    return pts;
  });

  for (let j = 0; j < rings.length - 1; j++) {
    const lo = rings[j];
    const hi = rings[j + 1];
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      const a = lo[k];
      const b = lo[k2];
      const c = hi[k2];
      const d = hi[k];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      v.push(Math.max(0, a[1]), Math.max(0, b[1]), c[1], Math.max(0, a[1]), c[1], d[1]);
    }
  }

  // Cap the top with a fan to its own centroid, lifted into a ridge.
  const top = rings[rings.length - 1];
  const cx = top.reduce((s, p) => s + p[0], 0) / sides;
  const cz = top.reduce((s, p) => s + p[2], 0) / sides;
  const cy = Math.max(...top.map((p) => p[1])) * 0.98;
  for (let k = 0; k < sides; k++) {
    const a = top[k];
    const b = top[(k + 1) % sides];
    pos.push(...a, ...b, cx, cy, cz);
    v.push(a[1], b[1], cy);
  }

  const geometry = finish(pos, v);
  geometry.boundingSphere = new Sphere(new Vector3(0, 0.45, 0), 1.0);
  return geometry;
}

/**
 * A shard: an irregular, elongated chunk of glass — a bipyramid with a jittered
 * waist, so it has a long axis to tumble about and two sharp ends.
 */
export function createObsidianShardGeometry({ seed = 1, sides = 5 } = {}) {
  const pos = [];
  const v = [];
  const waist = [];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2 + (hash(seed * 3.3 + k) - 0.5) * 0.6;
    const r = 0.32 + 0.18 * hash(seed * 9.1 + k);
    waist.push([Math.cos(a) * r, (hash(seed * 5.7 + k) - 0.5) * 0.2, Math.sin(a) * r * 0.55]);
  }
  const top = [(hash(seed + 1) - 0.5) * 0.2, 0.5 + 0.15 * hash(seed + 2), (hash(seed + 3) - 0.5) * 0.1];
  const bottom = [(hash(seed + 4) - 0.5) * 0.2, -0.45 - 0.1 * hash(seed + 5), (hash(seed + 6) - 0.5) * 0.1];
  for (let k = 0; k < sides; k++) {
    const a = waist[k];
    const b = waist[(k + 1) % sides];
    pos.push(...a, ...top, ...b);
    v.push(0.5, 1, 0.5);
    pos.push(...a, ...b, ...bottom);
    v.push(0.5, 0.5, 0);
  }
  const geometry = finish(pos, v);
  geometry.boundingSphere = new Sphere(new Vector3(), 0.8);
  return geometry;
}
