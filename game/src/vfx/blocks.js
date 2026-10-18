// Effect building blocks. Every block schedules itself on an Effect (`fx.at`) and returns its prim.
// Recipes (recipes/*.js) compose these per ability. Positions are world-space Vector3s.
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { Vector3, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { acquireMat, releaseMat } from './shaders.js';
import { getTexture } from './textures.js';
import { StripMesh, discMesh, clamp01, lerp, smooth, easeOut, easeOutBack, env, rng } from './core.js';

const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const UP = Vector3.Up();
const tmpM = new Matrix(); const tmpQ = new Quaternion(); const tmpS = new Vector3(); const tmpT = new Vector3();

/** Resolve "value or function of (lt,u)". */
const val = (x, lt, u) => (typeof x === 'function' ? x(lt, u) : x);
/** Resolve a position-ish option (Vector3 | ()=>Vector3). */
const posOf = (p) => (typeof p === 'function' ? p() : p);

function matFor(fx, type, kind, o) {
  const P = fx.pal;
  return acquireMat(fx.sys.scene, type, kind, {
    c0: o.c0 ?? P.core, c1: o.c1 ?? P.glow, c2: o.c2 ?? P.edge, c3: o.c3 ?? P.deep,
    opacity: 0, grow: o.growStart ?? 1.01, tail: -0.01, seed: o.seed ?? fx.rnd() * 10, scroll: o.scroll, p: o.p, width: o.width,
    tex: o.tex, glyph: o.glyph, blend: o.blend,
  });
}

/** Wrap a mesh+material prim with the standard opacity envelope. */
function meshPrim(fx, mesh, mat, o, anim) {
  const fi = o.fadeIn ?? 0.12; const fo = o.fadeOut ?? 0.35; const op = o.opacity ?? 1;
  mesh.material = mat; mesh.isPickable = false; mesh.setEnabled(false);
  mesh.renderingGroupId = 0; mesh.alwaysSelectAsActiveMesh = true;
  return {
    mesh, mat,
    start() { mesh.setEnabled(true); },
    update(lt, u, dt) {
      const d = this.t1 - this.t0;
      mat.u.opacity = val(op, lt, u) * Math.min(fi > 0 ? lt / fi : 1, fo > 0 ? (d - lt) / fo : 1, 1);
      anim?.(lt, u, dt, mesh, mat);
    },
    dispose() { mesh.dispose(false, false); releaseMat(fx.sys.scene, mat); },
  };
}

// ======================================================================================== decals
/** Ground decal. kind: telegraph|frost|lava|glyph|scorch|wash|clock|hex|cracks|pool|spiral */
export function decal(fx, o) {
  const pos = posOf(o.pos); const r = o.r ?? fx.R;
  const m = discMesh(fx.sys.scene);
  m.position.set(pos.x, fx.gy(pos) + 0.04 + (o.lift ?? 0), pos.z);
  m.scaling.set(r * 2, 1, r * 2); m.rotation.y = o.rot ?? fx.rnd() * 6.28;
  if (o.vertical) { m.rotation.x = -Math.PI / 2; m.rotation.y = o.yaw ?? 0; m.position.y = pos.y; }
  const tex = o.tex ?? getTexture(fx.sys.scene, 'rune', 256);
  const mat = matFor(fx, 'decal', o.kind ?? 'telegraph', { ...o, tex, glyph: o.glyph ?? fx.glyph ?? tex });
  const grow = o.grow ?? [0, 1, 0.3];
  const prim = meshPrim(fx, m, mat, o, (lt, u, dt) => {
    mat.u.grow = lerp(grow[0], grow[1], easeOut(lt / Math.max(0.01, grow[2])));
    if (o.spin) m.rotation.y += o.spin * dt;
    if (o.anim) o.anim(lt, u, m, mat);
  });
  return fx.at(o.t0 ?? 0, o.dur ?? 1, prim);
}

/** Zone footprint that fills during anticipation and snaps off at impact. */
export function telegraph(fx, o = {}) {
  const dur = o.dur ?? Math.max(0.25, fx.T.hit);
  return decal(fx, { kind: 'telegraph', pos: o.pos ?? fx.tgt, r: o.r ?? fx.R, t0: o.t0 ?? 0, dur: dur + 0.15, grow: [0.05, 1, dur], fadeIn: 0.08, fadeOut: 0.2, opacity: o.opacity ?? 0.75, c1: o.c1 ?? fx.pal.glow, c0: fx.pal.core, ...o });
}

// ======================================================================================== strips
/** Generic camera-facing ribbon. o.lines(lt,u) -> [{pts,w,b}] or static o.lines. */
export function strip(fx, o) {
  const sm = new StripMesh(fx.sys.scene, o.maxPts ?? 64);
  const mat = matFor(fx, 'strip', o.kind ?? 'energy', o);
  let acc = 1e9;
  const prim = meshPrim(fx, sm.mesh, mat, o, (lt, u, dt) => {
    acc += dt;
    if (typeof o.lines === 'function') { if (acc >= (o.regen ?? 0)) { acc = 0; sm.set(o.lines(lt, u)); } } else if (!prim._set) { prim._set = 1; sm.set(o.lines); }
    if (o.grow) mat.u.grow = val(o.grow, lt, u);
    if (o.tail) mat.u.tail = val(o.tail, lt, u);
    if (o.w) mat.u.width = val(o.w, lt, u);
  });
  prim.dispose = () => { sm.dispose(); releaseMat(fx.sys.scene, mat); };
  return fx.at(o.t0 ?? 0, o.dur ?? 1, prim);
}

/** Jagged polyline between a and b (midpoint displacement), optionally with forks. */
export function boltPath(R, a, b, jag = 0.25, segs = 16) {
  const pts = []; const d = b.subtract(a); const L = d.length() || 1; const dir = d.scale(1 / L);
  const side = Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : Vector3.Cross(dir, UP).normalize(); const up = Vector3.Cross(side, dir).normalize();
  let ox = 0; let oy = 0;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; const env1 = Math.sin(t * Math.PI);
    ox = ox * 0.45 + (R() - 0.5) * jag * L * 0.35; oy = oy * 0.45 + (R() - 0.5) * jag * L * 0.35;
    pts.push(a.add(d.scale(t)).add(side.scale(ox * env1)).add(up.scale(oy * env1)));
  }
  return pts;
}

