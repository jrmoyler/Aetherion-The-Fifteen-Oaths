import {
  addGround,
  addMotes,
  bindRigSolids,
  bindVfx,
  createGroundMaterial,
  createMoteGeometry,
  createMoteMaterial,
  createMoteRing,
  createSurfaceMaterial,
  FormBuilder,
  GROUND_PATTERN,
  MOTE_STYLE,
  poolGeometry,
  poolMaterial,
  registerRig
} from './ConvergenceCounterStanceVfx.js';

/**
 * Stance hero mantles — the energy each sovereignty form wears while it is
 * held. Authored around the caster (Y up, origin at the feet), inside a
 * 1.5 m radius and below 3 m, so the mantle hugs the body instead of reading
 * as an area effect: a stance is a state of the caster, not a zone.
 *
 *  - crown-of-the-first-ember — a crown of nine flame tongues over the head,
 *    a halo band and two ember trails spiralling down the body.
 *  - the-pale-monarch — a ring of frost facets, a tall thin crown, and three
 *    hanging rime veils behind the shoulders like a cape.
 *  - thundergod-conduction — eight vertical conduction zig-zags caged by three
 *    crackling horizontal rings.
 *  - leviathans-mantle — six helical currents winding up the body and two
 *    foam crests.
 *  - titan-of-the-deep-strata — paired plates of stone round the body,
 *    stacked strata bands and two shoulder boulders.
 *  - aegis-exemplar — six ward facets, a sweep of short guard arcs at the
 *    feet and a halo of force over the head.
 *
 * The mantle is drawn with the kit's surface shader; a companion 48-mote layer
 * is sampled off it and shares its clock, and a persistent ward mark and an
 * orbiting mote ring sit at the feet. Everything is pooled on the presentation.
 */
export const STANCE_HEROES = Object.freeze([
  'crown-of-the-first-ember',
  'the-pale-monarch',
  'thundergod-conduction',
  'leviathans-mantle',
  'titan-of-the-deep-strata',
  'aegis-exemplar'
]);

/** Core / edge colours (live values live in STANCE_LOOK.palette). */
export const STANCE_HERO_COLORS = Object.freeze({
  'crown-of-the-first-ember': ['#ff7730', '#ffd27a'],
  'the-pale-monarch': ['#a7eaff', '#ffffff'],
  'thundergod-conduction': ['#b8a6ff', '#f1ebff'],
  'leviathans-mantle': ['#42c9f2', '#c7f3ff'],
  'titan-of-the-deep-strata': ['#c99762', '#ffd08a'],
  'aegis-exemplar': ['#a5e7f5', '#f0fdff']
});

const MOTES = Object.freeze({
  'crown-of-the-first-ember': [MOTE_STYLE.RISE, GROUND_PATTERN.SCORCH],
  'the-pale-monarch': [MOTE_STYLE.FALL, GROUND_PATTERN.RIME],
  'thundergod-conduction': [MOTE_STYLE.ORBIT, GROUND_PATTERN.ARC],
  'leviathans-mantle': [MOTE_STYLE.ORBIT, GROUND_PATTERN.RIPPLE],
  'titan-of-the-deep-strata': [MOTE_STYLE.RISE, GROUND_PATTERN.FRACTURE],
  'aegis-exemplar': [MOTE_STYLE.ORBIT, GROUND_PATTERN.WARD]
});

const TAU = Math.PI * 2;

/** A horizontal band around the body at `y`, radius `r`, covering `sweep` of a turn. */
function band(b, y, r, width, sweep = 0.94, phase = 0, wobble = 0.04) {
  const points = [];
  for (let i = 0; i <= 24; i++) {
    const a = phase + (i / 24) * TAU * sweep;
    points.push([Math.sin(a) * r, y + wobble * Math.sin(a * 5 + phase), Math.cos(a) * r]);
  }
  b.ribbon(points, width, 'xz', 0.3);
}

