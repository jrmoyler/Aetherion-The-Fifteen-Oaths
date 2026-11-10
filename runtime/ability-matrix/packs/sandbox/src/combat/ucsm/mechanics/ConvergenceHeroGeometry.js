import {
  addMotes,
  bindVfx,
  createMoteGeometry,
  createMoteMaterial,
  createSurfaceMaterial,
  FormBuilder,
  MOTE_STYLE,
  poolGeometry,
  poolMaterial
} from './ConvergenceCounterStanceVfx.js';

/**
 * Convergence hero surfaces — one authored energy silhouette per move.
 *
 * Every hero is a single indexed ribbon/facet geometry drawn with the kit's
 * surface shader (fbm filaments, fresnel rim, root-to-tip reveal, burn-edge
 * dissolve). They are authored in local cast space (+Z is the aim) and are
 * **bounded by the move's strike footprint**: every vertex lies inside one of
 * the shapes `convergenceStrikeShapes` returns, so the energy you see never
 * promises reach the hit does not have (the test suite checks this).
 *
 *  - promethean-ignition — nine spiral flame arms arching out over the nova
 *    disc, and six upright tongues licking off the core.
 *  - absolute-crystallization — a twisted crystal cluster in the core disc,
 *    a three-crystal crown on each satellite and rime spokes joining them
 *    (the spokes cross where core and satellite discs overlap).
 *  - storm-catalyst — ten jagged discharge spokes and three broken orbit arcs
 *    over the reaction disc.
 *  - hydrodynamic-synthesis — seven braided streams down the wave capsule and
 *    three curling crests standing up out of it.
 *  - elemental-lithification — a basalt spire, a ring of shards and a strata
 *    band in each eruption disc.
 *  - prismatic-multiplication — three refracted strands per beam with prism
 *    facets riding each beam.
 *
 * A bounded companion `Points` layer (48 motes sampled off the hero) shares
 * the hero's clock. Geometry and materials are pooled on the presentation and
 * disposed with it; a cast allocates none of them.
 */
export const CONVERGENCE_HEROES = Object.freeze([
  'promethean-ignition',
  'absolute-crystallization',
  'storm-catalyst',
  'hydrodynamic-synthesis',
  'elemental-lithification',
  'prismatic-multiplication'
]);

/** Core / edge colours of each hero (the live values are in CONVERGENCE_LOOK.palette). */
export const CONVERGENCE_HERO_COLORS = Object.freeze({
  'promethean-ignition': ['#ff842d', '#ff3d0c'],
  'absolute-crystallization': ['#9adfff', '#e8fbff'],
  'storm-catalyst': ['#b6a3ff', '#f0e8ff'],
  'hydrodynamic-synthesis': ['#38bfff', '#c8f4ff'],
  'elemental-lithification': ['#ce9a61', '#ffcf73'],
  'prismatic-multiplication': ['#d1bbff', '#9ef3ff']
});

/** How the motes over each hero move. */
const MOTE_STYLES = Object.freeze({
  'promethean-ignition': MOTE_STYLE.RISE,
  'absolute-crystallization': MOTE_STYLE.FALL,
  'storm-catalyst': MOTE_STYLE.ORBIT,
  'hydrodynamic-synthesis': MOTE_STYLE.ORBIT,
  'elemental-lithification': MOTE_STYLE.RISE,
  'prismatic-multiplication': MOTE_STYLE.FALL
});

/** Motes per hero. Fixed: the live density is a draw range over it. */
const HERO_MOTES = 48;

/* ------------------------------------------------------------------------ */
/* Authoring                                                                */
/* ------------------------------------------------------------------------ */

const TAU = Math.PI * 2;

