import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { NEW_PRESETS, createPresetRuntime } from '../presets/runtime.js';
import { createAtlasController, installAtlasBridge, installAtlasFailureBridge, validateSettings } from '../packs/atlas/src/bridge.js';

const first = NEW_PRESETS[0].id;
const second = NEW_PRESETS[1].id;
function fixture(options = {}) {
  const calls = [], updates = [], posts = [], states = [];
  let resets = 0, clears = 0, disposals = 0;
  const runtime = {
    cast(id, settings) { calls.push({ id, settings: structuredClone(settings) }); },
    update(dt) { updates.push(dt); },
    clear() { clears++; },
    dispose() { disposals++; }
  };
  const controller = createAtlasController({ runtime, post: (data) => posts.push(data),
    onReset: () => resets++, onState: (state) => states.push(state), ...options });
  return { controller, runtime, calls, updates, posts, states,
    get resets() { return resets; }, get clears() { return clears; }, get disposals() { return disposals; } };
}
function fakeWindow(search = '', embedded = true) {
  const listeners = new Map(), sent = [];
  const parent = { postMessage(data, origin) { sent.push({ data, origin }); } };
  const win = { parent, location: { origin: 'https://matrix.example', search },
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); } };
  if (!embedded) win.parent = win;
  return { win, sent, listeners, message(data, extra = {}) {
    listeners.get('message')?.({ data, origin: win.location.origin, source: parent, ...extra });
  } };
}

test('Atlas lists exactly ten abilities and exposes detached, round-trippable presets', () => {
  const { controller: api } = fixture();
  assert.equal(api.pack, 'atlas');
  assert.equal(api.list().abilities.length, 10);
  assert.deepEqual(api.list().abilities.map((item) => item.id), NEW_PRESETS.map((item) => item.id));
  assert.deepEqual(api.list().extras, []);
  assert.equal(Object.keys(api.allPresets()).length, 10);
  for (const item of NEW_PRESETS) {
    const preset = api.preset(item.id);
    assert.equal(preset.id, item.id);
    assert.equal(preset.pack, 'atlas');
    assert.equal(preset.format, 'collective-ability-preset@1');
    assert.equal(preset.meta.label, item.name);
    assert.deepEqual(preset.settings, { ...item.defaults, color: item.color });
    assert.equal(api.applyPreset(item.id, preset), true);
    preset.settings.seed = 9000;
    assert.equal(api.preset(item.id).settings.seed, item.defaults.seed);
  }
  assert.throws(() => api.preset('missing'), RangeError);
  assert.throws(() => api.arm('missing'), RangeError);
  assert.throws(() => api.cast('__proto__'), RangeError);
});

test('settings validation is strict, bounded, atomic, and rejects wrong IDs/unknown keys', () => {
  const { controller: api } = fixture();
  const initial = api.preset(first);
  const invalid = [null, [], {}, 'settings', { radius: '3' }, { radius: NaN }, { power: Infinity },
    { radius: .49 }, { radius: 8.1 }, { power: .09 }, { power: 4.01 }, { duration: 1.49 }, { duration: 15.01 },
    { seed: -1 }, { seed: 4294967296 }, { seed: 1.2 }, { color: 'red' }, { color: '#fff' }, { color: '#abcdef00' },
    { radius: 4, unknown: true }, { origin: [0, 0, 0] }, { constructor: 2 }, JSON.parse('{"__proto__":{"polluted":true}}'),
    { ...initial, id: second }, { ...initial, uid: `atlas/${second}` }, { ...initial, pack: 'collective' }, { ...initial, format: 'wrong' },
    { ...initial, meta: { id: second } },
    { ...initial, settings: null }, { ...initial, surprise: true }, { id: second, radius: 4 }];
  for (const patch of invalid) {
    assert.equal(api.applyPreset(first, patch), false, JSON.stringify(patch));
    assert.deepEqual(api.preset(first), initial, 'invalid changes must be atomic');
  }
  assert.equal(api.applyPreset('missing', { radius: 4 }), false);
  assert.equal(api.resetPreset('missing'), false);
  assert.equal(api.applyPreset(first, { radius: .5, power: .1, duration: 1.5, seed: 0, color: '#ABCDEF' }), true);
  assert.deepEqual(api.preset(first).settings, { radius: .5, power: .1, duration: 1.5, seed: 0, color: '#abcdef' });
  assert.equal(api.applyPreset(first, { radius: 8, power: 4, duration: 15, seed: 4294967295 }), true);
  assert.equal(api.preset(first).settings.color, '#abcdef');
  assert.equal(api.resetPreset(first), true);
  assert.deepEqual(api.preset(first), initial);
  assert.deepEqual(validateSettings(first, { settings: { radius: 4 }, id: first }), { radius: 4 });
});

