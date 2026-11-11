// Builders for the Rime Archive, Storm Relay, Tidal Covenant and Fault Choir heroes (Oaths 02 to 05).
//
// Same contract as builders.js: (context, plain-data params) -> skinned geometry in the context's Bag. They are
// named with an `a/` prefix so they cannot collide with another group's builders; a recipe gets them with
// `import { A } from '../builders-a.js'` and `builders: A`.
import { Euler, Quaternion, Vector3 } from 'three';
import { cranium } from '../head.js';
import { MAT, TAU, V, bar, clamp, dome, frame, lerp, moved, ring, roundBox, smooth } from './kernel.js';
import { slab, limbFrame, tube, sides, headPlace, face, scalp, HEAD } from './builders.js';

const PI = Math.PI, DEG = PI / 180, UP = V(0, 1, 0);

/** Surface classes beyond the kernel's: the same shader kinds with other roughness and metalness. */
const SURFACE = {
  ...MAT, felt: [.97, 0, 0], webbing: [.86, 0, 0], stone: [.93, 0, 1], glazed: [.56, 0, 1], copper: [.46, .86, 3], brass: [.4, .9, 3], steel: [.38, .9, 3],
  glass: [.07, .15, 4], ice: [.2, .05, 4], nacre: [.24, .4, 4], linen: [.9, 0, 4], water: [.1, 0, 7], crystal: [.16, 0, 7],
};
const surface = (name) => { const m = SURFACE[name]; if (!m) throw new Error(`unknown surface "${name}"`); return m; };

/** A height on the trunk: a landmark ('chest'), a landmark with an offset in metres ('chest+.03'), a fraction
 *  of the way from the ground to the hip line (a number), or a blend [from, to, f]. */
function Yof(c, spec) {
  const { trunk, k } = c.form;
  if (Array.isArray(spec)) return lerp(Yof(c, spec[0]), Yof(c, spec[1]), spec[2]);
  if (typeof spec === 'number') return lerp(0, trunk.Y.hip, spec);
  const m = /^([a-z]+)([+-][\d.]+)?$/.exec(spec);
  if (!m || trunk.Y[m[1]] === undefined) throw new Error(`unknown height "${spec}"`);
  return trunk.Y[m[1]] + (m[2] ? +m[2] * k : 0);
}
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------------------------------------------------
// Shapes (own frame, analytic or finite-difference normals)

