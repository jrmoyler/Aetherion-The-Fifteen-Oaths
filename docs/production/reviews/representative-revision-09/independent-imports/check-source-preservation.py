import bpy,json,hashlib,collections
from pathlib import Path
P=Path('/workspace/scratch/ninja-v16');ID='kiln-ninja-ensemble-candidate';remove=set(i for c in json.loads((P/'source-removal.json').read_text())['components'] for i in c['indices'])
def h(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def inspect(path,baseline=False):
 bpy.ops.wm.open_mainfile(filepath=str(path));o=bpy.data.objects['Kiln_ninja_weighted_lowpoly'];m=o.data;faces=[];positions=[];weights=[]
 for v in m.vertices:
  if baseline and v.index in remove:continue
  positions.append(tuple(v.co));weights.append((tuple(v.co),[(o.vertex_groups[g.group].name,g.weight) for g in v.groups]))
 for f in m.polygons:
  if baseline and any(v in remove for v in f.vertices):continue
  loops=[]
  for li in f.loop_indices:
   l=m.loops[li];v=m.vertices[l.vertex_index];loops.append((tuple(v.co),tuple(m.uv_layers.active.data[li].uv)))
  faces.append((sorted(loops),m.materials[f.material_index].name,f.use_smooth))
 rig=next(x for x in bpy.data.objects if x.type=='ARMATURE');actions={a.name:h([(f.data_path,f.array_index,[(tuple(k.co),tuple(k.handle_left),tuple(k.handle_right),k.interpolation) for k in f.keyframe_points]) for f in a.fcurves]) for a in bpy.data.actions};materials={x.name:h(x.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value) for x in bpy.data.materials if x.use_nodes and x.node_tree.nodes.get('Principled BSDF')};images={x.name:hashlib.sha256(bytes(x.packed_file.data)).hexdigest() for x in bpy.data.images if x.packed_file};new=[]
 for x in bpy.data.objects:
  if x.get('v16_component'):
   assert all(len(v.groups)==1 and x.vertex_groups[v.groups[0].group].name=='forearm.L' and abs(v.groups[0].weight-1)<1e-8 for v in x.data.vertices)
   new.append({'name':x.name,'vertices':len(x.data.vertices),'allWeightsForearmL':True,'uvLayers':len(x.data.uv_layers)})
 return {'unaffectedPositions':h(sorted(positions)),'unaffectedWeights':h(sorted(weights)),'unaffectedFaceMaterialUVSmooth':h(sorted(faces)),'unaffectedFaceCount':len(faces),'rig':h([(b.name,b.parent.name if b.parent else None,[tuple(r) for r in b.matrix_local],b.length) for b in rig.data.bones]),'actions':actions,'packedImages':images,'newComponents':new}
before=inspect(P/'baseline'/(ID+'.blend'),True);after=inspect(P/ID/(ID+'.blend'));checks={k:before[k]==after[k] for k in before if k!='newComponents'};assert all(checks.values()),checks;Path('/tmp/aetherion-ninja-v16-independent/source-preservation.json').write_text(json.dumps({'checks':checks,'baseline':before,'candidate':after},indent=2)+'\n');print('SOURCE PRESERVATION PASS',checks)
