import { readFile, readdir, mkdir, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import validator from 'gltf-validator';
import { inspectGlb } from './audit-glb.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = b => createHash('sha256').update(b).digest('hex');
const identity = () => [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function multiply(a,b) { const o=Array(16).fill(0); for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o; }
function transform(n) {
  if(n.matrix)return n.matrix;
  const [x,y,z,w]=n.rotation??[0,0,0,1],s=n.scale??[1,1,1],t=n.translation??[0,0,0];
  return [(1-2*y*y-2*z*z)*s[0],(2*x*y+2*z*w)*s[0],(2*x*z-2*y*w)*s[0],0,
    (2*x*y-2*z*w)*s[1],(1-2*x*x-2*z*z)*s[1],(2*y*z+2*x*w)*s[1],0,
    (2*x*z+2*y*w)*s[2],(2*y*z-2*x*w)*s[2],(1-2*x*x-2*y*y)*s[2],0,...t,1];
}
export function measureGlb(bytes) {
  const inventory=inspectGlb(bytes),c=inventory.chunks[0];
  const j=JSON.parse(bytes.subarray(c.offset,c.offset+c.byteLength).toString());
  const bin=inventory.chunks.find(c=>c.type===0x004e4942);
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  let triangles=0, meshInstances=0;
  const scene=j.scenes?.[j.scene??0];
  const visit=(index,parent,ancestors=new Set())=>{
    if(ancestors.has(index))throw new Error('Node hierarchy contains cycle');
    const n=j.nodes[index],m=multiply(parent,transform(n));
    if(n.mesh!==undefined) {
      meshInstances++;
      for(const p of j.meshes[n.mesh].primitives) {
        const a=j.accessors[p.attributes.POSITION],count=j.accessors[p.indices]?.count??a.count;
        const mode=p.mode??4;
        if(mode===4)triangles+=count/3;else if(mode===5||mode===6)triangles+=Math.max(0,count-2);
        else throw new Error(`Non-triangle primitive mode ${mode}`);
        if(a.componentType!==5126||a.type!=='VEC3'||a.sparse)throw new Error('Dimensions require dense FLOAT VEC3 POSITION accessors');
        const v=j.bufferViews[a.bufferView];
        if(!bin||v.buffer!==0)throw new Error('Dimensions require embedded position buffer');
        for(let i=0;i<a.count;i++) {
          const offset=bin.offset+(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??12);
          const xyz=[0,1,2].map(k=>bytes.readFloatLE(offset+k*4));
          for(let k=0;k<3;k++) { const value=m[k]*xyz[0]+m[4+k]*xyz[1]+m[8+k]*xyz[2]+m[12+k];bounds.min[k]=Math.min(bounds.min[k],value);bounds.max[k]=Math.max(bounds.max[k],value); }
        }
      }
    }
    for(const child of n.children??[])visit(child,m,new Set([...ancestors,index]));
  };
  for(const node of scene?.nodes??[])visit(node,identity());
  const dimensionsMeters=bounds.min.map((min,i)=>bounds.max[i]-min);
  if(!meshInstances||dimensionsMeters.some(n=>!Number.isFinite(n)||n<=0))throw new Error('No measurable nondegenerate scene geometry');
  return {inventory,json:j,triangles,meshInstances,dimensionsMeters,bounds};
}
export function compareDimensions(claim,actual,tolerance=0.002) {
  if(!Array.isArray(claim)||claim.length!==3||claim.some(n=>!Number.isFinite(n)||n<=0))return false;
  // Sorting permits Blender Z-up versus glTF Y-up permutation without hiding scale changes.
  return [...claim].sort((a,b)=>a-b).every((n,i)=>Math.abs(n-[...actual].sort((a,b)=>a-b)[i])<=Math.max(tolerance,n*0.005));
}
async function manifests(dir) { let out=[];for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await manifests(p));else if(e.name==='manifest.json')out.push(p);}return out; }
async function localFile(repo,p) {
  if(typeof p!=='string'||!p||path.isAbsolute(p))throw new Error('Expected repository-relative file path');
  const full=await realpath(path.resolve(repo,p));
  if(!full.startsWith(repo+path.sep))throw new Error('File path escapes repository');
  const bytes=await readFile(full);if(!bytes.length)throw new Error('Empty file');return bytes;
}
export async function productionPath(repo,value,base=repo) {
  if(typeof value!=='string'||!value||value.includes('\\')||path.isAbsolute(value)||value.split('/').includes('..'))throw new Error('Expected confined production repository-relative file path');
  const full=await realpath(path.resolve(base,value)),production=path.resolve(repo,'assets/production');
  if(!full.startsWith(production+path.sep))throw new Error('Production artifact escapes its root');
  return path.relative(repo,full).split(path.sep).join('/');
}
export async function resolveManifestAsset(asset,manifestPath,filePathBase='REPOSITORY_ROOT',repo=root) {
  if(!['REPOSITORY_ROOT','MANIFEST_DIRECTORY'].includes(filePathBase))throw new Error('Invalid filePathBase');
  const base=filePathBase==='MANIFEST_DIRECTORY'?path.dirname(manifestPath):repo,files={};
  for(const [key,value] of Object.entries(asset.files??{}))files[key]=Array.isArray(value)?await Promise.all(value.map(p=>productionPath(repo,p,base))):await productionPath(repo,value,base);
  return {...asset,files};
}
export function collisionPolicy(asset) {
  const policy=asset.collisionPolicy===undefined?{mode:'REQUIRED'}:asset.collisionPolicy,files=asset.files??{};
  if(!policy||Array.isArray(policy)||!['REQUIRED','NONE','PENDING'].includes(policy.mode))throw new Error('Invalid collision policy');
  if(policy.mode==='REQUIRED'&&typeof files.collision!=='string')throw new Error('Missing collision deliverable');
  if(policy.mode!=='REQUIRED') {
    if(typeof policy.reason!=='string'||!policy.reason.trim())throw new Error('Collision exemption/gap requires reason');
    if(Object.hasOwn(files,'collision'))throw new Error('Contradictory collision policy');
    if(policy.mode==='PENDING'&&(typeof policy.remainingGate!=='string'||!policy.remainingGate.trim()))throw new Error('Pending collision requires remaining gate');
  }
  return policy;
}
export async function validateCompressedSource(asset,bytes,repo=root) {
  if(!(bytes[0]===0x1f&&bytes[1]===0x8b)&&!(bytes.length>=4&&bytes.readUInt32LE(0)===0xfd2fb528))throw new Error('Not a compressed Blender source');
  const metadata=asset.sourceValidation;
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))throw new Error('Compressed Blender source requires import evidence');
  const reportPath=await productionPath(repo,metadata.report),reportBytes=await localFile(repo,reportPath),sha256=digest(reportBytes);
  if(metadata.reportSha256!==sha256)throw new Error('Blender import report hash mismatch');
  const report=JSON.parse(reportBytes);
  if(report.schemaVersion!==1||report.tool?.name!=='Blender'||typeof report.tool?.version!=='string'||!report.tool.version.trim())throw new Error('Invalid Blender import report tool/schema');
  if(!Array.isArray(report.reports)||report.reports.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw new Error('Invalid Blender import report records');
  const matches=report.reports.filter(r=>r.module===metadata.recordId);
  if(typeof metadata.recordId!=='string'||!metadata.recordId||matches.length!==1||matches[0].opened!==true||!Array.isArray(matches[0].errors)||matches[0].errors.length||matches[0].source_sha256!==digest(bytes))throw new Error('Blender source import evidence mismatch/failure');
  return {path:reportPath,bytes:reportBytes.length,sha256};
}
export async function validateAsset(asset,repo=root) {
  const errors=[],gates=[...new Set(asset.remainingGates??[])],files={},exports={};
  const error=(code,message)=>errors.push({code,message});
  let policy={mode:'REQUIRED'};
  try {policy=collisionPolicy(asset);if(policy.mode==='PENDING')gates.push(policy.remainingGate);}catch(e){error('COLLISION_POLICY',e.message);}
  for(const key of ['id','name','type','status'])if(typeof asset[key]!=='string'||!asset[key])error('MANIFEST_FIELD',`Missing ${key}`);
  if(!Array.isArray(asset.remainingGates))error('MANIFEST_FIELD','remainingGates must be an array');
  const additionalFiles=Object.entries(asset.files??{}).filter(([k,v])=>!['blend','glb','lod1','lod2','collision'].includes(k)&&typeof v==='string');
  const requested=[...['blend','glb','lod1','lod2',...(policy.mode==='REQUIRED'?['collision']:[])].map(k=>[k,asset.files?.[k]]),...additionalFiles,...['textures','renders'].flatMap(k=>(asset.files?.[k]??[]).map((p,i)=>[`${k}/${i}`,p]))];
  for(const key of ['textures','renders'])if(!Array.isArray(asset.files?.[key])||!asset.files[key].length)error('MISSING_DELIVERABLE',`No ${key} files`);
  for(const [key,p] of requested) {
    try {
      const resolved=await productionPath(repo,p),bytes=await localFile(repo,resolved);files[key]={path:resolved,bytes:bytes.length,sha256:digest(bytes)};
      if(key==='blend'&&!bytes.subarray(0,7).equals(Buffer.from('BLENDER'))) {
        try {files.source_validation=await validateCompressedSource(asset,bytes,repo);}catch(e){error('BLEND_SOURCE_EVIDENCE',e.message);}
      }
      if(key.startsWith('textures/')||key.startsWith('renders/')||/\.(png|jpe?g)$/i.test(p)) {
        if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))files[key].image={format:'PNG',width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
        else if(bytes[0]===255&&bytes[1]===216)files[key].image={format:'JPEG',dimensions:'NOT_MEASURED'};
        else error('IMAGE_SIGNATURE',`Unrecognized image signature: ${p}`);
      }
      if(typeof p==='string'&&p.endsWith('.glb')) {
        const report=await validator.validateBytes(new Uint8Array(bytes),{uri:p,format:'glb',maxIssues:0,writeTimestamp:false,
          externalResourceFunction:async uri=>localFile(repo,path.relative(repo,path.resolve(repo,path.dirname(p),decodeURIComponent(uri))))});
        const measured=measureGlb(bytes),{json:j,inventory,...geometry}=measured;
        exports[key]={...geometry,counts:inventory.counts,primitives:inventory.primitives,materials:inventory.materials,skins:inventory.skins,animations:inventory.animations,validator:report};
        if(report.issues.numErrors)error('KHRONOS_ERRORS',`${key}: ${report.issues.numErrors} errors`);
        exports[key].embeddedImages=(j.images??[]).map((im,index)=>{
          if(im.bufferView===undefined)return {index,uri:im.uri,embedded:false};
          const bv=j.bufferViews[im.bufferView],bin=inventory.chunks.find(c=>c.type===0x004e4942);
          const content=bytes.subarray(bin.offset+(bv.byteOffset??0),bin.offset+(bv.byteOffset??0)+bv.byteLength);
          const png=content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
          return {index,mimeType:im.mimeType,embedded:true,bytes:content.length,sha256:digest(content),...(png?{width:content.readUInt32BE(16),height:content.readUInt32BE(20)}:{})};
        });
        if(key!=='collision') {
          exports[key].uvRanges=[];
          for(const [meshIndex,mesh] of (j.meshes??[]).entries())for(const [primitiveIndex,p] of mesh.primitives.entries()) {
            const accessor=j.accessors[p.attributes.TEXCOORD_0];
            if(!accessor)continue;
            if(accessor.componentType!==5126||accessor.type!=='VEC2'||accessor.sparse) {gates.push(`UV_CONTENT_NOT_MEASURED:${key}:${meshIndex}:${primitiveIndex}`);continue;}
            const bv=j.bufferViews[accessor.bufferView],bin=inventory.chunks.find(c=>c.type===0x004e4942),min=[Infinity,Infinity],max=[-Infinity,-Infinity];
            for(let n=0;n<accessor.count;n++)for(let k=0;k<2;k++) {const value=bytes.readFloatLE(bin.offset+(bv.byteOffset??0)+(accessor.byteOffset??0)+n*(bv.byteStride??8)+k*4);min[k]=Math.min(min[k],value);max[k]=Math.max(max[k],value);}
            exports[key].uvRanges.push({mesh:meshIndex,primitive:primitiveIndex,min,max});
            if(max.some((v,k)=>v-min[k]<1e-8))error('DEGENERATE_UV',`${key} mesh ${meshIndex} primitive ${primitiveIndex} has collapsed UV axis`);
          }
          for(const p of inventory.primitives) {
            if(!p.attributes.includes('TEXCOORD_0'))error('MISSING_UV',`${key} mesh ${p.mesh} primitive ${p.primitive} lacks TEXCOORD_0`);
            if(p.material===null)error('MISSING_MATERIAL',`${key} primitive lacks material`);
          }
          if(!j.images?.length)error('MISSING_TEXTURE',`${key} contains no image resources`);
          for(const [i,m] of (j.materials??[]).entries()) {
            if(m.pbrMetallicRoughness?.baseColorTexture===undefined)gates.push(`UNTEXTURED_MATERIAL_REVIEW:${key}:${i}`);
          }
        }
        const claim=typeof asset.triangles==='number'&&key==='glb'?asset.triangles:asset.triangles?.[key];
        if(claim===undefined)gates.push(`TRIANGLE_METADATA_UNSPECIFIED:${key}`);
        else if(claim!==geometry.triangles)error('TRIANGLE_METADATA_MISMATCH',`${key}: claimed ${claim}, actual ${geometry.triangles}`);
      }
    } catch(e) {error('DELIVERABLE_READ_OR_PARSE',`${key} (${p??'missing'}): ${e.message}`);}
  }
  if(exports.glb) {
    if(!compareDimensions(asset.dimensionsMeters,exports.glb.dimensionsMeters))error('DIMENSIONS_METADATA_MISMATCH',`Claim ${JSON.stringify(asset.dimensionsMeters)}; glTF world dimensions ${JSON.stringify(exports.glb.dimensionsMeters)}`);
    for(const [low,high] of [['lod1','glb'],['lod2','lod1']])if(exports[low]&&exports[high]&&exports[low].triangles>=exports[high].triangles)error('LOD_NOT_REDUCED',`${low} must have fewer triangles than ${high}`);
    if(exports.collision&&exports.collision.triangles>exports.glb.triangles)error('COLLISION_TOO_COMPLEX','Collision exceeds render triangle count');
    const rigText=JSON.stringify(asset.rig??null).toLowerCase();
    const declaredBones=asset.rig?.bones??asset.rig?.boneCount;
    const claimsRig=((/(rigged|skinned|armature|weighted)/.test(rigText)&&!/(not|unrigged)/.test(rigText))||Number(declaredBones)>0);
    if(claimsRig&&!exports.glb.counts.skins)error('RIG_METADATA_MISMATCH','Claimed rig has no exported skin');
    if(claimsRig&&Number.isFinite(declaredBones)&&!exports.glb.skins.some(s=>s.joints===declaredBones))error('RIG_JOINT_COUNT_MISMATCH',`Claimed ${declaredBones} bones; exported joints ${exports.glb.skins.map(s=>s.joints)}`);
    if(/not_applicable/i.test(rigText)&&exports.glb.counts.skins)error('RIG_METADATA_MISMATCH','Static not-applicable rig claim has exported skins');
    if(asset.rig===undefined)error('RIG_METADATA_MISSING','Static assets should explicitly declare rig not applicable');
    if(!Array.isArray(asset.animations))error('ANIMATION_METADATA_MISSING','animations must be an array');
    else {
      const declaredNames=asset.animations.map(clip=>typeof clip==='string'?clip:clip.name);
      for(const clip of asset.animations) {
        const name=typeof clip==='string'?clip:clip.name,actual=exports.glb.animations.find(a=>a.name===name);
        if(!actual)error('ANIMATION_METADATA_MISMATCH',`Missing exported animation ${name}`);
        else if(typeof clip==='object') {
          const times=actual.samplers.flatMap(s=>s.timeMax??[]),start=actual.samplers.flatMap(s=>s.timeMin??[]);
          const duration=Math.max(...times)-Math.min(...start),claimed=clip.durationSeconds??(Number.isFinite(clip.frames)&&Number.isFinite(clip.fps)?(clip.frames-1)/clip.fps:null);
          if(claimed!==null&&Math.abs(duration-claimed)>0.002)error('ANIMATION_DURATION_MISMATCH',`${name}: claimed ${claimed}s, actual ${duration}s`);
        }
      }
      for(const clip of exports.glb.animations)if(!declaredNames.includes(clip.name))error('UNDECLARED_ANIMATION',`Unlisted exported animation ${clip.name}`);
    }
  }
  gates.push('VISUAL_REFERENCE_APPROVAL','BLENDER_SOURCE_OPEN_AND_REEXPORT','UNREAL_IMPORT_AND_RUNTIME','GODOT_IMPORT_AND_RUNTIME','THREEJS_RENDER_AND_DISPOSE','MEASURED_PERFORMANCE','COLLISION_GAMEPLAY_FIT');
  return {id:asset.id,name:asset.name,type:asset.type,declaredStatus:asset.status,status:errors.length?'HARD_ERRORS':policy.mode==='PENDING'?'CANDIDATE_INCOMPLETE_MISSING_REQUIRED_COLLISION':'STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN',collisionPolicy:policy,errors,remainingGates:[...new Set(gates)],files,exports};
}
export async function auditDeliverables() {
  let paths=[];try{paths=await manifests(path.join(root,'assets/production'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const records=[],manifestErrors=[],ids=new Set();
  const referenceIndex=JSON.parse(await readFile(path.join(root,'AETHERION_CANON/11_REFERENCE_SHEETS/REFERENCE_INDEX.json'))).records;
  const familyIds=new Set(JSON.parse(await readFile(path.join(root,'AETHERION_CANON/10_ASSET_REGISTRY/MASTER_ASSET_REGISTRY.json'))).records.map(r=>r.id));
  for(const p of paths) {
    try {
      const bytes=await readFile(p),m=JSON.parse(bytes),rel=path.relative(root,p);
      if(m.schemaVersion!==1||typeof m.familyId!=='string'||!Array.isArray(m.referenceIds)||!Array.isArray(m.assets))throw new Error('Expected schemaVersion=1, familyId, referenceIds[], assets[]');
      if(!familyIds.has(m.familyId))manifestErrors.push({path:rel,message:`Unknown family ID ${m.familyId}`});
      const references=[];
      for(const id of m.referenceIds) {const ref=referenceIndex.find(r=>r.id===id);if(!ref)manifestErrors.push({path:rel,message:`Unknown reference ID ${id}`});else references.push({id,path:ref.repository_path,sha256:digest(await localFile(root,ref.repository_path))});}
      for(const a of m.assets) {if(ids.has(a.id))manifestErrors.push({path:rel,message:`Duplicate asset ID ${a.id}`});ids.add(a.id);records.push({manifest:rel,manifestSha256:digest(bytes),familyId:m.familyId,referenceIds:m.referenceIds,references,...await validateAsset(await resolveManifestAsset(a,p,m.filePathBase))});}
    }catch(e){manifestErrors.push({path:path.relative(root,p),message:e.message});}
  }
  for(const record of records) {
    for(const file of Object.values(record.files))if(digest(await localFile(root,file.path))!==file.sha256)record.errors.push({code:'CHANGED_DURING_AUDIT',message:file.path});
    if(digest(await localFile(root,record.manifest))!==record.manifestSha256)record.errors.push({code:'CHANGED_DURING_AUDIT',message:record.manifest});
    if(record.errors.length)record.status='HARD_ERRORS';
  }
  const result={schemaVersion:1,generatedAt:new Date().toISOString(),sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),validatorVersion:validator.version(),
    limitations:['Input file hashes identify this working-tree snapshot; sourceRevision records HEAD without asserting a clean checkout','Static structure and manifest integrity only; no visual approval or engine parity','Open gates are unevaluated by this audit; independent engine evidence must be reviewed separately','Dimensions compared with axis permutation and 0.5%/2mm tolerance; no unit metadata claim substitutes for vertices','Blend signature and image headers checked; actual Blender opening and texture decoding require separate engine evidence','Collision geometry existence/complexity checked, not hull convexity or gameplay fitness'],
    summary:{manifests:paths.length,assets:records.length,hardErrorAssets:records.filter(r=>r.errors.length).length,hardErrors:records.reduce((n,r)=>n+r.errors.length,0)+manifestErrors.length,structurallyPassed:records.filter(r=>r.status==='STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN').length,incompleteAssets:records.filter(r=>r.status==='CANDIDATE_INCOMPLETE_MISSING_REQUIRED_COLLISION').length,glbPaths:[...new Set(records.flatMap(r=>Object.values(r.files).filter(f=>f.path.endsWith('.glb')).map(f=>f.path)))].length,khronosErrors:records.flatMap(r=>Object.values(r.exports)).reduce((n,e)=>n+e.validator.issues.numErrors,0),khronosWarnings:records.flatMap(r=>Object.values(r.exports)).reduce((n,e)=>n+e.validator.issues.numWarnings,0),productionApproved:0},manifestErrors,records};
  const dir=path.join(root,'validation/production');await mkdir(dir,{recursive:true});
  const fullIssues=[];
  for(const r of records)for(const [key,ex] of Object.entries(r.exports)) {
    const issues=ex.validator.issues;fullIssues.push({assetId:r.id,export:key,path:r.files[key].path,sha256:r.files[key].sha256,issues:structuredClone(issues),primitives:ex.primitives,uvRanges:ex.uvRanges??[],animations:ex.animations});
    const grouped=new Map();for(const issue of issues.messages) {const k=`${issue.severity}:${issue.code}`;if(!grouped.has(k))grouped.set(k,{code:issue.code,severity:issue.severity,count:0,examples:[]});const g=grouped.get(k);g.count++;if(g.examples.length<3)g.examples.push(issue);}
    issues.byCode=[...grouped.values()];issues.messagesStoredIn='DELIVERABLE_AUDIT_DETAILS.json.gz';delete issues.messages;
    ex.primitiveSummary={count:ex.primitives.length,attributeSets:[...new Set(ex.primitives.map(p=>p.attributes.join(',')))],materialIndices:[...new Set(ex.primitives.map(p=>p.material))]};
    ex.uvSummary={measuredPrimitives:ex.uvRanges?.length??0,examples:(ex.uvRanges??[]).slice(0,3),completeRangesStoredIn:'DELIVERABLE_AUDIT_DETAILS.json.gz'};
    ex.animations=ex.animations.map(a=>({index:a.index,name:a.name,channels:a.channels,targetPaths:a.targetPaths,samplerCount:a.samplers.length,timeMin:Math.min(...a.samplers.flatMap(s=>s.timeMin??[])),timeMax:Math.max(...a.samplers.flatMap(s=>s.timeMax??[]))}));
    delete ex.primitives;delete ex.uvRanges;
  }
  const compressed=gzipSync(Buffer.from(JSON.stringify({validatorVersion:validator.version(),records:fullIssues})+'\n'),{level:9});
  await writeFile(path.join(dir,'DELIVERABLE_AUDIT_DETAILS.json.gz'),compressed);result.fullIssueEvidence={path:'DELIVERABLE_AUDIT_DETAILS.json.gz',sha256:digest(compressed),complete:true};
  await writeFile(path.join(dir,'DELIVERABLE_AUDIT.json'),JSON.stringify(result,null,2)+'\n');
  const lines=['# Candidate production deliverable audit','',`Generated ${result.generatedAt}; source revision ${result.sourceRevision}.`, '',`${result.summary.assets} candidate assets across ${paths.length} manifests: ${result.summary.structurallyPassed} pass these structural checks; ${result.summary.hardErrorAssets} have hard errors. Production approvals: 0. Khronos reports ${result.summary.khronosErrors} errors and ${result.summary.khronosWarnings} warnings; warnings remain recorded and are not engine-parity approval.`, '', '| Asset | Structural result | Errors | Open gates |','| --- | --- | ---: | ---: |',...records.map(r=>`| ${r.id} | ${r.status} | ${r.errors.length} | ${r.remainingGates.length} |`),'',...result.limitations.map(l=>`- ${l}`),'','Geometry summaries, file hashes, Khronos counts and example issues: [DELIVERABLE_AUDIT.json](DELIVERABLE_AUDIT.json).','','Run `npm --prefix tools/production run validate:deliverables`. All primitive inventories, UV ranges, animation sampler details and unsuppressed Khronos issues are stored losslessly in DELIVERABLE_AUDIT_DETAILS.json.gz with checksum in the JSON report. Hard errors produce exit 1. An empty production inventory produces exit 2; zero files never counts as passing.'];
  await writeFile(path.join(dir,'DELIVERABLE_AUDIT.md'),lines.join('\n')+'\n');console.log(JSON.stringify(result.summary,null,2));process.exitCode=result.summary.hardErrors?1:records.length?0:2;return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await auditDeliverables();
