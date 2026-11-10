import {
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Sphere,
  Vector3,
  DynamicDrawUsage
} from 'three';

/**
 * Railgun Lance — procedural geometry.
 *
 * Nothing here has a shape of its own. Every mesh the lance draws is a
 * *parameter grid* — a (u, v) lattice in `position.xy` — and its vertex shader
 * bends that lattice into a torus, a slug or a cylinder from uniforms. That is
 * what lets the coil radius, the tube, the beam width and the slug length all
 * be live sliders: the buffer never changes, only the numbers the shader reads.
 */

/**
 * A (u, v) lattice, both 0..1, `segU` × `segV` quads.
 * `u` wraps (around a ring / a tube); `v` runs along.
 */
export function createParamGrid(segU, segV) {
  const cols = segU + 1;
  const rows = segV + 1;
  const position = new Float32Array(cols * rows * 3);
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      position[k++] = i / segU;
      position[k++] = j / segV;
      position[k++] = 0;
    }
  }
  const index = new (cols * rows > 65535 ? Uint32Array : Uint16Array)(segU * segV * 6);
  k = 0;
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index[k++] = a;
      index[k++] = c;
      index[k++] = b;
      index[k++] = b;
      index[k++] = c;
      index[k++] = d;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  // The real extent is decided in the vertex stage; the meshes are not culled.
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * The shock rings punched out along the trail: one unit quad (corners ±1),
 * instanced `max` times. Each instance carries `aShock` = (metres along the
 * line, 0..1 age, seed, strength); the vertex shader stands the quad up
 * across the line at that point.
 */
export function createShockRingGeometry(max) {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const shock = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
  shock.setUsage(DynamicDrawUsage);
  geometry.setAttribute('aShock', shock);
  geometry.instanceCount = 0;
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * The rifling: `strands` parameter grids stacked in one buffer. `position.x`
 * wraps round the strand's tube, `position.y` runs 0..1 down the line and
 * `position.z` is the strand index — the helix material winds each strand
 * round the beam axis at its own phase, so one draw call carries them all.
 */
export function createHelixGeometry(strands, segU, segV) {
  const cols = segU + 1;
  const rows = segV + 1;
  const per = cols * rows;
  const position = new Float32Array(per * strands * 3);
  let k = 0;
  for (let s = 0; s < strands; s++) {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        position[k++] = i / segU;
        position[k++] = j / segV;
        position[k++] = s;
      }
    }
  }
  const index = new Uint32Array(segU * segV * 6 * strands);
  k = 0;
  for (let s = 0; s < strands; s++) {
    const base = s * per;
    for (let j = 0; j < segV; j++) {
      for (let i = 0; i < segU; i++) {
        const a = base + j * cols + i;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        index[k++] = a;
        index[k++] = c;
        index[k++] = b;
        index[k++] = b;
        index[k++] = c;
        index[k++] = d;
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
