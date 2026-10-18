// Real WebGL evidence. Run against `npm --prefix game run dev` on a browser-capable host.
// node tools/qa/source-fidelity-browser.mjs http://127.0.0.1:5173 /tmp/aetherion-evidence
import { chromium } from '../../game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import { ABILITY_BY_ID } from '../../shared/abilities.js';
const [base='http://127.0.0.1:5173', output='/tmp/aetherion-evidence']=process.argv.slice(2);
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const capturedElements=new Set();
const report={created:new Date().toISOString(),url:base,rendered:true,errors:[],abilities:[]};
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto(`${base}/?q=low&offline=1`);
 await page.getByRole('button',{name:'Enter the Weave',exact:true}).click({timeout:120000});
 await page.locator('#ae-name').fill('Fidelity QA');
 await page.getByRole('button',{name:'Swear the Oath',exact:true}).click();
 await page.waitForFunction(()=>window.__aetherion?.actors?.player?.bodyUrl&&window.__aetherionUI?.state?.inGame,null,{timeout:120000});
 await page.screenshot({path:`${output}/world-desktop.png`});
 report.runtime=await page.evaluate(()=>({renderer:__aetherion.renderer.constructor.name,world:__aetherion.world.stats(),character:__aetherion.actors.player.bodyUrl,source:__aetherion.vfx.sourceStats}));
 for(const ab of Object.values(ABILITY_BY_ID)) {
  const result=await page.evaluate(async ab=>{
   const c=__aetherion, caster=c.actors.player;
   c.vfx.stopAll();
   const direction=caster.position.clone().sub(c.camera.position);direction.y=0;direction.normalize();
   const target=caster.position.clone().addScaledVector(direction,5);
   try {
    const handle=await c.vfx.castEffect(ab,{caster,target,pos:caster.position,element:ab.element});
    const startFrame=c.clock.frame;
    await new Promise((resolve,reject)=>{const end=performance.now()+15000;function check(){if(c.clock.frame>=startFrame+3)return resolve();if(performance.now()>end)return reject(Error('Renderer did not advance three frames'));requestAnimationFrame(check);}check();});
    return {id:ab.id,sourceId:handle?.sourceId,sourcePack:handle?.sourcePack,source:c.vfx.sourceStats,active:c.vfx.activeCount,handle:!!handle,...(handle?.sourceId!==ab.id?{error:'Effect did not use requested original source'}:{})};
   }catch(e){return {id:ab.id,error:e.message};}
  },ab);
  report.abilities.push(result);
  // Sample every element while executing all 150 casts, bounded for CI.
  if(!capturedElements.has(ab.element)){
   await page.screenshot({path:`${output}/ability-${ab.id.replaceAll('/','-')}.png`});
   capturedElements.add(ab.element);
  }
 }
 await page.evaluate(()=>__aetherion.vfx.stopAll());
 // Medium enables bloom and the scene-depth/refraction path.
 await page.goto(`${base}/?q=medium&offline=1`);
 await page.getByRole('button',{name:'Enter the Weave',exact:true}).click({timeout:120000});
 await page.locator('#ae-name').fill('Fidelity Medium');
 await page.getByRole('button',{name:'Swear the Oath',exact:true}).click();
 await page.waitForFunction(()=>window.__aetherionUI?.state?.inGame&&window.__aetherion?.clock?.frame>4,null,{timeout:120000});
 await page.screenshot({path:`${output}/world-medium-postprocessing.png`});
 report.medium=await page.evaluate(()=>({quality:__aetherion.quality.name,frames:__aetherion.clock.frame,source:__aetherion.vfx.sourceStats}));
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:`${output}/world-mobile.png`});
 report.mobile=await page.evaluate(()=>({viewport:innerWidth,body:document.body.scrollWidth,overflow:document.body.scrollWidth>innerWidth}));
 await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');
 if(report.errors.length||report.abilities.some(a=>a.error)||report.mobile.overflow)process.exitCode=1;
 console.log(JSON.stringify({tested:report.abilities.length,errors:report.errors,failures:report.abilities.filter(a=>a.error),mobile:report.mobile}));
} catch(error){report.errors.push(error.stack);throw error;} finally {await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');await browser.close();}
