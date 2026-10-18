import * as THREE from 'three';
import { computeMetas, makeContext, cityGen, toWorld } from './architecture/gen.js';
import { Frame, Builder } from './architecture/builder.js';
import { matDef, getProtos } from './architecture/kit.js';
import { naturalMaterial, pavingMaterial } from './worldMaterials.js';

const KEY_COLORS = {
  'stone.basalt': '#2a2826', 'stone.marble': '#e4e0d8', 'stone.limestone': '#d8d0c0', 'stone.sandstone': '#b8946a', 'stone.slate': '#3e434b',
  'stone.shale': '#5e5650', 'stone.darkgranite': '#3c3c40', 'stone.terracotta': '#8a4a30', 'paving.flagstone': '#7a7670', 'paving.hex': '#7a7670',
  'metal.brass': '#a8844a', 'metal.copper': '#a0603c', 'metal.iron': '#3a3634', 'metal.gold': '#c8a050', 'metal.steel': '#8a8c90',
  'wood.weathered': '#6a5642', 'wood.lacquer': '#6a1a14', 'glass.tinted': '#9ab0a8', 'cloth.banner': '#c0b8a8', 'crystal.amethyst': '#8a5ad8',
  'ice.glacial': '#c0dcea', 'bark.living': '#4a3a28', 'emissive.lava': '#5a2a14', 'emissive.glow': '#ffd890', 'tile.roof': '#8a6a5a',
  'plaster.lime': '#ddd6c8', 'concrete.panel': '#8a8a88', 'liquid.water': '#2a5a6a', 'liquid.fall': '#bcd8e0', 'liquid.reagent': '#a0c040', 'foliage.leaves': '#3a5a2a',
};


// Use the full authored city plans: stepped foundries, archive vaults, water
// courts, forest terraces, observatories, theatres and mechanical causeways.
// All geometry is native BufferGeometry / InstancedMesh; no Babylon renderer.
export function buildSanctuaries(ctx) {
  const group=new THREE.Group();group.name='Fifteen canonical sanctuary cities';
  const metas=computeMetas(), cache=new Map(), anims=[];
  const low=ctx.quality?.name==='low';
  function material(id) {
    if(cache.has(id))return cache.get(id);
    const def=matDef(id)||{},key=def.key||id,opts=def.opts||{};
    const oath=metas.find(m=>id===`banner:${m.id}`)?.oath;
    const color=opts.tint||oath?.accent||KEY_COLORS[key]||'#887b67';
    const metal=key.startsWith('metal.'),liquid=key.startsWith('liquid.'),glow=key.startsWith('emissive.');
    const mat=key.startsWith('paving.')?pavingMaterial(color):naturalMaterial(color,metal?.34:liquid?.22:.9,key.startsWith('stone.'));
    mat.name=id;mat.metalness=metal?.8:0;
    if(glow){mat.emissive.set(opts.emissive||color);mat.emissiveIntensity=Math.min(opts.emissiveIntensity||1,1.8);}
    if(liquid||key.startsWith('glass.')){mat.transparent=true;mat.opacity=liquid?.82:.48;mat.depthWrite=false;}
    if(opts.zOffset){mat.polygonOffset=true;mat.polygonOffsetFactor=opts.zOffset;mat.polygonOffsetUnits=opts.zOffsetUnits||-2;}
    if(key.startsWith('cloth.')||oath)mat.side=THREE.DoubleSide;
    cache.set(id,mat);return mat;
  }
  const env={ctx,scene:group,collision:ctx.collision,lightBudget:0,qDensity:low?.55:.85,
    animMesh(S,name,x,y,z,ry,build,update){
      const pivot=new THREE.Group(),spin=new THREE.Group();
      pivot.position.set(x,y,z);pivot.rotation.y=ry; pivot.add(spin);S.city.add(pivot);
      const builder=new Builder(new Frame());build(builder);builder.build(spin,`${S.meta.id}:${name}`,material);
      anims.push({city:S.city,spin,update});
    }
  };
  group.sanctuaries=[];
  for(const m of metas){
    const city=new THREE.Group();city.name=m.oath.name+' architectural reconstruction';
    city.position.set(m.cx,m.Y,m.cz);city.rotation.y=m.theta;group.add(city);m.city=city;
    const S=makeContext(m,false,env);S.city=city;
    for(const _ of cityGen(S)){} // deterministic staged plan, built before NPC spawn
    const main=S.b.build(city,`${m.id}:structure`,material);
    const detail=[...S.d.build(city,`${m.id}:detail`,material),...S.inst.build(city,m.id,getProtos(),material)];
    m.detail=detail.map(p=>p.mesh);
    const world=(x,y,z)=>{const [wx,wz]=toWorld(m,x,z);return {x:wx,y:m.Y+y,z:wz};};
    const shrine=S.shrine||{x:0,y:.9,z:31},sp=S.spawn?.local||[0,.16,-12];
    group.sanctuaries.push({oathId:m.id,center:m.oath.center,y:m.Y,shrine:world(shrine.x,shrine.y,shrine.z),spawn:{...world(...sp),ry:m.theta},npcSpots:S.npcs,qa:S.qa});
    city.userData={oathId:m.id,source:'canonical architecture city plans',meshes:main.length+detail.length,vertices:main.reduce((s,p)=>s+(p.verts||0),0)+detail.reduce((s,p)=>s+(p.verts||0),0),instances:detail.reduce((s,p)=>s+(p.count||0),0)};
  }
  let time=0;
  group.shrineAt=(x,z)=>group.sanctuaries.find(s=>Math.hypot(x-s.shrine.x,z-s.shrine.z)<12)||null;
  group.update=(dt)=>{
    dt=Math.min(dt||0,.1);time+=dt;
    const player=ctx.actors?.player,position=player?.root?.position||player?.mesh?.position||ctx.camera?.position;
    if(position)for(const m of metas){const distance=Math.hypot(position.x-m.cx,position.z-m.cz);m.city.visible=distance<(low?1300:1900);for(const mesh of m.detail)mesh.visible=distance<(low?320:620);}
    for(const a of anims)if(a.city.visible)a.update(a.spin,time,dt);
  };
  ctx.architecture=group;ctx.scene.add(group);return group;
}
