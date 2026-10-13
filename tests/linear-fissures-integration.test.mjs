import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from '../runtime/ability-matrix/node_modules/three/build/three.module.js';
import {Environment} from '../runtime/ability-matrix/packs/sandbox/src/world/Environment.js';
import {LightPool} from '../runtime/ability-matrix/packs/sandbox/src/effects/LightPool.js';
import {CameraShake} from '../runtime/ability-matrix/packs/sandbox/src/effects/CameraShake.js';
import {ScreenFlash} from '../runtime/ability-matrix/packs/sandbox/src/effects/ScreenFlash.js';
import {SandboxCharacter} from '../runtime/ability-matrix/packs/sandbox/src/sandbox/SandboxCharacter.js';
import {DummyField} from '../runtime/ability-matrix/packs/sandbox/src/combat/DummyField.js';
import {settings} from '../runtime/ability-matrix/packs/sandbox/src/config/settings.js';
import {frame} from '../runtime/ability-matrix/packs/sandbox/src/core/FrameUniforms.js';
import {create} from '../runtime/ability-matrix/packs/sandbox/src/vendor/runtimes/linear.js';
import {FissureSystem} from '../runtime/ability-matrix/packs/sandbox/src/vendor/linear/effects/GroundFissures.js';
import {attachLinearFissures} from '../src/abilities/LinearFissuresIntegration.js';

function host() {
 const camera=new PerspectiveCamera(),environment=new Environment(null,camera),scene=environment.scene;
 return {scene,camera,environment,lights:new LightPool(scene),shake:new CameraShake({shakeOffset:new Vector3(),shakeRoll:0}),flash:new ScreenFlash(),character:new SandboxCharacter(environment),dummies:new DummyField(environment),settings,frame};
}
function finiteGeometry(scene) {scene.traverse(o=>{for(const attr of Object.values(o.geometry?.attributes??{}))for(const n of attr.array)assert.ok(Number.isFinite(n));for(const n of [...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()])assert.ok(Number.isFinite(n));});}

test('Aetherion connects the real source fissures and completes, reuses, clears and disposes Meteor',async()=>{
 const h=host(),runtime=await create(h);
 try {
  assert.equal(runtime.ctx.fissures,undefined,'baseline source omission changed; revisit compatibility repair');
  assert.equal(attachLinearFissures(runtime),runtime);
  const fissures=runtime.ctx.fissures;
  assert.ok(fissures instanceof FissureSystem);
  assert.equal(attachLinearFissures(runtime),runtime);
  assert.equal(runtime.ctx.fissures,fissures,'attachment must be idempotent');
  const meteor=runtime.cast('meteor',new Vector3(),new Vector3(0,0,1),12);
  let t=0,spawned=null;
  for(let i=0;i<1800;i++){
   const dt=1/30;t+=dt;frame.uTime.value=t;frame.uDelta.value=dt;
   runtime.update(dt,dt);runtime.afterBodies(dt,t);
   if(fissures.active.length&&!spawned){spawned=fissures.active[0];assert.ok(spawned.geometry.attributes.position.count>0);finiteGeometry(fissures.group);}
   if(!runtime.active.length&&!fissures.active.length)break;
  }
  assert.ok(spawned,'Meteor must create the original source fissure geometry');
  assert.equal(runtime.active.length,0,'Meteor must retire');
  assert.equal(fissures.active.length,0,'Fissures must naturally retire');
  assert.ok(t<60,'bounded lifecycle should complete');
  assert.ok(fissures.pool.free.includes(spawned),'source fissure should return to its pool');
  const second=runtime.cast('meteor',new Vector3(),new Vector3(0,0,1),12);
  assert.ok(second===meteor,'source ability pooling is preserved');
  for(let i=0;i<90&&!fissures.active.length;i++){t+=1/30;frame.uTime.value=t;runtime.update(1/30,1/30);runtime.afterBodies(1/30,t);}
  assert.ok(fissures.active.includes(spawned),'source fissure pooling is preserved');
  const age=spawned.age;runtime.afterBodies(0.125,t+0.125);
  assert.ok(Math.abs(spawned.age-age-0.125)<1e-8,'fissures update exactly once per hosted frame');
  runtime.clear();assert.equal(runtime.active.length,0);assert.equal(fissures.active.length,0);
  assert.equal(fissures.group.children.length,0);assert.equal(h.lights.lights.filter(x=>x.inUse).length,0);
  let disposed=0;spawned.geometry.addEventListener('dispose',()=>disposed++);
  runtime.dispose();assert.equal(disposed,1);assert.equal(fissures.group.parent,null);
 }finally{
  runtime.dispose();h.lights.dispose();h.character.dispose();h.dummies.dispose();h.environment.dispose();
 }
});

test('Aetherion rejects a different or incomplete runtime instead of changing it',()=>{
 assert.throws(()=>attachLinearFissures({pack:'casting'}),TypeError);
 assert.throws(()=>attachLinearFissures(null),TypeError);
});
