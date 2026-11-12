// One procedural material for a whole costume. Each vertex carries its colour and a material triple
// (roughness, metalness, kind); the fragment program adds woven, fired, tanned or forged surface detail in the
// mesh's rest space, so it stays glued to the cloth while the rig moves. No textures, no canvas: it also
// constructs in Node.
import { DoubleSide, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking } from 'three';
import { NOISE } from '../surface.js';
import { MOTION_PARS, MOTION_VERTEX, motionUniforms } from './clearance.js';
import { FOLD_FRAGMENT, FOLD_FRAGMENT_PARS, FOLD_VERTEX, FOLD_VERTEX_PARS } from './folds.js';

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
    csH = thread * .3 + mid * .9 + slub * .3;
    diffuseColor.rgb *= .58 + macro * .5 + mid * .2 + thread * .22 + slub * .1;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.5 + vec3(.012, .01, .009), wear * .45);
    roughnessFactor = clamp(roughnessFactor - wear * .12 + thread * .05, .62, 1.);
  } else if (kind < 1.5) {    // fired ceramic: pitted, chipped pale at the rims, flashed dark by the kiln
    float pits = smoothstep(.45, .8, csNoise(vCsP * 95.)) * csLod(vCsP, .02), pores = smoothstep(.5, .9, csNoise(vCsP * 300.)) * lod;
    float chip = smoothstep(.5, .62, csFbm(vCsP * 34. + 9.));
    float flash = smoothstep(.3, .8, macro + mid * .35);
    csH = -pits * 1.1 - pores * .25 - chip * .9 + mid * .5;
    diffuseColor.rgb *= (.62 + flash * .62 + mid * .2) * (1. - pits * .45) * (1. - pores * .25);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.35, 1.2, 1.05) + vec3(.02, .012, .008), chip * .5);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.42, .36, .34), smoothstep(.55, .9, csFbm(vCsP * 8. + 3.1) * .5 + .5) * .7);
    roughnessFactor = clamp(roughnessFactor - flash * .12 + pits * .1, .5, 1.);
  } else if (kind < 2.5) {    // leather: grain, creases, pale scuffs
    float cell = csNoise(vCsP * 300.) * lod, crease = pow(1. - abs(csNoise(vCsP * 46.)), 6.);
    float scuff = smoothstep(.25, .8, mid + macro * .5 - .2);
    csH = cell * .3 - crease * .9 + mid * .4;
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
    diffuseColor.rgb *= (.94 + macro * .1 + mid * .04) * .58;      // same level as the head's skin (head.js SHEET_SKIN_LEVEL)
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, .88, .84), smoothstep(.3, .8, mid * .5 + .5) * .3);
  } else if (kind < 5.5) {    // hair: strands along the lock
    float strand = csNoise(vCsP * vec3(700., 160., 700.)) * lod, band_ = csNoise(vCsP * vec3(120., 30., 120.));
    csH = band_ * .35; diffuseColor.rgb *= .75 + strand * .2 + band_ * .3 + macro * .2;
    roughnessFactor = clamp(roughnessFactor + .12 + strand * .1 - band_ * .08, .45, .85);
  } else if (kind < 6.5) {    // hollow: the dark inside of a vent or buckle
    diffuseColor.rgb *= .25;
  } else if (kind < 7.5) {    // ember: lit from within (see the emissive pass)
  } else if (kind < 8.5) {    // polished metal: brass, gold, bronze, steel, silver, copper
    float brush = csNoise(vCsP * vec3(60., 900., 60.)) * lod, tarnish = smoothstep(.35, .85, macro * .55 + mid * .5);
    csH = brush * .12 + mid * .12;
    diffuseColor.rgb *= (.9 + brush * .12) * (1. - tarnish * .42);
    roughnessFactor = clamp(roughnessFactor + tarnish * .3 + brush * .05, .12, .8);
  } else if (kind < 9.5) {    // wood: long grain with rings and the odd knot
    vec3 g = vCsP * vec3(70., 7., 70.); float ringv = fract(length(g.xz + csFbm(vCsP * 9.) * 1.8) * 1.3);
    float grain = csNoise(vCsP * vec3(700., 30., 700.)) * lod, line = smoothstep(.0, .12, ringv) * smoothstep(.55, .2, ringv);
    csH = line * .7 + grain * .35;
    diffuseColor.rgb *= .62 + line * .42 + grain * .1 + macro * .12;
    roughnessFactor = clamp(roughnessFactor + line * .12, .4, .95);
  } else if (kind < 10.5) {   // bamboo: smooth culm, a node ring every hand's breadth, fine fibres
    float node = pow(abs(sin(vCsP.y * 26.)), 40.), fibre = csNoise(vCsP * vec3(800., 20., 800.)) * lod;
    csH = node * 1.6 + fibre * .15;
    diffuseColor.rgb *= (.85 + fibre * .1 + macro * .18) * (1. - node * .45);
    roughnessFactor = clamp(roughnessFactor + node * .3, .3, .9);
  } else if (kind < 11.5) {   // enamel, porcelain, lacquer: a deep even coat, pooled darker in the hollows
    float pool = smoothstep(.3, .8, mid * .5 + macro * .5), speck = smoothstep(.82, .95, csNoise(vCsP * 300.)) * lod;
    csH = mid * .08; diffuseColor.rgb *= (.9 + pool * .16) * (1. - speck * .25);
    roughnessFactor = clamp(roughnessFactor + speck * .3, .08, .6);
  } else if (kind < 12.5) {   // glass: dark and clear face-on, bright at the rim (finished in the emissive pass)
    diffuseColor.rgb *= .22 + mid * .05;
  } else if (kind < 13.5) {   // ice, crystal: milky veils inside a clear body (facets and glow in the emissive pass)
    float veil = smoothstep(.1, .8, csFbm(vCsP * 40.) * .5 + .5), crack = pow(1. - abs(csNoise(vCsP * 55.)), 14.);
    diffuseColor.rgb = diffuseColor.rgb * (.5 + veil * .5) + vec3(crack * .25);
    csH = crack * 1.2; roughnessFactor = clamp(roughnessFactor + veil * .2, .05, .5);
  } else {                    // nacre: mother-of-pearl, colour turns with the viewing angle (emissive pass)
    csH = csNoise(vCsP * 120.) * .2; diffuseColor.rgb *= .8 + macro * .2;
  }
