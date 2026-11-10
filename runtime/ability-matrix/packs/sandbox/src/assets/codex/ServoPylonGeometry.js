import { RigBuilder, PI } from './RigKit.js';

/**
 * Servo Pylon — procedural geometry.
 *
 * Telescopic hammer pylons: a servo that hits the ground for a living.
 * The hero is the pylon: a braced base, three telescoping stages each
 * narrower than the one below with a hydraulic collar at every joint, and
 * a flat hammer head on top. The stages lean over at their joints as the
 * hammer comes down.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A two-stage telescopic ram with a hammer pad. Centred on y = 0, its largest extent one unit. */
export function createServoPylonPieceGeometry() {
  const b = new RigBuilder('servopylon.piece');
  b.part({ edge: 0.8 });
  b.at({ p: [0, -0.5, 0] }, () => b.cylinder(0.13, 0.55, 8, {}));
  b.part({ glow: 0.4, pivot: [0, 0.05, 0], axis: [0, 0, 1], swing: -0.3, stage: 1 });
  b.at({ p: [0, 0.0, 0] }, () => b.cylinder(0.08, 0.45, 8, {}));
  b.part({ glow: 0.8, pivot: [0, 0.05, 0], axis: [0, 0, 1], swing: -0.3, stage: 1 });
  b.at({ p: [0, 0.45, 0] }, () => b.box(0.34, 0.08, 0.2, {}));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A four-brace base, three telescopic stages, three collars and a hammer head. */
export function createServoPylonHeroGeometry() {
  const b = new RigBuilder('servopylon.hero');
  b.fit('mass');
  // Base with four braces.
  b.part({ edge: 0.8 });
  b.cylinder(0.45, 0.12, 10, { r1: 0.3 });
  b.ring(4, 0.3, () => b.at({ p: [0, 0.1, 0], r: [-0.55, 0, 0] }, () => b.box(0.06, 0.55, 0.06, {})), { phase: PI / 4 });
  // Three telescopic stages; each tips over a little at its joint.
  [[0.28, 0.12, 0.7], [0.2, 0.8, 0.7], [0.13, 1.5, 0.7]].forEach(([r, y, h], i) => {
    b.part({ edge: 0.8, glow: i === 2 ? 0.3 : 0, pivot: [0, y, 0], axis: [0, 0, 1], swing: -0.16 - i * 0.05, stage: 1, delay: i * 0.1 });
    b.at({ p: [0, y, 0] }, () => b.cylinder(r, h, 12, {}));
    b.part({ glow: 0.6, pivot: [0, y, 0], axis: [0, 0, 1], swing: -0.16 - i * 0.05, stage: 1, delay: i * 0.1 });
    b.at({ p: [0, y + h - 0.04, 0] }, () => b.torus(r + 0.015, 0.022, { segs: 20, sides: 4 }));
  });
  // Hammer head.
  b.part({ glow: 0.9, pivot: [0, 2.0, 0], axis: [0, 0, 1], swing: -0.5, stage: 1, delay: 0.25 });
  b.at({ p: [0, 2.2, 0] }, () => b.box(0.9, 0.3, 0.42, { center: true, taper: [0.9, 0.9] }));
  b.at({ p: [0, 2.04, 0] }, () => b.cylinder(0.12, 0.08, 8, {}));
  return b.build();
}
