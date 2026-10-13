"""Reproducible original Tidal weapon candidates; Blender 4.3 CPU authoring.
Run: blender -b -t 2 --python tools/production/authoring/tidal_weapons.py
All geometry and PBR maps authored here; source artwork stays immutable.
"""
import bpy, math, json, os, sys, struct
from pathlib import Path
from mathutils import Vector, Quaternion
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'assets/production/oath-04/weapons'
BASE.mkdir(parents=True,exist_ok=True)
MATS={}; meshes=[]; damaged=[]
def rel(p): return str(Path(p).relative_to(ROOT))
def material(name,color,metal,rough):
    d=BASE/'textures'; d.mkdir(exist_ok=True)
    n=512; y,x=np.mgrid[0:n,0:n]; u=x/n; v=y/n
    rng=np.random.default_rng(104+len(MATS)); noise=rng.random((n,n))-.5
    if name=='Nacre': pattern=.04*np.sin(65*u+10*np.sin(v*12))+.025*np.sin(v*48)+noise*.015
    elif name=='AquaGlass': pattern=.07*np.sin(u*26+np.sin(v*19)*2)+.04*np.sin(v*53+u*7)+noise*.02
    elif name=='NavyCord': pattern=.012*np.sin((u+v)*140)*np.sin((u-v)*140)+noise*.006
    elif name in ('Wood','Bark','BarkLight'): pattern=.05*np.sin(u*190+np.sin(v*14)*3)+.03*np.sin(u*71+v*2)+noise*.025
    elif name in ('Cloth','Fiber'): pattern=.025*np.sin(u*350)*np.sin(v*350)+noise*.014
    elif name=='Starstone': pattern=.018*np.sin(u*25+np.sin(v*18)*3)+(rng.random((n,n))>.9992)*.65+noise*.012
    elif name=='Leaf': pattern=.018*np.sin(u*60+v*30)+noise*.012
    else: pattern=noise*.055+.018*np.sin(v*350)
    mat=bpy.data.materials.new(name); mat.use_nodes=True; nt=mat.node_tree; bs=nt.nodes.get('Principled BSDF')
    if name in ('NavyCord','Red','Wood','Bark','BarkLight','Fiber','Cloth'): bs.inputs['Specular IOR Level'].default_value=.12
    paths=[]
    for kind in ('basecolor','roughness','metallic','normal'):
        a=np.ones((n,n,4),dtype=np.float32)
        if kind=='basecolor': a[:,:,:3]=np.clip(np.array(color)[None,None,:]+pattern[:,:,None],0,1)
        elif kind=='roughness': a[:,:,:3]=np.clip(rough+pattern[:,:,None],.05,.95)
        elif kind=='metallic': a[:,:,:3]=metal
        else:
            dy,dx=np.gradient(pattern); a[:,:,0]=.5-dx*2; a[:,:,1]=.5-dy*2; a[:,:,2]=1
        im=bpy.data.images.new(name+'_'+kind,width=n,height=n); im.pixels.foreach_set(a.ravel()); im.filepath_raw=str(d/(name+'_'+kind+'.png')); im.file_format='PNG'; im.save(); paths.append(rel(im.filepath_raw))
        if kind!='basecolor': im.colorspace_settings.name='Non-Color'
        tex=nt.nodes.new('ShaderNodeTexImage');tex.image=im
        if kind=='normal': normal=nt.nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value=.25;nt.links.new(tex.outputs['Color'],normal.inputs['Color']);nt.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
        else: nt.links.new(tex.outputs['Color'],bs.inputs[{'basecolor':'Base Color','roughness':'Roughness','metallic':'Metallic'}[kind]])
        im.pack()
    # Opaque colored reservoir surface gives deterministic portable glTF material.
    # Transmission/volume remains open until real multi-engine tests.
    MATS[name]=(mat,paths); return mat

def mesh(name,verts,faces,mat):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(MATS[mat][0]);meshes.append(o);return o

