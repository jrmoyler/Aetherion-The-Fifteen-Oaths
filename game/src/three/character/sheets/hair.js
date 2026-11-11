// Hair: an undercoat on the scalp and distinct, layered locks over it. Every lock is its own tapered blade with
// a raised spine, a direction and a tip, so the hair reads as strands with gaps between them, not as a helmet.
//
//   { use: 'hair', style, color, streak, length, density, lift, fringe, knot, tail, braid, stubble }
//
// style    'spiky'  short layered spikes radiating from the crown, fringe over the brow
//          'long'   locks falling from the crown to `length`; add `tail` to tie them back at the nape
//          'bun'    combed back into a knot (`knot: { at, radius, tie }`); a small high knot is a topknot
//          'braid'  combed back to the nape and plaited down the back (`braid: { length, width }`)
//          'none'   bald or fully hooded; `stubble: true` leaves a shaved shadow on the scalp
// color    palette name; `streak` a second palette name mixed lock by lock (greying hair)
// length   lock length in head heights (spiky about .2, long about 1)
// density  multiplies the number of locks (1 = default for the style)
// lift     how far the crown stands off the scalp; fringe: height of the front hairline (-.5 chin .. .5 crown)
// knot     { at: [x, y, z] in head space, radius, tie: palette name }
// tail     { length, width, tie }  hanging bundle from the knot (ponytail, topknot tail)
// braid    { length, width, tie }
import { Vector3 } from 'three';
import { cranium } from '../head.js';
import { MAT, TAU, V, clamp, lerp, ring, smooth } from './kernel.js';

const PI = Math.PI;
const dirOf = (phi, y) => { const cy = clamp(2 * y, -1, 1), st = Math.sqrt(1 - cy * cy); return V(st * Math.sin(phi), cy, st * Math.cos(phi)); };

