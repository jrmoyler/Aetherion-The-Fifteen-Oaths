// CPU inspection of actual Three.js world meshes. This is NOT a rendered/GPU acceptance test.
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s.startsWith('@shared/')?new URL('../../shared/'+s.slice(8),import.meta.url).href:s,c);}});
import fs from 'node:fs';
const THREE=await import('../../game/node_modules/three/build/three.module.js');
const {initWorld}=await import('../../game/src/three/world.js');
const {CollisionWorld}=await import('../../game/src/core/collision.js');
const {PlayerController}=await import('../../game/src/actors/controller.js');
const {heightAt,sampleTerrain}=await import('../../shared/terrain.js');
const {regionAt,OATH_BY_ID}=await import('../../shared/oaths.js');
const {terrainLocations}=await import('./terrain-locations.mjs');
const out=process.argv[2]||'docs/qa/all-realms/geometry.json';
const scene=new THREE.Scene(),collision=new CollisionWorld();
const world=await initWorld({scene,collision,quality:{name:'low'},addUpdate:()=>()=>{}});
const report={kind:'CPU mesh and controller audit; no WebGL renderer',tier:'low',realms:[],failures:[]};
function walk(start,end,architecture=true,tolerance=.7){
 const pos=new THREE.Vector3(start.x,start.y+.2,start.z);let yaw=0;
 const actor={root:{position:pos,rotation:{y:0}},cls:'ninja',alive:true};
 const input={state:{moveX:0,moveY:1},consume:()=>false};
 const pc=new PlayerController({world:architecture?world:{heightAt:world.heightAt,normalAt:world.normalAt,waterLevelAt:world.waterLevelAt},collision:architecture?collision:null,input},actor,()=>yaw);
 let steps=0,minGroundGap=Infinity;
 const limit=Math.ceil(Math.hypot(end.x-start.x,end.z-start.z)/6.4*30*2+300);
 while(steps++<limit&&Math.hypot(end.x-pos.x,end.z-pos.z)>tolerance){yaw=Math.atan2(end.x-pos.x,end.z-pos.z);pc.update(1/30);minGroundGap=Math.min(minGroundGap,pos.y-heightAt(pos.x,pos.z));}
 return {reached:Math.hypot(end.x-pos.x,end.z-pos.z)<=tolerance,steps,seconds:steps/30,end:{x:pos.x,y:pos.y,z:pos.z},minGroundGap};
}
try{
 for(const row of terrainLocations()){
  const result={id:row.id,biome:row.biome,priority:row.priority,views:[]};
  for(const view of row.views){
   world.focus(view.x,view.z);while(world.stats().pending)await world.ready(view.x,view.z);
   const check={name:view.name,position:view,tiles:0,vertices:0,maxVertexError:0,trunks:0,invalidTrunks:0,maxSeamGap:0,maxUncoveredSeam:0};
   const tiles=scene.children.filter(g=>g.name.startsWith('Terrain '));
   for(const tile of tiles){
    check.tiles++;const mesh=tile.children[0],p=mesh.geometry.attributes.position,res=tile.userData.resolution;
    for(let i=0;i<(res+1)**2;i++){
     const x=mesh.position.x+p.getX(i),z=mesh.position.z+p.getZ(i),err=Math.abs(p.getY(i)-heightAt(x,z));
     check.maxVertexError=Math.max(check.maxVertexError,err);check.vertices++;
     if(!Number.isFinite(err))report.failures.push(`${row.id} non-finite terrain`);
    }
    for(const [x,z,r]of tile.userData.trunks||[]){
     check.trunks++;const s=sampleTerrain(x,z,{}),o=regionAt(x,z);
     if(!(r>0)||s.h<4||s.road<9||Math.hypot(x-o.center[0],z-o.center[1])<150)check.invalidTrunks++;
    }
    // Compare actual piecewise linear edges at every fine vertex against the neighbour's edge.
    const [ix,iz]=tile.name.slice(8).split(',').map(Number);
    for(const [dx,dz]of [[1,0],[0,1]]){
     const other=tiles.find(t=>t.name===`Terrain ${ix+dx},${iz+dz}`);if(!other)continue;
     const q=other.children[0].geometry.attributes.position,n=other.userData.resolution;
     const N=Math.max(res,n);
     const edge=(a,r,t,side)=>{const u=t*r,i=Math.min(r-1,Math.floor(u)),f=u-i;const idx=k=>dx?(k*(r+1)+(side?r:0)):((side?r:0)*(r+1)+k);return a.getY(idx(i))*(1-f)+a.getY(idx(i+1))*f;};
     // PlaneGeometry rows run north to south: +z uses last row.
     const skirtDepth=(mesh,r)=>{const a=mesh.geometry.attributes.position;return a.getY(0)-a.getY((r+1)**2);};
     const depth=Math.min(skirtDepth(mesh,res),skirtDepth(other.children[0],n));
     for(let k=0;k<=N;k++) {const gap=Math.abs(edge(p,res,k/N,true)-edge(q,n,k/N,false));check.maxSeamGap=Math.max(check.maxSeamGap,gap);check.maxUncoveredSeam=Math.max(check.maxUncoveredSeam,gap-depth);}
    }
   }
   if(check.maxVertexError>.002||check.invalidTrunks||check.maxUncoveredSeam>.01)report.failures.push(`${row.id}/${view.name} vertex or trunk mismatch`);
   result.views.push(check);
  }
  world.focus(row.spawn.x,row.spawn.z);while(world.stats().pending)await world.ready(row.spawn.x,row.spawn.z);
  result.shrineAccess=walk(row.spawn,row.shrine,true,11.5); // shrine discovery radius is 12m, not its solid centre
  const route=row.transitions[0];const d=Math.hypot(route.x-row.spawn.x,route.z-row.spawn.z),t=Math.min(1,320/d);
  const exit={x:row.spawn.x+(route.x-row.spawn.x)*t,z:row.spawn.z+(route.z-row.spawn.z)*t};exit.y=heightAt(exit.x,exit.z);
  result.terrainExit=walk(row.spawn,exit,false);
  const centre=OATH_BY_ID[row.id].center;
  const start={x:centre[0],z:centre[1],y:heightAt(...centre)};
  result.roadExits=row.transitions.map(target=>{
    const d=Math.hypot(target.x-start.x,target.z-start.z),t=Math.min(1,320/d);
    const end={x:start.x+(target.x-start.x)*t,z:start.z+(target.z-start.z)*t};end.y=heightAt(end.x,end.z);
    return {to:target.to,outward:walk(start,end,false),inward:walk(end,start,false)};
  });
  if(!result.shrineAccess.reached)report.failures.push(`${row.id} shrine interaction inaccessible`);
  for(const r of result.roadExits)if(!r.outward.reached||!r.inward.reached)report.failures.push(`${row.id}:${r.to} terrain road approach stalled`); // isolates terrain from architecture navigation
  result.architectureExit=walk(row.spawn,exit,true); // diagnostic direct line; not a pathfinding proof
  report.realms.push(result);console.log(row.id,row.biome,'shrine',result.shrineAccess.reached,'exit',result.terrainExit.reached);
 }
}finally{world.dispose();fs.writeFileSync(out,JSON.stringify(report,null,2));}
process.exitCode=report.failures.length?1:0;
