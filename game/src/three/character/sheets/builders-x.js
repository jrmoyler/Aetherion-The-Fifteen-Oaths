// Armour, anatomy and layered-shard builders shared by any hero (recipes name them with an `x.` prefix and carry
// them in their `builders` field: export X). Same contract as builders.js and the same size conventions as
// builders-b.js: metres are for a 1.8 m body and are scaled to the wearer; heights are trunk landmarks, fractions
// of the hip height below the hips, [landmark, metres] offsets or [landmarkA, landmarkB, fraction] blends.
//
//   x.plate     armour plate on the trunk or hanging below it: cuirass, fauld lames, tassets, stone slabs
//   x.pauldron  layered shoulder cap standing over the shoulder joint, with lames down the upper arm
//   x.horn      a curved blade of plate rising off a shoulder or any anchor: horn, fin, faceted kite wing
//   x.shards    overlapping irregular shards over a region of the trunk or a limb: bark, scales, shell tiers
//   x.physique  a modelled bare trunk region or limb with muscle relief (chest, abdomen, deltoid, arm)
//   x.lapel     a folded lapel / wrap-over front edge on the chest
//   x.cuff      a flared (turned-back) cuff at the wrist
//   x.crest     layered shell plates over a helmet
import { Vector3 } from 'three';
import { TAU, V, clamp, dome, frame, lerp, smooth } from './kernel.js';
import { cranium } from '../head.js';
import { HEAD, headPlace, sides } from './builders.js';
import { M, Yof, along, drapeOf, scaleOf, scaled, tone } from './builders-b.js';

const PI = Math.PI, DEG = PI / 180;
const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;
const hash = (i, j, k) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
/** Jittered cells: the height of the cell a point falls in (0..1) and its distance to the nearest cell border. */
function cells(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y); let d1 = 9, d2 = 9, id = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const cx = ix + di + hash(ix + di, iy + dj, seed), cy = iy + dj + hash(ix + di, iy + dj, seed + 7), d = Math.hypot(x - cx, y - cy);
    if (d < d1) { d2 = d1; d1 = d; id = hash(ix + di, iy + dj, seed + 13); } else if (d < d2) d2 = d;
  }
  return { h: id, edge: d2 - d1 };
}

/**
 * One shell: an outer face over pos(a, v, lift) (a in -1..1 across, v in 0..1 top to bottom), walls down to the
 * surface it sits on, an optional raised rim along chosen edges ('t', 'b', 'l', 'r') and rivets inside the rim.
 */
function shell(c, pos, { nx, ny, thick, color, mat, skin, inside, rim = null, rimMat = null, da = .1, dv = .1, rimSides = 'tblr', rimHeight = .003, tint = null, rivets = 0, rivet = null, rivetMat = 'steel', s = 1 }) {
  const sk = typeof skin === 'function' ? skin : () => skin;
  c.bag.grid(nx, ny, (u, v) => { const p = pos(u * 2 - 1, v, thick); return { p, skin: sk(p), c: tint ? tint(u * 2 - 1, v) : color }; }, { color, mat, inside });
  for (const e of [(q) => [q * 2 - 1, 0], (q) => [q * 2 - 1, 1], (q) => [-1, q], (q) => [1, q]]) c.bag.grid(Math.max(nx, ny), 1, (u, v) => { const [a, b] = e(u), p = pos(a, b, thick * (1 - v)); return { p, skin: sk(p) }; }, { color: tone(color, .45), mat, inside });
  if (rim) {
    const runs = { t: (q, e) => [q * 2 - 1, e * dv], b: (q, e) => [q * 2 - 1, 1 - e * dv], l: (q, e) => [-1 + e * da, q], r: (q, e) => [1 - e * da, q] };
    for (const key of rimSides) c.bag.grid(Math.max(nx, ny), 3, (u, v) => { const i = Math.round(v * 3), [a, b] = runs[key](u, [0, .12, .88, 1][i]), p = pos(a, b, thick + .0004 + rimHeight * [0, 1, 1, 0][i]); return { p, skin: sk(p) }; }, { color: rim, mat: rimMat ?? mat, inside });
  }
  for (let i = 0; i < rivets; i++) for (const a of [-1 + da * 2.2, 1 - da * 2.2]) {
    const v = (i + .5) / rivets, o = pos(a, v, thick), n = o.clone().sub(pos(a, v, 0)).normalize(), x = new Vector3().crossVectors(V(0, 1, 0), n).normalize();
    c.bag.solid(scaled(dome(.0055, .004, 6), s), frame(o, x, new Vector3().crossVectors(n, x), n), sk(o), rivet ?? rim ?? color, M(rivetMat));
  }
}

