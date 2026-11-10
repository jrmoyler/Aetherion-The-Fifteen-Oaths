import { RigBuilder, PI, TAU, star } from './RigKit.js';

/**
 * Sigil Volley — procedural geometry.
 *
 * Star sigil darts: five-pointed seals thrown spear-first.
 * The hero is the dart: a five-point star seal facing forward, a spike
 * driven through its centre, a binding ring behind it and five small
 * runes that spiral off the seal as it flies.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A five-point seal with a spike through it. Centred on y = 0, its largest extent one unit. */
export function createSigilVolleyPieceGeometry() {
  const b = new RigBuilder('sigilvolley.piece');
  b.part({ glow: 0.6 });
  b.at({ r: [PI / 2, 0, 0] }, () => b.prism(star(5, 0.34, 0.15), -0.025, 0.025, {}));
  b.part({ edge: 0.8 });
  b.lathe([[0.001, 0.5], [0.04, 0.3], [0.04, -0.3], [0.001, -0.5]], 4, { phase: PI / 4 });
  b.part({ glow: 1, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 1.4, stage: 1 });
  b.at({ p: [0.24, 0, 0] }, () => b.orb(0.035, { sides: 4, rings: 2, ey: 1.4 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A star seal, a spike, a binding ring and five spiralling runes. */
export function createSigilVolleyHeroGeometry() {
  const b = new RigBuilder('sigilvolley.hero');
  b.fit('mass');
  b.aimZ(() => {
    // The seal faces forward, stacked as two plates: a bright star over a wider dark one.
    b.part({ glow: 0.5 });
    b.prism(star(5, 0.55, 0.24, PI / 2), 0.0, 0.06, {});
    b.part({ edge: 0.9 });
    b.prism(star(5, 0.42, 0.2, PI / 2), 0.06, 0.1, { taper: 0.9 });
    // Spike driven through the middle.
    b.part({ glow: 0.9 });
    b.lathe([[0.001, 1.3], [0.04, 0.9], [0.06, 0.1], [0.05, -0.5]], 5, { phase: PI / 10 });
    // The binding ring behind.
    b.part({ edge: 0.9 });
    b.at({ p: [0, -0.25, 0] }, () => b.torus(0.3, 0.02, { segs: 20, sides: 4 }));
    // Five runes spiralling off.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      b.part({ glow: 1, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 1.2, stage: 1, delay: i * 0.05 });
      b.at({ p: [Math.cos(a) * 0.62, -0.1 - i * 0.12, Math.sin(a) * 0.62] }, () => b.orb(0.05, { sides: 4, rings: 2, ey: 1.5 }));
    }
  });

  b.aimZ(() => {
    // A second, wider plate behind the seal, turned half a point and swinging against it.
    b.part({ glow: 0.4, pivot: [0, 0, 0], axis: [0, 1, 0], swing: -0.9, stage: 1 });
    b.at({ p: [0, -0.04, 0] }, () => b.prism(star(5, 0.66, 0.32, PI / 2 + PI / 5), 0, 0.04, {}));
    // Tick marks round the binding ring.
    b.part({ edge: 0.9, glow: 0.6 });
    b.ring(10, 0.3, () => b.box(0.02, 0.06, 0.05, {}), { y: -0.25 });
    // Five barbs on the face of the seal.
    b.part({ glow: 0.9 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + PI / 2;
      b.at({ p: [Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5] }, () => b.pyramid(3, 0.04, 0.14, {}));
    }
  });
  return b.build();
}
