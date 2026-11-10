import {
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Shape,
  TubeGeometry,
  Vector2,
  Vector3
} from 'three';
import { CONVERGENCE_VARIANTS, convergenceStrikeShapes } from './ConvergenceVariants.js';
import { MECHANIC_PRESETS } from './presets.js';
import {
  addGround,
  addMotes,
  addShock,
  bindSolidExit,
  createGroundMaterial,
  createMoteGeometry,
  createMoteMaterial,
  createMoteRing,
  createShockMaterial,
  createWarpMaterial,
  GROUND_PATTERN,
  MOTE_STYLE,
  overlayMaterial,
  poolGeometry,
  poolMaterial,
  registerLook,
  registerRig
} from './ConvergenceCounterStanceVfx.js';
import { armBeat, buildFeedbackFolder } from './ConvergenceCounterStanceFeedback.js';
import { CONVERGENCE_HERO_COLORS } from './ConvergenceHeroGeometry.js';
import { LAYER } from '../../../core/Layers.js';

/**
 * CONVERGENCE — the presentation of the six convergence moves.
 *
 * A convergence is two beats on the presentation's clock: the **charge**
 * (`anticipation` cue, the move's real anticipation time) and the **impact**
 * (`convergence` cue, `life` seconds). The reaction itself resolves on the
 * impact tick, so the impact frame must already show the full strike range —
 * the presentation pins the rig's scale to 1 and only the detail animates.
 *
 * Layers, charge:
 *
 *   1. **footprint overlay** — the reaction disc and an inner ring of shards in
 *      the element's overlay colour, drawn over raised terrain (no depth test)
 *      and turned slowly by the presentation.
 *   2. **gathering motes** — a ring of motes outside the footprint, pulled in
 *      to the core across the real anticipation time.
 *   3. **forming ground mark** — the element's floor mark spreading out from
 *      the cast point at low strength, so the impact mark is already there.
 *
 * Layers, impact:
 *
 *   1. **sculpture** — solid, shadow-casting authored forms (brazier and flame
 *      tongues, hexagonal crystal spires, curling wave crests, basalt
 *      columns, prism blades, a conductor coil), animated by the presentation's
 *      `convergenceMotion` kinds and sunk back into the floor over the exit.
 *   2. **hero surface + motes** — `ConvergenceHeroGeometry.js`: the energy
 *      ribbons bounded by the strike footprint, with a reveal on the way in and
 *      a burning dissolve on the way out.
 *   3. **ground mark** — scorch / rime / ripple / fracture / facet / arc,
 *      fitted to each strike shape (discs as discs, capsules as ellipses),
 *      cooling and fading over the exit.
 *   4. **impact overlay** — the exact strike boundaries (`impact-disc-*`,
 *      `impact-cap-*`, `impact-rail-*`), visible only on the hit itself (the
 *      presentation hides the `convergence-impact` group after half a second).
 *   5. **shockwave + distortion** — a ring front per strike shape easing out
 *      to the boundary, with its twin on `LAYER.DISTORTION`. They are children
 *      of the rig, not of the impact group, so a long `shockTime` runs its full
 *      course and fades instead of vanishing with the boundary overlay.
 *   6. **burst motes** — thrown out of the strike shapes once and decaying.
 *   7. **beat feedback** — camera shake, a screen flash in the move's edge
 *      colour and a point-light punch on the impact tick
 *      (`ConvergenceCounterStanceFeedback.js`), scaled by the look block and
 *      `settings.global`.
 *
 * Everything is pooled on the presentation (`v.geo` / `v.mat`) and released by
 * its `dispose`. Per-cast state is plain data in `userData`; timing reads the
 * fixed combat tick, so the whole cast is deterministic and pauses with the
 * simulation. Reduced motion freezes the clock-driven flourish (filaments,
 * orbiting motes, the charge spin) and the camera shake, and keeps the beats.
 */

/* ------------------------------------------------------------------------ */
/* Look — every value is sampled per draw, so edits land mid-cast          */
/* ------------------------------------------------------------------------ */