def tube(name,points,radius,mat,sides=8):
    verts=[]
    for i,p in enumerate(points):
        p=Vector(p); t=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        t.normalize(); ref=Vector((0,1,0)) if abs(t.y)<.9 else Vector((1,0,0)); a=t.cross(ref).normalized();b=t.cross(a).normalized()
        for j in range(sides): verts.append(p+radius*(a*math.cos(j*math.tau/sides)+b*math.sin(j*math.tau/sides)))
    faces=[]
    for i in range(len(points)-1):
        for j in range(sides): faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces += [tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))]
    return mesh(name,verts,faces,mat)
def ring(name,z,r,mat='Gold',cx=0,cy=0,thick=.008,plane='xy'):
    pts=[]
    for i in range(33):
        a=i*math.tau/32
        pts.append((cx+r*math.cos(a),cy+r*math.sin(a),z) if plane=='xy' else (cx+r*math.cos(a),cy,z+r*math.sin(a)))
    return tube(name,pts,thick,mat)
def sphere(name,loc,scale,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(MATS[mat][0]);meshes.append(o);return o

def shell(name,center,size,angle=0):
    # Curved tapered nacre plate with scalloped tip and thick rim, custom geometry.
    vs=[];rows=7;cols=8
    for layer in range(2):
        for i in range(rows):
            t=i/(rows-1);w=(.12+.88*math.sin(math.pi*(.07+.86*t)))
            for j in range(cols):
                s=j/(cols-1)*2-1;x=s*size[0]*w;z=(t-.5)*size[2];y=size[1]*(1-s*s)*math.sin(math.pi*t)-layer*.009
                z+=.014*math.cos(s*math.pi*3)*t**8
                vs.append((center[0]+x*math.cos(angle)+z*math.sin(angle),center[1]+y,center[2]-x*math.sin(angle)+z*math.cos(angle)))
    fs=[];k=rows*cols
    for layer in range(2):
        for i in range(rows-1):
            for j in range(cols-1):
                a=layer*k+i*cols+j;f=(a,a+1,a+cols+1,a+cols);fs.append(f if not layer else tuple(reversed(f)))
    edge=list(range(cols))+[i*cols+cols-1 for i in range(1,rows)]+list(range(k-2,k-cols-1,-1))+[i*cols for i in range(rows-2,0,-1)]
    for a,b in zip(edge,edge[1:]+edge[:1]):fs.append((a,b,b+k,a+k))
    o=mesh(name,vs,fs,'Nacre');tube(name+'_gold_seam',[vs[i] for i in edge]+[vs[edge[0]]],.003,'Gold',6);return o

def shaft(z0,z1,r=.022):
    tube('Reservoir_shaft',[(0,0,z0),(0,0,z1)],r,'AquaGlass',12)
    for z in (z0,z1,(z0+z1)/2):
        ring('Ferrule',z,r*1.13,thick=.008)
        ring('Navy_inlay',z+.018,r*1.08,'NavyCord',thick=.006)
    for a in (0,math.pi):tube('Shaft_gold_spline',[(r*math.cos(a),r*math.sin(a),z0),(r*math.cos(a),r*math.sin(a),z1)],.003,'Gold',6)
def grip(z0,z1,r=.027):
    tube('Grip_core',[(0,0,z0),(0,0,z1)],r,'NavyCord',12)
    for direction in (-1,1):
        pts=[(r*1.08*math.cos(i*.4),r*1.08*math.sin(i*.4),z0+(z1-z0)*i/100) for i in range(101)]
        if direction==-1:pts=[(x,-y,z) for x,y,z in pts]
        tube('Cross_woven_cord',pts,.004,'NavyCord',5)
    for z in (z0,z1):ring('Grip_collar',z,r*1.05,thick=.009)
def smooth_profile(ps):
    out=[]
    for i in range(len(ps)-1):
        p0=np.array(ps[max(i-1,0)]);p1=np.array(ps[i]);p2=np.array(ps[i+1]);p3=np.array(ps[min(i+2,len(ps)-1)])
        for t in (0,.333333,.666667):out.append(tuple(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)))
    return out+[ps[-1]]

