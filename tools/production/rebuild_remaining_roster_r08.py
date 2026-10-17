#!/usr/bin/env python3
"""Aetherion R08: 125 distinct, canon-identity-specific procedural review meshes.

Replaces the R06 low-detail mesh while preserving all animation samples, glTF Y-up
scene root, and existing skeletal hierarchy. R07 three reference-guided binaries
stay separate. This is NOT reference exact, artist-approved, or gameplay-certified.

Reproduce: python build_remaining_r08.py /path/R06.zip /output/dir [--canon /repo]
Dependencies: numpy, trimesh, Pillow.
"""
import argparse, copy, hashlib, json, math, struct, zipfile, io, re, pathlib
import numpy as np
from PIL import Image
import trimesh
from rebuild_three_creature_candidates_r07 import Sculpt

PREFIX='AETHERION_ROSTER_REBUILD/'
EXCLUDE={'creature-o01-natural','creature-o03-natural','creature-o04-natural'}
PALETTES=[
 [(55,47,43),(179,76,34),(219,142,53),(94,75,61),(211,185,131),(37,33,32)],
 [(77,111,125),(175,221,225),(95,178,204),(237,240,231),(153,194,207),(40,67,75)],
 [(32,48,69),(185,99,53),(247,167,61),(198,216,222),(127,165,177),(19,30,45)],
 [(32,97,119),(56,171,167),(202,183,121),(188,229,221),(84,141,162),(27,51,65)],
 [(83,70,91),(160,97,193),(111,172,186),(190,190,198),(160,125,74),(55,50,63)],
 [(92,83,73),(152,129,93),(213,190,122),(204,205,184),(117,101,78),(46,39,31)],
 [(53,87,55),(98,157,65),(190,133,55),(148,188,130),(102,78,43),(34,55,40)],
 [(72,99,54),(157,169,66),(172,100,49),(162,178,118),(82,103,46),(44,56,34)],
 [(215,210,187),(204,169,87),(240,225,176),(236,236,224),(198,163,70),(96,104,103)],
 [(56,51,100),(118,92,180),(71,105,147),(205,193,223),(137,115,200),(31,27,61)],
 [(45,46,56),(117,93,122),(181,177,196),(183,185,192),(110,113,133),(26,27,38)],
 [(111,44,52),(153,50,65),(186,94,101),(210,166,159),(117,67,75),(54,26,39)],
 [(50,67,96),(145,167,207),(211,177,175),(216,224,220),(170,178,209),(36,44,75)],
 [(70,70,85),(179,135,77),(195,194,168),(164,178,182),(184,159,124),(34,36,48)],
 [(45,53,56),(209,126,43),(125,165,175),(149,163,159),(179,159,119),(23,29,39)],
]
LEADER_TOOLS=['hammer','staff','routing frame','hook staff','wedge hammer','conductor','pruning hook','assay staff','lotus shield','calibration staff','lantern','pact spear','mirror staff','clockwork staff','force tool']
CIVIL_TOOLS=['cooling wrench','sample ledger','cable grip','channel key','plumb gauge','signal frame','seed pouch','assay case','clinic satchel','ballast key','ferry hook','linen packet','measuring frame','brake gauge','lockout tool']
HUMAN_BOSS={2,6,12,13,14}
VEHICLE_MOUNTS={2,3,4,6,8,10,13,14,15}
PLANT_BOSS={7}


def decode_glb(raw):
    if raw[:4]!=b'glTF' or struct.unpack_from('<I',raw,4)[0]!=2:raise ValueError('Invalid glTF 2.0')
    jslen=struct.unpack_from('<I',raw,12)[0]; doc=json.loads(raw[20:20+jslen]); ofs=20+jslen
    length,kind=struct.unpack_from('<I4s',raw,ofs)
    if kind!=b'BIN\0' or ofs+8+length!=len(raw):raise ValueError('GLB BIN bounds')
    return doc,bytearray(raw[ofs+8:])


def pack_glb(doc,buf):
    doc['buffers'][0]['byteLength']=len(buf)
    js=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode()
    js+=b' '*(-len(js)%4)
    return b'glTF'+struct.pack('<II',2,12+8+len(js)+8+len(buf))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(buf),b'BIN\0')+buf


def ico(s,p,sc,mat=0,bone='body',detail=1):s.ellipse(p,sc,mat,bone=bone,detail=detail)

def seg(s,a,b,r=.08,mat=1,bone='body',num=8):s.link(a,b,r,r*.6,mat,bone=bone,sections=num)

def rng_for(uid):return np.random.default_rng(int(hashlib.sha256(uid.encode()).hexdigest()[:12],16))


def horns(s,at,bone='head',material=4,n=2,span=.25):
    for k in range(n):
        angle=2*math.pi*k/max(n,1)
        x=at[0]+math.cos(angle)*span;y=at[1]+math.sin(angle)*span
        s.link((x,y,at[2]),(x*1.2,y-.12,at[2]+.43),.08,.009,material,bone=bone,sections=7)

def coat_detail(s,uid,region,role='character'):
    rng=rng_for(uid+'detail'); bone='chest' if role=='character' else 'body'
    for k in range(30 if role=='character' else 42):
        theta=rng.uniform(0,2*math.pi)
        x=math.cos(theta)*(0.32 if role=='character' else .46)
        y=math.sin(theta)*(0.22 if role=='character' else .65)
        z=(rng.uniform(.8,1.65) if role=='character' else rng.uniform(.75,1.31))
        s.ellipse((x,y,z),(.024,.055,.023),1 if k%5 else 4,bone=bone,detail=0)

