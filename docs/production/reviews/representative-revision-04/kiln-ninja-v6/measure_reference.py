from pathlib import Path
from PIL import Image,ImageDraw
import hashlib,json
p=Path('/tmp/ninja-v6');source=Path('/workspace/Aetherion-The-Fifteen-Oaths/assets/references/reference-090/original.png');im=Image.open(source);points={'mainCrownTop':(100,740),'leftIris':(79,842),'rightIris':(121,842),'nasalTip':(100,870),'lipCleft':(100,890),'visibleChin':(99,914)}
a={'source':'reference-090 unmasked front panel','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'method':'Manual pixel picks on an enlarged unchanged source crop; approximate +/-4px, not a scan or likeness certification. Painted panel/body views have different scales.','uncertaintyPixels':4,'points':points,'eyeLineY':842,'eyeToChinPixels':72,'eyeToNoseOverEyeToChin':28/72,'eyeToLipOverEyeToChin':48/72,'limitations':['Model lowest head vertex is partly hidden by collar and is not homologous to painted visible chin.','Iris centers are approximately handpicked and should be independently reviewed.']};(p/'source-face-landmarks.json').write_text(json.dumps(a,indent=2)+'\n')
crop=im.crop((20,736,180,950)).convert('RGB').resize((640,856));draw=ImageDraw.Draw(crop)
for name,(x,y) in points.items():
 u=(x-20)*4;v=(y-736)*4;draw.line((u-8,v,u+8,v),fill='#f02030',width=2);draw.line((u,v-8,u,v+8),fill='#f02030',width=2);draw.text((u+10,v-10),name,fill='#f02030')
crop.save(p/'source-face-landmarks.png')
