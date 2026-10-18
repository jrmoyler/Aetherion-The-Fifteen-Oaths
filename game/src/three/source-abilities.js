/** Runs the imported Ability Matrix classes in the game's actual Three.js scene.
 * No iframe, colour-palette translation or substitute particle effect is involved.
 * Original geometry, GLSL, presets, timings and particle services stay together.
 */
import { Group, Vector3, Vector2, PerspectiveCamera, DataTexture, RGBAFormat, UnsignedByteType } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LightPool } from '../../../runtime/ability-matrix/packs/linear/src/effects/LightPool.js';
import { patchOnBeforeCompile } from '../../../runtime/ability-matrix/packs/linear/src/utils/shaderPatch.js';
import { buildDroneRig } from '../../../runtime/ability-matrix/packs/handcast/src/assets/DroneRig.js';
import { buildMonowheelRig } from '../../../runtime/ability-matrix/packs/handcast/src/assets/MonowheelRig.js';
import { buildPhoenixRig } from '../../../runtime/ability-matrix/packs/handcast/src/assets/PhoenixRig.js';
import { ABILITIES_BY_OATH } from '../../../shared/abilities.generated.js';

const LOADERS = {
  linear: () => import('./source-packs/linear.js'),
  'linear-ext': () => import('./source-packs/linear-ext.js'),
  'linear-extended': () => import('./source-packs/linear-extended.js'),
  casting: () => import('./source-packs/casting.js'),
  handcast: () => import('./source-packs/handcast.js'),
  collective: () => import('./source-packs/collective.js'),
  sandbox: () => import('./source-packs/sandbox.js'),
};
const ALIASES = { codex: 'sandbox', atlas: 'sandbox', 'matrix-new': 'sandbox' };
const BUFFS = { boost: 'ElectricBoost', magic: 'MagicBoost', fire: 'FireBoost' };
export const SOURCE_ABILITY_IDS = Object.freeze(Object.values(ABILITIES_BY_OATH).flat().map(a => a.id));
const known = new Set(SOURCE_ABILITY_IDS);
const position = p => new Vector3(p?.x ?? 0, p?.y ?? 0, p?.z ?? 0);

