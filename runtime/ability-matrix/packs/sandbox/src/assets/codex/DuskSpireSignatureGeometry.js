import { Float32BufferAttribute, LatheGeometry, Matrix4, Vector2 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Dusk Spire — the cast's own solids (upgrade pass).
 *
 * Kept apart from the generated `DuskSpireGeometry.js` (pinned byte for byte
 * by tests/pure-rigs.test.mjs). Two shapes, both faceted, flat-shaded and
 * jittered so the sun breaks them into planes like split obsidian:
 *
 *  - **column** — a five-sided basalt column with a broken, off-centre shard
 *    tip and a flared foot. 1 m tall, base radius 0.2 m; the ability scales it.
 *  - **spire** — the centre: a seven-sided needle with three leaning thorns
 *    and buttressed roots. 1 m tall, base radius 0.24 m.
 *
 * Every vertex carries `aHeat` (0..1): how close it is to a seam the dusk
 * light runs up (the foot, the thorn roots, the shard break). The material
 * turns it into the glowing seams; the rest stays dark lit stone.
 */

/** Deterministic hash of a quantised position, so seam vertices jitter together. */
function jitterOf(x, y, z, salt) {
  const h = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 991) * 78.233 + Math.round(z * 983) * 37.719 + salt * 17.13) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * A faceted lathe: profile [[radius, y], …] round Y, the rings jittered
 * (radially, by `rough`) so the facets are not regular, then de-indexed and
 * flat-shaded. `heatOf(y, r)` fills `aHeat`.
 */
function shard(profile, segments, rough, salt, heatOf, twist = 0) {
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const k = 1 + (jitterOf(x, y, z, salt) - 0.5) * 2 * rough;
    const a = Math.atan2(z, x) + twist * y;
    pos.setXYZ(i, Math.cos(a) * r * k, y, Math.sin(a) * r * k);
  }
  const flat = g.toNonIndexed();
  g.dispose();
  const p = flat.getAttribute('position');
  const heat = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) heat[i] = heatOf(p.getY(i), Math.hypot(p.getX(i), p.getZ(i)));
  flat.setAttribute('aHeat', new Float32BufferAttribute(heat, 1));
  flat.deleteAttribute('uv');
  flat.deleteAttribute('normal');
  flat.computeVertexNormals();
  return flat;
}

/** A basalt column, 1 m tall, base radius 0.2 m, foot at y = −0.12 (buried), off-centre broken tip. */
export function createDuskSpireColumnGeometry() {
  const body = shard(
    [[0, -0.12], [0.24, -0.12], [0.23, 0.0], [0.2, 0.08], [0.19, 0.38], [0.17, 0.62], [0.15, 0.78], [0.09, 0.9], [0.0, 1.0]],
    5,
    0.12,
    1,
    (y) => (y < 0.1 ? 0.55 * (1 - y / 0.1) : y > 0.76 && y < 0.9 ? 0.25 : 0)
  );
  // A chip of shard leaning off the shoulder: the column was broken, not turned.
  const chip = shard([[0, 0], [0.07, 0.02], [0.05, 0.22], [0, 0.3]], 4, 0.15, 2, () => 0.35);
  chip.applyMatrix4(new Matrix4().makeRotationZ(-0.45).setPosition(0.14, 0.6, 0.02));
  const merged = mergeGeometries([body, chip], false);
  body.dispose();
  chip.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/** The centre spire, 1 m tall, base radius 0.24 m: a twisted needle, three thorns, buttress roots. */
export function createDuskSpireSpireGeometry() {
  const parts = [];
  parts.push(
    shard(
      [[0, -0.1], [0.3, -0.1], [0.27, 0.0], [0.22, 0.06], [0.2, 0.2], [0.15, 0.42], [0.11, 0.6], [0.075, 0.76], [0.04, 0.9], [0.0, 1.0]],
      7,
      0.1,
      3,
      (y) => (y < 0.08 ? 0.55 : y > 0.4 && y < 0.46 ? 0.45 : y > 0.88 ? 0.6 : 0),
      0.6
    )
  );
  // Three thorns leaning out of the waist, each its own five-sided shard.
  for (let i = 0; i < 3; i++) {
    const t = shard([[0, 0], [0.06, 0.0], [0.05, 0.12], [0.03, 0.26], [0, 0.36]], 5, 0.12, 10 + i, (y) => (y < 0.05 ? 0.6 : 0));
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const y0 = 0.3 + i * 0.13;
    const m = new Matrix4().makeRotationY(-a).multiply(new Matrix4().makeRotationZ(-0.85 + i * 0.12));
    m.setPosition(Math.cos(a) * 0.13, y0, Math.sin(a) * 0.13);
    t.applyMatrix4(m);
    parts.push(t);
  }
  // Buttress roots: low wedges splaying into the floor.
  for (let i = 0; i < 5; i++) {
    const r = shard([[0, 0], [0.08, 0.0], [0.06, 0.08], [0.0, 0.2]], 4, 0.15, 20 + i, () => 0.5);
    const a = (i / 5) * Math.PI * 2 + 0.2;
    const m = new Matrix4().makeRotationY(-a).multiply(new Matrix4().makeRotationZ(-1.15));
    m.setPosition(Math.cos(a) * 0.2, -0.04, Math.sin(a) * 0.2);
    r.applyMatrix4(m);
    parts.push(r);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}
