import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Event Horizon — procedural meshes, all parameter-space grids.
 *
 * The wall is a cylinder whose vertices are (angle 0..1, height 0..1); the
 * shear blade an annulus (radius 0..1, angle 0..1); the floor and the lens
 * plain quads. The vertex stage turns them into metres from uniforms, so the
 * horizon's radius, height, twist and the split along the shear plane are all
 * live and nothing is rebuilt as it contracts.
 */

const HUGE = new Sphere(new Vector3(), 1e4);

/**
 * A grid: `position.x` 0..1 over `cols`, `position.y` 0..1 over `rows`.
 * Rows can be crowded toward y = 1 (`crowd` < 1) — the lip of the wall, where
 * the photon ring is drawn, needs the resolution.
 */
export function createHorizonGrid(cols, rows, crowd = 1) {
  const cx = cols + 1;
  const cy = rows + 1;
  const positions = new Float32Array(cx * cy * 3);
  const indices = new Uint16Array(cols * rows * 6);
  let p = 0;
  for (let j = 0; j < cy; j++) {
    const y = 1 - Math.pow(1 - j / rows, 1 / crowd);
    for (let i = 0; i < cx; i++) {
      positions[p++] = i / cols;
      positions[p++] = y;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * cx + i;
      const b = a + 1;
      const c = a + cx;
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
  geometry.boundingSphere = HUGE;
  return geometry;
}

/** A unit quad, ±1 in XY. */
export function createHorizonQuad() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = HUGE;
  return geometry;
}
