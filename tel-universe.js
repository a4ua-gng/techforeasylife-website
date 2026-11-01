"use strict";
(() => {
 const canvas=document.querySelector('[data-space-canvas]');
 const context=canvas?.getContext('2d');
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 const controls=[...document.querySelectorAll('[data-space-motion]')];
 let paused=media.matches;
 try{const saved=sessionStorage.getItem('telSpaceMotionPaused');if(saved!==null)paused=saved==='1'||media.matches;}catch{}
 let width=1,height=1,frame=0,last=0,px=0,py=0,targetX=0,targetY=0,nextComet=performance.now()+9000;
 let seed=72819;
 const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
 const stars=Array.from({length:155},()=>({x:rand(),y:rand(),radius:.4+rand()*.85,alpha:.18+rand()*.55,depth:.25+rand()*.7,phase:rand()*6.28}));
 let comets=[];
 function orbitalAtlas(time){
  // Fine planetary paths and a small star map sit behind every public page.
  const x=width*.87+px*.2,y=height*.43+py*.2;
  const rx=Math.min(width*.27,350),ry=Math.min(height*.15,130),rotation=-.37;
  context.save();context.lineWidth=.7;
  for(const scale of [1,1.2]){
   context.strokeStyle=`rgba(202,181,224,${scale===1?.12:.055})`;
   context.beginPath();context.ellipse(x,y,rx*scale,ry*scale,rotation,0,Math.PI*2);context.stroke();
  }
  const phase=paused ? .7 : time*.000045+.7;
  const dx=Math.cos(phase)*rx,dy=Math.sin(phase)*ry;
  const planetX=x+dx*Math.cos(rotation)-dy*Math.sin(rotation),planetY=y+dx*Math.sin(rotation)+dy*Math.cos(rotation);
  context.fillStyle='rgba(222,207,236,.58)';context.beginPath();context.arc(planetX,planetY,2.5,0,Math.PI*2);context.fill();
  const sx=width<600?width*.13:width*.14,sy=height*.81,r=width<600?65:98;
  context.strokeStyle='rgba(204,180,225,.13)';context.beginPath();context.ellipse(sx,sy,r,r*.27,-.3,0,Math.PI*2);context.stroke();
  context.fillStyle='rgba(224,211,239,.5)';context.beginPath();context.moveTo(sx,sy-5);context.lineTo(sx+1.4,sy-1.4);context.lineTo(sx+5,sy);context.lineTo(sx+1.4,sy+1.4);context.lineTo(sx,sy+5);context.lineTo(sx-1.4,sy+1.4);context.lineTo(sx-5,sy);context.lineTo(sx-1.4,sy-1.4);context.closePath();context.fill();
  context.beginPath();context.arc(sx+r*.84,sy-r*.23,1.8,0,Math.PI*2);context.fill();context.restore();
 }
 function render(time=0){
  if(!context)return;
  context.clearRect(0,0,width,height);
  if(!paused){px+=(targetX-px)*.035;py+=(targetY-py)*.035;}
  orbitalAtlas(time);
  for(const star of stars){
   const x=star.x*width+px*star.depth,y=star.y*height+py*star.depth;
   const opacity=star.alpha*(paused?1:.9+.1*Math.sin(time*.0003+star.phase));
   context.beginPath();context.fillStyle=`rgba(235,235,235,${opacity})`;context.arc(x,y,star.radius,0,Math.PI*2);context.fill();
   if(star.radius>1.1){context.strokeStyle=`rgba(220,220,220,${opacity*.25})`;context.lineWidth=.6;context.beginPath();context.moveTo(x-3,y);context.lineTo(x+3,y);context.moveTo(x,y-3);context.lineTo(x,y+3);context.stroke();}
  }
  comets=comets.filter(c=>time-c.start<1200);
  for(const c of comets){
   const t=(time-c.start)/1200;if(t<0)continue;
   const x=c.x+t*width*.62,y=c.y+t*height*.32;
   const fade=Math.sin(Math.PI*t);context.lineWidth=1.3;
   const g=context.createLinearGradient(x-95,y-40,x,y);g.addColorStop(0,'rgba(230,230,230,0)');g.addColorStop(1,`rgba(245,245,245,${fade*.75})`);context.strokeStyle=g;context.beginPath();context.moveTo(x-95,y-40);context.lineTo(x,y);context.stroke();context.fillStyle=`rgba(255,255,255,${fade*.85})`;context.beginPath();context.arc(x,y,1.5,0,Math.PI*2);context.fill();
  }
  document.documentElement.style.setProperty('--space-x',paused?'0px':(px*.45).toFixed(2)+'px');
  document.documentElement.style.setProperty('--space-y',paused?'0px':(py*.45).toFixed(2)+'px');
 }
 function loop(time){
  if(paused||document.hidden){frame=0;return;}
  if(time>nextComet){launch();nextComet=time+18000+Math.random()*10000;}
  if(time-last>30){last=time;render(time);}
  frame=requestAnimationFrame(loop);
 }
 function sync(){
  document.body.classList.toggle('tel-space-paused',paused);
  for(const button of controls){button.setAttribute('aria-pressed',String(paused));button.setAttribute('aria-label',paused?'Resume animations':'Pause animations');button.querySelector('span').textContent=paused?'▷':'Ⅱ';button.querySelector('small').textContent=paused?'Motion off':'Motion on';}
  document.dispatchEvent(new CustomEvent('tel-motion-change',{detail:{paused}}));
  if(paused){cancelAnimationFrame(frame);frame=0;comets=[];render();}
  else if(!frame&&!document.hidden)frame=requestAnimationFrame(loop);
 }
 function resize(){
  if(!context)return;
  width=innerWidth;height=innerHeight;const ratio=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);context.setTransform(ratio,0,0,ratio,0,0);render(performance.now());
 }
 function launch(){if(paused||document.hidden)return;comets.push({x:width*(.08+Math.random()*.2),y:height*(.05+Math.random()*.25),start:performance.now()});if(comets.length>3)comets.shift();}
 controls.forEach(button=>button.addEventListener('click',()=>{paused=!paused;try{sessionStorage.setItem('telSpaceMotionPaused',paused?'1':'0');}catch{}sync();}));
 document.addEventListener('pointermove',event=>{if(paused||event.pointerType==='touch')return;targetX=(event.clientX/width-.5)*24;targetY=(event.clientY/height-.5)*20;},{passive:true});
 document.addEventListener('click',event=>{if(event.target.closest('a,button,input,textarea,select,label,summary,dialog,[role=tab]')||getSelection()?.toString())return;launch();},{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else sync();});
 media.addEventListener('change',event=>{paused=event.matches;sync();});
 window.addEventListener('resize',resize,{passive:true});resize();sync();

 const photos=[...document.querySelectorAll('[data-photo-view]')];
 const dialog=document.querySelector('[data-photo-dialog]');
 let selected=0,lastPhoto=null,visiblePhotos=photos.slice();
 document.querySelectorAll('[data-photo-filter]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-photo-filter]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  photos.forEach(photo=>photo.hidden=button.dataset.photoFilter!=='all'&&photo.dataset.photoKind!==button.dataset.photoFilter);
  visiblePhotos=photos.filter(photo=>!photo.hidden);
  const grid=document.querySelector('.tel-photo-grid');if(grid)grid.dataset.filter=button.dataset.photoFilter;
  const count=document.querySelector('[data-photo-count]');if(count)count.textContent=`${visiblePhotos.length} photograph${visiblePhotos.length===1?'':'s'}`;
 }));
 function show(index){if(!dialog||!visiblePhotos.length)return;selected=(index+visiblePhotos.length)%visiblePhotos.length;const image=visiblePhotos[selected].querySelector('img');const target=dialog.querySelector('[data-photo-expanded]');target.src=image.currentSrc||image.src;target.alt=image.alt;dialog.querySelector('[data-photo-caption]').textContent=`${image.alt} · ${selected+1} / ${visiblePhotos.length}`;}
 photos.forEach(photo=>photo.addEventListener('click',()=>{if(!dialog)return;lastPhoto=photo;show(visiblePhotos.indexOf(photo));dialog.showModal();}));
 document.addEventListener('tel-photo-open',event=>{if(!dialog||!visiblePhotos.includes(event.detail?.photo))return;lastPhoto=event.detail.trigger||document.activeElement;show(visiblePhotos.indexOf(event.detail.photo));dialog.showModal();});
 dialog?.querySelector('[data-photo-close]').addEventListener('click',()=>dialog.close());
 dialog?.querySelector('[data-photo-prev]').addEventListener('click',()=>show(selected-1));
 dialog?.querySelector('[data-photo-next]').addEventListener('click',()=>show(selected+1));
 dialog?.addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();show(selected+1);}if(event.key==='ArrowLeft'){event.preventDefault();show(selected-1);}});
 dialog?.addEventListener('close',()=>lastPhoto?.focus());
})();
