"""Author one Kiln ninja candidate from inspected references 090 and 060.
Blender 4.3.2: blender -b --python tools/production/authoring/kiln_ninja.py
Meters, Blender Z up, front -Y. Source identity and all artwork remain untouched.
Deliberately no imported/generative character stock; cross-section topology is authored here.
"""
import bpy, bmesh, math, json, random, sys, hashlib, os
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path('/workspace/Aetherion-The-Fifteen-Oaths')
DIAGNOSTIC='--face-diagnostic' in sys.argv
FULL_REVIEW='--full-review' in sys.argv
PREVIEW='--preview' in sys.argv or FULL_REVIEW or DIAGNOSTIC
OUT=Path(os.environ.get('AETHERION_REVIEW_OUT',str(Path(__file__).resolve().parent))) if PREVIEW else ROOT/'assets/production/oath-01/characters';OUT.mkdir(parents=True,exist_ok=True)
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
  orm[r:r+s,c:c+s,0]=1;orm[r:r+s,c:c+s,1]=([.94,.80,.62,.73,.85,.56,.37,.31][i]+(noise-.5)*.1);orm[r:r+s,c:c+s,2]=.83 if i==2 else 0
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
 if mat=='hair':
  hm=bpy.data.materials.get('Soot black hair PBR')
  if not hm:
   hm=MAT.copy();hm.name='Soot black hair PBR';hm.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=.20
  ob.data.materials[0]=hm
 for i,v in enumerate(verts):
  w=weights(v) if callable(weights) else weights
  for bone,value in w.items():
   if value>1e-6:
    g=ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone);g.add([i],value,'REPLACE')
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.uv.smart_project(angle_limit=1.0,island_margin=.018);bpy.ops.object.mode_set(mode='OBJECT')
 cell=CELLS[mat]
 for uv in me.uv_layers.active.data:uv.uv=((cell%4+(.03+uv.uv.x*.94))/4,(cell//4+(.03+uv.uv.y*.94))/2)
 for face in me.polygons:face.use_smooth=mat in {'skin','cloth','leather','hair','eye','iris'}
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
 # Continuous cheek/nose/lip/jaw surface with connected multi-loop orbital apertures.
 profile=[(1.566,.025,.030,.006),(1.579,.033,.037,.004),(1.594,.040,.042,.004),(1.610,.048,.047,.005),(1.630,.056,.053,.006),(1.650,.071,.058,.008),(1.673,.074,.061,.010),(1.694,.073,.063,.011),(1.722,.071,.064,.012),(1.747,.066,.060,.013),(1.768,.052,.049,.014),(1.788,.014,.017,.015)]
 def head_section(z):
  # Cubic Hermite sections avoid the broad horizontal slope breaks of linear rings.
  i=max(0,min(len(profile)-2,int(np.searchsorted([p[0] for p in profile],z))-1));a=profile[i];b=profile[i+1];h=b[0]-a[0];t=max(0,min(1,(z-a[0])/h));out=[]
  for k in [1,2,3]:
   prev=profile[max(0,i-1)];nxt=profile[min(len(profile)-1,i+2)]
   m0=(b[k]-prev[k])/(b[0]-prev[0]);m1=(nxt[k]-a[k])/(nxt[0]-a[0])
   out.append((2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*h*m0+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*h*m1)
  return out
 def gaussian(x,z,cx,cz,wx,wz):return math.exp(-((x-cx)/wx)**2-((z-cz)/wz)**2)
 def surface(x,z):
  rx,ry,cy=head_section(z);y=cy-ry*math.sqrt(max(0,1-(x/rx)**2))
  for sign in [-1,1]:
   y+=.005*gaussian(x,z,sign*.031,1.684,.020,.012) # orbital recess
   y-=.008*gaussian(x,z,sign*.031,1.701,.025,.009) # supraorbital ridge
   y-=.0045*gaussian(x,z,sign*.043,1.661,.019,.017) # zygomatic plane
   y+=.0035*gaussian(x,z,sign*.042,1.632,.020,.019) # cheek below zygoma
   y-=.007*gaussian(x,z,sign*.010,1.643,.006,.005) # alar lobes
   y+=.002*gaussian(x,z,sign*.009,1.638,.003,.0020) # alar underside indentation
  # Smooth central bridge/tip/columella contour; varying cross-section keeps alae distinct.
  nasal=[(1.630,-.047,.009),(1.636,-.052,.009),(1.640,-.062,.008),(1.645,-.067,.0085),(1.651,-.0695,.009),(1.656,-.0685,.0085),(1.666,-.0625,.0065),(1.678,-.057,.006),(1.692,-.052,.006)]
  if nasal[0][0]<z<nasal[-1][0]:
   i=max(0,min(len(nasal)-2,int(np.searchsorted([v[0] for v in nasal],z))-1));a=nasal[i];b=nasal[i+1];prev=nasal[max(0,i-1)];nxt=nasal[min(len(nasal)-1,i+2)];h=b[0]-a[0];t=(z-a[0])/h
   m0=(b[1]-prev[1])/(b[0]-prev[0]);m1=(nxt[1]-a[1])/(nxt[0]-a[0]);target=(2*t**3-3*t*t+1)*a[1]+(t**3-2*t*t+t)*h*m0+(-2*t**3+3*t*t)*b[1]+(t**3-t*t)*h*m1
   width=a[2]*(1-t)+b[2]*t;y-=max(0,y-target)*math.exp(-(x/width)**2)
  y-=.0015*gaussian(x,z,0,1.624,.025,.012) # orbicular muzzle plane
  y+=.002*gaussian(x,z,0,1.632,.003,.006) # philtrum groove
  # Continuous upper cupid bow and lower lip volumes, actual contour (no stuck-on line).
  cupid=1.621+.0015*math.exp(-((abs(x)-.005)/.004)**2)-.002*(abs(x)/.024)**2
  mouth=1.617-.0014*(abs(x)/.024)**2
  fade=math.exp(-(x/.023)**6)
  y-=.0020*math.exp(-((z-cupid)/.0024)**2)*fade
  y-=.0018*math.exp(-((z-1.613)/.0034)**2)*fade
  y+=.0024*math.exp(-((z-mouth)/.0010)**2)*fade
  y+=.0018*gaussian(x,z,0,1.604,.020,.0050) # labiomental crease
  y-=.0025*gaussian(x,z,0,1.593,.025,.013) # mental eminence
  return y
 # Seated ellipsoidal globe; lid opening follows this surface and wraps its canthi.
 eye_rx=.0145;eye_ry=.012;eye_rz=.012;eye_cy=-.0335;eye_cz=1.681
 def globe_front(sign,x,z):
  q=((x-sign*.031)/eye_rx)**2+((z-eye_cz)/eye_rz)**2
  return eye_cy-eye_ry*math.sqrt(max(.001,1-q))
 def lid_edge_y(sign,x,z):
  # Canthal tissue wraps forward around the globe, occluding lateral sclera in profile.
  offset=abs(x-sign*.031)/.0138
  return globe_front(sign,x,z)-.00045-.0055*(min(1,offset)**4)
 zs=sorted(set([round(float(v),6) for v in np.linspace(1.566,1.788,71)]+[round(float(v),6) for v in np.arange(1.634,1.661,.001)]+[1.614,1.617,1.6195,1.621,1.623,1.625,1.628,1.641,1.644,1.648,1.651,1.655,1.669,1.681,1.694]))
 us=np.linspace(-1,1,49);verts=[];front=[];back=[]
 for z in zs:
  rx,ry,cy=head_section(z);row=[]
  for u in us:
   x=float(u)*rx;row.append(len(verts));verts.append((x,surface(x,z),z))
  front.append(row);row=[]
  for i in range(1,24):
   a=math.pi*i/24;row.append(len(verts));verts.append((rx*math.cos(a),cy+ry*math.sin(a),z))
  back.append(row)
 r0=zs.index(1.669);r1=zs.index(1.694);holes=[(-1,6,20),(1,28,42)];faces=[]
 for r in range(len(zs)-1):
  for j in range(48):
   if r0<=r<r1 and any(j0<=j<j1 for _,j0,j1 in holes):continue
   faces.append((front[r][j],front[r][j+1],front[r+1][j+1],front[r+1][j]))
  ar=[front[r][-1]]+back[r]+[front[r][0]];br=[front[r+1][-1]]+back[r+1]+[front[r+1][0]]
  for j in range(len(ar)-1):faces.append((ar[j],ar[j+1],br[j+1],br[j]))
 for row in [0,len(zs)-1]:faces.append(tuple(front[row]+back[row]))
 apertures={}
 for sign,j0,j1 in holes:
  cx=sign*.031;cz=1.681
  boundary=front[r0][j0:j1+1]+[front[r][j1] for r in range(r0+1,r1+1)]+list(reversed(front[r1][j0:j1]))+[front[r][j0] for r in range(r1-1,r0,-1)]
  angles=[math.atan2((verts[i][2]-cz)/.014,(verts[i][0]-cx)/.023) for i in boundary];previous=boundary
  for layer,(width,upper,lower,offset) in enumerate([(.019,.010,.008,-.0010),(.016,.007,.0055,-.0020),(.0144,.0053,.0044,-.0010),(.0138,.0045,.0038,-.0010)]):
   current=[]
   for a in angles:
    x=cx+width*math.cos(a);z=cz+(upper if math.sin(a)>0 else lower)*math.sin(a)+sign*(x-cx)*.13
    # Lid loops flow continuously from forehead and cheek into the opening.
    y=surface(x,z)-.0005 if layer==0 else lid_edge_y(sign,x,z)-(.0007 if layer==1 else 0)
    current.append(len(verts));verts.append((x,y,z))
   for i in range(len(current)):
    j=(i+1)%len(current);faces.append((previous[i],previous[j],current[j],current[i]))
   previous=current
  apertures[sign]=(angles,[verts[i] for i in previous],previous)
 # Continuous canthal tissue closes the pointed end pockets of each orbital hole.
 for sign,(_,_,edge_ids) in apertures.items():
  cx=sign*.031;cz=eye_cz
  for corner in [-1,1]:
   mask=[corner*(verts[i][0]-cx)>.0115 for i in edge_ids]
   starts=[k for k,value in enumerate(mask) if value and not mask[k-1]]
   if not starts:continue
   chosen=[];k=starts[0]
   while mask[k]:
    chosen.append(edge_ids[k]);k=(k+1)%len(edge_ids)
    if k==starts[0]:break
   x=cx+corner*.0117;z=cz+sign*(x-cx)*.13;center=len(verts)
   verts.append((x,globe_front(sign,x,z)-.0004,z))
   for a,b in zip(chosen,chosen[1:]):faces.append((a,b,center))
 # Jaw underside rises toward the posterior angle rather than ending as a flat stump.
 shaped=[]
 for x,y,z in verts:
  if z<1.610:
   lower=max(0,min(1,(1.610-z)/.044));posterior=max(0,min(1,(y+.025)/.075))
   z+=.013*(lower*lower*(3-2*lower))*posterior
  shaped.append((x,y,z))
 verts=shaped
 head=mesh('Continuous anatomical facial plane and orbital topology V7',verts,faces,'skin',{'head':1})
 # Recess real nostril floor polygons into the connected nose; retain closed geometry.
 bm=bmesh.new();bm.from_mesh(head.data);bm.faces.ensure_lookup_table()
 selected=[]
 for f in bm.faces:
  c=f.calc_center_median()
  if c.y<-.048 and ((abs(c.x)-.009)/.0030)**2+((c.z-1.638)/.0018)**2<1:selected.append(f)
 if selected:
  result=bmesh.ops.extrude_face_region(bm,geom=selected)
  newverts=[g for g in result['geom'] if isinstance(g,bmesh.types.BMVert)]
  bmesh.ops.translate(bm,verts=newverts,vec=Vector((0,.0035,.0005)))
  bmesh.ops.delete(bm,geom=selected,context='FACES_ONLY')
  bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 bm.to_mesh(head.data);bm.free();head.data.update()
 bpy.context.view_layer.objects.active=head;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.0,island_margin=.018);bpy.ops.object.mode_set(mode='OBJECT')
 for uv in head.data.uv_layers.active.data:uv.uv=((3+(.03+uv.uv.x*.94))/4,(.03+uv.uv.y*.94)/2)
 head['nostril_recess_source_faces']=len(selected)
 head['topology_note']='Nose, alae, philtrum, lips and chin are displacement-shaped vertices of the same connected facial surface; orbital loops share head boundary vertices.'
 nose=min((v for v in verts if abs(v[0])<.004 and 1.635<v[2]<1.669),key=lambda v:v[1])
 (OUT/'model-face-landmarks.json').write_text(json.dumps({'coordinateSystem':'Blender meters, Z up, front -Y','source':'Actual authored vertex positions plus constructed eye/lip centers','eyeCenters':[[-.031,eye_cy,eye_cz],[.031,eye_cy,eye_cz]],'eyeGlobeRadiiMeters':[eye_rx,eye_ry,eye_rz],'nostrilRecessFaceCount':head['nostril_recess_source_faces'],'nasalTipVertex':nose,'lipCleftCenter':[0,surface(0,1.617),1.617],'lowestHeadVertexZ':min(v[2] for v in verts),'orbitalOpeningWidthMeters':.0276,'upperLidHeightMeters':.0045,'lowerLidHeightMeters':.0038,'note':'Lowest head vertices partly occluded by production collar in portraits; do not compare this point with painted visible chin as an exact correspondence.'},indent=2)+'\n')
 # Smooth anatomical lip tint uses vertex color on the same continuous head mesh.
 tint=head.data.color_attributes.new(name='FacialTint',type='FLOAT_COLOR',domain='CORNER')
 for loop in head.data.loops:
  v=head.data.vertices[loop.vertex_index].co
  strength=.0
  if v.y<0:
   strength=.42*math.exp(-(v.x/.024)**6)*math.exp(-((v.z-1.617)/.0046)**4)
  tint.data[loop.index].color=(1-strength*.28,1-strength*.70,1-strength*.64,1)
 fm=MAT.copy();fm.name='Textured skin with continuous anatomical vertex tint';head.data.materials[0]=fm
 nodes=fm.node_tree.nodes;links=fm.node_tree.links;bs=nodes.get('Principled BSDF');base_link=bs.inputs['Base Color'].links[0];base_output=base_link.from_socket;links.remove(base_link)
 color=nodes.new('ShaderNodeVertexColor');color.layer_name='FacialTint';multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;links.new(base_output,multiply.inputs[1]);links.new(color.outputs['Color'],multiply.inputs[2]);links.new(multiply.outputs['Color'],bs.inputs['Base Color'])
 for side,sign in [('L',1),('R',-1)]:
  cx=sign*.031;cz=eye_cz
  # Actual closed globe, largely hidden behind continuous head/socket geometry.
  longitude=28;latitude=14;ev=[(cx,eye_cy,cz+eye_rz)];ef=[]
  for row in range(1,latitude):
   theta=math.pi*row/latitude
   for j in range(longitude):
    a=2*math.pi*j/longitude;ev.append((cx+eye_rx*math.sin(theta)*math.cos(a),eye_cy+eye_ry*math.sin(theta)*math.sin(a),cz+eye_rz*math.cos(theta)))
  bottom=len(ev);ev.append((cx,eye_cy,cz-eye_rz))
  for j in range(longitude):ef.append((0,1+j,1+(j+1)%longitude))
  for row in range(latitude-2):
   for j in range(longitude):a=1+row*longitude+j;b=1+row*longitude+(j+1)%longitude;ef.append((a,b,b+longitude,a+longitude))
  for j in range(longitude):ef.append((1+(latitude-2)*longitude+j,bottom,1+(latitude-2)*longitude+(j+1)%longitude))
  mesh('Seated closed ocular globe '+side,ev,ef,'eye',{'head':1})
  # Concentric iris/pupil rings follow the globe rather than a floating flat fan.
  for radius,depth,mat,label in [(.0060,.00010,'iris','Curved iris'),(.0025,.00017,'hair','Curved pupil')]:
   iv=[(cx,globe_front(sign,cx,cz)-depth,cz)];faces=[];n=28;rings_count=3
   for row in range(1,rings_count+1):
    rad=radius*row/rings_count
    for j in range(n):
     a=2*math.pi*j/n;x=cx+rad*math.cos(a);z=cz+rad*math.sin(a);iv.append((x,globe_front(sign,x,z)-depth,z))
   for j in range(n):faces.append((0,1+j,1+(j+1)%n))
   for row in range(rings_count-1):
    for j in range(n):a=1+row*n+j;b=1+row*n+(j+1)%n;faces.append((a,b,b+n,a+n))
   mesh(label+' seated on globe '+side,iv,faces,mat,{'head':1})
  # The upper palpebral margin shares the new aperture coordinates.
  lid=[]
  for a in np.linspace(.08,math.pi-.08,15):
   x=cx+.0138*math.cos(a);z=cz+.0045*math.sin(a)+sign*(x-cx)*.13
   lid.append((x,lid_edge_y(sign,x,z)-.0002,z+.0001))
  seam('Upper eyelid dark lash margin '+side,lid,.00030,'hair',{'head':1},5)
  # Tapered brows lie directly on the sculpted brow plane, with uneven individual tuft ends.
  bv=[];bf=[]
  for i in range(13):
   t=i/12;x=sign*(.012+t*.043);z=1.695+.004*math.sin(t*math.pi*.9);w=.0025*math.sin(math.pi*(.15+.8*t))
   for dz in [-w,w]:bv.append((x,surface(x,z+dz)-.0009,z+dz))
  for i in range(12):bf.append((2*i,2*i+1,2*i+3,2*i+2))
  mesh('Surface seated tapered brow '+side,bv,bf,'hair',{'head':1})
  contour=[(.001,1.639),(-.010,1.645),(-.013,1.665),(-.010,1.684),(.004,1.692),(.017,1.683),(.020,1.658),(.013,1.643)];vs=[]
  for scale,x in [(1,sign*.075),(.57,sign*.080),(.36,sign*.073)]:
   for y,z in contour:vs.append((x,.004+(y-.004)*scale,1.666+(z-1.666)*scale))
  fs=[]
  for row in range(2):
   for i in range(8):j=(i+1)%8;fs.append((row*8+i,row*8+j,(row+1)*8+j,(row+1)*8+i))
  fs.append(tuple(range(16,24)));mesh('Ear helix concha '+side,vs,fs,'skin',{'head':1})
  seam('Helix ridge '+side,[(sign*.077,y,z) for y,z in contour]+[(sign*.077,*contour[0])],.0017,'skin',{'head':1},6)


def hair_lock(name,points,width,twist=0):
 # Closed, tapered oval clump volume, not an open ribbon with a thick edge.
 original=[Vector(p) for p in points];dense=[]
 for i in range(len(original)-1):
  a=original[max(0,i-1)];b=original[i];c=original[i+1];d=original[min(len(original)-1,i+2)]
  for step in range(3):
   t=step/3;dense.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
 dense.append(original[-1]);n=6;verts=[];previous=None
 for k,p in enumerate(dense[:-1]):
  t=k/(len(dense)-1);direction=(dense[min(k+1,len(dense)-1)]-dense[max(0,k-1)]).normalized()
  radial=Vector((p.x/.085,(p.y-.006)/.079,(p.z-1.735)/.072)).normalized();across=direction.cross(radial).normalized()
  if across.length<.1:across=Vector((1,0,0))
  if previous is not None and across.dot(previous)<0:across=-across
  previous=across.copy();normal=across.cross(direction).normalized()
  if normal.dot(radial)<0:normal=-normal
  a=twist*math.sin(t*math.pi);u=across*math.cos(a)+normal*math.sin(a);v=-across*math.sin(a)+normal*math.cos(a)
  w=width*(.58+.42*math.sin(math.pi*t))*(1-t**3.8);depth=width*.46*(.7+.3*math.sin(math.pi*t))*(1-t**3)
  for j in range(n):
   angle=2*math.pi*j/n;verts.append(tuple(p+u*(math.cos(angle)*w)+v*(math.sin(angle)*depth)))
 tip=len(verts);verts.append(tuple(dense[-1]));faces=[tuple(reversed(range(n)))];rows=len(dense)-1
 for k in range(rows-1):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;faces.append((a,b,b+n,a+n))
 for j in range(n):faces.append(((rows-1)*n+j,(rows-1)*n+(j+1)%n,tip))
 ob=mesh(name,verts,faces,'hair',{'head':1})
 # Texture grain follows the clump longitudinally, with wrapped cross-section UVs.
 for polygon in ob.data.polygons:
  if all(vi<n for vi in polygon.vertices):continue # retain nondegenerate planar root-cap UVs
  js=[vi%n for vi in polygon.vertices if vi!=tip];wrap=0 in js and n-1 in js
  for li in polygon.loop_indices:
   vi=ob.data.loops[li].vertex_index;k,j=divmod(vi,n)
   if vi==tip:u=sum((n if wrap and jj==0 else jj) for jj in js)/len(js)/n;v=1.0
   else:u=(n if wrap and j==0 else j)/n;v=k/rows
   ob.data.uv_layers.active.data[li].uv=((1+.035+.93*u)/4,(1+.035+.93*v)/2)
 return ob

def designed_hair():
 start_parts=len(PARTS);rng=random.Random(890)
 def point(theta,phi,lift=0):
  return ((.085+lift)*math.sin(theta)*math.cos(phi),.006+(.079+lift)*math.sin(theta)*math.sin(phi),1.735+(.072+lift)*math.cos(theta))
 # The underhair shell follows the same skull envelope as its rooted clump volumes.
 # Its irregular front boundary stays above the independently tapered fringe ends.
 n=48;rows=12;vs=[(0,.006,1.804)];faces=[]
 for row in range(1,rows+1):
  for i in range(n):
   phi=2*math.pi*i/n;front=max(0,-math.sin(phi));limit=2.00-.72*front+.055*math.sin(phi*7)
   vs.append(point(limit*row/rows,phi,-.0030))
 for i in range(n):faces.append((0,1+i,1+(i+1)%n))
 for row in range(rows-1):
  for i in range(n):a=1+row*n+i;b=1+row*n+(i+1)%n;faces.append((a,b,b+n,a+n))
 faces.append(tuple(reversed([1+(rows-1)*n+i for i in range(n)])))
 mesh('Rooted fitted underhair volume V8',vs,faces,'hair',{'head':1})
 guides=[]
 # Short overlapping crown masses cover the shell above the long left/right sweeps.
 for i in range(12):
  phi=(i/12)*2*math.pi+rng.uniform(-.20,.20);theta=rng.uniform(.08,.38);bend=rng.uniform(.16,.65);end=rng.uniform(.82,1.32);lift=rng.uniform(-.002,.0008)
  coords=[(theta,phi-bend,-.001),(.37+theta*.40,phi-bend*.6,lift),(.60+theta*.30,phi-bend*.2,lift+.001),(end-.15,phi+.03,lift),(end,phi+rng.uniform(.02,.22),.002)]
  guides.append((coords,rng.uniform(.0048,.0083),rng.uniform(-.55,.55)))
 # Layered left sweep around the off-center part, with interleaved levels/ends.
 for i in range(12):
  t=i/11;phi_end=-1.65-t*1.45;theta_end=1.88+.21*math.sin(i*1.7)
  coords=[(.36+.22*t,-.76+.32*t,-.001),(.72+.10*t,-1.48-.56*t,.004),(1.12+.05*math.sin(i),-1.91-.78*t,.005),(1.48+.05*math.sin(i*2),phi_end+.10,.001),(theta_end,phi_end,.001)]
  guides.append((coords,.006+.003*rng.random(),rng.uniform(-.45,.45)))
 # Opposite side curls lift from the same offset part and sweep toward the temple.
 for i in range(9):
  t=i/8;phi_end=-1.22+t*1.68;theta_end=1.64+.35*t+.07*math.sin(i*1.6)
  coords=[(.43+.16*t,-.60+.30*t,-.001),(.67+.13*t,-.25+.35*t,.001),(1.03+.10*t,phi_end+.28,.003),(1.35+.13*t,phi_end+.13,.001),(theta_end,phi_end,.001)]
  guides.append((coords,.0045+.0028*rng.random(),rng.uniform(-.5,.5)))
 # Rear quarter clumps hide the rear shell with different layered start lengths.
 for i in range(15):
  t=i/14;phi=.3+t*2.5;theta=1.89+.26*math.sin(i*.9)
  coords=[(.45+.25*(i%3)/2,phi-.55,-.001),(.90,phi-.28,.001),(1.36,phi-.13,.002),(1.64,phi,.001),(theta,phi+.08,.003)]
  guides.append((coords,.0048+.0025*rng.random(),rng.uniform(-.4,.4)))
 for i,(coords,width,twist) in enumerate(guides):
  pts=[point(a,b,lift) for a,b,lift in coords];hair_lock('Layered rooted volume clump %02d'%i,pts,width,twist)
  # Narrow secondary tip emerges along one edge of selected volumes; varied shorter start.
  if i%2==0:
   shifted=[point(a+.025,b+(.045 if i%4 else -.045),lift+.001) for a,b,lift in coords[1:]]
   a,b,lift=coords[-1];shifted[-1]=point(a+.07,b+.09,.005)
   hair_lock('Fine irregular split tip %02d'%i,shifted,width*.24,twist*.6)
 # Longer source fringe crossing part of the left brow; rooted into the upper front mass.
 for i,(phi,tip_theta) in enumerate([(-1.64,1.89),(-1.82,2.10),(-1.96,1.97),(-2.02,2.03),(-2.18,1.86),(-2.15,2.12),(-2.33,1.95)]):
  coords=[(.88,-1.39-i*.065,.001),(1.25,phi-.05,.004),(1.60,phi+.05,.004),(tip_theta,phi+.14,.003)]
  hair_lock('Irregular curved left forehead lock %02d'%i,[point(*v) for v in coords],.0045+.0008*(i%3),.22)
 # Posterior hair layers continue behind the ear toward the nape, as in source090.
 for i in range(11):
  a=.15+i*(math.pi-.3)/10;endz=1.635+.008*math.sin(i*1.9)
  pts=[(.063*math.cos(a),.012+.060*math.sin(a),1.726),(.072*math.cos(a),.012+.065*math.sin(a),1.693),(.063*math.cos(a+.025),.010+.059*math.sin(a+.025),1.659),(.052*math.cos(a+.05),.010+.051*math.sin(a+.05),endz)]
  hair_lock('Layered posterior nape volume %02d'%i,pts,.0055+.0015*(i%3)/2,.3*math.sin(i))
 # Asymmetric silhouette flyaways are closed tapered volumes, not disconnected lines.
 for i in range(9):
  phi=-2.8+i*.62;theta=.55+.055*(i%3)
  hair_lock('Short silhouette flyaway %02d'%i,[point(theta,phi,0),point(theta+.19,phi-.1,.004),point(theta+.38,phi-.23,.006),point(theta+.43,phi-.35,.007)],.0018+rng.random()*.0007,.18)
 for sign in [-1,1]:
  for i in range(3):
   x=sign*(.071+i*.002);y=-.027+i*.009
   hair_lock('Temple sideburn volume %s %d'%(sign,i),[(x,y,1.723),(x+sign*.003,y-.002,1.705),(x,y-.006,1.688),(x-sign*.004,y-.007,1.675+i*.006)],.0028-i*.0004,.1)
 # Hair-only material keeps its UV maps while reducing the oversized broad cap highlight.
 hairmat=bpy.data.materials.get('Soot black hair PBR').copy();hairmat.name='V8 mapped soot hair volume material'
 nodes=hairmat.node_tree.nodes;links=hairmat.node_tree.links;bs=nodes.get('Principled BSDF');bs.inputs['Specular IOR Level'].default_value=.12
 # Bake the intended map multiplier into a dedicated hair texture. A multiplier
 # above1 is not a legal glTF roughnessFactor, even though Blender evaluates it.
 ormnode=next(n for n in nodes if n.type=='TEX_IMAGE' and n.image and '-orm' in n.image.name)
 hairorm=ormnode.image.copy();hairorm.name='Hair-only legal PBR ORM map';hairorm.colorspace_settings.name='Non-Color'
 width,height=hairorm.size;pixels=np.array(hairorm.pixels[:],dtype=np.float32).reshape(height,width,4)
 pixels[height//2:height,width//4:width//2,1]=np.clip(pixels[height//2:height,width//4:width//2,1]*1.25,0,1)
 hairorm.pixels.foreach_set(pixels.ravel());hairorm.filepath_raw=str(D/(ID+'-hair-orm.png'));hairorm.file_format='PNG';hairorm.save();ormnode.image=hairorm
 for obj in PARTS[start_parts:]:obj.data.materials[0]=hairmat
 (OUT/'hair-geometry-cost.json').write_text(json.dumps({'scope':'All geometry authored inside designed_hair, excluding separate brows and eyelid rims','meshComponents':len(PARTS)-start_parts,'triangles':sum(tris(o) for o in PARTS[start_parts:]),'closedClumpVolumes':True,'source':'Actual reference090 front/profile crop inspected before authoring; no likeness acceptance'},indent=2)+'\n')

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
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_apply=False,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_skins=True,export_all_influences=False,export_vertex_color='ACTIVE',export_tangents=any(o.type=='MESH' and len(o.data.materials)>0 for o in obs))

def render(path,rig,clip=None,frame=1,view='hero'):
 scene=bpy.context.scene;rig.animation_data.action=clip;scene.frame_set(frame)
 bpy.ops.object.camera_add(location={'hero':(2.7,-5,1.75),'front':(0,-5,.916),'back':(0,5,1.15),'side':(5,0,.916),'portrait':(0,-2,1.680),'face_profile':(2,0,1.680)}[view]);cam=bpy.context.object;target=Vector((0,0,1.68) if view in ['portrait','face_profile'] else (0,0,.916));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=.34 if view in ['portrait','face_profile'] else 1.88;scene.camera=cam
 scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);bpy.data.objects.remove(cam,do_unlink=True)

def main():
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 textures=atlas();create_geometry_v2();widen_lower_rest_stance();r=rig()
 hairparts=[o for o in PARTS if any(t in o.name.lower() for t in ['cranial hair','crown','fringe','clump','sideburn','nape'])]
 (OUT/'hair-cost.json').write_text(json.dumps({'meshComponents':len(hairparts),'triangles':sum(tris(o) for o in hairparts),'componentNames':[o.name for o in hairparts]},indent=2)+'\n')
 bpy.ops.object.select_all(action='DESELECT')
 for o in PARTS:
  o.select_set(True)
  attribute=o.data.attributes.new('review_mask',type='BOOLEAN',domain='POINT')
  maskpart=any(word in o.name for word in ['half mask','Mask terracotta','Mask leather','Mask strap'])
  for value in attribute.data:value.value=maskpart
 bpy.context.view_layer.objects.active=PARTS[0];bpy.ops.object.join();body=bpy.context.object;body.name='Kiln_ninja_weighted_lowpoly'
 if body.data.color_attributes:body.data.color_attributes.active_color_index=0;body.data.color_attributes.render_color_index=0
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
 bpy.context.scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(D/(ID+'.blend')),compress=True)
 if '--export-only' in sys.argv:return
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=750;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.color=(.14,.14,.14);scene.view_settings.view_transform='AgX';scene.render.film_transparent=False;scene.render.fps=24
 bpy.ops.mesh.primitive_plane_add(size=10,location=(0,0,.012));floor=bpy.context.object;floor.name='Render stage only';fm=bpy.data.materials.new('Review floor');fm.diffuse_color=(.10,.11,.12,1);floor.data.materials.append(fm)
 for loc,power,size in [((2,-3,4),380,3),((-2,-1,2.5),240,2),((0,2,3),420,2)]:
  bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.size=size;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
 if DIAGNOSTIC:
  diagnostic=body.copy();diagnostic.data=body.data.copy();bpy.context.collection.objects.link(diagnostic);diagnostic.name='Unmasked diagnostic temporary'
  bm=bmesh.new();bm.from_mesh(diagnostic.data);bm.verts.ensure_lookup_table();attr=diagnostic.data.attributes.get('review_mask');remove=[v for v in bm.verts if attr.data[v.index].value];bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(diagnostic.data);bm.free();body.hide_render=True
  for view in ['portrait','face_profile']:
   render(D/(ID+'-unmasked-'+view+'.png'),r,view=view)
  body.hide_render=False;bpy.data.objects.remove(diagnostic,do_unlink=True)
  (OUT/'diagnostic-evidence.json').write_text(json.dumps({'triangles':triangle,'rig':evidence,'scope':'Two actual unmasked CPU renders; no visual acceptance. Body/rig retained from V5 except head geometry.'},indent=2)+'\n')
  return
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
