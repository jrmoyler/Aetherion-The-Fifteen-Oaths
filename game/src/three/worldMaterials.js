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
export function terrainMaterial() {
  const material=naturalMaterial('#ffffff'); material.vertexColors=true; return material;
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
