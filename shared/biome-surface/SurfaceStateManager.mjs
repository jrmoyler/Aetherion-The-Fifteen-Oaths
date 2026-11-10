import {clamp, material, ELEMENTS,DEFAULT_BIOME_MATERIAL} from './materials.mjs';
const key=(x,z,cellSize)=>`${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`;
const COPY_FIELDS=['temperature','wetness','snow','ice','burn','scorch','contamination','charge','integrity','growth','light','obscurity','conductivity','flammability','friction','brittleness'];
const NEIGHBOURS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
/* Deterministic 0..1 hash of integers (no Math.random, so replays and snapshots agree) */
const hashU=(a,b,c,d)=>{let h=Math.imul(a^0x9e3779b9,0x85ebca6b)^Math.imul(b+0x632be5ab,0xc2b2ae35)^Math.imul(c+0x7f4a7c15,0x27d4eb2f)^Math.imul(d+0x165667b1,0x9e3779b1);h^=h>>>15;h=Math.imul(h,0x2c1b3c6d);h^=h>>>12;h=Math.imul(h,0x297a2d39);h^=h>>>15;return (h>>>0)/4294967296;};
/** Deterministic, sparse surface layer. No THREE or DOM. Mutation and weather run in fixed ticks.
 *  Untouched ground follows a shared `ambient` state (the weather acting on bare ground); a cell exists only where
 *  an impact, a fire or a footstep made it diverge, and settles back into the ambient field once it has recovered. */
