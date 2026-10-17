// Wire protocol shared by server/, shared/sim/ and game/src/net/.
// Transport: JSON text frames over WebSocket (path /ws). The same message objects flow
// through the in-browser LocalServer (offline mode) without serialization.
//
// CLIENT -> SERVER
//   { t:'hello', name, oath, cls, token? }           join; token resumes a persisted character
//   { t:'move', x, y, z, ry, anim, seq }             client-predicted movement, ~12 Hz
//   { t:'cast', slot, target?, aim?:{x,y,z}, dir?:{x,z} }   slot 0..5 of hotbarFor(oath, cls)
//   { t:'target', id|null }                          select target
//   { t:'chat', text, channel?:'say'|'world'|'oath' }
//   { t:'interact', id }                             NPC / shrine / loot
//   { t:'travel', shrine }                           fast-travel to a discovered shrine (oath id)
//   { t:'respawn' }
//   { t:'ping', c }                                  c = client time ms
//
// SERVER -> CLIENT
//   { t:'welcome', id, token, tick, serverTime, you:PlayerState, world:{seed, timeOfDay} }
//   { t:'snap', time, timeOfDay, ents:EntityState[], gone:string[] }   ~10 Hz, interest-managed
//   { t:'ev', e:GameEvent }                          discrete gameplay events (see below)
//   { t:'you', you:PlayerState }                     private stats (xp, inventory, cooldowns, quests)
//   { t:'pong', c, s }
//   { t:'error', msg }
//
// EntityState (compact, every snapshot for entities in interest radius):
//   { id, k:'p'|'m'|'n', name, oath, cls, model, lvl, x, y, z, ry, anim, hp, mhp, tgt?, fx? }
//   k: p = player, m = mob, n = npc. model = asset id (see game/src/actors/README). fx = active status ids.
//
// GameEvent.type values:
//   'cast'   {src, ability, slot, aim:{x,y,z}, dir:{x,z}, target?, castTime}
//   'hit'    {src, dst, ability, amount, crit, element, x, y, z}
//   'heal'   {src, dst, amount}
//   'status' {dst, status, dur}
//   'death'  {id, killer}
//   'xp'     {id, amount, total, next}
//   'level'  {id, level}
//   'loot'   {id, items:[{id,name,rarity,qty}]}
//   'quest'  {id, quest:{id,title,text,progress,goal,done}}
//   'chat'   {from, name, text, channel}
//   'system' {text}
//   'discover' {id, shrine}

export const PROTOCOL_VERSION = 1;
export const TICK_HZ = 20;
export const SNAP_HZ = 10;
export const MOVE_HZ = 12;
export const INTEREST_RADIUS = 220;
export const DEFAULT_PORT = 8787;

export const ANIMS = ['idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'dodge', 'attack', 'cast', 'hit', 'dead', 'swim', 'emote'];
