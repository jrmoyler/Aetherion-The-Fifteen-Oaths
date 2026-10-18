// CPU scene integrity coverage, explicitly NOT rendered visual parity evidence.
// Wait until the source adapter exists, then run: node tools/qa/source-fidelity-scene.mjs [report.json]
import { Scene,PerspectiveCamera,Vector3,Group } from '../../game/node_modules/three/build/three.module.js';
import { initVFX } from '../../game/src/three/vfx.js';
import { ABILITY_BY_ID } from '../../shared/abilities.js';
import fs from 'node:fs/promises';
import { GLTFLoader } from '../../game/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { buildSerpentGeometry } from '../../runtime/ability-matrix/packs/linear-extended/src/assets/SerpentGeometry.js';
const scene=new Scene(),camera=new PerspectiveCamera(50,1,.1,2000),updates=[];
const mob={id:'qa-mob',kind:'mob',alive:true,position:new Vector3(0,0,8),root:new Group(),playAnim(){}};
const ctx={scene,camera,actors:{entities:new Map([['qa-mob',mob]])},quality:{name:'low'},addUpdate(fn){updates.push(fn);return()=>{};}};
const serpentBytes=await fs.readFile(new URL('../../runtime/ability-matrix/packs/linear-extended/public/models/snake.glb',import.meta.url));
// CPU review uses original positions/indices; texture decoding requires the browser.
const jsonLength=serpentBytes.readUInt32LE(12),gltf=JSON.parse(serpentBytes.subarray(20,20+jsonLength).toString());
gltf.materials=[];gltf.textures=[];gltf.images=[];for(const mesh of gltf.meshes)for(const primitive of mesh.primitives)delete primitive.material;
const json=Buffer.from(JSON.stringify(gltf));const padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);const binary=serpentBytes.subarray(20+jsonLength);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+padded.length+binary.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);const geometryOnly=Buffer.concat([header,padded,binary]);
const serpent=await new GLTFLoader().parseAsync(geometryOnly.buffer.slice(geometryOnly.byteOffset,geometryOnly.byteOffset+geometryOnly.byteLength),'');
ctx.sourceModels={serpent:buildSerpentGeometry(serpent.scene,{ghosts:8})};
const vfx=await initVFX(ctx);
const report={created:new Date().toISOString(),rendered:false,kind:'CPU Three.js scene integrity, not appearance parity',abilities:[]};
for(const ab of Object.values(ABILITY_BY_ID)){
 vfx.stopAll();
 const caster={position:new Vector3(0,0,0),rotation:new Vector3(),yaw:0},target=new Vector3(0,0,8);
 let result={id:ab.id};
 try{
  const handle=await vfx.castEffect(ab,{caster,target,pos:caster.position,element:ab.element});
  for(let frame=0;frame<Number(process.env.QA_FRAMES||18);frame++)for(const tick of updates)tick(Number(process.env.QA_DT||1/60));
  let meshes=0,vertices=0,nonfinite=0;
  scene.traverse(object=>{if(object.isMesh||object.isPoints||object.isLine)meshes++;const positions=object.geometry?.attributes?.position;if(positions){vertices+=positions.count;for(const value of positions.array)if(!Number.isFinite(value))nonfinite++;}});
  result={...result,handle:!!handle,sourceId:handle?.sourceId,sourcePack:handle?.sourcePack,meshes,vertices,nonfinite,source:vfx.sourceStats};
  if(handle?.sourceId!==ab.id)result.error='Effect did not use the requested original source';
  if(nonfinite)result.error='Non-finite geometry coordinates';
  if(!handle)result.error='No effect handle';
  if(!meshes)result.error='No renderable scene objects';
  if(mob.position.z!==8||caster.position.lengthSq()!==0||target.z!==8)result.error='Cast mutated caller positions';
 }catch(error){result.error=error.stack;}
 report.abilities.push(result);
}
vfx.stopAll();
report.summary={total:report.abilities.length,failed:report.abilities.filter(a=>a.error).length};
const output=process.argv[2]||'/tmp/aetherion-source-scene-report.json';
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));for(const row of report.abilities.filter(a=>a.error))console.error(row.id,row.error);
if(report.summary.failed)process.exitCode=1;
