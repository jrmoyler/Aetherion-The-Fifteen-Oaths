// Builders for the heroes of Oaths 11 to 15 (group c), named with a `c:` prefix. A recipe brings them with
// `builders: C`.
//
// Three of them are general tools and carry most of these ten costumes:
//   c:kit    hard gear assembled from primitives (boxes, bars, rings, cylinders, prisms) on an anchor frame:
//            a point on the trunk, a limb, the head, a foot or a bone. Cases, clasps, vials, packs, flywheels.
//   c:drape  cloth hanging from the waist between two angles with any hem line: asymmetric tunic skirts, tabards,
//            coat tails and open-fronted long coats, with lining and sewn trim.
//   c:patch  cloth or plate panels cut on the trunk's surface (wrap-over fronts, lapels, vest panels) with trim.
// The rest are fitted pieces: standing collars, bell sleeves, hoses and chains, head shells and bands, and hair.
import { Euler, Quaternion, Vector3 } from 'three';
import { MAT, TAU, V, bar, box, clamp, dome, frame, lerp, moved, ring, roundBox, smooth } from './kernel.js';
import { BUILDERS, HEAD, face, headPlace, limbFrame, scalp, sides } from './builders.js';

const PI = Math.PI, DEG = PI / 180, UP = V(0, 1, 0);

/** Surface classes beyond the shared ones: (roughness, metalness, shader kind). */
export const MATC = {
  // Smooth worked surfaces use the shader's plainest class (4): no grain, only a faint mottle, so polished metal,
  // lacquer, glass and porcelain stay clean beside the woven cloth and tanned leather.
  ...MAT, brass: [.4, .9, 4], steel: [.44, .86, 4], silver: [.36, .92, 4], glass: [.1, .5, 4], lacquer: [.34, .08, 4], porcelain: [.3, 0, 4],
  enamel: [.3, .2, 4], rubber: [.82, 0, 2], velvet: [1, 0, 0], glow: MAT.ember,
};
const matOf = (name) => { const m = MATC[name]; if (!m) throw new Error(`group c: unknown material "${name}"`); return m; };
const quat = (rot) => new Quaternion().setFromEuler(new Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG));
/** Piecewise-linear function through [x, y] knots (a number is a constant). */
const knots = (k) => (typeof k === 'number' ? () => k : (x) => {
  if (x <= k[0][0]) return k[0][1]; if (x >= k[k.length - 1][0]) return k[k.length - 1][1];
  let i = 0; while (x > k[i + 1][0]) i++;
  return lerp(k[i][1], k[i + 1][1], (x - k[i][0]) / (k[i + 1][0] - k[i][0]));
});
const mergeSkin = (pairs) => { const sum = {}; for (const [bone, w] of pairs) sum[bone] = (sum[bone] ?? 0) + w; return Object.entries(sum); };

// ---------------------------------------------------------------------------------------------------------
// Shapes

/** Capped cylinder (or cone frustum) along Y: radius r0 at -h, r1 at +h. */
export function cyl(r0, r1, h, n = 12) {
  const verts = [], quads = [], slope = (r0 - r1) / (2 * h), nl = Math.hypot(1, slope);
  for (const [y, r] of [[-h, r0], [h, r1]]) for (let i = 0; i < n; i++) { const a = i / n * TAU; verts.push({ p: V(Math.cos(a) * r, y, Math.sin(a) * r), n: V(Math.cos(a) / nl, slope / nl, Math.sin(a) / nl), e: 1 }); }
  for (let i = 0; i < n; i++) quads.push([i, (i + 1) % n, n + (i + 1) % n, n + i]);
  for (const [y, r, ny] of [[-h, r0, -1], [h, r1, 1]]) {
    const base = verts.length; verts.push({ p: V(0, y, 0), n: V(0, ny, 0) });
    for (let i = 0; i < n; i++) { const a = i / n * TAU; verts.push({ p: V(Math.cos(a) * r, y, Math.sin(a) * r), n: V(0, ny, 0), e: 1 }); }
    for (let i = 0; i < n; i++) quads.push([base, base + 1 + i, base + 1 + (i + 1) % n, base]);
  }
  return { verts, quads };
}

/** Sphere of radius r (rx, ry, rz for an ellipsoid). */
export function ball(rx, ry = rx, rz = rx, n = 12, m = 8) {
  const verts = [], quads = [];
  for (let j = 0; j <= m; j++) for (let i = 0; i < n; i++) {
    const a = i / n * TAU, b = (j / m - .5) * PI, d = V(Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a));
    verts.push({ p: V(d.x * rx, d.y * ry, d.z * rz), n: V(d.x / rx, d.y / ry, d.z / rz).normalize() });
  }
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) quads.push([j * n + i, j * n + (i + 1) % n, (j + 1) * n + (i + 1) % n, (j + 1) * n + i]);
  return { verts, quads };
}

/**
 * Flat plate cut to a polygon (points in XY, any winding), `t` thick along Z. `peak` raises the middle of the front
 * face so the plate is folded into facets that meet at `apex` (default: the polygon's centre).
 */
