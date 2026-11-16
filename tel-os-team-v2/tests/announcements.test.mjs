import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

let runtime,db;
const entry=`import {handleAnnouncements} from './src/announcements.js';
export default {async fetch(request,env){try{const url=new URL(request.url),user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(request.headers.get('x-test-user')||'').first(),body=request.method==='GET'?{}:await request.json();return await handleAnnouncements({request,url,env,user,body})||Response.json({error:'Missing'},{status:404});}catch(error){return Response.json({error:error.message},{status:error.status||500});}}};`;

before(async()=>{
 const result=await build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false});
 runtime=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'announcements-tests'}});
 db=await runtime.getD1Database('DB');
 for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-extensions.sql','schema-announcements.sql'])await db.exec((await readFile(file,'utf8')).replaceAll('\n',' '));
 // Apply the migration twice, as local and deployed upgrades are idempotent.
 await db.exec((await readFile('schema-announcements.sql','utf8')).replaceAll('\n',' '));
 const stamp=new Date().toISOString();
 for(const [id,role,department,status,mustChange] of [
  ['founder','founder','Leadership','active',0],['hr','hr_lead','HR','active',0],['hrmember','hr_member','HR','active',0],
  ['lead','team_lead','Marketing','active',0],['member','employee','Marketing','active',0],['peer','employee','Marketing','active',0],
  ['finance','finance_head','Finance','active',0],['strategy','employee','Strategy','active',0],
  ['onleave','employee','Marketing','on_leave',0],['suspended','employee','Marketing','suspended',0],['exited','employee','Marketing','exited',0],['temporary','employee','Marketing','active',1]
 ])await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,joined_on,status,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,id,id,'Fixture '+id,role,role,department,'2026-01-01',status,'fixture','salt',mustChange,stamp).run();
});
after(async()=>runtime&&await runtime.dispose());
beforeEach(async()=>{
 await db.exec('DELETE FROM announcement_dismissals;DELETE FROM announcements;DELETE FROM audit_events;DELETE FROM notifications;DELETE FROM messages;DELETE FROM email_deliveries;DELETE FROM work_notification_deliveries;DELETE FROM meeting_deliveries;DELETE FROM tel_hourly_email_event_receipts;');
});

