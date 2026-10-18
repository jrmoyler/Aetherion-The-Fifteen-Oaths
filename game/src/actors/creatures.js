// Procedural creature archetypes (shared/creatures.js ARCHETYPES): rigged, smooth-skinned
// bodies tinted per creature (body / secondary / accent / glow) with code-driven gaits.
// Heavy bipeds (golem, construct, treant) reuse the humanoid rig + animator.
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { GeoBuilder, xf, mix, shade, lerp, clamp, smooth, jointWeights } from './geom.js';
import { genericLayout, humanoidLayout, HB } from './rig.js';
import { Pose, kf } from './anim.js';

const PI = Math.PI, TAU = PI * 2, S = Math.sin, C = Math.cos;

// ------------------------------------------------------------- helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lp = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Skin weights along a polyline of joints (one bone per segment). */
function pathWeights(pts, bones, width = 0.05) {
  const arcs = [0];
  for (let i = 0; i < pts.length - 1; i++) arcs.push(arcs[i] + len(sub(pts[i + 1], pts[i])));
  const joints = arcs.slice(1, -1);
  return (x, y, z) => {
    let best = 0, bd = Infinity, bu = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], d = sub(pts[i + 1], a), l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
      let u = ((x - a[0]) * d[0] + (y - a[1]) * d[1] + (z - a[2]) * d[2]) / l2; u = clamp(u);
      const px = a[0] + d[0] * u - x, py = a[1] + d[1] * u - y, pz = a[2] + d[2] * u - z;
      const dd = px * px + py * py + pz * pz;
      if (dd < bd) { bd = dd; best = i; bu = u; }
    }
    return jointWeights(arcs[best] + bu * (arcs[best + 1] - arcs[best]), bones, joints, width);
  };
}
/** Tube through joint points with radius fn(t) (t = 0..1 along the path), skinned per segment. */
function limb(g, chan, pts, rf, bones, color, opts = {}) {
  const sub2 = opts.sub ?? 3;
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < sub2; k++) dense.push(lp(pts[i], pts[i + 1], k / sub2));
  dense.push(pts[pts.length - 1]);
  g.tube(chan, dense, rf, opts.skin ?? pathWeights(pts, bones, opts.blend ?? 0.05), color, { segs: opts.segs ?? 10, caps: opts.caps ?? true, ref: opts.ref, flat: opts.flat, n: opts.n });
}

function tints(t) {
  const body = t.body ?? '#555', accent = t.accent ?? '#888', glow = t.glow ?? '#ffaa44';
  return { body, accent, glow, sec: t.secondary ?? mix(body, '#e8dcc8', 0.35), dark: shade(body, 0.6) };
}

// ======================================================= QUADRUPEDS
const QUAD = {
  hound: { sh: 0.7, len: 0.95, w: 0.12, neckL: 0.3, neckA: 0.55, head: 0.3, legR: 0.042, bodyR: [0.15, 0.19], tail: 0.6, tailA: 0.35, ears: 'pointed', snout: 0.55 },
  boar: { sh: 0.78, len: 1.15, w: 0.17, neckL: 0.2, neckA: 0.15, head: 0.44, legR: 0.062, bodyR: [0.27, 0.34], tail: 0.2, tailA: 0.2, ears: 'flop', tusks: true, hump: true, snout: 0.45 },
  stag: { sh: 1.15, len: 1.2, w: 0.14, neckL: 0.55, neckA: 1.0, head: 0.4, legR: 0.04, bodyR: [0.2, 0.27], tail: 0.14, tailA: 0.6, ears: 'long', antlers: true, snout: 0.5 },
  drake: { sh: 1.0, len: 1.6, w: 0.2, neckL: 0.75, neckA: 0.75, head: 0.48, legR: 0.075, bodyR: [0.3, 0.34], tail: 1.6, tailA: 0.05, horns: true, wings: true, snout: 0.6, ridge: true },
};

function quadLayout(arch) {
  const q = QUAD[arch];
  const { sh, len: L, w } = q;
  const pel = [0, sh, -L * 0.42], spn = [0, sh + 0.02, -L * 0.05], chs = [0, sh + 0.03, L * 0.28];
  const nk = [0, sh + 0.06, L * 0.46];
  const hd = [0, nk[1] + S(q.neckA) * q.neckL, nk[2] + C(q.neckA) * q.neckL];
  const jaw = [0, hd[1] - q.head * 0.12, hd[2] + q.head * 0.15];
  const t1 = [0, sh - 0.02, -L * 0.56];
  const tdir = [0, S(q.tailA), -C(q.tailA)];
  const list = [
    { name: 'root', parent: null, pos: [0, 0, 0] }, { name: 'pelvis', parent: 'root', pos: pel }, { name: 'spine', parent: 'pelvis', pos: spn },
    { name: 'chest', parent: 'spine', pos: chs }, { name: 'neck', parent: 'chest', pos: nk }, { name: 'head', parent: 'neck', pos: hd }, { name: 'jaw', parent: 'head', pos: jaw },
    { name: 'tail1', parent: 'pelvis', pos: t1 }, { name: 'tail2', parent: 'tail1', pos: addv(t1, tdir, q.tail * 0.34) }, { name: 'tail3', parent: 'tail2', pos: addv(t1, tdir, q.tail * 0.68) },
  ];
  const legs = {};
  for (const [id, sx, front] of [['LF', -1, true], ['RF', 1, true], ['LH', -1, false], ['RH', 1, false]]) {
    const z = front ? chs[2] + 0.02 : pel[2] + 0.04;
    const top = [sx * w, sh - 0.06, z];
    const mid = front ? [sx * w * 1.05, sh * 0.52, z + 0.01] : [sx * w * 1.05, sh * 0.6, z + 0.12];
    const low = front ? [sx * w * 1.05, sh * 0.13, z - 0.01] : [sx * w * 1.05, sh * 0.26, z - 0.1];
    const tip = front ? [sx * w * 1.05, 0.0, z + 0.06] : [sx * w * 1.05, 0.0, z - 0.04];
    const par = front ? 'chest' : 'pelvis';
    list.push({ name: `up${id}`, parent: par, pos: top }, { name: `lo${id}`, parent: `up${id}`, pos: mid }, { name: `ft${id}`, parent: `lo${id}`, pos: low });
    legs[id] = [top, mid, low, tip];
  }
  if (q.wings) for (const sx of [-1, 1]) {
    const n = sx < 0 ? 'L' : 'R';
    list.push({ name: `wing${n}`, parent: 'chest', pos: [sx * w * 0.9, sh + q.bodyR[1] * 0.7, chs[2] - 0.05] });
    list.push({ name: `wtip${n}`, parent: `wing${n}`, pos: [sx * (w + 0.75), sh + q.bodyR[1] + 0.25, chs[2] - 0.2] });
  }
  const lay = genericLayout('quad', list, {
    'socket.head': { bone: 'head', off: [0, q.head * 0.4, 0] }, 'socket.back': { bone: 'spine', off: [0, q.bodyR[1], 0] }, 'socket.chest': { bone: 'chest', off: [0, 0, 0.1] },
    'socket.hand.R': { bone: 'jaw', off: [0, 0, q.head * 0.4] }, 'socket.hand.L': { bone: 'jaw', off: [0, 0, q.head * 0.4] },
  }, ARCH_H[arch]);
  lay.q = q; lay.legs = legs; lay.pts = { pel, spn, chs, nk, hd, jaw, t1, tdir };
  return lay;
}

