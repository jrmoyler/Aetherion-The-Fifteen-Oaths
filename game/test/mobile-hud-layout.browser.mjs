import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Use a real layout engine: the regression involved the CSS cascade and absolute insets.
test('touch chat stays compact and expandable help panels never overlap', async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  try {
    const css = await readFile(new URL('../src/ui/ui.css', import.meta.url), 'utf8');
    for (const [width, height] of [[390, 844], [844, 390]]) {
      const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true });
      await page.setContent(`<style>${css}</style><div id="ui" class="is-touch"><div class="ae-help-dock"><div class="ae-quests is-collapsed"><button class="ae-quests__head">Covenant Tasks</button><div class="ae-quest">Task details<br>Travel to the shrine</div></div><aside class="ae-guide"><button class="ae-guide__head">Field guide</button><div class="ae-guide__body" hidden>Movement instructions</div></aside></div><div class="ae-chat"><button class="ae-chat__open">Chat</button></div></div>`);
      const chat = await page.locator('.ae-chat').boundingBox();
      assert.ok(chat.height <= 50 && chat.width < 120, `${width}: chat should hug its button`);
      for (const expanded of [false, true]) {
        await page.evaluate(expand => { document.querySelector('.ae-quests').classList.toggle('is-collapsed', !expand); document.querySelector('.ae-guide__body').hidden = !expand; }, expanded);
        const quest = await page.locator('.ae-quests').boundingBox(), guide = await page.locator('.ae-guide').boundingBox();
        assert.ok(guide.y >= quest.y + quest.height, `${width}: quest and guide overlap`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});
