import {runAttendanceReminders} from './schedules.js';
import {queueMeetingDeliveries,deliverMeetingWhatsApp} from './deliveries.js';
const HR = ['founder', 'hr_lead', 'hr_member'];
const LEADS = ['founder', 'hr_lead', 'team_lead', 'finance_head'];
const TZ = 'Asia/Kolkata';
const stamp = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const uid = () => crypto.randomUUID();
const dbRows = async (env, sql, ...p) => (await env.DB.prepare(sql).bind(...p).all()).results;
const dbOne = async (env, sql, ...p) => env.DB.prepare(sql).bind(...p).first();
const dbRun = async (env, sql, ...p) => env.DB.prepare(sql).bind(...p).run();
const isHR = user => HR.includes(user.role);
const isLead = user => LEADS.includes(user.role);
const text = (value, max=4000) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const elapsed = (start,end) => start ? Math.max(0,Math.floor((Date.parse(end)-Date.parse(start))/1000)) : 0;
const taskSelect = 'SELECT t.*,a.name assignee_name,l.name leader_name FROM tasks t JOIN users a ON a.id=t.assignee_id JOIN users l ON l.id=t.leader_id';
const leaveSelect = 'SELECT l.*,u.name,u.department,u.manager_id FROM leave_requests l JOIN users u ON u.id=l.user_id';
function validDay(value) {return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;}
function sessionView(row, at=stamp()) {if (!row) return null; return {...row,calculated_at:at,active_seconds:row.active_seconds+(row.state==='working'?elapsed(row.active_started_at,at):0),break_seconds:row.break_seconds+(row.state==='break'?elapsed(row.break_started_at,at):0)};}
function scope(user, alias='u') {if(isHR(user)) return {clause:'1=1',params:[]}; if(isLead(user)) return {clause:`(${alias}.department=? OR ${alias}.id=?)`,params:[user.department,user.id]}; return {clause:`${alias}.id=?`,params:[user.id]};}
async function notifyReviewers(env,helpers,requester, title, message, link) {
 const candidates=await dbRows(env,"SELECT id FROM users WHERE status!='suspended' AND id<>? AND (role IN ('founder','hr_lead') OR id=?)",requester.id,requester.manager_id||'');
 for(const person of candidates) await helpers.notify(env,person.id,title,message,link);
}
async function checkedUpdate(env,sql,...params){const out=await dbRun(env,sql,...params);return out.meta?.changes>0;}

// Split an open shift at local midnight so each day's active and break time stays exact.
async function rolloverSession(env,userId,at=stamp()) {
 let current=await dbOne(env,'SELECT * FROM attendance_sessions WHERE user_id=? AND clock_out IS NULL',userId);
 const target=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
 let attempts=0;
 while(current&&current.work_date<target&&attempts++<4){
  const statements=[];let segment=current;
  for(let i=0;i<14&&segment.work_date<target;i++){
   const nextDay=new Date(Date.parse(`${segment.work_date}T00:00:00Z`)+86400000).toISOString().slice(0,10);
   const boundary=new Date(`${nextDay}T00:00:00+05:30`).toISOString(),nextId=uid();
   const active=segment.active_seconds+(segment.state==='working'?elapsed(segment.active_started_at,boundary):0);
   const breaks=segment.break_seconds+(segment.state==='break'?elapsed(segment.break_started_at,boundary):0);
   statements.push(env.DB.prepare("UPDATE attendance_sessions SET state='closed',active_seconds=?,break_seconds=?,clock_out=?,active_started_at=NULL,break_started_at=NULL,updated_at=? WHERE id=? AND clock_out IS NULL AND updated_at=?").bind(active,breaks,boundary,at,segment.id,segment.updated_at));
   statements.push(env.DB.prepare("INSERT INTO attendance_sessions (id,user_id,work_date,clock_in,state,active_started_at,break_started_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0").bind(nextId,userId,nextDay,boundary,segment.state,segment.state==='working'?boundary:null,segment.state==='break'?boundary:null,at));
   segment={id:nextId,user_id:userId,work_date:nextDay,clock_in:boundary,state:segment.state,active_seconds:0,break_seconds:0,active_started_at:segment.state==='working'?boundary:null,break_started_at:segment.state==='break'?boundary:null,updated_at:at};
  }
  await env.DB.batch(statements);
  current=await dbOne(env,'SELECT * FROM attendance_sessions WHERE user_id=? AND clock_out IS NULL',userId);
 }
 return current;
}

