import test from 'node:test';
import assert from 'node:assert/strict';
import { createSfx } from './sfx.js';

function fixture() {
  const sources = [], nodes = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => {
    const n = { gain: param(), pan: param(), frequency: param(), detune: param(), Q: param(), connections: [], connect(to) { this.connections.push(to); }, disconnect() { this.disconnected = true; }, start() {}, stop() { this.stopped = true; } };
    nodes.push(n); return n;
  };
  const source = () => { const n = node(); sources.push(n); return n; };
  const E = { ready: true, ac: { createGain: node, createStereoPanner: node, createOscillator: source, createBufferSource: source, createBiquadFilter: node }, sfx: node(), sfxSend: node(), reverbSend: node(), noise: {}, now: () => 1, mtof: n => 440 * 2 ** ((n-69)/12) };
  return { E, sources, nodes };
}

test('audio voices have a hard budget and dispose every scheduled source', () => {
  const { E, sources } = fixture(), sfx = createSfx(E);
  for (let i = 0; i < 100; i++) sfx.cast('storm');
  assert.equal(sfx.activeVoices, 32);
  assert.ok(sources.some(s => s.disconnected), 'oldest voices are evicted');
  sfx.dispose();
  assert.equal(sfx.activeVoices, 0);
  assert.ok(sources.every(s => s.disconnected && s.stopped));
});

test('ended sounds disconnect their entire graph and wet sound uses SFX volume bus', () => {
  const { E, sources, nodes } = fixture(), sfx = createSfx(E);
  sfx.cast('frost');
  assert.ok(nodes.some(n => n.connections.includes(E.sfxSend)));
  for (const source of sources) source.onended();
  assert.equal(sfx.activeVoices, 0);
  assert.ok(sources.every(s => s.disconnected));
});
