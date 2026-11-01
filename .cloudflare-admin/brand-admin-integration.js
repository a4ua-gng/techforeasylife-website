"use strict";
(() => {
 const mount=document.getElementById('brandSiteEditor');if(!mount||!globalThis.TELBrandEditor||!globalThis.TELBrandModel)return;
 const editor=globalThis.TELBrandEditor.create(mount,{
  value:state.draft.brandSite,
  onTab(tab){if(el.previewPage)el.previewPage.value=({education:"education.html",temark:"temark.html",clients:"temark.html",journey:"about.html",business:"business-details.html"})[tab]||"index.html";},
  onChange(value){state.draft.brandSite=value;updateMetrics();sendPreview();},
  onError(message){setStatus(el.globalStatus,message,'error');}
 });
 document.addEventListener('tel-admin-draft-synced',()=>editor.setValue(state.draft.brandSite));
 document.getElementById('saveBrandSiteDraft')?.addEventListener('click',async()=>{try{state.draft.brandSite=editor.validate();await saveDraft();}catch(error){setStatus(el.globalStatus,error.message,'error');}});
 document.getElementById('previewBrandSiteDraft')?.addEventListener('click',()=>{try{state.draft.brandSite=editor.validate();switchView('publish');refreshPreview();}catch(error){setStatus(el.globalStatus,error.message,'error');}});
})();
