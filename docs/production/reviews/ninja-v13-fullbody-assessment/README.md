# Frozen V13 full-body and pose review

This directory contains19actual renders and a specific [defect ledger](DEFECT_LEDGER.md), not a new production candidate. V13 source bytes remained unchanged. V14 materials were not used.

- [All19views](all19-contact-sheet.png)
- [Rest views](rest-contact-sheet.png)
- [Idle](idle_breath-contact-sheet.png), [walk](walk_in_place-contact-sheet.png), [cast](cast_release-contact-sheet.png)
- [Masked and unmasked heads](head-contact-sheet.png)
- [Source/hash and render evidence](render-evidence.json)
- [All128frames ground measurements](ground-clearance-allframes.json)

Reproduce to a new directory with the exact frozen source:

```sh
AETHERION_SOURCE=/tmp/ninja-v13/kiln-ninja-ensemble-candidate/kiln-ninja-ensemble-candidate.blend AETHERION_REVIEW_OUT=/tmp/ninja-v13-fullbody-reproduction blender -b -t 6 --python /tmp/ninja-v13-fullbody-review/render_review.py
```

The source hash is asserted before rendering. The script reads and poses a memory copy; it never saves the source. No approval or appearance parity is implied.
