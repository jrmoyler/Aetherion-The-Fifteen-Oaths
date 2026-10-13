import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Downburst — parameter-space geometry.
 *
 * Every mesh the Downburst draws is placed in its own vertex stage from
 * uniforms, so none of these buffers holds a world position: they hold the
 * *parameters* the shader turns into one. That is what lets the cloud widen,
 * the column descend and the torus roll outward with nothing but a uniform
 * write per frame — and what lets every dimension be an editor slider that
 * re-shapes a cast already in flight.
 *
 * Built once, at construction. Nothing here is touched again.
 */

/**
 * A polar disc: `uv.x` is the radius 0..1, `uv.y` the bearing 0..1.
 *
 * Rings rather than a square grid, so the storm cloud's spiral has vertices
 * where the shader bends it and the sag at the centre is smooth. `position`
 * carries the unit-disc point too (x, 0, z) for anything that wants it.
 *
 * @param {number} rings radial subdivisions
 * @param {number} segments around
 */
export function createPolarDiscGeometry(rings = 28, segments = 96) {
  const cols = segments + 1;
  const count = (rings + 1) * cols;
  const position = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let k = 0;
  for (let i = 0; i <= rings; i++) {
    // Denser toward the centre, where the sag curves hardest.
    const r = Math.pow(i / rings, 0.85);
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      position[k * 3] = Math.cos(a) * r;
      position[k * 3 + 1] = 0;
      position[k * 3 + 2] = Math.sin(a) * r;
      uv[k * 2] = r;
      uv[k * 2 + 1] = j / segments;
      k++;
    }
  }
  const index = new Uint32Array(rings * segments * 6);
  let n = 0;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * cols + j;
      const b = a + cols;
      index[n++] = a;
      index[n++] = b;
      index[n++] = a + 1;
      index[n++] = a + 1;
      index[n++] = b;
      index[n++] = b + 1;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
}

/**
 * An open tube in parameter space: `uv.x` the bearing 0..1, `uv.y` the height
 * 0 (bottom) .. 1 (top). The column and the pressure funnel are both this,
 * bent into different profiles by their own vertex stages.
 */
export function createTubeGeometry(segments = 64, rows = 40) {
  const cols = segments + 1;
  const count = (rows + 1) * cols;
  const position = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let k = 0;
  for (let i = 0; i <= rows; i++) {
    const v = i / rows;
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      position[k * 3] = Math.cos(a);
      position[k * 3 + 1] = v;
      position[k * 3 + 2] = Math.sin(a);
      uv[k * 2] = j / segments;
      uv[k * 2 + 1] = v;
      k++;
    }
  }
  const index = new Uint32Array(rows * segments * 6);
  let n = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * cols + j;
      const b = a + cols;
      index[n++] = a;
      index[n++] = a + 1;
      index[n++] = b;
      index[n++] = a + 1;
      index[n++] = b + 1;
      index[n++] = b;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
}

/**
 * A torus in parameter space: `uv.x` the major bearing 0..1 (round the ring),
 * `uv.y` the minor bearing 0..1 (round the tube). The rolling dust ring places
 * and rolls it in its vertex stage; nothing about its size is baked here.
 */
export function createTorusParamGeometry(major = 96, minor = 20) {
  const cols = minor + 1;
  const count = (major + 1) * cols;
  const position = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let k = 0;
  for (let i = 0; i <= major; i++) {
    for (let j = 0; j <= minor; j++) {
      position[k * 3] = i / major;
      position[k * 3 + 1] = j / minor;
      position[k * 3 + 2] = 0;
      uv[k * 2] = i / major;
      uv[k * 2 + 1] = j / minor;
      k++;
    }
  }
  const index = new Uint32Array(major * minor * 6);
  let n = 0;
  for (let i = 0; i < major; i++) {
    for (let j = 0; j < minor; j++) {
      const a = i * cols + j;
      const b = a + cols;
      index[n++] = a;
      index[n++] = b;
      index[n++] = a + 1;
      index[n++] = a + 1;
      index[n++] = b;
      index[n++] = b + 1;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
}

/** A unit quad on the floor, ±1 in x/z, `uv` 0..1 — the ground blast and its lens. */
export function createGroundQuadGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3)
  );
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 2, 1, 0, 3, 2]), 1));
  return geometry;
}
