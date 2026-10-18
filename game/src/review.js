import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import sourceDummyUrl from '../../runtime/ability-matrix/packs/casting/public/models/dummy.fbx?url';
import sourceEnvironmentUrl from '../../runtime/ability-matrix/packs/handcast/public/hdri/spruit_sunrise.hdr?url';
import { initVFX } from './three/vfx.js';
import { createPostprocessing } from './three/postprocessing.js';
import { ABILITY_BY_ID } from '@shared/abilities.js';
const $=id=>document.getElementById(id),abilities=Object.values(ABILITY_BY_ID),report={created:new Date().toISOString(),rendered:true,casts:[],errors:[]};
let frame=0,auto=false,vfx,selected=0;
// ?audit=1: deterministic stepping for tools/qa/effects-render-audit.mjs (no free-running loop).
const AUDIT=new URLSearchParams(location.search).has('audit');window.__reviewReport=report;
if(AUDIT){document.querySelector('main').style.display='none';}
function error(value){const message=String(value?.message??value);report.errors.push({ability:abilities[selected]?.id,message});$('errors').textContent=report.errors.map(e=>`${e.ability}: ${e.message}`).join('\n');$('error-count').textContent=report.errors.length;}
addEventListener('error',e=>error(e.error??e.message));addEventListener('unhandledrejection',e=>error(e.reason));
const originalError=console.error.bind(console);console.error=(...args)=>{originalError(...args);error(args.join(' '));};
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
const scene=new THREE.Scene();scene.background=new THREE.Color('#161c23');scene.fog=new THREE.Fog('#161c23',38,120);
const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,500);camera.position.set(14,10,18);camera.lookAt(0,2,0);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,1.5,0);controls.enableDamping=true;controls.maxDistance=70;controls.minDistance=4;
// Neutral slate stage (matches the dark-floor reference sheets) so additive VFX read with real contrast.
scene.add(new THREE.HemisphereLight('#c8d6ec','#2a2620',.85));const sun=new THREE.DirectionalLight('#ffe6c8',1.6);sun.position.set(9,18,8);scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#3a4249',roughness:.82,metalness:.05}));floor.rotation.x=-Math.PI/2;scene.add(floor);scene.add(new THREE.GridHelper(80,40,'#4d5a66','#2c343c'));
const dummy=new THREE.Group();dummy.position.set(0,0,0);const material=new THREE.MeshStandardMaterial({color:'#8d8a84',roughness:.55,metalness:.1});const body=new THREE.Mesh(new THREE.CapsuleGeometry(.36,1.15,5,10),material);body.position.y=1;dummy.add(body);const head=new THREE.Mesh(new THREE.SphereGeometry(.24,12,8),material);head.position.y=1.95;dummy.add(head);const actorRoot=new THREE.Group();actorRoot.add(dummy);scene.add(actorRoot);
const actor={id:'training-target',kind:'mob',alive:true,position:actorRoot.position,root:actorRoot,body:{root:dummy,height:2.2,sockets:{}},playAnim(){}};
// The source sandbox's own rigged practice dummy (Mixamo skeleton) replaces the capsule when it
// loads, so bone-driven target reactions (chains, bites, clips, carries) have joints to act on.
let dummyMixer=null;
// The caster stands at z=8 facing the target. Buffs (source boost auras) read its bones.
const casterRoot=new THREE.Group();casterRoot.position.set(0,0,8);casterRoot.rotation.y=Math.PI;scene.add(casterRoot);
const caster={id:'review-caster',kind:'player',position:casterRoot.position,root:casterRoot,get facing(){return casterRoot.rotation.y;},height:1.85};
async function loadSourceDummy(){
  // The export carries no textures; like the source Dummy, give it one neutral authored PBR material.
  const manager=new THREE.LoadingManager();manager.setURLModifier(u=>/\.(png|jpe?g)$/i.test(u)?'data:,':u);
  const fbx=await new FBXLoader(manager).loadAsync(sourceDummyUrl);
  const skin=new THREE.MeshStandardMaterial({name:'Dummy',color:'#a2a19c',roughness:.62,metalness:.12,side:THREE.DoubleSide});
  fbx.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.material=Array.isArray(o.material)?o.material.map(()=>skin):skin;}if(o.isBone)actor.body.sockets[o.name.replace(/^mixamorig:?/i,'')]=o;});
  if(fbx.animations?.[0]){dummyMixer=new THREE.AnimationMixer(fbx);dummyMixer.clipAction(fbx.animations[0]).play();dummyMixer.update(0);updates.push(dt=>dummyMixer.update(dt));}
  const height=1.85,box=new THREE.Box3();fbx.updateMatrixWorld(true);box.setFromObject(fbx,true);
  const scale=height/Math.max(.001,box.max.y-box.min.y);fbx.scale.setScalar(scale);fbx.updateMatrixWorld(true);box.setFromObject(fbx,true);
  const c=box.getCenter(new THREE.Vector3());fbx.position.set(-c.x,-box.min.y,-c.z);
  dummy.clear();dummy.add(fbx);actor.body.height=height;
  const casterBody=cloneSkinned(fbx);const casterSkin=skin.clone();casterSkin.color.set('#6f7480');casterBody.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.material=casterSkin;}});
  if(fbx.animations?.[0]){const mixer=new THREE.AnimationMixer(casterBody);mixer.clipAction(fbx.animations[0]).play();updates.push(dt=>mixer.update(dt));}
  casterRoot.add(casterBody);
}

