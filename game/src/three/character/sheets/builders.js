// Garment and gear builders. Each takes the build context and a plain-data parameter block from a recipe, and
// emits skinned geometry into the context's Bag. A hero is a list of these calls (see recipes/).
//
// Context: { bag, form, rig, q, pal, rand, head }. `q` scales tessellation (quality tier); `pal(name)` resolves
// a palette entry of the recipe to a colour; `head` is the procedural head's centre, size and face parameters.
import { Quaternion, Vector3 } from 'three';
import { sculpt, cranium } from '../head.js';
import { hair } from './hair.js';
import { hands } from './hands.js';
import { MAT, TAU, V, bar, box, clamp, curve, dome, frame, lerp, moved, ring, roundBox, smooth } from './kernel.js';

const PI = Math.PI, DEG = PI / 180;
const UP = V(0, 1, 0);

/** Run a builder on the wearer's left, right or both sides. Builders are written for the left. */
function sides(c, side, fn) {
  for (const s of side === 'both' ? ['L', 'R'] : [side ?? 'L']) { c.bag.mirror = s === 'R'; fn(s); }
  c.bag.mirror = false;
}
const limbOf = (c, name) => c.form[name];

/** A tube along a limb. radius(t, phi) is its surface; rows are spaced evenly in metres between t0 and t1. */
function tube(c, chain, { t0, t1, nu = 18, nv = 12, radius, color, mat = MAT.cloth, skin = null, tint = null }) {
  const m0 = chain.metres(t0), m1 = chain.metres(t1);
  c.bag.grid(nu * c.q, nv * c.q, (u, v) => {
    const t = chain.step(0, lerp(m0, m1, v)), phi = u * TAU, p = chain.point(t, phi, radius(t, phi));
    return { p, skin: skin ? skin(t, p) : chain.skin(t), c: tint ? tint(t, phi) : color };
  }, { closeU: true, color, mat, inside: (p) => chain.centre(chain.step(0, clamp(p.clone().sub(chain.points[0]).dot(chain.seg[0].along), m0, m1))) });
}

/** A raised band around a limb (strap, cuff, knee band): bevelled, `width` metres along the limb. */
function limbBand(c, chain, { t, width, off = .004, thick = .006, color, mat = MAT.leather, radius = chain.radius, nu = 14, bulge = 0 }) {
  const m = chain.metres(t), profile = [[-.5, 0], [-.4, 1], [.4, 1], [.5, 0]];
  c.bag.grid(nu * c.q, profile.length - 1, (u, v) => {
    const [a, h] = profile[Math.round(v * (profile.length - 1))], tt = chain.step(0, m + a * width), phi = u * TAU;
    return { p: chain.point(tt, phi, radius(tt, phi) + off + thick * h + bulge * h * Math.cos(a * PI)), skin: chain.skin(tt), c: h ? color : color.clone().multiplyScalar(.4) };
  }, { closeU: true, color, mat, inside: chain.centre(t) });
}

/** A raised band around the trunk between two angles (a belt when the angles span the full turn). */
function trunkBand(c, { y, height, off = .008, thick = .008, from = 0, to = TAU, color, mat = MAT.leather, skin = null, n = 44, tilt = 0 }) {
  const { trunk } = c.form, closed = to - from >= TAU - 1e-6, profile = [[-.5, 0], [-.5, .7], [-.38, 1], [.38, 1], [.5, .7], [.5, 0]];
  c.bag.grid(Math.max(6, n * c.q * (to - from) / TAU), profile.length - 1, (u, v) => {
    const [a, h] = profile[Math.round(v * (profile.length - 1))], th = lerp(from, to, u), yy = y + a * height + tilt * Math.sin(th);
    const p = trunk.at(yy, th, off + thick * h);
    return { p, skin: skin ?? trunk.skin(p), c: h >= 1 ? color : color.clone().multiplyScalar(.4 + .3 * h) };
  }, { closeU: closed, color, mat, inside: V(0, y, c.form.spineZ(y)) });
}

/** Rigid frame standing on a limb's surface: x around the limb, y up the limb, z out of it. */
function limbFrame(chain, t, phi, off = 0, radius = chain.radius) {
  const { along, X, Z } = chain.frame(t), out = Z.clone().multiplyScalar(Math.cos(phi)).addScaledVector(X, Math.sin(phi)), up = along.clone().negate();
  return frame(chain.point(t, phi, radius(t, phi) + off), new Vector3().crossVectors(up, out), up, out);
}

// ---------------------------------------------------------------------------------------------------------
// Body

/** Bare limb: the form itself, in skin. */
export function skinLimb(c, { limb = 'arm', side = 'both', from = 0, to = 2, color = 'skin' }) {
  const chain = limbOf(c, limb);
  sides(c, side, () => tube(c, chain, { t0: from, t1: to, nu: 18, nv: 12 * Math.max(.5, to - from), radius: (t, phi) => chain.radius(t) + (chain.muscle ? chain.muscle(t, phi) : 0), color: c.pal(color), mat: MAT.skin }));
}

/** Bare neck from the collar line up into the head. */
export function neck(c, { color = 'skin', from = null } = {}) {
  const { trunk, J } = c.form, y0 = from ?? trunk.Y.base - .01, y1 = J.head.y + .045;
  c.bag.grid(20 * c.q, 5, (u, v) => { const y = lerp(y0, y1, v), p = trunk.at(Math.min(y, trunk.Y.neck), u * TAU, 0); p.y = y; if (y > trunk.Y.neck) p.z += (y - trunk.Y.neck) * .35; return { p, skin: [['neck', 1 - v * .6], ['head', v * .6]] }; },
    { closeU: true, color: c.pal(color), mat: MAT.skin, inside: V(0, (y0 + y1) / 2, J.neck.z) });
}

// ---------------------------------------------------------------------------------------------------------
// Cloth

/**
 * Shirt or tunic body with sleeves. `sleeve` is where the sleeve ends on the arm (1 = elbow, 2 = wrist),
 * `hem` the height of the bottom edge as a trunk landmark or metres, `trim` a piping colour at the cuffs.
 */
export function shirt(c, { color = 'cloth', sleeve = .6, flare = .008, off = .007, hem = 'belt', trim = null, trimWidth = .014, collar = 'base', slack = .004, cap: pad = 0, bell = false }) {
  const { trunk, arm } = c.form, y0 = typeof hem === 'number' ? hem : trunk.Y[hem] - .03, y1 = trunk.Y[collar] ?? collar, col = c.pal(color);
  c.bag.part = 'shirt';
  c.bag.grid(44 * c.q, 26 * c.q, (u, v) => {
    const y = lerp(y0, y1, v), th = u * TAU;
    // Soft vertical creases where the cloth is cinched at the waist.
    const crease = slack * Math.sin(th * 9 + Math.sin(y * 31) * 1.3) * smooth(trunk.Y.chest, trunk.Y.waist, y);
    const p = trunk.at(y, th, off + Math.max(0, crease));
    return { p, skin: trunk.skin(p) };
  }, { closeU: true, color: col, mat: MAT.cloth, inside: V(0, (y0 + y1) / 2, c.form.spineZ(y1)) });
  if (sleeve <= 0) return;
  const cap = -.14, wide = (t) => arm.radius(t) + off + pad * smooth(.5, 0, t);
  // Extra cloth in a sleeve hangs below the arm instead of standing out all round it like a bell
  // (`bell: true` keeps the old all-round flare for sleeves that are meant to be stiff).
  const loose = (t, phi) => flare * smooth(.05, sleeve, t) * (bell ? 1 : .3 + 1.1 * Math.max(0, -Math.sin(phi)) ** 1.5);
  const radius = (t, phi) => (t < 0 ? wide(0) * Math.sqrt(Math.max(0, 1 - (t / cap) ** 2)) * .98 + .001 : wide(t) + loose(t, phi) + slack * .8 * Math.sin(phi * 5 + t * 7) * smooth(0, sleeve * .6, t));
  sides(c, 'both', () => {
    tube(c, arm, { t0: cap, t1: sleeve, nv: 4 + 12 * sleeve, radius, color: col });
    // The cuff turns in on itself so the sleeve has an edge with thickness.
    const end = arm.metres(sleeve);
    c.bag.grid(18 * c.q, 2, (u, v) => { const t = arm.step(0, end - v * .012), phi = u * TAU; return { p: arm.point(t, phi, radius(sleeve, phi) - v * .008), skin: arm.skin(t) }; }, { closeU: true, color: col.clone().multiplyScalar(.55), mat: MAT.cloth, inside: arm.centre(sleeve), flip: true });
    if (trim) limbBand(c, arm, { t: arm.step(sleeve, -trimWidth / 2 - .001), width: trimWidth, off: .0015, thick: .0022, color: c.pal(trim), mat: MAT.cloth, radius });
  });
}

