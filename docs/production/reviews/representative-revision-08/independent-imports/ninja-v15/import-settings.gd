extends SceneTree
func _initialize():
 var args = OS.get_cmdline_user_args()
 var before = OS.get_static_memory_usage()
 var doc = GLTFDocument.new()
 var state = GLTFState.new()
 assert(doc.append_from_file(args[0],state)==OK)
 var fps = float(args[1])
 var scene = doc.generate_scene(state,fps)
 root.add_child(scene)
 var tracks=[]
 for player in scene.find_children('*','AnimationPlayer'):
  for clip in player.get_animation_list():
   var a=player.get_animation(clip)
   var keys=0
   for i in range(a.get_track_count()): keys+=a.track_get_key_count(i)
   tracks.append({'clip':clip,'trackCount':a.get_track_count(),'keyCount':keys,'length':a.length})
 print('SETTINGS_JSON '+JSON.stringify({'input':args[0],'bakeFps':fps,'version':Engine.get_version_info().string,'animationTracks':tracks,'staticMemoryBytesBefore':before,'staticMemoryBytesAfterImport':OS.get_static_memory_usage(),'memoryScope':'Godot static allocator snapshot; not processRSS/VRAM or isolated animation allocation'}))
 scene.free()
 quit()
