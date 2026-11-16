import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,Log,LogLevel} from 'miniflare';
import {queueUrgentTaskEmail,queueTaskTransferEmails,queueOperationalMeeting,runOperationalEmails} from '../src/operational-emails.js';
import {handleWorkflows} from '../src/workflows.js';

// D1 executes the real persistence, guards, claims and rate gate. Fetch never reaches Resend.
const CUTOVER='2026-11-15T00:00:00.000Z',NOW='2026-11-16T06:30:00.000Z';
const originalFetch=globalThis.fetch;
let runtime,db,env,requests=[],providerMode='accepted';
const people=[['member','employee','Test'],['target','employee','Test'],['reviewer','team_lead','Test'],['founder','founder','Leadership'],['hrlead','hr_lead','Test'],['finance','finance_head','Test'],['hrmember','hr_member','Test'],['other','employee','Elsewhere'],['inactive','employee','Test']];
before(async()=>{
 runtime=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated urgent email fixture")}}',compatibilityDate:'2026-07-30',d1Databases:{DB:'urgent-email-tests'},log:new Log(LogLevel.NONE)});
 db=await runtime.getD1Database('DB');
 for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-extensions.sql','schema-schedules.sql','schema-task-transfers.sql','schema-operational-email.sql','schema-urgent-email.sql','schema-flexible-work.sql','schema-hr-records.sql','schema-deadline-policy.sql','schema-announcements.sql','schema-grievance-access.sql'])await db.exec((await readFile(file,'utf8')).replace(/^\s*--.*$/gm,'').replaceAll('\n',' '));
 for(const [person,role,department] of people)await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,joined_on,password_hash,password_salt,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(person,person,person,person+' fixture',role,role,department,'2026-01-01','fixture','fixture',person==='inactive'?'suspended':'active',CUTOVER).run();
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.origin,'https://api.resend.com','No test may call a real external service');assert.equal(url.pathname,'/emails');assert.equal(options.method,'POST');
  requests.push({body:JSON.parse(options.body),headers:new Headers(options.headers),at:Date.now()});
  if(providerMode==='429')return Response.json({message:'private provider failure'},{status:429,headers:{'Retry-After':'60'}});
  if(providerMode==='throws')throw Error('private provider failure');
  if(providerMode==='unconfirmed')return Response.json({accepted:true});
  if(providerMode==='rejected')return Response.json({message:'private provider failure'},{status:500});
  return Response.json({id:'urgent-fixture-'+requests.length});
 };
});
after(async()=>{globalThis.fetch=originalFetch;if(runtime)await runtime.dispose();});
beforeEach(async()=>{
 await db.exec("DELETE FROM urgent_task_email_jobs;DELETE FROM operational_email_jobs;DELETE FROM notifications;DELETE FROM task_handover_requests;DELETE FROM task_events;DELETE FROM tasks;DELETE FROM meetings;DELETE FROM leave_requests;DELETE FROM member_connections;UPDATE users SET status='active';UPDATE users SET status='suspended' WHERE id='inactive';UPDATE operational_email_delivery_gate SET lease_token='',lease_expires_at=0,next_send_at=0;");
 await setting('operational_email_enabled_at',CUTOVER);await setting('operational_email_daily_start_date','2026-11-16');await setting('urgent_task_email_enabled_at',CUTOVER);
 env={DB:db,TEL_OS_OPERATIONAL_EMAILS:'enabled',RESEND_API_KEY:'isolated-urgent-provider-key',TEL_OS_WORK_SENDER_EMAIL:'notifications@techforeasylife.in',TEL_OS_SENDER_EMAIL:'otp@techforeasylife.in'};
 requests=[];providerMode='accepted';
});
async function setting(key,value){await db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value).run();}
async function connection(person='member',status='verified',account=person+'@example.test',provider='gmail'){
 await db.prepare('INSERT INTO member_connections(user_id,provider,account,status,verified_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET account=excluded.account,status=excluded.status,verified_at=excluded.verified_at,updated_at=excluded.updated_at').bind(person,provider,account,status,status==='verified'?CUTOVER:null,NOW).run();
}
async function task(taskId='task',assignee='member',extra={}){
 await db.prepare('INSERT INTO tasks(id,title,description,assignee_id,leader_id,department,priority,deadline,expected_deliverable,status,submission,feedback,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(taskId,extra.title||'Urgent launch assignment','Private project description',assignee,'reviewer','Test',extra.priority||'urgent','2026-11-17','Private deliverable requirements',extra.status||'todo','Private submission','Private feedback','reviewer',extra.created_at||NOW,NOW).run();
}
async function jobs(){return (await db.prepare('SELECT * FROM urgent_task_email_jobs ORDER BY event_key').all()).results;}
async function run(options={}){return runOperationalEmails(env,{now:NOW,deliveryOnly:true,types:['urgent_task_assigned'],...options});}
async function queued(taskId='task'){await task(taskId);return queueUrgentTaskEmail(env,taskId,{now:NOW});}
async function transfer(requestId='transfer',status='approved'){
 await db.prepare('INSERT INTO task_handover_requests(id,task_id,from_user_id,to_user_id,reviewer_id,requested_by,status,reason,decision_note,created_at,updated_at,decided_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(requestId,'task','member','target','reviewer','member',status,'Private transfer reason','Private transfer decision',NOW,NOW,status==='approved'?NOW:null).run();
}
function wrapAfterClaim(change){let changed=false;return {batch:statements=>db.batch(statements),prepare(sql){const wrap=statement=>new Proxy(statement,{get(target,key){if(key==='bind')return(...args)=>wrap(target.bind(...args));if(key==='run')return async()=>{const result=await target.run();if(!changed&&/UPDATE urgent_task_email_jobs SET status='sending'/.test(sql)&&result.meta?.changes){changed=true;await change();}return result;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});return wrap(db.prepare(sql));}};}

test('urgent initial assignments persist before delivery, deduplicate and exclude normal/high work',async()=>{
 await connection();await task();await task('normal','member',{priority:'normal'});await task('high','member',{priority:'high'});
 await Promise.all([queueUrgentTaskEmail(env,'task',{now:NOW}),queueUrgentTaskEmail(env,'task',{now:NOW}),queueUrgentTaskEmail(env,'normal',{now:NOW}),queueUrgentTaskEmail(env,'high',{now:NOW})]);
 assert.equal((await jobs()).length,1);assert.equal(requests.length,0,'Queueing must not send inside the request');
 await run();assert.equal(requests.length,1);assert.match(requests[0].body.subject,/URGENT task assigned/);assert.deepEqual(requests[0].body.to,['member@example.test']);
 assert.equal(requests[0].body.from,'TEL Operations <notifications@techforeasylife.in>');assert.equal(env.TEL_OS_SENDER_EMAIL,'otp@techforeasylife.in');
 const [job]=await jobs();assert.equal(job.status,'sent');assert.ok(job.provider_id);assert.ok(job.sent_at);await run();assert.equal(requests.length,1);
});
test('urgent cutover is separate, required and never replays old assignments',async()=>{
 await connection();await task('old','member',{created_at:'2026-11-14T23:59:59.999Z'});await task('fresh');
 await setting('urgent_task_email_enabled_at','');assert.equal((await queueUrgentTaskEmail(env,'fresh',{now:NOW})).queued,0);
 await setting('urgent_task_email_enabled_at','2026-11-17T00:00:00.000Z');assert.equal((await queueUrgentTaskEmail(env,'fresh',{now:NOW})).queued,0);
 await setting('urgent_task_email_enabled_at',CUTOVER);assert.equal((await queueUrgentTaskEmail(env,'old',{now:NOW})).queued,0);await run({deliveryOnly:false});
 assert.deepEqual((await jobs()).map(job=>job.entity_id),['fresh']);assert.equal(requests.length,1);
});
test('cron recovers a missing urgent outbox row exactly once without queuing nonurgent or completed work',async()=>{
 await connection();await task();await task('normal','member',{priority:'normal'});await task('done','member',{status:'done'});
 await run({deliveryOnly:false});assert.equal(requests.length,1);assert.equal((await jobs()).length,1);await run({deliveryOnly:false});assert.equal(requests.length,1);
});
test('only current explicitly verified gmail-provider connections can receive urgent mail on any domain',async()=>{
 await connection('member','pending');await connection('target','disconnected');await connection('other','verified','other@example.test','outlook');
 for(const person of ['member','target','other','inactive']){await task('task-'+person,person);await queueUrgentTaskEmail(env,'task-'+person,{now:NOW});}
 await run();assert.equal(requests.length,0);assert.equal((await jobs()).some(job=>job.user_id==='inactive'),false);
 await connection('member','verified','member@different-company.example');await run();assert.equal(requests.length,1);assert.deepEqual(requests[0].body.to,['member@different-company.example']);
});
test('urgent delivery blocks duplicate verified addresses and resolves the current verified address at send time',async()=>{
 await connection('member','verified','shared@example.test');await connection('target','verified','SHARED@example.test');await queued();await run();assert.equal(requests.length,0);
 await connection('target','disconnected','shared@example.test');await connection('member','verified','current@different.example');await run();assert.equal(requests.length,1);assert.deepEqual(requests[0].body.to,['current@different.example']);assert.equal((await jobs())[0].recipient,'current@different.example');
});
test('invalid verification timestamps and suspended accounts cannot authorize urgent delivery',async()=>{
 await connection();await db.prepare("UPDATE member_connections SET verified_at='not-a-time' WHERE user_id='member'").run();await queued();await run();assert.equal(requests.length,0);
 await connection();await db.prepare("UPDATE users SET status='suspended' WHERE id='member'").run();await run();assert.equal(requests.length,0);
});
test('completed, reassigned and no-longer-urgent queued assignments are suppressed before sending',async()=>{
 await connection();for(const name of ['completed','transferred','priority'])await queued(name);
 await db.prepare("UPDATE tasks SET status='done' WHERE id='completed'").run();await db.prepare("UPDATE tasks SET assignee_id='target' WHERE id='transferred'").run();await db.prepare("UPDATE tasks SET priority='normal' WHERE id='priority'").run();
 await run();assert.equal(requests.length,0);assert.deepEqual((await jobs()).map(job=>job.status),['skipped','skipped','skipped']);
});
test('urgent ownership, priority and recipient verification are rechecked after the atomic send claim',async()=>{
 for(const [name,sql] of [['owner',"UPDATE tasks SET assignee_id='target' WHERE id=?"],['priority',"UPDATE tasks SET priority='high' WHERE id=?"],['verification',"UPDATE member_connections SET status='disconnected' WHERE user_id='member' AND ?<>''"]]){
  await connection();await queued(name);let changed=false;const wrapped=wrapAfterClaim(async()=>{changed=true;await db.prepare(sql).bind(name).run();});
  await runOperationalEmails({...env,DB:wrapped},{now:NOW,deliveryOnly:true,types:['urgent_task_assigned']});assert.equal(changed,true);assert.equal(requests.length,0);assert.equal((await jobs()).find(job=>job.entity_id===name).status,'skipped');
 }
});
test('urgent content includes safe assignment details and excludes private descriptions, deliverables and submission notes',async()=>{
 await connection();await task('task','member',{title:'<script>fixture()</script>\nInjected header: value'});await queueUrgentTaskEmail(env,'task',{now:NOW});await run();
 const payload=requests[0].body;assert.match(payload.text,/Priority: urgent/);assert.match(payload.text,/Deadline: 2026-11-17/);assert.match(payload.text,/#tasks/);assert.ok(payload.html.includes('&lt;script&gt;'));assert.ok(!payload.html.includes('<script>'));assert.ok(!payload.subject.includes('\n'));
 for(const privateText of ['Private project description','Private deliverable requirements','Private submission','Private feedback'])assert.ok(!JSON.stringify(payload).includes(privateText),privateText);
});
test('approved urgent transfer uses one urgent transfer email and no second assignment email',async()=>{
 await connection();await connection('target');await queued();await transfer();await db.prepare("UPDATE tasks SET assignee_id='target' WHERE id='task'").run();
 await queueTaskTransferEmails(env,'transfer','approved',{now:NOW});await queueUrgentTaskEmail(env,'task',{now:NOW});await run({deliveryOnly:false,types:['urgent_task_assigned','task_transfer_approved']});
 assert.equal(requests.length,1);assert.deepEqual(requests[0].body.to,['target@example.test']);assert.match(requests[0].body.subject,/URGENT task transfer approved/);assert.match(requests[0].body.text,/Priority: urgent/);
 assert.equal((await jobs()).filter(job=>job.user_id==='target').length,0);assert.equal((await jobs())[0].status,'skipped');
 const transfers=(await db.prepare("SELECT * FROM operational_email_jobs WHERE kind='task_transfer_approved'").all()).results;assert.equal(transfers.length,1);assert.equal(transfers[0].status,'sent');
 for(const privateText of ['Private transfer reason','Private transfer decision'])assert.ok(!JSON.stringify(requests[0].body).includes(privateText));
 await run({deliveryOnly:false,types:['urgent_task_assigned','task_transfer_approved']});assert.equal(requests.length,1);
});
test('concurrent urgent delivery atomically claims once and records a confirmed provider id',async()=>{
 await connection();await queued();const results=await Promise.all([run(),run(),run()]);assert.equal(requests.length,1);assert.equal(results.reduce((sum,result)=>sum+result.sent,0),1);assert.ok(requests[0].headers.get('Idempotency-Key'));assert.equal((await jobs())[0].status,'sent');
});
test('confirmed urgent 429 response backs off globally and retries with the same idempotency key',async()=>{
 await connection();await queued();providerMode='429';await run();assert.equal(requests.length,1);let job=(await jobs())[0];assert.equal(job.status,'queued');assert.ok(job.next_attempt_at>NOW);assert.equal(job.sent_at,null);assert.equal(job.provider_id,'');assert.ok(!job.error.includes('private provider failure'));const key=requests[0].headers.get('Idempotency-Key');
 await run();assert.equal(requests.length,1);assert.ok((await db.prepare('SELECT next_send_at FROM operational_email_delivery_gate WHERE singleton=1').first()).next_send_at>Date.now()+30000);
 providerMode='accepted';await db.prepare('UPDATE operational_email_delivery_gate SET next_send_at=0 WHERE singleton=1').run();await run({now:new Date(Date.parse(job.next_attempt_at)+1000).toISOString()});assert.equal(requests.length,2);assert.equal(requests[1].headers.get('Idempotency-Key'),key);job=(await jobs())[0];assert.equal(job.status,'sent');
});
test('uncertain, unconfirmed and rejected urgent outcomes require review and never automatically resend',async()=>{
 await connection();for(const mode of ['throws','unconfirmed','rejected']){await queued(mode);providerMode=mode;const previous=requests.length;await run();assert.equal(requests.length,previous+1);const job=(await jobs()).find(job=>job.entity_id===mode);assert.equal(job.status,'needs_review');assert.equal(job.provider_id,'');assert.equal(job.sent_at,null);assert.ok(!job.error.includes('private provider failure'));await run();assert.equal(requests.length,previous+1);}
});
test('stale urgent Sending claims become review-only without an automatic duplicate',async()=>{
 await connection();await queued();await db.prepare("UPDATE urgent_task_email_jobs SET status='sending',claimed_at='2026-11-16T06:20:00.000Z'").run();await run();assert.equal(requests.length,0);assert.equal((await jobs())[0].status,'needs_review');await run();assert.equal(requests.length,0);
});
test('urgent and meeting email share the same persisted one-per-second delivery gate',async()=>{
 await connection();await queued();const meeting={id:'meeting',title:'Fixture meeting',starts_at:'2026-11-16T08:30:00.000Z',participants_json:'["member"]',created_at:NOW};
 await db.prepare('INSERT INTO meetings(id,title,purpose,starts_at,call_url,participants_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(meeting.id,meeting.title,'Private purpose',meeting.starts_at,'https://meet.example.test',meeting.participants_json,'reviewer',NOW,NOW).run();await queueOperationalMeeting(env,meeting,'scheduled',{now:NOW});
 await run({types:['urgent_task_assigned','meeting_invitation']});assert.equal(requests.length,2);assert.ok(requests[1].at-requests[0].at>=950,`Provider starts were ${requests[1].at-requests[0].at}ms apart`);
});
test('only authorized task creators persist urgent assignment email before the successful response',async()=>{
 await setting('operational_email_enabled_at','2020-01-01T00:00:00.000Z');await setting('urgent_task_email_enabled_at','2020-01-01T00:00:00.000Z');
 const helpers={json:(data,status=200)=>Response.json(data,{status}),fail:(status,message)=>{throw Object.assign(Error(message),{status});},audit:async()=>{},notify:async()=>{}};
 const body={title:'New urgent task',description:'Private new task description',expected_deliverable:'Private deliverable',priority:'urgent',deadline:'2027-01-01',assignee_id:'member'};
 async function create(person,extra={}){return handleWorkflows({request:new Request('https://tel.test/api/tasks',{method:'POST'}),url:new URL('https://tel.test/api/tasks'),env,user:await db.prepare('SELECT * FROM users WHERE id=?').bind(person).first(),body:{...body,...extra},helpers});}
 for(const person of ['member','hrmember'])await assert.rejects(()=>create(person),error=>error.status===403);
 await assert.rejects(()=>create('reviewer',{assignee_id:'other'}),error=>error.status===403);assert.equal((await jobs()).length,0);
 for(const person of ['reviewer','hrlead','finance']){const response=await create(person);assert.equal(response.status,201);const {task}=await response.json();assert.ok((await jobs()).some(job=>job.entity_id===task.id&&job.user_id==='member'));}
 const crossDepartment=await create('founder',{assignee_id:'other'});assert.equal(crossDepartment.status,201);assert.equal((await jobs()).length,4);assert.equal(requests.length,0,'Task POST only queues; the worker schedules delivery after success');
 const normal=await create('reviewer',{priority:'normal'});assert.equal(normal.status,201);assert.equal((await jobs()).length,4);
});
