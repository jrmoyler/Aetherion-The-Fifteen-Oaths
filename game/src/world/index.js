// STUB — replaced by the world-nature agent.
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { heightAt, normalAt, isWater, SEA_LEVEL } from '@shared/terrain.js';
import { regionAt } from '@shared/oaths.js';
export async function init(ctx) {
  const g = MeshBuilder.CreateGround('stubGround', { width: 800, height: 800, subdivisions: 160, updatable: true }, ctx.scene);
  g.position.set(270, 0, 360);
  const pos = g.getVerticesData(VertexBuffer.PositionKind);
  for (let i = 0; i < pos.length; i += 3) pos[i + 1] = heightAt(pos[i] + 270, pos[i + 2] + 360);
  g.updateVerticesData(VertexBuffer.PositionKind, pos); g.createNormals(true);
  const m = new StandardMaterial('stubGround', ctx.scene); m.diffuseColor = new Color3(0.45, 0.42, 0.36); g.material = m;
  return { heightAt, normalAt, groundAt: (x, z, y) => ctx.collision.groundAt(x, z, y), isWater, waterLevel: SEA_LEVEL,
    update() {}, regionAt, focus() {}, ready: async () => {} };
}
