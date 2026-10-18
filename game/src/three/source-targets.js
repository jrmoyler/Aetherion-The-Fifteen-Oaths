import { Group, Vector3, Quaternion, Plane, Color } from 'three';
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,Number.isFinite(x)?x:0));
const vec=p=>new Vector3(p?.x||0,p?.y||0,p?.z||0);

/** Presentation-only responses to original source dummy callbacks.
 * Actor.root, snapshots, HP and collision remain entirely server owned. A disposable
 * child group offsets the authored model, then eases back to its exact rest transform.
 */
export function createSourceTargetReactions(ctx={}) {
  const entries=new Map(), proxies=new WeakMap();
  function entry(actor) {
    let e=entries.get(actor);if(e)return e;
    const body=actor.body?.root;
    const wrapper=new Group();wrapper.name='Source ability presentation';
    if(body?.parent){const parent=body.parent;parent.add(wrapper);wrapper.add(body);}
    const materials=[];
    body?.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m&&!materials.some(v=>v.m===m))materials.push({m,color:m.color?.clone(),emissive:m.emissive?.clone(),intensity:m.emissiveIntensity,opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite,planes:m.clippingPlanes});});
    e={actor,body,wrapper,materials,offset:new Vector3(),velocity:new Vector3(),tilt:0,spin:0,age:0,ttl:0,affected:false,frozen:false,held:false,consumed:0,tint:null,stain:0,pin:null,plane:null};
    entries.set(actor,e);return e;
  }
  function touch(e,ttl=.7){e.age=0;e.ttl=Math.max(e.ttl,ttl);}
  function clear(e){
    for(const s of e.materials){const m=s.m;if(s.color)m.color.copy(s.color);if(s.emissive)m.emissive.copy(s.emissive);m.emissiveIntensity=s.intensity;m.opacity=s.opacity;m.transparent=s.transparent;m.depthWrite=s.depthWrite;if(m.clippingPlanes!==s.planes){m.clippingPlanes=s.planes;m.needsUpdate=true;}}
    if(e.body?.parent===e.wrapper){const parent=e.wrapper.parent;if(parent)parent.add(e.body);}
    e.wrapper.removeFromParent();entries.delete(e.actor);
  }
  function proxy(actor,floor=0){
    let floors=proxies.get(actor);if(!floors){floors=new Map();proxies.set(actor,floors);}if(floors.has(floor))return floors.get(floor);
    const p={
      get position(){const e=entries.get(actor);return vec(actor.position).add(e?.offset??new Vector3()).add(new Vector3(0,-floor,0));},
      get alive(){return actor.alive!==false&&!entries.get(actor)?.affected;},get finished(){return actor.disposed===true;},get root(){return actor.root;},
      get cutPoint(){return this.position.add(new Vector3(0,(actor.body?.height??1.8)*.5,0));},
      get state(){const e=entries.get(actor);return e?.frozen?'frozen':e?.affected?'falling':'alive';},
      kill(x=0,z=0,force={}){const e=entry(actor);if(e.affected)return false;e.affected=true;e.velocity.set(clamp(x,-1,1)*clamp(force.impulse??2,0,12),clamp(force.lift??2,0,8),clamp(z,-1,1)*clamp(force.impulse??2,0,12));e.tilt=.95;e.spin=clamp(force.spin??.3,-2,2);touch(e,1.8);actor.playAnim?.('hit');return true;},
      freeze(){const e=entry(actor);e.frozen=true;e.tint=new Color('#a3d9ed');e.stain=.65;touch(e,1.6);actor.playAnim?.('hit');return true;},
      vanish(){const e=entry(actor);e.consumed=1;touch(e,.8);},
      hold(){const e=entry(actor);e.held=true;touch(e);return true;},
      release(){const e=entries.get(actor);if(e){e.held=false;e.frozen=false;e.pin=null;e.ttl=Math.min(e.ttl,e.age+.45);}},
      bodyPoint(out){return out.copy(this.cutPoint);},bodyVelocity(out){return out.copy(entries.get(actor)?.velocity??new Vector3());},
      skinnedMeshes(out=[]){out.length=0;actor.root?.traverse(o=>{if(o.isSkinnedMesh)out.push(o);});return out;},
      carry(field,grab=1,grabY=grab,buoyancy=0){const e=entry(actor),at=this.cutPoint,flow=new Vector3();if(typeof field==='function')field(at.x,at.y,at.z,flow);if([flow.x,flow.y,flow.z].every(Number.isFinite)){e.velocity.x+=(clamp(flow.x,-12,12)-e.velocity.x)*clamp(grab);e.velocity.z+=(clamp(flow.z,-12,12)-e.velocity.z)*clamp(grab);e.velocity.y+=(clamp(flow.y,-8,8)+clamp(buoyancy)*2-e.velocity.y)*clamp(grabY);}e.held=true;touch(e);},
      sink(depth=0){const e=entry(actor);e.offset.y=-clamp(depth,0,4);e.velocity.y=0;e.held=true;touch(e);},
      consume(amount=0){const e=entry(actor);e.consumed=clamp(amount);touch(e);},
      corrode(amount=0,look={}){const e=entry(actor);e.stain=Math.max(e.stain,clamp(amount));const color=look.color??look.edgeColor??'#6c9860';try{e.tint=new Color(color);}catch{e.tint=new Color('#6c9860');}touch(e);return e.stain;},
      pin(name,at,stiffness=1){if(!at)return false;const e=entry(actor);e.pin=vec(at).add(new Vector3(0,floor-(actor.body?.height??1.8)*.5,0)).sub(actor.position);e.pin.clampLength(0,8);e.pinWeight=clamp(stiffness);e.held=true;touch(e);return true;},
      unpin(){const e=entries.get(actor);if(e){e.pin=null;e.held=false;}},
      shove(x=0,y=0,z=0){const e=entry(actor);e.velocity.add(new Vector3(clamp(x,-12,12),clamp(y,-8,8),clamp(z,-12,12)));touch(e);actor.playAnim?.('hit');},
      clip(region,normal,point=null,look=null){const e=entry(actor);touch(e);if(!normal){e.plane=null;return;}const n=vec(normal).normalize(),at=point?vec(point).add(new Vector3(0,floor,0)):vec(actor.position);e.plane=new Plane().setFromNormalAndCoplanarPoint(n,at);if(ctx.renderer)ctx.renderer.localClippingEnabled=true;},
      strain(){const e=entry(actor);e.tilt=.22;touch(e);},loosen(){this.release();},tear(){const e=entry(actor);e.tilt=1.1;e.velocity.y=1;touch(e,1.2);actor.playAnim?.('hit');},
      joint(name,out){let bone=actor.body?.sockets?.[name];if(!bone)actor.body?.root?.traverse(o=>{if(o.isBone&&o.name.toLowerCase()===String(name).toLowerCase())bone=o;});if(bone){bone.updateWorldMatrix(true,false);bone.getWorldPosition(out);out.y-=floor;return out;}return this.bodyPoint(out);},
      jointQuaternion(name,out){const bone=actor.body?.sockets?.[name];return bone?bone.getWorldQuaternion(out):out.copy(actor.root?.quaternion??new Quaternion());},
    };floors.set(floor,p);return p;
  }
  function update(dt){
    dt=clamp(dt,0,.05);
    for(const e of [...entries.values()]){
      if(e.actor.disposed||e.body!==e.actor.body?.root){clear(e);continue;}
      e.age+=dt;const recovering=e.age>e.ttl;
      if(recovering){e.offset.multiplyScalar(Math.exp(-dt*10));e.tilt*=Math.exp(-dt*10);e.velocity.set(0,0,0);e.consumed*=Math.exp(-dt*10);e.stain*=Math.exp(-dt*10);e.plane=null;}
      else if(!e.frozen){if(e.pin)e.offset.lerp(e.pin,e.pinWeight??1);else{if(!e.held)e.velocity.y-=dt*9.8;e.offset.addScaledVector(e.velocity,dt);e.velocity.x*=Math.exp(-dt*2);e.velocity.z*=Math.exp(-dt*2);if(!e.held&&e.offset.y<0){e.offset.y=0;e.velocity.y=0;}e.offset.clampLength(0,8);}}
      // Convert world-space displacement to actor-local coordinates; only the child moves.
      const local=e.offset.clone().applyQuaternion(e.actor.root.quaternion.clone().invert());local.divide(e.actor.root.scale);e.wrapper.position.copy(local);e.wrapper.rotation.set(e.tilt,0,Math.sin(e.age*5)*e.spin*.15);e.wrapper.scale.setScalar(1-e.consumed*.92);
      for(const s of e.materials){const m=s.m;if(s.color&&e.tint)m.color.copy(s.color).lerp(e.tint,e.stain*.75);if(s.emissive&&e.tint){m.emissive.copy(s.emissive).lerp(e.tint,e.stain*.2);m.emissiveIntensity=Math.max(s.intensity??0,e.stain*.4);}m.opacity=s.opacity*(1-e.consumed*.9);m.transparent=s.transparent||e.consumed>.01;m.depthWrite=s.depthWrite&&e.consumed<.65;const planes=e.plane?[e.plane]:s.planes;if((m.clippingPlanes?.length??0)!==(planes?.length??0))m.needsUpdate=true;m.clippingPlanes=planes;}
      if(e.age>e.ttl+.65)clear(e);
    }
  }
  return {proxy,update,reset(){for(const e of [...entries.values()])clear(e);},get activeCount(){return entries.size;}};
}
