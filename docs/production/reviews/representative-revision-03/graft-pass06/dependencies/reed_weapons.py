"""Reed Resonance reference-050: original articulated fan and tuning fork.
Also exposes export helpers used by subsequent distinct weapon authoring scripts.
"""
import sys,math,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import tidal_weapons as t
import bpy,numpy as np
from mathutils import Vector, Quaternion

def setup(oath,mats):
    t.BASE=t.ROOT/f'assets/production/oath-{oath:02d}/weapons';t.BASE.mkdir(parents=True,exist_ok=True);t.MATS={}
    for x in mats:t.material(*x)
def reset():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);t.meshes=[];t.damaged=[]
    for action in list(bpy.data.actions):bpy.data.actions.remove(action)
    sc=bpy.context.scene;sc.unit_settings.system='METRIC';sc.unit_settings.scale_length=1;sc.render.fps=30;sc.frame_start=1;sc.frame_end=61

def plate(name,outline,thick,mat):
    n=len(outline);vs=[(x,y,z) for y in [-thick/2,thick/2] for x,z in outline];fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)];return t.mesh(name,vs,fs,mat)
def bone_rig(name,bones):
    bpy.ops.object.select_all(action='DESELECT');ad=bpy.data.armatures.new(name);a=bpy.data.objects.new(name,ad);bpy.context.collection.objects.link(a);a.select_set(True);bpy.context.view_layer.objects.active=a;bpy.ops.object.mode_set(mode='EDIT')
    for bn,h,ta,parent in bones:
        b=ad.edit_bones.new(bn);b.head=h;b.tail=ta
        if parent:b.parent=ad.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT');a.select_set(False);return a
def rotate_world(arm,p,angle,frame,axis=(0,1,0)):
    local=arm.data.bones[p.name].matrix_local.to_3x3().inverted() @ Vector(axis)
    p.rotation_mode='QUATERNION';p.rotation_quaternion=Quaternion(local,angle);p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name)

def bind(o,arm,bone):
    g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');m=o.modifiers.new('Articulation','ARMATURE');m.object=arm;o.parent=arm

