# Reference coverage inventory

Run from any working directory with Python 3 and Pillow:

```sh
python /path/to/Aetherion-The-Fifteen-Oaths/tools/production/reference_inventory.py \
  --output-dir /tmp/final-reference-inventory
```

`--root /path/to/repository` overrides the repository root derived from the script location. The output directory is required and must resolve outside that root. The tool only reads registries, original images and diagrams; it does not generate art, alter registries or approve artwork. Pillow is the only nonstandard Python dependency (`python -m pip install Pillow` if absent); the receipt records its installed version.

The tool consumes `validation/production/inventory.json`, resolves its source record pointers into the Phase I and Phase II registries, reads the reference index, art guides and exact castable links, and checks all 114 original image files. The generated production inventory must already describe the desired source revision; this tool does not rebuild it. The source Git HEAD and every consumed file's SHA256 are recorded. Header/decode checks establish readable image bytes, not visual sufficiency.

Outputs:

- `aetherion-missing-reference-inventory.json` and `.md`: full requirement rows, component labels, source pointers, coverage classes, nonvisual exclusions and explicit overlap lists. Families, detail identities and module pointers overlap; their sum is not a mesh count or image quota.
- `aetherion-reference-generation-first-wave.json` and `.md`: 15 confirmed architecture construction gaps, each with 17 module pointers, exact specifications, original-image relative paths/hashes, Oath constraints and required view sets. Resolve image paths against `--root`.
- Both JSON files also have deterministic `.json.gz` versions (`mtime=0`). Read them with `gzip.open(path, 'rt')` and `json.load`, or `gzip -dc file.json.gz`.
- `reference-inventory-verification.json`: generator/dependency versions, all input hashes, output hashes and consistency checks.

`referenceCoverage` describes explicit mapping evidence, not approval. `nextReferenceAction` separates panel review, dedicated ID sheets, missing construction supplements and nonvisual requirements. All visual Phase I families require panel review before commissioning replacements, even where registry links are absent. Existing overview images never cover every descendant automatically. The 15 capital SVGs and continent SVG count as diagrams, not appearance sheets. Prior human observations are labelled historical; the automated run performs no pixel judgment.

Checks fail loudly for duplicate identities, changed source bytes, missing/corrupt originals, unexpected 15×17 architecture scope, broken brief-image hashes, incorrect 60-settlement/90-district overlap, or review-first IDs entering generation groups. These exact scope checks are intentional for the current 114-image foundation; update them deliberately if the canon scope changes. Generated sheets remain proposed and require separate exact-art review.
