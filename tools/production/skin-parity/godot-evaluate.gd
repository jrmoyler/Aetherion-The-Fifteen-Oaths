extends SceneTree

func _initialize():
    call_deferred("run")

func nodes(node: Node) -> Array:
    var result: Array = [node]
    for child in node.get_children(): result.append_array(nodes(child))
    return result

func xyz(value: Vector3) -> Array:
    return [value.x, value.y, value.z]

func sample(scene: Node) -> Array:
    var result: Array = []
    for node in nodes(scene):
        if node is Skeleton3D: node.force_update_all_bone_transforms()
    for node in nodes(scene):
        if not node is MeshInstance3D or node.mesh == null: continue
        var skeleton = node.get_node_or_null(node.skeleton) if not node.skeleton.is_empty() else null
        var skin = node.skin
        var registered = node.get_skin_reference()
        var native_available: bool = registered != null and registered.get_skeleton().is_valid()
        var baked = node.bake_mesh_from_current_skeleton_pose() if native_available else null
        var surfaces: Array = []
        for surface in range(node.mesh.get_surface_count()):
            var arrays = node.mesh.surface_get_arrays(surface)
            var positions = arrays[Mesh.ARRAY_VERTEX]
            var bones = arrays[Mesh.ARRAY_BONES]
            var weights = arrays[Mesh.ARRAY_WEIGHTS]
            var baked_positions = baked.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX] if baked != null else null
            var entries: Array = []
            var influences: int = 0 if bones == null else bones.size() / positions.size()
            for vertex in range(positions.size()):
                var position: Vector3 = positions[vertex]
                var evaluated: Vector3 = node.global_transform * position
                var vertex_weights: Array = []
                if skeleton is Skeleton3D and skin != null and influences > 0:
                    evaluated = Vector3.ZERO
                    for influence in range(influences):
                        var weight: float = weights[vertex * influences + influence]
                        if weight == 0: continue
                        var bind: int = bones[vertex * influences + influence]
                        var bone: int = skin.get_bind_bone(bind)
                        if skin.get_bind_name(bind) != "": bone = skeleton.find_bone(skin.get_bind_name(bind))
                        if bone < 0: push_error("Unresolved skin bone"); quit(2); return []
                        evaluated += (skeleton.global_transform * skeleton.get_bone_global_pose(bone) * skin.get_bind_pose(bind) * position) * weight
                        vertex_weights.append([skeleton.get_bone_name(bone), weight])
                entries.append({"local": xyz(position), "world": xyz(evaluated), "nativeBakedWorld": xyz(node.global_transform * baked_positions[vertex]) if baked_positions != null else null, "weights": vertex_weights})
            surfaces.append({"surface": surface, "vertices": entries})
        result.append({"node": str(node.name), "path": str(scene.get_path_to(node)), "skinned": skin != null and skeleton is Skeleton3D, "nativeBake": "AVAILABLE" if native_available else "UNAVAILABLE_NO_VALID_RENDERING_SERVER_SKELETON_RID", "surfaces": surfaces})
    return result

func run():
    var args = OS.get_cmdline_user_args()
    var input = JSON.parse_string(FileAccess.get_file_as_string(args[0]))
    var output: Dictionary = {"godotVersion": Engine.get_version_info(), "assets": []}
    for asset in input.assets:
        var document = GLTFDocument.new()
        var state = GLTFState.new()
        var error = document.append_from_file(asset.path, state)
        if error != OK: push_error("GLTF import failed: " + str(error)); quit(2); return
        var scene = document.generate_scene(state)
        root.add_child(scene)
        await process_frame
        await process_frame
        var row: Dictionary = {"id": asset.id, "rest": sample(scene)}
        var player: AnimationPlayer = null
        for node in nodes(scene):
            if node is AnimationPlayer: player = node; break
        if player == null or not player.has_animation(asset.clip): push_error("Missing clip " + asset.clip); quit(2); return
        player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
        row["clip"] = asset.clip
        row["duration"] = player.get_animation(asset.clip).length
        row["time"] = asset.time
        player.play(asset.clip)
        player.seek(asset.time, true)
        player.advance(0)
        row["animated"] = sample(scene)
        output.assets.append(row)
        scene.free()
    var file = FileAccess.open(args[1], FileAccess.WRITE)
    file.store_string(JSON.stringify(output))
    file.close()
    quit(0)
