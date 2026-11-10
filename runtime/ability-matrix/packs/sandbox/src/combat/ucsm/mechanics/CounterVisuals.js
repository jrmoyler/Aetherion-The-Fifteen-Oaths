import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Group, LatheGeometry, Shape, Vector2, Vector3 } from 'three';
import { createCounterHeroGeometry, COUNTER_HERO_SLUGS } from './CounterHeroGeometry.js';
import {
  addGround,
  addMotes,
  addShock,
  bindRigSolids,
  bindVfx,
  createGroundMaterial,
  createMoteGeometry,
  createMoteMaterial,
  createMoteRing,
  createShockMaterial,
  createSurfaceMaterial,
  createWarpMaterial,
  GROUND_PATTERN,
  MOTE_STYLE,
  poolGeometry,
  poolMaterial,
  registerLook,
  registerRig,
  rigExit,
  rigView
} from './ConvergenceCounterStanceVfx.js';
import { beatFeedback, buildFeedbackFolder } from './ConvergenceCounterStanceFeedback.js';
import { MECHANIC_PRESETS, MECHANIC_VARIANTS } from './presets.js';

/**
 * COUNTER — the guard a counter raises and the strike it returns.
 *
 * A counter is a very short read: anticipation (0.1 s), a perfect window
 * (~0.13 s) and a partial window (~0.2 s). The guard therefore has to say
 * "this is the moment" at a glance, and the return has to be unmistakably the
 * same move coming back.
 *
 * ## The guard (`counter` item, follows the caster, faces the aim)
 *
 *   1. **solid guard** — an authored crescent plate in the element's material
 *      and the element's orbiting pieces (flame fangs, bolts, rings and
 *      droplets, rock plates, ice shards / facets), each animated by
 *      `animateCounterVisual` from the item's age.
 *   2. **hero veil** — the move's hero surface (`CounterHeroGeometry.js`) in the
 *      kit's surface shader, stood between caster and attacker. During the
 *      perfect window it burns hotter, then settles for the partial window.
 *   3. **ward mark** — the element's floor mark around the caster's feet,
 *      resized live from `COUNTER_LOOK.wardRadius`.
 *   4. **guard motes** — a ring of motes in the element's behaviour.
 *
 * The guard snaps up with a small overshoot over `introTime`. It is a
 * persistent item (the presentation removes it the tick the window closes), so
 * its exit is taken from the window's own `expiresTick`: over the last
 * `exitTime` the shader layers dissolve, the solid pieces sink and the rig
 * draws in, finishing on the closing tick instead of popping.
 *
 * ## The return (`reversal` cue, 0.7 s)
 *
 *   1. **trail** — eight shader segments from defender to attacker, revealed by
 *      the projectile as it passes and then bleeding out.
 *   2. **projectile** — the hero surface, scaled down and turned to face its
 *      travel, with a solid core and a mote wake.
 *   3. **impact** — solid rings and the element's shards at the move's real
 *      footprint / splash radius, a shockwave and its distortion twin, a floor
 *      mark and a burst of motes; scaled in on the hit and out before removal.
 *   4. **beat feedback** — camera shake, a flash in the move's edge colour and
 *      a point-light punch on the landing tick (`ConvergenceCounterStanceFeedback.js`).
 *
 * All geometry and materials are pooled on the presentation; animation is a
 * pure function of the age the presentation passes in, so it is
 * tick-deterministic. Reduced motion holds every pose (the tests pin this) and
 * resolves the return at once, keeping the readable impact.
 */

/* ------------------------------------------------------------------------ */
/* Look                                                                     */
/* ------------------------------------------------------------------------ */

const PALETTE = {
  'backdraft-reprisal': { core: '#ff8a3a', edge: '#ffd27a' },
  'feedback-execution': { core: '#b9a5ff', edge: '#f2ecff' },
  'undertow-reversal': { core: '#3cc4f0', edge: '#bff1ff' },
  'faultline-retort': { core: '#d29a5e', edge: '#ffcf73' },
  'facet-reprisal': { core: '#e3c2ff', edge: '#9ef3ff' },
  'shatterpoint-reversal': { core: '#a8eaff', edge: '#ffffff' }
};

