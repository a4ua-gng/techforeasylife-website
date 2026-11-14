import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.TEL_QA_ORIGIN||'http://127.0.0.1:4173';
if(!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))throw new Error('Browser fixtures must run against a local preview only.');
const credentials=JSON.parse(await readFile(process.env.TEL_QA_CREDENTIALS||'.private-credentials.json','utf8'));
const secrets=credentials.map(x=>x.password);
const sanitize=s=>secrets.reduce((v,p)=>v.replaceAll(p,'[redacted]'),String(s));
const marker=Date.now().toString(36),title='QA formal delivery '+marker,privateReason='PRIVATE_QA_REASON_'+marker;
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[],checks=[],actors=[];
await mkdir('tests/artifacts',{recursive:true});
async function ready(page){await page.waitForFunction(()=>document.querySelector('#main h1')&&!document.querySelector('#main .loading-message'));assert.equal(await page.locator('.error-page').count(),0,'A route displayed its error state');}
async function route(page,name){await page.goto(origin+'/#'+name);await page.reload();await ready(page);}
async function response(page,path,action){const response=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()!=='GET');await action();const r=await response;assert.ok(r.ok(),sanitize(await r.text()));return r;}
async function actor(username,{validateMismatch=false}={}){
 const record=credentials.find(x=>x.username===username);assert.ok(record,'Missing local fixture account');
 const personal='QA!'+username+'LocalOnly2026';secrets.push(personal);
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();actors.push({context,page});
 page.on('pageerror',e=>errors.push({type:'javascript',message:sanitize(e.message)}));page.on('response',r=>{if(r.status()>=500)errors.push({type:'server',url:r.url(),status:r.status()});});
 await page.goto(origin);await page.locator('#login-form').waitFor();
 await page.locator('#login-form [name=username]').fill(username);await page.locator('#login-form [name=password]').fill(record.password);
 let pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login');await page.locator('#login-form [type=submit]').click();let login=await pending;
 if(login.status()===401){await page.locator('#login-form button[type=submit]:not(:disabled)').waitFor();await page.locator('#login-form [name=password]').fill(personal);pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login');await page.locator('#login-form [type=submit]').click();login=await pending;}
 assert.ok(login.ok(),sanitize(await login.text()));
 await page.waitForFunction(()=>document.querySelector('#modal-form [name=new_password]')||document.querySelector('.workspace'));
 if(await page.locator('#modal-form [name=new_password]').count()){
  await page.locator('#modal-form [name=current_password]').fill(record.password);await page.locator('#modal-form [name=new_password]').fill(personal);await page.locator('#modal-form [name=confirm_password]').fill(validateMismatch?'DoesNotMatch!2026':personal);
  if(validateMismatch){await page.locator('#modal-form [type=submit]').click();await page.locator('#modal-form .form-error').filter({hasText:'do not match'}).waitFor();checks.push('Password confirmation mismatch retains an inline error');await page.locator('#modal-form [name=confirm_password]').fill(personal);}
  await response(page,'/api/auth/password',()=>page.locator('#modal-form [type=submit]').click());await page.locator('dialog').waitFor({state:'hidden'});
 }
 await ready(page);checks.push(username+': individual sign-in with required initial password gate');return {page,context,record};
}
async function api(context,path,method='GET',body){const r=await context.request.fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{data:body})});assert.ok(r.ok(),sanitize(await r.text()));return r.json();}
async function submit(page,path){return response(page,path,()=>page.locator('#modal-form [type=submit]').click());}
try{
 const founder=await actor('devangi',{validateMismatch:true});
 const people=(await api(founder.context,'/api/people')).people,uid=name=>people.find(x=>x.username===name).id;
 for(const r of ['home','tasks','attendance','leave','calendar','people','meetings','documents','grievances','hr','reports','performance','exits','notifications','account','channel/general','channel/founders']){await route(founder.page,r);assert.ok((await founder.page.locator('#main').innerText()).trim());}
 checks.push('All 17 founder workspace routes render without page errors');
 await route(founder.page,'tasks');await founder.page.locator('[data-action=new-task]').click();
 await founder.page.locator('#modal-form [type=submit]').click();assert.equal(await founder.page.locator('#modal-form').evaluate(f=>f.checkValidity()),false);checks.push('Required assignment fields block empty submission');
 for(const [name,value]of Object.entries({title,description:'Local browser QA assignment with a formal review.',deadline:new Date(Date.now()+2*86400000).toISOString().slice(0,10),expected_deliverable:'A written update with an evidence link.'}))await founder.page.locator('#modal-form [name='+name+']').fill(value);
 await founder.page.locator('#modal-form [name=assignee_id]').selectOption(uid('kalpa'));await founder.page.locator('#modal-form [name=leader_id]').selectOption(uid('tani'));await submit(founder.page,'/api/tasks');await founder.page.locator('dialog').waitFor({state:'hidden'});
 const task=(await api(founder.context,'/api/tasks')).tasks.find(x=>x.title===title);assert.ok(task);checks.push('Founder assigns real task to Kalpa with Tani as reviewer');
 const employee=await actor('kalpa');await route(employee.page,'tasks');await employee.page.locator('[data-action=task-details][data-id="'+task.id+'"]').click();await response(employee.page,'/api/tasks/'+task.id,()=>employee.page.locator('[data-action=task-action][data-value=start]').click());await employee.page.locator('dialog').waitFor({state:'hidden'});
 await employee.page.locator('[data-action=task-details][data-id="'+task.id+'"]').click();await employee.page.locator('[data-action=task-submit]').click();await employee.page.locator('#modal-form [name=submission]').fill('Local QA deliverable: https://example.com/evidence');await submit(employee.page,'/api/tasks/'+task.id);await employee.page.locator('dialog').waitFor({state:'hidden'});
 assert.equal((await api(employee.context,'/api/tasks')).tasks.find(x=>x.id===task.id).status,'review');checks.push('Employee formally submits deliverable into review');
 await route(founder.page,'tasks');await founder.page.locator('[data-action=task-details][data-id="'+task.id+'"]').click();assert.match(await founder.page.locator('dialog').innerText(),/Local QA deliverable/);await response(founder.page,'/api/tasks/'+task.id,()=>founder.page.locator('[data-action=task-action][data-value=approve]').click());
 await route(employee.page,'tasks');await employee.page.locator('[data-action=task-details][data-id="'+task.id+'"]').click();await response(employee.page,'/api/tasks/'+task.id,()=>employee.page.locator('[data-action=task-action][data-value=complete]').click());assert.equal((await api(employee.context,'/api/tasks')).tasks.find(x=>x.id===task.id).status,'done');checks.push('Independent founder review precedes employee completion');
 await route(employee.page,'attendance');for(const action of ['clock_in','pause','resume','clock_out']){await response(employee.page,'/api/attendance',()=>employee.page.locator('[data-action=clock][data-value='+action+']').click());await employee.page.locator('[data-action=clock]').first().waitFor();}assert.equal((await api(employee.context,'/api/attendance')).current,null);checks.push('Attendance clock in, pause, resume, and clock out');
 await route(employee.page,'leave');await employee.page.locator('[data-action=new-leave]').click();const prior=(await api(employee.context,'/api/leaves')).leaves;let dateOffset=3,leaveDate;do{leaveDate=new Date(Date.now()+dateOffset++*86400000).toISOString().slice(0,10);}while(prior.some(l=>l.status!=='rejected'&&l.start_date<=leaveDate&&l.end_date>=leaveDate));
 for(const[name,value]of Object.entries({start_date:leaveDate,end_date:leaveDate,reason:privateReason,handover_notes:'Public QA task handover only'}))await employee.page.locator('#modal-form [name='+name+']').fill(value);
 await employee.page.locator('#modal-form [name=handover_to]').selectOption(uid('jidan'));await submit(employee.page,'/api/leaves');await employee.page.locator('dialog').waitFor({state:'hidden'});const leave=(await api(employee.context,'/api/leaves')).leaves.find(x=>x.reason===privateReason);assert.ok(leave);
 const leader=await actor('tani');await route(leader.page,'leave');await leader.page.locator('[data-action=leave-review][data-value=recommend][data-id="'+leave.id+'"]').click();await leader.page.locator('#modal-form [name=note]').fill('Work handover reviewed.');await submit(leader.page,'/api/leaves/'+leave.id);await leader.page.locator('dialog').waitFor({state:'hidden'});
 const hr=await actor('humaira');await route(hr.page,'leave');await hr.page.locator('[data-action=leave-review][data-value=approve][data-id="'+leave.id+'"]').click();await hr.page.locator('#modal-form [name=note]').fill('Official leave record verified.');await submit(hr.page,'/api/leaves/'+leave.id);await hr.page.locator('dialog').waitFor({state:'hidden'});checks.push('Leader recommendation and independent HR approval update leave');
 const observer=await actor('binit');await route(observer.page,'calendar');const calendar=await api(observer.context,'/api/calendar');assert.ok(calendar.calendar.leaves.some(x=>x.id===leave.id));assert.ok(!JSON.stringify(calendar).includes(privateReason));assert.ok(!(await observer.page.locator('#main').innerText()).includes(privateReason));checks.push('Shared calendar shows approved leave and hides private reasons');
 await route(founder.page,'channel/general');await founder.page.locator('#message-form [name=body]').fill('Local QA channel update '+marker);await response(founder.page,'/api/channels/general/messages',()=>founder.page.locator('#message-form [type=submit]').click());await founder.page.getByText('Local QA channel update '+marker,{exact:true}).waitFor();const message=(await api(founder.context,'/api/channels/general/messages')).messages.find(x=>x.body==='Local QA channel update '+marker);await founder.page.locator('[data-action=open-thread][data-id="'+message.id+'"]').click();await founder.page.locator('#thread-form [name=body]').fill('Threaded QA follow-up.');await response(founder.page,'/api/channels/general/messages',()=>founder.page.locator('#thread-form [type=submit]').click());await founder.page.getByText('Threaded QA follow-up.',{exact:true}).waitFor();await founder.page.locator('[data-action=close-dialog]').click();checks.push('Team channel supports persisted messages and threaded replies');
 await route(founder.page,'home');await founder.page.screenshot({path:'tests/artifacts/desktop-home.png',fullPage:true});
 await observer.page.setViewportSize({width:375,height:812});for(const r of ['home','tasks','calendar','people','channel/general','account']){await route(observer.page,r);const bounds=await observer.page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth}));assert.ok(bounds.page<=bounds.viewport,'Horizontal page overflow on mobile '+r+': '+JSON.stringify(bounds));}
 await route(observer.page,'home');await observer.page.screenshot({path:'tests/artifacts/mobile-home.png',fullPage:true});await observer.page.locator('[data-action=toggle-menu].menu-btn').click();assert.ok(await observer.page.locator('.sidebar.open').count());checks.push('375px mobile routes fit the page and navigation drawer opens');
 assert.deepEqual(errors,[]);checks.push('No browser JavaScript errors or HTTP 500 responses');
 await writeFile('tests/artifacts/browser-report.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,count:checks.length,checks},null,2));
}catch(error){await writeFile('tests/artifacts/browser-report.json',JSON.stringify({passed:false,checks,errors,error:sanitize(error.stack)},null,2));console.error(sanitize(error.stack));process.exitCode=1;}
finally{await browser.close();}
