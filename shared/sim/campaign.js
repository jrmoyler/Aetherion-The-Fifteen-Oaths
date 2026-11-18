// Act I follows the Archivist's succession at Daybreak. Players who begin in another
// realm arrive with the fragment and see the same crisis through that realm's civic services.
import { OATH_BY_ID } from '../oaths.js';
import { OATH_CIVICS, OATH_LEADERS, SEATS } from './data.js';
import { q2 } from './util.js';

const LOCAL_STAKES = [
  'The ash-road signal has failed. The night shift is still outside Cindervault.',
  'A preservation ward went dark. Stillfolio’s chamber attendants are trapped on the road.',
  'The relay went silent mid-signal. The Crownspan repair crew hasn’t come home.',
  'A flood alarm stalled at the quay. The water crews need a clear route to higher ground.',
  'A fault signal broke in two. The survey crew is stranded outside Keystone Hall.',
  'The crossing lost its wind bells. There are ferrymen waiting for an evacuation signal.',
  'The seed houses have gone quiet. Rootmeet’s gardeners are sheltering past the city gates.',
  'Vitrial’s remedy convoy stopped answering. The clinic is waiting on those supplies.',
  'The Archivist died on the plaza steps. You carry the original Weave fragment they put in your hands. The outer ward just failed with evacuees still on the road.',
  'The watch road disappeared from the instruments. The Parallax Crown astronomers are still out there.',
  'The refuge crossing is out of phase. Witness Ford’s last evacuees are stranded beyond the gates.',
  'Kinhold’s relief crew broke off its signal. The volunteers are still outside the walls.',
  'The stage passage has shifted. Manydoor’s ushers are trying to bring the audience home by road.',
  'The Wayclock stopped calling departures. Two road crews missed their return window.',
  'Counterpoise’s safety locks failed together. Workers are stranded at the roadside cut.',
];

export const CAMPAIGN_END = 8;

// The plaza approach is an open route shared by all fifteen generated city layouts.
// Move the offline witness off the upper hall steps to meet the player there.
export function stageCampaignWitnesses(sanctuaries) {
  for (const sanctuary of sanctuaries) {
    const witness = sanctuary.npcs.find(n => n.role === 'chronicler');
    if (!witness) continue;
    const { spawn, shrine } = sanctuary;
    const dx = shrine.x - spawn.x, dz = shrine.z - spawn.z;
    const distance = Math.hypot(dx, dz);
    if (distance === 0) continue;
    Object.assign(witness, {
      x: q2(spawn.x + (dx * 11 + dz * 3) / distance),
      z: q2(spawn.z + (dz * 11 - dx * 3) / distance),
      y: spawn.y,
      ry: spawn.ry + Math.PI,
    });
  }
}

export function nextCovenant(sanctuary) {
  const [x, z] = sanctuary.center;
  let nearest = null, bestDistance = Infinity;
  for (const id of sanctuary.neighbours) {
    const oath = OATH_BY_ID[id];
    const distance = Math.hypot(oath.center[0] - x, oath.center[1] - z);
    if (distance < bestDistance) { nearest = oath; bestDistance = distance; }
  }
  return nearest;
}

export function campaignStart(saved) {
  if (!saved) return 1;
  if (Number.isInteger(saved.campaignStep) && saved.campaignStep >= 1 && saved.campaignStep <= CAMPAIGN_END) return saved.campaignStep;
  const movedBeyondOpening = (saved.chainStep ?? 1) !== 1 || (saved.lvl ?? 1) > 2 ||
    (saved.discovered?.length ?? 0) > 1 || (saved.bountiesDone ?? 0) > 0 ||
    (Array.isArray(saved.quests) && saved.quests.some(q => (q?.step ?? 0) > 1 || q?.progress > 0 || q?.done));
  return movedBeyondOpening ? null : 1;
}

