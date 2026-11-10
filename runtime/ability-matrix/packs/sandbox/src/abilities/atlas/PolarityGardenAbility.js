import {
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  MAX_POLES,
  createPolarityFlareMaterial,
  createPolarityLensMaterial,
  createPolarityMineMaterial,
  createPolarityPillarMaterial,
  createPolarityPlotMaterial,
  createPolarityTetherMaterial
} from '../../materials/atlas/PolarityGardenMaterials.js';
import {
  createCapsuleMineGeometry,
  createFluxTubeGeometry,
  createTetherRibbonGeometry
} from '../../assets/atlas/PolarityGardenGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing, randRange } from '../../utils/math.js';

export const ID = 'polarity';

const TAU = Math.PI * 2;

/** Capsules in the ring, plus the one in the middle. */
const MAX_RING = 12;
const MAX_MINES = MAX_RING + 1;
/** Ring links + cross links + spokes, each up to three field lines. */
const MAX_TETHERS = MAX_RING * 3;
const MAX_LINES = MAX_TETHERS * 3;
/** One shock lens per capsule, plus the lattice's hum. */
const LENS_SLOTS = MAX_MINES + 1;

const _emit = {};
const _centre = new Vector3();
const _pos = new Vector3();
const _dir = new Vector3();
const _hand = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _ctrl = new Vector3();
const _node = new Object3D();
const _up = new Vector3(0, 1, 0);
const _deep = new Color();
const _rim = new Color();

/**
 * POLARITY GARDEN — a planted trap that goes off in order.
 *
 * The capsules leave the hand one after another on high ballistic arcs,
 * tumbling, and plant themselves round the circle with a hop and a puff of
 * dust, fins splaying into the floor, the beacon on top blinking red or blue.
 * When the last one is down, **field lines** reach across between them —
 * round the ring, across it, and out from the centre capsule — and the floor
 * under them lights with the field itself. The lattice hums. Then it goes off
 * as an **ordered cascade**: beginning with the capsule nearest the caster and
 * running round the ring + − + − (or every + and then every −), each one
 * flaring white-hot, its blink racing, before it bursts — a star, a STORM
 * burst in its polarity, a SHOCKWAVE, a scorch, sparks and smoke, a hard ring
 * of screen warp — and its tethers whip loose. The centre capsule goes last
 * and biggest.
 *
 * Layers:
 *
 *   1. **the capsules** — one InstancedMesh of a lathed gunmetal hull with a
 *      raised polarity band, a beacon dome and four hinged fins
 *      (`PolarityGardenGeometry`). Per instance: polarity, beacon, heat and
 *      fin angle, all shaded in `createPolarityMineMaterial`.
 *   2. **the tethers** — instanced camera-facing Bézier ribbons with crawling
 *      dashes from + to −, reaching across as the lattice forms and snapping
 *      back when a capsule goes.
 *   3. **the field plot** — a ground shader that draws the actual field of
 *      the live capsules (summed point charges) as iron filings and crawling
 *      equipotential contours, so the trap reads as one field.
 *   4. **the detonations** — instanced flare stars, STORM bursts, SHOCKWAVE
 *      and SCORCH decals, STREAK sparks, SMOKE, flash, shake, light.
 *   5. **the lenses** — LAYER.DISTORTION: a ring of warp per detonation, and
 *      a faint magnetic shear over the lattice while it is armed.
 *   6. **the flux pillars** — a lathed hourglass column of field over every
 *      planted capsule (`createFluxTubeGeometry` + `createPolarityPillarMaterial`),
 *      red over +, blue over −, flux flowing up out of + and down into −. They
 *      rise as a capsule plants, swell with the lattice, pulse with the blink
 *      and, when their capsule goes, shoot up and burn out — so each pole and
 *      the cascade's order read from across the arena. The field plot also
 *      stamps a halo ring and a pulsing core on the floor under every pole.
 *
 * ## The bodies
 *
 * `handlesOwnHits` is true: the garden is harmless until it goes off, and
 * then it is lethal only *near a detonation*. Each capsule, as it bursts,
 * throws every live body within `killRadius` (× `finaleScale` for the centre)
 * directly away from itself — so a body between two capsules is thrown by
 * whichever goes first.
 *
 * ## The clock
 *
 * One clock from the moment the cast leaves the hand (`this.age`); the
 * throws do not wait for the travel front. Every event — throw, landing,
 * tether, arming, each detonation, the linger — is a *function* of the
 * settings and that clock, recomputed per frame, so dragging `cascadeInterval`
 * or `armTime` retimes a garden that is already planted. The records hold only
 * dice (where on the ring, how it tumbles) and latches (has it gone yet).
 */
