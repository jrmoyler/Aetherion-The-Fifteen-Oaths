import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { createPearlGeometry, createWakeGeometry, createCrownGeometry } from '../../assets/codex/PearlTempestGeometry.js';
import { createPearlMaterial, createWakeMaterial, createCrownMaterial } from '../../materials/codex/PearlTempestMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'pearltempest';

const TAU = Math.PI * 2;
/** Pearls one volley can throw. */
const MAX_PEARLS = 12;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _hand = new Vector3();
const _ringU = new Vector3();
const _ringW = new Vector3();
const _floor = new Vector3();
const _scale = new Vector3();
const _quat = new Quaternion();
const _matrix = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _up = new Vector3(0, 1, 0);

/** Pearl states. */
const WHEEL = 0;
const FLYING = 1;
const BURST = 2;
const GONE = 3;

/**
 * PEARL TEMPEST — a volley of tide-pearls, flung in arcs, bursting into crowns.
 *
 * A line cast in three beats. **The gather**: a ring of pearls swells into
 * being round the caster's hand and wheels there, each one milky nacre with
 * a rainbow film at its rim and a knot of bright tide turning inside it.
 * **The volley**: one after another, a beat apart, the pearls are flung down
 * the line on high arcs that bow alternately left and right, each trailing a
 * double helix of light and shedding drops. The first lands halfway down the
 * line, the next a little further, scattering wider toward the end — a march
 * of impacts toward the target, the last pearl landing dead on it. **The
 * bursts**: each pearl flashes white and bursts *wet* — a splash crown shoots
 * up, flares and breaks at its rim into spikes, then slumps into the floor;
 * drops fly, bubbles pop, a ripple and a foam stain spread. The last burst is
 * the biggest.
 *
 * Distinct from the other water casts: nothing here is a sheet, a jet or a
 * whirlpool — it is a volley of discrete, solid-looking projectiles, and the
 * payoff is a sequence of crowns.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the pearls** (`createPearlMaterial`) — an opaque `InstancedMesh` of
 *      icospheres: nacre, thin-film iridescence, specular, sky, and the tide
 *      swirling inside; they flash before they burst.
 *   2. **the wakes** (`createWakeMaterial`) — instanced additive strands,
 *      two per pearl, wound as a double helix round each pearl's own arc in
 *      the vertex stage; they drain into the landing after it.
 *   3. **the crowns** (`createCrownMaterial(0)`) — instanced splash crowns,
 *      raised and slumped in the vertex stage, foam-rimmed water.
 *   4. **the crowns' lens** — the same crowns on `LAYER.DISTORTION`.
 *   5. **drops, bubbles & mist** — DROPLET drops shed by each pearl and
 *      thrown by each burst, BUBBLE bubbles that pop as the crown falls, a
 *      SMOKE mist hanging over each landing.
 *   6. **each burst** — a small WATER shell, a RIPPLE and a FOAM stain, a
 *      knock, a light punch; the last pearl's all scaled up.
 *   7. **the blast** — `handlesOwnHits`: each burst knocks flat whatever is
 *      within `hitRadius`, thrown out from the burst.
 *
 * ## The editor rule
 *
 * A cast rolls each pearl's dice (where it lands, how it bows, its seed);
 * every height, size, time and colour is read from `settings.pearltempest`
 * per frame. The pearls run on the cast's own clock, so the volley is not
 * bound to the line's travel phase.
 */
