import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,Log,LogLevel} from 'miniflare';
import {queueMeetingDeliveries} from '../src/deliveries.js';
import {queueOperationalMeeting,queueTaskTransferEmails,runOperationalEmails,getOperationalEmailStatus,verifyOperationalEmailDomain} from '../src/operational-emails.js';

// Actual D1 executes every queue/claim/guard. Only the external email provider is mocked.
const NOW='2026-11-16T03:30:00.000Z',CUTOVER='2026-11-15T00:00:00.000Z';
const FUTURE='2026-11-16T05:30:00.000Z',REMINDER='2026-11-16T04:30:00.000Z';
const originalFetch=globalThis.fetch;
let runtime,db,env,requests=[],providerMode='accepted',providerDelay=0;
const people=['member','target','reviewer','stranger','leave','exempt','inactive'];
before(async()=>{
 runtime=new Miniflare({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-07-30',d1Databases:{DB:'operational-email-tests'},log:new Log(LogLevel.NONE)});
 db=await runtime.getD1Database('DB');
 for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-extensions.sql','schema-schedules.sql','schema-task-transfers.sql','schema-operational-email.sql','schema-urgent-email.sql','schema-flexible-work.sql','schema-hr-records.sql','schema-deadline-policy.sql'])await db.exec((await readFile(file,'utf8')).replaceAll('\n',' '));
 for(const person of people)await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,joined_on,password_hash,password_salt,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(person,person,person,person+' fixture',person==='reviewer'?'Team lead':'Employee',person==='reviewer'?'team_lead':'employee','Test department','2026-01-01','fixture','fixture',person==='inactive'?'suspended':'active',CUTOVER).run();
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.origin,'https://api.resend.com','Tests must never reach a real external provider');
  if(url.pathname==='/domains')return Response.json({message:'send-only fixture key'},{status:403});
  assert.equal(url.pathname,'/emails');assert.equal(options.method,'POST');const request={body:JSON.parse(options.body),headers:new Headers(options.headers),at:Date.now()};requests.push(request);
  if(providerDelay)await new Promise(resolve=>setTimeout(resolve,providerDelay));
  if(providerMode==='429')return Response.json({name:'rate_limit_exceeded',message:'fixture-private-provider-detail'},{status:429,headers:{'Retry-After':'60'}});
  if(providerMode==='throws')throw Error('fixture-private-provider-detail');
  if(providerMode==='unconfirmed')return Response.json({accepted:true});
  if(providerMode==='rejected')return Response.json({message:'fixture-private-provider-detail'},{status:500});
  return Response.json({id:'fixture-provider-'+requests.length});
 };
});
after(async()=>{globalThis.fetch=originalFetch;if(runtime)await runtime.dispose();});
beforeEach(async()=>{
 await db.exec("DELETE FROM operational_email_jobs;DELETE FROM notifications;DELETE FROM task_handover_requests;DELETE FROM task_events;DELETE FROM tasks;DELETE FROM meetings;DELETE FROM leave_requests;DELETE FROM availability;DELETE FROM work_holidays;DELETE FROM work_schedules;UPDATE attendance_policy SET weekdays_json='[1,2,3,4,5]',enabled=1,effective_date='2026-11-16' WHERE id='company';DELETE FROM member_connections;UPDATE users SET status='active';UPDATE users SET status='suspended' WHERE id='inactive';");
 // Reset only this module's rate state, retaining application settings used by the fixture.
 await db.prepare("DELETE FROM app_settings WHERE key LIKE 'operational_email_%' AND key NOT IN ('operational_email_enabled_at','operational_email_daily_start_date','operational_email_daily_time')").run();
 if(await db.prepare("SELECT name FROM sqlite_master WHERE name='operational_email_delivery_gate'").first())await db.prepare("UPDATE operational_email_delivery_gate SET lease_token='',lease_expires_at=0,next_send_at=0").run();
 await setting('operational_email_enabled_at',CUTOVER);await setting('operational_email_daily_start_date','2026-11-16');await setting('operational_email_daily_time','09:00');
 env={DB:db,TEL_OS_OPERATIONAL_EMAILS:'enabled',RESEND_API_KEY:'isolated-provider-fixture-key',TEL_OS_WORK_SENDER_EMAIL:'notifications@techforeasylife.in',TEL_OS_SENDER_EMAIL:'otp@techforeasylife.in'};
 requests=[];providerMode='accepted';providerDelay=0;
});
async function setting(key,value){await db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value).run();}
async function connection(user='member',status='verified',account=user+'@example.test',provider='gmail'){await db.prepare('INSERT INTO member_connections(user_id,provider,account,status,verified_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET account=excluded.account,status=excluded.status,verified_at=excluded.verified_at,updated_at=excluded.updated_at').bind(user,provider,account,status,status==='verified'?CUTOVER:null,NOW).run();}
async function task(id='task',assignee='member',extra={}){await db.prepare('INSERT INTO tasks(id,title,description,assignee_id,leader_id,department,priority,deadline,expected_deliverable,status,submission,feedback,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,extra.title||'Assigned fixture task',extra.description||'Private project description',assignee,extra.reviewer||'reviewer','Test department',extra.priority||'high',extra.deadline||'2026-11-16','Private deliverable details',extra.status||'working','Private submission','Private feedback','reviewer',CUTOVER,NOW).run();}
async function meeting(id='meeting',people=['member'],extra={}){const row={id,title:extra.title||'Fixture project meeting',starts_at:extra.starts_at||FUTURE,participants_json:JSON.stringify(people),created_at:extra.created_at||NOW,call_url:extra.call_url||'https://meet.example.test/fixture'};await db.prepare('INSERT INTO meetings(id,title,purpose,starts_at,call_url,participants_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(row.id,row.title,'Private meeting purpose',row.starts_at,row.call_url,row.participants_json,'reviewer',row.created_at,NOW).run();return row;}
async function transfer(id='transfer',status='pending'){await db.prepare('INSERT INTO task_handover_requests(id,task_id,from_user_id,to_user_id,reviewer_id,requested_by,status,reason,decision_note,created_at,updated_at,decided_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,'task','member','target','reviewer','member',status,'Private transfer reason','Private decision note',NOW,NOW,status==='approved'?NOW:null).run();}
async function jobs(){return (await db.prepare('SELECT * FROM operational_email_jobs ORDER BY kind,user_id,id').all()).results;}
async function run(options={}){return runOperationalEmails(env,{now:NOW,deliveryOnly:true,...options});}
async function queueInvitation(extra={}){const item=await meeting('meeting',['member'],extra);await queueOperationalMeeting(env,item,'scheduled',{now:NOW});return item;}

test('durable meeting keys deduplicate assignments and existing future meetings get reminders without old invitations',async()=>{
 await connection();const fresh=await meeting();await Promise.all([queueOperationalMeeting(env,fresh,'scheduled',{now:NOW}),queueOperationalMeeting(env,fresh,'scheduled',{now:NOW})]);
 assert.equal((await jobs()).length,2);const old=await meeting('old',['member'],{created_at:'2026-11-14T00:00:00.000Z'});await queueOperationalMeeting(env,old,'scheduled',{now:NOW});
 const oldJobs=(await jobs()).filter(job=>job.entity_id==='old');assert.deepEqual(oldJobs.map(job=>job.kind),['meeting_reminder']);assert.equal(requests.length,0,'Queue operations cannot send inline');
 await run();assert.equal(requests.length,1);assert.equal((await jobs()).filter(job=>job.status==='sent').length,1);await run();assert.equal(requests.length,1);
});
test('only current explicitly verified gmail-provider accounts receive work email, including other domains',async()=>{
 for(const [user,status,provider] of [['member','pending','gmail'],['target','disconnected','gmail'],['stranger','verified','outlook']])await connection(user,status,user+'@example.test',provider);
 await meeting('meeting',['member','target','stranger','inactive']);const row=await db.prepare("SELECT * FROM meetings WHERE id='meeting'").first();await queueOperationalMeeting(env,row,'scheduled',{now:NOW});await run();assert.equal(requests.length,0);
 await connection('member','verified','member@different-company.example');await run();assert.equal(requests.length,1);assert.deepEqual(requests[0].body.to,['member@different-company.example']);
 assert.equal(requests[0].body.from,'TEL Operations <notifications@techforeasylife.in>');assert.equal(requests[0].body.reply_to,'techforeasylife.operations@gmail.com');assert.equal(env.TEL_OS_SENDER_EMAIL,'otp@techforeasylife.in');
 assert.equal((await jobs()).some(job=>job.user_id==='inactive'),false);
});
test('duplicate verified addresses are blocked and changed verified accounts are used at send time',async()=>{
 await connection('member','verified','shared@example.test');await connection('target','verified','SHARED@example.test');await queueInvitation();await run();assert.equal(requests.length,0);
 await connection('target','disconnected','shared@example.test');await connection('member','verified','current@different.example');await run();assert.equal(requests.length,1);assert.deepEqual(requests[0].body.to,['current@different.example']);
 const sent=(await jobs()).find(job=>job.kind==='meeting_invitation');assert.equal(sent.recipient,'current@different.example');assert.ok(sent.provider_id);assert.ok(sent.sent_at);
});
test('rescheduling, participant removal and a meeting passing prevent stale queued invitations',async()=>{
 await connection();await queueInvitation();await db.prepare("UPDATE meetings SET starts_at='2026-11-16T06:30:00.000Z' WHERE id='meeting'").run();await run();assert.equal(requests.length,0);assert.equal((await jobs()).find(job=>job.kind==='meeting_invitation').status,'skipped');
 const changed=await db.prepare("SELECT * FROM meetings WHERE id='meeting'").first();await queueOperationalMeeting(env,changed,'updated',{now:NOW});await db.prepare("UPDATE meetings SET participants_json='[]' WHERE id='meeting'").run();await run();assert.equal(requests.length,0);
 await db.prepare("UPDATE meetings SET participants_json='[\"member\"]',starts_at='2026-11-16T03:20:00.000Z' WHERE id='meeting'").run();await run();assert.equal(requests.length,0);
});
test('one-hour notices for existing future meetings reach both in-app and email exactly once',async()=>{
 await connection();await meeting('existing',['member'],{created_at:'2026-11-14T00:00:00.000Z',starts_at:REMINDER});await run({deliveryOnly:false});
 assert.equal(requests.length,1);assert.match(requests[0].body.subject,/Meeting in one hour/);assert.equal((await jobs()).some(job=>job.kind==='meeting_invitation'),false);
 const notices=(await db.prepare("SELECT * FROM notifications WHERE user_id='member' AND link='meetings'").all()).results;assert.equal(notices.length,1);await run({deliveryOnly:false});assert.equal(requests.length,1);assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE link='meetings'").first()).n,1);
});
test('daily plans begin on the configured next day and include only current own unfinished work',async()=>{
 await connection();await task('own','member',{title:'Own unfinished assignment'});await task('done','member',{title:'Completed secret',status:'done'});await task('other','stranger',{title:'Other employee secret'});
 await setting('operational_email_daily_start_date','2026-11-17');await run({deliveryOnly:false});assert.equal((await jobs()).length,0);await setting('operational_email_daily_start_date','2026-11-16');await run({deliveryOnly:false});
 assert.equal(requests.length,1);const payload=requests[0].body;assert.match(payload.text,/Own unfinished assignment/);assert.match(payload.text,/Priority: high/);assert.match(payload.text,/Deadline: 2026-11-16/);assert.match(payload.text,/In progress/);for(const privateText of ['Completed secret','Other employee secret','Private submission','Private feedback','Private project description'])assert.ok(!JSON.stringify(payload).includes(privateText),privateText);
 await run({deliveryOnly:false});assert.equal(requests.length,1);assert.equal((await jobs()).filter(job=>job.kind==='daily_tasks'&&job.user_id==='member').length,1);
});
test('daily plans skip leave, exemptions, empty task lists, and task ownership changed after queueing',async()=>{
 for(const person of ['member','leave','exempt','target']){await connection(person);await task('task-'+person,person);}await db.prepare("UPDATE users SET status='on_leave' WHERE id='leave'").run();
 await db.prepare("INSERT INTO availability(id,user_id,kind,start_date,end_date,created_at) VALUES('exam','exempt','exam','2026-11-16','2026-11-16',?)").bind(NOW).run();
 await db.prepare("INSERT INTO leave_requests(id,user_id,type,start_date,end_date,reason,status,created_at,updated_at) VALUES('approved-leave','target','personal','2026-11-16','2026-11-16','Private medical detail','approved',?,?)").bind(NOW,NOW).run();
 const configured=env.RESEND_API_KEY;env.RESEND_API_KEY='';await run({deliveryOnly:false});env.RESEND_API_KEY=configured;
 assert.deepEqual((await jobs()).filter(job=>job.kind==='daily_tasks').map(job=>job.user_id),['member']);await db.prepare("UPDATE tasks SET assignee_id='stranger' WHERE assignee_id='member'").run();await run();assert.equal(requests.length,0);assert.equal((await jobs()).find(job=>job.kind==='daily_tasks').status,'skipped');
 await db.prepare("INSERT INTO work_holidays(id,date,title,created_by,created_at) VALUES('holiday','2026-11-17','Fixture exempt day','reviewer',?)").bind(NOW).run();await connection('stranger');await run({now:'2026-11-17T03:30:00.000Z',deliveryOnly:false});assert.equal(requests.length,0);assert.equal((await jobs()).some(job=>job.kind==='daily_tasks'&&job.entity_id==='2026-11-17'),false);
});
test('transfer requested/approved emails target only assigned reviewer/new owner and recheck current ownership',async()=>{
 for(const person of ['member','target','reviewer','stranger'])await connection(person);await task();await transfer();await queueTaskTransferEmails(env,'transfer','requested',{now:NOW});await run();assert.equal(requests.length,1);assert.deepEqual(requests[0].body.to,['reviewer@example.test']);assert.ok(!JSON.stringify(requests[0].body).includes('Private transfer reason'));assert.ok(!JSON.stringify(requests[0].body).includes('Private decision note'));
 await db.prepare("UPDATE task_handover_requests SET status='approved',decided_at=? WHERE id='transfer'").bind(NOW).run();await db.prepare("UPDATE tasks SET assignee_id='target' WHERE id='task'").run();await queueTaskTransferEmails(env,'transfer','approved',{now:NOW});await queueTaskTransferEmails(env,'transfer','approved',{now:NOW});await run();assert.equal(requests.length,2);assert.deepEqual(requests[1].body.to,['target@example.test']);
 await db.prepare("DELETE FROM operational_email_jobs WHERE kind='task_transfer_approved'").run();await queueTaskTransferEmails(env,'transfer','approved',{now:NOW});await db.prepare("UPDATE tasks SET assignee_id='stranger' WHERE id='task'").run();await run();assert.equal(requests.length,2);assert.equal((await jobs()).find(job=>job.kind==='task_transfer_approved').status,'skipped');
});
test('provider payload escapes untrusted display text and rejects unsafe meeting links',async()=>{
 await connection();await db.prepare("UPDATE users SET name='<img src=x onerror=alert(1)>' WHERE id='member'").run();await queueInvitation({title:'<script>fixture()</script>\nInjected header: value',call_url:'javascript:alert(1)'});await run();const payload=requests[0].body;
 assert.ok(!payload.html.includes('<script>'));assert.ok(!payload.html.includes('<img'));assert.ok(payload.html.includes('&lt;script&gt;'));assert.ok(payload.html.includes('&lt;img'));assert.ok(!payload.text.includes('javascript:'));assert.ok(!payload.html.includes('javascript:'));assert.ok(!payload.text.includes('Private meeting purpose'));assert.ok(!payload.subject.includes('\n'));
});
test('simultaneous delivery runs atomically claim once and require confirmed provider ID for Sent',async()=>{
 await connection();await queueInvitation();providerDelay=25;const results=await Promise.all([run(),run(),run()]);assert.equal(requests.length,1);assert.equal(results.reduce((sum,result)=>sum+result.sent,0),1);const sent=(await jobs()).find(job=>job.kind==='meeting_invitation');assert.equal(sent.status,'sent');assert.match(sent.provider_id,/^fixture-provider-/);assert.ok(requests[0].headers.get('Idempotency-Key'));await run();assert.equal(requests.length,1);
});
test('confirmed HTTP 429 safely requeues with backoff and stable provider idempotency key',async()=>{
 await connection();await queueInvitation();providerMode='429';await run();assert.equal(requests.length,1);let job=(await jobs()).find(job=>job.kind==='meeting_invitation');assert.equal(job.status,'queued');assert.ok(job.next_attempt_at>NOW);assert.equal(job.provider_id,'');assert.equal(job.sent_at,null);assert.ok(!job.error.includes('fixture-private-provider-detail'));const key=requests[0].headers.get('Idempotency-Key');
 await run();assert.equal(requests.length,1,'Retry-After must prevent immediate resend');const gate=await db.prepare('SELECT next_send_at FROM operational_email_delivery_gate WHERE singleton=1').first();assert.ok(gate.next_send_at>Date.now()+30000,'Rate-limit backoff must apply globally');
 // Advance the persisted wall-clock gate as well as the caller's logical clock.
 await db.prepare('UPDATE operational_email_delivery_gate SET next_send_at=0 WHERE singleton=1').run();providerMode='accepted';await run({now:new Date(Date.parse(job.next_attempt_at)+1000).toISOString()});assert.equal(requests.length,2);assert.equal(requests[1].headers.get('Idempotency-Key'),key);job=(await jobs()).find(job=>job.kind==='meeting_invitation');assert.equal(job.status,'sent');
});
test('uncertain, unconfirmed and rejected results require review and never automatically resend',async()=>{
 await connection();for(const mode of ['throws','unconfirmed','rejected']){const row=await meeting(mode);await queueOperationalMeeting(env,row,'scheduled',{now:NOW});providerMode=mode;const prior=requests.length;await run();assert.equal(requests.length,prior+1);const job=(await jobs()).find(job=>job.kind==='meeting_invitation'&&job.entity_id===mode);assert.equal(job.status,'needs_review');assert.equal(job.provider_id,'');assert.equal(job.sent_at,null);assert.ok(!job.error.includes('fixture-private-provider-detail'));await run();assert.equal(requests.length,prior+1);}
});
test('sender status preserves separate OTP sender and a restricted domain lookup remains unknown',async()=>{
 const status=await getOperationalEmailStatus(env);assert.equal(status.sender,'notifications@techforeasylife.in');assert.equal(status.daily_time,'09:00');assert.equal(status.reply_to,'techforeasylife.operations@gmail.com');assert.equal(status.timezone,'Asia/Kolkata');assert.equal(env.TEL_OS_SENDER_EMAIL,'otp@techforeasylife.in');const domain=await verifyOperationalEmailDomain(env);assert.equal(domain.verified,null);assert.equal(domain.status,'domain_lookup_unavailable_for_this_key');assert.equal(requests.length,0);
});

test('verification, account eligibility and assignment are rechecked after an atomic claim',async()=>{
 await connection();await queueInvitation();let mutated=false;
 const wrappedDB={batch:statements=>db.batch(statements),prepare(sql){const wrap=statement=>new Proxy(statement,{get(target,key){if(key==='bind')return(...args)=>wrap(target.bind(...args));if(key==='run')return async()=>{const result=await target.run();if(!mutated&&/UPDATE operational_email_jobs SET status='sending'/.test(sql)&&result.meta?.changes){mutated=true;await db.prepare("UPDATE member_connections SET status='disconnected' WHERE user_id='member' AND provider='gmail'").run();}return result;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});return wrap(db.prepare(sql));}};
 await runOperationalEmails({...env,DB:wrappedDB},{now:NOW,deliveryOnly:true});assert.ok(mutated,'Fixture must change the connection after the actual D1 claim');assert.equal(requests.length,0);assert.equal((await jobs()).find(job=>job.kind==='meeting_invitation').status,'skipped');
});
test('an unverified timestamp or suspended account cannot authorize delivery',async()=>{
 await connection();await db.prepare("UPDATE member_connections SET verified_at=NULL WHERE user_id='member'").run();await queueInvitation();await run();assert.equal(requests.length,0);await connection();await db.prepare("UPDATE users SET status='suspended' WHERE id='member'").run();await run();assert.equal(requests.length,0);
});
test('a lost Sending claim becomes needs_review and cannot cause an automatic duplicate',async()=>{
 await connection();await queueInvitation();await db.prepare("UPDATE operational_email_jobs SET status='sending',claimed_at='2026-11-16T03:20:00.000Z' WHERE kind='meeting_invitation'").run();await run();const job=(await jobs()).find(job=>job.kind==='meeting_invitation');assert.equal(job.status,'needs_review');assert.equal(requests.length,0);await run();assert.equal(requests.length,0);
});
test('provider starts remain at most one per second across queued recipients',async()=>{
 await connection('member');await connection('target');const item=await meeting('rate',['member','target']);await queueOperationalMeeting(env,item,'scheduled',{now:NOW});let delayed=false;
 // A slower first final D1 write must not compress the actual provider start interval.
 const wrappedDB={batch:statements=>db.batch(statements),prepare(sql){const wrap=statement=>new Proxy(statement,{get(target,key){if(key==='bind')return(...args)=>wrap(target.bind(...args));if(key==='run')return async()=>{const result=await target.run();if(!delayed&&/UPDATE operational_email_jobs SET attempts=attempts\+1/.test(sql)&&result.meta?.changes){delayed=true;await new Promise(resolve=>setTimeout(resolve,350));}return result;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});return wrap(db.prepare(sql));}};
 await runOperationalEmails({...env,DB:wrappedDB},{now:NOW,deliveryOnly:true});assert.equal(requests.length,2);assert.ok(requests[1].at-requests[0].at>=950,`Provider starts were only ${requests[1].at-requests[0].at}ms apart`);
});
test('unsupported company, HR, attendance and chat notifications never produce operational email',async()=>{
 await connection();for(const [id,link] of [['company','founder-updates'],['hr','hr'],['attendance','attendance'],['chat','channel/general']])await db.prepare('INSERT INTO notifications(id,user_id,title,body,link,created_at) VALUES(?,?,?,?,?,?)').bind(id,'member','Private unrelated title','Private unrelated body',link,NOW).run();await run({deliveryOnly:false});assert.equal((await jobs()).length,0);assert.equal(requests.length,0);
});
test('on-leave members remain eligible for assigned meeting email',async()=>{
 await connection();await db.prepare("UPDATE users SET status='on_leave' WHERE id='member'").run();await queueInvitation();await run();assert.equal(requests.length,1);assert.deepEqual(requests[0].body.to,['member@example.test']);
});
test('a requested transfer cannot email a reviewer removed before delivery',async()=>{
 await connection('reviewer');await task();await transfer();await queueTaskTransferEmails(env,'transfer','requested',{now:NOW});await db.prepare("UPDATE tasks SET leader_id='stranger' WHERE id='task'").run();await run();assert.equal(requests.length,0);assert.equal((await jobs()).find(job=>job.kind==='task_transfer_requested').status,'skipped');
});

test('new-mode meeting delivery hook persists only the operational outbox and never sends inline',async()=>{
 await connection();const current=new Date().toISOString(),item=await meeting('hook',['member'],{created_at:current,starts_at:new Date(Date.now()+2*60*60*1000).toISOString()});await queueMeetingDeliveries(env,item,'scheduled');assert.equal((await jobs()).length,2);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM meeting_deliveries').first()).n,0);assert.equal(requests.length,0);
});
test('daily plans never run on the activation day even when the stored start date is stale',async()=>{
 await connection();await task();await setting('operational_email_enabled_at','2026-11-16T02:30:00.000Z');await setting('operational_email_daily_start_date','2026-11-16');await run({deliveryOnly:false});assert.equal((await jobs()).length,0);assert.equal(requests.length,0);assert.equal((await getOperationalEmailStatus(env)).daily_start_date,'2026-11-17');
});
test('daily plans respect company and individual weekly exemption schedules',async()=>{
 await connection();await task();await db.prepare("UPDATE attendance_policy SET weekdays_json='[2]',effective_date='2026-11-16' WHERE id='company'").run();await run({deliveryOnly:false});assert.equal((await jobs()).length,0);assert.equal(requests.length,0);
 await db.prepare("UPDATE attendance_policy SET weekdays_json='[1,2,3,4,5]' WHERE id='company'").run();await db.prepare("INSERT INTO work_schedules(id,user_id,start_time,weekdays_json,effective_date,updated_by,updated_at) VALUES('member-weekly','member','09:00','[2]','2026-11-16','reviewer',?)").bind(NOW).run();await run({deliveryOnly:false});assert.equal((await jobs()).length,0);assert.equal(requests.length,0);
 await db.prepare("UPDATE work_schedules SET weekdays_json='[1]' WHERE id='member-weekly'").run();await run({deliveryOnly:false});assert.equal(requests.length,1);assert.match(requests[0].body.subject,/task plan/);
});