export const CONVERGENCE_LOOK = registerLook('convergence', {
  /* --- hero surface --- */
  glow: 1.15, // emissive multiplier on surfaces, shock and motes (× global.glow)
  opacity: 1.0, // master alpha (× global.opacity)
  fresnel: 1.0, // rim strength on the hero ribbons (× global.fresnel)
  filamentSpeed: 1.0, // how fast the filaments run along the ribbons
  noiseScale: 1.0, // filament / mark frequency (× global.noiseFrequency)
  noiseAmount: 1.0, // filament / breath strength (× global.noiseStrength)
  dissolveEdge: 0.09, // width of the burning line on the exit dissolve
  /* --- envelope (seconds) --- */
  introTime: 0.22, // reveal / spread time at the start of each layer
  outroTime: 0.6, // dissolve, cool-down and sink at the end of the impact
  /* --- motes --- */
  moteSize: 1.0, // × global.particleSize
  moteSpeed: 1.0, // × global.particleSpeed
  moteDensity: 1.0, // fraction of each layer's fixed capacity drawn (× global.particleCount)
  /* --- ground mark --- */
  groundOpacity: 0.85, // alpha of the char / frost / water bed
  groundGlow: 1.1, // emissive strength of the cracks, rime and rings
  /* --- shockwave --- */
  shockTime: 0.42, // seconds for the front to reach the boundary
  shockWidth: 0.14, // thickness of the front, in fractions of the radius
  warp: 1.0, // strength of the refraction ring (× global.distortion)
  /* --- beat feedback on the impact tick (× global.explosionIntensity) --- */
  shakeAmount: 0.32, // camera trauma (× global.cameraShake)
  shakeTime: 0.45, // seconds for the shake to settle
  flashStrength: 0.3, // screen flash in the move's edge colour
  lightIntensity: 9, // point-light punch (× global.lightIntensity)
  lightRadius: 11, // its reach in metres (× global.lightRadius)
  /* --- palette, per move: core and edge colours of every shader layer --- */
  palette: Object.fromEntries(
    Object.entries(CONVERGENCE_HERO_COLORS).map(([slug, [core, edge]]) => [slug, { core, edge }])
  )
});

/** Mounts every key above as a live control, in the house editor style. */
export function buildConvergenceEditor(gui, Editor, c = CONVERGENCE_LOOK) {
  const root = gui.addFolder('✺  Convergence mechanics');
  const hero = root.addFolder('Hero surface');
  Editor.range(hero, c, 'glow', 0, 4, 0.01, 'glow');
  Editor.range(hero, c, 'opacity', 0, 2, 0.01, 'opacity');
  Editor.range(hero, c, 'fresnel', 0, 3, 0.01, 'fresnel');
  Editor.range(hero, c, 'filamentSpeed', 0, 4, 0.01, 'filament speed');
  Editor.range(hero, c, 'noiseScale', 0.2, 4, 0.01, 'noise scale');
  Editor.range(hero, c, 'noiseAmount', 0, 3, 0.01, 'noise amount');
  Editor.range(hero, c, 'dissolveEdge', 0.005, 0.4, 0.005, 'burn edge');
  const env = root.addFolder('Envelope');
  Editor.range(env, c, 'introTime', 0.02, 1, 0.01, 'intro (s)');
  Editor.range(env, c, 'outroTime', 0.05, 1.5, 0.01, 'exit (s)');
  const motes = root.addFolder('Motes');
  Editor.range(motes, c, 'moteSize', 0.1, 4, 0.01, 'size');
  Editor.range(motes, c, 'moteSpeed', 0, 4, 0.01, 'speed');
  Editor.range(motes, c, 'moteDensity', 0, 1, 0.01, 'density');
  const ground = root.addFolder('Ground mark');
  Editor.range(ground, c, 'groundOpacity', 0, 1, 0.01, 'bed opacity');
  Editor.range(ground, c, 'groundGlow', 0, 4, 0.01, 'glow');
  const shock = root.addFolder('Shockwave');
  Editor.range(shock, c, 'shockTime', 0.05, 1.5, 0.01, 'time (s)');
  Editor.range(shock, c, 'shockWidth', 0.01, 0.5, 0.005, 'width');
  Editor.range(shock, c, 'warp', 0, 3, 0.01, 'distortion');
  buildFeedbackFolder(root, Editor, c, 'Impact feedback');
  const palette = root.addFolder('Palette');
  for (const [slug, colors] of Object.entries(c.palette)) {
    const move = palette.addFolder(slug.replace(/-/g, ' '));
    move.addColor(colors, 'core');
    move.addColor(colors, 'edge');
  }
  root.close();
  return root;
}

