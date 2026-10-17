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
//   'teleport' {id, x, y, z, ry}                    authoritative reposition (respawn, travel, correction)
//   'npc'    {id, npc, name, role, text, options:[{id,label}]}   NPC dialogue for the interacting player
//
// ---------------------------------------------------------------------------------------------
// ADDITIONS (server agent; all backwards compatible - existing fields keep their meaning)
//
// Framing: a server frame is either one message object or a JSON ARRAY of message objects
// (messages produced in the same tick window are batched). game/src/net unpacks both.
//
// Snapshot deltas (wire only; game/src/net re-hydrates so `net:snap` always carries full
// EntityState objects for every entity in the interest radius):
//   - an entry WITH `k` is a full EntityState (entity new to this client): replace.
//   - an entry WITHOUT `k` is a delta {id, ...changed fields}: merge into the known entity.
//   - entities that did not change since the last snapshot are omitted entirely.
//   - entities that left the interest radius / despawned are listed in `gone`.
// EntityState extra fields: role (mob role 'common'|'veteran'|'elite'|'boss'|'pet', or NPC role),
//   el (mob element), own (owner player id for summoned pets, k:'m'), scale (model scale for bosses).
//   fx = active status ids (see shared/sim/data.js STATUSES: burn chill shock soak root stagger poison
//   bleed weaken expose sunder shield haste empower regen slow gravity freeze invuln ...).
//
// CLIENT -> SERVER additions
//   { t:'dialog', npc, option }                      choose an NPC dialogue option (ids from the 'npc' event);
//                                                    { t:'interact', id:npcId, option } is accepted as the same thing
//   { t:'equip', item } / { t:'unequip', slot } / { t:'use', item } / { t:'drop', item }   inventory (item = item id)
//   hello may carry `spawn:{x,z}` (honoured only by the offline LocalServer, for ?spawn=x,z) and `v` (protocol version).
//   chat text starting with '/' is a command: /who /where /stuck /events
//
// SERVER -> CLIENT additions
//   welcome.world also has: daySeconds, protocol, tickHz, snapHz, interest, events:[{kind,region,until,text}],
//     sanctuaries:[{oathId, center:[x,z], y, shrine:{x,y,z}, spawn:{x,y,z,ry}, npcs:[{role,id,x,y,z,ry}]}],
//     lairs:[{oath, boss, x,y,z, level}]
//   welcome.resumed = true when a token resumed a live character (reconnect within the grace window).
//   'you' may be PARTIAL (`partial:true`): inventory/equipment and quests/discovered are omitted when unchanged;
//     game/src/net merges partial updates so `net:you` always carries the full PlayerState.
//   PlayerState: {id, name, oath, cls, lvl, xp, next, gold, hp, mhp, mp, mmp, alive, x,y,z,ry,
//     stats:{power, armor, crit, haste, speed}, cooldowns:[6 x server-ms ready time | 0], gcd, casting:{slot,until}|null,
//     inventory:[Item], equipment:{slot: Item}, quests:[Quest], discovered:[oathId], combat:bool, fx:[status]}
//   Item: {id, kind:'gear'|'consumable'|'material', name, rarity:'common'|'uncommon'|'rare'|'epic'|'legendary', qty,
//     value, slot?:'weapon'|'head'|'chest'|'hands'|'legs'|'feet'|'trinket', lvl?, oath?, stats?:{power,armor,hp,mp,crit,haste}, key?}
//
// GameEvent additions / extra fields
//   'cast'   + element, shape, radius, speed (projectile/line travel m/s), release:true (end of a cast-time cast),
//            telegraph:true (mob/world AoE warning; resolve after castTime at aim with radius), phase (boss phase change).
//            Mob/world ability ids: mob/claw mob/bolt mob/slam mob/nova mob/roar mob/phase pet/strike world/meteor item/<key>.
//            src is null for world hazards.
//   'hit'    + rx (element reaction name, e.g. 'Overload'), absorbed (shield), dot:true (status tick)
//   'loot'   + gold, src (killed mob id)
//   'teleport' + reason: 'speed'|'teleport'|'bounds'|'height' (movement correction) |'respawn'|'travel'|'stuck'
//   'interrupt' {id, slot, reason}                   a cast-time cast was cancelled (moved, stunned, travel)
//   'fail'   {id, slot, reason}                       private: cast rejected ('cooldown'|'gcd'|'mana'|'range'|'stunned'|'casting'|'dead')
//   'world'  {kind:'storm'|'meteors'|'worldboss'|'surge', region, state:'start'|'end', until?, x?, z?, text?, success?}
//   'chat'   + oath (sender's Oath)

export const PROTOCOL_VERSION = 1;
export const TICK_HZ = 20;
export const SNAP_HZ = 10;
export const MOVE_HZ = 12;
export const INTEREST_RADIUS = 220;
export const DEFAULT_PORT = 8787;

export const ANIMS = ['idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'dodge', 'attack', 'cast', 'hit', 'dead', 'swim', 'emote'];
