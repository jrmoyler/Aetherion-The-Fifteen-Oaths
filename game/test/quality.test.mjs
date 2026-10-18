// Quality tier selection: GPU-aware auto detect must never pick a tier the device cannot hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGpu, pickTier, TIERS } from '../src/core/quality.js';

test('classifyGpu recognises common renderer strings', () => {
  assert.equal(classifyGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'discrete');
  assert.equal(classifyGpu('ANGLE (AMD, AMD Radeon RX 6800 XT, D3D11)'), 'discrete');
  assert.equal(classifyGpu('Apple M2 Pro'), 'discrete');
  assert.equal(classifyGpu('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'integrated');
  assert.equal(classifyGpu('Mali-G78 MP20'), 'integrated');
  assert.equal(classifyGpu('Google SwiftShader'), 'software');
  assert.equal(classifyGpu(''), 'unknown');
});

test('pickTier maps device hints to tiers', () => {
  assert.equal(pickTier({ touch: true, mem: 8, cores: 8, gpu: 'unknown' }), 'medium');
  assert.equal(pickTier({ touch: true, mem: 4, cores: 8, gpu: 'unknown' }), 'low');
  assert.equal(pickTier({ touch: false, mem: 16, cores: 12, gpu: 'discrete' }), 'high');
  assert.equal(pickTier({ touch: false, mem: 8, cores: 2, gpu: 'discrete' }), 'medium');
  assert.equal(pickTier({ touch: false, mem: 16, cores: 12, gpu: 'integrated' }), 'medium');
  assert.equal(pickTier({ touch: false, mem: 4, cores: 4, gpu: 'integrated' }), 'low');
  assert.equal(pickTier({ touch: false, mem: 32, cores: 16, gpu: 'software' }), 'low');
  assert.equal(pickTier({ touch: false, mem: 8, cores: 8, gpu: 'unknown' }), 'high');
  assert.equal(pickTier({ touch: false, mem: 4, cores: 4, gpu: 'unknown' }), 'medium');
});

test('auto detect never selects ultra; every tier declares the render knobs', () => {
  for (const hints of [{ touch: false, mem: 64, cores: 32, gpu: 'discrete' }, { touch: true, mem: 64, cores: 32, gpu: 'discrete' }]) {
    assert.notEqual(pickTier(hints), 'ultra');
  }
  for (const t of Object.values(TIERS)) {
    assert.ok(t.msaa >= 1 && t.anisotropy >= 1 && ['medium', 'high'].includes(t.shadowFilter), t.name);
    assert.equal(typeof t.softShadows, 'boolean', t.name);
  }
  assert.equal(TIERS.low.msaa, 1); assert.equal(TIERS.high.msaa, 4); assert.equal(TIERS.ultra.softShadows, true);
});
