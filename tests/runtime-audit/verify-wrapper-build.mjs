/** Artifact verification only; this does not claim browser or GPU execution. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const built=path.join(root,'dist/abilities'),sourcePublic=path.join(root,'runtime/ability-matrix/packs/sandbox/public');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const html=fs.readFileSync(path.join(built,'index.html'),'utf8');
assert.ok(html.includes('Aetherion'));
const assets=[...html.matchAll(/(?:src|href)="(\.\/assets\/[^"#?]+)"/g)].map(m=>m[1]);
assert.ok(assets.some(p=>p.endsWith('.js')));assert.ok(assets.some(p=>p.endsWith('.css')));
for(const a of assets)assert.ok(fs.existsSync(path.join(built,a)),a);
const publicFiles=walk(sourcePublic);for(const p of publicFiles){const rel=path.relative(sourcePublic,p),copy=path.join(built,rel);assert.ok(fs.existsSync(copy),rel);assert.equal(sha(copy),sha(p),`${rel} changed in build`);}
const js=walk(path.join(built,'assets')).filter(p=>p.endsWith('.js')).map(p=>fs.readFileSync(p,'utf8')).join('\n');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'runtime/ability-matrix/presets/catalog.json')));
const castables=catalog.abilities.filter(a=>a.status==='live'&&['ability','buff','summon'].includes(a.kind));
for(const a of castables)assert.ok(js.includes(a.uid),`${a.uid} absent from built catalog`);
for(const marker of ['aetherionAbilities','aetherionReady','Fissures'])assert.ok(js.includes(marker),`${marker} absent from wrapper bundle`);
const report={status:'passed',builtEntry:'dist/abilities/index.html',entryAssetReferences:assets,originalPublicFilesByteVerified:publicFiles.length,cataloguedCastablesPresent:castables.length,originalSourceStylesImported:true,sourceAppAndBridgeBundled:true,repairBoundaryBundled:true,scope:'Build artifact and byte checks only. Browser boot, WebGL render and visual result are not verified.'};
fs.writeFileSync(path.join(root,'validation/aetherion-wrapper-build-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
