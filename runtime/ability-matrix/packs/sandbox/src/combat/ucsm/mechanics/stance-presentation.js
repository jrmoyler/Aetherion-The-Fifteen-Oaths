import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  MeshBasicMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3
} from 'three';
import {
  addGround,
  addShock,
  bindSolidExit,
  bindVfx,
  createGroundMaterial,
  createShockMaterial,
  createSurfaceMaterial,
  createWarpMaterial,
  GROUND_PATTERN,
  poolMaterial,
  registerLook,
  registerRig
} from './ConvergenceCounterStanceVfx.js';
import { armBeat, buildFeedbackFolder } from './ConvergenceCounterStanceFeedback.js';
import { STANCE_PHASE_LIFE, STANCE_PHASE_PALETTE } from './StancePhaseGeometry.js';
import { STANCE_HERO_COLORS } from './StanceHeroGeometry.js';

/**
 * STANCE — the held sovereignty forms and their combat beats.
 *
 * A stance is a **state of the caster**: it follows them, slows them, drains
 * sovereignty and banks absorbed impact. Its presentation therefore has two
 * parts with different jobs.
 *
 * ## The held rig (`stance` item, persistent, follows the caster)
 *
 *   1. **solid regalia** — `buildStanceRig`: the element's armour silhouette
 *      in the presentation's solid materials (a bronze crown of spikes, frost
 *      fins, conductor rings and bolts, water hoops and droplets, stone plates
 *      with bronze caps), animated by the presentation's orbit and beat hooks.
 *   2. **accent forms** — seven element forms (flame sheet, crystal, bolt,
 *      water sheet, rock) circling the feet in the kit's surface shader.
 *   3. **mantle** — `StanceHeroGeometry.js`: the hero ribbons/facets worn on
 *      the body, their motes, a ward mark at the feet and an orbiting ring.
 *
 * The held rig is persistent: the presentation removes it the tick the stance
 * ends. Its exit is therefore taken from the stance's own `expiresTick` (see
 * `rigExit` in the kit): over the last `exitTime` the shader layers dissolve
 * and the solid regalia sinks onto the caster's feet, so a stance that runs
 * out finishes on its closing tick instead of popping.
 *
 * ## The beats (`anticipation`, `block`, `reversal`, `finisher` cues)
 *
 *   1. **boundary** — a unit ring (outer edge exactly radius 1) that the
 *      presentation scales by the finisher's real damage radius.
 *   2. **beat forms** — the element's primary form in a ring, each pulsing on
 *      the presentation's `stanceBeat` hook (deterministic per tick).
 *   3. **phase surface + motes** — `StancePhaseGeometry.js`.
 *   4. **floor mark** — the element's mark, unit-radius on the finisher so it
 *      fills the hit area, smaller under the body on the other beats.
 *   5. **shockwave + distortion** — on block, reversal and finisher; the
 *      finisher's front runs exactly to the damage radius.
 *   6. **beat feedback** — camera shake, a flash and a point-light punch on
 *      block (light), reversal (medium) and finisher (full weight).
 *
 * Every timed layer reads its age from the fixed combat tick and dissolves out
 * on the beat's real lifetime, so a finisher no longer pops when the
 * presentation removes it. Reduced motion holds every pose (the tests pin it)
 * and keeps the beats readable.
 */

/* ------------------------------------------------------------------------ */
/* Look                                                                     */
/* ------------------------------------------------------------------------ */

export const STANCE_LOOK = registerLook('stance', {
  /* --- surfaces (mantle, accents, beat forms, phase surfaces) --- */
  glow: 1.0, // emissive multiplier (× global.glow)
  opacity: 1.0, // master alpha (× global.opacity)
  fresnel: 1.0, // rim on the surfaces (× global.fresnel)
  filamentSpeed: 0.9, // a held form breathes slower than a strike
  noiseScale: 1.0,
  noiseAmount: 1.0,
  dissolveEdge: 0.08,
  /* --- envelope (seconds) --- */
  introTime: 0.25, // mantle / beat reveal
  outroTime: 0.22, // beat exit (never more than 70% of a beat's life)
  exitTime: 0.25, // held rig dissolve / sink before the stance runs out
  /* --- motes --- */
  moteSize: 1.0,
  moteSpeed: 1.0,
  moteDensity: 1.0,
  /* --- floor marks --- */
  groundOpacity: 0.6,
  groundGlow: 1.0,
  /* --- shockwave --- */
  shockTime: 0.3,
  shockWidth: 0.12,
  warp: 0.9,
  /* --- beat feedback at finisher weight; block × 0.3, reversal × 0.6 --- */
  shakeAmount: 0.26, // camera trauma (× global.cameraShake × explosionIntensity)
  shakeTime: 0.35, // seconds for the shake to settle
  flashStrength: 0.24, // screen flash in the element's edge colour
  lightIntensity: 7, // point-light punch (× global.lightIntensity)
  lightRadius: 9, // its reach in metres (× global.lightRadius)
  /* --- palette: per stance (mantle) and per element (beats) --- */
  palette: {
    ...Object.fromEntries(Object.entries(STANCE_HERO_COLORS).map(([slug, [core, edge]]) => [slug, { core, edge }])),
    ...Object.fromEntries(Object.entries(STANCE_PHASE_PALETTE).map(([el, [core, edge]]) => [el, { core, edge }]))
  }
});