/** Procedural lightning, regenerated every `regen` seconds. from/to may be functions. */
export function bolt(fx, o) {
  const R = rng(Math.floor(fx.rnd() * 1e6));
  const forks = o.forks ?? 3; const segs = o.segs ?? 18;
  return strip(fx, {
    kind: 'bolt', maxPts: (segs + 1) * (1 + forks) + 8, width: o.width ?? 0.35, regen: o.regen ?? 0.06,
    p: [o.crackle ?? 9, o.break ?? 0.0, 0, 0], c0: o.c0 ?? Color3.White(), c1: o.c1, c2: o.c2, opacity: o.opacity ?? 1,
    fadeIn: 0.02, fadeOut: o.fadeOut ?? 0.12, t0: o.t0, dur: o.dur,
    grow: o.growTime ? (lt) => clamp01(lt / o.growTime) * 1.02 : undefined,
    lines: () => {
      const a = posOf(o.from); const b = posOf(o.to);
      const main = boltPath(R, a, b, o.jag ?? 0.28, segs); const lines = [{ pts: main, w: (i, n) => 0.6 + 0.4 * Math.sin((i / (n - 1)) * Math.PI) }];
      for (let f = 0; f < forks; f++) {
        const i0 = Math.floor(R.range(0.15, 0.85) * segs); const p0 = main[i0];
        const dir = b.subtract(a).normalize(); const len = a.subtract(b).length() * R.range(0.15, 0.35);
        const off = V(R() - 0.5, R() - 0.4, R() - 0.5).normalize().add(dir).normalize();
        const fp = boltPath(R, p0, p0.add(off.scale(len)), 0.4, 6);
        lines.push({ pts: fp, w: (i, n) => 0.45 * (1 - i / n), b: 0.8, a0: i0 / segs, a1: i0 / segs + 0.25 });
      }
      return lines;
    },
  });
}

/** Straight energy beam with optional wobble. */
export function beam(fx, o) {
  const n = o.segs ?? 24;
  return strip(fx, {
    kind: o.kind ?? 'energy', maxPts: n + 1, width: o.width ?? 0.5, p: o.p ?? [6, 1, 0, 0], scroll: o.scroll ?? [6, 0], t0: o.t0, dur: o.dur,
    fadeIn: o.fadeIn ?? 0.05, fadeOut: o.fadeOut ?? 0.2, c0: o.c0, c1: o.c1, c2: o.c2, c3: o.c3, opacity: o.opacity ?? 1, grow: o.grow, tail: o.tail, w: o.w,
    lines: (lt) => {
      const a = posOf(o.from); const b = posOf(o.to); const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n; const p = Vector3.Lerp(a, b, t);
        if (o.wobble) { p.y += Math.sin(t * 12 + lt * 20) * o.wobble * Math.sin(t * Math.PI); }
        pts.push(p);
      }
      return [{ pts, w: o.taper ? (i, k) => lerp(o.taper[0], o.taper[1], i / (k - 1)) : 1 }];
    },
  });
}

/** Moving trail behind a point function (history ribbon). */
export function trail(fx, o) {
  const hist = []; const N = o.n ?? 24;
  return strip(fx, {
    kind: o.kind ?? 'energy', maxPts: N, width: o.width ?? 0.4, p: o.p ?? [4, 1, 1, 0], scroll: o.scroll ?? [3, 0], t0: o.t0, dur: o.dur,
    fadeIn: 0.02, fadeOut: o.fadeOut ?? 0.25, c0: o.c0, c1: o.c1, c2: o.c2, c3: o.c3, opacity: o.opacity ?? 1,
    lines: () => {
      const p = posOf(o.follow); if (!p) return [];
      if (!hist.length || Vector3.DistanceSquared(hist[0], p) > (o.minStep ?? 0.02)) { hist.unshift(p.clone()); if (hist.length > N) hist.pop(); }
      if (hist.length < 2) return [];
      return [{ pts: [...hist].reverse(), w: (i, k) => Math.pow(i / (k - 1), o.taperPow ?? 1.2), b: 1 }];
    },
  });
}

