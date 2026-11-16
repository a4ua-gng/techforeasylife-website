import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,Log,LogLevel} from 'miniflare';

const wrapper=`import {handleAdmin} from './src/admin.js';import {handleCollaboration} from './src/collaboration.js';import {handleExtensions} from './src/extensions.js';import {handleMedia} from './src/media.js';import {handleFounderUpdates,queueFounderUpdates} from './src/founder-updates.js';import {helpers} from './src/core.js';export default {async fetch(request,env){try{const url=new URL(request.url),user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(request.headers.get('x-test-user')||'author').first();if(!user)return Response.json({error:'Sign in'},{status:401});if(url.pathname==='/test/founder-queue')return Response.json(await queueFounderUpdates(env));const body=request.headers.get('content-type')?.includes('application/json')?await request.json():{};const ctx={request,url,env,user,body,helpers};for(const handler of [handleCollaboration,handleExtensions,handleMedia,handleFounderUpdates,handleAdmin]){const response=await handler(ctx);if(response)return response;}return Response.json({error:'Missing'},{status:404});}catch(e){return Response.json({error:e.message},{status:e.status||500});}}};`;

test('private HR routing enforces explicit recipients across D1 reads, chat, review, images and founder metadata',async t=>{
 const compiled=await build({stdin:{contents:wrapper,sourcefile:'grievance-test.js',resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
 const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'grievance-routing-disposable'},log:new Log(LogLevel.NONE),outboundService:async()=>{throw Error('No external requests in privacy tests.');}});
 const db=await mf.getD1Database('DB'),stamp=new Date().toISOString();
 try{
  const priority=['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql','schema-chat-read.sql','schema-task-transfers.sql','schema-operational-email.sql','schema-urgent-email.sql'];
  const schemas=[...priority,...(await readdir('.')).filter(name=>/^schema-.*\.sql$/.test(name)&&!priority.includes(name)).sort()];
  for(const schema of schemas)await db.exec((await readFile(schema,'utf8')).replace(/^\s*--.*$/gm,'').replaceAll('\n',' '));
  for(const [id,role,status] of [['author','employee','active'],['founder-a','founder','active'],['founder-b','founder','active'],['hr','hr_lead','active'],['hr-member','hr_member','active'],['peer','employee','active'],['lead','team_lead','active'],['unavailable','founder','suspended']])await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,joined_on,status,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(id,id,id,'Test '+id,role,role,role==='founder'?'Leadership':'Marketing','2026-01-01',status,'fixture','fixture',stamp).run();
  async function api(actor,method,path,body){const headers={'x-test-user':actor};let payload;if(body instanceof FormData){const encoded=new Request('https://privacy.test',{method:'POST',body});headers['Content-Type']=encoded.headers.get('content-type');payload=await encoded.arrayBuffer();}else if(body){headers['Content-Type']='application/json';payload=JSON.stringify(body);}const response=await mf.dispatchFetch('https://privacy.test'+path,{method,headers,...(payload?{body:payload}:{})});const raw=await response.text();return {status:response.status,text:raw,data:raw&&response.headers.get('content-type')?.includes('json')?JSON.parse(raw):null};}
  async function create(actor,selection){const result=await api(actor,'POST','/api/grievances',{title:'SECRET_SUBJECT',body:'SECRET_BODY',...selection});assert.equal(result.status,201,result.text);return result.data.grievance;}
  const list=async actor=>(await api(actor,'GET','/api/grievances')).data.grievances;
  let privateTicket,hrTicket,bothTicket,imageId;
  await t.test('missing, forged, unavailable and empty choices write no ticket',async()=>{
   const invalid=[{}, {founder_only:true}, {hr_visible:'false',founder_ids:['founder-a']}, {hr_visible:false,founder_ids:[]}, {hr_visible:false,founder_ids:['peer']}, {hr_visible:false,founder_ids:['missing']}, {hr_visible:false,founder_ids:['unavailable']}, {hr_visible:false,founder_ids:['founder-a','founder-a']}, {hr_visible:false,founder_ids:['founder-a'],founder_only:false}, {hr_visible:true,founder_ids:'founder-a'}];
   for(const selection of invalid)assert.equal((await api('author','POST','/api/grievances',{title:'Subject',body:'Body',...selection})).status,400,JSON.stringify(selection));
   assert.equal((await db.prepare('SELECT COUNT(*) n FROM grievances').first()).n,0);
   assert.equal((await api('founder-a','POST','/api/grievances',{title:'Own',body:'Body',hr_visible:false,founder_ids:['founder-a']})).status,400);
   const roster=await api('author','GET','/api/grievances/reviewers');assert.deepEqual(roster.data.founders.map(row=>row.id),['founder-a','founder-b']);assert.equal(roster.data.hr_available,true);
  });
  await t.test('founder-only selection excludes the other founder, HR and peers; client cannot forge owner',async()=>{
   privateTicket=await create('author',{hr_visible:false,founder_ids:['founder-a'],user_id:'founder-b',reviewed_by:'founder-b'});
   assert.equal(privateTicket.user_id,'author');assert.equal(privateTicket.reviewed_by,null);assert.deepEqual(privateTicket.visibility.founder_ids,['founder-a']);
   assert.deepEqual((await list('author')).map(row=>row.id),[privateTicket.id]);assert.deepEqual((await list('founder-a')).map(row=>row.id),[privateTicket.id]);
   for(const actor of ['founder-b','hr','hr-member','peer','lead']){assert.deepEqual(await list(actor),[]);assert.equal((await api(actor,'GET',`/api/grievances/${privateTicket.id}/comments`)).status,403);assert.equal((await api(actor,'POST',`/api/grievances/${privateTicket.id}/comments`,{body:'Forbidden'})).status,403);assert.equal((await api(actor,'PATCH',`/api/grievances/${privateTicket.id}`,{status:'resolved',response:'Forbidden'})).status,403);}
   const notices=(await db.prepare('SELECT user_id,title,body FROM notifications').all()).results;assert.deepEqual(notices.map(row=>row.user_id),['founder-a']);assert.ok(notices.every(row=>!JSON.stringify(row).includes('SECRET')));
  });
  await t.test('HR-only and mixed selections stay independent, and replies notify only their participants',async()=>{
   hrTicket=await create('author',{hr_visible:true,founder_ids:[]});bothTicket=await create('author',{hr_visible:true,founder_ids:['founder-b']});
   assert.deepEqual((await list('founder-a')).map(row=>row.id),[privateTicket.id]);assert.deepEqual((await list('founder-b')).map(row=>row.id),[bothTicket.id]);
   for(const actor of ['hr','hr-member'])assert.deepEqual(new Set((await list(actor)).map(row=>row.id)),new Set([hrTicket.id,bothTicket.id]));
   assert.equal((await api('author','POST',`/api/grievances/${privateTicket.id}/comments`,{body:'SECRET_CHAT',user_id:'founder-b'})).status,200);
   assert.equal((await api('founder-a','POST',`/api/grievances/${privateTicket.id}/comments`,{body:'SECRET_REPLY'})).status,200);
   const comments=await api('author','GET',`/api/grievances/${privateTicket.id}/comments`);assert.equal(comments.data.comments.length,2);assert.deepEqual(comments.data.comments.map(row=>row.name),['Test author','Test founder-a']);
   const leaked=(await db.prepare("SELECT * FROM notifications WHERE user_id='founder-b' AND title='HR ticket reply'").all()).results;assert.equal(leaked.length,0);
   assert.ok((await db.prepare('SELECT title,body FROM notifications').all()).results.every(row=>!JSON.stringify(row).includes('SECRET')));
  });
  await t.test('image create, list, download and HEAD share the exact ticket ACL',async()=>{
   const form=()=>{const value=new FormData();value.append('context_type','grievance');value.append('context_id',privateTicket.id);value.append('file',new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4])],{type:'image/png'}),'PRIVATE_IMAGE.png');return value;};
   const uploaded=await api('author','POST','/api/uploads',form());assert.equal(uploaded.status,201,uploaded.text);imageId=uploaded.data.upload.id;
   for(const actor of ['author','founder-a']){assert.equal((await api(actor,'GET','/api/uploads/'+imageId)).status,200);assert.equal((await api(actor,'HEAD','/api/uploads/'+imageId)).status,200);assert.equal((await api(actor,'GET',`/api/uploads?type=grievance&id=${privateTicket.id}`)).data.uploads.length,1);}
   for(const actor of ['founder-b','hr','peer'])for(const [method,path,body] of [['GET','/api/uploads/'+imageId],['HEAD','/api/uploads/'+imageId],['GET',`/api/uploads?type=grievance&id=${privateTicket.id}`],['POST','/api/uploads',form()]])assert.equal((await api(actor,method,path,body)).status,403,actor+' '+method+' '+path);
  });
  await t.test('review needs another authorised reviewer and detects stale or concurrent updates',async()=>{
   assert.equal((await api('author','PATCH','/api/grievances/'+privateTicket.id,{status:'resolved',response:'Own review'})).status,403);
   assert.equal((await api('founder-a','PATCH','/api/grievances/'+privateTicket.id,{status:'resolved',response:'',expected_updated_at:privateTicket.updated_at})).status,400);
   const responses=await Promise.all([api('founder-a','PATCH','/api/grievances/'+privateTicket.id,{status:'in_review',response:'First review',expected_updated_at:privateTicket.updated_at}),api('founder-a','PATCH','/api/grievances/'+privateTicket.id,{status:'in_review',response:'Concurrent review',expected_updated_at:privateTicket.updated_at})]);
   assert.deepEqual(responses.map(row=>row.status).sort(),[200,409]);
   assert.equal((await api('founder-a','PATCH','/api/grievances/'+privateTicket.id,{status:'resolved',response:'Done',founder_ids:['founder-b']})).status,400);
   const row=(await list('founder-a')).find(ticket=>ticket.id===privateTicket.id);assert.equal((await api('founder-a','PATCH','/api/grievances/'+privateTicket.id,{status:'resolved',response:'Done',expected_updated_at:row.updated_at})).status,200);
   assert.equal((await api('founder-a','PATCH','/api/grievances/'+privateTicket.id,{status:'in_review'})).status,409);
  });
  await t.test('legacy records retain their original founder/HR visibility without backfilling recipients',async()=>{
   for(const founderOnly of [0,1])await db.prepare('INSERT INTO grievances(id,user_id,title,body,founder_only,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind('legacy-'+founderOnly,'author','Legacy','Legacy body',founderOnly,stamp,stamp).run();
   for(const actor of ['founder-a','founder-b'])assert.equal((await list(actor)).filter(row=>row.id.startsWith('legacy')).length,2);
   assert.deepEqual((await list('hr')).filter(row=>row.id.startsWith('legacy')).map(row=>row.id),['legacy-0']);assert.equal((await list('peer')).length,0);
   assert.equal((await db.prepare("SELECT COUNT(*) n FROM grievance_access WHERE ticket_id LIKE 'legacy-%'").first()).n,0);
  });
  await t.test('current founder role/status revoke access immediately, and new founders gain no explicit tickets',async()=>{
   await db.prepare("UPDATE users SET role='employee' WHERE id='founder-a'").run();
   assert.equal((await api('founder-a','GET','/api/grievances/'+privateTicket.id+'/comments')).status,403);assert.equal((await api('founder-a','GET','/api/uploads/'+imageId)).status,403);
   assert.ok(!(await list('founder-a')).some(row=>row.id===privateTicket.id));
   await db.prepare("UPDATE users SET role='founder' WHERE id='peer'").run();assert.ok(!(await list('peer')).some(row=>row.id===privateTicket.id));
   await db.prepare("UPDATE users SET role='founder',status='exited' WHERE id='founder-a'").run();assert.equal((await api('founder-a','HEAD','/api/uploads/'+imageId)).status,403);
   await db.prepare("UPDATE users SET role='founder',status='active' WHERE id='founder-a'").run();await db.prepare("UPDATE users SET role='employee' WHERE id='peer'").run();
  });
  await t.test('founder summaries and audit fanout reveal no private actor, image, delivery or unselected count',async()=>{
   await db.prepare("INSERT INTO app_settings(key,value) VALUES('work_notifications_enabled_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind('2020-01-01T00:00:00.000Z').run();
   await db.prepare("INSERT INTO notifications(id,user_id,title,body,link,created_at) VALUES('PRIVATE_NOTICE','founder-a','Private HR update','Generic only','grievances',?)").bind(stamp).run();
   const notice={id:'PRIVATE_NOTICE',user_id:'founder-a'};
   await db.prepare("INSERT INTO work_notification_deliveries(id,notification_id,user_id,channel,category,status,created_at) VALUES('PRIVATE_RECEIPT',?,?,'email','Private HR update','blocked',?)").bind(notice.id,notice.user_id,stamp).run();
   const a=await api('founder-a','GET','/api/founder-updates'),b=await api('founder-b','GET','/api/founder-updates');
   assert.equal(a.status,200,a.text);assert.equal(b.status,200,b.text);assert.equal(a.data.summary.hr_tickets_open,2);assert.equal(b.data.summary.hr_tickets_open,3);
   for(const result of [a,b]){assert.ok(!result.text.includes('SECRET'));assert.ok(!result.text.includes('PRIVATE_RECEIPT'));assert.equal(result.data.summary.work_delivery_issues,0);assert.ok(!result.data.updates.some(row=>row.id.startsWith('audit:')));assert.ok(!result.data.updates.some(row=>row.link==='grievances'));}
   const queue=await api('founder-a','POST','/test/founder-queue',{});assert.equal(queue.data.notifications,0);assert.equal((await db.prepare("SELECT COUNT(*) n FROM notifications WHERE link='founder-updates'").first()).n,0);
  });
  await t.test('global audit and reports hide private ticket actors and IDs from selected and unselected founders and HR',async()=>{
   await db.prepare("INSERT INTO audit_events(id,actor_id,action,entity,entity_id,created_at) VALUES('PUBLIC_WORK_EVENT','peer','task.start','task','public-task',?)").bind(stamp).run();
   for(const actor of ['founder-a','founder-b']){
    const audit=await api(actor,'GET','/api/audit');assert.equal(audit.status,200);assert.deepEqual(audit.data.events.map(row=>row.id),['PUBLIC_WORK_EVENT']);assert.ok(!audit.text.includes(privateTicket.id));
    const reports=await api(actor,'GET','/api/reports');assert.equal(reports.status,200);assert.deepEqual(reports.data.summary.recent_activity.map(row=>row.action),['task.start']);assert.ok(!reports.text.includes('confidential_concern'));assert.ok(!reports.text.includes('hr_ticket_reply'));
   }
   assert.equal((await api('hr','GET','/api/audit')).status,403);assert.deepEqual((await api('hr','GET','/api/reports')).data.summary.recent_activity,[]);
   await db.prepare("DELETE FROM audit_events WHERE id='PUBLIC_WORK_EVENT'").run();
  });
  await t.test('a full ticket list uses bounded metadata queries',async()=>{
   for(let offset=0;offset<110;offset+=25){const statements=[];for(let i=offset;i<Math.min(offset+25,110);i++){const ticketId='bulk-private-'+i;statements.push(db.prepare('INSERT INTO grievances(id,user_id,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(ticketId,'author','Bulk fixture','Fixture only',stamp,stamp),db.prepare('INSERT INTO grievance_access(ticket_id,hr_visible,selected_by,selected_at) VALUES(?,1,?,?)').bind(ticketId,'author',stamp));}await db.batch(statements);}
   const tickets=await list('author');assert.ok(tickets.length>100);assert.ok(tickets.every(ticket=>ticket.visibility.owner.name==='Test author'));
   assert.equal((await list('hr')).filter(ticket=>ticket.id.startsWith('bulk-private')).length,110);
  });
  await t.test('absence of ACL migration fails new writes closed while legacy reads remain usable',async()=>{
   await db.exec('DROP TABLE grievance_founder_recipients;');
   assert.equal((await api('founder-a','GET','/api/grievances/'+privateTicket.id+'/comments')).status,403);
   assert.equal((await api('author','GET','/api/grievances/'+privateTicket.id+'/comments')).status,200);
   assert.equal((await api('author','POST','/api/grievances',{title:'New',body:'Body',hr_visible:true,founder_ids:[]})).status,503);
   await db.exec('DROP TABLE grievance_access;');
   assert.equal((await api('author','POST','/api/grievances',{title:'New',body:'Body',hr_visible:true,founder_ids:[]})).status,503);
   assert.ok((await list('hr')).some(row=>row.id==='legacy-0'));
  });
 }finally{await mf.dispose();}
});
