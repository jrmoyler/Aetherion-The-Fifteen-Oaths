import { RigBuilder, PI, lerp } from './RigKit.js';

/**
 * Tide Bars — procedural geometry.
 *
 * Bowed tidal buttresses hold the circle against the pull.
 * The hero is the buttress ring: eight bowed bars leaning in, each braced
 * by a flying arch that springs from its shoulder out to a foot plate,
 * the arches swinging wide as the tide lets go.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A bowed bar braced by one flying arch. Centred on y = 0, its largest extent one unit. */
export function createTideBarsPieceGeometry() {
  const b = new RigBuilder('tidebar.piece');
  b.part({ pivot: [0, -0.5, 0], axis: [0, 0, 1], swing: -0.2, stage: 1 });
  b.tube((t) => [0.08 * Math.sin(t * PI), -0.5 + t * 1.0, 0], { r: 0.05, sides: 4, segs: 10 });
  b.part({ pivot: [0.04, 0.2, 0], axis: [0, 0, 1], swing: 0.5, stage: 1, delay: 0.1 });
  b.tube((t) => [0.04 + t * 0.34, 0.2 - Math.sin(t * PI * 0.6) * -0.0 - t * 0.5 + 0.18 * Math.sin(t * PI), 0], { r: 0.02, sides: 4, segs: 10 });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Eight bowed bars, eight flying arches, foot plates and a base ring. */
export function createTideBarsHeroGeometry() {
  const b = new RigBuilder('tidebar.hero');
  b.fit('ring');
  b.part({ edge: 0.7 });
  b.torus(1, 0.035, { segs: 40, sides: 4 });
  b.ring(8, 0.95, (i) => {
    // The bar bows outward through its middle.
    b.part({ pivot: [0, 0, 0], axis: [1, 0, 0], swing: -0.4, stage: 1, delay: (i % 2) * 0.1, glow: i % 4 === 0 ? 0.3 : 0 });
    b.tube((t) => [0, t * 1.2, 0.07 * Math.sin(t * PI) - t * 0.12], { r: lerp(0.07, 0.045, 0), sides: 4, segs: 12 });
    b.at({ p: [0, 1.2, -0.12] }, () => b.pyramid(4, 0.07, 0.1, { phase: PI / 4 }));
    // The flying arch springs from the shoulder out to a foot plate.
    b.part({ pivot: [0, 0.95, -0.05], axis: [1, 0, 0], swing: -0.55, stage: 1, delay: 0.1 + (i % 2) * 0.1, edge: 0.8 });
    b.tube((t) => [0, 0.95 - t * 0.9 + 0.12 * Math.sin(t * PI), -0.05 + t * 0.5], { r: 0.025, sides: 4, segs: 12 });
    b.at({ p: [0, 0.0, 0.5] }, () => b.box(0.16, 0.04, 0.14, {}));
  });
  return b.build();
}
