// Pure Three.js migration of the canonical measured city kit.
// Reusable composite motifs (arcades, terraces with stairs, broken walls, gears, pylons, trees,
// sails...) composed from kit primitives. Shared by the per-oath city styles.
import { TAU, polar, rot2, stairs, terrace, colBox, banner, catenary, balustrade, arcPts, hangingLanternProto, proto, deckStrip } from './kit.js';

/** Raised terrace spanning x0..x1, z0..z1 with a front staircase (from plaza level y0) at stairX. */
export function terraceStairs(S, o) {
  const { x0, x1, z0, z1, h, mat } = o; const y0 = o.y0 ?? 0.06;
  terrace(S, mat, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, { coping: o.coping, y0: o.base ?? -3 });
  const run = o.run ?? Math.max(3, (h - y0) / 0.22 * 0.36); const w = o.stairW ?? 12;
  for (const sx of (o.stairXs ?? [o.stairX ?? 0])) stairs(S, o.stairMat ?? mat, sx, z0 - run / 2, 0, w, run, y0, h, { cheek: o.cheek });
  if (o.rail) {
    const ys = h + (o.coping ? 0.2 : 0);
    const segs = [];
    let xa = x0 + 0.4;
    for (const sx of [...(o.stairXs ?? [o.stairX ?? 0])].sort((a, b) => a - b)) { segs.push([xa, sx - w / 2 - 0.3]); xa = sx + w / 2 + 0.3; }
    segs.push([xa, x1 - 0.4]);
    for (const [a, b] of segs) if (b - a > 1) balustrade(S, [[a, z0 + 0.3], [b, z0 + 0.3]], { ...o.rail, y: ys });
  }
  return h;
}

/** Straight arcade of arched bays between two points. */
export function arcade(S, mat, x0, z0, x1, z1, h, span, depth, oh, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(1, Math.round(L / span)); const sp = L / n;
  const ry = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
  const y = o.y ?? 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n; const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (o.skip && o.skip(x, z)) continue;
    const g = o.follow ? S.gy(x, z) : 0;
    (o.builder || S.b).archWall(mat, x, y + g - (o.follow ? 3 : 0), z, sp + 0.02, h + (o.follow ? 3 : 0), depth, sp * (o.open ?? 0.62), oh + (o.follow ? 3 : 0) - (o.follow ? 0 : 0), { ry });
    const pierW = sp * (1 - (o.open ?? 0.62)) / 2;
    for (const s of [-0.5, 0.5]) { const [px, pz] = rot2(s * sp - Math.sign(s) * pierW / 2, 0, ry); S.col.box(x + px, z + pz, pierW / 2, depth / 2, ry, y + g - 3, y + g + h, false); }
  }
  return { ry, n, sp };
}

/** Arcade following a circular arc (compass angles). Returns chord list. */
export function arcArcade(S, mat, r, a0, a1, h, span, depth, oh, o = {}) {
  const n = Math.max(1, Math.round(((a1 - a0) * r) / span)); const chords = [];
  for (let i = 0; i < n; i++) {
    const p = polar(r, a0 + (a1 - a0) * (i / n)), q = polar(r, a0 + (a1 - a0) * ((i + 1) / n));
    const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
    if (o.skip && o.skip(mx, mz)) continue;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]); const ry = Math.atan2(q[0] - p[0], q[1] - p[1]) - Math.PI / 2;
    S.b.archWall(mat, mx, o.y ?? 0, mz, L + 0.05, h, depth, L * (o.open ?? 0.6), oh, { ry });
    const pierW = L * (1 - (o.open ?? 0.6)) / 2;
    for (const s of [-0.5, 0.5]) { const [px, pz] = rot2(s * L - Math.sign(s) * pierW / 2, 0, ry); S.col.box(mx + px, mz + pz, pierW / 2, depth / 2, ry, (o.y ?? 0) - 1, (o.y ?? 0) + h, false); }
    chords.push({ p, q, mx, mz, L, ry });
  }
  return chords;
}

