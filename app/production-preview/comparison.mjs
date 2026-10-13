import * as THREE from 'three';
export const PRESETS = {front:[0,0,1],side:[1,0,0],back:[0,0,-1],threequarter:[1,.65,1],perspective:[1,.65,1]};
/** Camera framing only: never scales or transforms the authored asset. */
export function frameCamera(camera, {preset,center,height,aspect,offset=0}) {
 if(!PRESETS[preset] || ![height,aspect,offset,...center].every(Number.isFinite) || height<=0 || aspect<=0)throw new Error('Invalid comparison framing');
 const target=new THREE.Vector3(...center);target.y+=offset;
 const distance=camera.isPerspectiveCamera?height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))):height*2;
 camera.position.copy(target).add(new THREE.Vector3(...PRESETS[preset]).normalize().multiplyScalar(distance));
 camera.zoom=1;
 if(camera.isOrthographicCamera){camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;}
 else camera.aspect=aspect;
 camera.near=Math.max(height/10000,.00001);camera.far=Math.max(height*100,100);camera.lookAt(target);camera.updateProjectionMatrix();return target;
}
export function referencesForAsset(asset, references) {
 const ids=new Set(asset?.referenceIds || []);return references.filter(reference=>ids.has(reference.id));
}
/** Replacement removes prior image before assigning next; stale image events cannot label a new selection. */
export function showReference(image, link, description, reference) {
 image.onload=null;image.onerror=null;image.hidden=true;image.removeAttribute('src');link.removeAttribute('href');
 if(!reference){image.alt='';description.textContent='No indexed reference declared for this asset.';return;}
 image.alt=reference.name;description.textContent=`${reference.id} · ${reference.name}`;
 const expected=reference.url;
 image.onload=()=>{if(image.getAttribute('src')===expected)image.hidden=false;};
 image.onerror=()=>{if(image.getAttribute('src')===expected){image.hidden=true;description.textContent=`Reference could not load: ${reference.id}`;}};
 image.src=expected;link.href=expected;
}

/** Update ancestors and descendants before measuring, even before the first render. */
export function comparisonBounds(viewGroup, asset) {
 viewGroup.updateWorldMatrix(true,true);
 return new THREE.Box3().setFromObject(asset);
}
