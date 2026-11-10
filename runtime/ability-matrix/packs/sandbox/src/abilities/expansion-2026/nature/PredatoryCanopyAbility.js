import { Color, Group, Mesh, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../../Ability.js';
import { LAYER } from '../../../core/Layers.js';
import { settings, CAST_ANIMATIONS } from '../../../config/settings.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { frame } from '../../../core/FrameUniforms.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { getColor } from '../../../utils/color.js';
import { prefersReducedMotion, syncParticleGlobals } from '../ExpansionAtmosphere.js';
import {
  canopyLeafGeometry,
  canopyThornGeometry,
  canopyStrikeGeometry,
  canopyBranchGeometry,
  canopyVineGeometry,
  canopyCrownGeometry,
  canopyBudGeometry,
  canopyDiscGeometry,
  canopyTrunkGeometry,
  canopyMawBulbGeometry,
  canopyJawGeometry
} from './PredatoryCanopyGeometry.js';
import {
  createBarkMaterial,
  createLeafMaterial,
  createRootMaterial,
  createShadeMaterial,
  createStrikeMaterial,
  createBudMaterial,
  createSnapMaterial,
  createMawMaterial
} from './PredatoryCanopyMaterials.js';

// The authored foliage builders are part of this module's public surface.
export { canopyLeafGeometry, canopyThornGeometry, canopyStrikeGeometry };

export const ID = 'exp-predatory-canopy';

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** Ease out with a small overshoot: the trunk heaves up past its height and settles. */
const easeBack = (x) => {
  const t = clamp01(x) - 1;
  return 1 + t * t * (2.4 * t + 1.4);
};

/** Limbs round the crown; three leaves and one vine hang off each. */
const BRANCHES = 12;
const LEAVES_PER_BRANCH = 4;
/** Jaws round the maw's mouth. */
const JAWS = 5;
/** Thorns ringed round the snare. */
const THORNS = 12;
/** Vines that lash at the target. */
const STRIKE_VINES = 3;
/** Distinct vine shapes (the twelve vines cycle through them). */
const VINE_VARIANTS = 3;

const temp = new Vector3();
const _emit = {};
const _pos = new Vector3();
const _down = new Vector3(0, -1, 0);
const _up = new Vector3(0, 1, 0);

/** Set a shared particle uniform only if the system (or a test stand-in) has it. */
function setUniform(system, name, value) {
  const u = system?.uniforms?.[name];
  if (u) u.value = value;
}

/**
 * PREDATORY CANOPY — Nature, zone cast. A real overhead trap: it arms after
 * arrival, waits for a living target, then lashes once.
 *
 * ## The acts
 *
 *   - **travel** — a ribbed seed pod with four folded leaves flies to the
 *     circle at `seedHeight`, turning, light seeping from its seams, trailing
 *     a living **runner** vine back to the caster's hand.
 *   - **unfurl** — on landing the pod bursts: a knock, a flash, a dust ring
 *     and an AIR burst at the floor, and a braided strangler-fig **trunk**
 *     heaves up out of the ground, overshoots and settles at `canopyHeight`
 *     while the canopy opens from a point over `armDelay`. The runner withers.
 *   - **the wait** — leaves flutter, pollen drifts, sun flecks move through
 *     the dappled shade, roots creep in from the snare's rim, and the **maw**
 *     — a hanging pitcher of waxy skin with five toothed jaws — sways under
 *     the crown, jaws breathing, its gullet glowing.
 *   - **the windup** — the first living body inside `zoneRadius` (the
 *     nearest one, after `armDelay`) wakes it: the warning ring races in,
 *     thorns stab up out of the floor, the vines swing in, the leaves
 *     bristle, sap flushes the bark, the camera rumbles, three lashing vines
 *     grow from the crown toward the body — tracking it as it moves — a cage
 *     of thorns stabs up round it, and the maw swings toward it, jaws gaping.
 *   - **the lash** — after `triggerWindup` the body is struck once (if it is
 *     still inside, still the same body, and dummies are still on): AIR
 *     shell, DUSTRING, splinters, torn leaves, a snap of bent air, a knock,
 *     a flash and a punch of light. The maw lunges onto the body and its jaws
 *     snap shut; the vines coil up round it and **bind** for `bindHold`
 *     while the maw chews, then withdraw over `strikeDuration`.
 *   - **wither** — at the end of `lifetime` the canopy sinks by
 *     `dropDistance`, draws in by `retreatStrength`, sheds its leaves and
 *     dissolves tip-first, the thorns sinking back into the floor.
 *
 * ## Layers (each a folder in the editor)
 *
 *   0. **the maw** — the hero: a lathed pitcher bulb (`canopyMawBulbGeometry`)
 *      and five hinged, toothed jaws (`canopyJawGeometry`), lit waxy skin
 *      outside and a glowing gullet ramp inside (`createMawMaterial`), hung
 *      from the crown by a stalk vine. On `LAYER.WORLD`, casting shadows.
 *   1. **the canopy** — a braided strangler-fig trunk (`canopyTrunkGeometry`)
 *      rooted in the snare, braided crown (`canopyCrownGeometry`), twelve knotted
 *      limbs with forks (`canopyBranchGeometry`), forty-eight serrated leaves
 *      (`canopyLeafGeometry`) and twelve hooked vines (`canopyVineGeometry`).
 *      Bark is a lit ridged/mossy shader (`createBarkMaterial`); leaves are
 *      wrap-lit and translucent (`createLeafMaterial`). Both wither with a
 *      noise dissolve and a burning edge.
 *   2. **the snare** — an additive root sigil (`createRootMaterial`) and a
 *      dark, normal-blended leaf shadow (`createShadeMaterial`) on the floor.
 *   3. **the lash** — a cage of curved thorns (`canopyThornGeometry`) round
 *      the snared body, three GPU-bent, lit, thorned tube vines that coil up
 *      the body to bind it (`createStrikeMaterial`), a snap on `LAYER.DISTORTION`
 *      (`createSnapMaterial`), the AIR burst and DUSTRING decal.
 *   4. **particles** — falling LEAF particles and SOFT pollen from the canopy
 *      (pooled, shared), lit CHIP splinters off the struck body.
 *   5. **the seed pod** — `canopyBudGeometry` + `createBudMaterial`, and the
 *      runner vine (a strike-vine tube) trailing it from the caster.
 *   6. **the beats** — unfurl knock, windup rumble, lash knock/flash/light.
 *
 * ## Combat
 *
 * The canopy answers `handlesOwnHits` and strikes through the sandbox
 * dummies directly (`findTargets`, `kill`): the host attributes that kill to
 * this cast. A dummy recycled (new `standGeneration`) or removed after the
 * trigger is never struck, and nothing is struck once dummies are disabled.
 * `settings.global.lifetime` scales the staged clock, so the arm, windup and
 * lash keep their order and proportion.
 *
 * ## The editor rule
 *
 * A cast keeps only the trigger/strike timestamps and its target. Every
 * dimension, time and colour is read from the settings every frame.
 */
export class PredatoryCanopyAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get impactDuration() {
    return this.config.lifetime * this.lifetimeScale;
  }

  get lifetimeScale() {
    return Math.max(0.1, settings.global.lifetime);
  }

  /** Seconds into the impact phase on the authored (unscaled) clock. */
  get stagedTime() {
    return this.impactTime / this.lifetimeScale;
  }

  get fadeDuration() {
    return this.config.fade * this.lifetimeScale;
  }

  get instanceCount() {
    return this.leaves.length + this.branches.length + this.tendrils.length;
  }

  /** Light through leaves: a slow dapple, not a flicker. */
  lightShimmer() {
    return 0.85 + 0.15 * Math.sin(this.age * 1.7) * Math.sin(this.age * 0.6 + 1.1);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.root = new Group();
    this.root.name = 'predatory-canopy';
    this.group.add(this.root);
    this.root.visible = false;
    this.geometries = [];
    this.materials = [];
    const ownG = (g) => (this.geometries.push(g), g);
    const ownM = (m) => (this.materials.push(m), m);

    this.leafGeo = ownG(canopyLeafGeometry());
    this.leafMat = ownM(createLeafMaterial());
    this.bark = ownM(createBarkMaterial());

    /* ---- 2 · the snare: root sigil and dappled shade ---- */
    const disc = ownG(canopyDiscGeometry());
    this.roots = ownM(createRootMaterial());
    this.ground = new Mesh(disc, this.roots);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0.035;
    this.ground.renderOrder = 3;
    this.root.add(this.ground);
    this.shadeMat = ownM(createShadeMaterial());
    this.shade = new Mesh(disc, this.shadeMat);
    this.shade.rotation.x = -Math.PI / 2;
    this.shade.position.y = 0.028;
    this.shade.renderOrder = 2;
    this.root.add(this.shade);

    /* ---- 3 · the lashing vines ---- */
    this.strikeRig = new Group();
    this.group.add(this.strikeRig);
    this.strikeRig.visible = false;
    const strikeGeometry = ownG(canopyStrikeGeometry());
    this.strikeMaterials = [];
    for (let i = 0; i < STRIKE_VINES; i++) {
      const material = ownM(createStrikeMaterial());
      const vine = new Mesh(strikeGeometry, material);
      vine.layers.set(LAYER.VFX);
      vine.frustumCulled = false; // bent on the GPU
      this.strikeRig.add(vine);
      this.strikeMaterials.push(material);
    }

    /* ---- 1 · the canopy: trunk, limbs, leaves, vines, crown ---- */
    this.trunk = new Mesh(ownG(canopyTrunkGeometry()), this.bark);
    this.root.add(this.trunk);
    this.leaves = [];
    this.branches = [];
    this.tendrils = [];
    const vines = [];
    for (let v = 0; v < VINE_VARIANTS; v++) vines.push(ownG(canopyVineGeometry(v * 1.7)));
    for (let i = 0; i < BRANCHES; i++) {
      const a = (i * TAU) / BRANCHES;
      const branch = new Mesh(ownG(canopyBranchGeometry(a, 3.7, i % 3)), this.bark);
      branch.position.y = 4.8;
      this.root.add(branch);
      this.branches.push(branch);
      for (let k = 0; k < LEAVES_PER_BRANCH; k++) {
        const leaf = new Mesh(this.leafGeo, this.leafMat);
        const r = 0.9 + k * 0.72;
        leaf.position.set(Math.cos(a) * r, 4.8 - 0.12 * k, Math.sin(a) * r);
        // Authored positions at spread 4; the ability rescales from these.
        leaf.userData.canopyX = leaf.position.x;
        leaf.userData.canopyZ = leaf.position.z;
        leaf.userData.canopyYOffset = -0.12 * k;
        // Yaw to face out along the limb, then tip the leaf over so it spreads
        // and droops outward (the outer leaves hang lower): a roof, not a fan.
        leaf.rotation.order = 'YXZ';
        leaf.rotation.set(1.3 + k * 0.14, Math.PI / 2 - a, (k % 2 ? 1 : -1) * 0.4);
        leaf.scale.setScalar(0.85 + (i % 3) * 0.1);
        this.root.add(leaf);
        this.leaves.push(leaf);
      }
      const tendon = new Mesh(vines[i % VINE_VARIANTS], this.bark);
      tendon.position.set(Math.cos(a) * 2, 4.8, Math.sin(a) * 2);
      tendon.userData.canopyX = tendon.position.x;
      tendon.userData.canopyZ = tendon.position.z;
      tendon.rotation.y = a;
      this.root.add(tendon);
      this.tendrils.push(tendon);
    }

    /* ---- 0 · the snare rig: maw, stalk and the thorn cage (unscaled) ---- */
    this.snareRig = new Group();
    this.snareRig.visible = false;
    this.group.add(this.snareRig);

    /* ---- 3 · a cage of thorns round the snared body ---- */
    const thorn = ownG(canopyThornGeometry());
    // The thorns share the bark shader but in their own instance, so their
    // points can burn with sap without lighting the whole tree.
    this.thornMat = ownM(createBarkMaterial());
    this.thorns = [];
    for (let i = 0; i < THORNS; i++) {
      const a = (i * TAU) / THORNS;
      const spike = new Mesh(thorn, this.thornMat);
      // Bent tip turned inward, the whole thorn leaning in over the body.
      spike.rotation.set(0, Math.PI - a, -0.3);
      spike.userData.angle = a;
      spike.visible = false;
      this.snareRig.add(spike);
      this.thorns.push(spike);
    }

    /* ---- 0 · the maw ---- */
    this.maw = new Group();
    this.snareRig.add(this.maw);
    this.bulbMat = ownM(createMawMaterial(0));
    this.jawMat = ownM(createMawMaterial(1));
    this.bulb = new Mesh(ownG(canopyMawBulbGeometry()), this.bulbMat);
    this.maw.add(this.bulb);
    const jaw = ownG(canopyJawGeometry());
    this.jaws = [];
    for (let i = 0; i < JAWS; i++) {
      const phi = (i * TAU) / JAWS;
      const pivot = new Group();
      pivot.position.set(Math.cos(phi) * 0.27, -0.97, Math.sin(phi) * 0.27);
      // Local +Z (the inside of the cup) faces the maw's axis.
      pivot.rotation.order = 'YXZ';
      pivot.rotation.y = Math.atan2(-Math.cos(phi), -Math.sin(phi));
      pivot.add(new Mesh(jaw, this.jawMat));
      this.maw.add(pivot);
      this.jaws.push(pivot);
    }
    const vine = ownG(canopyStrikeGeometry());
    this.stalkMat = ownM(createStrikeMaterial());
    this.stalk = new Mesh(vine, this.stalkMat);
    this.snareRig.add(this.stalk);

    /* ---- 5 · the runner: a vine the pod trails back to the caster ---- */
    this.runnerMat = ownM(createStrikeMaterial());
    this.runner = new Mesh(vine, this.runnerMat);
    this.runner.visible = false;
    this.group.add(this.runner);
    this._mawPos = new Vector3();
    this._mawRest = new Vector3();
    this._mawBite = new Vector3();
    this._handPos = new Vector3();

    /* ---- 5 · the seed pod ---- */
    this.seed = new Group();
    this.group.add(this.seed);
    this.seed.visible = false;
    this.budMat = ownM(createBudMaterial());
    this.bud = new Mesh(ownG(canopyBudGeometry()), this.budMat);
    this.seed.add(this.bud);
    this.seedLeaves = [];
    for (let i = 0; i < 4; i++) {
      const leaf = new Mesh(this.leafGeo, this.leafMat);
      leaf.rotation.set(0.7, (i * TAU) / 4, 0);
      leaf.scale.setScalar(0.3);
      this.seed.add(leaf);
      this.seedLeaves.push(leaf);
    }
    this.seed.traverse((n) => {
      if (n.isMesh) {
        n.layers.set(LAYER.VFX);
        n.frustumCulled = false;
      }
    });

    this.crown = new Mesh(ownG(canopyCrownGeometry()), this.bark);
    this.crown.rotation.x = Math.PI / 2;
    this.crown.position.y = 4.8;
    this.root.add(this.crown);
    this.root.traverse((n) => {
      if (n.isMesh) {
        n.layers.set(LAYER.VFX);
        n.frustumCulled = false;
      }
    });
    this.snareRig.traverse((n) => {
      if (n.isMesh) {
        n.layers.set(LAYER.VFX);
        n.frustumCulled = false;
      }
    });
    this.runner.layers.set(LAYER.VFX);
    this.runner.frustumCulled = false;
    // Wood and flesh are solid: rigid, lit meshes go on the WORLD layer and
    // cast the sun's shadow (the leaves bend in their vertex stage, and the
    // GPU-bent vines likewise, so those stay on VFX without shadows).
    const solid = [this.trunk, this.crown, ...this.branches, ...this.tendrils, ...this.thorns, this.bulb];
    for (const j of this.jaws) solid.push(j.children[0]);
    for (const m of solid) {
      m.layers.set(LAYER.WORLD);
      m.castShadow = true;
    }
    /* ---- 3 · the snap of bent air at the struck body ---- */
    this.snapMat = ownM(createSnapMaterial());
    this.snap = new Mesh(disc, this.snapMat);
    this.snap.rotation.x = -Math.PI / 2;
    this.snap.layers.set(LAYER.DISTORTION);
    this.snap.frustumCulled = false;
    this.snap.visible = false;
    this.group.add(this.snap);

    this._found = [];
    this._target = null;
    this._triggerAt = -1;
    this._strikeAt = -1;
    this._struck = false;
    this._withered = false;
    this._snapAt = -1;
    // Vine presence: 1 while the snared body is current and inside the zone,
    // easing to 0 over strikeDuration when it leaves, so the vines withdraw
    // instead of vanishing. _vineTarget holds the last valid aim (rig space).
    this._presence = 0;
    this._vineTarget = new Vector3();
  }

  createParticles() {
    this.leafParticles = this.ctx.particles?.get('exp.canopy.leaves', { capacity: 600, shape: ParticleShape.LEAF, additive: false, lit: true, curl: true, softFade: 0.3 });
    this.moteParticles = this.ctx.particles?.get('exp.canopy.motes', { capacity: 480, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.3 });
    // Splinters are wood, not light: lit and occluding.
    this.splinters = this.ctx.particles?.get(`${ID}.splinters`, { capacity: 360, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.2 }) ?? null;
    this.leafEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
    this._emitPosition = new Vector3();
    this._emitDown = new Vector3(0, -1, 0);
    this._cueA = new Color();
    this._cueB = new Color();
    this._cueDark = new Color();
    this._palette = ['', '', ''];
    // Reused emission records — never allocated per frame.
    this._leafEmit = { position: this._emitPosition, radius: 1, direction: this._emitDown, speed: 0.55, spread: 0.7, size: 0.13, life: 1.7, spin: 3, time: 0 };
    this._moteEmit = { position: this._emitPosition, radius: 1, direction: this._emitDown, speed: 0.2, spread: 0.7, size: 0.07, life: 1.2, spin: 3, time: 0 };
    this._burstOpts = { radius: 0.15, endRadius: 2, life: 0.55, intensity: 0.5, colorA: this._cueA, colorB: this._cueB, colorC: this._cueDark };
    this._decalOpts = { radius: 3, life: 0.9, intensity: 0.55, colorA: this._cueB, colorB: this._cueDark };
  }

  /* ------------------------------------------------------------------ */
  /* Palette                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * The shared leaf and pollen gradients follow the live foliage colours,
   * re-set only when a colour actually changes (they are pooled systems
   * other casts may be drawing from).
   */
  _syncFoliagePalette(c, force) {
    const p = this._palette;
    if (!force && p[0] === c.leafColor && p[1] === c.leafRim && p[2] === c.barkColor) return;
    p[0] = c.leafColor;
    p[1] = c.leafRim;
    p[2] = c.barkColor;
    const leaf = this._cueB.set(c.leafColor);
    const rim = this._cueA.set(c.leafRim);
    const bark = this._cueDark.set(c.barkColor);
    this.leafParticles?.setGradient(leaf, rim, leaf, bark);
    this.moteParticles?.setGradient(rim, leaf, bark, bark);
    this.lastLeafPalette = p;
  }

  /** Per-frame shared particle uniforms, guarded for partial stand-ins. */
  _syncParticles(c) {
    const gl = settings.global;
    syncParticleGlobals(this.leafParticles);
    syncParticleGlobals(this.moteParticles);
    syncParticleGlobals(this.splinters);
    setUniform(this.leafParticles, 'uOpacity', gl.opacity);
    setUniform(this.moteParticles, 'uOpacity', gl.opacity);
    setUniform(this.moteParticles, 'uGlow', gl.glow);
    if (this.splinters) {
      this.splinters.setGradient(getColor(c.colorSplinterA), getColor(c.colorSplinterB), getColor(c.colorSplinterC), getColor(c.colorSplinterD));
      this.splinters.uniforms?.uGravity?.value.set(0, -12, 0);
      setUniform(this.splinters, 'uDrag', 0.7);
      setUniform(this.splinters, 'uOpacity', gl.opacity);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.reduceMotion = prefersReducedMotion();
    this.root.visible = false;
    this.seed.visible = true;
    this.seed.position.copy(this.origin);
    this._target = null;
    this._targetGeneration = null;
    this._triggerAt = -1;
    this._strikeAt = -1;
    this._struck = false;
    this._withered = false;
    this._snapAt = -1;
    this._presence = 0;
    this._vineTarget.set(0, 0.35, 0);
    this._found.length = 0;
    this.strikeRig.visible = false;
    this.snareRig.visible = false;
    this.runner.visible = true;
    this.runnerMat.uniforms.uFade.value = 1;
    this.bulbMat.uniforms.uDissolve.value = 0;
    this.jawMat.uniforms.uDissolve.value = 0;
    this.snap.visible = false;
    for (const thorn of this.thorns) thorn.visible = false;
    this.leafEmitter.reset();
    this.moteEmitter.reset();
    this._syncFoliagePalette(this.config, true);
    this.root.scale.setScalar(1);
    this.leafMat.uniforms.uFade.value = 1;
    this.leafMat.uniforms.uDissolve.value = 0;
    this.leafMat.uniforms.uBristle.value = 0;
    this.bark.uniforms.uDissolve.value = 0;
    this.bark.uniforms.uWake.value = 0;
    this.roots.uniforms.uFade.value = 1;
    this.budMat.uniforms.uFade.value = 1;
  }

  onTravel() {
    const c = this.config;
    const visualTime = this.reduceMotion ? 0 : this.age;
    this.seed.position.copy(this.position);
    this.seed.position.y = c.seedHeight ?? 0.8;
    this.seed.rotation.y = visualTime * (c.seedSpin ?? 3);
    // The pod flies point-first, nodding as it goes.
    this.seed.rotation.x = Math.sin(visualTime * 5) * 0.15;
    this.seed.scale.setScalar(c.seedScale ?? 1);
    this.leafMat.userData.sync(c);
    this.leafMat.uniforms.uTime.value = visualTime;
    this.leafMat.uniforms.uFade.value = 1;
    this.budMat.userData.sync(c);
    this.budMat.uniforms.uTime.value = visualTime;
    this._runner(c, visualTime, 1);
    this._syncParticles(c);
  }

  /** The runner vine from the caster's hand to the pod (world space). */
  _runner(c, visualTime, fade) {
    this.runner.visible = fade > 0.001 && (c.runnerWidth ?? 0.07) > 0;
    if (!this.runner.visible) return;
    const u = this.runnerMat.uniforms;
    this.runnerMat.userData.sync(c);
    u.uWidth.value = c.runnerWidth ?? 0.07;
    u.uArc.value = c.runnerArc ?? 0.5;
    u.uAnchor.value.copy(this.origin).setY(c.runnerHeight ?? 1.2);
    u.uTarget.value.copy(this.seed.visible ? this.seed.position : this.position);
    u.uProgress.value = 1;
    u.uCoil.value = 0;
    u.uTime.value = visualTime;
    u.uFade.value = fade;
  }

  onImpact() {
    const c = this.config;
    const gl = settings.global;
    this.seed.visible = false;
    this.strikeRig.position.copy(this.position);
    this.root.position.copy(this.position);
    this.root.position.y = 0;
    this.root.visible = true;
    this.root.updateMatrix();
    // The pod bursts: a soft knock, a lift of the light, a spray of leaves.
    if (!this.reduceMotion) this.ctx.shake?.add?.((c.unfurlShake ?? 0.1) * gl.explosionIntensity, 3, 12);
    this.lightBoost = (c.strikeLight ?? 9) * 0.4 * gl.explosionIntensity;
    this._leafBurst(this.position, (c.canopyHeight ?? 4.8) * 0.5, c.strikeLeaves ?? 18, c);
    this.snareRig.position.copy(this.position).setY(0);
    this.snareRig.visible = true;
    // The pod hits the floor: a dust ring the size of the snare, an AIR
    // burst of torn earth and a green flash as the trunk heaves out.
    if (!this.reduceMotion) {
      const a = this._cueA.set(c.leafRim);
      const b = this._cueB.set(c.leafColor);
      const dark = this._cueDark.set(c.barkColor);
      const burst = this._burstOpts;
      burst.endRadius = Math.min(4, c.zoneRadius * (c.landBurst ?? 0.6));
      burst.colorA = a;
      burst.colorB = b;
      burst.colorC = dark;
      this.ctx.bursts?.spawn(BurstMode.AIR, this.position, burst);
      const decal = this._decalOpts;
      decal.radius = Math.min(6, c.zoneRadius * (c.landDecal ?? 1));
      decal.colorA = b;
      decal.colorB = dark;
      this.ctx.decals?.spawn(DecalType.DUSTRING, this.position, decal);
      this.ctx.flash?.trigger?.(getColor(c.flashColor ?? c.leafRim), (c.landFlash ?? 0.06) * gl.explosionIntensity);
    }
    this.onFade(0, 0);
  }

  /** A one-shot spray of the canopy's leaves (count × particleCount). */
  _leafBurst(at, height, count, c) {
    if (!this.leafParticles || this.reduceMotion) return;
    const n = Math.min(64, Math.round(count * settings.global.particleCount));
    if (n <= 0) return;
    _pos.copy(at).setY(height);
    _emit.position = _pos;
    _emit.radius = 0.6;
    _emit.direction = _up;
    _emit.speed = (c.leafSpeed ?? 0.55) * 4;
    _emit.speedVariance = 0.5;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.leafSize;
    _emit.sizeVariance = 0.4;
    _emit.life = c.leafLifetime ?? 1.7;
    _emit.lifeVariance = 0.3;
    _emit.spin = 5;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.leafParticles.emit(n, _emit);
  }

  /** Is the triggered body still the one the trap saw, and still in play? */
  _targetCurrent(target, field) {
    if (!target || !settings.dummies.enabled) return false;
    if (this._targetGeneration !== null && field?.standGeneration?.(target) !== this._targetGeneration) return false;
    if (Array.isArray(field?.slots)) {
      for (const slot of field.slots) if (slot?.dummy === target) return true;
      return false;
    }
    return true;
  }

  onFade(dt, t) {
    const visualTime = this.reduceMotion ? 0 : this.age;
    const c = this.config;
    const gl = settings.global;
    const elapsed = this.stagedTime;
    this._syncFoliagePalette(c, false);

    const fade = t <= 1 ? 1 : 1 - clamp01(t - 1);
    const opening = ease(elapsed / Math.max(0.01, c.armDelay));
    const closing = t <= 1 ? 0 : clamp01(t - 1);
    const width = opening * (1 - closing * clamp01(c.retreatStrength ?? 0.8));
    this.root.scale.set(Math.max(0.01, width), 1, Math.max(0.01, width));
    this.ground.scale.set(c.zoneRadius, c.zoneRadius, 1);
    const shadeR = Math.max(0.5, c.canopySpread) * 1.15;
    this.shade.scale.set(shadeR, shadeR, 1);

    /* ---- the canopy: height, spread, wither ---- */
    // The trunk heaves up out of the floor with the opening and overshoots.
    const rise = 0.3 + 0.7 * easeBack(elapsed / Math.max(0.01, c.armDelay));
    const h = Math.max(1, c.canopyHeight * rise - closing * (c.dropDistance ?? 1.5));
    const trunkScale = Math.max(0.1, c.trunkScale ?? 1.5);
    this.trunk.scale.set(trunkScale, h, trunkScale);
    const spread = Math.max(0.5, c.canopySpread) / 4;
    for (const branch of this.branches) {
      branch.position.y = h;
      branch.scale.set(spread, 1, spread);
    }
    for (const leaf of this.leaves) {
      leaf.position.set(leaf.userData.canopyX * spread, h + leaf.userData.canopyYOffset, leaf.userData.canopyZ * spread);
    }
    for (const vine of this.tendrils) {
      vine.position.set(vine.userData.canopyX * spread, h, vine.userData.canopyZ * spread);
      vine.scale.y = h / 4.8;
    }
    this.crown.position.y = h;
    this.crown.rotation.z = visualTime * (c.crownSpin ?? 0.12);

    this.leafMat.userData.sync(c);
    this.leafMat.uniforms.uTime.value = visualTime;
    this.leafMat.uniforms.uFade.value = fade;
    this.leafMat.uniforms.uDissolve.value = closing;
    this.bark.userData.sync(c);
    this.bark.uniforms.uTime.value = visualTime;
    this.bark.uniforms.uFade.value = fade;
    this.bark.uniforms.uDissolve.value = closing * 0.85;
    this.roots.userData.sync(c);
    this.roots.uniforms.uTime.value = visualTime;
    this.roots.uniforms.uFade.value = fade;
    this.roots.uniforms.uArm.value = opening;
    this.shadeMat.userData.sync(c);
    this.shadeMat.uniforms.uTime.value = visualTime;
    this.shadeMat.uniforms.uFade.value = fade * opening;

    /* ---- the snare: who walks in first ---- */
    if (dt > 0 && this.phase === AbilityPhase.IMPACT && elapsed >= c.armDelay && this._triggerAt < 0) {
      const field = this.ctx.dummies;
      if (field?.findTargets) {
        const found = field.findTargets(this.position.x, this.position.z, c.zoneRadius, this._found);
        let nearest = null;
        let nearestDistance = Infinity;
        for (const d of found) {
          if (!d.alive) continue;
          const distance = Math.hypot(d.position.x - this.position.x, d.position.z - this.position.z);
          if (distance > c.zoneRadius) continue;
          if (distance < nearestDistance) {
            nearest = d;
            nearestDistance = distance;
          }
        }
        this._target = nearest;
        if (this._target) {
          this._triggerAt = elapsed;
          this._presence = 1;
          this._targetGeneration = field.standGeneration?.(this._target) ?? null;
        }
        this._found.length = 0;
      }
    }

    const wind = this._triggerAt < 0 ? 0 : clamp01((elapsed - this._triggerAt) / Math.max(0.01, c.triggerWindup));
    this.roots.uniforms.uTrigger.value = wind;
    const target = this._target;
    const field = this.ctx.dummies;
    const targetCurrent = this._targetCurrent(target, field);
    const dist = targetCurrent ? Math.hypot(target.position.x - this.position.x, target.position.z - this.position.z) : Infinity;
    // After the lash the vines hold the body for `bindHold`, then withdraw.
    const release = this._strikeAt < 0 ? 1 : 1 - clamp01((elapsed - this._strikeAt - Math.max(0, c.bindHold ?? 0.45)) / Math.max(0.1, c.strikeDuration ?? 0.6));
    const coil = this._strikeAt < 0 ? 0 : smooth((elapsed - this._strikeAt) / 0.18);
    // The tree wakes with the windup and settles once the vines withdraw.
    const awake = wind * release;
    this.bark.uniforms.uWake.value = awake;
    this.leafMat.uniforms.uBristle.value = awake * (c.leafBristle ?? 1);
    if (awake > 0 && this._strikeAt < 0 && dt > 0 && !this.reduceMotion) {
      this.ctx.shake?.rumble?.((c.windupRumble ?? 0.35) * wind * gl.explosionIntensity, dt);
    }

    /* ---- the strike vines grow toward the target and track it ---- */
    // Visibility rides on the withdraw ramps only: the strike release after a
    // lash, and the presence ramp if the body walks out of the snare or is
    // flung past the zone. Either way the vines fade back, never pop.
    const present = targetCurrent && dist <= c.zoneRadius;
    if (present) this._vineTarget.set(target.position.x - this.position.x, 0.35, target.position.z - this.position.z);
    const presenceStep = dt / Math.max(0.1, c.strikeDuration ?? 0.6);
    this._presence = present ? Math.min(1, this._presence + presenceStep) : Math.max(0, this._presence - presenceStep);
    const vineRelease = release * this._presence;
    this.strikeRig.visible = wind > 0 && vineRelease > 0;
    if (this.strikeRig.visible) {
      for (let i = 0; i < this.strikeMaterials.length; i++) {
        const a = (i * TAU) / STRIKE_VINES;
        const mat = this.strikeMaterials[i];
        mat.userData.sync(c);
        // They whip in from the canopy's rim, so each lash is a long arc
        // across the snare, not a short drop beside the trunk.
        const reach = c.canopySpread * (c.strikeReach ?? 0.7) * Math.max(0.05, Math.min(1, this.root.scale.x));
        mat.uniforms.uAnchor.value.set(Math.cos(a + 0.5) * reach, h - 0.25, Math.sin(a + 0.5) * reach);
        mat.uniforms.uTarget.value.copy(this._vineTarget);
        mat.uniforms.uProgress.value = wind;
        mat.uniforms.uTime.value = visualTime;
        mat.uniforms.uFade.value = fade * vineRelease;
        mat.uniforms.uCoil.value = coil;
        mat.uniforms.uSeed.value = i;
      }
    }

    /* ---- the runner withers once the pod has landed ---- */
    this._runner(c, visualTime, this.phase === AbilityPhase.IMPACT ? 1 - clamp01(elapsed / Math.max(0.05, c.runnerFade ?? 0.6)) : 0);

    /* ---- the maw ---- */
    this._updateMaw(c, h, wind, elapsed, visualTime, fade, closing);

    /* ---- particles: falling leaves and pollen under the canopy ---- */
    this._syncParticles(c);
    if (!this.reduceMotion && this.phase === AbilityPhase.IMPACT) {
      this._emitPosition.copy(this.position).setY(h * 0.85);
      const leafCount = this.leafEmitter.tick(dt, Math.max(0, c.leafRate) * (wind > 0 ? 3.5 : 1) * gl.particleCount);
      const moteCount = this.moteEmitter.tick(dt, Math.max(0, c.moteRate) * gl.particleCount);
      const time = frame.uTime.value;
      if (leafCount && this.leafParticles) {
        const e = this._leafEmit;
        e.radius = c.zoneRadius * 0.7;
        e.speed = c.leafSpeed ?? 0.55;
        e.size = c.leafSize;
        e.life = c.leafLifetime ?? 1.7;
        e.time = time;
        this.leafParticles.emit(leafCount, e);
      }
      if (moteCount && this.moteParticles) {
        const e = this._moteEmit;
        e.radius = c.zoneRadius * 0.7;
        e.speed = c.moteSpeed ?? 0.2;
        e.size = c.moteSize ?? 0.07;
        e.life = c.moteLifetime ?? 1.2;
        e.time = time;
        this.moteParticles.emit(moteCount, e);
      }
    }

    /* ---- thorns stab up with the windup and sink as it withers ---- */
    this.thornMat.userData.sync(c);
    this.thornMat.uniforms.uTime.value = visualTime;
    this.thornMat.uniforms.uFade.value = fade;
    this.thornMat.uniforms.uWake.value = awake;
    this.thornMat.uniforms.uTipGlow.value = (c.thornGlow ?? 1.6) * wind;
    this.thornMat.uniforms.uDissolve.value = closing * 0.85;
    // The cage closes round wherever the vines last saw the body.
    const ring = c.thornRing ?? 0.75;
    for (const thorn of this.thorns) {
      const a = thorn.userData.angle;
      thorn.visible = wind > 0;
      thorn.position.set(this._vineTarget.x + Math.cos(a) * ring, 0.02, this._vineTarget.z + Math.sin(a) * ring);
      thorn.scale.set(1.3, Math.max(0.001, wind * (c.thornLength ?? 1.5) * (1 - closing)), 1.3);
    }
    const curl = c.tendrilCurl ?? 0.42;
    for (let i = 0; i < this.tendrils.length; i++) {
      const v = this.tendrils[i];
      v.rotation.z = Math.sin((i * TAU) / BRANCHES) * wind * curl;
      v.rotation.x = Math.cos((i * TAU) / BRANCHES) * wind * curl;
    }

    /* ---- the lash ---- */
    if (dt > 0 && this._target && !this._struck && wind >= 1) {
      this._struck = true;
      this._strikeAt = elapsed;
      const d = this._target;
      if (targetCurrent && d.alive && Math.hypot(d.position.x - this.position.x, d.position.z - this.position.z) <= c.zoneRadius) {
        // The vines haul the body in toward the trunk.
        temp.set(this.position.x - d.position.x, 0, this.position.z - d.position.z);
        if (temp.lengthSq() < 1e-6) temp.copy(this.direction);
        temp.normalize();
        const hit = d.kill(temp.x, temp.z, { impulse: c.hitImpulse, lift: c.hitLift, spin: c.hitSpin });
        if (hit) this._onLash(d, c);
      }
    }
    this._updateSnap(c, elapsed, visualTime);

    /* ---- wither: the canopy sheds as it starts to go ---- */
    if (t > 1 && !this._withered) {
      this._withered = true;
      this._leafBurst(this.position, h * 0.85, c.shedLeaves ?? 40, c);
    }
  }

  /**
   * The maw: hangs and breathes under the crown, swings toward the snared
   * body with jaws gaping through the windup, lunges and snaps shut at the
   * lash, chews through the bind, then hauls itself back up. Every distance
   * is derived from the live settings and the vines' last aim.
   */
  _updateMaw(c, h, wind, elapsed, time, fade, closing) {
    const scale = Math.max(0.1, c.mawScale ?? 0.85);
    const length = scale * 1.95;
    const sway = this.reduceMotion ? 0 : 0.12;
    // It hangs off the trunk, on the side that faces the caster, so the
    // player sees it — and lunges across to whoever trips the snare.
    const off = (c.mawOffset ?? 1.3) * Math.max(0.05, Math.min(1, this.root.scale.x));
    const ax = -this.direction.x * off;
    const az = -this.direction.z * off;
    this._mawRest.set(ax + Math.sin(time * 0.9) * sway, h - (c.stalkLength ?? 0.3), az + Math.cos(time * 0.7) * sway);
    this._mawBite.set(this._vineTarget.x, Math.max(h * 0.5, (c.mawBite ?? 1.0) + length), this._vineTarget.z);
    const idleOpen = 0.22 + (this.reduceMotion ? 0 : 0.1 * Math.sin(time * 1.6));
    const gape = c.mawOpen ?? 1.15;
    const shut = -0.12;
    // How far it swings toward the body during the windup — kept short so
    // the lunge itself covers most of the distance and reads as a strike.
    const windReach = clamp01(c.mawWindReach ?? 0.3);
    let pop = 1;
    let rear = 0;
    let reach;
    let open;
    let hunger;
    if (this._strikeAt < 0) {
      const w = ease(wind) * this._presence;
      reach = w * windReach;
      rear = w;
      open = idleOpen + (gape - idleOpen) * w;
      hunger = 0.15 + 0.85 * w;
    } else {
      const k = clamp01((elapsed - this._strikeAt) / Math.max(0.03, c.mawLunge ?? 0.14));
      const r = clamp01((elapsed - this._strikeAt - Math.max(0, c.bindHold ?? 0.45)) / Math.max(0.1, c.mawRetract ?? 0.8));
      reach = (windReach + (1 - windReach) * ease(k)) * (1 - smooth(r));
      rear = 1 - ease(k);
      // Swells as it lunges and slams shut, then settles: the bite reads at
      // the play camera's distance. Purely visual; the hit already landed.
      const q = clamp01((elapsed - this._strikeAt) / Math.max(0.05, (c.mawLunge ?? 0.14) + (c.mawPopTime ?? 0.25)));
      pop = 1 + (c.mawPop ?? 0) * Math.sin(Math.PI * q) * (1 - smooth(r));
      if (k < 1) open = gape + (shut - gape) * smooth((k - 0.35) / 0.65);
      else if (r <= 0) open = shut + (this.reduceMotion ? 0 : 0.14 * Math.abs(Math.sin(time * 9)));
      else open = shut + (idleOpen - shut) * smooth(r);
      hunger = 1 - 0.8 * smooth(r);
    }
    // Withering: the jaws go limp and fall open.
    open += closing * 0.6;
    this._mawPos.lerpVectors(this._mawRest, this._mawBite, reach);
    // Rears back (away from the body, toward the caster) and up through the
    // windup, so the lunge is a long plunge, not a short twitch.
    {
      const rx = this._mawBite.x - this._mawRest.x;
      const rz = this._mawBite.z - this._mawRest.z;
      const rl = Math.hypot(rx, rz);
      const back = (c.mawRear ?? 0) * rear * Math.max(0.05, Math.min(1, this.root.scale.x));
      if (rl > 1e-4) {
        this._mawPos.x -= (rx / rl) * back;
        this._mawPos.z -= (rz / rl) * back;
      } else {
        this._mawPos.x += this.direction.x * -back;
        this._mawPos.z += this.direction.z * -back;
      }
      this._mawPos.y += back * (c.mawRearLift ?? 0.3);
    }
    this.maw.position.copy(this._mawPos);
    this.maw.scale.setScalar(scale * pop * Math.max(0.05, Math.min(1, this.root.scale.x)));
    // Swing toward the bite: the free end leads.
    const dx = this._mawBite.x - this._mawRest.x;
    const dz = this._mawBite.z - this._mawRest.z;
    const dl = Math.hypot(dx, dz) || 1;
    const lean = reach * (c.mawLean ?? 0.35);
    this.maw.rotation.set((-dz / dl) * lean, time * 0.15, (dx / dl) * lean);
    for (const j of this.jaws) j.rotation.x = open;
    for (const m of [this.bulbMat, this.jawMat]) {
      m.userData.sync(c);
      m.uniforms.uTime.value = time;
      m.uniforms.uFade.value = fade;
      m.uniforms.uDissolve.value = closing * 0.9;
      m.uniforms.uHunger.value = hunger;
    }
    // The stalk: from the crown to the bulb's neck.
    const u = this.stalkMat.uniforms;
    this.stalkMat.userData.sync(c);
    u.uWidth.value = (c.stalkWidth ?? 0.11) * Math.max(0.05, Math.min(1, this.root.scale.x));
    u.uArc.value = 0.25;
    u.uAnchor.value.set(ax, h, az);
    u.uTarget.value.copy(this._mawPos);
    u.uProgress.value = 1;
    u.uCoil.value = 0;
    u.uTime.value = time;
    u.uFade.value = fade;
  }

  /** The beat of a landed lash. Cosmetic only; the kill already happened. */
  _onLash(d, c) {
    const gl = settings.global;
    this.lightBoost = (c.strikeLight ?? 9) * gl.explosionIntensity;
    if (this.reduceMotion) return;
    const a = this._cueA.set(c.leafRim);
    const b = this._cueB.set(c.leafColor);
    const dark = this._cueDark.set(c.barkColor);
    const burst = this._burstOpts;
    burst.endRadius = Math.min(3, c.zoneRadius * 0.6);
    burst.colorA = a;
    burst.colorB = b;
    burst.colorC = dark;
    this.ctx.bursts?.spawn(BurstMode.AIR, d.position, burst);
    const decal = this._decalOpts;
    decal.radius = Math.min(4, c.zoneRadius);
    decal.colorA = b;
    decal.colorB = dark;
    this.ctx.decals?.spawn(DecalType.DUSTRING, d.position, decal);
    this.ctx.shake?.add?.((c.strikeShake ?? 0.3) * gl.explosionIntensity, 3.5, 18);
    this.ctx.flash?.trigger?.(getColor(c.flashColor ?? c.leafRim), (c.strikeFlash ?? 0.12) * gl.explosionIntensity);
    // Splinters off the body and leaves torn loose above it.
    if (this.splinters) {
      const n = Math.min(96, Math.round((c.splinterBurst ?? 26) * gl.particleCount));
      if (n > 0) {
        _pos.copy(d.position).setY(0.9);
        _emit.position = _pos;
        _emit.radius = 0.35;
        _emit.direction = _up;
        _emit.speed = c.splinterSpeed ?? 4;
        _emit.speedVariance = 0.5;
        _emit.spread = 1;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = c.splinterSize ?? 0.07;
        _emit.sizeVariance = 0.6;
        _emit.life = c.splinterLifetime ?? 0.9;
        _emit.lifeVariance = 0.3;
        _emit.spin = 8;
        _emit.tint = null;
        _emit.time = frame.uTime.value;
        this.splinters.emit(n, _emit);
      }
    }
    this._leafBurst(d.position, 1.4, c.strikeLeaves ?? 18, c);
    this._snapAt = this.stagedTime;
    this.snap.position.set(d.position.x, 0.06, d.position.z);
  }

  /** The ring of bent air running out from the struck body. */
  _updateSnap(c, elapsed, visualTime) {
    if (this._snapAt < 0) {
      this.snap.visible = false;
      return;
    }
    const p = clamp01((elapsed - this._snapAt) / Math.max(0.05, c.snapDuration ?? 0.45));
    const strength = (c.snapWarp ?? 0.8) * Math.max(0, Math.min(2, settings.global.distortion));
    this.snap.visible = !this.reduceMotion && p < 1 && strength > 0;
    const r = c.snapRadius ?? 2.4;
    this.snap.scale.set(r, r, 1);
    this.snapMat.uniforms.uProgress.value = p;
    this.snapMat.uniforms.uStrength.value = strength;
    this.snapMat.uniforms.uTime.value = visualTime;
  }

  onDestroy() {
    this.root.visible = false;
    this.seed.visible = false;
    this.strikeRig.visible = false;
    this.snareRig.visible = false;
    this.runner.visible = false;
    this.snap.visible = false;
    for (const thorn of this.thorns) thorn.visible = false;
    this._target = null;
    this._found.length = 0;
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    super.dispose();
  }
}

export const AbilityType = PredatoryCanopyAbility;

/* -------------------------------------------------------------------- */
/* Editor                                                               */
/* -------------------------------------------------------------------- */

/** Degrades for hosts/tests that pass bare folders or no `Editor`. */
function editorKit(Editor) {
  const named = (ctl, label) => (label && typeof ctl?.name === 'function' ? ctl.name(label) : ctl);
  const sub = (folder, title) => (typeof folder.addFolder === 'function' ? folder.addFolder(title) : folder);
  const R = (folder, c, key, min, max, step, label) =>
    typeof Editor?.range === 'function' ? Editor.range(folder, c, key, min, max, step, label) : named(folder.add(c, key, min, max, step), label);
  const C = (folder, c, key, label) => named(folder.addColor(c, key), label);
  const G = (folder, c, prefix, title) => {
    if (typeof Editor?.gradient === 'function' && typeof folder.addFolder === 'function') return Editor.gradient(folder, c, prefix, title);
    const group = sub(folder, title);
    C(group, c, `${prefix}A`, 'birth');
    C(group, c, `${prefix}B`, 'early');
    C(group, c, `${prefix}C`, 'late');
    C(group, c, `${prefix}D`, 'death');
    return group;
  };
  const anim = (folder, c) =>
    typeof Editor?.castAnimation === 'function' ? Editor.castAnimation(folder, c) : named(folder.add(c, 'castAnim', CAST_ANIMATIONS), 'cast animation');
  return { R, C, G, sub, anim };
}

export function buildEditor(gui, c, Editor) {
  const { R, C, G, sub, anim } = editorKit(Editor);
  const f = gui.addFolder('❦  Predatory Canopy');

  const cast = sub(f, 'The cast');
  R(cast, c, 'range', 1, 48, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 20, 0.1, 'min range');
  R(cast, c, 'speed', 1, 60, 0.1, 'pod speed (m/s)');
  R(cast, c, 'cooldown', 0, 30, 0.1, 'cooldown');
  R(cast, c, 'lifetime', 2, 12, 0.1, 'canopy hangs for');
  R(cast, c, 'fade', 0.1, 5, 0.1, 'withers over');
  anim(cast, c);

  const trap = sub(f, 'The trap');
  R(trap, c, 'zoneRadius', 1, 8, 0.1, 'snare radius (m)');
  R(trap, c, 'armDelay', 0.1, 3, 0.05, 'arms after (s)');
  R(trap, c, 'triggerWindup', 0.1, 1, 0.05, 'windup (s)');
  R(trap, c, 'hitImpulse', 0, 24, 0.1, 'knockback');
  R(trap, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(trap, c, 'hitSpin', 0, 8, 0.05, 'spin');

  const canopy = sub(f, '1 · Canopy');
  R(canopy, c, 'canopyHeight', 2, 9, 0.1, 'height (m)');
  R(canopy, c, 'canopySpread', 1, 7, 0.1, 'spread (m)');
  R(canopy, c, 'retreatStrength', 0, 1, 0.05, 'draws in as it withers');
  R(canopy, c, 'dropDistance', 0, 4, 0.1, 'sinks as it withers (m)');
  R(canopy, c, 'crownSpin', 0, 1, 0.01, 'crown turn (rad/s)');
  R(canopy, c, 'tendrilCurl', 0, 1.2, 0.01, 'vine swing on trigger (rad)');
  R(canopy, c, 'trunkScale', 0.1, 4, 0.05, 'trunk girth (m)');
  const leaves = sub(canopy, 'Leaves');
  R(leaves, c, 'leafFlutter', 0, 3, 0.05, 'flutter');
  R(leaves, c, 'leafVariegation', 0, 1, 0.01, 'variegation');
  R(leaves, c, 'leafBristle', 0, 3, 0.05, 'bristle on trigger');
  C(leaves, c, 'leafColor', 'leaf');
  C(leaves, c, 'leafRim', 'rim and veins');
  R(leaves, c, 'leafDeepAmount', 0, 1, 0.01, 'underside / stem to deep');
  R(leaves, c, 'leafDeepFloor', 0, 1, 0.01, 'deep even on the lit face');
  R(leaves, c, 'leafEdgeStart', 0, 1, 0.01, 'lit margin from (across)');
  R(leaves, c, 'leafEdgeGlow', 0, 3, 0.05, 'lit margin glow');
  C(leaves, c, 'leafDeep', 'deep (underside)');
  const bark = sub(canopy, 'Bark');
  R(bark, c, 'barkRidge', 0.2, 4, 0.05, 'furrow scale');
  R(bark, c, 'barkMoss', 0, 1, 0.01, 'moss');
  C(bark, c, 'barkColor', 'bark');
  C(bark, c, 'mossColor', 'moss');

  const maw = sub(f, '0 · Maw');
  R(maw, c, 'mawScale', 0.1, 2.5, 0.05, 'size (m)');
  R(maw, c, 'mawOffset', 0, 4, 0.05, 'hangs out from the trunk (m)');
  R(maw, c, 'stalkLength', 0, 2, 0.05, 'hangs below the crown (m)');
  R(maw, c, 'stalkWidth', 0.01, 0.4, 0.01, 'stalk thickness (m)');
  R(maw, c, 'mawOpen', 0, 2, 0.05, 'jaw gape (rad)');
  R(maw, c, 'mawBite', 0, 3, 0.05, 'bites down to (m)');
  R(maw, c, 'mawLunge', 0.03, 0.6, 0.01, 'lunge time (s)');
  R(maw, c, 'mawRetract', 0.1, 3, 0.05, 'retract time (s)');
  R(maw, c, 'mawLean', 0, 1.2, 0.01, 'lean into the lunge (rad)');
  R(maw, c, 'mawWindReach', 0, 1, 0.01, 'swing toward the body in the windup');
  R(maw, c, 'mawRear', 0, 3, 0.05, 'rears back before the lunge (m)');
  R(maw, c, 'mawRearLift', 0, 1.5, 0.05, 'rear lift, × rear');
  R(maw, c, 'mawPop', 0, 1, 0.01, 'swell on the bite');
  R(maw, c, 'mawPopTime', 0.05, 1, 0.01, 'swell time after the lunge (s)');
  C(maw, c, 'mawGullet', 'gullet');
  R(maw, c, 'mawGlow', 0, 4, 0.05, 'gullet glow');
  C(maw, c, 'mawColor', 'skin');
  C(maw, c, 'mawCore', 'gullet core');

  const snare = sub(f, '2 · Snare');
  R(snare, c, 'rootGlow', 0, 4, 0.05, 'root glow');
  R(snare, c, 'rootCount', 3, 32, 1, 'root lobes');
  C(snare, c, 'rootColor', 'roots and sap');
  R(snare, c, 'shadeOpacity', 0, 1, 0.01, 'shade darkness');
  R(snare, c, 'shadeScale', 0.2, 4, 0.05, 'fleck size');
  C(snare, c, 'shadeColor', 'shade');

  const lash = sub(f, '3 · Lash');
  R(lash, c, 'thornLength', 0.25, 3, 0.05, 'thorn length (m)');
  R(lash, c, 'thornRing', 0.2, 3, 0.05, 'thorn cage radius (m)');
  R(lash, c, 'thornGlow', 0, 4, 0.05, 'thorn points glow');
  R(lash, c, 'strikeReach', 0, 1.2, 0.01, 'vines whip from (× spread)');
  R(lash, c, 'bindHold', 0, 2, 0.05, 'vines bind the body for (s)');
  R(lash, c, 'bindRadius', 0.1, 1.5, 0.01, 'bind coil radius (m)');
  R(lash, c, 'bindHeight', 0.2, 3, 0.05, 'bind coil height (m)');
  R(lash, c, 'strikeWidth', 0.03, 0.5, 0.01, 'vine width (m)');
  R(lash, c, 'strikeArc', -3, 3, 0.05, 'vine arc (m, − swoops low)');
  R(lash, c, 'strikeGlow', 0, 4, 0.05, 'vine glow');
  R(lash, c, 'strikeDuration', 0.1, 2, 0.05, 'vines withdraw over');
  R(lash, c, 'snapWarp', 0, 3, 0.05, 'air snap strength');
  R(lash, c, 'snapRadius', 0.3, 8, 0.1, 'air snap radius (m)');
  R(lash, c, 'snapDuration', 0.05, 2, 0.01, 'air snap lasts');

  const motes = sub(f, '4 · Particles');
  R(motes, c, 'leafRate', 0, 80, 1, 'leaves/second');
  R(motes, c, 'leafSize', 0.02, 0.5, 0.01, 'leaf size');
  R(motes, c, 'leafSpeed', 0, 4, 0.05, 'leaf drift');
  R(motes, c, 'leafLifetime', 0.2, 5, 0.05, 'leaf lifetime');
  R(motes, c, 'moteRate', 0, 80, 1, 'pollen/second');
  R(motes, c, 'moteSize', 0.01, 0.3, 0.005, 'pollen size');
  R(motes, c, 'moteSpeed', 0, 2, 0.01, 'pollen drift');
  R(motes, c, 'moteLifetime', 0.2, 5, 0.05, 'pollen lifetime');
  R(motes, c, 'strikeLeaves', 0, 64, 1, 'leaves torn at the lash');
  R(motes, c, 'shedLeaves', 0, 64, 1, 'leaves shed on wither');
  R(motes, c, 'splinterBurst', 0, 96, 1, 'splinters at the lash');
  R(motes, c, 'splinterSize', 0.01, 0.3, 0.005, 'splinter size');
  R(motes, c, 'splinterSpeed', 0, 12, 0.1, 'splinter speed');
  R(motes, c, 'splinterLifetime', 0.1, 3, 0.05, 'splinter lifetime');
  G(motes, c, 'colorSplinter', 'splinter gradient');

  const pod = sub(f, '5 · Seed pod');
  R(pod, c, 'seedScale', 0.25, 2, 0.05, 'size');
  R(pod, c, 'seedHeight', 0.1, 3, 0.05, 'flight height (m)');
  R(pod, c, 'seedSpin', 0, 12, 0.1, 'spin (rad/s)');
  R(pod, c, 'seedGlow', 0, 4, 0.05, 'seam glow');
  R(pod, c, 'runnerWidth', 0, 0.3, 0.005, 'runner vine thickness (m)');
  R(pod, c, 'runnerArc', 0, 3, 0.05, 'runner arc (m)');
  R(pod, c, 'runnerHeight', 0, 3, 0.05, 'runner leaves the hand at (m)');
  R(pod, c, 'runnerFade', 0.05, 3, 0.05, 'runner withers over (s)');

  const beats = sub(f, '6 · Beats');
  R(beats, c, 'unfurlShake', 0, 1, 0.01, 'unfurl shake');
  R(beats, c, 'landFlash', 0, 1, 0.01, 'landing flash');
  R(beats, c, 'landBurst', 0, 2, 0.05, 'landing burst (× radius)');
  R(beats, c, 'landDecal', 0, 2, 0.05, 'landing dust ring (× radius)');
  R(beats, c, 'windupRumble', 0, 2, 0.01, 'windup rumble');
  R(beats, c, 'strikeShake', 0, 1, 0.01, 'lash shake');
  R(beats, c, 'strikeFlash', 0, 1, 0.01, 'lash flash');
  R(beats, c, 'strikeLight', 0, 30, 0.1, 'lash light punch');
  C(beats, c, 'flashColor', 'flash');

  const light = sub(f, 'Light');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  C(light, c, 'lightColor', 'colour');
  return f;
}
