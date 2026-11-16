import {Miniflare} from 'miniflare';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {hashPassword} from '../src/core.js';

// Local, disposable fixtures only. No live credentials or external deployment.
if (spawnSync(process.execPath, ['build.mjs'], {stdio: 'ignore'}).status) throw Error('Build failed');
const checks = [], errors = [], writes = [];
const runtime = new Miniflare({modules: true, scriptPath: 'dist/worker.js', compatibilityDate: '2026-07-30', host: '127.0.0.1', port: 0, d1Databases: {DB: 'helper-v28-fixture'}, bindings: {NOTIFICATION_CHANNELS: 'email'}});
const browser = await chromium.launch({headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox']});
try {
  const db = await runtime.getD1Database('DB');
  const original = ['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql','schema-chat-read.sql','schema-task-transfers.sql','schema-operational-email.sql','schema-urgent-email.sql','schema-flexible-work.sql','schema-hr-records.sql','schema-deadline-policy.sql'];
  for (const file of [...original, ...(await readdir('.')).filter(file => /^schema-.*\.sql$/.test(file) && !original.includes(file))]) await db.exec((await readFile(file, 'utf8')).replaceAll('\n', ' '));
  const password = 'LocalHelperOnly!2026', salt = '0123456789abcdef0123456789abcdef', hash = await hashPassword(password, salt), stamp = new Date().toISOString();
  const day = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  for (const [id, role, department] of [['helper-v28-founder', 'founder', 'Leadership'], ['helper-v28-member', 'employee', 'Strategy']]) {
    await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,email,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(id, id, id, id, 'Local fixture', role, department, id + '@example.test', '2026-01-01', hash, salt, stamp).run();
    await db.prepare('INSERT INTO onboarding(user_id) VALUES(?)').bind(id).run();
    await db.prepare("INSERT INTO member_connections VALUES(?,'gmail',?,'verified',?,?)").bind(id, id + '@example.test', stamp, stamp).run();
  }
  const founderId = 'helper-v28-founder', memberId = 'helper-v28-member';
  for (const [id, title, assignee] of [['helper-task', 'Fresh assignment <img src=x onerror=alert(1)>', founderId], ['other-task', 'OTHER PERSON TASK MUST NOT APPEAR', memberId]]) await db.prepare("INSERT INTO tasks(id,title,assignee_id,leader_id,department,priority,deadline,expected_deliverable,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'normal',?,'PRIVATE DELIVERABLE','todo',?,?,?)").bind(id, title, assignee, founderId, 'Strategy', day, founderId, stamp, stamp).run();
  const future = new Date(Date.now() + 86400000).toISOString();
  for (const [id, title, participants, creator] of [['helper-meeting', 'Fresh personal meeting', [founderId], memberId], ['other-meeting', 'OTHER PERSON MEETING MUST NOT APPEAR', [memberId], memberId]]) await db.prepare("INSERT INTO meetings(id,title,purpose,starts_at,participants_json,department,created_by,created_at,updated_at) VALUES(?,?,'PRIVATE PURPOSE',?,?,'Strategy',?,?,?)").bind(id, title, future, JSON.stringify(participants), creator, stamp, stamp).run();
  await db.prepare("INSERT INTO attendance_sessions(id,user_id,work_date,clock_in,state,active_started_at,active_seconds,updated_at) VALUES('helper-attendance',?,?,?,'working',?,3600,?)").bind(founderId, day, stamp, stamp, stamp).run();
  const base = String(await runtime.ready).replace(/\/$/, '');
  const context = await browser.newContext({viewport: {width: 375, height: 900}}), page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/api\/(tasks|meetings|grievances|messages|attendance|announcements)(?:\/|$)/.test(request.url()) && request.method() !== 'GET') writes.push(request.method() + ' ' + new URL(request.url()).pathname); });
  async function login(id) {
    await page.goto(base);
    await page.locator('#login-form [name=username]').fill(id);
    await page.locator('#login-form [name=password]').fill(password);
    await page.locator('#login-form [type=submit]').click();
    await page.locator('.workspace #main h1').waitFor();
    await page.locator('.tel-helper-launcher').waitFor();
  }
  async function open() { if (await page.locator('.tel-helper-panel').isHidden()) await page.locator('.tel-helper-launcher').click(); }
  async function ask(query) {
    await open();
    await page.locator('#tel-helper-request').fill(query);
    await page.locator('.tel-helper form [type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('.tel-helper form')?.hasAttribute('aria-busy'));
  }
  const lastAnswer = () => page.locator('.tel-helper-turn-assistant').last();
  async function at(name) {
    await page.waitForURL('**/#' + name);
    await page.waitForFunction(() => document.querySelector('#main h1') && !document.querySelector('#main .loading-message'));
    assert.equal(await page.locator('.error-page').count(), 0);
  }
  await login(founderId);
  await ask('What are my tasks?');
  assert.match(await lastAnswer().innerText(), /1 active assignment.*Fresh assignment/s);
  assert.doesNotMatch(await page.locator('[data-helper-history]').innerText(), /OTHER PERSON|PRIVATE DELIVERABLE/);
  assert.equal(await page.locator('.tel-helper img, .tel-helper script').count(), 0);
  assert.match(await lastAnswer().innerText(), /Checked .*\d{4}.*IST/);
  await db.prepare("UPDATE tasks SET title='Updated assignment from source',status='working' WHERE id='helper-task'").run();
  await ask('again');
  assert.match(await lastAnswer().innerText(), /Updated assignment from source.*In progress/s);
  await db.prepare("UPDATE tasks SET status='done' WHERE id='helper-task'").run();
  await ask('What are my tasks?');
  assert.match(await lastAnswer().innerText(), /no active assignments/);
  await page.route('**/api/tasks', request => request.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Local unavailable fixture'})}));
  await ask('What are my tasks?');
  assert.match(await lastAnswer().innerText(), /couldn’t check your current records/);
  assert.doesNotMatch(await lastAnswer().innerText(), /Updated assignment|no active assignments/);
  await page.unroute('**/api/tasks');
  checks.push('Personal task answers refetch current records, reflect edits and empty states, exclude other assignees and private deliverables, and render edited titles as text');
  let receiveTask, receiveMeeting;
  const heldTask = new Promise(resolve => { receiveTask = resolve; }), heldMeeting = new Promise(resolve => { receiveMeeting = resolve; });
  await page.route('**/api/tasks', request => receiveTask(request));
  await open(); await page.locator('#tel-helper-request').fill('What are my tasks?');
  await page.locator('.tel-helper form [type=submit]').click();
  const cancelledTask = await heldTask;
  await page.locator('.tel-helper-hide').click();
  await page.locator('.topbar .menu-btn').click();
  await page.locator('.sidebar-user').click();
  await page.locator('#tel-helper-enabled').check();
  await page.route('**/api/meetings', request => receiveMeeting(request));
  await open(); await page.locator('#tel-helper-request').fill('What are my upcoming meetings?');
  await page.locator('.tel-helper form [type=submit]').click();
  const currentMeeting = await heldMeeting;
  await cancelledTask.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({tasks: [{assignee_id: founderId, title: 'STALE CANCELLED TASK', status: 'todo', deadline: day}]})});
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.tel-helper form').getAttribute('aria-busy'), 'true');
  assert.doesNotMatch(await page.locator('[data-helper-history]').innerText(), /STALE CANCELLED TASK/);
  await currentMeeting.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({meetings: []})});
  await page.waitForFunction(() => !document.querySelector('.tel-helper form').hasAttribute('aria-busy'));
  assert.match(await lastAnswer().innerText(), /No upcoming meetings/);
  await page.unroute('**/api/tasks'); await page.unroute('**/api/meetings');
  checks.push('Hiding and restoring during a pending answer cancels its UI updates; a stale completion cannot replace the new conversation or unlock a newer pending request');
  await ask('What are my upcoming meetings?');
  assert.match(await lastAnswer().innerText(), /1 upcoming meeting.*Fresh personal meeting/s);
  assert.doesNotMatch(await lastAnswer().innerText(), /OTHER PERSON|PRIVATE PURPOSE/);
  await db.prepare("UPDATE meetings SET title='Updated meeting from source' WHERE id='helper-meeting'").run();
  await ask('again');
  assert.match(await lastAnswer().innerText(), /Updated meeting from source/);
  await ask('What is my work status?');
  assert.match(await lastAnswer().innerText(), /clocked in and working.*1h/s);
  await db.prepare("UPDATE attendance_sessions SET state='break',active_started_at=NULL,break_started_at=? WHERE id='helper-attendance'").bind(new Date().toISOString()).run();
  await ask('again');
  assert.match(await lastAnswer().innerText(), /on a break/);
  assert.ok(await page.locator('.tel-helper-turn').count() <= 12);
  const storage = await page.evaluate(() => JSON.stringify({local: {...localStorage}, session: {...sessionStorage}}));
  assert.doesNotMatch(storage, /Updated assignment|Updated meeting|PRIVATE|What are my/);
  checks.push('Meeting and work-status follow-ups use fresh personal source records and dated IST answers; conversation is bounded and not persisted in browser storage');
  await ask('status');
  assert.match(await lastAnswer().innerText(), /Which section did you mean/);
  assert.equal(await page.locator('[data-helper-choices] button').count(), 3);
  const previousRoute = new URL(page.url()).hash;
  await ask('Last heartbeat for Missing Person Fixture');
  assert.match(await lastAnswer().innerText(), /couldn’t match that team member/);
  assert.equal(new URL(page.url()).hash, previousRoute);
  assert.equal(await page.locator('[data-helper-choices] button').count(), 2);
  await ask('How do I submit a task?');
  assert.match(await lastAnswer().innerText(), /Submit deliverable/);
  await ask('How can I contact HR?');
  assert.match(await lastAnswer().innerText(), /I do not read HR tickets/);
  await ask('open announcements'); await at('announcements');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'announcements-board');
  await ask('open calendar'); await at('calendar');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'calendar-content');
  await ask('Contact HR'); await at('grievances');
  assert.match(await page.locator('#main h1').innerText(), /HR/i);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  checks.push('Ambiguous status requests offer choices; guided help explains existing forms; navigation focuses the actual announcements board and calendar content, and Contact HR opens its page');
  await page.goto(base + '/#channel/general');
  await page.locator('#message-form [type=submit]').waitFor();
  for (const width of [320, 375]) {
    await page.setViewportSize({width, height: 900});
    await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 1);
    const geometry = await page.evaluate(() => {
      const trigger = document.querySelector('.tel-helper-launcher').getBoundingClientRect(), send = document.querySelector('#message-form [type=submit]').getBoundingClientRect();
      const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return {page: document.documentElement.scrollWidth, width: trigger.width, height: trigger.height, overlap: overlaps(trigger, send)};
    });
    assert.ok(geometry.page <= width && geometry.width >= 44 && geometry.height >= 44);
    assert.equal(geometry.overlap, false);
    await open();
    const box = await page.locator('.tel-helper-panel').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 900);
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, 'height', {configurable: true, value: 400});
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.locator('#tel-helper-request').focus();
    const panel = await page.locator('.tel-helper-panel').boundingBox(), input = await page.locator('#tel-helper-request').boundingBox();
    assert.ok(panel.y >= 0 && panel.y + panel.height <= 400 && input.y >= 0 && input.y + input.height <= 400);
    await page.evaluate(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.locator('#tel-helper-request').press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'tel-helper-launcher');
  }
  checks.push('At 320px and 375px, the 44px header launcher clears the composer; panel and question input fit the keyboard viewport, and Escape restores focus');
  await open(); await page.locator('.tel-helper-hide').click();
  assert.equal(await page.locator('.tel-helper-launcher').count(), 0);
  await page.reload(); await page.locator('.workspace #main h1').waitFor();
  assert.equal(await page.locator('.tel-helper-launcher').count(), 0);
  await page.goto(base + '/#account'); await page.locator('#tel-helper-enabled').waitFor();
  assert.equal(await page.locator('#tel-helper-enabled').isChecked(), false);
  await page.locator('#tel-helper-enabled').check();
  await open(); await page.locator('.tel-helper-close').click();
  assert.equal(await page.locator('.tel-helper-launcher').getAttribute('aria-expanded'), 'false');
  await page.locator('[data-action=logout]').click(); await page.locator('#login-form').waitFor();
  await login(memberId);
  await open(); assert.equal(await page.locator('.tel-helper-turn').count(), 0);
  await ask('last heartbeat');
  assert.match(await lastAnswer().innerText(), /available to founders/);
  assert.equal((await context.request.get(base + '/api/activity/report')).status(), 403);
  await ask('people admin');
  assert.match(await lastAnswer().innerText(), /restricted for your role/);
  await page.locator('.tel-helper-clear').click();
  assert.equal(await page.locator('.tel-helper-turn').count(), 0);
  checks.push('X, Hide, reload and My account restoration preserve optional preferences; logout clears conversation, accounts stay separate, founder data remains restricted and Clear chat empties history');
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  checks.push('Helper interactions issue no work, meeting, attendance, HR, chat or announcement writes and produce no browser JavaScript errors');
  await mkdir('tests/artifacts', {recursive: true});
  await writeFile('tests/artifacts/browser-helper-v28-report.json', JSON.stringify({passed: true, checks, errors, writes}, null, 2));
  await page.screenshot({path: 'tests/artifacts/helper-v28-mobile.png'});
  console.log(JSON.stringify({passed: true, checks}, null, 2));
} catch (error) { console.error(error.stack); process.exitCode = 1; }
finally { await browser.close(); await runtime.dispose(); }