export function prism(pts, t, peak = 0, apex = null) {
  const verts = [], quads = [], n = pts.length;
  let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const P = area < 0 ? [...pts].reverse() : pts, cx = apex ? apex[0] : P.reduce((s, p) => s + p[0], 0) / n, cy = apex ? apex[1] : P.reduce((s, p) => s + p[1], 0) / n;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    // Front facet, back facet, side wall.
    const A = V(a[0], a[1], t), B = V(b[0], b[1], t), C = V(cx, cy, t + peak), nf = new Vector3().crossVectors(B.clone().sub(A), C.clone().sub(A)).normalize();
    let s = verts.length; verts.push({ p: C, n: nf }, { p: A, n: nf, e: 1 }, { p: B, n: nf, e: 1 }); quads.push([s, s + 1, s + 2, s]);
    s = verts.length; const nb = V(0, 0, -1); verts.push({ p: V(cx, cy, 0), n: nb }, { p: V(b[0], b[1], 0), n: nb }, { p: V(a[0], a[1], 0), n: nb }); quads.push([s, s + 1, s + 2, s]);
    s = verts.length; const nw = V(b[1] - a[1], a[0] - b[0], 0).normalize();
    verts.push({ p: V(a[0], a[1], 0), n: nw, e: 1 }, { p: V(b[0], b[1], 0), n: nw, e: 1 }, { p: B.clone(), n: nw, e: 1 }, { p: A.clone(), n: nw, e: 1 }); quads.push([s, s + 1, s + 2, s + 3]);
  }
  return { verts, quads };
}

const SHAPES = {
  box: (d) => box(d[0], d[1], d[2]),
  rbox: (d) => roundBox(d[0], d[1], d[2], d[3] ?? .004),
  bar: (d) => bar(d[0], d[1], d[2] ?? 8),
  cyl: (d) => cyl(d[0], d[2] ?? d[0], d[1], d[3] ?? 12),
  ring: (d) => ring(d[0], d[1] ?? d[0], d[2] ?? .004, d[3] ?? 18, d[4] ?? 6),
  dome: (d) => dome(d[0], d[1] ?? d[0] * .6, d[2] ?? 8),
  ball: (d) => ball(d[0], d[1] ?? d[0], d[2] ?? d[0], d[3] ?? 12, d[4] ?? 8),
};

// ---------------------------------------------------------------------------------------------------------
// Anchors: where on the body a piece of gear is fixed, and which bones carry it.

/**
 * { y, dy, th, off }        on the trunk: height (landmark name or metres) + dy, angle in degrees (0 front, 90 the
 *                           wearer's left), stand-off. Frame: x around the trunk, y up, z out.
 * { limb, t, phi, off }     on an arm or leg. Frame: x around the limb, y up the limb, z out.
 * { head: [x, y, z] }       in head units (chin to crown = 1, origin at the head's centre); sizes are head units too.
 * { foot: [x, y, z] }       x outward, y up from the ground, z forward from the ankle.
 * { bone, at: [x, y, z] }   metres from a joint, in the body's own axes.
 * `skin` overrides the bone: a bone name.
 */
function anchor(c, on) {
  const { trunk, foot, J } = c.form;
  let place, skin;
  if (on.limb) { const chain = c.form[on.limb]; place = limbFrame(chain, on.t, (on.phi ?? 90) * DEG, on.off ?? 0); skin = chain.skin(on.t); }
  else if (on.head) { const hp = headPlace(c), o = on.head; place = (p) => hp(V(o[0] + p.x, o[1] + p.y, o[2] + p.z)); skin = HEAD; }
  else if (on.foot) { const o = foot.at(...on.foot); place = frame(o, foot.sideways, UP, foot.forward); skin = foot.skin(o.clone()); }
  else if (on.bone) { const o = J[on.bone].clone().add(V(...(on.at ?? [0, 0, 0]))); place = frame(o, V(1, 0, 0), UP, V(0, 0, 1)); skin = [[on.bone, 1]]; }
  else {
    const y = (trunk.Y[on.y] ?? on.y) + (on.dy ?? 0), th = (on.th ?? 0) * DEG, off = on.off ?? 0;
    const o = trunk.at(y, th, off), out = trunk.at(y, th, off + .02).sub(o); out.y = 0; out.normalize();
    place = frame(o, new Vector3().crossVectors(UP, out).normalize(), UP, out); skin = trunk.skin(o.clone());
  }
  if (on.skin) skin = [[on.skin, 1]];
  if (on.turn) { const q = quat(on.turn), inner = place; place = (p) => inner(p.applyQuaternion(q)); }
  return { place, skin };
}

/**
 * Hard gear assembled from primitives. parts: [{ s: shape, d: dimensions, at: [x, y, z], rot: [degrees], c: palette
 * name, m: material, e: edge darkening }] or { s: 'prism', pts, d: [thickness, peak, apexX, apexY] }.
 */
