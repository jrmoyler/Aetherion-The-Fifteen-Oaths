/** Every native sandbox ability module, matching config/sandbox.js order. */
import { COLLECTIVE_ABILITIES } from './collective/index.js';
import { MATRIX_NEW_ABILITIES } from './matrix-new/index.js';
import { ATLAS_ABILITIES } from './atlas/index.js';
import { CODEX_ABILITIES } from './codex/index.js';

export const NATIVE_ABILITIES = [...COLLECTIVE_ABILITIES, ...MATRIX_NEW_ABILITIES, ...ATLAS_ABILITIES, ...CODEX_ABILITIES];
