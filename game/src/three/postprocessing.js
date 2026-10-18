// Uses Three.js r180 HDR passes and the original Ability Matrix refraction shader.
// Scene depth is packed exactly as the source soft-particle shaders expect.
import { Color, HalfFloatType, MeshDepthMaterial, RGBADepthPacking, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DistortionShader } from '../../../runtime/ability-matrix/packs/sandbox/src/postprocessing/DistortionShader.js';

export function createPostprocessing(renderer, scene, camera, quality) {
  const depthTarget = new WebGLRenderTarget(2, 2);
  depthTarget.texture.generateMipmaps = false;
  const depthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  const enabled = quality.bloom && renderer.extensions.has('EXT_color_buffer_float');
  const clearColor = new Color(), distortionClear = new Color(.5, .5, 0);
  let composer, scenePass, bloom, output, distortionPass, distortionTarget;
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
    bloom = new UnrealBloomPass(new Vector2(1, 1), .38, .38, 1.05);
    output = new OutputPass();
    for (const pass of [scenePass, distortionPass, bloom, output]) composer.addPass(pass);
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
      const w = Math.max(2, Math.floor(width * pixelRatio / 2));
      const h = Math.max(2, Math.floor(height * pixelRatio / 2));
      depthTarget.setSize(w, h); distortionTarget?.setSize(w, h);
    },
    dispose() {
      depthTarget.dispose(); depthMaterial.dispose(); distortionTarget?.dispose();
      scenePass?.dispose(); distortionPass?.dispose(); bloom?.dispose(); output?.dispose(); composer?.dispose();
    },
  };
}
