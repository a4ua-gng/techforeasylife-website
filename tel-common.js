"use strict";
(() => {
 const header=document.querySelector('[data-tel-header]');
 const nav=document.querySelector('[data-tel-nav]');
 const toggle=document.querySelector('[data-tel-toggle]');
 const groups=[...document.querySelectorAll('[data-venture-menu]')];
 const hover=matchMedia('(hover: hover) and (min-width: 821px)');
 const timers=new WeakMap();
 function setMenu(group,open){
  clearTimeout(timers.get(group));
  group.querySelector('.tel-nav-submenu').hidden=!open;
  group.querySelector('.tel-nav-disclosure').setAttribute('aria-expanded',String(open));
 }
 const closeMenus=except=>groups.forEach(group=>{if(group!==except)setMenu(group,false);});
 function openMenu(group){closeMenus(group);setMenu(group,true);}
 groups.forEach(group=>{
  const button=group.querySelector('.tel-nav-disclosure');
  button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')!=='true';closeMenus(group);setMenu(group,open);});
  group.querySelector('.tel-nav-venture-link').addEventListener('pointerenter',event=>{if(hover.matches&&event.pointerType!=='touch')openMenu(group);});
  group.addEventListener('pointerleave',()=>{if(hover.matches&&!group.contains(document.activeElement))timers.set(group,setTimeout(()=>setMenu(group,false),160));});
  group.addEventListener('focusin',event=>{clearTimeout(timers.get(group));if(event.target.matches('.tel-nav-venture-link:focus-visible')&&hover.matches)openMenu(group);});
  group.addEventListener('focusout',event=>{if(!group.contains(event.relatedTarget))setMenu(group,false);});
  group.addEventListener('keydown',event=>{
   if(event.key==='ArrowDown'&&event.target.matches('.tel-nav-venture-link,.tel-nav-disclosure')){event.preventDefault();openMenu(group);group.querySelector('.tel-nav-submenu a')?.focus();}
   if(event.key==='Escape'&&button.getAttribute('aria-expanded')==='true'){event.preventDefault();event.stopPropagation();setMenu(group,false);button.focus();}
  });
 });
 const close=()=>{nav?.classList.remove('open');toggle?.setAttribute('aria-expanded','false');toggle?.setAttribute('aria-label','Open navigation');closeMenus();};
 toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');nav?.classList.toggle('open',open);if(!open)closeMenus();});
 nav?.addEventListener('click',event=>{if(event.target.closest('a'))close();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&toggle?.getAttribute('aria-expanded')==='true'){close();toggle.focus();}});
 document.addEventListener('click',event=>{if(header&&!header.contains(event.target))close();});
 window.addEventListener('resize',()=>{if(window.innerWidth>820)close();},{passive:true});
 const update=()=>header?.classList.toggle('scrolled',window.scrollY>24);update();window.addEventListener('scroll',update,{passive:true});
 document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());
 // Expand a school format before an incoming deep link scrolls into view.
 function revealFormat(id){
  if(!id)return;
  const target=document.getElementById(id);
  if(target?.matches('.tel-school-format'))target.open=true;
  target?.closest('.tel-school-format')?.setAttribute('open','');
 }
 document.addEventListener('click',event=>{const anchor=event.target.closest('a[href^="#"]');if(anchor)revealFormat(anchor.getAttribute('href').slice(1));});
 const revealHash=()=>revealFormat(globalThis.TEL_DEMO_HASH||location.hash.slice(1));
 revealHash();window.addEventListener('hashchange',revealHash);
})();
