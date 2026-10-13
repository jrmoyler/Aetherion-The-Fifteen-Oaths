# Additive review receipts

Review04 was frozen with 204 files, including its original evidence manifest. The parent later added `PARENT_VISUAL_REVIEW.md` in commit `d723dcd`. The original bundle bytes, manifest and strict verifier remain unchanged.

The original `representative-revision-04/verify_bundle.py` intentionally verifies only the historical frozen set, so it reports this later addendum as an unlisted extra. That behavior is not a corruption finding for the separately recorded parent review, and its scope has not been silently broadened.

Run `python validation/production/review-addenda/verify_review04_addendum.py` from the repository checkout. This external verifier pins the original manifest hash and accepts the exact union of the original 204 files plus the one named, sized and SHA256-pinned parent addendum. It rejects all other extra files, missing files and changed bytes. A positive fixture and three negative fixtures exercise those cases. The receipt does not replace visual acceptance or engine/runtime tests.
