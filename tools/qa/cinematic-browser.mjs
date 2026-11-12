// Real-client staged review, not a gameplay session or hardware benchmark.
// SOFTWARE_RENDER=1 node tools/qa/cinematic-browser.mjs URL OUTPUT
import { chromium } from '../../game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { terrainLocations } from './terrain-locations.mjs';
const [base='http://127.0.0.1:5173',out='docs/qa/cinematic/rendered']=process.argv.slice(2);
const tier=process.env.TERRAIN_TIER||'high',shard=Number(process.env.CAPTURE_SHARD||0),shards=Number(process.env.CAPTURE_SHARDS||1);
const locations=terrainLocations().filter((_,i)=>i%shards===shard);
const report={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),tier,shard,shards,expected:locations.length*4,hardwareValidation:false,visualAcceptance:'pending human review',captures:[],errors:[]};
await fs.mkdir(out,{recursive:true});
let browser;
try {
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:process.env.SOFTWARE_RENDER==='1'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 for(const row of locations){
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(`${row.id}: ${e.message}`));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(`${row.id}: ${m.text()}`);});
  page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
  const url=new URL(base);url.search=new URLSearchParams({oath:row.id,cls:'ninja',cinematic:'0',nointro:'1',offline:'1',q:tier});
  await page.goto(url.href,{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.__aetherion?.dispose,{timeout:180000});
  await page.evaluate(()=>{const c=window.__aetherion;c.net.setPaused(true);c.renderer.setAnimationLoop(null);c.render.setTimeScale(0);c.render.setWeather('clear',0);});
  for(const view of [{name:'sanctuary-day',hour:12,point:row.spawn},{name:'sanctuary-night',hour:0,point:row.spawn},{name:'hero',hour:16,point:row.spawn,hero:true},{name:'transition',hour:12,point:row.transitions[0]}]){
   const evidence=await page.evaluate(async view=>{
    const c=window.__aetherion,p=c.actors.player,v=view.point;
    p.controller.teleport(v.x,v.y,v.z);c.world.focus(v.x,v.z);
    while(c.world.stats().pending)await c.world.ready(v.x,v.z);
    c.world.update(0);c.render.setTimeOfDay(view.hour);
    // Settle fixed-time fixture fade without advancing simulation.
    for(let i=0;i<60;i++)c.architecture?.update(1/60);
    if(view.hero){const yaw=p.root.rotation.y;c.camera.position.set(v.x+Math.sin(yaw)*3.2,v.y+1.5,v.z+Math.cos(yaw)*3.2);c.camera.lookAt(v.x,v.y+1.1,v.z);}
    else {c.camera.position.set(v.x+38,v.y+23,v.z+46);c.camera.lookAt(v.x,v.y+2,v.z);}
    c.camera.updateMatrixWorld();c.scene.updateMatrixWorld(true);c.postprocessing.render(0,false);
    const gl=c.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),features:c.postprocessing.features,position:{x:v.x,y:v.y,z:v.z},camera:c.camera.position.toArray(),streaming:c.world.stats(),contextLost:gl.isContextLost()};
   },view);
   if(evidence.contextLost)throw new Error(`${row.id}: WebGL context lost`);
   const file=`${row.id}-${row.biome}-${tier}-${view.name}.png`;
   await page.screenshot({path:path.join(out,file),timeout:180000});
   report.captures.push({id:row.id,biome:row.biome,priority:row.priority,view:view.name,hour:view.hour,file,...evidence});
   await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
  await page.evaluate(()=>window.__aetherion.dispose());await page.close();
 }
 if(report.captures.length!==report.expected||report.errors.length)process.exitCode=1;
}catch(e){report.errors.push(e.message);process.exitCode=1;}
finally{await browser?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
