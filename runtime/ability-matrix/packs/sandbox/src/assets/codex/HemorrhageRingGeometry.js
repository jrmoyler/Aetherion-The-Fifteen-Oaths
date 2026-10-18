import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Hemorrhage Ring — the procedural meshes the ring is drawn with.
 *
 * Parameter space throughout: the vertex stage turns these coordinates into
 * metres from uniforms, so the circle's radius, the racing arc, the wall's
 * height and its collapse are live sliders and nothing is ever rebuilt.
 * Never culled.
 */

/** An indexed grid of `(cols - 1) × (rows - 1)` quads; x and y both 0..1. */
function grid(columns, rows, wrapX) {
  const cols = columns + 1;
  const rowCount = rows + 1;
  const positions = new Float32Array(cols * rowCount * 3);
  const indices = new Uint16Array(columns * rows * 6);
  let p = 0;
  for (let j = 0; j < rowCount; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = wrapX ? i / columns : i / columns;
      positions[p++] = j / rows;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
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
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * The racing blood: a tube laid along an arc of the rim. `position.x` is `s`,
 * 0 at the trailing end and 1 at the racing head; `position.y` the 0..1 angle
 * round the tube. Many segments along, because the arc can be a whole lap.
 */
export function createArcTubeGeometry(segments = 200, sides = 10) {
  return grid(segments, sides, false);
}

/**
 * The wall: a band round the circle. `position.x` is the 0..1 bearing round the
 * circle, `position.y` 0 at the floor to 1 at the crest.
 */
export function createWallGeometry(around = 120, rows = 14) {
  return grid(around, rows, true);
}

/** A unit quad, ±1 in XY. */
export function createRingQuadGeometry() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
