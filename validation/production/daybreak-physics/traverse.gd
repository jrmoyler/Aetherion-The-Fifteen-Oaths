extends SceneTree

const SPEED = 1.2
const GRAVITY = 9.8
const CAPSULE_HEIGHT = 1.8
const CAPSULE_RADIUS = 0.25
var cases: Array = []
var case_index = -1
var current: Dictionary
var reports: Array = []
var arena: Node3D
var actor: CharacterBody3D
var tick_count = 0
var samples: Array = []
var max_air_ticks = 0
var air_ticks = 0
var reached = false
var minimum_foot = INF
var case_imports: Array = []
var output_path: String
var initialized = false

func _initialize():
    var args = OS.get_cmdline_user_args()
    output_path = args[0] if args.size() > 0 else "res://results.json"
    for kind in ["stairs", "ramp"]:
        for direction in ["ascending", "descending"]:
            cases.append({"id":kind+"-"+direction,"kind":kind,"direction":direction,"mutation":"none","expected":"traversable"})
        for mutation in ["gap", "step"]:
            cases.append({"id":kind+"-negative-"+mutation,"kind":kind,"direction":"ascending","mutation":mutation,"expected":"refused"})
    call_deferred("next_case")

func import_bodies(path: String, offset: Vector3, mutate_landing: bool):
    var document = GLTFDocument.new()
    var state = GLTFState.new()
    var code = document.append_from_file(path,state)
    assert(code == OK,"Actual collision GLB import failed")
    var scene = document.generate_scene(state)
    assert(scene != null,"Actual collision GLB scene failed")
    arena.add_child(scene)
    var records: Array = []
    for mesh_node in scene.find_children("*","MeshInstance3D",true,false):
        var body = StaticBody3D.new()
        arena.add_child(body)
        body.global_transform = mesh_node.global_transform
        body.position += offset
        var is_landing = mesh_node.name.begins_with("COL_floor") and mutate_landing
        if is_landing and current.mutation == "gap":
            body.position.z -= 1.0
        if is_landing and current.mutation == "step":
            body.position.y += 0.65
        var shape = CollisionShape3D.new()
        shape.shape = mesh_node.mesh.create_trimesh_shape()
        body.add_child(shape)
        records.append({"name":str(mesh_node.name),"landing":is_landing,"shape":"actual_mesh_concave_trimesh","position":[body.position.x,body.position.y,body.position.z]})
    case_imports.append({"path":path,"meshes":records})
    scene.free()

func next_case():
    initialized = false
    if is_instance_valid(arena): arena.free()
    case_index += 1
    if case_index >= cases.size():
        finish()
        return
    current = cases[case_index]
    arena = Node3D.new()
    root.add_child(arena)
    case_imports = []
    var fixture = "stairs-with-landing" if current.kind == "stairs" else "ramp-with-landing"
    import_bodies("res://inputs/"+fixture+"-collision.glb",Vector3.ZERO,true)
    # A starting apron is another actual authored floor proxy, translated only.
    import_bodies("res://inputs/start-floor-collision.glb",Vector3(-1.1,0,4),false)
    actor = CharacterBody3D.new()
    actor.name = "Proposed_capsule_controller"
    actor.up_direction = Vector3.UP
    actor.floor_max_angle = deg_to_rad(45)
    actor.floor_snap_length = 0.25
    actor.floor_constant_speed = true
    actor.safe_margin = 0.001
    var capsule = CapsuleShape3D.new()
    capsule.height = CAPSULE_HEIGHT
    capsule.radius = CAPSULE_RADIUS
    var collision = CollisionShape3D.new()
    collision.shape = capsule
    actor.add_child(collision)
    arena.add_child(actor)
    var run = 2.7 if current.kind == "stairs" else 4.8
    var rise = 1.6 if current.kind == "stairs" else 0.4
    if current.direction == "ascending": actor.position = Vector3(0.9, CAPSULE_HEIGHT/2+0.04, 0.8)
    else: actor.position = Vector3(0.9,rise+CAPSULE_HEIGHT/2+0.04,-run-1.2)
    samples=[]
    tick_count=0
    max_air_ticks=0
    air_ticks=0
    reached=false
    minimum_foot=INF
    initialized=true

