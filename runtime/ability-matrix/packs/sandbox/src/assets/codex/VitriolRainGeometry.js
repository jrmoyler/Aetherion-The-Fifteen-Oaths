import {
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Sphere,
  Vector3
} from 'three';

/**
 * Vitriol Rain — the procedural meshes the storm is drawn with.
 *
 * All parameter-space: the vertex stages turn these coordinates into metres
 * from uniforms, so the circle, the cloud and the rain all follow the sliders
 * without a rebuild. Bounds are huge because they mean nothing here.
 */

function bounds(geometry) {
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * The rain: one quad per drop, instanced. The quad is `x` −1..1 across and
 * `y` 0 (head) .. 1 (tail); each instance carries `aDrop` = (disc x, disc z,
 * phase, speed jitter), the disc point uniform over the unit disc. Where a
 * drop is and whether it falls this cycle is decided in the vertex stage.
 */
export function createRainGeometry(count = 700) {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  const drops = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    drops[i * 4] = Math.cos(a) * r;
    drops[i * 4 + 1] = Math.sin(a) * r;
    drops[i * 4 + 2] = Math.random();
    drops[i * 4 + 3] = Math.random();
  }
  geometry.setAttribute('aDrop', new InstancedBufferAttribute(drops, 4));
  geometry.instanceCount = count;
  return bounds(geometry);
}

/** A unit quad, ±1 in XY — the floor disc and the seed billboard. */
export function createVitriolQuadGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  return bounds(geometry);
}

/**
 * An open cylinder in parameter space: `x` the 0..1 angle round, `y` 0..1 up.
 * The shimmer stands it round the circle.
 */
export function createVitriolShellGeometry(segments = 48, rows = 4) {
  const cols = segments + 1;
  const rowCount = rows + 1;
  const positions = new Float32Array(cols * rowCount * 3);
  const indices = new Uint16Array(segments * rows * 6);
  let p = 0;
  for (let j = 0; j < rowCount; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / segments;
      positions[p++] = j / rows;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < segments; i++) {
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
  return bounds(geometry);
}