export const COUNTER_LOOK = registerLook('counter', {
  /* --- hero veil --- */
  glow: 1.2, // emissive multiplier on veil, trail, shock and motes (× global.glow)
  perfectGlow: 1.7, // extra burn while the perfect window is open
  opacity: 1.0, // master alpha (× global.opacity)
  fresnel: 1.1, // rim on the veil (× global.fresnel)
  filamentSpeed: 1.4, // filaments run faster than on other families: it is a reflex
  noiseScale: 1.0,
  noiseAmount: 1.0,
  dissolveEdge: 0.08,
  /* --- envelope (seconds) --- */
  introTime: 0.08, // the guard snaps up: the whole window is under half a second
  outroTime: 0.3, // exit of the return's impact layers
  exitTime: 0.12, // guard dissolve / sink before the window closes
  /* --- motes --- */
  moteSize: 1.0,
  moteSpeed: 1.2,
  moteDensity: 1.0,
  /* --- ward mark --- */
  groundOpacity: 0.7,
  groundGlow: 1.2,
  wardRadius: 1.4, // metres around the caster's feet
  /* --- return --- */
  trailBleed: 0.3, // seconds for the trail to bleed out after the hit
  shockTime: 0.3,
  shockWidth: 0.16,
  warp: 1.0,
  /* --- beat feedback on the return's landing (× global.explosionIntensity) --- */
  shakeAmount: 0.22, // camera trauma (× global.cameraShake)
  shakeTime: 0.3, // seconds for the shake to settle
  flashStrength: 0.22, // screen flash in the move's edge colour
  lightIntensity: 6, // point-light punch (× global.lightIntensity)
  lightRadius: 8, // its reach in metres (× global.lightRadius)
  palette: PALETTE
});