function quadBuild(g, L, T) {
  const q = L.q, I = L.index, P = L.pts;
  const { sh, len: Ln } = q;
  // torso
  const bodyW = (x, y, z) => jointWeights(z, [I.pelvis, I.spine, I.chest, I.neck], [P.pel[2] + 0.25, P.chs[2] - 0.12, P.nk[2] + 0.02], [0.12, 0.14, 0.05]);
  const rings = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = lerp(P.t1[2] + 0.04, P.nk[2] + 0.06, t);
    const prof = S(clamp(t * 1.05) * PI) ** 0.55;
    const rib = smooth(0.35, 0.75, t) * (1 - smooth(0.85, 1, t));
    const ry = (q.bodyR[1] * (0.62 + 0.38 * prof) + rib * 0.04) * (i === 0 || i === n ? 0.65 : 1);
    const rx = q.bodyR[0] * (0.62 + 0.38 * prof) * (i === 0 || i === n ? 0.7 : 1);
    const cy = sh + 0.02 - rib * 0.04 + (q.hump ? smooth(0.5, 0.8, t) * 0.06 : 0);
    rings.push({ c: [0, cy, z], rx, rz: ry * (1 + (q.hump ? smooth(0.55, 0.85, t) * 0.25 : 0)), rzB: ry * 1.1, n: 2.2 });
  }
  const bodyCol = (x, y, z) => {
    const belly = smooth(sh + 0.05, sh - q.bodyR[1] * 0.7, y);
    let c = mix(T.body, T.sec, belly * 0.7);
    const stripe = S(z * 22 + x * 3) > 0.75 && y > sh ? 0.35 : 0;
    if (stripe) c = mix(c, T.accent, stripe);
    return c;
  };
  g.loft('cloth', rings, bodyW, bodyCol, { segs: 18, capStart: true, capEnd: true, ref: [0, 1, 0], vertical: false, grime: 0.14 });
  // neck
  const nkPts = [addv(P.chs, [0, 0.04, 0.06]), P.nk, lp(P.nk, P.hd, 0.5), P.hd];
  limb(g, 'cloth', nkPts, (t) => lerp(q.bodyR[1] * (q.wings ? 0.48 : 0.7), q.head * (q.wings ? 0.22 : 0.28), t), [I.chest, I.neck, I.neck], T.body, { segs: 14, caps: false, blend: 0.08, skin: pathWeights([P.chs, P.nk, P.hd, addv(P.hd, [0, 0, 0.3])], [I.chest, I.neck, I.head], 0.06) });
  // head + snout + jaw
  const hd = P.hd, H = q.head;
  const fwd = [0, -0.25, 1];
  const skull = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const c = addv(hd, fwd, H * (t * 1.05 - 0.15));
    const r = lerp(H * 0.32, H * 0.12 * (q.snout ?? 0.5) * 1.6, smooth(0.2, 1, t));
    skull.push({ c, rx: r * (q.tusks ? 1.15 : 0.9), rz: r * (t < 0.3 ? 1.05 : 0.8), rzB: r * 0.85 });
  }
  g.loft('cloth', skull, I.head, (x, y) => (y < hd[1] - H * 0.1 ? T.sec : T.body), { segs: 14, capStart: true, capEnd: true, vertical: false, ref: [1, 0, 0], grime: 0.12 });
  if (q.tusks) {
    g.blob('cloth', [H * 0.17, H * 0.14, H * 0.05], xf(addv(hd, fwd, H * 0.92)), I.head, shade(T.sec, 0.75), { stacks: 5, segs: 10 });
  }
  const jaw = [];
  for (let i = 0; i <= 4; i++) { const t = i / 4; jaw.push({ c: addv(addv(P.jaw, [0, -H * 0.04, 0]), [0, -0.12, 1], H * (t * 0.8 - 0.05)), rx: lerp(H * 0.2, H * 0.07, t), rz: lerp(H * 0.08, H * 0.03, t) }); }
  g.loft('cloth', jaw, I.jaw, T.sec, { segs: 10, capStart: true, capEnd: true, vertical: false, ref: [1, 0, 0] });
  // teeth / tusks
  if (q.tusks) for (const s of [-1, 1]) g.tube('enamel', [addv(P.jaw, [s * H * 0.14, 0, H * 0.45]), addv(P.jaw, [s * H * 0.24, H * 0.18, H * 0.58]), addv(P.jaw, [s * H * 0.2, H * 0.32, H * 0.5])], (t) => lerp(0.022, 0.004, t), I.jaw, '#e4dcc8', { segs: 6, caps: true });
  else for (const s of [-1, 1]) g.tube('enamel', [addv(P.jaw, [s * H * 0.08, H * 0.02, H * 0.55]), addv(P.jaw, [s * H * 0.08, H * 0.11, H * 0.6])], (t) => lerp(0.01, 0.002, t), I.jaw, '#e8e0d0', { segs: 5 });
  // eyes (glow)
  for (const s of [-1, 1]) g.blob('glow', [H * 0.06, H * 0.045, H * 0.04], xf(addv(hd, [s * H * 0.24, H * 0.1, H * 0.28])), I.head, T.glow, { stacks: 4, segs: 8, glow: 1.6, grime: 0 });
  // ears
  if (q.ears) for (const s of [-1, 1]) {
    const base = addv(hd, [s * H * 0.22, H * 0.25, -H * 0.05]);
    const tip = q.ears === 'flop' ? addv(base, [s * H * 0.3, -H * 0.05, H * 0.1]) : q.ears === 'long' ? addv(base, [s * H * 0.45, H * 0.15, -H * 0.05]) : addv(base, [s * H * 0.05, H * 0.4, -H * 0.08]);
    g.tube('cloth', [base, lp(base, tip, 0.5), tip], (t) => lerp(H * 0.1, 0.006, t), I.head, T.body, { segs: 6, flat: 0.35, caps: true });
  }
  // antlers
  if (q.antlers) for (const s of [-1, 1]) {
    const base = addv(hd, [s * H * 0.15, H * 0.3, -H * 0.05]);
    const pts = [base, addv(base, [s * 0.12, 0.25, -0.06]), addv(base, [s * 0.25, 0.5, -0.04]), addv(base, [s * 0.32, 0.72, 0.04])];
    g.tube('leather', pts, (t) => lerp(0.028, 0.008, t), I.head, mix(T.accent, '#d8ccb0', 0.4), { segs: 6, caps: true });
    for (const [i, d] of [[1, [s * 0.04, 0.16, 0.12]], [2, [s * 0.16, 0.14, 0.1]], [2, [-s * 0.02, 0.2, -0.08]], [3, [s * 0.1, 0.12, 0.08]]]) g.tube('leather', [pts[i], addv(pts[i], d)], (t) => lerp(0.016, 0.004, t), I.head, mix(T.accent, '#d8ccb0', 0.4), { segs: 5, caps: true });
  }
  if (q.horns) for (const s of [-1, 1]) {
    const base = addv(hd, [s * H * 0.2, H * 0.22, -H * 0.12]);
    g.tube('enamel', [base, addv(base, [s * 0.08, 0.1, -0.15]), addv(base, [s * 0.1, 0.12, -0.32])], (t) => lerp(0.04, 0.006, t), I.head, T.accent, { segs: 7, caps: true });
  }
  // legs
  for (const id of ['LF', 'RF', 'LH', 'RH']) {
    const [a, b, c, d] = L.legs[id];
    const bones = [I[`up${id}`], I[`lo${id}`], I[`ft${id}`]];
    const front = id.endsWith('F');
    const R0 = q.legR;
    limb(g, 'cloth', [addv(a, [0, 0.06, 0]), b, c, d], (t) => R0 * (t < 0.33 ? lerp(2.1, 1.1, t / 0.33) : t < 0.66 ? lerp(1.0, 0.75, (t - 0.33) / 0.33) : lerp(0.8, 0.9, (t - 0.66) / 0.34)) * (front ? 1 : 1.1),
      bones, (x, y) => (y < 0.12 ? T.dark : T.body), { segs: 10, skin: pathWeights([a, b, c, d], bones, 0.05) });
    g.blob('enamel', [R0 * 1.2, R0 * 0.8, R0 * 1.5], xf([d[0], R0 * 0.7, d[2] + R0 * 0.3]), bones[2], shade(T.dark, 0.7), { stacks: 4, segs: 8 });
  }
  // tail
  const tp = [P.t1, addv(P.t1, P.tdir, q.tail * 0.34), addv(P.t1, P.tdir, q.tail * 0.68), addv(P.t1, P.tdir, q.tail)];
  limb(g, 'cloth', tp, (t) => lerp(q.bodyR[0] * (q.wings ? 0.55 : 0.25), 0.01, t), [I.tail1, I.tail2, I.tail3], T.body, { segs: 10 });
  // spinal ridge / hump bristles
  if (q.ridge || q.hump) for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const z = lerp(P.pel[2] - 0.1, P.chs[2] + 0.1, t);
    const top = [0, sh + q.bodyR[1] * (q.hump ? 1.1 : 0.95) + (q.hump ? smooth(0.5, 0.85, t) * 0.07 : 0), z];
    g.box('enamel', [0.025, (q.hump ? 0.12 : 0.14) * (0.6 + 0.4 * S(t * PI)), 0.08], xf(top, [-0.4, 0, 0]), bodyW, T.accent, { round: 0.3, taper: 0.15 });
  }
  if (q.wings) for (const sx of [-1, 1]) {
    const n = sx < 0 ? 'L' : 'R';
    const root = L.at(`wing${n}`), tip = L.at(`wtip${n}`);
    const wb = [I[`wing${n}`], I[`wtip${n}`]];
    const wW = pathWeights([root, tip, addv(tip, sub(tip, root), 0.6)], wb, 0.1);
    limb(g, 'leather', [root, tip, addv(tip, sub(tip, root), 0.55)], (t) => lerp(0.05, 0.012, t), wb, T.accent, { segs: 7, skin: wW });
    // membrane: fan of triangles from the arm to the body side
    const far = addv(tip, sub(tip, root), 0.55);
    const fingers = [far, addv(tip, [sx * 0.25, -0.45, -0.45]), addv(tip, [sx * 0.0, -0.6, -0.55]), addv(root, [sx * 0.15, -0.25, -0.75])];
    const pos = [], idx = [];
    pos.push(...root, ...tip);
    for (const f of fingers) pos.push(...f);
    for (let i = 0; i < fingers.length - 1; i++) { idx.push(1, 2 + i, 2 + i + 1); }
    idx.push(0, 1, 2 + fingers.length - 1);
    g.push('cloth', pos, idx, wW, mix(T.body, T.accent, 0.3), { grime: 0.18 });
    for (const f of fingers.slice(1, 3)) limb(g, 'leather', [tip, f], 0.012, [wb[1]], T.accent, { segs: 5, sub: 2, skin: wb[1] });
  }
}

