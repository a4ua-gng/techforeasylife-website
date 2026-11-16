import {rows,one,id,json,fail} from './core.js';

export const DEADLINE_EMAIL_KINDS=['deadline_grace_granted','deadline_grace_missed'];
const DAY=86400000,ACTIVE="('todo','working','revision')",MEMBERS="('active','on_leave')";
const LEADS="('founder','hr_lead','team_lead','finance_head')";
const clean=(value,max=180)=>Array.from(String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim()).slice(0,max).join('');
const stamp=value=>new Date(value??Date.now()).toISOString();
const localDay=value=>new Date(Date.parse(value)+330*60000).toISOString().slice(0,10);
function validDay(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function addDay(value){return new Date(Date.parse(value+'T00:00:00Z')+DAY).toISOString().slice(0,10);}
function boundary(value){return new Date(addDay(value)+'T00:00:00+05:30').toISOString();}
const reviewer=(person='u',task='t')=>`${person}.id=${task}.leader_id AND ${person}.id<>${task}.assignee_id AND ${person}.role IN ${LEADS} AND (${person}.role='founder' OR ${person}.department=${task}.department)`;
const oversight=(person='u',task='t')=>`(${person}.role IN ('hr_lead','hr_member') OR (${person}.role='team_lead' AND ${person}.department='Marketing' AND ${task}.department='Marketing'))`;
const escalationRecipient=(person='u',task='t')=>`(${person}.id=${task}.assignee_id OR (${reviewer(person,task)}) OR ${oversight(person,task)})`;
const verified="EXISTS(SELECT 1 FROM member_connections c WHERE c.user_id=u.id AND c.provider='gmail' AND c.status='verified' AND c.verified_at IS NOT NULL AND c.verified_at<>'')";

export async function deadlinePolicyReady(env){
 const tables=await rows(env,"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('deadline_extension_records','deadline_email_jobs')");
 return tables.length===2;
}
async function config(env,current){
 if(!await deadlinePolicyReady(env))return null;
 const setting=await one(env,"SELECT value FROM app_settings WHERE key='deadline_policy_enabled_at'");
 return setting?.value&&Number.isFinite(Date.parse(setting.value))&&stamp(setting.value)<=current?{enabledAt:stamp(setting.value),settingValue:setting.value}:null;
}
function eventStatements(env,recordId,kind,current,settings){
 const grant=kind==='deadline_grace_granted',source=grant?'e.created_at':'e.escalated_at';
 const recipients=grant?'u.id=e.assignee_id AND u.id=t.assignee_id':escalationRecipient();
 const live=`t.deadline=e.extended_deadline AND t.status IN ${ACTIVE} AND e.created_at>=? AND EXISTS(SELECT 1 FROM app_settings s WHERE s.key='deadline_policy_enabled_at' AND s.value=?)`;
 const event=grant?'e.escalated_at IS NULL':'e.escalated_at IS NOT NULL';
 const record=recordId?'AND e.id=?':'',params=[settings.enabledAt,settings.settingValue,...(recordId?[recordId]:[])];
 const key=`'${kind}:'||e.id||':'||u.id`;
 const title=grant?'One extra day for your task':'Task missed its extended deadline';
 const body=grant?"'One extra calendar day was granted. Original deadline: '||e.original_deadline||'. Extended deadline: '||e.extended_deadline||' (Asia/Kolkata).'":"'This task is still unfinished after one extra calendar day. Original deadline: '||e.original_deadline||'. Extended deadline: '||e.extended_deadline||' (Asia/Kolkata). Open the deadline record to review the assignment.'";
 return [
  env.DB.prepare(`INSERT OR IGNORE INTO notifications(id,user_id,title,body,link,created_at,dedupe_key)
   SELECT lower(hex(randomblob(16))),u.id,?,${body},'tasks',?,${key}
   FROM deadline_extension_records e JOIN tasks t ON t.id=e.task_id JOIN users u ON u.status IN ${MEMBERS}
   WHERE ${live} AND ${event} ${record} AND (${recipients}${grant?'':" OR u.role='founder'"})
   AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.dedupe_key=${key}) ORDER BY e.created_at,e.id,u.id LIMIT 500`).bind(title,current,...params),
  env.DB.prepare(`INSERT OR IGNORE INTO deadline_email_jobs(id,event_key,user_id,kind,entity_id,source_at,scheduled_at,status,created_at)
   SELECT lower(hex(randomblob(16))),${key},u.id,?,e.id,${source},${source},CASE WHEN ${verified} THEN 'queued' ELSE 'blocked' END,?
   FROM deadline_extension_records e JOIN tasks t ON t.id=e.task_id JOIN users u ON u.status IN ${MEMBERS}
   WHERE ${live} AND ${event} ${record} AND (${recipients})
   AND NOT EXISTS(SELECT 1 FROM deadline_email_jobs j WHERE j.event_key=${key}) ORDER BY e.created_at,e.id,u.id LIMIT 500`).bind(kind,current,...params)
 ];
}

// D1 batches are transactions: the deadline, immutable original, in-app notice
// and outbox are committed together. A unique task_id prevents a second grace.
export async function runDeadlinePolicy(env,options={}){
 const current=stamp(options.now),settings=await config(env,current);
 if(!settings)return {enabled:false,extended:0,escalated:0,queued:0};
 let extended=0,escalated=0,queued=0;
 const candidates=await rows(env,`SELECT t.id,t.deadline FROM tasks t JOIN users a ON a.id=t.assignee_id
  WHERE t.status IN ${ACTIVE} AND a.status IN ${MEMBERS} AND t.deadline<?
  AND date(t.deadline,'+0 days')=t.deadline
  AND julianday(t.deadline,'+1 day','-5 hours','-30 minutes')>=julianday(?)
  AND NOT EXISTS(SELECT 1 FROM deadline_extension_records e WHERE e.task_id=t.id)
  ORDER BY t.deadline,t.id LIMIT 50`,localDay(current),settings.enabledAt);
 for(const task of candidates){
  if(!validDay(task.deadline)||boundary(task.deadline)>current)continue;
  const recordId=id(),deadline=addDay(task.deadline);
  const result=await env.DB.batch([
   env.DB.prepare(`INSERT OR IGNORE INTO deadline_extension_records(id,task_id,assignee_id,leader_id,original_deadline,extended_deadline,created_at)
    SELECT ?,t.id,t.assignee_id,t.leader_id,t.deadline,?,? FROM tasks t JOIN users a ON a.id=t.assignee_id
    WHERE t.id=? AND t.deadline=? AND t.status IN ${ACTIVE} AND a.status IN ${MEMBERS}
    AND EXISTS(SELECT 1 FROM app_settings WHERE key='deadline_policy_enabled_at' AND value=?)`).bind(recordId,deadline,current,task.id,task.deadline,settings.settingValue),
   env.DB.prepare(`UPDATE tasks SET deadline=?,updated_at=? WHERE id=? AND deadline=? AND status IN ${ACTIVE}
    AND EXISTS(SELECT 1 FROM deadline_extension_records e WHERE e.id=? AND e.task_id=tasks.id AND e.assignee_id=tasks.assignee_id AND e.leader_id=tasks.leader_id)`).bind(deadline,current,task.id,task.deadline,recordId),
   ...eventStatements(env,recordId,'deadline_grace_granted',current,settings)
  ]);
  extended+=result[0].meta?.changes||0;queued+=result[3].meta?.changes||0;
 }
 // Recovery deliberately selects missing event keys before its limit, so old
 // sent/blocked rows cannot hide later work. Current roles determine access.
 const result=await env.DB.batch([
  env.DB.prepare(`UPDATE deadline_extension_records AS e SET escalated_at=? WHERE e.escalated_at IS NULL AND e.created_at>=?
   AND e.extended_deadline<? AND date(e.extended_deadline,'+0 days')=e.extended_deadline
   AND EXISTS(SELECT 1 FROM tasks t JOIN users a ON a.id=t.assignee_id WHERE t.id=e.task_id AND t.deadline=e.extended_deadline AND t.status IN ${ACTIVE} AND a.status IN ${MEMBERS})
   AND EXISTS(SELECT 1 FROM app_settings WHERE key='deadline_policy_enabled_at' AND value=?)`).bind(current,settings.enabledAt,localDay(current),settings.settingValue),
  ...eventStatements(env,null,'deadline_grace_granted',current,settings),
  ...eventStatements(env,null,'deadline_grace_missed',current,settings)
 ]);
 escalated=result[0].meta?.changes||0;queued+=(result[2].meta?.changes||0)+(result[4].meta?.changes||0);
 return {enabled:true,enabled_at:settings.enabledAt,timezone:'Asia/Kolkata',grace_days:1,extended,escalated,queued};
}

// The shared dispatcher invokes this before claiming and again before provider
// I/O. No descriptions, deliverables, submissions or freeform notes are read.
export async function renderDeadlinePolicyEmail(env,job,person,current){
 if(!DEADLINE_EMAIL_KINDS.includes(job.kind))return {skip:'Unsupported deadline email type.'};
 const settings=await config(env,current);if(!settings)return {skip:'The deadline policy is not active.'};
 const item=await one(env,`SELECT e.*,t.title,t.status,t.deadline,t.assignee_id AS current_assignee_id,t.leader_id AS current_leader_id,t.department,a.name AS assignee_name
  FROM deadline_extension_records e JOIN tasks t ON t.id=e.task_id JOIN users a ON a.id=t.assignee_id WHERE e.id=? AND a.status IN ${MEMBERS}`,job.entity_id);
 if(!item||item.created_at<settings.enabledAt||!['todo','working','revision'].includes(item.status)||item.deadline!==item.extended_deadline)return {skip:'The task deadline or work stage changed.'};
 const grant=job.kind==='deadline_grace_granted';
 if(grant){
  if(item.escalated_at||person.id!==item.assignee_id||person.id!==item.current_assignee_id||job.source_at!==item.created_at||boundary(item.extended_deadline)<=current)return {skip:'The extra-day notice is no longer current.'};
 }else{
  if(!item.escalated_at||item.escalated_at!==job.source_at||boundary(item.extended_deadline)>current)return {skip:'The extended deadline has not been missed.'};
  const authorized=await one(env,`SELECT u.id FROM users u JOIN tasks t ON t.id=? WHERE u.id=? AND u.status IN ${MEMBERS} AND ${escalationRecipient()}`,item.task_id,person.id);
  if(!authorized)return {skip:'This account no longer has access to the missed-deadline notice.'};
 }
 const dates=`Original deadline: ${item.original_deadline}\nExtra time granted: 1 calendar day\nExtended deadline: ${item.extended_deadline}\nDeadlines end at 11:59:59 pm, Asia/Kolkata (IST).`;
 return {subject:grant?'TEL OS | One extra day for your missed deadline':'TEL OS | Missed deadline after one extra day',text:`${grant?'Your task missed its original deadline. One extra calendar day has been granted automatically.':'This task is still unfinished after the one extra calendar day. The assignee, current reviewer, HR and current Marketing head are being notified.'}\n\nTask: ${clean(item.title)}\nAssigned to: ${clean(item.assignee_name,100)}\nDepartment: ${clean(item.department,60)}\n${dates}\n\n${grant?'Submit your deliverable before the extended deadline.':'Open the task to review its status and arrange the next steps.'}\nOpen My tasks: https://tel-os-team-v2.xtremedivyangshu.workers.dev/#tasks`,route:'tasks'};
}

export async function listDeadlineExtensions(env,user,taskId=null){
 if(!await deadlinePolicyReady(env))return [];
 const all=['founder','hr_lead','hr_member'].includes(user.role);
 const lead=['founder','hr_lead','team_lead','finance_head'].includes(user.role);
 const marketing=user.role==='team_lead'&&user.department==='Marketing';
 return rows(env,`SELECT e.id,e.task_id,e.assignee_id,e.leader_id,e.original_deadline,e.extended_deadline,e.extra_days,e.created_at,e.escalated_at,
  t.title AS task_title,t.status AS task_status,t.department,t.deadline AS current_deadline,t.assignee_id AS current_assignee_id,t.leader_id AS current_leader_id,
  a.name AS assignee_name,l.name AS leader_name
  FROM deadline_extension_records e JOIN tasks t ON t.id=e.task_id JOIN users a ON a.id=t.assignee_id JOIN users l ON l.id=t.leader_id
  WHERE (?=1 OR t.assignee_id=? OR (?=1 AND t.leader_id=? AND t.department=?) OR (?=1 AND t.department='Marketing' AND e.escalated_at IS NOT NULL)) ${taskId?'AND t.id=?':''}
  ORDER BY e.created_at DESC,e.id LIMIT 500`,all?1:0,user.id,lead?1:0,user.id,user.department,marketing?1:0,...(taskId?[taskId]:[]));
}
export async function handleDeadlinePolicy({request,url,env,user}){
 const task=url.pathname.match(/^\/api\/tasks\/([^/]+)\/deadline-policy$/);
 if(url.pathname!=='/api/deadline-policy'&&!task)return null;
 if(!user)fail(401,'Sign in to TEL OS.');
 if(!['active','on_leave'].includes(user.status))fail(403,'This account cannot view deadline records.');
 if(request.method!=='GET')fail(405,'Deadline records are read only.');
 if(task){
  const item=await one(env,'SELECT assignee_id,leader_id,department FROM tasks WHERE id=?',task[1]);if(!item)fail(404,'Task not found.');
  const assignedReviewer=item.leader_id===user.id&&['founder','hr_lead','team_lead','finance_head'].includes(user.role)&&(user.role==='founder'||item.department===user.department);
  if(!['founder','hr_lead','hr_member'].includes(user.role)&&item.assignee_id!==user.id&&!assignedReviewer){
   const marketing=user.role==='team_lead'&&user.department==='Marketing'&&item.department==='Marketing';
   if(!marketing||!await deadlinePolicyReady(env)||!await one(env,'SELECT id FROM deadline_extension_records WHERE task_id=? AND escalated_at IS NOT NULL',task[1]))fail(403,'Deadline records are private to authorised task participants.');
  }
 }
 const settings=await config(env,stamp());
 return json({enabled:!!settings,enabled_at:settings?.enabledAt||null,timezone:'Asia/Kolkata',grace_days:1,extensions:await listDeadlineExtensions(env,user,task?.[1])});
}
