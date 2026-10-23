// Procedural sculpted head. The face is an analytic form evaluated on a dense
// sphere: superelliptic cranium, tapered jaw, then anatomical landmarks
// (brow ridge, orbital sockets, nasal bridge/tip/alae, cheekbones, philtrum,
// lips, mentalis, mandible angle). Eyes are real spheres behind almond lid
// shells, so the aperture, lid thickness and lash line exist as geometry.
// Normalised units: chin -.5 .. crown +.5, +Z forward; built at scale H metres.
import { BufferGeometry, Float32BufferAttribute, SphereGeometry, CylinderGeometry, Vector3, Group, Mesh, Color } from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceMaterial, withSurface } from './surface.js';
import { MeshPhysicalMaterial, DoubleSide } from 'three';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const g2 = (x, y) => Math.exp(-x * x - y * y);

export const EYE = { x: .148, y: -.005, r: .05 };

export function faceParams(profile) {
  const f = profile.sex === 'f', age = profile.age ?? .3, build = profile.build ?? 1;
  return {
    build, age, f,
    jaw: f ? .66 : .74, brow: f ? .45 : 1, nose: f ? .85 : 1, lip: f ? 1.15 : .9, chin: f ? .7 : 1,
    cheek: f ? 1.1 : .9, sag: age, noseWidth: 1, depth: 1, ...profile.face,
  };
}

// Surface point for unit direction d. `opts.cloth` smooths fine features so
// masks and wraps drape over them instead of shrink-wrapping lips and sockets.
export function sculpt(d, P, opts = {}) {
  const vy = Math.max(-1, Math.min(1, d.y)), m = vy > 0 ? 2.12 : 2.25, c = Math.max(0, 1 - Math.abs(vy) ** m) ** (1 / m);
  let hx = d.x, hz = d.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
  const n = 2.08, ex = 2 / n;
  const sx = Math.sign(hx) * Math.abs(hx) ** ex, sz = Math.sign(hz) * Math.abs(hz) ** ex;
  const y = .5 * vy;
  const rx = .338 * P.build * (1 - (1 - P.jaw) * .85 * sm(-.16, -.5, y)) * (1 - .04 * sm(.15, .42, y));
  const rzf = (.4 - .03 * sm(.2, .48, y)) * P.depth;
  const rzb = .44 + .025 * g2((y - .06) / .16, 0) - .2 * sm(-.04, -.45, y);
  let X = c * sx * rx;
  let Z = c * sz * (sz > 0 ? rzf : rzb) + .06 * sm(.04, -.45, y) - .03;
  let Y = y;
  const fr = sm(-.05, .55, sz) * (opts.noFace ? 0 : 1);
  if (fr > 0) {
    const ax = Math.abs(X), sgn = Math.sign(X) || 1, cl = opts.cloth ? 1 : 0;
    let dz = 0, dx = 0;
    // forehead slopes back; brow ridge; temples
    dz -= .025 * sm(.16, .46, Y);
    dz += (.03 + .02 * P.brow) * g2((Y - .075) / .036, 0) * sm(.34, .14, ax) * (1 - cl * .6);
    dx += sgn * .012 * g2((Y - .07) / .05, (ax - .3) / .05);
    dz += .012 * g2((Y - .1) / .03, ax / .06) * (1 - P.f * .5);
    // orbital sockets (shallow under cloth)
    dz -= (opts.noSocket ? 0 : cl ? .008 : .019) * g2((ax - EYE.x) / .092, (Y - EYE.y - .012) / .062);
    // nose
    const yb = .05, yt = -.185;
    let A = 0;
    if (Y <= yb && Y >= yt) A = .01 + .1 * ((yb - Y) / (yb - yt)) ** 1.6;
    else if (Y < yt) A = .11 * Math.exp(-(((Y - yt) / .03) ** 2));
    const W = (.038 + .048 * Math.min(1, Math.max(0, (yb - Y) / (yb - yt)))) * P.noseWidth;
    dz += A * P.nose * Math.exp(-((X / (W * (cl ? 1.9 : 1))) ** 2)) * (cl ? 1.05 : 1);
    dz -= (cl ? 0 : .016) * g2(X / .06, (Y - .05) / .03);
    dz += .022 * g2(X / .04, (Y + .17) / .035) * (1 - cl);
    if (!cl) { const ala = g2((ax - .062 * P.noseWidth) / .03, (Y + .2) / .03); dz += .036 * ala; dx += sgn * .012 * ala; dz -= .02 * g2((ax - .03) / .015, (Y + .222) / .012); }
    // cheekbones and the hollow below them
    const ck = g2((ax - .21) / .075, (Y + .03) / .06); dz += .03 * P.cheek * ck; dx += sgn * .022 * ck;
    dz -= .014 * (.35 + P.sag) * g2((ax - .2) / .06, (Y + .2) / .07) * (1 - cl);
    // muzzle, lips, mouth line
    dz += .042 * g2(X / .16, (Y + .29) / .12);
    if (!cl) {
      dz += .009 * g2(X / .022, (Y + .255) / .025);
      dz += .03 * P.lip * Math.exp(-((X / .088) ** 4)) * Math.exp(-(((Y + .274) / .021) ** 2));
      dz += .033 * P.lip * Math.exp(-((X / .078) ** 4)) * Math.exp(-(((Y + .322) / .023) ** 2));
      dz -= .022 * Math.exp(-((X / .098) ** 4)) * Math.exp(-(((Y + .298) / .0075) ** 2));
      dz -= .012 * g2((ax - .1) / .015, (Y + .3) / .015);
      // nasolabial fold deepens with age
      dz -= .018 * P.sag * g2((ax - .11 - (Y + .17) * -.25) / .012, (Y + .2) / .08);
    }
    // Age-related infraorbital fold and jowl volume are geometry, not painted lines.
    if (!cl) { dz -= .012 * P.sag * g2((ax-.15)/.09,(Y+.072)/.016);
      dx += sgn * .022 * P.sag * g2((ax-.20)/.06,(Y+.31)/.08); }
    // chin and mandible
    dz += .046 * P.chin * g2(X / (.09 + .025 * P.chin), (Y + .42) / .06);
    dx += sgn * (.022 - P.f * .012) * g2((Y + .33) / .07, 0) * sm(.35, .05, sz);
    X += dx * fr; Z += dz * fr;
  }
  return new Vector3(X, Y, Z);
}

