# Source audit A — supplied URLs 1–21

Audit date: 2026-10-18. Repository metadata and recursive file trees were read through the GitHub API; listed source files and licenses were downloaded through raw GitHub. Commits below are default-branch HEAD observed during this audit. Raw file reads used the default branch during the same audit; the hashes identify the observed revision, not a cryptographic claim that every branch read was atomic.

Aetherion uses Babylon.js. No source in this audit was imported merely to satisfy a repository count. A Three.js scene, renderer, or animation object cannot be plugged directly into Babylon.

| Supplied URL | Observed commit | License finding | Concrete decision |
|---|---|---|---|
| [Ariescar/anyCreature](https://github.com/Ariescar/anyCreature) | `88041c1efb316370dd78963f422decd854fd9067` | MIT | Procedural rig/GLB authoring; animation mirror resampling and deformation checks. Best build-time candidate; no renderer needed for compiler. No generated model fidelity assumed. |
| [ClaytonWas/dungeon-crawler](https://github.com/ClaytonWas/dungeon-crawler) | `2490f8851d6a1b9121f6752f832218d0dfa41b64` | MIT | Dependency-injected damage/death/loot pipeline; source requires its server room maps, Socket.io and weapon managers. Reimplement target-specific encounter loop rather than transplant server. |
| [Fasani/three-js-resources](https://github.com/Fasani/three-js-resources) | `55d34f8574340aece4807f6509832631ac3d35ee` | MIT (repository) | Resource index only, not a game engine. Linked assets have their own licenses. |
| [Footprintarts/ThreeJS_FPS_2.0](https://github.com/Footprintarts/ThreeJS_FPS_2.0) | `e2f3fe94ffe681e331f03790b03c6185e5f80d15` | MIT | Capsule/Octree movement and reusable projectile pool. Three.js-specific. Inspected gameLoop divides delta by five but calls update once; do not copy this timing behavior. |
| [Julian-adv/OpenMMO](https://github.com/Julian-adv/OpenMMO) | `9fd2f5243b045fd95a2f33c4acab56cc48d5f54d` | PolyForm Noncommercial 1.0.0 | Do not import into commercial game under existing terms. LICENSE read in full; repo metadata NOASSERTION is not permission. |
| [MavonEngine](https://github.com/MavonEngine) | `Not applicable: owner URL` | Unresolved owner URL | URL identifies an owner, not a repository or revision. No unambiguous source selected. |
| [NafisRayan/3D-Game-Template-Ultimate](https://github.com/NafisRayan/3D-Game-Template-Ultimate) | `afe15865eafc86fbe1aab017d926ad3820b9a56b` | No license detected | README and tree show first/third-person physics playground and Mixamo models; reuse permission not established. |
| [NewKrok/three-particles](https://github.com/NewKrok/three-particles) | `f54737cabfec5668ac654c712aff0593162ca4ef` | MIT | Strong VFX reference: per-system update/dispose, lifetime curves, collision planes, instancing, trails. Direct module depends on Three.js; use Babylon particle APIs instead of adding a second renderer. |
| [ToxSam/os3a-gallery](https://github.com/ToxSam/os3a-gallery) | `085cf849bd66694c038a46aadf78a5aef37c5373` | No code license detected; collection-specific assets | README and license guide distinguish CC0 from CC-BY. Asset discovery candidate only after individual collection provenance verification. Gallery code not imported. |
| [VerseEngine/three-avatar](https://github.com/VerseEngine/three-avatar) | `f33eedd77b301a66bf134e4635b553dda2930175` | MIT | VRM/ReadyPlayerMe animation throttling, first/third-person layers, IK. src/avatar.ts assumes named head/arm/face bones and three-vrm; incompatible with arbitrary Babylon GLBs without adapter. |
| [aarxa/threeJS-project](https://github.com/aarxa/threeJS-project) | `8adf56f375d146b07571b54e0d25b8383d59f2ea` | No license detected | README and tree show Littlest Tokyo viewer with Draco/OrbitControls. No target gameplay feature; model provenance must be checked separately. |
| [adorablemussel/3D-character-creator](https://github.com/adorablemussel/3D-character-creator) | `a7144e36da9f539f909ca8f1d69786f45b4f6b6a` | No license detected | README and tree show modular GLB parts, textures, NestJS backend. No code or assets imported. |
| [aeml/eidolon](https://github.com/aeml/eidolon) | `c509eecca375fcc9dcbf61b888075e8e1e24d8ed` | AGPL-3.0 code; custom ASSET-LICENSE | Code license and custom asset source-sharing/share-alike conditions read. Do not silently import into this project; assets are not blanket CC0 even where third-party base meshes are CC0. |
| [aresrpg](https://github.com/aresrpg) | `Not applicable: owner URL` | Unresolved owner URL | URL identifies an organization, not a specific repository or revision. No unambiguous source selected. |
| [bandinopla/three-mediapipe-rig](https://github.com/bandinopla/three-mediapipe-rig) | `3ab212719826cb762d08b27cd987dba41d96701c` | No license detected | README and tree show webcam face/body/hand retargeting. Three inference models carry performance cost; not useful for core combat or PWA fix. |
| [cortiz2894/showcase-images](https://github.com/cortiz2894/showcase-images) | `08717f843df948a1b3baeefb2676840da9c5e651` | No license detected | README and tree show scroll-driven cylindrical gallery shaders and atlas. Gallery presentation does not supply game systems; no import. |
| [dgreenheck/threejs-procedural-planets](https://github.com/dgreenheck/threejs-procedural-planets) | `23457d4f8e6bedf22aa266e12c92f850822ff3a4` | MIT | Atmosphere source uses BufferGeometry/ShaderMaterial and DOM shader strings. Cloud point sizing and geometry disposal are reference ideas; planetary scene is not Aetherion continent architecture. |
| [doinel1a/vite-three-js](https://github.com/doinel1a/vite-three-js) | `58157e8ee012e788aeecf4f60591ab7471c82b71` | MIT | Inspected Vite config is legacy+GLSL plugins, not an offline service worker. Do not treat webmanifest presence as complete PWA implementation. |
| [emineugurlu/3D](https://github.com/emineugurlu/3D) | `4d559d4821e37ed8594ddb0235141ef5f81b8812` | MIT | Inspected script is scroll-directed bee GLB animation using CDN Three 0.129 + GSAP; frame-fixed mixer.update(0.02), silent load errors. Not a robust game loop candidate. |
| [hunkim/3D_Archers](https://github.com/hunkim/3D_Archers) | `46628859e1f6db06564b283d42bb44d6d2309374` | No license detected | README describes charge/release arrows, combo scores and mobile aim. Mechanics can inform original design; source reuse permission not established. |
| [icurtis1/character-controller-sample-project](https://github.com/icurtis1/character-controller-sample-project) | `010960e1f2b339b5731c06d525e7454033668b5a` | No license detected | README and tree show R3F/Rapier movement, follow camera and mobile controls. Engine mismatch and no detected reuse grant. |

## Files actually read

All 19 repository metadata records and recursive trees were inspected. Owner-only URLs were classified from their URL shape, with no repository selected. Additional file contents read:

- **Ariescar/anyCreature**: `LICENSE`, `engine_core_anim.js`, `engine_core_checks.js`.
- **ClaytonWas/dungeon-crawler**: `LICENSE`, `server_systems_combatSystem.js`.
- **Fasani/three-js-resources**: `README.md`.
- **Footprintarts/ThreeJS_FPS_2.0**: `LICENSE`, `src_systems_gameLoop.js`, `src_systems_physics.js`.
- **Julian-adv/OpenMMO**: `LICENSE`.
- **NafisRayan/3D-Game-Template-Ultimate**: `README.md`.
- **NewKrok/three-particles**: `LICENSE`, `README.md`, `src_js_effects_three-particles_three-particles-curves.ts`.
- **ToxSam/os3a-gallery**: `README.md`, `docs_en_about_license.md`.
- **VerseEngine/three-avatar**: `LICENSE`, `src_avatar.ts`.
- **aarxa/threeJS-project**: `readme.md`.
- **adorablemussel/3D-character-creator**: `README.md`.
- **aeml/eidolon**: `ASSET-LICENSE`, `LICENSE`.
- **bandinopla/three-mediapipe-rig**: `README.md`.
- **cortiz2894/showcase-images**: `README.md`.
- **dgreenheck/threejs-procedural-planets**: `LICENSE`, `scripts_atmosphere.js`.
- **doinel1a/vite-three-js**: `LICENSE`, `vite.config.js`.
- **emineugurlu/3D**: `3D_script.js`, `LICENSE`.
- **hunkim/3D_Archers**: `README.md`.
- **icurtis1/character-controller-sample-project**: `README.md`.

Local downloaded filenames flatten source path slashes to underscores in the list above. Source paths are also visible in the repository tree at each observed revision. License conclusions for unlicensed repositories mean no repository license was detected in metadata/tree; they do not claim every possible external permission was investigated. No third-party asset was downloaded into the game by this audit.

## Recommended implementation priorities

1. Preserve the existing Babylon rendering and GLB asset pipeline. Fix lifecycle, pause/resume timing, player feedback and bounded particles natively.
2. Borrow architecture ideas from the MIT dungeon-crawler combat separation, but keep Aetherion ability and progression data authoritative.
3. anyCreature is a possible future offline creature-authoring tool. It requires an actual spec, full compiler dependency chain, deformation tests and rendered reference comparison; importing the compiler alone does not improve existing character art.
4. Resolve missing source licenses before any future code/asset copying. OpenMMO and Eidolon require explicit product/license decisions before integration.
