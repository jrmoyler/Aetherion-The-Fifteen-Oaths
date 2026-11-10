import { RigBuilder, PI, TAU, helixPath } from './RigKit.js';

/**
 * Filament Volley — procedural geometry.
 *
 * Filaments arc and stitch whatever they land on.
 * The hero is the needle of light: a thin core with six curved barbs
 * like fishhooks that spring open to stitch, and a thread of bright
 * filament winding out behind it.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A barbed needle with two hooked barbs and a thread. Centred on y = 0, its largest extent one unit. */
export function createFilamentVolleyPieceGeometry() {
  const b = new RigBuilder('filament.piece');
  b.part({ glow: 0.8 });
  b.lathe([[0.001, 0.5], [0.04, 0.3], [0.04, -0.4], [0.001, -0.5]], 4, { phase: PI / 4 });
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    b.part({ pivot: [0, 0.2, 0], axis: [0, 0, 1], swing: s * -0.7, stage: 1, delay: i * 0.1 });
    b.tube((t) => [s * Math.sin(t * 1.8) * 0.18, 0.2 - t * 0.28, 0], { r: 0.012, sides: 4, segs: 6 });
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. A needle core, six fishhook barbs, a helical thread and an eyelet. */
export function createFilamentVolleyHeroGeometry() {
  const b = new RigBuilder('filament.hero');
  b.fit('mass');
  b.aimZ(() => {
    // Needle core.
    b.part({ glow: 0.9 });
    b.lathe([[0.001, 1.0], [0.045, 0.8], [0.05, 0.0], [0.03, -0.1]], 5, { phase: PI / 10 });
    // Six barbs sweeping back like fishhooks.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      b.part({ pivot: [0, 0.75 - (i % 2) * 0.12, 0], axis: [-s, 0, c], swing: 0.55, stage: 1, delay: (i % 3) * 0.07, glow: 0.3, edge: 0.7 });
      b.tube((t) => [c * Math.sin(t * 1.9) * 0.2, 0.75 - (i % 2) * 0.12 - t * 0.35, s * Math.sin(t * 1.9) * 0.2], { r: 0.012, sides: 4, segs: 8 });
    }
    // The thread: a bright filament wound out behind.
    b.part({ crease: 40, edge: 0.2, glow: 0.5 });
    b.ribbon(helixPath(0.06, 0.18, 2.5, -1.0, -0.1, 0), { w: 0.03, segs: 30, up: [0, 1, 0] });
    // Eyelet.
    b.part({ edge: 0.8 });
    b.at({ p: [0, -0.1, 0], r: [0, 0, PI / 2] }, () => b.torus(0.07, 0.014, { segs: 10, sides: 4 }));
  });
  return b.build();
}
