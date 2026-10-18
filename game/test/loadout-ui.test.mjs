import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/ui/loadout.js', import.meta.url), 'utf8');
const dom = `const h=(tag,attrs={},...children)=>({tag,attrs:attrs||{},children,hidden:!!attrs?.hidden,textContent:children.filter(x=>typeof x==='string').join(''),append(...c){this.children.push(...c)},replaceChildren(...c){this.children=c},querySelector(){return null}});`;
const catalog = `const ABILITIES_BY_OATH={oath:['a','b','c','d','e','f'].map(id=>({id,name:id}))};const hotbarFor=(o,c,ids=['a','b','c','d','e'])=>[{id:'basic'},...ids.map(id=>({id,name:id,range:10,mana:5,cooldown:3,shape:'projectile'}))];`;
const {createLoadout}=await import(`data:text/javascript;base64,${Buffer.from(source.replace("import { h } from './dom.js';",dom).replace("import { ABILITIES_BY_OATH, hotbarFor } from '@shared/abilities.js';",catalog)).toString('base64')}`);
test('loadout waits for explicit authoritative confirmation, not repeated renders or partial snapshots', async()=>{
 const events={},requests=[];
 const ui={gs:{character:{oath:'oath',cls:'ninja'},you:{loadout:['a','b','c','d','e']}},ctx:{bus:{on:(n,f)=>events[n]=f},net:{send:m=>requests.push(m)}}};
 const panel=createLoadout(ui);panel.refresh(true);
 const rows=panel.el.children[2],actions=panel.el.children[3],status=panel.el.children[4];
 const select=rows.children[0].children[1];select.value='f';select.onchange();actions.children[0].onclick();
 assert.deepEqual(requests[0],{t:'loadout',ids:['f','b','c','d','e']});
 panel.refresh();events['net:you']({hp:80});assert.match(status.textContent,/Waiting/);
 ui.gs.you.loadout=['f','b','c','d','e'];events['net:you']({loadout:ui.gs.you.loadout});await Promise.resolve();
 assert.equal(status.textContent,'Your techniques are equipped.');
});
