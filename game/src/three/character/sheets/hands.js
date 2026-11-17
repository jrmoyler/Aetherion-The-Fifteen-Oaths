// Ring lofts in the wrist's bind frame. Every digit has a continuous pad, two
// joint creases, a rounded tip and a distinct resting curl around the weapon.
import { MAT, TAU, V, frame, moved, roundBox } from './kernel.js';

const handWeight = [['hand.L', 1]];
const palmSections = [
  // Height, half width, thickness, centre toward the thumb (metres).
  [-.012, .029, .019, .001], [.009, .029, .019, .001],
  [.034, .036, .021, .003], [.061, .041, .019, .002],
  [.079, .041, .015, 0], [.089, .038, .012, 0], [.094, .032, .007, -.001],
];

function palm(c, place, appearance) {
  const { bag } = c;
  const centre = place(V(0, .052, 0));
  const sides = Math.max(10, Math.round(16 * c.q));
  const section = (u, v) => {
    const [y, w, h, x] = palmSections[Math.round(v * (palmSections.length - 1))];
    const sine = Math.sin(u * TAU), cosine = Math.cos(u * TAU);
    const lateral = Math.sign(sine) * Math.abs(sine) ** .8;
    // A meaty thumb pad on the inside, gently arched metacarpals on the back.
    const thenar = .006 * Math.max(0, lateral) * Math.sin(v * Math.PI) * Math.max(0, -cosine);
    const arch = .003 * Math.sin(v * Math.PI) * (1 - lateral * lateral);
    const distal = v ** 4;
    const p = V(x + w * lateral, y - distal * (.009 * Math.max(0, -lateral) + .004 * lateral * lateral),
      h * Math.sign(cosine) * Math.abs(cosine) ** .7 - thenar + arch);
    return { p: place(p), skin: handWeight };
  };
  bag.grid(sides, palmSections.length - 1, section, { closeU: true, inside: centre, ...appearance });
  // The distal face closes the webs between the four finger roots.
  const normal = place(V(0, 1, 0)).sub(place(V(0, 0, 0))).normalize();
  const origin = bag.vert(place(V(0, .090, 0)), normal, appearance.color, appearance.mat, handWeight);
  const rim = Array.from({ length: sides }, (_, i) =>
    bag.vert(section(i / sides, 1).p, normal, appearance.color, appearance.mat, handWeight));
  for (let i = 0; i < sides; i++) bag.tri(origin, rim[i], rim[(i + 1) % sides]);
}

// Fractions along each phalanx and the local radius of the joint, pad and tip.
const fingerProfile = [[0, 1.05], [.35, 1.02], [.84, .89], [1, 1.01], [1.20, .90],
  [1.78, .81], [2, .89], [2.28, .79], [2.70, .75], [2.89, .61], [2.97, .36], [3, .035]];

function digit(c, place, start, directions, lengths, radius, appearance, fingerless, side, name, closed) {
  const ends = [start];
  directions.forEach((d, i) => ends.push(ends[i].clone().addScaledVector(d, lengths[i])));
  const axis = c.form.arm.seg[1].Z.clone().negate();
  const joints = directions.map((_, j) => c.rig.digit?.(side, name, j, place(ends[j]), axis.clone(), closed) ?? handWeight);
  const rings = fingerProfile.map(([at, width]) => {
    const seg = Math.min(2, Math.floor(at)), f = at - seg;
    const tangent = directions[seg].clone();
    // Bisect each knuckle so the two shafts share one ring around the bend.
    if (seg && f < .32) tangent.lerp(directions[seg - 1], .5 * (1 - f / .32));
    if (seg < 2 && f > .7) tangent.lerp(directions[seg + 1], .5 * (f - .7) / .3);
    tangent.normalize();
    const across = V(1, 0, 0).addScaledVector(tangent, -tangent.x).normalize();
    const dorsal = across.clone().cross(tangent).normalize();
    // At a flexion crease, share the loop between its two phalanges.
    const near = Math.round(at), distance = at - near;
    let weights = joints[seg];
    if (near < 3 && Math.abs(distance) < .32) {
      const blend = .5 + .5 * distance / .32;
      const proximal = near === 0 ? handWeight : joints[near - 1];
      weights = [[proximal[0][0], 1 - blend], [joints[near][0][0], blend]];
    }
    return { weights, centre: ends[seg].clone().lerp(ends[seg + 1], f), across, dorsal, width: radius * width };
  });
  const sides = Math.max(6, Math.round(9 * c.q));
  const surface = (first, last, material) => c.bag.grid(sides, last - first, (u, v) => {
    const row = rings[first + Math.round(v * (last - first))], angle = u * TAU;
    const p = row.centre.clone().addScaledVector(row.across, row.width * Math.sin(angle))
      .addScaledVector(row.dorsal, row.width * .88 * Math.cos(angle));
    const normal = row.across.clone().multiplyScalar(Math.sin(angle)).addScaledVector(row.dorsal, Math.cos(angle) / .88);
    return { p: place(p), n: place(normal).sub(place(V(0, 0, 0))).normalize(), skin: row.weights };
  }, { closeU: true, ...material });
  if (fingerless) {
    surface(0, 3, appearance.glove);
    surface(3, rings.length - 1, appearance.skin);
  } else surface(0, rings.length - 1, appearance.glove || appearance.skin);
}

export function hands(c, { glove = null, fingerless = false, skin = 'skin', fist = 'R', scale = 1, knuckles = null }) {
  const { arm, k } = c.form;
  const seg = arm.seg[1], size = .88 * k * scale;
  const toBind = frame(arm.points[2], seg.Z, seg.along, seg.X);
  const place = p => toBind(p.clone().multiplyScalar(size));
  const appearance = { skin: { color: c.pal(skin), mat: MAT.skin },
    glove: glove && { color: c.pal(glove), mat: MAT.leather } };
  c.bag.part = 'hands';
  for (const side of ['L', 'R']) {
    c.bag.mirror = side === 'R';
    const closed = fist === 'both' || fist === side;
    palm(c, place, appearance.glove || appearance.skin);
    if (knuckles && glove) {
      c.bag.solid(moved(roundBox(.034, .010, .004, .003), V(0, .078, .014)), place, handWeight, c.pal(knuckles), MAT.leather);
    }
    for (let i = 0; i < 4; i++) {
      const length = [.94, 1, .95, .76][i], x = .030 - i * .02;
      const bend = closed ? [1.03, 2.46, 3.76] : [.17, .44, .72];
      const dirs = bend.map(a => V((1.45 - i) * (closed ? .025 : .074),
        Math.cos(a + i * .085), -Math.sin(a + i * .085)).normalize());
      digit(c, place, V(x, [.087, .090, .088, .080][i], .001), dirs,
        [.040, .025, .019].map(v => v * length), .0095 - i * .00048, appearance, glove && fingerless, side, ['index', 'middle', 'ring', 'little'][i], closed);
    }
    const thumb = closed ? [V(.76, .46, -.54), V(.22, .61, -.77), V(-.67, .54, -.51)]
      : [V(.75, .55, -.30), V(.55, .80, -.22), V(.28, .93, -.23)];
    digit(c, place, V(.026, .026, -.003), thumb.map(d => d.normalize()),
      [.026, .024, .019], .0114, appearance, glove && fingerless, side, 'thumb', closed);
  }
  c.bag.mirror = false;
}
