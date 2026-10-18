// Shared architectural kit: measured, interoperable modules (plaza, inlays, balustrades,
// stairs, terraces, banners, braziers, towers, houses, stalls, city walls, shrine) that every
// sanctuary composes with its own materials and signature structures.
// All coordinates are sanctuary-local metres: origin = plaza centre at plaza height,
// +Z = toward the main hall (largest gap between roads), angles are compass (0 = +Z, +PI/2 = +X).
import { makeProto } from './builder.js';
import { emblemPolys } from './emblems.js';

export const TAU = Math.PI * 2;
export const polar = (r, a) => [Math.sin(a) * r, Math.cos(a) * r];
export const angOf = (x, z) => Math.atan2(x, z);
export const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------ material id registry
const MAT_DEFS = new Map();
/** Register a material reference: returns a string id usable as builder bucket key. */
export function M(key, opts) { const id = opts ? `${key}|${JSON.stringify(opts)}` : key; if (!MAT_DEFS.has(id)) MAT_DEFS.set(id, { key, opts: opts || {} }); return id; }
/** Register a factory-backed material id (e.g. per-oath banner with a canvas texture). */
export function MF(id, factory) { if (!MAT_DEFS.has(id)) MAT_DEFS.set(id, { factory }); return id; }
export function matDef(id) { return MAT_DEFS.get(id); }

// ------------------------------------------------------------ prototypes for thin instances
const PROTOS = {};
export function proto(name, fn) { if (!PROTOS[name]) PROTOS[name] = makeProto(name, fn); return name; }
export function getProtos() { return PROTOS; }

export function balusterProto(type, mat) {
  return proto(`baluster:${type}:${mat}`, (b) => {
    if (type === 'stone') b.lathe(mat, 0, 0, 0, [[0.07, 0], [0.07, 0.05], [0.05, 0.08], [0.075, 0.18], [0.09, 0.28], [0.05, 0.4], [0.04, 0.44], [0.065, 0.48], [0.065, 0.5], [0, 0.5]], 8);
    else if (type === 'iron') { b.cyl(mat, 0, 0, 0, 0.018, 0.018, 0.5, 5); b.sphere(mat, 0, 0.25, 0, 0.035, 6); }
    else if (type === 'wood') b.box(mat, 0, 0, 0, 0.09, 0.5, 0.05);
    else b.box(mat, 0, 0, 0, 0.12, 0.5, 0.12);
  });
}

export function brazierProto(metal, glow) {
  return proto(`brazier:${metal}:${glow}`, (b) => {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; b.cyl(metal, Math.sin(a) * 0.32, 0, Math.cos(a) * 0.32, 0.035, 0.03, 1.15, 5, { rx: Math.cos(a) * 0.22, rz: -Math.sin(a) * 0.22 }); }
    b.lathe(metal, 0, 0.95, 0, [[0.12, 0], [0.3, 0.08], [0.48, 0.28], [0.52, 0.38], [0.46, 0.36], [0.0, 0.3]], 14);
    b.torus(metal, 0, 1.33, 0, 0.5, 0.03, 18, 4);
    b.lathe(glow, 0, 1.2, 0, [[0.4, 0], [0.3, 0.25], [0.14, 0.55], [0.0, 0.85]], 7);
  });
}

export function lanternPostProto(metal, glow, h = 3.4) {
  return proto(`lanternPost:${metal}:${glow}:${h}`, (b) => {
    b.cyl(metal, 0, 0, 0, 0.14, 0.12, 0.4, 8); b.cyl(metal, 0, 0.4, 0, 0.06, 0.05, h - 0.4, 6);
    b.box(metal, 0, h - 0.05, 0, 0.42, 0.06, 0.42); b.cyl(metal, 0, h + 0.62, 0, 0.26, 0.02, 0.26, 4, { ry: Math.PI / 4 });
    for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [0.17, 0.17], [-0.17, 0.17]]) b.box(metal, x, h, z, 0.04, 0.62, 0.04);
    b.box(glow, 0, h + 0.06, 0, 0.26, 0.5, 0.26);
  });
}

export function hangingLanternProto(metal, glow) {
  return proto(`hangLantern:${metal}:${glow}`, (b) => {
    b.cyl(metal, 0, 0.55, 0, 0.012, 0.012, 1.2, 4);
    b.cyl(metal, 0, 0.45, 0, 0.2, 0.05, 0.14, 8); b.cyl(metal, 0, -0.1, 0, 0.16, 0.2, 0.06, 8);
    b.cyl(glow, 0, -0.05, 0, 0.15, 0.15, 0.5, 8);
  });
}

export function crenelProto(mat, w = 0.9, h = 0.9, d = 0.7) { return proto(`crenel:${mat}:${w}:${h}:${d}`, (b) => b.box(mat, 0, 0, 0, w, h, d)); }
export function boxProto(mat, w, h, d) { return proto(`box:${mat}:${w}:${h}:${d}`, (b) => b.box(mat, 0, 0, 0, w, h, d)); }

