import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
registerHooks({ resolve(specifier, context, nextResolve) { if (specifier.startsWith('@shared/')) return nextResolve(new URL(`../../../shared/${specifier.slice(8)}`, import.meta.url).href, context); return nextResolve(specifier, context); } });
const { ABILITIES_BY_OATH } = await import('../../../shared/abilities.js');
const { ABILITY_TILES, abilityIcon, equipmentTile } = await import('./painted-icons.js');
test('every castable has a distinct stable atlas coordinate within its elemental row', () => {
  const cells = new Set();
  for (const [oath, abilities] of Object.entries(ABILITIES_BY_OATH)) {
    for (const a of abilities) {
      const tile = ABILITY_TILES[a.id];
      assert.equal(tile.row, Number(oath.slice(-2)) - 1);
      assert.ok(tile.col >= 0 && tile.col < 10);
      const key = `${tile.row}:${tile.col}`; assert.ok(!cells.has(key)); cells.add(key);
      assert.ok(abilityIcon(a).includes('ability-atlas.webp'));
    }
  }
  assert.equal(cells.size,150);
  for (const filename of ['ability-atlas.webp','equipment-atlas.webp']) assert.ok(existsSync(new URL(`../../public/ui/${filename}`, import.meta.url)));
});
test('equipment art distinguishes consumables and common armor/weapon categories', () => {
  assert.notEqual(equipmentTile('Health potion'),equipmentTile('Mana potion'));
  assert.notEqual(equipmentTile('Iron boots'),equipmentTile('Iron helm'));
  assert.notEqual(equipmentTile('Staff'),equipmentTile('Sword'));
  assert.ok(!abilityIcon({id:'basic/ninja',name:'Strike'}).includes('<svg'));
});
