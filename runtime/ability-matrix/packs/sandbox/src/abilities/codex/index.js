import * as SolarLash from './SolarLashAbility.js';
import * as PermafrostBloom from './PermafrostBloomAbility.js';
import * as AvalancheWake from './AvalancheWakeAbility.js';
import * as MaelstromVortex from './MaelstromVortexAbility.js';
import * as RiptideLash from './RiptideLashAbility.js';
import * as ZephyrShuriken from './ZephyrShurikenAbility.js';
import * as Downburst from './DownburstAbility.js';
import * as PollenNova from './PollenNovaAbility.js';
import * as SeedstormVolley from './SeedstormVolleyAbility.js';
import * as PlagueSwarm from './PlagueSwarmAbility.js';
import * as MiasmaSpit from './MiasmaSpitAbility.js';
import * as NebulaCollapse from './NebulaCollapseAbility.js';
import * as NightfallScythe from './NightfallScytheAbility.js';
import * as WraithHost from './WraithHostAbility.js';
import * as SanguineTide from './SanguineTideAbility.js';
import * as GlyphBarrage from './GlyphBarrageAbility.js';
import * as HourglassSunder from './HourglassSunderAbility.js';
import * as BasaltColumns from './BasaltColumnsAbility.js';
import * as SeraphicDescent from './SeraphicDescentAbility.js';
import * as BallLightning from './BallLightningAbility.js';
import * as RailgunLance from './RailgunLanceAbility.js';
import * as OrbitalStrike from './OrbitalStrikeAbility.js';

export const CODEX_ABILITIES = [
  SolarLash, PermafrostBloom, AvalancheWake, MaelstromVortex, RiptideLash, ZephyrShuriken, Downburst, PollenNova, SeedstormVolley, PlagueSwarm, MiasmaSpit, NebulaCollapse, NightfallScythe, WraithHost, SanguineTide, GlyphBarrage, HourglassSunder, BasaltColumns, SeraphicDescent, BallLightning, RailgunLance, OrbitalStrike
].map((m) => ({
  ID: m.ID,
  Ability: m[Object.keys(m).find((k) => k.endsWith('Ability'))],
  buildEditor: m.buildEditor
}));
