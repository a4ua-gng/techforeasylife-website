'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const configs=[
 {width:320,height:720,lang:'as'},
 {width:320,height:720,lang:'hi'},
 {width:360,height:780,lang:'en'},
 {width:375,height:812,lang:'hi'},
 {width:390,height:844,lang:'en'},
 {width:390,height:844,lang:'as'},
 {width:414,height:896,lang:'hi'},
 {width:540,height:850,lang:'en'},
 {width:768,height:1024,lang:'as'},
 {width:820,height:1180,lang:'en'},
 {width:1024,height:768,lang:'en'},
 {width:1200,height:850,lang:'hi'},
 {width:1440,height:900,lang:'en'},
 {width:1920,height:1080,lang:'en'}
];
const reportDir=path.resolve('sk-group-final/qa-results');
fs.mkdirSync(reportDir,{recursive:true});
const base='http://127.0.0.1:4173/sk-group-final/';
const results=[];
const run=async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(let i=0;i<configs.length;i++){
  const t=configs[i],id=String(i+1).padStart(2,'0')+'-'+t.width+'-'+t.lang;
  const page=await browser.newPage({viewport:{width:t.width,height:t.height},deviceScaleFactor:1,isMobile:t.width<=540,hasTouch:t.width<=540});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,240)));
  try{
   await page.goto(base+'?lang='+t.lang+'&qa='+i,{waitUntil:'domcontentloaded',timeout:25000});
   await page.locator('.business-card .skx-social-links').first().waitFor({timeout:18000});
   const state=await page.evaluate(()=>{
    const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)],root=document.documentElement;
    const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height};};
    const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
    const overhangs=qa('.site-header a,.site-header select,.site-header button,.fx-hero-actions a,.fx-hero-actions button,.business-card a,.business-card button,.contact-panel input,.contact-panel select,.contact-panel textarea').filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.left<-2||r.right>root.clientWidth+2}).slice(0,10).map(x=>({tag:x.tagName,text:x.textContent.trim().slice(0,20)}));
    const cards=qa('.business-card'),socials=qa('.business-card .skx-social-links');
    const badCards=cards.filter(x=>x.scrollWidth>x.clientWidth+3).map(x=>x.querySelector('h3')?.textContent||'unknown').slice(0,8);
    const brand=rect(q('.site-header .brand')),right=rect(q('.site-header .header-right')),nav=rect(q('.site-header .nav'));
    const navVisible=visible(q('.site-header .nav'));
    const badSocials=qa('.business-card .skx-social-link').filter(x=>x.scrollWidth>x.clientWidth+4).map(x=>x.textContent.trim().slice(0,25));
    const brandLinks=qa('.skx-social-link.instagram');
    return{
     rootWidth:root.clientWidth,scrollWidth:root.scrollWidth,lang:root.lang,
     brandRight:brand?.r,rightLeft:right?.l,navRight:navVisible?nav?.r:null,
     title:rect(q('.fx-hero-intro h1')),firstCard:rect(cards[0]),
     cards:cards.length,socials:socials.length,
     instagramBrand:brandLinks.length,pending:qa('.skx-social-pending').length,
     badSocialUrl:brandLinks.some(a=>!a.href.startsWith('https://www.instagram.com/')),
     badCards,badSocials,overhangs,
     lightPortfolio:getComputedStyle(q('.portfolio')).backgroundImage.includes('rgb(251, 250, 246)'),
     lightPresence:getComputedStyle(q('.presence')).backgroundColor==='rgb(250, 248, 243)',
     wrongHeaderLanguageIcon:(q('.language-picker')?.innerText||'').includes('文'),
     missingAnchors:qa('a[href^="#"]').filter(a=>!q(a.getAttribute('href'))).map(a=>a.getAttribute('href')).slice(0,4)
    };
   });
   assert(state.rootWidth>0,'No page width');
   assert(state.scrollWidth<=state.rootWidth+1,'Horizontal page overflow: '+state.scrollWidth+' > '+state.rootWidth);
   assert(state.brandRight<=state.rightLeft+2,'Header brand / language picker collision');
   assert(state.navRight===null||state.navRight<=state.rightLeft+4,'Desktop nav overlaps header actions');
   assert(state.title&&state.title.l>=-2&&state.title.r<=state.rootWidth+2,'Hero title outside viewport');
   assert.equal(state.cards,13,'All 13 SKX portfolio businesses must display');
   assert.equal(state.socials,13,'Every business must have social link panel');
   assert.equal(state.instagramBrand,7,'Show exactly seven verified manufacturer Instagram accounts');
   assert.equal(state.pending,6,'Mark six unverified branch/business Instagram profiles as pending');
   assert.equal(state.badSocialUrl,false,'Malformed Instagram link');
   assert.equal(state.wrongHeaderLanguageIcon,false,'Language selector has wrong glyph');
   assert.deepEqual(state.badCards,[],'Clipped business cards');
   assert.deepEqual(state.badSocials,[],'Clipped Instagram or website action');
   assert.deepEqual(state.overhangs,[],'Offscreen interactive controls');
   assert.deepEqual(state.missingAnchors,[],'Broken local section links');
   assert.equal(state.lightPortfolio,true,'Portfolio not using ivory white/gold');
   assert.equal(state.lightPresence,true,'Locations not using ivory white/gold');
   // Every screen variant exercises the mobile/desktop responsive navigation.
   if(t.width<=1100){
    const toggle=page.locator('.menu-btn');
    await toggle.click();
    assert.equal(await page.locator('.site-header .nav').evaluate(e=>e.classList.contains('open')),true,'Menu does not open');
    await toggle.click();
   }
   // Check the enquiry interaction at three extreme sizes and locales.
   if(i===0||i===4||i===12){
    await page.locator('.fx-hero-actions button[data-open-enquiry="other"]').click();
    const box=await page.locator('#enquiry-dialog').boundingBox();
    const send=await page.locator('.welcome-submit').boundingBox();
    assert(box&&box.x>=-1&&box.x+box.width<=t.width+1&&box.y>=-1&&box.y+box.height<=t.height+1,'Enquiry popup outside viewport');
    assert(send&&send.y+send.height<=box.y+box.height+3,'Submit action hidden in modal');
    assert.equal(await page.locator('#welcome-whatsapp').isDisabled(),true,'Non-Montra enquiries wrongly routed to Montra');
    await page.keyboard.press('Escape');
   }
   if(i===4||i===12){
    await page.locator('.fx-vertical-hospitality').click();
    assert.equal(await page.locator('.business-card').count(),3,'Business sector filtering broken');
    await page.locator('.filters [data-filter="all"]').click();
    assert.equal(await page.locator('.business-card').count(),13,'Business filter does not reset');
    await page.locator('.business-card [data-business="royal"]').first().click();
    assert.equal(await page.locator('#business-dialog').evaluate(e=>e.open),true,'Business detail dialog fails to open');
    assert((await page.locator('#business-dialog .skx-dialog-social .skx-social-link').count())>=2,'Brand detail missing social channels');
    await page.keyboard.press('Escape');
   }
   assert.equal(errors.length,0,'JavaScript runtime errors: '+errors.join(' | '));
   if([0,4,8,10,12,13].includes(i)){
    await page.screenshot({path:path.join(reportDir,id+'.png'),fullPage:false});
    await page.locator('#businesses').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(reportDir,id+'-portfolio.png'),fullPage:false});
   }
   results.push({test:i+1,viewport:t.width+'x'+t.height,language:t.lang,status:'PASS',socials:state.socials,brandInstagram:state.instagramBrand,groupHandlesPending:state.pending,overflow:state.scrollWidth-state.rootWidth});
   console.log('PASS',id,'No clipping | All contacts | Header aligned');
  }catch(e){
   results.push({test:i+1,viewport:t.width+'x'+t.height,language:t.lang,status:'FAIL',reason:String(e.message||e).slice(0,600),pageErrors:errors});
   console.error('FAIL',id,String(e.message||e));
   await page.screenshot({path:path.join(reportDir,id+'-FAILED.png'),fullPage:false}).catch(()=>{});
  }finally{await page.close();}
 }
 await browser.close();
 fs.writeFileSync(path.join(reportDir,'alignment-14.json'),JSON.stringify({checks:14,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results},null,2));
 console.log('14-viewport check:',results.filter(x=>x.status==='PASS').length,'passed,',results.filter(x=>x.status==='FAIL').length,'failed');
 if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
};
run().catch(err=>{console.error(err);process.exitCode=1;});