/**
 * Armour plate on the trunk. It spans `arc` degrees either side of `at` between two heights. `bulge` domes it,
 * `ridge` creases it down the middle, `point` drops the middle of the lower edge, `scoop` cuts the upper edge
 * down in the middle (a neck line), `taper` narrows it downward (negative widens: a flared tasset), `flare`
 * kicks the lower edge out. `lames` splits it into overlapping bands. `relief` breaks the face into fractured
 * facets `cell` to a side (stone, slate, bark). `hangs: true` continues below the hips on the coat or drape.
 */
function plate(c, { at = 0, arc = 50, from = 'waist', to = 'chest', off = .014, thick = .008, bulge = 0, ridge = 0, point = 0, scoop = 0, taper = 0, flare = 0, lames = 1, lap = .2, lameKick = .006, color = 'steel', mat = 'steel', rim = null, rimMat = null, rimWidth = .012, rimSides = 'tblr', rivets = 0, rivet = null, relief = 0, cell = 4, seed = 1, hangs = false, skew = 0, skin = null, n = 1 }) {
  const { trunk } = c.form, s = scaleOf(c), col = c.pal(color), centre = at * DEG, half = arc * DEG, y0 = Yof(c, from), y1 = Yof(c, to);
  const drape = hangs ? drapeOf(c) : null, surf = (y, th, lift) => drape ? drape.at(y, th, lift) : trunk.at(clamp(y, trunk.bottom, trunk.top), th, lift);
  const sk = skin ? () => skin : drape ? (p) => drape.skin(p) : (p) => trunk.skin(p);
  const height = Math.abs(y1 - y0), girth = trunk.rho(clamp((y0 + y1) / 2, trunk.Y.hip, trunk.top), centre) * half * 2, aspect = Math.max(.3, height / Math.max(.02, girth));
  const rel = (a, v) => relief ? cells((a + 1) * cell / 2 + seed * 3.1, v * cell * aspect + seed * 1.7, seed) : null;
  const base = (a, v, lift) => {
    const y = lerp(y1 - scoop * s * (1 - a * a), y0 - point * s * (1 - Math.abs(a - skew * v) ** 1.5), v), r = rel(a, v);
    return surf(y, centre + a * half * (1 - taper * v), off + lift + bulge * s * Math.sin(PI * clamp(v, 0, 1)) * (1 - a * a * .6) + ridge * s * (1 - Math.abs(a)) + flare * s * v * v
      + (r ? relief * s * ((r.h - .5) * 1.4 * smooth(0, .14, r.edge) - .5 * (1 - smooth(0, .1, r.edge))) * smooth(0, .12, 1 - Math.abs(a)) * smooth(0, .1, Math.min(v, 1 - v)) : 0));
  };
  const inner = (p) => V(0, p.y, c.form.spineZ(clamp(p.y, trunk.Y.hip, trunk.top)));
  for (let L = 0; L < lames; L++) {
    const v0 = Math.max(0, L / lames - (L ? lap / lames : 0)), v1 = (L + 1) / lames, lift = (lames - 1 - L) * .0035 * s;
    const pos = (a, v, extra) => base(a, lerp(v0, v1, v), extra + lift + (lames > 1 ? lameKick * s * v * v : 0));
    const nx = Math.max(4, Math.round(arc / 7 * c.q * n * (relief ? 1.5 : 1))), ny = Math.max(3, Math.round(height * (v1 - v0) / s * (relief ? 70 : 44) * c.q * n));
    shell(c, pos, { nx, ny, thick: thick * s, color: col, mat: M(mat), skin: sk, inside: inner, rim: rim ? c.pal(rim) : null, rimMat: rim ? M(rimMat ?? mat) : null, rimSides,
      da: rimWidth * s / Math.max(.02, girth / 2), dv: rimWidth * s / Math.max(.02, height * (v1 - v0)), rimHeight: .003 * s, rivets, rivet: rivet ? c.pal(rivet) : null, s,
      tint: relief ? (a, v) => { const r = rel(a, lerp(v0, v1, v)); return tone(col, (.74 + .5 * r.h) * (.45 + .55 * smooth(0, .09, r.edge))); } : null });
  }
}

