import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,Log,LogLevel} from 'miniflare';

let runtime,db;
const wrapper=`import {handleCollaboration} from './src/collaboration.js';import {helpers} from './src/core.js';export default {async fetch(request,env){try{const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(request.headers.get('x-test-user')).first();if(!user)return Response.json({error:'Sign in'},{status:401});return await handleCollaboration({request,url:new URL(request.url),env,user,body:request.method==='GET'?{}:await request.json(),helpers})||new Response('Missing',{status:404});}catch(error){return Response.json({error:error.message},{status:error.status||500});}}};`;
before(async()=>{
 const built=await build({stdin:{contents:wrapper,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
 runtime=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'chat-read-fixture'},log:new Log(LogLevel.NONE),outboundService:async()=>{throw Error('Chat must not send email.');}});
 db=await runtime.getD1Database('DB');
 for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-extensions.sql','schema-chat-read.sql','schema-task-transfers.sql','schema-operational-email.sql'])await db.exec((await readFile(file,'utf8')).replaceAll('\n',' '));
 for(const [id,role,dept] of [['member','employee','Marketing'],['peer','employee','Marketing'],['other','employee','Marketing'],['outsider','employee','Finance'],['founder','founder','Leadership']])await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,0,?)').bind(id,id,id,id,role,role,dept,'2026-01-01','unused','unused',new Date().toISOString()).run();
});
beforeEach(async()=>{await db.exec("DELETE FROM channel_reads; DELETE FROM messages; DELETE FROM work_notification_deliveries; DELETE FROM notifications; DELETE FROM audit_events; UPDATE app_settings SET value='2020-01-01T00:00:00.000Z' WHERE key='chat_unread_enabled_at';");});
after(async()=>{if(runtime)await runtime.dispose();});
async function call(user,method,path,body){const r=await runtime.dispatchFetch('https://chat.test'+path,{method,headers:{'x-test-user':user,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
async function post(user,channel,body,parent_id){const r=await call(user,'POST','/api/channels/'+channel+'/messages',{body,...(parent_id?{parent_id}:{})});assert.equal(r.status,201,JSON.stringify(r));return r.data.message;}
async function unread(user,channel){const r=await call(user,'GET','/api/channels');assert.equal(r.status,200,JSON.stringify(r));return r.data.channels.find(c=>c.id===channel)?.unread_count;}

test('new messages, mentions and replies use persistent per-member unread state without notifications or email',async()=>{
 const parent=await post('member','marketing','Hello @peer @founder');
 const reply=await post('member','marketing','Thread update',parent.id);
 assert.equal(await unread('peer','marketing'),2);assert.equal(await unread('member','marketing'),0);
 assert.equal((await call('peer','GET','/api/channels/marketing/messages')).data.read_cursor_id,reply.id);
 assert.equal(await unread('peer','marketing'),2,'Fetching is not a read acknowledgement');
 assert.equal((await call('peer','POST','/api/channels/marketing/read',{message_id:reply.id})).data.unread_count,0);
 assert.equal(await unread('peer','marketing'),0);assert.equal(await unread('other','marketing'),2);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM notifications').first()).n,0);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_notification_deliveries').first()).n,0);
});
test('read cursors are monotonic and cannot acknowledge a different or restricted channel',async()=>{
 const first=await post('member','marketing','First'),last=await post('member','marketing','Last');
 const general=await post('member','general','General');
 assert.equal((await call('outsider','POST','/api/channels/marketing/read',{message_id:last.id})).status,403);
 assert.equal((await call('peer','POST','/api/channels/marketing/read',{message_id:general.id})).status,400);
 assert.equal((await call('peer','POST','/api/channels/marketing/read',{})).status,400);
 await Promise.all([call('peer','POST','/api/channels/marketing/read',{message_id:last.id}),call('peer','POST','/api/channels/marketing/read',{message_id:first.id})]);
 assert.equal(await unread('peer','marketing'),0);
 assert.equal((await db.prepare("SELECT last_read_message_id FROM channel_reads WHERE user_id='peer' AND channel_id='marketing'").first()).last_read_message_id,last.id);
});
test('insertion cursors keep new same-timestamp messages unread and avoid inventing unread history before rollout',async()=>{
 await db.prepare("UPDATE app_settings SET value='2026-01-01T00:00:00.000Z' WHERE key='chat_unread_enabled_at'").run();
 await db.prepare("INSERT INTO messages(id,channel_id,user_id,body,created_at) VALUES('old','marketing','member','Old history','2025-01-01T00:00:00.000Z')").run();
 assert.equal(await unread('peer','marketing'),0);
 const first=await post('member','marketing','Seen');
 await call('peer','POST','/api/channels/marketing/read',{message_id:first.id});
 await db.prepare("INSERT INTO messages(id,channel_id,user_id,body,created_at) VALUES('000-earlier-lexical-id','marketing','member','Later insertion',?)").bind(first.created_at).run();
 assert.equal(await unread('peer','marketing'),1);
});
test('old thread parents remain available when new replies enter the latest message window',async()=>{
 const root=await post('member','marketing','Old thread parent');
 const statements=[];for(let i=0;i<205;i++)statements.push(db.prepare('INSERT INTO messages(id,channel_id,user_id,body,created_at) VALUES(?,?,?,?,?)').bind('filler-'+i,'marketing','member','Filler '+i,new Date().toISOString()));await db.batch(statements);
 const latest=await post('peer','marketing','New reply to old root',root.id);
 const feed=(await call('member','GET','/api/channels/marketing/messages')).data;
 assert.ok(feed.messages.some(m=>m.id===root.id));assert.equal(feed.read_cursor_id,latest.id);
 assert.equal(feed.messages.find(m=>m.id===root.id).reply_count,1);
 const thread=await call('member','GET','/api/channels/marketing/threads/'+root.id);
 assert.equal(thread.status,200);assert.equal(thread.data.parent.id,root.id);assert.equal(thread.data.total_replies,1);assert.equal(thread.data.replies[0].id,latest.id);
 assert.equal((await call('outsider','GET','/api/channels/marketing/threads/'+root.id)).status,403);
 assert.equal((await call('member','GET','/api/channels/general/threads/'+root.id)).status,404);
 assert.equal((await call('member','POST','/api/channels/general/messages',{body:'Wrong channel',parent_id:root.id})).status,400);
});
