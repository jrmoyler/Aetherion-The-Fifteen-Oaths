import { RigBuilder } from './RigKit.js';

/**
 * Clangor Cage — procedural geometry.
 *
 * Bars of clangor drop and ring the circle inward.
 * The hero is the carillon: ten tubular bars of descending length hung
 * from a crown ring on cords, each swinging in to strike a central
 * clapper that hangs on its own hinge.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A tubular chime bar hung from a cord with a small striker. Centred on y = 0, its largest extent one unit. */
export function createClangorCagePieceGeometry() {
  const b = new RigBuilder('clangor.piece');
  b.part({ pivot: [0, 0.5, 0], axis: [0, 0, 1], swing: 0.4, stage: 1 });
  b.at({ p: [0, 0.5, 0] }, () => b.tube((t) => [0, -t * 0.2, 0], { r: 0.008, sides: 4, segs: 2 }));
  b.at({ p: [0, -0.5, 0] }, () => b.box(0.1, 0.78, 0.1, {}));
  b.part({ glow: 0.5, pivot: [0, 0.3, 0], axis: [1, 0, 0], swing: -0.7, stage: 1, delay: 0.15 });
  b.at({ p: [0.12, -0.05, 0] }, () => b.orb(0.07, { sides: 6, rings: 3 }));

  // A second, shorter chime on its own cord and a crown ring above.
  b.part({ edge: 0.8 });
  b.at({ p: [0, 0.52, 0] }, () => b.torus(0.12, 0.012, { segs: 12, sides: 4 }));
  b.part({ pivot: [0.12, 0.5, 0], axis: [0, 0, 1], swing: 0.5, stage: 1, delay: 0.1 });
  b.at({ p: [0.12, 0.5, 0] }, () => b.tube((t) => [0, -t * 0.12, 0], { r: 0.007, sides: 4, segs: 2 }));
  b.at({ p: [0.12, -0.18, 0] }, () => b.box(0.07, 0.52, 0.07, { taper: [0.9, 0.9] }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A crown ring, ten hung chime bars, ten cords and a central swinging clapper. */
export function createClangorCageHeroGeometry() {
  const b = new RigBuilder('clangor.hero');
  b.fit('ring');
  // Crown ring the bars hang from.
  b.part({ edge: 0.7 });
  b.at({ p: [0, 1.25, 0] }, () => b.torus(0.95, 0.03, { segs: 40, sides: 5 }));
  // Ten chime bars: lengths step down like a scale.
  b.ring(10, 0.95, (i) => {
    const len = 0.9 - (i % 5) * 0.12;
    b.part({ pivot: [0, 1.25, 0], axis: [1, 0, 0], swing: -0.45, stage: 1, delay: (i % 5) * 0.06, glow: i % 5 === 0 ? 0.3 : 0 });
    b.at({ p: [0, 1.25, 0] }, () => b.tube((t) => [0, -t * 0.1, 0], { r: 0.007, sides: 4, segs: 2 }));
    b.at({ p: [0, 1.15 - len, 0] }, () => b.box(0.09, len, 0.09, { taper: [0.9, 0.9] }));
    b.at({ p: [0, 1.15 - len - 0.03, 0] }, () => b.pyramid(4, 0.05, -0.05, {}));
  });
  // The clapper hangs from the middle of the crown on a chain of three links.
  b.part({ pivot: [0, 1.25, 0], axis: [1, 0, 0], swing: 0.5, stage: 1, delay: 0.2, glow: 0.8 });
  b.at({ p: [0, 1.25, 0] }, () => {
    b.tube((t) => [0, -t * 0.5, 0], { r: 0.012, sides: 4, segs: 6 });
    b.at({ p: [0, -0.62, 0] }, () => b.orb(0.14, { sides: 8, rings: 4, ey: 1.3 }));
  });
  return b.build();
}
