import {json,fail,rows,one,requireRole,now,id} from './core.js';

const actionInfo={
 'login':['Accounts','Signed in','Signed in','account'],
 'password_changed':['Accounts','Updated their password','Updated','account'],
 'employee_registered':['People','Registered a team member','Registered','hr'],
 'employee_updated':['People','Updated a team account','Updated','hr'],
 'password_reset':['Accounts','Issued a temporary password reset','Change required','hr'],
 'status_change_requested':['People','Requested an account status review','Awaiting independent review','hr'],
 'status_change_approve':['People','Approved an account status change','Approved','hr'],
 'status_change_reject':['People','Rejected an account status change','Rejected','hr'],
 'task.created':['Work','Created an assignment','To do','tasks'],
 'task.start':['Work','Started an assignment','Working','tasks'],
 'task.submit':['Work','Submitted a deliverable','Awaiting review','tasks'],
 'task.approve':['Work','Approved a deliverable','Approved','tasks'],
 'task.revision':['Work','Requested changes to a deliverable','Revision required','tasks'],
 'task.complete':['Work','Completed an assignment','Done','tasks'],
 'attendance.clock_in':['Attendance','Clocked in','Working','attendance'],
 'attendance.pause':['Attendance','Started a break','On break','attendance'],
 'attendance.resume':['Attendance','Resumed work','Working','attendance'],
 'attendance.clock_out':['Attendance','Clocked out','Session closed','attendance'],
 'attendance.correction_requested':['Attendance','Requested an attendance correction','Awaiting review','attendance'],
 'attendance.correction_approved':['Attendance','Approved an attendance correction','Approved','attendance'],
 'attendance.correction_rejected':['Attendance','Rejected an attendance correction','Rejected','attendance'],
 'clock_in_policy_updated':['Attendance','Updated the company clock-in policy','Updated','attendance'],
 'clock_in_schedule_updated':['Attendance','Updated a member clock-in schedule','Updated','attendance'],
 'clock_in_schedule_reset':['Attendance','Reset a member clock-in schedule','Company default','attendance'],
 'company_holiday_added':['Attendance','Added a company holiday','Added','attendance'],
 'company_holiday_removed':['Attendance','Removed a company holiday','Removed','attendance'],
 'leave.requested':['People','Requested time off','Awaiting review','leave'],
 'leave.recommend':['People','Recommended a time-off request','Awaiting HR verification','leave'],
 'leave.approve':['People','Approved a time-off request','Approved','leave'],
 'leave.reject':['People','Rejected a time-off request','Rejected','leave'],
 'meeting_created':['Meetings','Scheduled a meeting','Scheduled','meetings'],
 'meeting_record_updated':['Meetings','Updated a meeting record','Updated','meetings'],
 'image_uploaded':['Work','Uploaded an image','Uploaded','images'],
 'performance_review_recorded':['People','Recorded a performance review','Recorded','performance'],
 'document_published':['Work','Published a work document','Published','documents'],
 'marketing_report_submitted':['Marketing','Submitted a Marketing report to Harsh','Submitted','marketing-reports'],
 'Google email connected':['Connections','Verified a Google email connection','Verified','connections'],
 'WhatsApp verification requested':['Connections','Requested a WhatsApp verification code','Verification pending','connections'],
 'WhatsApp connected':['Connections','Verified a WhatsApp connection','Verified','connections'],
 'gmail disconnected':['Connections','Disconnected their Google email','Disconnected','connections'],
 'whatsapp disconnected':['Connections','Disconnected their WhatsApp','Disconnected','connections'],
 'Connection requirement updated':['Connections','Updated the account connection requirement','Updated','connections'],
 'public_website_team_updated':['Website','Published public Team updates','Published','website-team'],
 'pdf_profile_linked':['People','Matched an imported employee record','Matched','hr'],
 'policy_acknowledged':['People','Acknowledged the work policy','Acknowledged','hr'],
 'navigation_guide_completed':['People','Completed the navigation guide','Completed','guide'],
 'exit_requested':['People','Requested an exit review','Awaiting review','exits'],
 'exit_approved':['People','Approved an exit request','Approved','exits'],
 'exit_rejected':['People','Rejected an exit request','Rejected','exits']
};
const clean=(value,fallback='')=>String(value||fallback).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,220);
const ist=value=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+' IST';
const today=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
function integer(value,fallback,max,label){if(value===null)return fallback;if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>max)fail(400,`${label} must be between 1 and ${max}.`);return Number(value);}
function entry({id,category,actor,department,action,status,at,link,subject=''}){
 const safe={id,category,actor:clean(actor,'TEL OS'),department:clean(department,'Company'),action:clean(action),status:clean(status),at,at_ist:ist(at),link,subject:clean(subject)};
 safe.text=`Actor: ${safe.actor}\nDepartment: ${safe.department}\nAction: ${safe.action}${safe.subject?' · '+safe.subject:''}\nStatus: ${safe.status}\nTime: ${safe.at_ist}`;
 return safe;
}
export async function handleFounderUpdates({request,url,env,user}){
 if(url.pathname!=='/api/founder-updates')return null;
 if(!user)fail(401,'Sign in to TEL OS.');
 requireRole(user,'founder');
 if(request.method!=='GET')fail(405,'Founder updates are read-only.');
 const days=integer(url.searchParams.get('days'),7,30,'Days'),limit=integer(url.searchParams.get('limit'),100,200,'Limit');
 const generated_at=now(),since=new Date(Date.parse(generated_at)-days*86400000).toISOString(),actions=Object.keys(actionInfo);
 const [summary,audits,deliveries,workDeliveries,notices]=await Promise.all([
  one(env,`SELECT
   (SELECT COUNT(*) FROM tasks WHERE status!='done') tasks_active,
   (SELECT COUNT(*) FROM tasks WHERE status='review') tasks_waiting_review,
   (SELECT COUNT(*) FROM tasks WHERE status!='done' AND deadline<?) tasks_overdue,
   (SELECT COUNT(*) FROM attendance_corrections WHERE status='pending') attendance_corrections_pending,
   (SELECT COUNT(*) FROM leave_requests WHERE status IN ('pending_lead','pending_hr')) leave_pending,
   (SELECT COUNT(*) FROM grievances WHERE status!='resolved') hr_tickets_open,
   (SELECT COUNT(*) FROM users u WHERE u.status IN ('active','on_leave') AND (SELECT COUNT(DISTINCT c.provider) FROM member_connections c WHERE c.user_id=u.id AND c.provider IN ('gmail','whatsapp') AND c.status='verified')<2) members_missing_connections,
   (SELECT COUNT(*) FROM meeting_deliveries WHERE status IN ('blocked','needs_review') OR (status IN ('sent','accepted') AND COALESCE(provider_id,'')='')) meeting_delivery_issues,
   (SELECT COUNT(*) FROM work_notification_deliveries WHERE status IN ('blocked','needs_review') OR (status IN ('sent','accepted') AND COALESCE(provider_id,'')='')) work_delivery_issues,
   (SELECT COUNT(*) FROM marketing_reports WHERE created_at>=? AND created_at<=?) marketing_reports_in_period`,today(generated_at),since,generated_at),
  rows(env,`SELECT a.id,a.action,a.entity_id,a.created_at,u.name,u.department,t.title task_title,m.title meeting_title FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN tasks t ON a.entity='task' AND t.id=a.entity_id LEFT JOIN meetings m ON a.entity='meeting' AND m.id=a.entity_id WHERE a.created_at>=? AND a.created_at<=? AND a.action IN (${actions.map(()=>'?').join(',')}) ORDER BY a.created_at DESC,a.id DESC LIMIT ?`,since,generated_at,...actions,limit+1),
  rows(env,`SELECT d.id,d.channel,d.event,d.status,d.created_at,d.sent_at,CASE WHEN d.provider_id IS NOT NULL AND d.provider_id!='' THEN 1 ELSE 0 END confirmed,u.name,m.title,m.department FROM meeting_deliveries d JOIN users u ON u.id=d.user_id JOIN meetings m ON m.id=d.meeting_id WHERE COALESCE(d.sent_at,d.created_at)>=? AND COALESCE(d.sent_at,d.created_at)<=? ORDER BY COALESCE(d.sent_at,d.created_at) DESC,d.id DESC LIMIT ?`,since,generated_at,limit+1),
  rows(env,`SELECT d.id,d.channel,d.category,d.status,d.created_at,d.sent_at,CASE WHEN d.provider_id IS NOT NULL AND d.provider_id!='' THEN 1 ELSE 0 END confirmed,u.name,u.department,n.link FROM work_notification_deliveries d JOIN users u ON u.id=d.user_id JOIN notifications n ON n.id=d.notification_id AND n.user_id=d.user_id WHERE COALESCE(d.sent_at,d.created_at)>=? AND COALESCE(d.sent_at,d.created_at)<=? ORDER BY COALESCE(d.sent_at,d.created_at) DESC,d.id DESC LIMIT ?`,since,generated_at,limit+1),
  rows(env,"SELECT n.id,n.title,n.dedupe_key,n.created_at,u.id affected_id,u.name,u.department FROM (SELECT id,title,dedupe_key,created_at FROM notifications WHERE created_at>=? AND created_at<=? AND title IN ('Scheduled clock-in missed','Scheduled clock-in needs follow-up') ORDER BY created_at DESC,id DESC LIMIT ?) n LEFT JOIN users u ON u.id=substr(n.dedupe_key,21,instr(substr(n.dedupe_key,21),':')-1)",since,generated_at,limit+1)
 ]);
 const updates=audits.map(a=>{const [category,action,status,link]=actionInfo[a.action];return entry({id:'audit:'+a.id,category,actor:a.name,department:a.department,action,status,link,at:a.created_at,subject:a.task_title||a.meeting_title||''});});
 const deliveryStatus={queued:'Queued',blocked:'Blocked · setup or contact required',sending:'Sending · confirmation pending',sent:'Sent',accepted:'Accepted by provider',needs_review:'Needs delivery review'};
 for(const d of deliveries){const status=['sent','accepted'].includes(d.status)&&!d.confirmed?'Needs delivery review':deliveryStatus[d.status]||'Delivery status requires review';updates.push(entry({id:'delivery:'+d.id,category:'Meetings',actor:'TEL OS',department:d.department,action:`${d.channel==='email'?'Email':'WhatsApp'} ${d.event==='reminder'?'reminder':'invitation'} for ${clean(d.name)}`,status,link:'meetings',at:d.sent_at||d.created_at,subject:d.title}));}
 for(const d of workDeliveries){const status=['sent','accepted'].includes(d.status)&&!d.confirmed?'Needs delivery review':deliveryStatus[d.status]||'Delivery status requires review';let link=String(d.link||'').replace(/^#/,'');if(link==='schedule')link='attendance';if(!['tasks','attendance','marketing-reports','connections','grievances','leave','reports','calendar','people','hr','account','founder-updates','meetings'].includes(link)&&!/^channel\/[a-zA-Z0-9_-]{1,80}$/.test(link))link='founder-updates';updates.push(entry({id:'work-delivery:'+d.id,category:'Work notifications',actor:'TEL OS',department:d.department,action:`${d.channel==='email'?'Email':'WhatsApp'} work update for ${clean(d.name)}`,status,link,at:d.sent_at||d.created_at,subject:d.category}));}
 const seen=new Set();
 for(const notice of notices){const match=notice.dedupe_key?.match(/^clock-in:(\d{4}-\d{2}-\d{2}):([^:]+):(\d{2}:\d{2}):/);if(!match)continue;const key=match.slice(1).join(':'),person=notice.affected_id===match[2]?notice:null;if(seen.has(key)||!person)continue;seen.add(key);updates.push(entry({id:'clock-exception:'+key,category:'Attendance',actor:person.name,department:person.department,action:`Scheduled clock-in not recorded for ${match[1]} at ${match[3]} IST`,status:'Needs availability check',link:'attendance',at:notice.created_at}));}
 updates.sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));
 const has_more=updates.length>limit||audits.length>limit||deliveries.length>limit||workDeliveries.length>limit||notices.length>limit,selected=updates.slice(0,limit);
 const summary_text=[`${summary.tasks_active} active assignments; ${summary.tasks_waiting_review} awaiting review; ${summary.tasks_overdue} overdue.`,`${summary.attendance_corrections_pending} attendance corrections and ${summary.leave_pending} time-off requests awaiting review.`,`${summary.hr_tickets_open} open private HR tickets. Ticket contents remain in the private HR desk.`,`${summary.members_missing_connections} members still need one or both work account connections.`,`${summary.meeting_delivery_issues} meeting notification deliveries need setup or review.`,`${summary.work_delivery_issues} work notification deliveries need setup or review.`,`${summary.marketing_reports_in_period} Marketing reports submitted in the last ${days} days.`];
 const plain_text=`TEL OS · Founder updates\nGenerated: ${ist(generated_at)}\nPeriod: last ${days} days · latest ${limit} updates\n\n${summary_text.join('\n')}\n\n${selected.length?selected.map(u=>u.text).join('\n\n'):'No recorded updates in this period.'}${has_more?'\n\nMore updates exist. Use the relevant work records for the complete history.':''}`;
 if(url.searchParams.get('format')==='text')return new Response(plain_text,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Content-Disposition':'attachment; filename="tel-founder-updates.txt"'}});
 return json({generated_at,timezone:'Asia/Kolkata',period_days:days,limit,has_more,summary,summary_text,updates:selected,plain_text,privacy:'Operational metadata only. Private HR content, contact details, identity documents and audit notes are excluded.'});
}


// Fan out safe organisational metadata to active founders. The connection helper
// already notifies both founders, so connection audits remain feed-only here.
// The per-recipient key also works with the legacy global dedupe_key constraint.
export async function queueFounderUpdates(env){
 const generated_at=now(),actions=Object.keys(actionInfo).filter(action=>actionInfo[action][0]!=='Connections');
 const candidates=await rows(env,`WITH pending AS(
  SELECT a.id,a.actor_id,a.action,a.entity,a.entity_id,a.created_at FROM audit_events a
  WHERE a.created_at>=COALESCE((SELECT value FROM app_settings WHERE key='work_notifications_enabled_at'),'9999-12-31T23:59:59.999Z')
  AND a.created_at<=? AND a.action IN (${actions.map(()=>'?').join(',')})
  AND EXISTS(SELECT 1 FROM users f WHERE f.role='founder' AND f.status='active' AND NOT EXISTS(
   SELECT 1 FROM notifications n WHERE n.user_id=f.id AND n.dedupe_key='founder-audit:'||a.id||':'||f.id))
  ORDER BY a.created_at ASC,a.id ASC LIMIT 50
 ), recipients AS(
  SELECT p.*,f.id recipient_id FROM pending p CROSS JOIN users f WHERE f.role='founder' AND f.status='active'
  AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=f.id AND n.dedupe_key='founder-audit:'||p.id||':'||f.id)
  ORDER BY p.created_at,p.id,f.id LIMIT 100
 ) SELECT r.*,u.name,u.department FROM recipients r
 LEFT JOIN users u ON u.id=r.actor_id`,generated_at,...actions);
 const messages=candidates.map(a=>{const [category,action,status,link]=actionInfo[a.action],update=entry({id:'audit:'+a.id,category,actor:a.name,department:a.department,action,status,at:a.created_at,link});return [id(),a.recipient_id,'Organisational update',update.text,'founder-updates',generated_at,'founder-audit:'+a.id+':'+a.recipient_id];});
 let notifications=0;
 for(let offset=0;offset<messages.length;offset+=10){const chunk=messages.slice(offset,offset+10),result=await env.DB.prepare('INSERT OR IGNORE INTO notifications(id,user_id,title,body,link,created_at,dedupe_key) VALUES '+chunk.map(()=>'(?,?,?,?,?,?,?)').join(',')).bind(...chunk.flat()).run();notifications+=result.meta?.changes||0;}
 return {audits:new Set(candidates.map(a=>a.id)).size,notifications,at:generated_at};
}
