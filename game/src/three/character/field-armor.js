// The common robe is an open field tabard. The common cuirass is a leather
// harness with overlapping plates. Both are cut over the hero's oath costume.
import { buildCostume } from './sheets/costume.js';
import { B } from './sheets/builders-b.js';
import { X } from './sheets/builders-x.js';

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

export function buildFieldArmor(hero, family, rig) {
  const mage = hero.id.endsWith('-sorcerer');
  const tones = hero.palette;
  const palette = {
    field: tones.cloth ?? tones.leather ?? '#56524e',
    binding: tones.leatherDark ?? tones.leather ?? '#4c4039',
    edging: tones.gold ?? tones.copper ?? tones.brass ?? tones.piping ?? '#978267',
    plate: tones.steel ?? tones.iron ?? '#52555a',
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
    parts.push({ use: 'x.plate', at: -24, arc: mage ? 32 : 44, from: ['ribs', -.025], to: ['chest', .033],
      taper: .20, lames: 3, lap: .24, point: .022, bulge: .008, ridge: .006,
      off: .048, thick: .005, color: 'plate', mat: 'steel',
      rim: 'edging', rimMat: 'brass', rimSides: 'b', rimWidth: .0035, rivets: 2, rivet: 'edging' });
  }
  parts.push({ use: 'belt', y: 'belt', rise: .013, tilt: -.015, height: .033,
    buckleSize: [.021, .016], at: 58, off: .039, color: 'binding', buckle: 'edging', keepers: [28, 85, 150] });
  return buildCostume({ ...hero, palette, parts, builders: { ...B, ...X } }, rig, 'medium');
}
