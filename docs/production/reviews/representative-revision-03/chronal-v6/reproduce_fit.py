import bpy,sys,math,json
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'chronal-wrist-tool-v6.blend'));bpy.context.scene.frame_set(1);weapon=list(bpy.context.scene.objects)
coords=[o.matrix_world@v.co for o in weapon if o.type=='MESH' for v in o.data.vertices];mn=[min(v[k] for v in coords) for k in range(3)];mx=[max(v[k] for v in coords) for k in range(3)]
report={'status':'PROPOSED_FIT_FIXTURE_NOT_CHARACTER_CERTIFICATION','sourceReference':'reference-034','weaponBoundsMeters':{'min':mn,'max':mx,'dimensions':[mx[k]-mn[k] for k in range(3)]},'sheetNominalLongestDimensionMeters':.16,'fixtureWristSectionMeters':{'halfWidth':.027,'halfThickness':.019},'textureEvidence':'textures/chronal_wrist_localized_basecolor.png','UVAtlasResolution':1024,'note':'Neutral anatomical witness only; actual character skin, glove fit, pose clearance and dynamic collision remain review gates.'}
(OUT/'measured-fit.json').write_text(json.dumps(report,indent=2)+'\n')
mat=bpy.data.materials.new('Neutral fit witness gray');mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.20,.205,.21,1);bs.inputs['Roughness'].default_value=.85
# Distinct wrist/forearm/palm cross-sections; intentionally neutral witness, not a game character.
def sweep(name,centers,widths,heights,n=20):
 vs=[];fs=[]
 for (x,y,z),rx,rz in zip(centers,widths,heights):
  vs.extend([(x+rx*math.cos(i*math.pi*2/n),y,z+rz*math.sin(i*math.pi*2/n)) for i in range(n)])
 for j in range(len(centers)-1):
  for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
 fs.extend([tuple(reversed(range(n))),tuple(range((len(centers)-1)*n,len(centers)*n))]);me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat)
 for p in me.polygons:p.use_smooth=True
 return ob
sweep('Neutral forearm wrist and palm',[(0,-.18,-.018),(0,-.10,-.018),(0,-.055,-.018),(0,-.032,-.018),(0,.028,-.018),(0,.055,-.018),(0,.095,-.019),(0,.116,-.020)],[.043,.036,.029,.027,.027,.035,.039,.034],[.032,.028,.021,.019,.019,.018,.017,.012])
for x,length,r in [(-.025,.062,.0075),(-.009,.077,.008),(.009,.083,.008),(.025,.065,.007)]:
 sweep('Neutral finger',[(x,.110,-.020),(x,.13,-.021),(x,.11+length*.68,-.023),(x,.11+length,-.024)],[r,r*.96,r*.82,r*.30],[r*.85,r*.88,r*.75,r*.27],12)
sweep('Neutral thumb',[(-.027,.055,-.019),(-.041,.070,-.016),(-.056,.087,-.014),(-.069,.101,-.012)],[.012,.011,.009,.005],[.011,.010,.008,.004],12)
obs=list(bpy.context.scene.objects)
source=(OUT/'reproduce_review.py').read_text();start=source.index('def render(');end=source.index("render('chronal-wrist-tool",start);exec(source[start:end])
render('chronal-wrist-tool-v6-wrist-fit',(1.1,.7,1.9))
render('chronal-wrist-tool-v6-wrist-fit-side',(1.8,-.1,.7))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'chronal-wrist-v6-neutral-fit-witness.blend'))
print('WRIST_FIT_COMPLETE')
