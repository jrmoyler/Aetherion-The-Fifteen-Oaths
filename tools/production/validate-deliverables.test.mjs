import test from 'node:test';
import assert from 'node:assert/strict';
import { measureGlb, compareDimensions, validateAsset } from './validate-deliverables.mjs';
function boxScene(scale=[1,1,1]) {
  const positions=Buffer.alloc(8*12);let n=0;
  for(const x of [0,1])for(const y of [0,2])for(const z of [0,3]) {positions.writeFloatLE(x,n);positions.writeFloatLE(y,n+4);positions.writeFloatLE(z,n+8);n+=12;}
  const index=Buffer.alloc(12);[0,1,2,2,1,3].forEach((v,i)=>index.writeUInt16LE(v,i*2));
  const bin=Buffer.concat([positions,index]);
  const j={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{scale,children:[1]},{mesh:0,translation:[4,5,6]}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteLength:positions.length},{buffer:0,byteOffset:positions.length,byteLength:index.length}],accessors:[{bufferView:0,componentType:5126,type:'VEC3',count:8,min:[0,0,0],max:[1,2,3]},{bufferView:1,componentType:5123,type:'SCALAR',count:6}]};
  const raw=Buffer.from(JSON.stringify(j)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);
  const out=Buffer.alloc(28+json.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);out.writeUInt32LE(bin.length,20+json.length);out.writeUInt32LE(0x004e4942,24+json.length);bin.copy(out,28+json.length);return out;
}
test('geometry dimensions derive from actual positions and parent transforms',()=>{
  const x=measureGlb(boxScene([2,3,4]));assert.deepEqual(x.dimensionsMeters,[2,6,12]);assert.equal(x.triangles,2);assert.deepEqual(x.bounds.min,[8,15,24]);
});
test('dimension comparison permits coordinate axis permutation, rejects changed scale',()=>{
  assert.equal(compareDimensions([1,3,2],[1,2,3]),true);assert.equal(compareDimensions([100,300,200],[1,2,3]),false);assert.equal(compareDimensions([0,2,3],[1,2,3]),false);
});
test('missing exports are hard errors and do not remove open acceptance gates',async()=>{
  const x=await validateAsset({id:'missing',name:'Missing',type:'weapon',status:'CANDIDATE',files:{textures:[],renders:[]},remainingGates:[],rig:'NOT_APPLICABLE',animations:[]});
  assert.equal(x.status,'HARD_ERRORS');assert.ok(x.errors.some(e=>e.code==='DELIVERABLE_READ_OR_PARSE'));assert.ok(x.remainingGates.includes('VISUAL_REFERENCE_APPROVAL'));
});
test('paths cannot escape repository',async()=>{
  const x=await validateAsset({id:'escape',name:'Escape',type:'weapon',status:'CANDIDATE',files:{blend:'/etc/passwd',textures:[],renders:[]},remainingGates:[],rig:'NOT_APPLICABLE',animations:[]});
  assert.ok(x.errors.some(e=>e.message.includes('repository-relative')));
});

test('candidate report aggregates retain complete compressed issues and source hashes', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const { gunzipSync } = await import('node:zlib');
  const hash=b=>createHash('sha256').update(b).digest('hex');
  const report=JSON.parse(await readFile(new URL('../../validation/production/DELIVERABLE_AUDIT.json',import.meta.url)));
  const zipped=await readFile(new URL('../../validation/production/DELIVERABLE_AUDIT_DETAILS.json.gz',import.meta.url));
  assert.equal(hash(zipped),report.fullIssueEvidence.sha256);
  const full=JSON.parse(gunzipSync(zipped));
  for(const r of report.records) {
    for(const f of Object.values(r.files))assert.equal(hash(await readFile(new URL(`../../${f.path}`,import.meta.url))),f.sha256);
    for(const [key,ex] of Object.entries(r.exports)) {
      const entry=full.records.find(f=>f.assetId===r.id&&f.export===key);
      assert.ok(entry);assert.equal(entry.issues.truncated,false);
      assert.equal(ex.primitiveSummary.count,entry.primitives.length);
      assert.equal(ex.uvSummary.measuredPrimitives,entry.uvRanges.length);
      assert.deepEqual(ex.animations.map(a=>a.name),entry.animations.map(a=>a.name));
      assert.equal(ex.validator.issues.byCode.reduce((n,c)=>n+c.count,0),entry.issues.messages.length);
    }
  }
  assert.equal(report.summary.productionApproved,0);
});
