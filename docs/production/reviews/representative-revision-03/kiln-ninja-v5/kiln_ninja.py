"""Author one Kiln ninja candidate from inspected references 090 and 060.
Blender 4.3.2: blender -b --python tools/production/authoring/kiln_ninja.py
Meters, Blender Z up, front -Y. Source identity and all artwork remain untouched.
Deliberately no imported/generative character stock; cross-section topology is authored here.
"""
import bpy, bmesh, math, json, random, sys, hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path('/workspace/Aetherion-The-Fifteen-Oaths')
FULL_REVIEW='--full-review' in sys.argv
PREVIEW='--preview' in sys.argv or FULL_REVIEW
OUT=Path('/tmp/kiln-ninja-revision05') if PREVIEW else ROOT/'assets/production/oath-01/characters';OUT.mkdir(parents=True,exist_ok=True)
ID='kiln-ninja-ensemble-candidate';D=OUT/ID;D.mkdir(exist_ok=True)
random.seed(90)
PARTS=[];MAT=None
CELLS={'cloth':0,'ceramic':1,'iron':2,'skin':3,'leather':4,'hair':5,'eye':6,'iris':7}
BONES={}
def artifact_path(p):
 return str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p)

def atlas():
 global MAT
 n=2048;s=512;yy,xx=np.mgrid[:s,:s];rng=np.random.default_rng(90)
 bc=np.ones((n//2,n,4));orm=bc.copy();normal=bc.copy()
 colors=[(.07,.067,.062),(.56,.235,.12),(.19,.175,.15),(.62,.445,.32),(.12,.081,.057),(.018,.014,.012),(.46,.42,.37),(.18,.115,.06)]
 for i,col in enumerate(colors):
  noise=rng.random((s,s));r=(i//4)*s;c=(i%4)*s
  grain=.985+noise*.03 if i==3 else .88+noise*.24
  if i==0: grain*=.86+.14*(np.sin(xx*math.pi/2)**2+np.sin(yy*math.pi/2)**2);grain*=1+.06*np.sin(xx*.038+np.sin(yy*.012))
  if i==1:
   grain[noise>.992]*=.31;grain*=.92+.08*np.sin(xx*.019)*np.cos(yy*.023);grain[(noise>.965)&(noise<.969)]*=1.35
  if i==4: grain*=.9+.1*np.sin(xx*.8+np.sin(yy*.2))
  if i==5: grain*=.82+.18*np.sin(xx*.24+np.sin(yy*.034)*2)
  for k in range(3):bc[r:r+s,c:c+s,k]=col[k]*grain
  orm[r:r+s,c:c+s,0]=1;orm[r:r+s,c:c+s,1]=([.94,.80,.62,.73,.85,.90,.37,.31][i]+(noise-.5)*.1);orm[r:r+s,c:c+s,2]=.83 if i==2 else 0
  normal[r:r+s,c:c+s,0]=.5+(noise-.5)*(.018 if i==3 else .075);normal[r:r+s,c:c+s,1]=.5+(np.roll(noise,1,0)-.5)*(.018 if i==3 else .075);normal[r:r+s,c:c+s,2]=1
 images=[]
 for name,pix in [('basecolor',bc),('orm',orm),('normal',normal)]:
  path=D/(ID+'-'+name+'.png');im=bpy.data.images.new('Kiln atlas '+name,width=n,height=n//2,alpha=True);im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(pix.astype(np.float32).ravel());im.filepath_raw=str(path);im.file_format='PNG';im.save();bpy.data.images.remove(im);im=bpy.data.images.load(str(path),check_existing=False);im.colorspace_settings.name='sRGB' if name=='basecolor' else 'Non-Color';images.append(im)
 MAT=bpy.data.materials.new('Kiln firecloth / porous ceramic / oxidized iron atlas');MAT.use_nodes=True;nodes=MAT.node_tree.nodes;links=MAT.node_tree.links;bs=nodes.get('Principled BSDF')
 ts=[]
 for im in images:t=nodes.new('ShaderNodeTexImage');t.image=im;ts.append(t)
 links.new(ts[0].outputs['Color'],bs.inputs['Base Color']);sep=nodes.new('ShaderNodeSeparateColor');links.new(ts[1].outputs['Color'],sep.inputs[0]);links.new(sep.outputs['Green'],bs.inputs['Roughness']);links.new(sep.outputs['Blue'],bs.inputs['Metallic'])
 nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.3;links.new(ts[2].outputs['Color'],nm.inputs['Color']);links.new(nm.outputs[0],bs.inputs['Normal'])
 # Recognized glTF occlusion channel shares the packed ORM image.
 group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat');gn=nodes.new('ShaderNodeGroup');gn.node_tree=group;links.new(sep.outputs['Red'],gn.inputs['Occlusion'])
 return [artifact_path(D/(ID+'-'+s+'.png')) for s in ['basecolor','orm','normal']]

def mesh(name,verts,faces,mat,weights):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(MAT)
 for i,v in enumerate(verts):
  w=weights(v) if callable(weights) else weights
  for bone,value in w.items():
   if value>1e-6:
    g=ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone);g.add([i],value,'REPLACE')
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.uv.smart_project(angle_limit=1.0,island_margin=.018);bpy.ops.object.mode_set(mode='OBJECT')
 cell=CELLS[mat]
 for uv in me.uv_layers.active.data:uv.uv=((cell%4+(.03+uv.uv.x*.94))/4,(cell//4+(.03+uv.uv.y*.94))/2)
 for face in me.polygons:face.use_smooth=mat in {'skin','cloth','leather','hair'}
 ob['authoring_component']=name;ob['material_region']=mat;PARTS.append(ob);return ob

def rings(name,sections,mat,weights,n=12):
 # section=(x,y,z,halfwidth,halfdepth); rings around Z for tailored torso, legs and head.
 vs=[]
 for x,y,z,rx,ry in sections:
  vs.extend([(x+rx*math.cos(2*math.pi*i/n),y+ry*math.sin(2*math.pi*i/n),z) for i in range(n)])
 fs=[tuple(reversed(range(n))),tuple((len(sections)-1)*n+i for i in range(n))]
 for k in range(len(sections)-1):
  for i in range(n):j=(i+1)%n;fs.append((k*n+i,k*n+j,(k+1)*n+j,(k+1)*n+i))
 return mesh(name,vs,fs,mat,weights)

def tube(name,points,radii,mat,weights,n=10):
 vs=[]
 for k,pt in enumerate(points):
  tangent=Vector(points[min(k+1,len(points)-1)])-Vector(points[max(0,k-1)])
  tangent.normalize();axis=Vector((0,1,0));u=tangent.cross(axis).normalized();v=tangent.cross(u).normalized()
  rad=radii[k];rx,ry=rad if isinstance(rad,tuple) else (rad,rad)
  vs.extend([Vector(pt)+u*(rx*math.cos(i*2*math.pi/n))+v*(ry*math.sin(i*2*math.pi/n)) for i in range(n)])
 fs=[tuple(reversed(range(n))),tuple((len(points)-1)*n+i for i in range(n))]
 for k in range(len(points)-1):
  for i in range(n):j=(i+1)%n;fs.append((k*n+i,k*n+j,(k+1)*n+j,(k+1)*n+i))
 return mesh(name,vs,fs,mat,weights)

def slab(name,polygon,depth,mat,weights):
 # Front profile in world-space, thickness extends backward +Y.
 vs=polygon+[(x,y+depth,z) for x,y,z in polygon];n=len(polygon)
 fs=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,vs,fs,mat,weights)

def rect(name,c,size,mat,weights):
 x,y,z=c;w,d,h=size
 return slab(name,[(x-w/2,y-d/2,z-h/2),(x+w/2,y-d/2,z-h/2),(x+w/2,y-d/2,z+h/2),(x-w/2,y-d/2,z+h/2)],d,mat,weights)

def blend(v,lower,upper,z0,z1):
 t=max(0,min(1,(v[2]-z0)/(z1-z0)));return {lower:1-t,upper:t}
def torso(v):
 if v[2]<1.18:return blend(v,'pelvis','spine',1.02,1.18)
 return blend(v,'spine','chest',1.2,1.42)

def seam(name,points,radius,material,weights,n=6):
 return tube(name,points,[radius]*len(points),material,weights,n)

def rivet(name,point,weights,r=.0045):
 x,y,z=point
 return tube(name,[(x,y+.003,z),(x,y,z),(x,y-.002,z)],[r*.72,r,r*.74],'iron',weights,8)

def strap(name,points,width,material,weights):
 verts=[]
 for x,y,z in points:verts.extend([(x-width/2,y,z),(x+width/2,y,z),(x-width/2,y+.004,z),(x+width/2,y+.004,z)])
 faces=[]
 for i in range(len(points)-1):
  a=i*4;b=a+4;faces.extend([(a,a+1,b+1,b),(a+2,b+2,b+3,a+3),(a,a+4,a+6,a+2),(a+1,a+3,a+7,a+5)])
 faces.extend([(0,2,3,1),(len(verts)-4,len(verts)-3,len(verts)-1,len(verts)-2)])
 return mesh(name,verts,faces,material,weights)

def buckle(name,x,y,z,w,h,weights):
 path=[]
 for cx,cz,a0 in [(x+w/2-.004,z+h/2-.004,0),(x-w/2+.004,z+h/2-.004,90),(x-w/2+.004,z-h/2+.004,180),(x+w/2-.004,z-h/2+.004,270)]:
  for j in range(4):
   a=math.radians(a0+j*30);path.append((cx+.004*math.cos(a),y,cz+.004*math.sin(a)))
 path.append(path[0]);seam(name+' forged perimeter',path,.0034,'iron',weights,6)
 seam(name+' tongue',[(x,y-.002,z-h*.39),(x,y-.004,z+h*.24)],.0026,'iron',weights,6)

def tailored_pants():
 # A single branching quad surface joins pelvis and both legs through a real crotch.
 coords=[(0,0,1.06),(0,0,1.10)];edges=[(0,1)];radii=[(.122,.088),(.122,.088)]
 for s in [-1,1]:
  previous=0
  for x,y,z,rx,ry in [(s*.078,0,.955,.087,.092),(s*.105,-.001,.845,.097,.101),(s*.116,0,.727,.106,.098),(s*.118,-.006,.625,.104,.088),(s*.105,-.006,.553,.076,.067),(s*.101,0,.514,.060,.057)]:
   i=len(coords);coords.append((x,y,z));edges.append((previous,i));previous=i;radii.append((rx,ry))
 me=bpy.data.meshes.new('Tailored connected pelvis construction');me.from_pydata(coords,edges,[]);me.update();ob=bpy.data.objects.new('Pants quad construction cage',me);bpy.context.collection.objects.link(ob);bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 sk=ob.modifiers.new('Connected pelvis and leg surface','SKIN')
 for v,r in zip(me.skin_vertices[0].data,radii):v.radius=r
 me.skin_vertices[0].data[0].use_root=True;bpy.ops.object.modifier_apply(modifier=sk.name)
 sub=ob.modifiers.new('Joint loop refinement','SUBSURF');sub.levels=2;bpy.ops.object.modifier_apply(modifier=sub.name)
 vs=[]
 for v in ob.data.vertices:
  x,y,z=v.co;cx=.102 if x>0 else -.102;ang=math.atan2(y,(x-cx));envelope=math.exp(-((z-.58)/.10)**2)
  f=.003*math.sin(z*52+ang*4)+envelope*.010*math.sin(z*78-ang*2)+.004*math.sin(z*40+ang*3)
  if z<.97:x+=math.cos(ang)*f;y+=math.sin(ang)*f
  vs.append((x,y,z))
 fs=[tuple(p.vertices) for p in ob.data.polygons];bpy.data.objects.remove(ob,do_unlink=True)
 def pantsw(v):
  side='L' if v[0]>0 else 'R';t=max(0,min(1,(v[2]-.89)/.13))
  if t>0:return {'thigh.'+side:1-t,'pelvis':t}
  return blend(v,'shin.'+side,'thigh.'+side,.515,.61)
 ob=mesh('Connected tailored trouser pelvis, crotch and gathered legs',vs,fs,'cloth',pantsw)
 for side,s in [('L',1),('R',-1)]:
  # Darts and visible seams follow the cloth surface rather than flat painted stripes.
  path=[(s*.135,-.095,1.055),(s*.15,-.095,1.00),(s*.169,-.095,.92),(s*.175,-.087,.83)]
  seam('Terracotta trouser pocket welt '+side,path,.0023,'ceramic',pantsw)
  seam('Rear trouser stitched seam '+side,[(s*.103,.095,1.049),(s*.136,.096,.963),(s*.158,.087,.864),(s*.144,.077,.76)],.0018,'leather',pantsw)
  rings('Soft gathered knee cuff '+side,[(s*.101,0,.505,.063,.063),(s*.101,-.002,.522,.066,.066),(s*.101,-.005,.54,.066,.063)],'leather',pantsw,20)

def ceramic_band(name,z,height,rx,ry,weights,front=True):
 # Curved rib-cage shell with modelled chamfer rims and rolled vertical ends.
 n=20;a0,a1=(-math.pi+.14,-.14) if front else (.14,math.pi-.14)
 verts=[]
 for rear in [0,.007]:
  for t,inset in [(0,.0015),(.07,0),(.93,0),(1,.0015)]:
   for i in range(n+1):
    a=a0+(a1-a0)*i/n;xx=(rx-inset-rear)*math.cos(a);yy=(ry-inset-rear)*math.sin(a)
    verts.append((xx,yy,z+t*height+.013*math.cos(a*2)+.004*math.sin(a*3)))
 k=n+1;fs=[]
 for row in range(3):
  for i in range(n):
   v=row*k+i;fs.extend([(v,v+1,v+k+1,v+k),(4*k+v,5*k+v,5*k+v+1,4*k+v+1)])
 for i in range(n):fs.extend([(i,4*k+i,4*k+i+1,i+1),(3*k+i,3*k+i+1,7*k+i+1,7*k+i)])
 for side in [0,n]:
  for row in range(3):v=row*k+side;fs.append((v,v+k,5*k+v,4*k+v))
 ob=mesh(name,verts,fs,'ceramic',weights)
 for p in ob.data.polygons:p.use_smooth=True
 for a in [a0+.20,a1-.20]:
  x=rx*math.cos(a);y=ry*math.sin(a);rivet(name+' fastening',(x,y+(-.006 if front else .006),z+height*.5),weights)
 return ob

def face_anatomy():
 # One continuous head surface: forehead, cheek, jaw, nasal/labial planes and orbital apertures.
 sections=[(1.575,.034,.041,.003),(1.586,.042,.046,.002),(1.599,.049,.048,.002),(1.613,.055,.050,.003),(1.628,.060,.052,.004),(1.644,.069,.057,.005),(1.656,.074,.060,.006),(1.669,.075,.062,.008),(1.680,.075,.062,.008),(1.689,.075,.063,.008),(1.698,.075,.065,.009),(1.712,.074,.066,.010),(1.735,.071,.064,.011),(1.755,.061,.058,.012),(1.774,.039,.041,.012),(1.781,.012,.019,.012)]
 us=[-1,-.8,-.65,-.54,-.4,-.28,-.2,0,.2,.28,.4,.54,.65,.8,1];verts=[];front=[];back=[]
 for z,rx,ry,cy in sections:
  row=[]
  for u in us:
   x=u*rx;y=cy-ry*math.sqrt(max(0,1-u*u))
   # Orbital recess under brow; zygomatic and cheek planes; narrow continuous nasal bridge.
   orbit=math.exp(-((abs(x)-.030)/.018)**2)*math.exp(-((z-1.684)/.010)**2)
   y+=.004*orbit
   y-=.006*math.exp(-((abs(x)-.043)/.015)**2)*math.exp(-((z-1.655)/.013)**2)
   y-=.006*math.exp(-((z-1.700)/.009)**2)*math.exp(-((abs(x)-.030)/.022)**2)
   nose=(.011*math.exp(-((z-1.680)/.019)**2)+.012*math.exp(-((z-1.656)/.010)**2))*math.exp(-(x/.012)**2)
   y-=nose
   y-=.005*math.exp(-((z-1.622)/.008)**2)*math.exp(-(x/.024)**4)
   y-=.007*math.exp(-((z-1.595)/.010)**2)*math.exp(-(x/.031)**4)
   row.append(len(verts));verts.append((x,y,z))
  front.append(row);row=[]
  for i in range(1,16):
   a=math.pi*i/16;row.append(len(verts));verts.append((rx*math.cos(a),cy+ry*math.sin(a),z))
  back.append(row)
 faces=[];eye_row=8
 for r in range(len(sections)-1):
  for j in range(14):
   if r==eye_row and (2<=j<6 or 8<=j<12):continue
   faces.append((front[r][j],front[r][j+1],front[r+1][j+1],front[r+1][j]))
  ar=[front[r][-1]]+back[r]+[front[r][0]];br=[front[r+1][-1]]+back[r+1]+[front[r+1][0]]
  for j in range(len(ar)-1):faces.append((ar[j],ar[j+1],br[j+1],br[j]))
 for row in [0,len(sections)-1]:faces.append(tuple(front[row]+back[row]))
 for sign,j0 in [(-1,2),(1,8)]:
  # Boundary uses the head's existing vertices: eyelids are connected, not floating rings.
  boundary=front[eye_row][j0:j0+5]+list(reversed(front[eye_row+1][j0:j0+5]));previous=boundary
  for layer in [0,1]:
   current=[]
   for i in range(10):
    a=math.pi+2*math.pi*i/10;cx=sign*.030;x=cx+(.018 if layer==0 else .0155)*math.cos(a);z=1.684+(.0048 if layer==0 else .0032)*math.sin(a)+sign*(x-cx)*.07
    y=(-.058 if layer==0 else -.062)+.004*(abs(x)/.06)**2
    current.append(len(verts));verts.append((x,y,z))
   for i in range(10):k=(i+1)%10;faces.append((previous[i],previous[k],current[k],current[i]))
   previous=current
 head=mesh('Continuous facial orbital nasal cheek jaw topology',verts,faces,'skin',{'head':1});head['topology_note']='Eye aperture loops share vertices with facial grid; no separate eyelid-ring geometry'
 for sign in [-1,1]:
  seam('Nostril alar inset crease',[(sign*.006,-.064,1.651),(sign*.010,-.062,1.649),(sign*.013,-.059,1.651)],.00045,'leather',{'head':1},5)
 seam('Closed natural lip line',[(-.023,-.046,1.621),(-.012,-.051,1.621),(0,-.052,1.620),(.012,-.051,1.621),(.023,-.046,1.621)],.0008,'leather',{'head':1},6)
 for side,s in [('L',1),('R',-1)]:
  cx=s*.030;cz=1.684;n=20
  # Sclera and iris share one curved eye surface; iris is trimmed by the lid aperture.
  def eye_y(x,z):return -.0612+.004*(abs(x)/.06)**2+.0018*((x-cx)/.016)**2+.0008*((z-cz)/.004)**2
  v=[(cx,eye_y(cx,cz),cz)]+[(cx+.0155*math.cos(i*2*math.pi/n),eye_y(cx+.0155*math.cos(i*2*math.pi/n),cz+.0035*math.sin(i*2*math.pi/n)),cz+.0035*math.sin(i*2*math.pi/n)+s*.00155*math.cos(i*2*math.pi/n)) for i in range(n)]
  mesh('Embedded curved almond sclera '+side,v,[(0,i+1,(i+1)%n+1) for i in range(n)],'eye',{'head':1})
  for rad,depth,mat in [(.0045,.00012,'iris'),(.0020,.00020,'hair')]:
   vs=[(cx,eye_y(cx,cz)-depth,cz)]
   for i in range(24):
    a=i*2*math.pi/24;x=cx+rad*math.cos(a);z=cz+max(-.0032,min(.0032,rad*math.sin(a)))
    vs.append((x,eye_y(x,z)-depth,z))
   mesh('Lid clipped embedded iris pupil '+side,vs,[(0,i+1,(i+1)%24+1) for i in range(24)],mat,{'head':1})
  mesh('Anatomical tapered eyebrow '+side,[(s*.012,-.060,1.700),(s*.028,-.059,1.706),(s*.043,-.051,1.708),(s*.056,-.040,1.705),(s*.043,-.052,1.704),(s*.029,-.060,1.701),(s*.014,-.061,1.696)],[(0,1,5,6),(1,2,4,5),(2,3,4)],'hair',{'head':1})
  # Sculpted pinna rim and recessed concha, flattened against head instead of sphere ears.
  contour=[(.001,1.639),(-.010,1.645),(-.013,1.665),(-.010,1.684),(.004,1.692),(.017,1.683),(.020,1.658),(.013,1.643)]
  vs=[]
  for scale,x in [(1,s*.075),(.57,s*.080),(.36,s*.073)]:
   for y,z in contour:vs.append((x,.004+(y-.004)*scale,1.666+(z-1.666)*scale))
  fs=[]
  for row in range(2):
   for i in range(8):j=(i+1)%8;fs.append((row*8+i,row*8+j,(row+1)*8+j,(row+1)*8+i))
  fs.append(tuple(range(16,24)));mesh('Ear helix and concha '+side,vs,fs,'skin',{'head':1})
  seam('Helix ridge '+side,[(s*.077,y,z) for y,z in contour]+[(s*.077,*contour[0])],.002,'skin',{'head':1},6)


def hair_lock(name,points,width):
 original=[Vector(p) for p in points];dense=[]
 for i in range(len(original)-1):
  a=original[max(0,i-1)];b=original[i];c=original[i+1];d=original[min(len(original)-1,i+2)]
  for step in range(3):
   t=step/3;dense.append(tuple(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)))
 dense.append(tuple(original[-1]));points=dense
 verts=[];n=7
 for k,p in enumerate(points):
  t=k/(len(points)-1);p=Vector(p);direction=Vector(points[min(k+1,len(points)-1)])-Vector(points[max(0,k-1)]);normal=Vector((p.x/0.075,(p.y-.01)/.07,(p.z-1.73)/.065)).normalized();across=direction.cross(normal).normalized()
  if across.length<.1:across=Vector((1,0,0))
  profile=math.sin(math.pi*(.018+.97*t))**.7
  for j in range(n):
   q=-1+2*j/(n-1);v=p+across*(q*width*profile)+normal*(.0012+.0020*(1-q*q)*profile);verts.append(tuple(v))
 fs=[]
 for k in range(len(points)-1):
  for j in range(n-1):i=k*n+j;fs.append((i,i+1,i+n+1,i+n))
 ob=mesh(name,verts,fs,'hair',{'head':1})
 for loop in ob.data.loops:
  k,j=divmod(loop.vertex_index,n);ob.data.uv_layers.active.data[loop.index].uv=((1+.03+.94*j/(n-1))/4,(1+.03+.94*k/(len(points)-1))/2)
 bpy.context.view_layer.objects.active=ob;mod=ob.modifiers.new('Hair lock thickness','SOLIDIFY');mod.thickness=.0007;bpy.ops.object.modifier_apply(modifier=mod.name)
 return ob

def designed_hair():
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


def draped_cape():
 verts=[];radial=9;n=48;outer=[]
 for j in range(radial):
  t=j/(radial-1)
  for i in range(n):
   a=2*math.pi*i/n;endz=1.362+.105*math.cos(a)+.009*math.sin(a)
   rrx=.067+(.285-.067)*t;rry=.06+(.178-.06)*math.sqrt(t)+.016*math.sin(math.pi*t)
   folds=(.013*math.sin(a*7+.4)+.005*math.sin(a*13-1.2))*math.sin(math.pi*t*.9)
   # Shoulder support then cloth weight dropping into asymmetric hem.
   z=1.535-(1.535-endz)*(t**1.7)+folds*1.2
   x=(rrx+folds)*math.cos(a);y=(rry+folds*.7)*math.sin(a)
   verts.append((x,y,z))
   if j==radial-1:outer.append((x,y-.001 if y<0 else y+.001,z))
 faces=[]
 for j in range(radial-1):
  for i in range(n):k=(i+1)%n;faces.append((j*n+i,j*n+k,(j+1)*n+k,(j+1)*n+i))
 def capew(v):
  # Skin cloth to upper arm slightly only on overhang; enough shoulder travel for candidate posing.
  s='L' if v[0]>0 else 'R';weight=max(0,min(.30,(abs(v[0])-.18)*2.8));return {'chest':1-weight,'upper_arm.'+s:weight}
 ob=mesh('Draped asymmetric radial fold shoulder cape',verts,faces,'cloth',capew);bpy.context.view_layer.objects.active=ob;mod=ob.modifiers.new('True folded cloth thickness','SOLIDIFY');mod.thickness=.004;bpy.ops.object.modifier_apply(modifier=mod.name)
 seam('Cape rolled terracotta hem',outer+[outer[0]],.003,'ceramic',capew,6)
 # Collar folds layered at throat, with irregular rim heights.
 vs=[];n=36
 for j,(z,rx,ry) in enumerate([(1.485,.080,.071),(1.506,.084,.076),(1.52,.074,.069),(1.54,.071,.066),(1.56,.061,.057),(1.575,.059,.054)]):
  for i in range(n):
   a=i*2*math.pi/n;fold=.0035*math.sin(a*4+j*1.1);vs.append(((rx+fold)*math.cos(a),(ry+fold)*math.sin(a)-.002,z+.004*math.sin(a*2+j)))
 fs=[]
 for j in range(5):
  for i in range(n):k=(i+1)%n;fs.append((j*n+i,j*n+k,(j+1)*n+k,(j+1)*n+i))
 mesh('Layered soft scarf collar folds',vs,fs,'cloth',lambda v:blend(v,'chest','neck',1.52,1.568))


def create_geometry_v2():
 rings('Anatomical underlayer torso loops',[(0,0,.97,.13,.087),(0,0,1.04,.14,.09),(0,0,1.13,.145,.092),(0,0,1.21,.163,.098),(0,0,1.32,.190,.11),(0,0,1.40,.204,.106),(0,0,1.456,.207,.085),(0,0,1.482,.162,.074),(0,0,1.505,.06,.05)],'cloth',torso,24)
 rings('Sternocleidomastoid neck transition',[(0,.005,1.477,.057,.049),(0,.002,1.52,.053,.045),(0,.003,1.56,.043,.037),(0,.002,1.578,.032,.032),(0,.002,1.609,.026,.029)],'skin',lambda v:blend(v,'chest','neck',1.52,1.57),24)
 tailored_pants()
 for side,s in [('L',1),('R',-1)]:
  thigh='thigh.'+side;shin='shin.'+side;foot='foot.'+side;upper='upper_arm.'+side;fore='forearm.'+side;hand='hand.'+side;x=s*.102
  rings('Calf shaped dark boot gaiter '+side,[(x,-.002,.15,.048,.051),(x,0,.21,.049,.048),(x,.008,.29,.054,.05),(x,.014,.39,.062,.057),(x,.011,.46,.063,.059),(x,0,.515,.057,.054)],'cloth',lambda v:blend(v,foot,shin,.15,.23),20)
  # Shin seams and overlap tongues are shaped to the calf, with rounded padded edges.
  seam('Shin vertical overlapping edge '+side,[(x-s*.032,-.049,.19),(x-s*.045,-.049,.33),(x-s*.048,-.05,.45),(x-s*.024,-.057,.48)],.0022,'leather',{shin:1})
  boot=rings('Anatomical leather boot last '+side,[(x,-.049,.018,.066,.136),(x,-.049,.033,.070,.142),(x,-.051,.055,.069,.142),(x,-.051,.09,.066,.133),(x,-.041,.12,.061,.108),(x,-.015,.16,.052,.070),(x,-.003,.203,.050,.053),(x,0,.245,.052,.051)],'leather',{foot:1},24)
  sole=rings('Boot rubber iron reinforced sole '+side,[(x,-.052,.014,.069,.142),(x,-.052,.025,.072,.144),(x,-.052,.039,.071,.143)],'iron',{foot:1},24)
  for part in [boot,sole]:
   for v in part.data.vertices:
    toe=max(0,min(1,(-v.co.y-.055)/.14));v.co.x=x+(v.co.x-x)*(.91-.10*toe);v.co.y=-.015+(v.co.y+.015)*.86
  seam('Boot upper stitched welt '+side,[(x+.068*math.cos(a),-.052+.137*math.sin(a),.06) for a in np.linspace(0,2*math.pi,33)],.0024,'cloth',{foot:1})
  for z,y,rx,ry in [(.085,-.066,.067,.12),(.143,-.017,.055,.071),(.195,-.003,.053,.055),(.235,0,.055,.053)]:
   # Curved straps wrap leather, with ceramic keeper and small hardware on outer ankle.
   pts=[(x+rx*math.cos(a),y+ry*math.sin(a),z) for a in np.linspace(math.pi+.1,2*math.pi-.1,17)]
   for dz in [-.008,.008]:seam('Boot strap leather rim '+side,[(a,b,c+dz) for a,b,c in pts],.003,'leather',{foot:1})
   strap('Ceramic boot keeper '+side,[(x,-.155 if z<.1 else y-ry-.004,z-.009),(x,-.155 if z<.1 else y-ry-.004,z+.009)],.058,'ceramic',{foot:1})
   buckle('Boot side buckle '+side,x+s*.048,y-.035,z,.022,.024,{foot:1})
  shoulder=(s*.212,0,1.435);elbow=(s*.307,0,1.235);wrist=(s*.365,-.006,1.013)
  def armw(v,upper=upper,fore=fore):return blend(v,fore,upper,1.211,1.274)
  tube('Anatomical shoulder biceps elbow forearm '+side,[shoulder,(s*.241,.002,1.394),(s*.27,.002,1.329),(s*.293,-.001,1.271),elbow,(s*.316,0,1.21),(s*.337,-.003,1.15),(s*.355,-.005,1.07),wrist],[.042,(.058,.055),(.052,.049),(.043,.040),(.042,.041),(.044,.042),(.042,.038),(.032,.03),(.030,.028)],'skin',armw,16)
  # Sleeve edges drape from rounded deltoid; radial folds replace flat shoulder slabs.
  points=[(s*.195,0,1.46),(s*.215,0,1.435),(s*.24,0,1.40),(s*.259,0,1.345),(s*.277,0,1.303)]
  ob=tube('Tailored rounded shoulder sleeve '+side,points,[(.037,.055),(.055,.064),(.063,.070),(.064,.069),(.058,.060)],'cloth',{upper:1},20)
  for v in ob.data.vertices:
   v.co.y+=.0035*math.sin(v.co.z*88+v.co.x*35);v.co.z+=.002*math.sin(v.co.y*95)
  tube('Sleeve rolled leather cuff '+side,[(s*.273,0,1.311),(s*.28,0,1.294)],[(.060,.062),(.058,.060)],'leather',{upper:1},20)
  seam('Sleeve stitched front seam '+side,[(s*.218,-.071,1.442),(s*.242,-.073,1.395),(s*.265,-.067,1.335),(s*.281,-.059,1.301)],.0015,'leather',{upper:1})
  tube('Forearm folded leather underwrap '+side,[(s*.316,-.002,1.204),(s*.329,-.004,1.165),(s*.345,-.006,1.11),(s*.362,-.006,1.055),(s*.367,-.007,1.01)],[.047,.049,.043,.037,.033],'leather',{fore:1},20)
  if side=='L':
   # Tapered ceramic bracer lattice, with real openings bounded by chamfered rails.
   for j,z in enumerate([1.061,1.10,1.139,1.178]):
    cx=s*(.365-(z-1.013)*.265);span=.074 if side=='L' else .040
    strap('Bracer ceramic vent frame '+side,[(cx,-.055,z-.008),(cx,-.055,z+.008)],span,'ceramic',{fore:1})
   for edge in [-1,1]:
    span=.039 if side=='L' else .023
    pts=[(s*(.365-(z-1.013)*.265)+edge*span,-.052,z) for z in [1.042,1.08,1.13,1.18,1.196]]
    seam('Bracer curved ceramic side rail '+side,pts,.008 if side=='L' else .005,'ceramic',{fore:1},8)
   for z in [1.066,1.185]:
    cx=s*(.365-(z-1.013)*.265);rivet('Bracer hinge rivet '+side,(cx+.039,-.065,z),{fore:1},.0035);buckle('Bracer leather clasp '+side,cx+s*.045,-.041,z,.024,.02,{fore:1})
  else:
   # Opposite arm has overlapping diagonal leather wraps, not a mirrored ceramic cage.
   for j in range(7):
    z=1.037+j*.024;cx=s*(.365-(z-1.013)*.265);radius=.036+(z-1.037)*.065
    ob=rings('Overlapping diagonal leather wrap %d'%j,[(cx,-.006,z-.009,radius,radius),(cx,-.006,z+.008,radius+.001,radius+.001)],'leather',{fore:1},20)
    for v in ob.data.vertices:v.co.z+=.10*(v.co.x-cx)
   for z in [1.083,1.179]:
    cx=s*(.365-(z-1.013)*.265);buckle('Leather wrap iron buckle',cx,-.057,z,.027,.021,{fore:1})
  # Palm tapers through wrist, then metacarpals; four separately bent digits have knuckle loops.
  palmcenters=[(s*.365,-.008,1.019),(s*.374,-.010,.991),(s*.380,-.011,.970),(s*.382,-.013,.949),(s*.381,-.012,.935)]
  tube('Anatomical fingerless glove palm '+side,palmcenters,[(.027,.027),(.036,.028),(.038,.026),(.035,.024),(.030,.023)],'cloth',{hand:1},16)
  for j in range(4):
   y=-.026+.002*(j%2);fx=s*(.360+j*.014);length=[.061,.074,.070,.052][j];start=(fx,y,.947);mid=(fx+s*.004,y-.006,.947-length*.53);end=(fx+s*.001,y-.017,.947-length)
   b='finger%d.%s'%(j+1,side);bt='finger%d_tip.%s'%(j+1,side);BONES[b]=(start,mid,hand);BONES[bt]=(mid,end,b)
   pts=[start,(fx+s*.003,y-.002,.947-length*.20),mid,(fx+s*.003,y-.011,.947-length*.75),end]
   tube('Anatomical exposed jointed finger %d %s'%(j+1,side),pts,[.0108,.0106,.0108,.0088,.0065],'skin',lambda v,b=b,bt=bt,mid=mid:blend(v,bt,b,mid[2]-.006,mid[2]+.008),10)
   tube('Fingerless glove knuckle rim %d %s'%(j+1,side),pts[:2],[.012,.0115],'cloth',{b:1},10)
   nailz=end[2]+.009;strap('Fingernail '+side,[(fx,y-.023,nailz-.005),(fx,y-.023,nailz+.006)],.007,'skin',{bt:1})
  start=(s*.351,-.032,.984);mid=(s*.332,-.045,.968);end=(s*.328,-.05,.946);b='thumb.'+side;BONES[b]=(start,end,hand)
  tube('Opposable thumb thenar anatomy '+side,[start,(s*.343,-.038,.978),mid,end],[.015,.014,.012,.009],'skin',{b:1},12)
  seam('Glove dorsal tendon seam '+side,[(s*.368,-.041,1.005),(s*.379,-.051,.982),(s*.383,-.05,.955)],.0016,'leather',{hand:1})
 # Segmented torso ceramics follow the ribs and remain separated by leather-backed gaps.
 for k in range(4):
  z=1.135+k*.070;rx=.149+k*.013;ry=.109+k*.008;bone={'spine':1} if k<2 else {'chest':1}
  ceramic_band('Curved chamfered front torso ceramic lame %d'%k,z,.065,rx,ry,bone)
  ceramic_band('Curved rear torso ceramic lame %d'%k,z,.065,rx,ry,bone,False)
 for side,s in [('L',1),('R',-1)]:
  strap('Lame carrier side strap '+side,[(s*.149,-.058,1.14),(s*.179,-.06,1.245),(s*.199,-.056,1.39)],.016,'leather',torso)
  for z in [1.16,1.23,1.30,1.37]:rivet('Lame carrier stud '+side,(s*(.15+(z-1.14)*.23),-.067,z),torso,.003)
 for s in [-1,1]:
  slab('Tailored slanted hip pocket flap',[(s*.119,-.080,1.049),(s*.178,-.063,1.012),(s*.188,-.073,.938),(s*.142,-.087,.956)],.006,'cloth',{'pelvis':1})
  seam('Hip flap stitched lower edge',[(s*.143,-.094,.957),(s*.189,-.081,.937),(s*.178,-.071,1.012)],.0015,'leather',{'pelvis':1})
 seam('Trouser fly folded seam',[(.013,-.093,1.061),(.012,-.102,1.016),(.01,-.105,.972)],.0018,'leather',{'pelvis':1})
 rings('Supple waist belt',[(0,0,1.066,.148,.103),(0,0,1.074,.154,.109),(0,0,1.111,.154,.109),(0,0,1.116,.148,.103)],'leather',{'pelvis':1},32)
 buckle('Forged waist buckle',0,-.113,1.091,.056,.037,{'pelvis':1})
 for a in [-2.6,-2.05,-1.0,-.5,.7,2.3]:
  x=.153*math.cos(a);y=.11*math.sin(a);strap('Belt keeper',[(x,y,1.068),(x,y,1.115)],.013,'leather',{'pelvis':1});rivet('Belt keeper stud',(x,y-.005,1.078),{'pelvis':1},.003)
 draped_cape()
 strap('Shoulder diagonal carrier strap',[(.189,-.148,1.482),(.171,-.171,1.438),(.15,-.181,1.385),(.127,-.165,1.334)],.026,'leather',{'chest':1})
 buckle('Cape attachment rounded buckle',.18,-.171,1.46,.039,.035,{'chest':1})
 for z in [1.411,1.373]:rivet('Shoulder carrier stud',(.155,-.181,z),{'chest':1},.003)
 face_anatomy();designed_hair()
 # Curved iron respiratory half mask, with individually seated thin ceramic grille slats.
 n=24;vs=[]
 for z,rx,ry in [(1.587,.055,.072),(1.595,.064,.080),(1.633,.071,.085),(1.646,.067,.080)]:
  for i in range(n+1):
   a=-math.pi+.22+(math.pi-.44)*i/n;vs.append((rx*math.cos(a),-.018+ry*math.sin(a),z+.005*math.cos(a*2)))
 fs=[]
 for j in range(3):
  for i in range(n):v=j*(n+1)+i;fs.append((v,v+1,v+n+2,v+n+1))
 ob=mesh('Fitted curved iron half mask',vs,fs,'iron',{'head':1});bpy.context.view_layer.objects.active=ob;mod=ob.modifiers.new('Mask shell thickness','SOLIDIFY');mod.thickness=.004;bpy.ops.object.modifier_apply(modifier=mod.name)
 for i in range(9):
  a=-math.pi+.56+(math.pi-1.12)*i/8;x=.068*math.cos(a);y=-.018+.084*math.sin(a)
  seam('Mask terracotta vertical grille %d'%i,[(x,y,1.6),(x*.99,y-.002,1.617),(x,y,1.637)],.0026,'ceramic',{'head':1},6)
 for s in [-1,1]:
  strap('Mask leather ear strap',[(s*.068,-.040,1.624),(s*.081,-.018,1.637),(s*.083,.006,1.649)],.011,'leather',{'head':1});rivet('Mask strap attachment',(s*.069,-.049,1.624),{'head':1},.003)

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


def rig():
 BONES.update({'root':((0,0,0),(0,0,.15),None),'pelvis':((0,0,.95),(0,0,1.10),'root'),'spine':((0,0,1.10),(0,0,1.28),'pelvis'),'chest':((0,0,1.28),(0,0,1.49),'spine'),'neck':((0,0,1.49),(0,0,1.61),'chest'),'head':((0,0,1.61),(0,0,1.80),'neck')})
 for side,s in [('L',1),('R',-1)]:
  BONES.update({'clavicle.'+side:((s*.06,0,1.45),(s*.212,0,1.451),'chest'),'upper_arm.'+side:((s*.212,0,1.451),(s*.307,0,1.235),'clavicle.'+side),'forearm.'+side:((s*.307,0,1.235),(s*.365,-.006,1.013),'upper_arm.'+side),'hand.'+side:((s*.365,-.006,1.013),(s*.382,-.013,.945),'forearm.'+side),'thigh.'+side:((s*.105,0,.95),(s*.105,0,.55),'pelvis'),'shin.'+side:((s*.105,0,.55),(s*.105,-.008,.15),'thigh.'+side),'foot.'+side:((s*.105,-.008,.15),(s*.105,-.15,.075),'shin.'+side)})
 bpy.ops.object.select_all(action='DESELECT');a=bpy.data.armatures.new('Kiln humanoid articulation');ob=bpy.data.objects.new('Kiln_Ninja_Rig',a);bpy.context.collection.objects.link(ob);ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.mode_set(mode='EDIT')
 for name,(h,t,p) in BONES.items():
  if name.startswith(('thigh.','shin.','foot.')):h=reference_stance(h);t=reference_stance(t)
  b=a.edit_bones.new(name);b.head=h;b.tail=t
 for name,(h,t,p) in BONES.items():
  if p:a.edit_bones[name].parent=a.edit_bones[p]
 bpy.ops.object.mode_set(mode='OBJECT');ob.show_in_front=True
 for p in ob.pose.bones:p.rotation_mode='XYZ'
 return ob

def animation(rig):
 # Pure authored in-place clips, export all actions by explicit NLA strips.
 clips=[]
 for name,duration in [('idle_breath',48),('walk_in_place',32),('cast_release',48)]:
  rig.animation_data_create();rig.animation_data.action=bpy.data.actions.new(name);act=rig.animation_data.action
  for f in range(1,duration+1):
   t=(f-1)/(duration-1);phase=t*2*math.pi
   for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
   if name=='idle_breath':
    rig.pose.bones['chest'].rotation_euler.x=.012*math.sin(phase);rig.pose.bones['spine'].rotation_euler.y=.009*math.sin(phase);rig.pose.bones['head'].rotation_euler.z=.025*math.sin(phase)
   elif name=='walk_in_place':
    for side,offset in [('L',0),('R',math.pi)]:
     q=phase+offset;forward=-.145*math.sin(q);lift=.075*max(0,math.sin(q));down=.774-lift;distance=min(.798,math.sqrt(down*down+forward*forward));knee=2*math.acos(distance/.8);hip=math.atan2(forward,down)-knee*.5;rig.pose.bones['thigh.'+side].rotation_euler.x=hip;rig.pose.bones['shin.'+side].rotation_euler.x=knee;rig.pose.bones['foot.'+side].rotation_euler.x=-hip-knee
     rig.pose.bones['upper_arm.'+side].rotation_euler.x=-.25*math.sin(q);rig.pose.bones['forearm.'+side].rotation_euler.x=-.13+.07*math.sin(q)
    rig.pose.bones['pelvis'].location.y=-.026+.002*math.cos(phase*2);rig.pose.bones['chest'].rotation_euler.y=.055*math.sin(phase)
   else:
    lift=math.sin(math.pi*t)**1.3;release=max(0,math.sin(math.pi*(t-.28)/.72)) if t>.28 else 0
    rig.pose.bones['spine'].rotation_euler.y=-.15*lift;rig.pose.bones['chest'].rotation_euler.x=-.10*lift
    rig.pose.bones['upper_arm.R'].rotation_euler.x=-1.10*lift;rig.pose.bones['upper_arm.R'].rotation_euler.z=.10*lift;rig.pose.bones['forearm.R'].rotation_euler.x=-.9*lift+.64*release;rig.pose.bones['hand.R'].rotation_euler.x=-.24*release
    rig.pose.bones['upper_arm.L'].rotation_euler.x=-.65*lift;rig.pose.bones['forearm.L'].rotation_euler.x=-1.0*lift;rig.pose.bones['head'].rotation_euler.x=.07*lift
    for j in range(1,5):
     rig.pose.bones['finger%d.R'%j].rotation_euler.x=.24*lift-.25*release;rig.pose.bones['finger%d_tip.R'%j].rotation_euler.x=.3*lift-.27*release
   for p in rig.pose.bones:p.keyframe_insert('rotation_euler',frame=f);p.keyframe_insert('location',frame=f)
  for fc in act.fcurves:
   for kp in fc.keyframe_points:kp.interpolation='LINEAR'
  track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,1,act);track.mute=True;clips.append((name,duration,act))
 rig.animation_data.action=None
 for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
 bpy.context.scene.frame_set(1)
 return clips

def sockets(r):
 ret=[]
 for name,bone,point in [('grip_primary','hand.R',(-.382,-.014,.948)),('cast_origin','hand.R',(-.387,-.079,.949)),('hit_reference','chest',(0,-.12,1.33)),('stow','chest',(0,.15,1.37))]:
  e=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(e);e.empty_display_type='ARROWS';e.empty_display_size=.055;e.location=point;e['socket_semantics']=name;e['calibration']='PROPOSED_CANDIDATE_NEEDS_WEAPON_AND_GAMEPLAY_FIT';world=Matrix.Translation(Vector(point));e.parent=r;e.parent_type='BONE';e.parent_bone=bone;bpy.context.view_layer.update();e.matrix_world=world;ret.append(e)
 return ret

def tris(ob):ob.data.calc_loop_triangles();return len(ob.data.loop_triangles)
def export(path,obs):
 bpy.ops.object.select_all(action='DESELECT')
 for ob in obs:ob.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_apply=False,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_skins=True,export_all_influences=False,export_tangents=any(o.type=='MESH' and len(o.data.materials)>0 for o in obs))

def render(path,rig,clip=None,frame=1,view='hero'):
 scene=bpy.context.scene;rig.animation_data.action=clip;scene.frame_set(frame)
 bpy.ops.object.camera_add(location={'hero':(2.7,-5,1.75),'front':(0,-5,.916),'back':(0,5,1.15),'side':(5,0,.916),'portrait':(0,-2,1.680),'face_profile':(2,0,1.680)}[view]);cam=bpy.context.object;target=Vector((0,0,1.68) if view in ['portrait','face_profile'] else (0,0,.916));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=.34 if view in ['portrait','face_profile'] else 1.88;scene.camera=cam
 scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);bpy.data.objects.remove(cam,do_unlink=True)

