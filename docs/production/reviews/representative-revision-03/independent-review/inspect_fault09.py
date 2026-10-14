import bpy,json,pathlib,hashlib
p=pathlib.Path('/tmp/aetherion-resumed-independent-review')
images=[]
for i in bpy.data.images:
 if i.source=='VIEWER':continue
 packed=bytes(i.packed_file.data) if i.packed_file else None
 images.append({'name':i.name,'size':list(i.size),'colorspace':i.colorspace_settings.name,'packed':i.packed_file is not None,'packedSha256':hashlib.sha256(packed).hexdigest() if packed else None})
meshes=[o for o in bpy.data.objects if o.type=='MESH']
r={'blenderVersion':bpy.app.version_string,'openedSource':bpy.data.filepath,'meshObjects':len(meshes),'missingUV':[o.name for o in meshes if not o.data.uv_layers],'missingMaterials':[o.name for o in meshes if not o.data.materials],'images':images,'nodeConnections':{m.name:[{'fromNode':l.from_node.name,'fromSocket':l.from_socket.name,'toNode':l.to_node.name,'toSocket':l.to_socket.name} for l in m.node_tree.links] for m in bpy.data.materials if m.use_nodes},'sourceModified':False}
(p/'fault09.blender-inspection.json').write_text(json.dumps(r,indent=2)+'\n')
