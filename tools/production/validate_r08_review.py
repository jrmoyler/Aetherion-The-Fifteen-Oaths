#!/usr/bin/env python3
"""R08 review-only checks: all candidate GLBs, immutable SHA, rigs, materials, motion.
Requires numpy/trimesh for CPU import; optional VTK --vtk for renderer import.
Not art approval, gameplay tests or GPU device certification.
"""
import argparse,collections,hashlib,io,json,math,pathlib,struct,sys,time
import numpy as np
import trimesh

def main():
    ap=argparse.ArgumentParser();ap.add_argument('folder',type=pathlib.Path);ap.add_argument('--vtk',action='store_true');args=ap.parse_args()
    folder=args.folder;data=json.load(open(folder/'R08_MANIFEST_BATCH_000_125.json'))['records']
    issues=[];out=[];start=time.perf_counter()
    if args.vtk:
        import vtk
        from vtkmodules.vtkIOImport import vtkGLTFImporter
        from vtkmodules.vtkRenderingCore import vtkRenderer,vtkRenderWindow
        from vtkmodules.vtkRenderingOpenGL2 import vtkEGLRenderWindow
    for k,item in enumerate(data):
        fname=folder/item['path'];raw=fname.read_bytes(); t0=time.perf_counter(); h=hashlib.sha256(raw).hexdigest()
        if h!=item['sha256']:raise AssertionError(item['id']+' digest')
        if raw[:4]!=b'glTF' or struct.unpack_from('<I',raw,4)[0]!=2 or struct.unpack_from('<I',raw,8)[0]!=len(raw):raise AssertionError('GLB header')
        jlen=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+jlen]);start_bin=20+jlen
        bsize,bkind=struct.unpack_from('<I4s',raw,start_bin)
        body=memoryview(raw)[start_bin+8:]
        if bkind!=b'BIN\x00' or bsize!=len(body):raise AssertionError('BIN chunk')
        buffers=d.get('buffers',[])
        if len(buffers)!=1 or buffers[0]['byteLength']>bsize:raise AssertionError('buffer')
        for view in d['bufferViews']:
            if view.get('buffer',0)!=0 or view.get('byteOffset',0)+view['byteLength']>bsize:raise AssertionError('out of bounds view')
        if d['extras'].get('reconstruction_revision')!='R08_CANON_ANATOMY_SPECIFIC_REVIEW_ONLY':raise AssertionError('revision')
        if d['extras'].get('art_approval') is not False:raise AssertionError('unauthorized approved')
        if d['extras'].get('unique_identity')!=item['id']:raise AssertionError('identity')
        if d['extras'].get('coordinate_convention')!='GLTF_Y_UP_ROOT_ALIGNED_V1':raise AssertionError('Y-up')
        roots=d['scenes'][d['scene']]['nodes']; assert len(roots)==1
        assert d['nodes'][roots[0]]['name']=='Aetherion_ZUp_to_glTF_YUp'
        assert len(d['skins'])==1 and len(d['skins'][0]['joints'])==item['rig_joints']
        for j in d['skins'][0]['joints']:
            if j>=len(d['nodes']):raise AssertionError('joint index')
        ibm=d['accessors'][d['skins'][0]['inverseBindMatrices']]
        if ibm['count']!=len(d['skins'][0]['joints']):raise AssertionError('IBM count')
        if len(d['animations'])!=item['animation_clips']:raise AssertionError('clips missing')
        if len(d['materials'])<6 or len(d['images'])<18:raise AssertionError('materials')
        for mat in d['materials'][:6]:
            if not mat.get('normalTexture') or not mat['pbrMetallicRoughness'].get('baseColorTexture') or not mat['pbrMetallicRoughness'].get('metallicRoughnessTexture'):raise AssertionError('PBR channels')
        for im in d['images']:
            if 'uri' in im:raise AssertionError('external images')
        tris=0;zero=0;minweight=1;verts=0;geometry_digest=hashlib.sha256()
        for mesh in d['meshes']:
            for prim in mesh['primitives']:
                at=prim['attributes']
                for prop in ['POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0']:
                    if prop not in at:raise AssertionError('missing '+prop)
                def view_arr(acidx):
                    acc=d['accessors'][acidx];v=d['bufferViews'][acc['bufferView']];off=v.get('byteOffset',0)+acc.get('byteOffset',0)
                    count=acc['count'];return acc,off,count
                pos,offset,n=view_arr(at['POSITION']);
                if pos['componentType']!=5126 or pos['type']!='VEC3':raise AssertionError('positions format')
                coords=np.frombuffer(body,dtype='<f4',count=3*n,offset=offset).reshape(-1,3)
                if not np.isfinite(coords).all():raise AssertionError('nonfinite geometry')
                geometry_digest.update(coords.tobytes());verts+=n
                w,offset,wn=view_arr(at['WEIGHTS_0'])
                weights=np.frombuffer(body,dtype='<f4',count=4*wn,offset=offset).reshape(-1,4)
                if not np.isfinite(weights).all() or np.any(weights<-.0001) or np.any(weights>1.0001) or np.max(abs(weights.sum(axis=1)-1))>.001:raise AssertionError('skin weights')
                joint,offset,jn=view_arr(at['JOINTS_0']);js=np.frombuffer(body,dtype='<u2',count=4*jn,offset=offset).reshape(-1,4)
                if js.max()>=len(d['skins'][0]['joints']):raise AssertionError('invalid joint indices')
                ix,offset,ic=view_arr(prim['indices'])
                inds=np.frombuffer(body,dtype='<u4',count=ic,offset=offset).reshape(-1,3)
                if inds.max()>=n:raise AssertionError('index out of range')
                for chunk in np.array_split(inds, max(1,math.ceil(len(inds)/10000))):
                    a,b,c=coords[chunk[:,0]],coords[chunk[:,1]],coords[chunk[:,2]]
                    area2=np.sum(np.cross(b-a,c-a)**2,axis=1)
                    zero+=int((area2<1e-20).sum())
                tris+=len(inds)
        if zero:raise AssertionError(f'zero-area faces: {zero} {item["id"]}')
        if tris!=item['triangles']:raise AssertionError('face count')
        scene=trimesh.load(io.BytesIO(raw),file_type='glb',force='scene')
        if not scene.geometry:raise AssertionError('trimesh empty')
        rec={'id':item['id'],'triangles':tris,'vertices':verts,'primitives':len(d['meshes'][0]['primitives']), 'bones':len(d['skins'][0]['joints']),
             'clips':len(d['animations']),'import_trimesh':True,'geometry_sha256':geometry_digest.hexdigest(),
             'bytes':len(raw),'walltime_import_validation_s':round(time.perf_counter()-t0,4),'status':'REVIEW_UNAPPROVED'}
        if args.vtk:
            renderer=vtkRenderer();window=vtkEGLRenderWindow();window.SetOffScreenRendering(1);window.AddRenderer(renderer)
            importer=vtkGLTFImporter();importer.SetRenderWindow(window);importer.SetFileName(str(fname));importer.Update()
            if renderer.GetActors().GetNumberOfItems()==0:raise AssertionError('VTK empty scene')
            rec['import_vtk_scene']=True
            window.Finalize();del importer,window,renderer
        out.append(rec)
        if k%25==0:print('validated',k+1,'/',len(data),flush=True)
    digest_counts=collections.Counter(x['geometry_sha256'] for x in out)
    summary={'records':len(out),'zero_area_triangles':0,'unique_position_geometry_sha256':len(digest_counts),
             'exact_position_geometry_duplicates':sum(v-1 for v in digest_counts.values()),
             'trimesh_import_passes':sum(x['import_trimesh'] for x in out),
             'vtk_scene_import_passes':sum(x.get('import_vtk_scene',False) for x in out),
             'total_triangles':sum(x['triangles'] for x in out),'total_bytes':sum(x['bytes'] for x in out),
             'total_validation_wall_seconds':round(time.perf_counter()-start,3),
             'fidelity_approved':0,'engine_gameplay_certified':0,
             'disclosure':'Isolated structural/import checks only; not artist matched, gameplay ready or target GPU measured'}
    result={'summary':summary,'models':out};(folder/'R08_INDEPENDENT_VALIDATION.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(summary,indent=2))
if __name__=='__main__':main()
