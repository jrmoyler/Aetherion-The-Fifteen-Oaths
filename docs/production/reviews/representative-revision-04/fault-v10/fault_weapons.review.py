"""Deterministic authored Fault Choir weapons. Blender 4.3 background Python.
Reference-053 observed 2026-10-13. New art is unreviewed, not source replacement.
"""
import bpy, bmesh, math, random, json, os
from mathutils import Vector
import numpy as np
from pathlib import Path
ROOT=Path('/workspace/Aetherion-The-Fifteen-Oaths')
REVIEW=True
OUT=Path(os.getenv('AETHERION_REVIEW_OUT', str(Path(__file__).resolve().parent))) if REVIEW else ROOT/'assets/production/oath-05/weapons'; OUT.mkdir(parents=True,exist_ok=True)
random.seed(53)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene; scene.render.threads_mode='FIXED';scene.render.threads=2; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
mats={}; texture_paths=[]
# 512px tileable surface maps: mottled stone, directional leather grain,
# scratched bronze and mineral striations. Textures drive real UV materials.
for name,col,rough,metal in [('taupe_stone',(.43,.325,.225),.77,0),('amethyst',(.65,.30,.88),.065,0),('aged_bronze',(.50,.305,.115),.43,.78),('dark_leather',(.095,.037,.013),.72,0)]:
    rng=np.random.default_rng(53+len(mats)); n=512; yy,xx=np.mgrid[0:n,0:n]
    noise=rng.random((n,n)); grain=np.sin(xx*.61+np.sin(yy*.07)*2)*.035
    waves=np.sin(xx*.034+yy*.057)*np.cos(yy*.019)*.10
    value=.88+noise*.19+waves+grain
    if name=='taupe_stone':
        # Isotropic mineral cloud field and fine pitting; no directional wood grain.
        coarse=rng.random((17,17));u=xx/32;v=yy/32;ix=u.astype(int);iy=v.astype(int);fx=u-ix;fy=v-iy
        clouds=(coarse[iy,ix]*(1-fx)*(1-fy)+coarse[iy,ix+1]*fx*(1-fy)+coarse[iy+1,ix]*(1-fx)*fy+coarse[iy+1,ix+1]*fx*fy)
        value=.84+clouds*.22+(noise-.5)*.17+np.where(noise>.978,.22,0)
        # Interrupted mineral scars: angular and short, never directional grain.
        for scar in range(26):
            px,py=rng.uniform(0,n,2);dx,dy=rng.uniform(-42,42,2)
            for t in np.linspace(0,1,28):
                sx=px+dx*t;sy=py+dy*t+3*math.sin(t*7+scar)
                distance=(xx-sx)**2+(yy-sy)**2
                value-=np.exp(-distance/1.1)*.045
    if name=='dark_leather':value=.90+noise*.22+np.sin(xx*.09+yy*.18)*.09
    if name=='aged_bronze':value=.55+noise*.20+waves*2+np.where(noise>.97,.50,0)
    if name=='amethyst':value=.97+noise*.014
    mat=bpy.data.materials.new(name); mat.use_nodes=True; nodes=mat.node_tree.nodes; links=mat.node_tree.links; bs=nodes.get('Principled BSDF')
    bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal
    for kind in ['basecolor','roughness','metallic','normal']:
        a=np.ones((n,n,4),dtype=np.float32)
        if kind=='basecolor': a[:,:,:3]=np.clip(value[:,:,None]*np.array(col)[None,None,:],0,1)
        elif kind=='normal':
            gy,gx=np.gradient(value); a[:,:,0]=.5-gx*.24;a[:,:,1]=.5-gy*.24;a[:,:,2]=1
        else: a[:,:,:3]=np.clip((rough+(value-1)*.1 if kind=='roughness' else np.full((n,n),metal))[:,:,None],0,1)
        im=bpy.data.images.new(name+'_'+kind,n,n); im.colorspace_settings.name='sRGB' if kind=='basecolor' else 'Non-Color'; im.pixels.foreach_set(a.ravel()); im.filepath_raw=str(OUT/(name+'_'+kind+'.png')); im.file_format='PNG'; im.save(); im.pack()
        if kind!='basecolor': im.colorspace_settings.name='Non-Color'
        tex=nodes.new('ShaderNodeTexImage');tex.image=im
        if kind=='normal':
            norm=nodes.new('ShaderNodeNormalMap'); links.new(tex.outputs['Color'],norm.inputs['Color']);links.new(norm.outputs['Normal'],bs.inputs['Normal'])
        else: links.new(tex.outputs['Color'],bs.inputs[{'basecolor':'Base Color','roughness':'Roughness','metallic':'Metallic'}[kind]])
        texture_paths.append(str(Path(im.filepath_raw)) if REVIEW else str(Path(im.filepath_raw).relative_to(ROOT)))
    if name=='amethyst':
        bs.inputs['Transmission Weight'].default_value=.94;bs.inputs['IOR'].default_value=1.54
        for link in list(bs.inputs['Normal'].links):links.remove(link)
    mats[name]=mat