function quadPose(p, A, I, q) {
  const { ph, t, run, act, ak, dead } = A;
  const a = ph * TAU;
  const amp = lerp(0.35, 0.75, run), knee = lerp(0.55, 1.1, run);
  const offs = run > 0.5 ? { LF: 0, RH: 0.08, RF: 0.5, LH: 0.58 } : { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 };
  const moving = A.sp > 0.15 ? Math.min(1, A.sp / 1.2) : 0;
  for (const id of ['LF', 'RF', 'LH', 'RH']) {
    const ao = a + offs[id] * TAU, c = C(ao);
    const swing = Math.max(0, S(ao - PI)) * moving;
    const front = id.endsWith('F');
    p.set(I[`up${id}`], -amp * c * moving, 0, 0);
    p.set(I[`lo${id}`], front ? knee * swing : -knee * 0.6 * swing, 0, 0);
    p.set(I[`ft${id}`], front ? amp * c * moving * 0.5 + knee * 0.4 * swing : knee * 0.9 * swing + amp * c * moving * 0.4, 0, 0);
  }
  const br = S(t * 2.2);
  p.set(I.spine, 0.02 * br + C(a * 2) * 0.03 * run * moving, 0, 0);
  p.set(I.chest, -0.02 * br, 0, 0);
  p.set(I.neck, -0.05 * moving * run + 0.06 * S(t * 0.7) * (1 - moving), 0.15 * S(t * 0.37) * (1 - moving), 0);
  p.set(I.head, 0.04 * C(a * 2) * moving, 0.1 * S(t * 0.5) * (1 - moving), 0);
  p.set(I.tail1, 0.15 + 0.1 * moving * run, 0.25 * S(t * 2.4 + a), 0);
  p.set(I.tail2, 0.05, 0.25 * S(t * 2.4 + a - 0.8), 0);
  p.set(I.tail3, 0.05, 0.25 * S(t * 2.4 + a - 1.6), 0);
  p.set(I.jaw, 0.04 + 0.03 * S(t * 3) * run, 0, 0);
  p.h[1] = -Math.abs(S(a)) * 0.03 * moving * (1 + run);
  if (I.wingL !== undefined) {
    const flap = run > 0.5 ? S(t * 9) * 0.6 * run : 0;
    const fold = 1 - Math.max(run, act ? 0.8 : 0);
    p.set(I.wingL, 0, 0.5 * fold, -0.35 * fold - flap); p.set(I.wingR, 0, -0.5 * fold, 0.35 * fold + flap);
    p.set(I.wtipL, 0, 0.6 * fold, -0.4 * fold - flap * 0.5); p.set(I.wtipR, 0, -0.6 * fold, 0.4 * fold + flap * 0.5);
  }
  if (act === 'attack') {
    const wind = kf(ak, [0, 0, 0.35, 1, 0.5, 0, 1, 0]);
    const str = kf(ak, [0.3, 0, 0.5, 1, 0.75, 0.6, 1, 0]);
    const ram = q.tusks || q.antlers;
    p.add(I.pelvis, -0.08 * wind + 0.1 * str, 0, 0);
    p.add(I.spine, -0.06 * wind, 0, 0);
    p.add(I.neck, (ram ? 0.3 : -0.3) * wind + (ram ? 0.55 : 0.35) * str, 0, 0);
    p.add(I.head, (ram ? 0.25 : -0.2) * wind + (ram ? 0.3 : 0.1) * str, 0, 0);
    p.add(I.jaw, ram ? 0.1 * str : 0.7 * wind * 1.2 + 0.1 * (1 - str), 0, 0);
    p.add(I.upLH, 0.3 * wind - 0.2 * str, 0, 0); p.add(I.upRH, 0.3 * wind - 0.2 * str, 0, 0);
    p.add(I.upLF, -0.3 * str, 0, 0); p.add(I.upRF, -0.4 * str, 0, 0);
    p.h[1] += -0.06 * wind; p.h[2] = 0.18 * str;
    if (I.wingL !== undefined) { p.add(I.wingL, 0, 0, -0.5 * str); p.add(I.wingR, 0, 0, 0.5 * str); }
  } else if (act === 'roar') {
    const r = kf(ak, [0, 0, 0.3, 1, 0.8, 1, 1, 0]);
    p.add(I.neck, -0.5 * r, 0, 0); p.add(I.head, -0.3 * r, 0, 0); p.add(I.jaw, 0.8 * r, 0, 0);
  }
  if (A.hit > 0) { const h = A.hit; p.add(I.spine, 0, 0.15 * h, 0.1 * h); p.add(I.neck, -0.3 * h, 0.2 * h, 0); }
  if (dead > 0) {
    const d = dead;
    p.add(I.pelvis, 0, 0, 1.45 * d);
    for (const id of ['LF', 'RF', 'LH', 'RH']) { p.set(I[`up${id}`], 0.2 * d * (id.endsWith('F') ? -1 : 1), 0, 0); p.set(I[`lo${id}`], 0.3 * d, 0, 0); }
    p.set(I.neck, 0.3 * d, 0, -0.4 * d); p.set(I.jaw, 0.25 * d, 0, 0);
    p.h[1] = -q.sh * 0.72 * d; p.h[0] = 0.0;
  }
}

