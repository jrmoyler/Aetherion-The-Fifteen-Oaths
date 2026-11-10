import { settings } from '../config/settings.js';
import { FORMATIONS, MAX_DUMMIES, normalizeMix } from './DummyArchetypes.js';

/**
 * `window.matrix.targets.set({ count, formation, mix })`: change the field and
 * re-form it at once. Every argument is optional; what is left out stays.
 *
 * @param {object} app
 * @param {{count?: number, formation?: string, mix?: object|string|string[], enabled?: boolean}} options
 */
export function setTargets(app, { count, formation, mix, enabled } = {}) {
  const d = settings.dummies;
  if (count !== undefined && Number.isFinite(Number(count))) d.count = Math.max(0, Math.min(MAX_DUMMIES, Math.round(Number(count))));
  if (formation !== undefined && FORMATIONS[formation]) d.formation = formation;
  if (mix !== undefined) Object.assign(d.mix, normalizeMix(mix));
  if (enabled !== undefined) d.enabled = !!enabled;
  // Build the slots for the new count and mix now, then stand everyone afresh.
  app.dummies._anchor?.copy(app.character.position);
  if (app.dummies.source) app.dummies._resize(d.count);
  app.dummies.reset();
  app.editor?.refresh?.();
  return targetsState(app);
}

export function targetsState(app) {
  const d = settings.dummies;
  return {
    enabled: d.enabled,
    count: d.count,
    formation: d.formation,
    mix: { ...d.mix },
    standing: app.dummies.ownSlots.map((slot) => ({ archetype: slot.dummy.archetype ?? 'standard', alive: slot.dummy.alive }))
  };
}
