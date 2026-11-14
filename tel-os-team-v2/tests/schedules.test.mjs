import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

const wrapper=`import {handleSchedules,runAttendanceReminders} from './src/schedules.js';import {helpers} from './src/core.js';export default {async fetch(request,env){try{const url=new URL(request.url),body=request.method==='GET'?{}:await request.json();if(url.pathname==='/test-check'){let prepare_calls=0;const measured={DB:{prepare(sql){prepare_calls++;return env.DB.prepare(sql);}}};const result=await runAttendanceReminders(body.measure?measured:env,body.at);return Response.json({...result,...(body.measure?{prepare_calls}:{})});}const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(request.headers.get('x-test-user')||'member').first();const response=await handleSchedules({request,url,env,user,body,helpers});return response||new Response('missing',{status:404});}catch(e){return Response.json({error:e.message},{status:e.status||500});}}};`;
const compiled=await build({stdin:{contents:wrapper,resolveDir:process.cwd(),sourcefile:'schedule-test.js'},bundle:true,format:'esm',write:false,platform:'browser'});
const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'schedule-tests'}});
const db=await mf.getD1Database('DB');
for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql'])await db.exec((await readFile(file,'utf8')).replaceAll('\n',' '));
const people=[['founder','founder','Leadership',null,'active'],['hr','hr_lead','HR','founder','active'],['hrmember','hr_member','HR','hr','active'],['lead','team_lead','Marketing','founder','active'],['member','employee','Marketing','lead','active'],['peer','employee','Marketing','lead','active'],['finance','finance_head','Finance','founder','on_leave']];
for(const [id,role,department,manager,status] of people)await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,manager_id,joined_on,status,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(id,id,id,'Fixture '+id,role,role,department,manager,'2026-11-01',status,'h','s','2026-11-01T00:00:00.000Z').run();
await db.prepare("UPDATE attendance_policy SET activated_at='2026-11-01T00:00:00.000Z',updated_at='2026-11-01T00:00:00.000Z'").run();
async function api(user,method,path,body={}){const r=await mf.dispatchFetch('https://tel.test'+path,{method,headers:{'Content-Type':'application/json','x-test-user':user},...(method==='GET'?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};}
async function check(at){const r=await api('founder','POST','/test-check',{at});assert.equal(r.status,200,JSON.stringify(r));return r.data;}
const notices=async(user)=>db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at').bind(user).all();
async function reset(){await db.prepare('DELETE FROM notifications').run();await db.prepare('DELETE FROM work_schedules').run();await db.prepare("DELETE FROM attendance_policy WHERE id<>'company'").run();await db.prepare('DELETE FROM work_holidays').run();await db.prepare('DELETE FROM clock_in_events').run();await db.prepare('DELETE FROM attendance_sessions').run();await db.prepare('DELETE FROM attendance_corrections').run();await db.prepare('DELETE FROM leave_requests').run();await db.prepare('DELETE FROM availability').run();}
test('Scheduled clock-ins use actual Workers runtime and D1',async t=>{try{
 await t.test('everyone inherits weekday17:00IST and staff only see own schedule',async()=>{
  const own=await api('member','GET','/api/schedules');assert.equal(own.status,200);assert.equal(own.data.schedules.length,1);assert.equal(own.data.policy.start_time,'17:00');assert.deepEqual(own.data.policy.weekdays,[1,2,3,4,5]);assert.equal(own.data.next_shift.scheduled_at,'2026-11-16T11:30:00.000Z');
  assert.equal((await api('lead','GET','/api/schedules')).data.schedules.length,3);assert.equal((await api('hr','GET','/api/schedules')).data.schedules.length,7);
 });
 await t.test('prestart, due, missing and manager/HR notices are deduplicated by stage',async()=>{
  await reset();await check('2026-11-16T11:15:00.000Z');assert.equal((await notices('member')).results.length,1);await check('2026-11-16T11:20:00.000Z');assert.equal((await notices('member')).results.length,1);
  await check('2026-11-16T11:30:00.000Z');assert.equal((await notices('member')).results.length,2);await check('2026-11-16T11:40:00.000Z');assert.equal((await notices('member')).results.length,3);
  await check('2026-11-16T12:00:00.000Z');const lead=(await notices('lead')).results.filter(n=>n.body.includes('Fixture member'));assert.equal(lead.length,1);assert.equal((await notices('hr')).results.filter(n=>n.body.includes('Fixture member')).length,1);
  const before=await db.prepare('SELECT COUNT(*) n FROM notifications').first();await check('2026-11-16T12:05:00.000Z');assert.equal((await db.prepare('SELECT COUNT(*) n FROM notifications').first()).n,before.n);
 });
 await t.test('a late first check sends current missing/follow-up notices without reminder backfill',async()=>{
  await reset();await check('2026-11-16T12:00:00.000Z');const list=(await notices('member')).results;assert.equal(list.filter(n=>n.dedupe_key.endsWith(':reminder')||n.dedupe_key.endsWith(':due')).length,0);assert.equal(list.filter(n=>n.dedupe_key.endsWith(':missing')).length,1);
 });
 await t.test('weekends, preactivation days and manual leave produce no attendance alerts',async()=>{
  await reset();assert.equal((await check('2026-11-13T12:00:00.000Z')).schedule_notifications,0);assert.equal((await check('2026-11-15T12:00:00.000Z')).schedule_notifications,0);await check('2026-11-16T12:00:00.000Z');assert.equal((await notices('finance')).results.length,0);
 });
 await t.test('approved leave, academic availability, holidays and corrections suppress false alerts',async()=>{
  await reset();await db.prepare("INSERT INTO leave_requests(id,user_id,type,start_date,end_date,reason,status,created_at,updated_at) VALUES('leave','member','medical','2026-11-16','2026-11-16','PRIVATE','approved',?,?)").bind('2026-11-01T00:00:00Z','2026-11-01T00:00:00Z').run();
  await db.prepare("INSERT INTO availability(id,user_id,kind,start_date,end_date,notes,created_at) VALUES('exam','peer','exam','2026-11-16','2026-11-16','PRIVATE','2026-11-01T00:00:00Z')").run();
  await db.prepare("INSERT INTO attendance_corrections(id,user_id,work_date,requested_seconds,reason,status,created_at,updated_at) VALUES('correction','lead','2026-11-16',14400,'Forgot clock','approved','2026-11-16T11:30:00Z','2026-11-16T11:30:00Z')").run();
  await check('2026-11-16T12:00:00.000Z');for(const u of ['member','peer','lead'])assert.equal((await notices(u)).results.filter(n=>n.dedupe_key.includes('clock-in:2026-11-16:'+u+':')).length,0);
  await db.prepare("INSERT INTO work_holidays(id,date,title,created_by,created_at) VALUES('holiday','2026-11-17','Company holiday','hr','2026-11-01T00:00:00Z')").run();assert.equal((await check('2026-11-17T12:00:00.000Z')).schedule_notifications,0);
 });
 await t.test('real clock-ins and new accounts activated after start do not trigger missed-clock escalation',async()=>{
  await reset();await db.prepare("INSERT INTO attendance_sessions(id,user_id,work_date,clock_in,clock_out,state,active_seconds,source,updated_at) VALUES('worked','member','2026-11-16','2026-11-16T11:45:00Z','2026-11-16T12:00:00Z','closed',900,'clock','2026-11-16T12:00:00Z')").run();
  await db.prepare("INSERT INTO clock_in_events(session_id,user_id,occurred_at) VALUES('worked','member','2026-11-16T11:45:00.000Z')").run();
  await db.prepare("UPDATE users SET created_at='2026-11-16T11:50:00Z' WHERE id='peer'").run();await check('2026-11-16T12:00:00.000Z');assert.equal((await notices('member')).results.filter(n=>n.dedupe_key.includes(':member:')).length,0);assert.equal((await notices('peer')).results.filter(n=>n.dedupe_key.includes(':peer:')).length,0);await db.prepare("UPDATE users SET created_at='2026-11-01T00:00:00Z' WHERE id='peer'").run();
 });
 await t.test('employees cannot change schedules or holidays; HR member cannot change global policy',async()=>{
  await reset();assert.equal((await api('member','PUT','/api/schedules/member',{start_time:'18:00',weekdays:[1],enabled:true,effective_date:'2026-11-23'})).status,403);assert.equal((await api('member','POST','/api/holidays',{date:'2026-11-23',title:'Fake holiday'})).status,403);assert.equal((await api('hrmember','PATCH','/api/schedules/policy',{start_time:'18:00',effective_date:'2026-11-23'})).status,403);
 });
 await t.test('synthetic midnight attendance rows do not count as a new explicit clock-in',async()=>{
  await reset();await db.prepare("INSERT INTO attendance_sessions(id,user_id,work_date,clock_in,state,active_started_at,source,updated_at) VALUES('rollover','member','2026-11-16','2026-11-15T18:30:00Z','working','2026-11-15T18:30:00Z','clock','2026-11-15T18:30:00Z')").run();await check('2026-11-16T11:40:00.000Z');assert.equal((await notices('member')).results.filter(n=>n.title==='Scheduled clock-in missed').length,1);
 });
 await t.test('a policy activated after its start does not create a retroactive missed clock-in',async()=>{
  await reset();await db.prepare("INSERT INTO attendance_policy(id,start_time,weekdays_json,enabled,effective_date,activated_at,updated_at) VALUES('late-activation','17:00','[1,2,3,4,5]',1,'2026-11-16','2026-11-16T11:50:00Z','2026-11-16T11:50:00Z')").run();assert.equal((await check('2026-11-16T12:00:00.000Z')).schedule_notifications,0);
 });
 await t.test('resetting an override after the inherited start cannot cause a retroactive miss',async()=>{
  await reset();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  await db.prepare("UPDATE attendance_policy SET start_time='00:00',weekdays_json='[1,2,3,4,5,6,7]',effective_date=? WHERE id='company'").bind(today).run();
  await db.prepare("INSERT INTO work_schedules(id,user_id,start_time,weekdays_json,enabled,effective_date,note,updated_by,updated_at) VALUES('disabled','member','23:59','[1,2,3,4,5,6,7]',0,?,'','hr',?)").bind(today,new Date().toISOString()).run();
  assert.equal((await api('hr','DELETE','/api/schedules/member')).status,409);assert.ok(await db.prepare("SELECT id FROM work_schedules WHERE id='disabled'").first());
  await db.prepare("UPDATE attendance_policy SET start_time='17:00',weekdays_json='[1,2,3,4,5]',effective_date='2026-11-16' WHERE id='company'").run();
 });
 await t.test('removing today’s holiday after working start preserves the exemption',async()=>{
  await reset();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  await db.prepare("UPDATE attendance_policy SET start_time='00:00',weekdays_json='[1,2,3,4,5,6,7]',effective_date=? WHERE id='company'").bind(today).run();
  const created=await api('hr','POST','/api/holidays',{date:today,title:'Current holiday'});assert.equal(created.status,201);assert.equal((await api('hr','DELETE','/api/holidays/'+created.data.holiday.id)).status,409);assert.ok(await db.prepare('SELECT id FROM work_holidays WHERE id=?').bind(created.data.holiday.id).first());
  await db.prepare("UPDATE attendance_policy SET start_time='17:00',weekdays_json='[1,2,3,4,5]',effective_date='2026-11-16' WHERE id='company'").run();
 });
 await t.test('HR validates times/weekdays/dates and future overrides preserve the current schedule',async()=>{
  await reset();const base={start_time:'18:00',weekdays:[1,2,3,4,5],enabled:true,effective_date:'2026-11-23'};
  for(const bad of [{start_time:'25:00'},{weekdays:[1,1]},{weekdays:['1']},{enabled:'true'},{effective_date:'2026-02-31'}])assert.equal((await api('hr','PUT','/api/schedules/member',{...base,...bad})).status,400);
  assert.equal((await api('hr','PUT','/api/schedules/member',base)).status,200);const own=(await api('member','GET','/api/schedules')).data;assert.equal(own.schedules[0].start_time,'17:00');assert.equal(own.schedules[0].pending_change.start_time,'18:00');await db.prepare('DELETE FROM notifications').run();await check('2026-11-16T11:40:00.000Z');assert.equal((await notices('member')).results.filter(n=>n.title==='Scheduled clock-in missed').length,1);await db.prepare('DELETE FROM notifications').run();await check('2026-11-23T11:40:00.000Z');assert.equal((await notices('member')).results.filter(n=>n.title==='Scheduled clock-in missed').length,0);
 });
 await t.test('HR can add/remove a holiday with duplicate-date conflicts handled',async()=>{
  await reset();const r=await api('hr','POST','/api/holidays',{date:'2026-11-23',title:'Planning break'});assert.equal(r.status,201);assert.equal((await api('hr','POST','/api/holidays',{date:'2026-11-23',title:'Duplicate'})).status,409);assert.equal((await api('member','DELETE','/api/holidays/'+r.data.holiday.id)).status,403);assert.equal((await api('hr','DELETE','/api/holidays/'+r.data.holiday.id)).status,200);
 });
 await t.test('ten active members receive all36 missed/escalation notices within12 D1 statements',async()=>{
  await reset();for(let n=0;n<4;n++){const uid='bulk-'+n;await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,manager_id,joined_on,status,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(uid,uid,uid,'Bulk fixture '+n,'Member','employee','Marketing','lead','2026-11-01','active','h','s','2026-11-01T00:00:00.000Z').run();}
  const first=await api('founder','POST','/test-check',{at:'2026-11-16T12:00:00.000Z',measure:true});assert.equal(first.status,200,JSON.stringify(first));assert.equal(first.data.missing_clock_ins,10);assert.equal(first.data.schedule_notifications,36);assert.ok(first.data.prepare_calls<=12,JSON.stringify(first.data));
  const stored=await db.prepare('SELECT COUNT(*) total,COUNT(DISTINCT dedupe_key) unique_keys FROM notifications').first();assert.equal(stored.total,36);assert.equal(stored.unique_keys,36);
  const again=await api('founder','POST','/test-check',{at:'2026-11-16T12:05:00.000Z',measure:true});assert.equal(again.status,200);assert.equal(again.data.schedule_notifications,0);assert.ok(again.data.prepare_calls<=12,JSON.stringify(again.data));assert.equal((await db.prepare('SELECT COUNT(*) n FROM notifications').first()).n,36);
 });
}finally{await mf.dispose();}});
