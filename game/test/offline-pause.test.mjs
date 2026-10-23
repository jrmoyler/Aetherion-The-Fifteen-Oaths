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
