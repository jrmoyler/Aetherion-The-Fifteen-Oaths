/** Local HTTP smoke only. Does not launch a browser or claim WebGL rendering. */
import {createServer} from '../../runtime/ability-matrix/node_modules/vite/dist/node/index.js';
import config from '../../app/abilities/vite.config.mjs';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const server=await createServer({...config,configFile:false,server:{...config.server,port:0}});
let report;
try {
 await server.listen();
 const address=server.httpServer.address();const base=`http://127.0.0.1:${address.port}`;
 const index=await fetch(base+'/',{signal:AbortSignal.timeout(10000)});assert.equal(index.status,200);const html=await index.text();assert.ok(html.includes('castable-select'));
 const entry=await fetch(base+'/main.js',{signal:AbortSignal.timeout(10000)});assert.equal(entry.status,200);const js=await entry.text();assert.ok(js.includes('aetherionAbilities'));
 const image=await fetch(base+'/textures/cathedral/color.jpg',{signal:AbortSignal.timeout(10000)});assert.equal(image.status,200);const bytes=Buffer.from(await image.arrayBuffer());
 const original=fs.readFileSync(new URL('../../runtime/ability-matrix/packs/sandbox/public/textures/cathedral/color.jpg',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(original).digest('hex'));
 report={status:'passed',entryHttpStatus:index.status,moduleHttpStatus:entry.status,sourceTextureHttpStatus:image.status,sourceTextureByteIdentical:true,scope:'Same-executor Vite HTTP serving and transformed entry only; no browser boot or GPU execution.'};
} catch(error){report={status:'blocked-or-failed',error:error.stack,scope:'Same-executor HTTP smoke only.'};throw error;}
finally{await server.close();if(report){fs.writeFileSync(fileURLToPath(new URL('../../validation/aetherion-wrapper-dev-check.json',import.meta.url)),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}}

// Vite may leave optimizer worker handles after its server closes in this
// executor. This one-shot smoke process has no further work or open server.
process.exit(0);
