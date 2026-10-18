import { InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  SHRINE,
  createShrineGeometry,
  createPanelGeometry,
  createReliquaryGrid,
  createRelicSphere,
  createReliquaryQuad
} from '../../assets/codex/ReliquaryDawnGeometry.js';
import {
  createShrineMaterial,
  createGlassMaterial,
  createRelicMaterial,
  createCoronaMaterial,
  createRayMaterial,
  createGroundMaterial,
  createShimmerMaterial,
  MAX_RAYS
} from '../../materials/codex/ReliquaryDawnMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'reliquarydawn';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const PANELS = 6;
/** Tallest point of the shrine at scale 1 (the finial's tip). */
const SHRINE_HEIGHT = SHRINE.spireTop + SHRINE.finial * 2.4;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _out = new Vector3();
const _m = new Matrix4();
const _up = new Vector3(0, 1, 0);

/**
 * RELIQUARY DAWN — Light, zone cast.
 *
 * A reliquary is a shrine built to hold something holy; this one holds the
 * dawn. A seed of light is thrown into the circle, and the circle goes to
 * **dusk** — a deep blue tint, its rim drawn. The floor splits in a hexagon
 * of molten light and a **gilded shrine stands up out of the stone**: a
 * stepped plinth, six pillars, stained-glass lancet windows between them, a
 * spire crowned with a sun. Stone chips and dust are thrown off its foot.
 * Inside, the **relic kindles** into a small boiling sun, and its light
 * catches the inside of every pillar and burns through the glass. Then the
 * six windows **fall open** outward like the petals of a flower — an AIR
 * shell, a flash, a shockwave — and **dawn washes the circle**: a bright
 * front races out from the shrine across the floor, gold and combed with
 * sunrise streaks behind it, shafts of light raking out of the open sides,
 * and every body the front reaches is thrown outward. The light holds, then
 * the shrine **sinks back** into the floor and the dawn fades and erodes.
 *
 * Distinct from the other light in the codex: no halo, no wings, no column
 * from the sky — the light comes *out of a building that stands up* and
 * travels *along the ground*, like a sunrise.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the shrine** (`createShrineMaterial`, `LAYER.WORLD`) — gilt frame and
 *      ivory plinth, lit by the scene and by the relic.
 *   2. **the windows** (`createGlassMaterial`, instanced ×6) — stained glass in
 *      lead, a rose in each arch head, hinged at the sill.
 *   3. **the relic** (`createRelicMaterial`) and its **corona**
 *      (`createCoronaMaterial`, also the thrown seed).
 *   4. **the rays** (`createRayMaterial`) — shafts out of the open sides.
 *   5. **the ground** (`createGroundMaterial`) — dusk, the seam, the wash —
 *      and its **shimmer** (`createShimmerMaterial`, `LAYER.DISTORTION`).
 *   6. **particles** — gold motes in the light, stone chips and dust as the
 *      shrine breaks the floor and as the front passes.
 *   7. **the opening** — AIR shell, SHOCKWAVE and DUSTRING decals, flash,
 *      shake, light punch.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * The wash front: every body it reaches is thrown outward and up, the frame
 * it passes them.
 *
 * ## The editor rule
 *
 * A cast keeps a seed, one clock from the seed's landing and the radius the
 * wash has reached. Every size, time and colour is read from
 * `settings.reliquarydawn` each frame.
 */