func _physics_process(delta: float) -> bool:
    if not initialized: return false
    tick_count += 1
    var run = 2.7 if current.kind == "stairs" else 4.8
    var rise = 1.6 if current.kind == "stairs" else 0.4
    var ascending = current.direction == "ascending"
    var target_z = -run-1.2 if ascending else 0.8
    var moving = tick_count > 30 and not reached
    actor.velocity.x = 0
    actor.velocity.z = (-SPEED if ascending else SPEED) if moving else 0.0
    if not actor.is_on_floor(): actor.velocity.y -= GRAVITY * delta
    else: actor.velocity.y = 0
    actor.move_and_slide()
    var foot = actor.position.y-CAPSULE_HEIGHT/2
    minimum_foot=min(minimum_foot,foot)
    if tick_count>30:
        air_ticks = 0 if actor.is_on_floor() else air_ticks+1
        max_air_ticks=max(max_air_ticks,air_ticks)
    if tick_count % 5 == 0:
        samples.append({"tick":tick_count,"x":actor.position.x,"foot_y":foot,"z":actor.position.z,"on_floor":actor.is_on_floor(),"slide_collisions":actor.get_slide_collision_count(),"delta":delta})
    if moving and ((ascending and actor.position.z <= target_z) or (not ascending and actor.position.z >= target_z)):
        reached=true
    if reached or tick_count>=900 or foot < -2:
        var target_height = rise if ascending else 0.0
        var traversable = reached and actor.is_on_floor() and abs(foot-target_height)<0.08 and max_air_ticks<=3 and abs(actor.position.x-0.9)<0.02
        var accepted = traversable if current.expected == "traversable" else not traversable
        reports.append({"case":current,"passed_expectation":accepted,"traversable":traversable,"reached_target":reached,"final_on_floor":actor.is_on_floor(),"final_position":[actor.position.x,actor.position.y,actor.position.z],"final_foot_height":foot,"target_foot_height":target_height,"maximum_airborne_ticks_after_settle":max_air_ticks,"minimum_foot_height":minimum_foot,"ticks":tick_count,"imports":case_imports,"samples":samples})
        print("DAYBREAK_PHYSICS ",current.id," expectation=",accepted," traversable=",traversable," reached=",reached," max_air=",max_air_ticks," foot=",foot)
        initialized=false
        call_deferred("next_case")
    return false

func finish():
    var failures=reports.filter(func(r):return not r.passed_expectation).size()
    var result={"status":"PASS_SCOPED_PHYSICS" if failures==0 else "FAIL_SCOPED_PHYSICS","engine":Engine.get_version_info().string,"physics_engine":"GodotPhysics3D","cases":reports,"failures":failures,"proposed_controller":{"capsule_height_m":CAPSULE_HEIGHT,"capsule_radius_m":CAPSULE_RADIUS,"speed_mps":SPEED,"gravity_mps2":GRAVITY,"floor_max_angle_degrees":45,"floor_snap_length_m":0.25,"safe_margin_m":0.001,"physics_hz":60},"scope":"Real StaticBody3D triangle collision and CharacterBody3D capsule move_and_slide on actual exported authored proxies, headless; no GPU rendering","limitations":["Stair movement proxy is a smooth wedge, not rendered discrete treads","Only centerline single-capsule straight ascents/descents tested","Controller parameters are proposed, not approved player/mount clearances","No landing guard, navmesh, multiplayer, accessibility, material or visual approval","Negative gap and step are explicit destructive test mutations of in-memory landing bodies only"]}
    var file=FileAccess.open(output_path,FileAccess.WRITE)
    file.store_string(JSON.stringify(result,"  "))
    file.close()
    quit(0 if failures==0 else 1)
