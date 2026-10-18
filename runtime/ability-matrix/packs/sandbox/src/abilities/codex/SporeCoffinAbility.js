import { InstancedMesh, Matrix4, Mesh, SphereGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createRibGeometry, createCoffinQuadGeometry } from '../../assets/codex/SporeCoffinGeometry.js';
import {
  createRibMaterial,
  createPodMaterial,
  createFogMaterial,
  createMatMaterial,
  createBlastWarpMaterial,
  MAX_RIBS
} from '../../materials/codex/SporeCoffinMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'sporecoffin';

const TAU = Math.PI * 2;
/** Puffballs on the ribs at most; `podCount` picks how many. */
const MAX_PODS = 64;
/** Bodies the coffin can hold at once. */
const MAX_CAGED = 12;
/** Directions the burst is thrown along — a fan, so no allocation per spore. */
const BURST_FAN = 16;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _body = new Vector3();
const _v = new Vector3();
const _cross = new Vector3();
const _axis = new Vector3();
const _m = new Matrix4();
const _up = new Vector3(0, 1, 0);

/**
 * SPORE COFFIN — a cage of fungal ribs, packed with spores, that bursts.
 *
 * A zone cast. While the cast runs out to the circle a **ring of mycelium**
 * draws itself round it on the floor. Then the ribs **sprout**: a dozen and
 * more pale fungal stalks break the floor round the ring one after another,
 * arch up and inward, overshoot and close over the middle in a crown — a
 * coffin of bars with the bodies inside it. Puffball **pods** swell on the
 * ribs, a mat of glowing hyphae grows in from the ring, and the coffin **fills
 * with spores** from the floor up: a churning, glowing mustard fog behind the
 * bars. It holds; the gills light, the pods throb, the bars tremble — then it
 * **bursts**: every rib swings outward about its root like a petal tearing
 * open and rots away with a pale burning edge, the pods pop, a blast of spores
 * and choking puffs and flesh chunks is thrown out of the circle, and the air
 * bends. The haze settles and the mat erodes.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1–2. **the ribs** (`createRibMaterial`) — an instanced tube grid bent in
 *        the vertex stage along the arch, grown, swung and rotted there.
 *   3. **the pods** (`createPodMaterial`) — an InstancedMesh placed on the
 *      CPU from `_ribPoint`, the CPU twin of the arch.
 *   4. **the spore fog** (`createFogMaterial`) — fills the dome from the floor.
 *   5. **the mycelium mat** (`createMatMaterial`) — ring, threads, nodes.
 *   6. **the burst** — a blast warp on `LAYER.DISTORTION`, an AIR shell,
 *      DUSTRING and SHOCKWAVE decals, flash, shake and a light punch.
 *   7. **spores, puffs & chunks** — additive curl-noise spores, non-additive
 *      SMOKE puffs and lit CHIP chunks of flesh.
 *   8. **the caged** — `handlesOwnHits`: bodies inside are overgrown while it
 *      holds and blown out of the circle at the burst.
 *
 * ## The editor rule
 *
 * A cast keeps dice (a seed, the pods' rib/height/size) and one clock; the
 * arch, the growth, the swing and every colour are read from
 * `settings.sporecoffin` each frame.
 */
