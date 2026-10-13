"""Graft Sanctuary weapons, original geometry based on inspected reference-049."""
import sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import reed_weapons as w
from reed_weapons import t,bpy,np

def leaf(name,loc,angle=0,size=.065):
    x,y,z=loc;ps=[(0,0,-size*.6),(-size*.35,0,0),(0,-size*.12,size*.1),(size*.35,0,0),(0,0,size*.65)]
    vs=[(x+a*math.cos(angle)+c*math.sin(angle),y+b,z-a*math.sin(angle)+c*math.cos(angle)) for a,b,c in ps]
    o=t.mesh(name,vs,[(0,1,2),(1,4,2),(4,3,2),(3,0,2)],'Leaf');t.tube(name+'_midrib',[vs[0],vs[2],vs[4]],.0016,'Vine',4);return o

def seed(loc,size):
    x,y,z=loc
    o=t.sphere('Amber_sap_heart',loc,(size*.42,size*.32,size*.88),'Amber')
    for j in range(7):
        a=j*math.tau/7;vs=[];rows=12
        for i,ss in enumerate(np.linspace(.02,math.pi-.02,rows)):
            for k in [-1,0,1]:
                az=a+k*.25*math.sin(ss);rr=math.sin(ss)*size*(.54 if k==0 else .49)
                vs.append((x+rr*math.cos(az),y+rr*.8*math.sin(az),z+math.cos(ss)*size*(1+.08*math.sin(j*4))))
        fs=[(i*3+k,i*3+k+1,(i+1)*3+k+1,(i+1)*3+k) for i in range(rows-1) for k in range(2)]
        husk=t.mesh('Pointed_split_seed_husk',vs,fs,'BarkLight');mod=husk.modifiers.new('Husk_thickness','SOLIDIFY');mod.thickness=.004
    return o

def bark_branch(name,points,r=.02):
    t.tube(name,points,r,'Bark',9)
    for k in range(4):
        pts=[(p[0]+r*.85*math.cos(i*.52+k*math.pi/2),p[1]+r*.85*math.sin(i*.52+k*math.pi/2),p[2]) for i,p in enumerate(points)]
        t.tube(name+'_twisted_bark_ridge',pts,.004,'BarkLight',5)

def bow():
    arm=w.bone_rig('Living_bow_rig',[('upper',(0,0,0),(0,0,.75),None),('lower',(0,0,0),(0,0,-.75),None),('draw',(.3,0,0),(.3,0,.1),None)])
    for s,bn in [(1,'upper'),(-1,'lower')]:
        start=len(t.meshes)
        points=t.smooth_profile([(0,.08*s),(-.075,.30*s),(.0,.51*s),(.21,.72*s),(.25,.83*s)])
        ps=[(x,0,z) for x,z in points];bark_branch('Living_bow_limb',ps,.025)
        for i in range(3,len(ps)-1,3):
            x,y,z=ps[i];t.tube('Twig_branch',[(x,y,z),(x-.075,-.005,z+s*.055)],.005,'Bark',6);leaf('Living_leaf',(x-.065,-.014,z+s*.04),-.65*s)
        seed((-.055,-.025,s*.29),.07)
        t.tube('Green_limb_binding',[(.24+.022*math.cos(a),.022*math.sin(a),s*.8+a*.004) for a in np.linspace(0,math.tau*3,30)],.003,'Vine',5)
        for o in t.meshes[start:]:w.bind(o,arm,bn)
    t.tube('Woven_center_grip',[(0,0,-.11),(0,0,.11)],.032,'Fiber',10)
    for i in range(8):
        z=-.1+i*.027;t.tube('Vine_grip_wrap',[(.035*math.cos(a),.035*math.sin(a),z+a*.003) for a in np.linspace(0,math.tau,15)],.003,'Vine',5)
    o=t.tube('Bowstring',[(.25,0,-.83),(.28,0,-.42),(.30,0,0),(.28,0,.42),(.25,0,.83)],.002,'Fiber',5)
    for n in ['lower','draw','upper']:o.vertex_groups.new(name=n)
    for v in o.data.vertices:
        zz=v.co.z;side=0 if zz<0 else 2;weight=min(1,abs(zz)/.83);o.vertex_groups[side].add([v.index],weight,'REPLACE');o.vertex_groups[1].add([v.index],1-weight,'REPLACE')
    m=o.modifiers.new('Draw_deform','ARMATURE');m.object=arm;o.parent=arm
    for f,a in [(1,0),(25,1),(31,1),(38,0),(61,0)]:
        for bn,sign in [('upper',1),('lower',-1)]:p=arm.pose.bones[bn];w.rotate_world(arm,p,sign*a*.065,f)
        p=arm.pose.bones['draw'];p.location.x=a*.27;p.keyframe_insert('location',frame=f,group='draw')
    arm.animation_data.action.name='Living_bow_draw_release';bpy.context.scene.frame_set(1);t.damaged=[o]

def staff():
    ps=[(.02*math.sin(z*9),.014*math.cos(z*8),z) for z in np.linspace(-.9,.71,38)];bark_branch('Twisted_living_shaft',ps,.027)
    t.tube('Climbing_green_vine',[(.036*math.cos(z*28),.036*math.sin(z*28),z) for z in np.linspace(-.85,.7,90)],.004,'Vine',5)
    seed((0,0,.87),.19)
    for s in [-1,1]:
        pts=[(0,0,.35),(s*.1,0,.50),(s*.21,0,.70),(s*.24,0,.89)];bark_branch('Crown_branch',pts,.013)
        for i in range(1,4):
            x,y,z=pts[i];leaf('Crown_leaf',(x+s*.025,-.01,z),s*.85,.08);leaf('Leaf_pair',(x-s*.02,.01,z+.03),-s*.8,.055)
    bark_branch('Secondary_seed_branch',[(0,0,.12),(.17,0,.28),(.23,0,.45)],.011);t.damaged.append(seed((.23,0,.52),.09))
    for z in [-.63,-.3,.05]:leaf('Shaft_leaf',(.047,-.01,z),.8,.075)
    for a in np.linspace(0,math.tau,6)[:-1]:bark_branch('Root_foot',[(0,0,-.70),(.04*math.cos(a),.04*math.sin(a),-.88),(.095*math.cos(a),.095*math.sin(a),-.96)],.01)
if __name__=='__main__':
    w.setup(7,[('Bark',(.20,.09,.028),0,.8),('BarkLight',(.39,.22,.09),0,.75),('Amber',(.65,.22,.008),.18,.2),('Leaf',(.23,.34,.022),0,.8),('Vine',(.15,.23,.013),0,.85),('Fiber',(.12,.09,.035),0,.9)])
    w.reset();bow();a=w.finish('living-twig-bow',49,7,{'type':'three-bone limb flex and weighted draw string','bones':3},['Living_bow_draw_release'],['Bow nock/arrow fitting, force curve and release timing','Root weighting and endpoint string contact under deformation'])
    w.reset();staff();b=w.finish('sapseed-staff',49,7,extra_gates=['Sap transparency and liquid animation','Wind-driven leaf motion'])
    w.manifest(7,49,[a,b],'Living twig bow has individually modeled bark ridges, twigs, leaf clusters, split sap housings and a deforming string/limb draw clip. Sapseed staff has a twisted shaft, helical vine, branching leaves, seven-part seed husks, subsidiary pod and actual root feet. Bow damaged state removes the broken string; staff loses its subsidiary sap heart. Carried states are static snapshots awaiting host docking.')
