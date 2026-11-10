import { Color } from 'three';
import { settings } from '../../../config/settings.js';
import { lookOf, rigView } from './ConvergenceCounterStanceVfx.js';

/**
 * Beat feedback for the Convergence, Counter and Stance families: camera
 * shake, a screen flash and a point-light punch on the beats that land.
 *
 *  - convergence — the impact (the reaction resolves on that tick);
 *  - counter     — the return hitting the attacker (after the travel);
 *  - stance      — block (light), reversal (medium), finisher (full).
 *
 * The three effects are the app's shared ones on the ability context
 * (`ctx.shake`, `ctx.flash`, `ctx.lights`), the same objects the native casts
 * drive. Amounts come from the family's live `*_LOOK` block (`shakeAmount`,
 * `shakeTime`, `flashStrength`, `lightIntensity`, `lightRadius`) and are scaled
 * by `settings.global.explosionIntensity`; `CameraShake.add` applies
 * `global.cameraShake` itself, the light takes `global.lightIntensity` and
 * `global.lightRadius`, and the flash's colour is the move's live palette edge.
 *
 * ## The light punch
 *
 * `ctx.lights` is a fixed pool of point lights that never leave the scene (a
 * changing light count recompiles every material). A punch acquires one, sets
 * it at full strength over the beat and releases it straight away: the pool
 * fades released lights out on its own update, which is exactly the decay a
 * punch wants, and no per-frame driver is needed here.
 *
 * ## Where the context comes from
 *
 * `MechanicPresentation` is built with only the scene and the systems, so the
 * host hands the context over with `attachMechanicFeedback(presentation, ctx)`
 * (or sets `presentation.ctx`). Until it does, every call is a no-op — which is
 * also what keeps the node tests free of camera and post objects.
 *
 * Reduced motion: no camera shake, and the flash at half strength. The light
 * still punches (it is illumination, not motion).
 */

/** Presentation → ability context. */
const CONTEXTS = new WeakMap();

/** Give a presentation the ability context its beats drive. */
export function attachMechanicFeedback(presentation, ctx) {
  if (ctx) CONTEXTS.set(presentation, ctx);
  else CONTEXTS.delete(presentation);
  return presentation;
}

function contextOf(v) {
  return CONTEXTS.get(v) ?? v.ctx ?? null;
}

/** Scratch: the flash / light colour. */
const _color = new Color();

/**
 * Fire one beat at world `(x, y, z)`. `scale` is the beat's weight (a stance
 * block is lighter than its finisher). Returns false when there is no context.
 */
export function beatFeedback(v, family, paletteKey, x, y, z, scale = 1) {
  const ctx = contextOf(v);
  if (!ctx) return false;
  const look = lookOf(family);
  const g = settings.global;
  const power = scale * g.explosionIntensity;
  _color.set(look.palette?.[paletteKey]?.edge ?? '#ffffff');

  if (!v.reducedMotion && ctx.shake && look.shakeAmount > 0)
    ctx.shake.add(look.shakeAmount * power, 1 / Math.max(0.05, look.shakeTime), 18);

  if (ctx.flash && look.flashStrength > 0)
    ctx.flash.trigger(_color, look.flashStrength * power * (v.reducedMotion ? 0.5 : 1));

  if (ctx.lights && look.lightIntensity > 0) {
    const entry = ctx.lights.acquire();
    if (entry) {
      // Lifted to chest height so the punch lights the sculpture, not just the floor.
      entry.light.position.set(x, y + 1.2, z);
      entry.light.color.copy(_color);
      entry.light.intensity = look.lightIntensity * power * g.lightIntensity;
      entry.light.distance = look.lightRadius * g.lightRadius;
      // Released at once: the pool's own update fades it out.
      ctx.lights.release(entry);
    }
  }
  return true;
}

/**
 * Arm a beat on a cue rig: it fires once, when the presentation adds the rig
 * to the scene (by then the rig has its world position). The beat spec is
 * plain data in `userData`; the presentation is found through `rigView`.
 */
export function armBeat(g, family, paletteKey, scale = 1) {
  g.userData.mechanicBeat = { family, paletteKey, scale, fired: false };
  g.addEventListener('added', onBeatAdded);
  return g;
}

/** Shared listener: no closure per rig. */
function onBeatAdded(event) {
  const g = event.target;
  const beat = g.userData.mechanicBeat;
  const v = rigView(g);
  if (!beat || beat.fired || !v) return;
  beat.fired = true;
  beatFeedback(v, beat.family, beat.paletteKey, g.position.x, g.position.y, g.position.z, beat.scale);
}

/**
 * Add the feedback controls of a family's look block to `root`, in the house
 * editor style. Shared by the three family editors.
 */
export function buildFeedbackFolder(root, Editor, c, title = 'Beat feedback') {
  const f = root.addFolder(title);
  Editor.range(f, c, 'shakeAmount', 0, 1, 0.01, 'camera shake');
  Editor.range(f, c, 'shakeTime', 0.05, 1.5, 0.01, 'shake decay (s)');
  Editor.range(f, c, 'flashStrength', 0, 1, 0.01, 'screen flash');
  Editor.range(f, c, 'lightIntensity', 0, 20, 0.1, 'light punch');
  Editor.range(f, c, 'lightRadius', 1, 30, 0.1, 'light radius (m)');
  return f;
}
