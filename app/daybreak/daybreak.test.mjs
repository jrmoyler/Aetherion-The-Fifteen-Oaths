import test from 'node:test';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { Vector2, Vector3 } from '../../runtime/ability-matrix/node_modules/three/build/three.module.js';
import catalog from '../../runtime/ability-matrix/presets/catalog.json' with { type: 'json' };
import manifest from './assets.json' with { type: 'json' };
import { filterCastables, replaceSlot, stickKeys } from './model.mjs';
import { installControls } from './controls.js';
import { checkedAsset } from './vite.config.mjs';
const all = catalog.abilities.filter(a => a.status === 'live' && ['ability','buff','summon'].includes(a.kind));

test('all 100 castables remain discoverable, including buffs and summons', () => {
  assert.equal(filterCastables(all).length, 100);
  for (const [kind, count] of [['ability',95],['buff',3],['summon',2]]) assert.equal(filterCastables(all,{kind}).length,count);
  for (const entry of all) assert.deepEqual(filterCastables(all,{search:entry.uid,element:entry.element,kind:entry.kind}),[entry]);
  assert.equal(filterCastables(all,{search:'does-not-exist'}).length,0);
});
test('loadout accepts every source kind and rejects invalid slots and IDs', () => {
  const original = all.slice(0,4).map(a=>a.uid);
  for (const entry of all) assert.equal(replaceSlot(original,2,entry.uid,all)[2],entry.uid);
  assert.deepEqual(original, all.slice(0,4).map(a=>a.uid));
  assert.throws(()=>replaceSlot(original,4,all[0].uid,all));
  assert.throws(()=>replaceSlot(original,0,'missing',all));
});
test('movement pad has a deadzone and camera-relative diagonal key intent', () => {
  assert.equal(stickKeys(.1,.1).size,0);
  assert.deepEqual([...stickKeys(-.8,-.8)],['KeyA','KeyW']);
  assert.deepEqual([...stickKeys(.8,.8)],['KeyD','KeyS']);
});
test('selected existing GLBs have pinned bytes, PBR textures, UVs and flat floor bounds', async () => {
  for (const asset of manifest.assets) {
    const bytes = await checkedAsset(asset);
    assert.equal(bytes.length,asset.bytes);
    assert.equal(bytes.subarray(0,4).toString(),'glTF');
    assert.equal(bytes.readUInt32LE(8),bytes.length);
    const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    assert.ok(doc.images.length>0);
    assert.ok(doc.materials.every(m=>m.pbrMetallicRoughness?.baseColorTexture));
    for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
      assert.ok(Number.isInteger(primitive.attributes.TEXCOORD_0));
      assert.ok(Number.isInteger(primitive.attributes.NORMAL));
    }
    if(asset.file==='floor-bay.glb') {
      const positions=doc.meshes.flatMap(m=>m.primitives.map(p=>doc.accessors[p.attributes.POSITION]));
      const mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
      for(const node of doc.nodes.filter(n=>Number.isInteger(n.mesh))) {
        assert.equal(node.rotation,undefined);assert.equal(node.scale,undefined);assert.equal(node.matrix,undefined);
        for(const primitive of doc.meshes[node.mesh].primitives) {
          const p=doc.accessors[primitive.attributes.POSITION];
          for(let axis=0;axis<3;axis++) {
            const translation=node.translation?.[axis]??0;
            mins[axis]=Math.min(mins[axis],p.min[axis]+translation);
            maxs[axis]=Math.max(maxs[axis],p.max[axis]+translation);
          }
        }
      }
      for(const [actual,expected] of [...mins.map((v,i)=>[v,[0,-.4,-4][i]]),...maxs.map((v,i)=>[v,[4,0,0][i]])]) assert.ok(Math.abs(actual-expected)<1e-6);

    }
  }
  await assert.rejects(checkedAsset({...manifest.assets[0],sha256:'bad'}),/checksum mismatch/);
});

