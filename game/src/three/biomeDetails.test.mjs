import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import * as THREE from 'three';
import {fileURLToPath} from 'node:url';

test('biome details preserve navigable paths, stay bounded and release shared resources',async()=>{
  const server=await createServer({root:fileURLToPath(new URL('../../',import.meta.url)),server:{middlewareMode:true}});
  try {
    const {createBiomeDetails,detailKind}=await server.ssrLoadModule('/src/three/biomeDetails.js');
    const {sampleTerrain}=await server.ssrLoadModule('/@fs'+fileURLToPath(new URL('../../../shared/terrain.js',import.meta.url)));
    const {OATHS,regionAt}=await server.ssrLoadModule('/@fs'+fileURLToPath(new URL('../../../shared/oaths.js',import.meta.url)));
    const base={h:20,road:100,plaza:0,lava:0};
    for(const biome of OATHS.map(o=>o.biome)){
      assert.equal(detailKind(biome,{...base,road:8},300,.5),null);
      assert.equal(detailKind(biome,{...base,plaza:.1},300,.5),null);
      assert.equal(detailKind(biome,{...base,lava:.5},300,.5),null);
      assert.equal(detailKind(biome,base,140,.5),null);
    }
    assert.equal(detailKind('marsh',{...base,h:3.5},300,.5),'reed');
    const system=createBiomeDetails({quality:{name:'high'}}),group=new THREE.Group(),matrix=new THREE.Matrix4(),position=new THREE.Vector3();
    for(const oath of OATHS)system.build(Math.floor((oath.center[0]+320)/160),Math.floor((oath.center[1]+320)/160),160,group);
    const geometries=new Set(),materials=new Set();let instances=0;
    group.traverse(mesh=>{
      if(!mesh.isInstancedMesh)return;
      assert.ok(mesh.count<=540,'per-tile detail count remains bounded');
      instances+=mesh.count;geometries.add(mesh.geometry);materials.add(mesh.material);
      for(const attribute of Object.values(mesh.geometry.attributes))for(const v of attribute.array)assert.ok(Number.isFinite(v));
      for(let i=0;i<mesh.count;i++){
        mesh.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
        const sample=sampleTerrain(position.x,position.z,{}),region=regionAt(position.x,position.z);
        assert.ok(sample.road>=12);assert.ok(sample.plaza<=.02);assert.ok(sample.lava<=.12);
        assert.ok(Math.hypot(position.x-region.center[0],position.z-region.center[1])>=165);
        assert.ok(Math.abs(position.y-sample.h)<.03);
      }
    });
    assert.ok(instances>100,'details actually populate the fifteen biome samples');
    let disposed=0;for(const resource of [...geometries,...materials])resource.addEventListener('dispose',()=>disposed++);
    system.dispose();assert.equal(disposed,geometries.size+materials.size);
    const after=new THREE.Group();system.build(0,0,160,after);assert.equal(after.children.length,0);
  }finally{await server.close();}
});
