/* SK GROUP X · Interactive Three.js concept collection
   Three.js r160.1 only. Optional GLB slots: <html data-skx-glb-home="media/file.glb" ...>.
   These are illustrative CGI concepts, NOT the actual products sold by our dealers.
   The complete marketing text, photographs and regular enquiry interactions are untouched. */
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

const VERSION='0.160.1';
const CDN='https://cdn.jsdelivr.net/npm/three@'+VERSION+'/examples/jsm/libs/draco/';
const isLowMotion=matchMedia('(prefers-reduced-motion: reduce)');
const isNarrow=matchMedia('(max-width: 760px)');
const GOLD=0xd9b475,DARK=0x1d1b18,IVORY=0xf5eee0,STEEL=0x75746f,AMBER=0xffce91;
const entries=[
 {id:'home',title:'The SK Group orbit',subtitle:'One vision · many possibilities',model:'orbit',glb:'skxGlbHome'},
 {id:'verticals',title:'Two-wheeler concept',subtitle:'A stylized mobility study',model:'bike',glb:'skxGlbMobility'},
 {id:'businesses',title:'Electric mobility concept',subtitle:'Illustrative 3D vehicle, not an actual Montra model',model:'ev',glb:'skxGlbElectric'},
 {id:'auto-owners',title:'Electric drivetrain concept',subtitle:'Energy in motion',model:'energy',glb:'skxGlbEnergy'},
 {id:'story',title:'Hospitality pavilion',subtitle:'An architectural concept, not an actual property',model:'hotel',glb:'skxGlbHospitality'},
 {id:'contact',title:'Jewellery study',subtitle:'Illustrative craftsmanship concept',model:'jewel',glb:'skxGlbJewellery'}
];
let renderer,scene,camera,composer,envRT,pmrem,clock,canvas,stage,dock,modelName,modelNote,loaderText;
let current=0,selected=0,opened=false,initialized=false,raf=0,drawn=0,lastTime=0,slowFrames=0,pixelRatio=1,modelRoot=null,particles=null,mouseX=0,mouseY=0;
let glbLoader=null,draco=null;
const cache=new Map(),generatedTextures=new Set(),tempV=new THREE.Vector3();
const scaleTarget=new THREE.Vector3(1,1,1);
const onPageHide=()=>destroy();

