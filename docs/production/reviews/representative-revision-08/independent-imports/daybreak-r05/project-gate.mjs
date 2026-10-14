import fs from'node:fs';import path from'node:path';import{createHash}from'node:crypto';
import{resolveManifestAsset,validateAsset}from'/workspace/Aetherion-The-Fifteen-Oaths/tools/production/validate-deliverables.mjs';
const[root,mirror,out]=process.argv.slice(2),dest=path.join(mirror,'assets/production/oath-09/architecture'),m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));fs.mkdirSync(dest,{recursive:true});
function copy(rel){const to=path.join(dest,rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,rel),to);}
copy('manifest.json');copy('source-validation.json');for(const a of m.assets)for(const v of Object.values(a.files))for(const p of [v].flat())copy(p);
const rows=[];for(const a of m.assets)rows.push(await validateAsset(await resolveManifestAsset(a,path.join(dest,'manifest.json'),m.filePathBase,mirror),mirror));
fs.writeFileSync(out,JSON.stringify({manifestSha256:createHash('sha256').update(fs.readFileSync(path.join(root,'manifest.json'))).digest('hex'),scope:'Actual repository delivery validator against read-only final family copied into confined isolated repository layout; no global WIP audit',records:rows},null,2)+'\n');console.log(rows.map(r=>({id:r.id,status:r.status,errors:r.errors})));
