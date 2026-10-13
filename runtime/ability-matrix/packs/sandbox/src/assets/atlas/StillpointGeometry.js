import { BufferAttribute, BufferGeometry, IcosahedronGeometry, Vector3 } from 'three';

/**
 * Procedural geometry for the Stillpoint.
 *
 *  - the **geodesic cage** — an icosphere, non-indexed, every triangle
 *    carrying barycentric coordinates (`aBary`) so the fragment stage can
 *    draw its edges and nodes at a constant width with no line geometry. One
 *    mesh per subdivision level is built up front, so `latticeFreq` is a live
 *    slider that swaps between them rather than a rebuild;
 *  - **rock chunks** — icosahedra pushed out of round by a few octaves of
 *    hashed lumps, flat-shaded, each variant its own stone;
 *  - **glass shards** — thin irregular slivers with a bevelled broken edge,
 *    drawn from a wedge rather than a convex polygon so they read as torn
 *    *pieces* of a pane, not tiles.
 *
 * Everything is unit-sized: an instance scale is its size in metres.
 */

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth-ish lumps on the unit sphere from a handful of hashed directions. */
function lumps(x, y, z, seed, roughness) {
  let d = 0;
  for (let k = 0; k < 7; k++) {
    const ax = hash(seed + k * 3.1) * 2 - 1;
    const ay = hash(seed + k * 5.7) * 2 - 1;
    const az = hash(seed + k * 9.3) * 2 - 1;
    const l = Math.hypot(ax, ay, az) || 1;
    const dot = (x * ax + y * ay + z * az) / l;
    const w = 0.5 + hash(seed + k * 1.9);
    d += Math.max(0, dot) ** 3 * w * (k % 2 === 0 ? 1 : -0.6);
  }
  return 1 + d * 0.35 * roughness;
}

/** Flat normals for a non-indexed triangle soup. */
function flatNormals(positions) {
  const normals = new Float32Array(positions.length);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let i = 0; i < positions.length; i += 9) {
    a.fromArray(positions, i);
    b.fromArray(positions, i + 3);
    c.fromArray(positions, i + 6);
    c.sub(b);
    b.sub(a);
    c.cross(b).normalize().negate();
    for (let k = 0; k < 3; k++) c.toArray(normals, i + k * 3);
  }
  return normals;
}

/**
 * An icosphere of radius 1 with barycentrics for edge drawing.
 * @param {number} detail subdivision level (0 = icosahedron)
 */
export function createGeodesicCageGeometry(detail = 2) {
  // Polyhedra are built non-indexed in three: every triangle owns its vertices.
  const source = new IcosahedronGeometry(1, detail);
  const count = source.attributes.position.count;
  const bary = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) bary[i * 3 + (i % 3)] = 1;
  source.setAttribute('aBary', new BufferAttribute(bary, 3));
  source.deleteAttribute('uv');
  return source;
}

/**
 * A lump of rock.
 * @param {number} seed
 * @param {number} roughness 0..1 — the lumps at full roughness; the shader scales them
 */
export function createRockChunkGeometry(seed = 1, roughness = 1) {
  const source = new IcosahedronGeometry(0.5, 1);
  const p = source.attributes.position.array;
  // Squashed and stretched per variant so the field is not one shape.
  const sx = 0.8 + hash(seed * 2.3) * 0.5;
  const sy = 0.6 + hash(seed * 4.1) * 0.4;
  const sz = 0.8 + hash(seed * 6.7) * 0.5;
  // `aRound` is the same stone with no lumps: the vertex stage blends the two
  // by the live `rockRoughness`, so lumpiness is a slider, not a rebuild.
  const round = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i];
    const y = p[i + 1];
    const z = p[i + 2];
    const l = Math.hypot(x, y, z) || 1;
    const k = lumps(x / l, y / l, z / l, seed, roughness);
    round[i] = x * sx;
    round[i + 1] = y * sy;
    round[i + 2] = z * sz;
    p[i] = x * k * sx;
    p[i + 1] = y * k * sy;
    p[i + 2] = z * k * sz;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
  geometry.setAttribute('aRound', new BufferAttribute(round, 3));
  geometry.setAttribute('normal', new BufferAttribute(flatNormals(p), 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A torn sliver of glass: a wedge outline in XY, extruded to `thickness`
 * in Z, with a separate bevel strip along the broken edge.
 * @param {number} seed
 * @param {number} thickness metres at unit size
 */
export function createGlassSliverGeometry(seed = 1, thickness = 0.05) {
  // A long wedge with a jagged broken base.
  const len = 0.5 + hash(seed * 3.3) * 0.25;
  const tip = [0, len];
  const outline = [tip];
  const corners = 4 + Math.floor(hash(seed * 7.1) * 3);
  for (let i = 0; i < corners; i++) {
    const t = i / (corners - 1);
    const x = (t - 0.5) * (0.35 + hash(seed + i) * 0.2);
    const y = -len * 0.45 + (hash(seed * 1.3 + i * 2.7) - 0.5) * 0.18;
    outline.push([x, y]);
  }
  // Sort the base corners so the polygon winds once (tip, then base right → left).
  const base = outline.slice(1).sort((a, b) => b[0] - a[0]);
  const poly = [tip, ...base];
  const half = thickness * 0.5;
  const tris = [];
  const push = (a, b, c, za, zb, zc) => tris.push(a[0], a[1], za, b[0], b[1], zb, c[0], c[1], zc);
  // Faces: a fan from the tip.
  for (let i = 1; i < poly.length - 1; i++) {
    push(poly[0], poly[i], poly[i + 1], half, half, half);
    push(poly[0], poly[i + 1], poly[i], -half, -half, -half);
  }
  // Edges.
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    push(a, b, a, half, half, -half);
    push(b, b, a, half, -half, -half);
  }
  const p = new Float32Array(tris);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(p, 3));
  geometry.setAttribute('aRound', new BufferAttribute(new Float32Array(p), 3));
  geometry.setAttribute('normal', new BufferAttribute(flatNormals(p), 3));
  geometry.computeBoundingSphere();
  return geometry;
}
