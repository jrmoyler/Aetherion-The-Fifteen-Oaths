import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createBileTubeGeometry,
  createBileStripGeometry,
  createBileQuadGeometry,
  createBileRingQuadsGeometry
} from '../../assets/codex/BileLanceGeometry.js';
import {
  createLanceMaterial,
  createLanceHazeMaterial,
  createRibbonMaterial,
  createWakeRingsMaterial,
  createTrenchMaterial,
  createBoreMaterial,
  createGeyserMaterial,
  MAX_WAKE_RINGS
} from '../../materials/codex/BileLanceMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'bilelance';

const TAU = Math.PI * 2;
/** Bodies that can be wearing this cast's stain at once. */
const MAX_STAIN = 10;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _end = new Vector3();
const _floor = new Vector3();
const _body = new Vector3();
const _radial = new Vector3();
const _tang = new Vector3();
const _upL = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * BILE LANCE — a drill of bile, screwed down the line and into the floor.
 *
 * A line cast in four beats. A long **fluted spike** of bile swells out of the
 * caster's hand and **flies** down the line at chest height, spinning so fast
 * its helical grooves crawl backward — a drill bit, not a dart. It screws
 * through a corkscrew of light that it lays behind itself and leaves fixed in
 * the air, sheds wake rings with spiral arms, flings droplets tangentially
 * off its spin, and the floor under it is **eaten** into a bubbling trench.
 * At the target it **bores**: the nose pitches down and the whole lance
 * screws into the floor, spraying bile back out of the hole, which opens into
 * a spiral drain. A beat later the bile **erupts** out of the bore — a
 * fountain of droplets, a shockwave, and a **geyser**: a column of dark bile
 * with a swollen head bursts up out of the hole, boils, then its head droops
 * and it slumps into a heap that keeps bubbling — domes swell and pop —
 * drips run off it and it sinks back into the drain, while the trench goes on
 * hissing until it is spent and erodes away.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1–2. **the lance** (`createLanceMaterial`) — a parameter-space tube bent
 *        in the vertex stage into a spike with helical flutes, a murk
 *        streaming tail-ward inside a bright rim, beads of light running
 *        down the flute troughs, a wet highlight, a white-hot point.
 *   3. **the corkscrew** — two helix ribbons (`createRibbonMaterial`) whose
 *      winding is fixed in the world, and a pool of wake rings
 *      (`createWakeRingsMaterial`, one draw call) that open across the line.
 *   4. **the trench** (`createTrenchMaterial`) — a wet channel of live acid
 *      down the line with bubbles that swell and pop, a bright seam at its
 *      lip and etched, pitted stone either side; it cools from the far end.
 *   5. **the bore** (`createBoreMaterial`) — the spiral drain where the lance
 *      went in; the eruption out of it (droplets, a WATER shell, SHOCKWAVE,
 *      SCORCH, flash, shake, light punch).
 *   5b. **the geyser** (`createGeyserMaterial`) — the eruption's mass: the
 *       tube grid stood on end and bent into a column with a flared foot and
 *       a mushrooming head; rise → boil → droop and slump → bubbling heap →
 *       sinks. Lit and normal-blended so its deep stop is near-black bile.
 *       Drips run off its head as it slumps; BUBBLE beads break off the heap.
 *   6. **drops, mist & motes** — DROPLET beads flung off the spin, SMOKE
 *      dirtying the air behind the lance, curl-noise motes off the trench.
 *   7. **haze** — the lance again, fattened, on `LAYER.DISTORTION`.
 *   8. **the pierce** — `handlesOwnHits`. Bodies the lance passes are thrown
 *      along the line with the drill's spin in them and stained with bile;
 *      bodies round the end wait for the eruption and are thrown upward.
 *
 * ## The editor rule
 *
 * A cast keeps dice (a seed) and clocks (the spin, the flow, the bore spin,
 * the wake-ring ages). Every metre, second and colour is read from
 * `settings.bilelance` each frame.
 */
