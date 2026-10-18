import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Crimson Baptism — the procedural meshes the fountain is drawn with.
 *
 * All in *parameter space*: the vertex stage turns them into metres from
 * uniforms, so the fountain's height, its crown, its fall and its break-up are
 * live sliders and nothing is ever rebuilt. Never culled.
 */

/**
 * The fountain: a surface of revolution in parameter space. `position.x` is
 * `v`, the distance along the flow — 0 at the floor where the column leaves,
 * through the top of the column, over the crown and down to the rim where the
 * sheet lands; `position.y` is the 0..1 bearing round it. Rows are crowded
 * round the top of the column, where the flow turns over.
 *
 * @param {number} [rows]  segments along the flow
 * @param {number} [sides] segments round
 */
export function createFountainGeometry(rows = 72, sides = 44) {
  const cols = sides + 1;
  const count = cols * (rows + 1);
  const positions = new Float32Array(count * 3);
  const indices = new Uint16Array(sides * rows * 6);
  let p = 0;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    // Crowd rows near v ≈ 0.4, the turn-over at the top of the column.
    const v = t - 0.05 * Math.sin(t * Math.PI * 2);
    for (let i = 0; i < cols; i++) {
      positions[p++] = Math.min(1, Math.max(0, v));
      positions[p++] = i / sides;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < rows; j++) {
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
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** A strip in parameter space: `position.x` 0..1 along, `position.y` -1..1 across. */
export function createSeamStripGeometry(columns = 120, rows = 2) {
  const cols = columns + 1;
  const rowCount = rows + 1;
  const positions = new Float32Array(cols * rowCount * 3);
  const indices = new Uint16Array(columns * rows * 6);
  let p = 0;
  for (let j = 0; j < rowCount; j++) {
    const v = (j / rows) * 2 - 1;
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / columns;
      positions[p++] = v;
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

/** A unit quad, ±1 in XY. */
export function createBaptismQuadGeometry() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
