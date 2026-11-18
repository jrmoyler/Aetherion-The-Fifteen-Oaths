import test from 'node:test';
import assert from 'node:assert/strict';
import { OATHS, ROUTES } from '../shared/oaths.js';
import { createSim } from '../shared/sim/index.js';

const id = 'player';
const hello = { name: 'Witness', oath: 'oath-09', cls: 'ninja' };
const create = (campaign = true) => createSim({ campaign, bots: 0, campsPerRegion: 2, firstEventMs: Infinity });
const active = (sim) => [...sim._S.players.get(id).quests.values()].find(q => q.campaignIndex);
const place = (sim, point) => sim._S.place(sim._S.players.get(id), point.x, point.z, 'test');
const interact = (sim, target) => sim.handle(id, { t: 'interact', id: target });
const siteFor = (sim, kind) => sim._S.storyEncounters.find(site => site.oath === hello.oath && site.storyEncounter === kind);

test('the offline opening ties the Archivist, the road fights and a second witness to real world objectives', () => {
  let sim = create();
  const starts = sim.addPlayer(id, hello);
  const sanctuary = starts.world.sanctuaries.find(s => s.oathId === hello.oath);
  const sorin = sanctuary.npcs.find(n => n.role === 'chronicler');
  const helia = sanctuary.npcs.find(n => n.role === 'oathkeeper');
  assert.equal(starts.you.quests.length, 1);
  assert.equal(starts.you.quests[0].objective, 'Speak with Sorin Kes');
  assert.match(starts.you.quests[0].text, /Archivist died on the plaza steps/);
  assert.equal(starts.you.quests[0].waypoint.x, sorin.x);
  assert.ok(Math.hypot(sorin.x - sanctuary.spawn.x, sorin.z - sanctuary.spawn.z) < 12);

  place(sim, helia);
  interact(sim, helia.id);
  assert.equal(active(sim).campaignIndex, 1);
  place(sim, sorin);
  interact(sim, sorin.id);
  assert.equal(active(sim).campaignIndex, 2);
  assert.ok(sim._S.out.some(o => o.msg.e?.type === 'npc' && /signal the evacuees/.test(o.msg.e.text)));

  const ambush = siteFor(sim, 'ambush');
  const p = sim._S.players.get(id);
  place(sim, ambush);
  const other = sim._S.mobs.find(m => m.def.id === ambush.mobs[0].def.id && !m.camp?.storyEncounter);
  assert.ok(other);
  sim._S.kill(other, p);
  assert.equal(active(sim).progress, 0, 'unrelated kills do not count');
  sim._S.kill(ambush.mobs[0], p);
  assert.equal(active(sim).progress, 1);

  const saved = structuredClone(sim._S.serialize(p));
  sim = create();
  assert.equal(sim.addPlayer(id, hello, saved).you.quests[0].progress, 1);
  const resumed = sim._S.players.get(id);
  sim._S.kill(siteFor(sim, 'ambush').mobs[0], resumed);
  assert.equal(active(sim).progress, 1, 'a respawned or restored defender counts only once');
  sim._S.kill(siteFor(sim, 'ambush').mobs[1], resumed);
  assert.equal(active(sim).campaignIndex, 3);
  assert.equal(siteFor(sim, 'ambush').resolved, true);
  assert.ok(siteFor(sim, 'ambush').mobs.every(mob => mob.respawnMs === 0 && !mob.alive));

  const breach = siteFor(sim, 'breach');
  place(sim, breach);
  sim._S.kill(breach.mobs[0], resumed);
  assert.equal(active(sim).campaignIndex, 4);
  assert.equal(sim._S.youState(resumed).quests[0].waypoint.returning, true);
  place(sim, helia);
  interact(sim, helia.id);
  assert.equal(active(sim).campaignIndex, 5);
  place(sim, breach);
  interact(sim, `shrine:${hello.oath}`);
  assert.equal(active(sim).campaignIndex, 5, 'interacting with a distant shrine has no effect');
  place(sim, sanctuary.shrine);
  interact(sim, `shrine:${hello.oath}`);
  assert.equal(active(sim).campaignIndex, 6, 'the already-attuned home shrine still relays testimony');
  assert.equal(sim._S.youState(resumed).quests[0].chapter, 'A Second Witness');

  const onward = starts.world.sanctuaries.find(s => s.oathId === active(sim).shrine);
  assert.ok(ROUTES.some(route => route.includes(hello.oath) && route.includes(onward.oathId)));
  const route = sim._S.youState(resumed).quests[0].waypoint;
  assert.ok(route.approach?.gate && route.arrival?.gate);
  assert.deepEqual([route.arrival.origin.x, route.arrival.origin.z], onward.center);
  place(sim, onward.shrine);
  interact(sim, `shrine:${onward.oathId}`);
  assert.equal(active(sim).campaignIndex, 7);
  const witness = onward.npcs.find(n => n.role === 'chronicler');
  place(sim, witness);
  interact(sim, witness.id);
  assert.equal(active(sim), undefined);
  assert.ok(sim._S.youState(resumed).quests.some(q => q.id === 'chain-oath-09-1'));
  assert.ok(sim._S.out.some(o => o.msg.e?.type === 'npc' && /Two records/.test(o.msg.e.text)));

  const done = structuredClone(sim._S.serialize(resumed));
  const finished = create();
  const again = finished.addPlayer(id, hello, done);
  assert.deepEqual(again.you.quests.map(q => q.id), ['chain-oath-09-1']);
  for (const kind of ['ambush', 'breach']) {
    assert.ok(siteFor(finished, kind).resolved, `${kind} stays resolved after reload`);
    assert.ok(siteFor(finished, kind).mobs.every(mob => !finished._S.ents.has(mob.id)));
  }
});

test('characters can start any Oath locally, with explicit migration rules for existing saves', () => {
  const story = create();
  for (const oath of OATHS) {
    const start = story.addPlayer(oath.id, { ...hello, oath: oath.id });
    assert.equal(start.you.oath, oath.id);
    assert.equal(start.you.quests[0].id, `story-${oath.id}-1`);
    assert.ok(Number.isFinite(start.you.quests[0].waypoint.x));
  }
  const old = create(false);
  old.addPlayer(id, hello);
  const oldPlayer = old._S.players.get(id);
  const oldSave = structuredClone(old._S.serialize(oldPlayer));
  assert.equal(create().addPlayer(id, hello, oldSave).you.quests[0].id, 'story-oath-09-1');
  const leader = old._S.npcs.find(n => n.role === 'oathkeeper' && n.oath === hello.oath);
  place(old, leader);
  interact(old, leader.id);
  const advanced = structuredClone(old._S.serialize(oldPlayer));
  assert.equal(create().addPlayer(id, hello, advanced).you.quests[0].id, 'chain-oath-09-2');
  assert.equal(create(false).addPlayer(id, hello).you.quests[0].id, 'chain-oath-09-1');
});
