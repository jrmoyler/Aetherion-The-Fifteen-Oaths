/**
 * HandCastAbilityThreeJS, hosted in the sandbox.
 *
 * Loads the drone, the monowheel bot and the phoenix as the pack's App#load
 * does, and carries over its summon handling: the Sentinel Drone and the
 * Monowheel Bot are not aimed — their slot deploys them, the same slot recalls
 * them, and while one is out WASD / the arrows steer it and Space or the left
 * mouse button holds fire. Only one is out at a time.
 *
 * Hand tracking (the pack's camera mode) is not part of the sandbox; it needs a
 * webcam, which the hosted page cannot open. It still works in the pack itself.
 */
import { Vector3 } from 'three';
import * as config from '../handcast/config/settings.js';
import { AbilityManager } from '../handcast/abilities/AbilityManager.js';
import { DroneState } from '../handcast/abilities/DroneAbility.js';
import { ParticleEngine } from '../handcast/particles/ParticleEngine.js';
import { DecalSystem } from '../handcast/effects/GroundDecals.js';
import { BurstSystem } from '../handcast/effects/BurstSphere.js';
import { AimController } from '../handcast/input/AimController.js';
import { frame } from '../handcast/core/FrameUniforms.js';
import { ELEMENT_SIGILS } from '../handcast/ui/glyphs.js';
import { Editor } from '../handcast/ui/Editor.js';
import { AssetLoader } from '../handcast/loaders/AssetLoader.js';
import { buildDroneRig } from '../handcast/assets/DroneRig.js';
import { buildMonowheelRig } from '../handcast/assets/MonowheelRig.js';
import { buildPhoenixRig } from '../handcast/assets/PhoenixRig.js';
import { createRuntime } from '../../sandbox/createRuntime.js';

const _heading = new Vector3();

export async function create(host) {
  const { settings, ELEMENT_META } = config;
  const runtime = createRuntime({
    pack: 'handcast',
    host,
    config,
    AbilityManager,
    ParticleEngine,
    DecalSystem,
    BurstSystem,
    AimController,
    frame,
    sigils: ELEMENT_SIGILS,
    Editor,
    builders: {
      flux: '_buildFlux',
      voidslash: '_buildVoidSlash',
      glacial: '_buildGlacial',
      shard: '_buildShard',
      frost: '_buildFrost',
      toxic: '_buildToxic',
      phoenix: '_buildPhoenix',
      monowheel: '_buildMonowheel',
      drone: '_buildDrone'
    },
    flushWithTime: true
  });

  const assets = new AssetLoader();
  const m = runtime.models;
  const drone = await assets.loadGLTF('./models/drone.glb');
  m.drone = buildDroneRig(drone.scene, { span: settings.drone.size });
  const monowheel = await assets.loadGLTF('./models/monowheelArmyBot.glb');
  m.monowheel = buildMonowheelRig(monowheel.scene, { height: settings.monowheel.size });
  const phoenix = await assets.loadGLTF('./models/phoenix_bird.glb');
  await assets.settled?.();
  m.phoenix = buildPhoenixRig(phoenix, { wingspan: settings.phoenix.wingspan });

  /* ---- summons ---- */
  let summon = null;
  let summonId = null;
  let mouseFiring = false;
  let keysFiring = false;
  let keySteering = false;

  const deployed = () => !!summon && summon.isActive;
  const locked = () => deployed() && summon.state !== DroneState.RECALL;
  const onStation = () => !!summon && summon.isOnStation;
  const syncFire = () => {
    if (onStation()) summon.setFiring(mouseFiring || keysFiring);
  };
  const down = () => {
    summon = null;
    summonId = null;
    mouseFiring = keysFiring = keySteering = false;
  };

  /**
   * The pack's App#_toggleSummon, minus its HUD deck. Returns a toast line, or
   * null when nothing happened. `cooldowns` is the host's per-ability map.
   */
  runtime.toggleSummon = (id, cooldowns) => {
    const label = ELEMENT_META[id]?.label ?? id;
    if (deployed()) {
      if (id !== summonId) {
        if (locked()) return `Recall the ${ELEMENT_META[summonId]?.label ?? summonId} first`;
      } else {
        if (summon.state === DroneState.RECALL) return null;
        summon.recall();
        cooldowns?.(id, settings[id].cooldown);
        return `${label} recalled`;
      }
    }
    runtime.select(id);
    runtime.aim.cancel();
    const yaw = host.character.facing;
    _heading.set(Math.sin(yaw), 0, Math.cos(yaw));
    const cast = runtime.manager.cast(host.character.position, _heading, settings[id].range, id);
    if (!cast) return null;
    summon = cast;
    summonId = id;
    mouseFiring = keysFiring = keySteering = false;
    host.character.playCast(settings[id].castAnim);
    return `${label} deployed — WASD to drive, Space or hold click to fire, same slot to recall`;
  };

  /** While a summon is out, the left button is its trigger, not a cast. */
  runtime.capturesPointer = () => onStation();
  runtime.pointerFire = (isDown) => {
    mouseFiring = isDown;
    syncFire();
  };
  runtime.summonOut = () => locked();

  const update = runtime.update;
  runtime.update = (dt, raw) => {
    update(dt, raw);
    if (summon && !summon.isActive) down();
    if (!onStation()) return;
    const keys = host.input.keys;
    let x = 0;
    let y = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    const steering = x !== 0 || y !== 0;
    if (steering) summon.setSteer(x, y);
    else if (keySteering) summon.setSteer(0, 0);
    keySteering = steering;
    const firing = keys.has('Space');
    if (firing !== keysFiring) {
      keysFiring = firing;
      syncFire();
    }
    // The operator watches the construct.
    if (settings[summonId]?.watch) {
      const dx = summon.position.x - host.character.position.x;
      const dz = summon.position.z - host.character.position.z;
      if (dx * dx + dz * dz > 1) host.character.turnToward(Math.atan2(dx, dz), host.settings.character.turnRate, raw);
    }
  };

  const clear = runtime.clear;
  runtime.clear = () => {
    clear();
    down();
  };
  runtime.alwaysUpdate = true; // a deployed summon keeps flying while you browse
  return runtime;
}
