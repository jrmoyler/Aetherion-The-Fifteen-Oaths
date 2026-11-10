import { RigBuilder, PI } from './RigKit.js';

/**
 * Chrono Well — procedural geometry.
 *
 * An hourglass temporal throat: the well keeps the time it drinks.
 * The hero is the glass: a huge hourglass whose two bulbs, sand and
 * frame turn end over end together on the beat, standing in a ring of
 * twelve hour ticks that never turn.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A tiny hourglass in a two-post frame that flips on the beat. Centred on y = 0, its largest extent one unit. */
export function createChronoWellPieceGeometry() {
  const b = new RigBuilder('chronowell.piece');
  b.part({ glow: 0.4, crease: 25, pivot: [0, 0, 0], axis: [1, 0, 0], swing: PI, stage: 1 });
  b.lathe([[0.001, -0.5], [0.2, -0.46], [0.22, -0.22], [0.03, 0], [0.22, 0.22], [0.2, 0.46], [0.001, 0.5]], 10, {});
  b.part({ glow: 1, pivot: [0, 0, 0], axis: [1, 0, 0], swing: PI, stage: 1 });
  b.lathe([[0.17, -0.44], [0.08, -0.3], [0.001, -0.22]], 8, {});
  b.part({ edge: 0.9, pivot: [0, 0, 0], axis: [1, 0, 0], swing: PI, stage: 1 });
  [-0.5, 0.5].forEach((y) => b.at({ p: [0, y, 0] }, () => b.cylinder(0.22, 0.03, 10, {})));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Two glass bulbs, a sand cone, four frame posts, two plates and a twelve-tick ring. */
export function createChronoWellHeroGeometry() {
  const b = new RigBuilder('chronowell.hero');
  b.fit('ring');
  // Twelve ticks that never turn.
  b.part({ edge: 0.8 });
  b.torus(1, 0.02, { segs: 48, sides: 4 });
  b.ring(12, 1.0, (i) => b.box(i % 3 === 0 ? 0.05 : 0.03, i % 3 === 0 ? 0.3 : 0.18, 0.04, {}));
  // The glass, with everything that turns with it, flipped end over end.
  const flip = { pivot: [0, 0.8, 0], axis: [1, 0, 0], swing: PI, stage: 1 };
  b.part({ ...flip, crease: 25, glow: 0.35 });
  b.at({ p: [0, 0.8, 0] }, () => b.lathe([[0.001, -0.75], [0.4, -0.7], [0.44, -0.4], [0.06, 0], [0.44, 0.4], [0.4, 0.7], [0.001, 0.75]], 24, {}));
  b.part({ ...flip, glow: 1 });
  b.at({ p: [0, 0.8, 0] }, () => b.lathe([[0.36, -0.68], [0.2, -0.5], [0.08, -0.34], [0.001, -0.22]], 16, {}));
  b.part({ ...flip, edge: 0.9 });
  b.at({ p: [0, 0.8, 0] }, () => {
    [-0.76, 0.76].forEach((y) => b.at({ p: [0, y, 0] }, () => b.cylinder(0.46, 0.04, 14, {})));
    b.ring(4, 0.46, () => b.at({ p: [0, -0.76, 0] }, () => b.cylinder(0.025, 1.52, 5, {})));
  });
  return b.build();
}
