import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) { if (specifier.startsWith('@shared/')) return nextResolve(new URL(`../../../shared/${specifier.slice(8)}`, import.meta.url).href, context); return nextResolve(specifier, context); } });

// Imported first, with no document and no canvas: the generated module must load as it is.
const BT = await import('./biome-creatures.generated.js');
const hadDocument = typeof document !== 'undefined';
const THREE = await import('three');
const { BIOMES, heightAt } = await import('../../../shared/terrain.js');
const { OATHS } = await import('../../../shared/oaths.js');
const { REALM_WORLD } = await import('./realmAir.js');
const { BIOME_WORLDS, BIOME_WORLDS_COMMIT } = await import('./biome-worlds.generated.js');
const { createRealmCreatures, REALM_LIFE, CREATURE_SETS, CREATURE_CAPS, POINT_CAPS, realmLifeCount, countAnimals, inCity, waterAt } = await import('./realmCreatures.js');

test('the generated creature module imports in Node and builds its animals', () => {
  assert.equal(hadDocument, false, 'no document was needed to import it');
  assert.match(BT.BIOME_CREATURES_COMMIT, /^[0-9a-f]{40}$/);
  assert.equal(BT.BIOME_CREATURES_COMMIT, BIOME_WORLDS_COMMIT, 'same Biome Triad commit as the flora and worlds');
  for (const name of ['gullGeo', 'fishGeo', 'whaleGeo', 'marshDragonflyGeo']) assert.ok(BT[name]().attributes.position.count > 10, `${name} builds`);
  assert.ok(BT.taigaDeerGeo(true).attributes.position.count > 200 && BT.marshHeronGeo(false).body.attributes.position.count > 100);
  for (const kind of Object.keys(BT.savannaBeasts)) assert.ok(BT.savannaAnimalGeo(BT.savannaBeasts[kind]).attributes.color.count > 500, `${kind} builds painted`);
  assert.ok(BT.critterMat('wing').isMeshStandardMaterial && BT.critterMat('fish', .4).roughness === .4);
  // The boids flock runs headless: birds stay between floor and roof and keep their speed limits.
  const mesh = new THREE.InstancedMesh(BT.gullGeo(), BT.critterMat('wing'), 12);
  const flock = BT.flock(mesh, { groups: [{ x: 0, y: 30, z: 0, r: 60, h: 20, n: 12 }], speed: [6, 12], floor: () => 10, roof: () => 60, shy: 18, seed: 3 });
  BT.S.pos.set(0, 30, 0);
  for (let i = 0; i < 240; i++) flock.update(1 / 30, { time: i / 30 });
  for (const a of flock.agents) { assert.ok(a.y > 10 && a.y < 60, 'between floor and roof'); const v = Math.hypot(a.vx, a.vz); assert.ok(v > 3 && v < 12.5, `speed ${v}`); }
  assert.ok(BT.LIFTED.length >= 27 && BT.LIFTED.every((entry) => typeof BT[entry.name] === 'function'));
});

test('every realm has an ambient-life entry drawn from lifted Biome Triad code', () => {
  const used = new Set();
  for (const biome of Object.keys(BIOMES)) {
    const life = REALM_LIFE[biome];
    assert.ok(life?.sets.length >= 1, `${biome} has ambient life`);
    for (const id of life.sets) {
      const set = CREATURE_SETS[id]; assert.ok(set, `${biome}: ${id} is defined`);
      assert.ok(BIOME_WORLDS[set.world], `${id} names a Biome Triad world`);
      for (const name of set.lifted) { assert.equal(typeof BT[name], 'function', `${id}: ${name} was lifted`); used.add(name); }
      // A set is the realm's own world's wildlife unless it is declared as borrowed.
      assert.equal(set.world === REALM_WORLD[biome], !life.borrowed.includes(id), `${biome}: ${id} borrowed flag matches its world`);
    }
  }
  assert.deepEqual(Object.keys(REALM_LIFE).sort(), Object.keys(BIOMES).sort());
  for (const entry of BT.LIFTED) assert.ok(used.has(entry.name), `${entry.name} is used by a realm`);
});

test('planned counts respect the quality caps', () => {
  for (const biome of Object.keys(BIOMES)) {
    let last = 0;
    for (const quality of ['low', 'medium', 'high']) {
      const { animals, points } = realmLifeCount(biome, quality);
      assert.ok(animals > 0 && animals <= CREATURE_CAPS[quality], `${biome} ${quality}: ${animals} animals within ${CREATURE_CAPS[quality]}`);
      assert.ok(points <= POINT_CAPS[quality], `${biome} ${quality}: ${points} points`);
      assert.ok(animals >= last, `${biome}: ${quality} is not sparser than the tier below`); last = animals;
    }
  }
});

