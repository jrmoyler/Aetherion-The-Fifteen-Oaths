import bpy,pathlib
from mathutils import Vector
O=pathlib.Path(__file__).resolve().parent
s=(O/'author.py').read_text();exec(s[:s.index('\nreports=[]')])
for slug in ['public-colonnade','shade-canopy']:
 d=O/'modules'/slug;bpy.ops.wm.open_mainfile(filepath=str(d/'source.blend'));obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render]
 if slug=='public-colonnade':
  focus=[]
  for o in obs:
   pts=[o.matrix_world@v.co for v in o.data.vertices];c=sum(pts,Vector())/len(pts)
   if c.x<.7 and c.y<.7 and min(p.z for p in pts)>3.0:focus.append(o)
   elif not (c.x<.7 and c.y<.7):o.hide_render=True
  render(d/'capital-detail.png',focus)
 else:
  # Turn only review scene upside down to expose ribs/pendant; source is never saved.
  for ob in obs:
   ob.rotation_euler.x+=3.141592653589793;ob.location.y=-ob.location.y;ob.location.z=-ob.location.z
  bpy.context.view_layer.update();render(d/'underside-detail.png',obs)