/** Mounts every key above as a live control, in the house editor style. */
export function buildCounterEditor(gui, Editor, c = COUNTER_LOOK) {
  const root = gui.addFolder('⟲  Counter mechanics');
  const veil = root.addFolder('Hero veil');
  Editor.range(veil, c, 'glow', 0, 4, 0.01, 'glow');
  Editor.range(veil, c, 'perfectGlow', 1, 4, 0.01, 'perfect-window burn');
  Editor.range(veil, c, 'opacity', 0, 2, 0.01, 'opacity');
  Editor.range(veil, c, 'fresnel', 0, 3, 0.01, 'fresnel');
  Editor.range(veil, c, 'filamentSpeed', 0, 4, 0.01, 'filament speed');
  Editor.range(veil, c, 'noiseScale', 0.2, 4, 0.01, 'noise scale');
  Editor.range(veil, c, 'noiseAmount', 0, 3, 0.01, 'noise amount');
  Editor.range(veil, c, 'dissolveEdge', 0.005, 0.4, 0.005, 'burn edge');
  const env = root.addFolder('Envelope');
  Editor.range(env, c, 'introTime', 0.02, 0.5, 0.01, 'guard raise (s)');
  Editor.range(env, c, 'outroTime', 0.05, 0.7, 0.01, 'impact exit (s)');
  Editor.range(env, c, 'exitTime', 0.02, 0.3, 0.01, 'guard exit (s)');
  const motes = root.addFolder('Motes');
  Editor.range(motes, c, 'moteSize', 0.1, 4, 0.01, 'size');
  Editor.range(motes, c, 'moteSpeed', 0, 4, 0.01, 'speed');
  Editor.range(motes, c, 'moteDensity', 0, 1, 0.01, 'density');
  const ward = root.addFolder('Ward mark');
  Editor.range(ward, c, 'groundOpacity', 0, 1, 0.01, 'bed opacity');
  Editor.range(ward, c, 'groundGlow', 0, 4, 0.01, 'glow');
  Editor.range(ward, c, 'wardRadius', 0.5, 3, 0.01, 'radius (m)');
  const ret = root.addFolder('Return');
  Editor.range(ret, c, 'trailBleed', 0.05, 0.6, 0.01, 'trail bleed (s)');
  Editor.range(ret, c, 'shockTime', 0.05, 0.6, 0.01, 'shock time (s)');
  Editor.range(ret, c, 'shockWidth', 0.01, 0.5, 0.005, 'shock width');
  Editor.range(ret, c, 'warp', 0, 3, 0.01, 'distortion');
  buildFeedbackFolder(root, Editor, c, 'Return feedback');
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
const FORWARD = new Vector3(0, 0, 1);
const _a = new Vector3();
const _b = new Vector3();
const _mid = new Vector3();
const _dir = new Vector3();

/** Matches the presentation's reversal cue duration. */
const REVERSAL_LIFE = 0.7;
/** Fraction of the reversal spent travelling (seconds). */
const TRAVEL = 0.24;
const TRAIL_SEGMENTS = 8;

/** Solid material, floor mark and mote behaviour of each counter. */
const STYLE = {
  'backdraft-reprisal': { solid: 'fire', ground: GROUND_PATTERN.SCORCH, motes: MOTE_STYLE.RISE, shard: 'fang' },
  'feedback-execution': { solid: 'storm', ground: GROUND_PATTERN.ARC, motes: MOTE_STYLE.ORBIT, shard: 'box' },
  'undertow-reversal': { solid: 'water', ground: GROUND_PATTERN.RIPPLE, motes: MOTE_STYLE.ORBIT, shard: 'sphere' },
  'faultline-retort': { solid: 'strata', ground: GROUND_PATTERN.FRACTURE, motes: MOTE_STYLE.RISE, shard: 'shard' },
  'facet-reprisal': { solid: 'ice', ground: GROUND_PATTERN.FACET, motes: MOTE_STYLE.FALL, shard: 'shard' },
  'shatterpoint-reversal': { solid: 'ice', ground: GROUND_PATTERN.RIME, motes: MOTE_STYLE.FALL, shard: 'shard' }
};

const slugOf = (uid) => uid?.split('/').at(-1);
const profileOf = (uid) => MECHANIC_VARIANTS[uid] ?? (uid === MECHANIC_PRESETS.counter.uid ? MECHANIC_PRESETS.counter : null);

/* ------------------------------------------------------------------------ */
/* Pooled resources                                                         */
/* ------------------------------------------------------------------------ */

function heroGeometry(v, uid) {
  const slug = slugOf(uid);
  if (!COUNTER_HERO_SLUGS.includes(slug)) return null;
  return poolGeometry(v, `counterHero:${slug}`, () => createCounterHeroGeometry(slug));
}

const FORMS = {
  /** A crescent guard plate, bevelled, standing in the XY plane. */
  crescent: () => {
    const s = new Shape();
    // A slender blade: the inner arc is offset down so the band thins to
    // points at both horns and is thickest over the guard's centre.
    s.absarc(0, 0, 1, Math.PI * 0.18, Math.PI * 0.82, false);
    s.absarc(0, -0.09, 0.95, Math.PI * 0.8, Math.PI * 0.2, true);
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, curveSegments: 20 });
    g.translate(0, -0.55, -0.03);
    return g;
  },
  /** A curved fang: a slim lathe bent forward toward its tip. */
  fang: () => {
    const g = new LatheGeometry([[0, 0], [0.32, 0.1], [0.3, 0.45], [0.16, 0.85], [0, 1.1]].map(([x, y]) => new Vector2(x, y)), 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + p.getY(i) * p.getY(i) * 0.25);
    g.translate(0, -0.55, 0);
    g.computeVertexNormals();
    return g;
  },
  /** Trail segment: two crossed quads, 1 m long on Y, uv.x along the length. */
  trail: () => {
    const positions = [], uv = [], index = [];
    for (let q = 0; q < 2; q++) {
      const base = positions.length / 3;
      for (const [y, u] of [[-0.5, 0], [0.5, 1]])
        for (const [side, w] of [[-0.5, 0], [0.5, 1]]) {
          positions.push(q ? 0 : side, y, q ? side : 0);
          uv.push(u, w);
        }
      index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }
};
const form = (v, name) => poolGeometry(v, `counterForm:${name}`, FORMS[name]);