const updates=[],quality={name:'medium',bloom:true,msaa:1};const post=createPostprocessing(renderer,scene,camera,quality);
const ctx={scene,camera,renderer,quality,actors:{entities:new Map([[actor.id,actor]])},render:{sceneDepth:post.depthTexture},bus:{emit(){}},addUpdate(fn){updates.push(fn);return()=>{};}};
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();post.resize(innerWidth,innerHeight,renderer.getPixelRatio());}resize();addEventListener('resize',resize);
let previous=performance.now();function tick(dt,draw=true){for(const update of updates)update(dt);controls.update();if(draw)post.render(dt,!!vfx?.hasActiveSourceEffects);frame++;}
if(!AUDIT)renderer.setAnimationLoop(now=>{const dt=Math.min(.1,(now-previous)/1000);previous=now;tick(dt);});
function frames(count){return new Promise((resolve,reject)=>{const start=frame,deadline=performance.now()+20000;function poll(){if(frame>=start+count)return resolve();if(performance.now()>deadline)return reject(Error('Renderer frames stalled'));requestAnimationFrame(poll);}poll();});}
async function cast(){vfx.stopAll();const ab=abilities[selected];$('identity').textContent=`${ab.id} · ${ab.name}`;const start=performance.now(),before=report.errors.length;try{const handle=vfx.castEffect(ab,{caster,pos:new THREE.Vector3(0,0,8),target:new THREE.Vector3(0,0,0),element:ab.element});await frames(4);const row={id:ab.id,sourceId:handle?.sourceId,sourcePack:handle?.sourcePack,elapsedMs:Math.round(performance.now()-start),frame,errors:report.errors.length-before};report.casts.push(row);if(row.sourceId!==ab.id)throw Error('Source identity mismatch');$('identity').textContent=`${row.sourceId} · ${row.sourcePack} · rendered frame ${frame}`;$('status').textContent=`Rendered ${selected+1}/150: ${ab.name}`;}catch(e){error(e);$('status').textContent=`Failed ${ab.id}: ${e.message}`;}}
for(const ab of abilities){const option=document.createElement('option');option.value=ab.id;option.textContent=`${ab.name} — ${ab.id}`;$('ability').append(option);}
$('ability').onchange=()=>{selected=$('ability').selectedIndex;};$('cast').onclick=()=>cast();$('next').onclick=()=>{selected=(selected+1)%abilities.length;$('ability').selectedIndex=selected;cast();};$('stop').onclick=()=>{auto=false;vfx.stopAll();$('status').textContent='Stopped';};
$('auto').onclick=async()=>{if(auto)return;auto=true;report.casts=[];$('auto').disabled=true;$('cast').disabled=true;try{for(selected=0;selected<abilities.length&&auto;selected++){$('ability').selectedIndex=selected;await cast();await new Promise(r=>setTimeout(r,1800));$('progress').value=selected+1;}if(auto)$('status').textContent=`Review complete: ${report.casts.length}/150 casts; ${report.errors.length} render errors.`;}catch(e){error(e);}finally{auto=false;selected=Math.min(selected,149);$('auto').disabled=false;$('cast').disabled=false;}};
$('download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.download='aetherion-source-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
try{ctx.sourceEnvironmentTexture=await new RGBELoader().loadAsync(sourceEnvironmentUrl);ctx.sourceEnvironmentTexture.mapping=THREE.EquirectangularReflectionMapping;const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(ctx.sourceEnvironmentTexture).texture;scene.environmentIntensity=.5;pmrem.dispose();try{await loadSourceDummy();}catch(e){console.warn('Source dummy unavailable, keeping capsule:',e.message);}vfx=await initVFX(ctx);report.sourceModels=vfx.sourceStats.models;report.packs=vfx.sourceStats.loadedPacks;report.postprocessing=post.enabled;for(const id of ['ability','cast','next','auto','stop'])$(id).disabled=false;$('status').textContent=`Ready: 150 source abilities, ${report.sourceModels.length} summon models, HDR ${post.enabled?'enabled':'unavailable'}.`;if(AUDIT)exposeAudit();else await cast();}catch(e){error(e);$('status').textContent=`Asset loading failed: ${e.message}`;}

// Audit API: cast by id, advance simulated time at a fixed step (rendering every Nth step), and
// read back the frame synchronously after a render (no preserveDrawingBuffer needed).
function exposeAudit(){
  const canvas=renderer.domElement;
  // Closer framing than the interactive default so caster (z=8) and target (origin) both fill the frame.
  camera.position.set(9,6.5,15);controls.target.set(0,1.4,3.6);controls.update();
  window.__review={report,ids:abilities.map(a=>a.id),post:post.enabled,scene,camera,renderer,THREE,
    rawCapture(){renderer.setRenderTarget(null);renderer.render(scene,camera);return canvas.toDataURL();},
    reset(){vfx.stopAll();for(let i=0;i<3;i++)tick(1/60,false);},
    cast(id){selected=abilities.findIndex(a=>a.id===id);const ab=abilities[selected];const before=report.errors.length;let handle=null;
      try{handle=window.__review.last=vfx.castEffect(ab,{caster,pos:new THREE.Vector3(0,0,8),target:new THREE.Vector3(0,0,0),element:ab.element});}catch(e){error(e);}
      return {id,sourceId:handle?.sourceId??null,sourcePack:handle?.sourcePack??null,errors:report.errors.slice(before).map(e=>e.message)};},
    step(seconds,dt=1/60,renderEvery=4){const n=Math.max(1,Math.round(seconds/dt));for(let i=0;i<n;i++)tick(dt,(i%renderEvery)===renderEvery-1&&i<n-1);},
    capture(type='image/png',q){tick(0,true);return canvas.toDataURL(type,q);},
    get active(){return vfx.activeCount;},
  };
}
