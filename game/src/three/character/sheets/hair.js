// Hair and facial hair, strand by strand. A style is a hairline, an undercoat on the scalp and layers of
// distinct locks over it: every lock is its own tapered ribbon with a raised spine, darker roots and edges and a
// lighter tip, so hair reads as strands with gaps and direction, never as a smooth shell.
//
//   { use: 'hair', style, color, streak, grey, ...style parameters, tendrils, beard, moustache, band }
//
// style    'tousled'  layered locks lying on the scalp, flowing away from `crown`; `top`/`side`/`back`/`bang`
//                     lengths, `lift` volume, `mess` randomness, `flick` tips standing off (spiky = high flick)
//          'bob'      straight locks hanging from a centre parting to `length`, a cut fringe (`bang`)
//          'long'     locks falling from the crown to `length`; add `tail` to tie them back
//          'updo'     combed over the scalp into a knot: `knot: { at, radius, kind: 'coil'|'puff'|'braid'|'messy'|'twist', tie }`
//                     (+ `tail` for a ponytail falling from the knot, `wave` for curly combed hair)
//          'coils'    tight curls: a bumpy cap covered in small coils, `top` height of a high-top, `curl` size
//          'buzz'     clipped to the scalp (only the undercoat, shaded as stubble)
//          'locs'     ropes rooted on the crown and falling to `length`
//          'cornrows' raised plaits from the front hairline back to a braided knot at the nape
//          'twists'   rope twists drawn up from the hairline into a wound knot on the crown
//          'braid'    combed back and plaited down the back; 'spiky', 'bun' kept as earlier names
//          'none'     bald; `stubble: true` leaves a shaved shadow
// hairline `fringe` front height (-.5 chin .. .5 crown), `temple` recession at the temples, `sideLine` height
//          over the ear, `nape`; `fade: { to, from }` blends the undercoat into skin between two heights (shaved sides)
// tendrils [[phiDeg, y, length, curl, forward]] loose strands hanging from the scalp; `beads` puts rings on them
// beard    { style: 'full'|'goatee'|'long'|'chin', length, color, moustache: length|false, soul }
// knot     { at: [x, y, z] in head space, radius, kind, tie }.  Head space: origin at the head's centre, +y up,
//          +z forward, chin to crown = 1.
import { Vector3 } from 'three';
import { cranium, sculpt } from '../head.js';
import { MAT, TAU, V, clamp, lerp, ring, smooth } from './kernel.js';

const PI = Math.PI, GOLD = 2.39996323, DOWN = V(0, -1, 0);
const dirOf = (phi, y) => { const cy = clamp(2 * y, -1, 1), st = Math.sqrt(1 - cy * cy); return V(st * Math.sin(phi), cy, st * Math.cos(phi)); };
const wrapA = (phi) => Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)));
const polyline = (pts) => (s) => { const f = clamp(s, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)); return pts[i].clone().lerp(pts[i + 1], f - i); };

const LEGACY = { spiky: 'tousled', bun: 'updo' };
const DEFAULTS = {
  tousled: { top: .3, side: .16, back: .18, bang: .2, lift: .035, flick: .25, mess: .5, count: 150 },
  bob: { length: .62, bang: .2, count: 110 },
  long: { length: 1, count: 110 },
  updo: { count: 80 }, braid: { count: 70 },
  coils: { top: .03, curl: .026, count: 300 },
  buzz: {}, locs: { length: .55, count: 44 }, cornrows: { rows: 9 }, twists: { rows: 16 }, none: {},
};

