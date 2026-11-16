import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Miniflare, Log, LogLevel} from 'miniflare';
import {chromium} from 'playwright';

export const artifacts = 'tests/artifacts';
export const istDay = value => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'}).format(value);
export const addDays = (day, count) => new Date(Date.parse(day + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10);

// These checks exercise the actual Worker, permissions and forms against a new
// in-memory D1 database. Any attempt to deliver email or leave localhost fails.
export async function createFixture(name) {
  const errors = [], external = [], tokens = new Map(), snapshots = [];
  const assets = {};
  async function visit(folder = '') {
    for (const entry of await readdir('public/' + folder, {withFileTypes: true})) {
      const path = folder ? folder + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await visit(path);
      else if (!['index.html', 'styles.css', 'app.js'].includes(path)) assets['/' + path] = {base64: (await readFile('public/' + path)).toString('base64'), type: ({js: 'application/javascript', css: 'text/css', webp: 'image/webp', svg: 'image/svg+xml', woff: 'font/woff'})[path.split('.').at(-1)] || 'application/octet-stream'};
    }
  }
  await visit();
  const html = await readFile('public/index.html', 'utf8');
  for (const asset of ['calendar-planner.js', 'calendar-planner.css', 'interface-polish-v28.js', 'interface-polish-v28.css']) assert.ok(html.includes(asset), 'Missing integration: ' + asset);
  const compiled = await build({entryPoints: ['src/worker.js'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, define: {__HTML__: JSON.stringify(html), __CSS__: JSON.stringify(await readFile('public/styles.css', 'utf8')), __APP__: JSON.stringify(await readFile('public/app.js', 'utf8')), __BINARY_ASSETS__: JSON.stringify(assets)}});
  const runtime = new Miniflare({modules: true, script: compiled.outputFiles[0].text, compatibilityDate: '2026-07-30', d1Databases: {DB: name}, host: '127.0.0.1', port: 0, log: new Log(LogLevel.NONE), bindings: {NOTIFICATION_CHANNELS: 'email'}, outboundService: async request => { external.push(request.url); throw Error('External delivery blocked in local browser QA'); }});
  const db = await runtime.getD1Database('DB');
  for (const file of ['schema-core.sql', 'schema-workflows.sql', 'schema-collaboration.sql', 'schema-schedules.sql', 'schema-extensions.sql', 'schema-chat-read.sql', 'schema-task-transfers.sql', 'schema-operational-email.sql', 'schema-urgent-email.sql', 'schema-flexible-work.sql', 'schema-hr-records.sql', 'schema-deadline-policy.sql', 'schema-announcements.sql']) await db.exec((await readFile(file, 'utf8')).replaceAll('\n', ' '));
  const stamp = new Date().toISOString(), today = istDay(new Date()), previous = addDays(today, -1), nextMonth = addDays(today.slice(0, 7) + '-28', 5).slice(0, 7) + '-05';
  const actors = [['founder', 'Avery Founder', 'founder', 'Leadership', null], ['hr', 'Robin People', 'hr_lead', 'HR', 'founder'], ['lead', 'Casey Creative', 'team_lead', 'Marketing', 'founder'], ['member', 'Morgan Creative', 'employee', 'Marketing', 'lead'], ['peer', 'Taylor Creative', 'employee', 'Marketing', 'lead'], ['outside', 'Jordan Strategy', 'employee', 'Strategy', 'founder']];
  for (const [id, name, role, department, manager] of actors) {
    await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,manager_id,status,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(id, 'QA-' + id, 'qa-' + id, name, 'Team member', role, department, manager, 'active', '2026-01-01', 'local-only', 'local-only', stamp).run();
    await db.prepare("INSERT INTO member_connections(user_id,provider,account,status,verified_at,updated_at) VALUES(?,'gmail',?,'verified',?,?)").bind(id, id + '@example.test', stamp, stamp).run();
  }
  async function issueSession(id) {
    const token = randomBytes(32).toString('hex'); tokens.set(id, token);
    await db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(createHash('sha256').update(token).digest('hex'), id, stamp, new Date(Date.now() + 3600000).toISOString()).run();
    return token;
  }
  for (const [id] of actors) await issueSession(id);
  const taskRows = [['own-task', 'Prepare the campaign concept and research-backed recommendations', 'member', 'lead', 'Marketing', 'working', today], ['own-future', 'Next month concept handoff', 'member', 'lead', 'Marketing', 'todo', nextMonth], ['own-approved', 'Approved item awaiting final completion', 'member', 'lead', 'Marketing', 'approved', today], ['own-done', 'Completed item must stay out of calendar', 'member', 'lead', 'Marketing', 'done', today], ['peer-review', 'Review the detailed campaign brief and launch checklist', 'peer', 'lead', 'Marketing', 'review', today], ['founder-task', 'Write the founder decision brief', 'founder', 'founder', 'Leadership', 'todo', today], ['secret-task', 'PRIVATE_STRATEGY_TASK', 'outside', 'founder', 'Strategy', 'working', today]];
  for (const [id, title, owner, leader, department, status, deadline] of taskRows) await db.prepare("INSERT INTO tasks(id,title,description,assignee_id,leader_id,department,priority,deadline,expected_deliverable,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,'normal',?,'Synthetic deliverable',?,?,?,?)").bind(id, title, 'Local QA fixture', owner, leader, department, deadline, status, leader, stamp, stamp).run();
  for (const [id, actor, action, task] of [['qa-start','member','task.start','own-task'],['qa-review','peer','task.submit','peer-review']]) await db.prepare("INSERT INTO audit_events(id,actor_id,action,entity,entity_id,details,created_at) VALUES(?,?,?,'task',?,'PRIVATE_AUDIT_DETAILS',?)").bind(id,actor,action,task,stamp).run();
  await db.prepare("INSERT INTO deadline_extension_records(id,task_id,assignee_id,leader_id,original_deadline,extended_deadline,created_at) VALUES('ext-own','own-task','member','lead',?,?,?)").bind(previous, today, stamp).run();
  const meetings = [['own-meeting', 'Creative planning with a complete and readable agenda', previous + 'T20:00:00.000Z', ['member'], 'Marketing'], ['team-meeting', 'TeMark team planning', today + 'T12:00:00.000Z', ['peer'], 'Marketing'], ['private-meeting', 'PRIVATE_STRATEGY_MEETING', today + 'T12:00:00.000Z', ['outside'], 'Strategy']];
  for (const [id, title, starts, participants, department] of meetings) await db.prepare("INSERT INTO meetings(id,title,purpose,starts_at,participants_json,department,created_by,created_at,updated_at) VALUES(?,?,'Synthetic local meeting',?,?,?,'lead',?,?)").bind(id, title, starts, JSON.stringify(participants), department, stamp, stamp).run();
  await db.prepare("INSERT INTO leave_requests(id,user_id,type,start_date,end_date,reason,status,leader_id,handover_to,handover_notes,created_at,updated_at) VALUES('approved-leave','outside','medical',?,?,'PRIVATE_MEDICAL_REASON','approved','founder','peer','Work cover: complete the shared research handover',?,?)").bind(today, addDays(today, 2), stamp, stamp).run();
  await db.prepare("INSERT INTO availability(id,user_id,kind,start_date,end_date,notes,created_at) VALUES('own-availability','member','weekly_schedule',?,?,'Shared work availability: afternoons in IST',?)").bind(today, addDays(today, 3), stamp).run();
  await db.prepare("INSERT INTO availability(id,user_id,kind,start_date,end_date,notes,created_at) VALUES('peer-availability','peer','unavailable',?,?,'Shared team availability',?)").bind(today, today, stamp).run();
  await db.prepare("INSERT INTO work_holidays(id,date,title,created_by,created_at) VALUES('holiday',?,'Company planning holiday','founder',?)").bind(nextMonth, stamp).run();
  const origin = String(await runtime.ready).replace(/\/$/, '');
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  const contexts = [];
  async function pageFor(id, width = 1440) {
    const context = await browser.newContext({viewport: {width, height: 1000}}); contexts.push(context);
    await context.addCookies([{name: '__Host-tel_session', value: tokens.get(id), domain: new URL(origin).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict'}]);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (external.push(route.request().url()), route.abort()));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(id + ': ' + error.message));
    page.on('response', response => {if (response.status() >= 500) errors.push(id + ': ' + response.status() + ' ' + new URL(response.url()).pathname);});
    return {page, context};
  }
  async function shot(page, label, width) {
    await page.setViewportSize({width, height: 1000}); if(width<=900)await page.waitForFunction(()=>!document.querySelector('.sidebar')||document.querySelector('.sidebar').getBoundingClientRect().right<=1); await page.evaluate(() => {document.activeElement?.blur(); scrollTo(0, 0);});
    const path = artifacts + '/' + name + '-' + label + '-' + width + '.png'; await page.screenshot({path, fullPage: true}); snapshots.push(path);
  }
  return {runtime, db, browser, contexts, errors, external, snapshots, actors, today, nextMonth, origin, tokens, pageFor, shot, issueSession, close: async () => {await browser.close(); await runtime.dispose();}};
}

export async function geometry(page, width, selector = '#main') {
  await page.setViewportSize({width, height: 1000});
  const result = await page.evaluate(selector => {
    const host = document.querySelector(selector), visible = element => {const r = element.getBoundingClientRect(), s = getComputedStyle(element);for(let parent=element;parent&&parent!==host;parent=parent.parentElement){const bounds=parent.getBoundingClientRect(),style=getComputedStyle(parent);if(style.clipPath!=='none'&&bounds.width<=1&&bounds.height<=1)return false;}return s.display !== 'none' && s.visibility !== 'hidden' && r.width && r.height;};
    const overflow = [...host.querySelectorAll('*')].filter(visible).filter(element => {const r = element.getBoundingClientRect();return r.left < -1 || r.right > innerWidth + 1;}).slice(0, 5).map(element => ({tag: element.tagName, class: element.className, text: element.textContent.slice(0, 60)}));
    const targets = [...host.querySelectorAll('button,.btn,.link-btn,input[type="date"],select')].filter(visible).map(element => ({label: element.textContent.trim().slice(0, 60) || element.getAttribute('aria-label') || element.id, height: element.getBoundingClientRect().height}));
    return {document: document.documentElement.scrollWidth, width: innerWidth, overflow, targets};
  }, selector);
  assert.ok(result.document <= width + 1, 'Page overflow at ' + width + ': ' + JSON.stringify(result));
  assert.deepEqual(result.overflow, [], 'Content exceeds viewport at ' + width);
  for (const target of result.targets) assert.ok(target.height >= 43.5, 'Small target at ' + width + ': ' + JSON.stringify(target));
  return {width, document: result.document, smallestTarget: Math.min(...result.targets.map(target => target.height))};
}

async function run() {
  let fixture; const checks = [], measurements = [];
  try {
    await mkdir(artifacts, {recursive: true}); fixture = await createFixture('calendar-planner');
    const {page, context} = await fixture.pageFor('member');
    await page.goto(fixture.origin + '/#calendar'); await page.locator('#calendar-selected-day').waitFor();
    assert.equal(await page.locator('#calendar-content').count(), 1);
    assert.equal(await page.locator('[data-calendar-event="task-own-task"]').count(), 1);
    assert.equal(await page.locator('[data-calendar-event="task-peer-review"]').count(), 0);
    assert.equal(await page.locator('[data-calendar-event="meeting-private-meeting"]').count(), 0);
    assert.equal(await page.locator('[data-calendar-event="task-own-approved"],[data-calendar-event="task-own-done"]').count(), 0);
    assert.match(await page.locator('[data-calendar-event="task-own-task"]').innerText(), /Original due/);
    assert.equal(await page.locator('[data-calendar-event="meeting-own-meeting"]').count(), 1, 'IST midnight must match the selected day');
    const calendar = await (await context.request.get(fixture.origin + '/api/calendar')).json();
    assert.ok(!JSON.stringify(calendar).includes('PRIVATE_MEDICAL_REASON'));
    assert.ok(!await page.locator('#calendar-content').innerText().then(text => /PRIVATE_|Medical leave/i.test(text)));
    assert.match(await page.locator('[data-calendar-event="leave-approved-leave"]').innerText(), /Work cover:/);
    checks.push('Real scoped APIs exclude another employee’s task and unrelated meetings; IST meeting dates, active deadlines, extensions and safe handovers appear without private leave reasons');
    await page.locator('[data-calendar-event="task-own-task"] button').click(); await page.locator('#dialog[open]').waitFor(); assert.match(await page.locator('#dialog-title').innerText(), /campaign concept/); await page.locator('#dialog [data-action="close-dialog"]').first().click();
    await page.locator('[data-calendar-event="meeting-own-meeting"] button').click(); await page.locator('#dialog[open]').waitFor(); assert.match(await page.locator('#dialog-title').innerText(), /Creative planning/); await page.locator('#dialog [data-action="close-dialog"]').first().click();
    await page.locator('[data-calendar-filter="mine"]').check(); assert.equal(await page.locator('[data-calendar-event="meeting-team-meeting"]').count(), 0); assert.equal(await page.locator('[data-calendar-event="leave-approved-leave"]').count(), 0); assert.equal(await page.locator('[data-calendar-event="availability-own-availability"]').count(), 1);
    await page.locator('[data-calendar-filter="task"]').uncheck(); assert.equal(await page.locator('[data-calendar-kind="task"]').count(), 0); await page.locator('[data-calendar-filter="task"]').check();
    await page.locator('[data-action="planner-view"][data-value="agenda"]').click(); await page.locator('#calendar-agenda-view').waitFor(); assert.equal(await page.locator('[data-action="planner-view"][data-value="agenda"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#calendar-jump-date').fill(fixture.nextMonth); await page.locator('#calendar-jump-date').dispatchEvent('change');
    assert.equal(await page.locator('[data-calendar-event="task-own-future"]').count(), 1); assert.equal(await page.locator('[data-calendar-event="holiday-holiday"]').count(), 1, 'Company holidays remain visible under My items');
    await page.locator('[data-action="planner-prev"]').click(); assert.equal(await page.locator('[data-calendar-event="task-own-future"]').count(), 0); await page.locator('[data-action="planner-next"]').click(); assert.equal(await page.locator('[data-calendar-event="task-own-future"]').count(), 1);
    await page.locator('[data-action="planner-today"]').click(); await page.locator('[data-action="planner-view"][data-value="month"]').click();
    await page.locator('[data-calendar-filter="mine"]').uncheck();
    checks.push('Task and meeting entries open their existing real dialogs; Month/Agenda, month navigation, Today, date jump, filters and My items update the calendar correctly');
    for (const width of [320, 375, 393, 768, 1440]) measurements.push(await geometry(page, width));
    for (const width of [375, 1440]) await fixture.shot(page, 'month', width);
    await page.locator('[data-action="planner-view"][data-value="agenda"]').click(); await fixture.shot(page, 'agenda', 375);
    await page.locator('[data-action="planner-view"][data-value="month"]').click();
    await page.locator('[data-action="new-availability"]').click(); await page.locator('#modal-form [name="notes"]').fill('Local browser check shared coordination note'); await page.locator('#modal-form button[type="submit"]').click(); await page.waitForFunction(() => !document.querySelector('#dialog')?.open);
    await page.locator('#calendar-selected-day').waitFor(); assert.equal((await fixture.db.prepare("SELECT COUNT(*) count FROM availability WHERE notes='Local browser check shared coordination note'").first()).count, 1);
    await page.locator('[data-calendar-event="availability-own-availability"] [data-action="remove-availability"]').click(); await page.waitForFunction(() => !document.querySelector('[data-calendar-event="availability-own-availability"]')); assert.equal(await fixture.db.prepare("SELECT id FROM availability WHERE id='own-availability'").first(), null);
    checks.push('Availability creation and owner removal use real CSRF-checked Worker writes in the disposable database');
    await page.setViewportSize({width:1440,height:1000}); await page.locator('[data-calendar-filter="mine"]').check(); await page.locator('[data-action="planner-next"]').click();
    // Sign out through the existing action, then boot the same account in the
    // same document to check that its previous calendar preferences are gone.
    await page.evaluate(async () => {const button = document.createElement('button');button.dataset.action = 'logout';await handleAction(button);}); await page.locator('#login-form').waitFor();
    const token = await fixture.issueSession('member'); await context.addCookies([{name:'__Host-tel_session',value:token,domain:new URL(fixture.origin).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
    await page.evaluate(async () => {user=(await api('/api/me')).user;await boot();}); await page.locator('#calendar-selected-day').waitFor(); assert.equal(await page.locator('[data-calendar-filter="mine"]').isChecked(), false); assert.equal(await page.locator('#calendar-jump-date').inputValue(), fixture.today);
    checks.push('Logout clears planner data and view state; signing the same account back in resets date and filters');
    assert.deepEqual(fixture.errors, []); assert.deepEqual(fixture.external, []);
    checks.push('No JavaScript errors, server errors or outbound requests; 320/375/393/768/1440px calendar controls fit the viewport and meet 44px targets');
    await writeFile(artifacts + '/browser-calendar-planner-report.json', JSON.stringify({passed:true,checks,measurements,snapshots:fixture.snapshots},null,2)); console.log(JSON.stringify({passed:true,checks},null,2));
  } catch(error) {await mkdir(artifacts,{recursive:true});await writeFile(artifacts + '/browser-calendar-planner-report.json',JSON.stringify({passed:false,checks,measurements,error:error.stack,errors:fixture?.errors},null,2));console.error(error.stack);process.exitCode=1;}
  finally {await fixture?.close();}
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await run();
