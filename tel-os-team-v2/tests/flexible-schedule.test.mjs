import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

// Advance the Workers clock explicitly so elapsed time and each reminder stage are deterministic.
const wrapper=`import {handleSchedules,runAttendanceReminders} from './src/schedules.js';
import {handleWorkflows,runAutomations} from './src/workflows.js';
import {helpers} from './src/core.js';
const NativeDate=Date;let currentTime=NativeDate.parse('2026-11-16T12:00:00.000Z');
globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[currentTime]));}static now(){return currentTime;}};
export default {async fetch(request,env){try{
 currentTime=NativeDate.parse(request.headers.get('x-test-now')||'2026-11-16T12:00:00.000Z');
 const url=new URL(request.url),body=request.method==='GET'?{}:await request.json();
 if(url.pathname==='/test-check'){
  let prepare_calls=0;const measured={DB:{prepare(sql){prepare_calls++;return env.DB.prepare(sql);}}};
  return Response.json({...await runAttendanceReminders(measured,body.at),prepare_calls});
 }
 if(url.pathname==='/test-automations')return Response.json(await runAutomations(env));
 const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(request.headers.get('x-test-user')||'member').first();
 return await handleSchedules({request,url,env,user,body})||await handleWorkflows({request,url,env,user,body,helpers})||new Response('missing',{status:404});
}catch(e){return Response.json({error:e.message},{status:e.status||500});}}};`;
const compiled=await build({stdin:{contents:wrapper,resolveDir:process.cwd(),sourcefile:'flexible-schedule-test.js'},bundle:true,format:'esm',write:false,platform:'browser'});
const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'flexible-schedule-tests'}});
const db=await mf.getD1Database('DB');
const migration=(await readFile('schema-flexible-work.sql','utf8')).replaceAll('\n',' ');
for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql','schema-chat-read.sql','schema-task-transfers.sql','schema-operational-email.sql','schema-urgent-email.sql'])await db.exec((await readFile(file,'utf8')).replaceAll('\n',' '));
await db.exec(migration);
for(const [id,role,department,manager] of [['founder','founder','Leadership',null],['hr','hr_lead','HR','founder'],['hrmember','hr_member','HR','hr'],['lead','team_lead','Marketing','founder'],['member','employee','Marketing','lead'],['peer','employee','Marketing','lead']]){
 await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,manager_id,joined_on,status,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(id,id,id,'Fixture '+id,role,role,department,manager,'2026-11-01','active','h','s','2026-11-01T00:00:00.000Z').run();
}
await db.prepare("UPDATE attendance_policy SET activated_at='2026-11-01T00:00:00.000Z',updated_at='2026-11-01T00:00:00.000Z'").run();
async function api(user,method,path,body={},at='2026-11-16T12:00:00.000Z'){
 const response=await mf.dispatchFetch('https://tel.test'+path,{method,headers:{'Content-Type':'application/json','x-test-user':user,'x-test-now':at},...(method==='GET'?{}:{body:JSON.stringify(body)})});
 return {status:response.status,data:await response.json()};
}
async function ok(user,method,path,body={},at){const response=await api(user,method,path,body,at);assert.ok(response.status>=200&&response.status<300,JSON.stringify(response));return response.data;}
const check=at=>ok('founder','POST','/test-check',{at});
const notices=async()=> (await db.prepare('SELECT * FROM notifications ORDER BY id').all()).results;
const setting=value=>db.prepare("INSERT INTO app_settings(key,value) VALUES('attendance_mode',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(value).run();
async function clearNotices(){await db.prepare('DELETE FROM work_notification_deliveries').run();await db.prepare('DELETE FROM notifications').run();}
async function reset(){
 await clearNotices();
 for(const table of ['clock_in_events','attendance_sessions','work_schedules','attendance_corrections','leave_requests','availability','work_holidays','task_events','tasks','meeting_deliveries','meetings'])await db.prepare('DELETE FROM '+table).run();
 await db.prepare("DELETE FROM attendance_policy WHERE id<>'company'").run();
 await setting('flexible');
}

test('Flexible attendance uses real Workers and D1 without fixed-start enforcement',async t=>{try{
 await t.test('the additive migration preserves attendance, personal schedules and an explicit mode',async()=>{
  await db.prepare("INSERT INTO attendance_sessions(id,user_id,work_date,clock_in,clock_out,state,active_seconds,break_seconds,source,updated_at) VALUES('history','member','2026-11-13','2026-11-13T10:00:00.000Z','2026-11-13T15:00:00.000Z','closed',14400,3600,'clock','2026-11-13T15:00:00.000Z')").run();
  await db.prepare("INSERT INTO work_schedules(id,user_id,start_time,weekdays_json,enabled,effective_date,note,updated_by,updated_at) VALUES('personal','member','19:00','[1,3,5]',1,'2026-11-01','Saved preference','hr','2026-11-01T00:00:00.000Z')").run();
  const attendance=await db.prepare('SELECT * FROM attendance_sessions').all(),schedule=await db.prepare('SELECT * FROM work_schedules').all();
  await db.exec(migration);await db.exec(migration);
  assert.equal((await db.prepare("SELECT value FROM app_settings WHERE key='attendance_mode'").first()).value,'flexible');
  assert.deepEqual((await db.prepare('SELECT * FROM attendance_sessions').all()).results,attendance.results);
  assert.deepEqual((await db.prepare('SELECT * FROM work_schedules').all()).results,schedule.results);
  await setting('fixed');await db.exec(migration);assert.equal((await db.prepare("SELECT value FROM app_settings WHERE key='attendance_mode'").first()).value,'fixed');
  await reset();
 });
 await t.test('flexible mode and its missing or blank setting never publish a required shift',async()=>{
  for(const value of ['flexible','',null]){
   if(value===null)await db.prepare("DELETE FROM app_settings WHERE key='attendance_mode'").run();else await setting(value);
   const result=await ok('member','GET','/api/schedules');
   for(const view of [result,result.policy,result.schedules[0]]){assert.equal(view.attendance_mode,'flexible');assert.equal(view.flexible,true);assert.equal(view.target_hours,4);}
   assert.equal(result.policy.start_time,'17:00');assert.deepEqual(result.policy.weekdays,[1,2,3,4,5]);
   assert.equal(result.today.status,'flexible');assert.equal(result.today.scheduled_at,null);assert.equal(result.today.minutes_late,0);assert.equal(result.next_shift,null);
   assert.equal((await check('2026-11-16T12:00:00.000Z')).schedule_notifications,0);
  }
  await setting('flexible');
 });
 await t.test('prestart, start, grace and escalation checks create no false missed-clock-in notices',async()=>{
  await reset();
  await db.prepare("INSERT INTO work_schedules(id,user_id,start_time,weekdays_json,enabled,effective_date,note,updated_by,updated_at) VALUES('override','member','16:00','[1,2,3,4,5]',1,'2026-11-01','','hr','2026-11-01T00:00:00.000Z')").run();
  for(const at of ['2026-11-16T11:15:00.000Z','2026-11-16T11:30:00.000Z','2026-11-16T11:40:00.000Z','2026-11-16T12:00:00.000Z']){
   const result=await check(at);assert.equal(result.schedule_notifications,0);assert.equal(result.missing_clock_ins,0);assert.equal(result.attendance_mode,'flexible');assert.equal(result.prepare_calls,1);
  }
  assert.deepEqual(await notices(),[]);
 });
 await t.test('work above the target stays active and pause, resume and clock-out retain exact elapsed time',async()=>{
  await reset();
  const started=await ok('member','POST','/api/attendance',{action:'clock_in'},'2026-11-16T10:00:00.000Z');
  const original=await db.prepare('SELECT * FROM attendance_sessions WHERE id=?').bind(started.session.id).first();
  for(const at of ['2026-11-16T11:15:00.000Z','2026-11-16T11:30:00.000Z','2026-11-16T11:40:00.000Z','2026-11-16T12:00:00.000Z'])await check(at);
  assert.deepEqual(await db.prepare('SELECT * FROM attendance_sessions WHERE id=?').bind(started.session.id).first(),original);
  const working=await ok('member','GET','/api/attendance',{},'2026-11-16T14:30:00.000Z');
  assert.equal(working.target_seconds,14400);assert.equal(working.current.active_seconds,16200);assert.equal(working.current.state,'working');assert.equal(working.current.clock_out,null);
  assert.equal((await ok('member','POST','/api/attendance',{action:'pause'},'2026-11-16T14:35:00.000Z')).session.active_seconds,16500);
  await check('2026-11-16T14:45:00.000Z');
  const paused=await ok('member','GET','/api/attendance',{},'2026-11-16T14:45:00.000Z');assert.equal(paused.current.active_seconds,16500);assert.equal(paused.current.break_seconds,600);assert.equal(paused.current.state,'break');
  const resumed=await ok('member','POST','/api/attendance',{action:'resume'},'2026-11-16T14:50:00.000Z');assert.equal(resumed.session.break_seconds,900);
  const ended=await ok('member','POST','/api/attendance',{action:'clock_out'},'2026-11-16T15:00:00.000Z');assert.equal(ended.session.active_seconds,17100);assert.equal(ended.session.break_seconds,900);assert.equal(ended.session.state,'closed');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM clock_in_events WHERE user_id=?').bind('member').first()).n,1);
 });
 await t.test('a start after the saved company time is flexible and never labelled late',async()=>{
  await reset();await ok('member','POST','/api/attendance',{action:'clock_in'},'2026-11-16T12:00:00.000Z');
  const result=await ok('member','GET','/api/schedules');assert.equal(result.today.first_clock_in,'2026-11-16T12:00:00.000Z');assert.equal(result.today.status,'flexible');assert.equal(result.today.minutes_late,0);
  await check('2026-11-16T12:30:00.000Z');assert.deepEqual(await notices(),[]);
 });
 await t.test('task, meeting and leave automations continue without changing active attendance',async()=>{
  await reset();
  const started=await ok('member','POST','/api/attendance',{action:'clock_in'},'2026-11-16T10:00:00.000Z');
  const before=await db.prepare('SELECT * FROM attendance_sessions WHERE id=?').bind(started.session.id).first();
  await db.prepare("INSERT INTO tasks(id,title,assignee_id,leader_id,department,priority,deadline,expected_deliverable,created_by,created_at,updated_at) VALUES('due','Fixture deliverable','member','lead','Marketing','normal','2026-11-15','A result','lead','2026-11-15T00:00:00.000Z','2026-11-15T00:00:00.000Z')").run();
  await db.prepare("INSERT INTO leave_requests(id,user_id,type,start_date,end_date,reason,status,created_at,updated_at) VALUES('leave','peer','medical','2026-11-16','2026-11-16','Fixture leave','approved','2026-11-15T00:00:00.000Z','2026-11-15T00:00:00.000Z')").run();
  await db.prepare("INSERT INTO meetings(id,title,purpose,starts_at,participants_json,created_by,created_at,updated_at) VALUES('meeting','Fixture meeting','Discuss work','2026-11-16T13:00:00.000Z','[\"member\"]','lead','2026-11-15T00:00:00.000Z','2026-11-15T00:00:00.000Z')").run();
  const result=await ok('founder','POST','/test-automations');assert.equal(result.attendance_reminders.schedule_notifications,0);assert.equal(result.attendance_reminders.missing_clock_ins,0);
  const stored=await notices();assert.ok(stored.some(n=>n.user_id==='member'&&n.title==='Assignment overdue'));assert.ok(stored.some(n=>n.user_id==='member'&&n.title==='Upcoming meeting'));assert.ok(stored.some(n=>n.user_id==='peer'&&n.title==='Approved leave is active'));
  assert.ok(stored.every(n=>!['Your scheduled start is coming up','It is time to clock in','Scheduled clock-in missed','Scheduled clock-in needs follow-up'].includes(n.title)));
  assert.deepEqual(await db.prepare('SELECT * FROM attendance_sessions WHERE id=?').bind(started.session.id).first(),before);
  assert.equal((await db.prepare("SELECT starts_at FROM meetings WHERE id='meeting'").first()).starts_at,'2026-11-16T13:00:00.000Z');
 });
 await t.test('only founders or HR leads change the validated company mode and fixed reactivation is not retroactive',async()=>{
  await reset();
  for(const user of ['member','lead','hrmember'])assert.equal((await api(user,'PATCH','/api/schedules/policy',{attendance_mode:'fixed'})).status,403);
  for(const attendance_mode of ['hybrid',true,null,''])assert.equal((await api('founder','PATCH','/api/schedules/policy',{attendance_mode})).status,400);
  const saved=await db.prepare("SELECT start_time,weekdays_json,effective_date FROM attendance_policy WHERE id='company'").first();
  const fixed=await ok('hr','PATCH','/api/schedules/policy',{attendance_mode:'fixed'});assert.equal(fixed.attendance_mode,'fixed');assert.equal(fixed.flexible,false);assert.equal(fixed.policy.target_hours,4);
  await clearNotices();assert.equal((await check('2026-11-16T12:30:00.000Z')).schedule_notifications,0);
  const tomorrow=await check('2026-11-17T12:00:00.000Z');assert.ok(tomorrow.missing_clock_ins>0);assert.ok(tomorrow.schedule_notifications>0);
  const flexible=await ok('founder','PATCH','/api/schedules/policy',{attendance_mode:'flexible'});assert.equal(flexible.policy.flexible,true);
  assert.deepEqual(await db.prepare("SELECT start_time,weekdays_json,effective_date FROM attendance_policy WHERE id='company'").first(),saved);
  await clearNotices();assert.equal((await check('2026-11-17T12:00:00.000Z')).schedule_notifications,0);
 });
}finally{await mf.dispose();}});
