import { EXPANSION_CONFIGS, EXPANSION_ABILITIES } from './index.js';
import { BATCH_B_CONFIGS, BATCH_B_ABILITIES } from './batch-b.js';
import { BATCH_C } from './batch-c.js';
import { BATCH_D } from './batch-d.js';
import { DUAL_CANDIDATES } from './dual-pulse/index.js';
import { EXPANSION_STATUS } from './status.js';
import { ELEMENT_GROUPS } from '../../config/elements.js';

export const EXPANSION_CANDIDATES = Object.freeze([
  ...EXPANSION_ABILITIES.map((item, i) => ({ ...item, config: EXPANSION_CONFIGS[i] })),
  ...BATCH_B_ABILITIES.map((item, i) => ({ ...item, uid: BATCH_B_CONFIGS[i].uid, config: BATCH_B_CONFIGS[i] })),
  ...BATCH_C.map(({ uid, module }) => ({ ...module, uid })),
  ...BATCH_D.map(({ uid, module }) => ({ ...module, uid })),
  ...DUAL_CANDIDATES
]);

/** Fail closed: every registered candidate needs one unique UID, ID, element and explicit status. */
export function expansionRoster(statuses = EXPANSION_STATUS) {
  const ids = new Set(), uids = new Set(), elements = new Set(ELEMENT_GROUPS.map((e) => e.id));
  for (const c of EXPANSION_CANDIDATES) {
    if (!/^matrix-expansion\/[a-z0-9-]+$/.test(c.uid) || !c.ID || c.ID !== c.config?.id ||
        !elements.has(c.config?.meta?.element) || typeof c.Ability !== 'function' || typeof c.buildEditor !== 'function' ||
        ids.has(c.ID) || uids.has(c.uid) || !['candidate', 'live'].includes(statuses[c.uid]))
      throw new Error(`Invalid or unreviewed expansion registration: ${c.uid}`);
    ids.add(c.ID); uids.add(c.uid);
  }
  if (Object.keys(statuses).some((uid) => !uids.has(uid))) throw new Error('Expansion status references unknown UID');
  return EXPANSION_CANDIDATES.map((c) => ({ ...c, status: statuses[c.uid] }));
}
