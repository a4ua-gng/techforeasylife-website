import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,Log,LogLevel} from 'miniflare';

let runtime,db;
const requests=[];
let providerMode='accepted',providerDelay=0;
const stamp=new Date().toISOString(),sender='techforeasylife.operations@gmail.com';
const wrapper=`import {queueWorkDeliveries,queuePendingWorkDeliveries,deliverWorkWhatsApp} from './src/work-deliveries.js';
 export default {async fetch(request,env){const body=await request.json(),config=body.configured===false?{...env,WHATSAPP_WORK_TEMPLATE_NAME:''}:env;let result;if(body.action==='queue')result=await queueWorkDeliveries(config,body.notification);else if(body.action==='backfill')result=await queuePendingWorkDeliveries(config);else result=await deliverWorkWhatsApp(config);return Response.json(result);}};`;
before(async()=>{
 const built=await build({stdin:{contents:wrapper,resolveDir:process.cwd(),sourcefile:'work-deliveries-test.js'},bundle:true,write:false,format:'esm',platform:'browser'});
 runtime=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'work-delivery-tests'},log:new Log(LogLevel.NONE),bindings:{WHATSAPP_TOKEN:'isolated-provider-fixture-token',WHATSAPP_PHONE_NUMBER_ID:'fixture-number',WHATSAPP_WORK_TEMPLATE_NAME:'tel_work_update'},outboundService:async request=>{
  const url=new URL(request.url);assert.equal(url.hostname,'graph.facebook.com');assert.equal(url.pathname,'/v23.0/fixture-number/messages');assert.equal(request.method,'POST');
  const body=await request.json();requests.push(body);if(providerDelay)await new Promise(resolve=>setTimeout(resolve,providerDelay));
  if(providerMode==='rejected')return Response.json({error:{message:'fixture-provider-error-private'}},{status:400});
  if(providerMode==='unconfirmed')return Response.json({ok:true});
  return Response.json({messages:[{id:'wamid.fixture-confirmed-'+requests.length}]});
 }});
 db=await runtime.getD1Database('DB');
 for(const sql of [
  'CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT,role TEXT)',
  'CREATE TABLE notifications(id TEXT PRIMARY KEY,user_id TEXT,title TEXT,body TEXT,link TEXT,created_at TEXT)',
  'CREATE TABLE member_connections(user_id TEXT,provider TEXT,account TEXT,status TEXT,PRIMARY KEY(user_id,provider))',
  'CREATE TABLE integration_status(provider TEXT PRIMARY KEY,status TEXT,account_label TEXT)',
  'CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT)',
  'CREATE TABLE work_notification_deliveries(id TEXT PRIMARY KEY,notification_id TEXT,user_id TEXT,channel TEXT,category TEXT,status TEXT,recipient TEXT,provider_id TEXT,error TEXT,created_at TEXT,sent_at TEXT,UNIQUE(notification_id,user_id,channel))'
 ])await db.prepare(sql).run();
 await db.prepare("INSERT INTO users VALUES('member','active','employee'),('inactive','suspended','employee'),('founder','active','founder')").run();
 await db.prepare("INSERT INTO app_settings VALUES('work_notifications_enabled_at',?)").bind(new Date(Date.parse(stamp)-1000).toISOString()).run();
 await db.prepare("INSERT INTO integration_status VALUES('gmail','active_chatgpt_job',?)").bind(sender).run();
});
after(async()=>{if(runtime)await runtime.dispose();});
async function call(action,extra={}){const response=await runtime.dispatchFetch('https://work.test/internal-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});assert.equal(response.status,200,await response.clone().text());return response.json();}
async function notification(id,link='tasks',user='member',time=stamp){await db.prepare('INSERT INTO notifications VALUES(?,?,?,?,?,?)').bind(id,user,'Private customer title','Private complaint/address/medical details',link,time).run();return {id,user_id:user};}
async function connection(provider,status='verified',account=provider==='gmail'?'member@example.test':'+919123456789'){
 await db.prepare('INSERT INTO member_connections VALUES(?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET account=excluded.account,status=excluded.status').bind('member',provider,account,status).run();
}
async function deliveries(id){return (await db.prepare('SELECT * FROM work_notification_deliveries WHERE notification_id=? ORDER BY channel').bind(id).all()).results;}

test('work queue blocks unverified providers and excludes private message contents',async()=>{
 const n=await notification('unverified');assert.equal((await call('queue',{notification:{...n,title:'Forged title',body:'Forged body',link:'grievances'}})).inserted,2);
 const rows=await deliveries(n.id);assert.ok(rows.every(row=>row.status==='blocked'&&row.recipient===''));assert.ok(rows.every(row=>row.category==='Task update'));
 assert.ok(!JSON.stringify(rows).includes('Private customer'));assert.ok(!JSON.stringify(rows).includes('medical'));assert.ok(!JSON.stringify(rows).includes('Forged'));
 assert.equal((await call('queue',{notification:n})).inserted,0);assert.equal((await deliveries(n.id)).length,2);
});
test('only verified recipient accounts and the exact Operations sender can queue Gmail work',async()=>{
 await connection('gmail');await connection('whatsapp');
 let n=await notification('verified');await call('queue',{notification:n});let rows=await deliveries(n.id);assert.ok(rows.every(row=>row.status==='queued'));assert.equal(rows.find(row=>row.channel==='email').recipient,'member@example.test');
 await db.prepare("UPDATE integration_status SET account_label='techforeasylife.sales@gmail.com' WHERE provider='gmail'").run();
 n=await notification('wrong-sender');await call('queue',{notification:n});rows=await deliveries(n.id);assert.equal(rows.find(row=>row.channel==='email').status,'blocked');assert.match(rows.find(row=>row.channel==='email').error,/Operations Gmail/);
 await db.prepare("UPDATE integration_status SET account_label=?,status='paused_sender_connection' WHERE provider='gmail'").bind(sender).run();
 n=await notification('paused-sender');await call('queue',{notification:n});assert.equal((await deliveries(n.id)).find(row=>row.channel==='email').status,'blocked');
 await db.prepare("UPDATE integration_status SET status='active_chatgpt_job' WHERE provider='gmail'").run();
});
test('backfill ignores pre-activation backlog, unsupported routes, meetings and forged notification ownership',async()=>{
 const old=await notification('before-activation','tasks','member','2020-01-01T00:00:00.000Z');
 const meeting=await notification('meeting','meetings'),external=await notification('external','https://example.test/tasks'),badChannel=await notification('bad-channel','channel/general?private=1');
 const fresh=await notification('fresh-channel','#channel/general');
 const suspended=await notification('suspended','tasks','inactive');
 await call('queue',{notification:{id:fresh.id,user_id:'inactive'}});assert.equal((await deliveries(fresh.id)).length,0);
 await call('backfill');for(const n of [old,meeting,external,badChannel,suspended])assert.equal((await deliveries(n.id)).length,0);
 assert.ok((await deliveries(fresh.id)).every(row=>row.category==='New work message'));
 assert.equal((await call('backfill')).inserted,0);
});
test('a missing WhatsApp work template leaves verified accounts blocked rather than faking readiness',async()=>{
 const n=await notification('missing-template');await call('queue',{notification:n,configured:false});const row=(await deliveries(n.id)).find(row=>row.channel==='whatsapp');assert.equal(row.status,'blocked');assert.equal(row.recipient,'+919123456789');assert.match(row.error,/work template is not configured/);
});
test('founder overview work alerts are categorised without granting employees founder delivery',async()=>{
 const founder=await notification('founder-overview','founder-updates','founder'),employee=await notification('employee-overview','founder-updates');
 await call('queue',{notification:founder});await call('queue',{notification:employee});assert.ok((await deliveries(founder.id)).every(row=>row.category==='Company overview'));assert.equal((await deliveries(founder.id)).length,2);assert.equal((await deliveries(employee.id)).length,0);
});
test('all supported employee workflow routes use safe fixed categories',async()=>{
 const expected={leave:'Time off update',calendar:'Work calendar update',reports:'Work report',performance:'Feedback update',exits:'Private HR update',documents:'Document update',hr:'Private HR update',account:'Account update',home:'Workspace update',notifications:'Work update',people:'Team update',guide:'Getting started update',images:'Image update','website-team':'Website team update'};
 for(const [route,category] of Object.entries(expected)){const n=await notification('route-'+route,'#'+route);await call('queue',{notification:n});const rows=await deliveries(n.id);assert.equal(rows.length,2);assert.ok(rows.every(row=>row.category===category));assert.ok(!JSON.stringify(rows).includes('Private complaint/address/medical'));}
});
test('WhatsApp requires provider setup and a current verified active member; disconnect does not send',async()=>{
 await db.prepare("UPDATE work_notification_deliveries SET status='accepted'").run();
 const n=await notification('disconnect','grievances');await call('queue',{notification:n});const count=requests.length;
 assert.equal((await call('deliver',{configured:false})).configured,false);assert.equal(requests.length,count);
 await connection('whatsapp','disconnected');assert.equal((await call('deliver')).accepted,0);assert.equal(requests.length,count);
 await connection('whatsapp','verified');await db.prepare("UPDATE users SET status='suspended' WHERE id='member'").run();assert.equal((await call('deliver')).accepted,0);assert.equal(requests.length,count);
 await db.prepare("UPDATE users SET status='active' WHERE id='member'").run();
});
test('confirmed WhatsApp work messages contain only fixed category and safe TEL OS link and never duplicate',async()=>{
 const before=requests.length;providerMode='accepted';providerDelay=30;
 const results=await Promise.all([call('deliver'),call('deliver')]);providerDelay=0;assert.equal(results.reduce((sum,result)=>sum+result.accepted,0),1);assert.equal(requests.length-before,1);
 const payload=requests.at(-1);assert.equal(payload.template.name,'tel_work_update');assert.equal(payload.to,'919123456789');assert.deepEqual(payload.template.components[0].parameters,[{type:'text',text:'Private HR update'},{type:'text',text:'https://tel-os-team-v2.xtremedivyangshu.workers.dev/#grievances'}]);
 assert.ok(!JSON.stringify(payload).includes('Private complaint'));const row=(await deliveries('disconnect')).find(row=>row.channel==='whatsapp');assert.equal(row.status,'accepted');assert.ok(row.provider_id.startsWith('wamid.'));assert.ok(row.sent_at);assert.equal(row.error,'');assert.equal((await call('deliver')).accepted,0);
});
test('delivery rechecks the current verified account instead of a stale queued contact',async()=>{
 const n=await notification('reconnected-number');await call('queue',{notification:n});assert.equal((await deliveries(n.id)).find(row=>row.channel==='whatsapp').recipient,'+919123456789');
 await connection('whatsapp','verified','+919234567890');assert.equal((await call('deliver')).accepted,1);assert.equal(requests.at(-1).to,'919234567890');assert.equal((await deliveries(n.id)).find(row=>row.channel==='whatsapp').recipient,'+919234567890');await connection('whatsapp');
});
test('rejected or unconfirmed sends need review and are never automatically retried',async()=>{
 for(const mode of ['rejected','unconfirmed']){providerMode=mode;const n=await notification('failure-'+mode,'attendance');await call('queue',{notification:n});const before=requests.length;const result=await call('deliver');assert.equal(result.accepted,0);assert.equal(result.needs_review,1);assert.equal(requests.length-before,1);const row=(await deliveries(n.id)).find(row=>row.channel==='whatsapp');assert.equal(row.status,'needs_review');assert.ok(!row.provider_id);assert.ok(!row.sent_at);assert.ok(!row.error.includes('fixture-provider-error-private'));await call('deliver');assert.equal(requests.length-before,1);}
 providerMode='accepted';
});
test('backfill remains bounded and deduplicated for a large batch',async()=>{
 const statements=[];for(let i=0;i<65;i++)statements.push(db.prepare('INSERT INTO notifications VALUES(?,?,?,?,?,?)').bind('bulk-'+String(i).padStart(3,'0'),'member','Ignored private title','Ignored private body','tasks',stamp));await db.batch(statements);
 const first=await call('backfill');assert.equal(first.inserted,100);const second=await call('backfill');assert.equal(second.inserted,30);assert.equal((await call('backfill')).inserted,0);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM work_notification_deliveries WHERE notification_id LIKE 'bulk-%'").first()).n,130);
});
