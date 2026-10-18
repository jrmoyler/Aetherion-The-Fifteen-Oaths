// CPU scene integrity coverage, explicitly NOT rendered visual parity evidence.
// Wait until the source adapter exists, then run: node tools/qa/source-fidelity-scene.mjs [report.json]
import { Scene,PerspectiveCamera,Vector3 } from '../../game/node_modules/three/build/three.module.js';
import { initVFX } from '../../game/src/three/vfx.js';
import { ABILITY_BY_ID } from '../../shared/abilities.js';
import fs from 'node:fs/promises';
const scene=new Scene(),camera=new PerspectiveCamera(50,1,.1,2000),updates=[];
const ctx={scene,camera,quality:{name:'low'},addUpdate(fn){updates.push(fn);return()=>{};}};
const vfx=await initVFX(ctx);
const report={created:new Date().toISOString(),rendered:false,kind:'CPU Three.js scene integrity, not appearance parity',abilities:[]};
for(const ab of Object.values(ABILITY_BY_ID)){
 vfx.stopAll();
 const caster={position:new Vector3(0,0,0),rotation:new Vector3(),yaw:0},target=new Vector3(0,0,8);
 let result={id:ab.id};
 try{
  const handle=await vfx.castEffect(ab,{caster,target,pos:caster.position,element:ab.element});
  for(let frame=0;frame<18;frame++)for(const tick of updates)tick(1/60);
  let meshes=0,vertices=0,nonfinite=0;
  scene.traverse(object=>{if(object.isMesh||object.isPoints||object.isLine)meshes++;const positions=object.geometry?.attributes?.position;if(positions){vertices+=positions.count;for(const value of positions.array)if(!Number.isFinite(value))nonfinite++;}});
  result={...result,handle:!!handle,sourceId:handle?.sourceId,sourcePack:handle?.sourcePack,meshes,vertices,nonfinite,source:vfx.sourceStats};
  if(handle?.sourceId!==ab.id)result.error='Effect did not use the requested original source';
  if(nonfinite)result.error='Non-finite geometry coordinates';
  if(!handle)result.error='No effect handle';
  if(!meshes)result.error='No renderable scene objects';
  if(caster.position.lengthSq()!==0||target.z!==8)result.error='Cast mutated caller positions';
 }catch(error){result.error=error.stack;}
 report.abilities.push(result);
}
vfx.stopAll();
report.summary={total:report.abilities.length,failed:report.abilities.filter(a=>a.error).length};
const output=process.argv[2]||'/tmp/aetherion-source-scene-report.json';
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));for(const row of report.abilities.filter(a=>a.error))console.error(row.id,row.error);
if(report.summary.failed)process.exitCode=1;
