import {
  BufferGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  PlaneGeometry,
  Quaternion,
  Shape,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';

/**
 * Martyr's Accord — procedural geometry. A reliquary heart, the swords that
 * pierce it and the crown of thorns that binds it, built the way a goldsmith
 * would: raised, chased and forged, never a primitive used as is.
 *
 *  - **the heart** (`createHeartGeometry`) — a *raised* sacred heart: the
 *    classic heart curve, swept round its own centre by a puffed profile so
 *    the two lobes are full and the cleft and tip stay sharp. A chased belt
 *    runs round its equator (attribute `aBelt`) and a raised rim stands at the
 *    cleft where the flame rises (`aCleft`), both read by the material.
 *  - **the blade** (`createBladeGeometry`) — a lofted diamond-section blade:
 *    a leaf swell below the point, a sunk fuller down the middle, hard
 *    facets. Unit length along +Y (guard at 0, point at 1). `uv.y` runs the
 *    length, `uv.x` is 0 at the edges and 1 on the ridge.
 *  - **the hilt** (`createHiltGeometry`) — swept quillons extruded from an
 *    authored outline, a turned grip and a turned wheel pommel, merged. Same
 *    frame as the blade (it hangs below y = 0).
 *  - **the crown of thorns** (`createCrownGeometry`) — two briars braided
 *    round a unit ring as tubes along their own curves, with thorns set along
 *    them at seeded angles. One mesh.
 *  - **the shards** (`createShardGeometry`) — a curved, bevelled fragment of
 *    the heart's gilded shell, for the rupture.
 *  - carriers — a flame tube reshaped in the vertex shader, and quads.
 *
 * Everything is built once per pool member and disposed with it.
 */

const TAU = Math.PI * 2;

/* ---------------------------------------------------------------------- */
/* The heart                                                               */
/* ---------------------------------------------------------------------- */

/** The 2D heart curve, centred, ~1 tall, pointing −Y. */
function heartCurve(t, out) {
  const s = Math.sin(t);
  const x = 16 * s * s * s;
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return out.set(x / 30, (y + 2.5) / 30);
}

/**
 * A raised heart, ~1 m tall (−0.48 tip … +0.48 lobes), ~1.07 wide, `depth`
 * front to back. Indexed, smooth, seam welded.
 * @param {number} segU   around the outline
 * @param {number} segV   pole to pole through the body
 * @param {number} depth  half-thickness at the centre
 */
export function createHeartGeometry(segU = 112, segV = 44, depth = 0.34) {
  const position = [];
  const uv = [];
  const belt = [];
  const cleft = [];
  const p = new Vector2();
  for (let j = 0; j <= segV; j++) {
    const v = -Math.PI / 2 + (j / segV) * Math.PI;
    const cv = Math.cos(v);
    // Puffed profile: full shoulders, but the cleft and tip stay crisp.
    const k = Math.pow(Math.max(0, cv), 0.42);
    const z = Math.sin(v) * depth;
    for (let i = 0; i <= segU; i++) {
      const t = ((i % segU) / segU) * TAU;
      heartCurve(t, p);
      // A chased belt stands proud round the equator.
      const b = Math.exp(-Math.pow(v / 0.075, 2));
      const swell = 1 + 0.035 * b;
      // The lobes bulge forward more than the tip: a heart, not a cushion.
      const lobe = 0.85 + 0.25 * Math.max(0, p.y + 0.1);
      position.push(p.x * k * swell, p.y * k * swell, z * lobe * (1 + 0.06 * b));
      uv.push(i / segU, j / segV);
      belt.push(b);
      // The cleft between the lobes (t ≈ 0) on both faces.
      const ct = Math.min(t, TAU - t);
      cleft.push(Math.exp(-ct * ct * 40) * Math.pow(cv, 0.5));
    }
  }
  const index = [];
  const row = segU + 1;
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * row + i;
      const b = a + row;
      // Wrap the seam onto the first column so normals weld across it.
      const a1 = j * row + ((i + 1) % segU);
      const b1 = a1 + row;
      index.push(a, b, a1, a1, b, b1);
    }
  }
  const g = new BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aBelt', new Float32BufferAttribute(belt, 1));
  g.setAttribute('aCleft', new Float32BufferAttribute(cleft, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Deterministic point on the heart's surface for shard `i` (local units). */
export function heartSurfacePoint(i, count, out, depth = 0.34) {
  const golden = 2.399963;
  const t = (i * golden) % TAU;
  const f = (i + 0.5) / count;
  const v = -Math.PI / 2 + f * Math.PI;
  const p = new Vector2();
  heartCurve(t, p);
  const k = Math.pow(Math.max(0, Math.cos(v)), 0.42);
  return out.set(p.x * k, p.y * k, Math.sin(v) * depth);
}

/* ---------------------------------------------------------------------- */
/* The swords                                                              */
/* ---------------------------------------------------------------------- */

/**
 * A lofted diamond-section blade, unit length along +Y (guard 0 → point 1),
 * ~0.09 wide at the shoulder. Non-indexed so every facet is crisp.
 */
export function createBladeGeometry(stations = 18) {
  const position = [];
  const uv = [];
  // [y, half width, half thickness, fuller depth]
  const ring = [];
  for (let s = 0; s <= stations; s++) {
    const y = s / stations;
    // Ricasso, a long taper, a leaf swell just below the point, the point.
    const swell = Math.exp(-Math.pow((y - 0.72) / 0.13, 2)) * 0.012;
    const taper = 0.045 * (1 - 0.35 * y) + swell;
    const point = y > 0.86 ? Math.pow(1 - (y - 0.86) / 0.14, 0.85) : 1;
    const w = taper * point;
    const th = 0.012 * (1 - 0.5 * y) * point + 0.0015;
    const fuller = y < 0.62 ? Math.sin(Math.min(1, y / 0.62) * Math.PI) * 0.6 : 0;
    ring.push([y, w, th, fuller]);
  }
  // Six points round the section: edge, ridge-left, ridge-right (front & back),
  // the ridges sunk by the fuller.
  const section = (r, out) => {
    const [y, w, th, f] = r;
    const ridge = th * (1 - f * 0.55);
    out[0] = [w, y, 0, 0];
    out[1] = [w * 0.22, y, th, 0.7];
    out[2] = [0, y, ridge, 1];
    out[3] = [-w * 0.22, y, th, 0.7];
    out[4] = [-w, y, 0, 0];
    out[5] = [-w * 0.22, y, -th, 0.7];
    out[6] = [0, y, -ridge, 1];
    out[7] = [w * 0.22, y, -th, 0.7];
    return out;
  };
  const A = new Array(8);
  const B = new Array(8);
  for (let s = 0; s < stations; s++) {
    section(ring[s], A);
    section(ring[s + 1], B);
    for (let k = 0; k < 8; k++) {
      const k1 = (k + 1) % 8;
      const quad = [A[k], B[k], B[k1], A[k], B[k1], A[k1]];
      for (const q of quad) {
        position.push(q[0], q[1], q[2]);
        uv.push(q[3], q[1]);
      }
    }
  }
  // Cap the guard end.
  section(ring[0], A);
  for (let k = 0; k < 8; k++) {
    const k1 = (k + 1) % 8;
    for (const q of [[0, 0, 0, 1], A[k1], A[k]]) {
      position.push(q[0], q[1], q[2]);
      uv.push(q[3], 0);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Quillons, grip and pommel, hanging below y = 0 in blade units. */
export function createHiltGeometry() {
  // Quillons: a swept bar, flared and curled toward the blade at the ends.
  const q = new Shape();
  q.moveTo(-0.17, 0.03);
  q.quadraticCurveTo(-0.1, -0.005, 0, -0.012);
  q.quadraticCurveTo(0.1, -0.005, 0.17, 0.03);
  q.quadraticCurveTo(0.2, 0.05, 0.185, 0.012);
  q.quadraticCurveTo(0.16, -0.02, 0.06, -0.03);
  q.lineTo(0.035, -0.045);
  q.lineTo(-0.035, -0.045);
  q.lineTo(-0.06, -0.03);
  q.quadraticCurveTo(-0.16, -0.02, -0.185, 0.012);
  q.quadraticCurveTo(-0.2, 0.05, -0.17, 0.03);
  const guard = new ExtrudeGeometry(q, {
    depth: 0.026, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2, curveSegments: 12,
  });
  guard.translate(0, 0, -0.013);
  // A turned, wire-wrapped grip: rings in the profile read as the binding.
  const gripProfile = [];
  for (let i = 0; i <= 14; i++) {
    const y = -0.045 - (i / 14) * 0.2;
    gripProfile.push(new Vector2(0.017 + 0.004 * Math.abs(Math.sin(i * 1.7)), y));
  }
  gripProfile.reverse();
  const grip = new LatheGeometry(gripProfile, 12);
  // A turned pommel: a waisted neck swelling into a faceted knob with a boss.
  const pommelProfile = [[0, -0.338], [0.012, -0.335], [0.022, -0.322], [0.042, -0.31], [0.05, -0.29], [0.048, -0.27], [0.03, -0.25], [0.016, -0.245], [0, -0.244]]
    .map(([r, y]) => new Vector2(r, y));
  const pommel = new LatheGeometry(pommelProfile, 10);
  return mergeGeometries([guard, grip, pommel]);
}

/* ---------------------------------------------------------------------- */
/* The crown of thorns                                                     */
/* ---------------------------------------------------------------------- */

/** Two briars braided round a unit ring, with seeded thorns. */
export function createCrownGeometry({ twists = 6, amplitude = 0.07, tube = 0.026, thorns = 46 } = {}) {
  const parts = [];
  const strands = [];
  for (let s = 0; s < 2; s++) {
    const points = [];
    const n = 160;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const phase = twists * a + s * Math.PI;
      const r = 1 + amplitude * Math.cos(phase);
      points.push(new Vector3(Math.cos(a) * r, amplitude * Math.sin(phase) * 0.9, Math.sin(a) * r));
    }
    const curve = new CatmullRomCurve3(points, true);
    strands.push(curve);
    parts.push(new TubeGeometry(curve, 240, tube, 7, true));
  }
  // Thorns: little cones set on the strands, leaning out of the braid.
  let h = 0x9e3779b9;
  const rand = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
  const at = new Vector3();
  const tangent = new Vector3();
  const out = new Vector3();
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < thorns; i++) {
    const curve = strands[i % 2];
    const u = (i + rand() * 0.6) / thorns;
    curve.getPointAt(u, at);
    curve.getTangentAt(u, tangent);
    // Leaning outward and up/down at random, always off the tangent.
    out.set(at.x, 0, at.z).normalize().multiplyScalar(0.6 + rand() * 0.6)
      .addScaledVector(up, (rand() - 0.5) * 1.6)
      .addScaledVector(tangent, (rand() - 0.5) * 0.5)
      .normalize();
    const len = 0.09 + rand() * 0.08;
    const cone = new ConeGeometry(0.016 + rand() * 0.006, len, 5, 1);
    cone.translate(0, len / 2 + tube * 0.6, 0);
    // Rotate +Y onto `out`.
    cone.applyQuaternion(new Quaternion().setFromUnitVectors(up, out));
    cone.translate(at.x, at.y, at.z);
    parts.push(cone);
  }
  return mergeGeometries(parts);
}

/* ---------------------------------------------------------------------- */
/* Shards, carriers                                                        */
/* ---------------------------------------------------------------------- */

/** A curved, bevelled fragment of the gilded shell, ~0.2 m. */
export function createShardGeometry() {
  const s = new Shape();
  const outline = [[0, 0.12], [-0.06, 0.07], [-0.1, -0.01], [-0.05, -0.09], [0.03, -0.1], [0.09, -0.03], [0.07, 0.06]];
  s.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) s.lineTo(outline[i][0], outline[i][1]);
  s.closePath();
  const g = new ExtrudeGeometry(s, {
    depth: 0.018, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 4,
  });
  // Curve it as if it had been cut from the heart's skin.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, p.getZ(i) - (x * x + y * y) * 1.6);
  }
  g.computeVertexNormals();
  // The gold material reads these; a shard has neither belt nor cleft.
  g.setAttribute('aBelt', new Float32BufferAttribute(new Float32Array(p.count), 1));
  g.setAttribute('aCleft', new Float32BufferAttribute(new Float32Array(p.count), 1));
  return g;
}

/** The flame's carrier: an open tube with height rings, reshaped in the shader. */
export function createFlameGeometry() {
  const g = new CylinderGeometry(0.5, 0.5, 1, 28, 20, true);
  g.translate(0, 0.5, 0); // base at y = 0, tip at y = 1
  return g;
}

/** A flat unit quad. */
export function createQuad() {
  return new PlaneGeometry(1, 1);
}

/* ---------------------------------------------------------------------- */

/** Concatenate geometries that share position / normal / uv. */
function mergeGeometries(list) {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = ['position', 'normal', 'uv'];
  const out = new BufferGeometry();
  for (const name of names) {
    const size = flat[0].attributes[name].itemSize;
    let total = 0;
    for (const g of flat) total += g.attributes[name].array.length;
    const array = new Float32Array(total);
    let at = 0;
    for (const g of flat) {
      array.set(g.attributes[name].array, at);
      at += g.attributes[name].array.length;
    }
    out.setAttribute(name, new Float32BufferAttribute(array, size));
  }
  for (const g of list) g.dispose();
  for (const g of flat) if (!list.includes(g)) g.dispose();
  out.computeBoundingSphere();
  return out;
}
