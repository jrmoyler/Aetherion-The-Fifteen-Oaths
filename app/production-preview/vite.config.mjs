import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverManifests, collectRuntimeAssets } from './runtime-assets.mjs';
import { appendReviewAssets } from './review-assets.mjs';
const root=fileURLToPath(new URL('./',import.meta.url));
const assets=path.resolve(fileURLToPath(new URL('../../assets/production/',import.meta.url)));
const outDir=path.join(root,'dist');
const repositoryRoot=path.resolve(root,'../..');
const includeReviews=process.env.AETHERION_INCLUDE_REVIEWS==='1';
function collect(){const catalog=collectRuntimeAssets(assets);return includeReviews?appendReviewAssets(catalog,repositoryRoot):catalog;}
let cached=null,signature=null,isBuild=false;
function runtime(){
 const manifests=discoverManifests(assets);
 const reviewStamp=includeReviews?fs.statSync(path.join(root,'review-manifest.json')).mtimeMs:'disabled';
 const next=reviewStamp+'|'+manifests.map(name=>{const stat=fs.statSync(path.join(assets,name));return `${name}:${stat.mtimeMs}:${stat.size}`;}).join('|');
 if(!cached||signature!==next){cached=collect();signature=next;}
 return cached;
}
const types={'.glb':'model/gltf-binary','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.ktx2':'image/ktx2'};
function middleware(getCatalog,getFile){return (req,res,next)=>{
 if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.end();return;}
 let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);}catch{res.statusCode=400;res.end();return;}
 try{
  const catalog=getCatalog();
  if(name==='catalog.json'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(req.method==='HEAD'?undefined:JSON.stringify(catalog));return;}
  if(!catalog.files.includes(name)){res.statusCode=404;res.end();return;}
  const file=getFile(name);if(!file||(!Buffer.isBuffer(file)&&!fs.existsSync(file))){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.setHeader('Content-Length',Buffer.isBuffer(file)?file.length:fs.statSync(file).size);
  if(req.method==='HEAD'){res.end();return;}if(Buffer.isBuffer(file)){res.end(file);return;}const stream=fs.createReadStream(file);stream.on('error',next);stream.pipe(res);
 }catch(error){next(error);}
};}
export default {
 root,base:'./',publicDir:false,
 server:{host:'127.0.0.1',port:5174,fs:{allow:[root]}},
 build:{outDir,target:'es2022',sourcemap:true},
 plugins:[{
  name:'manifest-runtime-assets',
  configResolved(config){isBuild=config.command==='build';},
  configureServer(server){server.middlewares.use('/production-assets',middleware(()=>({manifests:runtime().manifests,references:runtime().references,files:[...runtime().files.keys()].sort()}),name=>{const active=runtime();return active.reviewBuffers?.get(name)||active.files.get(name);}));},
  configurePreviewServer(server){
   const destination=path.join(outDir,'production-assets');
   server.middlewares.use('/production-assets',middleware(()=>JSON.parse(fs.readFileSync(path.join(destination,'catalog.json'),'utf8')),name=>path.join(destination,name)));
  },
  closeBundle(){
   if(!isBuild)return;
   const {manifests,files,references,reviewBuffers}=collect(),destination=path.join(outDir,'production-assets');
   fs.mkdirSync(destination,{recursive:true});
   for(const [name,source]of files){const target=path.join(destination,name);fs.mkdirSync(path.dirname(target),{recursive:true});if(reviewBuffers?.has(name))fs.writeFileSync(target,reviewBuffers.get(name));else fs.copyFileSync(source,target);}
   fs.writeFileSync(path.join(destination,'catalog.json'),JSON.stringify({manifests,references,files:[...files.keys()].sort()},null,2)+'\n');
  }
 }]
};
