import {SurfaceStateManager} from './SurfaceStateManager.mjs';
/** Fits the Helios.registerBiome({...}) build/update convention. `environment` accepts either the legacy
 *  string form ({weather:'rain'|'clear', temperature}) or the engine's numeric env ({rain, fog, temperature, wind, light}). */
export function createBiomeSurfaceLayer(biomeId,options={}){
 const surface=new SurfaceStateManager({biomeId,...options});
 return {surface, update(dt,environment={}){
   const wx=environment.weather??environment.wx;
   if(wx==='rain')surface.setWeather({precipitation:.8});
   else if(wx==='clear')surface.setWeather({precipitation:0});
   if(Number.isFinite(environment.rain))surface.setWeather({precipitation:environment.rain});
   if(Number.isFinite(environment.humidity))surface.setWeather({humidity:environment.humidity});
   if(Number.isFinite(environment.light))surface.setWeather({light:environment.light});
   if(Array.isArray(environment.wind))surface.setWeather({wind:environment.wind});
   if(Number.isFinite(environment.temperature))surface.setWeather({temperature:environment.temperature});
   surface.step(dt);
 }, impact(event){return surface.enqueue(event)}, sample(x,z){return surface.sample(x,z)}, reset(){surface.reset(biomeId)} };
}
