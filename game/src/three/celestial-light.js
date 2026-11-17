// One shadow-casting key follows the solar disc during the day and the visible
// Biome Triad moon after dusk. Both fade to zero at the horizon handoff.
export function updateCelestialKey(light, offset, solarDirection, weather) {
  const elevation = solarDirection.y;
  offset.copy(solarDirection);
  const cloudTransmission = 1 - 0.55 * weather;
  if (elevation >= 0) {
    const warmth = Math.max(0, 1 - elevation * 3);
    light.color.setHSL(0.10 - warmth * 0.035, 0.22 + warmth * 0.35, 0.88);
    light.intensity = 2.5 * elevation * cloudTransmission;
  } else {
    // Matches the moon placement in biome-sky.generated.js.
    offset.set(-solarDirection.x, Math.max(0.35, -elevation), -solarDirection.z).normalize();
    const phase = Math.min(1, -elevation / 0.3);
    const night = phase * phase * (3 - 2 * phase);
    light.color.set(0xb4caff);
    light.intensity = 0.30 * night * cloudTransmission;
  }
  offset.multiplyScalar(180);
}

// Align the orthographic shadow camera to whole shadow texels in its own
// image plane. The light-to-target vector stays constant as the hero walks.
export function createShadowTracker(light) {
  const right = light.position.clone();
  const up = right.clone();
  const back = right.clone();
  return function track(focus, offset) {
    const target = light.target.position.copy(focus);
    if (light.castShadow) {
      const { camera, mapSize } = light.shadow;
      back.copy(offset).normalize();
      right.crossVectors(camera.up, back);
      // Match Matrix4.lookAt when the camera points straight down.
      if (right.lengthSq() === 0) {
        back.z += 0.0001;
        back.normalize();
        right.crossVectors(camera.up, back);
      }
      right.normalize();
      up.crossVectors(back, right);
      const stepX = (camera.right - camera.left) / (camera.zoom * mapSize.x);
      const stepY = (camera.top - camera.bottom) / (camera.zoom * mapSize.y);
      const x = focus.dot(right), y = focus.dot(up);
      target.addScaledVector(right, Math.round(x / stepX) * stepX - x);
      target.addScaledVector(up, Math.round(y / stepY) * stepY - y);
    }
    light.position.copy(target).add(offset);
    light.target.updateMatrixWorld();
  };
}
