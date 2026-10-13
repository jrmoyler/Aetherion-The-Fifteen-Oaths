// Placeholder used while a Collective Original is being written. Keeps the pack
// building and castable; every real ability replaces its import of this file.
import { Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const _pos = new Vector3();
const _up = new Vector3(0, 1, 0);

export function createStubAbility(id) {
  return class StubAbility extends Ability {
    constructor(context) {
      super(id, context);
    }

    createParticles() {
      this.sparks = this.ctx.particles.get(`${id}.stub`, { capacity: 600, shape: ParticleShape.SOFT, additive: true });
    }

    onImpact() {
      const c = settings[id];
      this.pointAt(1, _pos);
      this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, { radius: c.zoneRadius ?? 3, life: 0.8, colorA: getColor(c.colorA), colorB: getColor(c.colorB) });
      this.ctx.bursts.spawn(BurstMode.AIR, _pos.clone().setY(0.6), { endRadius: 3, colorA: getColor(c.colorA), colorB: getColor(c.colorB), colorC: getColor(c.colorA) });
      this.sparks.setGradient(getColor(c.colorB), getColor(c.colorA), getColor(c.colorA), getColor(c.colorA));
      this.sparks.emit(80, { position: _pos.setY(0.4), radius: 0.5, direction: _up, speed: 5, spread: 1, size: 0.12, life: 1, time: frame.uTime.value });
      this.ctx.shake.add(0.3);
    }
  };
}

export function stubEditor(id, title) {
  return (gui, c, Editor) => {
    const folder = gui.addFolder(`◇  ${title} (stub)`);
    Editor.range(folder, c, 'range', 2, 40, 0.1, 'max range');
    Editor.castAnimation(folder, c);
  };
}
