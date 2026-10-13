extends Node3D
## Read-only runtime glTF import, interactive preview, and headless acceptance checks.

var repo := ""
var report_path := ""
var manifest_paths: Array[String] = []
var assets: Array[String] = []
var manifest_evidence: Array = []
var current_scene: Node3D
var camera: Camera3D
var pivot: Node3D
var label: Label
var selected := 0
var yaw := 0.5
var pitch := -0.25
var distance := 4.0
var dragging := false
var animation_players: Array[AnimationPlayer] = []
var failures: Array[String] = []
var expected_animations := {}

func _ready():
    var args := OS.get_cmdline_user_args()
    var validate := false
    var index := 0
    while index < args.size():
        match args[index]:
            "--repo":
                index += 1
                if index < args.size(): repo = args[index]
            "--manifest":
                index += 1
                if index < args.size(): manifest_paths.append(args[index])
            "--report":
                index += 1
                if index < args.size(): report_path = args[index]
            "--validate": validate = true
        index += 1
    if repo.is_empty():
        repo = ProjectSettings.globalize_path("res://../../..").simplify_path()
    if not repo.is_absolute_path() or not DirAccess.dir_exists_absolute(repo.path_join("assets/production")):
        _abort("Supply --repo with an absolute repository path containing assets/production")
        return
    _discover(repo.path_join("assets/production"))
    assets.sort()
    manifest_paths.sort()
    for path in manifest_paths:
        _inspect_manifest(path)
    if assets.is_empty():
        _abort("No actual production GLBs found; no compatibility claim is possible")
        return
    if validate:
        _validate_all()
    else:
        _build_viewer()
        _show_asset()

func _abort(message: String):
    push_error(message)
    get_tree().quit(2)

func _discover(directory: String):
    var access := DirAccess.open(directory)
    if access == null:
        failures.append("Cannot read " + directory)
        return
    access.list_dir_begin()
    var entry := access.get_next()
    while not entry.is_empty():
        if not entry.begins_with("."):
            var path := directory.path_join(entry)
            if access.current_is_dir():
                _discover(path)
            elif entry.to_lower().ends_with(".glb"):
                assets.append(path)
            elif entry.to_lower().ends_with(".json") and "manifest" in entry.to_lower() and not path in manifest_paths:
                manifest_paths.append(path)
        entry = access.get_next()
    access.list_dir_end()

func _inspect_manifest(path: String):
    if not path.is_absolute_path(): path = repo.path_join(path)
    var parser := JSON.new()
    var error := parser.parse(FileAccess.get_file_as_string(path))
    if error != OK:
        failures.append("Invalid manifest: " + path)
        return
    if not parser.data is Dictionary or parser.data.get("schemaVersion") != 1 or not parser.data.get("assets") is Array:
        failures.append("Unsupported production manifest schema: " + path)
        return
    for asset in parser.data.assets:
        if not asset is Dictionary or not asset.get("files") is Dictionary or not asset.files.get("glb") is String:
            failures.append("Manifest asset lacks files.glb: " + path)
            continue
        var clips: Array[String] = []
        for clip in asset.get("animations", []):
            if clip is String:
                clips.append(clip)
            elif clip is Dictionary and clip.get("name") is String:
                clips.append(clip.name)
            else:
                failures.append("Unsupported animation declaration: " + path)
        expected_animations[repo.path_join(asset.files.glb).simplify_path()] = clips
    var refs: Array[String] = []
    _find_glb_refs(parser.data, refs)
    var checked: Array = []
    for reference in refs:
        var resolved := ""
        for candidate in [path.get_base_dir().path_join(reference), repo.path_join(reference)]:
            if FileAccess.file_exists(candidate):
                resolved = candidate.simplify_path()
                break
        if resolved.is_empty(): failures.append("Missing manifest GLB: " + reference + " in " + path)
        checked.append({"reference": reference, "resolved": resolved.trim_prefix(repo + "/")})
    manifest_evidence.append({"path": path.trim_prefix(repo + "/"), "references": checked})

func _find_glb_refs(value, result: Array[String]):
    if value is Dictionary:
        for child in value.values(): _find_glb_refs(child, result)
    elif value is Array:
        for child in value: _find_glb_refs(child, result)
    elif value is String and value.to_lower().ends_with(".glb") and not value in result:
        result.append(value)

func _import(path: String) -> Dictionary:
    var document := GLTFDocument.new()
    var state := GLTFState.new()
    var error := document.append_from_file(path, state)
    if error != OK: return {"error": "append_from_file code " + str(error)}
    var scene = document.generate_scene(state)
    if scene == null: return {"error": "generate_scene returned null"}
    return {"scene": scene, "meshes": state.get_meshes().size(), "materials": state.get_materials().size(), "skins": state.get_skins().size(), "animations": state.get_animations().size()}

