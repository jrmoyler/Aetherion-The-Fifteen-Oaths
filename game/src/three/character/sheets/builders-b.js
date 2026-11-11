// Builders for the heroes of Oaths 06 to 10 (Reed Resonance, Graft Sanctuary, Bitterglass Guild, Oath of Daybreak,
// Tidal Observatory). Same contract as builders.js: each takes the build context and a plain-data block from a
// recipe and emits skinned geometry into the context's Bag. Recipes name them with a `b.` prefix and carry them
// in their `builders` field (export B).
//
// Sizes given in metres are for a 1.8 m body and are scaled to the wearer; heights are trunk landmarks
// ('belt', 'waist', 'ribs', 'chest', 'armpit', 'shoulder', 'base', 'neck'), fractions of the hip height below the
// hips (0 ground .. 1 hip line), [landmark, metres] offsets or [landmarkA, landmarkB, fraction] blends.
import { Quaternion, Vector3 } from 'three';
import { MAT, TAU, V, box, clamp, curve, dome, frame, lerp, moved, ring, roundBox, smooth } from './kernel.js';
import { HEAD, buckleShape, face, headPlace, limbBand, limbFrame, scalp, sides, slab, slabY, trunkBand } from './builders.js';

const PI = Math.PI, DEG = PI / 180;

/** Surface classes beyond the kiln set, as (roughness, metalness, kind) triples the costume shader already knows. */
const SURFACE = {
  ...MAT,
  bark: [.92, 0, 9],
  meteor: [.55, .05, 3], bone: [.5, 0, 11], moss: [1, 0, 0], straw: [.9, 0, 0], glow: [.5, 0, 7], oilskin: [.6, 0, 0],
};
const M = (name) => { const m = SURFACE[name]; if (!m) throw new Error(`unknown surface "${name}"`); return m; };
const scaleOf = (c) => c.form.J.hips.y / .998;

/** Resolve a height spec to metres (see the header). */
function Yof(c, spec) {
  const { trunk } = c.form;
  if (typeof spec === 'string') { const y = trunk.Y[spec]; if (y === undefined) throw new Error(`unknown trunk landmark "${spec}"`); return y; }
  if (typeof spec === 'number') return lerp(0, trunk.Y.hip, spec);
  if (spec.length === 3) return lerp(Yof(c, spec[0]), Yof(c, spec[1]), spec[2]);
  return Yof(c, spec[0]) + spec[1] * scaleOf(c);
}
const tone = (col, k) => col.clone().multiplyScalar(k);

// ---------------------------------------------------------------------------------------------------------
// Rigid primitives in bind space, with analytic normals.

/** Round bar from A to B, radius r0 at A and r1 at B. */
function cyl(c, A, B, r0, r1, col, mat, skin, { n = 8, caps = true, capTone = .6 } = {}) {
  const axis = new Vector3().subVectors(B, A), len = axis.length(); axis.normalize();
  const X = Math.abs(axis.y) > .9 ? V(1, 0, 0) : V(0, 1, 0); X.addScaledVector(axis, -X.dot(axis)).normalize(); const Z = new Vector3().crossVectors(axis, X);
  const slope = (r0 - r1) / Math.max(1e-6, len), sidesN = Math.max(5, Math.round(n * Math.max(.7, c.q)));
  c.bag.grid(sidesN, 1, (u, v) => { const a = u * TAU, d = X.clone().multiplyScalar(Math.cos(a)).addScaledVector(Z, Math.sin(a)), r = lerp(r0, r1, v); return { p: A.clone().addScaledVector(axis, len * v).addScaledVector(d, r), n: d.clone().addScaledVector(axis, slope).normalize(), skin }; }, { closeU: true, color: col, mat });
  if (caps) for (const [P, r, s] of [[A, r0, -1], [B, r1, 1]]) if (r > 1e-4) c.bag.grid(sidesN, 1, (u, v) => { const a = u * TAU, d = X.clone().multiplyScalar(Math.cos(a)).addScaledVector(Z, Math.sin(a)); return { p: P.clone().addScaledVector(d, r * v), n: axis.clone().multiplyScalar(s), skin }; }, { closeU: true, color: tone(col, capTone), mat });
}

/** Ellipsoid. `tint(n)` may recolour by direction. */
function ball(c, C, r, col, mat, skin, { squash = [1, 1, 1], n = 12, tint = null } = {}) {
  const nu = Math.max(6, Math.round(n * c.q)), nv = Math.max(4, Math.round(n * .7 * c.q));
  c.bag.grid(nu, nv, (u, v) => { const a = u * TAU, b = (v - .5) * PI, d = V(Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a)); return { p: V(C.x + d.x * r * squash[0], C.y + d.y * r * squash[1], C.z + d.z * r * squash[2]), n: V(d.x / squash[0], d.y / squash[1], d.z / squash[2]).normalize(), skin, c: tint ? tint(d) : col }; }, { closeU: true, color: col, mat });
}

