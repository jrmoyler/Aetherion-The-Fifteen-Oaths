export const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export const ELEMENTS=Object.freeze(['fire','frost','storm','water','earth','crystal','wind','sound','nature','poison','light','holy','cosmic','gravity','shadow','void','blood','arcane','illusion','time','motion','tech','force']);
export const BASE_MATERIALS=Object.freeze({
 soil:{porosity:.7,permeability:.65,flammability:.12,conductivity:.16,hardness:.3,friction:.85,thermalCapacity:.65},
 sand:{porosity:.85,permeability:.8,flammability:0,conductivity:.07,hardness:.3,friction:.68,thermalCapacity:.43},
 stone:{porosity:.12,permeability:.05,flammability:0,conductivity:.09,hardness:.95,friction:.86,thermalCapacity:.74},
 basalt:{porosity:.08,permeability:.03,flammability:0,conductivity:.11,hardness:.95,friction:.88,thermalCapacity:.8},
 crystal:{porosity:0,permeability:0,flammability:0,conductivity:.21,hardness:.83,friction:.6,thermalCapacity:.41},
 wood:{porosity:.65,permeability:.35,flammability:.9,conductivity:.03,hardness:.48,friction:.76,thermalCapacity:.42},
 vegetation:{porosity:.55,permeability:.6,flammability:.76,conductivity:.13,hardness:.13,friction:.8,thermalCapacity:.5},
 water:{porosity:0,permeability:1,flammability:0,conductivity:.56,hardness:0,friction:.24,thermalCapacity:1},
 ice:{porosity:.03,permeability:.02,flammability:0,conductivity:.09,hardness:.7,friction:.09,thermalCapacity:.52},
 snow:{porosity:.85,permeability:.62,flammability:0,conductivity:.06,hardness:.1,friction:.46,thermalCapacity:.45},
 metal:{porosity:0,permeability:0,flammability:0,conductivity:.97,hardness:.88,friction:.57,thermalCapacity:.65},
 marble:{porosity:.13,permeability:.05,flammability:0,conductivity:.1,hardness:.8,friction:.76,thermalCapacity:.68},
 masonry:{porosity:.32,permeability:.18,flammability:0,conductivity:.09,hardness:.7,friction:.82,thermalCapacity:.72},
 ash:{porosity:.85,permeability:.7,flammability:0,conductivity:.06,hardness:.12,friction:.66,thermalCapacity:.36},
 organic:{porosity:.68,permeability:.5,flammability:.55,conductivity:.19,hardness:.17,friction:.76,thermalCapacity:.7}
});
export function material(name, overrides={}){if(!BASE_MATERIALS[name])throw Error(`unknown material: ${name}`);return {...BASE_MATERIALS[name],...overrides,id:name};}
export const DEFAULT_BIOME_MATERIAL=Object.freeze({amazon:'soil',sea:'sand',egypt:'sand',arctic:'snow',volcano:'basalt',haven:'marble',forest:'organic',taiga:'snow',savanna:'vegetation',canyon:'sand',alpine:'stone'});
