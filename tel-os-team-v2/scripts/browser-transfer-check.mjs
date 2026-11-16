import {Miniflare} from 'miniflare';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {hashPassword} from '../src/core.js';

if(spawnSync(process.execPath,['build.mjs'],{stdio:'ignore'}).status)throw Error('Build failed');
const checks=[],errors=[],runtime=new Miniflare({modules:true,scriptPath:'dist/worker.js',compatibilityDate:'2026-07-30',host:'127.0.0.1',port:0,d1Databases:{DB:'transfer-browser-fixture'},bindings:{NOTIFICATION_CHANNELS:'email'}});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const db=await runtime.getD1Database('DB');
 for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql','schema-chat-read.sql','schema-task-transfers.sql','schema-operational-email.sql','schema-urgent-email.sql','schema-flexible-work.sql','schema-hr-records.sql','schema-deadline-policy.sql','schema-announcements.sql','schema-grievance-access.sql'])await db.exec((await readFile(file,'utf8')).replaceAll('\n',' '));
 const password='TransferBrowserFixture!2026',salt='0123456789abcdef0123456789abcdef',hash=await hashPassword(password,salt),stamp=new Date().toISOString();
 for(const[id,role]of[['handover-owner','employee'],['handover-lead','team_lead'],['handover-target','employee']]){
  await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,email,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(id,id,id,id,role,role,'Marketing',id+'@example.test','2026-01-01',hash,salt,stamp).run();
  await db.prepare('INSERT INTO onboarding(user_id) VALUES(?)').bind(id).run();
  await db.prepare("INSERT INTO member_connections VALUES(?,'gmail',?,'verified',?,?)").bind(id,id+'@example.test',stamp,stamp).run();
 }
 await db.prepare("INSERT INTO tasks(id,title,assignee_id,leader_id,department,priority,deadline,expected_deliverable,created_by,created_at,updated_at) VALUES('handover-task','Browser handover task','handover-owner','handover-lead','Marketing','normal','2026-12-30','Reviewed result','handover-lead',?,?)").bind(stamp,stamp).run();
 const base=String(await runtime.ready).replace(/\/$/,'');
 async function actor(id){const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.locator('#login-form [name=username]').fill(id);await page.locator('#login-form [name=password]').fill(password);await page.locator('#login-form [type=submit]').click();await page.locator('.workspace #main h1').waitFor();return{context,page};}
 async function tasks(actor){await actor.page.goto(base+'/#tasks');await actor.page.locator('#main h1').waitFor();await actor.page.waitForFunction(()=>!document.querySelector('#main .loading-message'));}
 const owner=await actor('handover-owner'),lead=await actor('handover-lead'),target=await actor('handover-target');
 await tasks(owner);await owner.page.locator('[data-action=task-details][data-id=handover-task]').click();await owner.page.locator('[data-action=transfer-request]').click();await owner.page.locator('#modal-form [name=to_user_id]').selectOption('handover-target');await owner.page.locator('#modal-form [name=reason]').fill('PRIVATE_BROWSER_HANDOVER_REASON');
 let response=owner.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/tasks/handover-task/transfers'&&r.request().method()==='POST');await owner.page.locator('#modal-form [type=submit]').click();assert.equal((await response).status(),201);
 assert.equal((await db.prepare("SELECT assignee_id FROM tasks WHERE id='handover-task'").first()).assignee_id,'handover-owner');
 assert.equal((await target.context.request.get(base+'/api/tasks/handover-task/transfers')).status(),403);
 assert.equal((await db.prepare("SELECT COUNT(*) count FROM notifications WHERE user_id='handover-target'").first()).count,0);
 checks.push('Requesting a transfer keeps the task with its current owner and gives the proposed target no premature access or notification');
 await tasks(lead);await lead.page.locator('[data-action=transfer-decide][data-value=approve]').first().click();await lead.page.locator('#modal-form [name=note]').fill('PRIVATE_BROWSER_REVIEWER_NOTE');response=lead.page.waitForResponse(r=>new URL(r.url()).pathname.startsWith('/api/task-transfers/')&&r.request().method()==='PATCH');await lead.page.locator('#modal-form [type=submit]').click();assert.equal((await response).status(),200);
 assert.deepEqual(await db.prepare("SELECT assignee_id,status,leader_id FROM tasks WHERE id='handover-task'").first(),{assignee_id:'handover-target',status:'todo',leader_id:'handover-lead'});
 checks.push('The assigned reviewer approves through the app and the task immediately moves to the new owner with independent review still required');
 await tasks(target);await target.page.locator('[data-action=task-details][data-id=handover-task]').click();await target.page.locator('.task-transfer-panel').waitFor();await target.page.waitForFunction(()=>!document.querySelector('.task-transfer-panel')?.innerText.includes('Checking transfer options'));
 const text=await target.page.locator('dialog').innerText();assert.ok(!text.includes('PRIVATE_BROWSER_HANDOVER_REASON'));assert.ok(!text.includes('PRIVATE_BROWSER_REVIEWER_NOTE'));
 assert.equal((await db.prepare("SELECT COUNT(*) count FROM notifications WHERE user_id='handover-target' AND title='Task assigned after transfer approval'").first()).count,1);
 checks.push('The new owner sees the assigned task and one notification, while the private handover reason and reviewer note remain hidden');
 await target.page.setViewportSize({width:375,height:812});await target.page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth,{},{timeout:3000});const bounds=await target.page.evaluate(()=>({width:innerWidth,page:document.documentElement.scrollWidth}));assert.ok(bounds.page<=bounds.width);assert.deepEqual(errors,[]);
 await mkdir('tests/artifacts',{recursive:true});await target.page.screenshot({path:'tests/artifacts/task-transfer-mobile-v25.png'});await writeFile('tests/artifacts/browser-transfer-report.json',JSON.stringify({passed:true,checks,errors},null,2));checks.push('Transfer controls fit375px and the browser reports no JavaScript errors');console.log(JSON.stringify({passed:true,count:checks.length,checks},null,2));
}catch(error){console.error(error.stack);process.exitCode=1;}finally{await browser.close();await runtime.dispose();}
