/** Asset-free effect primitives. Every resource belongs to the supplied parent. */
import * as THREE from 'three';
export const TAU = Math.PI * 2;
export const clamp01 = x => Math.max(0, Math.min(1, x));
export const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);
export const fadeEnvelope = (t, duration, attack = .25, release = .6) => Math.min(smooth(t / attack), smooth((duration - t) / release));
export function seededRandom(seed) {
  let a = Number(seed) >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({color, opacity, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false});
export const solid = (color, options = {}) => new THREE.MeshStandardMaterial({color, roughness:.28, metalness:.65, ...options});
export function ring(parent, radius, color, width = .035) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(radius, width, 6, 96), glow(color));
  m.rotation.x = Math.PI / 2; parent.add(m); return m;
}
export function line(parent, points, color, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({color, opacity, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, toneMapped:false});
  const object = new THREE.Line(geometry, material); object.frustumCulled=false; parent.add(object); return object;
}
export function tube(parent, points, color, radius = .035, segments = 32) {
  const curve = new THREE.CatmullRomCurve3(points);
  const object = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 5, false), glow(color));
  parent.add(object); return object;
}
export function spark(parent, radius, color) {
  const object = new THREE.Mesh(new THREE.OctahedronGeometry(radius, 0), glow(color)); parent.add(object); return object;
}
export function setAlpha(group, alpha) {
  group.traverse(object => {
    if (!object.material) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material.userData.originalOpacity) material.userData.originalOpacity = material.opacity || 1;
      material.transparent = true; material.opacity = material.userData.originalOpacity * alpha;
      if (material.uniforms?.uAlpha) material.uniforms.uAlpha.value = alpha;
    }
  });
}

/** Screen-size limited, procedural soft / star points; no texture loads. */
export function particleCloud(parent, count, color, random) {
  count = Math.max(1, Math.min(768, Math.round(count)));
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const ages = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let i=0;i<count;i++) { ages[i]=random(); sizes[i]=.035+random()*.075; for(let k=0;k<4;k++) seeds[i*4+k]=random(); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
  const material = new THREE.ShaderMaterial({
    uniforms:{uColor:{value:new THREE.Color(color)},uAlpha:{value:1}},
    vertexShader:`attribute float aSize; varying float vDepth; void main(){vec4 p=modelViewMatrix*vec4(position,1.);vDepth=-p.z; gl_PointSize=clamp(aSize*650./max(1.,-p.z),1.,28.);gl_Position=projectionMatrix*p;}`,
    fragmentShader:`uniform vec3 uColor;uniform float uAlpha;void main(){vec2 p=gl_PointCoord-.5;float r=length(p);float a=exp(-r*r*24.);float core=exp(-r*r*190.);float star=pow(max(0.,1.-min(abs(p.x),abs(p.y))*18.),3.)*exp(-r*9.);float alpha=(a*.55+core+star*.2)*uAlpha;if(alpha<.015)discard;gl_FragColor=vec4(uColor*(1.+core*.8),alpha);}`,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false
  });
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;parent.add(points);
  return {points,positions,ages,seeds,updatePositions(fn){ for(let i=0;i<count;i++)fn(positions,i*3,i,seeds,ages);geometry.attributes.position.needsUpdate=true; },setOpacity(a){material.uniforms.uAlpha.value=a;}};
}

/** Procedural glyphs, concentric broken tracks and a rotating sweep. */
export function runeDisk(parent, radius, color) {
  const material = new THREE.ShaderMaterial({
    uniforms:{uColor:{value:new THREE.Color(color)},uTime:{value:0},uAlpha:{value:1}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`precision highp float; varying vec2 vUv;uniform vec3 uColor;uniform float uTime,uAlpha;
    float band(float x,float c,float w){return 1.-smoothstep(w,w+.008,abs(x-c));}
    void main(){vec2 p=(vUv-.5)*2.;float r=length(p),a=atan(p.y,p.x);float tracks=band(r,.95,.005)+band(r,.85,.003)+band(r,.59,.004);float teeth=band(r,.76,.05)*step(.82,fract(a/6.283185*32.+.5));float dots=band(r,.87,.017)*step(.83,fract(a/6.283185*12.+uTime*.035));float hex=band(r*cos(mod(a+3.14159/6.,3.14159/3.)-3.14159/6.),.48,.004);float sweep=pow(max(0.,cos(a-uTime*.7)),36.)*band(r,.71,.2)*.16;float energy=tracks*.45+teeth*.6+dots+hex*.4+sweep; if(r>1.||energy<.01)discard;gl_FragColor=vec4(uColor,energy*uAlpha);}`,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false
  });
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(radius*2,radius*2),material);mesh.rotation.x=-Math.PI/2;mesh.position.y=.035;parent.add(mesh);return mesh;
}

