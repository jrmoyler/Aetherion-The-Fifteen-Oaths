import { RigBuilder, PI, TAU, lerp, arcBand } from './RigKit.js';

/**
 * Keystone Drop — procedural geometry.
 *
 * Keystones drop into a ring and crush inward to one lock.
 * The hero is the arch: eight tapered voussoir pillars around a ring,
 * each leaning inward on the crush, and the keystone itself hanging above
 * their tops on four tie rods.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A single tapered voussoir with a chamfered cap that lifts off. Centred on y = 0, its largest extent one unit. */
export function createKeystoneDropPieceGeometry() {
  const b = new RigBuilder('keystone.piece');
  b.part();
  b.prism([[-0.2, -0.13], [0.2, -0.13], [0.26, 0.13], [-0.26, 0.13]], 0, 0.6, { taper: [0.8, 0.85] });
  b.part({ pivot: [0.15, 0.6, 0], axis: [0, 0, 1], swing: -0.5, stage: 1, glow: 0.6 });
  b.at({ p: [0, 0.6, 0] }, () => b.pyramid(4, 0.22, 0.3, { phase: PI / 4 }));

  // Plinth, mortar pins and a carved boss on the face.
  b.part({ edge: 0.8 });
  b.box(0.6, 0.05, 0.34, { taper: [0.9, 0.9] });
  b.part({ glow: 0.5 });
  [-0.12, 0.12].forEach((x) => b.at({ p: [x, 0.4, 0.14], r: [PI / 2, 0, 0] }, () => b.cylinder(0.03, 0.05, 6, {})));
  b.at({ p: [0, 0.3, 0.14] }, () => b.orb(0.05, { sides: 5, rings: 3 }));
  b.part({ pivot: [-0.2, 0.6, 0], axis: [0, 0, 1], swing: 0.5, stage: 1, delay: 0.1 });
  b.at({ p: [-0.2, 0.6, 0] }, () => b.pyramid(4, 0.07, 0.12, { phase: PI / 4 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Eight voussoir pillars, an inverted keystone, four tie rods and a base ring. */
export function createKeystoneDropHeroGeometry() {
  const b = new RigBuilder('keystone.hero');
  b.fit('ring');
  // Base ring the pillars stand on.
  b.part();
  b.torus(1, 0.035, { segs: 40, sides: 4 });
  // Voussoir pillars: plan-view wedges, lean inward on the crush.
  b.ring(8, 0, (i) => {
    b.part({ pivot: [0, 0, 0.88], axis: [1, 0, 0], swing: -0.5, stage: 1, delay: (i % 2) * 0.12 });
    b.prism(arcBand(PI / 2 - 0.34, PI / 2 + 0.34, 0.88, 1.08, 4), 0, 0.9, { taper: [0.8, 0.8] });
    b.at({ p: [0, 0.9, 0.98] }, () => b.pyramid(4, 0.1, 0.12, { phase: PI / 4 }));
  });
  // The keystone: an inverted four-sided wedge hung above the circle.
  b.part({ glow: 0.9 });
  b.at({ p: [0, 1.35, 0], r: [PI, 0, 0] }, () => b.lathe([[0.3, 0], [0.34, 0.05], [0.2, 0.34], [0.03, 0.46]], 4, { phase: PI / 4 }));
  // Four tie rods from keystone to the pillar tops.
  b.part({ edge: 0.5 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + PI / 4;
    b.tube((t) => [Math.cos(a) * lerp(0.3, 0.98, t), lerp(1.3, 1.0, t) + 0.12 * Math.sin(t * PI), Math.sin(a) * lerp(0.3, 0.98, t)], { r: 0.012, sides: 4, segs: 8 });
  }
  return b.build();
}
