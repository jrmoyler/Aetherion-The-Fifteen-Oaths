/** Camera-relative guidance, matching world convention +Z north and +X east. */
export function objectiveGuidance(position, heading, waypoint) {
  if (![position?.x, position?.z, heading, waypoint?.x, waypoint?.z].every(Number.isFinite)) return null;
  const dx = waypoint.x - position.x, dz = waypoint.z - position.z;
  const distance = Math.hypot(dx, dz);
  const raw = (Math.atan2(dx, dz) - heading) * 180 / Math.PI;
  const angle = ((raw + 180) % 360 + 360) % 360 - 180;
  const direction = Math.abs(angle) < 25 ? 'Ahead' : Math.abs(angle) > 145 ? 'Behind you' : angle > 0 ? 'Turn right' : 'Turn left';
  return { distance, angle, label: distance <= 8 ? 'Destination reached' : `${direction} · ${Math.round(distance)} m` };
}
