"""Cosmic paired gravity flail and astrolabe, inspected reference-043."""
import sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import reed_weapons as w
from reed_weapons import t,bpy,np
from mathutils import Vector

def meteor(name,center,r):
    # Actual depressions and raised crater rims in the sphere mesh, no flat dot decals.
    rng=np.random.default_rng(43);craters=[]
    for i in range(15):
        v=Vector(tuple(rng.normal(size=3))).normalized();craters.append((v,.12+float(rng.random())*.12))
    craters.extend([(Vector(v).normalized(),.25) for v in [(0,-1,.3),(.55,-1,.45),(-.5,-1,-.2),(.4,-1,-.45)]])
    vs=[];n=64;rows=33
    for i in range(rows):
        theta=.001+(math.pi-.002)*i/(rows-1)
        for j in range(n):
            a=j*math.tau/n;v=Vector((math.sin(theta)*math.cos(a),math.sin(theta)*math.sin(a),math.cos(theta)));rad=1
            for c,width in craters:
                dist=(v-c).length;rad-=.26*math.exp(-(dist/(width*.68))**4);rad+=.025*math.exp(-((dist-width)/.04)**2)
            vs.append(Vector(center)+v*r*rad)
    fs=[(i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j) for i in range(rows-1) for j in range(n)]
    fs.extend([tuple(reversed(range(n))),tuple((rows-1)*n+j for j in range(n))]);o=t.mesh(name,vs,fs,'Meteor')
    x,y,z=center
    for plane in ['xy','xz']:t.ring('Meteor_brass_band',z,r*1.02,cx=x,cy=y,plane=plane,thick=.008)
    t.sphere('Meteor_starstone_inset',(x,y-r*.98,z),(r*.32,r*.14,r*.32),'Starstone');t.ring('Inset_brass_setting',z,r*.35,cx=x,cy=y-r,plane='xz',thick=.006)
    return o

def grip(z0,z1):
    t.tube('Indigo_grip',[(0,0,z0),(0,0,z1)],.026,'NavyCord',12)
    for direction in [-1,1]:t.tube('Indigo_wrap',[(.027*math.cos(a),.027*math.sin(a),z0+(z1-z0)*i/90) for i,a in enumerate(np.linspace(0,direction*math.tau*9,91))],.003,'NavyCord',5)
    for z in [z0,z1]:t.ring('Brass_grip_collar',z,.028,thick=.008)

def flail():
    grip(-.15,.15)
    for s in [-1,1]:t.sphere('Handle_swivel',(0,0,s*.20),(.04,.04,.04),'Steel')
    bones=[];paths={}
    for s in [-1,1]:
        pts=[(s*(.03+.28*math.sin(i/16*math.pi/2)),0,s*.20-(i/16)*(.68 if s==1 else .40)) for i in range(17)];paths[s]=pts
        for j in range(4):bones.append((f'chain_{s}_{j}',pts[j*4],pts[j*4+4],f'chain_{s}_{j-1}' if j else None))
    arm=w.bone_rig('Paired_gravity_chain_rig',bones)
    for s,pts in paths.items():
        for i,p in enumerate(pts[:-1]):
            p=Vector(p);n=Vector(pts[i+1]);mid=(p+n)/2;along=(n-p).normalized();side=Vector((0,1,0)) if i%2 else Vector((-along.z,0,along.x));ls=[mid+along*.027*math.cos(a)+side*.013*math.sin(a) for a in np.linspace(0,math.tau,17)];o=t.tube('Interlocking_chain_link',ls,.0045,'Steel',6);w.bind(o,arm,f'chain_{s}_{i//4}')
        start=len(t.meshes);loc=Vector(pts[-1])+Vector((0,0,-.09));o=meteor('Cratered_meteor_weight',loc,.11 if s==1 else .09)
        for ob in t.meshes[start:]:w.bind(ob,arm,f'chain_{s}_3')
        if s==1:t.damaged.append(o)
    for f,a in [(1,0),(16,.12),(31,0),(46,-.12),(61,0)]:
        for i,p in enumerate(arm.pose.bones):w.rotate_world(arm,p,a*(1 if i<4 else -1)*.4,f)
    arm.animation_data.action.name='Paired_weight_idle_swing';bpy.context.scene.frame_set(1)