const cr = (p0, p1, p2, p3, t) => .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
/** Catmull-Rom through points (Vector3) at s in 0..1. */
function along(pts, s, out = new Vector3()) {
  const f = clamp(s, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i, g = (k) => pts[clamp(k, 0, pts.length - 1)];
  const [a, b, d, e] = [g(i - 1), g(i), g(i + 1), g(i + 2)];
  return out.set(cr(a.x, b.x, d.x, e.x, t), cr(a.y, b.y, d.y, e.y, t), cr(a.z, b.z, d.z, e.z, t));
}
/** Tube swept along a curve. radius(s) may vary; `flat` squashes it across `side`; skin may be a function of the point. */
function sweep(c, pts, radius, col, mat, skin, { n = 7, rows = 12, flat = 1, side = V(1, 0, 0), tint = null, caps = true } = {}) {
  const rad = typeof radius === 'function' ? radius : () => radius, nv = Math.max(3, Math.round(rows * c.q)), nu = Math.max(4, Math.round(n * Math.max(.7, c.q)));
  const frameAt = (s) => { const p = along(pts, s), t = along(pts, Math.min(1, s + .01)).sub(along(pts, Math.max(0, s - .01))).normalize(); const X = side.clone().addScaledVector(t, -side.dot(t)); if (X.lengthSq() < 1e-6) X.set(0, 0, 1).addScaledVector(t, -t.z); X.normalize(); return { p, t, X, Z: new Vector3().crossVectors(t, X) }; };
  c.bag.grid(nu, nv, (u, v) => { const f = frameAt(v), a = u * TAU, r = rad(v), d = f.X.clone().multiplyScalar(Math.cos(a)).addScaledVector(f.Z, Math.sin(a) * flat), p = f.p.clone().addScaledVector(d, r); return { p, n: f.X.clone().multiplyScalar(Math.cos(a) * flat).addScaledVector(f.Z, Math.sin(a)).normalize(), skin: typeof skin === 'function' ? skin(p) : skin, c: tint ? tint(u, v) : col }; }, { closeU: true, color: col, mat });
  if (caps) for (const [s, sign] of [[0, -1], [1, 1]]) { const f = frameAt(s), r = rad(s); if (r > 1e-4) c.bag.grid(nu, 1, (u, v) => { const a = u * TAU, p = f.p.clone().addScaledVector(f.X, Math.cos(a) * r * v).addScaledVector(f.Z, Math.sin(a) * r * v * flat); return { p, n: f.t.clone().multiplyScalar(sign), skin: typeof skin === 'function' ? skin(p) : skin }; }, { closeU: true, color: tone(col, .55), mat }); }
}

/** Surface of revolution about the frame's y axis: profile is [[radius, height], ...]. */
function lathe(c, place, profile, col, mat, skin, { n = 14, tint = null, squash = 1 } = {}) {
  const nu = Math.max(6, Math.round(n * c.q)), rows = profile.length - 1;
  c.bag.grid(nu, rows, (u, v) => { const [r, h] = profile[Math.round(v * rows)], a = u * TAU, p = place(V(Math.cos(a) * r, h, Math.sin(a) * r * squash)); return { p, skin: typeof skin === 'function' ? skin(p) : skin, c: tint ? tint(u, v) : col }; }, { closeU: true, color: col, mat, inside: place(V(0, (profile[0][1] + profile[rows][1]) / 2, 0)) });
}

/** A pointed blade (leaf, petal, moss frond, hair lock): root, direction, face normal, length, half width. */
function leaf(c, root, dir, normal, len, width, col, mat, skin, { cup = .3, droop = 0, rows = 4, tip = null, belly = .45 } = {}) {
  const side = new Vector3().crossVectors(dir, normal).normalize(), n = Math.max(2, Math.round(rows * Math.max(.6, c.q))), end = tip ?? col;
  c.bag.grid(2, n, (u, v) => {
    const a = (u - .5) * 2, w = width * Math.sin(PI * (belly + (1 - belly) * v) ) ** .8 * (v >= 1 ? 0 : 1);
    const p = root.clone().addScaledVector(dir, len * v).addScaledVector(V(0, -1, 0), droop * len * v * v).addScaledVector(side, a * w).addScaledVector(normal, (1 - Math.abs(a)) * w * cup + .002);
    return { p, skin: typeof skin === 'function' ? skin(p) : skin, c: col.clone().lerp(end, v) };
  }, { color: col, mat, inside: root.clone().addScaledVector(normal, -.2) });
}

/** Rigid frame on the trunk's surface: x runs around the body, y up, z out. Local sizes are scaled to the wearer. */
function trunkAnchor(c, y, thDeg, off = 0) {
  const { trunk } = c.form, th = thDeg * DEG, yy = Yof(c, y), o = trunk.at(yy, th, off), out = trunk.at(yy, th, off + .02).sub(o).setY(0).normalize(), up = V(0, 1, 0), x = new Vector3().crossVectors(up, out).normalize(), s = scaleOf(c);
  const at = (lx, ly, lz) => o.clone().addScaledVector(x, lx * s).addScaledVector(up, ly * s).addScaledVector(out, lz * s);
  return { o, x, y: up, z: out, s, at, place: (p) => at(p.x, p.y, p.z) };
}
const scaled = (shape, s) => ({ quads: shape.quads, verts: shape.verts.map(({ p, n, e }) => ({ p: p.clone().multiplyScalar(s), n, e })) });
const turned = (axis, angle) => new Quaternion().setFromAxisAngle(axis, angle);

// ---------------------------------------------------------------------------------------------------------
// Body and cloth

/** A layer over the trunk between two heights: bare skin, a fitted top, a pleated coat body. */
function torso(c, { from = 'belt', to = 'base', color = 'cloth', mat = 'cloth', off = .006, slack = 0, ribs = 0, ribDepth = .003, arc = null, stripes = null }) {
  const { trunk } = c.form, y0 = Yof(c, from), y1 = Yof(c, to), col = c.pal(color), [a0, a1] = arc ? [arc[0] * DEG, arc[1] * DEG] : [0, TAU];
  const alt = stripes ? c.pal(stripes.color) : null;
  c.bag.grid(Math.max(8, (ribs ? Math.max(48, ribs * 3) : 44) * c.q * (a1 - a0) / TAU), Math.max(3, (y1 - y0) / scaleOf(c) * (ribs ? 44 : 60) * c.q), (u, v) => {
    const y = lerp(y0, y1, v), th = lerp(a0, a1, u), rib = ribs ? ribDepth * (.5 + .5 * Math.cos(th * ribs)) ** 2 : 0;
    const p = trunk.at(y, th, off + rib + slack * Math.max(0, Math.sin(th * 9 + Math.sin(y * 31) * 1.3)));
    return { p, skin: trunk.skin(p), c: alt && Math.abs(Math.abs(Math.atan2(Math.sin(th), Math.cos(th))) - stripes.at * DEG) < stripes.half * DEG ? alt : (ribs ? tone(col, .82 + .18 * (.5 + .5 * Math.cos(th * ribs))) : col) };
  }, { closeU: !arc, color: col, mat: M(mat), inside: V(0, (y0 + y1) / 2, c.form.spineZ((y0 + y1) / 2)) });
}

/**
 * A tube on the arm: bare arm with its shoulder, a fitted sleeve, a bell sleeve. `shape` is [[t, extra radius], ...];
 * `droop` lets the extra room hang below the arm; `lining` shows inside an open cuff.
 */
function sleeve(c, { side = 'both', from = -.14, to = 1, off = .006, color = 'cloth', mat = 'cloth', shape = null, folds = 0, droop = 0, trim = null, trimWidth = .014, lining = null, hem = true, ribs = 0 }) {
  const { arm } = c.form, col = c.pal(color), s = scaleOf(c), extra = shape ? curve(shape.map(([t, e]) => [t, e * s])) : () => 0;
  const wide = (t, phi) => arm.radius(Math.max(t, 0)) + off + extra(t) * (1 + droop * -Math.sin(phi)) + folds * Math.sin(phi * 5 + t * 7) * smooth(0, .4, t) + (ribs ? .0022 * Math.cos(arm.metres(t) / (.016 * s) * TAU) : 0);
  const cap = -.14, radius = (t, phi) => (t < 0 ? wide(0, phi) * Math.sqrt(Math.max(0, 1 - (t / cap) ** 2)) * .98 + .001 : wide(t, phi));
  const m0 = arm.metres(from), m1 = arm.metres(to), nv = Math.max(4, (m1 - m0) * 70 * c.q);
  sides(c, side, () => {
    c.bag.grid(20 * c.q, nv, (u, v) => { const t = arm.step(0, lerp(m0, m1, v)), phi = u * TAU; return { p: arm.point(t, phi, radius(t, phi)), skin: arm.skin(t) }; }, { closeU: true, color: col, mat: M(mat), inside: arm.centre((from + to) / 2) });
    if (hem && mat !== 'skin') c.bag.grid(20 * c.q, 2, (u, v) => { const t = arm.step(0, m1 - v * (lining ? .09 * s : .012)), phi = u * TAU; return { p: arm.point(t, phi, radius(t, phi) - .004 - v * .004), skin: arm.skin(t) }; }, { closeU: true, color: lining ? c.pal(lining) : tone(col, .5), mat: M(mat), inside: arm.centre(to), flip: true });
    if (trim) limbBand(c, arm, { t: arm.step(to, -trimWidth * s / 2 - .001), width: trimWidth * s, off: .0015, thick: .0024, color: c.pal(trim), mat: M(mat === 'skin' ? 'cloth' : mat), radius });
  });
}

/** Fitted or straight legs with a seat: leggings, slim trousers, open shorts. `shape` is [[t, extra radius], ...]. */
function legs(c, { color = 'cloth', mat = 'cloth', from = -.155, to = 2, off = .007, shape = null, seat = true, top = 'belt', seam = null, hem = false, folds = .0015 }) {
  const { trunk, leg } = c.form, col = c.pal(color), s = scaleOf(c), yTop = Yof(c, top) + .02, extra = shape ? curve(shape.map(([t, e]) => [t, e * s])) : () => 0;
  if (seat) c.bag.grid(40 * c.q, 12 * c.q, (u, v) => {
    const y = lerp(trunk.Y.crotch - .03, yTop, v), th = u * TAU, shut = smooth(trunk.Y.crotch + .03, trunk.Y.crotch - .03, y);
    const p = trunk.at(Math.max(y, trunk.Y.crotch), th, off + .003 + extra(0) * .5); p.y = y; p.x *= 1 - shut * .75; p.z = lerp(p.z, c.form.spineZ(y), shut * .6);
    return { p, skin: trunk.skin(p) };
  }, { closeU: true, color: col, mat: M(mat), inside: V(0, trunk.Y.hip, c.form.spineZ(trunk.Y.hip)) });
  const seed = c.rand() * TAU, cap = -.16;
  const radius = (t, phi) => { const base = leg.radius(Math.max(t, -.05)) + off + extra(t) + folds * Math.sin(phi * 3 + t * 9 + seed) * smooth(0, .3, t); return t < 0 ? base * Math.sqrt(Math.max(.02, 1 - (t / cap) ** 2)) : base; };
  const m0 = leg.metres(from), m1 = leg.metres(to);
  sides(c, 'both', () => {
    c.bag.grid(24 * c.q, Math.max(6, (m1 - m0) * 44 * c.q), (u, v) => { const t = leg.step(0, lerp(m0, m1, v)), phi = u * TAU; return { p: leg.point(t, phi, radius(t, phi)), skin: leg.skin(t) }; }, { closeU: true, color: col, mat: M(mat), inside: leg.centre(clamp((from + to) / 2, 0, 2)) });
    if (hem) c.bag.grid(24 * c.q, 1, (u, v) => { const t = leg.step(0, m1 - v * .02), phi = u * TAU; return { p: leg.point(t, phi, radius(t, phi) - .003 - v * .01), skin: leg.skin(t) }; }, { closeU: true, color: tone(col, .45), mat: M(mat), inside: leg.centre(to), flip: true });
    if (seam) for (const a of [90, -90]) c.bag.grid(1, 18 * c.q, (u, v) => { const t = lerp(Math.max(0, from), to - .02, v), phi = a * DEG + (u - .5) * .005 / leg.radius(t); return { p: leg.point(t, phi, radius(t, phi) + .0014), skin: leg.skin(t) }; }, { color: c.pal(seam), mat: M(mat), inside: leg.centre(.5) });
  });
}

/** Bands wound around the trunk: sashes, linen wraps, waist cords. A band may tilt (higher on one side) and cover an arc. */
function sash(c, { bands, color = 'cloth', mat = 'cloth', off = .009, thick = .004 }) {
  const { trunk } = c.form, s = scaleOf(c);
  for (const b of bands) {
    const col = c.pal(b.color ?? color), y = Yof(c, b.y), h = (b.h ?? .04) * s, tilt = (b.tilt ?? 0) * s, phase = (b.phase ?? 0) * DEG, o = b.off ?? off, tk = b.thick ?? thick;
    const [a0, a1] = b.arc ? [b.arc[0] * DEG, b.arc[1] * DEG] : [0, TAU], closed = !b.arc, seed = c.rand() * TAU, round = b.round ?? 0;
    const profile = round ? [[-.5, 0], [-.3, .8], [0, 1], [.3, .8], [.5, 0]] : [[-.5, 0], [-.46, 1], [.46, 1], [.5, 0]];
    c.bag.grid(Math.max(6, 46 * c.q * (a1 - a0) / TAU), profile.length - 1, (u, v) => {
      const [a, k] = profile[Math.round(v * (profile.length - 1))], th = lerp(a0, a1, u), yy = y + a * h * (1 + (b.wobble ?? .08) * Math.sin(th * 3 + seed)) + tilt * Math.sin(th - phase);
      const p = trunk.at(clamp(yy, trunk.bottom, trunk.top), th, o + tk * k);
      return { p, skin: trunk.skin(p), c: k ? col : tone(col, .5) };
    }, { closeU: closed, color: col, mat: M(b.mat ?? mat), inside: V(0, y, c.form.spineZ(y)) });
  }
}

/**
 * A strip following waypoints { th (degrees), y, off } over the trunk: a one-shoulder wrap, a harness strap, a
 * baldric, or (with taper 'crescent') a plate that swells in the middle and ends in points.
 */
function strip(c, { path, width = .034, thick = .005, color = 'leather', mat = 'leather', closed = false, taper = null, n = 60, border = null, studs = 0, stud = 'iron' }) {
  const { trunk } = c.form, col = c.pal(color), s = scaleOf(c);
  const pts = path.map((w) => ({ th: w.th * DEG, y: Yof(c, w.y), off: w.off ?? .012 })), count = pts.length;
  const sample = (q) => {
    const f = q * (closed ? count : count - 1), i = Math.floor(f), t = f - i, get = (k) => pts[closed ? ((k % count) + count) % count : clamp(k, 0, count - 1)];
    const unwrap = (k) => { const w = get(k); let th = w.th; if (closed) th += Math.floor(k / count) * (pts[count - 1].th > pts[0].th ? TAU : -TAU); return { ...w, th }; };
    const [a, b, d, e] = [unwrap(i - 1), unwrap(i), unwrap(i + 1), unwrap(i + 2)];
    return { th: cr(a.th, b.th, d.th, e.th, t), y: cr(a.y, b.y, d.y, e.y, t), off: cr(a.off, b.off, d.off, e.off, t) };
  };
  const centre = (q, lift = 0) => { const w = sample(q); return trunk.at(clamp(w.y, trunk.bottom, trunk.top), w.th, w.off + lift); };
  const framed = (q) => { const p = centre(q), ahead = centre(Math.min(1, q + .002)).sub(centre(Math.max(0, q - .002))).normalize(), up = centre(q, .01).sub(p).normalize(), across = new Vector3().crossVectors(up, ahead).normalize(); return { p, up, ahead, across }; };
  const wide = (q) => width * s * (taper === 'crescent' ? .12 + .88 * Math.sin(PI * q) ** .7 : taper === 'end' ? lerp(1, .25, smooth(.7, 1, q)) : 1);
  const profile = [[-.5, 0], [-.5, 1], [.5, 1], [.5, 0]], bcol = border ? c.pal(border) : null;
  c.bag.grid(n * c.q, 3, (u, v) => {
    const q = closed ? u : clamp(u, .001, .999), f = framed(q), [a, h] = profile[Math.round(v * 3)], p = f.p.clone().addScaledVector(f.across, a * wide(q)).addScaledVector(f.up, h * thick);
    return { p, skin: trunk.skin(p), c: h ? col : tone(col, .4) };
  }, { closeU: closed, color: col, mat: M(mat), inside: V(0, trunk.Y.ribs, c.form.spineZ(trunk.Y.ribs)) });
  if (border) for (const e of [-1, 1]) c.bag.grid(n * c.q, 2, (u, v) => {
    const q = closed ? u : clamp(u, .001, .999), f = framed(q), a = e * (.5 - [0, .07, .14][Math.round(v * 2)]), p = f.p.clone().addScaledVector(f.across, a * wide(q)).addScaledVector(f.up, thick + [.0004, .0026, .0004][Math.round(v * 2)]);
    return { p, skin: trunk.skin(p) };
  }, { closeU: closed, color: bcol, mat: M(mat), inside: V(0, trunk.Y.ribs, c.form.spineZ(trunk.Y.ribs)) });
  for (let i = 0; i < studs; i++) { const f = framed((i + .5) / studs); c.bag.solid(scaled(dome(.005, .0035, 6), s), frame(f.p.clone().addScaledVector(f.up, thick), f.across, f.ahead, f.up), trunk.skin(f.p), c.pal(stud), M('iron')); }
  return { framed };
}

/** The surface loose cloth hangs on below the hips: the coat if one is worn, otherwise a plain fall clear of the legs. */
function drapeOf(c, flare = 1.06, off = .012) {
  if (c.coat) return c.coat;
  const { trunk, J, leg } = c.form, yHip = trunk.Y.hip;
  const legReach = (y) => { const t = clamp((J['thigh.L'].y - y) / leg.seg[0].length, 0, 1.4); return leg.centre(t).x + leg.radius(t) + .022; };
  const at = (y, th, extra = 0, out = new Vector3()) => {
    if (y >= yHip) return trunk.at(y, th, off + extra, out);
    const f = (yHip - y) / yHip, grow = 1 + (flare - 1) * f ** .8, p = trunk.at(yHip, th, off + extra, out), zc = c.form.spineZ(yHip);
    const need = legReach(y) / Math.max(.01, trunk.section(yHip).a + off), wide = Math.max(grow, lerp(1, need, smooth(0, .12, f)));
    p.x *= wide; p.z = zc + (p.z - zc) * grow; p.y = y; return p;
  };
  const skin = (p) => {
    if (p.y >= yHip) return trunk.skin(p);
    const side = p.x >= 0 ? 'L' : 'R', drop = smooth(yHip + .03, yHip - .17, p.y) * .84, lower = smooth(J['shin.L'].y + .05, J['shin.L'].y - .25, p.y) * .3, left = smooth(-.14, .14, p.x);
    return [['hips', 1 - drop], ['thigh.L', drop * left * (1 - lower)], ['thigh.R', drop * (1 - left) * (1 - lower)], [`shin.${side}`, drop * lower]];
  };
  return { at, skin, virtual: true };
}

/**
 * A panel hanging on the body: tabard, scapular, tasset, loincloth, sash tail. `width` is the half-width at the
 * top and bottom; `point` drops the middle of the lower edge into a point (negative cuts a swallowtail);
 * `skew` slides the point sideways; `border` raises a trim along the sides and the lower edge.
 */
function hang(c, { at = 0, top = 'belt', bottom = .5, width = [.1, .1], point = 0, skew = 0, color = 'cloth', mat = 'cloth', border = null, borderWidth = .012, thick = .004, off = .012, flare = 1.06, sway = 0, lean = 0, topBorder = false, ornaments = [], rigid = null, stripe = null, weave = 0 }) {
  const { trunk } = c.form, col = c.pal(color), s = scaleOf(c), k = c.form.k, centre = at * DEG, y1 = Yof(c, top), y0 = Yof(c, bottom), drape = drapeOf(c, flare);
  const w0 = width[0] * k, w1 = width[1] * k, pt = point * s, seed = c.rand() * TAU;
  const rho = (y) => trunk.rho(clamp(y, trunk.Y.hip, trunk.top), centre);
  const point3 = (a, b, lift) => {
    const w = lerp(w0, w1, b), y = lerp(y1, y0, b) - pt * b * (1 - Math.abs(a - skew * b) ** 1.4), under = smooth(trunk.Y.hip, y0, y);
    const p = drape.at(y, centre + a * w / rho(y), lift + lean * s * under + sway * s * under * Math.sin(a * 2.2 + b * 5 + seed));
    return p;
  };
  const skin = rigid ? () => rigid : (p) => drape.skin(p), inner = (p) => V(0, p.y, c.form.spineZ(trunk.Y.hip));
  const nx = weave ? weave * 2 : Math.max(4, Math.round(10 * c.q)), ny = weave ? Math.max(4, Math.round(weave * (y1 - y0) / Math.max(.02, w0 + w1))) * 2 : Math.round(Math.max(4, (y1 - y0 + Math.abs(pt)) / s * 40 * c.q));
  const scol = stripe ? c.pal(stripe.color) : null;
  c.bag.grid(nx, ny, (u, v) => { const p = point3(u * 2 - 1, v, off + thick); return { p, skin: skin(p), c: weave ? tone(col, (Math.round(u * nx / 2 - .25) + Math.round(v * ny / 2 - .25)) % 2 ? 1.08 : .74) : scol && Math.abs(((u * (stripe.n ?? 3)) % 1) - .5) < (stripe.width ?? .2) ? scol : col }; }, { color: col, mat: M(mat), inside: inner });
  for (const edge of [(q) => [-1, q], (q) => [1, q], (q) => [q * 2 - 1, 1], (q) => [q * 2 - 1, 0]]) c.bag.grid(Math.min(18, Math.max(nx, ny)), 1, (u, v) => { const [a, b] = edge(u), p = point3(a, b, off + thick * (1 - v) - v * .002); return { p, skin: skin(p) }; }, { color: tone(col, .55), mat: M(mat), inside: inner });
  if (border) {
    const bw = borderWidth * s, across = bw / Math.max(.01, Math.min(w0, w1)), down = bw / Math.max(.02, y1 - y0 + Math.abs(pt) * .5);
    const strips = [(q, e) => [-1 + e * across, q], (q, e) => [1 - e * across, q], (q, e) => [q * 2 - 1, 1 - e * down]]; if (topBorder) strips.push((q, e) => [q * 2 - 1, e * down]);
    for (const st of strips) c.bag.grid(Math.min(18, Math.max(nx, ny)), 3, (u, v) => { const i = Math.round(v * 3), [a, b] = st(u, [0, .1, .9, 1][i]), p = point3(a, clamp(b, 0, 1), off + thick + .0004 + .0028 * [0, 1, 1, 0][i]); return { p, skin: skin(p) }; }, { color: c.pal(border), mat: M(border === 'gold' || border === 'silver' || border === 'brass' ? border : mat), inside: inner });
  }
  // Inlaid marks: rings and bars laid on the panel in its own (across, down) coordinates.
  // Metres per unit of the panel's own coordinates at a point, so a ring stays round where the cloth flares.
  const metric = (a0, b0) => [point3(a0 + .05, b0, 0).distanceTo(point3(a0 - .05, b0, 0)) / .1, point3(a0, Math.min(1, b0 + .03), 0).distanceTo(point3(a0, Math.max(0, b0 - .03), 0)) / (Math.min(1, b0 + .03) - Math.max(0, b0 - .03))];
  for (const o of ornaments) {
    const oc = c.pal(o.color), om = M(o.mat ?? 'silver'), lift = off + thick + .0012;
    if (o.ring) { const [a0, b0] = o.at, r = o.ring * s, tw = (o.width ?? .004) * s, [wMid, hh] = metric(a0, b0); c.bag.grid(Math.max(10, 22 * c.q), 3, (u, v) => { const ang = u * TAU, i = Math.round(v * 3), rr = r + [-tw, -tw, tw, tw][i], p = point3(a0 + Math.cos(ang) * rr / wMid, b0 + Math.sin(ang) * rr / hh, lift + [0, .002, .002, 0][i]); return { p, skin: skin(p) }; }, { closeU: true, color: oc, mat: om, inside: inner }); }
    if (o.disc) { const [a0, b0] = o.at, r = o.disc * s, [wMid, hh] = metric(a0, b0); c.bag.grid(Math.max(8, 14 * c.q), 2, (u, v) => { const ang = u * TAU, rr = r * [1, .8, 0][Math.round(v * 2)], p = point3(a0 + Math.cos(ang) * rr / wMid, b0 + Math.sin(ang) * rr / hh, lift + [0, .0025, .003][Math.round(v * 2)]); return { p, skin: skin(p) }; }, { closeU: true, color: oc, mat: om, inside: inner }); }
    if (o.bar) { const [a0, b0, a1, b1] = o.bar, tw = (o.width ?? .004) * s, wMid = lerp(w0, w1, (b0 + b1) / 2), hh = y1 - y0, dx = (a1 - a0) * wMid, dy = (b1 - b0) * hh, len = Math.hypot(dx, dy) || 1, nxn = -dy / len, nyn = dx / len;
      c.bag.grid(Math.max(4, Math.round(len * 60 * c.q)), 3, (u, v) => { const i = Math.round(v * 3), e = [-1, -1, 1, 1][i] * tw, p = point3(lerp(a0, a1, u) + nxn * e / wMid, lerp(b0, b1, u) + nyn * e / hh, lift + [0, .002, .002, 0][i]); return { p, skin: skin(p) }; }, { color: oc, mat: om, inside: inner }); }
  }
}

/**
 * Skirt of a coat or robe, optionally open down the front. Continues the trunk below the hips and flares to the
 * hem. `pleats` presses knife pleats into it; `lining` shows on the inside; `edge` trims the opening and hem.
 * Later parts lay panels on it through c.coat.
 */
function coat(c, { color = 'cloth', mat = 'cloth', top = 'belt', hem = .38, flare = 1.25, off = .02, open = 0, vent = 0, pleats = 0, pleatDepth = .012, folds = 7, lining = null, edge = null, edgeWidth = .012, trim = null, trimWidth = .018, trimMat = null, dip = 0 }) {
  const { trunk, J, leg } = c.form, col = c.pal(color), s = scaleOf(c), yTop = Yof(c, top), yHip = trunk.Y.hip, yHem0 = Yof(c, hem), seed = c.rand() * TAU;
  const a0 = open * DEG / 2, a1 = TAU - open * DEG / 2;
  const legReach = (y) => { const t = clamp((J['thigh.L'].y - y) / leg.seg[0].length, 0, 1.6); return leg.centre(Math.min(t, 2)).x + leg.radius(Math.min(t, 2)) + .04; };
  // The hem may dip toward the sides (pointed coat tails) by `dip` metres.
  const yHem = (th) => yHem0 - dip * s * Math.abs(Math.sin(th)) ** 2 * 0;
  const at = (y, th, extra = 0, out = new Vector3()) => {
    if (y >= yHip) return trunk.at(y, th, off + extra, out);
    const f = (yHip - y) / (yHip - yHem0), grow = 1 + (flare - 1) * f ** .8, p = trunk.at(yHip, th, off + extra, out), zc = c.form.spineZ(yHip);
    const need = legReach(y) / Math.max(.01, trunk.section(yHip).a + off), wide = Math.max(grow, lerp(1, need, smooth(0, .25, f)));
    const press = pleats ? 1 + pleatDepth * s / .2 * f ** .5 * (2 * Math.abs(((th * pleats / TAU) % 1 + 1) % 1 - .5) - .5) : 1 + .03 * f * Math.sin(th * folds + seed + Math.sin(f * 4) * .5);
    p.x *= wide * press; p.z = zc + (p.z - zc) * grow * press; p.y = y;
    // An open coat falls a little apart toward the hem.
    if (open) { const gap = smooth(1.2, 0, Math.abs(Math.atan2(Math.sin(th), Math.cos(th)))) * f; p.x += Math.sign(Math.sin(th)) * gap * .012; }
    return p;
  };
  const skin = (p) => {
    if (p.y >= yHip) return trunk.skin(p);
    const side = p.x >= 0 ? 'L' : 'R', drop = smooth(yHip + .03, yHip - .17, p.y) * .84, lower = smooth(J['shin.L'].y + .05, J['shin.L'].y - .25, p.y) * .3, left = smooth(-.14, .14, p.x);
    return [['hips', 1 - drop], ['thigh.L', drop * left * (1 - lower)], ['thigh.R', drop * (1 - left) * (1 - lower)], [`shin.${side}`, drop * lower]];
  };
  const inner = (p) => V(0, p.y, c.form.spineZ(yHip)), nu = Math.max(24, (pleats ? pleats * 4 : 46) * c.q), nv = Math.max(8, (yTop - yHem0) * 26 * c.q), closed = !open;
  const shade = (th) => (pleats ? tone(col, .8 + .2 * (2 * Math.abs(((th * pleats / TAU) % 1 + 1) % 1 - .5))) : col);
  const ventHalf = vent * DEG / 2, skip = vent ? (u, v) => Math.abs(lerp(a0, a1, u) - PI) < ventHalf && v < .55 : null;
  c.bag.grid(nu, nv, (u, v) => { const th = lerp(a0, a1, u), p = at(lerp(yHem(th), yTop, v), th); return { p, skin: skin(p), c: shade(th) }; }, { closeU: closed, color: col, mat: M(mat), inside: inner, skip });
  // Inside face: the lining, or the cloth's shadowed back.
  c.bag.grid(pleats ? nu / 2 : nu, nv, (u, v) => { const th = lerp(a0, a1, u), p = at(lerp(yHem(th), yTop, v), th, -.005); return { p, skin: skin(p) }; }, { closeU: closed, color: lining ? c.pal(lining) : tone(col, .45), mat: M(mat), inside: inner, flip: true, skip });
  const raised = (rows, fn, colour, material) => c.bag.grid(rows, 3, (u, v) => { const i = Math.round(v * 3), p = fn(u, [0, .12, .88, 1][i], .0035 * [0, 1, 1, 0][i] + .0006); return { p, skin: skin(p) }; }, { color: colour, mat: material, inside: inner });
  if (trim) { const tw = trimWidth * s, tm = M(trimMat ?? mat); c.bag.grid(nu, 3, (u, v) => { const i = Math.round(v * 3), th = lerp(a0, a1, u), p = at(yHem(th) + .008 * s + tw * [0, .06, .94, 1][i], th, .0035 * [0, 1, 1, 0][i] + .0006); return { p, skin: skin(p) }; }, { closeU: closed, color: c.pal(trim), mat: tm, inside: inner }); }
  if (edge && open) { const ew = edgeWidth * s, em = M(trimMat ?? mat); for (const sgn of [1, -1]) raised(Math.max(8, nv), (u, e, lift) => { const y = lerp(yHem0, yTop, u), th = (sgn > 0 ? a0 : a1) + sgn * (.004 + e * ew) / Math.max(.05, trunk.rho(Math.max(y, yHip), 0)); return at(y, th, lift); }, c.pal(edge), em); }
  c.coat = { at, skin, yHem: yHem0, yTop, off, a0, a1 };
}

/** Standing collar around the base of the neck, open at the front by `gap` degrees. */
function collar(c, { color = 'cloth', mat = 'cloth', lining = null, height = .05, flare = .01, gap = 30, off = .008, trim = null, trimMat = null, base = 0, lean = .8, wing = 0 }) {
  const { trunk, J } = c.form, s = scaleOf(c), col = c.pal(color), y0 = trunk.Y.base + base * s - .012, h = height * s, a0 = gap * DEG / 2, a1 = TAU - a0;
  const slope = (J.head.z - J.neck.z) / Math.max(.02, J.head.y - J.neck.y) * lean;
  const at = (th, v, extra = 0) => { const front = Math.max(0, Math.cos(th)) ** 3, p = trunk.at(trunk.Y.base, th, off + extra + flare * s * v + wing * s * v * front); p.y = y0 + (h + .012) * v * (1 + .25 * front * Math.sign(wing)); p.z += slope * (h + .012) * v; return p; };
  const skin = [['spine2', .5], ['neck', .5]], inner = V(0, y0 + h / 2, J.neck.z + slope * h / 2), closed = gap <= 0, n = 30 * c.q;
  c.bag.grid(n, 4, (u, v) => ({ p: at(lerp(a0, a1, u), v), skin }), { closeU: closed, color: col, mat: M(mat), inside: inner });
  c.bag.grid(n, 4, (u, v) => ({ p: at(lerp(a0, a1, u), v, -.005 * s), skin }), { closeU: closed, color: lining ? c.pal(lining) : tone(col, .6), mat: M(mat), inside: inner, flip: true });
  c.bag.grid(n, 1, (u, v) => ({ p: at(lerp(a0, a1, u), 1, -.005 * s * v), skin }), { closeU: closed, color: trim ? c.pal(trim) : tone(col, .7), mat: M(trim ? trimMat ?? mat : mat), inside: V(0, y0 - .2, J.neck.z) });
  if (trim) c.bag.grid(n, 3, (u, v) => { const i = Math.round(v * 3); return { p: at(lerp(a0, a1, u), 1 - [.22, .2, .02, 0][i], .0022 * [0, 1, 1, 0][i] + .0004), skin }; }, { closeU: closed, color: c.pal(trim), mat: M(trimMat ?? mat), inside: inner });
}

/** The neck, bare or bound in cloth, from the collar line up into the head. */
function neckWrap(c, { color = 'skin', mat = 'skin', off = 0, ribs = 0, from = 0 }) {
  const { trunk, J } = c.form, y0 = trunk.Y.base - .012 + from * scaleOf(c), y1 = J.head.y + .05;
  c.bag.grid(22 * c.q, Math.max(5, ribs * 3), (u, v) => {
    const y = lerp(y0, y1, v), p = trunk.at(Math.min(y, trunk.Y.neck), u * TAU, off + (ribs ? .0028 * (.5 + .5 * Math.cos((v * ribs + u * .6) * TAU)) : 0)); p.y = y; if (y > trunk.Y.neck) p.z += (y - trunk.Y.neck) * .35;
    return { p, skin: [['neck', 1 - v * .6], ['head', v * .6]] };
  }, { closeU: true, color: c.pal(color), mat: M(mat), inside: V(0, (y0 + y1) / 2, J.neck.z) });
}

// ---------------------------------------------------------------------------------------------------------
// Plates and guards

/**
 * A shell over part of a limb: vambrace, greave, knee cop, pauldron plate. It covers `arc` degrees either side
 * of `phi` between `from` and `to`; `flare` lifts the upper edge, `flareEnd` the lower, `bulge` domes it,
 * `point` runs the middle of the lower edge on into a point, `ridge` creases it down the middle.
 */
function guard(c, { limb = 'arm', side = 'both', from, to, phi = 90, arc = 80, off = .012, thick = .006, flare = 0, flareEnd = 0, bulge = 0, point = 0, pointTop = 0, ridge = 0, color = 'iron', mat = 'iron', trim = null, trimMat = null, trimWidth = .008, skin = null, layers = 1, step = .2, grooves = 0, rivets = 0, rivet = 'iron' }) {
  const chain = c.form[limb], s = scaleOf(c), col = c.pal(color), ph = phi * DEG, half = arc * DEG, full = arc >= 180;
  sides(c, side, () => {
    for (let layer = 0; layer < layers; layer++) {
      const t0 = from + layer * step, t1 = to + layer * step, lift = off - layer * .0035 * s + (layers - 1 - layer) * .004 * s;
      const pos = (a, v, extra = 0) => {
        const t = lerp(t0 - pointTop * (1 - a * a), t1 + point * (1 - Math.abs(a) ** 1.5), v);
        const r = chain.radius(clamp(t, -.2, 2.2)) + lift + extra + flare * s * (1 - v) ** 2 + flareEnd * s * v ** 2 + bulge * s * Math.sin(PI * v) * (1 - a * a * .6) + ridge * s * (1 - Math.abs(a)) + (grooves ? -.0025 * s * (.5 + .5 * Math.cos(a * grooves * PI)) ** 6 : 0);
        return chain.point(t, ph + a * half, r);
      };
      const tm = (t0 + t1) / 2, sk = skin ?? chain.skin(clamp(tm, 0, 2)), inner = chain.centre(clamp(tm, 0, 2));
      const nx = Math.max(6, Math.round(arc / 11 * c.q)), ny = Math.max(3, Math.round(chain.seg[0].length / s * Math.abs(t1 - t0) * 44 * c.q));
      c.bag.grid(nx, ny, (u, v) => ({ p: pos(u * 2 - 1, v, thick * s), skin: sk, c: grooves ? tone(col, .8 + .2 * Math.cos((u * 2 - 1) * grooves * PI)) : col }), { closeU: full, color: col, mat: M(mat), inside: inner });
      const edges = [(q) => [q * 2 - 1, 0], (q) => [q * 2 - 1, 1]]; if (!full) edges.push((q) => [-1, q], (q) => [1, q]);
      for (const e of edges) c.bag.grid(Math.max(nx, ny), 1, (u, v) => { const [a, b] = e(u); return { p: pos(a, b, thick * s * (1 - v)), skin: sk }; }, { color: tone(col, .5), mat: M(mat), inside: inner });
      if (trim) {
        const tw = trimWidth * s, da = tw / Math.max(.02, chain.radius(clamp(tm, 0, 2)) * half), dv = tw / Math.max(.02, chain.seg[0].length * Math.abs(t1 - t0));
        const runs = [(q, e) => [q * 2 - 1, e * dv], (q, e) => [q * 2 - 1, 1 - e * dv]]; if (!full) runs.push((q, e) => [-1 + e * da, q], (q, e) => [1 - e * da, q]);
        for (const run of runs) c.bag.grid(Math.max(nx, ny), 3, (u, v) => { const i = Math.round(v * 3), [a, b] = run(u, [0, .1, .9, 1][i]); return { p: pos(a, b, thick * s + .0005 + .0028 * s * [0, 1, 1, 0][i]), skin: sk }; }, { color: c.pal(trim), mat: M(trimMat ?? mat), inside: inner });
      }
      for (let i = 0; i < rivets; i++) for (const a of [-.78, .78]) { const v = (i + .5) / rivets, o = pos(a, v, thick * s), n = o.clone().sub(chain.centre(clamp(lerp(t0, t1, v), 0, 2))).normalize(), x = new Vector3().crossVectors(V(0, 1, 0), n).normalize(); c.bag.solid(scaled(dome(.0045, .0035, 6), s), frame(o, x, new Vector3().crossVectors(n, x), n), sk, c.pal(rivet), M('iron')); }
    }
  });
}

/** Cones standing on a limb: branch stubs on a bark guard, roots on a boot, studs on a strap. */
function spikes(c, { limb = 'arm', side = 'both', from, to, phi = 90, arc = 60, count = 8, length = .06, radius = .012, off = .012, lean = .5, color = 'bark', mat = 'bark', tip = null, bend = .2 }) {
  const chain = c.form[limb], s = scaleOf(c), col = c.pal(color), end = tip ? c.pal(tip) : tone(col, 1.3);
  sides(c, side, () => {
    for (let i = 0; i < count; i++) {
      const t = lerp(from, to, (i + c.rand() * .8) / count), ph = (phi + (c.rand() - .5) * 2 * arc) * DEG, base = chain.point(t, ph, chain.radius(t) + off * s), centre = chain.centre(t);
      const out = base.clone().sub(centre).normalize(), up = chain.frame(t).along.clone().negate(), dir = out.clone().multiplyScalar(1 - lean).addScaledVector(up, lean).add(V((c.rand() - .5) * .3, (c.rand() - .5) * .3, (c.rand() - .5) * .3)).normalize();
      const len = length * s * (.6 + c.rand() * .8), r = radius * s * (.7 + c.rand() * .6), sk = chain.skin(t);
      sweep(c, [base.clone().addScaledVector(dir, -.01), base.clone().addScaledVector(dir, len * .5).addScaledVector(up, bend * len * .15), base.clone().addScaledVector(dir, len).addScaledVector(up, bend * len * .5)], (q) => r * (1 - q * .85), col, M(mat), sk, { n: 5, rows: 3, caps: false, tint: (u, v) => col.clone().lerp(end, v) });
    }
  });
}

/** Set stones and studs: glowing sap plugs, enamel inlays, rivets. Each entry is [t, phi] on a limb or [height, angle] on the trunk. */
function studs(c, { on = 'arm', side = 'both', at, r = .012, height = null, color = 'ember', mat = 'ember', rim = null, rimMat = 'brass', off = .012, oval = 1 }) {
  const s = scaleOf(c), col = c.pal(color);
  const set = (place, sk) => {
    c.bag.solid(scaled({ quads: dome(r, height ?? r * .7, 9).quads, verts: dome(r, height ?? r * .7, 9).verts.map(({ p, n }) => ({ p: V(p.x, p.y * oval, p.z), n })) }, s), place, sk, col, M(mat), 1);
    if (rim) c.bag.solid(scaled(ring(r * 1.12, r * 1.12 * oval, r * .22, 14, 5), s), place, sk, c.pal(rim), M(rimMat));
  };
  if (on === 'trunk') for (const [y, th] of at) { const A = trunkAnchor(c, y, th, off); set(frame(A.o, A.x, A.y, A.z), c.form.trunk.skin(A.o)); }
  else { const chain = c.form[on]; sides(c, side, () => { for (const [t, ph] of at) set(limbFrame(chain, t, ph * DEG, off * s), chain.skin(t)); }); }
}

/** Two cords wound in opposite directions around a limb, crossing front and back: lacing, bindings. */
function cords(c, { limb = 'leg', side = 'both', from, to, turns = 2, color = 'cord', mat = 'cloth', r = .0035, off = .006, radius = null }) {
  const chain = c.form[limb], s = scaleOf(c), col = c.pal(color), m0 = chain.metres(from), m1 = chain.metres(to), cr_ = r * s;
  sides(c, side, () => {
    for (const hand of [1, -1]) c.bag.grid(5, Math.max(8, turns * 16 * c.q), (u, v) => {
      const a = u * TAU, t = chain.step(0, lerp(m0, m1, v) + Math.sin(a) * cr_), phi = hand * v * turns * TAU + (hand > 0 ? 0 : PI * .15);
      const base = radius ? chain.radius(t) + radius * s : chain.radius(t);
      return { p: chain.point(t, phi, base + off * s + cr_ + Math.cos(a) * cr_), skin: chain.skin(t) };
    }, { closeU: true, color: col, mat: M(mat), inside: chain.centre((from + to) / 2) });
  });
}

/** A fringe of fronds over a region: moss on a shoulder, a straw skirt, leaves on a mask strap. */
function shag(c, { on = 'arm', side = 'L', from, to, phi = 90, arc = 100, count = 60, length = .05, width = .012, off = .01, color = 'moss', tips = 'mossLight', mat = 'moss', droop = .6, out = .5, th = null, y = null }) {
  const s = scaleOf(c), col = c.pal(color), end = c.pal(tips), n = Math.round(count * (.5 + .5 * c.q));
  const blade = (root, normal, sk) => {
    const down = V(0, -1, 0).addScaledVector(normal, normal.y).normalize(), dir = normal.clone().multiplyScalar(out).addScaledVector(down, 1 - out).add(V((c.rand() - .5) * .7, (c.rand() - .5) * .3, (c.rand() - .5) * .7)).normalize();
    const shade = .6 + c.rand() * .7;
    leaf(c, root, dir, normal, length * s * (.6 + c.rand() * .8), width * s * (.7 + c.rand() * .6), tone(col, shade), M(mat), sk, { droop, tip: tone(end, shade), rows: 3, cup: .5 });
  };
  if (on === 'trunk') { const { trunk } = c.form, y0 = Yof(c, y[0]), y1 = Yof(c, y[1]); for (let i = 0; i < n; i++) { const yy = lerp(y0, y1, c.rand()), a = lerp(th[0], th[1], c.rand()) * DEG, p = trunk.at(yy, a, off * s), nrm = trunk.at(yy, a, off * s + .02).sub(p).normalize(); blade(p, nrm, trunk.skin(p)); } return; }
  const chain = c.form[on];
  sides(c, side, () => { for (let i = 0; i < n; i++) { const t = lerp(from, to, c.rand()), ph = (phi + (c.rand() * 2 - 1) * arc) * DEG, p = chain.point(t, ph, chain.radius(Math.max(0, t)) + off * s), nrm = p.clone().sub(chain.centre(t)).normalize(); blade(p, nrm, on === 'arm' && t < .1 ? [['shoulder.L', .5], ['upperarm.L', .5]] : chain.skin(t)); } });
}

/**
 * A stiff pointed wing standing out over the shoulder: the shoulder of a scapular, a folded enamel pauldron.
 * `span` is how far it reaches past the shoulder joint, `depth` its half-depth front to back at the root,
 * `rise` lifts the tip, `fold` creases it along the middle.
 */
function wing(c, { side = 'both', span = .1, depth = .11, tipDepth = .02, rise = 0, lift = .012, fold = 0, wedge = 0, inset = .5, color = 'cloth', mat = 'cloth', trim = null, trimMat = null, trimWidth = .01, thick = .006, back = 0 }) {
  const { J, S } = c.form, s = scaleOf(c), k = c.form.k, col = c.pal(color), sh = J['upperarm.L'], zc = sh.z + back * s;
  sides(c, side, () => {
    // a: -1 back .. 1 front; b: 0 at the root (toward the neck) .. 1 at the tip; h: 0 underside .. 1 top face.
    const pos = (a, b, h = 0, extra = 0) => {
      const x = lerp(S * inset, S + span * s, b), z = zc + a * lerp(depth * k, tipDepth * k, b ** .8);
      const rootY = c.form.trunk.Y.shoulder + lift * s + .035 * s * (1 - inset) - a * a * .05 * s, tipY = sh.y + .03 * s + rise * s - a * a * .01 * s;
      const y = lerp(rootY, tipY, b) + .012 * s * Math.sin(PI * b) + fold * s * (1 - Math.abs(a)) * b;
      return V(x, y + extra + h * (thick * s + wedge * s * (1 - Math.abs(a)) * (1 - b * b)), z);
    };
    const sk = [['spine2', .45], ['shoulder.L', .55]], inner = V(S * .5, sh.y - .2, zc), nx = Math.max(6, Math.round(10 * c.q)), ny = Math.max(4, Math.round(8 * c.q));
    c.bag.grid(nx, ny, (u, v) => ({ p: pos(u * 2 - 1, v, 1), skin: sk }), { color: col, mat: M(mat), inside: inner });
    c.bag.grid(nx, ny, (u, v) => ({ p: pos(u * 2 - 1, v, 0), skin: sk }), { color: tone(col, .55), mat: M(mat), inside: inner, flip: true });
    for (const e of [(q) => [-1, q], (q) => [1, q], (q) => [q * 2 - 1, 1], (q) => [q * 2 - 1, 0]]) c.bag.grid(nx, 1, (u, v) => { const [a, b] = e(u); return { p: pos(a, b, 1 - v), skin: sk }; }, { color: tone(col, .7), mat: M(mat), inside: inner });
    if (trim) { const dv = trimWidth / Math.max(.05, span + .1), da = trimWidth / Math.max(.03, depth); for (const run of [(q, e) => [-1 + e * da, q], (q, e) => [1 - e * da, q], (q, e) => [q * 2 - 1, 1 - e * dv]]) c.bag.grid(nx, 3, (u, v) => { const i = Math.round(v * 3), [a, b] = run(u, [0, .1, .9, 1][i]); return { p: pos(a, b, 1, .0005 + .0026 * s * [0, 1, 1, 0][i]), skin: sk }; }, { color: c.pal(trim), mat: M(trimMat ?? mat), inside: inner }); if (wedge) c.bag.grid(nx, 2, (u, v) => ({ p: pos([-.05, 0, .05][Math.round(v * 2)], u, 1, .0005 + .0026 * s * [0, 1, 0][Math.round(v * 2)]), skin: sk }), { color: c.pal(trim), mat: M(trimMat ?? mat), inside: inner }); }
  });
}

/**
 * A flat crescent plate: a horn of iron standing off a shoulder, a moon on a hip. It lies in the plane of its
 * frame; `r` is the outer radius, `a0..a1` the angles it sweeps, `width` its breadth at the middle.
 */
function plateLoft(c, place, sk, outer, inner_, { thick = .012, color, mat = 'iron', edge = null, edgeMat = null, n = 22, inlay = null, centre = [0, 0] }) {
  const col = c.pal(color), pos = (q, e, z) => { const o = outer(clamp(q, .002, .998)), i = inner_(clamp(q, .002, .998)); return place(V(lerp(o[0], i[0], e), lerp(o[1], i[1], e), z)); };
  const rows = Math.max(8, Math.round(n * c.q)), inner = place(V(centre[0], centre[1], -.3));
  for (const [z, flip] of [[thick / 2, false], [-thick / 2, true]]) c.bag.grid(rows, 4, (u, v) => ({ p: pos(u, v, z), skin: sk }), { color: flip ? tone(col, .6) : col, mat: M(mat), inside: inner, flip });
  for (const e of [0, 1]) c.bag.grid(rows, 1, (u, v) => ({ p: pos(u, e, lerp(-thick / 2, thick / 2, v)), skin: sk }), { color: tone(col, .55), mat: M(mat), inside: pos(.5, .5, 0) });
  for (const q of [0, 1]) c.bag.grid(2, 1, (u, v) => ({ p: pos(q, u, lerp(-thick / 2, thick / 2, v)), skin: sk }), { color: tone(col, .55), mat: M(mat), inside: pos(.5, .5, 0) });
  if (edge) for (const e of [0, 1]) c.bag.grid(rows, 3, (u, v) => { const i = Math.round(v * 3), ee = e ? 1 - [0, .02, .14, .16][i] : [0, .02, .14, .16][i]; return { p: pos(u, ee, thick / 2 + .0004 + .003 * [0, 1, 1, 0][i]), skin: sk }; }, { color: c.pal(edge), mat: M(edgeMat ?? mat), inside: inner });
  if (inlay) c.bag.grid(Math.max(4, Math.round(rows / 3)), 2, (u, v) => ({ p: pos(lerp(inlay.from, inlay.to, u), lerp(.36, .64, v), thick / 2 + .002), skin: sk }), { color: c.pal(inlay.color), mat: M(inlay.mat ?? 'glow'), inside: inner });
}
function crescentPlate(c, place, sk, { r, a0, a1, width, ...rest }) {
  const A0 = a0 * DEG, A1 = a1 * DEG, w = (q) => width * Math.sin(PI * q) ** .75;
  plateLoft(c, place, sk, (q) => { const a = lerp(A0, A1, q); return [Math.cos(a) * r, Math.sin(a) * r]; }, (q) => { const a = lerp(A0, A1, q), rr = r - w(q); return [Math.cos(a) * rr, Math.sin(a) * rr]; }, rest);
}

// ---------------------------------------------------------------------------------------------------------
// Heads

const dirOf = (phi, y) => { const cy = clamp(2 * y, -1, 1), st = Math.sqrt(1 - cy * cy); return V(st * Math.sin(phi), cy, st * Math.cos(phi)); };
/** A band around the head at height y (head units), from azimuth a0 to a1: mask straps, cap bands, circlets. */
function headBand(c, { y = .05, rise = 0, from = 60, to = 300, width = .07, off = .012, thick = .014, color = 'leather', mat = 'leather' }) {
  const place = headPlace(c), a0 = from * DEG, a1 = to * DEG;
  c.bag.grid(30 * c.q, 3, (u, v) => { const phi = lerp(a0, a1, u), [dy, h] = [[-.5, 0], [-.5, 1], [.5, 1], [.5, 0]][Math.round(v * 3)]; return { p: place(scalp(c, phi, y + rise * Math.sin(u * PI) ** .7 + dy * width, off + h * thick)), skin: HEAD }; }, { closeU: a1 - a0 >= TAU - 1e-6, color: c.pal(color), mat: M(mat), inside: c.head.C });
}

/**
 * Bird-skull mask: a carved shell over the brow and eyes drawn out into a long down-curved beak, painted stripes,
 * dark eye sockets, a pivot disc at each cheek and a strap round the head.
 */
function beakMask(c, { color = 'bone', stripe = 'red', length = .92, drop = 1.02, width = .46, strap = 'leather', hinge = 'brass', cord = 'red' }) {
  const place = headPlace(c), col = c.pal(color), red = c.pal(stripe);
  const spine = (v) => V(0, .13 - drop * v ** 1.7, .24 + length * v ** .92);
  const shell = (v, a, lift = 0) => { const k = (1 - v) ** .62, w = width * k + .012, hT = .27 * k + .012, hB = (.24 * (1 - v) ** 1.3 + .01) * (1 - .35 * smooth(0, .12, v) * 0), sp = spine(v), sn = Math.sin(a), cs = Math.cos(a); return V(sp.x + cs * (w + lift), sp.y + sn * ((sn > 0 ? hT : hB) + lift), sp.z); };
  c.bag.grid(26 * c.q, 22 * c.q, (u, v) => {
    const a = u * TAU, vv = v * .995, sn = Math.sin(a);
    // Paint: a red band across the cheek, red along the underside of the beak, a darkened tip.
    const band = Math.abs(vv - (.16 + .3 * Math.abs(Math.cos(a)) ** 1.5)) < .04 || Math.abs(vv - (.3 + .3 * Math.abs(Math.cos(a)) ** 1.5)) < .018, under = sn < .08 && vv > .3 && vv < .86, mark = Math.abs(vv - .52) < .02 && sn > .1;
    return { p: place(shell(vv, a)), skin: HEAD, c: vv > .93 ? tone(col, .45) : band || under || mark ? red : tone(col, .86 + .14 * Math.sin(a * 7 + vv * 31)) };
  }, { closeU: true, color: col, mat: M('wood'), inside: place(spine(.3)) });
  // Eye sockets: dark almonds set into the flanks.
  for (const sx of [-1, 1]) c.bag.grid(10, 2, (u, v) => { const ang = u * TAU, rr = [1, .7, 0][Math.round(v * 2)], a = PI / 2 - sx * (.9 + Math.cos(ang) * .4 * rr), vv = .15 + Math.sin(ang) * .075 * rr + Math.cos(ang) * .05 * rr; return { p: place(shell(vv, a, .004)), skin: HEAD }; }, { closeU: true, color: c.pal('hollow'), mat: M('hollow'), inside: place(spine(.1)) });
  for (const sx of [-1, 1]) {
    const o = V(sx * (width + .03), .0, .2), fr = (p) => place(V(o.x + sx * p.z, o.y + p.y, o.z + p.x));
    c.bag.solid(dome(.075, .03, 10), fr, HEAD, c.pal(hinge), M('brass'));
    c.bag.solid(moved(dome(.03, .03, 8), V(0, 0, .025)), fr, HEAD, tone(c.pal(hinge), .7), M('brass'));
    // The cord that hangs from the pivot.
    sweep(c, [place(V(o.x + sx * .02, o.y - .04, o.z)), place(V(o.x + sx * .03, o.y - .3, o.z - .03)), place(V(o.x + sx * .02, o.y - .52, o.z - .02))], .012 * c.head.H, c.pal(cord), M('cloth'), HEAD, { n: 4, rows: 4 });
  }
  headBand(c, { y: .0, rise: .1, from: 62, to: 298, width: .08, color: strap, mat: 'leather' });
}

/** A hank of hair hanging from a knot: a ponytail, the tail of a top-knot. Path points are in head units. */
function tail(c, { color = 'hair', at = [0, .47, -.27], path = [[0, .6, -.5], [0, .2, -.7], [0, -.6, -.66], [0, -1.5, -.56], [0, -2.1, -.52]], radius = [.1, .14, .12, .09, .03], flat = .6, tie = null, knot = .1, streak = null }) {
  const place = headPlace(c), col = c.pal(color), other = streak ? c.pal(streak) : tone(col, 1.6), K = V(...at), J = c.form.J;
  const pts = [K, ...path.map((p) => V(...p))].map(place), rad = curve(radius.map((r, i) => [i / (radius.length - 1), r * c.head.H]));
  const skin = (p) => { const w = smooth(J.neck.y + .02, J.neck.y - .22, p.y) * .55; return [['head', 1 - w], ['spine2', w]]; };
  sweep(c, pts, rad, col, M('hair'), skin, { n: 9, rows: 16, flat, side: V(1, 0, 0), tint: (u, v) => tone(col.clone().lerp(other, .25 * (.5 + .5 * Math.sin(u * TAU * 4 + v * 3))), .8 + .3 * Math.sin(u * TAU * 7 + 1.3)) });
  ball(c, place(K), knot * c.head.H, col, M('hair'), HEAD, { n: 8 });
  if (tie) { const T = along(pts, .1), d = along(pts, .14).sub(along(pts, .06)).normalize(), x = Math.abs(d.x) < .9 ? V(1, 0, 0) : V(0, 0, 1); x.addScaledVector(d, -x.dot(d)).normalize(); c.bag.solid(ring(rad(.1) * 1.02, rad(.1) * flat * 1.1, .014 * c.head.H * 2, 12, 5), frame(T, x, new Vector3().crossVectors(d, x), d), HEAD, c.pal(tie), M('cloth')); }
}

// ---------------------------------------------------------------------------------------------------------
// Carried gear

/** Bamboo: a cane with raised nodes and a dark open end. */
function cane(c, A, B, r, col, sk, { nodes = 4, open = true, mat = 'bamboo' } = {}) {
  cyl(c, A, B, r, r * .94, col, M(mat), sk, { n: 9, capTone: open ? .12 : .6 });
  for (let i = 1; i <= nodes; i++) { const f = i / (nodes + 1), P = A.clone().lerp(B, f), d = B.clone().sub(A).normalize(); cyl(c, P.clone().addScaledVector(d, -r * .16), P.clone().addScaledVector(d, r * .16), r * 1.09, r * 1.09, tone(col, .72), M(mat), sk, { n: 9, caps: false }); }
  if (open) { const d = B.clone().sub(A).normalize(); cyl(c, B.clone().addScaledVector(d, -r * .5), B.clone().addScaledVector(d, .001), r * 1.07, r * 1.07, tone(col, .8), M(mat), sk, { n: 9, caps: false }); }
}

/** Reed pipes slung across the back in a lashed bracket. */
function reedPipes(c, { color = 'bamboo', count = 2, length = .56, r = .019, lean = 24, at = 'ribs', shift = -.02, wrapColor = 'linen', bracket = 'leather', cord = 'red' }) {
  const A = trunkAnchor(c, at, 180, .012), sk = [['spine2', 1]], col = c.pal(color), tilt = lean * DEG;
  // In the anchor frame +x is the wearer's right; the pipes lean so their mouths clear the left shoulder.
  const dir = V(-Math.sin(tilt), Math.cos(tilt), 0), across = V(Math.cos(tilt), Math.sin(tilt), 0);
  const P = (along_, side, out) => A.at(shift + dir.x * along_ + across.x * side, .02 + dir.y * along_ + across.y * side, out);
  for (let i = 0; i < count; i++) { const side = (i - (count - 1) / 2) * r * 2.2, lo = -.1 - i * .03, hi = length - .1 - i * .05; cane(c, P(lo, side, .035 + r), P(hi, side, .035 + r + .02), r * A.s, tone(col, .9 + i * .14), sk, { nodes: 4 }); }
  const span = count * r * 1.25 + .012;
  for (const [h, colour, mat, tall] of [[.1, wrapColor, 'cloth', .045], [.2, bracket, 'leather', .014], [-.02, bracket, 'leather', .014]]) {
    const o = P(h, 0, .035 + r), fr = frame(o, A.x.clone().multiplyScalar(across.x).addScaledVector(A.y, across.y), A.x.clone().multiplyScalar(dir.x).addScaledVector(A.y, dir.y), A.z);
    c.bag.solid(scaled(roundBox(span, tall, r + .009, .008), A.s), fr, sk, c.pal(colour), M(mat));
  }
  if (cord) for (const h of [.075, .125]) { const o = P(h, 0, .035 + r), fr = frame(o, A.x.clone().multiplyScalar(across.x).addScaledVector(A.y, across.y), A.x.clone().multiplyScalar(dir.x).addScaledVector(A.y, dir.y), A.z); c.bag.solid(scaled(roundBox(span + .003, .004, r + .012, .003), A.s), fr, sk, c.pal(cord), M('cloth')); }
}

/** Small bells hung under a sleeve hem or along an edge of the arm. `out` is the hem's distance from the arm's axis. */
function bells(c, { side = 'both', at = 1.84, count = 4, spread = 70, out = .12, color = 'brass', size = .017, drop = .02 }) {
  const { arm } = c.form, s = scaleOf(c), col = c.pal(color);
  sides(c, side, () => {
    for (let i = 0; i < count; i++) {
      const phi = (-90 + (i / Math.max(1, count - 1) - .5) * 2 * spread) * DEG, top = arm.point(at, phi, arm.radius(at) + out * s * (1 + .5 * -Math.sin(phi)) / 1.5), sk = arm.skin(at), R = size * s;
      cyl(c, top, top.clone().add(V(0, -drop * s, 0)), R * .1, R * .1, tone(col, .6), M('brass'), sk, { n: 4, caps: false });
      lathe(c, (p) => V(top.x + p.x, top.y - drop * s + p.y, top.z + p.z), [[R * .12, 0], [R * .5, -R * .25], [R * .85, -R * .8], [R, -R * 1.5], [R * 1.04, -R * 1.7], [R * .8, -R * 1.72]], col, M('brass'), sk, { n: 8 });
    }
  });
}

/** Reed pipes carried upright at the hip in a leather frame. */
function pipeCarrier(c, { at = 80, y = ['belt', -.02], count = 5, length = .2, r = .013, color = 'bamboo', frameColor = 'leatherDark', strap = 'leather', stud = 'brass' }) {
  const A = trunkAnchor(c, y, at, .026), sk = [['hips', .75], [at > 0 ? 'thigh.L' : 'thigh.R', .25]], col = c.pal(color), wide = count * r * 1.08 + .012;
  c.bag.solid(scaled(moved(roundBox(wide, length * .56, .008, .006), V(0, -length * .55, .004)), A.s), A.place, sk, c.pal(frameColor), M('leather'));
  for (let i = 0; i < count; i++) { const x = (i - (count - 1) / 2) * r * 2.12, lift = [.0, .03, .012, .04, .02][i % 5]; cane(c, A.at(x, -length * 1.08 + lift * .3, .014 + r), A.at(x, -.02 + lift, .014 + r), r * A.s, tone(col, .85 + .1 * (i % 3)), sk, { nodes: 3 }); }
  for (const yy of [-length * .3, -length * .82]) { c.bag.solid(scaled(moved(roundBox(wide + .004, .012, r + .012, .005), V(0, yy, .014 + r)), A.s), A.place, sk, c.pal(strap), M('leather')); for (const sx of [-1, 1]) c.bag.solid(scaled(moved(dome(.005, .004, 6), V(sx * wide * .8, yy, .027 + r * 2)), A.s), A.place, sk, c.pal(stud), M('brass')); }
  // Hanger loops up to the belt.
  for (const sx of [-.6, .6]) c.bag.solid(scaled(moved(roundBox(.009, .03, .004, .002), V(sx * wide, .0, .008)), A.s), A.place, sk, c.pal(strap), M('leather'));
}

/**
 * Resonator collar: a carved wooden yoke lying on the shoulders behind the neck, with two horns rising either
 * side of the head and a braced, lashed spine board down the back.
 */
function resonator(c, { color = 'wood', dark = 'woodDark', cap = 'leatherDark', cord = 'cord', height = .1, spread = 1.3, girth = .046 }) {
  const { J, S, trunk } = c.form, s = scaleOf(c), col = c.pal(color), sk = [['spine2', 1]], yS = trunk.Y.shoulder, zc = J.neck.z - .035 * s, topY = J.head.y + c.head.H * .95 + height * s;
  const yoke = [V(-S * .8, yS + .02 * s, zc + .01), V(-S * .45, yS + .05 * s, zc - .03 * s), V(0, yS + .055 * s, zc - .055 * s), V(S * .45, yS + .05 * s, zc - .03 * s), V(S * .8, yS + .02 * s, zc + .01)];
  sweep(c, yoke, (q) => girth * s * (1.05 + .25 * Math.sin(PI * q)), col, M('wood'), sk, { n: 8, rows: 12, flat: 1.5, side: V(0, 0, 1), tint: (u, v) => tone(col, .8 + .25 * Math.sin(u * TAU * 3 + v * 20)) });
  for (const sx of [-1, 1]) {
    const pts = [V(sx * S * .7, yS + .0 * s, zc), V(sx * S * 1.0, yS + .09 * s, zc - .01 * s), V(sx * S * spread, lerp(yS, topY, .3), zc - .02 * s), V(sx * S * spread * .96, lerp(yS, topY, .65), zc - .02 * s), V(sx * S * spread * .86, topY, zc - .015 * s)];
    sweep(c, pts, (q) => girth * s * lerp(1.2, .62, q ** .7), col, M('wood'), sk, { n: 9, rows: 18, flat: .85, side: V(1, 0, 0), tint: (u, v) => tone(col, .78 + .3 * Math.sin(u * TAU * 2 + v * 9)) });
    const tip = pts[4]; cyl(c, tip.clone().add(V(0, -.012 * s, 0)), tip.clone().add(V(0, .035 * s, 0)), girth * s * .7, girth * s * .62, c.pal(cap), M('leather'), sk, { n: 9, capTone: .3 });
    cyl(c, lerp3(pts[1], pts[2], .1), lerp3(pts[1], pts[2], .22), girth * s * 1.2, girth * s * 1.15, c.pal(dark), M('wood'), sk, { n: 9, caps: false });
  }
  // Spine board with its lashings.
  const A = trunkAnchor(c, ['chest', .02], 180, .012);
  c.bag.solid(scaled(moved(roundBox(.024, .11, .012, .005), V(0, .0, .012)), A.s), A.place, sk, c.pal(dark), M('wood'));
  c.bag.solid(scaled(moved(roundBox(.06, .022, .014, .006), V(0, .1, .014)), A.s), A.place, sk, col, M('wood'));
  for (const yy of [.06, .0, -.06]) c.bag.solid(scaled(moved(roundBox(.03, .005, .016, .003), V(0, yy, .012)), A.s), A.place, sk, c.pal(cord), M('cloth'));
}
const lerp3 = (a, b, t) => a.clone().lerp(b, t);

/**
 * Hair as a sculpted cap: a close crop, a cap of tight curls, a swept-back head of hair. `front`, `side` and
 * `nape` place the hairline (head units), `curl` raises knots of curl, `sweep` combs ridges front to back.
 */
function hairCap(c, { color = 'hair', streak = null, front = .3, side = .13, nape = -.25, lift = .02, curl = 0, freq = 9, sweep: comb = 0, top = 0 }) {
  const place = headPlace(c), col = c.pal(color), other = streak ? c.pal(streak) : tone(col, 1.5);
  const line = (phi) => { const a = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))); return lerp(lerp(front, side, smooth(.3, 1.05, a)), lerp(side * .2, nape, smooth(1.5, 2.6, a)), smooth(1.05, 1.5, a)); };
  c.bag.grid(Math.max(20, (curl ? freq * 5 : 36) * c.q), Math.max(8, (curl ? freq * 2.4 : 12) * c.q), (u, v) => {
    const phi = u * TAU, y = lerp(line(phi), .4995, v), knot = curl ? (.5 + .5 * Math.sin(phi * freq + Math.sin(y * 40) * 1.2)) * (.5 + .5 * Math.sin(y * freq * 5.2 + phi * 2)) : 0, ridge = comb ? .5 + .5 * Math.sin(Math.sin(phi) * 26 + y * 3) : 0;
    const off = lift * smooth(0, .12, v) * (1 + top * smooth(.2, .5, y)) + curl * knot + comb * ridge * smooth(0, .2, v) + .002;
    return { p: place(scalp(c, phi, y, off)), skin: HEAD, c: tone(col.clone().lerp(other, streak ? ridge * .6 + knot * .3 : 0), .75 + .5 * knot + .3 * ridge) };
  }, { closeU: true, color: col, mat: M('hair'), inside: c.head.C });
}