/** Growing curved tendrils (vines, roots, void arms, blood ribbons, chains). */
export function tendrils(fx, o) {
  const R = rng(Math.floor(fx.rnd() * 1e6));
  const count = Math.max(1, Math.round((o.count ?? 6) * (o.scaleQ === false ? 1 : Math.max(0.5, fx.sys.q))));
  const segs = o.segs ?? 14; const paths = [];
  const c = posOf(o.pos ?? fx.tgt); const r = o.r ?? fx.R;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + R() * 0.6;
    const pts = [];
    const start = o.mode === 'reach' ? posOf(o.from) : V(c.x + Math.cos(a) * r * R.range(0.6, 1.05), fx.gy(c), c.z + Math.sin(a) * r * R.range(0.6, 1.05));
    const h = (o.h ?? 2) * R.range(0.6, 1.2); const curl = o.curl ?? 1;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      let p;
      if (o.mode === 'reach') { // from caster to target, writhing
        const end = posOf(o.to); p = Vector3.Lerp(start, end, t);
        p.y += Math.sin(t * Math.PI) * h * 0.4; p.x += Math.sin(t * 9 + i * 2) * curl * 0.3 * Math.sin(t * Math.PI); p.z += Math.cos(t * 7 + i) * curl * 0.3 * Math.sin(t * Math.PI);
      } else if (o.mode === 'wrap') { // spiral around centre (binding)
        const ang = a + t * curl * 6; const rr = r * (1 - t * 0.5);
        p = V(c.x + Math.cos(ang) * rr, fx.gy(c) + t * h, c.z + Math.sin(ang) * rr);
      } else { // rise from ground, arcing inward
        const ang = a + Math.sin(t * 3 + i) * 0.4 * curl; const rr = lerp(Vector3.Distance(V(start.x, 0, start.z), V(c.x, 0, c.z)), r * (o.inward ?? 0.4), t);
        p = V(c.x + Math.cos(ang) * rr, start.y + Math.sin(t * Math.PI * 0.5) * h, c.z + Math.sin(ang) * rr);
      }
      pts.push(p);
    }
    paths.push({ pts, w: (s, n) => (o.taper === false ? 1 : Math.pow(1 - s / (n - 1), 0.6) * 0.9 + 0.1), b: 1 });
  }
  const growT = o.growT ?? 0.5;
  return strip(fx, {
    kind: o.kind ?? 'energy', maxPts: count * (segs + 1) + 2, width: o.width ?? 0.18, p: o.p ?? [5, 6, 1, 0], scroll: o.scroll ?? [1.5, 0],
    c0: o.c0, c1: o.c1, c2: o.c2, c3: o.c3, t0: o.t0, dur: o.dur, fadeIn: 0.02, fadeOut: o.fadeOut ?? 0.4, opacity: o.opacity ?? 1,
    grow: (lt) => clamp01(lt / growT) * 1.02, tail: o.retract ? (lt) => clamp01((lt - o.retract) / growT) : undefined,
    lines: paths,
  });
}

// ======================================================================================== surfaces
function buildShape(scene, shape, o = {}) {
  switch (shape) {
    case 'cylinder': return CreateCylinder('fx.cyl', { height: 1, diameterTop: o.top ?? 2, diameterBottom: o.bottom ?? 2, tessellation: o.tess ?? 32, cap: Mesh.NO_CAP, subdivisions: 2 }, scene);
    case 'sphere': return CreateSphere('fx.sph', { diameter: 2, segments: o.tess ?? 20, slice: o.slice ?? 1 }, scene);
    case 'torus': return CreateTorus('fx.tor', { diameter: 2, thickness: o.thick ?? 0.1, tessellation: o.tess ?? 48 }, scene);
    case 'box': return CreateBox('fx.box', { size: 1 }, scene);
    case 'plane': { const m = discMesh(scene, 'fx.plane'); m.rotation.x = -Math.PI / 2; return m; }
    default: return CreateSphere('fx.sph', { diameter: 2, segments: 12 }, scene);
  }
}

/** Shaded surface primitive. shape: cylinder|sphere|torus|box|plane|crescent|wave|Mesh */
export function surf(fx, o) {
  const scene = fx.sys.scene;
  const m = o.mesh ?? buildShape(scene, o.shape ?? 'sphere', o);
  if (o.cylBase && (o.shape === 'cylinder')) m.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  const pos = posOf(o.pos ?? fx.tgt);
  m.position.copyFrom(pos);
  if (o.scale) { const s = o.scale; if (typeof s === 'number') m.scaling.setAll(s); else m.scaling.copyFrom(s); }
  if (o.rot) m.rotation.copyFrom(o.rot);
  const mat = matFor(fx, 'surf', o.kind ?? 'energy', o);
  const prim = meshPrim(fx, m, mat, o, (lt, u, dt) => {
    if (o.follow) m.position.copyFrom(posOf(o.follow));
    if (o.spin) m.rotation.y += o.spin * dt;
    if (o.grow) mat.u.grow = val(o.grow, lt, u);
    if (o.tail) mat.u.tail = val(o.tail, lt, u);
    if (o.dissolve) mat.u.p.z = -val(o.dissolve, lt, u);
    o.anim?.(lt, u, m, mat, dt);
  });
  return fx.at(o.t0 ?? 0, o.dur ?? 1, prim);
}

/** Vertical cylinder of energy / fire / water / wind rising from the ground. */
export function column(fx, o) {
  const pos = posOf(o.pos ?? fx.tgt); const r = o.r ?? fx.R; const h = o.h ?? 6;
  const rise = o.rise ?? 0.25;
  return surf(fx, {
    shape: 'cylinder', cylBase: true, top: (o.taper ?? 1) * 2, bottom: 2, pos: V(pos.x, fx.gy(pos), pos.z), kind: o.kind ?? 'glow',
    scale: V(r, h, r), p: o.p ?? [1, 2, 0, 2], scroll: o.scroll ?? [0.15, -1.2], spin: o.spin ?? 0, t0: o.t0, dur: o.dur, fadeIn: o.fadeIn ?? 0.05, fadeOut: o.fadeOut ?? 0.4,
    c0: o.c0, c1: o.c1, c2: o.c2, c3: o.c3, opacity: o.opacity ?? 1,
    grow: (lt) => clamp01(lt / rise) * 1.02,
    anim: (lt, u, m) => { if (o.pulse) { const k = 1 + Math.sin(lt * o.pulse) * 0.06; m.scaling.x = m.scaling.z = r * k; } if (o.shrink) { const k = 1 - smooth((u - o.shrink) / (1 - o.shrink)) * 0.85; m.scaling.x = m.scaling.z = r * k; } },
  });
}

