import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Second Self — the parameter-space meshes the floor and the braid are drawn
 * with. (The figure itself is three's CapsuleGeometry, instanced and swept
 * between joints in the vertex stage — see SecondSelfMaterials.)
 *
 * Never culled: the bounding volume of a parameter-space mesh means nothing.
 */

function finish(positions, indices) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * A strip: `position.x` 0..1 along, `position.y` −1..1 across. Laid on the
 * floor it is the run (thread and footprints); stood up and twisted round the
 * path in the vertex stage it is one strand of the braid.
 */
export function createStripGeometry(columns = 160, rows = 4) {
  const cols = columns + 1;
  const rowCount = rows + 1;
  const positions = new Float32Array(cols * rowCount * 3);
  let p = 0;
  for (let j = 0; j < rowCount; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / columns;
      positions[p++] = (j / rows) * 2 - 1;
      positions[p++] = 0;
    }
  }
  const indices = new Uint16Array(columns * rows * 6);
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }
  return finish(positions, indices);
}

/** A unit quad, ±1 in XY — the wake billboard places it itself. */
export function createQuadGeometry() {
  return finish(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), new Uint16Array([0, 1, 2, 0, 2, 3]));
}
