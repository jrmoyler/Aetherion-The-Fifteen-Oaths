# Candidate delivery manifest metadata

These fields support additive production candidates; none grant art, collision, engine or gameplay acceptance.

A manifest's `assets` array contains distinct candidate entries. Assembly fixtures remain separate metadata, outside `assets`; they do not create module designs. Nested per-module metadata must use `module.json`, not another ambiguous `manifest.json`.

`filePathBase` is optional and defaults to `REPOSITORY_ROOT`. `MANIFEST_DIRECTORY` explicitly resolves all `assets[].files` paths relative to the containing manifest. Both modes forbid absolute paths, backslashes, parent traversal and resolved paths outside `assets/production`. Inventory output always records repository-relative paths.

## Collision policy

Each asset may declare `collisionPolicy`:

- `{"mode":"REQUIRED"}` is the default. A collision GLB is mandatory; missing files are rejected.
- `{"mode":"NONE","reason":"Specific nonblocking geometry rationale"}` deliberately omits collision. A nonempty rationale is mandatory. This declaration is not proof of runtime safety or fit.
- `{"mode":"PENDING","reason":"Required collision is not yet authored","remainingGate":"Author and validate the missing collision"}` records an incomplete candidate. The inventory emits `CANDIDATE_INCOMPLETE_MISSING_REQUIRED_COLLISION`, retains the missing gate and counts it separately. It never reports the entry as a complete files-present candidate.

`NONE` and `PENDING` cannot also list a collision file. Null/empty collision paths are not omissions. Other required blend/primary/LOD/texture/render deliverables remain mandatory.

## Compressed Blender source evidence

Uncompressed `.blend` headers continue to be checked. A gzip or Zstandard compressed source additionally requires:

```json
"sourceValidation": {
  "report": "assets/production/oath-09/architecture/source-validation.json",
  "reportSha256": "SHA256_OF_EXACT_REPORT_BYTES",
  "recordId": "foundation-plinth"
}
```

The report path is always repository-relative, irrespective of `filePathBase`, and confined to production assets. Its SHA256 must match. Report schema:

```json
{
  "schemaVersion": 1,
  "tool": {"name": "Blender", "version": "4.3.2"},
  "reports": [{
    "module": "foundation-plinth",
    "opened": true,
    "source_sha256": "SHA256_OF_EXACT_COMPRESSED_SOURCE_BYTES",
    "errors": []
  }]
}
```

Generate the report from real Blender source opens. The selected record must occur exactly once and bind the exact source bytes; stale, failed, missing or mismatched records are rejected. The report itself is retained as a hashed `source_validation` artifact. This checks reproducible evidence linkage, not cryptographic certification of who ran Blender or visual quality. Independent import checks remain separate acceptance evidence.
