import assert from 'node:assert/strict';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../', import.meta.url));
const filename = `stage-test-${process.pid}.html`;
let server, browser;
try {
 const index = await readFile(`${root}index.html`, 'utf8');
 const styles = [...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
 await writeFile(`${root}${filename}`, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="ui"></div><script type="module">import './src/ui/ui.css';import {createCharacterScreen} from './src/ui/create.js';createCharacterScreen(document.querySelector('#ui')).open().then(c=>window.selectedCharacter=c);</script></body></html>`);
 server = await createServer({ root, configFile:`${root}vite.config.js`, server:{host:'127.0.0.1',port:0} }); await server.listen();
 browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/tmp/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const evidence = process.env.AETHERION_EVIDENCE || '/tmp/oath-stage-evidence'; await mkdir(evidence,{recursive:true});
 for (const [width,height] of [[1440,900],[390,844],[320,568]]) {
  const page=await browser.newPage({viewport:{width,height},isMobile:width<500,hasTouch:width<500}); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${filename}`);
  const stage=page.locator('.ae-oath-stage');
  await stage.locator('canvas').waitFor();
  for (const oath of ['oath-01','oath-04']) {
   await page.locator(`.ae-oath-card[data-oath="${oath}"]`).click();
   await page.waitForFunction(o=>{const s=document.querySelector('.ae-oath-stage');return s?.dataset.status==='ready'&&s.dataset.model===`./assets/characters/${o}-ninja.glb`;},oath,{timeout:60000});
  }
  if(width<500) await page.getByRole('tab',{name:'03 Discipline'}).click();
  await page.locator('.ae-cls-card[data-cls="sorcerer"]').click();
  await page.waitForFunction(()=>document.querySelector('.ae-oath-stage')?.dataset.model==='./assets/characters/oath-04-sorcerer.glb',{},{timeout:60000});
  await stage.getByRole('button',{name:'Rotate character right'}).click(); await stage.getByRole('button',{name:'Try stance'}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const box=await stage.boundingBox(); assert.ok(box.height>=140&&box.width<=width);
  await page.screenshot({path:`${evidence}/oath-selection-${width}.png`});
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}x${height}: live fire/water and ninja/sorcerer model changes, rotation, stance, no overflow/errors`);
  await page.close();
 }
}finally{await browser?.close();await server?.close();await unlink(`${root}${filename}`).catch(()=>{});}