/** Shader materials and mote geometries of one counter. */
function resources(v, slug) {
  const { core, edge } = PALETTE[slug];
  const style = STYLE[slug];
  const clock = v.terrainTime;
  const identity = COUNTER_HERO_SLUGS.indexOf(slug);
  return {
    veil: poolMaterial(v, `counterHeroMaterial:${slug}`, () =>
      createSurfaceMaterial({ clock, tint: core, tintB: edge, identity, paletteKey: slug })),
    trail: poolMaterial(v, `counterTrailMaterial:${slug}`, () =>
      createSurfaceMaterial({ clock, tint: edge, tintB: core, identity: identity + 7, paletteKey: slug })),
    ground: poolMaterial(v, `counterGround:${slug}`, () =>
      createGroundMaterial({ clock, tint: core, tintB: edge, pattern: style.ground, paletteKey: slug })),
    shock: poolMaterial(v, `counterShock:${slug}`, () => createShockMaterial({ clock, tint: edge, tintB: core, paletteKey: slug })),
    warp: poolMaterial(v, 'counterWarp', () => createWarpMaterial({ clock, tint: '#ffffff' })),
    moteMat: poolMaterial(v, `counterMoteMaterial:${slug}`, () =>
      createMoteMaterial({ clock, tint: edge, tintB: core, style: style.motes, paletteKey: slug })),
    burstMat: poolMaterial(v, `counterBurstMaterial:${slug}`, () =>
      createMoteMaterial({ clock, tint: edge, tintB: core, style: MOTE_STYLE.BURST, paletteKey: slug })),
    ring: poolGeometry(v, 'counterMoteRing', () => createMoteRing(40, 1.05, 0.5, 0.2)),
    burst: poolGeometry(v, 'counterBurstRing', () => createMoteRing(56, 0.35, 0.3, 0.6)),
    wake: poolGeometry(v, `counterWake:${slug}`, () => createMoteGeometry(v.geo[heroGeometry(v, `x/${slug}`)].getAttribute('position'), 24))
  };
}

/** Record the base pose of a node for `animateCounterVisual`. */
const mark = (node, type, phase = 0) => {
  node.userData.counterMotion = { type, phase, scale: node.scale.clone(), rotation: node.rotation.clone(), position: node.position.clone() };
  return node;
};

/* ------------------------------------------------------------------------ */
/* Guard                                                                    */
/* ------------------------------------------------------------------------ */