# Freshly fractured rims expose a lighter mineral substrate than weathered faces.
fresh=mats['taupe_stone'].copy();fresh.name='Fresh_mineral_break';bs=fresh.node_tree.nodes.get('Principled BSDF')
for link in list(bs.inputs['Base Color'].links):fresh.node_tree.links.remove(link)
bs.inputs['Base Color'].default_value=(.27,.19,.12,1);bs.inputs['Roughness'].default_value=.74;mats['fresh_stone_break']=fresh
cleavage=mats['amethyst'].copy();cleavage.name='Amethyst_internal_cleavage';cb=cleavage.node_tree.nodes.get('Principled BSDF');cb.inputs['Transmission Weight'].default_value=.88;cb.inputs['Roughness'].default_value=.12;mats['crystal_cleavage']=cleavage

def mesh(name,verts,faces,mat):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update(); ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob);ob.data.materials.append(mats[mat]);return ob

def plate(name,polygon,y,thick,mat='taupe_stone'):
    # Each outline is an authored asymmetric polygon in X/Z; inset raised face
    # gives chipped facets around the broad slab, unlike a stock cube/rock.
    cx=sum(p[0] for p in polygon)/len(polygon); cz=sum(p[1] for p in polygon)/len(polygon); N=len(polygon)
    vs=[(x,y,z) for x,z in polygon]+[(cx+(x-cx)*.81,y-thick,cz+(z-cz)*.89) for x,z in polygon]
    fs=[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
    return mesh(name,vs,fs,mat)

def fractured_plate(name,polygon,y,thick,seed):
    rr=random.Random(seed);n=len(polygon);cx=sum(x for x,z in polygon)/n;cz=sum(z for x,z in polygon)/n
    vertices=[(x,y,z) for x,z in polygon]
    for x,z in polygon:
        inset=rr.uniform(.045,.16)
        vertices.append((x+(cx-x)*inset,y-thick+rr.uniform(-.003,.003),z+(cz-z)*inset))
    center=len(vertices);vertices.append((cx+rr.uniform(-.01,.01),y-thick-rr.uniform(.001,.006),cz))
    faces=[tuple(range(n-1,-1,-1))]
    for i in range(n):faces.extend([(i,(i+1)%n,n+(i+1)%n,n+i),(n+i,n+(i+1)%n,center)])
    return mesh(name,vertices,faces,'taupe_stone')

def clip_half(poly,nx,nz,offset):
    out=[]
    for i,a in enumerate(poly):
        b=poly[(i+1)%len(poly)];da=nx*a[0]+nz*a[1]-offset;db=nx*b[0]+nz*b[1]-offset
        if da<=1e-8:out.append(a)
        if (da<0)!=(db<0):
            t=da/(da-db);out.append((a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])))
    return out

# Manually observed source-053 main side-view pixel landmarks. The projection
# preserves the trace rather than approximating it with a generic leaf/spear.
SOURCE_TIP=(50,230);SOURCE_ROOT=(429,180);SOURCE_SCALE=.00115
UPPER_EDGE=[(50,230),(88,209),(123,182),(176,176),(221,163),(278,150),(328,152),(365,135),(409,126),(426,130)]
UPPER_CLEFT=[(50,230),(96,221),(139,204),(186,202),(238,193),(285,185),(332,180),(369,169),(409,161),(429,155)]
LOWER_CLEFT=[(50,230),(100,225),(148,215),(211,208),(264,201),(315,196),(361,186),(409,179),(429,173)]
LOWER_EDGE=[(50,230),(97,239),(151,247),(216,250),(267,242),(313,239),(361,233),(411,217),(428,206)]

# V9 measured channel revision: widen visibility around source centerline.
UPPER_CLEFT=[(x,y-3.5*min(1,(x-50)/100)) for x,y in UPPER_CLEFT]
LOWER_CLEFT=[(x,y+3.5*min(1,(x-50)/100)) for x,y in LOWER_CLEFT]

