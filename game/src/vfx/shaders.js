// Three uber-shaders cover every non-particle effect layer:
//   strip — camera-facing ribbons built from a centre polyline (lightning, beams, jets, trails, tendrils, chains)
//   surf  — ordinary meshes (vortex funnels, flame walls, shields, domes, waves, halos, slash crescents)
//   decal — ground discs (telegraphs, frost spokes, lava cracks, glyph circles, scorch, wash, clockwork, hex grids)
// A `uKind` uniform picks the look so each shader compiles once and is shared by every instance.
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector2, Vector4, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';

const NOISE = /* glsl */`
float h11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1.0,0.0)), f.x), mix(h21(i+vec2(0.0,1.0)), h21(i+vec2(1.0,1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5; float s = 0.0; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03+vec2(17.1,9.7); a *= 0.5; } return s; }
vec2 vor(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); float d1 = 8.0; float d2 = 8.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g = vec2(float(x),float(y)); vec2 o = vec2(h21(i+g), h21(i+g+19.7));
    float d = length(g+o-f); if(d<d1){ d2 = d1; d1 = d; } else if(d<d2){ d2 = d; } }
  return vec2(d1, d2); }
`;

const COMMON_U = ['world', 'viewProjection', 'uCam', 'uTime', 'uC0', 'uC1', 'uC2', 'uC3', 'uOpacity', 'uKind', 'uGrow', 'uTail', 'uSeed', 'uScroll', 'uP'];

// ---------------------------------------------------------------- strip
const STRIP_VS = /* glsl */`
precision highp float;
attribute vec3 position; attribute vec3 tang; attribute vec4 coord;
uniform mat4 world; uniform mat4 viewProjection; uniform vec3 uCam; uniform float uWidth;
varying vec4 vC;
void main(){
  vec3 w = (world*vec4(position,1.0)).xyz;
  vec3 t = normalize(mat3(world)*tang + vec3(1e-5));
  vec3 v = normalize(uCam - w);
  vec3 a = cross(t, v); float l = length(a); a = l > 1e-4 ? a/l : vec3(0.0,1.0,0.0);
  w += a*coord.x*coord.z*uWidth;
  vC = coord;
  gl_Position = viewProjection*vec4(w,1.0);
}`;
const STRIP_FS = /* glsl */`
precision highp float;
uniform float uTime; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
uniform float uOpacity; uniform float uKind; uniform float uGrow; uniform float uTail; uniform float uSeed; uniform vec2 uScroll; uniform vec4 uP;
varying vec4 vC;
${NOISE}
void main(){
  float along = vC.y; float s = abs(vC.x); float br = vC.w;
  if (along > uGrow || along < uTail || br <= 0.0) discard;
  float ends = smoothstep(uTail, uTail+0.04, along) * (1.0 - smoothstep(uGrow-0.02, uGrow, along)*0.0);
  float head = smoothstep(uGrow-0.08, uGrow, along);
  vec3 col; float a;
  int k = int(uKind+0.5);
  if (k == 0) { // lightning: hard white core, falloff glow, crackle
    float piece = floor(along*uP.x + uSeed*13.0);
    if (h11(piece + floor(uTime*20.0)*0.37) < uP.y) discard;
    float core = 1.0 - smoothstep(0.08, 0.2, s);
    float glow = pow(clamp(1.0-s,0.0,1.0), 2.4);
    float fl = 0.75 + 0.25*h11(floor(uTime*30.0)+uSeed*7.0);
    col = mix(uC2, uC1, glow)*glow*1.4 + uC0*core*2.0;
    a = (glow*0.9 + core) * fl * br;
  } else if (k == 1) { // energy ribbon
    float n = fbm(vec2(along*uP.x - uTime*uScroll.x, vC.x*1.5 + uSeed));
    float body = (1.0 - s*s) * (0.45 + 0.9*n);
    float core = pow(max(0.0, 1.0 - s*1.6), 3.0);
    col = mix(uC2, uC1, body) * body * 1.3 + uC0*core*(0.6+n) + uC0*head*0.8;
    a = clamp(body*0.85 + core, 0.0, 1.0) * br * ends;
  } else if (k == 2) { // liquid jet: turbulent body with white foam breakup
    float n = fbm(vec2(along*uP.x - uTime*uScroll.x, vC.x*2.2 + uSeed*3.0));
    float n2 = vnoise(vec2(along*uP.x*3.0 - uTime*uScroll.x*1.7, vC.x*5.0));
    float body = smoothstep(1.0, 0.35 + n*0.5, s);
    float foam = smoothstep(0.55, 0.85, n2*0.6 + s*0.6 + n*0.3) * body;
    col = mix(uC3, uC1, n) * (0.6 + 0.6*n) + uC0*foam*1.4 + uC0*head*0.6;
    a = clamp(body*(0.55 + 0.45*n) + foam, 0.0, 1.0) * br * ends;
  } else if (k == 3) { // flame trail: broken tongues of fire, hot core, ragged edges
    float n = fbm(vec2(along*uP.x*3.0 - uTime*uScroll.x, vC.x*1.3 + uSeed));
    float n2 = vnoise(vec2(along*uP.x*9.0 - uTime*uScroll.x*1.7, vC.x*3.5 - uSeed));
    float body = 1.0 - pow(s, 1.4);
    float heat = body*(0.1 + 1.25*n) + n2*0.3*body - (1.0 - along)*0.3*uP.z;
    heat = clamp(heat, 0.0, 1.3);
    col = mix(uC3, uC2, smoothstep(0.1,0.45,heat)); col = mix(col, uC1, smoothstep(0.45,0.85,heat)); col = mix(col, uC0, smoothstep(0.9,1.25,heat));
    col *= 0.6 + heat*0.6;
    a = smoothstep(0.28, 0.7, heat) * br * ends;
  } else if (k == 4) { // void / ink / smoke ribbon (alpha blended, dark with lit rim)
    float n = fbm(vec2(along*uP.x - uTime*uScroll.x, vC.x*2.0 + uSeed));
    float body = smoothstep(1.0, 0.3 + 0.4*n, s);
    float rim = smoothstep(0.45, 0.8, s) * body * (0.6 + n);
    col = mix(uC3, uC2, n*0.5) + uC1*rim*1.5;
    a = body * (0.6 + 0.4*n) * br * ends;
  } else { // chain links
    float f = fract(along*uP.y); float link = abs(f-0.5)*2.0;
    float ring = smoothstep(0.75, 0.55, abs(s - 0.55 + link*0.25)) ;
    float glow = pow(clamp(1.0 - s, 0.0, 1.0), 2.0)*0.4;
    col = uC1*ring*1.6 + uC0*ring*smoothstep(0.6,0.95,1.0-link)*0.8 + uC2*glow;
    a = clamp(ring + glow, 0.0, 1.0) * br * ends;
  }
  gl_FragColor = vec4(col, a*uOpacity);
}`;