// ======================================================= RAPTOR (biped)
function raptorLayout() {
  const hip = [0, 1.02, -0.05];
  const list = [
    { name: 'root', parent: null, pos: [0, 0, 0] }, { name: 'pelvis', parent: 'root', pos: hip },
    { name: 'spine', parent: 'pelvis', pos: [0, 1.08, 0.22] }, { name: 'chest', parent: 'spine', pos: [0, 1.12, 0.45] },
    { name: 'neck', parent: 'chest', pos: [0, 1.2, 0.62] }, { name: 'head', parent: 'neck', pos: [0, 1.62, 0.8] }, { name: 'jaw', parent: 'head', pos: [0, 1.6, 0.86] },
    { name: 'tail1', parent: 'pelvis', pos: [0, 1.02, -0.3] }, { name: 'tail2', parent: 'tail1', pos: [0, 1.0, -0.72] }, { name: 'tail3', parent: 'tail2', pos: [0, 0.96, -1.15] }, { name: 'tail4', parent: 'tail3', pos: [0, 0.92, -1.55] },
  ];
  for (const sx of [-1, 1]) {
    const n = sx < 0 ? 'L' : 'R';
    list.push({ name: `thigh${n}`, parent: 'pelvis', pos: [sx * 0.15, 0.98, -0.02] }, { name: `shin${n}`, parent: `thigh${n}`, pos: [sx * 0.17, 0.62, 0.16] },
      { name: `foot${n}`, parent: `shin${n}`, pos: [sx * 0.17, 0.2, -0.08] }, { name: `toe${n}`, parent: `foot${n}`, pos: [sx * 0.17, 0.03, 0.05] },
      { name: `arm${n}`, parent: 'chest', pos: [sx * 0.12, 1.02, 0.55] }, { name: `hand${n}`, parent: `arm${n}`, pos: [sx * 0.14, 0.88, 0.66] });
  }
  return genericLayout('raptor', list, { 'socket.head': { bone: 'head', off: [0, 0.1, 0] }, 'socket.back': { bone: 'spine', off: [0, 0.2, 0] }, 'socket.chest': { bone: 'chest', off: [0, 0, 0.1] }, 'socket.hand.R': { bone: 'handR', off: [0, 0, 0] }, 'socket.hand.L': { bone: 'handL', off: [0, 0, 0] } }, ARCH_H.raptor);
}
function raptorBuild(g, L, T) {
  const I = L.index, at = L.at;
  const spinePts = [at('tail4'), at('tail3'), at('tail2'), at('tail1'), at('pelvis'), at('spine'), at('chest'), at('neck'), at('head')];
  const bones = [I.tail3, I.tail2, I.tail1, I.pelvis, I.pelvis, I.spine, I.chest, I.neck];
  const radius = (t) => {
    const r = [0.012, 0.04, 0.08, 0.15, 0.2, 0.21, 0.19, 0.09, 0.07];
    const f = t * (r.length - 1), i = Math.min(r.length - 2, Math.floor(f));
    return lerp(r[i], r[i + 1], f - i);
  };
  const W = pathWeights(spinePts, bones, 0.08);
  const col = (x, y, z) => mix(mix(T.body, T.sec, smooth(1.02, 0.86, y)), T.accent, S(z * 14) > 0.7 && y > 1.05 ? 0.4 : 0);
  limb(g, 'cloth', spinePts, radius, bones, col, { segs: 14, sub: 3, skin: W, caps: true });
  // head
  const hd = at('head');
  g.loft('cloth', [{ c: addv(hd, [0, 0.0, -0.06]), rx: 0.075, rz: 0.08 }, { c: addv(hd, [0, -0.01, 0.06]), rx: 0.07, rz: 0.065 }, { c: addv(hd, [0, -0.03, 0.22]), rx: 0.045, rz: 0.04 }, { c: addv(hd, [0, -0.04, 0.3]), rx: 0.02, rz: 0.02 }],
    I.head, T.body, { segs: 12, capStart: true, capEnd: true, vertical: false, ref: [1, 0, 0] });
  g.loft('cloth', [{ c: addv(at('jaw'), [0, -0.03, -0.04]), rx: 0.055, rz: 0.03 }, { c: addv(at('jaw'), [0, -0.05, 0.2]), rx: 0.025, rz: 0.015 }], I.jaw, T.sec, { segs: 10, capStart: true, capEnd: true, vertical: false, ref: [1, 0, 0] });
  for (const s of [-1, 1]) g.blob('glow', [0.014, 0.012, 0.012], xf(addv(hd, [s * 0.06, 0.03, 0.06])), I.head, T.glow, { stacks: 4, segs: 6, glow: 1.6, grime: 0 });
  for (let i = 0; i < 7; i++) { const t = i / 6; const p = lp(at('neck'), at('tail2'), t); g.box('enamel', [0.02, 0.09 * S(t * PI + 0.3), 0.07], xf(addv(p, [0, radius(0.5) * 0.9 + 0.04, 0]), [-0.4, 0, 0]), W, T.accent, { round: 0.3, taper: 0.2 }); }
  for (const sx of [-1, 1]) {
    const n = sx < 0 ? 'L' : 'R';
    const pts = [at(`thigh${n}`), at(`shin${n}`), at(`foot${n}`), at(`toe${n}`), addv(at(`toe${n}`), [0, -0.02, 0.16])];
    const lb = [I[`thigh${n}`], I[`shin${n}`], I[`foot${n}`], I[`toe${n}`]];
    limb(g, 'cloth', pts, (t) => (t < 0.25 ? lerp(0.12, 0.07, t / 0.25) : lerp(0.05, 0.025, (t - 0.25) / 0.75)), lb, (x, y) => (y < 0.25 ? T.dark : T.body), { segs: 10, skin: pathWeights(pts, lb, 0.04) });
    g.tube('enamel', [addv(at(`toe${n}`), [0, 0.04, 0.03]), addv(at(`toe${n}`), [0, 0.1, 0.1]), addv(at(`toe${n}`), [0, 0.06, 0.15])], (t) => lerp(0.015, 0.003, t), I[`toe${n}`], '#d8d0c0', { segs: 5 });
    const ap = [at(`arm${n}`), at(`hand${n}`), addv(at(`hand${n}`), [0, -0.06, 0.08])];
    limb(g, 'cloth', ap, (t) => lerp(0.035, 0.012, t), [I[`arm${n}`], I[`hand${n}`]], T.body, { segs: 7 });
  }
}
function raptorPose(p, A, I) {
  const { ph, t, run, act, ak, dead } = A;
  const a = ph * TAU, moving = A.sp > 0.15 ? Math.min(1, A.sp / 1.2) : 0;
  const amp = lerp(0.45, 0.85, run) * moving;
  for (const [n, o] of [['L', 0], ['R', PI]]) {
    const c = C(a + o), sw = Math.max(0, S(a + o - PI)) * moving;
    p.set(I[`thigh${n}`], -amp * c - 0.1, 0, 0);
    p.set(I[`shin${n}`], -0.2 - lerp(0.5, 1.1, run) * sw, 0, 0);
    p.set(I[`foot${n}`], 0.25 + lerp(0.5, 1.0, run) * sw + amp * c * 0.3, 0, 0);
    p.set(I[`toe${n}`], -0.3 * sw, 0, 0);
    p.set(I[`arm${n}`], 0.6 + 0.1 * S(t * 2), 0, 0);
    p.set(I[`hand${n}`], -0.8, 0, 0);
  }
  p.set(I.pelvis, 0.03 * C(a * 2) * moving, 0.08 * C(a) * moving, 0);
  p.set(I.spine, 0.02 * S(t * 2), 0, 0);
  p.set(I.neck, 0.1 * moving * run - 0.05, 0.12 * S(t * 0.5) * (1 - moving), 0);
  p.set(I.head, -0.03 * C(a * 2) * moving, 0.15 * S(t * 0.33) * (1 - moving), 0);
  p.set(I.jaw, 0.05 + 0.04 * S(t * 2.5), 0, 0);
  for (const [n, k] of [['tail1', 0], ['tail2', 0.6], ['tail3', 1.2], ['tail4', 1.8]]) p.set(I[n], 0.02 * C(a * 2) * moving, 0.12 * S(t * 2 + a - k) * (0.4 + moving * 0.6), 0);
  p.h[1] = -Math.abs(S(a)) * 0.05 * moving * (1 + run);
  if (act === 'attack') {
    const wind = kf(ak, [0, 0, 0.35, 1, 0.5, 0, 1, 0]), str = kf(ak, [0.3, 0, 0.5, 1, 0.75, 0.5, 1, 0]);
    p.add(I.pelvis, -0.15 * wind + 0.2 * str, 0, 0); p.add(I.neck, -0.4 * wind + 0.5 * str, 0, 0); p.add(I.head, 0.2 * str, 0, 0); p.add(I.jaw, 0.6 * wind, 0, 0);
    p.add(I.thighR, -0.7 * str, 0, 0); p.add(I.shinR, -0.3 * str, 0, 0); p.h[2] = 0.25 * str;
  }
  if (A.hit > 0) { p.add(I.spine, 0, 0.2 * A.hit, 0); p.add(I.neck, -0.3 * A.hit, 0, 0); }
  if (dead > 0) { p.add(I.pelvis, 0, 0, 1.4 * dead); p.add(I.neck, 0.3 * dead, 0, -0.5 * dead); p.set(I.thighL, -0.4 * dead, 0, 0); p.set(I.thighR, -0.2 * dead, 0, 0); p.h[1] = -0.82 * dead; }
}

// ======================================================= SPIDER
function spiderLayout() {
  const list = [{ name: 'root', parent: null, pos: [0, 0, 0] }, { name: 'body', parent: 'root', pos: [0, 0.62, 0.1] }, { name: 'abdomen', parent: 'body', pos: [0, 0.7, -0.22] }, { name: 'fangs', parent: 'body', pos: [0, 0.56, 0.42] }];
  const legs = [];
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) {
    const n = `${sx < 0 ? 'L' : 'R'}${i}`;
    const ang = lerp(0.55, -0.85, i / 3); // forward → back
    const dir = [sx * C(ang), 0, S(ang)];
    const base = [sx * 0.14, 0.62, 0.12 + S(ang) * 0.1];
    const knee = addv(addv(base, dir, 0.42), [0, 0.38, 0]);
    const ankle = addv(addv(base, dir, 0.85), [0, 0.1, 0]);
    const tip = addv(addv(base, dir, 1.05), [0, -0.62, 0]);
    list.push({ name: `f${n}`, parent: 'body', pos: base }, { name: `t${n}`, parent: `f${n}`, pos: knee }, { name: `s${n}`, parent: `t${n}`, pos: ankle });
    legs.push({ n, sx, i, pts: [base, knee, ankle, tip] });
  }
  const L = genericLayout('spider', list, { 'socket.head': { bone: 'body', off: [0, 0.2, 0.3] }, 'socket.back': { bone: 'abdomen', off: [0, 0.3, 0] }, 'socket.chest': { bone: 'body', off: [0, 0, 0.2] }, 'socket.hand.R': { bone: 'fangs', off: [0, 0, 0] }, 'socket.hand.L': { bone: 'fangs', off: [0, 0, 0] } }, ARCH_H.spider);
  L.spLegs = legs;
  return L;
}
function spiderBuild(g, L, T) {
  const I = L.index;
  g.blob('cloth', [0.22, 0.15, 0.28], xf([0, 0.64, 0.14]), I.body, (x, y) => mix(T.body, T.dark, smooth(0.66, 0.5, y)), { stacks: 8, segs: 14 });
  g.blob('cloth', [0.36, 0.32, 0.46], xf([0, 0.78, -0.42], [-0.25, 0, 0]), I.abdomen, (x, y, z) => {
    const mark = Math.abs(x) < 0.08 + 0.05 * S(z * 18) && y > 0.85 ? 0.8 : 0;
    return mix(mix(T.body, T.sec, smooth(0.8, 0.55, y) * 0.4), T.accent, mark);
  }, { stacks: 10, segs: 16 });
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) g.blob('glow', [0.02, 0.02, 0.02], xf([s * (0.04 + i * 0.025), 0.72 + (i % 2) * 0.02, 0.38 - i * 0.02]), I.body, T.glow, { stacks: 3, segs: 6, glow: 1.7, grime: 0 });
  for (const s of [-1, 1]) g.tube('enamel', [[s * 0.05, 0.58, 0.38], [s * 0.06, 0.5, 0.46], [s * 0.03, 0.42, 0.44]], (t) => lerp(0.025, 0.004, t), I.fangs, T.accent, { segs: 6, caps: true });
  for (const leg of L.spLegs) {
    const b = [I[`f${leg.n}`], I[`t${leg.n}`], I[`s${leg.n}`]];
    limb(g, 'cloth', leg.pts, (t) => (t < 0.33 ? lerp(0.045, 0.035, t / 0.33) : lerp(0.032, 0.008, (t - 0.33) / 0.67)), b, (x, y) => (y > 0.7 ? T.body : mix(T.body, T.accent, 0.25)), { segs: 7, skin: pathWeights(leg.pts, b, 0.04) });
    g.blob('enamel', [0.045, 0.045, 0.045], xf(leg.pts[1]), b[1], T.accent, { stacks: 4, segs: 8 });
  }
}
function spiderPose(p, A, I, L) {
  const { ph, t, run, act, ak, dead } = A;
  const moving = A.sp > 0.15 ? Math.min(1, A.sp / 1.0) : 0;
  for (const leg of L.spLegs) {
    const grp = (leg.i + (leg.sx > 0 ? 1 : 0)) % 2;
    const a = (ph * 2 + grp * 0.5) * TAU;
    const lift = Math.max(0, S(a)) * moving;
    const swing = C(a) * 0.3 * moving;
    p.set(I[`f${leg.n}`], 0, swing * leg.sx, leg.sx * (-0.35 * lift + 0.04 * S(t * 2 + leg.i)));
    p.set(I[`t${leg.n}`], 0, 0, leg.sx * 0.2 * lift);
    p.set(I[`s${leg.n}`], 0, 0, 0);
  }
  p.set(I.abdomen, 0.05 * S(t * 1.6), 0.06 * S(t * 0.9), 0);
  p.set(I.fangs, 0.1 * S(t * 4), 0, 0);
  p.h[1] = 0.02 * S(ph * 4 * TAU) * moving;
  if (act === 'attack') {
    const r = kf(ak, [0, 0, 0.35, 1, 0.55, 0.3, 1, 0]), str = kf(ak, [0.3, 0, 0.5, 1, 0.7, 0, 1, 0]);
    p.add(I.body, -0.45 * r + 0.3 * str, 0, 0);
    for (const n of ['L0', 'R0', 'L1', 'R1']) p.add(I[`f${n}`], 0, 0, (n[0] === 'L' ? -1 : 1) * -0.7 * r);
    p.add(I.fangs, 0.6 * str, 0, 0); p.h[2] = 0.2 * str;
  }
  if (A.hit > 0) p.add(I.body, -0.2 * A.hit, 0.2 * A.hit, 0);
  if (dead > 0) {
    p.add(I.body, 0, 0, PI * dead * 0.95);
    for (const leg of L.spLegs) { p.set(I[`f${leg.n}`], 0, 0, leg.sx * 0.6 * dead); p.set(I[`t${leg.n}`], 0, 0, leg.sx * 1.2 * dead); }
    p.h[1] = -0.3 * dead;
  }
}

