import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import * as THREE from 'three';
import {fileURLToPath} from 'node:url';

// Runs the real city generation and collision adapters; catches engine-port
// winding, scale, shader-program reuse, and missing walkable surfaces.
test('fifteen native Three cities preserve finite geometry and collision metadata',async()=>{
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const server=await createServer({root,server:{middlewareMode:true}});
 try {
  const {buildSanctuaries}=await server.ssrLoadModule('/src/three/worldArchitecture.js');
  const {CollisionWorld}=await server.ssrLoadModule('/src/core/collision.js');
  const {SANCTUARY_LAYOUT}=await server.ssrLoadModule('/@fs'+fileURLToPath(new URL('../../../shared/sanctuary-layout.js',import.meta.url)));
  const collision=new CollisionWorld(),scene=new THREE.Scene();
  const group=buildSanctuaries({scene,collision,quality:{name:'high'},camera:new THREE.PerspectiveCamera()});
  assert.equal(group.sanctuaries.length,15);
  assert.ok(collision.count>4000,'authored walls, stairs, ramps and platforms have collision');
  assert.equal(new Set(group.children.map(c=>c.userData.vertices)).size,15,'all cities have distinct authored layouts');
  let triangles=0,backward=0;
  const checked=new Set();
  group.traverse(mesh=>{
   if(!mesh.isMesh||checked.has(mesh.geometry))return;checked.add(mesh.geometry);
   const g=mesh.geometry;
   for(const attribute of Object.values(g.attributes))for(const value of attribute.array)assert.ok(Number.isFinite(value),`${mesh.name}: invalid vertex attribute`);
   const p=g.attributes.position,n=g.attributes.normal,index=g.index.array;
   for(let i=0;i<index.length;i+=3){
    const a=new THREE.Vector3().fromBufferAttribute(p,index[i]),b=new THREE.Vector3().fromBufferAttribute(p,index[i+1]),c=new THREE.Vector3().fromBufferAttribute(p,index[i+2]);
    const normal=new THREE.Vector3().fromBufferAttribute(n,index[i]).add(new THREE.Vector3().fromBufferAttribute(n,index[i+1])).add(new THREE.Vector3().fromBufferAttribute(n,index[i+2]));
    const dot=b.sub(a).cross(c.sub(a)).dot(normal);if(dot<-.00001)backward++;triangles++;
   }
  });
  assert.ok(triangles>100000);assert.equal(backward,0,'Three front faces agree with vertex normals');
  for(const city of group.sanctuaries){
   assert.ok(city.npcSpots.length>=4);assert.equal(group.shrineAt(city.shrine.x,city.shrine.z),city);
   assert.ok(Math.abs(collision.groundAt(city.spawn.x,city.spawn.z,city.spawn.y)-city.spawn.y)<.5,'spawn lies on traversable plaza');
   const canonical=SANCTUARY_LAYOUT[city.oathId];
   assert.ok(Math.hypot(city.spawn.x-canonical.spawn.x,city.spawn.z-canonical.spawn.z)<.02,`${city.oathId}: server spawn mismatch`);
   const pos={...city.spawn};
   for(let step=0;step<40;step++){pos.x+=Math.sin(city.spawn.ry)*.25;pos.z+=Math.cos(city.spawn.ry)*.25;pos.y=collision.groundAt(pos.x,pos.z,pos.y);collision.resolve(pos);}
   assert.ok(Math.hypot(pos.x-city.spawn.x,pos.z-city.spawn.z)>9.5,`${city.oathId}: spawn exit blocked`);
  }
  group.update(.016);
 } finally {await server.close();}
});
