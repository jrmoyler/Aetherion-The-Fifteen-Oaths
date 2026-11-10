import { RigBuilder, PI, TAU } from './RigKit.js';

/**
 * Orbit Pendulum — procedural geometry.
 *
 * An orbital mace crescent: a weight on a stick with a moon of its own.
 * The hero is the mace: a long haft from the hand ending in a heavy head,
 * a tilted orbit ring round the head and three satellites that run round
 * it when the pendulum swings through.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A stub haft, a head ball and one satellite on an orbit ring. Centred on y = 0, its largest extent one unit. */
export function createOrbitPendulumPieceGeometry() {
  const b = new RigBuilder('orbitpendulum.piece');
  b.part();
  b.lathe([[0.03, -0.5], [0.03, 0.2]], 6, {});
  b.part({ glow: 0.4 });
  b.at({ p: [0, 0.32, 0] }, () => b.orb(0.14, { sides: 8, rings: 4 }));
  b.part({ edge: 0.8, pivot: [0, 0.32, 0], axis: [1, 0, 0], swing: 0.6, stage: 1 });
  b.at({ p: [0, 0.32, 0], r: [0.4, 0, 0.3] }, () => b.torus(0.27, 0.012, { segs: 18, sides: 4 }));
  b.part({ glow: 1, pivot: [0, 0.32, 0], axis: [0, 1, 0], swing: 1.8, stage: 1 });
  b.at({ p: [0.27, 0.32, 0] }, () => b.orb(0.04, { sides: 5, rings: 3 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A haft, a banded head, a tilted orbit ring and three satellites. */
export function createOrbitPendulumHeroGeometry() {
  const b = new RigBuilder('orbitpendulum.hero');
  b.fit('mass');
  // Haft from the hand.
  b.part({ edge: 0.7 });
  b.at({ r: [PI / 2, 0, 0] }, () => b.lathe([[0.06, -0.15], [0.04, 0.0], [0.035, 1.05], [0.05, 1.1]], 8, {}));
  // The head: a heavy ball with two bands.
  b.part({ glow: 0.35 });
  b.at({ p: [0, 0, 1.3] }, () => b.orb(0.22, { sides: 10, rings: 5 }));
  b.part({ edge: 0.9 });
  [-0.1, 0.1].forEach((y) => b.at({ p: [0, y, 1.3] }, () => b.torus(0.2, 0.018, { segs: 22, sides: 4 })));
  // The orbit ring, tilted, with three satellites running round it.
  b.part({ edge: 0.8, glow: 0.2, pivot: [0, 0, 1.3], axis: [1, 0, 0], swing: 0.7, stage: 1 });
  b.at({ p: [0, 0, 1.3], r: [0.5, 0, 0.35] }, () => b.torus(0.48, 0.016, { segs: 36, sides: 4 }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    b.part({ glow: 1, pivot: [0, 0, 1.3], axis: [0.5, 1, 0.3], swing: 2.0 + i * 0.5, stage: 1, delay: i * 0.05 });
    b.at({ p: [0, 0, 1.3], r: [0.5, 0, 0.35] }, () => b.at({ p: [Math.cos(a) * 0.48, 0, Math.sin(a) * 0.48] }, () => b.orb(0.06, { sides: 6, rings: 3 })));
  }
  return b.build();
}
