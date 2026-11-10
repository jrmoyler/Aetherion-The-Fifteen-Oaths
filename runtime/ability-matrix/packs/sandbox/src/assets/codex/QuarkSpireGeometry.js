import { RigBuilder, TAU, lerp, ngon, helixPath } from './RigKit.js';

/**
 * Quark Spire — procedural geometry.
 *
 * A three-strand quark helix: a spire that cannot be pulled apart.
 * The hero is the helix: three strands wound around one another, a
 * quark bead riding each, gluon rungs tying them at every turn, and a
 * triangular foot. The strands wind and unwind about the axis.
 *
 * Two solids, both from RigKit: a small piece thrown through the instanced
 * layer, and one hero rig at the heart of the cast. Every part carries its own
 * pivot and hinge, so the detail shader folds them as the cast progresses.
 */

/** The thrown piece. A short three-strand twist with a bead on each strand. Centred on y = 0, its largest extent one unit. */
export function createQuarkSpirePieceGeometry() {
  const b = new RigBuilder('quarkspire.piece');
  for (let i = 0; i < 3; i++) {
    b.part({ pivot: [0, 0, 0], axis: [0, 1, 0], swing: 0.9, stage: 1, delay: i * 0.08, glow: 0.35 });
    b.tube(helixPath(0.14, 0.14, 1.2, 1, -0.5, (i / 3) * TAU), { r: 0.018, sides: 4, segs: 20 });
    const a = (i / 3) * TAU + 1.2 * TAU;
    b.at({ p: [Math.cos(a) * 0.14, 0.5, Math.sin(a) * 0.14] }, () => b.orb(0.045, { sides: 5, rings: 3 }));
  }
  return b.build({ center: true, fit: 1 });
}

/** The hero rig. Three helical strands, nine quark beads, twelve gluon rungs and a triangular foot. */
export function createQuarkSpireHeroGeometry() {
  const b = new RigBuilder('quarkspire.hero');
  b.fit('mass');
  b.part();
  b.prism(ngon(3, 0.75), 0, 0.07, { taper: 0.8 });
  // Three strands; each unwinds about the axis on the beat.
  for (let i = 0; i < 3; i++) {
    const phase = (i / 3) * TAU;
    b.part({ pivot: [0, 0, 0], axis: [0, 1, 0], swing: 0.9 - i * 0.15, stage: 1, delay: i * 0.08, glow: 0.35 });
    b.tube(helixPath(0.34, 0.26, 2.6, 1.7, 0.1, phase), { r: 0.032, sides: 5, segs: 56 });
    // Quark beads at three heights on this strand.
    [0.25, 0.55, 0.85].forEach((t) => {
      const a = phase + t * 2.6 * TAU;
      const r = lerp(0.34, 0.26, t);
      b.at({ p: [Math.cos(a) * r, 0.1 + t * 1.7, Math.sin(a) * r] }, () => b.orb(0.075, { sides: 6, rings: 3 }));
    });
  }
  // Gluon rungs tie neighbouring strands at four heights.
  b.part({ edge: 0.5, glow: 0.2 });
  for (let k = 0; k < 4; k++) {
    const t = 0.15 + k * 0.22;
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * TAU + t * 2.6 * TAU;
      const a1 = ((i + 1) / 3) * TAU + t * 2.6 * TAU;
      const r = lerp(0.34, 0.26, t);
      const y = 0.1 + t * 1.7;
      b.tube((u) => [lerp(Math.cos(a0), Math.cos(a1), u) * r, y, lerp(Math.sin(a0), Math.sin(a1), u) * r], { r: 0.008, sides: 3, segs: 2 });
    }
  }
  return b.build();
}
