'use strict';
(function(){
  const hero=document.querySelector('.fx-hero');
  const cards=Array.from(document.querySelectorAll('[data-fx-parallax]'));
  const floating=hero?.querySelector('.fx-showcase');
  if(!hero||!floating||!cards.length)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer=window.matchMedia('(hover: hover) and (pointer: fine)');
  let active=false,scheduled=false,pointerX=0,pointerY=0;
  function setShift(x,y){
    for(const card of cards){
      const multiplier=Number(card.dataset.fxParallax)||1;
      card.style.setProperty('--fx-x',Math.round(x*multiplier*100)/100+'px');
      card.style.setProperty('--fx-y',Math.round(y*multiplier*100)/100+'px');
    }
  }
  function frame(){
    scheduled=false;
    if(!active||reduced.matches||!finePointer.matches)return;
    const r=floating.getBoundingClientRect();
    const dx=(pointerX-(r.left+r.width/2))/Math.max(1,r.width/2);
    const dy=(pointerY-(r.top+r.height/2))/Math.max(1,r.height/2);
    setShift(Math.max(-8,Math.min(8,dx*5)),Math.max(-7,Math.min(7,dy*4)));
  }
  floating.addEventListener('pointerenter',()=>{
    if(reduced.matches||!finePointer.matches)return;
    active=true;
  },{passive:true});
  floating.addEventListener('pointermove',event=>{
    if(!active||reduced.matches||!finePointer.matches)return;
    pointerX=event.clientX;pointerY=event.clientY;
    if(!scheduled){scheduled=true;requestAnimationFrame(frame);}
  },{passive:true});
  floating.addEventListener('pointerleave',()=>{active=false;setShift(0,0);},{passive:true});
  if(typeof reduced.addEventListener==='function')reduced.addEventListener('change',()=>{if(reduced.matches){active=false;setShift(0,0);}});
  // Subtle, accessible in-page highlighting for glass section links.
  const links=Array.from(document.querySelectorAll('.site-header .nav a[href^="#"]'));
  if('IntersectionObserver' in window){
    const map=new Map(links.map(x=>[x.getAttribute('href').slice(1),x]));
    const nodes=Array.from(document.querySelectorAll('main section[id]')).filter(x=>map.has(x.id));
    if(nodes.length){
      let focused=null;
      const observer=new IntersectionObserver(entries=>{
        for(const entry of entries){
          if(!entry.isIntersecting)continue;
          const next=map.get(entry.target.id);
          if(next===focused)continue;
          if(focused)focused.removeAttribute('aria-current');
          focused=next;focused?.setAttribute('aria-current','location');
        }
      },{rootMargin:'-17% 0px -64% 0px',threshold:0});
      nodes.forEach(x=>observer.observe(x));
    }
  }
})();
