import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NEW_PRESETS,createPresetRuntime } from '../presets/runtime.js';

function snapshot(scene) {
  const result=[];
  scene.traverse(o=>{if(o.name==='ability-matrix:new-presets')return;result.push(o.type,...o.position.toArray(),...o.rotation.toArray().slice(0,3),...o.scale.toArray());if(o.geometry?.attributes.position)result.push(...o.geometry.attributes.position.array);if(o.isInstancedMesh)result.push(...o.instanceMatrix.array);});
  return result;
}
function finiteScene(scene){scene.traverse(o=>{for(const [name,a] of Object.entries(o.geometry?.attributes||{}))assert.ok(Array.from(a.array).every(Number.isFinite),`${o.name||o.type}.${name} contains nonfinite values`);for(const n of [...o.position.toArray(),...o.scale.toArray(),...o.quaternion.toArray()])assert.ok(Number.isFinite(n),`${o.type} transform contains nonfinite values`);if(o.isInstancedMesh)assert.ok(Array.from(o.instanceMatrix.array).every(Number.isFinite),'instance matrix invalid');});}

test('ten distinct new mechanic presets have complete metadata',()=>{
 assert.ok(NEW_PRESETS.length>=10);assert.equal(new Set(NEW_PRESETS.map(p=>p.id)).size,NEW_PRESETS.length);
 for(const p of NEW_PRESETS){for(const key of ['id','name','category','description','color','defaults','tags'])assert.ok(p[key],`${p.id}: ${key}`);assert.ok(p.tags.length>=2);assert.ok(p.defaults.duration>1);}
});

for(const preset of NEW_PRESETS)test(`${preset.id}: phases, finite geometry, events, and complete disposal`,()=>{
 const scene=new THREE.Scene(),events=[],runtime=createPresetRuntime({scene,onEvent:e=>events.push(e)});
 const origin=new THREE.Vector3(-2,0,4),target=new THREE.Vector3(1,0,-3),beforeOrigin=origin.clone(),beforeTarget=target.clone();
 const cast=runtime.cast(preset.id,{origin,target,seed:42});assert.ok(cast.duration>1);assert.equal(runtime.stats.active,1);assert.ok(runtime.stats.geometries>=3,'effect needs layered geometry');
 assert.deepEqual(origin,beforeOrigin);assert.deepEqual(target,beforeTarget);
 const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
 let disposedGeometries=0,disposedMaterials=0;for(const g of geometries)g.addEventListener('dispose',()=>disposedGeometries++);for(const m of materials)m.addEventListener('dispose',()=>disposedMaterials++);
 const initial=snapshot(scene);runtime.update(0);assert.deepEqual(snapshot(scene),initial);assert.equal(events.length,1,'zero dt should not emit extra events');
 for(let i=0;i<150;i++){runtime.update(cast.duration/150);finiteScene(scene);}
 runtime.update(.001);assert.equal(runtime.stats.active,0);assert.equal(runtime.stats.particles,0);assert.equal(runtime.stats.geometries,0);
 assert.equal(disposedGeometries,geometries.size,'all owned geometries disposed exactly once');assert.equal(disposedMaterials,materials.size,'all owned materials disposed exactly once');
 assert.ok(events.some(e=>['damage','heal','status','teleport','knockback'].includes(e.type)),'gameplay hook emitted');assert.equal(events[0].type,'cast');assert.equal(events.at(-1).type,'complete');
 for(const e of events){assert.equal(e.abilityId,preset.id);assert.equal(e.instanceId,cast.instanceId);assert.ok(Number.isFinite(e.time));assert.ok(e.position.length===3&&e.position.every(Number.isFinite));}
 runtime.dispose();runtime.dispose();assert.equal(scene.children.length,0);
});

test('same seed and time produce identical geometry and event sequences for every preset',()=>{
 for(const p of NEW_PRESETS){const s1=new THREE.Scene(),s2=new THREE.Scene(),e1=[],e2=[];const a=createPresetRuntime({scene:s1,onEvent:e=>e1.push(e)}),b=createPresetRuntime({scene:s2,onEvent:e=>e2.push(e)});a.cast(p.id,{seed:987});b.cast(p.id,{seed:987});a.update(p.defaults.duration*.57);b.update(p.defaults.duration*.57);assert.deepEqual(snapshot(s1),snapshot(s2),p.id);assert.deepEqual(e1,e2,p.id);a.dispose();b.dispose();}
});

test('large update cannot skip gameplay events and custom durations finish',()=>{
 for(const p of NEW_PRESETS){const events=[],runtime=createPresetRuntime({scene:new THREE.Scene(),onEvent:e=>events.push(e)});const handle=runtime.cast(p.id,{duration:2});runtime.update(1000);assert.equal(runtime.stats.active,0,p.id);assert.ok(events.some(e=>!['cast','complete','cancel'].includes(e.type)),p.id);assert.equal(events.at(-1).type,'complete');assert.equal(events.at(-1).time,handle.duration);runtime.dispose();}
});

test('capacity, cancellation, error isolation, invalid input, and reusable clear',()=>{
 const scene=new THREE.Scene(),events=[],runtime=createPresetRuntime({scene,maxEffects:2,onEvent:e=>{events.push(e);if(e.type==='damage')throw Error('host callback failure');}});
 const a=runtime.cast(NEW_PRESETS[0].id);runtime.cast(NEW_PRESETS[1].id);runtime.cast(NEW_PRESETS[2].id);assert.equal(runtime.stats.active,2);assert.ok(events.some(e=>e.instanceId===a.instanceId&&e.type==='cancel'&&e.reason==='capacity'));
 runtime.clear();assert.equal(runtime.stats.active,0);assert.equal(runtime.stats.geometries,0);runtime.cast(NEW_PRESETS[0].id);runtime.update(100);assert.ok(runtime.stats.eventErrors>0);
 assert.throws(()=>runtime.cast('missing'),RangeError);assert.throws(()=>runtime.cast(NEW_PRESETS[0].id,{origin:[NaN,0,0]}),TypeError);assert.throws(()=>runtime.update(-1),TypeError);assert.throws(()=>runtime.update(NaN),TypeError);
 runtime.dispose();assert.throws(()=>runtime.cast(NEW_PRESETS[0].id),/disposed/);assert.equal(scene.children.length,0);
});

test('targets are copied and extreme supported tuning remains finite',()=>{
 for(const p of NEW_PRESETS){const scene=new THREE.Scene(),runtime=createPresetRuntime({scene});const targets=[new THREE.Vector3(-1,0,-3),new THREE.Vector3(2,0,-4)];runtime.cast(p.id,{radius:8,power:4,duration:1.5,targets,origin:[0,0,0],target:[0,0,0],seed:0});runtime.update(.8);finiteScene(scene);assert.equal(targets[0].y,0,p.id);assert.equal(targets[1].y,0,p.id);runtime.dispose();}
});

test('event payloads and order match between normal playback and one skipped frame',()=>{
 for(const p of NEW_PRESETS){const a=[],b=[];const r1=createPresetRuntime({scene:new THREE.Scene(),onEvent:e=>a.push(e)}),r2=createPresetRuntime({scene:new THREE.Scene(),onEvent:e=>b.push(e)});r1.cast(p.id,{seed:321});r2.cast(p.id,{seed:321});for(let i=0;i<180;i++)r1.update(p.defaults.duration/180);r1.update(.001);r2.update(100);assert.deepEqual(a,b,p.id);r1.dispose();r2.dispose();}
});
