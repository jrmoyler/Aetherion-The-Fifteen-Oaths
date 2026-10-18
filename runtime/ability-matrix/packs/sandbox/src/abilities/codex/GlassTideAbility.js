import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createGlassGridGeometry,
  createShardGeometry,
  createGlassQuadGeometry
} from '../../assets/codex/GlassTideGeometry.js';
import {
  createTideSheetMaterial,
  createTideTrailMaterial,
  createTideShardMaterial,
  createTideGlintMaterial
} from '../../materials/codex/GlassTideMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'glasstide';

const TAU = Math.PI * 2;
/** Shards one shatter can throw. */
const MAX_SHARDS = 120;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _a = new Vector3();
const _floor = new Vector3();
const _scale = new Vector3();
const _q = new Quaternion();
const _matrix = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _up = new Vector3(0, 1, 0);

/**
 * GLASS TIDE — a curtain of tide whips down the line, turns to glass, shatters.
 *
 * A line cast in four beats. A **sheet** of water stands up out of the floor
 * in front of the caster — a curtain, ankle-high at its tail and taller than a
 * man at its head, its crest leaning forward — and **whips** down the line,
 * snaking side to side on a wave that runs along it, shedding spray off the
 * crest and dragging a line of foam over a soaked floor. Whatever the head
 * crosses is *cut*: the sheet is glass-hard, so bodies come apart (`slice`).
 * At the end of the line it **hardens**: the flow stops dead, a star glint
 * flares at the head, the caustics lock into flat glassy facets. Then it
 * **shatters**: cracks race from the head back down the sheet, the facets
 * fall out cell by cell, and the CPU throws a matching slab of glass for each
 * — real instanced shards that tumble, bounce on the stone and melt back into
 * droplets.
 *
 * Distinct from the other tides: Riptide Lash is a *jet* that folds into a
 * curling wave, Maelstrom a whirlpool in the floor. This is a standing
 * curtain, and its payoff is glass breaking, not water crashing.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the sheet** (`createTideSheetMaterial(0)`) — a parameter grid stood up
 *      along the line in the vertex stage; fresnel water with caustics,
 *      streaks, a white crest torn into spray, foam at the foot; then glass
 *      facets, crack seams and the cell-by-cell fall-out.
 *   2. **refraction** — the same sheet on `LAYER.DISTORTION`.
 *   3. **the shards** — an `InstancedMesh` of thin glass slabs with bright
 *      rims (barycentric edges), CPU ballistics with a floor bounce.
 *   4. **the wet trail** — a floor strip soaked behind the head, with the
 *      foam line of the sheet's foot; drains raggedly.
 *   5. **spray, mist & glints** — DROPLET spray off the crest, SMOKE mist off
 *      the foot, additive sparkles riding the crest; a burst of all three at
 *      the shatter, and drips off melting shards.
 *   6. **the beat** — the star glint as it hardens; at the shatter a ring on
 *      the floor, ripples down the sheet's footprint, foam, a small WATER
 *      shell, a flash, a knock and a light punch.
 *
 * ## The editor rule
 *
 * A cast keeps a seed and three integrated phases (the whip, the flow, the
 * glint's turn). Every dimension and colour is read from
 * `settings.glasstide` each frame.
 */
