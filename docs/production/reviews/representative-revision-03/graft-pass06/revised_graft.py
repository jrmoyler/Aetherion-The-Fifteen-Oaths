"""Reference-049 construction revision; previews remain outside published assets."""
import sys,math,json,os
from pathlib import Path
sys.path.insert(0,'/workspace/Aetherion-The-Fifteen-Oaths/tools/production/authoring')
import reed_weapons as w
from reed_weapons import t,bpy,np
from mathutils import Vector
OUT=Path('/tmp/aetherion-weapon-revision/graft-pass06');OUT.mkdir(parents=True,exist_ok=True)

def material(name):
    n=1024;v,u=np.mgrid[0:n,0:n]/n
    if name in ['Bark','Husk']:
        # Growth-aligned narrow cracks with unequal finite branches, edge wear and knots.
        fiss=np.zeros_like(u);edge=np.zeros_like(u);grain=np.zeros_like(u)
        rng=np.random.default_rng(149)
        for j in range(31):
            uc=(j+.3+rng.random()*.4)/31;start=rng.uniform(-.3,.7);length=rng.uniform(.25,.9)
            center=uc+.009*np.sin(v*(5+j%5)+j)+.004*np.sin(v*21+j)
            width=rng.uniform(.0008,.0027);window=np.clip((v-start)*12,0,1)*np.clip((start+length-v)*12,0,1)
            groove=np.exp(-((u-center)/width)**2)*window
            fiss=np.maximum(fiss,groove);edge=np.maximum(edge,np.exp(-((u-center-width*2.8)/(width*1.2))**2)*window)
            if j%3==0:
                bend=center+.044*np.clip((v-start-.16)/.28,0,1)
                fiss=np.maximum(fiss,.8*np.exp(-((u-bend)/width)**2)*window*np.exp(-((v-start-.31)/.18)**4))
            grain+=.012*np.sin(u*math.tau*(51+j%7)+v*(2+j%3)+j)
        h=grain-.20*fiss+.06*edge
        base=np.zeros((n,n,3));base[:]=[.23,.116,.045]
        base+=grain[:,:,None]*np.array([.9,.52,.24]);base-=fiss[:,:,None]*np.array([.18,.085,.032]);base+=edge[:,:,None]*np.array([.14,.080,.034])
        # Sparse fine moss crevices, not broad painted green panels.
        patches=np.zeros_like(u)
        for pu,pv in [(.13,.27),(.57,.72),(.79,.44)]:patches=np.maximum(patches,np.exp(-((u-pu)/.022)**2-((v-pv)/.075)**2))
        speck=(np.sin(u*1901+np.sin(v*111))*.5+.5)*(np.sin(v*1377)*.5+.5)
        mossmask=np.clip((patches-.30)*1.7,0,.85)*speck
        base=base*(1-mossmask[:,:,None])+np.array([.14,.17,.025])*mossmask[:,:,None]
        h+=mossmask*.05;rough=.69+.19*fiss+.08*mossmask;metallic=0
        if name=='Husk':base+=np.array([.025,.011,.003])
    elif name=='Leaf':
        mid=np.exp(-((u-.5)/.012)**2);veins=np.zeros_like(u)
        for j in range(1,7):
            line=j*.13+abs(u-.5)*.65;veins=np.maximum(veins,np.exp(-((v-line)/.009)**2))
        edge=np.clip(abs(u-.5)*1.6,0,1)
        h=.12*mid+.07*veins
        base=np.stack([.14+.09*(1-edge)+.035*veins,.22+.12*(1-edge)+.025*veins,.018+.025*(1-edge)],axis=-1);rough=np.full_like(u,.72);metallic=0
    elif name=='Sap':
        flow=.5+.5*np.sin(u*16+np.sin(v*13)*1.8);fiss=np.exp(-((np.sin(u*22+v*6))/.075)**2)
        h=.025*flow;base=np.stack([.58+.3*flow,.13+.23*flow+.13*fiss,.006+.018*flow],axis=-1);rough=.29+.06*(1-flow);metallic=0
    elif name=='Fiber':
        thread=np.sin(u*math.tau*72)*np.sin(v*math.tau*95);h=.08*thread;base=np.stack([.13+.025*thread,.105+.025*thread,.045+.012*thread],axis=-1);rough=np.full_like(u,.83);metallic=0
    else:
        h=.05*np.sin(u*60);base=np.stack([.11+h*.4,.17+h*.5,.022+h*.1],axis=-1);rough=np.full_like(u,.76);metallic=0
    mat=bpy.data.materials.new('Graft_'+name);mat.use_nodes=True;nt=mat.node_tree;bs=nt.nodes.get('Principled BSDF');bs.inputs['Specular IOR Level'].default_value=.12
    if name=='Leaf':bs.inputs['Specular IOR Level'].default_value=.06
    if name=='Sap':bs.inputs['Transmission Weight'].default_value=.64;bs.inputs['IOR'].default_value=1.46;bs.inputs['Specular IOR Level'].default_value=.22
    if name=='Sap':
        absorption=nt.nodes.new('ShaderNodeVolumeAbsorption');absorption.inputs['Color'].default_value=(.83,.28,.035,1);absorption.inputs['Density'].default_value=12
        nt.links.new(absorption.outputs['Volume'],nt.nodes.get('Material Output').inputs['Volume'])
    dy,dx=np.gradient(h);normal=np.stack([-dx*35,-dy*18,np.ones_like(u)],axis=-1);normal/=np.linalg.norm(normal,axis=-1)[:,:,None];normal=normal*.5+.5
    paths=[]
    for kind,rgb in [('basecolor',base),('roughness',np.repeat(rough[:,:,None],3,axis=2)),('metallic',np.full((n,n,3),metallic)),('normal',normal)]:
        arr=np.ones((n,n,4),dtype=np.float32);arr[:,:,:3]=np.clip(rgb,0,1);im=bpy.data.images.new('Graft_'+name+'_'+kind,width=n,height=n);im.pixels.foreach_set(arr.ravel());im.file_format='PNG';im.filepath_raw=str(OUT/(name+'_'+kind+'.png'));im.save();
        if kind!='basecolor':im.colorspace_settings.name='Non-Color'
        tex=nt.nodes.new('ShaderNodeTexImage');tex.image=im
        if kind=='normal':nd=nt.nodes.new('ShaderNodeNormalMap');nd.inputs['Strength'].default_value=.65;nt.links.new(tex.outputs['Color'],nd.inputs['Color']);nt.links.new(nd.outputs['Normal'],bs.inputs['Normal'])
        else:nt.links.new(tex.outputs['Color'],bs.inputs[{'basecolor':'Base Color','roughness':'Roughness','metallic':'Metallic'}[kind]])
        paths.append(str(im.filepath_raw));im.pack()
    t.MATS[name]=(mat,paths)

