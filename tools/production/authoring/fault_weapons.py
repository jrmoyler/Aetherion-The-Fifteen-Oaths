"""Deterministic authored Fault Choir weapons. Blender 4.3 background Python.
Reference-053 observed 2026-10-13. New art is unreviewed, not source replacement.
"""
import bpy, math, random, json, os
from mathutils import Vector
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/production/oath-05/weapons'; OUT.mkdir(parents=True,exist_ok=True)
random.seed(53)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene; scene.render.threads_mode='FIXED';scene.render.threads=2; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
mats={}; texture_paths=[]
# 512px tileable surface maps: mottled stone, directional leather grain,
# scratched bronze and mineral striations. Textures drive real UV materials.
for name,col,rough,metal in [('taupe_stone',(.43,.34,.24),.86,0),('amethyst',(.29,.055,.49),.25,0),('aged_bronze',(.34,.18,.065),.39,.83),('dark_leather',(.12,.055,.024),.82,0)]:
    rng=np.random.default_rng(53+len(mats)); n=512; yy,xx=np.mgrid[0:n,0:n]
    noise=rng.random((n,n)); grain=np.sin(xx*.61+np.sin(yy*.07)*2)*.035
    waves=np.sin(xx*.034+yy*.057)*np.cos(yy*.019)*.10
    value=.88+noise*.19+waves+grain
    if name=='taupe_stone':
        fracture=np.abs(np.sin(xx*.055+yy*.023+np.sin(yy*.074)*.72))
        value*=np.where(fracture<.048,.46,1.0)
        value+=np.sin(xx*.11+yy*.17)*.045
    if name=='dark_leather':
        value*=1.5
    if name=='amethyst': value=.72+noise*.09+.29*np.abs(np.sin(xx*.041+yy*.019))
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

def plate(name,polygon,y,thick,mat='taupe_stone'):
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
    return mesh(name,vs,fs,'amethyst')

def cyl(name,z,r,depth,mat,n=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=depth,location=(0,0,z));ob=bpy.context.object;ob.name=name;ob.data.materials.append(mats[mat]);return ob

def ribbon(name,z0,z1,r,turns,width,mat):
    vs=[];steps=int(turns*24)
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

records=[]
for typ in ['amethyst-short-blade','amethyst-seer-mace']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    out=OUT/typ;out.mkdir(exist_ok=True)
    cyl('Grip_core',0,.029,.22,'dark_leather');ribbon('Overlapping_leather_wrap',-.095,.09,.032,6,.026,'dark_leather')
    for z in [-.115,.108]: cyl('Bronze_ferrule',z,.041,.025,'aged_bronze');cyl('Ferrule_bead',z+.014,.043,.005,'aged_bronze')
    crystal('Pommel_core',(0,0,-.12),(0,0,-.24),.040)
    for j in range(5):
        ang=j*math.tau/5;x=.029*math.cos(ang);y=.029*math.sin(ang)
        plate('Pommel_shale_'+str(j),[(x-.025,-.14),(x+.016,-.135),(x+.029,-.182),(x+.013,-.21),(x-.021,-.20)],y,.015)
    if typ=='amethyst-short-blade':
        # Broad stone leaf, exposed central violet seam, tapering point.
        core=crystal('Long_amethyst_insert',(0,0,.14),(0,0,.76),.047);core.scale.y=.70
        for j in range(7):
            z=.21+j*.068
            crystal('Seam_crystal_fracture_'+str(j),(.006*(-1)**j,-.023,z),(.014*(-1)**j,-.041,z+.091),.017+j%3*.004)
        for sign in [-1,1]:
            for side in [-1,1]:
                shapes=[[(.025,.17),(.12,.18),(.134,.28),(.071,.295),(.019,.26)],[(.032,.288),(.126,.286),(.111,.396),(.057,.42),(.027,.37)],[(.032,.401),(.108,.407),(.081,.515),(.028,.542),(.022,.467)],[(.018,.536),(.076,.527),(.049,.627),(.004,.744),(.006,.62)]]
                for j,shape in enumerate(shapes):
                    outline=[(x*sign,z+(0.011*(j%2+1) if sign<0 else 0)) for x,z in shape]
                    a,b=outline[1],outline[2]
                    outline[2:2]=[((a[0]+b[0])*.5-sign*.009,(a[1]+b[1])*.5),((a[0]+b[0])*.5-sign*.017,(a[1]+b[1])*.5+.012)]
                    plate('Blade_shell_%s_%s_%s'%(sign,side,j),outline,side*.020,-side*.026)
        cyl('Guard_collar',.155,.086,.043,'aged_bronze',10)
        for sign in [-1,1]:
            plate('Guard_hook',[(sign*.053,.12),(sign*.125,.12),(sign*.148,.196),(sign*.116,.221),(sign*.104,.159),(sign*.052,.161)],-.044,.015,'aged_bronze')
            for z in [.143,.194]:stud(sign*.111,-.063,z)
        top=.76
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
                ob=plate('Mace_stone_shell_%d_%d'%(j,k),outline,-.079-(k%2)*.01,.025+.008*math.sin(j))
                ob.rotation_euler[2]=a;ob.location.x=.012*math.sin(a)
        for z in [.50,.70]:
            cyl('Head_bronze_binding',z,.119,.017,'aged_bronze',12)
            for j in range(8):a=j*math.tau/8;stud(.12*math.cos(a),.12*math.sin(a),z)
        for sign in [-1,1]:plate('Head_longitudinal_clasp',[(sign*.073,.49),(sign*.099,.51),(sign*.08,.74),(sign*.041,.79),(sign*.04,.752)],-.103,.010,'aged_bronze')
        top=.78
    sockets(top);bpy.context.view_layer.update();obs=list(scene.objects);uv_all(obs)
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
