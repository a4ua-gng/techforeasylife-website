import {Miniflare,Log,LogLevel} from 'miniflare';
import {build} from 'esbuild';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {hashPassword} from '../src/core.js';

// Every record and image in this check lives in a disposable local D1 database.
// No external delivery or remote application is reachable from the worker.
const checks=[],errors=[],binaries={};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64');
const image={name:'chat-fixture.png',mimeType:'image/png',buffer:png};
async function collect(dir=''){
 for(const entry of await readdir('public/'+dir,{withFileTypes:true})){
  const path=dir?dir+'/'+entry.name:entry.name;
  if(entry.isDirectory())await collect(path);
  else if(!['index.html','app.js','styles.css'].includes(path)){
   const data=await readFile('public/'+path),ext=path.split('.').pop();
   binaries['/'+path]={base64:data.toString('base64'),type:({webp:'image/webp',woff:'font/woff',js:'application/javascript; charset=utf-8',css:'text/css; charset=utf-8',txt:'text/plain'})[ext]||'application/octet-stream'};
  }
 }
}
await collect();
let html=await readFile('public/index.html','utf8');
if(!html.includes('src="/chat-updates.js"'))html=html.replace('</head>','<link rel="stylesheet" href="/chat-updates.css"><script src="/chat-updates.js" defer></script></head>');
const compiled=await build({entryPoints:['src/worker.js'],bundle:true,write:false,format:'esm',platform:'browser',define:{__HTML__:JSON.stringify(html),__CSS__:JSON.stringify(await readFile('public/styles.css','utf8')),__APP__:JSON.stringify(await readFile('public/app.js','utf8')),__BINARY_ASSETS__:JSON.stringify(binaries)}});
const runtime=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-07-30',host:'127.0.0.1',port:0,d1Databases:{DB:'chat-browser-v26-isolated'},bindings:{NOTIFICATION_CHANNELS:'email'},log:new Log(LogLevel.NONE),outboundService:async()=>{throw Error('Browser checks never send external emails.');}});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
let failure;
try{
 const db=await runtime.getD1Database('DB');
 const schemas=['schema-core.sql','schema-workflows.sql','schema-collaboration.sql','schema-schedules.sql','schema-extensions.sql','schema-chat-read.sql','schema-task-transfers.sql','schema-operational-email.sql','schema-urgent-email.sql'];
 for(const file of schemas)await db.exec((await readFile(file,'utf8')).replaceAll('\n',' '));
 await db.prepare("UPDATE app_settings SET value='2020-01-01T00:00:00.000Z' WHERE key='chat_unread_enabled_at'").run();
 const password='LocalChatFixture!2026',salt='0123456789abcdef0123456789abcdef',hash=await hashPassword(password,salt),stamp=new Date().toISOString();
 for(const [id,name,role,department] of [['chat-founder','Founder Fixture','founder','Leadership'],['chat-peer','Peer Fixture','employee','Marketing']]){
  await db.prepare('INSERT INTO users(id,employee_id,username,name,designation,role,department,email,joined_on,password_hash,password_salt,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(id,id,id,name,role,role,department,id+'@example.test','2026-01-01',hash,salt,stamp).run();
  await db.prepare('INSERT INTO onboarding(user_id) VALUES(?)').bind(id).run();
  await db.prepare("INSERT INTO member_connections VALUES(?,'gmail',?,'verified',?,?)").bind(id,id+'@example.test',stamp,stamp).run();
 }
 const base=String(await runtime.ready).replace(/\/$/,'');
 async function actor(username){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#login-form [name=username]').fill(username);await page.locator('#login-form [name=password]').fill(password);await page.locator('#login-form [type=submit]').click();await page.locator('.workspace #main h1').waitFor();
  return {context,page};
 }
 async function post(actor,body,parent_id,channel='general'){
  const r=await actor.context.request.post(base+'/api/channels/'+channel+'/messages',{headers:{Origin:base},data:{body,...(parent_id?{parent_id}:{})}});
  assert.equal(r.status(),201,await r.text());return (await r.json()).message;
 }
 async function messages(){return (await db.prepare("SELECT * FROM messages WHERE channel_id='general' ORDER BY rowid").all()).results;}
 async function uploads(){return (await db.prepare('SELECT * FROM uploads ORDER BY rowid').all()).results;}
 async function unread(actor){const r=await actor.context.request.get(base+'/api/channels');return (await r.json()).channels.find(c=>c.id==='general').unread_count;}
 async function channel(actor,id='general'){await actor.page.bringToFront();await actor.page.goto(base+'/#channel/'+id);await actor.page.locator('.channel-view').waitFor();if(id!=='announcements')await actor.page.locator('#message-form[data-chat-channel="'+id+'"] textarea').waitFor();else await actor.page.locator('.channel-heading h1').filter({hasText:'announcements'}).waitFor();}
 async function idle(page,form='#message-form'){await page.locator(form+' [type=submit]:enabled').waitFor();}
 async function closeThread(page){await page.locator('.chat-thread [data-action=close-thread]').click();await page.locator('.chat-thread').waitFor({state:'detached'});}
 async function openThread(page,id){await page.locator(`#message-feed [data-action="open-thread"][data-id="${id}"]`).click();await page.locator('#thread-form textarea').waitFor();}
 async function attachment(page,form='#message-form'){await page.locator(form+' [data-chat-file]').setInputFiles(image);await page.locator(form+' .chat-attachment-preview img').waitFor();}
 async function viewportKeyboard(page,height,top=0){await page.evaluate(({height,top})=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,value:height});Object.defineProperty(window.visualViewport,'offsetTop',{configurable:true,value:top});window.visualViewport.dispatchEvent(new Event('resize'));},{height,top});}
 async function restoreViewport(page){await page.evaluate(()=>{delete window.visualViewport.height;delete window.visualViewport.offsetTop;window.visualViewport.dispatchEvent(new Event('resize'));});}
 async function visibleControls(page,form,height,top=0){
  try{
   await page.waitForFunction(({form,height,top})=>{
    const selectors=['[type=submit]','[data-action=attach-chat-image]'];
    return selectors.every(s=>{const el=document.querySelector(form+' '+s);if(!el)return false;const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.top>=top&&r.left>=0&&r.right<=innerWidth+1&&r.bottom<=top+height+1;});
   },{form,height,top});
  }catch(error){
   const layout=await page.evaluate(form=>({width:innerWidth,height:innerHeight,visualHeight:visualViewport.height,scrollY,active:document.activeElement?.id,items:Object.fromEntries(['.page','.channel-view','.chat-main','.channel-heading','#message-feed',form,form+' textarea',form+' [type=submit]',form+' [data-action=attach-chat-image]'].map(selector=>{const el=document.querySelector(selector);return [selector,el?{bounds:el.getBoundingClientRect().toJSON(),height:getComputedStyle(el).height,minHeight:getComputedStyle(el).minHeight,display:getComputedStyle(el).display}:null];}))}),form);
   await page.screenshot({path:'tests/artifacts/chat-mobile-viewport-failure.png'});
   throw new Error(error.message+'\nLayout: '+JSON.stringify(layout));
  }
 }
 await mkdir('tests/artifacts',{recursive:true});
 const founder=await actor('chat-founder'),peer=await actor('chat-peer');
 await post(founder,'Unread marker fixture');await peer.page.reload();await peer.page.locator('.nav-scroll a[href="#channel/general"] .channel-unread-dot').waitFor();
 assert.equal(await unread(peer),1);await channel(peer);await peer.page.waitForFunction(()=>document.querySelector('.nav-scroll a[href="#channel/general"]').dataset.unreadCount==='0');
 checks.push('Persistent channel unread dot clears when the visible channel opens');
 const input=peer.page.locator('#message-form textarea');
 await input.fill('Enter sends once');await input.press('Enter');await peer.page.getByText('Enter sends once',{exact:true}).waitFor();assert.equal((await messages()).filter(m=>m.body==='Enter sends once').length,1);
 await input.fill('First line');await input.press('Shift+Enter');await input.type('Second line');assert.equal(await input.inputValue(),'First line\nSecond line');await input.press('Enter');await peer.page.getByText('First line\nSecond line',{exact:true}).waitFor();
 const beforeIme=(await messages()).length;await input.fill('Composition fixture');await input.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true}));el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));});assert.equal((await messages()).length,beforeIme);await input.press('Enter');await peer.page.getByText('Composition fixture',{exact:true}).waitFor();
 checks.push('Enter sends exactly once; Shift+Enter inserts a newline; IME composition waits for confirmation');
 let release;const blocked=new Promise(resolve=>release=resolve);
 await peer.page.route('**/api/channels/general/messages',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().body==='Slow send fixture')await blocked;await route.continue();});
 await input.fill('Slow send fixture');await input.press('Enter');await peer.page.locator('#message-form [type=submit]:disabled').waitFor();await input.fill('Next unsent draft');await input.press('Enter');release();await peer.page.getByText('Slow send fixture',{exact:true}).waitFor();await idle(peer.page);assert.equal((await messages()).filter(m=>m.body==='Slow send fixture').length,1);assert.equal(await input.inputValue(),'Next unsent draft');await peer.page.unroute('**/api/channels/general/messages');
 await peer.page.goto(base+'/#home');await peer.page.locator('#main h1').waitFor();await channel(peer);assert.equal(await input.inputValue(),'Next unsent draft');await peer.page.reload();await input.waitFor();assert.equal(await input.inputValue(),'Next unsent draft');
 checks.push('Pending send suppresses duplicate Enter and keeps later typing; text drafts survive navigation and reload');
 const beforePreviewMessages=(await messages()).length,beforePreviewUploads=(await uploads()).length;
 await input.fill('Unsent image caption');await attachment(peer.page);assert.equal((await messages()).length,beforePreviewMessages);assert.equal((await uploads()).length,beforePreviewUploads);
 await peer.page.locator('#message-form [data-action=remove-chat-attachment]').click();await peer.page.locator('#message-form .chat-attachment-preview img').waitFor({state:'detached'});assert.equal(await input.inputValue(),'Unsent image caption');assert.equal((await uploads()).length,beforePreviewUploads);
 checks.push('Selecting and removing an image are local only and retain its caption');
 await attachment(peer.page);await channel(peer,'marketing');await input.fill('Marketing draft is independent');await channel(peer);assert.equal(await input.inputValue(),'Unsent image caption');await peer.page.locator('#message-form .chat-attachment-preview img').waitFor();
 await peer.page.route('**/api/uploads',route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Local fixture upload interruption'})}):route.continue());
 await input.press('Enter');await peer.page.locator('#message-form .form-error').filter({hasText:'Local fixture upload interruption'}).waitFor();await idle(peer.page);assert.equal(await input.inputValue(),'Unsent image caption');await peer.page.locator('#message-form .chat-attachment-preview img').waitFor();assert.equal((await messages()).length,beforePreviewMessages);assert.equal((await uploads()).length,beforePreviewUploads);await peer.page.unroute('**/api/uploads');
 await peer.page.locator('#message-form [type=submit]').click();await peer.page.locator('#message-feed').getByText('Unsent image caption',{exact:false}).waitFor();await idle(peer.page);const channelUpload=(await uploads()).at(-1),channelMessage=(await messages()).at(-1);assert.equal(channelUpload.context_type,'channel');assert.equal(channelUpload.context_id,'general');assert.equal(channelMessage.parent_id,null);assert.equal(channelMessage.body,'Unsent image caption\n/api/uploads/'+channelUpload.id);assert.equal(await input.inputValue(),'');await peer.page.locator('#message-feed img[src="/api/uploads/'+channelUpload.id+'"]').waitFor();
 checks.push('Image drafts stay with their channel; failed uploads preserve preview/caption; Send persists a channel-scoped upload and message');
 // A message failure after upload must reuse the successful upload rather than create duplicates.
 await input.fill('Caption survives message failure');await attachment(peer.page);const uploadsBeforeMessageFailure=(await uploads()).length;
 await peer.page.route('**/api/channels/general/messages',route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Local fixture message interruption'})}):route.continue());
 await input.press('Enter');await peer.page.locator('#message-form .form-error').filter({hasText:'Local fixture message interruption'}).waitFor();await idle(peer.page);assert.equal(await input.inputValue(),'Caption survives message failure');await peer.page.locator('#message-form .chat-attachment-preview img').waitFor();assert.equal((await uploads()).length,uploadsBeforeMessageFailure+1);await peer.page.unroute('**/api/channels/general/messages');
 await input.press('Enter');await peer.page.locator('#message-feed').getByText('Caption survives message failure',{exact:false}).waitFor();await idle(peer.page);assert.equal((await uploads()).length,uploadsBeforeMessageFailure+1);
 checks.push('Failed message creation retains its caption and image, and retry reuses the completed upload');
 // The request snapshots its originating channel even when navigation happens in flight.
 let releaseUpload;const heldUpload=new Promise(resolve=>releaseUpload=resolve);
 await peer.page.route('**/api/uploads',async route=>{if(route.request().method()==='POST')await heldUpload;await route.continue();});
 await input.fill('General image sent while switching context');await attachment(peer.page);await input.press('Enter');await peer.page.locator('#message-form [type=submit]:disabled').waitFor();
 await channel(peer,'marketing');assert.equal(await input.inputValue(),'Marketing draft is independent');await input.fill('Marketing draft during upload');const originSend=peer.page.waitForResponse(response=>response.url().endsWith('/api/channels/general/messages')&&response.request().method()==='POST');releaseUpload();
 await originSend;await peer.page.unroute('**/api/uploads');assert.equal(await input.inputValue(),'Marketing draft during upload');await channel(peer);await idle(peer.page);const switchedUpload=(await uploads()).at(-1),switchedMessage=(await messages()).find(m=>m.body==='General image sent while switching context\n/api/uploads/'+switchedUpload.id);assert.equal(switchedUpload.context_id,'general');assert.equal(switchedMessage.parent_id,null);assert.equal(await input.inputValue(),'');
 await attachment(peer.page);await input.press('Enter');await idle(peer.page);const imageOnlyUpload=(await uploads()).at(-1);assert.ok((await messages()).some(m=>m.body==='/api/uploads/'+imageOnlyUpload.id));
 checks.push('In-flight sends keep their original channel while newer channel drafts survive; image-only messages send without a caption');
 await input.fill('Thread parent fixture');await input.press('Enter');await peer.page.getByText('Thread parent fixture',{exact:true}).waitFor();const root=(await messages()).find(m=>m.body==='Thread parent fixture');await openThread(peer.page,root.id);
 assert.equal(await peer.page.locator('#dialog').evaluate(el=>el.open),false);assert.equal(await peer.page.locator('.chat-thread').count(),1);await peer.page.locator('#thread-form textarea').fill('Saved thread draft');await attachment(peer.page,'#thread-form');await closeThread(peer.page);await openThread(peer.page,root.id);assert.equal(await peer.page.locator('#thread-form textarea').inputValue(),'Saved thread draft');await peer.page.locator('#thread-form .chat-attachment-preview img').waitFor();
 await post(founder,'Another person replies while typing',root.id);await peer.page.locator('[data-thread-messages]').getByText('Another person replies while typing',{exact:true}).waitFor({timeout:20000});assert.equal(await peer.page.locator('#thread-form textarea').inputValue(),'Saved thread draft');await peer.page.locator('#thread-form .chat-attachment-preview img').waitFor();
 const beforeThreadSend=(await uploads()).length;await peer.page.locator('#thread-form textarea').press('Enter');await peer.page.locator('[data-thread-messages]').getByText('Saved thread draft',{exact:false}).waitFor();await idle(peer.page,'#thread-form');const threadUpload=(await uploads()).at(-1),threadMessage=(await messages()).find(m=>m.body==='Saved thread draft\n/api/uploads/'+threadUpload.id);assert.equal((await uploads()).length,beforeThreadSend+1);assert.equal(threadUpload.context_type,'channel');assert.equal(threadUpload.context_id,'general');assert.equal(threadMessage.parent_id,root.id);assert.equal(await peer.page.locator('#thread-form textarea').inputValue(),'');
 const panes=await peer.page.evaluate(()=>{const a=document.querySelector('#message-feed').getBoundingClientRect(),b=document.querySelector('.chat-thread').getBoundingClientRect();return {mainRight:a.right,threadLeft:b.left,threadRight:b.right,width:innerWidth};});assert.ok(panes.mainRight<=panes.threadLeft+1);assert.ok(panes.threadRight<=panes.width+1);await peer.page.screenshot({path:'tests/artifacts/chat-desktop-thread.png'});
 checks.push('Desktop thread is a contextual nonmodal right pane; thread caption/image drafts survive close and incoming replies; image send uses the correct parent');
 await peer.page.evaluate(()=>openDialog('Generic form fixture','<form id="generic-chat-fixture"><label for="generic-body">Comment</label><textarea id="generic-body" required></textarea><button type="submit">Save comment</button></form>'));
 await peer.page.locator('#generic-body').fill('Generic textarea');await peer.page.locator('#generic-body').press('Enter');assert.equal(await peer.page.locator('#generic-body').inputValue(),'Generic textarea\n');await peer.page.locator('#dialog [data-action=close-dialog]').click();assert.equal(await peer.page.locator('.chat-thread').count(),1);await closeThread(peer.page);assert.equal(await peer.page.locator(`#message-feed [data-action="open-thread"][data-id="${root.id}"]`).innerText(),'2 replies');
 checks.push('Generic dialogs retain normal multiline textarea behavior and closing one does not close the contextual thread');
 await peer.page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}));await post(founder,'Hidden tab should remain unread');await peer.page.evaluate(()=>loadChannelMessages());assert.equal(await unread(peer),1);await peer.page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});await peer.page.waitForFunction(()=>document.querySelector('.nav-scroll a[href="#channel/general"]').dataset.unreadCount==='0');
 await peer.page.evaluate(()=>openDialog('Read context fixture','<p>Read context stays in this dialog.</p>'));await post(founder,'Dialog covered channel remains unread');await peer.page.evaluate(()=>loadChannelMessages());assert.equal(await unread(peer),1);await peer.page.locator('#dialog [data-action=close-dialog]').click();await peer.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await peer.page.waitForFunction(()=>document.querySelector('.nav-scroll a[href="#channel/general"]').dataset.unreadCount==='0');
 checks.push('Hidden tabs and channels covered by a generic dialog stay unread until the channel is visible and focused');
 for(const width of [320,375,393]){
  await peer.page.setViewportSize({width,height:852});await peer.page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  await input.fill('A message that grows\nwith two lines\nwith three lines\nwith four lines\nand a fifth line');await attachment(peer.page);await input.focus();
  await visibleControls(peer.page,'#message-form',852);
  await viewportKeyboard(peer.page,420);await visibleControls(peer.page,'#message-form',420);const textBounds=await input.boundingBox();assert.ok(textBounds.height<=120);
  if(width===320){
   await peer.page.screenshot({path:'tests/artifacts/chat-channel-keyboard-320-v27.png'});
   await viewportKeyboard(peer.page,420,48);await visibleControls(peer.page,'#message-form',420,48);
   // Moving focus to an image action must not move the composer mid-tap.
   await peer.page.locator('#message-form [data-action=remove-chat-attachment]').focus();await visibleControls(peer.page,'#message-form',420,48);await input.focus();
  }
  await restoreViewport(peer.page);await peer.page.locator('#message-form [data-action=remove-chat-attachment]').click();await input.fill('');
  await openThread(peer.page,root.id);await peer.page.locator('#thread-form textarea').fill('Reply stays above keyboard');await attachment(peer.page,'#thread-form');await visibleControls(peer.page,'#thread-form',852);await peer.page.locator('#thread-form textarea').focus();await viewportKeyboard(peer.page,420);await visibleControls(peer.page,'#thread-form',420);await peer.page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  if(width===320){await viewportKeyboard(peer.page,420,48);await visibleControls(peer.page,'#thread-form',420,48);await peer.page.screenshot({path:'tests/artifacts/chat-thread-keyboard-320-v27.png'});}
  await restoreViewport(peer.page);
  if(width===393)await peer.page.screenshot({path:'tests/artifacts/chat-thread-mobile-v26.png'});await peer.page.locator('#thread-form [data-action=remove-chat-attachment]').click();await closeThread(peer.page);
 }
 await peer.page.setViewportSize({width:667,height:375});await visibleControls(peer.page,'#message-form',375);await openThread(peer.page,root.id);await visibleControls(peer.page,'#thread-form',375);await peer.page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await peer.page.screenshot({path:'tests/artifacts/chat-thread-landscape-v27.png'});await closeThread(peer.page);
 checks.push('Phone landscape retains visible channel and full-thread composers without horizontal overflow');
 await peer.page.setViewportSize({width:375,height:812});await peer.page.screenshot({path:'tests/artifacts/chat-mobile-v26.png'});
 checks.push('320px, 375px and 393px channels and full mobile threads keep 44px attachment/send targets above the simulated visualViewport keyboard without overflow; 320px keyboard pan and image-action focus retain controls; composer caps at four lines');
 await peer.page.emulateMedia({reducedMotion:'reduce'});await openThread(peer.page,root.id);await visibleControls(peer.page,'#thread-form',812);await closeThread(peer.page);await peer.page.emulateMedia({reducedMotion:'no-preference'});
 await channel(peer,'announcements');assert.equal(await peer.page.locator('#message-form').count(),0);assert.equal(await peer.page.locator('[data-action=attach-chat-image]').count(),0);
 for(const target of ['announcements','founders']){
  const response=await peer.context.request.post(base+'/api/uploads',{headers:{Origin:base},multipart:{context_type:'channel',context_id:target,file:{name:image.name,mimeType:image.mimeType,buffer:image.buffer}}});assert.equal(response.status(),403,await response.text());
 }
 checks.push('Reduced motion remains usable; read-only announcements expose no composer or image action, and restricted upload attempts receive 403');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM notifications').first()).n,0);assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_notification_deliveries').first()).n,0);assert.deepEqual(errors,[]);checks.push('Disposable fixture created no notifications or work emails and the browser reported no JavaScript errors');
 await writeFile('tests/artifacts/browser-chat-v26-report.json',JSON.stringify({passed:true,checks,errors,fixture:'Disposable local Miniflare D1; actual local upload and message endpoints; no remote mutations'},null,2));
 console.log(JSON.stringify({passed:true,count:checks.length,checks},null,2));
}catch(error){failure=error;console.error(error.stack);process.exitCode=1;await mkdir('tests/artifacts',{recursive:true});await writeFile('tests/artifacts/browser-chat-v26-report.json',JSON.stringify({passed:false,checks,errors,error:error.stack},null,2));}finally{await browser.close();await runtime.dispose();}
