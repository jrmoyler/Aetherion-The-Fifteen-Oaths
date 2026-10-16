# R06 — Role-aware motion prototypes and measured render evidence

**This is an engineering review milestone, not completed model-specific artwork or gameplay acceptance.**

## Artifacts

- R06 roster ZIP: `Aetherion_Roster_R06_Role_Motion_Preview_2026-10-16.zip` (32,048,602 bytes; SHA-256 `d78e44a910c20f3764cceb47a4d3cf331e2b321fc74faa9152a136da886e6a7b`).
- Render and deformation evidence ZIP: `Aetherion_R06_Render_Deformation_Engine_Proofs.zip` (928,380 bytes; SHA-256 `8404317b8cc69187e5c56731a480bb68676dbf8b33375faa68c750aa005173c6`).
- Their binary contents are available from the originating ChatGPT conversation, **not uploaded to GitHub on this PR**. The GitHub connector used for this branch cannot forward local binary ZIP bytes.

## Tested improvements

The additive `tools/production/author_roster_motion_preview.py` script takes the known R05 GLB archive and writes a candidate R06 archive. It preserves existing binary meshes and the original clips, adds 18–20 new role-scoped preview clips per asset (2,382 total), rewrites SHA-256/size entries, and keeps the whole roster unapproved. It requires Python with NumPy.

All 128 GLBs pass SHA-256, sampler bounds, independent trimesh imports and independent VTK 9.6.2 scene imports. A separate CPU glTF skinning evaluator produced finite, nonzero pose displacement for all 128 test clips. Four rest/CPU-deformed-pose pairs were rendered to PNG. This is actual numeric skeletal deformation **but not realistic contact, interpolation, collision, cloth or facial quality**.

Six models were rendered in VTK 9.6.2 EGL offscreen OpenGL at 512×512. Twelve warmed rest-frame samples per model produced median times of 3.02–4.77 ms and p95 of 3.69–6.19 ms. This is **only an isolated renderer benchmark**, not Three.js/WebGL, Godot, Unreal, mobile GPU, typical scene load, or a frame budget acceptance test.

### Recorded failures, not passed gates

1. **Direct appearance comparison failed:** proposed detailed artwork for `creature-o01-natural`, `creature-o03-natural` and `creature-o04-natural` differs substantially from procedural GLB forms, including absent expected limb/plating/wing/fur structures. Side-by-side contact sheets are in the separate evidence ZIP.
2. **VTK animation playback did not visually update:** VTK detected the new clips but, in six sampled tests, enabling and advancing one produced no changed output pixels. VTK exposed 18 of 21 and 20 of 24 total GLB animations for representative creature/humanoid models. Valid CPU pose changes cannot be misreported as a successful VTK animation playback pass.
3. **Missing DCC and game-engine certification:** Blender, Godot, Unreal Editor, Three.js runtime GPU and the physical Android test device were unavailable in this environment.
4. **Missing final art:** models are currently stylized blockouts. Unique high-resolution source-matched sculpts, retopology, PBR texture painting, facial and species-specific anatomies, deform-corrective rigs, IK and complete gameplay state graphs are incomplete.
5. **Unmerged remote binaries:** no corrected GLBs or final Blender files were committed in this PR. Production loading remains fail-closed.

## Reproduce the technical preview

```bash
python3 -m pip install numpy
python3 tools/production/author_roster_motion_preview.py \
  Aetherion_Roster_R05_YUp_Mesh_Correction_2026-10-16.zip \
  Aetherion_Roster_R06_Role_Motion_Preview_2026-10-16.zip
python3 tools/production/ingest_named_roster.py \
  Aetherion_Roster_R06_Role_Motion_Preview_2026-10-16.zip --repo . --dry-run
```

The R06 input ZIP is not in this branch; the script must be run in a workspace with the explicitly supplied R05 archive. After adding new animation clip references, the ingestion tool validates all named canon identities, binary hashes, skin weights, glTF Y-up and geometry constraints.

**All 128 models are still review candidates, 0 artwork approvals. PR #5 should remain Draft.** See [ROSTER_R06_RENDER_DEFORMATION_EVIDENCE.json](ROSTER_R06_RENDER_DEFORMATION_EVIDENCE.json) for measured values and limitations.
