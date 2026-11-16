import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='https://tel-os-team-v2.xtremedivyangshu.workers.dev';
const {token}=JSON.parse(await readFile('.private-qa-session.json','utf8'));
const checks=[],errors=[],proxy={server:process.env.HTTPS_PROXY||'http://proxy:8080'};
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox'],proxy});
try{
 const context=await browser.newContext({viewport:{width:393,height:852},proxy});
 await context.addCookies([{name:'__Host-tel_session',value:token,url:base,httpOnly:true,secure:true,sameSite:'Strict'}]);
 const health=await(await context.request.get(base+'/api/health')).json();assert.equal(health.version,'2.7.0');
 const status=await(await context.request.get(base+'/api/status')).json();assert.equal(status.maintenance,process.env.TEL_QA_MAINTENANCE==='enabled');
 const me=await(await context.request.get(base+'/api/me')).json();assert.equal(me.user.role,'founder');
 for(const file of ['chat-updates.js','chat-updates.css','presence-updates.js','task-transfers.js','tel-helper.js','workspace-polish.js','workspace-polish.css','flexible-home.js','flexible-home.css','hr-records.js','hr-records.css','maintenance.js','deadline-policy.js'])assert.equal((await context.request.get(base+'/'+file)).status(),200);
 checks.push('Live release2.7.0 and all updated client assets are served successfully');
 const presence=await(await context.request.get(base+'/api/presence')).json();assert.ok(presence.people.every(p=>['online','offline'].includes(p.presence)));assert.equal(presence.people.find(p=>p.id===me.user.id).presence,'online');assert.ok(presence.people.every(p=>typeof p.work_status==='string'));
 const channels=await(await context.request.get(base+'/api/channels')).json();assert.ok(channels.channels.every(c=>Number.isInteger(c.unread_count)));
 checks.push('Live presence separates signed-in and work status, while authorised channels expose their unread cursor counts');
 const transfers=await context.request.get(base+'/api/task-transfers');assert.equal(transfers.status(),200);assert.ok(Array.isArray((await transfers.json()).transfers));
 const anonymous=await browser.newContext({proxy});assert.equal((await anonymous.request.get(base+'/api/task-transfers')).status(),process.env.TEL_QA_MAINTENANCE==='enabled'?503:401);await anonymous.close();
 checks.push('Current approval schema is available to the signed-in founder and anonymous access is rejected');
 const notices=await(await context.request.get(base+'/api/notifications')).json();assert.ok(notices.notifications.every(n=>!String(n.link).replace(/^#/,'').startsWith('channel/')));
 checks.push('Historical chat alerts are excluded from the live Notification centre');
 const mail=await(await context.request.get(base+'/api/operational-emails/status')).json();const sending=process.env.TEL_QA_WORK_EMAILS!=='disabled';assert.equal(mail.enabled,sending);assert.equal(mail.configured,sending);if(sending)assert.equal(mail.sender,'notifications@techforeasylife.in');assert.equal(mail.daily_time,'09:00');assert.equal(mail.meeting_reminder_minutes,60);assert.ok(Number.isFinite(Date.parse(mail.urgent_enabled_at)));assert.ok(mail.counts.every(item=>['daily_tasks','meeting_invitation','meeting_reminder','task_transfer_requested','task_transfer_approved','urgent_task_assigned','deadline_grace_granted','deadline_grace_missed'].includes(item.kind)));
 checks.push('Live work-email policy is ready with the separate work sender,09IST daily plans and one-hour meeting reminders and urgent assignment cutover');
 const schedules=await(await context.request.get(base+'/api/schedules')).json();assert.equal(schedules.attendance_mode,'flexible');assert.equal(schedules.flexible,true);
 const hr=await(await context.request.get(base+'/api/hr-records')).json();assert.ok(Array.isArray(hr.people));assert.ok(Array.isArray(hr.meeting_attendance.records));
 const policy=await context.request.get(base+'/api/deadline-policy');assert.equal(policy.status(),200);
 checks.push('Live flexible policy, private HR records and deadline records APIs are ready');
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/#people');await page.locator('#people-search').waitFor();await page.locator('.tel-helper-launcher').waitFor();
 const launcher=page.locator('.tel-helper-launcher');assert.equal(await launcher.evaluate(el=>!!el.closest('.top-actions')),true);await launcher.click();await page.locator('.tel-helper-hide').click();assert.equal(await page.locator('.tel-helper-launcher').count(),0);await page.goto(base+'/#account');await page.locator('#tel-helper-enabled').waitFor();await page.locator('#tel-helper-enabled').check();await launcher.waitFor();
 checks.push('Optional Ask TEL uses header space and can be hidden and restored from My account on the live app');
 for(const width of [320,375,393]){await page.setViewportSize({width,height:852});for(const route of ['home','people','tasks','connections','hr-records']){await page.goto(base+'/#'+route);await page.locator('#main h1').waitFor();await page.waitForFunction(()=>!document.querySelector('#main .loading-message'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}}
 checks.push('Live Home, People, Tasks, Email setup and HR records fit320,375 and393px without horizontal page overflow');
 await launcher.click();await page.locator('#tel-helper-request').fill('last heartbeat');await page.locator('.tel-helper form [type=submit]').click();await page.waitForURL('**/#monitor');await page.locator('#tel-helper-heartbeat').waitFor();assert.ok((await page.locator('#tel-helper-heartbeat').innerText()).includes('IST'));assert.deepEqual(errors,[]);
 checks.push('The live heartbeat shortcut still opens actual founder activity data with no browser JavaScript errors');
 await mkdir('tests/artifacts',{recursive:true});await writeFile('tests/artifacts/browser-release-v27-report.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,count:checks.length,checks},null,2));
}catch(error){console.error(String(error.stack).replaceAll(token,'[redacted]'));process.exitCode=1;}finally{await browser.close();}
