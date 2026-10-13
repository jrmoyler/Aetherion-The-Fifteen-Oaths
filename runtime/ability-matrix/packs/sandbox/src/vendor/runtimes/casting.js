/**
 * AbilityCastingThreeJS (Elemental Sandbox), hosted in the sandbox.
 *
 * Loads the seven Blender-authored rigs its abilities ride on, exactly as the
 * pack's App#load does, and keeps its two engine differences: the aim snaps to
 * a body for the abilities that take one, and the pool has a late update for
 * anything drawn onto a body after the bodies have moved.
 */
import * as config from '../casting/config/settings.js';
import { AbilityManager } from '../casting/abilities/AbilityManager.js';
import { ParticleEngine } from '../casting/particles/ParticleEngine.js';
import { DecalSystem } from '../casting/effects/GroundDecals.js';
import { BurstSystem } from '../casting/effects/BurstSphere.js';
import { AimController } from '../casting/input/AimController.js';
import { frame } from '../casting/core/FrameUniforms.js';
import { ELEMENT_SIGILS } from '../casting/ui/glyphs.js';
import { Editor } from '../casting/ui/Editor.js';
import { AssetLoader } from '../casting/loaders/AssetLoader.js';
import { createRuntime } from '../../sandbox/createRuntime.js';

import { buildSharkRig } from '../casting/assets/SharkRig.js';
import { buildWolfRig } from '../casting/assets/WolfRig.js';
import { buildDragonRig } from '../casting/assets/DragonRig.js';
import { buildGyroscopeRig } from '../casting/assets/GyroscopeRig.js';
import { buildAmethystRig } from '../casting/assets/AmethystRig.js';
import { buildTomeRig } from '../casting/assets/TomeRig.js';
import { buildReliquaryRig } from '../casting/assets/ReliquaryRig.js';

export async function create(host) {
  const runtime = createRuntime({
    pack: 'casting',
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
    builders: { shark: '_buildShark', chains: '_buildChains', dragon: '_buildDragon', gyro: '_buildGyro', amethyst: '_buildAmethyst', tome: '_buildTome', reliquary: '_buildReliquary', lance: '_buildLance', wolf: '_buildWolf' },
    flushWithTime: true,
    lateUpdate: true,
    aimTargets: true
  });
  const { settings } = config;
  const m = runtime.models;
  const assets = new AssetLoader();
  const shark = await assets.loadGLTF('./models/shark.glb');
  await assets.settled?.();
  m.shark = buildSharkRig(shark, { length: settings.shark.length });
  const wolf = await assets.loadGLTF('./models/wolf.glb').catch(() => null);
  await assets.settled?.();
  m.wolf = wolf ? buildWolfRig(wolf, { length: settings.wolf.length }) : null;
  const dragon = await assets.loadGLTF('./models/dragon.glb');
  await assets.settled?.();
  m.dragon = buildDragonRig(dragon, { wingspan: settings.dragon.wingspan });
  const gyro = await assets.loadGLTF('./models/magical_gyroscope.glb');
  await assets.settled?.();
  m.gyro = buildGyroscopeRig(gyro, { height: settings.gyro.size });
  m.amethyst = buildAmethystRig(await assets.loadGLTF('./models/amethyst_stones.glb').catch(() => null));
  m.tome = buildTomeRig(await assets.loadGLTF('./models/arcane_tome.glb').catch(() => null));
  m.reliquary = buildReliquaryRig(await assets.loadGLTF('./models/wildroot_reliquary.glb').catch(() => null));
  return runtime;
}
