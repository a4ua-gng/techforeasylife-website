import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {sha} from '../src/core.js';

// Guide completion is independent from formal policy acknowledgement.
// These tests exercise the full authenticated Worker and a real D1 binding.
let mf,db;
const origin='https://guide.test';
before(async()=>{
 const binaries={};
 for(const [file,type] of [['tel-logo.webp','image/webp'],['fonts/dm-sans.woff','font/woff'],['fonts/sora.woff','font/woff']])binaries['/'+file]={base64:(await readFile('public/'+file)).toString('base64'),type};
 const result=await build({entryPoints:['src/worker.js'],bundle:true,format:'esm',platform:'browser',write:false,define:{__HTML__:JSON.stringify('<html>guide test</html>'),__CSS__:JSON.stringify(''),__APP__:JSON.stringify(''),__BINARY_ASSETS__:JSON.stringify(binaries)}});
 mf=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:{DB:'guide-test'}});
 db=await mf.getD1Database('DB');
 for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql'])await db.exec((await readFile(file,'utf8')).replaceAll('\n',' '));
 for(const uid of ['member','other']){await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,0,?)').bind(uid,uid,uid,uid,'Team Member','employee','Marketing','2026-01-01','fixture-hash','fixture-salt',new Date().toISOString()).run();await db.prepare('INSERT INTO onboarding(user_id) VALUES(?)').bind(uid).run();}
});
after(async()=>{if(mf)await mf.dispose();});
async function call(path,{user,method='GET',body}={}){const headers={};if(user){const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');await db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(await sha(token),user,new Date().toISOString(),new Date(Date.now()+3600000).toISOString()).run();headers.Cookie='__Host-tel_session='+token;}if(method!=='GET'){headers.Origin=origin;headers['Content-Type']='application/json';}const response=await mf.dispatchFetch(origin+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});return {response,status:response.status,data:(response.headers.get('content-type')||'').includes('json')?await response.json():null};}

test('guide completion belongs to the signed-in member and preserves policy acknowledgement',async()=>{
 let result=await call('/api/people/member',{user:'member'});assert.equal(result.status,200);assert.equal(result.data.onboarding.guide_completed_at,null);assert.equal(result.data.onboarding.policy_acknowledged_at,null);
 result=await call('/api/onboarding/guide',{user:'member',method:'POST',body:{user_id:'other'}});assert.equal(result.status,200);
 const own=await call('/api/people/member',{user:'member'}),other=await call('/api/people/other',{user:'other'});assert.ok(own.data.onboarding.guide_completed_at);assert.equal(own.data.onboarding.policy_acknowledged_at,null);assert.equal(own.data.onboarding.stage,'policy_orientation');assert.equal(other.data.onboarding.guide_completed_at,null);
 const completed=own.data.onboarding.guide_completed_at;await call('/api/onboarding/guide',{user:'member',method:'POST',body:{}});assert.equal((await call('/api/people/member',{user:'member'})).data.onboarding.guide_completed_at,completed);
});
test('guide completion requires authentication and same-origin requests',async()=>{
 assert.equal((await call('/api/onboarding/guide',{method:'POST',body:{}})).status,401);
 const response=await mf.dispatchFetch(origin+'/api/onboarding/guide',{method:'POST',headers:{Origin:'https://untrusted.test','Content-Type':'application/json'},body:'{}'});assert.equal(response.status,403);
 assert.equal((await call('/api/people/other',{user:'member'})).status,403);
});
test('official logo and local fonts are served intact with correct media types',async()=>{
 for(const [path,type] of [['/tel-logo.webp','image/webp'],['/fonts/dm-sans.woff','font/woff'],['/fonts/sora.woff','font/woff']]){const response=await mf.dispatchFetch(origin+path);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),type);assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile('public'+path));}
 const response=await mf.dispatchFetch(origin+'/tel-logo.webp',{method:'HEAD'});assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,0);
});
