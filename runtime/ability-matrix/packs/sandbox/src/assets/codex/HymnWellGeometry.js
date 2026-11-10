import { RigBuilder, PI } from './RigKit.js';

/**
 * Hymn Well — procedural geometry.
 *
 * A hymn inhales the circle and lifts what it judges.
 * The hero is the organ: nine pipes of stepped height set in a fan
 * round a wooden rim, each with a cut mouth, leaning outward on the
 * lifting note under a halo that rises above them.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. Three organ pipes of stepped height. Centred on y = 0, its largest extent one unit. */
export function createHymnWellPieceGeometry() {
  const b = new RigBuilder('hymnwell.piece');
  [[-0.14, 0.9], [0, 1.1], [0.14, 0.75]].forEach(([x, h], i) => {
    b.part({ pivot: [x, -0.5, 0], axis: [0, 0, 1], swing: (i - 1) * -0.35, stage: 1, delay: i * 0.08, glow: i === 1 ? 0.35 : 0 });
    b.at({ p: [x, -0.5, 0] }, () => {
      b.lathe([[0.05, 0], [0.05, h], [0.056, h + 0.02]], 8, { cap: false });
      b.at({ p: [0, 0.12, 0.05] }, () => b.box(0.06, 0.05, 0.02, {}));
    });
  });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Nine open pipes with mouths, a foot ring and a rising halo. */
export function createHymnWellHeroGeometry() {
  const b = new RigBuilder('hymnwell.hero');
  b.fit('ring');
  // The foot: a wooden ring the pipes stand in.
  b.part({ edge: 0.7 });
  b.torus(0.78, 0.05, { segs: 36, sides: 6 });
  // Nine pipes, stepped so the fan rises toward the middle.
  b.ring(9, 0.78, (i) => {
    const h = 0.7 + (i % 3) * 0.25 + (i % 2) * 0.1;
    b.part({ pivot: [0, 0, 0], axis: [1, 0, 0], swing: 0.3 + (i % 3) * 0.1, stage: 1, delay: (i % 3) * 0.08, glow: i % 3 === 2 ? 0.4 : 0.1 });
    b.at({ r: [-0.12, 0, 0] }, () => {
      b.lathe([[0.065, 0], [0.065, h], [0.074, h + 0.025]], 10, { cap: false });
      b.at({ p: [0, 0.18, 0.062] }, () => b.box(0.08, 0.08, 0.03, { taper: [1, 0.6] }));
    });
  });
  // The halo that rises above them on the lifting note.
  b.part({ glow: 0.9, pivot: [0.5, 1.3, 0], axis: [0, 0, 1], swing: -0.2, stage: 1 });
  b.at({ p: [0, 1.4, 0] }, () => b.torus(0.5, 0.03, { segs: 32, sides: 5 }));
  b.part({ glow: 0.5 });
  b.at({ p: [0, 1.4, 0] }, () => b.ring(8, 0.5, () => b.at({ r: [PI / 2, 0, 0] }, () => b.blade({ len: 0.16, w: 0.025, thick: 0.01, segs: 3 })), { y: 0 }));
  return b.build();
}
