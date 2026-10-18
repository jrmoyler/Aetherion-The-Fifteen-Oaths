// Local player controller: camera-relative movement with acceleration, turn smoothing,
// walk/run/sprint, jump with coyote time + buffering, dodge roll with i-frames, slope limits,
// step-up onto architecture, swimming, world bounds, and net move sync at MOVE_HZ.
import { CLASSES, regionAt } from '@shared/oaths.js';
import { MOVE_HZ } from '@shared/protocol.js';
import { WORLD_HALF } from '@shared/terrain.js';

export const TUNING = {
  accelGround: 11, decelGround: 13, accelAir: 2.2,
  turnRate: 13, walkFactor: 0.38, sprintFactor: 1.45, backFactor: 1.0,
  gravity: 24, jumpVel: 7.0, coyote: 0.12, jumpBuffer: 0.14, terminal: 42,
  dodgeTime: 0.55, dodgeSpeed: 9.5, dodgeIFrames: [0.06, 0.42], dodgeCooldown: 0.75,
  stepUp: 0.55, stepDown: 0.65, slopeLimitDeg: 48, radius: 0.38,
  swimDepth: 1.2, swimFactor: 0.55,
};

const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export class PlayerController {
  constructor(ctx, actor, getCameraYaw) {
    this.ctx = ctx;
    this.actor = actor;
    this.getCameraYaw = getCameraYaw;
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = actor.root.rotation.y;
    this.grounded = true; this.lastGrounded = 0; this.jumpReq = -1; this.airT = 0;
    this.dodgeT = -1; this.dodgeCd = 0; this.dodgeDir = { x: 0, z: 1 };
    this.swimming = false; this.walking = false;
    this.time = 0;
    this.sendT = 0; this.heartbeatT = 0; this.seq = 0;
    this.last = { x: NaN, y: 0, z: 0, ry: 0, anim: '' };
    this.region = null; this.regionT = 0;
    this.movedT = 0; this.lastEmit = { x: NaN, z: NaN };
    this.speed = CLASSES[actor.cls]?.moveSpeed ?? 6.2;
    this.faceOverride = null; this.faceT = 0;
    this.prevJumpHeld = false;
    this.frozen = false;
    this.pos = { x: 0, y: 0, z: 0 };
    this.groundSpeed = 0;
  }

  get iframes() { return this.dodgeT >= 0 && this.dodgeT >= TUNING.dodgeIFrames[0] && this.dodgeT <= TUNING.dodgeIFrames[1]; }

  teleport(x, y, z, ry) {
    const r = this.actor.root;
    const g = this.groundAt(x, z, (y ?? 0) + 1.5);
    r.position.set(x, Math.max(y ?? g, g), z);
    if (ry != null) { this.yaw = ry; r.rotation.y = ry; }
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.dodgeT = -1;
  }

  /** face a world point briefly (casting at a target) */
  faceToward(x, z, dur = 0.6) {
    const p = this.actor.root.position;
    if (Math.hypot(x - p.x, z - p.z) < 0.05) return;
    this.faceOverride = Math.atan2(x - p.x, z - p.z); this.faceT = dur;
  }

  groundAt(x, z, yHint) {
    const c = this.ctx.collision;
    if (c?.groundAt) return c.groundAt(x, z, yHint, TUNING.stepUp);
    return this.ctx.world?.heightAt?.(x, z) ?? 0;
  }
  terrainH(x, z) { return this.ctx.world?.heightAt?.(x, z) ?? this.groundAt(x, z, 1e9); }
  normalY(x, z) {
    const w = this.ctx.world;
    if (w?.normalAt) { const n = w.normalAt(x, z); const ny = n.y ?? n[1]; const nx = n.x ?? n[0]; const nz = n.z ?? n[2]; return { x: nx, y: ny, z: nz }; }
    const e = 0.8, h = (a, b) => this.terrainH(a, b);
    const dx = h(x + e, z) - h(x - e, z), dz = h(x, z + e) - h(x, z - e);
    const l = Math.hypot(dx, 2 * e, dz);
    return { x: -dx / l, y: (2 * e) / l, z: -dz / l };
  }

  update(dt) {
    const ctx = this.ctx, input = ctx.input, a = this.actor, root = a.root, T = TUNING;
    this.time += dt;
    const pos = root.position;
    const alive = a.alive !== false;
    const st = input?.state ?? { moveX: 0, moveY: 0, sprint: false };
    if (input?.consume?.('walkToggle')) this.walking = !this.walking;
    // ---- wish direction (camera relative)
    const cy = this.getCameraYaw();
    const fx = Math.sin(cy), fz = Math.cos(cy);
    const rx = Math.cos(cy), rz = -Math.sin(cy);
    let mx = st.moveX ?? 0, my = st.moveY ?? 0;
    if (!alive || this.frozen) { mx = 0; my = 0; this.dodgeT = -1; this.jumpReq = -1; this.vel.x = 0; this.vel.z = 0; }
    let wx = fx * my + rx * mx, wz = fz * my + rz * mx;
    const mag = Math.min(1, Math.hypot(wx, wz));
    if (mag > 1e-3) { const wl0 = Math.hypot(wx, wz); wx /= wl0; wz /= wl0; }
    let speed = this.speed * mag;
    if (this.walking || (mag > 0 && mag < 0.45)) speed = this.speed * T.walkFactor * (this.walking ? 1 : Math.max(0.5, mag / 0.45));
    const sprinting = st.sprint && mag > 0.5 && !this.walking && this.grounded && !this.swimming;
    if (sprinting) speed *= T.sprintFactor;

    // ---- jump / dodge requests
    const jumpHeld = !!st.jump;
    if ((input?.consume?.('jump') || (jumpHeld && !this.prevJumpHeld)) && alive && !this.frozen) this.jumpReq = this.time;
    this.prevJumpHeld = jumpHeld;
    this.dodgeCd -= dt;
    if (input?.consume?.('dodge') && alive && !this.frozen && this.dodgeT < 0 && this.dodgeCd <= 0 && !this.swimming) {
      this.dodgeT = 0; this.dodgeCd = T.dodgeCooldown;
      const dx = mag > 0.1 ? wx : Math.sin(this.yaw), dz = mag > 0.1 ? wz : Math.cos(this.yaw);
      this.dodgeDir.x = dx; this.dodgeDir.z = dz;
      this.yaw = Math.atan2(dx, dz);
      a.body?.animator.setState('dodge');
      ctx.bus?.emit('player:dodge', { x: pos.x, y: pos.y, z: pos.z });
    }

    // ---- horizontal velocity
    let tx = wx * speed, tz = wz * speed;
    if (this.swimming) { tx *= T.swimFactor; tz *= T.swimFactor; }
    if (this.dodgeT >= 0) {
      this.dodgeT += dt;
      const k = this.dodgeT / T.dodgeTime;
      const s = T.dodgeSpeed * (k < 0.7 ? 1 : Math.max(0, (1 - k) / 0.3));
      this.vel.x = this.dodgeDir.x * s; this.vel.z = this.dodgeDir.z * s;
      if (k >= 1) { this.dodgeT = -1; a.body?.animator.setState('loco'); }
    } else {
      const accel = this.grounded || this.swimming ? (tx * tx + tz * tz > this.vel.x * this.vel.x + this.vel.z * this.vel.z ? T.accelGround : T.decelGround) : T.accelAir;
      const kk = 1 - Math.exp(-accel * dt);
      this.vel.x += (tx - this.vel.x) * kk; this.vel.z += (tz - this.vel.z) * kk;
    }

    // ---- slope limit (block uphill component on steep terrain)
    const n = this.normalY(pos.x + this.vel.x * 0.15, pos.z + this.vel.z * 0.15);
    const limit = Math.cos(T.slopeLimitDeg * Math.PI / 180);
    if (this.grounded && !this.swimming && n.y < limit) {
      const hl = Math.hypot(n.x, n.z) || 1, dx = n.x / hl, dz = n.z / hl; // downhill direction
      const up = -(this.vel.x * dx + this.vel.z * dz);
      if (up > 0) { this.vel.x += up * dx; this.vel.z += up * dz; }
      const slide = (limit - n.y) * 14;
      this.vel.x += dx * slide * dt * 10; this.vel.z += dz * slide * dt * 10;
    }

    // ---- integrate horizontal with step / wall checks
    const ox = pos.x, oz = pos.z, oy = pos.y;
    let nx = ox + this.vel.x * dt, nz = oz + this.vel.z * dt;
    const tryMove = (x, z) => {
      const g = this.groundAt(x, z, pos.y);
      if (this.grounded && !this.swimming && g - pos.y > T.stepUp) return false;
      return true;
    };
    if (!tryMove(nx, nz)) {
      if (tryMove(nx, oz)) nz = oz; else if (tryMove(ox, nz)) nx = ox; else { nx = ox; nz = oz; }
    }
    const p = this.pos; p.x = nx; p.y = pos.y; p.z = nz;
    ctx.collision?.resolve?.(p, T.radius, (a.body?.height ?? 1.8) * 0.95, T.stepUp);
    nx = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, p.x)); nz = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, p.z));

    // ---- water
    const wl = ctx.world?.waterLevel ?? -1e9;
    const terr = this.terrainH(nx, nz);
    const floorG = this.groundAt(nx, nz, pos.y);
    const depth = wl - terr;
    const onStructure = floorG > terr + 0.3 && floorG > wl - 0.3;
    const h = a.body?.height ?? 1.8;
    if (!this.swimming && depth > T.swimDepth && !onStructure && pos.y < wl - 0.9) this.swimming = true;
    else if (this.swimming && (depth < T.swimDepth - 0.15 || onStructure)) this.swimming = false;

    // ---- vertical
    let ny = pos.y;
    const g = this.groundAt(nx, nz, pos.y + 0.05);
    if (this.swimming) {
      const target = wl - h * 0.6;
      this.vel.y = 0;
      ny += (target - ny) * Math.min(1, dt * 4);
      this.grounded = false; this.airT = 0; this.lastGrounded = this.time;
    } else {
      const canJump = this.time - this.lastGrounded <= T.coyote && this.dodgeT < 0;
      if (this.jumpReq >= 0 && this.time - this.jumpReq <= T.jumpBuffer && canJump && alive && !this.frozen) {
        this.vel.y = T.jumpVel; this.grounded = false; this.lastGrounded = -1; this.jumpReq = -1;
        a.body?.animator.setState('jump');
        ctx.bus?.emit('player:jump', {});
      }
      this.vel.y = Math.max(-T.terminal, this.vel.y - T.gravity * dt);
      ny = pos.y + this.vel.y * dt;
      if (this.vel.y <= 0 && (ny <= g || (this.grounded && pos.y - g <= T.stepDown))) {
        const wasAir = !this.grounded && this.airT > 0.35;
        ny = g; this.vel.y = 0;
        if (!this.grounded) {
          this.grounded = true;
          if (wasAir && this.dodgeT < 0) a.body?.animator.setState('land');
          else if (this.dodgeT < 0) a.body?.animator.setState('loco');
          if (wasAir) ctx.bus?.emit('player:land', { speed: this.airT });
        }
        this.lastGrounded = this.time; this.airT = 0;
      } else {
        if (this.grounded && this.vel.y <= 0 && pos.y - g > T.stepDown) this.grounded = false;
        if (this.vel.y > 0) this.grounded = false;
        if (!this.grounded) this.airT += dt;
        if (!this.grounded && this.dodgeT < 0 && this.airT > 0.12) a.body?.animator.setState(this.vel.y > 0.5 ? 'jump' : 'fall');
      }
      // never fall through the world
      const terrNow = this.terrainH(nx, nz);
      if (ny < terrNow - 0.6) { ny = Math.max(g, terrNow); this.vel.y = 0; this.grounded = true; }
    }
    root.position.set(nx, ny, nz);

    // ---- facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.groundSpeed = Math.hypot(nx - ox, nz - oz) / Math.max(dt, 1e-4);
    let targetYaw = this.yaw;
    if (this.faceT > 0) { this.faceT -= dt; targetYaw = this.faceOverride; }
    else if (st.mouseRight && mag > 0.1 && !this.swimming) targetYaw = cy; // mouse steering: face camera direction
    else if (hs > 0.4 && this.dodgeT < 0 && mag > 0.05) targetYaw = Math.atan2(this.vel.x, this.vel.z);
    const prev = this.yaw;
    if (this.dodgeT < 0) this.yaw += angDiff(this.yaw, targetYaw) * (1 - Math.exp(-T.turnRate * dt));
    root.rotation.y = this.yaw;
    const yawVel = angDiff(prev, this.yaw) / Math.max(dt, 1e-4);

    // ---- animation drive
    const anim = a.body?.animator;
    if (anim) {
      // backwards when moving opposite to facing (mouse-steer strafing)
      const fwd = Math.sin(this.yaw) * this.vel.x + Math.cos(this.yaw) * this.vel.z;
      anim.backwards = fwd < -0.3 && hs > 0.5;
      anim.speed = this.swimming ? 0 : this.groundSpeed;
      anim.yawVel = anim.yawVel + (yawVel - anim.yawVel) * Math.min(1, dt * 8);
      if (!alive) anim.setState('dead');
      else if (this.swimming) anim.setState('swim');
      else if (anim.state === 'swim' || anim.state === 'dead') anim.setState('loco');
    }
    a.sprinting = sprinting && hs > this.speed * 1.1;

    // ---- events + network
    const dxm = nx - this.lastEmit.x, dzm = nz - this.lastEmit.z;
    this.movedT += dt;
    if (!(Math.abs(dxm) < 0.05 && Math.abs(dzm) < 0.05) && this.movedT > 0.1) {
      this.movedT = 0; this.lastEmit.x = nx; this.lastEmit.z = nz;
      ctx.bus?.emit('player:moved', { x: nx, y: ny, z: nz });
    }
    this.regionT -= dt;
    if (this.regionT <= 0) {
      this.regionT = 0.5;
      const reg = (ctx.world?.regionAt ?? regionAt)(nx, nz);
      const id = reg?.id ?? reg;
      if (id && id !== this.region) { this.region = id; ctx.bus?.emit('player:region', { oath: id, name: reg?.name }); }
    }
    this.sync(dt, nx, ny, nz);
  }

  animString() {
    const a = this.actor, an = a.body?.animator;
    if (a.alive === false) return 'dead';
    if (this.swimming) return 'swim';
    if (this.dodgeT >= 0) return 'dodge';
    if (!this.grounded && this.airT > 0.1) return this.vel.y > 0 ? 'jump' : 'fall';
    if (an?.action) { const n = typeof an.action === 'string' ? an.action : an.action.name ?? ''; return n.startsWith('cast') ? 'cast' : n.startsWith('attack') ? 'attack' : n === 'emote' ? 'emote' : 'attack'; }
    if (an?.channel) return 'cast';
    if (an?.state === 'emote') return 'emote';
    const s = this.groundSpeed;
    if (s < 0.25) return 'idle';
    if (s < 2.6) return 'walk';
    if (s < this.speed * 1.15) return 'run';
    return 'sprint';
  }

  sync(dt, x, y, z) {
    const net = this.ctx.net;
    if (!net?.send) return;
    this.sendT -= dt; this.heartbeatT -= dt;
    if (this.sendT > 0) return;
    const anim = this.animString();
    const L = this.last;
    const moved = !(Math.abs(L.x - x) < 0.01 && Math.abs(L.y - y) < 0.01 && Math.abs(L.z - z) < 0.01);
    const turned = Math.abs(angDiff(L.ry, this.yaw)) > 0.02;
    if (moved || turned || anim !== L.anim || this.heartbeatT <= 0) {
      const ry = Math.round(this.yaw * 1000) / 1000;
      try { net.send({ t: 'move', x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3), ry, anim, seq: ++this.seq }); } catch (e) { /* offline */ }
      L.x = x; L.y = y; L.z = z; L.ry = this.yaw; L.anim = anim;
      this.heartbeatT = 1.0;
    }
    this.sendT = 1 / MOVE_HZ;
  }
}