/* ------------------------------------------------------------------------ */
/* Move data                                                                */
/* ------------------------------------------------------------------------ */

const TAU = Math.PI * 2;
const UP = new Vector3(0, 1, 0);
const _dir = new Vector3();

/** The five authored variants plus the canonical Storm Catalyst preset. */
function profileOf(uid) {
  if (!uid) return null;
  return CONVERGENCE_VARIANTS.find((entry) => entry.uid === uid)
    ?? (uid === MECHANIC_PRESETS.convergence.uid ? MECHANIC_PRESETS.convergence : null);
}

/** Strike shapes in local cast space; Storm Catalyst strikes its reaction disc. */
function localShapes(p) {
  const shapes = convergenceStrikeShapes(p, { position: [0, 0, 0], direction: [0, 0, 1] });
  return shapes.length ? shapes : [{ kind: 'disc', x: 0, z: 0, r: p.radius }];
}

const GROUND = {
  fire: GROUND_PATTERN.SCORCH,
  frost: GROUND_PATTERN.RIME,
  water: GROUND_PATTERN.RIPPLE,
  earth: GROUND_PATTERN.FRACTURE,
  crystal: GROUND_PATTERN.FACET,
  storm: GROUND_PATTERN.ARC
};

/** Overlay colours for the elements the presentation has no overlay for. */
const EXTRA_OVERLAY = { storm: '#c9b8ff' };

/* ------------------------------------------------------------------------ */
/* Authored solid forms (pooled, built once per presentation)               */
/* ------------------------------------------------------------------------ */

const lathe = (profile, segments) => new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), segments);

const FORMS = {
  /** A footed iron bowl: foot, waist, flared lip turned back in. */
  brazier: () =>
    lathe([[0, 0], [0.9, 0], [1, 0.08], [0.72, 0.18], [0.52, 0.36], [0.7, 0.55], [0.96, 0.62], [0.9, 0.7], [0.5, 0.52], [0, 0.46]], 14),
  /** A flame tongue: a teardrop lathe twisted and bent as it climbs. */
  tongue: () => {
    const g = lathe([[0, 0], [0.34, 0.12], [0.42, 0.36], [0.3, 0.72], [0.12, 1.0], [0, 1.15]], 7);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = y * 1.1, c = Math.cos(a), s = Math.sin(a);
      p.setXYZ(i, x * c - z * s + y * y * 0.14, y, x * s + z * c);
    }
    g.computeVertexNormals();
    return g;
  },
  /** Hexagonal bipyramid crystal, flat-shaded so every facet catches light. */
  spire: () => {
    const g = lathe([[0, -0.15], [0.32, 0.05], [0.27, 1.25], [0, 1.75]], 6).toNonIndexed();
    g.computeVertexNormals();
    return g;
  },
  /** Basalt column: a hex prism whose top is broken off at a tilt. */
  column: () => {
    const g = new CylinderGeometry(0.42, 0.48, 1, 6, 2).toNonIndexed();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y > 0.4) p.setY(i, y + 0.16 * x + 0.07 * Math.sin(z * 9));
    }
    g.computeVertexNormals();
    return g;
  },
  /** A curling wave crest, extruded across the aim. */
  crest: () => {
    const s = new Shape();
    s.moveTo(-0.7, 0);
    s.lineTo(0.85, 0);
    s.quadraticCurveTo(1.25, 0.55, 0.95, 1.05);
    s.quadraticCurveTo(0.6, 1.35, 0.32, 1.02);
    s.quadraticCurveTo(0.62, 1.0, 0.62, 0.72);
    s.quadraticCurveTo(0.45, 0.35, -0.7, 0);
    const g = new ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -0.45);
    g.rotateY(-Math.PI / 2); // profile in the y/z plane, curling toward +Z
    return g;
  },
  /** A conductor coil wound around the storm mast. */
  coil: () => {
    const points = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, a = t * TAU * 4;
      points.push(new Vector3(Math.cos(a) * (0.3 - t * 0.1), 0.3 + t * 2.0, Math.sin(a) * (0.3 - t * 0.1)));
    }
    return new TubeGeometry(new CatmullRomCurve3(points), 160, 0.035, 6, false);
  },
  /** A triangular prism blade with bevelled edges. */
  prism: () => {
    const s = new Shape();
    s.moveTo(0, 0.6);
    s.lineTo(0.22, -0.4);
    s.lineTo(-0.22, -0.4);
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
    g.translate(0, 0, -0.07);
    return g;
  }
};