/** Close-fitting cap: a leather skull cap with raised seams and a band, a cloth hood drawn tight. */
function skullCap(c, { color = 'leather', mat = 'leather', front = .2, side = .02, nape = -.2, off = .022, seams = 4, seam = null, band = null, bandMat = null, peak = 0 }) {
  const place = headPlace(c), col = c.pal(color), sc = seam ? c.pal(seam) : tone(col, .6);
  const line = (phi) => { const a = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))); return lerp(lerp(front, side, smooth(.4, 1.2, a)), nape, smooth(1.4, 2.6, a)); };
  c.bag.grid(40 * c.q, 12 * c.q, (u, v) => {
    const phi = u * TAU, y = lerp(line(phi), .4995, v), on = seams ? Math.abs(Math.sin(phi * seams / 2)) < .09 : false;
    return { p: place(scalp(c, phi, y, off * (.55 + .45 * smooth(0, .15, v)) + (on ? .006 : 0) + peak * smooth(.3, .5, y))), skin: HEAD, c: on ? sc : col };
  }, { closeU: true, color: col, mat: M(mat), inside: c.head.C });
  if (band) c.bag.grid(40 * c.q, 3, (u, v) => { const phi = u * TAU, i = Math.round(v * 3); return { p: place(scalp(c, phi, line(phi) + [0, 0, .07, .07][i], off * .6 + [0, .012, .012, 0][i])), skin: HEAD }; }, { closeU: true, color: c.pal(band), mat: M(bandMat ?? mat), inside: c.head.C });
}