export class SurfaceStateManager {
 constructor({biomeId='amazon',cellSize=3,tickRate=30,maxCells=16000,maxMutationsPerTick=256,seed=1,materialAt=null,weather={},spread=true,spreadRate=1,prune=true}={}){
  if(!(cellSize>0&&tickRate>0))throw Error('invalid simulation scale');
  this.biomeId=biomeId;this.cellSize=cellSize;this.tickRate=tickRate;this.maxCells=maxCells;this.maxMutationsPerTick=maxMutationsPerTick;this.seed=seed;this.materialAt=materialAt;this.spread=spread;this.spreadRate=spreadRate;this.prune=prune;
  this.weather={temperature:18,precipitation:0,humidity:.5,wind:[0,0],light:1,...weather};this.tick=0;this.cells=new Map();this.pending=[];this.outbox=[];this.sequence=0;this._acc=0;this.revision=0;
  this.ambient=this._blank('ambient',0,0,material(DEFAULT_BIOME_MATERIAL[biomeId]??'soil'));
 }
 idAt(x,z){return key(x,z,this.cellSize)}
 base(x,z){const mat=this.materialAt?.(x,z,this.biomeId)??DEFAULT_BIOME_MATERIAL[this.biomeId]??'soil';return material(typeof mat==='string'?mat:mat.id,typeof mat==='string'?{}:mat)}
 _blank(id,x,z,m){return {id,x,z,material:m.id,base:m,temperature:this.weather.temperature,wetness:0,snow:0,ice:0,burn:0,scorch:0,contamination:0,charge:0,integrity:1,growth:m.id==='vegetation'?.5:0,light:this.weather.light,obscurity:0,conductivity:m.conductivity,flammability:m.flammability,friction:m.friction,brittleness:0,modifiers:[],revision:0,lastTouched:this.tick};}
 _create(x,z){const cs=this.cellSize,id=this.idAt(x,z),cx=(Math.floor(x/cs)+.5)*cs,cz=(Math.floor(z/cs)+.5)*cs,m=this.base(cx,cz),c=this._blank(id,cx,cz,m),a=this.ambient;
  // a new cell starts from the ground the weather has already made (soaked, snowed on, frozen)
  c.temperature=a.temperature;c.wetness=a.wetness;c.snow=a.snow;c.ice=a.ice;c.light=a.light;this._derive(c);return c;}
 get(x,z){const id=this.idAt(x,z);let c=this.cells.get(id);if(!c){c=this._create(x,z);if(this.cells.size>=this.maxCells)this._evict();this.cells.set(id,c);}c.lastTouched=this.tick;return c;}
 /** Read-only lookup: the cell if one exists, else null. Never allocates. */
 peek(x,z){return this.cells.get(this.idAt(x,z))??null}
 sample(x,z){const c=this.peek(x,z);if(c){c.lastTouched=this.tick;return this._view(c)}
  const cs=this.cellSize,cx=(Math.floor(x/cs)+.5)*cs,cz=(Math.floor(z/cs)+.5)*cs,v=this._create(x,z);return this._view(v,cx,cz);}
 _view(c){return Object.fromEntries(['id','material','x','z','revision',...COPY_FIELDS].map(p=>[p,c[p]]));}
 /* Evict a tenth in one pass (so a full grid does not sort on every new cell): settled ground first, then scars,
    never a live fire; the least recently touched go first within each class */
 _evict(){const rank=c=>c.burn>.05?2:c.integrity<.95?1:0;const arr=[...this.cells.values()].sort((a,b)=>rank(a)-rank(b)||a.lastTouched-b.lastTouched||a.id.localeCompare(b.id));const n=Math.max(1,Math.floor(arr.length*.1));for(let i=0;i<n;i++)this.cells.delete(arr[i].id)}
 setWeather(patch){for(const [k,v] of Object.entries(patch)){if(!['temperature','precipitation','humidity','wind','light'].includes(k))throw Error(`invalid weather property ${k}`);if(k==='wind'){if(!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite))throw Error('invalid wind');}else if(!Number.isFinite(v))throw Error('invalid weather value');this.weather[k]=k==='wind'?[...v]:v;}this.weather.precipitation=clamp(this.weather.precipitation);this.weather.humidity=clamp(this.weather.humidity);this.weather.light=clamp(this.weather.light)}
 enqueue({eventId,element,position,radius=2,intensity=1,ownerId='environment',abilityUid=null,kind='terrain-impact',tags=[]}){
  if(!ELEMENTS.includes(element))throw Error(`invalid element ${element}`);if(!Array.isArray(position)||position.length<3||!position.every(Number.isFinite)||!Number.isFinite(radius)||radius<0||radius>250||!Number.isFinite(intensity))throw Error('invalid impact');
  const evt={eventId:eventId??`surface:${this.tick}:${this.sequence++}`,element,position:[...position],radius,intensity:clamp(intensity,0,3),ownerId,abilityUid,kind,tags:[...tags]};this.pending.push(evt);return evt.eventId;
 }
 _apply(c,e,fall=1){const a=e.intensity*fall;switch(e.element){
 case 'fire':c.temperature+=35*a;c.burn=clamp(c.burn+.45*a*(c.flammability>.02?1:.25));c.wetness=clamp(c.wetness-.3*a);c.snow=clamp(c.snow-.4*a);c.ice=clamp(c.ice-.35*a);break;
 case 'frost':c.temperature-=30*a;c.ice=clamp(c.ice+.22*a+(c.wetness*.5));c.burn=clamp(c.burn-.6*a);break;
 case 'storm':c.charge=clamp(c.charge+.55*a);if(c.flammability>.3&&c.charge>.5)c.burn=clamp(c.burn+.35*a*c.flammability);break;
 case 'water':c.wetness=clamp(c.wetness+.6*a);c.temperature-=3*a;c.burn=clamp(c.burn-.7*a);break;
 case 'earth':c.integrity=clamp(c.integrity+.14*a);c.snow=clamp(c.snow-.2*a);break;
 case 'crystal':c.brittleness=clamp(c.brittleness+.32*a);break;
 case 'wind':c.obscurity=clamp(c.obscurity-.3*a);c.snow=clamp(c.snow-.15*a);break;
 case 'sound':c.brittleness=clamp(c.brittleness+.16*a);break;
 case 'nature':c.growth=clamp(c.growth+.4*a);break;
 case 'poison':c.contamination=clamp(c.contamination+.5*a);break;
 case 'light':c.light=clamp(c.light+.4*a);c.obscurity=clamp(c.obscurity-.3*a);break;
 case 'holy':c.contamination=clamp(c.contamination-.5*a);c.burn=clamp(c.burn-.12*a);break;
 case 'cosmic':c.modifiers.push({type:'astral',expires:this.tick+Math.round(4*this.tickRate)});break;
 case 'gravity':c.modifiers.push({type:'heavy',expires:this.tick+Math.round(4*this.tickRate)});c.snow=clamp(c.snow-.25*a);break;
 case 'shadow':c.obscurity=clamp(c.obscurity+.45*a);break;
 case 'void':c.modifiers.push({type:'suppression',expires:this.tick+Math.round(3*this.tickRate)});break;
 case 'blood':c.modifiers.push({type:'vital',expires:this.tick+Math.round(3*this.tickRate)});break;
 case 'arcane':c.modifiers.push({type:'inscribed',expires:this.tick+Math.round(4*this.tickRate)});break;
 case 'illusion':c.modifiers.push({type:'perception',expires:this.tick+Math.round(3*this.tickRate)});break;
 case 'time':c.modifiers.push({type:'delayed',expires:this.tick+Math.round(3*this.tickRate)});break;
 case 'motion':c.modifiers.push({type:'kinetic',expires:this.tick+Math.round(3*this.tickRate)});break;
 case 'tech':c.modifiers.push({type:'device',expires:this.tick+Math.round(5*this.tickRate)});break;
 case 'force':c.integrity=clamp(c.integrity-.35*a);c.snow=clamp(c.snow-.3*a);c.modifiers.push({type:'barrier',expires:this.tick+Math.round(3*this.tickRate)});break;
 }c.revision++;this._derive(c);
 }
 /* Fuel is what is left of the surface: a burnt-out cell no longer feeds a fire */
 _derive(c){c.wetness=clamp(c.wetness);c.ice=clamp(c.ice);c.snow=clamp(c.snow);c.burn=clamp(c.burn);c.charge=clamp(c.charge);c.temperature=clamp(c.temperature,-120,1200);c.integrity=clamp(c.integrity);c.conductivity=clamp(c.base.conductivity+c.wetness*.27+c.charge*.22);c.flammability=clamp(c.base.flammability*(1-c.wetness*.8)*(1-c.ice*.6)*(1-c.snow*.7)*(.08+.92*c.integrity));c.friction=clamp(c.base.friction-c.ice*.65+c.snow*.12,.04,1);c.brittleness=clamp(c.brittleness+c.ice*.04)}
 /* Weather acting on one cell over one tick */
 _weatherStep(c,dt){const w=this.weather;
  const heat=c.burn*(c.flammability>.02?1:.3);
  const target=w.temperature+heat*650;c.temperature+=clamp(target-c.temperature,-(heat>.05?40:2)*dt,(heat>.05?120:2)*dt);
  c.wetness=clamp(c.wetness+w.precipitation*(w.temperature>0?.03:.004)*dt-(1-w.humidity)*.012*dt-Math.max(c.temperature-30,0)*.00004*dt);
  c.snow=clamp(c.snow+(w.precipitation>0&&w.temperature<0?.025*w.precipitation*dt:0)-(c.temperature>0?.005*dt*(1+Math.max(c.temperature,0)*.02):0));
  c.ice=clamp(c.ice+(c.temperature<0?c.wetness*.014*dt:-(c.temperature>2?.015*dt:0)));
  if(c.burn>0&&c.flammability>.02){c.integrity=clamp(c.integrity-c.burn*c.flammability*.05*dt);c.burn=clamp(c.burn+(.12*c.flammability-.03-.2*(1-c.integrity)**2)*dt);}   // flares on fresh fuel, dies as it runs out
  else c.burn=clamp(c.burn-.08*dt);
  c.burn=clamp(c.burn-(w.precipitation*.12+c.wetness*.25)*dt);
  c.scorch=clamp(c.scorch+c.burn*.3*dt-(.0004+w.precipitation*.0008)*dt);   // char left behind; slowly washed out
  if(c.burn<.02&&c.integrity<1&&c.base.flammability>.3)c.integrity=clamp(c.integrity+(.0006+c.growth*.006)*dt);   // regrowth, faster where nature was seeded
  c.charge=clamp(c.charge-.15*dt);c.contamination=clamp(c.contamination-.004*dt);c.obscurity=clamp(c.obscurity-.04*dt);c.light+=(w.light-c.light)*.012*dt;
  c.growth=clamp(c.growth+(c.growth>(c.base.id==='vegetation'?.5:0)?-.004*dt:0));
 }
 _settled(c){const a=this.ambient;return c.burn<.005&&c.scorch<.01&&c.charge<.01&&c.contamination<.01&&c.obscurity<.01&&c.integrity>.995&&c.brittleness<.01&&!c.modifiers.length&&Math.abs(c.temperature-a.temperature)<.5&&Math.abs(c.wetness-a.wetness)<.01&&Math.abs(c.snow-a.snow)<.01&&Math.abs(c.ice-a.ice)<.01&&Math.abs(c.growth-(c.base.id==='vegetation'?.5:0))<.01}
 /* Flammability a neighbour would have, without allocating it */
 _fuelAt(x,z){const c=this.peek(x,z);if(c)return c.burn>.25?0:c.flammability;const m=this.base(x,z),a=this.ambient;return m.flammability*(1-a.wetness*.8)*(1-a.ice*.6)*(1-a.snow*.7)}
 advance(){this.tick++;this.revision++;const events=this.pending.splice(0,this.maxMutationsPerTick).sort((a,b)=>a.eventId.localeCompare(b.eventId));for(const e of events){const {position:[x,,z],radius}=e;const r=Math.max(radius,this.cellSize*.5);const count=Math.ceil(r/this.cellSize);const cx=Math.floor(x/this.cellSize),cz=Math.floor(z/this.cellSize);let changed=0;for(let dx=-count;dx<=count;dx++)for(let dz=-count;dz<=count;dz++){const px=(cx+dx+.5)*this.cellSize,pz=(cz+dz+.5)*this.cellSize,d=Math.hypot(px-x,pz-z);if(d>r+this.cellSize*Math.SQRT2/2)continue;this._apply(this.get(px,pz),e,radius>this.cellSize?1-.5*clamp(d/r):1);changed++;}this.outbox.push({eventId:e.eventId,element:e.element,position:e.position,changedCells:changed,ownerId:e.ownerId,abilityUid:e.abilityUid});}
  const dt=1/this.tickRate;this._weatherStep(this.ambient,dt);this._derive(this.ambient);
  // Fire spread reads this tick's state and applies ignitions afterwards, so cell order never matters
  const ign=[];
  if(this.spread){const [wx,wz]=this.weather.wind,wl=Math.hypot(wx,wz),cs=this.cellSize;
   for(const c of this.cells.values()){if(c.burn<.25||c.flammability<.02)continue;const ix=Math.floor(c.x/cs),iz=Math.floor(c.z/cs);
    for(let k=0;k<8;k++){const [dx,dz]=NEIGHBOURS[k],nx=c.x+dx*cs,nz=c.z+dz*cs,fuel=this._fuelAt(nx,nz);if(fuel<.05)continue;
     const along=wl>0?(dx*wx+dz*wz)/(wl*Math.hypot(dx,dz)):0,windK=Math.max(.15,1+along*Math.min(wl,14)*.18);
     const p=c.burn*fuel*.55*this.spreadRate*windK*dt/(k>3?1.4:1);
     if(hashU(this.seed,this.tick,ix*7919+dx,iz*104729+dz)<p)ign.push([nx,nz]);}}}
  for(const c of this.cells.values()){this._weatherStep(c,dt);c.modifiers=c.modifiers.filter(m=>m.expires>this.tick);this._derive(c);}
  for(const [x,z] of ign){const c=this.get(x,z);if(c.burn<.3){c.burn=clamp(c.burn+.4);c.temperature=Math.max(c.temperature,120);c.revision++;this._derive(c);this.outbox.push({eventId:`spread:${this.tick}:${c.id}`,element:'fire',position:[c.x,0,c.z],changedCells:1,ownerId:'environment',abilityUid:'environment/wildfire'});}}
  if(this.prune&&this.tick%this.tickRate===0)for(const [id,c] of this.cells)if(this._settled(c))this.cells.delete(id);
 }
 step(dt){this._acc+=Math.max(0,Math.min(dt,.25));const delta=1/this.tickRate;let guard=0;while(this._acc>=delta&&guard++<8){this._acc-=delta;this.advance();}}
 drain(){const r=this.outbox;this.outbox=[];return r}
 snapshot(){return {schema:'biome-surface-state@1',biomeId:this.biomeId,cellSize:this.cellSize,tickRate:this.tickRate,tick:this.tick,weather:structuredClone(this.weather),ambient:structuredClone(this.ambient),cells:[...this.cells.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(c=>structuredClone(c))}}
 restore(s){if(s.schema!=='biome-surface-state@1'||s.cellSize!==this.cellSize||s.tickRate!==this.tickRate)throw Error('incompatible surface snapshot');this.biomeId=s.biomeId;this.tick=s.tick;this.weather=structuredClone(s.weather);if(s.ambient)this.ambient=structuredClone(s.ambient);this.cells=new Map(s.cells.map(c=>[c.id,structuredClone(c)]));this.pending=[];this.outbox=[];}
 reset(biomeId=this.biomeId){this.biomeId=biomeId;this.tick=0;this.cells.clear();this.pending=[];this.outbox=[];this._acc=0;this.ambient=this._blank('ambient',0,0,material(DEFAULT_BIOME_MATERIAL[biomeId]??'soil'));}
}
