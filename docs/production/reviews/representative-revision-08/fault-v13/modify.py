from pathlib import Path
p=Path(__file__).parent/'fault_weapons.review.py'
s=p.read_text().replace('[(50,0),(100,3),(150,8),(190,6),(235,11),(280,8),(320,12),(365,10),(410,14),(429,11)]','[(50,0),(100,2),(125,5),(156,9),(177,4),(205,11),(229,7),(259,14),(285,8),(312,15),(337,10),(365,19),(388,12),(413,21),(429,13)]')
a=s.index('    centers=[',s.index('def faceted_insert():'));b=s.index("    ob=mesh(",a)
s=s[:a]+'''    # A closed intergrown crystal: each unequal station has a shifted ridge,
    # front shoulder and crest depth. These are genuine optical facet planes.
    stations=[(51,230,1,.0002,-.1),(95,222,4,.002,-.5),
      (130,214,8,.011,.30),(152,209,13,.006,-.25),
      (179,205,8,.017,.50),(214,202,15,.009,-.35),
      (235,196,11,.022,.25),(266,194,19,.012,-.40),
      (294,186,14,.024,.40),(324,184,20,.014,-.50),
      (350,177,16,.027,.25),(374,177,24,.017,-.35),
      (400,169,19,.030,.50),(429,164,24,.019,-.10)]
    verts=[];N=8
    for j,(px,py,width,depth,shift) in enumerate(stations):
      x,z=traced((px,py));r=width*SOURCE_SCALE
      # Two unequal shoulders around a steep off-axis ridge, mirrored only
      # through the buried middle plane, never planar face color decoration.
      ring=[(-1,0),(-.68,-.44),(shift,-1),(.76,-.32),
            (1,0),(.64,.48),(-shift,.78),(-.78,.35)]
      for k,(rx,ry) in enumerate(ring):
        dz=(.0035 if j%2 else -.002)*(1 if k in [1,2,6] else -.3)
        if j==0:dz=0
        verts.append((x+r*rx,depth*ry,z+dz))
    fs=[tuple(range(N-1,-1,-1)),tuple(range((len(stations)-1)*N,len(stations)*N))]
    for j in range(len(stations)-1):
      for k in range(N):
        a=j*N+k;b=j*N+(k+1)%N;c=(j+1)*N+(k+1)%N;d=(j+1)*N+k
        fs.extend([(a,b,d),(b,c,d)] if (j+k)%2 else [(a,b,c),(a,c,d)])
''' + s[b:]
# Add thinner unequal terraces within existing banks, preserving outer envelope.
needle='      tongues=['
pos=s.index(needle)
s=s[:pos]+'''      terraces=[[(113,198),(147,188),(172,185),(153,196),(126,207)],
       [(174,181),(214,168),(226,173),(208,187),(185,190)],
       [(244,171),(269,159),(295,158),(277,170),(252,182)],
       [(303,155),(331,148),(346,151),(329,163)],
       [(362,145),(391,133),(413,136),(404,149),(375,159)],
       [(134,232),(166,218),(185,218),(168,231),(147,240)],
       [(213,232),(239,210),(259,209),(245,224),(225,239)],
       [(270,226),(295,204),(309,204),(291,219)],
       [(325,217),(347,196),(367,190),(357,207),(337,225)],
       [(374,213),(397,192),(415,188),(404,206),(390,219)]]
      for ti,pp in enumerate(terraces):
        bank=0 if ti<5 else 1
        pp=[(x,min(y,aperture_center(x)-aperture_halfwidth(x)+2) if bank==0 else max(y,aperture_center(x)+aperture_halfwidth(x)-2)) for x,y in pp]
        ob=stone_patch('Overlapping_secondary_terrace_%d_%d'%(side,ti),pp,side,3+ti%4)
        cz=sum(v.co.z for v in ob.data.vertices)/len(ob.data.vertices)
        for v in ob.data.vertices:v.co.y=side*(abs(v.co.y)+.003+(v.co.z-cz)*[.16,-.12,.08][ti%3])
''' +s[pos:]
p.write_text(s)