`;

// Effects that need the surface normal: inner light, glass rims, crystal facets, nacre's turning colour.
const OPTICS = /* glsl */`
  {
    float k = vSm.z; vec3 viewDir = normalize(vViewPosition);
    if (k > 6.5 && k < 7.5) totalEmissiveRadiance += vColor.rgb * 2.2;
    else if (k > 11.5 && k < 12.5) {
      float rim = pow(1. - abs(dot(normal, viewDir)), 2.2);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.75, .85, .9), rim * .55);
      totalEmissiveRadiance += vColor.rgb * (.1 + .5 * pow(1. - rim, 3.) * (.6 + .4 * csNoise(vCsP * 30.)));     // light held inside
    } else if (k > 12.5 && k < 13.5) {
      vec3 facet = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition))); if (dot(facet, normal) < 0.) facet = -facet;
      normal = normalize(mix(normal, facet, .75));
      float rim = pow(1. - abs(dot(normal, viewDir)), 2.);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.92, .97, 1.), rim * .6);
      totalEmissiveRadiance += vColor.rgb * (.14 + .22 * (1. - rim));
    } else if (k > 13.5) {
      float turn = dot(normal, viewDir);
      vec3 sheenC = .5 + .5 * cos(6.2832 * (turn * 1.4 + csNoise(vCsP * 18.) * .35 + vec3(.0, .33, .67)));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (.6 + sheenC * .8), .55);
    }
  }
`;

/** @param motion per-costume numbers from clearance.js (leg joints, bones and radii); null leaves cloth as skinned */
export function costumeMaterial(motion = null) {
  const material = new MeshStandardMaterial({ name: 'sheet-costume', vertexColors: true, side: DoubleSide, roughness: 1, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, motionUniforms(motion));
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 sm;\nvarying vec3 vSm;\nvarying vec3 vCsP;\n${MOTION_PARS}${FOLD_VERTEX_PARS}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${MOTION_VERTEX}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvCsP = position; vSm = sm; ${FOLD_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSm;\nvarying vec3 vCsP;\n${FOLD_FRAGMENT_PARS}${NOISE}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\nfloat csH = 0.;\n{${DETAIL}}\n{${FOLD_FRAGMENT}}`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = csBump(-vViewPosition, normal, csH * .0011);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${OPTICS}`);
  };
  material.customProgramCacheKey = () => 'sheet-costume-7';
  return material;
}

/** Depth material for the shadow pass that moves cloth the same way, so shadows follow the settled garment. */
export function costumeDepthMaterial(motion = null) {
  const material = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, motionUniforms(motion));
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${MOTION_PARS}`).replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${MOTION_VERTEX}`);
  };
  material.customProgramCacheKey = () => 'sheet-costume-depth-1';
  return material;
}
