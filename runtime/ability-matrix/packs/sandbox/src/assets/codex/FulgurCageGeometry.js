import { BufferAttribute, BufferGeometry, DynamicDrawUsage, LatheGeometry, PlaneGeometry, Vector2, Vector3 } from 'three';

/**
 * Fulgur Cage — procedural geometry.
 *
 *  - **`BoltBatch`** — every lightning bolt the cast draws in one frame, as
 *    camera-facing ribbons in a single dynamic BufferGeometry. Each bolt is a
 *    polyline from `a` to `b` displaced by fractal value noise across two
 *    axes perpendicular to it, pinned at its ends by a `sin(πs)` envelope,
 *    re-rolled whenever its seed ticks (the flicker). The ribbon is turned to
 *    the camera point by point (side = tangent × view), so a bolt reads at
 *    full width from any angle. Per vertex it carries `aCoord` (along 0..1,
 *    across −1..1) and `aBolt` (intensity, seed, width taper) for the shader.
 *    Fixed capacity, written in place: no allocation per frame.
 *  - **the fulgurite** — a lathed, lumpy, hollow-looking glass tube: the
 *    fused sand a lightning strike leaves in the ground. Unit height, unit
 *    radius, root at y = 0.
 *  - **the knot** — a unit quad billboarded in its shader.
 */

const _p = new Vector3();
const _t = new Vector3();
const _v = new Vector3();
const _s = new Vector3();
const _dir = new Vector3();
const _ax = new Vector3();
const _ay = new Vector3();
const _ref = new Vector3();

function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 1D fractal value noise in −1..1. */
function fnoise(x, seed) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    const xx = x * freq + seed * 17.13 + o * 31.7;
    const i = Math.floor(xx);
    const f = xx - i;
    const u = f * f * (3 - 2 * f);
    const a = hash1(i + seed * 3.1);
    const b = hash1(i + 1 + seed * 3.1);
    sum += (a + (b - a) * u) * 2 * amp - amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.3;
  }
  return sum / norm;
}

export class BoltBatch {
  /**
   * @param {number} maxBolts
   * @param {number} segments points per bolt − 1
   */
  constructor(maxBolts, segments) {
    this.maxBolts = maxBolts;
    this.segments = segments;
    const pts = segments + 1;
    this.pointsPerBolt = pts;
    const verts = maxBolts * pts * 2;

    this.positions = new Float32Array(verts * 3);
    this.coords = new Float32Array(verts * 2);
    this.bolts = new Float32Array(verts * 3);
    const index = new Uint32Array(maxBolts * segments * 6);
    let k = 0;
    for (let b = 0; b < maxBolts; b++) {
      const base = b * pts * 2;
      for (let s = 0; s < segments; s++) {
        const i0 = base + s * 2;
        index[k++] = i0;
        index[k++] = i0 + 1;
        index[k++] = i0 + 2;
        index[k++] = i0 + 1;
        index[k++] = i0 + 3;
        index[k++] = i0 + 2;
      }
    }
    this.geometry = new BufferGeometry();
    this.posAttr = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
    this.coordAttr = new BufferAttribute(this.coords, 2).setUsage(DynamicDrawUsage);
    this.boltAttr = new BufferAttribute(this.bolts, 3).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('aCoord', this.coordAttr);
    this.geometry.setAttribute('aBolt', this.boltAttr);
    this.geometry.setIndex(new BufferAttribute(index, 1));
    this.geometry.boundingSphere = null;
    this.count = 0;
    /** The centreline of the last bolt added — for branching off it. */
    this.line = new Float32Array(pts * 3);
  }

  begin() {
    this.count = 0;
  }

  /**
   * Add one bolt.
   * @param {Vector3} a start
   * @param {Vector3} b end
   * @param {Vector3} eye camera position
   * @param {number} amp metres of jag at the middle
   * @param {number} width metres, ribbon half-width
   * @param {number} seed changes the shape (tick it to flicker)
   * @param {number} intensity 0.. brightness
   * @param {number} freq jags along the bolt (cycles over its length)
   * @param {number} [reach] 0..1 how much of the bolt is drawn from `a` (a strike growing)
   * @param {number} [taper] 0..1 how much it thins toward `b`
   * @returns {boolean} false when full
   */
  add(a, b, eye, amp, width, seed, intensity, freq, reach = 1, taper = 0) {
    if (this.count >= this.maxBolts || intensity <= 0.001 || reach <= 0) return false;
    const bi = this.count++;
    const pts = this.pointsPerBolt;
    const segs = this.segments;
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-4) _dir.set(0, 1, 0);
    else _dir.multiplyScalar(1 / len);
    // Two axes across the bolt.
    _ref.set(0, 1, 0);
    if (Math.abs(_dir.y) > 0.9) _ref.set(1, 0, 0);
    _ax.crossVectors(_dir, _ref).normalize();
    _ay.crossVectors(_dir, _ax).normalize();