// ======================================================= SERPENT
const SEG = 14;
function serpentLayout() {
  const list = [{ name: 'root', parent: null, pos: [0, 0, 0] }];
  for (let i = 0; i < SEG; i++) list.push({ name: `s${i}`, parent: i === 0 ? 'root' : `s${i - 1}`, pos: [0, 0.18, 0.9 - i * 0.24] });
  list.push({ name: 'head', parent: 's0', pos: [0, 0.2, 1.05] }, { name: 'jaw', parent: 'head', pos: [0, 0.17, 1.1] });
  return genericLayout('serpent', list, { 'socket.head': { bone: 'head', off: [0, 0.12, 0] }, 'socket.back': { bone: 's4', off: [0, 0.2, 0] }, 'socket.chest': { bone: 's1', off: [0, 0.1, 0] }, 'socket.hand.R': { bone: 'jaw', off: [0, 0, 0.1] }, 'socket.hand.L': { bone: 'jaw', off: [0, 0, 0.1] } }, ARCH_H.serpent);
}
function serpentBuild(g, L, T) {
  const I = L.index;
  const pts = []; const bones = [];
  pts.push(L.at('head'));
  for (let i = 0; i < SEG; i++) { pts.push(L.at(`s${i}`)); if (i > 0) bones.push(I[`s${i - 1}`]); }
  pts.push(addv(L.at(`s${SEG - 1}`), [0, 0, -0.3]));
  bones.unshift(I.head); bones.push(I[`s${SEG - 1}`]);
  const W = pathWeights(pts, bones, 0.08);
  const radius = (t) => (t < 0.06 ? lerp(0.1, 0.17, t / 0.06) : t < 0.3 ? 0.17 : lerp(0.17, 0.015, ((t - 0.3) / 0.7) ** 1.3));
  const col = (x, y, z) => {
    const belly = smooth(0.17, 0.06, y);
    const band = S(z * 9) > 0.6 ? 0.55 : S(x * 30 + z * 20) > 0.92 ? 0.3 : 0;
    return mix(mix(T.body, T.accent, band), T.sec, belly * 0.85);
  };
  limb(g, 'cloth', pts, radius, bones, col, { segs: 14, sub: 2, skin: W, caps: true, flat: 0.8 });
  const hd = L.at('head');
  g.loft('cloth', [{ c: addv(hd, [0, 0.02, -0.08]), rx: 0.12, rz: 0.08 }, { c: addv(hd, [0, 0.02, 0.06]), rx: 0.13, rz: 0.07 }, { c: addv(hd, [0, 0.0, 0.2]), rx: 0.07, rz: 0.04 }, { c: addv(hd, [0, -0.01, 0.26]), rx: 0.02, rz: 0.015 }],
    I.head, T.body, { segs: 12, capStart: true, capEnd: true, vertical: false, ref: [1, 0, 0] });
  g.loft('cloth', [{ c: addv(L.at('jaw'), [0, -0.03, -0.08]), rx: 0.1, rz: 0.03 }, { c: addv(L.at('jaw'), [0, -0.03, 0.16]), rx: 0.04, rz: 0.015 }], I.jaw, T.sec, { segs: 10, capStart: true, capEnd: true, vertical: false, ref: [1, 0, 0] });
  for (const s of [-1, 1]) {
    g.blob('glow', [0.02, 0.016, 0.022], xf(addv(hd, [s * 0.08, 0.05, 0.05])), I.head, T.glow, { stacks: 4, segs: 6, glow: 1.7, grime: 0 });
    g.tube('enamel', [addv(hd, [s * 0.04, -0.02, 0.18]), addv(hd, [s * 0.04, -0.07, 0.2])], (t) => lerp(0.01, 0.002, t), I.head, '#e8e0d0', { segs: 5 });
    // hood frills
    g.box('cloth', [0.22, 0.2, 0.012], xf(addv(L.at('s1'), [s * 0.13, 0.05, 0.05]), [0.2, -s * 0.5, s * 0.25]), I.s1, mix(T.body, T.accent, 0.5), { round: 0.25, bend: 0.3 });
  }
}
function serpentPose(p, A, I) {
  const { ph, t, run, act, ak, dead } = A;
  const moving = A.sp > 0.1 ? Math.min(1, A.sp / 1.0) : 0;
  const amp = 0.18 + 0.12 * run;
  const travel = ph * TAU;
  // raised front (cobra posture), slither wave travels back
  const raise = (1 - dead) * (0.75 - 0.35 * moving);
  for (let i = 0; i < SEG; i++) {
    const wave = S(travel * 1 - i * 0.7 + t * (moving ? 0 : 0.8)) * (moving ? amp : 0.05);
    const rx = i === 0 ? -raise * 0.9 : i === 1 ? -raise * 0.4 : i === 2 ? raise * 0.7 : i === 3 ? raise * 0.5 : 0;
    p.set(I[`s${i}`], rx, wave, 0);
  }
  p.set(I.head, raise * 0.6 + 0.05 * S(t * 1.3), 0.08 * S(t * 0.7), 0);
  p.set(I.jaw, 0.05 + 0.03 * S(t * 3), 0, 0);
  p.h[1] = raise * 0.05;
  if (act === 'attack') {
    const wind = kf(ak, [0, 0, 0.35, 1, 0.48, 0, 1, 0]), str = kf(ak, [0.3, 0, 0.48, 1, 0.75, 0.4, 1, 0]);
    p.add(I.s0, -0.35 * wind + 0.55 * str, 0, 0); p.add(I.s1, -0.2 * wind + 0.2 * str, 0, 0); p.add(I.head, 0.2 * wind - 0.25 * str, 0, 0);
    p.add(I.jaw, 0.9 * wind + 0.3 * str * (1 - str), 0, 0); p.h[2] = 0.35 * str;
  }
  if (A.hit > 0) p.add(I.s0, -0.2 * A.hit, 0.3 * A.hit, 0);
  if (dead > 0) { p.add(I.s0, 0, 0, 1.3 * dead); p.add(I.head, 0.3 * dead, 0, 0); p.h[1] = -0.05 * dead; }
}

