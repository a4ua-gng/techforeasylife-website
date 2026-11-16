import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare, Log, LogLevel} from 'miniflare';
import {chromium} from 'playwright';

// Disposable accounts and local D1 only; every outbound service is blocked.
const artifacts = 'tests/artifacts', checks = [], errors = [], screenshots = [];
let runtime, browser;
async function assets() {
  const files = {};
  async function visit(folder = '') {
    for (const entry of await readdir('public/' + folder, {withFileTypes: true})) {
      const path = folder ? folder + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await visit(path);
      else if (!['index.html', 'app.js', 'styles.css'].includes(path)) files['/' + path] = {base64: (await readFile('public/' + path)).toString('base64'), type: {js: 'application/javascript', css: 'text/css', webp: 'image/webp', svg: 'image/svg+xml', woff: 'font/woff', ttf: 'font/ttf'}[path.split('.').at(-1)] || 'application/octet-stream'};
    }
  }
  await visit(); return files;
}
async function ready(page, selector = '[data-announcements-home]') {
  await page.locator(selector).waitFor();
  await page.waitForFunction(() => !document.querySelector('#main .loading-message'));
  assert.equal(await page.locator('.error-page').count(), 0);
}
async function api(page, path, method = 'GET', body) {
  return page.evaluate(async ({path, method, body}) => { const response = await fetch(path, {method, headers: {'Content-Type': 'application/json'}, ...(body === undefined ? {} : {body: JSON.stringify(body)})}); return {status: response.status, data: await response.json()}; }, {path, method, body});
}
async function navigate(page, route, selector) { await page.goto(page.url().split('#')[0] + '#' + route); await ready(page, selector); }
async function geometry(page, selector, width, label) {
  await page.setViewportSize({width, height: 900});
  await page.waitForFunction(() => { const r = document.querySelector('.sidebar')?.getBoundingClientRect(); return !r || (innerWidth <= 900 ? r.right <= 1 : r.left >= -1); });
  const result = await page.locator(selector).evaluate((root) => {
    const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width && r.height && s.visibility !== 'hidden' && s.display !== 'none'; };
    const controls = [...root.querySelectorAll('button,a,input,select,textarea')].filter(visible).map(el => ({label: el.textContent || el.getAttribute('aria-label') || el.id, height: el.getBoundingClientRect().height}));
    return {overflow: document.documentElement.scrollWidth > innerWidth + 1, outside: [...root.querySelectorAll('*')].filter(visible).filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).slice(0, 4).map(el => el.className), controls};
  });
  assert.equal(result.overflow, false, label + ' page overflow ' + width); assert.deepEqual(result.outside, [], label + ' content overflow ' + width);
  for (const control of result.controls) assert.ok(control.height >= 43.5, label + ': short target ' + JSON.stringify(control));
}
try {
  await mkdir(artifacts, {recursive: true});
  const definitions = {__HTML__: await readFile('public/index.html', 'utf8'), __CSS__: await readFile('public/styles.css', 'utf8'), __APP__: await readFile('public/app.js', 'utf8'), __BINARY_ASSETS__: await assets()};
  const compiled = await build({entryPoints: ['src/worker.js'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, define: Object.fromEntries(Object.entries(definitions).map(([key, value]) => [key, JSON.stringify(value)]))});
  runtime = new Miniflare({modules: true, script: compiled.outputFiles[0].text, compatibilityDate: '2026-07-30', host: '127.0.0.1', port: 0, d1Databases: {DB: 'announcement-browser-disposable'}, log: new Log(LogLevel.NONE), bindings: {NOTIFICATION_CHANNELS: 'email'}, outboundService: async () => { throw Error('Outbound requests are blocked in announcement QA.'); }});
  const db = await runtime.getD1Database('DB');
  const baseSchemas = ['schema-core.sql', 'schema-workflows.sql', 'schema-collaboration.sql', 'schema-schedules.sql', 'schema-extensions.sql', 'schema-chat-read.sql', 'schema-task-transfers.sql', 'schema-operational-email.sql', 'schema-urgent-email.sql'];
  for (const file of [...baseSchemas, ...(await readdir('.')).filter(file => /^schema-.*\.sql$/.test(file) && !baseSchemas.includes(file)).sort()]) await db.exec((await readFile(file, 'utf8')).replace(/^\s*--.*$/gm, '').replaceAll('\n', ' '));
  const stamp = new Date().toISOString(), tokens = new Map();
  for (const [id, role, department, verified] of [['founder', 'founder', 'Leadership', true], ['hr', 'hr_lead', 'HR', true], ['hrmember', 'hr_member', 'HR', true], ['member', 'employee', 'Marketing', true], ['peer', 'employee', 'Marketing', true], ['finance', 'employee', 'Finance', true], ['unverified-founder', 'founder', 'Leadership', false], ['unverified', 'employee', 'Marketing', false]]) {
    await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,status,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,\'active\',\'2026-01-01\',\'fixture-hash\',\'fixture-salt\',0,?)').bind(id, 'QA-' + id, 'qa-' + id, 'Synthetic ' + id, 'Synthetic role', role, department, stamp).run();
    await db.prepare('INSERT INTO onboarding(user_id) VALUES(?)').bind(id).run();
    if (verified) await db.prepare("INSERT INTO member_connections(user_id,provider,account,status,verified_at,updated_at) VALUES(?,'gmail',?,'verified',?,?)").bind(id, id + '@example.test', stamp, stamp).run();
    const token = randomBytes(32).toString('hex'); tokens.set(id, token);
    await db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(createHash('sha256').update(token).digest('hex'), id, stamp, new Date(Date.now() + 3600000).toISOString()).run();
  }
  await db.prepare("INSERT INTO app_settings(key,value) VALUES('attendance_mode','flexible') ON CONFLICT(key) DO UPDATE SET value='flexible'").run();
  const origin = String(await runtime.ready).replace(/\/$/, '');
  browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  const views = new Map();
  async function view(id, hash = 'home') {
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    if (id) await context.addCookies([{name: '__Host-tel_session', value: tokens.get(id), domain: new URL(origin).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Strict'}]);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(id + ': ' + error.message));
    page.on('response', response => { if (response.status() >= 500) errors.push(id + ': ' + response.status() + ' ' + new URL(response.url()).pathname); });
    await page.goto(origin + '/#' + hash); views.set(id, {page, context}); return page;
  }
  const hr = await view('hr', 'announcements'); await ready(hr, '#announcements-board');
  const member = await view('member'); await ready(member);
  assert.equal(await member.locator('.announcement-popup').count(), 0);
  assert.equal(await member.locator('[data-action="announcement-new"]').count(), 0);
  assert.equal(await member.locator('[data-announcements-nav]').count(), 1);
  await hr.locator('[data-action="announcement-new"]').click();
  await hr.locator('#announcement-title').fill('Synthetic company update'); await hr.locator('#announcement-body').fill('A staff notice with two lines.\nPlease read the updated plan.');
  assert.deepEqual(await hr.locator('#announcement-audience option').evaluateAll(options => options.map(option => option.value)), ['Company', 'HR']);
  await hr.locator('#announcement-status').selectOption('published');
  assert.equal(await hr.locator('[data-announcement-editor] [type="submit"]').innerText(), 'Publish announcement');
  const published = hr.waitForResponse(response => new URL(response.url()).pathname === '/api/announcements' && response.request().method() === 'POST');
  await hr.locator('[data-announcement-editor] [type="submit"]').click(); const publishResult = await published; assert.equal(publishResult.status(), 201); const company = (await publishResult.json()).announcement;
  await hr.locator('.announcement-card [data-action="announcement-edit"]').waitFor();
  checks.push('HR publishes a real company announcement from the form; only Company and HR audiences are offered');

  await member.evaluate(() => { const input = document.createElement('textarea'); input.id = 'qa-typing'; document.querySelector('#main').prepend(input); input.focus(); });
  await member.evaluate(() => window.refreshAnnouncements());
  assert.equal(await member.locator('.announcement-popup').count(), 0); assert.equal(await member.evaluate(() => document.activeElement.id), 'qa-typing');
  assert.match(await member.locator('[data-announcements-nav]').getAttribute('aria-label'), /1 new/);
  await member.evaluate(() => { document.querySelector('#qa-typing').blur(); document.querySelector('#qa-typing').remove(); return window.refreshAnnouncements(); });
  await member.locator('.announcement-popup').waitFor();
  assert.equal(await member.evaluate(() => document.activeElement.tagName), 'BODY'); assert.equal(await member.locator('.announcement-popup').count(), 1);
  for (const width of [320, 375, 1440]) await geometry(member, '.announcement-popup', width, 'Popup');
  await geometry(member, '.announcement-popup', 375, 'Popup screenshot'); const popupScreenshot = artifacts + '/announcements-popup-375.png'; await member.screenshot({path: popupScreenshot, fullPage: true}); screenshots.push(popupScreenshot);
  await member.locator('[data-action="announcement-dismiss"]').click(); await member.locator('.announcement-popup').waitFor({state: 'detached'});
  assert.equal((await db.prepare('SELECT revision FROM announcement_dismissals WHERE user_id=? AND announcement_id=?').bind('member', company.id).first()).revision, 1);
  await member.reload(); await ready(member); assert.equal(await member.locator('.announcement-popup').count(), 0);
  const peer = await view('peer'); await ready(peer); await peer.locator('.announcement-popup').waitFor(); await peer.keyboard.press('Escape'); await peer.locator('.announcement-popup').waitFor({state: 'detached'});
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM announcement_dismissals WHERE announcement_id=?').bind(company.id).first()).n, 2);
  checks.push('Popup never steals typing focus; pending count remains visible; X and Escape persist independently per member and survive reload');

  await hr.locator('[data-action="announcement-edit"]').click(); await hr.locator('#announcement-body').fill('A revised synthetic notice.'); await hr.locator('[data-announcement-editor] [type="submit"]').click(); await hr.locator('dialog[open]').waitFor({state: 'detached'}); await ready(hr, '#announcements-board');
  await member.evaluate(() => window.refreshAnnouncements()); await member.locator('.announcement-popup').waitFor(); assert.match(await member.locator('.announcement-popup-body').innerText(), /revised synthetic/);
  assert.equal(await member.locator('.announcement-popup').getAttribute('data-revision'), '2'); await member.keyboard.press('Escape'); await member.locator('.announcement-popup').waitFor({state: 'detached'});
  await navigate(member, 'announcements', '#announcements-board'); assert.match(await member.locator('.announcement-list').innerText(), /revised synthetic.*Popup dismissed/s);
  assert.equal(await member.locator('[data-action="announcement-new"],[data-action="announcement-edit"],[data-action="announcement-archive"]').count(), 0);
  for (const width of [320, 375, 1440]) await geometry(member, '#announcements-board', width, 'History');
  checks.push('Published edits increase revision and reappear once; dismissed updates remain readable in history without staff editing controls');

  const founder = await view('founder', 'announcements'); await ready(founder, '#announcements-board'); await founder.locator('[data-action="announcement-new"]').click();
  assert.deepEqual(await founder.locator('#announcement-audience option').evaluateAll(options => options.map(option => [option.value, option.textContent])), [['Company', 'Company'], ['Leadership', 'Leadership'], ['HR', 'HR'], ['Marketing', 'TeMark'], ['Finance', 'Finance'], ['Strategy', 'Strategy']]);
  await founder.locator('[data-action="close-dialog"]').first().click();
  const literal = '<script>globalThis.ANNOUNCEMENT_XSS=1</script><img src=x onerror="globalThis.ANNOUNCEMENT_XSS=2">';
  const marketing = await api(founder, '/api/announcements', 'POST', {title: '<b>Synthetic TeMark update</b>', body: literal, audience: 'Marketing', status: 'published'}); assert.equal(marketing.status, 201);
  const financeOnly = await api(founder, '/api/announcements', 'POST', {title: 'Synthetic Finance update', body: 'FINANCE_PRIVATE_FIXTURE', audience: 'Finance', status: 'published'}); assert.equal(financeOnly.status, 201);
  assert.equal((await api(member, '/api/announcements/' + financeOnly.data.announcement.id)).status, 404);
  assert.equal((await api(hr, '/api/announcements/' + marketing.data.announcement.id)).status, 404);
  const finance = await view('finance', 'announcements'); await ready(finance, '#announcements-board'); assert.doesNotMatch(await finance.locator('#main').innerText(), /Synthetic TeMark/);
  await navigate(member, 'home', '[data-announcements-home]'); await member.locator('.announcement-popup').waitFor(); assert.equal(await member.locator('.announcement-popup-body').innerText(), literal); assert.equal(await member.locator('.announcement-popup script,.announcement-popup img').count(), 0); assert.equal(await member.evaluate(() => globalThis.ANNOUNCEMENT_XSS), undefined);
  await member.keyboard.press('Escape'); await navigate(member, 'announcements', '#announcements-board'); assert.equal(await member.locator('.announcement-body').filter({hasText: literal}).count(), 1); assert.equal(await member.locator('#announcements-board script,#announcements-board img').count(), 0);
  checks.push('Founders see every audience with official TeMark label and canonical Marketing value; other departments cannot fetch private bodies; HTML remains inert text');

  const hrMember = await view('hrmember', 'announcements'); await ready(hrMember, '#announcements-board'); assert.equal(await hrMember.locator('[data-action="announcement-new"]').count(), 1);
  await hr.locator('[data-action="announcement-new"]').click(); await hr.locator('#announcement-title').fill('Synthetic unpublished draft'); await hr.locator('#announcement-body').fill('DRAFT_PRIVATE_FIXTURE'); await hr.locator('[data-announcement-editor] [type="submit"]').click(); await hr.locator('dialog[open]').waitFor({state: 'detached'}); await ready(hr, '#announcements-board');
  const draft = hr.locator('.announcement-card').filter({hasText: 'Synthetic unpublished draft'}); await draft.waitFor(); assert.match(await draft.innerText(), /Draft/);
  await draft.locator('[data-action="announcement-archive"]').click(); await hr.locator('#modal-form [type="submit"]').click(); await hr.locator('dialog[open]').waitFor({state: 'detached'}); await ready(hr, '#announcements-board'); await hr.locator('.announcement-card').filter({hasText: 'Synthetic unpublished draft'}).getByText('Archived', {exact: true}).waitFor(); assert.match(await hr.locator('.announcement-card').filter({hasText: 'Synthetic unpublished draft'}).innerText(), /Archived/);
  await member.reload(); await ready(member, '#announcements-board'); assert.doesNotMatch(await member.locator('#main').innerText(), /DRAFT_PRIVATE_FIXTURE/);
  await hr.setViewportSize({width: 320, height: 900}); await hr.locator('[data-action="announcement-new"]').click(); await geometry(hr, 'dialog', 320, 'Editor'); await hr.emulateMedia({reducedMotion: 'reduce'}); await geometry(hr, 'dialog', 375, 'Editor reduced motion'); await hr.locator('[data-action="close-dialog"]').first().click(); await geometry(hr, '#announcements-board', 375, 'Management');
  const managerScreenshot = artifacts + '/announcements-manage-375.png'; await hr.screenshot({path: managerScreenshot, fullPage: true}); screenshots.push(managerScreenshot);
  checks.push('HR members have publishing tools; draft/save/archive works through real UI; drafts and archives remain private; editor/history/management fit 320 and 375px');

  await db.prepare("INSERT OR IGNORE INTO channels(id,name,description,department,posting_policy,created_at) VALUES('qa-marketing','Synthetic TeMark chat','Synthetic team channel','Marketing','members',?)").bind(stamp).run();
  await peer.reload(); await ready(peer); await navigate(peer, 'channel/qa-marketing', '#message-form'); await peer.locator('#message-input').fill('A draft that must stay here.');
  await peer.evaluate(() => window.refreshAnnouncements()); assert.equal(await peer.locator('.announcement-popup').count(), 0); assert.equal(await peer.locator('#message-input').inputValue(), 'A draft that must stay here.');
  const queued = await api(founder, '/api/announcements', 'POST', {title: 'Synthetic queued update', body: 'Queued while chatting.', audience: 'Company', status: 'published'}); assert.equal(queued.status, 201);
  await peer.evaluate(() => window.refreshAnnouncements()); assert.equal(await peer.locator('.announcement-popup').count(), 0); assert.match(await peer.locator('[data-announcements-nav]').getAttribute('aria-label'), /new/);
  await navigate(peer, 'home', '[data-announcements-home]'); await peer.locator('.announcement-popup').waitFor();
  checks.push('Chat receives only the announcements count; the popup queues until exit and preserves the unsent composer draft');

  const unverified = await view('unverified'); await unverified.locator('[data-email-code-request]').waitFor(); assert.equal(await unverified.locator('.announcement-popup').count(), 0);
  const unverifiedFounder = await view('unverified-founder'); await ready(unverifiedFounder); await unverifiedFounder.evaluate(() => window.refreshAnnouncements()); assert.equal(await unverifiedFounder.locator('.announcement-popup').count(), 0);
  const signedOut = await view(null); await signedOut.locator('#login-form').waitFor(); assert.equal(await signedOut.locator('.announcement-popup').count(), 0);
  checks.push('Signed-out accounts, email-gated members and unverified founders never see announcement popups');
  for (const table of ['email_deliveries', 'work_notification_deliveries', 'meeting_deliveries', 'tel_hourly_email_event_receipts']) assert.equal((await db.prepare('SELECT COUNT(*) n FROM ' + table).first()).n, 0, 'No announcement email fanout: ' + table);
  assert.deepEqual(errors, []); checks.push('No browser exceptions, server failures, external requests or email delivery jobs');
  await writeFile(artifacts + '/browser-announcements-report.json', JSON.stringify({passed: true, checks, screenshots, errors}, null, 2));
  console.log(JSON.stringify({passed: true, checks, screenshots}, null, 2));
} catch (error) {
  await mkdir(artifacts, {recursive: true}); await writeFile(artifacts + '/browser-announcements-report.json', JSON.stringify({passed: false, checks, screenshots, errors, error: error.stack}, null, 2)); console.error(error.stack); process.exitCode = 1;
} finally { if (browser) await browser.close(); if (runtime) await runtime.dispose(); }