// Unit direction → cranium surface used to root hair and fit hoods (no face).
export function cranium(d, P) { return sculpt(d, P, { noFace: true }); }

function sphereDirs(ws, hs) {
  const s = new SphereGeometry(1, ws, hs, Math.PI / 2, Math.PI * 2);
  return s;
}

function displace(geo, fn) {
  const p = geo.attributes.position, v = new Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); const q = fn(v); p.setXYZ(i, q.x, q.y, q.z); }
  geo.deleteAttribute('uv');
  const merged = mergeVertices(geo, 1e-6); merged.computeVertexNormals(); return merged;
}

// Region tint for skin, evaluated in the same normalised space (pos / H).
const SKIN_GLSL = /* glsl */`
  vec3 q=vCsP/csH0; q-=csO;
  float ax=abs(q.x);
  float lips=exp(-pow(q.x/.09,4.))*exp(-pow((q.y+.298)/.042,2.))*smoothstep(.2,.36,q.z);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.05,.66,.66),lips*csLip);
  roughnessFactor=mix(roughnessFactor,.36,lips*.7);
  float cheek=exp(-pow((ax-.19)/.08,2.)-pow((q.y+.09)/.08,2.))*smoothstep(.1,.3,q.z);
  diffuseColor.rgb*=mix(vec3(1.),vec3(1.04,.93,.92),cheek*.6);
  float lid=exp(-pow((ax-.148)/.07,2.)-pow((q.y-.04)/.04,2.))*smoothstep(.2,.34,q.z);
  diffuseColor.rgb*=mix(vec3(1.),vec3(.86,.8,.82),lid*.8);
  float under=exp(-pow((ax-.15)/.06,2.)-pow((q.y+.06)/.025,2.));
  diffuseColor.rgb*=1.-under*.1*(.3+csAge);
  float tzone=exp(-pow(q.x/.05,2.))*smoothstep(-.18,.3,q.y)*smoothstep(.3,.42,q.z);
  roughnessFactor-=tzone*.12;
  float stub=csStubble*smoothstep(-.13,-.2,q.y)*smoothstep(.0,.15,q.z)*(1.-lips);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.62,.6,.62),stub*(.55+.45*csNoise(vCsP*2400.)));
  float wr=smoothstep(.4,.85,csAge)*smoothstep(.16,.3,q.y)*smoothstep(.42,.3,q.y)*smoothstep(.15,.3,q.z);
  float lines=smoothstep(.6,1.,sin(q.y*120.+csNoise(vCsP*40.)*3.))*smoothstep(-.2,.4,csNoise(vec3(q.x*14.,q.y*3.,5.)));
  csH-=wr*lines*.8; diffuseColor.rgb*=1.-wr*lines*.03;
  float crow=smoothstep(.4,.85,csAge)*exp(-pow((ax-.29)/.03,2.)-pow((q.y-.0)/.05,2.))*smoothstep(.75,1.,sin(atan(q.y,ax-.22)*28.));
  float nostril=exp(-pow((ax-.032)/.014,2.)-pow((q.y+.222)/.01,2.));
  diffuseColor.rgb*=1.-nostril*.65;
  float mouth=exp(-pow(q.x/.1,4.))*exp(-pow((q.y+.298)/.006,2.))*smoothstep(.25,.38,q.z);
  diffuseColor.rgb*=1.-mouth*.55;
  // painted brow base under the brow cards
  float bt=clamp((ax-.05)/.21,0.,1.);
  float by=.068+csBrowArch*sin(3.14159*min(1.,bt*1.15))-.012*bt;
  float brow=smoothstep(.0,.25,bt)*smoothstep(1.05,.85,bt)*exp(-pow((q.y-by)/(.012*(1.-bt*.4)),2.))*smoothstep(.25,.35,q.z);
  brow*=.55+.45*(csNoise(vec3(q.x*420.,q.y*60.,2.))*.5+.5);
  diffuseColor.rgb=mix(diffuseColor.rgb,csBrow,brow*.75);
  // cavity occlusion: inner canthus, alar crease, mouth corners, under lower lip, ear bowl
  float cav=exp(-pow((ax-.075)/.02,2.)-pow((q.y-.0)/.02,2.))*.5
    +exp(-pow((ax-.08)/.012,2.)-pow((q.y+.2)/.025,2.))*.45
    +exp(-pow((ax-.105)/.012,2.)-pow((q.y+.3)/.012,2.))*.4
    +exp(-pow(q.x/.06,2.)-pow((q.y+.36)/.012,2.))*.25
    +smoothstep(.3,.34,ax)*smoothstep(-.06,-.1,q.z)*.3;
  diffuseColor.rgb*=1.-clamp(cav,0.,.6);
`;
const SSS_GLSL = /* glsl */`
#if NUM_DIR_LIGHTS > 0
for(int i=0;i<NUM_DIR_LIGHTS;i++){
  vec3 L=directionalLights[i].direction; float nl=dot(normal,L);
  float w=max(0.,(nl+.45)/1.45)-max(0.,nl);
  reflectedLight.directDiffuse+=directionalLights[i].color*diffuseColor.rgb*vec3(.85,.3,.22)*w*.28;
}
#endif
reflectedLight.indirectDiffuse*=vec3(1.02,.985,.975);
`;

