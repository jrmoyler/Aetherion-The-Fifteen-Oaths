from pathlib import Path
p=Path('/tmp/ninja-v13/kiln_ninja.py');s=p.read_text()
s=s.replace("  return ((.085+lift)*math.sin(theta)*math.cos(phi),.006+(.079+lift)*math.sin(theta)*math.sin(phi),1.735+(.072+lift)*math.cos(theta))","  if theta>1.75 and math.sin(phi)>-.12:\n   t=(theta-1.75)/1.0;rx=.084-.019*t;ry=.079-.024*t\n   return ((rx+lift)*math.cos(phi),.006+(ry+lift)*math.sin(phi),1.722-.087*t)\n  return ((.085+lift)*math.sin(theta)*math.cos(phi),.006+(.079+lift)*math.sin(theta)*math.sin(phi),1.735+(.072+lift)*math.cos(theta))")
s=s.replace('limit=2.12-.84*front-.12*part+.055*math.sin(phi*5+.3)','rear=max(0,math.sin(phi));limit=2.29-.99*front-.12*part+.30*rear+.070*math.sin(phi*7+.3)')
s=s.replace(" for i,(pts,width,twist) in enumerate(heroes):\n  hair_lock", " for i,(pts,width,twist) in enumerate(heroes):\n  if pts[-1][2]>1.735:pts[-1]=tuple(Vector(pts[-2])*.40+Vector(pts[-1])*.60)\n  hair_lock")
a=s.index(' # Crown/back masses follow oblique');b=s.index(' for sign in [-1,1]:\n  hair_lock(\'Anatomical temple',a)
s=s[:a]+''' # A single interleaved rear hierarchy crosses crown and nape: no separate row.
 # Starts and ends vary independently, so there is no shared cap/skirt junction.
 for i in range(25):
  fraction=(i*.61803398875)%1;phi=-.10+fraction*(math.pi+.15)
  start=.28+.91*((i*.41421356237)%1);end=2.23+.49*((i*.73205080757)%1)
  bend=.36+.30*((i*.27182818284)%1);middle=start+(end-start)*.49
  coords=[(start,phi-bend,.001),(start+(end-start)*.22,phi-bend*.64,.004),(middle,phi-.06,.004),(end-.20,phi+.18,.003),(end,phi+.29,.002)]
  width=.0055+.003*((i*.14142135623)%1)
  hair_lock('Interleaved diagonal crown nape mass %02d'%i,[point(*v) for v in coords],width,.40*math.sin(i*1.7))
  if i%3!=1:
   coords2=[(a+.065,b+.07,lift+.0007) for a,b,lift in coords[1:]]
   a,b,lift=coords2[-1];coords2[-1]=(a+.07*math.sin(i),b+.04,lift)
   hair_lock('Offset crossing subordinate mass %02d'%i,[point(*v) for v in coords2],width*.31,-.20*math.sin(i))
 # Fine lower groups emerge at different heights inside the same continuous scalp.
 for i in range(13):
  phi=.03+((i*.61803398875)%1)*(math.pi-.06);start=1.29+.55*((i*.41421356237)%1)
  end=2.37+.42*((i*.73205080757)%1);bend=.20+.21*math.sin(i*.9)
  coords=[(start,phi-.44,0),(start+.28,phi-.22,.004),((start+end)*.5+.15,phi+.05,.003),(end,phi+bend,.001)]
  hair_lock('Staggered fine nape tip %02d'%i,[point(*v) for v in coords],.0028+.0012*((i*.2718)%1),.25*math.sin(i*1.2))
''' +s[b:]
s=s.replace("mesh('Continuous asymmetric hair root mass V12'","mesh('Continuous interleaved scalp and nape root V13'").replace("hairmat.name='V12 mapped soot hair volume material'","hairmat.name='V13 mapped soot hair volume material'")
p.write_text(s)
