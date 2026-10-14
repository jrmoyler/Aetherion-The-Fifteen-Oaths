import bpy,json
from pathlib import Path
p=Path(__file__).parent;bpy.ops.wm.open_mainfile(filepath=str(p/'amethyst-short-blade/source.blend'));rows=[]
for ob in bpy.context.scene.objects:
 if ob.type!='MESH':continue
 me=ob.data;me.calc_loop_triangles();uv=me.uv_layers.active;bad=0;zero_geom=0
 for t in me.loop_triangles:
  if t.area<1e-12:zero_geom+=1;continue
  a,b,c=[uv.data[i].uv for i in t.loops]
  if abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))*.5<1e-12:bad+=1
 if bad or zero_geom:rows.append({'object':ob.name,'zero_uv_triangles':bad,'geometry_area_below_1e12':zero_geom})
r={'scope':'Nonzero-area source loop triangles, not a texel-density target','zero_uv_triangles':sum(x['zero_uv_triangles']for x in rows),'geometry_area_below_1e12':sum(x['geometry_area_below_1e12']for x in rows),'details':rows};(p/'uv-audit.json').write_text(json.dumps(r,indent=2)+'\n');print(r)
