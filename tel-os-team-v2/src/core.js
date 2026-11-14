import {queueWorkDeliveries} from './work-deliveries.js';
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const day = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function fail(status,message){ const e=new Error(message); e.status=status; throw e; }
export function json(value,status=200,headers={}){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});}
export async function rows(env,sql,...params){return (await env.DB.prepare(sql).bind(...params).all()).results;}
export async function one(env,sql,...params){return env.DB.prepare(sql).bind(...params).first();}
export async function run(env,sql,...params){return env.DB.prepare(sql).bind(...params).run();}
export function requireRole(user,...roles){if(!roles.includes(user.role))fail(403,'Your role cannot perform this action.');}
export function text(value,max=5000,required=false){if(typeof value!=='string'){if(required)fail(400,'A required text field is missing.');return '';}const s=value.trim();if(s.length>max)fail(400,`Text must be ${max} characters or fewer.`);if(required&&!s)fail(400,'A required text field is empty.');return s;}
export async function audit(env,user,action,entity,entityId='',details=''){await run(env,'INSERT INTO audit_events(id,actor_id,action,entity,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)',id(),user?.id||null,action,entity,String(entityId),String(details).slice(0,1000),now());}
export async function notify(env,userId,title,body,link=''){const notificationId=id();await run(env,'INSERT INTO notifications(id,user_id,title,body,link,created_at) VALUES(?,?,?,?,?,?)',notificationId,userId,title,body,link,now());try{await queueWorkDeliveries(env,{id:notificationId,user_id:userId});}catch{console.error(JSON.stringify({event:'work_delivery_queue_needs_retry',notification_id:notificationId}));}}
export const helpers={id,now,day,fail,json,rows,one,run,audit,notify,requireRole};
export const safeUser=u=>({id:u.id,employee_id:u.employee_id,username:u.username,name:u.name,designation:u.designation,role:u.role,department:u.department,manager_id:u.manager_id,joined_on:u.joined_on,status:u.status,must_change_password:!!u.must_change_password});
export const hex = bytes => [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
export const randomPassword = () => 'Tel!'+hex(crypto.getRandomValues(new Uint8Array(10)))+'Aa';
export const salt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
export async function hashPassword(password,s,iterations=100000){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(s),iterations,hash:'SHA-256'},key,256)));}
export async function sha(value){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
export async function checkPassword(password,user){const got=await hashPassword(password,user?.password_salt||'00000000000000000000000000000000',user?.password_iterations||100000);const expected=user?.password_hash||'0'.repeat(64);let diff=0;for(let i=0;i<64;i++)diff|=got.charCodeAt(i)^expected.charCodeAt(i);return diff===0&&!!user;}
export function validatePassword(p){if(typeof p!=='string'||p.length<12||p.length>128)fail(400,'Use a password between 12 and 128 characters.');}
export function cookie(token,maxAge=43200){return `__Host-tel_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
export function sessionToken(request){return (request.headers.get('cookie')||'').match(/(?:^|;\s*)__Host-tel_session=([a-f0-9]{64})(?:;|$)/)?.[1]||'';}
export async function newSession(env,userId){const token=hex(crypto.getRandomValues(new Uint8Array(32)));await run(env,'INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)',await sha(token),userId,now(),new Date(Date.now()+43200000).toISOString());return token;}
export async function authenticate(request,env){const token=sessionToken(request);if(!token)return null;return one(env,"SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status IN ('active','on_leave')",await sha(token),now());}
export async function readBody(request){const declared=Number(request.headers.get('content-length')||0);if(declared>65536)fail(413,'Request exceeds 64 KB.');if(!request.body)return {};if(!(request.headers.get('content-type')||'').startsWith('application/json'))fail(415,'Send JSON content.');const reader=request.body.getReader();const chunks=[];let n=0;for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>65536){await reader.cancel();fail(413,'Request exceeds 64 KB.');}chunks.push(value);}const bytes=new Uint8Array(n);let off=0;for(const c of chunks){bytes.set(c,off);off+=c.length;}let body;try{body=JSON.parse(new TextDecoder().decode(bytes)||'{}');}catch{fail(400,'Invalid JSON.');}if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Expected a JSON object.');return body;}
export async function authRoutes({request,url,env,body,user}){
 const p=url.pathname,m=request.method;
 if(p==='/api/auth/login'&&m==='POST'){
  const username=text(body.username,60).toLowerCase(),password=typeof body.password==='string'?body.password:'';
  if(!/^[a-z0-9._-]{2,60}$/.test(username)||password.length>128)fail(401,'Username or password is incorrect.');
  const ip=request.headers.get('CF-Connecting-IP')||'local';const keys=[await sha('user:'+username),await sha('ip:'+ip)];
  const attempts=await rows(env,'SELECT * FROM login_attempts WHERE key IN (?,?)',...keys);
  if(attempts.some(a=>Date.now()-a.window_start<900000&&a.attempts>=(a.key===keys[0]?8:40)))fail(429,'Too many failed attempts. Try again in 15 minutes.');
  const record=await one(env,'SELECT * FROM users WHERE username=?',username);
  const valid=await checkPassword(password,record);
  if(!valid||!['active','on_leave'].includes(record.status)){
   await env.DB.batch(keys.map(key=>env.DB.prepare('INSERT INTO login_attempts(key,attempts,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN ?-window_start>=900000 THEN 1 ELSE attempts+1 END, window_start=CASE WHEN ?-window_start>=900000 THEN ? ELSE window_start END').bind(key,Date.now(),Date.now(),Date.now(),Date.now())));
   fail(401,'Username or password is incorrect.');
  }
  await run(env,'DELETE FROM login_attempts WHERE key=?',keys[0]);const token=await newSession(env,record.id);await audit(env,record,'login','account',record.id);
  return json({user:safeUser(record)},200,{'Set-Cookie':cookie(token)});
 }
 if(p==='/api/auth/logout'&&m==='POST'){const token=sessionToken(request);if(token)await run(env,'DELETE FROM sessions WHERE token_hash=?',await sha(token));return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
 if(!user)fail(401,'Sign in to TEL OS.');
 if(p==='/api/me'&&m==='GET')return json({user:safeUser(user)});
 if(p==='/api/auth/password'&&m==='POST'){
  validatePassword(body.new_password);if(!(await checkPassword(String(body.current_password||''),user)))fail(403,'Current password is incorrect.');if(body.current_password===body.new_password)fail(400,'Choose a different new password.');
  const s=salt(),hash=await hashPassword(body.new_password,s);
  await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,must_change_password=0 WHERE id=?').bind(hash,s,user.id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)]);
  const token=await newSession(env,user.id);await audit(env,user,'password_changed','account',user.id);return json({ok:true,user:{...safeUser(user),must_change_password:false}},200,{'Set-Cookie':cookie(token)});
 }
 if(user.must_change_password)fail(428,'Change your temporary password before accessing team data.');
 return null;
}