def traced(p):
    ux,uy=.99141,-.13081;dx=p[0]-SOURCE_TIP[0];dy=p[1]-SOURCE_TIP[1]
    return ((-uy*dx+ux*dy)*SOURCE_SCALE,.135+(382.285-(ux*dx+uy*dy))*SOURCE_SCALE)

def shell_height(x,z):
    # Flattened diamond section: a continuous shell edge thins toward the
    # cutting perimeter and deepens gently beside the amethyst channel.
    return (.008+.012*max(0,1-abs(x+.013)/.064))*max(.025,min(1,(.575-z)/.075))

def stone_patch(name,pixel_poly,side,layer=0):
    poly=[traced(p) for p in pixel_poly]
    chipped=[]
    for j,(x,z) in enumerate(poly):
      chipped.append((x,z));xx,zz=poly[(j+1)%len(poly)]
      if math.hypot(xx-x,zz-z)>.018 and (j+layer)%3==1:
        # An actual recessed nick in selected fracture edges, bounded below by
        # the continuous substrate; size 0.6–1.1mm, not giant petal voids.
        cx0=sum(p[0] for p in poly)/len(poly);cz0=sum(p[1] for p in poly)/len(poly)
        px=x*.46+xx*.54;pz=z*.46+zz*.54;v=Vector((cx0-px,cz0-pz)).normalized()
        chipped.extend([(px-.035*(xx-x),pz-.035*(zz-z)),(px+v.x*.0011,pz+v.y*.0011),(px+.035*(xx-x),pz+.035*(zz-z))])
    poly=chipped;n=len(poly)
    cx=sum(x for x,z in poly)/n;cz=sum(z for x,z in poly)/n
    # Hairline separation at fracture boundaries, never open voids in the blade.
    poly=[(cx+(x-cx)*.966,cz+(z-cz)*.975) for x,z in poly]
    vs=[]
    for x,z in poly:vs.append((x,side*max(.0001,shell_height(x,z)-.004),z))
    for j,(x,z) in enumerate(poly):
      offset=.0015*math.sin(j*2.17+layer*1.7)
      vs.append((x,side*(shell_height(x,z)+(.002+layer*.0007+offset)*max(.025,min(1,(.575-z)/.075))),z))
    for j,(x,z) in enumerate(poly):
      inset=.025+.018*((j+layer)%3);xx=x+(cx-x)*inset;zz=z+(cz-z)*inset
      vs.append((xx,side*(shell_height(xx,zz)+(.0045+layer*.0007+.0015*math.sin(j+layer))*max(.025,min(1,(.575-zz)/.075))),zz))
    fs=[tuple(range(n-1,-1,-1))]
    for j in range(n):k=(j+1)%n;fs.extend([(j,k,k+n,j+n),(j+n,k+n,k+2*n,j+2*n)])
    # A broken cleavage ridge splits the broad face into two unequal planes.
    a=1;b=max(3,n-3);va=Vector(vs[2*n+a]);vb=Vector(vs[2*n+b]);q=va*.44+vb*.56
    q.y+=side*(.0012+.0004*(layer%3))*max(.05,min(1,(.575-q.z)/.075));q.x+=.0008*math.sin(layer)
    qi=len(vs);vs.append(tuple(q))
    fs.append(tuple(list(range(2*n+a,2*n+b+1))+[qi]))
    fs.append(tuple(list(range(2*n+b,3*n))+list(range(2*n,2*n+a+1))+[qi]))
    ob=mesh(name,vs,fs,'taupe_stone');ob.data.materials.append(mats['fresh_stone_break'])
    for f in ob.data.polygons:
      if 0<f.index<1+2*n and f.index%2==0 and (f.index+layer)%4==0:f.material_index=1
    return ob

def chip_edge(a,b,bank,i):
    # Unequal authored edge shoulders, shallow missing flakes, and point chips.
    # The same edge feeds substrate and outer plates so the silhouette is real.
    dx=b[0]-a[0];dy=b[1]-a[1];sgn=-1 if bank==0 else 1
    cuts=[(.24,1.3),(.35,-2.3),(.52,-1.2),(.72,1.4)] if i%3==0 else [(.31,.7),(.46,-2.2),(.58,-1.3)]
    return [a]+[(a[0]+dx*t,a[1]+dy*t+sgn*off) for t,off in cuts]+[b]

