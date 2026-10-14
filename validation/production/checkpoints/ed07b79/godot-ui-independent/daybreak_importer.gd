extends Node3D
## Read-only, manifest-scoped glTF inspection. No world or gameplay authority.

const LOD_KEYS = ["glb", "lod1", "lod2"]
const MAX_GLB_BYTES = 134217728
var _assets: Dictionary = {}
var _base = ""
var _manifest = ""
var _current: Node3D
var _visual: Node3D
var _players: Array = []
var _current_id = ""
var _current_lod = -1
var _current_report: Dictionary = {}

func _error(message: String) -> Dictionary:
    return {"ok": false, "error": message}

func _plain_absolute(path: String) -> bool:
    for i in path.length():
        if path.unicode_at(i)<32: return false
    return path.is_absolute_path() and not "://" in path and not "\\" in path

func _has_symlink(path: String) -> bool:
    var directory = DirAccess.open("/")
    if directory == null: return true
    var cursor = "/"
    for segment in path.trim_prefix("/").split("/",false):
        cursor = cursor.path_join(segment)
        if directory.is_link(cursor): return true
    return false

func resolve_reference(reference, base: String = "") -> Dictionary:
    var root_path = _base if base.is_empty() else base
    if not reference is String or reference.is_empty(): return _error("Empty or non-string asset path")
    if reference.is_absolute_path() or ":" in reference or "\\" in reference or "%" in reference:
        return _error("Asset path must be a plain relative path")
    for code in reference.length():
        if reference.unicode_at(code)<32: return _error("Control character in path")
    for segment in reference.split("/",true):
        if segment in ["", ".", ".."]: return _error("Empty/dot/traversal path segment")
    var path = root_path.path_join(reference).simplify_path()
    if not path.begins_with(root_path+"/") or _has_symlink(path):
        return _error("Asset path escapes base or uses a symlink")
    if not FileAccess.file_exists(path): return _error("Missing asset file: "+reference)
    return {"ok":true,"path":path}

func open_manifest(path: String, repository_root: String = "") -> Dictionary:
    if not _plain_absolute(path) or path != path.simplify_path() or _has_symlink(path):
        return _error("Manifest must be an absolute normalized path without symlinks")
    if not FileAccess.file_exists(path): return _error("Manifest does not exist")
    var parser = JSON.new()
    if parser.parse(FileAccess.get_file_as_string(path)) != OK or not parser.data is Dictionary:
        return _error("Invalid manifest JSON")
    var data: Dictionary = parser.data
    if not typeof(data.get("schemaVersion")) in [TYPE_INT,TYPE_FLOAT] or data.get("schemaVersion") != 1 or not data.get("assets") is Array:
        return _error("Unsupported manifest schema")
    var proposed_base: String
    match data.get("filePathBase"):
        "MANIFEST_DIRECTORY": proposed_base=path.get_base_dir()
        "REPOSITORY_ROOT":
            if not _plain_absolute(repository_root) or repository_root != repository_root.simplify_path() or _has_symlink(repository_root):
                return _error("Explicit safe repository root required")
            proposed_base=repository_root
        _: return _error("Unsupported or missing filePathBase")
    var proposed_assets: Dictionary = {}
    for row in data.assets:
        if not row is Dictionary or not row.get("id") is String or row.id.strip_edges().is_empty() or proposed_assets.has(row.id):
            return _error("Invalid or duplicate asset ID")
        if not row.get("originalModuleName") is String or row.originalModuleName.strip_edges().is_empty():
            return _error("Missing or blank original module name")
        if not row.get("files") is Dictionary or not row.get("collisionPolicy") is Dictionary:
            return _error("Missing asset files/collisionPolicy")
        var mode = row.collisionPolicy.get("mode")
        if not mode in ["REQUIRED","NONE","PENDING"]: return _error("Unknown collision policy")
        if not row.collisionPolicy.get("reason") is String or row.collisionPolicy.reason.strip_edges().is_empty(): return _error("Collision policy reason is required")
        if mode == "PENDING" and (not row.collisionPolicy.get("remainingGate") is String or row.collisionPolicy.remainingGate.strip_edges().is_empty()):
            return _error("PENDING collision requires a remaining gate")
        if mode == "REQUIRED" and not row.files.has("collision"): return _error("REQUIRED collider is absent")
        if mode != "REQUIRED" and row.files.has("collision"): return _error("Unexpected collider for NONE/PENDING policy")
        var paths: Dictionary = {}
        for key in LOD_KEYS + (["collision"] if mode=="REQUIRED" else []):
            var resolution=resolve_reference(row.files.get(key),proposed_base)
            if not resolution.ok: return resolution
            if not resolution.path.ends_with(".glb"): return _error("Only explicit .glb runtime assets supported")
            paths[key]=resolution.path
        var animations=row.get("animations",[])
        if not animations is Array: return _error("Invalid animation declarations")
        for clip in animations:
            if not clip is String or clip.is_empty(): return _error("Invalid animation name")
        proposed_assets[row.id]={"record":row.duplicate(true),"paths":paths}
    if proposed_assets.is_empty(): return _error("Empty manifest")
    # Transactional: a malformed replacement never discards the current scene/catalog.
    unload()
    _assets=proposed_assets
    _base=proposed_base
    _manifest=path
    return {"ok":true,"assets":_assets.size(),"manifest_sha256":FileAccess.get_sha256(path),"filePathBase":data.filePathBase}