/**
 * Seed-pod mask of living bark: a pointed oval shield with a raised midrib and grain, two glowing eye slits and
 * moss growing from its rim.
 */
function seedMask(c, { color = 'bark', dark = 'barkDark', eye = 'ember', moss = 'moss', mossLight = 'mossLight', height = .66, width = .36, depth = .2, y = -.02, strap = 'leather' }) {
  const place = headPlace(c), col = c.pal(color), z0 = .3;
  const W = (b) => width * (1 - b * b) ** .62 + .004;
  const at = (a, b, lift = 0) => V(a * W(b), y + b * height, z0 + lift + depth * (1 - a * a) ** .8 * (1 - b * b * .55) + .035 * (1 - Math.abs(a)) ** 2 + .007 * Math.sin(a * W(b) * 70 + b * 3) * (1 - a * a));
  c.bag.grid(22 * c.q, 26 * c.q, (u, v) => { const a = u * 2 - 1, b = v * 2 - 1; return { p: place(at(a, b)), skin: HEAD, c: Math.abs(a) < .08 ? tone(col, 1.25) : tone(col, .7 + .4 * (.5 + .5 * Math.sin(a * W(b) * 70 + b * 3))) }; }, { color: col, mat: M('bark'), inside: c.head.C });
  c.bag.grid(10, 12, (u, v) => { const a = u * 2 - 1, b = v * 2 - 1; return { p: place(V(a * W(b), y + b * height, z0 - .03)), skin: HEAD }; }, { color: c.pal(dark), mat: M('bark'), inside: place(V(0, y, z0 + 1)) });
  // Layered rim scales either side.
  for (const sx of [-1, 1]) for (const b0 of [.35, -.05, -.45]) leaf(c, place(at(sx * .96, b0 + .2, -.01)), V(sx * .15, -1, -.1).normalize(), V(sx * .8, 0, .6).normalize(), .34 * c.head.H, .07 * c.head.H, c.pal(dark), M('bark'), HEAD, { cup: .5, rows: 3, tip: col });
  for (const sx of [-1, 1]) c.bag.grid(10, 2, (u, v) => { const ang = u * TAU, rr = [1, .6, 0][Math.round(v * 2)], ex = Math.cos(ang) * .042 * rr, ey = Math.sin(ang) * .14 * rr, a0 = sx * .43, b0 = .1; return { p: place(at(a0 + (ex + sx * ey * .32) / W(b0), b0 + (ey * .9) / height, .006)), skin: HEAD }; }, { closeU: true, color: c.pal(eye), mat: M('glow'), inside: c.head.C });
  for (let i = 0; i < 26 * (.5 + .5 * c.q); i++) { const sx = i % 2 ? 1 : -1, b = lerp(-.5, .95, c.rand()), root = at(sx * .98, b, -.02), n = V(sx * .7, .2, .5).normalize(); leaf(c, place(root), V(sx * (.5 + c.rand() * .5), .3 - c.rand() * .9, -.2 * c.rand()).normalize(), n, (.1 + c.rand() * .12) * c.head.H, .03 * c.head.H, tone(c.pal(moss), .7 + c.rand() * .6), M('moss'), HEAD, { tip: c.pal(mossLight), rows: 2, droop: .3 }); }
  if (strap) headBand(c, { y: .02, rise: .05, from: 70, to: 290, width: .07, color: strap });
}

