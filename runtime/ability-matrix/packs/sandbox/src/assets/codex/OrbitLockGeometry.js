import { BufferAttribute, BufferGeometry, IcosahedronGeometry, Sphere, Vector3 } from 'three';

/**
 * Orbit Lock — procedural geometry. Nothing here knows a metre: every shape is
 * a parameter grid that the vertex stages in `OrbitLockMaterials` place in the
 * world from uniforms, so a slider re-shapes a ring that is already turning.
 */

/** A huge bound: the shapes are placed in the vertex stage, never culled. */
const BIG = new Sphere(new Vector3(), 1e4);

/**
 * The orbit — a closed tube in parameter space. `position.x` is 0..1 round the
 * ring, `position.y` 0..1 round the tube's own section.
 */
export function createOrbitTubeGeometry(segments = 160, sides = 8) {
  const cols = sides + 1;
  const rows = segments + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(segments * sides * 6);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = j / segments;
      positions[p++] = i / sides;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = BIG;
  return geometry;
}

/**
 * The accretion vortex — a polar grid in parameter space. `position.x` is 0..1
 * from the inner lip (the event horizon) to the ragged outer edge,
 * `position.y` 0..1 round the disc. The vortex material winds it into
 * log-spiral ridges of infalling matter, stands them up, tilts the whole disc
 * onto the orrery's plane and lays it on the floor after the slam
 * (`VORTEX_VERTEX` in OrbitLockMaterials). Rings are crowded toward the lip,
 * where the ridges are tallest and the shading changes fastest.
 */
export function createVortexGeometry(rings = 40, segments = 192) {
  const cols = segments + 1;
  const rows = rings + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(segments * rings * 6);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    const t = j / rings;
    const r = t * t * 0.45 + t * 0.55;
    for (let i = 0; i < cols; i++) {
      positions[p++] = r;
      positions[p++] = i / segments;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = BIG;
  return geometry;
}

/** A unit sphere for the planets (instanced, scaled per planet). */
export function createPlanetGeometry(detail = 3) {
  const geometry = new IcosahedronGeometry(1, detail);
  geometry.boundingSphere = BIG;
  return geometry;
}

/** A unit quad, `position.xy` in −1..1, placed by the vertex stage. */
export function createQuadGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)
  );
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.boundingSphere = BIG;
  return geometry;
}