def blade():
    shaft(.15,.60);grip(-.12,.15)
    # Sculpted hooked crescent: broad shoulder narrows into a downward-facing point.
    outer=[(.02,.64),(-.08,.75),(-.22,.81),(-.36,.77),(-.48,.65),(-.55,.47),(-.57,.28)]
    inner=[(-.53,.43),(-.46,.55),(-.35,.62),(-.23,.65),(-.13,.60),(-.06,.56)]
    outer=smooth_profile(outer);inner=smooth_profile(inner)
    prof=outer+inner;vs=[(x,y,z) for y in (-.013,.013) for x,z in prof];n=len(prof)
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh('Crescent_water_glass_edge',vs,fs,'AquaGlass')
    tube('Aged_gold_crescent_spine',[(x,0,z+.012) for x,z in outer[:-1]],.011,'Gold')
    for i in range(4):
        o=shell('Blade_scalloped_nacre_'+str(i),(-.015-i*.061,-.034,.635+i*.027),(.048,.02,.19),-.75-i*.12);damaged.append(o)
    sphere('Blade_guard_heart',(0,-.035,.57),(.033,.025,.045),'AquaGlass');ring('Guard_setting',.57,.039,cx=0,cy=-.045,plane='xz',thick=.005)
    pts=[(.06*math.cos(a),0,-.13+.09*math.sin(a)) for a in np.linspace(math.pi,2.2*math.pi,20)]
    tube('Hooked_shell_pommel',pts,.025,'Nacre');tube('Pommel_lip',[(x,-.025,z) for x,y,z in pts],.005,'Gold')

def staff():
    shaft(-.72,-.32);grip(-.32,-.08);shaft(-.08,.43);shaft(.43,.73)
    sphere('Foot_orb',(0,0,-.81),(.058,.058,.076),'AquaGlass')
    for a in (0,math.pi/2,math.pi,math.pi*1.5):
        tube('Foot_cage',[(.059*math.sin(t)*math.cos(a),.059*math.sin(t)*math.sin(a),-.81+.078*math.cos(t)) for t in np.linspace(0,math.pi,13)],.006,'Gold')
    sphere('Reservoir_orb',(0,0,.94),(.145,.104,.145),'AquaGlass')
    ring('Focus_rim',.94,.166,cy=-.015,plane='xz',thick=.012)
    for i in range(9):
        a=i*math.tau/9
        o=shell('Focus_overlapping_shell_'+str(i),(.135*math.cos(a),.035,.94+.135*math.sin(a)),(.052,.035,.16),-a);damaged.append(o)
    for a in (-.5,.5):
        pts=[(.16*math.cos(t),-.025+math.sin(t)*math.sin(a)*.14,.94+.16*math.sin(t)*math.cos(a)) for t in np.linspace(0,math.tau,33)]
        tube('Orb_armillary_cage',pts,.006,'Gold')
    sphere('Focus_front_jewel',(0,-.12,.94),(.037,.019,.037),'AquaGlass')
    tube('Meridian_pointer',[(0,-.13,.755),(0,-.13,1.13)],.006,'Gold')
    for s in (-1,1):shell('Neck_shell_'+str(s),(s*.034,-.02,.73),(.027,.02,.12),s*.4)
    tassel()
def tassel():
    # Two deform bones distribute the bend across actual hanging navy strands.
    ad=bpy.data.armatures.new('Tassel_armature'); arm=bpy.data.objects.new('Tassel_rig',ad);bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    b=ad.edit_bones.new('tassel_root');b.head=(.17,0,.87);b.tail=(.17,0,.76)
    c=ad.edit_bones.new('tassel_tip');c.head=b.tail;c.tail=(.17,0,.63);c.parent=b;c.use_connect=True;bpy.ops.object.mode_set(mode='OBJECT');arm.select_set(False)
    ring('Tassel_cap',.85,.018,cx=.17,thick=.006)
    for j in range(10):
        a=j*math.tau/10;x=.17+.013*math.cos(a);y=.013*math.sin(a)
        o=tube('Navy_tassel_strand_'+str(j),[(x,y,z) for z in np.linspace(.85,.62,9)],.0035,'NavyCord',5)
        g0=o.vertex_groups.new(name='tassel_root');g1=o.vertex_groups.new(name='tassel_tip')
        for v in o.data.vertices:
            w=max(0,min(1,(.80-v.co.z)/.11));g0.add([v.index],1-w,'REPLACE');g1.add([v.index],w,'REPLACE')
        mod=o.modifiers.new('Tassel_deform','ARMATURE');mod.object=arm;o.parent=arm
    for f,a in [(1,0),(16,.18),(31,0),(46,-.18),(61,0)]:
        for i,p in enumerate(arm.pose.bones):p.rotation_mode='QUATERNION';p.rotation_quaternion=Quaternion(arm.data.bones[p.name].matrix_local.to_3x3().inverted() @ Vector((0,1,0)),a*(1+i*.6));p.keyframe_insert('rotation_quaternion',frame=f,group=p.name)
    arm.animation_data.action.name='Tidal_tassel_sway';bpy.context.scene.frame_end=61;bpy.context.scene.frame_set(1)