/** Mounts every key above as a live control, in the house editor style. */
export function buildStanceEditor(gui, Editor, c = STANCE_LOOK) {
  const root = gui.addFolder('♛  Stance mechanics');
  const surface = root.addFolder('Surfaces');
  Editor.range(surface, c, 'glow', 0, 4, 0.01, 'glow');
  Editor.range(surface, c, 'opacity', 0, 2, 0.01, 'opacity');
  Editor.range(surface, c, 'fresnel', 0, 3, 0.01, 'fresnel');
  Editor.range(surface, c, 'filamentSpeed', 0, 4, 0.01, 'filament speed');
  Editor.range(surface, c, 'noiseScale', 0.2, 4, 0.01, 'noise scale');
  Editor.range(surface, c, 'noiseAmount', 0, 3, 0.01, 'noise amount');
  Editor.range(surface, c, 'dissolveEdge', 0.005, 0.4, 0.005, 'burn edge');
  const env = root.addFolder('Envelope');
  Editor.range(env, c, 'introTime', 0.02, 1, 0.01, 'reveal (s)');
  Editor.range(env, c, 'outroTime', 0.05, 0.6, 0.01, 'beat exit (s)');
  Editor.range(env, c, 'exitTime', 0.05, 1, 0.01, 'stance exit (s)');
  const motes = root.addFolder('Motes');
  Editor.range(motes, c, 'moteSize', 0.1, 4, 0.01, 'size');
  Editor.range(motes, c, 'moteSpeed', 0, 4, 0.01, 'speed');
  Editor.range(motes, c, 'moteDensity', 0, 1, 0.01, 'density');
  const ground = root.addFolder('Floor marks');
  Editor.range(ground, c, 'groundOpacity', 0, 1, 0.01, 'bed opacity');
  Editor.range(ground, c, 'groundGlow', 0, 4, 0.01, 'glow');
  const shock = root.addFolder('Shockwave');
  Editor.range(shock, c, 'shockTime', 0.05, 0.65, 0.01, 'time (s)');
  Editor.range(shock, c, 'shockWidth', 0.01, 0.5, 0.005, 'width');
  Editor.range(shock, c, 'warp', 0, 3, 0.01, 'distortion');
  buildFeedbackFolder(root, Editor, c, 'Beat feedback (finisher weight)');
  const palette = root.addFolder('Palette');
  for (const [key, colors] of Object.entries(c.palette)) {
    const entry = palette.addFolder(key.replace(/-/g, ' '));
    entry.addColor(colors, 'core');
    entry.addColor(colors, 'edge');
  }
  root.close();
  return root;
}

/* ------------------------------------------------------------------------ */
/* Shared resources                                                         */
/* ------------------------------------------------------------------------ */

const TAU = Math.PI * 2;
const ELEMENTS = ['fire', 'frost', 'storm', 'water', 'earth', 'force'];
const ELEMENT_MATERIAL = { fire: 'stanceFire', frost: 'stanceFrost', storm: 'stanceStorm', water: 'stanceWater', earth: 'stanceEarth', force: 'stanceForce' };
const ELEMENT_FORM = { fire: 'stanceFlameSheet', frost: 'stanceCrystal', storm: 'stanceBolt', water: 'stanceWaterSheet', earth: 'stanceRock', force: 'shield' };
const ELEMENT_GROUND = {
  fire: GROUND_PATTERN.SCORCH,
  frost: GROUND_PATTERN.RIME,
  storm: GROUND_PATTERN.ARC,
  water: GROUND_PATTERN.RIPPLE,
  earth: GROUND_PATTERN.FRACTURE,
  force: GROUND_PATTERN.WARD
};
/** Weight of each beat's shake / flash / light, relative to the finisher. */
const BEAT_WEIGHT = { block: 0.3, reversal: 0.6, finisher: 1 };
/** Boundary ring colours: crisp and flat, because it is a gameplay readout. */
const BOUNDARY = { fire: 0xff8a2f, frost: 0x8deaff, storm: 0xcbb4ff, water: 0x37c9ed, earth: 0xc99154, force: 0x95e9fa };

