"use strict";
(() => {
  const forms=[...document.querySelectorAll('[data-careful-contact]')];
  forms.forEach(form=>{
    const topic=form.elements.topic,status=form.querySelector('[data-enquiry-status]');
    const hash=globalThis.TEL_DEMO_HASH||location.hash.slice(1);
    const param=new URLSearchParams(location.search).get('topic');
    if(!form.dataset.enquiryVenture){
      if(hash==='enquiry-temark'||param==='temark')topic.value='TeMark project enquiry';
      if(hash==='enquiry-schools'||param==='institution')topic.value='TEL Education school enquiry · 2027';
    }
    function draft(){
      if(!form.reportValidity())return null;
      const data=new FormData(form),subject=`${data.get('topic')} — ${data.get('name')}`;
      const body=`Name: ${data.get('name')}\nEmail: ${data.get('email')}\nOrganisation: ${data.get('organisation')||'Not provided'}\n\n${data.get('message')}\n\nConsent: Use these details to respond to this enquiry only.\nPrivacy notice: TEL website Privacy Policy (draft).`;
      const config=globalThis.TELBrandConfig||globalThis.TELBrandModel?.defaults();
      const recipient=topic.value.startsWith('TeMark')&&config?.temark?.emailVerified?config.temark.email:topic.value.startsWith('TeMark')||topic.value.startsWith('TEL Education')?'techforeasylife.sales@gmail.com':'techforeasylife.operations@gmail.com';
      return{subject,body,recipient};
    }
    form.addEventListener('submit',event=>{
      event.preventDefault();const value=draft();if(!value)return;
      status.textContent='Your enquiry draft is ready. Review and send it in your email app. This website has not sent a message.';
      location.href=`mailto:${value.recipient}?subject=${encodeURIComponent(value.subject)}&body=${encodeURIComponent(value.body)}`;
    });
    form.querySelector('[data-copy-enquiry]').addEventListener('click',async()=>{
      const value=draft();if(!value)return;
      try{await navigator.clipboard.writeText(`To: ${value.recipient}\nSubject: ${value.subject}\n\n${value.body}`);status.textContent='Enquiry copied. Paste it into your email app and send when ready.';}
      catch{status.textContent='Copy is unavailable in this browser. Use Prepare email enquiry, or email the contact address shown on this page.';}
    });
  });
  function business(config){
    document.querySelectorAll('[data-temark-email-text]').forEach(node=>node.textContent=config.temark?.email||'');
    const data=config.business||{};
    document.querySelectorAll('[data-business-text]').forEach(node=>{
      const value=data[node.dataset.businessText];
      node.textContent=value||'To be confirmed before publication';
      if(node.matches('a')&&value&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))node.href='mailto:'+value;
    });
    document.querySelectorAll('[data-temark-routing-note]').forEach(node=>node.hidden=Boolean(config.temark?.emailVerified));
    forms.forEach(form=>{
      const education=form.dataset.enquiryVenture==='education';
      if(education)form.elements.topic.value=`TEL Education school enquiry · ${config.education.schoolYear}`;
      const inbox=!education&&config.temark?.emailVerified?config.temark.email:'techforeasylife.sales@gmail.com';
      form.querySelector('[data-enquiry-recipient]')?.replaceChildren(document.createTextNode(inbox));
    });
  }
  document.addEventListener('tel-brand-rendered',event=>business(event.detail));
  if(globalThis.TELBrandModel)business(globalThis.TELBrandConfig||globalThis.TELBrandModel.defaults());
})();
