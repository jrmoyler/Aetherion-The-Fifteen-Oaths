/** Actual local Vite HTTP checks; no browser, rendering or parity inference. */
import { createServer, preview } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import config from '../vite.config.mjs';
import { normalizeManifest } from '../catalog.mjs';
const built=process.argv.includes('--built');
const server=built?await preview({...config,configFile:false,preview:{host:'127.0.0.1',port:0}}):await createServer({...config,configFile:false,server:{...config.server,port:0}});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let glbs=0;
try {
  if(!built)await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;
  const html=await fetch(base);assert.equal(html.status,200);const htmlText=await html.text();assert.match(htmlText,/Asset workshop/);
  const entry=built?htmlText.match(/<script[^>]+src="([^"]+)"/)[1]:'./main.mjs';
  const module=await fetch(new URL(entry,base+'/'));assert.equal(module.status,200);assert.ok((await module.text()).length>100);
  const response=await fetch(base+'/production-assets/catalog.json');assert.equal(response.status,200);const catalog=await response.json();
  for(const manifest of catalog.manifests){
    const response=await fetch(base+'/production-assets/'+manifest);assert.equal(response.status,200);
    const rows=normalizeManifest(await response.json(),manifest);
    for(const row of rows)for(const state of row.states)for(const lod of state.lods){
      const response=await fetch(base+lod.url.slice(1));assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());
      const relative=lod.url.replace('./production-assets/','');
      const source=await fs.readFile(new URL('../../../assets/production/'+relative,import.meta.url));
      assert.equal(sha(bytes),sha(source));assert.equal(bytes.subarray(0,4).toString(),'glTF');glbs++;
    }
  }
  if(!built){const escape=await fetch(base+'/production-assets/%2e%2e%2f%2e%2e%2fpackage.json');assert.equal(escape.status,404);}
  console.log(JSON.stringify({scope:'Local HTTP only; no browser/GPU',mode:built?'built':'development',status:'PASS',manifests:catalog.manifests.length,glbsByteVerified:glbs}));
} finally { if(built)await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));else await server.close(); }
