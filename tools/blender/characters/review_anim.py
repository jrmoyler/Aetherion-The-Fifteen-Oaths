"""Render a strip of animation poses from an exported hero GLB (motion sanity check).
usage: python review_anim.py oath-01-ninja [clip:frame ...]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
from cf import review
import forge

hid = sys.argv[1]
shots = sys.argv[2:] or ['walk:1', 'walk:9', 'run:6', 'sprint:5', 'strafe_l:7', 'jump_start:9', 'jump_loop:1', 'dodge:9',
                         'attack_2:10', 'attack_3:13', 'cast_channel:1', 'cast_aoe:16', 'hit:4', 'death:49', 'emote_bow:20', 'sit:1']
forge.reset()
bpy.ops.import_scene.gltf(filepath=os.path.join(forge.OUT, f'{hid}.glb'))
arm = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE'][0]
review.setup_scene((240, 360), 6)
if arm.animation_data is None:
    arm.animation_data_create()
paths = []
for sh in shots:
    clip, fr = sh.split(':')
    act = forge.find_action(clip)
    arm.animation_data.action = act
    if hasattr(arm.animation_data, 'action_slot') and act.slots:
        arm.animation_data.action_slot = act.slots[0]
    bpy.context.scene.frame_set(int(fr))
    p = os.path.join(forge.SCRATCH, hid, f'a_{clip}_{fr}.png')
    paths.append(review.render_view(p, (0, 0, 0.9), 2.0, 60))
out = os.path.join(HERE, 'review', f'{hid}-anim.png')
review.contact_sheet(paths, shots, out, f'{hid} animation poses (yaw 60)')
print(out)