function ember(b) {
  for (let k = 0; k < 9; k++) {
    const a = (k * TAU) / 9;
    const tongue = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const r = 0.6 + 0.16 * Math.sin(t * 5 + k) * t;
      tongue.push([Math.sin(a) * r + 0.08 * Math.sin(t * 8 + k) * t, 1.65 + t * (0.75 + (k % 3) * 0.1), Math.cos(a) * r]);
    }
    b.ribbon(tongue, 0.09, 'xy');
  }
  band(b, 2.45, 0.55, 0.05, 1, 0.3, 0.03);
  // Ember trails: spirals falling from the crown to the knees.
  for (let s = 0; s < 2; s++) {
    const trail = [];
    for (let i = 0; i <= 19; i++) {
      const t = i / 19, a = s * Math.PI + t * TAU * 1.2;
      trail.push([Math.sin(a) * 0.9, 2.2 - t * 1.9, Math.cos(a) * 0.9]);
    }
    b.ribbon(trail, 0.05, 'radial');
  }
}

function paleMonarch(b) {
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI) / 5;
    b.facet(Math.sin(a) * 0.78, 1.25, Math.cos(a) * 0.78, 0.12, 0.65 + (k % 3) * 0.13, 0.12, Math.sin(a) * 0.12, a);
  }
  // A tall, thin crown of six spires.
  for (let k = 0; k < 6; k++) {
    const a = (k * TAU) / 6 + 0.3;
    b.facet(Math.sin(a) * 0.32, 2.35, Math.cos(a) * 0.32, 0.05, 0.3 + (k % 2) * 0.12, 0.05, Math.sin(a) * 0.05, a);
  }
  // Three rime veils hanging behind the shoulders.
  for (let k = -1; k <= 1; k++) {
    const a = Math.PI + k * 0.45;
    const veil = [];
    for (let i = 0; i <= 13; i++) {
      const t = i / 13;
      const r = 0.55 + t * 0.35;
      veil.push([Math.sin(a) * r, 2.0 - t * 1.6, Math.cos(a) * r]);
    }
    b.ribbon(veil, 0.16, 'radial', 0.5);
  }
}

function thundergod(b) {
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const bolt = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, r = 0.8 + (i % 2 ? 1 : -1) * 0.1;
      bolt.push([Math.sin(a) * r, 0.15 + t * 2.2, Math.cos(a) * r]);
    }
    b.ribbon(bolt, 0.04, 'xy');
  }
  for (let ring = 0; ring < 3; ring++) band(b, 0.6 + ring * 0.7, 0.95, 0.03, 0.85, ring * 2.1, 0.09);
}

function leviathan(b) {
  for (let k = 0; k < 6; k++) {
    const current = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28, a = (k * Math.PI) / 3 + t * Math.PI * 1.1, r = 0.93 + 0.07 * Math.sin(t * 8 + k);
      current.push([Math.sin(a) * r, 0.15 + t * 2.15, Math.cos(a) * r]);
    }
    b.ribbon(current, 0.08, 'xy');
  }
  band(b, 0.3, 1.12, 0.07, 1, 0, 0.06);
  band(b, 1.9, 0.82, 0.05, 0.8, 1.7, 0.08);
}

function titan(b) {
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    b.facet(Math.sin(a), 1.0, Math.cos(a), 0.22, 0.62, 0.17, Math.sin(a) * 0.08, a);
    b.facet(Math.sin(a) * 1.05, 0.32, Math.cos(a) * 1.05, 0.18, 0.28, 0.15, 0, a);
  }
  for (let s = 0; s < 3; s++) band(b, 0.5 + s * 0.5, 1.12 + s * 0.03, 0.035, 0.9, s * 1.3, 0.02);
  // Shoulder boulders.
  for (const side of [-1, 1]) b.facet(side * 0.55, 1.95, 0, 0.28, 0.24, 0.26, side * 0.05, side);
}

