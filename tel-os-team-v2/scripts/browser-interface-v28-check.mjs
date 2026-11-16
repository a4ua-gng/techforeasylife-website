import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {artifacts, createFixture, geometry} from './browser-calendar-planner-check.mjs';

let fixture;
const checks = [], measurements = [];
async function open(page, route, selector) {
  await page.goto(fixture.origin + '/#' + route);
  await page.locator(selector).waitFor();
  assert.equal(await page.locator('.error-page').count(), 0);
  await page.evaluate(() => document.fonts.ready);
}
try {
  await mkdir(artifacts, {recursive:true}); fixture = await createFixture('interface-v28');
  const founder = await fixture.pageFor('founder');
  await open(founder.page, 'founder-updates', '.interface-founder-overview');
  assert.equal(await founder.page.locator('.interface-founder-actions [data-action="copy-founder-updates"]').count(), 1);
  assert.equal(await founder.page.locator('.interface-founder-actions a[href="/api/founder-updates?format=text"]').count(), 1);
  assert.equal(await founder.page.locator('.page-title [data-action="copy-founder-updates"]').count(), 0);
  assert.equal(await founder.page.locator('.interface-founder-feed .founder-text-update').count(), 2);
  assert.match(await founder.page.locator('.interface-founder-feed').innerText(), /Actor: Morgan Creative/);
  assert.ok(!(await founder.page.locator('.interface-founder-feed').innerText()).includes('PRIVATE_AUDIT_DETAILS'));
  await founder.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await founder.page.locator('[data-action="copy-founder-updates"]').click();
  const clipboard = await founder.page.evaluate(() => navigator.clipboard.readText());
  assert.match(clipboard, /TEL OS|founder|overview/i);
  assert.match(clipboard, /TeMark reports/);
  const download = await founder.context.request.get(fixture.origin + '/api/founder-updates?format=text');
  assert.equal(download.status(), 200); assert.ok((await download.text()).length > 80);
  for (const width of [320,375,393,768,1440]) {
    measurements.push({view:'founder-updates',...await geometry(founder.page,width)});
    const actions=await founder.page.locator('.interface-founder-actions').evaluate(container=>[...container.children].map(element=>{const r=element.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};}));
    const alignedRow=Math.abs(actions[0].top-actions[1].top)<1&&Math.abs(actions[0].bottom-actions[1].bottom)<1;
    const alignedStack=Math.abs(actions[0].left-actions[1].left)<1&&Math.abs(actions[0].right-actions[1].right)<1&&actions[0].bottom<=actions[1].top;
    assert.ok(alignedRow||alignedStack,'Founder actions must align in their row or stack at '+width);
  }
  for (const width of [375,1440]) await fixture.shot(founder.page,'founder-updates',width);
  checks.push('Founder overview groups Copy and Download with the heading; real audit feed rows, clipboard and text export fit small screens without exposing private audit details');

  const hr = await fixture.pageFor('hr');
  await open(hr.page,'hr-records','.hr-record-filters');
  assert.match(await hr.page.locator('#hr-record-person option[value="member"]').innerText(), /TeMark/);
  assert.equal((await (await hr.context.request.get(fixture.origin + '/api/people/member')).json()).user.department, 'Marketing', 'Official display name must preserve the stored department');
  for (const width of [320,375,393,650,768,1440]) {
    measurements.push({view:'hr-records',...await geometry(hr.page,width)});
    const boxes = await hr.page.locator('.hr-record-filters').evaluate(form => [...form.querySelectorAll('.field,button[type="submit"]')].map(element => {const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};}));
    for (const [index,first] of boxes.entries()) for (const second of boxes.slice(index+1)) assert.ok(first.right<=second.left+1||second.right<=first.left+1||first.bottom<=second.top+1||second.bottom<=first.top+1,'HR filter overlap at '+width);
    if (width<=650) for (const [index,box] of boxes.entries()) if(index) assert.ok(box.top>=boxes[index-1].bottom,'HR controls should stack at '+width);
    const nativeDates = await hr.page.locator('.hr-record-filters input[type="date"]').evaluateAll(inputs => inputs.map(input => {const style=getComputedStyle(input),bounds=input.getBoundingClientRect(),parent=input.closest('.field').getBoundingClientRect();return {type:input.type,min:style.minWidth,inline:style.minInlineSize,right:bounds.right,parentRight:parent.right,width:bounds.width};}));
    for(const control of nativeDates){assert.equal(control.type,'date');assert.equal(control.min,'0px');assert.equal(control.inline,'0px');assert.ok(control.right<=control.parentRight+1,'Native date control exceeds its track');}
  }
  await hr.page.locator('#hr-record-from').fill(fixture.today); await hr.page.locator('#hr-record-to').fill(fixture.today); await hr.page.locator('#hr-record-person').selectOption('member');
  const filterResponse=hr.page.waitForResponse(response=>response.url().includes('/api/hr-records?')&&response.status()===200);await hr.page.locator('.hr-record-filters button[type="submit"]').click();await filterResponse;
  await hr.page.waitForFunction(()=>document.querySelector('#hr-record-person')?.value==='member');
  const selected=await hr.page.evaluate(()=>records.hrRecords.filters);assert.equal(selected.user_id,'member');assert.equal(selected.from,fixture.today);assert.equal(selected.to,fixture.today);
  for (const width of [375,1440]) await fixture.shot(hr.page,'hr-control-panel',width);
  checks.push('HR native date inputs remain within their tracks; filters stack through 650px without overlap and submit their real date/member scope');

  const member=await fixture.pageFor('member');
  await open(member.page,'home','.interface-today-tasks');
  assert.equal(await member.page.locator('#flexible-today-title').innerText(),'Today’s tasks for you');
  const personal=member.page.locator('.interface-today-tasks .flexible-timeline-step:nth-child(2)');
  assert.match(await personal.innerText(),/Your assignments/);assert.match(await personal.innerText(),/Prepare the campaign concept/);assert.ok(!/PRIVATE_STRATEGY_TASK|Review the detailed campaign brief/.test(await personal.innerText()));
  await personal.locator('[data-id="own-task"]').click();await member.page.locator('#dialog[open]').waitFor();assert.match(await member.page.locator('#dialog-title').innerText(),/campaign concept/);await member.page.locator('#dialog [data-action="close-dialog"]').first().click();
  for (const width of [320,375,393,768,1440]) measurements.push({view:'home',...await geometry(member.page,width)});
  await member.page.emulateMedia({reducedMotion:'reduce'});await fixture.shot(member.page,'today-tasks',375);
  const lead=await fixture.pageFor('lead');await open(lead.page,'home','.interface-today-tasks');assert.match(await lead.page.locator('.interface-review-list').innerText(),/Waiting for your review/);assert.equal(await lead.page.locator('.interface-review-list [data-id="peer-review"]').count(),1);
  checks.push('Today’s tasks for you lists the signed-in employee’s actual assignments with working task details; a lead’s separate review queue remains available');

  await member.page.setViewportSize({width:1440,height:1000});
  assert.equal(await member.page.locator('.flexible-hr-shortcut').count(),1);
  await member.page.locator('[data-action="hide-home-hr-shortcut"]').click();
  assert.equal(await member.page.locator('.flexible-hr-shortcut').count(),0);
  assert.equal(await member.page.evaluate(()=>document.activeElement?.id),'flexible-today-title');
  assert.equal(await member.page.locator('.nav-scroll a[href="#grievances"]').count(),1,'Contact HR navigation remains available');
  await member.page.reload();await member.page.locator('.interface-today-tasks').waitFor();assert.equal(await member.page.locator('.flexible-hr-shortcut').count(),0,'Hidden preference survives reload');
  await open(member.page,'account','#home-hr-shortcut-enabled');assert.equal(await member.page.locator('#home-hr-shortcut-enabled').isChecked(),false);await member.page.locator('#home-hr-shortcut-enabled').check();assert.match(await member.page.locator('[data-hr-shortcut-status]').innerText(),/will appear/);
  await open(member.page,'home','.interface-today-tasks');assert.equal(await member.page.locator('.flexible-hr-shortcut').count(),1);
  await member.page.locator('[data-action="hide-home-hr-shortcut"]').click();
  // Reuse the same document and browser storage while switching accounts.
  await member.context.clearCookies();await member.context.addCookies([{name:'__Host-tel_session',value:fixture.tokens.get('founder'),domain:new URL(fixture.origin).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  await member.page.evaluate(async()=>{user=(await api('/api/me')).user;await boot();});await member.page.locator('.interface-today-tasks').waitFor();assert.equal(await member.page.locator('.flexible-hr-shortcut').count(),1,'One account must not inherit another account’s hidden setting');
  await member.page.evaluate(async()=>{const button=document.createElement('button');button.dataset.action='logout';await handleAction(button);});await member.page.locator('#login-form').waitFor();
  const token=await fixture.issueSession('member');await member.context.addCookies([{name:'__Host-tel_session',value:token,domain:new URL(fixture.origin).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);await member.page.evaluate(async()=>{user=(await api('/api/me')).user;await boot();});await member.page.locator('.interface-today-tasks').waitFor();assert.equal(await member.page.locator('.flexible-hr-shortcut').count(),0,'Personal preference survives sign out without leaking to the next account');
  checks.push('Home HR shortcut has an accessible X, survives reload/sign-out, restores in My account, and stays isolated per account; Contact HR navigation is retained');
  assert.deepEqual(fixture.errors,[]);assert.deepEqual(fixture.external,[]);
  checks.push('All checked Founder, HR and Home layouts fit 320/375/393px screens with 44px targets; no browser errors, server failures or outbound requests');
  await writeFile(artifacts+'/browser-interface-v28-report.json',JSON.stringify({passed:true,checks,measurements,snapshots:fixture.snapshots},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}catch(error){await mkdir(artifacts,{recursive:true});await writeFile(artifacts+'/browser-interface-v28-report.json',JSON.stringify({passed:false,checks,measurements,error:error.stack,errors:fixture?.errors},null,2));console.error(error.stack);process.exitCode=1;}
finally{await fixture?.close();}
