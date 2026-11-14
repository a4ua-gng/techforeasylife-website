import {rows,one,json,fail,audit} from './core.js';

const reviewers=new Set(['founder','hr_lead','hr_member']);
async function allowPerson(env,user,personId){
 const person=await one(env,'SELECT id FROM users WHERE id=?',personId);
 if(!person)fail(404,'Employee not found.');
 if(user.id!==personId&&!reviewers.has(user.role))fail(403,'Identity documents are private to the employee and authorised HR.');
}
function item(row){return {id:row.id,source_page:row.source_page,mime_type:row.mime_type,size:row.size,created_at:row.created_at,url:'/api/identity-documents/'+row.id};}

export async function handleIdentity({request,url,env,user}){
 const path=url.pathname,method=request.method;
 if(!['GET','HEAD'].includes(method))return null;
 const person=path.match(/^\/api\/people\/([^/]+)\/identity-documents$/);
 const imported=path.match(/^\/api\/profile-imports\/([^/]+)\/identity-documents$/);
 if(person||imported){
  let documents;
  if(person){await allowPerson(env,user,person[1]);documents=await rows(env,'SELECT d.* FROM identity_documents d JOIN profile_imports p ON p.id=d.import_id WHERE p.matched_user_id=? AND p.state=\'matched\' ORDER BY d.source_page',person[1]);}
  else{if(!reviewers.has(user.role))fail(403,'Imported identity documents are restricted to HR.');if(!await one(env,'SELECT id FROM profile_imports WHERE id=?',imported[1]))fail(404,'Employee record not found.');documents=await rows(env,'SELECT * FROM identity_documents WHERE import_id=? ORDER BY source_page',imported[1]);}
  await audit(env,user,'identity_documents_listed',person?'user':'employee_import',person?.[1]||imported[1]);
  return json({documents:documents.map(item),scope:'Private employee identity documents. Access is recorded.',source:'User-supplied employee PDF'});
 }
 const document=path.match(/^\/api\/identity-documents\/([^/]+)$/);
 if(document){
  const record=await one(env,'SELECT d.*,p.matched_user_id,p.state FROM identity_documents d JOIN profile_imports p ON p.id=d.import_id WHERE d.id=?',document[1]);
  if(!record||(!reviewers.has(user.role)&&!(record.state==='matched'&&record.matched_user_id===user.id)))fail(404,'Identity document not found.');
  const headers={'Content-Type':record.mime_type,'Cache-Control':'private, no-store','Content-Disposition':'inline; filename="employee-identity-document.webp"'};
  if(method==='HEAD')return new Response(null,{headers});
  const parts=await rows(env,'SELECT data_base64 FROM identity_document_chunks WHERE document_id=? ORDER BY part',record.id);
  const data=new Uint8Array(record.size);let offset=0;
  for(const part of parts){const chunk=Uint8Array.from(atob(part.data_base64),c=>c.charCodeAt(0));if(offset+chunk.length>data.length)fail(500,'Identity document storage needs review.');data.set(chunk,offset);offset+=chunk.length;}
  if(offset!==data.length)fail(500,'Identity document storage needs review.');
  await audit(env,user,'identity_document_viewed','employee_import',record.import_id);
  return new Response(data,{headers});
 }
 return null;
}