def creature_leg(s,side,y,idx,style='hoof',scale=1.,zbase=.81,upper=.48):
    bone=f'leg.{idx}'
    if bone not in s.joints:bone='body'
    x=side*.39*scale
    a=(x,y,zbase);b=(side*.60*scale,y+.045,upper);c=(side*.62*scale,y-.13,.115)
    seg(s,a,b,.148*scale,0,bone,10);seg(s,b,c,.107*scale,0,bone,10)
    if style=='claw':
        ico(s,c,(.17,.13,.085),0,bone)
        for t in [-1,0,1]:seg(s,(c[0]+t*.064,c[1]-.08,.10),(c[0]+t*.11,c[1]-.28,.045),.042,4,bone,8)
    elif style=='hoof':
        for t in [-1,1]:ico(s,(c[0]+t*.075,c[1]-.07,.07),(.08,.13,.074),4,bone,1)
    elif style=='wheel':
        ico(s,(c[0],c[1],.125),(.12,.14,.14),5,bone,2)
        ico(s,(c[0]+side*.025,c[1],.13),(.06,.077,.10),2,bone)
    else:ico(s,c,(.13,.17,.10),4,bone)


def organ_eye(s,pos,side,bone='head'):
    ico(s,(side*pos[0],pos[1],pos[2]),(.056,.038,.042),4,bone)
    ico(s,(side*(pos[0]+.009),pos[1]-.019,pos[2]+.002),(.025,.026,.026),2,bone)


def mammal(s,uid,oath,role,profile):
    rng=rng_for(uid)
    giant=(role=='boss');size=1.2 if giant else (1.06 if role=='mount' else 1)
    long=('leviathan' in profile or 'otter' in profile or 'serpent' in profile)
    slim=('runner' in profile or 'courser' in profile or 'fox' in profile or 'hound' in profile)
    length=1.14 if long else (.95 if slim else .8)
    s.ellipse((0,.05,1.03),(.43*size,length*size,.33*size),0,detail=3)
    s.ellipse((0,-length*.85,.99),(.3,.36,.28),0,bone='neck',detail=2)
    s.ellipse((0,-length*1.30,.89),(.24,.33,.23),0,bone='head',detail=2)
    s.ellipse((0,-length*1.53,.79),(.30,.23,.155),3,bone='jaw',detail=2)
    for side in [-1,1]:
        organ_eye(s,(.241,-length*1.35,.98),side)
        ico(s,(side*.22,-length*1.13,1.08),(.13,.10,.16),3,'head',1)
    for side in [-1,1]:
        for hind,y in [(False,-.54*size),(True,.60*size)]:
            idx=({(1,False):1,(-1,False):2,(1,True):3,(-1,True):4})[(side,hind)]
            creature_leg(s,side,y,idx,'claw' if ('burrow' in profile or 'stalker' in profile or 'prowler' in profile or 'fox' in profile) else 'hoof',scale=size)
    s.link((0,length*.74,1.12),(0,length*1.38,.83),.16,.025,0,bone='tail',sections=9)
    if any(k in profile for k in ('antler','hart','horn','ram','herd','grazer','packhorn')): horns(s,(0,-length*1.30,1.15),n=4,material=4)
    if any(k in profile for k in ('burrow','stone','crystal','mineral','shard','shell','slag','rime')):
        for i in range(65):
            a=rng.uniform(.22,math.pi-.22);y=rng.uniform(-length*.77,length*.80)
            x=.38*math.cos(a);z=1.03+.33*math.sin(a)
            ico(s,(x,y,z),(.065,.13,.11),1 if i%3 else 5,bone='body',detail=0)
    if any(k in profile for k in ('reed','root','brush','crest','moss','vine','wood','coat','seed','sail')):
        for i in range(125):
            y=rng.uniform(-length*.88,length*.92);u=rng.uniform(-1,1)
            x=u*.32;z=1.03+(.30*math.sqrt(max(.1,1-u*u)))
            seg(s,(x,y,z),(x+u*.01,y+.12,z+rng.uniform(.13,.29)),.013,1 if i%3 else 3,'body',5)
    if 'crystal' in profile or oath in {5,9,10}:horns(s,(0,.15,1.28),'crest',1,n=5,span=.38)
    if 'altered'==role:
        horns(s,(0,-.07,1.30),'crest',1,n=3,span=.3)
    return 'mammalian quadruped with individually placed legs and role-specific additions'


def avian(s,uid,oath,role,profile):
    rng=rng_for(uid)
    s.ellipse((0,.0,1.13),(.31,.54,.36),0,detail=3)
    s.ellipse((0,-.39,1.31),(.19,.25,.31),3,'neck',detail=2)
    s.ellipse((0,-.54,1.58),(.21,.22,.23),0,'head',detail=3)
    seg(s,(0,-.66,1.59),(0,-.83,1.44),.087,5,'head');seg(s,(0,-.82,1.45),(0,-.85,1.35),.045,5,'jaw')
    for side in [-1,1]:
        organ_eye(s,(.21,-.56,1.65),side)
        wing='wing.L' if side<0 else 'wing.R';wing=wing if wing in s.joints else 'body'
        ico(s,(side*.34,.07,1.22),(.15,.39,.2),1,wing,detail=2)
        for row in range(3):
            for k in range(16):
                y=-.22+k*.052;x=side*(.35+row*.067)
                z=1.28-row*.05-k*.005
                seg(s,(x,y,z),(x+side*(.11+row*.07),y+.25+row*.10,z-.10),.045 if row==0 else .027,1 if (k+row)%3 else 0,wing,6)
        idx=1 if side>0 else 2
        bone=f'leg.{idx}' if f'leg.{idx}' in s.joints else 'body'
        seg(s,(side*.18,.15,.88),(side*.21,.10,.24),.075,4,bone,9)
        for t in [-1,0,1]:seg(s,(side*.20+t*.06,.05,.20),(side*.20+t*.085,-.15,.04),.03,5,bone,7)
    for k in range(12):
        x=(k-5.5)*.04;seg(s,(x,.40,1.0),(x*2.5,1.3,.76),.055,1 if k%2 else 0,'tail',7)
    for k in range(15):
        x=(k-7)*.025;seg(s,(x,-.57,1.78),(x*1.5,-.37,1.90+rng.uniform(0,.07)),.019,5,'crest',6)
    return 'bird with independently articulated layered wings, tail and talons'


