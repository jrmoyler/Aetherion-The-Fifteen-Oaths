import * as THREE from 'three';
import { OATHS } from '@shared/oaths.js';
import { heightAt } from '@shared/terrain.js';
import { naturalMaterial,pavingMaterial } from './worldMaterials.js';
// Open courtyards preserve all canonical spawn / guide positions. Solids have matching colliders.
export function buildSanctuaries(ctx) {
  const group = new THREE.Group();group.sanctuaries=[]; group.name='Fifteen inhabited sanctuaries';
  const cube=new THREE.BoxGeometry(1,1,1), column=new THREE.CylinderGeometry(.78,1,1,12);
  const dummy=new THREE.Object3D();
  for(const oath of OATHS){
    const [cx,cz]=oath.center, y=heightAt(cx,cz); const parts=[], pillars=[], trim=[];
    group.sanctuaries.push({oathId:oath.id,center:oath.center,y,shrine:{x:cx,y,z:cz},spawn:{x:cx+12,y,z:cz-18,ry:0},npcSpots:[[-18,-15,'oathkeeper'],[20,12,'quartermaster'],[-22,20,'trainer'],[25,-25,'warden']].map(([x,z,role])=>({x:cx+x,y,z:cz+z,role,ry:Math.atan2(-x,-z)}))});
    const character={volcanic:[4,19,15],glacial:[7,12,20],alpine:[3,23,27],coast:[6,15,11],canyon:[4,20,12],cliffs:[7,12,15],forest:[4,19,9],marsh:[3,24,8],meadow:[6,15,14],highland:[5,17,25],badlands:[3,24,18],crimson:[5,17,21],terraces:[7,12,17],plateau:[4,20,23],industrial:[3,24,16]}[oath.biome];
    const [bays,spacing,towerExtra]=character;
    const box=(x,z,w,h,d,base=0,solid=true)=>{parts.push([cx+x,y+base+h/2,cz+z,w,h,d]); if(solid)ctx.collision?.addBox(cx+x,cz+z,w/2,d/2,0,y+base,y+base+h,{tag:'three-sanctuary'});};
    // Raised perimeter pavilions and a rear ceremonial hall, with open central approach.
    for(const side of [-1,1]){
      for(let i=0;i<bays;i++){
        const z=-46+i*spacing, x=side*(42+(oath.index%3)*8);
        box(x,z,14,1.2,14,-.7,false);
        for(const dx of [-5,5])for(const dz of [-5,5]){pillars.push([cx+x+dx,y+5.2,cz+z+dz,1,10.4,1]);ctx.collision?.addCircle(cx+x+dx,cz+z+dz,.85,y,y+10.4,{tag:'three-column'});}
        box(x,z,15,1.1,15,10.4,false); box(x,z,14,.55,14,11.5,false);
        trim.push([cx+x,y+10.1,cz+z,15,.16,15]);
      }
    }
    box(0,-59,110,2,9,0); // rear wall base
    for(let i=0;i<9;i++){const x=-48+i*12;box(x,-61,4,22+(i%2)*3,7,2);box(x,-61,6,1.2,9,24+(i%2)*3,false);}
    // Deep central gate with layered lintel and crown.
    for(const x of [-9,9]){box(x,-43,4,22,8);box(x,-43,5,.65,9,2,false);box(x,-43,5,.65,9,19,false);}
    box(0,-43,22,2.5,8,22,false);box(0,-43,24,.7,10,24.5,false);
    const height=25+towerExtra;box(0,-65,12,height,10);box(0,-65,14,1.4,12,height,false);
    const paving=new THREE.Mesh(new THREE.PlaneGeometry(108,108),pavingMaterial(oath.palette.stone));paving.rotation.x=-Math.PI/2;paving.position.set(cx,y+.025,cz);paving.receiveShadow=true;group.add(paving);
    const mat=naturalMaterial(oath.palette.stone), metal=new THREE.MeshStandardMaterial({color:oath.palette.trim,roughness:.48,metalness:.65});
    function instances(list,geo,material,name){const mesh=new THREE.InstancedMesh(geo,material,list.length);mesh.name=name;list.forEach((p,i)=>{dummy.position.set(p[0],p[1],p[2]);dummy.scale.set(p[3],p[4],p[5]);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);}
    // Biome-specific roof construction makes distant silhouettes legible.
    const roofMat=new THREE.MeshStandardMaterial({color:oath.palette.secondary,roughness:.7,metalness:['alpine','industrial','plateau'].includes(oath.biome)?.5:.05});
    const roof=(geometry,x,yy,z,rotation=0)=>{const m=new THREE.Mesh(geometry,roofMat);m.position.set(cx+x,y+yy,cz+z);m.rotation.y=rotation;m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
    if(['glacial','crimson','highland'].includes(oath.biome)){
      roof(new THREE.ConeGeometry(10,20,8),0,height+11,-65);
      for(const sign of [-1,1]){box(sign*29,-61,7,24,8);roof(new THREE.ConeGeometry(6,14,6),sign*29,31,-61);}
    }else if(['coast','meadow','terraces'].includes(oath.biome)){
      roof(new THREE.SphereGeometry(9,24,12,0,Math.PI*2,0,Math.PI/2),0,height+1,-65);
      for(const sign of [-1,1]){const arch=roof(new THREE.TorusGeometry(10,.8,8,28,Math.PI),sign*30,13,-57);arch.rotation.y=0;}
    }else if(['alpine','industrial','plateau'].includes(oath.biome)){
      for(let k=0;k<3;k++){const xx=(k-1)*7;roof(new THREE.CylinderGeometry(.5,1,18+k*7,8),xx,height+8+k*3.5,-65);}
      for(const sign of [-1,1]){box(sign*30,-65,10,15,10);roof(new THREE.CylinderGeometry(3,3,12,12),sign*30,21,-65);}
    }else if(['forest','marsh','cliffs'].includes(oath.biome)){
      for(let k=0;k<3;k++)roof(new THREE.ConeGeometry(12-k*2.3,8,4),0,height+3+k*5,-65,Math.PI/4);
      for(const sign of [-1,1])roof(new THREE.ConeGeometry(11,7,4),sign*48,15,-20,Math.PI/4);
    }else{
      for(let k=0;k<4;k++)box(0,-65,16-k*3,2,14-k*2,height+k*2,false);
      for(const sign of [-1,1]){box(sign*30,-64,13,18,12);box(sign*30,-64,15,1.5,14,18,false);}
    }
    instances(parts,cube,mat,oath.name+' masonry');instances(pillars,column,mat,oath.name+' colonnades');instances(trim,cube,metal,oath.name+' bronze cornices');
    // Oath standard: woven cloth, no vector graphics or floating UI geometry.
    const cloth=new THREE.Mesh(new THREE.PlaneGeometry(3.2,6,4,8),new THREE.MeshStandardMaterial({color:oath.accent,roughness:1,side:THREE.DoubleSide}));cloth.position.set(cx,y+19,cz-38.8);group.add(cloth);
  }
  group.shrineAt=(x,z)=>group.sanctuaries.find(s=>Math.hypot(x-s.shrine.x,z-s.shrine.z)<12)||null;group.update=()=>{};ctx.architecture=group;ctx.scene.add(group);return group;
}
