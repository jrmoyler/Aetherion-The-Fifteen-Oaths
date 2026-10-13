/** LinearAbiltyCastingExtendedThreeJS, hosted in the sandbox. Loads the serpent. */
import * as config from '../linear-extended/config/settings.js';
import { AbilityManager } from '../linear-extended/abilities/AbilityManager.js';
import { ParticleEngine } from '../linear-extended/particles/ParticleEngine.js';
import { DecalSystem } from '../linear-extended/effects/GroundDecals.js';
import { BurstSystem } from '../linear-extended/effects/BurstSphere.js';
import { AimController } from '../linear-extended/input/AimController.js';
import { frame } from '../linear-extended/core/FrameUniforms.js';
import { ELEMENT_SIGILS } from '../linear-extended/ui/glyphs.js';
import { Editor } from '../linear-extended/ui/Editor.js';
import { AssetLoader } from '../linear-extended/loaders/AssetLoader.js';
import { createRuntime } from '../../sandbox/createRuntime.js';

import { buildSerpentGeometry } from '../linear-extended/assets/SerpentGeometry.js';

export async function create(host) {
  const runtime = createRuntime({
    pack: 'linear-extended',
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
    builders: { ward: '_buildWard', acid: '_buildAcid', growth: '_buildGrowth', cyber: '_buildCyber', venom: '_buildVenom', quake: '_buildQuake', ink: '_buildInk', astral: '_buildAstral', cascade: '_buildCascade', rend: '_buildRend' }
  });
  const assets = new AssetLoader();
  // As in the pack's App#load: the construct is rebuilt into a ghost-instanced
  // strip and the file's own material is thrown away.
  const serpent = await assets.loadGLTF('./models/snake.glb');
  runtime.models.serpent = buildSerpentGeometry(serpent.scene, { ghosts: 8 });
  serpent.scene.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.dispose();
    for (const material of [].concat(node.material)) {
      material.map?.dispose();
      material.dispose();
    }
  });
  return runtime;
}