function sheet(nu, nv, fn, closeU = false) {
  const verts = [], quads = [], e = 1e-3, cols = closeU ? nu : nu + 1;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) {
    const u = i / nu, v = j / nv, p = fn(u, v), n = fn(u + e, v).sub(fn(u - e, v)).cross(fn(u, Math.min(1, v + e)).sub(fn(u, Math.max(0, v - e))));
    if (n.lengthSq() < 1e-18) n.set(0, 0, 1);
    verts.push({ p, n: n.normalize() });
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) quads.push([j * cols + i, j * cols + (i + 1) % cols, (j + 1) * cols + (i + 1) % cols, (j + 1) * cols + i]);
  return { verts, quads };
}
function ball(rx, ry = rx, rz = rx, nu = 12, nv = 7) {
  const verts = [], quads = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) { const a = i / nu * TAU, b = (j / nv - .5) * PI, d = V(Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a)); verts.push({ p: V(d.x * rx, d.y * ry, d.z * rz), n: V(d.x / rx, d.y / ry, d.z / rz).normalize() }); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) quads.push([j * nu + i, j * nu + (i + 1) % nu, (j + 1) * nu + (i + 1) % nu, (j + 1) * nu + i]);
  return { verts, quads };
}
/** Flat-faced solid from points and faces (3 or 4 indices each). */
function faceted(points, faces) {
  const verts = [], quads = [];
  for (const f of faces) {
    const n = points[f[1]].clone().sub(points[f[0]]).cross(points[f[2]].clone().sub(points[f[0]])); if (n.lengthSq() < 1e-18) continue; n.normalize();
    const base = verts.length; for (const i of f) verts.push({ p: points[i].clone(), n });
    quads.push(f.length === 4 ? [base, base + 1, base + 2, base + 3] : [base, base + 1, base + 2, base + 2]);
  }
  return { verts, quads };
}
/** Crystal: a prism of `sides` faces along Y that narrows to a point. */
function gem(r, h, n = 6, tip = .45) {
  const pts = [], faces = [];
  for (const [y, k] of [[-h / 2, .72], [h * (.5 - tip), 1]]) for (let i = 0; i < n; i++) { const a = i / n * TAU; pts.push(V(Math.cos(a) * r * k, y, Math.sin(a) * r * k)); }
  pts.push(V(0, h / 2, 0), V(0, -h / 2, 0));
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push([i, j, n + j, n + i], [n + i, n + j, 2 * n], [j, i, 2 * n + 1]); }
  return faceted(pts, faces);
}
/** Boulder: a coarse ball knocked out of round, flat faces. */
function rock(rx, ry, rz, seed = 1, nu = 8, nv = 5, rough = .22) {
  let s = seed * 9301 + 49297; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const pts = [], faces = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) { const a = (i + (j % 2) * .5) / nu * TAU, b = (j / nv - .5) * PI, k = 1 + (rnd() - .5) * 2 * rough; pts.push(V(Math.cos(b) * Math.cos(a) * rx * k, Math.sin(b) * ry * (j === 0 || j === nv ? 1 : k), Math.cos(b) * Math.sin(a) * rz * k)); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * nu + i, b = j * nu + (i + 1) % nu, d = (j + 1) * nu + i, e = (j + 1) * nu + (i + 1) % nu; faces.push([a, b, e], [a, e, d]); }
  return faceted(pts, faces);
}
/** Capped cylinder standing on the XY plane, rising along +Z (a disc, a boss, a drum). */
function cyl(r, h, n = 14, r2 = r) {
  const verts = [], quads = [];
  for (const [z, rr] of [[0, r], [h, r2]]) for (let i = 0; i < n; i++) { const a = i / n * TAU; verts.push({ p: V(Math.cos(a) * rr, Math.sin(a) * rr, z), n: V(Math.cos(a), Math.sin(a), (r - r2) / Math.max(1e-6, h)).normalize() }); }
  for (let i = 0; i < n; i++) quads.push([i, (i + 1) % n, n + (i + 1) % n, n + i]);
  const top = verts.length; for (let i = 0; i < n; i++) { const a = i / n * TAU; verts.push({ p: V(Math.cos(a) * r2, Math.sin(a) * r2, h), n: V(0, 0, 1), e: 1 }); }
  const centre = verts.length; verts.push({ p: V(0, 0, h + r2 * .04), n: V(0, 0, 1) });
  for (let i = 0; i < n; i++) quads.push([top + i, top + (i + 1) % n, centre, centre]);
  return { verts, quads };
}
/** Tube swept through points (Catmull-Rom), radius r0 -> r1. */
function tubePath(pts, r0, r1 = r0, n = 7, per = 5) {
  const P = pts.map((p) => V(...p)), count = (P.length - 1) * per, get = (i) => P[clamp(i, 0, P.length - 1)];
  const at = (s) => { const f = clamp(s, 0, 1) * (P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), t = f - i, [a, b, d, e] = [get(i - 1), get(i), get(i + 1), get(i + 2)];
    const cr = (k) => .5 * (2 * b[k] + (-a[k] + d[k]) * t + (2 * a[k] - 5 * b[k] + 4 * d[k] - e[k]) * t * t + (-a[k] + 3 * b[k] - 3 * d[k] + e[k]) * t * t * t); return V(cr('x'), cr('y'), cr('z')); };
  const verts = [], quads = []; let side = V(.31, .17, .93).normalize();
  for (let j = 0; j <= count; j++) {
    const s = j / count, p = at(s), along = at(s + .01).sub(at(s - .01)).normalize(); side = side.addScaledVector(along, -side.dot(along)).normalize(); const other = new Vector3().crossVectors(along, side), r = lerp(r0, r1, s);
    for (let i = 0; i < n; i++) { const a = i / n * TAU, d = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(other, Math.sin(a)); verts.push({ p: p.clone().addScaledVector(d, r), n: d }); }
  }
  for (let j = 0; j < count; j++) for (let i = 0; i < n; i++) quads.push([j * n + i, j * n + (i + 1) % n, (j + 1) * n + (i + 1) % n, (j + 1) * n + i]);
  return { verts, quads };
}
/** Scallop shell: hinge at the origin, opening toward +Y in the XY plane, ribbed and domed toward +Z. */
function fan(r, spread = 100, ribs = 7, bulge = .25, curl = 0, nv = 5) {
  const half = spread * DEG / 2;
  return sheet(ribs * 4, nv, (u, v) => {
    const a = (u * 2 - 1) * half, rib = Math.abs(Math.cos(u * ribs * PI)), rr = r * (.12 + .88 * v) * (1 - .1 * (1 - rib) * v);
    return V(Math.sin(a) * rr, Math.cos(a) * rr, r * bulge * Math.sin(v * PI * .82) * (1 - (u * 2 - 1) ** 2 * .6) + r * .045 * rib * v - curl * (Math.sin(a) * rr) ** 2 / r);
  });
}
/** Tapered blade or fin from the origin toward +Y: `width` across X, ridged and bent toward +Z. */
function leaf(len, width, thick = .008, bend = 0, base = .5, nv = 6) {
  return sheet(4, nv, (u, v) => {
    const x = u * 2 - 1, w = width / 2 * (base + (1 - base) * Math.sin(Math.min(1, v * 2.2) * PI / 2)) * (1 - v ** 2.2) + .0012;
    return V(x * w, v * len, bend * v * v + thick * (1 - Math.abs(x)) * (1 - v * .7));
  });
}

const SHAPES = {
  box: (i) => roundBox(i.size[0], i.size[1], i.size[2], i.r ?? .004), slab: (i) => slab(i.size[0], i.size[1], i.size[2], i.r ?? .004, i.cuts ?? 4),
  bar: (i) => bar(i.r, i.h, i.sides ?? 8), ring: (i) => ring(i.rx ?? i.R, i.ry ?? i.R, i.r, i.seg ?? 18, 6), dome: (i) => dome(i.r, i.h ?? i.r * .6, 8),
  ball: (i) => ball(...(i.size ?? [i.r, i.r, i.r]), i.seg ?? 12, i.rows ?? 7), cyl: (i) => cyl(i.r, i.h, i.sides ?? 14, i.r2 ?? i.r), gem: (i) => gem(i.r, i.h, i.sides ?? 6, i.tip ?? .45),
  rock: (i) => rock(...i.size, i.seed ?? 1, i.seg ?? 8, i.rows ?? 5, i.rough ?? .22), tube: (i) => tubePath(i.pts, i.r, i.r1 ?? i.r, i.sides ?? 7, i.per ?? 5),
  fan: (i) => fan(i.r, i.spread ?? 100, i.ribs ?? 7, i.bulge ?? .25, i.curl ?? 0), leaf: (i) => leaf(i.len, i.width, i.thick ?? .008, i.bend ?? 0, i.base ?? .5),
};
const turnOf = (rot) => (rot ? new Quaternion().setFromEuler(new Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG)) : null);

