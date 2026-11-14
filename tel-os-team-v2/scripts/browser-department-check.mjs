import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin=process.env.TEL_QA_ORIGIN||'http://127.0.0.1:4173';
if(!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))throw Error('Department QA must use a local preview only.');
const credentials=JSON.parse(await readFile(process.env.TEL_QA_CREDENTIALS||'.private-credentials.json','utf8'));
const secrets=credentials.map(x=>x.password),checks=[],errors=[];
const sanitize=value=>secrets.reduce((s,p)=>s.replaceAll(p,'[redacted]'),String(value));
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
await mkdir('tests/artifacts',{recursive:true});
async function ready(page){await page.waitForFunction(()=>document.querySelector('#main h1')&&!document.querySelector('#main .loading-message'));assert.equal(await page.locator('.error-page').count(),0,'Home displayed its error state');}
async function api(context,path,method='GET',body){const response=await context.request.fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{data:body})});assert.ok(response.ok(),sanitize(await response.text()));return response.json();}
async function actor(record){
 if(typeof record==='string')record=credentials.find(x=>x.username===record);assert.ok(record,'A local fixture is missing');
 const personal='QA!'+record.username+'LocalOnly2026';secrets.push(personal,record.password);
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(sanitize(e.stack)));page.on('response',r=>{if(r.status()>=500)errors.push(r.status()+' '+r.url());});
 await page.goto(origin);await page.locator('#login-form').waitFor();await page.locator('#login-form [name=username]').fill(record.username);await page.locator('#login-form [name=password]').fill(record.password);
 let waiting=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login');await page.locator('#login-form [type=submit]').click();let response=await waiting;
 if(response.status()===401){await page.locator('#login-form [type=submit]:not(:disabled)').waitFor();await page.locator('#login-form [name=password]').fill(personal);waiting=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login');await page.locator('#login-form [type=submit]').click();response=await waiting;}
 assert.ok(response.ok(),sanitize(await response.text()));
 await page.waitForFunction(()=>document.querySelector('.workspace')||document.querySelector('#modal-form [name=new_password]'));
 if(await page.locator('#modal-form [name=new_password]').count()){
  for(const [name,value] of Object.entries({current_password:record.password,new_password:personal,confirm_password:personal}))await page.locator('#modal-form [name='+name+']').fill(value);
  waiting=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/password');await page.locator('#modal-form [type=submit]').click();response=await waiting;assert.ok(response.ok(),sanitize(await response.text()));await page.locator('dialog').waitFor({state:'hidden'});
 }
 await ready(page);return {context,page,user:(await api(context,'/api/me')).user};
}
async function home(persona){await persona.page.goto(origin+'/#home');await persona.page.reload();await ready(persona.page);const greeting=await persona.page.locator('#main h1').innerText();assert.match(greeting,new RegExp('^Welcome,\\s*'+persona.user.name.split(' ')[0]+'[.!]?'));return persona.page.locator('#main');}
async function mobile(persona,label){await persona.page.setViewportSize({width:375,height:812});await home(persona);const bounds=await persona.page.evaluate(()=>({width:innerWidth,page:document.documentElement.scrollWidth}));assert.ok(bounds.page<=bounds.width,label+' Home overflows mobile: '+JSON.stringify(bounds));}

try{
 const founder=await actor('devangi');let main=await home(founder);
 assert.equal(await main.locator('[data-department-home=leadership]').count(),1);assert.ok(await main.locator('a[href="#reports"]').count(),'Founder Home should expose organisation reporting');
 checks.push('Founder Home welcomes Devangi and exposes organisation oversight');
 const hrLead=await actor('humaira');main=await home(hrLead);assert.equal(await main.locator('[data-department-home=hr]').count(),1);assert.ok(await main.locator('a[href="#hr"]').count(),'HR Home needs People admin');assert.ok(await main.locator('a[href="#attendance"]').count(),'HR Home needs attendance controls');assert.ok(await main.locator('a[href="#leave"]').count(),'HR Home needs leave approvals');
 const hrMember=await actor('himan');await home(hrMember);checks.push('Both HR roles receive people operations and approval navigation');
 const marketingHead=await actor('tani');main=await home(marketingHead);assert.equal(await main.locator('[data-department-home=marketing]').count(),1);assert.ok(await main.locator('[data-action=new-task]').count(),'Marketing head should be able to allocate work');assert.ok(await main.locator('a[href="#channel/marketing"]').count(),'Marketing head Home should open the department channel');assert.equal(await main.locator('a[href="#hr"]').count(),0);
 const marketingMember=await actor('binit');main=await home(marketingMember);assert.equal(await main.locator('[data-department-home=marketing]').count(),1);assert.equal(await main.locator('[data-action=new-task]').count(),0,'Marketing member must not allocate work');assert.equal(await main.locator('a[href="#hr"]').count(),0);assert.ok(await main.locator('a[href="#channel/marketing"]').count(),'Marketing member Home should link the department channel');checks.push('Marketing head and member receive different actions within the marketing Home');
 const finance=await actor('maverick');main=await home(finance);assert.equal(await main.locator('[data-department-home=finance]').count(),1);assert.equal(await main.locator('[data-finance-leave]').count(),1);assert.match(await main.innerText(),/on leave/i);assert.equal(await main.locator('[data-action=clock][data-value=clock_in]').count(),0);assert.equal(await main.locator('a[href="#hr"]').count(),0);checks.push('Finance Home recognises Maverick’s leave and offers no clock-in button');
 const availableChannels=(await api(founder.context,'/api/channels')).channels;if(!availableChannels.some(c=>c.name==='strategy'))await api(founder.context,'/api/channels','POST',{name:'strategy',description:'Strategy coordination',department:'Strategy'});
 const created=await api(founder.context,'/api/people','POST',{username:'qa_strategy_'+Date.now().toString(36),name:'Abhiraj QA',designation:'Strategy Analyst',role:'employee',department:'Strategy',manager_id:founder.user.id});
 const strategy=await actor({username:created.user.username,password:created.temporary_password});main=await home(strategy);assert.equal(await main.locator('[data-department-home=strategy]').count(),1);assert.match(await main.innerText(),/strategy/i);assert.equal(await main.locator('a[href="#hr"]').count(),0);assert.equal(await main.locator('[data-action=new-task]').count(),0);checks.push('New Strategy member inherits a personalised Home without HR or allocation permissions');
 for(const [persona,label] of [[founder,'Leadership'],[hrLead,'HR'],[marketingHead,'Marketing head'],[marketingMember,'Marketing member'],[finance,'Finance'],[strategy,'Strategy']]){await mobile(persona,label);await persona.page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});await persona.page.screenshot({path:'tests/artifacts/department-'+label.toLowerCase().replaceAll(' ','-')+'.png',fullPage:true});}
 checks.push('All six department and role variants fit375px mobile layouts');
 assert.deepEqual(errors,[]);checks.push('No browser JavaScript errors or HTTP500 responses');
 await writeFile('tests/artifacts/browser-department-report.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,count:checks.length,checks},null,2));
}catch(error){await writeFile('tests/artifacts/browser-department-report.json',JSON.stringify({passed:false,checks,errors,error:sanitize(error.stack)},null,2));console.error(sanitize(error.stack));process.exitCode=1;}finally{await browser.close();}
