import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Use a real layout engine: the regression involved the CSS cascade and absolute insets.
test('touch chat stays compact and expandable help panels never overlap', async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  try {
    const css = await readFile(new URL('../src/ui/ui.css', import.meta.url), 'utf8');
    const page = await browser.newPage({ isMobile: true, hasTouch: true });
    for (const [width, height] of [[390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
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
    }
  } finally { await browser.close(); }
});

test('expanded guidance leaves both ends of the landscape hotbar reachable', async () => {
  const styles = await Promise.all(['ui', 'game-shell', 'onboarding'].map(name =>
    readFile(new URL(`../src/ui/${name}.css`, import.meta.url), 'utf8')));
  const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
  try {
    const page = await browser.newPage({ hasTouch: true });
    for (const [width,height] of [[800,450],[1280,800]]) {
      await page.setViewportSize({ width, height });
      const slots = Array.from({length:6}, (_,i) => `<button class="ae-slot">${i+1}</button>`).join('');
      await page.setContent(`<style>${styles.join('\n')}</style><div id="ui"><div class="ae-hud">
        <div class="ae-actionbar ae-panel ae-int"><small class="ae-actionbar__covenant">Covenant</small><div class="ae-hotrow">
          <div class="ae-hotbar">${slots}</div><div class="ae-belt"><button class="ae-slot ae-belt__slot">Use</button></div>
        </div><div class="ae-xpbar"><div class="ae-bar"></div><div class="ae-xpbar__lbl">Experience</div></div></div>
        <aside class="ae-guide ae-onboarding"><button class="ae-guide__head">Prologue</button>
          <div class="ae-guide__body">${'<p>Reach the sanctuary and speak to the guide.</p>'.repeat(12)}</div></aside>
        <div class="ae-quests"><button class="ae-quests__head">Covenant Tasks</button>
          <div class="ae-objective">Speak with your guide</div>${'<div class="ae-quest">Reach the sanctuary.</div>'.repeat(12)}</div>
        </div></div>`);
      if (width === 800) {
        const bar = await page.locator('.ae-actionbar').boundingBox();
        for (const selector of ['.ae-guide','.ae-quests']) {
          const panel = page.locator(selector);
          const box = await panel.boundingBox();
          assert.ok(box.y + box.height < bar.y, `${selector} ${JSON.stringify(box)} overlaps hotbar ${JSON.stringify(bar)}`);
          assert.ok(await panel.evaluate(el => el.scrollHeight > el.clientHeight));
        }
        for (const slot of [page.locator('.ae-slot').first(), page.locator('.ae-slot').last()]) await slot.tap({timeout:1500});
        await page.locator('.ae-quests').evaluate(el => el.classList.add('is-collapsed'));
        assert.equal(await page.locator('.ae-objective').isVisible(), false);
      } else {
        assert.equal(await page.locator('.ae-quests').evaluate(el => getComputedStyle(el).maxHeight), 'none');
        assert.equal(await page.locator('.ae-guide__head').evaluate(el => getComputedStyle(el).position), 'static');
      }
    }
  } finally { await browser.close(); }
});
