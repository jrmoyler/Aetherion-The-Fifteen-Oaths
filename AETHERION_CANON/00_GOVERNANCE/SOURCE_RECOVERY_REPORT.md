# Aetherion source recovery report

Recovered on 2026-10-13. Scope: available ChatGPT project conversations, Library references and targeted Drive searches. Existing artwork was recovered before proposing new designs. No images were generated, replaced, edited or published by this recovery. Ability-Matrix was not modified.

## Verified recovery

- 114 original PNG files materialized and decoded successfully.
- Selected-image accessibility: 114 accessible; 0 unavailable; 0 metadata-only. No unlocated file is asserted not to exist.
- All 114 images visually reviewed at overview/contact-sheet level: 53 overview/silhouette/construction sheets and 61 VFX/turnaround sheets.
- 114 distinct SHA-256 hashes; no byte-identical duplicates.
- 284,796,896 bytes total (about 271.6 MiB).
- 109 images are 1536 × 1024; four are 1774 × 887; one is 1881 × 836.
- 15 elemental realm overview sheets.
- 7 silhouette files: six main lineup sheets plus one correction.
- 30 character turnaround sheets: one ninja and one sorcerer for each element.
- 31 weapon/armor construction files: 30 planned coverage slots plus a second Arcane & Illusion weapon sheet.
- 31 VFX sequence sheets: Fire 10, Frost 6, Lightning 9, Water 6.

The inventory records original filenames, Library IDs, source file IDs, hashes, dimensions, access state, elemental affiliation, source conversation, visual evidence, conflicts and approval evidence. REF-000 through REF-113 are stable source aliases, paired with reference-000 through reference-113 record IDs. Files remain original reference images, not completed game meshes, rigs, shaders, audio or animations.

## Sources and provenance

- Aetherion project (private-source locator withheld)
- Aetherion Library folder (private-source locator withheld)
- Original user-authored world lore (private-source locator withheld)
- Design Element Reference Sheets (private-source locator withheld)
- Continue Turnaround Sheets (private-source locator withheld)
- Finish weapon armor sheets (private-source locator withheld)
- Completed Water VFX Sheets (private-source locator withheld)

The explicit Library folder currently lists the final two Water VFX images. The other 112 images retain root Library paths; the matching filenames, chronology and project conversations establish the reference series. The user also explicitly identified the Aetherion project as the location of their existing references. A folder-location difference does not imply those references are unrelated or unavailable.

Four reference-production conversations were read completely as exposed by the conversation reader: no truncation, no omitted content flags, and no pagination remaining. Image attachments are separately verified from actual Library bytes. The Aetherion Asset Strategy reader exposed the original user lore but omitted several assistant messages; their search snippets were not treated as user authority.

## Approval and canon status

The user commissioned unique reference designs for all fifteen elements, adopted the production sequence, and repeatedly continued through silhouettes, turnarounds, construction and VFX. This is strong provenance for the intended reference workflow. It is not explicit final-production approval of each image.

Existing designs must be preserved and used as visual references. Individual approval remains UNRESOLVED where only generation, commissioning or phase continuation is available. No file is labeled ApprovedConcept solely because it was recovered or imported. Current LOCKED names and foundational canon always take precedence over an older title, incidental image label or assistant proposal.

The original user-authored lore is stored separately from assistant suggestions. It establishes the continent, Oaths, Weave, First Fracture, opening hook and thematic/system ambitions. It does not establish named capital cities, named faction leaders, finalized coordinates, numerical economy values or production-ready gameplay implementation.

## Visual evidence and conflicts

