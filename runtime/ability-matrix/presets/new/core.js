import * as THREE from 'three';
import {TAU,clamp01,smooth,easeOut,fadeEnvelope,glow,solid,ring,line,spark,particleCloud,runeDisk,energyMaterial,humanoid,ribbon,setAlpha} from './kit.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const UP=V(0,1,0);
function scheduler(emit,events,duration){let cursor=0;return t=>{while(cursor<events.length&&t>=events[cursor].at*duration){const e=events[cursor++];emit(e.type,{time:e.at*duration,...e.payload});}};}
function localRoot(group,point){const root=new THREE.Group();root.position.copy(point);group.add(root);return root;}
function heading(origin,target){const f=target.clone().sub(origin);f.y=0;if(f.lengthSq()<.0001)f.set(0,0,-1);f.normalize();return {f,side:V().crossVectors(f,UP).normalize()};}
function shaderTime(object,t,alpha){object.traverse(o=>{if(o.material?.uniforms?.uTime)o.material.uniforms.uTime.value=t;if(o.material?.uniforms?.uAlpha)o.material.uniforms.uAlpha.value=alpha;});}
function safeTargets(params,fallback){return params.targets.length?params.targets.map(p=>p.clone()):fallback;}

/** A time-staggered graph, not a straight lance: four physical relays and branch forks. */
function chainRelay(ctx){
  const {group,origin,target,params,random,emit,camera}=ctx;const duration=params.duration;const {f,side}=heading(origin,target),r=params.radius;
  const source=origin.clone().add(V(0,1.2,0));
  const nodes=safeTargets(params,[target.clone(),target.clone().addScaledVector(side,-r*.8).addScaledVector(f,-.7),target.clone().addScaledVector(side,r*.85).addScaledVector(f,.7),target.clone().addScaledVector(f,r*.9)]).slice(0,5).map(v=>v.add(V(0,1.1,0)));
  const electrode=localRoot(group,source),electrodeCore=spark(electrode,.18,0xe8ffff);
  const coils=[ring(electrode,.3,params.color,.02),ring(electrode,.42,params.color,.015),ring(electrode,.54,0xc8cfff,.009)];coils[1].rotation.x=.4;coils[2].rotation.z=.9;
  const corona=[];const arcs=[];
  for(let i=0;i<nodes.length;i++){
    const root=localRoot(group,nodes[i]);const ball=spark(root,.11,0xeaffff);const hoops=[];
    for(let j=0;j<3;j++){const m=ring(root,.32+j*.09,params.color,.016);m.rotation.set(j*.8,j*.8,j*.6);hoops.push(m);}
    const ground=localRoot(group,nodes[i].clone().setY(target.y+.06));const glyph=runeDisk(ground,.65,params.color);
    const points=particleCloud(root,48,params.color,random);corona.push({root,ball,hoops,glyph,points});
    const from=i===0?source:nodes[i-1],to=nodes[i];const samples=Array.from({length:37},(_,k)=>from.clone().lerp(to,k/36));
    const halo=ribbon(group,samples,params.color,.14);const core=ribbon(group,samples,0xecffff,.026);
    arcs.push({from,to,samples,halo,core,offset:random()*100,at:.1+i*.105});
    // Each relay forks to a second tapered filament with independent phase.
    for(let b=0;b<2;b++){
      const end=to.clone().add(V((random()-.5)*1.9,random()*.9,(random()-.5)*1.9));
      const pts=Array.from({length:15},(_,k)=>to.clone().lerp(end,k/14));const fork=ribbon(group,pts,params.color,.026);
      arcs.push({from:to,to:end,samples:pts,halo:fork,core:null,offset:random()*100,at:.135+i*.105,branch:true});
    }
  }
  const events=nodes.map((node,i)=>({at:.19+i*.105,type:'damage',payload:{position:node.toArray(),radius:.85,amount:22*params.power,targetIndex:i,mechanic:'chain'}}));events.push({at:.71,type:'status',payload:{position:target.toArray(),radius:r,status:'conductive',duration:2,stacks:nodes.length}});
  const schedule=scheduler(emit,events,duration);
  return {duration,update(t){schedule(t);const n=t/duration,fade=fadeEnvelope(t,duration,.16,.6);electrodeCore.scale.setScalar((.65+Math.sin(t*24)*.2)*fade);coils.forEach((c,i)=>{c.rotation.y=t*(1+i*.7);c.material.opacity=fade;});
    for(const arc of arcs){const reveal=clamp01((n-arc.at)*13);const sustain=clamp01((.9-n)*8);const pulse=.55+.45*Math.pow(Math.sin(t*28+arc.offset),2);const alpha=reveal*sustain*fade*pulse;const flash=n>.69&&n<.79?1.8:1;
      for(let k=0;k<arc.samples.length;k++){const u=k/(arc.samples.length-1),q=Math.min(u,reveal),j=Math.sin(q*Math.PI)*(.16+(arc.branch?.04:0));arc.samples[k].copy(arc.from).lerp(arc.to,q);arc.samples[k].addScaledVector(side,Math.sin(k*7.2+Math.floor(t*19)*2.7+arc.offset)*j);arc.samples[k].y+=Math.cos(k*5.8+Math.floor(t*24)+arc.offset)*j;}
      arc.halo.update(arc.samples,camera);arc.halo.material.uniforms.uAlpha.value=alpha*.65*flash;if(arc.core){arc.core.update(arc.samples,camera);arc.core.material.uniforms.uAlpha.value=alpha*flash;}
    }
    corona.forEach((c,i)=>{const age=clamp01((n-(.15+i*.105))*11)*fade;c.root.scale.setScalar(Math.max(.001,age));c.ball.rotation.set(t*7,t*6,0);c.ball.scale.setScalar(1+Math.sin(t*21)*.2);c.hoops.forEach((h,j)=>{h.rotation.y=t*(j+1);h.rotation.z=t*(1.2-j);h.material.opacity=age*.55;});c.glyph.material.uniforms.uTime.value=t;c.glyph.material.uniforms.uAlpha.value=age;c.points.setOpacity(age);c.points.updatePositions((p,o,k,s)=>{const q=(t*.75+s[k*4])%1,a=s[k*4+1]*TAU,rr=q*.9;p[o]=Math.cos(a)*rr;p[o+1]=(s[k*4+2]-.5)*rr*1.5;p[o+2]=Math.sin(a)*rr;});});
  }};
}