class Element extends EventTarget {
  constructor(id='') { super(); this.id=id;this.value='';this.style={};this.children=[];this.disabled=false;this.attributes={};this.tagName='DIV'; }
  append(child){this.children.push(child);}
  replaceChildren(...children){this.children=children;}
  setAttribute(key,value){this.attributes[key]=value;}
  setPointerCapture(){}
  getBoundingClientRect(){return {left:0,top:0,width:120,height:120};}
  closest(){return null;}
}
function event(element,type,values={}) {
  const e=new Event(type,{cancelable:true});
  for(const [key,value] of Object.entries(values)) Object.defineProperty(e,key,{value});
  element.dispatchEvent(e);
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('destination controls route all 100, preserve aim, release touch input and surface failures', async () => {
  const previous={window:globalThis.window,document:globalThis.document};
  const ids=['controls','picker','status','element','kind','search','fire','action','viewport','loadout','assign','reset','clear','count','slot','dash','stick','knob'];
  const dom=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
  dom.slot.value='0';
  globalThis.window=new Element();globalThis.document=new Element();
  document.getElementById=id=>dom[id];document.createElement=()=>new Element();
  const aim={cancel(){},point(p){this.pointer=p.clone();},setOrigin(){},update(){},confirm(){return true;}};
  const calls=[];
  const runtime={capturesPointer:()=>false,pointerFire:value=>calls.push(['fire',value])};
  const input={pointer:new Vector2(),keys:new Set(),_onPointerDown(){},_onPointerMove(){},_onKeyDown(e){this.keys.add(e.code);},emit(){}};
  const app={input,activeAim:aim,slot:{runtime},runtimes:new Map([['mock',runtime]]),character:{position:new Vector3()},locomotion:{reset(){calls.push(['reset-movement']);}},dummies:{_anchor:new Vector3(8,0,8),_stand(){calls.push(['stand',...this._anchor]);},reset(){calls.push(['reset-targets']);}},frame(){calls.push(['keys',...input.keys]);},async arm(uid){calls.push(['arm',uid]);return true;}};
  const adapter={list:()=>structuredClone(all),describe:uid=>all.find(a=>a.uid===uid),async select(uid){calls.push(['select',uid]);},async cast(uid){calls.push(['action',uid]);return true;},async clear(){calls.push(['clear']);}};
  // Node EventTarget warns at 11 listeners on one AbortSignal; browsers do not.
  setMaxListeners(100);
  let controls;
  try {
    controls=installControls(app,adapter,catalog);await controls.ready;
    for(const entry of all) {
      dom.picker.value=entry.uid;event(dom.picker,'change');await settle();
      assert.equal(controls.current,entry.uid);
      event(dom[entry.kind==='summon'?'action':'fire'],'click');await settle();
      assert.ok(calls.some(([name,uid])=>uid===entry.uid&&name===(entry.kind==='ability'?'arm':'action')),entry.uid);
    }
    dom.picker.value=all[0].uid;event(dom.picker,'change');await settle();
    event(dom.viewport,'pointerdown',{pointerType:'touch',clientX:90,clientY:30,button:0});
    const before=calls.filter(c=>c[0]==='arm').length;
    await settle();assert.equal(calls.filter(c=>c[0]==='arm').length,before,'touch aiming must not cast');
    event(dom.fire,'click');await settle();
    assert.deepEqual(aim.pointer.toArray(),[.5,.5],'cast retains user aim rather than bridge auto-aim');
    event(dom.stick,'pointerdown',{pointerId:2,clientX:115,clientY:5});
    input.keys.add('ShiftLeft');app.frame();
    assert.deepEqual(calls.at(-1),['keys','ShiftLeft','KeyD','KeyW']);
    assert.deepEqual([...input.keys],['ShiftLeft'],'touch does not overwrite physical key state');
    event(dom.stick,'pointercancel',{pointerId:2});app.frame();assert.deepEqual(calls.at(-1),['keys','ShiftLeft']);
    event(dom.dash,'pointerdown',{pointerId:3});app.frame();assert.ok(calls.at(-1).includes('Space'));
    event(window,'blur');app.frame();assert.deepEqual(calls.at(-1),['keys']);
    app.dummies._stand({});assert.deepEqual(calls.at(-1),['stand',0,0,0]);assert.deepEqual(app.dummies._anchor.toArray(),[8,0,8]);
    event(dom.reset,'click');await settle();assert.ok(calls.some(c=>c[0]==='reset-targets'));
    app.arm=async()=>false;event(dom.fire,'click');await settle();assert.match(dom.status.textContent,/declined/);
    const oldError=console.error;console.error=()=>{};
    try {adapter.select=async()=>{throw new Error('load failed');};event(dom.fire,'click');await settle();assert.match(dom.status.textContent,/load failed/);assert.equal(dom.fire.disabled,false);} finally {console.error=oldError;}
    controls.dispose();controls=null;
  } finally {
    controls?.dispose();setMaxListeners(10);
    for(const [key,value] of Object.entries(previous)) if(value===undefined) delete globalThis[key]; else globalThis[key]=value;
  }
});
