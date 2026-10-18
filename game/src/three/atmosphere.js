import * as THREE from 'three';
// Official Three.js MIT-licensed Preetham daylight implementation, kept as a package import.
// Upstream: mrdoob/three.js examples/jsm/objects/Sky.js (see dependency LICENSE).
import { Sky } from 'three/addons/objects/Sky.js';
import { regionAt } from '@shared/oaths.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrapHour=h=>((h%24)+24)%24;
export function initAtmosphere(ctx){
  const {scene,bus}=ctx, sun=ctx.render.sun, hemi=ctx.render.hemi;
  const sky=new Sky();sky.name='Preetham atmospheric scattering';sky.scale.setScalar((ctx.camera?.far ?? 1500)*.85);sky.frustumCulled=false;sky.renderOrder=-1000;scene.add(sky);
  const u=sky.material.uniforms;u.rayleigh.value=2.1;u.turbidity.value=3.8;u.mieCoefficient.value=.006;u.mieDirectionalG.value=.82;
  let hour=16.0,scale=1,daySeconds=2400,time=0,manualWeather=false,lastRegion='',kind='clear',intensity=0,disposed=false;
  const initialHour=Number(ctx.params?.get?.('time')),initialScale=Number(ctx.params?.get?.('timescale'));
  if(ctx.params?.has?.('time')&&Number.isFinite(initialHour))hour=wrapHour(initialHour);
  if(ctx.params?.has?.('timescale')&&Number.isFinite(initialScale))scale=clamp(initialScale,0,500);
  const sunOffset=new THREE.Vector3(),direction=new THREE.Vector3(),dayFog=new THREE.Color('#b5c7c4'),nightFog=new THREE.Color('#172435'),sunsetFog=new THREE.Color('#a99583');
  const count=ctx.quality?.name==='low'?180:400,positions=new Float32Array(count*3);
  let seed=16381;const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
  for(let i=0;i<count;i++){positions[i*3]=(random()-.5)*54;positions[i*3+1]=random()*32;positions[i*3+2]=(random()-.5)*54;}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const precipitation=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},strength:{value:0},snow:{value:0},tint:{value:new THREE.Color('#b8cbd4')},gust:{value:0}},
    vertexShader:`uniform float time;uniform float snow;uniform float gust;varying float vFade;
    void main(){vec3 p=position;float speed=mix(16.,1.7,snow);p.y=mod(p.y-time*speed,32.)-4.;p.x+=sin(time*.55+position.z)*snow*.9+gust*p.y*.1;vec4 mv=modelViewMatrix*vec4(p,1.);vFade=smoothstep(0.,3.,p.y+4.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(mix(8.,5.,snow)*20./max(8.,-mv.z),1.,9.);}`,
    fragmentShader:`uniform float strength;uniform float snow;uniform vec3 tint;varying float vFade;
    void main(){vec2 p=gl_PointCoord-.5;float rain=1.-smoothstep(.05,.15,abs(p.x));rain*=1.-smoothstep(.25,.5,abs(p.y));float flake=1.-smoothstep(.12,.48,length(p));float a=mix(rain,flake,snow)*strength*.58*vFade;if(a<.015)discard;gl_FragColor=vec4(tint,a);}`});
  const points=new THREE.Points(geo,precipitation);points.name='Bounded local precipitation';points.frustumCulled=false;points.visible=false;scene.add(points);
  function applyWeather(next,amount){kind=next;intensity=clamp(Number.isFinite(amount)?amount:1,0,1);if(kind==='clear')intensity=0;const snow=kind==='snow'||kind==='ash';points.visible=['rain','storm','snow','ash'].includes(kind)&&intensity>0;precipitation.uniforms.snow.value=snow?1:0;precipitation.uniforms.strength.value=intensity;precipitation.uniforms.tint.value.set(kind==='ash'?'#b3a094':snow?'#e4edf1':'#b8cbd4');bus?.emit('weather',{kind,intensity});bus?.emit('world:weather',{kind,intensity});}
  function setWeather(next,amount=1){if(next==null){manualWeather=false;lastRegion='';return;}manualWeather=true;applyWeather(['rain','storm','snow','ash','fog','mist','clear'].includes(next)?next:'clear',amount);}
  function setTimeOfDay(h){if(Number.isFinite(h))hour=wrapHour(h);}
  function setTimeScale(value){if(Number.isFinite(value))scale=clamp(value,0,500);}
  const offs=[];
  if(bus?.on){offs.push(bus.on('net:snap',snap=>{if(Number.isFinite(snap?.timeOfDay))setTimeOfDay(snap.timeOfDay);}));offs.push(bus.on('net:welcome',welcome=>{if(Number.isFinite(welcome?.world?.timeOfDay))setTimeOfDay(welcome.world.timeOfDay);if(Number.isFinite(welcome?.world?.daySeconds)&&welcome.world.daySeconds>0)daySeconds=welcome.world.daySeconds;}));}
  let weatherClock=0,windClock=0;
  function update(dt){if(disposed)return;const elapsed=clamp(dt||0,0,.25);time+=elapsed;hour=wrapHour(hour+elapsed*24/daySeconds*scale);
    const angle=(hour-6)/24*Math.PI*2;direction.set(Math.cos(angle)*.75,Math.sin(angle),Math.cos(angle)*.5).normalize();u.sunPosition.value.copy(direction);
    sunOffset.copy(direction).multiplyScalar(180);const daylight=THREE.MathUtils.smoothstep(direction.y,-.16,.32),twilight=1-Math.min(1,Math.abs(direction.y)*3);
    sun.intensity=Math.max(0,direction.y)*2.5*(1-intensity*.45);sun.color.setHSL(.10-twilight*.035,.22+twilight*.35,.88);
    hemi.intensity=.22+daylight*.98;hemi.color.setHSL(.58,.23,.38+daylight*.42);hemi.groundColor.setHSL(.09,.19,.12+daylight*.15);
    if(scene.fog){scene.fog.color.copy(nightFog).lerp(dayFog,daylight).lerp(sunsetFog,twilight*daylight*.3);scene.fog.density=.00165+intensity*(kind==='fog'||kind==='mist'?.005:.0014);}
    u.turbidity.value=3.8+intensity*6;u.mieCoefficient.value=.006+intensity*.008;
    const p=ctx.actors?.player?.root?.position||ctx.camera?.position;
    if(p){points.position.copy(p);sky.position.set(p.x,0,p.z);weatherClock+=elapsed;if(!manualWeather&&weatherClock>.8){weatherClock=0;const region=regionAt(p.x,p.z);if(region.id!==lastRegion){lastRegion=region.id;const weather={glacial:['snow',.65],marsh:['mist',.4],volcanic:['ash',.35],alpine:['snow',.2]}[region.biome]||['clear',0];applyWeather(...weather);}}}
    const gust=Math.sin(time*.27)*.5+Math.sin(time*.79)*.2;precipitation.uniforms.time.value=time;precipitation.uniforms.gust.value=gust;
    if(ctx.world?.wind)ctx.world.wind.gust=gust;windClock+=elapsed;if(windClock>=1){windClock=0;bus?.emit('world:wind',{gust,speed:2.5+gust+intensity*3,direction:{x:.8,z:.6}});}
  }
  const stop=ctx.addUpdate?.(update,45);update(0);
  const wx=ctx.params?.get?.('weather');if(wx){const[k,a]=wx.split(',');setWeather(k,a==null?1:Number(a));}
  return {sky,sunOffset,get timeOfDay(){return hour;},get timeScale(){return scale;},get weather(){return{kind,intensity};},setTimeOfDay,setTimeScale,setWeather,update,dispose(){disposed=true;stop?.();offs.forEach(off=>off?.());scene.remove(sky,points);sky.geometry.dispose();sky.material.dispose();geo.dispose();precipitation.dispose();}};
}
