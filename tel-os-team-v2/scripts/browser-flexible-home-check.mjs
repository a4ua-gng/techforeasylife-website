import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare, Log, LogLevel} from 'miniflare';
import {chromium} from 'playwright';

// Entirely disposable fixtures. This check never reads credentials or sends email.
const checks = [], errors = [], screenshots = [], geometry = [];
const artifacts = 'tests/artifacts';
const fixtures = [
  ['founder', 'Avery Founder', 'founder', 'Leadership', null, 'active'],
  ['hr', 'Robin People', 'hr_lead', 'HR', 'founder', 'active'],
  ['arc-lead', 'Casey Creative', 'team_lead', 'Marketing', 'founder', 'active'],
  ['arc-member', 'Morgan Creative', 'employee', 'Marketing', 'arc-lead', 'active'],
  ['working-member', 'Sam Studio', 'employee', 'Marketing', 'arc-lead', 'active'],
  ['finance', 'Jordan Finance', 'employee', 'Finance', 'founder', 'on_leave'],
];
const digest = value => createHash('sha256').update(value).digest('hex');
let runtime, browser;

async function assets() {
  const result = {};
  async function visit(folder = '') {
    for (const entry of await readdir('public/' + folder, {withFileTypes: true})) {
      const path = folder ? folder + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await visit(path);
      else if (!['index.html', 'styles.css', 'app.js'].includes(path)) {
        const ext = path.split('.').at(-1);
        result['/' + path] = {base64: (await readFile('public/' + path)).toString('base64'), type: {js: 'application/javascript; charset=utf-8', css: 'text/css; charset=utf-8', webp: 'image/webp', svg: 'image/svg+xml', woff: 'font/woff', ttf: 'font/ttf'}[ext] || 'application/octet-stream'};
      }
    }
  }
  await visit();
  return result;
}

async function ready(page) {
  await page.locator('.flexible-timeline').waitFor();
  await page.waitForFunction(() => !document.querySelector('#main .loading-message'));
  assert.equal(await page.locator('.error-page').count(), 0);
  await page.evaluate(() => document.fonts.ready);
}

async function settleNavigation(page) {
  await page.waitForFunction(() => {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || sidebar.classList.contains('open')) return true;
    const bounds = sidebar.getBoundingClientRect();
    return innerWidth <= 900 ? bounds.right <= 1 : bounds.left >= -1;
  });
}

