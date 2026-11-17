import { BufferAttribute, BufferGeometry } from 'three';

// GLTFLoader gives each primitive its own geometry. Share the immutable
// vertex buffers and give the filtered primitive a separate index buffer.
export function withPrimitiveIndices(source, indices) {
  const geometry = new BufferGeometry();
  geometry.name = source.name;
  geometry.attributes = { ...source.attributes };
  geometry.morphAttributes = { ...source.morphAttributes };
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  geometry.boundingBox = source.boundingBox;
  geometry.boundingSphere = source.boundingSphere;
  geometry.userData = { ...source.userData };
  return geometry.setIndex(new BufferAttribute(indices, 1));
}
