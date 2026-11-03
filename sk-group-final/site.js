'use strict';
(function(){
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const EMAIL='skgroupx@gmail.com';
const LT=x=>window.SKXLocale?.t(x)||x;
const BT=(x,field)=>window.SKXLocale?.businessField(x.id,field,x[field])||x[field];
const BASE='../sk-group-demo/assets/';
const BRAND_LOGOS={royal:'../temark-assets/royal-enfield.png',tvs:'../temark-assets/tvs.png',yamaha:'../temark-assets/yamaha.png',montra:'../temark-assets/montra.png',ashok:'../temark-assets/ashok-leyland.png'};
function businessLogo(x,cls){const src=BRAND_LOGOS[x.id];return src?'<span class="'+cls+'"><img src="'+src+'" alt="'+escapeHTML(x.name)+' logo" loading="lazy" decoding="async"></span>':'';}
const UNSPLASH='https://images.unsplash.com/';
const business=[
{id:'royal',name:'Royal Enfield',sector:'MOTORCYCLE RETAIL',group:'mobility',city:'Barpeta & Kokrajhar',desc:'Royal Enfield motorcycles, riding gear, showroom enquiries and ownership support through the GS Auto and GS Riders locations.',detail:'Explore iconic Royal Enfield motorcycles and showroom services in Assam. SK Group-associated locations in Barpeta include GS Auto at Howly and Sonkuchi. In Kokrajhar, GS Riders appears in the official Royal Enfield directory. Test rides, product availability and service appointments should be confirmed with the relevant outlet.',image:BASE+'royal-enfield-showroom.webp',fallback:BASE+'royal-journey-2.webp',note:'GS Auto / GS Riders',link:'https://dealers.royalenfield.com/assam'},
{id:'tvs',name:'TVS Motor',sector:'TWO-WHEELER MOBILITY',group:'mobility',city:'Goalpara, Assam',desc:'A range of scooters and motorcycles designed for commuting, comfort and everyday adventures.',detail:'The group portfolio includes TVS Motor in Goalpara. Contact SK Group X for the specific showroom address, model availability, bookings and service information before travelling.',image:BASE+'tvs-showroom.webp',fallback:BASE+'tvs-product.webp',note:'Goalpara',link:'https://www.tvsmotor.com/'},
{id:'yamaha',name:'Yamaha Motor',sector:'TWO-WHEELER MOBILITY',group:'mobility',city:'Goalpara, Assam',desc:'Sports-inspired motorcycles and scooters bringing Yamaha engineering to riders in the Goalpara region.',detail:'The group portfolio includes Yamaha Motor in Goalpara. Confirm the current branch, available models, showroom contact and service schedule directly with SK Group X. This website does not represent model inventory as guaranteed stock.',image:BASE+'yamaha-ride.webp',fallback:BASE+'yamaha-r15.webp',note:'Goalpara',link:'https://www.yamaha-motor-india.com/'},
{id:'montra',name:'Montra Electric',sector:'ELECTRIC COMMERCIAL MOBILITY',group:'mobility',city:'Betkuchi, Guwahati',desc:'Electric three-wheelers for passenger journeys and last-mile cargo, supported by sales, service and parts.',detail:'Operated by SK Group X (OPC) Pvt. Ltd., the Montra Electric dealership at Betkuchi, Guwahati opened on 28 October 2026. The facility supports Montra Super Auto and Super Cargo through sales, service and spare parts. For showroom enquiries, call +91 80714 41068.',image:BASE+'montra-showroom.webp',fallback:BASE+'montra-mobility.webp',note:'Super Auto / Super Cargo',phone:'8071441068',link:'https://www.montraelectric.com/'},
{id:'ashok',name:'Ashok Leyland',sector:'COMMERCIAL VEHICLES',group:'mobility',city:'Assam',desc:'Light commercial vehicles and mobility solutions for businesses, distribution and daily operations.',detail:'Ashok Leyland light commercial vehicles form part of SK Group’s stated portfolio. Ask for the relevant branch, vehicle categories, offers and support arrangements. A specific SK Group X outlet address has not yet been independently verified for publication.',image:BASE+'ashok-road-1.webp',fallback:BASE+'ashok-road-3.webp',note:'Light commercial vehicles',link:'https://www.ashokleyland.com/'},
{id:'indane',name:'IndianOil Indane',sector:'ENERGY & LPG',group:'essentials',city:'Guwahati, Assam',desc:'A group-listed Indane gas agency supporting household energy and LPG distribution requirements.',detail:'The client portfolio includes an IndianOil Indane Gas Agency in Guwahati. For booking instructions, service areas, customer care and the correct agency address, contact SK Group X. The agency trading name and branch number are not yet confirmed for publication.',image:UNSPLASH+'photo-1581092160562-40aa08e78837?w=1100&auto=format&fit=crop&q=80',fallback:BASE+'ashok-road-2.webp',note:'LPG distribution',link:'https://iocl.com/'},
{id:'dominos',name:'Domino’s',sector:'FOOD & HOSPITALITY',group:'experiences',city:'Assam',desc:'A familiar food experience featured in the SK Group business portfolio.',detail:'Domino’s appears in SK Group’s client-supplied food and hospitality portfolio. The particular outlet and ownership relationship have not been independently verified. Contact the group for the specific branch and local enquiries. Domino’s is a trademark of its respective owner.',image:UNSPLASH+'photo-1579751626657-72bc17010498?w=1100&auto=format&fit=crop&q=80',fallback:BASE+'tvs-journey-1.webp',note:'Food & dining',link:null},
{id:'guest',name:'Guest Houses',sector:'HOSPITALITY',group:'experiences',city:'Guwahati & Barpeta',desc:'Accommodation and hospitality spaces serving visitors and travellers across Assam.',detail:'The group lists guest house businesses in Guwahati and Barpeta. Property names, room options, tariffs, exact addresses and booking arrangements can be shared by SK Group X on enquiry. Photographs used here illustrate hospitality and are not verified images of these properties.',image:UNSPLASH+'photo-1566073771259-6a8506099945?w=1100&auto=format&fit=crop&q=80',fallback:BASE+'royal-journey-5.webp',note:'Guwahati / Barpeta',link:null},
{id:'manas',name:'Manas Resort',sector:'TOURISM & RESORTS',group:'experiences',city:'Manas National Park, Assam',desc:'A hospitality venture associated with the landscape and tourism appeal of Manas National Park.',detail:'SK Group lists a resort at Manas National Park as part of its tourism portfolio. The final property name, guest facilities, location and reservation availability are not provided in the client brief. Images shown are illustrative nature photography, not claimed property photos.',image:UNSPLASH+'photo-1473448912268-2022ce9509d8?w=1100&auto=format&fit=crop&q=80',fallback:BASE+'royal-journey-5.webp',note:'Nature & hospitality',link:null},
{id:'jewellery',name:'Gold & Diamond Jewellery',sector:'JEWELLERY RETAIL',group:'essentials',city:'Guwahati, Assam',desc:'A jewellery retail business focused on precious metals, diamonds and personal milestones.',detail:'A gold and diamond jewellery store in Guwahati is listed in the SK Group portfolio. Contact the group for the store’s official name, collections, timings and exact location. The photograph illustrates the jewellery sector rather than an actual inventory display.',image:UNSPLASH+'photo-1515562141207-7a88fb7ce338?w=1100&auto=format&fit=crop&q=80',fallback:BASE+'yamaha-design.webp',note:'Guwahati',link:null},
{id:'fmcg',name:'Assamese Food & FMCG',sector:'UPCOMING VENTURE',group:'future',city:'Assam',desc:'A planned packaged foods brand rooted in the flavours and food traditions of Assam.',detail:'The upcoming Assamese snacks and packaged foods concept has working names Axom’r Swaad and Jalpan Ghar. The final trading name, launch date and products have not been confirmed, so this listing is a preview of a proposed group venture, not an announcement of availability.',image:UNSPLASH+'photo-1556909114-f6e7ad7d3136?w=1100&auto=format&fit=crop&q=80',fallback:BASE+'tvs-journey-2.webp',note:'Axom’r Swaad / Jalpan Ghar',upcoming:true,link:null},
{id:'corporate',name:'SK Group X',sector:'CORPORATE OPERATIONS',group:'future',city:'Assam, India',desc:'SK Group X (OPC) Pvt. Ltd. and other group entities supporting the portfolio’s business operations.',detail:'SK Group X (OPC) Pvt. Ltd. is the named group entity operating the Montra Electric showroom at Betkuchi. The wider client-supplied portfolio also references other group entities. For partnerships, media, business development and corporate enquiries, contact the central address skgroupx@gmail.com.',image:BASE+'montra-world.webp',fallback:BASE+'ashok-road-1.webp',note:'SK Group X (OPC) Pvt. Ltd.',link:null}
];
const locations=[
{name:'GS Auto · Howly',kind:'Royal Enfield',address:'Ward No. 1, NH 31, Howly, Barpeta, Assam 781316',phone:'8291203209',map:'Ward No 1 NH 31 Howly Barpeta Assam 781316',source:'https://dealers.royalenfield.com/assam/barpeta'},
{name:'GS Auto · Sonkuchi',kind:'Royal Enfield',address:'Dewrikuchi, Sonkuchi, Barpeta, Assam 781314',phone:'9167288263',map:'Dewrikuchi Sonkuchi Barpeta Assam 781314',source:'https://dealers.royalenfield.com/assam/barpeta'},
{name:'GS Riders · Kokrajhar',kind:'Royal Enfield',address:'JD Road, opposite IndianOil Petrol Pump, Kokrajhar, Assam 783370',phone:'9167782629',map:'GS Riders JD Road Kokrajhar Assam 783370',source:'https://dealers.royalenfield.com/assam/kokrajhar'},
{name:'Montra Electric · Betkuchi',kind:'Electric three-wheelers',address:'Betkuchi, Guwahati, Kamrup Metropolitan, Assam (exact street address on enquiry)',phone:'8071441068',map:'Montra Electric Betkuchi Guwahati Assam',source:'https://trucks.cardekho.com/en/news/detail/montra-electric-opens-new-e-3w-dealership-in-guwahati-to-expand-northeast-presence-3970.html'},
{name:'TVS Motor · Goalpara',kind:'Motorcycles & scooters',address:'Goalpara, Assam (exact branch address available on enquiry)',phone:null,map:null,source:null},
{name:'Yamaha Motor · Goalpara',kind:'Motorcycles & scooters',address:'Goalpara, Assam (exact branch address available on enquiry)',phone:null,map:null,source:null}
];
const escapeHTML=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function mailto(subject,body){return 'mailto:'+EMAIL+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body||'');}
function renderCards(filter){
const grid=$('#business-grid');if(!grid)return;
const visible=business.filter(x=>filter==='all'||x.group===filter);
grid.innerHTML=visible.map(x=>'<article class="business-card"><div class="card-image"><img src="'+escapeHTML(x.image)+'" data-fallback="'+escapeHTML(x.fallback)+'" alt="'+escapeHTML(x.name+' business category imagery')+'" loading="lazy"><span class="card-sector">'+escapeHTML(LT(x.sector))+'</span>'+businessLogo(x,'card-brand-logo')+(x.upcoming?'<span class="card-status">UPCOMING</span>':'')+'</div><div class="card-body"><small>'+escapeHTML(LT(x.city))+'</small><h3>'+escapeHTML(x.name)+'</h3><p>'+escapeHTML(BT(x,'desc'))+'</p><button type="button" class="card-button" data-business="'+escapeHTML(x.id)+'" aria-label="Explore '+escapeHTML(x.name)+'"><span class="card-action">Discover business <span aria-hidden="true">↗</span></span></button></div></article>').join('');
window.SKXLocale?.translate(grid);
}
function renderLocations(){
const target=$('#location-list');if(!target)return;
target.innerHTML=locations.map((x,i)=>'<article class="location"><span class="location-num">'+String(i+1).padStart(2,'0')+'</span><div><h3>'+escapeHTML(x.name)+'</h3><p>'+escapeHTML(x.kind)+'</p></div><div class="location-address">'+escapeHTML(x.address)+'</div><div class="location-phone">'+(x.phone?'<a href="tel:+91'+escapeHTML(x.phone)+'">+91 '+escapeHTML(x.phone)+'</a>':'<a href="'+mailto('Branch enquiry: '+x.name,'Hello SK Group X,\n\nI would like the address and phone number for '+x.name+'.\n\nThank you.')+'">Email for details ↗</a>')+'</div><div class="location-link">'+(x.map?'<a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(x.map)+'" target="_blank" rel="noopener noreferrer" aria-label="Find '+escapeHTML(x.name)+' on maps">Directions ↗</a>':'<a href="'+mailto('Branch enquiry: '+x.name,'Hello SK Group X,\n\nPlease share the location of '+x.name+'.')+'">Enquire ↗</a>')+'</div></article>').join('');
window.SKXLocale?.translate(target);
}
const dialog=$('#business-dialog');
function openBusiness(id){
const x=business.find(z=>z.id===id);if(!x||!dialog)return;
const link=x.link?'<a href="'+escapeHTML(x.link)+'" class="line-link" target="_blank" rel="noopener noreferrer">Visit brand website <span>↗</span></a>':'';
const phone=x.phone?'<a href="tel:+91'+x.phone+'" class="line-link">Call this branch <span>↗</span></a>':'';
$('#dialog-content').innerHTML='<div class="dialog-visual"><img src="'+escapeHTML(x.image)+'" data-fallback="'+escapeHTML(x.fallback)+'" alt="'+escapeHTML(x.name)+' image"></div><div class="dialog-inner">'+businessLogo(x,'dialog-brand-logo')+'<p class="section-index"><span class="bar"></span>'+escapeHTML(LT(x.sector))+'</p><h2 id="dialog-title">'+escapeHTML(x.name)+'</h2><p>'+escapeHTML(BT(x,'detail'))+'</p><div class="dialog-meta"><div><span>LOCATION / PRESENCE</span><strong>'+escapeHTML(LT(x.city))+'</strong></div><div><span>BUSINESS FOCUS</span><strong>'+escapeHTML(LT(x.note))+'</strong></div></div><div class="dialog-actions"><a class="btn btn-dark" href="'+mailto('Enquiry: '+x.name+' | SK Group X','Hello SK Group X,\n\nI am interested in '+x.name+'. Please contact me with the relevant details.\n\nMy name:\nMy contact number:\nMy enquiry:')+'">Enquire by email <span>↗</span></a>'+phone+link+'</div></div>';
window.SKXLocale?.translate($('#dialog-content'));
if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
document.body.style.overflow='hidden';
}
renderCards('all');renderLocations();
const filterButtons=$$('.filter');
filterButtons.forEach(b=>b.addEventListener('click',()=>{filterButtons.forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));});renderCards(b.dataset.filter);}));
document.addEventListener('click',e=>{const button=e.target.closest('[data-business]');if(button)openBusiness(button.dataset.business);});
$('.dialog-close')?.addEventListener('click',()=>dialog.close());
dialog?.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
dialog?.addEventListener('close',()=>{document.body.style.overflow='';});
const slides=$$('.hero-slide'), tabs=$$('#hero-tabs button'), count=$('#slide-number');
let slide=0, timer=null, userInteracted=false;
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function gotoSlide(index){
if(!slides.length)return;
slide=(index+slides.length)%slides.length;
slides.forEach((el,i)=>{el.classList.toggle('active',i===slide);el.setAttribute('aria-hidden',String(i!==slide));});
tabs.forEach((el,i)=>{el.classList.toggle('active',i===slide);el.setAttribute('aria-pressed',String(i===slide));});
if(count)count.textContent=String(slide+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0');
}
function startTimer(){clearInterval(timer);if(reduced||document.hidden||userInteracted)return;timer=setInterval(()=>gotoSlide(slide+1),7000);}
function manual(index){userInteracted=true;gotoSlide(index);clearInterval(timer);}
tabs.forEach((b,i)=>b.addEventListener('click',()=>manual(i)));
$('#hero-prev')?.addEventListener('click',()=>manual(slide-1));
$('#hero-next')?.addEventListener('click',()=>manual(slide+1));
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInterval(timer);else startTimer();});
startTimer();
const header=$('#site-header');
function scrollState(){header?.classList.toggle('scrolled',window.scrollY>100);}
window.addEventListener('scroll',scrollState,{passive:true});scrollState();
const menu=$('.menu-btn'),nav=$('#nav');
function closeMenu(){nav?.classList.remove('open');menu?.setAttribute('aria-expanded','false');menu?.setAttribute('aria-label','Open navigation');document.body.classList.remove('menu-open');}
menu?.addEventListener('click',()=>{const open=!nav.classList.contains('open');nav.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');document.body.classList.toggle('menu-open',open);});
$$('.nav a').forEach(a=>a.addEventListener('click',closeMenu));
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
document.addEventListener('click',e=>{if(nav?.classList.contains('open')&&!e.target.closest('.site-header'))closeMenu();});
const emailForm=$('#email-form');
emailForm?.addEventListener('submit',event=>{
event.preventDefault();
if(!emailForm.reportValidity())return;
const name=$('#enq-name').value.trim(),email=$('#enq-email').value.trim(),interest=$('#enq-interest').value,message=$('#enq-message').value.trim();
if(!name||!email||!interest||!message)return;
const subject='Website enquiry: '+interest+' | SK Group X';
const body='Hello SK Group X,\n\n'+message+'\n\nBusiness / topic: '+interest+'\nName: '+name+'\nReply-to email: '+email+'\n\nSent via the SK Group X website enquiry composer.';
const url=mailto(subject,body);
const note=$('#form-note');
note.textContent=LT('Your email application should open with the message. Review it and press Send. If it did not open, use the email link below.');
const existing=$('#mail-fallback');if(existing)existing.remove();
const fallback=document.createElement('a');
fallback.id='mail-fallback';fallback.href=url;fallback.textContent=LT('Open prepared email ↗');fallback.style.cssText='color:#896632;text-decoration:underline;display:inline-block;margin-top:8px;font-weight:700;font-size:13px';
note.after(fallback);
window.location.href=url;
});
const observer=('IntersectionObserver' in window)?new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('in-view');observer.unobserve(entry.target);}});},{threshold:.11}):null;
$$('.reveal').forEach(el=>{if(observer)observer.observe(el);else el.classList.add('in-view');});
document.addEventListener('error',e=>{const img=e.target;if(img instanceof HTMLImageElement){const backup=img.dataset.fallback;if(backup&&img.src!==new URL(backup,document.baseURI).href){img.dataset.fallback='';img.src=backup;}}},true);
$('#year').textContent=String(new Date().getFullYear());
})();