/* Procedural textures stay entirely local: deterministic brushed metal, roughness and micro-scratches. */
function makeTexture(kind='brushed'){
 const c=document.createElement('canvas');c.width=256;c.height=256;
 const ctx=c.getContext('2d',{willReadFrequently:false});
 ctx.fillStyle=kind==='metal'?'#b9b9b9':'#989898';ctx.fillRect(0,0,256,256);
 let seed=kind==='brushed'?91:319;
 const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
 for(let i=0;i<3300;i++){
  const x=random()*256,y=random()*256,v=Math.round(20+random()*80);
  ctx.strokeStyle='rgba('+v+','+v+','+v+','+(kind==='brushed'?.075:.085)+')';
  ctx.lineWidth=.2+random()*.45;ctx.beginPath();ctx.moveTo(x,y);
  ctx.lineTo(x+(kind==='brushed'?18+random()*110:random()*4),y+(kind==='brushed'?(random()-.5)*1.5:random()*4));ctx.stroke();
 }
 const texture=new THREE.CanvasTexture(c);
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2.5,2.5);
 texture.anisotropy=renderer?.capabilities.getMaxAnisotropy()||8;
 texture.colorSpace=THREE.NoColorSpace;
 generatedTextures.add(texture);
 return texture;
}
let roughnessTex=null,metalTexture=null;
function mats(){
 if(!roughnessTex)roughnessTex=makeTexture('brushed');
 if(!metalTexture)metalTexture=makeTexture('metal');
 const surface=(color,metalness,roughness,other={})=>new THREE.MeshPhysicalMaterial({
  color,metalness,roughness,roughnessMap:roughnessTex,clearcoat:.43,clearcoatRoughness:.24,
  ...other
 });
 return{
  paint:surface(0xddd3bf,.45,.24,{clearcoat:.87,clearcoatRoughness:.09}),
  black:surface(0x1b1c1d,.24,.58),
  dark:surface(DARK,.55,.39),
  steel:surface(STEEL,.83,.25),
  gold:surface(GOLD,.92,.22,{clearcoat:.78,clearcoatRoughness:.12}),
  ivory:surface(IVORY,.29,.32),
  orange:surface(AMBER,.34,.28,{clearcoat:.83}),
  rubber:surface(0x171716,.02,.86,{clearcoat:0,roughnessMap:metalTexture}),
  glass:surface(0xc6cbd0,.05,.13,{transmission:.62,ior:1.47,thickness:.2,transparent:true,opacity:.92}),
  bright:new THREE.MeshPhysicalMaterial({color:0xffe8b0,emissive:0xffd78f,emissiveIntensity:.92,metalness:.2,roughness:.24}),
  gem:new THREE.MeshPhysicalMaterial({color:0xc7dded,metalness:0,roughness:.055,transmission:.83,ior:2.15,thickness:.95,clearcoat:1,clearcoatRoughness:.04})
 };
}
function add(group,geo,material,name,xyz=[0,0,0],rot=[0,0,0]){
 const m=new THREE.Mesh(geo,material);m.name=name;m.position.set(...xyz);m.rotation.set(...rot);
 m.castShadow=true;m.receiveShadow=true;group.add(m);return m;
}
function box(g,name,size,pos,mat,radius=.07){
 return add(g,new RoundedBoxGeometry(...size,3,Math.min(radius,...size.map(v=>v*.35))),mat,name,pos);
}
function rod(g,name,a,b,radius,mat){
 const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),d=new THREE.Vector3().subVectors(to,from);
 const m=add(g,new THREE.CylinderGeometry(radius,radius,d.length(),12),mat,name);
 m.position.copy(from.add(to).multiplyScalar(.5));
 m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
 return m;
}
function disc(g,name,radius,thickness,pos,mat,axis='z'){
 const m=add(g,new THREE.CylinderGeometry(radius,radius,thickness,40,1),mat,name,pos);
 m.rotation[axis==='z'?'x':'z']=Math.PI/2;return m;
}
function screw(g,name,pos,mat){
 return add(g,new THREE.SphereGeometry(.046,8,6),mat,name,pos);
}
function wheel(g,name,pos,m,along='z',radius=.52){
 const root=new THREE.Group();root.name=name;root.position.set(...pos);g.add(root);
 const tyre=add(root,new THREE.TorusGeometry(radius,.13,10,36),m.rubber,'treaded-tyre');
 if(along==='x')root.rotation.y=Math.PI/2;
 disc(root,'machined-alloy-wheel',radius*.74,.09,[0,0,0],m.steel,'z');
 disc(root,'golden-hubcap',radius*.21,.16,[0,0,.065],m.gold,'z');
 for(let i=0;i<12;i++){
  const a=i*Math.PI/6;
  const lug=box(root,'rubber-tread-'+(i+1),[.16,.07,.15],[Math.cos(a)*(radius+.095),Math.sin(a)*(radius+.095),0],m.rubber,.027);
  lug.rotation.z=a+Math.PI/2;
 }
 for(let i=0;i<5;i++){
  const a=i*2*Math.PI/5;
  rod(root,'wheel-spoke-'+i,[0,0,.085],[Math.cos(a)*radius*.52,Math.sin(a)*radius*.52,.085],.034,m.steel);
 }
 root.userData.spin=(t)=>{root.rotation.z=t;};return root;
}
function makeRoot(name){
 const group=new THREE.Group();group.name=name;group.userData.parts=[];group.userData.update=()=>{};return group;
}
function makeOrbit(m){
 const g=makeRoot('skx-corporate-orbit');
 const core=new THREE.Group();core.name='faceted-central-monogram';g.add(core);
 box(core,'polished-gold-vertical',[.34,2.05,.32],[-.45,.75,0],m.gold,.08);
 box(core,'warm-ivory-horizontal',[1.35,.35,.32],[.05,1.6,0],m.ivory,.08);
 box(core,'sculpted-crossbar',[1.35,.31,.3],[.05,.89,0],m.gold,.07);
 const hoops=[];
 for(let i=0;i<3;i++){
  const hoop=add(g,new THREE.TorusGeometry(2.15+i*.16,.022,10,110),i===1?m.ivory:m.gold,'independent-orbital-ring-'+i,[0,.98,0]);
  hoop.rotation.x=.66+i*.4;hoop.rotation.z=.1+i*.6;hoops.push(hoop);
 }
 for(let i=0;i<9;i++){
  const a=i*Math.PI*2/9;
  add(g,new THREE.SphereGeometry(.07+(i%3)*.026,12,10),i%4===0?m.bright:m.gold,
    'enterprise-node-'+i,[Math.cos(a)*2.02,1+Math.sin(a)*.84,Math.sin(a*1.8)*.34]);
 }
 box(g,'machined-base-plate',[3.4,.12,1.18],[0,-.32,0],m.black);
 for(let i=0;i<6;i++)screw(g,'countersunk-base-fastener-'+i,[-1.5+i*.6,-.24,.45],m.gold);
 g.userData.update=(t)=>{hoops.forEach((x,i)=>{x.rotation.z=.1+i*.6+t*(i%2?.06:-.04);});core.rotation.y=Math.sin(t*.33)*.1};
 return g;
}
function makeBike(m){
 const g=makeRoot('two-wheeler-mobility-study'),w=[];
 w.push(wheel(g,'rear-treaded-wheel',[-1.13,.56,0],m));
 w.push(wheel(g,'front-treaded-wheel',[1.27,.56,0],m));
 rod(g,'triangulated-frame-lower',[-1.03,.72,0],[.2,1.26,0],.082,m.gold);
 rod(g,'triangulated-frame-top',[.2,1.26,0],[1.05,.78,0],.07,m.steel);
 rod(g,'frame-rear-support',[-1.03,.72,0],[.2,1.26,0],.052,m.dark);
 rod(g,'swing-arm',[-.95,.62,0],[.38,.77,0],.077,m.steel);
 rod(g,'front-fork-left',[1.20,.7,-.17],[.87,1.82,-.17],.065,m.steel);
 rod(g,'front-fork-right',[1.20,.7,.17],[.87,1.82,.17],.065,m.steel);
 box(g,'sculpted-fuel-tank',[1.0,.48,.65],[-.12,1.38,0],m.paint,.22);
 box(g,'stitched-riding-seat',[.94,.17,.62],[-.85,1.49,0],m.black,.09);
 box(g,'motor-case',[.6,.52,.58],[-.08,.9,0],m.dark,.17);
 disc(g,'engine-machined-cover',.23,.1,[-.08,.9,.35],m.gold,'z');
 rod(g,'exhaust-polished',[-.57,.70,-.32],[.85,.71,-.32],.063,m.steel);
 rod(g,'handlebar-steering',[.80,1.84,-.48],[.80,1.84,.48],.055,m.black);
 add(g,new THREE.SphereGeometry(.15,20,12),m.bright,'headlight-with-lens',[1.03,1.55,0]);
 for(let i=0;i<8;i++)screw(g,'side-panel-rivet-'+i,[-.42+i*.095,1.13,.33],m.gold);
 g.userData.update=(t)=>{for(const x of w)x.children.forEach(c=>{if(c.name.startsWith('rubber-tread'))c.rotation.z+=.0012});g.rotation.y=Math.sin(t*.45)*.055};
 return g;
}
function makeEV(m){
 const g=makeRoot('generic-electric-three-wheeler-study');
 box(g,'battery-skateboard',[2.85,.26,1.65],[0,.56,0],m.dark,.15);
 box(g,'cargo-and-passenger-cabin',[1.35,1.37,1.55],[-.64,1.42,0],m.paint,.22);
 box(g,'curved-windscreen-frame',[.12,1.06,1.35],[.18,1.57,0],m.gold,.04);
 box(g,'transparent-windscreen',[.045,.85,1.13],[.27,1.57,0],m.glass,.02);
 box(g,'front-fender',[.65,.23,.78],[1.02,.76,0],m.gold,.15);
 box(g,'passenger-seat',[.63,.22,.9],[-.78,1.04,0],m.black,.13);
 box(g,'curved-front-fairing',[.83,.66,1.4],[.93,1.16,0],m.paint,.24);
 box(g,'roof-canopy',[1.55,.16,1.74],[-.62,2.3,0],m.dark,.14);
 for(const z of [-.71,.71]){
  rod(g,'cabin-A-pillar-'+z,[.02,.88,z],[.02,2.25,z],.045,m.gold);
  rod(g,'cabin-rear-pillar-'+z,[-1.24,.91,z],[-1.24,2.21,z],.051,m.steel);
 }
 const wheels=[
  wheel(g,'rear-left-tyre',[-.94,.49,-.89],m,'x',.36),
  wheel(g,'rear-right-tyre',[-.94,.49,.89],m,'x',.36),
  wheel(g,'single-steering-wheel',[1.06,.48,0],m,'x',.38)
 ];
 for(const z of [-.53,.53])add(g,new THREE.SphereGeometry(.11,12,12),m.bright,'LED-headlamp-'+z,[1.38,1.08,z]);
 for(let j=0;j<6;j++)box(g,'lower-body-rib-'+j,[.08,.10,1.42],[-1.1+j*.32,.58,0],j%2?m.steel:m.dark,.02);
 for(const z of [-.75,.75])for(let i=0;i<4;i++)screw(g,'body-fastener-'+z+'-'+i,[.1-i*.27,.85,z],m.gold);
 g.userData.update=(t)=>{g.rotation.y=Math.sin(t*.27)*.047;wheels.forEach((x,i)=>{x.userData.angle=t*(i===2?-.03:.03)})};
 return g;
}
function makeEnergy(m){
 const g=makeRoot('electric-drivetrain-and-power-motor');
 box(g,'machined-motor-sled',[3.2,.24,1.3],[0,.24,0],m.dark,.14);
 const motor=add(g,new THREE.CylinderGeometry(.8,.8,1.8,42),m.gold,'brushed-aluminium-stator',[0,1.2,0],[0,0,Math.PI/2]);
 const rotor=new THREE.Group();rotor.name='rotating-armature';rotor.position.set(0,1.2,0);g.add(rotor);
 disc(rotor,'copper-finish-hub',.43,.15,[0,0,.6],m.orange,'z');
 for(let i=0;i<12;i++){
  const a=i*Math.PI/6;
  box(rotor,'rotor-fan-blade-'+i,[.75,.09,.24],[Math.cos(a)*.57,Math.sin(a)*.57,.87],m.steel,.02).rotation.z=a;
 }
 for(let i=0;i<11;i++)box(g,'cooling-fin-'+i,[.058,1.62,1.66],[-.85+i*.17,1.2,0],m.dark,.015);
 for(const z of [-.54,.54])rod(g,'busbar-copper-'+z,[.48,1.6,z],[1.49,.96,z],.059,m.orange);
 box(g,'power-controller',[.67,.32,1],[1.22,.68,0],m.black,.1);
 for(let i=0;i<4;i++)screw(g,'terminal-fastener-'+i,[1.05+i*.12,.85,.35],m.gold);
 const led=box(g,'emissive-power-indicator',[.34,.06,.08],[1.21,.86,-.43],m.bright,.02);
 g.userData.update=t=>{rotor.rotation.z=t*.58;led.material.emissiveIntensity=.62+.32*(Math.sin(t*2.2)+1)*.5};
 return g;
}
function makeHotel(m){
 const g=makeRoot('hospitality-pavilion-concept');
 box(g,'stone-plinth',[3.9,.27,2.7],[0,.2,0],m.ivory,.1);
 box(g,'raised-ground-floor',[3.45,.19,2.37],[0,.51,0],m.gold,.06);
 for(const x of [-1.42,1.42])for(const z of [-.98,.98]){
  box(g,'vertical-column-'+x+'-'+z,[.18,2.2,.18],[x,1.7,z],m.ivory,.045);
  screw(g,'column-capital-'+x+'-'+z,[x,2.78,z],m.gold);
 }
 box(g,'polished-lintel',[3.7,.26,2.6],[0,2.85,0],m.gold,.08);
 box(g,'cantilevered-roof',[4.15,.23,3.0],[0,3.09,0],m.dark,.13);
 box(g,'glass-entrance',[.9,1.8,.068],[0,1.58,1.02],m.glass,.045);
 for(const x of [-1.0,1.0]){
  box(g,'arched-side-window-'+x,[.51,1.36,.045],[x,1.72,1.05],m.glass,.07);
  box(g,'brass-window-sill-'+x,[.66,.075,.12],[x,1.04,1.11],m.gold,.02);
 }
 for(let i=0;i<3;i++)box(g,'travertine-entrance-step-'+i,[1.45,.13,.41],[0,.07+i*.075,1.25+i*.2],m.ivory,.035);
 for(let i=0;i<10;i++)add(g,new THREE.SphereGeometry(.052,8,8),m.bright,'architectural-accent-light-'+i,[-1.45+i*.32,2.77,1.08]);
 g.userData.update=t=>{g.rotation.y=Math.sin(t*.15)*.05};
 return g;
}
function makeJewel(m){
 const g=makeRoot('fine-jewellery-setting');
 const band=add(g,new THREE.TorusGeometry(1.02,.18,18,90),m.gold,'hammered-gold-ring-band',[0,1.16,0],[Math.PI*.16,0,.11]);
 const collet=add(g,new THREE.CylinderGeometry(.48,.38,.32,8),m.steel,'faceted-stone-setting',[0,2.27,0]);
 const stone=add(g,new THREE.IcosahedronGeometry(.49,2),m.gem,'refractive-brilliant-cut-stone',[0,2.63,0]);
 for(let i=0;i<6;i++){
  const a=i*Math.PI*2/6;
  rod(g,'stone-prong-'+i,[Math.cos(a)*.4,2.22,Math.sin(a)*.4],[Math.cos(a)*.29,2.73,Math.sin(a)*.29],.039,m.gold);
 }
 for(let j=0;j<17;j++){
  const a=j*Math.PI*2/17;
  add(g,new THREE.SphereGeometry(.043,7,6),m.ivory,'micro-set-diamond-'+j,[Math.cos(a)*1.06,1.17+Math.sin(a)*1.06,.12]);
 }
 box(g,'museum-display-pedestal',[2.65,.27,2.4],[0,.02,0],m.black,.15);
 box(g,'bevelled-gilt-pedestal-top',[2.4,.08,2.16],[0,.22,0],m.gold,.07);
 g.userData.update=t=>{band.rotation.y=t*.13;stone.rotation.y=t*.21;collet.rotation.y=t*.11};
 return g;
}
const builders={orbit:makeOrbit,bike:makeBike,ev:makeEV,energy:makeEnergy,hotel:makeHotel,jewel:makeJewel};
function decorateStage(){
 dock=document.createElement('aside');
 dock.id='skx3d-dock';dock.className='skx3d-dock';dock.hidden=true;
 dock.setAttribute('aria-label','Interactive 3D models of SK Group business sectors');
 dock.innerHTML='<div class="skx3d-bar"><span class="skx3d-kicker">✧ INTERACTIVE 3D</span><button class="skx3d-close" type="button" aria-label="Close 3D preview">×</button></div>'
 +'<div class="skx3d-screen"><span class="skx3d-loading" role="status">Preparing 3D preview…</span><span class="skx3d-watermark">CONCEPT · NOT A REAL PRODUCT PHOTO</span></div>'
 +'<div class="skx3d-captions"><strong class="skx3d-model-name">Group orbit</strong><p class="skx3d-model-note">Scroll through the group’s stories</p></div>'
 +'<div class="skx3d-actions"><button type="button" class="skx3d-prev" aria-label="Previous business model">←</button><span class="skx3d-counter">01 / 06</span><button type="button" class="skx3d-next" aria-label="Next business model">→</button></div>';
 const toggle=document.createElement('button');toggle.type='button';toggle.className='skx3d-open';
 toggle.setAttribute('aria-label','Open interactive 3D concepts');toggle.setAttribute('aria-controls','skx3d-dock');
 toggle.setAttribute('aria-expanded','false');toggle.innerHTML='<span aria-hidden="true">◈</span><strong>Explore in 3D</strong>';
 document.body.append(toggle,dock);
 stage=dock.querySelector('.skx3d-screen');
 loaderText=dock.querySelector('.skx3d-loading');
 modelName=dock.querySelector('.skx3d-model-name');modelNote=dock.querySelector('.skx3d-model-note');
 dock.querySelector('.skx3d-close').addEventListener('click',()=>setOpen(false));
 toggle.addEventListener('click',()=>setOpen(!opened));
 dock.querySelector('.skx3d-prev').addEventListener('click',()=>setScene((selected+entries.length-1)%entries.length,true));
 dock.querySelector('.skx3d-next').addEventListener('click',()=>setScene((selected+1)%entries.length,true));
 dock.addEventListener('pointermove',e=>{
  if(!opened||isLowMotion.matches)return;
  const rect=stage.getBoundingClientRect();mouseX=(e.clientX-rect.left)/rect.width-.5;mouseY=(e.clientY-rect.top)/rect.height-.5;
 },{passive:true});
 dock.addEventListener('pointerleave',()=>{mouseX=0;mouseY=0},{passive:true});
 window.addEventListener('scroll',()=>{if(opened)syncScrollScene();},{passive:true});
 window.addEventListener('resize',()=>{if(initialized)resize();},{passive:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&opened)start();else stop();});
 window.addEventListener('pagehide',onPageHide,{once:true});
 return toggle;
}
let toggle;
function createWorld(){
 const w=Math.max(260,stage.clientWidth),h=Math.max(250,stage.clientHeight);
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,depth:true,powerPreference:'high-performance'});
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.0;renderer.shadowMap.enabled=true;
 renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.useLegacyLights=false;
 pixelRatio=Math.min(window.devicePixelRatio||1,2);renderer.setPixelRatio(pixelRatio);renderer.setSize(w,h,false);
 renderer.setClearColor(0x090807,0);
 canvas=renderer.domElement;canvas.className='skx3d-canvas';canvas.setAttribute('aria-hidden','true');stage.prepend(canvas);
 scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x100e0a,.029);
 camera=new THREE.PerspectiveCamera(37,w/h,.1,90);camera.position.set(6.2,4.0,7.8);camera.lookAt(0,1.17,0);
 pmrem=new THREE.PMREMGenerator(renderer);envRT=pmrem.fromScene(new RoomEnvironment(renderer),.05);scene.environment=envRT.texture;
 scene.add(new THREE.AmbientLight(0xffe9c8,.45));
 const key=new THREE.DirectionalLight(0xffe4b0,4.2);key.position.set(-4,8,6);key.castShadow=true;
 key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-8;key.shadow.camera.right=8;
 key.shadow.camera.top=8;key.shadow.camera.bottom=-8;key.shadow.normalBias=.035;key.shadow.bias=-.00022;
 key.shadow.radius=3;scene.add(key);
 const rim=new THREE.DirectionalLight(0xc8d7ec,2.2);rim.position.set(6,4,-6);scene.add(rim);
 const fill=new THREE.DirectionalLight(0xfff3df,1.05);fill.position.set(1,2,5);scene.add(fill);
 const groundMat=new THREE.ShadowMaterial({color:0x060605,opacity:.31});
 const ground=add(scene,new THREE.PlaneGeometry(14,14),groundMat,'shadow-catching-ground',[0,-.35,0],[-Math.PI/2,0,0]);ground.castShadow=false;ground.receiveShadow=true;
 const sh=document.createElement('canvas');sh.width=128;sh.height=128;const ctx=sh.getContext('2d');
 const rad=ctx.createRadialGradient(64,64,4,64,64,64);rad.addColorStop(0,'rgba(0,0,0,.45)');rad.addColorStop(1,'rgba(0,0,0,0)');
 ctx.fillStyle=rad;ctx.fillRect(0,0,128,128);
 const shadowTex=new THREE.CanvasTexture(sh);generatedTextures.add(shadowTex);
 const contact=add(scene,new THREE.PlaneGeometry(5.5,3.8),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false,opacity:.6}),
   'soft-contact-shadow',[0,-.335,0],[-Math.PI/2,0,0]);contact.castShadow=false;
 const amount=isNarrow.matches?280:1600,arr=new Float32Array(amount*3);
 for(let i=0;i<amount;i++){
  arr[i*3]=(Math.random()-.5)*21;arr[i*3+1]=Math.random()*13-1;arr[i*3+2]=(Math.random()-.5)*18;
 }
 const dust=new THREE.BufferGeometry();dust.setAttribute('position',new THREE.BufferAttribute(arr,3));
 particles=new THREE.Points(dust,new THREE.PointsMaterial({color:0xdcc7a1,size:.023,transparent:true,opacity:.25,sizeAttenuation:true,depthWrite:false,fog:true}));
 particles.name='depth-fading-dust-particles';scene.add(particles);
 composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
 composer.addPass(new UnrealBloomPass(new THREE.Vector2(w,h),.17,.34,.88));
 if(!isNarrow.matches)composer.addPass(new SMAAPass(w,h));
 composer.addPass(new OutputPass());
 clock=new THREE.Clock();initialized=true;
 const ro=new ResizeObserver(()=>{if(initialized)resize()});ro.observe(stage);
 window._skx3dResizer=ro;
}
function resize(){
 if(!renderer||!stage)return;
 const w=Math.max(2,stage.clientWidth),h=Math.max(2,stage.clientHeight);
 renderer.setPixelRatio(pixelRatio);renderer.setSize(w,h,false);
 camera.aspect=w/h;camera.updateProjectionMatrix();
 composer?.setSize(w,h);
}
async function optionalGLB(entry){
 let src=document.documentElement.dataset[entry.glb]||'';
 // Accept only a file path relative to this website: no third-party GLB URLs.
 if(!src||/^https?:|^\/\//i.test(src)||src.includes('..'))return null;
 if(!glbLoader){
  glbLoader=new GLTFLoader();draco=new DRACOLoader();draco.setDecoderPath(CDN);
  glbLoader.setDRACOLoader(draco);glbLoader.setMeshoptDecoder(MeshoptDecoder);
 }
 try{
  const result=await glbLoader.loadAsync(src);
  const model=result.scene;model.name='client-supplied-'+entry.model+'-GLB';
  const b=new THREE.Box3().setFromObject(model);const size=b.getSize(new THREE.Vector3()),centre=b.getCenter(new THREE.Vector3());
  const length=Math.max(size.x,size.y,size.z,.01);model.scale.setScalar(3.9/length);
  model.position.copy(centre.multiplyScalar(-3.9/length));model.position.y+=.65;
  model.traverse(x=>{if(x.isMesh){x.castShadow=true;x.receiveShadow=true;
    for(const mat of Array.isArray(x.material)?x.material:[x.material]){
      if(!mat)continue;
      for(const k of ['map','normalMap','roughnessMap','metalnessMap'])if(mat[k])mat[k].anisotropy=renderer.capabilities.getMaxAnisotropy();
    }
  }});
  const g=makeRoot('loaded-'+entry.model);g.add(model);g.userData.update=t=>{g.rotation.y=.15*Math.sin(t*.17)};
  return g;
 }catch(e){console.warn('SKX CGI: local GLB failed, using procedural concept',entry.id,e?.message||e);return null;}
}
async function getModel(index){
 if(cache.has(index))return cache.get(index);
 const entry=entries[index];
 const m=mats();const glb=await optionalGLB(entry);
 const root=glb||builders[entry.model](m);
 root.userData.materials=m;root.userData.procedural=!glb;
 cache.set(index,root);return root;
}
async function setScene(index,manual=false){
 selected=index;const entry=entries[index];
 modelName.textContent=entry.title;modelNote.textContent=entry.subtitle;
 dock.querySelector('.skx3d-counter').textContent=String(index+1).padStart(2,'0')+' / '+String(entries.length).padStart(2,'0');
 if(!initialized)return;
 loaderText.hidden=false;loaderText.textContent='Preparing '+entry.title+'…';
 try{
  const target=await getModel(index);
  if(selected!==index)return;
  if(modelRoot&&modelRoot!==target)scene.remove(modelRoot);
  modelRoot=target;modelRoot.position.set(0,0,0);modelRoot.scale.setScalar(1);
  if(!scene.children.includes(modelRoot))scene.add(modelRoot);
  loaderText.hidden=true;
  if(isLowMotion.matches)renderStill();
  if(manual)scrollToSection(entry.id);
 }catch(e){loaderText.textContent='3D preview unavailable';console.warn(e);}
}
function scrollToSection(id){
 const section=document.getElementById(id);
 // Deliberately *do not* navigate automatically. User controls the page's actual scroll.
 if(!section)return;
}
function syncScrollScene(){
 let section=0;
 for(let i=0;i<entries.length;i++){
  const e=document.getElementById(entries[i].id);
  if(e&&e.getBoundingClientRect().top<innerHeight*.44)section=i;
 }
 if(current!==section){current=section;setScene(section);}
}
function renderStill(){if(!renderer||!opened||!modelRoot)return;camera.lookAt(0,1.05,0);composer.render();}
function frame(now){
 raf=0;
 if(!opened||document.hidden||!initialized)return;
 const dt=lastTime?now-lastTime:16;lastTime=now;slowFrames=dt>22?slowFrames+1:Math.max(0,slowFrames-3);
 if(slowFrames>40&&pixelRatio>1.5){
  pixelRatio=Math.min(window.devicePixelRatio||1,1.5);resize();slowFrames=0;
 }
 if(isLowMotion.matches){renderStill();return;}
 const t=clock.getElapsedTime();
 if(modelRoot){
  const elapsed=t;
  modelRoot.userData.update?.(elapsed);
  const scrollProgress=(scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight));
  const targetZ=7.5-scrollProgress*.45;
  camera.position.z+=(targetZ-camera.position.z)*.035;
  camera.position.x+=(6.2+mouseX*.42-camera.position.x)*.045;
  camera.position.y+=(3.8-mouseY*.25-camera.position.y)*.035;
  camera.lookAt(0,1.05,0);
  modelRoot.rotation.y+=(mouseX*.34-modelRoot.rotation.y)*.025;
  const targetScale=1+Math.max(0,(8-camera.position.z))*.023;
  modelRoot.scale.setScalar(modelRoot.scale.x+(targetScale-modelRoot.scale.x)*.035);
 }
 if(particles)particles.rotation.y=t*.003;
 composer.render();
 raf=requestAnimationFrame(frame);
}
function start(){if(!opened||!initialized||raf||document.hidden)return;lastTime=0;clock.start();if(isLowMotion.matches){renderStill();return;}raf=requestAnimationFrame(frame);}
function stop(){if(raf)cancelAnimationFrame(raf);raf=0;if(clock)clock.stop();}
async function setOpen(next){
 opened=!!next;
 dock.hidden=!opened;toggle.setAttribute('aria-expanded',String(opened));
 toggle.setAttribute('aria-label',opened?'Close interactive 3D concepts':'Open interactive 3D concepts');
 if(!opened){stop();return;}
 if(!initialized){
  try{createWorld()}catch(err){
   console.warn('SK Group X: optional WebGL unavailable, preserving entire website',err);
   dock.hidden=true;toggle.hidden=true;opened=false;return;
  }
 }
 resize();syncScrollScene();await setScene(selected);start();
}
function destroy(){
 stop();if(!initialized)return;
 for(const group of cache.values())group.traverse(x=>{
  x.geometry?.dispose?.();
  if(x.material){const mats=Array.isArray(x.material)?x.material:[x.material];mats.forEach(m=>m.dispose?.());}
 });
 for(const texture of generatedTextures)texture.dispose();
 particles?.geometry.dispose();particles?.material.dispose();
 draco?.dispose();envRT?.dispose();pmrem?.dispose();composer?.dispose?.();renderer?.dispose();
 window._skx3dResizer?.disconnect();initialized=false;
}
try{toggle=decorateStage();window.SKX3D={entries:entries.map(({id,title,model})=>({id,title,model})),open:()=>setOpen(true),close:()=>setOpen(false),get activeModel(){return entries[selected]?.model;}};}
catch(error){console.warn('SK Group X optional 3D module unavailable',error);}