/** Where a kit hangs: a rigid frame on the trunk, the coat, a limb, the head or a foot, and the bones that carry it. */
function anchor(c, a) {
  const { trunk, foot } = c.form, on = a.on ?? 'trunk';
  if (on === 'trunk' || on === 'coat') {
    const y = Yof(c, a.y ?? 'chest'), th = (a.th ?? 0) * DEG, at = (off) => (on === 'coat' ? c.coat.at(y, th, off) : trunk.at(y, th, off));
    const o = at(a.off ?? 0), z = at((a.off ?? 0) + .02).sub(o); z.y = a.lean ? z.y : 0; z.normalize(); const x = new Vector3().crossVectors(UP, z).normalize(), up = new Vector3().crossVectors(z, x);
    return { place: frame(o, x, up, z), skin: a.bone ? [[a.bone, 1]] : on === 'coat' ? c.coat.skin(o) : trunk.skin(o) };
  }
  if (on === 'arm' || on === 'leg') { const chain = c.form[on]; return { place: limbFrame(chain, a.t, (a.phi ?? 90) * DEG, a.off ?? 0), skin: a.bone ? [[a.bone, 1]] : chain.skin(a.t) }; }
  if (on === 'head') { const o = headPlace(c)(V(...(a.at ?? [0, 0, 0]))); return { place: frame(o, V(1, 0, 0), UP, V(0, 0, 1)), skin: HEAD }; }
  if (on === 'foot') { const o = foot.at(...(a.at ?? [0, .05, 0])); return { place: frame(o, foot.sideways, UP, foot.forward), skin: a.bone ? [[a.bone, 1]] : foot.skin(o) }; }
  throw new Error(`unknown anchor "${on}"`);
}

/**
 * A rigid piece of gear assembled from primitive shapes in one frame: packs, racks, tanks, pouches, antennae.
 * Anchor: { on: 'trunk' | 'coat' (y, th in degrees, off), 'arm' | 'leg' (t, phi, off), 'head' (at), 'foot' (at) },
 * `side` 'L' | 'R' | 'both' (the anchor is written for the wearer's left and mirrored), `bone` to override the
 * carrier. Items: { s: shape, at, rot (degrees), color, mat, ...shape parameters, n + step to repeat }.
 */
export function kit(c, { name = 'kit', items, ...a }) {
  c.bag.part = name;
  sides(c, a.side ?? 'L', () => {
    const { place, skin } = anchor(c, a);
    for (const it of items) for (let k = 0; k < (it.n ?? 1); k++) {
      const make = SHAPES[it.s]; if (!make) throw new Error(`kit ${name}: unknown shape "${it.s}"`);
      const at = V(...(it.at ?? [0, 0, 0])); if (it.step) at.addScaledVector(V(...it.step), k);
      c.bag.solid(moved(make(it), at, turnOf(it.rot)), place, skin, c.pal(it.color ?? 'iron'), surface(it.mat ?? 'iron'), it.edge);
    }
  });
}

// ---------------------------------------------------------------------------------------------------------
// Fitted cloth

/**
 * Close-fitting suit: any of a trunk section, sleeves and legs in one cloth, with colour zones sewn in.
 * `trunk`: [from, to] heights; `arms` / `legs`: [from, to] along the limb (0..2), or null. With legs the trunk
 * section closes into a seat. Zones: { on: 'trunk' | 'arm' | 'leg', a: [from, to] degrees around, b: [from, to]
 * along (heights on the trunk, t on a limb), color, both (mirror a trunk zone) }.
 */
export function bodysuit(c, { color = 'cloth', mat = 'cloth', off = .006, trunk: span = ['crotch', 'base'], arms = null, legs = null, zones = [], crease = .002, ease = 0 }) {
  const { trunk, arm, leg } = c.form, col = c.pal(color), m = surface(mat);
  c.bag.part = 'suit';
  const tint = (on) => {
    const mine = zones.filter((z) => z.on === on).map((z) => ({ ...z, tone: c.pal(z.color), b: on === 'trunk' ? [Yof(c, z.b[0]), Yof(c, z.b[1])] : z.b }));
    return (a, b) => { const deg = wrapAngle(a) / DEG; for (const z of mine) { const d = z.both ? Math.abs(deg) : deg; if (d >= z.a[0] && d <= z.a[1] && b >= Math.min(...z.b) && b <= Math.max(...z.b)) return z.tone; } return col; };
  };
  if (span) {
    const seat = !!legs, y0 = seat ? trunk.Y.crotch - .03 : Yof(c, span[0]), y1 = Yof(c, span[1]), tone = tint('trunk');
    c.bag.grid(56 * c.q, (seat ? 34 : 26) * c.q, (u, v) => {
      const y = lerp(y0, y1, v), th = u * TAU, shut = seat ? smooth(trunk.Y.crotch + .03, trunk.Y.crotch - .03, y) : 0;
      const p = trunk.at(Math.max(y, trunk.Y.crotch), th, off + ease * smooth(trunk.Y.chest, trunk.Y.waist, y)); p.y = y; p.x *= 1 - shut * .75; p.z = lerp(p.z, c.form.spineZ(y), shut * .6);
      return { p, skin: trunk.skin(p), c: tone(th, y) };
    }, { closeU: true, color: col, mat: m, inside: V(0, (y0 + y1) / 2, c.form.spineZ(y1)) });
  }
  if (arms) sides(c, 'both', () => {
    const cap = -.14, wide = (t) => arm.radius(t) + off, fold = (t, phi) => crease * Math.sin(phi * 3 + t * 40) * Math.exp(-(((t - 1) / .12) ** 2));
    tube(c, arm, { t0: Math.max(arms[0], cap), t1: arms[1], nu: 16, nv: 16 * (arms[1] - arms[0]) / 2 + 4, color: col, mat: m, tint: (t, phi) => tint('arm')(phi, t),
      radius: (t, phi) => (t < 0 ? wide(0) * Math.sqrt(Math.max(0, 1 - (t / cap) ** 2)) * .98 + .001 : wide(t) + fold(t, phi)) });
  });
  if (legs) sides(c, 'both', () => {
    const fold = (t, phi) => crease * (Math.sin(phi * 2 + t * 46) * Math.exp(-(((t - 1) / .1) ** 2)) + .6 * Math.sin(phi * 3 + t * 60) * smooth(1.75, 1.95, t));
    tube(c, leg, { t0: Math.max(legs[0], -.155), t1: legs[1], nu: 22, nv: 30 * (legs[1] - legs[0]) / 2 + 4, color: col, mat: m, tint: (t, phi) => tint('leg')(phi, t),
      radius: (t, phi) => { const base = leg.radius(t) + off + .004 * smooth(.5, -.1, t) + fold(t, phi); return t < 0 ? base * Math.sqrt(Math.max(.02, 1 - (t / -.16) ** 2)) : base; } });
  });
}