export function crateProto(wood, metal) {
  return proto(`crate:${wood}:${metal}`, (b) => {
    b.box(wood, 0, 0, 0, 0.9, 0.9, 0.9);
    for (const y of [0.02, 0.82]) { b.box(metal, 0, y, 0.455, 0.92, 0.06, 0.02); b.box(metal, 0, y, -0.455, 0.92, 0.06, 0.02); }
  });
}
export function barrelProto(wood, metal) {
  return proto(`barrel:${wood}:${metal}`, (b) => {
    b.lathe(wood, 0, 0, 0, [[0.28, 0], [0.34, 0.25], [0.36, 0.45], [0.34, 0.65], [0.28, 0.9], [0, 0.9]], 12);
    b.torus(metal, 0, 0.12, 0, 0.32, 0.015, 14, 3); b.torus(metal, 0, 0.78, 0, 0.32, 0.015, 14, 3);
  });
}

export function treeProto(kind, bark, leaves) {
  return proto(`tree:${kind}:${bark}:${leaves}`, (b) => {
    if (kind === 'cypress') {
      b.cyl(bark, 0, 0, 0, 0.18, 0.12, 1.4, 6);
      b.lathe(leaves, 0, 0.9, 0, [[0.5, 0], [0.95, 1.2], [1.0, 2.6], [0.85, 4.2], [0.5, 5.6], [0.0, 6.6]], 9);
    } else if (kind === 'palm') {
      b.tube(bark, [[0, 0, 0], [0.3, 2, 0], [0.8, 4, 0], [1.2, 6, 0]], (t) => 0.2 - t * 0.07, 6);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; b.quad(leaves, [[1.2, 6, 0], [1.2 + Math.sin(a + 0.3) * 0.5, 6.1, Math.cos(a + 0.3) * 0.5], [1.2 + Math.sin(a) * 2.6, 5.2, Math.cos(a) * 2.6], [1.2 + Math.sin(a - 0.3) * 0.5, 6.1, Math.cos(a - 0.3) * 0.5]], { double: true }); }
    } else if (kind === 'pine') {
      b.cyl(bark, 0, 0, 0, 0.22, 0.1, 7, 6);
      for (let k = 0; k < 4; k++) b.cyl(leaves, 0, 1.6 + k * 1.4, 0, 1.9 - k * 0.38, 0.1, 2.4, 8);
    } else { // broadleaf
      b.cyl(bark, 0, 0, 0, 0.3, 0.2, 3.2, 7);
      b.sphere(leaves, 0, 4.4, 0, 2.2, 8, { sy: 0.8 }); b.sphere(leaves, 1.1, 3.8, 0.5, 1.5, 7); b.sphere(leaves, -0.9, 4.0, -0.6, 1.6, 7);
    }
  });
}

// ------------------------------------------------------------ collider helpers (frame-local)
/** Solid or walkable box collider at frame-local position. */
export function colBox(S, x, z, w, d, ry, y0, y1, walkable = false) { S.col.box(x, z, w / 2, d / 2, ry, y0, y1, walkable); }

// ------------------------------------------------------------ plaza
export function plaza(S) {
  const { b, d, style } = S; const Mx = S.M;
  const R = 42;
  // inner city paving (covers the flat terrain disc)
  b.cyl(Mx.ground, 0, -0.6, 0, 82, 82, 0.66, 72, { caps: true });
  S.col.circle(0, 0, 82, -2, 0.06, true);
  if (style.plaza === 'square') {
    const h = 38;
    b.box(Mx.border, 0, 0, 0, h * 2 + 4, 0.12, h * 2 + 4);
    b.box(Mx.pave, 0, 0, 0, h * 2, 0.16, h * 2);
    colBox(S, 0, 0, h * 2 + 4, h * 2 + 4, 0, -1, 0.16, true);
  } else {
    b.cyl(Mx.border, 0, 0, 0, R, R, 0.12, 96);
    b.cyl(Mx.pave, 0, 0, 0, R - 2.2, R - 2.2, 0.16, 96);
    S.col.circle(0, 0, R, -1, 0.16, true);
  }
  inlay(S);
}

export function inlay(S) {
  const { d, style } = S; const mat = S.M.inlay; const y = 0.16;
  if (style.plaza === 'square') {
    const h = 36.6;
    for (const [hh, w] of [[h, 0.35], [h - 1.1, 0.14]]) {
      d.box(mat, 0, y, hh, hh * 2, 0.025, w); d.box(mat, 0, y, -hh, hh * 2, 0.025, w);
      d.box(mat, hh, y, 0, w, 0.025, hh * 2); d.box(mat, -hh, y, 0, w, 0.025, hh * 2);
    }
    d.ring(mat, 0, y, 0, 21.2, 21.7, 0.025, 96); d.ring(mat, 0, y, 0, 20.3, 20.5, 0.025, 96);
  } else {
    d.ring(mat, 0, y, 0, 38.0, 38.5, 0.025, 128); d.ring(mat, 0, y, 0, 37.1, 37.3, 0.025, 128);
  }
  d.ring(mat, 0, y, 0, 14.4, 14.9, 0.025, 96); d.ring(mat, 0, y, 0, 13.5, 13.7, 0.025, 96);
  emblemFlat(S, d, mat, 0, y, 0, style.emblemScale ?? 10.5);
  if (style.inlayExtra) style.inlayExtra(S, mat, y);
}

