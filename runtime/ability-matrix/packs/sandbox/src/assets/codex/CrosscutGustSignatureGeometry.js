import { BufferGeometry, Float32BufferAttribute, IcosahedronGeometry } from 'three';

/**
 * Crosscut Gust's own solids, authored in code (cast-local; the generated
 * `CrosscutGustGeometry.js` is pinned by the rig tests and is not touched).
 *
 *  - `createCrosscutBladeGeometry` — one scythe sweep of shearing air: a thin
 *    crescent blade, horn to horn, with a lens cross-section (thick at the
 *    spine, sharp at the cutting edge). Unit space; the blade material sizes
 *    it from the live settings in its vertex stage (span, sag, bow, thickness),
 *    so every dimension is a slider.
 *  - `createCrosscutClodGeometry` — a torn chunk of turf: a lumpy, faceted clod
 *    with a grassy top and a soil underside (vertex colours), ~1 m across in
 *    unit space; instanced and scaled to 0.2–0.4 m as the debris the blades drag.
 */

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The scythe blade. Attributes:
 *   `aU`    0..1 horn to horn along the sweep (the trailing horn is u = 1);
 *   `aV`    0..1 across the blade, inner (concave) edge → outer cutting edge;
 *   `aFace` +1 front face, −1 back face;
 *   `aThick` 0..1 local half-thickness of the lens section at this vertex.
 * Position: x ∈ [-1, 1] across the chord, y ∈ [~-0.25, ~0.75] up (the arc's
 * outer edge peaks near 0.75, horns sit near −0.25), z = 0 (the material
 * bows and thickens it). The blade is a little asymmetric — the leading horn
 * is broad, the trailing horn hooks thin — so it reads as a scythe, not a moon.
 */
export function createCrosscutBladeGeometry({ cols = 72, rows = 10 } = {}) {
  const pos = [];
  const au = [];
  const av = [];
  const af = [];
  const at = [];
  const index = [];
  const ring = rows * 2; // front face rows, then back face rows
  for (let i = 0; i <= cols; i++) {
    const t = i / cols;
    // Chord and arc: x from −1 to 1, outer edge an asymmetric arc.
    const x = -Math.cos(Math.PI * t);
    const arc = Math.sin(Math.PI * t);
    const outer = arc * (1 + 0.12 * (0.5 - t)) - 0.25;
    // Crescent width: broad near the leading third, tapering to needle horns.
    const width = 0.42 * Math.pow(arc, 1.2) * (1.15 - 0.45 * t);
    // The trailing horn hooks inward a touch.
    const hook = 0.06 * Math.pow(t, 6);
    for (let j = 0; j <= ring; j++) {
      const front = j <= rows;
      const s = front ? j / rows : (ring - j) / rows; // 0 inner .. 1 outer and back
      const y = outer - width * (1 - s) - hook;
      const lens = Math.pow(Math.sin(Math.PI * s), 0.7) * Math.pow(arc, 0.6);
      pos.push(x - hook * 0.4, y, 0);
      au.push(t);
      av.push(s);
      af.push(front ? 1 : -1);
      at.push(lens);
    }
  }
  const stride = ring + 1;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aU', new Float32BufferAttribute(au, 1));
  g.setAttribute('aV', new Float32BufferAttribute(av, 1));
  g.setAttribute('aFace', new Float32BufferAttribute(af, 1));
  g.setAttribute('aThick', new Float32BufferAttribute(at, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  g.boundingSphere.radius = 3;
  return g;
}

/**
 * A torn turf clod: a squashed, lumpy icosahedron, faceted (flat normals),
 * coloured grass-dark on top and soil underneath. ~1 m across in unit space.
 */
export function createCrosscutClodGeometry() {
  const base = new IcosahedronGeometry(0.5, 1);
  const p = base.getAttribute('position');
  // Displace each distinct vertex by a hash of its rounded position so shared
  // corners stay welded after the faces are split for flat shading.
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = Math.round(x * 97) * 3.1 + Math.round(y * 89) * 7.7 + Math.round(z * 83) * 1.3;
    const r = 0.78 + 0.42 * hash(k);
    const flat = y > 0.18 ? 0.8 : 1; // a flatter, torn top
    p.setXYZ(i, x * r * (1 + 0.25 * hash(k + 2)), y * r * 0.85 * flat, z * r);
  }
  const g = base.index ? base.toNonIndexed() : base;
  if (g !== base) base.dispose();
  g.computeVertexNormals();
  const n = g.getAttribute('normal');
  const colors = [];
  for (let i = 0; i < n.count; i += 3) {
    const up = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
    const v = hash(i * 0.37);
    let r;
    let gg;
    let b;
    if (up > 0.45) {
      // Turf: dark grass with a little straw.
      r = 0.8 + 0.2 * v;
      gg = 1.0;
      b = 0.62 + 0.15 * v;
    } else {
      // Soil and root mat.
      r = 1.0;
      gg = 0.7 + 0.1 * v;
      b = 0.48 + 0.1 * v;
    }
    for (let k = 0; k < 3; k++) colors.push(r, gg, b);
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.computeBoundingSphere();
  return g;
}
