"""Replay in a disposable copy; source reference is stored once in author payload."""
from pathlib import Path
import json,html
ROOT=Path(__file__).resolve().parent

def build():
 m=json.loads((ROOT/'review-manifest.json').read_text()); e=html.escape
 parts=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>V16 bracer review</title><style>body{max-width:1450px;margin:auto;padding:24px;background:#192028;color:#edf2f5;font:17px/1.5 system-ui}a{color:#a9d9ff}img{width:100%;object-fit:contain;max-height:85vh}button{padding:12px;margin:6px;background:#304251;color:white;border:1px solid white}button:focus-visible,a:focus-visible{outline:3px solid orange}figure{margin:20px 0}.badge{color:#ffce78}</style><h1>V16 left ceramic bracer</h1><p class="badge">Scoped construction improvement — unapproved, no production promotion</p><p>Original reference 090 is unchanged. Eight paired CPU renders compare frozen V15 (left) and V16 (right) with matching camera/pose settings. The source illustration is not a calibrated scan. This does not certify whole-character art, fit, gameplay or GPU equivalence.</p><p><a href="README.md">Scope and open defects</a> · <a href="review-manifest.json">View manifest</a> · <a href="independent-review/FINAL_PIXEL_REVIEW.md">Independent pixel review</a></p>']
 ref=m['reference']['path'];parts.append(f'<details><summary>Original reference 090</summary><a href="{e(ref)}"><img src="{e(ref)}" alt="Unchanged original reference 090 character sheet"></a></details>')
 first=m['views'][0];parts.append(f'<figure><a id="pair-link" href="{e(first["path"])}"><img id="pair" src="{e(first["path"])}" alt="{e(first["label"])}"></a><figcaption id="caption">{e(first["label"])}</figcaption></figure><div aria-label="Comparison views">')
 for v in m['views']:parts.append(f'<button type="button" data-src="{e(v["path"])}" data-label="{e(v["label"])}">{e(v["label"])}</button>')
 parts.append('</div><p>Continuous ceramic plate and recessed apertures improve on the open ladder. Broad proud retention bands, simplified latch proportions and uniform pitting remain. New bracer geometry passes scoped checks; inherited character zero-area/UV defects remain open. Read the full evidence before interpreting a validator pass.</p><script>document.querySelectorAll("button[data-src]").forEach(b=>b.addEventListener("click",()=>{document.querySelector("#pair").src=b.dataset.src;document.querySelector("#pair").alt=b.dataset.label;document.querySelector("#pair-link").href=b.dataset.src;document.querySelector("#caption").textContent=b.dataset.label;}));</script></html>')
 (ROOT/'index.html').write_text('\n'.join(parts)+'\n')
if __name__=='__main__':build()
