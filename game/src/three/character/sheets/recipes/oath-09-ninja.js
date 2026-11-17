// 09 NINJA - LIGHT & HOLY - Oath of Daybreak. Read from assets/references/reference-075 (front, back, side,
// three-quarter, face, materials: folded enamel, grey cloth, brushed gold; shoulder wing hinge and visor rear
// fastener).
import { A } from '../builders-a.js';
import { B } from '../builders-b.js';
import { X } from '../builders-x.js';
import { MAT, V, dome, frame, lerp } from '../kernel.js';

// Sheet 075 shows a folded enamel fan with a short leaf beneath the raised
// one. Model the creases as separate planes sharing their actual endpoints.
function shoulderWing(c) {
  const { k, J } = c.form, root = J['upperarm.L'];
  const weights = [['shoulder.L', .7], ['spine2', .3]];
  const at = (x, y, z) => V((x * 1.30 - .008) * k, (y * 1.32 + .040) * k, (z * 1.2 + .018) * k).add(root);
  const hinge = at(.005, .014, .066), rearHinge = at(.003, .021, -.066);
  function facet(a, b, d, colour, material) {
    const normal = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
    const [ia, ib, id] = [a, b, d].map(p => c.bag.vert(p, normal, colour, material, weights));
    c.bag.tri(ia, ib, id);
  }
  function leaf(tip, crest, base, back, shade) {
    const ivory = c.pal('ivory'), shadow = c.pal('ivoryShade'), gold = c.pal('gold');
    facet(hinge, tip, crest, ivory, MAT.enamel);
    facet(crest, tip, rearHinge, shadow, MAT.enamel);
    facet(hinge, crest, base, shadow, MAT.enamel);
    facet(base, crest, rearHinge, ivory, MAT.enamel);
    facet(base, rearHinge, back, shade, MAT.enamel);
    facet(hinge, base, back, shade, MAT.enamel);
    facet(hinge, back, tip, shadow, MAT.enamel);
    facet(back, rearHinge, tip, shade, MAT.enamel);
    // Folded lip, burnished on the edge seen from behind the wearer.
    const rim = rearHinge.clone().lerp(crest, .09);
    facet(rearHinge, tip, rim, gold, MAT.gold);
  }
  leaf(at(.124, .081, -.047), at(.050, .087, .040), at(-.011, .058, -.014), at(.055, .035, -.025), c.pal('ivoryShade'));
  leaf(at(.111, -.066, -.055), at(.051, -.020, .036), at(.004, -.03, -.032), at(.044, -.026, -.038), c.pal('ivoryShade'));
  for (const z of [-.069, .069]) {
    const pin = at(.005, .015, z);
    c.bag.solid(dome(.014 * k, .006 * k, 10), frame(pin, V(1, 0, 0), V(0, Math.sign(z), 0)), weights, c.pal('gold'), MAT.gold);
  }
}

// On the reference the white ankle shell rises on both sides of a deep V.
// A separate hinged tongue follows the slope of the instep to the toe seam.
function anklePlates(c) {
  const { leg, foot, k } = c.form;
  const ivory = c.pal('ivory'), gold = c.pal('gold');
  const legCentre = leg.centre(1.83), footCentre = foot.at(0, .04 * k, .07 * k);
  for (const right of [false, true]) {
    c.bag.mirror = right;
    const sheet = (at, uSteps, vSteps, color, mat, inside) => {
      c.bag.grid(uSteps, vSteps, (u, v) => {
        const p = at(2 * u - 1, v); return { p, skin: foot.skin(p) };
      }, { color, mat, inside });
    };
    const cuff = (u, v, rise = 0) => {
      const t = lerp(1.84 - .19 * Math.abs(u), 2.00 - .045 * Math.abs(u), v);
      const angle = u * lerp(1.69, 1.13, v);
      return leg.point(t, angle, leg.radius(t) + k * (.014 + .004 * (1 - Math.abs(u)) + rise));
    };
    sheet(cuff, 12, 5, ivory, MAT.enamel, legCentre);
    sheet((u, v) => cuff(u, v * .055, .0015), 12, 1, gold, MAT.gold, legCentre);
    for (const sign of [-1, 1]) {
      sheet((u, v) => cuff(sign * (.93 + .035 * (u + 1)), v, .0015), 1, 5, gold, MAT.gold, legCentre);
    }
    const tongue = (u, v, rise = 0) => {
      const z = lerp(.033, .145, v) * k, width = lerp(.027, .018, v) * k;
      const y = foot.ankle.y * (1 - v) + .077 * k * v + k * (.014 + .006 * (1 - Math.abs(u)) + rise);
      return foot.at(u * width, y - .005 * k * u * u, z);
    };
    sheet(tongue, 6, 5, ivory, MAT.enamel, footCentre);
    for (const sign of [-1, 1]) sheet((u, v) => tongue(sign * (.79 + .105 * (u + 1)), v, .0018),
      2, 5, gold, MAT.gold, footCentre);
    sheet((u, v) => tongue(u, .94 + v * .06, .0018), 6, 1, gold, MAT.gold, footCentre);
  }
  c.bag.mirror = false;
}

