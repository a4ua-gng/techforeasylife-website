import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

let runtime,db;
const entry=`import {handleTaskTransfers} from './src/task-transfers.js';
export default {async fetch(request,env){const url=new URL(request.url),user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(request.headers.get('x-user')||'').first();try{return await handleTaskTransfers({request,url,env,user,body:request.method==='GET'?{}:await request.json()})||new Response('missing',{status:404});}catch(error){return Response.json({error:error.message},{status:error.status||500});}}};`;
before(async()=>{
 const result=await build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false,plugins:[{name:'isolated-email-outbox',setup(builder){builder.onResolve({filter:/operational-emails\.js$/},()=>({path:'transfer-email-fixture',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export async function queueTaskTransferEmails(env,id,event){const r=await env.DB.prepare('SELECT status FROM task_transfer_requests WHERE id=?').bind(id).first();await env.DB.prepare('INSERT INTO transfer_email_hooks(request_id,event,status_when_queued) VALUES(?,?,?)').bind(id,event,r.status).run();}`,loader:'js'}));}}]});
 runtime=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'transfer-tests'}});db=await runtime.getD1Database('DB');
 for(const file of ['schema-core.sql','schema-workflows.sql','schema-task-transfers.sql'])await db.exec((await readFile(file,'utf8')).replaceAll('\n',' '));
 await db.exec('CREATE TABLE transfer_email_hooks(request_id TEXT,event TEXT,status_when_queued TEXT,PRIMARY KEY(request_id,event))');
 const stamp=new Date().toISOString();
 for(const [id,role,dept] of [['owner','employee','Marketing'],['target','employee','Marketing'],['third','employee','Marketing'],['lead','team_lead','Marketing'],['otherlead','team_lead','Marketing'],['founder','founder','Leadership'],['otherdept','employee','Finance'],['suspended','employee','Marketing']])await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,joined_on,password_hash,password_salt,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,id,id,id,role,role,dept,'2026-01-01','fixture','salt',id==='suspended'?'suspended':'active',stamp).run();
});
after(async()=>runtime&&await runtime.dispose());
beforeEach(async()=>{
 await db.exec("DELETE FROM transfer_email_hooks;DELETE FROM notifications;DELETE FROM audit_events;DELETE FROM task_events;DELETE FROM task_transfer_requests;DELETE FROM tasks;DELETE FROM leave_requests;UPDATE users SET status='active' WHERE id<>'suspended';UPDATE users SET role='team_lead',department='Marketing' WHERE id='lead';");
 const stamp=new Date().toISOString();await db.prepare("INSERT INTO tasks(id,title,assignee_id,leader_id,department,priority,deadline,expected_deliverable,created_by,created_at,updated_at) VALUES('task','Launch work','owner','lead','Marketing','normal','2026-12-30','A reviewed result','lead',?,?)").bind(stamp,stamp).run();
});
async function call(who,path,method='GET',body={}){const response=await runtime.dispatchFetch('https://transfer.test'+path,{method,headers:{'x-user':who,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};}
async function request(who='owner',target='target'){const result=await call(who,'/api/tasks/task/transfers','POST',{to_user_id:target,reason:'Private handover reason'});assert.equal(result.status,201,JSON.stringify(result));return result.data.transfer;}

test('request keeps ownership unchanged until the assigned independent reviewer approves',async()=>{
 const item=await request();assert.equal((await db.prepare("SELECT assignee_id FROM tasks WHERE id='task'").first()).assignee_id,'owner');
 assert.equal((await call('target','/api/tasks/task/transfers')).status,403);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='target'").first()).n,0);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='lead'").first()).n,1);
 const approved=await call('lead','/api/task-transfers/'+item.id,'PATCH',{action:'approve',note:'Private reviewer note'});assert.equal(approved.status,200,JSON.stringify(approved));
 const task=await db.prepare("SELECT * FROM tasks WHERE id='task'").first();assert.equal(task.assignee_id,'target');assert.equal(task.status,'todo');assert.equal(task.leader_id,'lead');
 assert.equal((await call('target','/api/tasks/task/transfers')).status,200);
 const targetView=await call('target','/api/tasks/task/transfers');assert.ok(!JSON.stringify(targetView.data).includes('Private handover reason'));assert.ok(!JSON.stringify(targetView.data).includes('Private reviewer note'));
 const hooks=(await db.prepare('SELECT event,status_when_queued FROM transfer_email_hooks ORDER BY event').all()).results;assert.deepEqual(hooks,[{event:'approved',status_when_queued:'approved'},{event:'requested',status_when_queued:'pending'}]);
});
test('strangers, requester, other leads and a nonassigned founder cannot approve',async()=>{
 const item=await request();
 for(const who of ['owner','target','third','otherlead','founder'])assert.equal((await call(who,'/api/task-transfers/'+item.id,'PATCH',{action:'approve'})).status,403,who);
 assert.equal((await call('third','/api/tasks/task/transfers')).status,403);
 assert.deepEqual((await call('third','/api/task-transfers')).data.transfers,[]);
 assert.equal((await call('target','/api/tasks/task/transfers','POST',{to_user_id:'third',reason:'not mine'})).status,403);
});
test('self, reviewer, unavailable and cross-department targets are rejected',async()=>{
 for(const [target,status] of [['owner',400],['lead',400],['suspended',400],['otherdept',403]])assert.equal((await call('owner','/api/tasks/task/transfers','POST',{to_user_id:target,reason:'handover'})).status,status,target);
 await db.prepare("UPDATE users SET status='on_leave' WHERE id='target'").run();assert.equal((await call('owner','/api/tasks/task/transfers','POST',{to_user_id:'target',reason:'handover'})).status,400);
 await db.prepare("UPDATE users SET status='active' WHERE id='target'").run();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await db.prepare("INSERT INTO leave_requests(id,user_id,type,start_date,end_date,reason,status,created_at,updated_at) VALUES('leave','target','personal',?,?,'Private reason','approved',?,?)").bind(today,today,new Date().toISOString(),new Date().toISOString()).run();
 assert.equal((await call('owner','/api/tasks/task/transfers','POST',{to_user_id:'target',reason:'handover'})).status,409);
});
test('only one pending request and one approval event survive concurrent submissions',async()=>{
 const attempts=await Promise.all([call('owner','/api/tasks/task/transfers','POST',{to_user_id:'target',reason:'handover'}),call('owner','/api/tasks/task/transfers','POST',{to_user_id:'third',reason:'handover'})]);
 assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);const item=attempts.find(r=>r.status===201).data.transfer;
 const approvals=await Promise.all([call('lead','/api/task-transfers/'+item.id,'PATCH',{action:'approve'}),call('lead','/api/task-transfers/'+item.id,'PATCH',{action:'approve'})]);assert.ok(approvals.every(r=>[200,409].includes(r.status)),JSON.stringify(approvals));
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM task_events WHERE action='transfer'").first()).n,1);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM notifications WHERE title='Task assigned after transfer approval'").first()).n,1);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM transfer_email_hooks WHERE event='approved'").first()).n,1);
 assert.equal((await call('lead','/api/task-transfers/'+item.id,'PATCH',{action:'approve'})).status,200);
});
test('owner/reviewer/state/availability changes prevent stale approval',async()=>{
 const item=await request();
 await db.prepare("UPDATE tasks SET assignee_id='third' WHERE id='task'").run();assert.equal((await call('lead','/api/task-transfers/'+item.id,'PATCH',{action:'approve'})).status,409);
 await db.prepare("UPDATE tasks SET assignee_id='owner',leader_id='otherlead' WHERE id='task'").run();assert.equal((await call('lead','/api/task-transfers/'+item.id,'PATCH',{action:'approve'})).status,403);assert.equal((await call('otherlead','/api/task-transfers/'+item.id,'PATCH',{action:'approve'})).status,403);
 await db.prepare("UPDATE tasks SET leader_id='lead',status='done' WHERE id='task'").run();assert.equal((await call('lead','/api/task-transfers/'+item.id,'PATCH',{action:'approve'})).status,409);
 await db.prepare("UPDATE tasks SET status='todo' WHERE id='task'").run();await db.prepare("UPDATE users SET status='on_leave' WHERE id='target'").run();assert.equal((await call('lead','/api/task-transfers/'+item.id,'PATCH',{action:'approve'})).status,400);
 await db.prepare("UPDATE users SET status='active' WHERE id='target'").run();await db.prepare("UPDATE users SET role='employee' WHERE id='lead'").run();assert.equal((await call('lead','/api/task-transfers/'+item.id,'PATCH',{action:'approve'})).status,403);
 assert.equal((await db.prepare("SELECT assignee_id FROM tasks WHERE id='task'").first()).assignee_id,'owner');
});
test('decline and cancel never reassign; review/approved/done tasks cannot start transfers',async()=>{
 let item=await request();assert.equal((await call('lead','/api/task-transfers/'+item.id,'PATCH',{action:'reject'})).status,200);
 assert.equal((await call('lead','/api/task-transfers/'+item.id,'PATCH',{action:'approve'})).status,409);
 item=await request();assert.equal((await call('third','/api/task-transfers/'+item.id,'PATCH',{action:'cancel'})).status,403);assert.equal((await call('owner','/api/task-transfers/'+item.id,'PATCH',{action:'cancel'})).status,200);
 assert.equal((await call('lead','/api/task-transfers/'+item.id,'PATCH',{action:'approve'})).status,409);
 for(const status of ['review','approved','done']){await db.prepare('UPDATE tasks SET status=? WHERE id=\'task\'').bind(status).run();assert.equal((await call('owner','/api/tasks/task/transfers','POST',{to_user_id:'target',reason:'handover'})).status,409);}
 assert.equal((await db.prepare("SELECT assignee_id FROM tasks WHERE id='task'").first()).assignee_id,'owner');
});
test('an assigned founder can approve a cross-department transfer but not self-review',async()=>{
 await db.prepare("UPDATE tasks SET leader_id='founder' WHERE id='task'").run();const item=await request('owner','otherdept');
 assert.equal((await call('founder','/api/task-transfers/'+item.id,'PATCH',{action:'approve'})).status,200);
 const task=await db.prepare("SELECT assignee_id,department,status FROM tasks WHERE id='task'").first();assert.deepEqual(task,{assignee_id:'otherdept',department:'Finance',status:'todo'});
});
test('a replacement reviewer can close an outdated request without reassigning work',async()=>{
 const item=await request();await db.prepare("UPDATE tasks SET leader_id='otherlead' WHERE id='task'").run();
 const stale=await call('otherlead','/api/tasks/task/transfers');assert.equal(stale.data.transfers[0].stale,true);
 assert.equal((await call('otherlead','/api/task-transfers/'+item.id,'PATCH',{action:'cancel'})).status,200);
 assert.equal((await db.prepare("SELECT assignee_id FROM tasks WHERE id='task'").first()).assignee_id,'owner');
 const fresh=await request();assert.equal(fresh.reviewer_id,'otherlead');
});