func list_assets() -> Array:
    var result: Array=[]
    for value in _assets.values(): result.append(value.record.duplicate(true))
    return result

func _embedded_glb(path: String) -> Dictionary:
    # Recheck containment at load time; parse and import the same captured bytes.
    var resolution=resolve_reference(path.trim_prefix(_base+"/"))
    if not resolution.ok: return resolution
    var file=FileAccess.open(path,FileAccess.READ)
    if file == null or file.get_length()<20 or file.get_length()>MAX_GLB_BYTES:
        return _error("Invalid GLB byte length")
    var bytes=file.get_buffer(file.get_length())
    if bytes.decode_u32(0)!=0x46546c67 or bytes.decode_u32(4)!=2 or bytes.decode_u32(8)!=bytes.size():
        return _error("Invalid GLB header")
    var json_length=bytes.decode_u32(12)
    if bytes.decode_u32(16)!=0x4e4f534a or json_length+20>bytes.size(): return _error("Invalid GLB JSON chunk")
    var parser=JSON.new()
    if parser.parse(bytes.slice(20,20+json_length).get_string_from_utf8())!=OK or not parser.data is Dictionary:
        return _error("Invalid GLB JSON")
    var data: Dictionary=parser.data
    if not data.get("asset") is Dictionary or data.asset.get("version")!="2.0": return _error("Unsupported glTF version")
    if not data.get("buffers",[]) is Array or not data.get("images",[]) is Array:
        return _error("glTF buffers/images must be arrays")
    for entry in data.get("buffers",[])+data.get("images",[]):
        if not entry is Dictionary or entry.has("uri"): return _error("External or URI glTF dependencies are forbidden")
    var digest=HashingContext.new()
    digest.start(HashingContext.HASH_SHA256)
    digest.update(bytes)
    return {"ok":true,"bytes":bytes,"sha256":digest.finish().hex_encode()}

func _nodes(root_node: Node) -> Array:
    var result: Array=[root_node]
    for child in root_node.get_children(): result.append_array(_nodes(child))
    return result

func _relative_transform(node: Node3D, scene: Node3D) -> Transform3D:
    var transform=node.transform
    var parent=node.get_parent()
    while parent != null:
        if parent is Node3D: transform=parent.transform*transform
        if parent==scene: break
        parent=parent.get_parent()
    return transform

