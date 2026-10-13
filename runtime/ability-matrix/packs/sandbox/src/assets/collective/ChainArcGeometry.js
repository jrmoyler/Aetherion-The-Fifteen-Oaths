import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Sphere, Vector3 } from 'three';

/**
 * The shape of one Chain Arc strike, rebuilt in place.
 *
 * Lightning has to be re-rolled many times a second — a bolt that holds still
 * for a whole second reads as a neon tube — so this is not a geometry that is
 * generated once. It is a fixed set of buffers, sized for the largest bolt the
 * editor allows, that `build()` overwrites. Nothing is allocated after the
 * constructor: every scratch array is module-level, and an unused tail of a
 * polyline is collapsed onto its last point with zero brightness, which the
 * fragment stage discards.
 *
 * ## Layout
 *
 * `1 + MAX_FORKS` polylines: the main channel (up to `MAX_MAIN` points) then
 * the forks (up to `MAX_FORK` points each). Every point is written twice — a
 * left and a right vertex, both *on* the channel — and the vertex shader swings
 * them apart across the view direction (see `ChainArcBoltMaterial`). The index
 * buffer is built once for the full capacity.
 *
 * Per vertex:
 *   position   the point on the channel, world space
 *   aTangent   the channel direction there
 *   aCoord     x side (−1/+1) · y distance along the strike (0 at the source,
 *              1 at the target, forks continue from their root) · z width
 *              factor · w brightness (0 = not drawn)
 *
 * ## The shape
 *
 * The main channel is a pair of **Brownian bridges** — a random walk on each of
 * the two axes perpendicular to the strike, with its drift subtracted so both
 * ends land exactly on the source and the target. That is the property that
 * matters: lightning wanders, but it *connects*. A high-frequency kink is laid
 * over it so the silhouette zig-zags at the small scale too, which a walk of
 * thirty steps cannot do on its own.
 *
 * Forks leave the channel at a random point, turned off its tangent by
 * `branchSpread`, sagging slightly toward the floor, wandering harder than the
 * channel and tapering to nothing. When the strike *grounds*, extra forks skate
 * out across the floor from the target point.
 */
export const MAX_MAIN = 40;
export const MAX_FORK = 14;
export const MAX_BRANCHES = 6;
export const MAX_GROUND_FORKS = 4;
const MAX_FORKS = MAX_BRANCHES + MAX_GROUND_FORKS;
const POLYLINES = 1 + MAX_FORKS;
const TOTAL_POINTS = MAX_MAIN + MAX_FORKS * MAX_FORK;
const MAX_ALONG = 1.3;

/* scratch — shared by every ribbon, used synchronously */
const _px = new Float32Array(MAX_MAIN);
const _py = new Float32Array(MAX_MAIN);
const _pz = new Float32Array(MAX_MAIN);
const _along = new Float32Array(MAX_MAIN);
const _width = new Float32Array(MAX_MAIN);
const _bright = new Float32Array(MAX_MAIN);
const _walkA = new Float32Array(MAX_MAIN);
const _walkB = new Float32Array(MAX_MAIN);
const _mx = new Float32Array(MAX_MAIN);
const _my = new Float32Array(MAX_MAIN);
const _mz = new Float32Array(MAX_MAIN);
const _malong = new Float32Array(MAX_MAIN);
const _mwidth = new Float32Array(MAX_MAIN);

const _d = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _t = new Vector3();
const _fd = new Vector3();
const _fa = new Vector3();
const _fb = new Vector3();
const _perp = new Vector3();
const _up = new Vector3(0, 1, 0);

const rnd = () => Math.random() * 2 - 1;

export class ChainBoltRibbon {
  constructor() {
    const vertices = TOTAL_POINTS * 2;
    this.positions = new Float32Array(vertices * 3);
    this.tangents = new Float32Array(vertices * 3);
    this.coords = new Float32Array(vertices * 4);

    const geometry = new BufferGeometry();
    this.positionAttribute = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
    this.tangentAttribute = new BufferAttribute(this.tangents, 3).setUsage(DynamicDrawUsage);
    this.coordAttribute = new BufferAttribute(this.coords, 4).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setAttribute('aTangent', this.tangentAttribute);
    geometry.setAttribute('aCoord', this.coordAttribute);

    /** Where each polyline starts in the point list, and how many it may hold. */
    this.offsets = new Int32Array(POLYLINES);
    this.capacity = new Int32Array(POLYLINES);
    let offset = 0;
    let quads = 0;
    for (let p = 0; p < POLYLINES; p++) {
      this.offsets[p] = offset;
      this.capacity[p] = p === 0 ? MAX_MAIN : MAX_FORK;
      offset += this.capacity[p];
      quads += this.capacity[p] - 1;
    }

    const index = new Uint16Array(quads * 6);
    let k = 0;
    for (let p = 0; p < POLYLINES; p++) {
      for (let i = 0; i < this.capacity[p] - 1; i++) {
        const v = (this.offsets[p] + i) * 2;
        index[k++] = v;
        index[k++] = v + 1;
        index[k++] = v + 2;
        index[k++] = v + 1;
        index[k++] = v + 3;
        index[k++] = v + 2;
      }
    }
    geometry.setIndex(new BufferAttribute(index, 1));
    // Rebuilt every few frames anywhere on the stage — culling would need a
    // fresh bound each time and buys nothing for a mesh this small.
    geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
    this.geometry = geometry;

    this.clear();
  }

