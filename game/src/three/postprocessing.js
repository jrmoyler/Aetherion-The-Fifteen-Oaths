// Uses Three.js r180 HDR passes and the original Ability Matrix refraction shader.
// Scene depth is packed exactly as the source soft-particle shaders expect.
import { Color, HalfFloatType, MeshDepthMaterial, RGBADepthPacking, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { cinematicProfile, CinematicGrade } from './cinematic-profile.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DistortionShader } from '../../../runtime/ability-matrix/packs/sandbox/src/postprocessing/DistortionShader.js';

// Bloom-input cap. The Ability Matrix source shaders were authored for a near-zero bloom
// (source settings: strength 0.03) and carry their brightness in HDR glow values far above 1.
// The game's world bloom is much stronger, so uncapped VFX cores (beams, domes, pillars) flooded
// the whole frame white. Capping only what feeds the bloom keeps the displayed HDR image (and
// hot white cores) untouched while bounding the halo each pixel can spread.
export const BLOOM_INPUT_CEILING = 2.4;
function capBloomInput(bloom, ceiling) {
  const m = bloom.materialHighPassFilter;
  m.uniforms.bloomCeiling = { value: ceiling };
  m.fragmentShader = m.fragmentShader
    .replace('uniform float smoothWidth;', 'uniform float smoothWidth;\nuniform float bloomCeiling;')
    .replace('gl_FragColor = mix( outputColor, texel, alpha );', 'texel.rgb = max( texel.rgb, vec3( 0.0 ) ) * min( 1.0, bloomCeiling / max( v, 1e-4 ) );\n\t\t\tgl_FragColor = mix( outputColor, texel, alpha );');
  m.needsUpdate = true;
}

export function createPostprocessing(renderer, scene, camera, quality) {
  const depthTarget = new WebGLRenderTarget(2, 2);
  depthTarget.texture.generateMipmaps = false;
  const depthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  const profile = cinematicProfile(quality);
  const enabled = Boolean((quality.bloom || quality.fxaa || profile.ao) && renderer.extensions.has('EXT_color_buffer_float'));
  const clearColor = new Color(), distortionClear = new Color(.5, .5, 0);
  let composer, scenePass, bloom, output, distortionPass, distortionTarget, ao, grade, fxaa;
  if (enabled) {
    const target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: Math.min(quality.msaa || 0, renderer.capabilities.maxSamples),
    });
    composer = new EffectComposer(renderer, target);
    scenePass = new RenderPass(scene, camera);
    distortionTarget = new WebGLRenderTarget(2, 2, { type: HalfFloatType });
    distortionTarget.texture.generateMipmaps = false;
    distortionPass = new ShaderPass(DistortionShader);
    distortionPass.uniforms.tDistortion.value = distortionTarget.texture;
    // HDR highlights bloom; pale architecture and skin retain their contrast.
    bloom = new UnrealBloomPass(new Vector2(1, 1), profile.bloomStrength, profile.bloomRadius, 1.05);
    bloom.enabled = profile.bloom;
    grade = new ShaderPass(CinematicGrade);
    fxaa = new ShaderPass(FXAAShader); fxaa.enabled = Boolean(quality.fxaa);
    if (profile.ao) {
      ao = new GTAOPass(scene, camera, 2, 2);
      ao.blendIntensity = profile.aoIntensity;
      ao.updateGtaoMaterial({ radius: 2.2, thickness: 1, distanceExponent: 1.2, distanceFallOff: 1, samples: profile.aoSamples });
      ao.updatePdMaterial({ radius: 4, depthPhi: 2, normalPhi: 3 });
    }
    output = new OutputPass();
    capBloomInput(bloom, BLOOM_INPUT_CEILING);
    for (const pass of [scenePass, ao, distortionPass, bloom, grade, output, fxaa].filter(Boolean)) composer.addPass(pass);
  }
  function auxiliary(target, layer, override, color, alpha) {
    const background = scene.background, material = scene.overrideMaterial;
    const mask = camera.layers.mask, previousTarget = renderer.getRenderTarget();
    renderer.getClearColor(clearColor);
    const previousAlpha = renderer.getClearAlpha(), shadowUpdate = renderer.shadowMap.autoUpdate;
    try {
      scene.background = null; scene.overrideMaterial = override;
      camera.layers.set(layer); renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(target); renderer.setClearColor(color, alpha);
      renderer.clear(); renderer.render(scene, camera);
    } finally {
      scene.background = background; scene.overrideMaterial = material;
      camera.layers.mask = mask; renderer.shadowMap.autoUpdate = shadowUpdate;
      renderer.setClearColor(clearColor, previousAlpha); renderer.setRenderTarget(previousTarget);
    }
  }
  return {
    enabled, depthTexture: depthTarget.texture,
    features: { hdr: enabled, ambientOcclusion: Boolean(ao), bloom: enabled && profile.bloom, fxaa: enabled && Boolean(quality.fxaa) },
    render(dt, activeSourceEffects = false) {
      if (activeSourceEffects) {
        auxiliary(depthTarget, 0, depthMaterial, 0xffffff, 1);
        if (enabled) auxiliary(distortionTarget, 2, null, distortionClear, 0);
      }
      if (composer) {
        distortionPass.enabled = activeSourceEffects;
        composer.render(dt);
      } else renderer.render(scene, camera);
    },
    resize(width, height, pixelRatio) {
      composer?.setPixelRatio(pixelRatio); composer?.setSize(width, height);
      ao?.setSize(Math.max(2, Math.round(width * pixelRatio * profile.aoScale)), Math.max(2, Math.round(height * pixelRatio * profile.aoScale)));
      fxaa?.uniforms.resolution.value.set(1 / Math.max(1, width * pixelRatio), 1 / Math.max(1, height * pixelRatio));
      const w = Math.max(2, Math.floor(width * pixelRatio / 2));
      const h = Math.max(2, Math.floor(height * pixelRatio / 2));
      depthTarget.setSize(w, h); distortionTarget?.setSize(w, h);
    },
    dispose() {
      depthTarget.dispose(); depthMaterial.dispose(); distortionTarget?.dispose();
      ao?.dispose(); grade?.dispose(); fxaa?.dispose(); scenePass?.dispose(); distortionPass?.dispose(); bloom?.dispose(); output?.dispose(); composer?.dispose();
    },
  };
}