def uv_all():
    for o in meshes:
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
        # Hard silhouette with weighted visual normals; no fake hidden subdivision.
        for p in o.data.polygons:p.use_smooth=True

def select_asset():
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type in ('MESH','ARMATURE','EMPTY') and not o.name.startswith('STUDIO'):o.select_set(True)
def export(path):
    select_asset();bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=True,export_frame_range=True,export_force_sampling=True,export_yup=True,export_apply=True)
def render(d,asset):
    sc=bpy.context.scene;sc.render.threads_mode='FIXED';sc.render.threads=2;sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=64;sc.cycles.use_denoising=False;sc.render.resolution_x=640;sc.render.resolution_y=800;sc.render.resolution_percentage=100
    sc.world.color=(.14,.14,.14);sc.view_settings.view_transform='AgX';sc.render.image_settings.file_format='PNG'
    for loc,power,size in [((1,-3,3),450,3),((-2,-1,1),250,2),((0,2,3),500,2)]:
        ld=bpy.data.lights.new('STUDIO_softbox','AREA');lo=bpy.data.objects.new('STUDIO_softbox',ld);bpy.context.collection.objects.link(lo);lo.location=loc;ld.energy=power;ld.shape='DISK';ld.size=size;lo.rotation_euler=(Vector((0,0,.25))-lo.location).to_track_quat('-Z','Y').to_euler()
    ca=bpy.data.cameras.new('STUDIO_camera');co=bpy.data.objects.new('STUDIO_camera',ca);bpy.context.collection.objects.link(co);sc.camera=co;ca.type='ORTHO';ca.ortho_scale=2.25 if asset=='tide-orb-staff' else 1.25
    center=Vector((0,0,.15)) if asset=='tide-orb-staff' else Vector((-.19,0,.31))
    paths=[]
    for view,off in [('front',(0,-4,0)),('side',(4,-.3,0)),('hero',(2,-4,1.3))]:
        co.location=center+Vector(off);co.rotation_euler=(center-co.location).to_track_quat('-Z','Y').to_euler();p=d/(view+'.png');sc.render.filepath=str(p)
        if not (os.environ.get('AETHERION_MOTION_ONLY')=='1' and p.exists()):bpy.ops.render.render(write_still=True)
        paths.append(rel(p))
    if asset=='tide-orb-staff':
        sc.frame_set(16);p=d/'motion.png';sc.render.filepath=str(p);bpy.ops.render.render(write_still=True);paths.append(rel(p));sc.frame_set(1)
    return paths