def arc(name,center,r,angle_start,angle_end,tilt=0):
    x,y,z=center;vs=[];steps=25
    for i in range(steps):
        a=angle_start+(angle_end-angle_start)*i/(steps-1)
        for rad,depth in [(r-.014,-.009),(r+.014,-.009),(r+.014,.009),(r-.014,.009)]:
            xx=rad*math.cos(a);zz=rad*math.sin(a);vs.append((x+xx,y+depth*math.cos(tilt)-zz*math.sin(tilt),z+depth*math.sin(tilt)+zz*math.cos(tilt)))
    fs=[(i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j) for i in range(steps-1) for j in range(4)]+[(3,2,1,0),tuple((steps-1)*4+j for j in range(4))]
    o=t.mesh(name,vs,fs,'Enamel')
    for j in [0,1]:t.tube('Astrolabe_brass_arc_rim',[vs[i*4+j] for i in range(steps)],.004,'Gold',5)
    for i in range(0,steps,3):t.sphere('Astrolabe_calibration_stud',vs[i*4],(.004,.004,.004),'Gold')
    return o

def staff():
    grip(-.78,.57)
    for z in [-.8,.12,.59]:t.sphere('Starstone_collar',(0,0,z),(.041,.038,.057),'Starstone');t.ring('Collar_brass',z,.04,thick=.006)
    t.sphere('Astrolabe_starstone',(0,0,.88),(.123,.123,.123),'Starstone')
    arm=w.bone_rig('Astrolabe_orbital_rig',[('outer_orbit',(0,0,.88),(0,0,1.0),None),('inner_orbit',(0,0,.88),(.1,0,.88),None)])
    for k,(r,tilt) in enumerate([(.225,0),(.18,.75)]):
        start=len(t.meshes)
        for a,b in [(.15,2.95),(3.3,6.10)]:t.damaged.append(arc('Split_astrolabe_band',(0,0,.88),r,a,b,tilt)) if k==0 and a==.15 else arc('Split_astrolabe_band',(0,0,.88),r,a,b,tilt)
        for ob in t.meshes[start:]:w.bind(ob,arm,'outer_orbit' if k==0 else 'inner_orbit')
    t.tube('Astrolabe_axis',[(-.235,0,.88),(.235,0,.88)],.009,'Gold',8)
    t.tube('Upper_finial_socket',[(0,0,1.09),(0,0,1.18)],.016,'Gold',8)
    t.tube('Lower_finial_socket',[(0,0,-.80),(0,0,-.93)],.018,'Gold',8)
    for z,s in [(-.93,-1),(1.18,1)]:
        w.plate('Steel_pointed_finial',[(-.035,z),(0,z+s*.11),(.035,z),(0,z-s*.045)],.028,'Steel')
    for f,a in [(1,0),(31,math.pi),(61,math.tau)]:
        for p in arm.pose.bones:p.rotation_mode='XYZ';p.rotation_euler[2]=a*(1 if p.name=='outer_orbit' else -1);p.keyframe_insert('rotation_euler',frame=f,group=p.name)
    arm.animation_data.action.name='Astrolabe_orbit';bpy.context.scene.frame_set(1)
if __name__=='__main__':
    w.setup(10,[('Meteor',(.06,.062,.07),.25,.78),('Steel',(.20,.19,.17),.8,.38),('Starstone',(.018,.027,.075),.4,.14),('Gold',(.45,.29,.115),.8,.38),('Enamel',(.018,.033,.095),.25,.32),('NavyCord',(.012,.025,.09),0,.85)])
    w.reset();flail();a=w.finish('paired-gravity-flail',43,10,{'type':'eight-bone rigid-linked paired chains and weights','bones':8},['Paired_weight_idle_swing'],['Full combat swing/recovery/chain self-collision and physics authority','Meteor crater smoothing/LOD review'])
    w.reset();staff();b=w.finish('orbital-astrolabe-staff',43,10,{'type':'two articulated orbital bands','bones':2},['Astrolabe_orbit'],['Orbital bands clearance and runtime emissive starfield response'])
    w.manifest(10,43,[a,b],'Paired gravity flail uses individually interlocking alternate-plane chain links with an eight-bone idle articulation and two actual crater-depressed meteor weights. Orbital staff uses split broad astrolabe bands with raised brass rims/calibration studs and two moving orbital bones around a fixed dark blue starstone. These are original distinct constructions. Damaged flail loses one meteor body; damaged staff loses one band while exposing its trim. Chain physics, exact source filigree, starfield emissive detail and combat dynamics remain open.')
