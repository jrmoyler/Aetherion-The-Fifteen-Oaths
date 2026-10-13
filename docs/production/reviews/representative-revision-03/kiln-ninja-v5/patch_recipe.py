from pathlib import Path
p=Path('/tmp/kiln-ninja-revision05/kiln_ninja.py');s=p.read_text().replace("ROOT=Path(__file__).resolve().parents[3]","ROOT=Path('/workspace/Aetherion-The-Fifteen-Oaths')").replace("Path('/tmp/kiln-ninja-revision04')","Path('/tmp/kiln-ninja-revision05')")
s=s.replace("sections=[(1.575,.026,.025,.004),(1.586,.036,.036,.002),(1.599,.045,.043,.002),(1.613,.052,.048,.003)","sections=[(1.575,.034,.041,.003),(1.586,.042,.046,.002),(1.599,.049,.048,.002),(1.613,.055,.050,.003)")
s=s.replace(".022*math.exp(-((z-1.656)/.010)**2)",".012*math.exp(-((z-1.656)/.010)**2)")
s=s.replace("y-=.004*math.exp(-((z-1.622)/.004)**2)*math.exp(-(x/.024)**4)","y-=.005*math.exp(-((z-1.622)/.008)**2)*math.exp(-(x/.024)**4)\n   y-=.007*math.exp(-((z-1.595)/.010)**2)*math.exp(-(x/.031)**4)")
s=s.replace("(sign*.008,-.077,1.650),(sign*.011,-.075,1.648),(sign*.014,-.068,1.650)","(sign*.006,-.064,1.651),(sign*.010,-.062,1.649),(sign*.013,-.059,1.651)")
s=s.replace("[(-.023,-.050,1.621),(-.012,-.055,1.621),(0,-.057,1.620),(.012,-.055,1.621),(.023,-.050,1.621)]","[(-.023,-.046,1.621),(-.012,-.051,1.621),(0,-.052,1.620),(.012,-.051,1.621),(.023,-.046,1.621)]")
s=s.replace("(s*.012,-.074,1.700),(s*.028,-.076,1.706),(s*.043,-.072,1.708),(s*.056,-.065,1.705),(s*.043,-.073,1.704),(s*.029,-.077,1.701),(s*.014,-.075,1.696)","(s*.012,-.060,1.700),(s*.028,-.059,1.706),(s*.043,-.051,1.708),(s*.056,-.040,1.705),(s*.043,-.052,1.704),(s*.029,-.060,1.701),(s*.014,-.061,1.696)")
s=s.replace("[(1,s*.090),(.57,s*.098),(.36,s*.087)]","[(1,s*.075),(.57,s*.080),(.36,s*.073)]").replace("(s*.092,y,z)","(s*.077,y,z)").replace("(s*.092,*contour[0])","(s*.077,*contour[0])")
s=s.replace("across=direction.cross(Vector((0,-1,.3))).normalized()","normal=Vector((p.x/0.075,(p.y-.01)/.07,(p.z-1.73)/.065)).normalized();across=direction.cross(normal).normalized()")
s=s.replace("Vector((0,-.0015,.0035*(1-q*q)*profile))","normal*(.0012+.0020*(1-q*q)*profile)")
s=s.replace("mod.thickness=.002","mod.thickness=.0007")
a=s.index('def designed_hair():');b=s.index('\n\ndef draped_cape():',a)
s=s[:a]+'''def designed_hair():
 # Irregular cranial hairline and overlapping radial locks, sized in meters.
 base=rings('Fitted irregular cranial hair underlayer',[(0,.01,1.712,.077,.064),(0,.012,1.739,.078,.069),(0,.014,1.764,.069,.060),(0,.014,1.784,.044,.040),(0,.014,1.791,.009,.010)],'hair',{'head':1},40)
 for v in base.data.vertices:
  if v.co.z<1.72:v.co.z+=.010*math.sin(v.co.x*69)+.005*math.sin(v.co.y*91)
 rng=random.Random(590)
 for i in range(35):
  x=-.077+i*.0045;z=1.721+rng.uniform(-.015,.026);sweep=rng.uniform(-.018,.009)
  hair_lock('Crossed tapered fringe %02d'%i,[(x*.25+.009,.014,1.786),(x*.6+.013,-.010,1.794+rng.uniform(-.006,.010)),(x+.014,-.040,1.771),(x+.002,-.064,1.746),(x+sweep,-.070,z)],rng.uniform(.003,.0055))
 for side,sign in [('L',1),('R',-1)]:
  for row in range(3):
   for i in range(12):
    y=-.036+i*.008;top=1.778-row*.017;tip=top-.036-rng.uniform(.003,.015)
    hair_lock('Overlapping temporal tuft %s %d %d'%(side,row,i),[(sign*.051,y+.004,top),(sign*.072,y,top-.009),(sign*.080,y-.004,top-.021),(sign*(.075+rng.uniform(-.002,.008)),y-.014,tip)],rng.uniform(.0035,.006))
 for i in range(22):
  x=-.066+i*.0063
  hair_lock('Irregular nape tuft %d'%i,[(x*.6,.052,1.768),(x,.070,1.751),(x*.98,.076,1.730),(x*.93,.064,1.703+rng.uniform(-.008,.007))],rng.uniform(.003,.006))
''' + s[b:]
# CPU review with deterministic lighting unchanged; modest samples to inspect geometry.
s=s.replace('scene.cycles.samples=32','scene.cycles.samples=24')
p.write_text(s)
