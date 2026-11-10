import { RigBuilder, PI } from './RigKit.js';

/**
 * Doppel Lance — procedural geometry.
 *
 * A split mirrored spearhead: the lance and the two lances it was.
 * The hero is the trio: a bright leaf-bladed spearhead flanked by two
 * echoes set a hand-width apart, each on a socket, the echoes fanning
 * out from the true head about the socket as the lance splits.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A spear leaf with one echo beside it. Centred on y = 0, its largest extent one unit. */
export function createDoppelLancePieceGeometry() {
  const b = new RigBuilder('doppel.piece');
  b.part({ glow: 0.5 });
  b.blade({ len: 1, w: 0.12, thick: 0.02, segs: 8 });
  b.part({ pivot: [0, 0, 0], axis: [0, 0, 1], swing: -0.45, stage: 1, edge: 0.7 });
  b.at({ p: [0.12, -0.04, -0.03] }, () => b.blade({ len: 0.8, w: 0.1, thick: 0.015, segs: 6 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Three leaf spearheads, three sockets and a shared binding ring. */
export function createDoppelLanceHeroGeometry() {
  const b = new RigBuilder('doppel.hero');
  b.fit('mass');
  b.aimZ(() => {
    // The true head.
    b.part({ glow: 0.5 });
    b.at({ p: [0, 0.2, 0] }, () => b.blade({ len: 1.5, w: 0.14, thick: 0.03, segs: 12, shape: (t) => Math.sin(Math.PI * Math.pow(t, 0.55)) * (1 - 0.2 * t) }));
    b.lathe([[0.06, 0.25], [0.045, 0.0], [0.05, -0.4], [0.08, -0.46], [0.001, -0.52]], 8, {});
    // Two echoes, mirrored, smaller, each hinged on its own socket.
    [-1, 1].forEach((s, k) => {
      b.part({ edge: 0.7, glow: 0.2, pivot: [0, 0, 0], axis: [0, 0, 1], swing: s * -0.5, stage: 1, delay: k * 0.1 });
      b.at({ p: [s * 0.2, 0.15, -0.06] }, () => b.blade({ len: 1.2, w: 0.1, thick: 0.02, segs: 10 }));
      b.at({ p: [s * 0.2, -0.05, -0.06] }, () => b.lathe([[0.04, 0.2], [0.03, 0], [0.001, -0.2]], 6, {}));
    });
    // The binding ring.
    b.part({ edge: 0.9, glow: 0.4 });
    b.at({ p: [0, 0.18, 0] }, () => b.torus(0.12, 0.016, { segs: 16, sides: 4 }));
  });
  return b.build();
}
