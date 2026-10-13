"""Deterministic authored Sanguine Covenant weapons. Blender 4.3 background Python.
Reference-039 observed 2026-10-13. New art is unreviewed, not source replacement.
"""
import bpy, math, random, json, os
from mathutils import Vector
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/production/oath-12/weapons'; OUT.mkdir(parents=True,exist_ok=True)
random.seed(47)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene; scene.render.threads_mode='FIXED';scene.render.threads=2; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
mats={}; texture_paths=[]
# 512px tileable surface maps: mottled stone, directional leather grain,
# scratched bronze and mineral striations. Textures drive real UV materials.
for name,col,rough,metal in [('ivory_gold',(.57,.43,.25),.34,.78),('crimson_glass',(.36,.006,.008),.19,.12),('dark_steel',(.043,.034,.029),.36,.70),('red_leather',(.13,.019,.013),.85,0)]:
    rng=np.random.default_rng(47+len(mats)); n=512; yy,xx=np.mgrid[0:n,0:n]
    noise=rng.random((n,n)); grain=np.sin(xx*.61+np.sin(yy*.07)*2)*.035
    waves=np.sin(xx*.034+yy*.057)*np.cos(yy*.019)*.10
    value=.88+noise*.19+waves+grain
    if name=='ivory_gold':
        fracture=np.abs(np.sin(xx*.055+yy*.023+np.sin(yy*.074)*.72))
        value*=np.where(fracture<.009,.78,1.0)
        value+=np.sin(xx*.11+yy*.17)*.045
    if name=='red_leather':
        value*=1.5
    if name=='crimson_glass': value=.68+noise*.13+.36*np.abs(np.sin(xx*.021+yy*.032)*np.cos(xx*.045-yy*.012))
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

def plate(name,polygon,y,thick,mat='ivory_gold'):
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
    return mesh(name,vs,fs,'crimson_glass')

def cyl(name,z,r,depth,mat,n=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=depth,location=(0,0,z));ob=bpy.context.object;ob.name=name;ob.data.materials.append(mats[mat]);return ob

def ribbon(name,z0,z1,r,turns,width,mat):
    vs=[];steps=int(turns*24)
    for i in range(steps+1):
        t=i/steps;ang=t*turns*math.tau
        for dz in [-width/2,width/2]: vs.append((r*math.cos(ang),r*math.sin(ang),z0+(z1-z0)*t+dz))
    return mesh(name,vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(steps)],mat)

def stud(x,y,z):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.008,location=(x,y,z));ob=bpy.context.object;ob.name='Bronze_rivet';ob.data.materials.append(mats['dark_steel'])

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

def bind(ob,bone): binding.append((ob,bone));return ob

def segment(name,a,b,r,mat):return tube(name,[a,b],r,mat,8)
def jewel(name,pos,sx,sy,sz):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=pos);o=bpy.context.object;o.name=name;o.scale=(sx,sy,sz);o.data.materials.append(mats['crimson_glass']);return o

def build_rig(defs,binds,typ):
    bpy.ops.object.armature_add();arm=bpy.context.object;arm.name=typ+'_articulation';bpy.ops.object.mode_set(mode='EDIT');arm.data.edit_bones.remove(arm.data.edit_bones[0])
    for name,head,tail,parent in defs:
        b=arm.data.edit_bones.new(name);b.head=head;b.tail=tail
        if parent:b.parent=arm.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for ob,name in binds:
        ob.parent=arm;vg=ob.vertex_groups.new(name=name);vg.add(list(range(len(ob.data.vertices))),1,'REPLACE');mod=ob.modifiers.new('Articulated_attachment','ARMATURE');mod.object=arm
    action_name='Lash_flex_demo' if typ=='blood-lash' else 'Gauntlet_grasp_demo'
    for b in arm.pose.bones:
        b.rotation_mode='XYZ'
        for frame,angle in [(1,0),(16,.30 if typ=='blood-lash' else .48),(32,0)]:
            b.rotation_euler[0]=angle if b.name!='root' else 0;b.keyframe_insert(data_path='rotation_euler',frame=frame,group=b.name)
    arm.animation_data.action.name=action_name;scene.frame_end=32;scene.frame_set(1)
    return arm,{'name':action_name,'frames':32,'fps':24,'status':'AUTHORING_DEMONSTRATION_UNREVIEWED'}
