import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {day} from '../src/core.js';

// Collaboration-module integration tests run in workerd with a real local D1 binding.
// Authentication is covered by auth-admin.test.mjs; this wrapper selects synthetic actors.
const wrapper=`import {handleCollaboration} from '../src/collaboration.js';
import {helpers} from '../src/core.js';
export default {async fetch(request,env){
 const url=new URL(request.url);
 const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(request.headers.get('x-test-user')).first();
 if(!user)return Response.json({error:'Unknown test actor'},{status:401});
 try{
  const response=await handleCollaboration({request,url,env,user,body:request.method==='GET'?{}:await request.json(),helpers});
  return response||Response.json({error:'Missing route'},{status:404});
 }catch(error){return Response.json({error:error.message},{status:error.status||500});}
}};`;
const compiled=await build({stdin:{contents:wrapper,resolveDir:new URL('.',import.meta.url).pathname,sourcefile:'collaboration-entry.js'},bundle:true,format:'esm',write:false,platform:'browser'});
const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'collaboration-test'}});
const db=await mf.getD1Database('DB');
const fixtures=[['founder','founder','Leadership'],['founder2','founder','Leadership'],['hr','hr_lead','HR'],['hrmember','hr_member','HR'],['lead','team_lead','Marketing'],['member','employee','Marketing'],['member2','employee','Marketing'],['finance','finance_head','Finance']];
async function api(actor,method,path,body={}){
 const response=await mf.dispatchFetch('https://tel.test'+path,{method,headers:{'x-test-user':actor,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});
 return {status:response.status,data:await response.json()};
}
async function ok(actor,method,path,body={}){const result=await api(actor,method,path,body);assert.ok(result.status<300,JSON.stringify(result));return result.data;}
async function denied(actor,method,path,body,status){const result=await api(actor,method,path,body);assert.equal(result.status,status,JSON.stringify(result));}
const feedback={user_id:'member',period:day().slice(0,7),quality:'Good',timeliness:'On time',communication:'Clear',initiative:'Helpful',reliability:'Consistent',collaboration:'Supportive',summary:'Keep developing'};

test('TEL collaboration integration in the Workers runtime',async t=>{
 try{
  for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql']){
   const sql=await readFile(new URL('../'+file,import.meta.url),'utf8');
   for(const part of sql.split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(part).run();
  }
  for(const [id,role,department] of fixtures)await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,joined_on,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,id,id,'Fixture '+id,role,role,department,day(),'fixture-hash','fixture-salt',new Date().toISOString()).run();

  await t.test('channels enforce department boundaries and official posting authority',async()=>{
   const channels=(await ok('member','GET','/api/channels')).channels;
   assert.deepEqual(channels.map(c=>c.id).sort(),['announcements','general','marketing','marketing-reports']);
   await denied('member','GET','/api/channels/finance/messages',{},403);
   await denied('member','POST','/api/channels/announcements/messages',{body:'Impersonated announcement'},403);
   await denied('lead','POST','/api/channels',{name:'finance-leak',department:'Finance'},403);
   await ok('hr','POST','/api/channels/announcements/messages',{body:'Team update'});
  });

  await t.test('threads stay in their channel and mentions/replies notify authorised recipients',async()=>{
   const message=(await ok('member','POST','/api/channels/marketing/messages',{body:'Hello @lead @finance'})).message;
   assert.equal((await db.prepare("SELECT count(*) n FROM notifications WHERE user_id='lead'").first()).n,2);
   // Finance receives the company announcement, but cannot receive a marketing mention.
   assert.equal((await db.prepare("SELECT count(*) n FROM notifications WHERE user_id='finance'").first()).n,1);
   await ok('lead','POST','/api/channels/marketing/messages',{body:'Reply',parent_id:message.id});
   await denied('member','POST','/api/channels/general/messages',{body:'Cross-channel reply',parent_id:message.id},400);
   assert.equal((await ok('member','GET','/api/channels/marketing/messages')).messages.length,2);
  });

  await t.test('meetings reject unsafe links, protect departmental records and validate attendance',async()=>{
   await denied('member','POST','/api/meetings',{title:'Bad',purpose:'Bad',starts_at:new Date().toISOString()},403);
   await denied('lead','POST','/api/meetings',{title:'Bad URL',purpose:'Review',starts_at:new Date().toISOString(),call_url:'javascript:alert(1)'},400);
   const meeting=(await ok('lead','POST','/api/meetings',{title:'Review campaign',purpose:'Design review',starts_at:new Date().toISOString(),department:'Marketing',participants:['member']})).meeting;
   assert.ok(meeting.participants.includes('lead'));
   assert.equal((await ok('finance','GET','/api/meetings')).meetings.length,0);
   await denied('member','PATCH','/api/meetings/'+meeting.id,{decisions:'Unauthorized'},403);
   await denied('lead','PATCH','/api/meetings/'+meeting.id,{attended:['finance']},400);
   const updated=await ok('lead','PATCH','/api/meetings/'+meeting.id,{decisions:'Approved layout',follow_ups:'Member produces final artwork',attended:['member','lead']});
   assert.deepEqual(updated.meeting.attended,['member','lead']);
  });

  await t.test('documents are scoped to their intended department',async()=>{
   await ok('hr','POST','/api/documents',{title:'Company policy',body:'Policy draft',department:'Company'});
   await ok('lead','POST','/api/documents',{title:'Campaign SOP',body:'Restricted brief',department:'Marketing'});
   assert.equal((await ok('finance','GET','/api/documents')).documents.length,1);
   assert.equal((await ok('member','GET','/api/documents')).documents.length,2);
  });

  await t.test('founder-only concerns remain private and require independent review',async()=>{
   const concern=(await ok('member','POST','/api/grievances',{title:'Sensitive concern',body:'PRIVATE-FIXTURE-BODY',founder_only:true})).grievance;
   for(const actor of ['hr','hrmember','member2'])assert.equal((await ok(actor,'GET','/api/grievances')).grievances.length,0);
   await denied('hr','PATCH','/api/grievances/'+concern.id,{status:'resolved',response:'Unauthorized'},403);
   await ok('founder','PATCH','/api/grievances/'+concern.id,{status:'in_review',response:'Received'});
   await ok('founder','PATCH','/api/grievances/'+concern.id,{status:'resolved',response:'Reviewed and resolved'});
   await denied('founder','PATCH','/api/grievances/'+concern.id,{status:'resolved',response:'Duplicate'},409);
   const own=(await ok('founder','POST','/api/grievances',{title:'Founder concern',body:'Independent review needed',founder_only:true})).grievance;
   await denied('founder','PATCH','/api/grievances/'+own.id,{status:'resolved',response:'Self approval'},403);
   await ok('founder2','PATCH','/api/grievances/'+own.id,{status:'resolved',response:'Independent founder reviewed'});
   const audits=await db.prepare('SELECT details FROM audit_events').all();
   assert.ok(!JSON.stringify(audits.results).includes('PRIVATE-FIXTURE-BODY'));
  });

  await t.test('monthly qualitative feedback is visible to its subject and authorised reviewers',async()=>{
   await ok('lead','POST','/api/performance',feedback);
   assert.equal((await ok('member','GET','/api/performance')).reviews.length,1);
   assert.equal((await ok('member2','GET','/api/performance')).reviews.length,0);
   await denied('lead','POST','/api/performance',{...feedback,user_id:'finance'},403);
   await denied('lead','POST','/api/performance',{...feedback,user_id:'lead'},403);
   await denied('lead','POST','/api/performance',feedback,409);
  });

  await t.test('exit requests require review and disclose records only to the employee and authorised HR',async()=>{
   const exit=(await ok('member','POST','/api/exits',{proposed_end:day(),handover_plan:'Transfer open work to the team lead'})).exit;
   await denied('member','PATCH','/api/exits/'+exit.id,{action:'approve',comment:'Self approval'},403);
   await ok('hr','PATCH','/api/exits/'+exit.id,{action:'approve',comment:'Handover reviewed; final access change by founder'});
   assert.equal((await ok('member','GET','/api/exits')).exits[0].status,'approved');
   assert.equal((await ok('member2','GET','/api/exits')).exits.length,0);
   await denied('hr','PATCH','/api/exits/'+exit.id,{action:'approve',comment:'Repeat'},409);
  });

  await t.test('duplicate channel, review and exit races return conflicts instead of server errors',async()=>{
   const channelResults=await Promise.all([1,2].map(()=>api('founder','POST','/api/channels',{name:'race-channel',department:'Company'})));
   assert.deepEqual(channelResults.map(r=>r.status).sort(),[201,409]);
   const reviewResults=await Promise.all([1,2].map(()=>api('hr','POST','/api/performance',{...feedback,user_id:'member2'})));
   assert.deepEqual(reviewResults.map(r=>r.status).sort(),[201,409]);
   const exitResults=await Promise.all([1,2].map(()=>api('member2','POST','/api/exits',{proposed_end:day(),handover_plan:'Fixture handover plan'})));
   assert.deepEqual(exitResults.map(r=>r.status).sort(),[201,409]);
  });
 }finally{await mf.dispose();}
});