// ======================================================= WRAITH (hover)
function wraithLayout() {
  const list = [
    { name: 'root', parent: null, pos: [0, 0, 0] }, { name: 'body', parent: 'root', pos: [0, 1.1, 0] }, { name: 'chest', parent: 'body', pos: [0, 1.6, 0] },
    { name: 'neck', parent: 'chest', pos: [0, 1.95, 0.02] }, { name: 'head', parent: 'neck', pos: [0, 2.05, 0.04] },
    { name: 'robe1', parent: 'body', pos: [0, 1.0, -0.05] }, { name: 'robe2', parent: 'robe1', pos: [0, 0.65, -0.08] }, { name: 'robe3', parent: 'robe2', pos: [0, 0.3, -0.1] },
  ];
  for (const sx of [-1, 1]) { const n = sx < 0 ? 'L' : 'R'; list.push({ name: `ua${n}`, parent: 'chest', pos: [sx * 0.26, 1.86, 0] }, { name: `fa${n}`, parent: `ua${n}`, pos: [sx * 0.34, 1.5, 0.04] }, { name: `hand${n}`, parent: `fa${n}`, pos: [sx * 0.38, 1.12, 0.1] }); }
  return genericLayout('wraith', list, { 'socket.head': { bone: 'head', off: [0, 0.2, 0] }, 'socket.back': { bone: 'chest', off: [0, 0.1, -0.2] }, 'socket.chest': { bone: 'chest', off: [0, 0, 0.2] }, 'socket.hand.R': { bone: 'handR', off: [0, -0.1, 0] }, 'socket.hand.L': { bone: 'handL', off: [0, -0.1, 0] } }, ARCH_H.wraith);
}
function wraithBuild(g, L, T) {
  const I = L.index;
  const W = (x, y, z) => {
    const base = jointWeights(y, [I.robe3, I.robe2, I.robe1, I.body, I.chest, I.neck], [0.45, 0.82, 1.05, 1.4, 1.95], [0.15, 0.15, 0.1, 0.12, 0.05]);
    return base;
  };
  const rings = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, y = lerp(0.12, 2.0, t);
    const r = lerp(0.42, 0.2, smooth(0, 0.7, t)) * (t > 0.85 ? lerp(1, 0.6, (t - 0.85) / 0.15) : 1) + (t > 0.62 && t < 0.85 ? 0.05 : 0);
    rings.push({ c: [0, y, -0.02 * t], rx: r, rz: r * 0.85, n: 2, dy: i === 0 ? (a) => S(a * 7) * 0.08 + S(a * 13) * 0.05 : null });
  }
  g.loft('cloth', rings, W, (x, y) => mix(T.body, shade(T.body, 0.5), smooth(1.0, 0.1, y)), { segs: 22, grime: 0.18, ao: (x, y) => 0.6 + 0.4 * smooth(0.1, 1.0, y) });
  // hood with void face
  const hd = L.at('head');
  g.loft('cloth', [{ c: addv(hd, [0, -0.12, -0.02]), rx: 0.2, rz: 0.2 }, { c: addv(hd, [0, 0.05, -0.02]), rx: 0.17, rz: 0.19 }, { c: addv(hd, [0, 0.2, -0.06]), rx: 0.12, rz: 0.12 }, { c: addv(hd, [0, 0.3, -0.14]), rx: 0.02, rz: 0.03 }],
    (x, y) => jointWeights(y, [I.neck, I.head], [1.95], [0.04]), T.body, { segs: 16, arc: [PI / 2 + 0.7, PI / 2 + TAU - 0.7], grime: 0.15 });
  g.blob('hair', [0.13, 0.15, 0.12], xf(addv(hd, [0, 0.04, 0.0])), I.head, '#050506', { stacks: 6, segs: 10, grime: 0 });
  for (const s of [-1, 1]) g.blob('glow', [0.025, 0.012, 0.01], xf(addv(hd, [s * 0.05, 0.06, 0.12])), I.head, T.glow, { stacks: 3, segs: 6, glow: 2, grime: 0 });
  for (const sx of [-1, 1]) {
    const n = sx < 0 ? 'L' : 'R';
    const pts = [L.at(`ua${n}`), L.at(`fa${n}`), L.at(`hand${n}`)];
    const b = [I[`ua${n}`], I[`fa${n}`]];
    limb(g, 'cloth', pts, (t) => lerp(0.09, 0.07, t) + (t > 0.7 ? (t - 0.7) * 0.25 : 0), b, T.body, { segs: 10, caps: false, skin: pathWeights(pts, b, 0.06) });
    const h = L.at(`hand${n}`);
    for (let f = 0; f < 4; f++) g.tube('enamel', [addv(h, [sx * 0.0, -0.02, (f - 1.5) * 0.025]), addv(h, [sx * 0.04, -0.14, (f - 1.5) * 0.04]), addv(h, [sx * 0.02, -0.24, (f - 1.5) * 0.05 + 0.04])], (t) => lerp(0.012, 0.002, t), I[`hand${n}`], T.accent, { segs: 4 });
  }
  g.lathe('metal', [[0.16, 0], [0.18, 0.02], [0.16, 0.04]], xf([0, 1.72, 0]), I.chest, T.accent, { segs: 18 });
}
function wraithPose(p, A, I) {
  const { t, sp, act, ak, dead } = A;
  const lean = Math.min(1, sp / 5);
  p.set(I.body, 0.25 * lean + 0.03 * S(t * 1.1), 0.05 * S(t * 0.6), 0.04 * S(t * 0.8));
  p.set(I.chest, 0.05 * S(t * 1.3), 0, 0);
  p.set(I.robe1, 0.2 * lean + 0.06 * S(t * 1.7), 0.05 * S(t * 1.1), 0.05 * S(t * 1.3));
  p.set(I.robe2, 0.2 * lean + 0.08 * S(t * 1.7 - 0.7), 0, 0.06 * S(t * 1.3 - 0.6));
  p.set(I.robe3, 0.2 * lean + 0.1 * S(t * 1.7 - 1.4), 0, 0.07 * S(t * 1.3 - 1.2));
  p.set(I.neck, 0.1 * S(t * 0.5), 0.2 * S(t * 0.3), 0);
  for (const [n, s] of [['L', -1], ['R', 1]]) {
    p.set(I[`ua${n}`], 0.5 * lean - 0.25 + 0.15 * S(t * 1.2 + s), 0, s * (0.15 + 0.1 * S(t * 0.9)));
    p.set(I[`fa${n}`], -0.4 - 0.2 * S(t * 1.5 + s), 0, 0);
  }
  p.h[1] = 0.35 + 0.08 * S(t * 1.6);
  if (act === 'attack') {
    const wind = kf(ak, [0, 0, 0.35, 1, 0.5, 0, 1, 0]), str = kf(ak, [0.3, 0, 0.5, 1, 0.75, 0.5, 1, 0]);
    p.add(I.body, -0.2 * wind + 0.45 * str, 0, 0);
    p.add(I.uaL, -2.2 * wind - 0.6 * str, 0, -0.4 * wind); p.add(I.uaR, -2.2 * wind - 0.6 * str, 0, 0.4 * wind);
    p.h[2] = 0.4 * str;
  } else if (act === 'roar') { const r = kf(ak, [0, 0, 0.3, 1, 0.8, 1, 1, 0]); p.add(I.uaL, -1.2 * r, 0, -0.8 * r); p.add(I.uaR, -1.2 * r, 0, 0.8 * r); p.add(I.neck, -0.4 * r, 0, 0); }
  if (A.hit > 0) p.add(I.body, -0.3 * A.hit, 0.2 * A.hit, 0);
  if (dead > 0) { p.add(I.body, 0.6 * dead, 0, 0); p.h[1] = 0.35 - 1.0 * dead; }
}

// ======================================================= WISP (hover)
function wispLayout() {
  const list = [{ name: 'root', parent: null, pos: [0, 0, 0] }, { name: 'core', parent: 'root', pos: [0, 1.0, 0] }, { name: 'ring1', parent: 'core', pos: [0, 1.0, 0] }, { name: 'ring2', parent: 'core', pos: [0, 1.0, 0] }, { name: 'ring3', parent: 'core', pos: [0, 1.0, 0] }];
  return genericLayout('wisp', list, { 'socket.head': { bone: 'core', off: [0, 0.4, 0] }, 'socket.back': { bone: 'core', off: [0, 0, 0] }, 'socket.chest': { bone: 'core', off: [0, 0, 0] }, 'socket.hand.R': { bone: 'core', off: [0, 0, 0.3] }, 'socket.hand.L': { bone: 'core', off: [0, 0, 0.3] } }, ARCH_H.wisp);
}
function wispBuild(g, L, T) {
  const I = L.index;
  g.blob('glow', [0.17, 0.17, 0.17], xf([0, 1.0, 0]), I.core, T.glow, { stacks: 8, segs: 12, glow: 2.2, grime: 0 });
  g.blob('glass', [0.26, 0.26, 0.26], xf([0, 1.0, 0]), I.core, mix(T.glow, '#ffffff', 0.4), { stacks: 8, segs: 14, grime: 0 });
  for (const [ring, n, r, tilt] of [['ring1', 6, 0.42, 0.3], ['ring2', 5, 0.55, -0.6], ['ring3', 4, 0.33, 1.2]]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const p = [C(a) * r, 1.0 + S(a) * r * S(tilt), S(a) * r * C(tilt)];
      g.box('enamel', [0.06, 0.16, 0.05], xf(p, [a, 0.4 * i, tilt]), I[ring], i % 2 ? T.accent : T.body, { round: 0.15, taper: 0.3 });
    }
    g.lathe('metal', [[r - 0.006, -0.004], [r, 0], [r - 0.006, 0.004]], xf([0, 1.0, 0], [tilt + PI / 2, 0, 0]), I[ring], T.accent, { segs: 28 });
  }
}
function wispPose(p, A, I) {
  const { t, act, ak, dead } = A;
  const spin = act === 'attack' ? 6 : 1;
  p.set(I.ring1, 0, t * 0.9 * spin, 0);
  p.set(I.ring2, t * 0.5, t * -0.7 * spin, 0);
  p.set(I.ring3, 0, t * 1.4 * spin, t * 0.3);
  p.set(I.core, 0.1 * S(t * 0.7), t * 0.2, 0.1 * S(t * 0.9));
  p.h[1] = 0.25 + 0.12 * S(t * 1.9);
  if (act === 'attack') p.h[2] = 0.25 * kf(ak, [0.3, 0, 0.5, 1, 1, 0]);
  if (dead > 0) p.h[1] = 0.25 - 0.9 * dead;
}