export class BileLanceAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Wake rings alive. HUD readout only. */
  get instanceCount() {
    let n = 0;
    for (let i = 0; i < MAX_WAKE_RINGS; i++) if (this._ringAge[i] >= 0) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.tubeGeometry = createBileTubeGeometry(72, 18);
    this.ribbonGeometry = createBileTubeGeometry(160, 6);
    this.stripGeometry = createBileStripGeometry(140, 6);
    this.quadGeometry = createBileQuadGeometry();
    this.ringsGeometry = createBileRingQuadsGeometry(MAX_WAKE_RINGS);

    this.trenchMaterial = createTrenchMaterial();
    this.trench = this._mesh(this.stripGeometry, this.trenchMaterial, LAYER.VFX, 2);
    this.boreMaterial = createBoreMaterial();
    this.bore = this._mesh(this.quadGeometry, this.boreMaterial, LAYER.VFX, 3);

    this.lanceMaterial = createLanceMaterial();
    this.lance = this._mesh(this.tubeGeometry, this.lanceMaterial, LAYER.VFX, 14);
    this.hazeMaterial = createLanceHazeMaterial();
    this.haze = this._mesh(this.tubeGeometry, this.hazeMaterial, LAYER.DISTORTION, 0);

    this.ribbonMaterialA = createRibbonMaterial(0);
    this.ribbonA = this._mesh(this.ribbonGeometry, this.ribbonMaterialA, LAYER.VFX, 15);
    this.ribbonMaterialB = createRibbonMaterial(Math.PI);
    this.ribbonB = this._mesh(this.ribbonGeometry, this.ribbonMaterialB, LAYER.VFX, 15);

    this.geyserGeometry = createBileTubeGeometry(64, 32);
    this.geyserMaterial = createGeyserMaterial();
    this.geyser = this._mesh(this.geyserGeometry, this.geyserMaterial, LAYER.VFX, 13);
    this._geyserState = { center: new Vector3(), height: 0, radius: 0, foot: 0, head: 0, headAt: 0.8, sink: 0, hot: 0, flow: 0, bubblePhase: 0, seed: 0 };
    this._eruptAge = -1;
    this._geyserFlow = 0;
    this._geyserBubble = 0;
    this._geyserTop = 0;

    this.wakeMaterial = createWakeRingsMaterial();
    this.wake = this._mesh(this.ringsGeometry, this.wakeMaterial, LAYER.VFX, 16);

    this._shape = { nose: new Vector3(), axis: new Vector3(0, 0, 1), side: new Vector3(1, 0, 0), spin: 0, grow: 0, seed: 0, flow: 0, fade: 1, sink: 0 };
    this._ribbonState = { origin: new Vector3(), dir: new Vector3(), side: new Vector3(), front: 0, tailGap: 1, startAlong: 0, grow: 0, fade: 1 };
    this._ringAlong = new Float32Array(MAX_WAKE_RINGS);
    this._ringAge = new Float32Array(MAX_WAKE_RINGS).fill(-1);
    this._wakeState = { origin: new Vector3(), dir: new Vector3(), side: new Vector3(), along: this._ringAlong, age: this._ringAge, seed: 0 };
    this._trenchState = { start: new Vector3(), dir: new Vector3(), side: new Vector3(), length: 1, cutEnd: 0, tipAt: 0, live: 1, fadeT: 0, seed: 0 };
    this._boreState = { center: new Vector3(), dir: new Vector3(), side: new Vector3(), open: 0, live: 1, spin: 0, fadeT: 0, seed: 0 };

    this._seed = 0;
    this._spin = 0;
    this._flow = 0;
    this._boreSpin = 0;
    this._noseAlong = 0;
    this._prevNose = 0;
    this._nextRing = 0;
    this._ringCursor = 0;
    this._grow = 0;
    this._erupted = false;
    this._bitten = false;

    this._stain = [];
    for (let i = 0; i < MAX_STAIN; i++) this._stain.push({ dummy: null, time: 0 });
    this._stainCount = 0;
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

    this.drops = particles.get('bilelance.drops', {
      capacity: 2400,
      shape: ParticleShape.DROPLET,
      additive: false,
      softFade: 0.15
    });
    this.drops.uniforms.uSizeIn.value = 0.05;
    this.drops.uniforms.uFadeIn.value = 0.03;
    this.drops.uniforms.uFadeOut.value = 0.35;
    this.drops.uniforms.uEndSize.value = 0.6;
    this.drops.uniforms.uDrag.value = 0.25;

    this.mist = particles.get('bilelance.mist', {
      capacity: 1200,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 0.8
    });
    this.mist.uniforms.uSizeIn.value = 0.15;
    this.mist.uniforms.uFadeIn.value = 0.12;
    this.mist.uniforms.uFadeOut.value = 0.55;
    this.mist.uniforms.uEndSize.value = 2.4;
    this.mist.uniforms.uDrag.value = 1.6;

    this.motes = particles.get('bilelance.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.08;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uDrag.value = 1.2;
    this.motes.uniforms.uTurbFrequency.value = 0.8;
    this.motes.uniforms.uTurbSpeed.value = 0.6;

    this.bubbles = particles.get('bilelance.bubbles', {
      capacity: 500,
      shape: ParticleShape.BUBBLE,
      additive: false,
      softFade: 0.05
    });
    this.bubbles.uniforms.uDrag.value = 2.2;
    this.bubbles.uniforms.uSizeIn.value = 0.5;
    this.bubbles.uniforms.uFadeIn.value = 0.05;
    this.bubbles.uniforms.uFadeOut.value = 0.15;
    this.bubbles.uniforms.uEndSize.value = 1.4;
    this.bubbles.uniforms.uGravity.value.set(0, 0, 0);
    this.bubbles.uniforms.uTurbulence.value = 0;

    this.dropEmitter = new RateEmitter();
    this.geyserDripEmitter = new RateEmitter();
    this.geyserBubbleEmitter = new RateEmitter();
    this.mistEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
    this.sprayEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the drilling, the pause and the eruption. */
  get impactDuration() {
    const c = settings[ID];
    return Math.max(0.1, (Math.max(0.05, c.drillTime) + Math.max(0, c.eruptDelay) + 0.55) * settings.global.lifetime);
  }

  /** The fade is the trench and the bore going quiet. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 13.1) * Math.sin(this.age * 5.3 + 0.7));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    this.dropEmitter.reset();
    this.mistEmitter.reset();
    this.moteEmitter.reset();
    this.sprayEmitter.reset();
    this.geyserDripEmitter.reset();
    this.geyserBubbleEmitter.reset();
    this._eruptAge = -1;
    this._geyserFlow = 0;
    this._geyserBubble = 0;
    this._geyserTop = 0;
    this._releaseStains();

    this._seed = Math.random() * 100;
    this._spin = Math.random() * TAU;
    this._flow = 0;
    this._boreSpin = 0;
    this._noseAlong = c.handForward;
    this._prevNose = c.handForward;
    this._nextRing = c.handForward + c.ringSpacing * 0.5;
    this._ringCursor = 0;
    this._ringAge.fill(-1);
    this._grow = 0;
    this._erupted = false;
    this._bitten = false;

    const st = this._shape;
    st.seed = this._seed;
    st.side.copy(this.side);
    st.axis.copy(this.direction);
    st.fade = 1;
    st.sink = 0;
    this._wakeState.seed = this._seed;
    this._trenchState.seed = this._seed;
    this._trenchState.live = 1;
    this._trenchState.fadeT = 0;
    this._boreState.seed = this._seed;
    this._boreState.open = 0;
    this._boreState.live = 1;
    this._boreState.fadeT = 0;
    this._ribbonState.fade = 1;

    this.lance.visible = true;
    this.haze.visible = true;
    this.ribbonA.visible = true;
    this.ribbonB.visible = true;
    this.wake.visible = true;
    this.trench.visible = true;
    this.bore.visible = false;
    this.geyser.visible = false;

    this._placeNose(this._noseAlong, c.flightHeight);
    this._syncAll();

    // The bile gathering in the hand.
    this._resetEmit(frame.uTime.value);
    _emit.position = st.nose;
    _emit.radius = 0.25;
    _emit.direction = _up;
    _emit.speed = 1;
    _emit.spread = 1;
    _emit.size = c.moteSize * 1.4;
    _emit.life = c.moteLife * 0.6;
    this.motes.emit(Math.round(24 * settings.global.particleCount), _emit);
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

  /** Put the nose `along` metres down the line at height `y`, flying level. */
  _placeNose(along, y) {
    const st = this._shape;
    st.nose.copy(this.origin).addScaledVector(this.direction, along);
    st.nose.y = y;
    st.axis.copy(this.direction);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _advance(dt, spinMul) {
    const c = settings[ID];
    const g = settings.global;
    this._spin += c.spinSpeed * spinMul * dt * g.animationSpeed;
    this._flow += c.flowSpeed * dt * g.noiseSpeed;
    this._boreSpin += c.spinSpeed * 0.15 * dt * g.animationSpeed;
    const life = Math.max(0.05, c.ringLife * g.lifetime);
    for (let i = 0; i < MAX_WAKE_RINGS; i++) {
      if (this._ringAge[i] < 0) continue;
      this._ringAge[i] += dt;
      if (this._ringAge[i] > life) this._ringAge[i] = -1;
    }
  }

  _syncAll() {
    const c = settings[ID];
    const g = settings.global;
    const st = this._shape;
    st.spin = this._spin;
    st.flow = this._flow;
    st.grow = this._grow;
    this.lanceMaterial.userData.sync(st);
    this.hazeMaterial.userData.sync(st);

    const rs = this._ribbonState;
    rs.origin.copy(this.origin);
    rs.dir.copy(this.direction);
    rs.side.copy(this.side);
    rs.front = this._noseAlong;
    rs.tailGap = c.lanceLength * (1 - c.bellyAt) * 0.9 * this._grow;
    rs.startAlong = c.handForward;
    rs.grow = this._grow;
    this.ribbonMaterialA.userData.sync(rs);
    this.ribbonMaterialB.userData.sync(rs);

    const ws = this._wakeState;
    ws.origin.copy(this.origin);
    ws.dir.copy(this.direction);
    ws.side.copy(this.side);
    this.wakeMaterial.userData.sync(ws);

    const ts = this._trenchState;
    const start = Math.max(0, c.trenchStart);
    ts.start.copy(this.origin).addScaledVector(this.direction, start).setY(0);
    ts.dir.copy(this.direction);
    ts.side.copy(this.side);
    ts.length = Math.max(0.2, this.length - start + 0.4);
    ts.cutEnd = Math.max(0, Math.min(this._noseAlong, this.length) - start);
    ts.tipAt = Math.min(this._noseAlong, this.length) - start;
    this.trenchMaterial.userData.sync(ts);

    const bs = this._boreState;
    this.pointAt(1, bs.center);
    bs.center.addScaledVector(this.direction, c.drillDepth * 0.35);
    bs.dir.copy(this.direction);
    bs.side.copy(this.side);
    bs.spin = this._boreSpin;
    this.boreMaterial.userData.sync(bs);

    /* the particles' looks */
    this.drops.setGradient(getColor(c.colorDropA), getColor(c.colorDropB), getColor(c.colorDropC), getColor(c.colorDropD));
    const d = this.drops.uniforms;
    d.uGravity.value.set(0, -c.dropGravity, 0);
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = g.opacity;
    d.uTurbulence.value = 0.1 * g.turbulence;

    this.mist.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
    const m = this.mist.uniforms;
    m.uGravity.value.set(0, 0.25, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = c.mistOpacity * g.opacity;
    m.uTurbulence.value = 0.6 * g.turbulence;
    m.uSwirl.value = 1.2;
    m.uSwirlExpand.value = 0.5;

    this.bubbles.setGradient(getColor(c.colorGeyserTint), getColor(c.colorGeyserTint), getColor(c.colorGeyserBody), getColor(c.colorGeyserDeep));
    const bu = this.bubbles.uniforms;
    bu.uSizeScale.value = g.particleSize;
    bu.uLifeScale.value = g.particleLifetime;
    bu.uOpacity.value = g.opacity;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const t = this.motes.uniforms;
    t.uGravity.value.set(0, 0.9, 0);
    t.uSizeScale.value = g.particleSize;
    t.uLifeScale.value = g.particleLifetime;
    t.uSpeedScale.value = g.particleSpeed;
    t.uOpacity.value = g.opacity;
    t.uGlow.value = c.moteGlow * g.glow;
    t.uTurbulence.value = 1.0 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the drill flies                                            */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    this._advance(dt, 1);
    this._grow = Easing.outBack(saturate(this.age / Math.max(0.01, c.formTime * settings.global.lifetime)));
    this._prevNose = this._noseAlong;
    this._noseAlong = lerp(c.handForward, this.length, this.u);
    this._placeNose(this._noseAlong, c.flightHeight);

    // Lay a wake ring every `ringSpacing` metres the nose covers.
    while (this._noseAlong >= this._nextRing) {
      const slot = this._ringCursor;
      this._ringCursor = (this._ringCursor + 1) % MAX_WAKE_RINGS;
      this._ringAlong[slot] = Math.max(c.handForward, this._nextRing - c.lanceLength * 0.4);
      this._ringAge[slot] = 0;
      this._nextRing += Math.max(0.2, c.ringSpacing);
    }

    this._syncAll();
    this._lanceFx(dt, 1);
    this._trenchFx(dt, 1);
    this._pierce();
    this._updateStains(dt);
    this.ctx.shake.rumble(c.travelRumble, dt);
    this.position.copy(this._shape.nose);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the bore and the eruption                                  */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    this._noseAlong = this.length;
    this.bore.visible = true;
    this._boreState.open = 0;
    // The bite: a small knock as the nose catches the floor.
    this.ctx.shake.add(c.impactShake * 0.35 * g.explosionIntensity, 8, 22);
    this.lightBoost = c.lightIntensity * 0.8;
    this.pointAt(1, _floor);
    this.ctx.decals.spawn(DecalType.SCORCH, _floor, {
      radius: c.scorchRadius,
      life: this.impactDuration + this.fadeDuration,
      intensity: 0.9,
      colorA: getColor(c.colorBoreC),
      colorB: getColor(c.colorBoreB)
    });
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;

    if (t <= 1) {
      const tau = t * this.impactDuration / Math.max(0.01, g.lifetime);
      const drill = Math.max(0.05, c.drillTime);
      const k = saturate(tau / drill);
      this._advance(dt, lerp(1, c.drillSpin, smoothstep(0, 0.3, k)));

      /* nose pitches down and screws into the floor */
      const st = this._shape;
      const ke = Easing.inQuad(k);
      this.pointAt(1, _end);
      const pitch = smoothstep(0, 0.45, k);
      st.axis.copy(this.direction).multiplyScalar(1 - pitch * 0.55).addScaledVector(_up, -pitch * 1.1).normalize();
      st.nose.copy(_end).addScaledVector(this.direction, c.drillDepth * 0.6 * ke);
      st.nose.y = lerp(c.flightHeight, -c.drillDepth * 0.7, ke);
      st.sink = k;
      st.fade = 1 - smoothstep(0.75, 1, k);
      this.lance.visible = k < 1;
      this.haze.visible = k < 1;

      // The corkscrew lets go.
      this._ribbonState.fade = 1 - smoothstep(0, 0.6, tau / Math.max(0.1, this.impactDuration));
      this.ribbonA.visible = this._ribbonState.fade > 0.01;
      this.ribbonB.visible = this.ribbonA.visible;

      // The drain opens while it bores.
      this._boreState.open = Easing.outCubic(saturate(tau / (drill * 1.4)));
      this._syncAll();

      if (k < 1) this._drillSpray(dt);
      if (!this._erupted && tau >= drill + Math.max(0, c.eruptDelay)) this._erupt();
      this._geyser(dt, 0);

      this._trenchFx(dt, 1);
      this._updateStains(dt);
      this.position.copy(_end).setY(Math.max(0.3, st.nose.y));
      return;
    }

    /* the fade: the trench and the drain go quiet and erode */
    const ft = saturate(t - 1);
    this._advance(dt, 0);
    this.lance.visible = false;
    this.haze.visible = false;
    this.ribbonA.visible = false;
    this.ribbonB.visible = false;
    const live = Math.pow(1 - ft, 1.4);
    this._trenchState.live = live;
    this._trenchState.fadeT = smoothstep(0.45, 1, ft);
    this._boreState.live = live;
    this._boreState.fadeT = smoothstep(0.5, 1, ft);
    this._syncAll();
    this._geyser(dt, ft);
    this._trenchFx(dt, live);
    this._updateStains(dt);
    this.pointAt(1, this.position);
    this.position.y = Math.max(0.4, this._geyserTop * 0.6);
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Drops flung off the spinning lance, and mist dragged behind it. */
  _lanceFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._shape;
    const time = frame.uTime.value;
    const L = c.lanceLength * this._grow;
    _upL.crossVectors(st.side, st.axis).normalize();

    const n = Math.round(this.dropEmitter.tick(dt, c.dropRate * strength) * g.particleCount);
    if (n > 0) {
      this._resetEmit(time);
      _emit.size = c.dropSize;
      _emit.life = c.dropLife;
      _emit.speed = c.dropSpeed;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.25;
      for (let i = 0; i < n; i++) {
        const s = 0.15 + Math.random() * 0.6;
        const a = Math.random() * TAU;
        _radial.copy(st.side).multiplyScalar(Math.cos(a)).addScaledVector(_upL, Math.sin(a));
        _tang.copy(st.side).multiplyScalar(-Math.sin(a)).addScaledVector(_upL, Math.cos(a));
        _pos.copy(st.nose).addScaledVector(st.axis, -(1 - s) * L).addScaledVector(_radial, c.lanceRadius * this._grow * 0.8);
        // Thrown off the spin: tangential, a little outward, left behind.
        _dir.copy(_tang).addScaledVector(_radial, 0.4).addScaledVector(st.axis, -0.6).normalize();
        _emit.position = _pos;
        _emit.direction = _dir;
        this.drops.emit(1, _emit);
      }
    }

    const m = Math.round(this.mistEmitter.tick(dt, c.mistRate * strength) * g.particleCount);
    if (m > 0) {
      this._resetEmit(time);
      _pos.copy(st.nose).addScaledVector(st.axis, -L * 0.8);
      _dir.copy(st.axis).negate();
      _emit.position = _pos;
      _emit.anchor = _pos;
      _emit.radius = c.lanceRadius * 1.5;
      _emit.direction = _dir;
      _emit.speed = 1.2;
      _emit.spread = 0.6;
      _emit.size = c.mistSize;
      _emit.life = c.mistLife;
      _emit.spin = 0.8;
      this.mist.emit(m, _emit);
    }
  }

  /** Glowing motes lifting off the live trench. */
  _trenchFx(dt, live) {
    const c = settings[ID];
    const g = settings.global;
    const start = Math.max(0, c.trenchStart);
    const span = Math.min(this._noseAlong, this.length) - start;
    if (span <= 0.2) return;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * live) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.moteSize;
    _emit.life = c.moteLife;
    _emit.speed = 0.7;
    _emit.spread = 0.5;
    _emit.direction = _up;
    for (let i = 0; i < n; i++) {
      const along = start + span * (1 - Math.pow(Math.random(), 0.6));
      _pos.copy(this.origin).addScaledVector(this.direction, along).addScaledVector(this.side, (Math.random() * 2 - 1) * c.trenchWidth);
      _pos.y = 0.05;
      _emit.position = _pos;
      this.motes.emit(1, _emit);
    }
  }

  /** Bile spraying back out of the hole while the lance bores in. */
  _drillSpray(dt) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.sprayEmitter.tick(dt, c.dropRate * 2.2) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    this.pointAt(1, _floor);
    _floor.addScaledVector(this.direction, c.drillDepth * 0.35).setY(0.05);
    _dir.copy(this.direction).multiplyScalar(-0.6).addScaledVector(_up, 1).normalize();
    _emit.position = _floor;
    _emit.radius = 0.2;
    _emit.direction = _dir;
    _emit.speed = c.dropSpeed * 1.3;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.7;
    _emit.size = c.dropSize * 1.2;
    _emit.life = c.dropLife;
    this.drops.emit(n, _emit);
  }

  /** The bile comes back up. */
  _erupt() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._erupted = true;
    this._eruptAge = 0;
    this.pointAt(1, _floor);
    _floor.addScaledVector(this.direction, c.drillDepth * 0.35).setY(0.05);

    this._resetEmit(time);
    _emit.position = _floor;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = c.eruptSpeed;
    _emit.speedVariance = 0.45;
    _emit.spread = c.eruptSpread;
    _emit.size = c.dropSize * 1.6;
    _emit.life = c.dropLife * 1.6;
    this.drops.emit(Math.round(c.eruptDrops * g.particleCount), _emit);

    _emit.speed = c.eruptSpeed * 0.5;
    _emit.spread = 1;
    _emit.size = c.moteSize * 1.6;
    _emit.life = c.moteLife;
    this.motes.emit(Math.round(c.eruptDrops * 0.35 * g.particleCount), _emit);

    _emit.speed = 2.2;
    _emit.spread = 0.8;
    _emit.radius = 0.6;
    _emit.size = c.mistSize * 1.8;
    _emit.life = c.mistLife * 1.4;
    _emit.spin = 0.6;
    _emit.anchor = _floor;
    this.mist.emit(Math.round(22 * g.particleCount), _emit);

    _pos.copy(_floor).setY(0.5);
    this.ctx.bursts.spawn(BurstMode.WATER, _pos, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.6,
      intensity: c.burstIntensity,
      opacity: 0.4,
      fresnel: 1.6 * g.fresnel,
      displace: 0.5,
      turbulence: 1.2,
      squash: 1.4,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.55,
      width: 0.07,
      intensity: 1.1,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorBurstA)
    });

    this._eruptHits(_floor);
    this.ctx.shake.add(c.impactShake * power, 1 / Math.max(0.05, c.shakeDuration), 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;
  }

  /**
   * The geyser's life on the eruption clock: it bursts up, boils, droops and
   * slumps into a heap, then sinks over the back of the fade. Every metre is
   * read from settings; the record is only the eruption's age and two clocks.
   * Presentation only — the eruption's hits were dealt in `_erupt`.
   *
   * @param {number} dt
   * @param {number} ft 0..1 through the fade phase (0 during the impact)
   */
  _geyser(dt, ft) {
    const c = settings[ID];
    const g = settings.global;
    if (this._eruptAge < 0) {
      this.geyser.visible = false;
      return;
    }
    this._eruptAge += dt;
    this._geyserFlow += c.geyserFlowSpeed * dt * g.noiseSpeed;
    this._geyserBubble += c.geyserBubbleRate * dt * g.animationSpeed;
    const e = this._eruptAge / Math.max(0.05, g.lifetime);
    const tRise = Math.max(0.02, c.geyserRise);
    const tHold = Math.max(0, c.geyserHold);
    const tSlump = Math.max(0.05, c.geyserSlump);
    const rise = saturate(e / tRise);
    const slump = Easing.inOutCubic(saturate((e - tRise - tHold) / tSlump));
    const sinkK = smoothstep(saturate(c.heapSinkStart), 1, ft);
    const power = Math.sqrt(Math.max(0.05, g.explosionIntensity));

    const gs = this._geyserState;
    this.pointAt(1, gs.center);
    gs.center.addScaledVector(this.direction, c.drillDepth * 0.35).setY(0);
    const up = c.geyserHeight * power * Easing.outBack(rise);
    gs.height = lerp(up, c.heapHeight, slump) * (1 - sinkK);
    gs.radius = lerp(c.geyserRadius * (0.55 + 0.45 * rise), c.heapRadius * 0.55, slump) * (1 - 0.35 * sinkK);
    gs.foot = lerp(c.geyserFoot, c.heapRadius * 0.6, slump) * (1 + 0.25 * sinkK);
    // The head swells as it tops out, then droops down the column and spreads.
    gs.head = c.geyserHead * Easing.outCubic(rise) * (1 - slump * 0.7);
    gs.headAt = lerp(c.geyserHeadAt, 0.45, slump);
    gs.sink = c.heapSink * sinkK;
    gs.hot = 1 - saturate((e - tRise * 0.5) / Math.max(0.05, tRise + tHold));
    gs.flow = this._geyserFlow;
    gs.bubblePhase = this._geyserBubble;
    gs.seed = this._seed;
    this.geyserMaterial.userData.sync(gs);
    this.geyser.visible = gs.height > 0.03 && ft < 1;
    this._geyserTop = gs.height;
    if (!this.geyser.visible) return;

    const time = frame.uTime.value;
    // Drips run off the drooping head while it slumps, and thin out after.
    const dripping = slump >= 1 ? 0.35 * (1 - sinkK) : (slump > 0 ? 1 : 0.25);
    const nd = Math.round(this.geyserDripEmitter.tick(dt, c.geyserDripRate * dripping) * g.particleCount);
    if (nd > 0) {
      this._resetEmit(time);
      _emit.size = c.dropSize * 1.5;
      _emit.life = c.dropLife * 0.8;
      _emit.speed = 0.6;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.3;
      _dir.set(0, -1, 0);
      _emit.direction = _dir;
      const headY = gs.height * gs.headAt;
      const headR = gs.radius + gs.head * 0.9;
      for (let i = 0; i < nd; i++) {
        const a = Math.random() * TAU;
        _pos.set(gs.center.x + Math.cos(a) * headR, Math.max(0.1, headY - gs.sink), gs.center.z + Math.sin(a) * headR);
        _emit.position = _pos;
        this.drops.emit(1, _emit);
      }
    }
    // Bubbles break off the heap once it has slumped.
    const nb = Math.round(this.geyserBubbleEmitter.tick(dt, c.geyserBubbles * slump * (1 - sinkK)) * g.particleCount);
    if (nb > 0) {
      this._resetEmit(time);
      _emit.size = c.geyserBubbleSize;
      _emit.life = 0.6;
      _emit.speed = 0.4;
      _emit.spread = 0.2;
      _emit.direction = _up;
      const reach = Math.max(0.1, gs.radius + gs.foot);
      for (let i = 0; i < nb; i++) {
        const a = Math.random() * TAU;
        const r = reach * 0.8 * Math.sqrt(Math.random());
        _pos.set(gs.center.x + Math.cos(a) * r, Math.max(0.05, gs.height * (1 - r / reach) * 0.8 - gs.sink), gs.center.z + Math.sin(a) * r);
        _emit.position = _pos;
        this.bubbles.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* The pierce                                                          */
  /* ------------------------------------------------------------------ */

  /** Throw every body the nose has passed this frame — except those round the end. */
  _pierce() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const from = Math.max(0, this._prevNose - c.lanceLength * 0.5);
    const to = this._noseAlong;
    if (to <= from) return;
    this.pointAt(Math.min(1, (from + to) * 0.5 / this.length), _floor);
    const found = field.findTargets(_floor.x, _floor.z, Math.hypot((to - from) * 0.5, c.hitWidth), this._found);
    if (found.length === 0) return;
    const power = g.explosionIntensity;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    const endZone = this.length - Math.max(0.3, c.eruptRadius) * 0.8;
    for (const dummy of found) {
      const dx = dummy.position.x - this.origin.x;
      const dz = dummy.position.z - this.origin.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      const lat = dx * this.side.x + dz * this.side.z;
      if (Math.abs(lat) > c.hitWidth || along < 0.3 || along > to) continue;
      if (along >= endZone) continue; // waits for the eruption
      // Along the line, with the drill's twist pulling it to one side.
      _dir.copy(this.direction).addScaledVector(this.side, lat >= 0 ? 0.35 : -0.35).normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._stainBody(dummy, _dir, 0.7);
    }
  }

  _eruptHits(at) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = Math.max(0.3, c.eruptRadius);
    const found = field.findTargets(at.x, at.z, R, this._found);
    for (const dummy of found) {
      _dir.set(dummy.position.x - at.x, 0, dummy.position.z - at.z);
      const d = _dir.length();
      if (d < 0.05) _dir.copy(this.direction);
      else _dir.multiplyScalar(1 / d);
      const close = 1 - saturate(d / R);
      this._force.impulse = c.eruptImpulse * power * (0.5 + 0.5 * close);
      this._force.lift = c.eruptLift * power * (0.6 + 0.4 * close);
      this._force.spin = c.hitSpin;
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._stainBody(dummy, _up, 1);
    }
  }

  _stainBody(dummy, dir, scale) {
    const c = settings[ID];
    const g = settings.global;
    if (this._stainCount < MAX_STAIN) {
      const slot = this._stain[this._stainCount++];
      slot.dummy = dummy;
      slot.time = 0;
    }
    this._resetEmit(frame.uTime.value);
    _pos.copy(dummy.position).setY(1.1);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = dir;
    _emit.speed = c.dropSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.8;
    _emit.size = c.dropSize * 1.2;
    _emit.life = c.dropLife;
    this.drops.emit(Math.round(36 * scale * g.particleCount), _emit);
    this.ctx.shake.add(c.impactShake * 0.25 * scale, 8, 20);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.6 * scale);
  }

  _updateStains(dt) {
    const c = settings[ID];
    const look = this._look;
    look.color = c.colorStainBody;
    look.rimColor = c.colorStainRim;
    look.rimEmissive = c.stainRimGlow;
    look.edgeColor = c.colorStainEdge;
    look.edgeEmissive = c.stainEdgeGlow;
    look.edgeWidth = c.stainEdgeWidth;
    for (let i = 0; i < this._stainCount; i++) {
      const slot = this._stain[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt;
      dummy.corrode(saturate(slot.time / Math.max(0.02, c.stainTime)) * c.stain, look);
      if (Math.random() < dt * 6) {
        const at = dummy.bodyPoint(_body) ?? _body.copy(dummy.position).setY(0.9);
        this._resetEmit(frame.uTime.value);
        _emit.position = at;
        _emit.radius = 0.3;
        _emit.direction = _up;
        _emit.speed = 0.6;
        _emit.spread = 0.6;
        _emit.size = c.moteSize;
        _emit.life = c.moteLife;
        this.motes.emit(2, _emit);
      }
    }
  }

  _releaseStains() {
    for (let i = 0; i < this._stainCount; i++) this._stain[i].dummy = null;
    this._stainCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.lance.visible = false;
    this.haze.visible = false;
    this.ribbonA.visible = false;
    this.ribbonB.visible = false;
    this.wake.visible = false;
    this.trench.visible = false;
    this.bore.visible = false;
    this.geyser.visible = false;
    this._eruptAge = -1;
    this._ringAge.fill(-1);
    this._releaseStains();
  }

  dispose() {
    this.tubeGeometry.dispose();
    this.ribbonGeometry.dispose();
    this.stripGeometry.dispose();
    this.quadGeometry.dispose();
    this.ringsGeometry.dispose();
    this.geyserGeometry.dispose();
    this.geyserMaterial.dispose();
    this.lanceMaterial.dispose();
    this.hazeMaterial.dispose();
    this.ribbonMaterialA.dispose();
    this.ribbonMaterialB.dispose();
    this.wakeMaterial.dispose();
    this.trenchMaterial.dispose();
    this.boreMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⟴  Bile Lance');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'flight speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'trench eats for (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'gutter');

  const shape = folder.addFolder('1 · Lance shape');
  R(shape, c, 'handForward', -1, 3, 0.01, 'forms ahead of caster (m)');
  R(shape, c, 'flightHeight', 0.2, 4, 0.01, 'flight height (m)');
  R(shape, c, 'formTime', 0.01, 1, 0.005, 'swells out over (s)');
  R(shape, c, 'lanceLength', 0.3, 8, 0.01, 'length (m)');
  R(shape, c, 'lanceRadius', 0.02, 1.2, 0.005, 'radius (m)');
  R(shape, c, 'bellyAt', 0.05, 0.9, 0.01, 'fattest at (tail → nose)');
  R(shape, c, 'flutes', 1, 10, 1, 'flutes');
  R(shape, c, 'fluteDepth', 0, 0.8, 0.01, 'flute depth');
  R(shape, c, 'twist', 0, 8, 0.05, 'flute turns');
  R(shape, c, 'spinSpeed', 0, 80, 0.5, 'drill spin (rad/s)');
  R(shape, c, 'wobble', 0, 0.6, 0.005, 'wobble');
  R(shape, c, 'wobbleScale', 0.1, 8, 0.05, 'wobble scale');

  const bile = folder.addFolder('2 · Bile');
  R(bile, c, 'bodyOpacity', 0, 1, 0.01, 'body opacity');
  R(bile, c, 'rimGlow', 0, 12, 0.05, 'rim glow');
  R(bile, c, 'grooveGlow', 0, 12, 0.05, 'flute glow');
  R(bile, c, 'tipGlow', 0, 20, 0.05, 'point glow');
  R(bile, c, 'flowSpeed', 0, 12, 0.05, 'murk flow (m/s)');
  R(bile, c, 'flowScale', 0.1, 6, 0.01, 'murk scale');
  R(bile, c, 'softFade', 0.01, 1, 0.01, 'soft intersection (m)');
  Editor.gradient(bile, c, 'colorBile', 'bile (point → murk)');

  const screw = folder.addFolder('3 · Corkscrew');
  R(screw, c, 'ribbonLength', 0.2, 16, 0.05, 'helix trail (m)');
  R(screw, c, 'ribbonRadius', 0, 2, 0.01, 'helix radius (m)');
  R(screw, c, 'ribbonFlare', 0, 3, 0.01, 'helix flare (m)');
  R(screw, c, 'ribbonPitch', 0.1, 6, 0.01, 'metres per turn');
  R(screw, c, 'ribbonThickness', 0.003, 0.2, 0.001, 'ribbon thickness (m)');
  R(screw, c, 'ribbonGlow', 0, 12, 0.05, 'ribbon glow');
  R(screw, c, 'ringSpacing', 0.2, 6, 0.05, 'wake ring every (m)');
  R(screw, c, 'ringSize', 0.1, 5, 0.01, 'wake ring radius (m)');
  R(screw, c, 'ringLife', 0.05, 3, 0.01, 'wake ring life (s)');
  R(screw, c, 'ringWidth', 0.01, 0.5, 0.005, 'wake ring width');
  R(screw, c, 'ringGlow', 0, 10, 0.05, 'wake ring glow');
  R(screw, c, 'ringArms', 1, 8, 1, 'spiral arms');
  screw.addColor(c, 'colorRibbon').name('ribbon');
  screw.addColor(c, 'colorRing').name('wake ring');

  const trench = folder.addFolder('4 · Trench');
  R(trench, c, 'trenchStart', 0, 5, 0.05, 'starts after (m)');
  R(trench, c, 'trenchWidth', 0.02, 1.5, 0.01, 'channel half-width (m)');
  R(trench, c, 'trenchEaten', 0.05, 3, 0.01, 'etched half-width (m)');
  R(trench, c, 'trenchGlow', 0, 10, 0.05, 'acid glow');
  R(trench, c, 'trenchFresh', 0.1, 20, 0.05, 'bright behind nose (m)');
  R(trench, c, 'bubbleScale', 0.5, 12, 0.05, 'bubbles per m');
  R(trench, c, 'bubbleRate', 0, 6, 0.05, 'pops/second');
  R(trench, c, 'trenchWander', 0, 1, 0.005, 'wander (m)');
  R(trench, c, 'trenchErode', 0, 1, 0.01, 'ragged fade');
  trench.addColor(c, 'colorAcid').name('live acid');
  trench.addColor(c, 'colorWet').name('wet channel');
  trench.addColor(c, 'colorEtched').name('etched stone');

  const bore = folder.addFolder('5 · Bore & eruption');
  R(bore, c, 'drillTime', 0.05, 2, 0.01, 'bores in over (s)');
  R(bore, c, 'drillDepth', 0, 5, 0.01, 'bores on (m)');
  R(bore, c, 'drillSpin', 0, 6, 0.05, 'spin while boring (×)');
  R(bore, c, 'eruptDelay', 0, 1.5, 0.01, 'erupts after (s)');
  R(bore, c, 'eruptDrops', 0, 800, 1, 'eruption droplets');
  R(bore, c, 'eruptSpeed', 0, 30, 0.1, 'eruption speed');
  R(bore, c, 'eruptSpread', 0, 1.5, 0.01, 'eruption spread');
  R(bore, c, 'boreRadius', 0.1, 6, 0.05, 'drain radius (m)');
  R(bore, c, 'boreSwirl', 0, 8, 0.05, 'drain swirl');
  R(bore, c, 'boreGlow', 0, 10, 0.05, 'drain glow');
  R(bore, c, 'burstSize', 0, 8, 0.05, 'wet shell (m)');
  R(bore, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(bore, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(bore, c, 'scorchRadius', 0, 6, 0.05, 'stain (m)');
  R(bore, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(bore, c, 'impactShake', 0, 1.5, 0.01, 'camera knock');
  R(bore, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(bore, c, 'impactLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(bore, c, 'travelRumble', 0, 1, 0.01, 'rumble in flight');
  const gy = bore.addFolder('Geyser');
  R(gy, c, 'geyserHeight', 0, 8, 0.05, 'height (m)');
  R(gy, c, 'geyserRadius', 0.05, 2, 0.01, 'column radius (m)');
  R(gy, c, 'geyserFoot', 0, 3, 0.01, 'foot flare (m)');
  R(gy, c, 'geyserHead', 0, 3, 0.01, 'head swell (m)');
  R(gy, c, 'geyserHeadAt', 0.3, 0.95, 0.01, 'head sits at');
  R(gy, c, 'geyserRise', 0.02, 1.5, 0.01, 'bursts up over (s)');
  R(gy, c, 'geyserHold', 0, 2, 0.01, 'boils for (s)');
  R(gy, c, 'geyserSlump', 0.05, 3, 0.01, 'slumps over (s)');
  R(gy, c, 'heapHeight', 0, 3, 0.01, 'heap height (m)');
  R(gy, c, 'heapRadius', 0.1, 4, 0.01, 'heap radius (m)');
  R(gy, c, 'heapSinkStart', 0, 1, 0.01, 'sinks from (of fade)');
  R(gy, c, 'heapSink', 0, 2, 0.01, 'sinks (m)');
  R(gy, c, 'geyserLobes', 0, 0.8, 0.005, 'lobes');
  R(gy, c, 'geyserLobeScale', 0.1, 6, 0.05, 'lobe scale');
  R(gy, c, 'geyserFlowSpeed', 0, 10, 0.05, 'churn speed');
  R(gy, c, 'geyserFlowScale', 0.1, 6, 0.05, 'murk scale');
  R(gy, c, 'geyserSway', 0, 1.5, 0.01, 'sway (m)');
  R(gy, c, 'geyserBubbleAmp', 0, 0.6, 0.005, 'bubble domes (m)');
  R(gy, c, 'geyserBubbleScale', 0.5, 10, 0.05, 'bubbles per m');
  R(gy, c, 'geyserBubbleRate', 0, 4, 0.05, 'bubble cycles / s');
  R(gy, c, 'geyserPopGlow', 0, 8, 0.05, 'pop flash');
  R(gy, c, 'geyserOpacity', 0, 1, 0.01, 'opacity');
  R(gy, c, 'geyserLight', 0, 3, 0.01, 'sunlit body');
  R(gy, c, 'geyserRimGlow', 0, 6, 0.05, 'rim glow');
  R(gy, c, 'geyserVeinGlow', 0, 6, 0.05, 'vein glow');
  R(gy, c, 'geyserHot', 0, 10, 0.05, 'hot throat');
  R(gy, c, 'geyserSpecular', 0, 4, 0.01, 'wet highlight');
  R(gy, c, 'geyserDripRate', 0, 400, 1, 'drips / s off the head');
  R(gy, c, 'geyserBubbles', 0, 200, 1, 'bubbles / s off the heap');
  R(gy, c, 'geyserBubbleSize', 0.01, 0.6, 0.005, 'bubble size');
  gy.addColor(c, 'colorGeyserHot').name('hot throat');
  gy.addColor(c, 'colorGeyserTint').name('rim / veins');
  gy.addColor(c, 'colorGeyserBody').name('body');
  gy.addColor(c, 'colorGeyserDeep').name('deep');
  bore.addColor(c, 'colorBoreA').name('drain lip');
  bore.addColor(c, 'colorBoreB').name('drain arms');
  bore.addColor(c, 'colorBoreC').name('drain hole');
  bore.addColor(c, 'colorBurstA').name('shell inner');
  bore.addColor(c, 'colorBurstB').name('shell mid');
  bore.addColor(c, 'colorBurstC').name('shell outer');
  bore.addColor(c, 'colorShock').name('shockwave');
  bore.addColor(c, 'colorFlash').name('flash');

  const fx = folder.addFolder('6 · Drops, mist & motes');
  R(fx, c, 'dropRate', 0, 800, 1, 'drops/second off the spin');
  R(fx, c, 'dropSize', 0.005, 0.4, 0.001, 'drop size');
  R(fx, c, 'dropSpeed', 0, 20, 0.05, 'drop speed');
  R(fx, c, 'dropLife', 0.05, 3, 0.01, 'drop lifetime');
  R(fx, c, 'dropGravity', -5, 30, 0.1, 'drop gravity');
  R(fx, c, 'mistRate', 0, 300, 1, 'mist/second');
  R(fx, c, 'mistSize', 0.05, 3, 0.01, 'mist size');
  R(fx, c, 'mistLife', 0.1, 6, 0.05, 'mist lifetime');
  R(fx, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  R(fx, c, 'moteRate', 0, 500, 1, 'motes/second off the trench');
  R(fx, c, 'moteSize', 0.005, 0.3, 0.001, 'mote size');
  R(fx, c, 'moteLife', 0.1, 4, 0.05, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorDrop', 'drop gradient');
  Editor.gradient(fx, c, 'colorMist', 'mist gradient');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');

  const haze = folder.addFolder('7 · Haze');
  R(haze, c, 'hazeStrength', 0, 4, 0.01, 'strength');
  R(haze, c, 'hazeWidth', 1, 8, 0.05, 'width (× radius)');
  R(haze, c, 'hazeScale', 0.1, 8, 0.01, 'noise scale');
  R(haze, c, 'hazeSpeed', 0, 12, 0.05, 'noise speed');

  const pierce = folder.addFolder('8 · Pierce');
  R(pierce, c, 'hitWidth', 0.1, 4, 0.01, 'reach either side (m)');
  R(pierce, c, 'hitImpulse', 0, 30, 0.1, 'thrown along the line (m/s)');
  R(pierce, c, 'hitLift', 0, 15, 0.05, 'lift (m/s)');
  R(pierce, c, 'hitSpin', 0, 8, 0.01, 'spin');
  R(pierce, c, 'eruptRadius', 0.3, 8, 0.05, 'eruption reach (m)');
  R(pierce, c, 'eruptImpulse', 0, 25, 0.1, 'eruption throw (m/s)');
  R(pierce, c, 'eruptLift', 0, 25, 0.1, 'eruption lift (m/s)');
  R(pierce, c, 'stain', 0, 1, 0.01, 'stain');
  R(pierce, c, 'stainTime', 0.02, 3, 0.01, 'stains over (s)');
  R(pierce, c, 'stainRimGlow', 0, 10, 0.05, 'stain rim glow');
  R(pierce, c, 'stainEdgeGlow', 0, 12, 0.05, 'stain edge glow');
  R(pierce, c, 'stainEdgeWidth', 0, 0.3, 0.001, 'stain edge width');
  pierce.addColor(c, 'colorStainBody').name('stained body');
  pierce.addColor(c, 'colorStainRim').name('stain rim');
  pierce.addColor(c, 'colorStainEdge').name('stain edge');

  folder.close();
  return folder;
}