function form(v, name) {
  return poolGeometry(v, `convergenceForm:${name}`, FORMS[name]);
}

/* ------------------------------------------------------------------------ */
/* Sculptures                                                               */
/* ------------------------------------------------------------------------ */

/** Record the base pose of a node for the presentation's motion kinds. */
function animate(mesh, kind, phase = 0) {
  mesh.userData.convergenceMotion = { kind, phase, scale: mesh.scale.clone(), position: mesh.position.clone() };
  return mesh;
}

/** Fire nova: brazier, ribs, a core of tongues and a ring of flames. */
function sculptPromethean(v, g) {
  const m = (...a) => v.mesh(...a);
  m(form(v, 'brazier'), 'iron', g, 0, 0.02, 0, 1.15, 0.9, 1.15);
  v.ring(g, 'bronze', 1.1, 0.35);
  v.ring(g, 'fire', 1.8, 0.1);
  v.ring(g, 'gold', 2.5, 0.08);
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3;
    animate(m(form(v, 'tongue'), 'fire', g, Math.sin(a) * 0.18, 0.5, Math.cos(a) * 0.18, 0.55, 1.05 - i * 0.1, 0.55), 'flame', i * 2.1).rotation.y = a;
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8, x = Math.sin(a), z = Math.cos(a);
    const rib = m('shaft', 'bronze', g, x * 0.65, 1.1, z * 0.65, 0.6, 1.55, 0.6);
    rib.rotation.z = x * 0.5;
    rib.rotation.x = -z * 0.5;
    const flame = animate(m(form(v, 'tongue'), 'fire', g, x * 1.2, 0.05, z * 1.2, 0.32, 0.75 + (i % 3) * 0.12, 0.32), 'flame', i);
    flame.rotation.set(-z * 0.35, a, x * 0.35);
    m('box', 'gold', g, x * 2.5, 0.1, z * 2.5, 0.14, 0.07, 0.45).rotation.y = a;
  }
}

/** Frost crown: a core spire, six steel-footed satellites, struts between. */
function sculptCrystallization(v, g) {
  const m = (...a) => v.mesh(...a);
  v.ring(g, 'ice', 3.0, 0.1);
  v.ring(g, 'steel', 2.35, 0.12);
  animate(m(form(v, 'spire'), 'ice', g, 0, 0.1, 0, 1.25, 1.1, 1.25), 'crystal', 0);
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3 + 0.5;
    const s = animate(m(form(v, 'spire'), 'ice', g, Math.sin(a) * 0.45, 0, Math.cos(a) * 0.45, 0.6, 0.55, 0.6), 'crystal', 1 + i);
    s.rotation.set(Math.cos(a) * 0.3, a, -Math.sin(a) * 0.3);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6, x = Math.sin(a), z = Math.cos(a);
    m('base', 'steel', g, x * 3, 0.1, z * 3, 0.5, 0.5, 0.5);
    animate(m(form(v, 'spire'), 'ice', g, x * 3, 0.15, z * 3, 0.85, 0.8, 0.85), 'crystal', i + 4).rotation.y = a;
    const lean = m(form(v, 'spire'), 'ice', g, x * 2.5, 0.05, z * 2.5, 0.38, 0.4, 0.38);
    lean.rotation.set(-z * 0.55, a, x * 0.55);
    m('box', 'steel', g, x * 2.15, 0.14, z * 2.15, 0.08, 0.08, 1).rotation.y = a;
  }
}