/**
 * Trousers: a seat that follows the hips and two legs that balloon and are gathered at `gather` (1 = knee).
 * `bag` is the extra room at the widest point; `pleats` the number of folds running into the gather.
 */
export function trousers(c, { color = 'cloth', gather = 1.14, bag = .046, pleats = 13, top = 'belt', piping = null, cuff = .006, pockets = [[28, 80, .0, .3], [152, 110, .04, .2]], pipingPaths = [[22, 84, -.02, .4], [84, 74, .4, .96], [208, 150, .1, .5]], from = null, low = 0 }) {
  const { trunk, leg } = c.form, col = c.pal(color), yTop = trunk.Y[top] + .02;
  c.bag.part = 'trousers';
  // `from` starts the legs lower down, for trousers worn under a long coat: no seat and no thigh to push through it.
  if (from === null) c.bag.grid(40 * c.q, 12 * c.q, (u, v) => {
    const y = lerp(trunk.Y.crotch - .03, yTop, v), th = u * TAU, shut = smooth(trunk.Y.crotch + .03, trunk.Y.crotch - .03, y);
    const p = trunk.at(Math.max(y, trunk.Y.crotch), th, .011); p.y = y; p.x *= 1 - shut * .75; p.z = lerp(p.z, c.form.spineZ(y), shut * .6);
    return { p, skin: trunk.skin(p) };
  }, { closeU: true, color: col, mat: MAT.cloth, inside: V(0, trunk.Y.hip, c.form.spineZ(trunk.Y.hip)) });
  // Fullest at mid-thigh, then tapering to the knee where the pleats take up what is left.
  // `low` (0..1) slings the fullness down toward the gather: hakama-like legs bloused over the knee band.
  const room = curve([[-.2, bag * lerp(.25, .2, low)], [.1, bag * lerp(.6, .42, low)], [.45, bag * lerp(1, .74, low)], [.8, bag * lerp(.86, 1, low)], [gather - .14, bag * lerp(.74, 1.04, low)], [gather - .06, bag * lerp(.6, .9, low)], [gather - .014, cuff + .012 + bag * .3 * low], [gather, cuff]]);
  const seedA = c.rand() * TAU, seedB = c.rand() * TAU, seedC = c.rand() * TAU;
  const radius = (t, phi) => {
    // More room to the front and outside than between the legs.
    const base = leg.radius(t) + room(t) * (1 - .3 * Math.max(0, -Math.sin(phi)) * smooth(-.1, .3, t));
    const near = smooth(.35, gather - .06, t) * smooth(gather - .004, gather - .04, t);      // pleats crowd into the band
    const pleat = Math.sin(phi * pleats + seedA + Math.sin(t * 11 + phi * 2) * .9), sharp = Math.sign(pleat) * Math.abs(pleat) ** .6;
    const drag = Math.sin(phi * 2 + t * 8.5 + seedB) * .008 + Math.sin(phi * 4 - t * 13 + seedC) * .0045;      // long folds pulled across the thigh
    const folds = .011 * near * sharp + drag * smooth(-.05, .45, t) * smooth(gather, gather - .12, t);
    const cap = -.16;
    return t < 0 ? (base + folds) * Math.sqrt(Math.max(.02, 1 - (t / cap) ** 2)) : base + folds;
  };
  const light = col.clone().multiplyScalar(1.7), dark = col.clone().multiplyScalar(.3);
  // Sewn lines riding on the leg: [from angle, to angle, from t, to t, colour, width, lift].
  const start = from ?? -.155, lines = [[92, 88, Math.max(0, start), gather - .03, light, .0045, .0016], [-88, -92, Math.max(.16, start), gather - .03, light, .004, .0014]];
  for (const pocket of pockets) lines.push([pocket[0], pocket[1], pocket[2], pocket[3], dark, .011, .0012]);
  if (piping) for (const path of pipingPaths) lines.push([...path, c.pal(piping), .0065, .0026]);
  sides(c, 'both', () => {
    tube(c, leg, { t0: start, t1: gather, nu: 28, nv: 30 * (gather - start) / 1.3, radius, color: col });
    for (const [a0, a1, tA, tB, tone, width, lift] of lines) c.bag.grid(1, 16 * c.q, (u, v) => {
      const t = lerp(tA, tB, v), phi = lerp(a0, a1, smooth(0, 1, v) * .6 + v * .4) * DEG + (u - .5) * width / leg.radius(t);
      return { p: leg.point(t, phi, radius(t, phi) + lift), skin: leg.skin(t) };
    }, { color: tone, mat: MAT.cloth, inside: leg.centre(.5) });
  });
  c.trouserGather = gather;
}

/** Close wrapping on a limb (shin wraps, arm bindings): a tight tube with ribs every `pitch` metres. */
export function wrap(c, { limb = 'leg', side = 'both', from, to, color = 'cloth', off = .005, pitch = .016, depth = .0022, mat = 'cloth' }) {
  const chain = limbOf(c, limb), length = chain.metres(to) - chain.metres(from), turns = Math.max(2, Math.round(length / pitch));
  c.bag.part = 'wrap';
  sides(c, side, () => tube(c, chain, {
    t0: from, t1: to, nv: turns * 2 / c.q, color: c.pal(color), mat: MAT[mat],
    // A spiral binding: the rib climbs once around per turn.
    radius: (t, phi) => chain.radius(t) + off + depth * (.5 + .5 * Math.cos(((chain.metres(t) - chain.metres(from)) / length * turns + phi / TAU) * TAU)),
  }));
}

/** A band around a limb, optionally with a thinner trim band along its upper edge. */
export function band(c, { limb = 'leg', side = 'both', at, width = .04, off = .006, thick = .007, color = 'leather', mat = 'leather', trim = null, trimWidth = .01, buckle = null }) {
  const chain = limbOf(c, limb);
  c.bag.part = 'band';
  sides(c, side, () => {
    limbBand(c, chain, { t: at, width, off, thick, color: c.pal(color), mat: MAT[mat] });
    if (trim) limbBand(c, chain, { t: chain.step(at, -width / 2 + trimWidth * .2), width: trimWidth, off: off + thick * .6, thick: thick * .7, color: c.pal(trim), mat: MAT.cloth });
    if (buckle) c.bag.solid(buckleShape(width * .62, width * .5), limbFrame(chain, at, buckle.phi * DEG, off + thick), chain.skin(at), c.pal(buckle.color ?? 'iron'), MAT.iron);
  });
}

/** Rectangular buckle frame with a prong, lying in XY. */
function buckleShape(w, h, r = .0032) {
  const parts = [
    moved(box(r, h + r, r), V(-w, 0, r)), moved(box(r, h + r, r), V(w, 0, r)), moved(box(w, r, r), V(0, h, r)), moved(box(w, r, r), V(0, -h, r)), moved(box(w * .95, r * .6, r * .6), V(w * .05, 0, r * 1.7)),
  ];
  return merge(parts);
}
function merge(shapes) {
  const verts = [], quads = [];
  for (const s of shapes) { const base = verts.length; verts.push(...s.verts); for (const q of s.quads) quads.push(q.map((i) => i + base)); }
  return { verts, quads };
}

/**
 * Draped mantle hanging from the collar. `length(theta)` is how far the cloth runs from the neck in each
 * direction (metres along the cloth), so an asymmetric capelet is just a longer run over one shoulder.
 * The cloth is laid over the form: it rests where the shoulders and arms carry it and hangs where they do not.
 */
