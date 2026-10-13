"""Deterministic authored Bitterglass Guild weapons. Blender 4.3 background Python.
Reference-047 observed 2026-10-13. New art is unreviewed, not source replacement.
"""
import bpy, math, random, json, os
from mathutils import Vector
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/production/oath-08/weapons'; OUT.mkdir(parents=True,exist_ok=True)
random.seed(47)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene; scene.render.threads_mode='FIXED';scene.render.threads=2; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
mats={}; texture_paths=[]
# 512px tileable surface maps: mottled stone, directional leather grain,
# scratched bronze and mineral striations. Textures drive real UV materials.
for name,col,rough,metal in [('silver_edge',(.52,.57,.60),.28,.88),('bitterglass',(.40,.49,.013),.19,.08),('brushed_gold',(.58,.33,.063),.32,.88),('burgundy_leather',(.09,.018,.044),.83,0)]:
    rng=np.random.default_rng(47+len(mats)); n=512; yy,xx=np.mgrid[0:n,0:n]
    noise=rng.random((n,n)); grain=np.sin(xx*.61+np.sin(yy*.07)*2)*.035
    waves=np.sin(xx*.034+yy*.057)*np.cos(yy*.019)*.10
    value=.88+noise*.19+waves+grain
    if name=='silver_edge':
        fracture=np.abs(np.sin(xx*.055+yy*.023+np.sin(yy*.074)*.72))
        value*=np.where(fracture<.048,.46,1.0)
        value+=np.sin(xx*.11+yy*.17)*.045
    if name=='burgundy_leather':
        value*=1.5
    if name=='bitterglass': value=.68+noise*.13+.36*np.abs(np.sin(xx*.021+yy*.032)*np.cos(xx*.045-yy*.012))
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

def plate(name,polygon,y,thick,mat='silver_edge'):
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
    return mesh(name,vs,fs,'bitterglass')

def cyl(name,z,r,depth,mat,n=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=depth,location=(0,0,z));ob=bpy.context.object;ob.name=name;ob.data.materials.append(mats[mat]);return ob

def ribbon(name,z0,z1,r,turns,width,mat):
    vs=[];steps=int(turns*24)
    for i in range(steps+1):
        t=i/steps;ang=t*turns*math.tau
        for dz in [-width/2,width/2]: vs.append((r*math.cos(ang),r*math.sin(ang),z0+(z1-z0)*t+dz))
    return mesh(name,vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(steps)],mat)

def stud(x,y,z):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.008,location=(x,y,z));ob=bpy.context.object;ob.name='Bronze_rivet';ob.data.materials.append(mats['brushed_gold'])

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

def blade_strip(name,width_scale,y,mat):
    # Arcing saber silhouette with taper at tip, diamond section and spine.
    pts=[(0,.15,.059),(.002,.22,.065),(.010,.32,.064),(.028,.42,.060),(.063,.52,.055),(.111,.62,.046),(.171,.72,.03),(.245,.805,0)]
    vs=[]
    for x,z,w in pts:
        w=max(w*width_scale,.0005)
        vs.extend([(x-w,y,z),(x,y-.008,z),(x+w,y,z),(x,y+.008,z)])
    fs=[(3,2,1,0)]
    for i in range(len(pts)-1):
        for j in range(4):fs.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
    fs.append(tuple(range((len(pts)-1)*4,len(pts)*4)))
    return mesh(name,vs,fs,mat)

glass=mats['bitterglass'].copy();glass.name='Clear_alchemical_chamber';mats['clear_reagent_glass']=glass
bs=glass.node_tree.nodes.get('Principled BSDF')
for socket in ['Base Color','Normal','Roughness','Metallic']:
    for link in list(bs.inputs[socket].links):glass.node_tree.links.remove(link)