/** Water wave: hoops along the aim, droplets on them, three cresting curls. */
function sculptHydrodynamic(v, g) {
  const m = (...a) => v.mesh(...a);
  for (let i = 0; i < 5; i++) {
    const z = -1.6 + i * 1.6;
    const r = 0.7 + i * 0.15;
    const arc = v.ring(g, i % 2 ? 'steel' : 'water', r, 0.35 + i * 0.2);
    arc.position.z = z;
    arc.rotation.x = 0;
    arc.rotation.y = Math.PI / 2;
    for (let j = 0; j < 6; j++) {
      const a = (j * Math.PI) / 5;
      animate(m('sphere', 'water', g, Math.cos(a) * r, 0.35 + Math.sin(a) * r, z, 0.12 + (j % 2) * 0.05), 'droplet', i * 6 + j);
    }
  }
  for (let c = 0; c < 3; c++) {
    animate(m(form(v, 'crest'), 'water', g, (c - 1) * 0.3, 0, -0.6 + c * 2.4, 0.9, 0.75 + c * 0.1, 0.8), 'droplet', c * 3);
  }
  for (const x of [-1, 1]) m('shaft', 'water', g, x * 1.1, 0.1, 2, 0.2, 7, 0.2).rotation.x = Math.PI / 2;
}

/** Earth eruptions: a basalt column cluster per disc, strata and a seam. */
function sculptLithification(v, g) {
  const m = (...a) => v.mesh(...a);
  for (let i = -1; i <= 1; i++) {
    const z = i * 2.5;
    animate(m(form(v, 'column'), 'rock', g, 0, 0.9, z, 1, 1.8 + 0.3 * (1 - Math.abs(i)), 1), 'eruption', i + 1);
    for (let j = 0; j < 5; j++) {
      const a = (j * TAU) / 5 + i;
      const col = animate(m(form(v, 'column'), j % 2 ? 'strata' : 'rock', g, Math.sin(a) * 0.72, 0.45, z + Math.cos(a) * 0.72, 0.55, 0.9 + (j % 3) * 0.2, 0.55), 'eruption', i + 1 + j * 0.3);
      col.rotation.set(Math.cos(a) * 0.2, a, -Math.sin(a) * 0.2);
    }
    for (let j = 0; j < 4; j++) {
      const a = (j * TAU) / 4;
      m('shard', 'strata', g, Math.sin(a) * 0.95, 0.2, z + Math.cos(a) * 0.95, 0.3, 0.32, 0.3);
    }
    v.ring(g, 'gold', 1.15, 0.12).position.z = z;
  }
  m('box', 'bronze', g, 0, 0.1, 0, 0.09, 0.08, 6);
}

/** Crystal fan: a central prism, three beams with blades riding them. */
function sculptPrismatic(v, g) {
  const m = (...a) => v.mesh(...a);
  v.ring(g, 'gold', 0.8, 0.1);
  animate(m(form(v, 'prism'), 'ice', g, 0, 1, 0, 1.4, 1.5, 1.4), 'prism', 0);
  for (const a of [-0.48, 0, 0.48]) {
    const x = Math.sin(a), z = Math.cos(a);
    const beam = m('shaft', 'ice', g, x * 3, 0.8, z * 3, 0.22, 6, 0.22);
    beam.quaternion.setFromUnitVectors(UP, _dir.set(x, 0, z));
    for (let j = 1; j <= 4; j++) {
      const blade = animate(m(form(v, 'prism'), j % 2 ? 'gold' : 'ice', g, x * j * 1.3, 0.8, z * j * 1.3, 0.6, 0.7, 0.6), 'prism', j);
      blade.rotation.set(0, a + Math.PI / 2, a);
    }
    m(form(v, 'prism'), 'ice', g, x * 6, 0.8, z * 6, 0.9, 1.1, 0.9).rotation.set(0, a, a);
  }
}

