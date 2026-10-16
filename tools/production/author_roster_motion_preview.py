#!/usr/bin/env python3
"""Add role-specific *preview* skeletal clips to the 128-model review ZIP.

This is reproducible technical motion authoring, NOT final animation or IK.
No Blender assets, canonical references or gameplay implementations are changed.
"""
import argparse, hashlib, json, math, struct, zipfile
from pathlib import Path
import numpy as np

PREFIX = "AETHERION_ROSTER_REBUILD/"
TIMES = np.array([0.0, .14, .32, .50, .72, .88, 1.0], dtype=np.float32)

def parse(data):
    if data[:4] != b"glTF": raise ValueError("Not a GLB")
    n = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20+n])
    start = 20+n
    length, kind = struct.unpack_from("<I4s", data, start)
    if kind != b"BIN\\x00" or start+8+length != len(data):
        raise ValueError("Missing embedded BIN chunk")
    return doc, bytearray(data[start+8:])

def finish(doc, body):
    doc["buffers"][0]["byteLength"] = len(body)
    js = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    return (b"glTF" + struct.pack("<II", 2, 12+8+len(js)+8+len(body))
            + struct.pack("<I4s", len(js), b"JSON") + js
            + struct.pack("<I4s", len(body), b"BIN\\x00") + body)

def accessor(doc, body, values, dimensions):
    arr = np.asarray(values, dtype=np.float32)
    if arr.ndim != 2 or arr.shape[1] != dimensions or not np.isfinite(arr).all():
        raise ValueError("Invalid float32 accessor")
    offset = len(body); raw = arr.tobytes()
    body.extend(raw); body.extend(b"\\0" * (-len(body) % 4))
    view_id = len(doc["bufferViews"])
    doc["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": len(raw)})
    acc_id = len(doc["accessors"])
    meta = {"bufferView": view_id, "componentType": 5126, "count": len(arr),
            "type": {1:"SCALAR",3:"VEC3",4:"VEC4"}[dimensions]}
    if dimensions == 1:
        meta["min"] = [float(arr.min())]; meta["max"] = [float(arr.max())]
    doc["accessors"].append(meta)
    return acc_id

def quaternion(axis, angle):
    s = math.sin(angle/2)
    return [axis[0]*s, axis[1]*s, axis[2]*s, math.cos(angle/2)]

def actions(category, role, names):
    humanoid = "hips" in names
    if humanoid:
        clips = ["turn_left","turn_right","walk_start","walk_stop","walk_fast",
                 "step_back","sidestep","kneel","stand_up","look_around",
                 "interaction","impact_recover"]
        if role in ("civilian","handler","wayfarer","archivist"):
            clips += ["tool_reach","tool_use","protective_brace","emergency_retreat",
                      "assist_other","hand_signal","read_notes","recover_stance"]
        else:
            clips += ["combat_ready","defense_guard","heavy_attack_prep",
                      "heavy_attack_followthrough","cast_charge","cast_release",
                      "stagger","fall_down"]
    else:
        clips = ["turn_left","turn_right","locomotion_start","locomotion_stop",
                 "locomotion_fast","retreat","alert","rest","rise","recover",
                 "impact_recover","hold_position"]
        if role == "summon_visual_reference":
            clips += ["manifest_arrival","manifest_crest","manifest_strike",
                      "manifest_departure","dissipate","reset_state"]
        elif role == "mount":
            clips += ["mount_approach","mount_depart","rider_brace",
                      "load_transfer","emergency_stop","dismount_prepare"]
        elif role == "boss":
            clips += ["tell_phase_1","execute_phase_1","recover_phase_1",
                      "tell_phase_2","execute_phase_2","recover_phase_2"]
        else:
            clips += ["ability_ready","ability_execute","ability_recover",
                      "feeding_or_service","withdraw_safely","rest_alert"]
    return clips