records=[]
for typ in ['blood-lash','blood-gauntlet']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);out=OUT/typ;out.mkdir(exist_ok=True);binding=[];
    for action in list(bpy.data.actions):bpy.data.actions.remove(action)
    bone_defs=[('root',(0,0,-.1),(0,0,.02),None)]
    if typ=='blood-lash':
        bind(cyl('Leather_sickle_grip',0,.025,.20,'red_leather'),'root');bind(ribbon('Red_grip_lace',-.095,.09,.029,5,.010,'red_leather'),'root')
        for z in [-.113,.11]:bind(cyl('Ivory_gold_grip_collar',z,.041,.031,'ivory_gold'),'root')
        # Crescent sickle: crescent annular band tapering to two acute tips.
        vs=[];N=24
        for i in range(N+1):
            t=i/N;ang=-1.18+t*3.83;r=.135;width=.043*math.sin(math.pi*t)**.55
            for inner in [-1,1]:vs.append((-.05+(r+inner*width)*math.cos(ang),-.006,.222+(r+inner*width)*math.sin(ang)))
        sickle=mesh('Curved_blood_enamel_sickle',vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(N)],'crimson_glass');sol=sickle.modifiers.new('Sickle_thickness','SOLIDIFY');sol.thickness=.012;bind(sickle,'root')
        for side in [-1,1]:bind(tube('Ivory_sickle_sharpened_edge',[vs[2*i+(1 if side>0 else 0)] for i in range(N+1)],.006,'ivory_gold'),'root')
        bind(jewel('Hilt_crimson_lens',(0,-.034,.113),.032,.020,.042),'root')
        # Explicit curved rest-chain with twelve articulated leather segments.
        points=[(0,0,-.14)]
        for i in range(1,13):
            t=i/12;points.append((.24*math.sin(t*math.tau*.78)+.19*t,.0,-.14-.62*t))
        for i in range(12):
            name='lash_%02d'%i;bone_defs.append((name,points[i],points[i+1],'root' if i==0 else 'lash_%02d'%(i-1)))
            bind(segment('Thorned_lash_segment_%02d'%i,points[i],points[i+1],.018,'red_leather'),name)
            a=Vector(points[i]);b=Vector(points[i+1]);m=(a+b)/2
            for side in [-1,1]:
                thorn=plate('Leather_barb',[(m.x,m.z+.024),(m.x+side*.030,m.z+.026),(m.x+side*.016,m.z-.018)],-.006,.006,'red_leather');bind(thorn,name)
        bind(jewel('Weighted_lash_terminal',points[-1],.027,.02,.065),'lash_11');top=.4
    else:
        # Hollow forearm cuff with intentionally separated wrist/palm/fingers.
        vs=[];N=16
        for z,rx,ry in [(-.20,.072,.052),(-.02,.050,.039)]:
            for i in range(N):a=i*math.tau/N;vs.append((rx*math.cos(a),ry*math.sin(a),z))
        cuff=mesh('Crimson_forearm_cuff',vs,[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)],'crimson_glass');so=cuff.modifiers.new('Cuff_wall','SOLIDIFY');so.thickness=.004;bind(cuff,'root')
        for z,rx,ry in [(-.20,.073,.053),(-.03,.054,.042),(-.115,.063,.047)]:bind(tube('Cuff_ivory_binding',[(rx*math.cos(i*math.tau/32),ry*math.sin(i*math.tau/32),z) for i in range(33)],.006,'ivory_gold'),'root')
        for j in range(4):a=j*math.tau/4;bind(tube('Cuff_longitudinal_trim',[(.072*math.cos(a),.053*math.sin(a),-.20),(.052*math.cos(a),.040*math.sin(a),-.03)],.004,'ivory_gold'),'root')
        palm=plate('Fitted_leather_palm',[(-.048,-.022),(.047,-.022),(.066,.075),(.053,.128),(-.057,.125),(-.066,.06)],.02,.056,'red_leather');bind(palm,'root')
        bind(plate('Ivory_backhand_mount',[(-.056,.019),(0,-.018),(.056,.018),(.058,.08),(0,.139),(-.058,.08)],-.039,.009,'ivory_gold'),'root');bind(jewel('Sealed_crimson_backhand_lens',(0,-.063,.066),.042,.025,.061),'root')
        for f,x in enumerate([-.048,-.016,.017,.047]):
            length=[.117,.135,.127,.103][f];start=Vector((x,0,.12));parent='root'
            for j in range(3):
                a=start+Vector((0,-.011*j,length*j/3));b=start+Vector((0,-.011*(j+1),length*(j+1)/3));name='finger_%d_%d'%(f,j);bone_defs.append((name,tuple(a),tuple(b),parent));parent=name
                bind(segment('Leather_finger_joint',a,b,.012,'red_leather'),name);plate_center=(a+b)/2;bind(plate('Ivory_finger_scale',[(x-.012,plate_center.z-.017),(x+.012,plate_center.z-.017),(x+.01,plate_center.z+.018),(x-.01,plate_center.z+.018)],plate_center.y-.010,.006,'ivory_gold'),name)
                if j==2:bind(segment('Dark_tapered_claw',b,b+Vector((0,-.012,.019)),.010,'dark_steel'),name)
        a=(-.055,.002,.044);b=(-.092,-.004,.085);c=(-.108,-.018,.12);bone_defs.extend([('thumb_0',a,b,'root'),('thumb_1',b,c,'thumb_0')]);bind(segment('Thumb_proximal',a,b,.018,'red_leather'),'thumb_0');bind(segment('Thumb_armor',b,c,.015,'ivory_gold'),'thumb_1');top=.275
    arm,clip=build_rig(bone_defs,binding,typ);
    sockets(top);bpy.context.view_layer.update();obs=list(scene.objects);uv_all(obs)
    for o in obs:
        if o.type=='MESH':o['reference']='reference-039'
    pts=[o.matrix_world@v.co for o in obs if o.type=='MESH' for v in o.data.vertices];dims=[round(max(p[i] for p in pts)-min(p[i] for p in pts),4) for i in range(3)]
    bpy.ops.wm.save_as_mainfile(filepath=str(out/(typ+'.blend')));export(out/(typ+'.glb'),obs)
    for level,ratio in [(1,.55),(2,.28)]:
        clones=[]
        for o in obs:
            if o.type!='MESH':continue
            cp=o.copy();cp.data=o.data.copy();scene.collection.objects.link(cp);clones.append(cp);de=cp.modifiers.new('LOD_simplification','DECIMATE');de.ratio=ratio
        export(out/(typ+'_lod%d.glb'%level),clones+[arm])
        for o in clones:bpy.data.objects.remove(o,do_unlink=True)
    hull=mesh('UCX_'+typ,[tuple(p) for p in pts],[],'ivory_gold');hull.data.materials.clear();bpy.context.view_layer.objects.active=hull;bpy.ops.object.select_all(action='DESELECT');hull.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.convex_hull();bpy.ops.object.mode_set(mode='OBJECT');export(out/(typ+'_collision.glb'),[hull]);bpy.data.objects.remove(hull,do_unlink=True)
    renders=[]
    for title,view in [('front',(0,-3,.15)),('side',(3,0,.15)),('hero',(1,-3,1))]:
        path=out/(title+'.png');camera_view(path,obs,view);renders.append(str(path.relative_to(ROOT)))
    scene.frame_set(16);camera_view(out/'flex-pose.png',obs,(1,-3,1));scene.frame_set(1)
    rel=lambda f:str((out/f).relative_to(ROOT))
    record={'id':'prod-o12-'+typ,'archetypeId':'prod-o12-'+typ,'name':typ.replace('-',' ').title(),'type':'articulated_equipment','status':'PRODUCTION_CANDIDATE_UNREVIEWED','files':{'blend':rel(typ+'.blend'),'glb':rel(typ+'.glb'),'lod1':rel(typ+'_lod1.glb'),'lod2':rel(typ+'_lod2.glb'),'collision':rel(typ+'_collision.glb'),'textures':texture_paths,'renders':renders},'dimensionsMeters':dims,'dimensionsCoordinateSystem':'BLENDER_Z_UP','rig':{'status':'CANDIDATE_WEIGHTED','boneCount':len(arm.data.bones)},'animations':[clip],'remainingGates':['Owner reference-039 art review','Carried/stowed character fit','Damaged state','Crimson enamel and leather reference material review','Engine import/runtime parity','Gameplay collision and LOD checks','Pose deformation review and character retargeting; sound/VFX' ]};records.append(record)
import struct
for record in records:
    counts={}
    for key in ['glb','lod1','lod2','collision']:
        data=(ROOT/record['files'][key]).read_bytes();size=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+size]);counts[key]=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
    record['triangles']=counts
    record['files']['animationPreview']=str((OUT/record['id'].removeprefix('prod-o12-')/'flex-pose.png').relative_to(ROOT))
(OUT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'familyId':'asset-o12-e-weapons-family','referenceIds':['reference-039'],'assets':records},indent=2)+'\n')
canvas=np.ones((1800,2160,4),dtype=np.float32)
for row,record in enumerate(records):
    for col,path in enumerate(record['files']['renders']):
        im=bpy.data.images.load(str(ROOT/path));canvas[(1-row)*900:(2-row)*900,col*720:(col+1)*720,:]=np.array(im.pixels[:]).reshape((900,720,4))
contact=bpy.data.images.new('Sanguine_Covenant_contact_sheet',2160,1800);contact.pixels.foreach_set(canvas.ravel());contact.filepath_raw=str(OUT/'contact-sheet.png');contact.file_format='PNG';contact.save()
