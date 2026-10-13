import * as GaleSever from './GaleSeverAbility.js';
import * as EmberveilLattice from './EmberveilLatticeAbility.js';
import * as UmbraGrasp from './UmbraGraspAbility.js';
import * as GeodeEruption from './GeodeEruptionAbility.js';
import * as AetherbladeCascade from './AetherbladeCascadeAbility.js';
import * as MirageConstruct from './MirageConstructAbility.js';
import * as BloodrootThorns from './BloodrootThornsAbility.js';
import * as IonStormPillar from './IonStormPillarAbility.js';
import * as ObsidianWall from './ObsidianWallAbility.js';
import * as StarfallRite from './StarfallRiteAbility.js';
import * as VoidstepRift from './VoidstepRiftAbility.js';
import * as CrystallineHeart from './CrystallineHeartAbility.js';

export const MATRIX_NEW_ABILITIES = [
  GaleSever, EmberveilLattice, UmbraGrasp, GeodeEruption, AetherbladeCascade,
  MirageConstruct, BloodrootThorns, IonStormPillar, ObsidianWall, StarfallRite,
  VoidstepRift, CrystallineHeart
].map((m) => ({
  ID: m.ID,
  Ability: m[Object.keys(m).find((k) => k.endsWith('Ability'))],
  buildEditor: m.buildEditor
}));
