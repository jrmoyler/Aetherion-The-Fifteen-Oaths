#!/usr/bin/env python3
"""Aetherion R07 — authored species-specific mesh reconstruction, unapproved review.
Rebuild three creature meshes from canonical anatomy descriptions, preserving
R06 skinned nodes, authored clip arrays and Y-up root. No exact-art claims.
"""
import argparse, copy, hashlib, io, json, math, struct, zipfile
from PIL import Image
from pathlib import Path
from collections import defaultdict
import numpy as np
import trimesh

ROOT='AETHERION_ROSTER_REBUILD/'
SPECS={'creature-o01-natural':('01','slag-backed burrower'), 'creature-o03-natural':('03','copper-wing kite'), 'creature-o04-natural':('04','reedback estuary grazer')}
SRC=None
OUT=None

class Sculpt:
    def __init__(self,doc,body):
        self.doc=doc;self.body=body;self.shapes=defaultdict(list); self.joints={doc['nodes'][i].get('name'): k for k,i in enumerate(doc['skins'][0]['joints'])}
        self.geometries=0;self.extraBones=[]
    def add(self,geo,mat,bone='body',weightbone=None,weight=.0):
        if geo is None: return
        if len(geo.vertices)<3 or not len(geo.faces):return
        vertices=np.asarray(geo.vertices,dtype=np.float32)
        faces=np.asarray(geo.faces,dtype=np.uint32)
        normals=np.asarray(geo.vertex_normals,dtype=np.float32)
        if not np.isfinite(vertices).all() or not np.isfinite(normals).all(): raise ValueError('nonfinite geometry')
        # normalized local planar/triplanar projections; no image-baked lighting
        uv=np.asarray([((p[0]*.4+p[1]*.12)%1.,(p[2]*.35+p[1]*.07)%1.) for p in vertices],dtype=np.float32)
        J=np.zeros((len(vertices),4),dtype=np.uint16);W=np.zeros((len(vertices),4),dtype=np.float32)
        J[:,0]=self.joints[bone];W[:,0]=1.0
        if weightbone is not None:
            J[:,1]=self.joints[weightbone]
            # per-piece soft influence conservatively capped; zero-sum never allowed
            W[:,0]=1.-weight;W[:,1]=weight
        self.shapes[mat].append((vertices,faces,normals,uv,J,W))
        self.geometries+=1
    def ellipse(self,center,scale,mat,bone='body',detail=2,weightbone=None,weight=0):
        mesh=trimesh.creation.icosphere(subdivisions=detail,radius=1.0)
        mesh.vertices=np.asarray(mesh.vertices)*np.asarray(scale)+np.asarray(center)
        self.add(mesh,mat,bone,weightbone,weight)
    def link(self,start,end,r0,r1,mat,bone='body',sections=9,weightbone=None,weight=0):
        start=np.asarray(start,dtype=float);end=np.asarray(end,dtype=float);axis=end-start
        length=np.linalg.norm(axis)
        if length<1e-4:return
        axis=axis/length
        x=np.cross(axis,[1,0,0]);x=x/np.linalg.norm(x) if np.linalg.norm(x)>.001 else np.array([0,1,0])
        y=np.cross(axis,x)
        verts=[]
        for z,r in [(0,r0), (1,r1)]:
            for k in range(sections):
                theta=2*math.pi*k/sections
                verts.append(start+z*length*axis + r*(math.cos(theta)*x+math.sin(theta)*y))
        faces=[]
        for k in range(sections):
            n=(k+1)%sections
            faces.extend([(k,n,sections+n),(k,sections+n,sections+k)])
        faces += [tuple([k,n,sections*2] ) for k,n in []]  # explicit side only; add caps below
        verts.extend([start,end])
        for k in range(sections):
            n=(k+1)%sections
            faces.append((sections*2,n,k));faces.append((sections*2+1,sections+k,sections+n))
        self.add(trimesh.Trimesh(vertices=verts,faces=faces,process=False),mat,bone,weightbone,weight)
    def add_bone(self,name,parent,xyz):
        if name in self.joints:return
        idx=len(self.doc['nodes']);self.doc['nodes'].append({'name':name,'translation':list(xyz)})
        p=next(i for i,n in enumerate(self.doc['nodes']) if n.get('name')==parent)
        self.doc['nodes'][p].setdefault('children',[]).append(idx)
        self.joints[name]=len(self.doc['skins'][0]['joints'])
        self.doc['skins'][0]['joints'].append(idx)
        self.extraBones.append((name,idx,p,xyz))
    def append_accessor(self,values,typ,dtype,componentType):
        arr=np.asarray(values,dtype=dtype)
        if arr.ndim==1:arr=arr.reshape(-1,1)
        if len(self.body)%4:self.body.extend(b'\0'*(-len(self.body)%4))
        at=len(self.body);raw=arr.tobytes();self.body.extend(raw);self.body.extend(b'\0'*(-len(self.body)%4))
        v=len(self.doc['bufferViews']);self.doc['bufferViews'].append({'buffer':0,'byteOffset':at,'byteLength':len(raw)})
        a=len(self.doc['accessors']);self.doc['accessors'].append({'bufferView':v,'componentType':componentType,'count':len(arr),'type':typ})
        return a

    def assign_species_pbr(self,species):
        palette={
          'creature-o01-natural':[(49,43,41),(148,68,35),(180,110,48),(67,58,53),(161,141,110),(29,31,32)],
          'creature-o03-natural':[(38,43,52),(146,83,39),(207,139,38),(215,212,192),(155,109,48),(35,38,43)],
          'creature-o04-natural':[(95,114,113),(151,137,86),(66,58,47),(177,171,152),(57,55,48),(65,67,56)]
        }[species]
        rng=np.random.default_rng({'creature-o01-natural':43,'creature-o03-natural':113,'creature-o04-natural':173}[species])
        def put(png):
            if len(self.body)%4:self.body.extend(b'\0'*(-len(self.body)%4))
            start=len(self.body);self.body.extend(png);self.body.extend(b'\0'*(-len(self.body)%4))
            i=len(self.doc['bufferViews']);self.doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(png)})
            pic=len(self.doc['images']);self.doc['images'].append({'bufferView':i,'mimeType':'image/png'})
            tex=len(self.doc['textures']);self.doc['textures'].append({'source':pic})
            return tex
        S=128
        grid=np.linspace(-1,1,S)
        yy,xx=np.meshgrid(grid,grid)
        for m, color in enumerate(palette):
            texture=rng.normal(0,6 if m not in (2,4) else 2,(S,S,1))
            directional=np.sin(35*xx+9*yy)[...,None]*(1 if m not in (1,3) else 3)
            base=np.clip(np.array(color)[None,None,:]+texture+directional,0,255).astype('uint8')
            def png(data):
                out=io.BytesIO();Image.fromarray(data,'RGB').save(out,format='PNG',optimize=True);return out.getvalue()
            baseID=put(png(base))
            surface=np.zeros((S,S,3),dtype=np.uint8)
            surface[:,:,0]=255
            surface[:,:,1]=[226,181,226,234,205,178][m]
            surface[:,:,2]=[4,30,7,0,2,23][m]
            ormID=put(png(surface))
            normals=np.zeros((S,S,3),dtype=np.uint8)
            normals[:]=[128,128,255]
            bumps=rng.normal(0,4,(S,S))
            normals[:,:,0]=np.clip(128+bumps,0,255).astype('uint8')
            normals[:,:,1]=np.clip(128-bumps,0,255).astype('uint8')
            normalID=put(png(normals))
            self.doc['materials'][m]={'name':species+'::'+['body','accent','eye','soft-fur','keratin','hard-detail'][m],
                'pbrMetallicRoughness':{'baseColorTexture':{'index':baseID},'metallicRoughnessTexture':{'index':ormID},
                                        'baseColorFactor':[1,1,1,1],'roughnessFactor':1.,'metallicFactor':1.},
                'normalTexture':{'index':normalID,'scale':.42},'doubleSided':False}
    def finish(self):
        self.doc['meshes'][0]['primitives']=[]
        vertex_total=face_total=0
        for material,pieces in sorted(self.shapes.items()):
            v=[];f=[];n=[];uv=[];j=[];w=[];off=0
            for V,F,N,UV,J,W in pieces:
                v.append(V);f.append(F+off);n.append(N);uv.append(UV);j.append(J);w.append(W)
                off+=len(V)
            V=np.concatenate(v);F=np.concatenate(f);N=np.concatenate(n);UV=np.concatenate(uv);J=np.concatenate(j);W=np.concatenate(w)
            vertex_total+=len(V);face_total+=len(F)
            attrs={
                'POSITION':self.append_accessor(V,'VEC3','<f4',5126),
                'NORMAL':self.append_accessor(N,'VEC3','<f4',5126),
                'TEXCOORD_0':self.append_accessor(UV,'VEC2','<f4',5126),
                'JOINTS_0':self.append_accessor(J,'VEC4','<u2',5123),
                'WEIGHTS_0':self.append_accessor(W,'VEC4','<f4',5126),
            }
            index=self.append_accessor(F.reshape(-1),'SCALAR','<u4',5125)
            self.doc['meshes'][0]['primitives'].append({'attributes':attrs,'indices':index,'material':int(material),'mode':4})
        if self.extraBones:
            # preserve existing inverse bind data; append exact world inverse in column major layout
            accessor=self.doc['accessors'][self.doc['skins'][0]['inverseBindMatrices']]; view=self.doc['bufferViews'][accessor['bufferView']]
            at=view.get('byteOffset',0)+accessor.get('byteOffset',0)
            olds=np.frombuffer(self.body[at:at+accessor['count']*64],dtype='<f4').copy().reshape(-1,16)
            mats=[np.asarray(m).reshape(4,4).T for m in olds]
            for name,idx,p,xyz in self.extraBones:
                def world(node):
                    trans=np.asarray(self.doc['nodes'][node].get('translation',[0,0,0]),dtype=float)
                    T=np.eye(4);T[:3,3]=trans
                    for parent,src in enumerate(self.doc['nodes']):
                        if node in src.get('children',[]):
                            if src.get('name')=='Aetherion_ZUp_to_glTF_YUp':return T # inverse bind in pre-Y-up mesh frame
                            return world(parent)@T
                    return T
                M=world(idx)
                mats.append(np.linalg.inv(M))
            raw=np.array([m.T.flatten() for m in mats],dtype='<f4')
            self.doc['skins'][0]['inverseBindMatrices']=self.append_accessor(raw,'MAT4','<f4',5126)
        if self.extraBones:
            # Target newly authored middle legs, opposite front-limb phase on gait clips.
            for clip in self.doc['animations']:
                for new_name,source_name in [('leg.middle.L','leg.1'),('leg.middle.R','leg.2')]:
                    if new_name not in self.joints:continue
                    source=next((c for c in clip['channels'] if self.doc['nodes'][c['target']['node']].get('name')==source_name and c['target']['path']=='rotation'),None)
                    if source:
                        replacement=copy.deepcopy(source)
                        replacement['target']['node']=self.doc['skins'][0]['joints'][self.joints[new_name]]
                        clip['channels'].append(replacement)
        self.doc['buffers'][0]['byteLength']=len(self.body)
        self.doc.setdefault('extras',{})['reconstruction_revision']='R07_SPECIES_SPECIFIC_SCULPT_CANDIDATE_UNAPPROVED'
        self.doc['extras']['individually_modeled_topology']=True
        self.doc['extras']['reference_fidelity_approved']=False
        self.doc['extras']['visual_source']='proposed original batch03 reference; modeling features authored as parametric meshes, not photogrammetry'
        self.doc['extras']['r07_stats']={'vertices':int(vertex_total),'faces':int(face_total),'primitive_draw_call_proxy':len(self.shapes),'component_meshes':self.geometries,'new_skeleton_joints':[x[0] for x in self.extraBones]}
        return vertex_total,face_total

