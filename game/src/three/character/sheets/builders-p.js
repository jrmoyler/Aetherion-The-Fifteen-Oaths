// Builders added for the heroes that only partly matched their sheets (recipes name them with a `p.` prefix and
// carry them in their `builders` field: export P). Same contract as builders.js; metres are for a 1.8 m body and
// are scaled to the wearer unless a builder says it works in head units.
//
//   p.shell      a swept shell plate (cupped, ribbed, edged) along a spine on the head, a bone or a limb:
//                helmet crest plates, fin blades, winged collars
//   p.scallops   tiers of ribbed scallop shells over the shoulder (a scaled pauldron with relief)
//   p.contour    a teardrop / lens panel sewn into a fitted suit on the trunk or a limb, piped along its edge
//   p.slabs      thick rigid slabs standing off the body on a limb or the trunk (stone tiles, armour blocks)
//   p.wedge      a flat faceted wing of folded plate: collar wings, folded lacquer panels
import { Vector3 } from 'three';
import { TAU, V, clamp, curve, frame, lerp, smooth } from './kernel.js';
import { HEAD, headPlace, limbFrame, sides } from './builders.js';
import { M, Yof, along, scaleOf, tone } from './builders-b.js';

const PI = Math.PI, DEG = PI / 180, UP = V(0, 1, 0);
const hash = (i, j, k) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
const knots = (k) => (typeof k === 'number' ? () => k : curve(k.map((value, i) => (Array.isArray(value) ? value : [i / (k.length - 1), value]))));

/** Frame and carrier bones for a part: { head: true } (head units), { bone, at }, { limb, t, phi, off }. */
function anchorOf(c, on) {
  const s = scaleOf(c);
  if (on.head) { const hp = headPlace(c), o = on.at ?? [0, 0, 0]; return { place: (p) => hp(V(o[0] + p.x, o[1] + p.y, o[2] + p.z)), skin: HEAD, unit: 1 }; }
  if (on.limb) { const chain = c.form[on.limb]; return { place: limbFrame(chain, on.t, (on.phi ?? 90) * DEG, (on.off ?? 0) * s), skin: on.skin ?? chain.skin(on.t), unit: s }; }
  const o = c.form.J[on.bone].clone().add(V(...(on.at ?? [0, 0, 0])).multiplyScalar(s));
  return { place: frame(o, V(1, 0, 0), UP, V(0, 0, 1)), skin: on.skin ?? [[on.bone, 1]], unit: s };
}

/**
 * One shell plate swept along `spine` ([x, y, z] points in the anchor's frame). `width` is its half-width along
 * the spine (a number, or knots), laid along `across` (default +x) and cupped by `cup` (fraction of the width the
 * edges drop below the middle). `ribs` raises that many ridges fanning from the root, `scallop` notches the far
 * end between them. The plate has an upper face, an under face and edge walls; `edge` trims the rim.
 */
