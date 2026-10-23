import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OATHS } from '../../../shared/oaths.js';
import { arrivalPlan, sampleArrival, createCovenantEffect, playArrival } from './cinematics.js';

test('every covenant has three finite live-world camera shots and its own subtitle', () => {
  const subtitles = new Set();
  for (const oath of OATHS) {
    const p = arrivalPlan(oath, { x: 100, y: 12, z: -50 }, .7);
    assert.equal(p.duration, 10);
    for (const [seconds, shot] of [[0, 0], [4, 1], [9, 2], [10, 2]]) {
      const frame = sampleArrival(p, seconds); assert.equal(frame.index, shot);
      assert.ok([...frame.position, ...frame.look, frame.fov].every(Number.isFinite));
      assert.ok(frame.position.distanceTo(p.hero) < 60);
    }
    subtitles.add(sampleArrival(p, 5).subtitle);
    assert.equal(sampleArrival(p, 10).progress, 1);
  }
  assert.equal(subtitles.size, 15);
});

test('covenant geometry is bounded and disposes every owned GPU resource exactly once', () => {
  for (const oath of OATHS) {
    const effect = createCovenantEffect(oath, new THREE.Vector3(1, 2, 3), 'low'), scene = new THREE.Scene(); scene.add(effect.group);
    assert.ok(effect.group.children.length > 0 && effect.group.children.length <= 6);
    const resources = new Set(); effect.group.traverse(o => { if (o.geometry) resources.add(o.geometry); if (o.material) resources.add(o.material); });
    const disposed = new Map(); for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) || 0) + 1));
    effect.update(2, 1); assert.equal(effect.group.visible, true);
    effect.update(3, 0); assert.equal(effect.group.visible, false);
    effect.dispose(); effect.dispose(); assert.equal(scene.children.length, 0);
    assert.equal(disposed.size, resources.size); assert.ok([...disposed.values()].every(n => n === 1));
  }
});

class Element extends EventTarget {
  constructor(tag) { super(); this.tagName = tag; this.children = []; this.dataset = {}; this.style = { setProperty() {} }; this.classList = { add() {}, remove() {} }; this.isConnected = true; this.textContent = ''; }
  setAttribute() {} append(...items) { this.children.push(...items); for (const item of items) item.parent = this; }
  focus() {} remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
}
function harness() {
  const original = new Map(), document = new Element('document'), body = new Element('body'), ui = new Element('ui');
  document.body = body; document.hidden = false; document.activeElement = null; document.createElement = tag => new Element(tag); document.getElementById = () => ui;
  let now = 0, update = null, enabled = false;
  const events = new EventTarget();
  for (const [key, value] of Object.entries({ document, matchMedia: () => ({ matches: false }), performance: { now: () => now }, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) })) { original.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); }
  let animationUpdates = 0;
  const ctx = { camera: new THREE.PerspectiveCamera(), scene: new THREE.Scene(), canvas: new Element('canvas'), quality: { name: 'low' }, net: { paused: true },
    actors: { player: { position: new THREE.Vector3(), body: { setFade() {}, animator: { update() { animationUpdates++; } } } }, orbit: { dist: 6, update() {} } },
    input: { get padCaptureReason() { return { enabled }; }, setEnabled(v) { enabled = v; } }, bus: { emit() {} }, world: { heightAt: () => 0 },
    addUpdate(fn, order) { assert.equal(order, 0); update = fn; return () => { update = null; }; }, params: new URLSearchParams() };
  return { ctx, document, body, ui, tick(ms) { now += ms; update?.(0); }, get updates() { return animationUpdates; }, get updating() { return !!update; }, restore() { for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } } };
}

test('arrival completes while simulation is paused and removes overlay, effects, updater and capture', async () => {
  const h = harness();
  try {
    const result = playArrival(h.ctx, { oath: 'oath-01' }, { duration: .2 });
    assert.equal(h.ctx.cinematicActive, true); assert.equal(h.ctx.actors.player.fade, 1);
    h.tick(100); h.tick(100); await result;
    assert.ok(h.updates > 0); assert.equal(h.ctx.cinematicActive, false); assert.equal(h.ctx.input.padCaptureReason.enabled, false);
    assert.equal(h.ctx.scene.children.length, 0); assert.equal(h.body.children.length, 0); assert.equal(h.updating, false);
  } finally { h.restore(); }
});

test('Escape skips immediately; abort and reduced-motion bypass cannot strand input', async () => {
  const h = harness();
  try {
    let result = playArrival(h.ctx, { oath: 'oath-04' });
    const escape = new Event('keydown', { cancelable: true }); escape.code = 'Escape'; h.document.dispatchEvent(escape);
    assert.equal((await result).reason, 'skipped'); assert.equal(h.updating, false);
    const controller = new AbortController(); result = playArrival(h.ctx, { oath: 'oath-04' }, { signal: controller.signal }); controller.abort();
    assert.equal((await result).reason, 'aborted'); assert.equal(h.ctx.cinematicActive, false);
    globalThis.matchMedia = () => ({ matches: true }); assert.equal((await playArrival(h.ctx, { oath: 'oath-04' })).reason, 'bypassed');
    assert.equal(h.body.children.length, 0);
  } finally { h.restore(); }
});

test('a second arrival cancels the first before taking camera ownership', async () => {
  const h = harness();
  try {
    const first = playArrival(h.ctx, { oath: 'oath-01' });
    const second = playArrival(h.ctx, { oath: 'oath-02' });
    assert.equal((await first).reason, 'cancelled');
    await Promise.resolve();
    assert.equal(h.ctx.cinematicActive, true); assert.equal(h.body.children.length, 1);
    h.ctx.cancelArrival(); assert.equal((await second).reason, 'cancelled');
    assert.equal(h.body.children.length, 0); assert.equal(h.ctx.scene.children.length, 0);
  } finally { h.restore(); }
});