export function hair(c, raw) {
  const legacy = raw.style ?? 'spiky', style = LEGACY[legacy] ?? legacy;
  const o = { color: 'hair', streak: null, grey: .4, fringe: .3, temple: 0, sideLine: .13, nape: -.3, density: 1, ...DEFAULTS[style], ...raw };
  if (legacy === 'spiky') { o.flick = raw.flick ?? .5; if (raw.length) { o.top = raw.length * 1.4; o.side = raw.length * .7; o.back = raw.length * .9; o.bang = raw.length; } }
  if (raw.locks) o.count = raw.locks * .7;
  const { C, H, P } = c.head, col = c.pal(o.color), other = o.streak ? c.pal(o.streak) : col, skinTone = c.pal('skin').clone().multiplyScalar(.6), HEAD = [['head', 1]];
  const place = (p) => V(C.x + p.x * H, C.y + p.y * H, C.z + p.z * H);
  const onScalp = (d, off = 0) => { const p = cranium(d, P); return p.addScaledVector(p.clone().normalize(), off); };
  const scalp = (phi, y, off = 0) => onScalp(dirOf(phi, y), off);
  // Hanging hair is carried by the head near its root and by the upper back lower down.
  const hang = (p) => { const low = smooth(-.5, -1.3, (p.y - C.y) / H); return [['head', 1 - low], ['spine2', low]]; };
  const rnd = (a = 1) => (c.rand() - .5) * 2 * a, q = c.q, N = (n) => Math.max(1, Math.round(n * o.density * Math.min(1, .35 + .65 * q)));
  /** Front hairline height by angle round the head: fringe at the brow, receding temples, over the ear, the nape. */
  const line = (phi) => {
    const a = wrapA(phi), front = o.fringe + o.temple * Math.exp(-(((a - .62) / .3) ** 2)) - .05 * smooth(.45, 1, a);
    return lerp(lerp(front, o.sideLine, smooth(.75, 1.2, a)), lerp(o.sideLine - .12, o.nape, smooth(1.6, 2.5, a)), smooth(1.2, 1.6, a));
  };
  const tone = (grey = o.streak ? o.grey : 0) => (c.rand() < grey ? other : col).clone().multiplyScalar(.72 + c.rand() * .5);
  c.bag.part = 'hair';

  /** One lock: a ribbon along path(s) in head space, `width` at the root tapering to the tip, spine raised along `normalAt`. */
  const lock = (path, width, normalAt, { rows = 5, taper = .8, shade = tone(), skin = HEAD, tip = 1.4, root = .6, belly = 0 } = {}) => {
    const a = new Vector3(), b = new Vector3(), light = shade.clone().multiplyScalar(tip), dark = shade.clone().multiplyScalar(root);
    c.bag.grid(2, Math.max(3, Math.round(rows * Math.min(1, .5 + .5 * q))), (u, v) => {
      const p = path(v), ahead = a.copy(path(Math.min(1, v + .05))).sub(b.copy(path(Math.max(0, v - .05)))).normalize(), n = normalAt(p, v), side = new Vector3().crossVectors(ahead, n);
      if (side.lengthSq() < 1e-8) side.set(1, 0, 0); side.normalize();
      const w = width * ((1 - v) ** taper * (1 + belly * Math.sin(PI * v)) + .04), across = (u - .5) * 2, ridge = 1 - Math.abs(across);
      const colour = dark.clone().lerp(shade, smooth(0, .3, v)).lerp(light, v * v).multiplyScalar(.72 + .28 * ridge);
      const world = place(p.clone().addScaledVector(side, across * w).addScaledVector(n, ridge * w * (o.ridge ?? .55)));
      return { p: world, skin: typeof skin === 'function' ? skin(world) : skin, c: colour };
    }, { color: shade, mat: MAT.hair, inside: C });
  };
  /** A round rope along centre(s): plaits, locs, twists and tails. `pattern` (a, v) -> brightness gives the winding. */
  const rope = (centre, radius, { nu = 7, nv = 10, shade = col, skin = HEAD, pattern = null, swell = null, flat = 1 } = {}) => {
    const a = new Vector3(), b = new Vector3(), up = new Vector3(), sideV = new Vector3();
    c.bag.grid(Math.max(5, Math.round(nu * Math.min(1, .6 + .4 * q))), Math.max(3, Math.round(nv * Math.min(1, .5 + .5 * q))), (u, v) => {
      const p0 = centre(v), ahead = a.copy(centre(Math.min(1, v + .03))).sub(b.copy(centre(Math.max(0, v - .03)))).normalize();
      up.copy(p0).setY(p0.y * .3); if (up.lengthSq() < 1e-6) up.set(0, 0, -1); up.addScaledVector(ahead, -up.dot(ahead)); if (up.lengthSq() < 1e-6) up.set(1, 0, 0); up.normalize(); sideV.crossVectors(ahead, up);
      const ang = u * TAU, r = (typeof radius === 'function' ? radius(v) : radius) * (swell ? swell(ang, v) : 1) * (v > .985 || v < .015 ? .35 : 1);
      const world = place(p0.clone().addScaledVector(up, Math.cos(ang) * r * flat).addScaledVector(sideV, Math.sin(ang) * r));
      return { p: world, skin: typeof skin === 'function' ? skin(world) : skin, c: shade.clone().multiplyScalar(pattern ? pattern(ang, v) : .8 + .3 * Math.abs(Math.sin(ang * 3 + v * 30))) };
    }, { closeU: true, color: shade, mat: MAT.hair, inside: (p) => place(centre(.5)).lerp(p, .0) });
  };
  const plait = (links) => ({ swell: (a, v) => .78 + .22 * Math.abs(Math.sin(v * links * PI + (Math.cos(a) > 0 ? 0 : PI / 2))), pattern: (a, v) => .62 + .5 * Math.abs(Math.sin(v * links * PI + Math.sin(a) * 1.4)) });
  const twist = (turns) => ({ swell: (a, v) => .82 + .18 * Math.sin(a * 2 + v * turns * TAU), pattern: (a, v) => .6 + .5 * (.5 + .5 * Math.sin(a * 2 + v * turns * TAU)) });
  const band = (at, r, tie, thick = .014, tilt = 0) => c.bag.solid(ring(r, r, thick, 12, 5), (p) => place(V(at.x + p.x, at.y + p.z * Math.cos(tilt) - p.y * Math.sin(tilt), at.z + p.y * Math.cos(tilt) + p.z * Math.sin(tilt))), hang(place(at)), c.pal(tie), /gold|brass|bead|copper|ring|steel|silver/i.test(tie) ? MAT.gold : MAT.leather, 1);

  /** Undercoat: close to the scalp, dark, so gaps between locks read as depth. `fade` blends it into skin (shaved sides). */
  const pale = (col.r + col.g + col.b) / 3 > .3, cap = ({ off = .012, shade = col.clone().multiplyScalar(pale ? .62 : .34), bump = null, low = line, top = .499 } = {}) => {
    c.bag.grid(34 * q, 12 * q, (u, v) => {
      const phi = u * TAU, y = lerp(low(phi), top, v), p = scalp(phi, y, off + (bump ? bump(phi, y) : 0));
      let colour = shade;
      if (o.fade) { const k = smooth(o.fade.to ?? o.sideLine, o.fade.from ?? .3, y) * (1 - .0 * Math.cos(phi)); colour = skinTone.clone().lerp(shade, lerp(o.fade.min ?? .25, 1, k)); }
      return { p: place(p), skin: HEAD, c: colour };
    }, { closeU: true, color: shade, mat: MAT.hair, inside: C });
  };
  /** A lock that lies on the scalp for `lay`, flowing away from K under gravity, then hangs free for `hangLen`. */
  const flowPath = (d0, { lay, K, grav = .5, swirl = 0, lift0 = .016, lift = .03, flick = 0, hangLen = 0, n = 7, keep = .4, fwd = 0 }) => {
    const pts = [], d = d0.clone(), t = new Vector3(), g = new Vector3(), sideV = new Vector3();
    for (let k = 0; k <= n; k++) {
      const s = k / n;
      pts.push(onScalp(d, lift0 + lift * Math.sin(PI * Math.min(1, s * 1.15)) ** .7 + flick * lay * s * s));
      t.copy(d).multiplyScalar(d.dot(K)).sub(K); if (t.lengthSq() < 1e-5) t.set(0, 0, 1); t.normalize();
      g.copy(DOWN).addScaledVector(d, d.y); sideV.crossVectors(d, t);
      t.addScaledVector(g, grav).addScaledVector(sideV, swirl); t.addScaledVector(d, -t.dot(d)).normalize();
      d.addScaledVector(t, lay / n / .42).normalize();
    }
    if (hangLen > 0) {
      const m = Math.max(2, Math.ceil(hangLen / .09)), p = pts[n].clone(), v = pts[n].clone().sub(pts[n - 1]).normalize();
      for (let k = 1; k <= m; k++) {
        v.lerp(DOWN, .5).normalize(); p.addScaledVector(v, hangLen / m); p.z += fwd * hangLen / m;
        const reach = Math.hypot(p.x, p.z), need = keep + .06 * smooth(-.3, -1, p.y); if (reach < need) { const push = need / Math.max(.05, reach); p.x *= push; p.z *= push; }
        pts.push(p.clone());
      }
    }
    return polyline(pts);
  };
  const outward = (p) => p.clone().setY(p.y * .5).normalize();
  /** Roots spread evenly over the hair-bearing scalp (golden-angle spiral), visited from the nape up so upper locks overlap lower ones. */
  const roots = (count, visit, { margin = .015, arc = null, minY = -.5 } = {}) => {
    const lowest = Math.min(o.nape, o.sideLine - .12) - .02, total = Math.round(count);
    for (let i = 0; i < total; i++) {
      const y = lerp(lowest, .497, ((i + .5) / total) ** .85), phi = i * GOLD + rnd(.2);
      if (y < line(phi) + margin || y < minY) continue;
      if (arc && wrapA(phi) > arc * PI / 180) continue;
      visit(phi, y, dirOf(phi, y));
    }
  };
  const knotOf = (k, fallback) => ({ at: V(...(k?.at ?? fallback)), r: k?.radius ?? .15, kind: k?.kind ?? 'coil', tie: k?.tie ?? null });
  /** Hair combed over the scalp into `at`. */
  const combed = (at, count, { wave = 0, width = .075, lift = .014 } = {}) => {
    const target = at.clone().normalize();
    // The hairline itself: fine locks rooted just under the undercoat's edge, so the brow line is hair and not a cut.
    for (let i = 0, n = Math.round(o.edge ?? count * .7); i < n; i++) {
      const phi = lerp(-1.9, 1.9, (i + c.rand()) / n), from = dirOf(phi, line(phi) - .006 + rnd(.008)), ph = c.rand() * TAU;
      lock((s) => onScalp(from.clone().lerp(target, s * .5).normalize(), .013 + .012 * Math.sin(s * PI) + wave * .4 * (1 + Math.sin(s * 9 + ph)) * Math.sin(s * PI)), .035 + c.rand() * .02, (p) => p.clone().normalize(), { rows: 4, taper: .5, tip: 1.1, root: .9, belly: .5 });
    }
    for (let i = 0; i < count; i++) {
      const f = (i + .5) / count, phi = i * GOLD, h = line(phi), y = lerp(.49, h + .008, f ** .8), from = dirOf(phi, y), ph = c.rand() * TAU;
      lock((s) => onScalp(from.clone().lerp(target, s * .96).normalize(), lift + .014 * Math.sin(s * PI) + wave * .5 * (1 + Math.sin(s * 14 + ph)) * Math.sin(s * PI)).lerp(at, smooth(.75, 1, s) * .6),
        width + c.rand() * .04, (p) => p.clone().normalize(), { rows: 6, taper: .3, tip: 1.15, root: .8, belly: .2 });
    }
  };
  /** The knot hair is gathered into. */
  const knot = (k) => {
    const { at, r, kind, tie } = k;
    if (kind === 'twist') {
      // Rope twists wound round each other: loops in tilted planes about the knot's centre.
      const loops = N(7);
      for (let i = 0; i < loops; i++) {
        const tilt = rnd(.9), spin = i / loops * PI + rnd(.3), rr = r * (.55 + c.rand() * .3), ax = V(Math.cos(spin), 0, Math.sin(spin)), up = V(-Math.sin(spin) * Math.sin(tilt), Math.cos(tilt), Math.cos(spin) * Math.sin(tilt));
        rope((s) => at.clone().addScaledVector(ax, Math.cos(s * TAU) * rr).addScaledVector(up, Math.sin(s * TAU) * rr * .8 + r * .1), r * .3, { nu: 6, nv: 16, shade: tone(), ...twist(7) });
      }
    } else {
      const bumps = kind === 'puff' ? 9 : kind === 'braid' ? 6 : 2, depth = kind === 'puff' ? .12 : kind === 'braid' ? .14 : .1;
      c.bag.grid(20 * q, 11 * q, (u, v) => {
        const a = u * TAU, b = (v - .5) * PI;
        const wind = kind === 'puff' ? 1 + depth * Math.sin(a * bumps + Math.sin(b * 7) * 2) * Math.sin(b * bumps + a) : 1 + depth * Math.sin(a * bumps + b * 7);
        const shade = col.clone().lerp(other, o.streak ? .5 + .5 * Math.sin(a * 2 + b * 7) : 0).multiplyScalar(kind === 'puff' ? .55 + .6 * (wind - 1 + depth) / depth * .5 : .62 + .45 * Math.sin(b * 9 + a * bumps) ** 2);
        return { p: place(at.clone().add(V(Math.cos(b) * Math.cos(a) * r * wind, Math.sin(b) * r * (kind === 'puff' ? .95 : .8) * wind, Math.cos(b) * Math.sin(a) * r * wind))), skin: HEAD, c: shade };
      }, { closeU: true, color: col, mat: MAT.hair, inside: place(at) });
      if (kind === 'puff') for (let i = 0, n = N(70); i < n; i++) coil(at.clone(), dirOf(i * GOLD, lerp(-.42, .49, (i + .5) / n)), r * .98, o.curl ?? .028);
      if (kind === 'messy') for (let i = 0, n = N(16); i < n; i++) {
        const d = dirOf(i * GOLD, lerp(-.3, .49, c.rand())), root = at.clone().addScaledVector(d, r * .8), len = r * (.7 + c.rand() * .9), bend = V(rnd(.5), -.4 - c.rand() * .5, rnd(.5));
        lock((s) => root.clone().addScaledVector(d, len * s).addScaledVector(bend, len * s * s), .03 + c.rand() * .025, () => d, { rows: 4 });
      }
    }
    if (tie) band(V(at.x, at.y - r * .62, at.z + .03), r * .6, tie);
  };
  /** One small coil standing on a surface point: a ribbon wound in a helix. */
  function coil(centre, d, radius, size, turns = 1.3, shade = tone()) {
    const base = centre.clone().addScaledVector(d, radius), tu = new Vector3().crossVectors(d, Math.abs(d.y) > .9 ? V(1, 0, 0) : V(0, 1, 0)).normalize(), tv = new Vector3().crossVectors(d, tu), ph = c.rand() * TAU, h = size * (1 + c.rand() * .6);
    lock((s) => base.clone().addScaledVector(d, h * s * .8).addScaledVector(tu, Math.cos(ph + s * TAU * turns) * size * (1 - s * .3)).addScaledVector(tv, Math.sin(ph + s * TAU * turns) * size * (1 - s * .3)),
      size * .75, (p) => p.clone().sub(base).addScaledVector(d, size * .6).normalize(), { rows: 4, taper: .25, shade, tip: 1.4, root: .7 });
  }
  const scalpCoil = (phi, y, lift, size) => { const d = dirOf(phi, y), p = onScalp(d, lift); coil(V(), p.clone().normalize(), p.length(), size); };
  /** A bundle of locks hanging from the knot (ponytail). */
  const tail = (at, spec) => {
    const len = spec.length ?? .9, w = spec.width ?? .1, n = N(spec.count ?? 16), rise = spec.rise ?? .12, back = spec.back ?? .16;
    for (let i = 0; i < n; i++) {
      const a = i * GOLD, rr = Math.sqrt((i + .5) / n) * w, ox = Math.cos(a) * rr, oz = Math.sin(a) * rr * .7, l = len * (.8 + c.rand() * .3), sway = rnd(.05);
      lock((s) => V(at.x + ox * (.5 + s * 1.2) + sway * s, at.y + rise * Math.sin(Math.min(1, s * 3) * PI * .5) * (1 - s * .6) - l * s * s * .95 - l * .05 * s, at.z + oz * (.5 + s) - back * Math.sin(Math.min(1, s * 2.2) * PI * .5) - .05 * s),
        w * .5 + c.rand() * .02, (p) => V(ox * 3, .2, -1 + oz * 2).normalize(), { rows: 9, taper: .5, skin: hang, belly: .2 });
    }
    if (spec.tie) band(V(at.x, at.y + rise * .25, at.z - back * .3), w * .75, spec.tie, .02, 1.1);
  };

  // ---- the styles ----
  if (style !== 'none' || o.stubble) {
    if (style === 'none') cap({ off: .004, shade: skinTone.clone().lerp(col, .35) });
    else if (style === 'buzz') cap({ off: .006, shade: skinTone.clone().lerp(col, o.cover ?? .7), bump: (phi, y) => .002 * Math.sin(phi * 40) * Math.sin(y * 90) });
    else if (style === 'coils') cap({ off: .014, bump: (phi, y) => (o.top ?? 0) * smooth(o.fade?.from ?? .2, .42, y) + .006 * Math.sin(phi * 23 + y * 40) * Math.sin(y * 60 - phi * 9) });
    else if (style === 'cornrows' || style === 'twists') cap({ off: .006, shade: skinTone.clone().lerp(col, .55) });
    else cap();
  }
  const K = V(...(o.crown ?? [0, .82, -.55])).normalize();
  if (style === 'tousled') {
    roots(N(o.count), (phi, y, d) => {
      const a = wrapA(phi), h = line(phi), front = Math.cos(phi), top = smooth(.22, .42, y), isBang = front > .25 && y < h + .16 && a < 1, overEar = a > .9 && a < 2.1 && y < .16;
      const len = (isBang ? o.bang : lerp(a > 2 ? o.back : o.side, o.top, top)) * (overEar ? .7 : 1) * (.75 + c.rand() * .5);
      if (len < .02) return;
      const path = flowPath(d, { lay: len, K: isBang ? V(...(o.part ?? [0, .9, -.1])).normalize() : K, grav: isBang ? 1.1 : .45 + .4 * (1 - top), swirl: rnd(o.mess) + (o.sweep ?? 0) * (isBang || top > .5 ? 1 : .3),
        lift0: .016 + (isBang ? .02 : 0), lift: o.lift * (.4 + top) * (.6 + c.rand() * .8), flick: (isBang ? .12 : o.flick) * (.5 + c.rand()), n: 6 });
      // Fringe: several narrow strands of uneven length with rounded tips, so the edge over the brow is organic.
      if (isBang) { for (let k = 0; k < 2; k++) { const d2 = dirOf(phi + rnd(.09), y + rnd(.02)); lock(flowPath(d2, { lay: len * (.55 + c.rand() * .75), K: V(...(o.part ?? [0, .9, -.1])).normalize(), grav: 1.1, swirl: rnd(o.mess * 1.2) + (o.sweep ?? 0), lift0: .03 + c.rand() * .012, lift: o.lift * .5, flick: .1 * c.rand(), n: 6 }), .022 + c.rand() * .022, (p) => p.clone().normalize(), { rows: 6, taper: .4, belly: .6 }); } return; }
      lock(path, .05 + c.rand() * .04, (p) => p.clone().normalize(), { rows: 5, taper: .6, belly: .35 });
    });
  } else if (style === 'bob' || style === 'long') {
    const part = V(...(o.part ?? [0, 1, -.05])).normalize();
    roots(N(o.count), (phi, y, d) => {
      const front = Math.cos(phi), h = line(phi), isBang = o.bang && front > .5 && y < h + .2;
      if (!isBang && !o.bang && !o.tail && front > .45 && y < h + .1) return;
      if (o.tail) {
        const gather = V(...(o.knot?.at ?? [0, -.22, -.44]));
        return lock((s) => onScalp(d.clone().lerp(gather.clone().normalize(), s).normalize(), .02 + .02 * Math.sin(s * PI)).lerp(gather, s * s * s), .085 + c.rand() * .05, (p) => p.clone().normalize(), { rows: 7, taper: .4 });
      }
      const total = isBang ? o.bang * (.85 + c.rand() * .3) : o.length * (.85 + c.rand() * .25) * (.6 + .4 * smooth(-.3, .3, y)), lay = Math.min(total, isBang ? total : .22 + .3 * smooth(.1, .45, y));
      // Hair falls to either side of the parting, like curtains, and not down over the face.
      const away = isBang ? part : V(0, d.y, d.z + .02).addScaledVector(part, .25).normalize();
      lock(flowPath(d, { lay, K: away, grav: .9, swirl: rnd(.12), lift0: .018 + (isBang ? .018 : 0), lift: o.lift ?? .02, hangLen: total - lay, keep: o.keep ?? .37, n: 6 }), .075 + c.rand() * .04, outward, { rows: 8, taper: isBang ? .35 : .45, skin: total > .7 ? hang : HEAD, belly: .15 });
    }, { arc: o.arc ?? null });
    if (o.tail) tail(V(...(o.knot?.at ?? [0, -.22, -.44])), o.tail);
  } else if (style === 'updo' || style === 'braid') {
    const k = knotOf(o.knot ?? o.bun, style === 'braid' ? [0, -.2, -.44] : [0, .4, -.3]);
    combed(k.at, o.combed === false ? 0 : N(o.count), { wave: o.wave ?? 0 });
    if (style === 'braid' || o.braid) {
      const spec = o.braid ?? {}, len = spec.length ?? .9, w = spec.width ?? .1, links = Math.max(3, Math.round(len / .11));
      rope((s) => k.at.clone().add(V(Math.sin(s * 5) * .02, -len * s, -.05 * Math.sin(s * PI) - .04 * s)), (v) => w * (1 - v * .5), { nu: 10, nv: links * 4, skin: hang, ...plait(links) });
      if (spec.tie) for (const s of [.02, .95]) band(k.at.clone().add(V(0, -len * s, -.04 * s)), w * (1 - s * .5), spec.tie, .016, PI / 2);
    } else if (o.tail) { tail(k.at, o.tail); if (k.tie) band(k.at.clone(), .07, k.tie, .02, 1.1); } else knot(k);
  } else if (style === 'coils') {
    const size = o.curl, lowY = o.fade ? (o.fade.from ?? .2) - .06 : -1;
    roots(N(o.count), (phi, y) => scalpCoil(phi, y, .012 + (o.top ?? 0) * smooth(o.fade?.from ?? .2, .42, y), size * (.8 + c.rand() * .5)), { minY: lowY, margin: .0 });
  } else if (style === 'locs') {
    const base = o.fade?.from ?? .14, n = N(o.count);
    for (let i = 0; i < n; i++) {
      const phi = i * GOLD, y = lerp(base, .495, ((i + .5) / n) ** .8), d = dirOf(phi, y), root = onScalp(d, .005), out = V(Math.sin(phi), 0, Math.cos(phi)), len = o.length * (.7 + c.rand() * .5), stand = (o.stand ?? .2) * (.5 + c.rand());
      const fwd = Math.cos(phi) > .3 ? (o.back ?? 0) : 0, dir = out.clone().multiplyScalar(1 - fwd).add(V(rnd(.25), 0, -fwd * 1.2)).normalize();
      rope((s) => { const p = root.clone().addScaledVector(d, stand * len * Math.sin(Math.min(1, s * 2.2) * PI * .5)).addScaledVector(dir, len * .55 * s).add(V(0, -len * .75 * s * s, 0)); const reach = Math.hypot(p.x, p.z), need = .4; if (p.y < .3 && reach < need) { const push = need / Math.max(.05, reach); p.x *= push; p.z *= push; } return p; },
        (v) => (o.r ?? .034) * (1 - v * .25), { nu: 6, nv: 9, shade: tone(), ...twist(len * 14) });
    }
  } else if (style === 'cornrows' || style === 'twists') {
    const rows = Math.round(o.rows), up = style === 'twists', k = knotOf(o.knot, up ? [0, .5, -.12] : [0, -.08, -.5]), target = k.at.clone().normalize();
    for (let i = 0; i < rows; i++) {
      // Each row starts on the hairline and runs over the scalp into the knot.
      const phi = up ? i / rows * TAU : lerp(-1.75, 1.75, (i + .5) / rows), from = dirOf(phi, line(phi) + .012), links = up ? 9 : 13;
      rope((s) => onScalp(from.clone().lerp(target, s * .97).normalize(), .012 + (up ? .012 : .008)).lerp(k.at, smooth(.8, 1, s) * .5), (v) => (o.r ?? (up ? .034 : .026)) * (1 - .15 * v), { nu: 6, nv: links * 3, shade: tone(), flat: up ? .85 : .7, ...(up ? twist(links) : plait(links)) });
      if (o.beads && !up) for (const s of o.beadAt ?? [.34, .58]) if ((i + Math.round(s * 10)) % 2 === 0) { const p = onScalp(from.clone().lerp(target, s * .97).normalize(), .016); band(p, .024, o.beads, .012, PI / 2 - Math.atan2(p.y, -p.z) * 0); }
    }
    knot({ ...k, kind: o.knot?.kind ?? (up ? 'twist' : 'braid') });
  }
  if (o.knot && ['tousled', 'coils', 'bob'].includes(style)) { const k = knotOf(o.knot, [0, .5, -.2]); combed(k.at, N(26), { width: .05 }); if (o.tail) tail(k.at, o.tail); else knot(k); }

  // Loose strands: [phiDeg, y, length, curl, forward]
  for (const [deg, y, len0, curl = 0, fwd = 0] of o.tendrils ?? []) for (let k = 0, strands = curl ? 2 : 3; k < strands; k++) {
    const phi = deg * PI / 180 + rnd(.06), len = len0 * (1 - k * .16 - c.rand() * .08), root = scalp(phi, y + rnd(.012), .02), out = outward(root), ph = c.rand() * TAU, tu = V(out.z, 0, -out.x), turns = len / .12, sway = rnd(.03);
    const path = (s) => {
      const p = root.clone().addScaledVector(out, .02 + .05 * Math.sin(PI * s)).addScaledVector(tu, sway * s * s).add(V(0, -len * s, fwd * s));
      if (curl) p.addScaledVector(tu, Math.cos(ph + s * turns * TAU) * curl * Math.min(1, s * 4)).addScaledVector(out, Math.sin(ph + s * turns * TAU) * curl * .6 * Math.min(1, s * 4));
      const reach = Math.hypot(p.x, p.z), need = lerp(.36, .3, smooth(-.5, -.8, p.y)); if (reach < need) { const push = need / Math.max(.05, reach); p.x *= push; p.z *= push; }
      return p;
    };
    lock(path, (o.tendrilWidth ?? .03) * (.7 + c.rand() * .5), outward, { rows: Math.max(8, Math.round(len * (curl ? 40 : 18))), taper: .8, skin: hang, belly: .5 });
    if (o.beads && k === 0) band(path(.8), .02, o.beads, .012, PI / 2);
  }
  if (o.band) band(V(0, o.band.y ?? .33, o.band.z ?? -.05), o.band.r ?? .3, o.band.color ?? 'gold', o.band.thick ?? .012, o.band.tilt ?? PI / 2);

  // ---- facial hair: locks rooted on the face surface ----
  const faceAt = (x, y) => {
    let lo = 0, hi = PI * .62, pt = null; const dy = clamp(y * 2, -.999, .999), rr = Math.sqrt(1 - dy * dy);
    for (let k = 0; k < 16; k++) { const t = (lo + hi) / 2; pt = sculpt(V(Math.sign(x || 1) * Math.sin(t) * rr, dy, Math.cos(t) * rr), P); if (Math.abs(pt.x) < Math.abs(x)) lo = t; else hi = t; }
    return pt;
  };
  const faceNormal = (x, y) => { const p = faceAt(x, y), a = faceAt(x + .012, y).sub(p), b = faceAt(x, y + .012).sub(p); const n = a.cross(b).normalize(); if (n.z < 0 && Math.abs(x) < .2) n.negate(); if (n.dot(p) < 0) n.negate(); return n; };
  const B = o.beard ? { style: 'full', length: .1, color: o.color, moustache: .07, grey: o.streak ? o.grey : 0, ...o.beard } : null;
  if (B) {
    c.bag.part = 'beard';
    const bc = c.pal(B.color), bo = B.streak ? c.pal(B.streak) : other, shadeB = () => (c.rand() < (B.streak ? B.grey ?? .4 : B.grey) ? bo : bc).clone().multiplyScalar(.75 + c.rand() * .45);
    const whisker = (x, y, len, dir, w = .028, rows = 4, opts = {}) => {
      const root = faceAt(x, y), n = faceNormal(x, y), bend = opts.bend ?? V(0, -.5, 0), goal = opts.goal ?? null;
      lock((s) => { const p = root.clone().addScaledVector(n, .006 + (opts.puff ?? .012) * Math.sin(PI * Math.min(1, s * 1.5))).addScaledVector(dir, len * s).addScaledVector(bend, len * s * s); return goal ? p.lerp(V(goal.x + (root.x) * .25, p.y, Math.max(p.z, goal.z)), smooth(.2, 1, s) * .8) : p; },
        w * (.8 + c.rand() * .5), () => n, { rows, taper: opts.taper ?? .6, shade: shadeB(), tip: 1.12, root: .85, skin: opts.skin ?? HEAD });
    };
    const cheekLine = (ax) => (B.cheek ?? -.27) + .3 * (ax / .3) ** 2.2;
    const inRegion = (x, y) => {
      const ax = Math.abs(x);
      if (B.style === 'goatee' || B.style === 'chin') return ax < (B.width ?? .09) && y < (B.style === 'chin' ? -.39 : -.345) && !(ax < .06 && y > -.335);
      if (ax < .085 && y > -.34 && y < -.262) return false;                    // the mouth
      if (ax < .05 && y > -.385 && y < -.34 && !B.soul) return y < -.365;      // under the lip
      return y < cheekLine(ax) && ax < .31;
    };
    const full = B.style === 'full' || B.style === 'long', count = N(B.count ?? (full ? 420 : 90));
    // The mass of the beard: a coat lying on the face, so the whiskers over it read as texture and not as flakes.
    if (B.coat !== false) {
      const X = full ? .31 : (B.width ?? .09) + .01, y0 = full ? -.1 : -.33, under = bc.clone().multiplyScalar(pale || (bc.r + bc.g + bc.b) / 3 > .3 ? .7 : .5);
      c.bag.grid(22 * q, 16 * q, (u, v) => { const x = lerp(-X, X, u), y = lerp(-.515, y0, v), p = faceAt(x || .001, y); return { p: place(p.addScaledVector(faceNormal(x || .001, y), .007 + .012 * Math.min(1, B.length * 6) * smooth(-.2, -.4, y))), skin: HEAD, c: under.clone().multiplyScalar(.8 + .4 * c.rand()) }; },
        { color: under, mat: MAT.hair, inside: C, skip: (u, v) => !inRegion(lerp(-X, X, u), lerp(-.515, y0, v)) });
    }
    for (let i = 0; i < count; i++) {
      const x = rnd(full ? .3 : (B.width ?? .09)), y = lerp(-.5, full ? -.08 : -.34, c.rand() ** 1.25);
      if (!inRegion(x, y)) continue;
      const chin = Math.exp(-((x / .1) ** 2)) * smooth(-.36, -.47, y), len = B.length * (.55 + .45 * c.rand()) * (full ? .45 + .55 * smooth(-.15, -.45, y) : 1) + (B.point ?? 0) * chin;
      const dir = V(x * (B.style === 'long' ? .3 : 1.1), -1, .28 - Math.abs(x) * .6).normalize();
      whisker(x, y, len, dir, B.style === 'long' ? .03 : .02, len > .3 ? 9 : 3, { bend: V(-x * (B.point ? 1.5 : .4), -.35, -.12), puff: full ? .016 : .01, taper: len > .3 ? .45 : .6, skin: len > .5 ? hang : HEAD });
    }
    if (B.style === 'long') for (let i = 0, n = N(34); i < n; i++) {   // the long fall from the chin, gathered to a point
      const x = rnd(.1), y = lerp(-.4, -.5, c.rand()), len = (B.point ?? 1) * (.6 + .4 * c.rand() * (1 - Math.abs(x) / .12)), root = faceAt(x, y), nn = faceNormal(x, y), wob = rnd(.03), ph = c.rand() * 6;
      lock((s) => V(root.x * (1 - s * .75) + wob * Math.sin(s * 7 + ph) * s, root.y - len * s, root.z + .03 * Math.sin(PI * Math.min(1, s * 2)) + (B.forward ?? .05) * s + Math.abs(root.x) * .2 * s), .045 * (1 - .3 * c.rand()), () => V(nn.x, .1, 1).normalize(), { rows: 12, taper: .4, shade: shadeB(), tip: 1.15, root: .8, skin: HEAD, belly: .2 });
    }
    if (B.moustache) for (const side of [-1, 1]) for (let i = 0, n = N(B.style === 'long' ? 10 : 8); i < n; i++) {
      const f = (i + .5) / n, x = side * lerp(.008, .085, f), y = -.243 - .012 * f + rnd(.004), droop = B.moustache > .2;
      whisker(x, y, B.moustache * (droop ? .6 + .5 * f : .7 + .4 * c.rand()), V(side * (droop ? .35 : .75), droop ? -.9 : -.62, .12).normalize(), droop ? .03 : .026, droop ? 8 : 4, { bend: V(side * (droop ? -.08 : .1), droop ? -.5 : -.25, -.05), puff: .012, taper: .5 });
    }
    if (B.soul) for (let i = 0; i < 5; i++) whisker(rnd(.022), -.352 - c.rand() * .02, .05, V(0, -1, .25).normalize(), .022, 3);
  }
}
