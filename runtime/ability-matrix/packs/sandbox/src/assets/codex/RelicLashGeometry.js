import { RigBuilder, PI } from './RigKit.js';

/**
 * Relic Lash — procedural geometry.
 *
 * A relic chain lashes the line and brands what it crosses.
 * The hero is the chain: fourteen interlocked links in a running curve,
 * each turned ninety degrees from the last and flexing alternately as the
 * lash cracks, ending in a reliquary that carries the brand.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. Three interlocked chain links. Centred on y = 0, its largest extent one unit. */
export function createRelicLashPieceGeometry() {
  const b = new RigBuilder('reliclash.piece');
  for (let i = 0; i < 3; i++) {
    b.part({ pivot: [0, -0.3 + i * 0.3, 0], axis: [0, 0, 1], swing: (i - 1) * 0.5, stage: 1, delay: i * 0.1, glow: i === 2 ? 0.4 : 0 });
    b.at({ p: [0, -0.3 + i * 0.3, 0], r: [0, (i % 2) * PI / 2, 0], s: [1, 1.7, 1] }, () => b.at({ r: [PI / 2, 0, 0] }, () => b.torus(0.1, 0.028, { segs: 10, sides: 5 })));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Fourteen alternating links on an S curve and a cross-topped reliquary. */
export function createRelicLashHeroGeometry() {
  const b = new RigBuilder('reliclash.hero');
  b.fit('mass');
  const bend = (t) => 0.22 * Math.sin(t * 5.5);
  for (let i = 0; i < 14; i++) {
    const t = i / 14;
    const z = t * 1.7;
    const dx = (bend(t + 0.01) - bend(t)) / (0.01 * 1.7);
    b.part({ pivot: [bend(t), 0.5, z], axis: [0, 1, 0], swing: (i % 2 ? -1 : 1) * 0.22, stage: 1, delay: t * 0.4, glow: i > 10 ? 0.35 : 0 });
    b.at({ p: [bend(t), 0.5, z], r: [0, Math.atan2(dx, 1), (i % 2) * PI / 2], s: [1, 1, 1.75] }, () => b.torus(0.075, 0.017, { segs: 10, sides: 5 }));
  }
  // Reliquary at the end of the chain: a small spired casket.
  b.part({ glow: 0.9, pivot: [bend(1), 0.5, 1.7], axis: [0, 1, 0], swing: 0.3, stage: 1, delay: 0.4 });
  b.at({ p: [bend(1), 0.5, 1.82] }, () => {
    b.at({ p: [0, -0.09, -0.12], r: [PI / 2, 0, 0] }, () => b.box(0.14, 0.24, 0.14, { taper: [0.9, 0.9] }));
    b.at({ p: [0, 0.01, 0.12], r: [PI / 2, 0, 0] }, () => b.pyramid(4, 0.1, 0.16, { phase: PI / 4 }));
  });
  b.part({ glow: 1 });
  b.at({ p: [bend(1), 0.5, 2.1] }, () => {
    b.box(0.03, 0.2, 0.03, { center: true });
    b.at({ p: [0, 0.03, 0] }, () => b.box(0.14, 0.03, 0.03, { center: true }));
  });
  return b.build();
}
