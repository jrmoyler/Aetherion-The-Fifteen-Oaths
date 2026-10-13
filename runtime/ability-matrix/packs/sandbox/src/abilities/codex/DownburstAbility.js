import { Mesh, Vector2, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createPolarDiscGeometry,
  createTubeGeometry,
  createTorusParamGeometry,
  createGroundQuadGeometry
} from '../../assets/codex/DownburstGeometry.js';
import {
  createStormCloudMaterial,
  createWindColumnMaterial,
  createPressureFunnelMaterial,
  createGroundBlastMaterial,
  createDustTorusMaterial,
  createShockLensMaterial
} from '../../materials/codex/DownburstMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'downburst';

const TAU = Math.PI * 2;
/** Bodies one slam can keep hold of at once — pressed down or carried out. */
const MAX_HELD = 12;
const MODE_PRESS = 1;
const MODE_BLOW = 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _body = new Vector3();
const _down = new Vector3(0, -1, 0);

/**
 * DOWNBURST — Wind, zone cast.
 *
 * A microburst, staged in four beats on one clock that starts when the herald
 * gust arrives over the circle:
 *
 *   1. **GATHER** — a storm cloud swirls together over the circle out of
 *      nothing: spiral arms winding into a heavy core that sags lower and lower
 *      as it fills, sheet lightning flickering inside it, cloud wisps streaming
 *      in to feed it. Under it, a column of pressure reaches down toward the
 *      floor — you see it only as the world behind it twisting — and the edge
 *      of the circle darkens and breathes. The camera starts to rumble.
 *   2. **DROP** — the column falls: a translucent tube of wind streaks, pinched
 *      up into the cloud and splayed at the foot, its leading front white-hot.
 *      The core of the cloud lurches down with it.
 *   3. **SLAM** — the column hits the floor and the air has nowhere to go but
 *      out. A shock ring races outward with a rolling torus of dust riding it,
 *      streaks rush out flat along the ground, dust and debris are flung, the
 *      floor is combed into radial scour and pressed dark in the middle. Strong
 *      shake, flash and light punch.
 *   4. **SETTLE** — the column is lifted off the floor and drawn back up, the
 *      cloud tears apart, the dust torus slows and thins, fine dust sifts back
 *      down and the scour erodes away.
 *
 * ## Layers
 *
 *   - **storm cloud** (`createStormCloudMaterial`) — bent polar disc, spiral
 *     fbm, two-tap sun lighting, inner charge glow, lightning.
 *   - **pressure funnel** (`createPressureFunnelMaterial`, `LAYER.DISTORTION`)
 *     — the anticipation, and a hard punch on the slam.
 *   - **column** (`createWindColumnMaterial`) — additive falling streaks.
 *   - **ground blast** (`createGroundBlastMaterial`) — telegraph, shock ring,
 *     scour, imprint; the ground treatment.
 *   - **dust torus** (`createDustTorusMaterial`) — the rolling ring of dust.
 *   - **shock lens** (`createShockLensMaterial`, `LAYER.DISTORTION`).
 *   - **particles** — wisps (SMOKE), streaks (STREAK: the herald, the fall down
 *     the column and the radial rush), dust (SMOKE), debris (CHIP).
 *   - **engine** — DUSTRING + SHOCKWAVE decals and a squashed AIR burst.
 *
 * ## Bodies
 *
 * `handlesOwnHits`: nothing is touched until the slam, and then what happens
 * depends on where a body stood. Inside `pressCore` of the circle it is driven
 * straight *down* — killed with a negative lift so it crumples into the floor
 * rather than flying — and then held there by the downdraft for `pressHold`
 * (`Dummy#carry` with a downward field, and `hold` so it does not start to burn
 * while pinned). Further out it is caught by the outflow: thrown outward with
 * lift and a tumble, then carried on by a radial wind field for `blowTime`, so
 * it skids and rolls away with the dust rather than stopping dead. Bodies
 * already lying in the circle are shoved outward too.
 *
 * ## The editor rule
 *
 * A cast records only its seed, its clock and the integrated phases (the
 * cloud's spin, the streaks' fall, the torus' roll — integrated so a slider
 * never makes them jump). Every metre, second and colour is read from
 * `settings.downburst` every frame.
 */
