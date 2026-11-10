import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
registerHooks({ resolve(specifier, context, nextResolve) { if (specifier.startsWith('@shared/')) return nextResolve(new URL(`../../../shared/${specifier.slice(8)}`, import.meta.url).href, context); return nextResolve(specifier, context); } });
const { ABILITIES_BY_OATH } = await import('../../../shared/abilities.js');
const { ABILITY_TILES, abilityIcon, equipmentTile } = await import('./painted-icons.js');
test('the 150 painted castables keep their atlas cell; newer castables draw their source glyph', () => {
  const cells = new Set(); let sigils = 0;
  for (const [oath, abilities] of Object.entries(ABILITIES_BY_OATH)) {
    for (const a of abilities) {
      const tile = ABILITY_TILES[a.id], html = abilityIcon(a);
      assert.ok(!html.includes('<svg'), 'no inline svg in the HUD');
      if (!tile) { assert.ok(a.glyph, a.id); assert.ok(html.includes('ae-sigil-icon') && html.includes('mask-image'), a.id); sigils++; continue; }
      assert.equal(tile.row, Number(oath.slice(-2)) - 1);
      assert.ok(tile.col >= 0 && tile.col < 10);
      const key = `${tile.row}:${tile.col}`; assert.ok(!cells.has(key)); cells.add(key);
      assert.ok(html.includes('ability-atlas.webp'));
    }
  }
  assert.equal(cells.size,150); assert.equal(sigils,129);
  for (const filename of ['ability-atlas.webp','equipment-atlas.webp']) assert.ok(existsSync(new URL(`../../public/ui/${filename}`, import.meta.url)));
});
test('equipment art distinguishes consumables and common armor/weapon categories', () => {
  assert.notEqual(equipmentTile('Health potion'),equipmentTile('Mana potion'));
  assert.notEqual(equipmentTile('Iron boots'),equipmentTile('Iron helm'));
  assert.notEqual(equipmentTile('Staff'),equipmentTile('Sword'));
  assert.ok(!abilityIcon({id:'basic/ninja',name:'Strike'}).includes('<svg'));
});
