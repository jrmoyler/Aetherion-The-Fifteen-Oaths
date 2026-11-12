import { Group, PointLight } from 'three';
import { cinematicProfile } from './cinematic-profile.js';

// Only authored fixture positions contribute. Fixed slots avoid shader recompiles
// as cities stream; no point-light shadow maps or unbounded per-fixture lights.
export function createPracticalLights(quality, sources) {
  const group = new Group(); group.name = 'Authored sanctuary illumination';
  const slots = Array.from({ length: cinematicProfile(quality).practicalLights }, () => {
    const light = new PointLight(0xffffff, 0, 1, 2); group.add(light);
    return { light, source: null };
  });
  return { group, slots,
    update(dt, position, hour = 12) {
      if (!position) return;
      const dusk = 1 - Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
      const nearest = sources.map(source => ({ source, distance: Math.hypot(position.x-source.x, position.y-source.y, position.z-source.z) }))
        .filter(x => x.distance < Math.max(40, x.source.range * 2)).sort((a,b) => a.distance-b.distance).slice(0,slots.length).map(x => x.source);
      const keep = new Set(slots.filter(s => nearest.includes(s.source)).map(s => s.source));
      const available = nearest.filter(s => !keep.has(s));
      for (const slot of slots) {
        const retained = nearest.includes(slot.source);
        if (!retained && slot.light.intensity < .02) {
          slot.source = available.shift() || null;
          if (slot.source) {
            const s = slot.source;
            slot.light.position.set(s.x,s.y,s.z);slot.light.color.set(s.color);slot.light.distance=s.range;
          }
        }
        const target = nearest.includes(slot.source) ? slot.source.intensity * (0.3 + dusk * 1.7) : 0;
        slot.light.intensity += (target-slot.light.intensity)*(1-Math.exp(-8*Math.max(0,dt)));
      }
    },
  };
}
