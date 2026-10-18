import { InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Vector3, DynamicDrawUsage } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createThornGeometry, createThornQuadGeometry } from '../../assets/codex/ThornVolleyGeometry.js';
import {
  createThornMaterial,
  createThornWebMaterial,
  createThornWarpMaterial,
  MAX_LANDINGS
} from '../../materials/codex/ThornVolleyMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'thornvolley';

const TAU = Math.PI * 2;
/** Thorns in one volley; capped by the landings the floor web can draw. */
const MAX_THORNS = MAX_LANDINGS;
/** Bodies one volley can hold pinned at once. */
const MAX_PINS = 8;

const _emit = {};
const _pos = new Vector3();
const _tip = new Vector3();
const _base = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _slot = new Vector3();
const _land = new Vector3();
const _perp = new Vector3();
const _bx = new Vector3();
const _bz = new Vector3();
const _centre = new Vector3();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _up = new Vector3(0, 1, 0);
const _webState = { centre: new Vector3(), extent: 6, heat: 1, erode: 0 };

function syncSystem(p, a, b, cc, d, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
  p.uniforms.uSizeScale.value = g.particleSize;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

function resetEmit(time) {
  _emit.radius = 0;
  _emit.direction = null;
  _emit.speed = 0;
  _emit.speedVariance = 0.35;
  _emit.spread = 0;
  _emit.inherit = null;
  _emit.anchor = null;
  _emit.size = 0.1;
  _emit.sizeVariance = 0.4;
  _emit.life = 1;
  _emit.lifeVariance = 0.35;
  _emit.spin = 0;
  _emit.tint = null;
  _emit.time = time;
}

/**
 * THORN VOLLEY — Nature, line cast.
 *
 * Five beats. **Draw**: a fan of great hooked thorns grows out of the air
 * over the caster's shoulders one after another, sap-veined and leaf-
 * fletched, each turning to aim at its own mark while green motes gather into
 * it. **Volley**: they loose in a ripple, a few hundredths of a second apart,
 * each on its own high arc down the line, spinning out sap sparks and leaf
 * scraps behind them. **Pin**: they come down steep round the target and
 * drive point-first into the floor — soil and splinters thrown up, a crack, a
 * ring of bent air — and any body they come down by is knocked off its feet
 * and *pinned*: held by the chest to the shaft that struck beside it, hanging
 * there. The thorns **quiver** where they stand while roots of green light
 * crawl out across the floor from each one. **Splinter**: when the volley is
 * spent each thorn breaks up from the point back, its break edge glowing, in
 * a spray of wood chips and leaves; the pinned drop; the roots cool and erode.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the thorns** (`createThornGeometry` + `createThornMaterial`) — rigid
 *      instanced horns with barbs and leaf vanes, placed, aimed and quivered
 *      by the instance matrix; opaque on `LAYER.WORLD`, so they cast shadows.
 *      Per instance `aState`: seed, sap glow, splinter, strike flash.
 *   2. **the root web** (`createThornWebMaterial`) — the floor round the
 *      landings, every landing a uniform.
 *   3. **the lens rings** (`createThornWarpMaterial`) — one per strike, on
 *      `LAYER.DISTORTION`.
 *   4. **particles** — sap sparks (STREAK, additive) and leaf scraps (LEAF)
 *      trailing each thorn; green motes (SOFT, additive) gathering at the
 *      draw; soil (CHIP) and dust (SMOKE) at each strike; splinters (CHIP)
 *      when it breaks.
 *   5. **the strikes** — a CRACK and a small DUSTRING per landing, a shake,
 *      a light punch that follows the landings, and a thin AIR burst at the
 *      last one.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. A body within `pinRadius` of a landing is killed — thrown
 * a little along the thorn's flight — and, while there is a free hold, pinned
 * (`Dummy#pin`, `pinJoint`) to a point `pinAlong` of the way up the shaft. The
 * hold follows the shaft as it quivers and is let go the moment that thorn
 * splinters.
 *
 * ## The editor rule
 *
 * A thorn record holds dice (its lane, its depth, its launch jitter, a spin,
 * a seed) and the latches of its strike (where and along which line it went
 * in). Before it strikes, its fan slot, its mark and its arc are resolved from
 * `settings.thornvolley` every frame — drag `clusterWidth` and a volley in the
 * air re-aims. After, it stays where it went in.
 */
export class ThornVolleyAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Thorns drawn. HUD readout only. */
  get instanceCount() {
    return this.thorns.count;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- 1 · the thorns ---- */
    this.thornGeometry = createThornGeometry();
    this.stateAttr = new InstancedBufferAttribute(new Float32Array(MAX_THORNS * 4), 4);
    this.stateAttr.setUsage(DynamicDrawUsage);
    this.thornGeometry.setAttribute('aState', this.stateAttr);
    this.thornMaterial = createThornMaterial();
    this.thorns = new InstancedMesh(this.thornGeometry, this.thornMaterial, MAX_THORNS);
    this.thorns.name = 'ThornVolley';
    this.thorns.instanceMatrix.setUsage(DynamicDrawUsage);
    this.thorns.castShadow = true;
    this.thorns.count = 0;
    this._setup(this.thorns, LAYER.WORLD, 6);

    /* ---- 2 · the root web ---- */
    this.webGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.webMaterial = createThornWebMaterial();
    this.web = new Mesh(this.webGeometry, this.webMaterial);
    this._setup(this.web, LAYER.VFX, 2);

    /* ---- 3 · the lens rings ---- */
    this.quadGeometry = createThornQuadGeometry();
    this.warpAttr = new InstancedBufferAttribute(new Float32Array(MAX_THORNS * 2), 2);
    this.warpAttr.setUsage(DynamicDrawUsage);
    this.quadGeometry.setAttribute('aWarp', this.warpAttr);
    this.warpMaterial = createThornWarpMaterial();
    this.warps = new InstancedMesh(this.quadGeometry, this.warpMaterial, MAX_THORNS);
    this.warps.instanceMatrix.setUsage(DynamicDrawUsage);
    this.warps.count = 0;
    this._setup(this.warps, LAYER.DISTORTION, 0);

    /** Dice and the latches of the strike — see the class comment. */
    this.recs = [];
    for (let i = 0; i < MAX_THORNS; i++) {
      this.recs.push({
        lane: 0,
        depth: 0,
        jitter: 0,
        seed: 0,
        roll: 0,
        landed: false,
        landT: 0,
        tip: new Vector3(),
        dir: new Vector3(0, -1, 0),
        splintered: false,
        // Resolved this frame — what the trail and the light read.
        live: false,
        flying: false,
        x: 0,
        y: 0,
        z: 0
      });
    }
    this.pins = [];
    for (let i = 0; i < MAX_PINS; i++) this.pins.push({ dummy: null, thorn: -1 });
    this._n = 0;
    this._seed = 0;
    this._t = 0;
    this._impactAge = 0;
    this._landedCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  _setup(mesh, layer, order) {
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.sparks = particles.get('thornvolley.spark', { capacity: 2000, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.15 });
    this.sparks.uniforms.uDrag.value = 2;
    this.sparks.uniforms.uEndSize.value = 0.25;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.55;

    this.scraps = particles.get('thornvolley.leaf', { capacity: 1200, shape: ParticleShape.LEAF, additive: false, lit: true, curl: true, softFade: 0.3 });
    this.scraps.uniforms.uDrag.value = 1.8;
    this.scraps.uniforms.uEndSize.value = 0.8;
    this.scraps.uniforms.uSizeIn.value = 0.05;
    this.scraps.uniforms.uFadeIn.value = 0.04;
    this.scraps.uniforms.uFadeOut.value = 0.35;

    this.motes = particles.get('thornvolley.mote', { capacity: 1200, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.25 });
    this.motes.uniforms.uDrag.value = 2.4;
    this.motes.uniforms.uEndSize.value = 0.2;
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.5;

    this.chips = particles.get('thornvolley.chip', { capacity: 1600, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.1 });
    this.chips.uniforms.uDrag.value = 0.5;
    this.chips.uniforms.uEndSize.value = 0.8;
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.01;
    this.chips.uniforms.uFadeOut.value = 0.3;

    this.dust = particles.get('thornvolley.dust', { capacity: 600, shape: ParticleShape.SMOKE, additive: false, curl: true, softFade: 0.6 });
    this.dust.uniforms.uDrag.value = 1.8;
    this.dust.uniforms.uEndSize.value = 2;
    this.dust.uniforms.uSizeIn.value = 0.15;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.6;

    this.trailEmitter = new RateEmitter();
    this.drawEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  _launchOf(i) {
    const c = settings[ID];
    const g = settings.global;
    return Math.max(0.02, c.drawTime) + i * Math.max(0, c.stagger) + this.recs[i].jitter * c.staggerJitter * g.randomness;
  }

  _speed() {
    return Math.max(1, settings[ID].speed * settings.global.speed);
  }

  /** The age at which the last thorn strikes, from the current settings. */
  _lastStrike() {
    let last = 0;
    for (let i = 0; i < this._n; i++) {
      const r = this.recs[i];
      if (r.landed) {
        last = Math.max(last, r.landT);
        continue;
      }
      this._slotOf(i, _slot);
      this._markOf(i, _land);
      last = Math.max(last, this._launchOf(i) + _slot.distanceTo(_land) / this._speed());
    }
    return last;
  }

  get impactDuration() {
    const c = settings[ID];
    const end = this._lastStrike() + Math.max(0.05, c.lifetime * settings.global.lifetime);
    return Math.max(0.05, end - this._impactAge);
  }

  get fadeDuration() {
    const c = settings[ID];
    return (Math.max(0.05, c.splinterTime) + Math.max(0, c.splinterStagger)) * settings.global.lifetime;
  }

  /* ------------------------------------------------------------------ */
  /* Where a thorn waits, and where it is going                          */
  /* ------------------------------------------------------------------ */

  /** Its place in the fan over the caster's shoulders. */
  _slotOf(i, out) {
    const c = settings[ID];
    const n = this._n;
    const x = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
    out.copy(this.origin)
      .addScaledVector(this.direction, c.fanForward)
      .addScaledVector(this.side, x * c.fanWidth);
    out.y = c.fanHeight + c.fanArc * (1 - x * x);
    return out;
  }

  /** Its mark: a cluster round the end of the line, point a little under the floor. */
  _markOf(i, out) {
    const c = settings[ID];
    const g = settings.global;
    const r = this.recs[i];
    const n = this._n;
    const x = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
    const lat = (x + (r.lane - 0.5) * 0.6 * g.randomness) * c.clusterWidth;
    const along = this.length - c.clusterDepth * (0.5 - r.depth) * 2 * g.randomness * 0.5 - c.clusterDepth * 0.5 * (1 - Math.abs(x));
    out.copy(this.origin).addScaledVector(this.direction, Math.max(1, along)).addScaledVector(this.side, lat);
    out.y = -Math.max(0, c.embedDepth);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    this._seed = Math.random() * 100;
    this._t = 0;
    this._impactAge = 1e6;
    this._landedCount = 0;
    this._n = Math.max(1, Math.min(MAX_THORNS, Math.round(c.count)));
    this.trailEmitter.reset();
    this.drawEmitter.reset();
    this._releasePins();
    const u = this.webMaterial.uniforms.uLand.value;
    for (let i = 0; i < MAX_THORNS; i++) {
      const r = this.recs[i];
      r.lane = Math.random();
      r.depth = Math.random();
      r.jitter = Math.random();
      r.seed = Math.random();
      r.roll = Math.random() * TAU;
      r.landed = false;
      r.landT = 0;
      r.splintered = false;
      r.live = false;
      r.flying = false;
      u[i].set(0, 0, -1, 0);
      this.thorns.setMatrixAt(i, _zero);
      this.warps.setMatrixAt(i, _zero);
    }
    this.thorns.instanceMatrix.needsUpdate = true;
    this.warps.instanceMatrix.needsUpdate = true;
    this.thorns.count = 0;
    this.warps.count = 0;
    this.thorns.visible = true;
    this.web.visible = false;
    this.warps.visible = false;
  }

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    this.thornMaterial.userData.sync();
    this.warpMaterial.userData.sync();
    syncSystem(this.sparks, c.colorSparkA, c.colorSparkB, c.colorSparkC, c.colorSparkD, c.sparkGlow * g.glow, 0.2);
    this.sparks.uniforms.uGravity.value.set(0, -c.sparkGravity, 0);
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
    syncSystem(this.scraps, c.colorScrapA, c.colorScrapB, c.colorScrapC, c.colorScrapD, 1, 0.8);
    this.scraps.uniforms.uGravity.value.set(0, -1.6, 0);
    syncSystem(this.motes, c.colorSparkA, c.colorSparkB, c.colorSparkC, c.colorSparkD, c.moteGlow * g.glow, 0.5);
    this.motes.uniforms.uGravity.value.set(0, 0.2, 0);
    syncSystem(this.chips, c.colorChipA, c.colorChipB, c.colorChipC, c.colorChipD, 1, 0.05);
    this.chips.uniforms.uGravity.value.set(0, -9.5, 0);
    syncSystem(this.dust, c.colorDustA, c.colorDustB, c.colorDustC, c.colorDustD, 1, 0.5);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uGravity.value.set(0, 0.2, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  /** Draw, fly, strike, quiver and splinter every thorn; pin and the floor follow. */
  _updateVolley(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._n = Math.max(1, Math.min(MAX_THORNS, Math.round(c.count)));
    const n = this._n;
    const t = this._t;
    const fading = this.phase === AbilityPhase.FADE;
    const ft = fading ? this.fadeTime : 0;
    const len = Math.max(0.1, c.thornLength);
    const wid = Math.max(0.05, c.thornWidth);
    const speed = this._speed();
    const state = this.stateAttr.array;
    const warp = this.warpAttr.array;
    const web = this.webMaterial.uniforms.uLand.value;
    let lead = -1;
    let leadU = -1;

    for (let i = 0; i < n; i++) {
      const r = this.recs[i];
      const launch = this._launchOf(i);
      const drawStart = i * Math.max(0, c.drawStagger);
      const drawIn = saturate((t - drawStart) / Math.max(0.02, c.materialize));
      let glow = c.restGlow;
      let flash = 0;
      let splinter = 0;
      let scale = 1;

      if (!r.landed) {
        this._slotOf(i, _slot);
        this._markOf(i, _land);
        const dist = _slot.distanceTo(_land);
        const flight = Math.max(0.05, dist / speed);
        const arc = c.arcHeight * Math.min(1.6, Math.max(0.35, dist / 12));
        const tau = (t - launch) / flight;
        if (tau < 0) {
          /* drawn: hovering in the fan, aimed down its first stretch of arc */
          _vel.subVectors(_land, _slot).addScaledVector(_up, arc * 4);
          _dir.copy(_vel).normalize();
          _tip.copy(_slot);
          _tip.y += Math.sin(t * c.hoverRate + r.seed * TAU) * c.hover * drawIn;
          // Drawn back a little the moment before it goes.
          const pull = smoothstep(launch - 0.12, launch, t) * c.drawBack;
          _tip.addScaledVector(_dir, -pull);
          scale = Easing.outBack(drawIn);
          glow = lerp(c.restGlow, c.flyGlow, drawIn);
          r.flying = false;
        } else if (tau < 1) {
          /* in flight */
          const k = tau;
          _tip.lerpVectors(_slot, _land, k);
          _tip.y += arc * 4 * k * (1 - k);
          _vel.subVectors(_land, _slot).addScaledVector(_up, arc * 4 * (1 - 2 * k));
          _dir.copy(_vel).normalize();
          glow = c.flyGlow;
          r.flying = true;
          if (k > leadU) {
            leadU = k;
            lead = i;
          }
        } else {
          /* it strikes */
          _vel.subVectors(_land, _slot).addScaledVector(_up, arc * 4 * -1);
          r.dir.copy(_vel).normalize();
          r.tip.copy(_land);
          r.landed = true;
          r.landT = launch + flight;
          r.flying = false;
          this._strike(i);
        }
      }

      if (r.landed) {
        const age = Math.max(0, t - r.landT);
        const q = c.quiver * Math.exp(-age * c.quiverDamp) * Math.sin(age * c.quiverRate * TAU);
        _perp.crossVectors(r.dir, _up);
        if (_perp.lengthSq() < 1e-5) _perp.set(1, 0, 0);
        _perp.normalize();
        _dir.copy(r.dir).addScaledVector(_perp, q).normalize();
        _tip.copy(r.tip);
        flash = Math.exp(-age * 8);
        glow = lerp(c.flyGlow, c.restGlow, smoothstep(0, 0.5, age));
        if (fading) {
          const stag = Math.max(0, c.splinterStagger) * g.lifetime * r.seed;
          splinter = saturate((ft - stag) / Math.max(0.05, c.splinterTime * g.lifetime));
          if (splinter > 0 && !r.splintered) {
            r.splintered = true;
            this._splinterFx(i);
          }
          glow *= 1 - splinter;
        }
        // The web: this landing's age.
        web[i].set(r.tip.x, r.tip.z, age, r.seed * 10);
        // The lens ring.
        const wp = saturate(age / Math.max(0.05, c.warpTime));
        if (wp < 1) {
          _m.makeScale(c.warpRadius, 1, c.warpRadius);
          _m.setPosition(r.tip.x, 0.2, r.tip.z);
          this.warps.setMatrixAt(i, _m);
          warp[i * 2] = Easing.outCubic(wp);
          warp[i * 2 + 1] = (1 - wp) * c.strikeWarp * g.distortion;
        } else {
          this.warps.setMatrixAt(i, _zero);
          warp[i * 2 + 1] = 0;
        }
      } else {
        web[i].set(0, 0, -1, 0);
        this.warps.setMatrixAt(i, _zero);
        warp[i * 2 + 1] = 0;
      }

      /* the instance: base behind the point, +Y down the line of flight */
      const s = scale * (1 - splinter * 0.25);
      if (s <= 0.002 || splinter >= 1) {
        this.thorns.setMatrixAt(i, _zero);
        r.live = false;
      } else {
        _base.copy(_tip).addScaledVector(_dir, -len * s);
        // A roll about the flight line, so no two thorns show the same hook.
        _bx.set(-_dir.z, 0, _dir.x);
        if (_bx.lengthSq() < 1e-5) _bx.set(1, 0, 0);
        _bx.normalize();
        _bz.crossVectors(_bx, _dir);
        const cr = Math.cos(r.roll + (r.flying ? t * c.spinRate : 0));
        const sr = Math.sin(r.roll + (r.flying ? t * c.spinRate : 0));
        _pos.copy(_bx).multiplyScalar(cr).addScaledVector(_bz, sr);
        _bz.crossVectors(_pos, _dir);
        _m.makeBasis(_pos.multiplyScalar(wid * s), _vel.copy(_dir).multiplyScalar(len * s), _bz.multiplyScalar(wid * s));
        _m.setPosition(_base);
        this.thorns.setMatrixAt(i, _m);
        r.live = true;
        r.x = _base.x + _dir.x * len * s * 0.5;
        r.y = _base.y + _dir.y * len * s * 0.5;
        r.z = _base.z + _dir.z * len * s * 0.5;
      }
      state[i * 4] = r.seed;
      state[i * 4 + 1] = glow;
      state[i * 4 + 2] = splinter;
      state[i * 4 + 3] = flash;
    }
    for (let i = n; i < this.thorns.count; i++) this.thorns.setMatrixAt(i, _zero);
    for (let i = n; i < MAX_THORNS; i++) web[i].set(0, 0, -1, 0);
    this.thorns.count = n;
    this.thorns.instanceMatrix.needsUpdate = true;
    this.stateAttr.needsUpdate = true;
    this.warps.count = n;
    this.warps.instanceMatrix.needsUpdate = true;
    this.warpAttr.needsUpdate = true;
    this.warps.visible = this._landedCount > 0;

    /* the floor */
    this.pointAt(1, _centre);
    _webState.centre.copy(_centre);
    _webState.extent = c.clusterWidth + c.clusterDepth + c.rootReach + 1;
    const fd = this.fadeDuration;
    _webState.heat = fading ? 1 - smoothstep(0, fd * 0.8, ft) : 1;
    _webState.erode = fading ? smoothstep(fd * 0.35, fd, ft) : 0;
    this.webMaterial.userData.sync(_webState);
    this.web.visible = this._landedCount > 0;

    this._holdPins();

    /* the light rides the lead thorn, then sits over the landings */
    if (lead >= 0) {
      const r = this.recs[lead];
      this.position.set(r.x, r.y, r.z);
    } else if (this._landedCount > 0) {
      this.position.copy(_centre).setY(c.lightHeight);
    } else {
      this._slotOf(0, this.position);
    }

    if (dt > 0) this._trailFx(dt, t);
  }

  /* ------------------------------------------------------------------ */
  /* The strike                                                          */
  /* ------------------------------------------------------------------ */

  _strike(i) {
    const c = settings[ID];
    const g = settings.global;
    const r = this.recs[i];
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._landedCount++;
    _pos.copy(r.tip).setY(0.05);

    resetEmit(time);
    _emit.position = _pos;
    _emit.radius = 0.15;
    // Thrown up and back along the line the thorn came in on.
    _dir.set(-r.dir.x * 0.6, 1, -r.dir.z * 0.6).normalize();
    _emit.direction = _dir;
    _emit.speed = c.chipSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.6;
    _emit.size = c.chipSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.chipLife;
    _emit.spin = 9;
    this.chips.emit(Math.round(c.strikeChips * g.particleCount), _emit);
    _emit.speed = c.sparkSpeed * 0.6;
    _emit.spread = 0.9;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    _emit.spin = 0;
    this.sparks.emit(Math.round(c.strikeSparks * g.particleCount), _emit);
    _emit.direction = _up;
    _emit.radius = 0.3;
    _emit.speed = c.dustSpeed;
    _emit.spread = 1;
    _emit.size = c.dustSize;
    _emit.life = c.dustLife;
    _emit.spin = 0.5;
    this.dust.emit(Math.round(c.strikeDust * g.particleCount), _emit);

    this.ctx.decals.spawn(DecalType.CRACK, _pos, {
      radius: c.crackRadius,
      life: this.fadeDuration + c.lifetime * g.lifetime + 0.5,
      intensity: 0.9,
      colorA: getColor(c.colorRoot),
      colorB: getColor(c.colorSap),
      width: 0.08,
      height: 0.02
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: c.dustRingRadius,
      life: 0.9,
      intensity: 0.7,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC),
      growth: 0.3,
      height: 0.02
    });
    this.ctx.shake.add(c.strikeShake * power, 1 / Math.max(0.05, c.strikeShakeTime), 24);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.strikeLight * power);

    if (this._landedCount === this._n) {
      this.ctx.flash.trigger(getColor(c.colorFlash), c.lastFlash * power);
      this.pointAt(1, _centre);
      this.ctx.bursts.spawn(BurstMode.AIR, _centre.setY(0.6), {
        radius: 0.2,
        endRadius: c.lastBurst * power,
        life: 0.5,
        intensity: 1.2,
        opacity: 0.6 * g.opacity,
        squash: 0.5,
        colorA: getColor(c.colorSparkA),
        colorB: getColor(c.colorSap),
        colorC: getColor(c.colorRoot)
      });
    }

    this._pinAround(i, power);
  }

  /** Knock down whoever it came down by, and hold the first of them to the shaft. */
  _pinAround(i, power) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const r = this.recs[i];
    const found = field.findTargets(r.tip.x, r.tip.z, Math.max(0.1, c.pinRadius), this._found);
    _dir.set(r.dir.x, 0, r.dir.z);
    if (_dir.lengthSq() < 1e-5) _dir.copy(this.direction);
    _dir.normalize();
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    for (let f = 0; f < found.length; f++) {
      const d = found[f];
      if (!d.kill(_dir.x, _dir.z, this._force)) continue;
      for (let p = 0; p < MAX_PINS; p++) {
        const pin = this.pins[p];
        if (pin.dummy) continue;
        pin.dummy = d;
        pin.thorn = i;
        break;
      }
    }
    this._found.length = 0;
  }

  /** Keep every pinned body held to its shaft — which quivers, so the body sways. */
  _holdPins() {
    const c = settings[ID];
    const len = Math.max(0.1, c.thornLength);
    for (let p = 0; p < MAX_PINS; p++) {
      const pin = this.pins[p];
      if (!pin.dummy) continue;
      const r = this.recs[pin.thorn];
      if (!r.live || r.splintered || pin.dummy.finished) {
        pin.dummy.unpin();
        pin.dummy = null;
        pin.thorn = -1;
        continue;
      }
      _pos.copy(r.tip).addScaledVector(r.dir, -len * c.pinAlong);
      pin.dummy.pin(c.pinJoint, _pos, c.pinStiffness);
    }
  }

  _releasePins() {
    for (let p = 0; p < MAX_PINS; p++) {
      const pin = this.pins[p];
      if (pin.dummy) pin.dummy.unpin();
      pin.dummy = null;
      pin.thorn = -1;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /** Motes gathering into the drawn thorns; sap sparks and leaf scraps off the flying ones. */
  _trailFx(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    let drawing = 0;
    let flying = 0;
    for (let i = 0; i < this._n; i++) {
      const r = this.recs[i];
      if (r.flying) flying++;
      else if (!r.landed && r.live && t < this._launchOf(i)) drawing++;
    }
    const gather = Math.round(this.drawEmitter.tick(dt, c.drawMotes * drawing) * g.particleCount);
    if (gather > 0) {
      resetEmit(time);
      _emit.radius = 0.5;
      _emit.direction = _up;
      _emit.speed = 0.4;
      _emit.spread = 1;
      _emit.size = c.moteSize;
      _emit.life = c.moteLife;
      for (let q = 0; q < gather; q++) {
        const r = this.recs[(Math.random() * this._n) | 0];
        if (!r.live || r.landed || r.flying) continue;
        _pos.set(r.x, r.y, r.z);
        _emit.position = _pos;
        this.motes.emit(1, _emit);
      }
    }
    const count = Math.round(this.trailEmitter.tick(dt, c.trailRate * flying) * g.particleCount);
    if (count > 0) {
      resetEmit(time);
      _emit.radius = 0.05;
      _emit.speed = c.sparkSpeed * 0.15;
      _emit.spread = 0.6;
      _emit.size = c.sparkSize;
      _emit.life = c.trailLife;
      for (let q = 0; q < count; q++) {
        const r = this.recs[(Math.random() * this._n) | 0];
        if (!r.flying) continue;
        _pos.set(r.x, r.y, r.z);
        _emit.position = _pos;
        _emit.direction = _up;
        this.sparks.emit(1, _emit);
        if (Math.random() < c.scrapShare) {
          _emit.size = c.scrapSize;
          _emit.life = c.scrapLife;
          _emit.spin = 5;
          this.scraps.emit(1, _emit);
          _emit.size = c.sparkSize;
          _emit.life = c.trailLife;
          _emit.spin = 0;
        }
      }
    }
  }

  /** A thorn breaking up: splinters and leaves, a puff of dust. */
  _splinterFx(i) {
    const c = settings[ID];
    const g = settings.global;
    const r = this.recs[i];
    const len = Math.max(0.1, c.thornLength);
    resetEmit(frame.uTime.value);
    _pos.copy(r.tip).addScaledVector(r.dir, -len * 0.45);
    _emit.position = _pos;
    _emit.radius = len * 0.3;
    _emit.direction = _up;
    _emit.speed = c.chipSpeed * 0.5;
    _emit.spread = 1;
    _emit.size = c.chipSize * 0.8;
    _emit.life = c.chipLife;
    _emit.spin = 10;
    _emit.tint = getColor(c.colorBark);
    this.chips.emit(Math.round(c.splinterChips * g.particleCount), _emit);
    _emit.tint = null;
    _emit.speed = 1.5;
    _emit.size = c.scrapSize;
    _emit.life = c.scrapLife;
    _emit.spin = 5;
    this.scraps.emit(Math.round(c.splinterChips * 0.5 * g.particleCount), _emit);
    _emit.speed = c.sparkSpeed * 0.3;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    _emit.spin = 0;
    this.sparks.emit(Math.round(c.splinterChips * 0.6 * g.particleCount), _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._t = this.age;
    this._sync();
    this._updateVolley(dt);
    this.ctx.shake.rumble(settings[ID].travelRumble, dt);
  }

  onImpact() {
    this._impactAge = this.age;
  }

  onFade(dt) {
    this._t = this.age;
    this._sync();
    this._updateVolley(dt);
  }

  onDestroy() {
    this._releasePins();
    this.thorns.count = 0;
    this.warps.count = 0;
    this.thorns.visible = false;
    this.web.visible = false;
    this.warps.visible = false;
  }

  dispose() {
    this.thornGeometry.dispose();
    this.webGeometry.dispose();
    this.quadGeometry.dispose();
    this.thornMaterial.dispose();
    this.webMaterial.dispose();
    this.warpMaterial.dispose();
    this.thorns.dispose();
    this.warps.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('➶  Thorn Volley');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'thorn speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 8, 0.05, 'thorns stand for (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const draw = folder.addFolder('1 · The draw');
  R(draw, c, 'count', 1, MAX_THORNS, 1, 'thorns');
  R(draw, c, 'drawTime', 0.02, 2, 0.01, 'first loosed after (s)');
  R(draw, c, 'drawStagger', 0, 0.3, 0.005, 'drawn one after another (s)');
  R(draw, c, 'materialize', 0.02, 1, 0.01, 'one grows over (s)');
  R(draw, c, 'fanForward', -2, 2, 0.01, 'fan forward (m)');
  R(draw, c, 'fanWidth', 0, 4, 0.01, 'fan half-width (m)');
  R(draw, c, 'fanHeight', 0.5, 4, 0.01, 'fan height (m)');
  R(draw, c, 'fanArc', -1, 2, 0.01, 'fan arch (m)');
  R(draw, c, 'hover', 0, 0.5, 0.005, 'hover bob (m)');
  R(draw, c, 'hoverRate', 0, 12, 0.05, 'hover rate (rad/s)');
  R(draw, c, 'drawBack', 0, 1, 0.01, 'drawn back before release (m)');
  R(draw, c, 'drawMotes', 0, 200, 1, 'motes / s per thorn');

  const volley = folder.addFolder('2 · The volley');
  R(volley, c, 'stagger', 0, 0.4, 0.005, 'loosed apart (s)');
  R(volley, c, 'staggerJitter', 0, 0.3, 0.005, 'loose jitter (s)');
  R(volley, c, 'arcHeight', 0, 8, 0.05, 'arc height (m)');
  R(volley, c, 'spinRate', -30, 30, 0.1, 'roll in flight (rad/s)');
  R(volley, c, 'clusterWidth', 0, 5, 0.01, 'spread across (m)');
  R(volley, c, 'clusterDepth', 0, 6, 0.01, 'spread along (m)');
  R(volley, c, 'embedDepth', 0, 1.5, 0.01, 'point drives in (m)');
  R(volley, c, 'trailRate', 0, 300, 1, 'trail sparks / s per thorn');
  R(volley, c, 'trailLife', 0.05, 2, 0.01, 'trail life');
  R(volley, c, 'scrapShare', 0, 1, 0.01, 'leaf scraps share');
  R(volley, c, 'travelRumble', 0, 1, 0.01, 'rumble');

  const thorn = folder.addFolder('3 · The thorn');
  R(thorn, c, 'thornLength', 0.2, 4, 0.01, 'length (m)');
  R(thorn, c, 'thornWidth', 0.2, 4, 0.01, 'girth (×)');
  R(thorn, c, 'thornSpecular', 0, 3, 0.01, 'specular');
  R(thorn, c, 'thornGloss', 2, 200, 1, 'gloss');
  R(thorn, c, 'thornRim', 0, 4, 0.01, 'rim');
  R(thorn, c, 'sapGlow', 0, 10, 0.05, 'sap glow');
  R(thorn, c, 'sapTurns', 0, 6, 0.05, 'sap spiral turns');
  R(thorn, c, 'sapWidth', 0.01, 0.6, 0.005, 'sap width');
  R(thorn, c, 'flyGlow', 0, 3, 0.01, 'glow drawn & flying');
  R(thorn, c, 'restGlow', 0, 3, 0.01, 'glow stuck');
  thorn.addColor(c, 'colorHeartwood').name('heartwood');
  thorn.addColor(c, 'colorBark').name('bark');
  thorn.addColor(c, 'colorPoint').name('point');
  thorn.addColor(c, 'colorVane').name('leaf vanes');
  thorn.addColor(c, 'colorSap').name('sap');

  const strike = folder.addFolder('4 · The strike');
  R(strike, c, 'quiver', 0, 0.8, 0.005, 'quiver');
  R(strike, c, 'quiverRate', 0, 20, 0.1, 'quiver rate (Hz)');
  R(strike, c, 'quiverDamp', 0, 20, 0.1, 'quiver damping');
  R(strike, c, 'strikeChips', 0, 80, 1, 'soil per strike');
  R(strike, c, 'strikeSparks', 0, 80, 1, 'sparks per strike');
  R(strike, c, 'strikeDust', 0, 30, 1, 'dust per strike');
  R(strike, c, 'crackRadius', 0, 3, 0.05, 'crack (m)');
  R(strike, c, 'dustRingRadius', 0, 4, 0.05, 'dust ring (m)');
  R(strike, c, 'strikeShake', 0, 1, 0.01, 'jolt per strike');
  R(strike, c, 'strikeShakeTime', 0.05, 2, 0.01, 'jolt lasts (s)');
  R(strike, c, 'strikeLight', 0, 6, 0.05, 'light punch (× intensity)');
  R(strike, c, 'lastFlash', 0, 1, 0.01, 'flash at the last');
  R(strike, c, 'lastBurst', 0, 8, 0.05, 'air shell at the last (m)');
  R(strike, c, 'strikeWarp', 0, 3, 0.01, 'lens ring');
  R(strike, c, 'warpRadius', 0.2, 6, 0.05, 'lens ring reach (m)');
  R(strike, c, 'warpWidth', 0.01, 0.5, 0.005, 'lens ring width');
  R(strike, c, 'warpTime', 0.05, 2, 0.01, 'lens ring lasts (s)');
  strike.addColor(c, 'colorFlash').name('flash');

  const web = folder.addFolder('5 · Root web');
  R(web, c, 'rootReach', 0.2, 6, 0.05, 'reach (m)');
  R(web, c, 'rootSpeed', 0.1, 20, 0.1, 'crawl (m/s)');
  R(web, c, 'rootCount', 1, 12, 1, 'roots per thorn');
  R(web, c, 'rootWidth', 0.01, 0.5, 0.005, 'root width');
  R(web, c, 'rootGlow', 0, 8, 0.05, 'glow');
  R(web, c, 'stainOpacity', 0, 1, 0.01, 'stain');
  web.addColor(c, 'colorRoot').name('roots');
  web.addColor(c, 'colorStain').name('stain');

  const end = folder.addFolder('6 · Splinter');
  R(end, c, 'splinterTime', 0.05, 3, 0.01, 'one breaks over (s)');
  R(end, c, 'splinterStagger', 0, 2, 0.01, 'spread over (s)');
  R(end, c, 'splinterEdge', 0.005, 0.4, 0.005, 'break edge');
  R(end, c, 'splinterGlow', 0, 10, 0.05, 'break glow');
  R(end, c, 'splinterChips', 0, 80, 1, 'splinters per thorn');
  end.addColor(c, 'colorBreak').name('break edge');

  const fx = folder.addFolder('7 · Particles');
  R(fx, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 3, 0.01, 'spark life');
  R(fx, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(fx, c, 'sparkGravity', -10, 20, 0.1, 'spark gravity');
  R(fx, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  Editor.gradient(fx, c, 'colorSpark', 'sap spark colour');
  R(fx, c, 'moteSize', 0.005, 0.3, 0.005, 'mote size');
  R(fx, c, 'moteLife', 0.05, 3, 0.01, 'mote life');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  R(fx, c, 'scrapSize', 0.02, 0.4, 0.005, 'leaf scrap size');
  R(fx, c, 'scrapLife', 0.1, 4, 0.05, 'leaf scrap life');
  Editor.gradient(fx, c, 'colorScrap', 'leaf scrap colour');
  R(fx, c, 'chipSpeed', 0, 20, 0.1, 'soil speed');
  R(fx, c, 'chipSize', 0.01, 0.4, 0.005, 'soil size');
  R(fx, c, 'chipLife', 0.1, 4, 0.05, 'soil life');
  Editor.gradient(fx, c, 'colorChip', 'soil colour');
  R(fx, c, 'dustSpeed', 0, 6, 0.05, 'dust speed');
  R(fx, c, 'dustSize', 0.05, 3, 0.05, 'dust size');
  R(fx, c, 'dustLife', 0.1, 5, 0.05, 'dust life');
  R(fx, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(fx, c, 'colorDust', 'dust colour');

  const hit = folder.addFolder('8 · Pinned');
  R(hit, c, 'pinRadius', 0.1, 3, 0.01, 'reach of a strike (m)');
  R(hit, c, 'hitImpulse', 0, 15, 0.1, 'knocked along the flight (m/s)');
  R(hit, c, 'hitLift', 0, 10, 0.05, 'lift (m/s)');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'tumble');
  R(hit, c, 'pinAlong', 0, 1, 0.01, 'held at (share down from the point)');
  R(hit, c, 'pinStiffness', 0, 1, 0.01, 'hold');
  hit.add(c, 'pinJoint', ['Spine', 'Spine1', 'Spine2', 'Hips', 'Neck', 'Head']).name('held by');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 4, 0.05, 'height over the landings (m)');

  folder.close();
  return folder;
}
