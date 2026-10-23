// Third-person over-the-shoulder orbit camera: mouse/pointer-lock/touch look, zoom,
// terrain + architecture avoidance, follow lag, sprint FOV kick, shake, cinematic intro.
import { Vector3 } from 'three';

export const CAM = { minDist: 2.5, maxDist: 18, defaultDist: 6.2, minPitch: -0.45, maxPitch: 1.3, sens: 0.0032, touchSens: 0.0045, fov: 0.9, sprintFov: 1.0, lag: 12, shoulder: 0.42 };
// Depth precision: a 24-bit depth buffer resolves ~z²/(near·2²⁴) metres, so the near plane is the
// single biggest lever against z-fighting on a 12 km far plane. 0.3 m keeps 3× the resolution of the
// old 0.1 m (2 cm at 250 m instead of 80 m) and the body is faded out when the camera comes closer.
export const NEAR_PLANE = 0.3;
/** Camera–pivot distance below which the local player's body fades out (it would cut the near plane). */
export const BODY_FADE_DIST = 1.35;

export class OrbitCamera {
  constructor(ctx) {
    this.ctx = ctx;
    const cam = ctx.camera;
    cam.near = NEAR_PLANE;
    cam.far = Math.max(1500, (ctx.quality?.drawDistance ?? 1500) * 1.4);
    cam.fov = CAM.fov * 180 / Math.PI;
    cam.inertia = 0;
    this.cam = cam;
    this.yaw = 0; this.pitch = 0.3; this.dist = CAM.defaultDist; this.curDist = CAM.defaultDist;
    this.pivot = new Vector3(0, 0, 0); this.pivotInit = false;
    this.target = null; // actor
    this.shake = 0; this.shakeDur = 0; this.shakeT = 0;
    this.bodyFade = 1;
    this.intro = null;
    this.lookIdle = 10;
    this.drag = null;
    this.tmp = new Vector3(); this.tmp2 = new Vector3(); this.look = new Vector3();
    ctx.scene.onDisposeObservable?.addOnce(() => this.dispose());
    this.time = 0;
    this.cleanup = [];
    this.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const offShake = ctx.bus?.on('camera:shake', (e) => { if (this.reducedMotion) return; const s = e?.strength ?? 0.3; if (s >= this.shake * 0.7) { this.shake = Math.min(1.5, s); this.shakeDur = e?.duration ?? 0.35; this.shakeT = 0; } });
    if (offShake) this.cleanup.push(offShake);
    // left-drag orbits the camera (input only tracks right-drag / pointer lock)
    const canvas = ctx.canvas;
    if (canvas?.addEventListener) {
      const listen = (target, type, fn) => { target.addEventListener(type, fn); this.cleanup.push(() => target.removeEventListener(type, fn)); };
      listen(canvas, 'pointerdown', (e) => { if (ctx.input?.gameplayEnabled !== false && e.pointerType === 'mouse' && e.button === 0) this.drag = { x: e.clientX, y: e.clientY, moved: false }; });
      listen(globalThis, 'pointermove', (e) => {
        if (ctx.input?.gameplayEnabled === false) { this.drag = null; return; }
        if (!this.drag || e.pointerType !== 'mouse' || document.pointerLockElement === canvas) return;
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        if (!this.drag.moved && Math.hypot(dx, dy) < 4) return;
        this.drag.moved = true; this.drag.x = e.clientX; this.drag.y = e.clientY;
        if (!(ctx.input?.state?.mouseRight)) this.addLook(dx, dy, CAM.sens);
      });
      listen(globalThis, 'pointerup', (e) => { if (e.button === 0) this.drag = null; });
      listen(globalThis, 'blur', () => { this.drag = null; });
      listen(globalThis, 'pointercancel', () => { this.drag = null; });
    }
  }

  dispose() {
    if (this.disposed) return; this.disposed = true;
    for (const off of this.cleanup.splice(0)) off();
     this.target = null; this.drag = null;
  }

  addLook(dx, dy, sens) {
    this.yaw += dx * sens;
    this.pitch = Math.max(CAM.minPitch, Math.min(CAM.maxPitch, this.pitch + dy * sens));
    this.lookIdle = 0;
    if (this.intro) this.intro = null;
  }

  follow(actor, snap = true) {
    this.target = actor;
    if (snap && actor) {
      this.yaw = actor.root.rotation.y; this.pivotInit = false;
    }
  }

  startIntro() {
    if (this.reducedMotion || !this.target || this.ctx.params?.get?.('nointro') === '1') return;
    this.intro = { t: 0, dur: 4.2, yaw0: this.yaw + Math.PI * 0.85, yaw1: this.yaw, d0: 15, p0: 0.5 };
  }