1. All fifteen overview sheets visibly contain character, armor, weapon, item, prop/construct, environment and cast-study panels. Embedded environment panoramas are not modular environment kits. Embedded creatures/constructs are not creature turnarounds or rigs.
2. REF-092 is the later corrected Sorcerers 06–10 silhouette sheet. It renders the Daybreak sorcerer in black silhouette where REF-094 contains light-filled panels. The assistant explicitly instructed using the corrected sheet shown last. Both files are retained with UNRESOLVED replacement status. The assistant report establishes a supersession candidate, but explicit user-approved replacement was not recovered.
3. REF-036 and REF-037 are different Arcane & Illusion weapon sheets. The later file includes an Arcane rapier, mirrored baton and folding mirror grimoire; the other includes a ceremonial rapier and mirror codex. No explicit supersession was recovered. Preserve both and reconcile their names and added baton before claiming one final equipment set.
4. The initial conversation reported 78 castables; later VFX progress used 100. Treat this as a historical reported-count discrepancy. The pinned repository audit, rather than old conversation arithmetic, is authoritative for current code count.
5. Small text, dimension callouts, exact cross-view alignment and orthographic accuracy have not all been independently validated. Montage-level inspection establishes visible content and broad traits, not production fitness.

## Explicit gaps

- Dedicated VFX sheets for the other eleven elements were not recovered in this bounded search. The 31 sheets do not imply all 100 castables have complete VFX specifications or implementation.
- No dedicated creature, mount or morph turnaround set was recovered. Some creatures/constructs appear in overview panels and VFX studies.
- No separate modular environment construction kit, collision layout or measured continuous world map was recovered.
- No complete animation-pose/clip, icon/UI, audio, material-lighting test or item interaction-state series was recovered.
- Dedicated item and prop sheets were not recovered; the overview sheets contain relevant embedded panels.
- Individual final-art approvals remain unverified except the explicit correction-selection evidence described above.

These are recovery gaps, not claims that material can never exist elsewhere. Preserve the references already found and mark additions PROPOSED; do not fabricate missing prior work.

## Search boundaries and non-imported candidates

Targeted Drive searches for Aetherion and Ability-Matrix returned no results. A broader Tidal query returned unrelated projects and was not used as Aetherion canon. Global Search found the project, folder, original lore and four reference-production conversations. A recent Library listing covering 2026-10-12 onward was exhausted; targeted title/content searches corroborated the recovered references.

The same Library listing surfaced 27 Ability Atlas technical ZIP bundles/source archives and one Ability Atlas text file. These are metadata-only candidates, not recovered implementation in this asset pass. They were not imported, substituted for the authoritative Ability-Matrix source or presented as verified functionality.

Only project-specific excerpts, the sanitized inventory/report and authorized reference files should enter the destination repository. Broad search/list responses contain unrelated user materials and are not publication artifacts.

## Handoff

- SOURCE_INVENTORY.json: per-image provenance and verification records.
- RECOVERED_USER_LORE.md: original user-authored lore and exact source.
- CONVERSATION_EVIDENCE.md: relevant user quotes, phase progression, assistant completion claims and source links.
- OVERVIEW_CONSTRUCTION_PIXEL_EVIDENCE.json: overview, silhouette and construction image observations.
- ART_PIXEL_EVIDENCE.json: VFX and turnaround image observations, maintained by the art-production reviewer.

Repository import should preserve original bytes and verify hashes after copying. Publication must respect the destination repository visibility and the user's authorized audience. This recovery performs no push, merge or deployment.

## Local repository import verification

All 114 original files were copied into assets/references/reference-000/original.png through reference-113/original.png. Every destination SHA-256 matches its recovered source: 114/114 byte-identical, zero mismatches, 284,796,896 total bytes. No byte-identical duplicates exist among the references. REFERENCE_IMPORT_VERIFICATION.json records each result. This verifies the local copy only; no push, merge or deployment was performed by the recovery worker. The destination GitHub repository is public, and that audience fact was communicated to the parent before publication.

## Public sharing authorization

After disclosure that the destination repository is public and that all 114 references would become publicly downloadable through the PR, the user replied “Yes you can.” (message private identifier withheld). This authorizes sharing the recovered references in that public repository. It does not establish individual final-art or production approval. REFERENCE_SHARING_APPROVAL.json preserves the exact question and answer.