// ======================================================= HEAVY BIPEDS (humanoid rig)
function heavyLayout(arch) {
  const h = ARCH_H[arch];
  const L = humanoidLayout({ h, sw: arch === 'golem' ? 1.35 : arch === 'treant' ? 1.2 : 1.15, hw: 1.2 });
  L.kind = 'humanoid';
  return L;
}
function heavyBuild(g, L, T, arch) {
  // author at 1.8 m reference and let the caller scale by L.s
  const R = humanoidLayout({ h: 1.8, sw: arch === 'golem' ? 1.35 : arch === 'treant' ? 1.2 : 1.15, hw: 1.2 });
  const at = (n) => R.at(n);
  const torsoW = (x, y) => jointWeights(y, [HB.hips, HB.spine, HB.spine1, HB.spine2, HB.neck, HB.head], [1.05, 1.19, 1.33, 1.51, 1.6], [0.06, 0.06, 0.06, 0.04, 0.04]);
  const armBones = (s) => (s < 0 ? [HB.uaL, HB.faL, HB.hL] : [HB.uaR, HB.faR, HB.hR]);
  const legBones = (s) => (s < 0 ? [HB.thL, HB.snL, HB.ftL] : [HB.thR, HB.snR, HB.ftR]);
  const side = (s) => (s < 0 ? 'L' : 'R');
  if (arch === 'golem') {
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
    const chunk = (pos, r, bone, col, rot = [0, 0, 0]) => {
      g.box('enamel', r, xf(pos, [rot[0] + rnd() * 0.25, rot[1] + rnd() * 0.4, rot[2] + rnd() * 0.25]), bone, mix(col, '#000', Math.abs(rnd()) * 0.25), { round: 0.4 + rnd() * 0.2, grime: 0.3, segs: 9, stacks: 5, taper: 1 + rnd() * 0.3 });
      // smaller rubble pieces bonded to the face of each chunk
      for (let i = 0; i < 2; i++) g.box('enamel', [r[0] * 0.45, r[1] * 0.4, r[2] * 0.45], xf([pos[0] + rnd() * r[0] * 0.8, pos[1] + rnd() * r[1] * 0.8, pos[2] + r[2] * 0.42], [rnd(), rnd(), rnd()]), bone, mix(col, T.accent, Math.abs(rnd()) * 0.5), { round: 0.45, grime: 0.3, segs: 7, stacks: 4 });
    };
    chunk([0, 1.25, 0.02], [0.62, 0.48, 0.42], (x, y) => torsoW(x, y), T.body, [0.05, 0, 0]);
    chunk([0, 0.98, 0], [0.4, 0.22, 0.3], HB.hips, shade(T.body, 0.9));
    chunk([0, 1.53, 0.05], [0.7, 0.18, 0.4], HB.spine2, T.accent, [0.1, 0, 0]);
    chunk([0, 1.7, 0.12], [0.22, 0.2, 0.22], HB.head, shade(T.body, 1.05));
    g.box('glow', [0.18, 0.025, 0.02], xf([0, 1.72, 0.235]), HB.head, T.glow, { round: 0.4, glow: 2, grime: 0 });
    g.blob('glow', [0.09, 0.09, 0.04], xf([0, 1.3, 0.22]), HB.spine1, T.glow, { stacks: 5, segs: 10, glow: 2, grime: 0 });
    for (let i = 0; i < 5; i++) g.box('glow', [0.012, 0.12, 0.01], xf([-0.2 + i * 0.1, 1.15 + (i % 2) * 0.1, 0.235], [0, 0, (i - 2) * 0.4]), HB.spine1, T.glow, { round: 0.4, glow: 1.6, grime: 0 });
    for (const s of [-1, 1]) {
      const [ua, fa, hd] = armBones(s);
      chunk([s * 0.42, 1.42, 0], [0.3, 0.26, 0.3], ua, T.accent, [0, 0, s * 0.3]);
      chunk([s * 0.45, 1.2, 0], [0.2, 0.3, 0.2], ua, T.body);
      chunk([s * 0.47, 0.92, 0.02], [0.24, 0.3, 0.24], fa, shade(T.body, 0.95));
      chunk([s * 0.48, 0.66, 0.04], [0.28, 0.24, 0.28], hd, T.body);
      const [th, sn, ft] = legBones(s);
      chunk([s * 0.17, 0.72, 0], [0.24, 0.32, 0.26], th, T.body);
      chunk([s * 0.18, 0.32, 0.01], [0.22, 0.34, 0.24], sn, shade(T.body, 0.9));
      chunk([s * 0.18, 0.06, 0.07], [0.24, 0.12, 0.34], ft, shade(T.body, 0.8));
    }
  } else if (arch === 'construct') {
    const metal = (pos, r, bone, col, rot = [0, 0, 0], round = 0.15) => g.box('metal', r, xf(pos, rot), bone, col, { round, grime: 0.15, segs: 12, stacks: 4 });
    metal([0, 1.3, 0], [0.5, 0.42, 0.34], (x, y) => torsoW(x, y), T.body, [0.05, 0, 0]);
    metal([0, 1.32, 0.18], [0.34, 0.3, 0.04], HB.spine1, T.accent);
    g.lathe('glass', [[0.0, 0], [0.07, 0.01], [0.07, 0.03], [0, 0.04]], xf([0, 1.35, 0.2], [PI / 2, 0, 0]), HB.spine1, T.glow, { segs: 14, capStart: true });
    g.blob('glow', [0.05, 0.05, 0.02], xf([0, 1.35, 0.23]), HB.spine1, T.glow, { stacks: 4, segs: 8, glow: 2, grime: 0 });
    metal([0, 0.98, 0], [0.32, 0.16, 0.24], HB.hips, shade(T.body, 0.8));
    g.lathe('metal', [[0.06, 0.95], [0.06, 1.12]], null, HB.spine, shade(T.body, 0.6), { segs: 10 });
    metal([0, 1.68, 0.04], [0.2, 0.14, 0.2], HB.head, T.body);
    g.box('glow', [0.14, 0.02, 0.02], xf([0, 1.69, 0.145]), HB.head, T.glow, { round: 0.4, glow: 2, grime: 0 });
    for (const s of [-1, 1]) {
      const [ua, fa, hd] = armBones(s);
      g.lathe('metal', [[0.09, -0.06], [0.1, 0], [0.09, 0.06]], xf([s * 0.33, 1.45, 0], [0, 0, PI / 2]), ua, T.accent, { segs: 12, capStart: true, capEnd: true });
      g.tube('metal', [[s * 0.34, 1.42, 0], [s * 0.35, 1.16, -0.01]], 0.045, ua, shade(T.body, 0.7), { segs: 8 });
      g.tube('metal', [[s * 0.35, 1.38, 0.06], [s * 0.35, 1.2, 0.05]], 0.02, ua, T.accent, { segs: 6 });
      g.blob('metal', [0.06, 0.06, 0.06], xf([s * 0.35, 1.15, -0.01]), fa, T.accent, { stacks: 5, segs: 8 });
      metal([s * 0.36, 0.98, 0], [0.12, 0.3, 0.13], fa, T.body);
      metal([s * 0.37, 0.76, 0.02], [0.1, 0.14, 0.12], hd, shade(T.body, 0.85));
      for (let f = 0; f < 3; f++) g.tube('metal', [[s * 0.37, 0.7, -0.02 + f * 0.035], [s * 0.39, 0.62, 0.0 + f * 0.04]], 0.012, hd, T.accent, { segs: 5 });
      const [th, sn, ft] = legBones(s);
      g.lathe('metal', [[0.08, -0.05], [0.085, 0], [0.08, 0.05]], xf([s * 0.15, 0.93, 0], [0, 0, PI / 2]), th, T.accent, { segs: 12, capStart: true, capEnd: true });
      metal([s * 0.16, 0.72, 0], [0.12, 0.36, 0.14], th, T.body);
      g.blob('metal', [0.065, 0.065, 0.065], xf([s * 0.16, 0.5, 0.02]), sn, T.accent, { stacks: 5, segs: 8 });
      g.tube('metal', [[s * 0.16, 0.5, 0.0], [s * 0.16, 0.1, -0.01]], 0.04, sn, shade(T.body, 0.7), { segs: 8 });
      g.tube('metal', [[s * 0.16, 0.44, 0.06], [s * 0.16, 0.16, 0.05]], 0.018, sn, T.accent, { segs: 6 });
      metal([s * 0.16, 0.05, 0.06], [0.16, 0.08, 0.3], ft, shade(T.body, 0.75));
    }
    for (const s of [-1, 1]) g.tube('metal', [[s * 0.12, 1.5, -0.17], [s * 0.14, 1.85, -0.2]], 0.025, HB.spine2, T.accent, { segs: 6, caps: true });
  } else { // treant
    const bark = (x, y, z) => mix(T.body, shade(T.body, 0.7), (S(x * 40 + y * 6) * 0.5 + 0.5) * 0.6);
    const rings = [];
    for (let i = 0; i <= 10; i++) { const y = lerp(0.85, 1.75, i / 10); const r = lerp(0.3, 0.2, i / 10) + S(i * 1.7) * 0.02; rings.push({ c: [0, y, 0], rx: r * 1.15, rz: r, n: 2.4 }); }
    g.loft('leather', rings, torsoW, bark, { segs: 14, capStart: true, capEnd: true, grime: 0.2 });
    g.blob('glow', [0.025, 0.02, 0.015], xf([-0.06, 1.62, 0.2]), HB.head, T.glow, { stacks: 3, segs: 6, glow: 2, grime: 0 });
    g.blob('glow', [0.025, 0.02, 0.015], xf([0.06, 1.62, 0.2]), HB.head, T.glow, { stacks: 3, segs: 6, glow: 2, grime: 0 });
    const leaf = T.accent;
    for (let i = 0; i < 9; i++) { const a = i * 2.4; g.blob('cloth', [0.22, 0.16, 0.2], xf([C(a) * 0.22, 1.8 + (i % 3) * 0.08, S(a) * 0.18 - 0.05]), HB.head, mix(leaf, shade(leaf, 0.6), (i % 3) * 0.3), { stacks: 5, segs: 9, grime: 0.25 }); }
    for (const s of [-1, 1]) {
      const [ua, fa, hd] = armBones(s);
      const pts = [[s * 0.25, 1.48, 0], [s * 0.38, 1.18, 0.02], [s * 0.42, 0.88, 0.06], [s * 0.44, 0.68, 0.1]];
      limb(g, 'leather', pts, (t) => lerp(0.11, 0.04, t), [ua, fa, hd], bark, { segs: 9, skin: pathWeights(pts, [ua, fa, hd], 0.06) });
      for (let f = 0; f < 4; f++) g.tube('leather', [pts[3], addv(pts[3], [s * (0.05 + f * 0.02), -0.18, (f - 1.5) * 0.06])], (t) => lerp(0.025, 0.004, t), hd, bark, { segs: 5 });
      g.tube('leather', [pts[1], addv(pts[1], [s * 0.25, 0.25, -0.05]), addv(pts[1], [s * 0.3, 0.45, -0.1])], (t) => lerp(0.04, 0.006, t), ua, bark, { segs: 6 });
      g.blob('cloth', [0.16, 0.12, 0.14], xf(addv(pts[1], [s * 0.3, 0.45, -0.1])), ua, leaf, { stacks: 4, segs: 8 });
      const [th, sn, ft] = legBones(s);
      const lp2 = [[s * 0.14, 0.95, 0], [s * 0.17, 0.5, 0.02], [s * 0.18, 0.08, 0.0]];
      limb(g, 'leather', lp2, (t) => lerp(0.16, 0.1, t), [th, sn], bark, { segs: 10, skin: pathWeights(lp2, [th, sn], 0.06) });
      for (let r = 0; r < 4; r++) { const a = r * PI / 2 + 0.4; g.tube('leather', [[s * 0.18, 0.15, 0.0], [s * 0.18 + C(a) * 0.22, 0.02, S(a) * 0.22]], (t) => lerp(0.05, 0.01, t), ft, bark, { segs: 5 }); }
    }
  }
  void at; void side;
}

