import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

const wrapper=`import {handleHRRecords} from './src/hr-records.js';import {queuePendingWorkDeliveries} from './src/work-deliveries.js';export default {async fetch(request,env){try{const url=new URL(request.url),body=request.method==='GET'?{}:await request.json(),user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(request.headers.get('x-test-user')||'member').first();if(url.pathname==='/test-delivery-queue')return Response.json(await queuePendingWorkDeliveries(env));return await handleHRRecords({request,url,env,user,body})||new Response('missing',{status:404});}catch(e){return Response.json({error:e.message},{status:e.status||500});}}};`;
const compiled=await build({stdin:{contents:wrapper,resolveDir:process.cwd(),sourcefile:'hr-records-test.js'},bundle:true,format:'esm',write:false,platform:'browser'});
const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'hr-records-tests'}}),db=await mf.getD1Database('DB');
for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-extensions.sql','schema-hr-records.sql'])await db.exec((await readFile(file,'utf8')).replaceAll('\n',' '));
const stamp=new Date().toISOString(),past=new Date(Date.now()-3600000).toISOString(),future=new Date(Date.now()+86400000).toISOString(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const people=[['founder','founder','Leadership',null],['hr','hr_lead','HR','founder'],['hrmember','hr_member','HR','hr'],['lead','team_lead','Marketing','founder'],['otherlead','team_lead','Marketing','founder'],['member','employee','Marketing','lead'],['peer','employee','Marketing','lead'],['finance','finance_head','Finance','founder'],['outsider','employee','Finance','finance']];
for(const [id,role,department,manager]of people)await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,manager_id,joined_on,status,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(id,id,id,'Fixture '+id,role,role,department,manager,'2026-11-01','active','h','s','2026-11-01T00:00:00.000Z').run();
async function meeting(id,creator='lead',department='Marketing',participants=['lead','member','peer','otherlead'],starts=past){await db.prepare('INSERT INTO meetings(id,title,purpose,starts_at,participants_json,decisions,follow_ups,department,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,'Fixture meeting '+id,'PRIVATE_MEETING_PURPOSE',starts,JSON.stringify(participants),'PRIVATE_DECISIONS','PRIVATE_FOLLOWUPS',department,creator,stamp,stamp).run();}
await meeting('own');await meeting('others','otherlead');await meeting('foreign','lead','Finance',['lead','finance','outsider']);await meeting('missing-lead','lead','Marketing',['member','peer']);await meeting('future','lead','Marketing',['lead','member'],future);await meeting('employee-owned','member','Marketing',['member','peer']);
async function api(user,method,path,body={}){const r=await mf.dispatchFetch('https://tel.test'+path,{method,headers:{'Content-Type':'application/json','x-test-user':user},...(method==='GET'?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};}
const mark=(user,meetingId,body)=>api(user,'PUT','/api/meetings/'+meetingId+'/attendance',body);
async function reset(){await db.prepare('DELETE FROM meeting_attendance_history').run();await db.prepare('DELETE FROM meeting_attendance').run();await db.prepare('DELETE FROM notifications').run();await db.prepare('DELETE FROM audit_events').run();}

test('HR control panel and manual meeting records enforce privacy in actual D1',async t=>{try{
 await t.test('only an owning, participating department lead or HR/founder can record attendance',async()=>{
  await reset();
  for(const [user,meetingId] of [['member','own'],['otherlead','own'],['lead','others'],['lead','foreign'],['lead','missing-lead'],['member','employee-owned']])assert.equal((await mark(user,meetingId,{user_id:'member',status:'present'})).status,403,user+' '+meetingId);
  const own=await mark('lead','own',{user_id:'member',status:'present',recorded_by:'founder',recorded_at:'1900-01-01'});assert.equal(own.status,200,JSON.stringify(own));assert.equal(own.data.participants.find(p=>p.user_id==='member').recorded_by,'lead');
  assert.equal((await mark('hrmember','foreign',{user_id:'outsider',status:'excused'})).status,200);
  assert.equal((await mark('founder','employee-owned',{user_id:'peer',status:'absent'})).status,200);
 });
 await t.test('participant roster membership cannot be forged and invalid batches write nothing',async()=>{
  await reset();
  for(const entries of [[{user_id:'member',status:'present'},{user_id:'outsider',status:'present'}],[{user_id:'member',status:'present'},{user_id:'member',status:'absent'}],[{user_id:'member',status:'joined'}]])assert.equal((await mark('lead','own',{entries})).status,400);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM meeting_attendance').first()).n,0);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM meeting_attendance_history').first()).n,0);
  assert.equal((await mark('hr','future',{user_id:'member',status:'present'})).status,409);
 });
 await t.test('department leads cannot mark cross-department invited participants',async()=>{
  await meeting('mixed','lead','Marketing',['lead','member','outsider']);assert.equal((await mark('lead','mixed',{user_id:'outsider',status:'present'})).status,403);assert.equal((await mark('hr','mixed',{user_id:'outsider',status:'present'})).status,200);
 });
 await t.test('rosters are limited to participants, organisers and HR; participant reads have no correction audit',async()=>{
  await reset();await mark('lead','own',{user_id:'member',status:'present'});
  assert.equal((await api('outsider','GET','/api/meetings/own/attendance')).status,403);
  const read=await api('member','GET','/api/meetings/own/attendance');assert.equal(read.status,200);assert.equal(read.data.can_record,false);assert.deepEqual(read.data.history,[]);assert.ok(read.data.participants.every(p=>!p.can_record));
  assert.equal((await api('hrmember','GET','/api/meetings/foreign/attendance')).status,200);
 });
 await t.test('corrections retain previous status and actor while identical saves deduplicate HR reports',async()=>{
  await reset();let saved=await api('lead','POST','/api/meetings/own/attendance',{entries:[{user_id:'member',status:'present'},{user_id:'peer',status:'excused'}]});assert.equal(saved.status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM notifications').first()).n,2);assert.equal((await db.prepare('SELECT COUNT(*) n FROM meeting_attendance_history').first()).n,2);
  saved=await mark('lead','own',{entries:[{user_id:'member',status:'present'},{user_id:'peer',status:'excused'}]});assert.equal(saved.data.unchanged,true);assert.equal((await db.prepare('SELECT COUNT(*) n FROM notifications').first()).n,2);
  await mark('hr','own',{user_id:'member',status:'absent'});
  const history=(await db.prepare("SELECT previous_status,status,recorded_by,revision FROM meeting_attendance_history WHERE user_id='member' ORDER BY id").all()).results;
  assert.deepEqual(history,[{previous_status:null,status:'present',recorded_by:'lead',revision:1},{previous_status:'present',status:'absent',recorded_by:'hr',revision:2}]);
  const notificationRows=(await db.prepare('SELECT user_id,link,body,dedupe_key FROM notifications').all()).results;assert.equal(notificationRows.length,4);assert.ok(notificationRows.every(n=>['hr','hrmember'].includes(n.user_id)&&n.link==='hr-records'));assert.equal(new Set(notificationRows.map(n=>n.dedupe_key)).size,4);
  assert.equal((await api('founder','GET','/test-delivery-queue')).data.inserted,0);assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_notification_deliveries').first()).n,0);assert.deepEqual(JSON.parse((await db.prepare("SELECT attended_json FROM meetings WHERE id='own'").first()).attended_json),[]);
 });
 await t.test('private HR summary excludes sensitive meeting, leave, task and grievance content and IDs',async()=>{
  await reset();await mark('lead','own',{user_id:'member',status:'present'});
  await db.prepare("INSERT INTO grievances(id,user_id,title,body,founder_only,status,created_at,updated_at) VALUES('PRIVATE_GRIEVANCE_ID','member','PRIVATE_GRIEVANCE_TITLE','PRIVATE_GRIEVANCE_BODY',1,'open',?,?)").bind(stamp,stamp).run();
  await db.prepare("INSERT INTO tasks(id,title,description,assignee_id,leader_id,department,priority,deadline,expected_deliverable,status,submission,feedback,created_by,created_at,updated_at) VALUES('task','Fixture task','PRIVATE_TASK_DESCRIPTION','member','lead','Marketing','normal',?,'PRIVATE_DELIVERABLE','working','PRIVATE_SUBMISSION','PRIVATE_FEEDBACK','lead',?,?)").bind(today,stamp,stamp).run();
  await db.prepare("INSERT INTO attendance_sessions(id,user_id,work_date,clock_in,clock_out,state,active_seconds,source,updated_at) VALUES('work','member',?,? ,?,'closed',900,'clock',?)").bind(today,past,stamp,stamp).run();
  await db.prepare("INSERT INTO leave_requests(id,user_id,type,start_date,end_date,reason,status,created_at,updated_at) VALUES('PRIVATE_LEAVE_ID','peer','personal',?,?,'PRIVATE_LEAVE_REASON','approved',?,?)").bind(today,today,stamp,stamp).run();
  await db.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES('fixture-session','member',?,?)").bind(stamp,future).run();
  for(const role of ['member','lead','finance'])assert.equal((await api(role,'GET','/api/hr-records')).status,403);
  for(const role of ['hr','hrmember','founder']){
   const result=await api(role,'GET','/api/hr-records?date='+today+'&user_id=member');assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.meeting_attendance.records.length,1);assert.equal(result.data.task_deadlines.records.length,1);assert.equal(result.data.work_presence.records[0].active_seconds,900);assert.equal(result.data.people.find(p=>p.id==='member').login_status,'online');assert.equal(result.data.people.find(p=>p.id==='peer').work_status,'on_leave');assert.equal(result.data.deadline_extensions.available,false);assert.ok(!JSON.stringify(result.data).includes('PRIVATE_'));
  }
  assert.equal((await api('hr','GET','/api/hr-records?date=2026-02-31')).status,400);assert.equal((await api('hr','GET','/api/hr-records?from=2026-11-20&to=2026-11-01')).status,400);assert.equal((await api('hr','GET','/api/hr-records?from=2020-01-01&to=2026-01-01')).status,400);
  assert.equal((await api('hr','GET','/api/hr-records?date='+today+'&user_id=outsider')).data.meeting_attendance.records.length,0);
 });
 await t.test('HR records includes optional safe deadline extension records with person filters',async()=>{
  await db.exec('CREATE TABLE deadline_extension_records(id TEXT PRIMARY KEY,task_id TEXT,assignee_id TEXT,leader_id TEXT,original_deadline TEXT,extended_deadline TEXT,extra_days INTEGER,created_at TEXT,escalated_at TEXT);');
  await db.prepare("INSERT INTO deadline_extension_records VALUES('extension','task','member','lead',?,?,1,?,NULL)").bind(today,today,stamp).run();
  const result=await api('hrmember','GET','/api/hr-records?date='+today+'&user_id=member');assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.deadline_extensions.available,true);assert.equal(result.data.deadline_extensions.records[0].original_deadline,today);assert.equal(result.data.deadline_extensions.records[0].name,'Fixture member');assert.ok(!JSON.stringify(result.data).includes('PRIVATE_'));
  assert.equal((await api('founder','GET','/api/hr-records?date='+today+'&user_id=peer')).data.deadline_extensions.records.length,0);
 });
}finally{await mf.dispose();}});
