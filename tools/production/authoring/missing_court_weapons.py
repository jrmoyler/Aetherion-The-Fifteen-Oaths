"""Deterministic authored Missing Court weapons. Blender 4.3 background Python.
Reference-041 observed 2026-10-13. New art is unreviewed, not source replacement.
"""
import bpy, math, random, json, os
from mathutils import Vector
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/production/oath-11/weapons'; OUT.mkdir(parents=True,exist_ok=True)
random.seed(47)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene; scene.render.threads_mode='FIXED';scene.render.threads=2; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
mats={}; texture_paths=[]
# 512px tileable surface maps: mottled stone, directional leather grain,
# scratched bronze and mineral striations. Textures drive real UV materials.
for name,col,rough,metal in [('pale_silver',(.56,.54,.50),.42,.80),('red_cloth',(.13,.017,.013),.88,0),('weathered_iron',(.064,.069,.072),.49,.84),('charcoal_leather',(.021,.016,.014),.87,0)]:
    rng=np.random.default_rng(47+len(mats)); n=512; yy,xx=np.mgrid[0:n,0:n]
    noise=rng.random((n,n)); grain=np.sin(xx*.61+np.sin(yy*.07)*2)*.035
    waves=np.sin(xx*.034+yy*.057)*np.cos(yy*.019)*.10
    value=.88+noise*.19+waves+grain
    if name=='pale_silver':
        fracture=np.abs(np.sin(xx*.055+yy*.023+np.sin(yy*.074)*.72))
        value*=np.where(fracture<.009,.78,1.0)
        value+=np.sin(xx*.11+yy*.17)*.045
    if name=='charcoal_leather':
        value*=1.5
    if name=='red_cloth': value=.68+noise*.13+.36*np.abs(np.sin(xx*.021+yy*.032)*np.cos(xx*.045-yy*.012))
    mat=bpy.data.materials.new(name); mat.use_nodes=True; nodes=mat.node_tree.nodes; links=mat.node_tree.links; bs=nodes.get('Principled BSDF')
    bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal
    for kind in ['basecolor','roughness','metallic','normal']:
        a=np.ones((n,n,4),dtype=np.float32)
        if kind=='basecolor': a[:,:,:3]=np.clip(value[:,:,None]*np.array(col)[None,None,:],0,1)
        elif kind=='normal':
            gy,gx=np.gradient(value); a[:,:,0]=.5-gx*.24;a[:,:,1]=.5-gy*.24;a[:,:,2]=1
        else: a[:,:,:3]=np.clip((rough+(value-1)*.1 if kind=='roughness' else np.full((n,n),metal))[:,:,None],0,1)
        im=bpy.data.images.new(name+'_'+kind,n,n); im.pixels.foreach_set(a.ravel()); im.filepath_raw=str(OUT/(name+'_'+kind+'.png')); im.file_format='PNG'; im.save(); im.pack()
        if kind!='basecolor': im.colorspace_settings.name='Non-Color'
        tex=nodes.new('ShaderNodeTexImage');tex.image=im
        if kind=='normal':
            norm=nodes.new('ShaderNodeNormalMap'); links.new(tex.outputs['Color'],norm.inputs['Color']);links.new(norm.outputs['Normal'],bs.inputs['Normal'])
        else: links.new(tex.outputs['Color'],bs.inputs[{'basecolor':'Base Color','roughness':'Roughness','metallic':'Metallic'}[kind]])
        texture_paths.append(str(Path(im.filepath_raw).relative_to(ROOT)))
    mats[name]=mat

def mesh(name,verts,faces,mat):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update(); ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob);ob.data.materials.append(mats[mat]);return ob