export function capelet(c, { color = 'cloth', long = .42, short = .11, toward = -90, sharp = 1.3, trim = null, trimWidth = .016, over = .034, lift = .012, ripple = .008 }) {
  const { trunk, J, S } = c.form, col = c.pal(color), aim = toward * DEG;
  c.bag.part = 'capelet';
  const nu = Math.round(64 * c.q), nv = Math.round(18 * c.q), yNeck = trunk.Y.base + .028;
  const pad = (y) => lerp(over, lift, smooth(trunk.Y.chest - .02, trunk.Y.armpit + .03, y));
  const run = (th) => lerp(short, long, ((1 + Math.cos(th - aim)) / 2) ** sharp);
  const columns = [];
  for (let i = 0; i < nu; i++) {
    const th = i / nu * TAU, sn = Math.sin(th), cs = Math.cos(th), L = run(th), zc = c.form.spineZ(yNeck);
    let d = trunk.rho(yNeck, th) + .016, y = yNeck, arc = 0; const path = [{ d, y, arc }], ds = .008;
    for (let guard = 0; guard < 400 && arc < L; guard++) {
      const ahead = c.form.over(sn * (d + ds), zc + cs * (d + ds), pad, lift + .012) + .002;
      if (ahead >= y - ds * 3.2) { arc += Math.hypot(ds, ahead - y); d += ds; y = ahead; }
      else {
        d += ds * .1; y -= ds; arc += ds;
        const rest = c.form.over(sn * d, zc + cs * d, pad, lift + .012) + .002; if (rest > y) y = rest;
      }
      path.push({ d, y, arc });
    }
    columns.push({ th, sn, cs, zc, L, path });
  }
  const seed = c.rand() * TAU;
  const rawAt = (column, v) => {
    const want = column.L * v, path = column.path; let k = 1; while (k < path.length - 1 && path[k].arc < want) k++;
    const a = path[k - 1], b = path[k], f = clamp((want - a.arc) / Math.max(1e-6, b.arc - a.arc), 0, 1);
    const hang = v ** 1.5 * smooth(.08, .3, column.L), wave = Math.sin(column.th * 5 + seed) + .5 * Math.sin(column.th * 8 + seed * 2.3);
    const d = lerp(a.d, b.d, f) + ripple * hang * wave + .005 * v, y = lerp(a.y, b.y, f) - .5 * ripple * hang * Math.cos(column.th * 5 + seed);
    return V(column.sn * d, y, column.zc + column.cs * d);
  };
  // Neighbouring runs of cloth are blended, so the hem is one flowing line rather than a step per column.
  columns.forEach((column, i) => { column.i = i; });
  const at = (column, v) => {
    const out = V(); let total = 0;
    for (let k = -3; k <= 3; k++) { const w = 4 - Math.abs(k), blend = w * smooth(0, .25, v) + (k === 0 ? 4 : 0) * (1 - smooth(0, .25, v)); out.addScaledVector(rawAt(columns[(column.i + k + nu) % nu], v), blend); total += blend; }
    return out.multiplyScalar(1 / total);
  };
  const skin = (p) => {
    const side = p.x >= 0 ? 'L' : 'R', onArm = smooth(S - .05, S + .05, Math.abs(p.x)) * smooth(J['upperarm.L'].y + .06, J['upperarm.L'].y - .02, p.y) * .82;
    const girdle = (1 - onArm) * smooth(S * .5, S, Math.abs(p.x)) * .4, neckK = smooth(J.neck.y - .01, J.neck.y + .04, p.y) * .5;
    const lowArm = onArm * smooth(J['forearm.L'].y + .1, J['forearm.L'].y - .02, p.y) * .0;
    return [['spine2', (1 - onArm - girdle) * (1 - neckK)], ['neck', (1 - onArm - girdle) * neckK], [`shoulder.${side}`, girdle], [`upperarm.${side}`, onArm - lowArm]];
  };
  const inner = V(0, J.spine2.y, J.spine2.z);
  c.bag.grid(nu, nv, (u, v) => { const p = at(columns[Math.round(u * nu) % nu], v); return { p, skin: skin(p) }; }, { closeU: true, color: col, mat: MAT.cloth, inside: inner });
  // Hem: a turned edge, and the trim sewn just above it.
  const edge = (v, out) => (u) => { const column = columns[Math.round(u * nu) % nu], p = at(column, v); if (out) { p.x += column.sn * out; p.z += column.cs * out; } return p; };
  c.bag.grid(nu, 1, (u, v) => { const p = v ? edge(1 - .012 / 1, 0)(u).multiplyScalar(1).add(V(0, 0, 0)) : edge(1, 0)(u); if (v) { const column = columns[Math.round(u * nu) % nu]; p.x -= column.sn * .007; p.z -= column.cs * .007; } return { p, skin: skin(p) }; },
    { closeU: true, color: col.clone().multiplyScalar(.5), mat: MAT.cloth, inside: inner, flip: true });
  // Rolled hem: a cord of cloth along the edge gives the mantle its thickness.
  c.bag.grid(nu, 5, (u, v) => { const column = columns[Math.round(u * nu) % nu], p = at(column, 1), a = v * TAU; p.x += column.sn * Math.cos(a) * .0045; p.z += column.cs * Math.cos(a) * .0045; p.y += Math.sin(a) * .0045 - .002; return { p, skin: skin(p) }; },
    { closeU: true, color: (trim ? c.pal(trim) : col).clone().multiplyScalar(.8), mat: MAT.cloth, inside: inner });
  if (trim) {
    const rows = [[1 - trimWidth / long * 1.25, 0], [1 - trimWidth / long * 1.15, .0026], [1 - .0015, .0026], [1, 0]];
    c.bag.grid(nu, rows.length - 1, (u, v) => {
      const column = columns[Math.round(u * nu) % nu], [f, out] = rows[Math.round(v * (rows.length - 1))];
      // The trim keeps its width in metres however long this run of cloth is.
      const vv = f === 1 ? 1 : 1 - (1 - f) * long / column.L, p = at(column, clamp(vv, 0, 1)); p.x += column.sn * out; p.z += column.cs * out;
      return { p, skin: skin(p) };
    }, { closeU: true, color: c.pal(trim), mat: MAT.cloth, inside: inner });
  }
  c.mantle = { run, pad };
}

