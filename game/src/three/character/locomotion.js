// Model +Z faces forward, so +X is the character's left. Use displacement
// after collision resolution: pushing into a wall should not cycle the feet.
export function setTravelDirection(animator, dx, dz, yaw) {
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-6) {
    animator.lateral = 0;
    animator.backwards = false;
    return;
  }
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  animator.lateral = (dx * cos - dz * sin) / distance;
  animator.backwards = dx * sin + dz * cos < -distance * .3;
}

export const DODGE_DURATION = .55;
export const GAIT_SPEED = Object.freeze({
  walk: 2.2, run: 6, sprint: 8.5, backpedal: 3.6, strafe_l: 4, strafe_r: 4,
});

export const isForwardGait = name => name === 'walk' || name === 'run' || name === 'sprint';

export function groundClip(animator, actions, combatHold, current) {
  if (animator.speed < .2) return combatHold > 0 && actions.has('idle_combat') ? 'idle_combat' : 'idle';
  const strafe = animator.lateral > 0 ? 'strafe_l' : 'strafe_r';
  // Stay in a lateral step near the diagonal boundary instead of restarting
  // the run/strafe blend with each small change in the facing angle.
  if (Math.abs(animator.lateral) > (current === strafe ? .62 : .76) && actions.has(strafe)) return strafe;
  if (animator.backwards && actions.has('backpedal')) return 'backpedal';
  if (animator.speed < (current === 'walk' ? 3.25 : 3) && actions.has('walk')) return 'walk';
  if (animator.speed > (current === 'sprint' ? 6.75 : 7) && actions.has('sprint')) return 'sprint';
  return actions.has('run') ? 'run' : 'walk';
}
