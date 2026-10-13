import { BufferAttribute, BufferGeometry, CylinderGeometry, DynamicDrawUsage, Sphere, Vector3 } from 'three';

/**
 * Procedural geometry for the Ion Storm Pillar.
 *
 *   - `createPillarGeometry` — an open cylinder, unit radius, `y` 0..1. The
 *     pillar material turns it into metres (and slams, writhes and implodes it)
 *     in its vertex stage, so it is built once.
 *   - `IonBoltRibbons` — every bolt the pillar can have alive at once, in one
 *     pre-allocated buffer: a fixed number of slots, each a main channel and a
 *     couple of forks. Vertices sit on the channel's centre line and carry its
 *     tangent and a side of −1/+1; the bolt material swings the pair apart
 *     across the view direction, so a ribbon is always seen face-on.
 *
 * A slot's *envelope* (level, growth, break-up) lives in a uniform array the
 * material indexes by `aBolt`, so the ability only rewrites a slot's vertices
 * when its shape is re-rolled — the per-frame cost of a hanging bolt is four
 * floats.
 */

export function createPillarGeometry(radialSegments = 48, heightSegments = 40) {
  const geometry = new CylinderGeometry(1, 1, 1, radialSegments, heightSegments, true);
  geometry.translate(0, 0.5, 0);
  // Shaped in the vertex stage — the bound is not where it draws.
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** Bolt slots. Must match the material's uniform array. */
export const ION_MAX_BOLTS = 14;
/** Points on a main channel. */
export const ION_MAIN_POINTS = 26;
/** Forks per bolt and points on each. */
export const ION_FORKS = 2;
export const ION_FORK_POINTS = 9;

const LINES_PER_BOLT = 1 + ION_FORKS;
const POINTS_PER_BOLT = ION_MAIN_POINTS + ION_FORKS * ION_FORK_POINTS;

/* scratch — shared, used synchronously */
const _mx = new Float32Array(ION_MAIN_POINTS);
const _my = new Float32Array(ION_MAIN_POINTS);
const _mz = new Float32Array(ION_MAIN_POINTS);
const _ma = new Float32Array(ION_MAIN_POINTS);
const _mw = new Float32Array(ION_MAIN_POINTS);
const _wa = new Float32Array(ION_MAIN_POINTS);
const _wb = new Float32Array(ION_MAIN_POINTS);
const _fx = new Float32Array(ION_FORK_POINTS);
const _fy = new Float32Array(ION_FORK_POINTS);
const _fz = new Float32Array(ION_FORK_POINTS);
const _fa = new Float32Array(ION_FORK_POINTS);
const _fw = new Float32Array(ION_FORK_POINTS);
const _d = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _t = new Vector3();
const _p = new Vector3();
const _up = new Vector3(0, 1, 0);

const rnd = () => Math.random() * 2 - 1;

export class IonBoltRibbons {
  constructor() {
    const points = ION_MAX_BOLTS * POINTS_PER_BOLT;
    const vertices = points * 2;
    this.positions = new Float32Array(vertices * 3);
    this.tangents = new Float32Array(vertices * 3);
    this.coords = new Float32Array(vertices * 4); // side, along, width, brightness
    this.boltIds = new Float32Array(vertices);

    const geometry = new BufferGeometry();
    this.positionAttribute = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
    this.tangentAttribute = new BufferAttribute(this.tangents, 3).setUsage(DynamicDrawUsage);
    this.coordAttribute = new BufferAttribute(this.coords, 4).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setAttribute('aTangent', this.tangentAttribute);
    geometry.setAttribute('aCoord', this.coordAttribute);
    geometry.setAttribute('aBolt', new BufferAttribute(this.boltIds, 1));

    // Index: a quad strip per polyline, built once.
    let quads = 0;
    for (let s = 0; s < ION_MAX_BOLTS; s++) quads += ION_MAIN_POINTS - 1 + ION_FORKS * (ION_FORK_POINTS - 1);
    const index = new Uint16Array(quads * 6);
    let k = 0;
    for (let s = 0; s < ION_MAX_BOLTS; s++) {
      for (let line = 0; line < LINES_PER_BOLT; line++) {
        const start = this._offset(s, line);
        const count = line === 0 ? ION_MAIN_POINTS : ION_FORK_POINTS;
        for (let i = 0; i < count - 1; i++) {
          const v = (start + i) * 2;
          index[k++] = v;
          index[k++] = v + 1;
          index[k++] = v + 2;
          index[k++] = v + 1;
          index[k++] = v + 3;
          index[k++] = v + 2;
        }
      }
      for (let i = 0; i < POINTS_PER_BOLT * 2; i++) this.boltIds[s * POINTS_PER_BOLT * 2 + i] = s;
    }
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
    this.geometry = geometry;
    this.coords.fill(0);
  }

  /** First point of polyline `line` of slot `slot`. */
  _offset(slot, line) {
    return slot * POINTS_PER_BOLT + (line === 0 ? 0 : ION_MAIN_POINTS + (line - 1) * ION_FORK_POINTS);
  }

  /** Zero a slot's brightness so it draws nothing. */
  clear(slot) {
    const from = slot * POINTS_PER_BOLT * 2 * 4;
    this.coords.fill(0, from, from + POINTS_PER_BOLT * 2 * 4);
    this.coordAttribute.needsUpdate = true;
  }

  /**
   * Roll a new jagged channel into slot `slot`, from `from` to `to`.
   *
   * The main channel is two Brownian bridges on the axes across it, drift
   * removed so both ends land exactly, scaled so `jag` is the widest excursion
   * as a fraction of the length. `bulge` (a vector, may be zero) bows the whole
   * channel outward along a sine — an orbit arc arching off the pillar's skin.
   *
   * @param {object} o { segments, jag, jagMax, kink, forks, forkLength,
   *   forkSpread, forkWidth, forkBright, bulge: Vector3 }
   */
  build(slot, from, to, o) {
    _d.subVectors(to, from);
    const length = Math.max(0.05, _d.length());
    _d.divideScalar(length);
    _a.crossVectors(_d, _up);
    if (_a.lengthSq() < 1e-6) _a.set(1, 0, 0);
    _a.normalize();
    _b.crossVectors(_a, _d).normalize();

    const n = Math.max(3, Math.min(ION_MAIN_POINTS, Math.round(o.segments)));
    _wa[0] = 0;
    _wb[0] = 0;
    for (let i = 1; i < n; i++) {
      _wa[i] = _wa[i - 1] + rnd();
      _wb[i] = _wb[i - 1] + rnd();
    }
    let peak = 1e-4;
    const endA = _wa[n - 1];
    const endB = _wb[n - 1];
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      _wa[i] -= endA * s;
      _wb[i] -= endB * s;
      peak = Math.max(peak, Math.abs(_wa[i]), Math.abs(_wb[i]));
    }
    const amplitude = (Math.min(o.jag * length, o.jagMax) * (0.7 + 0.3 * Math.random())) / peak;
    const kink = (o.kink * length) / (n - 1);

    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      const ends = i === 0 || i === n - 1 ? 0 : 1;
      const oa = _wa[i] * amplitude + rnd() * kink * ends;
      const ob = _wb[i] * amplitude + rnd() * kink * ends;
      const bow = Math.sin(Math.PI * s);
      _mx[i] = from.x + _d.x * length * s + _a.x * oa + _b.x * ob + o.bulge.x * bow;
      _my[i] = from.y + _d.y * length * s + _a.y * oa + _b.y * ob + o.bulge.y * bow;
      _mz[i] = from.z + _d.z * length * s + _a.z * oa + _b.z * ob + o.bulge.z * bow;
      _ma[i] = s;
      _mw[i] = 0.55 + 0.45 * Math.sin(Math.PI * s);
    }
    this._write(slot, 0, n, ION_MAIN_POINTS, _mx, _my, _mz, _ma, _mw, 1);

    /* ---- forks: off the channel, sagging toward the floor ---- */
    const forks = Math.max(0, Math.min(ION_FORKS, Math.round(o.forks)));
    const m = ION_FORK_POINTS;
    for (let f = 0; f < ION_FORKS; f++) {
      if (f >= forks) {
        this._write(slot, 1 + f, 0, m, _fx, _fy, _fz, _fa, _fw, 0);
        continue;
      }
      const root = Math.min(n - 2, Math.max(1, Math.floor((0.2 + Math.random() * 0.6) * (n - 1))));
      _t.set(_mx[root + 1] - _mx[root - 1], _my[root + 1] - _my[root - 1], _mz[root + 1] - _mz[root - 1]).normalize();
      const phi = Math.random() * Math.PI * 2;
      _p.copy(_a).multiplyScalar(Math.cos(phi)).addScaledVector(_b, Math.sin(phi));
      const spread = o.forkSpread * (0.6 + 0.6 * Math.random());
      _t.multiplyScalar(Math.cos(spread)).addScaledVector(_p, Math.sin(spread));
      _t.y -= 0.3;
      _t.normalize();
      const forkLength = o.forkLength * length * (0.4 + 0.6 * Math.random());
      const step = forkLength / (m - 1);
      let x = _mx[root];
      let y = _my[root];
      let z = _mz[root];
      for (let j = 0; j < m; j++) {
        const s = j / (m - 1);
        _fx[j] = x;
        _fy[j] = Math.max(0.02, y);
        _fz[j] = z;
        _fa[j] = _ma[root] + s * (forkLength / length);
        _fw[j] = o.forkWidth * _mw[root] * Math.pow(1 - s, 0.8);
        x += _t.x * step + rnd() * step * 0.6;
        y += _t.y * step + rnd() * step * 0.6;
        z += _t.z * step + rnd() * step * 0.6;
      }
      this._write(slot, 1 + f, m, m, _fx, _fy, _fz, _fa, _fw, o.forkBright);
    }

    this.positionAttribute.needsUpdate = true;
    this.tangentAttribute.needsUpdate = true;
    this.coordAttribute.needsUpdate = true;
  }

  /** Write `count` points of polyline `line` (capacity `cap`); unused tail is dark. */
  _write(slot, line, count, cap, xs, ys, zs, along, width, bright) {
    const start = this._offset(slot, line);
    for (let i = 0; i < cap; i++) {
      const v = (start + i) * 2;
      const live = i < count;
      const j = live ? i : Math.max(0, count - 1);
      const x = count > 0 ? xs[j] : 0;
      const y = count > 0 ? ys[j] : 0;
      const z = count > 0 ? zs[j] : 0;
      let tx = 0;
      let ty = 1;
      let tz = 0;
      if (count > 1) {
        const a = Math.max(0, j - 1);
        const b = Math.min(count - 1, j + 1);
        tx = xs[b] - xs[a];
        ty = ys[b] - ys[a];
        tz = zs[b] - zs[a];
      }
      for (let side = 0; side < 2; side++) {
        const q = v + side;
        this.positions[q * 3] = x;
        this.positions[q * 3 + 1] = y;
        this.positions[q * 3 + 2] = z;
        this.tangents[q * 3] = tx;
        this.tangents[q * 3 + 1] = ty;
        this.tangents[q * 3 + 2] = tz;
        this.coords[q * 4] = side === 0 ? -1 : 1;
        this.coords[q * 4 + 1] = live ? along[j] : 0;
        this.coords[q * 4 + 2] = live ? width[j] : 0;
        this.coords[q * 4 + 3] = live ? bright : 0;
      }
    }
  }

  dispose() {
    this.geometry.dispose();
  }
}
