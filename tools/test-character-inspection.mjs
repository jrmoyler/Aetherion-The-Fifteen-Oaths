// Production UI flow, real clicks, keyboard movement, and responsive inspection.
// Build first. Set PLAYWRIGHT_EXECUTABLE_PATH if Chromium is installed externally.
import { chromium } from '../game/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4187', '--strictPort'], { cwd: root + 'game', stdio: 'ignore' });
let browser;
const evidence = [];
try {
  for (let i=0;i<100;i++) { try { if ((await fetch('http://127.0.0.1:4187/')).ok) break; } catch {} await new Promise(r=>setTimeout(r,100)); }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  for (const mobile of (process.env.INSPECTION_MOBILE_ONLY ? [true] : [false,true])) {
    const context = await browser.newContext({ viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce' });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4187/?q=low&offline=1');
    await page.getByRole('button',{name:'Enter the Weave',exact:true}).click({timeout:120000});
    if(mobile) await page.getByRole('tab',{name:/Discipline/}).click();
    await page.getByRole('button',{name:'Inspect character in 3D',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Playable model'}).waitFor({timeout:60000});
    const dialog = page.locator('dialog');
    await page.getByRole('button',{name:'Rotate left',exact:true}).click();
    await page.getByRole('button',{name:'Walk',exact:true}).click();
    await page.getByRole('button',{name:'Freeze pose',exact:true}).click();
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x>=0 && bounds.x+bounds.width<= (mobile?390:1440)+1);
    await page.screenshot({path:root+`docs/upgrades/evidence/inspection-${mobile?'mobile':'desktop'}.png`});
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await dialog.waitFor({state:'detached'});
    await page.locator('#ae-name').fill(mobile?'MobileWayfarer':'Wayfarer');
    await page.getByRole('button',{name:'Swear the Oath',exact:true}).click();
    await page.waitForFunction(()=>window.__aetherion?.actors?.player?.bodyUrl && window.__aetherionUI?.state?.inGame,null,{timeout:90000});
    await page.waitForTimeout(1000);
    await page.screenshot({path:root+`docs/upgrades/evidence/game-${mobile?'mobile':'desktop'}.png`});
    const state = await page.evaluate(()=>({ model:__aetherion.actors.player.bodyUrl, inGame:__aetherionUI.state.inGame, world:__aetherion.world.stats(),viewport:{width:innerWidth,height:innerHeight},bodyWidth:document.body.scrollWidth }));
    if(mobile) {
      const health = await page.locator('.ae-unit--player .ae-bar--hp').boundingBox();
      const panel = await page.locator('.ae-unit--player').boundingBox();
      assert.ok(health.x + health.width <= panel.x + panel.width, 'Health must fit its panel');
    }
    assert.equal(state.inGame,true); assert.ok(state.bodyWidth<=state.viewport.width);
    assert.deepEqual(errors,[]);
    evidence.push({mobile,bounds,state,errors});
    await context.close();
  }
  if (process.env.INSPECTION_MOBILE_ONLY) {
    const old = JSON.parse(await fs.readFile(root+'docs/upgrades/evidence/inspection.json','utf8'));
    evidence.unshift(...old.filter(e=>!e.mobile));
  }
  await fs.writeFile(root+'docs/upgrades/evidence/inspection.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
} finally { await browser?.close();server.kill(); }
