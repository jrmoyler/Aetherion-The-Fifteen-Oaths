// Effect core: phase scheduler, camera-facing strip geometry, pooled point lights, maths helpers.
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { Light } from '@babylonjs/core/Lights/light.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeIn = (t) => Math.pow(clamp01(t), 2.2);
export const easeOutBack = (t, s = 1.7) => { t = clamp01(t) - 1; return t * t * ((s + 1) * t + s) + 1; };
/** 0→1 over [a,b], hold, 1→0 over [c,d] */
export const env = (t, a, b, c, d) => (t < a ? 0 : t < b ? (t - a) / Math.max(1e-4, b - a) : t < c ? 1 : t < d ? 1 - (t - c) / Math.max(1e-4, d - c) : 0);
export const hex = (h) => Color3.FromHexString(h.length === 7 ? h : '#ffffff');

export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const f = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  f.range = (a, b) => a + (b - a) * f();
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
}

// ------------------------------------------------------------------------------------------------
/** Camera-facing ribbon mesh made of one or more centre polylines. Width/brightness per vertex. */
export class StripMesh {
  constructor(scene, maxPts, name = 'fx.strip') {
    this.max = maxPts;
    this.mesh = new Mesh(name, scene);
    this.pos = new Float32Array(maxPts * 2 * 3); this.tan = new Float32Array(maxPts * 2 * 3); this.co = new Float32Array(maxPts * 2 * 4);
    this.mesh.setVerticesData('position', this.pos, true, 3);
    this.mesh.setVerticesData('tang', this.tan, true, 3);
    this.mesh.setVerticesData('coord', this.co, true, 4);
    this.idx = new Uint32Array((maxPts - 1) * 6);
    this.mesh.setIndices(this.idx, maxPts * 2, true);
    this.mesh.alwaysSelectAsActiveMesh = true; this.mesh.isPickable = false; this.mesh.doNotSyncBoundingInfo = true;
  }
  /** lines: [{pts:[Vector3], w:(i,n)=>factor | number, b:(i,n)=>bright | number, a0, a1 (along range)}] */
  set(lines) {
    let v = 0; let ii = 0; const P = this.pos; const T = this.tan; const C = this.co; const I = this.idx;
    for (const L of lines) {
      const pts = L.pts; const n = Math.min(pts.length, this.max - v); if (n < 2) continue;
      const a0 = L.a0 ?? 0; const a1 = L.a1 ?? 1;
      for (let i = 0; i < n; i++) {
        const p = pts[i]; const pa = pts[Math.max(0, i - 1)]; const pb = pts[Math.min(n - 1, i + 1)];
        let tx = pb.x - pa.x; let ty = pb.y - pa.y; let tz = pb.z - pa.z; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        const w = typeof L.w === 'function' ? L.w(i, n) : (L.w ?? 1); const b = typeof L.b === 'function' ? L.b(i, n) : (L.b ?? 1);
        const al = a0 + (a1 - a0) * (i / (n - 1));
        for (let s = 0; s < 2; s++) {
          const o = (v + i) * 2 + s;
          P[o * 3] = p.x; P[o * 3 + 1] = p.y; P[o * 3 + 2] = p.z;
          T[o * 3] = tx; T[o * 3 + 1] = ty; T[o * 3 + 2] = tz;
          C[o * 4] = s ? 1 : -1; C[o * 4 + 1] = al; C[o * 4 + 2] = w; C[o * 4 + 3] = b;
        }
        if (i < n - 1) { const a = (v + i) * 2; I[ii++] = a; I[ii++] = a + 1; I[ii++] = a + 2; I[ii++] = a + 1; I[ii++] = a + 3; I[ii++] = a + 2; }
      }
      v += n;
    }
    for (let k = ii; k < I.length; k++) I[k] = 0;
    // collapse unused vertices
    for (let o = v * 2; o < this.max * 2; o++) C[o * 4 + 3] = 0;
    this.mesh.updateVerticesData('position', P); this.mesh.updateVerticesData('tang', T); this.mesh.updateVerticesData('coord', C);
    this.mesh.updateIndices(I);
  }
  dispose() { this.mesh.dispose(false, false); }
}

