/**
 * Reference-strict identity resolver. A realm-colored archetype is not a named character.
 * This reads the exact Blender/GLB sources already authored in assets/production.
 * No automatic replacement, model re-parenting or art approval is performed.
 */
export function createIdentityCatalog(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.characters) || !Array.isArray(snapshot.creatures) || !Array.isArray(snapshot.existing_blender_candidates)) {
    throw new TypeError('Invalid Aetherion model intake snapshot');
  }
  const identities = new Map(), designs = new Map();
  for (const [kind, rows] of [['character', snapshot.characters], ['creature', snapshot.creatures]]) {
    for (const row of rows) {
      if (!row?.id || identities.has(row.id)) throw new Error('Duplicate/missing canon identity: ' + row?.id);
      identities.set(row.id, Object.freeze({ ...row, kind }));
    }
  }
  for (const row of snapshot.existing_blender_candidates) {
    if (!row?.id || designs.has(row.id)) throw new Error('Duplicate/missing authored design: ' + row?.id);
    designs.set(row.id, row);
  }
  return Object.freeze({ identities, designs, characters: snapshot.characters.length, creatures: snapshot.creatures.length });
}

function categoryFromFamily(family) {
  const match = /^asset-o\d{2}-([a-z])-/.exec(family || '');
  return match?.[1] || null;
}

function correspondingCategory(kind) {
  return kind === 'character' ? 'a' : 'c';
}

function matchingReference(a, b) {
  const normalize = v => String(v).toLowerCase().replace(/^ref-/, 'reference-').replace(/^reference-0*/, 'reference-');
  const refs = new Set(a.map(normalize));
  return b.some(ref => refs.has(normalize(ref)));
}

function safeProductionFile(path) {
  return typeof path === 'string' &&
    path.startsWith('assets/production/') &&
    !path.split('/').some(p => p === '.' || p === '..' || !p) &&
    !/[\\?#]/.test(path);
}

/**
 * Bind a specific named identity to a specific authored design FOR REVIEW ONLY.
 * No Oath-based fallback. No procedural prototype can satisfy identity matching.
 * `explicitReferenceMatch` deliberately defaults true.
 *
 * A production release requires a separate, human-authorized artifact approval.
 */
export function resolveIdentityCandidate(catalog, identityId, designId, { explicitReferenceMatch = true } = {}) {
  const identity = catalog.identities.get(identityId);
  if (!identity) return { state: 'UNKNOWN_IDENTITY', identityId };
  const design = catalog.designs.get(designId);
  if (!design) return { state: 'UNKNOWN_DESIGN', identityId, designId };
  const expectedCategory = correspondingCategory(identity.kind);
  if (categoryFromFamily(design.family_id) !== expectedCategory) return { state: 'WRONG_MODEL_CATEGORY', identityId, designId };
  const authoredOath = /asset-(o\d{2})-/.exec(design.family_id)?.[1];
  if (!authoredOath || authoredOath !== identity.oath_id.replace(/^oath-/, 'o')) return { state: 'OATH_MISMATCH', identityId, designId };
  const refs = identity.kind === 'character' ? identity.visual_reference_source_ids : identity.references;
  if (explicitReferenceMatch && !matchingReference(refs || [], design.reference_ids || [])) {
    return { state: 'REFERENCE_MISMATCH', identityId, designId };
  }
  const file = design.files?.glb?.[0];
  if (!file?.path || !safeProductionFile(file.path)) return { state: 'NO_VERIFIED_GLB_PATH', identityId, designId };
  const blender = design.files?.blend?.[0]?.path || null;
  return Object.freeze({ state: 'REVIEW_CANDIDATE_ONLY', identityId, designId, glb: file.path, sha256: file.sha256, blender, approved: false, previewOptInRequired: true, openGates: design.open_gates });
}

/** Safe by default: game runtime receives zero unapproved identity models. */
export function resolveProductionIdentity(catalog, identityId) {
  if (!catalog.identities.has(identityId)) return { state: 'UNKNOWN_IDENTITY', identityId };
  return { state: 'AWAITING_REFERENCE_FIDELITY_APPROVAL', identityId, glb: null, approved: false };
}
