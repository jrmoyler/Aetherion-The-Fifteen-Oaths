// STUB — replaced by the world-nature agent.
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
export async function init(ctx) {
  const { scene } = ctx;
  const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.3), scene); sun.intensity = 3;
  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene); hemi.intensity = 0.5;
  const cam = new ArcRotateCamera('tmp', 1, 1.2, 60, new Vector3(270, 30, 360), scene); scene.activeCamera = cam;
  return { sun, hemi, shadows: null, addShadowCaster() {}, removeShadowCaster() {}, pipeline: null, timeOfDay: 12,
    setTimeOfDay() {}, setTimeScale() {}, envTexture: null, setWeather() {}, setRegionGrade() {}, attachCamera(c) { scene.activeCamera = c; } };
}