/** Monumental wall of stacked blocks along a line with optional jagged breaks (holeFn(u,v)->bool). */
export function blockWall(S, mat, x0, z0, x1, z1, h, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0); const ry = Math.atan2(x1 - x0, z1 - z0);
  const bw = o.bw ?? 2.4, bh = o.bh ?? 1.6, th = o.th ?? 2.2; const rand = S.rand;
  const nx = Math.max(1, Math.round(L / bw)), ny = Math.max(1, Math.round(h / bh));
  S.F.push(x0, o.y ?? 0, z0, ry);
  S.b.box(mat, 0, -3, L / 2, th + 0.2, 3.2, L);
  for (let j = 0; j < ny; j++) {
    const off = (j & 1) * 0.5;
    for (let i = 0; i < nx + (j & 1 ? 0 : 0); i++) {
      const u = (i + off + 0.5) / nx; const v = (j + 0.5) / ny;
      if (u > 1) continue;
      if (o.hole && o.hole(u, v, i, j)) continue;
      const jx = (rand() - 0.5) * 0.12, jy = rand() * 0.06;
      const sw = bw * (0.94 + rand() * 0.05);
      S.b.box(mat, jx * 0.5, j * bh + jy * 0, (i + off + 0.5) * (L / nx), th * (0.92 + rand() * 0.08), bh * 0.985, Math.min(sw, L / nx * 0.995));
    }
  }
  S.F.pop();
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  S.col.box(mx, mz, th / 2, L / 2, ry, (o.y ?? 0) - 3, (o.y ?? 0) + (o.colH ?? h), false);
}

/** Rotating gear (animated) facing local -Z, centred at (x,y,z). */
export function gear(S, x, y, z, ry, R, mat, speed = 0.2, o = {}) {
  const teeth = o.teeth ?? Math.max(10, Math.round(R * 5));
  S.animMesh(`gear${x.toFixed(0)}_${z.toFixed(0)}_${y.toFixed(0)}`, x, y, z, ry, (b) => {
    b.cyl(mat, 0, 0, -0.25, R * 0.9, R * 0.9, 0.5, 32, { rx: Math.PI / 2 });
    b.torus(mat, 0, 0, 0, R * 0.92, 0.16, 32, 5, { rx: Math.PI / 2 });
    for (let i = 0; i < teeth; i++) { const a = (i / teeth) * TAU; b.box(mat, Math.sin(a) * (R + 0.18), Math.cos(a) * (R + 0.18) - 0.22, 0, 0.42, 0.44, 0.56, { rz: -a }); }
    b.cyl(o.hub ?? mat, 0, 0, -0.45, R * 0.22, R * 0.22, 0.9, 16, { rx: Math.PI / 2 });
    if (o.cutouts !== false) for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; b.beam(o.hub ?? mat, [0, 0, -0.3], [Math.sin(a) * R * 0.85, Math.cos(a) * R * 0.85, -0.3], 0.3, 0.3); }
  }, (node, t, dt) => { node.rotation.z += speed * dt; });
}

