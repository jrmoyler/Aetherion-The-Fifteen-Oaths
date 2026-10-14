extends SceneTree
var meshes: Array[MeshInstance3D] = []
var players: Array[AnimationPlayer] = []
func collect(n: Node):
 if n is MeshInstance3D: meshes.append(n)
 if n is AnimationPlayer: players.append(n)
 for c in n.get_children(): collect(c)
func _initialize():
 call_deferred('run')
func run():
 var args = OS.get_cmdline_user_args()
 var document = GLTFDocument.new()
 var state = GLTFState.new()
 assert(document.append_from_file(args[0], state) == OK)
 var scene = document.generate_scene(state, 768.0)
 root.add_child(scene)
 await process_frame
 collect(scene)
 assert(players.size() == 1)
 var player = players[0]
 var rows = []
 for clip in ['idle_breath','walk_in_place','cast_release']:
  assert(player.has_animation(clip))
  var anim = player.get_animation(clip)
  anim.loop_mode = Animation.LOOP_NONE
  for instance in meshes:
   var skeleton = instance.get_node_or_null(instance.skeleton) as Skeleton3D
   if skeleton != null: skeleton.reset_bone_poses()
  player.play(clip)
  var frames = []
  if clip == 'walk_in_place':
   for i in range(993): frames.append(1.0 + i/32.0)
  else:
   for i in range(48): frames.append(float(i+1))
  for frame in frames:
   player.seek(frame/24.0, true)
   var minimum = INF
   var below = 0
   var count = 0
   for instance in meshes:
    var mesh = instance.mesh
    var skeleton = instance.get_node_or_null(instance.skeleton) as Skeleton3D
    var transforms = []
    if instance.skin != null:
     assert(skeleton != null)
     skeleton.force_update_all_bone_transforms()
     for bind in range(instance.skin.get_bind_count()):
      var bone = instance.skin.get_bind_bone(bind)
      if bone < 0: bone = skeleton.find_bone(instance.skin.get_bind_name(bind))
      assert(bone >= 0)
      transforms.append(skeleton.global_transform * skeleton.get_bone_global_pose(bone) * instance.skin.get_bind_pose(bind))
    for surface in range(mesh.get_surface_count()):
     var arrays = mesh.surface_get_arrays(surface)
     var vertices = arrays[Mesh.ARRAY_VERTEX]
     var bones = arrays[Mesh.ARRAY_BONES]
     var weights = arrays[Mesh.ARRAY_WEIGHTS]
     var influence_count = 0 if transforms.is_empty() else int(bones.size()/vertices.size())
     for idx in range(vertices.size()):
      var p = instance.global_transform * vertices[idx]
      if influence_count > 0:
       p = Vector3.ZERO
       for influence in range(influence_count):
        var k = idx*influence_count+influence
        p += (transforms[bones[k]] * vertices[idx]) * weights[k]
      minimum = min(minimum, p.y)
      if p.y < .012 - .000001: below += 1
      count += 1
   rows.append({'clip':clip,'frame':frame,'minimumWorldY':minimum,'clearance':minimum-.012,'verticesBelowFloor':below,'vertices':count})
  player.stop()
 var report = {'input':args[0],'version':Engine.get_version_info().string,'samples':rows,'method':'CPU skin evaluation from actual imported mesh arrays/Skin bind matrices/Skeleton3D poses; AnimationPlayer seek; floorY=.012; CPU/headless, no GPU appearance'}
 var file = FileAccess.open(args[1],FileAccess.WRITE)
 file.store_string(JSON.stringify(report,'  '))
 file.close()
 scene.free()
 print('GROUND_SAMPLES ',rows.size())
 quit()