function shellPlate(c, place, skin, unit, { spine, width = .2, across = [1, 0, 0], cup = .3, ribs = 0, ribDepth = .012, scallop = 0, thick = .012, color = 'nacre', dark = null, mat = 'nacre', edge = null, edgeMat = null, edgeWidth = .08, ridge = 0, twist = 0, nu = 12, nv = 14, under = null }) {
  const pts = spine.map((p) => V(p[0], p[1], p[2])), wide = knots(width), col = c.pal(color), dk = dark ? c.pal(dark) : tone(col, .72), A = V(...across).normalize();
  const pos = (a, v, face) => {
    const vv = clamp(v, 0, 1), p = along(pts, vv), t = along(pts, Math.min(1, vv + .02)).sub(along(pts, Math.max(0, vv - .02))).normalize();
    const S = A.clone().addScaledVector(t, -A.dot(t)).normalize(), N = new Vector3().crossVectors(t, S).normalize();
    if (twist) { const k = twist * DEG * vv, cs = Math.cos(k), sn = Math.sin(k), S2 = S.clone().multiplyScalar(cs).addScaledVector(N, sn); N.multiplyScalar(cs).addScaledVector(S, -sn); S.copy(S2); }
    const rib = ribs ? Math.abs(Math.cos(a * ribs * PI / 2)) : 0, w = wide(vv) * (1 - (scallop && ribs ? scallop * (1 - rib) * smooth(.6, 1, vv) : 0));
    const h = -cup * w * a * a + ribDepth * rib * smooth(0, .25, vv) * (1 - .4 * vv) + ridge * (1 - Math.abs(a)) ** 1.5 + face * thick * .5 * (1 - .6 * Math.abs(a) ** 3) * (1 - .5 * vv);
    return place(p.addScaledVector(S, a * w).addScaledVector(N, h).multiplyScalar(unit));
  };
  const inner = (p) => pos(0, .5, -6).clone(), mu = Math.max(ribs ? ribs * 2 : 4, Math.round(nu * c.q * (ribs ? Math.max(1, ribs / 3) : 1))), mv = Math.max(5, Math.round(nv * c.q));
  const sk = typeof skin === 'function' ? skin : () => skin;
  c.bag.grid(mu, mv, (u, v) => { const a = u * 2 - 1, p = pos(a, v, 1), rib = ribs ? Math.abs(Math.cos(a * ribs * PI / 2)) : 1; return { p, skin: sk(p), c: col.clone().lerp(dk, (1 - rib) * .55 + .25 * v) }; }, { color: col, mat: M(mat), inside: inner });
  c.bag.grid(mu, mv, (u, v) => { const p = pos(u * 2 - 1, v, -1); return { p, skin: sk(p) }; }, { color: under ? c.pal(under) : tone(dk, .6), mat: M(mat), inside: inner, flip: true });
  for (const e of [(q) => [-1, q], (q) => [1, q], (q) => [q * 2 - 1, 0], (q) => [q * 2 - 1, 1]]) c.bag.grid(Math.max(mu, mv), 1, (u, v) => { const [a, b] = e(u), p = pos(a, b, v ? 1 : -1); return { p, skin: sk(p) }; }, { color: tone(col, .5), mat: M(mat) });
  if (edge) for (const sx of [-1, 1]) c.bag.grid(mv, 3, (u, v) => { const i = Math.round(v * 3), p = pos(sx * (1 - edgeWidth * [0, .1, .9, 1][i]), u, 1 + .5 * [0, 1, 1, 0][i]); return { p, skin: sk(p) }; }, { color: c.pal(edge), mat: M(edgeMat ?? mat), inside: inner });
}

/** Swept shell plates on one anchor: { on, plates: [{ spine, width, ... }], side: 'L' | 'R' | 'both' }. */
function shell(c, { on = { head: true }, side = 'L', plates, name = 'shell', ...common }) {
  c.bag.part = name;
  sides(c, side, () => { const { place, skin, unit } = anchorOf(c, on); for (const plate of plates) shellPlate(c, place, skin, unit, { ...common, ...plate }); });
}

/**
 * A pauldron of scallop shells: `tiers` ribbed shells lapped down the shoulder, the first capping the joint and
 * each next one peeking out below it and reaching further out. Each shell fans from a hinge near the neck over
 * the shoulder; ribs are real relief, the free edge is scalloped between them, and a metal rim follows it.
 */
