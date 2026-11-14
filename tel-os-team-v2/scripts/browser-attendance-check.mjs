import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin=process.env.TEL_QA_ORIGIN||'http://127.0.0.1:4173';
if(!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))throw Error('Update QA may only run on a local preview.');
const credentials=JSON.parse(await readFile(process.env.TEL_QA_CREDENTIALS||'.private-credentials.json','utf8'));
const secrets=credentials.map(x=>x.password),checks=[],errors=[],assets=[];
const sanitize=value=>secrets.reduce((s,p)=>s.replaceAll(p,'[redacted]'),String(value));
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
await mkdir('tests/artifacts',{recursive:true});
const marker=Date.now().toString(36);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const nextDay=()=>new Date(Date.parse(today()+'T12:00:00Z')+86400000).toISOString().slice(0,10);
async function ready(page){await page.waitForFunction(()=>document.querySelector('#main h1')&&!document.querySelector('#main .loading-message'));assert.equal(await page.locator('.error-page').count(),0,'A view showed its error state');}
async function route(page,name){await page.goto(origin+'/#'+name);await page.reload();await ready(page);}
async function mutate(page,path,fn){const pending=page.waitForResponse(r=>new URL(r.url()).pathname===path&&!['GET','HEAD'].includes(r.request().method()));await fn();const r=await pending;assert.ok(r.ok(),sanitize(await r.text()));return r.json();}
async function api(context,path,method='GET',body,expected=200){const r=await context.request.fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{data:body})});assert.equal(r.status(),expected,sanitize(await r.text()));return r.json();}
async function actor(username){
 const record=credentials.find(r=>r.username===username);assert.ok(record,'Local fixture account missing');const personal='QA!'+username+'LocalOnly2026';secrets.push(personal);
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(sanitize(e.stack)));page.on('response',r=>{if(r.status()>=500)errors.push(r.status()+' '+r.url());if(/tel-logo|\/fonts\//.test(r.url()))assets.push({url:new URL(r.url()).pathname,status:r.status()});});
 await page.goto(origin);await page.locator('#login-form').waitFor();
 await page.locator('#login-form [name=username]').fill(username);await page.locator('#login-form [name=password]').fill(record.password);
 let pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login');await page.locator('#login-form [type=submit]').click();let login=await pending;
 if(login.status()===401){await page.locator('#login-form [type=submit]:not(:disabled)').waitFor();await page.locator('#login-form [name=password]').fill(personal);pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login');await page.locator('#login-form [type=submit]').click();login=await pending;}
 assert.ok(login.ok(),sanitize(await login.text()));
 await page.waitForFunction(()=>document.querySelector('.workspace')||document.querySelector('#modal-form [name=new_password]'));
 if(await page.locator('#modal-form [name=new_password]').count()){for(const [name,value] of Object.entries({current_password:record.password,new_password:personal,confirm_password:personal}))await page.locator('#modal-form [name='+name+']').fill(value);await mutate(page,'/api/auth/password',()=>page.locator('#modal-form [type=submit]').click());await page.locator('dialog').waitFor({state:'hidden'});}
 await ready(page);return {page,context,user:(await api(context,'/api/me')).user};
}
try{
 const employee=await actor('jidan');
 const existing=await api(employee.context,'/api/attendance');if(existing.current)await api(employee.context,'/api/attendance','POST',{action:'clock_out'});
 await route(employee.page,'attendance');
 await mutate(employee.page,'/api/attendance',()=>employee.page.locator('[data-action=clock][data-value=clock_in]').click());
 const timer=employee.page.locator('[data-clock]');
 assert.equal(await timer.count(),1);const start=await timer.innerText();await employee.page.waitForTimeout(2200);assert.notEqual(await timer.innerText(),start,'Active seconds must visibly tick');
 console.log((await employee.page.locator('.clock-panel').innerText()).replace(/[^a-zA-Z0-9 :\n]/g,''));
 await employee.page.waitForTimeout(2200);
 await mutate(employee.page,'/api/attendance',()=>employee.page.locator('[data-action=clock][data-value=pause]').click());
 await employee.page.locator('[data-action=clock][data-value=resume]').waitFor();const paused=await timer.innerText();await employee.page.waitForTimeout(2100);assert.equal(await timer.innerText(),paused,'Break must freeze active seconds');
 await mutate(employee.page,'/api/attendance',()=>employee.page.locator('[data-action=clock][data-value=resume]').click());await employee.page.waitForTimeout(2100);
 await mutate(employee.page,'/api/attendance',()=>employee.page.locator('[data-action=clock][data-value=clock_out]').click());assert.equal((await api(employee.context,'/api/attendance')).current,null);
 assert.deepEqual(errors,[]);console.log('PASS real browser attendance: clock-in, pause freezes, resume and clock-out; no JS/server errors.');
}catch(error){console.error(sanitize(error.stack));process.exitCode=1;}finally{await browser.close();}
