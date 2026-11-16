import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,Log,LogLevel} from 'miniflare';
import {runDeadlinePolicy,handleDeadlinePolicy,listDeadlineExtensions} from '../src/deadline-policy.js';
import {runOperationalEmails,queueUrgentTaskEmail} from '../src/operational-emails.js';

const CUTOVER='2026-11-15T00:00:00.000Z',GRANT='2026-11-15T18:30:00.000Z',MISSED='2026-11-16T18:30:00.000Z';
const originalFetch=globalThis.fetch;
let runtime,db,env,requests=[],providerMode='accepted';
const people=[['member','employee','Marketing'],['reviewer','team_lead','Marketing'],['marketinghead','team_lead','Marketing'],['replacement','employee','Marketing'],['hrlead','hr_lead','HR'],['hrmember','hr_member','HR'],['founder','founder','Leadership'],['other','employee','Finance'],['financehead','finance_head','Finance'],['inactive','employee','Marketing']];
before(async()=>{
 runtime=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated deadline policy fixture")}}',compatibilityDate:'2026-07-30',d1Databases:{DB:'deadline-policy-tests'},log:new Log(LogLevel.NONE)});
 db=await runtime.getD1Database('DB');
 for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-extensions.sql','schema-schedules.sql','schema-task-transfers.sql','schema-operational-email.sql','schema-urgent-email.sql','schema-deadline-policy.sql','schema-announcements.sql','schema-grievance-access.sql'])await db.exec((await readFile(file,'utf8')).replace(/^\s*--.*$/gm,'').replaceAll('\n',' '));
 for(const [person,role,department] of people)await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,joined_on,password_hash,password_salt,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(person,person,person,person+' fixture',role,role,department,'2026-01-01','fixture','fixture',person==='inactive'?'suspended':'active',CUTOVER).run();
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.origin,'https://api.resend.com','No test may contact an external provider');assert.equal(url.pathname,'/emails');
  requests.push({body:JSON.parse(options.body),headers:new Headers(options.headers),at:Date.now()});
  if(providerMode==='429')return Response.json({message:'private provider failure'},{status:429,headers:{'Retry-After':'60'}});
  if(providerMode==='throws')throw Error('private provider failure');
  if(providerMode==='unconfirmed')return Response.json({accepted:true});
  return Response.json({id:'deadline-fixture-'+requests.length});
 };
});
after(async()=>{globalThis.fetch=originalFetch;if(runtime)await runtime.dispose();});
beforeEach(async()=>{
 await db.exec("DROP TRIGGER IF EXISTS deadline_atomic_failure; DELETE FROM deadline_email_jobs; DELETE FROM deadline_extension_records; DELETE FROM urgent_task_email_jobs; DELETE FROM operational_email_jobs; DELETE FROM notifications; DELETE FROM task_handover_requests; DELETE FROM task_events; DELETE FROM tasks; DELETE FROM member_connections; UPDATE operational_email_delivery_gate SET lease_token='',lease_expires_at=0,next_send_at=0;");
 for(const [person,role,department] of people)await db.prepare('UPDATE users SET role=?,department=?,status=?,email=? WHERE id=?').bind(role,department,person==='inactive'?'suspended':'active',person+'@unverified-user-field.example',person).run();
 await setting('deadline_policy_enabled_at',CUTOVER);await setting('operational_email_enabled_at',CUTOVER);await setting('urgent_task_email_enabled_at',CUTOVER);
 env={DB:db,TEL_OS_OPERATIONAL_EMAILS:'enabled',RESEND_API_KEY:'isolated-deadline-provider-key',TEL_OS_WORK_SENDER_EMAIL:'notifications@techforeasylife.in'};
 requests=[];providerMode='accepted';
});
async function setting(key,value){await db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value).run();}
async function task(taskId='task',extra={}){
 await db.prepare('INSERT INTO tasks(id,title,description,assignee_id,leader_id,department,priority,deadline,expected_deliverable,status,submission,feedback,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(taskId,extra.title||'Launch assignment','Private project description',extra.assignee||'member',extra.leader||'reviewer',extra.department||'Marketing',extra.priority||'normal',extra.deadline||'2026-11-15','Private deliverable requirements',extra.status||'todo','Private submission','Private feedback','founder',CUTOVER,CUTOVER).run();
}
async function connection(person='member',extra={}){
 await db.prepare('INSERT INTO member_connections(user_id,provider,account,status,verified_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET account=excluded.account,status=excluded.status,verified_at=excluded.verified_at,updated_at=excluded.updated_at').bind(person,extra.provider||'gmail',extra.account||person+'@example.test',extra.status||'verified',extra.verified_at===undefined?CUTOVER:extra.verified_at,GRANT).run();
}
async function policy(now=GRANT,options={}){return runDeadlinePolicy(env,{now,...options});}
async function records(){return (await db.prepare('SELECT * FROM deadline_extension_records ORDER BY task_id').all()).results;}
async function jobs(){return (await db.prepare('SELECT * FROM deadline_email_jobs ORDER BY kind,user_id').all()).results;}
async function notices(){return (await db.prepare('SELECT * FROM notifications ORDER BY dedupe_key').all()).results;}
async function send(now=GRANT,options={}){return runOperationalEmails(env,{now,deliveryOnly:true,types:['deadline_grace_granted','deadline_grace_missed'],...options});}
async function grant(){await task();return policy();}
async function endpoint(person,path='/api/deadline-policy'){
 return handleDeadlinePolicy({request:new Request('https://tel.test'+path),url:new URL('https://tel.test'+path),env,user:await db.prepare('SELECT * FROM users WHERE id=?').bind(person).first()});
}
function wrapAfterClaim(change){let changed=false;return {batch:statements=>db.batch(statements),prepare(sql){const wrap=statement=>new Proxy(statement,{get(target,key){if(key==='bind')return(...args)=>wrap(target.bind(...args));if(key==='run')return async()=>{const result=await target.run();if(!changed&&/UPDATE deadline_email_jobs SET status='sending'/.test(sql)&&result.meta?.changes){changed=true;await change();}return result;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});return wrap(db.prepare(sql));}};}

test('the full original deadline includes its entire IST day, followed by exactly one calendar day',async()=>{
 await task();assert.equal((await policy('2026-11-15T18:29:59.999Z')).extended,0);
 const result=await policy();assert.equal(result.extended,1);assert.equal(requests.length,0);
 const [record]=await records();assert.equal(record.original_deadline,'2026-11-15');assert.equal(record.extended_deadline,'2026-11-16');assert.equal(record.extra_days,1);assert.equal(record.escalated_at,null);
 assert.equal((await db.prepare("SELECT deadline FROM tasks WHERE id='task'").first()).deadline,'2026-11-16');assert.equal((await jobs())[0].status,'blocked');
 assert.equal((await policy('2026-11-16T18:29:59.999Z')).escalated,0);assert.equal((await policy()).extended,0);
 assert.equal((await policy(MISSED)).escalated,1);assert.equal((await policy('2026-11-20T18:30:00.000Z')).extended,0);assert.equal((await records()).length,1);
 assert.equal((await db.prepare("SELECT deadline FROM tasks WHERE id='task'").first()).deadline,'2026-11-16');
});
test('calendar extension handles leap day and year boundaries',async()=>{
 await setting('deadline_policy_enabled_at','2024-01-01T00:00:00.000Z');await task('leap',{deadline:'2024-02-28'});await task('year',{deadline:'2024-12-31'});
 await policy('2024-02-28T18:30:00.000Z');assert.equal((await records())[0].extended_deadline,'2024-02-29');
 await policy('2024-12-31T18:30:00.000Z');assert.equal((await records()).find(record=>record.task_id==='year').extended_deadline,'2025-01-01');
});
test('activation is explicit and excludes work already overdue before the cutover',async()=>{
 await task('old',{deadline:'2026-11-14'});await task('current');await setting('deadline_policy_enabled_at','');assert.equal((await policy()).enabled,false);
 await setting('deadline_policy_enabled_at','2026-11-17T00:00:00.000Z');assert.equal((await policy()).enabled,false);
 await setting('deadline_policy_enabled_at',CUTOVER);await policy();assert.deepEqual((await records()).map(record=>record.task_id),['current']);
 await task('same-boundary',{deadline:'2026-11-16'});await setting('deadline_policy_enabled_at',MISSED);await policy(MISSED);assert.ok((await records()).some(record=>record.task_id==='same-boundary'));
});
test('only unfinished employee work is extended; review, approved, done and malformed dates are excluded',async()=>{
 for(const status of ['todo','working','revision','review','approved','done'])await task(status,{status});
 await task('invalid',{deadline:'2026-02-30'});await task('suspended',{assignee:'inactive'});await policy();
 assert.deepEqual((await records()).map(record=>record.task_id),['revision','todo','working']);
});
test('concurrent recovery commits one record, notification and outbox without extending twice',async()=>{
 await task();const result=await Promise.all([policy(),policy(),policy()]);assert.equal(result.reduce((sum,item)=>sum+item.extended,0),1);assert.equal((await records()).length,1);assert.equal((await jobs()).length,1);assert.equal((await notices()).length,1);
 await db.exec('DELETE FROM deadline_email_jobs;DELETE FROM notifications;');await policy();assert.equal((await records()).length,1);assert.equal((await jobs()).length,1);assert.equal((await notices()).length,1);
 await policy();assert.equal((await jobs()).length,1);assert.equal((await notices()).length,1);
});
test('an interrupted atomic grant rolls back deadline, record, notification and outbox together',async()=>{
 await task();await db.exec("CREATE TRIGGER deadline_atomic_failure BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'isolated atomic failure'); END;");
 await assert.rejects(()=>policy(),/isolated atomic failure/);assert.equal((await records()).length,0);assert.equal((await jobs()).length,0);assert.equal((await notices()).length,0);assert.equal((await db.prepare("SELECT deadline FROM tasks WHERE id='task'").first()).deadline,'2026-11-15');
 await db.exec('DROP TRIGGER deadline_atomic_failure;');assert.equal((await policy()).extended,1);
});
test('missing the extra day notifies the current assignee and reviewer, authorised HR and Marketing head, with founders in-app',async()=>{
 await grant();const result=await policy(MISSED);assert.equal(result.escalated,1);
 const missed=(await jobs()).filter(job=>job.kind==='deadline_grace_missed');assert.deepEqual(missed.map(job=>job.user_id).sort(),['hrlead','hrmember','marketinghead','member','reviewer']);assert.ok(missed.every(job=>job.status==='blocked'));
 const missedNotices=(await notices()).filter(item=>item.dedupe_key.startsWith('deadline_grace_missed:'));assert.deepEqual(missedNotices.map(item=>item.user_id).sort(),['founder','hrlead','hrmember','marketinghead','member','reviewer']);
 await policy(MISSED);assert.equal((await jobs()).length,6);assert.equal((await notices()).length,7);
 await db.prepare("DELETE FROM deadline_email_jobs WHERE kind='deadline_grace_missed' AND user_id='hrlead'").run();await policy(MISSED);assert.equal((await jobs()).length,6);
});
test('Finance tasks never disclose deadline records to the Marketing head',async()=>{
 await task('finance',{assignee:'other',leader:'financehead',department:'Finance'});await policy();await policy(MISSED);
 assert.deepEqual((await jobs()).filter(job=>job.kind==='deadline_grace_missed').map(job=>job.user_id).sort(),['financehead','hrlead','hrmember','other']);
 assert.equal((await listDeadlineExtensions(env,await db.prepare("SELECT * FROM users WHERE id='marketinghead'").first())).length,0);
 await assert.rejects(()=>endpoint('marketinghead','/api/tasks/finance/deadline-policy'),error=>error.status===403);
});
test('submission, approval, completion and changed deadlines suppress penalties and pending notices',async()=>{
 for(const status of ['review','approved','done']){
  const name='stage-'+status;await task(name);await policy();await db.prepare('UPDATE tasks SET status=? WHERE id=?').bind(status,name).run();
 }
 await task('rescheduled');await policy();await db.prepare("UPDATE tasks SET deadline='2026-11-20' WHERE id='rescheduled'").run();await connection();
 assert.equal((await policy(MISSED)).escalated,0);await send(MISSED);assert.equal(requests.length,0);assert.ok((await jobs()).every(job=>job.status==='skipped'));
});
test('current assignee, current reviewer and current Marketing role are resolved when escalation is queued',async()=>{
 await grant();await db.prepare("UPDATE tasks SET assignee_id='replacement',leader_id='founder' WHERE id='task'").run();await db.prepare("UPDATE users SET role='employee' WHERE id IN ('reviewer','marketinghead')").run();await policy(MISSED);
 assert.deepEqual((await jobs()).filter(job=>job.kind==='deadline_grace_missed').map(job=>job.user_id).sort(),['founder','hrlead','hrmember','replacement']);
 await connection('member');await send(MISSED);assert.equal(requests.length,0);assert.equal((await jobs()).find(job=>job.kind==='deadline_grace_granted').status,'skipped');
});
test('email delivery requires a unique current verified account and never uses the user email field',async()=>{
 await grant();await send();assert.equal(requests.length,0);
 await connection('member',{account:'shared@example.test'});await connection('replacement',{account:'SHARED@example.test'});await send();assert.equal(requests.length,0);
 await connection('replacement',{status:'disconnected'});await connection('member',{account:'current@another-company.example'});await send();assert.equal(requests.length,1);assert.deepEqual(requests[0].body.to,['current@another-company.example']);assert.equal((await jobs())[0].recipient,'current@another-company.example');
});
test('deadline email content contains original and extended dates but no private descriptions or notes',async()=>{
 await connection();await task('task',{title:'<script>fixture()</script>\nInjected header: value'});await policy();await send();
 const payload=requests[0].body;assert.match(payload.text,/Original deadline: 2026-11-15/);assert.match(payload.text,/Extended deadline: 2026-11-16/);assert.match(payload.text,/1 calendar day/);assert.match(payload.text,/Asia\/Kolkata/);assert.ok(payload.html.includes('&lt;script&gt;'));assert.ok(!payload.html.includes('<script>'));
 for(const value of ['Private project description','Private deliverable requirements','Private submission','Private feedback'])assert.ok(!JSON.stringify(payload).includes(value),value);
});
test('work stage and recipient verification are rechecked after the atomic email claim',async()=>{
 await connection();await grant();const wrapped=wrapAfterClaim(()=>db.prepare("UPDATE tasks SET status='review' WHERE id='task'").run());
 await runOperationalEmails({...env,DB:wrapped},{now:GRANT,deliveryOnly:true,types:['deadline_grace_granted']});assert.equal(requests.length,0);assert.equal((await jobs())[0].status,'skipped');
});
test('queued escalation rechecks HR and Marketing access immediately before sending',async()=>{
 await grant();await policy(MISSED);await connection('marketinghead');await connection('hrmember');
 await db.prepare("UPDATE users SET role='employee' WHERE id IN ('marketinghead','hrmember')").run();await send(MISSED);assert.equal(requests.length,0);
 for(const person of ['marketinghead','hrmember'])assert.equal((await jobs()).find(job=>job.kind==='deadline_grace_missed'&&job.user_id===person).status,'skipped');
});
test('a confirmed 429 backs off through the shared gate and preserves its idempotency key',async()=>{
 await connection();await grant();providerMode='429';await send();assert.equal(requests.length,1);let [job]=await jobs();assert.equal(job.status,'queued');assert.ok(job.next_attempt_at>GRANT);const key=requests[0].headers.get('Idempotency-Key');
 await send();assert.equal(requests.length,1);providerMode='accepted';await db.prepare('UPDATE operational_email_delivery_gate SET next_send_at=0 WHERE singleton=1').run();await send(new Date(Date.parse(job.next_attempt_at)+1000).toISOString());assert.equal(requests.length,2);assert.equal(requests[1].headers.get('Idempotency-Key'),key);assert.equal((await jobs())[0].status,'sent');
});
test('unconfirmed and interrupted sends become review-only and never automatically resend',async()=>{
 await connection();await grant();providerMode='unconfirmed';await send();assert.equal((await jobs())[0].status,'needs_review');await send();assert.equal(requests.length,1);
 await db.prepare("UPDATE deadline_email_jobs SET status='sending',claimed_at='2026-11-15T18:20:00.000Z'").run();await send();assert.equal((await jobs())[0].status,'needs_review');assert.equal(requests.length,1);
});
test('urgent and deadline emails use the same persisted one-per-second gate',async()=>{
 await connection();await task('task',{priority:'urgent'});await policy();await queueUrgentTaskEmail(env,'task',{now:GRANT});await send(GRANT,{types:['urgent_task_assigned','deadline_grace_granted']});assert.equal(requests.length,2);assert.ok(requests[1].at-requests[0].at>=950);
});
test('read-only records are scoped to current participants, HR, founders and escalated Marketing oversight',async()=>{
 await grant();assert.equal((await (await endpoint('member')).json()).extensions.length,1);assert.equal((await (await endpoint('hrmember')).json()).extensions.length,1);assert.equal((await (await endpoint('other')).json()).extensions.length,0);assert.equal((await (await endpoint('marketinghead')).json()).extensions.length,0);
 await db.prepare("UPDATE users SET role='employee' WHERE id='reviewer'").run();assert.equal((await (await endpoint('reviewer')).json()).extensions.length,0);await assert.rejects(()=>endpoint('reviewer','/api/tasks/task/deadline-policy'),error=>error.status===403);
 await assert.rejects(()=>endpoint('other','/api/tasks/task/deadline-policy'),error=>error.status===403);await policy(MISSED);assert.equal((await (await endpoint('marketinghead')).json()).extensions.length,1);
 const payload=JSON.stringify(await (await endpoint('founder')).json());for(const value of ['Private project description','Private submission','Private feedback','Private deliverable requirements'])assert.ok(!payload.includes(value));
});