export class PearlTempestAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** Each burst picks whom it knocks flat. */
  get handlesOwnHits() {
    return true;
  }

  /** Pearls still in play. HUD readout only. */
  get instanceCount() {
    let n = 0;
    for (let i = 0; i < this._count; i++) if (this._pearls[i].state < GONE) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the pearls ---- */
    this.pearlGeometry = createPearlGeometry();
    this.pearlAttr = new InstancedBufferAttribute(new Float32Array(MAX_PEARLS * 4), 4);
    this.pearlAttr.setUsage(DynamicDrawUsage);
    this.pearlGeometry.setAttribute('aPearl', this.pearlAttr);
    this.pearlMaterial = createPearlMaterial();
    this.pearlMesh = new InstancedMesh(this.pearlGeometry, this.pearlMaterial, MAX_PEARLS);
    this.pearlMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.pearlMesh.layers.set(LAYER.VFX);
    this.pearlMesh.renderOrder = 10;
    this.pearlMesh.frustumCulled = false;
    this.pearlMesh.visible = false;
    this.pearlMesh.count = 0;
    this.group.add(this.pearlMesh);

    /* ---- layer 2: the wakes ---- */
    this.wakeGeometry = createWakeGeometry(MAX_PEARLS * 2);
    this.wakeMaterial = createWakeMaterial();
    this.wakes = this._mesh(this.wakeGeometry, this.wakeMaterial, LAYER.VFX, 13);

    /* ---- layers 3 + 4: the crowns and their lens ---- */
    this.crownGeometry = createCrownGeometry(MAX_PEARLS);
    this.crownMaterial = createCrownMaterial(0);
    this.crowns = this._mesh(this.crownGeometry, this.crownMaterial, LAYER.VFX, 11);
    this.crownLensMaterial = createCrownMaterial(1);
    this.crownLens = this._mesh(this.crownGeometry, this.crownLensMaterial, LAYER.DISTORTION, 0);

    /** Dice and clocks only — see the class comment. */
    this._pearls = [];
    for (let i = 0; i < MAX_PEARLS; i++) {
      this._pearls.push({
        state: GONE,
        launchAt: 0,
        flight: 1,
        prog: 0,
        landAt: 0,
        from: new Vector3(),
        to: new Vector3(),
        apex: 1,
        bow: 0,
        seed: 0,
        spin: 0,
        crown: 0,
        scale: 1,
        emitter: new RateEmitter()
      });
    }
    this._count = 0;
    this._wheel = 0;
    this._clock = 0;
    this._end = 1;
    this._impactAt = 0;
    this._lastBurst = new Vector3();
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

    this.drops = particles.get('pearltempest.drops', {
      capacity: 2600,
      shape: ParticleShape.DROPLET,
      additive: false,
      stretch: true,
      softFade: 0.2
    });
    this.drops.uniforms.uSizeIn.value = 0.05;
    this.drops.uniforms.uFadeIn.value = 0.03;
    this.drops.uniforms.uFadeOut.value = 0.35;
    this.drops.uniforms.uEndSize.value = 0.5;
    this.drops.uniforms.uDrag.value = 0.4;

    this.bubbles = particles.get('pearltempest.bubbles', {
      capacity: 600,
      shape: ParticleShape.BUBBLE,
      additive: false,
      softFade: 0.2
    });
    this.bubbles.uniforms.uSizeIn.value = 0.15;
    this.bubbles.uniforms.uFadeIn.value = 0.1;
    this.bubbles.uniforms.uFadeOut.value = 0.2;
    this.bubbles.uniforms.uEndSize.value = 1.3;
    this.bubbles.uniforms.uDrag.value = 2.0;

    this.mist = particles.get('pearltempest.mist', {
      capacity: 700,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1.0
    });
    this.mist.uniforms.uSizeIn.value = 0.2;
    this.mist.uniforms.uFadeIn.value = 0.12;
    this.mist.uniforms.uFadeOut.value = 0.6;
    this.mist.uniforms.uEndSize.value = 2.4;
    this.mist.uniforms.uDrag.value = 1.6;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase lasts until the last crown has fallen. */
  get impactDuration() {
    return Math.max(0.1, this._end - this._impactAt);
  }

  /** The fade is the drops, the mist and the foam settling. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 11.7) * Math.sin(this.age * 3.9 + 1.1));
  }

  /* ------------------------------------------------------------------ */
  /* Geometry on the CPU                                                 */
  /* ------------------------------------------------------------------ */

  /** A point on one pearl's flight. Twin of `arcPoint` in the materials. */
  _arcPoint(p, t, out) {
    out.lerpVectors(p.from, p.to, t);
    const dx = p.to.x - p.from.x;
    const dz = p.to.z - p.from.z;
    const len = Math.hypot(dx, dz) || 1;
    out.y += p.apex * 4 * t * (1 - t);
    const b = p.bow * Math.sin(Math.PI * t);
    out.x += (-dz / len) * b;
    out.z += (dx / len) * b;
    return out;
  }

  /** The hand, and the two axes of the wheel the pearls turn on. */
  _wheelFrame() {
    const c = settings[ID];
    _hand.copy(this.origin)
      .addScaledVector(this.direction, c.handForward)
      .addScaledVector(this.side, c.handSide);
    _hand.y = c.handHeight;
    _ringU.copy(this.side);
    _ringW.copy(_up).multiplyScalar(Math.cos(c.orbitTilt)).addScaledVector(this.direction, -Math.sin(c.orbitTilt));
  }

  _wheelPoint(i, out) {
    const c = settings[ID];
    const a = this._wheel + (i * TAU) / Math.max(1, this._count);
    return out.copy(_hand)
      .addScaledVector(_ringU, Math.cos(a) * c.orbitRadius)
      .addScaledVector(_ringW, Math.sin(a) * c.orbitRadius);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.max(1, Math.min(MAX_PEARLS, Math.round(c.pearlCount)));
    this._count = n;
    this._wheel = Math.random() * TAU;
    this._clock = 0;
    this._impactAt = 0;
    const speed = Math.max(1, c.speed * g.speed);

    // Roll every pearl's dice: where it lands, how it bows, how high it goes.
    let end = 0;
    for (let i = 0; i < MAX_PEARLS; i++) {
      const p = this._pearls[i];
      p.state = GONE;
      if (i >= n) continue;
      const last = i === n - 1;
      const frac = n === 1 ? 1 : i / (n - 1);
      const along = this.length * lerp(saturate(c.landFrom), 1, frac);
      const lat = last ? 0 : (Math.random() * 2 - 1) * c.landSpread * g.randomness * (along / this.length);
      p.to.copy(this.origin).addScaledVector(this.direction, along).addScaledVector(this.side, lat);
      p.to.y = 0.12;
      const reach = Math.hypot(along, lat);
      p.state = WHEEL;
      p.launchAt = c.gatherTime + i * c.launchStagger;
      p.flight = Math.max(0.2, reach / speed);
      p.landAt = p.launchAt + p.flight;
      p.apex = c.arcHeight * (reach / 14) * (1 + c.arcJitter * (Math.random() * 2 - 1));
      p.bow = (last ? 0.25 : 1) * c.curve * (i % 2 === 0 ? 1 : -1) * (0.6 + 0.4 * Math.random()) * Math.min(1.4, reach / 12);
      p.seed = Math.random() * 10;
      p.spin = Math.random() * TAU;
      p.prog = 0;
      p.crown = 0;
      p.scale = last ? Math.max(1, c.lastScale) : 0.85 + Math.random() * 0.3;
      p.emitter.reset();
      end = Math.max(end, p.landAt);
    }
    this._end = end + Math.max(0.1, c.crownTime * g.lifetime);
    this._lastBurst.copy(this.origin);

    this.pearlMesh.count = n;
    this.pearlMesh.visible = true;
    this.wakeGeometry.instanceCount = n * 2;
    this.crownGeometry.instanceCount = n;
    this.wakes.visible = true;
    this.crowns.visible = true;
    this.crownLens.visible = true;

    this._run(0);
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
  /* The volley's own clock                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._run(dt);
  }

  onImpact() {
    // The line has been reached; the pearls keep their own time.
    this._impactAt = this._clock;
  }

  onFade(dt, t) {
    this._run(dt);
    if (t > 1) {
      // Nothing left in the air: the light sinks over the last burst.
      this.position.copy(this._lastBurst);
      this.position.y = Math.max(0.3, 1.2 * (2 - t));
    }
  }

  _run(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._clock += dt;
    const now = this._clock;
    this._wheel += c.orbitSpeed * dt * g.animationSpeed;
    this._wheelFrame();

    const pAttr = this.pearlAttr.array;
    const wFrom = this.wakeGeometry.getAttribute('aFrom');
    const wTo = this.wakeGeometry.getAttribute('aTo');
    const wArc = this.wakeGeometry.getAttribute('aArc');
    const wLook = this.wakeGeometry.getAttribute('aLook');
    const cAttr = this.crownGeometry.getAttribute('aCrown');
    const cScale = this.crownGeometry.getAttribute('aScale');

    let lead = -1;
    let leadProg = -1;

    for (let i = 0; i < this._count; i++) {
      const p = this._pearls[i];
      let flash = 0;
      let visible = false;

      if (p.state === WHEEL) {
        this._wheelPoint(i, _pos);
        if (now >= p.launchAt) {
          // Thrown from wherever on the wheel it is.
          p.from.copy(_pos);
          p.state = FLYING;
        } else {
          visible = true;
          const grow = Easing.outBack(saturate((now - i * 0.035) / 0.18));
          _scale.setScalar(c.pearlRadius * grow * (0.8 + 0.2 * p.scale));
        }
      }

      if (p.state === FLYING) {
        p.prog = saturate((now - p.launchAt) / p.flight);
        if (p.prog >= 1) {
          this._burst(p, i);
        } else {
          visible = true;
          this._arcPoint(p, p.prog, _pos);
          _scale.setScalar(c.pearlRadius * (0.8 + 0.2 * p.scale));
          flash = smoothstep(0.82, 1, p.prog) * 0.7;
          this._shed(p, _pos, dt);
          if (p.prog > leadProg) {
            leadProg = p.prog;
            lead = i;
          }
        }
      }

      if (p.state === BURST) {
        p.crown += dt / Math.max(0.05, c.crownTime * g.lifetime);
        if (p.crown >= 1) p.state = GONE;
      }

      /* pearl instance */
      p.spin += c.pearlSpin * dt * g.animationSpeed;
      if (visible) {
        _quat.identity();
        _matrix.compose(_pos, _quat, _scale);
        this.pearlMesh.setMatrixAt(i, _matrix);
      } else {
        this.pearlMesh.setMatrixAt(i, _zero);
      }
      pAttr[i * 4] = p.seed;
      pAttr[i * 4 + 1] = flash;
      pAttr[i * 4 + 2] = p.spin;
      pAttr[i * 4 + 3] = 0;

      /* wake strands: the progress runs on past the landing so the wake drains in */
      const wp = p.state === WHEEL ? -1 : (now - p.launchAt) / p.flight;
      const strength = p.state === WHEEL ? 0 : 1 - smoothstep(1, 1 + c.wakeLength, wp);
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        wFrom.setXYZ(j, p.from.x, p.from.y, p.from.z);
        wTo.setXYZ(j, p.to.x, p.to.y, p.to.z);
        wArc.setXYZ(j, p.apex, p.bow, wp);
        wArc.setW(j, k * Math.PI + p.seed);
        wLook.setXY(j, p.seed + k * 3.3, strength);
      }

      /* crown instance */
      cAttr.setXYZW(i, p.to.x, p.to.z, p.state === BURST ? p.crown : 0, p.seed);
      cScale.setX(i, p.scale);
    }

    this.pearlMesh.instanceMatrix.needsUpdate = true;
    this.pearlAttr.needsUpdate = true;
    wFrom.needsUpdate = true;
    wTo.needsUpdate = true;
    wArc.needsUpdate = true;
    wLook.needsUpdate = true;
    cAttr.needsUpdate = true;
    cScale.needsUpdate = true;

    this._syncLooks();

    // The light (and the camera's interest) rides the lead pearl.
    if (lead >= 0) {
      this._arcPoint(this._pearls[lead], leadProg, this.position);
    } else if (now < c.gatherTime) {
      this.position.copy(_hand);
    } else {
      this.position.copy(this._lastBurst).setY(1);
    }
  }

  _syncLooks() {
    const c = settings[ID];
    const g = settings.global;
    this.pearlMaterial.userData.sync();
    this.wakeMaterial.userData.sync();
    this.crownMaterial.userData.sync();
    this.crownLensMaterial.userData.sync();

    this.drops.setGradient(getColor(c.colorDropA), getColor(c.colorDropB), getColor(c.colorDropC), getColor(c.colorDropD));
    const d = this.drops.uniforms;
    d.uGravity.value.set(0, -c.dropGravity, 0);
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = g.opacity;
    d.uGlow.value = 1.4 * g.glow;
    d.uStretch.value = 0.1;
    d.uTurbulence.value = 0.15 * g.turbulence;

    this.bubbles.setGradient(getColor(c.colorDropA), getColor(c.colorDropB), getColor(c.colorDropC), getColor(c.colorDropD));
    const b = this.bubbles.uniforms;
    b.uGravity.value.set(0, 0.6, 0);
    b.uSizeScale.value = g.particleSize;
    b.uLifeScale.value = g.particleLifetime;
    b.uSpeedScale.value = g.particleSpeed;
    b.uOpacity.value = g.opacity;
    b.uGlow.value = 1.2 * g.glow;
    b.uTurbulence.value = 0.5 * g.turbulence;

    this.mist.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
    const m = this.mist.uniforms;
    m.uGravity.value.set(0, 0.3, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = c.mistOpacity * g.opacity;
    m.uTurbulence.value = 0.6 * g.turbulence;
    m.uSwirl.value = 0.6;
    m.uSwirlExpand.value = 0.8;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Drops shed off a pearl in flight. */
  _shed(p, at, dt) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(p.emitter.tick(dt, c.wakeDrops) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.position = at;
    _emit.radius = c.pearlRadius * 0.8;
    _emit.direction = _up;
    _emit.speed = 0.6;
    _emit.spread = 1;
    _emit.size = c.dropSize * 0.7;
    _emit.life = c.dropLife * 0.6;
    this.drops.emit(n, _emit);
  }

  /** The pearl lands: it bursts into a crown. */
  _burst(p, i) {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    const k = p.scale;
    const last = i === this._count - 1;
    p.state = BURST;
    p.crown = 0;
    p.prog = 1;
    this._lastBurst.copy(p.to);

    _floor.copy(p.to).setY(0);
    this.ctx.decals.spawn(DecalType.RIPPLE, _floor, {
      radius: c.rippleRadius * k * power,
      life: 0.9,
      intensity: 0.9,
      colorA: getColor(c.colorRippleA),
      colorB: getColor(c.colorRippleB)
    });
    this.ctx.decals.spawn(DecalType.FOAM, _floor, {
      radius: c.foamRadius * k,
      life: this.fadeDuration + c.crownTime + 0.6,
      intensity: 0.85,
      colorA: getColor(c.colorFoam),
      colorB: getColor(c.colorRippleA)
    });
    _pos.copy(p.to).setY(0.35 * k);
    this.ctx.bursts.spawn(BurstMode.WATER, _pos, {
      radius: c.burstSize * 0.15 * k,
      endRadius: c.burstSize * k * power,
      life: 0.4,
      intensity: 1,
      opacity: 0.45,
      fresnel: 2.2,
      displace: 0.3,
      turbulence: 0.8,
      squash: 0.6,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    /* drops: a cone up and out */
    this._resetEmit(time);
    _emit.position = _pos;
    _emit.radius = 0.2 * k;
    _emit.direction = _up;
    _emit.speed = c.dropSpeed * Math.sqrt(k);
    _emit.speedVariance = 0.5;
    _emit.spread = 0.75;
    _emit.size = c.dropSize;
    _emit.life = c.dropLife;
    this.drops.emit(Math.round(c.burstDrops * k * g.particleCount), _emit);

    /* bubbles round the foot of the crown */
    _emit.radius = c.crownRadius * 0.7 * k;
    _emit.speed = 0.7;
    _emit.spread = 0.6;
    _emit.size = c.bubbleSize;
    _emit.life = c.bubbleLife;
    _emit.lifeVariance = 0.6;
    this.bubbles.emit(Math.round(c.burstBubbles * k * g.particleCount), _emit);

    /* mist hanging over the splash */
    _emit.radius = 0.4 * k;
    _emit.speed = 0.9;
    _emit.spread = 0.9;
    _emit.size = c.mistSize * k;
    _emit.life = c.mistLife;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0.4;
    this.mist.emit(Math.round(5 * k * g.particleCount), _emit);

    this.ctx.shake.add(c.burstShake * (last ? 2 : 1) * power, 9, 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.burstFlash * (last ? 2.5 : 1) * power);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.burstLight * k * power);

    this._blast(p.to, c.hitRadius * k * power);
  }

  /** Knock flat whatever is round a burst, thrown out from it. */
  _blast(at, radius) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const found = field.findTargets(at.x, at.z, radius, this._found);
    for (const dummy of found) {
      _dir.set(dummy.position.x - at.x, 0, dummy.position.z - at.z);
      const d = _dir.length();
      if (d < 1e-3) _dir.copy(this.direction);
      else _dir.multiplyScalar(1 / d);
      const close = 1 - saturate(d / Math.max(0.1, radius));
      this._force.impulse = c.hitImpulse * (0.5 + 0.5 * close) * g.explosionIntensity;
      this._force.lift = c.hitLift * (0.5 + 0.5 * close) * g.explosionIntensity;
      this._force.spin = c.hitSpin;
      dummy.kill(_dir.x, _dir.z, this._force);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.pearlMesh.visible = false;
    this.pearlMesh.count = 0;
    this.wakes.visible = false;
    this.crowns.visible = false;
    this.crownLens.visible = false;
    this.wakeGeometry.instanceCount = 0;
    this.crownGeometry.instanceCount = 0;
    for (let i = 0; i < MAX_PEARLS; i++) this._pearls[i].state = GONE;
    this._count = 0;
  }

  dispose() {
    this.pearlGeometry.dispose();
    this.wakeGeometry.dispose();
    this.crownGeometry.dispose();
    this.pearlMaterial.dispose();
    this.wakeMaterial.dispose();
    this.crownMaterial.dispose();
    this.crownLensMaterial.dispose();
    this.pearlMesh.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◎  Pearl Tempest');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'pearl speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'settles over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'shimmer');

  const gather = folder.addFolder('1 · Gather');
  R(gather, c, 'pearlCount', 1, MAX_PEARLS, 1, 'pearls');
  R(gather, c, 'gatherTime', 0, 1.5, 0.01, 'wheel before throwing (s)');
  R(gather, c, 'handForward', -1, 2, 0.01, 'hand forward (m)');
  R(gather, c, 'handSide', -1, 1, 0.01, 'hand to the right (m)');
  R(gather, c, 'handHeight', 0.2, 3, 0.01, 'hand height (m)');
  R(gather, c, 'orbitRadius', 0.05, 2, 0.01, 'wheel radius (m)');
  R(gather, c, 'orbitSpeed', 0, 30, 0.1, 'wheel speed (rad/s)');
  R(gather, c, 'orbitTilt', -1.5, 1.5, 0.01, 'wheel tilt (rad)');

  const volley = folder.addFolder('2 · Volley');
  R(volley, c, 'launchStagger', 0, 0.5, 0.005, 'between throws (s)');
  R(volley, c, 'arcHeight', 0, 10, 0.05, 'arc height (m per 14 m)');
  R(volley, c, 'arcJitter', 0, 1, 0.01, 'arc jitter');
  R(volley, c, 'curve', 0, 5, 0.01, 'sideways bow (m)');
  R(volley, c, 'landFrom', 0, 1, 0.01, 'landings start at (share)');
  R(volley, c, 'landSpread', 0, 6, 0.01, 'landing scatter (m)');
  R(volley, c, 'pearlRadius', 0.03, 1, 0.005, 'pearl radius (m)');
  R(volley, c, 'pearlSpin', 0, 30, 0.1, 'inner tide spin');

  const pearl = folder.addFolder('3 · Pearl');
  R(pearl, c, 'nacreGlow', 0, 4, 0.01, 'nacre');
  R(pearl, c, 'iridescence', 0, 4, 0.01, 'iridescence');
  R(pearl, c, 'filmScale', 0, 6, 0.01, 'film bands');
  R(pearl, c, 'coreGlow', 0, 10, 0.05, 'inner tide glow');
  R(pearl, c, 'swirlScale', 0.1, 8, 0.01, 'inner tide scale');
  R(pearl, c, 'fresnelPower', 0.2, 8, 0.05, 'fresnel power');
  R(pearl, c, 'specular', 0, 10, 0.05, 'specular');
  R(pearl, c, 'envAmount', 0, 3, 0.01, 'sky reflection');
  pearl.addColor(c, 'colorPearlA').name('nacre');
  pearl.addColor(c, 'colorPearlB').name('nacre shadow');
  pearl.addColor(c, 'colorPearlC').name('inner tide');
  pearl.addColor(c, 'colorPearlD').name('highlight');

  const wake = folder.addFolder('4 · Wake');
  R(wake, c, 'wakeLength', 0.01, 1, 0.005, 'length (share of flight)');
  R(wake, c, 'wakeRadius', 0, 1, 0.005, 'helix radius (m)');
  R(wake, c, 'wakeTurns', 0, 12, 0.05, 'helix turns');
  R(wake, c, 'wakeWidth', 0.002, 0.3, 0.001, 'strand width (m)');
  R(wake, c, 'wakeGlow', 0, 10, 0.05, 'glow');
  R(wake, c, 'wakeOpacity', 0, 1, 0.01, 'opacity');
  R(wake, c, 'wakeDrops', 0, 300, 1, 'drops/second');
  wake.addColor(c, 'colorWakeA').name('near the pearl');
  wake.addColor(c, 'colorWakeB').name('tail');

  const crown = folder.addFolder('5 · Crown');
  R(crown, c, 'crownRadius', 0.05, 4, 0.01, 'radius (m)');
  R(crown, c, 'crownHeight', 0.05, 4, 0.01, 'height (m)');
  R(crown, c, 'crownTime', 0.05, 3, 0.01, 'stands for (s)');
  R(crown, c, 'crownSpikes', 3, 32, 1, 'spikes');
  R(crown, c, 'crownSpikeDepth', 0, 1, 0.01, 'spike depth');
  R(crown, c, 'crownFlare', 0, 2, 0.01, 'rim flare');
  R(crown, c, 'crownOpacity', 0, 1, 0.01, 'opacity');
  R(crown, c, 'crownGlow', 0, 6, 0.01, 'glow');
  R(crown, c, 'crownFoam', 0, 4, 0.01, 'foam');
  R(crown, c, 'crownWarp', 0, 4, 0.01, 'distortion');
  crown.addColor(c, 'colorCrownA').name('body');
  crown.addColor(c, 'colorCrownB').name('sheen');
  crown.addColor(c, 'colorCrownC').name('foam');

  const fx = folder.addFolder('6 · Drops, bubbles & mist');
  R(fx, c, 'burstDrops', 0, 300, 1, 'drops per burst');
  R(fx, c, 'dropSize', 0.005, 0.4, 0.001, 'drop size');
  R(fx, c, 'dropSpeed', 0, 20, 0.05, 'drop speed');
  R(fx, c, 'dropGravity', 0, 30, 0.1, 'drop gravity');
  R(fx, c, 'dropLife', 0.1, 4, 0.05, 'drop lifetime');
  R(fx, c, 'burstBubbles', 0, 100, 1, 'bubbles per burst');
  R(fx, c, 'bubbleSize', 0.01, 0.6, 0.005, 'bubble size');
  R(fx, c, 'bubbleLife', 0.1, 3, 0.05, 'bubble lifetime');
  R(fx, c, 'mistSize', 0.05, 4, 0.01, 'mist size');
  R(fx, c, 'mistLife', 0.1, 6, 0.05, 'mist lifetime');
  R(fx, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  Editor.gradient(fx, c, 'colorDrop', 'drop gradient');
  Editor.gradient(fx, c, 'colorMist', 'mist gradient');

  const burst = folder.addFolder('7 · Each burst');
  R(burst, c, 'burstSize', 0, 5, 0.05, 'water shell (m)');
  R(burst, c, 'rippleRadius', 0, 8, 0.05, 'ripple (m)');
  R(burst, c, 'foamRadius', 0, 6, 0.05, 'foam (m)');
  R(burst, c, 'burstFlash', 0, 1, 0.01, 'flash');
  R(burst, c, 'burstShake', 0, 1, 0.01, 'camera knock');
  R(burst, c, 'burstLight', 0, 6, 0.01, 'light punch (× intensity)');
  R(burst, c, 'lastScale', 1, 3, 0.01, 'last pearl scale');
  burst.addColor(c, 'colorRippleA').name('ripple');
  burst.addColor(c, 'colorRippleB').name('ripple bright');
  burst.addColor(c, 'colorBurstA').name('shell inner');
  burst.addColor(c, 'colorBurstB').name('shell mid');
  burst.addColor(c, 'colorBurstC').name('shell outer');
  burst.addColor(c, 'colorFoam').name('foam');
  burst.addColor(c, 'colorFlash').name('flash');

  const blast = folder.addFolder('8 · Blast');
  R(blast, c, 'hitRadius', 0, 6, 0.01, 'knocks flat within (m)');
  R(blast, c, 'hitImpulse', 0, 25, 0.1, 'thrown (m/s)');
  R(blast, c, 'hitLift', 0, 15, 0.05, 'lift (m/s)');
  R(blast, c, 'hitSpin', 0, 6, 0.01, 'tumble');

  folder.close();
  return folder;
}
