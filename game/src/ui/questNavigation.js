export function trackedObjective(quests) {
  let fallback = null;
  for (const quest of quests instanceof Map ? quests.values() : quests || []) {
    if (quest.done || !Number.isFinite(quest.waypoint?.x) || !Number.isFinite(quest.waypoint?.z)) continue;
    if (quest.chapter) return quest;
    fallback ??= quest;
  }
  return fallback;
}

function routeThroughGate(position, route, returning) {
  const dx = route.gate.x - route.origin.x, dz = route.gate.z - route.origin.z;
  const gateDistance = Math.hypot(dx, dz);
  const x = position.x - route.origin.x, z = position.z - route.origin.z;
  const forward = (x * dx + z * dz) / gateDistance;
  const lateral = Math.abs(x * dz - z * dx) / gateDistance;
  const fromCenter = Math.hypot(x, z);
  const innerDistance = Math.hypot(route.inner.x - route.origin.x, route.inner.z - route.origin.z);
  if (returning) {
    if (fromCenter > gateDistance - 7 && (forward > gateDistance || lateral > 10)) return route.gate;
    if (forward > innerDistance + 6 && lateral < 28) return route.inner;
    return null;
  }
  if ((forward >= gateDistance - 7 && lateral <= 12) || fromCenter > gateDistance + 7) return null;
  return lateral > (route.alignWidth ?? 12) && fromCenter < 100 ? route.inner : route.gate;
}

export function routedWaypoint(position, waypoint) {
  if (!waypoint) return null;
  const outbound = waypoint.approach && routeThroughGate(position, waypoint.approach, waypoint.returning);
  return outbound || (waypoint.arrival && routeThroughGate(position, waypoint.arrival, true)) || waypoint;
}

/** Camera-relative guidance for the Three.js camera, with +Z north and +X east on the map. */
export function objectiveGuidance(position, heading, waypoint) {
  if (![position?.x, position?.z, heading, waypoint?.x, waypoint?.z].every(Number.isFinite)) return null;
  const dx = waypoint.x - position.x, dz = waypoint.z - position.z;
  const distance = Math.hypot(dx, dz);
  const raw = (heading - Math.atan2(dx, dz)) * 180 / Math.PI;
  const angle = ((raw + 180) % 360 + 360) % 360 - 180;
  const direction = Math.abs(angle) < 25 ? 'Ahead' : Math.abs(angle) > 145 ? 'Behind you' : angle > 0 ? 'Turn right' : 'Turn left';
  return { distance, angle, label: distance <= 8 ? 'Destination reached' : `${direction} · ${Math.round(distance)} m` };
}
