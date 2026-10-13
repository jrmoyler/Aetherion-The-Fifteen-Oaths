from pathlib import Path
p=Path('/tmp/kiln-ninja-revision05/kiln_ninja.py');s=p.read_text()
idx=s.index('\ndef rig():')
s=s[:idx]+'''
def reference_stance(point):
 x,y,z=point
 if z>=.95:return (x,y,z)
 # 090 manually measured ankle center separation .228*height, knee .157*height.
 amount=.104 if z<=.15 else (.104-(z-.15)*.064/.40 if z<=.55 else .040*(.95-z)/.40)
 return (x+(amount if x>0 else -amount),y,z)

def widen_lower_rest_stance():
 for ob in PARTS:
  if max(v.co.z for v in ob.data.vertices)>1.12 or max(abs(v.co.x) for v in ob.data.vertices)>.25:continue
  for v in ob.data.vertices:v.co=reference_stance(v.co)

''' + s[idx:]
s=s.replace("textures=atlas();create_geometry_v2();r=rig()","textures=atlas();create_geometry_v2();widen_lower_rest_stance();r=rig()")
s=s.replace("for name,(h,t,p) in BONES.items():b=a.edit_bones.new(name);b.head=h;b.tail=t","for name,(h,t,p) in BONES.items():\n  if name.startswith(('thigh.','shin.','foot.')):h=reference_stance(h);t=reference_stance(t)\n  b=a.edit_bones.new(name);b.head=h;b.tail=t")
s=s.replace("(0,0,.18,.19,.13)","(0,0,.18,.29,.13)")
p.write_text(s)
