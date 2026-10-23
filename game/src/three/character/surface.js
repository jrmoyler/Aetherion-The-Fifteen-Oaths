// Procedural micro-surface for character materials. Every detail is evaluated
// in the mesh's bind/rest space (the `position` attribute before skinning), so
// pores, weave and grain stay glued to the surface while the rig animates.
// Detail fades with screen-space frequency so distant actors do not shimmer.
import { MeshPhysicalMaterial, Color } from 'three';

const NOISE = /* glsl */`
vec3 cs_mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 cs_mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 cs_perm(vec4 x){return cs_mod289(((x*34.)+1.)*x);}
float csNoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=cs_mod289(i);
  vec4 p=cs_perm(cs_perm(cs_perm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  vec3 ns=.142857142857*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=inversesqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float csFbm(vec3 p){return csNoise(p)*.55+csNoise(p*2.07)*.28+csNoise(p*4.13)*.17;}
// Screen-derivative bump (same construction as three's perturbNormalArb).
vec3 csBump(vec3 pos,vec3 n,float h){
  vec3 sx=dFdx(pos),sy=dFdy(pos);vec3 r1=cross(sy,n),r2=cross(n,sx);float det=dot(sx,r1);
  vec3 grad=sign(det)*(dFdx(h)*r1+dFdy(h)*r2);return normalize(abs(det)*n-grad);}
// 1 where a feature of the given period spans several pixels, 0 when it would alias.
float csLod(vec3 p,float period){float w=length(fwidth(p));return 1.-smoothstep(period*.18,period*.6,w);}
`;

// Detail programs. Each sets `float csH` (bump height) and may tint
// `diffuseColor` / `roughnessFactor`. `vCsP` is rest-space position in metres.
const PROGRAMS = {
  skin: /* glsl */`
    float lod=csLod(vCsP,.0016);
    float pores=csNoise(vCsP*1400.);pores=smoothstep(.35,.9,pores)*lod;
    float fine=csNoise(vCsP*520.)*.5*lod;
    float blot=csFbm(vCsP*38.);
    csH=(-pores*.55+fine*.35+blot*.12)*csStrength;
    diffuseColor.rgb*=1.+blot*.07-pores*.05;
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.08,.9,.88),smoothstep(.1,.7,csFbm(vCsP*9.))*.35);
    roughnessFactor=clamp(roughnessFactor+pores*.12-blot*.06,.28,.95);`,
  weave: /* glsl */`
    float lod=csLod(vCsP,.003);
    vec3 q=vCsP*1500.;
    float warp=sin(q.x+q.z*.7+q.y*.05)*.5+.5,weft=sin(q.y+q.z*.3)*.5+.5;
    float sel=smoothstep(.25,.75,sin(q.x*.5)*sin(q.y*.5)*.5+.5);
    float thread=mix(warp,weft,sel);
    float slub=csFbm(vCsP*vec3(60.,240.,60.));
    csH=((thread-.5)*.5*lod+slub*.3)*csStrength;
    diffuseColor.rgb*=.95+thread*.05*lod+slub*.07;
    roughnessFactor=clamp(max(roughnessFactor,.62)+thread*.08,.55,1.);`,
  leather: /* glsl */`
    float lod=csLod(vCsP,.002);
    float cell=csNoise(vCsP*420.);float crease=1.-abs(csNoise(vCsP*70.));
    csH=(cell*.4*lod+pow(crease,6.)*-.6)*csStrength;
    diffuseColor.rgb*=.93+cell*.06*lod-pow(crease,8.)*.12;
    roughnessFactor=clamp(roughnessFactor*.9+cell*.06,.38,.85);`,
  wood: /* glsl */`
    vec3 g=vCsP*vec3(90.,9.,90.);float ring=fract(length(g.xz+csFbm(vCsP*14.)*1.6)*1.4);
    float fibre=csNoise(vCsP*vec3(900.,40.,900.))*csLod(vCsP,.0015);
    csH=(smoothstep(.0,.15,ring)*smoothstep(.6,.2,ring)*.6+fibre*.3)*csStrength;
    diffuseColor.rgb*=.78+ring*.3+fibre*.05;
    roughnessFactor=clamp(.55+ring*.2,.4,.85);`,
  brushed: /* glsl */`
    float lod=csLod(vCsP,.001);
    float streak=csNoise(vCsP*vec3(3.,1800.,3.))*lod;
    float wear=smoothstep(.25,.8,csFbm(vCsP*26.));
    float pits=smoothstep(.72,.95,csNoise(vCsP*700.))*lod;
    csH=(streak*.25-pits*.6)*csStrength;
    diffuseColor.rgb*=.9+streak*.05+wear*.18-pits*.25;
    roughnessFactor=clamp(roughnessFactor+streak*.05-wear*.14+pits*.3,.16,.8);`,
  porcelain: /* glsl */`
    float lod=csLod(vCsP,.002);
    float glaze=csFbm(vCsP*30.);float crackle=1.-smoothstep(.0,.04,abs(csNoise(vCsP*160.)));
    csH=(glaze*.15-crackle*.35*lod)*csStrength;
    diffuseColor.rgb*=.97+glaze*.03-crackle*.1*lod;
    roughnessFactor=clamp(.24+glaze*.06+crackle*.2,.15,.6);`,
  lacquer: /* glsl */`
    float lod=csLod(vCsP,.002);float orange=csNoise(vCsP*260.)*lod;float chip=smoothstep(.78,.92,csFbm(vCsP*45.));
    csH=(orange*.12-chip*.5)*csStrength;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.18,.12,.1),chip*.8);
    roughnessFactor=clamp(.22+orange*.04+chip*.5,.15,.8);`,
  hair: /* glsl */`
    csH=0.;`,
};

export const SURFACE_MODES = Object.keys(PROGRAMS);

// Returns a MeshPhysicalMaterial with the requested micro-surface program.
export function surfaceMaterial(mode, params = {}) {
  const { strength, trim, H, ...rest } = params;
  const m = new MeshPhysicalMaterial({ roughness: .6, metalness: 0, ...rest });
  return withSurface(m, mode, params.strength ?? 1);
}

// Augments an existing material in place (works on Standard/Physical).
export function withSurface(material, mode, strength = 1, extra = '') {
  const program = PROGRAMS[mode];
  if (!program) return material;
  const prev = material.onBeforeCompile;
  material.userData.csMode = mode;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.csStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCsP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCsP = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCsP;\nuniform float csStrength;\n${NOISE}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nfloat csH=0.;\n{${program}}\n${extra}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\nnormal = csBump(-vViewPosition, normal, csH * ${mode === 'skin' ? '.00007' : mode === 'hair' ? '.00012' : '.00035'});`);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${key ? key() : ''}|cs:${mode}:${extra.length}`;
  material.needsUpdate = true;
  return material;
}

export const tint = (hex, k = 1) => new Color(hex).multiplyScalar(k);
