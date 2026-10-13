import * as THREE from 'three';
import { NEW_PRESETS } from './new/catalog.js';
import { seededRandom } from './new/kit.js';
import { CORE_FACTORIES } from './new/core.js';
import { SUPPORT_FACTORIES } from './new/support.js';
export { NEW_PRESETS } from './new/catalog.js';
const FACTORIES={...CORE_FACTORIES,...SUPPORT_FACTORIES};
const finite=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
function vector(value,fallback,name) {
  if(value==null)return fallback.clone();
  const xyz=Array.isArray(value)?value:[value.x,value.y,value.z];
  if(xyz.length<3||!xyz.slice(0,3).every(Number.isFinite))throw new TypeError(`${name} must contain three finite coordinates`);
  return new THREE.Vector3(...xyz.slice(0,3));
}
function release(group) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)for(const m of Array.isArray(object.material)?object.material:[object.material])materials.add(m);});
  for(const m of materials){for(const value of Object.values(m))if(value?.isTexture)textures.add(value);for(const value of Object.values(m.uniforms||{}))if(value?.value?.isTexture)textures.add(value.value);}
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();group.removeFromParent();group.clear();
}
/**
 * Portable, asset-free new-ability runtime. Pass seconds to update; update(0) is a true pause.
 * All geometry is owned by this instance; no scene, camera or renderer global state is changed.
 */
export function createPresetRuntime({scene,camera=null,renderer=null,onEvent=null,maxEffects=12}={}) {
  if(!scene?.isObject3D)throw new TypeError('createPresetRuntime requires a Three.js scene or Object3D');
  const root=new THREE.Group();root.name='ability-matrix:new-presets';scene.add(root);
  const effects=[];let nextId=1,totalCasts=0,totalEvents=0,eventErrors=0,disposed=false,clock=0;
  const capacity=Math.round(finite(maxEffects,12,1,32));
  function notify(effect,type,payload={}) {
    totalEvents++;
    const {time=effect.age,...rest}=payload;
    const event=Object.freeze({abilityId:effect.id,instanceId:effect.instanceId,type,time,position:effect.target.toArray(),radius:effect.params.radius,...rest});
    try{onEvent?.(event);}catch{eventErrors++;}
  }
  function remove(effect,reason='complete') {
    if(effect.removed)return;effect.removed=true;
    effect.impl?.dispose?.();release(effect.group);const index=effects.indexOf(effect);if(index>=0)effects.splice(index,1);
    notify(effect,reason==='complete'?'complete':'cancel',{reason});
  }
  return {
    cast(id,options={}) {
      if(disposed)throw new Error('This ability runtime has been disposed');
      const preset=NEW_PRESETS.find(p=>p.id===id);if(!preset||!FACTORIES[id])throw new RangeError(`Unknown new ability preset: ${id}`);
      const origin=vector(options.origin,new THREE.Vector3(0,0,4),'origin');const target=vector(options.target,new THREE.Vector3(0,0,-3),'target');
      const params={...preset.defaults,...options,color:options.color||preset.color};
      params.radius=finite(params.radius,preset.defaults.radius,.5,8);params.power=finite(params.power,1,.1,4);params.duration=finite(params.duration,preset.defaults.duration,1.5,15);params.seed=finite(params.seed,1,0,4294967295)>>>0;
      params.targets=(Array.isArray(options.targets)?options.targets:[]).slice(0,12).map((v,i)=>vector(v,target,`targets[${i}]`));
      if(effects.length>=capacity)remove(effects[0],'capacity');
      const group=new THREE.Group();group.name=`ability:${id}:${nextId}`;root.add(group);
      const effect={id,instanceId:`cast-${nextId++}`,group,origin,target,params,age:0,removed:false,impl:null};
      const emit=(type,payload)=>notify(effect,type,payload);
      try{effect.impl=FACTORIES[id]({group,origin,target,params,camera,renderer,random:seededRandom(params.seed),emit});}
      catch(error){release(group);throw error;}
      effect.duration=effect.impl.duration;effects.push(effect);totalCasts++;
      notify(effect,'cast',{duration:effect.duration});effect.impl.update(0,0);
      return Object.freeze({id,instanceId:effect.instanceId,duration:effect.duration,dispose:()=>remove(effect,'manual')});
    },
    update(dt) {
      if(disposed)return;if(!Number.isFinite(dt)||dt<0)throw new TypeError('update(dt) requires finite nonnegative seconds');if(dt===0)return;
      clock+=dt;
      for(const effect of [...effects]){if(effect.removed)continue;const previous=effect.age;effect.age=Math.min(effect.duration,effect.age+dt);effect.impl.update(effect.age,effect.age-previous);if(effect.age>=effect.duration)remove(effect);}
    },
    clear(){for(const effect of [...effects])remove(effect,'clear');},
    dispose(){if(disposed)return;for(const effect of [...effects])remove(effect,'dispose');root.removeFromParent();disposed=true;},
    get stats(){let objects=0,particles=0;const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o!==root)objects++;if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o.isPoints)particles+=o.geometry.attributes.position?.count||0;});return Object.freeze({active:effects.length,activeEffects:effects.length,capacity,totalCasts,totalEvents,eventErrors,objects,geometries:geometries.size,materials:materials.size,particles,elapsed:clock,disposed});}
  };
}
