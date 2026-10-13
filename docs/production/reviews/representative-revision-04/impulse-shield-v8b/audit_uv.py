import bpy,json
from pathlib import Path
P=Path(__file__).resolve().parent;bpy.ops.wm.open_mainfile(filepath=str(P/'impulse-shield-lateral-review08b.blend'))
records=[];bad=0
for ob in bpy.context.scene.objects:
 if ob.type!='MESH':continue
 me=ob.data;uv=me.uv_layers.active;degenerate=0;total=0
 if uv:
  me.calc_loop_triangles()
  for t in me.loop_triangles:
   if t.area<1e-11:continue
   total+=1;a,b,c=[uv.data[i].uv for i in t.loops];area=abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))*.5
   if area<1e-12:degenerate+=1
 else:degenerate=len(me.polygons)
 if degenerate:records.append({'object':ob.name,'nonzeroAreaTriangles':total,'zeroAreaUVTriangles':degenerate});bad+=degenerate
r={'status':'PASS' if not bad else 'FAIL_ZERO_AREA_UV','method':'All nonzero-area Blender mesh loop triangles; 3D area>1e-11m2 and UV area<1e-12 threshold','zeroAreaUVTriangles':bad,'failures':records};(P/'uv-audit.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