const skinMaterialCache = new Map();
export function skinMaterial(profile, H, origin) {
  const key = `${profile.skin}|${profile.age}|${profile.sex}|${H.toFixed(4)}|${origin.toArray().map(v => v.toFixed(4)).join(',')}`;
  if (skinMaterialCache.has(key)) return skinMaterialCache.get(key);
  const base = new Color(profile.skin);
  const m = new MeshPhysicalMaterial({
    color: base, roughness: .62, metalness: 0, specularIntensity: .28, specularColor: new Color('#fff6f0'),
    sheen: .18, sheenRoughness: .6, sheenColor: base.clone().lerp(new Color('#ff7a5a'), .55).multiplyScalar(.6),
  });
  m.name = 'skin';
  const stubble = profile.sex === 'm' && !profile.beard ? .55 : profile.beard ? .7 : 0;
  withSurface(m, 'skin', 1, SKIN_GLSL);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    Object.assign(shader.uniforms, { csH0: { value: H }, csO: { value: origin.clone() }, csLip: { value: profile.sex === 'f' ? .75 : .45 }, csAge: { value: profile.age ?? .3 }, csStubble: { value: stubble }, csBrow: { value: new Color(profile.hair?.color ?? '#1a1410').lerp(base, .25) }, csBrowArch: { value: profile.sex === 'f' ? .03 : .018 } });
    shader.fragmentShader = shader.fragmentShader.replace('uniform float csStrength;', 'uniform float csStrength;\nuniform float csH0,csLip,csAge,csStubble,csBrowArch;\nuniform vec3 csO,csBrow;').replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + SSS_GLSL);
  };
  // Subsurface approximation: soften the terminator and lift red in shadow.
  m.userData.sss = true;
  skinMaterialCache.set(key, m);
  return m;
}