def burrower(s):
    # Body in original Z-up mesh space, facing -Y
    s.ellipse((0,0,.83),(.60,1.05,.41),0,detail=3)
    s.ellipse((0,-.92,.77),(.39,.45,.32),0,detail=3)
    s.ellipse((0,-1.31,.65),(.27,.32,.18),0,detail=2)
    s.ellipse((0,-1.51,.63),(.31,.19,.13),0)
    s.ellipse((0,.48,.62),(.43,.61,.33),0,detail=2)
    s.link((0,.72,.84),(0,1.57,.46),.39,.04,0,bone='tail',sections=14)
    # eye sockets and nostril folds
    for side in [-1,1]:
        s.ellipse((side*.305,-1.12,.86),(.075,.062,.052),4,bone='head')
        s.ellipse((side*.32,-1.15,.875),(.035,.036,.034),2,bone='head')
        s.ellipse((side*.14,-1.60,.69),(.056,.022,.03),4,bone='jaw')
        s.ellipse((side*.18,-1.47,.56),(.11,.035,.028),4,bone='jaw')
    # New functional middle leg bones (bone parents are pre-rotated body)
    for side in [-1,1]:
        s.add_bone('leg.middle.'+('L' if side<0 else 'R'),'body',(side*.40,.04,-.20))
    for side in [-1,1]:
        for rank,y,kind in [(0,-.62,'front'),(1,.04,'middle'),(2,.65,'hind')]:
            if rank==1:bone='leg.middle.'+('L' if side<0 else 'R')
            else: bone='leg.'+str({(-1,0):2,(1,0):1,(-1,2):4,(1,2):3}[(side,rank)])
            shoulder=(side*.48,y,.67 if rank!=2 else .72)
            elbow=(side*(.80 if rank==0 else .71),y-.07,.40)
            foot=(side*(.94 if rank==0 else .83),y-(.19 if rank==0 else .05),.13)
            rad=.22 if rank==0 else (.165 if rank==1 else .18)
            s.link(shoulder,elbow,rad,rad*.77,0,bone=bone,sections=13)
            s.link(elbow,foot,rad*.76,.11,0,bone=bone,sections=12)
            s.ellipse(foot,(.23,.20,.10),0,bone=bone)
            for i in [-1,0,1]:
                clawstart=(foot[0]+i*.09,foot[1]-.09,.11)
                clawend=(foot[0]+i*.13,foot[1]-.39 if rank==0 else foot[1]-.25,.035)
                s.link(clawstart,clawend,.07 if rank==0 else .05,0.003,4,bone=bone,sections=10)
    # overlap jagged mineral accretions along back: discrete plate clusters
    rng=np.random.default_rng(17)
    for k in range(155):
        y=float(rng.uniform(-.9,.95));angle=float(rng.uniform(.11,math.pi-.11))
        x=.53*math.cos(angle)*math.sqrt(max(.15,1-(y/1.23)**2))
        z=.84+.39*math.sin(angle)*math.sqrt(max(.18,1-(y/1.23)**2))
        p=np.array([x,y,z]);sc=np.array([rng.uniform(.065,.125),rng.uniform(.10,.23),rng.uniform(.07,.155)])
        # angular mineral scalation unlike generic smooth torso
        g=trimesh.creation.icosphere(subdivisions=0,radius=1)
        g.vertices=g.vertices*sc + p
        s.add(g,1 if k%4 else 5,'body')

