import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// A small DOM boundary double exercises the actual update/event handlers without WebGL.
const source = await readFile(new URL('../src/ui/fieldguide.js', import.meta.url), 'utf8');
const dom = `const h=(tag,attrs={},...children)=>({tag,attrs:attrs||{},children,hidden:!!attrs?.hidden,textContent:children.filter(x=>typeof x==='string').join(''),setAttribute(k,v){this.attrs[k]=v;}});`;
const { createFieldGuide } = await import(`data:text/javascript;base64,${Buffer.from(source.replace("import { h } from './dom.js';", dom)).toString('base64')}`);
function fixture() {
  const handlers = {}, requests = [], notices = [];
  let update, action = false, blocked = false;
  const position = { x: 0, z: 0 }, entities = [];
  const ui = { touchMode: false, ctx: {
    bus: { on: (name, fn) => handlers[name] = fn }, addUpdate: fn => update = fn,
    input: { press: () => action = true, consume: () => { const p = action; action = false; return p; } },
    net: { send: msg => requests.push(msg) }, architecture: { sanctuaries: [] },
  }, gs: { inGame: true, alive: true, pos: () => ({ ...position }), isSelf: id => id === 'self', forEachEntity: fn => entities.forEach(fn) },
  anyWindow: () => blocked, toast: text => notices.push(text) };
  const guide = createFieldGuide(ui);
  return { ui, guide, handlers, requests, notices, position, entities, tick: () => update(.3), block: value => blocked = value };
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
test('onboarding follows actual movement and cast events', () => {
  const f=fixture();f.tick();const body=f.guide.el.children[1];assert.equal(body.children[0].textContent,'Find your footing');
  f.position.x=10;f.tick();assert.equal(body.children[0].textContent,'Read your opponent');
  f.handlers['combat:target']({id:'enemy'});assert.equal(body.children[0].textContent,'Invoke your Oath');
  f.handlers['combat:cast']();assert.equal(body.children[0].textContent,'Meet the realm');
  f.handlers['net:ev']({type:'npc',id:'self'});assert.equal(body.children[0].textContent,'Your journey is yours');
});
