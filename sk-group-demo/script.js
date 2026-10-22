const cards=[...document.querySelectorAll('[data-category]')];
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
