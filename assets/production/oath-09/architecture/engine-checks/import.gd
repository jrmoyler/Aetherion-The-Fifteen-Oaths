extends SceneTree
func _initialize():
    var args = OS.get_cmdline_user_args()
    var request = JSON.parse_string(FileAccess.get_file_as_string(args[0]))
    var reports = []
    var errors = 0
    for path in request.glbs:
        var doc = GLTFDocument.new()
        var state = GLTFState.new()
        var code = doc.append_from_file(path, state)
        if code != OK:
            reports.append({"path":path,"error":code})
            errors += 1
            continue
        var instance = doc.generate_scene(state)
        if instance == null:
            reports.append({"path":path,"error":"scene-null"})
            errors += 1
            continue
        root.add_child(instance)
        var image_reports = []
        for texture in state.get_images():
            var image = texture.get_image() if texture != null else null
            if image == null or image.is_empty():
                errors += 1
                image_reports.append({"decoded":false})
            else:
                image_reports.append({"decoded":true,"width":image.get_width(),"height":image.get_height()})
        var players = instance.find_children("*", "AnimationPlayer", true, false)
        var clips = []
        for player in players:
            for key in player.get_animation_list():
                if key == "RESET":continue
                var animation = player.get_animation(key)
                player.play(key)
                player.seek(animation.length * 0.5, true)
                clips.append({"name":key,"duration":animation.length,"tracks":animation.get_track_count(),"midpoint_seek":true})
                player.stop()
        reports.append({"path":path,"meshes":state.get_meshes().size(),"materials":state.get_materials().size(),"animations":clips,"images":image_reports,"scene_instantiated_and_freed":true})
        instance.free()
    var result = {"engine_version":Engine.get_version_info().string,"scope":"Actual Godot headless GLTFDocument import, texture decode, instantiation, clip seek and free; no rendered appearance or gameplay claim","errors":errors,"reports":reports}
    var output = FileAccess.open(args[1],FileAccess.WRITE)
    output.store_string(JSON.stringify(result,"  "))
    output.close()
    print("DAYBREAK_GODOT_IMPORTS ", reports.size(), " ERRORS ", errors)
    quit(0 if errors == 0 else 1)
