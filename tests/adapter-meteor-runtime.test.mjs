/** Real source bridge/aim/cast integration on a CPU host. This does not boot
 * the DOM/WebGL App constructor or load the authored FBX character/targets.
 * The test supplies window EventTarget and frame scheduling only; it replaces
 * no source ability, aiming, collision, particle, or fissure implementation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera,Vector3} from '../runtime/ability-matrix/node_modules/three/build/three.module.js';
import {App} from '../runtime/ability-matrix/packs/sandbox/src/core/App.js';
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
import {installAetherionRuntimeRepairs} from '../src/abilities/InstallRuntimeRepairs.js';
import {createAbilityMatrixAdapter} from '../src/abilities/AbilityMatrixAdapter.js';
const catalog=JSON.parse(readFileSync(new URL('../runtime/ability-matrix/presets/catalog.json',import.meta.url)));

test('adapter.cast drives actual MatrixBridge, App aiming, Meteor, and automatic fissure repair',async()=>{
 const camera=new PerspectiveCamera(50,1,0.1,400);camera.position.set(0,15,20);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 const environment=new Environment(null,camera),scene=environment.scene;
 const h={scene,camera,environment,lights:new LightPool(scene),shake:new CameraShake({shakeOffset:new Vector3(),shakeRoll:0}),flash:new ScreenFlash(),character:new SandboxCharacter(environment),dummies:new DummyField(environment),settings,frame};
 const runtime=await create(h);
 assert.equal(runtime.ctx.fissures,undefined);
 // Source App methods run on a CPU-hosted instance. Renderer/editor construction
 // is intentionally not called. The runtime is already loaded and cached.
 const app=Object.assign(Object.create(App.prototype),h,{runtimes:new Map([['linear',runtime]]),_runtimeLoads:new Map(),nativePack:new Map(),aim:runtime.aim,slot:null,cooldowns:new Map(),paused:false});
 runtime.aim.on('cast',(origin,direction,distance)=>app._castVendor(runtime,origin,direction,distance));
 const old=Object.fromEntries(['window','location','requestAnimationFrame'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 globalThis.window=new EventTarget();globalThis.location=new URL('http://localhost/');
 let frames=0;
 globalThis.requestAnimationFrame=callback=>setImmediate(()=>{frames++;runtime.aim.setOrigin(h.character.position);runtime.aim.update(1/60);callback(frames*1000/60);});
 let bridge;
 try{
  const {installMatrixBridge}=await import('../runtime/ability-matrix/packs/sandbox/src/bridge/MatrixBridge.js');
  bridge=installMatrixBridge(app);
  const adapter=createAbilityMatrixAdapter({bridge,catalog});
  assert.equal(await adapter.cast('linear/meteor',{fraction:0.65}),true,'source aim should confirm a valid cast');
  assert.ok(runtime.ctx.fissures instanceof FissureSystem,'adapter must connect original source service before impact');
  assert.equal(bridge.castCount,1);assert.equal(runtime.active.length,1);assert.equal(runtime.active[0].element,'meteor');
  assert.ok(app.cooldowns.get('linear/meteor')>0,'source cast must set its own cooldown');
  let observedFissure=false,t=0;
  for(let i=0;i<1800;i++){
   t+=1/30;frame.uTime.value=t;frame.uDelta.value=1/30;
   runtime.update(1/30,1/30);runtime.afterBodies(1/30,t);
   if(runtime.ctx.fissures.active.length)observedFissure=true;
   if(!runtime.active.length&&!runtime.ctx.fissures.active.length)break;
  }
  assert.ok(observedFissure,'actual source Meteor must spawn actual source fissures');
  assert.equal(runtime.active.length,0);assert.equal(runtime.ctx.fissures.active.length,0);
 }finally{
  bridge?.stopAuto();runtime.dispose();h.lights.dispose();h.character.dispose();h.dummies.dispose();environment.dispose();
  for(const [k,descriptor]of Object.entries(old)){if(descriptor)Object.defineProperty(globalThis,k,descriptor);else Reflect.deleteProperty(globalThis,k);}
 }
});

// This second check covers the wrapper seam, independently of adapter.prepare:
// all source App callers load a repaired runtime before they can cast.
test('destination App load seam repairs the actual source runtime for native routes',async()=>{
 const camera=new PerspectiveCamera(),environment=new Environment(null,camera),scene=environment.scene;
 const h={scene,camera,environment,lights:new LightPool(scene),shake:new CameraShake({shakeOffset:new Vector3(),shakeRoll:0}),flash:new ScreenFlash(),character:new SandboxCharacter(environment),dummies:new DummyField(environment),settings,frame};
 const runtime=await create(h);
 const app=Object.assign(Object.create(App.prototype),h,{runtimes:new Map([['linear',runtime]]),_runtimeLoads:new Map()});
 try{
  assert.equal(runtime.ctx.fissures,undefined);
  const original=app.loadRuntime;
  assert.equal(installAetherionRuntimeRepairs(app),app);
  assert.notEqual(app.loadRuntime,original);
  const once=app.loadRuntime;installAetherionRuntimeRepairs(app);assert.equal(app.loadRuntime,once);
  // Use the real source App method (cached runtime path), no bridge spy.
  const loaded=await app.loadRuntime('linear');assert.equal(loaded,runtime);
  assert.ok(loaded.ctx.fissures instanceof FissureSystem);
  loaded.cast('meteor',new Vector3(),new Vector3(0,0,1),12);
  let seen=false,t=0;
  for(let i=0;i<1800;i++){t+=1/30;frame.uTime.value=t;loaded.update(1/30,1/30);loaded.afterBodies(1/30,t);seen ||= loaded.ctx.fissures.active.length>0;if(!loaded.active.length&&!loaded.ctx.fissures.active.length)break;}
  assert.ok(seen);assert.equal(loaded.active.length,0);assert.equal(loaded.ctx.fissures.active.length,0);
 }finally{runtime.dispose();h.lights.dispose();h.character.dispose();h.dummies.dispose();environment.dispose();}
});
