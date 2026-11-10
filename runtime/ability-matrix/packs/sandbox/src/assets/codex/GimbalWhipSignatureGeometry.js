import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Gimbal Whip's own solids, authored in code (cast-local; the generated
 * `GimbalWhipGeometry.js` is pinned by the rig tests and is not touched).
 *
 * The cutter is three machined parts, each its own mesh so the ability can
 * turn them independently like a real gimbal:
 *   - the **yoke**: the outer ring, flat-banded, in the local XY plane (axis
 *     Z), with pivot bosses at ±X that carry the cradle and a tail fin on top;
 *   - the **cradle**: the inner ring in the local YZ plane (axis X), pivoting
 *     on the yoke's bosses, with its own bosses at ±Z carrying the blade;
 *   - the **blade**: a hex hub and a toothed saw disc in the local XY plane
 *     (axis Z), spinning on the cradle.
 *
 * `aKind` per vertex: 0 machined gunmetal, 1 a seam / inset channel (glows
 * cyan when powered), 2 a cutting edge or tooth (white-hot when it bites).
 */

function makeBuilder() {
  const pos = [];
  const kind = [];
  return {
    pos,
    kind,
    tri(a, b, c, k) {
      pos.push(...a, ...b, ...c);
      kind.push(k, k, k);
    },
    quad(a, b, c, d, k) {
      this.tri(a, b, c, k);
      this.tri(a, c, d, k);
    },
    /** An axis-aligned box, centre (x, y, z), half sizes (hx, hy, hz). */
    box(x, y, z, hx, hy, hz, k) {
      const v = (sx, sy, sz) => [x + sx * hx, y + sy * hy, z + sz * hz];
      this.quad(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1), k);
      this.quad(v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1), k);
      this.quad(v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), k);
      this.quad(v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), k);
      this.quad(v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1), k);
      this.quad(v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1), k);
    },
    /**
     * A flat band ring round a local axis: `map(a, r, w)` turns ring angle,
     * radius and axial offset into a point. Inner / outer radius `r0`/`r1`,
     * axial half width `hw`. The outer face carries a seam channel.
     */
    band(map, r0, r1, hw, segs) {
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI * 2;
        const a1 = ((s + 1) / segs) * Math.PI * 2;
        const rm = (r0 + r1) * 0.5;
        // outer face, split into two strips with a seam channel between
        this.quad(map(a0, r1, -hw), map(a1, r1, -hw), map(a1, r1, -hw * 0.12), map(a0, r1, -hw * 0.12), 0);
        this.quad(map(a0, r1 * 0.985, -hw * 0.12), map(a1, r1 * 0.985, -hw * 0.12), map(a1, r1 * 0.985, hw * 0.12), map(a0, r1 * 0.985, hw * 0.12), 1);
        this.quad(map(a0, r1, hw * 0.12), map(a1, r1, hw * 0.12), map(a1, r1, hw), map(a0, r1, hw), 0);
        // inner face
        this.quad(map(a0, r0, hw), map(a1, r0, hw), map(a1, r0, -hw), map(a0, r0, -hw), 0);
        // the two flat sides, with a chamfer line of seam at mid radius
        this.quad(map(a0, r0, hw), map(a0, rm, hw), map(a1, rm, hw), map(a1, r0, hw), 0);
        this.quad(map(a0, rm, hw), map(a0, r1, hw), map(a1, r1, hw), map(a1, rm, hw), s % 8 === 0 ? 1 : 0);
        this.quad(map(a0, r0, -hw), map(a1, r0, -hw), map(a1, rm, -hw), map(a0, rm, -hw), 0);
        this.quad(map(a0, rm, -hw), map(a1, rm, -hw), map(a1, r1, -hw), map(a0, r1, -hw), s % 8 === 0 ? 1 : 0);
      }
    }
  };
}

