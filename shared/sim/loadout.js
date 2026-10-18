// Authoritative Oath loadouts. Catalog defines presentation/geometry; each class slot
// retains bounded slot costs; damage and windup follow the selected shape.
import { equippedAbilityForSlot, hotbarFor } from '../abilities.js';

export function abilityForSlot(oath, cls, slot, id) {
  return equippedAbilityForSlot(oath, cls, slot, id);
}

export function restoreLoadout(oath, cls, ids) {
  const defaults = hotbarFor(oath, cls);
  if (!Array.isArray(ids) || ids.length !== 5 || new Set(ids).size !== 5) return defaults;
  const selected = ids.map((id, i) => abilityForSlot(oath, cls, i + 1, id));
  return selected.every(Boolean) ? [defaults[0], ...selected] : defaults;
}
