import bpy,json,hashlib
from pathlib import Path
p=Path(__file__).resolve().parent;s=Path('/tmp/ninja-v13/kiln-ninja-ensemble-candidate/kiln-ninja-ensemble-candidate.blend');sha=hashlib.sha256(s.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(s));body=bpy.data.objects['Kiln_ninja_weighted_lowpoly'];rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');indices={side:[v.index for v in body.data.vertices if any(body.vertex_groups[g.group].name=='foot.'+side and g.weight>.5 for g in v.groups)] for side in ['L','R']};rows=[]
for clip,duration in [('idle_breath',48),('walk_in_place',32),('cast_release',48)]:
 rig.animation_data.action=bpy.data.actions[clip]
 for frame in range(1,duration+1):
  bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();feet={}
  for side,ids in indices.items():
   z=[(body.matrix_world@mesh.vertices[i].co).z for i in ids];feet[side]={'minimumClearanceMeters':min(z)-.012,'verticesBelowReviewFloor':sum(v<.012-1e-5 for v in z)}
  ev.to_mesh_clear();rows.append({'clip':clip,'frame':frame,'feet':feet})
assert sha==hashlib.sha256(s.read_bytes()).hexdigest();out={'sourceSha256':sha,'floorZmeters':.012,'scope':'All128authored clip frames evaluated on CPU, dominant-foot vertex ground clearance only. No solver, continuous between-frame test, shoe pressure, foot-slip/velocity or engine gameplay certification.','frames':rows};(p/'ground-clearance-allframes.json').write_text(json.dumps(out,indent=2)+'\n')
print('Allframes',len(rows),'worst',min((x['feet'][side]['minimumClearanceMeters'],x['clip'],x['frame'],side) for x in rows for side in ['L','R']))
