import { BufferAttribute, BufferGeometry, LatheGeometry, SphereGeometry, Sphere, Vector2, Vector3 } from 'three';

/**
 * Eclipse Needle — procedural geometry.
 *
 * The needle is the one real solid: a spindle turned on a lathe, unit length
 * along −Y from its point at the origin (where the eclipse sits) to a hair of
 * a tail, unit radius at its belly. The mesh scales it, so its length and
 * girth are live sliders. Everything else is a parameter grid the vertex
 * stages lay out from uniforms.
 */

const BIG = new Sphere(new Vector3(), 1e4);

/** The spindle. `position.y` 0 at the point .. −1 at the tail. */
export function createNeedleGeometry(rows = 64, sides = 20) {
  const points = [];
  for (let i = 0; i <= rows; i++) {
    const s = i / rows; // 0 point .. 1 tail
    // Fattest a fifth of the way back, then a long taper to a hair.
    const r = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.45)), 1.1);
    points.push(new Vector2(Math.max(r, 0.0005), -s));
  }
  const geometry = new LatheGeometry(points, sides);
  geometry.boundingSphere = BIG;
  return geometry;
}

/** The eclipsing body: a unit sphere. */
export function createDiscGeometry() {
  const geometry = new SphereGeometry(1, 32, 20);
  geometry.boundingSphere = BIG;
  return geometry;
}

/**
 * A tube grid in parameter space: `position.x` 0..1 along, `position.y` 0..1
 * round. Used by the helix strands and the wake.
 */
export function createTubeGeometry(rings = 120, sides = 10) {
  const cols = sides + 1;
  const positions = new Float32Array(cols * (rings + 1) * 3);
  const indices = new Uint16Array(sides * rings * 6);
  let p = 0;
  for (let j = 0; j <= rings; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = j / rings;
      positions[p++] = i / sides;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * cols + i;
      indices[k++] = a;
      indices[k++] = a + 1;
      indices[k++] = a + cols;
      indices[k++] = a + 1;
      indices[k++] = a + cols + 1;
      indices[k++] = a + cols;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = BIG;
  return geometry;
}

/** A ground strip: `position.x` 0..1 along, `position.y` −1..1 across. */
export function createStripGeometry(columns = 160, rows = 6) {
  const cols = columns + 1;
  const positions = new Float32Array(cols * (rows + 1) * 3);
  const indices = new Uint16Array(columns * rows * 6);
  let p = 0;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / columns;
      positions[p++] = (j / rows) * 2 - 1;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const a = j * cols + i;
      indices[k++] = a;
      indices[k++] = a + cols;
      indices[k++] = a + 1;
      indices[k++] = a + 1;
      indices[k++] = a + cols;
      indices[k++] = a + cols + 1;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = BIG;
  return geometry;
}

/** A unit quad, `position.xy` in −1..1. */
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
