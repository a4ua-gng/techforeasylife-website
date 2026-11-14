import {json,fail,audit,requireRole} from './core.js';

const textLimits={id:60,name:100,role:160,quote:400,label:100,image:200,alt:220,section:20};
function cleanMember(member,index=0){
 if(!member||typeof member!=='object'||Array.isArray(member))fail(400,'Invalid team member.');
 const out={};
 for(const [field,max] of Object.entries(textLimits)){
  if(member[field]!==undefined&&typeof member[field]!=='string')fail(400,'Team fields must be text.');
  const value=(member[field]||'').trim();
  if(value.length>max||/[<>\x00-\x08]/.test(value))fail(400,`Invalid public team ${field}.`);
  out[field]=value;
 }
 out.id=out.id.toLowerCase();
 if(!/^[a-z0-9][a-z0-9-]{1,59}$/.test(out.id)||!out.name||!out.role||!['team','leadership'].includes(out.section))fail(400,'Each member needs a valid ID, name, role and section.');
 if(out.image&&(out.image.includes('..')||/^[a-z]+:/i.test(out.image)||out.image.startsWith('//')||!/^[a-zA-Z0-9_./-]+$/.test(out.image)))fail(400,'Use an existing relative website image path.');
 out.alt=out.alt||`${out.name}, ${out.role}`.slice(0,220);
 const order=Number(member.order);
 out.order=Math.min(999,Math.max(1,Number.isFinite(order)?Math.round(order):index+1));
 out.active=member.active!==false;
 return out;
}
function assertLeadershipUnchanged(existing,members){
 const before=existing.filter(member=>member.section==='leadership');
 const after=members.filter(member=>member.section==='leadership');
 if(before.length!==after.length||before.some(member=>{
  const next=after.find(candidate=>candidate.id===member.id);
  return !next||JSON.stringify(member)!==JSON.stringify(next);
 }))fail(403,'HR can update Team entries; leadership changes require a founder.');
}
async function readTeam(response){
 if(!response.ok)fail(502,'The website team service could not respond.');
 let value;
 try{value=await response.json();}catch{fail(502,'The website team response was invalid.');}
 if(!value||value.ok!==true||!Array.isArray(value.data?.members))fail(502,'The website team response was invalid.');
 const revision=value.revision??null;
 if(revision!==null&&(typeof revision!=='string'||!/^[a-f0-9]{40}$/i.test(revision)))fail(502,'The website team revision was invalid.');
 return {ok:true,exists:value.exists!==false,revision,publishingReady:value.publishingReady!==false,publishingNote:typeof value.publishingNote==='string'?value.publishingNote:null,data:{version:value.data.version||1,updatedAt:value.data.updatedAt||null,members:value.data.members.map(cleanMember)}};
}
export async function handleWebsite({request,url,env,user,body={}}){
 if(url.pathname!=='/api/website/team')return null;
 requireRole(user,'founder','hr_lead','hr_member');
 if(!['GET','PUT'].includes(request.method))return null;
 if(!env.WEBSITE_ADMIN||!env.TEL_OS_TEAM_KEY)fail(503,'The Team-only website connection needs administrator setup.');
 const current=await readTeam(await env.WEBSITE_ADMIN.fetch(new Request('https://website.internal/api/team')));
 if(request.method==='GET')return json(current);
 if(!current.publishingReady)fail(503,current.publishingNote||'Publishing is unavailable. Renew the website GitHub credential before saving Team changes.');
 if(!Object.hasOwn(body,'expectedRevision'))fail(400,'Reload the Team editor before saving. Its current revision is required.');
 if(body.expectedRevision!==current.revision)fail(409,'The public team changed while you were editing. Reload it before saving.');
 if(!Array.isArray(body.members)||body.members.length>50)fail(400,'Provide up to 50 team members.');
 const members=body.members.map(cleanMember);
 if(new Set(members.map(member=>member.id)).size!==members.length)fail(400,'Team IDs must be unique.');
 if(user.role!=='founder')assertLeadershipUnchanged(current.data.members,members);
 const result=await env.WEBSITE_ADMIN.fetch(new Request('https://website.internal/api/team',{
  method:'PUT',headers:{'Content-Type':'application/json','X-TEL-OS-Team-Key':env.TEL_OS_TEAM_KEY,'X-TEL-OS-Role':user.role},
  body:JSON.stringify({members,expectedRevision:current.revision})
 }));
 let data;
 try{data=await result.json();}catch{fail(502,'The website team response was invalid.');}
 if(!result.ok)fail(result.status===503?503:result.status>=500?502:result.status,data.error||'The website could not save the team.');
 const saved=await readTeam(Response.json(data));
 await audit(env,user,'public_website_team_updated','website','team',`${members.length} public entries`);
 return json({...saved,message:typeof data.message==='string'?data.message:'Team saved.',commit:typeof data.commit==='string'?data.commit:null});
}
