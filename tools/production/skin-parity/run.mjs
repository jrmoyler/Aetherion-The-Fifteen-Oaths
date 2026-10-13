import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import validator from '../node_modules/gltf-validator/index.js';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../..');
const requested=process.argv[2]??'429dc57a1c9748d0e0835504d116bd9112c8dfd7';
if(!/^[0-9a-f]{7,40}$/.test(requested))throw new Error('Revision must be a hexadecimal commit ID');
const revision=execFileSync('git',['rev-parse',`${requested}^{commit}`],{cwd:repo,encoding:'utf8'}).trim();
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'aetherion-skin-parity-'));
const output=path.join(repo,'validation/production/skin-parity');fs.mkdirSync(output,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const show=p=>execFileSync('git',['show',`${revision}:${p}`],{cwd:repo,maxBuffer:128*1024*1024});
const targets=[['assets/production/oath-01/characters/manifest.json','kiln-ninja-ensemble-candidate','cast_release'],['assets/production/oath-04/weapons/manifest.json','tidal-tide-orb-staff','Tidal_tassel_sway'],['assets/production/oath-06/weapons/manifest.json','oath-06-folding-battle-fan','Fan_fold_open']];
const assets=[];
for(const [manifest,id,clip] of targets){
 const parsed=JSON.parse(show(manifest)),asset=parsed.assets.find(a=>a.id===id);if(!asset)throw new Error(`Missing ${id}`);
 const bytes=show(asset.files.glb),local=path.join(scratch,`${id}.glb`);fs.writeFileSync(local,bytes);
 const report=await validator.validateBytes(new Uint8Array(bytes),{uri:asset.files.glb,maxIssues:0,writeTimestamp:false});
 const codes={};for(const m of report.issues.messages)codes[m.code]=(codes[m.code]??0)+1;
 assets.push({id,sourcePath:asset.files.glb,path:local,clip,sha256:sha(bytes),byteLength:bytes.length,khronos:{errors:report.issues.numErrors,warnings:report.issues.numWarnings,issueCounts:codes}});
}
const inputs=path.join(scratch,'inputs.json');fs.writeFileSync(inputs,JSON.stringify({revision,assets},null,2));
fs.writeFileSync(path.join(scratch,'project.godot'),'config_version=5\n[application]\nconfig/name="Aetherion CPU skin parity"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
for(const dir of ['data','cache','config'])fs.mkdirSync(path.join(scratch,'xdg-'+dir));
const executions=[];
function run(command,args,env=process.env){
 const r=spawnSync(command,args,{cwd:repo,env,encoding:'utf8',maxBuffer:64*1024*1024,timeout:120000});
 executions.push({command:path.basename(command),args:args.map(a=>a.replaceAll(scratch,'<scratch>').replaceAll(repo,'<repo>')),exitCode:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.message??null});
 if(r.status!==0){fs.writeFileSync(path.join(output,'execution-failure.json'),JSON.stringify(executions,null,2));throw new Error(`${command} exited ${r.status}: ${r.stderr}`);}
}
run(process.execPath,[path.join(here,'three-evaluate.mjs'),inputs,path.join(scratch,'three.json')]);
run('godot',['--headless','--path',scratch,'--script',path.join(here,'godot-evaluate.gd'),'--',inputs,path.join(scratch,'godot.json')],{...process.env,XDG_DATA_HOME:path.join(scratch,'xdg-data'),XDG_CACHE_HOME:path.join(scratch,'xdg-cache'),XDG_CONFIG_HOME:path.join(scratch,'xdg-config')});
run('python3',[path.join(here,'compare.py'),path.join(scratch,'three.json'),path.join(scratch,'godot.json'),path.join(scratch,'comparison.json')]);
const report=JSON.parse(fs.readFileSync(path.join(scratch,'comparison.json')));
report.generatedAt=new Date().toISOString();report.sourceRevision=revision;
report.inputs=JSON.parse(fs.readFileSync(inputs)).assets.map(({path:local,...asset})=>{if(sha(fs.readFileSync(local))!==asset.sha256||sha(show(asset.sourcePath))!==asset.sha256)throw new Error('Snapshot hash drift');return asset;});
report.tools={three:JSON.parse(fs.readFileSync(path.join(scratch,'three.json'))).threeVersion,godot:JSON.parse(fs.readFileSync(path.join(scratch,'godot.json'))).godotVersion,node:process.version,khronos:validator.version()};
report.evidence={};
for(const engine of ['three','godot']){const bytes=gzipSync(fs.readFileSync(path.join(scratch,engine+'.json')),{level:9});const name=engine+'-vertices.json.gz';fs.writeFileSync(path.join(output,name),bytes);report.evidence[engine]={file:name,sha256:sha(bytes),completeVertexDump:true};}
report.toolHashes=Object.fromEntries(['run.mjs','three-evaluate.mjs','godot-evaluate.gd','compare.py'].map(p=>[p,sha(fs.readFileSync(path.join(here,p)))]));
report.limitations=['Only three fixed published assets, rest and one clip midpoint each; not all assets/poses/LODs.','Godot results use explicit linear blend skinning from imported mesh arrays, Skin binds and Skeleton3D global poses. Native bake unavailable: headless RenderingServer has no valid skeleton RID.','Three.js texture loading is replaced with CPU Texture objects; no appearance, texture decode, normal/tangent or shader parity.','Normals, morph targets, attachments, retargeting, nonuniform runtime scaling, GPU skinning and Unreal are not certified.','Passing these samples does not dismiss NODE_SKINNED_MESH_NON_ROOT or generated-tangent warnings, and grants no production/art approval.'];
fs.writeFileSync(path.join(output,'SKIN_PARITY.json'),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(output,'executions.json'),JSON.stringify(executions,null,2)+'\n');
const lines=['# Scoped CPU skin comparison','',`Published revision: ${revision}. ${report.summary.passedPoses}/${report.summary.sampledPoses} sampled poses agree within ${report.tolerances.worldMeters}m; maximum difference ${report.summary.maximumWorldDifferenceMeters}m.`, '', '**This compares imported-data CPU weighted vertices. Native Godot RenderingServer/GPU skinning is not certified.**', '', '| Asset | Clip midpoint (s) | Skinned vertices | Max world error (m) | Moved skinned vertices (Three/Godot) |', '| --- | ---: | ---: | ---: | --- |',...report.records.map(r=>`| ${r.id} | ${r.timeSeconds} | ${r.phases.rest.skinnedVertexCount} | ${Math.max(...Object.values(r.phases).map(p=>p.maximumWorldDifferenceMeters))} | ${r.movement.three.movedSkinnedVertices}/${r.movement.godot.movedSkinnedVertices} |`),'',`All ${report.summary.negativeFixturesRejected} intentional +1cm world-translation fixtures were rejected. Coordinates remain identity-mapped XYZ meters with no fit or rescaling.`, '',...report.limitations.map(l=>'- '+l),'','[Full measurements, input hashes and evidence checksums](SKIN_PARITY.json). Complete rest/animated vertex samples are retained in the two gzip files. Reproduce using [the runner](../../../tools/production/skin-parity/README.md).',''];
fs.writeFileSync(path.join(output,'SKIN_PARITY.md'),lines.join('\n'));console.log(JSON.stringify(report.summary,null,2));