function aegis(b) {
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    b.facet(Math.sin(a) * 0.88, 1.15, Math.cos(a) * 0.88, 0.2, 0.62, 0.09, Math.sin(a) * 0.08, a);
  }
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    const arc = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, s = a + (t - 0.5) * 0.25;
      arc.push([Math.sin(s) * 1.02, 0.25 + (k % 2) * 0.06, Math.cos(s) * 1.02]);
    }
    b.ribbon(arc, 0.025, 'xy');
  }
  band(b, 2.2, 0.42, 0.04, 1, 0, 0.02);
}

const AUTHORS = {
  'crown-of-the-first-ember': ember,
  'the-pale-monarch': paleMonarch,
  'thundergod-conduction': thundergod,
  'leviathans-mantle': leviathan,
  'titan-of-the-deep-strata': titan,
  'aegis-exemplar': aegis
};

/** Deterministic mantle geometry for `slug`. Throws on an unknown slug. */
export function createStanceHero(slug) {
  if (!STANCE_HEROES.includes(slug)) throw new Error('Unknown stance hero');
  const b = new FormBuilder();
  AUTHORS[slug](b);
  return b.build(`stance-hero:${slug}`);
}

/**
 * Add the mantle, its motes, the ward mark and the orbit ring to a held
 * stance. The stance item is persistent (life 0): these layers, and every
 * solid piece of the regalia already on the rig (including the presentation's
 * own canonical Aegis rig), exit with the rig — see `rigExit` in the kit.
 */
export function addStanceHero(v, group, uid) {
  const slug = (uid ?? 'mechanics/stance/aegis-exemplar').split('/').at(-1);
  if (!STANCE_HEROES.includes(slug)) return false;
  // The regalia is built by now: bind its solid pieces to sink out with the rig.
  registerRig(v, group);
  bindRigSolids(v, group, 'stance');
  const [core, edge] = STANCE_HERO_COLORS[slug];
  const [moteStyle, pattern] = MOTES[slug];
  const identity = STANCE_HEROES.indexOf(slug);
  const clock = v.terrainTime;
  const geo = `stanceHero:${slug}`;
  const mat = `stanceHeroMaterial:${slug}`;
  const points = `stanceMotes:${slug}`;
  const pointMat = `stanceMoteMaterial:${slug}`;
  poolGeometry(v, geo, () => createStanceHero(slug));
  poolMaterial(v, mat, () => createSurfaceMaterial({ clock, tint: core, tintB: edge, identity, paletteKey: slug }));
  poolGeometry(v, points, () => createMoteGeometry(v.geo[geo].getAttribute('position'), 48));
  poolMaterial(v, pointMat, () => createMoteMaterial({ clock, tint: core, tintB: edge, style: moteStyle, paletteKey: slug }));
  const ground = poolMaterial(v, `stanceAura:${slug}`, () => createGroundMaterial({ clock, tint: core, tintB: edge, pattern, paletteKey: slug }));
  const orbit = poolGeometry(v, 'stanceOrbitRing', () => createMoteRing(36, 1.25, 0.2, 0.08));
  const orbitMat = poolMaterial(v, `stanceOrbitMaterial:${slug}`, () =>
    createMoteMaterial({ clock, tint: edge, tintB: core, style: MOTE_STYLE.ORBIT, paletteKey: slug }));

  const hero = v.mesh(geo, mat, group);
  hero.name = geo;
  hero.renderOrder = 5;
  bindVfx(v, hero, 'stance', { role: 'surface', seed: identity });
  addMotes(v, group, 'stance', points, pointMat, { name: points, seed: identity });
  addGround(v, group, 'stance', ground, 1.35, { name: 'stance-aura', seed: identity, strength: 0.7 });
  addMotes(v, group, 'stance', orbit, orbitMat, { name: 'stance-orbit-motes', seed: identity + 0.5 });
  return true;
}
