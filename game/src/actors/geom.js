// Procedural skinned-geometry builder for actors.
// Everything is authored in bind space (metres, Y up, facing +Z) and accumulated into
// per-material "channels"; each channel becomes one skinned Mesh (one draw call).
// Primitives: loft (superellipse ring sweeps — torsos, limbs, robes, capes, tubes),
// lathe, superellipsoid (spheres → rounded boxes), bent plates, tubes along paths.
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector.js';

const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

// ---- tiny value noise for weathering (deterministic) ----
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}

export function hex(c) {
  if (Array.isArray(c)) return c;
  const n = parseInt(c.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
// sRGB-ish palette value → linear (vertex colours are multiplied in linear space)
export function lin(c) { const [r, g, b] = hex(c); return [r ** 2.2, g ** 2.2, b ** 2.2]; }
export function mix(a, b, t) { a = hex(a); b = hex(b); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
export function shade(c, k) { c = hex(c); return [c[0] * k, c[1] * k, c[2] * k]; }

/** Matrix helper: T * R(euler yxz) * S */
export function xf(pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  return Matrix.Compose(new Vector3(scl[0], scl[1], scl[2]), Quaternion.FromEulerAngles(rot[0], rot[1], rot[2]), new Vector3(pos[0], pos[1], pos[2]));
}

export class GeoBuilder {
  /** @param detail 1 = full, 0.5 = LOD */
  constructor(detail = 1) { this.detail = detail; this.ch = new Map(); this.grime = 0.07; }

  _chan(name) {
    let c = this.ch.get(name);
    if (!c) { c = { pos: [], nrm: [], uv: [], col: [], mi: [], mw: [], idx: [] }; this.ch.set(name, c); }
    return c;
  }

  seg(n, min = 3) { return Math.max(min, Math.round(n * this.detail)); }

  /**
   * Push a primitive. pos: flat array (bind space, already transformed). idx: local indices.
   * skin: bone index | (x,y,z)=>[[bone,w],...]. color: [r,g,b] (sRGB 0..1) or fn(x,y,z,i)->rgb.
   * opts: {uv, nrm, flipCheck:[cx,cy,cz]|fn, grime, ao:fn(x,y,z)->0..1, glow}
   */
  push(chan, pos, idx, skin, color, opts = {}) {
    const c = this._chan(chan);
    const base = c.pos.length / 3;
    const n = pos.length / 3;
    // normals
    let nrm = opts.nrm;
    if (!nrm) {
      nrm = new Float32Array(pos.length);
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i] * 3, b = idx[i + 1] * 3, d = idx[i + 2] * 3;
        const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
        const e2x = pos[d] - pos[a], e2y = pos[d + 1] - pos[a + 1], e2z = pos[d + 2] - pos[a + 2];
        // Babylon is left-handed with clockwise front faces: n = e2 x e1
        const nx = e2y * e1z - e2z * e1y, ny = e2z * e1x - e2x * e1z, nz = e2x * e1y - e2y * e1x;
        for (const k of [a, b, d]) { nrm[k] += nx; nrm[k + 1] += ny; nrm[k + 2] += nz; }
      }
      for (let i = 0; i < nrm.length; i += 3) {
        const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
        nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
      }
    }
    // winding / outward check: compare averaged normal against (p - centre)
    let flip = false;
    if (opts.flipCheck) {
      let dot = 0;
      const fc = opts.flipCheck;
      for (let i = 0; i < n; i += Math.max(1, (n / 24) | 0)) {
        const cx = typeof fc === 'function' ? fc(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) : fc;
        dot += (pos[i * 3] - cx[0]) * nrm[i * 3] + (pos[i * 3 + 1] - cx[1]) * nrm[i * 3 + 1] + (pos[i * 3 + 2] - cx[2]) * nrm[i * 3 + 2];
      }
      flip = dot < 0;
    }
    const grime = opts.grime ?? this.grime;
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      c.pos.push(x, y, z);
      if (flip) c.nrm.push(-nrm[i * 3], -nrm[i * 3 + 1], -nrm[i * 3 + 2]);
      else c.nrm.push(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
      if (opts.uv) c.uv.push(opts.uv[i * 2], opts.uv[i * 2 + 1]); else c.uv.push(x * 3 + z * 3, y * 3);
      let col = typeof color === 'function' ? color(x, y, z, i) : color;
      col = hex(col);
      let k = 1;
      if (grime > 0) k += grime * (noise3(x * 9, y * 9, z * 9) * 0.6 + noise3(x * 31, y * 31, z * 31) * 0.4);
      if (opts.ao) k *= opts.ao(x, y, z);
      const g = opts.glow ?? 1;
      // stored linear (Babylon vertex colours are not gamma corrected)
      c.col.push((col[0] ** 2.2) * k * g, (col[1] ** 2.2) * k * g, (col[2] ** 2.2) * k * g, 1);
      let w = typeof skin === 'number' ? [[skin, 1]] : skin(x, y, z);
      w = normWeights(w);
      for (let j = 0; j < 4; j++) { c.mi.push(w[j] ? w[j][0] : 0); c.mw.push(w[j] ? w[j][1] : 0); }
    }
    if (flip) for (let i = 0; i < idx.length; i += 3) c.idx.push(base + idx[i], base + idx[i + 2], base + idx[i + 1]);
    else for (let i = 0; i < idx.length; i++) c.idx.push(base + idx[i]);
    return this;
  }

  /**
   * Sweep superellipse rings. rings: [{c:[x,y,z], rx, rz, rzB?, rxR?, n?, tw?}] — rx along the ring's
   * first axis (+X for vertical lofts), rz along the second (+Z front; rzB for the back half, rxR for the +X half).
   * opts: {segs, arc:[a0,a1] (radians, 0 = +X, PI/2 = +Z front), capStart, capEnd, skin, color, chan, m (Matrix), ref}
   */
  loft(chan, rings, skin, color, opts = {}) {
    const segs = this.seg(opts.segs ?? 16, 4);
    const arc = opts.arc;
    const closed = !arc;
    const a0 = arc ? arc[0] : 0, a1 = arc ? arc[1] : TAU;
    const cols = closed ? segs : segs + 1;
    const pos = [], uv = [], idx = [];
    const m = opts.m;
    const tmp = new Vector3();
    let vAcc = 0;
    const centres = [];
    for (let r = 0; r < rings.length; r++) {
      const R = rings[r];
      // frame
      const prev = rings[Math.max(0, r - 1)].c, next = rings[Math.min(rings.length - 1, r + 1)].c;
      let tx = next[0] - prev[0], ty = next[1] - prev[1], tz = next[2] - prev[2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let b1, b2;
      if (opts.vertical !== false && Math.abs(ty) > 0.985) { b1 = [1, 0, 0]; b2 = [0, 0, 1]; }
      else {
        const ref = opts.ref ?? (Math.abs(ty) > 0.9 ? [0, 0, 1] : [0, 1, 0]);
        // b1 = normalize(T x ref) ; b2 = b1 x T
        b1 = [ty * ref[2] - tz * ref[1], tz * ref[0] - tx * ref[2], tx * ref[1] - ty * ref[0]];
        const l1 = Math.hypot(...b1) || 1; b1 = b1.map((v) => v / l1);
        b2 = [b1[1] * tz - b1[2] * ty, b1[2] * tx - b1[0] * tz, b1[0] * ty - b1[1] * tx];
      }
      if (r > 0) vAcc += Math.hypot(R.c[0] - rings[r - 1].c[0], R.c[1] - rings[r - 1].c[1], R.c[2] - rings[r - 1].c[2]);
      const ne = 2 / (R.n ?? 2);
      const tw = R.tw ?? 0;
      let cx = R.c[0], cy = R.c[1], cz = R.c[2];
      if (m) { Vector3.TransformCoordinatesFromFloatsToRef(cx, cy, cz, m, tmp); centres.push([tmp.x, tmp.y, tmp.z]); } else centres.push([cx, cy, cz]);
      for (let s = 0; s < cols; s++) {
        const a = a0 + (a1 - a0) * (s / segs) + tw;
        const ca = Math.cos(a), sa = Math.sin(a);
        const rx = ca >= 0 ? (R.rxR ?? R.rx) : R.rx;
        const rz = sa >= 0 ? R.rz : (R.rzB ?? R.rz);
        const u = spow(ca, ne) * rx, w = spow(sa, ne) * rz;
        let x = cx + b1[0] * u + b2[0] * w, y = cy + b1[1] * u + b2[1] * w, z = cz + b1[2] * u + b2[2] * w;
        if (R.dy) y += R.dy(a);
        if (m) { Vector3.TransformCoordinatesFromFloatsToRef(x, y, z, m, tmp); x = tmp.x; y = tmp.y; z = tmp.z; }
        pos.push(x, y, z);
        uv.push((s / segs) * (opts.uScale ?? 2), vAcc * 3);
      }
    }
    for (let r = 0; r < rings.length - 1; r++) {
      for (let s = 0; s < segs; s++) {
        const s1 = closed ? (s + 1) % segs : s + 1;
        const a = r * cols + s, b = r * cols + s1, c = (r + 1) * cols + s, d = (r + 1) * cols + s1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const capAt = (r, rev) => {
      const ci = pos.length / 3; const cc = centres[r];
      pos.push(cc[0], cc[1], cc[2]); uv.push(0.5, 0.5);
      for (let s = 0; s < segs; s++) {
        const s1 = closed ? (s + 1) % segs : s + 1; if (!closed && s1 >= cols) break;
        if (rev) idx.push(ci, r * cols + s1, r * cols + s); else idx.push(ci, r * cols + s, r * cols + s1);
      }
    };
    if (opts.capStart) capAt(0, true);
    if (opts.capEnd) capAt(rings.length - 1, false);
    // outward check uses the nearest ring centre (works for bent sweeps)
    const flipCheck = (x, y, z) => {
      let best = centres[0], bd = Infinity;
      for (const c of centres) { const d = (c[0] - x) ** 2 + (c[1] - y) ** 2 + (c[2] - z) ** 2; if (d < bd) { bd = d; best = c; } }
      return best;
    };
    return this.push(chan, pos, idx, skin, color, { uv, flipCheck: opts.inward ? null : flipCheck, grime: opts.grime, ao: opts.ao, glow: opts.glow, ...(opts.inward ? {} : {}) });
  }

  /** Lathe a profile [[r,y],...] around local Y, placed by matrix m. */
  lathe(chan, profile, m, skin, color, opts = {}) {
    const rings = profile.map(([r, y, rz]) => ({ c: [0, y, 0], rx: r, rz: rz ?? r, n: opts.n }));
    return this.loft(chan, rings, skin, color, { ...opts, m, vertical: true });
  }

  /** Superellipsoid: radii [rx,ry,rz], e (vertical exponent, 1 = round, 0.2 = boxy), n (horizontal superellipse exponent, 2 = round, 8 = boxy). */
  blob(chan, radii, m, skin, color, opts = {}) {
    const st = this.seg(opts.stacks ?? 8, 3);
    const e = opts.e ?? 1, n = opts.n ?? 2;
    const rings = [];
    for (let i = 0; i <= st; i++) {
      const phi = -Math.PI / 2 + Math.PI * (i / st);
      const sy = spow(Math.sin(phi), e), sr = Math.max(1e-4, Math.pow(Math.abs(Math.cos(phi)), e));
      const bendZ = opts.bend ? 0 : 0;
      rings.push({ c: [0, sy * radii[1], bendZ], rx: radii[0] * sr, rz: radii[2] * sr, rzB: (opts.rzB ?? radii[2]) * sr, n });
    }
    return this.loft(chan, rings, skin, color, { segs: opts.segs ?? 14, m, vertical: true, grime: opts.grime, ao: opts.ao, glow: opts.glow });
  }

  /** Rounded box (superellipsoid with flat faces). size = full extents. bend: curvature radius around Y (plates). */
  box(chan, size, m, skin, color, opts = {}) {
    const st = this.seg(opts.stacks ?? 6, 3);
    const segs = this.seg(opts.segs ?? 16, 8);
    const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
    const e = opts.round ?? 0.18;
    const pos = [], idx = [];
    const tmp = new Vector3();
    const cols = segs;
    for (let i = 0; i <= st; i++) {
      const phi = -Math.PI / 2 + Math.PI * (i / st);
      const sy = spow(Math.sin(phi), e), sr = Math.pow(Math.max(1e-4, Math.abs(Math.cos(phi))), e);
      for (let s = 0; s < cols; s++) {
        const a = TAU * (s / segs) + Math.PI / segs;
        let x = spow(Math.cos(a), e) * hx * sr, z = spow(Math.sin(a), e) * hz * sr, y = sy * hy;
        if (opts.taper) { const t = (y / hy + 1) / 2; const k = lerp(1, opts.taper, t); x *= k; z *= lerp(1, opts.taperZ ?? 1, t); }
        if (opts.bend) z -= (x * x) / (2 * opts.bend);
        if (opts.bendY) z -= (y * y) / (2 * opts.bendY);
        if (m) { Vector3.TransformCoordinatesFromFloatsToRef(x, y, z, m, tmp); x = tmp.x; y = tmp.y; z = tmp.z; }
        pos.push(x, y, z);
      }
    }
    for (let i = 0; i < st; i++) for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      const a = i * cols + s, b = i * cols + s1, c = (i + 1) * cols + s, d = (i + 1) * cols + s1;
      idx.push(a, c, b, b, c, d);
    }
    let centre = [0, 0, opts.bend ? -hx * hx / (4 * opts.bend) : 0];
    if (m) { Vector3.TransformCoordinatesFromFloatsToRef(centre[0], centre[1], centre[2], m, tmp); centre = [tmp.x, tmp.y, tmp.z]; }
    return this.push(chan, pos, idx, skin, color, { flipCheck: centre, grime: opts.grime, ao: opts.ao, glow: opts.glow });
  }

  /** Tube along a path of points (bind space, before m). radius: number | fn(t). */
  tube(chan, pts, radius, skin, color, opts = {}) {
    const rings = pts.map((p, i) => {
      const t = i / (pts.length - 1);
      const r = typeof radius === 'function' ? radius(t) : radius;
      return { c: p, rx: r, rz: opts.flat ? r * opts.flat : r, n: opts.n };
    });
    return this.loft(chan, rings, skin, color, { segs: opts.segs ?? 8, m: opts.m, vertical: false, capStart: opts.caps, capEnd: opts.caps, ref: opts.ref, grime: opts.grime, glow: opts.glow });
  }

  /** Build skinned meshes (one per channel). materials: {chan: Material}. */
  build(scene, name, materials, skinned = true) {
    const out = [];
    for (const [chan, c] of this.ch) {
      if (!c.idx.length) continue;
      const mesh = new Mesh(`${name}:${chan}`, scene);
      const vd = new VertexData();
      vd.positions = new Float32Array(c.pos);
      vd.normals = new Float32Array(c.nrm);
      vd.uvs = new Float32Array(c.uv);
      vd.colors = new Float32Array(c.col);
      vd.indices = c.pos.length / 3 > 65535 ? new Uint32Array(c.idx) : new Uint16Array(c.idx);
      if (skinned) { vd.matricesIndices = new Float32Array(c.mi); vd.matricesWeights = new Float32Array(c.mw); }
      vd.applyToMesh(mesh, false);
      if (skinned) mesh.numBoneInfluencers = 4;
      mesh.material = materials?.[chan] ?? materials?.cloth ?? null;
      mesh.metadata = { chan };
      out.push(mesh);
    }
    return out;
  }

  vertexCount() { let n = 0; for (const c of this.ch.values()) n += c.pos.length / 3; return n; }
}

function normWeights(w) {
  if (w.length > 4) { w = w.slice().sort((a, b) => b[1] - a[1]).slice(0, 4); }
  let s = 0; for (const p of w) s += p[1];
  if (s <= 0) return [[w[0]?.[0] ?? 0, 1]];
  return w.map((p) => [p[0], p[1] / s]);
}

/**
 * Smooth-skin weights along a 1D coordinate. bones: [b0, b1, ... bn], joints: [j1..jn] ascending
 * (joint i separates bones[i-1] and bones[i]); width = half blend zone around each joint.
 */
export function jointWeights(v, bones, joints, width = 0.04) {
  for (let i = 0; i < joints.length; i++) {
    const j = joints[i];
    if (v < j + width) {
      if (v <= j - width) return [[bones[i], 1]];
      const k = smooth(j - width, j + width, v);
      return [[bones[i], 1 - k], [bones[i + 1], k]];
    }
  }
  return [[bones[bones.length - 1], 1]];
}
