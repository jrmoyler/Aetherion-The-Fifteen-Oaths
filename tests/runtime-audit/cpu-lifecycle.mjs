/** Read-only audit of the vendored source. No gameplay implementation is replaced.
 * CPU only: no renderer, image decoder, authored FBX character, or target bodies.
 * GLB geometry/animation are parsed by the installed, locked Three.js GLTFLoader.
 * Texture decoding failures are retained as limitations, never called visual passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../runtime/ability-matrix');
const out=path.resolve(here,'../../validation');
const src=path.join(root,'packs/sandbox/src');
const imp=p=>import(pathToFileURL(path.join(src,p)).href);
const catalog=JSON.parse(fs.readFileSync(path.join(root,'presets/catalog.json'))).abilities.filter(a=>a.status==='live'&&['ability','buff','summon'].includes(a.kind));
const uid=process.argv[2];
const textureMode=process.env.AUDIT_TEXTURE_FIXTURES==='1';
const reportName=textureMode?'texture-fixture-cpu-audit.json':'cpu-lifecycle-audit.json';
if(!uid){
 let report={sourceCommit:'4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451',generatedAt:new Date().toISOString(),node:process.version,mode:'CPU source lifecycle with real Three.js objects; no WebGL renderer',dependencies:{method:'Reused pre-existing local installed files; clean npm ci blocked by network approval',three:'0.185.1',vite:'8.1.5','lil-gui':'0.21.0'},limitations:['No GPU shader compilation or visual validation.','No authored FBX character or target rigs loaded: target collision/damage, ragdolls, clone appearances, bone-attached buffs, and character-animation presentation are not verified.','GLB mesh/animation parsing is real; embedded texture decode is unavailable in Node and may use upstream loader fallback.','Only default settings, a fixed valid cast, lifecycle and pooling/cancellation are exercised; arbitrary settings and gameplay balance are not certified.','The production browser bootstrap and URL asset-loading paths are not executed.'],results:[]};
 fs.mkdirSync(out,{recursive:true});
 if(textureMode){
  const dir=fs.mkdtempSync('/tmp/aetherion-stone-fixtures-');
  const decoded=spawnSync('python',[path.join(here,'decode-stone-textures.py'),dir],{encoding:'utf8'});
  assert.equal(decoded.status,0,decoded.stderr);process.env.AUDIT_TEXTURE_MANIFEST=path.join(dir,'manifest.json');
  report.mode='Supplementary CPU source lifecycle using actual decoded source JPEG DataTexture fixtures; no WebGL renderer';
  report.textureBoundary=JSON.parse(fs.readFileSync(process.env.AUDIT_TEXTURE_MANIFEST,'utf8'));
 }
 if(process.env.AUDIT_RETRY==='1')report=JSON.parse(fs.readFileSync(path.join(out,reportName),'utf8'));
 const toRun=process.env.AUDIT_RETRY==='1'?catalog.filter(a=>report.results.some(r=>r.uid===a.uid&&!r.status.startsWith('passed'))):textureMode?catalog.filter(a=>['linear-extended/quake','handcast/toxic','casting/shark'].includes(a.uid)):catalog;
 for(const a of toRun){
  const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),a.uid],{encoding:'utf8',timeout:120000,maxBuffer:5*1024*1024});
  const line=r.stdout?.split('\n').find(x=>x.startsWith('AUDIT_RESULT '));
  let value;try{value=JSON.parse(line.slice(13));}catch{value={uid:a.uid,kind:a.kind,status:'audit-process-failed',error:r.error?.message??r.stderr??'No report',exitCode:r.status};}
  const existing=report.results.findIndex(r=>r.uid===a.uid);if(existing>=0)report.results[existing]=value;else report.results.push(value);
  console.log(`${report.results.length}/${textureMode?3:100} ${a.uid}: ${value.status}${value.error?' '+value.error.split('\n')[0]:''}`);
  fs.writeFileSync(path.join(out,reportName),JSON.stringify(report,null,2)+'\n');
 }
 report.summary={total:report.results.length,statusCounts:Object.fromEntries(Object.entries(Object.groupBy(report.results,r=>r.status)).map(([k,v])=>[k,v.length])),importPassed:report.results.filter(r=>r.import==='passed').length};
 fs.writeFileSync(path.join(out,reportName),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report.summary));
 process.exitCode=report.results.some(r=>!r.status.startsWith('passed'))?1:0;
}else{
 const a=catalog.find(a=>a.uid===uid);assert(a,`Unknown castable ${uid}`);
 const result={uid,kind:a.kind,element:a.element,import:'not-run',status:'started',checks:[],limitations:['No target bodies; no authored character rig; no WebGL draw.'],assets:[],warnings:[]};
 const oldWarn=console.warn,oldError=console.error;
 console.warn=(...x)=>{result.warnings.push(x.map(String).join(' '));};
 console.error=(...x)=>{result.warnings.push(x.map(String).join(' '));};
 const trace=(s)=>{if(process.env.AUDIT_TRACE)oldError(s)};
 let cleanup=()=>{};let textureFixture=null;
 try{
  trace('const THREE=');const THREE=await import(pathToFileURL(path.join(root,'node_modules/three/build/three.module.js')).href);
  if(textureMode){const {installStoneTextureFixture}=await import('./install-stone-texture-fixture.mjs');textureFixture=installStoneTextureFixture(THREE,process.env.AUDIT_TEXTURE_MANIFEST,root);result.textureDecodeBoundary=textureFixture.evidence;}
  const {Environment}=await imp('world/Environment.js');
  const {SandboxCharacter}=await imp('sandbox/SandboxCharacter.js');
  const {DummyField}=await imp('combat/DummyField.js');
  const {LightPool}=await imp('effects/LightPool.js');
  const {CameraShake}=await imp('effects/CameraShake.js');
  const {ScreenFlash}=await imp('effects/ScreenFlash.js');
  const {frame:hostFrame}=await imp('core/FrameUniforms.js');
  const {settings:hostSettings}=await imp('config/settings.js');
  trace('const camera=');const camera=new THREE.PerspectiveCamera();
  const environment=new Environment(null,camera),scene=environment.scene;
  const character=new SandboxCharacter(environment),dummies=new DummyField(environment);
  scene.add(character.root,dummies.group);
  const lights=new LightPool(scene),shake=new CameraShake({shakeOffset:new THREE.Vector3(),shakeRoll:0}),flash=new ScreenFlash();
  const host={scene,camera,environment,character,dummies,lights,shake,flash,frame:hostFrame,settings:hostSettings,input:{keys:new Set()}};
  const vendor=['linear','linear-ext','linear-extended','handcast','casting'].includes(a.pack);
  const base=vendor?`vendor/${a.pack}/`:'';
  trace('const config=');const config=await imp(base+'config/settings.js');
  const {AbilityManager}=await imp(base+'abilities/AbilityManager.js');
  const {ParticleEngine}=await imp(base+'particles/ParticleEngine.js');
  const {DecalSystem}=await imp(base+'effects/GroundDecals.js');
  const {BurstSystem}=await imp(base+'effects/BurstSphere.js');
  const {frame}=await imp(base+'core/FrameUniforms.js');
  trace('if(vendor)await');if(vendor)await imp(`vendor/runtimes/${a.pack}.js`); // real wrapper import, no browser boot claim
  result.import='passed';
  trace('const particles=');const particles=new ParticleEngine(scene),decals=new DecalSystem(scene),bursts=new BurstSystem(scene);
  const ctx={...host,particles,decals,bursts,models:{}};
  trace('const manager=');const manager=new AbilityManager(ctx);
  let buff=null;
  cleanup=()=>{buff?.dispose();manager.dispose();particles.dispose();decals.dispose();bursts.dispose();lights.dispose();dummies.dispose();character.dispose();environment.dispose();};
  // Alias supplied by browsers; it does not replace any source or gameplay API.
  globalThis.self=globalThis;
  const loadGLB=async name=>{
   const {GLTFLoader}=await import(pathToFileURL(path.join(root,'node_modules/three/examples/jsm/loaders/GLTFLoader.js')).href);
   const bytes=fs.readFileSync(path.join(root,'packs/sandbox/public/models',name));
   const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
   let meshes=0,bones=0;gltf.scene.traverse(o=>{if(o.isMesh)meshes++;if(o.isBone)bones++;});
   result.assets.push({path:`packs/sandbox/public/models/${name}`,bytes:bytes.length,meshes,bones,animations:gltf.animations.length,geometryParse:'passed',textureDecode:'not-verified'});
   return gltf;
  };
  if(a.pack==='linear-extended'&&a.id==='cyber'){
   const {buildSerpentGeometry}=await imp(base+'assets/SerpentGeometry.js');
   ctx.models.serpent=buildSerpentGeometry((await loadGLB('snake.glb')).scene,{ghosts:8});
  }
  const rigs={
   'handcast/drone':['drone','Drone','drone.glb','scene',{span:config.settings.drone?.size}],
   'handcast/monowheel':['monowheel','Monowheel','monowheelArmyBot.glb','scene',{height:config.settings.monowheel?.size}],
   'handcast/phoenix':['phoenix','Phoenix','phoenix_bird.glb','gltf',{wingspan:config.settings.phoenix?.wingspan}],
   'casting/shark':['shark','Shark','shark.glb','gltf',{length:config.settings.shark?.length}],
   'casting/wolf':['wolf','Wolf','wolf.glb','gltf',{length:config.settings.wolf?.length}],
   'casting/dragon':['dragon','Dragon','dragon.glb','gltf',{wingspan:config.settings.dragon?.wingspan}],
   'casting/gyro':['gyro','Gyroscope','magical_gyroscope.glb','gltf',{height:config.settings.gyro?.size}],
   'casting/amethyst':['amethyst','Amethyst','amethyst_stones.glb','gltf',{}],
   'casting/tome':['tome','Tome','arcane_tome.glb','gltf',{}],
   'casting/reliquary':['reliquary','Reliquary','wildroot_reliquary.glb','gltf',{}]
  };
  if(rigs[uid]){const [key,name,file,shape,opt]=rigs[uid],gltf=await loadGLB(file),m=await imp(base+`assets/${name}Rig.js`);ctx.models[key]=m[`build${name}Rig`](shape==='scene'?gltf.scene:gltf,opt);assert(ctx.models[key],'source rig builder returned null');result.checks.push('authored-GLB-source-rig-built');}
  trace('const origin=');const origin=new THREE.Vector3(0,0,0),direction=new THREE.Vector3(0,0,1),distance=Math.max(a.minRange??1,Math.min(a.range??12,12));
  let ability;
  if(a.kind==='buff'){
   const name={boost:'Electric',magic:'Magic',fire:'Fire'}[a.id],mod=await imp(base+`effects/${name}Boost.js`);
   buff=new mod[`${name}Boost`](ctx);assert.equal(buff.activate(),true);ability=buff;
  }else{
   trace('const warm=');const warm=manager.prewarm?.(a.id);if(warm)result.checks.push('source-prewarm');if(textureMode)await new Promise(resolve=>setImmediate(resolve));
   ability=manager.cast(origin,direction,distance,a.id);assert(ability,'cast returned no ability');if(warm)assert(Array.isArray(warm)?warm.includes(ability):ability===warm,'prewarmed source instance should be reused');
  }
  trace("result.checks.push('constructed'");result.checks.push('constructed','spawned');
  if(textureMode){await new Promise(resolve=>setImmediate(resolve));const {getStoneTextures}=await imp(base+'loaders/StoneTextures.js');const stone=getStoneTextures();assert.equal(stone.state.loaded,4);assert.equal(stone.state.amount,1);assert.equal(textureFixture.evidence.callbacksCompleted,4);result.checks.push('four-actual-source-stone-images-decoded');}result.observedPhases=[];
  const finite=(full=false)=>{let nodes=0;scene.traverse(o=>{nodes++;for(const n of [...o.position.toArray(),...o.scale.toArray(),...o.quaternion.toArray()])assert(Number.isFinite(n),`${o.name||o.type}: nonfinite transform`);if(full){for(const [key,attr]of Object.entries(o.geometry?.attributes??{}))for(const n of attr.array)assert(Number.isFinite(n),`${o.name||o.type}.${key}: nonfinite geometry`);if(o.instanceMatrix)for(const n of o.instanceMatrix.array)assert(Number.isFinite(n),`${o.name}: nonfinite instance matrix`);}});return nodes;};
  trace('result.sceneNodesAfterSpawn=');result.sceneNodesAfterSpawn=finite(true);
  let time=0;const dt=1/30;
  const tick=()=>{time+=dt;frame.uTime.value=time;frame.uDelta.value=dt;hostFrame.uTime.value=time;hostFrame.uDelta.value=dt;character.update(dt);if(buff)buff.update(dt);else manager.update(dt);dummies.update(dt,character.position);if(vendor)dummies.applyHitsWith(manager.active,config.castShapeOf??(id=>config.ELEMENT_META[id]?.cast??'line'),config.zoneRadiusOf??(id=>config.settings[id]?.zoneRadius??0));else dummies.applyHits(manager.active);manager.lateUpdate?.(dt);particles.flush(time);decals.update(dt);bursts.update(dt);lights.update(dt);shake.update(dt);flash.update(dt);const p=buff?(buff.active?'active':'inactive'):(ability.state??ability.phase);if(!result.observedPhases.includes(p))result.observedPhases.push(p);};
  trace('for(let i=0;i<1800;i++){');for(let i=0;i<1800;i++){
   if(ability.isPersistent&&i===180){assert(ability.isActive,'persistent cast must remain active');ability.dismiss();result.checks.push('persistent-hold','source-dismiss-invoked');}
   if(a.kind==='summon'&&i===90){ability.setSteer?.(1,0);ability.setFiring?.(true);result.checks.push('summon-steer-fire-invoked');}
   if(a.kind==='summon'&&i===180){ability.setFiring?.(false);ability.setSteer?.(0,0);ability.recall();result.checks.push('summon-recall-invoked');}
   tick();if(i%30===0)finite(i===30);if(buff?!buff.active:manager.active.length===0)break;
  }
  trace('result.simulatedSeconds=');result.simulatedSeconds=Math.round(time*1000)/1000;assert(buff?!buff.active:manager.active.length===0,'source lifecycle did not retire within 60 simulated seconds');
  finite(true);result.checks.push('default-lifecycle-completed','finite-CPU-transforms-and-buffers',ability.isPersistent?'dismissal-retirement':'natural-retirement');
  assert.equal(lights.lights.filter(l=>l.inUse).length,0,'light handles leaked after natural retirement');
  if(buff){while(buff.cooldown>0)tick();assert(buff.activate());tick();buff.cancel();assert(!buff.active);}
  else{const again=manager.cast(origin,direction,distance,a.id);assert(again===ability,'pool did not reuse retired instance');tick();if(again.isPersistent){const replacement=manager.cast(origin,direction,distance,a.id);assert(replacement!==again);assert.equal(again.phase,'fade');result.checks.push('persistent-replacement-dismissal');}manager.clear();assert.equal(manager.active.length,0);assert.equal(again.group.visible,false);}
  assert.equal(lights.lights.filter(l=>l.inUse).length,0,'light handles leaked after cancellation');result.checks.push('recast','cancel','light-pool-released');
  trace('cleanup();cleanup=');cleanup();cleanup=()=>{};result.checks.push('dispose-without-exception');result.status='passed-cpu-lifecycle-only';
 }catch(e){result.error=e.stack??String(e);result.status=/document is not defined|window is not defined|createImageBitmap/.test(result.error)?'blocked-browser-API':'failed-source-or-contract';try{cleanup();}catch(e2){result.cleanupError=e2.stack??String(e2);}}
 textureFixture?.restore();console.warn=oldWarn;console.error=oldError;
 console.log('AUDIT_RESULT '+JSON.stringify(result));
}
