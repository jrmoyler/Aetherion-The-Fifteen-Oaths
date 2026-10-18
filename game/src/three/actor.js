// Actor: one character/creature in the world (local player, remote player, mob, NPC).
import { Group } from 'three';
import { CREATURE_BY_ID } from '@shared/creatures.js';

const KIND = { p: 'player', m: 'mob', n: 'npc' };
export const INTERP_DELAY = 0.12;

export class Actor {
  constructor(scene, st, opts = {}) {
    this.id = st.id;
    this.kind = KIND[st.k] ?? st.kind ?? 'player';
    this.isSelf = !!opts.isSelf;
    this.name = st.name ?? '';
    this.oath = st.oath ?? 'oath-11';
    this.cls = st.cls ?? 'ninja';
    this.model = st.model ?? null;
    this.level = st.lvl ?? st.level ?? 1;
    this.hp = st.hp ?? 100; this.mhp = st.mhp ?? 100;
    this.alive = st.anim !== 'dead' && (st.hp == null || st.hp > 0);
    const c = this.kind === 'mob' ? CREATURE_BY_ID[this.model] : null;
    this.role = c?.role ?? null;
    this.title = this.kind === 'npc' ? (st.role ?? st.title ?? '') : '';
    this.creature = c;
    this.root = new Group();
    scene.add(this.root); this.root.scaling = this.root.scale;
    this.root.position.set(st.x ?? 0, st.y ?? 0, st.z ?? 0);
    this.root.rotation.y = st.ry ?? 0;
    const sc = c?.scale ?? st.scale ?? 1;
    this.root.scaling.set(sc, sc, sc);
    this.body = null;
    this.buf = [];
    this.visible = true;
    this.fade = 0; this.fadeDir = 1;
    this.deadT = 0;
    this.lastAnim = null; this.animHold = 0; this.atkN = 0;
    this.speedEst = 0; this.prevX = this.root.position.x; this.prevZ = this.root.position.z;
    this.targetRy = this.root.rotation.y;
    this.lastSeen = performance.now() / 1000;
    this.dist = 0;
    this.castUntil = 0; this.castAnim = null;
    this.radius = 0.4;
    this.controller = null;
    this.plate = null;
    this.state = st;
  }
  get position() { return this.root.position; }
  get headY() { return (this.body?.height ?? 1.8) * (this.root.scaling.y || 1) + 0.12; }
  get iframes() { return this.controller?.iframes ?? false; }
  socket(name) {
    const s = this.body?.sockets;
    if (!s) return this.root;
    return s[`socket.${name}`] ?? s[name] ?? (name === 'chest' ? s['socket.chest'] : null) ?? this.root;
  }
  playAnim(name, opts = {}) {
    if (!this.body) return;
    this.lastActionAt = performance.now() / 1000;
    this.body.animator.playAnim(name, opts);
  }
  /** facing helper for combat (local player) */
  faceToward(x, z, dur) { if (this.controller) this.controller.faceToward(x, z, dur); else this.targetRy = Math.atan2(x - this.root.position.x, z - this.root.position.z); }

  pushSample(t, e) {
    const b = this.buf;
    if (b.length && Math.hypot(e.x - b[b.length - 1].x, e.z - b[b.length - 1].z) > 25) b.length = 0; // teleported
    if (b.length && t <= b[b.length - 1].t) t = b[b.length - 1].t + 0.001;
    b.push({ t, x: e.x, y: e.y, z: e.z, ry: e.ry ?? 0 });
    if (b.length > 24) b.shift();
  }

  /** Interpolate the buffered snapshots at render time rt. Returns true if moved. */
  interpolate(rt, dt) {
    const b = this.buf;
    if (!b.length) return;
    const r = this.root.position;
    let x, y, z, ry;
    if (rt <= b[0].t) { ({ x, y, z, ry } = b[0]); }
    else if (rt >= b[b.length - 1].t) {
      const L = b[b.length - 1];
      const P = b.length > 1 ? b[b.length - 2] : L;
      const ext = Math.min(0.25, rt - L.t), span = Math.max(1e-3, L.t - P.t);
      const k = b.length > 1 && span < 0.5 ? ext / span : 0;
      x = L.x + (L.x - P.x) * k; y = L.y + (L.y - P.y) * k; z = L.z + (L.z - P.z) * k; ry = L.ry;
    } else {
      let i = 0; while (i < b.length - 2 && b[i + 1].t < rt) i++;
      const A = b[i], B = b[i + 1];
      const k = (rt - A.t) / Math.max(1e-4, B.t - A.t);
      x = A.x + (B.x - A.x) * k; y = A.y + (B.y - A.y) * k; z = A.z + (B.z - A.z) * k;
      let d = (B.ry - A.ry) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
      ry = A.ry + d * k;
      while (b.length > 3 && b[1].t < rt - 0.5) b.shift();
    }
    r.set(x, y, z);
    this.targetRy = ry;
    // smooth rotation
    let d = (this.targetRy - this.root.rotation.y) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
    this.root.rotation.y += d * Math.min(1, dt * 12);
    const yawVel = Math.max(-3, Math.min(3, d * 12));
    // speed estimate (wall-clock based: interpolation follows real time even when frames are slow)
    const realDt = Math.max(1e-3, rt - (this.prevRt ?? rt - dt));
    this.prevRt = rt;
    const sp = Math.hypot(x - this.prevX, z - this.prevZ) / realDt;
    this.prevX = x; this.prevZ = z;
    this.speedEst += (Math.min(sp, 20) - this.speedEst) * Math.min(1, dt * 7);
    if (this.body) { const an = this.body.animator; an.speed = this.speedEst < 0.15 ? 0 : this.speedEst; an.yawVel += (yawVel - an.yawVel) * Math.min(1, dt * 6); }
  }

  dispose() {
    if (this.disposedBody) return;
    this.disposed = true; this.disposedBody = true;
    this.body?.dispose();
    this.root.removeFromParent();
  }
}