export function kit(c, { on, side = 'L', parts, name = 'kit' }) {
  c.bag.part = name;
  sides(c, side, () => {
    const { place, skin } = anchor(c, on);
    for (const part of parts) {
      let shape = part.s === 'prism' ? prism(part.pts, part.d?.[0] ?? .006, part.d?.[1] ?? 0, part.d?.[2] !== undefined ? [part.d[2], part.d[3]] : null) : SHAPES[part.s](part.d);
      if (part.at || part.rot) shape = moved(shape, V(...(part.at ?? [0, 0, 0])), part.rot ? quat(part.rot) : null);
      c.bag.solid(shape, place, skin, c.pal(part.c), matOf(part.m ?? 'iron'), part.e);
    }
  });
}

/**
 * A hose, cable or chain through waypoints [{ on: anchor, at: [x, y, z] }]. With `links` the path carries that many
 * chain links instead of a tube. Each stretch moves with the bones of the anchors at its two ends.
 */
export function hose(c, { path, r = .011, color = 'leather', mat = 'rubber', ribs = 0, side = 'L', n = 8, seg = 9, links = 0, wire = .0045, name = 'hose' }) {
  c.bag.part = name;
  sides(c, side, () => {
    const pts = path.map((w) => { const a = anchor(c, w.on); return { p: a.place(V(...(w.at ?? [0, 0, 0]))), skin: a.skin }; }), count = pts.length;
    const get = (i) => pts[clamp(i, 0, count - 1)].p;
    const at = (s) => {
      const f = clamp(s, 0, 1) * (count - 1), i = Math.min(count - 2, Math.floor(f)), t = f - i, [a, b, d, e] = [get(i - 1), get(i), get(i + 1), get(i + 2)], out = V();
      for (const k of ['x', 'y', 'z']) out[k] = .5 * ((2 * b[k]) + (-a[k] + d[k]) * t + (2 * a[k] - 5 * b[k] + 4 * d[k] - e[k]) * t * t + (-a[k] + 3 * b[k] - 3 * d[k] + e[k]) * t * t * t);
      return out;
    };
    const skinAt = (s) => { const f = clamp(s, 0, 1) * (count - 1), i = Math.min(count - 2, Math.floor(f)), t = f - i; return mergeSkin([...pts[i].skin.map(([b, w]) => [b, w * (1 - t)]), ...pts[i + 1].skin.map(([b, w]) => [b, w * t])]); };
    const frameAt = (s) => {
      const p = at(s), T = at(s + .004).sub(at(s - .004)).normalize(), ref = Math.abs(T.y) > .9 ? V(1, 0, 0) : UP;
      const N = new Vector3().crossVectors(T, ref).normalize(), B = new Vector3().crossVectors(T, N);
      return { p, T, N, B };
    };
    const col = c.pal(color), m = matOf(mat);
    if (links) {
      let length = 0; for (let i = 0; i < 40; i++) length += at((i + 1) / 40).distanceTo(at(i / 40));
      const each = length / links;
      for (let i = 0; i < links; i++) {
        const s = (i + .5) / links, f = frameAt(s);
        c.bag.solid(ring(each * .68, each * .4, wire, 10, 5), frame(f.p, f.T, i % 2 ? f.N : f.B), skinAt(s), col, m);
      }
      return;
    }
    const rows = Math.max(2, Math.round(seg * (count - 1) * c.q));
    c.bag.grid(n, rows, (u, v) => {
      const f = frameAt(v), a = u * TAU, rr = r * (1 + (ribs ? .17 * Math.sin(v * ribs * TAU) : 0));
      return { p: f.p.addScaledVector(f.N, Math.cos(a) * rr).addScaledVector(f.B, Math.sin(a) * rr), skin: skinAt(v), n: f.N.clone().multiplyScalar(Math.cos(a)).addScaledVector(f.B, Math.sin(a)) };
    }, { closeU: true, color: col, mat: m });
  });
}

// ---------------------------------------------------------------------------------------------------------
// Cloth

/**
 * Cloth hanging from the waist between the angles `from` and `to` (degrees; 0 front, 180 back, going through the
 * wearer's left). `hem` is how low it reaches, as a height fraction from the ground (0) to the hip line (1): a number,
 * or [[angle, fraction], ...] for a cut hem. `clear` keeps it off the thighs and whatever they wear.
 */
