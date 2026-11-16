import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare, Log, LogLevel} from 'miniflare';
import {chromium} from 'playwright';

// A disposable, fully local Worker and database. No team data or external deliveries.
const checks = [], errors = [], snapshots = [], geometries = [];
const artifacts = 'tests/artifacts';
let runtime, browser;
const fixtures = [
  ['founder', 'Avery Founder', 'founder', 'Leadership', null, 'active'],
  ['hr-lead', 'Robin People', 'hr_lead', 'HR', 'founder', 'active'],
  ['hr-member', 'Rowan People', 'hr_member', 'HR', 'hr-lead', 'active'],
  ['arc-lead', 'Casey Creative', 'team_lead', 'Marketing', 'founder', 'active'],
  ['arc-member', 'Morgan Creative', 'employee', 'Marketing', 'arc-lead', 'active'],
  ['finance', 'Jordan Finance', 'employee', 'Finance', 'founder', 'on_leave'],
];
const expectedKind = {'founder': 'founder', 'hr-lead': 'hr', 'hr-member': 'hr', 'arc-lead': 'arc', 'arc-member': 'arc', 'finance': 'finance'};
const sha = value => createHash('sha256').update(value).digest('hex');

async function collectAssets() {
  const assets = {};
  async function visit(folder = '') {
    for (const entry of await readdir('public/' + folder, {withFileTypes: true})) {
      const path = folder ? folder + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await visit(path);
      else if (!['index.html', 'styles.css', 'app.js'].includes(path)) {
        const content = await readFile('public/' + path);
        const extension = path.split('.').at(-1);
        assets['/' + path] = {base64: content.toString('base64'), type: {js: 'application/javascript; charset=utf-8', css: 'text/css; charset=utf-8', webp: 'image/webp', svg: 'image/svg+xml', woff: 'font/woff', ttf: 'font/ttf'}[extension] || 'application/octet-stream'};
      }
    }
  }
  await visit();
  return assets;
}

async function ready(page) {
  await page.locator('.workspace-home .workspace-hero').waitFor();
  await page.waitForFunction(() => !document.querySelector('#main .loading-message'));
  assert.equal(await page.locator('.error-page').count(), 0);
  await page.evaluate(() => document.fonts.ready);
}

async function verifyGeometry(page, actor, width) {
  await page.setViewportSize({width, height: 900});
  await page.evaluate(() => scrollTo(0, 0));
  const measure = await page.evaluate(() => {
    const visible = element => {
      const style = getComputedStyle(element), bounds = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width && bounds.height;
    };
    const bounds = element => {
      const r = element.getBoundingClientRect();
      return {left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height};
    };
    const top = [...document.querySelectorAll('.topbar a,.topbar button')].filter(visible).map(element => ({name: element.getAttribute('aria-label') || element.innerText || element.className, ...bounds(element)}));
    const targets = [...document.querySelectorAll('.workspace-home .btn,.workspace-home .link-btn,.workspace-home .icon-btn,.department-quick-paths>a,.department-quick-paths>button')].filter(visible).map(element => ({name: element.innerText || element.getAttribute('aria-label'), ...bounds(element)}));
    const hero = document.querySelector('.workspace-hero'), main = document.querySelector('#main');
    const bodyCopy = [...main.querySelectorAll('.workspace-hero p,.page-title p')].map(element => ({font: parseFloat(getComputedStyle(element).fontSize), lineHeight: parseFloat(getComputedStyle(element).lineHeight)}));
    const overflow = [...main.querySelectorAll('*')].filter(visible).filter(element => {
      const r = element.getBoundingClientRect();
      return r.left < -1 || r.right > innerWidth + 1;
    }).slice(0, 6).map(element => ({class: element.className, ...bounds(element)}));
    return {viewport: innerWidth, document: document.documentElement.scrollWidth, main: bounds(main), hero: bounds(hero), top, targets, bodyCopy, overflow};
  });
  assert.ok(measure.document <= width + 1, actor + ' has page overflow at ' + width + ': ' + JSON.stringify(measure.overflow));
  assert.deepEqual(measure.overflow, [], actor + ' content exceeds viewport at ' + width);
  for (const target of [...measure.targets, ...measure.top]) assert.ok(target.height >= 43.5, actor + ' small target at ' + width + ': ' + JSON.stringify(target));
  for (const copy of measure.bodyCopy) assert.ok(copy.font >= 16 && copy.lineHeight >= 24, actor + ' body copy is too small at ' + width);
  for (const [index, first] of measure.top.entries()) for (const second of measure.top.slice(index + 1)) {
    assert.ok(first.right <= second.left + 1 || second.right <= first.left + 1 || first.bottom <= second.top + 1 || second.bottom <= first.top + 1, 'Header targets overlap at ' + width + ': ' + first.name + ' / ' + second.name);
  }
  geometries.push({actor, width, document: measure.document, smallestTarget: Math.min(...measure.targets.map(target => target.height)), heroWidth: measure.hero.width});
}