/** Storm relay pylon: stone plinth, tapered dark body with copper bands, lantern-window cap, insulators. Returns top [x,y,z]. */
export function relayPylon(S, x, z, h, o = {}) {
  const y = o.y ?? 0.06; const body = S.M.wall, cu = S.M.metal, cer = S.M.ceramic ?? S.M.trim, glow = S.M.glow; const k0 = o.scale ?? 1;
  const B = 3.4 * k0, T = 1.7 * k0; const H0 = y + 3.2;
  S.b.box(S.M.trim, x, y - 2, z, B * 2.4, 5.2, B * 2.4);
  S.d.box(cu, x, y + 3.05, z, B * 2.5, 0.3, B * 2.5);
  const bodyH = h - 9;
  S.b.cyl(body, x, H0, z, B * Math.SQRT2, T * Math.SQRT2, bodyH, 4, { ry: Math.PI / 4 });
  for (let k = 1; k * 3.4 < bodyH; k++) { const yy = H0 + k * 3.4; const r = (B + (T - B) * (k * 3.4) / bodyH) * Math.SQRT2; S.d.cyl(cu, x, yy, z, r + 0.14, r + 0.12, 0.4, 4, { ry: Math.PI / 4 }); }
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; for (const yy of [0.25, 0.55]) { const r = B + (T - B) * yy; S.d.box(S.M.dark, x + Math.sin(a) * (r + 0.02), H0 + bodyH * yy, z + Math.cos(a) * (r + 0.02), 0.6, 1.5, 0.08, { ry: a }); } }
  const H = H0 + bodyH;
  // lantern chamber
  S.b.box(body, x, H, z, T * 2.8, 0.6, T * 2.8);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; const r = T * 1.25; S.d.box(glow, x + Math.sin(a) * r, H + 0.7, z + Math.cos(a) * r, T * 1.4, 2.4, 0.12, { ry: a }); }
  for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) S.b.box(body, x + cx * T * 1.25, H + 0.6, z + cz * T * 1.25, 0.6, 2.6, 0.6);
  S.b.box(body, x, H + 0.6, z, T * 2.2, 2.4, T * 2.2);
  S.d.box(cu, x, H + 3.2, z, T * 3.1, 0.4, T * 3.1);
  S.b.cyl(cu, x, H + 3.6, z, T * 1.9, 0.4, 2.2, 4, { ry: Math.PI / 4 });
  for (let k = 0; k < 5; k++) S.d.cyl(cer, x, H + 5.8 + k * 0.42, z, 0.55, 0.55, 0.2, 12);
  S.d.cyl(cu, x, H + 5.8, z, 0.14, 0.12, 4.2, 8);
  S.d.sphere(cu, x, H + 10.2, z, 0.38, 10);
  for (const s of [-1, 1]) { const [ax, az] = rot2(s * (T * 1.9 + 1), 0, o.armRy ?? 0); S.d.beam(cu, [x, H + 3.3, z], [x + ax, H + 2.6, z + az], 0.22); S.d.cyl(cer, x + ax, H + 1.6, z + az, 0.24, 0.24, 1.0, 8); }
  S.col.box(x, z, B * 1.2, B * 1.2, 0, y - 2, H + 4, false);
  S.light(x, H + 1, z, S.style.glow, 16, 1.2);
  return [x, H + 2.4, z];
}

/** Cable (tube) along a catenary between two frame points. */
export function cable(S, mat, a, b, sag, r = 0.07) { S.d.tube(mat, catenary(a, b, sag, 16), r, 5); }

/** Giant tree with buttress roots, branches and canopy blobs. Returns {top, branches}. */
export function giantTree(S, x, z, R, H, o = {}) {
  const bark = S.M.bark, leaves = S.M.leaves; const y = o.y ?? 0;
  const rand = S.rand;
  S.b.lathe(bark, x, y - 1, z, [[R * 1.6, 0], [R * 1.25, 1.2], [R, 3], [R * 0.9, H * 0.4], [R * 0.75, H * 0.75], [R * 0.6, H], [0, H + 0.2]], 14);
  // buttress roots
  const nr = o.roots ?? 7;
  for (let i = 0; i < nr; i++) {
    const a = (i / nr) * TAU + rand() * 0.4; const L = R * (2.2 + rand() * 1.4);
    const p0 = [x + Math.sin(a) * R * 0.6, y + R * 1.8, z + Math.cos(a) * R * 0.6];
    const p1 = [x + Math.sin(a) * (R + L * 0.45), y + R * 0.6, z + Math.cos(a) * (R + L * 0.45)];
    const p2 = [x + Math.sin(a) * (R + L), y - 0.4, z + Math.cos(a) * (R + L)];
    S.b.tube(bark, [p0, p1, p2], (t) => R * (0.42 - t * 0.3), 7);
    // lower root (p1 -> p2) lies on the ground: walkable ramp along its crown if gentle, else a solid
    const top1 = p1[1] + R * 0.27, top2 = p2[1] + R * 0.12; const run = L * 0.55;
    if ((top1 - top2) / run < 0.78) deckStrip(S, [[p2[0], top2, p2[2]], [p1[0], top1, p1[2]]], R * 0.2, { overlap: 0 });
    else colBox(S, (p1[0] + p2[0]) / 2, (p1[2] + p2[2]) / 2, R * 0.4, run, a, y - 1, top1, false);
  }
  const branches = [];
  const nb = o.branches ?? 7;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * TAU + rand() * 0.8; const hy = H * (0.55 + rand() * 0.35); const L = H * (0.35 + rand() * 0.25);
    const p0 = [x, y + hy, z]; const p1 = [x + Math.sin(a) * L * 0.5, y + hy + L * 0.35, z + Math.cos(a) * L * 0.5];
    const p2 = [x + Math.sin(a) * L, y + hy + L * 0.45, z + Math.cos(a) * L];
    S.b.tube(bark, [p0, p1, p2], (t) => R * (0.4 - t * 0.28), 6);
    branches.push(p2);
    S.b.sphere(leaves, p2[0], p2[1] + 1, p2[2], H * (0.22 + rand() * 0.1), 10, { sy: 0.62 });
    S.b.sphere(leaves, (p1[0] + p2[0]) / 2, p2[1] - 1.5, (p1[2] + p2[2]) / 2, H * (0.14 + rand() * 0.06), 8, { sy: 0.6 });
  }
  S.b.sphere(leaves, x, y + H + 1, z, H * 0.34, 12, { sy: 0.55 });
  S.col.circle(x, z, R * 1.15, y - 1, y + H, false);
  return { top: [x, y + H, z], branches };
}