export async function createSourceAbilities(ctx) {
  const modules = Object.fromEntries(await Promise.all(Object.entries(LOADERS).map(async ([key, load]) => [key, await load()])));
  const root = new Group(); root.name = 'AbilityMatrix:original-source'; ctx.scene.add(root);
  const camera = ctx.camera ?? new PerspectiveCamera(55, 1, .1, 1000);
  camera.layers.enable(1); camera.layers.enable(4); // Original WORLD and VFX; distortion remains a separate render layer.
  const lights = new LightPool(root);
  const sessions = new Map(), handles = new Set(), models = {};
  const ownership = new WeakMap();
  const farDepth = new DataTexture(new Uint8Array([255,255,255,255]), 1, 1, RGBAFormat, UnsignedByteType);
  farDepth.needsUpdate = true;
  const resolution = new Vector2(1,1);
  let elapsed = 0;

  // Authored summon rigs are loaded before a player can cast, just as in the source app.
  if (typeof window !== 'undefined' && ctx.renderer) {
    const loader = new GLTFLoader();
    const base = `${import.meta.env?.BASE_URL ?? '/'}assets/ability-source/handcast/models/`;
    const [drone, monowheel, phoenix] = await Promise.all(['drone.glb','monowheelArmyBot.glb','phoenix_bird.glb'].map(name => loader.loadAsync(base + name)));
    models.drone = buildDroneRig(drone.scene, { span: modules.handcast.settings.drone.size });
    models.monowheel = buildMonowheelRig(monowheel.scene, { height: modules.handcast.settings.monowheel.size });
    models.phoenix = buildPhoenixRig(phoenix, { wingspan: modules.handcast.settings.phoenix.wingspan });
  }

  const environment = {
    scene: ctx.scene,
    registerShadowCaster: material => material,
    registerShadowCasterWithPatch: (material, patch) => patchOnBeforeCompile(material, patch),
  };
  const shake = { add(amount) { ctx.bus?.emit?.('camera:shake', { intensity: Math.min(.6, amount) }); }, rumble() {} };
  const flash = { trigger(color, intensity) { ctx.bus?.emit?.('combat:flash', { color, intensity }); } };

  function sessionFor(pack, ground) {
    // Source floor-space effects assume y=0. Each elevation gets a translated
    // scene, so a cast on a bridge never drags ground effects uphill with it.
    const floor = Math.round(ground * 2) / 2;
    const key = `${pack}:${floor}`;
    if (sessions.has(key)) return sessions.get(key);
    const m = modules[pack], group = new Group(); group.name = `SourcePack:${key}`; group.position.y = floor; root.add(group);
    const particles = new m.ParticleEngine(group), decals = new m.DecalSystem(group), bursts = new m.BurstSystem(group);
    const fissures = m.FissureSystem ? new m.FissureSystem(group) : null;
    const localLights = {
      acquire: () => lights.acquire(), release: e => lights.release(e),
      set(e,p,c,i,r,dt) { lights.set(e,position(p).add(new Vector3(0,floor,0)),c,i,r,dt); },
    };
    const targets = {
      findTargets(x,z,range,out=[]) {
        out.length=0;
        const actors = ctx.actors?.entities ?? ctx.actors?.mobs ?? ctx.actors?.all ?? [];
        for(const actor of actors instanceof Map ? actors.values() : Array.isArray(actors) ? actors : []) {
          if(actor.position && actor.alive !== false && Math.hypot(actor.position.x-x,actor.position.z-z)<=range) out.push(actor);
        }
        return out.sort((a,b)=>Math.hypot(a.position.x-x,a.position.z-z)-Math.hypot(b.position.x-x,b.position.z-z));
      },
    };
    const context = { scene: group, camera, environment, particles, decals, bursts, fissures, lights: localLights, shake, flash, models, dummies: targets };
    const manager = new m.AbilityManager(context);
    const value = { key, pack, floor, group, context, manager, particles, decals, bursts, fissures, touched: elapsed, buffs: new Set() };
    sessions.set(key,value); return value;
  }
  function clearSession(s) {
    s.manager.dispose(); s.particles.dispose(); s.decals.dispose(); s.bursts.dispose(); s.fissures?.dispose();
    for(const buff of s.buffs) buff.dispose();
    s.group.removeFromParent(); sessions.delete(s.key);
  }
  function characterProxy(actor, floor) {
    return {
      get position() { return position(actor?.position).add(new Vector3(0,-floor,0)); },
      get facing() { return actor?.facing ?? actor?.root?.rotation?.y ?? 0; },
      get height() { return actor?.height ?? 1.85; },
      writeBoneSegments(a,b) {
        const bones=[]; (actor?.root ?? actor?.mesh)?.traverse?.(o=>{if(o.isBone && o.parent?.isBone)bones.push(o);});
        const count=Math.min(a.length,bones.length);
        for(let i=0;i<count;i++){const p=bones[i].parent.getWorldPosition(new Vector3()),q=bones[i].getWorldPosition(new Vector3());a[i].set(p.x,p.y-floor,p.z,.065);b[i].set(q.x,q.y-floor,q.z,0);}
        return count;
      },
    };
  }
  function cast(ab, opts={}) {
    if(!known.has(ab.id)) return null;
    for(const h of [...handles])if(h.done)h.stop();
    while(handles.size>=32)handles.values().next().value.stop();
    const token={};
    const [catalog,id] = ab.id.split('/'), pack=ALIASES[catalog]??catalog;
    const origin=position(opts.pos??opts.caster?.position), target=position(opts.target??origin);
    const direction=target.clone().sub(origin).setY(0); const distance=direction.length();
    if(distance<.001) direction.set(opts.dir?.x??0,0,opts.dir?.z??1); direction.normalize();
    const s=sessionFor(pack,origin.y); s.touched=elapsed;
    let instance, stopped=false, delay=Math.max(0,opts.castTime??opts.ant??0);
    const isBuff=pack==='linear-ext' && BUFFS[id];
    const spawn=()=>{
      if(isBuff) {
        const Type=modules[pack][BUFFS[id]];
        instance=new Type({...s.context,character:characterProxy(opts.caster,s.floor)});
        s.buffs.add(instance); instance.activate();
      } else {
        instance=s.manager.cast(origin.clone().setY(origin.y-s.floor),direction,Math.max(.1,distance||ab.range||4),id);
        if(!instance) throw new Error(`Original source class missing for ${ab.id}`);
      }
      ownership.set(instance,token);
    };
    const handle={ sourceId:ab.id, sourcePack:pack,
      get instance(){return instance;}, get done(){return stopped || !!instance && (ownership.get(instance)!==token || (isBuff ? !instance.active : !instance.isActive));},
      stop(){if(stopped)return;stopped=true;handles.delete(handle);if(!instance || ownership.get(instance)!==token)return;if(isBuff){instance.cancel();instance.dispose();s.buffs.delete(instance);}else{const index=s.manager.active.indexOf(instance);if(index>=0){s.manager.active.splice(index,1);instance.destroy();s.manager.pools.get(id)?.release(instance);}}},
      advance(dt){if(stopped)return;if(!instance){delay-=dt;if(delay<=0)spawn();}if(isBuff&&instance)instance.update(dt);if(handle.done)handle.stop();},
    };
    handles.add(handle); if(delay===0)spawn();
    return handle;
  }
  function update(dt) {
    elapsed+=dt; ctx.renderer?.getDrawingBufferSize?.(resolution);
    for(const m of Object.values(modules)) {
      const f=m.frame; f.uTime.value=elapsed;f.uDelta.value=dt;f.uResolution.value.copy(resolution);
      f.uCameraNear.value=camera.near;f.uCameraFar.value=camera.far;
      f.uSceneDepth.value=ctx.render?.sceneDepth??ctx.sourceDepthTexture??farDepth;
      if(f.uEnvMap) f.uEnvMap.value=ctx.sourceEnvironmentTexture??null;
      f.uShaderIntensity.value=m.settings.global.shaderIntensity??1; f.uGlobalGlow.value=m.settings.global.glow??1;
    }
    for(const h of [...handles])h.advance(dt);
    for(const s of [...sessions.values()]) {
      s.manager.update(dt);s.particles.flush();s.decals.update(dt);s.bursts.update(dt);s.fissures?.update(dt);
      if(s.manager.active.length || s.buffs.size)s.touched=elapsed;
      // Keep source particle tails alive; retire idle floor caches instead of leaking GPU pools.
      if(elapsed-s.touched>18)clearSession(s);
    }
    lights.update(dt);
  }
  function stopAll(){for(const h of [...handles])h.stop();for(const s of [...sessions.values()])clearSession(s);lights.reset();}
  return { cast, update, stopAll, dispose(){stopAll();lights.dispose();farDepth.dispose();root.removeFromParent();},
    get activeCount(){return [...handles].filter(h=>!h.done).length;},
    get stats(){return { supportedIds:SOURCE_ABILITY_IDS, loadedPacks:Object.keys(modules), active:handles.size, sessions:sessions.size, models:Object.keys(models) };},
  };
}
