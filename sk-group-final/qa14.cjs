const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const report=[];
 const dir=__dirname+'/qa-results';
 fs.mkdirSync(dir,{recursive:true});
 try{
  for(const [width,height] of [[320,640],[360,760],[375,812],[390,844],[414,896],[480,800],[600,900],[680,900],[768,1024],[900,950],[1024,768],[1280,800],[1440,900],[1920,1080]]){
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
   await page.goto('http://127.0.0.1:4173/sk-group-final/');
   await page.locator('.sector').last().waitFor();
   assert.equal(await page.locator('.sector').count(),8);
   assert.equal(await page.locator('.photo').count(),10);
   assert.equal(await page.locator('#hero-image').getAttribute('src'),'assets/royal-enfield-front.webp');
   assert.match(await page.locator('#slide-name').innerText(),/Royal Enfield/);
   await page.locator('#next').click();
   assert.match(await page.locator('#slide-name').innerText(),/Montra/);
   await page.locator('[data-sector="jewellery"]').click();
   await page.locator('#business-jewellery button').click();
   assert.match(await page.locator('#enquiry select').inputValue(),/jewellery/);
   await page.getByRole('button',{name:'Close enquiry'}).click();
   await page.locator('#search').fill('Montra');
   assert.equal(await page.locator('#result-count').innerText(),'1 business listing');
   await page.getByRole('button',{name:'View Manas National Park'}).click();
   assert.equal(await page.locator('#lightbox-source').getAttribute('href'),'photo-credits.html#manas-photo');
   await page.locator('#lightbox').press('Escape');
   assert.equal(await page.locator('#lightbox').isVisible(),false);
   const dims=await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.clientWidth]);
   assert.ok(dims[0]<=dims[1]+1,JSON.stringify({width,height,dims}));
   report.push({width,height,pass:true});
   await page.close();
  }
 }finally{fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
