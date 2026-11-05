(() => {
 const $=s=>document.querySelector(s), data=window.SK;
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pictures=[
 ['axom-wide','Axom Inn, Howly','Hospitality'],
 ['montra-front','Montra Electric, Betkuchi','Commercial mobility'],
 ['montra-floor','Inside the Montra showroom','Electric three-wheelers'],
 ['guest-interior','Guest-house interior','Hospitality'],
 ['axom-front','Axom Inn and Royal Enfield frontage','Barpeta'],
 ['riders','G.S. Riders crest','Royal Enfield · Kokrajhar'],
 ['opening','Montra inauguration artwork','Showroom opening']
 ];
 const maps=address=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(address);
 const media=(key,art=false)=>'assets/'+key+(art?'.svg':'.webp');
 let slide=0;
 function showSlide(delta){
  slide=(slide+delta+5)%5;const [key,name,kind]=pictures[slide];const img=$('#hero-image');
  img.src=media(key);img.alt=name;img.style.objectPosition=key==='axom-wide'?'34% center':'center';$('#slide-name').textContent=name;$('#slide-kicker').textContent=String(slide+1).padStart(2,'0')+' / '+kind.toUpperCase();
 }
 $('#prev').onclick=()=>showSlide(-1);$('#next').onclick=()=>showSlide(1);
 $('#sector-grid').innerHTML=data.sectors.map(s=>`<a class="sector ${s.image==='riders'?'crest':s.image==='monogram'?'logo':''}" href="#business-${s.id}" data-sector="${s.id}"><img loading="lazy" decoding="async" src="${media(s.image,s.art)}" alt="${escape(s.alt)}"><span class="tag">${s.n} / SECTOR</span><div><h3>${escape(s.name)}</h3><p>${escape(s.line)}</p></div><span class="go" aria-hidden="true">↗</span></a>`).join('');
 $('#sector-filter').insertAdjacentHTML('beforeend',data.sectors.map(s=>`<option value="${s.id}">${escape(s.name)}</option>`).join(''));
 const opt=$('[name="business"]');opt.insertAdjacentHTML('beforeend','<option>General group enquiry</option>'+data.sectors.map(s=>`<optgroup label="${escape(s.name)}">${s.entries.map(([name,place])=>`<option>${escape(name+' — '+place)}</option>`).join('')}</optgroup>`).join(''));
 function render(openId=''){
  const term=$('#search').value.trim().toLowerCase(), sector=$('#sector-filter').value;let count=0;
  const open=new Set([...document.querySelectorAll('.dir-group[open]')].map(x=>x.id));
  $('#directory-list').innerHTML=data.sectors.filter(s=>!sector||s.id===sector).map(s=>{
   const list=s.entries.filter(e=>!term||[s.name,...e.slice(0,4)].join(' ').toLowerCase().includes(term));if(!list.length)return '';
   count+=list.length;
   return `<details class="dir-group" id="business-${s.id}" ${term||sector||openId===s.id||open.has('business-'+s.id)?'open':''}><summary>${escape(s.name)} <small>${list.length} listings</small></summary><div class="entries">${list.map(([name,place,desc,address,link,phone,sourceType])=>`<article class="entry"><span class="place">${escape(place)}</span><h3>${escape(name)}</h3><p>${escape(desc)}</p><address>${escape(address||'Contact the group for the exact location.')}</address><p class="visit-hours">${escape(name.includes('GS Riders')?'Showroom: 9 AM–8 PM':name.includes('Axom Inn')?'Check-in details: see the property listing.':'Group enquiries: 9 AM–8 PM IST')}</p><div class="links"><button type="button" data-enquire data-business="${escape(name+' — '+place)}">Enquire</button>${phone?`<a href="tel:+91${phone}">Call branch</a>`:''}${address?`<a href="${maps(address)}" target="_blank" rel="noopener">Map ↗</a>`:''}${link?`<a href="${escape(link)}" target="_blank" rel="noopener">${sourceType||(/dealers\.royalenfield/.test(link)?'Official dealer ↗':'Brand website ↗')}</a>`:''}</div></article>`).join('')}</div></details>`;
  }).join('');
  $('#result-count').textContent=count?count+' business '+(count===1?'listing':'listings'):'No matches. Try a different name or location.';
 }
 $('#search').oninput=()=>render();$('#sector-filter').onchange=()=>render();
 render(location.hash.replace('#business-',''));
 $('#gallery-grid').innerHTML=pictures.map(([key,name],i)=>`<button class="photo ${key==='riders'?'crest':''}" data-photo="${i}" aria-label="View ${escape(name)}"><img src="${media(key)}" alt="${escape(name)}" loading="lazy" decoding="async"><span>${escape(name)} ↗</span></button>`).join('');
 const menu=$('.menu');menu.onclick=()=>{const b=$('#nav').classList.toggle('open');menu.setAttribute('aria-expanded',String(b));};
 let previous;
 document.addEventListener('click',e=>{
  const sector=e.target.closest('[data-sector]');if(sector){$('#search').value='';$('#sector-filter').value='';render(sector.dataset.sector);}
  if(e.target.closest('#nav a')){$('#nav').classList.remove('open');menu.setAttribute('aria-expanded','false');}
  const request=e.target.closest('[data-enquire]');if(request){previous=request;opt.value=request.dataset.business||'';$('#email-status').textContent='';$('#enquiry').showModal();}
  const photo=e.target.closest('[data-photo]');if(photo){previous=photo;const [key,name]=pictures[Number(photo.dataset.photo)];const box=$('#lightbox');box.querySelector('img').src=media(key);box.querySelector('img').alt=name;box.querySelector('p').textContent=name;box.showModal();}
  const close=e.target.closest('[data-close]');if(close)close.closest('dialog').close();
  if(e.target instanceof HTMLDialogElement)e.target.close();
 });
 for(const d of document.querySelectorAll('dialog'))d.addEventListener('close',()=>previous?.focus());
 $('#enquiry-form').onsubmit=e=>{
  e.preventDefault();const f=new FormData(e.target);const body='Business: '+f.get('business')+'\nName: '+f.get('name')+'\nContact: '+f.get('contact')+'\n\n'+f.get('message');
  $('#email-status').textContent='If your email app did not open, use the email link below.';
  location.href='mailto:'+data.email+'?subject='+encodeURIComponent('SK Group enquiry: '+f.get('business'))+'&body='+encodeURIComponent(body);
 };
})();
{
 const toggle=document.querySelector('#studio'), status=document.querySelector('#studio-status');
 let release;
 toggle.addEventListener('click',async()=>{
  if(release){release();release=null;toggle.setAttribute('aria-pressed','false');toggle.firstChild.nodeValue='Enable 3D artwork ';status.textContent='';return;}
  toggle.disabled=true;status.textContent='Loading the 3D artwork…';
  try{
   if(!window.WebGL2RenderingContext)throw Error('WebGL2 unavailable');
   release=await (await import('./scene.mjs')).default();
   toggle.setAttribute('aria-pressed','true');toggle.firstChild.nodeValue='Disable 3D artwork ';status.textContent='Scroll through the portfolio to see the models turn.';
  }catch{status.textContent='3D is unavailable in this browser. You can still explore every photo and business.';}
  finally{toggle.disabled=false;}
 });
}
