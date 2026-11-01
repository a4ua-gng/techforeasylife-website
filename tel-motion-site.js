"use strict";
(() => {
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let paused=document.body.classList.contains('tel-space-paused')||reduced.matches;
 let lenis=null;
 const vendor=globalThis.TELMotionVendor;
 function syncScroll(){
  lenis?.destroy();lenis=null;
  if(!paused&&vendor?.Lenis)lenis=new vendor.Lenis({
   autoRaf:true,lerp:.095,smoothWheel:true,syncTouch:false,anchors:false,
   prevent:node=>Boolean(node.closest?.('dialog,.tel-nav-submenu,[data-lenis-prevent]'))
  });
 }
 function scrollToTarget(target,instant=false){
  if(!target)return;
  target.closest('details')?.setAttribute('open','');
  if(target.matches('details'))target.open=true;
  // Lenis already applies the page's CSS scroll-padding and scroll-margin.
  if(lenis)lenis.scrollTo(target,{immediate:instant||paused});
  else target.scrollIntoView({behavior:instant||paused?'instant':'smooth',block:'start'});
 }
 globalThis.TELScrollTo=scrollToTarget;
 syncScroll();
 document.addEventListener('tel-motion-change',event=>{paused=event.detail.paused||reduced.matches;syncScroll();document.documentElement.classList.toggle('tel-motion-still',paused);});
 reduced.addEventListener('change',()=>{paused=reduced.matches||document.body.classList.contains('tel-space-paused');syncScroll();});
 document.addEventListener('click',event=>{
  if(event.defaultPrevented)return;
  const a=event.target.closest('a[href]');if(!a)return;
  const href=a.getAttribute('href');
  if(!href.startsWith('#')||href==='#main')return;
  const target=document.getElementById(href.slice(1));
  if(target){event.preventDefault();scrollToTarget(target);}
 });
 // Small, one-time section entrances keep the reading order intact.
 const reveal=[...document.querySelectorAll('main>section .telv-section-head,main>section .telv-split,.telv-venture,.telh-featured-client,.tel-learning-steps article,.tel-implementation li,.telc-social-card,.telv-service-row,.telh-journey-item,.telv-career-tracks article,.telv-apply-step,.tel-programme-facts>div,.tel-policy-content>section')];
 if(!paused&&'IntersectionObserver'in window){
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
   if(entry.isIntersecting){entry.target.classList.add('tel-in-view');observer.unobserve(entry.target);}
  }),{threshold:.07,rootMargin:'0px 0px -25px 0px'});
  reveal.forEach((node,index)=>{node.classList.add('tel-motion-reveal');node.style.setProperty('--reveal-delay',Math.min(index%3,2)*60+'ms');observer.observe(node);});
  document.documentElement.classList.add('tel-reveals-ready');
  document.addEventListener('tel-motion-change',event=>{if(event.detail.paused){observer.disconnect();reveal.forEach(node=>node.classList.add('tel-in-view'));}});
 }
 // Load decorative GPU scenes near the viewport; static artwork remains underneath.
 document.querySelectorAll('[data-tel-visual],[data-tel-client-loop],[data-tel-brand-loop]').forEach(host=>{
  const mount=()=>{try{if(host.hasAttribute('data-tel-client-loop'))vendor?.mountClients?.(host);else if(host.hasAttribute('data-tel-brand-loop'))vendor?.mountBrands?.(host);else vendor?.mountVisual?.(host,host.dataset.telVisual);}catch{host.hidden=true;}};
  if('IntersectionObserver'in window){const io=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){io.disconnect();mount();}},{rootMargin:'120px'});io.observe(host);}else mount();
 });
 // Pointer light follows the visitor without moving text fields or keyboard targets.
 document.querySelectorAll('[data-hover-surface],.tel-photo-card,.tel-orbit-venture,.telv-venture,.telc-social-card').forEach(surface=>{
  surface.classList.add('tel-hover-surface');
  const reset=()=>{surface.style.removeProperty('--hover-x');surface.style.removeProperty('--hover-y');surface.style.removeProperty('--tilt-x');surface.style.removeProperty('--tilt-y');surface.classList.remove('tel-hover-active');};
  surface.addEventListener('pointermove',event=>{
   if(paused||event.pointerType!=='mouse'||!matchMedia('(hover:hover)').matches){reset();return;}
   const r=surface.getBoundingClientRect(),x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;
   surface.style.setProperty('--hover-x',(x*100).toFixed(1)+'%');surface.style.setProperty('--hover-y',(y*100).toFixed(1)+'%');
   surface.style.setProperty('--tilt-x',((.5-y)*2).toFixed(2)+'deg');surface.style.setProperty('--tilt-y',((x-.5)*2).toFixed(2)+'deg');surface.classList.add('tel-hover-active');
  },{passive:true});
  surface.addEventListener('pointerleave',reset);
  document.addEventListener('tel-motion-change',event=>{if(event.detail.paused)reset();});
 });
 // Native colours stay untouched when the product photograph changes.
 document.querySelectorAll('[data-education-view]').forEach(button=>button.addEventListener('click',()=>{
  const image=document.querySelector('[data-education-main-image]');if(image&&!paused)image.animate([{opacity:.4,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:450,easing:'cubic-bezier(.2,.75,.2,1)'});
 }));
 document.addEventListener('pointerdown',event=>{
  if(paused||!(event.pointerType==='touch'||event.pointerType==='pen'||event.target.closest('.tel-loader-core')))return;
  const target=event.target.closest('button,a');if(!target)return;
  const rect=target.getBoundingClientRect(),ripple=document.createElement('span');
  ripple.className='tel-touch-ripple';ripple.setAttribute('aria-hidden','true');
  ripple.style.left=(event.clientX-rect.left)+'px';ripple.style.top=(event.clientY-rect.top)+'px';
  target.classList.add('tel-touch-surface');target.append(ripple);ripple.addEventListener('animationend',()=>ripple.remove(),{once:true});
 },{passive:true});
 window.addEventListener('load',()=>{
  const hash=globalThis.TEL_DEMO_HASH||location.hash.slice(1);
  if(hash)scrollToTarget(document.getElementById(hash),true);
 });
 window.addEventListener('pagehide',()=>lenis?.destroy(),{once:true});
})();