def plate(name,polygon,y,thick,mat='pale_silver'):
    # Each outline is an authored asymmetric polygon in X/Z; inset raised face
    # gives chipped facets around the broad slab, unlike a stock cube/rock.
    cx=sum(p[0] for p in polygon)/len(polygon); cz=sum(p[1] for p in polygon)/len(polygon); N=len(polygon)
    vs=[(x,y,z) for x,z in polygon]+[(cx+(x-cx)*.81,y-thick,cz+(z-cz)*.89) for x,z in polygon]
    fs=[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
    return mesh(name,vs,fs,mat)

def crystal(name,start,end,radius):
    a=Vector(start);b=Vector(end);axis=b-a;q=axis.to_track_quat('Z','Y'); n=5
    vs=[]
    for t,r in [(0,.65),(.64,1),(.78,.83)]:
        for j in range(n): vs.append(tuple(a+q@Vector((radius*r*math.cos(j*2*math.pi/n),radius*r*math.sin(j*2*math.pi/n),axis.length*t))))
    vs.append(tuple(b));fs=[tuple(range(n-1,-1,-1))]
    for layer in range(2):
        for j in range(n): fs.append((layer*n+j,layer*n+(j+1)%n,(layer+1)*n+(j+1)%n,(layer+1)*n+j))
    for j in range(n):fs.append((2*n+j,2*n+(j+1)%n,3*n))
    return mesh(name,vs,fs,'red_cloth')

def cyl(name,z,r,depth,mat,n=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=depth,location=(0,0,z));ob=bpy.context.object;ob.name=name;ob.data.materials.append(mats[mat]);return ob

def ribbon(name,z0,z1,r,turns,width,mat):
    vs=[];steps=int(turns*24)
    for i in range(steps+1):
        t=i/steps;ang=t*turns*math.tau
        for dz in [-width/2,width/2]: vs.append((r*math.cos(ang),r*math.sin(ang),z0+(z1-z0)*t+dz))
    return mesh(name,vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(steps)],mat)

def stud(x,y,z):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.008,location=(x,y,z));ob=bpy.context.object;ob.name='Bronze_rivet';ob.data.materials.append(mats['weathered_iron'])

def sockets(top):
    for name,pos in [('SOCKET_grip_primary',(0,0,0)),('SOCKET_belt_stow',(0,.055,.11)),('SOCKET_effect_tip',(0,0,top))]:
        ob=bpy.data.objects.new(name,None);scene.collection.objects.link(ob);ob.location=pos;ob.empty_display_type='ARROWS';ob.empty_display_size=.04

def uv_all(obs):
    for ob in obs:
        if ob.type!='MESH':continue
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')

def export(path,obs):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_apply=True)

