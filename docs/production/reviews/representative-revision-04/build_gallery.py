from pathlib import Path
import json,html,hashlib
ROOT=Path(__file__).resolve().parents[4]
OUT=ROOT/'docs/production/reviews/representative-revision-04'
def generate(entries):
 manifest={'status':'UNAPPROVED_REVIEW_ONLY','productionPromotion':False,'previousReview':'representative-revision-03','entries':entries}
 for entry in entries:
  entry['referenceFiles']=[{'path':f'assets/references/reference-{n:03d}/original.png','sha256':hashlib.sha256((ROOT/f'assets/references/reference-{n:03d}/original.png').read_bytes()).hexdigest()} for n in entry['references']]
  for view in entry['views']:
   assert (OUT/view['path']).is_file(),view['path']
  for asset in entry['sources']:assert (OUT/asset).is_file(),asset
 (OUT/'review-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 e=html.escape
 parts=['''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aetherion: reference repair review</title><style>body{margin:auto;max-width:1500px;padding:24px;font:17px/1.55 system-ui;background:#171b20;color:#e9edf1}a{color:#a9dcff}button{padding:10px;margin:4px;border:1px solid #94a3b8;background:#253545;color:white;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #ffd369;outline-offset:3px}section{border-top:1px solid #61707e;padding:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}img{width:100%;height:65vh;object-fit:contain;background:#32363b}figcaption{padding:8px 0}.badge{color:#ffce78;font-weight:700}nav{display:flex;gap:20px;flex-wrap:wrap}@media(max-width:800px){.pair{grid-template-columns:1fr}img{height:55vh}}</style><h1>Reference repair review</h1><p class="badge">Unapproved candidates — no production promotion</p><p>Blender CPU renders of actual editable geometry. Original sheets are shown unchanged. Side-by-side display does not imply calibrated camera registration, identical lighting or exact visual matching. Select a view or open the original image at full size.</p><nav>''']
 for x in entries:parts.append(f'<a href="#{e(x["id"])}">{e(x["title"])}</a>')
 parts.append('</nav>')
 for x in entries:
  ref='../../../../'+x['referenceFiles'][0]['path'];v=x['views'][0]
  parts.append(f'<section id="{e(x["id"])}"><h2>{e(x["title"])}</h2><p>{e(x["changes"])}</p><p><strong>Remaining:</strong> {e(x["remaining"])}</p><div class="pair"><figure><a href="{e(ref)}"><img loading="lazy" src="{e(ref)}" alt="Original reference sheet {x["references"][0]:03d}, unchanged"></a><figcaption>Original sheet {x["references"][0]:03d}; illustrated views are not calibrated scans.</figcaption></figure><figure><a class="render-link" href="{e(v["path"])}"><img class="render" loading="lazy" src="{e(v["path"])}" alt="{e(x["title"]+": "+v["label"])}"></a><figcaption class="render-caption">{e(v["label"])}</figcaption></figure></div><div aria-label="Candidate views">')
  for v in x['views']:parts.append(f'<button type="button" data-src="{e(v["path"])}" data-title="{e(x["title"]+": "+v["label"])}">{e(v["label"])}</button>')
  parts.append('</div><p>Editable sources: '+', '.join(f'<a href="{e(p)}">{e(Path(p).name)}</a>' for p in x['sources'])+'</p></section>')
 parts.append('''<p><a href="README.md">Review notes</a> · <a href="review-manifest.json">Manifest</a> · <a href="evidence.json">Checksums</a></p><script>document.querySelectorAll('button[data-src]').forEach(button=>button.addEventListener('click',()=>{const section=button.closest('section');const image=section.querySelector('.render');image.src=button.dataset.src;image.alt=button.dataset.title;section.querySelector('.render-link').href=button.dataset.src;section.querySelector('.render-caption').textContent=button.textContent;}));</script></html>''')
 (OUT/'index.html').write_text('\n'.join(parts)+'\n')
if __name__=='__main__':generate(json.loads((OUT/'review-manifest.json').read_text())['entries'])
