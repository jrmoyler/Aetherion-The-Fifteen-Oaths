import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Halo Guillotine — the procedural meshes, all in *parameter space*.
 *
 * Every mesh here is a plain grid whose vertices are coordinates, not
 * positions: the halo is (angle round the ring, angle round the tube), the
 * blade (along, across), the swing smear (along, through the swing) and the
 * cut (along, across). The vertex stage turns them into metres from uniforms,
 * so the hinge, the blade's length, its crescent and the angle it is swinging
 * through are all live sliders and nothing is ever rebuilt.
 */

const HUGE = new Sphere(new Vector3(), 1e4);

/**
 * A grid of `cols × rows` cells: `position.x` runs 0..1 over the columns,
 * `position.y` runs `y0..y1` over the rows. `crowd` < 1 crowds the columns
 * toward x = 0.
 */
export function createGuillotineGrid(cols, rows, y0 = 0, y1 = 1, crowd = 1) {
  const cx = cols + 1;
  const cy = rows + 1;
  const positions = new Float32Array(cx * cy * 3);
  const indices = new Uint16Array(cols * rows * 6);
  let p = 0;
  for (let j = 0; j < cy; j++) {
    const y = y0 + (y1 - y0) * (j / rows);
    for (let i = 0; i < cx; i++) {
      positions[p++] = Math.pow(i / cols, crowd);
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

/** The halo: 96 segments round the ring, 12 round the tube. */
export function createHaloGeometry() {
  return createGuillotineGrid(96, 12, 0, 1);
}

/** The blade: 110 columns hinge → tip, 10 rows spine → edge. */
export function createBladeGeometry() {
  return createGuillotineGrid(110, 10, 0, 1, 0.9);
}

/** The swing smear: 80 columns hinge → tip, 12 rows through the swing. */
export function createSmearGeometry() {
  return createGuillotineGrid(80, 12, 0, 1);
}

/** The cut on the floor: a strip, 4 columns along (it is shaded, not bent) and 4 across (-1..1). */
export function createCutGeometry() {
  return createGuillotineGrid(4, 4, -1, 1);
}

/** A unit quad, ±1 in XY. */
export function createGuillotineQuad() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = HUGE;
  return geometry;
}
