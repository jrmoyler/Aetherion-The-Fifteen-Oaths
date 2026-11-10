import { RigBuilder, PI, TAU } from './RigKit.js';

/**
 * Mass Lance — procedural geometry.
 *
 * A dense oblate ram: more mass than lance, and it knows it.
 * The hero is the ram: a flattened spheroid armoured in three bands,
 * a heavy wedge on its nose, and three trailing weights on struts that
 * swing out behind as it drives.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A flattened weight with a band and a blunt wedge nose. Centred on y = 0, its largest extent one unit. */
export function createMassLancePieceGeometry() {
  const b = new RigBuilder('masslance.piece');
  b.part({ glow: 0.3, pivot: [0, 0, 0], axis: [0, 0, 1], swing: 0.3, stage: 1 });
  b.orb(0.25, { sides: 9, rings: 4, ey: 0.65 });
  b.part({ edge: 0.8, pivot: [0, 0, 0], axis: [0, 0, 1], swing: -0.3, stage: 1, delay: 0.1 });
  b.torus(0.255, 0.02, { segs: 20, sides: 4 });
  b.part({ pivot: [0, 0.1, 0], axis: [0, 0, 1], swing: -0.5, stage: 1 });
  b.at({ p: [0, 0.16, 0] }, () => b.pyramid(4, 0.15, 0.22, { phase: PI / 4 }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. An oblate spheroid, three armour bands, a wedge nose and three weighted struts. */
export function createMassLanceHeroGeometry() {
  const b = new RigBuilder('masslance.hero');
  b.fit('mass');
  b.aimZ(() => {
    // The oblate ram, long axis along the cast after aimZ.
    b.part({ glow: 0.3 });
    b.orb(0.5, { sides: 14, rings: 6, ey: 0.62 });
    for (let i = 0; i < 3; i++) {
      b.part({ edge: 0.8 });
      b.at({ p: [0, (i - 1) * 0.2, 0] }, () => b.torus(0.5 * Math.sqrt(1 - (((i - 1) * 0.2) / 0.31) ** 2) + 0.01, 0.025, { segs: 28, sides: 5 }));
    }
    // The nose: a heavy wedge.
    b.part({ glow: 0.6, pivot: [0, 0.3, 0], axis: [0, 0, 1], swing: -0.25, stage: 1 });
    b.at({ p: [0, 0.28, 0] }, () => b.lathe([[0.3, 0], [0.34, 0.06], [0.18, 0.4], [0.02, 0.5]], 4, { phase: PI / 4 }));
    // Three weights trailing on struts.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      b.part({ pivot: [0, -0.3, 0], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.65, stage: 1, delay: i * 0.08, glow: 0.2 });
      b.at({ p: [0, -0.3, 0] }, () => {
        b.tube((t) => [Math.cos(a) * 0.3 * t, -t * 0.5, Math.sin(a) * 0.3 * t], { r: 0.02, sides: 4, segs: 6 });
        b.at({ p: [Math.cos(a) * 0.3, -0.54, Math.sin(a) * 0.3] }, () => b.orb(0.09, { sides: 6, rings: 3 }));
      });
    }
  });
  return b.build();
}
