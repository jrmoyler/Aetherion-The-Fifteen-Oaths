import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Feint Cage's own solid: one cage bar, authored in code.
 *
 * One unit tall along +Y with its foot at the origin; one unit thick (half
 * width 0.5) so the ability scales it by `cageWidth` across and `cageHeight`
 * up. From the floor: a driven foot spike, a lower shaft, a collar, a shaft
 * that twists a quarter turn as it climbs (the illusion read: the bar is not
 * quite where it looks), a second collar, a neck and a broad spearhead whose
 * flat faces the ring's tangent so the blades read broadside from the camera.
 *
 * `aSeam` tags each face for the shader: 0 lacquered shaft (the twist
 * grooves stay dark, cut only by light), 1 a glowing seam (the collars), 2 the spearhead's cutting faces.
 * Flat facets, so the sun picks out every face.
 *
 * This file is cast-local: the generated `FeintCageGeometry.js` is pinned
 * byte for byte by the rig tests and is not touched.
 */
export function createFeintCageBarGeometry() {
  const pos = [];
  const seam = [];
  const tri = (a, b, c, s) => {
    pos.push(...a, ...b, ...c);
    seam.push(s, s, s);
  };
  const quad = (a, b, c, d, s) => {
    tri(a, b, c, s);
    tri(a, c, d, s);
  };
  // A four-sided frustum from y0 to y1, half widths w0 / w1, each ring turned by r0 / r1 radians.
  const ring = (y, w, r) => {
    const out = [];
    for (let k = 0; k < 4; k++) {
      const a = r + Math.PI / 4 + (k * Math.PI) / 2;
      out.push([Math.cos(a) * w * Math.SQRT2, y, Math.sin(a) * w * Math.SQRT2]);
    }
    return out;
  };
  const block = (y0, y1, w0, w1, r0, r1, s, caps = true) => {
    const b = ring(y0, w0, r0);
    const t = ring(y1, w1, r1);
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      quad(b[k], b[k1], t[k1], t[k], s);
    }
    if (caps) {
      quad(t[0], t[3], t[2], t[1], s);
      quad(b[0], b[1], b[2], b[3], s);
    }
  };

  block(0, 0.06, 0.1, 0.46, 0, 0, 0); // driven foot spike
  block(0.06, 0.3, 0.46, 0.42, 0, 0, 0); // lower shaft
  block(0.3, 0.36, 0.62, 0.62, 0, 0, 1); // collar
  // The twisted shaft: a quarter turn over eight segments, a seam groove between.
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const y0 = 0.36 + (i / segs) * 0.42;
    const y1 = 0.36 + ((i + 1) / segs) * 0.42;
    const r0 = (i / segs) * (Math.PI / 2);
    const r1 = ((i + 1) / segs) * (Math.PI / 2);
    block(y0, y1 - 0.008, 0.4, 0.4, r0, r1 - 0.02, 0, false);
    block(y1 - 0.008, y1, 0.34, 0.34, r1 - 0.02, r1, 0, false);
  }
  block(0.78, 0.83, 0.62, 0.62, 0, 0, 1); // upper collar
  block(0.83, 0.86, 0.36, 0.26, 0, 0, 0); // neck

  // The spearhead: a flat diamond blade, broad along local X.
  const y0 = 0.86;
  const y1 = 0.915;
  const tip = [0, 1, 0];
  const base = [[-0.28, y0, 0], [0, y0, 0.22], [0.28, y0, 0], [0, y0, -0.22]];
  const mid = [[-1.15, y1, 0], [0, y1, 0.28], [1.15, y1, 0], [0, y1, -0.28]];
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    quad(base[k], base[k1], mid[k1], mid[k], 2);
    tri(mid[k], mid[k1], tip, 2);
  }
  quad(base[0], base[3], base[2], base[1], 2);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aSeam', new Float32BufferAttribute(seam, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