/** Flat emblem inlay lying on the floor; emblem up = local +Z. */
export function emblemFlat(S, bld, mat, x, y, z, scale, ry = 0, th = 0.025) {
  for (const poly of emblemPolys(S.oath.id)) {
    const pts = poly.map(([px, py]) => [px * scale, py * scale]);
    bld.prism(mat, pts, x, y, z, th, { ry, bottom: false });
  }
}
/** Standing emblem plaque facing -Z (toward the plaza when placed on the north side). */
export function emblemStanding(S, bld, mat, x, y, z, scale, ry = 0, depth = 0.12) {
  for (const poly of emblemPolys(S.oath.id)) {
    const pts = poly.map(([px, py]) => [-px * scale, py * scale]);
    bld.prism(mat, pts, x, y, z, depth, { vertical: true, ry });
  }
}

// ------------------------------------------------------------ balustrade
/**
 * Balustrade along a polyline of [x,z] points at base y.
 * o: {type:'stone'|'iron'|'wood'|'solid', rail, post, h, postEvery, cap(proto fn), y}
 */
export function balustrade(S, pts, o = {}) {
  const { d } = S; const y = o.y ?? 0.06; const h = o.h ?? 1.05;
  const rail = o.rail ?? S.M.trim, post = o.post ?? rail, type = o.type ?? 'stone';
  const bal = type === 'solid' ? null : balusterProto(type, o.balMat ?? rail);
  const plinthH = type === 'iron' ? 0.12 : 0.28;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.05) continue;
    const ry = Math.atan2(x1 - x0, z1 - z0); const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (type === 'solid') d.box(rail, mx, y, mz, 0.42, h - 0.08, L + 0.02, { ry });
    else {
      d.box(rail, mx, y, mz, type === 'iron' ? 0.12 : 0.4, plinthH, L + 0.02, { ry });
      d.box(rail, mx, y + h - 0.12, mz, type === 'iron' ? 0.09 : 0.34, 0.12, L + 0.02, { ry });
      const n = Math.max(1, Math.floor(L / (type === 'iron' ? 0.16 : 0.3)));
      const sy = (h - 0.12 - plinthH) / 0.5;
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; S.inst.add(bal, x0 + (x1 - x0) * t, y + plinthH, z0 + (z1 - z0) * t, ry, 1, sy, 1); }
    }
    S.col.box(mx, mz, 0.3, L / 2, ry, y - 0.5, y + h + 0.05, false);
    acc += L;
  }
  const every = o.postEvery ?? 3.6; let since = every;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) since += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (since >= every || i === 0 || i === pts.length - 1) {
      since = 0; const [x, z] = pts[i];
      d.box(post, x, y, z, 0.52, h + 0.12, 0.52);
      d.box(post, x, y + h + 0.12, z, 0.62, 0.1, 0.62);
      if (o.cap) o.cap(x, y + h + 0.22, z);
    }
  }
}

/** Points on a circle arc (compass angles a0->a1), spacing ~step metres. */
export function arcPts(r, a0, a1, step = 3) {
  const n = Math.max(1, Math.ceil((Math.abs(a1 - a0) * r) / step)); const pts = [];
  for (let i = 0; i <= n; i++) pts.push(polar(r, a0 + (a1 - a0) * (i / n)));
  return pts;
}

/** Split a full circle into arcs that skip given gap angles (half-width in metres at radius r). */
export function circleArcs(r, gaps, halfW) {
  const g = gaps.map((a) => ((a % TAU) + TAU) % TAU).sort((a, b) => a - b);
  if (!g.length) return [[0, TAU]];
  const hw = halfW / r; const arcs = [];
  for (let i = 0; i < g.length; i++) {
    const a0 = g[i] + hw; let a1 = (i + 1 < g.length ? g[i + 1] : g[0] + TAU) - hw;
    if (a1 - a0 > 0.02) arcs.push([a0, a1]);
  }
  return arcs;
}

/** Plaza perimeter balustrade with entrances at gate angles. */
export function plazaRim(S, o = {}) {
  const gaps = [...S.roads, 0, ...(S.style.extraGaps || [])];
  if (S.style.plaza === 'square') {
    const h = 40.6;
    const sides = [[[-h, -h], [h, -h]], [[h, -h], [h, h]], [[h, h], [-h, h]], [[-h, h], [-h, -h]]];
    for (const [p, q] of sides) {
      // split side where road rays cross it
      const cuts = [];
      for (const a of gaps) {
        const dx = Math.sin(a), dz = Math.cos(a);
        const ex = q[0] - p[0], ez = q[1] - p[1];
        const den = ex * dz - ez * dx; if (Math.abs(den) < 1e-6) continue;
        const t = (p[1] * dx - p[0] * dz) / den;
        const s = Math.abs(dx) > Math.abs(dz) ? (p[0] + t * ex) / dx : (p[1] + t * ez) / dz;
        if (t > 0 && t < 1 && s > 0) cuts.push(t);
      }
      cuts.sort((a, b) => a - b);
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]); const hw = (o.gap ?? 5.5) / L;
      let t0 = 0;
      for (const c of [...cuts, 1 + hw]) {
        const t1 = Math.min(1, c - hw);
        if (t1 - t0 > 0.02) balustrade(S, segPts(p, q, t0, t1, 3.2), o);
        t0 = c + hw;
      }
    }
  } else {
    for (const [a0, a1] of circleArcs(42.8, gaps, o.gap ?? 5.5)) balustrade(S, arcPts(42.8, a0, a1, 3.2), o);
  }
}
export function segPts(p, q, t0, t1, step) {
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]) * (t1 - t0); const n = Math.max(1, Math.ceil(L / step)); const out = [];
  for (let i = 0; i <= n; i++) { const t = t0 + (t1 - t0) * (i / n); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  return out;
}

