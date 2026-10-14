/** Capture bounded preview evidence; detect concurrent artist writes honestly. */
import fs from 'node:fs';
import {collectRuntimeAssets} from '../runtime-assets.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const app=fileURLToPath(new URL('../',import.meta.url));
const production=fileURLToPath(new URL('../../../assets/production/',import.meta.url));
const out=path.join(app,'validation');fs.mkdirSync(out,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const commands=[
 ['unit-tests.log',['test']],
 ['asset-import.log',['run','test:assets','--','validation/asset-import-cpu.json']],
 ['build.log',['run','build']],
 ['http-development.log',['run','test:http']],
 ['http-built.log',['run','test:http:build']]
];
const referenceInputs=collectRuntimeAssets(production).references.map(reference=>{const bytes=fs.readFileSync(path.resolve(production,'../..',reference.sourcePath));return {path:reference.sourcePath,sha256:sha(bytes),bytes:bytes.length};});
const previewInputsBefore=inputs(app);
const results=[];
for(const [log,args] of commands){
 const result=spawnSync('npm',args,{cwd:app,encoding:'utf8',timeout:180000,maxBuffer:20*1024*1024});
 fs.writeFileSync(path.join(out,log),(result.stdout||'')+(result.stderr||'')+(result.error?.stack||''));
 results.push({command:`npm ${args.join(' ')}`,exitCode:result.status,error:result.error?.message});
 if(result.status!==0){console.error(`Failed: ${results.at(-1).command}. See validation/${log}`);process.exit(1);}
}
const report=JSON.parse(fs.readFileSync(path.join(out,'asset-import-cpu.json')));
const source=[...report.manifests,...report.records].map(entry=>{
 const sourcePath=entry.sourcePath||`assets/production/${entry.path}`;
 const current=fs.readFileSync(path.resolve(production,'../..',sourcePath));
 return {path:sourcePath,sha256:entry.sha256,bytes:entry.bytes,currentSha256:sha(current),unchangedAfterChecks:sha(current)===entry.sha256};
});
source.push(...referenceInputs.map(entry=>{const currentSha256=sha(fs.readFileSync(path.resolve(production,'../..',entry.path)));return {...entry,currentSha256,unchangedAfterChecks:currentSha256===entry.sha256};}));
function inputs(directory,relative=''){
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  if(['node_modules','dist','validation','VALIDATION.md'].includes(entry.name))return [];
  const name=path.posix.join(relative,entry.name),file=path.join(directory,entry.name);
  if(entry.isDirectory())return inputs(file,name);
  if(!entry.isFile())return [];
  const bytes=fs.readFileSync(file);return [{path:name,sha256:sha(bytes),bytes:bytes.length}];
 }).sort((a,b)=>a.path.localeCompare(b.path));
}
const http={};for(const [mode,log] of [['development','http-development.log'],['built','http-built.log']])http[mode]=JSON.parse(fs.readFileSync(path.join(out,log),'utf8').split('\n').find(line=>line.startsWith('{')));
const previewInputsAfter=inputs(app);
const previewBeforeMap=new Map(previewInputsBefore.map(entry=>[entry.path,entry]));
const previewAfterMap=new Map(previewInputsAfter.map(entry=>[entry.path,entry]));
const changedPreviewInputs=[...new Set([...previewBeforeMap.keys(),...previewAfterMap.keys()])].filter(name=>previewBeforeMap.get(name)?.sha256!==previewAfterMap.get(name)?.sha256).map(name=>({path:name,before:previewBeforeMap.get(name)||null,after:previewAfterMap.get(name)||null}));
const changedAssets=source.filter(entry=>!entry.unchangedAfterChecks);
const changed=[...changedAssets,...changedPreviewInputs];
const snapshot={reviewMode:process.env.AETHERION_INCLUDE_REVIEWS==='1',generatedAt:new Date().toISOString(),scope:'Local bounded file snapshot while production authoring continues; not a final remote-head claim',status:changed.length?'STALE_CONCURRENT_INPUT_CHANGES':'PASS_AT_CAPTURE',commands:results,previewInputsBefore,previewInputs:previewInputsAfter,changedPreviewInputs,testedAssetInputs:source,cpuReportSha256:sha(fs.readFileSync(path.join(out,'asset-import-cpu.json'))),results:{CPU:report.summary,HTTP:http},logs:Object.fromEntries(commands.map(([log])=>[log,sha(fs.readFileSync(path.join(out,log)))]))};
const serialized=JSON.stringify(snapshot,null,2)+'\n';fs.writeFileSync(path.join(out,'snapshot.json'),serialized);
const stateCounts={};for(const record of report.records)stateCounts[record.state]=(stateCounts[record.state]||0)+1;
const unitLog=fs.readFileSync(path.join(out,'unit-tests.log'),'utf8');const passes=unitLog.match(/(?:ℹ|#) pass (\d+)/)?.[1]||'See unit log';
const markdown=[
 '# Preview validation snapshot','',
 `Captured **${snapshot.generatedAt}**. Status: **${snapshot.status}**. This is bounded local evidence; later exports and final remote head require another run.`,
 '',`[File hashes](validation/snapshot.json), snapshot SHA-256: \`${sha(serialized)}\`.`,
 '',`- Unit tests: **${passes} passed**.`,
 `- Actual Three.js GLTFLoader CPU checks: **${report.summary.pass}/${report.summary.files} GLB state/LOD records passed**, from **${report.manifests.length} manifests**.`,
 `- Development HTTP byte checks: **${http.development.glbsByteVerified} GLBs**. Built preview HTTP byte checks: **${http.built.glbsByteVerified} GLBs**.`,
 `- Original reference byte checks: **${http.development.referencesByteVerified || 0} development / ${http.built.referencesByteVerified || 0} built**.`,
 '- Production build passed; bundle size warnings are retained in the build log.',
 `- Tested inputs changed after capture: **${changed.length}**. ${changed.length?'Preview code or asset inputs changed during validation; this is not a matching tested-input snapshot. Rerun after changes finish.':'Preview code inputs are unchanged from before the checks; all tested GLBs, manifests and references match their captured hashes.'}`,
 '', '| Authored state | Tested GLB/LOD records |','|---|---:|',
 ...Object.entries(stateCounts).sort().map(([state,count])=>`| ${state} | ${count} |`),
 '', '## Reproduce', '', `Run \`npm ci\` then \`${snapshot.reviewMode?'AETHERION_INCLUDE_REVIEWS=1 ':''}npm run validate:snapshot\` from this directory after artists finish exporting. The recorder runs unit tests, actual GLTFLoader import/animation/disposal checks, a production build, development HTTP checks and built HTTP checks. It records file hashes and exits nonzero if a checked file changes before the end. Fresh pinned dependency installation was verified during this authoring session.`,
 '', '## Evidence and limits', '',
 '[CPU report](validation/asset-import-cpu.json) retains each GLB hash, state, LOD, clip counts, material checks and loader warnings. [Unit tests](validation/unit-tests.log), [build](validation/build.log), [development HTTP](validation/http-development.log) and [built HTTP](validation/http-built.log) preserve command output.',
 '', 'Optional damaged/stowed files do not inherit ready-state LODs. Separate manifest variants retain their original IDs and their own LODs. Source castable code remains unchanged.',
 '', 'Node does not decode browser image textures: texture decode is explicitly unverified and loader warnings remain visible. These are CPU/HTTP/build checks, with no browser/WebGL render, visual approval, gameplay integration, engine parity or target-device performance certification. No browser sandbox settings were changed.',''
].join('\n');fs.writeFileSync(path.join(app,'VALIDATION.md'),markdown);
console.log(JSON.stringify({status:snapshot.status,unitPasses:passes,cpu:report.summary,http,changedInputs:changed.length}));
if(changed.length)process.exitCode=1;
