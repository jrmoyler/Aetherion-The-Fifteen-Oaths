import * as TempestSpiral from './TempestSpiralAbility.js';
import * as DuneScourge from './DuneScourgeAbility.js';
import * as SunfallPrism from './SunfallPrismAbility.js';
import * as ChainArc from './ChainArcAbility.js';
import * as GravitonCollapse from './GravitonCollapseAbility.js';
import * as BlinkStep from './BlinkStepAbility.js';
import * as ResonancePulse from './ResonancePulseAbility.js';
import * as CrimsonRite from './CrimsonRiteAbility.js';
import * as MeteorSwarm from './MeteorSwarmAbility.js';
import * as AegisBulwark from './AegisBulwarkAbility.js';
import * as SporeBloom from './SporeBloomAbility.js';
import * as ChronoFracture from './ChronoFractureAbility.js';

/**
 * Every Collective Original, in slot order. Each module exports:
 *   ID            settings key
 *   Ability       the class (extends ../Ability.js)
 *   buildEditor   (gui, settingsBlock, Editor) => void — its VFX editor folder
 */
export const COLLECTIVE_ABILITIES = [TempestSpiral, DuneScourge, SunfallPrism, ChainArc, GravitonCollapse, BlinkStep, ResonancePulse, CrimsonRite, MeteorSwarm, AegisBulwark, SporeBloom, ChronoFracture].map((m) => ({
  ID: m.ID,
  Ability: m[Object.keys(m).find((k) => k.endsWith('Ability'))],
  buildEditor: m.buildEditor
}));
