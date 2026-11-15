import {id,now,day,json,fail,one,rows,text} from './core.js';
import {queueTaskTransferEmails} from './operational-emails.js';

const activeTasks = ['todo','working','revision'];
const leads = ['founder','hr_lead','team_lead','finance_head'];
const select = `SELECT r.*,t.title AS task_title,t.status AS task_status,t.assignee_id,t.leader_id,
 f.name AS from_name,z.name AS to_name,v.name AS reviewer_name
 FROM task_transfer_requests r JOIN tasks t ON t.id=r.task_id
 JOIN users f ON f.id=r.from_user_id JOIN users z ON z.id=r.to_user_id JOIN users v ON v.id=r.reviewer_id`;

function view(item,user){
 item={...item,stale:item.status==='pending'&&(item.assignee_id!==item.from_user_id||item.leader_id!==item.reviewer_id||!activeTasks.includes(item.task_status))};
 if(user.id!==item.requested_by&&user.id!==item.reviewer_id&&user.role!=='founder'){
  const {reason,decision_note,...safe}=item;return safe;
 }
 return item;
}
function participant(item,user){return user.role==='founder'||item.requested_by===user.id||item.reviewer_id===user.id||(item.status==='approved'&&item.to_user_id===user.id);}
async function email(env,rid,event){
 try{await queueTaskTransferEmails(env,rid,event);}catch{console.error(JSON.stringify({event:'task_transfer_email_queue_needs_retry',request_id:rid,type:event}));}
}
function eligibleSQL(taskAlias='t'){
 return `${taskAlias}.status IN ('todo','working','revision')
 AND EXISTS(SELECT 1 FROM users reviewer WHERE reviewer.id=${taskAlias}.leader_id AND reviewer.status='active'
  AND reviewer.role IN ('founder','hr_lead','team_lead','finance_head') AND reviewer.id<>${taskAlias}.assignee_id
  AND (reviewer.role='founder' OR reviewer.department=${taskAlias}.department))
 AND EXISTS(SELECT 1 FROM users target JOIN users reviewer ON reviewer.id=${taskAlias}.leader_id
  WHERE target.id=? AND target.status='active' AND target.id<>${taskAlias}.assignee_id AND target.id<>${taskAlias}.leader_id
  AND (reviewer.role='founder' OR target.department=${taskAlias}.department)
  AND NOT EXISTS(SELECT 1 FROM leave_requests l WHERE l.user_id=target.id AND l.status='approved' AND l.start_date<=? AND l.end_date>=?))`;
}
async function checkTarget(env,task,targetId){
 if(!activeTasks.includes(task.status))fail(409,'Only tasks that are to do, in progress or awaiting revision can be transferred.');
 const reviewer=await one(env,'SELECT id,role,department,status FROM users WHERE id=?',task.leader_id);
 if(!reviewer||reviewer.status!=='active'||!leads.includes(reviewer.role)||reviewer.id===task.assignee_id||(reviewer.role!=='founder'&&reviewer.department!==task.department))fail(409,'The assigned reviewer is unavailable or changed. Ask a founder to review the assignment.');
 const target=await one(env,'SELECT id,name,department,status FROM users WHERE id=?',targetId);
 if(!target||target.status!=='active'||target.id===task.assignee_id||target.id===task.leader_id)fail(400,'Choose a different active teammate who is not the task reviewer.');
 if(reviewer.role!=='founder'&&target.department!==task.department)fail(403,'This reviewer can approve transfers only within the task department.');
 if(await one(env,"SELECT id FROM leave_requests WHERE user_id=? AND status='approved' AND start_date<=? AND end_date>=?",target.id,day(),day()))fail(409,'This teammate is on approved leave today. Choose an available teammate.');
 return target;
}