def serpent_or_ray(s,uid,oath,role,profile):
    ray=any(x in profile for x in ('ray','manta','flattened','leviathan')) and ('leviathan' not in profile)
    if ray:
        ico(s,(0,0,1.0),(.95,.89,.18),0,'body',3)
        ico(s,(0,-.54,.93),(.34,.38,.19),0,'head',2)
        for side in [-1,1]:
            bone='wing.L' if side<0 else 'wing.R';bone=bone if bone in s.joints else 'body'
            for i in range(13):seg(s,(side*.3,i*.09-.5,1.0),(side*(1.2+abs(i-6)*.02),i*.11-.63,.92),.045,1,bone,6)
        seg(s,(0,.65,.95),(0,1.78,.68),.09,4,'tail',10)
    else:
        # articulated elongated taper with 7 flowing body sections
        for i in range(8):
            y=-1.05+i*.33;w=.18+.19*math.sin(math.pi*(i+1)/9)
            ico(s,(0,y,.83+math.sin(i*.6)*.08),(w,.30,w*.90),0,'body' if i<5 else 'tail',2)
        ico(s,(0,-1.35,.82),(.32,.29,.20),0,'head',2)
        for side in [-1,1]:
            organ_eye(s,(.25,-1.38,.91),side)
            for j in range(3):
                yy=-.70+j*.60;bone='wing.L' if side<0 else 'wing.R';bone=bone if bone in s.joints else 'body'
                seg(s,(side*.25,yy,.80),(side*.66,yy+.2,.69),.09,1,bone,10)
    return 'flattened aquatic ray or articulated serpentine body with paired fins'