/** Recorded locomotion, a frozen pose stack, reverse playback, and clock mechanism. */
function temporalRewind(ctx){
 const {group,origin,target,params,random,emit}=ctx;const duration=params.duration,{f,side}=heading(origin,target),r=params.radius;
 const path=new THREE.CatmullRomCurve3([origin.clone(),origin.clone().lerp(target,.3).addScaledVector(side,r*.65),origin.clone().lerp(target,.7).addScaledVector(side,-r*.4),target.clone()]);
 const guide=line(group,path.getPoints(72).map(p=>p.add(V(0,.06,0))),params.color,.35);
 const runner=humanoid(group,params.color,1.9);const echoes=[];
 for(let i=0;i<7;i++){const pose=humanoid(group,i%2?0xb8f6ff:params.color,1.9);pose.root.position.copy(path.getPoint(i/6));pose.root.rotation.y=Math.atan2(f.x,f.z);echoes.push(pose);}
 const clockRoot=localRoot(group,target.clone().add(V(0,1.8,0)));clockRoot.rotation.y=Math.atan2(f.x,f.z);const clockFace=new THREE.Group();clockRoot.add(clockFace);clockFace.rotation.x=Math.PI/2;
 const rim=ring(clockFace,1.05,params.color,.035);const inner=ring(clockFace,.92,0xfff1be,.013);
 const ticks=[];for(let i=0;i<24;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(i%2?.026:.04,.014,i%2?.09:.16),glow(params.color));const a=i/24*TAU;m.position.set(Math.sin(a),0,Math.cos(a));m.rotation.y=a;clockFace.add(m);ticks.push(m);}
 const hands=[];for(let i=0;i<2;i++){const pivot=new THREE.Group();const hand=new THREE.Mesh(new THREE.BoxGeometry(.035,.03,i?.58:.8),glow(0xfff1be));hand.position.z=(i?.58:.8)/2;pivot.add(hand);clockFace.add(pivot);hands.push(pivot);}
 const anchor=localRoot(group,origin);const glyph=runeDisk(anchor,1.15,params.color);const sand=particleCloud(group,220,params.color,random);
 // An actual hourglass: two opposing faceted glass chambers inside a brass frame.
 const hourglass=localRoot(group,target.clone().add(V(0,2.9,0)));const glass=energyMaterial(0xffe4b1,{opacity:.7,grid:.2,solidCore:.08});
 for(const sign of [-1,1]){const cone=new THREE.Mesh(new THREE.ConeGeometry(.26,.45,12,1,true),glass);cone.position.y=sign*.225;cone.rotation.z=sign<0?0:Math.PI;hourglass.add(cone);const cap=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.05,12),solid(0xc4a154,{emissive:0x614318,emissiveIntensity:.6}));cap.position.y=sign*.47;hourglass.add(cap);}
 for(let i=0;i<4;i++){const a=i/4*TAU;const rod=new THREE.Mesh(new THREE.CylinderGeometry(.016,.016,.92,5),solid(0xe2bd72));rod.position.set(Math.cos(a)*.29,0,Math.sin(a)*.29);hourglass.add(rod);}
 const schedule=scheduler(emit,[{at:.08,type:'status',payload:{position:origin.toArray(),status:'temporal-anchor',duration:duration*.8,radius:.8}},{at:.45,type:'status',payload:{position:target.toArray(),status:'recorded-echo',duration:duration*.15,radius:1}},{at:.87,type:'teleport',payload:{position:origin.toArray(),from:target.toArray(),to:origin.toArray(),mechanic:'rewind',path:path.getPoints(12).map(p=>p.toArray())}}],duration);
 return {duration,update(t){schedule(t);const n=t/duration,fade=fadeEnvelope(t,duration,.25,.6),progress=n<.43?smooth(n/.43):1-smooth((n-.56)/.31);runner.root.position.copy(path.getPoint(clamp01(progress)));runner.root.rotation.y=Math.atan2(f.x,f.z)+(n>.56?Math.PI:0);runner.material.uniforms.uTime.value=t;runner.material.uniforms.uAlpha.value=fade;
 echoes.forEach((echo,i)=>{const at=i/6;const visible=n<.5?progress>=at:n>.56?at<=progress+.04:true;echo.root.visible=visible;echo.material.uniforms.uAlpha.value=(.18+(n>.43&&n<.56?.25:0))*fade;echo.material.uniforms.uTime.value=t;echo.root.rotation.z=Math.sin(i+t)*.025;});
 clockRoot.scale.setScalar(Math.max(.001,smooth((n-.24)/.16)*fade));clockRoot.rotation.z=Math.sin(t*.5)*.08;hands[0].rotation.y=(n>.56?-t*4:t*4);hands[1].rotation.y=(n>.56?-t*1.7:t*1.7);rim.material.opacity=fade;inner.material.opacity=fade*.6;ticks.forEach((m,i)=>m.material.opacity=(.4+.6*Math.pow(Math.sin(t*3+i*.2),2))*fade);
 glyph.material.uniforms.uTime.value=n>.56?-t:t;glyph.material.uniforms.uAlpha.value=fade;guide.material.opacity=fade*.5;hourglass.rotation.y=t*.7;hourglass.rotation.z=smooth((n-.5)/.18)*Math.PI;hourglass.scale.setScalar(fade);glass.uniforms.uTime.value=t;
 sand.setOpacity(fade*.85);sand.updatePositions((p,o,i,s)=>{const q=(s[i*4]+(n>.56?-t:t)*.16+10)%1;const base=path.getPoint(q);const a=s[i*4+1]*TAU+t*.6;const rr=.15+s[i*4+2]*.4;p[o]=base.x+Math.cos(a)*rr;p[o+1]=base.y+.15+s[i*4+3]*2;p[o+2]=base.z+Math.sin(a)*rr;});
 }};
}

