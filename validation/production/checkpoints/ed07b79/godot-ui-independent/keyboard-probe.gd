extends SceneTree
func _initialize():call_deferred("probe")
func probe():
    var view=load("res://preview.gd").new()
    root.add_child(view)
    await process_frame
    var before=view.importer.current_report().get("asset_id","")
    var instance=view.importer.current_instance().get_instance_id()
    var event=InputEventKey.new()
    event.keycode=KEY_RIGHT
    event.pressed=true
    view._unhandled_input(event)
    var after=view.importer.current_report().get("asset_id","")
    var title=view.label.text.split("\n")[0]
    print("UI_KEYBOARD_PROBE "+JSON.stringify({"before":before,"retained":after,"title":title,"requested":"broken-selection","selected":view.selected,"same_instance":instance==view.importer.current_instance().get_instance_id(),"mislabels_retained_scene":before==after and title.contains("BROKEN TEST MODULE"),"error_visible":view.label.text.contains("Invalid GLB")}))
    view.free()
    quit()
