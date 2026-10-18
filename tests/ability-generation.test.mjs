import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateAbilities, renderAbilities } from '../tools/generate-mmo-abilities.mjs';

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
const registry = read('../CASTABLE_REGISTRY.json');
const supplement = read('../shared/ability-supplement.json');

test('shipped catalog is reproducible from both pinned sources', () => {
  assert.equal(renderAbilities(registry, supplement), fs.readFileSync(new URL('../shared/abilities.generated.js', import.meta.url), 'utf8'));
  const all = Object.values(generateAbilities(registry, supplement).abilities).flat();
  assert.equal(all.filter(a => a.sourceCommit === registry.sourceCommit).length, 100);
  assert.equal(all.filter(a => a.sourceCommit === supplement.sourceCommit).length, 50);
});

test('a preset cannot silently change identity or inject nonfinite combat geometry', () => {
  for (const mutate of [
    s => { s.castables[0].sourcePreset.uid = 'other/ability'; },
    s => { s.castables[0].sourceCatalog.range = Infinity; },
    s => { s.castables[0].sourcePreset.settings.radius = -1; },
    s => { s.castables[0].sourceCatalog.element = 'unknown'; },
    s => { s.sourceCommit = 'main'; },
    s => { s.castables.push(s.castables[0]); },
  ]) {
    const bad = structuredClone(supplement); mutate(bad);
    assert.throws(() => generateAbilities(registry, bad));
  }
});

test('source refresh preserves the established default kits', () => {
  const original = generateAbilities(registry, { ...supplement, castables: [] });
  const expanded = generateAbilities(registry, supplement);
  assert.deepEqual(expanded.kits, original.kits);
});
