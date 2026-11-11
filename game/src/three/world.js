import * as THREE from 'three';
import {heightAt,normalAt,sampleTerrain,lavaAt,SEA_LEVEL,MARSH_LEVEL,noise2} from '@shared/terrain.js';
import {regionAt,OATH_BY_ID} from '@shared/oaths.js';
import {terrainMaterial,waterMaterial} from './worldMaterials.js';
import {buildSanctuaries} from './worldArchitecture.js';
import {createRealmFlora,realmRock} from './realmFlora.js';
import {terrainResolution,addTerrainSkirt} from './terrain-detail.js';
import {createBiomeDetails} from './biomeDetails.js';
const TILE=160;
// Tiles this close to the player draw full trees; farther tiles draw baked cards.
const NEAR_BAND=1;
// Height above which each cold realm's ground is snow-covered.
const SNOW_LINE={glacial:34,alpine:150,highland:104};
// Share of candidate spots that grow a tree in each realm.
const DENSITY={forest:1,marsh:.9,meadow:.6,coast:.7,cliffs:.75,glacial:.55,alpine:.6,highland:.45,crimson:.7,terraces:.55,canyon:.3,plateau:.3,badlands:.22,volcanic:.14,industrial:.16};
const colors={volcanic:0x45413b,glacial:0xc5d1cd,alpine:0x727d6a,coast:0x9c9a72,canyon:0x9a805a,cliffs:0x78866b,forest:0x4a6840,marsh:0x526a45,meadow:0x6e8150,highland:0x7a7966,badlands:0x74695b,crimson:0x76504a,terraces:0x77755e,plateau:0x817b60,industrial:0x6a6a5a};
const seed=(x,z)=>{let v=Math.imul(x|0,374761393)^Math.imul(z|0,668265263);v=Math.imul(v^(v>>>13),1274126177);return((v^(v>>>16))>>>0)/4294967296;};
export async function initWorld(ctx){
  const scene=ctx.scene, low=ctx.quality?.name==='low', medium=ctx.quality?.name==='medium', chunks=new Map(), jobs=[];
  const details=createBiomeDetails(ctx);
  const terrainMat=terrainMaterial();
  const wind={time:{value:0}};
  const flora=createRealmFlora(ctx,wind);
  scene.fog=new THREE.FogExp2('#b5c7c4',.00165);scene.background=new THREE.Color('#b5c7c4');
  const rocks=new Map(),rockOf=biome=>{if(!rocks.has(biome))rocks.set(biome,realmRock(biome));return rocks.get(biome);},snowColour=new THREE.Color('#e6ecee');
  function terrain(x,z,size,res){
    const g=new THREE.PlaneGeometry(size,size,res,res);g.rotateX(-Math.PI/2);
    const p=g.attributes.position, col=new Float32Array(p.count*3), masks=new Float32Array(p.count*3), c=new THREE.Color(), dust=new THREE.Color('#a69b81');
    for(let i=0;i<p.count;i++){
      const wx=x+p.getX(i),wz=z+p.getZ(i),s=sampleTerrain(wx,wz,{}),o=regionAt(wx,wz);
            let y=s.h;
      // The distant underlay is coarse: keep each of its vertices under the real ground around it so it never
      // rises through the detailed tiles in a hollow.
      if(size!==TILE){const e=size/res*.5;y=Math.min(y,heightAt(wx-e,wz),heightAt(wx+e,wz),heightAt(wx,wz-e),heightAt(wx,wz+e),heightAt(wx-e,wz-e),heightAt(wx+e,wz+e),heightAt(wx-e,wz+e),heightAt(wx+e,wz-e))-2;}
      p.setY(i,y);masks.set([s.roadW,s.plaza,s.lava],i*3);c.setHex(colors[o.biome]||0x727b60);
      // Steep ground shows the bedrock of the realm's Biome Triad world; cold realms carry snow on what is not too steep.
      const up=normalAt(wx,wz,2.5)[1];c.lerp(rockOf(o.biome),(1-THREE.MathUtils.smoothstep(up,.72,.9))*.92);
      const line=SNOW_LINE[o.biome];if(line!=null)c.lerp(snowColour,THREE.MathUtils.smoothstep(s.h,line,line+26)*THREE.MathUtils.smoothstep(up,.6,.82)*.88);
      c.lerp(dust,Math.min(.8,s.roadW*.8+s.plaza*.35));
      c.multiplyScalar(.9+noise2(wx*.12,wz*.12)*.23);c.toArray(col,i*3);
    }
    g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setAttribute('terrainMask',new THREE.BufferAttribute(masks,3));g.computeVertexNormals();if(size===TILE)addTerrainSkirt(g,res,6);
    const m=new THREE.Mesh(g,terrainMat);m.position.set(x,0,z);m.receiveShadow=true;return m;
  }
  function build(ix,iz){
    const key=ix+','+iz;const existing=chunks.get(key);
    if(existing){const resolution=terrainResolution(ctx.quality?.name,Math.max(Math.abs(ix-Math.floor(focusX/TILE)),Math.abs(iz-Math.floor(focusZ/TILE))));const old=existing.children[0];const replacement=terrain((ix+.5)*TILE,(iz+.5)*TILE,TILE,resolution);existing.remove(old);existing.children.unshift(replacement);replacement.parent=existing;old.geometry.dispose();existing.userData.resolution=resolution;return;}
    const group=new THREE.Group(),x=(ix+.5)*TILE,z=(iz+.5)*TILE;const band=Math.max(Math.abs(ix-Math.floor(focusX/TILE)),Math.abs(iz-Math.floor(focusZ/TILE)));
    const resolution=terrainResolution(ctx.quality?.name,band);
    group.add(terrain(x,z,TILE,resolution));group.userData.resolution=resolution;
    const plants=[],rocks=[],cover=[];const count=low?48:medium?90:150;
    for(let i=0;i<count;i++){
      const px=ix*TILE+seed(ix*971+i,iz*43)*TILE,pz=iz*TILE+seed(ix*103+i,iz*239)*TILE;
      const s=sampleTerrain(px,pz,{}),o=regionAt(px,pz),d=Math.hypot(px-o.center[0],pz-o.center[1]);
      if(s.h<4||s.road<9||d<150)continue;
      const r=seed(i+17,ix*357+iz),scale=.7+r*.9;
      if(r<.20){rocks.push({biome:o.biome,x:px,y:s.h+scale*.25,z:pz,sx:scale*1.9,sy:scale*1.1,sz:scale*1.5,turn:r*9,shade:.8+seed(i+3,ix+iz*7)*.4});continue;}
      // How thickly each realm is wooded, as the share of candidate spots that grow a tree.
      if(r>.2+.8*(DENSITY[o.biome]??.2))continue;
      // Species and size come from the Biome Triad world this realm corresponds to.
      const pick=flora.choose(o.biome,seed(i+91,ix*77+iz*13));if(!pick)continue;
      const vary=seed(i+33,ix*19+iz*71);
      plants.push({key:pick.key,x:px,y:s.h-.12,z:pz,height:pick.height*(.72+vary*.56),turn:r*8,colour:flora.tint(o.biome,.86+vary*.28)});
    }
    for(let i=0;i<(low?220:medium?500:900);i++){
      const px=ix*TILE+seed(i+892,iz+ix*39)*TILE,pz=iz*TILE+seed(i+352,ix+iz*61)*TILE;const s=sampleTerrain(px,pz,{}),o=regionAt(px,pz);
      if(s.h<=waterLevelAt(px,pz)+.4||s.road<=6||s.plaza>=.1||s.lava>.1)continue;
      const r=seed(i,ix+iz),index=flora.chooseCover(o.biome,seed(i+5,ix*3+iz*11),seed(i+9,ix*13+iz*5));if(index==null)continue;
      cover.push({biome:o.biome,index,x:px,y:s.h-.03,z:pz,scale:1.1+r*.9,turn:r*7});
    }
    group.add(flora.cover(cover),flora.boulders(rocks));
    const veg=flora.tile(plants);group.add(veg.near,veg.far);group.userData.flora=veg;veg.near.visible=band<=NEAR_BAND;veg.far.visible=!veg.near.visible;
    // Trunk footprints (x, z, radius) for movement and camera: trees are solid, though they live outside the collision world
    // because tiles stream in and out.
    group.userData.trunks=veg.trunks;
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
    // Swap each tile between full trees and cards as the player moves.
    for(const[k,g]of chunks){const veg=g.userData.flora;if(!veg)continue;const[a,b]=k.split(',').map(Number);const near=Math.max(Math.abs(a-ix),Math.abs(b-iz))<=NEAR_BAND;veg.near.visible=near;veg.far.visible=!near;}
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
  function eachTrunkNear(x,z,fn){const cx=Math.floor(x/TILE),cz=Math.floor(z/TILE);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const list=chunks.get((cx+dx)+','+(cz+dz))?.userData.trunks;if(list)for(const t of list)fn(t);}}
  /** Push a body of radius r out of any tree trunk it overlaps. Returns true when it was moved. */
  function resolveTrunks(pos,r=.45){let moved=false;eachTrunkNear(pos.x,pos.z,t=>{const dx=pos.x-t[0],dz=pos.z-t[1],min=r+t[2],d2=dx*dx+dz*dz;if(d2>=min*min)return;const d=Math.sqrt(d2);if(d<1e-4){pos.x+=min;moved=true;return;}const out=min+.002;pos.x=t[0]+dx/d*out;pos.z=t[1]+dz/d*out;moved=true;});return moved;}
  /** Fraction (0..1) along the segment a->b at which it first enters a trunk widened by `pad`, or 1 when clear. */
  function trunkHit(ax,az,bx,bz,pad=.25){let best=1;const ex=bx-ax,ez=bz-az,len2=ex*ex+ez*ez;if(len2<1e-6)return 1;
    eachTrunkNear((ax+bx)/2,(az+bz)/2,t=>{const fx=ax-t[0],fz=az-t[1],r=t[2]+pad,b=2*(fx*ex+fz*ez),c=fx*fx+fz*fz-r*r;if(c<=0)return; // starting inside is the mover's problem, not the camera's
      const disc=b*b-4*len2*c;if(disc<0)return;const k=(-b-Math.sqrt(disc))/(2*len2);if(k>0&&k<best)best=k;});return best;}
  async function ready(x=focusX,z=focusZ){focus(x,z);let n=0;while(jobs.length&&n<9){const j=jobs.shift();build(j[0],j[1]);n++;if(n%2===0)await new Promise(r=>setTimeout(r,0));}return true;}
  const isWater=(x,z)=>heightAt(x,z)<waterLevelAt(x,z);
  const waterLevelAt=(x,z)=>Math.hypot(x-marsh[0],z-marsh[1])<630?MARSH_LEVEL:SEA_LEVEL;
  const stopUpdate=ctx.addUpdate?.(update,40);
  function dispose(){stopUpdate?.();details.dispose();for(const g of chunks.values()){scene.remove(g);g.traverse(m=>{if(m.isInstancedMesh)m.dispose();});g.children[0].geometry.dispose();}chunks.clear();jobs.length=0;scene.remove(sea,pool,architecture,horizon,birds);flora.dispose();for(const g of [sea.geometry,pool.geometry,horizon.geometry])g.dispose();for(const m of [terrainMat,water.material,birdMat])m.dispose();architecture.traverse(m=>{if(m.isMesh){m.geometry.dispose();m.material.dispose();if(m.isInstancedMesh)m.dispose();}});wingGeo.dispose();bodyGeo.dispose();}
  return {dispose,heightAt,normalAt,sampleTerrain,lavaAt,regionAt,groundAt:(x,z,y)=>ctx.collision?.groundAt(x,z,y)??heightAt(x,z),isWater,resolveTrunks,trunkHit,waterLevel:SEA_LEVEL,waterLevelAt,focus,ready,update,architecture,stats:()=>({terrainNodes:chunks.size,pending:jobs.length}),wind:{gust:0}};
}
export const init=initWorld;