test('actual generated Atlas preset files import and round-trip without metadata drift', async () => {
  const { controller: api } = fixture();
  for (const { id } of NEW_PRESETS) {
    const document = JSON.parse(await readFile(new URL(`../presets/atlas-prototype/${id}.json`, import.meta.url), 'utf8'));
    assert.equal(api.applyPreset(id, document), true, id);
    const exported = api.preset(id);
    assert.deepEqual(exported.settings, document.settings);
    for (const key of ['id', 'slot', 'label', 'hint', 'key', 'accent', 'cast', 'castAnim', 'cooldown', 'range', 'minRange', 'zoneRadius'])
      assert.deepEqual(exported.meta[key], document[key], `${id}: ${key}`);
    assert.equal(api.applyPreset(id, exported), true);
  }
});

test('manual casts reset preview state and reuse saved seeds instead of incrementing them', () => {
  let origin = [4, 0, 8];
  const f = fixture({ onReset: () => { origin = [0, 0, 4]; }, getCastOptions: () => ({ origin, target: [0, 0, -3] }) });
  f.controller.cast(first);
  origin = [9, 0, 9];
  f.controller.cast(first);
  assert.deepEqual(f.calls[0], f.calls[1]);
  assert.deepEqual(f.calls[0].settings.origin, [0, 0, 4]);
  assert.equal(f.calls[0].settings.seed, NEW_PRESETS[0].defaults.seed);
  assert.equal(f.clears, 2);
  assert.equal(f.controller.castCount, 2);
  f.controller.arm(second);
  assert.equal(f.controller.state.armed, true);
  f.controller.cast(second, { target: [2, 0, -2] });
  assert.equal(f.controller.state.armed, false);
  assert.deepEqual(f.calls.at(-1).settings.target, [2, 0, -2]);
  assert.deepEqual(f.posts.at(-1), { matrix: 'cast', id: second, fired: true, count: 3 });
});

test('arming clears stale effects and restores the caster before manual ground aiming', () => {
  const f = fixture();
  f.controller.cast(first);
  f.controller.arm(second);
  assert.equal(f.clears, 2);
  assert.equal(f.resets, 2);
  assert.equal(f.controller.castCount, 1);
  assert.equal(f.controller.state.armed, true);
  assert.equal(f.controller.state.selectedId, second);
});

test('auto-cast respects effect duration, pause, stop, explicit manual cast, and replacement', () => {
  const f = fixture(), api = f.controller, duration = api.preset(first).settings.duration;
  api.auto(first, 1);
  assert.equal(f.calls.length, 1);
  api.update(duration - .1);
  assert.equal(f.calls.length, 1);
  api.setPaused(true);
  const elapsed = f.updates.length;
  api.update(100);
  assert.equal(f.calls.length, 1);
  assert.equal(f.updates.length, elapsed);
  api.setPaused(false);
  api.update(.11);
  assert.equal(f.calls.length, 2);
  api.stopAuto();
  api.update(100);
  assert.equal(f.calls.length, 2);
  api.auto(first, 5);
  api.cast(second);
  assert.equal(api.state.autoId, null);
  api.update(100);
  assert.equal(f.calls.length, 4);
  api.auto(first, 5);
  api.auto(second, 5);
  api.update(100);
  assert.equal(f.calls.at(-1).id, second);
  assert.equal(f.calls.length, 7, 'large dt emits a single preview, not a catch-up burst');
  api.arm(first);
  api.update(100);
  assert.equal(f.calls.length, 7);
  assert.equal(api.state.autoId, null);
  for (const seconds of [0, -1, NaN, Infinity, '5', 3601]) assert.throws(() => api.auto(first, seconds), RangeError);
  for (const dt of [-1, NaN, Infinity, '1']) assert.throws(() => api.update(dt), TypeError);
});

