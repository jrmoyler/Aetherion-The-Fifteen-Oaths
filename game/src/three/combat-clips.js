import { DODGE_DURATION } from './character/locomotion.js';

// Fit authored poses to the gameplay cadence while preserving the characteristic
// contacts. The takeoff extension finishes before the physical jump apex, and
// the dodge completes as the controller restores ordinary locomotion.
export const COMBAT_TIMING = Object.freeze({
  attack_1: {duration:.56, contact:.16, authoredContact:.35},
  attack_2: {duration:.60, contact:.18, authoredContact:.35},
  attack_3: {duration:.72, contact:.24, authoredContact:.38},
  cast_release: {duration:.55, contact:.18, authoredContact:.40},
  cast_aoe: {duration:.82, contact:.30, authoredContact:.43},
  hit: {duration:.28, contact:.055, authoredContact:.25},
  land: {duration:.24, contact:.05, authoredContact:.20},
  jump_start: {duration:.22, contact:.075, authoredContact:11/14},
  dodge: {duration:DODGE_DURATION, contact:.19, authoredContact:.40},
});
const cache = new WeakMap();
export function prepareCombatClips(clips) {
  if (cache.has(clips)) return cache.get(clips);
  const prepared=clips.map(source=>{
    const timing=COMBAT_TIMING[source.name.toLowerCase()];
    if(!timing || !(source.duration>0)) return source;
    const clip=source.clone(), pivot=source.duration*timing.authoredContact;
    for(const track of clip.tracks) for(let i=0;i<track.times.length;i++) {
      const t=track.times[i];
      track.times[i]=t<=pivot ? t/pivot*timing.contact : timing.contact+(t-pivot)/(source.duration-pivot)*(timing.duration-timing.contact);
    }
    clip.duration=timing.duration;return clip;
  });
  cache.set(clips,prepared);return prepared;
}
