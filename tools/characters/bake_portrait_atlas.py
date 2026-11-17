"""Register the front portraits on the original 1536 x 1024 character sheets.

Landmarks are left pupil x, right pupil x, pupil-line y, and closed-mouth y,
in source pixels. Covered faces keep the sculpt's original material.
"""
from pathlib import Path
from PIL import Image, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parents[2]
PORTRAITS = {
    62: (96, 155, 786, 841), 64: (97, 146, 831, 880),
    66: (108, 152, 804, 852), 67: (99, 155, 819, 873),
    70: (102, 155, 800, 858), 72: (97, 146, 822, 868),
    74: (90, 146, 823, 883), 75: (89, 137, 841, 889),
    76: (108, 165, 805, 861), 77: (97, 163, 788, 855),
    78: (91, 151, 840, 903), 79: (77, 129, 816, 868),
    80: (84, 132, 833, 887), 81: (91, 149, 782, 844),
    82: (73, 124, 858, 907), 83: (89, 146, 816, 871),
    84: (98, 149, 831, 882), 85: (102, 150, 829, 884),
    86: (126, 188, 763, 828), 87: (93, 149, 852, 907),
    88: (103, 159, 751, 811), 89: (84, 127, 860, 906),
    90: (79, 125, 843, 889), 91: (110, 154, 804, 847),
}
TILE = 160


def bake(root=ROOT):
    atlas = Image.new('RGB', (6*TILE, 5*TILE), (128, 128, 128))
    for source, (left, right, eyes, mouth) in PORTRAITS.items():
        sheet = Image.open(root / f'assets/references/reference-{source:03}/original.png').convert('RGB')
        cx = (left + right) / 2
        # Same coordinate chart as the skin sculpt, x [-.4,.4], y [.5,-.5].
        sx, sy = (right-left)/.296, (mouth-eyes)/.295
        portrait = sheet.transform((TILE, TILE), Image.Transform.AFFINE,
            (.8*sx/TILE, 0, cx-.4*sx, 0, sy/TILE, eyes-.505*sy),
            Image.Resampling.BICUBIC)
        # Suppress broad illumination from the painted panel. Preserve localized
        # pigment and facial creases. The game lights supply moving highlights.
        low = portrait.filter(ImageFilter.GaussianBlur(15))
        cheek = ImageStat.Stat(portrait.crop((42, 96, 54, 106))).median
        pixels = []
        for rgb, broad in zip(portrait.getdata(), low.getdata()):
            pixels.append(tuple(round(max(0, min(255, v + .55*(mid-blur))))
                                for v, mid, blur in zip(rgb, cheek, broad)))
        portrait.putdata(pixels)
        n = source-62
        atlas.paste(portrait, (n%6*TILE, n//6*TILE))
    out = root / 'game/public/assets/characters/reconstruction/portrait-atlas.webp'
    atlas.save(out, quality=93, method=6)


if __name__ == '__main__':
    bake()
