import { CylinderGeometry, Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createVeinNetGeometry, createVeinFeederGeometry } from '../../assets/codex/VeinLatticeGeometry.js';
import {
  createVeinNetMaterial,
  createVeinFeederMaterial,
  createVeinFloorMaterial,
  createVeinThrobMaterial
} from '../../materials/codex/VeinLatticeMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'veinlattice';

const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _up = new Vector3(0, 1, 0);
/** The topology sliders this frame — compared against the built net without allocating. */
const _netVals = new Float64Array(7);

/** Push one particle system's gradient and the globals through. */
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

/** A clean emit record — every field set, so nothing leaks between emitters. */
function resetEmit() {
  _emit.position = _pos;
  _emit.radius = 0;
  _emit.direction = _up;
  _emit.speed = 0;
  _emit.speedVariance = 0.4;
  _emit.spread = 0.5;
  _emit.inherit = null;
  _emit.anchor = null;
  _emit.size = 0.1;
  _emit.sizeVariance = 0.4;
  _emit.life = 1;
  _emit.lifeVariance = 0.35;
  _emit.spin = 0;
  _emit.tint = null;
  _emit.time = frame.uTime.value;
}

/**
 * VEIN LATTICE — Blood, zone cast.
 *
 * Organic, and alive. A **feeder vein** burrows down the line from the
 * caster's feet, half-sunk in the floor, pulses of blood racing along it.
 * Where it reaches the circle the floor **bruises** and a **capillary web**
 * spreads through the bruise; then **trunks climb out of the rim**, fork, and
 * re-join their neighbours' branches up the wall — a diamond net of veins,
 * knotted where they meet, thinning as they climb, curling inward at the top
 * into tapering tendrils. Pulses of bright blood run up every vein. Once it
 * stands it **beats**: on each lub-dub the whole lattice constricts toward
 * the centre and every tube swells, the blood glares, the air throbs, a ring
 * runs out through the floor's capillaries, droplets burst off the knots and
 * the camera jolts. Then it **drains**: the glow dies, and the veins wither
 * from the tendrils down to the roots, greying and thinning, while the bruise
 * fades.
 *
 * It is the opposite of a *geometric* cage: nothing in it is straight, every
 * vein bows, every node is jittered, a share of the links is missing.
 *
 * ## Layers
 *
 *   1. **the lattice** (`createVeinNetGeometry` + `createVeinNetMaterial`) —
 *      the net, built once in cylinder parameter space and inflated in the
 *      vertex stage, on `LAYER.SHAPED`: radius, height, thickness, sway,
 *      constriction, growth and withering are uniforms. Tissue shading: a
 *      mottled bruise-purple skin with capillaries, blood glowing through it,
 *      a red silhouette rim, pulses that run up and swell the tube.
 *   2. **the feeder** (`createVeinFeederMaterial`) — the same tissue, laid
 *      down the cast line, growing with the travel front.
 *   3. **the floor** (`createVeinFloorMaterial`) — bruise + two-scale warped
 *      capillary web, beat rings running out through it.
 *   4. **drops** (DROPLET), **mist** (SMOKE) and **motes** (SOFT, additive) —
 *      burst off the knots on every beat, dripping off them while it stands,
 *      a low red mist, and glowing motes rising off the veins.
 *   5. **the throb** (`createVeinThrobMaterial`) — an open cylinder on
 *      `LAYER.DISTORTION` that bends the air on each beat.
 *   6. **the beat** — on arrival a CRACK decal at the heart and a jolt; the
 *      first beat throws a SHOCKWAVE and a flash; every beat a shake and a
 *      light punch.
 *
 * Hits are the engine's: everything inside the circle falls on arrival.
 *
 * ## The editor rule
 *
 * The net's *topology* (count, levels, jitter, gaps, bow, curl, seed) is the
 * geometry, rebuilt only when one of those sliders moves. Everything else —
 * radius, height, thickness, timing, colours, the heartbeat — is resolved
 * from `settings.veinlattice` every frame.
 */