  update(dt) {
    const ctx = this.ctx, st = ctx.input?.state;
    this.time += dt;
    if (ctx.input?.gameplayEnabled === false) this.drag = null;
    const a = this.target;
    if (st && ctx.input?.gameplayEnabled !== false) {
      // The opening orbit is presentation only: the first player intent immediately owns the camera.
      if (this.intro && (st.moveX || st.moveY || st.jump || st.mouseLeft)) this.intro = null;
      if (st.lookDX || st.lookDY) {
        const touch = !st.pointerLocked && !st.mouseRight && !this.drag;
        this.addLook(st.lookDX, st.lookDY, touch ? CAM.touchSens : CAM.sens);
      }
      if (st.zoom) { this.dist = Math.max(CAM.minDist, Math.min(CAM.maxDist, this.dist * Math.pow(1.12, st.zoom))); if (this.intro) this.intro = null; }
    }
    this.lookIdle += dt;
    const cam = this.cam;
    if (!a) {
      // idle preview orbit
      this.yaw += dt * 0.05;
      const c = this.pivot;
      cam.position.set(c.x - Math.sin(this.yaw) * 40, c.y + 22, c.z - Math.cos(this.yaw) * 40);
      cam.lookAt(c);
      return;
    }
    const h = (a.body?.height ?? 1.8) * (a.root.scaling.y || 1);
    const ap = a.root.position;
    const swimming = a.controller?.swimming;
    const desiredPivotY = ap.y + h * (swimming ? 0.55 : 0.88);
    if (!this.pivotInit) { this.pivot.set(ap.x, desiredPivotY, ap.z); this.pivotInit = true; }
    const k = 1 - Math.exp(-CAM.lag * dt), ky = 1 - Math.exp(-CAM.lag * 0.6 * dt);
    this.pivot.x += (ap.x - this.pivot.x) * k;
    this.pivot.z += (ap.z - this.pivot.z) * k;
    this.pivot.y += (desiredPivotY - this.pivot.y) * ky;

    // gentle auto-follow behind the character while moving without look input (helps touch play)
    const moving = (a.controller?.groundSpeed ?? 0) > 1.0;
    if (moving && this.lookIdle > 1.6 && !this.intro && !(st?.mouseRight)) {
      const ry = a.root.rotation.y;
      let d = (ry - this.yaw) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 1.0) this.yaw += d * Math.min(1, dt * 0.9); // only when running roughly away from the camera
    }

    let yaw = this.yaw, pitch = this.pitch, dist = this.dist;
    if (this.intro) {
      const I = this.intro; I.t += dt;
      const u = Math.min(1, I.t / I.dur), e = u * u * (3 - 2 * u);
      I.yaw1 = this.yaw;
      yaw = I.yaw0 + (I.yaw1 - I.yaw0) * e;
      dist = I.d0 + (this.dist - I.d0) * e;
      pitch = I.p0 + (this.pitch - I.p0) * e;
      if (u >= 1) this.intro = null;
    }
    // shoulder offset (right), smaller when zoomed out
    const shoulder = CAM.shoulder * Math.min(1, 4.5 / Math.max(dist, 2.5)) + 0.08;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const bx = -Math.sin(yaw) * cp, by = sp, bz = -Math.cos(yaw) * cp;
    const px = this.pivot.x + rx * shoulder, py = this.pivot.y, pz = this.pivot.z + rz * shoulder;
    // obstruction: terrain samples + architecture solids
    let allowed = dist;
    const world = ctx.world, col = ctx.collision;
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * dist;
      const x = px + bx * t, y = py + by * t, z = pz + bz * t;
      const th = world?.heightAt ? world.heightAt(x, z) : -1e9;
      let blocked = y < th + 0.35;
      // collision.blocked samples every 2 m from the pivot (endpoint excluded) at this height
      if (!blocked && col?.blocked && t > 2.2) blocked = col.blocked(px, pz, x + bx * 0.6, z + bz * 0.6, y);
      if (blocked) { allowed = Math.max(0.6, t - dist / steps * 0.9); break; }
    }
    // Obstruction pull-in must be immediate: smoothing can leave the camera inside a wall.
    if (allowed < this.curDist) this.curDist = allowed;
    else this.curDist += (allowed - this.curDist) * Math.min(1, dt * 3.5);
    const d = this.curDist;
    let cx = px + bx * d, cy = py + by * d, cz = pz + bz * d;
    const gh = world?.heightAt ? world.heightAt(cx, cz) : -1e9;
    if (cy < gh + 0.3) cy = gh + 0.3;
    const wl = world?.waterLevel;
    if (wl != null && cy < wl + 0.25 && cy > wl - 0.5) cy = wl + 0.25; // avoid the waterline
    // look target: pivot + shoulder, slightly ahead
    let lx = px, ly = py + 0.08 * Math.min(1, d / 6), lz = pz;
    // shake
    if (this.shake > 0) {
      this.shakeT += dt;
      const f = Math.max(0, 1 - this.shakeT / this.shakeDur);
      const s = this.shake * f * f * 0.12;
      const t = this.time * 38;
      cx += Math.sin(t * 1.1) * s; cy += Math.sin(t * 1.7 + 1) * s * 0.8; cz += Math.cos(t * 1.3) * s;
      lx += Math.sin(t * 0.9 + 2) * s * 0.5; ly += Math.cos(t * 1.5) * s * 0.5;
      if (f <= 0) this.shake = 0;
    }
    cam.position.set(cx, cy, cz);
    this.look.set(lx, ly, lz);
    cam.lookAt(this.look);
    // 0 → the body would intersect the near plane, 1 → comfortably clear (read by actors/index.js)
    this.bodyFade = Math.max(0, Math.min(1, (d - NEAR_PLANE * 1.5) / (BODY_FADE_DIST - NEAR_PLANE * 1.5)));
    // FOV kick
    const fovT = a.sprinting && !this.reducedMotion ? CAM.sprintFov : CAM.fov;
    cam.fov += (fovT * 180 / Math.PI - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix();
  }
}
