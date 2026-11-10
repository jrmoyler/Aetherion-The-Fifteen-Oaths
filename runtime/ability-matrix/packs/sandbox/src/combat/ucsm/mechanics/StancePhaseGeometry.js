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
 * Stance phase surfaces — one authored outline for every element and combat
 * beat of a stance (24 in all).
 *
 * The four beats each have a shape language, and each element a stroke:
 *
 *   - anticipation — a low, tight ring of short strokes gathering at the feet.
 *   - block — a tall palisade around the body (the impact being absorbed).
 *   - reversal — a mid-height flare thrown outward (the retort leaving).
 *   - finisher — a wide, flat burst of many strokes to the edge.
 *
 *   - fire / storm / water — ribbons: curling flame, zig-zag discharge, a
 *     current turning as it runs outward. Each beat adds a closing arc.
 *   - frost / earth / force — faceted crystals, slabs and ward plates, with an
 *     inner ring of smaller facets (frost doubles its outer ring).
 *
 * Finisher space is **normalised to the gameplay radius**: every vertex is
 * inside the unit disc and the presentation scales the finisher group by the
 * real damage radius, so the surface ends exactly where the hit does.
 */
export const STANCE_PHASES = Object.freeze(['anticipation', 'block', 'reversal', 'finisher']);
export const STANCE_PHASE_ELEMENTS = Object.freeze(['fire', 'frost', 'storm', 'water', 'earth', 'force']);

/** Core / edge colours of each element's phase surfaces. */
export const STANCE_PHASE_PALETTE = Object.freeze({
  fire: ['#ff822d', '#ffd27a'],
  frost: ['#afeaff', '#ffffff'],
  storm: ['#baa9ff', '#f2ecff'],
  water: ['#40c8ee', '#c6f3ff'],
  earth: ['#d6a56c', '#ffd08a'],
  force: ['#a6e8fa', '#f0fdff']
});

/** Strokes per beat, their radius and height (unit-disc space). */
const COUNT = { anticipation: 6, block: 8, reversal: 5, finisher: 12 };
const RADIUS = { anticipation: 0.55, block: 0.65, reversal: 0.68, finisher: 0.78 };
const HEIGHT = { anticipation: 0.22, block: 1.35, reversal: 0.85, finisher: 0.42 };

/** Presentation lifetimes of each beat (seconds), matching the cue durations. */
export const STANCE_PHASE_LIFE = Object.freeze({ anticipation: 0.5, block: 0.25, reversal: 0.7, finisher: 0.65 });

/** How the motes of each beat behave. */
const PHASE_MOTES = { anticipation: MOTE_STYLE.GATHER, block: MOTE_STYLE.BURST, reversal: MOTE_STYLE.BURST, finisher: MOTE_STYLE.BURST };

const TAU = Math.PI * 2;