export class GlassTideAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The sheet cuts what its head crosses, and throws it the way it whips. */
  get handlesOwnHits() {
    return true;
  }

  /** Shards in the air. HUD readout only. */
  get instanceCount() {
    return this._live;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.sheetGeometry = createGlassGridGeometry(140, 26, false);
    this.trailGeometry = createGlassGridGeometry(120, 6, true);
    this.quadGeometry = createGlassQuadGeometry();
    this.shardGeometry = createShardGeometry(1);

    /* ---- layer 4: the trail, under everything ---- */
    this.trailMaterial = createTideTrailMaterial();
    this.trail = this._mesh(this.trailGeometry, this.trailMaterial, LAYER.VFX, 2);

    /* ---- layers 1 + 2: the sheet and its refraction ---- */
    this.sheetMaterial = createTideSheetMaterial(0);
    this.sheet = this._mesh(this.sheetGeometry, this.sheetMaterial, LAYER.VFX, 12);
    this.lensMaterial = createTideSheetMaterial(1);
    this.lens = this._mesh(this.sheetGeometry, this.lensMaterial, LAYER.DISTORTION, 0);

    /* ---- layer 6: the glint ---- */
    this.glintMaterial = createTideGlintMaterial();
    this.glint = this._mesh(this.quadGeometry, this.glintMaterial, LAYER.VFX, 16);

    /* ---- layer 3: the shards ---- */
    this.shardMaterial = createTideShardMaterial();
    this.shardAttr = new InstancedBufferAttribute(new Float32Array(MAX_SHARDS * 2), 2);
    this.shardAttr.setUsage(DynamicDrawUsage);
    this.shardGeometry.setAttribute('aShard', this.shardAttr);
    this.shards = new InstancedMesh(this.shardGeometry, this.shardMaterial, MAX_SHARDS);
    this.shards.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shards.layers.set(LAYER.VFX);
    this.shards.renderOrder = 14;
    this.shards.frustumCulled = false;
    this.shards.visible = false;
    this.shards.count = 0;
    this.group.add(this.shards);

    this._shardRecs = [];
    for (let i = 0; i < MAX_SHARDS; i++) {
      this._shardRecs.push({
        state: 0, // 0 waiting, 1 flying, 2 gone
        delay: 0,
        age: 0,
        life: 1,
        size: 1,
        spin: 0,
        s: 0,
        v: 0,
        face: 1, // which side of the sheet it leaves from
        pos: new Vector3(),
        vel: new Vector3(),
        axis: new Vector3(0, 1, 0),
        quat: new Quaternion()
      });
    }
    this._shardUsed = 0;
    this._live = 0;

    /** Scratch state handed to the materials — one object apiece, reused. */
    this._sheetState = {
      origin: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      tail: 0,
      head: 1,
      whip: 1,
      whipPhase: 0,
      rise: 0,
      flow: 0,
      seed: 0,
      harden: 0,
      crack: 0,
      shatter: 0,
      fade: 1
    };
    this._trailState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      startAt: 0,
      length: 1,
      wetTo: 0,
      footPhase: 0,
      drain: 0,
      seed: 0
    };
    this._glintState = { center: new Vector3(), size: 1, angle: 0, intensity: 0 };

    this._seed = 0;
    this._whip = 0;
    this._flow = 0;
    this._spinGlint = 0;
    this._head = 0;
    this._prevHead = 0;
    this._shattered = false;
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

    /* ---- spray: beads off the crest, real gravity ---- */
    this.spray = particles.get('glasstide.spray', {
      capacity: 2400,
      shape: ParticleShape.DROPLET,
      additive: false,
      stretch: true,
      softFade: 0.2
    });
    this.spray.uniforms.uSizeIn.value = 0.05;
    this.spray.uniforms.uFadeIn.value = 0.03;
    this.spray.uniforms.uFadeOut.value = 0.4;
    this.spray.uniforms.uEndSize.value = 0.6;
    this.spray.uniforms.uDrag.value = 0.5;

    /* ---- mist off the foot ---- */
    this.mist = particles.get('glasstide.mist', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1.0
    });
    this.mist.uniforms.uSizeIn.value = 0.2;
    this.mist.uniforms.uFadeIn.value = 0.15;
    this.mist.uniforms.uFadeOut.value = 0.6;
    this.mist.uniforms.uEndSize.value = 2.2;
    this.mist.uniforms.uDrag.value = 1.4;

    /* ---- glints: sparkles riding the crest, additive ---- */
    this.glints = particles.get('glasstide.glints', {
      capacity: 1200,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.1
    });
    this.glints.uniforms.uSizeIn.value = 0.05;
    this.glints.uniforms.uFadeIn.value = 0.05;
    this.glints.uniforms.uFadeOut.value = 0.5;
    this.glints.uniforms.uEndSize.value = 0.2;
    this.glints.uniforms.uDrag.value = 2.0;

    this.sprayEmitter = new RateEmitter();
    this.mistEmitter = new RateEmitter();
    this.glintEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** Seconds of harden + crack + shatter, in settings seconds. */
  _breakSpan() {
    const c = settings[ID];
    return Math.max(0.02, c.hardenTime) + Math.max(0.02, c.crackTime) + Math.max(0.05, c.shatterTime);
  }

  /** The impact phase is the hardening, the cracking and the shatter. */
  get impactDuration() {
    return Math.max(0.05, this._breakSpan() * settings.global.lifetime);
  }

  /** The fade is the shards falling and the trail draining. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  /** Caustic shimmer on the light. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 13.1) * Math.sin(this.age * 4.3 + 0.7));
  }

  /* ------------------------------------------------------------------ */
  /* The sheet on the CPU — twin of SHEET_GLSL                           */
  /* ------------------------------------------------------------------ */

  _whipEnv(s) {
    return smoothstep(0, 0.35, s) * (1 - 0.55 * smoothstep(0.7, 1, s));
  }

  /** Metres the sheet sits off the line at `s`, `d` metres along it. */
  _sheetLat(s, d) {
    const c = settings[ID];
    const st = this._sheetState;
    return c.whipAmp * st.whip * this._whipEnv(s) * Math.sin((TAU * d) / Math.max(c.whipLength, 0.2) - st.whipPhase);
  }

  _sheetHeight(s) {
    const c = settings[ID];
    let h = c.tailHeight + (c.headHeight - c.tailHeight) * Math.pow(saturate(s), Math.max(c.heightCurve, 0.05));
    h *= 1 - 0.7 * smoothstep(0.93, 1, s);
    h *= smoothstep(0, 0.1, s) * 0.85 + 0.15;
    return h * this._sheetState.rise;
  }

  /** A point on the sheet: `s` 0 tail .. 1 head, `v` 0 floor .. 1 crest. */
  _sheetPoint(s, v, out) {
    const c = settings[ID];
    const st = this._sheetState;
    const d = st.tail + (st.head - st.tail) * s;
    out.copy(this.origin)
      .addScaledVector(this.direction, d + c.crestLean * v * v * s * s)
      .addScaledVector(this.side, this._sheetLat(s, d));
    out.y = this._sheetHeight(s) * v;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    this.sprayEmitter.reset();
    this.mistEmitter.reset();
    this.glintEmitter.reset();

    this._seed = Math.random() * 100;
    this._whip = Math.random() * TAU;
    this._flow = 0;
    this._spinGlint = Math.random() * TAU;
    this._head = c.tailStart + 0.3;
    this._prevHead = this._head;
    this._shattered = false;

    for (let i = 0; i < MAX_SHARDS; i++) this._shardRecs[i].state = 2;
    this._shardUsed = 0;
    this._live = 0;
    this.shards.count = 0;
    this.shards.visible = false;

    const st = this._sheetState;
    st.origin.copy(this.origin);
    st.dir.copy(this.direction);
    st.side.copy(this.side);
    st.seed = this._seed;
    st.whip = 1;
    st.rise = 0;
    st.harden = 0;
    st.crack = 0;
    st.shatter = 0;
    st.fade = 1;
    this._trailState.seed = this._seed;
    this._trailState.drain = 0;
    this._glintState.intensity = 0;

    this.sheet.visible = true;
    this.lens.visible = true;
    this.trail.visible = true;
    this.glint.visible = false;

    this._syncAll();
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

  _syncAll() {
    const c = settings[ID];
    const g = settings.global;
    const st = this._sheetState;
    st.head = this._head;
    st.tail = Math.max(c.tailStart, this._head - Math.max(0.5, c.sheetLength));
    st.whipPhase = this._whip;
    st.flow = this._flow;
    this.sheetMaterial.userData.sync(st);
    this.lensMaterial.userData.sync(st);

    const ts = this._trailState;
    const start = Math.max(0, c.tailStart);
    ts.start.copy(this.origin).addScaledVector(this.direction, start);
    ts.dir.copy(this.direction);
    ts.side.copy(this.side);
    ts.startAt = start;
    ts.length = Math.max(0.2, this.length - start + 1.5);
    ts.wetTo = Math.max(0, this._head - start);
    ts.footPhase = this._whip;
    this.trailMaterial.userData.sync(ts);

    this.glintMaterial.userData.sync(this._glintState);
    this.shardMaterial.userData.sync();

    this.spray.setGradient(getColor(c.colorSprayA), getColor(c.colorSprayB), getColor(c.colorSprayC), getColor(c.colorSprayD));
    const p = this.spray.uniforms;
    p.uGravity.value.set(0, -c.sprayGravity, 0);
    p.uSizeScale.value = g.particleSize;
    p.uLifeScale.value = g.particleLifetime;
    p.uSpeedScale.value = g.particleSpeed;
    p.uOpacity.value = g.opacity;
    p.uGlow.value = 1.4 * g.glow;
    p.uStretch.value = 0.12;
    p.uTurbulence.value = 0.2 * g.turbulence;

    this.mist.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
    const m = this.mist.uniforms;
    m.uGravity.value.set(0, 0.25, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = c.mistOpacity * g.opacity;
    m.uTurbulence.value = 0.6 * g.turbulence;
    m.uSwirl.value = 0.5;
    m.uSwirlExpand.value = 0.5;

    this.glints.setGradient(getColor(c.colorGlintA), getColor(c.colorGlintB), getColor(c.colorGlintC), getColor(c.colorGlintD));
    const k = this.glints.uniforms;
    k.uGravity.value.set(0, -1.5, 0);
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uGlow.value = c.glintGlow * g.glow;
    k.uTurbulence.value = 0.8 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the sheet whips down the line                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._whip += c.whipSpeed * dt * g.animationSpeed;
    this._flow += c.flowSpeed * dt * g.noiseSpeed;
    this._prevHead = this._head;
    this._head = Math.max(c.tailStart + 0.3, this.front);

    const st = this._sheetState;
    st.rise = Easing.outBack(saturate(this.age / Math.max(0.01, c.riseTime)));
    st.whip = 1;
    st.fade = 1;

    this._syncAll();
    this._crestFx(dt, 1);
    this._sheetHits();
    this.ctx.shake.rumble(c.travelRumble, dt);

    this._sheetPoint(1, 0.85, this.position);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the head stops, the sheet turns to glass                   */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    this._head = this.length;
    this._syncAll();

    // The glint: a star at the head where the hardening starts.
    this._sheetPoint(0.97, 0.75, this._glintState.center);
    this._glintState.size = c.glintSize;
    this.glint.visible = true;

    _floor.copy(this.position).setY(0);
    this.ctx.decals.spawn(DecalType.RIPPLE, _floor, {
      radius: c.rippleRadius * 0.6,
      life: 0.7,
      intensity: 0.8,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.shake.add(c.impactShake * 0.35, 8, 18);
    this.lightBoost = c.lightIntensity * 0.8;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._sheetState;

    if (t <= 1) {
      const T = this._breakSpan();
      const tau = t * T;
      const hT = Math.max(0.02, c.hardenTime);
      const cT = Math.max(0.02, c.crackTime);
      const sT = Math.max(0.05, c.shatterTime);
      st.harden = Easing.outCubic(saturate(tau / hT));
      st.crack = saturate((tau - hT) / cT);
      st.shatter = saturate((tau - hT - cT) / sT);
      // The flow and the whip die as it hardens: water stopping, not snapping.
      const slow = 1 - st.harden;
      this._whip += c.whipSpeed * dt * g.animationSpeed * slow * 0.5;
      this._flow += c.flowSpeed * dt * g.noiseSpeed * slow;
      this._spinGlint += dt * 1.2;

      if (!this._shattered && tau >= hT + cT) this._shatter();

      // The star: up as it hardens, peaks as the cracks start, gone by the shatter.
      const gl = this._glintState;
      gl.angle = this._spinGlint;
      gl.intensity = smoothstep(0, hT, tau) * (1 - smoothstep(hT, hT + cT + sT * 0.3, tau)) * 1.6 + (st.crack > 0 && st.crack < 1 ? 0.4 : 0);
      gl.size = c.glintSize * (0.6 + 0.6 * st.harden);
      this.glint.visible = gl.intensity > 0.01;

      this._syncAll();
      if (st.shatter <= 0) this._crestFx(dt, 1 - st.harden);
      this._updateShards(dt);
      this.sheet.visible = st.shatter < 1;
      this.lens.visible = st.shatter < 1;
      return;
    }

    /* the fade: the shards fall and melt, the floor drains */
    const ft = saturate(t - 1);
    this.sheet.visible = false;
    this.lens.visible = false;
    this.glint.visible = false;
    this._trailState.drain = smoothstep(0.1, 1, ft);
    this._syncAll();
    this._updateShards(dt);
    this.position.y = Math.max(0.3, this.position.y - dt * 2);
  }

  /* ------------------------------------------------------------------ */
  /* The shatter                                                         */
  /* ------------------------------------------------------------------ */

  _shatter() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const st = this._sheetState;
    const time = frame.uTime.value;
    this._shattered = true;

    // Load the shards: each one is a cell of the sheet, released in the
    // same order the shader drops the cells (head first, a little random).
    const n = Math.min(MAX_SHARDS, Math.max(0, Math.round(c.shardCount * g.particleCount)));
    const span = Math.max(0.5, st.head - st.tail);
    const sT = Math.max(0.05, c.shatterTime) * g.lifetime;
    for (let i = 0; i < n; i++) {
      const rec = this._shardRecs[i];
      // Crowded toward the head, where the sheet is tallest.
      const s = 1 - Math.pow(Math.random(), 1.4);
      const v = 0.08 + Math.random() * 0.88;
      const fromHead = (1 - s) * span;
      const order = Math.random() * 0.55 + saturate(fromHead / span) * 0.45;
      rec.state = 0;
      rec.delay = (order / 1.08) * sT;
      rec.age = 0;
      rec.s = s;
      rec.v = v;
      rec.face = Math.random() < 0.5 ? -1 : 1;
      rec.size = c.shardSize * (0.55 + Math.random() * 0.9) * (0.6 + 0.6 * s);
      rec.life = c.shardLife * (0.7 + Math.random() * 0.6);
      rec.spin = c.shardSpin * (0.5 + Math.random());
      rec.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      // Start it lying in the sheet: its flat face along the sheet's normal.
      rec.quat.setFromAxisAngle(_up, Math.atan2(this.side.x, this.side.z));
      _q.setFromAxisAngle(rec.axis, Math.random() * 0.6);
      rec.quat.multiply(_q);
      this._sheetPoint(s, v, rec.pos);
    }
    this._shardUsed = n;
    this.shards.count = n;
    this.shards.visible = n > 0;

    /* the beat */
    this._sheetPoint(1, 0, _floor);
    _floor.y = 0;
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.55,
      width: 0.05,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.FOAM, _floor, {
      radius: c.foamRadius,
      life: this.fadeDuration + 0.4,
      intensity: 0.9,
      colorA: getColor(c.colorFoam),
      colorB: getColor(c.colorShallow)
    });
    // Ripples down the sheet's footprint, where the glass comes down.
    for (let i = 0; i < 3; i++) {
      this._sheetPoint(0.25 + i * 0.3, 0, _a);
      _a.y = 0;
      this.ctx.decals.spawn(DecalType.RIPPLE, _a, {
        radius: c.rippleRadius * (0.6 + 0.2 * i),
        life: 0.9,
        intensity: 0.8,
        colorA: getColor(c.colorShockA),
        colorB: getColor(c.colorShockB)
      });
    }
    this._sheetPoint(0.96, 0.5, _a);
    this.ctx.bursts.spawn(BurstMode.WATER, _a, {
      radius: c.burstSize * 0.2,
      endRadius: c.burstSize * power,
      life: 0.45,
      intensity: 1.1,
      opacity: 0.45,
      fresnel: 2.2,
      displace: 0.25,
      turbulence: 0.8,
      squash: 0.8,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    // Spray and glints off the whole face of the sheet as it goes.
    this._resetEmit(time);
    const sprays = Math.round(220 * g.particleCount);
    _emit.speed = c.spraySpeed * 1.4;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.6;
    _emit.size = c.spraySize * 1.2;
    _emit.life = c.sprayLife;
    for (let i = 0; i < sprays; i += 4) {
      this._sheetPoint(1 - Math.pow(Math.random(), 1.4), Math.random(), _pos);
      _dir.copy(this.side).multiplyScalar(Math.random() < 0.5 ? 1 : -1).addScaledVector(_up, 0.9);
      _emit.position = _pos;
      _emit.direction = _dir;
      this.spray.emit(4, _emit);
      this.glints.emit(1, _emit);
    }
    this._resetEmit(time);
    _emit.direction = _up;
    _emit.speed = 0.8;
    _emit.spread = 0.8;
    _emit.size = c.mistSize * 1.3;
    _emit.life = c.mistLife;
    _emit.spin = 0.4;
    for (let i = 0; i < 6; i++) {
      this._sheetPoint(0.3 + Math.random() * 0.7, 0.2, _pos);
      _emit.position = _pos;
      _emit.radius = 0.5;
      this.mist.emit(Math.round(3 * g.particleCount), _emit);
    }

    this.ctx.shake.add(c.impactShake * power, 1 / Math.max(0.05, c.shakeDuration), 26);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;
  }

  /** Fly, tumble, bounce and melt the shards; write the instances. */
  _updateShards(dt) {
    if (this._shardUsed === 0) return;
    const c = settings[ID];
    const g = settings.global;
    const arr = this.shardAttr.array;
    const time = frame.uTime.value;
    let live = 0;
    for (let i = 0; i < this._shardUsed; i++) {
      const rec = this._shardRecs[i];
      if (rec.state === 0) {
        rec.delay -= dt;
        if (rec.delay <= 0) {
          // Thrown off the face it broke from, up, and on along the line.
          this._sheetPoint(rec.s, rec.v, rec.pos);
          rec.vel.copy(this.side).multiplyScalar(rec.face * c.shardSpeed * (0.4 + Math.random() * 0.8));
          rec.vel.addScaledVector(this.direction, c.shardSpeed * 0.35 * (Math.random() - 0.2));
          rec.vel.y += c.shardLift * (0.5 + Math.random() * 0.8) * rec.v;
          rec.vel.multiplyScalar(g.particleSpeed);
          rec.state = 1;
        } else {
          this.shards.setMatrixAt(i, _zero);
          arr[i * 2] = 0;
          continue;
        }
      }
      if (rec.state === 2) {
        this.shards.setMatrixAt(i, _zero);
        arr[i * 2] = 0;
        continue;
      }
      rec.age += dt;
      const k = rec.age / Math.max(0.05, rec.life * g.particleLifetime);
      if (k >= 1) {
        rec.state = 2;
        this.shards.setMatrixAt(i, _zero);
        arr[i * 2] = 0;
        // It melts: a few drops where it was.
        this._resetEmit(time);
        _emit.position = rec.pos;
        _emit.direction = _up;
        _emit.speed = 1.2;
        _emit.spread = 1;
        _emit.size = c.spraySize;
        _emit.life = c.sprayLife * 0.6;
        this.spray.emit(Math.max(1, Math.round(3 * g.particleCount)), _emit);
        continue;
      }
      live++;
      rec.vel.y -= c.shardGravity * dt;
      rec.pos.addScaledVector(rec.vel, dt);
      const floorY = rec.size * c.shardThickness * 0.5 + 0.01;
      if (rec.pos.y < floorY) {
        rec.pos.y = floorY;
        if (rec.vel.y < 0) {
          rec.vel.y = -rec.vel.y * c.shardBounce;
          rec.vel.x *= 0.6;
          rec.vel.z *= 0.6;
          rec.spin *= 0.55;
        }
      }
      _q.setFromAxisAngle(rec.axis, rec.spin * dt);
      rec.quat.multiply(_q);
      const shrink = 1 - smoothstep(0.7, 1, k) * 0.6;
      _scale.set(rec.size * shrink, rec.size * shrink, Math.max(0.005, c.shardThickness));
      _matrix.compose(rec.pos, rec.quat, _scale);
      this.shards.setMatrixAt(i, _matrix);
      arr[i * 2] = 1 - smoothstep(0.55, 1, k);
      arr[i * 2 + 1] = i * 0.618;
    }
    // Shards still waiting in the sheet are not drawn yet but are not gone.
    this._live = live;
    this.shards.instanceMatrix.needsUpdate = true;
    this.shardAttr.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Spray and glints off the crest, mist off the foot, crowded toward the head. */
  _crestFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    const speed = c.speed * g.speed;

    const n = Math.round(this.sprayEmitter.tick(dt, c.sprayRate * strength) * g.particleCount);
    if (n > 0) {
      this._resetEmit(time);
      _emit.size = c.spraySize;
      _emit.life = c.sprayLife;
      _emit.speed = c.spraySpeed;
      _emit.spread = 0.45;
      _vel.copy(this.direction).multiplyScalar(speed * 0.25 * strength);
      _emit.inherit = _vel;
      for (let i = 0; i < n; i++) {
        const s = 1 - Math.pow(Math.random(), 2) * 0.6;
        this._sheetPoint(s, 1, _pos);
        _dir.copy(this.side).multiplyScalar((Math.random() - 0.5) * 1.4).addScaledVector(_up, 1).addScaledVector(this.direction, 0.4);
        _emit.position = _pos;
        _emit.direction = _dir;
        this.spray.emit(1, _emit);
      }
    }

    const m = Math.round(this.glintEmitter.tick(dt, c.glintRate * strength) * g.particleCount);
    if (m > 0) {
      this._resetEmit(time);
      _emit.size = c.glintSize;
      _emit.life = 0.4;
      _emit.speed = 0.6;
      _emit.spread = 1;
      for (let i = 0; i < m; i++) {
        this._sheetPoint(0.3 + Math.random() * 0.7, 0.75 + Math.random() * 0.25, _pos);
        _emit.position = _pos;
        this.glints.emit(1, _emit);
      }
    }

    const p = Math.round(this.mistEmitter.tick(dt, c.mistRate * strength) * g.particleCount);
    if (p > 0) {
      this._resetEmit(time);
      _emit.size = c.mistSize;
      _emit.life = c.mistLife;
      _emit.speed = 0.6;
      _emit.spread = 0.6;
      _emit.spin = 0.4;
      _emit.direction = _up;
      for (let i = 0; i < p; i++) {
        this._sheetPoint(0.55 + Math.random() * 0.45, 0.05, _pos);
        _emit.position = _pos;
        _emit.anchor = _pos;
        this.mist.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* The cut                                                             */
  /* ------------------------------------------------------------------ */

  /** Every body the head has passed this frame, if the sheet is over it. */
  _sheetHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const from = Math.max(0, this._prevHead - 0.5);
    const to = this._head + 0.3;
    if (to <= from) return;
    const mid = (from + to) * 0.5;
    this.pointAt(Math.min(1, mid / this.length), _floor);
    const reach = Math.hypot((to - from) * 0.5, c.hitWidth + c.whipAmp);
    const found = field.findTargets(_floor.x, _floor.z, reach, this._found);
    if (found.length === 0) return;

    const power = g.explosionIntensity;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    const st = this._sheetState;
    const span = Math.max(0.5, st.head - st.tail);

    for (const dummy of found) {
      const dx = dummy.position.x - this.origin.x;
      const dz = dummy.position.z - this.origin.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      if (along < from || along > to) continue;
      const s = saturate((along - st.tail) / span);
      const lat = dx * this.side.x + dz * this.side.z;
      const sheetLat = this._sheetLat(s, along);
      if (Math.abs(lat - sheetLat) > c.hitWidth) continue;
      // Thrown the way the sheet is whipping at that point.
      const phase = (TAU * along) / Math.max(c.whipLength, 0.2) - st.whipPhase;
      const sweep = -Math.cos(phase) >= 0 ? 1 : -1;
      _dir.copy(this.side).multiplyScalar(sweep).addScaledVector(this.direction, c.hitForward).normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force, c.slice >= 0.5)) continue;

      // A splash of glass-bright spray off the cut.
      this._resetEmit(frame.uTime.value);
      _pos.copy(dummy.position).setY(1.1);
      _emit.position = _pos;
      _emit.radius = 0.25;
      _emit.direction = _dir;
      _emit.speed = c.spraySpeed * 1.5;
      _emit.spread = 0.7;
      _emit.size = c.spraySize * 1.2;
      _emit.life = c.sprayLife;
      this.spray.emit(Math.round(30 * g.particleCount), _emit);
      this.glints.emit(Math.round(10 * g.particleCount), _emit);
      this.ctx.shake.add(c.impactShake * 0.25, 8, 20);
      this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.6);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.sheet.visible = false;
    this.lens.visible = false;
    this.trail.visible = false;
    this.glint.visible = false;
    this.shards.visible = false;
    this.shards.count = 0;
    for (let i = 0; i < MAX_SHARDS; i++) this._shardRecs[i].state = 2;
    this._shardUsed = 0;
    this._live = 0;
  }

  dispose() {
    this.sheetGeometry.dispose();
    this.trailGeometry.dispose();
    this.quadGeometry.dispose();
    this.shardGeometry.dispose();
    this.sheetMaterial.dispose();
    this.lensMaterial.dispose();
    this.trailMaterial.dispose();
    this.shardMaterial.dispose();
    this.glintMaterial.dispose();
    this.shards.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◇  Glass Tide');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'head speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'shards & trail last (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'shimmer');

  const shape = folder.addFolder('1 · Sheet shape');
  R(shape, c, 'tailStart', 0, 4, 0.01, 'starts after (m)');
  R(shape, c, 'sheetLength', 0.5, 20, 0.05, 'length behind head (m)');
  R(shape, c, 'headHeight', 0.2, 8, 0.01, 'height at head (m)');
  R(shape, c, 'tailHeight', 0, 4, 0.01, 'height at tail (m)');
  R(shape, c, 'heightCurve', 0.1, 5, 0.01, 'height curve');
  R(shape, c, 'crestLean', -2, 3, 0.01, 'crest lean (m)');
  R(shape, c, 'riseTime', 0.01, 1, 0.005, 'stands up over (s)');
  R(shape, c, 'whipAmp', 0, 4, 0.01, 'whip (m)');
  R(shape, c, 'whipLength', 0.5, 20, 0.05, 'whip wavelength (m)');
  R(shape, c, 'whipSpeed', 0, 40, 0.1, 'whip speed (rad/s)');
  R(shape, c, 'crestRoll', 0, 1, 0.005, 'crest roll (m)');
  R(shape, c, 'crestScale', 0.1, 6, 0.01, 'crest roll scale');
  R(shape, c, 'crestTear', 0, 2, 0.01, 'crest tear');

  const water = folder.addFolder('2 · Water & glass');
  R(water, c, 'glassOpacity', 0, 1, 0.01, 'opacity');
  R(water, c, 'fresnelPower', 0.2, 8, 0.05, 'fresnel power');
  R(water, c, 'fresnelGlow', 0, 8, 0.05, 'fresnel glow');
  R(water, c, 'envAmount', 0, 3, 0.01, 'sky reflection');
  R(water, c, 'causticScale', 0.1, 6, 0.01, 'caustic cells per m');
  R(water, c, 'causticGlow', 0, 10, 0.05, 'caustic glow');
  R(water, c, 'streakScale', 0.1, 5, 0.01, 'streak density');
  R(water, c, 'flowSpeed', 0, 30, 0.1, 'flow (m/s)');
  R(water, c, 'crestGlow', 0, 15, 0.05, 'crest glow');
  R(water, c, 'crestWidth', 0.005, 0.5, 0.005, 'crest width (m)');
  R(water, c, 'baseFoam', 0, 4, 0.01, 'foam at the foot');
  R(water, c, 'softFade', 0.01, 2, 0.01, 'soft intersection (m)');
  water.addColor(c, 'colorDeep').name('deep');
  water.addColor(c, 'colorShallow').name('shallow');
  water.addColor(c, 'colorCrest').name('crest');
  water.addColor(c, 'colorCaustic').name('caustics');

  const glass = folder.addFolder('3 · Harden & shatter');
  R(glass, c, 'hardenTime', 0.02, 1, 0.005, 'hardens over (s)');
  R(glass, c, 'crackTime', 0.02, 1, 0.005, 'cracks over (s)');
  R(glass, c, 'shatterTime', 0.05, 2, 0.01, 'shatters over (s)');
  R(glass, c, 'crackScale', 0.2, 6, 0.01, 'glass cells per m');
  R(glass, c, 'crackGlow', 0, 20, 0.05, 'crack glow');
  R(glass, c, 'glintFlare', 0, 12, 0.05, 'star glint');
  R(glass, c, 'glintSize', 0.1, 6, 0.01, 'glint size (m)');
  R(glass, c, 'shardCount', 0, MAX_SHARDS, 1, 'shards');
  R(glass, c, 'shardSize', 0.02, 1.5, 0.005, 'shard size (m)');
  R(glass, c, 'shardThickness', 0.005, 0.4, 0.005, 'shard thickness (m)');
  R(glass, c, 'shardSpeed', 0, 20, 0.05, 'thrown (m/s)');
  R(glass, c, 'shardLift', 0, 12, 0.05, 'lift (m/s)');
  R(glass, c, 'shardSpin', 0, 30, 0.1, 'tumble (rad/s)');
  R(glass, c, 'shardGravity', 0, 40, 0.1, 'gravity (m/s²)');
  R(glass, c, 'shardBounce', 0, 1, 0.01, 'bounce');
  R(glass, c, 'shardLife', 0.1, 5, 0.05, 'melt after (s)');
  R(glass, c, 'shardOpacity', 0, 1, 0.01, 'shard opacity');
  R(glass, c, 'shardGlow', 0, 10, 0.05, 'shard rim glow');

  const lens = folder.addFolder('4 · Refraction');
  R(lens, c, 'refractStrength', 0, 4, 0.01, 'strength');
  R(lens, c, 'refractScale', 0.1, 6, 0.01, 'ripple scale');

  const trail = folder.addFolder('5 · Wet trail');
  R(trail, c, 'trailWidth', 0.05, 5, 0.01, 'half-width (m)');
  R(trail, c, 'trailDarken', 0, 1, 0.01, 'darken');
  R(trail, c, 'trailGlint', 0, 6, 0.05, 'glints');
  R(trail, c, 'trailFoam', 0, 2, 0.01, 'foam line');
  trail.addColor(c, 'colorWet').name('wet floor');
  trail.addColor(c, 'colorFoam').name('foam');

  const fx = folder.addFolder('6 · Spray, mist & glints');
  R(fx, c, 'sprayRate', 0, 800, 1, 'spray/second');
  R(fx, c, 'spraySize', 0.005, 0.4, 0.001, 'spray size');
  R(fx, c, 'spraySpeed', 0, 15, 0.05, 'spray speed');
  R(fx, c, 'sprayGravity', 0, 30, 0.1, 'spray gravity');
  R(fx, c, 'sprayLife', 0.1, 4, 0.05, 'spray lifetime');
  R(fx, c, 'mistRate', 0, 200, 1, 'mist/second');
  R(fx, c, 'mistSize', 0.05, 4, 0.01, 'mist size');
  R(fx, c, 'mistLife', 0.1, 6, 0.05, 'mist lifetime');
  R(fx, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  R(fx, c, 'glintRate', 0, 400, 1, 'glints/second');
  R(fx, c, 'glintSize', 0.005, 0.4, 0.001, 'glint size');
  R(fx, c, 'glintGlow', 0, 12, 0.05, 'glint glow');
  Editor.gradient(fx, c, 'colorSpray', 'spray gradient');
  Editor.gradient(fx, c, 'colorMist', 'mist gradient');
  Editor.gradient(fx, c, 'colorGlint', 'glint gradient');

  const beat = folder.addFolder('7 · Shatter beat');
  R(beat, c, 'shockRadius', 0, 16, 0.05, 'ring (m)');
  R(beat, c, 'rippleRadius', 0, 10, 0.05, 'ripples (m)');
  R(beat, c, 'foamRadius', 0, 8, 0.05, 'foam (m)');
  R(beat, c, 'burstSize', 0, 6, 0.05, 'water shell (m)');
  R(beat, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(beat, c, 'impactShake', 0, 1.5, 0.01, 'camera knock');
  R(beat, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(beat, c, 'impactLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(beat, c, 'travelRumble', 0, 1, 0.01, 'rumble while running');
  beat.addColor(c, 'colorShockA').name('ring');
  beat.addColor(c, 'colorShockB').name('ring hot');
  beat.addColor(c, 'colorBurstA').name('shell inner');
  beat.addColor(c, 'colorBurstB').name('shell mid');
  beat.addColor(c, 'colorBurstC').name('shell outer');
  beat.addColor(c, 'colorFlash').name('flash');

  const cut = folder.addFolder('8 · The cut');
  R(cut, c, 'hitWidth', 0.1, 4, 0.01, 'reach either side (m)');
  R(cut, c, 'hitImpulse', 0, 25, 0.1, 'thrown (m/s)');
  R(cut, c, 'hitLift', 0, 15, 0.05, 'lift (m/s)');
  R(cut, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(cut, c, 'hitForward', -1, 2, 0.01, 'share along the line');
  R(cut, c, 'slice', 0, 1, 1, 'cut in two');

  folder.close();
  return folder;
}
