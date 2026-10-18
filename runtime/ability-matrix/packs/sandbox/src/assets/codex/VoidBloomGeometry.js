import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Void Bloom — procedural geometry. Parameter grids only: the petal's shape
 * (its spine, its taper, its cup, how far it has opened) is computed in the
 * vertex stage of `VoidBloomMaterials#createPetalMaterial` from live uniforms.
 */

const BIG = new Sphere(new Vector3(), 1e4);

/**
 * One petal — `position.x` −1..1 across, `position.y` 0 (base) .. 1 (tip).
 * Instanced: each instance's matrix turns it to its bearing round the bloom.
 */
export function createPetalGeometry(across = 14, along = 48) {
  const cols = across + 1;
  const rows = along + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(across * along * 6);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = (i / across) * 2 - 1;
      positions[p++] = j / along;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < along; j++) {
    for (let i = 0; i < across; i++) {
      const a = j * cols + i;
      indices[k++] = a;
      indices[k++] = a + 1;
      indices[k++] = a + cols;
      indices[k++] = a + 1;
      indices[k++] = a + cols + 1;
      indices[k++] = a + cols;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = BIG;
  return geometry;
}

/** A unit quad, `position.xy` in −1..1. */
export function createQuadGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)
  );
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.boundingSphere = BIG;
  return geometry;
}