func _all_nodes(node: Node) -> Array[Node]:
    var nodes: Array[Node] = [node]
    for child in node.get_children(): nodes.append_array(_all_nodes(child))
    return nodes

func _validate_all():
    var rows: Array = []
    for path in assets:
        var baseline := int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT))
        var imported := _import(path)
        var row := {"path": path.trim_prefix(repo + "/"), "sha256": FileAccess.get_sha256(path), "status": "PASS", "issues": [], "animations": [], "materials": []}
        if imported.has("error"):
            row.status = "FAIL"
            row.issues.append(imported.error)
            rows.append(row)
            continue
        var scene: Node = imported.scene
        add_child(scene)
        row["imported_meshes"] = imported.meshes
        row["imported_skins"] = imported.skins
        row["imported_animation_count"] = imported.animations
        row["mesh_instances"] = 0
        row["uv_surfaces"] = 0
        row["triangles"] = 0
        row["skeleton_bones"] = 0
        row["loaded_texture_slots"] = 0
        var collision := "collision" in path.to_lower()
        for node in _all_nodes(scene):
            if node is Skeleton3D: row.skeleton_bones += node.get_bone_count()
            if node is MeshInstance3D and node.mesh != null:
                row.mesh_instances += 1
                for surface in range(node.mesh.get_surface_count()):
                    var arrays = node.mesh.surface_get_arrays(surface)
                    var vertices = arrays[Mesh.ARRAY_VERTEX]
                    var indices = arrays[Mesh.ARRAY_INDEX]
                    row.triangles += int((indices.size() if indices != null and indices.size() else vertices.size()) / 3)
                    var uv = arrays[Mesh.ARRAY_TEX_UV]
                    if uv != null and uv.size() > 0: row.uv_surfaces += 1
                    elif not collision: row.issues.append("Missing UV surface: " + str(node.name))
                    var material = node.get_active_material(surface)
                    if material == null:
                        if not collision: row.issues.append("Missing material: " + str(node.name))
                        continue
                    var material_row := {"node": str(node.name), "surface": surface, "class": material.get_class()}
                    if material is BaseMaterial3D:
                        material_row["roughness"] = material.roughness
                        material_row["metallic"] = material.metallic
                        material_row["textures"] = []
                        for slot in [BaseMaterial3D.TEXTURE_ALBEDO, BaseMaterial3D.TEXTURE_NORMAL, BaseMaterial3D.TEXTURE_ROUGHNESS, BaseMaterial3D.TEXTURE_METALLIC]:
                            var texture = material.get_texture(slot)
                            if texture != null:
                                row.loaded_texture_slots += 1
                                material_row.textures.append({"slot": slot, "width": texture.get_width(), "height": texture.get_height()})
                                if texture.get_width() <= 0 or texture.get_height() <= 0: row.issues.append("Empty texture: " + str(node.name))
                    row.materials.append(material_row)
            if node is AnimationPlayer:
                for clip in node.get_animation_list():
                    if clip == "RESET": continue
                    var animation: Animation = node.get_animation(clip)
                    node.play(clip)
                    node.advance(0.0)
                    var initial_pose := _pose_snapshot(scene)
                    node.advance(minf(animation.length * 0.37, 0.37))
                    var changed_pose := _pose_snapshot(scene) != initial_pose
                    var position: float = node.current_animation_position
                    row.animations.append({"name": clip, "length": animation.length, "tracks": animation.get_track_count(), "position_after_advance": position, "pose_changed": changed_pose})
                    if animation.length <= 0.0 or animation.get_track_count() == 0 or position <= 0.0:
                        row.issues.append("Animation did not advance: " + clip)
                    if not changed_pose: row.issues.append("Animation advanced without a changed node/bone pose: " + clip)
                    node.stop()
        for expected_clip in expected_animations.get(path.simplify_path(), []):
            var found := false
            for clip in row.animations:
                if clip.name == expected_clip: found = true
            if not found: row.issues.append("Manifest-declared animation absent: " + str(expected_clip))
        if not collision and row.loaded_texture_slots == 0: row.issues.append("No texture slots loaded on renderable asset")
        if row.mesh_instances == 0: row.issues.append("No mesh instance imported")
        if imported.animations > 0 and row.animations.is_empty(): row.issues.append("Animation records imported without playable clips")
        scene.free()
        var after := int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT))
        row["orphan_nodes_before"] = baseline
        row["orphan_nodes_after_free"] = after
        row["scene_disposed"] = not is_instance_valid(scene)
        row["source_unchanged"] = FileAccess.get_sha256(path) == row.sha256
        if not row.source_unchanged: row.issues.append("Source file changed during import")
        if after > baseline: row.issues.append("Orphan-node count increased after free")
        if not row.issues.is_empty(): row.status = "FAIL"
        rows.append(row)
    var passed := 0
    for row in rows:
        if row.status == "PASS": passed += 1
    var result := {"engine": Engine.get_version_info(), "scope": "Headless CPU import, UV/material/texture presence, animation advancement, node cleanup; no rendered appearance or deformation certification", "utc": Time.get_datetime_string_from_system(true), "manifest_evidence": manifest_evidence, "manifest_errors": failures, "total": rows.size(), "passed": passed, "failed": rows.size() - passed, "results": rows}
    if not report_path.is_empty():
        var file := FileAccess.open(report_path, FileAccess.WRITE)
        if file == null:
            _abort("Cannot write report: " + report_path)
            return
        file.store_string(JSON.stringify(result, "  ") + "\n")
        file.close()
    print("AETHERION_GODOT_PRODUCTION total=", rows.size(), " passed=", passed, " failed=", rows.size() - passed, " manifest_errors=", failures.size())
    get_tree().quit(0 if passed == rows.size() and failures.is_empty() else 1)