/** Nova: spiral flame arms over the disc plus upright tongues off the core. */
function promethean(b) {
  for (let k = 0; k < 9; k++) {
    const a0 = (k * TAU) / 9;
    const arm = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const r = 0.4 + t * 2.5; // stays inside the 3.6 m nova
      const a = a0 + t * 0.8; // the spiral sweep
      arm.push([Math.sin(a) * r, 0.15 + Math.sin(t * Math.PI) * 1.1, Math.cos(a) * r]);
    }
    b.ribbon(arm, 0.18, 'xz');
  }
  // Tongues: vertical strips that wrap around the core, leaning outward.
  for (let k = 0; k < 6; k++) {
    const a = (k * TAU) / 6 + 0.26;
    const tongue = [];
    for (let i = 0; i <= 11; i++) {
      const t = i / 11;
      const r = 0.55 + 0.25 * t + 0.08 * Math.sin(t * 7 + k);
      tongue.push([Math.sin(a + t * 0.4) * r, 0.2 + t * 1.7, Math.cos(a + t * 0.4) * r]);
    }
    b.ribbon(tongue, 0.16, 'radial');
  }
}

/** Crown: core cluster, a crown on each satellite, rime spokes between. */
function crystallization(b) {
  b.facet(0, 1.1, 0, 0.62, 1.1, 0.42);
  for (let k = 0; k < 4; k++) {
    const a = (k * TAU) / 4 + 0.4;
    b.facet(Math.sin(a) * 0.75, 0.6, Math.cos(a) * 0.75, 0.24, 0.6, 0.18, Math.sin(a) * 0.12, a);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const x = Math.sin(a) * 3, z = Math.cos(a) * 3;
    b.facet(x, 0.8, z, 0.44, 0.8, 0.3, 0.08, a);
    b.facet(x * 0.87, 0.4, z * 0.87, 0.18, 0.4, 0.12, -0.05, -a);
    b.facet(x * 1.12, 0.32, z * 1.12, 0.14, 0.32, 0.1, 0.05, a * 2);
    // Rime spoke: centre to satellite. The core (2.2 m) and satellite (0.85 m
    // at 3 m) discs overlap, so a thin strip on the axis never leaves both.
    const spoke = [];
    for (let j = 0; j <= 18; j++) {
      const t = 0.08 + (j / 18) * 0.9;
      spoke.push([x * t, 0.06 + 0.05 * Math.sin(t * 19 + i), z * t]);
    }
    b.ribbon(spoke, 0.05, 'xz');
  }
}

/** Reaction disc: jagged radial discharge and broken orbit arcs. */
function storm(b) {
  for (let k = 0; k < 10; k++) {
    const a = (k * TAU) / 10;
    const bolt = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const r = 0.35 + t * 3.2;
      const kink = i === 16 ? 0 : i % 2 ? 0.13 : -0.13; // the zig-zag
      bolt.push([Math.sin(a) * r + Math.cos(a) * kink, 0.3 + 0.25 * Math.sin(t * 8 + k), Math.cos(a) * r - Math.sin(a) * kink]);
    }
    b.ribbon(bolt, 0.075, 'xz');
  }
  for (let ring = 0; ring < 3; ring++) {
    const r = 1.2 + ring;
    for (let seg = 0; seg < 2; seg++) {
      const a0 = seg * Math.PI + ring * 0.9;
      const arc = [];
      for (let i = 0; i <= 15; i++) {
        const a = a0 + (i / 15) * Math.PI * 0.7;
        arc.push([Math.sin(a) * r, 0.9 + ring * 0.35 + 0.08 * Math.sin(i * 1.9), Math.cos(a) * r]);
      }
      b.ribbon(arc, 0.05, 'xz');
    }
  }
}

/** Wave capsule: braided streams and curling crests. */
function hydrodynamic(b) {
  for (let k = -3; k <= 3; k++) {
    const stream = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      stream.push([k * 0.23 + Math.sin(t * 9 + k) * 0.12, 0.24 + 0.35 * Math.sin(t * Math.PI) + Math.abs(k) * 0.07, -2 + t * 8]);
    }
    b.ribbon(stream, 0.08, 'xz');
  }
  // Crests: a curl in the vertical plane through the aim, stood across the
  // capsule (offset along x, which the capsule's 1.25 m radius bounds).
  for (let c = 0; c < 3; c++) {
    const z0 = -0.5 + c * 2.4;
    const crest = [];
    for (let i = 0; i <= 15; i++) {
      const t = i / 15;
      const a = t * Math.PI * 1.35;
      crest.push([(c - 1) * 0.3, 0.2 + Math.sin(a) * 0.9 + t * 0.4, z0 + (1 - Math.cos(a)) * 0.55]);
    }
    b.ribbon(crest, 0.42, 'xz', 0.5);
  }
}

