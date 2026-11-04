'use strict';
(function(){
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const dialog=$('#enquiry-dialog'),form=$('#welcome-form'),purpose=$('#welcome-purpose');
if(!dialog||!form||!purpose)return;
const locale=()=>window.SKXLocale?.code||'en';
const words={
en:{phoneError:'Please enter a valid 10-digit Indian mobile number.',readyEmail:'Your email app should open with the enquiry ready. Review and press Send. If it did not open, use the link below.',readyWA:'WhatsApp should open with the message ready. Please press Send there. If WhatsApp is unavailable, call the showroom instead.',waOther:'For other SK Group businesses, please use the email enquiry button.',openEmail:'Open prepared email ↗',openWhatsApp:'Open WhatsApp message ↗',another:'Please complete the required fields.'},
as:{phoneError:'অনুগ্ৰহ কৰি বৈধ ১০ সংখ্যাৰ ভাৰতীয় ম’বাইল নম্বৰ লিখক।',readyEmail:'আপোনাৰ ইমেইল এপত পঠিয়াবলৈ সাজু বাৰ্তা খুলিব। পৰীক্ষা কৰি Send কৰক। নুখুলিলে তলৰ লিংকটো ব্যৱহাৰ কৰক।',readyWA:'WhatsApp-ত সাজু বাৰ্তা খুলিব। তাত Send কৰক। WhatsApp নাথাকিলে শ্ব’ৰুমলৈ ফোন কৰক।',waOther:'অন্য SK Group ব্যৱসায়ৰ বাবে ইমেইলযোগে সোধক।',openEmail:'সাজু ইমেইল খোলক ↗',openWhatsApp:'WhatsApp বাৰ্তা খোলক ↗',another:'প্ৰয়োজনীয় তথ্যসমূহ পূৰণ কৰক।'},
hi:{phoneError:'कृपया सही 10 अंकों का भारतीय मोबाइल नंबर दर्ज करें।',readyEmail:'आपका ईमेल ऐप तैयार संदेश के साथ खुलेगा। जाँचकर Send दबाएँ। न खुले तो नीचे दिए लिंक से खोलें।',readyWA:'WhatsApp में तैयार संदेश खुलेगा। वहाँ Send दबाएँ। WhatsApp उपलब्ध न हो तो शोरूम को कॉल करें।',waOther:'SK Group के दूसरे व्यवसायों के लिए ईमेल से पूछताछ करें।',openEmail:'तैयार ईमेल खोलें ↗',openWhatsApp:'WhatsApp संदेश खोलें ↗',another:'कृपया ज़रूरी जानकारी भरें।'}
};
const w=key=>words[locale()]?.[key]||words.en[key];
let previousFocus=null;
const chips=$$('.enquiry-chip');
function markChoice(value){chips.forEach(button=>{const active=button.dataset.quick===value;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});}
function setChoice(value){if(!$$('option',purpose).some(o=>o.value===value))value='other';purpose.value=value;markChoice(value);const isOther=!value.startsWith('montra-');const wa=$('#welcome-whatsapp');wa.disabled=isOther;wa.title=isOther?w('waOther'):'';wa.setAttribute('aria-disabled',String(isOther));}
function openEnquiry(value='other'){
previousFocus=document.activeElement;
if($('#business-dialog')?.open)$('#business-dialog').close();
setChoice(value);
if(!dialog.open){try{dialog.showModal();}catch(_){dialog.setAttribute('open','');}}
document.body.classList.add('modal-lock');
try{sessionStorage.setItem('skx-welcome-seen','yes');}catch(_){}
$('#welcome-name')?.focus({preventScroll:true});
}
function closeEnquiry(){if(dialog.open&&typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');document.body.classList.remove('modal-lock');if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}
function cleanDigits(value){let s=String(value).replace(/[০-৯]/g,ch=>String(ch.charCodeAt(0)-0x09E6)).replace(/[०-९]/g,ch=>String(ch.charCodeAt(0)-0x0966));s=s.replace(/\D/g,'');if(s.length===12&&s.startsWith('91'))s=s.slice(2);return s;}
function valid(){if(!form.reportValidity())return false;const input=$('#welcome-phone'),phone=cleanDigits(input.value);if(!/^[6-9]\d{9}$/.test(phone)){input.setCustomValidity(w('phoneError'));input.reportValidity();input.setCustomValidity('');return false;}return true;}
function message(){const name=$('#welcome-name').value.trim(),phone=cleanDigits($('#welcome-phone').value),city=$('#welcome-city').value.trim(),note=$('#welcome-message').value.trim(),selected=purpose.selectedOptions[0]?.textContent?.trim()||purpose.value;const title=['Montra Super Auto','Montra Super Cargo','Price / finance','Showroom visit / test drive','Service / spare parts','Other SK Group business'][['montra-auto','montra-cargo','montra-price','montra-test','montra-service','other'].indexOf(purpose.value)]||selected;
return {title,body:['Hello SK Group X,','I would like information about: '+title,'','Name: '+name,'Phone: +91 '+phone,'Town / District: '+(city||'Not specified'),note?'Message: '+note:'Please contact me with the details.','','Enquiry prepared from SK Group X website.'].filter(Boolean).join('\n')};}
function showFallback(url,kind){const feedback=$('#welcome-feedback');feedback.textContent=w(kind==='email'?'readyEmail':'readyWA');feedback.classList.remove('error');feedback.classList.add('success');let existing=$('#welcome-fallback');if(existing)existing.remove();const a=document.createElement('a');a.id='welcome-fallback';a.href=url;a.textContent=w(kind==='email'?'openEmail':'openWhatsApp');a.className='welcome-fallback';if(kind==='wa'){a.target='_blank';a.rel='noopener noreferrer';}feedback.insertAdjacentElement('afterend',a);}
function goEmail(){if(!valid())return;const item=message();const url='mailto:skgroupx@gmail.com?subject='+encodeURIComponent('Website enquiry: '+item.title+' | SK Group X')+'&body='+encodeURIComponent(item.body);showFallback(url,'email');window.location.href=url;}
function goWhatsApp(){if(!purpose.value.startsWith('montra-')){const e=$('#welcome-feedback');e.textContent=w('waOther');e.classList.add('error');return;}if(!valid())return;const item=message();const url='https://wa.me/918071441068?text='+encodeURIComponent(item.body);showFallback(url,'wa');window.open(url,'_blank','noopener,noreferrer');}
form.addEventListener('submit',e=>{e.preventDefault();goEmail();});
$('#welcome-whatsapp').addEventListener('click',goWhatsApp);
$('#welcome-phone').addEventListener('input',e=>e.target.setCustomValidity(''));
purpose.addEventListener('change',()=>setChoice(purpose.value));
chips.forEach(chip=>chip.addEventListener('click',()=>setChoice(chip.dataset.quick)));
$$('[data-open-enquiry]').forEach(trigger=>trigger.addEventListener('click',()=>openEnquiry(trigger.dataset.openEnquiry)));
$('.enquiry-close').addEventListener('click',closeEnquiry);
dialog.addEventListener('close',()=>{document.body.classList.remove('modal-lock');if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});});
dialog.addEventListener('click',e=>{if(e.target===dialog)closeEnquiry();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dialog.open)closeEnquiry();});
const params=new URLSearchParams(location.search);
const force=params.get('enquire');
let shown=false;try{shown=sessionStorage.getItem('skx-welcome-seen')==='yes';}catch(_){}
function showWelcome(){
  if(force){openEnquiry(force);return;}
  // A one-time, group-wide contact invitation. The site remains usable and scrollable
  // before the dialog appears; it never appears again within the same tab session.
  if(shown||new URLSearchParams(location.search).has('qa'))return;
  window.setTimeout(()=>{
    if(document.hidden||dialog.open||$('#business-dialog')?.open)return;
    let previouslyOpened=false;
    try{previouslyOpened=sessionStorage.getItem('skx-welcome-seen')==='yes';}catch(_){}
    if(!previouslyOpened)openEnquiry('other');
  },4400);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showWelcome,{once:true});else requestAnimationFrame(showWelcome);
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
