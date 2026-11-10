import { RigBuilder, PI, lerp, helixPath } from './RigKit.js';

/**
 * Moment Swing — procedural geometry.
 *
 * A weighted hammer swing: the moment is the whole point.
 * The hero is the hammer: a long ash haft, a massive bevelled head, a
 * counterweight on the butt, and a pair of thin dimension lines marking
 * the lever arm. The head drops forward on its hinge as the moment
 * builds.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A short haft with a bevelled head. Centred on y = 0, its largest extent one unit. */
export function createMomentSwingPieceGeometry() {
  const b = new RigBuilder('moment.piece');
  b.part({ edge: 0.8 });
  b.lathe([[0.04, -0.5], [0.03, 0], [0.03, 0.5]], 6, {});
  b.part({ glow: 0.5, pivot: [0, 0.4, 0], axis: [0, 0, 1], swing: -0.45, stage: 1 });
  b.at({ p: [0, 0.4, 0] }, () => b.box(0.34, 0.2, 0.18, { center: true, taper: [0.85, 0.85] }));
  b.part({ glow: 0.2 });
  b.at({ p: [0, -0.5, 0] }, () => b.orb(0.07, { sides: 6, rings: 3 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A haft, a bevelled head, a counterweight and two dimension lines. */
export function createMomentSwingHeroGeometry() {
  const b = new RigBuilder('moment.hero');
  b.fit('mass');
  // Haft along +Z from the hand.
  b.part({ edge: 0.8 });
  b.at({ r: [PI / 2, 0, 0] }, () => b.lathe([[0.07, -0.2], [0.045, 0.0], [0.04, 1.2], [0.06, 1.35]], 8, {}));
  // Counterweight on the butt.
  b.part({ glow: 0.2 });
  b.at({ p: [0, 0, -0.3] }, () => b.orb(0.1, { sides: 8, rings: 4 }));
  // The head, dropping forward on its hinge.
  b.part({ glow: 0.6, pivot: [0, 0, 1.2], axis: [1, 0, 0], swing: 0.45, stage: 1 });
  b.at({ p: [0, 0, 1.38] }, () => {
    b.box(0.62, 0.34, 0.4, { center: true, taper: [0.88, 0.88] });
    b.at({ p: [0, 0.18, 0] }, () => b.box(0.54, 0.06, 0.34, { taper: [0.9, 0.9] }));
  });
  // Two thin dimension lines marking the lever arm.
  b.part({ edge: 0.5, glow: 0.3 });
  b.tube((t) => [0.45, 0.4, lerp(0, 1.38, t)], { r: 0.006, sides: 3, segs: 2 });
  [0, 1.38].forEach((z) => b.at({ p: [0.45, 0.4, z], r: [0, 0, 0] }, () => b.box(0.01, 0.2, 0.01, { center: true })));
  b.at({ p: [0.45, 0.4, 1.38], r: [PI / 2, 0, 0] }, () => b.pyramid(3, 0.03, -0.1, {}));

  // Grip rings and a spiral wrap down the haft.
  b.part({ edge: 0.7 });
  for (let i = 0; i < 6; i++) b.at({ p: [0, 0, 0.1 + i * 0.17] }, () => b.torus(0.052, 0.01, { segs: 10, sides: 4 }));
  b.part({ crease: 30, edge: 0.2 });
  b.aimZ(() => b.tube(helixPath(0.05, 0.05, 7, 1.0, 0.1), { r: 0.008, sides: 3, segs: 50 }));
  // Strike faces, a peen and band plates on the head, folding with it.
  const head = { pivot: [0, 0, 1.2], axis: [1, 0, 0], swing: 0.45, stage: 1 };
  b.part({ ...head, glow: 0.9 });
  [-1, 1].forEach((s) => b.at({ p: [s * 0.34, 0, 1.38], r: [0, 0, -s * PI / 2] }, () => b.cylinder(0.15, 0.09, 10, { r1: 0.11 })));
  b.part({ ...head, edge: 0.9 });
  b.at({ p: [0, 0.2, 1.38] }, () => b.pyramid(4, 0.17, 0.2, { phase: PI / 4 }));
  [-0.18, 0.18].forEach((z) => b.at({ p: [0, 0, 1.38 + z] }, () => b.box(0.66, 0.38, 0.03, { center: true })));
  return b.build();
}
