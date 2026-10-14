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
 var scene = document.generate_scene(state)
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
    var mesh = instance.bake_mesh_from_current_skeleton_pose() if instance.skin != null else instance.mesh
    assert(mesh != null)
    for surface in range(mesh.get_surface_count()):
     var vertices = mesh.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX]
     for local in vertices:
      var p = instance.global_transform * local
      minimum = min(minimum, p.y)
      if p.y < .012 - .000001: below += 1
      count += 1
   rows.append({'clip':clip,'frame':frame,'minimumWorldY':minimum,'clearance':minimum-.012,'verticesBelowFloor':below,'vertices':count})
  player.stop()
 var report = {'input':args[0],'version':Engine.get_version_info().string,'samples':rows,'method':'MeshInstance3D.bake_mesh_from_current_skeleton_pose; actual imported AnimationPlayer seek; floorY=.012; CPU/headless, no GPU appearance'}
 var file = FileAccess.open(args[1],FileAccess.WRITE)
 file.store_string(JSON.stringify(report,'  '))
 file.close()
 scene.free()
 print('GROUND_SAMPLES ',rows.size())
 quit()
