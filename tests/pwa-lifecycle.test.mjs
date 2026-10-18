import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function fixture() {
  const events = new Map();
  const media = { matches: false, addEventListener() {} };
  const navigator = { userAgent: 'Desktop', platform: 'Linux', maxTouchPoints: 0 };
  const context = vm.createContext({ navigator, matchMedia: () => media, addEventListener: (event, fn) => events.set(event, fn) });
  context.window = context;
  const source = await readFile(new URL('../game/src/ui/pwa.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace('export const pwa =', 'globalThis.pwa =').replace('export async function', 'async function'), context);
  return { pwa: context.pwa, events, media, navigator };
}

test('installation is consumed once and prompt rejection is handled', async () => {
  const { pwa, events } = await fixture();
  let notified = 0;
  const unsubscribe = pwa.onChange(() => notified++);
  assert.equal(pwa.available, false);
  let prompts = 0;
  events.get('beforeinstallprompt')({ preventDefault() {}, async prompt() { prompts++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  assert.equal(pwa.available, true);
  assert.equal(await pwa.prompt(), 'accepted');
  assert.equal(await pwa.prompt(), 'unavailable');
  assert.equal(prompts, 1);
  assert.equal(pwa.available, false);
  assert.equal(notified, 3);
  unsubscribe();
});

test('iPad install guidance disappears in installed mode', async () => {
  const { pwa, navigator, media, events } = await fixture();
  navigator.platform = 'MacIntel'; navigator.maxTouchPoints = 5;
  assert.equal(pwa.isIOS, true);
  assert.equal(pwa.available, true);
  media.matches = true;
  assert.equal(pwa.available, false);
  events.get('appinstalled')();
  assert.equal(pwa.canPrompt, false);
});

test('all advertised install icons exist and PNG dimensions match manifest', async () => {
  const base = new URL('../game/public/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', base)));
  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(icon.src, base));
    if (icon.type === 'image/png') {
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
    }
  }
});


test('prompt rejection is recoverable and a later browser event can retry', async () => {
  const { pwa, events } = await fixture();
  events.get('beforeinstallprompt')({ preventDefault() {}, async prompt() { throw new Error('denied'); } });
  assert.equal(await pwa.prompt(), 'error');
  assert.equal(pwa.canPrompt, false);
  events.get('beforeinstallprompt')({ preventDefault() {}, async prompt() {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  assert.equal(pwa.available, true);
  assert.equal(await pwa.prompt(), 'dismissed');
});

test('appinstalled hides iOS guidance even in the original browser tab', async () => {
  const { pwa, navigator, events } = await fixture();
  navigator.userAgent = 'iPhone';
  assert.equal(pwa.available, true);
  events.get('appinstalled')();
  assert.equal(pwa.available, false);
  events.get('beforeinstallprompt')({ preventDefault() {} });
  assert.equal(pwa.canPrompt, false);
});

test('install helpers tolerate browsers without matchMedia', async () => {
  const context = vm.createContext({ navigator: { userAgent: 'Desktop' }, addEventListener() {} });
  context.window = context;
  const source = await readFile(new URL('../game/src/ui/pwa.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace('export const pwa =', 'globalThis.pwa =').replace('export async function', 'async function'), context);
  assert.equal(context.pwa.available, false);
});
