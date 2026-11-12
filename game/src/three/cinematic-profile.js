// Neutral, bounded presentation controls. No realm palette substitutions.
export function cinematicProfile(quality = {}) {
  const high = quality.name === 'high' || quality.name === 'ultra';
  return {
    ao: Boolean(quality.ssao && high), aoScale: quality.name === 'ultra' ? .75 : .5,
    aoSamples: quality.name === 'ultra' ? 16 : 8, aoIntensity: .65,
    bloom: Boolean(quality.bloom), bloomStrength: .32, bloomRadius: .32,
    contrast: 1.025, saturation: .98, vignette: .08,
    practicalLights: quality.name === 'low' ? 2 : quality.name === 'medium' ? 4 : 6,
  };
}
export const CinematicGrade = {
  uniforms: { tDiffuse: { value: null }, contrast: { value: 1.025 }, saturation: { value: .98 }, vignette: { value: .08 } },
  vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float contrast; uniform float saturation; uniform float vignette; varying vec2 vUv;
  void main(){vec4 tex=texture2D(tDiffuse,vUv);vec3 c=max(tex.rgb,vec3(0.));float l=dot(c,vec3(.2126,.7152,.0722));
    c=mix(vec3(l),c,saturation);c*=pow(max(l,.0001),contrast-1.);
    vec2 p=vUv*2.-1.;float edge=smoothstep(.35,1.55,dot(p,p));c*=1.-vignette*edge;
    gl_FragColor=vec4(c,tex.a);}`,
};
