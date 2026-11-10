import { Color, Vector3 } from 'three';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { frame } from '../../core/FrameUniforms.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { CAST_ANIMATIONS, settings } from '../../config/settings.js';

/** Match the sandbox global controls for existing as well as new particles. */
export function syncParticleGlobals(system) {
  const u=system?.uniforms;if(!u)return;
  if(u.uSizeScale)u.uSizeScale.value=settings.global.particleSize;
  if(u.uSpeedScale)u.uSpeedScale.value=settings.global.particleSpeed;
  if(u.uLifeScale)u.uLifeScale.value=settings.global.particleLifetime;
}

// Shared bounded particle transport, not a shared spell design. Each cast
// provides its own geometry, shader, cadence, shape and palette. The sandbox's
// ParticleEngine owns these pooled systems and disposes them with the app.
export class ExpansionAtmosphere {
  constructor(ctx, key, {shape='SOFT', colors, rate=18, speed=.5, size=.1, life=1.2, spread=.6, radius=1, direction=[0,1,0], additive=true}) {
    this.ctx=ctx;this.key=key;this.point=new Vector3();this.colors=(colors ?? ['#ffffff']).map(c=>new Color(c));
    while(this.colors.length<3)this.colors.push(this.colors.at(-1));
    this.palettePrimary=null;this.paletteSecondary=null;this.paletteDark=new Color();
    this.rate=rate;this.speed=speed;this.size=size;this.life=life;this.spread=spread;this.radius=radius;
    this.direction=new Vector3(...direction).normalize();this.emitter=new RateEmitter();
    this.system=ctx.particles?.get(`expansion.${key}`,{capacity:480,shape:ParticleShape[shape]??ParticleShape.SOFT,additive,lit:!additive,curl:true,softFade:.3})??null;
    if(this.system && colors?.length) {
      const c=colors.map(x=>new Color(x));while(c.length<4)c.push(c.at(-1));
      this.system.setGradient(c[0],c[1],c[2],c[3]);
    }
  }
  reset(){this.emitter.reset();}
  /** Keep pooled ambient particles and contact cues in sync with the live editor. */
  syncPalette(primary, secondary) {
    if (typeof primary!=='string'||typeof secondary!=='string'||(primary===this.palettePrimary&&secondary===this.paletteSecondary)) return;
    this.palettePrimary=primary;this.paletteSecondary=secondary;
    this.colors[0].set(secondary);this.colors[1].set(primary);this.colors[2].set(primary).multiplyScalar(.35);this.paletteDark.copy(this.colors[2]).multiplyScalar(.4);
    this.system?.setGradient?.(this.colors[0],this.colors[1],this.colors[2],this.paletteDark);
  }
  update(dt, position, rateScale=1) {
    syncParticleGlobals(this.system);
    if(!this.system || !position || !Number.isFinite(dt) || dt<=0)return;
    const n=this.emitter.tick(dt,Math.max(0,Math.min(100,this.rate*rateScale*settings.global.particleCount)));
    if(n)this.system.emit(n,{position,radius:this.radius,direction:this.direction,speed:this.speed,spread:this.spread,size:this.size,life:this.life,spin:2,time:frame.uTime.value});
  }
  /** Bounded one-shot emission for an accepted spell-specific event. */
  burst(position, count, {radius=.5, speed=1, size=.12, life=1, spread=.8}={}) {
    syncParticleGlobals(this.system);
    if (!this.system || !position || !Number.isFinite(count)) return;
    if (Array.isArray(position)) this.point.fromArray(position); else this.point.copy(position);
    const scaled=Math.max(0,Math.min(48,Math.round(count*settings.global.particleCount)));if(!scaled)return;
    this.system.emit(scaled, {position:this.point,radius:Math.max(0,Math.min(5,radius)),direction:this.direction,speed,spread,size,life,spin:2,time:frame.uTime.value});
  }
  /** One bounded contact beat, issued only by the owning cast's accepted event. */
  cue(position, radius=1.5) {
    if (!position) return;
    if(Array.isArray(position))this.point.fromArray(position);else this.point.copy(position);
    const r=Math.max(.2,Math.min(5,Number.isFinite(radius)?radius:1.5));
    const modes={cosmic:BurstMode.STORM,poison:BurstMode.AIR,shadow:BurstMode.AIR,light:BurstMode.STORM,holy:BurstMode.AIR,gravity:BurstMode.EARTH,void:BurstMode.AIR};
    const marks={cosmic:DecalType.ARC,poison:DecalType.DUSTRING,shadow:DecalType.SHOCKWAVE,light:DecalType.ARC,holy:DecalType.SHOCKWAVE,gravity:DecalType.CRACK,void:DecalType.SHOCKWAVE};
    this.ctx.bursts?.spawn(modes[this.key]??BurstMode.AIR,this.point,{radius:.12,endRadius:r,life:.55,intensity:.55,opacity:.6,colorA:this.colors[0],colorB:this.colors[1],colorC:this.colors[2]});
    this.ctx.decals?.spawn(marks[this.key]??DecalType.SHOCKWAVE,this.point,{radius:r,life:.7,intensity:.65,width:.06,colorA:this.colors[0],colorB:this.colors[1]});
  }
}

/** A reduced-motion user still gets gameplay timing, with ambient motion held. */
export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Common live cast and color controls; spell-specific geometry stays in its own folder. */
export function addCommonEditorControls(folder, c, Editor) {
  if(typeof c.castAnim==='string'){if(Editor?.castAnimation) Editor.castAnimation(folder,c);else folder.add(c,'castAnim',CAST_ANIMATIONS);}
  const entries=[['range',1,48,.1],['minRange',0,20,.1],['speed',1,60,.1],['cooldown',0,30,.1],['fade',.1,5,.1],['particleRate',0,100,1],['particleSize',.02,.5,.01],['lightIntensity',0,30,.1],['lightRadius',1,40,.1],['hitImpulse',0,24,.1],['hitLift',0,20,.1],['hitSpin',0,8,.05]];
  for(const [key,min,max,step] of entries) if(typeof c[key]==='number') folder.add(c,key,min,max,step);
  for(const [key,value] of Object.entries(c)) if(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)) folder.addColor(c,key);
}