def kite(s):
    # body perch, neck, curved beak, white throat and wing coverts
    s.ellipse((0,0,1.1),(.28,.48,.45),0,detail=3)
    s.ellipse((0,-.39,1.33),(.21,.26,.35),3,detail=3)
    s.ellipse((0,-.48,1.59),(.22,.21,.24),0,detail=3)
    s.link((0,-.62,1.55),(0,-.84,1.44),.105,.052,5,bone='head',sections=12)
    s.link((0,-.82,1.44),(0,-.86,1.34),.065,.006,5,bone='jaw',sections=11)
    for side in [-1,1]:
        s.ellipse((side*.204,-.56,1.65),(.051,.050,.048),2,bone='head')
        s.ellipse((side*.213,-.57,1.66),(.018,.018,.023),5,bone='head')
        # folded wings with overlapping feather layers; all driven by wing bone
        bone='wing.L' if side<0 else 'wing.R'
        s.ellipse((side*.33,.06,1.16),(.15,.41,.23),0,bone=bone)
        for row,spacing in [(0,14),(1,12),(2,9)]:
            for i in range(spacing):
                y=-.20+i*(.050 if row==0 else .064)
                x=side*(.35+row*.095+(.02 if i%2 else 0))
                z=1.23-row*.07 - i*.011
                s.link((x,y,z),(x+side*.025,y+.30+row*.14,z-.04),.065 if row==0 else .045,.002,1 if i%3 else 0,bone=bone,sections=7)
        # wing primaries spreading slightly outward toward rear
        for i in range(12):
            y=.13+i*.054
            s.link((side*.45,y,1.19),(side*(.76+i*.018),y+.49,1.05),.049,.002,5 if i%4==0 else 0,bone=bone,sections=6)
        # stable perching legs/talons
        bone='leg.1' if side>0 else 'leg.2'
        s.link((side*.18,.19,.82),(side*.22,.13,.24),.075,.055,4,bone=bone,sections=10)
        s.ellipse((side*.22,.10,.21),(.11,.14,.075),4,bone=bone)
        for d in [-1,0,1]:
            s.link((side*.22+d*.068,.04,.20),(side*.22+d*.09,-.16,.07),.029,.001,4,bone=bone)
        s.link((side*.24,.16,.18),(side*.24,.31,.055),.033,.001,4,bone=bone)
    # long feathered tail
    for k in range(11):
        x=(k-5)*.04
        s.link((x,.38,1.02),(x*2.2,1.10,.75),.08,.002,0 if k%2 else 1,bone='tail',sections=7)
    # pointed crown plumes
    for k in range(17):
        x=(k-8)*.027
        s.link((x,-.54,1.75),(x*1.8,-.34,1.84+(k%3)*.04),.018,.002,0,bone='crest',sections=5)