/** Rolled cowl / scarf collar around the neck: `rolls` stacked folds of cloth. */
export function cowl(c, { color = 'cloth', rolls = 2, radius = .026, rise = .03, base = -.012 }) {
  const { trunk, J } = c.form, col = c.pal(color), y0 = trunk.Y.base + .012 + base;
  c.bag.part = 'cowl';
  const seed = c.rand() * TAU;
  for (let k = 0; k < rolls; k++) {
    const r = radius * (1 - k * .16), y = y0 + k * rise, reach = .012 - k * .008;
    c.bag.grid(34 * c.q, 8, (u, v) => {
      const th = u * TAU, a = v * TAU, sag = .006 * Math.sin(th * 3 + seed + k), ring = trunk.rho(Math.min(y, trunk.Y.neck), th) + reach + r * .55;
      const d = ring + Math.cos(a) * r * (1 + .2 * Math.sin(th * 5 + seed * 2 + k * 2)), yy = y + sag + Math.sin(a) * r * 1.05 + Math.cos(th) * -.006 * k + .006 * Math.sin(th * 7 + a * 2 + k);
      const p = V(Math.sin(th) * d, yy, c.form.spineZ(y) + Math.cos(th) * d * 1.02 + .004 * k);
      return { p, skin: [['spine2', .55 - k * .2], ['neck', .45 + k * .2]] };
    }, { closeU: true, color: col, mat: MAT.cloth, inside: V(0, y + .2, J.neck.z) });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Trunk gear

/** Slab with rounded edges, subdivided along x so it can be wrapped around the trunk or a limb. */
function slab(hx, hy, hz, r, cuts = 8) {
  const shape = roundBox(hx, hy, hz, r), verts = [], quads = [];
  // Re-tessellate the four faces that run along x; the two end faces stay as they are.
  const n = Math.max(1, Math.round(cuts)), xs = [-hx, -hx + r]; for (let i = 1; i < n; i++) xs.push(lerp(-hx + r, hx - r, i / n)); xs.push(hx - r, hx);
  const ring = [[-hy, -hz + r, 0, -1, 0], [-hy, hz - r, 0, -1, 0], [-hy + r, hz, 0, 0, 1], [hy - r, hz, 0, 0, 1], [hy, hz - r, 0, 1, 0], [hy, -hz + r, 0, 1, 0], [hy - r, -hz, 0, 0, -1], [-hy + r, -hz, 0, 0, -1]];
  for (const x of xs) for (const [y, z, , ny, nz] of ring) {
    const q = [clamp(x, -(hx - r), hx - r), clamp(y, -(hy - r), hy - r), clamp(z, -(hz - r), hz - r)], d = V(x - q[0], y - q[1], z - q[2]);
    if (d.lengthSq() > 1e-12) d.normalize(); else d.set(0, ny, nz);
    verts.push({ p: V(q[0], q[1], q[2]).addScaledVector(d, r), n: d, e: ny !== 0 || x === xs[0] || x === xs[xs.length - 1] ? 1 : 0 });
  }
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < 8; j++) quads.push([i * 8 + j, i * 8 + (j + 1) % 8, (i + 1) * 8 + (j + 1) % 8, (i + 1) * 8 + j]);
  // End faces from the plain box (axis 0, both signs: its first 32 vertices and 18 quads).
  const base = verts.length; for (let i = 0; i < 32; i++) verts.push(shape.verts[i]); for (let i = 0; i < 18; i++) quads.push(shape.quads[i].map((k) => k + base));
  return { verts, quads };
}

/**
 * Stacked plates banded around the chest, front and back, tied by side straps and riveted vertical harness
 * straps. `top`/`bottom` are heights as fractions between the waist (0) and the chest line (1).
 */
export function chestPlates(c, { count = 3, color = 'ceramic', mat = 'ceramic', top = 1.02, bottom = .08, gap = .012, thick = .015, arc = 64, backArc = 58, off = .009, strap = 'leatherDark', rivet = 'iron', harness = [42] }) {
  const { trunk, J } = c.form, y0 = lerp(trunk.Y.waist, trunk.Y.chest, bottom), y1 = lerp(trunk.Y.waist, trunk.Y.chest, top), each = (y1 - y0 - gap * (count - 1)) / count;
  c.bag.part = 'plates';
  const boneAt = (y) => [[y < (J.spine.y + J.spine1.y) / 2 ? 'spine' : y < (J.spine1.y + J.spine2.y) / 2 + .01 ? 'spine1' : 'spine2', 1]];
  for (let i = 0; i < count; i++) {
    const y = y0 + each / 2 + i * (each + gap);
    for (const [centre, half] of [[0, arc * DEG], [PI, backArc * DEG]]) {
      const rho = trunk.rho(y, centre);
      c.bag.solid(slab(half * rho, each / 2, thick / 2, .0045, 8 * c.q), trunk.wrap(y, centre, off + thick / 2), boneAt(y), c.pal(color), MAT[mat]);
      // Iron end clasps where the plate meets its side strap.
      for (const s of [-1, 1]) c.bag.solid(box(.007, each / 2 - .006, thick / 2 + .002), trunk.wrap(y, centre + s * (half - .009 / rho), off + thick / 2), boneAt(y), c.pal(rivet), MAT.iron);
    }
  }
  // Side straps tie front to back; harness straps run down over the plates with a rivet on each.
  const mid = (y0 + y1) / 2, span = (y1 - y0) / 2;
  for (const s of [-1, 1]) {
    trunkBandPatch(c, { y: mid, half: span + .008, th: s * PI / 2, width: .05, off: off - .002, thick: .005, color: c.pal(strap), mat: MAT.leather });
    for (const front of [true, false]) for (const a of harness) {
      const th = front ? s * a * DEG : PI - s * a * DEG;
      trunkBandPatch(c, { y: mid + .012, half: span + .03, th, width: .026, off: off + thick + .0005, thick: .0045, color: c.pal(strap), mat: MAT.leather });
      for (let i = 0; i < count; i++) c.bag.solid(dome(.0055, .004, 7), trunk.wrap(y0 + each / 2 + i * (each + gap), th, off + thick + .005), boneAt(y0 + each / 2 + i * (each + gap)), c.pal(rivet), MAT.iron);
    }
  }
  c.plates = { y0, y1, off: off + thick };
}

/** A vertical strap lying on the trunk: `width` metres of arc centred on angle th, `half` metres up and down. */
function trunkBandPatch(c, { y, half, th, width, off, thick, color, mat }) {
  const { trunk } = c.form, rho = trunk.rho(y, th);
  c.bag.solid(slabY(width / 2, half, thick / 2, .0018, Math.max(2, half * 60 * c.q)), trunk.wrap(y, th, off + thick / 2), (p) => trunk.skin(p), color, mat);
  void rho;
}
/** Like slab, subdivided along y instead (for straps that run up the body). */
function slabY(hx, hy, hz, r, cuts) {
  const s = slab(hy, hx, hz, r, cuts), turn = new Quaternion().setFromAxisAngle(V(0, 0, 1), PI / 2);
  return moved(s, V(), turn);
}

/** Belt with a framed buckle and keeper loops. */
export function belt(c, { y = 'belt', rise = 0, height = .046, thick = .008, off = .012, color = 'leather', buckle = 'iron', at = 0, keepers = [28, -28, 150, -150], tilt = 0, buckleSize = [.03, .024], studs = 0 }) {
  const { trunk } = c.form, yy = (trunk.Y[y] ?? y) + rise;
  c.bag.part = 'belt';
  trunkBand(c, { y: yy, height, off, thick, color: c.pal(color), tilt });
  const at0 = at * DEG;
  if (buckle) {
    const place = trunk.wrap(yy + tilt * Math.sin(at0), at0, off + thick), skin = [['hips', 1]];
    c.bag.solid(roundBox(buckleSize[0] + .004, buckleSize[1] + .004, .003, .002), place, skin, c.pal(buckle), MAT.iron);
    c.bag.solid(moved(roundBox(buckleSize[0] - .006, buckleSize[1] - .007, .002, .001), V(0, 0, .0022)), place, skin, c.pal('hollow'), MAT.hollow);
    c.bag.solid(moved(bar(.0028, buckleSize[0] - .004, 6), V(0, 0, .0045), new Quaternion().setFromAxisAngle(V(0, 0, 1), PI / 2)), place, skin, c.pal(buckle), MAT.iron);
  }
  for (let i = 0; i < studs; i++) { const th = at0 + (i + .5) / studs * TAU; if (Math.abs(Math.atan2(Math.sin(th - at0), Math.cos(th - at0))) < .32) continue; c.bag.solid(dome(.006, .0045, 6), trunk.wrap(yy + tilt * Math.sin(th), th, off + thick), (p) => trunk.skin(p), c.pal(buckle ?? 'iron'), MAT.iron); }
  for (const k of keepers) trunkBandPatch(c, { y: yy + tilt * Math.sin(k * DEG), half: height / 2 + .004, th: k * DEG, width: .012, off: off + thick - .001, thick: .004, color: c.pal(color).clone().multiplyScalar(.7), mat: MAT.leather });
}

/**
 * A strap following a closed path around the trunk, given as waypoints { th (degrees), y, off }. Used for
 * bandoliers and harnesses. `ring` puts an anchor ring with a keeper at a point along the path (0..1).
 */
export function strap(c, { path, width = .034, thick = .006, color = 'leather', closed = true, anchor = null, n = 72 }) {
  const { trunk } = c.form, col = c.pal(color);
  c.bag.part = 'strap';
  const pts = path.map((w) => ({ th: w.th * DEG, y: trunk.Y[w.y] !== undefined ? trunk.Y[w.y] + (w.dy ?? 0) : w.y, off: w.off ?? .012 }));
  const count = pts.length, sample = (s) => {
    // Catmull-Rom through the waypoints in (angle, height, offset).
    const f = s * (closed ? count : count - 1), i = Math.floor(f), t = f - i, get = (k) => pts[closed ? ((k % count) + count) % count : clamp(k, 0, count - 1)];
    const unwrap = (k) => { const w = get(k); let th = w.th; if (closed) th += Math.floor(k / count) * (pts[count - 1].th > pts[0].th ? TAU : -TAU); return { ...w, th }; };
    const [a, b, d, e] = [unwrap(i - 1), unwrap(i), unwrap(i + 1), unwrap(i + 2)];
    const cr = (p0, p1, p2, p3) => .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    return { th: cr(a.th, b.th, d.th, e.th), y: cr(a.y, b.y, d.y, e.y), off: cr(a.off, b.off, d.off, e.off) };
  };
  const centre = (s, lift = 0) => { const w = sample(s); return trunk.at(clamp(w.y, trunk.bottom, trunk.top), w.th, w.off + lift); };
  const profile = [[-.5, 0], [-.5, 1], [.5, 1], [.5, 0]];
  const framed = (s) => {
    const p = centre(s), ahead = centre(s + .002), up = centre(s, .01).sub(p).normalize(), along = ahead.sub(p).normalize(), across = new Vector3().crossVectors(up, along).normalize();
    return { p, up, along, across };
  };
  c.bag.grid(n * c.q, 3, (u, v) => {
    const f = framed(closed ? u : u * .998), [a, h] = profile[Math.round(v * 3)], p = f.p.clone().addScaledVector(f.across, a * width).addScaledVector(f.up, h * thick);
    return { p, skin: trunk.skin(p), c: h ? col : col.clone().multiplyScalar(.35) };
  }, { closeU: closed, color: col, mat: MAT.leather, inside: V(0, trunk.Y.ribs, c.form.spineZ(trunk.Y.ribs)) });
  if (anchor) {
    const f = framed(anchor.at), place = frame(f.p.clone().addScaledVector(f.up, thick), f.across, f.along, f.up), skin = trunk.skin(f.p);
    const iron = c.pal(anchor.color ?? 'iron'), size = anchor.size ?? .024;
    // Square anchor ring the strap is threaded through, a keeper either side, and the tongue plate.
    c.bag.solid(moved(buckleShape(size, size * .8, .0042), V(0, 0, .001)), place, skin, iron, MAT.iron);
    c.bag.solid(moved(box(width * .56, .006, .0035), V(0, size * 1.25, .002)), place, skin, col.clone().multiplyScalar(.6), MAT.leather);
    c.bag.solid(moved(box(width * .56, .006, .0035), V(0, -size * 1.25, .002)), place, skin, col.clone().multiplyScalar(.6), MAT.leather);
    for (const sx of [-1, 1]) c.bag.solid(moved(dome(.004, .003, 6), V(sx * width * .3, -size * 1.9, .001)), place, skin, iron, MAT.iron);
  }
}


// ---------------------------------------------------------------------------------------------------------
// Coats, aprons and packs

/**
 * Skirt of a coat or robe: continues the trunk below the hips and flares to the hem. `hem` is the height of the
 * bottom edge as a fraction from the ground (0) to the hip line (1); `flare` widens the hem. Later parts can lay
 * panels on it through c.coat.at(y, th, off).
 */
export function skirt(c, { color = 'cloth', top = 'belt', hem = .38, flare = 1.14, off = .016, folds = 9, trim = null, trimWidth = .016, split = null }) {
  const { trunk, J, leg } = c.form, col = c.pal(color), yTop = trunk.Y[top], yHip = trunk.Y.hip, yHem = lerp(0, yHip, hem);
  c.bag.part = 'skirt';
  const seed = c.rand() * TAU;
  // Wide enough at every height to clear the legs and whatever they wear.
  const legReach = (y) => { const t = clamp((J['thigh.L'].y - y) / leg.seg[0].length, 0, 1.4); return leg.centre(t).x + leg.radius(t) + .028; };
  const at = (y, th, extra = 0, out = new Vector3()) => {
    if (y >= yHip) return trunk.at(y, th, off + extra, out);
    const f = (yHip - y) / (yHip - yHem), grow = 1 + (flare - 1) * f ** .8, p = trunk.at(yHip, th, off + extra, out), zc = c.form.spineZ(yHip);
    const need = legReach(y) / Math.max(.01, trunk.section(yHip).a + off), wide = Math.max(grow, lerp(1, need, smooth(0, .25, f)));
    const fold = 1 + .02 * f * Math.sin(th * folds + seed + Math.sin(f * 4) * .5);
    p.x *= wide * fold; p.z = zc + (p.z - zc) * grow * fold; p.y = y;
    return p;
  };
  const skin = (p) => {
    if (p.y >= yHip) return trunk.skin(p);
    const side = p.x >= 0 ? 'L' : 'R', drop = smooth(yHip + .03, yHip - .17, p.y) * .84, lower = smooth(J['shin.L'].y + .05, J['shin.L'].y - .25, p.y) * .3, left = smooth(-.14, .14, p.x);
    return [['hips', 1 - drop], ['thigh.L', drop * left * (1 - lower)], ['thigh.R', drop * (1 - left) * (1 - lower)], [`shin.${side}`, drop * lower]];
  };
  const inner = (p) => V(0, p.y, c.form.spineZ(yHip));
  c.bag.grid(44 * c.q, 22 * c.q, (u, v) => { const p = at(lerp(yHem, yTop, v), u * TAU); return { p, skin: skin(p) }; }, { closeU: true, color: col, mat: MAT.cloth, inside: inner });
  c.bag.grid(44 * c.q, 1, (u, v) => { const p = at(yHem + v * .015, u * TAU, -v * .012); return { p, skin: skin(p) }; }, { closeU: true, color: col.clone().multiplyScalar(.5), mat: MAT.cloth, inside: inner, flip: true });
  if (trim) c.bag.grid(44 * c.q, 3, (u, v) => { const [dy, h] = [[0, 0], [.001, 1], [trimWidth, 1], [trimWidth + .001, 0]][Math.round(v * 3)], p = at(yHem + .012 + dy, u * TAU, .003 * h); return { p, skin: skin(p) }; }, { closeU: true, color: c.pal(trim), mat: MAT.cloth, inside: inner });
  c.coat = { at, skin, yHem, yTop, off };
}

/**
 * A flat panel worn on the front or back of the trunk and coat: an apron bib, an apron skirt, a tabard.
 * `from`/`to` are heights (trunk landmark, or a fraction 0..1 from the ground to the hip line when below the
 * hips); `width` is the half-width in metres at the top and bottom; `border` adds a raised trim around it.
 */
export function panel(c, { color = 'ceramic', mat = 'ceramic', at = 0, from, to, width = [.12, .16], off = .012, thick = .006, border = null, borderWidth = .014, round = .04 }) {
  const { trunk } = c.form, col = c.pal(color), centre = at * DEG;
  c.bag.part = 'panel';
  const height = (h) => (typeof h === 'string' ? trunk.Y[h] : lerp(0, trunk.Y.hip, h));
  const y1 = height(from), y0 = height(to), surface = (y, th, extra) => (c.coat ? c.coat.at(y, th, extra - (y >= trunk.Y.hip ? 0 : 0)) : trunk.at(y, th, extra));
  const skin = (p) => (c.coat ? c.coat.skin(p) : trunk.skin(p));
  const rho = (y) => trunk.rho(Math.max(y, trunk.Y.hip), centre);
  const point = (a, b, lift) => {
    // a: -1..1 across, b: 0 (top) .. 1 (bottom). Bottom corners are rounded off.
    const y = lerp(y1, y0, b), w = lerp(width[0], width[1], b), corner = Math.max(0, Math.abs(a) * w - (w - round)) / round, drop = round * (1 - Math.sqrt(Math.max(0, 1 - corner * corner)));
    const yy = b > .5 ? Math.max(y, y0 + drop * smooth(.5, 1, b) * (b >= 1 ? 1 : (b - .5) * 2)) : y;
    return surface(yy, centre + a * w / rho(yy), lift);
  };
  const nx = Math.round(12 * c.q), ny = Math.round(Math.max(4, (y1 - y0) * 60 * c.q));
  const lift = off;
  c.bag.grid(nx, ny, (u, v) => { const p = point(u * 2 - 1, v, lift + thick); return { p, skin: skin(p) }; }, { color: col, mat: MAT[mat], inside: (p) => V(0, p.y, c.form.spineZ(trunk.Y.hip)) });
  // Edge wall, so the panel has thickness.
  const rim = (k, a, b) => point(a, b, lift + thick * (1 - k) - k * .004);
  const edges = [[(s) => [-1, s]], [(s) => [1, s]], [(s) => [s * 2 - 1, 0]], [(s) => [s * 2 - 1, 1]]];
  for (const [edge] of edges) c.bag.grid(Math.max(nx, ny), 1, (u, v) => { const [a, b] = edge(u), p = rim(v, a, b); return { p, skin: skin(p) }; }, { color: col.clone().multiplyScalar(.6), mat: MAT[mat], inside: (p) => V(0, p.y, c.form.spineZ(trunk.Y.hip)) });
  if (border) {
    const bw = borderWidth, strips = [[(s, k) => [-1 + k * bw / width[1], s]], [(s, k) => [1 - k * bw / width[1], s]], [(s, k) => [(s * 2 - 1), k * bw / (y1 - y0)]], [(s, k) => [(s * 2 - 1), 1 - k * bw / (y1 - y0)]]];
    for (const [strip] of strips) c.bag.grid(Math.max(nx, ny), 3, (u, v) => {
      const k = [0, .08, .92, 1][Math.round(v * 3)], h = [0, 1, 1, 0][Math.round(v * 3)], [a, b] = strip(u, k), p = point(a, clamp(b, 0, 1), lift + thick + .0005 + .003 * h);
      return { p, skin: skin(p) };
    }, { color: c.pal(border), mat: MAT[mat], inside: (p) => V(0, p.y, c.form.spineZ(trunk.Y.hip)) });
  }
}

/** Curved plate strapped to the outside of a limb (forearm guard, shin guard). */
export function limbPlate(c, { limb = 'arm', side = 'both', at = 1.5, phi = 90, length = .15, arc = .055, off = .014, thick = .008, color = 'ceramic', mat = 'ceramic', straps = 2, strapColor = 'leatherDark', border = null }) {
  const chain = limbOf(c, limb);
  c.bag.part = 'limbPlate';
  sides(c, side, () => {
    for (let i = 0; i < straps; i++) limbBand(c, chain, { t: chain.step(at, (i / Math.max(1, straps - 1) - .5) * length * .62), width: .018, off: off - .011, thick: .004, color: c.pal(strapColor), mat: MAT.leather });
    c.bag.solid(slabY(arc, length / 2, thick / 2, .0035, 5 * c.q), chain.wrap(at, phi * DEG, off + thick / 2), (p) => chain.skin(at), c.pal(color), MAT[mat]);
    if (border) for (const sy of [-1, 1]) c.bag.solid(moved(slab(arc + .001, .005, thick / 2 + .0015, .002, 4), V(0, sy * (length / 2 - .005), 0)), chain.wrap(at, phi * DEG, off + thick / 2), (p) => chain.skin(at), c.pal(border), MAT[mat]);
  });
}

/**
 * Kiln pack carried on the back: an iron-bound firebox with a vented door, and a square chimney rising behind
 * the head. Everything rides the upper spine as one rigid piece.
 */
export function kilnPack(c, { color = 'ceramic', iron = 'iron', ember = 'ember', width = .14, height = .15, depth = .095, at = 'ribs', rise = .02, chimney = .33, flue = .052, shift = 0, off = .004 }) {
  const { trunk } = c.form, y = trunk.Y[at] + rise, back = trunk.at(y, PI, off), skin = [['spine2', 1]], col = c.pal(color), fe = c.pal(iron);
  c.bag.part = 'pack';
  const place = frame(V(shift, y, back.z - depth), V(-1, 0, 0), V(0, 1, 0), V(0, 0, -1));
  c.bag.solid(roundBox(width, height, depth, .008), place, skin, col, MAT.ceramic);
  // Iron binding on the edges of the box.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.bag.solid(moved(box(.011, height + .004, .011), V(sx * (width - .006), 0, sz * (depth - .006))), place, skin, fe, MAT.iron);
  for (const sy of [-1, 1]) { for (const sz of [-1, 1]) c.bag.solid(moved(box(width + .004, .011, .011), V(0, sy * (height - .006), sz * (depth - .006))), place, skin, fe, MAT.iron); for (const sx of [-1, 1]) c.bag.solid(moved(box(.011, .011, depth + .004), V(sx * (width - .006), sy * (height - .006), 0)), place, skin, fe, MAT.iron); }
  // Vent door on the back: a plate with three slots glowing from the fire behind, hinges on one side.
  const dw = width * .55, dh = height * .58;
  c.bag.solid(moved(roundBox(dw, dh, .008, .004), V(0, -height * .08, depth + .006)), place, skin, fe, MAT.iron);
  c.bag.solid(moved(box(dw * .7, dh * .62, .002), V(0, -height * .08, depth + .0146)), place, skin, c.pal(ember), MAT.ember);
  for (let i = 0; i < 4; i++) c.bag.solid(moved(roundBox(dw * .11, dh * .7, .006, .003), V(lerp(-dw * .7, dw * .7, i / 3), -height * .08, depth + .018)), place, skin, fe, MAT.iron);
  for (const sy of [-1, 1]) c.bag.solid(moved(box(dw * .86, dh * .07, .006), V(0, -height * .08 + sy * dh * .66, depth + .018)), place, skin, fe, MAT.iron);
  for (const sy of [-.5, .5]) c.bag.solid(moved(box(.014, .02, .008), V(-dw - .012, -height * .08 + sy * dh, depth + .008)), place, skin, fe, MAT.iron);
  c.bag.solid(moved(box(.01, .014, .01), V(dw + .008, -height * .08, depth + .01)), place, skin, fe, MAT.iron);
  // Stepped collar and chimney.
  c.bag.solid(moved(roundBox(flue * 1.5, .03, flue * 1.35, .006), V(0, height + .026, -.004)), place, skin, col, MAT.ceramic);
  c.bag.solid(moved(roundBox(flue, chimney / 2, flue, .006), V(0, height + .05 + chimney / 2, -.004)), place, skin, col, MAT.ceramic);
  for (const f of [.12, .82]) c.bag.solid(moved(roundBox(flue + .005, .012, flue + .005, .003), V(0, height + .05 + chimney * f, -.004)), place, skin, fe, MAT.iron);
  c.bag.solid(moved(roundBox(flue * 1.22, .022, flue * 1.22, .006), V(0, height + .05 + chimney, -.004)), place, skin, col, MAT.ceramic);
  c.bag.solid(moved(box(flue * .82, .002, flue * .82), V(0, height + .0735 + chimney, -.004)), place, skin, c.pal('hollow'), MAT.hollow);
}

// ---------------------------------------------------------------------------------------------------------
// Arms

/** Leather vambrace on the forearm with buckled straps. */
export function bracer(c, { side = 'both', from = 1.12, to = 1.9, color = 'leather', off = .006, straps = [1.24, 1.52, 1.8], strapColor = 'leatherDark', buckle = 'iron', seam = true }) {
  const { arm } = c.form;
  c.bag.part = 'bracer';
  sides(c, side, () => {
    const radius = (t) => arm.radius(t) + off + .003 * smooth(to, from, t);
    tube(c, arm, { t0: from, t1: to, nv: 8, radius, color: c.pal(color), mat: MAT.leather });
    for (const t of [from, to]) limbBand(c, arm, { t, width: .012, off: off + .003 * (t === from ? 1 : 0), thick: .0035, color: c.pal(color).clone().multiplyScalar(.72), mat: MAT.leather });
    for (const t of straps) {
      limbBand(c, arm, { t, width: .017, off: off + .0035, thick: .004, color: c.pal(strapColor), mat: MAT.leather });
      if (buckle) c.bag.solid(buckleShape(.0085, .0095, .0024), limbFrame(arm, t, 70 * DEG, off + .008), arm.skin(t), c.pal(buckle), MAT.iron);
    }
    if (seam) c.bag.solid(slabY(.004, (arm.metres(to) - arm.metres(from)) / 2 - .012, .002, .001, 4), arm.wrap((from + to) / 2, -100 * DEG, off + .004), (p) => arm.skin(1.5), c.pal(strapColor), MAT.leather);
  });
}

/**
 * A block strapped to the forearm: a body with `slots` vents cut through its face, held by hinge bands.
 * The vents are real depth: a recessed floor behind rails and crossbars.
 */
export function blockBracer(c, { side = 'L', at = 1.5, phi = 90, length = .172, width = .084, depth = .05, slots = 3, color = 'ceramic', floor = 'hollow', iron = 'iron', off = .011, bands = true, slotWidth = .6 }) {
  const { arm } = c.form;
  c.bag.part = 'block';
  sides(c, side, () => {
    const skin = [['forearm.L', 1]], hx = width / 2, hy = length / 2, wall = .012, lip = depth * .34, body = depth - lip;
    const place = limbFrame(arm, at, phi * DEG, off), col = c.pal(color);
    c.bag.solid(moved(roundBox(hx, hy, body / 2, .006), V(0, 0, body / 2)), place, skin, col, MAT.ceramic);
    c.bag.solid(moved(roundBox(hx - .006, hy - .006, .002, .001), V(0, 0, body + .0006)), place, skin, c.pal(floor), MAT.hollow);
    const open = hx * slotWidth, rail = (hx - open) / 2, bars = slots + 1, barH = (length - wall * 2 * 0 - slots * ((length - (bars) * wall) / slots)) / bars;
    for (const sx of [-1, 1]) c.bag.solid(moved(roundBox(rail, hy, lip / 2, .004), V(sx * (hx - rail), 0, body + lip / 2 - .001)), place, skin, col, MAT.ceramic);
    const slotH = (length - bars * barH) / slots;
    for (let i = 0; i < bars; i++) c.bag.solid(moved(roundBox(hx - .001, barH / 2, lip / 2, .004), V(0, -hy + barH / 2 + i * (barH + slotH), body + lip / 2 - .0012)), place, skin, col, MAT.ceramic);
    // Hinge straps run under the block and close over its edge with a latch plate.
    if (bands) for (const dy of [-.36, .36]) {
      const t = arm.step(at, -dy * length);
      limbBand(c, arm, { t, width: .02, off: off - .004, thick: .005, color: c.pal(iron), mat: MAT.iron });
      c.bag.solid(moved(box(.005, .013, body / 2 + .003), V(-hx - .003, dy * length, body / 2)), place, skin, c.pal(iron), MAT.iron);
      c.bag.solid(moved(box(.005, .013, body / 2 + .003), V(hx + .003, dy * length, body / 2)), place, skin, c.pal(iron), MAT.iron);
      for (const sx of [-1, 1]) c.bag.solid(moved(dome(.0042, .003, 6), V(sx * (hx + .008), dy * length, body * .55), new Quaternion().setFromAxisAngle(V(0, 1, 0), sx * PI / 2)), place, skin, c.pal(iron), MAT.iron);
    }
  });
}

/** Wrist cuff of a glove, with an optional strap; the hand itself is the body's own. */
export function gloveCuff(c, { side = 'both', color = 'glove', from = 1.9, to = 2.05, off = .006, strap = null }) {
  const { arm } = c.form;
  c.bag.part = 'glove';
  sides(c, side, () => {
    const hand = (t) => [['forearm.L', 1 - smooth(1.94, 2.02, t)], ['hand.L', smooth(1.94, 2.02, t)]];
    tube(c, arm, { t0: from, t1: to, nv: 4, radius: (t, phi) => arm.radius(t) + off + .006 * smooth(1.9, 2.05, t) * (1 + .35 * Math.abs(Math.cos(phi))), color: c.pal(color), mat: MAT.leather, skin: hand });
    limbBand(c, arm, { t: from, width: .012, off: off + .001, thick: .004, color: c.pal(color).clone().multiplyScalar(1.5), mat: MAT.leather });
    if (strap) limbBand(c, arm, { t: (from + to) / 2, width: .014, off: off + .005, thick: .004, color: c.pal(strap), mat: MAT.leather });
  });
}

// ---------------------------------------------------------------------------------------------------------
// Feet

/**
 * Boots: welted sole, a lofted foot, a shaft up the shin to `top` (1 = knee, 2 = ankle), and optional plates:
 * `toeCap`, `shinPlate`, `heelPlate` (colours), plus `straps` across instep and shaft.
 */
export function boots(c, { color = 'boot', sole = 'sole', top = 1.56, toeCap = null, shinPlate = null, heelPlate = null, straps = 2, strapColor = 'leather', buckle = 'iron', cuff = null, plateMat = 'ceramic', soleHeight = .028, bulk = 1 }) {
  const { leg, foot, k } = c.form;
  c.bag.part = 'boots';
  sides(c, 'both', () => {
    const z0 = foot.heel - .004, z1 = foot.tip - .004, zm = (z0 + z1) / 2, L = (z1 - z0) / 2;
    // Plan outline: narrow heel, broad ball, blunt toe.
    const halfWidth = (z) => { const f = (z - z0) / (z1 - z0); return k * bulk * (.033 + .016 * smooth(0, .62, f)) * Math.min(1, (Math.max(0, 1 - Math.abs(2 * f - 1) ** 3.4)) ** .42 * 1.02); };
    const centreX = (z) => .006 * smooth(z0, z1, z);
    const skin = (p) => foot.skin(p);
    // Sole and welt.
    const soleRows = [[0, -.006], [.005, 0], [soleHeight - .004, 0], [soleHeight, -.004], [soleHeight, -.02]];
    c.bag.grid(32 * c.q, soleRows.length - 1, (u, v) => {
      const a = u * TAU, z = zm - Math.cos(a) * L * .999, [y, inset] = soleRows[Math.round(v * (soleRows.length - 1))], w = halfWidth(z) + .005 + inset;
      // Tread blocks are cut into the sole's edge.
      const tread = y < soleHeight - .006 && y > .003 ? -.0055 * (Math.sin(z * 150) > .1 ? 1 : 0) : 0;
      const p = foot.at(centreX(z) + Math.sin(a) * (w + tread) * Math.sign(1), y, z + Math.cos(a) * -(inset) * .6); return { p, skin: skin(p) };
    }, { closeU: true, color: c.pal(sole), mat: MAT.leather, inside: foot.at(0, .015, zm) });
    // Upper: arches over the foot from heel to toe.
    const height = curve([[z0, .0], [z0 + .012, .066], [z0 + .04, .098], [0, .108], [.045, .09], [.1, .064], [z1 - .06, .05], [z1 - .02, .04], [z1 - .004, .0]].map(([z, h]) => [z, h * k]));
    const upper = (z, a, lift = 0) => { const w = halfWidth(z) - .001 + lift, h = height(z) + lift; return foot.at(centreX(z) + Math.cos(a) * -w, soleHeight - .003 + Math.sin(a) ** .8 * h, z); };
    const zs = (v) => lerp(z0 + .003, z1 - .003, v);
    c.bag.grid(10 * c.q, 16 * c.q, (u, v) => { const p = upper(zs(v), u * PI); return { p, skin: skin(p) }; }, { color: c.pal(color), mat: MAT.leather, inside: foot.at(0, .04, zm) });
    // Shaft.
    const shaft = (t, phi) => leg.radius(t) + (.009 + .011 * smooth(1.8, 2.1, t)) * bulk + .004 * smooth(top + .06, top, t) + .0025 * Math.sin(chainFold(leg, t) * 60) * smooth(1.7, 1.95, t);
    tube(c, leg, { t0: top, t1: 2.1, nv: 12, radius: shaft, color: c.pal(color), mat: MAT.leather, skin: (t, p) => foot.skin(p) });
    limbBand(c, leg, { t: top, width: .016, off: .004, thick: .006, color: c.pal(cuff ?? color), mat: cuff ? MAT[plateMat] : MAT.leather, radius: shaft });
    // Plates.
    if (toeCap) {
      const from = z1 - .07 * k;
      c.bag.grid(12 * c.q, 8, (u, v) => { const z = lerp(from, z1 - .0035, v), p = upper(z, u * PI, .0055 * Math.min(1, v * 6 + .25)); return { p, skin: skin(p) }; }, { color: c.pal(toeCap), mat: MAT[plateMat], inside: foot.at(0, .04, zm) });
      c.bag.grid(12 * c.q, 1, (u, v) => { const p = upper(from, u * PI, v ? .0055 * .25 : -.002); return { p, skin: skin(p) }; }, { color: c.pal(toeCap).clone().multiplyScalar(.6), mat: MAT[plateMat], inside: foot.at(0, .04, z1) });
    }
    if (heelPlate) c.bag.grid(10 * c.q, 5, (u, v) => { const a = lerp(-.62, .62, u) * PI, rr = .0, t = lerp(2.02, 2.3, v); void rr; void t; const z = z0 + .004 + (1 - Math.cos(a)) * .03, w = Math.sin(a) * (halfWidth(z0 + .04) + .006); const p = foot.at(centreX(z) + w, soleHeight + lerp(.004, .07 * k, v), z - .004 * (1 - v)); return { p, skin: skin(p) }; },
      { color: c.pal(heelPlate), mat: MAT[plateMat], inside: foot.at(0, .05, 0) });
    if (shinPlate) {
      const t = lerp(top, 2, .56), place = leg.wrap(t, 0, .011, shaft);
      c.bag.solid(slab(.03 * k, .042 * k, .005, .003, 5), place, (p) => foot.skin(p), c.pal(shinPlate), MAT[plateMat]);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) c.bag.solid(dome(.0038, .003, 6), leg.wrap(leg.step(t, -sy * .03 * k), sx * .02 / .07, .0165, shaft), (p) => foot.skin(p), c.pal(buckle), MAT.iron);
    }
    // Straps: one over the instep, the rest around the shaft.
    for (let i = 0; i < straps; i++) {
      if (i === 0) {
        const z = .052 * k;
        c.bag.grid(12 * c.q, 3, (u, v) => { const zz = z + [-.012, -.012, .012, .012][Math.round(v * 3)] * 1, lift = [0, .005, .005, 0][Math.round(v * 3)] + .001; const p = upper(zz + (u - .5) * .02, u * PI, lift); return { p, skin: skin(p) }; }, { color: c.pal(strapColor), mat: MAT.leather, inside: foot.at(0, .04, z) });
        c.bag.solid(buckleShape(.009, .011, .0026), frame(upper(z - .005, PI * .22, .006), foot.forward, V(0, 1, 0).applyAxisAngle(foot.forward, -.9)), skin(foot.at(0, .08, z)), c.pal(buckle), MAT.iron);
      } else {
        const t = lerp(top, 2, .22 + (i - 1) * .5);
        limbBand(c, leg, { t, width: .02, off: .004, thick: .005, color: c.pal(strapColor), mat: MAT.leather, radius: shaft });
        c.bag.solid(buckleShape(.0095, .011, .0026), limbFrame(leg, t, 62 * DEG, .0095, shaft), foot.skin(leg.centre(t)), c.pal(buckle), MAT.iron);
      }
    }
  });
}
const chainFold = (chain, t) => chain.metres(t);

