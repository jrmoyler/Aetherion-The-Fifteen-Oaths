/** Run: node game/test/onboarding.browser.mjs
 * Requires Playwright Chromium (`npx playwright install chromium`), or
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE pointing to a compatible browser.
 * Isolates onboarding from WebGL/network so regressions have a precise cause.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../', import.meta.url));
const filename = `onboarding-test-${process.pid}.html`;
const filepath = `${root}${filename}`;
let server, browser;
try {
  const index = await readFile(`${root}index.html`, 'utf8');
  const styles = [...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  await writeFile(filepath, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="ui"></div><script type="module">import './src/ui/ui.css';import {createCharacterScreen} from './src/ui/create.js';createCharacterScreen(document.querySelector('#ui')).open().then(c=>window.selectedCharacter=c);</script></body></html>`);
  server = await createServer({ root, configFile:`${root}vite.config.js`, server:{host:'127.0.0.1',port:0} });
  await server.listen();
  const fallback = '/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell';
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(chromium.executablePath()) ? undefined : existsSync(fallback) ? fallback : undefined);
  browser = await chromium.launch({ headless:true, executablePath, args:['--no-sandbox'] });
  for (const [width,height] of [[390,844],[320,568],[1440,900]]) {
    const page = await browser.newPage({viewport:{width,height},isMobile:width<500,hasTouch:width<500});
    const errors=[];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${filename}`);
    await page.locator('.ae-oath-card[data-oath="oath-15"]').click();
    await page.locator('.ae-cc__nav button').last().click();
    if (width<500) {
      const session=await page.context().newCDPSession(page);
      const start=Math.min(650,height-120);
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width/2,y:start}]});
      for(let y=start-30;y>=160;y-=30){
        await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width/2,y}]});
        await page.waitForTimeout(20);
      }
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.ok(await page.locator('[data-pane="1"]').evaluate(el=>el.scrollTop)>0,'Native touch must scroll the covenant');
    }
    await page.locator('.ae-cc__nav button').last().click();
    await page.locator('#ae-name').fill('Aether Test');
    await page.getByRole('button',{name:'Swear the Oath',exact:true}).click();
    const result=await page.evaluate(()=>({character:window.selectedCharacter,svg:document.querySelectorAll('svg').length,overflow:document.documentElement.scrollWidth>innerWidth}));
    assert.deepEqual(result.character,{name:'Aether Test',oath:'oath-15',cls:'ninja'});
    assert.equal(result.svg,0,'Onboarding must contain no SVG');
    assert.equal(result.overflow,false,'No horizontal document overflow');
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}×${height}: selection, native scroll, submission, no SVG, no overflow`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server?.close();
  await unlink(filepath).catch(()=>{});
}