func _import(path: String, pbr: bool) -> Dictionary:
    var captured=_embedded_glb(path)
    if not captured.ok: return captured
    var document=GLTFDocument.new()
    var state=GLTFState.new()
    var error=document.append_from_buffer(captured.bytes,"",state)
    if error!=OK: return _error("Godot GLTFDocument import failed: "+str(error))
    var scene=document.generate_scene(state)
    if scene==null: return _error("Godot scene generation failed")
    var meshes=0
    var surfaces=0
    var textures=0
    var texture_records: Array=[]
    var image_records: Array=[]
    var failure=""
    for texture in state.get_images():
        var image=texture.get_image() if texture!=null else null
        if image==null or image.is_empty(): failure="Embedded image failed decoding"
        else: image_records.append({"width":image.get_width(),"height":image.get_height()})
    for node in _nodes(scene):
        if node is MeshInstance3D and node.mesh!=null:
            meshes+=1
            for surface in node.mesh.get_surface_count():
                surfaces+=1
                if not pbr: continue
                var arrays=node.mesh.surface_get_arrays(surface)
                var uvs=arrays[Mesh.ARRAY_TEX_UV]
                if uvs==null or uvs.is_empty(): failure="Visual surface lacks UVs"
                var material=node.get_active_material(surface)
                if not material is BaseMaterial3D:
                    failure="Visual surface lacks imported PBR material"
                    continue
                for slot in [BaseMaterial3D.TEXTURE_ALBEDO,BaseMaterial3D.TEXTURE_NORMAL,BaseMaterial3D.TEXTURE_ROUGHNESS,BaseMaterial3D.TEXTURE_METALLIC]:
                    var texture=material.get_texture(slot)
                    if texture==null or texture.get_width()<=0 or texture.get_height()<=0:
                        failure="Visual PBR texture slot missing or empty"
                    else:
                        textures+=1
                        texture_records.append({"node":str(node.name),"surface":surface,"slot":slot,"width":texture.get_width(),"height":texture.get_height()})
    if meshes==0: failure="Imported scene has no mesh instances"
    if not failure.is_empty():
        scene.free()
        return _error(failure)
    return {"ok":true,"scene":scene,"report":{"path":path,"sha256":captured.sha256,"meshes":meshes,"surfaces":surfaces,"decoded_images":image_records,"loaded_texture_slots":textures,"textures":texture_records}}

func _physics_from_scene(scene: Node3D) -> Dictionary:
    var physics=Node3D.new()
    physics.name="AuthoredRequiredMovementCollision"
    var count=0
    for node in _nodes(scene):
        if node is MeshInstance3D and node.mesh!=null:
            var shape=node.mesh.create_trimesh_shape()
            if shape==null:
                physics.free()
                return _error("Could not create actual imported triangle collision")
            var body=StaticBody3D.new()
            body.name="Proxy_"+str(node.name)
            body.transform=_relative_transform(node,scene)
            var collision=CollisionShape3D.new()
            collision.shape=shape
            body.add_child(collision)
            physics.add_child(body)
            count+=1
    return {"ok":true,"node":physics,"bodies":count}

func load_asset(asset_id: String, lod: int = 0) -> Dictionary:
    if not _assets.has(asset_id): return _error("Unknown asset ID")
    if lod<0 or lod>=LOD_KEYS.size(): return _error("Invalid LOD")
    var asset: Dictionary=_assets[asset_id]
    var imported=_import(asset.paths[LOD_KEYS[lod]],true)
    if not imported.ok: return imported
    var staging=Node3D.new()
    staging.name="DaybreakInspectionAsset"
    staging.add_child(imported.scene)
    var players: Array=[]
    var clip_names: Array=[]
    for node in _nodes(imported.scene):
        if node is AnimationPlayer:
            players.append(node)
            for clip in node.get_animation_list():
                if clip!="RESET": clip_names.append(str(clip))
    for clip in asset.record.get("animations",[]):
        if not clip in clip_names:
            staging.free()
            return _error("Declared animation missing from selected LOD: "+clip)
    var body_count=0
    var collision_report: Dictionary={}
    var mode=asset.record.collisionPolicy.mode
    if mode=="REQUIRED":
        var collision_import=_import(asset.paths.collision,false)
        if not collision_import.ok:
            staging.free()
            return collision_import
        var physical=_physics_from_scene(collision_import.scene)
        collision_report=collision_import.report
        collision_import.scene.free()
        if not physical.ok:
            staging.free()
            return physical
        staging.add_child(physical.node)
        body_count=physical.bodies
    # Build completely before releasing a usable prior selection.
    unload()
    add_child(staging)
    _current=staging
    _visual=imported.scene
    _players=players
    _current_id=asset_id
    _current_lod=lod
    _current_report={"ok":true,"asset_id":asset_id,"lod":lod,"visual":imported.report,"collision_policy":mode,"collision_reason":asset.record.collisionPolicy.reason,"static_bodies":body_count,"collision":collision_report,"animations":clip_names}
    return _current_report.duplicate(true)