test('starting auto while paused does not cast, and clear/dispose leave no scheduled work', () => {
  const f = fixture(), api = f.controller;
  api.setPaused(true);
  api.auto(first);
  api.update(10);
  assert.equal(f.calls.length, 0);
  api.setPaused(false);
  api.update(.01);
  assert.equal(f.calls.length, 1);
  api.clear();
  api.update(100);
  assert.equal(f.calls.length, 1);
  assert.equal(f.resets, 2);
  api.cast(second);
  api.setPaused(true);
  api.cast(first);
  assert.equal(api.state.paused, false, 'explicit cast resumes playback');
  api.auto(first);
  api.dispose();
  api.dispose();
  const count = f.calls.length;
  api.update(100);
  assert.equal(f.calls.length, count);
  assert.equal(f.disposals, 1);
  assert.equal(api.state.autoId, null);
  assert.equal(api.state.disposed, true);
  assert.throws(() => api.cast(first), /disposed/);
  assert.equal(api.applyPreset(first, { seed: 1 }), false);
});

test('bridge accepts only exact parent source and same origin, with an explicit outbound target', () => {
  const f = fixture(), browser = fakeWindow();
  const api = installAtlasBridge({ window: browser.win, runtime: f.runtime });
  assert.equal(browser.win.matrix, api);
  assert.equal(browser.sent[0].data.matrix, 'ready');
  assert.equal(browser.sent[0].data.pack, 'atlas');
  assert.equal(browser.sent[0].data.abilities.length, 10);
  assert.equal(browser.sent[0].origin, 'https://matrix.example');
  browser.message({ matrix: 'cast', id: first }, { origin: 'https://untrusted.example' });
  browser.message({ matrix: 'cast', id: first }, { source: {} });
  browser.message({ matrix: 'cast', id: first }, { origin: 'null' });
  browser.message(null);
  browser.message([]);
  assert.equal(f.calls.length, 0);
  browser.message({ matrix: 'cast', id: first });
  assert.equal(f.calls.length, 1);
  browser.message({ matrix: 'cast', id: 'missing' });
  assert.equal(browser.sent.at(-1).data.matrix, 'error');
  api.dispose();
  assert.equal(browser.listeners.size, 0);
  assert.equal(browser.win.matrix, undefined);
  browser.message({ matrix: 'cast', id: second });
  assert.equal(f.calls.length, 1);
  const standalone = fakeWindow('', false);
  const single = installAtlasBridge({ window: standalone.win, runtime: fixture().runtime });
  standalone.message({ matrix: 'cast', id: first }, { source: standalone.win });
  assert.equal(single.castCount, 0);
  assert.equal(standalone.sent.length, 0);
  single.dispose();
});

test('matrix commands support list/arm/auto/stop/clear/pause/editor/get/apply/reset/all', () => {
  const f = fixture(), browser = fakeWindow();
  const api = installAtlasBridge({ window: browser.win, runtime: f.runtime });
  const send = (matrix, rest = {}) => browser.message({ matrix, ...rest });
  send('list'); assert.equal(browser.sent.at(-1).data.abilities.length, 10);
  send('arm', { id: second }); assert.equal(api.state.selectedId, second); assert.equal(api.state.armed, true);
  send('auto', { id: first, seconds: 4 }); assert.equal(api.state.autoId, first);
  send('stop'); assert.equal(api.state.autoId, null);
  send('action', { action: 'togglePause' }); assert.equal(api.state.paused, true);
  send('pause', { paused: false }); assert.equal(api.state.paused, false);
  send('action', { action: 'toggleEditor' }); assert.equal(api.state.editorVisible, true);
  send('editor', { visible: false }); assert.equal(api.state.editorVisible, false);
  send('getPreset', { id: first }); assert.deepEqual(browser.sent.at(-1).data.preset, api.preset(first));
  send('getAllPresets'); assert.equal(Object.keys(browser.sent.at(-1).data.presets).length, 10);
  send('applyPreset', { id: first, preset: { seed: 44 } }); assert.equal(browser.sent.at(-1).data.ok, true);
  assert.equal(api.preset(first).settings.seed, 44);
  send('applyPreset', { id: first, preset: { ...api.preset(second), settings: { seed: 90 } } });
  assert.equal(browser.sent.at(-1).data.ok, false);
  assert.equal(api.preset(first).settings.seed, 44);
  send('resetPreset', { id: first }); assert.equal(browser.sent.at(-1).data.ok, true);
  assert.equal(api.preset(first).settings.seed, NEW_PRESETS[0].defaults.seed);
  send('clear'); assert.equal(api.state.autoId, null); assert.equal(api.state.armed, false);
  api.dispose();
});