export async function handleWorkflows({request,url,env,user,body={},helpers}) {
 const {json,fail,audit,notify}=helpers;
 const path=url.pathname,method=request.method;
 const date=stamp();
 const validateRange=(start,end)=>{if(!validDay(start)||!validDay(end)||start>end)fail(400,'Choose a valid start and end date.'); if((Date.parse(end)-Date.parse(start))/86400000>366)fail(400,'Date ranges must be one year or less.');};
 const getTask=async id=>{const row=await dbOne(env,`${taskSelect} WHERE t.id=?`,id);if(!row)fail(404,'Assignment not found.');return {...row,overdue:row.deadline<today()&&row.status!=='done'};};
 const getLeave=async id=>{const row=await dbOne(env,`${leaveSelect} WHERE l.id=?`,id);if(!row)fail(404,'Leave request not found.');return row;};
 if(path==='/api/tasks'&&method==='GET'){
  const filters=user.role==='founder'?{sql:'1=1',p:[]}:isLead(user)?{sql:'(t.department=? OR t.assignee_id=? OR t.leader_id=?)',p:[user.department,user.id,user.id]}:{sql:'t.assignee_id=?',p:[user.id]};
  const tasks=await dbRows(env,`${taskSelect} WHERE ${filters.sql} ORDER BY t.deadline,t.created_at DESC LIMIT 500`,...filters.p);
  return json({tasks:tasks.map(t=>({...t,overdue:t.deadline<today()&&t.status!=='done'}))});
 }
 if(path==='/api/tasks'&&method==='POST'){
  if(!isLead(user))fail(403,'Only department leads and founders can assign work.');
  const title=text(body.title,180),description=text(body.description),expected=text(body.expected_deliverable),priority=body.priority||'normal';
  if(!title||!expected||!validDay(body.deadline)||!['normal','high','urgent'].includes(priority))fail(400,'Title, expected deliverable, valid deadline and priority are required.');
  const assignee=await dbOne(env,'SELECT id,name,department,status FROM users WHERE id=?',body.assignee_id||'');
  if(!assignee||['suspended','exited','on_leave'].includes(assignee.status))fail(400,'Choose an active team member who is available.');
  if(user.role!=='founder'&&assignee.department!==user.department)fail(403,'You can assign work within your own department.');
  const approvedLeave=await dbOne(env,"SELECT id FROM leave_requests WHERE user_id=? AND status='approved' AND start_date<=? AND end_date>=?",assignee.id,today(),today());
  if(approvedLeave)fail(409,'This team member is on approved leave today. Arrange a handover before assigning work.');
  const leader=await dbOne(env,'SELECT id,name,role,department,status FROM users WHERE id=?',body.leader_id||user.id);
  if(!leader||!LEADS.includes(leader.role)||['suspended','exited','on_leave'].includes(leader.status)||(leader.role!=='founder'&&leader.department!==assignee.department))fail(400,'Choose an active reporting lead for this department.');
  if(leader.id===assignee.id)fail(400,'The assignee and reviewer must be different people.');
  const id=uid();
  await dbRun(env,"INSERT INTO tasks (id,title,description,assignee_id,leader_id,department,priority,deadline,expected_deliverable,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'todo',?,?,?)",id,title,description,assignee.id,leader.id,assignee.department,priority,body.deadline,expected,user.id,date,date);
  await audit(env,user,'task.created','task',id,title);
  await notify(env,assignee.id,'New assignment',title,'tasks');
  return json({task:await getTask(id)},201);
 }
 const taskMatch=path.match(/^\/api\/tasks\/([^/]+)$/);
 if(taskMatch&&method==='PATCH'){
  const task=await getTask(taskMatch[1]),action=body.action,own=task.assignee_id===user.id,reviewer=(task.leader_id===user.id&&isLead(user)&&user.department===task.department)||user.role==='founder';
  let next,submission=task.submission,feedback=task.feedback;
  if(action==='start'){if(!own)fail(403,'Only the assignee can start work.');if(!['todo','revision'].includes(task.status))fail(409,'This assignment cannot be started in its current state.');next='working';}
  else if(action==='submit'){if(!own)fail(403,'Only the assignee can submit a deliverable.');if(!['todo','working','revision'].includes(task.status))fail(409,'This assignment is not accepting submissions.');submission=text(body.submission,12000);if(!submission)fail(400,'Add the deliverable text or a link before submitting.');next='review';feedback='';}
  else if(['approve','revision'].includes(action)){if(!reviewer||own)fail(403,'An independent reporting lead or founder must review this deliverable.');if(task.status!=='review')fail(409,'Only submitted deliverables can be reviewed.');feedback=text(body.feedback);if(action==='revision'&&!feedback)fail(400,'Explain the required revisions.');next=action==='approve'?'approved':'revision';}
  else if(action==='complete'){if(!own&&!reviewer)fail(403,'Only the assignee or reporting lead can close this task.');if(task.status!=='approved')fail(409,'The deliverable must be approved before completion.');next='done';}
  else fail(400,'Unknown assignment action.');
  if(!await checkedUpdate(env,'UPDATE tasks SET status=?,submission=?,feedback=?,updated_at=? WHERE id=? AND status=? AND updated_at=?',next,submission,feedback,date,task.id,task.status,task.updated_at))fail(409,'This assignment changed. Refresh and retry.');
  await dbRun(env,'INSERT INTO task_events (id,task_id,actor_id,action,notes,created_at) VALUES (?,?,?,?,?,?)',uid(),task.id,user.id,action,action==='submit'?submission:feedback,date);
  await audit(env,user,`task.${action}`,'task',task.id,feedback);
  if(action==='submit')await notify(env,task.leader_id,'Deliverable ready for review',task.title,'tasks');
  if(['approve','revision'].includes(action))await notify(env,task.assignee_id,action==='approve'?'Deliverable approved':'Revisions requested',`${task.title}${feedback?`: ${feedback}`:''}`,'tasks');
  return json({task:await getTask(task.id)});
 }
 if(path==='/api/attendance'&&method==='GET'){
  const visibility=scope(user);
  const open=await dbRows(env,`SELECT a.user_id FROM attendance_sessions a JOIN users u ON u.id=a.user_id WHERE a.clock_out IS NULL AND a.work_date<? AND ${visibility.clause}`,today(),...visibility.params);
  for(const session of open)await rolloverSession(env,session.user_id,date);
  const sessions=await dbRows(env,`SELECT a.*,u.name FROM attendance_sessions a JOIN users u ON u.id=a.user_id WHERE ${visibility.clause} ORDER BY a.clock_in DESC LIMIT 300`,...visibility.params);
  const current=await dbOne(env,'SELECT * FROM attendance_sessions WHERE user_id=? AND clock_out IS NULL',user.id);
  return json({attendance:sessions.map(s=>sessionView(s,date)),current:sessionView(current,date),target_seconds:14400});
 }
 if(path==='/api/attendance'&&method==='POST'){
  const action=body.action;
  const current=await rolloverSession(env,user.id,date);
  if(action==='clock_in'){
   if(current)fail(409,'You already have an open work session.');
   const approved=await dbOne(env,"SELECT id FROM leave_requests WHERE user_id=? AND status='approved' AND start_date<=? AND end_date>=?",user.id,today(),today());
   if(user.status==='on_leave'||approved)fail(409,'You are on leave. HR can update your availability before you clock in.');
   const id=uid();
   try{await env.DB.batch([env.DB.prepare("INSERT INTO attendance_sessions (id,user_id,work_date,clock_in,state,active_started_at,updated_at) VALUES (?,?,?,?,'working',?,?)").bind(id,user.id,today(),date,date,date),env.DB.prepare('INSERT INTO clock_in_events(session_id,user_id,occurred_at) VALUES(?,?,?)').bind(id,user.id,date)]);}catch(e){if(String(e).includes('UNIQUE'))fail(409,'You already have an open work session.');throw e;}
   await audit(env,user,'attendance.clock_in','attendance',id,'');
   return json({session:sessionView(await dbOne(env,'SELECT * FROM attendance_sessions WHERE id=?',id),date)},201);
  }
  if(!current)fail(409,'Clock in before changing your work session.');
  let state=current.state,active=current.active_seconds,breaks=current.break_seconds,activeStart=current.active_started_at,breakStart=current.break_started_at,clockOut=null;
  if(action==='pause'){if(state!=='working')fail(409,'Only an active work session can be paused.');active+=elapsed(activeStart,date);state='break';activeStart=null;breakStart=date;}
  else if(action==='resume'){if(state!=='break')fail(409,'Only a paused session can be resumed.');breaks+=elapsed(breakStart,date);state='working';activeStart=date;breakStart=null;}
  else if(action==='clock_out'){if(state==='working')active+=elapsed(activeStart,date);else breaks+=elapsed(breakStart,date);state='closed';activeStart=null;breakStart=null;clockOut=date;}
  else fail(400,'Unknown attendance action.');
  if(!await checkedUpdate(env,'UPDATE attendance_sessions SET state=?,active_seconds=?,break_seconds=?,active_started_at=?,break_started_at=?,clock_out=?,updated_at=? WHERE id=? AND state=? AND updated_at=?',state,active,breaks,activeStart,breakStart,clockOut,date,current.id,current.state,current.updated_at))fail(409,'Your session changed. Refresh and retry.');
  await audit(env,user,`attendance.${action}`,'attendance',current.id,'');
  return json({session:sessionView(await dbOne(env,'SELECT * FROM attendance_sessions WHERE id=?',current.id),date)});
 }
 if(path==='/api/corrections'&&method==='GET'){
  const clause=isHR(user)?'1=1':'c.user_id=?',params=isHR(user)?[]:[user.id];
  return json({corrections:await dbRows(env,`SELECT c.*,u.name FROM attendance_corrections c JOIN users u ON u.id=c.user_id WHERE ${clause} ORDER BY c.created_at DESC LIMIT 300`,...params)});
 }
 if(path==='/api/corrections'&&method==='POST'){
  const seconds=Number(body.requested_seconds),reason=text(body.reason);
  if(!validDay(body.work_date)||body.work_date>today()||!Number.isInteger(seconds)||seconds<0||seconds>86400||!reason)fail(400,'Provide a past or current work date, active seconds between 0 and 86400, and a reason.');
  const id=uid();
  try{await dbRun(env,'INSERT INTO attendance_corrections (id,user_id,work_date,requested_seconds,reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',id,user.id,body.work_date,seconds,reason,date,date);}catch(e){if(String(e).includes('UNIQUE'))fail(409,'A correction is already awaiting review for this date.');throw e;}
  await audit(env,user,'attendance.correction_requested','correction',id,'');
  await notifyReviewers(env,helpers,user,'Attendance correction requested',`${user.name} requested an attendance correction.`,'attendance');
  return json({correction:await dbOne(env,'SELECT * FROM attendance_corrections WHERE id=?',id)},201);
 }
 const correctionMatch=path.match(/^\/api\/corrections\/([^/]+)$/);
 if(correctionMatch&&method==='PATCH'){
  if(!isHR(user))fail(403,'HR or a founder must review attendance corrections.');
  const item=await dbOne(env,'SELECT * FROM attendance_corrections WHERE id=?',correctionMatch[1]);
  if(!item)fail(404,'Correction not found.');
  if(item.user_id===user.id)fail(403,'You cannot approve or reject your own correction.');
  if(item.status!=='pending')fail(409,'This correction has already been reviewed.');
  if(!['approve','reject'].includes(body.action))fail(400,'Choose approve or reject.');
  const next=body.action==='approve'?'approved':'rejected',note=text(body.review_note);
  if(!note)fail(400,'Add a review note for the official record.');
  const statements=[env.DB.prepare("UPDATE attendance_corrections SET status=?,reviewed_by=?,review_note=?,updated_at=? WHERE id=? AND status='pending'").bind(next,user.id,note,date,item.id)];
  if(next==='approved'){
   const start=new Date(`${item.work_date}T00:00:00+05:30`).toISOString();
   const end=new Date(Date.parse(start)+item.requested_seconds*1000).toISOString();
   statements.push(env.DB.prepare("UPDATE attendance_sessions SET active_seconds=0,state='closed',clock_out=COALESCE(clock_out,?),active_started_at=NULL,break_started_at=NULL,updated_at=? WHERE user_id=? AND work_date=? AND changes()>0").bind(date,date,item.user_id,item.work_date));
   statements.push(env.DB.prepare("INSERT OR IGNORE INTO attendance_sessions (id,user_id,work_date,clock_in,clock_out,state,active_seconds,updated_at,source) SELECT ?,?,?,?,?,'closed',?,?,'correction' WHERE EXISTS(SELECT 1 FROM attendance_corrections WHERE id=? AND status='approved' AND reviewed_by=? AND updated_at=?)").bind(`correction:${item.id}`,item.user_id,item.work_date,start,end,item.requested_seconds,date,item.id,user.id,date));
  }
  const results=await env.DB.batch(statements);
  if(!results[0].meta?.changes)fail(409,'This correction changed. Refresh and retry.');
  await audit(env,user,`attendance.correction_${next}`,'correction',item.id,note);
  await notify(env,item.user_id,`Attendance correction ${next}`,note,'attendance');
  return json({correction:await dbOne(env,'SELECT * FROM attendance_corrections WHERE id=?',item.id)});
 }
 if(path==='/api/leaves'&&method==='GET'){
  const visibility=scope(user);
  return json({leaves:await dbRows(env,`${leaveSelect} WHERE ${visibility.clause} ORDER BY l.created_at DESC LIMIT 300`,...visibility.params)});
 }
 if(path==='/api/leaves'&&method==='POST'){
  validateRange(body.start_date,body.end_date);
  const reason=text(body.reason),type=body.type;
  if(!reason||!['examination','academic','medical','personal','emergency'].includes(type))fail(400,'Select a leave category and provide a reason.');
  if(body.end_date<today())fail(400,'Leave requests must include today or a future date.');
  let handover=null;
  if(body.handover_to){handover=await dbOne(env,"SELECT id,name,status FROM users WHERE id=? AND id<>? AND status NOT IN ('suspended','exited','on_leave')",body.handover_to,user.id);if(!handover)fail(400,'Choose another available team member for the handover.');}
  const id=uid(),notes=text(body.handover_notes);
  const result=await dbRun(env,"INSERT INTO leave_requests (id,user_id,type,start_date,end_date,reason,handover_to,handover_notes,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM leave_requests WHERE user_id=? AND status!='rejected' AND start_date<=? AND end_date>=?)",id,user.id,type,body.start_date,body.end_date,reason,handover?.id||null,notes,date,date,user.id,body.end_date,body.start_date);
  if(!result.meta?.changes)fail(409,'You already have a pending or approved leave request for these dates.');
  await audit(env,user,'leave.requested','leave',id,'');
  await notifyReviewers(env,helpers,user,'Leave review requested',`${user.name} requested ${type} leave, ${body.start_date} to ${body.end_date}.`,'leave');
  return json({leave:await getLeave(id)},201);
 }
 const leaveMatch=path.match(/^\/api\/leaves\/([^/]+)$/);
 if(leaveMatch&&method==='PATCH'){
  const item=await getLeave(leaveMatch[1]),action=body.action,note=text(body.note);
  if(item.user_id===user.id)fail(403,'Another authorised person must review your leave request.');
  if(['approved','rejected'].includes(item.status))fail(409,'This leave request has already been finalised.');
  const leadReviewer=user.role==='founder'||item.manager_id===user.id||(isLead(user)&&user.department===item.department);
  let next=item.status;
  if(action==='recommend'){if(!leadReviewer)fail(403,'The reporting lead or a founder must review this request.');if(item.status!=='pending_lead')fail(409,'This request is already awaiting HR.');next='pending_hr';}
  else if(action==='approve'){if(!isHR(user))fail(403,'HR or a founder must give final approval.');if(item.status!=='pending_hr')fail(409,'The reporting lead must recommend this request first.');if(item.leader_id===user.id)fail(403,'Final verification must be completed by a different authorised reviewer.');next='approved';}
  else if(action==='reject'){if(!isHR(user)&&!leadReviewer)fail(403,'Only HR, founders, or the reporting lead can reject this request.');if(!note)fail(400,'Add a reason for rejecting this request.');next='rejected';}
  else fail(400,'Unknown leave action.');
  if(next==='approved'&&item.handover_to){
   const person=await dbOne(env,'SELECT status FROM users WHERE id=?',item.handover_to);
   const unavailable=await dbOne(env,"SELECT id FROM leave_requests WHERE user_id=? AND status='approved' AND start_date<=? AND end_date>=?",item.handover_to,item.end_date,item.start_date);
   if(!person||['on_leave','suspended','exited'].includes(person.status)||unavailable)fail(409,'The handover recipient is unavailable during these dates. Reject this request with an explanation so the employee can resubmit with an available handover recipient.');
  }
  let sql,params;
  if(action==='recommend'){sql='UPDATE leave_requests SET status=?,leader_id=?,leader_note=?,updated_at=? WHERE id=? AND status=?';params=[next,user.id,note,date,item.id,item.status];}
  else {sql='UPDATE leave_requests SET status=?,hr_id=?,hr_note=?,updated_at=? WHERE id=? AND status=?';params=[next,user.id,note,date,item.id,item.status];}
  const mutations=[env.DB.prepare(sql).bind(...params)];
  if(next==='approved'&&item.handover_to)mutations.push(env.DB.prepare("INSERT INTO handovers (id,leave_id,from_user,to_user,start_date,end_date,notes,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM leave_requests WHERE id=? AND status='approved' AND hr_id=? AND updated_at=?) ON CONFLICT(leave_id) DO NOTHING").bind(uid(),item.id,item.user_id,item.handover_to,item.start_date,item.end_date,item.handover_notes,date,item.id,user.id,date));
  const results=await env.DB.batch(mutations);if(!results[0].meta?.changes)fail(409,'This leave request changed. Refresh and retry.');
  await audit(env,user,`leave.${action}`,'leave',item.id,'');
  await notify(env,item.user_id,next==='pending_hr'?'Leave recommended to HR':`Leave ${next}`,`${item.start_date} to ${item.end_date}${note?`: ${note}`:''}`,'leave');
  if(next==='pending_hr'){const reviewers=await dbRows(env,"SELECT id FROM users WHERE role IN ('founder','hr_lead','hr_member') AND id<>? AND id<>? AND status NOT IN ('suspended','exited')",item.user_id,user.id);for(const r of reviewers)await notify(env,r.id,'Leave awaiting final verification',`${item.name}: ${item.start_date} to ${item.end_date}.`,'leave');}
  if(next==='approved'&&item.handover_to)await notify(env,item.handover_to,'Handover confirmed',`${item.name} assigned a handover, ${item.start_date} to ${item.end_date}. ${item.handover_notes}`,'calendar');
  return json({leave:await getLeave(item.id)});
 }
 if(path==='/api/calendar'&&method==='GET'){
  const leaves=await dbRows(env,"SELECT l.id,l.user_id,u.name,u.department,u.manager_id,l.type,l.start_date,l.end_date,l.handover_to,h.name handover_name,l.handover_notes FROM leave_requests l JOIN users u ON u.id=l.user_id LEFT JOIN users h ON h.id=l.handover_to WHERE l.status='approved' AND l.end_date>=? ORDER BY l.start_date LIMIT 500",today());
  const availability=await dbRows(env,'SELECT a.*,u.name FROM availability a JOIN users u ON u.id=a.user_id WHERE a.end_date>=? ORDER BY a.start_date LIMIT 500',today());
  const handovers=await dbRows(env,'SELECT h.*,a.name from_name,b.name to_name FROM handovers h JOIN users a ON a.id=h.from_user JOIN users b ON b.id=h.to_user WHERE h.end_date>=? ORDER BY h.start_date LIMIT 500',today());
  const on_leave=await dbRows(env,"SELECT id,name,department,status FROM users WHERE status='on_leave'");
  return json({calendar:{leaves:leaves.map(l=>{const {manager_id,...entry}=l;return {...entry,type:isHR(user)||l.user_id===user.id||manager_id===user.id?l.type:'leave'};}),availability,handovers,on_leave}});
 }
 if(path==='/api/availability'&&method==='POST'){
  validateRange(body.start_date,body.end_date);
  if(!['exam','unavailable','available','weekly_schedule'].includes(body.kind))fail(400,'Choose a valid availability category.');
  const id=uid();await dbRun(env,'INSERT INTO availability (id,user_id,kind,start_date,end_date,notes,created_at) VALUES (?,?,?,?,?,?,?)',id,user.id,body.kind,body.start_date,body.end_date,text(body.notes),date);
  await audit(env,user,'availability.updated','availability',id,'');
  return json({availability:await dbOne(env,'SELECT * FROM availability WHERE id=?',id)},201);
 }
 const availabilityMatch=path.match(/^\/api\/availability\/([^/]+)$/);
 if(availabilityMatch&&method==='DELETE'){
  const row=await dbOne(env,'SELECT * FROM availability WHERE id=?',availabilityMatch[1]);if(!row)fail(404,'Availability entry not found.');if(row.user_id!==user.id&&!isHR(user))fail(403,'Only the owner or HR can remove an availability entry.');await dbRun(env,'DELETE FROM availability WHERE id=?',row.id);await audit(env,user,'availability.deleted','availability',row.id,'');return json({ok:true});
 }
 if(path==='/api/notifications'&&method==='GET'){
  const list=await dbRows(env,'SELECT id,title,body,link,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 200',user.id);
  const count=await dbOne(env,'SELECT COUNT(*) count FROM notifications WHERE user_id=? AND read_at IS NULL',user.id);
  return json({notifications:list,unread:count.count});
 }
 if(path==='/api/notifications/read'&&method==='POST'){
  if(body.id)await dbRun(env,'UPDATE notifications SET read_at=? WHERE id=? AND user_id=?',date,body.id,user.id);else await dbRun(env,'UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL',date,user.id);return json({ok:true});
 }
 return null;
}