/** Knotted cords hanging in a fringe from the waist, some ending in a bead. */
function fringe(c, { from = 20, to = 100, mirror = true, top = ['belt', -.02], bottom = .34, count = 9, width = .011, color = 'straw', mat = 'straw', bead = null, beadMat = 'glow', off = .016, vary = .25, knots = 7 }) {
  const drape = drapeOf(c), s = scaleOf(c), col = c.pal(color), y1 = Yof(c, top), yb = Yof(c, bottom), inner = (p) => V(0, p.y, c.form.spineZ(c.form.trunk.Y.hip));
  for (const sgn of mirror ? [1, -1] : [1]) for (let i = 0; i < count; i++) {
    const th = sgn * lerp(from, to, (i + .5) / count) * DEG, y0 = lerp(y1, yb, 1 - vary * c.rand()), lift = off * s * (1 + .5 * c.rand()), shade = tone(col, .75 + c.rand() * .5), w = width * s, rho = c.form.trunk.rho(c.form.trunk.Y.hip, th);
    c.bag.grid(1, Math.max(6, knots * 2), (u, v) => { const y = lerp(y1, y0, v), k = .55 + .45 * Math.abs(Math.sin(v * knots * PI)), p = drape.at(y, th + (u - .5) * 2 * w * k / rho, lift + .004 * s * k * (1 - Math.abs(u - .5) * 2)); return { p, skin: drape.skin(p), c: tone(shade, .7 + .4 * k) }; }, { color: shade, mat: M(mat), inside: inner });
    if (bead && i % 2 === 0) { const p = drape.at(y0 - .012 * s, th, lift + .004); ball(c, p, .011 * s, c.pal(bead), M(beadMat), drape.skin(p), { squash: [.8, 1.3, .8], n: 7 }); }
  }
}

