import { DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { createCrawlGeometry, createPetalGeometry, createQuadGeometry } from '../../assets/codex/VoidBloomGeometry.js';
import {
  createPetalMaterial,
  createThroatMaterial,
  createVeinsMaterial,
  createSwirlMaterial,
  createSeedMaterial,
  createVoidCoreMaterial,
  createCrawlMaterial
} from '../../materials/codex/VoidBloomMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'voidbloom';

const TAU = Math.PI * 2;
const MAX_PETALS = 10;
const MAX_GRIPS = 12;
const MAX_PULL = 8;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _at = new Vector3();
const _hand = new Vector3();
const _one = new Vector3(1, 1, 1);
const _quat = new Quaternion();
const _mat = new Matrix4();
const _up = new Vector3(0, 1, 0);

/**
 * VOID BLOOM — a black flower that opens on the circle and swallows it.
 *
 * A zone cast. A dark seed with violet rays is lobbed to the circle and
 * drops into the floor; root-like veins of light **spread** out from where it
 * fell. Then a **bud bursts** up out of the floor — tall black petals pressed
 * together, curling in at the tips — and **opens**: the petals lean out and
 * curl back like a lily, three and a half metres across, black-violet flesh
 * with glowing veins and bright white-violet rims. At its heart is the
 * **throat**, a spiral of violet light winding down into black. The bloom
 * **pulls**: everything in the circle is knocked off its feet and dragged
 * round and in, the veins on the petals and on the floor pulsing *toward*
 * the throat, motes and black smoke streaming in. What reaches the throat
 * goes down it. Then the petals **snap shut**, clenched, with a crack of
 * violet light — whatever was still inside is crushed — and the closed bud
 * **sinks** back into the floor, leaving the vein stain to fade.
 *
 * Not the Dark Matter Well: that is a sheet in the floor that drowns from the
 * rim in; this is a thing that stands up out of the floor, opens, and pulls
 * to its centre.
 *
 * ## Layers (each a folder in the editor)
 *
 *   0. **the crawl** (`createCrawlMaterial`) — the travel: a dark ribbon of
 *      void surging down the floor from the caster's feet under the seed,
 *      violet filaments pulsing toward the circle, a glowing head, black
 *      smoke shed from its head and the seed. It stays, feeding the bloom,
 *      and is eaten from the caster's end after the snap.
 *   1. **the seed** — a dark billboard with violet rays on a low arc.
 *   2. **the petals** (`createPetalMaterial`) — an `InstancedMesh` of one grid
 *      bent in the vertex stage; one uniform (`uOpen`) carries it from bud to
 *      lily to clench.
 *   3. **the throat** — a spiral disc with a wide black centre, and its
 *      swirl on `LAYER.DISTORTION`; above it the **void core**
 *      (`createVoidCoreMaterial`), an opaque writhing black mass in the mouth
 *      of the bloom with only a thin violet event-horizon rim — the dark
 *      heart that eats light. It swells while it feeds and is swallowed by
 *      the snap.
 *   4. **the veins** — a spreading stain with inward-pulsing veins.
 *   5. **motes & smoke** — additive motes and non-additive smoke drawn in on
 *      a closing spiral (the particle swirl with negative expansion).
 *   6. **burst, snap & sink** — sparks and a knock as it bursts out; at the
 *      snap a flash, an AIR shell, a SHOCKWAVE, sparks, light; a SCORCH left.
 *   7. **the pull** — `handlesOwnHits`. A body in the circle is taken while
 *      the bloom is open, dragged on a spiral to the throat, lowered through
 *      the floor (`Dummy#sink`) and consumed.
 */
export class VoidBloomAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Petals drawn. HUD readout only. */
  get instanceCount() {
    return this.petalMesh.visible ? this.petalMesh.count : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.petalGeometry = createPetalGeometry(14, 48);
    this.quadGeometry = createQuadGeometry();

    this.veinsMaterial = createVeinsMaterial();
    this.veins = this._mesh(this.quadGeometry, this.veinsMaterial, LAYER.VFX, 2);
    this.throatMaterial = createThroatMaterial();
    this.throat = this._mesh(this.quadGeometry, this.throatMaterial, LAYER.VFX, 3);

    this.petalMaterial = createPetalMaterial();
    this.petalMesh = new InstancedMesh(this.petalGeometry, this.petalMaterial, MAX_PETALS);
    this.petalMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.petalMesh.layers.set(LAYER.VFX);
    this.petalMesh.frustumCulled = false;
    this.petalMesh.renderOrder = 6;
    this.petalMesh.visible = false;
    this.group.add(this.petalMesh);

    this.swirlMaterial = createSwirlMaterial();
    this.swirl = this._mesh(this.quadGeometry, this.swirlMaterial, LAYER.DISTORTION, 0);
    this.seedMaterial = createSeedMaterial();
    this.seed = this._mesh(this.quadGeometry, this.seedMaterial, LAYER.VFX, 14);

    this.crawlGeometry = createCrawlGeometry(180, 6);
    this.crawlMaterial = createCrawlMaterial();
    this.crawl = this._mesh(this.crawlGeometry, this.crawlMaterial, LAYER.VFX, 1);
    this.coreGeometry = new IcosahedronGeometry(1, 5);
    this.coreMaterial = createVoidCoreMaterial();
    this.core = this._mesh(this.coreGeometry, this.coreMaterial, LAYER.VFX, 7);

    this._centre = new Vector3();
    this._petalState = { length: 3, open: 0, rise: 0, sink: 0, flow: 0, flare: 0 };
    this._throatState = { center: this._centre, size: 1, spin: 0, fade: 0 };
    this._veinsState = { center: this._centre, size: 5, reach: 0, flow: 0, erode: 0, seed: 0 };
    this._swirlState = { center: this._centre, size: 4, strength: 0 };
    this._seedState = { center: new Vector3(), size: 0.4, fade: 1 };
    this._crawlState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      front: 0,
      seed: 0,
      flow: 0,
      erode: 0
    };
    this._coreState = { center: new Vector3(), radius: 0, spin: 0, flare: 0 };

    this._seed = 0;
    this._yaw = 0;
    this._open = 0;
    this._snapped = false;
    this._sproutDone = false;

    this._grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) this._grips.push({ dummy: null, time: 0, down: false });
    this._gripCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._flow = { vx: 0, vy: 0, vz: 0 };
    this._field = (x, y, z, out) => out.set(this._flow.vx, this._flow.vy, this._flow.vz);
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
    this.motes = particles.get('voidbloom.motes', {
      capacity: 2600,
      shape: ParticleShape.SOFT,
      additive: true,
      swirl: true,
      softFade: 0.15
    });
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.4;
    this.motes.uniforms.uEndSize.value = 0.25;
    this.motes.uniforms.uDrag.value = 0.4;

    this.smoke = particles.get('voidbloom.smoke', {
      capacity: 800,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 0.8
    });
    this.smoke.uniforms.uSizeIn.value = 0.2;
    this.smoke.uniforms.uFadeIn.value = 0.15;
    this.smoke.uniforms.uFadeOut.value = 0.5;
    this.smoke.uniforms.uEndSize.value = 1.4;
    this.smoke.uniforms.uDrag.value = 1.0;

    this.sparks = particles.get('voidbloom.sparks', {
      capacity: 1000,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.55;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.2;

    this.moteEmitter = new RateEmitter();
    this.smokeEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _beats() {
    const c = settings[ID];
    const sprout = Math.max(0.02, c.sproutTime);
    const open = sprout + Math.max(0.02, c.openTime);
    const pull = open + Math.max(0.05, c.pullTime);
    const snap = pull + Math.max(0.02, c.closeTime);
    const hold = snap + Math.max(0, c.holdClosed);
    return { sprout, open, pull, snap, hold, end: hold + Math.max(0.05, c.sinkTime) };
  }

  get impactDuration() {
    return Math.max(0.1, this._beats().end * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 7.7) * Math.sin(this.age * 2.9 + 0.5));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.moteEmitter.reset();
    this.smokeEmitter.reset();
    this._releaseGrips();
    this._seed = Math.random() * 100;
    this._yaw = Math.random() * TAU;
    this._open = 0;
    this._snapped = false;
    this._sproutDone = false;

    this.pointAt(1, this._centre);
    this._centre.y = 0;

    const ps = this._petalState;
    ps.open = 0;
    ps.rise = 0;
    ps.sink = 0;
    ps.flow = 0;
    ps.flare = 0;
    this._throatState.spin = 0;
    this._throatState.fade = 0;
    this._veinsState.seed = this._seed;
    this._veinsState.reach = 0;
    this._veinsState.flow = 0;
    this._veinsState.erode = 0;
    this._swirlState.strength = 0;
    this._seedState.fade = 1;
    this._crawlState.seed = this._seed;
    this._crawlState.flow = 0;
    this._crawlState.erode = 0;
    this._crawlState.front = 0;
    this._coreState.radius = 0;
    this._coreState.spin = 0;
    this._coreState.flare = 0;

    this.seed.visible = true;
    this.crawl.visible = true;
    this.core.visible = false;
    this.petalMesh.visible = false;
    this.throat.visible = false;
    this.veins.visible = false;
    this.swirl.visible = false;
    this._syncParticles();
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

  _syncParticles() {
    const c = settings[ID];
    const g = settings.global;
    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const m = this.motes.uniforms;
    m.uGravity.value.set(0, -0.2, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = g.opacity;
    m.uGlow.value = c.moteGlow * g.glow;
    m.uTurbulence.value = 0.3 * g.turbulence;
    m.uSwirl.value = 2.2;
    m.uSwirlExpand.value = -0.95;

    this.smoke.setGradient(getColor(c.colorSmokeA), getColor(c.colorSmokeB), getColor(c.colorSmokeC), getColor(c.colorSmokeD));
    const s = this.smoke.uniforms;
    s.uGravity.value.set(0, -0.3, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = c.smokeOpacity * g.opacity;
    s.uTurbulence.value = 0.5 * g.turbulence;
    s.uSwirl.value = 1.8;
    s.uSwirlExpand.value = -0.9;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const k = this.sparks.uniforms;
    k.uGravity.value.set(0, -c.sparkGravity, 0);
    k.uStretch.value = c.sparkStretch;
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uGlow.value = c.sparkGlow * g.glow;
    k.uTurbulence.value = 0.2 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the seed                                                   */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._seedState;
    _hand.copy(this.origin).addScaledVector(this.direction, c.handForward).setY(c.handHeight);
    _pos.copy(this._centre).setY(0.15);
    st.center.lerpVectors(_hand, _pos, this.u);
    st.center.y += c.arcHeight * Math.sin(Math.PI * this.u);
    st.size = c.seedSize * lerp(0.4, 1, saturate(this.age / 0.12));
    st.fade = 1;
    this.seedMaterial.userData.sync(st);
    this._syncCrawl(dt, this.front, 0);
    this._syncParticles();
    this._trailFx(dt, st.center);
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * 0.3) * g.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _emit.position = st.center;
      _emit.radius = c.seedSize * 0.4;
      _emit.speed = 0.3;
      _emit.spread = 1;
      _emit.size = c.moteSize;
      _emit.life = c.moteLife * 0.5;
      this.motes.emit(n, _emit);
    }
    this.position.copy(st.center);
  }

  /** The crawl down the cast line, up to `front` metres, eaten by `erode`. */
  _syncCrawl(dt, front, erode) {
    const c = settings[ID];
    const g = settings.global;
    const cs = this._crawlState;
    const start = Math.max(0, c.crawlStart);
    cs.start.copy(this.origin).addScaledVector(this.direction, start);
    cs.dir.copy(this.direction);
    cs.side.copy(this.side);
    cs.length = Math.max(0.1, this.length - start - c.petalBase);
    cs.front = front - start;
    cs.flow += c.pulseSpeed * 1.4 * dt * g.animationSpeed;
    cs.erode = erode;
    this.crawlMaterial.userData.sync(cs);
    this.crawl.visible = erode < 0.999 && cs.front > 0;
  }

  /** Black smoke and violet motes shed by the seed and the crawl's head. */
  _trailFx(dt, seedAt) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.smokeEmitter.tick(dt, c.crawlSmokeRate) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.smokeSize * 0.7;
    _emit.life = c.smokeLife * 0.6;
    _emit.speed = 0.4;
    _emit.spread = 1;
    _emit.spin = 0.5;
    const head = Math.max(0, this.front - 0.4);
    for (let i = 0; i < n; i++) {
      if (i & 1) {
        _emit.position = _pos.copy(seedAt);
        _emit.radius = c.seedSize * 0.5;
      } else {
        this.pointAt(saturate(head / this.length), _pos);
        _pos.addScaledVector(this.side, (Math.random() - 0.5) * c.crawlWidth).setY(0.15);
        _emit.position = _pos;
        _emit.radius = 0.2;
      }
      this.smoke.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Impact — sprout, open, pull, snap, sink                             */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    this.ctx.decals.spawn(DecalType.RIPPLE, this._centre, {
      radius: c.zoneRadius * 0.6,
      life: 0.6,
      width: 0.05,
      intensity: 0.8,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.veins.visible = true;
    this.petalMesh.visible = true;
    this.lightBoost = c.lightIntensity * 0.5;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const B = this._beats();
    const R = c.zoneRadius;
    const tau = t <= 1 ? (t * this.impactDuration) / Math.max(0.01, g.lifetime) : B.end;
    const ft = t > 1 ? saturate(t - 1) : 0;

    /* the bloom's shape over time */
    const rise = Easing.outBack(saturate(tau / B.sprout));
    let open;
    if (tau < B.sprout) open = 0;
    else if (tau < B.open) open = Easing.outCubic((tau - B.sprout) / (B.open - B.sprout));
    else if (tau < B.pull) open = 1;
    else if (tau < B.snap) open = lerp(1, c.clench, Easing.inCubic((tau - B.pull) / (B.snap - B.pull)));
    else open = c.clench;
    this._open = open;
    const sinkK = Easing.inQuad(saturate((tau - B.hold) / (B.end - B.hold)));
    const L = R * c.petalReach;

    if (!this._sproutDone && tau > B.sprout * 0.25) this._sprout();
    if (!this._snapped && tau >= B.snap) this._snap();
    const since = this._snapped ? tau - B.snap : 0;

    /* integrated phases */
    const ps = this._petalState;
    ps.flow += c.pulseSpeed * dt * g.animationSpeed;
    this._veinsState.flow += c.pulseSpeed * 0.7 * dt * g.animationSpeed;
    this._throatState.spin += c.throatSpin * dt * g.animationSpeed * (0.3 + saturate(open));

    /* the petals */
    ps.length = L;
    ps.open = open;
    ps.rise = rise;
    ps.sink = sinkK * L * 1.3;
    ps.flare = this._snapped ? Math.exp(-since * 6) : 0;
    this.petalMaterial.userData.sync(ps);
    const N = Math.max(3, Math.min(MAX_PETALS, Math.round(c.petals)));
    for (let i = 0; i < N; i++) {
      const a = this._yaw + (i * TAU) / N + 0.12 * Math.sin(i * 2.7 + this._seed);
      // Rotate local +X onto the bearing `a`, about the vertical.
      _quat.setFromAxisAngle(_up, -a);
      _mat.compose(this._centre, _quat, _one);
      this.petalMesh.setMatrixAt(i, _mat);
    }
    this.petalMesh.count = N;
    this.petalMesh.instanceMatrix.needsUpdate = true;
    this.petalMesh.visible = t <= 1;

    /* the throat */
    const ts = this._throatState;
    ts.size = c.throatRadius * smoothstep(0, 1, saturate(open)) * (1 - sinkK);
    ts.fade = saturate(open * 2) * (1 - sinkK);
    this.throat.visible = ts.size > 0.02 && ts.fade > 0.01;
    this.throatMaterial.userData.sync(ts);

    const sw = this._swirlState;
    sw.size = R * 0.9;
    sw.strength = saturate(open) * (tau < B.snap ? 1 : 0);
    this.swirl.visible = sw.strength > 0.01;
    this.swirlMaterial.userData.sync(sw);

    /* the veins on the floor */
    const vs = this._veinsState;
    vs.size = R * 1.1;
    vs.reach = Easing.outCubic(saturate(tau / (B.open * 0.9)));
    vs.erode = smoothstep(0.05, 1, ft);
    this.veins.visible = vs.erode < 0.999;
    this.veinsMaterial.userData.sync(vs);

    /* the seed drops in */
    const ss = this._seedState;
    ss.center.copy(this._centre).setY(0.15 - tau);
    ss.fade = 1 - saturate(tau / 0.15);
    this.seed.visible = ss.fade > 0.01;
    if (this.seed.visible) this.seedMaterial.userData.sync(ss);

    /* the crawl stays, feeding the bloom, and is eaten after the snap */
    const crawlErode = this._snapped ? saturate(since / Math.max(0.05, c.crawlFade)) : 0;
    this._syncCrawl(dt, this.length + 1, crawlErode);

    /* the void core: swells while it feeds, is swallowed by the snap */
    const co = this._coreState;
    const feed = saturate((tau - B.open) / Math.max(0.05, B.pull - B.open));
    const opened = smoothstep(0, 1, saturate(open));
    let coreR = c.coreSize * opened * (0.8 + 0.3 * feed);
    if (this._snapped) coreR = c.coreSize * 1.1 * (1 - Easing.inCubic(saturate(since / Math.max(0.05, c.closeTime + 0.12))));
    coreR *= 1 - sinkK;
    co.radius = coreR;
    co.spin += c.throatSpin * dt * g.animationSpeed * 2;
    co.flare = this._snapped ? Math.exp(-since * 9) : 0;
    co.center.copy(this._centre).setY(c.coreHeight * (0.45 + 0.55 * opened) - sinkK * L);
    this.coreMaterial.userData.sync(co);
    this.core.visible = t <= 1 && coreR > 0.02;

    /* particles */
    this._syncParticles();
    if (t <= 1 && tau > B.sprout && tau < B.snap) this._pullFx(dt, saturate(open));

    /* the pull */
    if (t <= 1 && open > 0.5 && tau < B.snap) this._capture();
    this._drag(dt);

    this.position.copy(this._centre);
    this.position.y = 1.0 + 0.8 * saturate(open);
    if (t <= 1 && tau < B.snap) this.ctx.shake.rumble(0.05 * saturate(open), dt);
  }

  /** The bud bursts out of the floor. */
  _sprout() {
    const c = settings[ID];
    const g = settings.global;
    this._sproutDone = true;
    this._resetEmit(frame.uTime.value);
    _pos.copy(this._centre).setY(0.1);
    _emit.position = _pos;
    _emit.radius = c.petalBase;
    _emit.direction = _up;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.7;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    this.sparks.emit(Math.round(c.sproutDebris * g.particleCount), _emit);
    this.ctx.decals.spawn(DecalType.CRACK, this._centre, {
      radius: c.petalBase * 4,
      life: this.impactDuration + this.fadeDuration,
      intensity: 0.8,
      colorA: getColor(c.colorStain),
      colorB: getColor(c.colorVein)
    });
    this.ctx.shake.add(c.sproutShake * g.explosionIntensity, 6, 14);
    this.lightBoost = c.lightIntensity * 0.8;
  }

  /** Motes and smoke drawn in on a closing spiral. */
  _pullFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const R = c.zoneRadius;
    const time = frame.uTime.value;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength) * g.particleCount);
    if (n > 0) {
      this._resetEmit(time);
      _emit.anchor = this._centre;
      _emit.size = c.moteSize;
      _emit.life = c.moteLife;
      _emit.speed = 1.2;
      _emit.spread = 0.3;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = R * (0.45 + 0.6 * Math.random());
        _pos.set(this._centre.x + Math.cos(a) * r, 0.1 + Math.random() * 1.6, this._centre.z + Math.sin(a) * r);
        _dir.set(-Math.cos(a), -0.1, -Math.sin(a));
        _emit.position = _pos;
        _emit.direction = _dir;
        this.motes.emit(1, _emit);
      }
    }
    const s = Math.round(this.smokeEmitter.tick(dt, c.smokeRate * strength) * g.particleCount);
    if (s > 0) {
      this._resetEmit(time);
      _emit.anchor = this._centre;
      _emit.size = c.smokeSize;
      _emit.life = c.smokeLife;
      _emit.speed = 0.8;
      _emit.spread = 0.4;
      _emit.spin = 0.6;
      for (let i = 0; i < s; i++) {
        const a = Math.random() * TAU;
        const r = c.throatRadius * (1 + Math.random());
        _pos.set(this._centre.x + Math.cos(a) * r, 0.2 + Math.random() * 0.6, this._centre.z + Math.sin(a) * r);
        _dir.set(-Math.cos(a), -0.2, -Math.sin(a));
        _emit.position = _pos;
        _emit.direction = _dir;
        this.smoke.emit(1, _emit);
      }
    }
  }

  /** The petals snap shut. */
  _snap() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._snapped = true;
    _pos.copy(this._centre).setY(1.2);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: 0.3,
      endRadius: c.zoneRadius * c.burstSize * power,
      life: 0.45,
      intensity: c.burstIntensity,
      opacity: 0.55,
      fresnel: 2.2,
      displace: 0.35,
      turbulence: 1.1,
      squash: 0.8,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._centre, {
      radius: c.zoneRadius * c.shockRadius * power,
      life: 0.55,
      width: 0.06,
      intensity: 1.2,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.SCORCH, this._centre, {
      radius: c.throatRadius * 1.6,
      life: this.fadeDuration + c.sinkTime + c.holdClosed,
      intensity: 1,
      colorA: getColor(c.colorStain),
      colorB: getColor(c.colorVein)
    });
    this._resetEmit(frame.uTime.value);
    _pos.copy(this._centre).setY(2.2);
    _emit.position = _pos;
    _emit.radius = 0.4;
    _emit.direction = _up;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 1.1;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    this.sparks.emit(Math.round(c.snapSparks * g.particleCount), _emit);
    this.ctx.shake.add(c.snapShake * power, 1 / Math.max(0.05, c.shakeDuration), 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.snapFlash * power);
    this.lightBoost = c.lightIntensity * c.snapLight * power;
    // Whatever was still inside is crushed and goes down with it.
    for (let i = 0; i < this._gripCount; i++) this._grips[i].down = true;
  }

  /* ------------------------------------------------------------------ */
  /* The pull                                                            */
  /* ------------------------------------------------------------------ */

  _gripOf(dummy) {
    for (let i = 0; i < this._gripCount; i++) if (this._grips[i].dummy === dummy) return this._grips[i];
    return null;
  }

  _capture() {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings[ID];
    const g = settings.global;
    const found = field.findBodies(this._centre.x, this._centre.z, c.zoneRadius, this._found);
    this._force.impulse = c.gripImpulse * g.explosionIntensity;
    this._force.lift = c.gripLift * g.explosionIntensity;
    this._force.spin = c.gripSpin;
    for (const dummy of found) {
      if (this._gripCount >= MAX_GRIPS) break;
      if (this._gripOf(dummy)) continue;
      if (dummy.alive) {
        _dir.set(this._centre.x - dummy.position.x, 0, this._centre.z - dummy.position.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        else _dir.normalize();
        if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      } else {
        const at = dummy.bodyPoint(_at);
        if (!at || at.y < -0.3) continue;
      }
      const slot = this._grips[this._gripCount++];
      slot.dummy = dummy;
      slot.time = 0;
      slot.down = false;
    }
  }

  /** Round and in to the throat; down it once there. */
  _drag(dt) {
    if (dt <= 0) return;
    const c = settings[ID];
    const g = settings.global;
    const grab = saturate(c.gripGrab * dt);
    const f = this._flow;
    for (let i = this._gripCount - 1; i >= 0; i--) {
      const slot = this._grips[i];
      const dummy = slot.dummy;
      const at = dummy && !dummy.finished ? dummy.bodyPoint(_at) : null;
      if (!at) {
        this._dropGrip(i);
        continue;
      }
      slot.time += dt;
      const dx = this._centre.x - at.x;
      const dz = this._centre.z - at.z;
      const d = Math.max(0.05, Math.hypot(dx, dz));
      if (d < c.throatRadius * 0.55) slot.down = true;
      const wound = Easing.outCubic(saturate(slot.time / 0.35));
      const pull = c.pullSpeed * wound * (slot.down ? 0.4 : 1);
      const omega = c.pullSwirl * g.animationSpeed;
      let vx = (dx / d) * pull + (-dz / d) * omega * Math.min(d, 2.5);
      let vz = (dz / d) * pull + (dx / d) * omega * Math.min(d, 2.5);
      const sp = Math.hypot(vx, vz);
      if (sp > MAX_PULL) {
        vx *= MAX_PULL / sp;
        vz *= MAX_PULL / sp;
      }
      f.vx = vx;
      f.vz = vz;
      if (slot.down) {
        dummy.sink(c.consumeDepth + 1.5);
        f.vy = -c.swallowSpeed;
        if (at.y < 0) dummy.consume(saturate(-at.y / Math.max(0.1, c.consumeDepth)));
      } else {
        f.vy = c.pullLift * wound;
      }
      dummy.carry(this._field, grab * wound, grab * wound, slot.down ? 0 : 0.4 * wound);
      dummy.hold();
    }
  }

  _dropGrip(index) {
    const last = this._gripCount - 1;
    const slot = this._grips[index];
    slot.dummy?.release();
    this._grips[index] = this._grips[last];
    this._grips[last] = slot;
    slot.dummy = null;
    slot.time = 0;
    slot.down = false;
    this._gripCount = last;
  }

  _releaseGrips() {
    for (let i = 0; i < this._gripCount; i++) {
      this._grips[i].dummy?.release();
      this._grips[i].dummy = null;
    }
    this._gripCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.seed.visible = false;
    this.crawl.visible = false;
    this.core.visible = false;
    this.petalMesh.visible = false;
    this.throat.visible = false;
    this.veins.visible = false;
    this.swirl.visible = false;
    this._releaseGrips();
  }

  dispose() {
    this.petalGeometry.dispose();
    this.quadGeometry.dispose();
    this.petalMaterial.dispose();
    this.throatMaterial.dispose();
    this.veinsMaterial.dispose();
    this.swirlMaterial.dispose();
    this.seedMaterial.dispose();
    this.crawlGeometry.dispose();
    this.crawlMaterial.dispose();
    this.coreGeometry.dispose();
    this.coreMaterial.dispose();
    this.petalMesh.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('❀  Void Bloom');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'seed speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'stain fades over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'pull radius (m)');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');

  const seed = folder.addFolder('1 · Seed');
  R(seed, c, 'handForward', -1, 2, 0.01, 'forward (m)');
  R(seed, c, 'handHeight', 0.2, 3, 0.01, 'height (m)');
  R(seed, c, 'arcHeight', 0, 8, 0.05, 'arc (m)');
  R(seed, c, 'seedSize', 0.05, 2, 0.01, 'size (m)');
  R(seed, c, 'crawlWidth', 0.05, 3, 0.01, 'crawl width (m)');
  R(seed, c, 'crawlStart', 0, 3, 0.01, 'crawl starts (m from caster)');
  R(seed, c, 'crawlMeander', 0, 2, 0.01, 'crawl meander (m)');
  R(seed, c, 'crawlGlow', 0, 8, 0.05, 'crawl glow');
  R(seed, c, 'crawlFade', 0.05, 3, 0.01, 'crawl eaten over (s)');
  R(seed, c, 'crawlSmokeRate', 0, 300, 1, 'trail smoke/second');

  const petals = folder.addFolder('2 · Petals');
  R(petals, c, 'petals', 3, MAX_PETALS, 1, 'petals');
  R(petals, c, 'petalReach', 0.1, 1.5, 0.01, 'length (× radius)');
  R(petals, c, 'petalWidth', 0.05, 3, 0.01, 'half-width (m)');
  R(petals, c, 'petalCup', -1, 2, 0.01, 'cup');
  R(petals, c, 'petalBase', 0, 2, 0.01, 'root radius (m)');
  R(petals, c, 'budAngle', 0, 2.5, 0.01, 'bud stands at (rad)');
  R(petals, c, 'budCurl', -2, 3, 0.01, 'bud curls in (rad)');
  R(petals, c, 'openAngle', -0.5, 2, 0.01, 'open leans at (rad)');
  R(petals, c, 'openCurl', -3, 2, 0.01, 'open curls (rad)');
  R(petals, c, 'clench', -1, 0.5, 0.01, 'snaps past shut');
  R(petals, c, 'breath', 0, 0.5, 0.005, 'breathes (rad)');
  R(petals, c, 'sproutTime', 0.02, 2, 0.01, 'bursts up over (s)');
  R(petals, c, 'openTime', 0.02, 3, 0.01, 'opens over (s)');
  R(petals, c, 'pullTime', 0.05, 6, 0.01, 'stays open (s)');
  R(petals, c, 'closeTime', 0.02, 1, 0.005, 'snaps shut over (s)');
  R(petals, c, 'holdClosed', 0, 2, 0.01, 'stands shut (s)');
  R(petals, c, 'sinkTime', 0.05, 3, 0.01, 'sinks over (s)');
  R(petals, c, 'veinCount', 1, 20, 0.5, 'side veins');
  R(petals, c, 'veinGlow', 0, 10, 0.05, 'vein glow');
  R(petals, c, 'edgeGlow', 0, 10, 0.05, 'rim glow');
  R(petals, c, 'petalRim', 0, 8, 0.05, 'fresnel');
  R(petals, c, 'pulseSpeed', 0, 6, 0.05, 'vein pulses/second');
  R(petals, c, 'petalRampLight', 0, 1.2, 0.01, 'sunlight carries ramp');
  R(petals, c, 'petalRimWidth', 0.01, 0.4, 0.005, 'rim width');
  R(petals, c, 'petalSpecular', 0, 3, 0.01, 'sheen');
  petals.addColor(c, 'colorPetal').name('deep');
  petals.addColor(c, 'colorPetalDeep').name('deep, mottle');
  petals.addColor(c, 'colorPetalBody').name('body (sunlit)');
  petals.addColor(c, 'colorVein').name('veins');
  petals.addColor(c, 'colorRim').name('rim');

  const throat = folder.addFolder('3 · Throat');
  R(throat, c, 'throatRadius', 0.1, 4, 0.01, 'radius (m)');
  R(throat, c, 'throatArms', 1, 12, 1, 'spiral arms');
  R(throat, c, 'throatTwist', 0, 6, 0.01, 'twist');
  R(throat, c, 'throatSpin', -4, 4, 0.01, 'spin (turns/s)');
  R(throat, c, 'throatGlow', 0, 10, 0.05, 'glow');
  R(throat, c, 'swirlStrength', 0, 4, 0.01, 'light swirl');
  R(throat, c, 'throatHole', 0, 1, 0.01, 'black centre (× radius)');
  throat.addColor(c, 'colorThroatCore').name('core');
  R(throat, c, 'coreSize', 0, 2.5, 0.01, 'void core radius (m)');
  R(throat, c, 'coreHeight', 0, 4, 0.01, 'void core height (m)');
  R(throat, c, 'coreWrithe', 0, 0.6, 0.005, 'void core writhe');
  R(throat, c, 'coreRimGlow', 0, 8, 0.05, 'void core rim');
  R(throat, c, 'coreRimPower', 0.5, 8, 0.05, 'void core rim tightness');

  const veins = folder.addFolder('4 · Floor veins');
  R(veins, c, 'groundVeinGlow', 0, 10, 0.05, 'vein glow');
  R(veins, c, 'stainOpacity', 0, 1, 0.01, 'stain opacity');
  veins.addColor(c, 'colorStain').name('stain');

  const fx = folder.addFolder('5 · Motes & smoke');
  R(fx, c, 'moteRate', 0, 1200, 1, 'motes/second');
  R(fx, c, 'moteSize', 0.005, 0.4, 0.001, 'mote size');
  R(fx, c, 'moteLife', 0.1, 4, 0.05, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  R(fx, c, 'smokeRate', 0, 300, 1, 'smoke/second');
  R(fx, c, 'smokeSize', 0.05, 4, 0.01, 'smoke size');
  R(fx, c, 'smokeLife', 0.1, 5, 0.05, 'smoke lifetime');
  R(fx, c, 'smokeOpacity', 0, 1, 0.01, 'smoke opacity');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');
  Editor.gradient(fx, c, 'colorSmoke', 'smoke gradient');

  const snap = folder.addFolder('6 · Burst, snap & sink');
  R(snap, c, 'sproutShake', 0, 1.5, 0.01, 'burst-out knock');
  R(snap, c, 'sproutDebris', 0, 300, 1, 'burst-out sparks');
  R(snap, c, 'snapFlash', 0, 1, 0.01, 'snap flash');
  R(snap, c, 'snapShake', 0, 1.5, 0.01, 'snap knock');
  R(snap, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(snap, c, 'snapLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(snap, c, 'snapSparks', 0, 600, 1, 'snap sparks');
  R(snap, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(snap, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark size');
  R(snap, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(snap, c, 'sparkGravity', -10, 30, 0.1, 'spark gravity');
  R(snap, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(snap, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  R(snap, c, 'shockRadius', 0, 4, 0.01, 'shockwave (× radius)');
  R(snap, c, 'burstSize', 0, 3, 0.01, 'air shell (× radius)');
  R(snap, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  snap.addColor(c, 'colorFlash').name('flash');
  snap.addColor(c, 'colorBurstA').name('shell inner');
  snap.addColor(c, 'colorBurstB').name('shell mid');
  snap.addColor(c, 'colorBurstC').name('shell outer');
  snap.addColor(c, 'colorShockA').name('shockwave');
  snap.addColor(c, 'colorShockB').name('shockwave hot');
  Editor.gradient(snap, c, 'colorSpark', 'spark gradient');

  const pull = folder.addFolder('7 · Pull');
  R(pull, c, 'gripImpulse', 0, 15, 0.1, 'knocked in (m/s)');
  R(pull, c, 'gripLift', 0, 10, 0.1, 'lift (m/s)');
  R(pull, c, 'gripSpin', 0, 6, 0.01, 'tumble');
  R(pull, c, 'pullSpeed', 0, 10, 0.05, 'pulled in (m/s)');
  R(pull, c, 'pullSwirl', -6, 6, 0.05, 'swirl (rad/s)');
  R(pull, c, 'pullLift', 0, 4, 0.05, 'held up (m/s)');
  R(pull, c, 'gripGrab', 0.5, 30, 0.1, 'grip (1/s)');
  R(pull, c, 'swallowSpeed', 0, 8, 0.05, 'down the throat (m/s)');
  R(pull, c, 'consumeDepth', 0.2, 5, 0.05, 'gone at depth (m)');

  folder.close();
  return folder;
}