def interlocking_stone_shell():
    for side in [-1,1]:
      for bank,(outer,inner) in enumerate([(UPPER_EDGE,UPPER_CLEFT),(LOWER_EDGE,LOWER_CLEFT)]):
        edge=[]
        for i in range(len(outer)-1):edge.extend(chip_edge(outer[i],outer[i+1],bank,i)[:-1])
        edge.append(outer[-1]);boundary=edge+list(reversed(inner[1:-1]))
        poly=[traced(p) for p in boundary];n=len(poly)
        verts=[(x,side*.002,z) for x,z in poly]+[(x,side*max(.0001,shell_height(x,z)-.002),z) for x,z in poly]
        fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
        mesh('Continuous_traced_stone_substrate_%d_%d'%(side,bank),verts,fs,'taupe_stone')
        cuts=[]
        for i,(o,c) in enumerate(zip(outer,inner)):
          if o==c:
            cuts.append([o]);continue
          # Jagged unequal S/T intersections replace transverse regular panels.
          shift=[-5,3,7,-2,4,-6,2,-3,5,-2][i]
          a=(o[0]*.70+c[0]*.30+shift,o[1]*.70+c[1]*.30+2*(-1)**i)
          b=(o[0]*.34+c[0]*.66-shift*.45,o[1]*.34+c[1]*.66-1.4*(-1)**i)
          cuts.append([o,a,b,c])
        for i in range(len(cuts)-1):
          # Perimeter and fracture edges share vertices, with a thin dark seam.
          pp=cuts[i]+list(reversed(cuts[i+1]))+list(reversed(chip_edge(outer[i],outer[i+1],bank,i)[1:-1]))
          if i in [2,4,6] and bank==1:
            # Staggered intra-layer cleavage terminates against an adjacent crack.
            o=outer[i];c=inner[i];off=o[1]*.48+c[1]*.52
            low=clip_half(pp,0,1,off);high=clip_half(pp,0,-1,-off)
            if len(low)>2:stone_patch('Split_cleavage_A_%d_%d_%d'%(side,bank,i),low,side,(i+1)%4)
            if len(high)>2:stone_patch('Split_cleavage_B_%d_%d_%d'%(side,bank,i),high,side,(i+3)%4)
          else:stone_patch('Traced_fracture_flake_%d_%d_%02d'%(side,bank,i),pp,side,(i*3+bank)%4)
      # Unequal overlapping thin tongues interrupt exposed crystal without making
      # a solid band; picked from the visible source top-bank plate arrangement.
      chips=[[(144,188),(160,182),(190,184),(203,194),(180,199),(160,196)],
       [(240,170),(267,164),(290,170),(279,184),(257,187),(245,180)],
       [(332,156),(351,150),(378,154),(373,170),(349,177),(336,170)],
       [(180,231),(207,216),(222,217),(211,234),(192,241)],
       [(292,223),(314,204),(329,203),(337,211),(322,225)],
       [(382,198),(397,188),(411,192),(412,207),(395,215)],
       [(206,184),(225,183),(253,196),(239,203),(218,198)],
       [(333,166),(353,166),(369,178),(356,185),(343,180)]]
      for i,pp in enumerate(chips):stone_patch('Secondary_mineral_chip_%d_%d'%(side,i),pp,side,4+i%3)

def faceted_insert():
    # Continuous closed amethyst, matched to traced upper/lower channel edges.
    centers=[(51,230,1),(82,224,3),(115,216,6),(145,211,7),(178,207,8),(209,202,9),(239,198,10),(269,194,10.5),(298,190,11),(328,185,11.5),(355,180,12),(385,175,12),(414,170,12),(430,164,9)]
    verts=[];N=8
    for j,(px,py,width) in enumerate(centers):
      x,z=traced((px,py));r=width*SOURCE_SCALE*(1.35+.18*math.sin(j*2.4))
      for k in range(N):
        angle=k*math.tau/N+.21*math.sin(j*2.1)
        verts.append((x+r*math.cos(angle),-.002+min(.033,r*2.0)*math.sin(angle),z))
    fs=[tuple(range(N-1,-1,-1)),tuple(range((len(centers)-1)*N,len(centers)*N))]
    for j in range(len(centers)-1):
      for k in range(N):a=j*N+k;b=j*N+(k+1)%N;c=(j+1)*N+(k+1)%N;d=(j+1)*N+k;fs.extend([(a,b,c),(a,c,d)])
    ob=mesh('Traced_closed_amethyst_channel',verts,fs,'amethyst')
    for j,tint in enumerate([(.42,.14,.70,1),(.78,.53,.94,1)]):
      zone=mats['amethyst'].copy();zone.name='Amethyst_natural_color_zone_%d'%j;bs=zone.node_tree.nodes.get('Principled BSDF')
      for link in list(bs.inputs['Base Color'].links):zone.node_tree.links.remove(link)
      bs.inputs['Base Color'].default_value=tint;bs.inputs['Coat Weight'].default_value=0;ob.data.materials.append(zone)
    for face in ob.data.polygons:
      # Color zoning varies within genuine cut planes, not painted highlights.
      if face.index%11==4:face.material_index=2
      elif face.index%7==2:face.material_index=1
    return ob

