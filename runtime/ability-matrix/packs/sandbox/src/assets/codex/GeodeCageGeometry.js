import { RigBuilder, rng } from './RigKit.js';

/**
 * Geode Cage — procedural geometry.
 *
 * A geode seals shut and the inner points fire inward.
 * The hero is the geode: a rough lower shell lined with inward
 * crystals, and a domed lid hinged open that swings down to seal.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A crystal-lined cup with five inward points and a hinged lid. Centred on y = 0, its largest extent one unit. */
export function createGeodeCagePieceGeometry() {
  const b = new RigBuilder('geodecage.piece');
  const rand = rng(41);
  b.part();
  b.lathe([[0.1, -0.1], [0.3, -0.02], [0.4, 0.14], [0.36, 0.2], [0.28, 0.14]], 9, { jag: () => 0.92 + rand() * 0.16 });
  b.part({ glow: 0.6 });
  b.ring(5, 0.2, (i) => b.at({ r: [0.7, 0, 0] }, () => b.crystal({ sides: 4, r: 0.05, h: 0.28, tip: 0.4 })), { y: 0.08 });
  b.part({ pivot: [0.36, 0.2, 0], axis: [0, 0, 1], swing: -1.2, stage: 1 });
  b.at({ p: [0.36, 0.2, 0], r: [0, 0, 1.2] }, () => b.at({ p: [-0.36, 0, 0] }, () => b.lathe([[0.38, 0], [0.34, 0.12], [0.2, 0.24], [0.04, 0.3]], 9, { jag: () => 0.95 + rand() * 0.1 })));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A rough bowl shell, fourteen inward crystals, a hinged dome lid and a rim of teeth. */
export function createGeodeCageHeroGeometry() {
  const b = new RigBuilder('geodecage.hero');
  b.fit('ring');
  const rand = rng(43);
  // Lower shell: a rough bowl, wall thick, jagged at the lip.
  b.part();
  b.lathe([[0.15, 0], [0.62, 0.05], [0.95, 0.3], [1.02, 0.58], [0.88, 0.62], [0.8, 0.42], [0.55, 0.18], [0.12, 0.1]], 18, { cap: false, jag: (i, j) => 0.94 + rand() * 0.12 });
  // Inner crystals: fourteen points aimed at the centre, in two tiers.
  b.part({ glow: 0.7 });
  b.ring(14, 0.84, (i) => {
    const tier = i % 2;
    b.at({ p: [0, 0.26 + tier * 0.22, 0], r: [-1.15 + tier * 0.3, 0, 0] }, () => b.crystal({ sides: 5, r: 0.07 + rand() * 0.03, h: 0.4 + rand() * 0.2, tip: 0.4, asym: 0.2 }));
  });
  // The lid: a dome hinged at the back lip, authored open.
  b.at({ p: [0, 0.6, -0.95], r: [-1.4, 0, 0] }, () => {
    b.part({ pivot: [0, 0, 0], axis: [1, 0, 0], swing: 1.4, stage: 1, delay: 0.05, glow: 0.2 });
    b.at({ p: [0, 0, 0.95] }, () => b.lathe([[0.95, 0], [0.9, 0.2], [0.65, 0.4], [0.3, 0.52], [0, 0.55]], 18, { cap: false, jag: () => 0.96 + rand() * 0.08 }));
  });
  return b.build();
}
