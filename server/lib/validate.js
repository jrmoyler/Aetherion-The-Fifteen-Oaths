// Schema checks for client -> server messages (shared/protocol.js). Returns a sanitized copy
// containing only known fields, or null when the message is malformed.
const num = (v, lim = 1e6) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const str = (v, max) => typeof v === 'string' && v.length <= max;
const optStr = (v, max) => v === undefined || v === null || str(v, max);
const vec3 = (v) => v && typeof v === 'object' && num(v.x, 1e5) && num(v.z, 1e5) && (v.y === undefined || num(v.y, 1e5));
const vec2 = (v) => v && typeof v === 'object' && num(v.x, 1e3) && num(v.z, 1e3);

const V = {
  hello: (m) => str(m.name ?? '', 40) && str(m.oath ?? '', 16) && str(m.cls ?? '', 16) && optStr(m.token, 80)
    && { t: 'hello', name: m.name ?? '', oath: m.oath ?? '', cls: m.cls ?? '', token: m.token ?? undefined },
  move: (m) => num(m.x, 1e5) && num(m.y, 1e5) && num(m.z, 1e5) && (m.ry === undefined || num(m.ry, 1e3)) && optStr(m.anim, 16) && (m.seq === undefined || num(m.seq, 2 ** 53))
    && { t: 'move', x: m.x, y: m.y, z: m.z, ry: m.ry, anim: m.anim, seq: m.seq },
  cast: (m) => Number.isInteger(m.slot) && m.slot >= 0 && m.slot <= 5 && optStr(m.target, 48)
    && (m.aim === undefined || m.aim === null || vec3(m.aim)) && (m.dir === undefined || m.dir === null || vec2(m.dir))
    && { t: 'cast', slot: m.slot, target: m.target ?? null, aim: m.aim ? { x: m.aim.x, y: m.aim.y, z: m.aim.z } : null, dir: m.dir ? { x: m.dir.x, z: m.dir.z } : null },
  target: (m) => optStr(m.id, 48) && { t: 'target', id: m.id ?? null },
  chat: (m) => str(m.text, 400) && (m.channel === undefined || ['say', 'world', 'oath'].includes(m.channel)) && { t: 'chat', text: m.text, channel: m.channel ?? 'say' },
  interact: (m) => str(m.id, 64) && optStr(m.option, 32) && { t: 'interact', id: m.id, option: m.option ?? undefined },
  dialog: (m) => str(m.npc, 64) && str(m.option, 32) && { t: 'dialog', npc: m.npc, option: m.option },
  travel: (m) => str(m.shrine, 16) && { t: 'travel', shrine: m.shrine },
  respawn: () => ({ t: 'respawn' }),
  ping: (m) => num(m.c, 1e15) && { t: 'ping', c: m.c },
  equip: (m) => str(m.item, 48) && { t: 'equip', item: m.item },
  use: (m) => str(m.item, 48) && { t: 'use', item: m.item },
  drop: (m) => str(m.item, 48) && { t: 'drop', item: m.item },
  unequip: (m) => str(m.slot, 12) && { t: 'unequip', slot: m.slot },
};

export function validate(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return null;
  const f = V[m.t];
  if (!f) return null;
  return f(m) || null;
}

export const MESSAGE_TYPES = Object.keys(V);