/** Storm catalyst: a conductor mast with a coil, tilted hoops and ground rods. */
function sculptStorm(v, g) {
  const m = (...a) => v.mesh(...a);
  m('base', 'iron', g, 0, 0.4, 0, 0.7);
  m('shaft', 'steel', g, 0, 1.3, 0, 1, 2, 1);
  m(form(v, 'coil'), 'storm', g, 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3;
    animate(m('shard', 'storm', g, Math.sin(a) * 0.7, 1.7, Math.cos(a) * 0.7, 0.18, 0.75, 0.18), 'prism', i);
    const hoop = v.ring(g, 'water', 1 + i * 0.5, 0.2 + i * 0.4);
    hoop.rotation.z = (i - 1) * 0.3;
  }
  m('sphere', 'storm', g, 0, 2.45, 0, 0.3);
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12, r = 1.2 + (i % 3) * 0.8;
    m('shaft', 'storm', g, Math.sin(a) * r, 0.12, Math.cos(a) * r, 0.2, 1.3, 0.2).rotation.z = Math.PI / 2;
  }
}

const SCULPTORS = {
  'promethean-ignition': sculptPromethean,
  'absolute-crystallization': sculptCrystallization,
  'hydrodynamic-synthesis': sculptHydrodynamic,
  'elemental-lithification': sculptLithification,
  'prismatic-multiplication': sculptPrismatic,
  'storm-catalyst': sculptStorm
};

/* ------------------------------------------------------------------------ */
/* Shader layers                                                            */
/* ------------------------------------------------------------------------ */

/** Pool the ground / shock / warp / burst / gather resources of one move. */
function moveResources(v, p, slug) {
  const [core, edge] = CONVERGENCE_HERO_COLORS[slug];
  const clock = v.terrainTime;
  const shapes = localShapes(p);
  const keys = {
    ground: poolMaterial(v, `convergenceGround:${slug}`, () =>
      createGroundMaterial({ clock, tint: core, tintB: edge, pattern: GROUND[p.element], paletteKey: slug })),
    shock: poolMaterial(v, `convergenceShock:${slug}`, () =>
      createShockMaterial({ clock, tint: edge, tintB: core, paletteKey: slug, depthTest: false })),
    warp: poolMaterial(v, 'convergenceWarp', () => createWarpMaterial({ clock, tint: '#ffffff' })),
    burstMat: poolMaterial(v, `convergenceBurstMaterial:${slug}`, () =>
      createMoteMaterial({ clock, tint: edge, tintB: core, style: MOTE_STYLE.BURST, paletteKey: slug })),
    gatherMat: poolMaterial(v, `convergenceGatherMaterial:${slug}`, () =>
      createMoteMaterial({ clock, tint: edge, tintB: core, style: MOTE_STYLE.GATHER, paletteKey: slug, depthTest: false })),
    // Burst anchors are scattered inside the strike shapes themselves.
    burst: poolGeometry(v, `convergenceBurst:${slug}`, () => createMoteGeometry(burstAnchors(shapes), 72)),
    gather: poolGeometry(v, `convergenceGather:${slug}`, () => createMoteRing(64, p.radius * 0.85, 0.15, 0.12))
  };
  return { keys, shapes };
}

