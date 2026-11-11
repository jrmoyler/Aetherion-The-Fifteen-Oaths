// One procedural material for a whole costume. Each vertex carries its colour and a material triple
// (roughness, metalness, kind); the fragment program adds woven, fired, tanned or forged surface detail in the
// mesh's rest space, so it stays glued to the cloth while the rig moves. No textures, no canvas: it also
// constructs in Node.
import { DoubleSide, MeshStandardMaterial } from 'three';
import { NOISE } from '../surface.js';

const DETAIL = /* glsl */`
  float kind = vSm.z; roughnessFactor = vSm.x; metalnessFactor = vSm.y;
  float lod = csLod(vCsP, .004);
  float blot = csFbm(vCsP * 13.);
  if (kind < .5) {            // firecloth: coarse plain weave, sooty
    vec3 q = vCsP * 760.;
    float warp = sin(q.x + q.z * .7) * .5 + .5, weft = sin(q.y * 1.15 + q.z * .35) * .5 + .5;
    float thread = mix(warp, weft, step(0., sin(q.x * .5) * sin(q.y * .575)));
    csH = (thread - .5) * .8 * lod + blot * .3;
    diffuseColor.rgb *= .8 + thread * .34 * lod + blot * .16;
    roughnessFactor = clamp(roughnessFactor + thread * .05, .6, 1.);
  } else if (kind < 1.5) {    // fired ceramic: porous, mottled by the kiln, scorched low
    float pits = smoothstep(.5, .86, csNoise(vCsP * 210.)) * csLod(vCsP, .008);
    float grit = csNoise(vCsP * 520.) * lod;
    float scorch = smoothstep(.15, .75, csFbm(vCsP * 6. + 3.1));
    csH = -pits * 1.1 + grit * .2 + blot * .2;
    diffuseColor.rgb *= (.82 + blot * .3 + grit * .06) * (1. - pits * .42);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.5, .42, .4), scorch * .4);
    roughnessFactor = clamp(roughnessFactor - blot * .08 + pits * .1, .55, 1.);
  } else if (kind < 2.5) {    // leather: grain, creases, worn edges
    float cell = csNoise(vCsP * 380.) * lod, crease = pow(1. - abs(csNoise(vCsP * 64.)), 7.);
    csH = cell * .45 - crease * .7;
    diffuseColor.rgb *= .86 + cell * .1 + blot * .18 - crease * .2;
    roughnessFactor = clamp(roughnessFactor + cell * .06 - blot * .1, .4, .9);
  } else if (kind < 3.5) {    // oxidized iron: pitted, rust in the low spots
    float pits = smoothstep(.6, .92, csNoise(vCsP * 420.)) * lod, rust = smoothstep(.1, .8, csFbm(vCsP * 30. + 7.));
    csH = -pits * .8 + blot * .15;
    diffuseColor.rgb = mix(diffuseColor.rgb * (.85 + blot * .25), diffuseColor.rgb * vec3(1.5, .82, .55), rust * .38) * (1. - pits * .3);
    metalnessFactor *= 1. - rust * .45; roughnessFactor = clamp(roughnessFactor + rust * .28 + pits * .2, .3, .95);
  } else if (kind < 4.5) {    // skin
    float pores = smoothstep(.4, .9, csNoise(vCsP * 1100.)) * csLod(vCsP, .0018);
    csH = -pores * .2 + blot * .05;
    diffuseColor.rgb *= 1. + blot * .06 - pores * .04;
  } else if (kind < 5.5) {    // hair: strands along the lock
    float strand = csNoise(vCsP * vec3(900., 240., 900.)) * lod;
    csH = strand * .6; diffuseColor.rgb *= .8 + strand * .3 + blot * .15;
    roughnessFactor = clamp(roughnessFactor + strand * .12, .3, .8);
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
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = csBump(-vViewPosition, normal, csH * .0004);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (vSm.z > 6.5) totalEmissiveRadiance += vColor.rgb * 2.2;');
  };
  material.customProgramCacheKey = () => 'sheet-costume-1';
  return material;
}
