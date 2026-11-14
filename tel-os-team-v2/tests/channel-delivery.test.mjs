import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,Log,LogLevel} from 'miniflare';

let runtime,db;
const stamp=new Date().toISOString();
const wrapper=`import {handleCollaboration} from './src/collaboration.js';import {helpers} from './src/core.js';
 export default {async fetch(request,env){let statements=0,maxBindings=0;const wrapped={...env,DB:{prepare(sql){statements++;const s=env.DB.prepare(sql);return{bind(...args){maxBindings=Math.max(maxBindings,args.length);return s.bind(...args);}};},batch(statements){return env.DB.batch(statements);}}};try{const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(request.headers.get('x-test-user')).first();if(!user)return Response.json({error:'Unknown test actor'},{status:401});const response=await handleCollaboration({request,url:new URL(request.url),env:wrapped,user,body:request.method==='GET'?{}:await request.json(),helpers});if(!response)return new Response('No route',{status:404});return Response.json({...await response.json(),test_query_count:statements,test_max_bindings:maxBindings},{status:response.status});}catch(error){return Response.json({error:error.message},{status:error.status||500});}}};`;
before(async()=>{
 const built=await build({stdin:{contents:wrapper,resolveDir:process.cwd(),sourcefile:'channel-delivery-test.js'},bundle:true,write:false,format:'esm',platform:'browser'});
 runtime=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'channel-delivery-tests'},log:new Log(LogLevel.NONE),bindings:{WHATSAPP_TOKEN:'isolated-template-fixture-token',WHATSAPP_PHONE_NUMBER_ID:'fixture-number',WHATSAPP_WORK_TEMPLATE_NAME:'tel_work_update'},outboundService:async()=>{throw Error('Channel tests must never send external messages.');}});
 db=await runtime.getD1Database('DB');
 for(const path of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-extensions.sql'])await db.exec((await readFile(path,'utf8')).replaceAll('\n',' '));
 const fixtures=[
  ['harsh','founder','Leadership','active'],['devangi','founder','Leadership','on_leave'],
  ['hr-lead','hr_lead','HR','active'],['hr-member','hr_member','HR','active'],
  ['member','employee','Marketing','active'],['peer','employee','Marketing','active'],['leave-member','employee','Marketing','on_leave'],
  ['suspended','employee','Marketing','suspended'],['exited','employee','Marketing','exited'],
  ['finance','finance_head','Finance','active'],['strategy','employee','Strategy','active'],['leadership-staff','employee','Leadership','active']
 ];
 for(const [id,role,department,status] of fixtures)await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,status,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,id,id,id,role,role,department,status,'2026-01-01','unused-fixture-hash','unused-fixture-salt',0,stamp).run();
 await db.prepare("INSERT INTO app_settings(key,value) VALUES('work_notifications_enabled_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(new Date(Date.parse(stamp)-1000).toISOString()).run();
 await db.prepare("INSERT INTO integration_status(provider,status,account_label,updated_at) VALUES('gmail','active_chatgpt_job','techforeasylife.operations@gmail.com',?)").bind(stamp).run();
 for(const id of ['peer','harsh','devangi'])for(const provider of ['gmail','whatsapp'])await db.prepare("INSERT INTO member_connections(user_id,provider,account,status,verified_at,updated_at) VALUES(?,?,?,'verified',?,?)").bind(id,provider,provider==='gmail'?id+'@example.test':'+919123456789',stamp,stamp).run();
});
after(async()=>{if(runtime)await runtime.dispose();});
async function api(who,method,path,body){const response=await runtime.dispatchFetch('https://channel.test'+path,{method,headers:{'x-test-user':who,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
async function post(who,channel,body){const result=await api(who,'POST','/api/channels/'+channel+'/messages',body);assert.equal(result.status,201,JSON.stringify(result));return result.data;}
async function alerts(messageId){return (await db.prepare("SELECT * FROM notifications WHERE instr(dedupe_key,?)=1 ORDER BY user_id").bind('channel-message:'+messageId+':').all()).results;}
const recipientIDs=rows=>rows.map(row=>row.user_id).sort();

test('ordinary department messages notify every current department member and founder without needing mentions',async()=>{
 const result=await post('member','marketing',{body:'Private campaign draft text'}),notifications=await alerts(result.message.id);
 assert.deepEqual(recipientIDs(notifications),['devangi','harsh','leave-member','peer']);
 assert.ok(notifications.every(row=>row.body==='member posted a message.'));assert.ok(notifications.every(row=>!row.body.includes('Private campaign')));
 const work=(await db.prepare('SELECT d.* FROM work_notification_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE instr(n.dedupe_key,?)=1').bind('channel-message:'+result.message.id+':').all()).results;
 assert.equal(work.length,8);assert.ok(work.every(row=>row.category==='New work message'));assert.equal(work.filter(row=>row.user_id==='leave-member'&&row.status==='blocked').length,2);assert.equal(work.filter(row=>['peer','harsh','devangi'].includes(row.user_id)&&row.status==='queued').length,6);
 assert.equal((await api('finance','GET','/api/channels/marketing/messages')).status,403);
});
test('company messages reach all active/on-leave staff and founders, excluding author and inactive accounts',async()=>{
 const result=await post('member','general',{body:'Company coordination update'});
 assert.deepEqual(recipientIDs(await alerts(result.message.id)),['devangi','finance','harsh','hr-lead','hr-member','leadership-staff','leave-member','peer','strategy']);
});
test('Leadership and HR message notifications preserve their exact viewing boundaries',async()=>{
 let result=await post('harsh','founders',{body:'Private founder coordination'});assert.deepEqual(recipientIDs(await alerts(result.message.id)),['devangi']);
 assert.equal((await api('leadership-staff','GET','/api/channels/founders/messages')).status,403);assert.equal((await api('leadership-staff','POST','/api/channels/founders/messages',{body:'Not allowed'})).status,403);
 result=await post('hr-member','hr',{body:'Private HR coordination'});assert.deepEqual(recipientIDs(await alerts(result.message.id)),['devangi','harsh','hr-lead']);
 assert.equal((await api('member','GET','/api/channels/hr/messages')).status,403);
});
test('repeated mentions, thread ownership and Harsh Marketing oversight produce one alert per person/message',async()=>{
 const top=await post('member','marketing-reports',{body:'@harsh @harsh @devangi @peer @finance'});
 let notifications=await alerts(top.message.id);assert.deepEqual(recipientIDs(notifications),['devangi','harsh','leave-member','peer']);assert.equal(new Set(notifications.map(row=>row.dedupe_key)).size,4);
 const reply=await post('peer','marketing-reports',{body:'@member @member @harsh',parent_id:top.message.id});notifications=await alerts(reply.message.id);assert.deepEqual(recipientIDs(notifications),['devangi','harsh','leave-member','member']);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='harsh' AND dedupe_key=?").bind('channel-message:'+reply.message.id+':harsh').first()).n,1);
 await db.prepare("UPDATE users SET status='suspended' WHERE id='member'").run();
 const later=await post('peer','marketing-reports',{body:'Reply after access changed',parent_id:top.message.id});assert.deepEqual(recipientIDs(await alerts(later.message.id)),['devangi','harsh','leave-member']);
 await db.prepare("UPDATE users SET status='active' WHERE id='member'").run();
});
test('announcement fanout preserves the existing posting policy',async()=>{
 assert.equal((await api('member','POST','/api/channels/announcements/messages',{body:'Forbidden announcement'})).status,403);
 const result=await post('hr-lead','announcements',{body:'Authorised company announcement'});assert.deepEqual(recipientIDs(await alerts(result.message.id)),['devangi','finance','harsh','hr-member','leadership-staff','leave-member','member','peer','strategy']);
});
test('large channel fanout batches inserts within D1 binding and query budgets',async()=>{
 const inserts=[];for(let i=0;i<65;i++)inserts.push(db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,status,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind('bulk-'+i,'bulk-'+i,'bulk-'+i,'Fixture '+i,'Member','employee','Marketing','active','2026-01-01','unused-hash','unused-salt',0,stamp));await db.batch(inserts);
 const result=await post('member','marketing',{body:'Batch delivery check'});assert.equal((await alerts(result.message.id)).length,69);assert.ok(result.test_max_bindings<=70,result.test_max_bindings);assert.ok(result.test_query_count<25,result.test_query_count);
});
