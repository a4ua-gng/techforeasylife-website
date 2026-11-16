import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='https://tel-os-team-v2.xtremedivyangshu.workers.dev';
const {token}=JSON.parse(await readFile('.private-qa-session.json','utf8'));
const proxy={server:process.env.HTTPS_PROXY||'http://proxy:8080'},errors=[],checks=[];
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox'],proxy});
try{
 const context=await browser.newContext({viewport:{width:375,height:812},proxy});
 await context.addCookies([{name:'__Host-tel_session',value:token,url:base,httpOnly:true,secure:true,sameSite:'Strict'}]);
 const status=await(await context.request.get(base+'/api/status')).json();assert.equal(status.maintenance,true);assert.equal(status.full_maintenance,true);
 for(const route of ['me','people','hr-records','announcements','tasks']){const response=await context.request.get(base+'/api/'+route);assert.equal(response.status(),503);assert.equal((await response.json()).full_maintenance,true);}
 checks.push('The signed-in founder is blocked from every checked private API in full maintenance');
 const anonymous=await browser.newContext({proxy});assert.equal((await anonymous.request.get(base+'/api/me')).status(),503);await anonymous.close();
 checks.push('Anonymous access is also blocked; full-mode status is public');
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/#home');await page.locator('.maintenance-page').waitFor();assert.equal(await page.locator('.workspace').count(),0);assert.equal(await page.locator('#maintenance-signin').count(),0);assert.match(await page.locator('.maintenance-attendance').innerText(),/every account, including founders/i);
 for(const width of [320,375,393]){await page.setViewportSize({width,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);checks.push('The maintenance screen offers no founder sign-in bypass and fits320,375 and393px');
 await mkdir('tests/artifacts',{recursive:true});await writeFile('tests/artifacts/browser-full-maintenance-report.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}catch(error){console.error(String(error.stack).replaceAll(token,'[redacted]'));process.exitCode=1;}finally{await browser.close();}
