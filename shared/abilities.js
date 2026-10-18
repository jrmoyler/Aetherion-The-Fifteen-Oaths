import { ABILITIES_BY_OATH, KITS } from './abilities.generated.js';
import { CLASSES } from './oaths.js';

export { ABILITIES_BY_OATH, KITS };

/** Flat ability lookup by uid (e.g. "codex/riptide"). */
export const ABILITY_BY_ID = Object.fromEntries(
  Object.values(ABILITIES_BY_OATH).flat().map((a) => [a.id, a]),
);

/** Basic attack pseudo-ability id per class. */
export const BASIC_ATTACK = { ninja: 'basic/ninja', sorcerer: 'basic/sorcerer' };

/** Shared client/server tuning for an equipped slot (hotbar slots 1..5). */
export function equippedAbilityForSlot(oathId, cls, slot, id) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 5 || typeof id !== 'string') return null;
  const ability = ABILITIES_BY_OATH[oathId]?.find(a => a.id === id);
  const tuning = KITS[oathId]?.[cls]?.[slot - 1];
  if (!ability || !tuning) return null;
  const ultimate = slot === 5;
  return {
    ...ability, slot: slot - 1, mana: tuning.mana, cooldown: tuning.cooldown,
    damage: ability.shape === 'self' ? 0 : Math.round((ultimate ? 95 : [32, 40, 52, 64][slot - 1]) * (ability.shape === 'zone' ? 0.85 : 1)),
    castTime: ultimate ? 0.9 : ability.shape === 'zone' ? 0.45 : 0.25,
  };
}

/**
 * Full 6-slot hotbar for an oath + class: slot 0 = basic attack, 1..4 = abilities, 5 = ultimate.
 * Each entry merges catalog data (name, shape, radius, accent, glyph) with kit tuning
 * (cooldown, mana, damage, castTime).
 */
export function hotbarFor(oathId, cls, selectedIds) {
  const kit = KITS[oathId]?.[cls] ?? [];
  const c = CLASSES[cls];
  const basic = {
    id: BASIC_ATTACK[cls], name: cls === 'ninja' ? 'Strike' : 'Bolt', shape: cls === 'ninja' ? 'melee' : 'projectile',
    range: c.basicRange, radius: cls === 'ninja' ? 1.6 : 0.6, cooldown: c.basicCooldown, mana: 0,
    damage: c.basicDamage, castTime: 0, slot: -1, kind: 'basic', element: null,
  };
  const defaults = kit.map((k) => ({ ...ABILITY_BY_ID[k.id], ...k }));
  if (selectedIds === undefined) return [basic, ...defaults];
  if (!Array.isArray(selectedIds) || selectedIds.length !== 5 || new Set(selectedIds).size !== 5) {
    throw new RangeError('Loadout must contain five unique abilities');
  }
  const allowed = new Set((ABILITIES_BY_OATH[oathId] ?? []).map(a => a.id));
  if (selectedIds.some(id => !allowed.has(id))) throw new RangeError('Ability does not belong to this oath');
  return [basic, ...selectedIds.map((id, i) => equippedAbilityForSlot(oathId, cls, i + 1, id))];
}