export class DownburstAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Bodies held by the wind right now. HUD readout only. */
  get instanceCount() {
    let n = 0;
    for (let i = 0; i < MAX_HELD; i++) if (this._held[i].mode) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.cloudGeometry = createPolarDiscGeometry(28, 96);
    this.tubeGeometry = createTubeGeometry(64, 40);
    this.torusGeometry = createTorusParamGeometry(110, 20);
    this.quadGeometry = createGroundQuadGeometry();

    this.groundMaterial = createGroundBlastMaterial();
    this.ground = this._mesh(this.quadGeometry, this.groundMaterial, 3, LAYER.VFX);

    this.torusMaterial = createDustTorusMaterial();
    this.torus = this._mesh(this.torusGeometry, this.torusMaterial, 9, LAYER.VFX);

    this.columnMaterial = createWindColumnMaterial();
    this.column = this._mesh(this.tubeGeometry, this.columnMaterial, 12, LAYER.VFX);

    this.cloudMaterial = createStormCloudMaterial();
    this.cloud = this._mesh(this.cloudGeometry, this.cloudMaterial, 14, LAYER.VFX);

    this.funnelMaterial = createPressureFunnelMaterial();
    this.funnel = this._mesh(this.tubeGeometry, this.funnelMaterial, 0, LAYER.DISTORTION);

    this.lensMaterial = createShockLensMaterial();
    this.lens = this._mesh(this.quadGeometry, this.lensMaterial, 1, LAYER.DISTORTION);

    /* ---- per-cast state: dice, a clock and integrated phases only ---- */
    this._centre = new Vector3();
    this._lightXZ = new Vector2(1, 0);
    this._seed = 0;
    this._clock = -1;
    this._spin = 0;
    this._flow = 0;
    this._roll = 0;
    this._flash = 0;
    this._slammed = false;

    /* ---- shared sync state blocks, written in place every frame ---- */
    this._cloudState = { centre: this._centre, form: 0, dissolve: 0, spin: 0, charge: 0, flash: 0, sag: 0, lightXZ: this._lightXZ, seed: 0 };
    this._columnState = { centre: this._centre, bottom: 7, flow: 0, fade: 0, liftY: -10, seed: 0 };
    this._funnelState = { centre: this._centre, reach: 0, strength: 0, seed: 0 };
    this._groundState = { centre: this._centre, extent: 10, warn: 0, wave: 0, ringLevel: 0, scour: 0, imprint: 0, erode: 0, seed: 0 };
    this._torusState = { centre: this._centre, major: 0, tube: 0.4, roll: 0, fade: 0, thin: 0, seed: 0 };
    this._lensState = { centre: this._centre, extent: 10, wave: 0, strength: 0 };

    /* ---- bodies the wind has hold of ---- */
    this._held = [];
    for (let i = 0; i < MAX_HELD; i++) {
      this._held.push({ dummy: null, mode: 0, time: 0, falloff: 1 });
    }
    this._targets = [];
    this._bodies = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    // The field `Dummy#carry` samples per joint. Bound once — it reads which
    // body it is acting on from `_fieldRec`, so no closure is made per frame.
    this._fieldRec = null;
    this._field = (x, y, z, out) => this._windAt(x, y, z, out);
  }

  _mesh(geometry, material, order, layer) {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false; // placed in its own vertex stage
    mesh.matrixAutoUpdate = false;
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Cloud stuff streaming in while it gathers. Normal-blended: it is grey.
    this.wisps = particles.get('downburst.wisp', {
      capacity: 600,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.6
    });
    this.wisps.uniforms.uDrag.value = 0.6;
    this.wisps.uniforms.uEndSize.value = 1.6;
    this.wisps.uniforms.uSizeIn.value = 0.25;
    this.wisps.uniforms.uFadeIn.value = 0.25;
    this.wisps.uniforms.uFadeOut.value = 0.5;

    // Wind streaks: the herald, the fall down the column, the rush outward.
    this.streaks = particles.get('downburst.streak', {
      capacity: 3000,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.25
    });
    this.streaks.uniforms.uDrag.value = 1.6;
    this.streaks.uniforms.uEndSize.value = 0.3;
    this.streaks.uniforms.uSizeIn.value = 0.02;
    this.streaks.uniforms.uFadeIn.value = 0.03;
    this.streaks.uniforms.uFadeOut.value = 0.6;

    // Dust billows: thrown out on the slam, and the fine sift after.
    this.dust = particles.get('downburst.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      lit: true,
      softFade: 0.5
    });
    this.dust.uniforms.uDrag.value = 1.4;
    this.dust.uniforms.uEndSize.value = 2.2;
    this.dust.uniforms.uSizeIn.value = 0.08;
    this.dust.uniforms.uFadeIn.value = 0.04;
    this.dust.uniforms.uFadeOut.value = 0.6;

    // Grit skittering out along the floor.
    this.debris = particles.get('downburst.debris', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.debris.uniforms.uDrag.value = 0.7;
    this.debris.uniforms.uEndSize.value = 0.8;
    this.debris.uniforms.uSizeIn.value = 0.01;
    this.debris.uniforms.uFadeIn.value = 0.01;
    this.debris.uniforms.uFadeOut.value = 0.3;

    this.heraldEmitter = new RateEmitter();
    this.wispEmitter = new RateEmitter();
    this.downEmitter = new RateEmitter();
    this.settleEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _gatherTime() {
    return Math.max(0.05, settings.downburst.gatherTime * settings.global.lifetime);
  }

  _dropTime() {
    return Math.max(0.02, settings.downburst.dropTime);
  }

  /** Clock time of the slam. */
  _slamAt() {
    return this._gatherTime() + this._dropTime();
  }

  _holdTime() {
    return Math.max(0, settings.downburst.holdTime * settings.global.lifetime);
  }

  _settleTime() {
    return Math.max(0.05, settings.downburst.lifetime * settings.global.lifetime);
  }

  get impactDuration() {
    const c = settings.downburst;
    const g = settings.global;
    const after = Math.max(
      Math.max(0.05, c.waveTime),
      this._holdTime() + Math.max(0.05, c.columnFadeTime),
      this._holdTime() + Math.max(0.05, c.cloudFadeTime * g.lifetime),
      this._settleTime()
    );
    return this._slamAt() + after;
  }

  get fadeDuration() {
    return Math.max(0.1, settings.downburst.fadeTime * settings.global.lifetime);
  }

  /** Storm light: steady, guttering with the lightning inside the cloud. */
  lightShimmer() {
    const f = settings.downburst.lightFlicker;
    return 1 - f * 0.25 + f * (0.25 * Math.sin(this.age * 23.1) * Math.sin(this.age * 7.3) + this._flash * 0.9);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._clock = -1;
    this._spin = Math.random() * TAU;
    this._flow = 0;
    this._roll = 0;
    this._flash = 0;
    this._slammed = false;
    this.pointAt(1, this._centre);
    this._centre.y = 0;
    this.heraldEmitter.reset();
    this.wispEmitter.reset();
    this.downEmitter.reset();
    this.settleEmitter.reset();
    for (let i = 0; i < MAX_HELD; i++) {
      const h = this._held[i];
      h.dummy = null;
      h.mode = 0;
      h.time = 0;
      h.falloff = 1;
    }
    this._fieldRec = null;
    this._update(0);
  }

  onTravel(dt) {
    const c = settings.downburst;
    this._clock = -1;
    // The herald climbs toward the cloud as it runs out to the circle.
    const k = Easing.inOutQuad(this.u);
    this.position.y = lerp(1.3, c.cloudHeight * c.heraldClimb, k);
    this._heraldFx(dt);
    this._update(dt);
  }

  onImpact() {
    this._clock = 0;
    this._update(0);
  }

  onFade(dt) {
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    if (!this._slammed && this._clock >= this._slamAt()) this._slam();
    this._update(dt);
    this._updateHeld(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame — every envelope resolved from the clock and the settings */
  /* ------------------------------------------------------------------ */

  _update(dt) {
    const c = settings.downburst;
    const g = settings.global;
    const k = this._clock;
    const G = this._gatherTime();
    const D = this._dropTime();
    const slamAt = G + D;
    const hold = this._holdTime();
    const anim = g.animationSpeed;

    // Gathering, 0..1; already a little under way while the herald runs.
    const gather = k < 0 ? 0 : saturate(k / G);
    const pre = k < 0 ? this.u * 0.25 : 0;
    const drop = k < G ? 0 : saturate((k - G) / D);
    const since = this._slammed ? k - slamAt : -1;
    let fadeT = 0;
    if (this.phase === AbilityPhase.FADE) fadeT = saturate(this.fadeTime / this.fadeDuration);

    /* ---- the sun, flat, for the cloud's two-tap lighting ---- */
    const L = frame.uLightDir.value;
    this._lightXZ.set(L.x, L.z);
    if (this._lightXZ.lengthSq() > 1e-6) this._lightXZ.normalize();

    /* ---- the cloud ---- */
    const form = Math.max(pre, Easing.outCubic(gather));
    let dissolve = 0;
    if (since >= 0) dissolve = saturate((since - hold) / Math.max(0.05, c.cloudFadeTime * g.lifetime));
    dissolve = Math.max(dissolve, fadeT);
    // Spin winds up as it gathers and spikes as the column leaves it.
    const spike = k >= G ? Math.exp(-Math.max(0, k - G) * 2.5) : gather * gather;
    this._spin += (c.cloudSpin * (0.25 + 0.75 * gather) + c.cloudSpinUp * spike) * dt * anim;
    // The core sags as it fills, lurches down on the drop, and eases back up.
    const lurch = since >= 0 ? Math.exp(-since * 2.2) : Easing.inQuad(drop);
    const sag = c.cloudSag * Easing.inOutQuad(gather) * (1 - dissolve * 0.6) + c.cloudSagSlam * lurch;
    const charge = since >= 0 ? Math.exp(-since * 5) : gather * gather;
    // Sheet lightning: random strikes while it gathers, each dying in a few frames.
    this._flash *= Math.exp(-dt * 14);
    if (k >= 0 && !this._slammed && Math.random() < c.cloudFlashRate * gather * dt) {
      this._flash = 0.6 + 0.4 * Math.random();
    }
    if (since >= 0 && since < dt + 1e-4) this._flash = 1;

    const cs = this._cloudState;
    cs.form = form;
    cs.dissolve = dissolve;
    cs.spin = this._spin;
    cs.charge = charge;
    cs.flash = this._flash;
    cs.sag = sag;
    cs.seed = this._seed;
    this.cloudMaterial.userData.sync(cs);
    this.cloud.visible = form > 0.001 && dissolve < 1;

    /* ---- the funnel: reaching down, then punched by the slam ---- */
    const fs = this._funnelState;
    fs.reach = since >= 0 ? 1 : Math.pow(gather, 1.4) * 0.85 + drop * 0.15;
    let funnel = smoothstep(0, 0.4, gather);
    if (since >= 0) {
      funnel = c.funnelPunch * Math.exp(-since * 4) + Math.exp(-since * 2) * (1 - saturate(since / Math.max(0.1, hold + 0.3)));
    }
    fs.strength = funnel * (1 - fadeT);
    fs.seed = this._seed;
    this.funnelMaterial.userData.sync(fs);
    this.funnel.visible = fs.strength > 0.002;

    /* ---- the column ---- */
    this._flow += c.columnFlow * dt * anim;
    const top = c.cloudHeight - sag * 0.6;
    const bottom = k < G ? top : lerp(top, -0.3, Easing.inQuad(drop));
    let liftY = -10;
    if (since >= hold) {
      const lift = saturate((since - hold) / Math.max(0.05, c.columnFadeTime));
      liftY = lerp(-1.2, c.cloudHeight + 1.5, Easing.inQuad(lift));
    }
    const col = this._columnState;
    col.bottom = bottom;
    col.flow = this._flow;
    col.fade = k < G ? 0 : saturate(drop * 5) * (1 - fadeT);
    col.liftY = liftY;
    col.seed = this._seed;
    this.columnMaterial.userData.sync(col);
    this.column.visible = col.fade > 0.001 && liftY < c.cloudHeight + 1;

    /* ---- the floor ---- */
    const blastR = Math.max(0.5, c.zoneRadius * c.blastRadius);
    const waveT = since >= 0 ? saturate(since / Math.max(0.05, c.waveTime)) : 0;
    const wave = blastR * Easing.outCubic(waveT);
    const gs = this._groundState;
    gs.extent = blastR + 1.5;
    gs.warn = since >= 0 ? Math.exp(-since * 6) : smoothstep(0, 0.35, gather) * (0.7 + 0.3 * drop) + pre;
    gs.wave = wave;
    gs.ringLevel = since >= 0 ? 1 - smoothstep(c.ringFadeStart, 1, waveT) : 0;
    gs.scour = since >= 0 ? saturate(since / 0.15) : 0;
    gs.imprint = since >= 0 ? saturate(since / 0.08) : 0;
    gs.erode = fadeT;
    gs.seed = this._seed;
    this.groundMaterial.userData.sync(gs);
    this.ground.visible = gs.warn > 0.001 || since >= 0;

    /* ---- the rolling dust ---- */
    this._roll += c.torusRoll * (1 - 0.75 * waveT) * dt * anim;
    const settle = this._settleTime();
    const ts = this._torusState;
    ts.major = Math.max(0.2, wave * 0.94);
    ts.tube = c.torusTube + c.torusTubeGrow * Easing.outQuad(waveT);
    ts.roll = this._roll;
    let torusFade = 0;
    if (since >= 0) {
      const out = saturate((since - c.waveTime * 0.5) / Math.max(0.1, settle * c.torusLinger));
      torusFade = saturate(since / 0.06) * (1 - Easing.inQuad(out));
    }
    ts.fade = torusFade * (1 - fadeT);
    ts.thin = saturate(waveT * 0.5 + (since >= 0 ? since / Math.max(0.1, settle) : 0) * 0.5);
    ts.seed = this._seed;
    this.torusMaterial.userData.sync(ts);
    this.torus.visible = ts.fade > 0.001;

    const ls = this._lensState;
    ls.extent = blastR + 1.5;
    ls.wave = wave;
    ls.strength = since >= 0 ? Math.pow(1 - waveT, 1.5) * (1 - fadeT) : 0;
    this.lensMaterial.userData.sync(ls);
    this.lens.visible = ls.strength > 0.002;

    /* ---- particles ---- */
    this._syncParticles(c, g);
    if (k >= 0 && !this._slammed) {
      this._wispFx(dt, gather);
      this.ctx.shake.rumble(c.gatherRumble * gather * gather, dt);
    }
    if (k >= G && (!this._slammed || since < hold)) this._downFx(dt, top, bottom, c);
    if (since >= 0) {
      const sift = (1 - saturate(since / settle)) * (1 - fadeT);
      this._settleFx(dt, sift, blastR, c);
    }

    /* ---- once it has arrived, the light sits under the cloud ---- */
    // (While travelling, `position` is the herald's, placed by the base class.)
    if (k >= 0) this.position.set(this._centre.x, c.lightHeight, this._centre.z);
  }

  _syncParticles(c, g) {
    const w = this.wisps.uniforms;
    this.wisps.setGradient(getColor(c.colorWispA), getColor(c.colorWispB), getColor(c.colorWispC), getColor(c.colorWispD));
    w.uGravity.value.set(0, 0, 0);
    w.uSizeScale.value = c.wispSize * g.particleSize * 2.2;
    w.uLifeScale.value = g.particleLifetime;
    w.uSpeedScale.value = g.particleSpeed;
    w.uOpacity.value = c.wispOpacity * g.opacity;
    w.uGlow.value = 1;
    w.uTurbulence.value = 0.6 * g.turbulence;

    const s = this.streaks.uniforms;
    this.streaks.setGradient(getColor(c.colorStreakA), getColor(c.colorStreakB), getColor(c.colorStreakC), getColor(c.colorStreakD));
    s.uGravity.value.set(0, -1, 0);
    s.uSizeScale.value = c.streakSize * g.particleSize * 7;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.streakGlow * g.glow;
    s.uStretch.value = c.streakStretch;
    s.uTurbulence.value = 0.15 * g.turbulence;

    const d = this.dust.uniforms;
    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    d.uGravity.value.set(0, c.dustRise, 0);
    d.uSizeScale.value = c.dustSize * g.particleSize * 2.2;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = c.dustOpacity * g.opacity;
    d.uGlow.value = 1;
    d.uTurbulence.value = 0.5 * g.turbulence;

    const b = this.debris.uniforms;
    const debris = getColor(c.colorDebris);
    this.debris.setGradient(debris, debris, debris, debris);
    b.uGravity.value.set(0, -12, 0);
    b.uSizeScale.value = c.debrisSize * g.particleSize * 7;
    b.uLifeScale.value = g.particleLifetime;
    b.uSpeedScale.value = g.particleSpeed;
    b.uOpacity.value = g.opacity;
    b.uGlow.value = 1;
    b.uTurbulence.value = 0;
  }

  /* ------------------------------------------------------------------ */
  /* The slam                                                            */
  /* ------------------------------------------------------------------ */

  _slam() {
    const c = settings.downburst;
    const g = settings.global;
    const R = c.zoneRadius;
    const x = this._centre.x;
    const z = this._centre.z;
    this._slammed = true;

    /* ---- engine layers: the dust ring, the shock, a squashed shell of air ---- */
    this.ctx.decals.spawn(DecalType.DUSTRING, this._centre, {
      radius: R * c.dustRingRadius,
      life: c.dustRingLife,
      intensity: 1,
      growth: 0.4,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC),
      height: 0.025
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._centre, {
      radius: R * c.shockRadius * g.explosionIntensity,
      life: c.shockLife,
      width: 0.05,
      intensity: 1.2,
      colorA: getColor(c.colorRing),
      colorB: getColor(c.colorB),
      height: 0.035
    });
    this.ctx.bursts.spawn(BurstMode.AIR, _pos.copy(this._centre).setY(0.25), {
      radius: R * 0.3,
      endRadius: R * c.burstSize * g.explosionIntensity,
      life: c.burstLife,
      intensity: 1.8,
      opacity: 0.7 * g.opacity,
      squash: c.burstSquash,
      colorA: getColor(c.colorB),
      colorB: getColor(c.colorA),
      colorC: getColor(c.colorColumn)
    });

    /* ---- streaks rushing out flat along the floor ---- */
    const streaks = Math.round(c.streakCount * g.particleCount);
    for (let i = 0; i < streaks; i++) {
      const a = Math.random() * TAU;
      const r = R * (0.35 + 0.6 * Math.random());
      _pos.set(x + Math.cos(a) * r, 0.08 + Math.random() * 0.5, z + Math.sin(a) * r);
      _dir.set(Math.cos(a), 0.04, Math.sin(a));
      this._emit(this.streaks, 1, _pos, 0, _dir, c.streakSpeed, 0.35, 0.05, 0.08, 0.5, c.streakLifetime, 0.4, 0);
    }
    /* ---- dust billowing out ---- */
    const dust = Math.round(c.dustCount * g.particleCount);
    for (let i = 0; i < dust; i++) {
      const a = Math.random() * TAU;
      const r = R * (0.3 + 0.7 * Math.random());
      _pos.set(x + Math.cos(a) * r, 0.2 + Math.random() * 0.4, z + Math.sin(a) * r);
      _dir.set(Math.cos(a), 0.25, Math.sin(a));
      this._emit(this.dust, 1, _pos, 0.2, _dir, c.dustSpeed, 0.5, 0.15, 0.5, 0.5, c.dustLifetime, 0.4, 0.6);
    }
    /* ---- debris skittering ---- */
    const debris = Math.round(c.debrisCount * g.particleCount);
    for (let i = 0; i < debris; i++) {
      const a = Math.random() * TAU;
      const r = R * Math.random() * 0.9;
      _pos.set(x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r);
      _dir.set(Math.cos(a) * c.debrisSpeed, c.debrisLift * (0.3 + Math.random()), Math.sin(a) * c.debrisSpeed);
      const speed = _dir.length();
      _dir.divideScalar(Math.max(1e-4, speed));
      this._emit(this.debris, 1, _pos, 0, _dir, speed, 0.4, 0.1, 0.1, 0.6, c.debrisLifetime, 0.4, 9);
    }

    /* ---- the beat ---- */
    this.ctx.shake.add(c.impactShake * g.explosionIntensity, 5.5, 17);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * g.explosionIntensity);
    this.lightBoost = c.impactLight * g.explosionIntensity;

    this._hit(c, x, z);
  }

  /** Pressed flat in the middle, blown out and tumbling at the edge. */
  _hit(c, x, z) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const R = Math.max(0.1, c.zoneRadius);
    const reach = R * Math.max(c.edgeReach, c.pressCore);
    const found = field.findTargets(x, z, reach, this._targets);
    let slot = 0;
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      _dir.set(dummy.position.x - x, 0, dummy.position.z - z);
      const dist = _dir.length();
      if (dist < 1e-4) _dir.copy(this.direction);
      else _dir.divideScalar(dist);
      const d = dist / R;

      let mode;
      if (d <= c.pressCore) {
        // Driven into the floor: a negative lift crumples the body where it stands.
        this._force.impulse = c.pressImpulse;
        this._force.lift = -Math.abs(c.pressSlam);
        this._force.spin = 0;
        mode = MODE_PRESS;
      } else {
        // Caught by the outflow: thrown outward and tumbling, harder nearer the core.
        const k = 1 - 0.5 * saturate((d - c.pressCore) / Math.max(0.05, c.edgeReach - c.pressCore));
        this._force.impulse = c.blowImpulse * k;
        this._force.lift = c.blowLift;
        this._force.spin = c.blowSpin;
        mode = MODE_BLOW;
      }
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      if (slot < MAX_HELD) {
        const h = this._held[slot++];
        h.dummy = dummy;
        h.mode = mode;
        h.time = 0;
        h.falloff = mode === MODE_BLOW ? 1 - 0.5 * saturate((d - c.pressCore) / Math.max(0.05, c.edgeReach - c.pressCore)) : 1;
      }
    }
    this._targets.length = 0;

    // Bodies already lying in the circle are shoved out with the dust.
    const lying = field.findBodies ? field.findBodies(x, z, reach, this._bodies) : this._bodies;
    for (let f = 0; f < lying.length; f++) {
      const dummy = lying[f];
      if (dummy.alive || this._isHeld(dummy)) continue;
      const at = dummy.bodyPoint(_body);
      if (!at) continue;
      _dir.set(at.x - x, 0, at.z - z);
      const dist = _dir.length();
      if (dist < 1e-4) continue;
      _dir.divideScalar(dist);
      const k = 1 - saturate(dist / reach) * 0.6;
      dummy.shove(_dir.x * c.corpseShove * k, c.corpseShove * 0.3 * k, _dir.z * c.corpseShove * k);
    }
    this._bodies.length = 0;
  }

  _isHeld(dummy) {
    for (let i = 0; i < MAX_HELD; i++) if (this._held[i].dummy === dummy) return true;
    return false;
  }

  /** Keep pressing the middle ones down, keep carrying the edge ones out. */
  _updateHeld(dt) {
    if (!this._slammed) return;
    const c = settings.downburst;
    for (let i = 0; i < MAX_HELD; i++) {
      const h = this._held[i];
      if (!h.mode) continue;
      h.time += dt;
      const dummy = h.dummy;
      const limit = h.mode === MODE_PRESS ? this._holdTime() + c.pressHold * 0.5 : c.blowTime;
      if (h.time >= Math.max(0.01, limit) || dummy.state === 'gone') {
        dummy.release();
        h.dummy = null;
        h.mode = 0;
        continue;
      }
      this._fieldRec = h;
      if (h.mode === MODE_PRESS) {
        dummy.carry(this._field, saturate(8 * dt), saturate(6 * dt), 0);
        // Pinned: it does not start to burn away while the wind is on it.
        if (h.time < c.pressHold) dummy.hold();
      } else {
        dummy.carry(this._field, saturate(c.blowGrab * dt), saturate(c.blowGrab * 0.25 * dt), 0);
      }
      this._fieldRec = null;
    }
  }

  /**
   * The downdraft at a joint: straight down and spreading in the core, a radial
   * outflow hugging the floor at the edge. What `Dummy#carry` samples.
   */
  _windAt(x, y, z, out) {
    const c = settings.downburst;
    const h = this._fieldRec;
    let dx = x - this._centre.x;
    let dz = z - this._centre.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4) {
      dx /= d;
      dz /= d;
    } else {
      dx = this.direction.x;
      dz = this.direction.z;
    }
    if (!h || h.mode === MODE_PRESS) {
      const t = h ? saturate(h.time / Math.max(0.05, c.pressHold)) : 0;
      const down = c.pressDown * (1 - t * 0.7);
      out.set(dx * c.pressImpulse * 0.4, y > 0.12 ? -down : 0, dz * c.pressImpulse * 0.4);
      return;
    }
    // The outflow eases off over its hold, and is strongest near the floor.
    const t = saturate(h.time / Math.max(0.05, c.blowTime));
    const v = c.blowWind * h.falloff * (1 - t) * (y < 1.2 ? 1 : 0.6);
    out.set(dx * v, y < 0.5 ? 0.6 : -0.3, dz * v);
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  /** One emit, every field written — `_emit` is shared and reused. */
  _emit(system, count, position, radius, direction, speed, speedVariance, spread, size, sizeVariance, life, lifeVariance, spin) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = speedVariance;
    _emit.spread = spread;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = size;
    _emit.sizeVariance = sizeVariance;
    _emit.life = life;
    _emit.lifeVariance = lifeVariance;
    _emit.spin = spin;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    system.emit(count, _emit);
  }

  /** The herald: a knot of wind streaks running out to the circle and climbing. */
  _heraldFx(dt) {
    const c = settings.downburst;
    const g = settings.global;
    const count = Math.round(this.heraldEmitter.tick(dt, c.heraldRate) * g.particleCount);
    if (count <= 0) return;
    _dir.copy(this.direction).negate();
    _dir.y = 0.15;
    this._emit(this.streaks, count, this.position, 0.25, _dir, 4, 0.5, 0.35, 0.06, 0.5, c.streakLifetime * 0.7, 0.4, 0);
  }

  /** Cloud wisps drawn in from round the rim while it gathers, spiralling. */
  _wispFx(dt, gather) {
    const c = settings.downburst;
    const g = settings.global;
    const count = Math.round(this.wispEmitter.tick(dt, c.wispRate * (0.3 + 0.7 * gather)) * g.particleCount);
    const R = c.zoneRadius * c.cloudRadius;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const r = R * (1.0 + 0.45 * Math.random());
      _pos.set(this._centre.x + Math.cos(a) * r, c.cloudHeight + (Math.random() - 0.3) * 1.2, this._centre.z + Math.sin(a) * r);
      // Inward and round: a spiral, turning the same way the cloud does.
      _dir.set(-Math.cos(a) - Math.sin(a) * 0.8, -0.1, -Math.sin(a) + Math.cos(a) * 0.8);
      this._emit(this.wisps, 1, _pos, 0.4, _dir, c.wispInflow, 0.4, 0.15, 0.6, 0.5, c.wispLifetime, 0.4, 0.4);
    }
  }

  /** Streaks pouring down the inside of the column while it falls and holds. */
  _downFx(dt, top, bottom, c) {
    const g = settings.global;
    const count = Math.round(this.downEmitter.tick(dt, c.downRate) * g.particleCount);
    const R = c.zoneRadius * c.columnRadius;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const r = R * Math.sqrt(Math.random()) * 0.95;
      _pos.set(this._centre.x + Math.cos(a) * r, lerp(Math.max(0.3, bottom), top, Math.random()), this._centre.z + Math.sin(a) * r);
      this._emit(this.streaks, 1, _pos, 0, _down, c.downSpeed, 0.3, 0.04, 0.07, 0.5, 0.35, 0.4, 0);
    }
  }

  /** Fine dust sifting back down over the blast after the slam. */
  _settleFx(dt, strength, blastR, c) {
    const g = settings.global;
    const count = Math.round(this.settleEmitter.tick(dt, c.settleRate * strength) * g.particleCount);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const r = blastR * Math.sqrt(Math.random()) * 0.85;
      _pos.set(this._centre.x + Math.cos(a) * r, 0.6 + Math.random() * 1.6, this._centre.z + Math.sin(a) * r);
      _vel.set(Math.cos(a) * 0.3, -1, Math.sin(a) * 0.3).normalize();
      this._emit(this.dust, 1, _pos, 0.3, _vel, 0.35, 0.5, 0.3, 0.35, 0.5, c.dustLifetime, 0.4, 0.3);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    for (let i = 0; i < MAX_HELD; i++) {
      const h = this._held[i];
      if (h.mode && h.dummy) h.dummy.release();
      h.dummy = null;
      h.mode = 0;
    }
    this._fieldRec = null;
    this._clock = -1;
    this._slammed = false;
    this.cloud.visible = false;
    this.column.visible = false;
    this.funnel.visible = false;
    this.ground.visible = false;
    this.torus.visible = false;
    this.lens.visible = false;
  }

  dispose() {
    for (const geometry of [this.cloudGeometry, this.tubeGeometry, this.torusGeometry, this.quadGeometry]) {
      geometry.dispose();
    }
    for (const material of [
      this.cloudMaterial,
      this.columnMaterial,
      this.funnelMaterial,
      this.groundMaterial,
      this.torusMaterial,
      this.lensMaterial
    ]) {
      material.dispose();
    }
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('☁  Downburst');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'herald speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'heraldRate', 0, 800, 1, 'herald streaks / s');
  R(cast, c, 'heraldClimb', 0, 1, 0.01, 'herald climbs');
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('accent, hot');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'gatherTime', 0.05, 4, 0.01, 'cloud gathers over');
  R(time, c, 'dropTime', 0.02, 1, 0.01, 'column falls over');
  R(time, c, 'holdTime', 0, 3, 0.01, 'column presses for');
  R(time, c, 'columnFadeTime', 0.05, 3, 0.01, 'column lifts over');
  R(time, c, 'waveTime', 0.05, 3, 0.01, 'shock runs out over');
  R(time, c, 'cloudFadeTime', 0.05, 4, 0.01, 'cloud tears over');
  R(time, c, 'lifetime', 0.05, 8, 0.05, 'dust settles over');
  R(time, c, 'fadeTime', 0.1, 5, 0.05, 'final fade');

  const cloud = folder.addFolder('1 · Storm cloud');
  R(cloud, c, 'cloudHeight', 2, 20, 0.1, 'height (m)');
  R(cloud, c, 'cloudRadius', 0.3, 3, 0.01, 'radius (× circle)');
  R(cloud, c, 'cloudSag', 0, 5, 0.05, 'core sag (m)');
  R(cloud, c, 'cloudSagSlam', 0, 5, 0.05, 'lurch on the drop (m)');
  R(cloud, c, 'cloudSagWidth', 0.05, 1, 0.01, 'sag width');
  R(cloud, c, 'cloudBillow', 0, 2, 0.01, 'billow (m)');
  R(cloud, c, 'cloudBillowScale', 0.2, 8, 0.05, 'billow scale');
  R(cloud, c, 'cloudSpin', -4, 4, 0.01, 'spin (rad/s)');
  R(cloud, c, 'cloudSpinUp', -10, 10, 0.05, 'spin-up on the drop');
  R(cloud, c, 'cloudSwirl', 0, 10, 0.05, 'arm winding');
  R(cloud, c, 'cloudArms', 0, 8, 1, 'arms');
  R(cloud, c, 'cloudArmAmount', 0, 1, 0.01, 'arm amount');
  R(cloud, c, 'cloudScale', 0.3, 10, 0.05, 'noise scale');
  R(cloud, c, 'cloudBoil', 0, 2, 0.01, 'boil speed');
  R(cloud, c, 'cloudCover', 0, 1, 0.01, 'cover threshold');
  R(cloud, c, 'cloudEdge', 0.1, 1, 0.01, 'rim starts');
  R(cloud, c, 'cloudEdgeNoise', 0, 1.5, 0.01, 'rim raggedness');
  R(cloud, c, 'cloudOpacity', 0, 1, 0.01, 'opacity');
  R(cloud, c, 'cloudDarkCore', 0, 1, 0.01, 'dark core');
  R(cloud, c, 'cloudRimGlow', 0, 5, 0.05, 'sun-lit billows');
  R(cloud, c, 'cloudChargeGlow', 0, 8, 0.05, 'charge glow');
  R(cloud, c, 'cloudFlash', 0, 8, 0.05, 'lightning');
  R(cloud, c, 'cloudFlashRate', 0, 20, 0.1, 'lightning / s');
  cloud.addColor(c, 'colorCloudCore').name('core');
  cloud.addColor(c, 'colorCloudBody').name('body');
  cloud.addColor(c, 'colorCloudRim').name('lit rim');
  cloud.addColor(c, 'colorCloudFlash').name('lightning');
  const wisp = cloud.addFolder('Wisps');
  R(wisp, c, 'wispRate', 0, 400, 1, 'per second');
  R(wisp, c, 'wispSize', 0.05, 4, 0.05, 'size (m)');
  R(wisp, c, 'wispLifetime', 0.1, 4, 0.05, 'lifetime');
  R(wisp, c, 'wispInflow', 0, 12, 0.05, 'inflow (m/s)');
  R(wisp, c, 'wispOpacity', 0, 1, 0.01, 'opacity');
  Editor.gradient(wisp, c, 'colorWisp', 'wisp colour');

  const funnel = folder.addFolder('2 · Pressure funnel (distortion)');
  R(funnel, c, 'funnelStrength', 0, 4, 0.01, 'strength');
  R(funnel, c, 'funnelRadius', 0.1, 2, 0.01, 'radius (× circle)');
  R(funnel, c, 'funnelTwist', -6, 6, 0.05, 'twist (rad/m)');
  R(funnel, c, 'funnelScale', 0.1, 6, 0.05, 'noise scale');
  R(funnel, c, 'funnelSpeed', 0, 12, 0.05, 'churn speed');
  R(funnel, c, 'funnelPunch', 0, 8, 0.05, 'punch on the slam');

  const column = folder.addFolder('3 · Column');
  R(column, c, 'columnRadius', 0.1, 2, 0.01, 'radius (× circle)');
  R(column, c, 'columnTopScale', 0.05, 1.5, 0.01, 'pinch at the cloud');
  R(column, c, 'columnFlare', 0, 3, 0.01, 'splay at the foot');
  R(column, c, 'columnFlareHeight', 0.05, 5, 0.05, 'splay height (m)');
  R(column, c, 'columnStreaks', 2, 80, 1, 'streaks');
  R(column, c, 'columnStreakSharp', 0, 1, 0.01, 'streak sharpness');
  R(column, c, 'columnFlow', 0, 80, 0.5, 'fall speed (m/s)');
  R(column, c, 'columnOpacity', 0, 2, 0.01, 'opacity');
  R(column, c, 'columnGlow', 0, 8, 0.05, 'glow');
  R(column, c, 'columnRim', 0, 5, 0.05, 'walls');
  R(column, c, 'columnFront', 0, 10, 0.05, 'leading front');
  R(column, c, 'columnFrontWidth', 0.02, 4, 0.01, 'front width (m)');
  R(column, c, 'columnSoftFade', 0.01, 3, 0.01, 'soft fade (m)');
  column.addColor(c, 'colorColumn').name('wind');
  column.addColor(c, 'colorColumnHot').name('front');

  const ground = folder.addFolder('4 · Ground blast');
  R(ground, c, 'blastRadius', 0.5, 5, 0.05, 'runs out to (× circle)');
  R(ground, c, 'ringWidth', 0.02, 2, 0.01, 'ring width (m)');
  R(ground, c, 'ringGlow', 0, 10, 0.05, 'ring glow');
  R(ground, c, 'ringFadeStart', 0, 1, 0.01, 'ring dims from');
  R(ground, c, 'scourStreaks', 4, 200, 1, 'scour streaks');
  R(ground, c, 'scourOpacity', 0, 1, 0.01, 'scour opacity');
  R(ground, c, 'scourContrast', 0, 4, 0.05, 'scour contrast');
  R(ground, c, 'imprintOpacity', 0, 1, 0.01, 'pressed imprint');
  R(ground, c, 'warnGlow', 0, 5, 0.05, 'telegraph glow');
  R(ground, c, 'groundErode', 0, 1, 0.01, 'erodes on noise');
  ground.addColor(c, 'colorRing').name('ring');
  ground.addColor(c, 'colorScour').name('scour');
  ground.addColor(c, 'colorImprint').name('imprint');
  ground.addColor(c, 'colorWarn').name('telegraph');
  R(ground, c, 'lensStrength', 0, 5, 0.05, 'shock lens strength');
  R(ground, c, 'lensWidth', 0.05, 4, 0.01, 'shock lens width (m)');

  const torus = folder.addFolder('5 · Rolling dust');
  R(torus, c, 'torusTube', 0.05, 2, 0.01, 'tube (m)');
  R(torus, c, 'torusTubeGrow', 0, 4, 0.01, 'tube grows (m)');
  R(torus, c, 'torusSquash', 0.1, 1.5, 0.01, 'squash');
  R(torus, c, 'torusRoll', -20, 20, 0.1, 'roll (rad/s)');
  R(torus, c, 'torusBillow', 0, 1, 0.01, 'lumpiness');
  R(torus, c, 'torusScale', 0.2, 8, 0.05, 'lumps');
  R(torus, c, 'torusDetail', 0.2, 10, 0.05, 'detail');
  R(torus, c, 'torusOpacity', 0, 1, 0.01, 'opacity');
  R(torus, c, 'torusSoftFade', 0.01, 3, 0.01, 'soft fade (m)');
  R(torus, c, 'torusLight', 0, 1, 0.01, 'sun shading');
  R(torus, c, 'torusLinger', 0.05, 1.5, 0.01, 'lingers (× settle)');
  torus.addColor(c, 'colorTorusLit').name('lit');
  torus.addColor(c, 'colorTorusShade').name('shade');

  const parts = folder.addFolder('6 · Particles');
  R(parts, c, 'streakCount', 0, 1000, 1, 'radial streaks');
  R(parts, c, 'streakSpeed', 0, 40, 0.1, 'streak speed');
  R(parts, c, 'streakSize', 0.01, 0.4, 0.005, 'streak size');
  R(parts, c, 'streakLifetime', 0.05, 2, 0.01, 'streak lifetime');
  R(parts, c, 'streakStretch', 0, 3, 0.01, 'streak stretch');
  R(parts, c, 'streakGlow', 0, 8, 0.05, 'streak glow');
  Editor.gradient(parts, c, 'colorStreak', 'streak colour');
  R(parts, c, 'downRate', 0, 3000, 10, 'column streaks / s');
  R(parts, c, 'downSpeed', 0, 60, 0.5, 'column streak speed');
  R(parts, c, 'dustCount', 0, 300, 1, 'dust billows');
  R(parts, c, 'dustSpeed', 0, 20, 0.1, 'dust speed');
  R(parts, c, 'dustSize', 0.05, 3, 0.05, 'dust size');
  R(parts, c, 'dustLifetime', 0.1, 6, 0.05, 'dust lifetime');
  R(parts, c, 'dustRise', -3, 3, 0.05, 'dust rise');
  R(parts, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  R(parts, c, 'settleRate', 0, 200, 1, 'settling dust / s');
  Editor.gradient(parts, c, 'colorDust', 'dust colour');
  R(parts, c, 'debrisCount', 0, 300, 1, 'debris');
  R(parts, c, 'debrisSpeed', 0, 30, 0.1, 'debris speed');
  R(parts, c, 'debrisLift', 0, 15, 0.1, 'debris lift');
  R(parts, c, 'debrisSize', 0.01, 0.5, 0.005, 'debris size');
  R(parts, c, 'debrisLifetime', 0.1, 4, 0.05, 'debris lifetime');
  parts.addColor(c, 'colorDebris').name('debris');

  const slam = folder.addFolder('7 · The slam');
  R(slam, c, 'impactShake', 0, 2, 0.01, 'shake');
  R(slam, c, 'gatherRumble', 0, 2, 0.01, 'rumble while gathering');
  R(slam, c, 'impactFlash', 0, 1, 0.01, 'flash');
  slam.addColor(c, 'colorFlash').name('flash');
  R(slam, c, 'impactLight', 0, 80, 0.5, 'light punch');
  R(slam, c, 'burstSize', 0, 4, 0.01, 'air shell (× circle)');
  R(slam, c, 'burstLife', 0.05, 2, 0.01, 'air shell life');
  R(slam, c, 'burstSquash', 0.05, 1.5, 0.01, 'air shell squash');
  R(slam, c, 'dustRingRadius', 0.2, 5, 0.05, 'dust ring (× circle)');
  R(slam, c, 'dustRingLife', 0.1, 6, 0.05, 'dust ring life');
  R(slam, c, 'shockRadius', 0.2, 6, 0.05, 'shock ring (× circle)');
  R(slam, c, 'shockLife', 0.05, 3, 0.01, 'shock ring life');

  const hit = slam.addFolder('Bodies');
  R(hit, c, 'pressCore', 0, 1.5, 0.01, 'pressed inside (× circle)');
  R(hit, c, 'pressSlam', 0, 25, 0.1, 'slammed down (m/s)');
  R(hit, c, 'pressImpulse', 0, 10, 0.05, 'skid outward (m/s)');
  R(hit, c, 'pressHold', 0, 4, 0.05, 'held down for');
  R(hit, c, 'pressDown', 0, 15, 0.05, 'downdraft (m/s)');
  R(hit, c, 'edgeReach', 0.5, 3, 0.01, 'outflow reach (× circle)');
  R(hit, c, 'blowImpulse', 0, 30, 0.1, 'blown out (m/s)');
  R(hit, c, 'blowLift', 0, 15, 0.1, 'lift');
  R(hit, c, 'blowSpin', 0, 6, 0.05, 'tumble');
  R(hit, c, 'blowWind', 0, 30, 0.1, 'outflow (m/s)');
  R(hit, c, 'blowTime', 0, 4, 0.05, 'outflow holds for');
  R(hit, c, 'blowGrab', 0, 20, 0.1, 'outflow grip');
  R(hit, c, 'corpseShove', 0, 20, 0.1, 'shoves the fallen (m/s)');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 15, 0.05, 'height (m)');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'lightning flicker');
}