/**
 * Shoulder armour: a domed cap over the shoulder joint and `lames` overlapping bands stepping down the upper arm.
 * `size` is the cap's half-extent [out, up, front-to-back]; `square` > 2 boxes it; `sweep` is the arc it covers
 * from the neck side over the top to the outside (degrees from horizontal-out); `ridge` raises a crest along it.
 */
function pauldron(c, { side = 'both', size = [.115, .07, .11], shift = [0, .015, 0], lames = 3, step = .06, shrink = .05, droop = 16, sweep = [118, -28], wrap = 80, square = 2.4, thick = .008, ridge = 0, color = 'steel', mat = 'steel', rim = null, rimMat = null, rimWidth = .012, rivets = 0, rivet = null, flare = .012 }) {
  const { J, arm } = c.form, s = scaleOf(c), col = c.pal(color), e = 2 / square;
  sides(c, side, () => {
    const O = J['upperarm.L'].clone().add(V(shift[0] * s, shift[1] * s, shift[2] * s)), down = arm.seg[0].along;
    for (let L = lames - 1; L >= 0; L--) {
      const ang = -L * droop * DEG, X = V(Math.cos(ang), Math.sin(ang), 0), Y = V(-Math.sin(ang), Math.cos(ang), 0), Z = V(0, 0, 1), k = 1 - shrink * L;
      const C = O.clone().addScaledVector(down, L * step * s).addScaledVector(V(-1, 0, 0), L * .012 * s);
      const [b0, b1] = L ? [sweep[0] - 62, sweep[1] - 6] : sweep;
      const pos = (a, v, extra) => {
        const be = lerp(b0, b1, v) * DEG, al = a * wrap * DEG, cb = spow(Math.cos(be), e), sb = spow(Math.sin(be), e), ca = spow(Math.cos(al), e), sa = spow(Math.sin(al), e);
        const lift = extra + flare * s * v ** 3 + ridge * s * Math.max(0, 1 - Math.abs(a) * 3);
        return C.clone().addScaledVector(X, (size[0] * s * k + lift) * cb * ca).addScaledVector(Y, (size[1] * s * k + lift) * sb * ca).addScaledVector(Z, (size[2] * s * k + lift) * sa);
      };
      const w = [.72, .42, .18, .1][Math.min(3, L)];
      shell(c, pos, { nx: Math.max(6, Math.round(14 * c.q)), ny: Math.max(4, Math.round((L ? 5 : 9) * c.q)), thick: thick * s, color: col, mat: M(mat), skin: [['shoulder.L', w], ['upperarm.L', 1 - w]], inside: C.clone().addScaledVector(Y, -.05 * s),
        rim: rim ? c.pal(rim) : null, rimMat: rim ? M(rimMat ?? mat) : null, rimSides: L ? 'blr' : 'tblr', da: rimWidth / size[2] * .7, dv: rimWidth / (size[0] * (L ? .9 : 2)), rimHeight: .0035 * s, rivets: L ? 0 : rivets, rivet: rivet ? c.pal(rivet) : null, s });
    }
  });
}

/**
 * A curved blade of plate rising off the shoulder (or off `origin`, a bind-space point): thick along its spine
 * and through the middle, thin at the cutting edge and the tip, dished across its width. `spine` is the outer
 * edge in the blade's own plane (x out from the body, y up); `tilt` turns that plane about the vertical so the
 * face shows from the front; `lean` tips it back. `facets` > 0 folds the face into flat planes (a faceted wing).
 * `inner` gives the opposite edge explicitly (same plane) instead of a width; both edges must end at the tip.
 */