test('failed renderer reports unavailable readiness and errors instead of accepting casts', () => {
  const browser = fakeWindow(), message = 'WebGL is unavailable';
  const api = installAtlasFailureBridge({ window: browser.win, message });
  assert.equal(browser.sent[0].data.matrix, 'ready');
  assert.equal(browser.sent[0].data.available, false);
  assert.equal(browser.sent[0].data.error, message);
  assert.deepEqual(browser.sent[0].data.abilities, []);
  assert.equal(browser.sent[1].data.matrix, 'error');
  assert.throws(() => api.cast(first), /WebGL is unavailable/);
  browser.message({ matrix: 'cast', id: first });
  assert.equal(browser.sent.at(-1).data.matrix, 'error');
  const count = browser.sent.length;
  browser.message({ matrix: 'cast', id: first }, { origin: 'https://untrusted.example' });
  assert.equal(browser.sent.length, count);
  browser.message({ matrix: 'list' });
  assert.equal(browser.sent.at(-1).data.available, false);
  api.dispose();
  assert.equal(browser.listeners.size, 0);
  assert.equal(browser.win.matrix, undefined);
});

test('URL ability/cast/auto parameters initialize once and errors still announce readiness', () => {
  for (const [search, count, auto, armed] of [
    [`?ability=${second}&hud=0`, 0, null, true],
    [`?ability=${second}&cast=1&hud=0`, 1, null, false],
    [`?ability=${second}&cast=1&auto=5`, 1, second, false]
  ]) {
    const f = fixture(), browser = fakeWindow(search);
    const api = installAtlasBridge({ window: browser.win, runtime: f.runtime });
    assert.equal(api.state.selectedId, second);
    assert.equal(f.calls.length, count);
    assert.equal(api.state.autoId, auto);
    assert.equal(api.state.armed, armed);
    assert.equal(browser.sent.at(-1).data.matrix, 'ready');
    api.dispose();
  }
  const browser = fakeWindow('?ability=missing&cast=1');
  const api = installAtlasBridge({ window: browser.win, runtime: fixture().runtime });
  assert.equal(browser.sent[0].data.matrix, 'error');
  assert.equal(browser.sent.at(-1).data.matrix, 'ready');
  api.dispose();
});

function snapshot(scene) {
  const values = [];
  scene.traverse((node) => {
    values.push(node.type, ...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray());
    if (node.geometry?.attributes.position) values.push(...node.geometry.attributes.position.array);
    if (node.isInstancedMesh) values.push(...node.instanceMatrix.array);
  });
  return values;
}
test('every Atlas preset repeats identical geometry and hook data through the preview controller', () => {
  for (const preset of NEW_PRESETS) {
    const scene = new THREE.Scene(), events = [];
    const runtime = createPresetRuntime({ scene, onEvent: (event) => {
      const { instanceId, ...stable } = event;
      events.push(stable);
    } });
    const api = createAtlasController({ runtime, onReset: () => { events.length = 0; },
      getCastOptions: () => ({ origin: [0, 0, 4], target: [0, 0, -3], targets: [[-3, 0, -3], [0, 0, -4], [3, 0, -3]] }) });
    api.cast(preset.id);
    api.update(preset.defaults.duration * .7);
    const firstGeometry = snapshot(scene), firstEvents = structuredClone(events);
    api.cast(preset.id);
    api.update(preset.defaults.duration * .7);
    assert.deepEqual(snapshot(scene), firstGeometry, preset.id);
    assert.deepEqual(events, firstEvents, preset.id);
    api.clear();
    assert.equal(runtime.stats.active, 0);
    assert.equal(runtime.stats.geometries, 0);
    api.cast(preset.id);
    assert.equal(runtime.stats.active, 1);
    api.dispose();
    assert.equal(scene.children.length, 0);
  }
});
