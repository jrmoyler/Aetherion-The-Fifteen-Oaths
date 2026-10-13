import bpy,json
from pathlib import Path
p=Path('/tmp/kiln-ninja-revision05');d=p/'kiln-ninja-ensemble-candidate';bpy.ops.wm.open_mainfile(filepath=str(d/'kiln-ninja-ensemble-candidate.blend'))
r=bpy.data.objects['Kiln_Ninja_Rig'];o=bpy.data.objects['Kiln_ninja_weighted_lowpoly'];zs=[v.co.z for v in o.data.vertices];height=max(zs)-min(zs)
result={'scope':'Rest-bone projected horizontal centers compared with manually picked reference090 garment centers; approximate, not exact mesh correspondence or visual approval.','sourceHeightPixels':623,'sourceManualUncertaintyPixels':5,'modelRestMeshHeightMeters':height,'measurements':[]}
for label,bone,span in [('knee','shin.',98),('ankle','foot.',142)]:
 left=r.data.bones[bone+'L'].head_local;right=r.data.bones[bone+'R'].head_local;separation=abs(left.x-right.x)
 result['measurements'].append({'landmark':label,'sourceSeparationPixels':span,'sourceNormalizedHeight':span/623,'modelRestJointSeparationMeters':separation,'modelNormalizedHeight':separation/height,'absoluteNormalizedDifference':abs(separation/height-span/623)})
(p/'stance-measurements.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
