import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

test('mobile story, navigation and combat remain reachable in both orientations', async () => {
  const styles = await Promise.all(['ui', 'game-shell', 'onboarding', 'story-hud', 'touch'].map(name =>
    readFile(new URL(`../src/ui/${name}.css`, import.meta.url), 'utf8')));
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ isMobile: true, hasTouch: true });
    const actionClasses = ['slot-0','slot-1','slot-2','slot-3','slot-4','slot-5','jump','dodge','target','interact'];
    const actions = actionClasses.map(key => `<button class="ae-tbtn ae-tbtn--${key}">Action</button>`).join('');
    const cases = [
      { width: 320, height: 568, insets: [0, 0, 0, 0] },
      { width: 390, height: 844, insets: [47, 0, 34, 0] },
      { width: 568, height: 320, insets: [0, 0, 0, 0] },
      { width: 667, height: 375, insets: [0, 0, 0, 0] },
      { width: 844, height: 390, insets: [0, 17, 21, 47] },
      { width: 932, height: 430, insets: [0, 59, 21, 59] },
    ];
    for (const { width, height, insets: [top, right, bottom, left] } of cases) {
      await page.setViewportSize({ width, height });
      await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${styles.join('\n')}
        #ui{position:fixed;inset:0;pointer-events:none;--sat:${top}px;--sar:${right}px;--sab:${bottom}px;--sal:${left}px}</style>
        <div id="ui" class="is-touch">
          <div class="ae-touch"><div class="ae-touch__look"></div><div class="ae-touch__move"><div class="ae-joy"></div></div></div>
          <div class="ae-hud">
            <div class="ae-unit ae-unit--player"><div class="ae-portrait"></div><div>Player</div></div>
            <div class="ae-unit ae-unit--target"><div class="ae-portrait"></div><div>Target</div></div>
            <div class="ae-minimap"><div class="ae-minimap__view"></div></div>
            <div class="ae-help-dock">
              <button class="ae-story-objective"><span class="ae-story-objective__chapter">First Chapter</span><strong class="ae-story-objective__action">Reach the sanctuary</strong><span class="ae-story-objective__hint">Follow the gold marker and speak to the covenant guide.</span></button>
              <div class="ae-quests is-collapsed" hidden><button class="ae-quests__head">Covenant Tasks</button><div class="ae-quest">Task details</div></div>
              <aside class="ae-guide" hidden><button class="ae-guide__head">Field guide</button><div class="ae-guide__body">Movement instructions</div></aside>
            </div>
            <div class="ae-chat"><button class="ae-chat__open">Chat</button></div>
            <div class="ae-actionbar ae-panel"><div class="ae-hotrow"><div class="ae-belt"><button class="ae-belt__slot">HP</button><button class="ae-belt__slot">MP</button></div></div></div>
          </div>
          <div class="ae-touch-ui"><div class="ae-cluster">${actions}</div><div class="ae-touch__top">${'<button class="ae-iconbtn">Menu</button>'.repeat(4)}</div></div>
        </div>`);
      const state = `${width}×${height}`;
      assert.equal(await page.locator('.ae-chat').isVisible(), false, `${state}: idle chat should be hidden`);
      await page.locator('.ae-story-objective').tap({ timeout: 1500 });
      const buttons = page.locator('.ae-cluster button, .ae-touch__top button');
      for (const button of await buttons.all()) {
        const rect = await button.boundingBox();
        assert.ok(rect.width >= 44 && rect.height >= 44, `${state}: button undersized`);
        assert.ok(rect.x >= left && rect.x + rect.width <= width - right && rect.y >= top && rect.y + rect.height <= height - bottom, `${state}: button outside safe area`);
        await button.tap({ timeout: 1500 });
      }
      const move = await page.locator('.ae-touch__move').boundingBox();
      const dock = await page.locator('.ae-help-dock').boundingBox();
      assert.ok(dock.y + dock.height < move.y, `${state}: dock overlaps the movement pad`);
      await page.evaluate(() => {
        document.querySelector('.ae-story-objective').hidden = true;
        document.querySelector('.ae-quests').hidden = false;
        document.querySelector('.ae-quests').classList.remove('is-collapsed');
        document.querySelector('.ae-guide').hidden = false;
      });
      const quest = await page.locator('.ae-quests').boundingBox(), guide = await page.locator('.ae-guide').boundingBox();
      assert.ok(guide.y >= quest.y + quest.height, `${state}: expanded panels overlap`);
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