def grazer(s):
    # tapered large browsing torso, fully separate legs with two-point cleft hooves
    s.ellipse((0,.12,1.10),(.56,1.05,.48),0,detail=3)
    s.ellipse((0,-.76,.96),(.36,.49,.38),0,detail=3)
    s.ellipse((0,-1.10,.69),(.31,.45,.30),0,detail=2)
    s.ellipse((0,-1.37,.54),(.35,.29,.19),3,detail=2)
    for side in [-1,1]:
        s.ellipse((side*.31,-1.05,.79),(.14,.08,.14),3,bone='head')
        s.ellipse((side*.255,-1.22,.76),(.052,.039,.052),4,bone='head')
        s.ellipse((side*.265,-1.225,.77),(.018,.021,.023),5,bone='head')
        s.ellipse((side*.18,-1.62,.55),(.058,.043,.028),5,bone='jaw')
        s.link((0,.90,1.09),(0,1.45,.90),.16,.04,0,bone='tail',sections=11)
        for hind,y in [(False,-.58),(True,.70)]:
            bone='leg.'+str({(1,False):1,(-1,False):2,(1,True):3,(-1,True):4}[(side,hind)])
            shoulder=(side*.37,y,.92);knee=(side*.44,y+(.16 if hind else -.12),.47)
            ankle=(side*.50,y-(.10 if not hind else -.03),.16)
            s.link(shoulder,knee,.155,.115,0,bone=bone,sections=12)
            s.link(knee,ankle,.112,.082,0,bone=bone,sections=11)
            for toe in [-1,1]:
                x=ankle[0]+toe*.075
                s.ellipse((x,ankle[1]-.095,.09),(.092,.14,.078),4,bone=bone,detail=1)
    rng=np.random.default_rng(31)
    # reedlike keratinous dorsal bristles follow body's spine ridge
    for k in range(240):
        y=float(rng.uniform(-.95,1.07));u=float(rng.uniform(-1,1))
        x=u*.43*math.sqrt(max(.12,1-(y/1.37)**2))
        z=1.1+.43*math.sqrt(max(.12,1-(x/.7)**2-(y/1.55)**2))
        length=rng.uniform(.13,.36)
        s.link((x,y,z-.03),(x+u*.028,y+.14,z+length),.013,.002,1 if k%3 else 5,bone='body',sections=5)
    for k in range(38):
        x=rng.uniform(-.53,.53);y=rng.uniform(-.75,.85);z=.86+rng.uniform(-.14,.24)
        s.ellipse((x,y,z),(rng.uniform(.018,.05),rng.uniform(.025,.066),rng.uniform(.015,.05)),3,bone='body',detail=1)

