import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const wrapper=`import {handleWorkflows,runAutomations} from './src/workflows.js';
export default {async fetch(request,env) {
const url=new URL(request.url);const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(request.headers.get('x-test-user')||'employee').first();
const helpers={json:(x,status=200)=>Response.json(x,{status}),fail:(status,message)=>{throw Object.assign(new Error(message),{status});},audit:async()=>{},notify:async()=>{}};
try {if(url.pathname==='/test-automation')return Response.json(await runAutomations(env));const response=await handleWorkflows({request,url,env,user,body:request.method==='GET'?{}:await request.json(),helpers});return response||new Response('missing',{status:404});} catch(error){return Response.json({error:error.message},{status:error.status||500});}
}};`;
const compiled=await build({stdin:{contents:wrapper,resolveDir:process.cwd(),sourcefile:'workflow-test-entry.js'},bundle:true,format:'esm',write:false,platform:'browser'});
const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'workflow-tests'}});
const db=await mf.getD1Database('DB');
for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql']){
 const sql=await readFile(file,'utf8');
 for(const part of sql.split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(part).run();
}
const now=new Date().toISOString();
const people=[['founder','Founder','founder','Leadership',null],['founder2','Founder 2','founder','Leadership',null],['hr','HR Lead','hr_lead','HR','founder'],['hr2','HR Member','hr_member','HR','hr'],['lead','Marketing Lead','team_lead','Marketing','founder'],['employee','Employee','employee','Marketing','lead'],['employee2','Employee 2','employee','Marketing','lead'],['finance','Finance','finance_head','Finance','founder']];
for(const [id,name,role,department,manager] of people)await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,manager_id,joined_on,password_hash,password_salt,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,id,id,name,role,role,department,manager,'2026-11-14','h','s',now,id==='finance'?'on_leave':'active').run();
const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const futureDay=new Date(Date.parse(`${localDay}T00:00:00Z`)+7*86400000).toISOString().slice(0,10);
const farDay=new Date(Date.parse(`${localDay}T00:00:00Z`)+14*86400000).toISOString().slice(0,10);
async function api(id,method,path,body={}){const response=await mf.dispatchFetch(`https://tel.test${path}`,{method,headers:{'x-test-user':id,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});const data=await response.json();return {status:response.status,data};}
async function ok(id,method,path,body={}){const result=await api(id,method,path,body);assert.ok(result.status<300,JSON.stringify(result));return result.data;}
async function denied(id,method,path,body,code){const result=await api(id,method,path,body);assert.equal(result.status,code,JSON.stringify(result));}
let taskId,leaveId;

test('TEL workflow integration in the Workers runtime',async t=>{
 try{
 await t.test('department leads assign formal deliverables; staff cannot allocate work',async()=>{
  await denied('employee','POST','/api/tasks',{title:'Unauthorised'},403);
  const {task}=await ok('lead','POST','/api/tasks',{title:'Launch assets',assignee_id:'employee',priority:'high',deadline:futureDay,expected_deliverable:'A checked preview'});taskId=task.id;assert.equal(task.status,'todo');
  await denied('lead','POST','/api/tasks',{title:'Self review',assignee_id:'lead',priority:'high',deadline:futureDay,expected_deliverable:'Work'},400);
  assert.equal((await ok('employee2','GET','/api/tasks')).tasks.length,0);
 });
 await t.test('only the assignee starts/submits; review and revision are explicit',async()=>{
  await denied('employee2','PATCH',`/api/tasks/${taskId}`,{action:'start'},403);
  await ok('employee','PATCH',`/api/tasks/${taskId}`,{action:'start'});
  await denied('employee','PATCH',`/api/tasks/${taskId}`,{action:'submit',submission:''},400);
  await denied('employee','PATCH',`/api/tasks/${taskId}`,{action:'complete'},409);
  await ok('employee','PATCH',`/api/tasks/${taskId}`,{action:'submit',submission:'https://example.com/work'});
  await denied('employee','PATCH',`/api/tasks/${taskId}`,{action:'approve'},403);
  await ok('lead','PATCH',`/api/tasks/${taskId}`,{action:'revision',feedback:'Add accessibility labels'});
  await ok('employee','PATCH',`/api/tasks/${taskId}`,{action:'submit',submission:'https://example.com/revised'});
  await ok('lead','PATCH',`/api/tasks/${taskId}`,{action:'approve'});
  assert.equal((await ok('employee','PATCH',`/api/tasks/${taskId}`,{action:'complete'})).task.status,'done');
 });
 await t.test('demoted reporting leads lose review authority',async()=>{
  const {task}=await ok('lead','POST','/api/tasks',{title:'Role boundary',assignee_id:'employee',deadline:futureDay,expected_deliverable:'Report'});
  await ok('employee','PATCH',`/api/tasks/${task.id}`,{action:'submit',submission:'Report'});
  await db.prepare("UPDATE users SET role='employee' WHERE id='lead'").run();
  await denied('lead','PATCH',`/api/tasks/${task.id}`,{action:'approve'},403);
  await db.prepare("UPDATE users SET role='team_lead' WHERE id='lead'").run();
 });
 await t.test('leave requires separate lead recommendation and HR verification',async()=>{
  const {leave}=await ok('employee','POST','/api/leaves',{type:'medical',start_date:futureDay,end_date:futureDay,reason:'PRIVATE REASON',handover_to:'employee2',handover_notes:'Launch monitoring'});leaveId=leave.id;
  await denied('employee','PATCH',`/api/leaves/${leaveId}`,{action:'recommend'},403);
  await denied('hr','PATCH',`/api/leaves/${leaveId}`,{action:'approve'},409);
  await ok('lead','PATCH',`/api/leaves/${leaveId}`,{action:'recommend',note:'Coverage arranged'});
  await denied('lead','PATCH',`/api/leaves/${leaveId}`,{action:'approve'},403);
  await ok('hr','PATCH',`/api/leaves/${leaveId}`,{action:'approve',note:'Verified'});
  await denied('employee','POST','/api/leaves',{type:'personal',start_date:futureDay,end_date:futureDay,reason:'overlap'},409);
 });
 await t.test('calendar shares coverage while withholding private leave category/reason',async()=>{
  const {calendar}=await ok('employee2','GET','/api/calendar');assert.equal(calendar.handovers.length,1);assert.ok(!JSON.stringify(calendar).includes('PRIVATE REASON'));assert.equal(calendar.leaves[0].type,'leave');assert.equal(calendar.on_leave[0].id,'finance');
  assert.equal((await ok('hr','GET','/api/calendar')).calendar.leaves[0].type,'medical');
 });
 await t.test('neither requester nor recommending founder may finalise HR leave',async()=>{
  const {leave}=await ok('hr','POST','/api/leaves',{type:'academic',start_date:farDay,end_date:farDay,reason:'Exam'});
  await ok('founder','PATCH',`/api/leaves/${leave.id}`,{action:'recommend',note:'Cover ready'});
  await denied('founder','PATCH',`/api/leaves/${leave.id}`,{action:'approve'},403);
  await denied('hr','PATCH',`/api/leaves/${leave.id}`,{action:'approve'},403);
  await ok('hr2','PATCH',`/api/leaves/${leave.id}`,{action:'approve',note:'Verified'});
 });
 await t.test('current approved leave prevents new assignment and attendance',async()=>{
  const {leave}=await ok('employee2','POST','/api/leaves',{type:'academic',start_date:localDay,end_date:localDay,reason:'Exam today'});
  await ok('lead','PATCH',`/api/leaves/${leave.id}`,{action:'recommend'});
  await ok('hr','PATCH',`/api/leaves/${leave.id}`,{action:'approve'});
  await denied('lead','POST','/api/tasks',{title:'During leave',assignee_id:'employee2',deadline:futureDay,expected_deliverable:'Work'},409);
  await denied('employee2','POST','/api/attendance',{action:'clock_in'},409);
  await denied('finance','POST','/api/attendance',{action:'clock_in'},409);
 });
 await t.test('attendance is a guarded clock, pause, resume and out state machine',async()=>{
  const {session}=await ok('employee','POST','/api/attendance',{action:'clock_in'});
  await denied('employee','POST','/api/attendance',{action:'clock_in'},409);
  await db.prepare('UPDATE attendance_sessions SET active_started_at=? WHERE id=?').bind(new Date(Date.now()-60000).toISOString(),session.id).run();
  assert.ok((await ok('employee','POST','/api/attendance',{action:'pause'})).session.active_seconds>=59);
  await denied('employee','POST','/api/attendance',{action:'pause'},409);
  await ok('employee','POST','/api/attendance',{action:'resume'});
  assert.equal((await ok('employee','POST','/api/attendance',{action:'clock_out'})).session.state,'closed');
 });
 await t.test('sessions crossing local midnight split time into the correct dates',async()=>{
  const yesterday=new Date(Date.parse(`${localDay}T00:00:00Z`)-86400000).toISOString().slice(0,10);
  const start=new Date(`${yesterday}T23:30:00+05:30`).toISOString();
  await db.prepare("INSERT INTO attendance_sessions (id,user_id,work_date,clock_in,state,active_started_at,updated_at) VALUES ('overnight','employee',?,?,'working',?,?)").bind(yesterday,start,start,start).run();
  const result=await ok('employee','GET','/api/attendance');const previous=result.attendance.find(a=>a.id==='overnight');assert.equal(previous.active_seconds,1800);assert.equal(previous.state,'closed');assert.equal(result.current.work_date,localDay);
  await ok('employee','POST','/api/attendance',{action:'clock_out'});
 });
 await t.test('HR correction replaces dated totals and cannot be self-reviewed',async()=>{
  const {correction}=await ok('employee','POST','/api/corrections',{work_date:localDay,requested_seconds:3600,reason:'Clock interrupted'});
  await denied('employee','PATCH',`/api/corrections/${correction.id}`,{action:'approve',review_note:'Self'},403);
  await ok('hr','PATCH',`/api/corrections/${correction.id}`,{action:'approve',review_note:'Verified record'});
  const {attendance}=await ok('employee','GET','/api/attendance');assert.equal(attendance.filter(a=>a.work_date===localDay).reduce((a,b)=>a+b.active_seconds,0),3600);assert.ok(attendance.every(a=>a.user_id==='employee'));
  await denied('hr2','PATCH',`/api/corrections/${correction.id}`,{action:'approve',review_note:'Again'},409);
 });
 await t.test('concurrent clock-in requests create only one open session',async()=>{
  const results=await Promise.all([api('employee','POST','/api/attendance',{action:'clock_in'}),api('employee','POST','/api/attendance',{action:'clock_in'})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const open=await db.prepare("SELECT COUNT(*) count FROM attendance_sessions WHERE user_id='employee' AND clock_out IS NULL").first();assert.equal(open.count,1);await ok('employee','POST','/api/attendance',{action:'clock_out'});
 });
 await t.test('scheduled reminders are idempotent and include upcoming meeting participants',async()=>{
  await db.prepare("INSERT INTO meetings(id,title,purpose,starts_at,participants_json,created_by,created_at,updated_at) VALUES('meeting','Weekly check-in','Coordinate',?,'[\"employee\",\"lead\"]','founder',?,?)").bind(new Date(Date.now()+3600000).toISOString(),now,now).run();
  await ok('founder','GET','/test-automation');await ok('founder','GET','/test-automation');
  const reminders=await db.prepare("SELECT user_id FROM notifications WHERE dedupe_key LIKE 'meeting:meeting:%'").all();assert.equal(reminders.results.length,3);
  const note=await ok('employee','GET','/api/notifications');assert.equal(note.unread,1);await ok('employee','POST','/api/notifications/read',{});assert.equal((await ok('employee','GET','/api/notifications')).unread,0);
 });
 }finally{await mf.dispose();}
});
