import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// A small DOM boundary double exercises the actual update/event handlers without WebGL.
const source = await readFile(new URL('../src/ui/fieldguide.js', import.meta.url), 'utf8');
const dom = `const h=(tag,attrs={},...children)=>({tag,attrs:attrs||{},children,hidden:!!attrs?.hidden,textContent:children.filter(x=>typeof x==='string').join(''),setAttribute(k,v){this.attrs[k]=v;}});`;
const { createFieldGuide } = await import(`data:text/javascript;base64,${Buffer.from(source.replace("import { h } from './dom.js';", dom).replace("import './onboarding.css';", '')).toString('base64')}`);
function fixture(saved = null) {
  const storage = new Map(saved ? [['aetherion.fieldGuide.v2', saved]] : []);
  globalThis.localStorage = {getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
  const handlers = {}, requests = [], notices = [];
  let update, action = false, blocked = false;
  const position = { x: 0, z: 0 }, entities = [];
  const ui = { touchMode: false, ctx: {
    bus: { on: (name, fn) => handlers[name] = fn }, addUpdate: fn => update = fn,
    input: { state:{moveX:1,moveY:0}, press: () => action = true, consume: () => { const p = action; action = false; return p; } },
    combat: {isEnemy: id => id === 'enemy'}, net: { send: msg => requests.push(msg) }, architecture: { sanctuaries: [] },
  }, gs: { inGame: true, alive: true, pos: () => ({ ...position }), isSelf: id => id === 'self', quests: new Map([['first',{id:'first',kind:'talk',waypoint:{x:10,z:0,label:'Mara'}}]]), actor:id=>entities.find(a=>a.id===id), forEachEntity: fn => entities.forEach(fn) },
  anyWindow: () => blocked, toast: text => notices.push(text) };
  const guide = createFieldGuide(ui);
  return { ui, guide, handlers, requests, notices, position, entities, storage, tick: () => update(.3), block: value => blocked = value };
}
test('interaction uses nearest in-range citizen and sends only on explicit input', () => {
  const f=fixture();f.entities.push({kind:'npc',id:'far',name:'Far',position:{x:7,z:0}},{kind:'npc',id:'near',name:'Near',position:{x:2,z:0}});
  f.tick();assert.equal(f.requests.length,0);assert.match(f.guide.prompt.textContent,/Near/);
  f.guide.prompt.onclick();f.tick();assert.deepEqual(f.requests,[{t:'interact',id:'near'}]);
  f.position.x=30;f.tick();assert.equal(f.guide.prompt.hidden,true);
  f.ui.ctx.input.press();f.tick();assert.equal(f.requests.length,1);assert.equal(f.notices.length,1);
});
test('shrine interaction and modal/death guards', () => {
  const f=fixture();f.ui.ctx.architecture.sanctuaries.push({oathId:'oath-04',shrine:{x:0,z:3}});
  f.tick();f.guide.prompt.onclick();f.tick();assert.equal(f.requests[0].id,'shrine:oath-04');
  f.block(true);f.tick();assert.equal(f.guide.prompt.hidden,true);assert.equal(f.guide.el.hidden,true);
  f.block(false);f.ui.gs.alive=false;f.tick();assert.equal(f.guide.prompt.hidden,true);
});
test('prologue advances through movement, quest citizen and authoritative combat', () => {
  const f=fixture(); f.tick(); const body=f.guide.el.children[1];
  assert.equal(body.children[1].textContent,'Find your footing');
  for(let i=0;i<3;i++){f.position.x+=3;f.tick();} assert.equal(body.children[1].textContent,'Hear the terms');
  assert.match(body.children[3].textContent,/Mara · 1 m/);
  f.handlers['net:ev']({type:'npc',id:'self',npc:'mara',name:'Mara'});
  assert.equal(body.children[1].textContent,'Read your opponent');
  f.handlers['combat:target']({id:'enemy'}); assert.equal(body.children[1].textContent,'Invoke your Oath');
  f.handlers['net:ev']({type:'cast',src:'self',slot:1,castTime:.9});
  assert.equal(body.children[1].textContent,'Invoke your Oath','channel start is not completion');
  f.handlers['net:ev']({type:'cast',src:'self',slot:1,castTime:0,release:true});
  assert.equal(body.children[1].textContent,'Make it count');
  f.handlers['net:ev']({type:'hit',src:'self',dst:'enemy',amount:12});
  assert.equal(body.children[1].textContent,'The road is open');
});
test('wrong actors, wrong citizen, rejected casts and zero damage cannot advance guidance', () => {
  const f=fixture(); f.tick();
  f.handlers['combat:target']({id:'citizen'});
  f.handlers['net:ev']({type:'npc',id:'remote',name:'Mara'});
  f.handlers['net:ev']({type:'npc',id:'self',name:'Someone else'});
  f.handlers['net:ev']({type:'cast',src:'remote',slot:1,castTime:0});
  f.handlers['net:ev']({type:'cast',src:'self',slot:1,castTime:1});
  f.handlers['net:ev']({type:'fail',id:'self',slot:1,reason:'mana'});
  f.handlers['net:ev']({type:'interrupt',id:'self',slot:1});
  f.handlers['net:ev']({type:'hit',src:'remote',dst:'enemy',amount:12});
  f.handlers['net:ev']({type:'hit',src:'self',dst:'enemy',amount:0});
  assert.deepEqual(f.guide.completed,[]);
  assert.equal(f.handlers['combat:cast'],undefined,'predicted VFX events cannot complete a step');
});
test('completed chapters and minimized state persist; reopen does not reset progress', () => {
  const f=fixture(); f.tick(); for(let i=0;i<3;i++){f.position.x+=3;f.tick();}
  f.guide.el.children[1].children[6].onclick();
  assert.equal(f.guide.el.children[1].hidden,true);
  const saved=f.storage.get('aetherion.fieldGuide.v2'); const next=fixture(saved);
  assert.deepEqual(next.guide.completed,['move']); assert.equal(next.guide.el.children[1].hidden,true);
  next.guide.el.children[0].onclick(); assert.equal(next.guide.el.children[1].hidden,false);
  assert.deepEqual(next.guide.completed,['move']);
});
test('malformed persisted progress is ignored and device hints match controls', () => {
  const f=fixture('{broken'); f.tick();
  assert.deepEqual(f.guide.completed,[]);
  f.handlers['input:device']({device:'gamepad'});
  assert.match(f.guide.el.children[1].children[2].textContent,/left stick/);
  f.handlers['input:device']({device:'touch'});
  assert.match(f.guide.el.children[1].children[2].textContent,/thumbstick/);
  const next=fixture(JSON.stringify({completed:['move','fake','cast','cast'],collapsed:false}));
  assert.deepEqual(next.guide.completed,['move','cast']);
});

test('teleports and passive position changes do not teach movement', () => {
  const f=fixture(); f.tick(); f.position.x=100; f.tick();
  assert.deepEqual(f.guide.completed,[]);
  f.ui.ctx.input.state.moveX=0;
  for(let i=0;i<4;i++){f.position.x+=3;f.tick();}
  assert.deepEqual(f.guide.completed,[]);
});