export function campaignQuest(S, oath, index) {
  const i = OATH_BY_ID[oath].index - 1;
  const witness = OATH_CIVICS[i], keeper = OATH_LEADERS[i], seat = SEATS[i];
  const basis = {
    id: `story-${oath}-${index}`,
    campaignIndex: index,
    chapter: index < 6 ? 'The Broken Ward' : 'A Second Witness',
    storyStep: index < 6 ? index : index - 5,
    storyTotal: index < 6 ? 5 : 2,
    goal: 1,
    reward: { xpf: 0.28 },
  };
  const talk = (role, targetOath = oath) => ({ kind: 'talk', role, oath: targetOath });
  switch (index) {
    case 1: return {
      ...basis, ...talk('chronicler'),
      title: 'The Last Charge', objective: `Speak with ${witness}`,
      text: i === 8 ? LOCAL_STAKES[i] : `Before dying at Daybreak, the Archivist entrusted you with the original Weave fragment. ${LOCAL_STAKES[i]}`,
      dialogue: `${LOCAL_STAKES[i]} Break through the creatures at the Broken Ward. I’ll signal the evacuees when the road is clear.`,
    };
    case 2: return {
      ...basis, kind: 'kill', encounter: 'ambush', oath, goal: 2,
      title: 'The Broken Ward', objective: 'Clear the evacuation road',
      text: 'Two creatures have cut off the marked road. Bring both down so the evacuees can reach the sanctuary.',
      reward: { xpf: 0.55, gold: 10 },
    };
    case 3: return {
      ...basis, kind: 'kill', encounter: 'breach', oath,
      title: 'The Fracture Breach', objective: 'Defeat the fracture guardian',
      text: 'The evacuees are clear. The fragment pulls toward a tear farther up the same road. A guardian stands over a ward record inside it.',
      reward: { xpf: 0.75, gold: 18 },
    };
    case 4: return {
      ...basis, ...talk('oathkeeper'), returning: true,
      title: 'What Broke the Ward', objective: `Bring the record to ${keeper}`,
      text: 'The guardian is down and you have the ward record. The pressure mark matches your fragment. Take both back to the Oathkeeper.',
      dialogue: 'An ordinary failure wouldn’t leave a pressure mark like this. Someone drew power through the ward while people were crossing. Relay the record at the sanctuary shrine. Ask the next sanctuary whether they’ve seen the same mark.',
    };
    case 5: return {
      ...basis, kind: 'interact', shrine: oath,
      title: 'A Record for the Road', objective: 'Relay the testimony at the shrine',
      text: `Interact with the shrine in ${seat} to send the recovered record to the neighboring sanctuary.`,
      reward: { xpf: 0.65, gold: 24, item: 'uncommon' },
    };
    case 6:
    case 7: {
      const roadTo = S.storyEncounters?.find(site => site.oath === oath && site.storyEncounter === 'ambush')?.roadTo;
      const neighbor = OATH_BY_ID[roadTo] ?? nextCovenant(S.sanctuaries[i]);
      const j = neighbor.index - 1, destination = SEATS[j], secondWitness = OATH_CIVICS[j];
      if (index === 6) return {
        ...basis, kind: 'discover', shrine: neighbor.id,
        title: 'An Open Road', objective: `Reach the shrine at ${destination}`,
        text: `${secondWitness} saw the same pattern before your relay arrived. Follow the covenant road to ${destination} and attune at its shrine. You can explore along the way.`,
        reward: { xpf: 0.65, gold: 20 },
      };
      return {
        ...basis, ...talk('chronicler', neighbor.id),
        title: 'The Second Record', objective: `Present the record to ${secondWitness}`,
        text: 'An independent account may reveal whether both sanctuaries were struck by the same fracture. Find the chronicler on the plaza approach.',
        dialogue: 'Two records, from two different sanctuaries. The marks start out on the road, before either ward failed. Keep both accounts. The covenants need to hear what happened before anyone decides who gets to hold that fragment.',
        reward: { xpf: 0.85, gold: 35, item: 'uncommon' },
      };
    }
    default: return null;
  }
}