/** Two separately articulated iris gates joined by a transient transport stream. */
function blinkCorridor(ctx){
 const {group,origin,target,params,random,emit}=ctx;const duration=params.duration,{f,side}=heading(origin,target);
 const portalMaterial=(color)=>new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color(color)},uTime:{value:0},uAlpha:{value:1}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;uniform vec3 uColor;uniform float uTime,uAlpha;void main(){vec2 p=(vUv-.5)*2.;float r=length(p),a=atan(p.y,p.x);float edge=1.-smoothstep(.8,1.,r);float spiral=pow(.5+.5*sin(a*7.-r*22.+uTime*5.),4.);float rings=pow(.5+.5*cos(r*45.-uTime*3.),15.);float rim=exp(-abs(r-.9)*60.);float alpha=(spiral*.28+rings*.13+rim*.9+.06)*edge*uAlpha;if(r>1.)discard;gl_FragColor=vec4(uColor*(.4+rim*2.),alpha);}`,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
 const portals=[];
 for(let k=0;k<2;k++){const pos=(k?target:origin).clone().add(V(0,1.25,0));const root=localRoot(group,pos);root.rotation.y=Math.atan2(f.x,f.z);root.scale.set(.85,1.25,1);const surface=new THREE.Mesh(new THREE.CircleGeometry(.95,80),portalMaterial(k?0xf1c0ff:params.color));root.add(surface);const frame=new THREE.Group();root.add(frame);const blades=[];
   for(let i=0;i<12;i++){const pivot=new THREE.Group();const a=i/12*TAU;pivot.position.set(Math.cos(a)*1.04,Math.sin(a)*1.04,0);pivot.rotation.z=a;const blade=new THREE.Mesh(new THREE.BoxGeometry(.42,.15,.12),solid(0x3a405c,{emissive:new THREE.Color(k?0x9936a7:0x445faa),emissiveIntensity:.55,metalness:.85}));blade.rotation.z=.5;pivot.add(blade);const inlay=new THREE.Mesh(new THREE.BoxGeometry(.29,.023,.13),glow(k?0xf1b5ff:params.color));inlay.position.y=.04;pivot.add(inlay);frame.add(pivot);blades.push(pivot);}
   const rims=[];for(let j=0;j<3;j++){const torus=new THREE.Mesh(new THREE.TorusGeometry(1+j*.065,.017,6,80),glow(k?0xf1b5ff:params.color));root.add(torus);rims.push(torus);}
   const ground=localRoot(group,k?target:origin);const rune=runeDisk(ground,1.3,k?0xf1b5ff:params.color);portals.push({root,surface,frame,blades,rims,rune});
 }
 const entry=humanoid(group,params.color),exit=humanoid(group,0xefb3ff);entry.root.position.copy(origin);exit.root.position.copy(target);
 const transport=new THREE.InstancedMesh(new THREE.BoxGeometry(.08,.08,.16),glow(0xe0d9ff),96);transport.frustumCulled=false;group.add(transport);const seeds=Array.from({length:96},()=>[random(),random(),random()]);const dummy=new THREE.Object3D();
 const track=new THREE.CatmullRomCurve3([origin.clone().add(V(0,1.25,0)),origin.clone().lerp(target,.4).add(V(0,1.9,0)).addScaledVector(side,.5),target.clone().add(V(0,1.25,0))]);
 const tracers=Array.from({length:3},(_,i)=>{const points=track.getPoints(50);points.forEach((p,j)=>p.addScaledVector(side,Math.sin(j*.3+i*TAU/3)*.18));return line(group,points,i?0xd7b8ff:params.color,.4);});
 const schedule=scheduler(emit,[{at:.28,type:'status',payload:{position:origin.toArray(),status:'phased',duration:duration*.26,radius:1}},{at:.56,type:'teleport',payload:{position:target.toArray(),from:origin.toArray(),to:target.toArray(),mechanic:'blink'}},{at:.62,type:'knockback',payload:{position:target.toArray(),radius:params.radius*.6,amount:2*params.power,direction:f.toArray()}}],duration);
 return {duration,update(t){schedule(t);const n=t/duration,fade=fadeEnvelope(t,duration,.35,.6);portals.forEach((p,k)=>{const open=smooth((n-k*.05)/.2)*fade;p.root.scale.set(.85*open,1.25*open,Math.max(.001,open));p.surface.material.uniforms.uTime.value=t*(k?-1:1);p.surface.material.uniforms.uAlpha.value=open;p.frame.rotation.z=t*(k?-.25:.25);p.blades.forEach((b,i)=>{const a=i/12*TAU;b.position.set(Math.cos(a)*(1.04+(1-open)*.5),Math.sin(a)*(1.04+(1-open)*.5),Math.sin(t*2+i*.5)*.025);b.rotation.z=a+(1-open)*.9;});p.rims.forEach((m,j)=>{m.material.opacity=open*(j?.5:1);m.rotation.z=t*(j-1);});p.rune.material.uniforms.uTime.value=t;p.rune.material.uniforms.uAlpha.value=open*.6;});
 const entryAlpha=smooth(n/.15)*(1-smooth((n-.29)/.15))*fade,exitAlpha=smooth((n-.52)/.18)*fade;entry.material.uniforms.uAlpha.value=entryAlpha;exit.material.uniforms.uAlpha.value=exitAlpha;entry.material.uniforms.uTime.value=t*4;exit.material.uniforms.uTime.value=-t*4;entry.root.scale.x=entry.root.scale.z=1-smooth((n-.31)/.13)*.9;exit.root.scale.y=Math.max(.01,smooth((n-.5)/.2));
 const transportAlpha=smooth((n-.25)/.1)*(1-smooth((n-.62)/.16));transport.material.opacity=transportAlpha;
 for(let i=0;i<96;i++){const s=seeds[i],q=clamp01((n-.27)*2.8-s[0]*.35),p=track.getPoint(q);const radius=Math.sin(q*Math.PI)*(.2+s[1]*.4);dummy.position.copy(p).addScaledVector(side,Math.cos(s[2]*TAU+t*4)*radius);dummy.position.y+=Math.sin(s[2]*TAU+t*4)*radius;dummy.rotation.set(t*3+s[0],t*5,s[2]*TAU);dummy.scale.setScalar(transportAlpha);dummy.updateMatrix();transport.setMatrixAt(i,dummy.matrix);}transport.instanceMatrix.needsUpdate=true;tracers.forEach(l=>l.material.opacity=transportAlpha*.27);
 }};
}

/** Real multi-bank trajectory followed by a curved homing return, with a toothed silhouette. */
function ricochetChakram(ctx){
 const {group,origin,target,params,random,emit,camera}=ctx;const duration=params.duration,{f,side}=heading(origin,target),r=params.radius;
 const hand=origin.clone().add(V(0,1.25,0));const banks=safeTargets(params,[target.clone().addScaledVector(side,-r*.7),target.clone().addScaledVector(side,r*.9).addScaledVector(f,r*.5),target.clone().addScaledVector(f,-r*.5)]).slice(0,5).map(p=>p.add(V(0,1.15,0)));const route=[hand,...banks];
 const disc=localRoot(group,hand);const body=new THREE.Mesh(new THREE.TorusGeometry(.42,.065,5,32),solid(0xe0bf6e,{metalness:.95,roughness:.2,emissive:0x614819,emissiveIntensity:.4}));body.rotation.x=Math.PI/2;disc.add(body);
 const hoop=ring(disc,.32,params.color,.018);const halo=ring(disc,.53,params.color,.009);const center=spark(disc,.14,0xfff6ce);
 for(let i=0;i<10;i++){const a=i/10*TAU;const shape=new THREE.Shape();shape.moveTo(.25,-.06);shape.lineTo(.73,-.01);shape.lineTo(.48,.17);shape.lineTo(.28,.08);shape.closePath();const tooth=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:false}),solid(i%2?0x8b6d3e:0xd6c79b,{metalness:.9,roughness:.25}));tooth.rotation.x=Math.PI/2;tooth.rotation.z=a;disc.add(tooth);}
 const guides=[];for(let i=1;i<route.length;i++){const pts=[route[i-1].clone().setY(.06),route[i].clone().setY(.06)];const guide=line(group,pts,params.color,.15);guides.push(guide);}
 const marks=banks.map(p=>{const root=localRoot(group,p.clone().setY(.045));return {root,glyph:runeDisk(root,.7,params.color),pulse:ring(root,.55,params.color,.025)};});
 const trailSamples=Array.from({length:40},()=>hand.clone()),trail=ribbon(group,trailSamples,params.color,.11);const particles=particleCloud(group,140,params.color,random);
 const returnPath=new THREE.CatmullRomCurve3([banks.at(-1),banks.at(-1).clone().lerp(hand,.4).addScaledVector(side,-r).add(V(0,.9,0)),hand]);
 function point(n){if(n<.12)return hand.clone();if(n<.66){const q=clamp01((n-.12)/.54)*banks.length,i=Math.min(banks.length-1,Math.floor(q));return route[i].clone().lerp(route[i+1],Math.min(1,q-i));}return returnPath.getPoint(smooth((n-.66)/.23));}
 const events=banks.map((p,i)=>({at:.12+.54*(i+1)/banks.length,type:'damage',payload:{position:p.toArray(),radius:.75,amount:28*params.power,targetIndex:i,mechanic:'ricochet'}}));events.push({at:.89,type:'status',payload:{position:origin.toArray(),radius:.8,status:'projectile-recovered',duration:0}});const schedule=scheduler(emit,events,duration);
 return {duration,update(t){schedule(t);const n=t/duration,fade=fadeEnvelope(t,duration,.15,.5),pos=point(n);disc.position.copy(pos);disc.rotation.y=t*16;disc.rotation.z=Math.sin(t*8)*.18;disc.scale.setScalar(smooth(n/.12)*(1-smooth((n-.9)/.1)));hoop.material.opacity=fade;halo.material.opacity=.65*fade;center.rotation.x=t*9;
 for(let i=0;i<trailSamples.length;i++)trailSamples[i].copy(point(Math.max(.12,n-(1-i/39)*.09)));trail.update(trailSamples,camera);trail.material.uniforms.uAlpha.value=fade*.7;
 marks.forEach((m,i)=>{const at=.12+.54*(i+1)/banks.length,age=(n-at)/.22;const active=age>=0&&age<1;m.glyph.material.uniforms.uAlpha.value=active?(1-age)*fade:0;m.glyph.material.uniforms.uTime.value=t;m.pulse.visible=active;m.pulse.scale.setScalar(.5+Math.max(0,age)*2.8);m.pulse.material.opacity=active?(1-age)*fade:0;});guides.forEach((g,i)=>g.material.opacity=(n<.12?.5:.12)*fade);
 particles.setOpacity(fade*.8);particles.updatePositions((p,o,i,s)=>{const age=s[i*4]*.13,prev=point(Math.max(.12,n-age)),scatter=age*5;p[o]=prev.x+(s[i*4+1]-.5)*scatter;p[o+1]=prev.y+(s[i*4+2]-.5)*scatter;p[o+2]=prev.z+(s[i*4+3]-.5)*scatter;});
 }};
}

/** A shield that catches a visible projectile, compresses, and returns its energy. */
function kineticParry(ctx){
 const {group,origin,target,params,random,emit,camera}=ctx;const duration=params.duration,{f,side}=heading(origin,target);const center=origin.clone().addScaledVector(f,1.1).add(V(0,1.3,0));const root=localRoot(group,center);root.rotation.y=Math.atan2(f.x,f.z);
 const shell=new THREE.Mesh(new THREE.SphereGeometry(1.12,36,20,0,Math.PI),energyMaterial(params.color,{opacity:.45,grid:.8,solidCore:.02}));shell.rotation.y=Math.PI/2;root.add(shell);
 const plates=[];const shape=new THREE.Shape();for(let i=0;i<6;i++){const a=i/6*TAU;const x=Math.cos(a)*.4,y=Math.sin(a)*.4;i?shape.lineTo(x,y):shape.moveTo(x,y);}shape.closePath();
 for(let i=0;i<7;i++){const a=(i-1)/6*TAU,x=i?Math.cos(a)*.68:0,y=i?Math.sin(a)*.68:0;const plate=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.06,bevelEnabled:true,bevelSize:.025,bevelThickness:.015,bevelSegments:1,steps:1}),solid(0x334e70,{metalness:.9,roughness:.21,emissive:0x3677bb,emissiveIntensity:.22}));plate.position.set(x,y,0);root.add(plate);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(plate.geometry),new THREE.LineBasicMaterial({color:params.color,transparent:true,opacity:1,blending:THREE.AdditiveBlending}));plate.add(edges);plates.push({plate,x,y,edges});}
 const rim=new THREE.Mesh(new THREE.TorusGeometry(1.2,.025,8,72),glow(params.color));root.add(rim);
 const source=target.clone().add(V(0,1.3,0));const incoming=spark(group,.2,0xffb57b);const boltSamples=Array.from({length:24},()=>source.clone());const bolt=ribbon(group,boltSamples,0xffab68,.11);
 const reflected=spark(group,.28,0xe5faff);const counterSamples=Array.from({length:32},()=>center.clone());const counter=ribbon(group,counterSamples,params.color,.16);
 const waves=[];for(let i=0;i<3;i++){const wave=new THREE.Mesh(new THREE.TorusGeometry(.65,.033,7,72,Math.PI*1.45),glow(params.color));wave.rotation.y=Math.atan2(f.x,f.z);group.add(wave);waves.push(wave);}
 const particles=particleCloud(group,180,params.color,random);const floor=localRoot(group,origin);const glyph=runeDisk(floor,1.7,params.color);
 const schedule=scheduler(emit,[{at:.12,type:'status',payload:{position:origin.toArray(),radius:1.5,status:'parry-window',duration:duration*.22}},{at:.34,type:'status',payload:{position:center.toArray(),radius:1.1,status:'projectile-reflected',duration:duration*.25}},{at:.75,type:'damage',payload:{position:target.toArray(),radius:params.radius*.6,amount:40*params.power,mechanic:'reflected-impact'}},{at:.75,type:'knockback',payload:{position:target.toArray(),radius:params.radius*.6,amount:5*params.power,direction:f.toArray()}}],duration);
 return {duration,update(t){schedule(t);const n=t/duration,fade=fadeEnvelope(t,duration,.24,.55),build=smooth(n/.15),recoil=Math.exp(-Math.pow((n-.35)*25,2));root.position.copy(center).addScaledVector(f,-recoil*.28);root.scale.setScalar(build*(1-smooth((n-.68)/.2)));root.rotation.z=recoil*.13;shaderTime(shell,t,.55*fade+recoil*.45);rim.material.opacity=fade*(.7+recoil);
 plates.forEach(({plate,x,y,edges},i)=>{const absorb=smooth((n-.34)/.16),release=smooth((n-.53)/.15);plate.position.set(x*(1+absorb*.18+release*.4),y*(1+absorb*.18+release*.4),recoil*(i?.12:-.2));plate.rotation.z=release*(i%2?.5:-.5);plate.material.emissiveIntensity=.2+recoil*1.8+absorb*.5;edges.material.opacity=fade;});
 const incomingProgress=clamp01((n-.12)/.22);incoming.position.copy(source).lerp(center,incomingProgress);incoming.scale.setScalar(n<.34?build:0);incoming.rotation.set(t*9,t*12,0);
 for(let i=0;i<24;i++){const q=clamp01(incomingProgress-(1-i/23)*.16);boltSamples[i].copy(source).lerp(center,q);}bolt.update(boltSamples,camera);bolt.material.uniforms.uAlpha.value=n<.34?build*.8:0;
 const ret=clamp01((n-.52)/.23);reflected.position.copy(center).lerp(source,ret);reflected.scale.setScalar(n>=.52&&n<.78?1:0);reflected.rotation.set(t*14,t*8,0);for(let i=0;i<32;i++){const q=clamp01(ret-(1-i/31)*.2);counterSamples[i].copy(center).lerp(source,q);}counter.update(counterSamples,camera);counter.material.uniforms.uAlpha.value=n>=.52&&n<.8?fade:0;
 waves.forEach((w,i)=>{const q=clamp01((n-.53-i*.045)/.27),visible=n>.53+i*.045&&q<1;w.visible=visible;w.position.copy(center).lerp(source,q);w.scale.setScalar(.5+q*params.radius*.8);w.material.opacity=(1-q)*fade;w.rotation.z=t*(i%2?-1:1);});glyph.material.uniforms.uTime.value=t;glyph.material.uniforms.uAlpha.value=fade*.5;
 const burst=clamp01((n-.34)/.24);particles.setOpacity(n>.34?(1-burst)*fade:0);particles.updatePositions((p,o,i,s)=>{const a=s[i*4]*TAU,rr=burst*(.5+s[i*4+1]*2);p[o]=center.x+side.x*Math.cos(a)*rr-f.x*burst*.4;p[o+1]=center.y+Math.sin(a)*rr;p[o+2]=center.z+side.z*Math.cos(a)*rr-f.z*burst*.4;});
 }};
}
export const CORE_FACTORIES={'chain-relay':chainRelay,'temporal-rewind':temporalRewind,'blink-corridor':blinkCorridor,'ricochet-chakram':ricochetChakram,'kinetic-parry':kineticParry};
