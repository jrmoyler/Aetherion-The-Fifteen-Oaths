import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { appendReviewAssets, REVIEW_ROOT, REVIEW_MANIFEST } from '../review-assets.mjs';
function glb(document={}){const text=Buffer.from(JSON.stringify({asset:{version:'2.0'},...document}));const json=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]),b=Buffer.alloc(20+json.length);b.write('glTF');b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(json.length,12);b.writeUInt32LE(0x4e4f534a,16);json.copy(b,20);return b;}
function fixture(t,document={}){const repo=fs.mkdtempSync(path.join(os.tmpdir(),'aetherion-review-boundary-'));t.after(()=>fs.rmSync(repo,{recursive:true,force:true}));const root=path.join(repo,REVIEW_ROOT);fs.mkdirSync(root,{recursive:true});fs.mkdirSync(path.join(repo,'app/production-preview'),{recursive:true});const bytes=glb(document);fs.writeFileSync(path.join(root,'a.glb'),bytes);fs.writeFileSync(path.join(root,'a.blend'),'private authoring source');fs.writeFileSync(path.join(root,'unused.glb'),bytes);const data={status:'UNAPPROVED_REVIEW_ONLY',assets:[{id:'review',status:'UNAPPROVED_REVIEW_ONLY_NOT_PRODUCTION_PROMOTED',referenceIds:['reference-032'],files:{glb:'a.glb',blend:'a.blend'}}],sha256:{'a.glb':createHash('sha256').update(bytes).digest('hex')}};const save=()=>fs.writeFileSync(path.join(repo,'app/production-preview/review-manifest.json'),JSON.stringify(data));save();const catalog={files:new Map([['production.glb','source']]),manifests:['production.json'],references:[{id:'reference-032'}]};return {repo,root,data,save,catalog};}
test('review opt-in adds only hash-pinned listed GLBs without mutating production catalog',t=>{const x=fixture(t),r=appendReviewAssets(x.catalog,x.repo);assert.deepEqual([...r.files.keys()],['production.glb','__reviews/a.glb',REVIEW_MANIFEST]);assert.equal(x.catalog.files.size,1);assert.deepEqual(x.catalog.manifests,['production.json']);assert.deepEqual(r.manifests,['production.json',REVIEW_MANIFEST]);});
test('changed review bytes fail closed',t=>{const x=fixture(t);fs.appendFileSync(path.join(x.root,'a.glb'),'tampered');assert.throws(()=>appendReviewAssets(x.catalog,x.repo),/hash mismatch/);});
test('review namespace traversal and outside symlinks are rejected',t=>{const x=fixture(t);x.data.assets[0].files.glb='../a.glb';x.save();assert.throws(()=>appendReviewAssets(x.catalog,x.repo),/namespace/);x.data.assets[0].files.glb='a.glb';x.save();fs.renameSync(path.join(x.root,'a.glb'),path.join(x.repo,'outside.glb'));fs.symlinkSync(path.join(x.repo,'outside.glb'),path.join(x.root,'a.glb'));assert.throws(()=>appendReviewAssets(x.catalog,x.repo),/escapes frozen bundle/);});
test('external resources cannot expand review delivery',t=>{const x=fixture(t,{images:[{uri:'secret.png'}]});assert.throws(()=>appendReviewAssets(x.catalog,x.repo),/embed all/);});
test('review status and original-reference resolution remain explicit',t=>{const x=fixture(t);x.data.status='APPROVED';x.save();assert.throws(()=>appendReviewAssets(x.catalog,x.repo),/status/);x.data.status='UNAPPROVED_REVIEW_ONLY';x.data.assets[0].referenceIds=['unknown'];x.save();assert.throws(()=>appendReviewAssets(x.catalog,x.repo),/not available/);});

test('cached reviewed bytes remain pinned after file replacement or symlink swap',t=>{const x=fixture(t),r=appendReviewAssets(x.catalog,x.repo),verified=Buffer.from(r.reviewBuffers.get('__reviews/a.glb'));fs.writeFileSync(path.join(x.root,'a.glb'),'changed bytes');assert.deepEqual(r.reviewBuffers.get('__reviews/a.glb'),verified);fs.unlinkSync(path.join(x.root,'a.glb'));fs.writeFileSync(path.join(x.repo,'outside'),'outside bytes');fs.symlinkSync(path.join(x.repo,'outside'),path.join(x.root,'a.glb'));assert.deepEqual(r.reviewBuffers.get('__reviews/a.glb'),verified);assert.throws(()=>appendReviewAssets(x.catalog,x.repo),/escapes/);});