def main():
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 textures=atlas();create_geometry_v2();widen_lower_rest_stance();r=rig()
 bpy.ops.object.select_all(action='DESELECT')
 for o in PARTS:
  o.select_set(True)
  attribute=o.data.attributes.new('review_mask',type='BOOLEAN',domain='POINT')
  maskpart=any(word in o.name for word in ['half mask','Mask terracotta','Mask leather','Mask strap'])
  for value in attribute.data:value.value=maskpart
 bpy.context.view_layer.objects.active=PARTS[0];bpy.ops.object.join();body=bpy.context.object;body.name='Kiln_ninja_weighted_lowpoly'
 tri_mod=body.modifiers.new('Deterministic portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri_mod.name);body.data.validate(clean_customdata=True)
 mod=body.modifiers.new('Humanoid weighted deformation','ARMATURE');mod.object=r
 # Preserve deliberately smooth anatomical/cloth surfaces and flat ceramic hardware.
 clips=animation(r);sock=sockets(r);obs=[r,body]+sock
 # Bone and vertex evidence; multiple nonzero influences exist at actual elbows/knees/spine.
 weights=[[(body.vertex_groups[g.group].name,g.weight) for g in v.groups if g.weight>1e-5] for v in body.data.vertices]
 evidence={'vertices':len(weights),'multiInfluenceVertices':sum(len(w)>1 for w in weights),'unweightedVertices':sum(not w for w in weights),'maximumWeightSumError':max(abs(sum(x[1] for x in w)-1) for w in weights),'boneCount':len(r.data.bones),'boneNames':list(BONES),'socketNames':[o.name for o in sock]}
 pose_checks=[]
 base=np.array([tuple(v.co) for v in body.data.vertices])
 for name,dur,act in clips:
  for frame in sorted(set([1,1+dur//4,dur//2,1+3*dur//4,dur])):
   r.animation_data.action=act;bpy.context.scene.frame_set(frame)
   ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();moved=np.array([tuple(v.co) for v in me.vertices]);ev.to_mesh_clear()
   delta=np.linalg.norm(moved-base,axis=1)
   feet={side:float(moved[[i for i,w in enumerate(weights) if any(b=='foot.'+side and v>.5 for b,v in w)],2].min()) for side in ['L','R']}
   pose_checks.append({'clip':name,'frame':frame,'finiteVertices':bool(np.isfinite(moved).all()),'movedVertexCount':int((delta>1e-5).sum()),'maximumDisplacementMeters':float(delta.max()),'footMinimumZmeters':feet})
 r.animation_data.action=None
 for p in r.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
 bpy.context.scene.frame_set(1);bpy.context.view_layer.update();evidence['evaluatedPoseChecks']=pose_checks
 if evidence['unweightedVertices'] or evidence['maximumWeightSumError']>1e-5 or not all(p['finiteVertices'] for p in pose_checks) or not all(any(p['clip']==name and p['movedVertexCount']>0 for p in pose_checks) for name,_,_ in clips):raise RuntimeError('Weighted pose integrity failed')
 triangle={'glb':tris(body)};dims=[round(float(n),6) for n in body.dimensions]
 export(D/(ID+'.glb'),obs)
 for level,ratio in [(1,.61),(2,.34)]:
  low=body.copy();low.data=body.data.copy();bpy.context.collection.objects.link(low);low.name='Kiln_ninja_LOD'+str(level)
  for m in list(low.modifiers):low.modifiers.remove(m)
  bpy.context.view_layer.objects.active=low;low.select_set(True);m=low.modifiers.new('Silhouette reduction','DECIMATE');m.ratio=ratio;m.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=m.name);low.data.validate(clean_customdata=True)
  m=low.modifiers.new('Humanoid weighted deformation','ARMATURE');m.object=r
  triangle['lod'+str(level)]=tris(low);export(D/(ID+'-lod%d.glb'%level),[r,low]+sock);bpy.data.objects.remove(low,do_unlink=True)
 # Authored coarse body navigation hull; no fabricated skeletal hitbox certification.
 collision=rings('UCX_KilnNinja_navigation',[(0,0,.035,.10,.09),(0,0,.18,.29,.13),(0,0,1.5,.23,.14),(0,0,1.81,.075,.075)],'cloth',{},10);collision.data.materials.clear();collision['collision_role']='Candidate coarse navigation capsule-like hull; not animated combat hitboxes';triangle['collision']=tris(collision);export(D/(ID+'-collision.glb'),[collision]);bpy.data.objects.remove(collision,do_unlink=True)
 # Packed editable source saved in rest pose, with material maps, all clips, weights and sockets.
 for im in bpy.data.images:
  if im.source=='FILE':im.pack()
 r.animation_data.action=None
 for p in r.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
 bpy.context.scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(D/(ID+'.blend')),compress=False)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=750;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.color=(.14,.14,.14);scene.view_settings.view_transform='AgX';scene.render.film_transparent=False;scene.render.fps=24
 bpy.ops.mesh.primitive_plane_add(size=10,location=(0,0,.012));floor=bpy.context.object;floor.name='Render stage only';fm=bpy.data.materials.new('Review floor');fm.diffuse_color=(.10,.11,.12,1);floor.data.materials.append(fm)
 for loc,power,size in [((2,-3,4),380,3),((-2,-1,2.5),240,2),((0,2,3),420,2)]:
  bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.size=size;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
 renders=[]
 for view in ['front','back','side','hero']:
  path=D/(ID+'-'+view+'.png');render(path,r,view=view);renders.append(artifact_path(path))
 for name,dur,act in ([] if PREVIEW and not FULL_REVIEW else clips):
  for f in ([1,9,17,25] if name=='walk_in_place' else [1,13,25,37]):
   path=D/(ID+'-'+name+'-%02d.png'%f);render(path,r,act,f);renders.append(artifact_path(path))
 # Contact sheet combines rest views and real rendered poses; no claimed visual pass.
 rows=1 if PREVIEW and not FULL_REVIEW else 4
 sheet=np.ones((rows*360,1200,4),dtype=np.float32)
 for i,path in enumerate(renders):
  im=bpy.data.images.load(str(ROOT/path),check_existing=False);im.scale(300,360);pixels=np.array(im.pixels[:],dtype=np.float32).reshape(360,300,4);row=rows-1-i//4;col=i%4;sheet[row*360:(row+1)*360,col*300:(col+1)*300]=pixels
 im=bpy.data.images.new('Character pose contact sheet',width=1200,height=rows*360,alpha=True);im.pixels.foreach_set(sheet.ravel());im.filepath_raw=str(D/'pose-contact-sheet.png');im.file_format='PNG';im.save();renders.append(artifact_path(D/'pose-contact-sheet.png'))
 portrait=D/(ID+'-portrait.png');render(portrait,r,view='portrait');renders.append(artifact_path(portrait))
 # Unmasked diagnostic copy only; saved source and exported character remain masked.
 diagnostic=body.copy();diagnostic.data=body.data.copy();bpy.context.collection.objects.link(diagnostic);diagnostic.name='Unmasked diagnostic temporary'
 bm=bmesh.new();bm.from_mesh(diagnostic.data);bm.verts.ensure_lookup_table();attr=diagnostic.data.attributes.get('review_mask');remove=[v for v in bm.verts if attr.data[v.index].value];bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(diagnostic.data);bm.free();body.hide_render=True
 for view in ['portrait','face_profile']:
  path=D/(ID+'-unmasked-'+view+'.png');render(path,r,view=view);renders.append(artifact_path(path))
 body.hide_render=False;bpy.data.objects.remove(diagnostic,do_unlink=True)
 rel=lambda suffix:artifact_path(D/(ID+suffix))
 asset={'id':ID,'archetypeId':'kiln-ninja','name':'Kiln oath ninja — rigged ensemble candidate','type':'character','status':'PRODUCTION_CANDIDATE_UNREVIEWED','files':{'blend':rel('.blend'),'glb':rel('.glb'),'lod1':rel('-lod1.glb'),'lod2':rel('-lod2.glb'),'collision':rel('-collision.glb'),'textures':textures,'renders':renders},'triangles':triangle,'dimensionsMeters':dims,'dimensionsCoordinateSystem':'BLENDER_Z_UP','rig':{'applicability':'HUMANOID_WEIGHTED_DEFORMATION','present':True,'bones':len(r.data.bones),'evidence':evidence,'facialRig':False},'animations':[{'name':name,'frames':dur,'fps':24,'rootMotion':'IN_PLACE','status':'AUTHORED_POSE_RENDER_REVIEW_REQUIRED'} for name,dur,a in clips],'remainingGates':['Exact art approval and face likeness refinement against references090/060','Facial expressions and speech rig absent; full ensemble/customization not delivered','Cape follows chest and upper-arm weights; cloth simulation and intersection refinement remain','Hand grasp fit and socket calibration against actual equipped weapons','Animation foot-contact/grounding and interruption gameplay tests','Authored-character retargeting of source castable timing; no source animation replaced','Godot Unreal and Three.js real import/render/runtime tests','Collision navigation/hitbox and LOD transition gameplay validation','Measured device performance and accessibility review']}
 (OUT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'familyId':'asset-o01-a-characters-family','referenceIds':['reference-090','reference-060'],'status':'PARTIAL_PRODUCTION_CANDIDATES_UNREVIEWED','assets':[asset]},indent=2)+'\n')
 (D/'rig-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
 print('KILN_NINJA_COMPLETE',triangle,evidence)
def verify_outputs():
 """Fresh Blender source-open and actual portable imports; no engine parity claim."""
 report={'scope':'Blender 4.3.2 CPU source open and actual GLB import / evaluated animation checks; not Unreal/Godot/Three.js validation','files':[]}
 for suffix in ['.blend','.glb','-lod1.glb','-lod2.glb','-collision.glb']:
  path=D/(ID+suffix)
  bpy.ops.wm.read_factory_settings(use_empty=True)
  if suffix=='.blend':bpy.ops.wm.open_mainfile(filepath=str(path))
  else:bpy.ops.import_scene.gltf(filepath=str(path))
  rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'];meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
  row={'path':artifact_path(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'meshObjects':len(meshes),'armatures':len(rigs),'boneCounts':[len(r.data.bones) for r in rigs],'actionNames':[a.name for a in bpy.data.actions],'images':len([i for i in bpy.data.images if i.type=='IMAGE']),'finitePoses':[]}
  assert meshes
  if suffix!='-collision.glb':
   assert len(rigs)==1 and len(rigs[0].data.bones)==38
   assert row['images']>=3
   for name in ['idle_breath','walk_in_place','cast_release']:
    actions=[a for a in bpy.data.actions if name in a.name];assert actions
    r=rigs[0];r.animation_data_create();r.animation_data.action=actions[0];bpy.context.scene.frame_set(12)
    dg=bpy.context.evaluated_depsgraph_get();finite=True;count=0
    for ob in meshes:
     ev=ob.evaluated_get(dg);me=ev.to_mesh();finite=finite and all(math.isfinite(c) for v in me.vertices for c in v.co);count+=len(me.vertices);ev.to_mesh_clear()
    assert finite;row['finitePoses'].append({'clip':name,'frame':12,'vertices':count,'finite':finite})
   r.animation_data.action=None
   for b in r.pose.bones:b.rotation_euler=(0,0,0);b.rotation_quaternion=(1,0,0,0);b.location=(0,0,0)
   bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
   row['socketWorldPositions']={name:list(bpy.context.scene.objects[name].matrix_world.translation) for name in ['grip_primary','cast_origin','hit_reference','stow']}
   assert all(Vector(x).length>.5 for x in row['socketWorldPositions'].values())
  else:assert not rigs
  report['files'].append(row)
 (D/'blender-import-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
 print('KILN_NINJA_IMPORT_VERIFIED',len(report['files']))

if __name__=='__main__':
 if '--verify' in sys.argv:verify_outputs()
 else:main()
