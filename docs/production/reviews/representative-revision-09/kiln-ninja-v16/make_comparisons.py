from pathlib import Path
from PIL import Image,ImageDraw,ImageOps
P=Path(__file__).resolve().parent;O=P/'comparisons';O.mkdir(exist_ok=True);views=['front','back','side','hero','bracer-front','bracer-near','bracer-far','cast']
for view in views:
 ims=[Image.open(P/'renders'/f'{v}-{view}.png').convert('RGB') for v in ['v15','v16']];w,h=ims[0].size;c=Image.new('RGB',(w*2,h+35),'#eeeae3');d=ImageDraw.Draw(c)
 for k,(im,label) in enumerate(zip(ims,['Frozen V15 baseline','V16 bracer construction candidate - unapproved'])):c.paste(im,(k*w,35));d.text((k*w+12,10),label,fill='black')
 c.save(O/(view+'.png'))
c=Image.new('RGB',(1300,4*450),'#eeeae3');d=ImageDraw.Draw(c)
for k,v in enumerate(views):
 im=Image.open(O/(v+'.png')).convert('RGB');im.thumbnail((650,420));x=(k%2)*650;y=(k//2)*450;d.text((x+10,y+8),v,fill='black');c.paste(im,(x,y+30))
c.save(P/'all-views-contact-sheet.png')
