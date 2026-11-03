'use strict';
(function(){
  const section=document.getElementById('call-directory');
  if(!section)return;
  const phone=(digits)=>'tel:+91'+digits;
  const logos={
    montra:'../temark-assets/montra.png',
    royal:'../temark-assets/royal-enfield.png',
    tvs:'../temark-assets/tvs.png'
  };
  const verified=[
    {name:'GS Auto',city:'Howly · Barpeta',brand:'Royal Enfield',logo:logos.royal,number:'8291203209',display:'82912 03209',location:'NH 31 · HOWLY',index:'02'},
    {name:'GS Auto',city:'Sonkuchi · Barpeta',brand:'Royal Enfield',logo:logos.royal,number:'9167288263',display:'91672 88263',location:'DEWRIKUCHI · SONKUCHI',index:'03'},
    {name:'GS Riders',city:'Kokrajhar',brand:'Royal Enfield',logo:logos.royal,number:'9167782629',display:'91677 82629',location:'JD ROAD · KOKRAJHAR',index:'04'},
    {name:'Osom Motors',city:'Agia · Goalpara',brand:'TVS Motor',logo:logos.tvs,number:'8071406735',display:'80714 06735',location:'AGIA · GOALPARA',index:'05'}
  ];
  const cards=verified.map(x=>'<article class="cd-card"><div class="cd-card-top"><span>'+x.index+' / '+x.brand.toUpperCase()+'</span><img src="'+x.logo+'" loading="lazy" decoding="async" alt="'+x.brand+' logo"></div><div class="cd-main"><h3>'+x.name+'</h3><p>'+x.city+'</p><span>'+x.location+'</span></div><a class="cd-call-link" href="'+phone(x.number)+'" aria-label="Call '+x.name+' '+x.city+' on '+x.display+'"><span>☎ &nbsp;'+x.display+'</span><b aria-hidden="true">↗</b></a></article>').join('');
  section.innerHTML='<div class="wrap">'
   +'<div class="cd-topline"><span class="cd-mini-label"><span class="cd-pulse"></span> DIRECT DEALER CONTACTS</span><span>SHOWROOMS · TEST RIDES · SALES &amp; SERVICE</span></div>'
   +'<div class="cd-heading"><div><p>THE RIGHT CONNECTION</p><h2 id="call-directory-heading">One call.<br><em>One step closer.</em></h2></div><div class="cd-heading-aside"><p>Get in touch with a showroom directly. Choose a location, tap the number and speak to the team. For other SK Group businesses, request the correct branch contact.</p><a href="#businesses">Explore all SK Group businesses <span>↗</span></a></div></div>'
   +'<div class="cd-grid"><article class="cd-card cd-card-featured"><div class="cd-card-top"><span>01 / ELECTRIC MOBILITY</span><img src="'+logos.montra+'" loading="lazy" decoding="async" alt="Montra Electric logo"></div><div class="cd-main"><h3>Montra <em>Electric.</em></h3><p>Super Auto · Super Cargo</p><span>BETKUCHI · GUWAHATI</span></div><div class="cd-card-actions"><a href="tel:+918071441068" class="cd-call-main" aria-label="Call Montra Electric Betkuchi on 80714 41068">☎ &nbsp;Call 80714 41068 <b aria-hidden="true">↗</b></a><button type="button" data-open-enquiry="montra-auto">Request a quote ↗</button></div></article>'
   +cards+'</div>'
   +'<div class="cd-other"><div><span>NEED A DIFFERENT BRANCH?</span><strong>Yamaha · Ashok Leyland · Hospitality · Energy &amp; more</strong><p>We can prepare an enquiry for SK Group. Unverified dealer numbers are intentionally not published as group contacts.</p></div><button type="button" data-open-enquiry="other">Request the right contact <span>↗</span></button><a href="mailto:skgroupx@gmail.com?subject=SK%20Group%20dealer%20contact%20request">Email the group ↗</a></div>'
   +'<p class="cd-source-note">Numbers shown are published dealership contacts. Confirm current availability and working hours directly with each showroom.</p>'
   +'</div>';
  const welcome=document.getElementById('enquiry-dialog');
  document.addEventListener('click',function(event){
    const directoryLink=event.target.closest('[data-close-welcome-for-directory]');
    if(directoryLink&&welcome?.open){
      welcome.close();
      document.body.classList.remove('modal-lock');
    }
    /* Chips added after the initial enquiry script have the same behaviour as a regular static enquiry button. */
    const dyn=event.target.closest('#call-directory [data-open-enquiry]');
    if(dyn){
      const original=document.querySelector('.hero-actions [data-open-enquiry="'+dyn.dataset.openEnquiry+'"]')
        ||document.querySelector('.mobile-action-bar [data-open-enquiry="'+dyn.dataset.openEnquiry+'"]')
        ||document.querySelector('.driver-actions [data-open-enquiry="montra-auto"]');
      if(original)original.click();
    }
  });
  window.SKXDealerContacts=Object.freeze(verified.map(x=>({name:x.name,city:x.city,number:x.number,brand:x.brand})));
})();
