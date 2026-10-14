# V15 walk grounding candidate

[Defect ledger and measured limits](DEFECT_LEDGER.md). This is a narrow animation repair from frozen V13, not an approved character or gameplay certification.

[Frame9 feet](walk-09-feet-comparison.png) · [Frame25 feet](walk-25-feet-comparison.png) · [Frame9 full body](walk-09-hero-comparison.png) · [Frame25 full body](walk-25-hero-comparison.png).

All baseline dependencies are under baseline/. To reproduce, copy author_grounding.py and baseline/ into a fresh directory and run Blender4.3.2:

```sh
blender -b -t 6 --python /path/to/new-directory/author_grounding.py
```

Run check_ground.py from that directory for source and actual primary/LOD imports; render_pairs.py produces matching before/after views. Do not rerun against this frozen directory. No byte-identical Blender-save promise is made. GLB geometry/data preservation is separately asserted and verified.
