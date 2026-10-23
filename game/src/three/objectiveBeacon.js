import { Group, RingGeometry, ConeGeometry, MeshBasicMaterial, Mesh, DoubleSide } from 'three';

export function trackedDestination(quests) {
  const values = quests instanceof Map ? quests.values() : quests || [];
  for (const q of values) if (!q.done && Number.isFinite(q.waypoint?.x) && Number.isFinite(q.waypoint?.z)) return q.waypoint;
  return null;
}

// A navigation marker at the authoritative quest destination, never a fake quest giver.
export function initObjectiveBeacon(ctx) {
  const group = new Group(); group.name = 'Tracked covenant destination'; group.visible = false;
  const ground = new Mesh(new RingGeometry(1.5, 1.65, 48), new MeshBasicMaterial({color:0xd9b86f,transparent:true,opacity:.7,side:DoubleSide,depthWrite:false}));
  ground.rotation.x = -Math.PI / 2;
  const pointer = new Mesh(new ConeGeometry(.22,.55,4), new MeshBasicMaterial({color:0xffdd91,transparent:true,opacity:.95,depthWrite:false}));
  pointer.rotation.z = Math.PI; pointer.position.y = 3;
  group.add(ground,pointer); ctx.scene.add(group);
  let phase=0;
  const off = ctx.addUpdate(dt => {
    const gs=ctx.ui?.state, player=ctx.actors?.player;
    const target=trackedDestination(gs?.quests);
    if(!gs?.inGame || !player?.alive || !target || ctx.cinematicActive) {group.visible=false;return;}
    const distance=Math.hypot(player.position.x-target.x,player.position.z-target.z);
    group.visible=distance<140;
    if(!group.visible)return;
    phase+=dt;
    const y=ctx.world.heightAt(target.x,target.z);
    group.position.set(target.x,y+.08,target.z);
    ground.material.opacity=.45+Math.sin(phase*2)*.12;
    pointer.position.y=3.2+Math.sin(phase*2.5)*.12;
    pointer.rotation.y=phase*.45;
  },58);
  return {dispose(){off?.();group.removeFromParent();for(const mesh of [ground,pointer]){mesh.geometry.dispose();mesh.material.dispose();}}};
}