export async function runAutomations(env) {
 const date=stamp(),day=today();
 const attendance_reminders=await runAttendanceReminders(env,date);
 const notices=[];
 const insertNotice=async(userId,title,body,link,key)=>{notices.push([uid(),userId,title,body,link,date,key]);};
 const flushNotices=async()=>{
  // D1 allows 100 bound parameters per statement. Ten rows keep each insert at 70.
  for(let offset=0;offset<notices.length;offset+=10){
   const batch=notices.slice(offset,offset+10);
   await dbRun(env,`INSERT OR IGNORE INTO notifications (id,user_id,title,body,link,created_at,dedupe_key) VALUES ${batch.map(()=>'(?,?,?,?,?,?,?)').join(',')}`,...batch.flat());
  }
 };
 const open=await dbRows(env,'SELECT user_id FROM attendance_sessions WHERE clock_out IS NULL AND work_date<?',day);
 for(const row of open)await rolloverSession(env,row.user_id,date);
 const tasks=await dbRows(env,"SELECT id,title,assignee_id,leader_id,deadline,status,updated_at FROM tasks WHERE status!='done' AND deadline<?",day);
 for(const t of tasks){await insertNotice(t.assignee_id,'Assignment overdue',`${t.title} was due ${t.deadline}. Update the deliverable or discuss the deadline with your lead.`,'tasks',`overdue:${day}:${t.id}:${t.assignee_id}`);if(t.leader_id!==t.assignee_id)await insertNotice(t.leader_id,'Overdue assignment needs attention',`${t.title} was due ${t.deadline}.`,'tasks',`overdue:${day}:${t.id}:${t.leader_id}`);}
 const reviews=await dbRows(env,"SELECT id,title,leader_id FROM tasks WHERE status='review' AND updated_at<?",new Date(Date.now()-48*3600000).toISOString());
 for(const t of reviews)await insertNotice(t.leader_id,'Review waiting over 48 hours',t.title,'tasks',`review:${day}:${t.id}`);
 const inactive=await dbRows(env,"SELECT id,title,assignee_id FROM tasks WHERE status IN ('todo','working','revision') AND updated_at<?",new Date(Date.now()-72*3600000).toISOString());
 for(const t of inactive)await insertNotice(t.assignee_id,'Assignment update requested',`${t.title} has not changed for three days. Add progress or discuss academic availability.`,'tasks',`inactive:${day}:${t.id}`);
 const sessions=await dbRows(env,"SELECT id,user_id,clock_in FROM attendance_sessions WHERE clock_out IS NULL AND clock_in<?",new Date(Date.now()-12*3600000).toISOString());
 for(const s of sessions)await insertNotice(s.user_id,'Open attendance session',`Your work session started ${s.clock_in}. Clock out or request a correction if needed.`,'attendance',`open-session:${day}:${s.id}`);
 const leaves=await dbRows(env,"SELECT l.id,l.user_id,l.start_date,l.end_date,u.name FROM leave_requests l JOIN users u ON u.id=l.user_id WHERE l.status='approved' AND l.start_date<=? AND l.end_date>=?",day,day);
 for(const l of leaves)await insertNotice(l.user_id,'Approved leave is active',`Your approved leave runs ${l.start_date} to ${l.end_date}.`,'calendar',`leave-active:${day}:${l.id}`);
 const pending=await dbRows(env,"SELECT l.id,l.user_id,l.status,l.start_date,l.leader_id,u.name,u.manager_id FROM leave_requests l JOIN users u ON u.id=l.user_id WHERE l.status IN ('pending_lead','pending_hr') AND l.created_at<?",new Date(Date.now()-48*3600000).toISOString());
 for(const l of pending){const reviewers=await dbRows(env,l.status==='pending_hr'?"SELECT id FROM users WHERE role IN ('founder','hr_lead','hr_member') AND id<>? AND id<>? AND status NOT IN ('suspended','exited')":"SELECT id FROM users WHERE (role='founder' OR id=?) AND id<>? AND status NOT IN ('suspended','exited')",...(l.status==='pending_hr'?[l.user_id,l.leader_id||'']:[l.manager_id||'',l.user_id]));for(const r of reviewers)await insertNotice(r.id,'Leave approval waiting over 48 hours',`${l.name}'s leave starts ${l.start_date}.`,'leave',`pending-leave:${day}:${l.id}:${r.id}`);}
 const repeated=await dbRows(env,"SELECT t.assignee_id,t.leader_id,u.name,COUNT(*) count FROM tasks t JOIN users u ON u.id=t.assignee_id WHERE t.status!='done' AND t.deadline<? GROUP BY t.assignee_id,t.leader_id HAVING COUNT(*)>=3",day);
 for(const row of repeated)await insertNotice(row.leader_id,'Delivery pattern needs a conversation',`${row.name} has ${row.count} overdue assignments. Review workload, academic commitments and handover needs together before deciding next steps.`,'tasks',`repeated-overdue:${day}:${row.assignee_id}:${row.leader_id}`);
 const meetings=await dbRows(env,'SELECT id,title,starts_at,participants_json,created_by FROM meetings WHERE starts_at>? AND starts_at<=?',date,new Date(Date.now()+24*3600000).toISOString());
 for(const meeting of meetings){let participants=[];try{participants=JSON.parse(meeting.participants_json)||[];}catch{};const ids=[...new Set([...participants,meeting.created_by])].filter(x=>typeof x==='string');for(const person of ids)await insertNotice(person,'Upcoming meeting',`${meeting.title} starts ${meeting.starts_at}.`,'meetings',`meeting:${meeting.id}:${person}`);await queueMeetingDeliveries(env,meeting,'reminder');}
 const isMonday=new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:TZ}).format(new Date())==='Mon';
 if(isMonday){const leaders=await dbRows(env,"SELECT id,role,department FROM users WHERE role IN ('founder','hr_lead','team_lead','finance_head') AND status NOT IN ('suspended','exited','on_leave')");for(const leader of leaders){const filter=leader.role==='founder'?'1=1':'department=?',p=leader.role==='founder'?[]:[leader.department];const summary=await dbOne(env,`SELECT COUNT(*) total,SUM(CASE WHEN status='review' THEN 1 ELSE 0 END) reviews,SUM(CASE WHEN deadline<? AND status!='done' THEN 1 ELSE 0 END) overdue FROM tasks WHERE status!='done' AND ${filter}`,day,...p);await insertNotice(leader.id,'Weekly operations summary',`${summary.total} active assignments; ${summary.reviews||0} awaiting review; ${summary.overdue||0} overdue. Review workload and approved leave before assigning work.`,'reports',`weekly:${day}:${leader.id}`);}}
 const whatsapp_delivery=await deliverMeetingWhatsApp(env);
 await dbRun(env,'DELETE FROM sessions WHERE expires_at<?',date);
 await dbRun(env,'DELETE FROM activity_events WHERE created_at<?',new Date(Date.now()-30*86400000).toISOString());
 await dbRun(env,'DELETE FROM activity_sessions WHERE last_seen<?',new Date(Date.now()-7*86400000).toISOString());
 await flushNotices();
 await dbRun(env,'INSERT OR REPLACE INTO automation_runs (key,created_at) VALUES (?,?)','last_success',date);
 return {overdue:tasks.length,pending_reviews:reviews.length,open_sessions:sessions.length,attendance_reminders,whatsapp_delivery,at:date};
}
