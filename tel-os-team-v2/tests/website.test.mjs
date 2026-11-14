import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,Log,LogLevel} from 'miniflare';

const serviceKey='isolated-team-service-fixture-key';
const baseMembers=[
 {id:'founder-one',name:'Founder One',role:'Founder',quote:'Build thoughtfully.',label:'Leadership',image:'team-images/founder-one.webp',alt:'Founder One, Founder',section:'leadership',order:1,active:true},
 {id:'team-one',name:'Team One',role:'Marketing member',quote:'',label:'Marketing',image:'',alt:'Team One, Marketing member',section:'team',order:2,active:true}
];
const clone=value=>structuredClone(value);
const sha=text=>createHash('sha1').update(Buffer.from(`blob ${Buffer.byteLength(text)}\0`)).update(text).digest('hex');
let proxyTeam={version:1,updatedAt:null,members:clone(baseMembers)},proxyCalls=[],proxyFailure=null,proxyPublishingReady=true;
let proxyRevision=sha(JSON.stringify(proxyTeam));
const setProxy=()=>{proxyTeam={version:1,updatedAt:null,members:clone(baseMembers)};proxyRevision=sha(JSON.stringify(proxyTeam));proxyCalls=[];proxyFailure=null;proxyPublishingReady=true;};
const wrapper=`import {handleWebsite} from './src/website.js';export default {async fetch(request,env){try{const role=request.headers.get('x-test-role')||'employee';const result=await handleWebsite({request,url:new URL(request.url),env,user:{id:role,role},body:request.method==='GET'?{}:await request.json()});return result||new Response('No route',{status:404});}catch(error){return Response.json({error:error.message},{status:error.status||500});}}};`;
const built=await build({stdin:{contents:wrapper,resolveDir:process.cwd(),sourcefile:'website-test.js'},bundle:true,format:'esm',write:false,platform:'browser'});
const quiet=new Log(LogLevel.NONE);
const proxy=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'website-test'},bindings:{TEL_OS_TEAM_KEY:serviceKey},log:quiet,serviceBindings:{WEBSITE_ADMIN:async request=>{
 const body=request.method==='PUT'?await request.json():null;
 proxyCalls.push({method:request.method,url:request.url,key:request.headers.get('x-tel-os-team-key'),role:request.headers.get('x-tel-os-role'),body});
 if(proxyFailure)return Response.json({ok:false,error:proxyFailure.message},{status:proxyFailure.status});
 if(request.method==='PUT'){
  assert.equal(request.headers.get('x-tel-os-team-key'),serviceKey);
  if(body.expectedRevision!==proxyRevision)return Response.json({ok:false,error:'Reload after concurrent change.'},{status:409});
  proxyTeam={version:1,updatedAt:new Date().toISOString(),members:body.members};proxyRevision=sha(JSON.stringify(proxyTeam));
  return Response.json({ok:true,data:proxyTeam,revision:proxyRevision,commit:'fixture-commit',message:'Saved'});
 }
 return Response.json({ok:true,exists:true,data:proxyTeam,revision:proxyRevision,publishingReady:proxyPublishingReady,publishingNote:proxyPublishingReady?null:"Publishing is unavailable. Renew the website GitHub credential before saving Team changes."});
}}});
const db=await proxy.getD1Database('DB');
await db.prepare("CREATE TABLE audit_events(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,entity TEXT,entity_id TEXT,details TEXT,created_at TEXT)").run();
async function proxyApi(role,method='GET',body={}){const response=await proxy.dispatchFetch('https://tel.test/api/website/team',{method,headers:{'x-test-role':role,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};}

const files=new Map();let githubCalls=[],raceOnPut=false,authReadFailure=false;
const teamPath='data/team.json';
function setBridge(){files.clear();files.set(teamPath,JSON.stringify({version:1,updatedAt:null,members:clone(baseMembers)}));githubCalls=[];raceOnPut=false;authReadFailure=false;}
const bridge=new Miniflare({modules:true,scriptPath:'integration/website-admin-worker.js',compatibilityDate:'2026-07-30',log:quiet,bindings:{TEL_OS_TEAM_KEY:serviceKey,SESSION_SECRET:'isolated-session-signing-key',ADMIN_PASSWORD:'isolated-admin-fixture-password',GITHUB_TOKEN:'isolated-github-fixture-token',GITHUB_OWNER:'fixture',GITHUB_REPO:'website',GITHUB_BRANCH:'main',ALLOWED_ORIGIN:'https://website.test'},outboundService:async request=>{
 const url=new URL(request.url);
 if(url.hostname==='raw.githubusercontent.com'){
  assert.equal(request.method,'GET');assert.equal(url.pathname,'/fixture/website/main/data/team.json');assert.ok(!request.headers.has('authorization'));
  githubCalls.push({method:'GET',path:teamPath,authenticated:false,host:url.hostname});
  return files.has(teamPath)?new Response(files.get(teamPath),{headers:{'content-type':'application/json'}}):new Response('Not found',{status:404});
 }
 const marker='/contents/',pos=url.pathname.indexOf(marker);assert.ok(pos>=0,'only expected GitHub content endpoints are called');
 const path=decodeURIComponent(url.pathname.slice(pos+marker.length));githubCalls.push({method:request.method,path,authenticated:request.headers.has("authorization"),host:url.hostname});
 if(request.method==='GET'){
  if(authReadFailure&&request.headers.has('authorization'))return Response.json({message:'Bad credentials'},{status:401});
  if(!files.has(path))return Response.json({message:'Not found'},{status:404});
  const text=files.get(path);return Response.json({type:'file',sha:sha(text),content:Buffer.from(text).toString('base64')});
 }
 const payload=await request.json();
 if(request.method==='PUT'){
  if(raceOnPut&&path===teamPath){raceOnPut=false;const newer=JSON.parse(files.get(teamPath));newer.members[0].quote='Concurrent founder decision';files.set(teamPath,JSON.stringify(newer));}
  const existing=files.get(path);
  if(existing&&payload.sha!==sha(existing))return Response.json({message:'SHA conflict'},{status:409});
  const content=Buffer.from(payload.content,'base64').toString('utf8');files.set(path,content);
  return Response.json({commit:{sha:'fixture-commit'},content:{sha:sha(content)}});
 }
 return Response.json({message:'Unsupported fixture operation'},{status:500});
}});
async function bridgeApi(method,path,body={},headers={}){const response=await bridge.dispatchFetch(`https://admin.test${path}`,{method,headers:{'content-type':'application/json',...headers},...(['GET','DELETE'].includes(method)?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};}
const serviceHeaders=role=>({'X-TEL-OS-Team-Key':serviceKey,'X-TEL-OS-Role':role});
const revision=()=>sha(files.get(teamPath));

test('Website Team proxy and bridge permissions remain scoped',async t=>{
 try{
 await t.test('founder and HR can read the public editor; other roles cannot',async()=>{
  setProxy();for(const role of ['founder','hr_lead','hr_member']){const result=await proxyApi(role);assert.equal(result.status,200);assert.equal(result.data.revision,proxyRevision);}
  const count=proxyCalls.length;for(const role of ['employee','team_lead','finance_head'])assert.equal((await proxyApi(role)).status,403);assert.equal(proxyCalls.length,count);
 });
 await t.test('HR edits normal Team entries and founders edit Leadership',async()=>{
  for(const role of ['hr_lead','hr_member']){setProxy();const members=clone(baseMembers);members[1].role='Marketing specialist';const result=await proxyApi(role,'PUT',{members,expectedRevision:proxyRevision});assert.equal(result.status,200,JSON.stringify(result));assert.equal(proxyCalls.at(-1).role,role);assert.equal(result.data.revision,proxyRevision);}
  setProxy();const members=clone(baseMembers);members[0].quote='Founder-approved change';assert.equal((await proxyApi('founder','PUT',{members,expectedRevision:proxyRevision})).status,200);
 });
 await t.test('HR cannot edit, remove, demote or add Leadership entries',async()=>{
  const changes=[m=>{m[0].quote='Unauthorised edit';},m=>{m.shift();},m=>{m[0].section='team';m[0].role='Former founder';},m=>{m[1].section='leadership';},m=>{m[0].active=false;},m=>{m[0].order=99;}];
  for(const change of changes){setProxy();const members=clone(baseMembers);change(members);const result=await proxyApi('hr_member','PUT',{members,expectedRevision:proxyRevision});assert.equal(result.status,403,JSON.stringify(result));assert.ok(!proxyCalls.some(call=>call.method==='PUT'));}
 });
 await t.test('only public fields reach the website and the service credential is never returned',async()=>{
  setProxy();const members=clone(baseMembers);Object.assign(members[1],{email:'private@example.test',phone:'private',password_hash:'private',salary:1234,employee_id:'internal'});
  const result=await proxyApi('founder','PUT',{members,expectedRevision:proxyRevision});assert.equal(result.status,200);
  assert.deepEqual(Object.keys(proxyCalls.at(-1).body.members[1]).sort(),['id','name','role','quote','label','image','alt','section','order','active'].sort());
  assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes(serviceKey));
 });
 await t.test('proxy enforces actual backend bounds, IDs, relative images and fresh revisions',async()=>{
  const changes=[m=>{m[1].name='x'.repeat(101);},m=>{m[1].role='x'.repeat(161);},m=>{m[1].quote='x'.repeat(401);},m=>{m[1].image='https://images.test/avatar.png';},m=>{m[1].image='../secret.png';},m=>{m[1].id='bad/id';},m=>{m[1].id=m[0].id;},m=>{while(m.length<51)m.push({...m[1],id:`member-${m.length}`});}];
  for(const change of changes){setProxy();const members=clone(baseMembers);change(members);assert.equal((await proxyApi('founder','PUT',{members,expectedRevision:proxyRevision})).status,400);assert.ok(!proxyCalls.some(call=>call.method==='PUT'));}
  setProxy();assert.equal((await proxyApi('founder','PUT',{members:baseMembers})).status,400);assert.equal((await proxyApi('founder','PUT',{members:baseMembers,expectedRevision:'stale'})).status,409);
  proxyFailure={status:503,message:'Upstream unavailable'};assert.equal((await proxyApi('founder')).status,502);
 });
 await t.test('Team service key succeeds only for PUT /api/team with a valid role and revision',async()=>{
  setBridge();const response=await bridgeApi('GET','/api/team');assert.equal(response.status,200);assert.equal(response.data.revision,revision());assert.equal(response.data.publishingReady,true);
  const members=clone(baseMembers);members[1].quote='Shared update';const result=await bridgeApi('PUT','/api/team',{members,expectedRevision:revision()},serviceHeaders('hr_member'));assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.revision,revision());
  for(const [method,path] of [['POST','/api/images'],['DELETE','/api/images?path=team-images/photo.png'],['PUT','/api/site-content'],['POST','/api/site-assets'],['GET','/api/admin/site'],['PUT','/api/admin/site/draft'],['POST','/api/admin/site/publish'],['POST','/api/admin/site/rollback'],['GET','/api/admin/deployment']]){const count=githubCalls.length;assert.equal((await bridgeApi(method,path,{},serviceHeaders('founder'))).status,401,path);assert.equal(githubCalls.length,count,'denied routes do not access GitHub');}
  assert.equal((await bridgeApi('PUT','/api/team',{members,expectedRevision:revision()},{'X-TEL-OS-Team-Key':'wrong','X-TEL-OS-Role':'founder'})).status,401);
  assert.equal((await bridgeApi('PUT','/api/team',{members,expectedRevision:revision()},serviceHeaders('employee'))).status,403);
 });
 await t.test('bridge independently protects Leadership and rejects stale service writes',async()=>{
  const forbidden=[m=>{m[0].section='team';m[0].quote='Demoted and changed';},m=>{m.shift();},m=>{m[1].section='leadership';},m=>{m[0].quote='Unauthorised leader edit';}];
  for(const change of forbidden){setBridge();const members=clone(baseMembers);change(members);assert.equal((await bridgeApi('PUT','/api/team',{members,expectedRevision:revision()},serviceHeaders('hr_lead'))).status,403);assert.ok(!githubCalls.some(call=>call.method==='PUT'));}
  setBridge();const members=clone(baseMembers);assert.equal((await bridgeApi('PUT','/api/team',{members},serviceHeaders('founder'))).status,400);
  const stale=revision();const newer=JSON.parse(files.get(teamPath));newer.members[0].quote='Latest founder text';files.set(teamPath,JSON.stringify(newer));
  const beforePutCount=githubCalls.filter(call=>call.method==='PUT').length;
  assert.equal((await bridgeApi('PUT','/api/team',{members,expectedRevision:stale},serviceHeaders('hr_lead'))).status,409);
  assert.equal(githubCalls.filter(call=>call.method==='PUT').length,beforePutCount,'stale revisions are rejected before any GitHub write');
  assert.equal(JSON.parse(files.get(teamPath)).members[0].quote,'Latest founder text');
 });
 await t.test('a GitHub write race produces conflict and preserves the newer founder edit',async()=>{
  setBridge();raceOnPut=true;const result=await bridgeApi('PUT','/api/team',{members:baseMembers,expectedRevision:revision()},serviceHeaders('hr_member'));assert.equal(result.status,409,JSON.stringify(result));assert.equal(JSON.parse(files.get(teamPath)).members[0].quote,'Concurrent founder decision');
 });
 await t.test('invalid GitHub credentials permit only an honest public Team read fallback',async()=>{
  setBridge();authReadFailure=true;
  const result=await bridgeApi('GET','/api/team');assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.publishingReady,false);assert.match(result.data.publishingNote,/renew.*GitHub credential/i);assert.equal(result.data.revision,revision());
  assert.deepEqual(githubCalls.map(call=>[call.host,call.path,call.authenticated]),[['api.github.com',teamPath,true],['raw.githubusercontent.com',teamPath,false]]);
  githubCalls=[];const other=await bridgeApi('GET','/api/site-content');assert.equal(other.status,502);assert.equal(githubCalls.length,1);assert.equal(githubCalls[0].authenticated,true,'other admin reads never retry without Authorization');
  githubCalls=[];const save=await bridgeApi('PUT','/api/team',{members:baseMembers,expectedRevision:revision()},serviceHeaders('founder'));assert.equal(save.status,503,JSON.stringify(save));assert.match(save.data.error,/renew.*GitHub credential/i);assert.ok(githubCalls.every(call=>call.method==='GET'&&call.authenticated),'publishing never writes or retries anonymously');
 });
 await t.test('raw Team fallback computes the real Git blob SHA from exact UTF-8 bytes',async()=>{
  setBridge();authReadFailure=true;files.set(teamPath,'{"version":1,"members":[],"note":"café 🚀"}\n');
  const result=await bridgeApi('GET','/api/team');assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.revision,'5a63eeca57a24a96b8dc63fe5d648b6eff1abc2d');assert.equal(result.data.data.note,'café 🚀');assert.equal(result.data.publishingReady,false);
  assert.equal(githubCalls.at(-1).host,'raw.githubusercontent.com');
 });
 await t.test('proxy preserves unavailable publishing status and prevents a save attempt',async()=>{
  setProxy();proxyPublishingReady=false;const current=await proxyApi('founder');assert.equal(current.status,200);assert.equal(current.data.publishingReady,false);assert.match(current.data.publishingNote,/renew.*GitHub credential/i);
  const result=await proxyApi('founder','PUT',{members:baseMembers,expectedRevision:proxyRevision});assert.equal(result.status,503);assert.match(result.data.error,/renew.*GitHub credential/i);assert.ok(!proxyCalls.some(call=>call.method==='PUT'));
 });
 await t.test('legacy full-admin bearer saves still work without a revision',async()=>{
  setBridge();const login=await bridgeApi('POST','/api/login',{password:'isolated-admin-fixture-password'});assert.equal(login.status,200);const result=await bridgeApi('PUT','/api/team',{members:baseMembers},{Authorization:`Bearer ${login.data.token}`});assert.equal(result.status,200,JSON.stringify(result));
 });
 }finally{await Promise.all([proxy.dispose(),bridge.dispose()]);}
});
