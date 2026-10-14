import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../runtime/ability-matrix/packs/sandbox/node_modules/three/build/three.module.js';
import { FBXLoader } from '../runtime/ability-matrix/packs/sandbox/node_modules/three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from '../runtime/ability-matrix/packs/sandbox/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { bindEquipmentToApp, createEquipmentController, findSourceSockets, proposedAlignment } from '../src/production/equipment.js';
import { loadEquipmentCatalog, productionURL } from '../src/production/catalog.js';
const repo = new URL('../', import.meta.url);
const arrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
let source;
async function sourceRig() {
  if (source) return source.clone(true);
  // Texture CPU placeholders are restricted to this test; actual FBX geometry,
  // hierarchy, transforms, and animation clips are parsed from original bytes.
  globalThis.window ??= { URL, innerWidth: 1, innerHeight: 1 };
  const manager = new THREE.LoadingManager();
  manager.addHandler(/\.(png|jpg|jpeg|tga|bmp)$/i, { load: () => new THREE.Texture(), setPath() { return this; } });
  const bytes = await readFile(new URL('runtime/ability-matrix/packs/sandbox/public/models/Idle.fbx', repo));
  source = new FBXLoader(manager).parse(arrayBuffer(bytes), '');
  source.scale.setScalar(.01); source.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(source).getSize(new THREE.Vector3());
  source.scale.setScalar(.01 * 1.78 / size.y); source.updateMatrixWorld(true);
  return source.clone(true);
}
async function candidate() {
  const manifest = JSON.parse(await readFile(new URL('assets/production/oath-04/weapons/manifest.json', repo)));
  const row = manifest.assets.find(a => a.id === 'tidal-tide-orb-staff');
  const bytes = await readFile(new URL(row.files.glb, repo));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'CPU_GEOMETRY_ONLY', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  return { asset: { ...row, url: row.files.glb, alignment: proposedAlignment(row) }, gltf: await loader.parseAsync(arrayBuffer(bytes), '') };
}
test('actual source FBX sockets and source hash match recorded inspection', async () => {
  const model = await sourceRig(), sockets = findSourceSockets(model);
  const inspection = JSON.parse(await readFile(new URL('src/production/SOURCE_RIG_INSPECTION.json', repo)));
  assert.equal(inspection.bones.length, 25);
  for (const key of ['hand','leftHand','stow']) assert.ok(inspection.bones.some(b => b.name === sockets[key].name));
  const bytes = await readFile(new URL(inspection.source, repo));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), inspection.sourceSha256);
});
test('real GLB mounts to actual hand at meter scale, animates, stows, and disposes once', async () => {
  const model = await sourceRig(), { asset, gltf } = await candidate();
  const originals = new Map(); model.traverse(n => { if (n.isBone) originals.set(n.uuid, [n.position.clone(), n.quaternion.clone(), n.scale.clone()]); });
  let geometries = 0, materialDisposals = 0, textureDisposals = 0;
  const seenGeometry = new Set(), seenMaterial = new Set(), seenTextures = new Set();
  gltf.scene.traverse(n => {
    if(n.geometry&&!seenGeometry.has(n.geometry)){seenGeometry.add(n.geometry);n.geometry.addEventListener('dispose',()=>geometries++);}
    for(const m of(Array.isArray(n.material)?n.material:[n.material]))if(m&&!seenMaterial.has(m)){seenMaterial.add(m);m.addEventListener('dispose',()=>materialDisposals++);for(const t of Object.values(m))if(t?.isTexture&&!seenTextures.has(t)){seenTextures.add(t);t.addEventListener('dispose',()=>textureDisposals++);}}
  });
  const controller = createEquipmentController({ THREE, model, load: async()=>gltf });
  assert.equal(controller.active,null);
  const record = await controller.equip(asset);
  assert.equal(record.mount.parent.name,'mixamorigRightHand');
  const scale=record.mount.getWorldScale(new THREE.Vector3());assert.ok(Math.abs(scale.x-1)<1e-6&&Math.abs(scale.y-1)<1e-6&&Math.abs(scale.z-1)<1e-6);
  assert.ok(record.mixer);const rest=[];record.scene.traverse(n=>{if(n.isBone)rest.push([n,n.quaternion.clone()])});controller.update(.25);assert.equal(record.mixer.time,.25);assert.ok(rest.some(([n,q])=>!n.quaternion.equals(q)),'Actual exported bone channel changes pose');
  controller.setPlacement('stow');assert.equal(record.mount.parent.name,'mixamorigSpine2');
  for(const [uuid,[p,q,s]]of originals){const node=model.getObjectByProperty('uuid',uuid);assert.ok(node.position.equals(p)&&node.quaternion.equals(q)&&node.scale.equals(s));}
  controller.clear();controller.dispose();controller.dispose();
  assert.equal(record.mount.parent,null);assert.equal(geometries,seenGeometry.size);assert.equal(materialDisposals,seenMaterial.size);assert.equal(textureDisposals,seenTextures.size);
});
test('cancelled in-flight asset is disposed after late load and cannot replace newer selection', async()=>{
  const model=await sourceRig();let resolveFirst;let oldDisposals=0;
  const oldScene=new THREE.Group(),geometry=new THREE.BoxGeometry();geometry.addEventListener('dispose',()=>oldDisposals++);oldScene.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()));
  const newer=new THREE.Group();let calls=0;const signals=[];
  const controller=createEquipmentController({THREE,model,load:(_,signal)=>{signals.push(signal);return ++calls===1?new Promise(r=>{resolveFirst=r}):Promise.resolve({scene:newer,animations:[]});}});
  const first=controller.equip({id:'first',name:'First',url:'one'});
  await controller.equip({id:'second',name:'Second',url:'two'});
  resolveFirst({scene:oldScene,animations:[]});assert.equal(await first,null);assert.equal(signals[0].aborted,true);assert.equal(oldDisposals,1);assert.equal(controller.active.asset.id,'second');controller.dispose();
});
test('app hooks preserve call arguments and return values and restore prototypes',()=>{
  const trace=[];class Character{update(...args){trace.push(['source',this,...args]);return 42;}}class App{dispose(value){trace.push(['dispose',value]);return 17;}}
  const app=new App();app.character=new Character();const update=app.character.update,dispose=app.dispose;
  const controller={update:dt=>trace.push(['equipment',dt]),dispose:()=>trace.push(['cleanup'])};
  bindEquipmentToApp(app,controller);assert.equal(app.character.update(.5,'extra'),42);assert.equal(trace[0][0],'source');assert.equal(trace[0][1],app.character);assert.deepEqual(trace[0].slice(2),[.5,'extra']);assert.deepEqual(trace[1],['equipment',.5]);assert.equal(app.dispose('original'),17);assert.equal(app.character.update,update);assert.equal(app.dispose,dispose);assert.deepEqual(trace.slice(2),[['cleanup'],['dispose','original']]);
});
test('recursive catalog lists candidates with explicit unapproved alignment and confines URLs',async()=>{
  const responses={'./production-assets/catalog.json':{manifests:['oath-04/weapons/manifest.json']},'./production-assets/oath-04/weapons/manifest.json':{familyId:'family',assets:[{id:'a',name:'A',type:'equipment',files:{glb:'assets/production/oath-04/weapons/a.glb'}},{id:'character',name:'Character',type:'character',files:{glb:'assets/production/oath-01/characters/c.glb'}}]}};
  const rows=await loadEquipmentCatalog(async u=>({ok:true,json:async()=>responses[u]}));assert.equal(rows.length,1);assert.equal(rows[0].id,'a');assert.equal(rows[0].alignment.status,'PROPOSED_UNREVIEWED');assert.equal(rows[0].alignment.assetId,'a');assert.throws(()=>productionURL('assets/production/../secret.glb'));assert.throws(()=>productionURL('https://example.com/a.glb'));
});