// ---------------------------------------------------------------- surf
const SURF_VS = /* glsl */`
precision highp float;
attribute vec3 position; attribute vec3 normal; attribute vec2 uv;
uniform mat4 world; uniform mat4 viewProjection;
varying vec2 vUV; varying vec3 vN; varying vec3 vW;
void main(){ vec4 w = world*vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(world)*normal); vUV = uv; gl_Position = viewProjection*w; }`;
const SURF_FS = /* glsl */`
precision highp float;
uniform vec3 uCam; uniform float uTime; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
uniform float uOpacity; uniform float uKind; uniform float uGrow; uniform float uTail; uniform float uSeed; uniform vec2 uScroll; uniform vec4 uP;
varying vec2 vUV; varying vec3 vN; varying vec3 vW;
${NOISE}
void main(){
  if (vUV.y > uGrow || vUV.y < uTail) discard;
  vec3 V = normalize(uCam - vW); vec3 N = normalize(vN);
  float fres = pow(1.0 - abs(dot(N, V)), max(uP.w, 0.5));
  vec2 uv = vUV*vec2(uP.x, uP.y) + uScroll*uTime + uSeed;
  float edgeY = (uTail < 0.0 ? 1.0 : smoothstep(0.0, 0.12, vUV.y - uTail)) * (uGrow > 1.0 ? 1.0 : smoothstep(0.0, 0.18, uGrow - vUV.y));
  vec3 col; float a;
  int k = int(uKind+0.5);
  if (k == 0) { // energy shell: fresnel rim + drifting bands
    float n = fbm(uv);
    col = mix(uC2, uC1, fres) * (0.4 + 1.2*fres) + uC0*pow(fres,3.0)*1.4 + uC1*n*0.35;
    a = clamp(fres*0.9 + n*0.25, 0.0, 1.0) * edgeY;
  } else if (k == 1) { // water sheet: transparent deep body, flow-streaked foam, bright fresnel rim
    float n = fbm(uv);
    float n2 = fbm(uv*vec2(1.0, 2.6)*1.6 + vec2(n*1.3, -uTime*0.5));
    float st = smoothstep(0.6, 0.78, n2) * (0.35 + 0.65*n);
    float crest = smoothstep(0.78, 1.0, vUV.y) * smoothstep(0.4, 0.7, n) * uP.z;
    vec3 body = mix(uC3, uC1, clamp(pow(n, 1.4)*0.9 + fres*0.35, 0.0, 1.0));
    col = body*(0.4 + 0.7*fres) + uC0*(st*0.85 + crest*1.1) + uC0*pow(fres, 4.0)*0.6;
    a = clamp(0.22 + 0.3*n + fres*0.5 + st*0.5 + crest*0.6, 0.0, 0.95) * edgeY;
  } else if (k == 2) { // fire sheet: thin tongues rising along uv.y
    float spd = max(uScroll.y, 0.6);
    float n = fbm(vec2(vUV.x*uP.x*5.0 + uSeed, vUV.y*uP.y*0.6 - uTime*spd));
    float n2 = vnoise(vec2(vUV.x*uP.x*11.0 - uSeed, vUV.y*3.5 - uTime*spd*1.8));
    float shape = n*1.1 + n2*0.4 - vUV.y*1.2 - 0.16;
    float heat = clamp(shape*1.7, 0.0, 1.1);
    col = mix(uC3, uC2, smoothstep(0.0,0.35,heat)); col = mix(col, uC1, smoothstep(0.3,0.75,heat)); col = mix(col, uC0, smoothstep(0.8,1.15,heat));
    col *= 0.5 + heat*0.5;
    a = smoothstep(0.1, 0.6, heat) * 0.7 * smoothstep(0.0, 0.08, uGrow - vUV.y + 0.02) * (0.55 + 0.45*(1.0-fres));
  } else if (k == 3) { // smoke / void sheet (alpha blended)
    float n = fbm(uv); float n2 = fbm(uv*1.9 - n);
    col = mix(uC3, uC2, n2*0.6) + uC1*pow(fres, 2.0)*1.2 + uC1*smoothstep(0.62,0.8,n2)*0.8;
    a = clamp((0.35 + 0.65*n2) * (0.4 + fres), 0.0, 1.0) * edgeY;
  } else if (k == 4) { // hard-light hex shield
    vec2 p = uv*4.0; vec2 r = vec2(1.0, 1.732); vec2 h = r*0.5;
    vec2 ga = mod(p, r) - h; vec2 gb = mod(p - h, r) - h; vec2 g = dot(ga,ga) < dot(gb,gb) ? ga : gb;
    float hx = max(abs(g.x)*0.866 + abs(g.y)*0.5, abs(g.y));
    float line = smoothstep(0.40, 0.48, hx);
    float scan = smoothstep(0.92, 1.0, fract(vUV.y*1.5 - uTime*0.6));
    col = uC1*(line*1.2 + fres*1.1) + uC0*(pow(fres,3.0) + scan*0.5) + uC2*0.15;
    a = clamp(line*0.6 + fres*0.8 + 0.08 + scan*0.3, 0.0, 1.0) * edgeY;
  } else if (k == 5) { // wind / sound streaks
    float n = vnoise(vec2(uv.x*0.5, vUV.y*uP.y*3.0 + uSeed)); float st = smoothstep(0.55, 0.9, n);
    float n2 = fbm(uv*0.7);
    col = mix(uC2, uC1, st) * (st*1.4 + n2*0.4) + uC0*st*st;
    a = clamp(st*0.8 + n2*0.18, 0.0, 1.0) * edgeY * (0.4 + 0.6*fres*0.0 + 0.6);
  } else if (k == 6) { // plain glow (beams, halos, pillars of light, shock bands)
    float facing = pow(abs(dot(N, V)), 1.5);
    float g = max(0.0, 1.0 - abs(vUV.x*2.0 - 1.0)*uP.z);
    float n = vnoise(vec2(vUV.x*uP.x*6.0, vUV.y*uP.y - uTime*uScroll.y));
    float top = 1.0 - smoothstep(0.5, 1.0, vUV.y);
    col = mix(uC1, uC0, facing*facing) * (0.75 + 0.5*n);
    a = g * (0.3 + 0.7*facing) * (0.6 + 0.4*n) * top * edgeY;
  } else { // dark rock-energy (cracked lava / crystal glow veins)
    vec2 vr = vor(uv*1.5); float crack = 1.0 - smoothstep(0.0, 0.08, vr.y - vr.x);
    col = uC3*(0.4 + fres*0.4) + uC1*crack*1.6 + uC0*crack*crack;
    a = clamp(0.7 + crack, 0.0, 1.0) * edgeY;
  }
  if (uP.z < 0.0) { float d = fbm(vUV*7.0 + uSeed); if (d < -uP.z) discard; } // dissolve
  gl_FragColor = vec4(col, a*uOpacity);
}`;