// The marsh paints two small sprite textures: give it a canvas that accepts the calls (after the import test above).
const context = new Proxy({}, { get: () => () => context, set: () => true });
const canvasDocument = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };

for (const quality of ['low', 'medium', 'high']) {
  test(`built wildlife stays within the ${quality} cap in every realm, follows the ground and keeps out of cities`, () => {
    globalThis.document = canvasDocument;
    try {
      for (const oath of OATHS) {
        const scene = new THREE.Scene(), ctx = { scene, quality: { name: quality }, render: { timeOfDay: oath.biome === 'volcanic' ? 23 : 14 } }; // the volcanic realm's bats are under ground by day
        const creatures = createRealmCreatures(ctx);
        // Stand outside the city ring and let the realm's life ease in.
        const pos = { x: oath.center[0] + 300, y: 0, z: oath.center[1] + 60 }; pos.y = heightAt(pos.x, pos.z);
        for (let i = 0; i < 260; i++) creatures.update(1 / 20, pos);
        const stats = creatures.stats(), plan = realmLifeCount(oath.biome, quality);
        assert.deepEqual(stats.failed, [], `${oath.biome}: every set built`);
        assert.equal(stats.biome, oath.biome);
        assert.deepEqual(stats.sets.map((set) => set.id).sort(), [...REALM_LIFE[oath.biome].sets].sort(), `${oath.biome}: its sets are alive`);
        assert.ok(stats.animals > 0 && stats.animals <= plan.animals && stats.animals <= CREATURE_CAPS[quality], `${oath.biome} ${quality}: ${stats.animals} animals drawn, ${plan.animals} planned`);
        const m = new THREE.Matrix4(), p = new THREE.Vector3();
        creatures.root.updateMatrixWorld(true);
        creatures.root.traverse((node) => {
          assert.equal(node.raycast.length, 0, 'scenery ignores rays'); assert.equal(node.raycast(), undefined);
          if (node.isPoints) assert.ok(node.geometry.drawRange.count <= POINT_CAPS[quality]);
          if (!node.isInstancedMesh || !node.visible) return;
          for (let i = 0; i < node.count; i++) {
            node.getMatrixAt(i, m); p.setFromMatrixPosition(m).applyMatrix4(node.matrixWorld);
            assert.ok(Number.isFinite(p.x + p.y + p.z), `${oath.biome}: finite position`);
            if (p.y < -500) continue; // parked (dragonflies by night)
            // Ground animals (herds, livestock) stand on the terrain, outside the city ring.
            if (node.geometry.attributes.aLeg) { assert.ok(Math.abs(p.y - heightAt(p.x, p.z)) < 1.2, `${oath.biome}: hooves on the ground (${(p.y - heightAt(p.x, p.z)).toFixed(2)})`); assert.equal(inCity(p.x, p.z, 0), false, `${oath.biome}: herd outside the city`); assert.ok(heightAt(p.x, p.z) > waterAt(p.x, p.z), 'on dry land'); }
            else if (node.material.customProgramCacheKey?.() === 'critterwing' && m.elements[0] ** 2 + m.elements[1] ** 2 + m.elements[2] ** 2 > 1e-4 && oath.biome !== 'volcanic' && oath.biome !== 'marsh') assert.ok(p.y > heightAt(p.x, p.z) + 1.5, `${oath.biome}: bird above the ground (${(p.y - heightAt(p.x, p.z)).toFixed(1)})`);
          }
        });
        // Leaving for another realm eases this realm's life out.
        const next = OATHS[(OATHS.indexOf(oath) + 7) % OATHS.length], away = { x: next.center[0] + 300, y: 0, z: next.center[1] + 60 };
        for (let i = 0; i < 60; i++) creatures.update(1 / 20, away);
        const after = creatures.stats();
        for (const id of REALM_LIFE[oath.biome].sets) if (!REALM_LIFE[next.biome].sets.includes(id)) assert.ok(!after.sets.some((set) => set.id === id), `${oath.biome}: ${id} is gone after crossing to ${next.biome}`);
        creatures.dispose(); assert.equal(scene.children.length, 0); assert.equal(ctx.creatures, undefined);
      }
    } finally { delete globalThis.document; }
  });
}

test('without a canvas (server-side tests) the system still runs and simply leaves the marsh lights out', () => {
  const creatures = createRealmCreatures({ scene: new THREE.Scene(), quality: { name: 'low' } });
  const marsh = OATHS.find((oath) => oath.biome === 'marsh');
  for (let i = 0; i < 5; i++) creatures.update(1 / 30, { x: marsh.center[0] + 300, y: 5, z: marsh.center[1] });
  assert.equal(creatures.stats().animals, 0); creatures.dispose();
});
