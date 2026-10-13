import solarlash from './solarlash.js';
import permafrost from './permafrost.js';
import avalanche from './avalanche.js';
import maelstrom from './maelstrom.js';
import riptide from './riptide.js';
import zephyr from './zephyr.js';
import downburst from './downburst.js';
import pollen from './pollen.js';
import seedstorm from './seedstorm.js';
import plague from './plague.js';
import miasma from './miasma.js';
import nebula from './nebula.js';
import nightfall from './nightfall.js';
import wraiths from './wraiths.js';
import sanguine from './sanguine.js';
import glyphs from './glyphs.js';
import hourglass from './hourglass.js';
import basalt from './basalt.js';
import seraph from './seraph.js';
import balllightning from './balllightning.js';
import railgun from './railgun.js';
import orbital from './orbital.js';

/** Display order. The Elemental Codex has no key slots; pick from the matrix or step with [ / ]. */
const BLOCKS = [solarlash, permafrost, avalanche, maelstrom, riptide, zephyr, downburst, pollen, seedstorm, plague, miasma, nebula, nightfall, wraiths, sanguine, glyphs, hourglass, basalt, seraph, balllightning, railgun, orbital];
export const CODEX_IDS = BLOCKS.map((b) => b.id);
export const CODEX_META = Object.fromEntries(BLOCKS.map((b) => [b.id, b.meta]));
export const CODEX_SETTINGS = Object.fromEntries(BLOCKS.map((b) => [b.id, b.settings]));
