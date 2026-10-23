// Preserve the authored skeletal poses, but fit their windup/contact/recovery to
// the game's repeat-attack cadence. Previously 1.1–1.4s swings were restarted by
// ~0.6s basic attacks, so the player never saw a completed strike/recovery.
export const COMBAT_TIMING = Object.freeze({
  attack_1: {duration:.56, contact:.16, authoredContact:.35},
  attack_2: {duration:.60, contact:.18, authoredContact:.35},
  attack_3: {duration:.72, contact:.24, authoredContact:.38},
  cast_release: {duration:.55, contact:.18, authoredContact:.40},
  cast_aoe: {duration:.82, contact:.30, authoredContact:.43},
  hit: {duration:.28, contact:.055, authoredContact:.25},
  land: {duration:.24, contact:.05, authoredContact:.20},
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
