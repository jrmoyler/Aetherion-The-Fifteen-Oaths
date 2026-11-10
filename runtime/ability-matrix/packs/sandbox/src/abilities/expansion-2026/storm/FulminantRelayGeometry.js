import { BufferAttribute, BufferGeometry, IcosahedronGeometry, PlaneGeometry } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Fulminant Relay — procedural geometry.
 *
 *  - **the seed** — a charged node, not a ball. An icosphere whose vertices are
 *    pushed out along a handful of fixed "charge axes" into blunt prongs, then
 *    roughened by a cheap lattice hash so the faceting catches the rim light.
 *    The shader adds the living crackle on top; this is the silhouette.
 *  - **the orbits** — broken ribbons, each one ring of a gyroscope with gaps
 *    torn out of it where a value-noise curve falls under a threshold. A
 *    complete torus reads as a toy; a ring with missing arcs reads as current
 *    that has not closed yet. Each ring carries `aAlong` (0..1 around) and
 *    `aAcross` (−1..1) for the dash-crawl shader.
 *  - **the arc ribbon** — the relay's bolt, one flat strip of `SECTIONS`
 *    quads. Vertices are written in world space by the ability every frame,
 *    so the strip is just topology and a `uv` (x along, y across).
 *  - **the corona** — a Fibonacci shell of points with a per-point phase, which
 *    the corona shader breathes outward from the seed.
 *  - **the track** — the ionised furrow the seed scores into the floor, a
 *    ribbon in *parameter space* (`position.x` 0..1 along, `position.z` −1..1
 *    across) placed in metres by its vertex shader, so the cast length and
 *    width stay live sliders.
 *  - **the warp** — a unit quad billboarded in its shader.
 */

/** Quads per bolt. The tests and the branch anchor both rely on 24. */
export const ARC_SECTIONS = 24;

const TAU = Math.PI * 2;

function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 1D value noise, 0..1, periodic over `period` integer cells. */
function periodicNoise(x, period, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(((i % period) + period) % period + seed * 17.3);
  const b = hash1((((i + 1) % period) + period) % period + seed * 17.3);
  return a + (b - a) * u;
}

/**
 * The seed: an icosphere drawn out into blunt prongs.
 *
 * Six fixed charge axes (the octahedron's), each pulling the vertices near it
 * outward with a tight power falloff. Fixed rather than random so every cast
 * of the relay is recognisably the same object — the motion comes from the
 * shader and from the spin, not from a new silhouette each time.
 */
export function createSeedGeometry(detail = 3) {
  const geometry = new IcosahedronGeometry(1, detail);
  const p = geometry.attributes.position;
  const axes = [
    [0.0, 1.0, 0.0],
    [0.0, -1.0, 0.0],
    [0.94, 0.33, 0.0],
    [-0.47, 0.33, 0.82],
    [-0.47, 0.33, -0.82],
    [0.47, -0.62, 0.62]
  ];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    x /= l;
    y /= l;
    z /= l;
    let prong = 0;
    for (const a of axes) {
      const d = Math.max(0, x * a[0] + y * a[1] + z * a[2]);
      prong += Math.pow(d, 14);
    }
    // A lattice roughness, so flat facets break into chipped ones.
    const grain = hash1(Math.round(x * 9) * 7.1 + Math.round(y * 9) * 3.3 + Math.round(z * 9) * 1.7);
    const r = 0.82 + prong * 0.55 + (grain - 0.5) * 0.06;
    p.setXYZ(i, x * r, y * r, z * r);
  }
  // IcosahedronGeometry is non-indexed: every face owns its three corners, so
  // computeVertexNormals here would give flat per-face normals and the
  // shader's spike-along-normal would push coincident corners apart and tear
  // the prongs open. Weld first (the displacement above is a pure function of
  // direction, so coincident corners already agree), then smooth normals.
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  const welded = mergeVertices(geometry);
  geometry.dispose();
  welded.computeVertexNormals();
  return welded;
}

/**
 * One broken orbit ring, radius 1, lying in XZ.
 *
 * @param {number} seed     selects the gap pattern
 * @param {number} segments around the ring
 * @param {number} width    ribbon half-width (× radius)
 */
export function createOrbitGeometry(seed, segments = 96, width = 0.035) {
  const positions = [];
  const along = [];
  const across = [];
  const index = [];
  const gaps = 5 + Math.floor(hash1(seed * 3.7) * 3);
  let v = 0;
  for (let s = 0; s < segments; s++) {
    const t0 = s / segments;
    const t1 = (s + 1) / segments;
    // Tear the ring where the noise dips: the open arcs are where current has
    // not yet closed the loop.
    const open = periodicNoise(((t0 + t1) * 0.5) * gaps, gaps, seed);
    if (open < 0.36) continue;
    for (const t of [t0, t1]) {
      const a = t * TAU;
      const c = Math.cos(a);
      const n = Math.sin(a);
      // The ribbon is drawn slightly cupped (a bevel across) so it catches the
      // rim term instead of vanishing edge-on.
      positions.push(c * (1 - width), -width * 0.4, n * (1 - width));
      positions.push(c * (1 + width), width * 0.4, n * (1 + width));
      along.push(t, t);
      across.push(-1, 1);
    }
    index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    v += 4;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aAlong', new BufferAttribute(new Float32Array(along), 1));
  geometry.setAttribute('aAcross', new BufferAttribute(new Float32Array(across), 1));
  geometry.setIndex(index);
  return geometry;
}

/** The bolt strip. Positions are written per frame by the ability. */
export function createArcRibbon(sections = ARC_SECTIONS) {
  const geometry = new BufferGeometry();
  const vertices = new Float32Array((sections + 1) * 2 * 3);
  const uvs = new Float32Array((sections + 1) * 2 * 2);
  const indices = [];
  for (let i = 0; i <= sections; i++) {
    uvs.set([i / sections, 0, i / sections, 1], i * 4);
    if (i < sections) {
      const j = i * 2;
      indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  geometry.setAttribute('position', new BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** A unit Fibonacci shell of `count` points with a golden-ratio phase each. */
export function createCoronaGeometry(count = 96) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963;
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    positions.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    seeds[i] = (i * 0.6180339) % 1;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new BufferAttribute(seeds, 1));
  return geometry;
}

/** The furrow: `segments` × 6 grid in parameter space (x 0..1 along, z −1..1 across). */
export function createTrackGeometry(segments = 96, rows = 6) {
  const positions = new Float32Array((segments + 1) * (rows + 1) * 3);
  const index = [];
  let k = 0;
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j <= rows; j++) {
      positions[k++] = i / segments;
      positions[k++] = 0;
      positions[k++] = (j / rows) * 2 - 1;
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = a + rows + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

/** The warp billboard. */
export function createWarpQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}
