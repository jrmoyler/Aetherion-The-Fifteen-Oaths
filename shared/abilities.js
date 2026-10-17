import { ABILITIES_BY_OATH, KITS } from './abilities.generated.js';
import { CLASSES } from './oaths.js';

export { ABILITIES_BY_OATH, KITS };

/** Flat ability lookup by uid (e.g. "codex/riptide"). */
export const ABILITY_BY_ID = Object.fromEntries(
  Object.values(ABILITIES_BY_OATH).flat().map((a) => [a.id, a]),
);

/** Basic attack pseudo-ability id per class. */
export const BASIC_ATTACK = { ninja: 'basic/ninja', sorcerer: 'basic/sorcerer' };

/**
 * Full 6-slot hotbar for an oath + class: slot 0 = basic attack, 1..4 = abilities, 5 = ultimate.
 * Each entry merges catalog data (name, shape, radius, accent, glyph) with kit tuning
 * (cooldown, mana, damage, castTime).
 */
export function hotbarFor(oathId, cls) {
  const kit = KITS[oathId]?.[cls] ?? [];
  const c = CLASSES[cls];
  const basic = {
    id: BASIC_ATTACK[cls], name: cls === 'ninja' ? 'Strike' : 'Bolt', shape: cls === 'ninja' ? 'melee' : 'projectile',
    range: c.basicRange, radius: cls === 'ninja' ? 1.6 : 0.6, cooldown: c.basicCooldown, mana: 0,
    damage: c.basicDamage, castTime: 0, slot: -1, kind: 'basic', element: null,
  };
  return [basic, ...kit.map((k) => ({ ...ABILITY_BY_ID[k.id], ...k }))];
}
