import test from 'node:test';import assert from 'node:assert/strict';
import {trackedDestination} from './objectiveBeacon.js';
test('world navigation uses first active finite authoritative waypoint',()=>{
 const target={x:12,z:-7,label:'Warden'};
 assert.equal(trackedDestination(new Map([['done',{done:true,waypoint:target}],['bad',{waypoint:{x:NaN,z:4}}],['active',{waypoint:target}]])),target);
 assert.equal(trackedDestination([{done:true,waypoint:target}]),null);
 assert.equal(trackedDestination(),null);
});