/** Woven carrying basket on the back, mossed over, with saplings growing from it. */
function basket(c, { color = 'wicker', rim = 'bark', moss = 'moss', leafColor = 'leaf', leafLight = 'leafLight', stem = 'bark', at = ['chest', -.02], height = .36, top = .19, bottom = .1, out = .15, saplings = 3, grow = .26 }) {
  const A = trunkAnchor(c, at, 180, .0), sk = [['spine2', 1]], col = c.pal(color), s = A.s;
  const place = (p) => A.at(-p.x, p.y, out + p.z), half = height / 2, rAt = (h) => lerp(bottom, top, (h + half) / height);
  const rows = 9, profile = []; for (let i = 0; i <= rows; i++) { const h = lerp(-half, half, i / rows); profile.push([rAt(h) * (1 + .03 * (i % 2)), h]); }
  lathe(c, place, [[0, -half], ...profile], col, M('straw'), sk, { n: 22, squash: .82, tint: (u, v) => tone(col, (Math.round(u * 22 * Math.max(.6, c.q)) + Math.round(v * (rows + 1))) % 2 ? 1.12 : .7) });
  // Rim hoops and the upright stakes the weave runs through.
  for (const [h, rr] of [[half, .014], [half * .35, .008], [-half * .5, .008], [-half, .011]]) lathe(c, place, [[rAt(h) + .004 - rr, h], [rAt(h) + .004, h + rr], [rAt(h) + .004 + rr, h], [rAt(h) + .004, h - rr], [rAt(h) + .004 - rr, h]], c.pal(rim), M('bark'), sk, { n: 22, squash: .82 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, pA = place(V(Math.cos(a) * (bottom + .006), -half, Math.sin(a) * (bottom + .006) * .82)), pB = place(V(Math.cos(a) * (top + .008), half, Math.sin(a) * (top + .008) * .82)); cyl(c, pA, pB, .006 * s, .006 * s, tone(c.pal(rim), .9), M('bark'), sk, { n: 5, caps: false }); }
  lathe(c, place, [[top - .004, half - .01], [top * .6, half + .012], [0, half + .02]], c.pal(moss), M('moss'), sk, { n: 14, squash: .82 });
  for (let i = 0; i < saplings; i++) {
    const x = (i - (saplings - 1) / 2) * top * .9, tall = grow * (i === (saplings - 1) / 2 ? 1.15 : .85), base = place(V(x, half + .01, (i % 2) * .02)), tipP = place(V(x * 1.25, half + tall, .0));
    sweep(c, [base, base.clone().lerp(tipP, .5).add(V(.01 * s * (i - 1), 0, 0)), tipP], (q) => .0065 * s * (1 - q * .7), c.pal(stem), M('bark'), sk, { n: 5, rows: 5 });
    for (let k = 0; k < 7; k++) { const f = .3 + k / 7 * .7, root = base.clone().lerp(tipP, f), sx = k % 2 ? 1 : -1, d = V(sx * .8, .55, (k % 3 - 1) * .3).normalize(); leaf(c, root, k === 6 ? V(0, 1, 0) : d, V(0, .5, 1).normalize(), .085 * s * (1 - f * .3), .026 * s, c.pal(leafColor), M('moss'), sk, { tip: c.pal(leafLight), cup: .4, rows: 3, droop: .1 }); }
  }
}

/** One sealed ampoule in the anchor's frame: glass between two metal caps, with a stopper. */
function ampoule(c, A, x, y0, len, r, z, sk, glass, capCol, { holder = null } = {}) {
  const P = (yy, zz = z) => A.at(x, yy, zz + r);
  cyl(c, P(y0), P(y0 + len), r * A.s, r * A.s, glass, M('glow'), sk, { n: 8, caps: false });
  for (const [a, b, k] of [[y0 - r * .5, y0 + len * .14, 1.16], [y0 + len * .86, y0 + len + r * .3, 1.16], [y0 + len + r * .3, y0 + len + r * 1.1, .6]]) cyl(c, P(a), P(b), r * k * A.s, r * k * A.s, capCol, M('brass'), sk, { n: 8 });
  if (holder) c.bag.solid(scaled(moved(roundBox(r * 1.35, len * .16, r * 1.3, r * .4), V(x, y0 + len * .5, z + r * .8)), A.s), A.place, sk, holder, M('leather'));
}

/** Ampoules clipped to the body: around a belt, or racked at a hip. Each entry of `at` is an angle in degrees. */
function vials(c, { at, y = 'belt', length = .07, r = .015, off = .026, color = 'glass', cap = 'brass', holder = 'leather', drop = .5, bone = null, rack = null }) {
  for (const th of at) { const A = trunkAnchor(c, y, th, off), sk = bone ?? c.form.trunk.skin(A.o); ampoule(c, A, 0, -length * drop, length, r, 0, sk, c.pal(color), c.pal(cap), { holder: holder ? c.pal(holder) : null }); }
  if (rack) { const mid = at.reduce((a, b) => a + b, 0) / at.length, A = trunkAnchor(c, y, mid, off - .012), sk = bone ?? c.form.trunk.skin(A.o), w = rack.width ?? .05; c.bag.solid(scaled(moved(roundBox(w, length * .55, .008, .005), V(0, -length * drop + length * .5, .004)), A.s), A.place, sk, c.pal(rack.color ?? 'leather'), M('leather')); for (const yy of [.2, .8]) c.bag.solid(scaled(moved(roundBox(w + .004, .01, r + .012, .004), V(0, -length * drop + length * yy, r + .012)), A.s), A.place, sk, c.pal(rack.strap ?? 'leatherDark'), M('leather')); }
}

/** Box pack on the back: body, buckled flap, a front pocket, metal corners and ampoules standing in its top. */
function backpack(c, { at = ['chest', -.03], size = [.085, .1, .045], color = 'leather', dark = 'leatherDark', trim = 'brass', glass = 'glass', tubes = 3, tube = .09 }) {
  const A = trunkAnchor(c, at, 180, .01), sk = [['spine2', 1]], [w, h, d] = size, B = (shape, x, y, z, col, mat) => c.bag.solid(scaled(moved(shape, V(x, y, z)), A.s), A.place, sk, c.pal(col), M(mat));
  B(roundBox(w, h, d, .01), 0, 0, d, color, 'leather');
  B(roundBox(w + .004, h * .42, .006, .004), 0, h * .5, d * 2 + .003, dark, 'leather');
  B(roundBox(w * .62, h * .34, .012, .006), 0, -h * .42, d * 2 + .008, color, 'leather');
  B(roundBox(w * .66, h * .12, .004, .003), 0, -h * .16, d * 2 + .021, dark, 'leather');
  for (const sx of [-.5, .5]) { B(roundBox(.01, h * .3, .004, .002), sx * w, h * .28, d * 2 + .011, dark, 'leather'); c.bag.solid(scaled(moved(buckleShape(.011, .012, .003), V(sx * w, h * .08, d * 2 + .014)), A.s), A.place, sk, c.pal(trim), M('brass')); }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) B(roundBox(.013, .013, d * .5, .003), sx * (w - .008), sy * (h - .008), d * 1.52, trim, 'brass');
  for (let i = 0; i < tubes; i++) ampoule(c, A, (i - (tubes - 1) / 2) * w * .62, h - .012, tube, .016, d - .016, sk, c.pal(glass), c.pal(trim));
  B(roundBox(w * .9, .012, d * .7, .005), 0, h + .012, d, dark, 'leather');
}

