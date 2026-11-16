import {id,now,day,json,fail,one,rows} from './core.js';
import {presenceSQL,workStatusSQL} from './extensions.js';

const HR=['founder','hr_lead','hr_member'],LEADS=['team_lead','finance_head'];
const timezone='Asia/Kolkata',limit=300;
const localDate=at=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
const dateShift=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
function checkedDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail(400,'Use a valid date in YYYY-MM-DD format.');return value;}
function participants(meeting){try{const ids=JSON.parse(meeting.participants_json);return Array.isArray(ids)?ids.filter(x=>typeof x==='string'):[];}catch{return [];}}
function canRecord(user,meeting){return HR.includes(user.role)||(LEADS.includes(user.role)&&meeting.created_by===user.id&&meeting.department===user.department&&participants(meeting).includes(user.id));}
function requireMeetingScope(user,meeting){if(!HR.includes(user.role)&&meeting.created_by!==user.id&&!participants(meeting).includes(user.id))fail(403,'Meeting attendance is private to its participants, organiser and HR.');}
function meetingView(meeting){return {id:meeting.id,title:meeting.title,starts_at:meeting.starts_at,department:meeting.department,created_by:meeting.created_by};}
async function roster(env,user,meeting){
 const writable=canRecord(user,meeting),started=Number.isFinite(Date.parse(meeting.starts_at))&&Date.parse(meeting.starts_at)<=Date.now();
 const people=await rows(env,`SELECT u.id AS user_id,u.name,u.department,a.status,a.recorded_by,r.name AS recorder_name,a.recorded_at,a.revision FROM users u LEFT JOIN meeting_attendance a ON a.user_id=u.id AND a.meeting_id=? LEFT JOIN users r ON r.id=a.recorded_by WHERE u.id IN (SELECT value FROM json_each(?)) ORDER BY u.name,u.id`,meeting.id,JSON.stringify(participants(meeting)));
 const history=HR.includes(user.role)||writable?await rows(env,'SELECT h.id,h.user_id,u.name,h.previous_status,h.status,h.recorded_by,r.name AS recorder_name,h.recorded_at,h.revision FROM meeting_attendance_history h JOIN users u ON u.id=h.user_id JOIN users r ON r.id=h.recorded_by WHERE h.meeting_id=? ORDER BY h.id DESC LIMIT 300',meeting.id):[];
 return {meeting:meetingView(meeting),can_record:writable&&started,started,source:'Manually reported attendance; call joins are not tracked.',participants:people.map(p=>({...p,status:p.status||'unrecorded',can_record:writable&&started&&(HR.includes(user.role)||p.department===user.department)})),history};
}
async function reportToHR(env,meeting,at){
 const counts=await one(env,`SELECT COALESCE(SUM(status='present'),0) present,COALESCE(SUM(status='absent'),0) absent,COALESCE(SUM(status='excused'),0) excused,COALESCE(SUM(revision),0) version FROM meeting_attendance WHERE meeting_id=?`,meeting.id);
 const unrecorded=Math.max(0,participants(meeting).length-counts.present-counts.absent-counts.excused);
 const body=`${meeting.title} · ${localDate(meeting.starts_at)} IST: ${counts.present} present, ${counts.absent} absent, ${counts.excused} excused, ${unrecorded} unrecorded. Manually reported; open HR records to review.`;
 // Direct insert intentionally bypasses all email and external-delivery queues.
 await env.DB.prepare(`INSERT OR IGNORE INTO notifications(id,user_id,title,body,link,created_at,dedupe_key) SELECT lower(hex(randomblob(16))),u.id,'Meeting attendance reported to HR',?,'hr-records',?,?||u.id FROM users u WHERE u.role IN ('hr_lead','hr_member') AND u.status='active'`).bind(body,at,`meeting-attendance:${meeting.id}:${counts.version}:`).run();
}
function filtered(url){
 const today=day(),date=url.searchParams.get('date'),from=checkedDate(date||url.searchParams.get('from')||dateShift(today,-30)),to=checkedDate(date||url.searchParams.get('to')||dateShift(today,30));
 if(from>to)fail(400,'The start date must come before the end date.');
 if((Date.parse(to)-Date.parse(from))/86400000>366)fail(400,'Choose a date range of up to one year.');
 const user_id=url.searchParams.get('user_id')||'';if(user_id.length>80)fail(400,'Choose a valid team member.');return {from,to,user_id};
}
function capped(data){return {records:data.slice(0,limit),truncated:data.length>limit};}

