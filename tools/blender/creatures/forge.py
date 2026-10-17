"""Aetherion creature forge — reproducible, code-only creature pipeline (Blender 5.2 as a module).

Usage (from repo root):
  /opt/blender-venv/bin/python tools/blender/creatures/forge.py                # all archetypes + variants
  /opt/blender-venv/bin/python tools/blender/creatures/forge.py hound golem    # selected archetypes (+their variants)
  /opt/blender-venv/bin/python tools/blender/creatures/forge.py hound-oath-01  # one id
  options: --base-only  --no-review  --jobs N
Requires scikit-image in the Blender venv (marching cubes):  /opt/blender-venv/bin/pip install scikit-image

Each id is built in its own Python process (fresh Blender state), then re-imported for
validation (VALIDATION.json) and rendered to a review contact sheet (review/<id>.png).
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
    jobs = 1
    if "--jobs" in argv:
        jobs = int(argv[argv.index("--jobs") + 1])
    names = [a for a in argv if not a.startswith("--") and not a.isdigit()]
    ids = ids_for(names, base_only)
    py = sys.executable
    env = dict(os.environ)
    env.setdefault("FORGE_SCRATCH", "/tmp/creatureforge")
    procs = []
    failed = []
    for cid in ids:
        while len([p for p in procs if p[1].poll() is None]) >= jobs:
            time.sleep(1)
        p = subprocess.Popen([py, os.path.abspath(__file__), "--build", cid], env=env)
        procs.append((cid, p))
    for cid, p in procs:
        if p.wait() != 0:
            failed.append(cid)
    ok = [c for c in ids if c not in failed]
    if review and ok:
        subprocess.call([py, os.path.join(HERE, "validate.py")] + ok, env=env)
    if failed:
        print("FAILED:", failed)
        sys.exit(1)


if __name__ == "__main__":
    main()
