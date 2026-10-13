import test from 'node:test';
import assert from 'node:assert/strict';
import validator from 'gltf-validator';
import { inspectGlb } from './audit-glb.mjs';

function glb(json, binary) {
  const text = Buffer.from(JSON.stringify(json));
  const chunk = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20);
  text.copy(chunk);
  const size = 20 + chunk.length + (binary ? 8 + binary.length : 0);
  const out = Buffer.alloc(size);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(size, 8);
  out.writeUInt32LE(chunk.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  chunk.copy(out, 20);
  if (binary) {
    out.writeUInt32LE(binary.length, 20 + chunk.length);
    out.writeUInt32LE(0x004e4942, 24 + chunk.length);
    binary.copy(out, 28 + chunk.length);
  }
  return out;
}
const validate = bytes => validator.validateBytes(new Uint8Array(bytes), { maxIssues: 0, writeTimestamp: false });

test('minimal valid GLB passes official validator and inventory', async () => {
  const bytes = glb({ asset: { version: '2.0' } });
  assert.equal(inspectGlb(bytes).counts.meshes, 0);
  assert.equal((await validate(bytes)).issues.numErrors, 0);
});

test('inventory rejects declared file length and chunk bounds corruption', () => {
  const length = glb({ asset: { version: '2.0' } });
  length.writeUInt32LE(length.length + 4, 8);
  assert.throws(() => inspectGlb(length), /declared length mismatch/);
  const chunk = glb({ asset: { version: '2.0' } });
  chunk.writeUInt32LE(chunk.length, 12);
  assert.throws(() => inspectGlb(chunk), /chunk bounds/);
});

test('official validator detects accessor overrun of embedded buffer view', async () => {
  const bytes = glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }],
    bufferViews: [{ buffer: 0, byteLength: 4 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 10, type: 'VEC3' }],
  }, Buffer.alloc(4));
  const report = await validate(bytes);
  assert.ok(report.issues.numErrors > 0);
  assert.ok(report.issues.messages.some(m => m.code === 'ACCESSOR_TOO_LONG'));
});

test('official validator detects texture and skin references outside arrays', async () => {
  const bytes = glb({ asset: { version: '2.0' },
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 3 } } }],
    skins: [{ joints: [8] }], nodes: [{ skin: 0 }],
  });
  const report = await validate(bytes);
  assert.ok(report.issues.messages.some(m => m.code === 'UNRESOLVED_REFERENCE' && m.pointer.includes('baseColorTexture')));
  assert.ok(report.issues.messages.some(m => m.code === 'UNRESOLVED_REFERENCE' && m.pointer.includes('/joints/')));
});

test('checked-in audit preserves complete issue counts and compressed evidence checksum', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const { gunzipSync } = await import('node:zlib');
  const report = JSON.parse(await readFile(new URL('../../validation/production/GLB_AUDIT.json', import.meta.url)));
  const compressed = await readFile(new URL('../../validation/production/GLB_VALIDATOR_DETAILS.json.gz', import.meta.url));
  assert.equal(createHash('sha256').update(compressed).digest('hex'), report.fullIssueEvidence.sha256);
  const full = JSON.parse(gunzipSync(compressed));
  assert.equal(full.records.length, report.summary.uniqueIdentities);
  assert.equal(report.records.reduce((n, r) => n + r.paths.length, 0), report.summary.paths);
  for (const r of report.records) {
    const evidence = full.records.find(f => f.sha256 === r.sha256);
    assert.ok(evidence);
    assert.equal(evidence.issues.truncated, false);
    assert.equal(r.validator.issues.byCode.reduce((n, c) => n + c.count, 0), evidence.issues.messages.length);
    for (const c of r.validator.issues.byCode) {
      assert.equal(c.count, evidence.issues.messages.filter(m => m.code === c.code && m.severity === c.severity).length);
      assert.ok(c.examples.length <= 3);
    }
    for (const sourcePath of r.paths) {
      const bytes = await readFile(new URL(`../../${sourcePath}`, import.meta.url));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), r.sha256);
    }
  }
  assert.equal(report.acceptance.productionReadyAssets, 0);
});
