import { RigBuilder, PI, rng } from './RigKit.js';

/**
 * Loess Curtain — procedural geometry.
 *
 * A curtain of loess snaps sideways and buries the line.
 * The hero is the curtain: nine fluted drapes hung from a lintel,
 * each eroded to a different hourglass and hinged at the top so the
 * whole sheet can shear.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A three-lobed scalloped flap with eroded teeth along its hem. Centred on y = 0, its largest extent one unit. */
export function createLoessCurtainPieceGeometry() {
  const b = new RigBuilder('loess.piece');
  const rand = rng(31);
  b.part({ pivot: [0, 0.5, 0], axis: [0, 0, 1], swing: 0.4, stage: 1 });
  b.at({ p: [0, 0.5, 0] }, () => b.box(0.5, 0.08, 0.1, { center: true }));
  for (let i = 0; i < 3; i++) {
    b.part({ pivot: [(i - 1) * 0.16, 0.45, 0], axis: [0, 0, 1], swing: (i - 1) * 0.5, stage: 1, delay: i * 0.1 });
    b.at({ p: [(i - 1) * 0.16, 0.45, 0], r: [PI, 0, 0] }, () => b.lathe([[0.09, 0], [0.06, 0.2], [0.11, 0.42], [0.04, 0.7 + rand() * 0.2]], 6, {}));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Nine hung flutes on a lintel, a ragged hem of drip cones and a dust skirt. */
export function createLoessCurtainHeroGeometry() {
  const b = new RigBuilder('loess.hero');
  b.fit('mass');
  const rand = rng(33);
  // Lintel along the side axis.
  b.part();
  b.at({ p: [0, 1.05, 0], r: [0, 0, PI / 2] }, () => b.cylinder(0.07, 2.2, 6, { r1: 0.07 }));
  b.at({ p: [-1.1, 1.05, 0] }, () => b.orb(0.1, { sides: 6, rings: 3 }));
  b.at({ p: [1.1, 1.05, 0] }, () => b.orb(0.1, { sides: 6, rings: 3 }));
  // Nine flutes, hung and inverted, each with its own erosion.
  for (let i = 0; i < 9; i++) {
    const x = (i - 4) * 0.25;
    b.part({ pivot: [x, 1.05, 0], axis: [0, 0, 1], swing: (i - 4) * 0.09, stage: 1, delay: Math.abs(i - 4) * 0.05, glow: i % 4 === 0 ? 0.25 : 0 });
    b.at({ p: [x, 1.05, (rand() - 0.5) * 0.06], r: [PI, 0, 0] }, () =>
      b.lathe([[0.09, 0], [0.06 + rand() * 0.02, 0.22], [0.13, 0.46], [0.05 + rand() * 0.03, 0.7], [0.11, 0.92], [0.02, 1.0 + rand() * 0.1]], 7, { jag: (k, j) => 1 + (j % 2 ? 0.1 : -0.06) }));
  }
  // Dust skirt: low ragged dunes at the foot.
  b.part();
  for (let i = 0; i < 6; i++) {
    b.at({ p: [(i - 2.5) * 0.4, 0, (rand() - 0.5) * 0.3], r: [0, rand() * 3, 0] }, () => b.lathe([[0.22, 0], [0.16, 0.06], [0.05, 0.12], [0, 0.14]], 6, { ez: 0.6 }));
  }
  return b.build();
}
