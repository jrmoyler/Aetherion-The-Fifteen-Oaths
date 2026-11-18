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
  for (const [width,height,mobile] of [[390,844,true],[320,568,true],[844,390,true],[1440,900,false]]) {
    browser = await chromium.launch({ headless:true, executablePath, args:['--no-sandbox'] });
    const page = await browser.newPage({viewport:{width,height},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${filename}`);
    const oath = page.locator('.ae-oath-card[data-oath="oath-15"]');
    await (mobile ? oath.tap() : oath.click());
    if (mobile) {
      await page.getByRole('tab',{name:'Lore',exact:true}).tap();
      const pane = page.locator('[data-pane="1"]');
      const box = await pane.boundingBox();
      const session=await page.context().newCDPSession(page);
      const x = box.x + box.width / 2;
      const start = Math.floor(box.y + box.height - 12);
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start}]});
      for(let y=start-25;y>=box.y+16;y-=25){
        await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});
        await page.waitForTimeout(20);
      }
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      const { scrollTop, overflows } = await pane.evaluate(el=>({scrollTop:el.scrollTop,overflows:el.scrollHeight>el.clientHeight}));
      if (height <= 568) assert.ok(overflows,'Short viewports must exercise a scrollable lore pane');
      if (overflows) assert.ok(scrollTop>0,'Native touch must scroll the covenant');
      await page.getByRole('button',{name:'Back to oaths'}).tap();
      await page.getByRole('button',{name:'Choose fighting style'}).tap();
    }
    const name = page.getByRole('textbox',{name:'Hero name'});
    assert.equal(await name.inputValue(),'Wayfarer');
    if (!mobile) await name.fill('Aether Test');
    const confirm = page.getByRole('button',{name:'Enter the world',exact:true});
    const confirmBox = await confirm.boundingBox();
    assert.ok(confirmBox.y + confirmBox.height <= height,'Entry control is visible without scrolling');
    await (mobile ? confirm.tap() : confirm.click());
    const result=await page.evaluate(()=>({character:window.selectedCharacter,svg:document.querySelectorAll('svg').length,overflow:document.documentElement.scrollWidth>innerWidth}));
    assert.deepEqual(result.character,{name:mobile?'Wayfarer':'Aether Test',oath:'oath-15',cls:'ninja'});
    assert.equal(result.svg,0,'Onboarding must contain no SVG');
    assert.equal(result.overflow,false,'No horizontal document overflow');
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}×${height}: selection, native scroll, submission, no SVG, no overflow`);
    await browser.close();
  }
} finally {
  await browser?.close();
  await server?.close();
  await unlink(filepath).catch(()=>{});
}
