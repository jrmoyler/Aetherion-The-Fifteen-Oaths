import test from 'node:test';
import assert from 'node:assert/strict';
import { questView, questWaypoint } from './quests.js';
const S = {
  sanctuaries: [{ oathId: 'oath-01', npcs: [{role: 'oathkeeper', x: 11, z: 23}], shrine: {x: 30,z: 40} }],
  camps: [{oath:'oath-01', x:1,z:2,level:20,members:['creature']}, {oath:'oath-01',x:100,z:200,level:2,members:['creature']}],
  lairs: [{boss:'boss',x:500,z:600}],
};
test('talk and discovery route to measured NPC and shrine positions', () => {
  assert.equal(questWaypoint(S, {}, {kind:'talk', oath:'oath-01', role:'oathkeeper'}).x, 11);
  assert.equal(questWaypoint(S, {}, {kind:'discover', shrine:'oath-01'}).z, 40);
});
test('starter quests prefer survivable camps, boss quests point to the lair', () => {
  const camp = questWaypoint(S, {x:0,z:0,lvl:1}, {kind:'kill', targets:['creature']});
  assert.equal(camp.x, 100);
  assert.equal(questWaypoint(S, {}, {kind:'kill',targets:['boss']}).x, 500);
});
test('completed or unavailable objectives have no misleading waypoint', () => {
  assert.equal(questWaypoint(S, {}, {kind:'talk',oath:'missing',role:'oathkeeper'}), null);
  assert.equal(questWaypoint(S, {}, {done:true,kind:'kill',targets:['boss']}), null);
  assert.equal(questView({id:'q'}).waypoint, null);
});
