// Register the garment relief to the actor's bind-space chest and hips. The side
// seam fades to the underlying material, including on large capes and sleeves.
import { TextureLoader, Vector4 } from 'three';

let atlas;
const strength = { value: 0 };
function garmentAtlas() {
  if (!atlas) {
    atlas = new TextureLoader().load('./assets/characters/reconstruction/tailoring.webp',
      () => { strength.value = 1; }, undefined, () => { atlas = undefined; });
    atlas.flipY = false;
  }
  return atlas;
}

export function applyTailoring(material, recipe, form) {
  const match = /^oath-(\d{2})-(ninja|sorcerer)$/.exec(recipe);
  if (!match || typeof document === 'undefined') return material;
  const costumeIndex = (Number(match[1]) - 1) * 2 + Number(match[2] === 'sorcerer');
  const { Y, section } = form.trunk;
  const frame = new Vector4(section(Y.chest).a, Y.hip, Y.shoulder - Y.hip, form.spineZ(Y.chest));
  const texture = garmentAtlas();
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.uniforms.garmentStrength = strength;
    shader.uniforms.garmentAtlas = { value: texture };
    shader.uniforms.garmentFrame = { value: frame };
    shader.uniforms.garmentCell = { value: costumeIndex * 2 };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D garmentAtlas;
        uniform vec4 garmentFrame;
        uniform float garmentCell, garmentStrength;`)
      .replace('#include <normal_fragment_maps>', `
        {
          float kind = vSm.z;
          float chestX = vCsP.x / garmentFrame.x;
          float chestY = (vCsP.y - garmentFrame.y) / garmentFrame.z;
          float depth = vCsP.z - garmentFrame.w;
          float mask = (1.0 - smoothstep(.72, 1.0, abs(chestX)))
            * smoothstep(0.0, .09, chestY) * (1.0 - smoothstep(.9, 1.0, chestY))
            * smoothstep(.025, .09, abs(depth));
          if (mask > .001 && (kind < 3.5 || (kind > 7.5 && kind < 8.5) || (kind > 10.5 && kind < 11.5))) {
            float cell = garmentCell + step(depth, 0.0);
            vec2 tile = vec2(mod(cell, 10.0), floor(cell / 10.0));
            vec2 panel = clamp(vec2(.5 + .5 * chestX * sign(depth), 1.0 - chestY), .005, .995);
            float relief = (texture2D(garmentAtlas, (tile + panel) / vec2(10., 6.)).r - .502) * mask * garmentStrength;
            diffuseColor.rgb *= 1.0 + .85 * relief;
            csH += .7 * relief;
          }
        }
        #include <normal_fragment_maps>`);
  };
  material.customProgramCacheKey = () => cacheKey + '-tailored-v1';
  return material;
}
