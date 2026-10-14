extends SceneTree
func _initialize():
 var mesh = MeshInstance3D.new()
 print('BAKE ',mesh.has_method('bake_mesh_from_current_skeleton_pose'))
 mesh.free()
 quit()