bs.inputs['Base Color'].default_value=(.68,.83,.26,1);bs.inputs['Roughness'].default_value=.12;bs.inputs['Metallic'].default_value=0;bs.inputs['Transmission Weight'].default_value=.92;bs.inputs['IOR'].default_value=1.45
records=[]
for typ in ['poison-saber','alchemical-crossbow']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    out=OUT/typ;out.mkdir(exist_ok=True)
    cyl('Burgundy_grip',0,.028,.215,'burgundy_leather')
    for sign in [-1,1]:ribbon('Cross_laced_grip',-.102,.10,.0305,sign*0+5 if sign>0 else 5,.008,'burgundy_leather')
    # Cross braid pairs use opposing helices, not merely painted diamonds.
    braid=ribbon('Counter_braid',-.10,.10,.032,5,.006,'burgundy_leather');braid.scale.x=-1
    for z in [-.113,.115]:
        cyl('Engraved_gold_ferrule',z,.039,.026,'brushed_gold')
        for j in range(8):a=j*math.tau/8;stud(.040*math.cos(a),.040*math.sin(a),z)
    ring=tube('Pommel_ring',[(.039*math.cos(i*math.tau/32),0,-.17+.045*math.sin(i*math.tau/32)) for i in range(33)],.008,'brushed_gold')
    if typ=='poison-saber':
        blade_strip('Silver_curved_cutting_blade',1,0,'silver_edge')
        blade_strip('Sealed_green_alchemical_inlay',.69,-.009,'bitterglass')
        # Layered asymmetric filigree guard: no stock cross guard silhouette.
        shape=[(-.070,.115),(-.083,.145),(-.069,.174),(-.043,.19),(-.055,.225),(-.015,.211),(.021,.239),(.045,.21),(.07,.182),(.055,.145),(.071,.119),(.025,.126),(0,.106)]
        plate('Gold_guard_escutcheon',shape,-.015,.012,'brushed_gold')
        plate('Green_guard_aperture',[(x*.7,z*.65+.06) for x,z in shape],-.029,.006,'bitterglass')
        for sign in [-1,1]:
            pts=[(sign*(.029+.048*math.cos(t)), -.038,.167+.041*math.sin(t)) for t in [i*.15 for i in range(32)]]
            tube('Guard_scroll',pts,.004,'brushed_gold')
        tube('Finger_guard',[(.057+.038*math.cos(t),0,.090+.056*math.sin(t)) for t in [i*math.tau/32 for i in range(33)]],.007,'brushed_gold')
        orb('Pommel_reagent_phial',(.025,0,-.257),.027,'bitterglass');cyl('Phial_cap',-.226,.02,.016,'brushed_gold')
        for j in range(5):
            x=(j-2)*.009;plate('Silk_tassel_'+str(j),[(x-.006,-.287),(x+.006,-.287),(x+.011,-.36),(x-.011,-.352)],0,.002,'burgundy_leather')
        top=.805
    else:
        # Mechanical orb focus: offset pistol grip, polar barrel and reagent cage.
        for o in list(scene.objects):o.location.x-=.115;o.rotation_euler[1]=-.37
        shell=orb('Thin_glass_reagent_chamber',(0,0,.32),.14,'clear_reagent_glass');wall=shell.modifiers.new('Glass_wall_3mm','SOLIDIFY');wall.thickness=.003
        # Separate lower liquid volume with an explicit level surface.
        vs=[];faces=[];seg=24;rings=12;r=.127;start=math.acos(.018/r)
        for k in range(rings+1):
            theta=start+(math.pi-start)*k/rings
            for j in range(seg):a=j*math.tau/seg;vs.append((r*math.sin(theta)*math.cos(a),r*math.sin(theta)*math.sin(a),.32+r*math.cos(theta)))
        faces.append(tuple(range(seg-1,-1,-1)))
        for k in range(rings):
            for j in range(seg):faces.append((k*seg+j,k*seg+(j+1)%seg,(k+1)*seg+(j+1)%seg,(k+1)*seg+j))
        mesh('Distinct_green_reagent_liquid',vs,faces,'bitterglass')
        for j,(x,y,z,radius) in enumerate([(-.04,-.04,.368,.016),(.042,.018,.386,.013),(.01,-.017,.418,.009),(-.024,.055,.358,.011)]):orb('Internal_reagent_bubble_'+str(j),(x,y,z),radius,'clear_reagent_glass')
        # Multiple cage ribs and equator band arranged around chamber.
        for j in range(6):
            a=j*math.tau/6
            pts=[(.149*math.sin(t)*math.cos(a),.149*math.sin(t)*math.sin(a),.32+.149*math.cos(t)) for t in [i*math.pi/24 for i in range(25)]]
            tube('Gold_chamber_rib_'+str(j),pts,.006,'brushed_gold')
        tube('Equatorial_frame',[(.154*math.cos(t),.154*math.sin(t),.32) for t in [i*math.tau/40 for i in range(41)]],.008,'brushed_gold')
        for j in range(12):a=j*math.tau/12;stud(.154*math.cos(a),.154*math.sin(a),.32)
        for z,r,d in [(.16,.052,.04),(.48,.065,.034),(.513,.052,.029),(.54,.043,.026),(.60,.024,.12),(.666,.030,.014),(.72,.009,.10)]:cyl('Pressure_barrel',z,r,d,'brushed_gold')
        cyl('Dark_barrel_collar',.57,.039,.06,'burgundy_leather')
        for j in range(8):a=j*math.tau/8;stud(.039*math.cos(a),.039*math.sin(a),.56)
        tube('Pressure_return_tube',[(-.13,0,.12),(-.19,0,.16),(-.20,0,.24),(-.18,0,.32),(-.13,0,.38)],.012,'brushed_gold')
        # Two small side reagent capsules establish apparatus function.
        for x in [-.11,.11]:
            ob=cyl('Side_ampoule',.40,.015,.12,'bitterglass');ob.location.x=x;ob.location.y=.106
            for z in [.34,.46]:ob=cyl('Ampoule_cap',z,.019,.015,'brushed_gold');ob.location.x=x;ob.location.y=.106
        top=.77
    sockets(top);bpy.context.view_layer.update();obs=list(scene.objects);uv_all(obs)
    for o in obs:
        if o.type=='MESH':o['reference']='reference-047'
    pts=[o.matrix_world@v.co for o in obs if o.type=='MESH' for v in o.data.vertices];dims=[round(max(p[i] for p in pts)-min(p[i] for p in pts),4) for i in range(3)]
    bpy.ops.wm.save_as_mainfile(filepath=str(out/(typ+'.blend')));export(out/(typ+'.glb'),obs)
    for level,ratio in [(1,.55),(2,.28)]:
        clones=[]
        for o in obs:
            if o.type!='MESH':continue
            cp=o.copy();cp.data=o.data.copy();scene.collection.objects.link(cp);clones.append(cp);de=cp.modifiers.new('LOD_simplification','DECIMATE');de.ratio=ratio
        export(out/(typ+'_lod%d.glb'%level),clones)
        for o in clones:bpy.data.objects.remove(o,do_unlink=True)
    hull=mesh('UCX_'+typ,[tuple(p) for p in pts],[],'silver_edge');hull.data.materials.clear();bpy.context.view_layer.objects.active=hull;bpy.ops.object.select_all(action='DESELECT');hull.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.convex_hull();bpy.ops.object.mode_set(mode='OBJECT');export(out/(typ+'_collision.glb'),[hull]);bpy.data.objects.remove(hull,do_unlink=True)
    renders=[]
    for title,view in [('front',(0,-3,.15)),('side',(3,0,.15)),('hero',(1,-3,1))]:
        path=out/(title+'.png');camera_view(path,obs,view);renders.append(str(path.relative_to(ROOT)))
    rel=lambda f:str((out/f).relative_to(ROOT))
    record={'id':'prod-o08-'+typ,'archetypeId':'prod-o08-'+typ,'name':typ.replace('-',' ').title(),'type':'static_equipment','status':'PRODUCTION_CANDIDATE_UNREVIEWED','files':{'blend':rel(typ+'.blend'),'glb':rel(typ+'.glb'),'lod1':rel(typ+'_lod1.glb'),'lod2':rel(typ+'_lod2.glb'),'collision':rel(typ+'_collision.glb'),'textures':texture_paths,'renders':renders},'dimensionsMeters':dims,'dimensionsCoordinateSystem':'BLENDER_Z_UP','rig':'NOT_APPLICABLE_STATIC_WEAPON','animations':[],'remainingGates':['Owner reference-047 art review','Carried/stowed character fit','Damaged state','KHR_materials_transmission renderer parity and reference optical review','Engine import/runtime parity','Gameplay collision and LOD checks','Saber charm secondary motion and alchemical focus firing VFX/audio']};records.append(record)
import struct
for record in records:
    counts={}
    for key in ['glb','lod1','lod2','collision']:
        data=(ROOT/record['files'][key]).read_bytes();size=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+size]);counts[key]=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
    record['triangles']=counts
(OUT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'familyId':'asset-o08-e-weapons-family','referenceIds':['reference-047'],'assets':records},indent=2)+'\n')
canvas=np.ones((1800,2160,4),dtype=np.float32)
for row,record in enumerate(records):
    for col,path in enumerate(record['files']['renders']):
        im=bpy.data.images.load(str(ROOT/path));canvas[(1-row)*900:(2-row)*900,col*720:(col+1)*720,:]=np.array(im.pixels[:]).reshape((900,720,4))
contact=bpy.data.images.new('Bitterglass_contact_sheet',2160,1800);contact.pixels.foreach_set(canvas.ravel());contact.filepath_raw=str(OUT/'contact-sheet.png');contact.file_format='PNG';contact.save()
