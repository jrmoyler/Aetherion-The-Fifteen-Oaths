import { Color, Vector3 } from 'three';
import { DecalType } from '../../../effects/GroundDecals.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { WEAVE_LOOK } from './WeaveLook.js';
import { weaveStyle } from './WeaveHeroGeometry.js';

/**
 * WeaveBeats — what the camera, the screen and the light do when a weave cue
 * lands.
 *
 * `MechanicPresentation` builds the meshes of a cue; it has no handle on the
 * engine systems. These beats do, and they are deliberately a separate,
 * engine-facing function so the presentation stays testable on a bare
 * `Scene`. The host that owns `app` calls `weaveBeat(app, cue)` once per
 * combat cue, beside `presentation.cue(cue)` (see `MechanicHost#cue`).
 *
 *  - **anchor** (planted) — a faint thump, nothing more; arrival is the
 *    shader's reveal.
 *  - **anchor-break** — the loudest beat: shake, a palette flash, a light
 *    punch from the pylon's height and a style mark burnt into the floor.
 *  - **weave-burst** — chain (storm arcs), quake (earth), flood (water) and
 *    shatter / draft (crystal, wind), each with its own magnitudes.
 *  - **anchor-expire** — a soft settle: shake only, no flash, so a timed-out
 *    anchor never reads like one that was destroyed.
 *
 * Every magnitude is a `WEAVE_LOOK` key, read at the beat, so the editor's
 * "8 · Beats" folder applies to the next cue. `app.shake.add` applies
 * `settings.global.cameraShake` itself; flash and the ground mark are scaled
 * here by `settings.global.explosionIntensity`, the light by
 * `lightIntensity` / `lightRadius` inside `LightPool#set`.
 *
 * No allocation: one scratch `Vector3`, one scratch `Color` and one reused
 * decal options object. A cue object is handled at most once (a `WeakSet`
 * guards it), so calling the beat from two places can never double the
 * shake. Under `prefers-reduced-motion` the shake and the flash are skipped;
 * the light and the ground mark still show the beat.
 */

/** Ground mark per weave style, from the engine's decal library. */
const MARK = {
  fire: DecalType.SCORCH,
  frost: DecalType.FROST,
  storm: DecalType.ARC,
  water: DecalType.RIPPLE,
  earth: DecalType.CRACK,
  crystal: DecalType.SHOCKWAVE,
  wind: DecalType.DUSTRING
};

const _at = new Vector3();
const _color = new Color();
const _edge = new Color();
// Reused for every mark: `DecalSystem#spawn` destructures it immediately.
const _decal = { radius: 1, life: 1, intensity: 1, colorA: _color, colorB: _edge, width: 0.12, height: 0.03 };

const ORIGIN = Object.freeze([0, 0, 0]);
const handled = new WeakSet();

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Palette keys per style, so a beat never builds a string. */
const KEYS = Object.fromEntries(Object.keys(MARK).map((s) => [s, [`${s}B`, `${s}C`]]));

// The magnitudes of the cue being played (one scratch record, rewritten per beat).
const _beat = { shake: 0, flash: 0, light: false, mark: 0, decay: 3 };

/** Fill `_beat` for one cue; false when the phase has no beat. */
function magnitudes(cue) {
  const c = WEAVE_LOOK, b = _beat;
  b.flash = 0;
  b.light = false;
  b.mark = 0;
  b.decay = 3;
  switch (cue.phase) {
    case 'anchor':
      b.shake = c.arriveShake;
      return true;
    case 'anchor-expire':
      b.shake = c.expireShake;
      return true;
    case 'anchor-break':
      b.shake = c.breakShake;
      b.flash = c.breakFlash;
      b.light = true;
      b.mark = 1.3;
      return true;
    case 'weave-burst':
      b.light = true;
      if (cue.weaveEffect === 'chain') {
        b.shake = c.chainShake;
        b.flash = c.chainFlash;
        b.mark = 0.9;
      } else if (cue.weaveEffect === 'quake') {
        b.shake = c.quakeShake;
        b.flash = c.quakeFlash;
        b.mark = cue.radius ?? 2;
        b.decay = 2.2; // a heavier, longer roll than the snaps above
      } else {
        b.shake = c.burstShake;
        b.flash = c.burstFlash;
        b.mark = cue.radius ?? 1.2;
      }
      return true;
    default:
      return false;
  }
}

/**
 * Play the engine-side beat of one weave cue. Safe to call with any cue (it
 * ignores everything that is not a weave mechanic phase) and with a partial
 * `app` (each system is optional).
 */
export function weaveBeat(app, cue) {
  if (!app || !cue || cue.kind !== 'mechanic' || cue.family !== 'weave' || handled.has(cue)) return false;
  if (!magnitudes(cue)) return false;
  handled.add(cue);
  const { shake, flash, light, mark, decay } = _beat;
  const g = settings.global;
  const style = weaveStyle(cue.uid ?? '');
  const [mid, edge] = KEYS[style] ?? KEYS.fire;
  const quiet = reducedMotion();

  // The palette's mid stop tints the flash, light and mark; its edge stop rims the mark.
  _color.copy(getColor(WEAVE_LOOK[mid]));
  _edge.copy(getColor(WEAVE_LOOK[edge]));
  const p = cue.position ?? ORIGIN;
  _at.set(p[0], 0, p[2]);

  if (!quiet && shake > 0) app.shake?.add(shake, decay, 18);
  if (!quiet && flash > 0) app.flash?.trigger(_color, flash * g.explosionIntensity);

  if (light && WEAVE_LOOK.lightPunch > 0 && app.lights) {
    // A one-shot punch: drive the pooled light to its peak and release it at
    // once; the pool fades released lights out on its own.
    const entry = app.lights.acquire();
    if (entry) {
      _at.y = 1.2;
      app.lights.set(entry, _at, _color, WEAVE_LOOK.lightPunch * g.explosionIntensity, WEAVE_LOOK.lightReach, 0);
      entry.light.intensity = entry.target;
      app.lights.release(entry);
      _at.y = 0;
    }
  }

  if (mark > 0 && WEAVE_LOOK.decalStrength > 0 && app.decals) {
    _decal.radius = mark;
    _decal.life = WEAVE_LOOK.decalLife;
    _decal.intensity = WEAVE_LOOK.decalStrength * g.explosionIntensity;
    app.decals.spawn(MARK[style] ?? DecalType.SHOCKWAVE, _at, _decal);
  }
  return true;
}
