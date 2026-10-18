import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Bile Lance — the procedural meshes the drill is drawn with.
 *
 * All of them are built once, in *parameter space*: their vertices are
 * coordinates the vertex stage turns into metres from uniforms, so every
 * dimension is a live slider and nothing is ever rebuilt. Bounding spheres are
 * huge because the bounds of a parameter mesh mean nothing.
 */

function finish(positions, indices, extra) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  if (extra) geometry.setAttribute(extra.name, new BufferAttribute(extra.array, extra.size));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * A tube grid: `position.x` is `s` (0 tail .. 1 nose), `position.y` the 0..1
 * angle round it. The lance, its haze and the helix ribbons all bend it.
 * Rings are crowded toward the nose, where the point is sharpest.
 */
export function createBileTubeGeometry(rings = 72, sides = 18) {
  const cols = sides + 1;
  const rows = rings + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(sides * rings * 6);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    const t = j / rings;
    const s = 1 - Math.pow(1 - t, 1.35);
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
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  return finish(positions, indices);
}

/**
 * A long strip: `position.x` 0..1 along, `position.y` -1..1 across. The
 * trench lays it on the floor down the line.
 */
export function createBileStripGeometry(columns = 140, rows = 6) {
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
  return finish(positions, indices);
}

/** A unit quad, ±1 in XY. */
export function createBileQuadGeometry() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  return finish(positions, indices);
}

/**
 * `count` unit quads in one buffer, each tagged with its slot index
 * (`aSlot`). The wake rings read their own centre and age out of uniform
 * arrays by that index, so one draw call carries every ring.
 */
export function createBileRingQuadsGeometry(count = 16) {
  const positions = new Float32Array(count * 4 * 3);
  const slots = new Float32Array(count * 4);
  const indices = new Uint16Array(count * 6);
  const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
  for (let q = 0; q < count; q++) {
    for (let v = 0; v < 4; v++) {
      const o = (q * 4 + v) * 3;
      positions[o] = corners[v * 2];
      positions[o + 1] = corners[v * 2 + 1];
      positions[o + 2] = 0;
      slots[q * 4 + v] = q;
    }
    const b = q * 4;
    indices.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6);
  }
  return finish(positions, indices, { name: 'aSlot', array: slots, size: 1 });
}
