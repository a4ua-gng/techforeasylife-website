import {Miniflare} from 'miniflare';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {hashPassword} from '../src/core.js';

if (spawnSync(process.execPath, ['build.mjs'], {stdio: 'ignore'}).status) throw Error('Build failed');
const checks = [], errors = [];
const runtime = new Miniflare({modules: true, scriptPath: 'dist/worker.js', compatibilityDate: '2026-07-30', host: '127.0.0.1', port: 0, d1Databases: {DB: 'helper-preference-fixture'}, bindings: {NOTIFICATION_CHANNELS: 'email'}});
const browser = await chromium.launch({headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox']});
try {
  const db = await runtime.getD1Database('DB');
  const originalSchemas = ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql','schema-chat-read.sql','schema-task-transfers.sql','schema-operational-email.sql','schema-urgent-email.sql','schema-flexible-work.sql','schema-hr-records.sql','schema-deadline-policy.sql','schema-announcements.sql','schema-grievance-access.sql'];
  const extraSchemas = (await readdir('.')).filter(file => /^schema-.*\.sql$/.test(file) && !originalSchemas.includes(file));
  for (const file of [...originalSchemas, ...extraSchemas]) await db.exec((await readFile(file, 'utf8')).replaceAll('\n', ' '));
  const password = 'LocalHelperPreference!2026', salt = '0123456789abcdef0123456789abcdef', hash = await hashPassword(password, salt), stamp = new Date().toISOString();
  for (const [id, name] of [['helper-first', 'First Helper Fixture'], ['helper-second', 'Second Helper Fixture']]) {
    await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,email,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(id, id, id, name, 'Founder fixture', 'founder', 'Leadership', id + '@example.test', '2026-01-01', hash, salt, stamp).run();
    await db.prepare('INSERT INTO onboarding(user_id) VALUES(?)').bind(id).run();
    await db.prepare("INSERT INTO member_connections VALUES(?,'gmail',?,'verified',?,?)").bind(id, id + '@example.test', stamp, stamp).run();
  }
  const base = String(await runtime.ready).replace(/\/$/, '');
  const context = await browser.newContext({viewport: {width: 393, height: 852}}), page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  async function login(username) {
    await page.goto(base);
    await page.locator('#login-form').waitFor();
    await page.locator('#login-form [name=username]').fill(username);
    await page.locator('#login-form [name=password]').fill(password);
    await page.locator('#login-form [type=submit]').click();
    await page.locator('.workspace #main h1').waitFor();
  }
  async function route(name) {
    await page.goto(base + '/#' + name);
    await page.waitForFunction(() => document.querySelector('#main h1') && !document.querySelector('#main .loading-message'));
    assert.equal(await page.locator('.error-page').count(), 0);
  }
  await login('helper-first');
  await page.locator('.top-actions > .tel-helper-launcher').waitFor();
  assert.equal(await page.locator('.tel-helper .tel-helper-launcher').count(), 0);
  await page.locator('.tel-helper-launcher').click();
  await page.locator('.tel-helper-close').click();
  assert.equal(await page.locator('.tel-helper-launcher').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'tel-helper-launcher');
  checks.push('Ask TEL uses reserved header space; X closes the panel and returns keyboard focus without disabling the helper');
  await page.locator('.tel-helper-launcher').click();
  await page.locator('.tel-helper-hide').click();
  await page.waitForFunction(() => !document.querySelector('.tel-helper-launcher') && !document.querySelector('.tel-helper'));
  await route('tasks');
  assert.equal(await page.locator('.tel-helper-launcher').count(), 0);
  await page.reload();
  await page.locator('.workspace #main h1').waitFor();
  assert.equal(await page.locator('.tel-helper-launcher').count(), 0);
  checks.push('Hide Ask TEL removes both launcher and panel and persists through navigation and reload');
  await route('account');
  await page.locator('#tel-helper-preference').waitFor();
  assert.equal(await page.locator('#tel-helper-enabled').isChecked(), false);
  await page.locator('#tel-helper-enabled').check();
  await page.locator('.top-actions > .tel-helper-launcher').waitFor();
  await page.reload();
  await page.locator('#tel-helper-preference').waitFor();
  assert.equal(await page.locator('#tel-helper-enabled').isChecked(), true);
  await page.locator('.tel-helper-launcher').click();
  await page.locator('#tel-helper-request').fill('open my tasks');
  await page.locator('.tel-helper form [type=submit]').click();
  await page.waitForURL('**/#tasks');
  await page.locator('#main h1').waitFor();
  assert.match(await page.locator('#main h1').innerText(), /task/i);
  checks.push('My account restores the optional helper; the saved preference and normal navigation commands still work');
  await route('channel/general');
  await page.locator('#message-form [type=submit]').waitFor();
  for (const width of [320, 375, 393, 768, 1440]) {
    await page.setViewportSize({width, height: 900});
    const geometry = await page.evaluate(() => {
      const trigger = document.querySelector('.tel-helper-launcher').getBoundingClientRect();
      const header = document.querySelector('.topbar').getBoundingClientRect();
      const send = document.querySelector('#message-form [type=submit]').getBoundingClientRect();
      const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const controls = Array.from(document.querySelectorAll('.top-actions > *')).filter(node => node !== document.querySelector('.tel-helper-launcher') && getComputedStyle(node).display !== 'none').map(node => node.getBoundingClientRect());
      return {width: innerWidth, page: document.documentElement.scrollWidth, triggerWidth: trigger.width, triggerHeight: trigger.height, insideHeader: trigger.top >= header.top && trigger.bottom <= header.bottom, composerOverlap: overlaps(trigger, send), adjacentOverlap: controls.some(rect => overlaps(trigger, rect))};
    });
    assert.ok(geometry.page <= width, 'Chat page overflow: ' + JSON.stringify(geometry));
    assert.ok(geometry.triggerWidth >= 44 && geometry.triggerHeight >= 44);
    assert.equal(geometry.insideHeader, true);
    assert.equal(geometry.composerOverlap, false);
    assert.equal(geometry.adjacentOverlap, false);
    await page.locator('.tel-helper-launcher').click();
    const panel = await page.locator('.tel-helper-panel').boundingBox();
    assert.ok(panel.x >= 0 && panel.x + panel.width <= width && panel.y >= 0 && panel.y + panel.height <= 900);
    await page.locator('#tel-helper-request').press('Escape');
  }
  checks.push('At320,375,393,768 and1440px the44px header control does not overlap neighbouring controls or the chat composer; the open panel fits');
  await page.setViewportSize({width: 393, height: 852});
  await page.locator('.tel-helper-launcher').click();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', {configurable: true, value: 400});
    Object.defineProperty(window.visualViewport, 'offsetTop', {configurable: true, value: 0});
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.locator('#tel-helper-request').scrollIntoViewIfNeeded();
  const keyboardBox = await page.locator('.tel-helper-panel').boundingBox(), inputBox = await page.locator('#tel-helper-request').boundingBox();
  assert.ok(keyboardBox.y >= 0 && keyboardBox.y + keyboardBox.height <= 400);
  assert.ok(inputBox.y >= 0 && inputBox.y + inputBox.height <= 400);
  await page.evaluate(() => { delete window.visualViewport.height; delete window.visualViewport.offsetTop; window.visualViewport.dispatchEvent(new Event('resize')); });
  await page.locator('#tel-helper-request').press('Escape');
  checks.push('The anchored helper and its input stay inside the visible screen when the mobile keyboard opens');
  await route('account');
  await page.locator('#tel-helper-enabled').uncheck();
  await page.locator('[data-action=logout]').click();
  await page.locator('#login-form').waitFor();
  assert.equal(await page.locator('.tel-helper').count(), 0);
  await login('helper-second');
  await page.locator('.tel-helper-launcher').waitFor();
  await route('account');
  await page.locator('#tel-helper-preference').waitFor();
  assert.equal(await page.locator('#tel-helper-enabled').isChecked(), true);
  await page.locator('[data-action=logout]').click();
  await page.locator('#login-form').waitFor();
  await login('helper-first');
  await route('account');
  await page.locator('#tel-helper-preference').waitFor();
  assert.equal(await page.locator('#tel-helper-enabled').isChecked(), false);
  assert.equal(await page.locator('.tel-helper-launcher').count(), 0);
  checks.push('Hidden preferences stay separate for two accounts using the same browser; the helper disappears on logout');
  await page.locator('#tel-helper-enabled').check();
  await page.locator('.tel-helper-launcher').click();
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 1);
  await mkdir('tests/artifacts', {recursive: true});
  await page.screenshot({path: 'tests/artifacts/helper-optional-mobile.png'});
  assert.deepEqual(errors, []);
  await writeFile('tests/artifacts/browser-helper-preference-report.json', JSON.stringify({passed: true, checks, errors}, null, 2));
  console.log(JSON.stringify({passed: true, count: checks.length, checks}, null, 2));
} catch (error) { console.error(error.stack); process.exitCode = 1; }
finally { await browser.close(); await runtime.dispose(); }
