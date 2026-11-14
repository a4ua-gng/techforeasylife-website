import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://tel-os-team-v2.xtremedivyangshu.workers.dev';
const {token}=JSON.parse(await readFile('.private-qa-session.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addCookies([{name:'__Host-tel_session',value:token,url:origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=500)errors.push(r.status()+' '+new URL(r.url()).pathname);});
try{
 await page.goto(origin);await page.locator('.workspace #main h1').waitFor();await page.locator('dialog.connection-prompt-dialog[open]').waitFor();assert.equal(await page.locator('.connection-prompt-step').count(),2);await page.locator('.connection-prompt-actions [data-action=close-dialog]').click();checks.push('Live connection popup shows both providers and can open after sign-in');
 for(const route of ['home','connections','monitor','marketing-reports','grievances','hr','people','images','website-team','founder-updates','account']){
  await page.goto(origin+'/#'+route);await page.reload();await page.locator('.workspace #main h1').waitFor();await page.waitForFunction(()=>!document.querySelector('#main .loading-message'));
  assert.equal(await page.locator('.error-page').count(),0,route+' failed');
  if(route==='home')assert.match(await page.locator('#main h1').innerText(),/^Welcome, Harsh/);
  if(route==='website-team'){assert.ok(await page.locator('.website-team-member').count()>0);assert.ok(await page.locator('[data-action=website-team-save]').count());}
  if(route==='people'){await page.locator('img.avatar-photo').first().waitFor();await page.locator('img.avatar-photo').first().evaluate(img=>img.decode());}
  if(route==='hr'){await page.locator('[data-action=pdf-view][data-id=devangi]').click();const image=page.locator('.private-identity-documents img');await image.waitFor();await image.evaluate(img=>img.decode());assert.equal(await image.evaluate(img=>img.naturalWidth),720);await page.locator('.dialog-head [data-action=close-dialog]').click();checks.push('Live private IC viewer displays the genuine supplied image');}if(route==='account')assert.ok(await page.locator('.account-photo-settings [data-action=upload-image]').count());checks.push('Live authenticated '+route+' renders');
 }
 await page.setViewportSize({width:375,height:812});for(const route of ['home','connections','monitor','grievances','website-team','founder-updates','account']){await page.goto(origin+'/#'+route);await page.reload();await page.locator('.workspace #main h1').waitFor();await page.waitForFunction(()=>!document.querySelector('#main .loading-message'));const b=await page.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}));assert.ok(b.s<=b.w,route+' mobile overflow '+JSON.stringify(b));}checks.push('Live375px new screens fit');
 assert.deepEqual(errors,[]);await mkdir('tests/artifacts',{recursive:true});await page.screenshot({path:'tests/artifacts/live-mobile.png',fullPage:true});
 await writeFile('tests/artifacts/browser-live-report.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}catch(e){console.error(e.stack);await writeFile('tests/artifacts/browser-live-report.json',JSON.stringify({passed:false,checks,errors,error:e.message},null,2));process.exitCode=1;}finally{await browser.close();}
