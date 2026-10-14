import bpy,bmesh,json,pathlib,math,numpy as np
from mathutils import Vector
O=pathlib.Path(__file__).resolve().parent
# Use the established neutral CPU render function without running base authoring.
exec((O/'author.py').read_text().split('\nreports=[]')[0])
bpy.context.preferences.filepaths.save_version=0
TARGETS=['foundation-plinth','floor-bay','window-wall','inside-corner','door-frame','roof-bay','stair-flight','ramp-run','shade-canopy','daylight-baffle']
def select(objects):
 for ob in bpy.context.scene.objects:ob.select_set(False)
 for ob in objects:ob.hide_set(False);ob.hide_viewport=False;ob.select_set(True)
 if objects:bpy.context.view_layer.objects.active=objects[0]
def unwrap(ob):
 select([ob]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.018);bpy.ops.object.mode_set(mode='OBJECT')
def replace(ob,verts,faces):
 mats=list(ob.data.materials);mesh=bpy.data.meshes.new(ob.name+'_authored_topology');mesh.from_pydata(verts,[],faces);mesh.update();ob.data=mesh
 for m in mats:mesh.materials.append(m)
 for mod in list(ob.modifiers):ob.modifiers.remove(mod)
 select([ob]);mod=ob.modifiers.new('Final triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name);unwrap(ob)
def bevel_to_prism(ob,diagonal=False):
 pts=np.array([v.co[:] for v in ob.data.vertices],dtype=float)
 if diagonal:
  _,vec=np.linalg.eigh(np.cov(pts.T));z=Vector(vec[:,-1]);z.normalize();x=Vector((1,0,0));y=z.cross(x).normalized();axes=[x,y,z]
 else:axes=[Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))]
 projs=[[Vector(v).dot(a) for v in pts] for a in axes];lo=[min(v) for v in projs];hi=[max(v) for v in projs]
 verts=[]
 for a,b,c in [(0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1)]:verts.append(tuple(axes[0]*(hi[0] if a else lo[0])+axes[1]*(hi[1] if b else lo[1])+axes[2]*(hi[2] if c else lo[2])))
 replace(ob,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
def cylinder_segments(ob,n):
 pts=[v.co for v in ob.data.vertices];lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)];cx=(lo[0]+hi[0])/2;cy=(lo[1]+hi[1])/2;rx=(hi[0]-lo[0])/2;ry=(hi[1]-lo[1])/2
 verts=[(cx+rx*math.cos(i*2*math.pi/n),cy+ry*math.sin(i*2*math.pi/n),z) for z in [lo[2],hi[2]] for i in range(n)];faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)];replace(ob,verts,faces)
def hidden_caps(ob,axis):
 bm=bmesh.new();bm.from_mesh(ob.data);bm.normal_update();faces=[f for f in bm.faces if abs(f.normal[axis])>.9999];removed=len(faces);bmesh.ops.delete(bm,geom=faces,context='FACES');bm.to_mesh(ob.data);bm.free();ob.data.update();unwrap(ob);return removed

