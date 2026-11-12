import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainSkirtDepth} from './terrain-detail.js';
test('adaptive skirts cover a hollow between coarse edge vertices without changing terrain',()=>{
 const height=(x,z)=>Math.abs(x+76)<.001?-18:0;
 assert.equal(terrainSkirtDepth(0,0,160,'low',height),19);
 assert.equal(height(-76,80),-18);
 assert.equal(terrainSkirtDepth(0,0,160,'low',()=>10),6);
});
