"use strict";
(() => {
 const model=globalThis.TELBrandModel;if(!model)return;
 const make=(tag,cls,value)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=value;return node;};
 let data=globalThis.TELBrandConfig||model.defaults();
 let venture='education',clientId='sk-group';
 const hub=document.querySelector('[data-tel-venture-hub]');
 const showcase=document.querySelector('[data-client-showcase]');
 function renderHub(){
  if(!hub)return;
  const education=venture==='education';const name=education?data.education.name:data.temark.name;
  hub.querySelectorAll('[data-venture-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.ventureChoice===venture)));
  hub.querySelector('[data-hub-status]').textContent=education?(data.education.schoolEnquiriesOpen?`School enquiries for ${data.education.schoolYear} are open`:'TEL Education · '+(data.education.status==='active'?'Now active':'Public launch coming soon')):'Creative & marketing · Active';
  hub.querySelector('[data-hub-title]').textContent=name;
  hub.querySelector('[data-hub-copy]').textContent=education?'Practical STEM, products and the SafeFlight learning system.':'Marketing strategy, campaigns, content and design for real businesses.';
  const link=hub.querySelector('[data-hub-link]');link.href=education?'education.html':'temark.html';link.setAttribute('aria-label','Explore '+name);
 }
 hub?.querySelectorAll('[data-venture-choice]').forEach(button=>button.addEventListener('click',()=>{venture=button.dataset.ventureChoice;renderHub();}));
 function renderClients(){
  const current=data.clients.filter(client=>client.visible&&client.status==='current');
  const featured=current.find(client=>client.id==='sk-group')||current[0];
  const featuredRoot=document.querySelector('.telh-featured-client');
  if(featuredRoot){featuredRoot.closest('section').hidden=!featured;if(featured){featuredRoot.querySelector('[data-featured-client-name]').textContent=featured.name;featuredRoot.querySelector('[data-featured-client-detail]').textContent=featured.detail;featuredRoot.querySelector('[data-featured-client-services]').replaceChildren(...featured.services.map(value=>make('span','',value)));}}
  document.querySelectorAll('[data-client-name-strip]').forEach(root=>root.replaceChildren(...current.filter(client=>client!==featured).map(client=>make('span','',client.name))));
  if(!showcase)return;
  const tabs=showcase.querySelector('[data-client-tabs]');const panel=showcase.querySelector('#tel-client-profile');
  if(!current.length){tabs.replaceChildren();panel.replaceChildren(make('p','telv-copy','Our client work will be shared here.'));return;}
  if(!current.some(client=>client.id===clientId))clientId=current[0].id;
  tabs.replaceChildren(...current.map(client=>{
   const button=make('button','');button.type='button';button.id='client-tab-'+client.id;button.dataset.clientId=client.id;button.setAttribute('role','tab');button.setAttribute('aria-controls','tel-client-profile');button.setAttribute('aria-selected',String(client.id===clientId));button.tabIndex=client.id===clientId?0:-1;
   button.append(make('span','',client.name),make('small','',client.sector));
   button.addEventListener('click',()=>{clientId=client.id;renderClients();[...tabs.querySelectorAll('button')].find(item=>item.dataset.clientId===clientId)?.focus();});return button;
  }));
  const selected=current.find(client=>client.id===clientId);panel.setAttribute('aria-labelledby','client-tab-'+selected.id);
  const summary=make('div','');summary.append(make('span','telh-client-kicker','CLIENT / '+selected.sector.toUpperCase()),make('h3','',selected.name),make('p','',selected.detail));
  const services=make('div','');const list=make('div','telh-service-stack');list.append(...selected.services.map(value=>make('span','',value)));services.append(make('span','telh-client-kicker','SERVICES'),list);panel.replaceChildren(summary,services);
 }
 showcase?.querySelector('[data-client-tabs]')?.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const buttons=[...showcase.querySelectorAll('[data-client-id]')];const index=buttons.indexOf(event.target);if(index<0)return;event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length]?.click();
 });
 function renderEnquiries(){
  const open=data.education.schoolEnquiriesOpen,year=data.education.schoolYear;
  document.querySelectorAll('[data-school-enquiry-label]').forEach(node=>node.textContent=open?`School enquiries for ${year} are open`:'School enquiries are currently paused');
  document.querySelectorAll('[data-school-enquiry-year]').forEach(node=>node.textContent=year);
  document.querySelectorAll('[data-school-enquiry-state]').forEach(node=>node.textContent=open?`${year} school enquiries open`:'School enquiries paused');
  document.querySelectorAll('[data-school-enquiry-home], [data-school-enquiry-section], [data-school-enquiry-jump], [data-school-enquiry-nav]').forEach(node=>node.hidden=!open);
  document.querySelectorAll('[data-school-enquiry-jump]').forEach(node=>node.textContent=`School enquiries · ${year} ↗`);
  const subject=`TEL Education — School enquiry for ${year}`;
  const body=`Hello TEL Education,\n\nWe would like to discuss a learning experience for our school in ${year}.\n\nSchool name:\nCity / location:\nContact person:\nClasses / age group:\nApproximate student group size:\nPreferred period in ${year}:\nWhat we would like to explore:\n`;
  document.querySelectorAll('[data-school-enquiry-link]').forEach(link=>link.href='contact.html#enquiry-schools');
 }
 function renderSmartHome(){
  document.querySelectorAll('[data-smart-home-video]').forEach(root=>{root.replaceChildren();if(!data.tel.smartHomeVideo||!model.isPublicVideoUrl(data.tel.smartHomeVideo))return;const link=make('a','telv-button primary','Watch the smart-home project ↗');link.href=data.tel.smartHomeVideo;link.target='_blank';link.rel='noopener noreferrer';root.append(link);});
 }
 function render(next){data=model.normalize(next);renderHub();renderClients();renderEnquiries();renderSmartHome();}
 document.addEventListener('tel-brand-rendered',event=>render(event.detail));render(data);
})();