// ---------------------------------------------------------------- decal
const DECAL_VS = /* glsl */`
precision highp float;
attribute vec3 position; attribute vec2 uv;
uniform mat4 world; uniform mat4 viewProjection;
varying vec2 vUV;
void main(){ vUV = uv; gl_Position = viewProjection*(world*vec4(position,1.0)); }`;
const DECAL_FS = /* glsl */`
precision highp float;
uniform float uTime; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
uniform float uOpacity; uniform float uKind; uniform float uGrow; uniform float uTail; uniform float uSeed; uniform vec2 uScroll; uniform vec4 uP;
uniform sampler2D uTex; uniform sampler2D uGlyph;
varying vec2 vUV;
${NOISE}
#define PI 3.14159265
void main(){
  vec2 p = (vUV - 0.5)*2.0; float r = length(p); if (r > 1.0) discard;
  float ang = atan(p.y, p.x); float rot = uTime*uScroll.x;
  float ar = ang + rot;
  vec3 col = vec3(0.0); float a = 0.0;
  int k = int(uKind+0.5);
  float rim = smoothstep(0.035, 0.0, abs(r - 0.965));
  if (k == 0) { // telegraph: rim + filling disc + ticks
    float fill = step(r, uGrow) * (0.18 + 0.25*smoothstep(uGrow-0.12, uGrow, r));
    float ticks = step(0.86, r) * step(r, 0.93) * step(0.7, fract(ar/(2.0*PI)*48.0));
    col = uC1*(rim*1.2 + fill + ticks*0.6) + uC0*rim*0.5; a = clamp(rim + fill + ticks*0.5, 0.0, 1.0);
  } else if (k == 1) { // frost spokes / snowflake floor plate
    float n = uP.x; float sa = abs(fract(ar/(2.0*PI)*n + 0.5) - 0.5)*2.0*PI/n*r;
    float spoke = n > 0.5 ? smoothstep(0.016 + 0.02*(1.0-r), 0.0, sa) * step(r, uGrow) * (0.55 + 0.45*fbm(p*9.0)) : 0.0;
    float br = abs(fract(ar/(2.0*PI)*n*3.0 + 0.5) - 0.5); float barb = smoothstep(0.06, 0.0, abs(fract(r*5.0)-0.5)*0.4 - br*0.1) * spoke;
    float rings = n > 0.5 ? smoothstep(0.012, 0.0, abs(r - 0.62*uGrow))*0.6 + smoothstep(0.01, 0.0, abs(r - 0.35*uGrow))*0.5 : 0.0;
    vec2 vr = vor(p*7.0 + uSeed); float crys = (1.0 - smoothstep(0.0, 0.06, vr.y - vr.x)) * 0.5;
    float frost = (fbm(p*6.0 + uSeed)*0.7 + crys) * smoothstep(1.0, 0.15, r) * step(r, uGrow);
    col = uC1*(spoke*0.9 + rings*0.7 + frost*0.55 + rim*0.3) + uC0*(spoke*0.45 + barb*0.25);
    a = clamp(spoke*0.8 + rings*0.6 + frost*0.5 + rim*0.3, 0.0, 1.0);
  } else if (k == 2) { // lava / ember cracks over char (alpha blended)
    vec2 q = p*uP.x*2.2 + uSeed; q += vec2(fbm(q*0.7), fbm(q*0.7 + 5.2))*1.2;
    vec2 vr = vor(q); float w = 0.05 + 0.06*fbm(q*1.7);
    float crack = 1.0 - smoothstep(0.0, w, vr.y - vr.x);
    vec2 vr2 = vor(q*2.3 + 3.1); float crack2 = (1.0 - smoothstep(0.0, 0.05, vr2.y - vr2.x)) * 0.5;
    float n = fbm(p*4.0 + uSeed);
    float reach = step(r, uGrow);
    float hot = clamp(crack + crack2*smoothstep(0.9, 0.3, r), 0.0, 1.0) * (0.5 + 0.7*n) * reach * uP.y * smoothstep(1.0, 0.7, r);
    col = mix(uC3, uC3*0.4, n) + uC2*hot*1.3 + uC1*hot*hot*1.2 + uC0*pow(hot, 4.0)*0.8;
    a = clamp((0.8*smoothstep(1.0, 0.5, r)*(0.55 + 0.45*n))*reach + hot, 0.0, 1.0);
  } else if (k == 3) { // glyph circle: concentric rings, rune band, central glyph
    float r1 = smoothstep(0.012, 0.0, abs(r - 0.94)) + smoothstep(0.01, 0.0, abs(r - 0.76)) + smoothstep(0.008, 0.0, abs(r - 0.36));
    vec2 ruv = vec2(fract((ang + rot)/(2.0*PI))*uP.x, clamp((r - 0.78)/0.15, 0.0, 1.0));
    float runes = (r > 0.78 && r < 0.93) ? texture2D(uTex, ruv).a : 0.0;
    vec2 guv = vec2(cos(-rot*0.5)*p.x - sin(-rot*0.5)*p.y, sin(-rot*0.5)*p.x + cos(-rot*0.5)*p.y)/1.5 + 0.5;
    float gl = r < 0.74 ? texture2D(uGlyph, vec2(guv.x, 1.0-guv.y)).a : 0.0;
    float star = 0.0; float n = uP.y; if (n > 0.5) { float sa = abs(fract(ar/(2.0*PI)*n)-0.5); star = smoothstep(0.012, 0.0, abs(r*cos(sa*2.0*PI/n) - 0.76*cos(PI/n)*0.98)) * step(r, 0.76); }
    float m = (r1 + runes + gl*0.9 + star) * step(r, uGrow);
    col = uC1*m*1.2 + uC0*(r1*0.5 + gl*0.6); a = clamp(m, 0.0, 1.0);
  } else if (k == 4) { // scorch / char (alpha blended)
    float n = fbm(p*3.0 + uSeed); float m = smoothstep(1.0, 0.25 + 0.4*n, r) * step(r, uGrow);
    float ember = smoothstep(0.75, 0.9, fbm(p*9.0 + uSeed*2.0)) * m * uP.y;
    col = uC3*(0.5 + 0.5*n) + uC1*ember*2.0; a = clamp(m*0.85 + ember, 0.0, 1.0);
  } else if (k == 5) { // wet wash: dark wet sheen with thin foam lace (alpha blended)
    float n = fbm(p*3.5 + vec2(uSeed, -uTime*0.08));
    float lace = smoothstep(0.045, 0.0, abs(fbm(p*6.0 + n*1.5 + uSeed) - 0.5)) * smoothstep(1.0, 0.3, r);
    float lace2 = smoothstep(0.03, 0.0, abs(fbm(p*11.0 - n + uSeed*2.0) - 0.5)) * 0.6;
    float wet = smoothstep(1.0, 0.35, r + (n - 0.5)*0.3) * step(r, uGrow);
    float ringf = smoothstep(0.05, 0.0, abs(r - uGrow*0.95)) * (0.4 + n) * (1.0 - smoothstep(0.85, 1.0, uGrow));
    col = mix(uC3, uC1, n*0.35)*0.55 + uC0*(lace + lace2)*0.75*wet + uC0*ringf;
    a = clamp(wet*(0.42 + 0.2*n) + (lace + lace2)*wet*0.45 + ringf, 0.0, 0.95);
  } else if (k == 6) { // clockwork dial: ticks, numeral bars, sweeping hands
    float t60 = step(0.85, r) * step(r, 0.92) * smoothstep(0.25, 0.0, abs(fract(ar/(2.0*PI)*60.0)-0.5)*2.0 - 0.75);
    float t12 = step(0.74, r) * step(r, 0.92) * smoothstep(0.08, 0.0, abs(fract(ang/(2.0*PI)*12.0 + 0.5)-0.5));
    float rings = smoothstep(0.01, 0.0, abs(r - 0.95)) + smoothstep(0.008, 0.0, abs(r - 0.72)) + smoothstep(0.006, 0.0, abs(r - 0.3));
    float h1 = smoothstep(0.02, 0.0, abs(sin(ang - uTime*uScroll.y)) * r) * step(r, 0.7) * step(0.0, cos(ang - uTime*uScroll.y));
    float h2 = smoothstep(0.015, 0.0, abs(sin(ang + uTime*uScroll.y*0.2)) * r) * step(r, 0.5) * step(0.0, cos(ang + uTime*uScroll.y*0.2));
    float gear = step(0.25, r) * step(r, 0.3) * step(0.5, fract(ar/(2.0*PI)*24.0));
    float m = (t60 + t12 + rings + h1 + h2 + gear) * step(r, uGrow);
    col = uC1*m*1.2 + uC0*(t12 + h1)*0.6; a = clamp(m, 0.0, 1.0);
  } else if (k == 7) { // hex grid + scanning ring (tech)
    vec2 q = p*uP.x; vec2 rr = vec2(1.0, 1.732); vec2 hh = rr*0.5;
    vec2 ga = mod(q, rr) - hh; vec2 gb = mod(q - hh, rr) - hh; vec2 g = dot(ga,ga) < dot(gb,gb) ? ga : gb;
    float hx = max(abs(g.x)*0.866 + abs(g.y)*0.5, abs(g.y)); float line = smoothstep(0.42, 0.48, hx);
    float scan = smoothstep(0.08, 0.0, abs(r - fract(uTime*0.6)));
    float m = (line*0.5*smoothstep(1.0, 0.3, r) + rim + scan*0.8) * step(r, uGrow);
    col = uC1*m*1.2 + uC0*scan*0.6; a = clamp(m, 0.0, 1.0);
  } else if (k == 8) { // radial cracks (earth, alpha blended)
    float n = fbm(p*3.0 + uSeed);
    float cr = 0.0; for (int i = 0; i < 9; i++) { float aa = float(i)*0.698 + uSeed + n*0.6; float d = abs(sin(ang - aa))*r; cr += smoothstep(0.03*(1.0-r)+0.004, 0.0, d) * step(0.0, cos(ang - aa)); }
    vec2 vr = vor(p*5.0 + uSeed); cr += (1.0 - smoothstep(0.0, 0.05, vr.y - vr.x)) * smoothstep(0.9, 0.2, r) * 0.6;
    cr = clamp(cr, 0.0, 1.0) * step(r, uGrow);
    float dust = smoothstep(1.0, 0.3, r)*0.35*(0.5 + n);
    col = uC3*(1.0 - cr*0.6) + uC1*cr*uP.y*1.5; a = clamp(dust + cr*0.9, 0.0, 1.0)*step(r, uGrow + 0.05);
  } else if (k == 9) { // soft light pool
    float g = pow(max(0.0, 1.0 - r), 1.6); float n = vnoise(p*4.0 + uTime*0.5);
    col = mix(uC1, uC0, g*g) * g * (0.85 + 0.3*n); a = g;
  } else { // spiral arms (vortex top view)
    float sp = sin(ar*uP.x + log(max(r, 0.02))*uP.y*6.0 - uTime*uScroll.y);
    float n = fbm(p*4.0 + uSeed);
    float arm = smoothstep(0.2, 0.9, sp*0.5 + 0.5 + (n-0.5)*0.6) * smoothstep(1.0, 0.15, r) * step(r, uGrow);
    col = mix(uC2, uC1, arm)*arm*1.3 + uC0*pow(arm, 4.0); a = clamp(arm, 0.0, 1.0);
  }
  float edge = smoothstep(1.0, 0.94, r);
  gl_FragColor = vec4(col, a*uOpacity*edge);
}`;

