"use strict";
(() => {
 const reduce=matchMedia('(prefers-reduced-motion:reduce)'),fine=matchMedia('(hover:hover) and (pointer:fine)');
 let still=reduce.matches||document.body.classList.contains('tel-space-paused');
 const root=document.documentElement;
 root.classList.add('tel-site-ready');root.classList.toggle('tel-site-still',still);
 const media=[...document.querySelectorAll('.telv-film-link,.tel-shot-composition,.telv-education-product,.telc-company-photo')];
 media.forEach(el=>el.classList.add('tel-media-depth'));
 let scrollFrame=0;
 function updateScroll(){
  scrollFrame=0;
  const total=Math.max(1,root.scrollHeight-innerHeight);
  root.style.setProperty('--tel-reading-progress',String(Math.min(1,Math.max(0,scrollY/total))));
  for(const el of media){
   if(still){el.style.removeProperty('--media-scale');continue;}
   const rect=el.getBoundingClientRect();
   if(rect.bottom<0||rect.top>innerHeight)continue;
   const visibility=Math.max(0,Math.min(1,(innerHeight-rect.top)/(innerHeight*.8)));
   el.style.setProperty('--media-scale',(.97+.03*visibility).toFixed(4));
  }
 }
 const scroll=()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(updateScroll);};
 window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('resize',scroll,{passive:true});updateScroll();
 const surfaces='.telv-service-row,.telv-job,.telh-client-profile,.telh-client-tabs button,.telv-cta,.telh-enquiry-panel,.tel-programme-facts>div,.tel-implementation li,.telv-apply-step';
 let activeSurface=null;
 function clearSurface(){if(activeSurface){activeSurface.classList.remove('tel-surface-active');activeSurface.style.removeProperty('--hover-x');activeSurface.style.removeProperty('--hover-y');activeSurface=null;}}
 document.addEventListener('pointermove',event=>{
  if(still||!fine.matches||event.pointerType!=='mouse'){clearSurface();return;}
  const el=event.target.closest(surfaces);if(!el){clearSurface();return;}
  if(activeSurface!==el){clearSurface();activeSurface=el;el.classList.add('tel-motion-surface','tel-surface-active');}
  const r=el.getBoundingClientRect();el.style.setProperty('--hover-x',((event.clientX-r.left)/r.width*100).toFixed(1)+'%');el.style.setProperty('--hover-y',((event.clientY-r.top)/r.height*100).toFixed(1)+'%');
 },{passive:true});
 document.addEventListener('pointerleave',clearSurface);
 document.querySelectorAll('.telh-client-tabs').forEach(tabs=>tabs.addEventListener('click',event=>{
  if(still||!event.target.closest('[role=tab]'))return;
  const profile=document.querySelector('#tel-client-profile');if(!profile)return;
  profile.classList.remove('tel-client-profile-enter');requestAnimationFrame(()=>profile.classList.add('tel-client-profile-enter'));
 }));
 // Both venture links travel on one ellipse, in opposite phases. Keep the marks upright.
 const orbits=[...document.querySelectorAll('[data-tel-orbit]')].map(host=>({host,marks:[...host.querySelectorAll('.tel-orbit-venture')],angle:-.7,rx:0,ry:0,visible:true,hover:false,focus:false}));
 let orbitFrame=0,lastTime=0;
 function place(orbit){orbit.marks.forEach((mark,index)=>{
  const angle=orbit.angle+index*Math.PI;
  mark.style.setProperty('--orbit-x',(Math.cos(angle)*orbit.rx).toFixed(2)+'px');
  mark.style.setProperty('--orbit-y',(Math.sin(angle)*orbit.ry).toFixed(2)+'px');
 });}
 function sizeOrbit(orbit){const r=orbit.host.getBoundingClientRect(),markWidth=orbit.marks[0]?.getBoundingClientRect().width||116;orbit.rx=Math.max(0,(r.width-markWidth)/2-10);orbit.ry=r.height*.33;place(orbit);}
 function moving(){return !still&&!document.hidden&&orbits.some(o=>o.visible&&!o.hover&&!o.focus);}
 function animate(time){
  orbitFrame=0;if(!moving()){lastTime=0;return;}
  const dt=lastTime?Math.min(48,time-lastTime):0;lastTime=time;
  orbits.forEach(orbit=>{if(orbit.visible&&!orbit.hover&&!orbit.focus){orbit.angle+=dt/1000*Math.PI*2/95;place(orbit);}});
  orbitFrame=requestAnimationFrame(animate);
 }
 function wake(){if(moving()&&!orbitFrame)orbitFrame=requestAnimationFrame(animate);if(!moving()&&orbitFrame){cancelAnimationFrame(orbitFrame);orbitFrame=0;lastTime=0;}}
 orbits.forEach(orbit=>{
  sizeOrbit(orbit);
  const resize=new ResizeObserver(()=>sizeOrbit(orbit));resize.observe(orbit.host);
  orbit.host.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){orbit.hover=true;wake();}});
  orbit.host.addEventListener('pointerleave',()=>{orbit.hover=false;wake();});
  orbit.host.addEventListener('focusin',()=>{orbit.focus=true;wake();});
  orbit.host.addEventListener('focusout',event=>{if(!orbit.host.contains(event.relatedTarget)){orbit.focus=false;wake();}});
  if('IntersectionObserver'in window){const io=new IntersectionObserver(entries=>{orbit.visible=entries[0].isIntersecting;wake();});io.observe(orbit.host);}
 });
 function sync(){still=reduce.matches||document.body.classList.contains('tel-space-paused');root.classList.toggle('tel-site-still',still);if(still)clearSurface();scroll();wake();}
 document.addEventListener('tel-motion-change',sync);reduce.addEventListener('change',sync);document.addEventListener('visibilitychange',wake);wake();
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(orbitFrame);cancelAnimationFrame(scrollFrame);},{once:true});
})();