def extend_model(raw, entry):
    doc, body = parse(raw)
    names = {doc["nodes"][j].get("name",str(j)):j for j in doc["skins"][0]["joints"]}
    new = []
    for clip in actions(entry["category"],entry["role"],names):
        if clip in {c["name"] for c in doc["animations"]}: continue
        legs = [n for n in names if n.startswith(("thigh.","leg."))]
        arms = [n for n in names if n.startswith(("upperarm.","forearm.","wing."))]
        tail = [n for n in names if n in ("tail","tail_tip","cape-root")]
        head = [n for n in names if n in ("head","neck","crest","ornament")]
        trunk = [n for n in names if n in ("body","spine","chest")]
        if "turn_" in clip: joints = trunk+head+tail+arms[:2]
        elif any(x in clip for x in ("walk","locomotion","step","retreat","run")): joints = legs+arms[:2]+tail+trunk
        elif any(x in clip for x in ("attack","strike","execute","cast","tool","assist")): joints = arms+head+trunk+tail
        elif any(x in clip for x in ("rise","kneel","fall","down","brace","rest")): joints = legs+trunk+head+arms[:2]
        else: joints = head+trunk+tail+arms[:2]
        joints = list(dict.fromkeys(joints)) or [next(iter(names))]
        amplitude = .12 if clip in ("interaction","rest","look_around","hold_position","read_notes") else .25
        if any(x in clip for x in ("fast","stagger","fall_down","impact_recover","alert")): amplitude = .42
        if "heavy" in clip or "execute" in clip: amplitude = .55
        if "turn_" in clip: amplitude = .31
        duration = 1.8 if any(x in clip for x in ("walk","locomotion","rest")) else (.7 if "attack" in clip or "impact" in clip else 1.3)
        source = accessor(doc,body,(TIMES*duration)[:,None],1)
        samplers=[];channels=[]
        for ji,n in enumerate(joints):
            side = n.endswith((".L",".1",".3"))
            opposite = n.endswith((".R",".2",".4"))
            phase = math.pi if opposite else (0 if side else .35)
            axis = (0,0,1) if "turn_" in clip else ((1,0,0) if any(x in n for x in ("thigh","leg","upperarm","wing","cape","tail")) else (0,1,0))
            if "fall" in clip or "kneel" in clip:axis = (1,0,0)
            if "cast" in clip:axis = (0,1,0)
            direction = -1 if clip == "turn_right" else 1
            if any(x in clip for x in ("walk","locomotion","fast")):
                angles = [amplitude*math.sin(4*math.pi*float(t)+phase) for t in TIMES]
                angles[0]=0;angles[-1]=0
            else:
                angles = [direction*amplitude*w*(1 if ji%2==0 else -.78)
                          for w in [0,.25,.72,1,.65,.2,0]]
            quat = np.asarray([quaternion(axis,angle) for angle in angles],dtype=np.float32)
            dst = accessor(doc,body,quat,4); k=len(samplers)
            samplers.append({"input":source,"output":dst,"interpolation":"LINEAR"})
            channels.append({"sampler":k,"target":{"node":names[n],"path":"rotation"}})
        doc["animations"].append({"name":clip,"samplers":samplers,"channels":channels,
                                  "extras":{"authoring":"PROCEDURAL_PREVIEW_R06",
                                            "contact_IK":"NOT_IMPLEMENTED","engine_approved":False,
                                            "gameplay_events_authoritative":False,
                                            "clip_duration_sec":duration}})
        new.append(clip)
    doc.setdefault("extras",{})["animation_authoring_revision"] = "PREVIEW_R06_ROLE_SCOPED"
    doc["extras"]["animation_fidelity_approved"] = False
    doc["extras"]["gameplay_state_machine_complete"] = False
    return finish(doc,body),new

def main():
    a=argparse.ArgumentParser()
    a.add_argument("r05_zip",type=Path);a.add_argument("out_zip",type=Path)
    args=a.parse_args()
    with zipfile.ZipFile(args.r05_zip) as inp:
        manifest=json.loads(inp.read(PREFIX+"ROSTER_REBUILD_MANIFEST.json"))
        if len(manifest["assets"])!=128:raise ValueError("Expected 128 identities")
        replacements={};counts=[]
        for r in manifest["assets"]:
            path=PREFIX+r["glb_path"];raw=inp.read(path)
            if hashlib.sha256(raw).hexdigest()!=r["sha256"]:raise ValueError("Input hash mismatch: "+path)
            updated,clips=extend_model(raw,r)
            replacements[path]=updated;r["clip_names"].extend(clips)
            r["size_bytes"]=len(updated);r["sha256"]=hashlib.sha256(updated).hexdigest()
            r["animation_revision"]="PREVIEW_R06_ROLE_SCOPED_NOT_GAMEPLAY_APPROVED"
            counts.append(len(clips))
        manifest["animation_authoring_revision"]="R06_ROLE_SCOPED_PREVIEW"
        manifest["status"]="UNAPPROVED_INCOMPLETE_ART_AND_GAMEPLAY"
        with zipfile.ZipFile(args.out_zip,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as out:
            for name in inp.namelist():
                if name==PREFIX+"ROSTER_REBUILD_MANIFEST.json":continue
                out.writestr(name,replacements.get(name,inp.read(name)))
            out.writestr(PREFIX+"ROSTER_REBUILD_MANIFEST.json",json.dumps(manifest,indent=2)+"\\n")
            out.writestr(PREFIX+"R06_ANIMATION_AUDIT.json",json.dumps({
                "models":128,"new_clips":sum(counts),"new_clips_per_model":{"min":min(counts),"max":max(counts)},
                "all_unapproved":True,"IK":False,"engine_gameplay_accepted":False,
                "status":"ROLE_SCOPED_PREVIEW_NOT_FINAL_MOTION"},indent=2)+"\\n")
    print(json.dumps({"models":128,"new_clips":sum(counts),"approved":False}))

if __name__=="__main__":main()
