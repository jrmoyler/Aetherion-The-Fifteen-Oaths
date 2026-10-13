/** Node-only manifest-derived shipping boundary. DCC sources never enter it. */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeManifest } from './catalog.mjs';
export function discoverManifests(directory,relative='') {
 if(!fs.existsSync(directory))return [];
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const name=path.posix.join(relative,entry.name);
  return entry.isDirectory()?discoverManifests(path.join(directory,entry.name),name):entry.isFile()&&entry.name==='manifest.json'?[name]:[];
 }).sort();
}
export function externalGLBDependencies(bytes) {
 if(bytes.length<20||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)throw new Error('Invalid GLB container');
 const end=20+bytes.readUInt32LE(12);if(end>bytes.length)throw new Error('Invalid GLB JSON length');
 const document=JSON.parse(bytes.toString('utf8',20,end));
 return [...new Set([...(document.images||[]),...(document.buffers||[])].flatMap(item=>item.uri&&!item.uri.startsWith('data:')?[item.uri]:[]))];
}
export function collectRuntimeAssets(directory) {
 const root=path.resolve(directory),rootReal=fs.realpathSync(root),manifests=discoverManifests(root),files=new Map();
 function add(relative){
  const full=path.resolve(root,relative);if(!full.startsWith(root+path.sep))throw new Error('Runtime asset escapes production root');
  const real=fs.realpathSync(full);if(!real.startsWith(rootReal+path.sep)||!fs.statSync(real).isFile())throw new Error('Invalid runtime asset target');
  files.set(relative,real);return real;
 }
 for(const manifest of manifests){
  const rows=normalizeManifest(JSON.parse(fs.readFileSync(add(manifest),'utf8')),manifest);
  for(const row of rows)for(const state of row.states)for(const lod of state.lods){
   const relative=decodeURIComponent(lod.url.replace('./production-assets/',''));
   const full=add(relative);
   for(const dependency of externalGLBDependencies(fs.readFileSync(full))){
    if(/^[a-z]+:/i.test(dependency)||dependency.startsWith('/')||dependency.includes('\\')||/[?#]/.test(dependency))throw new Error('External GLB dependency must be local');
    const decoded=decodeURIComponent(dependency);const name=path.posix.normalize(path.posix.join(path.posix.dirname(relative),decoded));
    if(!['.bin','.png','.jpg','.jpeg','.webp','.avif','.ktx2'].includes(path.posix.extname(name).toLowerCase()))throw new Error('External GLB dependency is not a runtime image/buffer');
    add(name);
   }
  }
 }
 return {manifests,files};
}
