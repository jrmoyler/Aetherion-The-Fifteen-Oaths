import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {weatheredRock} from './terrain-detail.js';
import {sampleTerrain} from '@shared/terrain.js';
import {regionAt} from '@shared/oaths.js';

// Original botanical and mineral geometry. Shared per-world resources, per-tile instance
// buffers; all placement is seeded and outside roads/city footprints. No external assets.
const hash=(a,b)=>{let h=Math.imul(a|0,374761393)^Math.imul(b|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
const lush=new Set(['forest','meadow','coast','cliffs','crimson']);
export function detailKind(biome,sample,distance,random){
  if(sample.plaza>.02||distance<165||sample.road<12||sample.lava>.12)return null;
  if(biome==='marsh'&&sample.h>3.1&&sample.h<7)return 'reed';
  if(sample.h<4)return null;
  if(lush.has(biome))return random<.32?'flower':'fern';
  if(['glacial','canyon','badlands','plateau'].includes(biome)&&random<.28)return 'crystal';
  return 'scree';
}
function colored(g,color){const c=new THREE.Color(color),p=g.attributes.position,a=new Float32Array(p.count*3);for(let i=0;i<p.count;i++)c.toArray(a,i*3);g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;}
function combine(parts){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());g.computeBoundingSphere();return g;}
function fernGeometry(){
  const pos=[],cols=[],a=new THREE.Color('#344832'),b=new THREE.Color('#718653');
  const tri=(p,q,r,c)=>{pos.push(...p,...q,...r);for(let j=0;j<3;j++)cols.push(c.r,c.g,c.b);};
  for(let leaf=0;leaf<7;leaf++){
    const angle=leaf*2.39996,len=.55+(leaf%3)*.17,dx=Math.cos(angle),dz=Math.sin(angle);
    for(let j=0;j<6;j++){
      const u=j/6,v=(j+1)/6,wp=Math.sin(u*Math.PI)*.12,wq=Math.sin(v*Math.PI)*.12;
      const center=t=>[dx*t*len,Math.sin(t*Math.PI*.8)*.38,dz*t*len];
      const p=center(u),q=center(v),c=a.clone().lerp(b,u);
      tri([p[0]-dz*wp,p[1],p[2]+dx*wp],[p[0]+dz*wp,p[1],p[2]-dx*wp],[q[0]-dz*wq,q[1],q[2]+dx*wq],c);
      tri([p[0]+dz*wp,p[1],p[2]-dx*wp],[q[0]+dz*wq,q[1],q[2]-dx*wq],[q[0]-dz*wq,q[1],q[2]+dx*wq],c);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));g.computeVertexNormals();return g;
}
function reedGeometry(){const parts=[];for(let i=0;i<5;i++){
  const a=i*2.39996,x=Math.cos(a)*.22,z=Math.sin(a)*.22,h=.8+i*.17;
  const stem=new THREE.CylinderGeometry(.016,.024,h,4);stem.translate(x,h/2,z);parts.push(colored(stem,'#68754a'));
  const head=new THREE.CylinderGeometry(.052,.045,.26,5);head.translate(x,h,z);parts.push(colored(head,'#56452f'));
}return combine(parts);}
function flowerGeometry(){const parts=[];for(let i=0;i<4;i++){
  const a=i*2.4,x=Math.cos(a)*.22,z=Math.sin(a)*.22,h=.27+i*.10;
  const stem=new THREE.CylinderGeometry(.012,.018,h,4);stem.translate(x,h/2,z);parts.push(colored(stem,'#4d6c3c'));
  const blossom=new THREE.CircleGeometry(.105,5);blossom.rotateX(-Math.PI/2);blossom.translate(x,h,z);parts.push(colored(blossom,i%2?'#e1cda1':'#b3b6ce'));
  const core=new THREE.SphereGeometry(.03,5,3);core.translate(x,h+.012,z);parts.push(colored(core,'#ceaa56'));
}return combine(parts);}
function crystalGeometry(){const parts=[];for(let i=0;i<3;i++){
  const a=i*2.4,h=.3+i*.18,g=new THREE.CylinderGeometry(0,.11,h,5,1);g.rotateZ((i-1)*.23);g.translate(Math.cos(a)*.13,h/2,Math.sin(a)*.13);parts.push(colored(g,'#a4c9cc'));
}return combine(parts);}
export function createBiomeDetails(ctx){
  const low=ctx.quality?.name==='low',medium=ctx.quality?.name==='medium';
  const time={value:0},geometries={fern:fernGeometry(),reed:reedGeometry(),flower:flowerGeometry(),crystal:crystalGeometry(),scree:colored(weatheredRock(low?1:3,2),'#8f8879')};
  const plant=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,side:THREE.DoubleSide});
  plant.onBeforeCompile=s=>{s.uniforms.detailTime=time;s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float detailTime;').replace('#include <begin_vertex>',`#include <begin_vertex>
    #ifdef USE_INSTANCING
    transformed.x+=sin(detailTime*1.4+instanceMatrix[3].x*.21+instanceMatrix[3].z*.13)*position.y*position.y*.06;
    #endif`);};
  plant.customProgramCacheKey=()=> 'aetherion-undergrowth-wind-v1';
  const mineral=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.74,metalness:.08});
  const transform=new THREE.Object3D(),tint=new THREE.Color();let disposed=false;
  function build(ix,iz,size,parent){
    if(disposed)return;
    const lists={fern:[],reed:[],flower:[],crystal:[],scree:[]};
    const budget=low?50:medium?110:180;
    for(let i=0;i<budget;i++){
      // Clusters break an even point distribution; shared origin keeps chunk edges stable.
      const x=ix*size+hash(ix*719+i,iz*443)*size,z=iz*size+hash(ix*359,iz*557+i)*size;
      const s=sampleTerrain(x,z,{}),o=regionAt(x,z),r=hash(i+710,ix*91+iz*53);
      const kind=detailKind(o.biome,s,Math.hypot(x-o.center[0],z-o.center[1]),r);if(!kind)continue;
      if(kind==='fern'&&hash(Math.floor(x/22),Math.floor(z/22))>.52)continue;
      const n=kind==='scree'?2:kind==='flower'?3:1;
      for(let j=0;j<n;j++){
        const px=x+Math.cos(j*2.4)*j*.65,pz=z+Math.sin(j*2.4)*j*.65,at=sampleTerrain(px,pz,{});
        // Recheck offsets so clustered details never creep into a path or lava bank.
        if(!detailKind(o.biome,at,Math.hypot(px-o.center[0],pz-o.center[1]),r))continue;
        lists[kind].push({x:px,y:at.h-.015,z:pz,r,biome:o.biome});
      }
    }
    for(const [kind,list]of Object.entries(lists)){
      if(!list.length)continue;
      const mesh=new THREE.InstancedMesh(geometries[kind],kind==='scree'||kind==='crystal'?mineral:plant,list.length);
      mesh.name=`Biome ${kind}`;mesh.receiveShadow=true;mesh.castShadow=false;
      list.forEach((p,i)=>{
        const s=.7+p.r*.8;transform.position.set(p.x,p.y,p.z);transform.rotation.set(0,p.r*6.283,0);
        transform.scale.set(kind==='scree'?s*.42:s,kind==='scree'?s*.19:s,kind==='scree'?s*.33:s);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
        tint.set(p.biome==='crimson'?'#bd8a80':p.biome==='glacial'?'#deefff':p.biome==='volcanic'?'#6e6861':p.biome==='canyon'?'#d3b38c':'#ffffff');mesh.setColorAt(i,tint);
      });mesh.computeBoundingSphere();parent.add(mesh);
    }
  }
  return {build,update(t){time.value=t;},dispose(){disposed=true;Object.values(geometries).forEach(g=>g.dispose());plant.dispose();mineral.dispose();}};
}