const EYE_GLSL = /* glsl */`
  vec3 e=normalize(vCsP-csEc);
  float ang=acos(clamp(e.z,-1.,1.));
  float iris=smoothstep(.53,.5,ang), pupil=smoothstep(.2,.18,ang), limbal=smoothstep(.36,.53,ang)*iris;
  float fib=csNoise(vec3(atan(e.y,e.x)*12.,ang*30.,1.))*.5+.5;
  vec3 irisC=csIris*(.65+fib*.7)*(1.-limbal*.75)+csIris*vec3(1.4,1.25,.9)*smoothstep(.3,.2,ang)*.35;
  float veins=smoothstep(.6,1.,csNoise(vCsP*900.))*smoothstep(.9,1.4,ang)*.25;
  vec3 sclera=mix(vec3(.86,.83,.8),vec3(.8,.42,.4),veins)*mix(.7,1.,smoothstep(-.6,.2,e.y));
  diffuseColor.rgb=mix(sclera,irisC,iris); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.01),pupil);
  diffuseColor.rgb*=mix(.55,1.,smoothstep(.75,.15,e.y));
  roughnessFactor=.05;
`;

export function eyeMaterial(iris, center) {
  const m = new MeshPhysicalMaterial({ color: '#ffffff', roughness: .05, clearcoat: 1, clearcoatRoughness: .03, specularIntensity: .9, ior: 1.376 });
  m.name = 'eye';
  withSurface(m, 'hair', 0, EYE_GLSL);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => { prev(shader, r); shader.uniforms.csIris = { value: new Color(iris) }; shader.uniforms.csEc = { value: center.clone() }; shader.fragmentShader = shader.fragmentShader.replace('uniform float csStrength;', 'uniform float csStrength;\nuniform vec3 csIris,csEc;'); };
  m.customProgramCacheKey = () => 'eye';
  return m;
}

