'use strict';
/* SK Group X: accessible, persistent black/white appearance + custom language menu.
   Existing SKXLocale remains the source of truth for localization and URL changes. */
(function(){
 const root=document.documentElement;
 const savedKey='skx-color-mode';
 const languages=Object.freeze({en:'English',as:'অসমীয়া',hi:'हिन्दी'});
 const modeButton=document.getElementById('skx-theme-toggle');
 const langButton=document.getElementById('skx-language-toggle');
 const langLabel=document.getElementById('skx-language-label');
 const langMenu=document.getElementById('skx-language-menu');
 const nativeLang=document.getElementById('site-language');
 const options=langMenu?Array.from(langMenu.querySelectorAll('[data-lang]')):[];
 if(!modeButton||!langButton||!langMenu||!nativeLang)return;
 let theme=root.dataset.theme==='light'?'light':'dark';

 function applyMode(next,persist){
   theme=next==='light'?'light':'dark';
   root.dataset.theme=theme;
   const light=theme==='light';
   modeButton.setAttribute('aria-checked',String(light));
   modeButton.setAttribute('aria-label',light?'Switch to black mode':'Switch to white mode');
   modeButton.setAttribute('title',light?'Switch to black mode':'Switch to white mode');
   modeButton.dataset.mode=theme;
   document.querySelector('meta[name="theme-color"]')?.setAttribute('content',light?'#f9f7f1':'#080807');
   if(persist){
     try{localStorage.setItem(savedKey,theme);}catch(_){}
   }
 }
 applyMode(theme,false);
 modeButton.addEventListener('click',()=>applyMode(theme==='dark'?'light':'dark',true));

 let menuOpen=false;
 function setMenu(open,focusOption){
   menuOpen=!!open;
   langMenu.hidden=!menuOpen;
   langButton.setAttribute('aria-expanded',String(menuOpen));
   langButton.classList.toggle('is-open',menuOpen);
   if(menuOpen&&focusOption){
     const focused=options.find(el=>el.dataset.lang===nativeLang.value)||options[0];
     focused?.focus();
   }
 }
 function syncLanguage(){
   const code=languages[nativeLang.value]?nativeLang.value:'en';
   if(langLabel)langLabel.textContent=languages[code];
   for(const option of options){
     const current=option.dataset.lang===code;
     option.classList.toggle('is-current',current);
     option.setAttribute('aria-current',current?'true':'false');
     const mark=option.querySelector('.skx-language-check');
     if(mark)mark.setAttribute('aria-hidden','true');
   }
   langButton.setAttribute('aria-label','Language: '+languages[code]+'. Change website language');
 }
 syncLanguage();
 langButton.addEventListener('click',()=>setMenu(!menuOpen,false));
 langButton.addEventListener('keydown',event=>{
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){
     event.preventDefault();setMenu(true,true);
   }else if(event.key==='Escape'&&menuOpen){event.preventDefault();setMenu(false,false);}
 });
 for(const [index,option]of options.entries()){
   option.addEventListener('click',()=>{
     const next=option.dataset.lang;
     if(!languages[next])return;
     if(nativeLang.value===next){setMenu(false,false);langButton.focus();return;}
     nativeLang.value=next;
     // locales.js persists the choice and reloads with the selected locale.
     nativeLang.dispatchEvent(new Event('change',{bubbles:true}));
   });
   option.addEventListener('keydown',event=>{
     if(event.key==='Escape'){event.preventDefault();setMenu(false,false);langButton.focus();}
     if(event.key==='ArrowDown'||event.key==='ArrowUp'){
       event.preventDefault();const direction=event.key==='ArrowDown'?1:-1;
       options[(index+direction+options.length)%options.length].focus();
     }
     if(event.key==='Home'){event.preventDefault();options[0]?.focus();}
     if(event.key==='End'){event.preventDefault();options[options.length-1]?.focus();}
   });
 }
 document.addEventListener('pointerdown',event=>{
   if(menuOpen&&!event.target.closest('.skx-custom-language'))setMenu(false,false);
 },{passive:true});
 document.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&menuOpen){
     setMenu(false,false);langButton.focus();
   }
 });
 document.addEventListener('focusin',event=>{
   if(menuOpen&&!event.target.closest('.skx-custom-language'))setMenu(false,false);
 });
 window.addEventListener('pageshow',syncLanguage);
 window.SKXTheme={get current(){return theme;},set:(next)=>applyMode(next,true)};
})();