def uv_mesh(name,vs,fs,uv,mat,smooth=True):
    o=t.mesh(name,vs,fs,mat);layer=o.data.uv_layers.new(name='UV0_component_aligned')
    for p in o.data.polygons:
        p.use_smooth=smooth
        for li in p.loop_indices:layer.data[li].uv=uv[o.data.loops[li].vertex_index]
    o['uv_contract']='U circumferential/transverse; V follows growth/length; deliberate reusable material UVs; no SmartProject.'
    return o

def curve(points,steps=7):
    pp=[Vector(p) for p in points];out=[]
    for i in range(len(pp)-1):
        a,b,c,d=pp[max(0,i-1)],pp[i],pp[i+1],pp[min(len(pp)-1,i+2)]
        for j in range(steps):
            s=j/steps;out.append(.5*((2*b)+(-a+c)*s+(2*a-5*b+4*c-d)*s*s+(-a+3*b-3*c+d)*s*s*s))
    return out+[pp[-1]]

def growth(name,points,radii,mat='Bark',sides=12,twist=1,ridge=.22):
    points=[Vector(p) for p in points];vs=[];uv=[];dist=0
    for i,p in enumerate(points):
        if i:dist+=(p-points[i-1]).length
        s=i/(len(points)-1);ix=s*(len(radii)-1);r=radii[min(int(ix),len(radii)-1)]*(1-(ix%1))+radii[min(int(ix)+1,len(radii)-1)]*(ix%1)
        tangent=(points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized();side=tangent.cross(Vector((0,1,0))).normalized();front=tangent.cross(side).normalized()
        for j in range(sides+1):
            a=j*math.tau/sides;rr=r*(1+ridge*math.cos(a*5+twist*s*4)+.10*math.sin(a*3-s*9))*(1+.17*math.exp(-((s-.32)/.07)**2)+.13*math.exp(-((s-.69)/.05)**2));pos=p+side*math.cos(a+twist*s)*rr+front*math.sin(a+twist*s)*rr*.76;vs.append(pos);uv.append((j/sides,dist*2.8))
    fs=[];row=sides+1
    for i in range(len(points)-1):
        for j in range(sides):a=i*row+j;fs.append((a,a+1,a+1+row,a+row))
    fs += [tuple(reversed(range(row))),tuple((len(points)-1)*row+j for j in range(row))]
    return uv_mesh(name,vs,fs,uv,mat,smooth=sides<10)

def ribbon(name,points,widths,mat='Bark',twist=0):
    ps=[Vector(p) for p in points];vs=[];uv=[];dist=0
    for i,p in enumerate(ps):
        if i:dist+=(p-ps[i-1]).length
        s=i/(len(ps)-1);ix=s*(len(widths)-1);wi=(widths[int(ix)]*(1-ix%1)+widths[min(int(ix)+1,len(widths)-1)]*(ix%1))*(1+.16*math.sin(i*1.71)+.09*math.sin(i*3.9))
        tangent=(ps[min(i+1,len(ps)-1)]-ps[max(i-1,0)]).normalized();side=tangent.cross(Vector((0,1,0))).normalized();normal=tangent.cross(side).normalized();side=side*math.cos(twist*s)+normal*math.sin(twist*s)
        for j in range(5):
            q=j/4*2-1;pos=p+side*q*wi+normal*(.004*(1-q*q)+.0015*math.sin(s*30+j));vs.append(pos);uv.append((.17+j/4*.34,dist*2))
    fs=[(i*5+j,i*5+j+1,(i+1)*5+j+1,(i+1)*5+j) for i in range(len(ps)-1) for j in range(4)];o=uv_mesh(name,vs,fs,uv,mat,smooth=False);mod=o.modifiers.new('Real_bark_sheet_thickness','SOLIDIFY');mod.thickness=.004;return o

def leaf(name,base,direction,length=.065,width=.021,roll=0):
    base=Vector(base);axis=Vector(direction).normalized();across=axis.cross(Vector((0,1,0))).normalized();normal=axis.cross(across).normalized();across=across*math.cos(roll)+normal*math.sin(roll);vs=[];uv=[]
    rows=9
    for i in range(rows):
        s=i/(rows-1);half=width*math.sin(math.pi*s)**.65*(.88 if i%2 else 1);center=base+axis*length*s+normal*(.004*math.sin(math.pi*s)-.005*s*s)
        for j in range(3):q=j-1;vs.append(center+across*half*q-normal*abs(q)*.004*math.sin(math.pi*s));uv.append((j/2,s))
    fs=[(i*3+j,i*3+j+1,(i+1)*3+j+1,(i+1)*3+j) for i in range(rows-1) for j in range(2)]
    return uv_mesh(name,vs,fs,uv,'Leaf',False)

def sprig(base,tip,seed=0):
    base=Vector(base);tip=Vector(tip);axis=(tip-base).normalized()
    path=curve([base,(base+tip)/2+Vector((.009*math.sin(seed),-.004,.010)),tip],5)
    growth('Delicate_source_branchlet',path,[.0035,.0022,.0006],sides=7,ridge=.09)
    # Alternating short petioles and subordinate branches replace identical paired fans.
    for i,q in enumerate([.24,.43,.62,.81]):
        p=base+(tip-base)*q;side=-1 if (i+seed)%2 else 1
        dd=Vector((side*(.6+.15*math.sin(i+seed)),-.09,.55)).normalized()
        end=p+dd*(.026+.006*math.sin(i+seed))
        growth('Leaf_petiole',curve([p,(p+end)/2+Vector((0,0,.004)),end],3),[.0016,.001,.00035],sides=6,ridge=.05)
        leaf('Alternating_ovate_leaf',end,dd,.029+.007*math.sin(i*1.4+seed)**2,.009+.003*math.sin(i+1)**2,side*.30)
        if i in [1,3]:
            leaf('Small_axillary_leaf',p+dd*.009,(axis*.5+Vector((-side*.4,-.1,.3))).normalized(),.025,.008,-side*.2)
    leaf('Twig_terminal_leaf',tip,axis,.032,.010,.2)

def seed(center,size,phase=0):
    c=Vector(center);vs=[];uv=[];sides=24;rows=25
    for i in range(rows):
        q=i/(rows-1);zz=-.58+1.30*q
        rr=.30*math.sin(math.pi*q)**.60*(1-.18*q)
        for j in range(sides+1):
            a=j*math.tau/sides;organic=1+.042*math.sin(a*3+q*8)
            vs.append(c+Vector(((rr*math.cos(a)*organic+.020*math.sin(q*math.pi))*size,rr*.70*math.sin(a)*size,zz*size)))
            uv.append((j/sides,q))
    fs=[];row=sides+1
    for i in range(rows-1):
        for j in range(sides):
            a=i*row+j
            fs.append((a,a+row+1,a+row) if i==0 else (a,a+1,a+row) if i==rows-2 else (a,a+1,a+row+1,a+row))
    heart=uv_mesh('Contained_amber_sap',vs,fs,uv,'Sap',True)
    # Long split timber husks traced from source front outline, not petal scales.
    # Source-relative pod profile: narrow root, widest below mid-height, inward upper curl.
    profile=[(0,-1.00),(.30,-.75),(.58,-.35),(.66,.08),(.55,.46),(.34,.76),(.20,1.02)]
    for j,angle in enumerate([-175,-147,-119,-56,-28,1,29,57,88,116,144,174]):
        a=math.radians(angle)+phase;height=.90+.11*math.sin(j*1.7);radial=1+.07*math.sin(j*2.3)
        path=curve([(r*radial*size*math.cos(a+.09*k/6),r*.70*radial*size*math.sin(a+.09*k/6),z*size*height) for k,(r,z) in enumerate(profile)],5)
        vs=[];uv=[];nc=7
        for k,p in enumerate(path):
            q=k/(len(path)-1);width=(.10+.055*math.sin(j*1.8)**2)*size*math.sin(math.pi*q)**.70
            tangent=Vector((-math.sin(a),math.cos(a),0));out=Vector((math.cos(a),math.sin(a),0))
            for h in range(nc):
                across=h/(nc-1)*2-1
                # Raised irregular woody ridge, split thin margins; growth follows surface UV.
                ridge=(.023*(1-abs(across))+.006*math.sin(q*25+j)*(1-across*across))*size
                vs.append(c+p+tangent*across*width+out*ridge)
                uv.append(((j*.083+h/(nc-1)*.15)%1,q*.97))
        fs=[(k*nc+h,k*nc+h+1,(k+1)*nc+h+1,(k+1)*nc+h) for k in range(len(path)-1) for h in range(nc-1)]
        ob=uv_mesh('Elongated_split_woody_husk_%02d'%j,vs,fs,uv,'Husk',True);th=ob.modifiers.new('Split_wood_thickness','SOLIDIFY');th.thickness=.0024
        # Narrow raised wooden fibres diverge from each plate at the tip.
        for side in [-1,1]:
            line=[c+p+Vector((-math.sin(a),math.cos(a),0))*(side*size*.052*math.sin(math.pi*k/(len(path)-1))**.7)+Vector((math.cos(a),math.sin(a),0))*size*.025 for k,p in enumerate(path)]
            growth('Husk_split_edge_fibre',line,[.0018,.0022,.0014,.00045],mat='Husk',sides=5,ridge=.07,twist=.2)
    for j in range(4):
        a=j*math.tau/4
        growth('Husk_root_join',curve([c+Vector((0,0,-size*1.20)),c+Vector((size*.13*math.cos(a),size*.09*math.sin(a),-size*.85)),c+Vector((size*.29*math.cos(a),size*.20*math.sin(a),-size*.61))],4),[.009,.006,.001],sides=7,twist=.4)
    return heart

def strand_bundle(name,centerline,width):
    centerline=[Vector(p) for p in centerline]
    for j in range(5):
        ps=[]
        for i,p in enumerate(centerline):
            s=i/(len(centerline)-1);a=j*math.tau/5+s*4.1;off=width*(.62+.3*math.sin(math.pi*s));ps.append(p+Vector((math.cos(a)*off,math.sin(a)*off*.7,0)))
        growth(name+str(j),ps,[width*.40,width*.53,width*.33,width*.18],twist=.7+j*.2)
    # Broad torn edge strips run along the structure and taper at their tips.
    for j in range(3):
        ps=[p+Vector((width*.75*math.sin(i*.2+j),-width*.63,width*.2*math.cos(i*.4))) for i,p in enumerate(centerline)]
        ribbon('Exposed_longitudinal_bark',ps,[.001,width*.55,width*.45,.001],'Husk',twist=.6)

def P(x,y,depth=0):
    # Front reference049 pixel coordinates; 422px height represented as 2 metres.
    return Vector(((x-1073)/211,depth+.018*math.sin((y-230)*.035),(570-y)/211-1))

def staff():
    # Measured reference centerline and branch junctions in source pixels.
    trunk=curve([P(1075,524),P(1077,482),P(1071,444),P(1076,401),P(1068,363),P(1076,326),P(1071,290),P(1073,256),P(1073,230)],7)
    growth('Measured_gnarled_main_shaft',trunk,[.023,.030,.028,.025,.031,.023,.028,.020,.018],sides=16,twist=2.7,ridge=.23)
    # Unequal interwoven load-bearing woody strands, keeping the measured silhouette.
    for j,span in enumerate([(0,len(trunk)),(4,47),(13,55)]):
        ps=[]
        for k,p in enumerate(trunk[span[0]:span[1]]):
            f=(k+span[0])/(len(trunk)-1);a=f*19+j*2.3+.3*math.sin(f*7)
            ps.append(p+Vector((.021*math.cos(a),.018*math.sin(a),0)))
        growth('Twisted_longitudinal_wood_strand',ps,[.008,.012,.009,.004],sides=9,twist=1.3+j*.3,ridge=.25)
    # Thin relief ribbons follow the trunk's changing grain and terminate at torn tips.
    for j in range(14):
        start=(j*7)%38;count=15+(j%4)*3;ps=[]
        for k,p in enumerate(trunk[start:min(len(trunk),start+count)]):
            f=(start+k)/(len(trunk)-1);a=f*(12+j%3)+j*2.1
            ps.append(p+Vector((.028*math.cos(a),.023*math.sin(a),0)))
        growth('Fine_gnarled_grain_relief',ps,[.0005,.0028,.0019,.0003],sides=5,twist=.2,ridge=.15)
    branches=[[(1073,280),(1054,257),(1037,236),(1029,211),(1020,193)],[(1072,256),(1094,239),(1112,220),(1120,196),(1130,180)],[(1075,348),(1087,332),(1097,317),(1104,313)]]
    paths=[]
    for j,bp in enumerate(branches):
        ps=curve([P(x,y,([.14,-.13,.095][j])*(k/(len(bp)-1))**.8+.006*math.sin(k+j)) for k,(x,y) in enumerate(bp)],6);paths.append(ps)
        growth('Reference_branch_hierarchy',ps,[.014 if j<2 else .009,.010,.005,.0012 if j<2 else .009],sides=10,twist=1.4,ridge=.2)
        for k in [5,12,18] if j<2 else [5,11]:
            side=-1 if j==0 else 1
            base=ps[min(k,len(ps)-1)];sprig(base,base+Vector((side*(.032+.007*k),(.035 if j==0 else -.04)*math.sin(k*.6),.030+.003*k)),j*5+k)
    seed(P(1073,193,-.002),.207,.04)
    seed(P(1104,291,.095),.116,.20)
    # Forking roots use measured spread, with natural nonuniform bends and branchlets.
    for j,(xend,yend) in enumerate([(1040,551),(1046,565),(1060,570),(1078,562),(1091,563),(1114,556)]):
        ps=curve([P(1075,512),P(1072+(xend-1073)*.25,533,.025*math.sin(j*1.7)),P(xend-3*math.sin(j),yend-12,.060*math.sin(j*1.7)),P(xend,yend,.078*math.sin(j*1.7))],5)
        growth('Source_forked_root',ps,[.009,.007,.003,.0005],sides=7,twist=.6,ridge=.16)
        if j%2==0:
            p=ps[8];growth('Fine_root_branchlet',curve([p,p+Vector((-.021,0,-.027)),p+Vector((-.027,.004,-.046))],4),[.0028,.0015,.00025],sides=5,ridge=.1)
    for j,(x,y,side) in enumerate([(1073,306,-1),(1070,371,1),(1073,416,-1),(1076,462,1),(1074,497,-1)]):
        base=P(x,y,-.012);sprig(base,base+Vector((side*.062,.036*math.sin(j*2),.049)),j+20)
    # Local vine follows bark crevices with small scale, rather than a thick geometric helix.
    ps=[]
    for k,p in enumerate(trunk):
        a=k*.49+.5*math.sin(k*.3);ps.append(p+Vector((.031*math.cos(a),.025*math.sin(a),0)))
    growth('Fine_climbing_vine',ps,[.0018,.0026,.0015],mat='Vine',sides=6,ridge=.09)

def preview(name,constructor):
    w.reset();constructor();sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=96;sc.cycles.use_denoising=False;sc.render.threads_mode='FIXED';sc.render.threads=2;sc.render.resolution_x=1000;sc.render.resolution_y=1200;sc.render.resolution_percentage=100;sc.world.color=(.12,.12,.12);sc.view_settings.view_transform='AgX'
    for loc,power,size in [((1.2,-2.5,2.2),330,2.3),((-1.8,-.8,.8),170,2),((.5,2,2),350,2)]:
        ld=bpy.data.lights.new('Review_softbox','AREA');lo=bpy.data.objects.new('Review_softbox',ld);bpy.context.collection.objects.link(lo);lo.location=loc;ld.energy=power;ld.size=size;lo.rotation_euler=(Vector((0,0,.15))-lo.location).to_track_quat('-Z','Y').to_euler()
    ca=bpy.data.cameras.new('Review_camera');co=bpy.data.objects.new('Review_camera',ca);bpy.context.collection.objects.link(co);sc.camera=co;ca.type='ORTHO'
    for view,target,offset,scale in [('front',(0,0,0),(0,-5,0),2.20),('profile',(0,0,0),(5,0,0),2.20),('hero',(0,0,0),(1.4,-5,.6),2.20),('crown-closeup',(0,0,.72),(.5,-5,.25),.73)]:
        center=Vector(target);co.location=center+Vector(offset);co.rotation_euler=(center-co.location).to_track_quat('-Z','Y').to_euler();ca.ortho_scale=scale;sc.render.filepath=str(OUT/(name+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')))
if __name__=='__main__':
    t.MATS={}
    for m in ['Bark','Husk','Sap','Leaf','Fiber','Vine']:material(m)
    preview('sapseed-staff',staff)
