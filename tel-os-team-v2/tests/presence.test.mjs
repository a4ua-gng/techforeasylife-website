import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {hashPassword} from '../src/core.js';

let runtime,db,founderCookie;
const origin='https://presence.test',password='LocalPresenceFixture!2026',salt='0123456789abcdef0123456789abcdef';
before(async()=>{
 const built=await build({entryPoints:['src/worker.js'],bundle:true,write:false,format:'esm',platform:'browser',define:{__HTML__:JSON.stringify('presence fixture'),__CSS__:JSON.stringify(''),__APP__:JSON.stringify(''),__BINARY_ASSETS__:JSON.stringify({})}});
 runtime=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'presence-fixture'}});db=await runtime.getD1Database('DB');
 for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql','schema-chat-read.sql','schema-task-transfers.sql','schema-operational-email.sql','schema-urgent-email.sql','schema-flexible-work.sql','schema-hr-records.sql','schema-deadline-policy.sql','schema-announcements.sql','schema-grievance-access.sql'])await db.exec((await readFile(file,'utf8')).replaceAll('\n',' '));
 const hash=await hashPassword(password,salt),stamp=new Date().toISOString();
 for(const [uid,role]of[['founder','founder'],['member','employee'],['paused','employee']]){
  await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,email,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(uid,uid,uid,uid,role,role,'Marketing',uid+'@example.test','2026-01-01',hash,salt,stamp).run();
  await db.prepare('INSERT INTO onboarding(user_id) VALUES(?)').bind(uid).run();
  await db.prepare("INSERT INTO member_connections VALUES(?,'gmail',?,'verified',?,?)").bind(uid,uid+'@example.test',stamp,stamp).run();
 }
 founderCookie=await login('founder');
});
after(async()=>{if(runtime)await runtime.dispose();});
async function request(path,{cookie,method='GET',body}={}){const headers={};if(cookie)headers.Cookie=cookie;if(method!=='GET'){headers.Origin=origin;headers['Content-Type']='application/json';}const response=await runtime.dispatchFetch(origin+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});return {response,status:response.status,data:(response.headers.get('Content-Type')||'').includes('json')?await response.json():null};}
async function login(username){const result=await request('/api/auth/login',{method:'POST',body:{username,password}});assert.equal(result.status,200);return result.response.headers.get('set-cookie').split(';')[0];}
async function status(uid){const result=await request('/api/people',{cookie:founderCookie});assert.equal(result.status,200);return result.data.people.find(person=>person.id===uid);}

test('login is online immediately; hidden, unfocused or stale heartbeats never make a signed-in user away',async()=>{
 const cookie=await login('member');
 assert.equal((await status('member')).presence,'online');
 assert.equal((await status('member')).crew_status,'not_clocked_in');
 const result=await request('/api/activity/heartbeat',{cookie,method:'POST',body:{client_id:'00000000-0000-4000-8000-000000000019',section:'home',visible:false,focused:false,idle_seconds:86400}});
 assert.equal(result.status,200);
 await db.prepare("UPDATE activity_sessions SET last_seen='2000-01-01T00:00:00Z' WHERE user_id='member'").run();
 assert.equal((await status('member')).presence,'online');
 const report=await request('/api/activity/report',{cookie:founderCookie});
 assert.equal(report.data.people.find(person=>person.id==='member').presence,'online');
 assert.equal(report.data.people.find(person=>person.id==='member').last_seen,'2000-01-01T00:00:00Z');
 assert.equal(report.data.presence_model,'signed_in_session');
 assert.ok(report.data.people.every(person=>person.presence!=='away'));
});

test('clock-in, break, resume and clock-out change work status while login stays online',async()=>{
 const cookie=await login('member');
 for(const [action,state]of[['clock_in','working'],['pause','on_break'],['resume','working'],['clock_out','not_clocked_in']]){
  const result=await request('/api/attendance',{cookie,method:'POST',body:{action}});assert.ok([200,201].includes(result.status),JSON.stringify(result.data));
  const person=await status('member');assert.equal(person.presence,'online');assert.equal(person.crew_status,state);
  const report=await request('/api/activity/report',{cookie:founderCookie});assert.equal(report.data.people.find(person=>person.id==='member').work_status,state);
 }
});

test('one device logout preserves another valid session, while last logout or expiry makes the member offline',async()=>{
 await db.prepare("DELETE FROM sessions WHERE user_id='member'").run();
 const first=await login('member'),second=await login('member');
 assert.equal((await request('/api/auth/logout',{cookie:first,method:'POST',body:{}})).status,200);
 assert.equal((await status('member')).presence,'online');
 assert.equal((await request('/api/auth/logout',{cookie:second,method:'POST',body:{}})).status,200);
 assert.equal((await status('member')).presence,'offline');
 await login('member');await db.prepare("UPDATE sessions SET expires_at='2000-01-01T00:00:00Z' WHERE user_id='member'").run();
 assert.equal((await status('member')).presence,'offline');
});

test('open attendance remains Working after logout and a signed-in person on leave stays Online',async()=>{
 const cookie=await login('member');
 assert.equal((await request('/api/attendance',{cookie,method:'POST',body:{action:'clock_in'}})).status,201);
 await db.prepare("DELETE FROM sessions WHERE user_id='member'").run();
 const loggedOut=await status('member');assert.equal(loggedOut.presence,'offline');assert.equal(loggedOut.crew_status,'working');
 const resumedCookie=await login('member');await request('/api/attendance',{cookie:resumedCookie,method:'POST',body:{action:'clock_out'}});
 await db.prepare("UPDATE users SET status='on_leave' WHERE id='paused'").run();await login('paused');
 const onLeave=await status('paused');assert.equal(onLeave.presence,'online');assert.equal(onLeave.crew_status,'on_leave');
});

test('suspended or exited accounts are offline even with stored unexpired sessions',async()=>{
 await login('paused');assert.equal((await status('paused')).presence,'online');
 for(const state of ['suspended','exited']){
  await db.prepare('UPDATE users SET status=? WHERE id=?').bind(state,'paused').run();
  const person=await status('paused');assert.equal(person.presence,'offline');assert.equal(person.crew_status,'unavailable');
 }
});

test('lightweight presence endpoint requires authentication and keeps heartbeat timestamps founder-only',async()=>{
 assert.equal((await request('/api/presence')).status,401);
 const cookie=await login('member'),member=await request('/api/presence',{cookie}),founder=await request('/api/presence',{cookie:founderCookie});
 assert.equal(member.status,200);assert.ok(member.data.people.every(person=>!('last_seen'in person)&&!('email'in person)&&!('name'in person)));
 assert.equal(founder.status,200);assert.ok(founder.data.people.some(person=>person.id==='member'&&person.last_seen));
 assert.equal((await request('/api/activity/report',{cookie})).status,403);
});