function horn(c, { side = 'R', root = [-.04, .05, 0], spine = [[0, 0], [.16, .07], [.3, .2], [.33, .37]], width = .2, thick = .03, dish = .02, tilt = 12, lean = 0, color = 'steel', mat = 'steel', edge = null, edgeMat = null, edgeWidth = .1, facets = 0, taper = .8, skin = null, boss = null, n = 22, origin = null, widthAt = null, inner: innerEdge = null }) {
  const { J } = c.form, s = scaleOf(c), col = c.pal(color), pts = spine.map(([x, y]) => V(x * s, y * s, 0)), ipts = innerEdge ? innerEdge.map(([x, y]) => V(x * s, y * s, 0)) : null;
  sides(c, side, () => {
    const o = origin ? V(...origin) : J['upperarm.L'].clone().add(V(root[0] * s, root[1] * s, root[2] * s)), tl = tilt * DEG, ln = lean * DEG;
    const X = V(Math.cos(tl), 0, -Math.sin(tl)), Zf = V(Math.sin(tl) * Math.cos(ln), Math.sin(ln), Math.cos(tl) * Math.cos(ln)).normalize(), Y = new Vector3().crossVectors(Zf, X).normalize();
    const sk = skin ?? [['shoulder.L', .6], ['spine2', .4]];
    const wide = (q) => width * s * (widthAt ? widthAt(q) : (1 - q) ** taper * (.5 + .5 * smooth(0, .22, q)));
    const pos = (q, e, face) => {
      const qq = clamp(q, .001, .999), p = along(pts, qq), t = along(pts, Math.min(1, qq + .02)).sub(along(pts, Math.max(0, qq - .02))).normalize(), w = wide(qq);
      let ee = e; if (facets) { const f = Math.floor(e * facets); ee = (f + smooth(.35, .65, e * facets - f)) / facets; }
      const bell = Math.sin(PI * ee) ** .8, z = dish * s * Math.sin(PI * ee) * Math.sin(PI * qq) + face * thick * s * .5 * bell * (1 - qq * .7);
      if (ipts) { const i = along(ipts, qq); return o.clone().addScaledVector(X, lerp(p.x, i.x, ee)).addScaledVector(Y, lerp(p.y, i.y, ee)).addScaledVector(Zf, z); }
      return o.clone().addScaledVector(X, p.x - t.y * w * ee).addScaledVector(Y, p.y + t.x * w * ee).addScaledVector(Zf, z);
    };
    const rows = Math.max(8, Math.round(n * c.q)), cols = Math.max(4, Math.round((facets ? facets * 3 : 6) * c.q)), inner = (p) => pos(.4, .5, 0);
    for (const [face, flip] of [[1, false], [-1, true]]) c.bag.grid(rows, cols, (u, v) => ({ p: pos(u, v, face), skin: sk, c: facets ? tone(col, .82 + .3 * ((Math.floor(clamp(v, 0, .999) * facets) + (face > 0 ? 0 : 1)) % 2)) : face > 0 ? col : tone(col, .7) }), { color: col, mat: M(mat), flip });
    // The root end is open toward the shoulder: close it.
    c.bag.grid(cols, 1, (u, v) => ({ p: pos(0, u, v ? 1 : -1), skin: sk }), { color: tone(col, .5), mat: M(mat), inside: inner });
    if (edge) for (const e of [0, 1]) for (const face of [1, -1]) c.bag.grid(rows, 3, (u, v) => { const i = Math.round(v * 3), ee = e ? 1 - [0, .01, edgeWidth, edgeWidth + .02][i] : [0, .01, edgeWidth, edgeWidth + .02][i]; const p = pos(u, ee, face); return { p: p.addScaledVector(Zf, face * (.0006 + .003 * s * [0, 1, 1, 0][i])), skin: sk }; }, { color: c.pal(edge), mat: M(edgeMat ?? mat), flip: face < 0 });
    if (boss) c.bag.solid(scaled(dome(boss.r ?? .04, boss.h ?? .022, 10), s), frame(pos(boss.q ?? .08, boss.e ?? .5, 1), X, Y, Zf), sk, c.pal(boss.color ?? edge ?? color), M(boss.mat ?? edgeMat ?? mat));
  });
}

/**
 * Overlapping irregular shards laid like tiles over part of the trunk ({ at, arc, from, to }) or a limb
 * ({ limb, from, to, phi, arc }): bark armour, scale mail, shell tiers, slate. Each shard is a small pointed
 * plate with a raised midrib, lifted at its lower end so the rows shingle. `rows` x `cols` sets the count.
 */