const DEFS = {
  strip: { vertexSource: STRIP_VS, fragmentSource: STRIP_FS, attributes: ['position', 'tang', 'coord'], uniforms: [...COMMON_U, 'uWidth'], samplers: [] },
  surf: { vertexSource: SURF_VS, fragmentSource: SURF_FS, attributes: ['position', 'normal', 'uv'], uniforms: COMMON_U, samplers: [] },
  decal: { vertexSource: DECAL_VS, fragmentSource: DECAL_FS, attributes: ['position', 'uv'], uniforms: COMMON_U, samplers: ['uTex', 'uGlyph'] },
};

const KINDS = {
  strip: { bolt: 0, energy: 1, liquid: 2, flame: 3, dark: 4, chain: 5 },
  surf: { energy: 0, water: 1, fire: 2, smoke: 3, hex: 4, wind: 5, glow: 6, lava: 7 },
  decal: { telegraph: 0, frost: 1, lava: 2, glyph: 3, scorch: 4, wash: 5, clock: 6, hex: 7, cracks: 8, pool: 9, spiral: 10 },
};
// Kinds that must blend over (not add to) the scene: dark smoke, water bodies, char decals.
const NORMAL_BLEND = { strip: new Set([2, 4]), surf: new Set([1, 3, 7]), decal: new Set([2, 4, 5, 8]) };

