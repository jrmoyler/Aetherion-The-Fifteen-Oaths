import {
  CylinderGeometry,
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
  GLYPH_MAX,
  GLYPH_RUNES_MAX,
  createGlyphSigilMaterial,
  createGlyphRuneMaterial,
  createGlyphPillarMaterial,
  createGlyphPillarWarpMaterial,
  createGlyphLeyMaterial,
  createGlyphSealMaterial,
  createGlyphBindMaterial
} from '../../materials/codex/GlyphBarrageMaterials.js';
import { createSealGeometry } from '../../assets/codex/GlyphBarrageGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'glyphs';

const TAU = Math.PI * 2;
/** Bodies the pillars can hold at once. */
const MAX_GRIPS = 8;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _at = new Vector3();
const _floor = new Vector3();
const _right = new Vector3();
const _up = new Vector3(0, 1, 0);
const _seal = new Object3D();

/**
 * GLYPH BARRAGE — a chain of arcane sigils stamped down the line, detonated in
 * sequence.
 *
 * A line cast in three beats. **Stamping** (the travel phase): the front runs
 * down the line at `speed` and, as it passes each of `glyphCount` evenly spaced
 * points, a sigil punches into the floor there — it lands oversized and
 * settles, draws its rings on round the circle from the outside in, throws a
 * ring flash and a floor shockwave, and starts trailing rune fragments above
 * it. A ley line follows the front from glyph to glyph. **The chain** (the
 * impact phase, which begins the moment the last glyph lands): the whole chain
 * charges for `holdTime`, throbbing, pulses running down the ley line; then the
 * glyphs detonate one after another every `chainInterval`, from the far end
 * back (or outward, `chainOrder`). Each erupts into a pillar of arcane light, a
 * shockwave ring crossing the floor, an ionised burst, rune shards and streaks
 * racing up the column, and its fragments are flung up the pillar. **The fade**:
 * the spent glyphs come off the floor ring by ring, outermost first.
 *
 * **The seals** (the hero, `assets/codex/GlyphBarrageGeometry.js`): each glyph is
 * printed by a lit obsidian seal-stamp thrown ahead of the front, slammed
 * face-down on the stamp frame (dark imprint decal), lifted to hover over its
 * print while the chain charges, and flung up its pillar when it erupts. The
 * chain now runs outward by default so it ends on the target, the pillars
 * use a four-stop ramp with a thin white axis, and each eruption leaves a burn.
 *
 * **Tied to the line**: while a seal hovers, a cone of rune-rain (the
 * *binding shaft*, `createGlyphBindMaterial`) hangs from its striking face to
 * its own print, so the floating stones read as still pressing the sigils
 * rather than as a stack at the far end. Each slam kicks obsidian chips and a
 * dust ring up off the floor (the stamp's 3D beat). The sigils sit on an
 * inked plate (premultiplied: a deep floor-darkening disc with arcane ink
 * swirling in it), and the pillars are premultiplied too, their deep walls
 * covering what is behind them — so a chain of pillars lined up along the
 * view converges on violet rather than summing to a white slab; HDR only in
 * the thin axis.
 *
 * Eight layers, each a folder in the editor:
 *
 *   1. **the sigils** — one SDF ground shader per glyph
 *      (`GlyphBarrageMaterials`): rings, runes, ticks, a star, spokes, a square
 *      and an eye, each a white-hot core and a blue-violet halo, three of them
 *      turning at their own speeds.
 *   2. **rune fragments** — one instanced draw for every fragment of every
 *      glyph, each placed from per-glyph uniform arrays.
 *   3. **the pillars** — an open flared cylinder per glyph, additive: a hot
 *      core, fresnel edges and streaks racing up it. It shoots up in
 *      `pillarRise`, then thins to a needle and goes out.
 *   4. **the lens** — each pillar again, wider, on `LAYER.DISTORTION`.
 *   5. **the shockwave** — drawn by the sigil shader itself out across the
 *      floor, plus the engine's SHOCKWAVE decal and a STORM burst.
 *   6. **particles** — CHIP rune shards thrown out of each eruption, STREAKs
 *      racing up the column, SOFT motes rising off charged glyphs, RING
 *      halos climbing each pillar. (The ring flash a glyph punches in with is
 *      drawn flat on the floor by the sigil shader — a billboard ring is cut
 *      in half by the floor and reads as a hoop.)
 *   7. **the ley line** — the thread binding the chain on the floor.
 *   8. **the bodies** — `handlesOwnHits`. A body standing on a glyph is marked
 *      (`dummy.corrode` with a violet look) and brightens as the chain charges;
 *      when its glyph erupts it is knocked off its feet *upward*, held in the
 *      pillar by a velocity field that pulls it to the axis, turns it round it
 *      and carries it up, and when the pillar lets go it is thrown up and out.
 *
 * ## The editor rule
 *
 * A cast captures how many glyphs it stamps, a seed and lateral dice for each,
 * and the clocks (when each was stamped, when each erupted). Everything with a
 * unit is resolved from `settings.glyphs` every frame, so the sigils, pillars
 * and timings can be reshaped while the chain is on the floor.
 */
