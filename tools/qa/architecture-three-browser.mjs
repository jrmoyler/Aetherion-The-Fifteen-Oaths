// Real WebGL renders of two authored cities using a dedicated Vite dev server.
import { chromium } from '../../game/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const game=fileURLToPath(new URL('../../game/',import.meta.url));
const output=resolve(process.env.EVIDENCE_DIR||'docs/production');
const base=process.env.ARCHITECTURE_URL||'http://127.0.0.1:4188';
let dev,browser;
try {
 if(!process.env.ARCHITECTURE_URL){
  dev=spawn(process.execPath,[resolve(game,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4188','--strictPort'],{cwd:game,stdio:'pipe'});
  await new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(new Error('Vite did not start')),20000);dev.stdout.on('data',data=>{if(data.toString().includes('Local:')){clearTimeout(timer);ok();}});dev.on('error',fail);dev.on('exit',code=>{if(code)fail(new Error(`Vite exited ${code}`));});});
 }
 await mkdir(output,{recursive:true});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/__architecture-review',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"></body></html>'}));
 await page.goto(base+'/__architecture-review');
 await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {buildSanctuaries}=await import('/src/three/worldArchitecture.js');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#b7c5d0');
  scene.add(new THREE.HemisphereLight('#d9ecff','#6d614d',2));
  const sun=new THREE.DirectionalLight('#fff0d2',3);sun.position.set(-80,150,70);scene.add(sun);
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1440,1000);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(48,1.44,.3,3000);
  const cities=buildSanctuaries({scene,quality:{name:'high'},camera});
  window.renderCity=index=>{
   cities.children.forEach((city,i)=>city.visible=i===index);
   const {x,y,z}=cities.children[index].position;camera.position.set(x+160,y+120,z+180);camera.lookAt(x,y+20,z);renderer.render(scene,camera);
   return {city:cities.children[index].name,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
  };
 });
 const frames=[];
 for(const [name,index]of [['lumen',8],['tidal',3]]){frames.push(await page.evaluate(i=>window.renderCity(i),index));await page.screenshot({path:resolve(output,`three-city-${name}.png`)});}
 console.log(JSON.stringify({frames,errors},null,2));if(errors.length)process.exitCode=1;
} finally {await browser?.close();dev?.kill();}