// ------------------------------------------------------------------------------------------------
/** Fixed pool of point lights created once (shader light counts stay constant -> no recompiles). */
export class LightPool {
  constructor(scene, count) {
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new PointLight(`fx.light${i}`, new Vector3(0, -1000, 0), scene);
      l.intensity = 0; l.range = 12; l.falloffType = Light.FALLOFF_STANDARD; l.diffuse = new Color3(1, 1, 1); l.specular = new Color3(0.3, 0.3, 0.3);
      l._fxOwner = null; l._fxPri = 0;
      this.lights.push(l);
    }
  }
  /** Claim a light for `owner` with priority; steals the lowest-priority one if all busy. */
  claim(owner, pri = 1) {
    if (!this.lights.length) return null;
    let best = null;
    for (const l of this.lights) { if (!l._fxOwner) { best = l; break; } if (!best || l._fxPri < best._fxPri) best = l; }
    if (best._fxOwner && best._fxPri > pri) return null;
    best._fxOwner = owner; best._fxPri = pri;
    return best;
  }
  release(owner) { for (const l of this.lights) if (l._fxOwner === owner) { l._fxOwner = null; l.intensity = 0; l.position.set(0, -1000, 0); } }
}

// ------------------------------------------------------------------------------------------------
/** One playing effect: a set of timed primitives and one-shot events on a local clock. */
export class Effect {
  constructor(sys, o) {
    this.sys = sys; this.opts = o; this.t = 0; this.items = []; this.events = []; this.end = 0.1; this.done = false; this.id = o.id;
    this.prio = o.local ? 2 : 1;
  }
  /** Schedule prim over [t0, t0+dur]. prim: {start?(fx), update(lt, u, dt), stop?(), dispose?()} */
  at(t0, dur, prim) {
    if (!prim) return prim;
    prim.t0 = t0; prim.t1 = t0 + Math.max(0.01, dur); prim._s = 0;
    this.items.push(prim); this.end = Math.max(this.end, prim.t1 + (prim.tail ?? 0));
    return prim;
  }
  call(t, fn) { this.events.push({ t, fn }); this.end = Math.max(this.end, t + 0.05); }
  update(dt) {
    if (this.done) return;
    this.t += dt; const t = this.t;
    for (const e of this.events) if (!e.done && t >= e.t) { e.done = true; try { e.fn(this); } catch (err) { console.warn('[vfx] event', err); } }
    for (const p of this.items) {
      if (p._s === 0 && t >= p.t0) { p._s = 1; try { p.start?.(this); } catch (err) { console.warn('[vfx] start', err); p._s = 2; try { p.stop?.(); } catch {} } }
      if (p._s === 1) {
        const lt = t - p.t0; const u = clamp01(lt / (p.t1 - p.t0));
        try { p.update?.(lt, u, dt); } catch (err) { console.warn('[vfx] update', err); p._s = 2; try { p.stop?.(); } catch {} }
        if (p._s === 1 && t >= p.t1) { p._s = 2; try { p.stop?.(); } catch { /* ignore */ } }
      }
      if (p._s === 2 && !p._d && t >= p.t1 + (p.tail ?? 0)) { p._d = true; try { p.dispose?.(); } catch { /* ignore */ } }
    }
    if (t >= this.end) this.dispose();
  }
  dispose() {
    if (this.done) return; this.done = true;
    for (const p of this.items) {
      if (p._s === 1) { try { p.stop?.(); } catch { /* ignore */ } }
      if (!p._d) { p._d = true; try { p.dispose?.(); } catch { /* ignore */ } }
    }
    this.sys.lightPool?.release(this);
  }
}

export function discMesh(scene, name = 'fx.disc') {
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5];
  vd.uvs = [0, 0, 1, 0, 1, 1, 0, 1]; vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  vd.indices = [0, 2, 1, 0, 3, 2];
  vd.applyToMesh(m);
  m.isPickable = false;
  return m;
}
