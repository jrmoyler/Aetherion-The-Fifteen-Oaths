import * as THREE from 'three';
import { computeMetas, makeContext, cityGen, toWorld } from './architecture/gen.js';
import { Frame, Builder } from './architecture/builder.js';
import { matDef, getProtos } from './architecture/kit.js';
import { architectureMaterial } from './worldMaterials.js';
import { surfaceMaps, familyOf, bannerTexture, fallMaps, lavaMaps } from './architecture/surfaces.js';
import { emblemPolys } from './architecture/emblems.js';

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
  const texSize=low?256:512,scroll=new Set(),lavaScroll=new Set();
  function material(id) {
    if(cache.has(id))return cache.get(id);
    const def=matDef(id)||{},key=def.key||id,opts=def.opts||{};
    const meta=metas.find(m=>id===`banner:${m.id}`),oath=meta?.oath;
    const color=opts.tint||oath?.accent||KEY_COLORS[key]||'#887b67';
    const metal=key.startsWith('metal.'),liquid=key.startsWith('liquid.'),glow=key.startsWith('emissive.');
    let mat;
    if(oath){
      // woven oath banner: field, trim border and the oath emblem
      const b=meta.style.banner;
      mat=new THREE.MeshStandardMaterial({map:bannerTexture(emblemPolys(oath.id),b.color,b.trim,b.emblem),roughness:.88,side:THREE.DoubleSide});
      const cloth=surfaceMaps('cloth','',256);mat.normalMap=cloth.normalMap;mat.normalScale.set(.6,.6);
    } else if(liquid){
      const fm=fallMaps(low?128:256);
      if(key==='liquid.fall'){
        mat=new THREE.MeshStandardMaterial({color,map:fm.fall,roughness:.35,metalness:0,transparent:true,depthWrite:false,side:THREE.DoubleSide,emissive:new THREE.Color(color).multiplyScalar(.18)});
        fm.fall.repeat.set(1/3.2,1/9);
      } else {
        mat=architectureMaterial(color,{roughness:.06,metalness:.15,envBoost:4,macro:.05,wear:0,grime:0});
        mat.normalMap=fm.ripple;mat.normalScale.set(.35,.35);fm.ripple.repeat.set(1/7,1/7);
        if(key==='liquid.reagent'){mat.emissive.set(color);mat.emissiveIntensity=.42;}else{mat.emissive.set(color);mat.emissiveIntensity=.06;}
      }
      scroll.add(fm);
    } else if(key==='emissive.lava'){
      const lm=lavaMaps(low?128:256);
      mat=new THREE.MeshStandardMaterial({color:'#ffffff',map:lm.map,normalMap:lm.normalMap,emissiveMap:lm.emissiveMap,emissive:new THREE.Color(opts.emissive||'#ff5a14'),emissiveIntensity:Math.min(opts.emissiveIntensity||2.2,2.6),roughness:.82});
      lavaScroll.add(lm);
    } else if(glow||key.startsWith('glass.')||key.startsWith('crystal.')){
      mat=architectureMaterial(color,{roughness:glow?.6:.08,metalness:.1,envBoost:glow?1:3,macro:.04,wear:0,grime:0});
      if(key.startsWith('crystal.')){mat.emissive.set(color);mat.emissiveIntensity=(opts.emissiveIntensity||1)*.42;}
    } else {
      const fam=familyOf(key);
      const maps=fam?surfaceMaps(fam[0],fam[1],texSize):null;
      const rough=opts.roughness!=null?opts.roughness/.8:undefined;
      mat=architectureMaterial(color,{maps,metalness:metal?.88:0,roughness:rough,envBoost:metal?3.4:key.startsWith('stone.marble')?1.6:1,
        normal:key.startsWith('paving.')||key.startsWith('concrete.')?.8:1,macro:metal?.06:key.startsWith('cloth.')?.05:.14});
      if(key.startsWith('ice.')){mat.emissive.set(color);mat.emissiveIntensity=.18;mat.transparent=true;mat.opacity=.88;}
      if(opts.mirror){mat.emissive.set('#9fb4d0');mat.emissiveIntensity=.32;mat.metalness=1;}
    }
    mat.name=id;
    if(glow&&key!=='emissive.lava'){mat.emissive.set(opts.emissive||color);mat.color.set(opts.emissive||color);mat.emissiveIntensity=Math.min(opts.emissiveIntensity||1,1.8)*.62;}
    if(liquid&&key!=='liquid.fall'){mat.transparent=true;mat.opacity=.86;mat.depthWrite=false;}
    if(key.startsWith('glass.')){mat.transparent=true;mat.opacity=.38;mat.depthWrite=false;mat.metalness=.3;mat.roughness=.05;}
    if(opts.zOffset){mat.polygonOffset=true;mat.polygonOffsetFactor=opts.zOffset;mat.polygonOffsetUnits=opts.zOffsetUnits||-2;}
    if(key.startsWith('cloth.')||oath||key.startsWith('foliage.'))mat.side=THREE.DoubleSide;
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
    for(const fm of scroll){fm.fall.offset.y=(fm.fall.offset.y+dt*.55)%1;fm.ripple.offset.x=(fm.ripple.offset.x+dt*.004)%1;fm.ripple.offset.y=(fm.ripple.offset.y+dt*.0025)%1;}
    for(const lm of lavaScroll){lm.emissiveMap.offset.x=lm.map.offset.x=lm.normalMap.offset.x=(lm.map.offset.x+dt*.006)%1;}
  };
  ctx.architecture=group;ctx.scene.add(group);return group;
}
