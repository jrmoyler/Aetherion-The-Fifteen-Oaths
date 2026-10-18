"""Refine the shipped skinned characters without replacing costumes or animation.
Run from repo root: python tools/characters/refine_glb.py
Uses original committed GLBs so repeated runs are byte-identical. Requires numpy.
"""
import sys, json, struct, subprocess, pathlib, inspect, hashlib
import numpy as np
from PIL import Image
import io
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/blender/characters'))
from cf.heroes import HEROES
from cf.body import Body

def linear(c):
    v=np.array([int(c[i:i+2],16)/255 for i in (1,3,5)])
    return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4).tolist()
def transform(v): return np.asarray(v)[...,[0,2,1]]*np.array([1,1,-1])

def refine(key,spec):
    asset_path=ROOT/f'game/public/assets/characters/{key}.glb'
    source=subprocess.check_output(['git','show',f'4080e58d17d56bb5a92dfe3556630258d0762205:game/public/assets/characters/{key}.glb'],cwd=ROOT)
    n=struct.unpack_from('<I',source,12)[0];j=json.loads(source[20:20+n]);binary=bytearray(source[28+n:]);body=Body(spec['body']);hs=body.hs
    def read(ai):
        a=j['accessors'][ai];v=j['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[a['componentType']]
        return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dtype).itemsize*width),np.dtype(dtype).itemsize)).copy()
    def write(ai,values):
        a=j['accessors'][ai];v=j['bufferViews'][a['bufferView']];offset=v.get('byteOffset',0)+a.get('byteOffset',0);data=values.astype('<f4').tobytes();binary[offset:offset+len(data)]=data
        if 'min' in a: a['min']=values.min(0).tolist();a['max']=values.max(0).tolist()
    mesh=j['meshes'][0];prim=mesh['primitives'][0];p=read(prim['attributes']['POSITION']);old=p.copy();hc=transform(body.hc);q=(p-hc)/hs
    # Correct the pointed mask-like jaw on older, full-faced references. Continuous
    # weights preserve neck, ear and hair attachment; eye landmarks stay untouched.
    age=body.p['age'];mass=body.p['mass'];fem=body.p['sex']
    uv=read(prim['attributes']['TEXCOORD_0'])
    texture=j['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']
    im=j['images'][j['textures'][texture]['source']];bv=j['bufferViews'][im['bufferView']]
    tex=np.asarray(Image.open(io.BytesIO(binary[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGB'))/255
    colors=tex[np.clip((uv[:,1]*tex.shape[0]).astype(int),0,tex.shape[0]-1),np.clip((uv[:,0]*tex.shape[1]).astype(int),0,tex.shape[1]-1)]
    eyes=[]
    for side in (-1,1):
        expected=transform(body.eye_c[side]);mask=(abs(p[:,0]-expected[0])<.013*hs)&(p[:,1]>expected[1]-.012)&(p[:,1]<expected[1]+.055)&(p[:,2]>expected[2]-.025)&(colors.min(1)>.63)&(np.ptp(colors,axis=1)<.22)
        cand=p[mask]
        if len(cand)>8:
            counts,edges=np.histogram(cand[:,1],bins=18);y=(edges[counts.argmax()]+edges[counts.argmax()+1])/2
            cand=cand[abs(cand[:,1]-y)<.018*hs]
            ec=np.array([expected[0]*1.2,np.median(cand[:,1]),cand[:,2].max()+.001*hs])
        else:ec=expected+np.array([0,0,.012*hs])
        eyes.append(ec)
    eye_y=float(np.mean([e[1] for e in eyes]))
    for eye in eyes:eye[1]=eye_y
    # The GLB export baked the head pose. Read visible eye islands to relocate
    # facial landmarks in that baked space instead of assuming procedural rest.
    eye_mid=np.mean(eyes,axis=0);hc[1]=eye_mid[1]-.012*hs
    q=(p-hc)/hs
    hairmask=(p[:,1]>eye_mid[1]+.025*hs)&(p[:,1]<eye_mid[1]+.19*hs)&(abs(p[:,0])<.14*hs)&(abs(p[:,2]-hc[2])<.16*hs)&(np.ptp(colors,axis=1)<.17)
    if 'K.hair_cap' not in inspect.getsource(spec['outfit']):hairmask[:]=False
    # Submillimetre relief is cut into the existing scalp mesh, preserving its
    # silhouette and avoiding duplicate hair caps or free-floating tube strands.
    normal=read(prim['attributes']['NORMAL'])
    relief=(np.sin(q[:,0]*840+q[:,1]*130+np.sin(q[:,2]*55)*3)*.00065*hs)*hairmask
    p+=normal*relief[:,None]
    front=np.clip((q[:,2]-.035)/.035,0,1)*np.exp(-np.minimum((q[:,0]/.085)**8,80))*np.clip((.17-q[:,2])/.025,0,1);jaw=np.exp(-((q[:,1]+.070)/.035)**2)*front
    p[:,0] *= 1+jaw*(.045+.10*max(mass,0)+.035*fem)
    p[:,2] -= hs*jaw*np.exp(-(q[:,0]/.038)**2)*(.0025+.004*age)
    p[:,1] += hs*.004*jaw*np.exp(-(q[:,0]/.035)**2)
    # Cheek volume follows the age/body profile in the reference registry.
    cheek=np.exp(-((np.abs(q[:,0])-.047)/.023)**2-((q[:,1]+.018)/.026)**2)*front
    p[:,0]+=np.sign(q[:,0])*hs*cheek*(.0015+.003*max(mass,0))
    p[:,2]+=hs*cheek*(.0008+.0017*age)
    write(prim['attributes']['POSITION'],p)
    # Area-weighted normals, welded by position so UV seams remain smooth.
    idx=read(prim['indices']).flatten();tris=p[idx.reshape(-1,3)];cross=np.cross(tris[:,1]-tris[:,0],tris[:,2]-tris[:,0]);norm=np.zeros_like(p)
    for c in range(3):np.add.at(norm,idx.reshape(-1,3)[:,c],cross)
    _,inverse=np.unique(np.round(p,6),axis=0,return_inverse=True);smooth=np.zeros((inverse.max()+1,3));np.add.at(smooth,inverse,norm);norm=smooth[inverse];norm/=np.maximum(np.linalg.norm(norm,axis=1)[:,None],1e-12)
    write(prim['attributes']['NORMAL'],norm)
    def accessor(data,kind,ctype=5126):
        while len(binary)%4:binary.append(0)
        arr=np.asarray(data,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[ctype]);offset=len(binary);binary.extend(arr.tobytes());vi=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':arr.nbytes});ai=len(j['accessors']);a={'bufferView':vi,'componentType':ctype,'count':len(arr),'type':kind}
        if kind=='VEC3':a.update(min=arr.min(0).tolist(),max=arr.max(0).tolist())
        j['accessors'].append(a);return ai
    vertex_color=np.ones((len(p),4),dtype=np.float32)
    if key=='oath-01-sorcerer':
        # Reference-091 is dark charcoal hair with silver streaks, not a white cap.
        streak=.16+.40*(.5+.5*np.sin(q[:,0]*510+q[:,1]*100))**8
        vertex_color[hairmask,:3]=streak[hairmask,None]
    prim['attributes']['COLOR_0']=accessor(vertex_color,'VEC4')
    headindex=j['skins'][0]['joints'].index(next(i for i,n in enumerate(j['nodes']) if n.get('name')=='head'))
    def add_geometry(name,verts,normals,indices,color,rough=.5):
        if not verts:return
        count=len(verts);mat=len(j['materials']);j['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':linear(color)+[1],'roughnessFactor':rough,'metallicFactor':0}})
        joints=np.zeros((count,4),dtype=np.uint16);joints[:,0]=headindex;weights=np.zeros((count,4));weights[:,0]=1
        mesh['primitives'].append({'attributes':{'POSITION':accessor(verts,'VEC3'),'NORMAL':accessor(normals,'VEC3'),'JOINTS_0':accessor(joints,'VEC4',5123),'WEIGHTS_0':accessor(weights,'VEC4')},'indices':accessor(np.array(indices).reshape(-1),'SCALAR',5125),'material':mat})
    # Physical iris + pupil surfaces survive texture mip reduction. Both are
    # attached to the existing head joint, using the original sculpt landmarks.
    for label,radius,depth,color in [('iris',.0047,.0118,spec.get('eyes','#403024')),('pupil',.0019,.0125,'#080a0b')]:
        vv=[];nn=[];ii=[]
        for sx in (-1,1):
            ec=eyes[0 if sx==-1 else 1].copy();ec[2]+=(depth-.0118)*hs;base=len(vv);vv.append(ec.tolist());nn.append([0,0,1])
            for k in range(33):
                a=k/32*np.pi*2;vv.append((ec+np.array([np.cos(a)*radius*hs,np.sin(a)*radius*hs,-.0005*hs])).tolist());nn.append([0,0,1])
            for k in range(32):ii.extend([base,base+k+1,base+k+2])
        add_geometry(label,vv,nn,ii,color,.3)
    hairvertices=int(np.count_nonzero(hairmask))
    j.setdefault('extras',{})['characterRefinement']={'version':1,'reference':spec['ref'],'method':'reference-profile facial surface correction, physical eyes, scalp relief','referenceExact':False}
    j['buffers'][0]['byteLength']=len(binary)
    while len(binary)%4:binary.append(0)
    js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
    out=struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
    asset_path.write_bytes(out)
    return {'id':key,'reference':spec['ref'],'movedVertices':int(np.count_nonzero(np.linalg.norm(p-old,axis=1)>1e-7)),'maxDisplacementMeters':round(float(np.linalg.norm(p-old,axis=1).max()),6),'groomVertices':hairvertices,'sourceSHA256':hashlib.sha256(source).hexdigest(),'resultSHA256':hashlib.sha256(out).hexdigest(),'bytes':len(out),'triangles':sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives']),'clipsPreserved':len(j.get('animations',[]))}

if __name__=='__main__':
    report=[refine(k,s) for k,s in HEROES.items()]
    (ROOT/'tools/characters/refinement-report.json').write_text(json.dumps(report,indent=2)+'\n')
    manifest_path=ROOT/'game/public/assets/characters/manifest.json'
    manifest=json.loads(manifest_path.read_text()); by_id={r['id']:r for r in report}
    for entry in manifest:
        r=by_id.get(entry['id'])
        if r:entry.update(bytes=r['bytes'],tris=r['triangles'],refinementVersion=1)
    manifest_path.write_text(json.dumps(manifest,indent=1)+'\n')
    print(json.dumps({'characters':len(report),'movedVertices':sum(r['movedVertices'] for r in report),'groomVertices':sum(r['groomVertices'] for r in report)}))
