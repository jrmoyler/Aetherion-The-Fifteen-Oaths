import { RigBuilder, PI, rng } from './RigKit.js';

/**
 * Dusk Spire — procedural geometry.
 *
 * Hooked shadow talons rise out of the dusk.
 * The hero is the claw: five tapering talons curving in from a ring of
 * thorns round a dark core spike, each hooked at the tip and hinged at
 * its foot so the whole hand closes and opens as the spire climbs.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A single hooked talon with a base thorn. Centred on y = 0, its largest extent one unit. */
export function createDuskSpirePieceGeometry() {
  const b = new RigBuilder('duskspire.piece');
  b.part({ crease: 35, pivot: [0, -0.5, 0], axis: [0, 0, 1], swing: -0.4, stage: 1, glow: 0.3 });
  b.tube((t) => [Math.sin(t * PI * 0.7) * 0.28, -0.5 + t * 1.0, 0], { r: (t) => 0.1 * (1 - t) + 0.006, sides: 6, segs: 14 });
  b.part();
  b.at({ p: [-0.1, -0.5, 0.05] }, () => b.pyramid(4, 0.05, 0.2, {}));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Five hooked talons, a core spike, a thorn ring of twelve and a mound. */
export function createDuskSpireHeroGeometry() {
  const b = new RigBuilder('duskspire.hero');
  b.fit('mass');
  const rand = rng(113);
  // Mound.
  b.part();
  b.lathe([[0.9, 0], [0.8, 0.07], [0.4, 0.14], [0.12, 0.18]], 12, { jag: () => 0.9 + rand() * 0.2 });
  // Core spike.
  b.part({ glow: 0.8 });
  b.lathe([[0.12, 0.1], [0.07, 0.6], [0.001, 1.5]], 5, {});
  // Five talons curving in, hooked at the tips.
  b.ring(5, 0, (i) => {
    b.part({ crease: 35, pivot: [0, 0, 0.6], axis: [1, 0, 0], swing: -0.45, stage: 1, delay: (i % 2) * 0.1, glow: 0.2 });
    b.tube((t) => [0, t * 1.5, 0.6 - 0.35 * Math.sin(t * 1.2) - Math.pow(t, 3) * 0.5 + 0.12 * t], { r: (t) => 0.1 * Math.pow(1 - t, 0.8) + 0.006, sides: 6, segs: 24 });
  });
  // A ring of thorns.
  b.part({ edge: 0.8 });
  b.ring(12, 0.95, (i) => b.at({ r: [0.25, 0, 0] }, () => b.pyramid(4, 0.05, 0.22 + (i % 3) * 0.06, {})));
  return b.build();
}