/** Surface a line or plate lies on: at(a degrees, b, off) and the weights of a point there. */
function ground(c, on) {
  const { trunk } = c.form;
  if (on === 'trunk') return { at: (a, b, off) => trunk.at(b, a * DEG, off), skin: (p) => trunk.skin(p), b: (s) => Yof(c, s), rho: (a, b) => trunk.rho(b, a * DEG) };
  if (on === 'coat') return { at: (a, b, off) => c.coat.at(b, a * DEG, off), skin: (p) => c.coat.skin(p), b: (s) => Yof(c, s), rho: (a, b) => { const p = c.coat.at(b, a * DEG, 0); return Math.hypot(p.x, p.z - c.form.spineZ(trunk.Y.hip)); } };
  const chain = c.form[on];
  return { at: (a, b, off) => chain.point(b, a * DEG, chain.radius(b) + off), skin: (p, a, b) => chain.skin(b), b: (s) => s, rho: (a, b) => chain.radius(b), limb: true };
}

/**
 * Sewn lines and flat straps lying on a surface: piping, seams, quilting, webbing.
 * `paths`: each a list of [angle (degrees), along] waypoints on `on` ('trunk' | 'coat' | 'arm' | 'leg').
 * `quilt`: { a: [from, to], b: [from, to], pitch } fills that region with diamond stitching instead.
 * `both` mirrors trunk paths; limbs follow `side`. `thick` > 0 gives the line a raised, edged section.
 */
export function lines(c, { on = 'trunk', side = 'both', both = false, paths = [], quilt = null, color = 'piping', mat = 'cloth', width = .006, thick = 0, off = .009, n = 12, name = 'lines' }) {
  const g = ground(c, on), col = c.pal(color), m = surface(mat), dark = col.clone().multiplyScalar(.4);
  c.bag.part = name;
  const all = paths.map((path) => path.map(([a, b]) => [a, g.b(b)]));
  if (quilt) {
    // Diamonds are laid out in metres of arc, measured along the surface so they stay square on a flat chest.
    const [a0, a1] = quilt.a, b0 = g.b(quilt.b[0]), b1 = g.b(quilt.b[1]), lo = Math.min(b0, b1), hi = Math.max(b0, b1), mid = (lo + hi) / 2, pitch = quilt.pitch ?? .045, table = [[0, a0]];
    for (let i = 1; i <= 32; i++) { const a = lerp(a0, a1, i / 32); table.push([table[i - 1][0] + g.at(a, mid, off).distanceTo(g.at(lerp(a0, a1, (i - 1) / 32), mid, off)), a]); }
    const total = table[32][0], angleAt = (s) => { let i = 1; while (i < 32 && table[i][0] < s) i++; const [sa, aa] = table[i - 1], [sb, ab] = table[i]; return lerp(aa, ab, clamp((s - sa) / Math.max(1e-9, sb - sa), 0, 1)); };
    for (const dir of [1, -1]) for (let k = Math.ceil(-(hi - lo) / pitch); k * pitch < total + (hi - lo); k++) {
      // s = base + dir * y, clipped to the region
      const base = k * pitch + (dir < 0 ? hi - lo : 0) - (hi - lo) * (dir > 0 ? 0 : 0), ya = clamp(dir > 0 ? -base : base - total, 0, hi - lo), yb = clamp(dir > 0 ? total - base : base, 0, hi - lo); if (yb - ya < .012) continue;
      const sAt = (y) => (dir > 0 ? base + y : base - y); all.push([[angleAt(sAt(ya)), lo + ya], [angleAt(sAt(yb)), lo + yb]]);
    }
  }
  const emit = (flip) => { for (const path of all) {
    const count = path.length, sample = (s) => {
      const f = clamp(s, 0, 1) * (count - 1), i = Math.min(count - 2, Math.floor(f)), t = f - i, get = (k) => path[clamp(k, 0, count - 1)], [p0, p1, p2, p3] = [get(i - 1), get(i), get(i + 1), get(i + 2)];
      const cr = (k) => (count === 2 ? lerp(p1[k], p2[k], t) : .5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t));
      return [cr(0) * flip, cr(1)];
    };
    const framed = (s) => { const [a, b] = sample(s), [a2, b2] = sample(s + .004), p = g.at(a, b, off), up = g.at(a, b, off + .01).sub(p).normalize(), along = g.at(a2, b2, off).sub(p); if (along.lengthSq() < 1e-14) { const [a3, b3] = sample(s - .004); along.copy(p).sub(g.at(a3, b3, off)); } along.normalize(); return { p, up, across: new Vector3().crossVectors(up, along).normalize(), a, b }; };
    const profile = thick > 0 ? [[-.5, 0], [-.5, 1], [.5, 1], [.5, 0]] : [[-.5, 0], [.5, 0]];
    const span = count === 2 ? g.at(path[0][0] * flip, path[0][1], off).distanceTo(g.at(path[1][0] * flip, path[1][1], off)) : 0;
    c.bag.grid(Math.max(2, Math.round((count === 2 ? Math.max(n * .5, span / .016) : n * (count - 1) * .5) * c.q)), profile.length - 1, (u, v) => {
      const f = framed(u * .996), [x, h] = profile[Math.round(v * (profile.length - 1))], p = f.p.clone().addScaledVector(f.across, x * width).addScaledVector(f.up, h * thick + (thick > 0 ? 0 : .0012));
      return { p, skin: g.skin(p, f.a, f.b), c: thick > 0 && !h ? dark : col, n: thick > 0 ? undefined : f.up };
    }, { color: col, mat: m, inside: (p) => V(0, p.y, c.form.spineZ(p.y)) });
  } };
  if (g.limb) sides(c, side, () => emit(1)); else { emit(1); if (both) emit(-1); }
}