def glb_triangles(p):
    b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);return sum(g['accessors'][p['indices']]['count']//3 for m in g.get('meshes',[]) for p in m['primitives'])

def build(asset):
    global meshes,damaged
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);meshes=[];damaged=[];sc=bpy.context.scene;sc.unit_settings.system='METRIC';sc.unit_settings.scale_length=1;sc.render.fps=30
    d=BASE/asset;d.mkdir(exist_ok=True)
    (blade if asset=='crescent-blade' else staff)();uv_all()
    for name,pos in [('socket_grip',(0,0,0)),('socket_back_dock',(0,.04,0))]:
        o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=pos;o['purpose']='PROPOSED human attachment; host skeleton fit gate remains open'
    verts=[o.matrix_world@v.co for o in meshes for v in o.data.vertices];dims=[max(v[i] for v in verts)-min(v[i] for v in verts) for i in range(3)]
    tris=sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons)
    export(d/'lod0.glb')
    for level,ratio in [(1,.6),(2,.3)]:
        for o in meshes:
            m=o.modifiers.new('LOD_candidate','DECIMATE');m.ratio=ratio
        export(d/f'lod{level}.glb')
        for o in meshes:o.modifiers.remove(o.modifiers['LOD_candidate'])
    # Damaged state: lost individual shell plate, exposed structure, scratched gold.
    for o in damaged[:1]:o.hide_set(True);o.hide_render=True
    # export uses explicit selection, so do not select the absent plate.
    select_asset()
    for o in damaged[:1]:o.select_set(False)
    bpy.ops.export_scene.gltf(filepath=str(d/'damaged.glb'),export_format='GLB',use_selection=True,export_animations=True)
    for o in damaged[:1]:o.hide_set(False);o.hide_render=False
    # Carried artifact includes a shellwork docking clasp. Host fitting remains unverified.
    dock=tube('Back_docking_clasp',[(-.045,.045,-.05),(-.045,.045,.05),(.045,.045,.05),(.045,.045,-.05)],.008,'Gold')
    bpy.ops.object.select_all(action='DESELECT');dock.select_set(True);bpy.context.view_layer.objects.active=dock;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project();bpy.ops.object.mode_set(mode='OBJECT');export(d/'stowed.glb');bpy.data.objects.remove(dock,do_unlink=True);meshes.remove(dock)
    # A separate conservative pickup envelope, never authoritative weapon hit geometry.
    bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,.14 if asset=='tide-orb-staff' else .32));col=bpy.context.object;col.name='UCX_pickup_envelope';col.scale=(.4,.3,2.1) if asset=='tide-orb-staff' else (1.2,.18,1.12);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.ops.export_scene.gltf(filepath=str(d/'collision.glb'),export_format='GLB',use_selection=True);bpy.data.objects.remove(col,do_unlink=True)
    renders=render(d,asset);select_asset();bpy.ops.wm.save_as_mainfile(filepath=str(d/(asset+'.blend')))
    return dict(id='tidal-'+asset,archetypeId='tidal-'+asset,name=asset.replace('-',' ').title(),type='equipment',status='PRODUCTION_CANDIDATE_UNREVIEWED',files=dict(blend=rel(d/(asset+'.blend')),glb=rel(d/'lod0.glb'),lod1=rel(d/'lod1.glb'),lod2=rel(d/'lod2.glb'),collision=rel(d/'collision.glb'),textures=[p for m,ps in MATS.values() for p in ps],renders=renders,damaged=rel(d/'damaged.glb'),stowed=rel(d/'stowed.glb')),triangles={k:glb_triangles(d/f) for k,f in [('glb','lod0.glb'),('lod1','lod1.glb'),('lod2','lod2.glb'),('collision','collision.glb')]},dimensionsCoordinateSystem='BLENDER_Z_UP',dimensionsMeters=dims,rig={'type':'two-bone skinned tassel' if asset=='tide-orb-staff' else 'static, intentionally unrigged','bones':2 if asset=='tide-orb-staff' else 0},animations=['Tidal_tassel_sway'] if asset=='tide-orb-staff' else [],remainingGates=['Owner visual approval versus reference-055','Exact human grip and back-socket fit','Damaged-state transition and effect/audio hooks','LOD visual/performance acceptance','Unreal, Godot and Three.js final runtime parity','Glass transmission/volume parity; portable material currently opaque aqua reservoir','Collision gameplay envelope and weapon hit shape acceptance'])
if __name__=='__main__':
    for args in [('Nacre',(.83,.77,.62),.08,.29),('AquaGlass',(.025,.29,.38),.25,.18),('Gold',(.53,.32,.105),.84,.35),('NavyCord',(.012,.035,.12),0,.78)]:material(*args)
    out=[build(a) for a in ('crescent-blade','tide-orb-staff')]
    (BASE/'manifest.json').write_text(json.dumps(dict(schemaVersion=1,familyId='asset-o04-e-weapons-family',referenceIds=['reference-055'],assets=out),indent=2)+'\n')