/** Fresnel + scrolling grid. Useful on time fields, shield arcs and holograms. */
export function energyMaterial(color,{opacity=.5,grid=0,solidCore=0}={}) {
  return new THREE.ShaderMaterial({
    uniforms:{uColor:{value:new THREE.Color(color)},uTime:{value:0},uAlpha:{value:opacity},uGrid:{value:grid},uCore:{value:solidCore}},
    vertexShader:`varying vec3 vNormal,vView,vPos;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-mv.xyz);vPos=position;gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform vec3 uColor;uniform float uTime,uAlpha,uGrid,uCore;varying vec3 vNormal,vView,vPos;void main(){float f=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.4);float scan=pow(max(0.,sin(vPos.y*25.-uTime*4.)),16.);float grid=pow(max(0.,cos(vPos.x*18.)),30.)+pow(max(0.,cos(vPos.z*18.)),30.);float a=(f*.9+scan*.09+grid*uGrid*.13+uCore)*uAlpha;gl_FragColor=vec4(uColor*(.8+f*.5),a);}`,
    transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false
  });
}

export function humanoid(parent,color,height=1.9) {
  const root=new THREE.Group(); const material=energyMaterial(color,{opacity:.85,grid:.8,solidCore:.08});
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.23,.53,4,8),material);torso.position.y=.99;root.add(torso);
  const head=new THREE.Mesh(new THREE.IcosahedronGeometry(.205,1),material);head.position.y=1.65;root.add(head);
  for (const side of [-1,1]) {
    const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.08,.56,4,6),material);arm.position.set(side*.34,1.02,0);arm.rotation.z=side*.22;root.add(arm);
    const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.65,4,6),material);leg.position.set(side*.145,.43,0);leg.rotation.z=side*.07;root.add(leg);
  }
  root.scale.setScalar(height/1.9);parent.add(root);return {root,material};
}

/** Camera-facing ribbon between a chain of world-space samples, with soft edge shader. */
export function ribbon(parent, samples, color, width = .06) {
  const count=samples.length;
  const positions=new Float32Array(count*6),uvs=new Float32Array(count*4),indices=[];
  for(let i=0;i<count;i++){uvs.set([i/(count-1),0,i/(count-1),1],i*4);if(i<count-1){let n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geo.setIndex(indices);
  const material=new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color(color)},uAlpha:{value:1}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;uniform vec3 uColor;uniform float uAlpha;void main(){float e=abs(vUv.y-.5)*2.;float a=pow(1.-e,1.8);float tip=smoothstep(0.,.025,vUv.x)*(1.-smoothstep(.97,1.,vUv.x));gl_FragColor=vec4(uColor*(1.+pow(1.-e,8.)*.8),a*uAlpha*tip);}`,transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const object=new THREE.Mesh(geo,material);object.frustumCulled=false;parent.add(object);
  const tangent=new THREE.Vector3(),side=new THREE.Vector3();
  function update(points,camera){for(let i=0;i<count;i++){tangent.subVectors(points[Math.min(count-1,i+1)],points[Math.max(0,i-1)]).normalize(); if(camera){side.subVectors(camera.position,points[i]).cross(tangent).normalize();}else side.crossVectors(tangent,new THREE.Vector3(0,1,0)).normalize();if(side.lengthSq()<.01)side.set(1,0,0);side.multiplyScalar(width);positions.set([points[i].x+side.x,points[i].y+side.y,points[i].z+side.z,points[i].x-side.x,points[i].y-side.y,points[i].z-side.z],i*6);}geo.attributes.position.needsUpdate=true;}
  update(samples);return {object,material,update};
}
