import test from 'node:test';
import assert from 'node:assert/strict';
import { cinematicProfile } from './cinematic-profile.js';
import { createPracticalLights } from './practical-lights.js';
import { TIERS } from '../core/quality.js';

test('costly contact AO is restricted to high tiers and authored lighting stays bounded', () => {
 for (const [name,tier] of Object.entries(TIERS)) {
  const p=cinematicProfile({...tier,name});
  assert.equal(p.ao,name==='high'||name==='ultra');
  assert.ok(p.practicalLights>=2&&p.practicalLights<=6);
  assert.ok(p.aoScale<=.75);assert.ok(p.aoSamples<=16);
 }
});
const source=(x)=>({x,y:2,z:0,color:0xffaa44,range:14,intensity:2});
test('practical lights use authored positions and fade out before reassignment', () => {
 const a=source(0),b=source(100),p=createPracticalLights({name:'low'},[a,b]);
 for(let i=0;i<60;i++)p.update(1/60,{x:0,y:0,z:0},0);
 const slot=p.slots.find(s=>s.source===a);assert.ok(slot.light.intensity>3);
 assert.equal(slot.light.castShadow,false);assert.equal(p.group.children.length,2);
 p.update(1/60,{x:100,y:0,z:0},0);
 assert.equal(slot.source,a); // still fading at old fixture, no moving light streak
 for(let i=0;i<120;i++)p.update(1/60,{x:100,y:0,z:0},0);
 assert.ok(p.slots.some(s=>s.source===b&&s.light.intensity>3));
 assert.ok(!p.slots.some(s=>s.source===a));
 assert.equal(p.group.children.length,2);
});
test('lighting dims in daylight and excludes distant fixtures', () => {
 const p=createPracticalLights({name:'high'},[source(0),source(1000)]);
 for(let i=0;i<120;i++)p.update(1/60,{x:0,y:0,z:0},12);
 assert.ok(p.slots[0].light.intensity<.61);
 assert.equal(p.slots.filter(s=>s.source).length,1);
});
