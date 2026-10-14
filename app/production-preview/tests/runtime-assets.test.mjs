import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectRuntimeAssets, externalGLBDependencies } from '../runtime-assets.mjs';
function glb(document){const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},...document}));const padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const bytes=Buffer.alloc(20+padded.length);bytes.write('glTF');bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded.length,12);bytes.writeUInt32LE(0x4e4f534a,16);padded.copy(bytes,20);return bytes;}
function fixture(t,document={}){const root=fs.mkdtempSync(path.join(os.tmpdir(),'preview-runtime-boundary-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const dir=path.join(root,'oath-01/weapons');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'base.glb'),glb(document));fs.writeFileSync(path.join(dir,'base.blend'),'DCC source');fs.writeFileSync(path.join(dir,'notes.md'),'authoring notes');fs.writeFileSync(path.join(dir,'collision.glb'),glb({}));fs.writeFileSync(path.join(dir,'unused.png'),'unused source image');fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({assets:[{id:'fixture',files:{glb:'base.glb',blend:'base.blend',collision:'collision.glb',textures:['unused.png']}}]}));return {root,dir};}
test('shipping boundary excludes DCC, notes, collision and unused images',t=>{const {root}=fixture(t);assert.deepEqual([...collectRuntimeAssets(root).files.keys()].sort(),['oath-01/weapons/base.glb','oath-01/weapons/manifest.json']);});
test('only actually referenced external GLB images/buffers join the allowlist',t=>{const {root,dir}=fixture(t,{images:[{uri:'material.png'},{uri:'data:image/png;base64,AA=='}],buffers:[{uri:'vertices.bin'}]});fs.writeFileSync(path.join(dir,'material.png'),'image bytes');fs.writeFileSync(path.join(dir,'vertices.bin'),'buffer bytes');const files=collectRuntimeAssets(root).files;assert.equal(files.has('oath-01/weapons/material.png'),true);assert.equal(files.has('oath-01/weapons/vertices.bin'),true);assert.equal(files.has('oath-01/weapons/unused.png'),false);});
test('GLB cannot smuggle authoring files or remote dependencies into runtime',t=>{const {root,dir}=fixture(t,{images:[{uri:'base.blend'}]});assert.throws(()=>collectRuntimeAssets(root),/runtime image/);fs.writeFileSync(path.join(dir,'base.glb'),glb({images:[{uri:'https://example.invalid/map.png'}]}));assert.throws(()=>collectRuntimeAssets(root),/local/);});
test('bad GLB length fails closed instead of silently bundling source folder',()=>{const bytes=glb({});bytes.writeUInt32LE(bytes.length+4,8);assert.throws(()=>externalGLBDependencies(bytes),/Invalid GLB/);});
test('reference boundary serves only explicitly indexed originals and rejects unresolved IDs',t=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'preview-reference-boundary-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const root=path.join(base,'assets/production'),refs=path.join(base,'assets/references/reference-061'),index=path.join(base,'AETHERION_CANON/11_REFERENCE_SHEETS');
 fs.mkdirSync(root,{recursive:true});fs.mkdirSync(refs,{recursive:true});fs.mkdirSync(index,{recursive:true});
 fs.writeFileSync(path.join(root,'a.glb'),glb({}));fs.writeFileSync(path.join(refs,'original.png'),'immutable image');fs.writeFileSync(path.join(refs,'private.blend'),'private DCC');
 const manifest={referenceIds:['reference-061'],assets:[{id:'a',files:{glb:'a.glb'}}]};fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest));
 const record={id:'reference-061',repository_path:'assets/references/reference-061/original.png',name:'Reference'};
 fs.writeFileSync(path.join(index,'REFERENCE_INDEX.json'),JSON.stringify({records:[record]}));
 const result=collectRuntimeAssets(root);assert.equal(result.references.length,1);assert.equal(result.files.has('__references/reference-061/original.png'),true);assert.equal([...result.files.keys()].some(name=>name.endsWith('.blend')),false);
 record.repository_path='assets/references/reference-061/private.blend';fs.writeFileSync(path.join(index,'REFERENCE_INDEX.json'),JSON.stringify({records:[record]}));assert.throws(()=>collectRuntimeAssets(root),/indexed original/);
 manifest.referenceIds=['unknown'];fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest));assert.throws(()=>collectRuntimeAssets(root),/Unknown reference/);
});