export function drape(c, { from = -180, to = 180, top = 'belt', dy = 0, hem = .5, flare = 1.12, off = .02, clear = .03, color = 'cloth', mat = 'cloth', lining = null, trim = null, trimMat = 'cloth', trimWidth = .013, folds = 7, fold = .03, edges = true, hemTrim = true, kick = 0, name = 'drape' }) {
  const { trunk, J, leg } = c.form, col = c.pal(color), m = matOf(mat), yTop = (trunk.Y[top] ?? top) + dy, yHip = trunk.Y.hip, hemAt = knots(hem);
  c.bag.part = name;
  const a0 = from * DEG, a1 = to * DEG, span = a1 - a0, closed = span >= TAU - 1e-6, seed = c.rand() * TAU, zc = c.form.spineZ(yHip);
  const legT = (y) => clamp((J['thigh.L'].y - y) / leg.seg[0].length, 0, 1.6);
  const surf = (y, th, extra) => {
    if (y >= yHip) return trunk.at(y, th, off + extra);
    const f = (yHip - y) / yHip, grow = 1 + (flare - 1) * f ** .8, p = trunk.at(yHip, th, off + extra), t = legT(y), centre = leg.centre(t), r = leg.radius(t), cs = Math.cos(th);
    const need = (centre.x + r + clear) / Math.max(.01, trunk.section(yHip).a + off), wide = Math.max(grow, lerp(1, need, smooth(0, .12, f)));
    const wave = 1 + fold * f * Math.sin(th * folds + seed + Math.sin(f * 4) * .5);
    p.x *= wide * wave; p.z = zc + (p.z - zc) * grow * wave; p.y = y;
    // Front and back hang clear of the thighs.
    const k = smooth(0, .1, f) * smooth(.15, .6, Math.abs(cs));
    if (cs > 0) p.z = lerp(p.z, Math.max(p.z, centre.z + r + clear + extra), k); else p.z = lerp(p.z, Math.min(p.z, centre.z - r - clear - extra), k);
    p.z += Math.sign(cs) * kick * f * f;
    return p;
  };
  const skin = (p) => {
    if (p.y >= yHip) return trunk.skin(p);
    const side = p.x >= 0 ? 'L' : 'R', drop = smooth(yHip + .03, yHip - .17, p.y) * .84, lower = smooth(J['shin.L'].y + .05, J['shin.L'].y - .25, p.y) * .3, left = smooth(-.14, .14, p.x);
    return [['hips', 1 - drop], ['thigh.L', drop * left * (1 - lower)], ['thigh.R', drop * (1 - left) * (1 - lower)], [`shin.${side}`, drop * lower]];
  };
  const yHem = (th) => lerp(0, yHip, hemAt(th / DEG));
  const point = (u, v, extra = 0) => { const th = lerp(a0, a1, u); return surf(lerp(yTop, yHem(th), v), th, extra); };
  const inner = (p) => V(0, p.y, zc), nu = Math.max(3, Math.round(52 * c.q * span / TAU)), nv = Math.max(4, Math.round(18 * c.q));
  c.bag.grid(nu, nv, (u, v) => { const p = point(u, v); return { p, skin: skin(p) }; }, { closeU: closed, color: col, mat: m, inside: inner });
  if (lining) c.bag.grid(nu, nv, (u, v) => { const p = point(u, v, -.006); return { p, skin: skin(p) }; }, { closeU: closed, color: c.pal(lining), mat: MAT.cloth, inside: inner, flip: true });
  if (!trim) return;
  const tc = c.pal(trim), tm = matOf(trimMat), rows = [[0, 0], [.12, 1], [.88, 1], [1, 0]];
  if (hemTrim) c.bag.grid(nu, 3, (u, v) => {
    const th = lerp(a0, a1, u), len = Math.max(.03, yTop - yHem(th)), [k, h] = rows[Math.round(v * 3)], p = point(u, 1 - (1 - k) * trimWidth / len, .0012 + .0024 * h);
    return { p, skin: skin(p) };
  }, { closeU: closed, color: tc, mat: tm, inside: inner });
  if (edges && !closed) for (const end of [0, 1]) {
    const du = trimWidth / Math.max(.02, span * trunk.rho(yHip, end ? a1 : a0));
    c.bag.grid(3, nv, (u, v) => { const [k, h] = rows[Math.round(u * 3)], p = point(end ? 1 - k * du : k * du, v, .0012 + .0024 * h); return { p, skin: skin(p) }; }, { color: tc, mat: tm, inside: inner });
  }
}

/**
 * Panels cut on the trunk's surface. Each quad is four corners [angle, height landmark, dy, extra offset] going
 * top-left, top-right, bottom-right, bottom-left (two equal corners make a triangle). `edges` lists which sides
 * carry the trim: 0 top, 1 right, 2 bottom, 3 left.
 */