/** A pouch with a flap: strapped to a thigh (`limb`) or hung on the trunk (`y`, `th`). */
function pouch(c, { limb = 'leg', side = 'both', at = .45, phi = 85, y = null, th = 0, size = [.045, .06, .018], off = .012, color = 'leather', dark = 'leatherDark', trim = 'brass', strap = true, mat = 'leather', trimMat = 'brass' }) {
  const [w, h, d] = size;
  const build = (place, sk, s) => {
    const B = (shape, x, yy, z, col, mat) => c.bag.solid(scaled(moved(shape, V(x, yy, z)), s), place, sk, c.pal(col), M(mat));
    B(roundBox(w, h, d, .008), 0, 0, d, color, mat); B(roundBox(w + .003, h * .45, .005, .003), 0, h * .5, d * 2 + .003, dark, mat);
    B(roundBox(.008, h * .22, .003, .002), 0, h * .12, d * 2 + .009, dark, 'leather'); c.bag.solid(scaled(moved(dome(.006, .004, 7), V(0, h * -.04, d * 2 + .008)), s), place, sk, c.pal(trim), M(trimMat));
    for (const sx of [-1, 1]) B(roundBox(.004, h * .44, .003, .002), sx * (w + .001), h * .5, d * 2 + .004, trim, trimMat);
  };
  if (y !== null) { const A = trunkAnchor(c, y, th, off); build(frame(A.o, A.x, A.y, A.z), c.form.trunk.skin(A.o), A.s); return; }
  const chain = c.form[limb], s = scaleOf(c);
  sides(c, side, () => { build(limbFrame(chain, at, phi * DEG, off * s), chain.skin(at), s); if (strap) for (const dt of [-.07, .07]) limbBand(c, chain, { t: at + dt, width: .018 * s, off: .008 * s, thick: .004, color: c.pal(dark), mat: M('leather') }); });
}

/** Filter mask over nose and mouth: a moulded cup with a metal frame, a canister either side and head straps. */
function respirator(c, { color = 'leatherDark', frameColor = 'brass', rim = 'glass', strap = 'leatherDark', canister = .1, small = false }) {
  const place = headPlace(c), col = c.pal(color), fr = c.pal(frameColor), span = 50 * DEG, top = -.035, bottom = -.47;
  const cup = (phi, y, lift = 0) => face(c, phi, y, .035 + .045 * (1 - (phi / span) ** 2) * Math.sin(PI * clamp((y - bottom) / (top - bottom), 0, 1)) ** .6 + lift);
  c.bag.grid(18 * c.q, 10 * c.q, (u, v) => ({ p: place(cup(lerp(-span, span, u), lerp(top, bottom, v))), skin: HEAD }), { color: col, mat: M('leather'), inside: c.head.C });
  // Frame: a rim around the cup and a keel down its middle.
  for (const run of [(q) => [lerp(-span, span, q), top], (q) => [lerp(-span, span, q), bottom], (q) => [-span, lerp(top, bottom, q)], (q) => [span, lerp(top, bottom, q)], (q) => [0, lerp(top, bottom, q)]]) sweep(c, [0, .25, .5, .75, 1].map((q) => { const [phi, y] = run(q); return place(cup(phi, y, .006)); }), .013 * c.head.H, fr, M('brass'), HEAD, { n: 5, rows: 6 });
  for (const sx of [-1, 1]) {
    const o = cup(sx * span * .98, -.27, .0), d = V(sx * .82, -.08, .56).normalize(), R = canister * (small ? .7 : 1), x = new Vector3().crossVectors(V(0, 1, 0), d).normalize(), y = new Vector3().crossVectors(d, x), P = (k) => place(o.clone().addScaledVector(d, k));
    cyl(c, P(-.03), P(.1), R * c.head.H, R * c.head.H, fr, M('brass'), HEAD, { n: 12, capTone: .25 });
    cyl(c, P(.085), P(.115), R * 1.12 * c.head.H, R * 1.12 * c.head.H, c.pal(rim), M('enamel'), HEAD, { n: 12, capTone: .2 });
    for (let k = 0; k < 3; k++) { const a = k / 3 * PI, e = x.clone().multiplyScalar(Math.cos(a)).addScaledVector(y, Math.sin(a)); cyl(c, place(o.clone().addScaledVector(d, .118).addScaledVector(e, -R * .95)), place(o.clone().addScaledVector(d, .118).addScaledVector(e, R * .95)), .01 * c.head.H, .01 * c.head.H, fr, M('brass'), HEAD, { n: 4, caps: false }); }
  }
  headBand(c, { y: -.13, rise: .16, from: 52, to: 308, width: .06, color: strap });
  headBand(c, { y: -.3, rise: -.02, from: 52, to: 308, width: .05, color: strap });
}

/**
 * Glass reagent tanks carried behind the shoulders: a globe half full of liquid in a metal cradle with a valve
 * on top, and a standpipe with a spout rising behind one shoulder.
 */
function tanks(c, { glass = 'glassPale', liquid = 'glass', metal = 'brass', r = .075, spread = 1.02, back = .095, lift = .0, pipe = 'L', pipeRise = .2 }) {
  const { J, S, trunk } = c.form, s = scaleOf(c), sk = [['spine2', 1]], y = trunk.Y.shoulder + lift * s, z = J['upperarm.L'].z - back * s, R = r * s, fe = c.pal(metal);
  for (const sx of [-1, 1]) {
    const C = V(sx * S * spread, y, z), place = (p) => V(C.x + p.x, C.y + p.y, C.z + p.z), arc = (a0, a1, n) => { const out = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); out.push([Math.cos(a) * R, Math.sin(a) * R]); } return out; };
    lathe(c, place, arc(-PI / 2, -.05, 6), c.pal(liquid), M('glow'), sk, { n: 14 });
    lathe(c, place, arc(-.05, PI / 2 - .25, 6), c.pal(glass), M('enamel'), sk, { n: 14 });
    lathe(c, place, [[R * 1.04, -.012 * s], [R * 1.09, 0], [R * 1.04, .012 * s]], fe, M('brass'), sk, { n: 14 });
    cyl(c, place(V(0, R * .93, 0)), place(V(0, R * 1.25, 0)), R * .3, R * .26, fe, M('brass'), sk, { n: 9 });
    cyl(c, place(V(0, R * 1.25, 0)), place(V(0, R * 1.36, 0)), R * .42, R * .42, fe, M('brass'), sk, { n: 9 });
    cyl(c, place(V(0, R * 1.36, 0)), place(V(0, R * 1.62, 0)), R * .2, R * .26, tone(fe, .8), M('brass'), sk, { n: 8 });
    cyl(c, place(V(0, -R * .95, 0)), place(V(0, -R * 1.3, 0)), R * .34, R * .22, fe, M('brass'), sk, { n: 9 });
    // Cradle arm back to the harness.
    sweep(c, [place(V(0, -R * 1.2, 0)), place(V(-sx * R * .7, -R * 1.5, R * .3)), V(sx * S * .45, y - R * 1.3, trunk.at(y - R * 1.3, PI, .01).z)], .012 * s, fe, M('brass'), sk, { n: 6, rows: 6 });
  }
  if (pipe) {
    const sx = pipe === 'L' ? 1 : -1, x = sx * S * .52, zb = trunk.at(trunk.Y.chest, PI, .0).z - .035 * s, top = J.head.y + c.head.H * .95 + pipeRise * s, rr = .016 * s;
    cyl(c, V(x, trunk.Y.ribs, zb), V(x, top, zb), rr, rr, fe, M('brass'), sk, { n: 8 });
    for (const yy of [trunk.Y.chest, trunk.Y.shoulder + .08 * s, top - .05 * s]) cyl(c, V(x, yy - .012 * s, zb), V(x, yy + .012 * s, zb), rr * 1.5, rr * 1.5, tone(fe, .85), M('brass'), sk, { n: 8 });
    cyl(c, V(x, top, zb), V(x, top + .03 * s, zb), rr * 1.3, rr * 1.3, fe, M('brass'), sk, { n: 8 });
    cyl(c, V(x - sx * .01 * s, top - .012 * s, zb), V(x + sx * .11 * s, top - .012 * s, zb), rr * .85, rr * .85, fe, M('brass'), sk, { n: 8 });
    cyl(c, V(x + sx * .11 * s, top - .012 * s, zb), V(x + sx * .14 * s, top - .012 * s, zb), rr * 1.2, rr * 1.2, tone(fe, .85), M('brass'), sk, { n: 8, capTone: .2 });
  }
}

/** A knot of hair: a bun at the nape or crown, wound so its coils read. Position in head units. */
function knot(c, { at = [0, 0, -.5], r = .15, color = 'hair', streak = null, squash = [1, .85, .9], tie = null }) {
  const place = headPlace(c), col = c.pal(color), other = streak ? c.pal(streak) : tone(col, 1.5), C = place(V(...at));
  ball(c, C, r * c.head.H, col, M('hair'), HEAD, { squash, n: 14, tint: (d) => tone(col.clone().lerp(other, .5 + .5 * Math.sin(Math.atan2(d.z, d.x) * 5 + d.y * 7)), .8 + .25 * Math.sin(Math.atan2(d.z, d.x) * 11 + d.y * 3)) });
  if (tie) c.bag.solid(ring(r * .7 * c.head.H, r * .7 * c.head.H, .012 * c.head.H, 14, 5), (p) => V(C.x + p.x, C.y + p.z, C.z + r * .55 * c.head.H + p.y * .2), HEAD, c.pal(tie), M('gold'));
}

/**
 * Folded visor: a band across the eyes and an angular shield running down over the nose and mouth to a point
 * below the chin, edged in metal, over a cloth veil, held by a strap with a clasp at the back of the head.
 */
function visor(c, { color = 'ivory', trim = 'gold', veil = 'grey', strap = 'grey', top = .2, eye = -.02, point = -.64, half = 42, wrap = 80 }) {
  const place = headPlace(c), col = c.pal(color), gold = c.pal(trim), span = wrap * DEG, hw = half * DEG;
  const on = (phi, y, off) => { const yy = Math.max(y, -.485), p = face(c, phi, yy, off); if (y < yy) { p.y -= yy - y; p.z -= (yy - y) * .25; } return p; };
  if (veil) c.bag.grid(16 * c.q, 8 * c.q, (u, v) => ({ p: place(on(lerp(-span * .8, span * .8, u), lerp(eye + .02, -.485, v), .018)), skin: HEAD }), { color: c.pal(veil), mat: M('cloth'), inside: c.head.C });
  c.bag.grid(22 * c.q, 4, (u, v) => { const phi = lerp(-span, span, u); return { p: place(on(phi, lerp(top, eye, v), .034 + .016 * (1 - Math.abs(phi) / span))), skin: HEAD }; }, { color: col, mat: M('enamel'), inside: c.head.C });
  const w = (y) => hw * clamp((y - point) / (top - point), 0, 1) ** .6, shield = (a, v, lift = 0) => { const y = lerp(top, point, v); return on(a * w(y), y, .04 + .06 * (1 - Math.abs(a)) * (1 - v * .4) + lift); };
  c.bag.grid(Math.max(6, 10 * c.q), 12 * c.q, (u, v) => ({ p: place(shield(u * 2 - 1, v)), skin: HEAD }), { color: col, mat: M('enamel'), inside: c.head.C });
  const line = (pts, r = .012) => sweep(c, pts.map(place), r * c.head.H, gold, M('gold'), HEAD, { n: 5, rows: 10 });
  for (const sx of [-1, 1]) line([0, .2, .4, .6, .8, 1].map((v) => shield(sx, v, .004)));
  line([0, .25, .5, .75, 1].map((v) => shield(0, v, .008)), .008);
  for (const y of [top, eye]) line([-1, -.6, -.2, .2, .6, 1].map((a) => on(a * span, y, .04 + .016 * (1 - Math.abs(a)))), .01);
  if (strap) { headBand(c, { y: (top + eye) / 2, from: wrap, to: 360 - wrap, width: (top - eye) * .8, off: .014, thick: .012, color: strap, mat: 'cloth' }); const o = scalp(c, PI, (top + eye) / 2, .03); c.bag.solid(roundBox(.1 * c.head.H, .07 * c.head.H, .02 * c.head.H, .008 * c.head.H), (p) => place(o).add(V(-p.x, p.y, -p.z)), HEAD, gold, M('gold')); }
}

