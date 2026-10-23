import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildReferenceHair} from './character/reference-hair.js';
import {faceParams} from './character/head.js';
import {PROFILES} from './character/profiles.js';
const keys=['oath-01-sorcerer','oath-03-sorcerer','oath-14-sorcerer'];
const root=new URL('../../../',import.meta.url);
function parse(b){const n=b.readUInt32LE(12);return {json:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};}
for(const key of keys)test(`${key}: Blender reconstruction preserves clips, bind matrices and original buffers`,()=>{
 const path=`game/public/assets/characters/${key}.glb`;
 const before=parse(execFileSync('git',['show',`3c991ee6e83dce6bd13a8bade714fc463e4263be:${path}`],{cwd:root,maxBuffer:16*1024*1024}));
 const after=parse(readFileSync(new URL(path,root)));
 assert.deepEqual(after.json.animations,before.json.animations);
 assert.deepEqual(after.json.skins,before.json.skins);
 assert.deepEqual(after.bin.subarray(0,before.bin.length),before.bin);
 assert.equal(after.json.animations.length,23);
 const oldCount=before.json.meshes[0].primitives.length;
 assert.ok(after.json.meshes[0].primitives.length>oldCount);
 for(const p of after.json.meshes[0].primitives.slice(oldCount)){
   assert.ok(p.attributes.JOINTS_0!==undefined);assert.ok(p.attributes.WEIGHTS_0!==undefined);
   const a=after.json.accessors[p.attributes.JOINTS_0],v=after.json.bufferViews[a.bufferView];
   for(let i=0;i<a.count;i++)assert.ok(after.bin.readUInt16LE(v.byteOffset+i*8)<after.json.skins[0].joints.length);
 }
});
test('reference hair is finite volume geometry in every quality tier',()=>{
 const counts=[];
 for(const key of keys)for(const quality of ['low','medium','high']){
  const hair=buildReferenceHair(key,faceParams(PROFILES[key]),.24,quality);
  assert.ok(hair.geometry.index.count>3000);assert.ok(hair.geometry.attributes.color);
  hair.geometry.computeBoundingBox();const b=hair.geometry.boundingBox;
  assert.ok(b.max.y-b.min.y>.15);assert.ok(b.max.z-b.min.z>.1);
  for(const n of hair.geometry.attributes.position.array)assert.ok(Number.isFinite(n));
  counts.push(hair.geometry.index.count);hair.geometry.dispose();hair.material.dispose();
 }
 assert.ok(new Set(counts).size>=3);
});
test('Time sorcerer uses the young dark-haired reference without invented eyewear',()=>{
 const p=PROFILES['oath-14-sorcerer'];assert.ok(p.age<.4);assert.equal(p.hair.color,'#211b19');assert.deepEqual(p.gear,[]);
});
