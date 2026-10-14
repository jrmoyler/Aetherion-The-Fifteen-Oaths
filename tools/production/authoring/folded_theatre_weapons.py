"""Deterministic authored Folded Theatre weapons. Blender 4.3 background Python.
Reference-037 observed 2026-10-13. New art is unreviewed, not source replacement.
"""
import bpy, math, random, json, os
from mathutils import Vector
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/production/oath-13/weapons'; OUT.mkdir(parents=True,exist_ok=True)
random.seed(47)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene; scene.render.threads_mode='FIXED';scene.render.threads=2; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
mats={}; texture_paths=[]
# 512px tileable surface maps: mottled stone, directional leather grain,
# scratched bronze and mineral striations. Textures drive real UV materials.
for name,col,rough,metal in [('mirror_silver',(.67,.76,.84),.16,.95),('ivory_enamel',(.72,.66,.52),.31,.20),('aged_gold',(.51,.31,.09),.32,.85),('navy_cloth',(.015,.037,.066),.85,0),('red_silk',(.24,.023,.024),.74,0)]:
    rng=np.random.default_rng(47+len(mats)); n=512; yy,xx=np.mgrid[0:n,0:n]
    noise=rng.random((n,n)); grain=np.sin(xx*.61+np.sin(yy*.07)*2)*.035
    waves=np.sin(xx*.034+yy*.057)*np.cos(yy*.019)*.10
    value=.88+noise*.19+waves+grain
    if name=='mirror_silver':
        value=np.ones((n,n))*.97+noise*.012
    if name=='navy_cloth':
        value*=1.5
    if name=='ivory_enamel': value=.97+noise*.025
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

def plate(name,polygon,y,thick,mat='mirror_silver'):
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
    return mesh(name,vs,fs,'ivory_enamel')

def cyl(name,z,r,depth,mat,n=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=depth,location=(0,0,z));ob=bpy.context.object;ob.name=name;ob.data.materials.append(mats[mat]);return ob

def ribbon(name,z0,z1,r,turns,width,mat):
    vs=[];steps=int(turns*24)
    for i in range(steps+1):
        t=i/steps;ang=t*turns*math.tau
        for dz in [-width/2,width/2]: vs.append((r*math.cos(ang),r*math.sin(ang),z0+(z1-z0)*t+dz))
    return mesh(name,vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(steps)],mat)

def stud(x,y,z):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.008,location=(x,y,z));ob=bpy.context.object;ob.name='Bronze_rivet';ob.data.materials.append(mats['aged_gold'])

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
    bpy.ops.object.camera_add();cam=bpy.context.object;cam.location=mid+Vector(view);cam.rotation_euler=(mid-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=max(max(v[i] for v in verts)-min(v[i] for v in verts) for i in range(3))*1.30;scene.camera=cam
    lamps=[]
    for pos,power,size in [((-1,-2,2),180,2),((2,0,1),110,1.5),((0,2,2),220,1)]:
        bpy.ops.object.light_add(type='AREA',location=mid+Vector(pos));li=bpy.context.object;li.data.energy=power;li.data.shape='DISK';li.data.size=size;li.rotation_euler=(mid-li.location).to_track_quat('-Z','Y').to_euler();lamps.append(li)
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=96;scene.cycles.use_denoising=False;scene.render.resolution_x=720;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.32,.34,.38,1);scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.7;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(path);scene.view_settings.view_transform='AgX';bpy.ops.render.render(write_still=True)
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

def gem(name,pos,scale,mat):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=pos);ob=bpy.context.object;ob.name=name;ob.scale=scale;ob.data.materials.append(mats[mat]);return ob

def diamondshaft(name,z0,z1,r,mat):
    vs=[(-r,0,z0),(0,-r*.55,z0),(r,0,z0),(0,r*.55,z0),(-r*.02,0,z1),(0,-r*.02,z1),(r*.02,0,z1),(0,r*.02,z1)];return mesh(name,vs,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],mat)
def trim(name,pts):return tube(name,pts,.0025,'aged_gold',6)
def tassel(pos):
    x,y,z=pos
    tube('Tassel_ring',[(x+.012*math.cos(t),y,z+.012*math.sin(t)) for t in [i*math.tau/24 for i in range(25)]],.0025,'aged_gold')
    for j in range(4):dx=(j-1.5)*.005;plate('Red_silk_tassel',[(x-.003,z-.01),(x+.003,z-.01),(x+dx+.004,z-.074),(x+dx-.004,z-.078)],y,.001,'red_silk')
