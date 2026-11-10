import { RigBuilder, PI, ngon, star } from './RigKit.js';

/**
 * Zodiac Halo — procedural geometry.
 *
 * A twelve-pointed celestial rim: signs walk the ring, the heavens turn.
 * The hero is the astrolabe: a rim set with twelve different sigils,
 * spoked to a hub, and an armillary of three tilting bands floating
 * in the middle that rolls over when the rim closes.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A medallion: a ring, a four-point star and a tiny moon. Centred on y = 0, its largest extent one unit. */
export function createZodiacHaloPieceGeometry() {
  const b = new RigBuilder('zodiac.piece');
  b.part({ edge: 0.8 });
  b.at({ r: [PI / 2, 0, 0] }, () => b.torus(0.32, 0.02, { segs: 18, sides: 4 }));
  b.part({ glow: 0.9, pivot: [0, 0, 0], axis: [0, 0, 1], swing: 0.7, stage: 1 });
  b.at({ r: [PI / 2, 0, 0] }, () => b.prism(star(4, 0.26, 0.07), -0.02, 0.02, {}));
  b.part({ pivot: [0, 0, 0], axis: [0, 0, 1], swing: -0.6, stage: 1, delay: 0.15 });
  b.at({ p: [0.32, 0, 0] }, () => b.orb(0.05, { sides: 5, rings: 3 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A twelve-sigil rim, three spokes, a hub and a three-band armillary. */
export function createZodiacHaloHeroGeometry() {
  const b = new RigBuilder('zodiac.hero');
  b.fit('ring');
  b.part({ edge: 0.8 });
  b.at({ p: [0, 0.06, 0] }, () => b.torus(1, 0.03, { segs: 48, sides: 5 }));
  b.at({ p: [0, 0.06, 0] }, () => b.torus(0.82, 0.015, { segs: 40, sides: 4 }));
  // Twelve sigils, each a different solid.
  const glyph = [
    () => b.crystal({ sides: 4, r: 0.05, h: 0.18, tip: 0.4 }),
    () => b.orb(0.06, { sides: 6, rings: 3 }),
    () => b.pyramid(3, 0.07, 0.16, {}),
    () => b.prism(star(4, 0.08, 0.025), 0, 0.03, {}),
    () => b.torus(0.05, 0.015, { segs: 10, sides: 4 }),
    () => b.box(0.08, 0.12, 0.04, { taper: [0.5, 1] }),
    () => b.cylinder(0.05, 0.16, 6, { r1: 0.02 }),
    () => b.orb(0.05, { sides: 4, rings: 2, ey: 1.6 }),
    () => b.prism(ngon(5, 0.07), 0, 0.04, {}),
    () => b.prism(star(6, 0.08, 0.04), 0, 0.03, {}),
    () => b.crystal({ sides: 3, r: 0.05, h: 0.2, tip: 0.5 }),
    () => b.lathe([[0.07, 0], [0.03, 0.06], [0.07, 0.12]], 8, {})
  ];
  b.ring(12, 1.0, (i) => {
    b.part({ pivot: [0, 0.06, 0], axis: [1, 0, 0], swing: 0.9, stage: 1, delay: (i % 4) * 0.05, glow: i % 3 === 0 ? 0.6 : 0.15 });
    b.at({ p: [0, 0.06, 0] }, () => glyph[i]());
  });
  // Three spokes and a hub.
  b.part({ edge: 0.6 });
  for (let i = 0; i < 3; i++) b.at({ p: [0, 0.06, 0], r: [0, (i / 3) * PI, 0] }, () => b.at({ p: [-0.82, 0, 0], r: [0, 0, -PI / 2] }, () => b.cylinder(0.01, 1.64, 4, {})));
  b.part({ glow: 0.9 });
  b.at({ p: [0, 0.06, 0] }, () => b.orb(0.1, { sides: 8, rings: 4 }));
  // The armillary: three bands, each free to tip on its own axis.
  for (let i = 0; i < 3; i++) {
    b.part({ pivot: [0, 0.55, 0], axis: [Math.cos((i / 3) * PI), 0, Math.sin((i / 3) * PI)], swing: 0.9 + i * 0.3, stage: 1, delay: i * 0.1, edge: 0.8, glow: 0.2 });
    b.at({ p: [0, 0.55, 0], r: [0.5 * i, (i / 3) * PI, 0] }, () => b.torus(0.34 - i * 0.04, 0.018, { segs: 28, sides: 4 }));
  }
  return b.build();
}
