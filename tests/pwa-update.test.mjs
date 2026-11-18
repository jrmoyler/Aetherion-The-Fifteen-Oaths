import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function fixture() {
  const notices = [];
  const events = new Map();
  let options;
  let activations = 0;
  const document = {
    visibilityState: 'visible',
    createElement(tag) {
      return { tag, children: [], style: {}, setAttribute() {}, append(child) { this.children.push(child); }, remove() { this.removed = true; } };
    },
    body: { append(notice) { notices.push(notice); } },
    addEventListener(name, handler) { events.set(name, handler); },
  };
  const context = vm.createContext({
    console, document, navigator: { serviceWorker: {}, onLine: true },
    window: { addEventListener(name, handler) { events.set(name, handler); }, setInterval() {} },
    registerSW(value) { options = value; return async () => { activations++; }; },
  });
  const source = (await readFile(new URL('../game/src/ui/pwa-register.js', import.meta.url), 'utf8'))
    .replace("import { registerSW } from 'virtual:pwa-register';", '')
    .replace('import.meta.env.PROD', 'true');
  vm.runInContext(source, context);
  return { options, notices, events, document, get activations() { return activations; } };
}

test('fresh offline install leaves the first-play screen unobstructed', async () => {
  const f = await fixture();
  f.options.onOfflineReady?.();
  assert.equal(f.notices.length, 0);
  assert.equal(f.activations, 0);
});

test('downloaded update waits for explicit restart and offline ready cannot hide it', async () => {
  const f = await fixture();
  f.options.onNeedRefresh();
  assert.equal(f.activations, 0);
  assert.equal(f.notices.length, 1);
  f.options.onOfflineReady?.();
  assert.equal(f.notices.length, 1);
  const notice = f.notices[0];
  assert.match(notice.children[0].textContent, /new version/);
  await notice.children[1].onclick();
  assert.equal(f.activations, 1);
});

test('resume and reconnect deduplicate concurrent worker checks', async () => {
  const f = await fixture();
  let checks = 0;
  let finish;
  f.options.onRegisteredSW('/sw.js', { update() { checks++; return new Promise(resolve => { finish = resolve; }); } });
  f.events.get('visibilitychange')();
  f.events.get('online')();
  assert.equal(checks, 1);
  finish();
  await Promise.resolve();
  f.events.get('online')();
  assert.equal(checks, 1);
  f.document.visibilityState = 'hidden';
  f.events.get('visibilitychange')();
  assert.equal(checks, 1);
});
