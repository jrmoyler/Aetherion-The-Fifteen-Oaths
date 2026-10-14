extends SceneTree

func _initialize():
    var args = OS.get_cmdline_user_args()
    if args.size() != 1:
        push_error("Expected one absolute input GLB path")
        quit(2)
        return
    var document = GLTFDocument.new()
    var state = GLTFState.new()
    var code = document.append_from_file(args[0], state)
    if code != OK:
        push_error("GLTF import failed: " + str(code))
        quit(1)
        return
    var scene = document.generate_scene(state)
    if scene == null:
        push_error("GLTF scene generation returned null")
        quit(1)
        return
    root.add_child(scene)
    print("AETHERION_PROBE_JSON " + JSON.stringify({
        "version": Engine.get_version_info().string,
        "meshes": state.get_meshes().size(),
        "materials": state.get_materials().size(),
        "skins": state.get_skins().size(),
        "animations": state.get_animations().size(),
        "scene_instantiated": true,
    }))
    scene.free()
    quit(0)
