import { RigBuilder, PI, TAU } from './RigKit.js';

/**
 * Quietus Halo — procedural geometry.
 *
 * An inverted serrated iris: the circle closes like an eye that has seen enough.
 * The hero is the iris: twelve overlapping serrated blades laid flat round
 * the rim, each rotating in toward the pupil on its own pin as the iris
 * closes, with a pupil ring and a dark hub.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. Four overlapping serrated leaves on a pin. Centred on y = 0, its largest extent one unit. */
export function createQuietusHaloPieceGeometry() {
  const b = new RigBuilder('quietus.piece');
  for (let i = 0; i < 4; i++) {
    b.part({ pivot: [0.2, 0, 0], axis: [0, 1, 0], swing: 0.8, stage: 1, delay: i * 0.07 });
    b.at({ r: [0, (i / 4) * TAU, 0] }, () => b.prism([[0.08, -0.04], [0.32, -0.12], [0.34, 0.02], [0.3, 0.1], [0.08, 0.05]], i * 0.018, i * 0.018 + 0.02, {}));
  }
  b.part({ glow: 0.8 });
  b.cylinder(0.04, 0.12, 6, {});
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Twelve serrated iris leaves, an outer housing, a pupil ring and a hub. */
export function createQuietusHaloHeroGeometry() {
  const b = new RigBuilder('quietus.hero');
  b.fit('ring');
  b.part({ edge: 0.8 });
  b.torus(1.0, 0.045, { segs: 48, sides: 5 });
  // Twelve serrated leaves; each swings its tip inward about its outer pin.
  b.ring(12, 0.9, (i) => {
    b.part({ pivot: [0, 0, 0], axis: [0, 1, 0], swing: 0.55, stage: 1, delay: (i % 3) * 0.05, glow: i % 4 === 0 ? 0.2 : 0 });
    const leaf = [[0.0, -0.07], [-0.55, -0.1], [-0.5, -0.02], [-0.58, 0.03], [-0.52, 0.1], [-0.3, 0.14], [0.0, 0.1]];
    b.at({ p: [0, i * 0.008, 0], r: [0, -PI / 2, 0] }, () => b.prism(leaf, 0, 0.025, {}));
  });
  b.part({ glow: 0.9 });
  b.at({ p: [0, 0.05, 0] }, () => b.torus(0.3, 0.025, { segs: 28, sides: 5 }));
  b.part({ glow: 0.1 });
  b.at({ p: [0, 0.03, 0] }, () => b.cylinder(0.2, 0.06, 14, {}));
  return b.build();
}
