import json,pathlib,hashlib,os,numpy as np
from PIL import Image
R=pathlib.Path(os.environ.get('AETHERION_REPOSITORY','/workspace/Aetherion-The-Fifteen-Oaths'));O=pathlib.Path(__file__).resolve().parent;T=O/'textures';T.mkdir(exist_ok=True)
reg=R/'AETHERION_CANON/21_WORLD_CONSTRUCTION_PHASE_II/ARCHITECTURAL_KIT_REGISTRY.json';kit=next(x for x in json.loads(reg.read_text())['records'] if x['id']=='p2-arch-09-daybreak-arcades')
(O/'source-kit-record.json').write_text(json.dumps(kit,indent=2)+'\n')
refs=[R/'assets/references/reference-105/original.png']+sorted((R/'assets/references/proposed-expansion-2026-10-13/generated').glob('daybreak-*'))+list((R/'assets/references/proposed-expansion-2026-10-13/generated').glob('p2-arch-09-*'))
(O/'work-list.json').write_text(json.dumps({'baseline_asset_id':kit['baseline_asset_id'],'specification_id':kit['id'],'registry_sha256':hashlib.sha256(reg.read_bytes()).hexdigest(),'status':'IN_PROGRESS_UNAPPROVED','module_identity_policy':'Registry modules have names, not separate IDs; preserve JSON pointer and original name. Derived output slugs are not canon IDs.','modules':[dict(original_name=m['name'],source_pointer=f'ARCHITECTURAL_KIT_REGISTRY.json#/records/8/modules/{i}',target_extent_m=m['target_extent_m'],connections=m['connections'],status='QUEUED') for i,m in enumerate(kit['modules'])],'additional_acceptance_fixtures':['residential','civic','work','straight-floor-join','wall-inside-outside-corners','stacked-floor','stair-and-landing','ramp-and-landing'],'remaining_states':['repair/event facade overlays','safe mechanism authority','damaged/cleared/rebuilt where applicable'],'reference_files':[{'path':str(p.relative_to(R)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'status':'ORIGINAL' if 'reference-105' in str(p) else 'PROPOSED'} for p in refs]},indent=2)+'\n')
n=512;y,x=np.mgrid[0:n,0:n]/n;rng=np.random.default_rng(902);noise=rng.random((n,n));wave=np.sin(2*np.pi*(x*3+y*2+.09*np.sin(2*np.pi*y*3)+.04*np.sin(2*np.pi*x*7)));vein=np.exp(-abs(wave)*50)
for name,base,rough,metal in [('marble',(0.82,.80,.735),.33,0),('masonry',(.54,.53,.47),.79,0),('bronze',(.55,.34,.105),.3,1),('weave',(.78,.735,.61),.85,0),('gripstone',(.26,.28,.255),.9,0)]:
 if name=='marble': h=noise*.025-vein*.1;c=np.array(base)[None,None,:]*(1-.25*vein[:,:,None])+(noise[:,:,None]-.5)*.035
 elif name=='bronze': h=.01*np.sin(y*2*np.pi*130)+noise*.025;c=np.array(base)[None,None,:]+(noise[:,:,None]-.5)*.05+(.025*np.sin(y*2*np.pi*130))[:,:,None]
 elif name=='weave': h=.12*(np.sin(x*2*np.pi*90)*np.cos(y*2*np.pi*90))+noise*.025;c=np.array(base)[None,None,:]+h[:,:,None]*.4
 else: h=noise*.15;c=np.array(base)[None,None,:]+(noise[:,:,None]-.5)*.12
 gy,gx=np.gradient(h);norm=np.stack([-gx*2,-gy*2,np.ones_like(h)],-1);norm/=np.linalg.norm(norm,axis=2)[:,:,None]
 for typ,arr in [('basecolor',c),('roughness',np.clip(rough+(noise-.5)*.09,0,1)),('metallic',np.full((n,n),metal)),('normal',norm*.5+.5)]:
  Image.fromarray((np.clip(arr,0,1)*255).astype('uint8')).save(T/f'{name}_{typ}.png')
print('17 original module requirements; 20 generated PBR maps')
