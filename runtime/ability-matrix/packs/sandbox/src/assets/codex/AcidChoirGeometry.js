import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Acid Choir — the procedural meshes the choir is drawn with.
 *
 * Parameter space: the vertex stages turn these coordinates into metres from
 * uniforms, so every voice walks, swells and crashes with no rebuild.
 */

/**
 * `voices` cylindrical bands in one buffer. `position.x` is the 0..1 angle
 * round, `position.y` 0 (foot) .. 1 (crest); `aVoice` is the band's index,
 * which the wall shader uses to read its own radius, height and age out of
 * uniform arrays. One draw call sings the whole choir.
 */
export function createVoiceBandsGeometry(voices = 8, segments = 120, rows = 8) {
  const cols = segments + 1;
  const rowCount = rows + 1;
  const perBand = cols * rowCount;
  const positions = new Float32Array(perBand * voices * 3);
  const slots = new Float32Array(perBand * voices);
  const indices = new Uint32Array(segments * rows * 6 * voices);
  let p = 0;
  let s = 0;
  let k = 0;
  for (let v = 0; v < voices; v++) {
    const base = v * perBand;
    for (let j = 0; j < rowCount; j++) {
      for (let i = 0; i < cols; i++) {
        positions[p++] = i / segments;
        positions[p++] = j / rows;
        positions[p++] = 0;
        slots[s++] = v;
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < segments; i++) {
        const a = base + j * cols + i;
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
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aVoice', new BufferAttribute(slots, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** A unit quad, ±1 in XY — the floor and the travelling note. */
export function createChoirQuadGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
