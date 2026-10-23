import * as THREE from 'three';
import {heightAt,normalAt,sampleTerrain,lavaAt,SEA_LEVEL,MARSH_LEVEL,noise2} from '@shared/terrain.js';
import {regionAt,OATH_BY_ID} from '@shared/oaths.js';
import {terrainMaterial,naturalMaterial,waterMaterial} from './worldMaterials.js';
import {buildSanctuaries} from './worldArchitecture.js';
import {branchingTrunk,grassClump,coniferCrown} from './vegetation.js';
import {terrainResolution,weatheredRock,addTerrainSkirt} from './terrain-detail.js';
import {createBiomeDetails} from './biomeDetails.js';
const TILE=160;
const colors={volcanic:0x45413b,glacial:0xc5d1cd,alpine:0x727d6a,coast:0x9c9a72,canyon:0x9a805a,cliffs:0x78866b,forest:0x4a6840,marsh:0x526a45,meadow:0x6e8150,highland:0x7a7966,badlands:0x74695b,crimson:0x76504a,terraces:0x77755e,plateau:0x817b60,industrial:0x6a6a5a};
function leafCluster(count=44){
  const vertices=[],normals=[];const up=new THREE.Vector3(0,1,0);
  for(let i=0;i<count;i++){const a=i*2.39996,h=1-2*(i+.5)/count,r=Math.sqrt(1-h*h),center=new THREE.Vector3(Math.cos(a)*r,h,Math.sin(a)*r);const n=center.clone().normalize(),u=new THREE.Vector3().crossVectors(n,up).normalize().multiplyScalar(.24*Math.sqrt(44/count)),v=new THREE.Vector3().crossVectors(n,u).normalize().multiplyScalar(.38*Math.sqrt(44/count));const p=[center.clone().sub(v),center.clone().add(u),center.clone().add(v),center.clone().sub(u)];for(const j of [0,1,2,0,2,3]){vertices.push(...p[j].toArray());normals.push(...n.toArray());}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));return g;
}
const seed=(x,z)=>{let v=Math.imul(x|0,374761393)^Math.imul(z|0,668265263);v=Math.imul(v^(v>>>13),1274126177);return((v^(v>>>16))>>>0)/4294967296;};
export async function initWorld(ctx){
  const scene=ctx.scene, low=ctx.quality?.name==='low', medium=ctx.quality?.name==='medium', chunks=new Map(), jobs=[];
  const details=createBiomeDetails(ctx);
  const terrainMat=terrainMaterial(), stone=naturalMaterial('#777b6e'), bark=naturalMaterial('#594c39');
  const foliage=new THREE.MeshStandardMaterial({color:0x4c6240,roughness:1,side:THREE.DoubleSide});
  const wind={time:{value:0}};
  foliage.onBeforeCompile=s=>{s.uniforms.windTime=wind.time;s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float windTime;').replace('#include <begin_vertex>',`#include <begin_vertex>
    #ifdef USE_INSTANCING
    transformed.x += sin(windTime*1.1+instanceMatrix[3].x*.17+instanceMatrix[3].z*.21) * .10 * max(position.y,0.);
    #endif`);};
  const trunkGeo=branchingTrunk(low), pineGeo=coniferCrown(low), leafGeo=leafCluster(low?12:medium?22:44), rockGeo=weatheredRock(low?2:medium?4:6);
  const dummy=new THREE.Object3D();
  const grassGeo=grassClump(low);
  const grassMat=foliage.clone();grassMat.side=THREE.DoubleSide;grassMat.onBeforeCompile=foliage.onBeforeCompile;
  scene.fog=new THREE.FogExp2('#b5c7c4',.00165);scene.background=new THREE.Color('#b5c7c4');
  function terrain(x,z,size,res){
    const g=new THREE.PlaneGeometry(size,size,res,res);g.rotateX(-Math.PI/2);
    const p=g.attributes.position, col=new Float32Array(p.count*3), masks=new Float32Array(p.count*3), c=new THREE.Color(), dust=new THREE.Color('#a69b81');
    for(let i=0;i<p.count;i++){
      const wx=x+p.getX(i),wz=z+p.getZ(i),s=sampleTerrain(wx,wz,{}),o=regionAt(wx,wz);
            p.setY(i,s.h);masks.set([s.roadW,s.plaza,s.lava],i*3);c.setHex(colors[o.biome]||0x727b60);c.lerp(dust,Math.min(.8,s.roadW*.8+s.plaza*.35));
      c.multiplyScalar(.9+noise2(wx*.12,wz*.12)*.23);c.toArray(col,i*3);
    }
    g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setAttribute('terrainMask',new THREE.BufferAttribute(masks,3));g.computeVertexNormals();if(size===TILE)addTerrainSkirt(g,res,6);
    const m=new THREE.Mesh(g,terrainMat);m.position.set(x,0,z);m.receiveShadow=true;return m;
  }
  function batch(geo,mat,list,parent){if(!list.length)return;const m=new THREE.InstancedMesh(geo,mat,list.length);for(let i=0;i<list.length;i++){const a=list[i];dummy.position.set(a[0],a[1],a[2]);dummy.scale.set(a[3],a[4],a[5]);dummy.rotation.set(0,a[6]||0,0);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);if(a[7])m.setColorAt(i,new THREE.Color(a[7]));}m.castShadow=geo===trunkGeo||(!low&&geo===leafGeo);m.receiveShadow=true;m.computeBoundingSphere();parent.add(m);}
  function build(ix,iz){
    const key=ix+','+iz;const existing=chunks.get(key);
    if(existing){const resolution=terrainResolution(ctx.quality?.name,Math.max(Math.abs(ix-Math.floor(focusX/TILE)),Math.abs(iz-Math.floor(focusZ/TILE))));const old=existing.children[0];const replacement=terrain((ix+.5)*TILE,(iz+.5)*TILE,TILE,resolution);existing.remove(old);existing.children.unshift(replacement);replacement.parent=existing;old.geometry.dispose();existing.userData.resolution=resolution;return;}
    const group=new THREE.Group(),x=(ix+.5)*TILE,z=(iz+.5)*TILE;const band=Math.max(Math.abs(ix-Math.floor(focusX/TILE)),Math.abs(iz-Math.floor(focusZ/TILE)));
    const resolution=terrainResolution(ctx.quality?.name,band);
    group.add(terrain(x,z,TILE,resolution));group.userData.resolution=resolution;
    const trunks=[],leaves=[],pines=[],rocks=[], grass=[];const count=low?48:medium?90:150;
    for(let i=0;i<count;i++){
      const px=ix*TILE+seed(ix*971+i,iz*43)*TILE,pz=iz*TILE+seed(ix*103+i,iz*239)*TILE;
      const s=sampleTerrain(px,pz,{}),o=regionAt(px,pz),d=Math.hypot(px-o.center[0],pz-o.center[1]);
      if(s.h<4||s.road<9||d<150)continue;
      const r=seed(i+17,ix*357+iz),scale=.7+r*.9;
      if(r<.20){rocks.push([px,s.h+.45,pz,scale*2,scale*.9,scale*1.5,r*9]);continue;}
      const lush=['forest','meadow','marsh','coast','cliffs'].includes(o.biome);
      if(!lush&&r>.35)continue;
      const h= lush?7+scale*4:6+scale*3;
      const conifer=['glacial','alpine','highland'].includes(o.biome);
      if(conifer){pines.push([px,s.h+h*.78,pz,scale*1.5,scale*1.4,scale*1.5,r*8,0x455b50]);}
      trunks.push([px,s.h+h/2,pz,scale,h/8,scale,r*8]);
      for(let j=0;j<(conifer?0:low?4:medium?6:8);j++){
        const a=j*2.4+r*7,rr=j===0?0:scale*(1.2+(j%3)*.5);
        leaves.push([px+Math.cos(a)*rr,s.h+h-1+(j%4)*.58,pz+Math.sin(a)*rr,scale*2.4,scale*(lush?1.9:3),scale*2.2,a,o.biome==='crimson'?0x683c3c: (o.biome==='glacial'?0x7f9991:0x516746)]);
      }
    }
    for(let i=0;i<(low?220:medium?500:900);i++){const px=ix*TILE+seed(i+892,iz+ix*39)*TILE,pz=iz*TILE+seed(i+352,ix+iz*61)*TILE;const s=sampleTerrain(px,pz,{}),o=regionAt(px,pz);if(s.h>4&&s.road>6&&s.plaza<.1&&['meadow','forest','marsh','cliffs','coast'].includes(o.biome)){const r=seed(i,ix+iz);grass.push([px,s.h,pz,2+r,1+r,2+r,r*7]);}}
    batch(grassGeo,grassMat,grass,group);
    batch(pineGeo,foliage,pines,group);batch(trunkGeo,bark,trunks,group);batch(leafGeo,foliage,leaves,group);batch(rockGeo,stone,rocks,group);
    details.build(ix,iz,TILE,group);
    group.name='Terrain '+key;scene.add(group);chunks.set(key,group);
  }
  let focusX=0,focusZ=0,cell='';
  function focus(x,z){
    if(!Number.isFinite(x)||!Number.isFinite(z))return;
    focusX=x;focusZ=z;const ix=Math.floor(x/TILE),iz=Math.floor(z/TILE),next=ix+','+iz;if(next===cell)return;cell=next;jobs.length=0;
    const radius=low||medium?2:3;
    for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){const old=chunks.get((ix+dx)+','+(iz+dz));const resolution=terrainResolution(ctx.quality?.name,Math.max(Math.abs(dx),Math.abs(dz)));if(!old||old.userData.resolution!==resolution)jobs.push([ix+dx,iz+dz,dx*dx+dz*dz]);}
    jobs.sort((a,b)=>a[2]-b[2]);
    for(const[k,g]of chunks){const[a,b]=k.split(',').map(Number);if(Math.abs(a-ix)>radius+1||Math.abs(b-iz)>radius+1){scene.remove(g);g.children[0].geometry.dispose();g.traverse(m=>{if(m.isInstancedMesh)m.dispose();});chunks.delete(k);}}
  }
  // Ocean extends beyond the entire continent; land clips the surface naturally.
  const water=waterMaterial(),sea=new THREE.Mesh(new THREE.PlaneGeometry(12000,12000,low?28:medium?48:80,low?28:medium?48:80),water.material);sea.rotation.x=-Math.PI/2;sea.position.y=SEA_LEVEL-.12;scene.add(sea);
  const marsh=OATH_BY_ID['oath-08'].center, pool=new THREE.Mesh(new THREE.CircleGeometry(630,64),water.material);pool.rotation.x=-Math.PI/2;pool.position.set(marsh[0],MARSH_LEVEL-.12,marsh[1]);scene.add(pool);
  const architecture=buildSanctuaries(ctx);
  // Coarse continent underlay closes the horizon while near tiles stream in.
  const horizon=terrain(0,0,5800,low?64:medium?96:128);horizon.position.y=-1.8;horizon.name='Continuous distant continent';scene.add(horizon);
  // Small migrating birds make the sky inhabited without opaque billboard sprites.
  const birds=new THREE.Group(),birdMat=new THREE.MeshStandardMaterial({color:'#37413f',side:THREE.DoubleSide,roughness:1});
  const wingGeo=new THREE.BufferGeometry();wingGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,.13,.65,0,.22,1.45,0,-.19,0,0,.13,1.45,0,-.19,.55,0,-.18],3));wingGeo.computeVertexNormals();
  const bodyGeo=new THREE.SphereGeometry(.14,6,4);bodyGeo.scale(1,.75,2.8);
  for(let i=0;i<14;i++){const bird=new THREE.Group();for(const side of [-1,1]){const wing=new THREE.Mesh(wingGeo,birdMat);wing.scale.x=side;bird.add(wing);}bird.add(new THREE.Mesh(bodyGeo,birdMat));birds.add(bird);}scene.add(birds);
  const flockCenter=new THREE.Vector3();let flockReady=false;
  let t=0;
  function update(dt){architecture.update(dt);t+=Math.min(dt,.1);wind.time.value=t;water.time.value=t;details.update(t);
    // Terrain build is bounded to one tile per frame, with nearest tiles first.
    if(jobs.length){const job=jobs.shift();build(job[0],job[1]);}
    const target=ctx.actors?.player?.position||ctx.actors?.player?.root?.position||ctx.player?.position||ctx.player?.root?.position||ctx.camera?.position;if(target)focus(target.x,target.z);
    if(!flockReady||Math.hypot(flockCenter.x-focusX,flockCenter.z-focusZ)>450){flockCenter.set(focusX,heightAt(focusX,focusZ),focusZ);flockReady=true;}
    birds.children.forEach((b,i)=>{const a=t*.045+i*.014,rank=Math.ceil(i/2),side=i%2?1:-1;b.position.set(flockCenter.x+Math.cos(a)*120+rank*side*2.8,flockCenter.y+44+Math.sin(t*.2+i)*.4,flockCenter.z+Math.sin(a)*120+rank*3);b.rotation.y=-a;for(let j=0;j<2;j++)b.children[j].rotation.z=Math.sin(t*5+i*.7)*(j?-.45:.45);});
  }
  async function ready(x=focusX,z=focusZ){focus(x,z);let n=0;while(jobs.length&&n<9){const j=jobs.shift();build(j[0],j[1]);n++;if(n%2===0)await new Promise(r=>setTimeout(r,0));}return true;}
  const isWater=(x,z)=>heightAt(x,z)<waterLevelAt(x,z);
  const waterLevelAt=(x,z)=>Math.hypot(x-marsh[0],z-marsh[1])<630?MARSH_LEVEL:SEA_LEVEL;
  const stopUpdate=ctx.addUpdate?.(update,40);
  function dispose(){stopUpdate?.();details.dispose();for(const g of chunks.values()){scene.remove(g);g.traverse(m=>{if(m.isInstancedMesh)m.dispose();});g.children[0].geometry.dispose();}chunks.clear();jobs.length=0;scene.remove(sea,pool,architecture,horizon,birds);for(const g of [trunkGeo,pineGeo,leafGeo,rockGeo,grassGeo,sea.geometry,pool.geometry,horizon.geometry])g.dispose();for(const m of [terrainMat,stone,bark,foliage,grassMat,water.material,birdMat])m.dispose();architecture.traverse(m=>{if(m.isMesh){m.geometry.dispose();m.material.dispose();if(m.isInstancedMesh)m.dispose();}});wingGeo.dispose();bodyGeo.dispose();}
  return {dispose,heightAt,normalAt,sampleTerrain,lavaAt,regionAt,groundAt:(x,z,y)=>ctx.collision?.groundAt(x,z,y)??heightAt(x,z),isWater,waterLevel:SEA_LEVEL,waterLevelAt,focus,ready,update,architecture,stats:()=>({terrainNodes:chunks.size,pending:jobs.length}),wind:{gust:0}};
}
export const init=initWorld;
