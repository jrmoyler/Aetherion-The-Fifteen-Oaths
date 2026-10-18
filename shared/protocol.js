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
//
// ---------------------------------------------------------------------------------------------
// SOCIAL: parties, duels, PvP flag + war zones, honor, trading (additive; PROTOCOL_VERSION unchanged -
// old clients ignore the new fields/events). Server-authoritative: every request is schema-checked
// (server/lib/validate.js) AND re-validated in shared/sim/social.js (also offline). Social requests
// share a per-player token bucket (8 burst, 2/s) on top of the connection rate limit.
//
// CLIENT -> SERVER
//   { t:'party', op:'invite'|'accept'|'decline'|'leave'|'kick'|'lead'|'disband', target?, from? }
//        target = entity id or player name (invite/kick/lead); from = inviter id (accept/decline; omit = newest)
//   { t:'duel',  op:'challenge'|'accept'|'decline'|'forfeit', target?, from? }
//   { t:'trade', op:'request'|'accept'|'decline'|'offer'|'lock'|'unlock'|'confirm'|'cancel', target?, from?,
//        items?:[itemId x <=6], gold?:int }    offer replaces your whole offer (whole stacks); any offer change unlocks BOTH sides
//   { t:'pvp', on:bool }                       raise/lower the PvP banner (10 s toggle cooldown; can't lower during PvP combat)
//   chat channel 'party' (members) and 'whisper' (+ to: id|name). Chat commands: /invite /leave /kick /lead /disband
//        /duel /forfeit /trade /pvp [on|off] /p <text> /w|/tell <name> <text>
//
// EntityState additions (players only; deltas as usual, null/0 when cleared):
//   pvp: 0|1|2   effective PvP state (1 = flagged, 2 = inside a war zone; always 0 inside a sanctuary)
//   party: id|null   duel: id|null
// PlayerState additions: pvp (flag), pvpEff, pvpCd (server ms when the flag may change), pvpCombat, honor, pvpKills,
//   party, duel, trade, war (war zone id|null)
// welcome.world additions: warZones:[{id, name, between:[oathA, oathB], x, z, r}],
//   social:{partyMax, tradeMaxItems, tradeRange, duelRing, pvpDamageMul, pvpToggleCdMs, safeRadius}
//
// GameEvent additions (private unless noted)
//   'invite'  {kind:'party'|'duel'|'trade', from, name, lvl, oath, until, state:'open'}   (30 s timeout)
//             {kind, from, state:'closed', reason?:'expired'|'logout'}               remove the prompt
//   'party'   {id, party:{id, leader, members:[{id,name,oath,cls,lvl,hp,mhp,mp,mmp,alive,x,z,pvp,tgt}]}|null}
//             sent on every change and at 2 Hz while values change: members are shown on the maps regardless of interest
//   'duel'    {id, a, b, an, bn, x, z, r, state:'countdown', at}  (fight starts at server time `at`, 3 s)
//             {..., state:'fight'} | {..., state:'end', winner?, loser?, reason:'defeat'|'fled'|'forfeit'|'death'|'logout'|'timeout'|'cancelled'}
//             to both duellists and spectators within 120 m. Duels end at 1 HP (no death); leaving the ring (r) forfeits.
//   'pvp'     {id, on, cd}
//   'warzone' {id, zone:{id,name,x,z,r}|null}            entered / left a contested border (everyone auto-flagged)
//   'honor'   {id, victim, name, honor, total, kills}     PvP kill credit (0 honor for repeat kills within 10 min / far lower level)
//   'trade'   {id, state:'open'|'update', with, name, ver, you:{items:[Item],gold,locked,confirmed}, them:{...}}
//             {id, state:'done', gave:[item], got:[item], goldGave, goldGot} | {id, state:'cancelled', reason, by?}
//             reasons: cancelled distance(>12 m) combat death logout invalid(re-validation failed at commit) full duel
//
// RULES (shared/sim/social.js + combat.js): party max 5; XP, personal loot rolls and quest kill credit are shared by party
// members alive within 110 m of the kill (XP split by recipient count with the group bonus). Players can damage each other only
// when (a) duelling each other after the countdown, or (b) both are effectively flagged (flag or war zone), neither is inside a
// sanctuary's 150 m safe radius, and they are not in the same party (pets follow their owner). PvP damage x0.6; stun/root/slow
// from players diminish x1, x0.5, x0.25 then immune (15 s window). PvP death: normal shrine respawn, no item loss.

export const PROTOCOL_VERSION = 1;
export const TICK_HZ = 20;
export const SNAP_HZ = 10;
export const MOVE_HZ = 12;
export const INTEREST_RADIUS = 220;
export const DEFAULT_PORT = 8787;

export const ANIMS = ['idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'dodge', 'attack', 'cast', 'hit', 'dead', 'swim', 'emote'];

// Social (see "SOCIAL" above). Authoritative values live in shared/sim/social.js; welcome.world.social mirrors them.
export const SOCIAL_MESSAGES = ['party', 'duel', 'trade', 'pvp'];
export const SOCIAL_EVENTS = ['invite', 'party', 'duel', 'pvp', 'warzone', 'honor', 'trade'];
export const CHAT_CHANNELS = ['say', 'world', 'oath', 'party', 'whisper'];