export class SporeCoffinAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Ribs plus pods standing. HUD readout only. */
  get instanceCount() {
    return this.ribs.visible ? Math.round(settings[ID].ribCount) + this.pods.count : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.ribGeometry = createRibGeometry(MAX_RIBS, 64, 10);
    this.ribMaterial = createRibMaterial();
    this.ribs = this._mesh(this.ribGeometry, this.ribMaterial, LAYER.VFX, 6);
    // Opaque flesh: drawn with the opaques, writing depth.
    this._ribRands = this.ribGeometry.getAttribute('aRib').array;

    this.podGeometry = new SphereGeometry(1, 16, 12);
    this.podMaterial = createPodMaterial();
    this.pods = new InstancedMesh(this.podGeometry, this.podMaterial, MAX_PODS);
    this.pods.layers.set(LAYER.VFX);
    this.pods.renderOrder = 8;
    this.pods.frustumCulled = false;
    this.pods.visible = false;
    this.pods.count = 0;
    this.group.add(this.pods);

    this.fogGeometry = new SphereGeometry(1, 40, 24);
    this.fogMaterial = createFogMaterial();
    this.fog = this._mesh(this.fogGeometry, this.fogMaterial, LAYER.VFX, 10);

    this.quadGeometry = createCoffinQuadGeometry();
    this.matMaterial = createMatMaterial();
    this.mat = this._mesh(this.quadGeometry, this.matMaterial, LAYER.VFX, 2);
    this.warpMaterial = createBlastWarpMaterial();
    this.warp = this._mesh(this.quadGeometry, this.warpMaterial, LAYER.DISTORTION, 0);

    this._ribState = { center: new Vector3(), growClock: 0, fling: 0, push: 0, vein: 0, rot: 0, seed: 0 };
    this._fogState = { center: new Vector3(), fill: 0, fade: 1, seed: 0 };
    this._matState = { center: new Vector3(), ring: 0, spread: 0, live: 1, fadeT: 0, seed: 0 };
    this._warpState = { center: new Vector3(), progress: 0 };

    this._pods = [];
    for (let i = 0; i < MAX_PODS; i++) this._pods.push({ rib: 0, s: 0.3, size: 1, lift: 0, popAt: 0, popped: false });

    this._seed = 0;
    this._burst = false;
    this._burstK = 0;

    this._caged = [];
    for (let i = 0; i < MAX_CAGED; i++) this._caged.push({ dummy: null, time: 0 });
    this._cagedCount = 0;
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  _mesh(geometry, material, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.spores = particles.get('sporecoffin.spores', {
      capacity: 3000,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.spores.uniforms.uSizeIn.value = 0.06;
    this.spores.uniforms.uFadeIn.value = 0.08;
    this.spores.uniforms.uFadeOut.value = 0.5;
    this.spores.uniforms.uEndSize.value = 0.5;
    this.spores.uniforms.uDrag.value = 1.9;
    this.spores.uniforms.uTurbFrequency.value = 0.6;
    this.spores.uniforms.uTurbSpeed.value = 0.5;

    this.puffs = particles.get('sporecoffin.puffs', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1.0
    });
    this.puffs.uniforms.uSizeIn.value = 0.2;
    this.puffs.uniforms.uFadeIn.value = 0.08;
    this.puffs.uniforms.uFadeOut.value = 0.55;
    this.puffs.uniforms.uEndSize.value = 3.2;
    this.puffs.uniforms.uDrag.value = 2.4;

    this.chunks = particles.get('sporecoffin.chunks', {
      capacity: 600,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.chunks.uniforms.uSizeIn.value = 0.02;
    this.chunks.uniforms.uFadeIn.value = 0.02;
    this.chunks.uniforms.uFadeOut.value = 0.25;
    this.chunks.uniforms.uEndSize.value = 0.7;
    this.chunks.uniforms.uDrag.value = 0.5;

    this.trailEmitter = new RateEmitter();
    this.leakEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** Seconds (real) from the impact to the burst. */
  _burstAt() {
    const c = settings[ID];
    return (Math.max(0.02, c.growTime) + Math.max(0, c.growStagger) + Math.max(0, c.holdTime)) * settings.global.lifetime;
  }

  /** The impact phase is the sprouting, the hold and the burst. */
  get impactDuration() {
    return Math.max(0.2, this._burstAt() + Math.max(0.05, settings[ID].burstTime) * settings.global.lifetime);
  }

  /** The fade is the spore haze settling and the mat rotting away. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 7.1) * Math.sin(this.age * 2.9 + 1.1));
  }

  /* ------------------------------------------------------------------ */
  /* The rib arch on the CPU                                             */
  /* ------------------------------------------------------------------ */

  /** CPU twin of `ribPoint` in SporeCoffinMaterials — keep them together. */
  _ribPoint(index, s, out) {
    const c = settings[ID];
    const st = this._ribState;
    const N = Math.min(MAX_RIBS, Math.max(3, Math.round(c.ribCount)));
    const rnd = this._ribRands[index * 2 + 1];
    const R = Math.max(0.3, c.zoneRadius * c.cageRadius);
    const H = Math.max(0.3, c.cageHeight);
    const th0 = (TAU * index) / N + (rnd - 0.5) * 0.35 * TAU / N;
    const th = th0 + c.ribTwist * saturate(s);
    const phi = s * Math.PI * 0.5;
    const r = R * Math.cos(phi) * (1 + c.ribBulge * Math.sin(Math.PI * saturate(s)));
    _v.set(Math.cos(th) * r - Math.cos(th0) * R, H * Math.sin(phi), Math.sin(th) * r - Math.sin(th0) * R);
    // Rodrigues about the root's tangent, by −fling (the top falls outward).
    _axis.set(-Math.sin(th0), 0, Math.cos(th0));
    const be = -st.fling;
    const cb = Math.cos(be);
    const sb = Math.sin(be);
    _cross.crossVectors(_axis, _v);
    const ad = _axis.dot(_v);
    _v.multiplyScalar(cb).addScaledVector(_cross, sb).addScaledVector(_axis, ad * (1 - cb));
    out.copy(st.center);
    out.x += Math.cos(th0) * (R + st.push) + _v.x;
    out.y += _v.y;
    out.z += Math.sin(th0) * (R + st.push) + _v.z;
    return out;
  }

  /** How far rib `index` has grown, 0..1(+overshoot) — the shader's `g`. */
  _ribGrowth(index) {
    const c = settings[ID];
    const g = settings.global;
    const rnd = this._ribRands[index * 2 + 1];
    const delay = c.growStagger * g.lifetime * ((index * 0.618 + rnd * 0.25) % 1);
    const k = saturate((this._ribState.growClock - delay) / Math.max(0.01, c.growTime * g.lifetime));
    return 1 - Math.pow(1 - k, 3) + c.crownOvershoot * Math.sin(Math.PI * k) * k;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    this.trailEmitter.reset();
    this.leakEmitter.reset();
    this._releaseCaged();

    this._seed = Math.random() * 100;
    this._burst = false;
    this._burstK = 0;

    const rs = this._ribState;
    rs.growClock = -1;
    rs.fling = 0;
    rs.push = 0;
    rs.vein = 0;
    rs.rot = 0;
    rs.seed = this._seed;
    this._fogState.seed = this._seed;
    this._fogState.fill = 0;
    this._fogState.fade = 1;
    const ms = this._matState;
    ms.seed = this._seed;
    ms.ring = 0;
    ms.spread = 0;
    ms.live = 1;
    ms.fadeT = 0;
    this._warpState.progress = 0;

    // The pods' dice: which rib, how high, how big, when they pop.
    const N = Math.min(MAX_RIBS, Math.max(3, Math.round(c.ribCount)));
    for (let i = 0; i < MAX_PODS; i++) {
      const p = this._pods[i];
      p.rib = Math.floor(Math.random() * N);
      p.s = 0.05 + Math.pow(Math.random(), 1.3) * 0.75;
      p.size = 0.6 + Math.random() * 0.7;
      p.lift = Math.random();
      p.popAt = Math.random() * 0.45;
      p.popped = false;
    }

    this.mat.visible = true;
    this.ribs.visible = false;
    this.pods.visible = false;
    this.fog.visible = false;
    this.warp.visible = false;
    this._sync();
  }

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.35;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.45;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    this.pointAt(1, _centre);
    _centre.y = 0;
    this._ribState.center.copy(_centre);
    this.ribMaterial.userData.sync(this._ribState);
    this._fogState.center.copy(_centre);
    this.fogMaterial.userData.sync(this._fogState);
    this._matState.center.copy(_centre);
    this.matMaterial.userData.sync(this._matState);
    this._warpState.center.copy(_centre).setY(c.cageHeight * 0.45);
    this.warpMaterial.userData.sync(this._warpState);
    this.podMaterial.userData.sync();

    this.spores.setGradient(getColor(c.colorSporeA), getColor(c.colorSporeB), getColor(c.colorSporeC), getColor(c.colorSporeD));
    const s = this.spores.uniforms;
    s.uGravity.value.set(0, -0.15, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.sporeGlow * g.glow;
    s.uTurbulence.value = 1.2 * g.turbulence;

    this.puffs.setGradient(getColor(c.colorPuffA), getColor(c.colorPuffB), getColor(c.colorPuffC), getColor(c.colorPuffD));
    const p = this.puffs.uniforms;
    p.uGravity.value.set(0, 0.15, 0);
    p.uSizeScale.value = g.particleSize;
    p.uLifeScale.value = g.particleLifetime;
    p.uSpeedScale.value = g.particleSpeed;
    p.uOpacity.value = c.puffOpacity * g.opacity;
    p.uTurbulence.value = 0.6 * g.turbulence;
    p.uSwirl.value = 0.5;
    p.uSwirlExpand.value = 0.8;

    this.chunks.setGradient(getColor(c.colorChunkA), getColor(c.colorChunkB), getColor(c.colorChunkC), getColor(c.colorChunkD));
    const k = this.chunks.uniforms;
    k.uGravity.value.set(0, -12, 0);
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uTurbulence.value = 0.1 * g.turbulence;
  }

  /** Place the puffballs on the ribs. */
  _placePods(tremble) {
    const c = settings[ID];
    const g = settings.global;
    const count = Math.min(MAX_PODS, Math.max(0, Math.round(c.podCount)));
    const time = frame.uTime.value;
    const N = Math.min(MAX_RIBS, Math.max(3, Math.round(c.ribCount)));
    for (let i = 0; i < count; i++) {
      const p = this._pods[i];
      const rib = p.rib % N;
      const grown = this._ribGrowth(rib);
      const appear = smoothstep(p.s, p.s + 0.15, grown);
      this._ribPoint(rib, p.s, _pos);
      // Sit on the rib's inner-upper side so they cling rather than float.
      _dir.set(_centre.x - _pos.x, 0, _centre.z - _pos.z).normalize();
      const rad = (c.ribRadius + 0.05) * (1 - p.s * 0.6);
      _pos.addScaledVector(_dir, rad * (0.4 + p.lift)).y += rad * 0.6;
      let scale = c.podSize * p.size * appear;
      scale *= 1 + c.podSwell * Math.sin(time * c.podRate * g.animationSpeed * TAU + i * 1.7) * 0.5 + tremble * 0.35;
      if (this._burst) {
        const k = this._burstK;
        const pop = saturate((k - p.popAt) / 0.12);
        scale *= pop < 1 ? 1 + 0.5 * pop : 0;
        if (pop >= 1 && !p.popped) {
          p.popped = true;
          this._popPod(_pos);
        }
      }
      _m.makeScale(scale, scale * 0.9, scale);
      _m.setPosition(_pos);
      this.pods.setMatrixAt(i, _m);
    }
    this.pods.count = count;
    this.pods.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the mycelium ring draws itself                             */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._matState.ring = Easing.inOutQuad(this.u);
    this._matState.spread = 0;
    this._sync();

    // Spores running along the floor to the circle — the runner of the mycelium.
    const n = Math.round(this.trailEmitter.tick(dt, 160) * g.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _pos.copy(this.position).setY(0.08);
      _emit.position = _pos;
      _emit.radius = 0.35;
      _emit.direction = _up;
      _emit.speed = 0.6;
      _emit.spread = 0.8;
      _emit.size = c.sporeSize;
      _emit.life = c.sporeLife * 0.6;
      this.spores.emit(n, _emit);
    }
    this.position.y = 0.3;
  }

  /* ------------------------------------------------------------------ */
  /* Impact — sprout, hold, burst                                        */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    this.pointAt(1, _centre);
    this.ribs.visible = true;
    this.pods.visible = true;
    this.fog.visible = true;
    this._matState.ring = 1;
    this._ribState.growClock = 0;

    // The ribs break the floor.
    this.ctx.decals.spawn(DecalType.CRACK, _centre, {
      radius: c.zoneRadius * c.cageRadius * 1.1,
      life: this.impactDuration + this.fadeDuration * 0.5,
      intensity: 0.7,
      colorA: getColor(c.colorFleshB),
      colorB: getColor(c.colorSpot),
      width: 0.08,
      height: 0.02
    });
    this._resetEmit(frame.uTime.value);
    const N = Math.min(MAX_RIBS, Math.max(3, Math.round(c.ribCount)));
    _emit.radius = 0.2;
    _emit.direction = _up;
    _emit.speed = c.chunkSpeed * 0.45;
    _emit.spread = 0.6;
    _emit.size = c.chunkSize * 0.8;
    _emit.life = c.chunkLife * 0.8;
    _emit.spin = 6;
    for (let i = 0; i < N; i++) {
      this._ribPoint(i, 0, _pos);
      _pos.y = 0.05;
      _emit.position = _pos;
      this.chunks.emit(Math.max(1, Math.round(4 * g.particleCount)), _emit);
    }
    this.ctx.shake.add(c.sproutShake * g.explosionIntensity, 3, 16);
    this.lightBoost = c.lightIntensity * 0.6;
    this._cage();
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    this.pointAt(1, _centre);

    if (this.phase === AbilityPhase.IMPACT) {
      const tau = t * this.impactDuration;
      const grow = (Math.max(0.02, c.growTime) + Math.max(0, c.growStagger)) * g.lifetime;
      const burstAt = this._burstAt();
      const rs = this._ribState;
      rs.growClock = tau;

      // The bars tremble in the last moments before the burst.
      const pre = smoothstep(burstAt - 0.4 * g.lifetime, burstAt, tau) * (this._burst ? 0 : 1);
      rs.vein = smoothstep(grow * 0.6, grow + 0.3, tau) * (1 + pre);
      this._fogState.fill = smoothstep(grow * 0.5, grow * 0.5 + Math.max(0.05, c.fogFill * g.lifetime), tau);
      this._matState.spread = smoothstep(0, Math.max(0.05, c.matSpread * g.lifetime), tau);

      if (!this._burst && tau >= burstAt) this._doBurst();
      if (this._burst) {
        const k = saturate((tau - burstAt) / Math.max(0.05, c.burstTime * g.lifetime));
        this._burstK = k;
        rs.fling = c.burstFling * Easing.outCubic(k);
        rs.push = c.burstPush * Easing.outCubic(k);
        rs.rot = smoothstep(0.1, 1, k);
        this._fogState.fade = 1 - smoothstep(0, 0.35, k);
        this._warpState.progress = saturate(k * 1.6);
        this.warp.visible = k * 1.6 < 1;
      } else {
        rs.push = 0.05 * pre * Math.sin(tau * 70);
      }

      this._sync();
      this._placePods(pre);
      this._leak(dt);
      this._infest(dt);
      this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * pre * 0.8);
      this.position.copy(_centre).setY(c.cageHeight * 0.45);
      return;
    }

    /* the fade: the haze settles and the mat rots */
    const ft = saturate(t - 1);
    this.ribs.visible = false;
    this.pods.visible = false;
    this.fog.visible = false;
    this.warp.visible = false;
    this._matState.live = 1 - ft;
    this._matState.fadeT = smoothstep(0.35, 1, ft);
    this._sync();
    this._infest(dt);
    this.position.copy(_centre).setY(1);
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Spores leaking out between the bars while it holds. */
  _leak(dt) {
    const c = settings[ID];
    const g = settings.global;
    if (this._burst) return;
    const fill = this._fogState.fill;
    const n = Math.round(this.leakEmitter.tick(dt, c.sporeRate * fill) * g.particleCount);
    if (n <= 0) return;
    const R = c.zoneRadius * c.cageRadius;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.sporeSize;
    _emit.life = c.sporeLife;
    _emit.speed = 0.5;
    _emit.spread = 1;
    _emit.direction = _up;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * R * 0.9;
      _pos.set(_centre.x + Math.cos(a) * r, Math.random() * c.cageHeight * fill * 0.8, _centre.z + Math.sin(a) * r);
      _emit.position = _pos;
      this.spores.emit(1, _emit);
    }
  }

  _popPod(at) {
    const c = settings[ID];
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _emit.position = at;
    _emit.radius = c.podSize * 0.5;
    _emit.direction = _up;
    _emit.speed = c.sporeSpeed * 0.35;
    _emit.spread = 1;
    _emit.size = c.sporeSize * 1.2;
    _emit.life = c.sporeLife * 0.7;
    this.spores.emit(Math.round(14 * g.particleCount), _emit);
    _emit.speed = 1.2;
    _emit.size = c.puffSize * 0.45;
    _emit.life = c.puffLife * 0.5;
    _emit.spin = 0.5;
    this.puffs.emit(1, _emit);
  }

  /** The coffin bursts. */
  _doBurst() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._burst = true;
    this._burstK = 0;
    this.warp.visible = true;
    const R = Math.max(0.3, c.zoneRadius * c.cageRadius);
    const H = c.cageHeight;

    this._resetEmit(time);
    const spores = Math.round((c.burstSpores * g.particleCount) / BURST_FAN);
    const puffs = Math.max(1, Math.round((c.sporePuffs * g.particleCount) / BURST_FAN));
    for (let f = 0; f < BURST_FAN; f++) {
      const a = (TAU * (f + Math.random() * 0.5)) / BURST_FAN;
      _dir.set(Math.cos(a), 0.35 + Math.random() * 0.4, Math.sin(a)).normalize();
      _pos.set(_centre.x + Math.cos(a) * R * 0.45, H * (0.25 + Math.random() * 0.4), _centre.z + Math.sin(a) * R * 0.45);
      _emit.position = _pos;
      _emit.anchor = null;
      _emit.radius = R * 0.35;
      _emit.direction = _dir;
      _emit.speed = c.sporeSpeed;
      _emit.speedVariance = 0.55;
      _emit.spread = 0.35;
      _emit.size = c.sporeSize * 1.3;
      _emit.life = c.sporeLife;
      _emit.spin = 0;
      this.spores.emit(spores, _emit);

      _emit.speed = c.puffSpeed;
      _emit.size = c.puffSize;
      _emit.life = c.puffLife;
      _emit.spin = 0.6;
      _emit.anchor = _centre;
      this.puffs.emit(puffs, _emit);
    }

    // Chunks of flesh off every rib.
    const N = Math.min(MAX_RIBS, Math.max(3, Math.round(c.ribCount)));
    const per = Math.max(1, Math.round((c.chunkCount * g.particleCount) / N));
    _emit.anchor = null;
    _emit.radius = 0.2;
    _emit.speed = c.chunkSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.5;
    _emit.size = c.chunkSize;
    _emit.life = c.chunkLife;
    _emit.spin = 9;
    for (let i = 0; i < N; i++) {
      this._ribPoint(i, 0.55, _pos);
      _dir.set(_pos.x - _centre.x, R * 0.4, _pos.z - _centre.z).normalize();
      _emit.position = _pos;
      _emit.direction = _dir;
      this.chunks.emit(per, _emit);
    }

    _pos.copy(_centre).setY(H * 0.4);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: R * 0.3,
      endRadius: R * 1.15 * power,
      life: 0.55,
      intensity: 0.9,
      opacity: 0.35,
      fresnel: 2 * g.fresnel,
      displace: 0.6,
      turbulence: 1.4,
      squash: 0.75,
      colorA: getColor(c.colorSporeA),
      colorB: getColor(c.colorSporeB),
      colorC: getColor(c.colorSporeC)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.zoneRadius * c.burstDust * power,
      life: 1.4,
      intensity: 0.9,
      colorA: getColor(c.colorDust),
      colorB: getColor(c.colorPuffA)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.zoneRadius * c.burstShock * power,
      life: 0.6,
      width: 0.07,
      intensity: 1.1,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorSporeA)
    });

    this._blowOut();
    this.ctx.shake.add(c.burstShake * power, 1 / Math.max(0.05, c.shakeDuration), 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.burstFlash * power);
    this.lightBoost = c.lightIntensity * c.burstLight * power;
  }

  /* ------------------------------------------------------------------ */
  /* The caged                                                           */
  /* ------------------------------------------------------------------ */

  /** Take in every body standing in the circle as the ribs come up. */
  _cage() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const R = Math.max(0.3, c.zoneRadius * c.cageRadius);
    const found = field.findTargets(_centre.x, _centre.z, R, this._found);
    for (const dummy of found) {
      if (this._cagedCount >= MAX_CAGED) break;
      const slot = this._caged[this._cagedCount++];
      slot.dummy = dummy;
      slot.time = 0;
    }
  }

  _infest(dt) {
    const c = settings[ID];
    const look = this._look;
    look.color = c.colorInfestBody;
    look.rimColor = c.colorInfestRim;
    look.rimEmissive = c.infestRimGlow;
    look.edgeColor = c.colorInfestEdge;
    look.edgeEmissive = c.infestEdgeGlow;
    look.edgeWidth = c.infestEdgeWidth;
    for (let i = 0; i < this._cagedCount; i++) {
      const slot = this._caged[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt;
      dummy.corrode(saturate(slot.time / Math.max(0.05, c.infestTime * settings.global.lifetime)) * c.infest, look);
      if (Math.random() < dt * 5) {
        const at = dummy.bodyPoint(_body) ?? _body.copy(dummy.position).setY(0.9);
        this._resetEmit(frame.uTime.value);
        _emit.position = at;
        _emit.radius = 0.35;
        _emit.direction = _up;
        _emit.speed = 0.4;
        _emit.spread = 1;
        _emit.size = c.sporeSize;
        _emit.life = c.sporeLife * 0.6;
        this.spores.emit(3, _emit);
      }
    }
  }

  /** Blow every body in the circle outward at the burst. */
  _blowOut() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = Math.max(0.3, c.zoneRadius * c.cageRadius) * 1.1;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    const found = field.findTargets(_centre.x, _centre.z, R, this._found);
    for (const dummy of found) {
      _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
      const d = _dir.length();
      if (d < 0.05) _dir.set(Math.cos(this._seed), 0, Math.sin(this._seed));
      else _dir.multiplyScalar(1 / d);
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      let known = false;
      for (let i = 0; i < this._cagedCount; i++) if (this._caged[i].dummy === dummy) known = true;
      if (!known && this._cagedCount < MAX_CAGED) {
        const slot = this._caged[this._cagedCount++];
        slot.dummy = dummy;
        slot.time = 0;
      }
    }
  }

  _releaseCaged() {
    for (let i = 0; i < this._cagedCount; i++) this._caged[i].dummy = null;
    this._cagedCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.ribs.visible = false;
    this.pods.visible = false;
    this.pods.count = 0;
    this.fog.visible = false;
    this.mat.visible = false;
    this.warp.visible = false;
    this._burst = false;
    this._releaseCaged();
  }

  dispose() {
    this.ribGeometry.dispose();
    this.podGeometry.dispose();
    this.fogGeometry.dispose();
    this.quadGeometry.dispose();
    this.ribMaterial.dispose();
    this.podMaterial.dispose();
    this.fogMaterial.dispose();
    this.matMaterial.dispose();
    this.warpMaterial.dispose();
    this.pods.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⚱  Spore Coffin');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'speed', 2, 80, 0.5, 'mycelium runs at (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'haze settles over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');

  const shape = folder.addFolder('1 · Rib shape');
  R(shape, c, 'ribCount', 3, MAX_RIBS, 1, 'ribs');
  R(shape, c, 'cageHeight', 0.5, 10, 0.05, 'crown height (m)');
  R(shape, c, 'cageRadius', 0.3, 1.6, 0.01, 'root ring (× circle)');
  R(shape, c, 'ribBulge', 0, 1, 0.01, 'shoulder bulge');
  R(shape, c, 'ribTwist', -2, 2, 0.01, 'wind (rad)');
  R(shape, c, 'ribRadius', 0.01, 0.5, 0.005, 'root thickness (m)');
  R(shape, c, 'ribTipRadius', 0.005, 0.3, 0.005, 'crown thickness (m)');
  R(shape, c, 'knots', 0, 16, 0.5, 'knuckles');
  R(shape, c, 'knotSize', 0, 1.5, 0.01, 'knuckle size');
  R(shape, c, 'growTime', 0.05, 3, 0.01, 'sprouts over (s)');
  R(shape, c, 'growStagger', 0, 2, 0.01, 'stagger (s)');
  R(shape, c, 'crownOvershoot', 0, 0.5, 0.005, 'crown overshoot');

  const flesh = folder.addFolder('2 · Rib flesh');
  R(flesh, c, 'gillScale', 1, 40, 0.1, 'gills per m');
  R(flesh, c, 'spotScale', 0.3, 10, 0.05, 'spots per m');
  R(flesh, c, 'spotGlow', 0, 12, 0.05, 'spot glow');
  R(flesh, c, 'veinGlow', 0, 8, 0.05, 'vein glow');
  R(flesh, c, 'fleshShade', 0, 1, 0.01, 'sun shading');
  flesh.addColor(c, 'colorFleshA').name('pale flesh');
  flesh.addColor(c, 'colorFleshB').name('gill');
  flesh.addColor(c, 'colorSpot').name('glow spots');
  flesh.addColor(c, 'colorDissolve').name('rot edge');

  const pods = folder.addFolder('3 · Spore pods');
  R(pods, c, 'podCount', 0, MAX_PODS, 1, 'pods');
  R(pods, c, 'podSize', 0.02, 1, 0.005, 'size (m)');
  R(pods, c, 'podSwell', 0, 1.5, 0.01, 'throb');
  R(pods, c, 'podRate', 0, 8, 0.05, 'throbs/second');
  R(pods, c, 'podGlow', 0, 10, 0.05, 'glow');
  pods.addColor(c, 'colorPodSkin').name('skin');
  pods.addColor(c, 'colorPodGlow').name('spores inside');

  const fog = folder.addFolder('4 · Spore fog');
  R(fog, c, 'holdTime', 0, 6, 0.05, 'holds for (s)');
  R(fog, c, 'fogFill', 0.05, 4, 0.01, 'fills over (s)');
  R(fog, c, 'fogOpacity', 0, 1, 0.01, 'opacity');
  R(fog, c, 'fogGlow', 0, 6, 0.05, 'glow');
  R(fog, c, 'fogScale', 0.1, 4, 0.01, 'swirl scale');
  R(fog, c, 'fogSwirl', 0, 4, 0.01, 'churn');
  fog.addColor(c, 'colorFogA').name('bright');
  fog.addColor(c, 'colorFogB').name('dark lanes');

  const mat = folder.addFolder('5 · Mycelium mat');
  R(mat, c, 'matRadius', 0.5, 2.5, 0.01, 'reach (× circle)');
  R(mat, c, 'hyphaeScale', 0.5, 20, 0.05, 'threads');
  R(mat, c, 'hyphaeGlow', 0, 8, 0.05, 'glow');
  R(mat, c, 'matSpread', 0.05, 4, 0.01, 'grows in over (s)');
  R(mat, c, 'matErode', 0, 1, 0.01, 'ragged fade');
  mat.addColor(c, 'colorHyphae').name('threads');
  mat.addColor(c, 'colorMat').name('rot');
  mat.addColor(c, 'colorNodes').name('nodes');

  const burst = folder.addFolder('6 · Burst');
  R(burst, c, 'burstTime', 0.05, 3, 0.01, 'tears open over (s)');
  R(burst, c, 'burstFling', 0, 2.5, 0.01, 'ribs swing (rad)');
  R(burst, c, 'burstPush', 0, 5, 0.01, 'ribs thrown (m)');
  R(burst, c, 'burstSpores', 0, 1500, 1, 'spores');
  R(burst, c, 'sporeSpeed', 0, 30, 0.1, 'spore speed');
  R(burst, c, 'sporePuffs', 0, 150, 1, 'puffs');
  R(burst, c, 'puffSpeed', 0, 20, 0.1, 'puff speed');
  R(burst, c, 'chunkCount', 0, 300, 1, 'chunks');
  R(burst, c, 'chunkSpeed', 0, 30, 0.1, 'chunk speed');
  R(burst, c, 'burstDust', 0, 4, 0.01, 'dust ring (× circle)');
  R(burst, c, 'burstShock', 0, 5, 0.01, 'shockwave (× circle)');
  R(burst, c, 'warpStrength', 0, 4, 0.01, 'air bend');
  R(burst, c, 'burstFlash', 0, 1, 0.01, 'flash');
  R(burst, c, 'burstShake', 0, 1.5, 0.01, 'camera knock');
  R(burst, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(burst, c, 'burstLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(burst, c, 'sproutShake', 0, 1, 0.01, 'sprout knock');
  burst.addColor(c, 'colorFlash').name('flash');
  burst.addColor(c, 'colorShock').name('shockwave');
  burst.addColor(c, 'colorDust').name('dust');

  const fx = folder.addFolder('7 · Spores, puffs & chunks');
  R(fx, c, 'sporeRate', 0, 600, 1, 'spores/second leaking');
  R(fx, c, 'sporeSize', 0.005, 0.3, 0.001, 'spore size');
  R(fx, c, 'sporeLife', 0.1, 6, 0.05, 'spore lifetime');
  R(fx, c, 'sporeGlow', 0, 10, 0.05, 'spore glow');
  R(fx, c, 'puffSize', 0.05, 4, 0.01, 'puff size');
  R(fx, c, 'puffLife', 0.1, 8, 0.05, 'puff lifetime');
  R(fx, c, 'puffOpacity', 0, 1, 0.01, 'puff opacity');
  R(fx, c, 'chunkSize', 0.01, 0.6, 0.005, 'chunk size');
  R(fx, c, 'chunkLife', 0.1, 4, 0.05, 'chunk lifetime');
  Editor.gradient(fx, c, 'colorSpore', 'spore gradient');
  Editor.gradient(fx, c, 'colorPuff', 'puff gradient');
  Editor.gradient(fx, c, 'colorChunk', 'chunk gradient');

  const caged = folder.addFolder('8 · The caged');
  R(caged, c, 'infest', 0, 1, 0.01, 'overgrown');
  R(caged, c, 'infestTime', 0.05, 6, 0.05, 'overgrows over (s)');
  R(caged, c, 'hitImpulse', 0, 25, 0.1, 'blown out (m/s)');
  R(caged, c, 'hitLift', 0, 20, 0.1, 'lift (m/s)');
  R(caged, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(caged, c, 'infestRimGlow', 0, 10, 0.05, 'rim glow');
  R(caged, c, 'infestEdgeGlow', 0, 12, 0.05, 'edge glow');
  R(caged, c, 'infestEdgeWidth', 0, 0.3, 0.001, 'edge width');
  caged.addColor(c, 'colorInfestBody').name('overgrown body');
  caged.addColor(c, 'colorInfestRim').name('rim');
  caged.addColor(c, 'colorInfestEdge').name('edge');

  folder.close();
  return folder;
}