def bronze_line(name,points,r=.003):
    verts=[];N=8
    for i,p in enumerate(points):
        tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)]);q=tangent.to_track_quat('Z','Y')
        for j in range(N):a=j*math.tau/N;verts.append(tuple(Vector(p)+q@Vector((r*math.cos(a),r*math.sin(a),0))))
    faces=[tuple(range(N-1,-1,-1)),tuple(range((len(points)-1)*N,len(points)*N))]
    for i in range(len(points)-1):
        for j in range(N):faces.append((i*N+j,i*N+(j+1)%N,(i+1)*N+(j+1)%N,(i+1)*N+j))
    return mesh(name,verts,faces,'aged_bronze')

def crystal(name,start,end,radius):
    a=Vector(start);b=Vector(end);axis=b-a;q=axis.to_track_quat('Z','Y'); n=5
    vs=[]
    for t,r in [(0,.65),(.64,1),(.78,.83)]:
        for j in range(n): vs.append(tuple(a+q@Vector((radius*r*math.cos(j*2*math.pi/n),radius*r*math.sin(j*2*math.pi/n),axis.length*t))))
    vs.append(tuple(b));fs=[tuple(range(n-1,-1,-1))]
    for layer in range(2):
        for j in range(n): fs.append((layer*n+j,layer*n+(j+1)%n,(layer+1)*n+(j+1)%n,(layer+1)*n+j))
    for j in range(n):fs.append((2*n+j,2*n+(j+1)%n,3*n))
    return mesh(name,vs,fs,'amethyst')

def cyl(name,z,r,depth,mat,n=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=depth,location=(0,0,z));ob=bpy.context.object;ob.name=name;ob.data.materials.append(mats[mat]);return ob

def ribbon(name,z0,z1,r,turns,width,mat):
    vs=[];steps=int(abs(turns)*24)
    for i in range(steps+1):
        t=i/steps;ang=t*turns*math.tau
        for dz in [-width/2,width/2]: vs.append((r*math.cos(ang),r*math.sin(ang),z0+(z1-z0)*t+dz))
    return mesh(name,vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(steps)],mat)

def stud(x,y,z):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.008,location=(x,y,z));ob=bpy.context.object;ob.name='Bronze_rivet';ob.data.materials.append(mats['aged_bronze'])

def sockets(top):
    for name,pos in [('SOCKET_grip_primary',(0,0,0)),('SOCKET_belt_stow',(0,.055,.11)),('SOCKET_effect_tip',(0,0,top))]:
        ob=bpy.data.objects.new(name,None);scene.collection.objects.link(ob);ob.location=pos;ob.empty_display_type='ARROWS';ob.empty_display_size=.04

def uv_all(obs):
    for ob in obs:
        if ob.type!='MESH':continue
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
        if ob.name in ['Pommel_fitted_bronze_frame.001','Pommel_fitted_bronze_frame.002','Traced_fracture_flake_-1_1_00','Traced_fracture_flake_1_1_00']:
            # Unwrap the actual final triangles for these four thin curved/tip
            # surfaces. Earlier pre-triangulation UVs produced zero tangents.
            tri=ob.modifiers.new('Final_topology_before_UV','TRIANGULATE')
            bpy.ops.object.modifier_apply(modifier=tri.name)
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=.65,island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
            ob.data.calc_tangents()
            assert all(loop.tangent.length>.9 for loop in ob.data.loops),ob.name+' invalid tangent after final UV unwrap'


def export(path,obs):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_apply=True)

def camera_view(path,obs,view):
    verts=[o.matrix_world@v.co for o in obs if o.type=='MESH' for v in o.data.vertices]; mid=(Vector(tuple(min(v[i] for v in verts) for i in range(3)))+Vector(tuple(max(v[i] for v in verts) for i in range(3))))/2
    bpy.ops.object.camera_add();cam=bpy.context.object;cam.location=mid+Vector(view);cam.rotation_euler=(mid-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=max(max(v[i] for v in verts)-min(v[i] for v in verts) for i in range(3))*1.26;scene.camera=cam
    lamps=[]
    for pos,power,size in [((-1,-2,2),180,2),((2,0,1),110,1.5),((0,2,2),220,1)]:
        bpy.ops.object.light_add(type='AREA',location=mid+Vector(pos));li=bpy.context.object;li.data.energy=power;li.data.shape='DISK';li.data.size=size;li.rotation_euler=(mid-li.location).to_track_quat('-Z','Y').to_euler();lamps.append(li)
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=192 if REVIEW else 128;scene.cycles.use_denoising=False;scene.render.resolution_x=720;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.40,.42,.46,1);scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.45;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(path);scene.view_settings.view_transform='AgX';bpy.ops.render.render(write_still=True)
    for o in lamps+[cam]:bpy.data.objects.remove(o,do_unlink=True)