export function patch(c, { quads, color = 'cloth', mat = 'cloth', off = .012, thick = .004, trim = null, trimMat = 'cloth', trimWidth = .011, edges = [0, 1, 2, 3], n = 9, name = 'patch' }) {
  const { trunk } = c.form, col = c.pal(color), m = matOf(mat);
  c.bag.part = name;
  for (const quad of quads) {
    const C = quad.map(([th, y, dy = 0, extra = 0]) => [th * DEG, (trunk.Y[y] ?? y) + dy, extra]);
    const point = (a, b, lift = 0) => {
      const top = C[0].map((value, i) => lerp(value, C[1][i], a)), bottom = C[3].map((value, i) => lerp(value, C[2][i], a)), [th, y, extra] = top.map((value, i) => lerp(value, bottom[i], b));
      return trunk.at(clamp(y, trunk.bottom, trunk.top + .05), th, off + thick + extra + lift);
    };
    const inner = (p) => V(0, p.y, c.form.spineZ(p.y)), steps = Math.max(2, Math.round(n * c.q));
    c.bag.grid(steps, steps, (u, v) => { const p = point(u, v); return { p, skin: trunk.skin(p) }; }, { color: col, mat: m, inside: inner });
    // A turned edge all round gives the panel its thickness.
    for (const [fa, fb] of [[(s) => s, () => 0], [() => 1, (s) => s], [(s) => 1 - s, () => 1], [() => 0, (s) => 1 - s]]) c.bag.grid(steps, 1, (u, v) => { const p = point(fa(u), fb(u), -v * (thick + .004)); return { p, skin: trunk.skin(p) }; }, { color: col.clone().multiplyScalar(.55), mat: m, inside: inner });
    if (!trim) continue;
    const width = point(0, .5).distanceTo(point(1, .5)), height = point(.5, 0).distanceTo(point(.5, 1)), wa = Math.min(.5, trimWidth / Math.max(.01, width)), wb = Math.min(.5, trimWidth / Math.max(.01, height));
    const rows = [[0, 0], [.14, 1], [.86, 1], [1, 0]], strips = [(s, k) => [s, k * wb], (s, k) => [1 - k * wa, s], (s, k) => [s, 1 - k * wb], (s, k) => [k * wa, s]];
    for (const e of edges) c.bag.grid(steps, 3, (u, v) => { const [k, h] = rows[Math.round(v * 3)], [a, b] = strips[e](u, k), p = point(a, b, .0008 + .0024 * h); return { p, skin: trunk.skin(p) }; }, { color: c.pal(trim), mat: matOf(trimMat), inside: inner });
  }
}

/**
 * Standing collar. `gap` is the half-width of the front opening in degrees (0 closes it), `back` extra height at the
 * nape, `tip` extra height at the two front corners, `flare` how far the top edge stands away from the neck.
 */
export function collar(c, { height = .07, back = 0, tip = 0, flare = .02, gap = 22, color = 'cloth', mat = 'cloth', lining = null, trim = null, trimMat = 'cloth', off = .012, thick = .007, base = 0, lean = 0, name = 'collar' }) {
  const { trunk } = c.form, col = c.pal(color), m = matOf(mat), y0 = trunk.Y.base - .012 + base, a0 = gap * DEG, a1 = TAU - gap * DEG, closed = gap <= 0, zc = c.form.spineZ(y0);
  c.bag.part = name;
  const point = (u, v, inset = 0) => {
    const th = lerp(a0, a1, u), front = 1 - Math.min(1, Math.min(th - a0, a1 - th) / (40 * DEG)), h = height + back * (.5 - .5 * Math.cos(th)) + tip * front ** 2;
    const r = trunk.rho(y0, th) + off - inset + flare * v ** 1.4 * (1 + .5 * (tip ? front : 0));
    return V(Math.sin(th) * r, y0 + h * v, zc + Math.cos(th) * r + lean * v);
  };
  const skin = (v) => [['spine2', 1 - .5 * v], ['neck', .5 * v]], inside = (p) => V(0, p.y, zc), nu = Math.round(34 * c.q);
  c.bag.grid(nu, 6, (u, v) => ({ p: point(u, v), skin: skin(v) }), { closeU: closed, color: col, mat: m, inside });
  c.bag.grid(nu, 6, (u, v) => ({ p: point(u, v, thick), skin: skin(v) }), { closeU: closed, color: c.pal(lining ?? color), mat: lining ? MAT.cloth : m, inside, flip: true });
  // Top edge, and the two front edges when the collar is open.
  const edge = trim ? c.pal(trim) : col.clone().multiplyScalar(.6), em = trim ? matOf(trimMat) : m;
  c.bag.grid(nu, 4, (u, v) => { const a = v * TAU, p = point(u, 1, thick / 2 - Math.cos(a) * thick * .62); p.y += Math.sin(a) * .004; return { p, skin: skin(1) }; }, { closeU: closed, color: edge, mat: em });
  if (!closed) for (const u of [0, 1]) c.bag.grid(6, 4, (s, v) => { const a = v * TAU, p = point(u, s, thick / 2 - Math.cos(a) * thick * .62), q = point(u ? 1 - .012 : .012, s, thick / 2); p.addScaledVector(p.clone().sub(q).normalize(), Math.sin(a) * .004 + .003); return { p, skin: skin(s) }; }, { closeU: false, color: edge, mat: em });
}

/**
 * Bell sleeve: opens from the arm's own girth at `from` to `wide` metres of extra radius at `to`, hanging lower
 * on the underside by `drop` metres.
 */
