import tempest from './tempest.js';
import dune from './dune.js';
import prism from './prism.js';
import chain from './chain.js';
import graviton from './graviton.js';
import blink from './blink.js';
import sonic from './sonic.js';
import crimson from './crimson.js';
import swarm from './swarm.js';
import aegis from './aegis.js';
import spore from './spore.js';
import chrono from './chrono.js';

/** Slot order — the index is the key binding (Q E R F V X B Z N K Y U). */
const BLOCKS = [tempest, dune, prism, chain, graviton, blink, sonic, crimson, swarm, aegis, spore, chrono];

export const COLLECTIVE_IDS = BLOCKS.map((b) => b.id);
export const COLLECTIVE_META = Object.fromEntries(BLOCKS.map((b) => [b.id, b.meta]));
export const COLLECTIVE_SETTINGS = Object.fromEntries(BLOCKS.map((b) => [b.id, b.settings]));