export const ARCH_H = { hound: 1.1, boar: 1.3, stag: 2.1, raptor: 1.9, drake: 2.6, golem: 3.2, wraith: 2.4, spider: 1.2, serpent: 1.4, construct: 2.4, treant: 3.6, wisp: 1.6 };

const LAYOUTS = {
  hound: () => quadLayout('hound'), boar: () => quadLayout('boar'), stag: () => quadLayout('stag'), drake: () => quadLayout('drake'),
  raptor: raptorLayout, spider: spiderLayout, serpent: serpentLayout, wraith: wraithLayout, wisp: wispLayout,
  golem: () => heavyLayout('golem'), construct: () => heavyLayout('construct'), treant: () => heavyLayout('treant'),
};
const BUILDERS = {
  hound: quadBuild, boar: quadBuild, stag: quadBuild, drake: quadBuild, raptor: raptorBuild, spider: spiderBuild, serpent: serpentBuild, wraith: wraithBuild, wisp: wispBuild,
  golem: (g, L, T) => heavyBuild(g, L, T, 'golem'), construct: (g, L, T) => heavyBuild(g, L, T, 'construct'), treant: (g, L, T) => heavyBuild(g, L, T, 'treant'),
};
const POSES = { hound: quadPose, boar: quadPose, stag: quadPose, drake: quadPose, raptor: raptorPose, spider: spiderPose, serpent: serpentPose, wraith: wraithPose, wisp: wispPose };

export function isHeavyBiped(arch) { return arch === 'golem' || arch === 'construct' || arch === 'treant'; }

/** Build geometry for an archetype + tint. Returns {layout, g}. */
export function buildCreatureGeometry(arch, tint, detail = 1) {
  const L = LAYOUTS[arch]();
  const g = new GeoBuilder(detail);
  g.grime = 0.1;
  BUILDERS[arch](g, L, tints(tint ?? {}));
  if (isHeavyBiped(arch)) { const s = L.s; for (const c of g.ch.values()) for (let i = 0; i < c.pos.length; i++) c.pos[i] *= s; }
  return { layout: L, g };
}

/** Code-driven creature animation with the same interface as HumanoidAnimator. */
export class CreatureAnimator {
  constructor(rig, arch, opts = {}) {
    this.rig = rig; this.arch = arch; this.nodes = rig.nodes; this.rest = rig.rest;
    this.L = rig.layout; this.I = rig.layout.index;
    this.pose = new Pose(rig.nodes.length);
    this.speed = 0; this.runSpeed = opts.runSpeed ?? 6; this.backwards = false;
    this.t = Math.random() * 10; this.phase = Math.random();
    this.state = 'loco'; this.dead = 0; this.hit = 0;
    this.action = null; this.actionT = 0; this.actionDur = 0.7;
    this.accum = 0; this.interval = 0; this.yawVel = 0;
    this.stride = { hound: 1.4, boar: 1.3, stag: 2.0, drake: 2.4, raptor: 2.2, spider: 1.2, serpent: 1.6, wraith: 3, wisp: 3 }[arch] ?? 1.5;
    this.motion = this.I.pelvis ?? this.I.body ?? this.I.s0 ?? this.I.core ?? 1;
    this.A = { ph: 0, t: 0, sp: 0, run: 0, act: null, ak: 0, dead: 0, hit: 0 };
  }
  setState(s) { this.state = s; }
  playAnim(name, o = {}) {
    if (name === 'death' || name === 'dead') { this.state = 'dead'; return; }
    if (name === 'hit') { this.hit = 1; return; }
    if (name === 'idle' || name === 'walk' || name === 'run') { if (this.state === 'dead') this.state = 'loco'; return; }
    if (name.startsWith('attack') || name.startsWith('cast') || name === 'roar') { this.action = name === 'roar' ? 'roar' : 'attack'; this.actionT = 0; this.actionDur = (name === 'roar' ? 1.4 : 0.75) / (o.speed ?? 1); }
  }
  update(dt) {
    this.accum += dt;
    if (this.accum < this.interval) return false;
    dt = this.accum; this.accum = 0;
    this.t += dt;
    const sp = this.speed;
    this.phase = (this.phase + (sp / this.stride) * dt) % 1;
    this.dead += ((this.state === 'dead' ? 1 : 0) - this.dead) * Math.min(1, dt * (this.state === 'dead' ? 2.2 : 6));
    this.hit = Math.max(0, this.hit - dt * 3.5);
    if (this.action) { this.actionT += dt; if (this.actionT >= this.actionDur) this.action = null; }
    const A = this.A;
    A.ph = this.phase; A.t = this.t; A.sp = sp; A.run = clamp((sp - this.runSpeed * 0.45) / (this.runSpeed * 0.4));
    A.act = this.action; A.ak = this.action ? this.actionT / this.actionDur : 0; A.dead = this.dead; A.hit = Math.sin(Math.min(1, this.hit) * PI);
    const p = this.pose.zero();
    POSES[this.arch](p, A, this.I, this.L.q ?? this.L);
    const n = this.nodes, r = p.r;
    for (let i = 1; i < n.length; i++) Quaternion.FromEulerAnglesToRef(r[i * 3], r[i * 3 + 1], r[i * 3 + 2], n[i].rotationQuaternion);
    const m = this.motion, rest = this.rest[m];
    n[m].position.set(rest.x + p.h[0], rest.y + p.h[1], rest.z + p.h[2]);
    return true;
  }
}
