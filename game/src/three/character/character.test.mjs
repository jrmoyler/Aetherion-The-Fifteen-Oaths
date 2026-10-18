import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROFILES } from './profiles.js';
import { buildHead } from './head.js';
import { buildGroom } from './hair.js';
import { buildGear } from './gear.js';

const manifest = JSON.parse(readFileSync(new URL('../../../public/assets/characters/manifest.json', import.meta.url)));
const finite = (g) => g.attributes.position.array.every(Number.isFinite);

test('every shipped hero has a face/hair/gear profile', () => {
  for (const { id } of manifest) assert.ok(PROFILES[id], `missing profile ${id}`);
});

test('every hero builds a finite head, groom and gear kit on each tier', () => {
  for (const [id, profile] of Object.entries(PROFILES)) for (const tier of ['low', 'high']) {
    const head = buildHead(profile, .23, tier);
    assert.ok(finite(head.skinGeo) && head.skinGeo.attributes.position.count > 2000, `${id} skin`);
    assert.equal(head.eyes.length, 2);
    const groom = buildGroom(id, profile, head.P, head.lash, tier);
    if (profile.hair?.style !== 'none') { assert.ok(groom.cap && finite(groom.cap), `${id} cap`); assert.ok(groom.cards && finite(groom.cards), `${id} cards`); }
    if (profile.beard) assert.ok(groom.beard?.index?.count > 0, `${id} beard`);
    else assert.equal(groom.beard, null, `${id} no phantom beard`);
    assert.ok(finite(groom.brows));
    const gear = buildGear(profile, head.P, .23, tier);
    assert.equal(gear.filter(p => p.geo).length > 0, (profile.gear ?? []).length > 0, `${id} gear`);
    for (const part of gear) if (part.geo) assert.ok(finite(part.geo) && part.geo.index?.count !== 0, `${id} ${part.type}`);
  }
});

test('low tier keeps head and groom cheaper than high', () => {
  const p = PROFILES['oath-11-ninja'];
  const lo = buildHead(p, .23, 'low'), hi = buildHead(p, .23, 'high');
  assert.ok(lo.skinGeo.attributes.position.count < hi.skinGeo.attributes.position.count / 2);
  const glo = buildGroom('k', p, lo.P, lo.lash, 'low'), ghi = buildGroom('k', p, hi.P, hi.lash, 'high');
  assert.ok(glo.cards.attributes.position.count < ghi.cards.attributes.position.count);
});


test('Rime sorcerer beard is a distinct geometry from hair concealed by a hood', () => {
  const id = 'oath-02-sorcerer', profile = PROFILES[id];
  const head = buildHead(profile, .23, 'high');
  const groom = buildGroom(id, profile, head.P, head.lash, 'high');
  assert.ok(groom.cards && groom.beard, 'separate scalp and beard surfaces');
  assert.notEqual(groom.cards, groom.beard);
  assert.ok(groom.beard.index.count > 0);
  assert.ok(groom.cards.index.count > 0);
});
