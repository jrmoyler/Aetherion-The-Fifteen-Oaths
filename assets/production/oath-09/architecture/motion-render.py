import bpy,pathlib
O=pathlib.Path(__file__).resolve().parent
exec((O/'author.py').read_text().split('\nreports=[]')[0])
bpy.ops.wm.open_mainfile(filepath=str(O/'modules/daylight-baffle/source.blend'));bpy.context.scene.frame_set(61);bpy.context.view_layer.update();render(O/'modules/daylight-baffle/open.png',[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render])