export class PolarityGardenAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this.mines.count + this.tethers.count;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the capsules ---- */
    this.mineGeometry = createCapsuleMineGeometry(28);
    this.mineAttr = new InstancedBufferAttribute(new Float32Array(MAX_MINES * 4), 4);
    this.mineGeometry.setAttribute('aMine', this.mineAttr);
    this.mineMaterial = createPolarityMineMaterial();
    this.mines = new InstancedMesh(this.mineGeometry, this.mineMaterial, MAX_MINES);
    this.mines.name = 'PolarityMines';
    // Opaque but on VFX: girth and fins are applied in the vertex stage, and
    // the WORLD depth prepass would draw the raw blank.
    this.mines.layers.set(LAYER.VFX);
    this.mines.renderOrder = 3;
    this.mines.frustumCulled = false;
    this.mines.count = 0;
    this.group.add(this.mines);

    /* ---- layer 2: the tethers ---- */
    this.tetherGeometry = new InstancedBufferGeometry().copy(createTetherRibbonGeometry(40));
    this.tetherA = new InstancedBufferAttribute(new Float32Array(MAX_LINES * 3), 3);
    this.tetherB = new InstancedBufferAttribute(new Float32Array(MAX_LINES * 3), 3);
    this.tetherInfo = new InstancedBufferAttribute(new Float32Array(MAX_LINES * 4), 4);
    this.tetherGeometry.setAttribute('aA', this.tetherA);
    this.tetherGeometry.setAttribute('aB', this.tetherB);
    this.tetherGeometry.setAttribute('aInfo', this.tetherInfo);
    this.tetherGeometry.instanceCount = 0;
    this.tetherMaterial = createPolarityTetherMaterial();
    this.tethers = new Mesh(this.tetherGeometry, this.tetherMaterial);
    this.tethers.name = 'PolarityTethers';
    this.tethers.layers.set(LAYER.VFX);
    this.tethers.renderOrder = 12;
    this.tethers.frustumCulled = false;
    this.tethers.count = 0; // mirrored from instanceCount, for the HUD
    this.tethers.visible = false;
    this.group.add(this.tethers);

    /* ---- layer 3: the field plot ---- */
    this.plotGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.plotMaterial = createPolarityPlotMaterial();
    this.plot = new Mesh(this.plotGeometry, this.plotMaterial);
    this.plot.name = 'PolarityPlot';
    this.plot.layers.set(LAYER.VFX);
    this.plot.renderOrder = 5;
    this.plot.frustumCulled = false;
    this.plot.visible = false;
    this.group.add(this.plot);
    this._poles = this.plotMaterial.uniforms.uPoles.value;

    /* ---- layer 4: the flares ---- */
    this.flareGeometry = new InstancedBufferGeometry().copy(new PlaneGeometry(1, 1));
    this.flareCentre = new InstancedBufferAttribute(new Float32Array(MAX_MINES * 3), 3);
    this.flareData = new InstancedBufferAttribute(new Float32Array(MAX_MINES * 4), 4);
    this.flareGeometry.setAttribute('aCentre', this.flareCentre);
    this.flareGeometry.setAttribute('aFlare', this.flareData);
    this.flareGeometry.instanceCount = MAX_MINES;
    this.flareMaterial = createPolarityFlareMaterial();
    this.flares = new Mesh(this.flareGeometry, this.flareMaterial);
    this.flares.name = 'PolarityFlares';
    this.flares.layers.set(LAYER.VFX);
    this.flares.renderOrder = 15;
    this.flares.frustumCulled = false;
    this.flares.visible = false;
    this.group.add(this.flares);

    /* ---- layer 5: the lenses ---- */
    this.lensGeometry = new InstancedBufferGeometry().copy(new PlaneGeometry(1, 1));
    this.lensCentre = new InstancedBufferAttribute(new Float32Array(LENS_SLOTS * 3), 3);
    this.lensData = new InstancedBufferAttribute(new Float32Array(LENS_SLOTS * 4), 4);
    this.lensGeometry.setAttribute('aCentre', this.lensCentre);
    this.lensGeometry.setAttribute('aLens', this.lensData);
    this.lensGeometry.instanceCount = LENS_SLOTS;
    this.lensMaterial = createPolarityLensMaterial();
    this.lens = new Mesh(this.lensGeometry, this.lensMaterial);
    this.lens.name = 'PolarityLens';
    this.lens.layers.set(LAYER.DISTORTION);
    this.lens.frustumCulled = false;
    this.lens.visible = false;
    this.group.add(this.lens);

    /* ---- layer 6: the flux pillars ---- */
    this.pillarGeometry = new InstancedBufferGeometry().copy(createFluxTubeGeometry(28, 18));
    this.pillarCentre = new InstancedBufferAttribute(new Float32Array(MAX_MINES * 4), 4);
    this.pillarData = new InstancedBufferAttribute(new Float32Array(MAX_MINES * 4), 4);
    this.pillarGeometry.setAttribute('aCentre', this.pillarCentre);
    this.pillarGeometry.setAttribute('aPillar', this.pillarData);
    this.pillarGeometry.instanceCount = 0;
    this.pillarMaterial = createPolarityPillarMaterial();
    this.pillars = new Mesh(this.pillarGeometry, this.pillarMaterial);
    this.pillars.name = 'PolarityPillars';
    this.pillars.layers.set(LAYER.VFX);
    this.pillars.renderOrder = 11;
    this.pillars.frustumCulled = false;
    this.pillars.visible = false;
    this.group.add(this.pillars);

    /* ---- per-cast records: dice and latches ---- */
    this._mines = [];
    for (let i = 0; i < MAX_MINES; i++) {
      this._mines.push({
        angle: 0, // ring dice: shuffle round the step
        jx: 0, // landing scatter dice
        jz: 0,
        tumbleX: 0, // tumble axis dice
        tumbleZ: 0,
        blink: 0, // integrated blink phase
        detonated: false,
        landed: false,
        x: 0, // where it is this frame (world)
        y: 0,
        z: 0
      });
    }
    /** Tethers this frame: indices into `_mines` and the line's bow sign. */
    this._lines = [];
    for (let i = 0; i < MAX_LINES; i++) this._lines.push({ a: 0, b: 0, sign: 0, seed: 0, order: 0 });
    this._lineCount = 0;
    this._linkOrder = 0;
    this._targets = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._seed = 0;
    /** The ring's first bearing: toward the caster. */
    this._baseAngle = 0;
    /** Detonation order: `_order[k]` is the k-th ring capsule to go. */
    this._order = new Int32Array(MAX_RING);
    this._plotState = { quadSize: 8, radius: 3, strength: 0 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.sparks = particles.get('polarity.sparks', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uDrag.value = 1.8;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.55;
    this.sparks.uniforms.uStretch.value = 0.08;

    this.smoke = particles.get('polarity.smoke', {
      capacity: 600,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      lit: true,
      softFade: 0.6
    });
    this.smoke.uniforms.uDrag.value = 2.2;
    this.smoke.uniforms.uEndSize.value = 2.6;
    this.smoke.uniforms.uSizeIn.value = 0.1;
    this.smoke.uniforms.uFadeIn.value = 0.08;
    this.smoke.uniforms.uFadeOut.value = 0.6;

    this.trailEmitter = new RateEmitter();
    this.crackleEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* The timeline — every event a function of the settings               */
  /* ------------------------------------------------------------------ */

  /** Every phase's seconds, × lifetime. */
  _scale() {
    return Math.max(0.05, settings.polarity.lifetime * settings.global.lifetime);
  }

  _ringCount() {
    return Math.min(MAX_RING, Math.max(2, Math.round(settings.polarity.mineCount)));
  }

  _hasCentre() {
    return settings.polarity.centreMine > 0.5;
  }

  /** Mines in play: the ring, then the centre (index MAX_RING). */
  _mineIndex(k, n) {
    return k < n ? k : MAX_RING;
  }

  _throwAt(i, n) {
    const s = this._scale();
    const slot = i === MAX_RING ? n : i;
    return slot * settings.polarity.throwStagger * s;
  }

  _landAt(i, n) {
    return this._throwAt(i, n) + settings.polarity.flightTime * this._scale();
  }

  _lastLand() {
    const n = this._ringCount();
    return this._landAt(this._hasCentre() ? MAX_RING : n - 1, n);
  }

  _formStart() {
    return this._lastLand() + settings.polarity.tetherDelay * this._scale();
  }

  _armedAt() {
    return this._formStart() + settings.polarity.tetherForm * this._scale();
  }

  _cascadeStart() {
    return this._armedAt() + settings.polarity.armTime * this._scale();
  }

  /** When capsule `i` goes. */
  _detonateAt(i) {
    const c = settings.polarity;
    const s = this._scale();
    const n = this._ringCount();
    const start = this._cascadeStart();
    const step = c.cascadeInterval * s;
    if (i === MAX_RING) return start + (n - 1) * step + step + c.finaleDelay * s;
    // Position in the order.
    let k = 0;
    for (; k < n; k++) if (this._order[k] === i) break;
    return start + k * step;
  }

  _lastDetonation() {
    if (this._hasCentre()) return this._detonateAt(MAX_RING);
    return this._cascadeStart() + (this._ringCount() - 1) * settings.polarity.cascadeInterval * this._scale();
  }

  _timelineEnd() {
    return this._lastDetonation() + settings.polarity.lingerTime * this._scale();
  }

  /** The order the ring goes off in. */
  _writeOrder(n) {
    if (settings.polarity.cascadeMode < 0.5) {
      // Round the ring from the capsule nearest the caster: + − + −.
      for (let k = 0; k < n; k++) this._order[k] = k;
      return;
    }
    // Every + (even), then every − (odd).
    let k = 0;
    for (let i = 0; i < n; i += 2) this._order[k++] = i;
    for (let i = 1; i < n; i += 2) this._order[k++] = i;
  }

  /* ------------------------------------------------------------------ */
  /* Base-class timing                                                    */
  /* ------------------------------------------------------------------ */

  /** The impact phase runs from the travel front's arrival to the end of the linger. */
  get impactDuration() {
    return Math.max(0.1, this._timelineEnd() - this._impactClock);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.polarity.fadeTime * settings.global.lifetime);
  }

  /** The light flickers with the lattice once it is armed. */
  lightShimmer() {
    const armed = this.age > this._armedAt() && this.age < this._lastDetonation();
    return armed ? 0.85 + 0.15 * Math.sin(this.age * 37.0) * Math.sin(this.age * 11.0) : 0.9;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  _floorPoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  onSpawn() {
    this._seed = Math.random() * 100;
    this._impactClock = 0;
    // The first capsule lands on the caster's side; the ring runs from there.
    this._baseAngle = Math.atan2(-this.direction.z, -this.direction.x);
    for (const m of this._mines) {
      m.angle = randRange(-0.5, 0.5);
      m.jx = randRange(-1, 1);
      m.jz = randRange(-1, 1);
      m.tumbleX = randRange(-1, 1);
      m.tumbleZ = randRange(-1, 1);
      m.blink = Math.random();
      m.detonated = false;
      m.landed = false;
    }
    this._lineCount = 0;
    this.trailEmitter.reset();
    this.crackleEmitter.reset();
    this.mines.count = 0;
    this.mines.visible = false;
    this.tethers.visible = false;
    this.plot.visible = false;
    this.flares.visible = false;
    this.lens.visible = false;
    this.pillars.visible = false;
    this.pillarGeometry.instanceCount = 0;
    this._writeOrder(this._ringCount());
  }

  /** Where capsule `i` lands, from live settings and its dice. */
  _landPoint(i, n, out) {
    const c = settings.polarity;
    const m = this._mines[i];
    this._floorPoint(_centre);
    const zone = c.zoneRadius;
    if (i === MAX_RING) {
      return out.set(_centre.x + m.jx * c.mineJitter * zone * 0.3, 0, _centre.z + m.jz * c.mineJitter * zone * 0.3);
    }
    const step = TAU / n;
    const a = this._baseAngle + i * step + m.angle * c.angleJitter * step * settings.global.randomness;
    const r = zone * c.mineRing;
    return out.set(
      _centre.x + Math.cos(a) * r + m.jx * c.mineJitter * zone * settings.global.randomness,
      0,
      _centre.z + Math.sin(a) * r + m.jz * c.mineJitter * zone * settings.global.randomness
    );
  }

  _handPoint(out) {
    out.copy(this.origin).addScaledVector(this.direction, 0.5);
    out.y = settings.polarity.handHeight;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame: the capsules                                              */
  /* ------------------------------------------------------------------ */

  _updateMines(dt) {
    const c = settings.polarity;
    const g = settings.global;
    const s = this._scale();
    const n = this._ringCount();
    const total = n + (this._hasCentre() ? 1 : 0);
    const t = this.age;
    const size = Math.max(0.05, c.mineSize);
    const data = this.mineAttr.array;
    let slot = 0;

    this._handPoint(_hand);
    for (let k = 0; k < total; k++) {
      const i = this._mineIndex(k, n);
      const m = this._mines[i];
      const throwAt = this._throwAt(i, n);
      if (t < throwAt || m.detonated) continue;

      const flight = c.flightTime * s;
      const landAt = throwAt + flight;
      const detAt = this._detonateAt(i);
      this._landPoint(i, n, _b);

      const plantY = -c.plantDepth * size;
      let finOpen = 0;
      if (t < landAt) {
        // Ballistic: a straight lerp plus a parabola, tumbling.
        const u = saturate((t - throwAt) / Math.max(0.01, flight));
        _pos.lerpVectors(_hand, _b, u);
        _pos.y = (1 - u) * _hand.y + u * plantY + 4 * c.arcHeight * u * (1 - u);
        const spin = (t - throwAt) * c.tumble * g.animationSpeed;
        _node.rotation.set(spin * m.tumbleX, 0, spin * (0.6 + 0.4 * m.tumbleZ));
      } else {
        if (!m.landed) {
          m.landed = true;
          this._landFx(i, _b);
        }
        // A hop, then settle upright and plant.
        const since = t - landAt;
        const settle = saturate(since / Math.max(0.02, c.landSettle * s));
        const hop = Math.sin(Math.PI * saturate(since / Math.max(0.02, c.landSettle * s * 0.6))) * c.landBounce;
        _pos.copy(_b);
        _pos.y = plantY + hop * (1 - settle);
        const left = (1 - Easing.outBack(settle)) * 0.8;
        _node.rotation.set(left * m.tumbleX, m.angle * 3.0, left * m.tumbleZ);
        finOpen = Easing.outBack(settle);
      }

      // Blink faster as the cascade approaches; heat in the last instant.
      const armed = saturate((t - landAt) / Math.max(0.05, detAt - landAt));
      const rate = c.blinkRate + (c.blinkArmed - c.blinkRate) * armed * armed;
      m.blink += rate * g.animationSpeed * dt;
      const phase = m.blink - Math.floor(m.blink);
      const beacon = t < landAt ? 0.15 : phase < c.blinkDuty ? 1 : 0.08;
      const heat = Easing.inQuad(saturate(1 - (detAt - t) / Math.max(0.02, 0.28 * s)));

      _node.position.copy(_pos);
      _node.scale.setScalar(size);
      _node.updateMatrix();
      this.mines.setMatrixAt(slot, _node.matrix);
      const polarity = i === MAX_RING ? 1 : i % 2 === 0 ? 1 : -1;
      data[slot * 4 + 0] = polarity;
      data[slot * 4 + 1] = beacon;
      data[slot * 4 + 2] = heat;
      data[slot * 4 + 3] = finOpen;
      slot++;

      m.x = _pos.x;
      m.y = _pos.y;
      m.z = _pos.z;
    }
    this.mines.count = slot;
    this.mines.visible = slot > 0;
    this.mines.instanceMatrix.needsUpdate = true;
    this.mineAttr.needsUpdate = true;
    this.mineMaterial.userData.sync();
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame: the lattice                                              */
  /* ------------------------------------------------------------------ */

  /** Which capsule pairs are tethered, from live settings. */
  _buildLinks() {
    const c = settings.polarity;
    const n = this._ringCount();
    this._lineCount = 0;
    this._linkOrder = 0;
    for (let i = 0; i < n; i++) this._addLink(i, (i + 1) % n);
    if (c.tetherCross > 0.5 && n > 4) for (let i = 0; i < n; i += 2) this._addLink(i, (i + 2) % n);
    if (c.tetherSpokes > 0.5 && this._hasCentre()) for (let i = 0; i < n; i++) this._addLink(MAX_RING, i);
  }

  /** One tether between capsules `a` and `b`: one to three field lines. */
  _addLink(a, b) {
    const per = Math.min(3, Math.max(1, Math.round(settings.polarity.linesPerTether)));
    // The + end first, so the dashes crawl + → −.
    if (a !== MAX_RING && a % 2 === 1) {
      const t = a;
      a = b;
      b = t;
    }
    for (let l = 0; l < per && this._lineCount < MAX_LINES; l++) {
      const line = this._lines[this._lineCount++];
      line.a = a;
      line.b = b;
      line.sign = l === 0 ? 0 : l === 1 ? 1 : -1;
      line.seed = ((a * 7 + b * 13 + l * 3) % 17) / 17 + this._seed;
      line.order = this._linkOrder;
    }
    this._linkOrder++;
  }

  _updateTethers() {
    const c = settings.polarity;
    const s = this._scale();
    const t = this.age;
    this._buildLinks();
    const formStart = this._formStart();
    const formTime = Math.max(0.02, c.tetherForm * s);
    const snapTime = Math.max(0.02, c.tetherSnap * s);
    const A = this.tetherA.array;
    const B = this.tetherB.array;
    const I = this.tetherInfo.array;
    let used = 0;

    for (let k = 0; k < this._lineCount; k++) {
      const line = this._lines[k];
      let a = this._mines[line.a];
      let b = this._mines[line.b];
      // Staggered: links reach across one after another.
      const form = Easing.outCubic(saturate((t - formStart - line.order * 0.035 * s) / formTime));
      if (form <= 0) continue;
      // A tether whose capsule has gone recoils toward the survivor.
      const detA = this._detonateAt(line.a);
      const detB = this._detonateAt(line.b);
      const first = Math.min(detA, detB);
      const snap = saturate((t - first) / snapTime);
      if (snap >= 1) continue;
      if (detA < detB) {
        const tmp = a;
        a = b;
        b = tmp;
      }
      const band = c.tetherHeight;
      A[used * 3 + 0] = a.x;
      A[used * 3 + 1] = Math.max(0.02, a.y + band);
      A[used * 3 + 2] = a.z;
      B[used * 3 + 0] = b.x;
      B[used * 3 + 1] = Math.max(0.02, b.y + band);
      B[used * 3 + 2] = b.z;
      I[used * 4 + 0] = form;
      I[used * 4 + 1] = t >= first ? Easing.outQuad(snap) : 0;
      I[used * 4 + 2] = line.sign;
      I[used * 4 + 3] = line.seed;
      used++;
    }
    this.tetherGeometry.instanceCount = used;
    this.tethers.count = used;
    this.tethers.visible = used > 0;
    this.tetherA.needsUpdate = true;
    this.tetherB.needsUpdate = true;
    this.tetherInfo.needsUpdate = true;
    this.tetherMaterial.userData.sync();
  }

  /** The same Bézier the tether vertex stage draws, for sparks crawling on it. */
  _tetherPoint(line, s, out) {
    const c = settings.polarity;
    const a = this._mines[line.a];
    const b = this._mines[line.b];
    _a.set(a.x, a.y + c.tetherHeight, a.z);
    _b.set(b.x, b.y + c.tetherHeight, b.z);
    const span = _a.distanceTo(_b);
    _dir.subVectors(_b, _a).normalize();
    // side = dir × up
    const sx = -_dir.z;
    const sz = _dir.x;
    const sl = Math.hypot(sx, sz) || 1;
    const bow = c.tetherBow;
    _ctrl.addVectors(_a, _b).multiplyScalar(0.5);
    _ctrl.y += span * bow * (c.tetherLift + (1 - c.tetherLift) * Math.abs(line.sign) * 0.5);
    _ctrl.x += (sx / sl) * span * bow * (1 - c.tetherLift) * line.sign;
    _ctrl.z += (sz / sl) * span * bow * (1 - c.tetherLift) * line.sign;
    const u = 1 - s;
    out.set(
      u * u * _a.x + 2 * u * s * _ctrl.x + s * s * _b.x,
      u * u * _a.y + 2 * u * s * _ctrl.y + s * s * _b.y,
      u * u * _a.z + 2 * u * s * _ctrl.z + s * s * _b.z
    );
    return out;
  }

  /** The field drawn on the floor: every planted, live capsule is a charge. */
  _updatePlot() {
    const c = settings.polarity;
    const s = this._scale();
    const t = this.age;
    const n = this._ringCount();
    this._floorPoint(_centre);
    const radius = c.zoneRadius * c.plotReach;
    const ps = this._plotState;
    ps.radius = radius;
    ps.quadSize = radius * 2.6;
    const form = saturate((t - this._formStart()) / Math.max(0.02, c.tetherForm * s));
    const fade = this.phase === AbilityPhase.FADE ? 1 - saturate(this.fadeTime / this.fadeDuration) : 1;
    // The field exists the moment a pole is planted; the lattice brings it to full.
    ps.strength = (c.plotPlanted + (1 - c.plotPlanted) * Easing.outCubic(form)) * fade;

    let k = 0;
    const total = n + (this._hasCentre() ? 1 : 0);
    let alive = 0;
    for (let j = 0; j < total && k < MAX_POLES; j++) {
      const i = this._mineIndex(j, n);
      const m = this._mines[i];
      const pole = this._poles[k++];
      if (!m.landed || m.detonated) {
        pole.set(0, 0, 0, 0);
        continue;
      }
      alive++;
      const charge = i === MAX_RING ? 0.6 : i % 2 === 0 ? 1 : -1;
      pole.set(m.x - _centre.x, m.z - _centre.z, charge, 1);
    }
    for (; k < MAX_POLES; k++) this._poles[k].set(0, 0, 0, 0);
    if (alive === 0) ps.strength = 0;
    this.plotMaterial.userData.sync(ps);
    this.plot.position.set(_centre.x, 0.015, _centre.z);
    this.plot.scale.set(ps.quadSize, 1, ps.quadSize);
    this.plot.visible = ps.strength > 0.003;
  }

  /* ------------------------------------------------------------------ */
  /* Detonations                                                          */
  /* ------------------------------------------------------------------ */

  _checkDetonations() {
    const n = this._ringCount();
    const total = n + (this._hasCentre() ? 1 : 0);
    for (let k = 0; k < total; k++) {
      const i = this._mineIndex(k, n);
      const m = this._mines[i];
      if (m.detonated || !m.landed) continue;
      if (this.age >= this._detonateAt(i)) this._detonate(i);
    }
  }

  _detonate(i) {
    const c = settings.polarity;
    const g = settings.global;
    const power = g.explosionIntensity;
    const m = this._mines[i];
    m.detonated = true;
    const finale = i === MAX_RING ? c.finaleScale : 1;
    const polarity = i === MAX_RING ? 1 : i % 2 === 0 ? 1 : -1;
    const tint = getColor(polarity > 0 ? c.colorPositive : c.colorNegative);
    const time = frame.uTime.value;

    _pos.set(m.x, 0, m.z);
    // The burst stays in the pole's colour: a saturated rim over a deep
    // polarity body, never a white shell (the white went to a pinpoint).
    _rim.copy(tint).lerp(getColor(c.colorFlareCore), c.burstWhite);
    _deep.copy(tint).multiplyScalar(c.burstDeep);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * finale * power,
      life: c.shockLife,
      width: 0.07,
      intensity: c.shockIntensity,
      colorA: _rim,
      colorB: _deep
    });
    this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
      radius: c.scorchRadius * finale,
      life: c.scorchLife,
      intensity: 0.9,
      colorA: getColor(c.colorScorchA),
      colorB: getColor(c.colorScorchB)
    });
    _pos.y = Math.max(0.2, c.mineSize * 0.5);
    this.ctx.bursts.spawn(BurstMode.STORM, _pos, {
      radius: c.mineSize,
      endRadius: c.burstRadius * finale * power,
      life: c.burstLife,
      intensity: c.burstIntensity,
      colorA: _deep,
      colorB: _deep,
      colorC: _rim
    });

    // Sparks: a hemisphere, low and fast.
    const sparks = Math.round(c.sparkCount * finale * g.particleCount);
    for (let n = 0; n < sparks; n += 10) {
      const a = Math.random() * TAU;
      _dir.set(Math.cos(a), randRange(0.15, 1.1), Math.sin(a)).normalize();
      this._resetEmit(time);
      _emit.position = _pos;
      _emit.radius = 0.12;
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed * power;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.3;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife;
      this.sparks.emit(Math.min(10, sparks - n), _emit);
    }
    // Smoke.
    this._resetEmit(time);
    _emit.position = _pos;
    _emit.radius = 0.3 * finale;
    _emit.direction = _up;
    _emit.speed = 1.2;
    _emit.spread = 0.9;
    _emit.size = c.smokeSize * finale;
    _emit.life = c.smokeLife;
    _emit.spin = 1.5;
    this.smoke.emit(Math.round(c.smokeCount * finale * g.particleCount), _emit);

    // Bodies near it are thrown away from it.
    this._killNear(m.x, m.z, c.killRadius * finale);

    this.ctx.shake.add(c.detonationShake * finale * power * g.cameraShake, 4, 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.detonationFlash * finale * power);
    this.lightBoost = Math.max(this.lightBoost * 0.6, c.detonationLight * finale * power);
    // The light jumps to the blast.
    this.position.set(m.x, c.lightHeight, m.z);
  }

  _killNear(x, z, radius) {
    if (!settings.dummies.hit.enabled) return;
    const c = settings.polarity;
    const g = settings.global;
    const found = this.ctx.dummies?.findTargets?.(x, z, radius, this._targets);
    if (!found) return;
    this._force.impulse = c.hit.impulse * g.explosionIntensity;
    this._force.lift = c.hit.lift * g.explosionIntensity;
    this._force.spin = c.hit.spin;
    for (const dummy of found) {
      let dx = dummy.position.x - x;
      let dz = dummy.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-3) {
        dx = this.direction.x;
        dz = this.direction.z;
      } else {
        dx /= d;
        dz /= d;
      }
      dummy.kill(dx, dz, this._force);
    }
  }

  /** Flares and lenses, both closed-form from each capsule's detonation time. */
  _updateFlares() {
    const c = settings.polarity;
    const g = settings.global;
    const s = this._scale();
    const t = this.age;
    const n = this._ringCount();
    const total = n + (this._hasCentre() ? 1 : 0);
    const F = this.flareData.array;
    const FC = this.flareCentre.array;
    const L = this.lensData.array;
    const LC = this.lensCentre.array;
    let anyFlare = false;
    let anyLens = false;

    for (let slot = 0; slot < MAX_MINES; slot++) {
      F[slot * 4] = -1;
      L[slot * 4 + 2] = 0;
      L[slot * 4 + 3] = 0;
    }
    for (let k = 0; k < total; k++) {
      const i = this._mineIndex(k, n);
      const m = this._mines[i];
      if (!m.detonated) continue;
      const since = t - this._detonateAt(i);
      const finale = i === MAX_RING ? c.finaleScale : 1;
      const fa = since / Math.max(0.02, c.flareLife);
      F[k * 4 + 0] = fa;
      F[k * 4 + 1] = c.flareSize * finale * g.explosionIntensity;
      F[k * 4 + 2] = i === MAX_RING ? 1 : i % 2 === 0 ? 1 : -1;
      F[k * 4 + 3] = this._mines[i].angle;
      FC[k * 3 + 0] = m.x;
      FC[k * 3 + 1] = Math.max(0.25, c.mineSize * 0.6);
      FC[k * 3 + 2] = m.z;
      if (fa <= 1) anyFlare = true;

      const la = since / Math.max(0.05, c.shockLife);
      L[k * 4 + 0] = la;
      L[k * 4 + 1] = c.lensSize * finale;
      L[k * 4 + 2] = la <= 1 ? c.lensStrength * g.distortion : 0;
      LC[k * 3 + 0] = m.x;
      LC[k * 3 + 1] = 0.5;
      LC[k * 3 + 2] = m.z;
      if (la <= 1) anyLens = true;
    }

    // The lattice's hum: from armed to the first detonation.
    const hs = MAX_MINES;
    this._floorPoint(_centre);
    const armed = saturate((t - this._armedAt()) / Math.max(0.05, 0.3 * s));
    const done = t >= this._cascadeStart() ? saturate(1 - (t - this._cascadeStart()) / Math.max(0.05, 0.4 * s)) : 1;
    const hum = armed * done * 0.18 * g.distortion * c.lensStrength;
    L[hs * 4 + 0] = 2; // no ring
    L[hs * 4 + 1] = c.zoneRadius * 1.1;
    L[hs * 4 + 2] = 0;
    L[hs * 4 + 3] = hum;
    LC[hs * 3 + 0] = _centre.x;
    LC[hs * 3 + 1] = 0.6;
    LC[hs * 3 + 2] = _centre.z;
    if (hum > 0.0005) anyLens = true;

    this.flareData.needsUpdate = true;
    this.flareCentre.needsUpdate = true;
    this.lensData.needsUpdate = true;
    this.lensCentre.needsUpdate = true;
    this.flares.visible = anyFlare;
    this.lens.visible = anyLens;
    this.flareMaterial.userData.sync();
  }

  /**
   * The flux pillars, closed-form from each capsule's landing and detonation
   * times: rise on planting, swell with the lattice, pulse with the blink,
   * shoot up and burn out on detonation.
   */
  _updatePillars() {
    const c = settings.polarity;
    const s = this._scale();
    const t = this.age;
    const n = this._ringCount();
    const total = n + (this._hasCentre() ? 1 : 0);
    const C = this.pillarCentre.array;
    const P = this.pillarData.array;
    const rise = Math.max(0.02, c.pillarRise * s);
    const blast = Math.max(0.02, c.pillarBlast);
    const form = Easing.outCubic(saturate((t - this._formStart()) / Math.max(0.02, c.tetherForm * s)));
    const fade = this.phase === AbilityPhase.FADE ? 1 - saturate(this.fadeTime / this.fadeDuration) : 1;
    let used = 0;
    for (let k = 0; k < total; k++) {
      const i = this._mineIndex(k, n);
      const m = this._mines[i];
      if (!m.landed) continue;
      const landAt = this._landAt(i, n);
      const detAt = this._detonateAt(i);
      const centre = i === MAX_RING ? c.pillarCentreScale : 1;
      let height;
      let width;
      let alpha;
      if (!m.detonated) {
        const up = Easing.outBack(saturate((t - landAt) / rise));
        const pulse = m.blink - Math.floor(m.blink) < c.blinkDuty ? 1 : 0;
        const heat = saturate(1 - (detAt - t) / Math.max(0.02, 0.28 * s));
        height = up * (0.55 + 0.45 * form) * (1 + heat * 0.35);
        width = (0.8 + 0.2 * form) * (1 + pulse * 0.06 + heat * 0.25);
        alpha = saturate(up) * (0.55 + 0.45 * form) * (0.85 + pulse * 0.25) * (1 + heat * 1.5);
      } else {
        const b = (t - detAt) / blast;
        if (b >= 1) continue;
        height = 1 + Easing.outCubic(b) * c.pillarBlastHeight;
        width = 1 - 0.7 * b;
        alpha = (1 - b) * (1 - b) * c.pillarBlastGlow;
      }
      C[used * 4 + 0] = m.x;
      C[used * 4 + 1] = Math.max(0, m.y);
      C[used * 4 + 2] = m.z;
      C[used * 4 + 3] = m.angle * 7.3 + i * 1.7;
      P[used * 4 + 0] = i === MAX_RING ? 1 : i % 2 === 0 ? 1 : -1;
      P[used * 4 + 1] = height * centre;
      P[used * 4 + 2] = width * centre;
      P[used * 4 + 3] = alpha * fade;
      used++;
    }
    this.pillarGeometry.instanceCount = used;
    this.pillars.visible = used > 0;
    this.pillarCentre.needsUpdate = true;
    this.pillarData.needsUpdate = true;
    this.pillarMaterial.userData.sync();
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                            */
  /* ------------------------------------------------------------------ */

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.4;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.5;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  _syncParticles() {
    const c = settings.polarity;
    const g = settings.global;
    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    this.sparks.uniforms.uGravity.value.set(0, c.sparkGravity, 0);
    this.sparks.uniforms.uSizeScale.value = g.particleSize;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = g.glow;

    this.smoke.setGradient(getColor(c.colorSmokeA), getColor(c.colorSmokeB), getColor(c.colorSmokeC), getColor(c.colorSmokeD));
    this.smoke.uniforms.uGravity.value.set(0, c.smokeRise, 0);
    this.smoke.uniforms.uSizeScale.value = g.particleSize;
    this.smoke.uniforms.uLifeScale.value = g.particleLifetime;
    this.smoke.uniforms.uSpeedScale.value = g.particleSpeed;
    this.smoke.uniforms.uOpacity.value = g.opacity * 0.8;
    this.smoke.uniforms.uTurbulence.value = 0.6 * g.turbulence;
  }

  /** Sparks off the capsules in flight. */
  _trailFx(dt) {
    const c = settings.polarity;
    const g = settings.global;
    const n = this._ringCount();
    const total = n + (this._hasCentre() ? 1 : 0);
    const time = frame.uTime.value;
    const inFlight = this._countInFlight(n, total);
    if (inFlight === 0) return;
    const count = this.trailEmitter.tick(dt, c.trailRate * inFlight * g.particleCount);
    for (let e = 0; e < count; e++) {
      // Spread across whichever capsules are airborne.
      const pick = (e % inFlight);
      let seen = 0;
      for (let k = 0; k < total; k++) {
        const i = this._mineIndex(k, n);
        const m = this._mines[i];
        if (!this._airborne(i, n)) continue;
        if (seen++ !== pick) continue;
        _pos.set(m.x, m.y + c.mineSize * 0.5, m.z);
        this._resetEmit(time);
        _emit.position = _pos;
        _emit.radius = c.mineSize * 0.2;
        _emit.speed = 0.6;
        _emit.spread = 1;
        _emit.size = c.trailSize;
        _emit.life = c.trailLife;
        this.sparks.emit(1, _emit);
        break;
      }
    }
  }

  _airborne(i, n) {
    const t = this.age;
    return t >= this._throwAt(i, n) && t < this._landAt(i, n);
  }

  _countInFlight(n, total) {
    let count = 0;
    for (let k = 0; k < total; k++) if (this._airborne(this._mineIndex(k, n), n)) count++;
    return count;
  }

  /** Sparks crawling along the lattice while it holds. */
  _crackleFx(dt) {
    const c = settings.polarity;
    const g = settings.global;
    if (this._lineCount === 0 || this.age < this._armedAt()) return;
    const count = this.crackleEmitter.tick(dt, c.crackleRate * g.particleCount);
    const time = frame.uTime.value;
    for (let e = 0; e < count; e++) {
      const line = this._lines[(Math.random() * this._lineCount) | 0];
      const a = this._mines[line.a];
      const b = this._mines[line.b];
      if (a.detonated || b.detonated || !a.landed || !b.landed) continue;
      this._tetherPoint(line, Math.random(), _pos);
      this._resetEmit(time);
      _emit.position = _pos;
      _emit.radius = 0.03;
      _emit.speed = 1.5;
      _emit.spread = 1;
      _emit.size = c.trailSize;
      _emit.life = c.trailLife * 0.8;
      this.sparks.emit(1, _emit);
    }
  }

  /** A capsule plants: dust, a tick of shake, a puff of sparks. */
  _landFx(i, at) {
    const c = settings.polarity;
    const g = settings.global;
    const polarity = i === MAX_RING ? 1 : i % 2 === 0 ? 1 : -1;
    this.ctx.decals.spawn(DecalType.DUSTRING, at, {
      radius: c.landDust,
      life: 0.9,
      intensity: 0.6,
      colorA: getColor(c.colorSmokeA),
      colorB: getColor(c.colorSmokeC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, at, {
      radius: c.landDust * 1.6,
      life: 0.35,
      width: 0.05,
      intensity: 0.5,
      colorA: getColor(polarity > 0 ? c.colorPositive : c.colorNegative),
      colorB: getColor(c.colorTetherCore)
    });
    this._resetEmit(frame.uTime.value);
    _pos.copy(at).setY(0.1);
    _emit.position = _pos;
    _emit.radius = 0.1;
    _emit.direction = _up;
    _emit.speed = 3;
    _emit.spread = 1.2;
    _emit.size = c.trailSize;
    _emit.life = c.trailLife;
    this.sparks.emit(Math.round(10 * g.particleCount), _emit);
    this.ctx.shake.add(c.detonationShake * 0.15 * g.cameraShake, 8, 20);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  _frame(dt) {
    this._syncParticles();
    this._updateMines(dt);
    this._checkDetonations();
    this._updateTethers();
    this._updatePlot();
    this._updatePillars();
    this._updateFlares();
    this._trailFx(dt);
    this._crackleFx(dt);
    // The light rides the travel front, then drifts back to the middle of
    // the garden between blasts.
    if (this.phase === AbilityPhase.TRAVEL) return;
    this._floorPoint(_centre);
    const c = settings.polarity;
    this.position.x += (_centre.x - this.position.x) * Math.min(1, dt * 3);
    this.position.z += (_centre.z - this.position.z) * Math.min(1, dt * 3);
    this.position.y = c.lightHeight;
  }

  onTravel(dt) {
    // The travel front is only the light racing out; the capsules are already
    // in the air on their own clock.
    this._frame(dt);
  }

  onImpact() {
    this._impactClock = this.age;
    this._writeOrder(this._ringCount());
  }

  onFade(dt) {
    this._writeOrder(this._ringCount());
    this._frame(dt);
  }

  onDestroy() {
    this.mines.count = 0;
    this.mines.visible = false;
    this.tethers.visible = false;
    this.tetherGeometry.instanceCount = 0;
    this.tethers.count = 0;
    this.plot.visible = false;
    this.flares.visible = false;
    this.lens.visible = false;
    this.pillars.visible = false;
    this.pillarGeometry.instanceCount = 0;
    this._lineCount = 0;
    this._targets.length = 0;
  }

  dispose() {
    this.mineGeometry.dispose();
    this.mineMaterial.dispose();
    this.tetherGeometry.dispose();
    this.tetherMaterial.dispose();
    this.plotGeometry.dispose();
    this.plotMaterial.dispose();
    this.flareGeometry.dispose();
    this.flareMaterial.dispose();
    this.lensGeometry.dispose();
    this.lensMaterial.dispose();
    this.pillarGeometry.dispose();
    this.pillarMaterial.dispose();
    this.mines.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const R = Editor.range;
  const folder = gui.addFolder('⊕  Polarity Garden');

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 120, 0.5, 'marker speed (m/s)');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'garden radius (m)');
  R(cast, c, 'lifetime', 0.2, 4, 0.01, 'timeline scale (×)');
  R(cast, c, 'fadeTime', 0.1, 5, 0.05, 'clears over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handHeight', 0, 3, 0.01, 'hand height (m)');

  /* ---- layer 1 ---- */
  const mines = folder.addFolder('1 · Capsules');
  const layout = mines.addFolder('Layout & throw');
  R(layout, c, 'mineCount', 2, MAX_RING, 1, 'ring capsules');
  R(layout, c, 'centreMine', 0, 1, 1, 'centre capsule');
  R(layout, c, 'mineRing', 0.1, 1.5, 0.01, 'ring radius (× zone)');
  R(layout, c, 'mineJitter', 0, 0.5, 0.005, 'scatter (× zone)');
  R(layout, c, 'angleJitter', 0, 1, 0.01, 'angle shuffle');
  R(layout, c, 'throwStagger', 0, 0.6, 0.005, 'throw stagger (s)');
  R(layout, c, 'flightTime', 0.1, 2.5, 0.01, 'flight time (s)');
  R(layout, c, 'arcHeight', 0, 8, 0.05, 'arc height (m)');
  R(layout, c, 'tumble', 0, 40, 0.1, 'tumble (rad/s)');
  R(layout, c, 'landBounce', 0, 1, 0.005, 'landing hop (m)');
  R(layout, c, 'landSettle', 0.02, 2, 0.01, 'settles over (s)');
  R(layout, c, 'landDust', 0, 2, 0.01, 'landing dust (m)');

  const hull = mines.addFolder('Hull & lights');
  R(hull, c, 'mineSize', 0.1, 1.5, 0.01, 'height (m)');
  R(hull, c, 'mineGirth', 0.1, 0.8, 0.005, 'girth (× height)');
  R(hull, c, 'plantDepth', 0, 0.6, 0.005, 'buried (× height)');
  R(hull, c, 'finSpread', -0.5, 1.5, 0.01, 'fin spread (rad)');
  R(hull, c, 'hullReflect', 0, 3, 0.01, 'reflection');
  R(hull, c, 'hullGloss', 4, 300, 1, 'gloss');
  R(hull, c, 'hullSpecular', 0, 6, 0.05, 'specular');
  R(hull, c, 'panelLines', 0, 1, 0.01, 'panel seams');
  R(hull, c, 'bandGlow', 0, 12, 0.05, 'band glow');
  R(hull, c, 'beaconGlow', 0, 20, 0.05, 'beacon glow');
  R(hull, c, 'blinkRate', 0, 10, 0.05, 'blink rate (landed)');
  R(hull, c, 'blinkArmed', 0, 30, 0.1, 'blink rate (about to go)');
  R(hull, c, 'blinkDuty', 0.05, 0.95, 0.01, 'blink duty');
  R(hull, c, 'heatGlow', 0, 15, 0.05, 'white-hot flare');
  hull.addColor(c, 'colorHull').name('gunmetal');
  hull.addColor(c, 'colorHullDeep').name('deep metal');
  hull.addColor(c, 'colorHullSpec').name('highlight');
  hull.addColor(c, 'colorPositive').name('+ polarity');
  hull.addColor(c, 'colorNegative').name('− polarity');
  hull.addColor(c, 'colorHeat').name('heat');

  /* ---- layer 2 ---- */
  const tethers = folder.addFolder('2 · Tethers & field');
  R(tethers, c, 'tetherDelay', 0, 2, 0.01, 'forms after last landing (s)');
  R(tethers, c, 'tetherForm', 0.05, 3, 0.01, 'reaches across over (s)');
  R(tethers, c, 'armTime', 0, 5, 0.01, 'holds armed for (s)');
  R(tethers, c, 'tetherCross', 0, 1, 1, 'cross links');
  R(tethers, c, 'tetherSpokes', 0, 1, 1, 'spokes to centre');
  R(tethers, c, 'linesPerTether', 1, 3, 1, 'field lines per tether');
  R(tethers, c, 'tetherBow', 0, 1.5, 0.01, 'bow (× span)');
  R(tethers, c, 'tetherLift', 0, 1, 0.01, 'bow upward vs sideways');
  R(tethers, c, 'tetherHeight', 0, 1, 0.005, 'attach height (m)');
  R(tethers, c, 'tetherWidth', 0.005, 0.4, 0.001, 'ribbon width (m)');
  R(tethers, c, 'flowSpeed', -6, 6, 0.01, 'crawl speed');
  R(tethers, c, 'flowDensity', 0.5, 30, 0.1, 'dashes');
  R(tethers, c, 'flowSharp', 0, 0.98, 0.01, 'dash sharpness');
  R(tethers, c, 'tetherGlow', 0, 10, 0.05, 'glow');
  R(tethers, c, 'tetherFlicker', 0, 1, 0.01, 'flicker');
  R(tethers, c, 'tetherSnap', 0.02, 1, 0.01, 'snaps loose over (s)');
  R(tethers, c, 'crackleRate', 0, 300, 1, 'crackle (/s)');
  tethers.addColor(c, 'colorTetherCore').name('core');
  R(tethers, c, 'plotGlow', 0, 4, 0.01, 'floor field glow');
  R(tethers, c, 'plotReach', 0.3, 2.5, 0.01, 'floor field reach (× zone)');
  R(tethers, c, 'plotContour', 0, 1.5, 0.01, 'floor contour lines');
  R(tethers, c, 'plotPlanted', 0, 1, 0.01, 'floor field before lattice');
  R(tethers, c, 'poleRing', 0.1, 2, 0.01, 'pole halo radius (m)');
  R(tethers, c, 'poleGlow', 0, 4, 0.01, 'pole halo glow');

  /* ---- layer 6 ---- */
  const pillars = folder.addFolder('2b · Flux pillars');
  R(pillars, c, 'pillarHeight', 0, 6, 0.01, 'height (m)');
  R(pillars, c, 'pillarRadius', 0.05, 2, 0.01, 'base radius (m)');
  R(pillars, c, 'pillarCentreScale', 0.5, 3, 0.01, 'centre pillar (×)');
  R(pillars, c, 'pillarGlow', 0, 8, 0.05, 'glow');
  R(pillars, c, 'pillarLines', 1, 24, 1, 'field lines round');
  R(pillars, c, 'pillarTwist', -6, 6, 0.05, 'twist');
  R(pillars, c, 'pillarFlow', -6, 6, 0.05, 'flux flow');
  R(pillars, c, 'pillarRise', 0.02, 1.5, 0.01, 'rises over (s)');
  R(pillars, c, 'pillarBlast', 0.05, 1.5, 0.01, 'burns out over (s)');
  R(pillars, c, 'pillarBlastHeight', 0, 4, 0.05, 'shoots up (× height)');
  R(pillars, c, 'pillarBlastGlow', 0, 4, 0.05, 'blast brightness');
  R(pillars, c, 'pillarCoreMix', 0, 1, 0.01, 'white at the base');

  /* ---- layer 3 ---- */
  const cascade = folder.addFolder('3 · Cascade');
  R(cascade, c, 'cascadeMode', 0, 1, 1, 'order: round ↔ + then −');
  R(cascade, c, 'cascadeInterval', 0.01, 1, 0.005, 'interval (s)');
  R(cascade, c, 'finaleDelay', 0, 2, 0.01, 'centre waits (s)');
  R(cascade, c, 'finaleScale', 0.5, 4, 0.01, 'centre size (×)');
  R(cascade, c, 'lingerTime', 0, 3, 0.01, 'linger (s)');
  R(cascade, c, 'killRadius', 0.1, 5, 0.05, 'kill radius (m)');
  R(cascade, c.hit, 'impulse', 0, 25, 0.1, 'thrown out (m/s)');
  R(cascade, c.hit, 'lift', 0, 20, 0.1, 'thrown up (m/s)');
  R(cascade, c.hit, 'spin', 0, 5, 0.05, 'torque');
  R(cascade, c, 'flareSize', 0.1, 4, 0.01, 'star size (m)');
  R(cascade, c, 'flareLife', 0.05, 1.5, 0.01, 'star life (s)');
  R(cascade, c, 'flareSpikes', 2, 16, 1, 'star spikes');
  R(cascade, c, 'flareGlow', 0, 20, 0.1, 'star glow');
  R(cascade, c, 'flareDark', 0, 1, 0.01, 'star dark heart');
  R(cascade, c, 'flareHot', 0, 3, 0.01, 'star white pinpoint');
  R(cascade, c, 'burstWhite', 0, 1, 0.01, 'burst rim whiteness');
  R(cascade, c, 'burstDeep', 0, 1, 0.01, 'burst body (× pole colour)');
  R(cascade, c, 'shockIntensity', 0, 4, 0.05, 'shockwave brightness');
  R(cascade, c, 'burstRadius', 0.1, 5, 0.01, 'burst radius (m)');
  R(cascade, c, 'burstLife', 0.05, 2, 0.01, 'burst life (s)');
  R(cascade, c, 'burstIntensity', 0, 5, 0.05, 'burst intensity');
  R(cascade, c, 'shockRadius', 0.2, 8, 0.05, 'shockwave (m)');
  R(cascade, c, 'shockLife', 0.05, 2, 0.01, 'shockwave life (s)');
  R(cascade, c, 'scorchRadius', 0.1, 4, 0.01, 'scorch (m)');
  R(cascade, c, 'scorchLife', 0.2, 15, 0.1, 'scorch life (s)');
  R(cascade, c, 'detonationShake', 0, 1.5, 0.005, 'shake');
  R(cascade, c, 'detonationFlash', 0, 1, 0.005, 'flash');
  R(cascade, c, 'detonationLight', 0, 60, 0.5, 'light punch');
  R(cascade, c, 'lensStrength', 0, 4, 0.01, 'warp ring');
  R(cascade, c, 'lensSize', 0.2, 6, 0.05, 'warp ring size (m)');
  cascade.addColor(c, 'colorFlareCore').name('star core');
  cascade.addColor(c, 'colorScorchA').name('scorch embers');
  cascade.addColor(c, 'colorScorchB').name('scorch char');
  cascade.addColor(c, 'colorFlash').name('flash');

  /* ---- layer 4 ---- */
  const parts = folder.addFolder('4 · Sparks & smoke');
  R(parts, c, 'sparkCount', 0, 400, 1, 'sparks per blast');
  R(parts, c, 'sparkSpeed', 0, 40, 0.1, 'spark speed');
  R(parts, c, 'sparkSize', 0.01, 0.4, 0.005, 'spark size');
  R(parts, c, 'sparkLife', 0.05, 3, 0.01, 'spark life (s)');
  R(parts, c, 'sparkGravity', -30, 5, 0.1, 'spark gravity');
  Editor.gradient(parts, c, 'colorSpark', 'Spark colour');
  R(parts, c, 'smokeCount', 0, 80, 1, 'smoke per blast');
  R(parts, c, 'smokeSize', 0.05, 2, 0.01, 'smoke size');
  R(parts, c, 'smokeLife', 0.2, 6, 0.05, 'smoke life (s)');
  R(parts, c, 'smokeRise', -1, 4, 0.05, 'smoke rise');
  Editor.gradient(parts, c, 'colorSmoke', 'Smoke colour');
  R(parts, c, 'trailRate', 0, 300, 1, 'flight trail (/s each)');
  R(parts, c, 'trailSize', 0.01, 0.3, 0.005, 'trail size');
  R(parts, c, 'trailLife', 0.05, 2, 0.01, 'trail life (s)');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 30, 0.1, 'radius');
  R(light, c, 'lightHeight', 0, 5, 0.05, 'height (m)');

  folder.close();
  return folder;
}