def construct(s,uid,oath,role,profile):
    rng=rng_for(uid)
    is_door=any(x in profile for x in ('door','threshold','court','frame','stage'))
    if is_door:
        for side in [-1,1]:
            seg(s,(side*.62,-.03,.23),(side*.62,-.03,2.05),.15,5,'body',12)
        seg(s,(-.69,-.03,2.02),(.69,-.03,2.02),.18,5,'body',12)
        for side in [-1,1]:
            bone='leg.1' if side>0 else 'leg.2'
            bone=bone if bone in s.joints else 'body'
            seg(s,(side*.61,-.05,.47),(side*.82,-.1,.11),.13,4,bone)
        ico(s,(0,-.03,1.94),(.20,.18,.20),2,'head')
    else:
        ico(s,(0,.0,1.03),(.52,.72,.36),5,'body',2)
        ico(s,(0,-.66,1.0),(.25,.26,.25),2,'head',2)
        ico(s,(0,.07,1.18),(.30,.39,.18),3,'body',2)
        ico(s,(0,.37,1.04),(.19,.24,.25),1,'body',2)
        legs=6 if any(x in profile for x in ('six','spider','beetle','stilt','maintenance','cargo')) else (3 if 'tripod' in profile else 4)
        for i in range(legs):
            side= -1 if i%2 else 1; yy=((i//2)-(legs//2-1)/2)*.45
            idx=i+1;bone=f'leg.{idx}'
            if bone not in s.joints and legs>4:
                s.add_bone(bone,'body',(side*.40,yy,-.14))
            if bone not in s.joints:bone='body'
            seg(s,(side*.42,yy,.94),(side*.73,yy+.06,.48),.13,5,bone,9)
            seg(s,(side*.73,yy+.06,.48),(side*.88,yy-.12,.10),.11,4,bone,8)
            ico(s,(side*.88,yy-.12,.09),(.15,.19,.08),4,bone)
        for k in range(8):
            x=rng.uniform(-.47,.47);y=rng.uniform(-.56,.6)
            ico(s,(x,y,1.25),(.09,.09,.05),1,'body',1)
    return 'articulated structural construct with independent chassis and mechanical attachments'


def hexapod(s,uid,oath,role,profile):
    rng=rng_for(uid)
    ico(s,(0,0,.95),(.43,.83,.33),0,'body',3)
    ico(s,(0,-.68,.81),(.34,.37,.26),0,'head',2)
    for side in [-1,1]:
        organ_eye(s,(.29,-.83,.94),side)
        for rank,y in enumerate([-.56,.0,.58]):
            bone=f'leg.{rank*2+(1 if side>0 else 2)}'
            if bone not in s.joints:s.add_bone(bone,'body',(side*.35,y,-.20))
            a=(side*.38,y,.76);b=(side*(.67+rank*.02),y-.02,.44);c=(side*(.76+rank*.02),y-.13,.09)
            seg(s,a,b,.13,0,bone,10);seg(s,b,c,.09,0,bone,9)
            if role in {'natural','altered','morph'}:
                for t in [-1,0,1]:seg(s,(c[0]+t*.05,c[1],.10),(c[0]+t*.06,c[1]-.14,.035),.028,4,bone,7)
            else:ico(s,c,(.13,.14,.095),5,bone)
    if any(x in profile for x in ('filter','shell','beetle','crawler','construct','automaton','chassis','exoshell')):
        for k in range(36):
            y=rng.uniform(-.65,.71);ang=rng.uniform(.1,math.pi-.1)
            ico(s,(.40*math.cos(ang),y,.95+.31*math.sin(ang)),(.075,.11,.07),1 if k%3 else 5,'body',1)
    else:
        for k in range(15):seg(s,(rng.uniform(-.4,.4),rng.uniform(-.7,.7),1.26),
                                 (rng.uniform(-.53,.53),rng.uniform(-.7,.7),1.44),.025,1,'body',6)
    if oath in {1,5,7,10,12,15}:horns(s,(0,-.58,1.06),'head',material=1,n=3,span=.2)
    return 'six-legged independent limb topology with distinct dorsal or equipment structures'


def biped_creature(s,uid,oath,role,profile):
    rng=rng_for(uid)
    ico(s,(0,0,1.12),(.32,.47,.39),0,'body',3)
    ico(s,(0,-.43,1.34),(.21,.27,.28),0,'head',2)
    for side in [-1,1]:
        idx=1 if side>0 else 2;bone=f'leg.{idx}'
        if bone not in s.joints:s.add_bone(bone,'body',(side*.18,.15,-.31))
        seg(s,(side*.18,.22,.97),(side*.26,.29,.48),.14,0,bone,10)
        seg(s,(side*.26,.29,.48),(side*.27,-.06,.14),.11,0,bone,9)
        ico(s,(side*.29,-.14,.09),(.15,.22,.09),4,bone,1)
        wing='wing.L' if side<0 else 'wing.R';wing=wing if wing in s.joints else 'body'
        for k in range(14):
            y=-.23+k*.045;seg(s,(side*.26,y,1.34),(side*(.6+k*.005),y+.18,1.13),.036,1,wing,6)
        organ_eye(s,(.22,-.53,1.40),side)
    seg(s,(0,.32,1.24),(0,.99,.85),.10,1,'tail',8)
    horns(s,(0,-.43,1.6),'crest',n=4,span=.16)
    return 'long-legged biped with wing/fin or exposed mechanical apparatus'


def gravity_colony(s,uid,oath,role,profile):
    rng=rng_for(uid)
    for k in range(3):
        a=2*math.pi*k/3;x=.38*math.cos(a);y=.4*math.sin(a)
        ico(s,(x,y,1.25+rng.uniform(-.2,.20)),(.48,.40,.63),0,'body',3)
        for t in range(12):
            angle=2*math.pi*t/12
            q=(x+.33*math.cos(angle),y+.34*math.sin(angle),.97)
            seg(s,q,(q[0]*1.45,q[1]*1.45,.18),.022,4,'tail',6)
            ico(s,(q[0]*1.5,q[1]*1.5,1.15+rng.uniform(-.18,.2)),(.07,.08,.10),2,'body',1)
    return 'three separate buoyant gravity sacs, anchoring filaments and orbiting mass nodules'


def vessel(s,uid,oath,role,profile):
    hull='skimmer' in profile or 'sled' in profile or 'litter' in profile or 'platform' in profile
    if hull:
        ico(s,(0,.0,.54),(.74,1.25,.21),0,'body',3)
        ico(s,(0,0,.62),(.51,.90,.14),3,'body',2)
        for side in [-1,1]:
            seg(s,(side*.60,-.9,.42),(side*.60,.92,.42),.085,5,'body',10)
            seg(s,(side*.41,-.48,.64),(side*.41,-.48,1.06),.07,4,'body',8)
            seg(s,(side*.41,.44,.64),(side*.41,.44,1.06),.07,4,'body',8)
            seg(s,(side*.41,-.49,1.06),(side*.41,.44,1.06),.06,4,'body',8)
        ico(s,(0,-.18,.90),(.31,.39,.19),1,'body',2)
    else:
        construct(s,uid,oath,role,profile)
        for side in [-1,1]:
            seg(s,(side*.36,-.05,1.35),(side*.40,-.05,1.65),.055,4,'body')
        ico(s,(0,-.05,1.53),(.30,.36,.09),3,'body',2)
    return 'vehicle or rideable platform with a distinct rider cradle and rails'


def plant_colony(s,uid,oath,role,profile):
    rng=rng_for(uid)
    for t in range(5):
        ang=t*2*math.pi/5;x=.56*math.cos(ang);y=.55*math.sin(ang)
        seg(s,(x,y,.11),(x*.5,y*.4,1.33+rng.uniform(-.15,.3)),.20,0,'body',10)
        for i in range(12):
            h=rng.uniform(.65,1.55)
            start=(x*.6,y*.6,h)
            end=(x*.6+rng.uniform(-.55,.55),y*.6+rng.uniform(-.55,.55),h+rng.uniform(.18,.70))
            seg(s,start,end,.060,1,'tail',7)
            if i%2:ico(s,end,(.10,.08,.14),2,'tail')
    ico(s,(0,0,.53),(.78,.84,.44),0,'body',2)
    return 'distributed botanical organism with multiple trunks and tendrils'


def actor(s,uid,oath,role,profile):
    rng=rng_for(uid);small=(role=='civilian'); height=1.0 if role=='leader' else (.97 if small else 1.04)
    # torso/waist/robes, distinguish by role and Oath while retaining rig hierarchy
    ico(s,(0,0,1.35*height),(.31,.20,.49),0,'spine',3)
    ico(s,(0,-.005,.96*height),(.27,.23,.23),0,'hips',2)
    ico(s,(0,-.02,1.72*height),(.22,.19,.26),3,'head',3)
    ico(s,(0,-.18,1.71*height),(.10,.075,.10),3,'head',2)
    for side in [-1,1]:
        ico(s,(side*.212,-.06,1.745*height),(.06,.04,.085),3,'head',1)
        ico(s,(side*.14,-.198,1.77*height),(.037,.025,.033),2,'head',1)
        seg(s,(side*.30,.02,1.52*height),(side*.43,-.035,1.15*height),.118,0,'upperarm.L' if side<0 else 'upperarm.R',10)
        seg(s,(side*.43,-.035,1.15*height),(side*.46,-.15,.95*height),.095,0,'forearm.L' if side<0 else 'forearm.R',10)
        ico(s,(side*.48,-.165,.91*height),(.10,.10,.13),4,'hand.L' if side<0 else 'hand.R',1)
        seg(s,(side*.15,0,.97*height),(side*.20,-.008,.53*height),.165,0,'thigh.L' if side<0 else 'thigh.R',11)
        seg(s,(side*.20,-.008,.53*height),(side*.20,-.07,.13*height),.114,0,'shin.L' if side<0 else 'shin.R',10)
        ico(s,(side*.20,-.19,.12*height),(.145,.25,.106),5,'foot.L' if side<0 else 'foot.R',1)
    if role not in {'civilian','player'}:
        horns(s,(0,-.01,1.92*height),'ornament',1,n=3,span=.19)
    # distinct clothes: mantle, pauldron, sash and segmented coat folds
    for side in [-1,1]:
        ico(s,(side*.285,0,1.49*height),(.15,.22,.115),1,'shoulder.L' if side<0 else 'shoulder.R',2)
    for k in range(18):
        angle=2*math.pi*k/18
        p=(math.cos(angle)*.26,math.sin(angle)*.20,.86*height)
        seg(s,p,(p[0]*1.18,p[1]*1.2,.40*height),.055,1,'cape-root',7)
    # helmet, hair layers, ornamental crest vary deterministically
    for k in range(25):
        ang=rng.uniform(0,2*math.pi)
        x=.205*math.cos(ang);y=.185*math.sin(ang)
        ico(s,(x,y,1.93*height+rng.uniform(-.04,.08)),(.048,.05,.04),5,'head',0)
    # named equipment: leaders have distinct industry-bound work tool, civilians work artifacts, other PCs have staff / knife
    tool=LEADER_TOOLS[oath-1] if role=='leader' else (CIVIL_TOOLS[oath-1] if role=='civilian' else 'weave fragment')
    side=1;bone='hand.R'
    if any(w in tool for w in ('staff','spear','hook','hammer','wrench','gauge','grip','tool','frame','key','brake','force','conductor')):
        seg(s,(side*.47,-.17,.84),(side*.52,-.17,1.83 if role=='leader' else 1.36),.043,4,bone,9)
        if 'hammer' in tool or 'wrench' in tool:
            ico(s,(side*.51,-.17,1.62),(.20,.095,.105),5,bone,1)
        elif 'shield' in tool:
            ico(s,(side*.54,-.28,1.25),(.28,.12,.42),1,bone,2)
        else:
            ico(s,(side*.52,-.17,1.72 if role=='leader' else 1.36),(.095,.11,.13),2,bone,1)
    else:
        ico(s,(side*.51,-.24,.97),(.15,.10,.17),1,bone,1)
    for k in range(15):
        a=rng.uniform(0,2*math.pi);y=rng.uniform(-.09,.12);z=rng.uniform(.70,1.55)
        ico(s,(math.sin(a)*.27,y,z),(.018,.029,.06),2 if k%3 else 4,'chest',0)
    if role=='civilian':
        ico(s,(-.32,-.08,.83),(.12,.09,.20),3,'hips',1)
    # Distinct Oath-specific silhouette, not merely a palette swap.
    sig=oath%5
    if oath in {1,5,12,15}:  # furnace/canyon/pact/tech armor
        for side in [-1,1]:
            ico(s,(side*.32,-.02,1.54),(.14+.026*sig,.13,.18),5 if oath==15 else 1,'chest',2)
            for k in range(3):seg(s,(side*.32,-.22,1.40-k*.13),(side*.31,-.22,1.30-k*.13),.045,4,'chest',8)
    if oath in {2,4,7,8}:  # hoods, cloaks, seals, foliage
        for k in range(22+oath):
            a=2*math.pi*k/(22+oath)
            p=(math.cos(a)*(.19+.014*sig),math.sin(a)*.16,1.86)
            q=(p[0]*1.12,p[1]*1.3,1.99+oath*.006)
            seg(s,p,q,.032,1,'ornament',6)
    if oath in {3,6,10,13}: # antennas, instrument arcs, star wires, mirror outriggers
        for k in range(oath%7+3):
            a=k*2*math.pi/(oath%7+3)
            x=.28*math.cos(a);y=.19*math.sin(a)
            seg(s,(x,y,1.81),(x*1.5,y*1.25,2.03+oath*.01),.028,2,'ornament',7)
    if oath in {9,11,14}: # petal/plated cowl and motion machinery
        for k in range(7+oath%4):
            a=2*math.pi*k/(7+oath%4)
            x=.27*math.cos(a);y=.21*math.sin(a)
            ico(s,(x,y,1.94+.05*math.sin(a)),(.08,.09,.07),1,'ornament',1)
    # Role variation and unique accessory construction.
    if role=='civilian':
        for k in range(oath%5+2):seg(s,(-.30,-.15,.95+k*.09),(-.39,-.16,1.00+k*.09),.029,4,'hips',7)
    elif role=='leader':
        ico(s,(0,-.22,1.47),(.15,.08,.18),2,'chest',2)
    elif role in {'handler','wayfarer','archivist','player'}:
        seg(s,(-.32,-.12,.70),(-.33,-.12,1.55),.045,1,'cape-root',8)
    # Deterministic body shape variance visibly changes actual rendered silhouette.
    for k in range(2 + int(rng.integers(1,5))):
        ang=rng.uniform(-math.pi,math.pi)
        ico(s,(math.sin(ang)*.24,math.cos(ang)*.12,1.97+rng.uniform(.01,.16)),
            (.045+rng.uniform(.015,.075),.04,.08+rng.uniform(.04,.20)),1,'ornament',1)
    return f'humanoid with articulated garments, facial features, and role-based tool: {tool}'


def creature_human_rig(s):
    """Add distinguishable review-time anatomy bones to a creature-form human boss.
    Original creature root/body animation channels stay intact; these new bones
    still require final full motion authoring."""
    names=[('hips','body',(0,0,.2)),('spine','hips',(0,0,.4)),('chest','spine',(0,0,.3)),
           ('shoulder.L','chest',(-.30,0,.10)),('upperarm.L','shoulder.L',(-.10,0,-.08)),
           ('forearm.L','upperarm.L',(-.12,0,-.22)),('hand.L','forearm.L',(0,0,-.16)),
           ('shoulder.R','chest',(.30,0,.1)),('upperarm.R','shoulder.R',(.1,0,-.08)),
           ('forearm.R','upperarm.R',(.12,0,-.22)),('hand.R','forearm.R',(0,0,-.16)),
           ('thigh.L','hips',(-.15,0,-.25)),('shin.L','thigh.L',(0,0,-.32)),
           ('foot.L','shin.L',(0,-.13,-.23)),('thigh.R','hips',(.15,0,-.25)),
           ('shin.R','thigh.R',(0,0,-.32)),('foot.R','shin.R',(0,-.13,-.23)),
           ('cape-root','chest',(0,.10,-.15)),('ornament','head',(0,0,.22))]
    for name,parent,offset in names:s.add_bone(name,parent,offset)


# Compact per-Oath anatomy cues, grounded in the source creature registry.
# A clean repo checkout will read the complete authoritative anatomy fields instead.
ANATOMY={
1:['six-limbed burrower, broad digging forelimbs, mineral back','six-legged burrower, fused clinker plates, whiskers','four foot furnace service construct, shovel arms chimney shutters','four-legged furnace crab slag-rake arms shuttered chimney plates','four-legged shielded chassis rider cradle','ember-scaled quadruped tail'],
2:['padded four-legged grazer branching antlers','four-legged grazer crystal antler sheath','six-legged archive beetle folio shell jaw clamp','living senior humanoid archivist insulation','two-runner sled towing rider cradle','low broad-pawed frost animal crest claws'],
3:['avian wings talons','flightless biped crest runner conductive plumes','cable-suspended spider four anchor legs two probe arms','suspended manta relay chassis six fins','low cable carriage rider','light biped insulated foot forearm fins'],
4:['four-legged grazer reed dorsal spines cloven hoof','flat ray with silt filaments tail','six foot shell guardian paddle forelimbs reservoir','long estuary leviathan six paddle fins reef plates','shallow draft curved hull skimmer','long fin-backed otterlike form'],
5:['compact digging mole large forepaws','amethyst crystal-shouldered ram','three legged stone jack telescoping legs','blind colossal mole stone shields four digging limbs','hoofed ram saddle','plated quadruped stone pads'],
6:['grasping climber sail membranes balancing tail','six-limbed membrane hunter hollow sacs','two-legged horn array reed frame sails','ensemble of multiple human performers reed stage','reed membrane wing glider harness','four-limbed wind sail membrane form'],
7:['long neck browser seed coat','six-legged root browser sap sacs','hollow wood quadruped tending arms antler trellis','distributed orchard symbiosis multiple fruit trunks roots','antlered hart padded saddle','four-limbed vine form tendrils'],
8:['many-legged wetland crawler porous filter shell','stilt-legged marsh hunter throat filter','four wheeled sealed automaton glass bell sample arm','salamander distillation chassis six stilts condenser','sealed stilted walker rider screen','amphibian gas-filter mantle gill seams'],
9:['long-legged prism-backed courser reflective scutes','large ground bird wing feathers prismatic crest','three-legged six petal iris automaton','three legged monumental lens guardian six petals','long legged courser ward tack','enamel-scaled quadruped dorsal vane'],
10:['winged roost animal tail ballast','six-legged gravity crawler orbiting nodules','tripod survey hanging masses broken ring lens','gravity sacs colonial floating three buoyant membranes','ballast platform trim weights rail','flattened ray lateral fins keel'],
11:['padded stalking quadruped broad ears','shadow prowler long limbs','four-legged walking doorframe threshold','courthouse walking doorway four legs','shadow-trace courser','elongated dark quadruped mantle'],
12:['horned herdbeast brush mane','six limb hound braided tail','ox shaped construct reservoir horns','living human pact champion armor braided cords','horned pack quadruped panniers','quadruped external pulse harness'],
13:['reflective coated fox articulated ears','six legged fox with delayed reflections','articulated stage frame four folding legs','living illusionist human patron folded garment mirrors','foldscreen supported litter','reflective paper-fold quadruped'],
14:['long leg steppe runner','asymmetric runner segmented tail','two-legged clockwork construct pendulum abdomen','living human marshal flywheel bracers staff','flywheel road mount visible linkage','light biped digitigrade spring heels'],
15:['small omnivore dexterous paws','burrower ferrous plates magnetic whiskers','six-legged automaton twin tool arms battery bed','six-legged siege chassis force projector','multi-legged cargo crawler driver seat','compact six-legged cockpit exoshell']
}
ROLE_INDEX={'natural':0,'altered':1,'guardian':2,'boss':3,'mount':4,'morph':5}

def identity_detail(s,uid,category,role,profile,oath):
    """Resolve otherwise repeated topology into identity-distinct features.
    These are visual design candidates, NOT evidence of unique approved references."""
    rng=rng_for('signature-'+uid)
    if category=='character':
        bone='ornament' if 'ornament' in s.joints else 'head'
        for k in range(2+oath%5):
            angle=2*math.pi*k/(2+oath%5)
            x=(.23+rng.uniform(.01,.09))*math.cos(angle)
            y=(.21+rng.uniform(.01,.05))*math.sin(angle)
            seg(s,(x,y,1.89),(x*1.25,y*.9,1.98+rng.uniform(.06,.30)),.024+rng.uniform(.001,.025),1,bone,7)
        return
    # Organic dorsal/horn/tail signatures vary with biology and published identity.
    if role in ('natural','altered','morph','mount','summon_visual_reference'):
        bone='body' if 'body' in s.joints else 'chest'
        for k in range(5+oath%6):
            y=-.75+k*.17 + rng.uniform(-.02,.02)
            x=rng.choice([-1,1])*rng.uniform(.03,.24)
            z=1.22+rng.uniform(.01,.16)
            if any(w in profile for w in ('shell','burrow','ram','stone','crystal','plate','horn')):
                ico(s,(x,y,z),(.08+rng.uniform(0,.09),.07,.09+rng.uniform(0,.08)),1,bone,1)
            elif any(w in profile for w in ('avian','wing','bird','kite','flight','ray')):
                seg(s,(x,y,z),(x*1.6,y+.23,z+.06),.027,1,bone,6)
            elif any(w in profile for w in ('coil','water','otter','mist','manta','serpent')):
                seg(s,(x,y,z),(x*1.65,y-.03,z+.16),.025,3,bone,6)
            else:
                seg(s,(x,y,z),(x*1.15,y+.06,z+.18+rng.uniform(0,.12)),.021,1,bone,6)
    else:
        # Guardian apparatus, control housings, battle tell signals and gear sockets.
        for k in range(5+oath%4):
            theta=k*math.tau/(5+oath%4)
            x=.33*math.cos(theta);y=.44*math.sin(theta)
            ico(s,(x,y,1.12+rng.uniform(0,.13)),(.07,.05,.08+rng.uniform(0,.07)),2 if k%3 else 4,'body' if 'body' in s.joints else 'chest',1)


def build_one(entry,srczip,output,canon_info=None):
    uid=entry['identity_id'];role=entry['role'];name=entry['name'];category=entry['category'];oath=int(entry.get('oath_id','oath-09').split('-')[1]) if entry.get('oath_id') else 9
    original=srczip.read(PREFIX+entry['glb_path'])
    if hashlib.sha256(original).hexdigest()!=entry['sha256']:raise ValueError(f'Source hash mismatch {uid}')
    doc,body=decode_glb(original); s=Sculpt(doc,body);r=rng_for(uid)
    # The canonical registry anatomy, when available, takes priority over name heuristics.
    anatomy=(canon_info or {}).get('anatomy','') or (ANATOMY[oath][ROLE_INDEX[role]] if category=='creature' and role in ROLE_INDEX else '')
    profile=f"{name} {role} {anatomy}".lower()
    if category=='character': design=actor(s,uid,oath,role,profile)
    elif role=='summon_visual_reference':
        if 'dragon' in profile or 'bird' in profile or 'phoenix' in profile:design=avian(s,uid,oath,role,profile)
        elif 'kraken' in profile or 'shark' in profile:design=serpent_or_ray(s,uid,oath,role,profile)
        else:design=mammal(s,uid,oath,role,profile)
    elif role=='boss' and oath in HUMAN_BOSS:
        creature_human_rig(s);design=actor(s,uid,oath,'boss',profile)
    elif role=='boss' and oath in PLANT_BOSS:design=plant_colony(s,uid,oath,role,profile)
    elif role=='boss' and oath==10:design=gravity_colony(s,uid,oath,role,profile)
    elif category=='creature' and oath==15 and role=='morph':design=construct(s,uid,oath,role,profile)
    elif role=='mount' and oath in VEHICLE_MOUNTS:design=vessel(s,uid,oath,role,profile)
    elif role=='guardian' or (role=='boss' and oath in {1,3,8,9,11,15}):design=construct(s,uid,oath,role,profile)
    elif (role=='altered' and oath in {3,9,14}) or (role=='morph' and oath in {3,14}) or (role=='guardian' and oath in {6,14}):design=biped_creature(s,uid,oath,role,profile)
    elif any(k in profile for k in ('wing','bird','kite','glider','flight','avian','plume','roost')) and 'flightless' not in profile:design=avian(s,uid,oath,role,profile)
    elif any(k in profile for k in ('ray','leviathan','serpent','aquatic','manta','otter','fin-backed')):design=serpent_or_ray(s,uid,oath,role,profile)
    elif any(k in profile for k in ('six-legged','six-limbed','many-legged','six limb','six foot','six stilts','six fins')):design=hexapod(s,uid,oath,role,profile)
    else:design=mammal(s,uid,oath,role,profile)
    identity_detail(s,uid,category,role,profile,oath)
    verts,faces=s.finish()
    # PBR embeddings: each model has species- and oath-sensitive distinct maps.
    add_pbr(s,uid,oath)
    doc.setdefault('extras',{})['reconstruction_revision']='R08_CANON_ANATOMY_SPECIFIC_REVIEW_ONLY'
    doc['extras']['unique_identity']=uid
    doc['extras']['anatomical_intent']=design
    doc['extras']['reference_specific_geometry']=bool(anatomy)
    doc['extras']['art_approval']=False
    doc['extras']['gameplay_animation_approval']=False
    doc['extras']['engine_performance_certified']=False
    raw=pack_glb(doc,s.body)
    dest=output/(uid+'.glb');dest.write_bytes(raw)
    return {'id':uid,'name':name,'role':role,'oath_id':entry.get('oath_id'),
            'path':dest.name,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),
            'vertices':verts,'triangles':faces,'primitives':len(doc['meshes'][0]['primitives']),
            'rig_joints':len(doc['skins'][0]['joints']),'animation_clips':len(doc['animations']),
            'anatomical_intent':design,'source_anatomy_used':bool(anatomy),'status':'UNAPPROVED_REVIEW_ONLY'}


def add_pbr(s,uid,oath):
    color=PALETTES[oath-1];rng=rng_for(uid+'pbr')
    def png(arr):
        stream=io.BytesIO();Image.fromarray(arr.astype('uint8'),'RGB').save(stream,'PNG',optimize=True);return stream.getvalue()
    def add_image(arr):
        data=png(arr);pad=(-len(s.body))%4;s.body.extend(b'\0'*pad)
        offset=len(s.body);s.body.extend(data);s.body.extend(b'\0'*(-len(s.body)%4))
        view=len(s.doc['bufferViews']);s.doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data)})
        im=len(s.doc['images']);s.doc['images'].append({'mimeType':'image/png','bufferView':view})
        tex=len(s.doc['textures']);s.doc['textures'].append({'source':im})
        return tex
    N=96
    x,y=np.meshgrid(np.linspace(-1,1,N),np.linspace(-1,1,N))
    for i,c in enumerate(color):
        noise=rng.normal(0,6,(N,N)); pattern=np.sin(x*25+i*2 +y*7)*2+np.cos(y*41+i*5)*1.8
        v=(noise+pattern)[:,:,None]
        base=np.clip(np.array(c,dtype=float)[None,None,:]+v,0,255)
        ambient=np.zeros((N,N,3),dtype=np.uint8);ambient[:,:,0]=255;ambient[:,:,1]=[228,182,194,207,176,204][i];ambient[:,:,2]=[0,20,6,4,2,12][i]
        normal=np.zeros((N,N,3),dtype=np.uint8);normal[:]=[128,128,255]
        normal[:,:,0]=np.clip(128+np.gradient(noise,axis=1)*1.3,0,255)
        normal[:,:,1]=np.clip(128+np.gradient(noise,axis=0)*1.3,0,255)
        a=add_image(base);b=add_image(ambient);cidx=add_image(normal)
        s.doc['materials'][i]={'name':uid+'::'+['hide','trim','vital-glow','fabric','keratin','dark-metal'][i],
            'pbrMetallicRoughness':{'baseColorTexture':{'index':a},'metallicRoughnessTexture':{'index':b},'metallicFactor':1,'roughnessFactor':1},
            'normalTexture':{'index':cidx,'scale':.6},'doubleSided':False}


