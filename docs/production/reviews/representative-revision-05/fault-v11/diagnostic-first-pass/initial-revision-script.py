from pathlib import Path
p=Path(__file__).parent/'fault_weapons.review.py';s=p.read_text().replace("('dark_leather',(.095,.037,.013),.72,0)","('dark_leather',(.24,.115,.050),.68,0)")
a=s.index('def interlocking_stone_shell():');b=s.index('\ndef faceted_insert():',a)
s=s[:a]+'''def interlocking_stone_shell():
    # Independent hand-outlined overlapping slabs, not a tessellated cell shell.
    upper=[[(50,230),(82,210),(115,205),(104,220),(75,225)],[(85,211),(119,187),(151,183),(165,195),(139,204),(107,205)],[(124,181),(161,176),(191,177),(209,186),(192,194),(165,196),(153,189)],[(180,177),(207,166),(228,164),(242,177),(222,185),(205,181)],[(224,164),(245,161),(265,155),(280,169),(263,180),(244,177)],[(275,151),(295,152),(321,150),(341,163),(318,175),(294,172)],[(319,151),(337,141),(359,139),(379,151),(363,164),(339,161)],[(361,136),(385,133),(409,124),(428,133),(423,147),(398,155),(378,153)]]
    lower=[[(51,230),(92,222),(123,225),(137,234),(105,240),(75,235)],[(113,226),(153,211),(177,214),(168,237),(148,248),(129,241)],[(157,226),(189,207),(215,208),(238,215),(220,239),(198,250),(174,245)],[(216,221),(237,195),(263,195),(279,208),(265,232),(244,242),(226,238)],[(264,218),(280,197),(303,192),(325,201),(313,228),(291,240),(274,235)],[(308,210),(333,185),(355,181),(369,193),(354,224),(333,235),(316,231)],[(354,203),(377,179),(400,174),(421,183),(411,214),(385,228),(364,231)],[(402,192),(414,165),(432,161),(437,179),(428,207),(413,211)]]
    for side in [-1,1]:
      for bank,polys in enumerate([upper,lower]):
        for i,pp in enumerate(polys):
          base=[(x-3 if i else x,y+(2 if bank==0 else -2)) for x,y in pp]
          ob=stone_patch('Underlying_thin_shard_%d_%d_%d'%(side,bank,i),base,side,0)
          for v in ob.data.vertices:v.co.y*=.52
          ob=stone_patch('Overlapping_primary_slab_%d_%d_%d'%(side,bank,i),pp,side,2+i%3)
          center=sum(v.co.z for v in ob.data.vertices)/len(ob.data.vertices)
          for v in ob.data.vertices:v.co.y+=side*(.0018*(i%3)+.075*(v.co.z-center))
      tongues=[[(128,187),(150,187),(175,199),(161,210),(143,204)],[(201,171),(221,169),(244,185),(229,199),(215,190)],[(277,157),(300,153),(323,175),(306,186),(287,177)],[(347,141),(370,140),(390,161),(373,177),(353,167)],[(180,236),(196,221),(213,207),(228,205),(222,221),(201,238)],[(294,232),(307,206),(324,188),(338,187),(335,210),(317,229)],[(392,217),(405,198),(418,180),(430,176),(427,199),(413,216)]]
      for i,pp in enumerate(tongues):
        ob=stone_patch('Occluding_overlap_tongue_%d_%d'%(side,i),pp,side,7+i%2)
        for v in ob.data.vertices:v.co.y+=side*.004
''' + s[b:]
s=s.replace('(145,211,7),(178,207,8),(209,202,9),(239,198,10),(269,194,10.5),(298,190,11),(328,185,11.5),(355,180,12),(385,175,12)', '(145,211,5),(178,204,10),(209,203,5),(239,197,11),(269,197,7),(298,188,12),(328,187,6),(355,178,13),(385,177,8)')
a=s.index('        # Forged faceted guard body');b=s.index('        top=.575',a)
s=s[:a]+'''        # Separate scalloped bronze collars instead of a rectangular cuff shell.
        for ring,(zc,depth,rx,ry) in enumerate([(.109,.012,.043,.028),(.134,.015,.053,.033),(.159,.010,.049,.030)]):
          N=24;vs=[]
          for inner,dz in [(False,-depth/2),(False,depth/2),(True,-depth/2),(True,depth/2)]:
            for j in range(N):
              a=j*math.tau/N;rr=1+.13*math.cos(4*a+ring*.35)-(.115 if inner else 0)
              vs.append((-.008+rx*rr*math.cos(a),ry*rr*math.sin(a),zc+dz+.003*math.cos(4*a+ring*.35)))
          fs=[]
          for j in range(N):
            k=(j+1)%N
            fs.extend([(j,k,N+k,N+j),(2*N+j,3*N+j,3*N+k,2*N+k),(j,2*N+j,2*N+k,k),(N+j,N+k,3*N+k,3*N+j)])
          mesh('Guard_multilobed_bronze_collar_%d'%ring,vs,fs,'aged_bronze')
        for side in [-1,1]:
          for sign in [-1,1]:
            xx=-.008+sign*.038
            poly=[(xx-sign*.008,.113),(xx+sign*.009,.116),(xx+sign*.015,.133),(xx+sign*.009,.155),(xx,.176),(xx-sign*.009,.155),(xx-sign*.006,.132)]
            ob=plate('Guard_pointed_lobed_clasp',poly,-.027,.007,'aged_bronze')
            if side>0:ob.scale.y=-1
            bronze_line('Guard_clasp_edge',[(x,side*.035,z) for x,z in poly+[poly[0]]],.0014)
            for z in [.125,.150]:
              bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.0036,location=(xx,side*.037,z));bpy.context.object.name='Guard_clasp_peened_stud';bpy.context.object.data.materials.append(mats['aged_bronze'])
''' + s[b:]
a=s.index("        camera_view(out/'hero-review.png'");b=s.index('    for o in obs:',a);s=s[:a]+"        continue\n"+s[b:];p.write_text(s)
