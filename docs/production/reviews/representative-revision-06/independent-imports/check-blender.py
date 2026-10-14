import bpy, json, sys, math, hashlib
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:]
request=json.loads(Path(args[0]).read_text());reports=[]
def measure():
    deps=bpy.context.evaluated_depsgraph_get();points=[]
    shapes={b.custom_shape for rig in bpy.context.scene.objects if rig.type=='ARMATURE' for b in rig.pose.bones if b.custom_shape}
    for ob in bpy.context.scene.objects:
        if ob.type!='MESH' or ob.hide_render or ob in shapes:continue
        evaluated=ob.evaluated_get(deps);mesh=evaluated.to_mesh()
        points.extend([evaluated.matrix_world@v.co for v in mesh.vertices]);evaluated.to_mesh_clear()
    return {'vertices':len(points),'finite':all(math.isfinite(c) for p in points for c in p),'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
for file in request.get('blends',[])+request['glbs']:
    before=hashlib.sha256(Path(file).read_bytes()).hexdigest()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if file.endswith('.blend'):bpy.ops.wm.open_mainfile(filepath=file)
    else:bpy.ops.import_scene.gltf(filepath=file)
    rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']; row={'path':file,'sha256':before,'armatures':len(rigs),'bones':sum(len(r.data.bones) for r in rigs),'meshes':len([o for o in bpy.context.scene.objects if o.type=='MESH']),'materials':len(bpy.data.materials),'images':len(bpy.data.images),'rest':measure(),'actions':[]}
    if len(rigs)==1:
        rig=rigs[0];rig.animation_data_create()
        for track in rig.animation_data.nla_tracks:track.mute=True
        for action in list(bpy.data.actions):
            rig.animation_data.action=action
            if hasattr(action,'slots') and action.slots:rig.animation_data.action_slot=action.slots[0]
            start,end=action.frame_range;samples=[]
            for ratio in request.get('sampleRatios',[0,.25,.5,.75,1]):
                frame=end*ratio;bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update();m=measure();scales=[abs(v) for b in rig.pose.bones for v in b.scale];m.update({'frame':frame,'minBoneScale':min(scales),'maxBoneScale':max(scales)});samples.append(m)
            row['actions'].append({'name':action.name,'start':start,'end':end,'samples':samples})
    row['sourceBytesUnchanged']=hashlib.sha256(Path(file).read_bytes()).hexdigest()==before
    reports.append(row)
Path(args[1]).write_text(json.dumps({'blenderVersion':bpy.app.version_string,'scope':'Actual Blender open/import and evaluated mesh vertices; CPU only, no re-export or source writes','reports':reports},indent=2)+'\n')
