/** Real Three GLTFLoader geometry/material/mixer CPU checks, not texture/GPU tests. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { normalizeManifest } from '../catalog.mjs';
import { collectRuntimeAssets } from '../runtime-assets.mjs';
import { appendReviewAssets } from '../review-assets.mjs';
import { disposeGLTF } from '../lifecycle.mjs';
globalThis.self = globalThis;
const root=fileURLToPath(new URL('../../../assets/production/',import.meta.url));
const repositoryRoot=fileURLToPath(new URL('../../../',import.meta.url));
const baseCatalog=collectRuntimeAssets(root);
const catalog=process.env.AETHERION_INCLUDE_REVIEWS==='1'?appendReviewAssets(baseCatalog,repositoryRoot):baseCatalog;
const records=[],manifests=[];
for(const manifest of catalog.manifests) {
  const manifestBytes=await fs.readFile(catalog.files.get(manifest));
  manifests.push({path:manifest,sourcePath:path.relative(repositoryRoot,catalog.files.get(manifest)),sha256:createHash('sha256').update(manifestBytes).digest('hex'),bytes:manifestBytes.length});
  const rows=normalizeManifest(JSON.parse(manifestBytes.toString('utf8')),manifest);
  for(const row of rows)for(const state of row.states)for(const lod of state.lods){
    const relative=lod.url.replace('./production-assets/',''),bytes=await fs.readFile(catalog.files.get(relative));
    const record={asset:row.id,state:state.value,lod:lod.level,path:relative,sourcePath:path.relative(repositoryRoot,catalog.files.get(relative)),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,status:'FAIL',warnings:[],textureDecode:'NOT_VERIFIED_NODE_HAS_NO_BROWSER_IMAGE_DECODER'};
    const warn=console.warn,error=console.error;
    let gltf,mixer;
    try {
      console.warn=(...args)=>record.warnings.push(args.map(String).join(' '));console.error=console.warn;
      gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
      const objects=[],geometries=new Set(),materials=new Set(),resources=new Map();
      gltf.scene.traverse(node=>{
        objects.push(node);
        if(node.geometry) {
          geometries.add(node.geometry);
          for(const attribute of Object.values(node.geometry.attributes))assert.ok(Array.from(attribute.array).every(Number.isFinite),`${row.id}: nonfinite geometry`);
        }
        for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)materials.add(material);
      });
      assert.ok(geometries.size>0,'No geometry imported');assert.ok(materials.size>0,'No materials imported');
      for(const material of materials){assert.ok(material.isMeshStandardMaterial,`Unexpected glTF material ${material.type}`);assert.ok(Number.isFinite(material.roughness));assert.ok(Number.isFinite(material.metalness));}
      mixer=new THREE.AnimationMixer(gltf.scene);
      for(const clip of gltf.animations){
        assert.ok(clip.validate(),`Invalid animation ${clip.name}`);mixer.stopAllAction();mixer.clipAction(clip).play();
        for(const time of [0,clip.duration/2,clip.duration]){mixer.setTime(time);gltf.scene.updateMatrixWorld(true);for(const node of objects)assert.ok(node.matrixWorld.elements.every(Number.isFinite),'Nonfinite animated matrix');}
      }
      for(const resource of [...geometries,...materials]){resources.set(resource,0);resource.addEventListener('dispose',()=>resources.set(resource,resources.get(resource)+1));}
      record.meshGeometries=geometries.size;record.materials=materials.size;record.animations=gltf.animations.map(clip=>({name:clip.name,duration:clip.duration,tracks:clip.tracks.length}));
      disposeGLTF(gltf,mixer);gltf=null;mixer=null;
      assert.ok([...resources.values()].every(count=>count===1),'Expected each owned geometry/material disposed exactly once');
      record.status='PASS_CPU_ONLY';
    } catch(e){record.error=e.stack;process.exitCode=1;}
    finally { console.warn=warn;console.error=error;if(gltf)disposeGLTF(gltf,mixer); }
    records.push(record);
  }
}
if(!records.length)process.exitCode=1;
const report={generatedAt:new Date().toISOString(),node:process.version,reviewMode:process.env.AETHERION_INCLUDE_REVIEWS==='1',three:THREE.REVISION,scope:'Actual Three.js GLTFLoader CPU import, finite geometry/material values, sampled animation matrices, geometry/material disposal. No image decoding, rendering, visual parity or authored-animation approval.',summary:{files:records.length,pass:records.filter(r=>r.status==='PASS_CPU_ONLY').length,fail:records.filter(r=>r.status==='FAIL').length},manifests,records};
if(process.argv[2])await fs.writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(process.argv[2]?report.summary:report,null,2));