// ------------------------------------------------------------ stairs / terraces
/** Staircase rising toward local +Z of its own frame (ry). Adds walkable ramp collider. */
export function stairs(S, mat, x, z, ry, w, run, y0, y1, o = {}) {
  S.b.stairs(mat, x, y0, z, w, run, y1 - y0, { ry, cheek: o.cheek });
  S.col.ramp(x, z, w / 2, run / 2, ry, y0, y1);
  if (o.cheek) { for (const s of [-1, 1]) { const [cx, cz] = rot2(s * (w / 2 + 0.25), 0, ry); S.col.box(x + cx, z + cz, 0.25, run / 2, ry, y0 - 1, y1 + 0.5, false); } }
}
export function rot2(x, z, ry) { const c = Math.cos(ry), s = Math.sin(ry); return [x * c + z * s, -x * s + z * c]; }

/** Rectangular raised terrace (walkable top) with coping. */
export function terrace(S, mat, x, z, w, d, h, o = {}) {
  S.b.box(mat, x, o.y0 ?? -3, z, w, h - (o.y0 ?? -3), d, { ry: o.ry || 0 });
  if (o.coping) S.d.box(o.coping, x, h - 0.02, z, w + 0.3, 0.22, d + 0.3, { ry: o.ry || 0 });
  colBox(S, x, z, w, d, o.ry || 0, (o.y0 ?? -3), h + (o.coping ? 0.2 : 0), true);
}

// ------------------------------------------------------------ walkway helpers
/**
 * Guard rail between frame points a=[x,y,z] -> b, where y is the walking surface at each end:
 * posts, top + mid rail, and solid colliders (split in <= 4 m chunks so sloped runs stay tight).
 */
export function guardRail(S, a, b, o = {}) {
  const h = o.h ?? 1.05, rail = o.rail ?? S.M.metal, post = o.post ?? rail;
  const dx = b[0] - a[0], dz = b[2] - a[2]; const L = Math.hypot(dx, dz); if (L < 0.05) return;
  const lerp = (t) => [a[0] + dx * t, a[1] + (b[1] - a[1]) * t, a[2] + dz * t];
  if (o.visual !== false) {
    const n = Math.max(1, Math.round(L / (o.postEvery ?? 1.8)));
    for (let i = 0; i <= n; i++) { const [x, y, z] = lerp(i / n); S.d.box(post, x, y, z, 0.11, h + 0.04, 0.11); }
    S.d.beam(rail, [a[0], a[1] + h + 0.04, a[2]], [b[0], b[1] + h + 0.04, b[2]], 0.09);
    S.d.beam(rail, [a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], 0.05);
  }
  const ry = Math.atan2(dx, dz); const k = Math.max(1, Math.ceil(L / (o.chunk ?? 4)));
  for (let j = 0; j < k; j++) {
    const p = lerp(j / k), q = lerp((j + 1) / k);
    colBox(S, (p[0] + q[0]) / 2, (p[2] + q[2]) / 2, 0.25, L / k + 0.2, ry, Math.min(p[1], q[1]) - 0.5, Math.max(p[1], q[1]) + h, false);
  }
}

/**
 * Walkable collider strip following a polyline of deck-top points [[x,y,z],...] (frame space):
 * one tilted ramp per segment (flat segments become plain walkable boxes). hw = half width.
 * yMin of each piece sits `depth` below its lowest end so people can walk underneath.
 */
export function deckStrip(S, pts, hw, o = {}) {
  const depth = o.depth ?? 0.8; const over = o.overlap ?? 0.15;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1]; const dx = q[0] - p[0], dz = q[2] - p[2]; const L = Math.hypot(dx, dz); if (L < 1e-3) continue;
    const ry = Math.atan2(dx, dz); const mx = (p[0] + q[0]) / 2, mz = (p[2] + q[2]) / 2;
    if (Math.abs(q[1] - p[1]) < 0.02) { colBox(S, mx, mz, hw * 2, L + over * 2, ry, p[1] - depth, p[1], true); continue; }
    // extend the ramp by `over` at both ends along its own slope so neighbours overlap without steps
    const k = (q[1] - p[1]) / L; const hd = L / 2 + over;
    const y0 = (p[1] + q[1]) / 2 - k * hd, y1 = (p[1] + q[1]) / 2 + k * hd;
    S.col.ramp(mx, mz, hw, hd, ry, y0, y1);
  }
}