/**
 * Two individually sculpted sheets: a curling flame and a flowing water
 * ribbon. UVs run along the height (x) and across the sheet (y), the layout
 * the surface shader expects for its reveal and feathering.
 */
function sheet(style) {
  const positions = [], uv = [], indices = [], rows = 16, columns = 4;
  for (let y = 0; y <= rows; y++)
    for (let x = 0; x <= columns; x++) {
      const t = y / rows, u = (x / columns) * 2 - 1;
      const width = style === 'flame' ? 0.42 * (1 - t) + 0.015 : 0.24 + 0.07 * Math.sin(t * Math.PI);
      const bend = style === 'flame' ? 0.28 * Math.sin(t * 5) * t : 0.22 * Math.sin(t * Math.PI * 2);
      positions.push(u * width + bend, t * 2, style === 'flame' ? 0.16 * Math.sin(t * 4) * (1 - Math.abs(u)) : 0.18 * Math.sin(t * 8 + u));
      uv.push(t, x / columns);
      if (y < rows && x < columns) {
        const n = y * (columns + 1) + x;
        indices.push(n, n + columns + 1, n + 1, n + 1, n + columns + 1, n + columns + 2);
      }
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * Shared per-view assets, built once with the presentation: no per-cast
 * geometry or material to leak. Element materials are the kit's surface
 * shader (filaments, fresnel, reveal, dissolve) on the shared clock.
 */
export function initStanceResources(view) {
  const addGeo = (name, value) => {
    value.name ||= name;
    view.geo[name] = value;
    view.resources.push(value);
  };
  addGeo('stanceFlameSheet', sheet('flame'));
  addGeo('stanceWaterSheet', sheet('water'));
  // The outer edge is exactly unit radius, allowing a true gameplay boundary.
  addGeo('stanceBoundary', new TorusGeometry(0.985, 0.015, 6, 64));
  const crystal = new IcosahedronGeometry(1, 0);
  crystal.scale(0.28, 1.15, 0.21);
  addGeo('stanceCrystal', crystal);
  const bolt = [[0, 0, 0], [0.08, 0.28, 0.03], [-0.09, 0.48, 0], [0.11, 0.72, -0.04], [0, 1, 0]].map((p) => new Vector3(...p));
  addGeo('stanceBolt', new TubeGeometry(new CatmullRomCurve3(bolt), 20, 0.035, 5, false));
  const rock = new IcosahedronGeometry(1, 1);
  const pos = rock.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // Lumpy, flattened boulder: a deterministic bump field, then squashed in z.
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), n = 1 + 0.16 * Math.sin(x * 12 + y * 17 + z * 9);
    pos.setXYZ(i, x * n * 0.75, y * n * 0.9, z * n * 0.45);
  }
  rock.computeVertexNormals();
  addGeo('stanceRock', rock);
  // A crown spike: a slim faceted lathe, used by the fire and frost regalia.
  addGeo('stanceSpike', new LatheGeometry([[0, 0], [0.5, 0.05], [0.42, 0.4], [0.18, 0.85], [0, 1.15]].map(([x, y]) => new Vector2(x, y)), 6).toNonIndexed());
  view.geo.stanceSpike.computeVertexNormals();

  for (const element of ELEMENTS) {
    const [core, edge] = STANCE_PHASE_PALETTE[element];
    poolMaterial(view, ELEMENT_MATERIAL[element], () =>
      createSurfaceMaterial({ clock: view.terrainTime, tint: core, tintB: edge, identity: ELEMENTS.indexOf(element) + 10, paletteKey: element }));
    poolMaterial(view, `stanceBoundary:${element}`, () =>
      new MeshBasicMaterial({ color: BOUNDARY[element], transparent: true, opacity: 0.6, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, toneMapped: false }));
  }
}