/** Deterministic phase surface for `element` × `phase`. Throws on unknown input. */
export function createStancePhaseSurface(element, phase) {
  if (!STANCE_PHASE_ELEMENTS.includes(element) || !STANCE_PHASES.includes(phase)) throw new Error('Unknown stance phase');
  const b = new FormBuilder();
  const count = COUNT[phase], radius = RADIUS[phase], height = HEIGHT[phase];
  const faceted = element === 'frost' || element === 'earth' || element === 'force';
  for (let k = 0; k < count; k++) {
    const angle = (k * TAU) / count;
    const sx = Math.sin(angle), sz = Math.cos(angle);
    if (faceted) {
      const r = radius * 0.78, x = sx * r, z = sz * r;
      const w = element === 'earth' ? 0.12 : element === 'force' ? 0.1 : 0.075;
      const h = height * (element === 'earth' ? 0.4 : element === 'force' ? 0.5 : 0.6);
      b.facet(x, h + 0.06, z, w, h, element === 'force' ? 0.04 : 0.1, sx * 0.025, angle);
      if (element === 'frost') b.facet(sx * r * 0.76, h * 0.55 + 0.06, sz * r * 0.76, 0.035, h * 0.5, 0.05, 0, angle);
      // Inner ring: half-size facets, offset half a step.
      const ia = angle + Math.PI / count, ir = r * 0.45;
      b.facet(Math.sin(ia) * ir, h * 0.3 + 0.04, Math.cos(ia) * ir, w * 0.5, h * 0.3, 0.04, 0, ia);
    } else {
      const stroke = [];
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        const curve = element === 'storm' ? (i % 2 ? 1 : -1) * 0.045 * (1 - t)
          : element === 'water' ? Math.sin(t * 6 + k) * 0.07
          : 0.04 * Math.sin(t * 9 + k) * t;
        const r = radius * (0.2 + 0.7 * t), a = angle + (element === 'water' ? t * 0.32 : 0);
        stroke.push([Math.sin(a) * r + sz * curve, 0.05 + height * Math.sin(Math.PI * t * 0.75), Math.cos(a) * r - sx * curve]);
      }
      b.ribbon(stroke, element === 'storm' ? 0.025 : element === 'water' ? 0.05 : 0.045, 'xz');
    }
  }
  if (!faceted) {
    // The closing arc that ties the strokes into one beat.
    const arc = [];
    const r = radius * 0.95, sweep = phase === 'finisher' ? 1 : 0.7;
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * TAU * sweep + STANCE_PHASES.indexOf(phase);
      const lift = element === 'storm' ? (i % 2 ? 0.03 : -0.03) : 0.02 * Math.sin(a * 4);
      arc.push([Math.sin(a) * r, 0.06 + height * 0.15 + lift, Math.cos(a) * r]);
    }
    b.ribbon(arc, 0.03, 'xz', 0.4);
  }
  return b.build(`stance-phase:${element}:${phase}`);
}

/**
 * Add the phase surface and its motes to a stance beat. The motes gather at
 * the feet on anticipation and burst outward on every other beat.
 */
export function addStancePhaseSurface(v, group, element, phase) {
  if (!STANCE_PHASE_ELEMENTS.includes(element) || !STANCE_PHASES.includes(phase)) return false;
  const [core, edge] = STANCE_PHASE_PALETTE[element];
  const clock = v.terrainTime;
  const life = STANCE_PHASE_LIFE[phase];
  const key = `stancePhaseHero:${element}:${phase}`;
  const mat = `stancePhaseMaterial:${element}:${phase}`;
  const points = `stancePhaseMotes:${element}:${phase}`;
  const pointMat = `stancePhaseMoteMaterial:${element}`;
  const burstMat = `stancePhaseMoteMaterial:${element}:${PHASE_MOTES[phase]}`;
  poolGeometry(v, key, () => createStancePhaseSurface(element, phase));
  poolMaterial(v, mat, () =>
    createSurfaceMaterial({
      clock,
      tint: core,
      tintB: edge,
      identity: STANCE_PHASE_ELEMENTS.indexOf(element) + STANCE_PHASES.indexOf(phase) * 0.5,
      paletteKey: element
    })
  );
  poolGeometry(v, points, () => createMoteGeometry(v.geo[key].getAttribute('position'), 32));
  // The element's resting motes (RISE / FALL by temperament) and the beat's own behaviour.
  poolMaterial(v, pointMat, () =>
    createMoteMaterial({ clock, tint: core, tintB: edge, style: element === 'frost' ? MOTE_STYLE.FALL : MOTE_STYLE.RISE, paletteKey: element }));
  poolMaterial(v, burstMat, () => createMoteMaterial({ clock, tint: edge, tintB: core, style: PHASE_MOTES[phase], paletteKey: element }));
  const hero = v.mesh(key, mat, group);
  hero.name = key;
  hero.renderOrder = 5;
  bindVfx(v, hero, 'stance', { role: 'surface', life, seed: STANCE_PHASES.indexOf(phase) });
  addMotes(v, group, 'stance', points, pointMat, { name: points, life, seed: 1 });
  addMotes(v, group, 'stance', points, burstMat, { name: `${points}:beat`, life, seed: 2, outro: phase !== 'anticipation' });
  return true;
}
