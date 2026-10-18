// GPU wind for vegetation: a material plugin that sways vertices by their local height
// (trunk bend), with per-instance phase from the instance origin and leaf flutter.
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { atmo } from '../render/atmosphere.js';

export const windState = { strength: 1, dirX: 0.8, dirZ: 0.6, gust: 0 };

class WindPlugin extends MaterialPluginBase {
  constructor(material, opts) {
    super(material, 'Wind', 120, { WIND: false });
    this.opts = { bend: 0.02, flutter: 0.05, height: 10, ...opts };
    this.registerForExtraEvents = true; this._enable(true);
  }
  prepareDefines(defines) { defines.WIND = true; }
  getClassName() { return 'WindPlugin'; }
  getUniforms() { return { externalUniforms: ['windA', 'windB'] }; }
  hardBindForSubMesh(_ubo, _scene, _engine, subMesh) {
    const e = subMesh.effect; if (!e) return; const o = this.opts; const w = windState;
    e.setFloat4('windA', atmo.time, w.strength * (1 + w.gust), w.dirX, w.dirZ);
    e.setFloat4('windB', o.bend, o.flutter, 1 / o.height, o.fade ?? 0);
  }
  getCustomCode(shaderType) {
    if (shaderType !== 'vertex') return null;
    return {
      CUSTOM_VERTEX_DEFINITIONS: '#ifdef WIND\nuniform vec4 windA; uniform vec4 windB;\n#endif\n',
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `#ifdef WIND
{
  vec3 org = finalWorld[3].xyz;
  float hN = max(positionUpdated.y, 0.0) * windB.z;
  float ph = dot(org.xz, vec2(0.071, 0.053));
  float t = windA.x;
  float gust = 0.6 + 0.4 * sin(t * 0.35 + org.x * 0.004 + org.z * 0.003);
  float sway = (sin(t * 1.15 + ph) * 0.7 + sin(t * 2.3 + ph * 1.7) * 0.3) * gust;
  vec2 dir = vec2(windA.z, windA.w);
  float bend = windB.x * windA.y * hN * hN * length(finalWorld[1].xyz);
  worldPos.xz += dir * (sway + 0.6) * bend;
  float fl = windB.y * windA.y * hN;
  worldPos.xyz += vec3(sin(t * 6.1 + worldPos.x * 1.7 + ph), sin(t * 5.3 + worldPos.y * 2.1), cos(t * 6.7 + worldPos.z * 1.9)) * fl * 0.3;
#ifdef WINDFADE
#endif
  vPositionW = worldPos.xyz;
}
#endif
`,
    };
  }
}

export function addWind(material, opts) { return new WindPlugin(material, opts); }