/**
 * Hard plates lying on the trunk, the coat or a limb: stone slabs, shell tassets, armour tiles.
 * `list`: [{ at: [angle degrees, along], size: [width, height] metres, color?, thick? }]. `border` frames each
 * plate in a second colour; `flat` keeps a limb plate rigid instead of wrapping it; `rivet` studs the corners.
 */
export function plates(c, { on = 'trunk', side = 'both', both = false, list, color = 'stone', mat = 'stone', border = null, borderMat = null, borderWidth = .012, thick = .014, off = .008, r = .004, rivet = null, flat = false, name = 'tiles' }) {
  const g = ground(c, on), { trunk } = c.form, m = surface(mat), bm = surface(borderMat ?? mat);
  c.bag.part = name;
  const emit = (flip) => { for (const item of list) {
    const a = item.at[0] * flip, b = g.b(item.at[1]), [w, h] = item.size, t = item.thick ?? thick, rho = Math.max(.03, g.rho(a, b)), cuts = Math.max(2, Math.round(w / .03 * c.q));
    let place, skin;
    if (g.limb) { const chain = c.form[on]; place = flat ? limbFrame(chain, b, a * DEG, off + t / 2) : chain.wrap(b, a * DEG, off + t / 2); skin = item.bone ? [[item.bone, 1]] : chain.skin(b); }
    else { place = (p) => g.at(a + p.x / rho / DEG, b + p.y, off + t / 2 + p.z); skin = item.bone ? [[item.bone, 1]] : on === 'coat' ? c.coat.skin(g.at(a, b, 0)) : trunk.skin(g.at(a, b, 0)); }
    const tone = c.pal(item.color ?? color);
    if (border) {
      c.bag.solid(slab(w / 2, h / 2, t * .36, r, cuts), place, skin, c.pal(border), bm);
      c.bag.solid(moved(slab(w / 2 - borderWidth, h / 2 - borderWidth, t / 2, r, cuts), V(0, 0, t * .12)), place, skin, tone, m);
    } else c.bag.solid(slab(w / 2, h / 2, t / 2, r, cuts), place, skin, tone, m);
    if (rivet) for (const sx of [-1, 1]) for (const sy of [-1, 1]) c.bag.solid(moved(dome(.005, .004, 6), V(sx * (w / 2 - borderWidth * .5), sy * (h / 2 - borderWidth * .5), t * .36)), place, skin, c.pal(rivet), SURFACE.iron);
  } };
  if (g.limb) sides(c, side, () => emit(1)); else { emit(1); if (both) emit(-1); }
}

/**
 * Standing collar around the neck. `height` metres, `flare` how far the top edge leans away from the neck,
 * `open` the gap at the throat in degrees, `tilt` extra height at the nape, `points` extra height at the front
 * corners (a winged collar). `lining` colours the inside.
 */
export function collar(c, { color = 'cloth', lining = null, mat = 'cloth', from = 'base-.012', height = .07, flare = .012, open = 0, tilt = 0, points = 0, off = .012, thick = .007, trim = null, sag = 0 }) {
  const { trunk, J } = c.form, y0 = Yof(c, from), col = c.pal(color), inner = c.pal(lining ?? color).clone().multiplyScalar(lining ? 1 : .55), m = surface(mat), gap = open * DEG / 2;
  c.bag.part = 'collar';
  const at = (u, v, extra) => {
    const th = lerp(gap, TAU - gap, u), front = Math.abs(wrapAngle(th)), h = height + tilt * (1 - Math.cos(th)) / 2 + points * Math.exp(-(((front - gap) / .45) ** 2)) - sag * Math.exp(-((front / .5) ** 2));
    const y = y0 + v * h, p = trunk.at(Math.min(y, trunk.Y.neck), th, off + extra + flare * v ** 1.4); p.y = y; if (y > trunk.Y.neck) p.z += (y - trunk.Y.neck) * .3;
    return p;
  };
  const skin = (v) => [['spine2', 1 - .55 * v], ['neck', .55 * v]], centre = V(0, y0 + height / 2, J.neck.z), nu = 30 * c.q, closed = open <= 0;
  c.bag.grid(nu, 5, (u, v) => ({ p: at(u, v, 0), skin: skin(v) }), { closeU: closed, color: col, mat: m, inside: centre });
  c.bag.grid(nu, 4, (u, v) => ({ p: at(u, v, -thick), skin: skin(v) }), { closeU: closed, color: inner, mat: m, inside: centre, flip: true });
  c.bag.grid(nu, 1, (u, v) => ({ p: at(u, 1, -thick * v).add(V(0, v ? 0 : .0015, 0)), skin: skin(1) }), { closeU: closed, color: trim ? c.pal(trim) : col.clone().multiplyScalar(.8), mat: m, inside: V(0, y0 - 1, J.neck.z) });
  if (!closed) for (const u of [0, 1]) c.bag.grid(1, 4, (s, v) => ({ p: at(u, v, -thick * s), skin: skin(v) }), { color: trim ? c.pal(trim) : col.clone().multiplyScalar(.8), mat: m });
}

