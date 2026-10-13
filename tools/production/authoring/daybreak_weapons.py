"""Daybreak lotus sword and radiant focus from inspected reference-046."""
import sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import reed_weapons as w
from reed_weapons import t,bpy,np

def petal(name,center,length,width,angle,mat='Enamel'):
    # Faceted convex lotus petal: pointed silhouette and actual raised central ridge.
    outline=[(0,-length*.45),(-width*.52,-length*.12),(-width*.45,length*.12),(0,length*.55),(width*.45,length*.12),(width*.52,-length*.12)]
    x,y,z=center;vs=[(x+a*math.cos(angle)+c*math.sin(angle),y,z-a*math.sin(angle)+c*math.cos(angle)) for a,c in outline];vs.append((x,y-.018,z));vs.append((x,y+.008,z));fs=[]
    for i in range(6):fs.extend([(i,(i+1)%6,6),((i+1)%6,i,7)])
    o=t.mesh(name,vs,fs,mat);t.tube(name+'_gold_outline',vs[:6]+[vs[0]],.0035,'Gold',5);return o

def lotus(z,r=.085):
    t.ring('Open_lotus_gold_core',z,r,cy=0,plane='xz',thick=.012);t.ring('Inner_enamel_circle',z,r-.015,cy=-.004,plane='xz',thick=.007,mat='Enamel')
    for layer,n in [(0,12),(1,8)]:
        for i in range(n):
            a=i*math.tau/n+layer*.18;rr=r+.055-layer*.018
            o=petal('Lotus_petal',(rr*math.sin(a),-.014-layer*.027,z+rr*math.cos(a)),.155-layer*.06,.058-layer*.008,a)
            if layer==0 and i==3:t.damaged.append(o)

def grip(z0,z1):
    t.tube('Grey_woven_grip',[(0,0,z0),(0,0,z1)],.024,'Cloth',10)
    for direction in [-1,1]:
        pts=[(.025*math.cos(a),.025*math.sin(a),z0+(z1-z0)*i/110) for i,a in enumerate(np.linspace(0,direction*math.tau*8,111))];t.tube('Crossed_grip_binding',pts,.0028,'Cloth',4)
    for z in [z0,z1]:t.ring('Gold_grip_ferrule',z,.025,thick=.008)

def blade(z0,z1,width):
    outline=[(0,z0),(-width*.75,z0+.07),(-width,z0+.13),(-width*.63,z1-.12),(0,z1),(width*.63,z1-.12),(width,z0+.13),(width*.75,z0+.07)]
    o=w.plate('Folded_ivory_blade',outline,.024,'Enamel');t.tube('Gold_blade_edge',[(x,-.014,z) for x,z in outline]+[(0,-.014,z0)],.0035,'Gold',5)
    for s in [-1,1]:t.tube('Blade_gold_inlay',[(0,-.018,z0+.09),(s*width*.42,-.018,z0+.17),(s*width*.25,-.018,z1-.14),(0,-.018,z1-.05)],.003,'Gold',5)

def sword():
    grip(-.16,.11);lotus(.19,.072);blade(.24,.96,.05);petal('Pommel_crystal',(0,0,-.205),.11,.08,math.pi)
    # Hanging enamel charm articulates around a real tether joint; the sword stays rigid.
    arm=w.bone_rig('Pommel_charm_rig',[('charm',(.05,0,-.19),(.05,0,-.39),None)])
    start=len(t.meshes);t.tube('Charm_tether',[(.03,0,-.20),(.05,0,-.24)],.003,'Gold',5);petal('Hanging_enamel_charm',(.05,0,-.32),.19,.055,math.pi)
    for o in t.meshes[start:]:w.bind(o,arm,'charm')
    for f,a in [(1,0),(16,.15),(31,0),(46,-.15),(61,0)]:p=arm.pose.bones['charm'];w.rotate_world(arm,p,a,f)
    arm.animation_data.action.name='Lotus_charm_sway';bpy.context.scene.frame_set(1)
def staff():
    grip(-.78,.62)
    for z in [-.76,-.12,.60]:petal('Collar_enamel_inlay',(0,-.023,z),.08,.04,0)
    t.tube('Counterweight_attachment',[(0,0,-.78),(0,0,-.91)],.012,'Gold',8)
    lotus(.80,.092);blade(.9,1.23,.055);petal('Counterweight_finial',(0,0,-.91),.19,.09,math.pi)
if __name__=='__main__':
    w.setup(9,[('Enamel',(.87,.82,.68),.15,.25),('Gold',(.61,.37,.12),.82,.28),('Cloth',(.045,.038,.035),0,.8)])
    w.reset();sword();a=w.finish('lotus-short-sword',46,9,{'type':'one-bone hanging pommel charm, blade rigid','bones':1},['Lotus_charm_sway'],['Fine filigree and enamel wear review'])
    w.reset();staff();b=w.finish('radiant-lotus-staff',46,9,extra_gates=['Radiance shader and gameplay response remain open'])
    w.manifest(9,46,[a,b],'Actual faceted convex lotus petals in two layers surround an open circular core; ivory blades have raised golden outline and inset gold tracks. The sword has a one-bone swinging enamel charm, while the staff is appropriately rigid. Dark woven grip, collar inlays and pointed counterweight retain the source material hierarchy. Damaged states remove one enamel petal leaving exposed outline. Detailed source engraving remains simplified pending art review.')
