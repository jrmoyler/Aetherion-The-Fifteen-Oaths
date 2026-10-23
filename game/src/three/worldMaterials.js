import * as THREE from 'three';
// Analytic mineral grain avoids image downloads while retaining world-space surface detail.
export function naturalMaterial(color, roughness = .92, masonry = false) {
  const albedo = new THREE.Color(color);
  // Pale limestone retains its warm hue without clipping under outdoor light.
  if (Math.max(albedo.r,albedo.g,albedo.b) > .65) albedo.multiplyScalar(.68);
  const mat = new THREE.MeshStandardMaterial({color: albedo, roughness});
  mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vStonePosition;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 stoneLocal = vec4(transformed,1.);\n#ifdef USE_INSTANCING\nstoneLocal = instanceMatrix * stoneLocal;\n#endif\nvStonePosition = (modelMatrix * stoneLocal).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vStonePosition;
      float grain(vec3 p){return fract(sin(dot(floor(p),vec3(127.1,311.7,74.7)))*43758.5453);}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float g = grain(vStonePosition * 23.0);
      float strata = sin(vStonePosition.y * 5.4 + sin(vStonePosition.x*.17)*2.0);
      vec2 masonry = vec2(vStonePosition.x + vStonePosition.z, vStonePosition.y) / vec2(1.8,.65);
      masonry.x += mod(floor(masonry.y),2.)*.5;
      vec2 edge = min(fract(masonry),1.-fract(masonry));
      float seam = 1.-smoothstep(.012,.04,min(edge.x,edge.y));
      diffuseColor.rgb *= (.88 + g*.08 + strata*.035) * (1.-seam*.15*${masonry ? '1.' : '0.'});`);
  };
  mat.customProgramCacheKey = () => `natural-world-v2-${masonry ? "masonry" : "mineral"}`;
  return mat;
}
/**
 * Textured PBR material for sanctuary architecture. `maps` comes from architecture/surfaces.js
 * (tileable albedo / normal / roughness in metric UV space). A world-space macro variation breaks
 * tiling across large walls and plazas, and `envBoost` lifts image-based reflections for metals
 * (the scene environment intensity is deliberately low for stone and foliage).
 */
export function architectureMaterial(color, o = {}) {
  const albedo = new THREE.Color(color);
  const lum = Math.max(albedo.r, albedo.g, albedo.b);
  if (lum > .72) albedo.multiplyScalar(.72 / lum + (1 - .72 / lum) * .35);
  const maps = o.maps;
  const mat = new THREE.MeshStandardMaterial({
    color: albedo, roughness: maps ? (o.roughness ?? 1) : (o.roughness ?? .9), metalness: o.metalness ?? 0,
    map: maps?.map ?? null, normalMap: maps?.normalMap ?? null, roughnessMap: maps?.roughnessMap ?? null,
  });
  if (maps) {
    for (const t of [maps.map, maps.normalMap, maps.roughnessMap]) t.repeat.set(1 / maps.tile, 1 / maps.tile);
    mat.normalScale.set(maps.normalScale * (o.normal ?? 1), maps.normalScale * (o.normal ?? 1));
  }
  const macro = o.macro ?? .14, boost = o.envBoost ?? 1, wear = o.wear ?? .22, grime = o.grime ?? 1.6;
  mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vArchWorld;\nattribute vec4 aEdge;\nvarying vec4 vEdge;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 archLocal = vec4(transformed,1.);\n#ifdef USE_INSTANCING\narchLocal = instanceMatrix * archLocal;\n#endif\nvArchWorld = (modelMatrix * archLocal).xyz;\nvEdge = aEdge;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vArchWorld;
      varying vec4 vEdge;
      float archHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float archNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(archHash(i),archHash(i+vec3(1,0,0)),f.x),mix(archHash(i+vec3(0,1,0)),archHash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(archHash(i+vec3(0,0,1)),archHash(i+vec3(1,0,1)),f.x),mix(archHash(i+vec3(0,1,1)),archHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float archMacro = archNoise(vArchWorld*.09)*.65 + archNoise(vArchWorld*.31)*.35;
      diffuseColor.rgb *= 1. - ${macro.toFixed(3)} + archMacro * ${(macro * 2).toFixed(3)};
      // weathering from builder face coordinates (vEdge = u, v, width, height[<0: horizontal face])
      float archWear = 0., archGrime = 0.;
      if (vEdge.z > 0.) {
        float fw = vEdge.z, fh = abs(vEdge.w);
        float d = min(min(vEdge.x, fw - vEdge.x), min(vEdge.y, fh - vEdge.y));
        archWear = (1. - smoothstep(.012, .085, d)) * (.55 + archNoise(vArchWorld * 7.) * .9);
        if (vEdge.w > 0.) {
          float reach = min(1.7, fh * .45);
          archGrime = (1. - smoothstep(0., reach, vEdge.y)) * .42;                    // contact grime / AO at the base
          archGrime += (1. - smoothstep(0., min(.45, fh * .2), fh - vEdge.y)) * .14;  // shadowed under the cap / eave
          float streak = archNoise(vec3((vArchWorld.x + vArchWorld.z) * 2.1, vArchWorld.y * .16, 3.));
          archGrime += smoothstep(.55, .85, streak) * .16 * (1. - vEdge.y / max(fh, .01));   // rain streaks fading upward
        }
      }
      diffuseColor.rgb *= (1. + archWear * ${wear.toFixed(3)}) * (1. - archGrime * ${grime.toFixed(3)});`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
      radiance *= ${boost.toFixed(2)};`);
  };
  mat.customProgramCacheKey = () => `arch-v2-${macro}-${boost}-${wear}-${grime}`;
  return mat;
}
export function terrainMaterial() {
  // Terrain masks come from the same heightfield used by movement: roads remain legible,
  // steep faces expose mineral strata, and volcanic channels glow only where lava exists.
  const material = new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.94});
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 terrainMask; varying vec3 vGround; varying vec3 vGroundMask; varying float vSlope;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround=(modelMatrix*vec4(position,1.)).xyz; vGroundMask=terrainMask; vSlope=1.-normal.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGround; varying vec3 vGroundMask; varying float vSlope;
        float groundHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float groundNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(groundHash(i),groundHash(i+vec2(1,0)),f.x),mix(groundHash(i+vec2(0,1)),groundHash(i+vec2(1)),f.x),f.y);}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float macro=groundNoise(vGround.xz*.065), soil=groundNoise(vGround.xz*1.7);
        float detailFade=1.-smoothstep(.1,1.,length(fwidth(vGround.xz)));
        float grit=mix(.5,groundNoise(vGround.xz*14.),detailFade);
        diffuseColor.rgb *= .76 + macro*.30 + soil*.10 + grit*.08;
        float slope=smoothstep(.08,.37,vSlope)*(1.-vGroundMask.x);
        float layers=.5+.5*sin(vGround.y*2.3+groundNoise(vGround.xz*.18)*3.);
        vec3 rock=mix(diffuseColor.rgb,vec3(.24,.23,.21),.46)*(.82+layers*.25);
        diffuseColor.rgb=mix(diffuseColor.rgb,rock,slope);
        float road=clamp(vGroundMask.x,0.,1.);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*(.83+soil*.28),road);
        float lava=clamp(vGroundMask.z,0.,1.);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.055,.025),lava*.85);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float hot=smoothstep(.35,.85,vGroundMask.z);
        totalEmissiveRadiance+=vec3(1.,.17,.015)*hot*(.65+groundNoise(vGround.xz*.8)*.7);`);
  };
  material.customProgramCacheKey=()=> 'aetherion-terrain-strata-v1';
  return material;
}
export function waterMaterial() {
  const material = new THREE.MeshPhysicalMaterial({color: '#174e59', roughness: .19, metalness: .28, transparent: true, opacity: .86, clearcoat: 1, clearcoatRoughness:.12});
  const time = {value:0};
  material.onBeforeCompile = shader => {
    shader.uniforms.waterTime=time;
    shader.vertexShader=shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float waterTime;\nvarying vec3 vWave;').replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.z += sin(position.x*.09 + waterTime*.9)*.23 + sin(position.y*.13-waterTime*.7)*.17;
      vWave = vec3(position.x,position.y,waterTime);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWave;').replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      normal = normalize(normal + vec3(sin(vWave.x*.34+vWave.z*1.1)*.10, cos(vWave.y*.29-vWave.z)*.12, 0.));`);
  };
  return {material,time};
}

export function pavingMaterial(color) {
  const material=new THREE.MeshStandardMaterial({color,roughness:.88});
  material.onBeforeCompile=s=>{
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vPaving;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvPaving=(modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 vPaving;
    float stoneHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`)
    .replace('#include <color_fragment>',`#include <color_fragment>
    vec2 stoneUV=vPaving.xz/vec2(2.4,1.6);
    stoneUV.x+=mod(floor(stoneUV.y),2.)*.5;
    vec2 edge=min(fract(stoneUV),1.-fract(stoneUV));
    float aa=max(fwidth(stoneUV.x),fwidth(stoneUV.y));
    float grout=1.-smoothstep(.012-aa,.025+aa,min(edge.x,edge.y));
    float slab=stoneHash(floor(stoneUV));
    float wear=sin(vPaving.x*11.+sin(vPaving.z*17.))*sin(vPaving.z*8.);
    diffuseColor.rgb*=.78+slab*.24+wear*.018;
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.40,grout);`);
  };return material;
}
