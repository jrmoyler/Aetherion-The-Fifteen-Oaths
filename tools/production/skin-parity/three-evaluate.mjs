import fs from 'node:fs';
import { GLTFLoader } from '../../../runtime/ability-matrix/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationMixer, Vector3, Texture } from '../../../runtime/ability-matrix/node_modules/three/build/three.module.js';
const input=JSON.parse(fs.readFileSync(process.argv[2]));
const output={threeVersion:'0.185.1',textureDecode:'stubbed for CPU geometry only',assets:[]};
function sample(scene){
 scene.updateMatrixWorld(true);const meshes=[];
 scene.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const positions=mesh.geometry.attributes.position,vertices=[];
  for(let i=0;i<positions.count;i++){
   const local=new Vector3().fromBufferAttribute(positions,i),world=local.clone(),weights=[];
   if(mesh.isSkinnedMesh){
    mesh.applyBoneTransform(i,world);
    for(let j=0;j<4;j++){
     const weight=mesh.geometry.attributes.skinWeight.getComponent(i,j);
     if(weight)weights.push([mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getComponent(i,j)].name,weight]);
    }
   }
   world.applyMatrix4(mesh.matrixWorld);vertices.push({local:local.toArray(),world:world.toArray(),weights});
  }
  meshes.push({node:mesh.name,skinned:!!mesh.isSkinnedMesh,surfaces:[{surface:0,vertices}]});
 });return meshes;
}
for(const asset of input.assets){
 const bytes=fs.readFileSync(asset.path),loader=new GLTFLoader();loader.register(()=>({name:'CPU_NO_TEXTURE_DECODE',loadTexture:()=>Promise.resolve(new Texture())}));
 const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const clip=gltf.animations.find(c=>c.name===asset.clip);if(!clip)throw new Error('Missing clip '+asset.clip);
 asset.time=clip.duration/2;
 const rest=sample(gltf.scene),mixer=new AnimationMixer(gltf.scene);mixer.clipAction(clip).play();mixer.setTime(asset.time);
 output.assets.push({id:asset.id,clip:clip.name,duration:clip.duration,time:asset.time,rest,animated:sample(gltf.scene)});
}
fs.writeFileSync(process.argv[3],JSON.stringify(output));fs.writeFileSync(process.argv[2],JSON.stringify(input,null,2));