  /** Hide every point. */
  clear() {
    this.coords.fill(0);
    this.coordAttribute.needsUpdate = true;
  }

  /**
   * Re-roll the bolt between two points.
   *
   * @param {Vector3} from source, world
   * @param {Vector3} to   target, world
   * @param {object} o shape controls (see `settings.chain`):
   *   segments, jag, jagMax, kink, branches, branchLength, branchSegments,
   *   branchSpread, branchJag, branchWidth, branchBright, groundForks, groundY,
   *   randomness
   */
  build(from, to, o) {
    _d.subVectors(to, from);
    const length = Math.max(0.05, _d.length());
    _d.divideScalar(length);

    // The two axes the channel is allowed to wander on.
    _a.crossVectors(_d, _up);
    if (_a.lengthSq() < 1e-6) _a.set(1, 0, 0);
    _a.normalize();
    _b.crossVectors(_a, _d).normalize();

    /* ---- main channel: two Brownian bridges ---- */
    const n = Math.max(3, Math.min(MAX_MAIN, Math.round(o.segments)));
    _walkA[0] = 0;
    _walkB[0] = 0;
    for (let i = 1; i < n; i++) {
      _walkA[i] = _walkA[i - 1] + rnd();
      _walkB[i] = _walkB[i - 1] + rnd();
    }
    // Subtract the drift so both ends land on their points, and measure the
    // widest excursion so the amplitude is a control rather than a dice roll.
    let peak = 1e-4;
    const endA = _walkA[n - 1];
    const endB = _walkB[n - 1];
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      _walkA[i] -= endA * s;
      _walkB[i] -= endB * s;
      peak = Math.max(peak, Math.abs(_walkA[i]), Math.abs(_walkB[i]));
    }
    const amplitude = Math.min(o.jag * length, o.jagMax) * (0.7 + 0.3 * Math.random()) / peak;
    const kink = (o.kink * length) / (n - 1);

    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      const ends = i === 0 || i === n - 1 ? 0 : 1;
      const ka = rnd() * kink * ends * o.randomness;
      const kb = rnd() * kink * ends * o.randomness;
      const oa = _walkA[i] * amplitude + ka;
      const ob = _walkB[i] * amplitude + kb;
      _mx[i] = from.x + _d.x * length * s + _a.x * oa + _b.x * ob;
      _my[i] = from.y + _d.y * length * s + _a.y * oa + _b.y * ob;
      _mz[i] = from.z + _d.z * length * s + _a.z * oa + _b.z * ob;
      _malong[i] = s;
      // Full in the middle, a touch narrower where it leaves and lands.
      _mwidth[i] = 0.6 + 0.4 * Math.sin(Math.PI * s);
      _px[i] = _mx[i];
      _py[i] = _my[i];
      _pz[i] = _mz[i];
      _along[i] = _malong[i];
      _width[i] = _mwidth[i];
      _bright[i] = 1;
    }
    this._writePolyline(0, n);

    /* ---- forks off the channel ---- */
    const branches = Math.max(0, Math.min(MAX_BRANCHES, Math.round(o.branches)));
    const m = Math.max(3, Math.min(MAX_FORK, Math.round(o.branchSegments)));
    let p = 1;
    for (let f = 0; f < branches; f++, p++) {
      const root = Math.min(n - 2, Math.max(1, Math.floor((0.12 + Math.random() * 0.7) * (n - 1))));
      _t.set(_mx[root + 1] - _mx[root - 1], _my[root + 1] - _my[root - 1], _mz[root + 1] - _mz[root - 1]).normalize();

      // Turn off the tangent toward a random side, and sag a little: forks
      // reach for the ground.
      const phi = Math.random() * Math.PI * 2;
      _perp.copy(_a).multiplyScalar(Math.cos(phi)).addScaledVector(_b, Math.sin(phi));
      const spread = o.branchSpread * (0.6 + 0.6 * Math.random());
      _fd.copy(_t).multiplyScalar(Math.cos(spread)).addScaledVector(_perp, Math.sin(spread));
      _fd.y -= 0.25;
      _fd.normalize();

      const forkLength = o.branchLength * length * (0.45 + 0.55 * Math.random());
      const alongSpan = Math.min(forkLength / length, MAX_ALONG - _malong[root]);
      this._forkWalk(_mx[root], _my[root], _mz[root], forkLength, m, o.branchJag, o.randomness);
      for (let j = 0; j < m; j++) {
        const s = j / (m - 1);
        _along[j] = _malong[root] + s * alongSpan;
        _width[j] = o.branchWidth * _mwidth[root] * Math.pow(1 - s, 0.8);
        _bright[j] = o.branchBright * (1 - s * 0.6);
      }
      this._writePolyline(p, m);
    }

    /* ---- forks skating across the floor where it grounds ---- */
    const ground = Math.max(0, Math.min(MAX_GROUND_FORKS, Math.round(o.groundForks)));
    for (let f = 0; f < ground; f++, p++) {
      const angle = Math.random() * Math.PI * 2;
      _fd.set(Math.cos(angle), 0, Math.sin(angle));
      const forkLength = o.branchLength * length * (0.35 + 0.45 * Math.random());
      this._forkWalk(to.x, o.groundY, to.z, forkLength, m, o.branchJag, o.randomness);
      for (let j = 0; j < m; j++) {
        const s = j / (m - 1);
        _py[j] = o.groundY; // pinned to the floor
        _along[j] = Math.min(MAX_ALONG, 1 + s * 0.3);
        _width[j] = o.branchWidth * 0.8 * Math.pow(1 - s, 0.8);
        _bright[j] = o.branchBright * (1 - s * 0.5);
      }
      this._writePolyline(p, m);
    }

    for (; p < POLYLINES; p++) this._writePolyline(p, 0);

    this.positionAttribute.needsUpdate = true;
    this.tangentAttribute.needsUpdate = true;
    this.coordAttribute.needsUpdate = true;
  }

  /** A fork's walk from a root along `_fd`, into the point scratch. */
  _forkWalk(x, y, z, length, count, jag, randomness) {
    _fa.crossVectors(_fd, _up);
    if (_fa.lengthSq() < 1e-6) _fa.set(1, 0, 0);
    _fa.normalize();
    _fb.crossVectors(_fa, _fd).normalize();

    let wa = 0;
    let wb = 0;
    const step = jag * length / Math.sqrt(count) * randomness;
    for (let j = 0; j < count; j++) {
      const s = j / (count - 1);
      if (j > 0) {
        wa += rnd() * step;
        wb += rnd() * step;
      }
      _px[j] = x + _fd.x * length * s + _fa.x * wa + _fb.x * wb;
      _py[j] = y + _fd.y * length * s + _fa.y * wa + _fb.y * wb;
      _pz[j] = z + _fd.z * length * s + _fa.z * wa + _fb.z * wb;
    }
  }

  /** Copy the point scratch into polyline `p`; the unused tail is hidden. */
  _writePolyline(p, count) {
    const offset = this.offsets[p];
    const capacity = this.capacity[p];
    const pos = this.positions;
    const tan = this.tangents;
    const crd = this.coords;

    for (let i = 0; i < capacity; i++) {
      const live = i < count;
      const k = live ? i : Math.max(0, count - 1);
      const x = count > 0 ? _px[k] : 0;
      const y = count > 0 ? _py[k] : -50;
      const z = count > 0 ? _pz[k] : 0;

      let tx = 0;
      let ty = 1;
      let tz = 0;
      if (count > 1) {
        const i0 = Math.max(0, k - 1);
        const i1 = Math.min(count - 1, k + 1);
        tx = _px[i1] - _px[i0];
        ty = _py[i1] - _py[i0];
        tz = _pz[i1] - _pz[i0];
      }

      for (let side = 0; side < 2; side++) {
        const v = (offset + i) * 2 + side;
        pos[v * 3] = x;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = z;
        tan[v * 3] = tx;
        tan[v * 3 + 1] = ty;
        tan[v * 3 + 2] = tz;
        crd[v * 4] = side === 0 ? -1 : 1;
        crd[v * 4 + 1] = live ? _along[k] : 0;
        crd[v * 4 + 2] = live ? _width[k] : 0;
        crd[v * 4 + 3] = live ? _bright[k] : 0;
      }
    }
  }

  dispose() {
    this.geometry.dispose();
  }
}
