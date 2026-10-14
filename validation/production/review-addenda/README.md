# Additive review receipts

Review04 was frozen with 204 files, including its original evidence manifest. The parent later added `PARENT_VISUAL_REVIEW.md` in commit `d723dcd`. The original bundle bytes, manifest and strict verifier remain unchanged.

The original `representative-revision-04/verify_bundle.py` intentionally verifies only the historical frozen set, so it reports this later addendum as an unlisted extra. That behavior is not a corruption finding for the separately recorded parent review, and its scope has not been silently broadened.

Run `python validation/production/review-addenda/verify_review04_addendum.py` from the repository checkout. This external verifier pins the original manifest hash and accepts the exact union of the original 204 files plus the one named, sized and SHA256-pinned parent addendum. It rejects all other extra files, missing files and changed bytes. A positive fixture and three negative fixtures exercise those cases. The receipt does not replace visual acceptance or engine/runtime tests.

## Review05 parent addendum

Review05 originally contains 161 frozen files. Commit `ba3321b` adds only `PARENT_VISUAL_REVIEW.md`. Its historical strict verifier still checks the original frozen set and therefore reports that later document as an extra. No original review05 source, manifest or verifier has been rewritten.

Run `python validation/production/review-addenda/verify_review05_addendum.py` for the exact 162-file union, pinned by the original manifest SHA256 and the parent-document SHA256/size. The same positive and extra/missing/tampered negative fixtures apply. The parent review is pinned to its historical examined commit; it does not assess later candidates.