function scallops(c, { side = 'R', tiers = 3, size = [.15, .1, .14], shift = [.0, .03, 0], step = .055, out = .03, ribs = 7, ribDepth = .012, scallop = .16, sweep = [100, -34], wrap = 96, thick = .009, flare = .03, color = 'nacre', dark = null, mat = 'nacre', rim = null, rimMat = null, boss = null }) {
  const { J, arm } = c.form, s = scaleOf(c), col = c.pal(color), dk = dark ? c.pal(dark) : tone(col, .7);
  c.bag.part = 'pauldron';
  sides(c, side, () => {
    const O = J['upperarm.L'].clone().add(V(shift[0] * s, shift[1] * s, shift[2] * s)), down = arm.seg[0].along;
    for (let L = tiers - 1; L >= 0; L--) {
      const C = O.clone().addScaledVector(down, L * step * s).addScaledVector(V(1, -.25, 0), L * out * s), k = 1 + .06 * L, droop = -L * 20 * DEG;
      const X = V(Math.cos(droop), Math.sin(droop), 0), Y = V(-Math.sin(droop), Math.cos(droop), 0), Z = V(0, 0, 1);
      const [b0, b1] = L ? [sweep[0] - 54, sweep[1] - 10] : sweep;
      const pos = (a, v, face) => {
        const rib = Math.abs(Math.cos(a * ribs * PI / 2)), vv = v * (1 - scallop * (1 - rib) ** 2.4 * smooth(.5, 1, v));
        const be = lerp(b0, b1, vv) * DEG, al = a * wrap * DEG * (.35 + .65 * Math.sin(PI * clamp(.12 + vv * .8, 0, 1)) ** .6);
        const lift = ribDepth * s * rib * smooth(0, .3, v) + flare * s * vv ** 2.2 + face * thick * s * .5;
        return C.clone().addScaledVector(X, (size[0] * s * k + lift) * Math.cos(be) * Math.cos(al)).addScaledVector(Y, (size[1] * s * k + lift) * Math.sin(be) * Math.cos(al)).addScaledVector(Z, (size[2] * s * k + lift) * Math.sin(al));
      };
      const w = [.7, .45, .25, .15][Math.min(3, L)], sk = [['shoulder.L', w], ['upperarm.L', 1 - w]], inner = C.clone().addScaledVector(Y, -.06 * s);
      const nu = Math.max(10, Math.round(ribs * 4 * c.q)), nv = Math.max(6, Math.round(10 * c.q));
      c.bag.grid(nu, nv, (u, v) => { const a = u * 2 - 1, rib = Math.abs(Math.cos(a * ribs * PI / 2)); return { p: pos(a, v, 1), skin: sk, c: col.clone().lerp(dk, (1 - rib) * .6 + .2 * v * (L % 2)) }; }, { color: col, mat: M(mat), inside: inner });
      c.bag.grid(nu, nv, (u, v) => ({ p: pos(u * 2 - 1, v, -1), skin: sk }), { color: tone(dk, .55), mat: M(mat), inside: inner, flip: true });
      c.bag.grid(nu, 1, (u, v) => ({ p: pos(u * 2 - 1, 1, v ? 1 : -1), skin: sk }), { color: tone(col, .55), mat: M(mat) });
      if (rim) c.bag.grid(nu, 3, (u, v) => { const i = Math.round(v * 3); return { p: pos(u * 2 - 1, 1 - .09 * [1, .9, .1, 0][i], 1 + .6 * [0, 1, 1, 0][i]), skin: sk }; }, { color: c.pal(rim), mat: M(rimMat ?? mat), inside: inner });
    }
    if (boss) { const o = O.clone().add(V((boss.at?.[0] ?? -.07) * s, (boss.at?.[1] ?? .075) * s, (boss.at?.[2] ?? .07) * s)), r = (boss.r ?? .022) * s; c.bag.grid(10, 5, (u, v) => { const th = u * TAU, ph = v * PI / 2; return { p: o.clone().add(V(Math.cos(th) * Math.cos(ph) * r, Math.sin(ph) * r * .6 + 0, Math.sin(th) * Math.cos(ph) * r).applyAxisAngle(V(1, 0, 0), PI / 2 * .6)), skin: [['shoulder.L', 1]] }; }, { closeU: true, color: c.pal(boss.color ?? rim ?? color), mat: M(boss.mat ?? rimMat ?? mat), inside: o.clone().add(V(0, -.02, -.02)) }); }
  });
}

