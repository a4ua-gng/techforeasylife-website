const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { dealers, photos } = require('./source/content.json');

const base = 'http://127.0.0.1:4173/sk-group-final/';
const widths = [[320,640],[360,760],[375,812],[390,844],[414,896],[480,800],[600,900],
  [680,900],[768,1024],[900,950],[1024,768],[1280,800],[1440,900],[1920,1080]];
const report = { responsive: [], branches: [] };

async function fit(page, label) {
  const dims = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
  }));
  assert.ok(dims.scroll <= dims.client + 1, label + ': ' + JSON.stringify(dims));
}

async function branchCheck(page, d) {
  const url = base + 'dealerships/' + d.id + '/';
  await page.goto(url);
  await page.locator('#branch-contact[open]').waitFor({timeout: 4000});
  const popup = page.locator('#branch-contact');
  assert.equal(await popup.locator('#branch-contact-place').innerText(), d.operator + ' · ' + d.place);
  assert.equal(await popup.locator('a[href^="tel:"]').getAttribute('href'), 'tel:+91' + d.phone);
  assert.equal(await popup.locator('address').innerText(), d.address);
  const box = await popup.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
    'Popup clipped for ' + d.id + ' at ' + viewport.width + 'px');
  await fit(page, d.id + ' with popup');
  await popup.getByRole('button', {name:'Close branch contact'}).click();
  await page.locator('#branch-contact[open]').waitFor({state:'hidden'});
  await fit(page, d.id);
  assert.equal(await page.locator('.branch-hero figure img').count(), d.photo ? 1 : 0);
  if (d.photo) {
    const src = await page.locator('.branch-hero figure img').getAttribute('src');
    assert.ok(src.endsWith(photos[d.photo].file), d.id + ' branch photo mismatch');
  }
  await page.locator('.branch-intro [data-branch-contact]').click();
  await page.locator('#branch-contact[open]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#branch-contact[open]').waitFor({state:'hidden'});
  report.branches.push({branch:d.id, width:viewport.width, pass:true});
}

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const [width,height] of widths) {
      const page = await browser.newPage({viewport:{width,height}, reducedMotion:'reduce'});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await page.locator('#dealer-search').waitFor();
      assert.equal(await page.locator('[data-dealer]').count(), 5);
      assert.equal(await page.locator('.business-card').count(), 6);
      assert.equal(await page.locator('[data-photo]').count(), 4);
      assert.ok(await page.locator('.hero-image').evaluate(img => img.complete && img.naturalWidth > 0));
      assert.equal(await page.locator('#branch-contact').count(), 0);
      await fit(page, 'Home at ' + width + 'px');
      await page.goto(base + 'dealerships/' + dealers[0].id + '/');
      await page.locator('#branch-contact[open]').waitFor({timeout: 4000});
      const rect = await page.locator('#branch-contact').boundingBox();
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height,
        'Montra popup clipped at ' + width + 'px');
      await fit(page, 'Montra popup at ' + width + 'px');
      await page.keyboard.press('Escape');
      await page.locator('#branch-contact[open]').waitFor({state:'hidden'});
      await fit(page, 'Montra page at ' + width + 'px');
      assert.deepEqual(errors, []);
      report.responsive.push({width,height,pass:true});
      await page.close();
    }
    for (const viewport of [{width:375,height:812},{width:1440,height:900}]) {
      const page = await browser.newPage({viewport, reducedMotion:'reduce'});
      for (const d of dealers) await branchCheck(page, d);
      await page.reload();
      await page.locator('#branch-title').waitFor();
      const noRepeat = await page.locator('#branch-contact[open]').waitFor({timeout:1100})
        .then(() => false, error => {
          if (error.name === 'TimeoutError') return true;
          throw error;
        });
      assert.equal(noRepeat, true, 'Contact should not reopen after dismissing and reloading');
      await page.goto(base);
      await page.locator('[data-filter="motorcycles"]').click();
      assert.equal(await page.locator('[data-dealer]:visible').count(), 4);
      await page.locator('#dealer-search').fill('Sonkuchi');
      assert.equal(await page.locator('[data-dealer]:visible').count(), 1);
      assert.match(await page.locator('[data-dealer]:visible .card-kicker').innerText(), /SONKUCHI/i);
      await page.locator('#dealer-search').fill('unlisted town');
      await page.locator('#dealer-empty').waitFor();
      await page.locator('#business-jewellery summary').click();
      await page.locator('#business-jewellery [data-enquire]').click();
      assert.match(await page.locator('#group-enquiry select').inputValue(), /jewellery/i);
      await page.getByRole('button',{name:'Close enquiry'}).click();
      await page.locator('#gallery [data-photo]').first().click();
      assert.match(await page.locator('#photo-title').innerText(), /Betkuchi/);
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#photo-title').innerText(), 'The GS Auto showroom');
      await page.keyboard.press('Escape');
      await page.locator('#photo-dialog[open]').waitFor({state:'hidden'});
      await page.close();
    }
  } finally {
    fs.mkdirSync(__dirname + '/qa-results', {recursive:true});
    fs.writeFileSync(__dirname + '/qa-results/report.json', JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