/** Spinning funnel (whirlpool, tornado, maelstrom). */
export function vortex(fx, o) {
  const pos = posOf(o.pos ?? fx.tgt); const r0 = o.r0 ?? fx.R * 0.35; const r1 = o.r1 ?? fx.R; const h = o.h ?? 4;
  const m = CreateCylinder('fx.vortex', { height: 1, diameterTop: r1 * 2, diameterBottom: r0 * 2, tessellation: 40, cap: Mesh.NO_CAP, subdivisions: 8 }, fx.sys.scene);
  m.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  return surf(fx, {
    mesh: m, pos: V(pos.x, fx.gy(pos) + (o.y ?? 0), pos.z), scale: V(1, h, 1), kind: o.kind ?? 'water', p: o.p ?? [4, 2, 1, 2], scroll: o.scroll ?? [0.6, -0.25],
    spin: o.spin ?? 3, t0: o.t0, dur: o.dur, fadeIn: o.fadeIn ?? 0.2, fadeOut: o.fadeOut ?? 0.5, c0: o.c0, c1: o.c1, c2: o.c2, c3: o.c3, opacity: o.opacity ?? 0.9,
    grow: (lt) => clamp01(lt / (o.rise ?? 0.4)) * 1.02,
    anim: (lt, u, mm) => { const k = o.squash ? 1 - smooth((u - 0.75) / 0.25) * 0.9 : 1; mm.scaling.y = h * k; },
  });
}

/** Expanding shock band. */
export function ring(fx, o) {
  const pos = posOf(o.pos ?? fx.tgt); const r0 = o.r0 ?? 0.3; const r1 = o.r1 ?? fx.R; const h = o.h ?? 0.5;
  return surf(fx, {
    shape: 'cylinder', cylBase: true, pos: V(pos.x, (o.y ?? fx.gy(pos)), pos.z), kind: o.kind ?? 'glow', scale: V(r0, h, r0), p: o.p ?? [8, 1, 0, 1.5], scroll: [0, -1],
    t0: o.t0, dur: o.dur ?? 0.5, fadeIn: 0.02, fadeOut: (o.dur ?? 0.5) * 0.7, c0: o.c0, c1: o.c1, c2: o.c2, c3: o.c3, opacity: o.opacity ?? 1, blend: o.blend,
    anim: (lt, u, m) => { const r = lerp(r0, r1, easeOut(u)); m.scaling.x = m.scaling.z = r; m.scaling.y = h * (1 - u * 0.7); },
  });
}

/** Hemisphere / sphere shell. */
export function dome(fx, o) {
  const pos = posOf(o.pos ?? fx.tgt); const r = o.r ?? fx.R;
  return surf(fx, {
    shape: 'sphere', slice: o.full ? 1 : 0.5, tess: 28, pos: o.full ? pos : V(pos.x, fx.gy(pos), pos.z), kind: o.kind ?? 'hex', scale: 0.01,
    p: o.p ?? [6, 3, 0, 2.2], scroll: o.scroll ?? [0.05, 0.1], t0: o.t0, dur: o.dur, fadeIn: 0.1, fadeOut: o.fadeOut ?? 0.4, c0: o.c0, c1: o.c1, c2: o.c2, c3: o.c3,
    opacity: o.opacity ?? 0.9, follow: o.follow, spin: o.spin,
    anim: (lt, u, m) => { const s = r * easeOutBack(Math.min(1, lt / (o.rise ?? 0.3)), 1.2) * (o.breathe ? 1 + Math.sin(lt * 4) * 0.02 : 1); m.scaling.setAll(Math.max(0.01, s)); },
  });
}

/** Crescent slash sweep (melee arcs, scythes, wind blades). */
export function slash(fx, o) {
  const scene = fx.sys.scene; const N = 28; const arc = o.arc ?? 2.4; const r = o.r ?? 1.6; const wdt = o.width ?? 0.45;
  const pos = []; const uvs = []; const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N; const a = -arc / 2 + arc * t; const thick = Math.sin(t * Math.PI) * wdt + 0.02;
    for (let j = 0; j < 3; j++) {
      const rr2 = j === 0 ? r - thick : j === 1 ? r - thick * 0.35 : r;
      pos.push(Math.sin(a) * rr2, (j === 1 ? 0.02 : 0) * thick, Math.cos(a) * rr2); uvs.push(j / 2, t);
    }
    if (i < N) for (let j = 0; j < 2; j++) { const a0 = i * 3 + j; idx.push(a0, a0 + 3, a0 + 1, a0 + 1, a0 + 3, a0 + 4); }
  }
  const m = new Mesh('fx.slash', scene); const vd = new VertexData(); vd.positions = pos; vd.uvs = uvs; vd.indices = idx;
  const nr = []; VertexData.ComputeNormals(pos, idx, nr); vd.normals = nr; vd.applyToMesh(m);
  const p0 = posOf(o.pos ?? fx.o); const d = o.dir ?? fx.dir;
  m.position.copyFrom(p0);
  m.rotation.set(o.pitch ?? 0, Math.atan2(d.x, d.z) + (o.yaw ?? 0), o.tilt ?? 0);
  const sweep = o.sweep ?? 0.6;
  return surf(fx, {
    mesh: m, pos: p0, kind: o.kind ?? 'energy', p: o.p ?? (o.kind === 'glow' ? [1, 1, 0.9, -1] : [1, 3, 0, 1]), scroll: o.scroll ?? [0, -3], t0: o.t0, dur: o.dur ?? 0.45, fadeIn: 0.02, fadeOut: o.fadeOut ?? 0.18,
    c0: o.c0, c1: o.c1, c2: o.c2, c3: o.c3, opacity: o.opacity ?? 1, blend: o.blend,
    grow: (lt, u) => (o.reverse ? 1.02 : clamp01(lt / (o.dur * sweep || 0.25)) * 1.02),
    tail: (lt, u) => (o.reverse ? 1 - clamp01(lt / ((o.dur ?? 0.45) * sweep)) : clamp01((u - 0.45) / 0.55) * 0.9),
    anim: (lt, u, mm, mat, dt) => { if (o.travel) { const tv = posOf(o.travel); mm.position.copyFrom(Vector3.Lerp(p0, tv, easeOut(u))); } if (o.expand) mm.scaling.setAll(1 + u * o.expand); o.anim?.(lt, u, mm, mat, dt); },
  });
}

