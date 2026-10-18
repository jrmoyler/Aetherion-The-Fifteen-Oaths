import { BufferAttribute, BufferGeometry, Matrix4, Sphere, Vector3 } from 'three';

/**
 * Brine Geyser — the procedural meshes.
 *
 *  - **the column** — an open cylinder grid in parameter space
 *    (`position.x` 0..1 round, `position.y` 0..1 up the trunk and over the
 *    crown); the vertex stage raises it into the geyser.
 *  - **the salt crystal cluster** — real geometry: a few hexagonal prisms
 *    with pyramid tips, leaning out of a common root, merged and
 *    non-indexed so every facet is flat. 1 m tall at full growth; the
 *    ability scales each instance.
 */

/** Never culled: a parameter-space mesh's bounds mean nothing. */
export function createColumnGeometry(around = 56, up = 72) {
  const cols = around + 1;
  const rows = up + 1;
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array(around * up * 6);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / around;
      positions[p++] = j / up;
      positions[p++] = 0;
    }
  }
  let k = 0;
  for (let j = 0; j < up; j++) {
    for (let i = 0; i < around; i++) {
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
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** One hexagonal prism with a pyramid tip, radius `r`, shaft `h`, tip `t`, into `out` (flat triangles). */
function prism(out, r, h, t, matrix) {
  const v = new Vector3();
  const ring = (y, scale) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pts.push(new Vector3(Math.cos(a) * r * scale, y, Math.sin(a) * r * scale));
    }
    return pts;
  };
  const base = ring(0, 1.1);
  const top = ring(h, 1);
  const tip = new Vector3(0, h + t, 0);
  const push = (a, b, c) => {
    for (const q of [a, b, c]) {
      v.copy(q).applyMatrix4(matrix);
      out.push(v.x, v.y, v.z);
    }
  };
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    push(base[i], top[i], base[j]);
    push(base[j], top[i], top[j]);
    push(top[i], tip, top[j]);
  }
}

export function createCrystalGeometry() {
  const P = [];
  const m = new Matrix4();
  const tilt = new Matrix4();
  // The main spike, and four smaller ones leaning out of the same root.
  prism(P, 0.16, 0.72, 0.28, m.identity());
  const arms = [
    [0.6, 0.0, 0.11, 0.46, 0.18],
    [0.55, 1.6, 0.1, 0.38, 0.16],
    [0.7, 3.1, 0.09, 0.32, 0.14],
    [0.5, 4.5, 0.08, 0.26, 0.12]
  ];
  for (const [lean, yaw, r, h, t] of arms) {
    m.makeRotationY(yaw);
    tilt.makeRotationZ(lean);
    m.multiply(tilt);
    prism(P, r, h, t, m);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
