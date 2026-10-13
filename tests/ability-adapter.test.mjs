import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAbilityMatrixAdapter } from '../src/abilities/AbilityMatrixAdapter.js';
const catalog = JSON.parse(readFileSync(new URL('../runtime/ability-matrix/presets/catalog.json', import.meta.url)));
const entries = catalog.abilities.filter((a) => a.status === 'live' && ['ability', 'buff', 'summon'].includes(a.kind));
const result = Symbol('source result');
function setup() {
  const calls = [];
  const bridge = Object.fromEntries(['cast','runAction','select','preset','applyPreset','resetPreset','clear'].map((name) => [name, (...args) => { calls.push({ name, args }); return result; }]));
  bridge.loadPack = async (pack) => { calls.push({ name: 'loadPack', args: [pack] }); return {pack, ctx: {scene: {add() {}}, decals: {update(){},clear(){},dispose(){}}}}; };
  return { calls, bridge, adapter: createAbilityMatrixAdapter({ bridge, catalog }) };
}
// These tests verify adapter routing only. The bridge spy is not source runtime
// execution, GPU validation, or evidence that an ability deals damage.
for (const entry of entries) test(`adapter dispatch preserves ${entry.uid}`, async () => {
  const { adapter, calls } = setup();
  const options = { fraction: 0.61 };
  assert.equal(await adapter.cast(entry.uid, options), result);
  assert.deepEqual(calls.filter((call) => call.name !== 'loadPack'), entry.kind === 'buff' ? [{ name: 'runAction', args: [entry.pack, entry.action ?? entry.id] }] : [{ name: 'cast', args: [entry.uid, options] }]);
  assert.deepEqual(adapter.describe(entry.uid), entry);
  assert.equal(calls.filter((call) => call.name === 'loadPack').length, entry.pack === 'linear' ? 1 : 0);
});
test('catalog enumerates all 100 before lazy packs load; all 15 elements', () => {
  const { adapter } = setup();
  assert.equal(adapter.list().length, 100);
  assert.equal(new Set(adapter.list().map((a) => a.element)).size, 15);
  for (const element of catalog.elements) assert.equal(adapter.list({ element: element.id }).length, element.count);
  const copy = adapter.list(); copy[0].label = 'changed'; assert.notEqual(adapter.list()[0].label, 'changed');
  assert.equal(adapter.list({kind:'buff'}).length, 3);
  assert.equal(adapter.list({kind:'summon'}).length, 2);
});
test('unknown uid, archived effects and moves do not dispatch', async () => {
  const { adapter, calls } = setup();
  for (const uid of ['invented/ability', ...catalog.abilities.filter((a) => !entries.includes(a)).map((a) => a.uid)]) await assert.rejects(adapter.cast(uid), RangeError);
  assert.equal(calls.length, 0);
});
test('buff selection never pretends to be an aimed slot', async () => {
  const { adapter, calls } = setup();
  await assert.rejects(adapter.select('linear-ext/boost'), /non-slot/); assert.equal(calls.length, 0);
});
test('preset identity cannot accidentally overwrite another source castable', async () => {
  const { adapter, calls } = setup();
  await assert.rejects(adapter.applyPreset('linear/ice', {uid:'linear/thunder',settings:{}}), /uid/);
  await assert.rejects(adapter.applyPreset('linear/ice', {pack:'codex',settings:{}}), /pack/);
  await assert.rejects(adapter.applyPreset('linear/ice', {id:'thunder',settings:{}}), /id/);
  assert.equal(calls.length, 0);
  const patch = {uid:'linear/ice',pack:'linear',id:'ice',settings:{range:15}};
  assert.equal(await adapter.applyPreset('linear/ice',patch),result);
  assert.equal(calls[0].args[1],patch);
});
test('source errors and false results remain visible', async () => {
  const { bridge } = setup(); bridge.cast = async () => false;
  const adapter = createAbilityMatrixAdapter({ bridge, catalog });
  assert.equal(await adapter.cast('linear/ice'), false);
  bridge.cast = async () => { throw new Error('Source failed'); };
  await assert.rejects(adapter.cast('linear/ice'), /Source failed/);
});
