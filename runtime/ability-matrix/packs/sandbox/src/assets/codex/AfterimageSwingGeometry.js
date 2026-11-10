import { RigBuilder } from './RigKit.js';

/**
 * Afterimage Swing — procedural geometry.
 *
 * An offset echo blade: the swing, and where the swing just was.
 * The hero is the swing: a bright main blade hinged at the hand with
 * three thinner echoes trailing at widening angles, each echo a shade
 * behind the one before it, closing up on the blade as the cut lands.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A blade with two thinner echoes behind it. Centred on y = 0, its largest extent one unit. */
export function createAfterimageSwingPieceGeometry() {
  const b = new RigBuilder('afterimage.piece');
  b.part({ glow: 0.5 });
  b.blade({ len: 1, w: 0.1, thick: 0.02, segs: 8, bend: 0.1 });
  [1, 2].forEach((k) => {
    b.part({ edge: 0.5, pivot: [0, -0.1, 0], axis: [0, 0, 1], swing: 0.22 * k, stage: 1, delay: k * 0.08 });
    b.at({ p: [-0.07 * k, -0.04 * k, -0.02 * k], r: [0, 0, 0.12 * k] }, () => b.blade({ len: 0.9 - k * 0.08, w: 0.07, thick: 0.012, segs: 6, bend: 0.1 }));
  });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A main blade, three trailing echoes, a hilt and a hand-hinge ring. */
export function createAfterimageSwingHeroGeometry() {
  const b = new RigBuilder('afterimage.hero');
  b.fit('mass');
  // The main blade, in the cast plane.
  b.part({ glow: 0.4 });
  b.aimZ(() => b.blade({ len: 1.5, w: 0.14, thick: 0.03, segs: 12, bend: -0.12 }));
  // Echoes trailing at widening angles, each thinner and dimmer.
  [1, 2, 3].forEach((k) => {
    b.part({ edge: 0.5, glow: 0.2 / k, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 0.2 * k, stage: 1, delay: k * 0.07 });
    b.at({ r: [0, -0.22 * k, 0] }, () => b.aimZ(() => b.blade({ len: 1.5 - k * 0.12, w: 0.12 - k * 0.025, thick: 0.015, segs: 10, bend: -0.12 })));
  });
  b.part({ edge: 0.9 });
  b.aimZ(() => b.lathe([[0.06, -0.05], [0.045, -0.15], [0.07, -0.25], [0.001, -0.31]], 8, {}));
  b.at({ p: [0, 0, 0] }, () => b.torus(0.1, 0.018, { segs: 14, sides: 4 }));
  return b.build();
}
