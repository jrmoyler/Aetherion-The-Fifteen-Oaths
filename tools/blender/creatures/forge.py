"""Aetherion creature forge — reproducible, code-only creature pipeline (Blender 5.2 as a module).

Usage (from repo root):
  /opt/blender-venv/bin/python tools/blender/creatures/forge.py                # all archetypes + variants
  /opt/blender-venv/bin/python tools/blender/creatures/forge.py hound golem    # selected archetypes (+their variants)
  /opt/blender-venv/bin/python tools/blender/creatures/forge.py hound-oath-01  # one id
  options: --base-only  --no-review
Requires scikit-image in the Blender venv (marching cubes):  /opt/blender-venv/bin/pip install scikit-image

Each id is built in its own Python process (fresh Blender state), then re-imported for
validation (VALIDATION.json, including the per-clip skin-deformation gate from deform_gate.py)
and rendered to review sheets: review/<id>.png (side, front-3/4, mid-attack),
review/<id>_attack_{side,front34}.png (4-frame attack strips) and review/<id>_turn.png.
"""
import os
import sys
import subprocess
import importlib
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

ARCHETYPES = ["hound", "boar", "stag", "raptor", "drake", "golem", "wraith", "spider", "serpent",
              "construct", "treant", "wisp"]

# per-Oath variants that need different dressing (archetype -> oaths)
VARIANTS = {
    "hound": ["oath-01", "oath-02", "oath-15"],
    "golem": ["oath-02", "oath-05", "oath-10", "oath-15"],
    "construct": ["oath-13", "oath-14"],
    "wraith": ["oath-09"],
    "drake": ["oath-01"],
}


def ids_for(args, base_only=False):
    out = []
    for a in args or ARCHETYPES:
        if "-oath-" in a:
            out.append(a)
            continue
        out.append(a)
        if not base_only:
            out += [f"{a}-{o}" for o in VARIANTS.get(a, [])]
    return out


def build_one(cid):
    from lib import core, build
    arch, _, oath = cid.partition("-")
    oath = oath or None
    core.reset()
    mod = importlib.import_module(f"archetypes.{arch}")
    spec = mod.build(oath)
    print(f"[forge] {cid}")
    return build.build(spec)


def main():
    argv = sys.argv[1:]
    if argv and argv[0] == "--build":
        build_one(argv[1])
        return
    base_only = "--base-only" in argv
    review = "--no-review" not in argv
    names = [a for a in argv if not a.startswith("--") and not a.isdigit()]
    ids = ids_for(names, base_only)
    py = sys.executable
    env = dict(os.environ)
    env.setdefault("FORGE_SCRATCH", "/tmp/creatureforge")
    failed = []
    for cid in ids:
        # one fresh process per creature (clean Blender state); validate + review right after
        if subprocess.call([py, os.path.abspath(__file__), "--build", cid], env=env) != 0:
            failed.append(cid)
            continue
        if review:
            # validate = re-import checks + deformation gate + review renders (turntable for
            # base archetypes only; variants share their rig and clips)
            extra = ["--no-turntable"] if "-oath-" in cid else []
            subprocess.call([py, os.path.join(HERE, "validate.py"), cid] + extra, env=env)
    if failed:
        print("FAILED:", failed)
        sys.exit(1)


if __name__ == "__main__":
    main()