def finish(name,reference,oath,rig=None,animations=None,extra_gates=None,stow_frame=None):
    d=t.BASE/name;d.mkdir(exist_ok=True);t.uv_all();
    for ob in t.meshes:
        for poly in ob.data.polygons:
            if len(poly.vertices)>4:poly.use_smooth=False
    sc=bpy.context.scene;sc.frame_set(1)
    for sn in ['socket_grip','socket_back_dock']:
        o=bpy.data.objects.new(sn,None);bpy.context.collection.objects.link(o)
    vs=[]
    for ob in t.meshes:
        evaluated=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());evaluated_mesh=evaluated.to_mesh()
        vs.extend(evaluated.matrix_world@v.co for v in evaluated_mesh.vertices);evaluated.to_mesh_clear()
    lo=Vector(tuple(min(v[i] for v in vs) for i in range(3)));hi=Vector(tuple(max(v[i] for v in vs) for i in range(3)));dim=hi-lo;center=(hi+lo)/2
    t.export(d/'lod0.glb')
    for l,r in [(1,.6),(2,.3)]:
        for o in t.meshes:m=o.modifiers.new('LOD_candidate','DECIMATE');m.ratio=r
        t.export(d/f'lod{l}.glb')
        for o in t.meshes:o.modifiers.remove(o.modifiers['LOD_candidate'])
    for o in t.damaged:o.hide_set(True)
    t.select_asset()
    for o in t.damaged:o.select_set(False)
    bpy.ops.export_scene.gltf(filepath=str(d/'damaged.glb'),export_format='GLB',use_selection=True,export_apply=True,export_animations=True)
    for o in t.damaged:o.hide_set(False)
    if stow_frame:sc.frame_set(stow_frame)
    # Static state snapshot uses evaluated skin geometry where articulated.
    t.select_asset();copies=[]
    for o in list(bpy.context.selected_objects):
        if o.type=='MESH':
            me=bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()));c=bpy.data.objects.new(o.name+'_carried_snapshot',me);bpy.context.collection.objects.link(c);c.matrix_world=o.matrix_world;copies.append(c)
    bpy.ops.object.select_all(action='DESELECT')
    for c in copies:c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(d/'stowed.glb'),export_format='GLB',use_selection=True,export_animations=False)
    for c in copies:bpy.data.objects.remove(c,do_unlink=True)
    sc.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name='UCX_pickup_envelope';o.scale=dim+Vector((.035,.06,.035));bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);bpy.ops.export_scene.gltf(filepath=str(d/'collision.glb'),export_format='GLB',use_selection=True);bpy.data.objects.remove(o,do_unlink=True)
    # Real CPU renders framed from geometry bounds.
    sc.render.threads_mode='FIXED';sc.render.threads=2;sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=64;sc.cycles.use_denoising=False;sc.render.resolution_x=640;sc.render.resolution_y=800;sc.render.resolution_percentage=100;sc.world.color=(.14,.14,.14);sc.view_settings.view_transform='AgX'
    for pos,en,size in [((2,-3,3),450,3),((-2,-1,1),250,2),((1,2,3),400,2)]:
        ld=bpy.data.lights.new('STUDIO_light','AREA');ob=bpy.data.objects.new('STUDIO_light',ld);bpy.context.collection.objects.link(ob);ob.location=Vector(pos)+center;ld.energy=en;ld.size=size;ob.rotation_euler=(center-ob.location).to_track_quat('-Z','Y').to_euler()
    ca=bpy.data.cameras.new('STUDIO_camera');co=bpy.data.objects.new('STUDIO_camera',ca);bpy.context.collection.objects.link(co);sc.camera=co;ca.type='ORTHO';ca.ortho_scale=max(dim.z*1.18,dim.x*1.45,1)
    renders=[]
    for view,p in [('front',(0,-4,0)),('side',(4,-.4,0)),('hero',(1.7,-4,1))]:
        co.location=center+Vector(p);co.rotation_euler=(center-co.location).to_track_quat('-Z','Y').to_euler();sc.render.filepath=str(d/(view+'.png'))
        if not (t.os.environ.get('AETHERION_MOTION_ONLY')=='1' and (d/(view+'.png')).exists()):bpy.ops.render.render(write_still=True)
        renders.append(t.rel(d/(view+'.png')))
    if animations:
        sc.frame_set(stow_frame or (25 if 'bow' in name else 16));sc.render.filepath=str(d/'motion.png');bpy.ops.render.render(write_still=True);renders.append(t.rel(d/'motion.png'));sc.frame_set(1)
    t.select_asset();bpy.ops.wm.save_as_mainfile(filepath=str(d/(name+'.blend')))
    return dict(id=f'oath-{oath:02d}-{name}',archetypeId=f'oath-{oath:02d}-{name}',name=name.replace('-',' ').title(),type='equipment',status='PRODUCTION_CANDIDATE_UNREVIEWED',files=dict(blend=t.rel(d/(name+'.blend')),glb=t.rel(d/'lod0.glb'),lod1=t.rel(d/'lod1.glb'),lod2=t.rel(d/'lod2.glb'),collision=t.rel(d/'collision.glb'),damaged=t.rel(d/'damaged.glb'),stowed=t.rel(d/'stowed.glb'),textures=[p for m,ps in t.MATS.values() for p in ps],renders=renders),triangles={k:t.glb_triangles(d/f) for k,f in [('glb','lod0.glb'),('lod1','lod1.glb'),('lod2','lod2.glb'),('collision','collision.glb')]},dimensionsCoordinateSystem='BLENDER_Z_UP',dimensionsMeters=list(dim),rig=rig or {'type':'static, intentionally unrigged','bones':0},animations=animations or [],remainingGates=['Owner exact art and scale approval','Host rig grip/docking and gameplay state transitions','Engine import/runtime parity','Collision and LOD gameplay/performance acceptance','Source ornate surface engraving simplification review']+(extra_gates or []))
def manifest(oath,ref,assets,notes):
    (t.BASE/'manifest.json').write_text(json.dumps(dict(schemaVersion=1,familyId=f'asset-o{oath:02d}-e-weapons-family',referenceIds=[f'reference-{ref:03d}'],assets=assets),indent=2)+'\n')
    (t.BASE/'REVIEW.md').write_text(f'# Oath {oath:02d} weapon candidates\n\nPRODUCTION_CANDIDATE_UNREVIEWED. Actual original reference-{ref:03d} pixels inspected before authoring. These two assets do not close the weapon family.\n\n{notes}\n\nEach includes packed editable Blender source, external512PBRmaps, actual UVs, LOD0/1/2GLBs, a damaged state, a carried snapshot and separate pickup envelope. CPU Cycles64sample front/side/hero renders use no denoiser. Static poses are not character-integrated animations. Dimensions and performance budgets remain proposed. See manifest remaining gates; no engine or owner approval implied.\n')