export function bellSleeve(c, { from = .5, to = 1.86, wide = .09, drop = .07, color = 'cloth', mat = 'cloth', lining = null, trim = null, trimMat = 'cloth', trimWidth = .014, off = .013, power = 1.7, side = 'both', name = 'sleeve' }) {
  const { arm } = c.form, col = c.pal(color), m = matOf(mat), m0 = arm.metres(from), m1 = arm.metres(to);
  c.bag.part = name;
  const under = (phi) => (.5 - .5 * Math.sin(phi)) ** 1.5;
  const point = (u, v, inset = 0) => {
    const phi = u * TAU, metres = lerp(m0, m1 + drop * under(phi), v), t = arm.step(0, metres), s = clamp((metres - m0) / (m1 - m0), 0, 1.4);
    const r = arm.radius(Math.min(t, 2)) + off + wide * s ** power * (1 + .55 * under(phi)) + .004 * Math.sin(phi * 6 + s * 5) * s - inset;
    return { p: arm.point(t, phi, r), skin: arm.skin(Math.min(t, 1.97)) };
  };
  const nu = Math.round(22 * c.q), nv = Math.round(14 * c.q), inside = (p) => arm.centre(arm.step(0, clamp(p.clone().sub(arm.points[0]).dot(arm.seg[0].along), m0, m1 + drop)));
  sides(c, side, () => {
    c.bag.grid(nu, nv, (u, v) => point(u, v), { closeU: true, color: col, mat: m, inside });
    c.bag.grid(nu, Math.round(nv * .6), (u, v) => point(u, .35 + .65 * v, .005), { closeU: true, color: c.pal(lining ?? color).clone().multiplyScalar(lining ? 1 : .5), mat: MAT.cloth, inside, flip: true });
    if (trim) { const rows = [[0, 0], [.12, 1], [.88, 1], [1, 0]]; c.bag.grid(nu, 3, (u, v) => { const [k, h] = rows[Math.round(v * 3)]; return point(u, 1 - (1 - k) * trimWidth / (m1 - m0), -.001 - .0026 * h); }, { closeU: true, color: c.pal(trim), mat: matOf(trimMat), inside }); }
  });
}

// ---------------------------------------------------------------------------------------------------------
// Head

const helm = (c, phi, y, off) => { const k = smooth(55 * DEG, 100 * DEG, Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)))); return face(c, phi, y, off).lerp(scalp(c, phi, y, off), k); };
const SURFACE = { face, scalp, helm };

/**
 * A fitted shell over part of the head: a cloth mask, a faceplate, a helm. `phi` is the span in degrees (0 is the
 * nose), `top` and `bottom` its edges in head units as a number or [[angle, y], ...].
 */
export function headShell(c, { surface = 'face', phi = [-100, 100], top = -.04, bottom = -.495, off = .022, color = 'cloth', mat = 'cloth', rim = null, rimMat = 'cloth', n = [26, 14], name = 'mask' }) {
  const place = headPlace(c), at = SURFACE[surface], yTop = knots(top), yBottom = knots(bottom), a0 = phi[0] * DEG, a1 = phi[1] * DEG, closed = a1 - a0 >= TAU - 1e-6, col = c.pal(color), m = matOf(mat);
  c.bag.part = name;
  const point = (u, v, extra = 0) => { const a = lerp(a0, a1, u), deg = a / DEG; return place(at(c, a, clamp(lerp(yTop(deg), yBottom(deg), v), -.499, .499), off + extra)); };
  const nu = Math.round(n[0] * c.q), nv = Math.round(n[1] * c.q);
  c.bag.grid(nu, nv, (u, v) => ({ p: point(u, v), skin: HEAD }), { closeU: closed, color: col, mat: m, inside: c.head.C });
  // Edges turn in toward the head.
  for (const v of [0, 1]) c.bag.grid(nu, 1, (u, k) => ({ p: point(u, v, -k * off * .8), skin: HEAD }), { closeU: closed, color: (rim ? c.pal(rim) : col).clone().multiplyScalar(.7), mat: m, inside: c.head.C });
  if (rim) for (const v of [0, 1]) c.bag.grid(nu, 3, (u, k) => { const [f, h] = [[0, 0], [.2, 1], [.8, 1], [1, 0]][Math.round(k * 3)]; return { p: point(u, v ? 1 - f * .07 : f * .07, .002 + .006 * h), skin: HEAD }; }, { closeU: closed, color: c.pal(rim), mat: matOf(rimMat), inside: c.head.C });
}

/** A band around the head at height y (head units): a strap, a visor slat, a brow band. */
export function headBand(c, { y = 0, height = .07, phi = [0, 360], off = .014, thick = .014, color = 'leather', mat = 'leather', surface = 'helm', tilt = 0, name = 'band' }) {
  const place = headPlace(c), at = SURFACE[surface], a0 = phi[0] * DEG, a1 = phi[1] * DEG, closed = a1 - a0 >= TAU - 1e-6, col = c.pal(color), rows = [[-.5, 0], [-.5, 1], [.5, 1], [.5, 0]];
  c.bag.part = name;
  c.bag.grid(Math.max(6, Math.round(40 * c.q * (a1 - a0) / TAU)), 3, (u, v) => {
    const a = lerp(a0, a1, u), [dy, h] = rows[Math.round(v * 3)];
    return { p: place(at(c, a, y + tilt * (.5 - .5 * Math.cos(a)) + dy * height, off + h * thick)), skin: HEAD, c: h ? col : col.clone().multiplyScalar(.45) };
  }, { closeU: closed, color: col, mat: matOf(mat), inside: c.head.C });
}