/** Element-specific orbiting pieces. All on the presentation's shared pools. */
function guardPieces(v, g, orbit, slug) {
  if (slug === 'backdraft-reprisal') {
    for (let i = 0; i < 11; i++) {
      const a = (i / 10 - 0.5) * Math.PI;
      const fang = v.mesh(form(v, 'fang'), i % 2 ? 'gold' : 'fire', orbit, Math.sin(a) * 1.05, 0.85 + 0.45 * Math.cos(a), Math.cos(a) * 1.05, 0.28, 0.5 + (i % 3) * 0.1, 0.28);
      fang.rotation.set(0, a, -a * 0.5);
      mark(fang, 'flame', i);
    }
    mark(v.ring(g, 'fire', 1.05, 0.12), 'ring', 0);
  } else if (slug === 'feedback-execution') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * Math.PI * 0.9;
      const bolt = v.mesh('box', 'storm', orbit, Math.sin(a) * 1.05, 1.1, Math.cos(a) * 1.05, 0.1, 1.1, 0.1);
      bolt.rotation.z = (i % 2 ? 1 : -1) * 0.45;
      mark(bolt, 'bolt', i);
      mark(v.mesh('shard', 'storm', orbit, Math.sin(a) * 1.05, 1.75, Math.cos(a) * 1.05, 0.1, 0.22, 0.1), 'bolt', i + 0.5);
    }
    mark(v.ring(g, 'storm', 0.8, 0.12), 'ring', 0);
  } else if (slug === 'undertow-reversal') {
    for (let i = 0; i < 4; i++) {
      const ring = v.ring(orbit, 'water', 0.55 + i * 0.2, 0.45 + i * 0.35);
      ring.rotation.y = i * 0.36;
      mark(ring, 'ring', i);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8;
      mark(v.mesh('sphere', 'water', orbit, Math.sin(a) * 0.9, 0.8 + (i % 3) * 0.4, Math.cos(a) * 0.9, 0.13), 'droplet', i);
    }
  } else if (slug === 'faultline-retort') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * Math.PI;
      const rock = v.mesh('ridge', i % 2 ? 'strata' : 'rock', orbit, Math.sin(a) * 1.1, 0.5, Math.cos(a) * 1.1, 0.35, 0.42, 0.35);
      rock.rotation.y = i * 0.65;
      mark(rock, 'rock', i);
      mark(v.mesh('shard', 'gold', orbit, Math.sin(a) * 1.05, 0.8, Math.cos(a) * 1.05, 0.06, 0.35, 0.06), 'spark', i);
    }
  } else if (slug === 'shatterpoint-reversal') {
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * Math.PI * 0.9;
      const shard = v.mesh('shard', 'ice', orbit, Math.sin(a) * 1.15, 1.25 + Math.cos(a) * 0.35, Math.cos(a) * 1.15, 0.1, 0.45, 0.1);
      shard.rotation.z = -a;
      mark(shard, 'facet', i);
    }
    mark(v.mesh('shield', 'steel', g, 0, 1.3, 1.1, 0.65, 0.7, 0.5), 'facet', 0);
  } else {
    // facet-reprisal
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * Math.PI;
      const facet = v.mesh('shard', i % 2 ? 'ice' : 'steel', orbit, Math.sin(a) * 1.05, 1.2, Math.cos(a) * 1.05, 0.23, 0.6, 0.12);
      facet.rotation.y = a;
      mark(facet, 'facet', i);
    }
    mark(v.ring(g, 'ice', 0.7, 0.2), 'ring', 0);
    mark(v.ring(g, 'steel', 1.1, 0.15), 'ring', 1);
  }
}

/** Build the guard rig for `uid`. Returns false for a counter it does not know. */
export function buildCounterGuard(v, g, uid) {
  const slug = slugOf(uid);
  const style = STYLE[slug];
  if (!style) return false;
  const r = resources(v, slug);
  registerRig(v, g);
  g.userData.counterGuard = true;
  g.userData.counterPerfect = profileOf(uid)?.perfect ?? 0.13;
  // 2. The veil: hero surface in the shader, between caster and attacker.
  const hero = mark(v.mesh(heroGeometry(v, uid), r.veil, g, 0, 0.08, 1.14, 0.82, 0.82, 0.82), 'hero');
  hero.name = `counter-hero:${slug}`;
  hero.renderOrder = 5;
  bindVfx(v, hero, 'counter', { role: 'surface', seed: COUNTER_HERO_SLUGS.indexOf(slug) });
  // 1. Solid guard: crescent plate behind the veil, then the orbiting pieces.
  const plate = v.mesh(form(v, 'crescent'), style.solid, g, 0, 1.3, 0.98, 0.95, 0.8, 1);
  mark(plate, 'plate', 0);
  const orbit = new Group();
  orbit.name = 'counter-orbit';
  g.add(orbit);
  mark(orbit, 'orbit', slug === 'undertow-reversal' ? 1 : 0);
  guardPieces(v, g, orbit, slug);
  // 3 + 4. Ward mark at the feet (resized live by animateNode) and the guard motes.
  const ward = addGround(v, g, 'counter', r.ground, COUNTER_LOOK.wardRadius, { name: 'counter-ward', seed: 2 });
  ward.userData.counterWard = true;
  addMotes(v, g, 'counter', r.ring, r.moteMat, { name: 'counter-guard-motes', seed: COUNTER_HERO_SLUGS.indexOf(slug) });
  // The solid plate and pieces sink out with the window (the shader layers
  // above dissolve on the same rig exit).
  bindRigSolids(v, g, 'counter');
  return true;
}

/* ------------------------------------------------------------------------ */
/* Return                                                                   */
/* ------------------------------------------------------------------------ */

