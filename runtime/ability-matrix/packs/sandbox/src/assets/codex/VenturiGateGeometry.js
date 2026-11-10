import { RigBuilder, PI } from './RigKit.js';

/**
 * Venturi Gate — procedural geometry.
 *
 * A venturi of air bars squeezes the circle, then coughs it out.
 * The hero is the nozzle: twelve curved bars tracing a throat pinched to
 * half its width, three hoops that hold it, and a flared mouth whose
 * bars kick outward on the cough.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A pinched nozzle ring with three flared fins. Centred on y = 0, its largest extent one unit. */
export function createVenturiGatePieceGeometry() {
  const b = new RigBuilder('venturi.piece');
  b.part({ crease: 40 });
  b.lathe([[0.3, -0.5], [0.16, -0.05], [0.14, 0.05], [0.28, 0.5]], 10, { cap: false });
  b.ring(3, 0.28, (i) => {
    b.part({ pivot: [0, 0.5, 0], axis: [1, 0, 0], swing: 0.6, stage: 1, delay: i * 0.1 });
    b.at({ p: [0, 0.48, 0], r: [0.2, 0, 0] }, () => b.blade({ len: 0.3, w: 0.05, thick: 0.01, segs: 4 }));
  });
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Twelve bent bars, three hoops, six inner baffles and a mouth rim. */
export function createVenturiGateHeroGeometry() {
  const b = new RigBuilder('venturi.hero');
  b.fit('ring');
  const radius = (t) => 1 - 0.55 * Math.sin(t * PI) * Math.sin(t * PI) ** 0.5 + 0.12 * t;
  // Twelve bars along the pinched profile; the mouth ends kick out.
  b.ring(12, 0, (i) => {
    b.part({ pivot: [0, 0.55, radius(0.5)], axis: [1, 0, 0], swing: 0.45, stage: 1, delay: (i % 4) * 0.05, glow: i % 4 === 0 ? 0.3 : 0 });
    b.tube((t) => [0, t * 1.2, radius(t)], { r: 0.022, sides: 4, segs: 16 });
  });
  // Hoops at the mouth, the throat and the exit.
  [0, 0.6, 1.2].forEach((y, i) => {
    b.part({ edge: 0.8 });
    b.at({ p: [0, y, 0] }, () => b.torus(radius(y / 1.2) + 0.01, 0.028, { segs: 36, sides: 4 }));
  });
  // Baffles: six thin vanes inside the throat.
  b.part({ crease: 30 });
  b.ring(6, 0.3, (i) => {
    b.at({ p: [0, 0.6, 0], r: [0, 0, 0] }, () => b.box(0.015, 0.34, 0.26, { center: true }));
  });
  return b.build();
}
