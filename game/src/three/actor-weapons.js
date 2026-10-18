import { Group, Mesh, MeshStandardMaterial, Shape, ExtrudeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, BoxGeometry, TubeGeometry, CatmullRomCurve3, Vector3 } from 'three';
import { OATH_BY_ID } from '@shared/oaths.js';
// Equipment is modelled in metres in the authored hand socket's local space.
export function attachWeapon(body, desc) {
  // Canon character GLBs already include their weapon bound to the skeleton.
  // Keep these generated families for unequipped bodies only.
  if (body.meshes?.some(mesh => mesh.name === `${desc.oath}-${desc.cls}` || mesh.name.startsWith(`${desc.oath}-${desc.cls}_`))) return;
  const hand = body.sockets['socket.hand.R'] ?? body.sockets['hand.R'];
  if (!hand || desc.kind === 'mob' || desc.noWeapon) return;
  const oath = OATH_BY_ID[desc.oath], weapon = oath?.[desc.cls]?.weapon ?? 'short sword';
  const group = new Group(); group.name = weapon; hand.add(group);
  const accent = oath?.accent ?? '#b9c6dd';
  const steel = new MeshStandardMaterial({ color: '#b8c0c8', metalness: .88, roughness: .27 });
  const dark = new MeshStandardMaterial({ color: oath?.palette.primary ?? '#25201c', metalness: .2, roughness: .8 });
  const gold = new MeshStandardMaterial({ color: oath?.palette.trim ?? '#a98b52', metalness: .8, roughness: .32 });
  const glow = new MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: .4, metalness: .45, roughness: .22 });
  const mesh = (g, m, x=0, y=0, z=0) => { const n=new Mesh(g,m); n.position.set(x,y,z); n.castShadow=true; group.add(n); return n; };
  const rod = (r,h,y,m=dark,x=0,z=0) => mesh(new CylinderGeometry(r,r,h,10),m,x,y,z);
  const ring = (r,x,y,z=0) => mesh(new TorusGeometry(r,.009,6,24),gold,x,y,z);
  const curve = (points,r,m) => mesh(new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),24,r,6,false),m);
  const blade = (points,y=0) => {const s=new Shape();points.forEach(([x,yy],i)=>i?s.lineTo(x,yy):s.moveTo(x,yy));s.closePath();return mesh(new ExtrudeGeometry(s,{depth:.014,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1,steps:1}),steel,0,y,-.007);};
  rod(.024,.23,-.04); rod(.03,.035,-.17,gold);
  // Distinct canon weapon families: readable physical silhouettes, no decals.
  if (/codex/.test(weapon)) {
    mesh(new BoxGeometry(.32,.42,.07),dark,0,.22);mesh(new BoxGeometry(.28,.37,.065),steel,0,.22,.006);
    for(const x of [-.16,.16])mesh(new BoxGeometry(.014,.44,.085),gold,x,.22);
    ring(.075,0,.23,.048);
  } else if (/shield/.test(weapon)) {
    const shield=mesh(new SphereGeometry(.34,8,6,0,Math.PI*2,0,Math.PI/2),steel,0,.2);shield.rotation.x=Math.PI/2;shield.scale.y=.3;
    ring(.29,0,.2,.05);
  } else if (/cannon|repeater|crossbow/.test(weapon)) {
    const barrel=rod(.055,.58,.18,steel);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.14,.18);
    mesh(new BoxGeometry(.1,.16,.25),dark,0,.1,.04);
    for(const z of [.1,.3]){const r=ring(.06,0,.14,z);r.scale.setScalar(1.1);}
    if(/crossbow/.test(weapon))curve([[-.3,.13,.2],[0,.13,.38],[.3,.13,.2]],.018,gold);
  } else if (/bow/.test(weapon)) {
    curve([[0,-.52,.09],[.14,-.25,0],[.17,.1,0],[.12,.38,0],[0,.62,.09]],.021,dark);
    curve([[0,-.52,.09],[-.025,.05,.09],[0,.62,.09]],.002,steel);
  } else if (/fan/.test(weapon)) {
    for(let i=0;i<9;i++){const a=(i-4)*.19;const rib=rod(.009,.5,.25,steel);rib.rotation.z=a;rib.position.x=-Math.sin(a)*.25;rib.position.y=Math.cos(a)*.25;}
    blade([[-.34,.38],[-.22,.48],[0,.55],[.22,.48],[.34,.38],[0,.06]]);
  } else if (/whip|lash|flail/.test(weapon)) {
    curve([[0,.07,0],[.04,.3,0],[.18,.48,0],[.36,.42,0],[.41,.14,0],[.38,-.08,0]],.012,gold);
    if(/flail/.test(weapon))mesh(new SphereGeometry(.095,8,6),steel,.38,-.08);
  } else if (/gauntlet|ring/.test(weapon)) {
    ring(.13,0,.12);ring(.09,0,.12,.035);mesh(new SphereGeometry(.045,8,6),glow,0,.25);
  } else if (/staff|focus|mace|hammer|scythe/.test(weapon)) {
    rod(.022,1.4,.3);rod(.034,.09,.98,gold);rod(.03,.07,-.4,gold);
    if(/hammer/.test(weapon)) {mesh(new BoxGeometry(.4,.2,.19),steel,0,.95);mesh(new BoxGeometry(.22,.12,.2),gold,0,.95);}
    else if(/scythe/.test(weapon))blade([[0,.9],[-.12,1.05],[-.54,.98],[-.67,.75],[-.33,.9]]);
    else if(/tuning-fork/.test(weapon)){for(const x of [-.08,.08])rod(.016,.36,1.14,steel,x);mesh(new BoxGeometry(.19,.04,.04),gold,0,.97);}
    else if(/astrolabe/.test(weapon)){ring(.18,0,1.15);ring(.12,0,1.15).rotation.y=Math.PI/2;mesh(new SphereGeometry(.055,12,8),glow,0,1.15);}
    else {mesh(new SphereGeometry(/mace/.test(weapon)?.12:.075,6,4),glow,0,1.11);for(const x of [-.09,.09]){const prong=rod(.014,.25,1.08,gold,x);prong.rotation.z=-x*2;}}
  } else {
    const guard=rod(.09,.018,.08,gold);guard.scale.z=.45;
    if(/crescent/.test(weapon))blade([[-.02,0],[-.1,.2],[-.12,.5],[.05,.75],[.22,.84],[.04,.55],[.025,0]],.09);
    else if(/cleaver|wedge/.test(weapon))blade([[-.04,0],[-.07,.55],[.09,.63],[.06,0]],.09);
    else {const slender=/rapier/.test(weapon);blade([[-.02,0],[-.025,.55],[0,slender?.95:.78],[slender?.012:.045,.5],[.025,0]],.09);}
  }
  const dispose=body.dispose.bind(body);
  body.dispose=()=>{group.removeFromParent();group.traverse(n=>n.geometry?.dispose());for(const m of [steel,dark,gold,glow])m.dispose();dispose();};
}
