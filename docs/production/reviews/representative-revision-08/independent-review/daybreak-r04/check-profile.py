import bpy,json,pathlib,hashlib
P=pathlib.Path('/tmp/aetherion-daybreak-architecture-r04');O=pathlib.Path(__file__).resolve().parent;f=P/'modules/shade-canopy/source.blend';bpy.ops.wm.open_mainfile(filepath=str(f));ob=next(o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render and o.name.startswith('Shallow scalloped'));vs=[ob.matrix_world@v.co for v in ob.data.vertices];samples=[]
for label,x,y in [('corner',.3,.3),('centre',2,2),('front_mid_edge',2,.52)]:
 matches=[v for v in vs if abs(v.x-x)<.001 and abs(v.y-y)<.001];samples.append({'sample':label,'xy':[x,y],'vertex_count':len(matches),'min_z':min(v.z for v in matches),'max_z':max(v.z for v in matches)})
(O/'actual-canopy-profile.json').write_text(json.dumps({'source_sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'mode':'read-only actual Blender source vertices, no saves','samples':samples},indent=2)+'\n');print(samples)