/** A deterministic scatter of points inside the strike shapes (an attribute-like accessor). */
function burstAnchors(shapes) {
  const points = [];
  for (let i = 0; i < 72; i++) {
    const s = shapes[i % shapes.length];
    const h = (i * 0.618034) % 1;
    const a = i * 2.39996323;
    if (s.kind === 'disc') {
      const r = s.r * Math.sqrt(h) * 0.9;
      points.push([s.x + Math.cos(a) * r, 0.2 + h * 0.4, s.z + Math.sin(a) * r]);
    } else {
      const t = h;
      const side = Math.sin(a) * s.r * 0.8;
      const dx = s.bx - s.ax, dz = s.bz - s.az, len = Math.hypot(dx, dz) || 1;
      points.push([s.ax + dx * t - (dz / len) * side, 0.2 + ((i * 0.37) % 1) * 0.4, s.az + dz * t + (dx / len) * side]);
    }
  }
  return { count: points.length, getX: (i) => points[i][0], getY: (i) => points[i][1], getZ: (i) => points[i][2] };
}

/** Fit a unit-disc layer to a strike shape: a disc, or an ellipse over a capsule. */
function fitToShape(mesh, s, pad) {
  if (s.kind === 'disc') {
    mesh.position.x = s.x;
    mesh.position.z = s.z;
    mesh.scale.set(s.r * pad, 1, s.r * pad);
    return mesh;
  }
  const dx = s.bx - s.ax, dz = s.bz - s.az, len = Math.hypot(dx, dz);
  mesh.position.x = (s.ax + s.bx) / 2;
  mesh.position.z = (s.az + s.bz) / 2;
  mesh.rotation.y = Math.atan2(dx, dz);
  mesh.scale.set(s.r * pad, 1, (len / 2 + s.r) * pad);
  return mesh;
}

/** Put an overlay subtree on the VFX layer, above terrain, out of the shadow pass. */
function overlayLayer(root) {
  root.traverse((n) => {
    if (!n.isMesh && !n.isPoints) return;
    n.renderOrder = Math.max(100, n.renderOrder);
    n.castShadow = false;
    n.receiveShadow = false;
    if (n.layers.mask === 1 << LAYER.WORLD) n.layers.set(LAYER.VFX);
  });
}

/* ------------------------------------------------------------------------ */
/* Entry points used by MechanicPresentation                                */
/* ------------------------------------------------------------------------ */

/** Impact rig for a convergence cue. Returns false for an unknown uid. */
export function drawConvergenceArt(v, g, uid) {
  const p = profileOf(uid);
  if (!p) return false;
  const slug = uid.split('/').at(-1);
  const sculpt = SCULPTORS[slug];
  if (!sculpt) return false;
  const life = p.life ?? 1.8;
  g.userData.convergenceLife = life;
  g.userData.convergenceStrength = 1;
  registerRig(v, g);
  // 7. Shake / flash / light punch, fired when the rig lands in the scene.
  armBeat(g, 'convergence', slug, 1);

  // 1. Solid sculpture. Everything built so far is solid and sinks out.
  sculpt(v, g);
  for (const n of g.children) if (n.isMesh) bindSolidExit(v, n, 'convergence', life);

  // 3 + 6. Ground marks fitted to the strike shapes; burst motes out of them.
  const { keys, shapes } = moveResources(v, p, slug);
  shapes.forEach((s, i) => {
    fitToShape(addGround(v, g, 'convergence', keys.ground, 1, { name: `convergence-ground-${i}`, life, seed: i * 1.7 }), s, 1.06);
  });
  addMotes(v, g, 'convergence', keys.burst, keys.burstMat, { name: `convergenceBurst:${slug}`, life, seed: 3 });

  // 4 + 5. The impact layer: exact boundaries, plus shock and warp per shape.
  const impact = new Group();
  impact.name = 'convergence-impact';
  impact.userData.convergenceLayer = 'impact';
  g.add(impact);
  const mat = EXTRA_OVERLAY[p.element]
    ? overlayMaterial(v, p.element, EXTRA_OVERLAY[p.element])
    : `convergenceOverlay-${p.element}`;
  for (const [i, shape] of shapes.entries()) {
    if (shape.kind === 'disc') {
      const halo = v.ring(impact, mat, shape.r, 0.09);
      halo.name = `impact-disc-${i}`;
      halo.position.x = shape.x;
      halo.position.z = shape.z;
      for (let j = 0; j < 6; j++) {
        const a = (j * TAU) / 6;
        v.mesh('shard', mat, impact, shape.x + Math.sin(a) * shape.r * 0.82, 0.16, shape.z + Math.cos(a) * shape.r * 0.82, 0.08, 0.2, 0.08);
      }
    } else {
      const dx = shape.bx - shape.ax, dz = shape.bz - shape.az, len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len, px = -uz, pz = ux;
      for (const [end, point] of [[shape.ax, shape.az], [shape.bx, shape.bz]].entries()) {
        const halo = v.ring(impact, mat, shape.r, 0.09);
        halo.name = `impact-cap-${i}-${end}`;
        halo.position.x = point[0];
        halo.position.z = point[1];
      }
      for (const side of [-1, 1]) {
        const rail = v.mesh('shaft', mat, impact, (shape.ax + shape.bx) / 2 + px * shape.r * side, 0.1, (shape.az + shape.bz) / 2 + pz * shape.r * side, 0.26, len, 0.26);
        rail.name = `impact-rail-${i}-${side}`;
        rail.quaternion.setFromUnitVectors(UP, _dir.set(ux, 0, uz));
      }
    }
    // 5. Parented to the rig: the front outlives the half-second boundary flash.
    // Drawn over raised terrain like the overlay (the material skips the depth test).
    const shock = fitToShape(addShock(v, g, 'convergence', keys.shock, keys.warp, 1, { name: `impact-shock-${i}`, life, seed: i, renderOrder: 101 }), shape, 1);
    const warp = g.getObjectByName(`impact-shock-${i}-warp`);
    if (warp) fitToShape(warp, shape, 1);
    shock.userData.convergenceShock = i;
  }
  overlayLayer(impact);
  return true;
}

