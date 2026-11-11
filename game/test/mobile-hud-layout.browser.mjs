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
      // The utility group owns the Chat button on touch, so the idle pill takes no space in the thumb zone.
      assert.equal(await page.locator('.ae-chat').isVisible(), false, `${width}: idle chat pill should be hidden on touch`);
      const landscape = width > height;
      for (const [questsOpen, guideOpen] of [[false, false], [true, false], [false, true], [true, true]]) {
        await page.evaluate(([q, g]) => { document.querySelector('.ae-quests').classList.toggle('is-collapsed', !q); document.querySelector('.ae-guide__body').hidden = !g; }, [questsOpen, guideOpen]);
        const quest = await page.locator('.ae-quests').boundingBox(), guide = await page.locator('.ae-guide').boundingBox();
        const state = `${width}: quests ${questsOpen ? 'open' : 'closed'}, guide ${guideOpen ? 'open' : 'closed'}`;
        assert.ok(quest || guide, `${state}: at least one help panel stays reachable`);
        if (quest && guide) assert.ok(guide.y >= quest.y + quest.height, `${state}: quest and guide overlap`);
        // A short landscape screen has room for one open body, not two.
        if (landscape && (questsOpen || guideOpen)) assert.ok(!(quest && guide), `${state}: only the open panel shows`);
        if (!landscape) assert.ok(quest && guide, `${state}: both panels show in portrait`);
        const dock = await page.locator('.ae-help-dock').boundingBox();
        if (landscape) assert.ok(dock.y + dock.height <= height - 150, `${state}: dock ends above the thumbstick`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});
