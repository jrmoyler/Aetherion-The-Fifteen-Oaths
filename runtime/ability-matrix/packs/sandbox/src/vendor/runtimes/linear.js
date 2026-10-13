/** LinearAbiltyCastingThreeJS, hosted in the sandbox. No loaded models. */
import * as config from '../linear/config/settings.js';
import { AbilityManager } from '../linear/abilities/AbilityManager.js';
import { ParticleEngine } from '../linear/particles/ParticleEngine.js';
import { DecalSystem } from '../linear/effects/GroundDecals.js';
import { BurstSystem } from '../linear/effects/BurstSphere.js';
import { AimController } from '../linear/input/AimController.js';
import { frame } from '../linear/core/FrameUniforms.js';
import { ELEMENT_SIGILS } from '../linear/ui/glyphs.js';
import { Editor } from '../linear/ui/Editor.js';
import { AssetLoader } from '../linear/loaders/AssetLoader.js';
import { createRuntime } from '../../sandbox/createRuntime.js';

export async function create(host) {
  const runtime = createRuntime({
    pack: 'linear',
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
    builders: { ice: '_buildIce', thunder: '_buildThunder', meteor: '_buildMeteor', beam: '_buildBeam', snare: '_buildSnare', glacier: '_buildGlacier' }
  });
  void AssetLoader;
  return runtime;
}
