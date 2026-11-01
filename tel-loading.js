"use strict";
(() => {
 const loader=document.querySelector('[data-tel-loader]');
 if(!loader||new URLSearchParams(location.search).has('tel-admin-preview')||window.self!==window.top&&!globalThis.TEL_LOCAL_DEMO)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const bar=loader.querySelector('[role="progressbar"]'),percent=loader.querySelector('[data-loading-percent]');
 let run=0,tick=0,deadline=0,closing=0,active=false;
 const core=loader.querySelector(".tel-loader-core");
 loader.querySelector(".tel-loader-electric")?.remove();
 if(core){for(const name of ["primary","secondary"]){const orbit=document.createElement("span");orbit.className="tel-loading-orbit "+name;orbit.setAttribute("aria-hidden","true");orbit.append(document.createElement("i"));core.append(orbit);}}
 const progress=value=>{const n=Math.max(0,Math.min(100,Math.round(value)));loader.style.setProperty('--load-progress',n+'%');bar?.setAttribute('aria-valuenow',String(n));bar?.setAttribute('aria-valuetext',n===100?'Page ready':`Preparing page, ${n}%`);if(percent)percent.textContent=n+'%';};
 const clean=()=>{clearInterval(tick);clearTimeout(deadline);clearTimeout(closing);};
 function close(immediate=false){
  if(!active)return;active=false;run++;clean();progress(100);
  const finish=()=>{if(loader.open)loader.close();loader.hidden=true;loader.classList.remove('tel-loader-finished');};
  if(immediate||reduced.matches)finish();else{loader.classList.add('tel-loader-finished');closing=setTimeout(finish,460);}
 }
 function open(){
  if(active)return;
  clean();active=true;const id=++run;loader.hidden=false;loader.classList.remove('tel-loader-finished');progress(0);
  try{loader.showModal();}catch{loader.hidden=true;active=false;return;}
  const start=performance.now(),min=reduced.matches?0:2800;
  const images=[...document.querySelectorAll('main>section:first-child img[src]')];
  let done=0,ready=false;
  const jobs=images.map(img=>img.decode?img.decode().catch(()=>{}):Promise.resolve());
  jobs.push(Promise.resolve(document.fonts?.ready));
  jobs.push(new Promise(resolve=>{if(document.readyState==='complete')resolve();else window.addEventListener('load',resolve,{once:true});}));
  const total=jobs.length;
  const update=()=>{
   if(!active||id!==run)return;
   const elapsed=performance.now()-start;
   // Progress includes asset readiness and the short brand introduction.
   progress(ready&&elapsed>=min?100:Math.min(94,Math.min(1,elapsed/Math.max(min,1))*65+done/total*29));
   if(ready&&elapsed>=min)close();
  };
  jobs.forEach(job=>Promise.resolve(job).finally(()=>{if(id===run){done++;ready=done===total;update();}}));
  tick=setInterval(update,50);deadline=setTimeout(()=>close(),6000);
 }
 loader.addEventListener('cancel',()=>close(true));
 // Page navigation stays native: downloads, external links and same-page anchors are untouched.
 document.addEventListener('click',event=>{
  const a=event.target.closest?.('a[href]');if(!a||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||a.download||a.target&&a.target!=='_self'||globalThis.TEL_LOCAL_DEMO)return;
  const url=new URL(a.href,location.href);
  if(url.origin!==location.origin||!(/\.html$/.test(url.pathname)||url.pathname.endsWith('/'))||url.pathname===location.pathname&&url.search===location.search)return;
  open();progress(12);
 });
 window.addEventListener('pageshow',event=>{if(event.persisted)close(true);});
 window.addEventListener('pagehide',()=>close(true));
 window.addEventListener('message',event=>{if(globalThis.TEL_LOCAL_DEMO&&event.source===parent&&event.data?.type==='TEL_REPLAY_INTRO')open();});
 open();
})();
