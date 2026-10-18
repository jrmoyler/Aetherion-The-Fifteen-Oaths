import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PALETTES } from '../game/src/vfx/palettes.generated.js';
import { ABILITY_BY_ID } from '../shared/abilities.js';
import { generatePalettes, renderPalettes } from '../tools/generate-ability-palettes.mjs';

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
const registry = read('../CASTABLE_REGISTRY.json');
const supplement = read('../shared/ability-supplement.json');

test('every playable castable has source-authored colors, including all 50 supplements', () => {
  assert.equal(Object.keys(PALETTES).length, 150);
  assert.deepEqual(Object.keys(PALETTES).sort(), Object.keys(ABILITY_BY_ID).sort());
  for (const entry of [...registry.castables, ...supplement.castables]) {
    const palette = PALETTES[entry.sourceCatalog.uid];
    assert.ok(palette.c.length > 0 && palette.c.length <= 8);
    for (const color of palette.c) assert.ok(Object.values(entry.sourcePreset.settings).includes(color));
  }
  assert.deepEqual(PALETTES['codex/secondself'].c.slice(0, 4), ['#ffd9a0', '#fff3d6', '#ffc65c', '#fff0c0']);
});

test('palette generation is reproducible and expansion preserves original visuals', () => {
  assert.equal(renderPalettes(registry, supplement), fs.readFileSync(new URL('../game/src/vfx/palettes.generated.js', import.meta.url), 'utf8'));
  for (const [id, palette] of Object.entries(generatePalettes(registry))) assert.deepEqual(PALETTES[id], palette);
  assert.deepEqual(PALETTES['linear/ice'], { c: ['#3e737a', '#8adaff', '#f2feff', '#638797', '#f0f9ff', '#79b6dd', '#5fd0ff', '#cdefff'], l: 3.6, s: 26 });
});

test('source identity and nonfinite effect timing cannot contaminate renderer settings', () => {
  for (const mutate of [
    source => { source.castables[0].sourcePreset.uid = 'incorrect/id'; },
    source => { source.castables[0].sourcePreset.settings.lifetime = Infinity; },
    source => { source.castables[0].sourcePreset.settings.speed = -1; },
    source => { source.sourceCommit = 'main'; },
    source => { source.castables.push(source.castables[0]); },
  ]) {
    const source = structuredClone(supplement); mutate(source);
    assert.throws(() => generatePalettes(registry, source));
  }
});
