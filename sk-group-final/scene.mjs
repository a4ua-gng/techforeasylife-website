const slots = [
 ['[data-sector="corporate"]','monogram',null],
 ['[data-sector="tourism"]','relief',null],
 ['[data-sector="energy"]','armillary',null],
 ['[data-sector="commercial"]','electric-carrier',null],
 ['[data-sector="hospitality"]','photo-frames',null]
];
const glbPaths = {}; // e.g. 'electric-carrier': './models/carrier.glb'
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const boot = async () => {
 const T = await import('three');
 const [
  {EffectComposer},{RenderPass},{UnrealBloomPass},{SMAAPass},{OutputPass},
  {RoomEnvironment},{RoundedBoxGeometry}
 ] = await Promise.all(['postprocessing/EffectComposer','postprocessing/RenderPass','postprocessing/UnrealBloomPass','postprocessing/SMAAPass','postprocessing/OutputPass','environments/RoomEnvironment','geometries/RoundedBoxGeometry'].map(n=>import('three/addons/'+n+'.js')));
 const renderer = new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
 renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1;
 renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.setClearColor(0,0);
 const scene=new T.Scene(), camera=new T.PerspectiveCamera(34,1,.1,70);
 const pmrem=new T.PMREMGenerator(renderer), room=new RoomEnvironment();
 const env=pmrem.fromScene(room,.05);scene.environment=env.texture;room.dispose();pmrem.dispose();
 scene.fog=new T.FogExp2(0x151b23,.039);
 const key=new T.DirectionalLight(0xffdfa9,3.0);key.position.set(4,7,5);key.castShadow=true;
 key.shadow.mapSize.set(1024,1024);
 Object.assign(key.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.3,far:20});
 key.shadow.normalBias=.023;key.shadow.bias=-.00015;
 const rim=new T.DirectionalLight(0xc5d9ff,1.9);rim.position.set(-4,2,-5);
 const fill=new T.HemisphereLight(0xf6f3ed,0x2e211a,.52);scene.add(key,rim,fill);
 const ground=new T.Mesh(new T.PlaneGeometry(18,18),new T.ShadowMaterial({opacity:.27}));
 ground.rotation.x=-Math.PI/2; ground.position.y=-.013;ground.receiveShadow=true;scene.add(ground);
 const composer=new EffectComposer(renderer);const renderPass=new RenderPass(scene,camera);
 renderPass.clearAlpha=0;composer.addPass(renderPass);
 const bloom=new UnrealBloomPass(new T.Vector2(1,1),.12,.32,.92);
 // Add light to the rendered colours while keeping the page overlay transparent.
 if(bloom.blendMaterial)Object.assign(bloom.blendMaterial,{blending:T.CustomBlending,blendEquation:T.AddEquation,blendSrc:T.OneFactor,blendDst:T.OneFactor,blendEquationAlpha:T.AddEquation,blendSrcAlpha:T.ZeroFactor,blendDstAlpha:T.OneFactor});
 composer.addPass(bloom);
 composer.addPass(new SMAAPass());composer.addPass(new OutputPass());
 const originalDpr=Math.min(devicePixelRatio||1,2);let dpr=originalDpr;
 const texture=(draw,size=256)=>{const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const tx=new T.CanvasTexture(c);tx.anisotropy=renderer.capabilities.getMaxAnisotropy();return tx;};
 let seed=203; const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
 const brushed=texture((g,s)=>{const d=g.createImageData(s,s);for(let y=0;y<s;y++){const line=rnd()*43;for(let x=0;x<s;x++){const i=(y*s+x)*4,v=112+line+rnd()*45;d.data.set([v,v,v,255],i)}}g.putImageData(d,0,0);for(let i=0;i<48;i++){g.strokeStyle='rgba(225,225,225,.22)';g.beginPath();const x=rnd()*s,y=rnd()*s;g.moveTo(x,y);g.lineTo(x+8+rnd()*55,y+.3);g.stroke();}});
 const rubber=texture((g,s)=>{g.fillStyle='#858585';g.fillRect(0,0,s,s);for(let i=0;i<5300;i++){const v=90+Math.floor(rnd()*90);g.fillStyle='rgb('+v+','+v+','+v+')';g.fillRect(rnd()*s,rnd()*s,1,1);}});
 const physical=(color,more={})=>new T.MeshPhysicalMaterial({color,roughness:.36,metalness:.25,...more});
 const gold=physical(0xd4ac65,{metalness:.85,roughness:.35,roughnessMap:brushed,bumpMap:brushed,bumpScale:.014,clearcoat:.24,clearcoatRoughness:.23});
 const champagne=physical(0xf1d9a6,{metalness:.65,roughness:.28,roughnessMap:brushed});
 const dark=physical(0x171b20,{metalness:.52,roughness:.54,roughnessMap:brushed});
 const silver=physical(0xaeb5bd,{metalness:.84,roughness:.36,roughnessMap:brushed});
 const paint=physical(0xb99150,{metalness:.42,roughness:.28,clearcoat:1,clearcoatRoughness:.19,bumpMap:brushed,bumpScale:.004});
 const leather=physical(0x161519,{metalness:0,roughness:.93,roughnessMap:rubber,bumpMap:rubber,bumpScale:.012});
 const glass=physical(0x71818e,{metalness:0,roughness:.19,transmission:.47,ior:1.46,thickness:.11,clearcoat:.72});
 const paper=physical(0xf6f3ed,{metalness:0,roughness:.81,bumpMap:rubber,bumpScale:.009});
 const lamp=physical(0xffe2a5,{metalness:0,emissive:0xffbf69,emissiveIntensity:1.3,roughness:.19});
 const red=physical(0x942820,{metalness:0,emissive:0xd93316,emissiveIntensity:.57,roughness:.24});
 const mesh=(p,n,g,m,x=0,y=0,z=0)=>{const o=new T.Mesh(g,m);o.name=n;o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;p.add(o);return o;};
 const box=(p,n,w,h,d,m,x=0,y=0,z=0,r=.04)=>mesh(p,n,new RoundedBoxGeometry(w,h,d,2,Math.min(r,w*.24,h*.24,d*.24)),m,x,y,z);
 const tube=(p,n,r,l,m,x,y,z,axis='y',s=24)=>{const o=mesh(p,n,new T.CylinderGeometry(r,r,l,s),m,x,y,z);if(axis==='x')o.rotation.z=Math.PI/2;if(axis==='z')o.rotation.x=Math.PI/2;return o;};
 const beam=(p,n,a,b,r,m)=>{const va=new T.Vector3(...a),vb=new T.Vector3(...b),c=va.clone().lerp(vb,.5);const o=tube(p,n,r,va.distanceTo(vb),m,...c.toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),vb.sub(va).normalize());return o;};
 const extrusion=(p,n,s,depth,m,x,y,z,bevel=.028)=>mesh(p,n,new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,curveSegments:24,steps:1}),m,x,y,z);
 const poly=(p)=>{const s=new T.Shape();p.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;};
 const label=(p,n,text,x,y,z,w=.8,h=.23)=>{const tx=texture((g,s)=>{g.fillStyle='#14191e';g.fillRect(0,0,s,s);g.strokeStyle='#d4ac65';g.lineWidth=5;g.strokeRect(8,8,s-16,s-16);g.textAlign='center';g.textBaseline='middle';g.font='bold 32px sans-serif';g.fillStyle='#f1d9a6';g.fillText(text,s/2,s/2,s-25);});tx.colorSpace=T.SRGBColorSpace;return mesh(p,n,new T.PlaneGeometry(w,h),physical(0xffffff,{map:tx,metalness:0}),x,y,z);};
 const photo=(p,n,url,x,y,z,w,h)=>{const tx=new T.Texture();tx.colorSpace=T.SRGBColorSpace;tx.anisotropy=renderer.capabilities.getMaxAnisotropy();const mat=physical(0xf1d9a6,{metalness:0,roughness:.7});const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024*h/w);const g=c.getContext('2d');const s=Math.min(c.width/im.width,c.height/im.height);g.fillStyle='#151b23';g.fillRect(0,0,c.width,c.height);g.drawImage(im,(c.width-im.width*s)/2,(c.height-im.height*s)/2,im.width*s,im.height*s);tx.image=c;tx.needsUpdate=true;mat.map=tx;mat.color.set(0xffffff);mat.needsUpdate=true;if(reduce.matches){for(const e of entries)if(e.key==='photo-frames')e.phase=null;wake();}};im.src=url;return mesh(p,n,new T.PlaneGeometry(w,h),mat,x,y,z);};
 const assets={family:'assets/guest-interior.webp',event:'assets/axom-wide.webp'};
 const builders={
 monogram(p){
   const s=new T.Shape();s.moveTo(1.02,1.77);s.bezierCurveTo(.65,2.13,-.06,2.13,-.33,1.72);s.bezierCurveTo(-.64,1.25,-.16,1.02,.29,.87);s.bezierCurveTo(.7,.73,.74,.55,.57,.44);s.bezierCurveTo(.33,.25,-.05,.4,-.26,.62);s.lineTo(-.49,.32);s.bezierCurveTo(-.15,-.03,.57,-.12,.94,.25);s.bezierCurveTo(1.31,.64,1.09,1.05,.5,1.24);s.bezierCurveTo(.01,1.39,-.06,1.48,.08,1.62);s.bezierCurveTo(.25,1.79,.63,1.72,.83,1.55);s.closePath();
   const k=poly([[0,0],[.38,0],[.38,.77],[.58,1],[1.16,0],[1.62,0],[.86,1.27],[1.52,2.03],[1.06,2.03],[.38,1.23],[.38,2.03],[0,2.03]]);
   box(p,'Display plinth',3.6,.21,1.62,dark,0,.11,0,.09);
   box(p,'Gold inlay',3.53,.04,1.55,gold,0,.223,0);
   extrusion(p,'Bevelled S',s,.28,gold,-1.16,.32,0,.045);
   extrusion(p,'Bevelled K',k,.28,gold,.13,.32,0,.045);
   for(const x of [-1.51,1.51])for(const z of [-.56,.56])tube(p,'Recessed hex bolt',.055,.035,silver,x,.25,z,'y',6);
   label(p,'Plinth nameplate','SK GROUP',0,.115,.82,1.02,.15);
 },
 relief(p){
   const pts=[[-1.62,-.34],[-1.36,-.72],[-.72,-.68],[-.24,-.35],[.25,-.24],[.78,.25],[1.51,.31],[1.57,.61],[1.02,.78],[.42,.47],[-.11,.19],[-.61,.13],[-1.03,-.05]];
   box(p,'Relief backing',3.63,.17,1.98,dark,0,.085,0);
   for(let i=0;i<9;i++){const s=poly(pts.map(([x,y],j)=>[x*(1-i*.035),y*(1-i*.06)+Math.sin(j*4+i)*i*.012]));const o=extrusion(p,'Contour tier '+(i+1),s,.047,i%3===0?champagne:gold,0,.19+i*.049,0,.013);o.rotation.x=-Math.PI/2;}
   const river=[[-1.37,.45,.24],[-.82,.53,.32],[-.37,.62,.08],[.04,.64,-.12],[.52,.59,-.28],[.92,.53,-.47],[1.33,.45,-.44]];
   for(let i=1;i<river.length;i++)beam(p,'River inlay',river[i-1],river[i],.023,silver);
   label(p,'Relief plaque','ASSAM',0,.09,1,.75,.11);
 },
 armillary(p){
   box(p,'Instrument base',2.3,.2,1.5,dark,0,.1,0);
   tube(p,'Bevelled collar',.47,.16,gold,0,.26,0);tube(p,'Central pedestal',.13,.58,silver,0,.58,0);
   const rotor=new T.Group();rotor.name='Armillary rotor';rotor.position.y=1.78;p.add(rotor);
   for(let j=0;j<3;j++){const r=1.08-j*.15;const ring=mesh(rotor,'Brushed orbital ring '+j,new T.TorusGeometry(r,.051,12,80),j===1?silver:gold);ring.rotation.set(j*.8,.35+j*.8,0);
   const ticks=new T.Group();ticks.quaternion.copy(ring.quaternion);rotor.add(ticks);
   for(let i=0;i<24;i++){const a=i*Math.PI/12;const t=box(ticks,'Engraved graduation',i%6===0?.081:.045,.012,.016,champagne,r*Math.cos(a),r*Math.sin(a),.047,.003);t.rotation.z=a;}
   }
   mesh(rotor,'Faceted luminous core',new T.IcosahedronGeometry(.34,1),lamp);
   for(const side of [-1,1])beam(p,'Support strut',[side*.59,.21,0],[side*.93,1.75,0],.039,dark);
   p.userData.update=t=>{rotor.rotation.y=t*.24;rotor.rotation.z=.09*Math.sin(t*.7);};
 },
 'electric-carrier'(p){
   const wheels=[];
   for(const [x,z] of [[1.07,0],[-1.02,.64],[-1.02,-.64]]){
     const w=new T.Group();w.name='Wheel assembly';w.position.set(x,.34,z);p.add(w);wheels.push(w);
     tube(w,'Textured rubber tyre',.34,.21,leather,0,0,0,'z',36);
     tube(w,'Machined rim',.218,.232,silver,0,0,0,'z',32);tube(w,'Inset hub',.139,.25,dark,0,0,0,'z');
     tube(w,'Axle cap',.065,.282,gold,0,0,0,'z',12);
     for(const sign of [-1,1])for(let i=0;i<5;i++){const a=i*2*Math.PI/5;tube(w,'Wheel lug',.021,.023,champagne,.107*Math.cos(a),.107*Math.sin(a),sign*.132,'z',6);}
     const inst=new T.InstancedMesh(new RoundedBoxGeometry(.077,.033,.075,1,.008),leather,44);inst.name='Chevron tread blocks';const dummy=new T.Object3D();
     for(let i=0;i<44;i++){const a=Math.floor(i/2)*Math.PI/11+(i%2)*.08;dummy.position.set(.337*Math.cos(a),.337*Math.sin(a),i%2?.056:-.056);dummy.rotation.set(0,(i%2?.27:-.27),a-Math.PI/2);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);}
     inst.castShadow=true;w.add(inst);
   }
   box(p,'Structural chassis',2.55,.17,1.21,dark,-.03,.56,0);
   box(p,'Battery pack',.8,.22,.78,dark,-.12,.45,0);
   for(let i=0;i<7;i++)box(p,'Battery cooling fin',.047,.13,.8,silver,-.46+i*.108,.45,0,.008);
   box(p,'Cargo platform',1.38,.16,1.36,paint,-.65,.76,0);
   box(p,'Cargo bed liner',1.28,.047,1.22,leather,-.66,.861,0);
   for(const z of [-.667,.667]){
    box(p,'Cargo side panel',1.32,.35,.078,paint,-.65,1.02,z);
    for(let i=0;i<5;i++)box(p,'Panel rib',.043,.28,.027,gold,-1.13+i*.24,1.03,z*1.065,.009);
    box(p,'Lower cab door',.92,.39,.1,paint,.63,1.02,z*.77);
    box(p,'Door seam',.025,.34,.017,dark,.24,1.02,z*.86,.004);
    box(p,'Cab handle',.19,.05,.047,silver,.37,1.13,z*.9,.014);
    beam(p,'Rear canopy pillar',[.22,1.1,z*.77],[.22,1.88,z*.77],.034,dark);
    beam(p,'Raked A pillar',[1.25,1.08,z*.77],[.96,1.88,z*.77],.033,dark);
    beam(p,'Mirror arm',[1.03,1.58,z*.72],[1.03,1.66,z*1.11],.023,silver);
    box(p,'Mirror pod',.1,.19,.19,dark,1.03,1.7,z*1.14);
    box(p,'Rear light',.058,.13,.19,red,-1.36,.77,z*.76);
   }
   box(p,'Rear tailgate',.085,.33,1.28,paint,-1.34,1.01,0);
   box(p,'Front fascia',.45,.49,1.05,paint,1.11,1.06,0,.13);
   box(p,'Front bumper',.18,.13,1.12,dark,1.37,.78,0);
   box(p,'Cab roof',1.01,.135,1.17,paint,.59,1.91,0,.057);
   const wind=box(p,'Laminated windscreen',.043,.66,1.01,glass,1.1,1.52,0,.03);wind.rotation.z=.35;
   beam(p,'Windscreen wiper',[1.22,1.27,-.24],[1.12,1.55,.22],.015,dark);
   box(p,'Driver seat cushion',.44,.14,.62,leather,.55,1.08,0);
   box(p,'Driver seat back',.13,.44,.62,leather,.36,1.29,0);
   for(const z of [-.32,.32])box(p,'LED headlamp',.061,.123,.23,lamp,1.355,1.17,z,.031);
   for(let i=0;i<4;i++)box(p,'Cooling grille slat',.028,.026,.47,dark,1.351,1.06-i*.043,0,.006);
   const plaque=label(p,'Concept plate','EV CONCEPT',1.38,.82,0,.48,.092);plaque.rotation.y=Math.PI/2;
   p.userData.update=(t,u)=>{for(const w of wheels)w.rotation.z=-u*4.2;};
 },
 'photo-frames'(p){
   box(p,'Gallery base',3.33,.15,1.59,dark,0,.075,0);
   const panels=[[-.62,1.01,-.17,-.31],[.6,.95,.22,.24]];
   panels.forEach(([x,y,z,angle],i)=>{
    const f=new T.Group();f.name='Mounted photo frame '+(i+1);f.position.set(x,y,z);f.rotation.y=angle;p.add(f);
    box(f,'Bevelled aluminium frame',1.57,1.63,.11,i?gold:silver,0,0,0,.048);
    box(f,'Recessed photo mat',1.45,1.5,.043,paper,0,0,.062);
    photo(f,'Handover graphic on photo plane',i?assets.family:assets.event,0,.005,.09,1.39,1.43);
    for(const a of [-1,1])for(const b of [-1,1])tube(f,'Corner fastener',.02,.018,dark,a*.744,b*.771,.074,'z',8);
   });
 },
 envelope(p){
   box(p,'Mail stand',2.45,.15,.94,dark,0,.075,0);
   box(p,'Envelope shell',2.22,1.24,.2,gold,0,.84,0,.08);
   extrusion(p,'Left fold',poly([[-1.04,.55],[-1.04,-.52],[.11,-.06]]),.017,champagne,0,.84,.103,.013);
   extrusion(p,'Right fold',poly([[1.04,.55],[1.04,-.52],[-.11,-.06]]),.017,champagne,0,.84,.104,.013);
   extrusion(p,'Top folded flap',poly([[-1.05,.56],[1.05,.56],[0,-.17]]),.025,gold,0,.84,.147,.013);
   tube(p,'Metal seal',.19,.051,dark,0,.68,.207,'z');
   tube(p,'Stamped seal ring',.145,.052,gold,0,.68,.221,'z');
   label(p,'Seal monogram','SK',0,.68,.252,.17,.093);
 }
 };
 const shade=texture((g,s)=>{const r=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);r.addColorStop(0,'rgba(0,0,0,.46)');r.addColorStop(.48,'rgba(0,0,0,.21)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,s,s);},128);
 const contact=new T.Mesh(new T.PlaneGeometry(4.1,3.35),new T.MeshBasicMaterial({map:shade,transparent:true,depthWrite:false}));
 contact.name='Soft contact shadow';contact.rotation.x=-Math.PI/2;contact.position.y=.001;scene.add(contact);
 const dustPos=new Float32Array(2700*3);for(let i=0;i<dustPos.length;i+=3){dustPos[i]=(rnd()-.5)*19;dustPos[i+1]=rnd()*9;dustPos[i+2]=(rnd()-.5)*24;}
 const dustGeo=new T.BufferGeometry();dustGeo.setAttribute('position',new T.BufferAttribute(dustPos,3));
 const dust=new T.Points(dustGeo,new T.PointsMaterial({color:0xd4ac65,size:.015,opacity:.37,transparent:true,depthWrite:false,fog:true}));
 scene.add(dust);
 const entries=slots.flatMap(([selector,key,style])=>{const host=document.querySelector(selector);if(!host)return [];
   const slot=document.createElement('div');slot.className='sk3-slot sk3-'+(style||'hero');slot.setAttribute('aria-hidden','true');
   const canvas=document.createElement('canvas');canvas.className='sk3-surface';slot.append(canvas);host.append(slot);
   host.classList.add('sk3-anchor');
   if(key==='monogram')host.classList.add('sk3-loading');
   return [{host,slot,canvas,ctx:canvas.getContext('2d',{alpha:true}),key,visible:false,root:null,phase:null,turn:0}];
 });
 const tracked=new Set();
 let stopped=false,frame=0,last=0,slow=0,rateFrames=0,dim='';
 const loaderCleanups=[];
 async function maybeGLB(e){const path=glbPaths[e.key];if(!path)return;
   let draco;
   try{
    const parsed=new URL(path,location.href);
    if(!['http:','https:','file:'].includes(parsed.protocol))throw Error('Unsupported GLB URL');
    const [{GLTFLoader},{DRACOLoader},{MeshoptDecoder}]=await Promise.all(['loaders/GLTFLoader','loaders/DRACOLoader','libs/meshopt_decoder.module'].map(n=>import('three/addons/'+n+'.js')));
    if(stopped)return;
    draco=new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
    loaderCleanups.push(draco);
    const manager=new T.LoadingManager();
    const loader=new GLTFLoader(manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
    // Bundled GLB only: reject sibling network resources.
    manager.setURLModifier(u=>{if(/^(blob:|data:)/i.test(u)||new URL(u,location.href).href===parsed.href)return u;throw Error('External GLB resource rejected');});
    const {scene:model}=await loader.loadAsync(parsed.href);
    if(stopped){release(model,new Set());return;}
    const b=new T.Box3().setFromObject(model), size=b.getSize(new T.Vector3()), center=b.getCenter(new T.Vector3());const scale=3.35/Math.max(size.x,size.y,size.z);
    if(!Number.isFinite(scale)||scale<=0){release(model,new Set());throw Error('Empty GLB');}
    model.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;for(const m of [].concat(o.material))for(const v of Object.values(m))if(v?.isTexture){v.anisotropy=renderer.capabilities.getMaxAnisotropy();v.needsUpdate=true;}}});
    model.scale.multiplyScalar(scale);model.position.sub(center.multiplyScalar(scale));model.position.y+=size.y*scale/2;
    const root=new T.Group();root.name=e.key+' (GLB)';root.userData.update=()=>{};root.add(model);
    scene.remove(e.root);release(e.root,shared);e.root=root;e.bounds=new T.Box3().setFromObject(root);root.visible=false;scene.add(root);e.phase=null;wake();
   }catch(e){console.info('SK 3D: using procedural fallback',e.message);}finally{draco?.dispose();}
 }
 const shared=new Set([gold,champagne,dark,silver,paint,leather,glass,paper,lamp,red,brushed,rubber]);
 function release(root,keep,disposed=new Set()){const dispose=o=>{if(o&&!keep.has(o)&&!disposed.has(o)){disposed.add(o);o.dispose?.();}};root.traverse(o=>{dispose(o.geometry);for(const m of [].concat(o.material||[])){if(keep.has(m))continue;for(const v of Object.values(m))if(v?.isTexture)dispose(v);dispose(m);}});}
 function build(e){if(e.root)return;const p=new T.Group();p.name=e.key;p.userData.update=()=>{};builders[e.key](p);p.visible=false;scene.add(p);e.root=p;e.bounds=new T.Box3().setFromObject(p);void maybeGLB(e);}
 function draw(e,now,dt){
   build(e);const {width,height,top}=e.slot.getBoundingClientRect();if(width<2||height<2)return;
   const w=Math.round(width),h=Math.round(height);
   // Reuse one render target across slots, including during section transitions.
   const raster=innerWidth<620?440:640; const id=raster+':'+dpr;
   if(id!==dim){renderer.setPixelRatio(dpr);renderer.setSize(raster,raster,false);composer.setPixelRatio(dpr);composer.setSize(raster,raster);dim=id;}
   const target=reduce.matches?.5:T.MathUtils.clamp((innerHeight-top)/(innerHeight+h),0,1);
   e.phase=e.phase===null?target:T.MathUtils.damp(e.phase,target,6.5,dt);
   const a=e.phase;
   e.root.visible=true;e.root.rotation.y=(a-.5)*(e.key==='electric-carrier'?2.2:1.38)+(e.key==='electric-carrier'?.57:-.19);
   const emphasis=1-Math.abs(a-.5)*2;
   e.root.scale.setScalar(1+.052*emphasis);
   lamp.emissiveIntensity=1.07+emphasis*.35;
   e.root.userData.update(reduce.matches?0:now/1000,a);e.root.updateMatrixWorld(true);
   const bounds=e.bounds.clone().applyMatrix4(e.root.matrixWorld);const s=bounds.getSize(new T.Vector3());const center=bounds.getCenter(new T.Vector3());
   camera.aspect=w/h;camera.updateProjectionMatrix();
   const fit=Math.max(s.y,s.x/camera.aspect)*1.18;
   const distance=fit/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))+s.z*.44;
   camera.position.set((a-.5)*.55,center.y+distance*.31,distance);camera.lookAt(0,center.y*.92,0);
   dust.rotation.y=reduce.matches?0:now*.000021;
  
   composer.render(dt);e.root.visible=false;
   const source=renderer.domElement;
   const outW=Math.round(w*dpr),outH=Math.round(h*dpr);
   if(e.canvas.width!==outW||e.canvas.height!==outH){e.canvas.width=outW;e.canvas.height=outH;}
   e.ctx.clearRect(0,0,e.canvas.width,e.canvas.height);e.ctx.drawImage(source,0,0,outW,outH);
   e.host.classList.remove('sk3-loading');e.host.classList.add('sk3-ready');e.slot.dataset.rendered='true';
 }
 function tick(now){frame=0;if(stopped||document.hidden||!tracked.size)return;const start=performance.now();
   const dt=Math.min(.066,last?(now-last)/1000:1/60);last=now;
   try{for(const e of tracked)if(!reduce.matches||e.phase===null)draw(e,now,dt);}catch(err){console.warn('SK 3D disabled:',err.message);cleanup();return;}
   if(!reduce.matches){rateFrames++;const duration=performance.now()-start;if((dt>.022||duration>22)&&rateFrames>18)slow++;else slow=Math.max(0,slow-1);if(slow>24&&dpr>1.5){dpr=1.5;dim='';}wake();}
 }
 function wake(){if(!frame&&!stopped&&!document.hidden&&tracked.size)frame=requestAnimationFrame(tick);}
 const observer=new IntersectionObserver(items=>{for(const v of items){const e=entries.find(x=>x.slot===v.target);if(!e)continue;if(v.isIntersecting){tracked.add(e);e.phase=null;}else tracked.delete(e);}if(!tracked.size){cancelAnimationFrame(frame);frame=0;last=0;}wake();});
 const resize=new ResizeObserver(items=>{for(const {target} of items){const e=entries.find(x=>x.slot===target);if(e)e.phase=null;}wake();});
 const reset=()=>{for(const e of entries)e.phase=null;last=0;wake();};
 const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;last=0;}else reset();};
 function cleanup(){if(stopped)return;stopped=true;observer.disconnect();resize.disconnect();cancelAnimationFrame(frame);
   reduce.removeEventListener('change',reset);document.removeEventListener('visibilitychange',visibility);
   for(const e of entries){e.slot.remove();e.host.classList.remove('sk3-ready','sk3-anchor','sk3-loading');}
   const disposed=new Set();release(scene,new Set(),disposed);for(const item of shared){if(!disposed.has(item))item.dispose();}
   env.dispose();for(const p of composer.passes)p.dispose?.();composer.dispose();renderer.dispose();for(const d of loaderCleanups)d.dispose();
 }
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cleanup();});
 for(const e of entries){observer.observe(e.slot);resize.observe(e.slot);}
 reduce.addEventListener('change',reset);document.addEventListener('visibilitychange',visibility);
 addEventListener('pagehide',e=>{if(!e.persisted)cleanup();},{once:true});
 return cleanup;
};
export default boot;
