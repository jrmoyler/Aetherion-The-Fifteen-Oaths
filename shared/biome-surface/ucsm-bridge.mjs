/** Adapter for Ability-Matrix UCSM's actual submit(event) API. This package does not change combat authority. */
export function surfaceToUCSM(surface,combat,{actorId='environment',ownerId='environment',teamId='neutral',abilityUid='environment/surface-reaction',maxPerDrain=64}={}){
 if(typeof combat?.submit!=='function')throw Error('UCSM instance must implement submit(event)');
 const emitted=[];for(const e of surface.drain().slice(0,maxPerDrain)){
  const event={eventId:`biome:${e.eventId}`,type:'terrain-impact',actorId,ownerId:e.ownerId??ownerId,teamId,abilityUid:e.abilityUid??abilityUid,castId:e.eventId,element:e.element,mechanic:'worldshape',position:e.position,intensity:1,shape:{kind:'disc',x:e.position[0],z:e.position[2],r:surface.cellSize},targetIds:[],tags:['biome-surface']};combat.submit(event);emitted.push(event);
 }return emitted;
}
/** Avoid feedback cycles: only consume source cast impacts, not UCSM-derived reaction events. */
export function ingestCombatImpact(surface,event,{radius=3}={}){
 if(event.type!=='terrain-impact'||!event.element||event.parentReactionId||event.tags?.includes('biome-surface'))return false;
 surface.enqueue({eventId:`impact:${event.eventId}`,element:event.element,position:event.position??[0,0,0],radius:event.shape?.r??radius,intensity:event.intensity??1,ownerId:event.ownerId,abilityUid:event.abilityUid});return true;
}
