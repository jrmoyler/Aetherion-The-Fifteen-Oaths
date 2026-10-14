import bpy,json,hashlib
from pathlib import Path
p=Path(__file__).resolve().parent;stem='kiln-ninja-ensemble-candidate'
def h(data):return hashlib.sha256(json.dumps(data,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def inspect(file):
 bpy.ops.wm.open_mainfile(filepath=str(file));out={}
 for o in bpy.data.objects:
  if o.type=='ARMATURE':out['rig:'+o.name]=h([(b.name,b.parent.name if b.parent else None,[tuple(row) for row in b.matrix_local],b.length) for b in o.data.bones])
  elif o.type=='MESH':
   m=o.data;out['mesh:'+o.name]=h({'v':[(tuple(v.co),tuple(v.normal),[(g.group,g.weight) for g in v.groups]) for v in m.vertices],'p':[list(x.vertices) for x in m.polygons],'uv':[[tuple(x.uv) for x in u.data] for u in m.uv_layers],'materials':[x.material_index for x in m.polygons],'smooth':[x.use_smooth for x in m.polygons]})
  out['transform:'+o.name]=h([tuple(row) for row in o.matrix_world])
 for a in bpy.data.actions:out['action:'+a.name]=h([(fc.data_path,fc.array_index,[(tuple(k.co),tuple(k.handle_left),tuple(k.handle_right),k.interpolation) for k in fc.keyframe_points]) for fc in a.fcurves])
 for a in bpy.data.actions:
  for fc in a.fcurves:out['curve:'+a.name+':'+fc.data_path+':'+str(fc.array_index)]=h([(tuple(k.co),tuple(k.handle_left),tuple(k.handle_right),k.interpolation) for k in fc.keyframe_points])
 return out
baseline=inspect(p/'baseline'/(stem+'.blend'));candidate=inspect(p/stem/(stem+'.blend'));changed=[k for k in baseline if baseline[k]!=candidate[k]];assert set(changed)=={'action:walk_in_place','curve:walk_in_place:pose.bones["pelvis"].location:1'},changed
(p/'saved-source-preservation.json').write_text(json.dumps({'scope':'Reopened saved packed V13 and V15 source. Mesh positions/normals/weights/polygons/UV/material indices/smooth flags, rig bone matrices/parents/lengths, idle/cast action keyframes/handles/interpolation, and object transforms exact. Walk action intentionally changed. No source runtime or visual acceptance inferred.','changedOnly':changed,'baseline':baseline,'candidate':candidate},indent=2)+'\n');print('Saved source expected difference',changed)