export async function handleHRRecords({request,url,env,user,body={}}){
 const path=url.pathname,match=path.match(/^\/api\/meetings\/([^/]+)\/attendance$/),ledger=path==='/api/hr-records';
 if(!match&&!ledger)return null;
 if(!user)fail(401,'Sign in to TEL OS.');
 if(!['active','on_leave'].includes(user.status))fail(403,'This account cannot access HR records.');
 if(match){
  const meeting=await one(env,'SELECT id,title,starts_at,department,created_by,participants_json FROM meetings WHERE id=?',match[1]);if(!meeting)fail(404,'Meeting not found.');requireMeetingScope(user,meeting);
  if(request.method==='GET')return json(await roster(env,user,meeting));
  if(['POST','PUT'].includes(request.method)){
   if(!canRecord(user,meeting))fail(403,'Only HR, a founder, or the meeting’s organising department lead can record attendance.');
   if(!Number.isFinite(Date.parse(meeting.starts_at))||Date.parse(meeting.starts_at)>Date.now())fail(409,'Record attendance after the meeting has started.');
   const entries=body.entries===undefined?[{user_id:body.user_id,status:body.status}]:body.entries;
   if(!Array.isArray(entries)||!entries.length||entries.length>100)fail(400,'Provide between 1 and 100 participant attendance entries.');
   const ids=participants(meeting),seen=new Set();
   for(const entry of entries){
    if(!entry||typeof entry!=='object'||!['present','absent','excused'].includes(entry.status))fail(400,'Choose present, absent or excused for each participant.');
    if(typeof entry.user_id!=='string'||!ids.includes(entry.user_id))fail(400,'Attendance can only be recorded for an invited participant.');
    if(seen.has(entry.user_id))fail(400,'Each participant can appear only once.');seen.add(entry.user_id);
   }
   if(!HR.includes(user.role)){
    const outside=await one(env,'SELECT id FROM users WHERE id IN (SELECT value FROM json_each(?)) AND department<>? LIMIT 1',JSON.stringify(entries.map(e=>e.user_id)),user.department);if(outside)fail(403,'A department lead can record only their own department’s participants. Ask HR to record other attendees.');
   }
   const at=now();
   const saved=await env.DB.batch(entries.map(entry=>env.DB.prepare(`INSERT INTO meeting_attendance(meeting_id,user_id,status,recorded_by,recorded_at) VALUES(?,?,?,?,?) ON CONFLICT(meeting_id,user_id) DO UPDATE SET status=excluded.status,recorded_by=excluded.recorded_by,recorded_at=excluded.recorded_at,revision=meeting_attendance.revision+1 WHERE meeting_attendance.status<>excluded.status`).bind(meeting.id,entry.user_id,entry.status,user.id,at)));
   const changed=saved.reduce((n,result)=>n+(result.meta?.changes||0),0);
   // Keep the legacy meeting detail display aligned with the auditable roster.
   await env.DB.prepare(`UPDATE meetings SET attended_json=COALESCE((SELECT json_group_array(user_id) FROM (SELECT user_id FROM meeting_attendance WHERE meeting_id=? AND status='present' ORDER BY user_id)),'[]'),updated_at=CASE WHEN ?>0 THEN ? ELSE updated_at END WHERE id=?`).bind(meeting.id,changed,at,meeting.id).run();
   if(changed)await env.DB.prepare("INSERT INTO audit_events(id,actor_id,action,entity,entity_id,details,created_at) VALUES(?,?,'meeting_attendance_recorded','meeting',?,'Manual participant attendance recorded; correction history retained',?)").bind(id(),user.id,meeting.id,at).run();
   await reportToHR(env,meeting,at);
   return json({...await roster(env,user,meeting),unchanged:changed===0,reported_to_hr:true});
  }
  return null;
 }
 if(ledger&&request.method==='GET'){
  if(!HR.includes(user.role))fail(403,'HR records are restricted to HR and founders.');
  const filters=filtered(url),{from,to,user_id}=filters,at=now(),today=day(),scope=user_id?' AND u.id=?':'',params=user_id?[user_id]:[];
  const [people,meetingRows,historyRows,workRows,deadlineRows,hasExtensions]=await Promise.all([
   rows(env,`SELECT u.id,u.name,u.department,u.role,u.status,${presenceSQL()} AS login_status,${workStatusSQL()} AS work_status FROM users u ORDER BY u.department,u.name`,at,today,today,today,today),
   rows(env,`SELECT a.meeting_id,m.title AS meeting_title,m.starts_at,m.department,a.user_id,u.name,a.status,a.recorded_by,r.name AS recorder_name,a.recorded_at,a.revision FROM meeting_attendance a JOIN meetings m ON m.id=a.meeting_id JOIN users u ON u.id=a.user_id JOIN users r ON r.id=a.recorded_by WHERE date(m.starts_at,'+5 hours','+30 minutes')>=? AND date(m.starts_at,'+5 hours','+30 minutes')<=?${scope} ORDER BY m.starts_at DESC,u.name LIMIT ?`,from,to,...params,limit+1),
   rows(env,`SELECT h.id,h.meeting_id,m.title AS meeting_title,h.user_id,u.name,h.previous_status,h.status,h.recorded_by,r.name AS recorder_name,h.recorded_at,h.revision FROM meeting_attendance_history h JOIN meetings m ON m.id=h.meeting_id JOIN users u ON u.id=h.user_id JOIN users r ON r.id=h.recorded_by WHERE date(m.starts_at,'+5 hours','+30 minutes')>=? AND date(m.starts_at,'+5 hours','+30 minutes')<=?${scope} ORDER BY h.id DESC LIMIT ?`,from,to,...params,limit+1),
   rows(env,`SELECT a.user_id,u.name,u.department,a.work_date,MIN(a.clock_in) AS first_clock_in,CASE WHEN SUM(a.clock_out IS NULL)>0 THEN NULL ELSE MAX(a.clock_out) END AS last_clock_out,CASE WHEN SUM(a.clock_out IS NULL AND a.state='working')>0 THEN 'working' WHEN SUM(a.clock_out IS NULL AND a.state='break')>0 THEN 'on_break' ELSE 'closed' END AS state,SUM(a.active_seconds+CASE WHEN a.state='working' AND a.clock_out IS NULL AND a.active_started_at IS NOT NULL THEN MAX(0,MIN(86400,CAST((julianday(?)-julianday(a.active_started_at))*86400 AS INTEGER))) ELSE 0 END) AS active_seconds,SUM(a.break_seconds) AS break_seconds,COUNT(*) AS sessions FROM attendance_sessions a JOIN users u ON u.id=a.user_id WHERE a.work_date>=? AND a.work_date<=?${scope} GROUP BY a.user_id,a.work_date ORDER BY a.work_date DESC,u.name LIMIT ?`,at,from,to,...params,limit+1),
   rows(env,`SELECT t.id AS task_id,t.title AS task_title,t.assignee_id AS user_id,u.name,t.department,t.leader_id,r.name AS reviewer_name,t.deadline,t.status FROM tasks t JOIN users u ON u.id=t.assignee_id JOIN users r ON r.id=t.leader_id WHERE t.deadline>=? AND t.deadline<=?${scope} ORDER BY t.deadline DESC,u.name LIMIT ?`,from,to,...params,limit+1),
   one(env,"SELECT name FROM sqlite_master WHERE type='table' AND name='deadline_extension_records'")
  ]);
  let extensions=[];
  if(hasExtensions)extensions=await rows(env,`SELECT e.id,e.task_id,t.title AS task_title,e.assignee_id AS user_id,u.name,t.department,e.leader_id,r.name AS reviewer_name,e.original_deadline,e.extended_deadline,e.extra_days,e.created_at,e.escalated_at,t.status FROM deadline_extension_records e JOIN tasks t ON t.id=e.task_id JOIN users u ON u.id=e.assignee_id JOIN users r ON r.id=e.leader_id WHERE e.original_deadline>=? AND e.original_deadline<=?${scope} ORDER BY e.created_at DESC,e.id DESC LIMIT ?`,from,to,...params,limit+1);
  return json({generated_at:at,timezone,filters,scope:'Private to HR and founders. Attendance is manually reported. Login status means signed in; working means clocked in. Historical work records use recorded attendance sessions.',people,meeting_attendance:capped(meetingRows),meeting_history:capped(historyRows),work_presence:capped(workRows),task_deadlines:capped(deadlineRows),deadline_extensions:{available:!!hasExtensions,...capped(extensions)},record_limit:limit});
 }
 return null;
}