// ------------------------------------------------------------ banners, lamps
/** Hanging banner (per-oath emblem cloth, wind animated) from crossbar at top y. */
export function banner(S, x, ytop, z, ry, w = 1.6, h = 5, o = {}) {
  S.d.cloth(S.M.banner, x, ytop, z, w, h, ry, 3, Math.max(6, Math.round(h * 1.6)), { vcut: o.vcut ?? 0.45 });
  const bar = o.bar ?? S.M.metal;
  if (bar) { const [cx, cz] = rot2(w / 2 + 0.15, 0, ry); S.d.beam(bar, [x - cx, ytop + 0.05, z - cz], [x + cx, ytop + 0.05, z + cz], 0.08); }
}
export function bannerPole(S, x, z, h = 9, o = {}) {
  const y0 = o.y ?? 0.06; const pm = o.pole ?? S.M.metal; const ry = o.ry ?? 0;
  S.d.cyl(o.base ?? S.M.trim, x, y0, z, 0.55, 0.45, 0.7, 8);
  S.d.cyl(pm, x, y0 + 0.7, z, 0.1, 0.08, h, 8);
  S.d.sphere(pm, x, y0 + h + 0.8, z, 0.16, 8);
  const [ox, oz] = rot2(0, -0.14, ry);
  banner(S, x + ox, y0 + h - 0.2, z + oz, ry, o.w ?? 1.5, o.bh ?? h * 0.55, { bar: pm });
  S.col.circle(x, z, 0.5, y0 - 0.5, y0 + h, false);
}
export function brazier(S, x, z, y = 0.06, s = 1, light = false) {
  S.inst.add(brazierProto(S.M.metal, S.M.glow), x, y, z, 0, s, s, s);
  S.col.circle(x, z, 0.45 * s, y - 0.5, y + 1.3 * s, false);
  if (light) S.light(x, y + 1.9 * s, z, S.style.glow, 14, 1.4);
}
export function lanternPost(S, x, z, y = 0.06, h = 3.4) {
  S.inst.add(lanternPostProto(S.M.metal, S.M.glow, h), x, y, z, 0);
  S.col.circle(x, z, 0.2, y - 0.5, y + h, false);
}

// ------------------------------------------------------------ catenary cable / swag
export function catenary(a, b, sag, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]); }
  return pts;
}
/** Draped cloth swag between two points (ribbon following a catenary). */
export function swag(S, mat, a, b, sag, width = 1.2) {
  const pts = catenary(a, b, sag, 12);
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1]; const t0 = i / 12, t1 = (i + 1) / 12;
    const w0 = width * (0.4 + Math.sin(t0 * Math.PI) * 0.6), w1 = width * (0.4 + Math.sin(t1 * Math.PI) * 0.6);
    S.d.quad(mat, [[p[0], p[1], p[2]], [q[0], q[1], q[2]], [q[0], q[1] - w1, q[2]], [p[0], p[1] - w0, p[2]]], { double: true, uv: [t0, 1, t1, 0] });
  }
}

// ------------------------------------------------------------ water
export function pool(S, x, z, w, d, o = {}) {
  const rim = o.rim ?? S.M.trim; const wy = o.waterY ?? 0.35; const rh = o.rimH ?? 0.6; const ry = o.ry || 0;
  const water = o.water ?? S.M.water;
  S.b.box(o.floor ?? S.M.wall, x, -0.4, z, w, 0.4 + 0.05, d, { ry });
  S.d.box(water, x, wy - 0.02, z, w - 0.2, 0.02, d - 0.2, { ry, noBottom: true });
  for (const [ox, oz, ww, dd] of [[0, d / 2, w + 0.6, 0.6], [0, -d / 2, w + 0.6, 0.6], [w / 2, 0, 0.6, d], [-w / 2, 0, 0.6, d]]) {
    const [cx, cz] = rot2(ox, oz, ry); S.b.box(rim, x + cx, -0.2, z + cz, ww, rh + 0.2, dd, { ry });
  }
  colBox(S, x, z, w + 0.6, d + 0.6, ry, -1, rh, true); // whole basin incl. the rim can be stood on
}
export function roundPool(S, x, z, r, o = {}) {
  const rim = o.rim ?? S.M.trim; const wy = o.waterY ?? 0.35; const rh = o.rimH ?? 0.6;
  S.d.cyl(o.water ?? S.M.water, x, wy - 0.05, z, r - 0.2, r - 0.2, 0.05, 40, { caps: true });
  S.b.cyl(rim, x, -0.2, z, r + 0.35, r + 0.35, rh + 0.2, 40, { caps: false });
  S.b.cyl(rim, x, -0.2, z, r - 0.15, r - 0.15, rh + 0.2, 40, { caps: false });
  S.d.ring(rim, x, rh, z, r - 0.15, r + 0.35, 0.02, 40);
  S.col.circle(x, z, r + 0.35, -1, rh, true);
}
/** Falling water sheet (scrolling texture) from (x,ytop,z) down to ybot, width w, facing ry. */
export function waterfall(S, x, ytop, z, w, ybot, ry = 0) {
  const [cx, cz] = rot2(w / 2, 0, ry); const [fx, fz] = rot2(0, -0.6, ry);
  S.d.quad(S.M.fall, [[x - cx, ybot, z - cz], [x + cx, ybot, z + cz], [x + cx + fx * 0.4, ytop, z + cz + fz * 0.4], [x - cx + fx * 0.4, ytop, z - cz + fz * 0.4]], { double: true, uv: [0, 0, w, ytop - ybot] });
}

