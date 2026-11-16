'use strict';
(() => {
 const previousTasksPage=tasksPage,previousTaskDialog=taskDialog;
 const entryFor=taskId=>records.deadlineExtensions?.find(item=>item.task_id===taskId);
 function detail(item){
  const same=records.tasks?.find(task=>task.id===item.task_id)?.deadline===item.extended_deadline;
  return `<section class="note task-deadline-extension" aria-label="Deadline extension"><div><strong>One extra calendar day ${same?'granted':'recorded'}</strong><p>Original deadline: ${esc(date(item.original_deadline,true))}<br>Extended deadline: ${esc(date(item.extended_deadline,true))} · +1 calendar day</p>${item.escalated_at?'<p>The task missed its extended deadline. Its authorised reviewers have been notified.</p>':''}<p class="small muted">Due dates include the whole day in India Standard Time.</p></div></section>`;
 }
 tasksPage=async function(){
  const html=await previousTasksPage();
  try{
   const data=await api('/api/deadline-policy');records.deadlineExtensions=data.extensions||[];
   const template=document.createElement('template');template.innerHTML=html;
   for(const card of template.content.querySelectorAll('.task-card[data-id]')){
    const item=entryFor(card.dataset.id);if(!item)continue;
    const due=card.querySelector('.task-deadline');if(!due)continue;
    const original=document.createElement('div');original.className='small muted task-original-deadline';
    original.textContent='Original due '+date(item.original_deadline)+' · +1 calendar day';due.after(original);
   }
   return template.innerHTML;
  }catch{
   records.deadlineExtensions=[];
   return html+'<p class="hint" role="status">Deadline extension records could not load. Refresh to try again.</p>';
  }
 };
 taskDialog=function(taskId){
  previousTaskDialog(taskId);
  const item=entryFor(taskId),host=$('.dialog-content');if(!item||!host)return;
  const grid=host.querySelector('.task-details-grid');if(grid)grid.insertAdjacentHTML('afterend',detail(item));
 };
})();
