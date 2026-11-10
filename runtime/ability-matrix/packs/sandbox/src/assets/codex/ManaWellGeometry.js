import { RigBuilder, TAU, ngon, star } from './RigKit.js';

/**
 * Mana Well — procedural geometry.
 *
 * A five-lobed sigil funnel: the circle drinks mana and holds it in a star.
 * The hero is the basin: a bowl whose rim swells into five lobes, five
 * petal wards standing on the lobes, and a pentagonal column of drunk
 * mana rising from the middle under a turning sigil ring.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A five-lobed bowl with a rising pentagonal pip. Centred on y = 0, its largest extent one unit. */
export function createManaWellPieceGeometry() {
  const b = new RigBuilder('manawell.piece');
  b.part({ crease: 30 });
  b.lathe([[0.001, -0.15], [0.2, -0.1], [0.34, 0.05], [0.4, 0.2]], 20, { cap: false, jag: (i, j) => 1 + (i >= 2 ? 0.16 * Math.cos((j / 20) * TAU * 5) : 0) });
  b.part({ glow: 0.9, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 1.0, stage: 1 });
  b.at({ p: [0, 0.0, 0] }, () => b.prism(ngon(5, 0.07), 0, 0.5, { taper: 0.4 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A five-lobe basin, five petal wards, a pentagonal column and a sigil ring. */
export function createManaWellHeroGeometry() {
  const b = new RigBuilder('manawell.hero');
  b.fit('ring');
  b.part({ crease: 30, edge: 0.5 });
  b.lathe([[0.1, 0.0], [0.5, 0.05], [0.85, 0.22], [1.0, 0.45]], 40, { cap: false, jag: (i, j) => 1 + (i >= 2 ? 0.14 * Math.cos((j / 40) * TAU * 5) : 0) });
  // Five petal wards standing on the lobes.
  b.ring(5, 0.95, (i) => {
    b.part({ pivot: [0, 0.4, 0], axis: [1, 0, 0], swing: 0.55, stage: 1, delay: (i % 2) * 0.1, glow: 0.35 });
    b.at({ p: [0, 0.4, 0] }, () => b.blade({ len: 0.7, w: 0.17, thick: 0.02, segs: 6 }));
  });
  // The mana column and its turning ring.
  b.part({ glow: 0.9, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 1.2, stage: 1 });
  b.prism(ngon(5, 0.13), 0.02, 1.4, { taper: 0.35 });
  b.part({ edge: 0.9, glow: 0.5, pivot: [0, 1.0, 0], axis: [1, 0, 0], swing: 0.6, stage: 1, delay: 0.1 });
  b.at({ p: [0, 1.0, 0] }, () => b.torus(0.32, 0.02, { segs: 20, sides: 4 }));
  b.at({ p: [0, 1.0, 0], r: [0, 0, 0] }, () => b.prism(star(5, 0.3, 0.16), -0.01, 0.01, {}));
  return b.build();
}