async function call(who,path,method='GET',body={}){
 const response=await runtime.dispatchFetch('https://announcements.test'+path,{method,headers:{'x-test-user':who,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});
 return {status:response.status,data:await response.json(),headers:response.headers};
}
async function create(who='founder',data={}){
 const result=await call(who,'/api/announcements','POST',{title:'Synthetic announcement',body:'Synthetic staff update for local tests only.',audience:'Company',status:'published',...data});
 assert.equal(result.status,201,JSON.stringify(result));return result.data.announcement;
}
const detail=(who,item)=>call(who,'/api/announcements/'+item.id);
const edit=(who,item,data={})=>call(who,'/api/announcements/'+item.id,'PATCH',{revision:item.revision,...data});
const dismiss=(who,item,data={})=>call(who,'/api/announcements/'+item.id+'/dismiss','POST',{revision:item.revision,...data});
const ids=result=>result.data.announcements.map(item=>item.id).sort();

test('only founders and HR publish; HR can manage Company and HR while founders manage every canonical department',async()=>{
 for(const who of ['member','lead','finance','strategy']){
  assert.equal((await call(who,'/api/announcements','POST',{title:'Synthetic',body:'Fixture only',audience:'Company'})).status,403,who);
  assert.equal((await call(who,'/api/announcements?manage=1')).status,403,who);
 }
 for(const who of ['hr','hrmember']){
  for(const audience of ['Company','HR'])assert.equal((await create(who,{audience})).created_by,who);
  for(const audience of ['Leadership','Marketing','Finance','Strategy'])assert.equal((await call(who,'/api/announcements','POST',{title:'Synthetic',body:'Fixture only',audience})).status,403,who+' '+audience);
 }
 for(const audience of ['Leadership','Marketing','Finance','Strategy'])await create('founder',{audience});
 const hrView=await call('hr','/api/announcements?manage=1');assert.equal(hrView.status,200);assert.ok(hrView.data.announcements.every(item=>['Company','HR'].includes(item.audience)));
 assert.equal(hrView.data.can_manage,true);assert.deepEqual(hrView.data.audiences,['Company','HR']);
 const founderView=await call('founder','/api/announcements?manage=1');assert.equal(founderView.data.announcements.length,8);
 assert.deepEqual(new Set(founderView.data.audiences),new Set(['Company','Leadership','HR','Marketing','Finance','Strategy']));
});

test('department drafts, private bodies and archived records never reach unrelated staff or HR',async()=>{
 const company=await create('hr'),marketing=await create('founder',{title:'Synthetic TeMark update',body:'MARKETING_PRIVATE_FIXTURE',audience:'Marketing'}),finance=await create('founder',{body:'FINANCE_PRIVATE_FIXTURE',audience:'Finance'}),hr=await create('hrmember',{body:'HR_PRIVATE_FIXTURE',audience:'HR'});
 const draft=await create('founder',{body:'DRAFT_PRIVATE_FIXTURE',audience:'Company',status:'draft'}),toArchive=await create('founder',{body:'ARCHIVED_PRIVATE_FIXTURE',audience:'Company'});
 const archiveResult=await edit('founder',toArchive,{status:'archived'});assert.equal(archiveResult.status,200);const archived=archiveResult.data.announcement;
 assert.deepEqual(ids(await call('member','/api/announcements')),[company.id,marketing.id].sort());
 assert.deepEqual(ids(await call('finance','/api/announcements')),[company.id,finance.id].sort());
 assert.deepEqual(ids(await call('hr','/api/announcements')),[company.id,hr.id].sort());
 assert.deepEqual(ids(await call('founder','/api/announcements')),[company.id,marketing.id,finance.id,hr.id].sort());
 for(const [who,item] of [['member',finance],['finance',marketing],['member',hr],['hr',marketing],['member',draft],['member',archived]]){
  const result=await detail(who,item);assert.equal(result.status,404,who+' '+item.id);assert.ok(!JSON.stringify(result.data).includes(item.body));
  assert.equal((await dismiss(who,item)).status,404);
 }
 assert.equal((await detail('hr',draft)).status,200);assert.equal((await detail('founder',marketing)).status,200);
 assert.equal((await edit('hr',marketing,{body:'attempted overwrite'})).status,404);
 assert.equal((await edit('hr',company,{audience:'Finance'})).status,403);
 assert.equal((await edit('member',company,{body:'attempted overwrite'})).status,403);
 assert.equal((await detail('member',marketing)).data.announcement.audience,'Marketing');
});

test('dismissal is persisted per person and revision; a published edit reappears without losing history',async()=>{
 const item=await create();
 assert.equal((await call('member','/api/announcements')).data.announcements[0].dismissed,false);
 assert.equal((await dismiss('member',item)).status,200);assert.equal((await dismiss('member',item)).status,200);
 assert.equal((await call('member','/api/announcements')).data.announcements[0].dismissed,true);
 assert.equal((await call('peer','/api/announcements')).data.announcements[0].dismissed,false);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM announcement_dismissals').first()).n,1);
 const updated=await edit('hr',item,{body:'Synthetic revised staff update.'});assert.equal(updated.status,200,JSON.stringify(updated));const revision=updated.data.announcement;
 assert.equal(revision.revision,item.revision+1);assert.equal(revision.created_by,'founder');assert.equal(revision.updated_by,'hr');assert.equal(revision.creator_name,'Fixture founder');assert.equal(revision.published_at,item.published_at);
 assert.equal((await call('member','/api/announcements')).data.announcements[0].dismissed,false);
 assert.equal((await dismiss('member',item)).status,409);
 assert.equal((await dismiss('member',revision)).status,200);
 // Each person stores their latest dismissed revision; a new revision replaces that receipt.
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM announcement_dismissals').first()).n,1);
 assert.equal((await db.prepare('SELECT revision FROM announcement_dismissals WHERE announcement_id=? AND user_id=?').bind(item.id,'member').first()).revision,revision.revision);
 assert.equal((await call('peer','/api/announcements')).data.announcements[0].dismissed,false);
 assert.equal((await dismiss('peer',revision)).status,200);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM announcement_dismissals').first()).n,2);
 assert.equal((await detail('member',revision)).data.announcement.dismissed,true);
});

test('optimistic revisions prevent two editors from silently overwriting; unchanged saves stay dismissed',async()=>{
 const item=await create();await dismiss('member',item);
 const unchanged=await edit('founder',item,{title:item.title,body:item.body,audience:item.audience,status:item.status,expires_at:null});assert.equal(unchanged.status,200,JSON.stringify(unchanged));assert.equal(unchanged.data.unchanged,true);assert.equal(unchanged.data.announcement.revision,item.revision);
 assert.equal((await call('member','/api/announcements')).data.announcements[0].dismissed,true);
 const outcomes=await Promise.all([edit('hr',item,{body:'Synthetic editor one'}),edit('founder',item,{body:'Synthetic editor two'})]);
 assert.deepEqual(outcomes.map(result=>result.status).sort(),[200,409]);
 const stored=(await detail('founder',item)).data.announcement;assert.equal(stored.revision,item.revision+1);assert.ok(['Synthetic editor one','Synthetic editor two'].includes(stored.body));
 assert.equal((await edit('founder',item,{title:'Stale edit'})).status,409);
 for(const revision of [undefined,null,0,-1,'1',1.5]){
  const result=await call('founder','/api/announcements/'+item.id,'PATCH',{revision,title:'Invalid edit'});assert.equal(result.status,400,JSON.stringify({revision,result}));
 }
 const archived=await edit('founder',stored,{status:'archived'});assert.equal(archived.status,200);assert.deepEqual(ids(await call('member','/api/announcements')),[]);assert.equal((await dismiss('member',archived.data.announcement)).status,404);
});

test('expiry removes popups and active feeds while targeted published history remains available',async()=>{
 const item=await create('founder',{audience:'Marketing',expires_at:new Date(Date.now()+3600000).toISOString()});
 assert.deepEqual(ids(await call('onleave','/api/announcements')),[item.id]);
 await db.prepare('UPDATE announcements SET expires_at=? WHERE id=?').bind(new Date(Date.now()-1000).toISOString(),item.id).run();
 assert.deepEqual(ids(await call('member','/api/announcements')),[]);assert.deepEqual(ids(await call('member','/api/announcements?history=1')),[item.id]);
 assert.deepEqual(ids(await call('finance','/api/announcements?history=1')),[]);assert.equal((await dismiss('member',item)).status,404);
 const past=new Date(Date.now()-3600000).toISOString();assert.equal((await call('founder','/api/announcements','POST',{title:'Synthetic',body:'Fixture',audience:'Company',expires_at:past})).status,400);
 assert.equal((await edit('founder',item,{expires_at:past})).status,400);
 const renewed=await edit('founder',item,{expires_at:new Date(Date.now()+3600000).toISOString()});assert.equal(renewed.status,200);assert.deepEqual(ids(await call('member','/api/announcements')),[item.id]);
});

test('validation rejects malformed input and canonical audience aliases; HTML stays inert plain text',async()=>{
 const valid={title:'Synthetic announcement',body:'Synthetic body',audience:'Company'};
 for(const invalid of [{title:''},{title:'x'.repeat(161)},{title:'Line\nbreak'},{title:'Control\u0000character'},{body:''},{body:null},{body:'x'.repeat(10001)},{body:'Control\u0000character'},{audience:'TeMark'},{audience:'marketing'},{audience:'Unknown'},{status:'scheduled'},{status:'archived'},{expires_at:'tomorrow'},{expires_at:'2026-99-99T00:00:00Z'}]){
  const result=await call('founder','/api/announcements','POST',{...valid,...invalid});assert.equal(result.status,400,JSON.stringify(invalid));
 }
 const literal='<script>globalThis.ANNOUNCEMENT_XSS=1</script><img src=x onerror=alert(1)>',created=await create('hr',{title:'<b>Synthetic title</b>',body:literal,created_by:'member',updated_by:'member',creator_name:'forged',revision:900,created_at:'1900-01-01'});
 assert.equal(created.created_by,'hr');assert.equal(created.updated_by,'hr');assert.equal(created.creator_name,'Fixture hr');assert.equal(created.revision,1);assert.ok(Date.parse(created.created_at)>Date.parse('2026-01-01'));
 const read=await detail('member',created);assert.equal(read.status,200);assert.equal(read.data.announcement.body,literal);assert.equal(read.data.announcement.title,'<b>Synthetic title</b>');assert.match(read.headers.get('content-type'),/^application\/json/);assert.match(read.headers.get('cache-control'),/no-store/);
 for(const path of ['/api/announcements/not-a-real-id','/api/announcements/%27%20OR%201=1--','/api/announcements/%3Cscript%3E'])assert.equal((await call('member',path)).status,404,path);
});

test('authentication and account gates cover every endpoint',async()=>{
 const item=await create();
 for(const who of ['','temporary','suspended','exited'])for(const [path,method,body] of [
  ['/api/announcements','GET',{}],['/api/announcements?manage=1','GET',{}],['/api/announcements/'+item.id,'GET',{}],
  ['/api/announcements','POST',{title:'Synthetic',body:'Fixture',audience:'Company'}],['/api/announcements/'+item.id,'PATCH',{revision:item.revision,title:'Synthetic changed'}],['/api/announcements/'+item.id+'/dismiss','POST',{revision:item.revision}]
 ])assert.equal((await call(who,path,method,body)).status,who?403:401,who+' '+method+' '+path);
 assert.equal((await detail('onleave',item)).status,200);assert.equal((await dismiss('onleave',item)).status,200);
 assert.equal((await call('founder','/api/announcements/'+item.id,'DELETE',{})).status,405);
});

test('publishing, editing, dismissing and archiving create no chat notices or external delivery jobs',async()=>{
 const item=await create('hr');await dismiss('member',item);const updated=await edit('founder',item,{body:'Synthetic revision'});await edit('hr',updated.data.announcement,{status:'archived'});
 for(const table of ['notifications','messages','email_deliveries','work_notification_deliveries','meeting_deliveries','tel_hourly_email_event_receipts'])assert.equal((await db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0,table);
});
