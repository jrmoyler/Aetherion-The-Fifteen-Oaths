import gale from './gale.js';
import emberveil from './emberveil.js';
import umbra from './umbra.js';
import geode from './geode.js';
import aetherblade from './aetherblade.js';
import mirage from './mirage.js';
import bloodroot from './bloodroot.js';
import ionstorm from './ionstorm.js';
import obsidianwall from './obsidianwall.js';
import starfall from './starfall.js';
import voidstep from './voidstep.js';
import crystallineheart from './crystallineheart.js';

/** Slot order — the index is the key binding (Q E R F V X B Z N K Y U). */
const BLOCKS = [gale, emberveil, umbra, geode, aetherblade, mirage, bloodroot, ionstorm, obsidianwall, starfall, voidstep, crystallineheart];
export const MATRIX_NEW_IDS = BLOCKS.map((b) => b.id);
export const MATRIX_NEW_META = Object.fromEntries(BLOCKS.map((b) => [b.id, b.meta]));
export const MATRIX_NEW_SETTINGS = Object.fromEntries(BLOCKS.map((b) => [b.id, b.settings]));