test('source update errors propagate unchanged without ticking equipment',()=>{
  const failure=new Error('source failure');let ticks=0;
  const app={character:{update(){throw failure}},dispose(){}};
  const remove=bindEquipmentToApp(app,{update(){ticks++},dispose(){}});
  assert.throws(()=>app.character.update(.1),error=>error===failure);assert.equal(ticks,0);remove();
});
test('destination equipment remains off with zero source hooks and zero GLB requests until selection',async()=>{
  const { installProductionEquipment }=await import('../app/abilities/production-equipment.js');
  const originalDocument=globalThis.document,originalFetch=globalThis.fetch,originalWindow=globalThis.window;
  const requests=[],elements={};
  for(const id of ['equipment-select','equipment-placement','equipment-status'])elements[id]={value:id==='equipment-placement'?'hand':'',options:[],append(o){this.options.push(o)},addEventListener(){},removeEventListener(){},querySelector(){return {}}};
  globalThis.document={getElementById:id=>elements[id],createElement:()=>({})};
  globalThis.window={URL,addEventListener(){},removeEventListener(){}};
  globalThis.fetch=async url=>{requests.push(url);return {ok:true,json:async()=>({manifests:[]})}};
  try {
    const app={character:{model:await sourceRig(),update(){}},dispose(){}};
    const update=app.character.update,dispose=app.dispose;
    const equipment=await installProductionEquipment(app);
    assert.equal(equipment.controller,null);assert.equal(app.character.update,update);assert.equal(app.dispose,dispose);assert.equal(elements['equipment-select'].value,'');assert.deepEqual(requests,['./production-assets/catalog.json']);equipment.dispose();
  }finally{globalThis.document=originalDocument;globalThis.fetch=originalFetch;globalThis.window=originalWindow;}
});

test('equipment failures cannot suppress source return values or original disposal errors',()=>{
  const sourceFailure=new Error('original disposal');let disposes=0;
  const app={character:{update(){return 9}},dispose(){disposes++;throw sourceFailure}};
  const controller={update(){throw new Error('equipment animation')},dispose(){throw new Error('equipment cleanup')}};
  bindEquipmentToApp(app,controller,()=>{throw new Error('reporter')});
  assert.equal(app.character.update(.1),9);assert.throws(()=>app.dispose(),e=>e===sourceFailure);assert.equal(disposes,1);
});
