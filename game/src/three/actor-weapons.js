import { Group, Mesh, MeshStandardMaterial, Shape, ExtrudeGeometry, CylinderGeometry, SphereGeometry } from 'three';
import { OATH_BY_ID } from '@shared/oaths.js';
// Fitted grip-space equipment: weapons follow the authored right-hand socket,
// so attack clips carry the weapon through the same motion as the wrist.
export function attachWeapon(body, desc) {
  const hand = body.sockets['socket.hand.R'] ?? body.sockets['hand.R'];
  if (!hand || desc.kind === 'mob' || desc.noWeapon) return;
  const group = new Group(); group.name = 'oath-weapon'; hand.add(group);
  const accent = OATH_BY_ID[desc.oath]?.accent ?? '#b9c6dd';
  const steel = new MeshStandardMaterial({ color: '#b8c0c8', metalness: .88, roughness: .27 });
  const dark = new MeshStandardMaterial({ color: '#25201c', metalness: .2, roughness: .8 });
  const gold = new MeshStandardMaterial({ color: '#a98b52', metalness: .8, roughness: .32 });
  const glow = new MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: .8, metalness: .45, roughness: .22 });
  function mesh(geometry, material, y) { const m = new Mesh(geometry, material); m.position.y = y; m.castShadow = true; group.add(m); return m; }
  if (desc.cls === 'sorcerer') {
    mesh(new CylinderGeometry(.018, .027, 1.7, 10), dark, .36);
    mesh(new CylinderGeometry(.03, .03, .13, 10), gold, -.38);
    mesh(new CylinderGeometry(.04, .025, .17, 10), gold, 1.16);
    const crystal = mesh(new SphereGeometry(.11, 5, 3), glow, 1.32); crystal.scale.y = 1.6;
  } else {
    mesh(new CylinderGeometry(.024, .026, .22, 10), dark, -.05);
    const guard = mesh(new CylinderGeometry(.09, .09, .018, 12), gold, .075); guard.scale.z = .45;
    const shape = new Shape(); shape.moveTo(-.022, 0); shape.lineTo(-.025, .57); shape.quadraticCurveTo(-.02, .76, .055, .91); shape.lineTo(.052, .54); shape.lineTo(.025, 0); shape.closePath();
    const blade = mesh(new ExtrudeGeometry(shape, { depth: .012, bevelEnabled: true, bevelSize: .004, bevelThickness: .003, bevelSegments: 1, steps: 1 }), steel, .085); blade.position.z = -.006;
    mesh(new CylinderGeometry(.029, .029, .03, 10), gold, -.17);
  }
  const dispose = body.dispose.bind(body);
  body.dispose = () => { group.traverse(node => node.geometry?.dispose()); steel.dispose(); dark.dispose(); gold.dispose(); glow.dispose(); dispose(); };
}
