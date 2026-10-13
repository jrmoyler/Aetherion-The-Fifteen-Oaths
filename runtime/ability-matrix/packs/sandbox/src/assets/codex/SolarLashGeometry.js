import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Solar Lash — the procedural meshes the whip is drawn with.
 *
 * Both are built once, in *parameter space*: their vertices are not positions
 * but coordinates the vertex stage turns into metres from uniforms, so every
 * dimension of the whip is a live slider and nothing is ever rebuilt.
 */

/**
 * The lash: a tube grid.
 *
 * `position.x` is `s`, 0 at the hand and 1 at the tip; `position.y` is the
 * 0..1 angle round the tube. The lash material bends that along the whip's
 * centreline (`lashPoint` in SolarLashMaterials). Rings are crowded toward the
 * tip (`s = t^0.8`), where the wave is tightest and the taper fastest. The
 * same grid, fattened, is the heat-haze proxy.
 *
 * Never culled: the bounding volume of a parameter-space mesh means nothing.
 *
 * @param {number} [rings]  segments hand to tip
 * @param {number} [sides]  segments round the tube
 */
export function createLashTubeGeometry(rings = 120, sides = 12) {
  const cols = sides + 1;
  const rows = rings + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(sides * rings * 6);

  let p = 0;
  for (let j = 0; j < rows; j++) {
    const s = Math.pow(j / rings, 0.8);
    for (let i = 0; i < cols; i++) {
      positions[p++] = s;
      positions[p++] = i / sides;
      positions[p++] = 0;
    }
  }

  let k = 0;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * A long strip, `columns` segments along and `rows` across, in parameter space:
 * `position.x` 0..1 along, `position.y` -1..1 across. The furrow lays it on the
 * floor down the line; the haze ribbon stands it up over the furrow. Columns
 * are many because both materials taper and wander along their length.
 */
export function createLashStripGeometry(columns = 160, rows = 4) {
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

/** A unit quad, ±1 in XY — billboards and the boom ring place it themselves. */
export function createLashQuadGeometry() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