/** Tensile sail between 4 corner points (frame space). */
export function sail(S, mat, c) { S.d.quad(mat, c, { double: true, uv: [0, 0, 1, 1] }); }

/** Hanging lanterns along a list of points. */
export function hangLanterns(S, pts) { const p = hangingLanternProto(S.M.metal, S.M.glow); for (const q of pts) S.inst.add(p, q[0], q[1] - 1.2, q[2]); }

/** Cluster of crystals (hex prisms) around a point. */
export function crystalCluster(S, x, z, s = 1, y = 0) {
  const rand = S.rand; const mat = S.M.crystal;
  const n = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const a = rand() * TAU, r = rand() * 0.9 * s; const h = (1.2 + rand() * 2.6) * s; const w = (0.25 + rand() * 0.25) * s;
    const tilt = 0.15 + rand() * 0.4;
    S.d.cyl(mat, x + Math.sin(a) * r, y - 0.2, z + Math.cos(a) * r, w, w * 0.85, h, 6, { rx: Math.cos(a) * tilt, rz: -Math.sin(a) * tilt });
    S.d.cyl(mat, x + Math.sin(a) * r + Math.sin(a) * Math.sin(tilt) * h, y - 0.2 + Math.cos(tilt) * h, z + Math.cos(a) * r + Math.cos(a) * Math.sin(tilt) * h, w * 0.85, 0.02, w * 1.4, 6, { rx: Math.cos(a) * tilt, rz: -Math.sin(a) * tilt });
  }
  S.col.circle(x, z, s * 1.1, y - 1, y + 3 * s, false);
}

/** Rough rock mass (stack of rotated boxes) e.g. outcrops, mesas. */
export function rockMass(S, mat, x, z, w, h, o = {}) {
  const rand = S.rand; const y = (o.y ?? S.gy(x, z)) - 2;
  const n = o.n ?? 4;
  for (let i = 0; i < n; i++) {
    const sw = w * (0.55 + rand() * 0.5), sd = w * (0.5 + rand() * 0.5), sh = h * (0.5 + rand() * 0.55);
    const bx = x + (rand() - 0.5) * w * 0.5, bz = z + (rand() - 0.5) * w * 0.5, ry = rand() * TAU;
    S.b.box(mat, bx, y, bz, sw, sh + 2, sd, { ry, rz: (rand() - 0.5) * 0.08, rx: (rand() - 0.5) * 0.08 });
    // one oriented collider per block: sides block, the (near-flat) top can be stood on
    colBox(S, bx, bz, sw, sd, ry, y, y + sh + 2, true);
  }
}

