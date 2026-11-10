import { RigBuilder, PI, lerp } from './RigKit.js';

/**
 * Gimbal Whip — procedural geometry.
 *
 * An articulated gimbal ribbon: three rings that never agree on up.
 * The hero is the gimbal: three nested rings, each hinged to the next on a
 * different axis, a gyro disc spinning at the centre, a mounting yoke
 * behind and a trailing ribbon cable.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. Two nested rings on a gyro bead. Centred on y = 0, its largest extent one unit. */
export function createGimbalWhipPieceGeometry() {
  const b = new RigBuilder('gimbal.piece');
  b.part({ glow: 0.8 });
  b.orb(0.08, { sides: 6, rings: 3 });
  b.part({ edge: 0.9, pivot: [0, 0, 0], axis: [1, 0, 0], swing: 1.0, stage: 1 });
  b.torus(0.32, 0.016, { segs: 20, sides: 4 });
  b.part({ edge: 0.9, pivot: [0, 0, 0], axis: [0, 0, 1], swing: -1.0, stage: 1, delay: 0.1 });
  b.at({ r: [PI / 2, 0, 0] }, () => b.torus(0.22, 0.016, { segs: 16, sides: 4 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Three nested rings, a gyro disc, a mounting yoke and a ribbon cable. */
export function createGimbalWhipHeroGeometry() {
  const b = new RigBuilder('gimbal.hero');
  b.fit('mass');
  // Gyro disc.
  b.part({ glow: 0.9, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 1.5, stage: 1 });
  b.at({ p: [0, 0.6, 0] }, () => b.lathe([[0.01, -0.03], [0.22, -0.02], [0.24, 0], [0.22, 0.02], [0.01, 0.03]], 16, { cap: false }));
  // Three rings on perpendicular hinges.
  [[0.55, [1, 0, 0], 1.0], [0.42, [0, 0, 1], -1.2], [0.3, [0, 1, 0], 1.4]].forEach(([R, axis, swing], i) => {
    b.part({ edge: 0.9, pivot: [0, 0.6, 0], axis, swing, stage: 1, delay: i * 0.08, glow: i === 2 ? 0.3 : 0 });
    b.at({ p: [0, 0.6, 0], r: [i === 1 ? PI / 2 : 0, 0, i === 2 ? PI / 2 : 0] }, () => b.torus(R, 0.022, { segs: 32, sides: 5 }));
  });
  // Yoke and base.
  b.part({ edge: 0.8 });
  b.at({ p: [0, 0, 0] }, () => b.cylinder(0.12, 0.1, 8, { r1: 0.09 }));
  b.tube((t) => [0, lerp(0.1, 0.6, t), -0.2 * Math.sin(t * PI)], { r: 0.018, sides: 4, segs: 8 });
  // Ribbon cable.
  b.part({ crease: 40, edge: 0.2, glow: 0.3, pivot: [0, 0.4, -0.2], axis: [1, 0, 0], swing: 0.5, stage: 1 });
  b.ribbon((t) => [Math.sin(t * 7) * 0.12, 0.45 - t * 0.35, -0.2 - t * 1.0], { w: 0.1, segs: 24, up: [0, 1, 0] });
  return b.build();
}
