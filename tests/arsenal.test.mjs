import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { ARSENAL_WEAPONS, ARSENAL_ARMOR, ARSENAL_COMMIT, CANON_ARMS, ARMOR_FAMILIES, canonWeapon, arsenalForGear, FAMILY_LABEL } from '../shared/arsenal.js';
import { OATHS } from '../shared/oaths.js';
import { makeGear } from '../shared/sim/items.js';
import { GEAR_SLOTS, RARITIES } from '../shared/sim/data.js';

const asset = (rel) => new URL(`../game/public/assets/arsenal/${rel}`, import.meta.url);
const rng = Object.assign(() => 0.5, { pick: (list) => list[0] });

test('all 75 forged weapons ship LOD 1 and 2 as real binary glTF, with a preview still', () => {
  assert.match(ARSENAL_COMMIT, /^[a-f0-9]{40}$/);
  assert.equal(Object.keys(ARSENAL_WEAPONS).length, 75);
  for (const [id, weapon] of Object.entries(ARSENAL_WEAPONS)) {
    assert.ok(FAMILY_LABEL[weapon.family], id);
    assert.ok(weapon.sockets.includes('grip.primary'), `${id} needs a grip socket to be carried`);
    for (const level of [1, 2]) {
      const bytes = readFileSync(asset(weapon.lods[level].path));
      assert.equal(bytes.toString('latin1', 0, 4), 'glTF', id);
      assert.equal(bytes.length, weapon.lods[level].bytes, id);
    }
    assert.ok(weapon.lods[2].triangles < weapon.lods[1].triangles, id);
    assert.ok(statSync(asset(weapon.preview)).size > 500, id);
  }
});

test('every Oath discipline maps to forged weapons that exist; armor covers each gear slot at five tiers', () => {
  for (const oath of OATHS) for (const cls of ['ninja', 'sorcerer']) {
    const list = CANON_ARMS[oath.id][cls];
    assert.ok(list.length >= 2, `${oath.id} ${cls} needs a rarer variant`);
    for (const key of list) assert.ok(ARSENAL_WEAPONS[`arsenal:${key}`], key);
    assert.equal(canonWeapon(oath.id, cls), `arsenal:${list[0]}`);
  }
  assert.equal(Object.keys(ARSENAL_ARMOR).length, 60);
  for (const families of Object.values(ARMOR_FAMILIES)) for (const family of families) for (let tier = 1; tier <= 5; tier++) {
    const entry = ARSENAL_ARMOR[`arsenal:armor/${family}/0${tier}`];
    assert.ok(entry && existsSync(asset(entry.preview)), `${family} ${tier}`);
  }
});

test('generated gear always resolves to a forged piece; the look is stable and rarer weapons vary', () => {
  for (const oath of OATHS) for (const cls of ['ninja', 'sorcerer']) for (const slot of GEAR_SLOTS) for (const rarity of RARITIES) {
    const item = makeGear(rng, { oath: oath.id, cls, lvl: 5, slot, rarity: rarity.id });
    assert.ok(ARSENAL_WEAPONS[item.arsenal] || ARSENAL_ARMOR[item.arsenal], `${item.name} -> ${item.arsenal}`);
    assert.equal(arsenalForGear({ slot, oath: oath.id, cls, rarity: rarity.id, seed: item.id, name: item.name }), item.arsenal);
    if (slot === 'weapon' && rarity.id === 'common') assert.equal(item.arsenal, canonWeapon(oath.id, cls));
    if (slot === 'weapon' && rarity.id === 'epic') assert.notEqual(item.arsenal, canonWeapon(oath.id, cls));
  }
});
