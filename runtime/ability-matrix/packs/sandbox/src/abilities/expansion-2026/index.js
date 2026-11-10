/** Isolated native expansion modules. Registration is deliberately separate. */
import * as fire from "./fire/AshenDoppelganger.js";
import * as frost from "./frost/AbsoluteZeroThread.js";
import * as storm from "./storm/FulminantRelay.js";
import * as stormParasite from "./storm/ThunderheadParasite.js";
import * as water from "./water/TidalMemory.js";
import * as earth from "./earth/FaultwakeBastion.js";
import * as crystal from "./crystal/PrismChoir.js";
import * as wind from "./wind/PressureInversion.js";
import * as sound from "./sound/OvertoneSpiral.js";
const modules = [fire, frost, storm, stormParasite, water, earth, crystal, wind, sound];
export const EXPANSION_CONFIGS = Object.freeze(modules.map((m) => m.CONFIG));
export const EXPANSION_ABILITIES = Object.freeze(
  modules.map((m) => ({
    ID: m.ID,
    uid: m.UID,
    Ability: m[Object.keys(m).find((key) => key.endsWith("Ability"))],
    buildEditor: m.buildEditor,
  })),
);
