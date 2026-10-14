extends Node3D
const Importer=preload("res://daybreak_importer.gd")
var importer
var camera: Camera3D
var label: Label
var assets: Array=[]
var selected=0
var lod=0
var center=Vector3.ZERO
var distance=8.0
var yaw=0.75
var pitch=0.35
var playing=false
var error=""

func _ready():
    var canvas=CanvasLayer.new()
    add_child(canvas)
    label=Label.new()
    label.position=Vector2(16,16)
    canvas.add_child(label)
    importer=Importer.new()
    add_child(importer)
    var manifest=""
    var repo=""
    var args=OS.get_cmdline_user_args()
    for i in range(0,args.size(),2):
        if i+1>=args.size():break
        if args[i]=="--manifest":manifest=args[i+1]
        if args[i]=="--repo":repo=args[i+1]
    var opened=importer.open_manifest(manifest,repo)
    if not opened.ok:
        label.text="Daybreak inspection\n"+opened.error+"\nRun with -- --manifest /absolute/path/manifest.json"
        return
    assets=importer.list_assets()
    var environment_node=WorldEnvironment.new()
    var environment=Environment.new()
    environment.background_mode=Environment.BG_COLOR
    environment.background_color=Color(0.16,0.17,0.19)
    environment.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR
    environment.ambient_light_color=Color.WHITE
    environment.ambient_light_energy=0.55
    environment_node.environment=environment
    add_child(environment_node)
    var light=DirectionalLight3D.new()
    light.rotation_degrees=Vector3(-45,-30,0)
    light.light_energy=2.0
    add_child(light)
    camera=Camera3D.new()
    camera.fov=48
    camera.far=500
    add_child(camera)
    show_asset()

func show_asset():
    if assets.is_empty():return
    var loaded=importer.load_asset(assets[selected].id,lod)
    if not loaded.ok:
        error=loaded.error
        update_label()
        return
    error=""
    playing=false
    var scene=importer.current_instance()
    var first=true
    var bounds=AABB()
    for node in scene.find_children("*","MeshInstance3D",true,false):
        var local=node.get_aabb()
        for corner in 8:
            var point=node.global_transform*local.get_endpoint(corner)
            if first:
                bounds=AABB(point,Vector3.ZERO)
                first=false
            else:bounds=bounds.expand(point)
    center=bounds.get_center()
    distance=maxf(bounds.size.length()*1.45,2.0)
    orbit()
    update_label()

func orbit():
    camera.position=center+Vector3(sin(yaw)*cos(pitch),sin(pitch),cos(yaw)*cos(pitch))*distance
    camera.look_at(center,Vector3.UP)

func update_label():
    if assets.is_empty():return
    var state=importer.current_report()
    label.text="Daybreak • "+assets[selected].originalModuleName+" • LOD "+str(lod)+"\n"
    if not state.is_empty():
        label.text+="Collision: "+state.collision_policy+" • "+str(state.static_bodies)+" authored static bodies\n"
        if state.collision_policy=="PENDING":label.text+="Moving baffle physics is not authored. Animation is presentation only.\n"
        if state.collision_policy=="NONE":label.text+="Non-solid canopy; no collision is created.\n"
        label.text+="Animation: "+("playing" if playing else "paused")+"\n"
    label.text+="Left/Right: module   1/2/3: LOD   Space: start/reset   [/]: start/midpoint\nDrag: orbit   Wheel: zoom\nPROPOSED / UNAPPROVED — desktop appearance requires visual review."
    if not error.is_empty():label.text+="\n"+error

func _unhandled_input(event):
    if assets.is_empty():return
    if event is InputEventKey and event.pressed and not event.echo:
        match event.keycode:
            KEY_LEFT: selected=posmod(selected-1,assets.size());show_asset()
            KEY_RIGHT:selected=(selected+1)%assets.size();show_asset()
            KEY_1,KEY_2,KEY_3:lod=event.keycode-KEY_1;show_asset()
            KEY_SPACE,KEY_BRACKETLEFT,KEY_BRACKETRIGHT:
                var clips=importer.current_report().get("animations",[])
                if clips.is_empty():return
                if event.keycode==KEY_SPACE:
                    playing=not playing
                    importer.seek_clip(clips[0],0,playing)
                else:
                    playing=false
                    importer.seek_clip(clips[0],0 if event.keycode==KEY_BRACKETLEFT else importer.clip_length(clips[0])*0.5,false)
                update_label()
    if event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
        yaw-=event.relative.x*0.007
        pitch=clampf(pitch+event.relative.y*0.007,-0.7,1.3)
        orbit()
    if event is InputEventMouseButton and event.pressed:
        if event.button_index==MOUSE_BUTTON_WHEEL_UP:distance=maxf(distance*0.9,0.5);orbit()
        if event.button_index==MOUSE_BUTTON_WHEEL_DOWN:distance*=1.1;orbit()

func _exit_tree():
    if is_instance_valid(importer):importer.unload()