// ---------------------------------------------------------------------------------------------------------
// Head

const dirOf = (phi, y) => { const cy = clamp(2 * y, -1, 1), st = Math.sqrt(1 - cy * cy); return V(st * Math.sin(phi), cy, st * Math.cos(phi)); };

/**
 * Hood worn up: a shell over the skull with an oval face opening, a peak, a lined rim and a skirt that falls to
 * the shoulders. `open`: [half-angle (radians), half-height, centre height] of the opening in head units.
 */
export function hood(c, { color = 'cloth', lining = 'lining', mat = 'cloth', off = .19, peak = .2, back = .2, open = [1.02, .44, -.08], drape = .9, flare = .4, brim = .12, rim = .042 }) {
  const place = headPlace(c), col = c.pal(color), lin = c.pal(lining), m = surface(mat), y1 = -.2;
  c.bag.part = 'hood';
  const gapAt = (y) => { const f = (y - open[2]) / open[1]; return Math.abs(f) < 1 ? open[0] * Math.sqrt(1 - f * f) ** .8 : 0; };
  const at = (a, v, inset = 0) => {
    const y = lerp(-drape, .5, v), phi = PI + a * (PI - gapAt(Math.max(y, y1 - .3))), rear = Math.max(0, -Math.cos(phi)), yy = Math.max(y, y1);
    const o = off - inset + peak * smooth(.1, .5, yy) * (.4 + .6 * rear) + back * rear * smooth(.45, -.2, yy) + brim * smooth(.55, 1, Math.abs(a)) * smooth(-.5, .1, yy);
    const p = scalp(c, phi, yy, o);
    if (y < y1) { const s = (y1 - y) / (y1 + drape), grow = 1 + flare * s ** 1.3 * (1 - .35 * Math.max(0, Math.cos(phi))); p.x *= grow; p.z = (p.z + .04) * grow - .04 - .12 * s; p.y = y; }
    return p;
  };
  const skin = (p) => { const s = smooth(-.3, -drape, p.y); return [['head', 1 - s], ['neck', s * .4], ['spine2', s * .6]]; };
  const nu = Math.round(40 * c.q), nv = Math.round(22 * c.q), centre = c.head.C;
  c.bag.grid(nu, nv, (u, v) => { const h = at(u * 2 - 1, v); return { p: place(h), skin: skin(h) }; }, { color: col, mat: m, inside: centre });
  c.bag.grid(nu, Math.round(nv * .7), (u, v) => { const h = at(u * 2 - 1, lerp(.25, 1, v), .035); return { p: place(h), skin: skin(h) }; }, { color: lin, mat: m, inside: centre, flip: true });
  // Rolled, lined rim around the opening.
  for (const a of [-1, 1]) c.bag.grid(6, Math.round(22 * c.q), (u, v) => {
    const vv = lerp(.16, .992, v), h = at(a, vv), across = h.clone().sub(at(a * .93, vv)).normalize(), out = h.clone().sub(V(0, h.y, 0)).normalize(), ang = u * TAU;
    const p = h.clone().addScaledVector(across, Math.cos(ang) * rim * .55 + rim * .2).addScaledVector(out, Math.sin(ang) * rim * .8);
    return { p: place(p), skin: skin(h), c: Math.sin(ang) > -.2 ? col : lin };
  }, { closeU: true, color: lin, mat: m, inside: centre });
}

/** Hood worn down: a gathered sack of cloth lying between the shoulder blades under a rolled neck. */
export function hoodDown(c, { color = 'cloth', lining = null, mat = 'cloth', width = .15, drop = .2, depth = .075, at = 'shoulder+.015' }) {
  const { trunk } = c.form, y = Yof(c, at), back = trunk.at(y, PI, .01), col = c.pal(color), m = surface(mat);
  c.bag.part = 'hood';
  c.bag.grid(22 * c.q, 12 * c.q, (u, v) => {
    const a = u * TAU, b = v * PI, fold = 1 + .07 * Math.sin(a * 7 + v * 5), w = width * Math.sin(b) ** .8 * (1 - .45 * v) * fold;
    const p = V(Math.cos(a) * w, y + .03 - v * drop, back.z - depth * (.35 + Math.sin(b) * (.65 + .35 * Math.sin(a))) * (1 - .4 * v));
    return { p, skin: [['spine2', 1]] };
  }, { closeU: true, color: col, mat: m, inside: V(0, y - drop / 2, back.z - depth * .4) });
  if (lining) c.bag.solid(moved(ball(width * .5, .012, depth * .5, 12, 4), V(0, y + .034, back.z - depth * .55)), (p) => p, [['spine2', 1]], c.pal(lining).clone().multiplyScalar(.5), m);
}

/** Locks of hair showing at the brow and cheeks, for a head whose crown is covered (hood, helmet, wrap). */
export function fringe(c, { color = 'hair', count = 13, span = 1.25, from = .37, to = .13, sideTo = -.2, width = .085, sweep = .22, lift = .034 }) {
  const place = headPlace(c), col = c.pal(color);
  c.bag.part = 'hair';
  for (let i = 0; i < count; i++) {
    const phi0 = lerp(-span, span, (i + c.rand() * .6) / count), edge = smooth(.55, 1.2, Math.abs(phi0)), end = lerp(to, sideTo, edge) + (c.rand() - .5) * .05, turn = (c.rand() - .3) * sweep * (phi0 < 0 ? 1 : -1.6);
    const tone = col.clone().multiplyScalar(.7 + c.rand() * .7);
    c.bag.grid(2, Math.max(3, Math.round(5 * c.q)), (u, s) => {
      const phi = phi0 + turn * s, y = lerp(from, end, s), centre = face(c, phi, y, lift * (1 - .45 * s) + .012), across = V(Math.cos(phi), 0, -Math.sin(phi)), x = u * 2 - 1, w = width * ((1 - s) ** .7 * .8 + .2);
      return { p: place(centre.addScaledVector(across, x * w).addScaledVector(V(Math.sin(phi), 0, Math.cos(phi)), (1 - Math.abs(x)) * .014)), skin: HEAD };
    }, { color: tone, mat: MAT.hair, inside: c.head.C });
  }
}

