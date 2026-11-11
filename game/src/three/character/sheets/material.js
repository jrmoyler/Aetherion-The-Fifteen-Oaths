// One procedural material for a whole costume. Each vertex carries its colour and a material triple
// (roughness, metalness, kind); the fragment program adds woven, fired, tanned or forged surface detail in the
// mesh's rest space, so it stays glued to the cloth while the rig moves. No textures, no canvas: it also
// constructs in Node.
import { DoubleSide, MeshStandardMaterial } from 'three';
import { NOISE } from '../surface.js';

const DETAIL = /* glsl */`
  float kind = vSm.z; roughnessFactor = vSm.x; metalnessFactor = vSm.y;
  float lod = csLod(vCsP, .006);
  float macro = csFbm(vCsP * 4.6 + 1.7) * .5 + .5;      // hand-sized patches: soot, kiln flashing, handling
  float mid = csFbm(vCsP * 27.);                         // finger-sized mottling
  float fine = csNoise(vCsP * 150.);
  if (kind < .5) {            // firecloth: heavy twill, sooty and worn pale on the high spots
    vec3 q = vCsP * 520.;
    float twill = sin(q.x + q.y * .62 + q.z * .8) * .5 + .5, cross_ = sin(q.y * 1.3 - q.x * .2 + q.z * .4) * .5 + .5;
    float thread = mix(twill, cross_, .35) * lod;
    float slub = csNoise(vCsP * vec3(40., 260., 40.));
    float wear = smoothstep(.2, .75, mid + macro * .6 - .25);
    csH = thread * .5 + mid * .9 + slub * .35 + fine * .2;
    diffuseColor.rgb *= .58 + macro * .5 + mid * .2 + thread * .22 + slub * .1;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.5 + vec3(.012, .01, .009), wear * .45);
    roughnessFactor = clamp(roughnessFactor - wear * .12 + thread * .05, .62, 1.);
  } else if (kind < 1.5) {    // fired ceramic: pitted, chipped pale at the rims, flashed dark by the kiln
    float pits = smoothstep(.45, .8, csNoise(vCsP * 95.)) * csLod(vCsP, .02), pores = smoothstep(.5, .9, csNoise(vCsP * 300.)) * lod;
    float chip = smoothstep(.5, .62, csFbm(vCsP * 34. + 9.));
    float flash = smoothstep(.3, .8, macro + mid * .35);
    csH = -pits * 1.4 - pores * .5 - chip * 1.1 + mid * .5;
    diffuseColor.rgb *= (.62 + flash * .62 + mid * .2) * (1. - pits * .45) * (1. - pores * .25);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.35, 1.2, 1.05) + vec3(.02, .012, .008), chip * .5);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.42, .36, .34), smoothstep(.55, .9, csFbm(vCsP * 8. + 3.1) * .5 + .5) * .7);
    roughnessFactor = clamp(roughnessFactor - flash * .12 + pits * .1, .5, 1.);
  } else if (kind < 2.5) {    // leather: grain, creases, pale scuffs
    float cell = csNoise(vCsP * 300.) * lod, crease = pow(1. - abs(csNoise(vCsP * 46.)), 6.);
    float scuff = smoothstep(.25, .8, mid + macro * .5 - .2);
    csH = cell * .5 - crease * 1.1 + mid * .4;
    diffuseColor.rgb *= .62 + macro * .45 + cell * .12 - crease * .28;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.55 + vec3(.02, .014, .008), scuff * .4);
    roughnessFactor = clamp(roughnessFactor + cell * .06 - scuff * .16, .36, .9);
  } else if (kind < 3.5) {    // oxidized iron: pitted, rust in the low spots, bright where it rubs
    float pits = smoothstep(.55, .9, csNoise(vCsP * 240.)) * lod, rust = smoothstep(.25, .8, macro * .6 + mid * .5 + .1);
    csH = -pits * 1. + mid * .4;
    diffuseColor.rgb = mix(diffuseColor.rgb * (.7 + mid * .4), diffuseColor.rgb * vec3(1.7, .85, .5), rust * .5) * (1. - pits * .35);
    metalnessFactor *= 1. - rust * .55; roughnessFactor = clamp(roughnessFactor + rust * .3 + pits * .2 - (1. - rust) * .12, .28, .95);
  } else if (kind < 4.5) {    // skin
    float pores = smoothstep(.4, .9, csNoise(vCsP * 1100.)) * csLod(vCsP, .0018);
    csH = -pores * .08 + mid * .04;
    diffuseColor.rgb *= .94 + macro * .1 + mid * .04;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, .88, .84), smoothstep(.3, .8, mid * .5 + .5) * .3);
  } else if (kind < 5.5) {    // hair: strands along the lock
    float strand = csNoise(vCsP * vec3(700., 160., 700.)) * lod, band_ = csNoise(vCsP * vec3(120., 30., 120.));
    csH = strand * .5 + band_ * .5; diffuseColor.rgb *= .7 + strand * .3 + band_ * .35 + macro * .2;
    roughnessFactor = clamp(roughnessFactor + strand * .12 - band_ * .1, .28, .8);
  } else if (kind < 6.5) {    // hollow: the dark inside of a vent or buckle
    diffuseColor.rgb *= .25;
  }
`;

export function costumeMaterial() {
  const material = new MeshStandardMaterial({ name: 'sheet-costume', vertexColors: true, side: DoubleSide, roughness: 1, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 sm;\nvarying vec3 vSm;\nvarying vec3 vCsP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCsP = position; vSm = sm;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSm;\nvarying vec3 vCsP;\n${NOISE}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\nfloat csH = 0.;\n{${DETAIL}}`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = csBump(-vViewPosition, normal, csH * .0011);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (vSm.z > 6.5) totalEmissiveRadiance += vColor.rgb * 2.2;');
  };
  material.customProgramCacheKey = () => 'sheet-costume-2';
  return material;
}