export async function handleTaskTransfers({request,url,env,user,body={}}){
 const list=url.pathname==='/api/task-transfers',taskMatch=url.pathname.match(/^\/api\/tasks\/([^/]+)\/transfers$/),decision=url.pathname.match(/^\/api\/task-transfers\/([^/]+)$/);
 if(!list&&!taskMatch&&!decision)return null;
 if(!user)fail(401,'Sign in to TEL OS.');
 if(!['active','on_leave'].includes(user.status))fail(403,'This account cannot manage task transfers.');
 if(list&&request.method==='GET'){
  const data=await rows(env,`${select} WHERE r.requested_by=? OR r.reviewer_id=? OR (r.to_user_id=? AND r.status='approved') ORDER BY r.created_at DESC LIMIT 100`,user.id,user.id,user.id);
  return json({transfers:data.map(item=>view(item,user))});
 }
 if(taskMatch){
  const task=await one(env,'SELECT * FROM tasks WHERE id=?',taskMatch[1]);if(!task)fail(404,'Task not found.');
  const data=await rows(env,`${select} WHERE r.task_id=? ORDER BY r.created_at DESC LIMIT 100`,task.id);
  const canRead=user.role==='founder'||task.assignee_id===user.id||task.leader_id===user.id||data.some(item=>participant(item,user));
  if(!canRead)fail(403,'Task transfer details are private to the task participants.');
  if(request.method==='GET'){
   const scoped=data.filter(item=>user.role==='founder'||task.assignee_id===user.id||task.leader_id===user.id||participant(item,user));
   let targets=[];
   if(task.assignee_id===user.id&&activeTasks.includes(task.status))targets=await rows(env,`SELECT target.id,target.name,target.department FROM users target JOIN users reviewer ON reviewer.id=? WHERE target.status='active' AND target.id<>? AND target.id<>? AND (reviewer.role='founder' OR target.department=?) AND NOT EXISTS(SELECT 1 FROM leave_requests l WHERE l.user_id=target.id AND l.status='approved' AND l.start_date<=? AND l.end_date>=?) ORDER BY target.name`,task.leader_id,task.assignee_id,task.leader_id,task.department,day(),day());
   return json({task:{id:task.id,assignee_id:task.assignee_id,leader_id:task.leader_id,status:task.status},transfers:scoped.map(item=>view(item,user)),targets});
  }
  if(request.method==='POST'){
   if(task.assignee_id!==user.id)fail(403,'Only the current assignee can request a task transfer.');
   const targetId=text(body.to_user_id,80,true),reason=text(body.reason,1500,true);await checkTarget(env,task,targetId);
   const rid=id(),stamp=now(),date=day(),notificationId=id(),auditId=id();let result;
   try{result=await env.DB.batch([
    env.DB.prepare(`INSERT INTO task_transfer_requests(id,task_id,from_user_id,to_user_id,reviewer_id,requested_by,reason,created_at,updated_at) SELECT ?,t.id,t.assignee_id,?,t.leader_id,?,?,?,? FROM tasks t WHERE t.id=? AND t.assignee_id=? AND t.leader_id=? AND ${eligibleSQL()}`).bind(rid,targetId,user.id,reason,stamp,stamp,task.id,user.id,task.leader_id,targetId,date,date),
    env.DB.prepare("INSERT INTO notifications(id,user_id,title,body,link,created_at,dedupe_key) SELECT ?,?,'Task transfer approval needed','A teammate requested a task handover. Open My tasks to review it.','tasks',?,? WHERE changes()>0").bind(notificationId,task.leader_id,stamp,'task-transfer-request:'+rid),
    env.DB.prepare("INSERT INTO audit_events(id,actor_id,action,entity,entity_id,details,created_at) SELECT ?,?,'task.transfer_requested','task',?,'Assigned reviewer approval required',? WHERE changes()>0").bind(auditId,user.id,task.id,stamp)
   ]);}catch(error){if(String(error).includes('UNIQUE'))fail(409,'A transfer is already awaiting approval for this task.');throw error;}
   if(result[0].meta?.changes!==1)fail(409,'The task or teammate availability changed. Refresh and try again.');
   await email(env,rid,'requested');
   return json({transfer:view(await one(env,`${select} WHERE r.id=?`,rid),user)},201);
  }
 }
 if(decision&&request.method==='PATCH'){
  const item=await one(env,`${select} WHERE r.id=?`,decision[1]);if(!item)fail(404,'Task transfer not found.');
  const action=body.action;
  if(!['approve','reject','cancel'].includes(action))fail(400,'Choose approve, reject or cancel.');
  if(action==='cancel'){
   const stale=item.assignee_id!==item.from_user_id||item.leader_id!==item.reviewer_id||!activeTasks.includes(item.task_status);
   const currentReviewer=user.id===item.leader_id&&leads.includes(user.role)&&user.status==='active';
   if(user.id!==item.requested_by&&!(stale&&currentReviewer))fail(403,'Only the requester or the current reviewer of an outdated request can cancel it.');
  }
  else if(user.id!==item.reviewer_id||user.id!==item.leader_id||user.id===item.requested_by||user.id===item.to_user_id||!leads.includes(user.role)||user.status!=='active')fail(403,'Only the currently assigned independent reviewer can decide this transfer.');
  const next={approve:'approved',reject:'rejected',cancel:'cancelled'}[action];
  if(item.status===next)return json({transfer:view(item,user),unchanged:true});
  if(item.status!=='pending')fail(409,'This transfer has already been decided.');
  const stamp=now(),note=text(body.note,1500),date=day();
  if(action==='approve'){
   const task=await one(env,'SELECT * FROM tasks WHERE id=?',item.task_id);
   if(task.assignee_id!==item.from_user_id||task.leader_id!==item.reviewer_id)fail(409,'The task owner or reviewer changed. Cancel this request and start a fresh transfer.');
   await checkTarget(env,task,item.to_user_id);
   const result=await env.DB.batch([
    env.DB.prepare(`UPDATE tasks AS t SET assignee_id=?,department=(SELECT department FROM users WHERE id=?),status='todo',submission='',feedback='',updated_at=? WHERE t.id=? AND t.assignee_id=? AND t.leader_id=? AND EXISTS(SELECT 1 FROM task_transfer_requests r WHERE r.id=? AND r.status='pending' AND r.task_id=t.id AND r.from_user_id=t.assignee_id AND r.reviewer_id=t.leader_id) AND ${eligibleSQL()}`).bind(item.to_user_id,item.to_user_id,stamp,item.task_id,item.from_user_id,user.id,item.id,item.to_user_id,date,date),
    env.DB.prepare("UPDATE task_transfer_requests SET status='approved',decision_note=?,updated_at=?,decided_at=?,decision_actor_id=? WHERE id=? AND status='pending' AND changes()>0").bind(note,stamp,stamp,user.id,item.id),
    env.DB.prepare("INSERT INTO task_events(id,task_id,actor_id,action,notes,created_at) SELECT ?,?,?,'transfer','Approved handover; the new assignee starts with To do.',? WHERE changes()>0").bind(id(),item.task_id,user.id,stamp),
    env.DB.prepare("INSERT INTO notifications(id,user_id,title,body,link,created_at,dedupe_key) SELECT ?,?,'Task assigned after transfer approval','Your task reviewer approved this assignment. Open My tasks to start.','tasks',?,? WHERE changes()>0").bind(id(),item.to_user_id,stamp,'task-transfer-approved-target:'+item.id),
    env.DB.prepare("INSERT INTO notifications(id,user_id,title,body,link,created_at,dedupe_key) SELECT ?,?,'Task transfer approved','Your reviewer approved the handover. The task now belongs to the new assignee.','tasks',?,? WHERE changes()>0").bind(id(),item.from_user_id,stamp,'task-transfer-approved-requester:'+item.id),
    env.DB.prepare("INSERT INTO audit_events(id,actor_id,action,entity,entity_id,details,created_at) SELECT ?,?,'task.transfer_approved','task',?,'Approved by the assigned independent reviewer',? WHERE changes()>0").bind(id(),user.id,item.task_id,stamp)
   ]);
   if(result[0].meta?.changes!==1)fail(409,'This transfer changed or was already reviewed. Refresh the task.');
   await email(env,item.id,'approved');
  }else{
   const result=await env.DB.batch([
    env.DB.prepare("UPDATE task_transfer_requests SET status=?,decision_note=?,updated_at=?,decided_at=?,decision_actor_id=? WHERE id=? AND status='pending'").bind(next,note,stamp,stamp,user.id,item.id),
    env.DB.prepare("INSERT INTO notifications(id,user_id,title,body,link,created_at,dedupe_key) SELECT ?,?,?,?,'tasks',?,? WHERE changes()>0").bind(id(),action==='reject'||user.id!==item.requested_by?item.from_user_id:item.reviewer_id,action==='reject'?'Task transfer declined':'Task transfer cancelled',action==='reject'?'The task stays assigned to you. Open My tasks for the reviewer decision.':'This pending handover was closed without changing the task owner.',stamp,'task-transfer-'+next+':'+item.id),
    env.DB.prepare("INSERT INTO audit_events(id,actor_id,action,entity,entity_id,details,created_at) SELECT ?,?,?,'task',?,'Task owner unchanged',? WHERE changes()>0").bind(id(),user.id,'task.transfer_'+next,item.task_id,stamp)
   ]);
   if(result[0].meta?.changes!==1)fail(409,'This transfer has already changed. Refresh the task.');
  }
  return json({transfer:view(await one(env,`${select} WHERE r.id=?`,item.id),user)});
 }
 fail(405,'This task transfer action is not supported.');
}
