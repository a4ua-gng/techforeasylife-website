'use strict';
// Keep the existing account and its cookie intact while access is paused.
(()=>{
 const previousRenderLogin=renderLogin,previousNavigate=navigate;
 let maintenance=null;
 function renderMaintenance(){
  if(dialog.open)dialog.close();
  const full=maintenance?.full_maintenance===true;
  app.innerHTML=`<main id="main" class="maintenance-page" tabindex="-1"><section class="maintenance-card" aria-labelledby="maintenance-title"><a class="maintenance-brand" href="/" aria-label="TEL OS home"><img class="tel-logo" src="/tel-logo.webp" alt="TEL" width="183" height="96"><span>TEL OS<span class="accent">.</span></span></a><span class="eyebrow">A LITTLE CARE FOR YOUR WORKSPACE</span><div class="maintenance-symbol" aria-hidden="true">${icon('heart')}</div><h1 id="maintenance-title">We’ll be back shortly.</h1><p class="maintenance-intro">We’re making a few improvements to help your workday run smoothly. Thanks for giving us a moment.</p><div class="maintenance-attendance">${icon('clock')}<div><strong>Your workday stays yours.</strong><p>${full?'Access is paused for every account, including founders. Your existing attendance and account records are preserved.':'If you’re already clocked in, your attendance continues, including any break. You can keep working with your usual account. Founders also have access.'}</p></div></div><div class="maintenance-actions"><button class="btn primary" type="button" id="maintenance-retry">${icon('refresh')}Try again</button>${full?'':`<button class="btn" type="button" id="maintenance-signin">Sign in to continue ${icon('arrow')}</button>`}</div><p class="hint">Your account and existing session are kept safe. You don’t need to reset your password.</p></section></main>`;
  document.title='Back shortly · TEL OS';
  document.querySelector('#maintenance-retry').addEventListener('click',()=>location.reload());
  document.querySelector('#maintenance-signin')?.addEventListener('click',()=>{
   previousRenderLogin();
   const card=document.querySelector('.login-card');
   if(card){const note=document.createElement('p');note.className='maintenance-login-note';note.textContent='Maintenance is in progress. Founders and team members already clocked in can sign in and continue.';card.prepend(note);}
  });
  document.querySelector('#main').focus({preventScroll:true});
 }
 api=async function(path,method='GET',body){
  const response=await fetch(path,{method,credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data;try{data=await response.json();}catch{throw new Error('The workspace could not respond. Please try again.');}
  if(response.status===503&&data.maintenance){maintenance=data;renderMaintenance();const error=new Error(data.error||'TEL OS is temporarily under maintenance.');error.maintenance=true;throw error;}
  if(!response.ok){if(response.status===401&&user){user=null;renderLogin();}throw new Error(data.error||'This action could not be completed.');}
  maintenance=null;
  return data;
 };
 renderLogin=function(){if(maintenance){renderMaintenance();return;}return previousRenderLogin();};
 navigate=async function(){if(maintenance){renderMaintenance();return;}await previousNavigate();if(maintenance)renderMaintenance();};
 window.renderMaintenance=renderMaintenance;
})();