/** A raised crest along the head's centre line, from `front` (y on the face) over the crown to `rear` (y at the back). */
export function crest(c, { front = -.5, rear = -.3, width = .016, lift = .03, off = .05, color = 'steel', mat = 'steel', surface = 'helm', name = 'crest' }) {
  const place = headPlace(c), at = SURFACE[surface], rows = [[-1, 0], [-.55, 1], [.55, 1], [1, 0]], span = (.5 - front) + (.5 - rear);
  c.bag.part = name;
  c.bag.grid(Math.round(30 * c.q), 3, (u, v) => {
    const s = u * span, onFront = s < .5 - front, y = onFront ? front + s : .5 - (s - (.5 - front)), [x, h] = rows[Math.round(v * 3)];
    const p = at(c, onFront ? 0 : PI, clamp(y, -.499, .499), off + h * lift); p.x += x * width;
    return { p: place(p), skin: HEAD };
  }, { color: c.pal(color), mat: matOf(mat), inside: c.head.C });
}

// ---------------------------------------------------------------------------------------------------------
// Hair

const hairline = (fringe) => (phi) => { const a = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi))); return lerp(lerp(fringe, .13, smooth(.3, 1.05, a)), lerp(-.02, -.3, smooth(1.5, 2.6, a)), smooth(1.05, 1.5, a)); };

/**
 * Tightly curled or cropped hair: a cap whose surface is raised into curls. `top` adds height on the crown (a
 * high-top), `fade` crops the sides and nape below that height in head units.
 */
export function curls(c, { color = 'hair', lift = .035, top = 0, fringe = .3, bumps = 15, fade = null, name = 'hair' }) {
  const place = headPlace(c), col = c.pal(color), line = hairline(fringe), seed = c.rand() * TAU;
  c.bag.part = name;
  c.bag.grid(Math.round(64 * c.q), Math.round(34 * c.q), (u, v) => {
    const phi = u * TAU, y = lerp(line(phi), .499, v), curl = (.5 + .5 * Math.sin(phi * bumps + y * 37 + seed)) * (.5 + .5 * Math.sin(y * bumps * 5.3 - phi * 5 + seed * 2)), grain = .5 + .5 * Math.sin(phi * bumps * 2.7 + y * 91);
    const body = (fade === null ? 1 : lerp(.25, 1, smooth(fade - .12, fade + .06, y))) * smooth(0, .12, v), bump = curl * .75 + grain * .25;
    const offAt = lift * (.3 + .7 * body) * (.55 + .7 * bump) + top * smooth(.12, .36, y) * (.8 + .3 * bump);
    return { p: place(scalp(c, phi, y, offAt)), skin: HEAD, c: col.clone().multiplyScalar(.55 + .9 * bump) };
  }, { closeU: true, color: col, mat: MAT.hair, inside: c.head.C });
}

/** Thick rope locks. Each rises from the scalp above `above`, stands off the head and falls outward and back. */
export function locks(c, { color = 'hair', count = 44, length = .5, r = .034, above = .2, back = .5, stand = .3, cap = true, capLift = .012, fringe = .28, name = 'hair' }) {
  const place = headPlace(c), col = c.pal(color), line = hairline(fringe);
  c.bag.part = name;
  if (cap) c.bag.grid(Math.round(40 * c.q), Math.round(14 * c.q), (u, v) => { const phi = u * TAU, y = lerp(line(phi), .499, v), rows = .5 + .5 * Math.sin(phi * 22); return { p: place(scalp(c, phi, y, capLift * (.5 + .6 * rows) * smooth(0, .15, v))), skin: HEAD, c: col.clone().multiplyScalar(.5 + .5 * rows) }; }, { closeU: true, color: col, mat: MAT.hair, inside: c.head.C });
  const total = Math.round(count * (.6 + .4 * c.q));
  for (let i = 0; i < total; i++) {
    const f = (i + .5) / total, phi = i * 2.39996 + c.rand() * .4, y = lerp(.495, above, f ** .8), root = scalp(c, phi, y, capLift), normal = root.clone().normalize();
    const len = length * (.7 + c.rand() * .6), outward = V(normal.x, 0, normal.z).normalize().multiplyScalar(.55 + c.rand() * .3).add(V(0, 0, -back)), rr = r * (.8 + c.rand() * .4), twist = c.rand() * TAU;
    const p1 = root.clone().addScaledVector(normal, len * stand).addScaledVector(V(0, 1, 0), len * stand * .5), p2 = p1.clone().addScaledVector(outward, len * .45).add(V(0, -len * (.5 + c.rand() * .3), 0));
    const centre = (s) => root.clone().multiplyScalar((1 - s) * (1 - s)).addScaledVector(p1, 2 * s * (1 - s)).addScaledVector(p2, s * s);
    const tone = col.clone().multiplyScalar(.7 + c.rand() * .7);
    c.bag.grid(5, Math.max(3, Math.round(6 * c.q)), (u, v) => {
      const p = centre(v), T = centre(Math.min(1, v + .05)).sub(centre(Math.max(0, v - .05))).normalize(), N = new Vector3().crossVectors(T, V(.3, .2, .93)).normalize(), B = new Vector3().crossVectors(T, N);
      const a = u * TAU + twist, w = rr * (1 - .35 * v) * (1 + .16 * Math.sin(v * 26 + twist)) * (v > .97 ? .5 : 1);
      return { p: place(p.addScaledVector(N, Math.cos(a) * w).addScaledVector(B, Math.sin(a) * w)), skin: HEAD, c: tone.clone().multiplyScalar(.75 + .5 * (.5 + .5 * Math.sin(v * 26 + twist))) };
    }, { closeU: true, color: tone, mat: MAT.hair, inside: place(centre(.5)) });
  }
}