    const line = this.line;
    const shown = Math.min(1, Math.max(0, reach));
    for (let k = 0; k < pts; k++) {
      const s = (k / segs) * shown;
      // Pinned at both ends of the *full* bolt, so a leader still growing
      // toward `b` has a free, wandering tip.
      const env = Math.pow(Math.sin(Math.PI * s), 0.65);
      const nx = fnoise(s * freq, seed) * amp * env;
      const ny = fnoise(s * freq + 50.0, seed + 0.37) * amp * env;
      _p.copy(a).addScaledVector(_dir, len * s).addScaledVector(_ax, nx).addScaledVector(_ay, ny);
      line[k * 3] = _p.x;
      line[k * 3 + 1] = _p.y;
      line[k * 3 + 2] = _p.z;
    }

    const vBase = bi * pts * 2;
    for (let k = 0; k < pts; k++) {
      const kp = Math.max(0, k - 1);
      const kn = Math.min(pts - 1, k + 1);
      _t.set(line[kn * 3] - line[kp * 3], line[kn * 3 + 1] - line[kp * 3 + 1], line[kn * 3 + 2] - line[kp * 3 + 2]);
      _p.set(line[k * 3], line[k * 3 + 1], line[k * 3 + 2]);
      _v.subVectors(eye, _p);
      _s.crossVectors(_t, _v);
      const sl = _s.length();
      if (sl < 1e-6) _s.copy(_ax);
      else _s.multiplyScalar(1 / sl);
      const s = k / segs;
      const w = width * (1 - taper * s);
      const v0 = vBase + k * 2;
      const v1 = v0 + 1;
      this.positions[v0 * 3] = _p.x - _s.x * w;
      this.positions[v0 * 3 + 1] = _p.y - _s.y * w;
      this.positions[v0 * 3 + 2] = _p.z - _s.z * w;
      this.positions[v1 * 3] = _p.x + _s.x * w;
      this.positions[v1 * 3 + 1] = _p.y + _s.y * w;
      this.positions[v1 * 3 + 2] = _p.z + _s.z * w;
      this.coords[v0 * 2] = s;
      this.coords[v0 * 2 + 1] = -1;
      this.coords[v1 * 2] = s;
      this.coords[v1 * 2 + 1] = 1;
      this.bolts[v0 * 3] = intensity;
      this.bolts[v0 * 3 + 1] = seed;
      this.bolts[v0 * 3 + 2] = taper;
      this.bolts[v1 * 3] = intensity;
      this.bolts[v1 * 3 + 1] = seed;
      this.bolts[v1 * 3 + 2] = taper;
    }
    return true;
  }

  /** A point on the last bolt's centreline, 0..1 along it. */
  pointOnLast(s, out) {
    const segs = this.segments;
    const k = Math.min(segs, Math.max(0, Math.round(s * segs)));
    return out.set(this.line[k * 3], this.line[k * 3 + 1], this.line[k * 3 + 2]);
  }

  end() {
    const n = this.count * this.segments * 6;
    this.geometry.setDrawRange(0, n);
    this.posAttr.needsUpdate = true;
    this.coordAttr.needsUpdate = true;
    this.boltAttr.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
  }
}

/** Fused-sand glass: a lumpy tapering tube, unit height. */
export function createFulguriteGeometry() {
  const pts = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const y = i / n;
    const lump = 0.75 + 0.35 * Math.sin(i * 2.7 + 1.3) * Math.sin(i * 1.3);
    const r = (1 - y * 0.75) * lump;
    pts.push(new Vector2(Math.max(0.02, r), y));
  }
  pts.push(new Vector2(0.0, 1.02));
  const g = new LatheGeometry(pts, 7);
  g.computeVertexNormals();
  return g;
}

export function createKnotGeometry() {
  return new PlaneGeometry(1, 1, 1, 1);
}
