import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Procedural geometry for the Polarity Garden.
 *
 *  - the **capsule mine** — a lathed hull with rounded ends, a raised
 *    polarity band at the waist, a beacon dome on top, and four fins at the
 *    base. Built in *mixed* units so one mesh serves every size: `y` is in
 *    capsule heights (0 at the base, 1 at the top of the hull) and the radial
 *    coordinate is in *girths*, so the vertex stage multiplies x/z by the live
 *    `mineGirth` and the instance matrix by `mineSize`. `aPart` tells the
 *    shaders which piece a vertex belongs to (0 hull, 1 band, 2 beacon,
 *    3 fin); `aFin` carries a fin's hinge (its bearing and the hinge height) so
 *    the vertex stage can swing it open as the capsule plants.
 *  - the **tether ribbon** — a strip in parameter space, `(s, w)` with `s` 0 →
 *    1 along and `w` −1 → 1 across. The vertex stage bends it into a field
 *    line between two capsules and turns it to face the camera.
 */

/**
 * Lathe a profile round Y. Rows are `[radius (girths), y (heights)]`.
 * Normals come from the profile's own slope, so the rounded ends shade round.
 */
function lathe(rows, part, sides, out) {
  const base = out.positions.length / 3;
  for (let i = 0; i < rows.length; i++) {
    const [r, y] = rows[i];
    // Profile normal: perpendicular to the neighbouring rows' chord.
    const [r0, y0] = rows[Math.max(0, i - 1)];
    const [r1, y1] = rows[Math.min(rows.length - 1, i + 1)];
    let nr = y1 - y0;
    let ny = -(r1 - r0);
    const l = Math.hypot(nr, ny) || 1;
    nr /= l;
    ny /= l;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      out.positions.push(c * r, y, sn * r);
      out.normals.push(c * nr, ny, sn * nr);
      out.parts.push(part);
      out.fins.push(0, 0);
      out.uvs.push(s / sides, y);
    }
  }
  const stride = sides + 1;
  for (let i = 0; i < rows.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a = base + i * stride + s;
      const b = a + stride;
      out.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

/** One flat fin: a tapered plate standing out from the hull at bearing `a`. */
function fin(bearing, out) {
  const c = Math.cos(bearing);
  const s = Math.sin(bearing);
  // Plate outline in (radial, y): hinge on the hull from y 0.12 to 0.42, tip out at 1.9 girths.
  const outline = [
    [0.92, 0.12],
    [1.95, 0.02],
    [1.75, 0.2],
    [0.92, 0.42]
  ];
  const half = 0.06; // girths, half-thickness
  const hingeY = 0.27;
  const tx = -s;
  const tz = c;
  for (const side of [1, -1]) {
    const base = out.positions.length / 3;
    for (const [r, y] of outline) {
      out.positions.push(c * r + tx * half * side, y, s * r + tz * half * side);
      out.normals.push(tx * side, 0, tz * side);
      out.parts.push(3);
      out.fins.push(bearing, hingeY);
      out.uvs.push(r, y);
    }
    if (side > 0) out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else out.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  // The fin's outer edge, so it is not paper-thin edge-on.
  const base = out.positions.length / 3;
  for (let k = 0; k < 4; k++) {
    const [r, y] = outline[k];
    for (const side of [1, -1]) {
      out.positions.push(c * r + tx * half * side, y, s * r + tz * half * side);
      out.normals.push(c, 0, s);
      out.parts.push(3);
      out.fins.push(bearing, hingeY);
      out.uvs.push(r, y);
    }
  }
  for (let k = 0; k < 3; k++) {
    const i = base + k * 2;
    out.indices.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
  }
}

/**
 * The capsule mine, base at y = 0, hull top at y = 1, beacon above it.
 * @param {number} [sides] radial segments
 */
export function createCapsuleMineGeometry(sides = 28) {
  const out = { positions: [], normals: [], parts: [], fins: [], uvs: [], indices: [] };

  /* --- hull: a rounded bottom cap, the barrel, a rounded top cap --- */
  const hull = [];
  const cap = 0.2;
  const capSteps = 7;
  for (let i = 0; i <= capSteps; i++) {
    const a = (i / capSteps) * Math.PI * 0.5;
    hull.push([Math.sin(a) * 1.0 + 1e-3, cap - Math.cos(a) * cap]);
  }
  hull.push([1.0, 0.4]);
  // The band is its own part; the hull steps in under it.
  hull.push([0.97, 0.41]);
  lathe(hull, 0, sides, out);

  const band = [
    [0.97, 0.41],
    [1.07, 0.42],
    [1.09, 0.47],
    [1.07, 0.53],
    [0.97, 0.54]
  ];
  lathe(band, 1, sides, out);

  const top = [[0.97, 0.54], [1.0, 0.55], [1.0, 1.0 - cap]];
  for (let i = 1; i <= capSteps; i++) {
    const a = (i / capSteps) * Math.PI * 0.5;
    top.push([Math.cos(a) * 1.0 + 1e-3, 1.0 - cap + Math.sin(a) * cap * 0.85]);
  }
  lathe(top, 0, sides, out);

  /* --- beacon: a small dome on a collar --- */
  const beacon = [[0.28, 0.95], [0.3, 1.0]];
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * Math.PI * 0.5;
    beacon.push([Math.cos(a) * 0.3 + 1e-3, 1.0 + Math.sin(a) * 0.16]);
  }
  lathe(beacon, 2, 16, out);

  /* --- four fins --- */
  for (let k = 0; k < 4; k++) fin((k / 4) * Math.PI * 2 + Math.PI / 4, out);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(out.positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(out.normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(out.uvs), 2));
  geometry.setAttribute('aPart', new BufferAttribute(new Float32Array(out.parts), 1));
  geometry.setAttribute('aFin', new BufferAttribute(new Float32Array(out.fins), 2));
  geometry.setIndex(out.indices);
  // Girth is applied in the vertex stage; be generous.
  geometry.boundingSphere = new Sphere(new Vector3(0, 0.5, 0), 2);
  return geometry;
}

/**
 * A ribbon in parameter space: `position = (s, w, 0)`.
 * @param {number} [segments] subdivisions along it
 */
export function createTetherRibbonGeometry(segments = 40) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const s = i / segments;
    positions.push(s, -1, 0, s, 1, 0);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
