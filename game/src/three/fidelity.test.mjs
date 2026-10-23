import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AnimationClip,QuaternionKeyframeTrack} from 'three';
import {prepareCombatClips,COMBAT_TIMING} from './combat-clips.js';
import {terrainResolution,weatheredRock} from './terrain-detail.js';
import {PROFILES,profileFor} from './character/profiles.js';
import {buildHead} from './character/head.js';

test('all 30 heroes have distinct facial geometry, independent of color and hair',()=>{
 const hashes=new Set();
 for(const p of Object.values(PROFILES)){
  const head=buildHead(p,.23,'low');
  const points=head.skinGeo.attributes.position.array;
  assert.ok(points.every(Number.isFinite));
  hashes.add(createHash('sha256').update(Buffer.from(points.buffer)).digest('hex'));
  head.skinGeo.dispose();for(const e of head.eyes)e.geo.dispose();
 }
 assert.equal(hashes.size,30);
});
test('NPC identity stays deterministic and does not mutate hero canon',()=>{
 const base=JSON.stringify(PROFILES);
 assert.deepEqual(profileFor('oath-01-sorcerer','npc:a'),profileFor('oath-01-sorcerer','npc:a'));
 assert.notDeepEqual(profileFor('oath-01-sorcerer','npc:a').face,profileFor('oath-01-sorcerer','npc:b').face);
 assert.equal(JSON.stringify(PROFILES),base);
});
test('retiming preserves authored poses and source clips with monotonic contact times',()=>{
 const track=new QuaternionKeyframeTrack('spine.quaternion',[0,.35,.7,1],[0,0,0,1,0,.3,0,.953939,0,-.2,0,.979796,0,0,0,1]);
 const source=[new AnimationClip('attack_1',1,[track])],copy=Array.from(track.times);
 const clips=prepareCombatClips(source);assert.equal(clips,prepareCombatClips(source));
 assert.equal(clips[0].duration,COMBAT_TIMING.attack_1.duration);
 assert.ok(Math.abs(clips[0].tracks[0].times[1]-.16)<1e-6);
 assert.deepEqual(Array.from(track.times),copy);assert.deepEqual(clips[0].tracks[0].values,track.values);
 for(let i=1;i<4;i++)assert.ok(clips[0].tracks[0].times[i]>clips[0].tracks[0].times[i-1]);
});
test('terrain spends triangles nearby and rocks have finite smooth normals',()=>{
 for(const q of ['low','medium','high'])assert.ok(terrainResolution(q,0)>terrainResolution(q,3));
 const rock=weatheredRock(6);assert.ok(rock.index.count>2000);
 assert.ok(rock.attributes.normal.array.every(Number.isFinite));
 assert.ok(rock.attributes.position.array.every(Number.isFinite));rock.dispose();
});