export class GlyphBarrageAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The pillars decide what they lift, and when. */
  get handlesOwnHits() {
    return true;
  }

  /** Glyphs on the floor this cast. HUD readout only. */
  get instanceCount() {
    return this._stamped;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layers 1, 3, 4: a sigil, a pillar and its lens per glyph ---- */
    this.sigilGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.pillarGeometry = new CylinderGeometry(1, 1, 1, 48, 16, true);
    this.pillarGeometry.translate(0, 0.5, 0); // foot at y = 0, top at y = 1

    this._glyphs = [];
    for (let i = 0; i < GLYPH_MAX; i++) {
      const sigilMaterial = createGlyphSigilMaterial();
      const sigil = new Mesh(this.sigilGeometry, sigilMaterial);
      sigil.name = `GlyphSigil${i}`;
      sigil.layers.set(LAYER.VFX);
      sigil.renderOrder = 3;
      sigil.frustumCulled = false;
      sigil.visible = false;
      this.group.add(sigil);

      const pillarMaterial = createGlyphPillarMaterial();
      const pillar = new Mesh(this.pillarGeometry, pillarMaterial);
      pillar.name = `GlyphPillar${i}`;
      pillar.layers.set(LAYER.VFX);
      pillar.renderOrder = 12;
      pillar.frustumCulled = false;
      pillar.visible = false;
      this.group.add(pillar);

      const bindMaterial = createGlyphBindMaterial();
      const bind = new Mesh(this.pillarGeometry, bindMaterial);
      bind.name = `GlyphBind${i}`;
      bind.layers.set(LAYER.VFX);
      bind.renderOrder = 11;
      bind.frustumCulled = false;
      bind.visible = false;
      this.group.add(bind);

      const warpMaterial = createGlyphPillarWarpMaterial();
      const warp = new Mesh(this.pillarGeometry, warpMaterial);
      warp.name = `GlyphLens${i}`;
      warp.layers.set(LAYER.DISTORTION);
      warp.frustumCulled = false;
      warp.visible = false;
      this.group.add(warp);

      this._glyphs.push({
        sigil,
        sigilMaterial,
        pillar,
        pillarMaterial,
        warp,
        warpMaterial,
        bind,
        bindMaterial,
        bindState: { foot: 1, top: 0.5, height: 1, intensity: 0, seed: 0 },
        /** Where its seal is this frame (written by `_sealFrame`). */
        sealY: 0,
        sealR: 0,
        sealLift: 0,
        /** Dice, rolled at spawn. */
        lat: 0,
        spin: 0,
        seed: 0,
        /** Clocks: `age` when stamped / erupted, -1 before. */
        stampAt: -1,
        eruptAt: -1,
        /** Resolved per frame. */
        along: 0,
        x: 0,
        z: 0,
        charge: 0,
        sigilState: {
          x: 0, z: 0, lift: 0.016, spin: 0, seed: 0, scale: 1, stamp: 0, bright: 1,
          spent: 1, fade: 0, shockR: 0, shockA: 0, rotA: 0, rotB: 0, rotC: 0
        },
        pillarState: { radius: 0.5, height: 1, intensity: 0, seed: 0 }
      });
    }

    /* ---- layer 2: rune fragments, one instanced draw ---- */
    const quad = new PlaneGeometry(1, 1, 1, 1);
    this.runeGeometry = new InstancedBufferGeometry();
    this.runeGeometry.setIndex(quad.getIndex());
    this.runeGeometry.setAttribute('position', quad.getAttribute('position'));
    this.runeGeometry.setAttribute('uv', quad.getAttribute('uv'));
    const data = new Float32Array(GLYPH_MAX * GLYPH_RUNES_MAX * 4);
    // Slot-major: the first `runesPerGlyph × GLYPH_MAX` instances are the ones
    // drawn, so lowering the slider simply draws fewer per glyph.
    for (let slot = 0; slot < GLYPH_RUNES_MAX; slot++) {
      for (let g = 0; g < GLYPH_MAX; g++) {
        const i = (slot * GLYPH_MAX + g) * 4;
        data[i] = g;
        data[i + 1] = slot;
        data[i + 2] = Math.random();
        data[i + 3] = 0;
      }
    }
    this.runeGeometry.setAttribute('aRune', new InstancedBufferAttribute(data, 4));
    this.runeGeometry.instanceCount = 0;
    this._quad = quad;
    this.runeMaterial = createGlyphRuneMaterial();
    this.runes = new Mesh(this.runeGeometry, this.runeMaterial);
    this.runes.name = 'GlyphRunes';
    this.runes.layers.set(LAYER.VFX);
    this.runes.renderOrder = 13;
    this.runes.frustumCulled = false;
    this.runes.visible = false;
    this.group.add(this.runes);

    /* ---- the seal stones: the hero, one instanced draw ---- */
    this.sealGeometry = createSealGeometry();
    this.sealData = new InstancedBufferAttribute(new Float32Array(GLYPH_MAX * 4), 4);
    this.sealGeometry.setAttribute('aSeal', this.sealData);
    this.sealMaterial = createGlyphSealMaterial();
    this.seals = new InstancedMesh(this.sealGeometry, this.sealMaterial, GLYPH_MAX);
    this.seals.name = 'GlyphSeals';
    this.seals.layers.set(LAYER.WORLD);
    this.seals.castShadow = true;
    this.seals.frustumCulled = false;
    this.seals.count = 0;
    this.group.add(this.seals);
    this._sealSpin = 0;

    /* ---- layer 7: the ley line ---- */
    this.leyGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.leyMaterial = createGlyphLeyMaterial();
    this.ley = new Mesh(this.leyGeometry, this.leyMaterial);
    this.ley.name = 'GlyphLey';
    this.ley.layers.set(LAYER.VFX);
    this.ley.renderOrder = 2;
    this.ley.frustumCulled = false;
    this.ley.visible = false;
    this.group.add(this.ley);

    this._leyState = {
      start: new Vector3(),
      dir: new Vector3(0, 0, 1),
      side: new Vector3(1, 0, 0),
      length: 1,
      drawn: 0,
      charge: 0,
      fade: 0,
      seed: 0
    };

    this._count = 0;
    this._stamped = 0;
    this._erupted = 0;
    this._lastEruptAt = -1;
    this._seed = 0;
    this._rotA = 0;
    this._rotB = 0;
    this._rotC = 0;
    this._focus = -1;

    /* ---- layer 8: the grip ---- */
    this._grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) this._grips.push({ dummy: null, time: 0, glyph: 0 });
    this._gripCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._flow = { cx: 0, cz: 0, up: 0, ceiling: 1, pull: 0, spin: 0, out: 0, lift: 0 };
    this._liftField = (x, y, z, out) => this._sampleLift(x, y, z, out);
    this._throwField = (x, y, z, out) => this._sampleThrow(x, y, z, out);
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.12 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- rune shards ---- */
    this.shards = particles.get('glyphs.shards', {
      capacity: 900,
      shape: ParticleShape.CHIP,
      additive: true,
      softFade: 0.2
    });
    this.shards.uniforms.uEndSize.value = 0.3;
    this.shards.uniforms.uSizeIn.value = 0.04;
    this.shards.uniforms.uFadeIn.value = 0.03;
    this.shards.uniforms.uFadeOut.value = 0.45;
    this.shards.uniforms.uDrag.value = 0.6;

    /* ---- motes ---- */
    this.motes = particles.get('glyphs.motes', {
      capacity: 1200,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.motes.uniforms.uEndSize.value = 0.2;
    this.motes.uniforms.uSizeIn.value = 0.15;
    this.motes.uniforms.uFadeIn.value = 0.2;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uDrag.value = 1.2;

    /* ---- pillar streaks ---- */
    this.streaks = particles.get('glyphs.streaks', {
      capacity: 1400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.streaks.uniforms.uEndSize.value = 0.4;
    this.streaks.uniforms.uSizeIn.value = 0.03;
    this.streaks.uniforms.uFadeIn.value = 0.05;
    this.streaks.uniforms.uFadeOut.value = 0.5;
    this.streaks.uniforms.uDrag.value = 0.8;

    /* ---- ring flashes ---- */
    this.rings = particles.get('glyphs.rings', {
      capacity: 120,
      shape: ParticleShape.RING,
      additive: true,
      softFade: 0.2
    });
    this.rings.uniforms.uEndSize.value = 1;
    this.rings.uniforms.uSizeIn.value = 0.3;
    this.rings.uniforms.uFadeIn.value = 0.02;
    this.rings.uniforms.uFadeOut.value = 0.75;
    this.rings.uniforms.uDrag.value = 0;

    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the chain: charge, every detonation, the last pillar. */
  get impactDuration() {
    const c = settings.glyphs;
    const n = Math.max(1, this._count);
    return Math.max(0.1, c.holdTime + (n - 1) * c.chainInterval + c.pillarTime + 0.1);
  }

  /** The fade is the spent glyphs coming off the floor. */
  get fadeDuration() {
    return Math.max(0.1, settings.glyphs.lifetime * settings.global.lifetime);
  }

  /** Arcane crackle: mostly steady, with quick bright ticks. */
  lightShimmer() {
    const f = settings.glyphs.lightFlicker;
    const tick = Math.pow(0.5 + 0.5 * Math.sin(this.age * 31.0) * Math.sin(this.age * 7.7 + 1.3), 6);
    return 1 - f * 0.5 + f * tick;
  }

  /* ------------------------------------------------------------------ */
  /* Layout                                                              */
  /* ------------------------------------------------------------------ */

  /** How many glyphs fit this cast, given the spacing floor. */
  _fit() {
    const c = settings.glyphs;
    const first = Math.min(Math.max(0, c.firstAt), this.length);
    const span = this.length - first;
    const room = Math.floor(span / Math.max(0.2, c.minSpacing)) + 1;
    return Math.max(1, Math.min(GLYPH_MAX, Math.round(c.glyphCount), room));
  }

  /** Where glyph `i` sits, resolved from settings every frame. */
  _layout() {
    const c = settings.glyphs;
    const g = settings.global;
    const n = this._count;
    const first = n === 1 ? this.length : Math.min(Math.max(0, c.firstAt), this.length);
    for (let i = 0; i < n; i++) {
      const rec = this._glyphs[i];
      rec.along = n === 1 ? this.length : lerp(first, this.length, i / (n - 1));
      const lat = rec.lat * c.jitter * g.randomness;
      rec.x = this.origin.x + this.direction.x * rec.along + _right.x * lat;
      rec.z = this.origin.z + this.direction.z * rec.along + _right.z * lat;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._releaseGrips();
    this.moteEmitter.reset();
    _right.set(this.direction.z, 0, -this.direction.x);

    this._seed = Math.random() * 100;
    this._count = this._fit();
    this._stamped = 0;
    this._erupted = 0;
    this._lastEruptAt = -1;
    this._rotA = Math.random() * TAU;
    this._rotB = Math.random() * TAU;
    this._rotC = Math.random() * TAU;
    this._sealSpin = 0;
    this._focus = -1;

    for (let i = 0; i < GLYPH_MAX; i++) {
      const rec = this._glyphs[i];
      rec.lat = Math.random() * 2 - 1;
      rec.spin = Math.random() * TAU;
      rec.seed = Math.random() * 10;
      rec.stampAt = -1;
      rec.eruptAt = -1;
      rec.charge = 0;
      rec.sigil.visible = false;
      rec.pillar.visible = false;
      rec.warp.visible = false;
      rec.bind.visible = false;
      rec.sealLift = 0;
    }
    this._layout();

    this.runes.visible = true;
    this.ley.visible = true;
    this._leyState.seed = this._seed;
    this._syncAll(0);
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
    _emit.sizeVariance = 0.4;
    _emit.life = 1;
    _emit.lifeVariance = 0.3;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  /** Turn the rings; integrated so a speed slider never snaps them. */
  _advance(dt) {
    const c = settings.glyphs;
    const k = dt * settings.global.animationSpeed;
    this._rotA += c.spinOuter * k;
    this._rotB += c.spinStar * k;
    this._rotC += c.spinCore * k;
    this._sealSpin += c.sealSpin * k;
  }

  /**
   * Seal stone `i` this frame, closed-form from the front and the glyph's own
   * clocks: thrown ahead of the front, slammed face-down on the stamp frame,
   * lifted to hover over its print, flung up the pillar when it erupts.
   * Writes its matrix and its `aSeal` (glow, throb, seed) slot.
   */
  _sealFrame(i, rec, fadeT, throb) {
    const c = settings.glyphs;
    const R = Math.max(0.1, c.glyphRadius);
    const S = c.sealSize * R;
    let x = rec.x, z = rec.z, y = 0;
    let grow = 1, squash = 0, glow = 0.4, yaw = rec.spin, tilt = 0, lifted = 0;
    if (rec.stampAt < 0) {
      // In flight: thrown from `sealLead` metres back down the line.
      const from = Math.max(0.5, rec.along - c.sealLead);
      const p = saturate((this.front - from) / Math.max(0.05, rec.along - from));
      if (p <= 0 || this.phase !== AbilityPhase.TRAVEL) grow = 0;
      const slam = Math.min(0.9, Math.max(0.05, c.sealSlam));
      const f = saturate(p / (1 - slam));
      const q = saturate((p - (1 - slam)) / slam);
      const lat = rec.lat * c.jitter * settings.global.randomness * f;
      const along = lerp(from, rec.along, f);
      x = this.origin.x + this.direction.x * along + _right.x * lat;
      z = this.origin.z + this.direction.z * along + _right.z * lat;
      y = q > 0 ? c.sealDrop * (1 - q * q) : lerp(1.4, c.sealDrop, f) + c.sealArc * Math.sin(Math.PI * f);
      grow *= 0.35 + 0.65 * Easing.outCubic(saturate(p * 3));
      yaw += p * Math.PI;
      glow = 0.6 + q;
    } else {
      const sa = this.age - rec.stampAt;
      const e = rec.eruptAt >= 0 ? this.age - rec.eruptAt : -1;
      yaw += Math.PI + this._sealSpin;
      if (sa < c.sealDwell) {
        squash = c.sealSquash * Math.exp(-sa / 0.05);
      } else {
        const k = saturate((sa - c.sealDwell) / Math.max(0.02, c.sealRiseTime));
        y = c.sealHover * Easing.outBack(k) + c.sealBob * Math.sin(this.age * 3 + rec.seed) * k;
        lifted = k;
      }
      // The stamp flare, then the chain's throb; tipped toward its print.
      glow = 0.5 + 2.4 * Math.exp(-sa / 0.15) + rec.charge * 1.2;
      tilt = c.sealTilt * rec.charge;
      if (e >= 0) {
        y += c.sealFling * e * (1 + 2 * e);
        grow = 1 - Easing.inQuad(saturate(e / Math.max(0.02, c.sealGone)));
        yaw += e * 9;
        glow = 3.5;
        lifted *= 1 - saturate(e / 0.12);
      }
    }
    grow *= 1 - fadeT;
    rec.sealY = y;
    rec.sealR = S * grow;
    rec.sealLift = lifted * grow;
    _seal.position.set(x, y, z);
    _seal.rotation.set(tilt * Math.cos(rec.seed), yaw, tilt * Math.sin(rec.seed));
    _seal.scale.set(S * grow * (1 + squash * 0.5), S * c.sealHeight * grow * (1 - squash), S * grow * (1 + squash * 0.5));
    _seal.updateMatrix();
    this.seals.setMatrixAt(i, _seal.matrix);
    this.sealData.setXYZW(i, glow, throb, rec.seed, 0);
  }

  /** How charged the chain is: 0 while stamping, rising to 1 over the hold. */
  _chainCharge() {
    if (this.phase === AbilityPhase.TRAVEL) return 0;
    if (this.phase === AbilityPhase.IMPACT) return smoothstep(0, Math.max(0.01, settings.glyphs.holdTime), this.impactTime);
    return 1;
  }

  /**
   * Resolve every glyph, pillar, fragment and the ley line from settings.
   * @param {number} fadeT 0..1 through the fade
   */
  _syncAll(fadeT) {
    const c = settings.glyphs;
    const g = settings.global;
    this._layout();
    const charge = this._chainCharge();
    const R = Math.max(0.1, c.glyphRadius);
    const A = this.runeMaterial.uniforms.uGlyphA.value;
    const B = this.runeMaterial.uniforms.uGlyphB.value;

    for (let i = 0; i < GLYPH_MAX; i++) {
      const rec = this._glyphs[i];
      if (i >= this._count || rec.stampAt < 0) {
        rec.sigil.visible = false;
        rec.pillar.visible = false;
        rec.warp.visible = false;
        B[i].w = 0;
        continue;
      }
      const sa = this.age - rec.stampAt;
      const e = rec.eruptAt >= 0 ? this.age - rec.eruptAt : -1;
      // Throbs while charged; each glyph a beat behind the last, so the pulse
      // visibly runs down the chain.
      rec.charge = e >= 0 ? 0 : charge;
      const throb = rec.charge * c.chargePulse * (0.5 + 0.5 * Math.sin(this.age * c.chargeRate - i * 0.9));

      /* the sigil */
      const s = rec.sigilState;
      const st = saturate(sa / Math.max(0.01, c.stampTime));
      s.x = rec.x;
      s.z = rec.z;
      s.lift = c.glyphLift + i * 0.0015;
      s.spin = rec.spin;
      s.seed = rec.seed;
      // Lands oversized and is pressed down into the floor.
      s.scale = 1 + c.stampOvershoot * (1 - Easing.outCubic(st));
      s.stamp = Easing.outCubic(saturate(sa / Math.max(0.01, c.stampTime * 1.6)));
      s.bright = (1 + 1.2 * Math.exp(-sa / 0.12)) * (1 + throb) + (e >= 0 ? 1.4 * Math.exp(-e / 0.1) : 0);
      s.spent = e >= 0 ? lerp(1, c.spentDim, smoothstep(0, 0.35, e)) : 1;
      s.fade = fadeT;
      if (e >= 0) {
        const k = e / Math.max(0.05, c.shockTime);
        s.shockR = R * lerp(0.5, c.shockReach, Easing.outCubic(saturate(k)));
        s.shockA = k < 1 ? 1 - smoothstep(0.35, 1, k) : 0;
      } else {
        // The small ring flash it punches in with: the same ring, short and tight.
        const k = sa / Math.max(0.05, c.stampTime * 1.5);
        s.shockR = R * lerp(0.95, c.stampRing, Easing.outCubic(saturate(k)));
        s.shockA = k < 1 ? (1 - Easing.inQuad(saturate(k))) * 0.8 : 0;
      }
      s.rotA = this._rotA;
      s.rotB = this._rotB;
      s.rotC = this._rotC;
      rec.sigilMaterial.userData.sync(s);
      rec.sigil.visible = fadeT < 1;

      /* the pillar */
      const pt = Math.max(0.05, c.pillarTime);
      const live = e >= 0 && e < pt;
      rec.pillar.visible = live;
      rec.warp.visible = live;
      if (live) {
        const k = e / pt;
        const ps = rec.pillarState;
        ps.seed = rec.seed;
        ps.height = c.pillarHeight * Easing.outCubic(saturate(e / Math.max(0.01, c.pillarRise)));
        ps.radius = c.pillarRadius * (1 + 0.6 * Math.exp(-e / 0.07)) * (1 - 0.7 * Easing.inQuad(k));
        ps.intensity = (1 - Easing.inQuad(k)) * (1 + 1.5 * Math.exp(-e / 0.08)) * smoothstep(0, 0.025, e);
        rec.pillarMaterial.userData.sync(ps);
        rec.warpMaterial.userData.sync(ps);
        rec.pillar.position.set(rec.x, 0, rec.z);
        rec.warp.position.set(rec.x, 0, rec.z);
      }

      /* its fragments */
      A[i].set(rec.x, rec.z, R, sa);
      B[i].set(e, fadeT, rec.charge, 1);
    }

    /* the seal stones, after the glyphs' charge is resolved */
    for (let i = 0; i < this._count; i++) {
      const rec = this._glyphs[i];
      const throb = rec.charge * (0.5 + 0.5 * Math.sin(this.age * c.chargeRate - i * 0.9));
      this._sealFrame(i, rec, fadeT, throb);
    }
    this.seals.count = this._count;
    for (let i = 0; i < GLYPH_MAX; i++) {
      const rec = this._glyphs[i];
      const on = i < this._count && rec.sealLift > 0.01 && c.bindStrength > 0 && fadeT < 1;
      rec.bind.visible = on;
      if (!on) continue;
      // The shaft: from the seal's striking face down to its own print.
      const bs = rec.bindState;
      bs.foot = R * c.bindFoot;
      bs.top = rec.sealR * 0.92;
      bs.height = Math.max(0.05, rec.sealY);
      bs.seed = rec.seed;
      // Once its glyph erupts the shaft is cut: it must not stretch up after
      // the flung seal as a pale cone laid over the violet pillar.
      const cut = rec.eruptAt >= 0 ? Math.exp(-(this.age - rec.eruptAt) / 0.06) : 1;
      bs.intensity = c.bindStrength * rec.sealLift * (0.55 + 0.9 * rec.charge) * (1 - fadeT) * cut;
      rec.bindMaterial.userData.sync(bs);
      rec.bind.position.set(rec.x, 0, rec.z);
    }
    this.seals.instanceMatrix.needsUpdate = true;
    this.sealData.needsUpdate = true;
    this.sealMaterial.userData.sync();

    this.runeGeometry.instanceCount = Math.max(0, Math.min(GLYPH_RUNES_MAX, Math.round(c.runesPerGlyph))) * GLYPH_MAX;
    this.runeMaterial.userData.sync();

    /* the ley line, from the first glyph to the last */
    const ls = this._leyState;
    const first = this._glyphs[0].along;
    const last = this._glyphs[Math.max(0, this._count - 1)].along;
    ls.start.copy(this.origin).addScaledVector(this.direction, first);
    ls.dir.copy(this.direction);
    ls.side.copy(_right);
    ls.length = Math.max(0.05, last - first);
    ls.drawn = Math.max(0, Math.min(this.front, this.length) - first);
    ls.charge = charge;
    const spentFade = this._lastEruptAt >= 0 && this._erupted >= this._count
      ? smoothstep(0, Math.max(0.05, c.pillarTime), this.age - this._lastEruptAt)
      : 0;
    ls.fade = Math.max(fadeT, spentFade);
    this.leyMaterial.userData.sync(ls);
    this.ley.visible = this._count > 1 && ls.fade < 1;

    /* the particles' looks */
    this.shards.setGradient(getColor(c.colorShardA), getColor(c.colorShardB), getColor(c.colorShardC), getColor(c.colorShardD));
    const sh = this.shards.uniforms;
    sh.uGravity.value.set(0, -c.shardGravity, 0);
    sh.uSizeScale.value = g.particleSize;
    sh.uLifeScale.value = g.particleLifetime;
    sh.uSpeedScale.value = g.particleSpeed;
    sh.uOpacity.value = g.opacity;
    sh.uGlow.value = c.shardGlow * g.glow;
    sh.uTurbulence.value = 0.3 * g.turbulence;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const mo = this.motes.uniforms;
    mo.uGravity.value.set(0, c.moteRise, 0);
    mo.uSizeScale.value = g.particleSize;
    mo.uLifeScale.value = g.particleLifetime;
    mo.uSpeedScale.value = g.particleSpeed;
    mo.uOpacity.value = g.opacity;
    mo.uGlow.value = c.moteGlow * g.glow;
    mo.uTurbulence.value = 0.7 * g.turbulence;

    this.streaks.setGradient(getColor(c.colorStreakA), getColor(c.colorStreakB), getColor(c.colorStreakC), getColor(c.colorStreakD));
    const sk = this.streaks.uniforms;
    sk.uGravity.value.set(0, 0, 0);
    sk.uStretch.value = c.streakStretch;
    sk.uSizeScale.value = g.particleSize;
    sk.uLifeScale.value = g.particleLifetime;
    sk.uSpeedScale.value = g.particleSpeed;
    sk.uOpacity.value = g.opacity;
    sk.uGlow.value = c.streakGlow * g.glow;
    sk.uTurbulence.value = 0.1 * g.turbulence;

    this.rings.setGradient(getColor(c.colorRingA), getColor(c.colorRingB), getColor(c.colorRingC), getColor(c.colorRingD));
    const ri = this.rings.uniforms;
    ri.uGravity.value.set(0, 0, 0);
    ri.uSizeScale.value = g.particleSize;
    ri.uLifeScale.value = g.particleLifetime;
    ri.uSpeedScale.value = g.particleSpeed;
    ri.uOpacity.value = g.opacity;
    ri.uGlow.value = c.ringGlow * g.glow;
    ri.uTurbulence.value = 0;

    /* the look a marked body takes */
    const look = this._look;
    look.color = c.colorMark;
    look.rimColor = c.colorMarkRim;
    look.rimEmissive = c.markRimGlow;
    look.edgeColor = c.colorMarkEdge;
    look.edgeEmissive = c.markEdgeGlow;
    look.edgeWidth = settings.dummies.look.edgeWidth;

    this._placeLight();
  }

  /** The light rides the newest glyph, then whichever has just erupted. */
  _placeLight() {
    const c = settings.glyphs;
    if (this._focus < 0) {
      this.pointAt(Math.min(1, this.u), this.position);
    } else {
      const rec = this._glyphs[this._focus];
      this.position.set(rec.x, 0, rec.z);
    }
    this.position.y = c.lightHeight;
  }

  /* ------------------------------------------------------------------ */
  /* Stamping                                                            */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._advance(dt);
    this._layout();
    for (let i = this._stamped; i < this._count; i++) {
      if (this.front + 1e-4 < this._glyphs[i].along) break;
      this._stamp(i);
    }
    this._syncAll(0);
    this._glyphFx(dt);
    this._mark();
  }

  /** One glyph punches into the floor. */
  _stamp(i) {
    const c = settings.glyphs;
    const g = settings.global;
    const rec = this._glyphs[i];
    rec.stampAt = this.age;
    this._stamped = i + 1;
    this._focus = i;
    const R = Math.max(0.1, c.glyphRadius);

    _floor.set(rec.x, 0, rec.z);
    // The print: a dark imprint the seal leaves in the floor, outliving the glyph.
    if (c.imprintDark > 0) {
      this.ctx.decals.spawn(DecalType.SCORCH, _floor, {
        radius: R * 1.05,
        life: c.imprintLife,
        intensity: c.imprintDark,
        colorA: getColor(c.colorScorch),
        colorB: getColor(c.colorScorchRim)
      });
    }
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: R * 1.5,
      life: 0.3,
      width: 0.05,
      intensity: 0.8 * c.decalShock,
      colorA: getColor(c.colorGlyph),
      colorB: getColor(c.colorLine)
    });

    const time = frame.uTime.value;
    // A puff of motes knocked up off the floor as it lands.
    this._resetEmit(time);
    _pos.set(rec.x, 0.15, rec.z);
    _emit.position = _pos;
    _emit.radius = R * 0.8;
    _emit.direction = _up;
    _emit.speed = c.moteRise * 1.6;
    _emit.spread = 0.6;
    _emit.size = c.moteSize;
    _emit.life = c.moteLifetime * 0.7;
    this.motes.emit(Math.round(14 * g.particleCount), _emit);

    // The slam: obsidian chips kicked up off the rim and a ring of dust —
    // the stamp lands in 3D, not only as light on the floor.
    if (c.stampChips > 0) {
      this._resetEmit(time);
      _pos.set(rec.x, 0.1, rec.z);
      _emit.position = _pos;
      _emit.radius = R * 0.85;
      _emit.direction = _up;
      _emit.speed = c.stampChipSpeed;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.9;
      _emit.size = c.shardSize * 0.9;
      _emit.sizeVariance = 0.5;
      _emit.life = c.shardLifetime * 0.6;
      _emit.lifeVariance = 0.3;
      _emit.spin = 12;
      this.shards.emit(Math.round(c.stampChips * g.particleCount), _emit);
    }
    if (c.stampDust > 0) {
      this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
        radius: R * 1.6,
        life: 0.9,
        intensity: c.stampDust,
        colorA: getColor(c.colorScorchRim),
        colorB: getColor(c.colorDeep)
      });
    }

    this.ctx.shake.add(c.stampShake, 9, 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.stampFlash * g.explosionIntensity);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.stampLight);
  }

  /* ------------------------------------------------------------------ */
  /* The chain                                                           */
  /* ------------------------------------------------------------------ */

  onImpact() {
    // Every glyph is on the floor (the last one was stamped this frame). The
    // chain charges in `onFade`; this is just the click of it locking.
    const c = settings.glyphs;
    this.ctx.shake.add(c.stampShake * 0.6, 6, 12);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.5);
  }

  /** Which glyph the k-th detonation is. */
  _orderOf(k) {
    return settings.glyphs.chainOrder >= 0.5 ? k : this._count - 1 - k;
  }

  onFade(dt, t) {
    const c = settings.glyphs;
    this._advance(dt);
    this._layout();

    // Anything the slider changes left unstamped is stamped now.
    for (let i = this._stamped; i < this._count; i++) this._stamp(i);

    // The detonations, on their schedule; in the fade, any left go at once.
    while (this._erupted < this._count) {
      const at = c.holdTime + this._erupted * c.chainInterval;
      if (this.phase === AbilityPhase.IMPACT && this.impactTime < at) break;
      this._erupt(this._orderOf(this._erupted));
      this._erupted++;
    }

    const fadeT = t <= 1 ? 0 : Easing.inOutQuad(saturate(t - 1));
    this._syncAll(fadeT);
    if (t <= 1) {
      this._glyphFx(dt);
      this._mark();
    }
    this._lift(dt);
    if (this.phase === AbilityPhase.IMPACT && this._erupted < this._count) {
      this.ctx.shake.rumble(0.05 * this._chainCharge(), dt);
    }
  }

  /** Glyph `i` detonates. */
  _erupt(i) {
    const c = settings.glyphs;
    const g = settings.global;
    const power = g.explosionIntensity;
    const rec = this._glyphs[i];
    if (rec.eruptAt >= 0) return;
    rec.eruptAt = this.age;
    this._lastEruptAt = this.age;
    this._focus = i;
    const R = Math.max(0.1, c.glyphRadius);
    const time = frame.uTime.value;

    _floor.set(rec.x, 0, rec.z);
    if (c.scorchReach > 0) {
      this.ctx.decals.spawn(DecalType.SCORCH, _floor, {
        radius: R * c.scorchReach,
        life: c.scorchLife,
        intensity: 0.9,
        colorA: getColor(c.colorScorch),
        colorB: getColor(c.colorScorchRim)
      });
    }
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: R * c.shockReach * 1.3 * power,
      life: c.shockTime * 1.3,
      width: 0.07,
      intensity: c.decalShock,
      colorA: getColor(c.colorShock),
      // violet, not white: the floor ring stays in the ramp's body stop
      colorB: getColor(c.colorPillarB)
    });
    _pos.set(rec.x, 0.9, rec.z);
    this.ctx.bursts.spawn(BurstMode.STORM, _pos, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.45,
      intensity: c.burstIntensity,
      opacity: 0.6,
      fresnel: 2.2,
      displace: 0.3,
      squash: 0.8,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    /* rune shards thrown out of the eruption */
    this._resetEmit(time);
    _pos.set(rec.x, 0.25, rec.z);
    _emit.position = _pos;
    _emit.radius = R * 0.4;
    _emit.direction = _up;
    _emit.speed = c.shardSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.6;
    _emit.size = c.shardSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.shardLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 9;
    this.shards.emit(Math.round(c.shardCount * g.particleCount), _emit);

    /* streaks racing up the column */
    this._resetEmit(time);
    _emit.direction = _up;
    _emit.speed = c.streakSpeed;
    _emit.speedVariance = 0.4;
    _emit.spread = 0.06;
    _emit.size = c.streakSize;
    _emit.life = c.streakLifetime;
    const streaks = Math.round(c.streakCount * g.particleCount);
    for (let n = 0; n < streaks; n++) {
      const a = Math.random() * TAU;
      const r = c.pillarRadius * Math.sqrt(Math.random()) * 1.1;
      _pos.set(rec.x + Math.cos(a) * r, Math.random() * 1.5, rec.z + Math.sin(a) * r);
      _emit.position = _pos;
      this.streaks.emit(1, _emit);
    }

    /* halo rings climbing the column */
    this._resetEmit(time);
    _emit.direction = _up;
    _emit.speed = c.ringRise;
    _emit.speedVariance = 0.3;
    _emit.size = c.pillarRadius * c.ringSize;
    _emit.sizeVariance = 0.2;
    _emit.life = c.ringLifetime;
    _emit.lifeVariance = 0.2;
    const halos = Math.max(0, Math.round(c.ringCount));
    for (let n = 0; n < halos; n++) {
      _pos.set(rec.x, c.pillarHeight * (0.12 + 0.5 * (n / Math.max(1, halos))), rec.z);
      _emit.position = _pos;
      this.rings.emit(1, _emit);
    }

    /* whoever is standing on it goes up the pillar */
    this._capture(rec, i);

    this.ctx.shake.add(c.eruptShake * power, 5, 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.eruptFlash * power);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.eruptLight * power);
  }

  /** Motes rising off every charged glyph. */
  _glyphFx(dt) {
    const c = settings.glyphs;
    const g = settings.global;
    let live = 0;
    for (let i = 0; i < this._count; i++) {
      const rec = this._glyphs[i];
      if (rec.stampAt >= 0 && rec.eruptAt < 0) live++;
    }
    if (live === 0) return;
    const charge = 1 + 2 * this._chainCharge();
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * live * charge) * g.particleCount);
    if (n <= 0) return;
    const R = Math.max(0.1, c.glyphRadius);
    this._resetEmit(frame.uTime.value);
    _emit.direction = _up;
    _emit.speed = c.moteRise * 0.5;
    _emit.spread = 0.3;
    _emit.size = c.moteSize;
    _emit.life = c.moteLifetime;
    for (let k = 0; k < n; k++) {
      // A random live glyph, a random point on one of its rings.
      let pick = Math.floor(Math.random() * live);
      let rec = null;
      for (let i = 0; i < this._count; i++) {
        const r = this._glyphs[i];
        if (r.stampAt < 0 || r.eruptAt >= 0) continue;
        if (pick-- === 0) {
          rec = r;
          break;
        }
      }
      if (!rec) break;
      const a = Math.random() * TAU;
      const rr = R * (Math.random() < 0.5 ? 0.98 : 0.3 + Math.random() * 0.6);
      _pos.set(rec.x + Math.cos(a) * rr, 0.05, rec.z + Math.sin(a) * rr);
      _emit.position = _pos;
      this.motes.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  /** Light up whoever is standing on a glyph that has not gone yet. */
  _mark() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings.glyphs;
    const R = Math.max(0.1, c.glyphRadius) * c.catchRadius;
    for (let i = 0; i < this._count; i++) {
      const rec = this._glyphs[i];
      if (rec.stampAt < 0 || rec.eruptAt >= 0) continue;
      const lit = saturate((this.age - rec.stampAt) / 0.3);
      const found = field.findTargets(rec.x, rec.z, R, this._found);
      for (const dummy of found) dummy.corrode(c.markTint * lit * (0.45 + 0.55 * rec.charge), this._look);
    }
  }

  _gripOf(dummy) {
    for (let i = 0; i < this._gripCount; i++) if (this._grips[i].dummy === dummy) return true;
    return false;
  }

  _dropGrip(index) {
    const last = this._gripCount - 1;
    const slot = this._grips[index];
    this._grips[index] = this._grips[last];
    this._grips[last] = slot;
    slot.dummy?.release();
    slot.dummy = null;
    slot.time = 0;
    this._gripCount = last;
  }

  _releaseGrips() {
    for (let i = 0; i < this._gripCount; i++) {
      this._grips[i].dummy?.release();
      this._grips[i].dummy = null;
      this._grips[i].time = 0;
    }
    this._gripCount = 0;
  }

  /** Everyone on the glyph, standing or lying, is taken up into the pillar. */
  _capture(rec, index) {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings.glyphs;
    const g = settings.global;
    const R = Math.max(0.1, c.glyphRadius) * c.catchRadius;
    const found = field.findBodies(rec.x, rec.z, R, this._found);
    this._force.impulse = c.liftImpulse * g.explosionIntensity;
    this._force.lift = c.liftKick * g.explosionIntensity;
    this._force.spin = 1.2;
    for (const dummy of found) {
      if (this._gripCount >= MAX_GRIPS) break;
      if (this._gripOf(dummy)) continue;
      if (dummy.alive) {
        // Knocked off its feet *up*, a little away from the axis.
        const dx = dummy.position.x - rec.x;
        const dz = dummy.position.z - rec.z;
        const l = Math.hypot(dx, dz);
        const ox = l > 1e-3 ? dx / l : this.direction.x;
        const oz = l > 1e-3 ? dz / l : this.direction.z;
        dummy.corrode(c.markTint, this._look);
        if (!dummy.kill(ox, oz, this._force)) continue;
      } else if (!dummy.bodyPoint(_at)) {
        continue;
      }
      const slot = this._grips[this._gripCount++];
      slot.dummy = dummy;
      slot.time = 0;
      slot.glyph = index;
    }
  }

  /**
   * The pillar's pull, sampled per joint of every body it holds. Reads
   * `_flow`, which `_lift` points at each body's own glyph before carrying it.
   *
   *  - **pull** — a spring onto the axis, so the body rises *in* the light.
   *  - **turn** — tangential, so it revolves as it goes up.
   *  - **climb** — up at `liftSpeed`, easing off under a ceiling so it hangs
   *    in the column rather than leaving out of the top.
   */
  _sampleLift(x, y, z, out) {
    const f = this._flow;
    const rx = x - f.cx;
    const rz = z - f.cz;
    const r = Math.max(1e-3, Math.hypot(rx, rz));
    const radial = -r * f.pull;
    const climb = Math.max(-f.up, Math.min(f.up, (f.ceiling - y) * 2.5));
    out.set((rx / r) * radial + (-rz / r) * f.spin, climb, (rz / r) * radial + (rx / r) * f.spin);
  }

  /** The pillar lets go: up and out. */
  _sampleThrow(x, y, z, out) {
    const f = this._flow;
    const rx = x - f.cx;
    const rz = z - f.cz;
    const r = Math.hypot(rx, rz);
    const ox = r > 1e-3 ? rx / r : this.direction.x;
    const oz = r > 1e-3 ? rz / r : this.direction.z;
    out.set(ox * f.out - oz * f.spin * 0.3, f.lift, oz * f.out + ox * f.spin * 0.3);
  }

  _lift(dt) {
    if (dt <= 0 || this._gripCount === 0) return;
    const c = settings.glyphs;
    const g = settings.global;
    const f = this._flow;
    const grab = saturate(c.liftGrab * dt);

    for (let i = this._gripCount - 1; i >= 0; i--) {
      const slot = this._grips[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished || !dummy.bodyPoint(_at)) {
        this._dropGrip(i);
        continue;
      }
      const rec = this._glyphs[slot.glyph];
      f.cx = rec.x;
      f.cz = rec.z;
      slot.time += dt;
      dummy.hold();
      dummy.corrode(c.markTint, this._look);

      if (slot.time >= c.liftTime || this.phase === AbilityPhase.FADE) {
        // One frame of an up-and-out wind at full grip, then let go.
        f.out = c.throwOut * g.explosionIntensity;
        f.lift = c.throwUp * g.explosionIntensity;
        f.spin = c.liftSpin;
        dummy.carry(this._throwField, 1, 1, 0);
        this._dropGrip(i);
        continue;
      }

      const wound = Easing.outCubic(saturate(slot.time / 0.2));
      f.up = c.liftSpeed * wound;
      f.ceiling = Math.max(1, c.pillarHeight * 0.45);
      f.pull = c.liftPull;
      f.spin = c.liftSpin * wound;
      dummy.carry(this._liftField, grab * wound, grab * wound, saturate(c.liftBuoyancy * wound));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._releaseGrips();
    for (const rec of this._glyphs) {
      rec.sigil.visible = false;
      rec.pillar.visible = false;
      rec.warp.visible = false;
      rec.bind.visible = false;
    }
    this.runes.visible = false;
    this.ley.visible = false;
    this.runeGeometry.instanceCount = 0;
    this.seals.count = 0;
  }

  dispose() {
    for (const rec of this._glyphs) {
      rec.sigilMaterial.dispose();
      rec.pillarMaterial.dispose();
      rec.warpMaterial.dispose();
      rec.bindMaterial.dispose();
    }
    this.sigilGeometry.dispose();
    this.pillarGeometry.dispose();
    this.runeGeometry.dispose();
    this._quad.dispose();
    this.runeMaterial.dispose();
    this.leyGeometry.dispose();
    this.leyMaterial.dispose();
    this.sealGeometry.dispose();
    this.sealMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F52F}  Glyph Barrage');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'stamping speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 8, 0.05, 'glyphs fade over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'crackle');
  R(light, c, 'lightHeight', 0, 6, 0.01, 'height (m)');

  const chain = folder.addFolder('0 · The chain');
  R(chain, c, 'glyphCount', 1, 12, 1, 'glyphs');
  R(chain, c, 'firstAt', 0, 10, 0.05, 'first lands at (m)');
  R(chain, c, 'minSpacing', 0.2, 8, 0.05, 'closest spacing (m)');
  R(chain, c, 'stampTime', 0.02, 1, 0.01, 'punches in over (s)');
  R(chain, c, 'stampOvershoot', 0, 2, 0.01, 'lands oversized');
  R(chain, c, 'stampRing', 1, 3, 0.01, 'ring flash reach (× radius)');
  R(chain, c, 'holdTime', 0, 3, 0.01, 'charges for (s)');
  R(chain, c, 'chainInterval', 0, 1, 0.005, 'between detonations (s)');
  R(chain, c, 'chainOrder', 0, 1, 1, 'order (0 far→near, 1 near→far)');
  R(chain, c, 'jitter', 0, 2, 0.01, 'stray off the line (m)');

  const sigil = folder.addFolder('1 · Sigil');
  R(sigil, c, 'glyphRadius', 0.2, 5, 0.01, 'radius (m)');
  R(sigil, c, 'lineWidth', 0.003, 0.2, 0.001, 'stroke width (m)');
  R(sigil, c, 'haloWidth', 0.005, 0.5, 0.001, 'glow width (m)');
  R(sigil, c, 'lineGlow', 0, 12, 0.05, 'stroke glow');
  R(sigil, c, 'haloGlow', 0, 6, 0.01, 'halo glow');
  R(sigil, c, 'fillGlow', 0, 2, 0.01, 'inner wash');
  R(sigil, c, 'runeCount', 3, 48, 1, 'runes');
  R(sigil, c, 'runeBand', 0.04, 0.4, 0.005, 'rune band (× radius)');
  R(sigil, c, 'tickCount', 4, 180, 1, 'ticks');
  R(sigil, c, 'starPoints', 3, 8, 1, 'star points (× 2)');
  R(sigil, c, 'spokeCount', 2, 24, 1, 'spokes');
  R(sigil, c, 'spinOuter', -4, 4, 0.01, 'rune band spin');
  R(sigil, c, 'spinStar', -4, 4, 0.01, 'star spin');
  R(sigil, c, 'spinCore', -6, 6, 0.01, 'core spin');
  R(sigil, c, 'chargePulse', 0, 5, 0.01, 'charge throb');
  R(sigil, c, 'chargeRate', 0, 40, 0.1, 'throb rate');
  R(sigil, c, 'spentDim', 0, 1, 0.01, 'spent brightness');
  R(sigil, c, 'fadeSoftness', 0.01, 0.9, 0.01, 'ring fade softness');
  R(sigil, c, 'glyphLift', 0.001, 0.1, 0.001, 'lift off floor (m)');
  sigil.addColor(c, 'colorLine').name('white-hot lines');
  sigil.addColor(c, 'colorGlyph').name('glow');
  sigil.addColor(c, 'colorDeep').name('wash');
  sigil.addColor(c, 'colorRune').name('runes');
  R(sigil, c, 'plateCover', 0, 1, 0.01, 'inked plate darkness');
  R(sigil, c, 'plateInk', 0, 3, 0.01, 'ink swirl glow');
  R(sigil, c, 'plateInkScale', 0.3, 8, 0.05, 'ink swirl scale');
  sigil.addColor(c, 'colorPlate').name('plate');
  R(sigil, c, 'inkFill', 0, 3, 0.01, 'solid ink fills');
  sigil.addColor(c, 'colorInk').name('ink fills');
  R(sigil, c, 'lineHot', 0, 1, 0.01, 'white-hot strokes share');
  R(sigil, c, 'stampChips', 0, 60, 1, 'chips kicked up per stamp');
  R(sigil, c, 'stampChipSpeed', 0, 12, 0.1, 'chip speed');
  R(sigil, c, 'stampDust', 0, 2, 0.01, 'dust ring per stamp');

  const seal = folder.addFolder('1b · Seal stones');
  R(seal, c, 'sealSize', 0.1, 1.5, 0.01, 'size (× radius)');
  R(seal, c, 'sealHeight', 0.3, 3, 0.01, 'height stretch');
  R(seal, c, 'sealLead', 0.2, 8, 0.05, 'thrown from (m back)');
  R(seal, c, 'sealDrop', 0, 5, 0.05, 'arrives at (m up)');
  R(seal, c, 'sealArc', 0, 4, 0.05, 'flight arc (m)');
  R(seal, c, 'sealSlam', 0.05, 0.9, 0.01, 'slam share of flight');
  R(seal, c, 'sealDwell', 0, 0.5, 0.005, 'sits in its print (s)');
  R(seal, c, 'sealSquash', 0, 0.6, 0.01, 'slam squash');
  R(seal, c, 'sealHover', 0, 5, 0.05, 'hovers at (m)');
  R(seal, c, 'sealRiseTime', 0.02, 1.5, 0.01, 'lifts over (s)');
  R(seal, c, 'sealBob', 0, 0.5, 0.005, 'bob (m)');
  R(seal, c, 'sealSpin', -4, 4, 0.01, 'turn (rad/s)');
  R(seal, c, 'sealTilt', 0, 1.2, 0.01, 'tips when charged (rad)');
  R(seal, c, 'sealFling', 0, 30, 0.1, 'flung up (m/s)');
  R(seal, c, 'sealGone', 0.05, 2, 0.01, 'swallowed over (s)');
  R(seal, c, 'sealGlow', 0, 8, 0.05, 'engraving glow');
  R(seal, c, 'sealRunes', 3, 32, 1, 'rune cells');
  R(seal, c, 'sealRoughness', 0, 1, 0.01, 'roughness');
  R(seal, c, 'sealMetalness', 0, 1, 0.01, 'metalness');
  seal.addColor(c, 'colorSeal').name('obsidian');
  seal.addColor(c, 'colorSealRune').name('engraving');
  R(seal, c, 'bindStrength', 0, 3, 0.01, 'binding shaft strength');
  R(seal, c, 'bindGlow', 0, 4, 0.01, 'binding shaft glow');
  R(seal, c, 'bindFoot', 0.1, 1.5, 0.01, 'shaft foot (× glyph radius)');
  R(seal, c, 'bindStreaks', 1, 40, 1, 'rune-rain streams');
  R(seal, c, 'bindFlow', -10, 10, 0.05, 'rune-rain speed');
  R(seal, c, 'bindFresnel', 0.1, 6, 0.05, 'shaft edge');

  const frag = folder.addFolder('2 · Rune fragments');
  R(frag, c, 'runesPerGlyph', 0, 10, 1, 'per glyph');
  R(frag, c, 'runeSize', 0.02, 1, 0.005, 'size (m)');
  R(frag, c, 'runeHeight', 0, 4, 0.01, 'float height (m)');
  R(frag, c, 'runeOrbit', -4, 4, 0.01, 'orbit (rad/s)');
  R(frag, c, 'runeBob', 0, 1, 0.005, 'bob (m)');
  R(frag, c, 'runeGlow', 0, 10, 0.05, 'glow');
  R(frag, c, 'runeRise', 0, 30, 0.1, 'flung up (m/s)');
  frag.addColor(c, 'colorRuneFrag').name('colour');

  const pillar = folder.addFolder('3 · Pillar');
  R(pillar, c, 'pillarRadius', 0.05, 4, 0.01, 'radius (m)');
  R(pillar, c, 'pillarHeight', 0.5, 30, 0.1, 'height (m)');
  R(pillar, c, 'pillarFlare', 0, 4, 0.01, 'foot flare');
  R(pillar, c, 'pillarTime', 0.1, 4, 0.01, 'stands for (s)');
  R(pillar, c, 'pillarRise', 0.01, 1, 0.005, 'shoots up over (s)');
  R(pillar, c, 'pillarGlow', 0, 10, 0.05, 'glow');
  R(pillar, c, 'pillarCore', 0, 8, 0.05, 'core');
  R(pillar, c, 'pillarStreaks', 1, 40, 0.5, 'streaks round');
  R(pillar, c, 'pillarStreakSpeed', 0, 30, 0.1, 'streak speed');
  R(pillar, c, 'pillarFresnel', 0.1, 8, 0.05, 'edge falloff');
  R(pillar, c, 'pillarSoftFade', 0.01, 2, 0.01, 'soft floor contact (m)');
  R(pillar, c, 'pillarCover', 0, 1, 0.01, 'wall cover (deep, not additive)');
  pillar.addColor(c, 'colorPillarCore').name('core');
  pillar.addColor(c, 'colorPillarA').name('foot');
  pillar.addColor(c, 'colorPillarB').name('top');
  pillar.addColor(c, 'colorPillarDeep').name('deep');
  R(pillar, c, 'pillarCoreTight', 1, 40, 0.5, 'axis thinness');
  R(pillar, c, 'pillarCoreReach', 0.05, 1, 0.01, 'white axis climbs (share of height)');
  R(pillar, c, 'pillarTopDeep', 0, 2, 0.01, 'upper column falls to deep');
  R(pillar, c, 'pillarAxisHeat', 0, 2, 0.01, 'pale share of the column (caps the lavender bloom)');

  const warp = folder.addFolder('4 · Distortion');
  R(warp, c, 'warpStrength', 0, 4, 0.01, 'strength');
  R(warp, c, 'warpWidth', 0.5, 5, 0.01, 'width (× pillar)');
  R(warp, c, 'warpScale', 0.1, 8, 0.01, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 20, 0.05, 'noise speed');

  const shock = folder.addFolder('5 · Shockwave');
  R(shock, c, 'shockReach', 1, 6, 0.01, 'reach (× radius)');
  R(shock, c, 'shockTime', 0.05, 2, 0.01, 'crosses over (s)');
  R(shock, c, 'shockWidth', 0.005, 0.5, 0.001, 'width (m)');
  R(shock, c, 'shockGlow', 0, 10, 0.05, 'glow');
  R(shock, c, 'decalShock', 0, 2, 0.01, 'floor decal');
  R(shock, c, 'burstSize', 0, 8, 0.05, 'ionised shell (m)');
  R(shock, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  shock.addColor(c, 'colorShock').name('ring');
  shock.addColor(c, 'colorBurstA').name('shell inner');
  shock.addColor(c, 'colorBurstB').name('shell mid');
  shock.addColor(c, 'colorBurstC').name('shell outer');
  R(shock, c, 'imprintDark', 0, 1.5, 0.01, 'stamp imprint');
  R(shock, c, 'imprintLife', 0.2, 15, 0.1, 'imprint life (s)');
  R(shock, c, 'scorchReach', 0, 4, 0.01, 'eruption burn (× radius)');
  R(shock, c, 'scorchLife', 0.2, 15, 0.1, 'burn life (s)');
  shock.addColor(c, 'colorScorch').name('burn');
  shock.addColor(c, 'colorScorchRim').name('burn rim');

  const parts = folder.addFolder('6 · Particles');
  const shards = parts.addFolder('Rune shards');
  R(shards, c, 'shardCount', 0, 200, 1, 'per eruption');
  R(shards, c, 'shardSize', 0.01, 0.5, 0.005, 'size');
  R(shards, c, 'shardSpeed', 0, 30, 0.1, 'speed');
  R(shards, c, 'shardLifetime', 0.1, 4, 0.01, 'lifetime');
  R(shards, c, 'shardGravity', 0, 30, 0.1, 'gravity');
  R(shards, c, 'shardGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(shards, c, 'colorShard', 'shard gradient');
  const motes = parts.addFolder('Motes');
  R(motes, c, 'moteRate', 0, 200, 1, 'per second per glyph');
  R(motes, c, 'moteSize', 0.01, 0.4, 0.005, 'size');
  R(motes, c, 'moteRise', 0, 8, 0.05, 'rise');
  R(motes, c, 'moteLifetime', 0.1, 4, 0.01, 'lifetime');
  R(motes, c, 'moteGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(motes, c, 'colorMote', 'mote gradient');
  const streaks = parts.addFolder('Pillar streaks');
  R(streaks, c, 'streakCount', 0, 200, 1, 'per eruption');
  R(streaks, c, 'streakSize', 0.005, 0.3, 0.001, 'width');
  R(streaks, c, 'streakSpeed', 0, 50, 0.1, 'speed');
  R(streaks, c, 'streakLifetime', 0.05, 2, 0.01, 'lifetime');
  R(streaks, c, 'streakStretch', 0, 1, 0.005, 'stretch');
  R(streaks, c, 'streakGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(streaks, c, 'colorStreak', 'streak gradient');
  const rings = parts.addFolder('Pillar halos');
  R(rings, c, 'ringCount', 0, 8, 1, 'per eruption');
  R(rings, c, 'ringSize', 0.2, 12, 0.05, 'size (× pillar radius)');
  R(rings, c, 'ringRise', 0, 20, 0.1, 'climb (m/s)');
  R(rings, c, 'ringLifetime', 0.05, 2, 0.01, 'lifetime');
  R(rings, c, 'ringGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(rings, c, 'colorRing', 'ring gradient');

  const ley = folder.addFolder('7 · Ley line');
  R(ley, c, 'leyWidth', 0.005, 0.3, 0.001, 'width (m)');
  R(ley, c, 'leyGlow', 0, 8, 0.05, 'glow');
  R(ley, c, 'leyDash', 0.1, 10, 0.05, 'dashes per metre');
  R(ley, c, 'leyPulse', 0, 30, 0.1, 'pulse speed');
  ley.addColor(c, 'colorLey').name('colour');

  const beats = folder.addFolder('8 · Beats & bodies');
  R(beats, c, 'stampShake', 0, 1, 0.01, 'stamp knock');
  R(beats, c, 'stampFlash', 0, 1, 0.01, 'stamp flash');
  R(beats, c, 'stampLight', 0, 4, 0.01, 'stamp light (× intensity)');
  R(beats, c, 'eruptShake', 0, 1.5, 0.01, 'eruption knock');
  R(beats, c, 'eruptFlash', 0, 1, 0.01, 'eruption flash');
  R(beats, c, 'eruptLight', 0, 6, 0.01, 'eruption light (× intensity)');
  beats.addColor(c, 'colorFlash').name('flash');
  R(beats, c, 'catchRadius', 0.1, 2, 0.01, 'takes bodies within (× radius)');
  R(beats, c, 'markTint', 0, 1, 0.01, 'marked glow');
  R(beats, c, 'liftTime', 0.05, 3, 0.01, 'held in the pillar (s)');
  R(beats, c, 'liftSpeed', 0, 20, 0.05, 'rise (m/s)');
  R(beats, c, 'liftPull', 0, 20, 0.05, 'pull to the axis');
  R(beats, c, 'liftSpin', -10, 10, 0.05, 'turn (m/s)');
  R(beats, c, 'liftGrab', 0.1, 30, 0.1, 'grip');
  R(beats, c, 'liftBuoyancy', 0, 1, 0.01, 'held up');
  R(beats, c, 'liftImpulse', 0, 10, 0.05, 'knocked off feet (m/s)');
  R(beats, c, 'liftKick', 0, 15, 0.05, 'kicked up (m/s)');
  R(beats, c, 'throwUp', 0, 30, 0.1, 'thrown up (m/s)');
  R(beats, c, 'throwOut', 0, 20, 0.1, 'thrown out (m/s)');
  beats.addColor(c, 'colorMark').name('marked body');
  beats.addColor(c, 'colorMarkRim').name('marked rim');
  R(beats, c, 'markRimGlow', 0, 8, 0.05, 'rim glow');
  beats.addColor(c, 'colorMarkEdge').name('marked edge');
  R(beats, c, 'markEdgeGlow', 0, 12, 0.05, 'edge glow');

  folder.close();
  return folder;
}
