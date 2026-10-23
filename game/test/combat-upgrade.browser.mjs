/** Actual keyboard/mouse regression in the production Three.js runtime.
 * Starts Vite in-process; AETHERION_BASE_URL and PLAYWRIGHT_CHROMIUM_EXECUTABLE override defaults.
 * The only scenario setup is the supported offline spawn URL. Runtime state is read, never edited.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { buildCamps } from '../../shared/sim/world.js';
const out = fileURLToPath(new URL('../../validation/playable-upgrade/', import.meta.url));
await mkdir(out, {recursive:true});
const camp = buildCamps(15015).filter(c=>c.oath==='oath-01').sort((a,b)=>a.level-b.level)[0];
const server = await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{host:'127.0.0.1',port:0,hmr:false,watch:{ignored:['**/*']}}});
await server.listen();
const baseUrl = process.env.AETHERION_BASE_URL || `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/tmp/chromium', args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:800,height:600}});
const errors=[], failures=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400) failures.push(`${r.status()} ${r.url()}`);});
const result={scenario:{camp,spawn:{x:camp.x+24,z:camp.z},oath:'oath-01',cls:'sorcerer'},checks:{}};
try {
 await page.goto(`${baseUrl}/?offline=1&q=low&bots=0&oath=oath-01&cls=sorcerer&name=CombatReview&spawn=${camp.x+24},${camp.z}&nointro=1`);
 await page.waitForFunction(()=>window.__aetherion?.ui?.state?.inGame,null,{timeout:120000});
 console.log('combat: entered game');
 await page.evaluate(()=>{
   window.__combatEvidence=[];
   const c=window.__aetherion;
   c.bus.on('net:ev',e=>{if(['cast','hit','death','xp','loot','fail'].includes(e.type))window.__combatEvidence.push(JSON.parse(JSON.stringify(e)));});
 });

 await page.keyboard.press('Tab');
 await page.waitForFunction(()=>!!window.__aetherion.combat.target,null,{timeout:15000});
 console.log('combat: targeted');
 result.checks.keyboardTarget = await page.evaluate(()=>window.__aetherion.combat.target);
 result.targetBefore = await page.evaluate(()=>{const c=window.__aetherion,a=c.actors.get(c.combat.target);return {id:a.id,hp:a.hp,maxHp:a.mhp};});
 await page.keyboard.press('KeyR');
 await page.mouse.click(400,300);
 await page.waitForFunction(()=>document.pointerLockElement===document.querySelector('#game'),null,{timeout:10000});
 result.checks.pointerLock=true; console.log('combat: pointer locked');
 await page.mouse.down();
 await page.waitForTimeout(1200);
 for(const key of ['Digit2','Digit3','Digit4','Digit5']){
   await page.keyboard.press(key); await page.waitForTimeout(900);
 }
 result.checks.mouseHoldCastCount=await page.evaluate(()=>window.__combatEvidence.filter(e=>e.type==='cast'&&e.src===window.__aetherion.net.selfId&&e.slot===0).length);
 await page.mouse.up();
 await page.keyboard.down('Digit1');
 await page.waitForFunction(()=>window.__combatEvidence.some(e=>e.type==='death'&&e.id===window.__aetherion.net.selfId),null,{timeout:30000});
 await page.keyboard.up('Digit1');
 result.checks.playerDeath=true;

 await page.screenshot({path:`${out}/combat-death.png`});
 await page.getByRole('button',{name:'Return to the Shrine',exact:true}).click({timeout:15000});
 await page.waitForFunction(()=>window.__aetherion.net.you.hp>0 && window.__aetherion.actors.player.alive,null,{timeout:15000});
 result.checks.shrineRespawn=true;
 result.runtime=await page.evaluate(()=>{
   const c=window.__aetherion, events=window.__combatEvidence;
   return {self:c.net.selfId,hp:c.net.you.hp,level:c.net.you.lvl,xp:c.net.you.xp,frames:c.clock.frame,model:c.actors.player.bodyUrl,
    drawCalls:c.renderer.info.render.calls,triangles:c.renderer.info.render.triangles,
    casts:events.filter(e=>e.type==='cast'&&e.src===c.net.selfId).map(e=>({slot:e.slot,ability:e.ability})),
    hits:events.filter(e=>e.type==='hit'&&e.src===c.net.selfId).map(e=>({dst:e.dst,amount:e.amount})),
    deaths:events.filter(e=>e.type==='death'),rewards:events.filter(e=>e.type==='xp'||e.type==='loot'),failures:events.filter(e=>e.type==='fail')};
 });
 result.checks.enemyDefeated=result.runtime.deaths.some(e=>e.killer===result.runtime.self);
 result.checks.targetDamage=result.runtime.hits.filter(e=>e.dst===result.targetBefore.id).reduce((sum,e)=>sum+e.amount,0);
 assert.ok(result.runtime.casts.some(e=>e.slot>0),'Technique input reaches authoritative simulation');
 assert.ok(result.runtime.hits.length>0,'Attacks deal authoritative damage');
 assert.ok(result.runtime.hp>0,'Shrine restores player health');
 await page.screenshot({path:`${out}/combat-respawn.png`});
 assert.deepEqual(errors,[]); assert.deepEqual(failures,[]);
 result.status='passed';
} catch(error) {
 result.status='failed';result.error=error.stack;
 result.observed=await page.evaluate(()=>{const c=window.__aetherion;return {inGame:c?.ui?.state?.inGame, hp:c?.net?.you?.hp,target:c?.combat?.target,events:window.__combatEvidence,pos:c?.actors?.player?.position};}).catch(()=>null);
 await page.screenshot({path:`${out}/combat-failure.png`}).catch(()=>{});
 process.exitCode=1;
} finally {
 result.errors=errors;result.httpFailures=failures;
 await writeFile(`${out}/combat-results.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
 await browser.close();
 await server.close();
}
