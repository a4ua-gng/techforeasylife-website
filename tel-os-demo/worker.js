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
 if(path==='/api/health')return json({ok:true,app:'TEL OS',version:'0.1-demo'});
 if(path==='/'||path==='/index.html')return new Response(HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}});
 if(!path.startsWith('/api/'))return error('Not found',404);
 if(!db)return error('Database not configured',503);
 if(request.method!=='GET'&&(badOrigin(request)||!request.headers.get('content-type')?.startsWith('application/json')))return error('Invalid request origin or content type',403);
 const u=await authenticate(request,db);
 if(path==='/api/login'&&request.method==='POST'){
  const b=await jsonBody(request);const username=clamp(b.username,80).toLowerCase();const password=String(b.password||'');
  if(!/^[a-z0-9._-]{3,60}$/.test(username))return error('Invalid credentials',401);
  const fail=await db.prepare('SELECT * FROM login_failures WHERE username=?').bind(username).first();if(fail&&now()-fail.window_start<900000&&fail.attempts>=8)return error('Too many attempts; try later',429);
  const record=await db.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
  const valid=record&&record.active&&safeCompareHex(await hashPw(password,record.password_salt),record.password_hash);
  if(!valid){await db.prepare(`INSERT INTO login_failures(username,attempts,window_start) VALUES (?,1,?) ON CONFLICT(username) DO UPDATE SET attempts=CASE WHEN ?-window_start>900000 THEN 1 ELSE attempts+1 END,window_start=CASE WHEN ?-window_start>900000 THEN ? ELSE window_start END`).bind(username,now(),now(),now(),now()).run();return error('Invalid credentials',401)}
  await db.prepare('DELETE FROM login_failures WHERE username=?').bind(username).run();
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
  const [users,clients,tasks,leaves,meetings,calls,sessions]=await Promise.all([
   result(db.prepare('SELECT id,name,username,role,is_minor,active,last_seen FROM users ORDER BY name')),
   result(db.prepare('SELECT * FROM clients ORDER BY name')),
   result(all?db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 120'):db.prepare('SELECT * FROM tasks WHERE assignee_id=? ORDER BY created_at DESC LIMIT 120').bind(u.id)),
   result(all?db.prepare('SELECT * FROM leave_requests ORDER BY created_at DESC LIMIT 100'):db.prepare('SELECT * FROM leave_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(u.id)),
   result(db.prepare('SELECT * FROM meetings ORDER BY starts_at DESC LIMIT 50')),
   result(all?db.prepare('SELECT * FROM call_logs ORDER BY logged_at DESC LIMIT 60'):db.prepare('SELECT * FROM call_logs WHERE user_id=? ORDER BY logged_at DESC LIMIT 60').bind(u.id)),
   result(all?db.prepare('SELECT * FROM work_sessions WHERE work_date>=? ORDER BY start_at DESC LIMIT 150').bind(day(now()-7*86400000)):db.prepare('SELECT * FROM work_sessions WHERE user_id=? AND work_date>=? ORDER BY start_at DESC LIMIT 80').bind(u.id,day(now()-7*86400000)))
  ]);
  const active=await db.prepare(`SELECT * FROM work_sessions WHERE user_id=? AND state!='finished' ORDER BY start_at DESC LIMIT 1`).bind(u.id).first();
  const today=await result(db.prepare('SELECT * FROM work_sessions WHERE user_id=? AND work_date=?').bind(u.id,day()));
  return json({user:publicUser(u),users,clients,tasks,leaves,meetings,calls,sessions,activeSession:active,todayMs:today.reduce((a,s)=>a+elapsed(s),0),now:now(),today:day()});
 }
 if(path==='/api/heartbeat'&&request.method==='POST'){await db.prepare('UPDATE users SET last_seen=? WHERE id=?').bind(now(),u.id).run();return json({ok:true})}
 if(path==='/api/clock'&&request.method==='POST'){
  const b=await jsonBody(request);const action=clamp(b.action,12);const active=await db.prepare(`SELECT * FROM work_sessions WHERE user_id=? AND state!='finished' ORDER BY start_at DESC LIMIT 1`).bind(u.id).first();
  if(action==='in'){
   if(active)return error('Already clocked in');if(u.is_minor&&(hourIST()<8||hourIST()>=19))return error('Student work sessions must stay within the approved daytime window');
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
  const who=await db.prepare('SELECT id FROM users WHERE id=? AND active=1').bind(b.assignee_id).first();if(!who)return error('Unknown assignee');
  const client=b.client_id?await db.prepare('SELECT id FROM clients WHERE id=?').bind(b.client_id).first():null;
  const due=validDate(b.due_date)?b.due_date:null;
  await db.prepare(`INSERT INTO tasks(id,client_id,title,details,assignee_id,status,priority,due_date,estimated_min,created_at,updated_at) VALUES(?,?,?,?,?,'todo',?,?,?, ?,?)`).bind(uid(),client?.id||null,clamp(b.title,120),clamp(b.details,600),who.id,['low','normal','high'].includes(b.priority)?b.priority:'normal',due,Math.max(15,Math.min(480,Number(b.estimated_min)||60)),now(),now()).run();await audit(db,u,'task_created','task',clamp(b.title));return json({ok:true});
 }
 const taskMatch=path.match(/^\/api\/tasks\/([a-f0-9-]{36})$/);
 if(taskMatch&&request.method==='PATCH'){
  const b=await jsonBody(request);const task=await db.prepare('SELECT * FROM tasks WHERE id=?').bind(taskMatch[1]).first();if(!task)return error('Task not found',404);
  if(!managers(u)&&task.assignee_id!==u.id)return error('Not your task',403);
  const newStatus=clamp(b.status,20);if(!['todo','working','review','done'].includes(newStatus))return error('Bad task status');
  if(!managers(u)&&newStatus==='done')return error('Only a manager can approve delivery');
  await db.prepare('UPDATE tasks SET status=?,updated_at=? WHERE id=?').bind(newStatus,now(),task.id).run();await audit(db,u,'task_status','task',`${task.title}: ${newStatus}`);return json({ok:true});
 }
 if(path==='/api/employees'&&request.method==='POST'){
  if(!privileged(u))return error('HR only',403);const b=await jsonBody(request);const username=clamp(b.username,60).toLowerCase(), name=clamp(b.name,90), role=clamp(b.role,20);
  if(!name||!/^[a-z0-9._-]{3,60}$/.test(username)||!roles.includes(role))return error('Invalid employee name, login, or role');
  if(role==='founder'&&u.role!=='founder')return error('Founder role requires founder approval',403);
  const temporary=Array.from(crypto.getRandomValues(new Uint8Array(15)),v=>'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[v%57]).join('');
  const salt=bytesHex(crypto.getRandomValues(new Uint8Array(16)));
  try{await db.prepare('INSERT INTO users(id,name,username,role,password_salt,password_hash,is_minor,active,force_reset,created_at) VALUES(?,?,?,?,?,?,?,1,1,?)').bind(uid(),name,username,role,salt,await hashPw(temporary,salt),b.is_minor===false?0:1,now()).run()}catch{return error('Login already exists')}
  await audit(db,u,'employee_created','user',username);return json({ok:true,username,temporary_password:temporary,message:'Share privately. Password shown once and must be changed.'});
 }
 const employeeMatch=path.match(/^\/api\/employees\/([a-f0-9-]{36})\/status$/);
 if(employeeMatch&&request.method==='PATCH'){
  if(!privileged(u))return error('HR only',403);const b=await jsonBody(request);if(employeeMatch[1]===u.id)return error('Cannot suspend your own account');const emp=await db.prepare('SELECT id,role FROM users WHERE id=?').bind(employeeMatch[1]).first();if(!emp)return error('Unknown employee',404);if(emp.role==='founder'&&u.role!=='founder')return error('Founder only',403);
  await db.prepare('UPDATE users SET active=? WHERE id=?').bind(b.active?1:0,employeeMatch[1]).run();await db.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(employeeMatch[1]).run();await audit(db,u,b.active?'employee_reactivated':'employee_suspended','user',employeeMatch[1]);return json({ok:true});
 }
 if(path==='/api/leave'&&request.method==='POST'){
  const b=await jsonBody(request);if(!validDate(b.start_date)||!validDate(b.end_date)||b.start_date>b.end_date||!clamp(b.reason,400))return error('Provide valid dates and reason');
  await db.prepare('INSERT INTO leave_requests(id,user_id,start_date,end_date,reason,status,created_at) VALUES(?,?,?,?,?,\'pending\',?)').bind(uid(),u.id,b.start_date,b.end_date,clamp(b.reason,400),now()).run();await audit(db,u,'leave_requested','leave');return json({ok:true});
 }
 const leaveMatch=path.match(/^\/api\/leave\/([a-f0-9-]{36})$/);
 if(leaveMatch&&request.method==='PATCH'){
  if(!privileged(u))return error('HR only',403);const b=await jsonBody(request);if(!['approved','declined'].includes(b.status))return error('Bad decision');await db.prepare("UPDATE leave_requests SET status=?,reviewer_id=? WHERE id=? AND status='pending'").bind(b.status,u.id,leaveMatch[1]).run();await audit(db,u,`leave_${b.status}`,'leave',leaveMatch[1]);return json({ok:true});
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
 return error('Not found',404);
}
export default {async fetch(request,env,ctx){try{return await handle(request,env)}catch(e){console.error(JSON.stringify({event:'tel_os_error',message:String(e?.message||e)}));return error('Unexpected server error',500)}}};