// ---------------------------------------------------------------------------------------------------------
// Head

const dirOf = (phi, y) => { const cy = clamp(2 * y, -1, 1), st = Math.sqrt(1 - cy * cy); return V(st * Math.sin(phi), cy, st * Math.cos(phi)); };
/** Map head-space (chin to crown = 1, origin at the head's centre) into bind space. */
const headPlace = (c) => (p) => V(c.head.C.x + p.x * c.head.H, c.head.C.y + p.y * c.head.H, c.head.C.z + p.z * c.head.H);
const HEAD = [['head', 1]];
const face = (c, phi, y, off) => { const d = dirOf(phi, y), p = sculpt(d, c.head.P, { cloth: true }), f = sculpt(d, c.head.P); if (f.z > p.z) p.copy(f); return p.addScaledVector(V(Math.sin(phi), 0, Math.cos(phi)), off); };
const scalp = (c, phi, y, off) => { const p = cranium(dirOf(phi, y), c.head.P); return p.addScaledVector(p.clone().normalize(), off); };

/**
 * Half mask over nose, mouth and jaw: a fitted shell, a vented grille with `vents` slats set between bars,
 * rivets at the cheeks and a strap around the head.
 */
export function halfMask(c, { color = 'iron', slat = 'ceramic', vents = 5, top = -.045, wrapAngle = 68, strap = 'leatherDark', off = .03, grille = { width: .2, height: .2, y: -.285, depth: .06 } }) {
  const place = headPlace(c), col = c.pal(color), span = wrapAngle * DEG;
  c.bag.part = 'mask';
  const edge = (phi) => top - .1 * smooth(.25, 1, Math.abs(phi) / span) ;
  c.bag.grid(22 * c.q, 12 * c.q, (u, v) => {
    const phi = lerp(-span, span, u), y = lerp(edge(phi), -.492, v);
    return { p: place(face(c, phi, y, off * (1 - .25 * smooth(.6, 1, Math.abs(phi) / span)))), skin: HEAD };
  }, { color: col, mat: MAT.iron, inside: c.head.C });
  // Grille: bent around the face so the slats follow the jaw.
  const R = .36, zFront = face(c, 0, grille.y, 0).z, g = grille;
  const bend = (p) => place(V(Math.sin(p.x / R) * (R + p.z), g.y + p.y - .02 * (p.x / g.width) ** 2, zFront + off + g.depth * .35 - R + Math.cos(p.x / R) * (R + p.z)));
  const hw = g.width, hh = g.height / 2, bars = vents + 1, barW = .011, pitch = (hw * 2 - barW) / vents;
  c.bag.solid(slab(hw, hh, .012, .006, 8), bend, HEAD, c.pal(slat), MAT.ceramic);
  for (let i = 0; i < bars; i++) c.bag.solid(moved(roundBox(barW / 2 + (i === 0 || i === vents ? .008 : 0), hh + .006, .012, .005), V(-hw + barW / 2 + i * pitch, 0, .017)), bend, HEAD, col, MAT.iron);
  for (const sy of [-1, 1]) c.bag.solid(moved(slab(hw + .012, .013, .012, .005, 8), V(0, sy * (hh + .004), .018)), bend, HEAD, col, MAT.iron);
  // Vent slots are shadowed: a dark inset between each pair of bars.
  for (let i = 0; i < vents; i++) c.bag.solid(moved(roundBox(pitch / 2 - barW * .9, hh - .02, .003, .002), V(-hw + barW / 2 + (i + .5) * pitch, 0, .0125)), bend, HEAD, c.pal(slat).clone().multiplyScalar(.5), MAT.ceramic);
  // Cheek rivets.
  for (const s of [-1, 1]) for (const [phi, y] of [[.86, -.16], [.98, -.33]]) {
    const o = face(c, s * phi, y, off * .86), n = V(Math.sin(s * phi), 0, Math.cos(s * phi));
    c.bag.solid(dome(.016, .012, 7), (p) => place(o.clone().addScaledVector(V(n.z, 0, -n.x), p.x).addScaledVector(UP, p.y).addScaledVector(n, p.z)), HEAD, col.clone().multiplyScalar(1.5), MAT.iron);
  }
  if (strap) c.bag.grid(30 * c.q, 3, (u, v) => {
    const phi = lerp(span - .08, TAU - span + .08, u), [dy, h] = [[-.5, 0], [-.5, 1], [.5, 1], [.5, 0]][Math.round(v * 3)];
    const y = -.2 + .09 * Math.sin((u) * PI) ** .7 + dy * .07;
    return { p: place(scalp(c, phi, y, .012 + h * .016)), skin: HEAD };
  }, { color: c.pal(strap), mat: MAT.leather, inside: c.head.C });
}

export const BUILDERS = { skinLimb, neck, shirt, trousers, wrap, band, capelet, cowl, chestPlates, belt, strap, bracer, blockBracer, gloveCuff, boots, halfMask, hair, hands, skirt, panel, limbPlate, kilnPack };
export { slab, slabY, trunkBand, trunkBandPatch, limbBand, limbFrame, tube, sides, merge, buckleShape, headPlace, face, scalp, HEAD };
