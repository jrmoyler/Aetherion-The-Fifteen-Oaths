extends SceneTree
const Importer=preload("res://daybreak_importer.gd")
const Preview=preload("res://preview.gd")
var failures: Array=[]
var checks: Array=[]
var visual_reports: Array=[]
var negative_reports: Array=[]
var importer
var output_path=""
var negative_dir=""
var manifest_path=""
var repository_root=""

func check(condition: bool, name: String, detail = null):
    checks.append({"name":name,"passed":condition,"detail":detail})
    if not condition: failures.append(name)

func _initialize():
    var args=OS.get_cmdline_user_args()
    for i in range(0,args.size(),2):
        if i+1>=args.size():break
        match args[i]:
            "--manifest":manifest_path=args[i+1]
            "--report":output_path=args[i+1]
            "--negative-dir":negative_dir=args[i+1]
            "--repo":repository_root=args[i+1]
    call_deferred("run")

func run():
    importer=Importer.new()
    root.add_child(importer)
    var opened=importer.open_manifest(manifest_path,repository_root)
    check(opened.ok,"actual manifest opens",opened)
    if not opened.ok:
        finish()
        return
    var assets=importer.list_assets()
    check(assets.size()==17,"all17 actual modules")
    var policy_counts={"REQUIRED":0,"NONE":0,"PENDING":0}
    var clips_tested=0
    var import_count=0
    var collider_sources: Dictionary={}
    for asset in assets:
        policy_counts[asset.collisionPolicy.mode]+=1
        for lod in 3:
            var before=int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT))
            var loaded=importer.load_asset(asset.id,0) if lod==0 else importer.switch_lod(lod)
            check(loaded.ok,"actual visual LOD loads: "+asset.originalModuleName+"/"+str(lod),loaded.get("error"))
            if not loaded.ok:continue
            import_count+=1
            visual_reports.append(loaded)
            check(loaded.visual.loaded_texture_slots>0 and loaded.visual.decoded_images.size()>0,"actual embedded PBR decoded: "+asset.originalModuleName+"/"+str(lod))
            if asset.collisionPolicy.mode=="REQUIRED":
                check(loaded.static_bodies>0,"actual required physics bodies: "+asset.originalModuleName+"/"+str(lod))
                collider_sources[loaded.collision.path]=loaded.collision.sha256
            else:
                check(loaded.static_bodies==0,"no fabricated "+asset.collisionPolicy.mode+" collider: "+asset.originalModuleName+"/"+str(lod))
            for clip in asset.animations:
                var start=importer.seek_clip(clip,0.0,false)
                var pose0=importer.pose_snapshot()
                var half=importer.seek_clip(clip,start.length*0.5,false)
                var pose_half=importer.pose_snapshot()
                check(start.ok and half.ok and pose0!=pose_half,"actual seek changes rigid pose LOD"+str(lod))
                check(pose0.map(func(p):return p.scale)==pose_half.map(func(p):return p.scale),"animation preserves rigid scales LOD"+str(lod))
                importer.seek_clip(clip,0.0,true)
                var running_before=importer.pose_snapshot()
                var advanced=importer.advance_animation(0.25)
                check(advanced.players_advanced>0 and importer.pose_snapshot()!=running_before,"actual playing clip advances LOD"+str(lod))
                check(not importer.seek_clip(clip,start.length+1,false).ok,"out of range seek refused LOD"+str(lod))
                clips_tested+=1
            var current=importer.current_instance()
            check(not importer.load_asset("unknown-module",0).ok and importer.current_instance()==current,"unknown ID preserves live scene")
            check(not importer.switch_lod(9).ok and importer.current_instance()==current,"invalid LOD preserves live scene")
            # Swap tests: previous instance must actually be destroyed at each next LOD.
            if lod<2:
                var swapped=importer.switch_lod(lod+1)
                check(swapped.ok and not is_instance_valid(current),"LOD replacement frees prior instance")
            var survivor=importer.current_instance()
            var resources=importer.resource_weakrefs()
            check(not resources.is_empty(),"imported resources have weak lifetime probes")
            importer.unload()
            check(resources.all(func(r):return r.weak.get_ref()==null),"mesh/material/texture/shape/animation resources released on unload")
            check(not is_instance_valid(survivor) and importer.get_child_count()==0,"unload frees live scene and physics")
            check(importer.pose_snapshot().is_empty(),"unload clears animation/node references")
            check(int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT))<=before,"no orphan increase after unload")
            # Start the prior selection again so the following loop tests switch_lod.
            if lod<2: check(importer.load_asset(asset.id,lod).ok,"reload before switch")
        importer.unload()
    check(import_count==51,"all51 actual visual LOD records")
    check(collider_sources.size()==15,"all15 unique actual movement collider files")
    check(policy_counts=={"REQUIRED":15,"NONE":1,"PENDING":1},"REQUIRED/NONE/PENDING remain distinct",policy_counts)
    check(clips_tested==3,"baffle clip tested at all3 LODs")
    importer.unload()
    importer.unload()
    check(importer.get_child_count()==0 and importer.resource_weakrefs().is_empty(),"repeated unload is safe and retains no resources")
    check(not importer.switch_lod(0).ok,"LOD switch after free refused")
    check(not importer.seek_clip("missing",0.0).ok,"animation after free refused")
    check(not importer.advance_animation(-1).ok,"negative animation advance refused")
    for bad in ["../escape.glb","/tmp/absolute.glb","https://host/asset.glb","folder\\asset.glb","folder//asset.glb","./asset.glb","%2e%2e/asset.glb","bad\nasset.glb","missing.glb"]:
        check(not importer.resolve_reference(bad).ok,"bad/missing path refused: "+bad)
    var directory=DirAccess.open(negative_dir)
    if directory==null:
        check(false,"negative fixture directory exists")
    else:
        for name in directory.get_files():
            if not name.ends_with(".json"): continue
            importer.open_manifest(manifest_path,repository_root)
            var first=assets[0]
            importer.load_asset(first.id,0)
            var prior=importer.current_instance()
            var result=importer.open_manifest(negative_dir.path_join(name),repository_root)
            if name.begins_with("import-"):
                check(result.ok,"import-negative catalog is structurally valid: "+name,result)
                if result.ok:
                    var fixture_assets=importer.list_assets()
                    var good=importer.load_asset(fixture_assets[0].id,0)
                    check(good.ok,"valid sibling loads before import negative: "+name)
                    var survivor=importer.current_instance()
                    var resource_refs=importer.resource_weakrefs()
                    var before_orphans=int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT))
                    result=importer.load_asset(fixture_assets[1].id,0)
                    check(not result.ok,"malformed import refused: "+name,result)
                    check(importer.current_instance()==survivor and is_instance_valid(survivor) and importer.get_child_count()==1,"failed import preserves prior scene without partial children: "+name)
                    check(int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT))<=before_orphans,"failed import leaks no orphan nodes: "+name)
                    importer.unload()
                    check(resource_refs.all(func(r):return r.weak.get_ref()==null),"negative fixture resources released after unload: "+name)
            else:
                check(not result.ok,"invalid manifest refused: "+name,result)
                check(importer.current_instance()==prior and is_instance_valid(prior),"invalid manifest preserves prior scene: "+name)
            negative_reports.append({"fixture":name,"result":result})
            importer.unload()
    var before_free=int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT))
    importer.free()
    check(not is_instance_valid(importer),"importer freed")
    check(int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT))<=before_free,"no orphan increase after importer free")
    test_preview_transactions()
    finish()

