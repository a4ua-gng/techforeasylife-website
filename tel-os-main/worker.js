// TEL OS Worker. Dashboard HTML is injected at deployment without changing this source.
const HTML = "__INJECT_HTML__";
const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const now=()=>Date.now();
const uid=()=>crypto.randomUUID();
const day=(t=now())=>new Date(t+19800000).toISOString().slice(0,10);
const hourIST=(t=now())=>new Date(t+19800000).getUTCHours();
const clamp=(v,max=300)=>String(v??'').trim().slice(0,max);
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'');
const roles=['founder','hr','lead','employee'];
const hms = /^([01]\d|2[0-3]):[0-5]\d$/;
const safeUrl = v => {try{const u=new URL(v);return u.protocol==='https:'&&u.username===''&&u.password===''&&v.length<900?v:''}catch{return ''}};
const notify = async (db,to,title,message='') => { if(to)await db.prepare('INSERT INTO notifications VALUES(?,?,?,?,0,?)').bind(uid(),to,clamp(title,100),clamp(message,350),now()).run() };
const isAdmin = u => u && ['founder','hr'].includes(u.role);
const canReviewTask = async(db,u,t)=>u.role==='founder'||u.role==='hr'||(u.role==='lead'&&!!await db.prepare('SELECT 1 FROM users WHERE id=? AND department=(SELECT department FROM users WHERE id=?)').bind(t.assignee_id,u.id).first());
const privileged=u=>u&&['founder','hr'].includes(u.role);
const managers=u=>u&&['founder','hr','lead'].includes(u.role);
function bytesHex(bytes){return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')}
function hexBytes(s){return new Uint8Array(s.match(/.{1,2}/g).map(x=>parseInt(x,16)))}
async function sha(v){return bytesHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))))}
async function hashPw(password,salt){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return bytesHex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:hexBytes(salt),iterations:160000,hash:'SHA-256'},k,256)))}
function safeCompareHex(a,b){if(!a||!b||a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0}
function strongPassword(p){return typeof p==='string' && p.length>=12 && p.length<=120}
const cookie=(token,max=43200)=>`tel_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${max}`;
const error=(m,s=400)=>json({error:m},s);
async function audit(db,actor,action,entity,detail=''){await db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?)').bind(uid(),actor?.id||null,action,entity,clamp(detail,400),now()).run()}
async function authenticate(request,db){const token=(request.headers.get('cookie')||'').match(/(?:^|;\s*)tel_session=([a-f0-9]{64})/i)?.[1];if(!token)return null;const user=await db.prepare(`SELECT u.id,u.name,u.username,u.role,u.is_minor,u.active,u.force_reset,u.last_seen FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).bind(await sha(token),now()).first();return user?.active?user:null}
const publicUser=u=>({id:u.id,name:u.name,username:u.username,role:u.role,is_minor:!!u.is_minor,active:!!u.active,force_reset:!!u.force_reset,last_seen:u.last_seen||0});
const result=async q=>await q.all().then(r=>r.results||[]);
const jsonBody=async r=>{const t=await r.text();if(t.length>10000)throw Error('Request too large');return JSON.parse(t||'{}')};
function elapsed(s,t=now()){if(!s)return 0;const end=s.end_at||t;let paused=s.break_ms||0;if(s.state==='break'&&s.break_started_at)paused+=end-s.break_started_at;return Math.max(0,end-s.start_at-paused)}
const ktime=t=>new Date(t).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'});
const badOrigin=r=>{const origin=r.headers.get('origin');return origin!==new URL(r.url).origin};
async function handle(request,env){
 const url=new URL(request.url);const path=url.pathname;const db=env.DB;
 if(path==='/api/health')return json({ok:true,app:'TEL OS',version:'1.0-beta',auth:'required'});
 if(path==='/'||path==='/index.html')return new Response(HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}});
 if(!path.startsWith('/api/'))return error('Not found',404);
 if(!db)return error('Database not configured',503);
 if(path==='/api/setup/status'&&request.method==='GET'){const n=await db.prepare('SELECT count(*) n FROM users').first();return json({needs_setup:!n.n})}
 if(request.method!=='GET'&&(badOrigin(request)||!request.headers.get('content-type')?.startsWith('application/json')))return error('Invalid request origin or content type',403);
 const u=await authenticate(request,db);
 if(path==='/api/setup'&&request.method==='POST'){
  const existing=await db.prepare('SELECT count(*) n FROM users').first();
  if(existing.n)return error('Setup has already been completed',403);
  if(!env.SETUP_CODE)return error('Setup is not enabled',503);
  const b=await jsonBody(request);
  const code=String(b.setup_code||'');
  if(code.length!==env.SETUP_CODE.length)return error('Invalid setup code',403);
  let diff=0;for(let i=0;i<code.length;i++)diff|=code.charCodeAt(i)^env.SETUP_CODE.charCodeAt(i);
  if(diff)return error('Invalid setup code',403);
  const username=clamp(b.username,60).toLowerCase(),name=clamp(b.name,100);
  if(!/^[a-z0-9._-]{3,60}$/.test(username)||!name||!strongPassword(b.password))return error('Provide your name, valid login and a 12+ character password');
  const salt=bytesHex(crypto.getRandomValues(new Uint8Array(16)));
  const id=uid();
  try{await db.prepare(`INSERT INTO users(id,name,username,role,password_salt,password_hash,is_minor,active,force_reset,created_at,department,designation,joining_date) VALUES(?,?,?,'founder',?,?,?,1,0,?,'Management','Founder',?)`).bind(id,name,username,salt,await hashPw(b.password,salt),b.is_minor===true?1:0,now(),day()).run()}catch{return error('Setup was already completed',403)}
  await audit(db,{id},'founder_setup','user','Initial one-time claim');
  return json({ok:true,message:'Founder account created. Sign in using your new password.'});
 }

 if(path==='/api/login'&&request.method==='POST'){
  const b=await jsonBody(request);const username=clamp(b.username,80).toLowerCase();const password=String(b.password||'');
  if(!/^[a-z0-9._-]{3,60}$/.test(username))return error('Invalid credentials',401);
  const fail=await db.prepare('SELECT * FROM login_failures WHERE username=?').bind(username).first();if(fail&&now()-fail.window_start<900000&&fail.attempts>=8)return error('Too many attempts; try later',429);
  const record=await db.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
  const valid=record&&record.active&&safeCompareHex(await hashPw(password,record.password_salt),record.password_hash);
  if(!valid){await db.prepare(`INSERT INTO login_failures(username,attempts,window_start) VALUES (?,1,?) ON CONFLICT(username) DO UPDATE SET attempts=CASE WHEN ?-window_start>900000 THEN 1 ELSE attempts+1 END,window_start=CASE WHEN ?-window_start>900000 THEN ? ELSE window_start END`).bind(username,now(),now(),now(),now()).run();return error('Invalid credentials',401)}
  await db.prepare('DELETE FROM login_failures WHERE username=?').bind(username).run();await db.prepare('UPDATE users SET last_login_at=? WHERE id=?').bind(now(),record.id).run();
  const token=bytesHex(crypto.getRandomValues(new Uint8Array(32)));await db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').bind(await sha(token),record.id,now()+43200000).run();
  return new Response(JSON.stringify({user:publicUser(record)}),{headers:{'content-type':'application/json','cache-control':'no-store','set-cookie':cookie(token)}})
 }
 if(!u)return error('Please sign in',401);
 if(path==='/api/me'&&request.method==='GET')return json({user:publicUser(u)});
 if(path==='/api/change-password'&&request.method==='POST'){
   const b=await jsonBody(request);if(!strongPassword(b.new_password))return error('Use a password of 12–120 characters');const record=await db.prepare('SELECT * FROM users WHERE id=?').bind(u.id).first();if(!safeCompareHex(await hashPw(String(b.old_password||''),record.password_salt),record.password_hash))return error('Current password incorrect',403);const salt=bytesHex(crypto.getRandomValues(new Uint8Array(16)));await db.prepare('UPDATE users SET password_salt=?,password_hash=?,force_reset=0 WHERE id=?').bind(salt,await hashPw(b.new_password,salt),u.id).run();await audit(db,u,'password_changed','user',u.id);return json({ok:true})
 }
 if(u.force_reset && path!=='/api/logout')return error('Change your temporary password before using TEL OS',428);
 if(path==='/api/logout'&&request.method==='POST'){
  const token=(request.headers.get('cookie')||'').match(/tel_session=([a-f0-9]{64})/)?.[1];if(token)await db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await sha(token)).run();return new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json','set-cookie':cookie('',0)}})
 }
 if(path==='/api/bootstrap'&&request.method==='GET'){
  const all=privileged(u)||u.role==='lead';
  const [users,clients,tasks,leaves,meetings,calls,sessions,availability,handovers,corrections,grievances,exits,documents,announcements,oncall,shifts,notifications]=await Promise.all([
   result(db.prepare('SELECT id,name,username,role,is_minor,active,last_seen,department,designation,reporting_manager,joining_date,weekly_plan FROM users ORDER BY name')),
   result(db.prepare('SELECT * FROM clients ORDER BY name')),
   result(isAdmin(u)?db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 120'):u.role==='lead'?db.prepare('SELECT t.* FROM tasks t JOIN users a ON a.id=t.assignee_id WHERE a.department=(SELECT department FROM users WHERE id=?) ORDER BY t.created_at DESC LIMIT 120').bind(u.id):db.prepare('SELECT * FROM tasks WHERE assignee_id=? ORDER BY created_at DESC LIMIT 120').bind(u.id)),
   result(isAdmin(u)?db.prepare('SELECT * FROM leave_requests ORDER BY created_at DESC LIMIT 100'):u.role==='lead'?db.prepare('SELECT l.id,l.user_id,l.start_date,l.end_date,l.status,l.created_at FROM leave_requests l JOIN users a ON a.id=l.user_id WHERE a.department=(SELECT department FROM users WHERE id=?) ORDER BY l.created_at DESC LIMIT 100').bind(u.id):db.prepare('SELECT * FROM leave_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(u.id)),
   result(db.prepare('SELECT * FROM meetings ORDER BY starts_at DESC LIMIT 50')),
   result(all?db.prepare('SELECT * FROM call_logs ORDER BY logged_at DESC LIMIT 60'):db.prepare('SELECT * FROM call_logs WHERE user_id=? ORDER BY logged_at DESC LIMIT 60').bind(u.id)),
   result(all?db.prepare('SELECT * FROM work_sessions WHERE work_date>=? ORDER BY start_at DESC LIMIT 150').bind(day(now()-7*86400000)):db.prepare('SELECT * FROM work_sessions WHERE user_id=? AND work_date>=? ORDER BY start_at DESC LIMIT 80').bind(u.id,day(now()-7*86400000))),
   result(db.prepare("SELECT id,user_id,day,state,start_time,end_time,CASE WHEN user_id=? THEN note ELSE '' END note FROM availability WHERE day>=? AND day<=? ORDER BY day,user_id").bind(u.id,day(now()-86400000*7),day(now()+86400000*42))),
   result(all?db.prepare('SELECT * FROM handovers ORDER BY requested_at DESC LIMIT 120'):db.prepare('SELECT * FROM handovers WHERE from_user_id=? OR to_user_id=? ORDER BY requested_at DESC LIMIT 80').bind(u.id,u.id)),
   result(isAdmin(u)?db.prepare('SELECT * FROM attendance_corrections ORDER BY created_at DESC LIMIT 120'):db.prepare('SELECT * FROM attendance_corrections WHERE user_id=? ORDER BY created_at DESC LIMIT 80').bind(u.id)),
   result(u.role==='founder'?db.prepare('SELECT * FROM grievances ORDER BY created_at DESC LIMIT 120'):u.role==='hr'?db.prepare('SELECT * FROM grievances WHERE founder_only=0 OR user_id=? ORDER BY created_at DESC LIMIT 100').bind(u.id):db.prepare('SELECT * FROM grievances WHERE user_id=? ORDER BY created_at DESC LIMIT 80').bind(u.id)),
   result(isAdmin(u)?db.prepare('SELECT * FROM exit_requests ORDER BY created_at DESC LIMIT 120'):db.prepare('SELECT * FROM exit_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 80').bind(u.id)),
   result(db.prepare('SELECT * FROM official_documents ORDER BY created_at DESC LIMIT 100')),
   result(db.prepare('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 40')),
   result(db.prepare('SELECT id,user_id,starts_at,ends_at,allowance_rupees,note,status FROM oncall_roster WHERE ends_at>? ORDER BY starts_at LIMIT 100').bind(now()-7*86400000)),
   result(db.prepare('SELECT * FROM shift_plans WHERE day>=? AND day<=? ORDER BY day').bind(day(now()-7*86400000),day(now()+42*86400000))),
   result(db.prepare('SELECT * FROM notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT 100').bind(u.id))
  ]);
  const absenceAlerts=[];
  if(isAdmin(u)){
   const [planned,clocked,approved]=await Promise.all([
    result(db.prepare('SELECT user_id,day FROM shift_plans WHERE day<? AND day>=? ORDER BY day DESC').bind(day(),day(now()-86400000*60))),
    result(db.prepare('SELECT DISTINCT user_id,work_date FROM work_sessions WHERE work_date>=?').bind(day(now()-86400000*60))),
    result(db.prepare("SELECT user_id,start_date,end_date FROM leave_requests WHERE status='approved' AND end_date>=?").bind(day(now()-86400000*60)))
   ]);
   const worked=new Set(clocked.map(x=>x.user_id+'|'+x.work_date));
   for(const emp of users.filter(x=>x.active)){
    let missed=0;
    for(const shift of planned.filter(x=>x.user_id===emp.id)){
     const excused=approved.some(x=>x.user_id===emp.id&&x.start_date<=shift.day&&x.end_date>=shift.day)||availability.some(x=>x.user_id===emp.id&&x.day===shift.day&&['school','exam'].includes(x.state));
     if(worked.has(emp.id+'|'+shift.day)||excused)break;
     missed++;
    }
    if(missed>=3)absenceAlerts.push({user_id:emp.id,consecutive_missed_shifts:missed,action:'HR welfare and attendance review; no automatic account lockout'});
   }
  }
  const active=await db.prepare(`SELECT * FROM work_sessions WHERE user_id=? AND state!='finished' ORDER BY start_at DESC LIMIT 1`).bind(u.id).first();
  const today=await result(db.prepare('SELECT * FROM work_sessions WHERE user_id=? AND work_date=?').bind(u.id,day()));const adjustments=await db.prepare("SELECT coalesce(sum(requested_minutes),0) mins FROM attendance_corrections WHERE user_id=? AND work_date=? AND status='approved'").bind(u.id,day()).first();
  return json({user:publicUser(u),users,clients,tasks,leaves,meetings,calls,sessions,availability,handovers,corrections,grievances,exits,documents,announcements,oncall,shifts,notifications,absenceAlerts,activeSession:active,todayMs:today.reduce((a,s)=>a+elapsed(s),0)+(adjustments?.mins||0)*60000,now:now(),today:day()});
 }
 if(path==='/api/heartbeat'&&request.method==='POST'){await db.prepare('UPDATE users SET last_seen=? WHERE id=?').bind(now(),u.id).run();return json({ok:true})}
 if(path==='/api/clock'&&request.method==='POST'){
  const b=await jsonBody(request);const action=clamp(b.action,12);const active=await db.prepare(`SELECT * FROM work_sessions WHERE user_id=? AND state!='finished' ORDER BY start_at DESC LIMIT 1`).bind(u.id).first();
  if(action==='in'){
   if(active)return error('Already clocked in');if(u.is_minor){const done=await result(db.prepare('SELECT * FROM work_sessions WHERE user_id=? AND work_date=?').bind(u.id,day()));if(done.reduce((a,s)=>a+elapsed(s),0)>=14400000)return error('Your four-hour student work target is complete for today')}if(u.is_minor&&(hourIST()<8||hourIST()>=19))return error('Student work sessions must stay within the approved daytime window');
   await db.prepare(`INSERT INTO work_sessions(id,user_id,work_date,start_at,state,updated_at) VALUES (?,?,?,?,'working',?)`).bind(uid(),u.id,day(),now(),now()).run();
  }else if(action==='break'){
   if(!active||active.state!=='working')return error('No working session to pause');await db.prepare(`UPDATE work_sessions SET state='break',break_started_at=?,updated_at=? WHERE id=?`).bind(now(),now(),active.id).run();
  }else if(action==='resume'){
   if(!active||active.state!=='break')return error('No break to resume');if(u.is_minor&&(hourIST()<8||hourIST()>=19))return error('Outside permitted student work window');await db.prepare(`UPDATE work_sessions SET state='working',break_ms=break_ms+?,break_started_at=NULL,updated_at=? WHERE id=?`).bind(Math.max(0,now()-active.break_started_at),now(),active.id).run();
  }else if(action==='out'){
   if(!active)return error('No active session');await db.prepare(`UPDATE work_sessions SET state='finished',end_at=?,break_ms=break_ms+?,break_started_at=NULL,updated_at=? WHERE id=?`).bind(now(),active.state==='break'?Math.max(0,now()-active.break_started_at):0,now(),active.id).run();
  }else return error('Unknown action');await audit(db,u,`clock_${action}`,'work_session');return json({ok:true})
 }
 if(path==='/api/tasks'&&request.method==='POST'){
  if(!managers(u))return error('Manager only',403);const b=await jsonBody(request);
  if(!clamp(b.title,120)||!b.assignee_id)return error('Title and assignee are required');
  const who=await db.prepare('SELECT id,department FROM users WHERE id=? AND active=1').bind(b.assignee_id).first();if(!who)return error('Unknown assignee');if(u.role==='lead'){const manager=await db.prepare('SELECT department FROM users WHERE id=?').bind(u.id).first();if(manager?.department!==who.department)return error('Team leads may only assign within their department',403)}
  const client=b.client_id?await db.prepare('SELECT id FROM clients WHERE id=?').bind(b.client_id).first():null;
  const due=validDate(b.due_date)?b.due_date:null;
  await db.prepare(`INSERT INTO tasks(id,client_id,title,details,assignee_id,status,priority,due_date,estimated_min,created_at,updated_at) VALUES(?,?,?,?,?,'todo',?,?,?, ?,?)`).bind(uid(),client?.id||null,clamp(b.title,120),clamp(b.details,600),who.id,['low','normal','high'].includes(b.priority)?b.priority:'normal',due,Math.max(15,Math.min(480,Number(b.estimated_min)||60)),now(),now()).run();await notify(db,who.id,'New assignment',clamp(b.title,120));await audit(db,u,'task_created','task',clamp(b.title));return json({ok:true});
 }
 const taskMatch=path.match(/^\/api\/tasks\/([a-f0-9-]{36})$/);
 if(taskMatch&&request.method==='PATCH'){
  const b=await jsonBody(request);const task=await db.prepare('SELECT * FROM tasks WHERE id=?').bind(taskMatch[1]).first();if(!task)return error('Task not found',404);
  if(!managers(u)&&task.assignee_id!==u.id)return error('Not your task',403);if(managers(u)&&task.assignee_id!==u.id&&!await canReviewTask(db,u,task))return error('Outside your department',403);
  const newStatus=clamp(b.status,20);if(!['todo','working','review','done'].includes(newStatus))return error('Bad task status');
  if(!managers(u)&&newStatus==='done')return error('Only a manager can approve delivery');if(newStatus==='review')return error('Use Submit deliverable to request review');if(newStatus==='done'&&(task.status!=='review'||!task.submitted_at))return error('A deliverable must be formally submitted for review before approval');
  await db.prepare('UPDATE tasks SET status=?,updated_at=?,approved_by=? WHERE id=?').bind(newStatus,now(),newStatus==='done'?u.id:null,task.id).run();await audit(db,u,'task_status','task',`${task.title}: ${newStatus}`);return json({ok:true});
 }
 if(path==='/api/employees'&&request.method==='POST'){
  if(!privileged(u))return error('HR only',403);const b=await jsonBody(request);const username=clamp(b.username,60).toLowerCase(), name=clamp(b.name,90), role=clamp(b.role,20);
  if(!name||!/^[a-z0-9._-]{3,60}$/.test(username)||!roles.includes(role))return error('Invalid employee name, login, or role');
  if(role==='founder'&&u.role!=='founder')return error('Founder role requires founder approval',403);
  const temporary=bytesHex(crypto.getRandomValues(new Uint8Array(16)));
  const salt=bytesHex(crypto.getRandomValues(new Uint8Array(16)));
  try{await db.prepare('INSERT INTO users(id,name,username,role,password_salt,password_hash,is_minor,active,force_reset,created_at,department,designation,reporting_manager,joining_date) VALUES(?,?,?,?,?,?,?,1,1,?,?,?,?,?)').bind(uid(),name,username,role,salt,await hashPw(temporary,salt),b.is_minor===false?0:1,now(),clamp(b.department,60)||'General',clamp(b.designation,80)||'Team member',clamp(b.reporting_manager,80)||null,validDate(b.joining_date)?b.joining_date:day()).run()}catch{return error('Login already exists')}
  await audit(db,u,'employee_created','user',username);return json({ok:true,username,temporary_password:temporary,message:'Share privately. Password shown once and must be changed.'});
 }
 const employeeMatch=path.match(/^\/api\/employees\/([a-f0-9-]{36})\/status$/);
 if(employeeMatch&&request.method==='PATCH'){
  if(!privileged(u))return error('HR only',403);const b=await jsonBody(request);if(employeeMatch[1]===u.id)return error('Cannot suspend your own account');const emp=await db.prepare('SELECT id,role FROM users WHERE id=?').bind(employeeMatch[1]).first();if(!emp)return error('Unknown employee',404);if(['founder','hr'].includes(emp.role)&&u.role!=='founder')return error('Founder authorisation required for this role',403);
  await db.prepare('UPDATE users SET active=? WHERE id=?').bind(b.active?1:0,employeeMatch[1]).run();await db.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(employeeMatch[1]).run();await audit(db,u,b.active?'employee_reactivated':'employee_suspended','user',employeeMatch[1]);return json({ok:true});
 }
 if(path==='/api/leave'&&request.method==='POST'){
  const b=await jsonBody(request);if(!validDate(b.start_date)||!validDate(b.end_date)||b.start_date>b.end_date||!clamp(b.reason,400))return error('Provide valid dates and reason');
  await db.prepare('INSERT INTO leave_requests(id,user_id,start_date,end_date,reason,status,created_at) VALUES(?,?,?,?,?,\'pending\',?)').bind(uid(),u.id,b.start_date,b.end_date,clamp(b.reason,400),now()).run();await audit(db,u,'leave_requested','leave');return json({ok:true});
 }
 const leaveMatch=path.match(/^\/api\/leave\/([a-f0-9-]{36})$/);
 if(leaveMatch&&request.method==='PATCH'){
  if(!privileged(u))return error('HR only',403);const b=await jsonBody(request);if(!['approved','declined'].includes(b.status))return error('Bad decision');await db.prepare("UPDATE leave_requests SET status=?,reviewer_id=? WHERE id=? AND status='pending'").bind(b.status,u.id,leaveMatch[1]).run();const lr=await db.prepare('SELECT user_id,start_date,end_date FROM leave_requests WHERE id=?').bind(leaveMatch[1]).first();if(lr){await notify(db,lr.user_id,'Leave '+b.status,lr.start_date+' to '+lr.end_date);if(b.status==='approved'){let d=new Date(lr.start_date+'T00:00:00Z'),end=new Date(lr.end_date+'T00:00:00Z');for(let n=0;d<=end&&n<90;d.setUTCDate(d.getUTCDate()+1),n++){const date=d.toISOString().slice(0,10);await db.prepare(`INSERT INTO availability(id,user_id,day,state,note,created_at) VALUES(?,?,?,'leave','Approved leave',?) ON CONFLICT(user_id,day) DO UPDATE SET state='leave',note='Approved leave'`).bind(uid(),lr.user_id,date,now()).run()}}}await audit(db,u,`leave_${b.status}`,'leave',leaveMatch[1]);return json({ok:true});
 }
 if(path==='/api/meetings'&&request.method==='POST'){
  if(!managers(u))return error('Manager only',403);const b=await jsonBody(request);
  if(!clamp(b.topic,100)||!clamp(b.objective,350)||!b.starts_at)return error('Topic, goal and time required');
  await db.prepare('INSERT INTO meetings VALUES(?,?,?,?,?,?,?)').bind(uid(),clamp(b.topic,100),clamp(b.objective,350),clamp(b.starts_at,30),clamp(b.notes,500),u.id,now()).run();await audit(db,u,'meeting_created','meeting');return json({ok:true});
 }
 if(path==='/api/calls'&&request.method==='POST'){
  const b=await jsonBody(request);if(!['answered','missed','returned'].includes(b.status))return error('Bad call status');
  await db.prepare('INSERT INTO call_logs VALUES(?,?,?,?,?,?)').bind(uid(),u.id,b.client_id||null,b.status,clamp(b.notes,300),now()).run();return json({ok:true});
 }

 if(path==='/api/availability'&&request.method==='POST'){
  const b=await jsonBody(request), target=(isAdmin(u)&&b.user_id)?b.user_id:u.id;
  const state=clamp(b.state,20);if(!validDate(b.day)||b.day<day(now()-7*86400000)||b.day>day(now()+90*86400000)||!['available','school','exam','unavailable'].includes(state))return error('Invalid availability date or state');
  if(b.start_time&&!hms.test(b.start_time)||b.end_time&&!hms.test(b.end_time))return error('Use HH:MM for time windows');
  const owner=await db.prepare('SELECT id,is_minor FROM users WHERE id=?').bind(target).first();if(!owner)return error('Employee not found');
  if(owner.is_minor&&b.start_time&&b.end_time&&(b.start_time<'08:00'||b.end_time>'19:00'))return error('Outside student daytime window');
  const approvedLeave=await db.prepare("SELECT 1 FROM leave_requests WHERE user_id=? AND status='approved' AND start_date<=? AND end_date>=?").bind(target,b.day,b.day).first();if(approvedLeave)return error('Approved leave is managed through HR');
  await db.prepare(`INSERT INTO availability VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET state=excluded.state,start_time=excluded.start_time,end_time=excluded.end_time,note=excluded.note`).bind(uid(),target,b.day,state,b.start_time||null,b.end_time||null,clamp(b.note,220),now()).run();
  await audit(db,u,'availability_updated','calendar',target+' '+b.day);return json({ok:true});
 }
 if(path==='/api/shifts'&&request.method==='POST'){
  if(!isAdmin(u))return error('HR authorisation required',403);const b=await jsonBody(request);
  const emp=await db.prepare('SELECT id,is_minor FROM users WHERE id=? AND active=1').bind(b.user_id).first();
  if(!emp||!validDate(b.day)||b.day<day()||b.day>day(now()+90*86400000)||!hms.test(b.start_time)||!hms.test(b.end_time)||b.start_time>=b.end_time)return error('Invalid shift plan');
  if(emp.is_minor&&(b.start_time<'08:00'||b.end_time>'19:00'))return error('Under-18 work cannot be scheduled outside permitted daytime');
  const minutes=(Number(b.end_time.slice(0,2))*60+Number(b.end_time.slice(3)))-(Number(b.start_time.slice(0,2))*60+Number(b.start_time.slice(3)));
  if(minutes>360)return error('Shift window exceeds the safety limit');if(emp.is_minor){const shiftdays=(await result(db.prepare('SELECT day FROM shift_plans WHERE user_id=? AND day>=? AND day<=?').bind(emp.id,day(Date.parse(b.day+'T00:00:00Z')-6*86400000),day(Date.parse(b.day+'T00:00:00Z')+6*86400000)))).map(x=>x.day);const days=new Set([...shiftdays,b.day]);for(const d of [...days]){let consecutive=0;for(let i=0;i<7;i++){const date=day(Date.parse(d+'T00:00:00Z')+i*86400000);consecutive=days.has(date)?consecutive+1:0;if(consecutive>=7)return error('A weekly rest day is required for student shifts')}}}
  await db.prepare(`INSERT INTO shift_plans VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET start_time=excluded.start_time,end_time=excluded.end_time,approved_by=excluded.approved_by,note=excluded.note`).bind(uid(),emp.id,b.day,b.start_time,b.end_time,u.id,clamp(b.note,220),now()).run();
  await notify(db,emp.id,'Shift published',b.day+' · '+b.start_time+'–'+b.end_time);await audit(db,u,'shift_published','shift',emp.id+' '+b.day);return json({ok:true});
 }
 if(path==='/api/task-submit'&&request.method==='POST'){
  const b=await jsonBody(request),t=await db.prepare('SELECT * FROM tasks WHERE id=?').bind(b.task_id).first();
  if(!t)return error('Task not found',404);if(t.assignee_id!==u.id)return error('Only the assignee can submit this deliverable',403);
  if(!['todo','working','review'].includes(t.status))return error('Task already approved');
  const link=safeUrl(String(b.deliverable_url||''));if(!link&&!clamp(b.notes,350))return error('Add a secure deliverable link or handover notes');
  await db.prepare("UPDATE tasks SET deliverable_url=?,review_notes=?,submitted_at=?,status='review',updated_at=? WHERE id=?").bind(link,clamp(b.notes,350),now(),now(),t.id).run();
  await db.prepare('INSERT INTO task_events VALUES(?,?,?,?,?,?)').bind(uid(),t.id,u.id,'submitted',clamp(b.notes,350),now()).run();
  await audit(db,u,'task_submitted','task',t.id);return json({ok:true});
 }
 if(path==='/api/task-review'&&request.method==='POST'){
  const b=await jsonBody(request),t=await db.prepare('SELECT * FROM tasks WHERE id=?').bind(b.task_id).first();
  if(!t)return error('Task not found',404);if(!await canReviewTask(db,u,t))return error('Manager review only',403);if(t.status!=='review')return error('Task not submitted for review');
  const action=clamp(b.action,20);if(!['approve','revise'].includes(action))return error('Choose approve or revise');
  const next=action==='approve'?'done':'working';if(action==='revise'&&!clamp(b.notes,250))return error('Explain what needs revision');
  await db.prepare('UPDATE tasks SET status=?,review_notes=?,approved_by=?,updated_at=? WHERE id=?').bind(next,clamp(b.notes,350),action==='approve'?u.id:null,now(),t.id).run();
  await db.prepare('INSERT INTO task_events VALUES(?,?,?,?,?,?)').bind(uid(),t.id,u.id,action,clamp(b.notes,350),now()).run();await notify(db,t.assignee_id,action==='approve'?'Deliverable approved':'Revision requested',t.title);await audit(db,u,'task_'+action,'task',t.id);return json({ok:true});
 }
 if(path==='/api/handovers'&&request.method==='POST'){
  const b=await jsonBody(request),t=await db.prepare('SELECT * FROM tasks WHERE id=?').bind(b.task_id).first();
  if(!t||!t.assignee_id)return error('Task not found');if(t.assignee_id!==u.id&&!await canReviewTask(db,u,t))return error('Not assigned to this task',403);
  const to=await db.prepare('SELECT id,active FROM users WHERE id=?').bind(b.to_user_id).first();if(!to?.active||to.id===t.assignee_id)return error('Choose a different active employee');
  if(!clamp(b.reason,400))return error('Provide handover details');
  await db.prepare('INSERT INTO handovers VALUES(?,?,?,?,?,\'pending\',?,NULL,NULL)').bind(uid(),t.id,t.assignee_id,to.id,clamp(b.reason,400),now()).run();
  await audit(db,u,'handover_requested','task',t.id);return json({ok:true});
 }
 const handMatch=path.match(/^\/api\/handovers\/([a-f0-9-]{36})$/);
 if(handMatch&&request.method==='PATCH'){
  const h=await db.prepare('SELECT h.*,t.assignee_id,t.title FROM handovers h JOIN tasks t ON t.id=h.task_id WHERE h.id=?').bind(handMatch[1]).first();
  if(!h)return error('Request not found',404);if(!await canReviewTask(db,u,h))return error('Manager approval only',403);
  const b=await jsonBody(request);if(!['approved','declined'].includes(b.status))return error('Invalid decision');
  if(h.status!=='pending')return error('Already reviewed');
  if(b.status==='approved'){if(h.assignee_id!==h.from_user_id)return error('Task ownership has changed; review again');await db.prepare('UPDATE tasks SET assignee_id=?,updated_at=? WHERE id=?').bind(h.to_user_id,now(),h.task_id).run()}
  await db.prepare('UPDATE handovers SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?').bind(b.status,u.id,now(),h.id).run();await notify(db,h.from_user_id,'Handover '+b.status,h.title);await notify(db,h.to_user_id,'Task handover '+b.status,h.title);await audit(db,u,'handover_'+b.status,'task',h.task_id);return json({ok:true});
 }
 if(path==='/api/corrections'&&request.method==='POST'){
  const b=await jsonBody(request);if(!validDate(b.work_date)||!clamp(b.reason,300))return error('Enter work date and explanation');
  const minutes=Number(b.requested_minutes)||0;if(minutes<0||minutes>240)return error('Minutes must be 0–240');
  await db.prepare("INSERT INTO attendance_corrections(id,user_id,work_date,reason,requested_minutes,created_at) VALUES(?,?,?,?,?,?)").bind(uid(),u.id,b.work_date,clamp(b.reason,300),minutes,now()).run();await audit(db,u,'attendance_correction_requested','attendance',b.work_date);return json({ok:true});
 }
 const correctionMatch=path.match(/^\/api\/corrections\/([a-f0-9-]{36})$/);
 if(correctionMatch&&request.method==='PATCH'){
  if(!isAdmin(u))return error('HR only',403);const b=await jsonBody(request);if(!['approved','declined'].includes(b.status))return error('Invalid review');
  const c=await db.prepare('SELECT * FROM attendance_corrections WHERE id=? AND status=\'pending\'').bind(correctionMatch[1]).first();if(!c)return error('No pending correction');if(b.status==='approved'){const emp=await db.prepare('SELECT is_minor FROM users WHERE id=?').bind(c.user_id).first();if(emp?.is_minor){const sessions=await result(db.prepare('SELECT * FROM work_sessions WHERE user_id=? AND work_date=?').bind(c.user_id,c.work_date));const total=sessions.reduce((sum,x)=>sum+elapsed(x),0);const added=await db.prepare("SELECT coalesce(sum(requested_minutes),0) mins FROM attendance_corrections WHERE user_id=? AND work_date=? AND status='approved'").bind(c.user_id,c.work_date).first();if(total+((added?.mins||0)+(c.requested_minutes||0))*60000>14400000)return error('Cannot approve student hours exceeding four active hours',403)}}
  await db.prepare('UPDATE attendance_corrections SET status=?,reviewed_by=?,review_note=? WHERE id=?').bind(b.status,u.id,clamp(b.review_note,220),c.id).run();await notify(db,c.user_id,'Attendance correction '+b.status,c.work_date);await audit(db,u,'correction_'+b.status,'attendance',c.id);return json({ok:true});
 }
 if(path==='/api/grievances'&&request.method==='POST'){
  const b=await jsonBody(request);if(!clamp(b.detail,900))return error('Write a description of your concern');
  await db.prepare('INSERT INTO grievances VALUES(?,?,?,?,?,\'open\',?,NULL)').bind(uid(),u.id,clamp(b.category,80)||'Workplace concern',clamp(b.detail,900),b.founder_only===true?1:0,now()).run();await audit(db,u,'grievance_submitted','grievance','Private report received');return json({ok:true});
 }
 const grievanceMatch=path.match(/^\/api\/grievances\/([a-f0-9-]{36})$/);
 if(grievanceMatch&&request.method==='PATCH'){
  if(!isAdmin(u))return error('HR only',403);const g=await db.prepare('SELECT * FROM grievances WHERE id=?').bind(grievanceMatch[1]).first();
  if(!g)return error('Not found',404);if(g.founder_only&&u.role!=='founder')return error('Founder-only confidential report',403);
  const b=await jsonBody(request);if(!['in_review','resolved'].includes(b.status))return error('Invalid status');
  await db.prepare('UPDATE grievances SET status=?,resolved_at=? WHERE id=?').bind(b.status,b.status==='resolved'?now():null,g.id).run();await notify(db,g.user_id,'Concern status updated','Your report is now '+b.status);await audit(db,u,'grievance_reviewed','grievance',g.id);return json({ok:true});
 }
 if(path==='/api/exits'&&request.method==='POST'){
  const b=await jsonBody(request);if(!validDate(b.proposed_end)||!clamp(b.handover_plan,600))return error('Enter end date and handover plan');
  await db.prepare('INSERT INTO exit_requests VALUES(?,?,?,?,\'pending\',NULL,?)').bind(uid(),u.id,b.proposed_end,clamp(b.handover_plan,600),now()).run();await audit(db,u,'exit_requested','exit');return json({ok:true});
 }
 const exitMatch=path.match(/^\/api\/exits\/([a-f0-9-]{36})$/);
 if(exitMatch&&request.method==='PATCH'){
  if(!isAdmin(u))return error('HR only',403);const b=await jsonBody(request);if(!['reviewed','approved','declined'].includes(b.status))return error('Invalid status');
  const ex=await db.prepare('SELECT * FROM exit_requests WHERE id=?').bind(exitMatch[1]).first();if(!ex)return error('Not found',404);
  await db.prepare('UPDATE exit_requests SET status=?,reviewed_by=? WHERE id=?').bind(b.status,u.id,ex.id).run();await notify(db,ex.user_id,'Exit request '+b.status,'HR will coordinate the handover');await audit(db,u,'exit_'+b.status,'exit',ex.id);return json({ok:true});
 }
 if(path==='/api/documents'&&request.method==='POST'){
  if(!isAdmin(u))return error('HR only',403);const b=await jsonBody(request),url=safeUrl(String(b.url||''));
  if(!clamp(b.title,160)||!url)return error('Enter title and an HTTPS document URL');
  await db.prepare('INSERT INTO official_documents VALUES(?,?,?,?,?,?,?)').bind(uid(),clamp(b.title,160),clamp(b.category,70)||'SOP',url,clamp(b.revision,20)||'1.0',u.id,now()).run();await audit(db,u,'document_published','document',clamp(b.title,120));return json({ok:true});
 }
 if(path==='/api/announcements'&&request.method==='POST'){
  if(!isAdmin(u))return error('HR only',403);const b=await jsonBody(request);if(!clamp(b.title,140)||!clamp(b.message,900))return error('Title and message required');
  await db.prepare('INSERT INTO announcements VALUES(?,?,?,?,?)').bind(uid(),clamp(b.title,140),clamp(b.message,900),u.id,now()).run();await audit(db,u,'announcement_created','announcement',clamp(b.title,140));return json({ok:true});
 }
 if(path==='/api/oncall'&&request.method==='POST'){
  if(!isAdmin(u))return error('HR only',403);const b=await jsonBody(request),person=await db.prepare('SELECT id,is_minor,active FROM users WHERE id=?').bind(b.user_id).first();
  if(!person?.active||person.is_minor)return error('Only active adult staff can be assigned emergency on-call duty',403);
  const start=Date.parse(b.starts_at),end=Date.parse(b.ends_at),pay=Number(b.allowance_rupees);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>28800000)return error('Use a defined duty window of up to 8 hours');
  if(!Number.isInteger(pay)||pay<500||pay>100000)return error('Allowance must be at least ₹500');
  await db.prepare('INSERT INTO oncall_roster VALUES(?,?,?,?,?,? ,\'proposed\',?,?)').bind(uid(),person.id,start,end,pay,clamp(b.note,260),u.id,now()).run();await notify(db,person.id,'Emergency coverage assignment',new Date(start).toISOString());await audit(db,u,'oncall_scheduled','roster',person.id);return json({ok:true});
 }
 if(path==='/api/notifications/read'&&request.method==='POST'){
  const b=await jsonBody(request);await db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND recipient_id=?').bind(clamp(b.id,60),u.id).run();return json({ok:true});
 }

 const acceptMatch=path.match(/^\/api\/oncall\/([a-f0-9-]{36})$/);
 if(acceptMatch&&request.method==='PATCH'){
  const oc=await db.prepare('SELECT * FROM oncall_roster WHERE id=?').bind(acceptMatch[1]).first();if(!oc)return error('Coverage not found',404);
  if(oc.user_id!==u.id)return error('Only the scheduled employee may accept or decline coverage',403);
  if(u.is_minor)return error('Under-18 staff cannot accept emergency duty',403);
  if(oc.status!=='proposed')return error('Coverage was already reviewed');const b=await jsonBody(request);
  if(!['accepted','declined'].includes(b.status))return error('Choose accept or decline');
  await db.prepare('UPDATE oncall_roster SET status=? WHERE id=?').bind(b.status,oc.id).run();
  await audit(db,u,'oncall_'+b.status,'roster',oc.id);return json({ok:true});
 }
 const resetMatch=path.match(/^\/api\/employees\/([a-f0-9-]{36})\/password$/);
 if(resetMatch&&request.method==='POST'){
  if(!isAdmin(u))return error('HR only',403);const target=await db.prepare('SELECT id,role FROM users WHERE id=?').bind(resetMatch[1]).first();
  if(!target)return error('Not found',404);if(target.id===u.id)return error('Use your password change screen',400);
  if(['founder','hr'].includes(target.role)&&u.role!=='founder')return error('Founder approval required',403);
  const temporary=bytesHex(crypto.getRandomValues(new Uint8Array(16))),salt=bytesHex(crypto.getRandomValues(new Uint8Array(16)));
  await db.prepare('UPDATE users SET password_salt=?,password_hash=?,force_reset=1 WHERE id=?').bind(salt,await hashPw(temporary,salt),target.id).run();
  await db.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(target.id).run();await audit(db,u,'password_reset_by_hr','user',target.id);return json({ok:true,temporary_password:temporary});
 }
 if(path==='/api/audit'&&request.method==='GET'){
  if(!isAdmin(u))return error('HR only',403);return json({events:await result(db.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 150'))});
 }
 return error('Not found',404);
}
export default {async fetch(request,env,ctx){try{return await handle(request,env)}catch(e){console.error(JSON.stringify({event:'tel_os_error',message:String(e?.message||e)}));return error('Unexpected server error',500)}}};