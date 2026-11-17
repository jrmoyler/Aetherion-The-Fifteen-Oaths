// The common robe is an open field tabard. The common cuirass is a leather
// harness with overlapping plates. Both are cut over the hero's oath costume.
import { buildCostume } from './sheets/costume.js';
import { B } from './sheets/builders-b.js';
import { dome, MAT, TAU } from './sheets/kernel.js';

const shoulderPath = [
  { th: -68, y: 'shoulder', off: .021 },
  { th: -32, y: 'chest', off: .031 },
  { th: 18, y: 'ribs', off: .034 },
  { th: 68, y: 'belt', off: .031 },
  { th: 118, y: 'belt', off: .031 },
  { th: 168, y: 'ribs', off: .034 },
  { th: 219, y: 'chest', off: .031 },
  { th: 256, y: 'shoulder', off: .021 },
];

// Three individually crowned leaves follow the baldric from ribs to shoulder.
// Their rolled rims and rivet heads are separate geometry in the same draw.
function brigandine(c, { mage }) {
  const { trunk, k } = c.form;
  const field = c.pal('plate'), trim = c.pal('edging');
  const patina = [.53, .30, 8], edge = [.46, .38, 8];
  for (let row = 0; row < 3; row++) {
    const y = trunk.Y.chest + (row - 1.6) * .036 * k;
    const angle = (-20 - 12 * row) * Math.PI / 180;
    const width = (.055 + .009 * row) * k * (mage ? .88 : 1);
    const height = (.025 + .003 * row) * k;
    const radius = trunk.rho(y, angle);
    const at = (x, h, lift) => trunk.at(y + h - .24 * x,
      angle + (x - .18 * h) / radius, (.040 + .002 * row) * k + lift);
    const rings = [[0, .008], [.38, .007], [.74, .005], [.90, .003],
      [.95, .004], [1, .002], [1, -.002]];
    const inside = c.rig.J.spine2;
    for (const [first, last, color, mat] of [[0, 3, field, patina], [3, 6, trim, edge]]) {
      c.bag.grid(26, last - first, (u, v) => {
        const [r, lift] = rings[first + Math.round((last - first) * v)];
        const a = u * TAU, sn = Math.sin(a), cs = Math.cos(a);
        const x = cs * width * r * (.93 + .07 * sn);
        // The outer corners turn up and the lower edge falls to a shallow point.
        const h = height * r * (sn + .30 * cs * cs - .13 * Math.max(0, -sn) ** 5);
        const p = at(x, h, lift * k);
        return { p, skin: trunk.skin(p) };
      }, { closeU: true, color, mat, inside });
    }
    for (const side of [-1, 1]) {
      const mount = (p) => at(side * width * .70 + p.x, .001 * k + p.y, .0055 * k + p.z);
      c.bag.solid(dome(.0038 * k, .0022 * k, 8), mount, (p) => trunk.skin(p), trim, MAT.brass);
    }
  }
}

export function buildFieldArmor(hero, family, rig) {
  const mage = hero.id.endsWith('-sorcerer');
  const tones = hero.palette;
  const palette = {
    field: tones.cloth ?? tones.leather ?? '#56524e',
    binding: tones.leatherDark ?? tones.leather ?? '#4c4039',
    edging: tones.gold ?? tones.copper ?? tones.brass ?? tones.piping ?? '#978267',
    plate: tones.ivoryShade ?? tones.steel ?? tones.ceramic ?? '#8a8275',
  };
  const parts = [
    { use: 'b.strip', path: shoulderPath, closed: true, width: mage ? .073 : .053,
      color: family === 'robe' ? 'field' : 'binding', mat: family === 'robe' ? 'cloth' : 'leather',
      thick: .005, border: 'edging', studs: family === 'robe' ? 0 : 5, stud: 'edging' },
  ];
  if (family === 'robe') {
    // Leave the sword side open. The longer caster's back panel swings from
    // the pelvis and has the same leg-clearance response as the base clothing.
    for (const at of [50, 148]) {
      parts.push({ use: 'b.hang', at, top: ['belt', .020], bottom: mage ? .51 : .78,
        width: [.045, mage ? .077 : .051], point: .045, skew: at === 50 ? -.38 : .30,
        flare: mage ? 1.28 : 1.10, lean: mage ? .028 : .012, off: .038, thick: .004,
        color: 'field', border: 'edging', borderWidth: .004, stripe: { color: 'binding', n: 2, width: .08 } });
    }
  } else {
    parts.push({ use: 'brigandine', mage });
  }
  parts.push({ use: 'belt', y: 'belt', rise: .013, tilt: -.015, height: .033,
    buckleSize: [.021, .016], at: 58, off: .039, color: 'binding', buckle: 'edging', keepers: [28, 85, 150] });
  return buildCostume({ ...hero, palette, parts, builders: { ...B, brigandine } }, rig, 'medium');
}
