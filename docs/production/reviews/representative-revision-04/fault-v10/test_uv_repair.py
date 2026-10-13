import bpy,json
from pathlib import Path
p=Path(__file__).resolve().parent;bpy.ops.wm.open_mainfile(filepath=str(p/'amethyst-short-blade/source.blend'))
rows=[]
for ob in bpy.context.scene.objects:
 if ob.name not in ['Pommel_fitted_bronze_frame.001','Pommel_fitted_bronze_frame.002','Traced_fracture_flake_-1_1_00','Traced_fracture_flake_1_1_00']:continue
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 m=ob.modifiers.new('UV_final_topology','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=m.name)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=.65,island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
 ob.data.calc_tangents();rows.append({'name':ob.name,'zeroTangentLoopsAfterFinalTopologyUnwrap':sum(l.tangent.length<.9 for l in ob.data.loops),'polygons':len(ob.data.polygons)})
(p/'uv-repair-test.json').write_text(json.dumps(rows,indent=2)+'\n');print(rows)
