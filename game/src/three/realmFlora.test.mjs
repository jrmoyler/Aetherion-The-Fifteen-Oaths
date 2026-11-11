import test from 'node:test';
import assert from 'node:assert/strict';

// The extracted generator paints its bark textures on import; give it a canvas that accepts the calls.
const context = new Proxy({}, { get: (_, key) => key === 'createImageData' || key === 'getImageData' ? (...args) => ({ data: new Uint8ClampedArray(args.at(-2) * args.at(-1) * 4) }) : () => context, set: () => true });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };

const flora = await import('./biome-flora.generated.js');
const { BIOME_WORLDS, BIOME_WORLDS_COMMIT } = await import('./biome-worlds.generated.js');
const { REALM_SPECIES } = await import('./realmFlora.js');
const { REALM_WORLD, realmAir } = await import('./realmAir.js');
const { BIOMES } = await import('../../../shared/terrain.js');

test('every species lifted from Biome Triad is defined and grows a tree', () => {
  assert.match(flora.BIOME_FLORA_COMMIT, /^[0-9a-f]{40}$/);
  assert.equal(flora.BIOME_FLORA_COMMIT, BIOME_WORLDS_COMMIT);
  assert.deepEqual(flora.SKIPPED, {}, 'no species definition was skipped');
  assert.equal(Object.keys(flora.SPECIES_DEF).length, 36);
  flora.setCardDensity(.3);
  for (const [key, def] of Object.entries(flora.SPECIES_DEF)) {
    const tree = def.build ? def.build() : flora.genTree(def.tree, def.seed);
    assert.ok(tree.wood.attributes.position.count > 100 && tree.leaf.attributes.position.count > 100, `${key} has wood and leaves`);
    assert.ok(tree.H > 2 && tree.H < 80 && tree.S > 1, `${key} has a sane size (${tree.H.toFixed(1)} m)`);
    assert.equal(typeof def.leaves, 'function', `${key} names its leaf atlas`);
  }
});

test('all fifteen realms grow Biome Triad species and breathe a Biome Triad world', () => {
  assert.equal(Object.keys(BIOME_WORLDS).length, 17);
  for (const biome of Object.keys(BIOMES)) {
    const list = REALM_SPECIES[biome];
    assert.ok(list?.length >= 2, `${biome} has at least two species`);
    for (const [key, share, height] of list) {
      assert.ok(flora.SPECIES_DEF[key], `${biome}: ${key} exists`);
      assert.ok(share > 0 && height >= 3 && height <= 22, `${biome}: ${key} share and play height`);
    }
    assert.ok(BIOME_WORLDS[REALM_WORLD[biome]], `${biome} maps to a world`);
    const air = realmAir(biome);
    assert.ok(air.tint.every((value) => value > .5 && value <= 1) && air.density >= .75 && air.density <= 1.9, `${biome} air is in range`);
  }
  assert.ok(realmAir('marsh').density > realmAir('coast').density, 'the marsh is foggier than the coast');
  assert.deepEqual(realmAir('nowhere'), { tint: [1, 1, 1], density: 1, world: null });
});