def codex_rig(binds):
    bpy.ops.object.armature_add();arm=bpy.context.object;arm.name='Codex_hinge_rig';bpy.ops.object.mode_set(mode='EDIT');arm.data.edit_bones.remove(arm.data.edit_bones[0])
    for name,x,parent in [('spine',0,None),('left_wing',-.09,'spine'),('right_center',0,'spine'),('right_wing',.09,'right_center')]:
        b=arm.data.edit_bones.new(name);b.head=(x,0,0);b.tail=(x,0,.12)
        if parent:b.parent=arm.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for ob,bone in binds:
        ob.parent=arm;vg=ob.vertex_groups.new(name=bone);vg.add(list(range(len(ob.data.vertices))),1,'REPLACE');mod=ob.modifiers.new('Rigid_panel_skin','ARMATURE');mod.object=arm
    for name,angle in [('left_wing',-3.02),('right_center',3.02),('right_wing',-3.02)]:
        b=arm.pose.bones[name];b.rotation_mode='XYZ'
        for frame,value in [(1,0),(24,angle),(48,0)]:b.rotation_euler[1]=value;b.keyframe_insert(data_path='rotation_euler',frame=frame,group=name)
    arm.animation_data.action.name='Codex_fold_open_demo';scene.frame_end=48;scene.frame_set(1);return arm,{'name':'Codex_fold_open_demo','frames':48,'fps':24,'status':'HINGE_DEMONSTRATION_UNREVIEWED'}
