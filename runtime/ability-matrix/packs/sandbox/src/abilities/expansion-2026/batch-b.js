import canopy from './nature/predatory-canopy.config.js';
import sky from './cosmic/celestial-cartography.config.js';
import toxin from './poison/toxin-evolution.config.js';
import shade from './shadow/nightshade-inheritance.config.js';
import heliostat from './light/heliostat-verdict.config.js';
import vigil from './holy/vigil-of-embers.config.js';
import mass from './gravity/mass-weft.config.js';
import meridian from './void/hollow-meridian.config.js';
import {ID as canopyId, PredatoryCanopyAbility, buildEditor as canopyEditor} from './nature/PredatoryCanopyAbility.js';
import {ID as skyId, CelestialCartographyAbility, buildEditor as skyEditor} from './cosmic/CelestialCartographyAbility.js';
import {ID as toxinId, ToxinEvolutionAbility, buildEditor as toxinEditor} from './poison/ToxinEvolutionAbility.js';
import {ID as shadeId, NightshadeInheritanceAbility, buildEditor as shadeEditor} from './shadow/NightshadeInheritanceAbility.js';
import {ID as heliostatId, HeliostatVerdictAbility, buildEditor as heliostatEditor} from './light/HeliostatVerdictAbility.js';
import {ID as vigilId, VigilOfEmbersAbility, buildEditor as vigilEditor} from './holy/VigilOfEmbersAbility.js';
import {ID as massId, MassWeftAbility, buildEditor as massEditor} from './gravity/MassWeftAbility.js';
import {ID as meridianId, HollowMeridianAbility, buildEditor as meridianEditor} from './void/HollowMeridianAbility.js';
// Registration is intentionally explicit: the parent integration must wire
// configs, catalog IDs and the expansion combat bridge before promotion.
export const BATCH_B_CONFIGS=[canopy,sky,toxin,shade,heliostat,vigil,mass,meridian];
export const BATCH_B_ABILITIES=[
 {ID:canopyId,Ability:PredatoryCanopyAbility,buildEditor:canopyEditor},
 {ID:skyId,Ability:CelestialCartographyAbility,buildEditor:skyEditor},
 {ID:toxinId,Ability:ToxinEvolutionAbility,buildEditor:toxinEditor},
 {ID:shadeId,Ability:NightshadeInheritanceAbility,buildEditor:shadeEditor},
 {ID:heliostatId,Ability:HeliostatVerdictAbility,buildEditor:heliostatEditor},
 {ID:vigilId,Ability:VigilOfEmbersAbility,buildEditor:vigilEditor},
 {ID:massId,Ability:MassWeftAbility,buildEditor:massEditor},
 {ID:meridianId,Ability:HollowMeridianAbility,buildEditor:meridianEditor}
];