export function hair(c, { style = 'spiky', color = 'hair', streak = null, length = null, density = 1, lift = .03, fringe = .3, knot = null, bun = null, tail = null, braid = null, stubble = false, locks = null }) {
  if (style === 'none' && !stubble) return;
  const { C, H, P } = c.head, col = c.pal(color), other = streak ? c.pal(streak) : col, HEAD = [['head', 1]];
  const place = (p) => V(C.x + p.x * H, C.y + p.y * H, C.z + p.z * H);
  const scalp = (phi, y, off = 0) => { const p = cranium(dirOf(phi, y), P); return p.addScaledVector(p.clone().normalize(), off); };
  const onScalp = (d, off = 0) => { const p = cranium(d, P); return p.addScaledVector(p.clone().normalize(), off); };
  const wrapA = (phi) => Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)));
  const line = (phi) => { const a = wrapA(phi); return lerp(lerp(fringe, .13, smooth(.3, 1.05, a)), lerp(-.02, -.3, smooth(1.5, 2.6, a)), smooth(1.05, 1.5, a)); };
  c.bag.part = 'hair';
  if (locks) density *= locks / 120;
  // Undercoat: dark, close to the scalp, so the gaps between locks read as depth and not as skin.
  c.bag.grid(30 * c.q, 8 * c.q, (u, v) => { const phi = u * TAU, y = lerp(line(phi), .499, v); return { p: place(scalp(phi, y, .012)), skin: HEAD }; },
    { closeU: true, color: col.clone().multiplyScalar(style === 'none' ? .5 : .32), mat: MAT.hair, inside: C });
  if (style === 'none') return;
  const tone = () => (c.rand() < (streak ? .4 : 0) ? other : col).clone().multiplyScalar(.75 + c.rand() * .55);
  /** One lock: a blade from `root` along a path(s) -> point in head space, `width` at the root, tapering to a tip. */
  const lock = (path, width, normalAt, rows = 5, taper = .8, shade = tone()) => {
    const tip = shade.clone().multiplyScalar(1.45), a = new Vector3(), b = new Vector3();
    c.bag.grid(2, Math.max(3, Math.round(rows * c.q)), (u, v) => {
      const p = path(v), ahead = a.copy(path(Math.min(1, v + .04))).sub(b.copy(path(Math.max(0, v - .04)))).normalize(), n = normalAt(p), side = new Vector3().crossVectors(ahead, n).normalize();
      const w = width * (1 - v) ** taper + .003, across = (u - .5) * 2;
      return { p: place(p.clone().addScaledVector(side, across * w).addScaledVector(n, (1 - Math.abs(across)) * w * .5)), skin: HEAD, c: shade.clone().lerp(tip, v * v) };
    }, { color: shade, mat: MAT.hair, inside: C });
  };
  const outward = (p) => p.clone().setY(p.y * .6).normalize();
  const L = length ?? (style === 'spiky' ? .2 : style === 'long' ? 1 : .3);

  if (style === 'spiky' || style === 'long') {
    // Rings of locks from the nape up to the crown; each ring overlaps the one below like shingles.
    const rings = [-.26, -.17, -.08, .01, .1, .19, .28, .36, .43, .48];
    rings.forEach((y, r) => {
      const girth = Math.sqrt(Math.max(.02, 1 - (2 * y) ** 2)), count = Math.max(3, Math.round((style === 'long' ? 13 : 15) * girth * density));
      for (let i = 0; i < count; i++) {
        const phi = (i + (r % 2) * .5 + (c.rand() - .5) * .5) / count * TAU, a = wrapA(phi), h = line(phi);
        if (y < h + .02) continue;
        const root = scalp(phi, y, .012), normal = root.clone().normalize(), down = scalp(phi, y - .05, .012).sub(root).normalize();
        const crown = smooth(.2, .46, y), front = Math.cos(phi), swirl = new Vector3().crossVectors(normal, down).multiplyScalar((c.rand() - .5) * .9);
        if (style === 'spiky') {
          const overEar = a > .95 && a < 2.2 && y < .14, isFringe = front > .3 && y < h + .13;
          const len = L * (overEar ? .55 : isFringe ? 1.25 : 1 + .7 * crown) * (.8 + c.rand() * .45), stand = lift * 8 * (.25 + crown) * (isFringe ? .2 : 1);
          const dir = down.clone().multiplyScalar(isFringe ? 1 : .8).addScaledVector(normal, stand * .5).add(swirl).addScaledVector(V(0, 0, 1), crown * .45).normalize();
          const flick = normal.clone().multiplyScalar(isFringe ? .12 : .34 + c.rand() * .2);
          lock((s) => root.clone().addScaledVector(dir, len * s).addScaledVector(flick, len * s * s).addScaledVector(normal, .02 + lift * crown * Math.sin(s * PI)), .075 + c.rand() * .05, () => normal, 5);
        } else {
          if (front > .45 && y < h + .2 && !tail) continue;                           // keep the face clear
          const len = L * (.75 + c.rand() * .4) * (.55 + .45 * smooth(-.3, .3, y)), dir = down.clone().multiplyScalar(.9).add(swirl.multiplyScalar(.4)).addScaledVector(normal, .25).normalize();
          const gather = tail ? V(...(knot?.at ?? [0, -.22, -.44])) : null;
          lock((s) => {
            if (gather) { const d = root.clone().normalize().lerp(gather.clone().normalize(), s).normalize(); return onScalp(d, .02 + .02 * Math.sin(s * PI)).lerp(gather, s * s * s); }
            // Falls under its own weight, and is kept off the head and neck.
            const p = root.clone().addScaledVector(dir, Math.min(len, .35) * s).add(V(0, -len * s * s, 0)), reach = Math.hypot(p.x, p.z), keep = .4 + .08 * smooth(-.3, -1, p.y);
            if (reach < keep) { const push = keep / Math.max(.05, reach); p.x *= push; p.z *= push; }
            return p;
          }, .085 + c.rand() * .05, outward, 8, .55);
        }
      }
    });
  } else {
    // Combed back: every lock lies on the scalp and runs to the knot.
    const at = V(...(knot?.at ?? bun?.at ?? (style === 'braid' ? [0, -.2, -.44] : [0, .4, -.3]))), target = at.clone().normalize();
    const count = Math.round(70 * density);
    for (let i = 0; i < count; i++) {
      const f = (i + .5) / count, phi = i * 2.39996, h = line(phi), y = lerp(.49, h + .01, f ** .8), from = dirOf(phi, y);
      lock((s) => onScalp(from.clone().lerp(target, s * .96).normalize(), .014 + .012 * Math.sin(s * PI)).lerp(at, smooth(.75, 1, s) * .6), .07 + c.rand() * .04, (p) => p.clone().normalize(), 6, .35);
    }
  }
  const k = knot ?? bun;
  if (style === 'bun' || (k && style !== 'braid' && !tail)) {
    const at = V(...(k?.at ?? [0, .4, -.3])), r = k?.radius ?? .15;
    // The knot: a wound coil, not a ball.
    c.bag.grid(18 * c.q, 9 * c.q, (u, v) => {
      const a = u * TAU, b = (v - .5) * PI, wind = 1 + .1 * Math.sin(a * 2 + b * 7);
      return { p: place(at.clone().add(V(Math.cos(b) * Math.cos(a) * r * wind, Math.sin(b) * r * .8, Math.cos(b) * Math.sin(a) * r * wind))), skin: HEAD, c: col.clone().lerp(other, .5 + .5 * Math.sin(a * 2 + b * 7)).multiplyScalar(.8 + .3 * Math.sin(b * 9 + a) ** 2) };
    }, { closeU: true, color: col, mat: MAT.hair, inside: place(at) });
    if (k?.tie) c.bag.solid(ring(r * .62, r * .62, .014, 12, 5), (p) => place(V(at.x + p.x, at.y - r * .55 + p.z * .3, at.z + .04 + p.y)), HEAD, c.pal(k.tie), MAT.leather, 1);
  }
  // Hanging hair is carried by the head near its tie and by the upper back lower down, so it does not swing through the body.
  const hang = (p) => { const low = smooth(-.45, -1.3, (p.y - C.y) / H); return [['head', 1 - low], ['spine2', low]]; };
  if (tail || braid) {
    const spec = braid ?? tail, at = V(...(knot?.at ?? [0, -.22, -.44])), len = spec.length ?? .9, w = spec.width ?? .1, plait = !!braid, links = Math.max(3, Math.round(len / .12));
    const centre = (s) => at.clone().add(V(Math.sin(s * 5) * .02, -len * s, -.05 * Math.sin(s * PI) - .04 * s));
    c.bag.grid(10 * c.q, (plait ? links * 4 : 10) * c.q, (u, v) => {
      const a = u * TAU, p0 = centre(v), swell = plait ? .72 + .28 * Math.abs(Math.sin(v * links * PI)) : 1, r = w * (1 - v * .55) * swell * (v > .97 ? .3 : 1);
      const twist = plait ? Math.sin(v * links * PI) * .5 : 0, p = place(p0.add(V(Math.cos(a + twist) * r, 0, Math.sin(a + twist) * r * .75)));
      return { p, skin: hang(p), c: col.clone().lerp(other, .5 + .5 * Math.sin(a * 3 + v * (plait ? links * PI : 9))).multiplyScalar(.75 + .35 * Math.abs(Math.sin(a * 2 + v * 20))) };
    }, { closeU: true, color: col, mat: MAT.hair, inside: (p) => p.clone().setX(C.x).setZ(place(at).z) });
    if (spec.tie) for (const s of plait ? [.02, .96] : [.03]) c.bag.solid(ring(w * 1.02, w * .8, .016, 12, 5), (p) => { const o = centre(s); return place(V(o.x + p.x, o.y + p.z, o.z + p.y)); }, hang(place(centre(s))), c.pal(spec.tie), MAT.leather, 1);
  }
}