func test_preview_transactions():
    var viewer=Preview.new()
    root.add_child(viewer)
    var current=viewer.importer.current_instance()
    check(is_instance_valid(current),"inspector startup loads actual scene")
    if not is_instance_valid(current):
        viewer.free()
        return
    var prior_report=viewer.importer.current_report()
    var prior_label=viewer.label.text
    var prior_camera=viewer.camera.transform
    var prior_selected=viewer.selected
    var prior_lod=viewer.lod
    viewer.assets.append({"id":"unknown-inspector-request","originalModuleName":"Wrong requested geometry"})
    var event=InputEventKey.new()
    event.pressed=true
    event.keycode=KEY_LEFT
    viewer._unhandled_input(event)
    check(viewer.importer.current_instance()==current,"failed keyboard selection retains actual scene")
    check(viewer.selected==prior_selected and viewer.lod==prior_lod,"failed keyboard selection retains committed selection and LOD")
    check(viewer.label.text.begins_with(prior_label) and viewer.label.text.contains("Request failed: Unknown asset ID") and not viewer.label.text.contains("Wrong requested geometry"),"failed selection labels retained geometry and visible request error")
    viewer.show_asset(prior_selected,9)
    check(viewer.importer.current_instance()==current and viewer.importer.current_report()==prior_report,"failed LOD request retains actual scene and collision report")
    check(viewer.selected==prior_selected and viewer.lod==prior_lod and viewer.camera.transform==prior_camera,"failed LOD request retains committed selection and framing")
    check(viewer.label.text.begins_with(prior_label) and viewer.label.text.contains("Request failed: Invalid LOD"),"failed LOD request labels retained LOD and visible error")
    event.keycode=KEY_2
    viewer._unhandled_input(event)
    check(viewer.lod==1 and viewer.importer.current_report().lod==1 and viewer.error.is_empty() and not viewer.label.text.contains("Request failed:"),"successful keyboard LOD request commits and clears error")
    check(not is_instance_valid(current),"successful inspector replacement frees prior scene")
    var resources=viewer.importer.resource_weakrefs()
    viewer.free()
    check(resources.all(func(r):return r.weak.get_ref()==null),"inspector teardown releases imported resources")

func finish():
    var report={"status":"PASS_HEADLESS_RUNTIME" if failures.is_empty() else "FAIL_HEADLESS_RUNTIME","engine":Engine.get_version_info().string,"manifest":manifest_path,"manifest_sha256":FileAccess.get_sha256(manifest_path),"checks":checks,"failures":failures,"visual_imports":visual_reports,"negative_fixtures":negative_reports,"scope":"Actual runtime import, embedded PBR decoding, LOD replacement, StaticBody3D construction, rigid animation seek/advance and cleanup; no GPU parity, world authority or final art approval"}
    var file=FileAccess.open(output_path,FileAccess.WRITE)
    file.store_string(JSON.stringify(report,"  "))
    file.close()
    print("DAYBREAK_PREVIEW_CHECKS ",checks.size()," FAILURES ",failures.size())
    for failure in failures:print("FAILED ",failure)
    quit(0 if failures.is_empty() else 1)
