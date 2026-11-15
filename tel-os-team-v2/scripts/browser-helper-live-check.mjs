import {chromium} from 'playwright';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = 'https://tel-os-team-v2.xtremedivyangshu.workers.dev';
const {token} = JSON.parse(await readFile('.private-qa-session.json', 'utf8'));
const checks = [], errors = [];
const proxy = {server: process.env.HTTPS_PROXY || 'http://proxy:8080'};
const browser = await chromium.launch({headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'], proxy});
try {
  const context = await browser.newContext({viewport: {width: 393, height: 852}, proxy});
  await context.addCookies([{name: '__Host-tel_session', value: token, url: base, httpOnly: true, secure: true, sameSite: 'Strict'}]);
  const health = await (await context.request.get(base + '/api/health')).json();
  assert.equal(health.version, '2.4.1');
  const me = await context.request.get(base + '/api/me');
  assert.equal(me.status(), 200, 'Existing authorized QA session expired');
  assert.equal((await me.json()).user.role, 'founder');
  for (const file of ['tel-helper.js', 'tel-helper-intents.js', 'tel-helper.css']) assert.equal((await context.request.get(base + '/' + file)).status(), 200);
  checks.push('Live release2.4.1 and all helper assets are served successfully');
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/#people');
  await page.locator('#people-search').waitFor();
  await page.locator('.tel-helper-launcher').waitFor();
  if (await page.locator('dialog[open]').count()) await page.locator('.dialog-head [data-action=close-dialog]').click();
  for (const width of [320, 375, 393, 1440]) {
    await page.setViewportSize({width, height: 900});
    const geometry = await page.evaluate(() => {
      const input = document.querySelector('#people-search'), glyph = input.closest('.search').querySelector('.svg');
      return {page: document.documentElement.scrollWidth, text: input.getBoundingClientRect().left + parseFloat(getComputedStyle(input).paddingLeft), icon: glyph.getBoundingClientRect().right};
    });
    assert.ok(geometry.page <= width);
    assert.ok(geometry.text - geometry.icon >= 8);
  }
  checks.push('Live People search has clear icon/text spacing and no page overflow from320px to desktop');
  await page.setViewportSize({width: 393, height: 852});
  await page.locator('.tel-helper-launcher').click();
  await page.locator('#tel-helper-request').fill('show the last heartbeat');
  await page.locator('.tel-helper form [type=submit]').click();
  await page.waitForURL('**/#monitor');
  await page.locator('#tel-helper-heartbeat').waitFor();
  assert.match(await page.locator('#tel-helper-heartbeat').innerText(), /Latest recorded heartbeat: .* IST\./);
  assert.equal(await page.locator('#team-presence tr.tel-helper-highlight').count(), 1);
  assert.equal(await page.locator('.breadcrumb strong').innerText(), 'Activity & status');
  checks.push('Live last-heartbeat request opens actual founder activity data, highlights its record and displays an IST timestamp');
  await page.locator('.tel-helper-launcher').click();
  await page.locator('#tel-helper-request').fill('email setup');
  await page.locator('.tel-helper form [type=submit]').click();
  await page.waitForURL('**/#connections');
  await page.locator('[data-email-code-request]').waitFor({state: 'attached'});
  const connections = await (await context.request.get(base + '/api/connections')).json();
  assert.equal(connections.mode, 'email');
  assert.equal(connections.configured.gmail, true);
  assert.equal(connections.delivery_mode, 'instant');
  checks.push('Email navigation works and the existing email-only instant-verification configuration remains ready');
  assert.deepEqual(errors, []);
  await mkdir('tests/artifacts', {recursive: true});
  await writeFile('tests/artifacts/browser-helper-live-report.json', JSON.stringify({passed: true, checks, errors}, null, 2));
  console.log(JSON.stringify({passed: true, count: checks.length, checks}, null, 2));
} catch (error) { console.error(String(error.stack).replaceAll(token, '[redacted]')); process.exitCode = 1; }
finally { await browser.close(); }