/** The tail of a ponytail: a bundle of tapering locks from a knot `at` (head units), with a tie around its root. */
export function tail(c, { at = [0, .4, -.42], color = 'hair', length = .95, strands = 18, width = .075, spread = .1, lift = .12, sweep = -.12, tie = null, name = 'hair' }) {
  const place = headPlace(c), col = c.pal(color), knot = V(...at);
  c.bag.part = name;
  for (let i = 0; i < strands; i++) {
    const a = i / strands * TAU, len = length * (.72 + c.rand() * .4), ox = Math.cos(a) * spread * (.5 + c.rand() * .5), oz = Math.sin(a) * spread * .5;
    const root = knot.clone().add(V(ox * .4, 0, oz * .4)), p1 = knot.clone().add(V(ox, lift * (.6 + c.rand() * .6), -.14 + oz)), p2 = knot.clone().add(V(ox * 1.6 + (c.rand() - .5) * .1, -len, sweep + oz - c.rand() * .08));
    const centre = (s) => root.clone().multiplyScalar((1 - s) * (1 - s)).addScaledVector(p1, 2 * s * (1 - s)).addScaledVector(p2, s * s);
    const tone = col.clone().multiplyScalar(.65 + c.rand() * .8), w = width * (.7 + c.rand() * .5), twist = c.rand() * TAU;
    c.bag.grid(4, Math.max(4, Math.round(8 * c.q)), (u, v) => {
      const p = centre(v), T = centre(Math.min(1, v + .04)).sub(centre(Math.max(0, v - .04))).normalize(), N = new Vector3().crossVectors(T, V(1, 0, .2)).normalize(), B = new Vector3().crossVectors(T, N);
      const ang = u * TAU + twist, rr = w * Math.sin(Math.min(1, v * 5 + .25) * PI / 2) * (1 - v) ** .6 + .004;
      return { p: place(p.addScaledVector(B, Math.cos(ang) * rr).addScaledVector(N, Math.sin(ang) * rr * .5)), skin: HEAD, c: tone.clone().multiplyScalar(1 + .5 * v * v) };
    }, { closeU: true, color: tone, mat: MAT.hair, inside: place(centre(.5)) });
  }
  // The tie binds the root of the tail: a band around the direction the tail leaves the head.
  if (tie) { const d = V(0, lift * 1.6, -.14).normalize(), x = V(1, 0, 0), y = new Vector3().crossVectors(d, x); c.bag.solid(ring(spread * .7, spread * .7, .034, 14, 6), (p) => place(knot.clone().addScaledVector(d, .05).addScaledVector(x, p.x).addScaledVector(y, p.y).addScaledVector(d, p.z * 1.8)), HEAD, c.pal(tie), MAT.cloth); }
}

/** Loose locks hanging from given roots: [[angle in degrees, y, length, outward, sideways]] in head units. */
export function strands(c, { color = 'hair', list, width = .05, name = 'hair' }) {
  const place = headPlace(c), col = c.pal(color);
  c.bag.part = name;
  for (const [deg, y, len, out = .04, sideways = 0] of list) {
    const phi = deg * DEG, root = scalp(c, phi, y, .018), normal = V(Math.sin(phi), 0, Math.cos(phi)), side = V(Math.cos(phi), 0, -Math.sin(phi));
    const tone = col.clone().multiplyScalar(.7 + c.rand() * .6), w = width * (.8 + c.rand() * .4);
    c.bag.grid(2, Math.max(4, Math.round(7 * c.q)), (u, v) => {
      const p = root.clone().addScaledVector(normal, out * Math.sin(v * PI) + .02 * v).addScaledVector(side, sideways * v * v).add(V(0, -len * v, 0)), across = (u - .5) * 2, ww = w * (1 - v) ** .7 + .004;
      return { p: place(p.addScaledVector(side, across * ww).addScaledVector(normal, (1 - Math.abs(across)) * ww * .5)), skin: HEAD, c: tone.clone().multiplyScalar(1 + .4 * v) };
    }, { color: tone, mat: MAT.hair, inside: c.head.C });
  }
}

/** Group c's builders, under the names its recipes use (`builders: C` in a recipe). */
export const C = Object.fromEntries(Object.entries({ kit, hose, drape, patch, collar, bellSleeve, headShell, headBand, crest, curls, locks, tail, strands }).map(([name, build]) => [`c:${name}`, build]));
// Also entered in the shared table, which is where the recipe test looks a builder name up.
Object.assign(BUILDERS, C);
