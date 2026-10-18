import {
  BufferAttribute,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Sphere,
  Vector3
} from 'three';

/**
 * Pearl Tempest — the procedural meshes.
 *
 *  - **the pearl** — a smooth icosphere, instanced (one per pearl).
 *  - **the wake** — a thin tube grid in parameter space, instanced: each
 *    instance is one strand of one pearl's double-helix wake. The vertex stage
 *    reads the pearl's whole flight (start, landing, arc, bow, progress) from
 *    per-instance attributes and wraps the strand round the arc behind it, so
 *    the CPU writes five numbers per strand per frame and never a vertex.
 *  - **the crown** — an open cylinder grid in parameter space, instanced: the
 *    vertex stage raises it into a splash crown with spiked rim from each
 *    instance's centre, progress and seed.
 *
 * Parameter-space meshes are never culled: their bounds mean nothing.
 */

const HUGE = () => new Sphere(new Vector3(), 1e4);

function grid(columns, rows) {
  const cols = columns + 1;
  const rowCount = rows + 1;
  const positions = new Float32Array(cols * rowCount * 3);
  const indices = new Uint16Array(columns * rows * 6);
  let p = 0;
  for (let j = 0; j < rowCount; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / columns;
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
  return { positions, indices };
}

function instanced(columns, rows, maxInstances, attributes) {
  const { positions, indices } = grid(columns, rows);
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  for (const [name, size] of attributes) {
    const attr = new InstancedBufferAttribute(new Float32Array(maxInstances * size), size);
    attr.setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, attr);
  }
  geometry.instanceCount = 0;
  geometry.boundingSphere = HUGE();
  return geometry;
}

/** A pearl, radius 1. */
export function createPearlGeometry() {
  return new IcosahedronGeometry(1, 4);
}

/**
 * One wake strand: `position.x` 0..1 round the strand, `position.y` 0..1 from
 * the pearl back along the wake. Per instance:
 *   aFrom  vec3  where the pearl was thrown from
 *   aTo    vec3  where it lands
 *   aArc   vec4  (apex height m, sideways bow m, progress 0..1, strand phase)
 *   aLook  vec2  (seed, strength)
 */
export function createWakeGeometry(maxInstances) {
  return instanced(6, 56, maxInstances, [
    ['aFrom', 3],
    ['aTo', 3],
    ['aArc', 4],
    ['aLook', 2]
  ]);
}

/**
 * One crown: `position.x` 0..1 round, `position.y` 0..1 up the wall. Per
 * instance `aCrown` vec4 (x, z, progress 0..1, seed), `aScale` float.
 */
export function createCrownGeometry(maxInstances) {
  return instanced(64, 14, maxInstances, [
    ['aCrown', 4],
    ['aScale', 1]
  ]);
}
