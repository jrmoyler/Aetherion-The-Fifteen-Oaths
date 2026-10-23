import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
const out=new URL('../../validation/fidelity-pass/',import.meta.url).pathname;await mkdir(out,{recursive:true});
const baseline=process.env.CAPTURE_LABEL==='before';
const baseRef=process.env.FIDELITY_BASE_REF||'HEAD';
const repo=new URL('../../',import.meta.url).pathname;
const originals=new Map();
if(baseline)for(const file of execFileSync('git',['diff',baseRef,'--name-only'],{cwd:repo,encoding:'utf8'}).trim().split('\n'))if(file.startsWith('game/src/')&&file.endsWith('.js'))originals.set(repo+file,execFileSync('git',['show',baseRef+':'+file],{cwd:repo,encoding:'utf8'}));
const server=await createServer({plugins:[{name:'baseline-evidence',enforce:'pre',load(id){return originals.get(id.split('?')[0])??null;}}],root:new URL('../',import.meta.url).pathname,server:{host:'127.0.0.1',port:0,hmr:false,watch:{ignored:['**/*']}}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/tmp/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
 await page.route('**/assets/characters/viewer.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="data:,"></head><body></body></html>'}));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/assets/characters/viewer.html`);
 await page.evaluate(async()=>{
 const T=await import('/node_modules/three/build/three.module.js');const {BodyFactory,loadModel}=await import('/src/three/models.js');
 document.body.replaceChildren();const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1280,800);renderer.toneMapping=T.ACESFilmicToneMapping;document.body.append(renderer.domElement);document.body.style.margin='0';
 const scene=new T.Scene();scene.background=new T.Color('#62696b');scene.add(new T.HemisphereLight(0xdce7f5,0x504337,2));const sun=new T.DirectionalLight(0xffead8,3);sun.position.set(-3,5,5);scene.add(sun);
 const camera=new T.PerspectiveCamera(32,1.6,.01,100);camera.position.set(0,1.7,4.4);camera.lookAt(0,1.05,0);
 const factory=new BodyFactory({quality:{name:'high'}});const bodies=[];
 for(const [i,key] of ['oath-01-sorcerer','oath-03-sorcerer','oath-14-sorcerer'].entries()){const p=new T.Group();p.position.x=(i-1)*.9;scene.add(p);const body=factory.createGltf(await loadModel('/assets/characters/'+key+'.glb'),{oath:key.slice(0,7),cls:'sorcerer'},p);body.animator.update(.01);bodies.push(body);}
 window.__fidelity={renderer,scene,camera,bodies,T,render(){renderer.render(scene,camera)}};window.__fidelity.render();
 });
 await page.screenshot({path:out+(process.env.CAPTURE_LABEL||'after')+'-characters.png'});
 await page.evaluate(()=>{const f=window.__fidelity;f.camera.position.set(-.9,1.52,.65);f.camera.lookAt(-.9,1.52,0);f.render()});
 await page.screenshot({path:out+(process.env.CAPTURE_LABEL||'after')+'-face.png'});
 await writeFile(out+(process.env.CAPTURE_LABEL||'after')+'-errors.json',JSON.stringify(errors,null,2));
 console.log(JSON.stringify({errors,details:await page.evaluate(()=>window.__fidelity.bodies.map(b=>({groom:b.groom?.key,H:b.groom?.H,meshes:b.groom?.meshes.length,head:b.sockets.head?.position.toArray(), skinBounds:new window.__fidelity.T.Box3().setFromObject(b.groom.meshes[0]).getCenter(new window.__fidelity.T.Vector3()).toArray(),bone:b.sockets.head.getWorldPosition(new window.__fidelity.T.Vector3()).toArray(),groomBounds:new window.__fidelity.T.Box3().setFromObject(b.groom.anchor).getSize(new window.__fidelity.T.Vector3()).toArray()})))}));
}finally{await browser.close();await server.close();}
