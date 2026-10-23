import test from 'node:test';import assert from 'node:assert/strict';
import {createGameClock} from '../src/core/gameClock.js';
test('paused cooldown clock stays monotonic through repeated pause/resume events',()=>{
 let time=100;const c=createGameClock(()=>time);assert.equal(c.now(),100);
 c.setPaused(true);time=900;c.setPaused(true);assert.equal(c.now(),100);
 c.setPaused(false);time=1000;assert.equal(c.now(),200);
 c.setPaused(false);assert.equal(c.now(),200);
 c.setPaused(true);time=1400;c.setPaused(false);assert.equal(c.now(),200);
});