function shards(c, { limb = null, side = 'both', at = 0, arc = 60, phi = 90, from, to, rows = 3, cols = 4, off = .012, thick = .008, lift = .014, jitter = .35, point = .5, overlap = .45, color = 'bark', dark = null, mat = 'bark', rim = null, rimMat = null, ridge = .006, round = 0, grow = 0, seed = 1, skin = null, hangs = false }) {
  const s = scaleOf(c), col = c.pal(color), dk = dark ? c.pal(dark) : tone(col, .7);
  const one = (pos, sk, inner, tintK) => {
    const ccol = col.clone().lerp(dk, tintK);
    c.bag.grid(Math.max(3, Math.round(4 * c.q)), Math.max(3, Math.round(4 * c.q)), (u, v) => { const p = pos(u * 2 - 1, v, thick * s); return { p, skin: typeof sk === 'function' ? sk(p) : sk, c: tone(ccol, 1.12 - .3 * Math.abs(u * 2 - 1) - .12 * v) }; }, { color: ccol, mat: M(mat), inside: inner });
    for (const e of [(q) => [q * 2 - 1, 1], (q) => [-1, q], (q) => [1, q]]) c.bag.grid(4, 1, (u, v) => { const [a, b] = e(u), p = pos(a, b, thick * s * (1 - v)); return { p, skin: typeof sk === 'function' ? sk(p) : sk }; }, { color: rim ? c.pal(rim) : tone(ccol, .4), mat: M(rim ? rimMat ?? mat : mat), inside: inner });
  };
  const lay = (surface, sk, innerOf, uSpan, vSpan) => {
    for (let r = rows - 1; r >= 0; r--) {
      const count = cols + (r % 2), rowGrow = 1 + grow * r;
      for (let i = 0; i < count; i++) {
        const j1 = hash(r, i, seed) - .5, j2 = hash(r, i, seed + 3) - .5, j3 = hash(r, i, seed + 5);
        const uc = (count === 1 ? 0 : (i / (count - 1)) * 2 - 1) * (1 - .5 / count) + j1 * jitter / count, v0 = r / rows + j2 * jitter * .4 / rows, len = (1 + overlap + j3 * jitter) / rows * rowGrow, wid = (1.25 + j2 * jitter) / count * rowGrow;
        const pos = (a, v, extra) => {
          const taperW = round ? Math.sqrt(Math.max(0, 1 - (v * round) ** 2)) : 1 - point * v ** 1.6, uu = uc + a * wid * taperW, vv = v0 + v * len;
          return surface(uu, vv, off * s + extra + lift * s * (v * .9 + .1) * (1 + r * .12) + ridge * s * (1 - Math.abs(a)) * (1 - v * .5));
        };
        one(pos, sk, innerOf, hash(r, i, seed + 9) * .8);
      }
    }
  };
  if (limb) {
    const chain = c.form[limb], ph = phi * DEG, half = arc * DEG;
    sides(c, side, () => lay((u, v, lift) => { const t = lerp(from, to, v); return chain.point(t, ph + u * half, chain.radius(clamp(t, -.2, 2.2)) + lift); }, skin ?? ((p) => chain.skin(clamp(lerp(from, to, .5), 0, 2))), chain.centre(clamp((from + to) / 2, 0, 2))));
  } else {
    const { trunk } = c.form, y1 = Yof(c, from), y0 = Yof(c, to), centre = at * DEG, half = arc * DEG, drape = hangs ? drapeOf(c) : null;
    lay((u, v, lift) => { const y = lerp(y1, y0, v); return drape ? drape.at(y, centre + u * half, lift) : trunk.at(clamp(y, trunk.bottom, trunk.top), centre + u * half, lift); }, skin ?? (drape ? (p) => drape.skin(p) : (p) => trunk.skin(p)), (p) => V(0, p.y, c.form.spineZ(clamp(p.y, trunk.Y.hip, trunk.top))));
  }
}

/**
 * Modelled anatomy for bare skin. `part: 'arm'` draws the arm from the shoulder cap to the wrist with separated
 * deltoid, biceps, triceps and forearm groups; `part: 'chest'` draws the bare chest between two heights over
 * `arc` degrees either side of the front, with pectorals, a sternum line and abdominal blocks. `power` scales
 * the relief (1 lean, 2 heroic).
 */
