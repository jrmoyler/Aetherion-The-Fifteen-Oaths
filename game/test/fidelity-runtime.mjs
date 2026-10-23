import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
const out=new URL('../../validation/fidelity-pass/',import.meta.url).pathname;await mkdir(out,{recursive:true});
const server=await createServer({root:new URL('../',import.meta.url).pathname,server:{host:'127.0.0.1',port:0,hmr:false,watch:{ignored:['**/*']}}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/tmp/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],httpFailures=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)httpFailures.push(r.url())});
const result={viewport:{width:1280,height:800},quality:process.env.FIDELITY_QUALITY||'low',hardware:'Chromium SwiftShader software rasterizer; not Steam Deck hardware'};
try{
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?offline=1&q=${result.quality}&bots=0&oath=oath-01&cls=ninja&name=FidelityReview&nointro=1`);
 await page.waitForFunction(()=>window.__aetherion?.ui?.state?.inGame&&window.__aetherion?.actors?.player?.body?.groom,null,{timeout:120000});
 await page.waitForTimeout(1000);
 await page.screenshot({path:out+'gameplay-1280x800.png'});
 await page.evaluate(()=>{window.__motion=[];window.__motionActive=true;const c=window.__aetherion;const collect=()=>{if(!window.__motionActive)return;const a=c.actors.player.body;window.__motion.push({frame:c.clock.frame,action:a.animator.action,bone:a.sockets['hand.R'].getWorldPosition(a.root.position.clone()).toArray(),dt:c.clock.dt});requestAnimationFrame(collect)};collect()});
 await page.keyboard.press('Digit1');
 await page.waitForFunction(()=>window.__motion.some(s=>s.action?.startsWith('attack_')),null,{timeout:10000});
 await page.screenshot({path:out+'combat-strike.png',timeout:90000});
 await page.waitForFunction(()=>window.__motion.filter(s=>s.action?.startsWith('attack_')).length>=5,null,{timeout:15000});
 await page.waitForTimeout(1000);
 result.runtime=await page.evaluate(()=>{window.__motionActive=false;const c=window.__aetherion;return {motion:window.__motion,model:c.actors.player.bodyUrl,groom:c.actors.player.body.groom.key,drawCalls:c.renderer.info.render.calls,triangles:c.renderer.info.render.triangles,world:c.world.stats(),geometry:c.renderer.info.memory.geometries,textures:c.renderer.info.memory.textures};});
 const attack=result.runtime.motion.filter(s=>s.action?.startsWith('attack_'));
 const positions=new Set(attack.map(s=>s.bone.map(v=>v.toFixed(4)).join(',')));
 assert.ok(positions.size>=3,'Actual keyboard attack must move the hand through distinct skeletal poses');
 assert.deepEqual(errors,[]);assert.deepEqual(httpFailures,[]);result.status='passed';
}catch(e){result.status='failed';result.error=e.stack;process.exitCode=1;await page.screenshot({path:out+'runtime-failure.png'}).catch(()=>{});}
finally{result.errors=errors;result.httpFailures=httpFailures;await writeFile(out+'runtime.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,runtime:result.runtime?{...result.runtime,motion:`${result.runtime.motion.length} samples`}:null}));await browser.close();await server.close();}
