import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createIdentityCatalog, resolveIdentityCandidate, resolveProductionIdentity } from '../src/production/identity-catalog.js';

const snapshot = JSON.parse(readFileSync(new URL('../assets/production/intake/ROSTER_AND_EXISTING_CANDIDATES.json', import.meta.url), 'utf8'));
const catalog = createIdentityCatalog(snapshot);

test('complete canon identity inventory is explicit and production approval stays zero', () => {
  assert.equal(catalog.characters, 34);
  assert.equal(catalog.creatures, 94);
  assert.equal(catalog.designs.size, 52);
  assert.equal(snapshot.counts.manifest_asset_entries, 63);
  assert.equal(snapshot.counts.approved_assets, 0);
  for (const identity of catalog.identities.values()) {
    assert.equal(identity.approved_model_id, null);
    assert.equal(resolveProductionIdentity(catalog, identity.id).glb, null);
  }
});

test('Blender candidates reference existing immutable repository artifacts', () => {
  let sawSkinnedCandidate = false;
  for (const design of catalog.designs.values()) {
    assert.equal(design.status, 'UNAPPROVED_EXISTING_CANDIDATE');
    assert.ok(design.files.glb.length > 0, design.id);
    assert.ok(design.files.blend.length > 0, design.id);
    for (const type of ['glb','blend','lod1','lod2','collision']) {
      for (const file of design.files[type]) {
        assert.match(file.sha256, /^[a-f0-9]{64}$/);
        assert.match(file.path, /^assets\/production\//);
        assert.ok(existsSync(new URL('../' + file.path, import.meta.url)), file.path);
      }
    }
    sawSkinnedCandidate ||= design.rig_bones > 0;
  }
  assert.ok(sawSkinnedCandidate);
});

test('realm proximity cannot silently turn a generic ninja into a named character', () => {
  assert.equal(resolveIdentityCandidate(catalog, 'character-01-leader', 'kiln-ninja').state, 'REFERENCE_MISMATCH');
  assert.equal(resolveIdentityCandidate(catalog, 'creature-o01-natural', 'kiln-ninja').state, 'WRONG_MODEL_CATEGORY');
  assert.equal(resolveIdentityCandidate(catalog, 'missing-name', 'kiln-ninja').state, 'UNKNOWN_IDENTITY');
  assert.equal(resolveIdentityCandidate(catalog, 'character-01-leader', 'missing-model').state, 'UNKNOWN_DESIGN');
});

test('even explicitly linked, reference-compatible designs remain preview-only', () => {
  const mock = JSON.parse(JSON.stringify(snapshot));
  mock.characters[0].visual_reference_source_ids = ['REF-090'];
  const linked = resolveIdentityCandidate(createIdentityCatalog(mock), mock.characters[0].id, 'kiln-ninja');
  assert.equal(linked.state, 'REVIEW_CANDIDATE_ONLY');
  assert.equal(linked.approved, false);
  assert.ok(linked.glb.endsWith('.glb'));
  assert.equal(resolveProductionIdentity(createIdentityCatalog(mock), mock.characters[0].id).glb, null);
});
