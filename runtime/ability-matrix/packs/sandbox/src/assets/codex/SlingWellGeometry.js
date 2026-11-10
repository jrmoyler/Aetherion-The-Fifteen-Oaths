import { RigBuilder, rng, helixPath } from './RigKit.js';

/**
 * Sling Well — procedural geometry.
 *
 * An eccentric accretion ramp: the well slings what it drinks.
 * The hero is the disc: a spiral ramp winding in to a dense core,
 * three slung stones riding the ramp at different radii, and an outer
 * lip. The stones are flung outward on the exhale.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A short spiral ramp with a stone riding it. Centred on y = 0, its largest extent one unit. */
export function createSlingWellPieceGeometry() {
  const b = new RigBuilder('slingwell.piece');
  b.part({ crease: 40, edge: 0.5, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 0.5, stage: 1 });
  b.ribbon(helixPath(0.38, 0.08, 1.6, -0.35, 0.2, 0), { w: 0.13, segs: 26, thick: 0.012, up: [0, 1, 0] });
  b.part({ glow: 0.6, pivot: [0, 0, 0], axis: [0, 1, 0], swing: -1.2, stage: 1 });
  b.at({ p: [0.3, 0.1, 0] }, () => b.orb(0.07, { sides: 6, rings: 3, ey: 0.85 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A spiral ramp, a banded core mass, three slung stones and an outer lip. */
export function createSlingWellHeroGeometry() {
  const b = new RigBuilder('slingwell.hero');
  b.fit('ring');
  const rand = rng(81);
  // The ramp: a flat ribbon spiralling down and in.
  b.part({ crease: 40, edge: 0.4, pivot: [0, 0, 0], axis: [0, 1, 0], swing: 0.45, stage: 1 });
  b.ribbon(helixPath(0.95, 0.2, 2.4, -0.3, 0.38, 0), { w: 0.22, segs: 90, thick: 0.014, up: [0, 1, 0] });
  // The core: a dense mass with a belt.
  b.part({ glow: 0.8 });
  b.at({ p: [0, 0.14, 0] }, () => b.orb(0.2, { sides: 9, rings: 4, ey: 0.8 }));
  b.part({ edge: 0.9 });
  b.at({ p: [0, 0.14, 0] }, () => b.torus(0.25, 0.022, { segs: 20, sides: 5 }));
  // Three stones slung from the ramp at different radii.
  [0.82, 0.58, 0.38].forEach((r, i) => {
    const a = i * 2.1;
    b.part({ pivot: [0, 0, 0], axis: [0, 1, 0], swing: -1.1 - i * 0.4, stage: 1, delay: i * 0.1, glow: 0.35 });
    b.at({ p: [Math.cos(a) * r, 0.42 - r * 0.28, Math.sin(a) * r] }, () => b.orb(0.1 + rand() * 0.03, { sides: 6, rings: 3, ey: 0.85, jag: () => 0.9 + rand() * 0.2 }));
  });
  b.part({ edge: 0.8 });
  b.at({ p: [0, 0.02, 0] }, () => b.torus(1.03, 0.035, { segs: 48, sides: 5 }));
  return b.build();
}