/** Pre-impact charge, shown for the move's real anticipation time. */
export function drawConvergenceCharge(v, g, uid) {
  const p = profileOf(uid);
  if (!p) return false;
  const slug = uid.split('/').at(-1);
  const material = EXTRA_OVERLAY[p.element]
    ? overlayMaterial(v, p.element, EXTRA_OVERLAY[p.element])
    : `convergenceOverlay-${p.element}`;
  const charge = new Group();
  charge.name = 'convergence-charge';
  charge.userData.convergenceLayer = 'charge';
  g.add(charge);
  // 1. The reaction disc and an inner gold ring with a crown of shards.
  v.ring(charge, material, p.radius, 0.08);
  v.ring(charge, 'convergenceOverlay-gold', p.radius * 0.48, 0.1);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const piece = v.mesh('shard', material, charge, Math.sin(a) * p.radius * 0.75, 0.18, Math.cos(a) * p.radius * 0.75, 0.08, 0.3, 0.08);
    piece.rotation.z = -a;
  }
  // Inner tick marks, counter-phase to the outer crown, read as a turning dial.
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12 + Math.PI / 12;
    const tick = v.mesh('box', 'convergenceOverlay-gold', charge, Math.sin(a) * p.radius * 0.4, 0.12, Math.cos(a) * p.radius * 0.4, 0.05, 0.03, 0.32);
    tick.rotation.y = a;
  }
  // 2. Motes pulled in to the core over the anticipation time.
  if (CONVERGENCE_HERO_COLORS[slug]) {
    const { keys } = moveResources(v, p, slug);
    addMotes(v, charge, 'convergence', keys.gather, keys.gatherMat, { name: `convergenceGather:${slug}`, life: p.anticipation, outro: false });
    // 3. The forming floor mark, at low strength, under the rig (depth-tested).
    // A short exit of its own hands it over to the impact mark without a cut.
    addGround(v, g, 'convergence', keys.ground, p.radius, { name: 'convergence-charge-ground', life: p.anticipation, strength: 0.45, outroTime: 0.15, seed: 5 });
  }
  overlayLayer(charge);
  return true;
}
