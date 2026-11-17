// Front-only reference albedo on fully three-dimensional skin. Unknown side/rear
// regions retain the existing skin material; a missing texture keeps that fallback.
import { TextureLoader, SRGBColorSpace } from 'three';
const keys = new Set(['oath-01-sorcerer', 'oath-03-sorcerer', 'oath-14-sorcerer']);
const entries = new Map();
export function referenceFacesReady() {
  const pending = [...entries.values()].map(entry => entry.ready);
  if (portraits) pending.push(portraits.loaded);
  return Promise.all(pending);
}
export function applyReferenceFace(material, key, H) {
  if (!keys.has(key)) return material;
  if (!entries.has(key)) {
    const entry={strength:{value:0}};
    entry.ready=new Promise(resolve=>{
      entry.texture=new TextureLoader().load(new URL(`./assets/characters/reconstruction/${key}-face.png`,document.baseURI).href,
        ()=>{entry.strength.value=1;resolve(true);},undefined,
        ()=>{console.warn(`[characters] Reference albedo unavailable: ${key}`);resolve(false);});
    });
    entry.texture.colorSpace=SRGBColorSpace;entries.set(key,entry);
  }
  const entry=entries.get(key), previous=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    previous(shader,renderer);
    shader.uniforms.referenceFace={value:entry.texture};
    shader.uniforms.referenceHeadHeight={value:H};
    shader.uniforms.referenceFaceStrength=entry.strength;
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D referenceFace;\nuniform float referenceHeadHeight,referenceFaceStrength;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 faceP=vCsP/referenceHeadHeight;
      vec2 faceUv=vec2(faceP.x/.8+.5,faceP.y+.5);
      float faceMask=smoothstep(.20,.31,faceP.z)
        *(1.-smoothstep(.26,.34,abs(faceP.x)))
        *smoothstep(-.53,-.44,faceP.y)*(1.-smoothstep(.23,.32,faceP.y));
      diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(referenceFace,faceUv).rgb,faceMask*referenceFaceStrength);
    `);
  };
  material.customProgramCacheKey=()=>`reference-face-v1-${key}`;
  material.userData.reference=key;
  return material;
}

// Each tile is registered at the eye line and mouth of its own original sheet.
// The eye opening, ears, silhouette, scalp and neck retain their 3D materials.
const portraitSheets = new Set([62,64,66,67,70,72,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91]);
let portraits;
export function applySheetPortrait(material, sheet, H) {
  const number = Number(sheet?.replace('reference-', ''));
  if (!portraitSheets.has(number) || typeof document === 'undefined') return material;
  if (!portraits) {
    const ready = { value: 0 };
    let texture;
    const loaded = new Promise(resolve => {
      texture = new TextureLoader().load('./assets/characters/reconstruction/portrait-atlas.webp',
        () => { ready.value = 1; resolve(true); }, undefined,
        () => { console.warn('[characters] Portrait atlas unavailable'); resolve(false); });
    });
    texture.colorSpace = SRGBColorSpace;
    portraits = { texture, ready, loaded };
  }
  const previous = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    Object.assign(shader.uniforms, {
      csPortraits: { value: portraits.texture }, csPortraitReady: portraits.ready,
      csPortraitTile: { value: number - 62 }, csPortraitHeight: { value: H },
    });
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nuniform sampler2D csPortraits;\nuniform float csPortraitReady, csPortraitTile, csPortraitHeight;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `
      vec3 facePos = vCsP / csPortraitHeight;
      vec2 tileUv = clamp(vec2(.5 + facePos.x / .8, .5 + facePos.y), .01, .99);
      vec2 origin = vec2(mod(csPortraitTile, 6.), 4. - floor(csPortraitTile / 6.));
      vec3 pigment = texture2D(csPortraits, (origin + tileUv) / vec2(6., 5.)).rgb;
      float faceCenter = 1. - smoothstep(.22, .31, abs(facePos.x));
      float hairline = 1. - smoothstep(.17, .29, facePos.y);
      float chin = smoothstep(-.49, -.39, facePos.y);
      vec2 eyelid = vec2((abs(facePos.x) - .148) / .073, (facePos.y + .005) / .034);
      float eyeMargin = smoothstep(.84, 1.40, length(eyelid));
      float blend = .82 * csPortraitReady * smoothstep(.18, .32, facePos.z)
                    * faceCenter * hairline * chin * eyeMargin;
      diffuseColor.rgb = mix(diffuseColor.rgb, pigment * .66, blend);
      #include <metalnessmap_fragment>
    `);
  };
  material.customProgramCacheKey = () => cacheKey() + '|sheet-portrait-1';
  return material;
}
