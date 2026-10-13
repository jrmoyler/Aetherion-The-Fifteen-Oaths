import fs from 'node:fs';
import{GLTFLoader}from '/workspace/Aetherion-The-Fifteen-Oaths/runtime/ability-matrix/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import{Texture}from '/workspace/Aetherion-The-Fifteen-Oaths/runtime/ability-matrix/node_modules/three/build/three.module.js';
const req=JSON.parse(fs.readFileSync(process.argv[2]));const out=[];
for(const path of req.glbs){
 const b=fs.readFileSync(path),loader=new GLTFLoader();loader.register(()=>({name:'CPU_TEXTURE_PLACEHOLDER',loadTexture:()=>Promise.resolve(new Texture())}));const g=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');const meshes=[];
 g.scene.traverse(n=>{if(!n.isMesh)return;const c=n.geometry.getAttribute('color'),values=c?Array.from({length:c.count},(_,i)=>Array.from({length:c.itemSize},(_,k)=>c.getComponent(i,k))):[];meshes.push({name:n.name,colorCount:c?.count??0,itemSize:c?.itemSize??0,normalized:c?.normalized??null,min:c?Array.from({length:c.itemSize},(_,k)=>Math.min(...values.map(v=>v[k]))):null,max:c?Array.from({length:c.itemSize},(_,k)=>Math.max(...values.map(v=>v[k]))):null,nonWhite:values.filter(v=>v.slice(0,3).some(x=>x<.999)).length,materialVertexColors:n.material.vertexColors,materialType:n.material.type,specularIntensity:n.material.specularIntensity??null});});out.push({path,meshes});
}
fs.writeFileSync(process.argv[3],JSON.stringify({scope:'Actual Three.js normalized COLOR_0 decode and material vertex-color usage; CPU only, no pixels',assets:out},null,2)+'\n');console.log(JSON.stringify(out));
