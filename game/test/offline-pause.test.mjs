import test from 'node:test';
import assert from 'node:assert/strict';
import {createHost} from '../src/net/simHost.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('offline pause freezes simulation and rejects gameplay, then resumes without catching up', async()=>{
  const messages=[];
  const host=createHost({bots:0,emit:batch=>messages.push(...batch)});
  try {
    host.receive({t:'hello',name:'PauseTest',oath:'oath-09',cls:'ninja'});
    await wait(100);
    host.receive({t:'__pause',paused:true});
    const time=host.sim.serverTime(), tick=host.sim._S.tickN;
    host.receive({t:'cast',slot:0});
    await wait(160);
    assert.equal(host.sim.serverTime(),time);
    assert.equal(host.sim._S.tickN,tick);
    assert.ok(messages.some(m=>m.t==='__paused'&&m.paused));
    host.receive({t:'__pause',paused:false});
    await wait(80);
    assert.ok(host.sim.serverTime()>time);
    assert.ok(host.sim.serverTime()-time<160,'paused time must not catch up');
  } finally {host.stop();}
});

test('a paused offline world still answers loadout and gear changes made in the character window', async()=>{
  const messages=[];
  const host=createHost({bots:0,emit:batch=>messages.push(...batch)});
  try {
    host.receive({t:'hello',name:'MenuTest',oath:'oath-05',cls:'sorcerer'});
    await wait(120);
    const player=host.sim._S.players.get('c1');
    const before=player.hotbar.slice(1).map(a=>a.id);
    host.receive({t:'__pause',paused:true});
    const tick=host.sim._S.tickN; messages.length=0;
    const ids=['codex/quartzspire',...before.slice(1)];
    host.receive({t:'loadout',ids});
    assert.deepEqual(messages.find(m=>m.t==='you')?.you.loadout ?? messages.find(m=>m.t==='you')?.you.hotbar.slice(1).map(a=>a.id), ids);
    messages.length=0;
    host.receive({t:'unequip',slot:'weapon'});
    const you=messages.find(m=>m.t==='you')?.you;
    assert.equal(you.equipment.weapon, undefined);
    assert.ok(you.inventory.some(item=>item.slot==='weapon'&&item.arsenal));
    host.receive({t:'cast',slot:1}); host.receive({t:'use',item:you.inventory.find(i=>i.kind==='consumable')?.id});
    await wait(120);
    assert.equal(host.sim._S.tickN,tick,'time stays frozen');
    assert.equal(player.casting,null);
  } finally {host.stop();}
});
