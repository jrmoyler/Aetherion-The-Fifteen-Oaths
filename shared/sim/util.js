// Small pure helpers shared by the simulation modules (no Node / DOM APIs).

/** Seeded PRNG (mulberry32). Returns a function producing floats in [0, 1). */
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)); // inclusive
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
export const q2 = (v) => Math.round(v * 100) / 100;
export const wrapAngle = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };

/** Squared distance from point P to segment AB on the XZ plane. */
export function segDist2(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz;
  let t = l2 > 0 ? ((px - ax) * vx + (pz - az) * vz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + vx * t - px, cz = az + vz * t - pz;
  return cx * cx + cz * cz;
}

/** Cryptographically random hex token where available (Node 22, browsers, workers), else Math.random. */
export function randomToken(bytes = 16) {
  const a = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(a);
  else for (let i = 0; i < bytes; i++) a[i] = Math.floor(Math.random() * 256);
  let s = '';
  for (let i = 0; i < bytes; i++) s += a[i].toString(16).padStart(2, '0');
  return s;
}

/**
 * Uniform spatial hash grid on the XZ plane. Each entity stores its cell key and its index in
 * the cell array so insert/move/remove are O(1) with no per-call allocation.
 */
export class Grid {
  constructor(cell = 64) {
    this.cell = cell;
    this.inv = 1 / cell;
    this.cells = new Map();
    this.slot = Symbol('grid'); // per-grid bookkeeping on entities: [key, index]
  }
  key(x, z) { return ((Math.floor(x * this.inv) + 2048) << 12) | (Math.floor(z * this.inv) + 2048); }
  insert(e) {
    const k = this.key(e.x, e.z);
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    e[this.slot] = [k, arr.length];
    arr.push(e);
  }
  remove(e) {
    const s = e[this.slot];
    if (!s) return;
    const arr = this.cells.get(s[0]);
    const last = arr.pop();
    if (last !== e) { arr[s[1]] = last; last[this.slot][1] = s[1]; }
    e[this.slot] = null;
  }
  move(e) {
    const s = e[this.slot];
    if (!s) { this.insert(e); return; }
    if (this.key(e.x, e.z) !== s[0]) { this.remove(e); this.insert(e); }
  }
  /** Calls fn(e) for every entity whose cell intersects the circle (caller does exact test). */
  forEachNear(x, z, r, fn) {
    const inv = this.inv;
    const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
    const z0 = Math.floor((z - r) * inv), z1 = Math.floor((z + r) * inv);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.cells.get(((cx + 2048) << 12) | (cz + 2048));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) fn(arr[i]);
      }
    }
  }
  /** Fills `out` with entities within radius r (exact distance test). Returns out. */
  query(x, z, r, out, filter) {
    out.length = 0;
    const r2 = r * r;
    this.forEachNear(x, z, r, (e) => {
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz <= r2 && (!filter || filter(e))) out.push(e);
    });
    return out;
  }
  /** True when any entity passing `filter` lies within radius r. */
  any(x, z, r, filter) {
    const inv = this.inv, r2 = r * r;
    const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
    const z0 = Math.floor((z - r) * inv), z1 = Math.floor((z + r) * inv);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.cells.get(((cx + 2048) << 12) | (cz + 2048));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const e = arr[i];
          const dx = e.x - x, dz = e.z - z;
          if (dx * dx + dz * dz <= r2 && (!filter || filter(e))) return true;
        }
      }
    }
    return false;
  }
}

/** Streaming percentile tracker over a ring buffer (for tick-time stats). */
export class Ring {
  constructor(n = 600) { this.buf = new Float64Array(n); this.n = 0; this.i = 0; }
  push(v) { this.buf[this.i] = v; this.i = (this.i + 1) % this.buf.length; if (this.n < this.buf.length) this.n++; }
  pct(p) {
    if (!this.n) return 0;
    const a = Array.from(this.buf.subarray(0, this.n)).sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(p * a.length))];
  }
  avg() { let s = 0; for (let i = 0; i < this.n; i++) s += this.buf[i]; return this.n ? s / this.n : 0; }
  max() { let m = 0; for (let i = 0; i < this.n; i++) m = Math.max(m, this.buf[i]); return m; }
}