/** Long beard hanging from the chin, with a drooping moustache. Lengths in head units. */
export function beard(c, { color = 'hair', length = 1.25, width = .15, depth = .1, from = -.35, tip = .1, moustache = true, sway = .04 }) {
  const place = headPlace(c), col = c.pal(color), chin = face(c, 0, -.44, 0), seed = c.rand() * TAU;
  c.bag.part = 'beard';
  c.bag.grid(16 * c.q, 14 * c.q, (u, v) => {
    const a = u * TAU, k = lerp(1, tip, v ** .8), strand = 1 + .09 * Math.sin(a * 9 + seed + v * 3) + .05 * Math.sin(a * 17 + v * 11);
    const y = from - v * length, z = chin.z - depth * .45 - .1 * smooth(.0, .5, v) - .09 * v * length + sway * Math.sin(v * 5 + seed) * v;
    const top = 1 - .45 * smooth(.12, 0, v);   // tucks in under the lip
    return { p: place(V(Math.cos(a) * width * k * strand * top, y, z + Math.sin(a) * depth * k * strand * (Math.sin(a) > 0 ? 1 : .8))), skin: HEAD, c: col.clone().multiplyScalar(.78 + .3 * (.5 + .5 * Math.sin(a * 9 + seed + v * 3))) };
  }, { closeU: true, color: col, mat: MAT.hair, inside: place(V(0, from - length / 2, chin.z - depth * .5)) });
  if (moustache) for (const s of [-1, 1]) {
    const lip = face(c, 0, -.235, 0), shape = tubePath([[s * .02, -.228, lip.z + .012], [s * .08, -.255, lip.z + .002], [s * .118, -.35, lip.z - .05], [s * .112, -.52, lip.z - .085], [s * .09, -.7, lip.z - .11]], .03, .009, 6, 4);
    c.bag.solid(shape, place, HEAD, col.clone().multiplyScalar(.95), MAT.hair);
  }
}

/**
 * Sealed helmet: a shell over the whole head, a dark visor across the face, a brass visor frame, and a crest of
 * shell plates swept from a bill over the brow to a tail behind the crown.
 */
export function helm(c, { color = 'cloth', mat = 'cloth', visor = 'visor', trim = 'brass', crest = 'nacre', under = null, off = .1, band = null }) {
  const place = headPlace(c), col = c.pal(color), m = surface(mat), centre = c.head.C, VW = .98, VY = [-.3, .2];
  c.bag.part = 'helm';
  const env = (phi, y, o) => { const a = Math.abs(wrapAngle(phi)), s = scalp(c, phi, y, o); if (a > 2) return s; const f = face(c, phi, Math.max(y, -.492), o); return s.lerp(f, smooth(2, 1.35, a) * smooth(.4, .2, y)); };
  const patch = (p0, p1, ya, yb, nu, nv, tone, mm, o, inset = 0) => c.bag.grid(nu * c.q, nv * c.q, (u, v) => ({ p: place(env(lerp(p0, p1, u), lerp(ya, yb, v), o - inset * Math.sin(u * PI) ** .5 * Math.sin(v * PI) ** .5)), skin: HEAD }), { color: tone, mat: mm, inside: centre });
  patch(VW, TAU - VW, -.5, .5, 30, 18, col, m, off);
  patch(-VW, VW, VY[1], .5, 14, 7, col, m, off);
  patch(-VW, VW, -.5, VY[0], 14, 5, col, m, off);
  patch(-VW, VW, VY[0], VY[1], 14, 8, c.pal(visor), SURFACE.glass, off - .004, -.03);
  // Visor frame and brow band.
  const strip = (fn, n, w = .03, h = .016, tone = c.pal(trim)) => c.bag.grid(n * c.q, 3, (u, v) => { const [x, k] = [[-.5, 0], [-.5, 1], [.5, 1], [.5, 0]][Math.round(v * 3)], [phi, y, dphi, dy] = fn(u); return { p: place(env(phi + dphi * x * w, y + dy * x * w, off + h * k)), skin: HEAD }; }, { color: tone, mat: SURFACE.brass, inside: centre });
  strip((u) => [lerp(-VW, VW, u), VY[1], 0, 1], 12); strip((u) => [lerp(-VW, VW, u), VY[0], 0, 1], 12);
  for (const s of [-1, 1]) strip((u) => [s * VW, lerp(VY[0], VY[1], u), 2.4, 0], 6);
  if (band) strip((u) => [lerp(VW, TAU - VW, u), lerp(VY[1], .12, Math.sin(u * PI)), 0, 1], 20, .04, .014, c.pal(band));
  // Crest plates: beta sweeps from the brow over the crown to the back, gamma across.
  const plate = (tone, mm, b0, b1, G, lift, bill, tail, ridge) => c.bag.grid(10 * c.q, 16 * c.q, (u, w) => {
    const x = u * 2 - 1, beta = lerp(b0, b1, w) * DEG, gamma = x * G * Math.sin(PI * clamp(w, .02, .98)) ** .55 * (1 - .35 * w), d = V(Math.sin(gamma), Math.cos(gamma) * Math.sin(beta), Math.cos(gamma) * Math.cos(beta));
    const p = cranium(d, c.head.P); p.addScaledVector(p.clone().normalize(), off + lift + ridge * (1 - Math.abs(x)) ** 1.5);
    p.addScaledVector(V(0, -.28, 1), bill * smooth(.3, 0, w) ** 1.6).addScaledVector(V(0, .55, -1), tail * smooth(.62, 1, w) ** 1.5);
    return { p: place(p), skin: HEAD };
  }, { color: tone, mat: mm, inside: centre });
  if (under) plate(c.pal(under), m, 24, 158, 1.6, .016, .16, .2, .02);
  plate(c.pal(crest), SURFACE.nacre, 12, 146, 1.35, .045, .4, .42, .07);
}