/** Lotus boss on the belt: a fan of pointed petals in enamel over a metal backing, with a bud at its heart. */
function lotus(c, { at = 0, y = 'belt', color = 'ivory', trim = 'gold', size = .085, off = .03, petals = 5 }) {
  const A = trunkAnchor(c, y, at, off), sk = c.form.trunk.skin(A.o), col = c.pal(color), gold = c.pal(trim), s = A.s;
  const dir = (lx, ly, lz) => A.x.clone().multiplyScalar(lx).addScaledVector(A.y, ly).addScaledVector(A.z, lz).normalize();
  for (const [layer, len, wide, z, colour, mat] of [[0, 1.12, 1.2, .0, gold, 'gold'], [1, 1, 1, .007, col, 'enamel']]) {
    for (let i = 0; i < petals; i++) { const a = (i - (petals - 1) / 2) * (150 / (petals - 1)) * DEG, k = 1 - Math.abs(a) / 2.2, lift = z + (1 - k) * -.004; leaf(c, A.at(Math.sin(a) * .008, -.018, lift), dir(Math.sin(a), Math.cos(a), .22), A.z, size * s * len * (.72 + .28 * k), size * .34 * s * wide, colour, M(mat), sk, { cup: .5, rows: 4, belly: .35 }); }
    for (const sx of [-1, 1]) leaf(c, A.at(sx * .012, -.02, z - .002), dir(sx * .8, -.6, .15), A.z, size * .55 * s * len, size * .26 * s * wide, colour, M(mat), sk, { cup: .5, rows: 3, belly: .35 });
    void layer;
  }
  leaf(c, A.at(0, -.022, .016), dir(0, 1, .3), A.z, size * .62 * s, size * .2 * s, tone(col, 1.05), M('enamel'), sk, { cup: .8, rows: 4, belly: .35 });
  c.bag.solid(scaled(moved(roundBox(size * .2, size * .12, .008, .004), V(0, -.03, .012)), s), A.place, sk, gold, M('gold'));
}

// ---------------------------------------------------------------------------------------------------------
// Tidal Observatory

/** A horn of plate standing up off the shoulder: broad at its root, its outer edge sweeping up and out to a point. */
function fin(c, { side = 'R', spine = [[.0, .0], [.15, .1], [.26, .28], [.28, .5]], width = .2, thick = .016, color = 'meteor', mat = 'meteor', edge = 'bronze', edgeMat = 'brass', forward = .0, tilt = 12 }) {
  const { J } = c.form, s = scaleOf(c), sh = J['upperarm.L'], pts = spine.map(([x, y]) => V(x * s, y * s, 0));
  sides(c, side, () => {
    const o = V(sh.x - .04 * s, sh.y + .05 * s, sh.z + forward * s), tl = tilt * DEG, place = frame(o, V(Math.cos(tl), 0, -Math.sin(tl)), V(0, 1, 0), V(Math.sin(tl), 0, Math.cos(tl)));
    const outer = (q) => { const p = along(pts, q); return [p.x, p.y]; };
    const inner_ = (q) => { const p = along(pts, q), t = along(pts, Math.min(1, q + .02)).sub(along(pts, Math.max(0, q - .02))).normalize(), w = width * s * (1 - q) ** .8 * (.55 + .45 * smooth(0, .25, q)); return [p.x - t.y * w, p.y + t.x * w]; };
    plateLoft(c, place, [['shoulder.L', .6], ['spine2', .4]], outer, inner_, { thick: thick * s, color, mat, edge, edgeMat, n: 20 });
    // Its mount: a boss and a plate clamped over the shoulder.
    c.bag.solid(scaled(moved(dome(.04, .02, 10), V(.02, .02, thick / 2)), s), place, [['shoulder.L', 1]], c.pal(edge), M(edgeMat));
  });
}

/** A crescent plate hung on the body: the moon worn at the hip. Angles are in the plane of the plate (0 points along the body's girth). */
function moon(c, { at = 62, y = ['belt', -.1], r = .11, a0 = 110, a1 = 320, width = .075, thick = .012, off = .03, color = 'silver', mat = 'silver', edge = null, inlay = { color: 'violet', from: .3, to: .7 }, bone = null }) {
  const A = trunkAnchor(c, y, at, off), sk = bone ?? [['hips', .6], [at > 0 ? 'thigh.L' : 'thigh.R', .4]];
  crescentPlate(c, (p) => A.at(p.x, p.y, p.z), sk, { r, a0, a1, width, thick, color, mat, edge, inlay, n: 26 });
}

/** Closed helm: a smooth dome down to the jaw, a brow band, a disc over each ear and glowing vertical sight slits. */
function helm(c, { color = 'meteor', mat = 'meteor', band = 'bronze', slit = 'slit', slits = 3, size = [.52, .6, .6], drop = -.6 }) {
  const place = headPlace(c), col = c.pal(color), [rx, ry, rz] = size, z0 = .02, y0 = .0;
  const shell = (phi, y, lift = 0) => { const cy = clamp(y / ry, -1, 1), st = Math.sqrt(Math.max(0, 1 - cy * cy)), jaw = 1 - .12 * smooth(-.2, -.6, y) * Math.max(0, Math.cos(phi)) - .1 * smooth(-.25, -.6, y); return V(Math.sin(phi) * st * (rx + lift) * jaw, y0 + y + lift * cy, z0 + Math.cos(phi) * st * (Math.cos(phi) > 0 ? rz + .04 : rz) * jaw + lift * Math.cos(phi) * st); };
  c.bag.grid(34 * c.q, 18 * c.q, (u, v) => ({ p: place(shell(u * TAU, lerp(drop, ry * .999, v))), skin: HEAD }), { closeU: true, color: col, mat: M(mat), inside: c.head.C });
  c.bag.grid(34 * c.q, 1, (u, v) => ({ p: place(shell(u * TAU, drop, -v * .08)), skin: HEAD }), { closeU: true, color: tone(col, .4), mat: M(mat), inside: place(V(0, drop - .5, 0)) });
  // Brow band and the crest strip over the crown.
  for (const [ya, yb] of [[.2, .26]]) c.bag.grid(34 * c.q, 3, (u, v) => { const i = Math.round(v * 3); return { p: place(shell(u * TAU, lerp(ya, yb, [0, 0, 1, 1][i]) - .1 * Math.max(0, -Math.cos(u * TAU)), [0, .014, .014, 0][i])), skin: HEAD }; }, { closeU: true, color: c.pal(band), mat: M('brass'), inside: c.head.C });
  for (const sx of [-1, 1]) { const o = shell(sx * PI / 2, .0, .0), fr = (p) => place(V(o.x + sx * p.z, o.y + p.y, o.z + p.x)); c.bag.solid(moved(dome(.15, .05, 12), V(0, 0, 0)), fr, HEAD, c.pal(band), M('brass')); c.bag.solid(moved(dome(.095, .04, 10), V(0, 0, .035)), fr, HEAD, tone(col, 1.2), M(mat)); c.bag.solid(moved(dome(.04, .03, 8), V(0, 0, .065)), fr, HEAD, c.pal(band), M('brass')); }
  for (let i = 0; i < slits; i++) { const k = i - (slits - 1) / 2, phi = k * .2, tall = k === 0 ? .2 : .15; c.bag.grid(2, 5, (u, v) => { const y = lerp(-tall, tall, v) - .02, w = .028 * Math.sin(PI * clamp(v, .04, .96)) ** .6; return { p: place(shell(phi + (u - .5) * 2 * w + k * .04 * (y + .1), y, .006)), skin: HEAD }; }, { color: c.pal(slit), mat: M('glow'), inside: c.head.C }); }
}

/**
 * Astrolabe collar: a broad ring of metal and enamel standing round the neck, an inner ring against the throat,
 * and a jointed quadrant arm rising behind one shoulder to carry an orb over the head.
 */
function astrolabe(c, { metal = 'silver', enamel = 'violet', radius = .15, arm = 'L', reach = .5, orb = .03, tall = 1.8 }) {
  const { J, trunk } = c.form, s = scaleOf(c), k = c.form.k, R = radius * k, sk = [['spine2', 1]], y = trunk.Y.base + .028 * s, zc = J.neck.z + .012, tl = -.16;
  const ring_ = (p) => V(p.x, y + p.y * tall * Math.cos(tl) - p.z * Math.sin(tl), zc + p.z * Math.cos(tl) + p.y * tall * Math.sin(tl)), place = (p) => V(p.x, y + p.y * Math.cos(tl) - p.z * Math.sin(tl), zc + p.z * Math.cos(tl) + p.y * Math.sin(tl)), fe = c.pal(metal), u = s;
  lathe(c, ring_, [[R - .034 * u, -.004 * u], [R - .03 * u, .02 * u], [R - .006 * u, .03 * u], [R + .014 * u, .022 * u], [R + .02 * u, .004 * u], [R + .012 * u, -.014 * u], [R - .02 * u, -.016 * u], [R - .034 * u, -.004 * u]], fe, M('silver'), sk, { n: 30 });
  lathe(c, ring_, [[R + .0215 * u, -.002 * u], [R + .0225 * u, .004 * u], [R + .0205 * u, .011 * u]], c.pal(enamel), M('enamel'), sk, { n: 30 });
  lathe(c, place, [[R * .66, .012 * u], [R * .66 + .004 * u, .04 * u], [R * .66 + .016 * u, .044 * u], [R * .66 + .02 * u, .016 * u], [R * .66, .012 * u]], fe, M('silver'), sk, { n: 24 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.bag.solid(scaled(dome(.005, .004, 6), u), (p) => place(V(Math.cos(a) * (R - .008 * u) + p.x, .03 * u * tall + p.z, Math.sin(a) * (R - .008 * u) + p.y)), sk, tone(fe, 1.2), M('silver')); }
  if (arm) {
    const sx = arm === 'L' ? 1 : -1, h = reach * s, pts = [V(sx * R * .72, .02 * u, -R * .72), V(sx * R * 1.2, h * .22, -R * .95), V(sx * R * 1.42, h * .55, -R * .8), V(sx * R * 1.3, h * .84, -R * .5), V(sx * R * 1.0, h, -R * .25)].map(place);
    sweep(c, pts, (q) => .017 * u * (1 - q * .3), fe, M('silver'), sk, { n: 6, rows: 18, flat: .55, side: V(0, 0, 1) });
    sweep(c, pts.map((p) => p.clone().add(V(0, 0, .006 * u))), .006 * u, c.pal(enamel), M('enamel'), sk, { n: 4, rows: 14, caps: false });
    for (const q of [0, .5]) ball(c, along(pts, q), .024 * u, fe, M('silver'), sk, { n: 9 });
    const tip = pts[4]; ball(c, tip, orb * u, c.pal(enamel), M('enamel'), sk, { n: 12 });
    c.bag.solid(scaled(ring(orb * 1.12, orb * 1.12, .004, 16, 5), u), frame(tip, V(1, 0, 0), V(0, 0, 1), V(0, 1, 0)), sk, fe, M('silver'));
  }
}

/** Orb boss: an enamel globe held in metal rings on a backing disc, with a tag hanging below. */
function orb(c, { at = 0, y = 'belt', r = .05, metal = 'silver', enamel = 'violet', off = .03, tag = true }) {
  const A = trunkAnchor(c, y, at, off), sk = c.form.trunk.skin(A.o), fe = c.pal(metal), s = A.s, C = A.at(0, 0, r * .7);
  const fr = frame(A.o, A.x, A.y, A.z);
  c.bag.solid(scaled(dome(r * 1.5, r * .3, 16), s), fr, sk, fe, M('silver'));
  c.bag.solid(scaled(moved(ring(r * 1.32, r * 1.32, r * .13, 20, 6), V(0, 0, r * .3)), s), fr, sk, tone(fe, 1.15), M('silver'));
  ball(c, C, r * s, c.pal(enamel), M('enamel'), sk, { n: 14 });
  c.bag.solid(scaled(moved(ring(r * 1.04, r * 1.04, r * .07, 18, 5), V(0, 0, r * .7)), s), fr, sk, fe, M('silver'));
  c.bag.solid(scaled(moved(ring(r * 1.04, r * 1.04, r * .07, 18, 5), V(0, 0, r * .7), turned(V(0, 1, 0), PI / 2)), s), fr, sk, fe, M('silver'));
  if (tag) { c.bag.solid(scaled(moved(roundBox(r * .16, r * .5, .004, .002), V(0, -r * 1.9, .006)), s), fr, sk, fe, M('silver')); c.bag.solid(scaled(moved(roundBox(r * .36, r * .6, .006, .003), V(0, -r * 2.9, .008)), s), fr, sk, tone(fe, .9), M('gold')); }
}

/** Weights hung on chains from the hem of the coat: banded metal spheres. Needs a coat. */
function hemOrbs(c, { count = 8, r = .042, drop = .04, metal = 'silver', enamel = 'violet', start = 22 }) {
  if (!c.coat) throw new Error('b.hemOrbs needs a coat');
  const s = scaleOf(c), fe = c.pal(metal), en = c.pal(enamel);
  for (let i = 0; i < count; i++) {
    const th = (start + i * 360 / count) * DEG, top = c.coat.at(c.coat.yHem + .012 * s, th, .008), sk = c.coat.skin(top), R = r * s * (i % 2 ? .86 : 1), C = top.clone().add(V(0, -(drop * s + R), 0));
    c.bag.solid(scaled(dome(.014, .008, 8), s), frame(top, V(1, 0, 0), V(0, 0, -1), V(0, -1, 0)), sk, fe, M('silver'));
    for (let k = 0; k < 3; k++) { const a = top.clone().add(V(0, -drop * s * k / 3, 0)); c.bag.solid(scaled(ring(.006, .009, .002, 8, 4), s), frame(a.add(V(0, -drop * s / 6, 0)), k % 2 ? V(1, 0, 0) : V(0, 0, 1), V(0, 1, 0)), sk, fe, M('silver')); }
    ball(c, C, R, fe, M('silver'), sk, { n: 12, tint: (d) => (Math.abs(d.y) < .16 || Math.abs(d.x) < .12 ? en : fe) });
    c.bag.solid(scaled(dome(.012, .01, 7), s), frame(C.clone().add(V(0, R, 0)), V(1, 0, 0), V(0, 0, -1), V(0, 1, 0)), sk, fe, M('silver'));
  }
}

export { M, SURFACE, Yof, scaleOf, tone, cyl, ball, along, sweep, lathe, leaf, trunkAnchor, scaled, turned, drapeOf, plateLoft, crescentPlate, cane, headBand, ampoule };
export const BUILDERS_B = { torso, sleeve, legs, sash, strip, hang, coat, collar, neck: neckWrap, guard, spikes, studs, cords, shag, wing, headBand, beakMask, tail, reedPipes, bells, pipeCarrier, resonator, hairCap, skullCap, seedMask, fringe, basket, vials, backpack, pouch, respirator, tanks, knot, visor, lotus, fin, moon, helm, astrolabe, orb, hemOrbs };
/** The same builders under their recipe names (`b.` prefix), for a recipe's `builders` field. */
export const B = Object.fromEntries(Object.entries(BUILDERS_B).map(([name, build]) => [`b.${name}`, build]));
void [box, slab, slabY, trunkBand, Quaternion];