export class ReliquaryDawnAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._thrown;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.shrineGeometry = createShrineGeometry();
    this.panelGeometry = createPanelGeometry();
    this.rayGeometry = createReliquaryGrid(24, 6, -1, 1, MAX_RAYS);
    this.sphereGeometry = createRelicSphere();
    this.quadGeometry = createReliquaryQuad();

    this.groundMaterial = createGroundMaterial();
    this.ground = this._mesh(this.quadGeometry, this.groundMaterial, LAYER.VFX, 2);
    this.shimmerMaterial = createShimmerMaterial();
    this.shimmer = this._mesh(this.quadGeometry, this.shimmerMaterial, LAYER.DISTORTION, 0);

    this.shrineMaterial = createShrineMaterial();
    this.shrine = new Mesh(this.shrineGeometry, this.shrineMaterial);
    this.shrine.layers.set(LAYER.WORLD);
    this.shrine.frustumCulled = false;
    this.shrine.visible = false;
    this.group.add(this.shrine);

    this.glassMaterial = createGlassMaterial();
    this.panels = new InstancedMesh(this.panelGeometry, this.glassMaterial, PANELS);
    this.panels.layers.set(LAYER.VFX);
    this.panels.frustumCulled = false;
    this.panels.renderOrder = 9;
    this.panels.visible = false;
    this.group.add(this.panels);

    this.relicMaterial = createRelicMaterial();
    this.relic = this._mesh(this.sphereGeometry, this.relicMaterial, LAYER.VFX, 11);
    this.rayMaterial = createRayMaterial();
    this.rays = this._mesh(this.rayGeometry, this.rayMaterial, LAYER.VFX, 12);
    this.coronaMaterial = createCoronaMaterial();
    this.corona = this._mesh(this.quadGeometry, this.coronaMaterial, LAYER.VFX, 14);

    this._center = new Vector3();
    this._relicPos = new Vector3();
    this._shrineState = { relic: new Vector3(), kindle: 0, emerge: 0 };
    this._glassState = { power: 0, height: SHRINE.panelH, halfWidth: SHRINE.panelW * 0.5 };
    this._relicState = { center: new Vector3(), radius: 0.3, power: 0, seed: 0 };
    this._coronaState = { center: new Vector3(), size: 1, intensity: 0, seed: 0 };
    this._rayState = { center: new Vector3(), spin: 0, startR: 0.9, reach: 0.9, endR: 5, lift: 0, power: 0, seed: 0 };
    this._groundState = { center: new Vector3(), zone: 4.6, front: 0, dusk: 0, heat: 1, seam: 0, seamR: 1.3, fadeT: 0, seed: 0 };
    this._shimmerState = { center: new Vector3(), zone: 4.6, front: 0, power: 0 };

    this._seed = 0;
    this._front = 0;
    this._prevFront = 0;
    this._raySpin = 0;
    this._opened = false;
    this._risen = false;
    this._thrown = 0;

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
    this.motes = particles.get('reliquarydawn.motes', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.15;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uDrag.value = 1.4;
    this.motes.uniforms.uTurbFrequency.value = 0.7;
    this.motes.uniforms.uTurbSpeed.value = 0.4;

    this.chips = particles.get('reliquarydawn.chips', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.02;
    this.chips.uniforms.uFadeOut.value = 0.3;
    this.chips.uniforms.uEndSize.value = 0.8;
    this.chips.uniforms.uDrag.value = 0.4;

    this.dust = particles.get('reliquarydawn.dust', {
      capacity: 700,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 1.0
    });
    this.dust.uniforms.uSizeIn.value = 0.2;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.55;
    this.dust.uniforms.uEndSize.value = 2.4;
    this.dust.uniforms.uDrag.value = 1.4;

    this.moteEmitter = new RateEmitter();
    this.dustEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** Rise, kindle, open & wash, hold. */
  get impactDuration() {
    const c = settings[ID];
    const sum =
      Math.max(0.05, c.riseTime) +
      Math.max(0.02, c.kindleTime) +
      Math.max(c.panelOpenTime, c.washTime, 0.05) +
      Math.max(0, c.washHold);
    return sum * settings.global.lifetime;
  }

  /** The shrine sinks and the light fades. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._front = 0;
    this._prevFront = 0;
    this._raySpin = Math.random() * TAU;
    this._opened = false;
    this._risen = false;
    this._thrown = 0;
    this.moteEmitter.reset();
    this.dustEmitter.reset();

    this.pointAt(1, this._center);
    this._center.y = 0;
    this._relicState.seed = this._seed;
    this._coronaState.seed = this._seed;
    this._rayState.seed = this._seed;
    this._groundState.seed = this._seed;
    this._groundState.fadeT = 0;
    this._groundState.front = 0;
    this._groundState.dusk = 0;
    this._groundState.seam = 0;
    this._groundState.heat = 1;

    this.shrine.visible = false;
    this.panels.visible = false;
    this.relic.visible = false;
    this.rays.visible = false;
    this.corona.visible = true;
    this.ground.visible = true;
    this.shimmer.visible = false;
    this._syncAll();
  }

  _zone() {
    return Math.max(0.5, settings[ID].zoneRadius);
  }

  /**
   * Pose the shrine and its windows.
   * @param {number} rise 0 under the floor .. 1 standing (may overshoot)
   * @param {number} open 0 closed .. 1 fallen open (may overshoot)
   */
  _poseShrine(rise, open) {
    const c = settings[ID];
    const s = Math.max(0.1, c.shrineScale);
    const yOff = -SHRINE_HEIGHT * s * (1 - rise);
    this.shrine.position.set(this._center.x, yOff, this._center.z);
    this.shrine.scale.set(s, s, s);
    this.shrine.updateMatrix();

    const apothem = SHRINE.radius * Math.cos(Math.PI / 6) * 0.99;
    const ang = open * c.panelOpenAngle * DEG;
    const cs = Math.cos(ang);
    const sn = Math.sin(ang);
    for (let k = 0; k < PANELS; k++) {
      const a = ((k + 0.5) / PANELS) * TAU;
      _out.set(Math.cos(a), 0, Math.sin(a));
      _x.set(-Math.sin(a), 0, Math.cos(a));
      // The window falls outward about its sill.
      _y.copy(_up).multiplyScalar(cs).addScaledVector(_out, sn);
      _z.copy(_out).multiplyScalar(cs).addScaledVector(_up, -sn);
      _m.makeBasis(_x.multiplyScalar(s), _y.multiplyScalar(s), _z.multiplyScalar(s));
      _m.setPosition(this._center.x + _out.x * apothem * s, yOff + SHRINE.stepH * s, this._center.z + _out.z * apothem * s);
      this.panels.setMatrixAt(k, _m);
    }
    this.panels.instanceMatrix.needsUpdate = true;

    this._relicPos.set(this._center.x, yOff + SHRINE.relicY * s, this._center.z);
    return yOff;
  }

  _syncAll() {
    const c = settings[ID];
    const g = settings.global;
    this._shrineState.relic.copy(this._relicPos);
    this.shrineMaterial.userData.sync(this._shrineState);
    this.glassMaterial.userData.sync(this._glassState);
    this.relicMaterial.userData.sync(this._relicState);
    this.coronaMaterial.userData.sync(this._coronaState);
    this._rayState.spin = this._raySpin;
    this.rayMaterial.userData.sync(this._rayState);
    const gs = this._groundState;
    gs.center.copy(this._center);
    gs.zone = this._zone();
    gs.seamR = SHRINE.plinthR * Math.max(0.1, c.shrineScale) * 1.05;
    this.groundMaterial.userData.sync(gs);
    const sh = this._shimmerState;
    sh.center.copy(this._center);
    sh.zone = gs.zone;
    sh.front = gs.front;
    this.shimmerMaterial.userData.sync(sh);

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const m = this.motes.uniforms;
    m.uGravity.value.set(0, c.moteLift, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = g.opacity;
    m.uGlow.value = c.moteGlow * g.glow;
    m.uTurbulence.value = 0.9 * g.turbulence;

    this.chips.setGradient(getColor(c.colorChipA), getColor(c.colorChipB), getColor(c.colorChipC), getColor(c.colorChipD));
    const k = this.chips.uniforms;
    k.uGravity.value.set(0, -12, 0);
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uTurbulence.value = 0.1 * g.turbulence;

    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    const d = this.dust.uniforms;
    d.uGravity.value.set(0, c.dustLift * 0.4, 0);
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = c.dustOpacity * g.opacity;
    d.uTurbulence.value = 0.6 * g.turbulence;
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
  /* Travel — the seed of dawn                                           */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    const u = this.u;
    this.pointAt(u, _pos);
    _pos.y = lerp(1.5, 0.4, u) + c.heraldArc * 4 * u * (1 - u);
    const co = this._coronaState;
    co.center.copy(_pos);
    co.size = c.heraldSize * (0.6 + 0.4 * smoothstep(0, 0.1, this.age));
    co.intensity = c.heraldGlow;
    // The circle starts to go to dusk as the seed nears it.
    this._groundState.dusk = smoothstep(0.3, 1, u);
    this._syncAll();

    const n = Math.round(this.moteEmitter.tick(dt, c.heraldTrail) * g.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _emit.position = _pos;
      _emit.radius = 0.12;
      _emit.direction = _up;
      _emit.speed = c.moteSpeed;
      _emit.spread = 1;
      _emit.size = c.moteSize * 1.2;
      _emit.life = c.moteLife * 0.6;
      this.motes.emit(n, _emit);
    }
    this.position.copy(_pos);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — rise, kindle, open, wash, hold                             */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    this.shrine.visible = true;
    this.panels.visible = true;
    this.relic.visible = true;
    this._groundState.dusk = 1;
    // The seed sinks into the floor with a small flash.
    this.ctx.flash.trigger(getColor(c.colorFlash), c.openFlash * 0.3 * settings.global.explosionIntensity);
    this.ctx.decals.spawn(DecalType.DUSTRING, this._center, {
      radius: SHRINE.plinthR * c.shrineScale * 2.2,
      life: 1.4,
      intensity: 0.9,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustB)
    });
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    this._raySpin += c.raySpin * dt * g.animationSpeed;
    const zone = this._zone();

    if (t <= 1) {
      const tau = (t * this.impactDuration) / Math.max(0.01, g.lifetime);
      const tr = Math.max(0.05, c.riseTime);
      const tk = Math.max(0.02, c.kindleTime);
      const tOpen = tr + tk;
      const kr = saturate(tau / tr);
      const kk = saturate((tau - tr) / tk);
      const ko = saturate((tau - tOpen) / Math.max(0.05, c.panelOpenTime));
      const kw = saturate((tau - tOpen) / Math.max(0.05, c.washTime));

      // It rises, overshoots a hair, settles.
      const s = Math.max(0.1, c.shrineScale);
      const over = (c.riseOvershoot / (SHRINE_HEIGHT * s)) * Math.sin(Math.PI * saturate((kr - 0.7) / 0.3));
      const rise = Easing.outCubic(kr) + (kr > 0.7 ? over : 0);
      // The windows fall open and bounce on the floor of their hinges.
      const open = ko <= 0 ? 0 : Easing.inQuad(saturate(ko / 0.75)) + (ko > 0.75 ? -c.panelBounce * Math.sin(Math.PI * (ko - 0.75) / 0.25) : 0);
      this._poseShrine(rise, open);

      const ss = this._shrineState;
      ss.kindle = Easing.outCubic(kk) * (1 + 0.5 * Math.exp(-(tau - tOpen) * 4) * (tau > tOpen ? 1 : 0));
      ss.emerge = kr < 1 ? 1 : Math.exp(-(tau - tr) * 3);
      this._glassState.power = 0.15 + 0.85 * Easing.outCubic(kk);

      const rs = this._relicState;
      rs.center.copy(this._relicPos);
      rs.radius = c.relicRadius * s * Easing.outBack(kk);
      rs.power = kk;
      this.relic.visible = kk > 0;
      const co = this._coronaState;
      co.center.copy(this._relicPos);
      co.size = c.coronaSize * s * (0.3 + 0.7 * kk) * (1 + 0.4 * ko);
      co.intensity = kk * (1 + 1.2 * Math.exp(-Math.max(0, tau - tOpen) * 3) * (tau > tOpen ? 1 : 0));
      this.corona.visible = kk > 0;

      // The wash.
      this._prevFront = this._front;
      this._front = zone * Easing.outCubic(kw);
      const gs = this._groundState;
      gs.front = this._front;
      gs.dusk = 1;
      gs.seam = ss.emerge;
      gs.heat = 1;
      const rays = this._rayState;
      rays.center.copy(this._center);
      rays.startR = SHRINE.radius * Math.cos(Math.PI / 6) * s;
      rays.endR = zone;
      rays.reach = Math.max(rays.startR + 0.05, this._front);
      rays.lift = 0;
      rays.power = smoothstep(0, 0.3, kw);
      this.rays.visible = kw > 0;
      this._shimmerState.power = kw > 0 && kw < 1 ? 1 : Math.max(0, 1 - (tau - tOpen - c.washTime) * 3);
      this.shimmer.visible = this._shimmerState.power > 0.01 && kw > 0;

      if (!this._risen && kr > 0) this._rise();
      if (ko > 0 && !this._opened) this._open();

      this._syncAll();
      this._lightFx(dt, kk, kr < 1);
      if (kw > 0 && kw < 1) this._washFx(dt);
      this._washHits();

      this.position.copy(this._relicPos);
      if (this.position.y < 0.3) this.position.y = 0.3;
      return;
    }

    /* the fade: the shrine sinks, the light fades and erodes */
    const ft = saturate(t - 1);
    const sink = Easing.inCubic(smoothstep(0.25, 1, ft));
    this._poseShrine(1 - sink, 1 - 0.15 * ft);
    this.shrine.visible = sink < 1;
    this.panels.visible = sink < 1;
    const ss = this._shrineState;
    ss.kindle = 1 - smoothstep(0.2, 0.9, ft);
    ss.emerge = sink > 0 && sink < 1 ? 0.6 : 0;
    this._glassState.power = 0.15 + 0.85 * ss.kindle;
    const rs = this._relicState;
    rs.center.copy(this._relicPos);
    rs.power = ss.kindle;
    rs.radius = c.relicRadius * c.shrineScale * (0.5 + 0.5 * ss.kindle);
    this.relic.visible = rs.power > 0.01;
    const co = this._coronaState;
    co.center.copy(this._relicPos);
    co.intensity = ss.kindle;
    this.corona.visible = co.intensity > 0.01;
    const rays = this._rayState;
    rays.lift = -SHRINE_HEIGHT * c.shrineScale * sink * 0.4;
    rays.power = 1 - smoothstep(0, 0.6, ft);
    this.rays.visible = rays.power > 0.01;
    this.shimmer.visible = false;
    const gs = this._groundState;
    gs.heat = 1 - ft;
    gs.dusk = 1 - smoothstep(0, 0.5, ft);
    gs.seam = ss.emerge;
    gs.fadeT = smoothstep(0.35, 1, ft);
    this._syncAll();
    this._lightFx(dt, ss.kindle, sink > 0 && sink < 1);
    this.position.copy(this._center).setY(1.2);
  }

  /** The shrine breaks the floor: chips, dust, a knock. */
  _rise() {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    this._risen = true;
    const R = SHRINE.plinthR * c.shrineScale;
    this._resetEmit(time);
    _emit.size = c.chipSize;
    _emit.life = c.chipLife;
    _emit.speed = c.chipSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.5;
    _emit.spin = 6;
    const n = Math.round(c.debrisCount * g.particleCount);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      _pos.set(this._center.x + Math.cos(a) * R, 0.05, this._center.z + Math.sin(a) * R);
      _dir.set(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6);
      _emit.position = _pos;
      _emit.direction = _dir;
      this.chips.emit(1, _emit);
    }
    this._resetEmit(time);
    _emit.size = c.dustSize;
    _emit.life = c.dustLife;
    _emit.speed = c.dustLift * 1.5;
    _emit.spread = 0.6;
    _emit.spin = 0.5;
    const m = Math.round(c.dustCount * g.particleCount);
    for (let i = 0; i < m; i++) {
      const a = Math.random() * TAU;
      _pos.set(this._center.x + Math.cos(a) * R * 1.1, 0.15, this._center.z + Math.sin(a) * R * 1.1);
      _dir.set(Math.cos(a), 0.6, Math.sin(a));
      _emit.position = _pos;
      _emit.direction = _dir;
      this.dust.emit(1, _emit);
    }
    this.ctx.shake.add(c.riseShake * g.explosionIntensity, 1 / Math.max(0.05, c.shakeDuration), 14);
  }

  /** The windows fall open: the beat. */
  _open() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._opened = true;
    _pos.copy(this._center).setY(0.5);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: c.burstSize * 0.2,
      endRadius: c.burstSize * power,
      life: 0.6,
      intensity: c.burstIntensity,
      opacity: 0.6,
      fresnel: 2,
      displace: 0.2,
      turbulence: 0.8,
      squash: 0.45,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._center, {
      radius: c.shockRadius * power,
      life: 0.7,
      width: 0.07,
      intensity: 1.1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.shake.add(c.openShake * power, 1 / Math.max(0.05, c.shakeDuration), 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.openFlash * power);
    this.lightBoost = c.lightIntensity * c.openLight * power;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Motes drifting in the light — round the shrine and down the rays. */
  _lightFx(dt, strength, rising) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength) * g.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _emit.size = c.moteSize;
      _emit.life = c.moteLife;
      _emit.speed = c.moteSpeed;
      _emit.spread = 1;
      _emit.direction = _up;
      _emit.radius = 0.2;
      const rays = Math.max(1, Math.round(c.rays));
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.4 || this._front < 0.5) {
          _pos.copy(this._relicPos).addScaledVector(_up, (Math.random() - 0.3) * 1.2);
          _pos.x += (Math.random() - 0.5) * 1.6;
          _pos.z += (Math.random() - 0.5) * 1.6;
        } else {
          const a = ((Math.floor(Math.random() * rays) + 0.5) / rays) * TAU + this._raySpin;
          const r = lerp(1, Math.max(1, this._front), Math.random());
          const h = lerp(c.rayHeight, c.rayEndHeight, r / this._zone()) + (Math.random() - 0.5) * 0.6;
          _pos.set(this._center.x + Math.cos(a) * r, Math.max(0.1, h), this._center.z + Math.sin(a) * r);
        }
        _emit.position = _pos;
        this.motes.emit(1, _emit);
      }
    }
    if (rising) {
      const m = Math.round(this.dustEmitter.tick(dt, 30) * g.particleCount);
      if (m > 0) {
        this._resetEmit(frame.uTime.value);
        const R = SHRINE.plinthR * c.shrineScale;
        _emit.size = c.dustSize * 0.7;
        _emit.life = c.dustLife * 0.8;
        _emit.speed = c.dustLift;
        _emit.spread = 0.6;
        _emit.spin = 0.4;
        _emit.direction = _up;
        for (let i = 0; i < m; i++) {
          const a = Math.random() * TAU;
          _pos.set(this._center.x + Math.cos(a) * R, 0.1, this._center.z + Math.sin(a) * R);
          _emit.position = _pos;
          this.dust.emit(1, _emit);
        }
      }
    }
  }

  /** Dust kicked up along the front as it races out. */
  _washFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.dustEmitter.tick(dt, 60) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.dustSize * 0.6;
    _emit.life = c.dustLife * 0.6;
    _emit.speed = c.dustLift * 2;
    _emit.spread = 0.5;
    _emit.spin = 0.4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      _pos.set(this._center.x + Math.cos(a) * this._front, 0.1, this._center.z + Math.sin(a) * this._front);
      _dir.set(Math.cos(a), 0.5, Math.sin(a));
      _emit.position = _pos;
      _emit.direction = _dir;
      this.dust.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Hits                                                                */
  /* ------------------------------------------------------------------ */

  _washHits() {
    if (this._front <= this._prevFront) return;
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const found = field.findTargets(this._center.x, this._center.z, this._front + 0.3, this._found);
    if (found.length === 0) return;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    for (const dummy of found) {
      const dx = dummy.position.x - this._center.x;
      const dz = dummy.position.z - this._center.z;
      const d = Math.hypot(dx, dz);
      if (d < this._prevFront - 0.3) continue;
      if (d > 1e-3) _dir.set(dx / d, 0, dz / d);
      else _dir.set(1, 0, 0);
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._thrown++;
      this._resetEmit(frame.uTime.value);
      _pos.copy(dummy.position).setY(1.0);
      _emit.position = _pos;
      _emit.radius = 0.35;
      _emit.direction = _up;
      _emit.speed = c.moteSpeed * 4;
      _emit.spread = 1;
      _emit.size = c.moteSize * 1.5;
      _emit.life = c.moteLife;
      this.motes.emit(Math.round(36 * g.particleCount), _emit);
      this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.5);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.shrine.visible = false;
    this.panels.visible = false;
    this.relic.visible = false;
    this.rays.visible = false;
    this.corona.visible = false;
    this.ground.visible = false;
    this.shimmer.visible = false;
  }

  dispose() {
    this.shrineGeometry.dispose();
    this.panelGeometry.dispose();
    this.rayGeometry.dispose();
    this.sphereGeometry.dispose();
    this.quadGeometry.dispose();
    this.shrineMaterial.dispose();
    this.glassMaterial.dispose();
    this.relicMaterial.dispose();
    this.coronaMaterial.dispose();
    this.rayMaterial.dispose();
    this.groundMaterial.dispose();
    this.shimmerMaterial.dispose();
    this.panels.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⛪  Reliquary Dawn');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'zoneRadius', 1, 12, 0.05, 'circle radius (m)');
  R(cast, c, 'speed', 4, 90, 0.5, 'seed speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'sinks & fades over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');

  const seed = folder.addFolder('1 · The seed');
  R(seed, c, 'heraldArc', 0, 8, 0.05, 'arc (m)');
  R(seed, c, 'heraldSize', 0.05, 3, 0.01, 'glow radius (m)');
  R(seed, c, 'heraldGlow', 0, 8, 0.05, 'glow');
  R(seed, c, 'heraldTrail', 0, 600, 1, 'motes/second');

  const rise = folder.addFolder('2 · The rise');
  R(rise, c, 'riseTime', 0.05, 3, 0.01, 'rises over (s)');
  R(rise, c, 'riseOvershoot', 0, 1, 0.005, 'overshoot (m)');
  R(rise, c, 'shrineScale', 0.2, 3, 0.01, 'shrine scale');
  R(rise, c, 'emergeGlow', 0, 12, 0.05, 'molten seam');
  R(rise, c, 'debrisCount', 0, 200, 1, 'stone chips');
  R(rise, c, 'dustCount', 0, 100, 1, 'dust puffs');

  const shrine = folder.addFolder('3 · The shrine');
  R(shrine, c, 'giltGlow', 0, 4, 0.01, 'brightness');
  R(shrine, c, 'giltSpec', 0, 6, 0.01, 'gold highlights');
  R(shrine, c, 'giltFresnel', 0, 4, 0.01, 'warm rim');
  R(shrine, c, 'relicLight', 0, 10, 0.05, 'lit by the relic');
  R(shrine, c, 'finialGlow', 0, 15, 0.05, 'finial glow');
  shrine.addColor(c, 'colorGilt').name('gilt');
  shrine.addColor(c, 'colorGiltHot').name('gilt lit');
  shrine.addColor(c, 'colorStone').name('stone');
  shrine.addColor(c, 'colorShadow').name('shadow');

  const relic = folder.addFolder('4 · The relic');
  R(relic, c, 'kindleTime', 0.02, 3, 0.01, 'kindles over (s)');
  R(relic, c, 'relicRadius', 0.05, 1.5, 0.01, 'radius (m)');
  R(relic, c, 'relicGlow', 0, 20, 0.05, 'glow');
  R(relic, c, 'relicBoil', 0, 6, 0.05, 'churn');
  R(relic, c, 'coronaSize', 0.1, 8, 0.05, 'corona radius (m)');
  R(relic, c, 'coronaGlow', 0, 10, 0.05, 'corona glow');
  R(relic, c, 'coronaRays', 1, 32, 1, 'corona rays');
  Editor.gradient(relic, c, 'colorRelic', 'relic gradient');
  relic.addColor(c, 'colorCoronaCore').name('corona core');
  relic.addColor(c, 'colorCoronaHalo').name('corona halo');

  const win = folder.addFolder('5 · The windows');
  R(win, c, 'panelOpenTime', 0.05, 2, 0.01, 'fall open over (s)');
  R(win, c, 'panelOpenAngle', 0, 135, 0.5, 'fall to (°)');
  R(win, c, 'panelBounce', 0, 0.5, 0.005, 'bounce');
  R(win, c, 'glassGlow', 0, 10, 0.05, 'backlit glow');
  R(win, c, 'glassCells', 1, 20, 0.1, 'panes per metre');
  R(win, c, 'leadWidth', 0.005, 0.2, 0.001, 'lead (m)');
  R(win, c, 'glassOpacity', 0, 1, 0.01, 'opacity');
  win.addColor(c, 'colorGlassA').name('glass gold');
  win.addColor(c, 'colorGlassB').name('glass rose');
  win.addColor(c, 'colorGlassC').name('glass pale');
  win.addColor(c, 'colorGlassD').name('glass sky');
  win.addColor(c, 'colorLead').name('lead');

  const wash = folder.addFolder('6 · The wash');
  R(wash, c, 'washTime', 0.05, 3, 0.01, 'crosses the circle in (s)');
  R(wash, c, 'washHold', 0, 3, 0.01, 'holds for (s)');
  R(wash, c, 'washFrontWidth', 0.02, 2, 0.01, 'front width (m)');
  R(wash, c, 'washGlow', 0, 10, 0.05, 'glow');
  R(wash, c, 'washStreaks', 1, 80, 1, 'sunrise streaks');
  R(wash, c, 'duskOpacity', 0, 1, 0.01, 'dusk before');
  R(wash, c, 'groundErode', 0, 1, 0.01, 'ragged fade');
  wash.addColor(c, 'colorDusk').name('dusk');
  wash.addColor(c, 'colorWashA').name('dawn bright');
  wash.addColor(c, 'colorWashB').name('dawn gold');
  wash.addColor(c, 'colorWashC').name('dawn ember');

  const rays = folder.addFolder('7 · The rays');
  R(rays, c, 'rays', 0, MAX_RAYS, 1, 'shafts');
  R(rays, c, 'rayHeight', 0, 4, 0.01, 'leave at height (m)');
  R(rays, c, 'rayEndHeight', -1, 3, 0.01, 'land at height (m)');
  R(rays, c, 'rayWidth', 0.05, 3, 0.01, 'width at the shrine (m)');
  R(rays, c, 'rayEndWidth', 0.05, 6, 0.01, 'width at reach (m)');
  R(rays, c, 'rayGlow', 0, 8, 0.05, 'glow');
  R(rays, c, 'rayStreaks', 0.5, 20, 0.1, 'streaks');
  R(rays, c, 'raySpin', -2, 2, 0.01, 'turn (rad/s)');
  rays.addColor(c, 'colorRayA').name('ray core');
  rays.addColor(c, 'colorRayB').name('ray');

  const fx = folder.addFolder('8 · Particles');
  R(fx, c, 'moteRate', 0, 800, 1, 'motes/second');
  R(fx, c, 'moteSize', 0.005, 0.4, 0.001, 'mote size');
  R(fx, c, 'moteSpeed', 0, 6, 0.05, 'mote speed');
  R(fx, c, 'moteLife', 0.1, 5, 0.05, 'mote lifetime');
  R(fx, c, 'moteLift', -3, 5, 0.05, 'mote rise');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');
  R(fx, c, 'chipSize', 0.01, 0.6, 0.005, 'chip size');
  R(fx, c, 'chipSpeed', 0, 20, 0.1, 'chip speed');
  R(fx, c, 'chipLife', 0.1, 5, 0.05, 'chip lifetime');
  Editor.gradient(fx, c, 'colorChip', 'chip gradient');
  R(fx, c, 'dustSize', 0.05, 3, 0.01, 'dust size');
  R(fx, c, 'dustLift', 0, 5, 0.01, 'dust rise');
  R(fx, c, 'dustLife', 0.1, 6, 0.05, 'dust lifetime');
  R(fx, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(fx, c, 'colorDust', 'dust gradient');

  const beat = folder.addFolder('9 · The opening');
  R(beat, c, 'burstSize', 0, 10, 0.05, 'air shell (m)');
  R(beat, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(beat, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(beat, c, 'openFlash', 0, 1, 0.01, 'flash');
  R(beat, c, 'openShake', 0, 1.5, 0.01, 'camera knock');
  R(beat, c, 'riseShake', 0, 1.5, 0.01, 'rise knock');
  R(beat, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(beat, c, 'openLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(beat, c, 'warpStrength', 0, 3, 0.01, 'front shimmer');
  beat.addColor(c, 'colorBurstA').name('shell inner');
  beat.addColor(c, 'colorBurstB').name('shell mid');
  beat.addColor(c, 'colorBurstC').name('shell outer');
  beat.addColor(c, 'colorShockA').name('shockwave');
  beat.addColor(c, 'colorShockB').name('shockwave hot');
  beat.addColor(c, 'colorFlash').name('flash');

  const hits = folder.addFolder('10 · Hits');
  R(hits, c, 'hitImpulse', 0, 25, 0.1, 'thrown (m/s)');
  R(hits, c, 'hitLift', 0, 15, 0.05, 'lift (m/s)');
  R(hits, c, 'hitSpin', 0, 6, 0.01, 'tumble');

  folder.close();
  return folder;
}
