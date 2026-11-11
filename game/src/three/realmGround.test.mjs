import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) { if (specifier.startsWith('@shared/')) return nextResolve(new URL(`../../../shared/${specifier.slice(8)}`, import.meta.url).href, context); return nextResolve(specifier, context); } });
const THREE = await import('three');
const { OATHS, regionAt } = await import('@shared/oaths.js');
const { sampleTerrain, normalAt, BIOMES } = await import('@shared/terrain.js');
const { WORLD_GROUND, RELIEF_WINDOW, BIOME_GROUND_COMMIT, SURF_GLSL, NOISE2D } = await import('./biome-ground.generated.js');
const { BIOME_RELIEF, BIOME_RELIEF_COMMIT } = await import('@shared/biome-relief.generated.js');
const { REALM_WORLD } = await import('./realmAir.js');
const { REALM_ORDER, realmGround, realmWaterLook, paintGround, realmTerrainMaterial, createRealmWater } = await import('./realmGround.js');

test('the generated ground comes from the same Biome Triad commit as the relief it is laid over', () => {
  assert.match(BIOME_GROUND_COMMIT, /^[0-9a-f]{40}$/);
  assert.equal(BIOME_GROUND_COMMIT, BIOME_RELIEF_COMMIT);
});

test('every realm resolves to a world detail set', () => {
  assert.deepEqual([...REALM_ORDER].sort(), Object.keys(BIOMES).sort());
  for (const oath of OATHS) {
    const ground = realmGround(oath.biome);
    assert.ok(ground, `${oath.biome} has ground`);
    assert.equal(ground.world, REALM_WORLD[oath.biome]);
    const source = WORLD_GROUND[ground.world];
    assert.ok(source.detail && Array.isArray(source.detail.rock) && source.detail.rock.length === 3, `${ground.world} names its bedrock`);
    for (const key of ['rockLo', 'bump', 'ripple', 'wet', 'foam', 'caustic', 'rows', 'grain', 'snow', 'glow', 'strata']) assert.equal(typeof ground.detail[key], 'number', `${oath.biome}.${key}`);
    assert.equal(ground.detail.band.length, 2); assert.equal(ground.detail.glowCol.length, 3);
    assert.ok(realmWaterLook(oath.biome)?.color > 0, `${oath.biome} has a water look`);
  }
  // The looks the brief names: ripples on the badlands sand, lava glow in the volcanic realm, snow glints in the cold realms, shore foam on the coast.
  assert.ok(realmGround('badlands').detail.ripple > 1);
  assert.ok(realmGround('volcanic').detail.glow > 0);
  for (const biome of ['glacial', 'alpine', 'highland']) assert.equal(realmGround(biome).detail.snow, 1);
  assert.ok(realmGround('coast').detail.foam > 0 && realmGround('coast').detail.caustic > 0);
});

test('relief windows match the worlds the relief was baked from', () => {
  for (const [biome, window] of Object.entries(RELIEF_WINDOW)) { assert.equal(window[0], BIOME_RELIEF[biome].world, biome); assert.equal(window[3], BIOME_RELIEF[biome].span, biome); }
});

test('each world colours its realm against Aetherion heights', () => {
  const colour = new THREE.Color(), out = {};
  for (const oath of OATHS) {
    const ground = realmGround(oath.biome), seen = new Set(); let painted = 0, total = 0;
    for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) {
      const x = oath.center[0] + i * 70, z = oath.center[1] + j * 70, region = regionAt(x, z);
      if (region.biome !== oath.biome) continue;
      const s = sampleTerrain(x, z, {}); colour.setRGB(-1, -1, -1);
      paintGround(colour, region, x, z, s.h, normalAt(x, z, 2.5)[1], s.lava, out);
      total++; assert.equal(out.index, REALM_ORDER.indexOf(oath.biome));
      assert.ok(out.kind >= 0 && out.kind <= 3, `${oath.biome} kind ${out.kind}`);
      if (!out.painted) continue;
      painted++; seen.add(colour.getHexString());
      assert.ok(colour.r >= 0 && colour.r <= 1 && colour.g >= 0 && colour.g <= 1 && colour.b >= 0 && colour.b <= 1, `${oath.biome} colour in range`);
    }
    assert.ok(total > 40, `${oath.biome} sampled`);
    if (ground.painted) { assert.equal(painted, total, `${oath.biome}: ${ground.world} colour function ran everywhere`); assert.ok(seen.size > 8, `${oath.biome} ground varies (${seen.size})`); }
    else assert.equal(painted, 0);
  }
  assert.equal(realmGround('crimson').painted, false, 'Haven has no terrain colour function; the crimson realm keeps its own colour');
  assert.equal(OATHS.filter((oath) => realmGround(oath.biome).painted).length, 14);
});

test('the terrain shader is the copied one, with per-realm settings, masks and the surface layer wired in', () => {
  for (const quality of ['low', 'high']) {
    const material = realmTerrainMaterial(quality), shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    material.onBeforeCompile(shader);
    assert.ok(shader.fragmentShader.includes(NOISE2D));
    assert.ok(!shader.fragmentShader.includes(SURF_GLSL) && shader.fragmentShader.includes('uSurfaceMap'), 'reads Aetherion\'s surface state');
    assert.ok(shader.fragmentShader.includes('#define uRock uBtRock[') && shader.fragmentShader.indexOf('uniform vec4 uRock, uTD;') < shader.fragmentShader.indexOf('#define uRock'));
    assert.equal(shader.fragmentShader.includes('tbump(q0'), quality !== 'low', 'detail normals are dropped on low only');
    assert.ok(shader.fragmentShader.includes('vGroundMask.z') && shader.vertexShader.includes('attribute vec3 terrainMask'));
    assert.equal(shader.uniforms.uBtRock.value.length, REALM_ORDER.length);
    assert.ok(shader.uniforms.uSurfaceMap && shader.uniforms.uT);
    material.dispose();
  }
});

test('water is built without a canvas and follows the realm', () => {
  const scene = new THREE.Scene(), water = createRealmWater({ scene, quality: { name: 'medium' } });
  assert.equal(scene.children.length, 1); assert.equal(water.sea.mirror, null);
  for (let i = 0; i < 200; i++) water.update(.1, 'marsh', { x: 0, z: 0 });
  assert.equal(water.stats().look.color, new THREE.Color(realmWaterLook('marsh').color).getHexString());
  water.dispose(); assert.equal(scene.children.length, 0);
});
