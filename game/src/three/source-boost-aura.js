/** Per-actor binding of the original Ability Matrix FresnelAura body shader. */
import { createIsolatedFresnelAura } from '../../../runtime/ability-matrix/packs/linear-ext/src/materials/FresnelAura.js';

export function createSourceBoostAuras(environment) {
  const actors = new Map();
  function restore(entry) {
    entry.channel.clear();
    for(const slot of entry.slots) {
      // Respect an asset replacement or another owner changing a material.
      if(slot.mesh.material===slot.replacement)slot.mesh.material=slot.original;
    }
    for(const material of entry.clones.values())material.dispose();
    entry.slots.length=0;entry.clones.clear();actors.delete(entry.actor);
  }
  function bind(entry) {
    const root=entry.actor?.body?.root??entry.actor?.root??entry.actor?.mesh;
    root?.traverse(mesh=>{
      if(!mesh.isMesh || entry.slots.some(s=>s.mesh===mesh&&mesh.material===s.replacement))return;
      const original=mesh.material;
      const patch=material=>{
        if(!material?.isMeshStandardMaterial)return material;
        if(entry.clones.has(material))return entry.clones.get(material);
        const clone=material.clone();
        // Material.clone deliberately omits custom callbacks; preserve existing
        // skin/hair/armor patches before composing the source aura GLSL.
        clone.onBeforeCompile=material.onBeforeCompile;
        clone.customProgramCacheKey=()=>material.customProgramCacheKey();
        entry.channel.apply(clone,environment);
        clone.needsUpdate=true;entry.clones.set(material,clone);return clone;
      };
      const replacement=Array.isArray(original)?original.map(patch):patch(original);
      if(replacement===original)return;
      mesh.material=replacement;entry.slots.push({mesh,original,replacement});
    });
  }
  return {
    claim(actor, token, effect, config) {
      if(!actor)return ()=>{};
      let entry=actors.get(actor);
      if(!entry){entry={actor,channel:createIsolatedFresnelAura(),claims:new Map(),clones:new Map(),slots:[]};actors.set(actor,entry);}
      entry.claims.set(token,{effect,config});bind(entry);
      return ()=>{entry.claims.delete(token);if(!entry.claims.size)restore(entry);};
    },
    update() {
      for(const entry of actors.values()) {
        if(entry.actor.disposed){restore(entry);continue;}
        bind(entry);
        let winner=null;
        for(const claim of entry.claims.values())if(claim.effect.active&&(!winner||claim.effect.strength>winner.effect.strength))winner=claim;
        if(winner)entry.channel.sync(winner.effect.strength,entry.actor.position?.y??0,entry.actor.height??1.85,winner.config);
        else entry.channel.clear();
      }
    },
    reset(){for(const entry of [...actors.values()])restore(entry);},
    get activeCount(){return actors.size;},
  };
}
