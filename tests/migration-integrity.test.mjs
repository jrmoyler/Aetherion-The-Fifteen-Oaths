import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(path.join(root,p));
const json = (p) => JSON.parse(read(p));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = json('CASTABLE_SOURCE_MANIFEST.json');
const upgrade = json('docs/upgrades/ability-source-import.json');
const patches = json('docs/upgrades/source-integration-patches.json');
const upgraded = new Map(upgrade.files.map(e => [e.path,e]));
const patched = new Map(patches.map(e => [e.path,e]));
const registry = json('CASTABLE_REGISTRY.json');
const catalog = json('runtime/ability-matrix/presets/catalog.json');
const library = json('runtime/ability-matrix/presets/library.json');
const live = catalog.abilities.filter((a)=>a.status==='live'&&['ability','buff','summon'].includes(a.kind));
test('original source inventory is preserved; pinned upstream upgrades and integration patches match recorded hashes', () => {
 assert.equal(manifest.sourceCommit,'4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451');
 assert.equal(manifest.files.length,1896);
 let bytes=0;
 for(const entry of manifest.files){const content=read(entry.destinationPath);const current=patched.get(entry.destinationPath)||upgraded.get(entry.destinationPath);if(!current)assert.equal(content.length,entry.bytes,entry.sourcePath);assert.equal(sha(content),current?.sha256||entry.sha256,entry.sourcePath);bytes+=entry.bytes;}
 assert.equal(bytes,manifest.totalBytes);
 assert.equal(upgrade.commit,'c16da3c978a4815f46273fdcda2252ab48977a53');
 for(const entry of upgrade.files)assert.equal(sha(read(entry.path)),patched.get(entry.path)?.sha256||entry.sha256,entry.path);
 for(const entry of patches){assert.ok(entry.reason.length>20);const upstream=upgraded.get(entry.path)?.sha256||manifest.files.find(e=>e.destinationPath===entry.path)?.sha256;assert.equal(entry.upstreamSHA256,upstream,entry.path);assert.equal(sha(read(entry.path)),entry.sha256,entry.path);}
});
test('100 castables, 15 elements, source kinds, and separate exclusions reconcile', () => {
 assert.equal(live.length,100);assert.equal(registry.castables.length,100);
 assert.deepEqual(registry.kindCounts,{ability:95,buff:3,summon:2});
 assert.equal(new Set(registry.castables.map((a)=>a.uid)).size,100);
 assert.deepEqual(registry.castables.map((a)=>a.uid),live.map((a)=>a.uid));
 assert.equal(registry.elements.length,15);
 assert.equal(catalog.abilities.filter((a)=>a.status==='archived').length,7);
 assert.equal(catalog.abilities.filter((a)=>a.kind==='move').length,11);
 for(const [i,element] of registry.elements.entries()){
  assert.equal(element.sourceElementId,catalog.elements[i].id);
  assert.equal(element.oathId,`oath-${String(i+1).padStart(2,'0')}`);
  assert.equal(registry.castables.filter((a)=>a.sourceCatalog.element===element.sourceElementId).length,element.sourceCount);
 }
});
for(const record of registry.castables)test(`source schema, implementation, dependencies, assets: ${record.uid}`,()=>{
 const raw=live.find((a)=>a.uid===record.uid);
 assert.deepEqual(record.sourceCatalog,raw);
 assert.deepEqual(record.sourcePreset,library.presets[record.uid]);
 assert.deepEqual(record.sourcePreset,json(`runtime/ability-matrix/presets/${record.uid}.json`));
 assert.equal(record.uid,`${raw.pack}/${raw.id}`);
 assert.ok(['VERIFIED','IMPORTED','BLOCKED','MISSING'].includes(record.validation.status));
 assert.ok(existsSync(path.join(root,record.implementation.destinationPath)));
 assert.ok(record.implementation.sourceModuleDependencies.length>0);
 for(const file of [...record.implementation.sourceModuleDependencies,...record.implementation.sharedHostAndLazyPackAssets,...record.implementation.animation.characterClips])assert.ok(existsSync(path.join(root,file)),file);
 assert.equal(record.proposedAetherion.status,'PROPOSED');
 assert.equal(record.proposedAetherion.oathId,registry.elements.find((e)=>e.sourceElementId===raw.element).oathId);
});
test('binary asset containers are real files, not Git LFS pointers or placeholders',()=>{
 for(const file of manifest.files.filter((f)=>f.category==='asset')){
  const bytes=read(file.destinationPath);
  assert.ok(bytes.length>20,file.sourcePath);
  assert.ok(!bytes.subarray(0,100).toString().startsWith('version https://git-lfs.github.com/spec'),file.sourcePath);
  if(file.sourcePath.endsWith('.glb')) {assert.equal(bytes.subarray(0,4).toString(),'glTF',file.sourcePath);assert.equal(bytes.readUInt32LE(8),bytes.length,file.sourcePath);}
  if(file.sourcePath.endsWith('.png'))assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',file.sourcePath);
  if(file.sourcePath.endsWith('.jpg'))assert.equal(bytes.subarray(0,2).toString('hex'),'ffd8',file.sourcePath);
  if(file.sourcePath.endsWith('.fbx'))assert.ok(bytes.subarray(0,30).toString().includes('Kaydara FBX Binary'),file.sourcePath);
 }
});
