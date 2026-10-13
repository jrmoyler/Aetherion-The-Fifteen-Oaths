/**
 * LinearAbilityExtThreeJS, hosted in the sandbox.
 *
 * Its three self buffs are not abilities — nothing aims them — so they ride
 * beside the pool exactly as they do in the pack's own App: built with the same
 * services, worn by the (shared) character, toggled as extra actions.
 */
import * as config from '../linear-ext/config/settings.js';
import { AbilityManager } from '../linear-ext/abilities/AbilityManager.js';
import { ParticleEngine } from '../linear-ext/particles/ParticleEngine.js';
import { DecalSystem } from '../linear-ext/effects/GroundDecals.js';
import { BurstSystem } from '../linear-ext/effects/BurstSphere.js';
import { AimController } from '../linear-ext/input/AimController.js';
import { frame } from '../linear-ext/core/FrameUniforms.js';
import { ELEMENT_SIGILS } from '../linear-ext/ui/glyphs.js';
import { Editor } from '../linear-ext/ui/Editor.js';
import { AssetLoader } from '../linear-ext/loaders/AssetLoader.js';
import { createRuntime } from '../../sandbox/createRuntime.js';

import { ElectricBoost } from '../linear-ext/effects/ElectricBoost.js';
import { MagicBoost } from '../linear-ext/effects/MagicBoost.js';
import { FireBoost } from '../linear-ext/effects/FireBoost.js';

export async function create(host) {
  const runtime = createRuntime({
    pack: 'linear-ext',
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
    builders: { pyre: '_buildPyre', kraken: '_buildKraken', electrical: '_buildElectrical', earth: '_buildEarth', portal: '_buildPortal', aether: '_buildAether', firePortal: '_buildFirePortal' },
    extraBuilders: ['_buildGate', '_buildRingTemplate', '_buildScribeTemplate', '_buildBoost', '_buildMagic', '_buildFire']
  });
  void AssetLoader;
  const { settings } = config;
  const ctx = runtime.ctx;
  const buffContext = {
    scene: ctx.scene,
    particles: ctx.particles,
    lights: ctx.lights,
    decals: ctx.decals,
    bursts: ctx.bursts,
    shake: ctx.shake,
    flash: ctx.flash,
    character: host.character
  };
  const buffs = {
    boost: { buff: new ElectricBoost(buffContext), config: settings.boost, label: config.BOOST_META?.label ?? 'Electric Boost' },
    magic: { buff: new MagicBoost(buffContext), config: settings.magic, label: config.MAGIC_META?.label ?? 'Magic Boost' },
    fire: { buff: new FireBoost(buffContext), config: settings.fire, label: config.FIRE_META?.label ?? 'Fire Boost' }
  };
  runtime.buffs = buffs;
  runtime.extras = Object.entries(buffs).map(([action, b]) => ({ action, label: b.label }));

  /** Same toggle as the pack's App#_toggleBuff. Returns a toast line. */
  runtime.action = (name) => {
    const entry = buffs[name];
    if (!entry) return null;
    const { buff, config: c, label } = entry;
    if (buff.active) {
      buff.cancel();
      return `${label} released`;
    }
    if (!buff.activate()) return 'Not ready';
    if (c.playAnimation) {
      host.character.playCast(c.castAnim);
      host.character.castLunge();
    }
    return label;
  };

  const update = runtime.update;
  runtime.update = (dt, raw) => {
    update(dt, raw);
    for (const { buff } of Object.values(buffs)) buff.update(dt);
  };
  const clear = runtime.clear;
  runtime.clear = () => {
    clear();
    for (const { buff } of Object.values(buffs)) buff.cancel();
  };
  runtime.alwaysUpdate = true; // a buff keeps burning after another pack is selected
  return runtime;
}