func switch_lod(lod: int) -> Dictionary:
    if _current_id.is_empty(): return _error("No asset selected")
    # Selection change resets clip pose/time deliberately; no cross-LOD pose match claimed.
    return load_asset(_current_id,lod)

func seek_clip(clip: String, time_seconds: float, play: bool = false) -> Dictionary:
    if not is_finite(time_seconds) or time_seconds<0: return _error("Invalid animation time")
    for player in _players:
        if player.has_animation(clip):
            var animation=player.get_animation(clip)
            if time_seconds>animation.length: return _error("Animation time exceeds clip duration")
            player.play(clip)
            player.seek(time_seconds,true)
            if not play: player.pause()
            return {"ok":true,"clip":clip,"position":player.current_animation_position,"length":animation.length}
    return _error("Unknown animation clip")

func advance_animation(delta: float) -> Dictionary:
    if not is_finite(delta) or delta<0: return _error("Invalid animation advance")
    var advanced=0
    for player in _players:
        if player.is_playing():
            player.advance(delta)
            advanced+=1
    return {"ok":true,"players_advanced":advanced}

func pose_snapshot() -> Array:
    var result: Array=[]
    if is_instance_valid(_visual):
        for node in _nodes(_visual):
            if node is Node3D:
                result.append({"path":str(_visual.get_path_to(node)),"transform":str(node.transform),"scale":[node.scale.x,node.scale.y,node.scale.z]})
    return result

func current_instance() -> Node3D:
    return _current if is_instance_valid(_current) else null

func current_report() -> Dictionary:
    return _current_report.duplicate(true)

func unload():
    for player in _players:
        if is_instance_valid(player): player.stop()
    _players.clear()
    if is_instance_valid(_current): _current.free()
    _current=null
    _visual=null
    _current_id=""
    _current_lod=-1
    _current_report={}

func resource_weakrefs() -> Array:
    # Test/inspection hook: weak references do not keep imported resources alive.
    var refs: Array=[]
    var seen: Dictionary={}
    if not is_instance_valid(_current): return refs
    for node in _nodes(_current):
        var resources: Array=[]
        if node is MeshInstance3D and node.mesh!=null:
            resources.append(node.mesh)
            for surface in node.mesh.get_surface_count():
                var material=node.get_active_material(surface)
                if material!=null:
                    resources.append(material)
                    if material is BaseMaterial3D:
                        for slot in [BaseMaterial3D.TEXTURE_ALBEDO,BaseMaterial3D.TEXTURE_NORMAL,BaseMaterial3D.TEXTURE_ROUGHNESS,BaseMaterial3D.TEXTURE_METALLIC]:
                            var texture=material.get_texture(slot)
                            if texture!=null: resources.append(texture)
        if node is CollisionShape3D and node.shape!=null: resources.append(node.shape)
        if node is AnimationPlayer:
            for clip in node.get_animation_list(): resources.append(node.get_animation(clip))
        for resource in resources:
            if not seen.has(resource.get_instance_id()):
                seen[resource.get_instance_id()]=true
                refs.append({"class":resource.get_class(),"weak":weakref(resource)})
    return refs

func clip_length(clip: String) -> float:
    for player in _players:
        if player.has_animation(clip): return player.get_animation(clip).length
    return -1.0