func _pose_snapshot(scene: Node) -> Array:
    var pose: Array = []
    for node in _all_nodes(scene):
        if node is Node3D: pose.append(node.transform)
        if node is Skeleton3D:
            for bone in range(node.get_bone_count()): pose.append(node.get_bone_pose(bone))
    return pose

func _build_viewer():
    var environment := WorldEnvironment.new()
    environment.environment = Environment.new()
    environment.environment.background_mode = Environment.BG_COLOR
    environment.environment.background_color = Color(0.025, 0.035, 0.055)
    environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    environment.environment.ambient_light_color = Color(0.65, 0.72, 0.85)
    environment.environment.ambient_light_energy = 0.65
    add_child(environment)
    var light := DirectionalLight3D.new()
    light.rotation_degrees = Vector3(-45, -30, 0)
    light.light_energy = 2.0
    add_child(light)
    pivot = Node3D.new()
    add_child(pivot)
    camera = Camera3D.new()
    camera.near = 0.01
    camera.far = 500.0
    pivot.add_child(camera)
    camera.current = true
    var overlay := CanvasLayer.new()
    label = Label.new()
    label.position = Vector2(20, 20)
    label.add_theme_color_override("font_color", Color.WHITE)
    overlay.add_child(label)
    add_child(overlay)

func _show_asset():
    if current_scene != null: current_scene.free()
    animation_players.clear()
    var imported := _import(assets[selected])
    if imported.has("error"):
        label.text = imported.error
        return
    current_scene = imported.scene
    add_child(current_scene)
    var bounds := AABB()
    var have_bounds := false
    for node in _all_nodes(current_scene):
        if node is MeshInstance3D and node.mesh != null:
            var box: AABB = node.global_transform * node.get_aabb()
            bounds = bounds.merge(box) if have_bounds else box
            have_bounds = true
        if node is AnimationPlayer:
            animation_players.append(node)
            for clip in node.get_animation_list():
                if clip != "RESET":
                    node.play(clip)
                    break
    if have_bounds:
        pivot.position = bounds.get_center()
        distance = maxf(bounds.size.length() * 1.4, 0.5)
    label.text = str(selected + 1) + "/" + str(assets.size()) + "  " + assets[selected].trim_prefix(repo + "/") + "\nDrag: orbit | Wheel: zoom | Left/Right: asset | Space: pause/resume\nRuntime-import preview. Visual approval and engine parity remain unverified."
    _update_camera()

func _update_camera():
    pivot.rotation = Vector3(pitch, yaw, 0)
    camera.position = Vector3(0, 0, distance)

func _unhandled_input(event):
    if camera == null: return
    if event is InputEventMouseButton:
        if event.button_index == MOUSE_BUTTON_LEFT: dragging = event.pressed
        if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP: distance = maxf(0.1, distance * 0.9)
        if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN: distance *= 1.1
        _update_camera()
    if event is InputEventMouseMotion and dragging:
        yaw -= event.relative.x * 0.005
        pitch = clampf(pitch - event.relative.y * 0.005, -1.5, 1.5)
        _update_camera()
    if event is InputEventKey and event.pressed and not event.echo:
        if event.keycode == KEY_RIGHT or event.keycode == KEY_LEFT:
            selected = posmod(selected + (1 if event.keycode == KEY_RIGHT else -1), assets.size())
            _show_asset()
        if event.keycode == KEY_SPACE:
            for player in animation_players:
                if player.is_playing(): player.pause()
                else: player.play()
