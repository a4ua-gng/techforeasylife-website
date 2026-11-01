"use strict";
(() => {
 const root=document.querySelector('[data-tel-timeline]');
 let chosen=globalThis.TELBrandConfig?.milestones?.at(-1)?.id;
 function renderTimeline(data){
  if(!root||!data?.milestones)return;
  const milestones=data.milestones;
  const tabs=root.querySelector('[data-milestone-tabs]');const panel=root.querySelector('#tel-milestone-panel');
  if(!milestones.length){root.hidden=true;return;}root.hidden=false;
  if(!milestones.some(item=>item.id===chosen))chosen=milestones.at(-1).id;
  tabs.replaceChildren(...milestones.map(item=>{
   const button=document.createElement('button');button.type='button';button.id='milestone-tab-'+item.id;button.dataset.milestoneId=item.id;
   button.setAttribute('role','tab');button.setAttribute('aria-controls','tel-milestone-panel');button.setAttribute('aria-selected',String(chosen===item.id));button.tabIndex=chosen===item.id?0:-1;button.textContent=item.year;
   button.addEventListener('click',()=>{chosen=item.id;renderTimeline(data);root.querySelector('#milestone-tab-'+item.id)?.focus();});return button;
  }));
  const selected=milestones.find(item=>item.id===chosen);panel.setAttribute('aria-labelledby','milestone-tab-'+selected.id);
  const year=document.createElement('p');year.className='telc-milestone-year';year.textContent=selected.year;
  const content=document.createElement('div');const title=document.createElement('h3');title.textContent=selected.title;const detail=document.createElement('p');detail.textContent=selected.detail;content.append(title,detail);
  const symbol=document.createElement('span');symbol.className='telc-milestone-symbol';symbol.setAttribute('aria-hidden','true');symbol.textContent='↗';panel.replaceChildren(year,content,symbol);
 }
 document.addEventListener('tel-brand-rendered',event=>renderTimeline(event.detail));
 renderTimeline(globalThis.TELBrandConfig||globalThis.TELBrandModel?.defaults());
 root?.querySelector('[data-milestone-tabs]')?.addEventListener('keydown',event=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
  const buttons=[...root.querySelectorAll('[data-milestone-id]')];const index=buttons.indexOf(event.target);if(index<0)return;
  event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].click();
 });
 const educationMenu=document.querySelector('.telc-education-mobile');educationMenu?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>educationMenu.open=false));
 document.addEventListener('click',event=>{if(educationMenu&&!educationMenu.contains(event.target))educationMenu.open=false;});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&educationMenu?.open){educationMenu.open=false;educationMenu.querySelector('summary')?.focus();}});
 document.addEventListener('visibilitychange',()=>document.body.classList.toggle('telc-motion-paused',document.hidden));
})();