records=[]
for typ in (['amethyst-short-blade'] if REVIEW else ['amethyst-short-blade','amethyst-seer-mace']):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    out=OUT/typ;out.mkdir(exist_ok=True)
    # Source handle occupies about 160px; its leather diameter is about 30px.
    cyl('Tapered_grip_core',0,.018,.177,'dark_leather',16)
    wrap=ribbon('Overlapping_diagonal_leather',-.079,.079,.020,4.6,.029,'dark_leather')
    so=wrap.modifiers.new('Leather_edge_thickness','SOLIDIFY');so.thickness=.0013
    binding=ribbon('Counterwound_leather_lacing',-.078,.080,.0221,-3.9,.010,'dark_leather')
    so=binding.modifiers.new('Narrow_lace_thickness','SOLIDIFY');so.thickness=.0011
    # Fine raised stitching is individual short leather segments along one wrap.
    for i in range(22):
      t=i/21;ang=t*5.6*math.tau;z=-.079+.158*t
      bronze_line('Grip_recessed_brass_pin',[(.0209*math.cos(ang),.0209*math.sin(ang),z-.001),(.0212*math.cos(ang),.0212*math.sin(ang),z+.001)],.00065)
    for z in [-.090,.093]:
      cyl('Octagonal_fitted_grip_collar',z,.025,.015,'aged_bronze',8)
      bronze_line('Grip_collar_bead',[(.0255*math.cos(t),.0255*math.sin(t),z+.007) for t in [j*math.tau/32 for j in range(33)]],.0015)
    # Pommel: asymmetric crystal with individually fitted mineral/bronze cage.
    crystal('Pommel_closed_core',(0,0,-.102),(.002,0,-.197),.025)
    pommel_outlines=[[(.004,-.102),(.028,-.109),(.036,-.133),(.031,-.154),(.015,-.148),(.010,-.125)],
      [(-.003,-.104),(-.026,-.114),(-.032,-.139),(-.020,-.149),(-.012,-.127)],
      [(-.029,-.153),(-.022,-.176),(-.004,-.195),(.009,-.177),(-.005,-.164)],
      [(.029,-.148),(.031,-.164),(.012,-.185),(.005,-.162)]]
    for side in [-1,1]:
      for j,poly in enumerate(pommel_outlines):
        ob=fractured_plate('Pommel_individual_mineral_%d_%d'%(side,j),poly,-.015,.008,880+j)
        if side>0:ob.scale.y=-1
      for sign in [-1,1]:
        bronze_line('Pommel_fitted_bronze_frame',[(sign*.014,side*.013,-.101),(sign*.029,side*.018,-.122),(sign*.033,side*.019,-.150),(sign*.018,side*.016,-.177),(0,side*.008,-.197)],.0027)
    if typ=='amethyst-short-blade':
        faceted_insert();interlocking_stone_shell()
        for j,(px,py) in enumerate([(169,203),(344,181)]):
          x,z=traced((px,py));crystal('Internal_amethyst_cleavage_%d'%j,(x,-.007,z-.016),(x+.002,-.009,z+.015),.006)
        # Forged faceted guard body follows the wider stone shoulder, with
        # overlapping strapped panels rather than a plain circular torus.
        N=12;vs=[]
        for z,rx,ry in [(.102,.032,.025),(.117,.056,.030),(.147,.057,.033),(.161,.053,.028)]:
          for j in range(N):a=j*math.tau/N;vs.append((-.008+rx*math.cos(a),ry*math.sin(a),z+.006*math.cos(a*2)))
        fs=[(k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j) for k in range(3) for j in range(N)]
        ob=mesh('Guard_forged_fitted_body',vs,fs,'aged_bronze');so=ob.modifiers.new('Bronze_wall','SOLIDIFY');so.thickness=.003
        for side in [-1,1]:
          for sign in [-1,1]:
            # Raised diamond strap anchors and carved brow/quillon edges.
            xx=-.008+sign*.043
            poly=[(xx-sign*.012,.109),(xx+sign*.014,.117),(xx+sign*.012,.148),(xx+sign*.012,.165),(xx,.183),(xx-sign*.012,.153)]
            ob=plate('Guard_ornamental_anchor',poly,-.029,.006,'aged_bronze')
            if side>0:ob.scale.y=-1
            bronze_line('Guard_inlaid_border',[(x,side*.037,z) for x,z in poly+[poly[0]]],.0014)
            for z in [.124,.153]:
              bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.0038,location=(xx,side*.039,z));bpy.context.object.name='Guard_peened_stud';bpy.context.object.data.materials.append(mats['aged_bronze'])
          bronze_line('Guard_lower_raised_brow',[(-.061,side*.020,.120),(-.042,side*.033,.111),(-.008,side*.037,.108),(.026,side*.033,.111),(.048,side*.020,.120)],.0023)
        # Longitudinal chased straps are fitted to the guard curvature.
        for sign in [-1,1]:
          for z in [.125,.151]:
            bronze_line('Guard_chased_fitted_border',[( -.008+.060*math.cos(a),sign*.035*math.sin(a),z+.004*math.cos(2*a)) for a in [i*math.pi/24 for i in range(25)]],.0013)
          xx=-.008+sign*.035
          for side in [-1,1]:
            # Small diamond-shaped inset badge with real raised center boss.
            badge=[(xx,.119),(xx+.006,.136),(xx,.156),(xx-.006,.136)]
            ob=plate('Guard_chased_diamond_badge',badge,-.035,.003,'aged_bronze')
            if side>0:ob.scale.y=-1
        for side in [-1,1]:
          flange=[(-.049,.131),(-.044,.158),(-.031,.172),(-.023,.164),(-.027,.145),(-.021,.132),(-.034,.118)]
          ob=plate('Guard_inner_layered_flange',flange,-.032,.003,'aged_bronze')
          if side>0:ob.scale.y=-1
          flange2=[(.022,.115),(.038,.123),(.046,.145),(.037,.163),(.029,.154),(.031,.137),(.024,.132)]
          ob=plate('Guard_return_layered_flange',flange2,-.033,.004,'aged_bronze')
          if side>0:ob.scale.y=-1
        top=.575
    else:
        # Extended two grip shaft with central stone resonance collar.
        cyl('Extended_shaft',.25,.025,.30,'dark_leather');ribbon('Upper_leather_wrap',.13,.36,.029,6,.025,'dark_leather')
        cyl('Head_throat',.415,.049,.045,'aged_bronze')
        crystal('Axial_head_core',(0,0,.43),(0,0,.78),.084)
        for j in range(11):
            a=j*2.39996;z=.49+(j%4)*.057;r=.105 if j%2 else .125
            start=(.035*math.cos(a),.035*math.sin(a),z)
            end=(r*math.cos(a),r*math.sin(a),z+.10+(j%3)*.012)
            crystal('Divergent_crystal_'+str(j),start,end,.035+(j%3)*.008)
        for j in range(8):
            a=j*math.tau/8
            if j in [0,4]:continue
            # A slab built radially then turned around head, leaving face seam.
            for k in range(3):
                z=.47+k*.094+.012*math.sin(j*2+k)
                w=.81+.16*math.sin(j*3+k*2)
                outline=[(-.047*w,z),(.018*w,z-.016),(.059*w,z+.025),(.034*w,z+.038),(.057*w,z+.056),(.031*w,z+.079),(-.024*w,z+.091),(-.053*w,z+.050)]
                ob=fractured_plate('Mace_stone_shell_%d_%d'%(j,k),outline,-.079-(k%2)*.01,.025+.008*math.sin(j),540+j*7+k)
                ob.rotation_euler[2]=a;ob.location.x=.012*math.sin(a)
        for z in [.50,.70]:
            cyl('Head_bronze_binding',z,.119,.017,'aged_bronze',12)
            for j in range(8):a=j*math.tau/8;stud(.12*math.cos(a),.12*math.sin(a),z)
        for sign in [-1,1]:plate('Head_longitudinal_clasp',[(sign*.073,.49),(sign*.099,.51),(sign*.08,.74),(sign*.041,.79),(sign*.04,.752)],-.103,.010,'aged_bronze')
        top=.78
    sockets(top);bpy.context.view_layer.update();obs=list(scene.objects);uv_all(obs)
    if REVIEW:
        bpy.ops.wm.save_as_mainfile(filepath=str(out/'source.blend'))
        camera_view(out/'hero-review.png',obs,(1.35,-3,.60));camera_view(out/'front-review.png',obs,(0,-3,.1));camera_view(out/'profile-review.png',obs,(3,0,.1));
        detail=[o for o in obs if o.type=='MESH' and ('Traced' in o.name or 'Continuous' in o.name or 'Secondary' in o.name or 'Guard' in o.name or 'Split_' in o.name or 'Internal_amethyst' in o.name)];camera_view(out/'material-closeup.png',detail,(.5,-3,.4));continue
    for o in obs:
        if o.type=='MESH':o['asset_role']='static_weapon_component';o['reference']='reference-053'
    tri=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in obs if o.type=='MESH')
    pts=[o.matrix_world@v.co for o in obs if o.type=='MESH' for v in o.data.vertices];dims=[round(max(p[i] for p in pts)-min(p[i] for p in pts),4) for i in range(3)]
    bpy.ops.wm.save_as_mainfile(filepath=str(out/(typ+'.blend')))
    export(out/(typ+'.glb'),obs)
    # Separate renderable simplified LODs; originals never destructively altered.
    for level,ratio in [(1,.55),(2,.28)]:
        clones=[]
        for o in obs:
            if o.type!='MESH':continue
            cp=o.copy();cp.data=o.data.copy();scene.collection.objects.link(cp);clones.append(cp)
            de=cp.modifiers.new('LOD_simplification','DECIMATE');de.ratio=ratio
        export(out/(typ+'_lod%d.glb'%level),clones)
        for o in clones:bpy.data.objects.remove(o,do_unlink=True)
    # Convex hull pickup collision, separate from render assets.
    hull=mesh('UCX_'+typ,[tuple(p) for p in pts],[],'taupe_stone');hull.data.materials.clear();bpy.context.view_layer.objects.active=hull;bpy.ops.object.select_all(action='DESELECT');hull.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.convex_hull();bpy.ops.object.mode_set(mode='OBJECT');export(out/(typ+'_collision.glb'),[hull]);bpy.data.objects.remove(hull,do_unlink=True)
    renders=[]
    for title,view in [('front',(0,-3,.15)),('side',(3,0,.15)),('hero',(1,-3,1))]:
        path=out/(title+'.png');camera_view(path,obs,view);renders.append(str(path.relative_to(ROOT)))
    rel=lambda f:str((out/f).relative_to(ROOT))
    records.append({'id':'prod-o05-'+typ,'name':typ.replace('-',' ').title(),'type':'static_equipment','status':'PRODUCTION_CANDIDATE_UNREVIEWED','files':{'blend':rel(typ+'.blend'),'glb':rel(typ+'.glb'),'lod1':rel(typ+'_lod1.glb'),'lod2':rel(typ+'_lod2.glb'),'collision':rel(typ+'_collision.glb'),'textures':texture_paths,'renders':renders},'triangles':tri,'dimensionsMeters':dims,'dimensionsCoordinateSystem':'BLENDER_Z_UP','rig':'NOT_APPLICABLE_STATIC_WEAPON','animations':[],'remainingGates':['Owner art review against reference-053','Character grip/stow fit and carry poses','Damaged geometry state','Engine import and runtime material/socket tests','LOD silhouette and collision gameplay approval','Sound and VFX response integration']})