export class VeinLatticeAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** Knots in the net. HUD readout only. */
  get instanceCount() {
    return this.isActive && this._clock >= 0 ? this._nodeCount : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the lattice ---- */
    this.netMaterial = createVeinNetMaterial();
    this.netGeometry = null;
    this._nodes = null;
    this._nodeCount = 0;
    this._roots = 1;
    this._levels = 1;
    this._netKey = [-1, -1, -1, -1, -1, -1, -1];
    this.net = this._mesh(this._netGeometry(), this.netMaterial, LAYER.SHAPED, 4);

    /* ---- layer 2: the feeder ---- */
    this.feederGeometry = createVeinFeederGeometry(160, 6);
    this.feederMaterial = createVeinFeederMaterial();
    this.feeder = this._mesh(this.feederGeometry, this.feederMaterial, LAYER.SHAPED, 3);

    /* ---- layer 3: the floor ---- */
    this.floorGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.floorMaterial = createVeinFloorMaterial();
    this.floor = this._mesh(this.floorGeometry, this.floorMaterial, LAYER.VFX, 2);

    /* ---- layer 5: the throb ---- */
    this.throbGeometry = new CylinderGeometry(1, 1, 1, 40, 1, true);
    this.throbGeometry.translate(0, 0.5, 0);
    this.throbMaterial = createVeinThrobMaterial();
    this.throb = this._mesh(this.throbGeometry, this.throbMaterial, LAYER.DISTORTION, 0);

    /** Scratch state handed to the materials — one object apiece, reused. */
    this._netState = { centre: new Vector3(), radius: 4, height: 3, squeeze: 0, grow: 0, wither: 0, beat: 0, pulse: 0 };
    this._feedState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      front: 0,
      seed: 0,
      wither: 0,
      beat: 0,
      pulse: 0
    };
    this._floorState = { centre: new Vector3(), radius: 4, front: 0, seed: 0, beat: 0, beatRing: 0, fade: 0 };
    this._throbState = { beat: 0, seed: 0 };

    this._seed = 0;
    this._clock = -1;
    this._pulse = 0;
    this._beatIndex = -1;
    this._beatAt = -1;
    this._beatNow = 0;
  }

  _mesh(geometry, material, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.drops = particles.get('veinlattice.drops', {
      capacity: 1600,
      shape: ParticleShape.DROPLET,
      additive: false,
      softFade: 0.1
    });
    this.drops.uniforms.uDrag.value = 0.3;
    this.drops.uniforms.uEndSize.value = 0.6;
    this.drops.uniforms.uSizeIn.value = 0.03;
    this.drops.uniforms.uFadeIn.value = 0.02;
    this.drops.uniforms.uFadeOut.value = 0.3;

    this.mist = particles.get('veinlattice.mist', {
      capacity: 700,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.8
    });
    this.mist.uniforms.uDrag.value = 1.4;
    this.mist.uniforms.uEndSize.value = 2.2;
    this.mist.uniforms.uSizeIn.value = 0.2;
    this.mist.uniforms.uFadeIn.value = 0.2;
    this.mist.uniforms.uFadeOut.value = 0.55;

    this.motes = particles.get('veinlattice.motes', {
      capacity: 1400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.motes.uniforms.uDrag.value = 1.2;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uSizeIn.value = 0.08;
    this.motes.uniforms.uFadeIn.value = 0.08;
    this.motes.uniforms.uFadeOut.value = 0.5;

    this.dripEmitter = new RateEmitter();
    this.mistEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  /** The net, rebuilt only when a topology slider moves. */
  _netGeometry() {
    const c = settings[ID];
    const key = this._netKey;
    const vals = _netVals;
    vals[0] = Math.round(c.veinCount);
    vals[1] = Math.round(c.levels);
    vals[2] = c.netJitter;
    vals[3] = c.netGaps;
    vals[4] = c.veinBow;
    vals[5] = c.topCurl;
    vals[6] = Math.round(c.netSeed);
    let same = !!this.netGeometry;
    for (let i = 0; i < vals.length && same; i++) if (key[i] !== vals[i]) same = false;
    if (same) return this.netGeometry;
    for (let i = 0; i < vals.length; i++) key[i] = vals[i];
    const old = this.netGeometry;
    const built = createVeinNetGeometry({
      roots: Math.max(3, Math.min(24, vals[0])),
      levels: Math.max(1, Math.min(8, vals[1])),
      jitter: vals[2],
      gaps: vals[3],
      bow: vals[4],
      curl: vals[5],
      seed: vals[6] + 1
    });
    this.netGeometry = built.geometry;
    this._nodes = built.nodes;
    this._nodeCount = built.nodes.length / 3;
    this._roots = built.roots;
    this._levels = built.levels;
    if (this.net) this.net.geometry = this.netGeometry;
    old?.dispose();
    return this.netGeometry;
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  /** When the lattice has climbed to its tips. */
  _grownAt(c, g) {
    return (Math.max(0, c.growDelay) + Math.max(0.05, c.growTime)) * g.lifetime;
  }

  get impactDuration() {
    const c = settings[ID];
    const g = settings.global;
    return this._grownAt(c, g) + Math.max(0.05, c.lifetime * g.lifetime);
  }

  get fadeDuration() {
    const c = settings[ID];
    const g = settings.global;
    return (Math.max(0.05, c.witherTime) + Math.max(0.05, c.floorFade)) * g.lifetime;
  }

  /** The light throbs with the heart. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * 0.6 + f * 0.6 * this._beatNow;
  }

  /** 0..1 lub-dub envelope at `t` seconds into the beating. */
  _heart(t, rate) {
    const k = (t * rate) % 1;
    return Math.exp(-Math.pow((k - 0.06) / 0.05, 2)) + 0.6 * Math.exp(-Math.pow((k - 0.24) / 0.05, 2));
  }

  /* ------------------------------------------------------------------ */
  /* The CPU twin of the net's placement                                 */
  /* ------------------------------------------------------------------ */

  /** World position of node `i`, as `NET_VERTEX` places it. */
  _nodeWorld(i, out) {
    const st = this._netState;
    const th = this._nodes[i * 3];
    const h = this._nodes[i * 3 + 1];
    const rf = this._nodes[i * 3 + 2];
    const squeeze = 1 - st.squeeze * (0.35 + 0.65 * h);
    const r = st.radius * rf * squeeze;
    return out.set(st.centre.x + Math.cos(th) * r, h * st.height, st.centre.z + Math.sin(th) * r);
  }

  /** How far growth (0..1) must reach before node `i` exists. */
  _nodeGrow(i) {
    const k = Math.floor(i / this._roots);
    return k / (this._levels + 1);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._clock = -1;
    this._pulse = 0;
    this._beatIndex = -1;
    this._beatAt = -1;
    this._beatNow = 0;
    this.dripEmitter.reset();
    this.mistEmitter.reset();
    this.moteEmitter.reset();
    this._netGeometry();

    this._feedState.seed = this._seed;
    this._floorState.seed = this._seed;
    this._throbState.seed = this._seed;
    this._netState.grow = 0;
    this._netState.wither = 0;
    this._netState.squeeze = 0;

    this.net.visible = false;
    this.floor.visible = false;
    this.throb.visible = false;
    this.feeder.visible = true;
    this._sync(0);
  }

  /** Resolve the whole cast from settings at the current clock. */
  _sync(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._netGeometry();
    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const R = Math.max(0.5, c.zoneRadius);

    this._pulse += c.pulseSpeed * dt * g.animationSpeed;

    /* --- the heart --- */
    const grownAt = this._grownAt(c, g);
    let beat = 0;
    if (clock >= grownAt) {
      const t = clock - grownAt;
      beat = this._heart(t, Math.max(0.1, c.beatRate));
      const idx = Math.floor(t * Math.max(0.1, c.beatRate));
      if (idx !== this._beatIndex && (t * c.beatRate) % 1 > 0.04) {
        this._beatIndex = idx;
        this._beatAt = clock;
        this._beatFx(c, g, idx === 0);
      }
      if (fading) beat *= 1 - saturate(this.fadeTime / Math.max(0.05, c.witherTime * g.lifetime * 0.5));
    }
    this._beatNow = beat;

    /* --- the lattice --- */
    const ns = this._netState;
    this.pointAt(1, ns.centre);
    ns.radius = R;
    ns.height = Math.max(0.2, c.wallHeight);
    ns.squeeze = beat * c.beatSqueeze;
    ns.grow = clock < 0 ? 0 : Easing.outCubic(saturate((clock - c.growDelay * g.lifetime) / Math.max(0.05, c.growTime * g.lifetime))) * 1.08;
    ns.wither = fading ? Easing.inOutQuad(saturate(this.fadeTime / Math.max(0.05, c.witherTime * g.lifetime))) * 1.25 : 0;
    ns.beat = beat;
    ns.pulse = this._pulse;
    this.netMaterial.userData.sync(ns);
    this.net.visible = clock >= 0 && ns.wither < 1.24;

    /* --- the feeder --- */
    const fs = this._feedState;
    fs.start.copy(this.origin);
    fs.dir.copy(this.direction);
    fs.side.copy(this.side);
    fs.length = Math.max(0.5, this.length - R * 0.15);
    fs.front = clock < 0 ? this.front : this.length + 1;
    fs.wither = fading ? saturate(this.fadeTime / Math.max(0.05, c.witherTime * g.lifetime)) : 0;
    fs.beat = beat;
    fs.pulse = this._pulse;
    this.feederMaterial.userData.sync(fs);
    this.feeder.visible = fs.wither < 1;

    /* --- the floor --- */
    const fl = this._floorState;
    fl.centre.copy(ns.centre);
    fl.radius = R;
    fl.front = clock < 0 ? 0 : Easing.outCubic(saturate(clock / Math.max(0.05, c.webTime * g.lifetime))) * (R * 1.3 + 0.6);
    fl.beat = beat;
    fl.beatRing = this._beatAt >= 0 ? (clock - this._beatAt) * c.beatRingSpeed : 0;
    if (fl.beatRing > R * 1.5) fl.beatRing = 0;
    let fade = 0;
    if (fading) {
      const ff = Math.max(0.05, c.floorFade * g.lifetime);
      fade = saturate((this.fadeTime - (this.fadeDuration - ff)) / ff);
    }
    fl.fade = fade;
    this.floorMaterial.userData.sync(fl);
    this.floor.visible = clock >= 0 && fade < 1;

    /* --- the throb --- */
    this._throbState.beat = beat;
    this.throbMaterial.userData.sync(this._throbState);
    this.throb.position.set(ns.centre.x, 0, ns.centre.z);
    this.throb.scale.set(R * 1.05, ns.height * 1.2, R * 1.05);
    this.throb.updateMatrix();
    this.throb.visible = beat > 0.02;

    /* --- particle looks --- */
    syncSystem(this.drops, c.colorDropA, c.colorDropB, c.colorDropC, c.colorDropD, 1, 0.05);
    this.drops.uniforms.uGravity.value.set(0, c.dropGravity, 0);
    syncSystem(this.mist, c.colorMistA, c.colorMistB, c.colorMistC, c.colorMistD, 1, 0.5);
    this.mist.uniforms.uOpacity.value = c.mistOpacity * g.opacity;
    this.mist.uniforms.uGravity.value.set(0, 0.15, 0);
    syncSystem(this.motes, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.moteGlow * g.glow, 0.8);
    this.motes.uniforms.uGravity.value.set(0, c.moteRise * 0.5, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /** One heartbeat. */
  _beatFx(c, g, first) {
    const power = g.explosionIntensity;
    this.ctx.shake.add(c.beatShake * power, 4, 14);
    this.lightBoost = c.beatLight * power;
    const centre = this._netState.centre;
    if (first) {
      this.ctx.flash.trigger(getColor(c.colorFlash), c.flash * power);
      this.ctx.decals.spawn(DecalType.SHOCKWAVE, centre, {
        radius: c.shockRadius * power,
        life: c.shockLife,
        width: 0.07,
        intensity: 1,
        colorA: getColor(c.colorShockA),
        colorB: getColor(c.colorShockB),
        height: 0.03
      });
    }
    // Blood bursts off the knots.
    if (!this._nodes) return;
    resetEmit();
    _emit.speed = c.dropSpeed;
    _emit.spread = 1;
    _emit.size = c.dropSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.dropLifetime;
    const per = Math.max(0, Math.round(c.dropCount * g.particleCount));
    const grow = this._netState.grow;
    for (let i = this._roots; i < this._nodeCount; i++) {
      if (this._nodeGrow(i) > grow || Math.random() > 0.6) continue;
      _emit.position = this._nodeWorld(i, _pos);
      this.drops.emit(per, _emit);
    }
  }

  _standFx(dt, c, g) {
    if (!this._nodes || this._clock < 0) return;
    const fading = this.phase === AbilityPhase.FADE;
    const grow = this._netState.grow;
    const alive = fading ? 1 - saturate(this._netState.wither) : 1;

    /* drips off the knots */
    const drips = Math.round(this.dripEmitter.tick(dt, c.dripRate * alive * saturate(grow)) * g.particleCount);
    if (drips > 0) {
      resetEmit();
      _emit.speed = 0.2;
      _emit.spread = 1;
      _emit.size = c.dropSize * 0.7;
      _emit.life = c.dropLifetime * 1.2;
      for (let k = 0; k < drips; k++) {
        const i = this._roots + ((Math.random() * (this._nodeCount - this._roots)) | 0);
        if (this._nodeGrow(i) > grow) continue;
        _emit.position = this._nodeWorld(i, _pos);
        this.drops.emit(1, _emit);
      }
    }

    /* glowing motes rising off the veins */
    const motes = Math.round(this.moteEmitter.tick(dt, c.moteRate * alive * saturate(grow)) * g.particleCount);
    if (motes > 0) {
      resetEmit();
      _emit.radius = 0.15;
      _emit.speed = c.moteRise;
      _emit.spread = 0.6;
      _emit.size = c.moteSize;
      _emit.sizeVariance = 0.5;
      _emit.life = c.moteLifetime;
      for (let k = 0; k < motes; k++) {
        const i = (Math.random() * this._nodeCount) | 0;
        if (this._nodeGrow(i) > grow) continue;
        // Somewhere between this knot and the one above it.
        this._nodeWorld(i, _pos);
        const j = Math.min(this._nodeCount - 1, i + this._roots);
        this._nodeWorld(j, _dir);
        _pos.lerp(_dir, Math.random() * 0.8);
        _emit.position = _pos;
        this.motes.emit(1, _emit);
      }
    }

    /* a low red mist over the bruise */
    const mists = Math.round(this.mistEmitter.tick(dt, c.mistRate * alive) * g.particleCount);
    if (mists > 0) {
      resetEmit();
      _emit.speed = 0.3;
      _emit.spread = 1;
      _emit.size = c.mistSize;
      _emit.life = c.mistLifetime;
      _emit.spin = 0.4;
      const R = Math.max(0.5, c.zoneRadius);
      const centre = this._netState.centre;
      for (let k = 0; k < mists; k++) {
        const a = Math.random() * TAU;
        const r = R * Math.sqrt(Math.random()) * 1.05;
        _emit.position = _pos.set(centre.x + Math.cos(a) * r, 0.2, centre.z + Math.sin(a) * r);
        this.mist.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._clock = -1;
    this._sync(dt);
    this.position.y = 0.3;
  }

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._clock = 0;
    this.pointAt(1, _centre);
    this.ctx.shake.add(c.arriveShake * power, 5, 16);
    this.ctx.decals.spawn(DecalType.CRACK, _centre, {
      radius: c.crackRadius,
      life: c.crackLife * g.lifetime,
      intensity: 1,
      colorA: getColor(c.colorCrackA),
      colorB: getColor(c.colorCrackB),
      width: 0.1,
      height: 0.02
    });
    resetEmit();
    _emit.position = _pos.copy(_centre).setY(0.1);
    _emit.radius = 0.5;
    _emit.speed = c.dropSpeed * 1.2;
    _emit.spread = 0.6;
    _emit.size = c.dropSize * 1.2;
    _emit.sizeVariance = 0.6;
    _emit.life = c.dropLifetime;
    this.drops.emit(Math.round(c.dropCount * 6 * g.particleCount), _emit);
    this.lightBoost = c.beatLight * 0.5 * power;
  }

  onFade(dt) {
    const c = settings[ID];
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this._sync(dt);
    this._standFx(dt, c, settings.global);
    this.pointAt(1, _centre);
    this.position.set(_centre.x, c.lightHeight, _centre.z);
  }

  onDestroy() {
    this._clock = -1;
    this._beatNow = 0;
    this.net.visible = false;
    this.feeder.visible = false;
    this.floor.visible = false;
    this.throb.visible = false;
  }

  dispose() {
    this.netGeometry?.dispose();
    this.feederGeometry.dispose();
    this.floorGeometry.dispose();
    this.throbGeometry.dispose();
    this.netMaterial.dispose();
    this.feederMaterial.dispose();
    this.floorMaterial.dispose();
    this.throbMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⟁  Vein Lattice');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'feeder burrows at (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('accent, pale');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'webTime', 0.05, 2, 0.01, 'web spreads over');
  R(time, c, 'growDelay', 0, 1, 0.01, 'veins climb after');
  R(time, c, 'growTime', 0.05, 3, 0.01, 'climb to the tips over');
  R(time, c, 'lifetime', 0.05, 6, 0.05, 'beats for');
  R(time, c, 'witherTime', 0.05, 3, 0.01, 'withers over');
  R(time, c, 'floorFade', 0.05, 3, 0.01, 'bruise fades over');

  const net = folder.addFolder('1 · Lattice');
  R(net, c, 'veinCount', 3, 24, 1, 'trunks');
  R(net, c, 'levels', 1, 8, 1, 'forks up the wall');
  R(net, c, 'wallHeight', 0.3, 8, 0.05, 'height (m)');
  R(net, c, 'netJitter', 0, 1, 0.01, 'knot wander');
  R(net, c, 'netGaps', 0, 0.6, 0.01, 'missing links');
  R(net, c, 'veinBow', 0, 1, 0.01, 'vein bow');
  R(net, c, 'topCurl', 0, 0.9, 0.01, 'curl inward');
  R(net, c, 'veinThickness', 0.01, 0.5, 0.005, 'trunk thickness (m)');
  R(net, c, 'sway', 0, 0.3, 0.005, 'sway (rad)');
  R(net, c, 'netSeed', 0, 50, 1, 'shape seed');

  const tissue = net.addFolder('Tissue');
  tissue.addColor(c, 'colorSkin').name('deep (skin)');
  tissue.addColor(c, 'colorSkinDark').name('deep, shadow');
  tissue.addColor(c, 'colorVeinBody').name('body');
  tissue.addColor(c, 'colorBlood').name('tint (blood)');
  tissue.addColor(c, 'colorVeinHot').name('hot');
  tissue.addColor(c, 'colorCapillary').name('capillaries');
  tissue.addColor(c, 'colorRim').name('rim light');
  R(tissue, c, 'rampBody', 0, 1.2, 0.01, 'sunlight carries ramp');
  R(tissue, c, 'hotBoost', 0, 4, 0.05, 'hot stop HDR');
  R(tissue, c, 'tissueBump', 0, 1, 0.01, 'knotted bump');
  R(tissue, c, 'specularPower', 4, 200, 1, 'wet tightness');
  R(tissue, c, 'mottle', 0, 2, 0.01, 'mottle');
  R(tissue, c, 'capillaries', 0, 1, 0.01, 'capillaries');
  R(tissue, c, 'skinDiffuse', 0, 2, 0.01, 'diffuse');
  R(tissue, c, 'skinAmbient', 0, 1, 0.01, 'ambient');
  R(tissue, c, 'skinSpecular', 0, 3, 0.01, 'wet specular');
  R(tissue, c, 'coreGlow', 0, 6, 0.05, 'blood through skin');
  R(tissue, c, 'rimGlow', 0, 6, 0.05, 'rim glow');
  R(tissue, c, 'pulseGlow', 0, 12, 0.05, 'pulse glow');
  R(tissue, c, 'pulseFreq', 0.2, 8, 0.05, 'pulses per vein');
  R(tissue, c, 'pulseSpeed', 0, 6, 0.05, 'pulses / s');
  R(tissue, c, 'pulseBulge', 0, 1.5, 0.01, 'pulse swell');
  R(tissue, c, 'beatGlow', 0, 10, 0.05, 'beat glare');

  const heart = folder.addFolder('2 · Heartbeat');
  R(heart, c, 'beatRate', 0.1, 4, 0.05, 'beats / s');
  R(heart, c, 'beatSwell', 0, 1.5, 0.01, 'swell');
  R(heart, c, 'beatSqueeze', 0, 0.4, 0.005, 'constrict (× radius)');
  R(heart, c, 'beatShake', 0, 1, 0.01, 'shake');
  R(heart, c, 'beatLight', 0, 60, 0.5, 'light punch');
  R(heart, c, 'throbStrength', 0, 3, 0.01, 'air throb');

  const feed = folder.addFolder('3 · Feeder vein');
  R(feed, c, 'feederThickness', 0.01, 0.5, 0.005, 'thickness (m)');
  R(feed, c, 'feederMeander', 0, 1.5, 0.01, 'meander (m)');

  const floor = folder.addFolder('4 · Floor');
  floor.addColor(c, 'colorBruise').name('bruise');
  floor.addColor(c, 'colorWebLine').name('capillary');
  floor.addColor(c, 'colorWebGlow').name('capillary glow');
  R(floor, c, 'bruise', 0, 1, 0.01, 'bruise');
  R(floor, c, 'webScale', 0.1, 4, 0.01, 'web scale');
  R(floor, c, 'webWarp', 0, 4, 0.01, 'web warp');
  R(floor, c, 'webWidth', 0.005, 0.3, 0.005, 'web line width');
  R(floor, c, 'webGlow', 0, 6, 0.05, 'web glow');
  R(floor, c, 'beatRingSpeed', 0.5, 30, 0.1, 'beat ring speed (m/s)');

  const fx = folder.addFolder('5 · Drops, mist, motes');
  R(fx, c, 'dropCount', 0, 30, 1, 'drops per knot per beat');
  R(fx, c, 'dropSpeed', 0, 12, 0.1, 'drop speed');
  R(fx, c, 'dropSize', 0.01, 0.4, 0.005, 'drop size');
  R(fx, c, 'dropLifetime', 0.1, 3, 0.05, 'drop lifetime');
  R(fx, c, 'dropGravity', -30, 0, 0.5, 'drop gravity');
  R(fx, c, 'dripRate', 0, 200, 1, 'drips / s');
  Editor.gradient(fx, c, 'colorDrop', 'drop colour');
  R(fx, c, 'mistRate', 0, 120, 1, 'mist / s');
  R(fx, c, 'mistSize', 0.1, 4, 0.05, 'mist size');
  R(fx, c, 'mistLifetime', 0.1, 5, 0.05, 'mist lifetime');
  R(fx, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  Editor.gradient(fx, c, 'colorMist', 'mist colour');
  R(fx, c, 'moteRate', 0, 400, 1, 'motes / s');
  R(fx, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(fx, c, 'moteRise', 0, 6, 0.05, 'mote rise');
  R(fx, c, 'moteLifetime', 0.1, 4, 0.05, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'mote colour');

  const beat = folder.addFolder('6 · Arrival');
  R(beat, c, 'arriveShake', 0, 1, 0.01, 'jolt');
  R(beat, c, 'crackRadius', 0, 8, 0.05, 'crack (m)');
  R(beat, c, 'crackLife', 0.1, 6, 0.05, 'crack life');
  beat.addColor(c, 'colorCrackA').name('crack, hot');
  beat.addColor(c, 'colorCrackB').name('crack, dark');
  R(beat, c, 'shockRadius', 0, 16, 0.05, 'first beat ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'ring life');
  beat.addColor(c, 'colorShockA').name('ring');
  beat.addColor(c, 'colorShockB').name('ring, hot');
  R(beat, c, 'flash', 0, 1, 0.01, 'first beat flash');
  beat.addColor(c, 'colorFlash').name('flash');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 6, 0.05, 'height (m)');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'throb');
}