def camera_view(path,obs,view):
    verts=[o.matrix_world@v.co for o in obs if o.type=='MESH' for v in o.data.vertices]; mid=(Vector(tuple(min(v[i] for v in verts) for i in range(3)))+Vector(tuple(max(v[i] for v in verts) for i in range(3))))/2
    bpy.ops.object.camera_add();cam=bpy.context.object;cam.location=mid+Vector(view);cam.rotation_euler=(mid-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.30;scene.camera=cam
    lamps=[]
    for pos,power,size in [((-1,-2,2),180,2),((2,0,1),110,1.5),((0,2,2),220,1)]:
        bpy.ops.object.light_add(type='AREA',location=mid+Vector(pos));li=bpy.context.object;li.data.energy=power;li.data.shape='DISK';li.data.size=size;li.rotation_euler=(mid-li.location).to_track_quat('-Z','Y').to_euler();lamps.append(li)
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=96;scene.cycles.use_denoising=False;scene.render.resolution_x=720;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.world.color=(.23,.23,.23);scene.render.image_settings.file_format='PNG';scene.render.filepath=str(path);scene.view_settings.view_transform='AgX';bpy.ops.render.render(write_still=True)
    for o in lamps+[cam]:bpy.data.objects.remove(o,do_unlink=True)

def tube(name,points,r,mat,sides=8):
    vs=[]
    for i,p in enumerate(points):
        p=Vector(p); tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        q=tangent.to_track_quat('Z','Y')
        for j in range(sides):vs.append(tuple(p+q@Vector((r*math.cos(j*math.tau/sides),r*math.sin(j*math.tau/sides),0))))
    fs=[tuple(range(sides-1,-1,-1)),tuple(range((len(points)-1)*sides,len(points)*sides))]
    for i in range(len(points)-1):
        for j in range(sides):fs.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    return mesh(name,vs,fs,mat)
def orb(name,pos,r,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=r,location=pos);ob=bpy.context.object;ob.name=name;ob.data.materials.append(mats[mat]);return ob

def petal(name,a,mat):
    vs=[];steps=10
    for i in range(steps+1):
        t=i/steps;z=.42+t*.30;r=.16*math.sin(math.pi*t)**.7;w=.067*math.sin(math.pi*t)**.8
        for side in [-1,0,1]:
            rad=r+(.015 if side==0 else 0);x=rad*math.cos(a)-side*w*math.sin(a);y=rad*math.sin(a)+side*w*math.cos(a);vs.append((x,y,z))
    faces=[]
    for i in range(steps):
        for j in range(2):faces.append((i*3+j,i*3+j+1,(i+1)*3+j+1,(i+1)*3+j))
    ob=mesh(name,vs,faces,mat);sol=ob.modifiers.new('Forged_leaf_thickness','SOLIDIFY');sol.thickness=.007;return ob
records=[]
for typ in ['void-cleaver','missing-court-lotus-focus']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);out=OUT/typ;out.mkdir(exist_ok=True)
    cyl('Dark_grip',0,.025,.21,'charcoal_leather');ribbon('Deep_red_wrap',-.10,.10,.027,5,.010,'red_cloth');ob=ribbon('Crossing_black_wrap',-.10,.10,.029,5,.008,'charcoal_leather');ob.scale.x=-1
    for z in [-.117,.117]:cyl('Iron_socket_ferrule',z,.037,.025,'weathered_iron');cyl('Pale_ferrule_edge',z+.011,.039,.004,'pale_silver')
    tube('Pommel_ring',[(.033*math.cos(t),0,-.17+.037*math.sin(t)) for t in [i*math.tau/28 for i in range(29)]],.006,'pale_silver')
    for j in range(7):
        x=(j-3)*.010;plate('Split_crimson_tassel_'+str(j),[(x*.24-.004,-.205),(x*.24+.004,-.205),(x+.008,-.36-(j%3)*.018),(x-.007,-.355-(j%2)*.020)],0,.002,'red_cloth')
    if typ=='void-cleaver':
        edge=[(.32,.83),(.31,.77),(.292,.714)]
        for i in range(5):
            z=.69-i*.098;reach=.275-i*.026
            edge.append((reach,z+.018))
            for k in range(9):
                t=k/8;angle=math.pi*.18+t*math.pi*1.20;edge.append((reach-.035+.053*math.cos(angle),z+.007+.042*math.sin(angle)))
            edge.append((reach-.010,z-.055))
        outline=[(-.021,.13),(-.027,.76),(.022,.79),(.044,.84)]+edge+[(.055,.14)];plate('Weathered_cleaver_body',outline,.012,.024,'weathered_iron')
        vs=[]
        for x,z in edge:vs.extend([(x,-.017,z),(x-.016,-.020,z+.008)])
        mesh('Silver_scalloped_edge',vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(edge)-1)],'pale_silver');tube('Pale_spine_rail',[(-.032,-.005,.16),(-.038,-.005,.74),(.022,-.005,.79)],.009,'pale_silver')
        for z in [.19,.32,.45,.58,.71]:plate('Spine_clamp',[(-.053,z-.018),(.009,z-.018),(.018,z+.018),(-.05,z+.018)],-.015,.010,'pale_silver');stud(-.017,-.031,z)
        top=.84
    else:
        cyl('Long_focus_grip',.25,.023,.30,'charcoal_leather');ribbon('Upper_crimson_lacing',.115,.36,.026,6,.010,'red_cloth')
        for z in [.18,.28,.36]:cyl('Staff_binding',z,.029,.023,'pale_silver')
        ob=orb('Deep_red_crown_interior',(0,0,.57),.139,'red_cloth');ob.scale.z=1.16
        for j in range(6):
            petal('Pale_forged_crown_leaf_'+str(j),j*math.tau/6,'pale_silver');a=(j+.5)*math.tau/6;pts=[((.148+.015*math.sin(t*math.pi))*math.cos(a),(.148+.015*math.sin(t*math.pi))*math.sin(a),.45+t*.27) for t in [i/12 for i in range(13)]];tube('Dark_external_crown_rib_'+str(j),pts,.008,'weathered_iron');stud(.168*math.cos(j*math.tau/6),.168*math.sin(j*math.tau/6),.57)
        for j in range(6):
            a=j*math.tau/6;ob=plate('Basal_lotus_calyx_'+str(j),[(-.018,.37),(-.043,.4),(-.076,.47),(0,.429),(.025,.38)],-.01,.008,'weathered_iron');ob.rotation_euler[2]=a
        cyl('Lotus_throat',.389,.041,.024,'weathered_iron');top=.76
    sockets(top);bpy.context.view_layer.update();obs=list(scene.objects);uv_all(obs)
    for o in obs:
        if o.type=='MESH':o['reference']='reference-041'
    pts=[o.matrix_world@v.co for o in obs if o.type=='MESH' for v in o.data.vertices];dims=[round(max(p[i] for p in pts)-min(p[i] for p in pts),4) for i in range(3)]
    bpy.ops.wm.save_as_mainfile(filepath=str(out/(typ+'.blend')));export(out/(typ+'.glb'),obs)
    for level,ratio in [(1,.55),(2,.28)]:
        clones=[]
        for o in obs:
            if o.type!='MESH':continue
            cp=o.copy();cp.data=o.data.copy();scene.collection.objects.link(cp);clones.append(cp);de=cp.modifiers.new('LOD_simplification','DECIMATE');de.ratio=ratio
        export(out/(typ+'_lod%d.glb'%level),clones)
        for o in clones:bpy.data.objects.remove(o,do_unlink=True)
    hull=mesh('UCX_'+typ,[tuple(p) for p in pts],[],'pale_silver');hull.data.materials.clear();bpy.context.view_layer.objects.active=hull;bpy.ops.object.select_all(action='DESELECT');hull.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.convex_hull();bpy.ops.object.mode_set(mode='OBJECT');export(out/(typ+'_collision.glb'),[hull]);bpy.data.objects.remove(hull,do_unlink=True)
    renders=[]
    for title,view in [('front',(0,-3,.15)),('side',(3,0,.15)),('hero',(1,-3,1))]:
        path=out/(title+'.png');camera_view(path,obs,view);renders.append(str(path.relative_to(ROOT)))
    rel=lambda f:str((out/f).relative_to(ROOT))
    record={'id':'prod-o11-'+typ,'archetypeId':'prod-o11-'+typ,'name':typ.replace('-',' ').title(),'type':'static_equipment','status':'PRODUCTION_CANDIDATE_UNREVIEWED','files':{'blend':rel(typ+'.blend'),'glb':rel(typ+'.glb'),'lod1':rel(typ+'_lod1.glb'),'lod2':rel(typ+'_lod2.glb'),'collision':rel(typ+'_collision.glb'),'textures':texture_paths,'renders':renders},'dimensionsMeters':dims,'dimensionsCoordinateSystem':'BLENDER_Z_UP','rig':'NOT_APPLICABLE_STATIC_WEAPON','animations':[],'remainingGates':['Owner reference-041 art review','Carried/stowed character fit','Damaged state','Engine import/runtime parity','Gameplay collision and LOD checks','Tassel secondary motion and void focus VFX/audio']};records.append(record)
import struct
for record in records:
    counts={}
    for key in ['glb','lod1','lod2','collision']:
        data=(ROOT/record['files'][key]).read_bytes();size=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+size]);counts[key]=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
    record['triangles']=counts
(OUT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'familyId':'asset-o11-e-weapons-family','referenceIds':['reference-041'],'assets':records},indent=2)+'\n')
canvas=np.ones((1800,2160,4),dtype=np.float32)
for row,record in enumerate(records):
    for col,path in enumerate(record['files']['renders']):
        im=bpy.data.images.load(str(ROOT/path));canvas[(1-row)*900:(2-row)*900,col*720:(col+1)*720,:]=np.array(im.pixels[:]).reshape((900,720,4))
contact=bpy.data.images.new('Missing_Court_contact_sheet',2160,1800);contact.pixels.foreach_set(canvas.ravel());contact.filepath_raw=str(OUT/'contact-sheet.png');contact.file_format='PNG';contact.save()
