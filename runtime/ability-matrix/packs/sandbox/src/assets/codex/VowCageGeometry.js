import { RigBuilder, PI, lerp } from './RigKit.js';

/**
 * Vow Cage — procedural geometry.
 *
 * Vows lock as bars and hold the circle until they break outward.
 * The hero is the vault: nine gothic ribs that rise from a threshold
 * ring and curve to meet at a boss, each hinged at its foot to break
 * outward when the vow is released.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A single pointed-arch rib with a capstone. Centred on y = 0, its largest extent one unit. */
export function createVowCagePieceGeometry() {
  const b = new RigBuilder('vowcage.piece');
  b.part({ pivot: [-0.25, -0.5, 0], axis: [0, 0, 1], swing: 0.35, stage: 1 });
  b.tube((t) => [lerp(-0.25, 0.25, 1 - Math.pow(1 - t, 1.6)) * (1 - Math.pow(t, 3) * 0.0) - Math.sin(t * PI) * 0.0, -0.5 + t * 1.0, 0], { r: 0.025, sides: 5, segs: 12 });
  b.part({ glow: 0.7 });
  b.at({ p: [0.25, 0.5, 0] }, () => b.pyramid(4, 0.07, 0.1, { phase: PI / 4 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Nine vault ribs, a threshold ring, a mid hoop, a keystone boss and nine foot plates. */
export function createVowCageHeroGeometry() {
  const b = new RigBuilder('vowcage.hero');
  b.fit('ring');
  b.part({ edge: 0.8 });
  b.torus(1, 0.03, { segs: 40, sides: 4 });
  // Nine gothic ribs, each a pointed arch: out at the foot, in at the crown.
  b.ring(9, 0, (i) => {
    b.part({ pivot: [0, 0, 1], axis: [1, 0, 0], swing: 0.5, stage: 1, delay: (i % 3) * 0.07, glow: i % 3 === 0 ? 0.25 : 0 });
    b.tube((t) => [0, t * 1.35, Math.pow(1 - t, 0.7) * 0.98 + 0.02], { r: 0.03, sides: 5, segs: 18 });
    b.at({ p: [0, 0, 1], r: [0, 0, 0] }, () => b.box(0.14, 0.04, 0.14, { center: true }));
  });
  b.part({ edge: 0.7 });
  b.at({ p: [0, 0.55, 0] }, () => b.torus(0.62, 0.016, { segs: 32, sides: 4 }));
  // The boss where the ribs meet.
  b.part({ glow: 0.9 });
  b.at({ p: [0, 1.36, 0] }, () => b.lathe([[0.001, 0], [0.1, 0.02], [0.08, 0.1], [0.001, 0.2]], 9, {}));
  b.at({ p: [0, 1.36, 0], r: [PI, 0, 0] }, () => b.lathe([[0.001, 0], [0.1, 0.02], [0.05, 0.12], [0.001, 0.2]], 9, {}));
  return b.build();
}
