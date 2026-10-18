import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ABILITIES_BY_OATH, hotbarFor, equippedAbilityForSlot } from '../../shared/abilities.js';

const source = await readFile(new URL('../src/ui/loadout.js', import.meta.url), 'utf8');
const dom = `const h=(tag,attrs={},...children)=>({tag,attrs:attrs||{},children,hidden:!!attrs?.hidden,textContent:children.filter(x=>typeof x==='string').join(''),append(...c){this.children.push(...c)},replaceChildren(...c){this.children=c},querySelector(){return null}});`;
// Keep the real shared catalog/tuning; only replace the browser DOM surface.
const sharedURL = new URL('../../shared/abilities.js', import.meta.url).href;
const transformed = source.replace("import { h } from './dom.js';", dom).replace("'@shared/abilities.js'", JSON.stringify(sharedURL));
const { createLoadout } = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`);

function fixture() {
  const events = {}, requests = [];
  const oath = 'oath-01', cls = 'ninja';
  const ids = hotbarFor(oath, cls).slice(1).map(a => a.id);
  const ui = {
    gs: { character: { oath, cls }, you: { loadout: ids } },
    ctx: { bus: { on: (n, f) => events[n] = f }, net: { send: m => requests.push(m) } },
  };
  const panel = createLoadout(ui); panel.refresh(true);
  const [,, rows, actions, status] = panel.el.children;
  return { ui, panel, events, requests, rows, actions, status, ids, oath, cls };
}

test('loadout waits for explicit authoritative confirmation, not repeated renders or partial snapshots', async () => {
  const { ui, panel, events, requests, rows, actions, status, ids, oath } = fixture();
  const replacement = ABILITIES_BY_OATH[oath].find(a => !ids.includes(a.id)).id;
  const select = rows.children[0].children[1]; select.value = replacement; select.onchange();
  actions.children[0].onclick();
  const expected = [replacement, ...ids.slice(1)];
  assert.deepEqual(requests[0], { t: 'loadout', ids: expected });
  panel.refresh(); events['net:you']({ hp: 80 }); assert.match(status.textContent, /Waiting/);
  ui.gs.you.loadout = expected;
  events['net:you']({ loadout: expected }); await Promise.resolve();
  assert.equal(status.textContent, 'Your techniques are equipped.');
});

test('duplicate draft shows the selected technique stats while equip stays disabled', () => {
  const { rows, actions, status, requests, ids, oath, cls } = fixture();
  const original = equippedAbilityForSlot(oath, cls, 1, ids[0]);
  const duplicate = ids.slice(1).find(id => {
    const a = equippedAbilityForSlot(oath, cls, 1, id);
    return a.shape !== original.shape || a.range !== original.range;
  });
  assert.ok(duplicate, 'fixture needs a distinct technique already in another slot');
  const selected = equippedAbilityForSlot(oath, cls, 1, duplicate);
  const select = rows.children[0].children[1]; select.value = duplicate; select.onchange();
  assert.equal(rows.children[0].children[2].textContent,
    `${selected.shape} · ${selected.range}m range · ${selected.mana} mana · ${selected.cooldown}s cooldown`);
  assert.equal(actions.children[0].disabled, true);
  assert.match(status.textContent, /different technique/);
  actions.children[0].onclick();
  assert.equal(requests.length, 0, 'invalid draft cannot send a loadout request');
});
