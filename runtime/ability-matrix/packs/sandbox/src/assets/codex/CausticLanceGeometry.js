import { RigBuilder, PI, TAU, lerp } from './RigKit.js';

/**
 * Caustic Lance — procedural geometry.
 *
 * A caustic lance boils the line and leaves a bright scar.
 * The hero is the focus: a lens ring at the hand throwing seven rays
 * that converge on a burning point, the whole bundle loosening and
 * refocusing as the heat builds.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. Three rays converging on a hot bead. Centred on y = 0, its largest extent one unit. */
export function createCausticLancePieceGeometry() {
  const b = new RigBuilder('caustic.piece');
  b.part({ glow: 1 });
  b.at({ p: [0, 0.4, 0] }, () => b.orb(0.07, { sides: 6, rings: 3, ey: 1.4 }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    b.part({ pivot: [0, 0.4, 0], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.3, stage: 1, delay: i * 0.08 });
    b.tube((t) => [Math.cos(a) * 0.16 * (1 - t), lerp(-0.45, 0.4, t), Math.sin(a) * 0.16 * (1 - t)], { r: 0.013, sides: 4, segs: 5 });
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A biconvex lens, a lens ring, seven converging rays and a burning focus. */
export function createCausticLanceHeroGeometry() {
  const b = new RigBuilder('caustic.hero');
  b.fit('mass');
  b.aimZ(() => {
    // The lens: biconvex, in a ring.
    b.part({ glow: 0.5 });
    b.at({ r: [-PI / 2, 0, 0] }, () => b.lathe([[0.001, -0.05], [0.14, -0.035], [0.24, 0], [0.14, 0.035], [0.001, 0.05]], 16, { cap: false }));
    b.part({ edge: 0.9 });
    b.at({ r: [-PI / 2, 0, 0] }, () => b.torus(0.25, 0.022, { segs: 20, sides: 5 }));
    // Seven rays converging on the focus 1.3 ahead; they loosen and refocus.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      b.part({ pivot: [0, 0, 1.3], axis: [-Math.sin(a), Math.cos(a), 0], swing: 0.16, stage: 1, delay: (i % 3) * 0.08, glow: 0.35, edge: 0.7 });
      b.tube((t) => [Math.cos(a) * 0.23 * (1 - t), Math.sin(a) * 0.23 * (1 - t), t * 1.3], { r: 0.016, sides: 4, segs: 10 });
    }
    // The burning point.
    b.part({ glow: 1 });
    b.at({ p: [0, 0, 1.32] }, () => b.orb(0.1, { sides: 6, rings: 3, ex: 1, ey: 1 }));
    b.at({ p: [0, 0, 1.32], r: [0, 0, PI / 4] }, () => b.at({ r: [-PI / 2, 0, 0] }, () => b.blade({ len: 0.2, w: 0.03, thick: 0.01, segs: 3 })));
  });
  return b.build();
}