// ------------------------------------------------------------ generic modules
/** Generic square tower with crenellated top. */
export function squareTower(S, x, z, w, h, o = {}) {
  const y = o.y ?? 0; const mat = o.mat ?? S.M.wall; const trim = o.trim ?? S.M.trim; const ry = o.ry || 0;
  S.b.box(mat, x, y - 3, z, w, h + 3, w, { ry });
  S.b.box(trim, x, y + h, z, w + 0.6, 0.5, w + 0.6, { ry });
  if (o.roof === 'pyramid') S.b.hip(o.roofMat ?? S.M.roof, x, y + h + 0.5, z, w + 0.8, w + 0.8, w * 0.9, { ry });
  else if (o.roof !== 'none') {
    S.F.push(x, y + h + 0.5, z, ry);
    const n = Math.max(2, Math.round(w / 1.5)); const step = (w + 0.4) / n;
    for (let i = 0; i < n; i++) for (const [px, pz, rr] of [[-w / 2 - 0.1 + step * (i + 0.5), w / 2, 0], [-w / 2 - 0.1 + step * (i + 0.5), -w / 2, 0], [w / 2, -w / 2 - 0.1 + step * (i + 0.5), 1], [-w / 2, -w / 2 - 0.1 + step * (i + 0.5), 1]]) {
      if (i % 2 === 0) S.inst.add(crenelProto(trim, 0.8, 0.9, 0.55), px, 0, pz, rr ? Math.PI / 2 : 0);
    }
    S.F.pop();
  }
  if (o.windows !== false) {
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + ry; const [wx, wz] = [Math.sin(a) * (w / 2 + 0.02), Math.cos(a) * (w / 2 + 0.02)]; S.d.box(o.winMat ?? S.M.dark, x + wx, y + h * 0.62, z + wz, 0.8, 1.6, 0.1, { ry: a }); }
  }
  colBox(S, x, z, w, w, ry, y - 3, y + h + 1, false);
}

/** Round tower (cylinder) with optional conical roof. */
export function roundTower(S, x, z, r, h, o = {}) {
  const y = o.y ?? 0; const mat = o.mat ?? S.M.wall;
  S.b.cyl(mat, x, y - 3, z, r, r * (o.taper ?? 0.92), h + 3, 16);
  S.b.cyl(o.trim ?? S.M.trim, x, y + h, z, r * (o.taper ?? 0.92) + 0.35, r * (o.taper ?? 0.92) + 0.35, 0.5, 16);
  if (o.roof === 'cone') S.b.cyl(o.roofMat ?? S.M.roof, x, y + h + 0.5, z, r + 0.6, 0.05, r * 1.6, 16);
  else if (o.roof === 'dome') S.b.sphere(o.roofMat ?? S.M.roof, x, y + h + 0.5, z, r * 0.95, 14, { hemi: true });
  S.col.circle(x, z, r, y - 3, y + h + 1, false);
}

/** House with style hooks. House frame: origin at front-centre ground, faces -Z (toward plaza). */
export function genericHouse(S, w, d, h, o = {}) {
  const wall = o.wall ?? S.M.house ?? S.M.wall, roof = o.roof ?? S.M.roof, trim = o.trim ?? S.M.trim;
  const b = S.b, dd = S.d; const rand = S.rand;
  b.box(wall, 0, 0, d / 2, w, h, d);
  dd.box(trim, 0, 0, d / 2, w + 0.3, 0.55, d + 0.3);
  for (const sx of [-1, 1]) { dd.box(trim, sx * (w / 2 - 0.12), 0, -0.04, 0.42, h, 0.16); dd.box(trim, sx * (w / 2 + 0.02), 0, d - 0.25, 0.16, h, 0.42); }
  const storeys = h > 6.2 ? 2 : 1; const sh = h / storeys;
  if (storeys > 1) dd.box(trim, 0, sh - 0.1, d / 2, w + 0.18, 0.22, d + 0.18);
  const rt = o.roofType ?? 'gable';
  if (rt === 'flat') { dd.box(trim, 0, h, d / 2, w + 0.4, 0.35, d + 0.4); dd.box(wall, 0, h + 0.35, d / 2, w - 0.6, 0.45, d - 0.6); b.box(wall, 0, h + 0.35, d / 2, w - 1.4, 0.06, d - 1.4); }
  else if (rt === 'hip') b.hip(roof, 0, h, d / 2, w + 1, d + 1, Math.min(w, d) * 0.45);
  else if (rt === 'dome') { dd.box(trim, 0, h, d / 2, w + 0.3, 0.3, d + 0.3); b.sphere(roof, 0, h + 0.3, d / 2, Math.min(w, d) * 0.38, 12, { hemi: true }); }
  else b.gable(roof, 0, h, d / 2, w + 1.0, d + 1.2, Math.min(w, d) * (o.pitch ?? 0.42), { gableMat: wall, inset: 0.5 });
  // door
  const door = o.door ?? S.M.wood ?? trim;
  dd.box(trim, 0, 0, -0.06, 1.8, 2.6, 0.14); dd.box(door, 0, 0.05, -0.1, 1.25, 2.3, 0.1);
  // windows per storey with sills / lintels; a few warmly lit
  const win = o.win ?? S.M.dark; const nW = Math.max(1, Math.floor(w / 2.8));
  for (let st = 0; st < storeys; st++) {
    const y0 = st * sh + sh * 0.42;
    for (let i = 0; i < nW; i++) {
      const x = -w / 2 + (i + 0.5) * (w / nW); if (st === 0 && Math.abs(x) < 1.4) continue;
      const lit = rand() < 0.08;
      dd.box(lit ? S.M.glow : win, x, y0, -0.03, 0.85, 1.15, 0.06);
      dd.box(trim, x, y0 - 0.14, -0.1, 1.1, 0.14, 0.2); dd.box(trim, x, y0 + 1.15, -0.08, 1.05, 0.16, 0.16);
    }
    for (const sx of [-1, 1]) if (d > 5) dd.box(win, sx * (w / 2 + 0.02), y0, d * 0.5, 0.06, 1.1, 0.8);
  }
  if (rt !== 'flat' && rand() < 0.45) { const cx = (rand() - 0.5) * w * 0.5; b.box(trim, cx, h - 0.5, d * 0.68, 0.9, Math.min(w, d) * 0.42 + 1.6, 0.9); }
}

