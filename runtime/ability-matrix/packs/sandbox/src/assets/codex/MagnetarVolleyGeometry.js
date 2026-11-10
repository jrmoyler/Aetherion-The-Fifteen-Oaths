import { RigBuilder, PI, TAU } from './RigKit.js';

/**
 * Magnetar Volley — procedural geometry.
 *
 * Paired magnetic lobes: a dead star that throws its field as it flies.
 * The hero is the magnetar: a dense core with polar jets fore and aft,
 * and six dipole field loops wrapped round it, each loop swinging wide
 * as the field is torn open.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A bead with two dipole loops and a polar needle. Centred on y = 0, its largest extent one unit. */
export function createMagnetarVolleyPieceGeometry() {
  const b = new RigBuilder('magnetar.piece');
  b.part({ glow: 1 });
  b.orb(0.1, { sides: 6, rings: 3 });
  b.part({ glow: 0.3 });
  b.lathe([[0.001, 0.5], [0.025, 0.2], [0.025, -0.2], [0.001, -0.5]], 4, { phase: PI / 4 });
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    b.part({ pivot: [0, 0, 0], axis: [0, 1, 0], swing: s * 0.6, stage: 1, delay: i * 0.1, edge: 0.8 });
    b.tube((t) => [s * Math.pow(Math.sin(t * PI), 2) * 0.32, Math.cos(t * PI) * 0.4, 0], { r: 0.014, sides: 4, segs: 14 });
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A banded core, two polar jets, six dipole loops and an equatorial band. */
export function createMagnetarVolleyHeroGeometry() {
  const b = new RigBuilder('magnetar.hero');
  b.fit('mass');
  b.aimZ(() => {
    // Core with a dense equatorial band.
    b.part({ glow: 1 });
    b.orb(0.2, { sides: 10, rings: 5 });
    b.part({ edge: 0.9 });
    b.torus(0.24, 0.025, { segs: 24, sides: 5 });
    // Polar jets.
    b.part({ glow: 0.5 });
    b.lathe([[0.001, 1.0], [0.035, 0.6], [0.05, 0.22]], 6, {});
    b.lathe([[0.001, -1.0], [0.035, -0.6], [0.05, -0.22]], 6, {});
    // Six dipole loops around the axis; each swings wide on the beat.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      b.part({ pivot: [0, 0, 0], axis: [-Math.sin(a), 0, Math.cos(a)], swing: 0.5, stage: 1, delay: (i % 3) * 0.08, edge: 0.7, glow: 0.2 });
      b.at({ r: [0, a, 0] }, () => b.tube((t) => {
        const th = t * PI;
        const r = 0.9 * Math.pow(Math.sin(th), 2) + 0.01;
        return [Math.sin(th) * r * 0.55 + 0.001, Math.cos(th) * r, 0];
      }, { r: 0.012, sides: 4, segs: 28 }));
    }
  });
  return b.build();
}
