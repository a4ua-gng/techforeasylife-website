const cards=[...document.querySelectorAll('[data-category]')];
const themeToggle=document.querySelector('.theme-toggle');
function syncTheme(){const dark=document.documentElement.dataset.theme==='dark';themeToggle.setAttribute('aria-pressed',String(dark));themeToggle.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');document.querySelector('meta[name="theme-color"]').content=dark?'#181b22':'#faf6ed';}
themeToggle.addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('sk-theme',document.documentElement.dataset.theme);}catch(e){}syncTheme();});
syncTheme();
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
 document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
 cards.forEach(card=>card.hidden=button.dataset.filter!=='all'&&!card.dataset.category.split(' ').includes(button.dataset.filter));
}));
const search=document.querySelector('#search');
search.addEventListener('input',()=>{const query=search.value.trim().toLowerCase();let count=0;document.querySelectorAll('[data-search]').forEach(card=>{card.hidden=!card.dataset.search.includes(query);if(!card.hidden)count++;});document.querySelector('.result-count').textContent=`${count} location${count===1?'':'s'}`;document.querySelector('#no-results').hidden=count!==0;});
const modal=document.querySelector('#brand-dialog');
document.querySelectorAll('[data-brand]').forEach(button=>button.addEventListener('click',()=>{document.querySelector('#dialog-title').textContent=button.dataset.brand;modal.showModal();}));
document.querySelector('.close').addEventListener('click',()=>modal.close());
document.querySelector('#dialog-link').addEventListener('click',()=>modal.close());
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();}});
// Hero slideshow: automatic rotation with manual controls and reduced-motion support.
const hero=document.querySelector('.hero');
const slides=[...document.querySelectorAll('.hero-slides .hero-photo')];
const dots=[...document.querySelectorAll('.slide-dots button')];
const pauseButton=document.querySelector('.slide-pause');
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
let slideIndex=0,slideTimer=null,slidePaused=reducedMotion.matches;
function showSlide(index){slideIndex=(index+slides.length)%slides.length;slides.forEach((slide,i)=>{slide.classList.toggle('is-active',i===slideIndex);slide.setAttribute('aria-hidden',String(i!==slideIndex));});dots.forEach((dot,i)=>{if(i===slideIndex)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current');});document.querySelector('.slide-count').textContent=`${String(slideIndex+1).padStart(2,'0')} / ${String(slides.length).padStart(2,'0')}`;}
function stopRotation(){clearInterval(slideTimer);slideTimer=null;}
function startRotation(){stopRotation();if(!slidePaused&&!document.hidden&&!hero.matches(':hover')&&!hero.contains(document.activeElement))slideTimer=setInterval(()=>showSlide(slideIndex+1),6000);}
function syncPlayback(){pauseButton.textContent=slidePaused?'▶':'Ⅱ';pauseButton.setAttribute('aria-label',slidePaused?'Play image slideshow':'Pause image slideshow');startRotation();}
function manualSlide(index){showSlide(index);startRotation();}
document.querySelector('.slide-prev').addEventListener('click',()=>manualSlide(slideIndex-1));
document.querySelector('.slide-next').addEventListener('click',()=>manualSlide(slideIndex+1));
dots.forEach((dot,i)=>dot.addEventListener('click',()=>manualSlide(i)));
pauseButton.addEventListener('click',()=>{slidePaused=!slidePaused;syncPlayback();});
hero.addEventListener('mouseenter',stopRotation);hero.addEventListener('mouseleave',startRotation);
hero.addEventListener('focusin',stopRotation);hero.addEventListener('focusout',()=>setTimeout(startRotation,0));
document.addEventListener('visibilitychange',startRotation);
reducedMotion.addEventListener('change',event=>{slidePaused=event.matches;syncPlayback();});
syncPlayback();
