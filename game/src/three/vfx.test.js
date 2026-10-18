import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Vector3 } from 'three';
import { initVFX, ELEMENT_STYLES } from './vfx.js';
test('Three combat VFX are bounded, stop cleanly, and never move actor positions', async()=>{
  const scene=new Scene();let tick;const vfx=await initVFX({scene,addUpdate(fn){tick=fn;}});
  const position=new Vector3(3,4,5), target=new Vector3(10,4,15);
  const caster={position};for(let i=0;i<90;i++)vfx.castEffect({id:'linear/ice',shape:'projectile'},{caster,target,element:'frost'});
  assert.equal(vfx.activeCount,64);assert.equal(scene.children.length,64);
  tick(.08);assert.deepEqual(position.toArray(),[3,4,5]);assert.deepEqual(target.toArray(),[10,4,15]);
  vfx.stopAll();assert.equal(vfx.activeCount,0);assert.equal(scene.children.length,0);
  for(const element of Object.keys(ELEMENT_STYLES))vfx.impact(element,position);
  assert.equal(vfx.activeCount,15);for(let i=0;i<15;i++)tick(.1);
  assert.equal(vfx.activeCount,0);assert.equal(scene.children.length,0);
});
