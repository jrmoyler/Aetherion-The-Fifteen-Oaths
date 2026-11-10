import { Box3, LoopOnce, SRGBColorSpace, Vector3 } from 'three';

import { settings } from '../../config/settings.js';
import { Dummy } from '../Dummy.js';

/**
 * The Arch-Wizard: the original Mixamo wizard every source pack shipped, back
 * in the arena as a CPU opponent.
 *
 * ## How it is loaded
 *
 * Exactly the files the old caster used (`CharacterController` in the vendored
 * Linear Ext pack): `models/Idle.fbx` (the rig and its breathing idle),
 * `models/diffuse.png` (its skin) and `models/cast1–3.fbx`, of which only the
 * clips are kept — they were authored on this very skeleton, so they bind by
 * bone name with no retargeting.
 *
 * ## Why it is a Dummy
 *
 * Every cast in every pack hits through `DummyField` (`applyHits*`,
 * `findTargets`, `findBodies`) and `Dummy#kill`, and the ones that take hold of
 * a body call `carry`, `sink`, `consume`, `corrode`, `bodyPoint` … on it. The
 * cleanest way to make all ~280 casts reach the wizard is for it to *be* a body
 * with that whole contract, so it is a `Dummy` built from the wizard's own rig
 * and wearing its own skin. Two things differ:
 *
 *  - **`kill` deals damage instead of felling it** (through `onStruck`, which
 *    the duel answers from its HP), until the blow that empties the bar — that
 *    one is a real `Dummy#kill`: it ragdolls, lies there and burns away.
 *  - **It is animated by the duel**, not by watching the caster: it turns to
 *    face whatever the AI says, and plays the three cast gestures.
 */

const WIZARD_URL = './models/Idle.fbx';
const SKIN_URL = './models/diffuse.png';
const CAST_URLS = { cast1: './models/cast1.fbx', cast2: './models/cast2.fbx', cast3: './models/cast3.fbx' };
const FBX_SCALE = 0.01;
const WIZARD_HEIGHT = 1.86;

/** The wizard's own look: its skin under a soft cool rim, embers when it burns. */
const WIZARD_LOOK = Object.freeze({
  color: '#ffffff',
  roughness: 0.82,
  metalness: 0.0,
  rimColor: '#9cb4ff',
  rimPower: 3.2,
  rimEmissive: 0.55,
  edgeColor: '#ffb36b',
  edgeEmissive: 7
});

const _box = new Box3();
const _size = new Vector3();
const _center = new Vector3();
const _a = new Vector3();
const _b = new Vector3();

/**
 * Load and measure the wizard once.
 *
 * @param {import('../../loaders/AssetLoader.js').AssetLoader} assets
 */
export async function loadWizardAssets(assets) {
  const [fbx, skin, ...casts] = await Promise.all([
    assets.loadFBX(WIZARD_URL),
    assets.loadTexture(SKIN_URL),
    ...Object.values(CAST_URLS).map((url) => assets.loadFBX(url).catch(() => null))
  ]);
  await assets.settled?.();
  skin.colorSpace = SRGBColorSpace;
  skin.anisotropy = 4;

  fbx.scale.setScalar(FBX_SCALE);
  fbx.updateMatrixWorld(true);
  _box.setFromObject(fbx);
  _box.getSize(_size);
  const scale = FBX_SCALE * (WIZARD_HEIGHT / Math.max(0.001, _size.y));
  fbx.scale.setScalar(scale);
  fbx.updateMatrixWorld(true);
  _box.setFromObject(fbx);
  _box.getCenter(_center);
  const offset = { x: -_center.x, y: -_box.min.y, z: -_center.z };
  fbx.scale.setScalar(1);
  fbx.updateMatrixWorld(true);

  const clips = {};
  Object.keys(CAST_URLS).forEach((name, i) => {
    const clip = casts[i]?.animations?.[0];
    if (clip) {
      clip.name = name;
      clips[name] = clip;
    }
  });
  return {
    source: fbx,
    idle: fbx.animations?.[0] ?? null,
    clips,
    scale,
    offset,
    forwardYaw: measureForwardYaw(fbx),
    skin,
    height: WIZARD_HEIGHT
  };
}

export class WizardBody extends Dummy {
  /**
   * @param {Awaited<ReturnType<typeof loadWizardAssets>>} assets
   * @param {import('../../world/Environment.js').Environment} environment
   */
  constructor(assets, environment) {
    super({
      source: assets.source,
      clip: assets.idle,
      scale: assets.scale,
      offset: assets.offset,
      forwardYaw: assets.forwardYaw,
      environment,
      archetype: 'standard',
      look: { ...WIZARD_LOOK },
      map: assets.skin
    });
    this.root.name = 'ArchWizard';
    this.height = assets.height;
    this.headPosition = new Vector3(0, assets.height * 0.9, 0);
    /** Who to ask about a blow: returns 'lethal', 'hurt' or 'ignore'. */
    this.onStruck = null;
    /** Whether a given cast is its own (its own casts never hit it). */
    this.owns = null;
    /** UCSM team, so its mechanics target the player and the dummies alike. */
    this.ucsmTeam = 'cpu';
    /** The character contract a cast may read off its caster. */
    this.boneSegments = [];
    this._hurt = 0;
    this._castAction = null;
    this.casts = new Map();
    for (const [name, clip] of Object.entries(assets.clips)) {
      const action = this.mixer.clipAction(clip);
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      this.casts.set(name, action);
    }
    this.mixer.addEventListener('finished', this._onCastFinished);
    if (this.action) this.action.setEffectiveTimeScale(1);
  }