/**
 * A contoured panel in a fitted suit: a lens between two ends on the trunk or a limb, laid a hair above the cloth
 * and piped along its edge. `from` / `to` are [angle degrees, along] (heights on the trunk, t on a limb),
 * `width` its half-breadth in degrees at the middle, `bow` slides the middle sideways (degrees).
 */
function contour(c, { on = 'leg', side = 'both', from, to, width = 20, bow = 0, color = 'green', mat = 'cloth', pipe = null, pipeMat = 'brass', pipeWidth = .0035, off = .0075, sharp = .75, n = 18, name = 'contour' }) {
  c.bag.part = name;
  const col = c.pal(color), limb = on === 'trunk' ? null : c.form[on], { trunk } = c.form;
  const b0 = limb ? from[1] : Yof(c, from[1]), b1 = limb ? to[1] : Yof(c, to[1]);
  const surf = (a, b, lift) => (limb ? limb.point(b, a * DEG, limb.radius(b) + lift) : trunk.at(clamp(b, trunk.bottom, trunk.top), a * DEG, lift));
  const sk = (p, b) => (limb ? limb.skin(b) : trunk.skin(p));
  const emit = (flip) => {
    const at = (x, v, lift) => { const half = width * Math.sin(PI * clamp(v, 0, 1)) ** sharp, a = (lerp(from[0], to[0], v) + bow * Math.sin(PI * v) + x * half) * flip, b = lerp(b0, b1, v); return [surf(a, b, lift), b]; };
    const rows = Math.max(8, Math.round(n * c.q)), inner = (p) => (limb ? limb.centre(clamp((b0 + b1) / 2, 0, 2)) : V(0, p.y, c.form.spineZ(clamp(p.y, trunk.Y.hip, trunk.top))));
    c.bag.grid(6, rows, (u, v) => { const [p, b] = at(u * 2 - 1, v, off); return { p, skin: sk(p, b), c: tone(col, .86 + .2 * Math.sin(PI * u)) }; }, { color: col, mat: M(mat), inside: inner });
    if (pipe) for (const sx of [-1, 1]) c.bag.grid(1, rows, (u, v) => { const [p, b] = at(sx, v, off + .0016), [q] = at(sx * .98, Math.min(1, v + .01), off + .0016), [r] = at(sx, Math.max(0, v - .01), off + .0016); const t = q.sub(r).normalize(), up = surf(0, b, off + .02).sub(surf(0, b, off)).normalize(), ac = new Vector3().crossVectors(t, up).normalize(); return { p: p.addScaledVector(ac, (u - .5) * 2 * pipeWidth * scaleOf(c)), skin: sk(p, b) }; }, { color: c.pal(pipe), mat: M(pipeMat), inside: inner });
  };
  if (limb) sides(c, side, () => emit(1)); else { emit(1); if (side === 'both') emit(-1); }
}

/**
 * Thick rigid slabs: each a bevelled block with a fractured face, its own carrier bone and a second-colour frame.
 * list: [{ on: anchor, size: [w, h, d], rot?: degrees about the outward axis, seed }]. `relief` is the depth of
 * the fractures, `frame` the border colour and `frameWidth` its breadth, `rivets` studs the corners.
 */