/** Ground / shock / warp materials for an element, pooled on first use. */
function beatMaterials(view, element) {
  const [core, edge] = STANCE_PHASE_PALETTE[element];
  const clock = view.terrainTime;
  return {
    ground: poolMaterial(view, `stanceGround:${element}`, () =>
      createGroundMaterial({ clock, tint: core, tintB: edge, pattern: ELEMENT_GROUND[element], paletteKey: element })),
    shock: poolMaterial(view, `stanceShock:${element}`, () => createShockMaterial({ clock, tint: edge, tintB: core, paletteKey: element })),
    warp: poolMaterial(view, 'stanceWarp', () => createWarpMaterial({ clock, tint: '#ffffff' }))
  };
}

/* ------------------------------------------------------------------------ */
/* Beats                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Layered, element-specific combat beat. The unit boundary is scaled to the
 * gameplay radius by the caller (finisher only).
 */
export function buildStancePhase(view, g, phase, element) {
  const el = ELEMENT_MATERIAL[element] ? element : 'force';
  const mat = ELEMENT_MATERIAL[el];
  const primary = ELEMENT_FORM[el];
  const life = STANCE_PHASE_LIFE[phase] ?? 0.5;
  const finisher = phase === 'finisher';
  const amount = finisher ? 12 : phase === 'anticipation' ? 8 : 6;
  registerRig(view, g);
  if (BEAT_WEIGHT[phase]) armBeat(g, 'stance', el, BEAT_WEIGHT[phase]);

  // 1. Boundary: a direct child, outer edge at exactly 1 before group scale.
  const boundary = view.mesh('stanceBoundary', `stanceBoundary:${el}`, g, 0, 0.035, 0, finisher ? 1 : 0.8);
  boundary.rotation.x = Math.PI / 2;
  boundary.castShadow = false;
  boundary.receiveShadow = false;
  boundary.renderOrder = 6;
  boundary.userData.stanceBoundary = finisher;
  if (finisher) {
    const inner = view.ring(g, `stanceBoundary:${el}`, 0.54, 0.055);
    inner.castShadow = false;
    inner.userData.stanceWave = true;
  }

  // 2. Beat forms: direct children so the presentation's beat hook finds them.
  for (let i = 0; i < amount; i++) {
    const a = (i * TAU) / amount, radius = finisher ? 0.78 : 0.68;
    const height = phase === 'block' ? 0.6 + 0.15 * (i % 2) : 0.12;
    const part = view.mesh(primary, primary === 'shield' ? 'force' : mat, g, Math.sin(a) * radius, height, Math.cos(a) * radius,
      finisher ? 0.08 : 0.16, finisher ? 0.3 : 0.5, finisher ? 0.08 : 0.16);
    part.castShadow = false;
    part.rotation.y = a;
    part.rotation.z = Math.sin(a) * 0.2;
    part.userData.stanceBeat = { baseY: part.position.y, baseScaleY: part.scale.y, phase: i * 0.7, element };
    // Shader forms dissolve; the solid force plates sink over the same exit.
    if (primary !== 'shield') bindVfx(view, part, 'stance', { role: 'surface', life, seed: i });
    else bindSolidExit(view, part, 'stance', life);
  }

  // 4 + 5. Floor mark and, on the striking beats, the shockwave.
  const m = beatMaterials(view, el);
  addGround(view, g, 'stance', m.ground, finisher ? 1 : 0.9, { name: `stance-${phase}-ground`, life, strength: finisher ? 1 : 0.6, seed: STANCE_PHASE_LIFE[phase] });
  if (phase !== 'anticipation')
    addShock(view, g, 'stance', m.shock, finisher ? m.warp : null, finisher ? 1 : 0.95, { name: `stance-${phase}-shock`, life, seed: 1 });
}

/* ------------------------------------------------------------------------ */
/* Held rig                                                                 */
/* ------------------------------------------------------------------------ */