async function geometryCheck(page, id, width, height = 900) {
  await page.setViewportSize({width, height});
  await settleNavigation(page);
  await page.evaluate(() => scrollTo(0, 0));
  const result = await page.evaluate(() => {
    const visible = element => { const r = element.getBoundingClientRect(), s = getComputedStyle(element); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
    const main = document.querySelector('#main');
    const overflow = [...main.querySelectorAll('*')].filter(visible).filter(element => { const r = element.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).slice(0, 5).map(element => element.className);
    const targets = [...main.querySelectorAll('.flexible-hr-shortcut a,.flexible-timeline .link-btn,.flexible-task-link,.flexible-meeting-link,.flexible-presence-more summary,.clock-panel .btn')].filter(visible).map(element => ({label: element.innerText, height: element.getBoundingClientRect().height}));
    return {width: innerWidth, document: document.documentElement.scrollWidth, overflow, targets};
  });
  assert.ok(result.document <= width + 1, id + ' page overflow at ' + width);
  assert.deepEqual(result.overflow, [], id + ' content overflow at ' + width);
  for (const target of result.targets) assert.ok(target.height >= 43.5, id + ' target too small: ' + JSON.stringify(target));
  geometry.push({id, width, height, minimumTarget: Math.min(...result.targets.map(target => target.height))});
}

try {
  await mkdir(artifacts, {recursive: true});
  const html = await readFile('public/index.html', 'utf8');
  assert.match(html, /flexible-home\.css/, 'Load flexible-home.css after workspace-polish.css');
  assert.match(html, /flexible-home\.js/, 'Load flexible-home.js after workspace-polish.js');
  assert.ok(html.indexOf('/flexible-home.js') > html.indexOf('/workspace-polish.js'));
  const definitions = {__HTML__: html, __CSS__: await readFile('public/styles.css', 'utf8'), __APP__: await readFile('public/app.js', 'utf8'), __BINARY_ASSETS__: await assets()};
  const compiled = await build({entryPoints: ['src/worker.js'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, define: Object.fromEntries(Object.entries(definitions).map(([key, value]) => [key, JSON.stringify(value)]))});
  runtime = new Miniflare({modules: true, script: compiled.outputFiles[0].text, compatibilityDate: '2026-07-30', host: '127.0.0.1', port: 0, d1Databases: {DB: 'flexible-home-disposable'}, log: new Log(LogLevel.NONE), bindings: {NOTIFICATION_CHANNELS: 'email'}, outboundService: async () => { throw Error('External requests are blocked during Home QA.'); }});
  const db = await runtime.getD1Database('DB');
  const baseSchemas = ['schema-core.sql', 'schema-workflows.sql', 'schema-collaboration.sql', 'schema-schedules.sql', 'schema-extensions.sql', 'schema-chat-read.sql', 'schema-task-transfers.sql', 'schema-operational-email.sql', 'schema-urgent-email.sql'];
  const additionalSchemas = (await readdir('.')).filter(name => /^schema-.*\.sql$/.test(name) && !baseSchemas.includes(name)).sort();
  for (const file of [...baseSchemas, ...additionalSchemas]) await db.exec((await readFile(file, 'utf8')).replaceAll('\n', ' '));
  const stamp = new Date().toISOString(), today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date()), tokens = new Map();
  for (const [id, name, role, department, manager, status] of fixtures) {
    await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,manager_id,status,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(id, 'QA-' + id, 'qa-' + id, name, role === 'founder' ? 'Co-founder' : role === 'team_lead' ? 'Creative lead' : role === 'hr_lead' ? 'People operations' : 'Team member', role, department, manager, status, '2026-01-01', 'local-unused-hash', 'local-unused-salt', stamp).run();
    await db.prepare("INSERT INTO member_connections(user_id,provider,account,status,verified_at,updated_at) VALUES(?,'gmail',?,'verified',?,?)").bind(id, id + '@example.test', stamp, stamp).run();
    await db.prepare('INSERT INTO onboarding(user_id) VALUES(?)').bind(id).run();
    if (id !== 'working-member') {
      const token = randomBytes(32).toString('hex'); tokens.set(id, token);
      await db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(digest(token), id, stamp, new Date(Date.now() + 3_600_000).toISOString()).run();
    }
  }
  await db.prepare("INSERT INTO app_settings(key,value) VALUES('attendance_mode','flexible') ON CONFLICT(key) DO UPDATE SET value='flexible'").run();
  for (const [id, title, deadline, status] of [['current-brief', 'Shape the launch concept', today, 'working'], ['finished-brief', 'Finished campaign brief', today, 'done']]) {
    await db.prepare('INSERT INTO tasks(id,title,description,assignee_id,leader_id,department,priority,deadline,expected_deliverable,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, title, 'Synthetic local brief', 'arc-member', 'arc-lead', 'Marketing', 'normal', deadline, 'Share the design and rationale', status, 'arc-lead', stamp, stamp).run();
  }
  await db.prepare("INSERT INTO tasks(id,title,description,assignee_id,leader_id,department,priority,deadline,expected_deliverable,status,created_by,created_at,updated_at) VALUES('review-brief','Review the visual direction','Synthetic local review','working-member','arc-lead','Marketing','normal',?,'Concept for review','review','arc-lead',?,?)").bind(today, stamp, stamp).run();
  const meetingTime = new Date(Date.now() + 2 * 3_600_000).toISOString();
  for (const [id, title, starts] of [['upcoming', 'Creative check-in', meetingTime], ['past', 'Previous creative check-in', new Date(Date.now() - 2 * 3_600_000).toISOString()]]) {
    await db.prepare("INSERT INTO meetings(id,title,purpose,starts_at,participants_json,department,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'Marketing','arc-lead',?,?)").bind(id, title, 'Synthetic local discussion', starts, JSON.stringify(['founder', 'arc-lead', 'arc-member']), stamp, stamp).run();
  }
  const started = new Date(Date.now() - 3_600_000).toISOString();
  await db.prepare("INSERT INTO attendance_sessions(id,user_id,work_date,clock_in,state,active_started_at,active_seconds,updated_at) VALUES('working-fixture','working-member',?,?,'working',?,0,?)").bind(today, started, started, stamp).run();
  checks.push('Disposable synthetic accounts, real local task/meeting/attendance APIs; external deliveries are blocked');
  const origin = String(await runtime.ready).replace(/\/$/, '');
  browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  const views = new Map();
  for (const id of ['founder', 'hr', 'arc-lead', 'arc-member', 'finance']) {
    const context = await browser.newContext({viewport: {width: 1440, height: 1100}});
    await context.addCookies([{name: '__Host-tel_session', value: tokens.get(id), domain: new URL(origin).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict'}]);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(id + ': ' + error.message));
    page.on('response', response => { if (response.status() >= 500) errors.push(id + ': ' + response.status() + ' ' + new URL(response.url()).pathname); });
    await page.goto(origin + '/#home'); await ready(page);
    const sourceOrder = await page.evaluate(() => {
      const hr = document.querySelector('.flexible-hr-shortcut'), timeline = document.querySelector('.flexible-timeline'), hero = document.querySelector('.workspace-hero');
      return {hrBeforeTimeline: Boolean(hr.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING), timelineBeforeHero: Boolean(timeline.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING)};
    });
    assert.deepEqual(sourceOrder, {hrBeforeTimeline: true, timelineBeforeHero: true});
    assert.match(await page.locator('.flexible-hr-shortcut').innerText(), /register a complaint.*Private to you and authorised reviewers/s);
    assert.equal(await page.locator('.flexible-hr-shortcut a[href="#grievances"]').count(), 1);
    assert.equal(await page.locator('.nav-scroll > .flexible-hr-nav[href="#grievances"]').count(), 1);
    assert.equal(await page.locator('.flexible-workday .schedule-summary').count(), 0);
    assert.equal(await page.locator('.flexible-workday .flexible-policy-note').count(), 1);
    assert.equal(await page.locator('.flexible-workday [data-clock]').count(), 1);
    if (id !== 'finance') assert.match(await page.locator('.flexible-workday .clock-panel').innerText(), /Not Clocked In/);
    assert.doesNotMatch(await page.locator('.flexible-today-grid').innerText(), /5:00 pm|17:00|scheduled start|missed.clock.in|clocked in late/i);
    const member = page.locator('[data-home-presence-user="arc-member"]');
    assert.match(await member.innerText(), /Not clocked in.*Signed in/s);
    assert.match(await page.locator('[data-home-presence-user="working-member"]').innerText(), /Working.*Signed out/s);
    assert.match(await page.locator('.clocked-in').innerText(), /Sam Studio/);
    assert.match(await page.locator('.clocked-out').innerText(), /Morgan Creative/);
    if (id === 'arc-member') {
      assert.match(await page.locator('.flexible-timeline').innerText(), /Shape the launch concept/);
      assert.doesNotMatch(await page.locator('.flexible-timeline').innerText(), /Finished campaign brief|Previous creative check-in/);
      const expectedTime = new Intl.DateTimeFormat('en-IN', {timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit'}).format(new Date(meetingTime));
      assert.match(await page.locator('.flexible-meeting-link').innerText(), /Creative check-in/);
      assert.ok((await page.locator('.flexible-meeting-link').innerText()).includes(expectedTime));
      assert.equal(await page.locator('#main [data-action="new-person"],#main [data-action="new-task"]').count(), 0);
    }
    if (id === 'arc-lead') assert.match(await page.locator('.flexible-timeline').innerText(), /Review the visual direction.*Ready for your review/s);
    if (id === 'founder') assert.match(await page.locator('.workspace-primary').innerText(), /Departments at a glance/);
    if (id === 'hr') assert.match(await page.locator('.workspace-primary').innerText(), /People actions needing attention/);
    if (id === 'finance') { assert.equal(await page.locator('[data-finance-leave]').count(), 1); assert.equal(await page.locator('[data-action="clock"][data-value="clock_in"]').count(), 0); }
    for (const width of [320, 375, 768, 1440]) await geometryCheck(page, id, width);
    if (['founder', 'hr', 'arc-member'].includes(id)) for (const width of [375, 1440]) {
      await page.setViewportSize({width, height: width === 375 ? 900 : 1100}); await settleNavigation(page); await page.evaluate(() => scrollTo(0, 0));
      const path = artifacts + '/flexible-home-v27-' + id + '-' + width + '.png'; await page.screenshot({path, fullPage: true}); screenshots.push(path);
    }
    views.set(id, {page, context});
  }
  checks.push('Founder, HR, Team ARC lead/member and on-leave Finance preserve role actions; Contact HR is beside the welcome and in primary navigation');
  checks.push('Timeline uses actual open tasks, review responsibilities and upcoming meeting times; completed tasks and past meetings are excluded');
  checks.push('Flexible Home has no fixed 5 PM start or missed-clock-in language; live clock controls and four-hour working plan remain');
  checks.push('Clocked-in and not-clocked-in lists distinguish working, break/leave status and authenticated sign-in independently');
  checks.push('All five roles fit 320, 375, 768 and 1440px with 44px tested controls and no horizontal overflow');

  for (const [id, view] of views) {
    await view.page.goto(origin + '/#attendance');
    await view.page.locator('.flexible-schedule-summary').waitFor();
    assert.equal(await view.page.locator('.error-page').count(), 0);
    assert.doesNotMatch(await view.page.locator('.flexible-schedule-summary').innerText(), /5:00 pm|17:00|before your start|missing|late|scheduled start/i);
    assert.match(await view.page.locator('.page-title p').innerText(), /Clock in when you begin/);
    if (await view.page.locator('.flexible-arrangements').count()) assert.doesNotMatch(await view.page.locator('.flexible-arrangements').textContent(), /5:00 pm|17:00|missed|start time/i);
    await view.page.setViewportSize({width: 375, height: 900});
    await settleNavigation(view.page);
    assert.ok(await view.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), id + ' Attendance overflows');
    if (['founder', 'arc-member'].includes(id)) {
      const path = artifacts + '/flexible-attendance-v27-' + id + '-375.png';
      await view.page.screenshot({path, fullPage: true}); screenshots.push(path);
    }
    await view.page.goto(origin + '/#guide');
    await view.page.locator('.guide-reminders').waitFor();
    assert.doesNotMatch(await view.page.locator('#main').innerText(), /5:00 pm|17:00|missed.start|regular start is|At your start time|scheduled clock.in/i);
    await view.page.goto(origin + '/#home'); await ready(view.page);
  }
  checks.push('All five roles see flexible Attendance and beginner guidance with no false fixed-start or missed-start notices; Attendance fits 375px');

  const arc = views.get('arc-member'), founder = views.get('founder');
  await arc.page.setViewportSize({width: 375, height: 900});
  await arc.page.emulateMedia({reducedMotion: 'reduce'});
  await arc.page.locator('.flexible-task-link[data-id="current-brief"]').click();
  await arc.page.locator('dialog[open]').waitFor(); assert.match(await arc.page.locator('dialog').innerText(), /Share the design and rationale/);
  await arc.page.locator('[data-action="close-dialog"]').first().click();
  await arc.page.locator('.flexible-meeting-link[data-id="upcoming"]').click();
  await arc.page.locator('dialog[open]').waitFor(); assert.match(await arc.page.locator('dialog').innerText(), /Creative check-in/);
  await arc.page.locator('[data-action="close-dialog"]').first().click();
  async function clock(action) {
    const pending = arc.page.waitForResponse(response => new URL(response.url()).pathname === '/api/attendance' && response.request().method() === 'POST');
    await arc.page.locator('[data-action="clock"][data-value="' + action + '"]').click();
    const result = await pending; assert.ok(result.ok(), await result.text()); await ready(arc.page);
  }
  await clock('clock_in'); await arc.page.locator('[data-action="clock"][data-value="pause"]').waitFor();
  const timer = arc.page.locator('[data-clock]'), before = await timer.innerText();
  await arc.page.waitForTimeout(2100); assert.notEqual(await timer.innerText(), before, 'Live attendance timer ticks on Home');
  await founder.page.evaluate(() => window.refreshFlexibleHomePresence());
  assert.match(await founder.page.locator('.clocked-in [data-home-presence-user="arc-member"]').innerText(), /Working.*Signed in/s);
  await clock('pause'); await arc.page.locator('[data-action="clock"][data-value="resume"]').waitFor();
  const paused = await timer.innerText(); await arc.page.waitForTimeout(2100); assert.equal(await timer.innerText(), paused, 'Break freezes active seconds');
  await founder.page.evaluate(() => window.refreshFlexibleHomePresence());
  assert.match(await founder.page.locator('.clocked-in [data-home-presence-user="arc-member"]').innerText(), /On a break.*Signed in/s);
  await clock('resume'); await arc.page.locator('[data-action="clock"][data-value="pause"]').waitFor();
  await clock('clock_out'); await arc.page.locator('[data-action="clock"][data-value="clock_in"]').waitFor();
  await founder.page.evaluate(() => window.refreshFlexibleHomePresence());
  assert.match(await founder.page.locator('.clocked-out [data-home-presence-user="arc-member"]').innerText(), /Not clocked in.*Signed in/s);
  checks.push('Real Home task/meeting dialogs open; clock in, ticking timer, paused break, resume and clock out work at 375px with reduced motion');
  checks.push('Home team presence refreshes working → break → not clocked in while sign-in remains independent');
  await arc.page.locator('.flexible-hr-shortcut a').click();
  await arc.page.locator('[data-action="new-grievance"]').waitFor();
  assert.equal(new URL(arc.page.url()).hash, '#grievances');
  checks.push('Contact HR opens the actual private HR ticket route');
  await db.prepare("UPDATE app_settings SET value='fixed' WHERE key='attendance_mode'").run();
  await founder.page.reload(); await ready(founder.page);
  assert.equal(await founder.page.locator('.flexible-workday .schedule-summary').count(), 1);
  assert.equal(await founder.page.locator('.flexible-workday .flexible-policy-note').count(), 0);
  await db.prepare("UPDATE app_settings SET value='flexible' WHERE key='attendance_mode'").run();
  await founder.page.reload(); await ready(founder.page);
  checks.push('Optional fixed mode still uses the existing schedule card; switching back restores the flexible plan');
  await geometryCheck(founder.page, 'founder-landscape', 812, 375);
  await founder.page.evaluate(() => { document.documentElement.style.fontSize = '125%'; });
  await geometryCheck(founder.page, 'founder-large-text', 375);
  checks.push('Landscape and enlarged text layouts fit without horizontal overflow');
  assert.deepEqual(errors, []); checks.push('No browser JavaScript errors or server 500 responses');
  await writeFile(artifacts + '/browser-flexible-home-report.json', JSON.stringify({passed: true, checks, geometry, screenshots, errors}, null, 2));
  console.log(JSON.stringify({passed: true, count: checks.length, checks, screenshots}, null, 2));
} catch (error) {
  await mkdir(artifacts, {recursive: true});
  await writeFile(artifacts + '/browser-flexible-home-report.json', JSON.stringify({passed: false, checks, geometry, screenshots, errors, error: String(error.stack)}, null, 2));
  console.error(error.stack); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (runtime) await runtime.dispose();
}
