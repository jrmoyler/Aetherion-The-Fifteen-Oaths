import { Color, Vector3 } from 'three';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { LAYER } from '../../core/Layers.js';

const UP = new Vector3(0, 1, 0);
/** Transparent effects must not write solid silhouettes into the world depth prepass. */
export function routeExpansionTransparency(group) {
  group.traverse((object) => {
    if (!object.isMesh && !object.isLine && !object.isPoints) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => material?.transparent)) object.layers.set(LAYER.VFX);
  });
}
/** Shared particle buffers belong to ParticleEngine; ability instances never dispose them. */
export function createExpansionFX(
  ctx,
  id,
  {
    shape = ParticleShape.STREAK,
    colors,
    capacity = 480,
    additive = true,
  } = {},
) {
  const particles = ctx.particles?.get?.(`expansion.${id}`, {
    capacity,
    shape,
    additive,
    stretch: shape === ParticleShape.STREAK,
    softFade: 0.35,
  });
  if (!particles) return null;
  if (colors) particles.setGradient(...colors.map((color) => new Color(color)));
  return particles;
}
/** Emits an explicitly bounded effect at the actual gameplay position and simulation clock. */
export function expansionBurst(
  system,
  position,
  {
    count = 32,
    size = 0.12,
    life = 0.7,
    speed = 3,
    spread = 0.8,
    radius = 0.2,
    direction = UP,
    spin = 2,
  } = {},
) {
  if (!system || !position) return;
  const global = settings.global;
  system.emit(
    Math.min(128, Math.max(0, Math.round(count * global.particleCount))),
    {
      position,
      direction,
      radius,
      spread,
      speed: speed * global.particleSpeed,
      size: size * global.particleSize,
      life: life * global.particleLifetime,
      spin,
      time: frame.uTime.value,
    },
  );
}
/** Existing shared camera/post systems own these envelopes and honor global scaling. */
export function expansionImpact(ctx, color, shake, flash) {
  if (shake > 0) ctx.shake?.add?.(shake, 7, 20);
  if (flash > 0) ctx.flash?.trigger?.(getColor(color), flash);
}
export { ParticleShape };
