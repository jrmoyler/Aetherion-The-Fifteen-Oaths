import {
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Sphere,
  Vector3
} from 'three';

/**
 * Spore Coffin — the procedural meshes the cage is drawn with.
 *
 * Parameter space throughout: the vertex stages turn these coordinates into
 * metres from uniforms, so the cage re-grows to any slider without a rebuild.
 */

/**
 * The ribs: one tube grid, instanced `maxRibs` times. `position.x` is `s`
 * (0 root .. 1 crown), `position.y` the 0..1 angle round the tube. Each
 * instance carries `aRib` = (index, a random 0..1). Ribs past `ribCount` are
 * collapsed in the vertex stage, so the count is a live slider too.
 */
export function createRibGeometry(maxRibs = 24, rings = 64, sides = 10) {
  const cols = sides + 1;
  const rows = rings + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(sides * rings * 6);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    const s = j / rings;
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
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  const ribs = new Float32Array(maxRibs * 2);
  for (let i = 0; i < maxRibs; i++) {
    ribs[i * 2] = i;
    ribs[i * 2 + 1] = Math.random();
  }
  geometry.setAttribute('aRib', new InstancedBufferAttribute(ribs, 2));
  geometry.instanceCount = maxRibs;
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** A unit quad, ±1 in XY — the mycelium mat and the blast warp. */
export function createCoffinQuadGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
