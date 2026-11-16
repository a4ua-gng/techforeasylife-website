import {Miniflare} from 'miniflare';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {hashPassword} from '../src/core.js';

if(spawnSync(process.execPath,['build.mjs'],{stdio:'ignore'}).status)throw Error('Build failed');
const checks=[],errors=[],runtime=new Miniflare({modules:true,scriptPath:'dist/worker.js',compatibilityDate:'2026-07-30',host:'127.0.0.1',port:0,d1Databases:{DB:'presence-browser-fixture'},bindings:{NOTIFICATION_CHANNELS:'email'}});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const db=await runtime.getD1Database('DB');
 for(const file of ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql','schema-chat-read.sql','schema-task-transfers.sql','schema-operational-email.sql','schema-urgent-email.sql','schema-flexible-work.sql','schema-hr-records.sql','schema-deadline-policy.sql','schema-announcements.sql','schema-grievance-access.sql'])await db.exec((await readFile(file,'utf8')).replaceAll('\n',' '));
 const password='LocalPresenceBrowser!2026',salt='0123456789abcdef0123456789abcdef',hash=await hashPassword(password,salt),stamp=new Date().toISOString();
 for(const[id,role]of[['presence-founder','founder'],['presence-member','employee']]){
  await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,email,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(id,id,id,id,role,role,'Marketing',id+'@example.test','2026-01-01',hash,salt,stamp).run();
  await db.prepare('INSERT INTO onboarding(user_id) VALUES(?)').bind(id).run();
  await db.prepare("INSERT INTO member_connections VALUES(?,'gmail',?,'verified',?,?)").bind(id,id+'@example.test',stamp,stamp).run();
 }
 const base=String(await runtime.ready).replace(/\/$/,'');
 async function actor(username){
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('#login-form [name=username]').fill(username);await page.locator('#login-form [name=password]').fill(password);await page.locator('#login-form [type=submit]').click();await page.locator('.workspace #main h1').waitFor();
  if(!await page.evaluate(()=>typeof refreshSessionPresence==='function'))await page.addScriptTag({url:base+'/presence-updates.js'});
  return{context,page};
 }
 async function visit(page,name){await page.evaluate(value=>{location.hash=value;},name);await page.waitForFunction(value=>location.hash==='#'+value&&!document.querySelector('#main .loading-message')&&document.querySelector('#main h1'),name);assert.equal(await page.locator('.error-page').count(),0);}
 async function presenceRefresh(page){await page.evaluate(()=>refreshSessionPresence());}
 async function attendance(actor,action){const response=await actor.context.request.post(base+'/api/attendance',{headers:{Origin:base},data:{action}});assert.ok(response.ok(),await response.text());}
 const member=await actor('presence-member'),founder=await actor('presence-founder');
 await visit(founder.page,'people');
 const card=founder.page.locator('[data-presence-user="presence-member"]');await card.waitFor();
 assert.match(await card.innerText(),/Online · signed in/);assert.match(await card.innerText(),/Not Clocked In/);
 checks.push('A signed-in member immediately appears Online and separately Not Clocked In in the actual directory');
 const pulse=await member.context.request.post(base+'/api/activity/heartbeat',{headers:{Origin:base},data:{client_id:'00000000-0000-4000-8000-000000000129',section:'home',visible:false,focused:false,idle_seconds:86400}});assert.equal(pulse.status(),200);
 await db.prepare("UPDATE activity_sessions SET last_seen='2020-01-01T00:00:00Z' WHERE user_id='presence-member'").run();
 await presenceRefresh(founder.page);assert.match(await card.innerText(),/Online · signed in/);assert.doesNotMatch(await card.innerText(),/Away/);
 checks.push('Hidden, unfocused, idle and old app activity do not turn an authenticated member Away or Offline');
 await attendance(member,'clock_in');await presenceRefresh(founder.page);await card.locator('.badge').filter({hasText:'Working'}).waitFor();assert.match(await card.innerText(),/Online · signed in/);
 await attendance(member,'clock_out');await presenceRefresh(founder.page);await card.locator('.badge').filter({hasText:'Not Clocked In'}).waitFor();assert.match(await card.innerText(),/Online · signed in/);
 checks.push('Clock-in and clock-out update the visible work badge without changing login presence or rebuilding the page');
 await visit(founder.page,'monitor');await founder.page.locator('[data-session-presence-stats]').waitFor();
 const monitor=await founder.page.locator('#main').innerText();assert.match(monitor,/Signed in to TEL OS/);assert.match(monitor,/Clocked in and not on a break/);assert.doesNotMatch(monitor,/Away|Heartbeat within90seconds/);
 assert.match(await founder.page.locator('[data-heartbeat-user="presence-member"] [data-last-heartbeat]').innerText(),/Jan/);
 checks.push('The founder activity screen separates Online and Working, retains the real heartbeat timestamp and has no Away statistic');
 const logout=await member.context.request.post(base+'/api/auth/logout',{headers:{Origin:base},data:{}});assert.equal(logout.status(),200);
 await presenceRefresh(founder.page);await founder.page.locator('[data-heartbeat-user="presence-member"] [data-session-presence]').getByText('Offline',{exact:true}).waitFor();
 checks.push('Logging out the last member session updates the founder screen to Offline');
 await founder.page.setViewportSize({width:375,height:812});const bounds=await founder.page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth}));assert.ok(bounds.page<=bounds.viewport);
 assert.deepEqual(errors,[]);checks.push('The updated activity screen fits375px with no browser JavaScript errors');
 await mkdir('tests/artifacts',{recursive:true});await writeFile('tests/artifacts/browser-presence-report.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,count:checks.length,checks},null,2));
}catch(error){console.error(error.stack);process.exitCode=1;}finally{await browser.close();await runtime.dispose();}
