import relay from './relay.js';
import recall from './recall.js';
import parallax from './parallax.js';
import sanctuary from './sanctuary.js';
import polarity from './polarity.js';
import echoes from './echoes.js';
import chakram from './chakram.js';
import reversal from './reversal.js';
import stillpoint from './stillpoint.js';
import refractor from './refractor.js';

const BLOCKS = [relay, recall, parallax, sanctuary, polarity, echoes, chakram, reversal, stillpoint, refractor];
export const ATLAS_IDS = BLOCKS.map((b) => b.id);
export const ATLAS_META = Object.fromEntries(BLOCKS.map((b) => [b.id, b.meta]));
export const ATLAS_SETTINGS = Object.fromEntries(BLOCKS.map((b) => [b.id, b.settings]));