/** Coordinates are relative to the attacker (the cue's impact position). */
export function buildCounterReversal(v, g, data, profile) {
  const slug = slugOf(data.uid);
  const style = STYLE[slug];
  if (!style || !Array.isArray(data.from) || !Array.isArray(data.position)) return false;
  const start = new Vector3(data.from[0] - data.position[0], 1.15, data.from[2] - data.position[2]);
  const end = new Vector3(0, 1.15, 0);
  const distance = start.distanceTo(end);
  if (!Number.isFinite(distance) || distance > 30) return false;
  g.userData.counterReversal = true;
  g.userData.counterSlug = slug;
  g.userData.counterLanded = false;
  registerRig(v, g);
  const r = resources(v, slug);
  const seed = COUNTER_HERO_SLUGS.indexOf(slug);

  // 1. Trail: a fixed eight segments keeps a long return as cheap as a short one.
  _dir.copy(end).sub(start).normalize();
  for (let i = 0; i < TRAIL_SEGMENTS; i++) {
    _a.copy(start).lerp(end, i / TRAIL_SEGMENTS);
    _b.copy(start).lerp(end, (i + 1) / TRAIL_SEGMENTS);
    _mid.copy(_a).add(_b).multiplyScalar(0.5);
    // Each segment is 35% longer than its span so the feathered ends overlap
    // and the chain reads as one continuous streak.
    const segment = v.mesh(form(v, 'trail'), r.trail, g, _mid.x, _mid.y, _mid.z, 0.34, Math.max(0.01, _a.distanceTo(_b) * 1.35), 0.34);
    segment.quaternion.setFromUnitVectors(UP, _dir);
    segment.userData.counterTrail = i;
    bindVfx(v, segment, 'counter', { role: 'surface', life: REVERSAL_LIFE, seed: seed + i * 0.3 });
  }

  // 2. Projectile: the hero surface, facing its travel, with a solid core and a wake.
  const orb = v.mesh(heroGeometry(v, data.uid), r.veil, g, start.x, start.y, start.z, 0.26, 0.26, 0.26);
  orb.quaternion.setFromUnitVectors(FORWARD, _dir);
  orb.userData.counterProjectile = { start, end };
  bindVfx(v, orb, 'counter', { role: 'surface', life: REVERSAL_LIFE, seed });
  const core = v.mesh('sphere', style.solid, orb, 0, 0.9, 0, 0.55);
  core.castShadow = false;
  addMotes(v, orb, 'counter', r.wake, r.moteMat, { name: 'counter-wake', life: REVERSAL_LIFE, seed });

  // 3. Impact at the attacker, sized to the move's real footprint / splash.
  const impact = new Group();
  impact.name = 'counter-impact';
  impact.userData.counterImpact = true;
  g.add(impact);
  const radius = profile?.footprint ?? profile?.splash ?? 1.2;
  v.ring(impact, style.solid, radius, 0.12);
  v.ring(impact, style.solid, radius * 0.62, 0.18);
  const shardGeo = style.shard === 'fang' ? form(v, 'fang') : style.shard;
  for (let i = 0; i < 10; i++) {
    const a = (i * TAU) / 10;
    const shard = v.mesh(shardGeo, style.solid, impact, Math.sin(a) * radius * 0.65, 0.2, Math.cos(a) * radius * 0.65, 0.1, 0.35 + (i % 3) * 0.1, 0.1);
    shard.rotation.z = Math.sin(a) * 0.7;
    shard.rotation.x = Math.cos(a) * 0.7;
  }
  const timed = { life: REVERSAL_LIFE, delay: TRAVEL, seed };
  addShock(v, impact, 'counter', r.shock, r.warp, radius * 1.15, { ...timed, name: 'counter-shock' });
  addGround(v, impact, 'counter', r.ground, radius, { ...timed, name: 'counter-impact-ground' });
  addMotes(v, impact, 'counter', r.burst, r.burstMat, { ...timed, name: 'counter-burst' });
  return true;
}

/* ------------------------------------------------------------------------ */
/* Animation                                                                */
/* ------------------------------------------------------------------------ */

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Per-call state for the traversal below: module scratch instead of a closure,
// so animating a rig allocates nothing per frame.
let _age = 0, _reduced = false, _progress = 0, _burn = 1, _bleed = 1;

