import { DoubleSide, Group, Mesh, MeshBasicMaterial, OctahedronGeometry, RingGeometry } from 'three';
import { routedWaypoint, trackedObjective } from '../ui/questNavigation.js';
import { initStoryScenery } from './storyScenery.js';

export function trackedDestination(quests) {
  return trackedObjective(quests)?.waypoint ?? null;
}

// The 3D signal follows the same route as the objective HUD, including city gates.
export function initObjectiveBeacon(ctx) {
  const scenery = initStoryScenery(ctx);
  const group = new Group();
  group.name = 'Tracked covenant destination';
  group.visible = false;
  const ground = new Mesh(new RingGeometry(1.35, 1.55, 36), new MeshBasicMaterial({
    color: 0xd9b86f, transparent: true, opacity: .7, side: DoubleSide, depthWrite: false,
  }));
  ground.rotation.x = -Math.PI / 2;
  const pointer = new Mesh(new OctahedronGeometry(.32), new MeshBasicMaterial({
    color: 0xffd79b, transparent: true, opacity: .96, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  pointer.renderOrder = 20;
  group.add(ground, pointer);
  ctx.scene.add(group);

  let phase = 0;
  let lastX = NaN, lastZ = NaN;
  const off = ctx.addUpdate((dt) => {
    const state = ctx.ui?.state, player = ctx.actors?.player;
    const destination = trackedDestination(state?.quests);
    if (!state?.inGame || !player?.alive || !destination || ctx.cinematicActive) {
      group.visible = false;
      return;
    }
    const target = routedWaypoint(player.position, destination);
    const distance = Math.hypot(player.position.x - target.x, player.position.z - target.z);
    group.visible = distance < 265;
    if (!group.visible) return;
    if (lastX !== target.x || lastZ !== target.z) {
      group.position.set(target.x, ctx.world.heightAt(target.x, target.z) + .14, target.z);
      lastX = target.x;
      lastZ = target.z;
    }
    phase += dt;
    ground.visible = distance < 45;
    ground.material.opacity = .52 + Math.sin(phase * 2) * .12;
    pointer.position.y = 2.9 + Math.min(1.8, distance * .011) + Math.sin(phase * 2.5) * .12;
    pointer.scale.setScalar(Math.max(.8, distance / 44));
    pointer.rotation.y = phase * .72;
  }, 58);

  return { dispose() {
    off(); scenery.dispose(); group.removeFromParent();
    for (const mesh of [ground, pointer]) { mesh.geometry.dispose(); mesh.material.dispose(); }
  } };
}
