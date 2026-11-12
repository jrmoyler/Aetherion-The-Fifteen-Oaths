// node tools/qa/terrain-browser.mjs http://127.0.0.1:5173 docs/qa/all-realms/rendered
// CHROMIUM_PATH selects a system Chromium. SOFTWARE_RENDER=1 explicitly uses SwiftShader.
// Staged captures of the real client; not a full gameplay session or FPS benchmark.
import {chromium} from '../../game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {terrainLocations} from './terrain-locations.mjs';
const [base='http://127.0.0.1:5173',out='docs/qa/all-realms/rendered']=process.argv.slice(2);
await fs.mkdir(out,{recursive:true});
const report={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),kind:'staged real-client captures',hardwareValidation:false,visualAcceptance:'pending human inspection',captures:[],errors:[]};
let browser;
try {
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:process.env.SOFTWARE_RENDER==='1'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
 for(const row of terrainLocations()){
  const url=new URL(base);url.search=new URLSearchParams({oath:row.id,cls:'ninja',cinematic:'0',q:process.env.TERRAIN_TIER||'low'});
  await page.goto(url.href,{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.__aetherion?.dispose,{timeout:180000});
  await page.evaluate(()=>{const c=window.__aetherion;c.net.setPaused(true);c.renderer.setAnimationLoop(null);c.render.setTimeOfDay(12);c.render.setTimeScale(0);c.render.setWeather('clear',0);});
  for(const v of row.views){
   const evidence=await page.evaluate(async v=>{
    const c=window.__aetherion,p=c.actors.player;
    p.controller.teleport(v.x,v.y,v.z);c.world.focus(v.x,v.z);
    while(c.world.stats().pending)await c.world.ready(v.x,v.z);
    c.world.update(0);c.camera.position.set(v.x+55,v.y+32,v.z+65);c.camera.lookAt(v.x,v.y+1.5,v.z);c.camera.updateMatrixWorld();
    c.scene.updateMatrixWorld(true);c.postprocessing.render(0,false);
    const gl=c.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),tier:c.quality.name,position:{x:v.x,y:v.y,z:v.z},camera:c.camera.position.toArray(),streaming:c.world.stats(),drawCalls:c.renderer.info.render.calls,triangles:c.renderer.info.render.triangles};
   },v);
   const file=`${row.id}-${row.biome}-${v.name}.png`;await page.screenshot({path:path.join(out,file),timeout:180000});
   report.captures.push({id:row.id,biome:row.biome,priority:row.priority,file,...evidence});
   await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
 }
 if(report.captures.length!==45||report.errors.length)process.exitCode=1;
}catch(e){report.errors.push(e.message);process.exitCode=1;}finally{await browser?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
