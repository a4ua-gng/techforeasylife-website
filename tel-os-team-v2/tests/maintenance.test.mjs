import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {hashPassword,sha,day} from '../src/core.js';
import {maintenanceAccess} from '../src/maintenance.js';

let mf,db;
const origin='https://maintenance.test',password='Maintenance!Fixture2026';
const at=new Date().toISOString(),started=new Date(Date.now()-120000).toISOString();
const cookies={};
before(async()=>{
 let scriptPath=process.env.TEL_MAINTENANCE_TEST_WORKER;
 if(!scriptPath){await mkdir('tests/artifacts',{recursive:true});scriptPath='tests/artifacts/maintenance-worker.mjs';await build({entryPoints:['src/worker.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:scriptPath,define:{__HTML__:JSON.stringify('<html>test</html>'),__CSS__:JSON.stringify(''),__APP__:JSON.stringify('')}});}
 mf=new Miniflare({modules:true,scriptPath,compatibilityDate:'2026-07-30',d1Databases:{DB:'maintenance-test'}});db=await mf.getD1Database('DB');
 for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql','schema-chat-read.sql','schema-task-transfers.sql','schema-operational-email.sql','schema-urgent-email.sql','schema-flexible-work.sql','schema-hr-records.sql','schema-deadline-policy.sql'])await db.exec((await readFile(file,'utf8')).replace(/\n/g,' '));
 const salt='0123456789abcdef0123456789abcdef',hash=await hashPassword(password,salt);
 for(const [id,role] of [['founder','founder'],['working','employee'],['break','employee'],['offline','employee']]){
  await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,joined_on,status,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,\'2026-01-01\',\'active\',?,?,0,?)').bind(id,'MT-'+id,id,'Fixture '+id,role,role,'Marketing',hash,salt,at).run();
  const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');cookies[id]='__Host-tel_session='+token;await db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(await sha(token),id,at,new Date(Date.now()+3600000).toISOString()).run();
 }
 for(const state of ['working','break'])await db.prepare('INSERT INTO attendance_sessions(id,user_id,work_date,clock_in,state,active_seconds,break_seconds,active_started_at,break_started_at,updated_at) VALUES(?,?,?,?,?,120,30,?,?,?)').bind('open-'+state,state,day(),started,state,state==='working'?started:null,state==='break'?started:null,at).run();
 await mode('on');
});
after(async()=>{if(mf)await mf.dispose();});
async function mode(value){await db.prepare("INSERT INTO app_settings(key,value) VALUES('tel_maintenance_mode',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(value).run();}
async function req(path,{user,method='GET',body}={}){const headers={};if(user)headers.Cookie=cookies[user];if(method!=='GET'){headers.Origin=origin;headers['Content-Type']='application/json';}const response=await mf.dispatchFetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const type=response.headers.get('content-type')||'';return {status:response.status,headers:response.headers,data:type.includes('json')?await response.json():await response.text()};}
async function open(){return (await db.prepare('SELECT * FROM attendance_sessions WHERE clock_out IS NULL ORDER BY id').all()).results;}

test('public status and static assets remain available during maintenance',async()=>{
 const status=await req('/api/status');assert.equal(status.status,200);assert.equal(status.data.maintenance,true);assert.equal(status.data.retry_after,60);
 assert.equal((await req('/')).status,200);assert.equal((await req('/app.js')).status,200);assert.equal((await req('/api/health')).status,200);
});
test('anonymous and clocked-out users receive a dedicated temporary response without cookie changes',async()=>{
 for(const user of [undefined,'offline']){const result=await req('/api/people',{user});assert.equal(result.status,503);assert.equal(result.data.maintenance,true);assert.equal(result.data.retry_after,60);assert.equal(result.headers.get('retry-after'),'60');assert.equal(result.headers.get('set-cookie'),null);}
 const blocked=await req('/api/attendance',{user:'offline',method:'POST',body:{action:'clock_in'}});assert.equal(blocked.status,503);assert.equal((await open()).length,2);
});
test('founders, working employees and employees on break retain authenticated API access',async()=>{
 for(const user of ['founder','working','break']){assert.equal((await req('/api/me',{user})).status,200);assert.equal((await req('/api/people',{user})).status,200);}
});
test('valid blocked login creates no orphan session and leaves passwords and attendance intact',async()=>{
 const beforeSessions=await db.prepare('SELECT * FROM sessions ORDER BY token_hash').all(),beforeAttendance=await open(),beforeUsers=await db.prepare('SELECT id,password_hash,password_salt FROM users ORDER BY id').all();
 const result=await req('/api/auth/login',{method:'POST',body:{username:'offline',password}});assert.equal(result.status,503);assert.equal(result.data.maintenance,true);assert.equal(result.headers.get('set-cookie'),null);
 assert.deepEqual((await db.prepare('SELECT * FROM sessions ORDER BY token_hash').all()).results,beforeSessions.results);assert.deepEqual(await open(),beforeAttendance);assert.deepEqual((await db.prepare('SELECT id,password_hash,password_salt FROM users ORDER BY id').all()).results,beforeUsers.results);
 assert.equal((await req('/api/auth/login',{method:'POST',body:{username:'offline',password:'wrong'}})).status,401);
});
test('founders and already-clocked employees can sign in during maintenance',async()=>{
 for(const username of ['founder','working','break']){const result=await req('/api/auth/login',{method:'POST',body:{username,password}});assert.equal(result.status,200);assert.ok(result.headers.get('set-cookie'));}
});
test('maintenance gate never clocks anyone out and elapsed attendance remains after mode is disabled',async()=>{
 const before=await open();
 for(let i=0;i<3;i++)await req('/api/me',{user:'offline'});
 assert.deepEqual(await open(),before);
 const working=await req('/api/attendance',{user:'working'}),onBreak=await req('/api/attendance',{user:'break'});assert.equal(working.data.current.id,'open-working');assert.ok(working.data.current.active_seconds>=240);assert.equal(onBreak.data.current.id,'open-break');assert.ok(onBreak.data.current.break_seconds>=150);assert.deepEqual(await open(),before);
 await mode('off');
 try{assert.equal((await req('/api/me',{user:'offline'})).status,200);assert.equal((await req('/api/status')).data.maintenance,false);const resumed=await req('/api/attendance',{user:'working'});assert.equal(resumed.data.current.id,'open-working');assert.ok(resumed.data.current.active_seconds>=working.data.current.active_seconds);assert.deepEqual(await open(),before);}finally{await mode('on');}
});
test('environment maintenance flag and D1 maintenance flag share the read-only gate',async()=>{
 const env={DB:db,TEL_OS_MAINTENANCE:'enabled'};const before=await open();await mode('off');try{assert.equal((await maintenanceAccess(env,{id:'offline',role:'employee'})).status,503);assert.equal(await maintenanceAccess(env,{id:'working',role:'employee'}),null);assert.equal(await maintenanceAccess(env,{id:'founder',role:'founder'}),null);}finally{await mode('on');}assert.deepEqual(await open(),before);
});
test('routine background automation remains available without forcing an attendance clock-out',async()=>{
 const before=await open();const result=await req('/api/automations/run',{user:'founder',method:'POST',body:{}});assert.equal(result.status,200);assert.ok(await db.prepare("SELECT key FROM automation_runs WHERE key='last_success'").first());assert.deepEqual(await open(),before);
});
test('explicit logout works during maintenance and does not end attendance',async()=>{
 const before=await open();const result=await req('/api/auth/logout',{user:'offline',method:'POST',body:{}});assert.equal(result.status,200);assert.match(result.headers.get('set-cookie'),/Max-Age=0/);assert.deepEqual(await open(),before);
});