test('duplicate review identities and implicit asset approval fail closed',t=>{
 const x=fixture(t);
 x.data.assets.push({...x.data.assets[0]});x.save();
 assert.throws(()=>appendReviewAssets(x.catalog,x.repo),/Duplicate review asset ID/);
 x.data.assets.pop();delete x.data.assets[0].status;x.save();
 assert.throws(()=>appendReviewAssets(x.catalog,x.repo),/asset status must remain explicit/);
 x.data.assets[0].status='APPROVED';x.save();
 assert.throws(()=>appendReviewAssets(x.catalog,x.repo),/asset status must remain explicit/);
});

test('every new review LOD must carry its own exact byte pin',t=>{
 const x=fixture(t);
 x.data.assets[0].files.lod1='unused.glb';x.save();
 assert.throws(()=>appendReviewAssets(x.catalog,x.repo),/hash mismatch/);
 x.data.sha256['unused.glb']=x.data.sha256['a.glb'];x.save();
 const result=appendReviewAssets(x.catalog,x.repo);
 assert.ok(result.reviewBuffers.has('__reviews/unused.glb'));
 assert.equal(x.catalog.files.size,1);
});

test('published review selection preserves historical pins and isolates revision08/09 candidates',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../review-manifest.json',import.meta.url),'utf8'));
 assert.equal(data.status,'UNAPPROVED_REVIEW_ONLY');
 assert.equal(data.assets.length,23);
 assert.equal(new Set(data.assets.map(row=>row.id)).size,23);
 const listed=data.assets.flatMap(row=>Object.values(row.files));
 assert.equal(listed.length,63);
 assert.deepEqual(Object.keys(data.sha256).sort(),[...listed].sort());
 for(const row of data.assets){
  assert.equal(row.status,'UNAPPROVED_REVIEW_ONLY_NOT_PRODUCTION_PROMOTED');
  assert.ok(row.id.startsWith('review-'));
  assert.ok(Object.keys(row.files).every(key=>['glb','lod1','lod2'].includes(key)));
 }
 const retained=Object.entries(data.sha256).filter(([name])=>!name.startsWith('representative-revision-09/')).sort(([a],[b])=>a<b?-1:a>b?1:0);
 assert.equal(retained.length,60);
 assert.equal(createHash('sha256').update(JSON.stringify(retained)).digest('hex'),'d2284e83027a0c315898b6059070b5d7da7a137aa01fb5fe45a55bf599e141eb','All prior 60 review pins must remain unchanged');
 const revision09=listed.filter(name=>name.startsWith('representative-revision-09/'));
 assert.equal(revision09.length,3);
 assert.ok(revision09.every(name=>name.startsWith('representative-revision-09/kiln-ninja-v16/kiln-ninja-ensemble-candidate/')&&!name.includes('collision')));
 const historical={
  'representative-revision-05/fault-v11/amethyst-short-blade/review.glb':'f704cbdc1b3364e0902dcd2ddd944f834ad9b183f5385c903559b8892db1e8af',
  'representative-revision-04/impulse-shield-v8b/impulse-shield-lateral-review08b.glb':'27a08329146d305df4bee61e642c4fff3f0ed716f8f5e7ee7d9433b652ca8f34',
  'representative-revision-06/kiln-ninja-v10/kiln-ninja-ensemble-candidate/kiln-ninja-ensemble-candidate.glb':'3be23b8cb9188fad78980ae3b7a1c74960ce829b68bfa44141e0735ad713dd01',
  'representative-revision-06/kiln-ninja-v10/kiln-ninja-ensemble-candidate/kiln-ninja-ensemble-candidate-lod1.glb':'e2842c4e3ebb66ba7d91c943d94fc82fb138e557abc499d947ea452936c14f38',
  'representative-revision-06/kiln-ninja-v10/kiln-ninja-ensemble-candidate/kiln-ninja-ensemble-candidate-lod2.glb':'2dc021ca60ff94d7ee19666fd927d5f2289ffe3ec9ade7c39dd44adf144bdc48'
 };
 for(const [name,hash]of Object.entries(historical))assert.equal(data.sha256[name],hash);
 const added=listed.filter(name=>name.startsWith('representative-revision-08/'));
 assert.equal(added.length,55);
 assert.equal(added.filter(name=>name.includes('/daybreak-r05/')).length,51);
 assert.equal(added.filter(name=>name.includes('/kiln-ninja-v15/')).length,3);
 assert.equal(added.filter(name=>name.includes('/fault-v13/')).length,1);
 assert.ok(added.every(name=>!name.includes('/baseline/')&&!name.includes('daybreak-r04')&&!name.includes('v14')));
});
