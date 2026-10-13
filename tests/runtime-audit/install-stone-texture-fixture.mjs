/** Test-only adaptation of the browser image-decode boundary, never gameplay.
 * The adapter accepts exactly four actual source stone textures. Other URLs
 * still go through the original TextureLoader, including GLB image loading.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function installStoneTextureFixture(THREE, manifestPath, sourceRoot) {
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 const allowed=new Set(['color.jpg','normal.jpg','roughness.jpg','ao.jpg'].map(n=>'./textures/cathedral/'+n));
 const rows=new Map(manifest.textures.map(row=>[row.url,row]));
 if(rows.size!==allowed.size||[...rows.keys()].some(url=>!allowed.has(url)))throw new Error('Unexpected texture fixture whitelist');
 const sha=b=>createHash('sha256').update(b).digest('hex');
 const original=THREE.TextureLoader.prototype.load;
 const textureDefaults=new THREE.Texture();
 const evidence={method:'Test-only TextureLoader interception for four exact source stone JPEG URLs. Actual Pillow-decoded RGBA8 bytes become Three DataTextures; source image dimensions and bytes are verified by SHA-256. Other URLs use original loader. No gameplay, source material, shader or setting is replaced.',decoder:manifest.decoder,decoderVersion:manifest.decoderVersion,requests:[],callbacksCompleted:0,sourceTextures:manifest.textures.map(({fixturePath,...row})=>row),limitation:'DataTexture substitutes decoded image transport. Browser JPEG/color decoding, GPU upload/mipmap generation, texture sampling and final appearance remain unverified.'};
 THREE.TextureLoader.prototype.load=function(url,onLoad,onProgress,onError) {
  if(!allowed.has(url))return original.call(this,url,onLoad,onProgress,onError);
  const row=rows.get(url),source=fs.readFileSync(path.join(sourceRoot,row.source)),decoded=fs.readFileSync(row.fixturePath);
  if(sha(source)!==row.sourceSha256||sha(decoded)!==row.decodedSha256||decoded.length!==row.width*row.height*4)throw new Error(`Fixture integrity mismatch: ${url}`);
  const texture=new THREE.DataTexture(new Uint8Array(decoded),row.width,row.height,THREE.RGBAFormat,THREE.UnsignedByteType);
  // DataTexture defaults differ from Image-based TextureLoader output. Match
  // Texture's sampler/orientation defaults before the source customizes them.
  for(const key of ['mapping','wrapS','wrapT','magFilter','minFilter','anisotropy','generateMipmaps','premultiplyAlpha','flipY','unpackAlignment','colorSpace'])texture[key]=textureDefaults[key];
  texture.needsUpdate=true;
  evidence.requests.push(url);
  this.manager.itemStart(url);
  queueMicrotask(()=>{try{onLoad?.(texture);evidence.callbacksCompleted++;}finally{this.manager.itemEnd(url);}});
  return texture;
 };
 return {evidence,restore(){THREE.TextureLoader.prototype.load=original;textureDefaults.dispose();}};
}