/** Three eruption discs: spire, shard ring, strata band. */
function lithification(b) {
  for (const z of [-2.5, 0, 2.5]) {
    b.facet(0, 1.25, z, 0.74, 1.25, 0.5, z * 0.03, z);
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      b.facet(Math.sin(a) * 0.67, 0.38, z + Math.cos(a) * 0.67, 0.2, 0.38, 0.14, 0.04, k);
    }
    const band = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * TAU * 0.92 + z;
      band.push([Math.sin(a) * 0.95, 0.12 + 0.05 * Math.sin(a * 5), z + Math.cos(a) * 0.95]);
    }
    b.ribbon(band, 0.06, 'xz', 0.4);
  }
}

/** Fan of three beams: refracted strands and riding prism facets. */
function prismatic(b) {
  for (const a of [-0.48, 0, 0.48]) {
    const ux = Math.sin(a), uz = Math.cos(a);
    for (let k = -1; k <= 1; k++) {
      const strand = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, r = t * 6;
        const off = k * 0.11 + Math.sin(t * 10 + k) * 0.045;
        strand.push([ux * r + uz * off, 0.6 + Math.sin(t * 6 + k) * 0.12, uz * r - ux * off]);
      }
      b.ribbon(strand, 0.045, 'xz');
    }
    for (let j = 1; j <= 4; j++) b.facet(ux * j * 1.3, 0.75, uz * j * 1.3, 0.12, 0.3, 0.1, 0, -a + j * 0.5);
  }
}

const AUTHORS = {
  'promethean-ignition': promethean,
  'absolute-crystallization': crystallization,
  'storm-catalyst': storm,
  'hydrodynamic-synthesis': hydrodynamic,
  'elemental-lithification': lithification,
  'prismatic-multiplication': prismatic
};

/** Deterministic hero geometry for `slug`. Throws on an unknown slug. */
export function createConvergenceHero(slug) {
  if (!CONVERGENCE_HEROES.includes(slug)) throw new Error('Unknown convergence hero');
  const b = new FormBuilder();
  AUTHORS[slug](b);
  return b.build(`convergence-hero:${slug}`);
}

/* ------------------------------------------------------------------------ */
/* Presentation                                                             */
/* ------------------------------------------------------------------------ */

/**
 * Add the hero surface and its motes to a convergence rig. Called by the
 * presentation after the sculpture is built. The lifetime and per-cast
 * strength come from the rig (`drawConvergenceArt` records them on the group),
 * so the dissolve lands exactly on the move's real lifetime.
 */
export function addConvergenceHero(v, group, uid) {
  const slug = (uid ?? 'mechanics/convergence/storm-catalyst').split('/').at(-1);
  if (!CONVERGENCE_HEROES.includes(slug)) return false;
  const [core, edge] = CONVERGENCE_HERO_COLORS[slug];
  const identity = CONVERGENCE_HEROES.indexOf(slug);
  const life = group.userData.convergenceLife ?? 1.8;
  const strength = group.userData.convergenceStrength ?? 1;
  const key = `convergenceHero:${slug}`;
  const material = `convergenceHeroMaterial:${slug}`;
  const dots = `convergenceMotes:${slug}`;
  const dotMat = `convergenceMoteMaterial:${slug}`;
  poolGeometry(v, key, () => createConvergenceHero(slug));
  poolMaterial(v, material, () =>
    createSurfaceMaterial({ clock: v.terrainTime, tint: core, tintB: edge, identity, paletteKey: slug })
  );
  poolGeometry(v, dots, () => createMoteGeometry(v.geo[key].getAttribute('position'), HERO_MOTES));
  poolMaterial(v, dotMat, () =>
    createMoteMaterial({ clock: v.terrainTime, tint: core, tintB: edge, style: MOTE_STYLES[slug], paletteKey: slug })
  );
  const hero = v.mesh(key, material, group);
  hero.name = key;
  hero.renderOrder = 5;
  bindVfx(v, hero, 'convergence', { life, strength, seed: identity, role: 'surface' });
  addMotes(v, group, 'convergence', dots, dotMat, { name: dots, life, strength, seed: identity });
  return true;
}
