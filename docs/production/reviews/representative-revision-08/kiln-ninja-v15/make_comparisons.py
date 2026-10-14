from pathlib import Path
from PIL import Image,ImageDraw
p=Path(__file__).resolve().parent
for frame in [9,25]:
 for view in ['hero','feet']:
  w,h=(900,525) if view=='feet' else (750,900)
  sheet=Image.new('RGB',(w*2,h+36),(238,238,234));draw=ImageDraw.Draw(sheet)
  for i,name in enumerate(['before','after']):
   im=Image.open(p/'renders'/('%s-walk-%02d-%s.png'%(name,frame,view))).convert('RGB').resize((w,h));sheet.paste(im,(i*w,30));draw.text((i*w+12,10),'V13 baseline' if name=='before' else 'V15 walk vertical correction — unapproved',fill='black')
  sheet.save(p/('walk-%02d-%s-comparison.png'%(frame,view)))
