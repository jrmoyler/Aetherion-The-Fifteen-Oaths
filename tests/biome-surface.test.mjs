import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createBiomeSurfaceLayer, ELEMENTS, BASE_MATERIALS } from '../shared/biome-surface/index.mjs';
import { groundMaterialAt, climateAt, describeGround, BIOME_GROUND, BIOME_CLIMATE } from '../shared/biome-ground.js';
import { OATHS } from '../shared/oaths.js';
import { ABILITY_BY_ID } from '../shared/abilities.js';

test('surface layer is the pinned Biome Triad source, byte for byte', () => {
  const pin = JSON.parse(readFileSync(new URL('../shared/biome-surface/SOURCE.json', import.meta.url)));
  assert.match(pin.commit, /^[a-f0-9]{40}$/);
  assert.equal(Object.keys(pin.files).length, 5);
  for (const [name, hash] of Object.entries(pin.files)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../shared/biome-surface/${name}`, import.meta.url))).digest('hex'), hash, name);
  }
});

test('every realm has a known ground material and climate; every castable school is a surface element', () => {
  for (const oath of OATHS) {
    assert.ok(BASE_MATERIALS[BIOME_GROUND[oath.biome]], oath.biome);
    assert.ok(Number.isFinite(BIOME_CLIMATE[oath.biome].temperature), oath.biome);
    assert.ok(BASE_MATERIALS[groundMaterialAt(oath.center[0], oath.center[1])], oath.id);
    assert.equal(climateAt(oath.center[0], oath.center[1]), BIOME_CLIMATE[oath.biome]);
  }
  for (const ability of Object.values(ABILITY_BY_ID)) assert.ok(ELEMENTS.includes(ability.school), ability.id);
});

test('fire scorches meadow, water douses it, frost freezes wet ground, and the reading follows', () => {
  const meadow = OATHS.find((o) => o.biome === 'meadow'), x = meadow.center[0] + 400, z = meadow.center[1] + 60;
  const layer = createBiomeSurfaceLayer('aetherion', { materialAt: groundMaterialAt, cellSize: 3 });
  const step = (seconds, env) => { for (let i = 0; i < seconds * 30; i++) layer.update(1 / 30, env); };
  layer.impact({ element: 'fire', position: [x, 0, z], radius: 4, intensity: 1.2 });
  step(1, { temperature: 18, humidity: .5 });
  assert.ok(layer.sample(x, z).burn > .25);
  assert.equal(describeGround(layer.sample(x, z)), 'Burning ground');
  for (let i = 0; i < 4; i++) layer.impact({ element: 'water', position: [x, 0, z], radius: 6, intensity: 1.5 });
  step(2, { temperature: 18, humidity: .5 });
  const doused = layer.sample(x, z);
  assert.ok(doused.burn < .05 && doused.wetness > .45 && doused.scorch > 0);
  layer.impact({ element: 'frost', position: [x, 0, z], radius: 4, intensity: 1.5 });
  step(.5, { temperature: 18, humidity: .5 });
  assert.match(describeGround(layer.sample(x, z)), /Iced/);
  assert.equal(describeGround(layer.sample(x + 300, z)), '');
});