function physique(c, { part = 'arm', side = 'both', from = -.16, to = 2, color = 'skin', power = 1.5, girth = 0, top = 'base', bottom = 'belt', arc = 180, define = 1 }) {
  const col = c.pal(color), k = c.form.k;
  const bump = (t, t0, w) => Math.exp(-(((t - t0) / w) ** 2));
  if (part === 'arm') {
    const chain = c.form.arm, m0 = chain.metres(from), m1 = chain.metres(to);
    const relief = (t, phi) => {
      const out = Math.max(0, Math.sin(phi)), fr = Math.max(0, Math.cos(phi)), bk = Math.max(0, -Math.cos(phi)), inn = Math.max(0, -Math.sin(phi));
      return k * power * (.02 * bump(t, .08, .2) * (out ** .6 + .35 * fr + .35 * bk) * (1 - .5 * inn)          // deltoid cap
        - .007 * bump(t, .34, .05) * out                                                                          // groove under the deltoid
        + .016 * bump(t, .56, .2) * fr ** 1.2 + .012 * bump(t, .5, .24) * bk ** 1.2                               // biceps, triceps
        - .005 * bump(t, .55, .3) * Math.max(0, Math.sin(phi * 2)) ** 2                                           // groove between them, outside
        - .006 * bump(t, .93, .07)                                                                                // pinch above the elbow
        + .012 * bump(t, 1.2, .17) * Math.max(0, Math.sin(phi + .7)) ** 1.2 + .008 * bump(t, 1.25, .2) * Math.max(0, -Math.sin(phi + .4))   // forearm extensors, flexors
        + .003 * bump(t, 1, .04) * bk
        - .004 * bump(t, .3, .045) * fr                                                                           // where the deltoid tucks in over the biceps
        - .0035 * bump(t, .6, .22) * bump(Math.abs(Math.sin(phi)), 1, .22) * inn                                  // biceps / triceps split on the inside
        + .005 * bump(t, 1.12, .1) * bump(phi, .9, .5)                                                            // brachioradialis running over the elbow
        - .003 * bump(t, 1.34, .2) * bump(phi, 2.2, .3));                                                         // furrow down the back of the forearm                                                                           // elbow point
    };
    sides(c, side, () => c.bag.grid(Math.round(24 * c.q), Math.round(30 * Math.max(.4, (to - from) / 2.2) * c.q), (u, v) => {
      const t = chain.step(0, lerp(m0, m1, v)), phi = u * TAU, r = chain.radius(t) * (1 + girth) + relief(t, phi), p = chain.point(t, phi, r);
      // Shade by how the relief curves: grooves between the muscle groups darken, their crowns lift a little.
      const e = .06, lap = relief(t, phi) - (relief(t - e, phi) + relief(t + e, phi) + relief(t, phi - .35) + relief(t, phi + .35)) / 4;
      return { p, skin: chain.skin(t), c: tone(col, 1 + clamp(lap / (.0022 * k * power), -1, 1) * (lap < 0 ? .34 : .1) * define) };
    }, { closeU: true, color: col, mat: M('skin'), inside: (p) => chain.centre(chain.step(0, clamp(p.clone().sub(chain.points[0]).dot(chain.seg[0].along), m0, m1))) }));
  } else {
    const { trunk } = c.form, y0 = Yof(c, bottom), y1 = Yof(c, top), Y = trunk.Y, half = arc * DEG;
    const relief = (y, th) => {
      const x = Math.sin(th), fr = Math.max(0, Math.cos(th)), ax = Math.abs(x), pec = bump(y, Y.chest + .01 * k, .05 * k) * bump(ax, .42, .3) * fr;
      const abRow = .5 + .5 * Math.cos((y - Y.belt) / (Y.ribs - Y.belt + 1e-6) * PI * 3.2), abs = smooth(Y.ribs + .02 * k, Y.ribs - .03 * k, y) * smooth(Y.belt - .02 * k, Y.belt + .03 * k, y) * bump(ax, .16, .13) * fr;
      return k * power * (.014 * pec - .006 * bump(ax, 0, .05) * fr * smooth(Y.belt, Y.ribs, y) + .007 * abs * abRow - .004 * bump(y, Y.ribs - .005 * k, .018 * k) * fr * bump(ax, .3, .3)
        + .008 * bump(y, Y.chest, .08 * k) * Math.max(0, -Math.cos(th)) * bump(ax, .55, .3) - .005 * Math.max(0, -Math.cos(th)) * bump(ax, 0, .06));
    };
    c.bag.grid(Math.round(40 * c.q * arc / 180), Math.round(26 * c.q), (u, v) => { const th = (u * 2 - 1) * half, y = lerp(y0, y1, v), r = relief(y, th), p = trunk.at(y, th, r); return { p, skin: trunk.skin(p), c: tone(col, 1 - .25 * clamp(-r / (.004 * k * power), 0, 1)) }; },
      { closeU: arc >= 180, color: col, mat: M('skin'), inside: (p) => V(0, p.y, c.form.spineZ(clamp(p.y, trunk.bottom, trunk.top))) });
  }
}

