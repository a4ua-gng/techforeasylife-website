import {id,now,day,fail,json,rows,one,run,audit,notify,requireRole,text,safeUser,salt,hashPassword,randomPassword} from './core.js';
import {presenceSQL} from './extensions.js';
const hr=u=>['founder','hr_lead','hr_member'].includes(u.role);
const roles=['founder','hr_lead','hr_member','team_lead','employee','finance_head'];
const departments=['Leadership','HR','Marketing','Finance','Strategy'];
export async function handleAdmin({request,url,env,user,body}){
 const p=url.pathname,m=request.method;
 if(p==='/api/people'&&m==='GET'){
  const people=await rows(env,`SELECT u.id,u.employee_id,u.username,u.name,u.designation,u.role,u.department,u.manager_id,u.joined_on,u.status,
   (SELECT full_name FROM employee_profiles ep WHERE ep.user_id=u.id) AS full_name,
   CASE WHEN EXISTS(SELECT 1 FROM employee_profiles ep WHERE ep.user_id=u.id AND ep.photo_key IS NOT NULL) THEN '/api/people/'||u.id||'/photo' ELSE NULL END AS photo_url,
   ${presenceSQL()} AS presence,
   CASE WHEN u.status IN ('suspended','exited') THEN 'unavailable'
   WHEN u.status='on_leave' OR EXISTS(SELECT 1 FROM leave_requests l WHERE l.user_id=u.id AND l.status='approved' AND l.start_date<=? AND l.end_date>=?) THEN 'on_leave'
   WHEN EXISTS(SELECT 1 FROM attendance_sessions a WHERE a.user_id=u.id AND a.clock_out IS NULL AND a.state='working') THEN 'working'
   WHEN EXISTS(SELECT 1 FROM attendance_sessions a WHERE a.user_id=u.id AND a.clock_out IS NULL AND a.state='break') THEN 'on_break'
   WHEN EXISTS(SELECT 1 FROM availability a WHERE a.user_id=u.id AND a.start_date<=? AND a.end_date>=? AND a.kind IN ('exam','unavailable')) THEN 'unavailable'
   WHEN u.status IN ('suspended','exited') THEN 'unavailable' ELSE 'offline' END AS crew_status FROM users u ORDER BY u.employee_id`,new Date(Date.now()-90000).toISOString(),new Date(Date.now()-90000).toISOString(),day(),day(),day(),day());
  return json({people});
 }
 if(p==='/api/people'&&m==='POST'){
  requireRole(user,'founder','hr_lead','hr_member');
  const username=text(body.username,60,true).toLowerCase(),name=text(body.name,100,true),role=body.role||'employee',department=text(body.department,60,true);
  if(!/^[a-z0-9._-]{2,60}$/.test(username)||!roles.includes(role)||!departments.includes(department))fail(400,'Use a valid username, role, and department.');
  if(user.role!=='founder'&&role!=='employee')fail(403,'Only founders can grant leadership or HR permissions.');
  if(body.manager_id!=null&&typeof body.manager_id!=='string')fail(400,'Select a valid reporting manager.');
  const manager=body.manager_id?await one(env,'SELECT id,role,department,status FROM users WHERE id=?',body.manager_id):null;
  if(body.manager_id&&(!manager||['exited','suspended'].includes(manager.status)))fail(400,'Select an active reporting manager.');
  if(role==='employee'&&(!manager||!['founder','hr_lead','team_lead','finance_head'].includes(manager.role)||(manager.department!==department&&manager.role!=='founder')))fail(400,'Choose a leader in this department as reporting manager.');
  const uid=id(),s=salt(),temporary_password=randomPassword(),employee_id='TEL-'+id().slice(0,8).toUpperCase();
  const joined=text(body.joined_on,10)||day();if(!/^\d{4}-\d{2}-\d{2}$/.test(joined)||Number.isNaN(Date.parse(joined))||new Date(joined+'T00:00:00Z').toISOString().slice(0,10)!==joined)fail(400,'Provide a valid joining date.');
  const hash=await hashPassword(temporary_password,s);
  try{await env.DB.batch([env.DB.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,manager_id,email,phone,joined_on,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(uid,employee_id,username,name,text(body.designation,100)||'Team member',role,department,manager?.id||null,text(body.email,150),text(body.phone,40),joined,hash,s,now()),env.DB.prepare('INSERT INTO onboarding(user_id) VALUES(?)').bind(uid)]);}catch(e){if(String(e).includes('UNIQUE'))fail(409,'Username already exists.');throw e;}
  await audit(env,user,'employee_registered','user',uid);return json({user:await one(env,'SELECT id,employee_id,username,name,role,department FROM users WHERE id=?',uid),temporary_password},201);
 }
 const person=p.match(/^\/api\/people\/([^/]+)$/);
 if(person&&m==='GET'){if(!hr(user)&&person[1]!==user.id)fail(403,'Private employee details are restricted.');const record=await one(env,'SELECT * FROM users WHERE id=?',person[1]);if(!record)fail(404,'Employee not found.');const onboarding=await one(env,'SELECT o.*,g.completed_at AS guide_completed_at FROM onboarding o LEFT JOIN guide_progress g ON g.user_id=o.user_id WHERE o.user_id=?',record.id);const profile=await one(env,'SELECT * FROM employee_profiles WHERE user_id=?',record.id);return json({user:{...safeUser(record),email:record.email,phone:record.phone},onboarding,profile:profile?{full_name:profile.full_name,details:JSON.parse(profile.private_json),source_pages:JSON.parse(profile.source_pages),photo_url:profile.photo_key?`/api/people/${record.id}/photo`:null}:null});}
 if(person&&m==='PATCH'){
  requireRole(user,'founder','hr_lead','hr_member');const target=await one(env,'SELECT * FROM users WHERE id=?',person[1]);if(!target)fail(404,'Employee not found.');
  if(user.role!=='founder'&&['founder','hr_lead'].includes(target.role))fail(403,'A founder must update this leadership account.');
  if(body.manager_id!=null&&typeof body.manager_id!=='string')fail(400,'Select a valid reporting manager.');
  const role=body.role??target.role,department=body.department??target.department,manager_id=body.manager_id===undefined?target.manager_id:body.manager_id||null;
  if(role!==target.role&&user.role!=='founder')fail(403,'Only founders can change permissions.');
  if(!roles.includes(role)||!departments.includes(department))fail(400,'Invalid role or department.');
  if(target.role==='founder'&&role!=='founder'){if(target.id===user.id)fail(403,'You cannot remove your own founder access.');const c=await one(env,"SELECT COUNT(*) n FROM users WHERE role='founder' AND status='active'");if(c.n<2)fail(409,'Keep at least one active founder.');}
  const manager=manager_id?await one(env,'SELECT * FROM users WHERE id=?',manager_id):null;
  if(manager_id&&(!manager||manager_id===target.id||['suspended','exited'].includes(manager.status)))fail(400,'Select another active employee as manager.');
  if(role==='employee'&&(!manager||!['founder','hr_lead','team_lead','finance_head'].includes(manager.role)||(manager.department!==department&&manager.role!=='founder')))fail(400,'Choose a leader in this department as reporting manager.');
  if(manager){let next=manager;const visited=new Set([target.id]);while(next){if(visited.has(next.id))fail(400,'Reporting managers cannot form a cycle.');visited.add(next.id);next=next.manager_id?await one(env,'SELECT id,manager_id FROM users WHERE id=?',next.manager_id):null;}}
  const joined=body.joined_on===undefined?target.joined_on:text(body.joined_on,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(joined)||Number.isNaN(Date.parse(joined))||new Date(joined+'T00:00:00Z').toISOString().slice(0,10)!==joined)fail(400,'Provide a valid joining date.');
  const statements=[env.DB.prepare('UPDATE users SET name=?,designation=?,role=?,department=?,manager_id=?,email=?,phone=?,joined_on=? WHERE id=?').bind(body.name===undefined?target.name:text(body.name,100,true),body.designation===undefined?target.designation:text(body.designation,100,true),role,department,manager_id,body.email===undefined?target.email:text(body.email,150),body.phone===undefined?target.phone:text(body.phone,40),joined,target.id)];
  if(role!==target.role||department!==target.department||manager_id!==target.manager_id)statements.push(env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id));
  await env.DB.batch(statements);
  await audit(env,user,'employee_updated','user',target.id);return json({ok:true});
 }
 const reset=p.match(/^\/api\/people\/([^/]+)\/reset-password$/);
 if(reset&&m==='POST'){
  requireRole(user,'founder','hr_lead','hr_member');const target=await one(env,'SELECT * FROM users WHERE id=?',reset[1]);if(!target)fail(404,'Employee not found.');
  if(target.id===user.id)fail(400,'Change your own password in Account settings.');
  if(user.role!=='founder'&&(target.role==='founder'||target.role==='hr_lead'||(user.role==='hr_member'&&target.role!=='employee')))fail(403,'A founder or HR lead must reset this account.');
  const temporary_password=randomPassword(),s=salt();await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,must_change_password=1 WHERE id=?').bind(await hashPassword(temporary_password,s),s,target.id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id)]);await audit(env,user,'password_reset','user',target.id);return json({temporary_password});
 }
 if(p==='/api/onboarding/acknowledge'&&m==='POST'){await run(env,"UPDATE onboarding SET stage='active',policy_acknowledged_at=?,completed_at=? WHERE user_id=?",now(),now(),user.id);await audit(env,user,'policy_acknowledged','onboarding',user.id);return json({ok:true});}
 if(p==='/api/onboarding/guide'&&m==='POST'){await run(env,'INSERT INTO guide_progress(user_id,completed_at) VALUES(?,?) ON CONFLICT(user_id) DO NOTHING',user.id,now());await audit(env,user,'navigation_guide_completed','onboarding',user.id);return json({ok:true});}
 if(p==='/api/status-requests'&&m==='GET'){requireRole(user,'founder','hr_lead','hr_member');return json({requests:await rows(env,'SELECT s.*,u.name,u.username,r.name AS requested_by_name FROM status_requests s JOIN users u ON u.id=s.user_id JOIN users r ON r.id=s.requested_by ORDER BY s.created_at DESC LIMIT 200')});}
 const status=p.match(/^\/api\/people\/([^/]+)\/status-request$/);
 if(status&&m==='POST'){
  requireRole(user,'founder','hr_lead','hr_member');if(!['active','on_leave','suspended','exited'].includes(body.status))fail(400,'Invalid account status.');const target=await one(env,'SELECT * FROM users WHERE id=?',status[1]);if(!target)fail(404,'Employee not found.');if(target.id===user.id&&body.status!=='exited')fail(403,'Another administrator must request your status change.');if(target.role==='founder'&&user.role!=='founder')fail(403,'A founder must request changes to founder accounts.');const rid=id();await run(env,'INSERT INTO status_requests(id,user_id,requested_by,status,reason,created_at) VALUES(?,?,?,?,?,?)',rid,target.id,user.id,body.status,text(body.reason,2000,true),now());const approvers=await rows(env,"SELECT id FROM users WHERE role='founder' AND status='active' AND id<>?",user.id);for(const a of approvers)await notify(env,a.id,'Account status review',`${target.name}: requested ${body.status}.`,'#hr');await audit(env,user,'status_change_requested','user',target.id);return json({id:rid},201);
 }
 const review=p.match(/^\/api\/status-requests\/([^/]+)$/);
 if(review&&m==='PATCH'){
  requireRole(user,'founder');const r=await one(env,'SELECT s.*,u.role FROM status_requests s JOIN users u ON u.id=s.user_id WHERE s.id=?',review[1]);if(!r)fail(404,'Request not found.');if(r.state!=='pending')fail(409,'This request was already reviewed.');if(r.requested_by===user.id||r.user_id===user.id)fail(403,'An independent founder must review this change.');if(!['approve','reject'].includes(body.action))fail(400,'Choose approve or reject.');
  if(body.action==='approve'&&r.role==='founder'&&['suspended','exited','on_leave'].includes(r.status)){const c=await one(env,"SELECT COUNT(*) n FROM users WHERE role='founder' AND status='active' AND id<>?",r.user_id);if(!c.n)fail(409,'Keep at least one active founder.');}
  const change=env.DB.prepare("UPDATE status_requests SET state=?,reviewed_by=?,reviewed_at=?,review_note=? WHERE id=? AND state='pending'").bind(body.action==='approve'?'approved':'rejected',user.id,now(),text(body.comment,2000),r.id);
  const statements=[change];if(body.action==='approve'){statements.push(env.DB.prepare("UPDATE users SET status=? WHERE id=? AND EXISTS(SELECT 1 FROM status_requests WHERE id=? AND state='approved' AND reviewed_by=?)").bind(r.status,r.user_id,r.id,user.id));if(['suspended','exited'].includes(r.status))statements.push(env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(r.user_id));}
  const result=await env.DB.batch(statements);if(!result[0].meta.changes)fail(409,'This request was already reviewed.');await audit(env,user,'status_change_'+body.action,'user',r.user_id);await notify(env,r.user_id,'Account status request reviewed',`Your status request was ${body.action==='approve'?'approved':'rejected'}.`,'#account');return json({ok:true});
 }
 if(p==='/api/audit'&&m==='GET'){requireRole(user,'founder');return json({events:await rows(env,'SELECT a.id,a.action,a.entity,a.entity_id,a.created_at,u.name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 200')});}
 if(p==='/api/reports'&&m==='GET'){
  const tasks=user.role==='founder'||hr(user)?await rows(env,'SELECT * FROM tasks'):['team_lead','finance_head'].includes(user.role)?await rows(env,'SELECT * FROM tasks WHERE department=?',user.department):await rows(env,'SELECT * FROM tasks WHERE assignee_id=?',user.id);
  const t=day(),people=await one(env,"SELECT COUNT(*) n,SUM(status='on_leave' OR EXISTS(SELECT 1 FROM leave_requests l WHERE l.user_id=users.id AND l.status='approved' AND l.start_date<=? AND l.end_date>=?)) on_leave FROM users WHERE status NOT IN ('suspended','exited')",day(),day());
  const current=await one(env,"SELECT COUNT(*) n FROM attendance_sessions WHERE clock_out IS NULL AND state='working'");
  const workload={};for(const task of tasks){const row=workload[task.department]||={department:task.department,total:0,working:0,review:0,overdue:0};if(task.status!=='done')row.total++;if(task.status==='working')row.working++;if(task.status==='review')row.review++;if(task.deadline<t&&task.status!=='done')row.overdue++;}
  const pending=await one(env,"SELECT COUNT(*) n FROM leave_requests WHERE status IN ('pending_lead','pending_hr')" );
  const recent=user.role==='founder'?await rows(env,'SELECT a.action,a.entity,a.created_at,u.name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 8'):[];
  return json({summary:{people:people.n,on_leave:people.on_leave||0,working:current.n,active_tasks:tasks.filter(x=>x.status!=='done').length,overdue_tasks:tasks.filter(x=>x.status!=='done'&&x.deadline<t).length,pending_reviews:tasks.filter(x=>x.status==='review').length,pending_leaves:pending.n,department_workload:Object.values(workload),recent_activity:recent,policy:{daily_target_hours:4,timezone:'Asia/Kolkata'}}});
 }
 return null;
}