function finish(b) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(b.pos, 3));
  geometry.setAttribute('aKind', new Float32BufferAttribute(b.kind, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The yoke: outer ring of radius 1 in XY, bosses at ±X, a tail fin and grip lugs. */
export function createGimbalWhipYokeGeometry() {
  const b = makeBuilder();
  b.band((a, r, w) => [Math.cos(a) * r, Math.sin(a) * r, w], 0.8, 1.0, 0.16, 40);
  // pivot bosses (carry the cradle) on ±X
  b.box(0.86, 0, 0, 0.08, 0.13, 0.15, 0);
  b.box(-0.86, 0, 0, 0.08, 0.13, 0.15, 0);
  b.box(0.79, 0, 0, 0.02, 0.07, 0.07, 1);
  b.box(-0.79, 0, 0, 0.02, 0.07, 0.07, 1);
  // a tail fin on top and grip lugs at the quarters
  b.box(0, 1.1, 0, 0.05, 0.12, 0.2, 0);
  b.box(0, 1.24, -0.06, 0.03, 0.05, 0.16, 2);
  for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    b.box(Math.cos(a) * 1.03, Math.sin(a) * 1.03, 0, 0.05, 0.05, 0.09, 1);
  }
  return finish(b);
}

/** The cradle: inner ring of radius 0.76 in YZ (axis X), bosses on ±Z for the blade. */
export function createGimbalWhipCradleGeometry() {
  const b = makeBuilder();
  b.band((a, r, w) => [w, Math.sin(a) * r, Math.cos(a) * r], 0.62, 0.76, 0.11, 36);
  b.box(0, 0, 0.6, 0.13, 0.12, 0.07, 0);
  b.box(0, 0, -0.6, 0.13, 0.12, 0.07, 0);
  // the trunnions it hangs from on the yoke
  b.box(0.12, 0, 0, 0.06, 0.06, 0.06, 1);
  b.box(-0.12, 0, 0, 0.06, 0.06, 0.06, 1);
  b.box(0.76, 0, 0, 0.04, 0.05, 0.05, 0);
  b.box(-0.76, 0, 0, 0.04, 0.05, 0.05, 0);
  return finish(b);
}

/** The blade: a hex hub and a 14-tooth saw disc of radius 0.66 in XY (axis Z). */
export function createGimbalWhipBladeGeometry() {
  const b = makeBuilder();
  const teeth = 14;
  const r0 = 0.2;
  const r1 = 0.56;
  const hw = 0.025;
  const segs = teeth * 2;
  for (let s = 0; s < segs; s++) {
    const a0 = (s / segs) * Math.PI * 2;
    const a1 = ((s + 1) / segs) * Math.PI * 2;
    const P = (a, r, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
    // the disc web, with a seam ring
    for (const z of [hw, -hw]) {
      const k = z > 0 ? 1 : -1;
      const q = (a, b2, c, d, kk) => (k > 0 ? b.quad(a, b2, c, d, kk) : b.quad(d, c, b2, a, kk));
      q(P(a0, r0, z), P(a1, r0, z), P(a1, r1 * 0.7, z), P(a0, r1 * 0.7, z), 0);
      q(P(a0, r1 * 0.7, z), P(a1, r1 * 0.7, z), P(a1, r1 * 0.76, z), P(a0, r1 * 0.76, z), 1);
      q(P(a0, r1 * 0.76, z), P(a1, r1 * 0.76, z), P(a1, r1, z), P(a0, r1, z), 0);
    }
    b.quad(P(a0, r1, hw), P(a1, r1, hw), P(a1, r1, -hw), P(a0, r1, -hw), 0);
  }
  // raked teeth: a hooked wedge per tooth from r1 out to 0.68
  for (let t = 0; t < teeth; t++) {
    const a0 = (t / teeth) * Math.PI * 2;
    const a1 = a0 + ((Math.PI * 2) / teeth) * 0.8;
    const tip = [Math.cos(a1) * 0.68, Math.sin(a1) * 0.68];
    const back = [Math.cos(a0) * r1, Math.sin(a0) * r1];
    const fore = [Math.cos(a1) * r1, Math.sin(a1) * r1];
    const T = (p, z) => [p[0], p[1], z];
    b.tri(T(back, hw), T(fore, hw), T(tip, hw * 0.4), 2);
    b.tri(T(fore, -hw), T(back, -hw), T(tip, -hw * 0.4), 2);
    b.quad(T(back, hw), T(tip, hw * 0.4), T(tip, -hw * 0.4), T(back, -hw), 2);
    b.quad(T(tip, hw * 0.4), T(fore, hw), T(fore, -hw), T(tip, -hw * 0.4), 2);
  }
  // the hex hub and its bore cap
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI * 2;
    const a1 = ((k + 1) / 6) * Math.PI * 2;
    const H = (a, r, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
    b.quad(H(a0, 0.22, 0.1), H(a1, 0.22, 0.1), H(a1, 0.22, -0.1), H(a0, 0.22, -0.1), 0);
    b.tri(H(a0, 0.22, 0.1), H(a1, 0.22, 0.1), [0, 0, 0.13], k % 2 ? 0 : 1);
    b.tri(H(a1, 0.22, -0.1), H(a0, 0.22, -0.1), [0, 0, -0.13], k % 2 ? 0 : 1);
  }
  // the axle stubs out to the cradle bosses
  b.box(0, 0, 0.36, 0.05, 0.05, 0.22, 0);
  b.box(0, 0, -0.36, 0.05, 0.05, 0.22, 0);
  return finish(b);
}