/** Market stall: counter, posts and striped cloth canopy. Frame faces -Z. */
export function stall(S, o = {}) {
  const wood = S.M.wood ?? S.M.trim; const cloth = o.cloth ?? S.M.canopy ?? S.M.banner;
  const d = S.d;
  d.box(wood, 0, 0, 0, 3.2, 0.95, 1.1);
  d.box(S.M.trim, 0, 0.95, 0, 3.4, 0.08, 1.25);
  for (const [x, z] of [[-1.6, -0.6], [1.6, -0.6], [-1.6, 1.4], [1.6, 1.4]]) d.box(wood, x, 0, z, 0.12, z < 0 ? 2.5 : 2.9, 0.12);
  d.quad(cloth, [[-1.8, 2.5, -1.0], [1.8, 2.5, -1.0], [1.8, 2.95, 1.6], [-1.8, 2.95, 1.6]], { double: true, uv: [0, 0, 1, 1] });
  // goods
  S.inst.add(crateProto(wood, S.M.metal), -1.1, 0.95, 0.1, 0.2, 0.45, 0.4, 0.45);
  S.inst.add(barrelProto(wood, S.M.metal), 1.0, 0, 1.0, 0, 0.9, 0.9, 0.9);
  S.inst.add(crateProto(wood, S.M.metal), 2.1, 0, 0.9, 0.5, 0.8, 0.8, 0.8);
  S.col.box(0, 0.2, 1.8, 1.0, 0, -0.5, 1.0, false);
}

// ------------------------------------------------------------ shrine (waypoint)
export function shrine(S, x, z, o = {}) {
  const b = S.b, d = S.d; const base = o.base ?? S.M.trim, pillar = o.pillar ?? S.M.wall, metal = o.metal ?? S.M.metal;
  const y = o.y ?? 0.16;
  b.cyl(base, x, y, z, 3.3, 3.3, 0.3, 24); b.cyl(base, x, y + 0.3, z, 2.6, 2.6, 0.3, 24); b.cyl(base, x, y + 0.6, z, 1.9, 1.9, 0.3, 24);
  S.col.circle(x, z, 3.3, y - 1, y + 0.3, true); S.col.circle(x, z, 2.6, y - 1, y + 0.6, true); S.col.circle(x, z, 1.9, y - 1, y + 0.9, true);
  b.cyl(pillar, x, y + 0.9, z, 0.85, 0.62, 5.2, 4, { ry: Math.PI / 4 });
  d.cyl(metal, x, y + 0.9, z, 0.92, 0.9, 0.25, 4, { ry: Math.PI / 4 });
  d.cyl(metal, x, y + 6.0, z, 0.72, 0.72, 0.22, 4, { ry: Math.PI / 4 });
  S.col.circle(x, z, 0.9, y, y + 9, false);
  // emblem ring + plaque
  const ey = y + 8.0;
  d.torus(metal, x, ey, z, 1.55, 0.09, 40, 6, { rx: Math.PI / 2 });
  d.torus(metal, x, ey, z, 1.75, 0.04, 40, 4, { rx: Math.PI / 2 });
  d.box(metal, x, y + 6.2, z, 0.18, 0.4, 0.18);
  emblemStanding(S, d, S.M.shrineGlow, x, ey, z, 1.25, 0, 0.16);
  d.disc(S.M.shrineGlow, x, y + 0.92, z, 1.5, 24);
  S.light(x, ey, z - 1.5, S.style.glow, 18, 2.2, true);
  S.shrine = { x, y: y + 0.9, z };
}

// ------------------------------------------------------------ outer districts
/**
 * Place houses on rings between r0..r1, avoiding road corridors and reserved areas.
 * builder(S, w, d, h, rand) builds a house in a frame facing -Z (plaza).
 */
export function districts(S, houseFn, o = {}) {
  const rand = S.rand; const rings = o.rings ?? [96, 113, 130]; const dens = (o.density ?? 1) * S.qDensity;
  for (const r of rings) {
    let a = rand() * 0.2;
    while (a < TAU) {
      const w = (o.w ?? [7, 11])[0] + rand() * ((o.w ?? [7, 11])[1] - (o.w ?? [7, 11])[0]);
      const dd = (o.d ?? [6, 9])[0] + rand() * ((o.d ?? [6, 9])[1] - (o.d ?? [6, 9])[0]);
      const step = (w + (o.gapM ?? 4.5)) / r;
      const rr = r + (rand() - 0.5) * 3;
      const [x, z] = polar(rr, a);
      if (rand() <= dens && S.clear(x, z, w * 0.6) && !(o.skip && o.skip(a, rr))) {
        const ry = a + Math.PI + (rand() - 0.5) * 0.16; // front faces the centre
        const corners = [[-w / 2, 0], [w / 2, 0], [-w / 2, dd], [w / 2, dd]].map(([lx, lz]) => { const [cx, cz] = rot2(lx, lz, ry); return S.gy(x + cx, z + cz); });
        const gmin = Math.min(...corners), gmax = Math.max(...corners);
        if (gmax - gmin < 6) {
          const h = (o.h ?? [4.5, 7])[0] + rand() * ((o.h ?? [4.5, 7])[1] - (o.h ?? [4.5, 7])[0]);
          const fy = gmax + 0.25;
          S.F.push(x, fy, z, ry);
          S.b.box(S.M.found ?? S.M.trim, 0, gmin - fy - 1.5, dd / 2, w + 0.5, fy - gmin + 1.5 + 0.02, dd + 0.5);
          houseFn(S, w, dd, h, rand);
          S.F.pop();
          const [cx, cz] = rot2(0, dd / 2, ry);
          S.col.box(x + cx, z + cz, (w + 0.5) / 2, (dd + 0.5) / 2, ry, gmin - 2, fy + h, false);
          S.reserve(x + cx, z + cz, Math.max(w, dd) * 0.6);
        }
      }
      a += step;
    }
  }
}

