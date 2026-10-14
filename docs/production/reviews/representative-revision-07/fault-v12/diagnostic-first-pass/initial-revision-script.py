from pathlib import Path
p=Path(__file__).parent/'fault_weapons.review.py';s=p.read_text()
a=s.index('def shell_height(');b=s.index('\ndef stone_patch(',a)
s=s[:a]+'''def interpolate_knots(knots,t):
    for a,b in zip(knots,knots[1:]):
      if a[0]<=t<=b[0]:return a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0])
    return knots[0][1] if t<knots[0][0] else knots[-1][1]

def aperture_center(px):
    return interpolate_knots([(50,230),(100,223),(150,210),(195,204),(240,197),(285,191),(330,183),(370,175),(410,169),(429,164)],px)

def aperture_halfwidth(px):
    return interpolate_knots([(50,0),(100,3),(150,8),(190,6),(235,11),(280,8),(320,12),(365,10),(410,14),(429,11)],px)

def shell_height(x,z):
    # Individually observed lamination-depth stations; no constant parallel rails.
    depth=interpolate_knots([(.135,.014),(.20,.017),(.26,.012),(.32,.017),(.39,.011),(.46,.013),(.53,.007),(.575,.0001)],z)
    return depth*(.32+.68*max(0,1-abs(x+.013)/.065))
''' + s[b:]
needle="    for side in [-1,1]:\n      for bank,(outer,inner)"
idx=s.index(needle,s.index('def interlocking_stone_shell'))
s=s[:idx]+'''    for bank,polygons in enumerate([upper,lower]):
      for pp in polygons:
        for i,(x,y) in enumerate(pp):
          lip=aperture_center(x)+(-1 if bank==0 else 1)*aperture_halfwidth(x)
          pp[i]=(x,min(y,lip) if bank==0 else max(y,lip))
''' + s[idx:]
s=s.replace('boundary=outer+list(reversed(inner[1:-1]))',"inner=[(x,aperture_center(x)+(-1 if bank==0 else 1)*aperture_halfwidth(x)) for x,y in inner];boundary=outer+list(reversed(inner[1:-1]))")
s=s.replace('for v in ob.data.vertices:v.co.y*=.52', 'for v in ob.data.vertices:v.co.y*=.62 if side<0 else .49')
s=s.replace("          for v in ob.data.vertices:v.co.y+=side*(.0008*(i%3)+.025*(v.co.z-center))",'''          lateral=sum(v.co.x for v in ob.data.vertices)/len(ob.data.vertices)
          tilt=[.11,-.07,.14,-.09,.08,-.12,.13,-.06][i]
          lift=[.0004,.002,.0008,.0014,.0003,.0022,.0007,.0016][i]
          for v in ob.data.vertices:
            v.co.y=side*(abs(v.co.y)*(1 if side<0 else .84)+lift+tilt*(v.co.z-center)+(.12 if bank==0 else -.09)*(v.co.x-lateral))''')
a=s.index('      for i,pp in enumerate(tongues):');b=s.index('\ndef faceted_insert():',a)
s=s[:a]+'''      for i,pp in enumerate(tongues):
        bank=0 if i<4 else 1
        pp=[(x,min(y,aperture_center(x)-aperture_halfwidth(x)+2.5) if bank==0 else max(y,aperture_center(x)+aperture_halfwidth(x)-2)) for x,y in pp]
        ob=stone_patch('Occluding_overlap_tongue_%d_%d'%(side,i),pp,side,7+i%2)
        center=sum(v.co.z for v in ob.data.vertices)/len(ob.data.vertices)
        for v in ob.data.vertices:v.co.y=side*(abs(v.co.y)*(1 if side<0 else .88)+.0015+(.10 if i%2 else -.08)*(v.co.z-center))
''' + s[b:]
s=s.replace('verts.append((x+r*math.cos(angle),-.002+min(.010,r*.65)*math.sin(angle),z))',"depth=min(.017,shell_height(x,z)*1.12);verts.append((x+r*math.cos(angle),-.0008+depth*math.sin(angle),z))")
# Dynamic final-topology tangent repair for newly reshaped thin mineral meshes.
a=s.index('        if ob.name in [');b=s.index('\n\ndef export(',a)
s=s[:a]+'''        tri=ob.modifiers.new('Final_topology_before_UV','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
        ob.data.calc_tangents()
        if any(loop.tangent.length<.9 for loop in ob.data.loops):
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=.65,island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT');ob.data.calc_tangents()
            assert all(loop.tangent.length>.9 for loop in ob.data.loops),ob.name+' invalid tangent after final UV unwrap'
''' + s[b:]
p.write_text(s)