def cloth_grid(ob,n):
 verts=[]
 for j in range(n+1):
  for i in range(n+1):u=i/n;v=j/n;verts.append((.1+3.8*u,.1+3.8*v,.3-.28*math.sin(math.pi*u)*math.sin(math.pi*v)))
 faces=[]
 for j in range(n):
  for i in range(n):a=j*(n+1)+i;faces.append((a,a+1,a+n+2,a+n+1))
 mats=list(ob.data.materials);m=bpy.data.meshes.new('Coarse woven canopy');m.from_pydata(verts,[],faces);m.update();ob.data=m
 for mat in mats:m.materials.append(mat)
 select([ob]);mod=ob.modifiers.new('Retained physical woven thickness','SOLIDIFY');mod.thickness=.004;bpy.ops.object.modifier_apply(modifier=mod.name);mod=ob.modifiers.new('Final triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name);unwrap(ob)
def tri_count(obs):
 total=0
 for ob in obs:ob.data.calc_loop_triangles();total+=len(ob.data.loop_triangles)
 return total
reports=[]
for slug in TARGETS:
 D=O/'modules'/slug;bpy.ops.wm.open_mainfile(filepath=str(D/'source.blend'))
 for ob in list(bpy.context.scene.objects):
  if ob.get('representation')=='lod_variant':bpy.data.objects.remove(ob,do_unlink=True)
 bpy.context.scene.frame_set(1);primary=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render];empty=[o for o in bpy.context.scene.objects if o.type=='EMPTY'];meta=json.loads((D/'module.json').read_text());lodobs={};procedures=[]
 for level in [1,2]:
  obs=[]
  for original in primary:
   name=original.name;force=(slug=='window-wall' and 'Bronze reveal frame' in name) or (slug=='inside-corner' and 'Corner bronze seat' in name) or (slug in ['stair-flight','ramp-run'] and ('Continuous bronze guardrail' in name or 'Rail post bronze cap' in name)) or (slug=='shade-canopy' and ('Canopy sewn tension edge' in name or 'Corner socket quick release' in name))
   if original.get('lod_detail',0)>2-level and not force:continue
   ob=original.copy();ob.data=original.data.copy();ob.name=f'LOD{level}__'+original.name;ob['representation']='lod_variant';ob['lod_level']=level;ob['original_visual_object']=original.name;bpy.context.collection.objects.link(ob);ob.hide_render=False;ob.hide_set(False);obs.append(ob)
   if slug=='foundation-plinth' and level==1 and 'Corner dry bronze anchor strap' in name:
    count=hidden_caps(ob,2);procedures.append({'level':level,'object':name,'operation':'Remove top/bottom strap faces fully buried in corner bearing pad','removed_faces':count})
   if slug=='floor-bay' and level==2 and 'Flush solar medallion' in name:cylinder_segments(ob,8);procedures.append({'level':level,'object':name,'operation':'16 to8 sided inset medallion; cardinal extents preserved'})
   if slug=='window-wall' and level==1 and 'Bronze reveal frame' in name:
    dims=ob.dimensions;axis=2 if dims.z>dims.x else 0;count=hidden_caps(ob,axis);procedures.append({'level':level,'object':name,'operation':'Remove endcaps occluded at reveal-to-stone/frame joints','removed_faces':count})
   if slug in ['inside-corner','door-frame'] and level==1 and ('Corner bronze end cap' in name or 'Bronze jamb trim' in name):bevel_to_prism(ob);procedures.append({'level':level,'object':name,'operation':'Replace chamfered straight trim with8vertex rectangular trim, same endpoint bounds'})
   if slug=='roof-bay' and level==1 and 'Roof bronze drip edge' in name:
    # Underside is buried within structural core; preserve four exterior side faces and top.
    bm=bmesh.new();bm.from_mesh(ob.data);bm.normal_update();faces=[f for f in bm.faces if f.normal.z<-.9999];count=len(faces);bmesh.ops.delete(bm,geom=faces,context='FACES');bm.to_mesh(ob.data);bm.free();unwrap(ob);procedures.append({'level':level,'object':name,'operation':'Remove only buried drip-strip underside triangles','removed_faces':count})
   if slug in ['stair-flight','ramp-run']:
    if 'Continuous bronze guardrail' in name:bevel_to_prism(ob,True);procedures.append({'level':level,'object':name,'operation':'Retain continuous guardrail, simplify chamfered section to rectangular prism'})
    if 'Rail post bronze cap' in name:cylinder_segments(ob,8 if level==1 else 4);procedures.append({'level':level,'object':name,'operation':f'Retain guardpost cap/endheight, reduce radialsegments to{8 if level==1 else 4}'})
   if slug=='shade-canopy':
    if 'Taut woven removable canopy' in name:cloth_grid(ob,8 if level==1 else 4);procedures.append({'level':level,'object':name,'operation':f'Sag surface lattice12→{8 if level==1 else 4}, unchangedcorner/center coordinates and4mmthickness'})
    if 'Canopy sewn tension edge' in name:bevel_to_prism(ob);procedures.append({'level':level,'object':name,'operation':'Retain canopy edge, rectangular hem section'})
    if 'Corner socket quick release' in name:cylinder_segments(ob,8 if level==1 else 4);procedures.append({'level':level,'object':name,'operation':'Retain attachment housing, reduced radialsegments'})
   if slug=='daylight-baffle' and level==1 and 'Louver bronze horizontal rim' in name:
    count=hidden_caps(ob,0);procedures.append({'level':level,'object':name,'operation':'Remove horizontalrim endcaps buried inside verticalrim joints; movingpanel outline/pivot preserved','removed_faces':count})
  bpy.context.view_layer.update();select(obs+empty);bpy.ops.export_scene.gltf(filepath=str(D/f'lod{level}.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_animations=True,export_frame_range=True,export_force_sampling=True,export_extras=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='daylight_baffle_open_close');lodobs[level]=obs;meta['lod_triangle_counts'][f'lod{level}']=tri_count(obs)
  for ob in obs:ob.hide_render=True;ob.hide_set(True)
 for ob in primary:ob.hide_render=False;ob.hide_set(False)
 meta['editable_lod_geometry']={f'lod{level}':{'source_object_prefix':f'LOD{level}__','objects':len(obs),'triangles':tri_count(obs)} for level,obs in lodobs.items()};meta['lod_revision']='r03 deliberate topology reduction; same primary/collision payloads';(D/'module.json').write_text(json.dumps(meta,indent=2)+'\n')
 bpy.ops.wm.save_as_mainfile(filepath=str(D/'source.blend'),compress=True)
 # Render authored LODs with all other representations hidden. Source saved before render-only state changes.
 for level,obs in lodobs.items():
  for ob in primary:ob.hide_render=True
  for group in lodobs.values():
   for ob in group:ob.hide_render=True
  for ob in obs:ob.hide_render=False;ob.hide_set(False)
  render(D/f'lod{level}.png',obs)
  for ob in obs:ob.hide_render=True;ob.hide_set(True)
 counts=meta['lod_triangle_counts'];assert counts['lod0']>counts['lod1']>counts['lod2'],(slug,counts)
 reports.append({'module':slug,'counts':counts,'operations':procedures,'source_lod0_unchanged':True,'collision_exports_unchanged':True});print('LOD_REPAIR_COMPLETE',slug,counts,flush=True)
(O/'lod-authoring-report.json').write_text(json.dumps({'scope':'Deliberate lower-tier authored geometry; no fidelity or gameplay approval','reports':reports},indent=2)+'\n')

# Organize saved variants into hidden editable collections as the final source packaging pass.
exec((O/'group-lod-sources.py').read_text())
