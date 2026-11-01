"use strict";
(() => {
 if(!globalThis.TELBrandModel)return;
 const model=globalThis.TELBrandModel;
 const previewEnabled=globalThis.TEL_LOCAL_DEMO===true||new URLSearchParams(location.search).get('tel-admin-preview')==='1';
 const brandNames={'tvs':'TVS','royal-enfield':'Royal Enfield','montra':'Montra Electric','yamaha':'Yamaha','ashok-leyland':'Ashok Leyland'};
 const logoSources={};
 document.querySelectorAll('[data-dealership-brand]').forEach(img=>logoSources[img.dataset.dealershipBrand]=img.src);
 function brandLogo(id,upcoming=false){
  const figure=document.createElement('figure');figure.className='telc-network-logo';
  const img=document.createElement('img');img.src=logoSources[id]||`temark-assets/${id}.png`;img.alt=brandNames[id];img.dataset.brand=id;img.dataset.dealershipBrand=id;img.width=190;img.height=70;figure.append(img);
  if(upcoming)figure.append(text('figcaption','telv-status','Coming soon'));
  return figure;
 }
 const text=(tag,className,value)=>{const el=document.createElement(tag);el.className=className;el.textContent=value;return el;};
 const get=(data,path)=>path.split('.').reduce((value,key)=>value?.[key],data);
 let config=model.defaults();
 function clientArticle(client,featured){
  const article=document.createElement('details');article.className='telc-client-row';article.open=featured;
  const summary=document.createElement('summary');const heading=document.createElement('div');heading.append(text('h3','',client.name),text('span','telv-client-sector',client.sector));summary.append(heading);
  const detail=document.createElement('div');detail.className='telc-client-detail';detail.append(text('p','telv-copy',client.detail));
  const services=document.createElement('div');services.className='telv-service-labels';client.services.forEach(service=>services.append(text('span','',service)));detail.append(services);
  article.append(summary,detail);return article;
 }
 function render(data){
  config=model.normalize(data);
  globalThis.TELBrandConfig=config;
  document.querySelectorAll('[data-brand-text]').forEach(el=>{const value=get(config,el.dataset.brandText);if(typeof value==='string')el.textContent=value;});
  document.querySelectorAll('[data-education-status]').forEach(el=>el.textContent=config.education.status==='active'?'Now active':'Coming soon');
  document.querySelectorAll('[data-education-link]').forEach(el=>el.textContent=config.education.name+(config.education.status==='coming_soon'?' · Coming soon':''));
  document.querySelectorAll('[data-flight-video]').forEach(link=>{if(model.isVideoUrl(config.education.flightVideo))link.href=config.education.flightVideo;});
  for(const [key,prefix]of[['tel','tel'],['temark','temark']]){
   const handle=config[key].instagram;if(!/^[A-Za-z0-9._]{1,30}$/.test(handle))continue;
   document.querySelectorAll(`[data-${prefix}-instagram], [data-${prefix}-instagram-link], [data-${prefix}-instagram-card]`).forEach(link=>link.href=`https://www.instagram.com/${handle}/`);
   document.querySelectorAll(`[data-${prefix}-instagram]`).forEach(link=>link.textContent=`@${handle} ↗`);
   document.querySelectorAll(`[data-${prefix}-instagram-handle]`).forEach(el=>el.textContent=`@${handle}`);
  }
  document.querySelectorAll('[data-temark-instagram]').forEach(link=>{const handle=config.temark.instagram;if(!/^[A-Za-z0-9._]{1,30}$/.test(handle))return;link.href=`https://www.instagram.com/${handle}/`;link.textContent=`@${handle} ↗`;});
  document.querySelectorAll('[data-brand-client-list]').forEach(root=>{
   const visible=config.clients.filter(c=>c.visible&&c.status==='current');
   const shown=root.dataset.brandClientList==='summary'?visible.slice(0,3):visible;
   root.replaceChildren(...shown.map((client,index)=>clientArticle(client,index===0)));
   if(!shown.length)root.append(text('p','telv-empty','Our client portfolio will be shared here.'));
  });
  document.querySelectorAll('[data-brand-upcoming]').forEach(root=>{
   const clients=config.clients.filter(c=>c.visible&&c.status==='upcoming');root.replaceChildren();root.hidden=!clients.length;
   clients.forEach(client=>{const panel=document.createElement('article');panel.className='telv-upcoming';const heading=document.createElement('div');heading.append(text('span','telv-status','Upcoming'),text('h3','',client.name),text('p','telv-client-sector',client.sector));panel.append(heading,text('p','telv-copy',client.detail));root.append(panel);});
  });
  document.querySelectorAll('[data-brand-services]').forEach(root=>{
   root.replaceChildren(...config.services.map((service,index)=>{const row=document.createElement('article');row.className='telv-service-row';row.id='service-'+service.id;row.append(text('span','telv-service-number',String(index+1).padStart(2,'0')),text('h3','',service.title),text('p','',service.detail));return row;}));
  });
  document.querySelectorAll('[data-brand-service-links]').forEach(root=>{
   root.replaceChildren(...config.services.map(service=>{const link=text('a','',service.title);link.href='temark.html#service-'+service.id;return link;}));
  });
  document.querySelectorAll('[data-dealership-brand-grid]').forEach(root=>root.replaceChildren(...config.dealershipBrands.filter(id=>brandNames[id]).map(id=>brandLogo(id))));
  document.querySelectorAll('[data-upcoming-brand-grid]').forEach(root=>{root.replaceChildren(...config.upcomingBrands.filter(id=>brandNames[id]).map(id=>brandLogo(id,true)));root.hidden=!config.upcomingBrands.length;});
  document.dispatchEvent(new CustomEvent('tel-brand-rendered',{detail:config}));

 }
 render(config);
 document.querySelectorAll('[data-education-gallery]').forEach(gallery=>{
  const image=gallery.querySelector('[data-education-main-image]');const caption=gallery.querySelector('figcaption[data-education-caption]');
  gallery.querySelectorAll('[data-education-view]').forEach(button=>button.addEventListener('click',()=>{
   const thumbnail=button.querySelector('img');if(!thumbnail||!image)return;
   image.src=thumbnail.src;image.alt=thumbnail.alt;
   if(caption)caption.textContent=button.dataset.educationCaption;
   gallery.querySelectorAll('[data-education-view]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  }));
 });
 fetch('data/site-control.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Site content unavailable');return response.json();}).then(data=>{if(data.brandSite)render(data.brandSite);}).catch(()=>{});
 window.addEventListener('message',event=>{
  if(!previewEnabled||event.source!==window.parent||(!globalThis.TEL_LOCAL_DEMO&&event.origin!==location.origin))return;
  if(event.data?.type==='TEL_ADMIN_PREVIEW'&&event.data.config?.brandSite)render(event.data.config.brandSite);
 });
})();
