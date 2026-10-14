import json,sys,hashlib
from pathlib import Path
prefix=Path(sys.argv[1]);a=json.loads(Path(str(prefix)+'-glb.json').read_text());b=json.loads(Path(str(prefix)+'-blender.json').read_text());matches=[]
def error(x,y):
 mn=x['bounds']['min'];mx=x['bounds']['max'];converted=[mn[0],-mx[2],mn[1],mx[0],-mn[2],mx[1]]
 return max(abs(v-w) for v,w in zip(converted,y['min']+y['max']))
for ar in a['reports']:
 br=next(r for r in b['reports'] if r['path']==ar['path'])
 assert ar['sha256']==br['sha256'] and br['sourceBytesUnchanged']
 for c in ar['clips']:
  d=next(v for v in br['actions'] if v['name']==c['name'] or v['name'].startswith(c['name']+'_'))
  for x,y in zip(c['samples'],d['samples']):
   matches.append({'path':ar['path'],'clip':c['name'],'timeSeconds':x['time'],'blenderFrame':y['frame'],'maxBoundErrorMeters':error(x,y),'blenderFinite':y['finite'],'blenderBoneScaleRange':[y['minBoneScale'],y['maxBoneScale']],'threeNodeScaleRange':[x['minNodeScaleRatio'],x['maxNodeScaleRatio']]})
assert matches
maximum=max(r['maxBoundErrorMeters'] for r in matches);tol=.0001
first=next(r for r in a['reports'] if r['clips']);other=next(r for r in b['reports'] if r['path']==first['path']);x=first['clips'][0]['samples'][0];y=other['actions'][0]['samples'][0];bad=dict(y);bad['min']=[v+.01 for v in y['min']];bad['max']=[v+.01 for v in y['max']];neg=error(x,bad)>tol
out={'scope':'Review-only CPU evaluated animated world-bounds comparison; not per-vertex identity, material rendering, collision proof or visual approval','coordinateMapping':'glTF/Three XYZ meters -> Blender XYZ meters: (x,-z,y). No fitted offset or scale. Blender hidden bone custom-shape meshes excluded. Absolute clip time samples correspond to frame=seconds*24; first exported key is frame1, not time0. NLA muted to evaluate a single action.','toleranceMeters':tol,'samples':matches,'maxBoundErrorMeters':maximum,'negativeFixture1cmTranslationRejected':neg,'inputReports':[{'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [Path(str(prefix)+'-glb.json'),Path(str(prefix)+'-blender.json')]],'status':'SCOPED_CPU_BOUND_COMPARISON_PASS' if maximum<=tol and neg else 'FAIL'}
Path(str(prefix)+'-comparison.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k not in ['samples','inputReports']},indent=2))
