// Front-only reference albedo on fully three-dimensional skin. Unknown side/rear
// regions retain the existing skin material; a missing texture keeps that fallback.
import { TextureLoader, SRGBColorSpace } from 'three';
const keys = new Set(['oath-01-sorcerer', 'oath-03-sorcerer', 'oath-14-sorcerer']);
const entries = new Map();
export function referenceFacesReady() { return Promise.all([...entries.values()].map(e=>e.ready)); }
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
