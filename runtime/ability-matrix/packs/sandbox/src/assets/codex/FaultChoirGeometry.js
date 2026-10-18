import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Sphere,
  Vector3
} from 'three';

/**
 * Fault Choir — the procedural meshes.
 *
 *  - **the fissure strip** — a long grid in parameter space laid on the floor
 *    down the line by the vertex stage (`position.x` 0..1 along, `position.y`
 *    −1..1 across).
 *  - **the spike** — real geometry: a five-sided stone blade, 1 m tall and
 *    1 m across at the root, tapering with a slight twist to a sharp tip.
 *    Non-indexed so every facet is flat; `aH` is the 0..1 height of each
 *    vertex for the shader. The choir's spikes and the lance are all
 *    instances of it.
 *  - **the song rings** — an instanced unit quad; per instance `aRing`
 *    (centre xyz, progress) and `aRingLook` (size, glow).
 */

const HUGE = () => new Sphere(new Vector3(), 1e4);

export function createFissureGeometry(columns = 200, rows = 8) {
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
  geometry.boundingSphere = HUGE();
  return geometry;
}

/** A five-sided stone blade, root at y = 0, tip at y = 1. */
export function createSpikeGeometry(sides = 5, rings = 6) {
  const P = [];
  const H = [];
  const point = (i, j) => {
    const t = j / rings;
    // Tapers faster near the tip; the facets twist a little up the blade.
    const r = 0.5 * Math.pow(1 - t, 0.85) * (1 + 0.12 * Math.sin(i * 2.3 + j * 1.7));
    const a = (i / sides) * Math.PI * 2 + t * 0.5;
    // Flattened: a blade, not a cone.
    return [Math.cos(a) * r, t, Math.sin(a) * r * 0.62, t];
  };
  const push = (q) => {
    P.push(q[0], q[1], q[2]);
    H.push(q[3]);
  };
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < sides; i++) {
      const a = point(i, j);
      const b = point(i + 1, j);
      const c = point(i, j + 1);
      const d = point(i + 1, j + 1);
      push(a);
      push(c);
      push(b);
      if (j < rings - 1) {
        push(b);
        push(c);
        push(d);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  geometry.setAttribute('aH', new BufferAttribute(new Float32Array(H), 1));
  geometry.computeVertexNormals();
  geometry.boundingSphere = new Sphere(new Vector3(0, 0.5, 0), 1);
  return geometry;
}

/** The song rings: one quad, drawn `maxRings` times. */
export function createRingGeometry(maxRings) {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  const ring = new InstancedBufferAttribute(new Float32Array(maxRings * 4), 4);
  ring.setUsage(DynamicDrawUsage);
  const look = new InstancedBufferAttribute(new Float32Array(maxRings * 2), 2);
  look.setUsage(DynamicDrawUsage);
  geometry.setAttribute('aRing', ring);
  geometry.setAttribute('aRingLook', look);
  geometry.instanceCount = 0;
  geometry.boundingSphere = HUGE();
  return geometry;
}