// ------------------------------------------------------------ city wall
/** Outer wall ring following terrain, gates at road angles. */
export function cityWall(S, o = {}) {
  const r = o.r ?? 146; const h = o.h ?? 7; const th = o.th ?? 2.6; const mat = o.mat ?? S.M.wall; const trim = o.trim ?? S.M.trim;
  const arcs = circleArcs(r, S.roads, 8.5);
  const pts = [];
  for (const [a0, a1] of arcs) {
    const n = Math.max(1, Math.ceil(((a1 - a0) * r) / (o.seg ?? 22)));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n); const [x, z] = polar(r, a); const g = S.gy(x, z);
      const p = { x, z, g, a };
      if (prev) {
        const L = Math.hypot(x - prev.x, z - prev.z); const ry = Math.atan2(x - prev.x, z - prev.z);
        const mx = (x + prev.x) / 2, mz = (z + prev.z) / 2; const gl = Math.min(g, prev.g), gh = Math.max(g, prev.g);
        if (o.type === 'palisade') {
          const k = Math.max(2, Math.floor(L / 0.45));
          for (let j = 0; j < k; j++) { const t = (j + 0.5) / k; const px = prev.x + (x - prev.x) * t, pz = prev.z + (z - prev.z) * t; S.inst.add(o.stakeProto, px, S.gy(px, pz) - 1, pz, j * 1.7, 1, (h + 1) / 6, 1); }
          S.d.beam(trim, [prev.x, prev.g + h * 0.6, prev.z], [x, g + h * 0.6, z], 0.18);
        } else {
          S.b.box(mat, mx, gl - 3, mz, th, gh - gl + h + 3, L + 0.4, { ry });
          S.d.box(trim, mx, gh + h, mz, th + 0.5, 0.35, L + 0.4, { ry });
          if (o.crenels !== false) {
            const k = Math.floor(L / 1.6);
            for (let j = 0; j < k; j++) { const t = (j + 0.5) / k; const px = prev.x + (x - prev.x) * t, pz = prev.z + (z - prev.z) * t; for (const s of [-1, 1]) { const [ox, oz] = rot2(s * (th / 2 - 0.25), 0, ry); S.inst.add(o.crenel ?? crenelProto(trim, 0.85, 0.85, 0.5), px + ox, gh + h + 0.35, pz + oz, ry + Math.PI / 2); } }
          }
        }
        S.col.box(mx, mz, th / 2, L / 2 + 0.2, ry, gl - 3, gh + h, false);
      }
      if (i > 0 && i < n && i % (o.towerEvery ?? 3) === 0 && o.towers !== false) (o.tower || defaultWallTower)(S, x, z, g, a);
      prev = p; pts.push(p);
    }
  }
  // gates
  for (const a of S.roads) (o.gate || defaultGate)(S, a, r, h, th);
}

export function defaultWallTower(S, x, z, g, a) { squareTower(S, x, z, 5.2, 11, { y: g, ry: a, windows: false }); }
export function defaultGate(S, a, r, h, th) {
  const [x, z] = polar(r, a); const g = S.gy(x, z);
  const gw = 17; // total gap
  for (const s of [-1, 1]) { const [tx, tz] = rot2(s * (gw / 2 + 2.6), 0, a); const gx = x + tx, gz = z + tz; squareTower(S, gx, gz, 5.4, h + 6, { y: S.gy(gx, gz), ry: a, roof: S.style.gateRoof }); }
  S.b.archWall(S.M.wall, x, g + 0.0, z, gw, h + 4.5, th + 1, gw - 4, h + 1.8, { ry: a + Math.PI / 2 * 0, seg: 12 });
  // arch jambs between the gate towers (the towers carry their own colliders)
  for (const s of [-1, 1]) { const [jx, jz] = rot2(s * (gw / 2 - 1), 0, a); colBox(S, x + jx, z + jz, 2, th + 1, a, g - 1, g + h + 4.5, false); }
  // banners on gate
  for (const s of [-1, 1]) { const [bx, bz] = rot2(s * 4.5, -(th / 2 + 0.6), a); banner(S, x + bx, g + h + 3.6, z + bz, a, 1.6, 4.5); }
  const [ix, iz] = polar(r - 6, a);
  S.gates.push({ x: ix, z: iz, a });
}