/** Curling water crest travelling from -> to. */
export function wave(fx, o) {
  const scene = fx.sys.scene; const W = o.width ?? 3; const H = o.h ?? 2;
  // explicit curl cross-section (z forward, y up): back slope -> face -> crest -> lip curling forward and down
  const K = [[-1.0, 0], [-0.6, 0.22], [-0.25, 0.55], [0.0, 0.85], [0.18, 1.0], [0.38, 1.02], [0.55, 0.92], [0.64, 0.74], [0.62, 0.55], [0.52, 0.42]];
  const NP = 18; const prof = [];
  for (let i = 0; i <= NP; i++) { const f = (i / NP) * (K.length - 1); const k = Math.min(K.length - 2, Math.floor(f)); const u = f - k; prof.push([lerp(K[k][0], K[k + 1][0], u), lerp(K[k][1], K[k + 1][1], u)]); }
  const NW = 14; const pos = []; const uvs = []; const idx = [];
  for (let j = 0; j <= NW; j++) {
    const x = (j / NW - 0.5); const amp = Math.pow(Math.sin((j / NW) * Math.PI), 0.6);
    for (let i = 0; i <= NP; i++) { const [z, y] = prof[i]; pos.push(x * W, y * H * amp, z * H * 0.8 * (0.6 + 0.4 * amp)); uvs.push(j / NW * 2, i / NP); }
    if (j < NW) for (let i = 0; i < NP; i++) { const a = j * (NP + 1) + i; const b = a + NP + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const m = new Mesh('fx.wave', scene); const vd = new VertexData(); vd.positions = pos; vd.uvs = uvs; vd.indices = idx;
  const nr = []; VertexData.ComputeNormals(pos, idx, nr); vd.normals = nr; vd.applyToMesh(m);
  const from = posOf(o.from ?? fx.o); const to = posOf(o.to ?? fx.tgt); const d = to.subtract(from); d.y = 0; d.normalize();
  m.rotation.y = Math.atan2(d.x, d.z);
  return surf(fx, {
    mesh: m, pos: from, kind: 'water', p: o.p ?? [3, 1.5, 1, 2], scroll: o.scroll ?? [0.1, -0.6], t0: o.t0, dur: o.dur ?? 1, fadeIn: 0.1, fadeOut: o.fadeOut ?? 0.35,
    c0: o.c0, c1: o.c1, c2: o.c2, c3: o.c3, opacity: o.opacity ?? 0.95, dissolve: o.dissolve,
    anim: (lt, u, mm) => {
      const k = easeOut(u); const p = Vector3.Lerp(from, to, k); p.y = fx.gy(p); mm.position.copyFrom(p);
      const g = smooth(u * (o.growRate ?? 2.5)); mm.scaling.set(lerp(0.4, 1, g) * (1 + u * (o.spread ?? 0.3)), g * (1 - smooth((u - 0.8) / 0.2) * 0.6), lerp(0.5, 1, g));
    },
  });
}

// ======================================================================================== solids
/** Instanced crystal / ice / rock spikes. layout: ring|line|cluster|fan|disc|wall */
export function spikes(fx, o) {
  const scene = fx.sys.scene; const R = rng(Math.floor(fx.rnd() * 1e6));
  const count = Math.max(3, Math.round((o.count ?? 18) * Math.max(0.45, Math.min(1, fx.sys.q * 1.1))));
  const shape = o.shape ?? 'shard';
  let base;
  if (shape === 'column') base = CreateCylinder('fx.col', { height: 1, diameter: 1, tessellation: 6 }, scene);
  else if (shape === 'slab') base = CreateBox('fx.slab', { width: 1, height: 1, depth: 0.12 }, scene);
  else if (shape === 'thorn') base = CreateCylinder('fx.thorn', { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: 5 }, scene);
  else base = CreateCylinder('fx.shard', { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: o.facets ?? 6, subdivisions: 1 }, scene);
  base.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  if (shape === 'shard' && o.jitterVerts !== false) { // break the perfect cone into faceted shards
    const p = base.getVerticesData('position'); for (let i = 0; i < p.length; i += 3) { if (p[i + 1] > 0.01 && p[i + 1] < 0.99) { p[i] *= 1 + (R() - 0.5) * 0.5; p[i + 2] *= 1 + (R() - 0.5) * 0.5; } }
    base.updateVerticesData('position', p);
  }
  base.convertToFlatShadedMesh();
  base.material = fx.sys.solid(o.mat ?? 'ice', o.tint ?? fx.pal.glow, o.emissive);
  base.isPickable = false; base.alwaysSelectAsActiveMesh = true; base.setEnabled(false);
  const c = posOf(o.pos ?? fx.tgt); const r = o.r ?? fx.R; const items = [];
  const from = posOf(o.from ?? fx.g); const to = posOf(o.to ?? fx.tgt);
  for (let i = 0; i < count; i++) {
    let x; let z; let delay = 0; const t = i / count;
    if (o.layout === 'line' || o.layout === 'wall') {
      const k = o.layout === 'wall' ? t : Math.pow(R(), 0.8); const p = Vector3.Lerp(from, to, k); const side = V(-(to.z - from.z), 0, to.x - from.x).normalize();
      const wdt = lerp(o.w0 ?? 0.4, o.w1 ?? 1.6, k) * (o.layout === 'wall' ? 0.25 : 1);
      const off = (R() - 0.5) * 2 * wdt; x = p.x + side.x * off; z = p.z + side.z * off; delay = k * (o.travel ?? 0.4);
    } else if (o.layout === 'ring') {
      const a = t * Math.PI * 2 + R() * 0.2; const rr = r * R.range(0.92, 1.05); x = c.x + Math.cos(a) * rr; z = c.z + Math.sin(a) * rr; delay = (o.sweep ? t * o.sweep : R() * (o.stagger ?? 0.15));
    } else if (o.layout === 'disc') {
      const a = R() * Math.PI * 2; const rr = r * Math.sqrt(R()); x = c.x + Math.cos(a) * rr; z = c.z + Math.sin(a) * rr; delay = (rr / r) * (o.travel ?? 0.3);
    } else { // cluster
      const a = R() * Math.PI * 2; const rr = r * Math.pow(R(), 1.6) * 0.6; x = c.x + Math.cos(a) * rr; z = c.z + Math.sin(a) * rr; delay = R() * (o.stagger ?? 0.12);
    }
    const out = V(x - c.x, 0, z - c.z); const dist = out.length(); if (dist > 1e-3) out.scaleInPlace(1 / dist);
    const hk = o.layout === 'cluster' ? lerp(1, 0.45, dist / Math.max(0.01, r * 0.6)) : o.layout === 'line' ? lerp(o.h0 ?? 0.4, 1, Vector3.Distance(V(x, 0, z), V(from.x, 0, from.z)) / Math.max(1, Vector3.Distance(from, to))) : 1;
    const h = R.range(o.h?.[0] ?? 0.8, o.h?.[1] ?? 2.2) * hk; const w = R.range(o.w?.[0] ?? 0.18, o.w?.[1] ?? 0.4) * (shape === 'column' ? 1 : 1);
    const lean = (o.lean ?? 0.35) * (o.layout === 'ring' && o.inward ? -1 : 1);
    const yaw = R() * Math.PI * 2;
    items.push({ x, z, y: fx.gy(V(x, 0, z)), h, w, delay, rx: out.z * lean + (R() - 0.5) * (o.jitter ?? 0.3), rz: -out.x * lean + (R() - 0.5) * (o.jitter ?? 0.3), yaw });
  }
  const buf = new Float32Array(count * 16);
  base.thinInstanceSetBuffer('matrix', buf, 16, false);
  const rise = o.rise ?? 0.18; const sinkAt = o.sinkAt ?? 0.75; const shatter = o.shatter;
  const prim = {
    start() { base.setEnabled(true); },
    update(lt, u) {
      for (let i = 0; i < count; i++) {
        const it = items[i]; const lk = clamp01((lt - it.delay) / rise);
        let g = o.overshoot === false ? easeOut(lk) : easeOutBack(lk, 1.4);
        let sink = 0;
        if (u > sinkAt) { const s = smooth((u - sinkAt) / (1 - sinkAt)); if (shatter) g *= 1 - s; else sink = s * it.h * 1.05; }
        tmpS.set(it.w * (shape === 'column' ? 1 : lerp(0.6, 1, g)), Math.max(0.001, it.h * g), it.w * (shape === 'slab' ? 1 : 1));
        Quaternion.RotationYawPitchRollToRef(it.yaw, it.rx, it.rz, tmpQ);
        tmpT.set(it.x, it.y - sink - (o.sunk ?? 0.05), it.z);
        Matrix.ComposeToRef(tmpS, tmpQ, tmpT, tmpM); tmpM.copyToArray(buf, i * 16);
      }
      base.thinInstanceBufferUpdated('matrix');
    },
    dispose() { base.dispose(false, false); },
  };
  prim.items = items;
  return fx.at(o.t0 ?? 0, o.dur ?? 2, prim);
}

/** Instanced debris chunks. mode: burst|orbit|rise|fall|hover */
export function debris(fx, o) {
  const scene = fx.sys.scene; const R = rng(Math.floor(fx.rnd() * 1e6));
  const count = Math.max(2, Math.round((o.count ?? 12) * Math.max(0.4, Math.min(1, fx.sys.q))));
  const base = o.shape === 'shardFlat' ? CreateBox('fx.deb', { width: 1, height: 1, depth: 0.05 }, scene) : CreateIcoSphere('fx.deb', { radius: 0.5, subdivisions: 1, flat: true }, scene);
  if (o.shape !== 'shardFlat') { const p = base.getVerticesData('position'); for (let i = 0; i < p.length; i += 3) { const k = 0.75 + R() * 0.5; p[i] *= k; p[i + 1] *= k * 0.8; p[i + 2] *= k; } base.updateVerticesData('position', p); base.convertToFlatShadedMesh(); }
  base.material = fx.sys.solid(o.mat ?? 'rock', o.tint ?? fx.pal.glow, o.emissive);
  base.isPickable = false; base.alwaysSelectAsActiveMesh = true; base.setEnabled(false);
  const c = posOf(o.pos ?? fx.tgt); const r = o.r ?? fx.R;
  const items = [];
  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2; const s = R.range(o.size?.[0] ?? 0.15, o.size?.[1] ?? 0.45);
    items.push({ a, s, rr: r * R.range(0.4, 1.1), h: R.range(o.y?.[0] ?? 0.4, o.y?.[1] ?? 2.5), sp: R.range(0.6, 1.4) * (o.orbit ?? 1.2), v: V(Math.cos(a) * R.range(2, 7), R.range(3, 9), Math.sin(a) * R.range(2, 7)).scale(o.power ?? 1), rot: V(R(), R(), R()).scale(6), ph: R() * 6 });
  }
  const buf = new Float32Array(count * 16); base.thinInstanceSetBuffer('matrix', buf, 16, false);
  const prim = {
    start() { base.setEnabled(true); },
    update(lt, u) {
      const cc = posOf(o.pos ?? fx.tgt); const gy = fx.gy(cc);
      for (let i = 0; i < count; i++) {
        const it = items[i]; let x; let y; let z; let sc = it.s;
        if (o.mode === 'orbit' || o.mode === 'hover') {
          const ang = it.a + lt * it.sp * (o.mode === 'hover' ? 0.2 : 1); const pull = o.collapse ? 1 - smooth((u - o.collapse) / (1 - o.collapse)) : 1;
          x = cc.x + Math.cos(ang) * it.rr * pull; z = cc.z + Math.sin(ang) * it.rr * pull; y = gy + it.h * smooth(lt / 0.5) * (o.collapse ? lerp(0.5, 1, pull) : 1) + Math.sin(lt * 2 + it.ph) * 0.15;
          sc *= smooth(lt / 0.3) * (u > 0.85 && !o.collapse ? 1 - smooth((u - 0.85) / 0.15) : 1);
        } else if (o.mode === 'rise') {
          x = cc.x + Math.cos(it.a) * it.rr; z = cc.z + Math.sin(it.a) * it.rr; y = gy + easeOut(lt / 0.6) * it.h + lt * 0.2; sc *= 1 - smooth((u - 0.7) / 0.3);
        } else if (o.mode === 'fall') {
          const t = lt; x = cc.x + Math.cos(it.a) * it.rr; z = cc.z + Math.sin(it.a) * it.rr; y = Math.max(gy, gy + 8 + it.h - 0.5 * 18 * t * t);
        } else { // burst: ballistic
          const t = lt; x = cc.x + it.v.x * t; z = cc.z + it.v.z * t; y = Math.max(gy + it.s * 0.4, gy + 0.3 + it.v.y * t - 0.5 * 18 * t * t); sc *= 1 - smooth((u - 0.75) / 0.25);
        }
        tmpS.set(sc, sc, sc); Quaternion.RotationYawPitchRollToRef(it.rot.x * lt, it.rot.y * lt, it.rot.z * lt, tmpQ); tmpT.set(x, y, z);
        Matrix.ComposeToRef(tmpS, tmpQ, tmpT, tmpM); tmpM.copyToArray(buf, i * 16);
      }
      base.thinInstanceBufferUpdated('matrix');
    },
    dispose() { base.dispose(false, false); },
  };
  return fx.at(o.t0 ?? 0, o.dur ?? 1.5, prim);
}

/** A single solid mesh (meteor, chakram, construct part) following a path function. */
export function solid(fx, o) {
  const scene = fx.sys.scene;
  let m;
  if (o.mesh) m = o.mesh;
  else if (o.shape === 'torus') m = CreateTorus('fx.so', { diameter: 1, thickness: o.thick ?? 0.15, tessellation: 32 }, scene);
  else if (o.shape === 'box') m = CreateBox('fx.so', { size: 1 }, scene);
  else if (o.shape === 'cyl') m = CreateCylinder('fx.so', { height: 1, diameter: 1, tessellation: o.tess ?? 16 }, scene);
  else if (o.shape === 'sphere') m = CreateSphere('fx.so', { diameter: 1, segments: 16 }, scene);
  else { m = CreateIcoSphere('fx.so', { radius: 0.5, subdivisions: 2, flat: true }, scene); const R = rng(7); const p = m.getVerticesData('position'); for (let i = 0; i < p.length; i += 3) { const k = 0.8 + R() * 0.4; p[i] *= k; p[i + 1] *= k; p[i + 2] *= k; } m.updateVerticesData('position', p); }
  if (!o.mesh) m.material = fx.sys.solid(o.mat ?? 'rock', o.tint ?? fx.pal.glow, o.emissive);
  m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.setEnabled(false);
  const s = o.size ?? 1; if (typeof s === 'number') m.scaling.setAll(s); else m.scaling.copyFrom(s);
  if (o.rot) m.rotation.copyFrom(o.rot);
  const prim = {
    mesh: m,
    start() { m.setEnabled(true); },
    update(lt, u, dt) { if (o.path) m.position.copyFrom(o.path(lt, u)); if (o.spin) { m.rotation.x += o.spin.x * dt; m.rotation.y += o.spin.y * dt; m.rotation.z += o.spin.z * dt; } o.anim?.(lt, u, m, dt); },
    dispose() { m.dispose(false, !o.keepMat); },
  };
  if (o.pos) m.position.copyFrom(posOf(o.pos));
  return fx.at(o.t0 ?? 0, o.dur ?? 1, prim);
}

// ======================================================================================== particles / light / misc
/** Particle layer. o.follow: ()=>Vector3 to move emitter each frame. */
export function emit(fx, preset, o = {}) {
  const sys = fx.sys; let h = null;
  const pos = (posOf(o.follow ?? o.pos ?? fx.tgt) ?? fx.tgt).clone();
  const P = fx.pal;
  const prim = {
    start() {
      h = sys.particles.emit(preset, { ...o, pos, colors: o.colors ?? [o.c0 ?? P.core, o.c1 ?? P.glow, o.c2 ?? P.edge], dur: o.rate ? (this.t1 - this.t0) : 0, scale: (o.scale ?? 1) * (fx.opts.scale ?? 1) });
    },
    update() { if (o.follow && h) { const p = posOf(o.follow); if (p) h.pos.copyFrom(p); } },
    stop() { h?.stop(); },
  };
  return fx.at(o.t0 ?? 0, o.rate ? (o.dur ?? 0.5) : 0.02, prim);
}

/** Bright flare + pooled point light. */
export function flash(fx, o = {}) {
  const pos = posOf(o.pos ?? fx.tgt); const c = o.color ?? fx.pal.glow; const size = o.size ?? 2.5;
  emit(fx, 'flare', { pos, t0: o.t0, burst: o.n ?? 2, size, colors: [Color3.White(), c, c], life: [o.dur ?? 0.2, (o.dur ?? 0.2) * 1.3] });
  if ((o.light ?? 6) <= 0) return null;
  return light(fx, { pos, color: c, intensity: o.light ?? 6, range: o.range ?? size * 4, t0: o.t0, dur: o.dur ? o.dur * 2 : 0.35, pri: o.pri ?? 2 });
}

/** Animated light from the pool (skipped when the tier has none). */
export function light(fx, o) {
  let L = null;
  const prim = {
    start() { L = fx.sys.lightPool?.claim(fx, (o.pri ?? 1) + fx.prio) ?? null; if (L) { L.diffuse.copyFrom(o.color ?? fx.pal.glow); L.range = o.range ?? 10; } },
    update(lt, u) {
      if (!L || L._fxOwner !== fx) return;
      const p = posOf(o.pos ?? fx.tgt); L.position.copyFrom(p);
      const e = o.env ? o.env(lt, u) : (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85);
      L.intensity = (o.intensity ?? 4) * 0.3 * e * (o.flicker ? 0.8 + Math.random() * 0.4 : 1);
    },
    stop() { if (L && L._fxOwner === fx) { L.intensity = 0; L._fxOwner = null; L.position.set(0, -1000, 0); } },
  };
  return fx.at(o.t0 ?? 0, o.dur ?? 0.4, prim);
}

/** Camera shake via bus (only when the local player is involved). */
export function shake(fx, t, strength, dur = 0.3) {
  if (!fx.opts.shake && !fx.opts.local) return;
  fx.call(t, () => fx.sys.ctx.bus?.emit('camera:shake', { strength: strength * (fx.opts.shakeMul ?? 1), duration: dur }));
}

/** Projectile orb along straight/arced path with core glow, trail and emitted particles. Returns {p} live position. */
export function orb(fx, o) {
  const from = posOf(o.from ?? fx.o); const to = () => posOf(o.to ?? fx.tgtH);
  const cur = from.clone(); const t0 = o.t0 ?? fx.T.ant; const dur = o.dur ?? Math.max(0.08, fx.T.hit - t0);
  const arc = o.arc ?? 0; const sz = o.size ?? 0.35;
  const path = (lt) => {
    const u = clamp01(lt / dur); const b = to(); const p = Vector3.Lerp(from, b, o.ease ? easeOut(u) : u);
    p.y += Math.sin(u * Math.PI) * arc;
    if (o.wiggle) { const s = Vector3.Cross(b.subtract(from).normalize(), UP); p.addInPlace(s.scale(Math.sin(u * 14 + (o.ph ?? 0)) * o.wiggle * Math.sin(u * Math.PI))); }
    cur.copyFrom(p); return cur;
  };
  const getP = () => cur;
  const holder = { p: cur };
  // core
  surf(fx, { shape: 'sphere', tess: 14, pos: from, kind: o.coreKind ?? 'energy', scale: sz, p: [3, 3, 0, 1.2], scroll: [0.5, 1], t0, dur, fadeIn: 0.03, fadeOut: 0.05, c0: o.c0, c1: o.c1, c2: o.c2, c3: o.c3, opacity: o.opacity ?? 1,
    anim: (lt, u, m) => { m.position.copyFrom(path(lt)); m.scaling.setAll(sz * (1 + Math.sin(lt * 30) * 0.08)); } });
  emit(fx, 'glow', { follow: getP, t0, dur, rate: 30, size: sz * 3.2, life: [0.08, 0.16], speed: [0, 0.2], c0: o.c0 ?? fx.pal.core, c1: fx.pal.glow, c2: fx.pal.edge });
  if (o.trail !== false) trail(fx, { follow: getP, t0, dur: dur + 0.25, kind: o.trailKind ?? 'energy', width: o.trailWidth ?? sz * 1.6, n: 20, c0: o.c0, c1: o.c1, c2: o.c2, c3: o.c3, fadeOut: 0.25 });
  if (o.parts) emit(fx, o.parts, { follow: getP, t0, dur, rate: o.partRate ?? 60, shape: 'sphere', r: sz * 0.6, ...(o.partOpts ?? {}) });
  if (o.light !== false) light(fx, { pos: getP, t0, dur, intensity: o.light ?? 2.5, range: 6, env: () => 1 });
  return holder;
}

export { V, posOf, val };
