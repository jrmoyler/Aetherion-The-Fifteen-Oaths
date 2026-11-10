import { RigBuilder, PI } from './RigKit.js';

/**
 * Mirror Halo — procedural geometry.
 *
 * A pleated mirror polygon: the circle folded into twelve faces.
 * The hero is the hall of mirrors: twelve framed panels standing round the
 * rim, each alternate one angled the other way like pleats in cloth, a
 * faceted diamond hanging in the middle, all turning to catch the light.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A framed mirror panel with a hinged side leaf. Centred on y = 0, its largest extent one unit. */
export function createMirrorHaloPieceGeometry() {
  const b = new RigBuilder('mirrorhalo.piece');
  b.part({ glow: 0.2 });
  b.box(0.34, 0.8, 0.03, { center: true });
  b.part({ edge: 1 });
  b.at({ p: [0, 0, 0.02] }, () => b.box(0.4, 0.86, 0.015, { center: true, taper: [0.88, 0.95] }));
  b.part({ pivot: [0.17, 0, 0], axis: [0, 1, 0], swing: -0.9, stage: 1 });
  b.at({ p: [0.27, 0, 0] }, () => b.box(0.18, 0.7, 0.025, { center: true }));

  // Corner studs on the frame and a jewel at the heart of the glass.
  b.part({ glow: 0.7, edge: 1 });
  [[-0.2, 0.43], [0.2, 0.43], [-0.2, -0.43], [0.2, -0.43]].forEach(([x, y]) => b.at({ p: [x, y, 0.03] }, () => b.orb(0.03, { sides: 5, rings: 3 })));
  b.at({ p: [0, 0, 0.035] }, () => b.orb(0.06, { sides: 4, rings: 2, ey: 1.6 }));
  b.part({ pivot: [-0.17, 0, 0], axis: [0, 1, 0], swing: 0.9, stage: 1, delay: 0.1 });
  b.at({ p: [-0.27, 0, 0] }, () => b.box(0.18, 0.7, 0.025, { center: true }));
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Twelve framed mirror panels, twelve frame caps and a hanging diamond. */
export function createMirrorHaloHeroGeometry() {
  const b = new RigBuilder('mirrorhalo.hero');
  b.fit('ring');
  b.part({ edge: 0.8 });
  b.torus(1, 0.025, { segs: 40, sides: 4 });
  b.ring(12, 0.98, (i) => {
    const tilt = (i % 2 ? 1 : -1) * 0.3;
    b.part({ pivot: [0, 0, 0], axis: [0, 1, 0], swing: (i % 2 ? 1 : -1) * 0.55, stage: 1, delay: (i % 3) * 0.04, glow: 0.12 });
    b.at({ p: [0, 0.5, 0], r: [0, tilt, 0] }, () => {
      b.box(0.5, 0.95, 0.03, { center: true });
      b.at({ p: [0, 0, -0.02] }, () => b.box(0.56, 1.0, 0.012, { center: true, taper: [0.92, 0.96] }));
    });
    b.part({ edge: 1, glow: 0.4, pivot: [0, 0, 0], axis: [0, 1, 0], swing: (i % 2 ? 1 : -1) * 0.55, stage: 1, delay: (i % 3) * 0.04 });
    b.at({ p: [0, 1.0, 0], r: [0, tilt, 0] }, () => b.pyramid(4, 0.1, 0.1, { phase: PI / 4 }));
  });
  b.part({ glow: 0.8, pivot: [0, 0.7, 0], axis: [0, 1, 0], swing: 1.5, stage: 1 });
  b.at({ p: [0, 0.7, 0] }, () => b.orb(0.18, { sides: 6, rings: 3, ey: 1.6 }));
  return b.build();
}