/** Art-directed regalia for the five elemental stances, on shared resources. */
export function buildStanceRig(view, g, element) {
  registerRig(view, g);
  const mesh = (...args) => view.mesh(...args);
  const ring = (...args) => view.ring(...args);
  if (element === 'fire') {
    // A bronze circlet with a crown of alternating fire/bronze spikes, and
    // flares licking up the body.
    ring(g, 'bronze', 0.84, 0.12);
    ring(g, 'fire', 0.58, 2.2);
    for (let i = 0; i < 9; i++) {
      const a = (i * TAU) / 9;
      const spike = mesh('stanceSpike', i % 2 ? 'fire' : 'bronze', g, Math.sin(a) * 0.54, 2.17, Math.cos(a) * 0.54, 0.16, 0.36 + (i % 3) * 0.11, 0.16);
      spike.rotation.z = Math.sin(a) * 0.3;
      spike.rotation.x = -Math.cos(a) * 0.3;
      const flare = mesh('shard', 'fire', g, Math.sin(a) * 0.92, 0.65 + (i % 2) * 0.4, Math.cos(a) * 0.92, 0.09, 0.42, 0.09);
      flare.rotation.z = Math.sin(a) * 0.45;
    }
  } else if (element === 'frost') {
    // Tall frost fins, a steel collar of spikes and an ice skirt.
    ring(g, 'steel', 0.88, 0.1);
    ring(g, 'ice', 0.5, 2.2);
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8;
      const fin = mesh('shard', 'ice', g, Math.sin(a) * 0.85, 1.15, Math.cos(a) * 0.85, 0.18, 0.83, 0.1);
      fin.rotation.y = a;
      fin.rotation.z = Math.sin(a) * 0.17;
      mesh('stanceSpike', 'steel', g, Math.sin(a) * 0.5, 2.18, Math.cos(a) * 0.5, 0.14, 0.27 + (i % 2) * 0.18, 0.14);
    }
    ring(g, 'ice', 1.1, 0.3);
  } else if (element === 'storm') {
    // Three conductor rings on independent orbits, and a cage of bolts.
    for (let j = 0; j < 3; j++) {
      const r = ring(g, j === 1 ? 'storm' : 'steel', 0.78 + j * 0.14, 0.6 + j * 0.58);
      r.rotation.y = j * 0.45;
      r.rotation.z = (j - 1) * 0.4;
      r.userData.orbit = j + 1;
      r.userData.orbitBase = r.rotation.z;
    }
    for (let i = 0; i < 10; i++) {
      const a = (i * TAU) / 10;
      const bolt = mesh('box', 'storm', g, Math.sin(a) * 0.95, 1.1 + (i % 2) * 0.5, Math.cos(a) * 0.95, 0.07, 0.54, 0.07);
      bolt.rotation.z = (i % 2 ? 1 : -1) * 0.6;
      mesh('sphere', 'storm', g, Math.sin(a) * 0.9, 0.32 + (i % 3) * 0.56, Math.cos(a) * 0.9, 0.09);
    }
  } else if (element === 'water') {
    // Four tilted hoops and a rising helix of droplets.
    for (let j = 0; j < 4; j++) {
      const r = ring(g, j % 2 ? 'water' : 'steel', 0.75 + j * 0.11, 0.22 + j * 0.48);
      r.rotation.z = (j - 1.5) * 0.17;
      r.userData.orbit = j + 1;
      r.userData.orbitBase = r.rotation.z;
    }
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12, height = 0.35 + i * 0.12;
      const drop = mesh('sphere', 'water', g, Math.sin(a) * 0.98, height, Math.cos(a) * 0.98, 0.11, 0.2, 0.11);
      drop.rotation.z = 0.3 * Math.sin(a);
    }
  } else if (element === 'earth') {
    // Stone plates with bronze caps, boulders at the feet and a strata crown.
    ring(g, 'bronze', 1.1, 0.12);
    for (let i = 0; i < 7; i++) {
      const a = (i * TAU) / 7;
      const plate = mesh('ridge', i % 2 ? 'rock' : 'strata', g, Math.sin(a) * 0.97, 0.92, Math.cos(a) * 0.97, 0.22, 0.55, 0.12);
      plate.rotation.y = a;
      const cap = mesh('box', 'bronze', g, Math.sin(a) * 0.97, 1.48, Math.cos(a) * 0.97, 0.32, 0.08, 0.15);
      cap.rotation.y = a;
      mesh('shard', 'rock', g, Math.sin(a) * 1.15, 0.22, Math.cos(a) * 1.15, 0.2, 0.25, 0.16);
    }
    ring(g, 'strata', 0.6, 2.0);
  } else return false;

  // Accent forms circling the feet, in the element's surface shader.
  const material = ELEMENT_MATERIAL[element];
  const hero = ELEMENT_FORM[element];
  for (let i = 0; i < 7; i++) {
    const a = (i * TAU) / 7, y = element === 'earth' ? 0.45 : 0.18;
    const part = mesh(hero, material, g, Math.sin(a) * 0.9, y, Math.cos(a) * 0.9, element === 'earth' ? 0.25 : 0.2, element === 'earth' ? 0.33 : 0.75, 0.2);
    part.rotation.y = a;
    part.castShadow = false;
    part.userData.stanceBeat = { baseY: y, baseScaleY: part.scale.y, phase: i * 0.9, element };
    bindVfx(view, part, 'stance', { role: 'surface', seed: i });
  }
  return true;
}
