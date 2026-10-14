import test from 'node:test';
import assert from 'node:assert/strict';
import { measureGlb, compareDimensions, validateAsset, resolveManifestAsset, collisionPolicy, validateCompressedSource, summarizeDeliveryStatuses } from './validate-deliverables.mjs';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
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

test('collision policy keeps default strict and distinguishes absence from pending work',()=>{
  for(const collisionPolicy of [undefined,null,{}, {mode:'NONE'}, {mode:'PENDING',reason:'Not authored'}])assert.throws(()=>collisionPolicyCheck(collisionPolicy));
  function collisionPolicyCheck(policy){return collisionPolicy({files:{},...(policy===undefined?{}:{collisionPolicy:policy})});}
  assert.deepEqual(collisionPolicy({files:{collision:'mesh.glb'}}),{mode:'REQUIRED'});
  assert.equal(collisionPolicy({files:{},collisionPolicy:{mode:'NONE',reason:'Overhead non-solid cloth'}}).mode,'NONE');
  for(const collision of [null,'mesh.glb',''])assert.throws(()=>collisionPolicy({files:{collision},collisionPolicy:{mode:'NONE',reason:'No collision'}}));
});

test('manifest-local paths normalize while traversal and symlink escapes reject',async t=>{
  const repo=await mkdtemp(path.join(os.tmpdir(),'delivery-paths-'));t.after(()=>rm(repo,{recursive:true,force:true}));
  const dir=path.join(repo,'assets/production/kit');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'source.blend'),'BLENDER');await writeFile(path.join(repo,'outside'),'outside');await symlink(path.join(repo,'outside'),path.join(dir,'escape'));
  const manifest=path.join(dir,'manifest.json');
  const resolved=await resolveManifestAsset({files:{blend:'source.blend',textures:['source.blend']}},manifest,'MANIFEST_DIRECTORY',repo);
  assert.equal(resolved.files.blend,'assets/production/kit/source.blend');assert.deepEqual(resolved.files.textures,['assets/production/kit/source.blend']);
  for(const bad of ['../kit/source.blend','escape','/etc/passwd','folder\\file'])await assert.rejects(resolveManifestAsset({files:{blend:bad}},manifest,'MANIFEST_DIRECTORY',repo));
  await assert.rejects(resolveManifestAsset({files:{}},manifest,'AUTO',repo));
});

test('compressed source evidence binds exact report schema, record and source bytes',async t=>{
  const repo=await mkdtemp(path.join(os.tmpdir(),'delivery-source-'));t.after(()=>rm(repo,{recursive:true,force:true}));
  const dir=path.join(repo,'assets/production/kit');await mkdir(dir,{recursive:true});
  const bytes=Buffer.from([0x28,0xb5,0x2f,0xfd,1,2,3]),hash=b=>createHash('sha256').update(b).digest('hex');
  const valid={schemaVersion:1,tool:{name:'Blender',version:'4.3.2'},reports:[{module:'test',opened:true,errors:[],source_sha256:hash(bytes)}]};
  const asset={sourceValidation:{report:'assets/production/kit/report.json',recordId:'test'}};
  const save=async report=>{const data=Buffer.from(JSON.stringify(report));await writeFile(path.join(dir,'report.json'),data);asset.sourceValidation.reportSha256=hash(data);};
  await save(valid);assert.equal((await validateCompressedSource(asset,bytes,repo)).path,asset.sourceValidation.report);
  await save({...valid,schemaVersion:1.0});assert.equal((await validateCompressedSource(asset,bytes,repo)).path,asset.sourceValidation.report);
  for(const mutate of [r=>r.schemaVersion=2,r=>r.schemaVersion=true,r=>r.tool.name='Other',r=>r.tool.version=' ',r=>r.reports.push({...r.reports[0]}),r=>r.reports[0].opened=false,r=>r.reports[0].errors=['failed'],r=>r.reports[0].source_sha256='stale',r=>r.reports[0].module='other',r=>r.reports=[null]]){
    const report=structuredClone(valid);mutate(report);await save(report);await assert.rejects(validateCompressedSource(asset,bytes,repo));
  }
  await save(valid);asset.sourceValidation.reportSha256='stale';await assert.rejects(validateCompressedSource(asset,bytes,repo));
  await assert.rejects(validateCompressedSource({},bytes,repo));
});

test('pending collision retains an explicit incomplete result on otherwise valid exports',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../../assets/production/oath-03/weapons/manifest.json',import.meta.url)));
  const asset=structuredClone(manifest.assets[0]);delete asset.files.collision;
  asset.collisionPolicy={mode:'PENDING',reason:'Collider awaiting fit review',remainingGate:'Author missing collider'};
  const result=await validateAsset(asset);
  assert.deepEqual(result.errors,[]);assert.equal(result.status,'CANDIDATE_INCOMPLETE_MISSING_REQUIRED_COLLISION');assert.ok(result.remainingGates.includes('Author missing collider'));
  const invalid=structuredClone(asset);invalid.files.lod1=invalid.files.glb;invalid.triangles.lod1=invalid.triangles.glb;
  const failed=await validateAsset(invalid);assert.equal(failed.status,'HARD_ERRORS');assert.ok(failed.errors.some(e=>e.code==='LOD_NOT_REDUCED'));
  assert.deepEqual(summarizeDeliveryStatuses([result,failed]),{hardErrorAssets:1,structurallyPassed:0,incompleteAssets:2});
  delete asset.collisionPolicy;const required=await validateAsset(asset);assert.equal(required.status,'HARD_ERRORS');assert.ok(required.errors.some(e=>e.code==='COLLISION_POLICY'));
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


test('required GLB roles cannot evade parsing through another filename extension',async t=>{
  const repo=await mkdtemp(path.join(os.tmpdir(),'delivery-role-'));t.after(()=>rm(repo,{recursive:true,force:true}));
  const dir=path.join(repo,'assets/production/kit');await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'source.blend'),'BLENDER');await writeFile(path.join(dir,'mesh.txt'),'not a GLB');
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(1,16);png.writeUInt32BE(1,20);await writeFile(path.join(dir,'image.png'),png);
  const p=n=>'assets/production/kit/'+n;
  const asset={id:'role-test',name:'Role test',type:'static',status:'CANDIDATE',remainingGates:[],rig:'NOT_APPLICABLE',animations:[],dimensionsMeters:[1,2,3],files:{blend:p('source.blend'),glb:p('mesh.txt'),lod1:p('mesh.txt'),lod2:p('mesh.txt'),collision:p('mesh.txt'),textures:[p('image.png')],renders:[p('image.png')]}};
  const invalid=await validateAsset(asset,repo);assert.equal(invalid.status,'HARD_ERRORS');
  for(const role of ['glb','lod1','lod2','collision'])assert.ok(invalid.errors.some(e=>e.code==='DELIVERABLE_READ_OR_PARSE'&&e.message.startsWith(role+' (')));
  await writeFile(path.join(dir,'mesh.txt'),boxScene());
  const parsed=await validateAsset(asset,repo);for(const role of ['glb','lod1','lod2','collision'])assert.equal(parsed.exports[role].triangles,2,'GLB role is parsed regardless of suffix');
});
