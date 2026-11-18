import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Bus } from '../src/core/bus.js';

// Resolve Vite's alias and relative imports to exercise the actual local transport in Node.
const moduleURL = new URL('../src/net/index.js', import.meta.url);
const pathMap = {
  '@shared/protocol.js': new URL('../../../shared/protocol.js', moduleURL),
  './localServer.js': new URL('./localServer.js', moduleURL),
  './social.js': new URL('./social.js', moduleURL),
};
let source = await readFile(moduleURL, 'utf8');
for (const [path, url] of Object.entries(pathMap)) source = source.replace(`'${path}'`, JSON.stringify(url.href));
const { init } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const hero = { oath: 'oath-09', cls: 'ninja', name: 'First Traveler' };

test('the initial local save is available as soon as the world welcomes the hero', async () => {
  const saved = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  } });
  const bus = new Bus();
  const net = await init({ bus, params: new URLSearchParams('bots=0') });
  try {
    assert.equal(net.mode, 'offline');
    assert.equal(net.hasLocalSave(hero), false);
    const initial = await net.connect(hero);
    assert.equal(net.hasLocalSave(hero), true);
    assert.equal(JSON.parse(saved.get(`aeth.save.${initial.token}`)).campaignStep, 1);
  } finally {
    net.disconnect();
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('explicit server links default to online and still allow the Story button', async () => {
  const net = await init({ bus: new Bus(), params: new URLSearchParams('server=wss://realm.invalid/ws&bots=0') });
  assert.equal(net.mode, 'online');
  assert.equal(net.offerOnline, true);
  net.selectMode('offline');
  try {
    assert.equal(net.mode, 'offline');
    assert.match((await net.connect(hero)).you.quests[0].chapter, /Broken Ward/);
  } finally { net.disconnect(); }
});