// ---------------------------------------------------------------------------------------------------------
// Shoulders

/**
 * Collar plate resting on the shoulders around the neck: a ring `band` (gorget) with raised rims and rivets,
 * and/or `discs` linked around it. Radii in metres from the spine at the base of the neck; the ring is wider
 * over the shoulders than front to back, and rests on whatever the body presents under it.
 */
export function yoke(c, { color = 'copper', mat = 'copper', inner = .078, outer = .19, wide = .2, deep = .62, off = .02, thick = .01, band = true, rivets = 0, rivetColor = 'iron', discs = null, drop = 1 }) {
  const { trunk, S, J, k } = c.form, col = c.pal(color), m = surface(mat), zc = c.form.spineZ(trunk.Y.base);
  c.bag.part = 'yoke';
  const raw = (th, v, lift = 0) => {
    const sn = Math.sin(th), cs = Math.cos(th), reach = outer * k * (1 + wide * Math.abs(sn)) * (1 - (1 - deep) * Math.abs(cs) ** 1.5), steps = 10; let d = inner * k, y = -Infinity, last = null;
    for (let i = 0; i <= steps; i++) {
      const dd = lerp(inner * k, lerp(inner * k, reach, v), i / steps), rest = c.form.over(sn * dd, zc + cs * dd * .96, () => .02, .02) + off;
      y = last === null ? rest : Math.max(rest, y - (dd - d) * drop * 1.4); if (!Number.isFinite(y)) y = trunk.Y.base; d = dd; last = y;
    }
    return V(sn * d, Math.min(y, trunk.Y.neck + .03) + lift, zc + cs * d * .96);
  };
  // Heights are averaged with their neighbours so the plate is one smooth ring, not a cast of every fold under it.
  const at = (th, v, lift = 0) => { const p = raw(th, v, lift); p.y = (raw(th - .22, v, lift).y + raw(th - .11, v, lift).y + p.y * 2 + raw(th + .11, v, lift).y + raw(th + .22, v, lift).y) / 6; return p; };
  const skin = (p) => { const g = smooth(S * .45, S, Math.abs(p.x)) * .35; return [['spine2', (1 - g) * .8], ['neck', (1 - g) * .2], [`shoulder.${p.x >= 0 ? 'L' : 'R'}`, g]]; };
  const inside = V(0, J.spine2.y, J.spine2.z);
  if (band) {
    const rows = [[0, -thick], [0, .004], [.07, .004], [.1, 0], [.9, 0], [.93, .004], [1, .004], [1, -thick]];
    c.bag.grid(44 * c.q, rows.length - 1, (u, v) => { const [f, lift] = rows[Math.round(v * (rows.length - 1))], p = at(u * TAU, f, lift); return { p, skin: skin(p), c: lift < 0 ? col.clone().multiplyScalar(.45) : col }; }, { closeU: true, color: col, mat: m, inside });
    for (let i = 0; i < rivets; i++) { const th = (i + .5) / rivets * TAU, o = at(th, .5), n = new Vector3().crossVectors(at(th + .05, .5).sub(o), at(th, .6).sub(o)).normalize(); if (n.y < 0) n.negate(); const x = at(th + .05, .5).sub(o).normalize(); c.bag.solid(dome(.0075, .0055, 7), frame(o, x, new Vector3().crossVectors(n, x), n), skin(o), c.pal(rivetColor), SURFACE.iron); }
  }
  if (discs) for (let i = 0; i < discs.count; i++) {
    const th = (i + (discs.phase ?? .5)) / discs.count * TAU, v = discs.at ?? .6, o = at(th, v, discs.lift ?? .006), x = at(th + .05, v).sub(at(th - .05, v)).normalize(), n = new Vector3().crossVectors(x, at(th, v + .15).sub(at(th, v - .15))).normalize(); if (n.y < 0) n.negate();
    const place = frame(o, x, new Vector3().crossVectors(n, x), n), r = discs.r * k * (1 - (discs.shrink ?? 0) * Math.abs(Math.cos(th)));
    c.bag.solid(cyl(r * 1.08, .005, 16), place, skin(o), c.pal(discs.rim ?? 'brass'), SURFACE.brass);
    c.bag.solid(moved(ball(r * .94, r * .94, .011, 14, 5), V(0, 0, .006)), place, skin(o), c.pal(discs.color ?? 'nacre'), surface(discs.mat ?? 'nacre'));
  }
}

/** The group's builders by recipe name; a recipe lists them under `builders`. */
export const A = { 'a/kit': kit, 'a/bodysuit': bodysuit, 'a/lines': lines, 'a/plates': plates, 'a/collar': collar, 'a/hood': hood, 'a/hoodDown': hoodDown, 'a/fringe': fringe, 'a/beard': beard, 'a/helm': helm, 'a/yoke': yoke };
// Also registered in the shared table, so tools that look a part up there (the recipe test) find it.
export { SHAPES, SURFACE, Yof };
