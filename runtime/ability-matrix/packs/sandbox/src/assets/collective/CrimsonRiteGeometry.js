import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Procedural geometry for the Crimson Rite: the blood spike.
 *
 * A spike of set blood is not a cone. It is thick and slumped at the root,
 * where it is still part of the pool it came out of; it necks above that; it
 * twists a little, because it was *wrung* out of the liquid rather than cast;
 * it bends off true; and it ends in a needle point rather than a flat tip.
 * Every one of those is a term below, and the shape is a pure function of
 * `(seed, height fraction, bearing)` so a variant is stable across rebuilds.
 *
 * Unit space: the root sits at y = 0 with a base radius of 1, the tip at
 * y = 1. A skirt runs a little *below* zero so a spike rising out of the pool
 * never shows its cut end. Instances scale x/z by the radius and y by the
 * height straight to metres.
 */

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * @param {object} options
 * @param {number} [options.seed]
 * @param {number} [options.sides]   facets round the spike
 * @param {number} [options.rings]   rings up its height
 * @param {number} [options.twist]   radians of twist from root to tip
 * @param {number} [options.bend]    sideways lean of the tip, × the height
 * @param {number} [options.lumps]   radial lumpiness, × the local radius
 * @param {number} [options.skirt]   depth of the buried skirt, × the height
 */
export function createBloodSpikeGeometry({
  seed = 1,
  sides = 10,
  rings = 18,
  twist = 0.9,
  bend = 0.12,
  lumps = 0.12,
  skirt = 0.18
} = {}) {
  const columns = sides + 1;
  const rows = rings + 1;
  // One extra vertex for the tip so the point is a real point.
  const positions = new Float32Array((columns * rows + 1) * 3);
  const normals = new Float32Array((columns * rows + 1) * 3);
  const uvs = new Float32Array((columns * rows + 1) * 2);

  const bendAngle = hash(seed) * Math.PI * 2;
  const bx = Math.cos(bendAngle) * bend;
  const bz = Math.sin(bendAngle) * bend;
  const phases = [hash(seed + 1) * 6.28, hash(seed + 2) * 6.28, hash(seed + 3) * 6.28];

  /** Radius at height fraction f in [-skirt, 1). */
  const profile = (f) => {
    if (f <= 0) return 1 + (-f / Math.max(skirt, 1e-3)) * 0.25; // the skirt flares into the pool
    // Slumped root, a neck, then a long taper to a needle.
    const slump = Math.exp(-f * 9) * 0.35;
    const taper = Math.pow(1 - f, 1.35);
    return Math.max(0.0, taper * (0.72 + slump) + slump * 0.2);
  };

  let v = 0;
  for (let row = 0; row < rows; row++) {
    const t = row / rings;
    // Rows are spread from below the floor to just under the tip.
    const f = -skirt + t * (0.985 + skirt);
    const r = profile(f);
    const h = Math.max(0, f);
    const curve = h * h; // the bend grows toward the tip
    const turn = twist * h;
    for (let s = 0; s < columns; s++) {
      const a = (s / sides) * Math.PI * 2 + turn;
      const lump =
        1 +
        lumps *
          (Math.sin(a * 3 + phases[0] + h * 5) * 0.5 +
            Math.sin(a * 5 + phases[1] - h * 8) * 0.3 +
            Math.sin(a * 2 + phases[2] + h * 13) * 0.2);
      const rr = r * lump;
      positions[v * 3 + 0] = Math.cos(a) * rr + bx * curve;
      positions[v * 3 + 1] = f;
      positions[v * 3 + 2] = Math.sin(a) * rr + bz * curve;
      uvs[v * 2 + 0] = s / sides;
      uvs[v * 2 + 1] = t;
      v++;
    }
  }
  // The tip.
  positions[v * 3 + 0] = bx;
  positions[v * 3 + 1] = 1;
  positions[v * 3 + 2] = bz;
  uvs[v * 2 + 0] = 0.5;
  uvs[v * 2 + 1] = 1;
  const tip = v;

  const indices = [];
  for (let row = 0; row < rings; row++) {
    for (let s = 0; s < sides; s++) {
      const a = row * columns + s;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const top = rings * columns;
  for (let s = 0; s < sides; s++) indices.push(top + s, tip, top + s + 1);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The blood seal in flight: a comet of blood, lathed about +Z (its direction
 * of travel). A full round head at the front, a waist just behind it where
 * the liquid is pulled thin, and a long tapering tail with a wobble in its
 * profile so it reads as liquid being dragged rather than a cone.
 *
 * Unit space: the head's centre at the origin with radius 1, the tail
 * running back to z = -tail. The ability scales it to metres.
 *
 * @param {object} [options]
 * @param {number} [options.tail]    tail length, × the head radius
 * @param {number} [options.sides]   segments round the axis
 * @param {number} [options.rings]   rings from nose to tail tip
 */
export function createBloodSealGeometry({ tail = 5, sides = 18, rings = 40 } = {}) {
  const positions = [];
  const normals = [];
  const along = [];
  const indices = [];

  // Profile r(z) from the nose (z = +1) to the tail tip (z = -tail).
  const profile = (s) => {
    // s: 0 at the nose, 1 at the tail tip.
    const headEnd = 0.2;
    if (s <= headEnd) {
      // A hemisphere at the front: z from +1 to 0.
      const k = s / headEnd; // 0..1
      const a = (1 - k) * Math.PI * 0.5;
      return { z: Math.sin(a), r: Math.cos(a) };
    }
    const k = (s - headEnd) / (1 - headEnd); // 0..1 down the tail
    const z = -k * tail;
    // Necks quickly, swells a little, then tapers to a point.
    const waist = 1 - 0.38 * Math.sin(Math.min(1, k * 3.2) * Math.PI * 0.5);
    const taper = Math.pow(1 - k, 1.6);
    const ripple = 1 + 0.08 * Math.sin(k * 19.0);
    return { z, r: waist * taper * ripple };
  };

  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    const p = profile(s);
    const q = profile(Math.min(1, s + 1e-3));
    const o = profile(Math.max(0, s - 1e-3));
    // Profile tangent (dz, dr) for the normal.
    const dz = q.z - o.z;
    const dr = q.r - o.r;
    const len = Math.hypot(dz, dr) || 1;
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      positions.push(ca * p.r, sa * p.r, p.z);
      // Outward normal of a surface of revolution: (dz·cos, dz·sin, -dr), signed for a front-to-back sweep.
      let nx = (-dz / len) * ca;
      let ny = (-dz / len) * sa;
      let nz = dr / len;
      if (i === 0) { nx = 0; ny = 0; nz = 1; }
      const nl = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / nl, ny / nl, nz / nl);
      along.push(s);
    }
  }
  const row = sides + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * row + j;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('aAlong', new BufferAttribute(new Float32Array(along), 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