export default {
  id: 'oath-09-ninja', sheet: 'reference-075', title: 'Daybreak Ninja',
  palette: {
    grey: '#565554', greyDark: '#454444', cloth: '#565554', ivory: '#d9d0bc', ivoryShade: '#b9b09c', gold: '#b08a3e', leather: '#4a4644', leatherDark: '#343231',
    iron: '#b08a3e', boot: '#373432', sole: '#252323', hair: '#1a1513', hairLight: '#2c231e',
  },
  build: { width: 1.0, depth: .98, hips: 1.12, waist: .84, seat: 1.1, bust: .034, arm: .88, leg: 1.02, thigh: 1.1, neck: .9, shoulder: .96 },
  keep: ['weapon'],
  builders: { ...B, ...X, ...A, shoulderWing, anklePlates },
  groom: { hair: false, gear: false, beard: false },
  parts: [
    { use: 'x.physique', part: 'arm', from: -.2, to: 1.0, power: 1.0 },
    { use: 'b.neck', color: 'grey', mat: 'cloth', off: .003 },
    { use: 'b.legs', color: 'grey', to: 1.9, off: .006 },
    { use: 'a/lines', on: 'leg', name: 'legging-seams', color: 'greyDark', off: .008, width: .005, thick: .001,
      paths: [[[86, .26], [53, .53], [27, .79], [-2, .94], [-35, 1.09]],
        [[-35, 1.09], [2, .93], [31, 1.1], [70, 1.42], [86, 1.78]]] },
    { use: 'boots', top: 1.74, color: 'boot', sole: 'sole', straps: 0 },
    { use: 'anklePlates' },
    // Sleeveless grey top, high ivory collar, the ivory sash from the left shoulder, wound waist.
    { use: 'b.torso', from: ['belt', -.03], to: 'base', color: 'grey', off: .006 },
    { use: 'b.collar', color: 'ivory', lining: 'ivoryShade', height: .05, gap: 44, flare: .008, off: .008 },
    { use: 'b.strip', color: 'ivory', mat: 'cloth', width: .103, thick: .005, closed: true, n: 70, path: [
      { th: 62, y: ['shoulder', .01], off: .01 }, { th: 20, y: ['chest', .01], off: .012 }, { th: -58, y: ['ribs', -.01], off: .011 }, { th: -150, y: ['ribs', .02], off: .011 }, { th: -214, y: ['chest', .03], off: .011 }, { th: -262, y: ['armpit', .05], off: .01 } ] },
    { use: 'b.sash', color: 'ivory', bands: [
      { y: ['waist', .035], h: .034, tilt: .016, phase: 0, off: .01 }, { y: ['waist', -.005], h: .034, tilt: -.018, phase: 20, off: .012, color: 'ivoryShade' }, { y: ['belt', .025], h: .04, tilt: .01, phase: 60, off: .011, color: 'greyDark' } ] },
    // Enamel tassets edged in gold, grey loincloth points between them.
    { use: 'b.hang', at: 0, top: ['belt', .0], bottom: .8, width: [.04, .02], point: .08, color: 'greyDark', off: .008 },
    { use: 'b.hang', at: 180, top: ['belt', .0], bottom: .84, width: [.05, .03], point: .05, color: 'ivoryShade', off: .008 },
    { use: 'x.plate', at: 46, arc: 31, from: .88, to: ['belt', .01], hangs: true, taper: -.22, flare: .045, point: .17, skew: -0.5, off: .006, thick: .007, ridge: .014, color: 'ivory', mat: 'enamel', rim: 'gold', rimMat: 'gold', rimWidth: .008, rimSides: 'blr' },
    { use: 'x.plate', at: -46, arc: 31, from: .88, to: ['belt', .01], hangs: true, taper: -.22, flare: .045, point: .17, skew: 0.5, off: .006, thick: .007, ridge: .014, color: 'ivory', mat: 'enamel', rim: 'gold', rimMat: 'gold', rimWidth: .008, rimSides: 'blr' },
    { use: 'x.plate', at: 134, arc: 29, from: .88, to: ['belt', .01], hangs: true, taper: -.22, flare: .045, point: .17, skew: 0.5, off: .006, thick: .007, ridge: .014, color: 'ivory', mat: 'enamel', rim: 'gold', rimMat: 'gold', rimWidth: .008, rimSides: 'blr' },
    { use: 'x.plate', at: -134, arc: 29, from: .88, to: ['belt', .01], hangs: true, taper: -.22, flare: .045, point: .17, skew: -0.5, off: .006, thick: .007, ridge: .014, color: 'ivory', mat: 'enamel', rim: 'gold', rimMat: 'gold', rimWidth: .008, rimSides: 'blr' },
    // Folded enamel wing on the left shoulder with its gold hinge.
    { use: 'shoulderWing' },
    // Arms: gold armlets, grey sleeves from the elbow, enamel vambraces, gold wrist rings.
    { use: 'band', limb: 'arm', at: .78, width: .022, off: .002, thick: .004, color: 'gold', mat: 'iron', trim: 'ivory' },
    { use: 'b.sleeve', from: .92, to: 2.04, color: 'grey', off: .004, hem: false },
    { use: 'b.guard', limb: 'arm', from: 1.2, to: 1.86, phi: 90, arc: 80, off: .008, thick: .008, pointTop: .16, point: .04, ridge: .006, flare: .008, color: 'ivory', mat: 'enamel', trim: 'gold', trimMat: 'gold', trimWidth: .007 },
    { use: 'band', limb: 'arm', at: 1.93, width: .016, off: .006, thick: .004, color: 'gold', mat: 'iron' },
    { use: 'hair', style: 'twists', rows: 16, streak: 'hairLight', fringe: .35, knot: { at: [0, .52, -.1], radius: .2 }, tendrils: [[52, .27, .3, .03, .02], [-52, .27, .3, .03, .02]] },
    { use: 'b.headBand', y: .33, from: 0, to: 360, width: .03, off: .03, thick: .008, color: 'gold', mat: 'gold' },
    { use: 'b.visor', top: .2, eye: -.06, half: 50 },
    { use: 'hands', glove: 'grey', fingerless: true },
  ],
};