/**
 * A lapel: a folded band running from the collar at the side of the neck diagonally down across the chest to the
 * opposite hip (a wrap-over front). `from` and `to` are [angle degrees, height] ends; `width` its breadth; the
 * outer edge is rolled (`roll`) so it catches the light, and `lining` shows on the turned face.
 */
function lapel(c, { from = [28, 'base'], to = [-30, 'belt'], width = .07, widthEnd = null, off = .012, thick = .006, roll = .008, color = 'cloth', mat = 'cloth', trim = null, trimMat = null, bow = 0, n = 26, trimSpan = .2 }) {
  const { trunk } = c.form, s = scaleOf(c), col = c.pal(color), a0 = from[0] * DEG, a1 = to[0] * DEG, y1 = Yof(c, from[1]), y0 = Yof(c, to[1]), sign = Math.sign(a0 - a1) || 1;
  const pos = (q, e, lift) => { const y = lerp(y1, y0, q), w = lerp(width, widthEnd ?? width * .5, q) * s, th = lerp(a0, a1, q) + bow * DEG * Math.sin(PI * q), rho = trunk.rho(clamp(y, trunk.Y.hip, trunk.top), th); return trunk.at(clamp(y, trunk.bottom, trunk.top), th + sign * e * w / rho, off + lift + roll * s * Math.sin(PI * clamp(e, 0, 1)) ** .5 * (.4 + .6 * e)); };
  const rows = Math.max(8, Math.round(n * c.q)), inner = (p) => V(0, p.y, c.form.spineZ(clamp(p.y, trunk.Y.hip, trunk.top)));
  c.bag.grid(rows, 4, (u, v) => { const p = pos(u, v, thick * s); return { p, skin: trunk.skin(p), c: tone(col, .82 + .22 * v) }; }, { color: col, mat: M(mat), inside: inner });
  for (const e of [0, 1]) c.bag.grid(rows, 1, (u, v) => { const p = pos(u, e, thick * s * (1 - v)); return { p, skin: trunk.skin(p) }; }, { color: tone(col, .45), mat: M(mat), inside: inner });
  if (trim) c.bag.grid(rows, 3, (u, v) => { const i = Math.round(v * 3), p = pos(u, [0, .1, .8, 1][i] * trimSpan, thick * s + .0005 + .0026 * s * [0, 1, 1, 0][i]); return { p, skin: trunk.skin(p) }; }, { color: c.pal(trim), mat: M(trimMat ?? mat), inside: inner });
}

/** A turned-back cuff flaring from the wrist toward the elbow: `flare` is how far its upper edge stands off. */
function cuff(c, { side = 'both', from = 1.55, to = 1.96, flare = .03, off = .012, thick = .005, color = 'cloth', mat = 'cloth', lining = null, trim = null, trimMat = null, droop = 0 }) {
  const chain = c.form.arm, s = scaleOf(c), col = c.pal(color);
  sides(c, side, () => {
    const pos = (u, v, lift) => { const t = lerp(to, from, v), phi = u * TAU; return chain.point(t, phi, chain.radius(t) + off * s + lift + flare * s * v ** 1.4 * (1 + droop * Math.max(0, -Math.sin(phi)))); };
    const inner = chain.centre((from + to) / 2), sk = chain.skin((from + to) / 2);
    c.bag.grid(Math.round(18 * c.q), 4, (u, v) => ({ p: pos(u, v, thick * s), skin: sk }), { closeU: true, color: col, mat: M(mat), inside: inner });
    c.bag.grid(Math.round(18 * c.q), 4, (u, v) => ({ p: pos(u, v, 0), skin: sk }), { closeU: true, color: lining ? c.pal(lining) : tone(col, .5), mat: M(mat), inside: inner, flip: true });
    c.bag.grid(Math.round(18 * c.q), 1, (u, v) => ({ p: pos(u, 1, thick * s * v), skin: sk }), { closeU: true, color: trim ? c.pal(trim) : tone(col, .6), mat: M(trim ? trimMat ?? mat : mat), inside: inner });
    if (trim) c.bag.grid(Math.round(18 * c.q), 3, (u, v) => { const i = Math.round(v * 3); return { p: pos(u, [.84, .86, .98, 1][i], thick * s + .0005 + .0025 * s * [0, 1, 1, 0][i]), skin: sk }; }, { closeU: true, color: c.pal(trim), mat: M(trimMat ?? mat), inside: inner });
  });
}

