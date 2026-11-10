import { RigBuilder, TAU, lerp } from './RigKit.js';

/**
 * Photon Well — procedural geometry.
 *
 * Photons drain into a point, then the point gives them back.
 * The hero is the reflector: a parabolic dish braced to a hovering
 * emitter, ringed by twelve collector petals that fold inward as the dish
 * drains and spring back out on the release.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A shallow dish with a hovering bead and three struts. Centred on y = 0, its largest extent one unit. */
export function createPhotonWellPieceGeometry() {
  const b = new RigBuilder('photonwell.piece');
  b.part({ crease: 30 });
  b.lathe([[0.001, -0.3], [0.2, -0.26], [0.36, -0.1], [0.46, 0.14]], 14, { cap: false });
  b.part({ glow: 1 });
  b.at({ p: [0, 0.05, 0] }, () => b.orb(0.07, { sides: 6, rings: 3 }));
  for (let i = 0; i < 3; i++) {
    b.part({ pivot: [0, 0.1, 0], axis: [0, 0, 1], swing: -0.6, stage: 1, delay: i * 0.08 });
    b.at({ r: [0, (i / 3) * TAU, 0] }, () => b.tube((t) => [lerp(0, 0.45, t), lerp(0.05, 0.14, t), 0], { r: 0.01, sides: 4, segs: 3 }));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A parabolic dish, a hovering emitter, six braces and twelve collector petals. */
export function createPhotonWellHeroGeometry() {
  const b = new RigBuilder('photonwell.hero');
  b.fit('ring');
  // Parabolic dish: y = r^2 rise.
  b.part({ crease: 30, edge: 0.4 });
  const prof = [];
  for (let i = 0; i <= 10; i++) { const r = (i / 10) * 0.95 + 0.02; prof.push([r, 0.55 * r * r]); }
  b.lathe(prof, 32, { cap: false });
  // The emitter hovers at the focus; six braces tie it to the rim.
  b.part({ glow: 1 });
  b.at({ p: [0, 0.32, 0] }, () => b.orb(0.13, { sides: 8, rings: 4 }));
  b.ring(6, 0.95, (i) => {
    b.part({ edge: 0.6 });
    b.tube((t) => [0, lerp(0.5, 0.32, t), lerp(0, -0.95, t)], { r: 0.012, sides: 4, segs: 8 });
  });
  // Twelve collector petals around the rim.
  b.ring(12, 0.95, (i) => {
    b.part({ pivot: [0, 0.5, 0], axis: [1, 0, 0], swing: -0.9, stage: 1, delay: (i % 2) * 0.1, glow: 0.2 });
    b.at({ p: [0, 0.5, 0], r: [-0.45, 0, 0] }, () => b.blade({ len: 0.36, w: 0.1, thick: 0.012, segs: 5 }));
  });
  return b.build();
}
