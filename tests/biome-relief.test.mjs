import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES, SANCTUARY_HEIGHT, heightAt, sampleTerrain, WORLD_HALF } from '../shared/terrain.js';
import { OATHS } from '../shared/oaths.js';
import { BIOME_RELIEF, BIOME_RELIEF_CELLS, BIOME_RELIEF_SPAN, BIOME_RELIEF_COMMIT } from '../shared/biome-relief.generated.js';

test('every realm biome carries a baked Biome Triad relief grid of the declared size', () => {
  assert.match(BIOME_RELIEF_COMMIT, /^[0-9a-f]{40}$/);
  assert.ok(BIOME_RELIEF_SPAN >= 1600 && BIOME_RELIEF_CELLS >= 96);
  for (const biome of Object.keys(BIOMES)) {
    const entry = BIOME_RELIEF[biome];
    assert.ok(entry, `${biome} has relief`);
    assert.equal(Buffer.from(entry.data, 'base64').length, BIOME_RELIEF_CELLS * BIOME_RELIEF_CELLS * 2, `${biome} grid size`);
    assert.ok(entry.reach >= BIOMES[biome].amp, `${biome}: source relief is never exaggerated`);
    const cells = new Int16Array(new Uint8Array(Buffer.from(entry.data, 'base64')).buffer);
    let low = Infinity, high = -Infinity; for (const value of cells) { low = Math.min(low, value); high = Math.max(high, value); }
    assert.ok(low >= -1.55 * 8192 && high <= 1.95 * 8192, `${biome} relief stays in its eased range`);
  }
});

test('the simulation world keeps its guarantees on the imported terrain', () => {
  for (const oath of OATHS) {
    const [x, z] = oath.center;
    // The sanctuary plaza is still exactly flat at its fixed height.
    for (const [dx, dz] of [[0, 0], [30, -20], [-45, 40]]) assert.equal(heightAt(x + dx, z + dz), SANCTUARY_HEIGHT[oath.id], `${oath.id} plaza`);
    // Landforms are continuous: no step larger than a steep cliff between neighbouring metres.
    for (let i = 0; i < 400; i++) {
      const px = x + ((i * 7919) % 1500) - 750, pz = z + ((i * 104729) % 1500) - 750;
      if (Math.abs(px) > WORLD_HALF || Math.abs(pz) > WORLD_HALF) continue;
      const here = heightAt(px, pz);
      assert.ok(Number.isFinite(here) && here > -60 && here < 520, `${oath.id} height ${here}`);
      // Sea stacks and coastal cliffs are sheer by design; inland the ground never tears.
      if (sampleTerrain(px, pz, {}).coast > 40) assert.ok(Math.abs(heightAt(px + 1, pz) - here) < 9, `${oath.id} has no tear at ${px},${pz}`);
    }
  }
  assert.equal(heightAt(123.4, -567.8), heightAt(123.4, -567.8), 'deterministic');
  const out = {}; sampleTerrain(0, 0, out); assert.ok('road' in out && 'plaza' in out && 'coast' in out);
});

test('terrain sampling stays fast enough for the simulation', () => {
  const start = process.hrtime.bigint(); let sum = 0;
  for (let i = 0; i < 100000; i++) sum += heightAt((i * 37) % 5000 - 2500, (i * 91) % 5000 - 2500);
  const micros = Number(process.hrtime.bigint() - start) / 1e5 / 1000;
  assert.ok(Number.isFinite(sum) && micros < 10, `${micros.toFixed(2)} microseconds per sample`);
});