  /** Slightly wider than a dummy: robes. */
  get hitRadius() {
    return settings.dummies.bodyRadius * 1.15;
  }

  /** Its idle, under the name a cast reading its caster expects. */
  get idle() {
    return this.action;
  }

  get isCasting() {
    return this._castAction !== null;
  }

  immuneTo(ability) {
    return !!this.owns?.(ability);
  }

  /* ---- the character contract a cast may read off its caster ---- */

  setFacing(yaw) {
    this.facing = yaw;
    this.root.rotation.y = yaw - this.forwardYaw;
  }

  turnToward(yaw, rate, dt) {
    const delta = ((yaw - this.facing + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.setFacing(this.facing + delta * (1 - Math.pow(Math.min(1, Math.max(1e-6, rate)), dt)));
  }

  castLunge() {}

  writeBoneSegments() {
    return 0;
  }

  handsPoint(out) {
    const left = this.bones.get('LeftHand');
    const right = this.bones.get('RightHand');
    if (!left || !right) return out.copy(this.position).setY(this.height * 0.6);
    left.getWorldPosition(_a);
    right.getWorldPosition(_b);
    return out.copy(_a).add(_b).multiplyScalar(0.5);
  }

  /** One of the three cast gestures over the idle. */
  playCast(name) {
    if (!this.alive) return;
    const next = this.casts.get(name) ?? this.casts.get('cast1');
    if (!next) return;
    const previous = this._castAction;
    this._castAction = next;
    next.reset();
    next.setEffectiveTimeScale(1.15);
    next.play();
    const from = previous ?? this.action;
    if (from && from !== next) next.crossFadeFrom(from, 0.15, false);
  }

  _onCastFinished = (event) => {
    if (event.action !== this._castAction) return;
    this._castAction = null;
    if (!this.action || !this.alive) return;
    this.action.enabled = true;
    this.action.setEffectiveTimeScale(1);
    this.action.crossFadeFrom(event.action, 0.3, false);
  };

  /* ---- being hit ---- */

  /**
   * A blow: damage, unless it empties the bar — then the real fall.
   * Returns false for a blow it survives, so a cast never tries to carry a
   * body that is still standing.
   */
  kill(x, z, force, slice = false) {
    if (!this.alive) return false;
    const verdict = this.onStruck?.(this, { x, z, kind: 'kill' }) ?? 'ignore';
    if (verdict === 'lethal') {
      this._castAction = null;
      return super.kill(x, z, force, slice);
    }
    if (verdict === 'hurt') {
      this._hurt = 0.3;
      // Report the blow to the unified combat state, as a body going down
      // would be: statuses and reactions land on the wizard too.
      const adapter = this.__ucsmAdapter;
      if (adapter?.enabled && adapter.scope) adapter._hit(this, adapter.scope, 'hit');
    }
    return false;
  }

  /** A freeze is a blow too; a lethal one fells it rather than baking a statue. */
  freeze() {
    if (!this.alive) return false;
    const verdict = this.onStruck?.(this, { x: 0, z: 1, kind: 'freeze' }) ?? 'ignore';
    if (verdict === 'lethal') super.kill(0, 1, settings.dummies.hit);
    else if (verdict === 'hurt') this._hurt = 0.3;
    return false;
  }

  /** Stand it up whole again (a rematch). */
  place(x, z, yaw) {
    for (const action of this.casts?.values() ?? []) action.stop();
    this._castAction = null;
    super.place(x, z, yaw);
    if (this.action) this.action.setEffectiveTimeScale(1);
    return this;
  }

  update(dt) {
    // The hit flash: the rim goes hot for a moment.
    if (this._hurt > 0) this._hurt = Math.max(0, this._hurt - dt);
    const look = this.lookOverride;
    look.rimColor = this._hurt > 0 ? '#ff5a4a' : WIZARD_LOOK.rimColor;
    look.rimEmissive = this._hurt > 0 ? 2.6 : WIZARD_LOOK.rimEmissive;
    super.update(dt, null);
    if (this.alive) this.root.updateMatrixWorld(true);
  }

  dispose() {
    this.mixer.removeEventListener('finished', this._onCastFinished);
    super.dispose();
  }
}

/** Heel → toe in the bind pose: the rig's own forward (as CharacterController measures it). */
function measureForwardYaw(root) {
  root.updateMatrixWorld(true);
  let foot = null;
  let toe = null;
  root.traverse((node) => {
    if (!node.isBone) return;
    const short = node.name.split(':').pop().replace(/^mixamorig/i, '');
    if (short === 'LeftFoot' && !foot) foot = node;
    else if (short === 'LeftToeBase' && !toe) toe = node;
  });
  if (!foot || !toe) return 0;
  const heel = foot.getWorldPosition(new Vector3());
  const tip = toe.getWorldPosition(new Vector3()).sub(heel).setY(0);
  return tip.lengthSq() > 1e-6 ? Math.atan2(tip.x, tip.z) : 0;
}
