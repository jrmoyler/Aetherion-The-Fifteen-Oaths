import bpy,ast,math
from pathlib import Path
from mathutils import Vector
ROOT=Path('/tmp/aetherion-fault-review-v9');REVIEW=True
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'amethyst-short-blade/source.blend'))
scene=bpy.context.scene
for ob in list(scene.objects):
    if ob.type in ['CAMERA','LIGHT'] or ob.name.startswith('Studio_reflection_card'):bpy.data.objects.remove(ob,do_unlink=True)
scene.render.threads_mode='FIXED';scene.render.threads=2
text=(ROOT/'fault_weapons.review.py').read_text();tree=ast.parse(text)
node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='camera_view')
fn=ast.get_source_segment(text,node)
fn=fn.replace("cam.data.type='ORTHO'", "cam.rotation_euler.rotate_axis('Z',math.radians(-98));cam.data.type='ORTHO'")
fn=fn.replace('scene.render.resolution_x=720;scene.render.resolution_y=900','scene.render.resolution_x=1200;scene.render.resolution_y=520')
fn=fn.replace('scene.cycles.samples=96 if REVIEW else 128','scene.cycles.samples=128')

exec(fn)
obs=list(scene.objects)
camera_view(ROOT/'amethyst-short-blade/matched-front-review.png',obs,(0,-3,.1))
camera_view(ROOT/'amethyst-short-blade/matched-profile-review.png',obs,(3,0,.1))