def process(model,oath):
    with zipfile.ZipFile(SRC) as z:
        data=z.read(f'{ROOT}creatures/oath-{oath}/{model}.glb')
    n=int.from_bytes(data[12:16],'little');doc=json.loads(data[20:20+n]);p=20+n; bsize,bkind=struct.unpack_from('<I4s',data,p)
    if bkind!=b'BIN\x00': raise ValueError('bad GLB')
    body=bytearray(data[p+8:]);s=Sculpt(doc,body)
    if model=='creature-o01-natural':burrower(s)
    elif model=='creature-o03-natural':kite(s)
    else:grazer(s)
    verts,faces=s.finish()
    s.assign_species_pbr(model)
    doc["buffers"][0]["byteLength"]=len(s.body)
    j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4)
    body=s.body
    packed=(b'glTF'+struct.pack('<II',2,12+8+len(j)+8+len(body))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(body),b'BIN\x00')+body)
    target=OUT/(model+'.glb');target.write_bytes(packed)
    return {'id':model,'file':target.name,'sha256':hashlib.sha256(packed).hexdigest(),'bytes':len(packed),'vertices':verts,'faces':faces,'draw_call_proxy':len(s.shapes),'components':s.geometries,'extra_bones':[x[0] for x in s.extraBones],'approval':'UNAPPROVED_REVIEW_CANDIDATE'}

def main():
    global SRC, OUT
    parser=argparse.ArgumentParser(description='Generate three UNAPPROVED Aetherion reference-guided R07 GLBs from R06')
    parser.add_argument('source_zip',type=Path,help='User-supplied R06 role-motion GLB ZIP')
    parser.add_argument('output_dir',type=Path,help='Destination for three R07 review GLBs')
    args=parser.parse_args()
    SRC=args.source_zip.resolve(strict=True)
    OUT=args.output_dir.resolve()
    OUT.mkdir(parents=True,exist_ok=True)
    result=[process(m,o) for m,(o,_) in SPECS.items()]
    (OUT/'R07_MODEL_SPECIFIC_MANIFEST.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