function slabs(c, { list, side = 'both', color = 'shale', mat = 'ceramic', frame: border = null, frameMat = null, frameWidth = .014, relief = .006, cell = 3, rivet = null, rivetMat = 'iron', name = 'slabs' }) {
  c.bag.part = name;
  const col = c.pal(color), s = scaleOf(c);
  const cells = (x, y, seed) => { const ix = Math.floor(x), iy = Math.floor(y); let d1 = 9, d2 = 9, id = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const cx = ix + di + hash(ix + di, iy + dj, seed), cy = iy + dj + hash(ix + di, iy + dj, seed + 7), d = Math.hypot(x - cx, y - cy); if (d < d1) { d2 = d1; d1 = d; id = hash(ix + di, iy + dj, seed + 13); } else if (d < d2) d2 = d; } return { h: id, edge: d2 - d1 }; };
  for (const [index, item] of list.entries()) sides(c, item.side ?? side, () => {
    const { place: base, skin } = anchorOf(c, item.on), [w, h, d] = item.size.map((v) => v * s / 2), seed = item.seed ?? index + 1, rz = (item.rot ?? 0) * DEG, tilt = (item.tilt ?? 0) * DEG;
    const place = (p) => { const x = p.x * Math.cos(rz) - p.y * Math.sin(rz), y = p.x * Math.sin(rz) + p.y * Math.cos(rz); return base(V(x, y * Math.cos(tilt) - p.z * Math.sin(tilt), p.z * Math.cos(tilt) + y * Math.sin(tilt))); };
    const fw = (border ? frameWidth * s : 0), rel = (x, y) => { const r = cells((x / w + 1) * cell / 2 + seed * 3.1, (y / h + 1) * cell / 2 * (h / w) + seed * 1.7, seed); return { z: relief * s * ((r.h - .5) * 1.5 * smooth(0, .14, r.edge) - .6 * (1 - smooth(0, .09, r.edge))), k: (.72 + .5 * r.h) * (.5 + .5 * smooth(0, .09, r.edge)) }; };
    const inner = place(V(0, 0, -d * 3)), nx = Math.max(6, Math.round(w / s * 150 * c.q)), ny = Math.max(6, Math.round(h / s * 150 * c.q));
    // Fractured face, inset inside the frame.
    c.bag.grid(nx, ny, (u, v) => { const x = (u * 2 - 1) * (w - fw), y = (v * 2 - 1) * (h - fw), r = rel(x, y), fade = smooth(0, .12, Math.min(u, 1 - u)) * smooth(0, .12, Math.min(v, 1 - v)); return { p: place(V(x, y, d - (border ? .004 * s : 0) + r.z * fade)), skin, c: tone(col, r.k) }; }, { color: col, mat: M(mat), inside: inner });
    // Sides and back.
    const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let e = 0; e < 4; e++) { const [ax, ay] = ring[e], [bx, by] = ring[(e + 1) % 4]; c.bag.grid(1, 2, (u, v) => { const z = [d, d * .2, -d][Math.round(v * 2)], k = v === 1 ? .94 : 1; return { p: place(V(lerp(ax, bx, u) * w * k, lerp(ay, by, u) * h * k, z)), skin }; }, { color: tone(border ? c.pal(border) : col, .6), mat: M(border ? frameMat ?? mat : mat), inside: inner }); }
    c.bag.grid(1, 1, (u, v) => ({ p: place(V((u * 2 - 1) * w * .94, (v * 2 - 1) * h * .94, -d)), skin }), { color: tone(col, .4), mat: M(mat), inside: place(V(0, 0, d)) });
    if (border) {
      // Raised frame: four bevelled bars around the face.
      const bc = c.pal(border), bm = M(frameMat ?? mat), prof = [[0, -.004], [.14, .003], [.86, .003], [1, -.004]];
      for (let e = 0; e < 4; e++) { const [ax, ay] = ring[e], [bx, by] = ring[(e + 1) % 4]; c.bag.grid(Math.max(3, Math.round(6 * c.q)), 3, (u, v) => { const [k, z] = prof[Math.round(v * 3)], x = lerp(ax, bx, u), y = lerp(ay, by, u), sx = x * (w - fw * k * (ax === bx || true ? 1 : 0) * (Math.abs(x) === 1 ? 1 : 0)), sy = y * (h - fw * k * (Math.abs(y) === 1 ? 1 : 0)); const chip = (hash(e, Math.round(u * 6), seed) - .5) * .003 * s; return { p: place(V(Math.abs(x) === 1 ? Math.sign(x) * (w - fw * k) : x * (w - fw * k), Math.abs(y) === 1 ? Math.sign(y) * (h - fw * k) : y * (h - fw * k), d + z * s + chip * (z > 0 ? 1 : 0))), skin, c: tone(bc, .85 + .3 * hash(e, Math.round(u * 6), seed + 2)) }; }, { color: bc, mat: bm, inside: inner }); }
    }
    if (rivet) for (const [x, y] of ring) { const o = V(x * (w - fw * .5), y * (h - fw * .5), d + .002 * s), r = .006 * s; c.bag.grid(6, 2, (u, v) => { const a = u * TAU, k = [1, .7, 0][Math.round(v * 2)]; return { p: place(V(o.x + Math.cos(a) * r * k, o.y + Math.sin(a) * r * k, o.z + [0, .003, .004][Math.round(v * 2)] * s)), skin }; }, { closeU: true, color: c.pal(rivet), mat: M(rivetMat), inside: inner }); }
  });
}