def main():
    a=argparse.ArgumentParser();a.add_argument('source_zip',type=pathlib.Path);a.add_argument('output_dir',type=pathlib.Path)
    a.add_argument('--canon',type=pathlib.Path,default=None);a.add_argument('--start',type=int,default=0);a.add_argument('--limit',type=int,default=125)
    args=a.parse_args();args.output_dir.mkdir(parents=True,exist_ok=True)
    canon={}
    if args.canon:
        for rel in ['AETHERION_CANON/12_CREATURES_AND_MOUNTS/CREATURE_MOUNT_MORPH_REGISTRY.json','AETHERION_CANON/05_FACTIONS_AND_CHARACTERS/CHARACTER_REGISTRY.json']:
            p=args.canon/rel
            if p.is_file():
                for row in json.loads(p.read_text())['records']:canon[row['id']]=row
    with zipfile.ZipFile(args.source_zip) as z:
        m=json.loads(z.read(PREFIX+'ROSTER_REBUILD_MANIFEST.json'))
        entries=[e for e in m['assets'] if e['identity_id'] not in EXCLUDE]
        if len(entries)!=125:raise ValueError(f'Expected 125 remaining identities, found {len(entries)}')
        result=[]
        for i,e in enumerate(entries[args.start:args.start+args.limit],args.start):
            res=build_one(e,z,args.output_dir,canon.get(e['identity_id']))
            result.append(res)
            if i%12==0:print(f'{i+1:03}/125 {res["id"]} {res["triangles"]} triangles',flush=True)
    p=args.output_dir/('R08_MANIFEST_BATCH_%03d_%03d.json'%(args.start,len(result)))
    p.write_text(json.dumps({'status':'REVIEW_ONLY_NOT_SOURCE_EXACT','records':result},indent=2)+'\n')
    print('Wrote',len(result),'assets',p,flush=True)

if __name__=='__main__': main()
