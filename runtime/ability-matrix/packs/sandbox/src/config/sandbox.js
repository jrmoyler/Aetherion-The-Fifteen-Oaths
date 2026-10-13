/**
 * Every ability written natively for the sandbox engine, in display order:
 * Collective Originals, Matrix New, Ability Atlas, Elemental Codex. (The 44 abilities of the
 * five source repos run on their own vendored engines — see src/vendor/.)
 */
import { COLLECTIVE_IDS, COLLECTIVE_META, COLLECTIVE_SETTINGS } from './collective/index.js';
import { MATRIX_NEW_IDS, MATRIX_NEW_META, MATRIX_NEW_SETTINGS } from './matrix-new/index.js';
import { ATLAS_IDS, ATLAS_META, ATLAS_SETTINGS } from './atlas/index.js';
import { CODEX_IDS, CODEX_META, CODEX_SETTINGS } from './codex/index.js';

export const NATIVE_GROUPS = [
  { pack: 'collective', ids: COLLECTIVE_IDS },
  { pack: 'matrix-new', ids: MATRIX_NEW_IDS },
  { pack: 'atlas', ids: ATLAS_IDS },
  { pack: 'codex', ids: CODEX_IDS }
];
export const NATIVE_IDS = [...COLLECTIVE_IDS, ...MATRIX_NEW_IDS, ...ATLAS_IDS, ...CODEX_IDS];
export const NATIVE_META = { ...COLLECTIVE_META, ...MATRIX_NEW_META, ...ATLAS_META, ...CODEX_META };
export const NATIVE_SETTINGS = { ...COLLECTIVE_SETTINGS, ...MATRIX_NEW_SETTINGS, ...ATLAS_SETTINGS, ...CODEX_SETTINGS };
