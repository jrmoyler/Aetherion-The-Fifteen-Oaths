import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Vector3, PerspectiveCamera, Group, Mesh, MeshStandardMaterial, BoxGeometry } from 'three';
import { initVFX, ELEMENT_STYLES } from './vfx.js';
import { SOURCE_ABILITY_IDS } from './source-abilities.js';

test('cosmetic impacts remain bounded and never move actors', async()=>{
  const scene=new Scene();let tick;const vfx=await initVFX({scene,addUpdate(fn){tick=fn;}});
  const position=new Vector3(3,4,5), target=new Vector3(10,4,15);
  const caster={position};for(let i=0;i<90;i++)vfx.play('basic:ninja',{caster,target,element:'frost'});
  assert.equal(vfx.activeCount,64);
  tick(.08);assert.deepEqual(position.toArray(),[3,4,5]);assert.deepEqual(target.toArray(),[10,4,15]);
  vfx.stopAll();assert.equal(vfx.activeCount,0);
  for(const element of Object.keys(ELEMENT_STYLES))vfx.impact(element,position);
  assert.equal(vfx.activeCount,15);for(let i=0;i<15;i++)tick(.1);
  assert.equal(vfx.activeCount,0);vfx.dispose();assert.equal(scene.children.length,0);
});

test('source casts use original geometry and source pool eviction cannot cancel a reused instance',async()=>{
  const scene=new Scene(),camera=new PerspectiveCamera();let tick;
  const vfx=await initVFX({scene,camera,addUpdate(fn){tick=fn;}});
  const caster={position:new Vector3(3,12,5)},target=new Vector3(3,12,17);
  const first=vfx.castEffect({id:'linear/ice'},{caster,target});
  assert.equal(first.instance.constructor.name,'IceAbility');
  assert.equal(first.sourceId,'linear/ice');
  assert.equal(first.instance.meshes.length,3);
  assert.ok(first.instance.meshes.every(m=>m.isInstancedMesh));
  assert.ok(first.instance.material.onBeforeCompile);
  const original=first.instance;
  for(let i=0;i<4;i++)vfx.castEffect({id:'linear/ice'},{caster,target});
  assert.equal(vfx.activeCount,4);
  assert.equal(first.done,true);
  first.stop(); // stale handle must not destroy the newly pooled cast
  assert.equal(original.isActive,true);
  assert.equal(camera.layers.isEnabled(1),true);
  assert.equal(camera.layers.isEnabled(4),true);
  for(let i=0;i<25;i++)tick(.04);
  assert.deepEqual(caster.position.toArray(),[3,12,5]);
  assert.deepEqual(target.toArray(),[3,12,17]);
  assert.equal(scene.getObjectByName('SourcePack:linear:12').position.y,12);
  const meteor=vfx.castEffect({id:'linear/meteor'},{caster,target});
  assert.notEqual(original.material.customProgramCacheKey(),meteor.instance.material.customProgramCacheKey(), 'different source shader patches must compile to different programs');
  assert.equal(SOURCE_ABILITY_IDS.length,150);
  assert.equal(new Set(SOURCE_ABILITY_IDS).size,150);
  vfx.dispose();assert.equal(scene.children.length,0);
});

test('cancelling cast anticipation allocates no original ability geometry',async()=>{
  const scene=new Scene();let tick;const vfx=await initVFX({scene,addUpdate(fn){tick=fn;}});
  const h=vfx.castEffect({id:'codex/hoarfrost'},{castTime:2,caster:{position:new Vector3()}});
  assert.equal(h.instance,undefined);h.stop();for(let i=0;i<30;i++)tick(.1);
  assert.equal(h.instance,undefined);assert.equal(vfx.activeCount,0);vfx.dispose();
});


test('three original boosts bind and restore body material hooks through cast cancellation',async()=>{
  const scene=new Scene();let tick;const vfx=await initVFX({scene,addUpdate(fn){tick=fn;}});
  const material=new MeshStandardMaterial(),root=new Group();root.add(new Mesh(new BoxGeometry(),material));
  const caster={root,position:new Vector3(2,5,3),height:1.9};
  for(const id of ['boost','magic','fire']) {
    const handle=vfx.castEffect({id:`linear-ext/${id}`},{caster});
    assert.notEqual(root.children[0].material,material);
    tick(.1);handle.stop();assert.equal(root.children[0].material,material);
  }
  vfx.dispose();assert.deepEqual(caster.position.toArray(),[2,5,3]);
});

test('confirmed impacts expand and projectiles carry a bounded directional trail', async () => {
  const scene = new Scene(), camera = new PerspectiveCamera(); let tick;
  const vfx = await initVFX({ scene, camera, addUpdate(fn) { tick = fn; } });
  vfx.play('basic:sorcerer', { element: 'fire', pos: new Vector3(), target: new Vector3(10, 0, 0) });
  const projectile = scene.getObjectByName('CombatEffect:projectile:fire');
  assert.ok(projectile, 'explicit element is respected for basic attacks');
  assert.equal(projectile.children.filter(c => c.name === 'ProjectileRibbon').length, 8);
  vfx.impact('earth', new Vector3(3, 0, 2));
  const wave = scene.getObjectByName('ImpactShockwave');
  tick(.05); const first = wave.scale.x;
  tick(.05); assert.ok(wave.scale.x > first);
  const ribbons = projectile.children.filter(c => c.name === 'ProjectileRibbon');
  assert.ok(ribbons[7].position.x < ribbons[0].position.x, 'trail follows behind travel');
  vfx.dispose(); assert.equal(scene.children.length, 0);
});
