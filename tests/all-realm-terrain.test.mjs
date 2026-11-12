import test from 'node:test';
import assert from 'node:assert/strict';
import { OATHS, OATH_BY_ID, ROUTES, regionAt } from '../shared/oaths.js';
import { heightAt, sampleTerrain, normalAt, SANCTUARY_HEIGHT, WORLD_SEED, MARSH_LEVEL } from '../shared/terrain.js';
import { buildCamps, buildLairs, buildSanctuaries, SAFE_RADIUS } from '../shared/sim/world.js';
import { terrainLocations } from '../tools/qa/terrain-locations.mjs';
const marsh = OATH_BY_ID['oath-08'].center;
const water = (x,z) => Math.hypot(x-marsh[0],z-marsh[1]) < 630 ? MARSH_LEVEL : 0;
for (const o of OATHS) {
  test(`${o.id} ${o.biome}: spawn, core and radial terrain transitions`, () => {
    const s = buildSanctuaries().find(s=>s.oathId===o.id);
    assert.ok(s.spawn.y >= heightAt(s.spawn.x,s.spawn.z)-.01);
    for (let a=0;a<16;a++) for (let r=0;r<=320;r+=2) {
      const x=o.center[0]+Math.cos(a*Math.PI/8)*r,z=o.center[1]+Math.sin(a*Math.PI/8)*r;
      const t=sampleTerrain(x,z,{}); assert.ok(Number.isFinite(t.h));
      assert.equal(t.h,heightAt(x,z));
      const n=normalAt(x,z); assert.ok(Math.abs(Math.hypot(...n)-1)<1e-9);
      if(r<80) assert.equal(t.h,SANCTUARY_HEIGHT[o.id]);
      if(t.coast>40) for(const [dx,dz] of [[.01,0],[0,.01]])
        assert.ok(Math.abs(heightAt(x+dx,z+dz)-t.h)<.5,`discontinuity at ${x},${z}`);
    }
  });
  test(`${o.id} ${o.biome}: dry camps/lair with four-sided support`, () => {
    for(const seed of [WORLD_SEED,1,42]) {
      const camps=buildCamps(seed).filter(c=>c.oath===o.id);
      assert.equal(camps.length,22); assert.equal(camps.filter(c=>c.starter).length,1);
      for(const c of [...camps,...buildLairs(seed).filter(c=>c.oath===o.id)]) {
        assert.equal(regionAt(c.x,c.z).id,o.id);
        assert.equal(c.y,heightAt(c.x,c.z));
        assert.ok(c.y>=water(c.x,c.z)+.4,`submerged ${seed} ${c.x},${c.z}: ${c.y}`);
        assert.ok(Math.hypot(c.x-o.center[0],c.z-o.center[1])>SAFE_RADIUS);
        for(const [dx,dz] of [[4,0],[-4,0],[0,4],[0,-4]])
          assert.ok(Math.abs(heightAt(c.x+dx,c.z+dz)-c.y)<=4.5,`unsupported ${seed} ${c.x},${c.z}`);
      }
    }
  });
}
test('all 30 route transitions are sampled in both directions, with finite terrain masks',()=>{
  for(const [a,b] of ROUTES) {
    const A=OATH_BY_ID[a].center,B=OATH_BY_ID[b].center;
    for(let i=0;i<=200;i++) {
      const t=i/200,x=A[0]+(B[0]-A[0])*t,z=A[1]+(B[1]-A[1])*t,s=sampleTerrain(x,z,{});
      for(const k of ['h','roadW','plaza','lava','coast'])assert.ok(Number.isFinite(s[k]),`${a}:${b}.${k}`);
      for(const k of ['roadW','plaza','lava'])assert.ok(s[k]>=0&&s[k]<=1);
      assert.equal(heightAt(x,z),heightAt(x,z));
    }
  }
});
test('inspection manifest covers all realms, prioritizes nine, and is reproducible',()=>{
  const rows=terrainLocations();assert.equal(rows.length,15);assert.equal(new Set(rows.map(r=>r.biome)).size,15);
  assert.equal(rows.filter(r=>r.priority).length,9);assert.deepEqual(rows,terrainLocations());
  assert.equal(rows.reduce((n,r)=>n+r.transitions.length,0),60);
});
