'use strict';
(function(){
const $=(s,root=document)=>root.querySelector(s),$$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const IMAGES=[{"id":1,"category":"electric","sector":"Electric mobility concept","title":"Electric three-wheeler study","src":"media/ai-01.webp"},{"id":2,"category":"electric","sector":"Electric mobility concept","title":"New routes, new possibilities","src":"media/ai-02.webp"},{"id":3,"category":"electric","sector":"Electric mobility concept","title":"Electric mobility in Assam","src":"media/ai-03.webp"},{"id":4,"category":"electric","sector":"Electric mobility concept","title":"The last-mile journey","src":"media/ai-04.webp"},{"id":5,"category":"motorcycles","sector":"Motorcycle concept","title":"Touring after dark","src":"media/ai-05.webp"},{"id":6,"category":"motorcycles","sector":"Motorcycle concept","title":"A classic silhouette","src":"media/ai-06.webp"},{"id":7,"category":"motorcycles","sector":"Motorcycle concept","title":"Materials and motion","src":"media/ai-07.webp"},{"id":8,"category":"motorcycles","sector":"Motorcycle concept","title":"The open road","src":"media/ai-08.webp"},{"id":9,"category":"motorcycles","sector":"Engineering detail","title":"Precision craftsmanship","src":"media/ai-09.webp"},{"id":10,"category":"motorcycles","sector":"Engineering detail","title":"Power in the details","src":"media/ai-10.webp"},{"id":11,"category":"motorcycles","sector":"Engineering detail","title":"Mechanical character","src":"media/ai-11.webp"},{"id":12,"category":"motorcycles","sector":"Engineering detail","title":"The art of engineering","src":"media/ai-12.webp"},{"id":13,"category":"commercial","sector":"Commercial mobility concept","title":"The workday in motion","src":"media/ai-13.webp"},{"id":14,"category":"commercial","sector":"Commercial mobility concept","title":"Built for everyday delivery","src":"media/ai-14.webp"},{"id":15,"category":"commercial","sector":"Commercial mobility concept","title":"New possibilities in transport","src":"media/ai-15.webp"},{"id":16,"category":"commercial","sector":"Commercial mobility concept","title":"An electric future","src":"media/ai-16.webp"},{"id":17,"category":"electric","sector":"Electric mobility concept","title":"City nights and electric roads","src":"media/ai-17.webp"},{"id":18,"category":"electric","sector":"Electric mobility concept","title":"Three wheels, many journeys","src":"media/ai-18.webp"},{"id":19,"category":"electric","sector":"Electric mobility concept","title":"A quieter tomorrow","src":"media/ai-19.webp"},{"id":20,"category":"electric","sector":"Electric mobility concept","title":"Progress through the city","src":"media/ai-20.webp"},{"id":21,"category":"motorcycles","sector":"Motorcycle concept","title":"Everyday adventures","src":"media/ai-21.webp"},{"id":22,"category":"motorcycles","sector":"Motorcycle concept","title":"The beauty of simplicity","src":"media/ai-22.webp"},{"id":23,"category":"motorcycles","sector":"Motorcycle concept","title":"Road-ready design","src":"media/ai-23.webp"},{"id":24,"category":"motorcycles","sector":"Motorcycle concept","title":"A different perspective","src":"media/ai-24.webp"},{"id":25,"category":"electric","sector":"Electric mobility concept","title":"Passenger mobility in focus","src":"media/ai-25.webp"},{"id":26,"category":"electric","sector":"Electric mobility concept","title":"Urban travel stories","src":"media/ai-26.webp"},{"id":27,"category":"electric","sector":"Electric mobility concept","title":"Around the next corner","src":"media/ai-27.webp"},{"id":28,"category":"electric","sector":"Electric mobility concept","title":"City moves","src":"media/ai-28.webp"},{"id":29,"category":"commercial","sector":"Commercial design detail","title":"A closer look","src":"media/ai-29.webp"},{"id":30,"category":"commercial","sector":"Commercial design detail","title":"Designed to move","src":"media/ai-30.webp"},{"id":31,"category":"lifestyle","sector":"Hospitality concept","title":"A welcoming place","src":"media/ai-31.webp"},{"id":32,"category":"lifestyle","sector":"Tourism concept","title":"The spirit of Manas","src":"media/ai-32.webp"},{"id":33,"category":"lifestyle","sector":"Jewellery concept","title":"Crafted in gold","src":"media/ai-33.webp"},{"id":34,"category":"lifestyle","sector":"Assamese food concept","title":"Flavours of Assam","src":"media/ai-34.webp"},{"id":35,"category":"lifestyle","sector":"Energy concept","title":"Everyday essentials","src":"media/ai-35.webp"},{"id":36,"category":"lifestyle","sector":"Hospitality concept","title":"Room to experience","src":"media/ai-36.webp"},{"id":37,"category":"lifestyle","sector":"Corporate concept","title":"A place for ideas","src":"media/ai-37.webp"},{"id":38,"category":"commercial","sector":"Commercial mobility concept","title":"Delivering what matters","src":"media/ai-38.webp"}];
const grid=$('#ai-gallery-grid'),filters=$('#ai-gallery-filters'),more=$('#ai-show-more'),lightbox=$('#ai-lightbox');
if(!grid)return;
const t=str=>window.SKXLocale?.t(str)||str;
let chosen='all',expanded=false,loadedValid=new Set(),failed=new Set(),currentIndex=0,focusBefore=null;
const count=$('.ai-cinema-count strong');
const title=$('#ai-lightbox-title'),image=$('#ai-lightbox-image'),position=$('#ai-lightbox-position');
function filtered(){return IMAGES.filter(x=>chosen==='all'||x.category===chosen)}
function visibleItems(){const items=filtered().filter(x=>!failed.has(x.id));return expanded?items:items.slice(0,12)}
function render(){
const all=filtered();
const visible=visibleItems();
grid.innerHTML=visible.map(x=>'<button class="ai-visual-card" type="button" data-ai-id="'+x.id+'" aria-label="'+x.title+' - AI-generated illustration"><img src="'+x.src+'" alt="'+x.title+'; AI-generated visual concept, not actual stock or showroom" loading="lazy" decoding="async"><span class="ai-visual-meta"><span><strong>'+t(x.title)+'</strong><small>'+t(x.sector)+'</small></span><b aria-hidden="true">↗</b></span></button>').join('');
if(!visible.length)grid.innerHTML='<p class="ai-gallery-empty">Visual concepts are being prepared. Explore our real Montra vehicles and business photos above.</p>';
if(more){more.hidden=expanded||all.length<=12;more.textContent=expanded?'':'Explore more imagery ↘';}
if(count)count.textContent=String(IMAGES.length-failed.size).padStart(2,'0');
$$('img',grid).forEach(img=>{
 img.addEventListener('load',()=>loadedValid.add(Number(img.closest('[data-ai-id]')?.dataset.aiId)));
 img.addEventListener('error',()=>{
  const card=img.closest('[data-ai-id]');const id=Number(card?.dataset.aiId);
  if(id&&!failed.has(id)){failed.add(id);card?.remove();if(count)count.textContent=String(IMAGES.length-failed.size).padStart(2,'0');}
 },{once:true});
});
}
function selectFilter(filter){
 chosen=filter;expanded=false;
$$('[data-ai-filter]',filters).forEach(btn=>{
 const selected=btn.dataset.aiFilter===filter;
 btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));
});
render();
}
filters?.addEventListener('click',e=>{const b=e.target.closest('[data-ai-filter]');if(b)selectFilter(b.dataset.aiFilter);});
more?.addEventListener('click',()=>{expanded=true;render();});
function openAt(id){
 const selection=filtered().filter(x=>!failed.has(x.id));
 const index=selection.findIndex(x=>x.id===id);
 if(index<0||!selection.length)return;
 currentIndex=index;focusBefore=document.activeElement;
 if(!lightbox.open)lightbox.showModal();
 paint();
}
function paint(){
 const selection=filtered().filter(x=>!failed.has(x.id));if(!selection.length){lightbox.close();return;}
 currentIndex=(currentIndex+selection.length)%selection.length;
 const item=selection[currentIndex];
 image.src=item.src;image.alt=item.title+'; AI-generated editorial concept';
 title.textContent=t(item.title);
 position.textContent=String(currentIndex+1).padStart(2,'0')+' / '+String(selection.length).padStart(2,'0');
}
grid.addEventListener('click',e=>{const b=e.target.closest('[data-ai-id]');if(b)openAt(Number(b.dataset.aiId));});
$('.ai-lightbox-close')?.addEventListener('click',()=>lightbox.close());
$('.ai-lightbox-prev')?.addEventListener('click',()=>{currentIndex--;paint();});
$('.ai-lightbox-next')?.addEventListener('click',()=>{currentIndex++;paint();});
lightbox?.addEventListener('click',e=>{if(e.target===lightbox)lightbox.close();});
lightbox?.addEventListener('close',()=>{if(focusBefore?.isConnected)focusBefore.focus({preventScroll:true});});
document.addEventListener('keydown',e=>{if(!lightbox?.open)return;if(e.key==='ArrowLeft'){currentIndex--;paint();}if(e.key==='ArrowRight'){currentIndex++;paint();}});
render();
/* Energy-conscious cinematic motion with always-present still image fallbacks. */
const clips=$$('[data-cinema-video]');
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const saveData=Boolean(navigator.connection?.saveData);
function stopVideo(v){v.pause();v.classList.remove('ready');}
function activateVideo(v){
 if(reduced.matches||saveData){stopVideo(v);return;}
 v.muted=true;
 const play=v.play();
 if(play&&typeof play.catch==='function')play.catch(()=>stopVideo(v));
}
clips.forEach(v=>{
 v.addEventListener('playing',()=>v.classList.add('ready'));
 v.addEventListener('error',()=>stopVideo(v));
 v.addEventListener('stalled',()=>stopVideo(v));
});
if('IntersectionObserver'in window){
 const io=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)activateVideo(entry.target);else stopVideo(entry.target);}),{threshold:.20,rootMargin:'100px 0px 100px 0px'});
 clips.forEach(v=>io.observe(v));
}else{clips.forEach(v=>v.setAttribute('preload','none'));}
reduced.addEventListener?.('change',()=>{if(reduced.matches)clips.forEach(stopVideo);});
})();