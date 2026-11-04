'use strict';
(function(){
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
/* Scroll feedback, accessible section discovery and staggered editorial transitions. */
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const progress=$('#reading-progress'),navLinks=$$('.nav a[href^="#"]');
let scrollScheduled=false;
function onScroll(){
scrollScheduled=false;
const root=document.documentElement,range=Math.max(1,root.scrollHeight-innerHeight);
if(progress)progress.style.width=(Math.min(1,Math.max(0,scrollY/range))*100).toFixed(2)+'%';
if(!reduced.matches&&scrollY<innerHeight&&innerWidth>780){
const slide=$('.hero-slide.active img');if(slide)slide.style.transform='translate3d(0,'+(Math.min(scrollY*.10,75)).toFixed(1)+'px,0) scale(1.055)';
}}
window.addEventListener('scroll',()=>{if(!scrollScheduled){scrollScheduled=true;requestAnimationFrame(onScroll);}},{passive:true});
window.addEventListener('resize',onScroll,{passive:true});onScroll();
if('IntersectionObserver'in window){
const chapterObserver=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(!entry.isIntersecting)return;const id=entry.target.id;navLinks.forEach(link=>{if(link.getAttribute('href')==='#'+id)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});});},{rootMargin:'-35% 0px -58% 0px',threshold:0});
['auto-owners','about','businesses','gallery-expanded','presence','story','contact'].forEach(id=>{const el=document.getElementById(id);if(el)chapterObserver.observe(el);});
if(!reduced.matches){
document.body.classList.add('motion-enabled');
const photoObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');photoObserver.unobserve(entry.target);}}),{threshold:.05,rootMargin:'0px 0px 80px 0px'});
const scan=()=>{
$$('.business-card,.gallery-tile,.journal-grid figure,.picture-tile').forEach((el,i)=>{if(el.dataset.scrollBound)return;el.dataset.scrollBound='yes';el.style.transitionDelay=(i%3)*85+'ms';photoObserver.observe(el);});
};
scan();
const grid=$('#business-grid');if(grid){new MutationObserver(scan).observe(grid,{childList:true});}
}
}
})();
