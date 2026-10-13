import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetSession, disposeGLTF } from '../lifecycle.mjs';
import { assetURL, normalizeManifest } from '../catalog.mjs';
function fixture() {
  const calls = { geometry:0, material:0, texture:0, image:0, boneTexture:0, skeleton:0, detached:0 };
  const texture = { isTexture:true, source:{ data:{close(){calls.image++;}} }, dispose(){calls.texture++;} };
  const boneTexture = { isTexture:true, dispose(){calls.boneTexture++;} };
  const geometry = { dispose(){calls.geometry++;} };
  const material = { map:texture, normalMap:texture, uniforms:{ maps:{value:[texture]} }, dispose(){calls.material++;} };
  const skeleton = { boneTexture, dispose(){calls.skeleton++;boneTexture.dispose();} };
  const nodes = [{geometry, material:[material,material], skeleton},{geometry,material,skeleton}];
  const scene = { traverse(fn){nodes.forEach(fn);}, removeFromParent(){calls.detached++;} };
  return { calls, gltf:{scene,scenes:[scene],animations:[]} };
}
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
test('resource disposal deduplicates shared geometry, materials, uniforms, images and skeletons', () => {
  const {gltf,calls} = fixture(); let stopped=0,uncached=0;
  disposeGLTF(gltf,{stopAllAction(){stopped++;},uncacheRoot(root){assert.equal(root,gltf.scene);uncached++;}});
  assert.deepEqual(calls,{geometry:1,material:1,texture:1,image:1,boneTexture:1,skeleton:1,detached:1});assert.equal(stopped,1);assert.equal(uncached,1);
});
test('late parsed result after replacement is disposed and never becomes active', async () => {
  const pending = [deferred(),deferred()], signals=[]; let i=0;
  const session = new AssetSession({load:(_,signal)=>{signals.push(signal);return pending[i++].promise;},makeMixer:()=>({})});
  const a=fixture(),b=fixture(); const pa=session.load('a'),pb=session.load('b');
  assert.equal(signals[0].aborted,true);pending[1].resolve(b.gltf);assert.equal((await pb).gltf,b.gltf);
  pending[0].resolve(a.gltf);assert.equal(await pa,null);assert.equal(a.calls.geometry,1);assert.equal(session.current.gltf,b.gltf);
  session.dispose();assert.equal(b.calls.texture,1);
});
test('shutdown aborts fetch, discards late parse and is idempotent', async () => {
  const d=deferred(),f=fixture();let signal;
  const session=new AssetSession({load:(_,s)=>{signal=s;return d.promise;},makeMixer:()=>({})});
  const pending=session.load('x');session.dispose();session.dispose();assert.equal(signal.aborted,true);
  d.resolve(f.gltf);assert.equal(await pending,null);assert.equal(f.calls.material,1);
  await assert.rejects(session.load('x'),/closed/);
});
test('failed current load surfaces error but a stale rejected load cannot overwrite it', async () => {
  const d=deferred();let i=0;
  const session=new AssetSession({load:()=>i++===0?d.promise:Promise.reject(new Error('current missing')),makeMixer:()=>({})});
  const stale=session.load('old');await assert.rejects(session.load('new'),/current missing/);d.reject(new Error('old missing'));assert.equal(await stale,null);assert.equal(session.current,null);
});
test('replacement stops actions, uncaches root and restores material ownership before dispose', async () => {
  const a=fixture(),b=fixture();let i=0,restored=0,stops=0,uncached=0;
  const session=new AssetSession({load:async()=>[a.gltf,b.gltf][i++],makeMixer:()=>({stopAllAction(){stops++;},uncacheRoot(){uncached++;}}),beforeRelease(){restored++;assert.equal(a.calls.geometry,0);}});
  await session.load('a');await session.load('b');assert.equal(restored,1);assert.equal(stops,1);assert.equal(uncached,1);assert.equal(a.calls.texture,1);
});
test('mixer construction failure disposes the decoded GLTF', async () => {
  const f=fixture();const session=new AssetSession({load:async()=>f.gltf,makeMixer(){throw new Error('mixer failure');}});
  await assert.rejects(session.load('x'),/mixer failure/);assert.equal(f.calls.geometry,1);
});
test('artist manifest maps repository-relative exports and authored LODs', () => {
  const rows=normalizeManifest({assets:[{id:'axe',name:'Axe',files:{glb:'assets/production/oath-04/weapons/axe.glb',lod1:'assets/production/oath-04/weapons/axe-lod1.glb'}}]},'oath-04/weapons/manifest.json');
  assert.deepEqual(rows[0].lods,[{level:0,url:'./production-assets/oath-04/weapons/axe.glb'},{level:1,url:'./production-assets/oath-04/weapons/axe-lod1.glb'}]);
});
test('manifest refuses non-GLB URLs, external protocols and traversal outside asset root', () => {
  for(const path of ['https://example.com/x.glb','../../../private.glb','x.glb?q=1','x.png'])assert.throws(()=>assetURL('oath-01/weapons/manifest.json',path));
  assert.throws(()=>normalizeManifest({assets:[{id:'x',glb:'x.glb',lods:[{level:0,path:'x.glb'}]}]},'oath-01/weapons/manifest.json'),/duplicate/);
});
test('separate state files never inherit ready LODs', () => {
  const [row]=normalizeManifest({assets:[{id:'staff',files:{glb:'staff.glb',lod1:'staff-lod1.glb',lod2:'staff-lod2.glb',damaged:'staff-damaged.glb',stowed:'staff-stowed.glb'}}]},'oath-04/weapons/manifest.json');
  assert.deepEqual(row.states.map(state=>[state.value,state.lods.map(lod=>lod.level)]),[['ready',[0,1,2]],['damaged',[0]],['stowed',[0]]]);
  assert.match(row.states[1].lods[0].url,/staff-damaged.glb$/);
});
test('separately manifested variant retains its ID and authored state LODs', () => {
  const [row]=normalizeManifest({assets:[{id:'kiln-sword-damaged',variant:'damaged',files:{glb:'damaged.glb',lod1:'damaged-lod1.glb'}}]},'oath-01/weapons/manifest.json');
  assert.equal(row.id,'kiln-sword-damaged');assert.equal(row.variant,'damaged');assert.equal(row.states.length,1);assert.equal(row.states[0].value,'damaged');assert.equal(row.states[0].lods.length,2);
});
