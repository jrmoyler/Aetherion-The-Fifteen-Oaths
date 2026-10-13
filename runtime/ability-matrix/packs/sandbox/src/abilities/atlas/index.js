import * as ArcRelay from './ArcRelayAbility.js';
import * as ChronoRecall from './ChronoRecallAbility.js';
import * as ParallaxBlink from './ParallaxBlinkAbility.js';
import * as DawnSanctuary from './DawnSanctuaryAbility.js';
import * as PolarityGarden from './PolarityGardenAbility.js';
import * as HallOfEchoes from './HallOfEchoesAbility.js';
import * as VectorChakram from './VectorChakramAbility.js';
import * as AegisReversal from './AegisReversalAbility.js';
import * as Stillpoint from './StillpointAbility.js';
import * as PrismRefractor from './PrismRefractorAbility.js';

export const ATLAS_ABILITIES = [ArcRelay, ChronoRecall, ParallaxBlink, DawnSanctuary, PolarityGarden, HallOfEchoes, VectorChakram, AegisReversal, Stillpoint, PrismRefractor].map((m) => ({
  ID: m.ID,
  Ability: m[Object.keys(m).find((k) => k.endsWith('Ability'))],
  buildEditor: m.buildEditor
}));