const pools = new WeakMap();
let uid = 0;

/** Acquire a pooled fx material. `type` = strip|surf|decal, `kind` = a name from KINDS[type]. */
export function acquireMat(scene, type, kind, o = {}) {
  let p = pools.get(scene); if (!p) { p = { strip: [], surf: [], decal: [], live: new Set() }; pools.set(scene, p); }
  let m = p[type].pop();
  if (!m) {
    const d = DEFS[type];
    m = new ShaderMaterial(`fx.${type}.${uid++}`, scene, { vertexSource: d.vertexSource, fragmentSource: d.fragmentSource },
      { attributes: d.attributes, uniforms: d.uniforms, samplers: d.samplers, needAlphaBlending: true });
    m.backFaceCulling = false; m.disableDepthWrite = true;
    m._fxType = type;
    m.u = { c0: new Color3(1, 1, 1), c1: new Color3(1, 1, 1), c2: new Color3(1, 1, 1), c3: new Color3(0, 0, 0), scroll: new Vector2(0, 0), p: new Vector4(1, 1, 0, 2) };
  }
  const k = typeof kind === 'number' ? kind : (KINDS[type][kind] ?? 0);
  m.u.kind = k;
  m.alphaMode = (o.blend === 'normal' || (o.blend !== 'add' && NORMAL_BLEND[type].has(k))) ? Constants.ALPHA_COMBINE : Constants.ALPHA_ADD;
  m.zOffset = type === 'decal' ? -2 : 0;
  m.u.c0.copyFrom(o.c0 ?? Color3.White()); m.u.c1.copyFrom(o.c1 ?? m.u.c0); m.u.c2.copyFrom(o.c2 ?? m.u.c1); m.u.c3.copyFrom(o.c3 ?? Color3.Black());
  m.u.opacity = o.opacity ?? 1; m.u.grow = o.grow ?? 1.01; m.u.tail = o.tail ?? -0.01; m.u.seed = o.seed ?? Math.random() * 10;
  m.u.scroll.set(o.scroll?.[0] ?? 0, o.scroll?.[1] ?? 0);
  const P = o.p ?? [1, 1, 0, 2]; m.u.p.set(P[0], P[1], P[2], P[3]);
  m.u.width = o.width ?? 0.3;
  if (type === 'decal') { m.setTexture('uTex', o.tex); m.setTexture('uGlyph', o.glyph ?? o.tex); }
  p.live.add(m);
  return m;
}

export function releaseMat(scene, m) {
  const p = pools.get(scene); if (!p || !m) return;
  p.live.delete(m);
  if (p[m._fxType].length < 64) p[m._fxType].push(m); else m.dispose(true);
}

const camTmp = new Vector3();
/** Push per-frame uniforms to every live fx material. */
export function syncMats(scene, time) {
  const p = pools.get(scene); if (!p) return;
  const cam = scene.activeCamera; if (cam) camTmp.copyFrom(cam.globalPosition);
  for (const m of p.live) {
    const u = m.u;
    m.setVector3('uCam', camTmp); m.setFloat('uTime', time);
    m.setColor3('uC0', u.c0); m.setColor3('uC1', u.c1); m.setColor3('uC2', u.c2); m.setColor3('uC3', u.c3);
    m.setFloat('uOpacity', Math.max(0, u.opacity)); m.setFloat('uKind', u.kind); m.setFloat('uGrow', u.grow); m.setFloat('uTail', u.tail);
    m.setFloat('uSeed', u.seed); m.setVector2('uScroll', u.scroll); m.setVector4('uP', u.p);
    if (m._fxType === 'strip') m.setFloat('uWidth', u.width);
  }
}

export { KINDS };
