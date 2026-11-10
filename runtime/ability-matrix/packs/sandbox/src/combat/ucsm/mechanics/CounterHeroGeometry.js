import { FormBuilder } from './ConvergenceCounterStanceVfx.js';

/**
 * Counter hero surfaces — the guard face each counter raises toward its
 * attacker, and the shape of the strike it returns.
 *
 * Authored in the guard's own frame: the surface stands in the vertical XY
 * plane (offset along +Z by the rig, so it sits between caster and attacker),
 * roughly 2.2 m wide and 2 m tall. The same geometry is reused, scaled down,
 * as the returning projectile, so a guard and its return read as one move.
 *
 *  - backdraft-reprisal — seven flame tongues with backdraft curls rolling off
 *    their tips: fire drawn in, then thrown back.
 *  - feedback-execution — five zig-zag bolts with forked branches under a
 *    capacitor arc that spans the guard.
 *  - undertow-reversal — five stacked swells and twin vortex spirals at the
 *    centre: the pull that drags the blow back.
 *  - faultline-retort — a wall of upthrust crystals bound by strata bands.
 *  - facet-reprisal — a rose of eight facets round a central gem, framed by a
 *    hexagonal lattice.
 *  - shatterpoint-reversal — a fan of ice shards and the radial cracks of a
 *    pane at the moment it breaks.
 *
 * Built once per presentation and pooled; deterministic (no randomness), so
 * the guard is identical on every client and in every replay.
 */
export const COUNTER_HERO_SLUGS = Object.freeze([
  'backdraft-reprisal',
  'feedback-execution',
  'undertow-reversal',
  'faultline-retort',
  'facet-reprisal',
  'shatterpoint-reversal'
]);

const TAU = Math.PI * 2;

function backdraft(b) {
  for (let k = -3; k <= 3; k++) {
    const tall = 1.35 + (3 - Math.abs(k)) * 0.14;
    const tongue = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      tongue.push([k * 0.25 + Math.sin(t * 5 + k) * 0.13 * t, 0.1 + t * tall, 0.06 * Math.sin(t * 7 + k)]);
    }
    b.ribbon(tongue, 0.1 + (3 - Math.abs(k)) * 0.02, 'xy');
  }
  // Backdraft curls: the flame rolling back on itself at the crown.
  for (let k = -2; k <= 2; k++) {
    const curl = [];
    const cx = k * 0.38, cy = 1.55 + (2 - Math.abs(k)) * 0.12;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, a = t * TAU * 0.85 + k;
      const r = 0.22 * (1 - t * 0.7);
      curl.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.08 + t * 0.06]);
    }
    b.ribbon(curl, 0.045, 'xy');
  }
}

function feedback(b) {
  for (let k = -2; k <= 2; k++) {
    const bolt = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      bolt.push([k * 0.35 + (i % 2 ? 0.13 : -0.13) * (1 - t), 0.15 + t * 1.65, 0.03 * k]);
    }
    b.ribbon(bolt, 0.045, 'xy');
    // Forks off the main bolt, away from the guard's centre line.
    for (let j = 0; j < 2; j++) {
      const t = 0.3 + j * 0.25, x = k * 0.35 + 0.1, y = 0.15 + t * 1.65, side = k < 0 ? -1 : 1;
      b.ribbon([[x, y, 0], [x + side * 0.25, y + 0.2, 0], [x + side * 0.34, y + 0.4, 0]], 0.025, 'xy');
    }
  }
  // The capacitor arc: a shallow bow spanning the bolts.
  const arc = [];
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI * (0.12 + 0.76 * (i / 20));
    arc.push([Math.cos(a) * 1.0, 1.0 + Math.sin(a) * 0.95, 0.05]);
  }
  b.ribbon(arc, 0.035, 'xy', 0.3);
}

function undertow(b) {
  for (let k = 0; k < 5; k++) {
    const swell = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      swell.push([(t - 0.5) * 2.2, 0.3 + k * 0.24 + 0.2 * Math.sin(t * 6 + k * 0.8), 0.04 * k]);
    }
    b.ribbon(swell, 0.055, 'xy');
  }
  // Twin vortices: logarithmic spirals turning in opposite senses.
  for (const side of [-1, 1]) {
    const spiral = [];
    for (let i = 0; i <= 22; i++) {
      const t = i / 22, a = side * t * TAU * 1.4;
      const r = 0.05 + 0.4 * t;
      spiral.push([side * 0.42 + Math.cos(a) * r, 0.95 + Math.sin(a) * r, 0.12]);
    }
    b.ribbon(spiral, 0.04, 'xy', 0.4);
  }
}

function faultline(b) {
  for (let k = -3; k <= 3; k++) {
    const x = k * 0.27;
    b.facet(x, 0.7 + (Math.abs(k) % 2) * 0.16, 0, 0.16, 0.5 + (3 - Math.abs(k)) * 0.07, 0.16, k * 0.04);
  }
  // Strata bands lashing the wall together.
  for (let s = 0; s < 3; s++) {
    const band = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      band.push([(t - 0.5) * 2.0, 0.35 + s * 0.38 + 0.05 * Math.sin(t * 11 + s), 0.18]);
    }
    b.ribbon(band, 0.035, 'xy', 0.25);
  }
}

function facet(b) {
  for (let k = 0; k < 8; k++) {
    const a = (k * TAU) / 8;
    b.facet(Math.sin(a) * 0.8, 0.9 + Math.cos(a) * 0.62, 0, 0.15, 0.31, 0.17, Math.sin(a) * 0.1);
  }
  b.facet(0, 0.9, 0.04, 0.27, 0.55, 0.22);
  // Hexagonal lattice framing the rose.
  const frame = [];
  for (let i = 0; i <= 6; i++) {
    const a = (i * TAU) / 6 + Math.PI / 6;
    frame.push([Math.sin(a) * 1.08, 0.9 + Math.cos(a) * 0.84, 0.06]);
  }
  b.ribbon(frame, 0.03, 'xy', 0.1);
}

function shatterpoint(b) {
  for (let k = -4; k <= 4; k++) {
    const x = k * 0.22;
    b.facet(x, 0.75 + (0.4 - Math.abs(k) * 0.08), 0, 0.095, 0.6 - Math.abs(k) * 0.07, 0.11, -x * 0.07);
  }
  // Radial cracks of the breaking pane, kinked once each.
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI * 0.45 + (k / 6) * Math.PI * 0.9;
    const kink = 0.18 * Math.sin(k * 2.3);
    b.ribbon([
      [0, 0.85, 0.14],
      [Math.sin(a) * 0.45 + kink * 0.3, 0.85 + Math.cos(a) * 0.45, 0.14],
      [Math.sin(a + kink) * 0.95, 0.85 + Math.cos(a + kink) * 0.9, 0.14]
    ], 0.02, 'xy', 0.2);
  }
}

const AUTHORS = {
  'backdraft-reprisal': backdraft,
  'feedback-execution': feedback,
  'undertow-reversal': undertow,
  'faultline-retort': faultline,
  'facet-reprisal': facet,
  'shatterpoint-reversal': shatterpoint
};

/** Deterministic hero geometry for `slug`. Throws on an unknown slug. */
export function createCounterHeroGeometry(slug) {
  const author = AUTHORS[slug];
  if (!author) throw new Error(`Unknown counter hero: ${slug}`);
  const b = new FormBuilder();
  author(b);
  return b.build(`counter-hero:${slug}`);
}
