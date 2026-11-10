import { RigBuilder, PI } from './RigKit.js';

/**
 * Subtone Lance — procedural geometry.
 *
 * A held subtone drills the line as a visible bore.
 * The hero is the bore: a hollow barrel with nine compression rings
 * stacked along it, each wobbling out of phase as the note builds, and a
 * flared speaker cone behind.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. Three compression rings stacked on a hollow core, each tilting out of phase. Centred on y = 0, its largest extent one unit. */
export function createSubtoneLancePieceGeometry() {
  const b = new RigBuilder('subtone.piece');
  b.part({ edge: 0.6 });
  b.cylinder(0.07, 1, 8, { r1: 0.07, cap: false });
  for (let i = 0; i < 3; i++) {
    b.part({ pivot: [0, 0.2 + i * 0.3, 0], axis: [1, 0, 0], swing: (i % 2 ? -1 : 1) * 0.5, stage: 1, delay: i * 0.1, glow: i === 1 ? 0.4 : 0 });
    b.at({ p: [0, 0.2 + i * 0.3, 0] }, () => b.torus(0.2 + i * 0.07, 0.022, { segs: 16, sides: 5 }));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A hollow barrel, nine wobbling compression rings and a flared rear cone. */
export function createSubtoneLanceHeroGeometry() {
  const b = new RigBuilder('subtone.hero');
  b.fit('mass');
  b.aimZ(() => {
    // The barrel: an open bore you can see through.
    b.part({ edge: 0.7 });
    b.lathe([[0.1, 0], [0.1, 0.4], [0.075, 0.9], [0.06, 1.5]], 10, { cap: false });
    // Compression rings, widest at the mouth, each wobbling out of phase.
    for (let i = 0; i < 9; i++) {
      const y = 0.1 + i * 0.16;
      b.part({ pivot: [0, y, 0], axis: [Math.cos(i * 0.9), 0, Math.sin(i * 0.9)], swing: (i % 2 ? -1 : 1) * 0.35, stage: 1, delay: i * 0.05, glow: i % 3 === 0 ? 0.35 : 0, edge: 0.9 });
      b.at({ p: [0, y, 0] }, () => b.torus(0.2 + 0.11 * Math.sin((i / 8) * PI) + 0.03, 0.02, { segs: 20, sides: 5 }));
    }
    // The speaker cone behind: a flared bell.
    b.part({ glow: 0.4 });
    b.lathe([[0.1, 0], [0.16, -0.08], [0.3, -0.2], [0.46, -0.36]], 14, { cap: false });
  });
  return b.build();
}