try {
  await mkdir(artifacts, {recursive: true});
  const html = await readFile('public/index.html', 'utf8');
  assert.match(html, /workspace-polish\.css/, 'Integrate the workspace stylesheet in public/index.html before running QA');
  assert.match(html, /workspace-polish\.js/, 'Integrate the workspace script in public/index.html before running QA');
  const definitions = {
    __HTML__: html,
    __CSS__: await readFile('public/styles.css', 'utf8'),
    __APP__: await readFile('public/app.js', 'utf8'),
    __BINARY_ASSETS__: await collectAssets(),
  };
  const compiled = await build({entryPoints: ['src/worker.js'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, define: Object.fromEntries(Object.entries(definitions).map(([key, value]) => [key, JSON.stringify(value)]))});
  runtime = new Miniflare({modules: true, script: compiled.outputFiles[0].text, compatibilityDate: '2026-07-30', d1Databases: {DB: 'workspace-v26-disposable'}, host: '127.0.0.1', port: 0, log: new Log(LogLevel.NONE), bindings: {NOTIFICATION_CHANNELS: 'email'}, outboundService: async () => { throw Error('Workspace QA must never call external services.'); }});
  const db = await runtime.getD1Database('DB');
  for (const file of ['schema-core.sql', 'schema-workflows.sql', 'schema-collaboration.sql', 'schema-schedules.sql', 'schema-extensions.sql', 'schema-chat-read.sql', 'schema-task-transfers.sql', 'schema-operational-email.sql']) await db.exec((await readFile(file, 'utf8')).replaceAll('\n', ' '));
  const stamp = new Date().toISOString(), tokens = new Map();
  for (const [id, name, role, department, manager, status] of fixtures) {
    await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,manager_id,status,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(id, 'QA-' + id, 'qa-' + id, name, role === 'founder' ? 'Co-founder' : role === 'team_lead' ? 'Creative lead' : role.startsWith('hr_') ? 'People operations' : 'Team member', role, department, manager, status, '2026-01-01', 'unused-local-fixture-hash', 'unused-local-fixture-salt', stamp).run();
    await db.prepare("INSERT INTO member_connections(user_id,provider,account,status,verified_at,updated_at) VALUES(?,'gmail',?,'verified',?,?)").bind(id, id + '@example.test', stamp, stamp).run();
    const token = randomBytes(32).toString('hex');
    tokens.set(id, token);
    await db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(sha(token), id, stamp, new Date(Date.now() + 3_600_000).toISOString()).run();
  }
  await db.prepare("INSERT INTO tasks(id,title,description,assignee_id,leader_id,department,priority,deadline,expected_deliverable,status,created_by,created_at,updated_at) VALUES('arc-brief','Campaign concept direction','Synthetic local design brief','arc-member','arc-lead','Marketing','normal','2027-01-01','Share the concept and rationale','working','arc-lead',?,?)").bind(stamp, stamp).run();
  await db.prepare("INSERT INTO leave_requests(id,user_id,type,start_date,end_date,reason,status,leader_id,created_at,updated_at) VALUES('people-review','arc-member','personal','2027-01-04','2027-01-04','Synthetic fixture request','pending_hr','arc-lead',?,?)").bind(stamp, stamp).run();
  await db.prepare("INSERT INTO attendance_corrections(id,user_id,work_date,requested_seconds,reason,status,created_at,updated_at) VALUES('people-correction','arc-member','2026-11-01',7200,'Synthetic fixture correction','pending',?,?)").bind(stamp, stamp).run();
  checks.push('Disposable Miniflare database contains synthetic Founders, HR, Team ARC, and ordinary Finance fixtures; external requests are blocked');

  const origin = String(await runtime.ready).replace(/\/$/, '');
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  const views = new Map();
  for (const [id, name, role, department] of fixtures) {
    const context = await browser.newContext({viewport: {width: 1440, height: 1100}});
    await context.addCookies([{name: '__Host-tel_session', value: tokens.get(id), url: origin, httpOnly: true, secure: true, sameSite: 'Strict'}]);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(id + ': ' + error.message));
    page.on('response', response => { if (response.status() >= 500) errors.push(id + ': HTTP ' + response.status() + ' ' + new URL(response.url()).pathname); });
    await page.goto(origin + '/#home');
    await ready(page);
    assert.equal(await page.locator('body').getAttribute('data-workspace-kind'), expectedKind[id]);
    assert.equal(await page.locator('#main h1').innerText(), 'Welcome, ' + name.split(' ')[0] + '.');
    const me = await (await context.request.get(origin + '/api/me')).json();
    assert.equal(me.user.department, department, 'Presentation must preserve canonical department');
    assert.equal(me.user.role, role, 'Presentation must preserve role');
    const primary = page.locator('.workspace-primary');
    assert.ok(await primary.count(), 'Department work needs a primary content region');
    assert.equal(await page.locator('.workspace-workday .clock-panel').count(), 1);
    assert.equal(await page.locator('.workspace-workday .schedule-summary').count(), 1);
    const firstPrimary = await primary.locator(':scope > section').first().innerText();
    if (id === 'founder') {
      assert.match(firstPrimary, /Departments at a glance/);
      assert.ok(await page.locator('.department-quick-paths a[href="#reports"]').count());
      assert.equal(await primary.locator('.department-overview-card > h3', {hasText: 'Team ARC'}).count(), 1);
    }
    if (role.startsWith('hr_')) {
      assert.match(firstPrimary, /People actions needing attention/);
      assert.match(firstPrimary, /time-off verification/);
      assert.match(firstPrimary, /attendance correction/);
      assert.ok(await page.locator('.department-quick-paths [data-action="new-person"]').count());
    }
    if (department === 'Marketing') {
      assert.match(await page.locator('.department-tag').innerText(), /Team ARC/);
      assert.match(firstPrimary, /Campaign concept direction/);
      assert.equal(await page.locator('.department-quick-paths [data-action="new-task"]').count(), role === 'team_lead' ? 1 : 0);
      assert.equal(await page.locator('#main a[href="#hr"]').count(), 0);
      assert.ok(await page.locator('a[href="#channel/marketing"]').count());
    }
    if (id === 'finance') {
      assert.equal(await page.locator('[data-finance-leave]').count(), 1);
      assert.equal(await page.locator('[data-action="clock"][data-value="clock_in"]').count(), 0);
      assert.equal(await page.locator('#main [data-action="new-task"],#main a[href="#hr"]').count(), 0);
    }
    for (const width of [320, 375, 393, 768, 1024, 1440]) await verifyGeometry(page, id, width);
    for (const width of [375, 1440]) {
      await page.setViewportSize({width, height: width === 375 ? 900 : 1100});
      await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
      const path = artifacts + '/workspace-v26-' + id + '-' + width + '.png';
      await page.screenshot({path, fullPage: true});
      snapshots.push(path);
    }
    views.set(id, {context, page});
  }
  checks.push('All six role variants preserve their greeting, canonical department, role actions, workday controls and department-specific features');
  checks.push('320, 375, 393, 768, 1024 and 1440px Home layouts have no horizontal overflow, readable hero copy and 44px controls');
  checks.push('Founders see company overview first, HR sees real review fixtures, and Team ARC sees its actual deliverable without additional permissions');

  const founder = views.get('founder');
  await founder.page.setViewportSize({width: 320, height: 900});
  await founder.page.emulateMedia({reducedMotion: 'reduce'});
  await founder.page.locator('[data-workspace-jump="workday"]').click();
  assert.equal(await founder.page.evaluate(() => document.activeElement?.id), 'workspace-workday');
  assert.equal(new URL(founder.page.url()).hash, '#home');
  assert.ok(await founder.page.locator('.clock-panel [data-action="clock"]').isVisible());
  checks.push('Your workday shortcut scrolls and focuses the personal attendance area while retaining the Home route, including reduced motion');

  const arc = views.get('arc-lead');
  await arc.page.locator('.department-quick-paths [data-action="new-task"]').click();
  await arc.page.locator('#modal-form select[name="department"]').count();
  assert.equal(await arc.page.locator('#modal-form').count(), 1, 'Team ARC allocation action must still open its real form');
  await arc.page.locator('[data-action="close-dialog"]').first().click();
  await founder.page.goto(origin + '/#hr');
  await founder.page.locator('[data-action="new-person"]').waitFor();
  await founder.page.locator('[data-action="new-person"]').click();
  const departmentOption = founder.page.locator('select[name="department"] option[value="Marketing"]');
  assert.equal(await departmentOption.innerText(), 'Team ARC');
  assert.equal(await departmentOption.getAttribute('value'), 'Marketing');
  await founder.page.locator('[data-action="close-dialog"]').first().click();
  checks.push('Existing task allocation and People admin forms still open; Team ARC option retains the Marketing payload value');
  assert.deepEqual(errors, []);
  checks.push('No browser JavaScript errors or HTTP 500 responses');
  await writeFile(artifacts + '/browser-workspace-v26-report.json', JSON.stringify({passed: true, checks, geometries, snapshots, errors}, null, 2));
  console.log(JSON.stringify({passed: true, count: checks.length, checks}, null, 2));
} catch (error) {
  await mkdir(artifacts, {recursive: true});
  await writeFile(artifacts + '/browser-workspace-v26-report.json', JSON.stringify({passed: false, checks, geometries, snapshots, errors, error: String(error.stack)}, null, 2));
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (runtime) await runtime.dispose();
}