if REVIEW:raise SystemExit(0)
(OUT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'familyId':'asset-o05-e-weapons-family','referenceIds':['reference-053'],'assets':records},indent=2)+'\n')

# Counts measured from exported GLB index accessors, not source estimates.
import struct
for record in records:
    counts={}
    for key in ['glb','lod1','lod2','collision']:
        data=(ROOT/record['files'][key]).read_bytes();size=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+size])
        counts[key]=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
    record['triangles']=counts
    record['archetypeId']=record['id']
(OUT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'familyId':'asset-o05-e-weapons-family','referenceIds':['reference-053'],'assets':records},indent=2)+'\n')
# Contact sheet contains actual rendered pixels from both candidates.
canvas=np.ones((1800,2160,4),dtype=np.float32)
for row,record in enumerate(records):
    for col,path in enumerate(record['files']['renders']):
        im=bpy.data.images.load(str(ROOT/path));pix=np.array(im.pixels[:]).reshape((900,720,4))
        canvas[(1-row)*900:(2-row)*900,col*720:(col+1)*720,:]=pix
contact=bpy.data.images.new('Fault_Choir_contact_sheet',2160,1800);contact.pixels.foreach_set(canvas.ravel());contact.filepath_raw=str(OUT/'contact-sheet.png');contact.file_format='PNG';contact.save()
