import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, MeshStandardMaterial, BoxGeometry, Vector3, ShaderLib } from 'three';
import { createSourceBoostAuras } from './source-boost-aura.js';
import { patchOnBeforeCompile } from '../../../runtime/ability-matrix/packs/sandbox/src/utils/shaderPatch.js';
import { settings } from '../../../runtime/ability-matrix/packs/linear-ext/src/config/settings.js';

const environment={registerShadowCasterWithPatch:patchOnBeforeCompile};
function actor(material,y=0){const root=new Group();root.add(new Mesh(new BoxGeometry(),material));return {root,position:new Vector3(1,y,3),height:1.9};}
function compile(material){const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader,{});return shader;}

test('original aura GLSL has actor-local colours, height and envelopes with shared source materials',()=>{
  const original=new MeshStandardMaterial({color:0x123456});
  let previousCalls=0;original.onBeforeCompile=()=>{previousCalls++;};
  const a=actor(original,7),b=actor(original,24),untouched=actor(original);
  const manager=createSourceBoostAuras(environment);
  const fire={active:true,strength:.9},magic={active:true,strength:.3};
  const releaseA=manager.claim(a,{},fire,settings.fire),releaseB=manager.claim(b,{},magic,settings.magic);
  manager.update();
  const shaderA=compile(a.root.children[0].material),shaderB=compile(b.root.children[0].material);
  assert.equal(previousCalls,2);
  assert.match(shaderA.fragmentShader,/uAuraVeinSharp/);
  assert.match(shaderA.vertexShader,/vAuraBind = transformed/);
  assert.notEqual(shaderA.uniforms.uAuraStrength,shaderB.uniforms.uAuraStrength);
  assert.notEqual(shaderA.uniforms.uAuraColorRim,shaderB.uniforms.uAuraColorRim);
  assert.equal(shaderA.uniforms.uAuraBaseY.value,7);assert.equal(shaderB.uniforms.uAuraBaseY.value,24);
  assert.notDeepEqual(shaderA.uniforms.uAuraColorRim.value,shaderB.uniforms.uAuraColorRim.value);
  assert.equal(untouched.root.children[0].material,original);
  const beforeB=shaderB.uniforms.uAuraStrength.value;fire.strength=.2;manager.update();
  assert.equal(shaderB.uniforms.uAuraStrength.value,beforeB);
  releaseA();assert.equal(a.root.children[0].material,original);assert.equal(shaderA.uniforms.uAuraStrength.value,0);
  assert.notEqual(b.root.children[0].material,original);
  releaseB();assert.equal(b.root.children[0].material,original);assert.equal(manager.activeCount,0);
});

test('overlapping original boosts resolve strongest per actor and cancellation restores exact material arrays',()=>{
  const original=new MeshStandardMaterial(),a=actor([original,original]);
  const originals=a.root.children[0].material,manager=createSourceBoostAuras(environment);
  const electric={active:true,strength:.8},fire={active:true,strength:.4};
  const releaseElectric=manager.claim(a,{},electric,settings.boost),releaseFire=manager.claim(a,{},fire,settings.fire);
  manager.update();const patched=a.root.children[0].material[0],shader=compile(patched);
  assert.equal(a.root.children[0].material[0],a.root.children[0].material[1]);
  const electricColour=shader.uniforms.uAuraColorRim.value.clone();
  releaseElectric();manager.update();assert.notDeepEqual(shader.uniforms.uAuraColorRim.value,electricColour);
  let disposed=0;patched.addEventListener('dispose',()=>disposed++);
  releaseFire();assert.equal(a.root.children[0].material,originals);assert.equal(disposed,1);
  manager.reset();assert.equal(disposed,1);
});
