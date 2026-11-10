import { Color, Vector3 } from 'three';
import { DecalType } from '../../../effects/GroundDecals.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { WORLDSHAPE_LOOK, WORLDSHAPE_TERRAINS } from './WorldshapeLook.js';
import { MECHANIC_PRESETS as P, MECHANIC_VARIANTS } from './presets.js';

/**
 * WorldshapeBeats — what the camera, the screen and the light do when the
 * ground moves.
 *
 * The presentation draws the field and its pulse rings; this is the
 * engine-facing half of the same beats, called by the host that owns `app`
 * once per combat cue, beside `presentation.cue(cue)` (see `MechanicHost#cue`):
 *
 *  - **worldshape** (arrival) — the field heaves up: a rolling shake, a flash
 *    of the terrain's mid colour and a light punch over the centre.
 *  - **terrain-pulse** — every damage pulse: a short snap, a smaller flash, a
 *    light punch and the terrain's mark burnt across the field radius, so a
 *    pulse that deals damage always reads on screen.
 *  - **terrain-expire** — a soft settle, shake only.
 *
 * Every magnitude is a `WORLDSHAPE_LOOK` key read at the beat (editor folder
 * "8 · Beats"). `app.shake.add` applies `settings.global.cameraShake`; flash,
 * light and mark are scaled by `settings.global.explosionIntensity`.
 *
 * No allocation: scratch vector, colours and decal options; a `WeakSet`
 * makes a cue play at most once. Reduced motion skips the shake and the
 * flash but keeps the light and the mark.
 */

/** Ground mark per terrain palette. */
const MARK = {
  scorched: DecalType.SCORCH,
  glacier: DecalType.FROST,
  stormground: DecalType.ARC,
  floodplain: DecalType.RIPPLE,
  glass: DecalType.SHOCKWAVE,
  continental: DecalType.CRACK
};

/** Palette keys per terrain, so a beat never builds a string. */
const KEYS = Object.fromEntries(Object.keys(MARK).map((t) => [t, [`${t}B`, `${t}C`]]));

const _at = new Vector3();
const _color = new Color();
const _edge = new Color();
// Reused for every mark: `DecalSystem#spawn` destructures it immediately.
const _decal = { radius: 1, life: 1, intensity: 1, colorA: _color, colorB: _edge, width: 0.12, height: 0.03 };

const ORIGIN = Object.freeze([0, 0, 0]);
const handled = new WeakSet();

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Terrain palette prefix of a worldshape uid (the canonical preset is continental). */
export function worldshapeTerrain(uid) {
  const slug = (uid ?? P.worldshape.uid).split('/').at(-1);
  return WORLDSHAPE_TERRAINS[slug] ?? 'continental';
}

/**
 * Play the engine-side beat of one worldshape cue. Ignores every other cue
 * and tolerates a partial `app` (each system is optional).
 */
export function worldshapeBeat(app, cue) {
  if (!app || !cue || cue.kind !== 'mechanic' || cue.family !== 'worldshape' || handled.has(cue)) return false;
  const c = WORLDSHAPE_LOOK, g = settings.global;
  let shake = 0, flash = 0, light = false, mark = false, decay = 3;
  if (cue.phase === 'worldshape') {
    shake = c.arriveShake;
    flash = c.arriveFlash;
    light = true;
    decay = 1.8; // the heave rolls rather than snaps
  } else if (cue.phase === 'terrain-pulse') {
    shake = c.pulseShake;
    flash = c.pulseFlash;
    light = true;
    mark = true;
  } else if (cue.phase === 'terrain-expire') {
    shake = c.expireShake;
  } else return false;
  handled.add(cue);

  const terrain = worldshapeTerrain(cue.uid);
  const [mid, edge] = KEYS[terrain];
  _color.copy(getColor(c[mid]));
  _edge.copy(getColor(c[edge]));
  const p = cue.position ?? ORIGIN;
  _at.set(p[0], 0, p[2]);
  const quiet = reducedMotion();

  if (!quiet && shake > 0) app.shake?.add(shake, decay, 16);
  if (!quiet && flash > 0) app.flash?.trigger(_color, flash * g.explosionIntensity);

  if (light && c.lightPunch > 0 && app.lights) {
    // One-shot punch: peak now, released at once, faded out by the pool.
    const entry = app.lights.acquire();
    if (entry) {
      _at.y = 1.6;
      app.lights.set(entry, _at, _color, c.lightPunch * g.explosionIntensity, c.lightReach, 0);
      entry.light.intensity = entry.target;
      app.lights.release(entry);
      _at.y = 0;
    }
  }

  if (mark && c.decalStrength > 0 && app.decals) {
    _decal.radius = (MECHANIC_VARIANTS[cue.uid] ?? P.worldshape).radius ?? 4;
    _decal.life = c.decalLife;
    _decal.intensity = c.decalStrength * g.explosionIntensity;
    app.decals.spawn(MARK[terrain], _at, _decal);
  }
  return true;
}