/** Pennant/banner pole set around a circle at given compass angles. */
export function ringBanners(S, r, angles, h = 9, o = {}) {
  for (const a of angles) { const [x, z] = polar(r, a); if (!S.clear(x, z, 1)) continue; S.F.push(x, 0, z, a); bannerPoleLocal(S, h, o); S.F.pop(); }
}
function bannerPoleLocal(S, h, o) {
  const pm = o.pole ?? S.M.metal; const y0 = o.y ?? 0.06;
  S.d.cyl(o.base ?? S.M.trim, 0, y0, 0, 0.55, 0.45, 0.7, 8);
  S.d.cyl(pm, 0, y0 + 0.7, 0, 0.1, 0.08, h, 8);
  S.d.sphere(pm, 0, y0 + h + 0.8, 0, 0.16, 8);
  banner(S, 0, y0 + h - 0.2, -0.14, 0, o.w ?? 1.5, o.bh ?? h * 0.55, { bar: pm });
  S.col.circle(0, 0, 0.5, y0 - 0.5, y0 + h, false);
}

/** Circular water/lava channel ring (open where gaps). */
export function channelRing(S, r0, r1, gaps, halfW, o = {}) {
  const liquid = o.liquid ?? S.M.water; const curb = o.curb ?? S.M.trim; const ly = o.level ?? 0.25; const ch = o.curbH ?? 0.55;
  const arcs = circleArcsLocal(r1, gaps, halfW);
  for (const [a0, a1] of arcs) {
    S.d.ring(liquid, 0, ly, 0, r0, r1, 0.0, Math.max(6, Math.round((a1 - a0) * r1 / 3)), { a0, arc: a1 - a0 });
    S.b.cyl(curb, 0, -0.3, 0, r1 + 0.6, r1 + 0.6, ch + 0.3, Math.max(6, Math.round((a1 - a0) * r1 / 3)), { a0, arc: a1 - a0, caps: false });
    S.b.cyl(curb, 0, -0.3, 0, r0, r0, ch + 0.3, Math.max(6, Math.round((a1 - a0) * r1 / 3)), { a0, arc: a1 - a0, caps: false });
    S.d.ring(curb, 0, ch, 0, r1, r1 + 0.6, 0.0, Math.max(6, Math.round((a1 - a0) * r1 / 3)), { a0, arc: a1 - a0 });
    S.d.ring(curb, 0, ch, 0, r0 - 0.5, r0, 0.0, Math.max(6, Math.round((a1 - a0) * r1 / 3)), { a0, arc: a1 - a0 });
    S.b.ring(o.bed ?? curb, 0, -0.1, 0, r0, r1, 0.0, Math.max(6, Math.round((a1 - a0) * r1 / 3)), { a0, arc: a1 - a0 });
    // collision: chunks
    const n = Math.max(1, Math.ceil(((a1 - a0) * r1) / 4));
    for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * ((i + 0.5) / n); const [x, z] = polar((r0 + r1) / 2, a); S.col.box(x, z, ((a1 - a0) * r1) / n / 2 + 0.2, (r1 - r0) / 2 + 0.5, a, -1, ch + 0.15, false); }
  }
  return arcs;
}
function circleArcsLocal(r, gaps, halfW) {
  const g = gaps.map((a) => ((a % TAU) + TAU) % TAU).sort((a, b) => a - b);
  if (!g.length) return [[0, TAU]];
  const hw = halfW / r; const arcs = [];
  for (let i = 0; i < g.length; i++) { const a0 = g[i] + hw; const a1 = (i + 1 < g.length ? g[i + 1] : g[0] + TAU) - hw; if (a1 - a0 > 0.02) arcs.push([a0, a1]); }
  return arcs;
}

/** Find n free compass angles at radius r (spread, avoiding roads/reserved), starting from preferred list. */
export function freeSpots(S, r, prefs, margin = 6) {
  const out = [];
  for (const a of prefs) { const [x, z] = polar(r, a); if (S.clear(x, z, margin)) out.push(a); }
  return out;
}

/** Big rock masses scattered in a ring beyond the city (skyline framing). */
export function outerRocks(S, mat, n, r0, r1, w = [10, 22], h = [8, 20]) {
  const rand = S.rand;
  for (let i = 0; i < n; i++) {
    const a = rand() * TAU, r = r0 + rand() * (r1 - r0); const [x, z] = polar(r, a);
    if (!S.clear(x, z, 4)) continue;
    rockMass(S, mat, x, z, w[0] + rand() * (w[1] - w[0]), h[0] + rand() * (h[1] - h[0]), { n: 3 + Math.floor(rand() * 3) });
  }
}

export { arcPts, proto };
