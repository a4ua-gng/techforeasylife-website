import {Miniflare} from 'miniflare';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {hashPassword} from '../src/core.js';

if (spawnSync(process.execPath, ['build.mjs'], {stdio: 'ignore'}).status) throw Error('Build failed');
const checks = [], errors = [];
const runtime = new Miniflare({modules: true, scriptPath: 'dist/worker.js', compatibilityDate: '2026-07-30', host: '127.0.0.1', port: 0, d1Databases: {DB: 'helper-isolated-fixture'}, bindings: {NOTIFICATION_CHANNELS: 'email'}});
const browser = await chromium.launch({headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox']});
try {
  const db = await runtime.getD1Database('DB');
  for (const file of ['schema-core.sql', 'schema-workflows.sql', 'schema-collaboration.sql', 'schema-schedules.sql', 'schema-extensions.sql']) await db.exec((await readFile(file, 'utf8')).replaceAll('\n', ' '));
  const password = 'LocalHelperFixture!2026', salt = '0123456789abcdef0123456789abcdef', hash = await hashPassword(password, salt), stamp = new Date().toISOString();
  for (const [id, name, role, department] of [['founder-fixture', 'Founder Fixture', 'founder', 'Leadership'], ['tani-fixture', 'Tani Fixture', 'employee', 'Marketing']]) {
    await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,email,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(id, id, id, name, role, role, department, id + '@example.test', '2026-01-01', hash, salt, stamp).run();
    await db.prepare('INSERT INTO onboarding(user_id) VALUES(?)').bind(id).run();
    await db.prepare("INSERT INTO member_connections VALUES(?,'gmail',?,'verified',?,?)").bind(id, id + '@example.test', stamp, stamp).run();
  }
  const base = String(await runtime.ready).replace(/\/$/, '');
  async function actor(username) {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}}), page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    assert.equal(await page.locator('.tel-helper').count(), 0);
    await page.locator('#login-form [name=username]').fill(username);
    await page.locator('#login-form [name=password]').fill(password);
    await page.locator('#login-form [type=submit]').click();
    await page.locator('.tel-helper-launcher').waitFor();
    await page.locator('.workspace #main h1').waitFor();
    return {context, page};
  }
  async function ask(page, query) {
    await page.locator('.tel-helper-launcher').click();
    await page.locator('#tel-helper-request').fill(query);
    await page.locator('.tel-helper form [type=submit]').click();
  }
  async function at(page, name) {
    await page.waitForURL('**/#' + name);
    await page.waitForFunction(() => !document.querySelector('#main .loading-message') && document.querySelector('#main h1'));
    assert.equal(await page.locator('.error-page').count(), 0);
  }
  const founder = await actor('founder-fixture'), member = await actor('tani-fixture');
  await member.context.request.post(base + '/api/activity/heartbeat', {headers: {Origin: base}, data: {client_id: '00000000-0000-4000-8000-000000000123', section: 'tasks', visible: true, focused: true, idle_seconds: 0}});
  await ask(founder.page, 'show the last heartbeat');
  await at(founder.page, 'monitor');
  await founder.page.locator('#tel-helper-heartbeat').waitFor();
  assert.match(await founder.page.locator('#tel-helper-heartbeat').innerText(), /Latest recorded heartbeat: .* IST\./);
  assert.equal(await founder.page.locator('#team-presence tr.tel-helper-highlight').count(), 1);
  assert.equal(await founder.page.evaluate(() => document.activeElement.id), 'tel-helper-heartbeat');
  checks.push('Founder heartbeat request opens the real activity API, highlights the latest recorded member and focuses a readable timestamp');
  await ask(founder.page, 'last heartbeat for Tani Fixture');
  await founder.page.locator('#tel-helper-heartbeat').waitFor();
  assert.match(await founder.page.locator('#tel-helper-heartbeat').innerText(), /^Tani Fixture · .* IST\./);
  assert.equal(await founder.page.locator('[data-heartbeat-user="tani-fixture"].tel-helper-highlight').count(), 1);
  checks.push('Named heartbeat requests select the correct member without changing access');
  for (const [query, route] of [['open my tasks', 'tasks'], ['email setup', 'connections'], ['HR tickets', 'grievances'], ['report chat', 'channel/marketing-reports']]) {
    await ask(founder.page, query); await at(founder.page, route);
    await founder.page.waitForFunction(() => document.querySelector('.tel-helper-panel').hidden);
  }
  checks.push('Tasks, email verification, HR tickets and report chat requests open their existing views');
  await ask(founder.page, 'reports');
  await founder.page.getByText('Which section did you mean?', {exact: true}).waitFor();
  assert.equal(await founder.page.locator('[data-helper-choices] button').count(), 2);
  await founder.page.locator('#tel-helper-request').fill('purple elephant');
  await founder.page.locator('.tel-helper form [type=submit]').click();
  await founder.page.getByText(/I couldn’t match that request/).waitFor();
  assert.equal(new URL(founder.page.url()).hash, '#channel/marketing-reports');
  await founder.page.locator('#tel-helper-request').press('Escape');
  assert.equal(await founder.page.locator('.tel-helper-launcher').getAttribute('aria-expanded'), 'false');
  assert.equal(await founder.page.evaluate(() => document.activeElement.className), 'tel-helper-launcher');
  checks.push('Ambiguous and unknown requests stay on the current page; Escape closes the helper and restores focus');
  await ask(member.page, 'last heartbeat');
  await member.page.getByText(/Team heartbeats are available to founders/).waitFor();
  assert.equal((await member.context.request.get(base + '/api/activity/report')).status(), 403);
  assert.equal(await member.page.locator('[data-helper-choices] button').filter({hasText: 'Activity'}).count(), 0);
  await member.page.locator('#tel-helper-request').press('Escape');
  checks.push('Member helper denies founder monitoring and the backend independently rejects the same access');
  await founder.page.goto(base + '/#people'); await founder.page.locator('#people-search').waitFor();
  for (const width of [320, 375, 393, 768, 1440]) {
    await founder.page.setViewportSize({width, height: 900});
    const geometry = await founder.page.evaluate(() => {
      const input = document.querySelector('#people-search'), glyph = input.closest('.search').querySelector('.svg');
      return {width: innerWidth, page: document.documentElement.scrollWidth, text: input.getBoundingClientRect().left + parseFloat(getComputedStyle(input).paddingLeft), icon: glyph.getBoundingClientRect().right};
    });
    assert.ok(geometry.page <= width, 'Page overflow: ' + JSON.stringify(geometry));
    assert.ok(geometry.text - geometry.icon >= 8, 'Search overlap: ' + JSON.stringify(geometry));
    await founder.page.locator('.tel-helper-launcher').click();
    const box = await founder.page.locator('.tel-helper-panel').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 900, 'Helper outside viewport');
    await founder.page.locator('.tel-helper-close').click();
  }
  checks.push('People search and floating helper fit 320,375,393,768 and1440px without overlap or page overflow');
  await founder.page.setViewportSize({width: 393, height: 852});
  await mkdir('tests/artifacts', {recursive: true});
  await founder.page.screenshot({path: 'tests/artifacts/helper-mobile-people.png', fullPage: true});
  await founder.page.locator('.tel-helper-launcher').click();
  await founder.page.screenshot({path: 'tests/artifacts/helper-mobile-open.png'});
  await founder.page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', {configurable: true, value: 400});
    Object.defineProperty(window.visualViewport, 'offsetTop', {configurable: true, value: 0});
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  const keyboardBox = await founder.page.locator('.tel-helper-panel').boundingBox();
  assert.ok(keyboardBox.y >= 0 && keyboardBox.y + keyboardBox.height <= 400, 'Keyboard covers the helper');
  await founder.page.locator('#tel-helper-request').focus();
  await founder.page.locator('#tel-helper-request').scrollIntoViewIfNeeded();
  const inputBox = await founder.page.locator('#tel-helper-request').boundingBox();
  assert.ok(inputBox.y >= 0 && inputBox.y + inputBox.height <= 400, 'Keyboard covers the request input');
  await founder.page.evaluate(() => {
    delete window.visualViewport.height; delete window.visualViewport.offsetTop;
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  checks.push('Helper and request input stay inside the visible viewport when a mobile keyboard covers the lower screen');
  await founder.page.locator('.tel-helper-close').click();
  await ask(founder.page, 'last heartbeat for Tani Fixture');
  await founder.page.locator('#tel-helper-heartbeat').waitFor();
  await founder.page.screenshot({path: 'tests/artifacts/helper-mobile-heartbeat.png', fullPage: true});
  await member.context.clearCookies();
  await member.page.goto(base);
  await member.page.locator('#login-form').waitFor();
  assert.equal(await member.page.locator('.tel-helper').count(), 0);
  assert.deepEqual(errors, []);
  checks.push('Helper disappears after logout; all checked flows have no browser JavaScript errors');
  await writeFile('tests/artifacts/browser-helper-report.json', JSON.stringify({passed: true, checks, errors}, null, 2));
  console.log(JSON.stringify({passed: true, count: checks.length, checks}, null, 2));
} catch (error) { console.error(error.stack); process.exitCode = 1; }
finally { await browser.close(); await runtime.dispose(); }
