'use strict';
(() => {
 const previousTaskDialog=taskDialog,previousTasksPage=tasksPage,previousAction=handleAction;
 records.taskTransfersByTask??={};
 const canDecide=r=>r.status==='pending'&&!r.stale&&r.reviewer_id===user.id&&r.leader_id===user.id;
 function transferRow(r,{detail=false}={}){
  const taskLoaded=records.tasks?.some(t=>t.id===r.task_id);
  return `<article class="list-card"><div class="list-card-head"><div><h3>${esc(detail?r.from_name+' → '+r.to_name:r.task_title)}</h3><small class="muted">${detail?'Requested '+esc(datetime(r.created_at)):esc(r.from_name)+' → '+esc(r.to_name)+' · Reviewer: '+esc(r.reviewer_name)}</small></div>${badge(r.status)}</div>${r.stale?'<p class="note warning">This request is outdated because the task owner, reviewer or work stage changed. Close it before requesting a fresh handover.</p>':''}${detail&&r.reason?'<p class="pre"><strong>Reason for reviewer:</strong> '+esc(r.reason)+'</p>':''}${detail&&r.decision_note?'<p class="pre"><strong>Reviewer note:</strong> '+esc(r.decision_note)+'</p>':''}<div class="btn-row">${canDecide(r)?button('Approve transfer','transfer-decide','primary',`data-id="${esc(r.id)}" data-value="approve"`)+button('Decline transfer','transfer-decide','',`data-id="${esc(r.id)}" data-value="reject"`):''}${r.status==='pending'&&(r.requested_by===user.id||(r.stale&&r.leader_id===user.id))?button(r.stale?'Close outdated request':'Cancel request','transfer-decide','small',`data-id="${esc(r.id)}" data-value="cancel"`):''}${!detail&&taskLoaded?button('Open task','task-details','small',`data-id="${esc(r.task_id)}"`):''}</div></article>`;
 }
 tasksPage=async function(){
  const html=await previousTasksPage();
  try{
   const {transfers=[]}=await api('/api/task-transfers');records.taskTransfers=transfers;
   const pending=transfers.filter(canDecide),mine=transfers.filter(r=>r.requested_by===user.id).slice(0,5);
   if(!pending.length&&!mine.length)return html;
   const panel=`<section class="panel" style="margin-bottom:24px"><div class="panel-header"><h2>${pending.length?'Task transfers awaiting your approval':'Your task transfer requests'}</h2></div>${(pending.length?pending:mine).map(r=>transferRow(r)).join('')}</section>`;
   return html.replace('<div class="tabs"',panel+'<div class="tabs"');
  }catch(error){return html+'<p class="note warning" role="status">Task transfer tools could not load. Refresh to try again.</p>';}
 };
 async function appendTransfer(taskId){
  const host=$('.dialog-content');if(!host)return;
  const region=document.createElement('section'),marker=crypto.randomUUID();region.className='task-transfer-panel';region.dataset.transferRegion=marker;region.style.marginTop='24px';region.innerHTML='<h3>Task handover</h3><p class="hint">Checking transfer options…</p>';host.append(region);
  try{
   const data=await api('/api/tasks/'+encodeURIComponent(taskId)+'/transfers');
   if(!region.isConnected||region.dataset.transferRegion!==marker)return;
   records.taskTransfersByTask[taskId]=data;
   const {task,transfers,targets}=data,pending=transfers.find(r=>r.status==='pending');
   region.innerHTML='<h3>Task handover</h3><p class="hint">The assigned reviewer must approve before the task moves to another teammate. Review of the finished work is still required.</p>'+
    (task.assignee_id===user.id&&!pending&&['todo','working','revision'].includes(task.status)?(targets.length?button('Request a task transfer','transfer-request','',`data-id="${esc(taskId)}"`):'<p class="hint">No other active teammate is available for this reviewer.</p>'):'')+
    (transfers.length?transfers.slice(0,5).map(r=>transferRow(r,{detail:true})).join(''):'<p class="hint">No transfer has been requested.</p>');
  }catch(error){if(region.isConnected)region.innerHTML='<h3>Task handover</h3><p class="form-error" role="alert">'+esc(error.message)+'</p>';}
 }
 taskDialog=function(taskId){previousTaskDialog(taskId);if(records.tasks?.some(t=>t.id===taskId))appendTransfer(taskId);};
 function findRequest(requestId){return records.taskTransfers?.find(r=>r.id===requestId)||Object.values(records.taskTransfersByTask).flatMap(d=>d.transfers||[]).find(r=>r.id===requestId);}
 handleAction=async function(el){
  const action=el.dataset.action;
  if(action==='transfer-request'){
   const taskId=el.dataset.id,data=records.taskTransfersByTask[taskId];if(!data)throw Error('Open the task again to refresh transfer options.');
   modalForm('Request a task transfer',field('New assignee','to_user_id','select',{required:true,options:data.targets.map(p=>[p.id,p.name+' · '+p.department])})+field('Reason for your reviewer','reason','textarea',{required:true,maxlength:1500,hint:'Visible to you and authorised reviewers. This reason is excluded from email notifications.'}),body=>api('/api/tasks/'+encodeURIComponent(taskId)+'/transfers','POST',body),{submit:'Send for approval',description:'Your task stays assigned to you until '+(data.transfers[0]?.reviewer_name||nameOf(data.task.leader_id))+' approves the handover.',after:async()=>{toast('Transfer requested. Your reviewer must approve it first.');await refresh();taskDialog(taskId);}});
   return;
  }
  if(action==='transfer-decide'){
   const item=findRequest(el.dataset.id),decision=el.dataset.value;if(!item)throw Error('Refresh My tasks to load this request.');
   const title=decision==='approve'?'Approve this task transfer?':decision==='reject'?'Decline this task transfer?':'Cancel this transfer request?';
   modalForm(title,`<p><strong>${esc(item.task_title)}</strong></p><p>${esc(item.from_name)} → ${esc(item.to_name)}</p>${item.reason?'<p class="pre"><strong>Reason:</strong> '+esc(item.reason)+'</p>':''}`+(decision==='cancel'?'':field('Reviewer note (optional)','note','textarea',{maxlength:1500,hint:'Private to the requester and authorised reviewers; excluded from email.'})),body=>api('/api/task-transfers/'+encodeURIComponent(item.id),'PATCH',{action:decision,note:body.note||''}),{submit:decision==='approve'?'Approve and assign task':decision==='reject'?'Decline transfer':'Cancel request',description:decision==='approve'?'The new assignee will receive the task immediately with status To do. Finished work will still need independent approval.':'The task owner will remain unchanged.',after:async()=>{toast(decision==='approve'?'Transfer approved. The task is now assigned to '+item.to_name+'.':decision==='reject'?'Transfer declined.':'Transfer request cancelled.');await refresh();if(records.tasks?.some(t=>t.id===item.task_id))taskDialog(item.task_id);}});
   return;
  }
  return previousAction(el);
 };
})();
