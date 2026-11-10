/**
 * Expansion-only direct-dummy fallback when the optional combat manager is off.
 * It never invents statuses, terrain, or reaction events. Damage is accumulated
 * against the sandbox dummy's normal one-hit health, and only a real Dummy.kill
 * is presented as a knockdown. Damage persists across casts in the same combat mode and dummy life. A recycled
 * dummy or combat mode change starts a fresh health pool.
 */
import { settings } from '../../config/settings.js';
import { validImpactForce } from './ImpactForce.js';

const worlds = new WeakMap();
const fail = (reason) => ({ok:false,reason});
function worldFor(ctx) {
  let world=worlds.get(ctx);
  if(!world){world={ids:new WeakMap(),nextId:0,nextHit:0,listeners:new Set(),host:null};worlds.set(ctx,world);}
  return world;
}
function idFor(world,dummy){let id=world.ids.get(dummy);if(!id){id=`standalone:${world.nextId++}`;world.ids.set(dummy,id);}return id;}
function activeDummies(ctx){
  if(!Array.isArray(ctx.dummies?.slots))return null;
  if(!settings.dummies.enabled)return [];
  return ctx.dummies.slots.map(slot=>slot?.dummy).filter(dummy=>dummy?.position&&typeof dummy.kill==='function');
}
function snapshot(world,health,dummy,generation){
  const entry=health.get(dummy);
  let hp=entry?.generation===generation?entry.hp:undefined;
  // A real dummy which has stood up starts with full health again.
  if(dummy.alive&&hp!==undefined&&hp<=0){hp=1;health.set(dummy,{hp,generation});}
  return {id:idFor(world,dummy),teamId:'targets',kind:'actor',position:[dummy.position.x,0,dummy.position.z],health:hp??1,maxHealth:1,shields:0,alive:!!dummy.alive,statuses:[],standGeneration:generation};
}
/** Bind the existing host's scoped physical-hit observer, not invented damage events. */
export function attachStandaloneHitObserver(ctx,host){
  const world=worldFor(ctx);
  world.host=host;
  return ()=>{if(world.host===host){world.host=null;world.listeners.clear();}};
}
export function notifyStandaloneHit(ctx,host,dummy,scope){
  const world=worlds.get(ctx);
  if(!world||world.host!==host||host.enabled||!world.listeners.size||!settings.dummies.enabled||
    !scope||typeof scope.uid!=='string'||!scope.uid||typeof scope.castId!=='string'||!scope.castId||scope.reactionId)return;
  if(!activeDummies(ctx)?.includes(dummy))return;
  const event=Object.freeze({eventId:`standalone-hit:${world.nextHit++}`,
    tick:Math.round((host._standaloneTime??0)*30),ownerId:'caster',
    abilityUid:scope.uid,castId:scope.castId,element:scope.element,
    targetIds:Object.freeze([idFor(world,dummy)]),
    position:Object.freeze([dummy.position.x,0,dummy.position.z])});
  for(const listener of [...world.listeners])if(world.listeners.has(listener)){
    try{listener(event);}catch{/* an extension must not interrupt a physical hit */}
  }
}
function fallback(ctx,uid,modeVersion){
  const world=worldFor(ctx);
  if(!world.health || world.healthModeVersion!==modeVersion){world.health=new WeakMap();world.healthModeVersion=modeVersion;}
  const health=world.health;
  const generation=(dummy)=>ctx.dummies?.standGeneration?.(dummy)??0;
  const find=(id)=>activeDummies(ctx)?.find(dummy=>idFor(world,dummy)===id);
  return {
    queryActors({position,radius,relation='enemy'}={}){
      const dummies=activeDummies(ctx);
      if(!dummies||!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite)||!Number.isFinite(radius)||radius<0||radius>48||!['enemy','ally','any'].includes(relation))return fail('standalone targets unavailable');
      for(const dummy of dummies)if(!dummy.alive)health.delete(dummy);
      const actors=relation==='ally'?[]:dummies.filter(d=>d.alive&&Math.hypot(d.position.x-position[0],d.position.z-position[2])<=radius).map(d=>snapshot(world,health,d,generation(d)));
      if(relation!=='enemy'&&ctx.character?.position){const p=ctx.character.position;if(Math.hypot(p.x-position[0],p.z-position[2])<=radius)actors.push({id:'caster',teamId:'player',kind:'actor',position:[p.x,p.y,p.z],health:1,maxHealth:1,shields:0,alive:true,statuses:[]});}
      actors.sort((a,b)=>a.id.localeCompare(b.id));return {ok:true,actors:actors.slice(0,32)};
    },
    getActor(id){if(id==='caster'&&ctx.character?.position){const p=ctx.character.position;return {ok:true,actor:{id,teamId:'player',position:[p.x,p.y,p.z],alive:true,health:1,statuses:[]}};}const dummy=find(id);return dummy?{ok:true,actor:snapshot(world,health,dummy,generation(dummy))}:fail('unknown standalone actor');},
    isBlocked(from,to){
      const validPoint=(point)=>Array.isArray(point)&&point.length===3&&point.every(Number.isFinite);
      return validPoint(from)&&validPoint(to)?{ok:true,blocked:false}:fail('invalid terrain query');
    },
    on(type,handler){
      if(type!=='hit'||typeof handler!=='function'||!world.host)return fail('owned hit observation unavailable');
      if(world.listeners.size>=64)return fail('subscription budget');
      world.listeners.add(handler);let active=true;
      return {ok:true,unsubscribe(){if(active){active=false;world.listeners.delete(handler);}}};
    },
    emit(event){
      if(event?.type!=='hit')return fail('status effects require combat');
      if(!Array.isArray(event.targetIds)||!event.targetIds.length||event.targetIds.length>8||new Set(event.targetIds).size!==event.targetIds.length||!Number.isFinite(event.damage)||event.damage<0||(event.hitForce!==undefined&&!validImpactForce(event.hitForce))||(event.position!==undefined&&(!Array.isArray(event.position)||event.position.length!==3||!event.position.every(Number.isFinite)))||(event.sourcePosition!==undefined&&(!Array.isArray(event.sourcePosition)||event.sourcePosition.length!==3||!event.sourcePosition.every(Number.isFinite))))return fail('invalid standalone hit');
      const targets=event.targetIds.map(find);if(targets.some(d=>!d||!d.alive))return fail('unknown or defeated standalone target');
      let accepted=0;
      for(const dummy of targets){
        const version=generation(dummy),prior=snapshot(world,health,dummy,version).health, next=Math.max(0,prior-Math.min(10,event.damage));
        if(next>0){health.set(dummy,{hp:next,generation:version});accepted++;continue;}
        const caster=ctx.character?.position,source=event.sourcePosition??event.position??[caster?.x??0,0,caster?.z??0];
        let dx=dummy.position.x-source[0],dz=dummy.position.z-source[2];
        let length=Math.hypot(dx,dz);
        if(length<1e-8&&event.hitForce){dx=dummy.position.x-(caster?.x??0);dz=dummy.position.z-(caster?.z??0);length=Math.hypot(dx,dz);}
        if(length<1e-8){dx=0;dz=1;}else{dx/=length;dz/=length;}
        // Only retain an existing scope if it actually belongs to this emitter.
        // A nested Pulse proc must not inherit the triggering cast's identity.
        const host=world.host,outer=host?.scope;
        if(host&&outer?.uid!==uid)host.scope=null;
        let fell;
        try{fell=dummy.kill(dx,dz,event.hitForce??{impulse:3,lift:2,spin:1});}
        finally{if(host&&outer?.uid!==uid)host.scope=outer;}
        if(fell){health.set(dummy,{hp:0,generation:version});accepted++;}
      }
      return accepted?{ok:true,standalone:true}:fail('standalone hit could not affect a dummy');
    }
  };
}

/** Route dynamically, so switching the manager off never queries stale snapshots. */
export function bindExpansionCombat(ctx,uid){
  const bridge=ctx.expansionCombat;
  if(!bridge?.bind)return null;
  const live=bridge.bind(uid,'caster');
  const standalone=()=>typeof bridge.enabled==='function'&&bridge.enabled()===false;
  const initialStandalone=standalone();
  const initialVersion=typeof bridge.modeVersion==='function'?bridge.modeVersion():null;
  const direct=fallback(ctx,uid,initialVersion);
  const stable=()=>standalone()===initialStandalone&&(initialVersion===null||bridge.modeVersion()===initialVersion);
  const route=(method,args)=>{if(!stable())return fail('combat mode changed during cast');return initialStandalone?direct[method](...args):live[method](...args);};
  return {
    get standalone(){return standalone();},
    get tickRate(){return initialStandalone?30:live.tickRate;},
    queryActors:(...args)=>route('queryActors',args),getActor:(...args)=>route('getActor',args),
    isBlocked:(...args)=>route('isBlocked',args),
    on:(type,handler)=>route('on',[type,typeof handler==='function'?(...args)=>{if(stable())handler(...args);}:handler]),
    emit:(...args)=>route('emit',args)
  };
}