function animateNode(node) {
  const m = node.userData.counterMotion;
  if (m && !_reduced) {
    const w = Math.sin(_age * (m.type === 'bolt' ? 22 : 7) + m.phase * 1.7);
    if (m.type === 'orbit') {
      node.rotation.y = m.rotation.y + Math.sin(_age * 3) * 0.12;
      // The guard snaps up with a small overshoot.
      const t = clamp01(_age / 0.12);
      node.scale.setScalar(1 + 0.12 * Math.sin(t * Math.PI) - (1 - t) * 0.6);
    } else if (m.type === 'ring') node.rotation.z = m.rotation.z + _age * (m.phase % 2 ? -1 : 1) * 0.6;
    else if (m.type === 'droplet') node.position.y = m.position.y + w * 0.14;
    else if (m.type === 'rock') node.position.y = m.position.y + w * 0.045;
    else if (m.type === 'facet') node.rotation.z = m.rotation.z + w * 0.09;
    else if (m.type === 'plate') node.rotation.x = m.rotation.x - 0.25 * (1 - clamp01(_age / 0.12));
    else node.scale.y = m.scale.y * (0.82 + (0.18 * (w + 1)) / 2);
  }
  const vfx = node.userData.vfx;
  if (vfx && m?.type === 'hero') vfx.strength = _burn;
  if (node.userData.counterWard) node.scale.set(COUNTER_LOOK.wardRadius, 1, COUNTER_LOOK.wardRadius);
  if (node.userData.counterTrail !== undefined) {
    node.visible = _progress >= node.userData.counterTrail / TRAIL_SEGMENTS;
    // A true fade (alpha and colour), not the strength accent.
    if (vfx) vfx.fade = _bleed;
  }
  if (node.userData.counterProjectile) {
    const { start, end } = node.userData.counterProjectile;
    node.position.copy(start).lerp(end, _progress);
    node.visible = _progress < 1;
  }
  if (node.userData.counterImpact) {
    node.visible = _progress >= 1;
    if (_reduced) node.scale.setScalar(1);
    else {
      const grow = clamp01((_age - TRAVEL) / 0.16);
      const exit = clamp01((REVERSAL_LIFE - _age) / 0.15);
      node.scale.setScalar(Math.max(0.01, Math.min(grow, exit)));
    }
  }
}

/**
 * Drive one counter rig (guard or return) at `age` seconds. Called by the
 * presentation every update; allocation-free and a pure function of `age`.
 */
export function animateCounterVisual(root, age, reducedMotion = false) {
  _age = age;
  _reduced = reducedMotion;
  _progress = reducedMotion ? 1 : clamp01(age / TRAVEL);
  // The guard burns hotter while the perfect window is open.
  _burn = root.userData.counterPerfect !== undefined && age < root.userData.counterPerfect ? COUNTER_LOOK.perfectGlow : 1;
  // The trail bleeds out once the return has landed.
  _bleed = 1 - clamp01((age - TRAVEL) / Math.max(0.02, COUNTER_LOOK.trailBleed));
  if (root.userData.counterGuard && !reducedMotion) {
    // Snap up with a small overshoot, then draw in over the window's exit.
    const v = rigView(root);
    const exit = v ? rigExit(v, root, COUNTER_LOOK.exitTime) : 0;
    const t = clamp01(age / Math.max(0.02, COUNTER_LOOK.introTime));
    const enter = 0.82 + 0.18 * t + 0.08 * Math.sin(t * Math.PI);
    root.scale.setScalar(Math.max(0.01, enter * (1 - 0.45 * exit * exit)));
  }
  root.traverse(animateNode);
  if (root.userData.counterReversal && _progress >= 1 && !root.userData.counterLanded) {
    // The landing tick: shake, flash and light punch at the attacker.
    root.userData.counterLanded = true;
    const v = rigView(root);
    if (v) beatFeedback(v, 'counter', root.userData.counterSlug, root.position.x, root.position.y, root.position.z, 1);
  }
}
