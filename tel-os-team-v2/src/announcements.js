import {id,now,json,fail,one,rows} from './core.js';

const audiences=['Company','Leadership','HR','Marketing','Finance','Strategy'];
const managementRoles=['founder','hr_lead','hr_member'];
const canManage=user=>managementRoles.includes(user.role);
const managedAudiences=user=>user.role==='founder'?audiences:['Company','HR'];
const manages=(user,announcement)=>canManage(user)&&managedAudiences(user).includes(announcement.audience);
const targeted=(user,announcement)=>user.role==='founder'||announcement.audience==='Company'||announcement.audience===user.department;
const active=announcement=>announcement.status==='published'&&(!announcement.expires_at||Date.parse(announcement.expires_at)>Date.now());
const readable=(user,announcement)=>manages(user,announcement)||(announcement.status==='published'&&targeted(user,announcement));
const selection=`SELECT a.*,creator.name AS creator_name,editor.name AS updater_name,CASE WHEN d.revision=a.revision THEN 1 ELSE 0 END AS dismissed FROM announcements a JOIN users creator ON creator.id=a.created_by JOIN users editor ON editor.id=a.updated_by LEFT JOIN announcement_dismissals d ON d.announcement_id=a.id AND d.user_id=?`;
const view=row=>({...row,dismissed:!!row.dismissed});
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);
function plain(value,label,max,multiline=false){
 if(typeof value!=='string')fail(400,`Enter an announcement ${label}.`);
 const result=value.trim();
 if(!result||result.length>max)fail(400,`The ${label} must contain 1 to ${max} characters.`);
 if((multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(result))fail(400,`Use plain text for the ${label}.`);
 return result;
}
function expiration(value){
 if(value===null||value==='')return null;
 if(typeof value!=='string'||value.length>40||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))fail(400,'Choose a valid expiry date and time.');
 const result=new Date(value).toISOString();
 if(Date.parse(result)<=Date.now())fail(400,'The expiry must be in the future.');
 return result;
}
function content(body,user,previous=null){
 const data={title:body.title===undefined&&previous?previous.title:plain(body.title,'title',160),body:body.body===undefined&&previous?previous.body:plain(body.body,'body',10000,true),audience:body.audience===undefined?(previous?.audience||'Company'):body.audience,status:body.status===undefined?(previous?.status||'draft'):body.status,expires_at:body.expires_at===undefined?(previous?.expires_at||null):expiration(body.expires_at)};
 if(!audiences.includes(data.audience))fail(400,'Choose a valid announcement audience.');
 if(!managedAudiences(user).includes(data.audience))fail(403,'HR can publish to Company or HR. A founder can manage other departments.');
 if(!['draft','published','archived'].includes(data.status))fail(400,'Choose draft, published or archived.');
 if(!previous&&data.status==='archived')fail(400,'Create a draft or publish the announcement first.');
 if(data.status==='published'&&previous?.status!=='published'&&data.expires_at&&Date.parse(data.expires_at)<=Date.now())fail(400,'Choose a future expiry before publishing.');
 return data;
}
function revision(value){if(!Number.isSafeInteger(value)||value<1)fail(400,'Include the current announcement revision.');return value;}
async function get(env,user,announcementId){return one(env,selection+' WHERE a.id=?',user.id,announcementId);}

