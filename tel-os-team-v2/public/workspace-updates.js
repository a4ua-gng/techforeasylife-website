'use strict';
const beforeUpdatesShell=shell,beforeUpdatesAction=handleAction,beforeUpdatesAccount=accountPage,beforeUpdatesNotifications=notificationsPage;
shell=function(){beforeUpdatesShell();if(isFounder())$('.nav-scroll')?.insertAdjacentHTML('beforeend',navLink('founder-updates','Founder text updates','document'));};
async function founderUpdatesPage(){
 if(!isFounder())throw Error('Founder updates are restricted to founders.');
 const data=await api('/api/founder-updates');records.founderUpdates=data;
 return pageHeading('Founder text updates','Readable updates from recorded team activity.',button('Copy text summary','copy-founder-updates','primary'),'FOUNDER INBOX')+
 `<section class="panel panel-pad founder-summary"><div class="panel-header"><h2>Current overview</h2><a class="btn small" href="/api/founder-updates?format=text">Download text</a></div><ul>${data.summary_text.map(line=>'<li>'+esc(line)+'</li>').join('')}</ul><p class="hint">Updated ${esc(datetime(data.generated_at))} · IST</p></section>`+
 `<div class="note" style="margin:20px 0"><span>${esc(data.privacy)}</span></div><section class="panel">${data.updates.length?data.updates.map(update=>`<article class="list-card founder-text-update"><div class="list-card-head"><strong>${esc(update.category)}</strong>${badge(update.status)}</div><p class="pre">${esc(update.text)}</p>${update.link?`<a class="link-btn" href="#${esc(update.link)}">Open related work →</a>`:''}</article>`).join(''):empty('No recorded updates yet','Real work and connection updates will appear here.')}</section>${data.has_more?'<p class="hint">Showing the latest updates. Open the related work records for the complete history.</p>':''}`;
}
notificationsPage=async function(){const html=await beforeUpdatesNotifications();return html+(isFounder()?'<div class="form-actions"><a class="btn" href="#founder-updates">Open founder text updates</a></div>':'');};
accountPage=async function(){return await beforeUpdatesAccount()+`<section class="panel panel-pad private-identity-panel"><h2>My identity documents</h2><p>Review the identity card supplied with your employee record. This is separate from your profile photo.</p>${button('View my identity card','identity-own')}</section>`;};
async function appendIdentityDocuments(type,id){
 const host=$('.dialog-content');if(!host)return;
 const marker='identity-documents-'+crypto.randomUUID();host.insertAdjacentHTML('beforeend',`<section class="private-identity-documents" id="${marker}"><h3>Private identity card</h3><p role="status" class="hint">Loading the supplied document…</p></section>`);
 try{const prefix=type==='person'?'/api/people/':'/api/profile-imports/',data=await api(prefix+encodeURIComponent(id)+'/identity-documents'),region=document.getElementById(marker);if(!region)return;
  region.innerHTML='<h3>Private identity card</h3><p class="hint">Visible only to this employee and authorised HR/founders. Access is recorded.</p>'+(data.documents.length?data.documents.map(doc=>`<figure class="identity-document"><a href="${esc(doc.url)}" target="_blank" rel="noopener"><img src="${esc(doc.url)}" alt="Identity document supplied in employee PDF, page ${esc(doc.source_page)}" loading="lazy"></a><figcaption>Employee PDF · page ${esc(doc.source_page)} · <a href="${esc(doc.url)}" target="_blank" rel="noopener">Open full-size card</a></figcaption></figure>`).join(''):'<p>No identity card was supplied for this record. A profile photo is shown separately when available.</p>');
 }catch(error){const region=document.getElementById(marker);if(region)region.innerHTML='<h3>Private identity card</h3><p class="form-error" role="alert">'+esc(error.message)+'</p>';}
}
handleAction=async function(element){
 const action=element.dataset.action;
 if(action==='identity-own'){openDialog('My private identity documents','<p>Original document images from your supplied employee record.</p>');await appendIdentityDocuments('person',user.id);return;}
 if(action==='pdf-view'){await beforeUpdatesAction(element);await appendIdentityDocuments('import',element.dataset.id);return;}
 if(action==='copy-founder-updates'){if(!isFounder())throw Error('Only founders can access this summary.');const value=records.founderUpdates?.plain_text;if(!value)throw Error('Refresh the updates and try again.');if(navigator.clipboard){await navigator.clipboard.writeText(value);toast('Founder text summary copied.');}else openDialog('Founder text summary','<pre class="pre">'+esc(value)+'</pre>');return;}
 return beforeUpdatesAction(element);
};