/**
 * A folded plate wing: a flat polygon fan from `root` through `points` ([x, y, z] metres in the anchor frame),
 * creased along `fold` (indices of the points where the plane breaks), with thickness and a trimmed outer edge.
 * Triangular collar wings, folded lacquer shoulder planes.
 */
function wedge(c, { on, side = 'both', points, thick = .008, color = 'lacquer', dark = null, mat = 'lacquer', edge = null, edgeMat = null, edgeWidth = .012, name = 'wing', n = 6 }) {
  c.bag.part = name;
  const col = c.pal(color), dk = dark ? c.pal(dark) : tone(col, .7);
  sides(c, side, () => {
    const { place, skin, unit } = anchorOf(c, on), P = points.map((p) => V(...p).multiplyScalar(unit));
    // The wing is a strip between two polylines: the first half of the points runs out along one edge, the
    // second half back along the other; both end at the tip.
    const half = P.length / 2, A = P.slice(0, half), B = P.slice(half).reverse();
    const edgeAt = (pts, q) => { const f = clamp(q, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)); return pts[i].clone().lerp(pts[i + 1], f - i); };
    const normalAt = (q) => { const a = edgeAt(A, q), b = edgeAt(B, q), a2 = edgeAt(A, Math.min(1, q + .05)), a0 = edgeAt(A, Math.max(0, q - .05)); return new Vector3().crossVectors(b.clone().sub(a), a2.sub(a0)).normalize(); };
    const pos = (q, e, face) => place(edgeAt(A, q).lerp(edgeAt(B, q), e).addScaledVector(normalAt(q), face * thick * unit * .5));
    const rows = Math.max((half - 1) * 2, Math.round(n * (half - 1) * c.q)), inner = pos(.3, .5, -8);
    c.bag.grid(rows, 2, (u, v) => ({ p: pos(u, v, 1), skin, c: col.clone().lerp(dk, .5 * v) }), { color: col, mat: M(mat), inside: inner });
    c.bag.grid(rows, 2, (u, v) => ({ p: pos(u, v, -1), skin }), { color: dk, mat: M(mat), inside: inner, flip: true });
    for (const e of [0, 1]) c.bag.grid(rows, 1, (u, v) => ({ p: pos(u, e, v ? 1 : -1), skin }), { color: tone(col, .5), mat: M(mat) });
    c.bag.grid(2, 1, (u, v) => ({ p: pos(0, u, v ? 1 : -1), skin }), { color: tone(col, .5), mat: M(mat) });
    if (edge) for (const e of [0, 1]) for (const face of [1, -1]) { const w0 = edgeWidth * unit / Math.max(.02, A[0].distanceTo(B[0])); c.bag.grid(rows, 3, (u, v) => { const i = Math.round(v * 3), ee = e ? 1 - w0 * [0, .1, .9, 1][i] : w0 * [0, .1, .9, 1][i]; return { p: pos(u, ee, face * (1.08 + .5 * [0, 1, 1, 0][i])), skin }; }, { color: c.pal(edge), mat: M(edgeMat ?? mat), inside: inner, flip: face < 0 }); }
  });
}

export const BUILDERS_P = { shell, scallops, contour, slabs, wedge };
export const P = Object.fromEntries(Object.entries(BUILDERS_P).map(([name, build]) => [`p.${name}`, build]));