records=[]
for typ in ['ceremonial-rapier','mirrored-baton','mirror-codex']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);out=OUT/typ;out.mkdir(exist_ok=True);arm=None;clip=None
    if typ!='mirror-codex':
        cyl('Navy_wrapped_grip',0,.017,.145,'navy_cloth');ribbon('Diamond_grip_braid',-.069,.068,.019,5,.006,'navy_cloth')
        for z in [-.08,.08]:cyl('Gold_grip_ferrule',z,.023,.013,'aged_gold')
        gem('Ivory_diamond_pommel',(0,0,-.111),(.023,.02,.026),'ivory_enamel');tassel((.018,0,-.13))
    if typ=='ceremonial-rapier':
        gem('Faceted_mirror_guard',(0,0,.14),(.064,.034,.062),'mirror_silver')
        for angle in [0,math.pi/2]:
            pts=[]
            for i in range(49):t=i*math.tau/48;pts.append((.088*math.cos(t)*math.cos(angle),.088*math.cos(t)*math.sin(angle),.14+.104*math.sin(t)))
            tube('Orbital_gold_guard',pts,.004,'aged_gold')
        for sign in [-1,1]:trim('Guard_diamond_border',[(0,-.037,.204),(sign*.067,-.037,.14),(0,-.037,.077)])
        diamondshaft('Faceted_mirror_rapier_blade',.21,1.013,.023,'mirror_silver')
        for i in range(7):
            z=.22+i*.095;r=.022*(1-(z-.21)/.75);trim('Alternating_gold_blade_inlay',[(-r,-r*.55,z),(r*.78,-r*.55,z+.044),(-r*.7,-r*.55,z+.088)])
        top=1.013
    elif typ=='mirrored-baton':
        #42cm main body excluding silk tassel, two navy end grips.
        for o in list(scene.objects):o.location.z-=.04
        cyl('Eight_facet_mirror_shaft',.025,.019,.23,'mirror_silver',8)
        cyl('Upper_navy_grip',.168,.019,.066,'navy_cloth');ribbon('Gold_cross_binding',.139,.196,.021,2,.004,'aged_gold')
        for z in [-.092,.144,.201]:cyl('Baton_end_ferrule',z,.025,.010,'aged_gold')
        gem('Upper_ivory_endcap',(0,0,.22),(.024,.022,.022),'ivory_enamel')
        for side in [-1,1]:
            for i in range(4):z=-.085+i*.055;trim('Mirror_shaft_diagonal',[(side*.014,-.014,z),(-side*.014,-.014,z+.054)])
        top=.244
    else:
        binds=[]
        for i,(center,bone) in enumerate([(-.135,'left_wing'),(-.045,'spine'),(.045,'right_center'),(.135,'right_wing')]):
            before=set(scene.objects)
            plate('Navy_panel_back_'+str(i),[(center-.044,0),(center+.044,0),(center+.044,.12),(center-.044,.12)],.006,.004,'navy_cloth')
            # Triangulated raised mirror facet network on the front plane.
            vs=[(center-.040,-.001,.006),(center+.040,-.001,.006),(center+.040,-.001,.114),(center-.040,-.001,.114),(center-.006,-.009,.051),(center+.015,-.007,.090)]
            mesh('Mirror_facet_panel_'+str(i),vs,[(0,1,4),(1,2,5),(1,5,4),(2,3,5),(3,4,5),(3,0,4)],'mirror_silver')
            trim('Gold_panel_frame',[(center-.043,-.005,.003),(center+.043,-.005,.003),(center+.043,-.005,.117),(center-.043,-.005,.117),(center-.043,-.005,.003)])
            trim('Diagonal_ivory_border',[(center-.039,-.006,.003),(center+.039,-.006,.114)])
            if i in [0,3]:plate('Ivory_enamel_corner',[(center-.04,.009),(center-.04,.112),(center+.025,.112)],-.008,.002,'ivory_enamel')
            for x in [center-.043,center+.043]:
                for z in [.016,.104]:ob=cyl('Gold_hinge_barrel',z,.004,.013,'aged_gold',8);ob.location.x=x
            for ob in set(scene.objects)-before:
                if ob.type=='MESH':binds.append((ob,bone))
        arm,clip=codex_rig(binds);top=.12
    sockets(top);bpy.context.view_layer.update();obs=list(scene.objects);uv_all(obs)
    for o in obs:
        if o.type=='MESH':o['reference']='reference-037'
    pts=[o.matrix_world@v.co for o in obs if o.type=='MESH' for v in o.data.vertices];dims=[round(max(p[i] for p in pts)-min(p[i] for p in pts),4) for i in range(3)]
    bpy.ops.wm.save_as_mainfile(filepath=str(out/(typ+'.blend')));export(out/(typ+'.glb'),obs)
    for level,ratio in [(1,.55),(2,.28)]:
        clones=[]
        for o in obs:
            if o.type!='MESH':continue
            cp=o.copy();cp.data=o.data.copy();scene.collection.objects.link(cp);clones.append(cp);de=cp.modifiers.new('LOD_simplification','DECIMATE');de.ratio=ratio
        export(out/(typ+'_lod%d.glb'%level),clones+([arm] if arm else []))
        for o in clones:bpy.data.objects.remove(o,do_unlink=True)
    hull=mesh('UCX_'+typ,[tuple(p) for p in pts],[],'mirror_silver');hull.data.materials.clear();bpy.context.view_layer.objects.active=hull;bpy.ops.object.select_all(action='DESELECT');hull.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.convex_hull();bpy.ops.object.mode_set(mode='OBJECT');export(out/(typ+'_collision.glb'),[hull]);bpy.data.objects.remove(hull,do_unlink=True)
    renders=[]
    for title,view in [('front',(0,-3,.15)),('side',(3,0,.15)),('hero',(1,-3,1))]:
        path=out/(title+'.png');camera_view(path,obs,view);renders.append(str(path.relative_to(ROOT)))
    if arm:
        scene.frame_set(20);camera_view(out/'hinge-pose.png',obs,(1,-3,1));scene.frame_set(1)
    rel=lambda f:str((out/f).relative_to(ROOT))
    record={'id':'prod-o13-'+typ,'archetypeId':'prod-o13-'+typ,'name':typ.replace('-',' ').title(),'type':'articulated_equipment' if arm else 'static_equipment','status':'PRODUCTION_CANDIDATE_UNREVIEWED','files':{'blend':rel(typ+'.blend'),'glb':rel(typ+'.glb'),'lod1':rel(typ+'_lod1.glb'),'lod2':rel(typ+'_lod2.glb'),'collision':rel(typ+'_collision.glb'),'textures':texture_paths,'renders':renders},'dimensionsMeters':dims,'dimensionsCoordinateSystem':'BLENDER_Z_UP','rig':{'status':'CANDIDATE_WEIGHTED','boneCount':len(arm.data.bones)} if arm else 'NOT_APPLICABLE_STATIC_WEAPON','animations':[clip] if arm else [],'remainingGates':['Owner reference-037 art review','Carried/stowed character fit','Damaged state','Polished mirror renderer/environment reflection parity','Engine import/runtime parity','Gameplay collision and LOD checks','Codex hinge closure clearances, secondary tassel motion and sound/VFX']};records.append(record)
import struct
for record in records:
    counts={}
    for key in ['glb','lod1','lod2','collision']:
        data=(ROOT/record['files'][key]).read_bytes();size=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+size]);counts[key]=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
    record['triangles']=counts
    if record['id'].endswith('mirror-codex'):record['files']['animationPreview']=str((OUT/'mirror-codex/hinge-pose.png').relative_to(ROOT))
(OUT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'familyId':'asset-o13-e-weapons-family','referenceIds':['reference-036','reference-037'],'assets':records},indent=2)+'\n')
canvas=np.ones((2700,2160,4),dtype=np.float32)
for row,record in enumerate(records):
    for col,path in enumerate(record['files']['renders']):
        im=bpy.data.images.load(str(ROOT/path));canvas[(2-row)*900:(3-row)*900,col*720:(col+1)*720,:]=np.array(im.pixels[:]).reshape((900,720,4))
contact=bpy.data.images.new('Folded_Theatre_contact_sheet',2160,2700);contact.pixels.foreach_set(canvas.ravel());contact.filepath_raw=str(OUT/'contact-sheet.png');contact.file_format='PNG';contact.save()
