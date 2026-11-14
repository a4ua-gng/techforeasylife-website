import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {hashPassword,sha} from '../src/core.js';

let mf, db;
const origin='https://tel.test';
const fixturePassword='Fixture!Password2026';
const stamp=new Date().toISOString();
const fixtures=[
 ['f1','founder','Leadership',null,0,'active'],['f2','founder','Leadership',null,0,'active'],
 ['hr','hr_lead','HR','f1',0,'active'],['hrm','hr_member','HR','hr',0,'active'],
 ['lead','team_lead','Marketing','f1',0,'active'],['staff','employee','Marketing','lead',0,'active'],
 ['resetstaff','employee','Marketing','lead',0,'active'],['suspendstaff','employee','Marketing','lead',0,'active'],
 ['temporary','employee','Marketing','lead',1,'active'],['absent','finance_head','Finance','f2',1,'on_leave']
];
before(async()=>{
 await mkdir('tests/artifacts',{recursive:true});
 await build({entryPoints:['src/worker.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'tests/artifacts/auth-worker.mjs',define:{__HTML__:JSON.stringify('<html>test</html>'),__CSS__:JSON.stringify(''),__APP__:JSON.stringify('')}});
 mf=new Miniflare({modules:true,scriptPath:'tests/artifacts/auth-worker.mjs',compatibilityDate:'2026-07-30',d1Databases:{DB:'auth-admin-test'}});
 db=await mf.getD1Database('DB');
 for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql']) await db.exec((await readFile(file,'utf8')).replace(/\n/g,' '));
 const salt='0123456789abcdef0123456789abcdef',hash=await hashPassword(fixturePassword,salt);
 for(const [id,role,department,manager,force,status] of fixtures){
  await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,manager_id,email,phone,joined_on,status,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,'TEST-'+id,id,'Fixture '+id,role,role,department,manager,id+'@example.test','private-phone','2026-01-01',status,hash,salt,force,stamp).run();
  await db.prepare('INSERT INTO onboarding(user_id) VALUES(?)').bind(id).run();
 }
});
after(async()=>{if(mf)await mf.dispose();});
async function session(userId){const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');await db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(await sha(token),userId,stamp,new Date(Date.now()+3600000).toISOString()).run();return '__Host-tel_session='+token;}
async function req(path,{user,cookie,method='GET',body,headers={}}={}){if(user)cookie=await session(user);const h={...headers};if(cookie)h.Cookie=cookie;if(method!=='GET'){h.Origin??=origin;h['Content-Type']??='application/json';}const r=await mf.dispatchFetch(origin+path,{method,headers:h,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};}

test('anonymous requests and cross-origin writes are rejected; responses carry security headers',async()=>{
 assert.equal((await req('/api/people')).status,401);
 const r=await req('/api/health');assert.equal(r.status,200);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal((await req('/api/auth/login',{method:'POST',body:{username:'staff',password:fixturePassword},headers:{Origin:'https://other.test'}})).status,403);
});
test('malformed JSON, arrays, oversized payloads and wrong media types are rejected',async()=>{
 assert.equal((await req('/api/auth/login',{method:'POST',body:'{broken'})).status,400);
 assert.equal((await req('/api/auth/login',{method:'POST',body:'[]'})).status,400);
 assert.equal((await req('/api/auth/login',{method:'POST',body:{x:'a'.repeat(65537)}})).status,413);
 assert.equal((await req('/api/auth/login',{method:'POST',body:'test',headers:{'Content-Type':'text/plain'}})).status,415);
});
test('temporary login permits password change and blocks team data',async()=>{
 const login=await req('/api/auth/login',{method:'POST',body:{username:'temporary',password:fixturePassword}});assert.equal(login.status,200);assert.equal(login.data.user.must_change_password,true);assert.ok(login.cookie);assert.doesNotMatch(JSON.stringify(login.data),/password_hash|password_salt/);assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 assert.equal((await req('/api/people',{cookie:login.cookie})).status,428);
 assert.equal((await req('/api/me',{cookie:login.cookie})).data.user.must_change_password,true);
 const changed=await req('/api/auth/password',{cookie:login.cookie,method:'POST',body:{current_password:fixturePassword,new_password:'Updated!Password2026'}});assert.equal(changed.status,200);assert.equal(changed.data.user.must_change_password,false);assert.notEqual(changed.cookie,login.cookie);
 assert.equal((await req('/api/me',{cookie:login.cookie})).status,401);assert.equal((await req('/api/people',{cookie:changed.cookie})).status,200);
 assert.equal((await req('/api/auth/login',{method:'POST',body:{username:'temporary',password:fixturePassword}})).status,401);
 assert.equal((await req('/api/auth/login',{method:'POST',body:{username:'temporary',password:'Updated!Password2026'}})).status,200);
});
test('failed logins are generic and rate limited for unknown usernames',async()=>{
 for(let i=0;i<8;i++){const r=await req('/api/auth/login',{method:'POST',body:{username:'unknown',password:'wrong'}});assert.equal(r.status,401);assert.equal(r.data.error,'Username or password is incorrect.');}
 assert.equal((await req('/api/auth/login',{method:'POST',body:{username:'unknown',password:'wrong'}})).status,429);
});
test('employee directory omits private contacts and secrets; profiles enforce access',async()=>{
 const r=await req('/api/people',{user:'staff'});assert.equal(r.status,200);assert.equal(r.data.people.length,fixtures.length);for(const p of r.data.people){assert.equal(p.email,undefined);assert.equal(p.phone,undefined);assert.equal(p.password_hash,undefined);assert.equal(p.password_salt,undefined);}
 assert.equal((await req('/api/people/hr',{user:'staff'})).status,403);
 const self=await req('/api/people/staff',{user:'staff'});assert.equal(self.status,200);assert.equal(self.data.user.email,'staff@example.test');assert.equal(self.data.user.password_hash,undefined);
 assert.equal((await req('/api/people/staff',{user:'hr'})).status,200);
});
test('employees cannot administer accounts and HR cannot grant or reset founder access',async()=>{
 assert.equal((await req('/api/people/staff',{user:'staff',method:'PATCH',body:{role:'founder'}})).status,403);
 assert.equal((await req('/api/people/staff',{user:'hr',method:'PATCH',body:{role:'founder'}})).status,403);
 assert.equal((await req('/api/people',{user:'hr',method:'POST',body:{username:'elevated',name:'Elevated',role:'founder',department:'Leadership'}})).status,403);
 assert.equal((await req('/api/people/f1/reset-password',{user:'hr',method:'POST',body:{}})).status,403);
 assert.equal((await req('/api/people/lead/reset-password',{user:'hrm',method:'POST',body:{}})).status,403);
});
test('password reset revokes existing sessions, returns a new temporary password and forces first change',async()=>{
 const oldCookie=await session('resetstaff');
 const r=await req('/api/people/resetstaff/reset-password',{user:'hr',method:'POST',body:{}});assert.equal(r.status,200);assert.ok(r.data.temporary_password.length>=20);
 assert.equal((await req('/api/me',{cookie:oldCookie})).status,401);
 assert.equal((await req('/api/auth/login',{method:'POST',body:{username:'resetstaff',password:fixturePassword}})).status,401);
 const login=await req('/api/auth/login',{method:'POST',body:{username:'resetstaff',password:r.data.temporary_password}});assert.equal(login.status,200);assert.equal(login.data.user.must_change_password,true);assert.equal((await req('/api/tasks',{cookie:login.cookie})).status,428);
});
test('onboarding validates reporting managers, impossible dates and duplicate names safely',async()=>{
 const base={username:'newhire',name:'New Hire',designation:'Member',role:'employee',department:'Marketing',manager_id:'lead'};
 assert.equal((await req('/api/people',{user:'hr',method:'POST',body:{...base,manager_id:{bad:true}}})).status,400);
 assert.equal((await req('/api/people',{user:'hr',method:'POST',body:{...base,joined_on:'2026-02-31'}})).status,400);
 assert.equal((await req('/api/people/staff',{user:'hr',method:'PATCH',body:{manager_id:{bad:true}}})).status,400);
 assert.equal((await req('/api/people/staff',{user:'hr',method:'PATCH',body:{manager_id:'resetstaff'}})).status,400);
 assert.equal((await req('/api/people/staff',{user:'hr',method:'PATCH',body:{department:'Finance'}})).status,400);
 const r=await req('/api/people',{user:'hr',method:'POST',body:base});assert.equal(r.status,201);assert.ok(r.data.temporary_password);assert.ok(r.data.user.employee_id);
 assert.equal((await req('/api/people',{user:'hr',method:'POST',body:base})).status,409);
 assert.equal((await req('/api/people/lead',{user:'f1',method:'PATCH',body:{manager_id:'staff'}})).status,400);
});
test('account suspension requires independent founder approval and invalidates sessions',async()=>{
 const cookie=await session('suspendstaff');
 const r=await req('/api/people/suspendstaff/status-request',{user:'hr',method:'POST',body:{status:'suspended',reason:'Documented fixture review'}});assert.equal(r.status,201);
 assert.equal((await req('/api/status-requests/'+r.data.id,{user:'hr',method:'PATCH',body:{action:'approve'}})).status,403);
 const approval=await req('/api/status-requests/'+r.data.id,{user:'f1',method:'PATCH',body:{action:'approve',comment:'Independent review completed'}});assert.equal(approval.status,200);
 assert.equal((await req('/api/me',{cookie})).status,401);
 assert.equal((await req('/api/auth/login',{method:'POST',body:{username:'suspendstaff',password:fixturePassword}})).status,401);
 assert.equal((await req('/api/status-requests/'+r.data.id,{user:'f2',method:'PATCH',body:{action:'approve'}})).status,409);
 const self=await req('/api/people/staff/status-request',{user:'f1',method:'POST',body:{status:'suspended',reason:'Fixture'}});assert.equal(self.status,201);assert.equal((await req('/api/status-requests/'+self.data.id,{user:'f1',method:'PATCH',body:{action:'approve'}})).status,403);
});
test('founders cannot remove their own founder role; audit endpoint is restricted',async()=>{
 assert.equal((await req('/api/people/f1',{user:'f1',method:'PATCH',body:{role:'employee'}})).status,403);
 assert.equal((await req('/api/audit',{user:'hr'})).status,403);assert.equal((await req('/api/audit',{user:'staff'})).status,403);
 const r=await req('/api/audit',{user:'f1'});assert.equal(r.status,200);assert.ok(r.data.events.some(e=>e.action==='password_reset'));assert.doesNotMatch(JSON.stringify(r.data),/Fixture!Password|Updated!Password|password_hash|private-phone/);
});
test('final status guard preserves the last active founder even for a persisted request',async()=>{
 await db.prepare("UPDATE users SET status='on_leave' WHERE id='f2'").run();
 try{
  assert.equal((await req('/api/people/f1',{user:'f2',method:'PATCH',body:{role:'employee',department:'Marketing',manager_id:'lead'}})).status,409);
  await db.prepare("INSERT INTO status_requests(id,user_id,requested_by,status,reason,created_at) VALUES('last-founder','f1','hr','suspended','Fixture persisted request',?)").bind(stamp).run();
  assert.equal((await req('/api/status-requests/last-founder',{user:'f2',method:'PATCH',body:{action:'approve'}})).status,409);
  const founder=await db.prepare("SELECT status FROM users WHERE id='f1'").first();assert.equal(founder.status,'active');
 }finally{await db.prepare("UPDATE users SET status='active' WHERE id='f2'").run();}
});
test('ordinary contact edits retain sessions while authority changes revoke them',async()=>{
 const cookie=await session('staff');
 assert.equal((await req('/api/people/staff',{user:'hr',method:'PATCH',body:{phone:'updated-private-phone'}})).status,200);
 assert.equal((await req('/api/me',{cookie})).status,200);
 assert.equal((await req('/api/people/staff',{user:'f1',method:'PATCH',body:{manager_id:'f1'}})).status,200);
 assert.equal((await req('/api/me',{cookie})).status,401);
});
test('suspended crew cannot appear working from a stale attendance session',async()=>{
 await db.prepare("INSERT INTO attendance_sessions(id,user_id,work_date,clock_in,state,active_started_at,updated_at) VALUES('stale-suspended','suspendstaff','2026-01-01',?,'working',?,?)").bind(stamp,stamp,stamp).run();
 const directory=await req('/api/people',{user:'staff'});assert.equal(directory.data.people.find(p=>p.id==='suspendstaff').crew_status,'unavailable');
});
test('on-leave finance member can sign in but cannot clock in',async()=>{
 const r=await req('/api/auth/login',{method:'POST',body:{username:'absent',password:fixturePassword}});assert.equal(r.status,200);assert.equal(r.data.user.status,'on_leave');
 await db.prepare('UPDATE users SET must_change_password=0 WHERE id=?').bind('absent').run();
 assert.equal((await req('/api/attendance',{cookie:r.cookie,method:'POST',body:{action:'clock_in'}})).status,409);
});