export async function handleAnnouncements({request,url,env,user,body={}}){
 const path=url.pathname,match=path.match(/^\/api\/announcements\/([^/]+)(\/dismiss)?$/);
 if(path!=='/api/announcements'&&!match)return null;
 if(!user)fail(401,'Sign in to TEL OS.');
 if(!['active','on_leave'].includes(user.status))fail(403,'This account cannot access announcements.');
 if(user.must_change_password)fail(403,'Set your personal password before opening announcements.');
 const method=request.method;
 if(!match){
  if(method==='GET'){
   const management=url.searchParams.get('manage')==='1',history=url.searchParams.get('history')==='1';
   if(management&&!canManage(user))fail(403,'Only HR and founders can manage announcements.');
   const scope=management?(user.role==='founder'?'1=1':"a.audience IN ('Company','HR')"):(user.role==='founder'?'1=1':"(a.audience='Company' OR a.audience=?)");
   const params=!management&&user.role!=='founder'?[user.department]:[];
   const lifecycle=management?'':` AND a.status='published'${history?'':' AND (a.expires_at IS NULL OR a.expires_at>?)'}`;
   const data=await rows(env,selection+` WHERE ${scope}${lifecycle} ORDER BY COALESCE(a.published_at,a.created_at) DESC,a.updated_at DESC,a.id LIMIT 201`,user.id,...params,...(!management&&!history?[now()]:[]));
   return json({announcements:data.slice(0,200).map(view),has_more:data.length>200,can_manage:canManage(user),audiences:canManage(user)?managedAudiences(user):[],history,management});
  }
  if(method==='POST'){
   if(!canManage(user))fail(403,'Only HR and founders can publish announcements.');
   const data=content(body,user),announcementId=id(),at=now();
   await env.DB.prepare('INSERT INTO announcements(id,title,body,audience,status,expires_at,published_at,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(announcementId,data.title,data.body,data.audience,data.status,data.expires_at,data.status==='published'?at:null,user.id,at,user.id,at).run();
   return json({announcement:view(await get(env,user,announcementId))},201);
  }
  fail(405,'Use GET to read or POST to create an announcement.');
 }
 const announcementId=match[1];if(!validId(announcementId))fail(404,'Announcement not found.');
 const announcement=await get(env,user,announcementId);
 if(!announcement||!readable(user,announcement))fail(404,'Announcement not found.');
 if(match[2]){
  if(method!=='POST')fail(405,'Use POST to dismiss an announcement.');
  if(!active(announcement)||!targeted(user,announcement))fail(404,'Announcement not found.');
  const expected=revision(body.revision);if(expected!==announcement.revision)fail(409,'This announcement changed. Refresh it before dismissing.');
  const saved=await env.DB.prepare(`INSERT INTO announcement_dismissals(announcement_id,user_id,revision,dismissed_at) SELECT id,?,?,? FROM announcements WHERE id=? AND revision=? AND status='published' AND (expires_at IS NULL OR expires_at>?) ON CONFLICT(announcement_id,user_id) DO UPDATE SET revision=excluded.revision,dismissed_at=excluded.dismissed_at`).bind(user.id,expected,now(),announcementId,expected,now()).run();
  if(!saved.meta?.changes)fail(409,'This announcement changed or expired. Refresh it before dismissing.');
  return json({ok:true,id:announcementId,revision:expected,dismissed:true});
 }
 if(method==='GET')return json({announcement:view(announcement),can_manage:manages(user,announcement)});
 if(method==='PATCH'){
  if(!canManage(user))fail(403,'Only HR and founders can edit announcements.');
  if(!manages(user,announcement))fail(404,'Announcement not found.');
  const expected=revision(body.revision);if(expected!==announcement.revision)fail(409,'Someone updated this announcement. Refresh it before saving.');
  const data=content(body,user,announcement),changed=Object.keys(data).some(key=>data[key]!==announcement[key]);
  if(!changed)return json({announcement:view(announcement),unchanged:true});
  const at=now(),publishedAt=data.status==='published'?(announcement.published_at||at):announcement.published_at;
  const result=await env.DB.prepare('UPDATE announcements SET title=?,body=?,audience=?,status=?,expires_at=?,published_at=?,updated_by=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?').bind(data.title,data.body,data.audience,data.status,data.expires_at,publishedAt,user.id,at,announcementId,expected).run();
  if(!result.meta?.changes)fail(409,'Someone updated this announcement. Refresh it before saving.');
  return json({announcement:view(await get(env,user,announcementId)),unchanged:false});
 }
 fail(405,'Use GET to read or PATCH to edit an announcement.');
}
