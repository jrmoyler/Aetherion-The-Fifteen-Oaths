"""Bake neutral front/back relief from the canonical Oath garment turnarounds."""
from pathlib import Path

from PIL import Image, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
# Source plate, front/back centre, shoulder y, hip y and half chest width.
# Coordinates use a common 305-pixel-wide proof of each 1536 x 1024 plate.
PANELS = [
    (90,44,117,30,67,14), (91,34,99,44,78,12),
    (89,41,115,40,72,13), (88,44,117,26,60,12),
    (85,46,115,31,63,11), (87,44,122,36,69,16),
    (84,49,119,35,65,11), (86,45,122,35,70,17),
    (82,41,120,32,67,17), (83,43,121,38,71,14),
    (81,43,114,28,58,10), (80,46,120,35,65,11),
    (79,39,118,27,63,15), (78,37,118,43,77,14),
    (77,43,116,29,62,13), (76,46,120,29,59,11),
    (75,45,119,29,59,10), (74,42,117,34,65,14),
    (73,42,117,31,68,19), (72,42,117,35,69,17),
    (71,43,116,32,63,11), (70,40,119,32,67,12),
    (69,42,117,29,63,12), (67,42,118,29,62,13),
    (68,43,118,33,65,12), (66,42,118,32,63,11),
    (65,42,118,32,65,12), (64,43,118,32,65,12),
    (63,43,120,33,65,13), (62,42,118,32,65,14),
]
TILE = 128
atlas = Image.new("L", (10*TILE, 6*TILE), 128)
for i, (ref, front, back, top, bottom, width) in enumerate(PANELS):
    source = Image.open(ROOT / f"assets/references/reference-{ref:03}/original.png").convert("L")
    scale = source.width / 305
    for side, x in enumerate((front, back)):
        box = tuple(round(v*scale) for v in (x-width, top, x+width, bottom))
        panel = source.crop(box).resize((TILE, TILE), Image.Resampling.LANCZOS)
        # Remove low-frequency studio lighting. Keep lapel seams, plate edges,
        # textile patterns and fastening details relative to their local dye.
        lum = np.asarray(panel, dtype=float)
        local = np.asarray(panel.filter(ImageFilter.GaussianBlur(9)), dtype=float)
        contrast = np.log((lum + 18) / (local + 18))
        relief = Image.fromarray(np.clip(128 + contrast*140, 0, 255).astype("uint8"))
        cell = i*2 + side
        atlas.paste(relief, (cell%10*TILE, cell//10*TILE))
atlas.save(ROOT / "game/public/assets/characters/reconstruction/tailoring.webp", quality=85, method=6)
