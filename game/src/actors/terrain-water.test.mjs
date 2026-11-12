import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s.startsWith('@shared/')?new URL('../../../shared/'+s.slice(8),import.meta.url).href:s,c);}});
const {PlayerController}=await import('./controller.js');
const {heightAt,normalAt,waterLevelAt,MARSH_LEVEL}=await import('@shared/terrain.js');
const {waterLevelAt:groundWater}=await import('../three/realmGround.js');
const {waterLevelAt:landmarkWater}=await import('../three/realmLandmarks.js');
test('controller swims at the real marsh surface rather than walking below the pool',()=>{
 const x=-929.9119239734255,z=-359.7684034063742;
 const pos={x,y:heightAt(x,z),z,set(x,y,z){Object.assign(this,{x,y,z});}};
 const actor={root:{position:pos,rotation:{y:0}},cls:'ninja',alive:true};
 const pc=new PlayerController({world:{heightAt,normalAt,waterLevel:0,waterLevelAt},input:{state:{},consume:()=>false}},actor,()=>0);
 for(let i=0;i<120;i++)pc.update(1/30);
 assert.equal(pc.swimming,true);assert.ok(Math.abs(pos.y-(MARSH_LEVEL-1.8*.6))<.01);
});
test('ground colouring, landmark placement and movement use identical pool boundaries',()=>{
 assert.equal(groundWater,waterLevelAt);assert.equal(landmarkWater,waterLevelAt);
 assert.equal(waterLevelAt(-720,-540),3.4);
 assert.equal(waterLevelAt(-90.001,-540),3.4);
 assert.equal(waterLevelAt(-90,-540),0);
});
