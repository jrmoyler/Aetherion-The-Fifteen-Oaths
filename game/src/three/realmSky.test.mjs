import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { BIOME_SKY, BIOME_SKY_COMMIT, BIOME_CLOUD_DEFAULT, BIOME_CLOUD_STEPS, createBiomeSky } = await import('./biome-sky.generated.js');
const { BIOME_WORLDS, BIOME_WORLDS_COMMIT } = await import('./biome-worlds.generated.js');
const { realmSky, weatherInputs, initRealmSky, CLOUD_STEPS } = await import('./realmSky.js');
const { REALM_WORLD } = await import('./realmAir.js');
const { BIOMES } = await import('../../../shared/terrain.js');
const generated = readFileSync(new URL('./biome-sky.generated.js', import.meta.url), 'utf8');

test('the sky extract is stamped with the same Biome Triad commit as the worlds and covers all of them', () => {
  assert.match(BIOME_SKY_COMMIT, /^[0-9a-f]{40}$/);
  assert.equal(BIOME_SKY_COMMIT, BIOME_WORLDS_COMMIT);
  assert.deepEqual(Object.keys(BIOME_SKY).sort(), Object.keys(BIOME_WORLDS).sort());
  for (const [id, world] of Object.entries(BIOME_SKY)) {
    for (const key of ['cover', 'base', 'top', 'cirrus']) assert.ok(Number.isFinite(world.clouds[key]), `${id} clouds.${key}`);
    for (const key of ['turbidity', 'rayleigh', 'mie', 'mieG']) assert.ok(Number.isFinite(world.sky[key]), `${id} sky.${key}`);
    assert.equal(world.precip?.kind ?? 'none', BIOME_WORLDS[id].precip, `${id} precip kind matches the flora extract`);
  }
  assert.deepEqual(BIOME_CLOUD_STEPS, { fast: 18, balanced: 28, ultra: 40 });
  assert.deepEqual(Object.keys(BIOME_CLOUD_DEFAULT).sort(), ['base', 'cirrus', 'cover', 'dark', 'top']);
});

test('the copied engine code is present: cloud march, cirrus, stars, flakes, aurora and the frame update', () => {
  for (const needle of ['float dens(vec3 p, bool full)', 'uCirrus * smoothstep(0.02, 0.18, rd.y)', 'const stars = (() =>', 'const flakes = (() =>', 'function auroraMesh(){',
    'CL.uCover.value = clamp(cloudState.cover + rainK*0.5, 0, 1)', 'CL.uDark.value = Math.max(rainK, cloudState.dark)', 'u.turbidity.value = lerp(sp.turbidity, 18, rainK)']) {
    assert.ok(generated.includes(needle), `generated module contains: ${needle}`);
  }
  assert.equal(typeof createBiomeSky, 'function');
});

test('every realm resolves to the cloud, sky and precipitation settings of a Biome Triad world', () => {
  const biomes = Object.keys(BIOMES);
  assert.equal(biomes.length, 15);
  for (const biome of biomes) {
    const s = realmSky(biome);
    assert.ok(s, `${biome} has a sky`);
    assert.equal(s.world, REALM_WORLD[biome]);
    assert.ok(s.clouds.cover > 0 && s.clouds.cover <= 1 && s.clouds.cirrus >= 0 && s.clouds.cirrus <= 1 && s.clouds.dark >= 0 && s.clouds.dark <= 1, `${biome} cloud amounts`);
    assert.ok(s.clouds.base >= 600 && s.clouds.top - s.clouds.base >= 500, `${biome} deck sits above Aetherion's terrain (${s.clouds.base} to ${s.clouds.top} m)`);
    assert.ok(s.sky.turbidity >= 2 && s.sky.turbidity <= 18 && s.sky.rayleigh > 0 && s.sky.mie > 0 && s.sky.mieG > .5 && s.sky.mieG < 1, `${biome} Preetham parameters`);
    assert.equal(s.ground.length, 3);
    if (biome !== 'crimson') assert.deepEqual({ ...BIOME_CLOUD_DEFAULT, ...BIOME_SKY[s.world].clouds }, s.clouds, `${biome} uses its world's numbers as declared`);
  }
  // Haven's cloud sea lies below its islands; over the crimson realm the same slab is raised overhead.
  const haven = BIOME_SKY.haven.clouds, crimson = realmSky('crimson').clouds;
  assert.ok(haven.top < 0);
  assert.equal(crimson.top - crimson.base, haven.top - haven.base);
  assert.equal(crimson.cover, haven.cover);
  assert.equal(realmSky('nowhere'), null);
});

test('each realm gets its world\'s precipitation kind', () => {
  const kind = (biome) => realmSky(biome).precip?.kind ?? 'none';
  assert.equal(kind('glacial'), 'snow'); assert.equal(kind('highland'), 'snow'); assert.equal(kind('volcanic'), 'ash');
  assert.equal(kind('canyon'), 'dust'); assert.equal(kind('crimson'), 'motes'); assert.equal(kind('meadow'), 'none');
  assert.equal(realmSky('crimson').precip.additive, true);
});

test('Aetherion weather maps onto the source rain and fog factors', () => {
  const forest = realmSky('forest'), glacial = realmSky('glacial'), alpine = realmSky('alpine'), volcanic = realmSky('volcanic');
  assert.deepEqual(weatherInputs('clear', 0, forest), { rainK: 0, fogK: 1, precip: null });
  assert.equal(weatherInputs('storm', 1, forest).rainK, 1);
  assert.ok(weatherInputs('storm', .5, forest).rainK < weatherInputs('storm', 1, forest).rainK, 'a stronger storm is fuller and darker');
  assert.ok(weatherInputs('rain', 1, forest).rainK < 1 && weatherInputs('rain', 1, forest).precip.lightning === false);
  assert.ok(weatherInputs('mist', .4, forest).fogK > 1 && weatherInputs('mist', .4, forest).rainK === 0);
  const snow = weatherInputs('snow', .65, glacial);
  assert.equal(snow.precip.kind, 'snow'); assert.equal(snow.precip.fall, BIOME_SKY.arctic.precip.fall); assert.equal(snow.precip.rainLines, false);
  // The alpine header declares no standing snowfall; the world's own P_SNOW is what falls when Aetherion says snow.
  assert.deepEqual({ ...weatherInputs('snow', .2, alpine).precip, rainLines: false }, { ...BIOME_SKY.alpine.variants.P_SNOW, rainLines: false });
  assert.equal(weatherInputs('ash', .35, volcanic).precip.kind, 'ash');
  assert.equal(weatherInputs('ash', .35, forest).precip.color, BIOME_SKY.volcano.precip.color);
  for (const k of ['storm', 'rain', 'snow', 'ash', 'fog', 'mist', 'clear', 'bogus']) { const w = weatherInputs(k, 2, forest); assert.ok(w.rainK >= 0 && w.rainK <= 1 && w.fogK >= 1 && w.fogK <= 4); }
});

test('quality tiers use the source march presets and nothing is built without a document', () => {
  assert.deepEqual({ ...CLOUD_STEPS }, { low: 18, medium: 28, high: 40, ultra: 40 });
  if (typeof document === 'undefined') assert.equal(initRealmSky({ scene: {}, camera: {}, render: {} }, {}), null);
});
