import fs from 'node:fs';
import{GLTFLoader}from'/workspace/Aetherion-The-Fifteen-Oaths/runtime/ability-matrix/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import{Texture,Vector3}from'/workspace/Aetherion-The-Fifteen-Oaths/runtime/ability-matrix/node_modules/three/build/three.module.js';
const rows=[];
for(const name of ['civic','residential','work']){
 const path=`/tmp/aetherion-daybreak-architecture-r04/fixtures/${name}/assembly.glb`,bytes=fs.readFileSync(path),loader=new GLTFLoader();loader.register(()=>({name:'CPU_TEXTURE_PLACEHOLDER',loadTexture:()=>Promise.resolve(new Texture())}));const g=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');g.scene.updateMatrixWorld(true);const sockets=[];g.scene.traverse(n=>{if(n.name.startsWith('SOCKET__canopy-seat-'))sockets.push(n)});
 const pairs=sockets.map(a=>{const b=g.scene.getObjectByName(a.name.replace('canopy-seat-','pier-seat-'));if(!b)throw Error('missing partner '+a.name);const x=a.getWorldPosition(new Vector3()),y=b.getWorldPosition(new Vector3());return {name:a.name,partner:b.name,position:x.toArray(),gapMeters:x.distanceTo(y),negative15mmGapRejected:x.clone().add(new Vector3(.015,0,0)).distanceTo(y)>.005}});
 const passed=pairs.length>=4&&pairs.length%4===0&&pairs.every(p=>p.gapMeters<.00001&&p.negative15mmGapRejected);rows.push({fixture:name,pairs,alignedPairsPass:passed,expectedUniqueCornerPositions:4,actualNodePairs:pairs.length,uniqueCornerPositions:new Set(pairs.map(p=>JSON.stringify(p.position))).size,duplicateNodePairs:pairs.length-new Set(pairs.map(p=>JSON.stringify(p.position))).size,semanticAnchorCountPass:pairs.length===4});
}
fs.writeFileSync('/tmp/aetherion-daybreak-independent-checks/r04/exported-sockets.json',JSON.stringify({scope:'Actual GLTFLoader imported world positions of paired fixture attachment nodes, plus translated socket negative fixture; no joint strength/physics approval',reports:rows},null,2)+'\n');
