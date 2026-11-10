import { RigBuilder, TAU } from './RigKit.js';

/**
 * Null Well — procedural geometry.
 *
 * An inverted empty throat: the floor forgets to be a floor.
 * The hero is the throat: a thick collar with a funnel hung inside it
 * point-down, five blades bent inward to the point, and a hovering shell
 * of rings that tighten as the well drinks and flare on the exhale.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A tiny hanging funnel inside a collar. Centred on y = 0, its largest extent one unit. */
export function createNullWellPieceGeometry() {
  const b = new RigBuilder('nullwell.piece');
  b.part({ edge: 0.8 });
  b.at({ p: [0, 0.3, 0] }, () => b.torus(0.3, 0.03, { segs: 16, sides: 5 }));
  b.part({ crease: 30 });
  b.at({ p: [0, 0.3, 0] }, () => b.lathe([[0.3, 0], [0.24, -0.2], [0.1, -0.5], [0.02, -0.7]], 12, { cap: false }));
  for (let i = 0; i < 3; i++) {
    b.part({ pivot: [0, 0.3, 0], axis: [0, 0, 1], swing: -0.5, stage: 1, delay: i * 0.1 });
    b.at({ p: [0, 0.3, 0], r: [0, (i / 3) * TAU, 0] }, () => b.at({ p: [0.28, 0, 0], r: [0, 0, 0.3] }, () => b.blade({ len: 0.4, w: 0.03, thick: 0.01, segs: 4 })));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A collar, a hanging funnel, five inward blades and four tightening rings. */
export function createNullWellHeroGeometry() {
  const b = new RigBuilder('nullwell.hero');
  b.fit('ring');
  // The collar.
  b.part({ edge: 0.8 });
  b.at({ p: [0, 0.18, 0] }, () => b.torus(0.9, 0.08, { segs: 40, sides: 6 }));
  // The funnel: wide at the collar, narrowing to a point below.
  b.part({ crease: 30, edge: 0.3 });
  b.at({ p: [0, 1.0, 0] }, () => b.lathe([[0.88, 0.05], [0.7, -0.15], [0.44, -0.45], [0.2, -0.72], [0.05, -0.95]], 28, { cap: false }));
  // Five blades bent inward to the point.
  b.ring(5, 0.8, (i) => {
    b.part({ pivot: [0, 1.0, 0], axis: [1, 0, 0], swing: -0.5, stage: 1, delay: (i % 2) * 0.1, glow: 0.3 });
    b.at({ p: [0, 1.02, 0], r: [-0.5, 0, 0] }, () => b.blade({ len: 0.8, w: 0.08, thick: 0.014, segs: 5 }));
  });
  // Rings that tighten.
  [0.86, 0.62, 0.38, 0.18].forEach((r, i) => {
    b.part({ pivot: [r, 1.0 - i * 0.22, 0], axis: [0, 0, 1], swing: 0.35, stage: 1, delay: i * 0.08, edge: 0.8, glow: i === 3 ? 0.6 : 0.1 });
    b.at({ p: [0, 1.0 - i * 0.24, 0] }, () => b.torus(r, 0.016, { segs: 28, sides: 4 }));
  });
  return b.build();
}