def fan():
    count=9;angles=np.linspace(-1.15,1.15,count);r=.58
    arm=bone_rig('Fan_hinge_rig',[(f'rib_{i}',(0,0,0),(.4*math.sin(a),0,.4*math.cos(a)),None) for i,a in enumerate(angles)])
    for i,a in enumerate(angles):
        o=t.tube(f'Carved_fan_rib_{i}',[(0,0,0),(r*math.sin(a),0,r*math.cos(a))],.009,'Wood',6);bind(o,arm,f'rib_{i}')
        o=t.tube(f'Red_lacquer_tip_{i}',[(.4*math.sin(a),-.005,.4*math.cos(a)),(r*math.sin(a),-.005,r*math.cos(a))],.007,'Red',6);bind(o,arm,f'rib_{i}')
    for i in range(count-1):
        a,b=angles[i:i+2];pts=[]
        for rr in [.14,.32,.57]:
            for j in range(5):
                ang=a+(b-a)*j/4;pts.append((rr*math.sin(ang),.008+(.012 if j%2 else 0),rr*math.cos(ang)))
        faces=[(q*5+j,q*5+j+1,(q+1)*5+j+1,(q+1)*5+j) for q in range(2) for j in range(4)];o=t.mesh('Pleated_cream_membrane_'+str(i),pts,faces,'Cloth')
        for rib in [i,i+1]:o.vertex_groups.new(name=f'rib_{rib}')
        for v in o.data.vertices:
            w=(v.index%5)/4;o.vertex_groups[0].add([v.index],1-w,'REPLACE');o.vertex_groups[1].add([v.index],w,'REPLACE')
        m=o.modifiers.new('Fan_deform','ARMATURE');m.object=arm;o.parent=arm
        if i==0:t.damaged.append(o)
    t.sphere('Gold_hinge_pin',(0,-.025,0),(.022,.012,.022),'Gold')
    for i in [0,count-1]:
        a=angles[i];o=t.tube('Gold_outer_guard',[(.035*math.sin(a),-.017,.035*math.cos(a)),(.59*math.sin(a),-.017,.59*math.cos(a))],.012,'Gold',6);bind(o,arm,f'rib_{i}')
        for r0 in [.11,.33,.53]:
            o=t.sphere('Guard_rivet',(r0*math.sin(a),-.032,r0*math.cos(a)),(.009,.006,.009),'Gold');bind(o,arm,f'rib_{i}')
    t.tube('Red_hinge_tether',[(0,0,-.015),(.01,0,-.065),(.05,0,-.08)],.004,'Red',5)
    t.sphere('Tether_bead',(.05,0,-.08),(.015,.012,.015),'Wood')
    for j in range(10):t.tube('Fan_red_tassel',[(.05+.006*math.cos(j),.006*math.sin(j),-.09),(.07+.02*math.cos(j),.01*math.sin(j),-.18)],.003,'Red',5)
    for f,amount in [(1,0),(31,.96),(61,0)]:
        for i,a in enumerate(angles):p=arm.pose.bones[f'rib_{i}'];rotate_world(arm,p,-a*amount,f)
    arm.animation_data.action.name='Fan_fold_open';bpy.context.scene.frame_set(1)
def fork():
    t.tube('Carved_wood_grip',[(0,0,-.16),(0,0,.07)],.025,'Wood',10)
    for z in [-.16,.07]:t.ring('Gold_endcap',z,.025,thick=.008)
    for i in range(7):
        z=-.145+i*.026;t.tube('Red_grip_lacing',[(.027*math.cos(a),.027*math.sin(a),z+a*.008) for a in np.linspace(0,math.tau,16)],.004,'Red',5)
    for s in [-1,1]:
        pts=[(s*x,z) for x,z in [(0,.06),(.09,.1),(.14,.19),(.125,.34),(.15,.68),(.07,.40),(.065,.26),(.055,.19),(0,.12)]]
        o=plate('Silver_resonating_prong',pts,.021,'Silver');t.damaged.append(o) if s==1 else None
        t.tube('Prong_recessed_gold_line',[(s*.035,-.014,.13),(s*.105,-.014,.22),(s*.1,-.014,.35),(s*.14,-.014,.63)],.003,'Gold',5)
        t.tube('Scroll_guard',[(s*(.055+.028*math.cos(a)),-.018,.09+.028*math.sin(a)) for a in np.linspace(0,math.pi*1.7,20)],.006,'Gold',6)
    for i in range(9):t.tube('Red_tassel',[(.008*math.cos(i),.008*math.sin(i),-.17),(.01*math.cos(i),.01*math.sin(i),-.28)],.003,'Red',5)
if __name__=='__main__':
    setup(6,[('Wood',(.28,.12,.035),0,.6),('Red',(.40,.032,.012),0,.6),('Cloth',(.78,.70,.56),0,.85),('Gold',(.5,.30,.10),.8,.35),('Silver',(.43,.41,.36),.85,.30)])
    reset();fan();a=finish('folding-battle-fan',50,6,{'type':'nine-bone articulated folding ribs and weighted membrane','bones':9},['Fan_fold_open'],['Fan fold cloth self-intersection and held animation acceptance'],31)
    reset();fork();b=finish('reed-tuning-fork',50,6,extra_gates=['Fork tassel is static; secondary motion open'])
    manifest(6,50,[a,b],'Distinct construction: actual pleated membrane with nine independently weighted ribs and an open/closed clip; a fork with two sculpted asymmetric-edged metal prongs, wood/red cord grip and scroll guards. Carried fan is an evaluated closed snapshot. Damaged fan loses one membrane panel; damaged fork loses one prong. These are review states, not gameplay breakage approval.')