// Builds skin (head + ears + neck + lids) and eyes. Returns metadata used by
// hair/gear to fit to the same surface.
export function buildHead(profile, H, quality = 'high') {
  const P = faceParams(profile);
  const res = quality === 'low' ? [72, 56] : quality === 'medium' ? [112, 88] : [150, 120];
  const head = displace(sphereDirs(res[0], res[1]), d => sculpt(d, P));
  // ears
  const ears = [];
  for (const s of [-1, 1]) {
    const e = displace(new SphereGeometry(1, 20, 16), d => new Vector3(d.x * .032 + (d.x * s > 0 ? .012 * (1 - d.y * d.y) : 0), d.y * .125 * (1 - .3 * Math.max(0, -d.y)), d.z * .068 * (1 - .35 * Math.max(0, -d.y))));
    e.rotateY(s * -.42); e.rotateZ(s * .12);
    e.translate(s * (.33 * P.build), -.035, -.04); ears.push(e);
  }
  // neck
  const neck = new CylinderGeometry(.215, .25, .42, 40, 6, true); neck.scale(1, 1, 1.05); neck.translate(0, -.5, -.07);
  // Almond eye apertures with continuous lid-to-cheek annuli. A complete
  // exposed sphere plus detached spherical lids made the old eyes look glued on.
  const eyes = [], lids = [], lash = [];
  const r = EYE.r;
  const frontAt=(x,y)=>{
    let lo=0,hi=Math.PI/2,pt;const dy=Math.max(-.999,Math.min(.999,y*2)),rr=Math.sqrt(1-dy*dy);
    for(let k=0;k<18;k++){const t=(lo+hi)/2;pt=sculpt(new Vector3(Math.sign(x||1)*Math.sin(t)*rr,dy,Math.cos(t)*rr),P);if(Math.abs(pt.x)<Math.abs(x))lo=t;else hi=t;}
    return pt.z;
  };
  for (const s of [-1, 1]) {
    const cx=s*EYE.x,cy=EYE.y;
    const center=new Vector3(cx,cy,frontAt(cx,cy)-r+.012);
    const pos=[],indices=[],ring=[],ri=[];const N=48,M=8;
    // Polar patch covers exactly the visible sclera, never an exposed globe.
    for(let j=0;j<=M;j++) for(let i=0;i<=N;i++){
      const a=i/N*Math.PI*2,t=j/M;
      const x=Math.cos(a)*.043*t,y=Math.sin(a)*.014*t+s*x*.10;
      pos.push(cx+x,cy+y,center.z+Math.sqrt(Math.max(0,r*r-x*x-y*y)));
    }
    for(let j=0;j<M;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;indices.push(a,b,a+1,b,b+1,a+1);}
    const eye=new BufferGeometry();eye.setAttribute('position',new Float32BufferAttribute(pos,3));eye.setIndex(indices);eye.computeVertexNormals();eyes.push({geo:eye,center});
    for(let j=0;j<=M;j++)for(let i=0;i<=N;i++){
      const a=i/N*Math.PI*2,t=j/M,ix=Math.cos(a)*.043,iy=Math.sin(a)*.014+s*ix*.10;
      const x=ix*(1-t)+Math.cos(a)*.072*t,y=iy*(1-t)+Math.sin(a)*.050*t;
      const inner=center.z+Math.sqrt(Math.max(0,r*r-ix*ix-iy*iy))+.001;
      const z=inner*(1-t)+frontAt(cx+x,cy+y)*t+Math.sin(t*Math.PI)*.003;
      ring.push(cx+x,cy+y,z);
    }
    for(let j=0;j<M;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;ri.push(a,b,a+1,b,b+1,a+1);}
    const lid=new BufferGeometry();lid.setAttribute('position',new Float32BufferAttribute(ring,3));lid.setIndex(ri);lid.computeVertexNormals();
    const blink=new Float32Array(ring);
    for(let j=0;j<=M;j++)for(let i=0;i<=N;i++){const index=j*(N+1)+i;blink[index*3+1]+=(cy-ring[index*3+1])*(1-j/M);}
    lid.morphAttributes.position=[new Float32BufferAttribute(blink,3)];lids.push(lid);
  }
  const skinParts = [head, ...ears.map(e => { const n = e.index ? e.toNonIndexed() : e; n.deleteAttribute('uv'); return n; }), (() => { const n = neck.toNonIndexed(); n.deleteAttribute('uv'); return n; })()];
  const skinGeo = mergeGeometries(skinParts.map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; }), false);
  skinGeo.scale(H, H, H);
  for(const lid of lids){lid.scale(H,H,H);const morph=lid.morphAttributes.position[0];for(let i=0;i<morph.count;i++)morph.setXYZ(i,morph.getX(i)*H,morph.getY(i)*H,morph.getZ(i)*H);}
  return { P, H, skinGeo, lids, eyes: eyes.map(e => ({ geo: e.geo.scale(H, H, H), center: e.center.clone().multiplyScalar(H) })), lash };
}

export { sm, g2 };
