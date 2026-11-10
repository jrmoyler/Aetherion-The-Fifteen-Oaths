import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ABILITIES_BY_OATH, hotbarFor } from '../shared/abilities.js';
import { abilityForSlot, restoreLoadout } from '../shared/sim/loadout.js';
import { SECONDARY_ELEMENT_OATH } from '../tools/generate-mmo-abilities.mjs';

test('catalog covers 279 unique castables: 230 codex casts (ten per element) and 49 Matrix Expansion casts', () => {
  const all = Object.values(ABILITIES_BY_OATH).flat();
  assert.equal(all.length, 279);
  assert.equal(new Set(all.map(a => a.id)).size, 279);
  const paired = new Set(Object.values(SECONDARY_ELEMENT_OATH));
  assert.equal(paired.size, 8);
  for (const [oath, list] of Object.entries(ABILITIES_BY_OATH)) {
    const core = list.filter(a => !a.id.startsWith('matrix-expansion/'));
    assert.equal(core.length, paired.has(oath) ? 20 : 10, oath);
    // Every element of the current matrix has at least two expansion casts.
    assert.ok(list.length - core.length >= (paired.has(oath) ? 4 : 2), oath);
    // Gameplay element is always the Oath's own force; the school is one of at most two.
    assert.equal(new Set(list.map(a => a.element)).size, 1, oath);
    assert.equal(new Set(list.map(a => a.school)).size, paired.has(oath) ? 2 : 1, oath);
  }
  const supplement = JSON.parse(fs.readFileSync(new URL('../shared/ability-supplement.json', import.meta.url)));
  assert.equal(supplement.castables.length, 179);
  for (const c of supplement.castables) assert.ok(all.some(a => a.id === c.sourceCatalog.uid));
});

test('every selectable ability has matching client and authoritative slot tuning', () => {
  for (const [oath, list] of Object.entries(ABILITIES_BY_OATH)) for (const cls of ['ninja','sorcerer']) {
    for (const ability of list) {
      const ids = [ability.id, ...list.filter(a => a.id !== ability.id).slice(0,4).map(a => a.id)];
      const bar = hotbarFor(oath, cls, ids);
      assert.deepEqual(bar[1], abilityForSlot(oath, cls, 1, ability.id));
      assert.equal(bar.length, 6);
    }
  }
});

test('loadouts reject duplicate and cross-oath identifiers', () => {
  const list = ABILITIES_BY_OATH['oath-01'];
  assert.throws(() => hotbarFor('oath-01','ninja',Array(5).fill(list[0].id)), RangeError);
  const ids = list.slice(0,5).map(a => a.id);
  ids[0] = ABILITIES_BY_OATH['oath-02'][0].id;
  assert.throws(() => hotbarFor('oath-01','ninja',ids), RangeError);
});

test('offensive spells replacing self buffs deal damage; default restoration is unchanged', () => {
  let swaps = 0;
  for (const [oath, list] of Object.entries(ABILITIES_BY_OATH)) for (const cls of ['ninja','sorcerer']) {
    const defaults = hotbarFor(oath, cls);
    assert.deepEqual(restoreLoadout(oath, cls, defaults.slice(1).map(a => a.id)), defaults);
    for (let slot = 1; slot <= 5; slot++) if (defaults[slot].shape === 'self') {
      const offensive = list.find(a => a.shape === 'line' || a.shape === 'zone');
      const equipped = abilityForSlot(oath, cls, slot, offensive.id);
      assert.ok(equipped.damage > 0);
      assert.equal(equipped.mana, defaults[slot].mana);
      assert.equal(equipped.cooldown, defaults[slot].cooldown);
      swaps++;
    }
  }
  assert.ok(swaps > 0);
});
