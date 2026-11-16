import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,Log,LogLevel} from 'miniflare';
import {chromium} from 'playwright';

// Disposable accounts and D1 only. No live team files or external deliveries.
let runtime,browser;const errors=[],checks=[];let outbound=0;
try{
 await mkdir('tests/artifacts',{recursive:true});
 const assets={};
 async function visit(folder=''){for(const file of await readdir('public/'+folder,{withFileTypes:true})){const name=folder?folder+'/'+file.name:file.name;if(file.isDirectory())await visit(name);else if(!['index.html','styles.css','app.js'].includes(name)){const ext=name.split('.').at(-1);assets['/'+name]={base64:(await readFile('public/'+name)).toString('base64'),type:{js:'application/javascript',css:'text/css',webp:'image/webp',svg:'image/svg+xml',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf'}[ext]||'application/octet-stream'};}}}
 await visit();
 const definitions={__HTML__:await readFile('public/index.html','utf8'),__CSS__:await readFile('public/styles.css','utf8'),__APP__:await readFile('public/app.js','utf8'),__BINARY_ASSETS__:assets};
 const compiled=await build({entryPoints:['src/worker.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,define:Object.fromEntries(Object.entries(definitions).map(([key,value])=>[key,JSON.stringify(value)]))});
 runtime=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-07-30',host:'127.0.0.1',port:0,d1Databases:{DB:'hr-routing-browser-disposable'},log:new Log(LogLevel.NONE),bindings:{NOTIFICATION_CHANNELS:'email'},outboundService:async()=>{outbound++;throw Error('External requests are blocked during private HR QA.');}});
 const db=await runtime.getD1Database('DB'),priority=['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql','schema-chat-read.sql','schema-task-transfers.sql','schema-operational-email.sql','schema-urgent-email.sql'];
 for(const file of [...priority,...(await readdir('.')).filter(name=>/^schema-.*\.sql$/.test(name)&&!priority.includes(name)).sort()])await db.exec((await readFile(file,'utf8')).replace(/^\s*--.*$/gm,'').replaceAll('\n',' '));
 const stamp=new Date().toISOString(),tokens=new Map();
 for(const [id,name,role] of [['author','Morgan TeMark','employee'],['founder-a','Avery Founder','founder'],['founder-b','Jordan Founder','founder'],['hr','Robin HR','hr_lead']]){
  await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,joined_on,status,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,? ,?, ?,?,0,?)').bind(id,id,id,name,role,role,role==='founder'?'Leadership':'Marketing','2026-01-01','active','unused','unused',stamp).run();
  const token=randomBytes(32).toString('hex');tokens.set(id,token);await db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(createHash('sha256').update(token).digest('hex'),id,stamp,new Date(Date.now()+3600000).toISOString()).run();
  await db.prepare('INSERT INTO onboarding(user_id) VALUES(?)').bind(id).run();
  await db.prepare("INSERT INTO member_connections(user_id,provider,account,status,verified_at,updated_at) VALUES(?,'gmail',?,'verified',?,?)").bind(id,id+'@example.test',stamp,stamp).run();
 }
 const origin=String(await runtime.ready).replace(/\/$/,'');
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 async function view(id,width=375){const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([{name:'__Host-tel_session',value:tokens.get(id),domain:new URL(origin).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();page.on('pageerror',error=>errors.push(id+': '+error.message));await page.goto(origin+'/#grievances');await page.locator('[data-action="new-grievance"]').waitFor();return page;}
 const author=await view('author');
 await author.locator('[data-action="new-grievance"]').click();await author.locator('.hr-reviewer-selection').waitFor();
 assert.equal(await author.locator('[name="hr_visible"]').isChecked(),true);assert.equal(await author.locator('[name="founder_id"]:checked').count(),0);
 await author.locator('#modal-form [name="title"]').fill('Private QA concern');await author.locator('#modal-form [name="body"]').fill('Synthetic private HR content.');
 await author.locator('[name="hr_visible"]').uncheck();await author.locator('#modal-form [type="submit"]').click();await author.locator('.form-error').filter({hasText:'Choose the HR team or at least one founder'}).waitFor();
 await author.locator('[name="founder_id"][value="founder-a"]').check();await author.locator('[name="founder_id"][value="founder-b"]').check();await author.locator('[name="founder_id"][value="founder-b"]').uncheck();
 assert.match(await author.locator('.hr-selection-summary').innerText(),/Avery Founder/);assert.doesNotMatch(await author.locator('.hr-selection-summary').innerText(),/Jordan Founder/);assert.match(await author.locator('.hr-selection-summary').innerText(),/HR cannot see/);
 const geometry=await author.locator('#dialog').evaluate(element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:element.scrollWidth-element.clientWidth};});assert.ok(geometry.left>=0&&geometry.right<=geometry.width+1&&geometry.overflow<=1,JSON.stringify(geometry));
 await author.screenshot({path:'tests/artifacts/hr-routing-selection-375.png'});
 await author.locator('#modal-form [type="submit"]').click();await author.waitForFunction(()=>!document.querySelector('#dialog').open);await author.locator('[data-action="ticket-chat"]').waitFor();
 const ticket=(await db.prepare('SELECT id FROM grievances WHERE title=?').bind('Private QA concern').first()).id;assert.equal((await db.prepare('SELECT hr_visible FROM grievance_access WHERE ticket_id=?').bind(ticket).first()).hr_visible,0);assert.deepEqual((await db.prepare('SELECT founder_id FROM grievance_founder_recipients WHERE ticket_id=?').bind(ticket).all()).results,[{founder_id:'founder-a'}]);
 await author.locator('[data-action="ticket-chat"]').click();await author.locator('#ticket-chat-form').waitFor();assert.match(await author.locator('#dialog .hr-ticket-visibility').innerText(),/Avery Founder/);assert.match(await author.locator('#dialog .hr-ticket-visibility').innerText(),/HR cannot see/);
 await author.locator('#ticket-chat-form [name="body"]').fill('Synthetic follow-up only for the selected reviewer.');await author.locator('#ticket-chat-form [type="submit"]').click();await author.locator('.ticket-comments').getByText('Synthetic follow-up only for the selected reviewer.').waitFor();await author.locator('#dialog [data-action="close-dialog"]').click();assert.equal(await author.locator('#dialog').evaluate(element=>element.open),false);
 checks.push('Mobile explicit founder multiselect and HR toggle save exactly the chosen ACL; private chat and Close work');
 const founder=await view('founder-a',1440);await founder.locator('[data-action="ticket-chat"]').click();await founder.locator('#ticket-chat-form').waitFor();await founder.locator('.ticket-comments').getByText('Synthetic follow-up only for the selected reviewer.').waitFor();await founder.screenshot({path:'tests/artifacts/hr-routing-chat-1440.png'});await founder.keyboard.press('Escape');assert.equal(await founder.locator('#dialog').evaluate(element=>element.open),false);
 for(const id of ['founder-b','hr']){const page=await view(id,1440);assert.equal(await page.locator('[data-action="ticket-chat"]').count(),0);const result=await page.evaluate(async id=>{const response=await fetch('/api/grievances/'+id+'/comments');return response.status;},ticket);assert.equal(result,403);}
 checks.push('Selected founder reads the real chat; unselected founder and HR see no ticket and receive 403 from the chat API');
 await author.locator('[data-action="new-grievance"]').click();await author.locator('.hr-reviewer-selection').waitFor();await author.locator('[name="title"]').fill('HR-only QA concern');await author.locator('[name="body"]').fill('Synthetic HR-only question.');await author.locator('#modal-form [type="submit"]').click();await author.waitForFunction(()=>!document.querySelector('#dialog').open);
 const hrOnly=await db.prepare('SELECT id FROM grievances WHERE title=?').bind('HR-only QA concern').first();assert.equal((await db.prepare('SELECT COUNT(*) n FROM grievance_founder_recipients WHERE ticket_id=?').bind(hrOnly.id).first()).n,0);assert.equal((await db.prepare('SELECT hr_visible FROM grievance_access WHERE ticket_id=?').bind(hrOnly.id).first()).hr_visible,1);
 checks.push('New forms default to HR only without silently selecting founders');
 assert.deepEqual(errors,[]);assert.equal(outbound,0);await writeFile('tests/artifacts/hr-routing-report.json',JSON.stringify({checks,geometry,errors,outbound,screenshots:['hr-routing-selection-375.png','hr-routing-chat-1440.png']},null,2));console.log(JSON.stringify({checks,errors,outbound},null,2));
}finally{if(browser)await browser.close();if(runtime)await runtime.dispose();}
