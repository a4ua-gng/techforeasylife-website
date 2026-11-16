import {rows,one,run,id} from './core.js';
import {DEADLINE_EMAIL_KINDS,deadlinePolicyReady,renderDeadlinePolicyEmail} from './deadline-policy.js';

const BASE='https://tel-os-team-v2.xtremedivyangshu.workers.dev/';
const OPS='techforeasylife.operations@gmail.com';
const MINUTE=60000, REMINDER_WINDOW=5*MINUTE, DAILY_WINDOW=15;
const DELIVERY_BUDGET=24000, PROVIDER_TIMEOUT=8000, MAX_JOBS=30;
const URGENT_KIND='urgent_task_assigned';
const KINDS=['daily_tasks','meeting_invitation','meeting_reminder','task_transfer_requested','task_transfer_approved',URGENT_KIND,...DEADLINE_EMAIL_KINDS];
// Only this finite mapping may select a table; kinds never become SQL identifiers.
const jobTable=kind=>kind===URGENT_KIND?'urgent_task_email_jobs':DEADLINE_EMAIL_KINDS.includes(kind)?'deadline_email_jobs':KINDS.includes(kind)?'operational_email_jobs':null;
const stamp=value=>new Date(value??Date.now()).toISOString();
const localDay=value=>new Date(Date.parse(value)+330*MINUTE).toISOString().slice(0,10);
const localMinutes=value=>{const date=new Date(Date.parse(value)+330*MINUTE);return date.getUTCHours()*60+date.getUTCMinutes();};
const nextDay=value=>new Date(Date.parse(localDay(value)+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const clean=(value,max=120)=>Array.from(String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim()).slice(0,max).join('');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function address(value){if(typeof value!=='string'||value.length>254||/[\s<>"'\\,;:\[\]()\x00-\x1f\x7f]/.test(value))return null;const email=value.toLowerCase();if(!/^[a-z0-9.!#$%&*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)||email.startsWith('.')||email.split('@')[0].endsWith('.')||email.split('@')[0].includes('..'))return null;return email;}
function callURL(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}}
function participants(meeting){try{const list=JSON.parse(meeting.participants_json);return Array.isArray(list)?[...new Set(list.filter(x=>typeof x==='string'&&x.length<=100))].slice(0,100):[];}catch{return [];}}
function time(value){return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+' IST';}
function enabled(env){return env.TEL_OS_OPERATIONAL_EMAILS==='enabled';}
export function operationalEmailReady(env){return enabled(env)&&typeof env.RESEND_API_KEY==='string'&&env.RESEND_API_KEY.length>10&&!!address(env.TEL_OS_WORK_SENDER_EMAIL);}
async function config(env){
 if(!enabled(env))return null;
 const entries=await rows(env,"SELECT key,value FROM app_settings WHERE key IN ('operational_email_enabled_at','operational_email_daily_start_date','operational_email_daily_time','urgent_task_email_enabled_at')"),settings=Object.fromEntries(entries.map(x=>[x.key,x.value]));
 if(!Number.isFinite(Date.parse(settings.operational_email_enabled_at)))return null;
 const daily=/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(settings.operational_email_daily_time||'')?settings.operational_email_daily_time:'09:00';
 // Never send a daily backfill on the activation day, even if a stale setting is supplied.
 return {enabledAt:settings.operational_email_enabled_at,urgentEnabledAt:Number.isFinite(Date.parse(settings.urgent_task_email_enabled_at))?stamp(settings.urgent_task_email_enabled_at):null,dailyStart:/^\d{4}-\d{2}-\d{2}$/.test(settings.operational_email_daily_start_date||'')&&settings.operational_email_daily_start_date>nextDay(settings.operational_email_enabled_at)?settings.operational_email_daily_start_date:nextDay(settings.operational_email_enabled_at),dailyTime:daily,dailyMinutes:Number(daily.slice(0,2))*60+Number(daily.slice(3))};
}
function jobStatement(env,job,created){return env.DB.prepare(`INSERT OR IGNORE INTO operational_email_jobs(id,event_key,user_id,kind,entity_id,source_at,scheduled_at,status,created_at,error) SELECT ?,?,?,?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM member_connections c WHERE c.user_id=u.id AND c.provider='gmail' AND c.status='verified' AND c.verified_at IS NOT NULL AND c.verified_at<>'') THEN ? ELSE 'blocked' END,?,? FROM users u WHERE u.id=? AND u.status IN ('active','on_leave')`).bind(id(),job.key,job.userId,job.kind,job.entityId,job.sourceAt,job.scheduledAt,job.status||'queued',created,job.error||'',job.userId);}
async function insertJobs(env,jobs,created){let inserted=0;for(let offset=0;offset<jobs.length;offset+=20){const result=await env.DB.batch(jobs.slice(offset,offset+20).map(job=>jobStatement(env,job,created)));inserted+=result.reduce((sum,r)=>sum+(r.meta?.changes||0),0);}return inserted;}

// Persist first. Request handlers dispatch only the selected types with ctx.waitUntil.
export async function queueOperationalMeeting(env,meeting,event='scheduled',options={}){
 const settings=await config(env);if(!settings)return {queued:0};
 const current=stamp(options.now);if(settings.enabledAt>current||!meeting||!Number.isFinite(Date.parse(meeting.starts_at))||meeting.starts_at<=current)return {queued:0};
 const people=participants(meeting);if(!people.length)return {queued:0};
 const jobs=[],due=new Date(Date.parse(meeting.starts_at)-60*MINUTE).toISOString();
 for(const userId of people){
  if(meeting.created_at>=settings.enabledAt)jobs.push({key:`meeting_invitation:${meeting.id}:${meeting.starts_at}:${userId}`,userId,kind:'meeting_invitation',entityId:meeting.id,sourceAt:meeting.starts_at,scheduledAt:current});
  if(meeting.starts_at>=settings.enabledAt)jobs.push({key:`meeting_reminder:${meeting.id}:${meeting.starts_at}:${userId}`,userId,kind:'meeting_reminder',entityId:meeting.id,sourceAt:meeting.starts_at,scheduledAt:due});
 }
 const queued=await insertJobs(env,jobs,current);
 // Less than an hour's notice is included in the immediate invitation.
 if(meeting.created_at>=settings.enabledAt&&meeting.created_at>=due)await run(env,"UPDATE operational_email_jobs SET status='skipped',error='One-hour notice is included in the immediate invitation.' WHERE kind='meeting_reminder' AND entity_id=? AND source_at=? AND status IN ('queued','blocked')",meeting.id,meeting.starts_at);
 return {queued};
}
async function transferTableExists(env){return !!await one(env,"SELECT name FROM sqlite_master WHERE type='table' AND name='task_handover_requests'");}
async function urgentTableExists(env){return !!await one(env,"SELECT name FROM sqlite_master WHERE type='table' AND name='urgent_task_email_jobs'");}

// The initial assignment is distinct from an approved handover, whose existing
// transfer-approved email carries the urgency. Never recreate its initial notice.
async function urgentAssignmentSQL(env){return await transferTableExists(env)?"AND NOT EXISTS(SELECT 1 FROM task_handover_requests r WHERE r.task_id=t.id AND r.status='approved')":'';}
export async function queueUrgentTaskEmail(env,taskId,options={}){
 const settings=await config(env),current=stamp(options.now);
 if(!settings?.urgentEnabledAt||settings.enabledAt>current||settings.urgentEnabledAt>current||!await urgentTableExists(env))return {queued:0};
 const handover=await urgentAssignmentSQL(env);
 const result=await run(env,`INSERT OR IGNORE INTO urgent_task_email_jobs(id,event_key,user_id,kind,entity_id,source_at,scheduled_at,status,created_at)
  SELECT ?,?||':'||t.id||':'||t.created_at||':'||t.assignee_id,t.assignee_id,?,t.id,t.created_at,?,
  CASE WHEN EXISTS(SELECT 1 FROM member_connections c WHERE c.user_id=u.id AND c.provider='gmail' AND c.status='verified' AND c.verified_at IS NOT NULL AND c.verified_at<>'') THEN 'queued' ELSE 'blocked' END,?
  FROM tasks t JOIN users u ON u.id=t.assignee_id WHERE t.id=? AND t.priority='urgent' AND t.status<>'done' AND t.created_at>=? AND t.created_at<=? AND u.status IN ('active','on_leave') ${handover}`,
  id(),URGENT_KIND,URGENT_KIND,current,current,taskId,settings.urgentEnabledAt,current);
 return {queued:result.meta?.changes||0};
}
export async function queueTaskTransferEmails(env,requestId,event,options={}){
 const settings=await config(env);if(!settings||!['requested','approved'].includes(event)||!await transferTableExists(env))return {queued:0};
 const transfer=await one(env,'SELECT id,task_id,from_user_id,to_user_id,reviewer_id,status,created_at,decided_at FROM task_handover_requests WHERE id=?',requestId);if(!transfer)return {queued:0};
 const current=stamp(options.now),sourceAt=event==='requested'?transfer.created_at:transfer.decided_at;
 if(settings.enabledAt>current||!sourceAt||sourceAt<settings.enabledAt||(event==='requested'?transfer.status!=='pending':transfer.status!=='approved'))return {queued:0};
 const userId=event==='requested'?transfer.reviewer_id:transfer.to_user_id,kind='task_transfer_'+event;
 return {queued:await insertJobs(env,[{key:`${kind}:${transfer.id}:${userId}`,userId,kind,entityId:transfer.id,sourceAt,scheduledAt:current}],current)};
}

async function taskDay(env,userId,date){
 if(await one(env,`SELECT 1 AS excluded WHERE EXISTS(SELECT 1 FROM leave_requests WHERE user_id=? AND status='approved' AND start_date<=? AND end_date>=?) OR EXISTS(SELECT 1 FROM availability WHERE user_id=? AND kind IN ('exam','unavailable') AND start_date<=? AND end_date>=?) OR EXISTS(SELECT 1 FROM work_holidays WHERE date=?)`,userId,date,date,userId,date,date,date))return false;
 const schedule=await one(env,'SELECT enabled,weekdays_json FROM work_schedules WHERE user_id=? AND effective_date<=? ORDER BY effective_date DESC LIMIT 1',userId,date)||await one(env,"SELECT enabled,weekdays_json FROM attendance_policy WHERE id='company' AND effective_date<=?",date);
 if(!schedule)return true;if(!schedule.enabled)return false;
 try{const days=JSON.parse(schedule.weekdays_json);return Array.isArray(days)&&days.includes(new Date(date+'T00:00:00Z').getUTCDay());}catch{return false;}
}
async function queueDailyPlans(env,settings,current){
 const date=localDay(current),minutes=localMinutes(current);if(date<settings.dailyStart||minutes<settings.dailyMinutes||minutes>=settings.dailyMinutes+DAILY_WINDOW)return 0;
 // Exclude existing keys so a bounded scan continues with the next employees each minute.
 const weekday=new Date(date+'T00:00:00Z').getUTCDay();
 const candidates=await rows(env,`SELECT u.id FROM users u WHERE u.status='active' AND EXISTS(SELECT 1 FROM tasks t WHERE t.assignee_id=u.id AND t.status<>'done') AND NOT EXISTS(SELECT 1 FROM operational_email_jobs j WHERE j.event_key='daily_tasks:'||?||':'||u.id)
 AND NOT EXISTS(SELECT 1 FROM leave_requests l WHERE l.user_id=u.id AND l.status='approved' AND l.start_date<=? AND l.end_date>=?)
 AND NOT EXISTS(SELECT 1 FROM availability a WHERE a.user_id=u.id AND a.kind IN ('exam','unavailable') AND a.start_date<=? AND a.end_date>=?)
 AND NOT EXISTS(SELECT 1 FROM work_holidays h WHERE h.date=?)
 AND COALESCE((SELECT w.enabled FROM work_schedules w WHERE w.user_id=u.id AND w.effective_date<=? ORDER BY w.effective_date DESC LIMIT 1),(SELECT p.enabled FROM attendance_policy p WHERE p.id='company' AND p.effective_date<=?),1)=1
 AND EXISTS(SELECT 1 FROM json_each(COALESCE((SELECT w.weekdays_json FROM work_schedules w WHERE w.user_id=u.id AND w.effective_date<=? ORDER BY w.effective_date DESC LIMIT 1),(SELECT p.weekdays_json FROM attendance_policy p WHERE p.id='company' AND p.effective_date<=?),'[0,1,2,3,4,5,6]')) d WHERE d.value=?)
 ORDER BY u.id LIMIT 100`,date,date,date,date,date,date,date,date,date,date,weekday),jobs=[];
 for(const person of candidates)jobs.push({key:`daily_tasks:${date}:${person.id}`,userId:person.id,kind:'daily_tasks',entityId:date,sourceAt:date,scheduledAt:new Date(date+'T'+settings.dailyTime+':00+05:30').toISOString()});
 const inserted=await insertJobs(env,jobs,current);
 await run(env,`INSERT OR IGNORE INTO notifications(id,user_id,title,body,link,created_at,dedupe_key) SELECT lower(hex(randomblob(16))),j.user_id,'Your daily task plan','Your assignments are ready to review in My tasks.','tasks',?,'daily-task-plan:'||j.entity_id||':'||j.user_id FROM operational_email_jobs j JOIN users u ON u.id=j.user_id WHERE j.kind='daily_tasks' AND j.entity_id=? AND u.status='active' AND j.status IN ('queued','blocked')`,current,date);
 return inserted;
}
async function collectMeetingNotices(env,settings,current){
 // Select missing keys before applying a limit so every future meeting is eventually scanned.
 // Existing meetings receive one-hour notices, while only post-cutover assignments get invitations.
 let inserted=0;
 for(const kind of ['meeting_invitation','meeting_reminder']){
  const invitation=kind==='meeting_invitation',due="strftime('%Y-%m-%dT%H:%M:%fZ',m.starts_at,'-1 hour')",short=!invitation?`m.created_at>=? AND m.created_at>=${due}`:'0';
  const statement=`INSERT OR IGNORE INTO operational_email_jobs(id,event_key,user_id,kind,entity_id,source_at,scheduled_at,status,created_at)
   SELECT lower(hex(randomblob(16))),?||':'||m.id||':'||m.starts_at||':'||u.id,u.id,?,m.id,m.starts_at,${invitation?'?':due},
   CASE WHEN ${short} THEN 'skipped' WHEN EXISTS(SELECT 1 FROM member_connections c WHERE c.user_id=u.id AND c.provider='gmail' AND c.status='verified' AND c.verified_at IS NOT NULL AND c.verified_at<>'') THEN 'queued' ELSE 'blocked' END,?
   FROM meetings m JOIN json_each(CASE WHEN json_valid(m.participants_json) THEN CASE WHEN json_type(m.participants_json)='array' THEN m.participants_json ELSE '[]' END ELSE '[]' END) p JOIN users u ON u.id=p.value
   WHERE m.starts_at>? AND m.starts_at>=? AND u.status IN ('active','on_leave') ${invitation?'AND m.created_at>=?':''}
   AND NOT EXISTS(SELECT 1 FROM operational_email_jobs j WHERE j.event_key=?||':'||m.id||':'||m.starts_at||':'||u.id)
   ORDER BY m.starts_at,m.id,u.id LIMIT 500`;
  const params=[kind,kind,...(invitation?[current]:[settings.enabledAt]),current,current,settings.enabledAt,...(invitation?[settings.enabledAt]:[]),kind];
  inserted+=(await run(env,statement,...params)).meta?.changes||0;
 }
 const oldest=new Date(Date.parse(current)-REMINDER_WINDOW).toISOString();
 await run(env,`INSERT OR IGNORE INTO notifications(id,user_id,title,body,link,created_at,dedupe_key) SELECT lower(hex(randomblob(16))),j.user_id,'Meeting in one hour','Your scheduled meeting is coming up. Open Meetings for the time and call details.','meetings',?,'meeting-one-hour:'||m.id||':'||m.starts_at||':'||j.user_id FROM operational_email_jobs j JOIN meetings m ON m.id=j.entity_id JOIN users u ON u.id=j.user_id WHERE j.kind='meeting_reminder' AND j.status<>'skipped' AND j.scheduled_at>=? AND j.scheduled_at<=? AND j.source_at=m.starts_at AND m.starts_at>? AND u.status IN ('active','on_leave') AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(m.participants_json) THEN m.participants_json ELSE '[]' END) p WHERE p.value=j.user_id)`,current,oldest,current,current);
 return inserted;
}
async function recoverTransfers(env,settings,current){
 if(!await transferTableExists(env))return 0;
 const transfers=await rows(env,"SELECT r.id,r.status FROM task_handover_requests r WHERE ((r.status='pending' AND r.created_at>=?) OR (r.status='approved' AND r.decided_at>=?)) AND NOT EXISTS(SELECT 1 FROM operational_email_jobs j WHERE j.entity_id=r.id AND j.kind=CASE WHEN r.status='pending' THEN 'task_transfer_requested' ELSE 'task_transfer_approved' END) ORDER BY r.created_at LIMIT 100",settings.enabledAt,settings.enabledAt);let inserted=0;
 for(const transfer of transfers)inserted+=(await queueTaskTransferEmails(env,transfer.id,transfer.status==='pending'?'requested':'approved',{now:current})).queued;
 return inserted;
}
async function recoverUrgentTasks(env,settings,current){
 if(!settings.urgentEnabledAt||settings.urgentEnabledAt>current||!await urgentTableExists(env))return 0;
 const handover=await urgentAssignmentSQL(env);
 const result=await run(env,`INSERT OR IGNORE INTO urgent_task_email_jobs(id,event_key,user_id,kind,entity_id,source_at,scheduled_at,status,created_at)
  SELECT lower(hex(randomblob(16))),?||':'||t.id||':'||t.created_at||':'||t.assignee_id,t.assignee_id,?,t.id,t.created_at,?,
  CASE WHEN EXISTS(SELECT 1 FROM member_connections c WHERE c.user_id=u.id AND c.provider='gmail' AND c.status='verified' AND c.verified_at IS NOT NULL AND c.verified_at<>'') THEN 'queued' ELSE 'blocked' END,?
  FROM tasks t JOIN users u ON u.id=t.assignee_id WHERE t.priority='urgent' AND t.status<>'done' AND t.created_at>=? AND t.created_at<=? AND u.status IN ('active','on_leave') ${handover}
  AND NOT EXISTS(SELECT 1 FROM urgent_task_email_jobs j WHERE j.event_key=?||':'||t.id||':'||t.created_at||':'||t.assignee_id)
  ORDER BY t.created_at,t.id LIMIT 100`,URGENT_KIND,URGENT_KIND,current,current,settings.urgentEnabledAt,current,URGENT_KIND);
 return result.meta?.changes||0;
}
async function recipient(env,userId,current){
 const person=await one(env,`SELECT u.id,u.name,u.department,u.role,u.status,c.account,c.verified_at FROM users u JOIN member_connections c ON c.user_id=u.id AND c.provider='gmail' AND c.status='verified' WHERE u.id=? AND u.status IN ('active','on_leave') AND NOT EXISTS(SELECT 1 FROM member_connections other JOIN users other_user ON other_user.id=other.user_id WHERE other.provider='gmail' AND other.status='verified' AND lower(trim(other.account))=lower(trim(c.account)) AND other.user_id<>u.id AND other_user.status IN ('active','on_leave'))`,userId);
 return person&&address(person.account)&&Number.isFinite(Date.parse(person.verified_at))&&person.verified_at<=current?{...person,email:address(person.account)}:null;
}
const statusLabel=status=>({todo:'Not started',working:'In progress',review:'Awaiting review',revision:'Changes requested',approved:'Approved; ready to close',done:'Completed'}[status]||'Open');
const nextAction=status=>({todo:'Open the task and start work.',working:'Continue your work and submit the result when ready.',review:'Your submitted work is waiting for review.',revision:'Open the task to review the requested changes.',approved:'Open the task and mark it done when complete.'}[status]||'Open the task for its current details.');
function taskLine(task){return `${clean(task.title)}\nPriority: ${clean(task.priority,20)} | Deadline: ${clean(task.deadline,20)} | Status: ${statusLabel(task.status)}\n${nextAction(task.status)}`;}
async function renderJob(env,job,person,settings,current){
 if(DEADLINE_EMAIL_KINDS.includes(job.kind))return renderDeadlinePolicyEmail(env,job,person,current);
 if(job.kind===URGENT_KIND){
  if(!settings.urgentEnabledAt||settings.urgentEnabledAt>current||job.source_at<settings.urgentEnabledAt)return {skip:'This assignment predates urgent-task email activation.'};
  const task=await one(env,'SELECT id,title,priority,deadline,status,assignee_id,created_at FROM tasks WHERE id=?',job.entity_id);
  if(!task||task.priority!=='urgent'||task.status==='done'||task.assignee_id!==person.id||task.created_at!==job.source_at)return {skip:'The urgent task or current assignment changed.'};
  if(await transferTableExists(env)&&await one(env,"SELECT id FROM task_handover_requests WHERE task_id=? AND status='approved' LIMIT 1",task.id))return {skip:'An approved transfer supplies this task assignment notice.'};
  return {subject:'TEL OS | URGENT task assigned',text:`An URGENT task has been assigned to you. Review its deadline and start work as soon as possible.\n\n${taskLine(task)}\n\nOpen My tasks: ${BASE}#tasks`,route:'tasks'};
 }
 if(job.kind==='daily_tasks'){
  if(person.status!=='active'||job.entity_id!==localDay(current)||job.entity_id<settings.dailyStart||localMinutes(current)<settings.dailyMinutes||localMinutes(current)>=settings.dailyMinutes+DAILY_WINDOW||!await taskDay(env,person.id,job.entity_id))return {skip:'The daily task-summary window or work day no longer applies.'};
  const tasks=await rows(env,"SELECT id,title,priority,deadline,status FROM tasks WHERE assignee_id=? AND status<>'done' ORDER BY CASE WHEN priority='urgent' THEN 0 WHEN deadline<? THEN 1 WHEN priority='high' THEN 2 ELSE 3 END,deadline,id LIMIT 51",person.id,job.entity_id);
  if(!tasks.length)return {skip:'No unfinished tasks remain.'};const extra=tasks.length>50;
  return {subject:`TEL OS | Your task plan for ${job.entity_id}`,text:`Your daily task plan\n${tasks.slice(0,50).map(taskLine).join('\n\n')}${extra?'\n\nMore assigned tasks are available in TEL OS.':''}\n\nOpen My tasks: ${BASE}#tasks`,route:'tasks'};
 }
 if(job.kind.startsWith('meeting_')){
  const meeting=await one(env,'SELECT id,title,starts_at,call_url,participants_json,created_at FROM meetings WHERE id=?',job.entity_id);
  if(!meeting||meeting.starts_at!==job.source_at||meeting.starts_at<=current||!participants(meeting).includes(person.id))return {skip:'The meeting or participant assignment changed.'};
  if(job.kind==='meeting_invitation'&&meeting.created_at<settings.enabledAt)return {skip:'This invitation predates the notification cutover.'};
  if(job.kind==='meeting_reminder'&&(Date.parse(current)-Date.parse(job.scheduled_at)>REMINDER_WINDOW||current<job.scheduled_at))return {skip:'The one-hour reminder window ended.'};
  if(job.kind==='meeting_reminder'){const invite=await one(env,"SELECT status,sent_at FROM operational_email_jobs WHERE kind='meeting_invitation' AND entity_id=? AND user_id=? AND source_at=?",meeting.id,person.id,meeting.starts_at);if(invite?.status==='sent'&&invite.sent_at>=job.scheduled_at)return {skip:'Included in the recent invitation.'};}
  const invitation=job.kind==='meeting_invitation',soon=Date.parse(meeting.starts_at)-Date.parse(current)<=60*MINUTE,url=callURL(meeting.call_url);
  return {subject:invitation?'TEL OS | Meeting invitation':'TEL OS | Meeting in one hour',text:`${invitation?'You have been assigned a meeting.':'Your meeting starts in about one hour.'}\nMeeting: ${clean(meeting.title)}\nWhen: ${time(meeting.starts_at)}${invitation&&soon?'\nThis meeting starts within the next hour; this invitation also serves as your reminder.':''}${url?'\nCall link: '+url:''}\n\nOpen Meetings: ${BASE}#meetings`,route:'meetings'};
 }
 if(job.kind.startsWith('task_transfer_')){
  if(!await transferTableExists(env))return {skip:'The task transfer no longer exists.'};
  const request=await one(env,`SELECT r.id,r.task_id,r.from_user_id,r.to_user_id,r.reviewer_id,r.status,r.created_at,r.decided_at,t.assignee_id,t.leader_id,t.title,t.priority,t.deadline,t.status AS task_status FROM task_handover_requests r JOIN tasks t ON t.id=r.task_id WHERE r.id=?`,job.entity_id);
  if(!request||request.task_status==='done')return {skip:'The task transfer is no longer actionable.'};const pending=job.kind==='task_transfer_requested';
  if(pending?(request.status!=='pending'||request.reviewer_id!==person.id||request.leader_id!==person.id||request.assignee_id!==request.from_user_id||request.created_at!==job.source_at):(request.status!=='approved'||request.to_user_id!==person.id||request.assignee_id!==person.id||request.decided_at!==job.source_at))return {skip:'The task transfer or task owner changed.'};
  const task={title:request.title,priority:request.priority,deadline:request.deadline,status:request.task_status};
  const urgent=!pending&&request.priority==='urgent';
  return {subject:pending?'TEL OS | Task transfer needs your approval':urgent?'TEL OS | URGENT task transfer approved':'TEL OS | A task transfer to you was approved',text:`${pending?'A task transfer requires your approval as the assigned reviewer. Open My tasks to approve or reject it.':urgent?'Your assigned reviewer approved an URGENT task transfer to you. This task is now assigned to your account. Review its deadline and start work as soon as possible.':'Your assigned reviewer approved a task transfer to you. This task is now assigned to your account.'}\n\n${taskLine(task)}\n\nOpen My tasks: ${BASE}#tasks`,route:'tasks'};
 }
 return {skip:'Unsupported email type.'};
}
async function markSkip(env,job,message){await run(env,`UPDATE ${jobTable(job.kind)} SET status='skipped',error=? WHERE id=? AND status IN ('queued','blocked','sending')`,message,job.id);return 'skipped';}
function retryDelay(response,attempt,wallNow){const header=response.headers.get('Retry-After'),seconds=Number(header);const provided=header?(Number.isFinite(seconds)?seconds*1000:Date.parse(header)-wallNow):0;return Math.min(15*MINUTE,Math.max(30*1000,30*1000*2**Math.min(attempt-1,5),provided||0));}
async function sendJob(env,job,settings,clock,gateToken){
 const table=jobTable(job.kind);if(!table)return 'unclaimed';
 let current=clock.now();const person=await recipient(env,job.user_id,current);
 if(!person){await run(env,`UPDATE ${table} SET status='blocked',error='Verify a unique current notification email before delivery.' WHERE id=? AND status IN ('queued','blocked')`,job.id);return 'blocked';}
 const preview=await renderJob(env,job,person,settings,current);if(preview.skip)return markSkip(env,job,preview.skip);
 const claimed=await run(env,`UPDATE ${table} SET status='sending',recipient=?,claimed_at=?,error='' WHERE id=? AND status IN ('queued','blocked') AND scheduled_at<=? AND next_attempt_at<=? AND EXISTS(SELECT 1 FROM users u JOIN member_connections c ON c.user_id=u.id WHERE u.id=${table}.user_id AND u.status IN ('active','on_leave') AND c.provider='gmail' AND c.status='verified' AND c.verified_at IS NOT NULL AND c.verified_at<>'' AND lower(c.account)=? AND NOT EXISTS(SELECT 1 FROM member_connections other JOIN users ou ON ou.id=other.user_id WHERE other.provider='gmail' AND other.status='verified' AND other.user_id<>u.id AND lower(trim(other.account))=lower(trim(c.account)) AND ou.status IN ('active','on_leave')))`,person.email,current,job.id,current,current,person.email);
 if(!claimed.meta?.changes)return 'unclaimed';
 let confirmed='',attempt=job.attempts+1,providerStarted=false;
 try{
  // Re-read both the verified account and live work immediately before provider I/O.
  current=clock.now();const checked=await recipient(env,person.id,current);
  if(!checked||checked.email!==person.email)return await markSkip(env,job,'Recipient verification changed before sending.');
  const content=await renderJob(env,job,checked,settings,current);if(content.skip)return await markSkip(env,job,content.skip);
  if(!await reserveRateSlot(env,gateToken,clock)){await run(env,`UPDATE ${table} SET status='queued',claimed_at=NULL,error='' WHERE id=? AND status='sending'`,job.id);return 'deferred';}
  // Waiting for a rate slot can cross a meeting start or change an assignment.
  current=clock.now();const finalPerson=await recipient(env,person.id,current);
  if(!finalPerson||finalPerson.email!==person.email)return await markSkip(env,job,'Recipient verification changed before sending.');
  const finalContent=await renderJob(env,job,finalPerson,settings,current);if(finalContent.skip)return await markSkip(env,job,finalContent.skip);
  await run(env,`UPDATE ${table} SET attempts=attempts+1 WHERE id=? AND status='sending'`,job.id);
  if(clock.remaining()<PROVIDER_TIMEOUT+500){await run(env,`UPDATE ${table} SET status='queued',attempts=MAX(0,attempts-1),claimed_at=NULL,error='' WHERE id=? AND status='sending'`,job.id);return 'deferred';}
  const text=`TEL OPERATIONS\nEmployee: ${clean(finalPerson.name,100)}\nDepartment: ${clean(finalPerson.department,60)}\n\n${finalContent.text}\n\nThis is an automated TEL OS work notification.`,html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(finalContent.subject)}</title></head><body style="margin:0;background:#f6f5fa;color:#17131f;font-family:Arial,sans-serif"><main style="max-width:600px;margin:24px auto;padding:24px;background:#fff;border:1px solid #ded8e9;border-radius:14px"><p style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#655078">TEL OPERATIONS</p><p>Hello ${escape(clean(finalPerson.name,100))},</p><div style="white-space:pre-wrap;line-height:1.7">${escape(finalContent.text)}</div><p style="margin-top:24px"><a style="display:inline-block;padding:12px 18px;border-radius:9px;background:#392452;color:white;text-decoration:none" href="${BASE}#${finalContent.route}">Open TEL OS</a></p><p style="font-size:12px;color:#625a6c">This is an automated TEL OS work notification.</p></main></body></html>`;
  providerStarted=true;
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'tel-operational-'+job.id},signal:AbortSignal.timeout(PROVIDER_TIMEOUT),body:JSON.stringify({from:'TEL Operations <'+address(env.TEL_OS_WORK_SENDER_EMAIL)+'>',to:[person.email],reply_to:OPS,subject:finalContent.subject,text,html})});
  // A confirmed 429 means Resend refused this attempt; this is the sole automatic retry.
  if(response.status===429){const delay=retryDelay(response,attempt,Date.now()),retryAt=stamp(Date.parse(clock.now())+delay);await run(env,`UPDATE ${table} SET status=?,next_attempt_at=?,claimed_at=NULL,error='Email provider rate limited this attempt; safely waiting to retry.' WHERE id=? AND status='sending'`,attempt>=8?'needs_review':'queued',retryAt,job.id);await run(env,'UPDATE operational_email_delivery_gate SET next_send_at=MAX(next_send_at,?) WHERE singleton=1 AND lease_token=?',Date.now()+delay,gateToken);return attempt>=8?'needs_review':'requeued';}
  if(!response.ok)throw Error('Email provider returned HTTP '+response.status+'.');
  let data;try{data=await response.json();}catch{throw Error('Email provider did not return a confirmation.');}
  if(typeof data.id!=='string'||!data.id||data.id.length>200)throw Error('Email provider did not return a confirmation.');
  confirmed=data.id;const saved=await run(env,`UPDATE ${table} SET status='sent',provider_id=?,sent_at=?,error='' WHERE id=? AND status='sending'`,confirmed,clock.now(),job.id);if(!saved.meta?.changes)throw Error('Email confirmation needs audit review.');
  return 'sent';
 }catch(error){
  const message=confirmed?'Provider confirmed the email; its audit update needs review.':error?.name==='TimeoutError'?'Email provider confirmation timed out.':/^Email provider returned HTTP [0-9]{3}\.$/.test(error?.message||'')?error.message:'Email delivery confirmation needs review.';
  try{await run(env,`UPDATE ${table} SET status='needs_review',provider_id=?,error=? WHERE id=? AND status='sending'`,confirmed,message,job.id);}catch{console.error(JSON.stringify({event:'operational_email_audit_needs_review',job_id:job.id}));}
  return 'needs_review';
 }finally{
  // Space the next start from completion, covering variable database/provider latency.
  if(providerStarted)await run(env,'UPDATE operational_email_delivery_gate SET next_send_at=MAX(next_send_at,?) WHERE singleton=1 AND lease_token=?',Date.now()+1000,gateToken);
 }
}
async function reserveRateSlot(env,token,clock){
 for(let i=0;i<3;i++){
  if(clock.remaining()<PROVIDER_TIMEOUT+1000)return false;
  const wall=Date.now(),gate=await one(env,'SELECT next_send_at,lease_token,lease_expires_at FROM operational_email_delivery_gate WHERE singleton=1');
  if(gate?.lease_token!==token||gate.lease_expires_at<=wall)return false;
  const delay=Math.max(0,gate.next_send_at-wall);if(delay){if(delay+PROVIDER_TIMEOUT+1000>clock.remaining())return false;await new Promise(resolve=>setTimeout(resolve,delay));continue;}
  const reserved=await run(env,'UPDATE operational_email_delivery_gate SET next_send_at=? WHERE singleton=1 AND lease_token=? AND lease_expires_at>? AND next_send_at<=?',wall+1000,token,wall,wall);if(reserved.meta?.changes)return true;
 }
 return false;
}
export async function runOperationalEmails(env,options={}){
 const wallStart=Date.now(),base=Date.parse(stamp(options.now)),clock={now:()=>stamp(base+Date.now()-wallStart),remaining:()=>DELIVERY_BUDGET-(Date.now()-wallStart)};
 const settings=await config(env);if(!settings)return {enabled:false,configured:false,queued:0,sent:0};
 const current=clock.now();if(settings.enabledAt>current)return {enabled:false,configured:operationalEmailReady(env),queued:0,sent:0};let queued=0;
 if(!options.deliveryOnly){queued+=await queueDailyPlans(env,settings,current);queued+=await collectMeetingNotices(env,settings,current);queued+=await recoverTransfers(env,settings,current);queued+=await recoverUrgentTasks(env,settings,current);}
 if(!operationalEmailReady(env))return {enabled:true,configured:false,queued,sent:0};
 const types=Array.isArray(options.types)?options.types.filter(kind=>KINDS.includes(kind)):KINDS,result={enabled:true,configured:true,queued,sent:0,blocked:0,skipped:0,needs_review:0,requeued:0};if(!types.length||clock.remaining()<PROVIDER_TIMEOUT+1000)return result;
 const urgentReady=!!settings.urgentEnabledAt&&settings.urgentEnabledAt<=current&&await urgentTableExists(env);
 const deadlineReady=await deadlinePolicyReady(env);
 const groups=[{table:'operational_email_jobs',types:types.filter(kind=>kind!==URGENT_KIND&&!DEADLINE_EMAIL_KINDS.includes(kind))},...(urgentReady?[{table:'urgent_task_email_jobs',types:types.filter(kind=>kind===URGENT_KIND)}]:[]),...(deadlineReady?[{table:'deadline_email_jobs',types:types.filter(kind=>DEADLINE_EMAIL_KINDS.includes(kind))}]:[])];
 // Never automatically reclaim a send whose provider outcome may be unknown.
 for(const {table} of groups)await run(env,`UPDATE ${table} SET status='needs_review',error='A previous delivery stopped before its outcome was recorded; review before retrying.' WHERE status='sending' AND claimed_at<?`,stamp(Date.parse(current)-2*MINUTE));
 const token=id(),wall=Date.now(),lease=await run(env,'UPDATE operational_email_delivery_gate SET lease_token=?,lease_expires_at=? WHERE singleton=1 AND lease_expires_at<=?',token,wall+DELIVERY_BUDGET+2000,wall);if(!lease.meta?.changes)return {...result,busy:true};
 try{
  // Missing/duplicate connections must not occupy every slot ahead of deliverable jobs.
  const eligible=`EXISTS(SELECT 1 FROM member_connections c WHERE c.user_id=j.user_id AND c.provider='gmail' AND c.status='verified' AND julianday(c.verified_at)<=julianday(?) AND NOT EXISTS(SELECT 1 FROM member_connections other JOIN users ou ON ou.id=other.user_id WHERE other.provider='gmail' AND other.status='verified' AND other.user_id<>j.user_id AND lower(trim(other.account))=lower(trim(c.account)) AND ou.status IN ('active','on_leave')))`;
  const pending=[];
  for(const {table,types:groupTypes} of groups){
   if(!groupTypes.length)continue;
   await run(env,`UPDATE ${table} AS j SET status='blocked',error='Verify a unique current notification email before delivery.' WHERE j.status='queued' AND NOT ${eligible}`,clock.now());
   pending.push(...await rows(env,`SELECT j.* FROM ${table} j JOIN users u ON u.id=j.user_id WHERE j.status IN ('queued','blocked') AND j.scheduled_at<=? AND j.next_attempt_at<=? AND j.kind IN (${groupTypes.map(()=>'?').join(',')}) AND u.status IN ('active','on_leave') AND ${eligible} ORDER BY j.scheduled_at,j.created_at,j.id LIMIT ${MAX_JOBS}`,clock.now(),clock.now(),...groupTypes,clock.now()));
  }
  const jobs=pending.sort((a,b)=>(a.kind===URGENT_KIND?0:1)-(b.kind===URGENT_KIND?0:1)||a.scheduled_at.localeCompare(b.scheduled_at)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)).slice(0,MAX_JOBS);
  for(const job of jobs){if(clock.remaining()<PROVIDER_TIMEOUT+1000)break;const outcome=await sendJob(env,job,settings,clock,token);if(Object.hasOwn(result,outcome))result[outcome]++;if(outcome==='requeued'||outcome==='deferred')break;}
  return result;
 }finally{await run(env,"UPDATE operational_email_delivery_gate SET lease_token='',lease_expires_at=0 WHERE singleton=1 AND lease_token=?",token);}
}
export async function getOperationalEmailStatus(env){const settings=await config(env),counts=await rows(env,'SELECT kind,status,COUNT(*) AS count FROM operational_email_jobs GROUP BY kind,status');if(await urgentTableExists(env))counts.push(...await rows(env,'SELECT kind,status,COUNT(*) AS count FROM urgent_task_email_jobs GROUP BY kind,status'));if(await deadlinePolicyReady(env))counts.push(...await rows(env,'SELECT kind,status,COUNT(*) AS count FROM deadline_email_jobs GROUP BY kind,status'));const deadline=await one(env,"SELECT value FROM app_settings WHERE key='deadline_policy_enabled_at'");return {enabled:!!settings,configured:operationalEmailReady(env),sender:address(env.TEL_OS_WORK_SENDER_EMAIL)||null,reply_to:OPS,enabled_at:settings?.enabledAt||null,urgent_enabled_at:settings?.urgentEnabledAt||null,deadline_policy_enabled_at:Number.isFinite(Date.parse(deadline?.value))?deadline.value:null,daily_start_date:settings?.dailyStart||null,daily_time:settings?.dailyTime||'09:00',timezone:'Asia/Kolkata',meeting_reminder_minutes:60,counts};}
export async function verifyOperationalEmailDomain(env){const sender=address(env.TEL_OS_WORK_SENDER_EMAIL);if(!sender||typeof env.RESEND_API_KEY!=='string')return {verified:false,status:'missing_configuration'};const domain=sender.split('@')[1];try{const response=await fetch('https://api.resend.com/domains',{headers:{Authorization:'Bearer '+env.RESEND_API_KEY},signal:AbortSignal.timeout(PROVIDER_TIMEOUT)});if(response.status===401||response.status===403)return {verified:null,status:'domain_lookup_unavailable_for_this_key',domain};if(!response.ok)return {verified:null,status:'domain_lookup_unavailable',domain};const body=await response.json(),match=Array.isArray(body.data)?body.data.find(item=>typeof item.name==='string'&&item.name.toLowerCase()===domain):null;return {verified:match?.status==='verified',status:match?.status||'domain_not_listed',domain};}catch{return {verified:null,status:'domain_lookup_unavailable',domain};}}
