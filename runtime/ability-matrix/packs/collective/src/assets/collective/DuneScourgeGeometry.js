import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * The dune wave, in *parameter space*.
 *
 * A grid strip whose vertices are not positions: `position.x` is the lateral
 * fraction across the wave (-1 at the left flank, +1 at the right) and
 * `position.y` is a signed fraction along it — 0 is the crest, -1 the end of
 * the long back slope, +1 the toe of the steep front face. The wave material
 * turns that into metres in its vertex stage (`DuneScourgeMaterial`), from the
 * live front position, so the strip is built once and rides the cast.
 *
 * The rows are not uniform. The crest and the curling lip are where the
 * silhouette is decided and where the normal turns fastest, so rows are
 * crowded toward 0 from both sides; the long back slope is a gentle surface a
 * handful of rows describe exactly.
 *
 * @param {number} [columns]   segments across the wave
 * @param {number} [backRows]  rows down the back slope
 * @param {number} [frontRows] rows down the front face
 */
export function createWaveGeometry(columns = 48, backRows = 34, frontRows = 22) {
  const rows = [];
  // Back slope, from the far end of the tail up to (but not including) the crest.
  for (let j = backRows; j > 0; j--) rows.push(-Math.pow(j / backRows, 1.6));
  rows.push(0);
  for (let j = 1; j <= frontRows; j++) rows.push(Math.pow(j / frontRows, 1.4));

  const across = columns + 1;
  const ringCount = rows.length;
  const positions = new Float32Array(across * ringCount * 3);
  const uvs = new Float32Array(across * ringCount * 2);
  const indices = new Uint16Array(columns * (ringCount - 1) * 6);

  let p = 0;
  let t = 0;
  for (let j = 0; j < ringCount; j++) {
    for (let i = 0; i < across; i++) {
      const lateral = (i / columns) * 2 - 1;
      positions[p++] = lateral;
      positions[p++] = rows[j];
      positions[p++] = 0;
      uvs[t++] = i / columns;
      uvs[t++] = j / (ringCount - 1);
    }
  }

  let k = 0;
  for (let j = 0; j < ringCount - 1; j++) {
    for (let i = 0; i < columns; i++) {
      const a = j * across + i;
      const b = a + 1;
      const c = a + across;
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
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  // Placed in the shader; the real extent is wherever the cast is.
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