/**
 * Crest of layered shell plates over a helmet or cap: `tiers` pointed plates rooted one behind the other along
 * the crown, each wider than the head at its middle and lifting away from the skull toward its swept-back tip.
 * `bill` pushes the first plate forward over the brow. Angles are degrees from straight ahead over the crown.
 */
function crest(c, { tiers = 4, start = 8, end = 120, reach = 62, width = 1.25, off = .12, lift = .1, tail = .34, bill = .3, ridge = .05, color = 'nacre', dark = null, mat = 'nacre', edge = null, edgeMat = null, shrink = .12, fan = 0 }) {
  const place = headPlace(c), col = c.pal(color), dk = dark ? c.pal(dark) : tone(col, .78), centre = c.head.C;
  for (let i = tiers - 1; i >= 0; i--) {
    const b0 = lerp(start, end, tiers === 1 ? 0 : i / (tiers - 1)), b1 = b0 + reach, G = width * (1 - shrink * i), ccol = col.clone().lerp(dk, i % 2 ? .6 : 0);
    for (const fx of fan ? [-1, 0, 1] : [0]) {
      const pos = (x, w, under) => {
        const beta = lerp(b0, b1, w) * DEG, gamma = fx * fan * (.4 + .6 * w) + x * G * (fan ? .5 : 1) * Math.sin(PI * clamp(w * .9 + .1, .02, .98)) ** .6 * (1 - .55 * w), d = V(Math.sin(gamma), Math.cos(gamma) * Math.sin(beta), Math.cos(gamma) * Math.cos(beta));
        const p = cranium(d, c.head.P); p.addScaledVector(p.clone().normalize(), off + lift * w * (1 + .25 * i) + ridge * (1 - Math.abs(x)) ** 1.4 - under);
        p.addScaledVector(V(0, -.3, 1), (i === 0 ? bill : 0) * smooth(.35, 0, w) ** 1.5).addScaledVector(V(fx * .5, .5, -1), tail * w ** 1.8 * (1 + .15 * i));
        return place(p);
      };
      c.bag.grid(Math.max(6, Math.round(10 * c.q)), Math.max(6, Math.round(9 * c.q)), (u, v) => ({ p: pos(u * 2 - 1, v, 0), skin: HEAD, c: tone(ccol, 1.1 - .3 * Math.abs(u * 2 - 1) ** 2) }), { color: ccol, mat: M(mat), inside: centre });
      c.bag.grid(Math.max(6, Math.round(10 * c.q)), Math.max(4, Math.round(6 * c.q)), (u, v) => ({ p: pos(u * 2 - 1, v, .03) , skin: HEAD }), { color: tone(ccol, .5), mat: M(mat), inside: centre, flip: true });
      if (edge) for (const sx of [-1, 1]) c.bag.grid(Math.max(6, Math.round(9 * c.q)), 2, (u, v) => ({ p: pos(sx * (1 - v * .14), u, -.006 * Math.sin(PI * v)), skin: HEAD }), { color: c.pal(edge), mat: M(edgeMat ?? mat), inside: centre });
    }
  }
}

export const BUILDERS_X = { plate, pauldron, horn, shards, physique, lapel, cuff, crest };
/** The same builders under their recipe names (`x.` prefix), for a recipe's `builders` field. */
export const X = Object.fromEntries(Object.entries(BUILDERS_X).map(([name, build]) => [`x.${name}`, build]));
