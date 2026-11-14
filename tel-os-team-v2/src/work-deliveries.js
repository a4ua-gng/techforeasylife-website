// Work messages contain only a fixed category and a TEL OS link. Private notification
// titles/bodies never enter an external delivery or a provider request.
const APP_ORIGIN='https://tel-os-team-v2.xtremedivyangshu.workers.dev';
const GMAIL_SENDER='techforeasylife.operations@gmail.com';
const routes=new Map([
 ['tasks','Task update'],['attendance','Attendance reminder'],['schedule','Attendance reminder'],
 ['marketing-reports','Marketing report'],['connections','Account connection update'],
 ['grievances','Private HR update'],['founder-updates','Company overview'],['monitor','Company overview'],
 ['leave','Time off update'],['calendar','Work calendar update'],['reports','Work report'],
 ['performance','Feedback update'],['exits','Private HR update'],['documents','Document update'],
 ['hr','Private HR update'],['account','Account update'],['home','Workspace update'],
 ['notifications','Work update'],['people','Team update'],['guide','Getting started update'],
 ['images','Image update'],['website-team','Website team update']
]);
const categories=new Set([...routes.values(),'New work message']);
const routeSQL="CASE WHEN substr(n.link,1,1)='#' THEN substr(n.link,2) ELSE n.link END";
const channelSQL=`substr(${routeSQL},1,8)='channel/' AND length(${routeSQL}) BETWEEN 9 AND 88 AND substr(${routeSQL},9) NOT GLOB '*[^a-zA-Z0-9_-]*'`;
const categorySQL=`CASE ${[...routes].map(([route,category])=>`WHEN ${routeSQL}='${route}' THEN '${category}'`).join(' ')} WHEN ${channelSQL} THEN 'New work message' ELSE NULL END`;
const verifiedEmail="c.status='verified' AND length(trim(c.account)) BETWEEN 3 AND 254 AND trim(c.account) LIKE '%_@_%._%' AND trim(c.account) NOT GLOB '*[ <>]*' AND instr(c.account,char(9))=0 AND instr(c.account,char(10))=0 AND instr(c.account,char(13))=0";
const verifiedPhone="c.status='verified' AND length(c.account) BETWEEN 11 AND 16 AND substr(c.account,1,1)='+' AND substr(c.account,2,1) BETWEEN '1' AND '9' AND substr(c.account,2) NOT GLOB '*[^0-9]*'";
const enabledAt="COALESCE((SELECT value FROM app_settings WHERE key='work_notifications_enabled_at'),'9999-12-31T23:59:59.999Z')";

function workRoute(link){
 if(typeof link!=='string')return null;
 const route=link.startsWith('#')?link.slice(1):link;
 if(routes.has(route))return {route,category:routes.get(route)};
 if(/^channel\/[a-zA-Z0-9_-]{1,80}$/.test(route))return {route,category:'New work message'};
 return null;
}
function whatsappConfigured(env){return !!(env.WHATSAPP_TOKEN&&env.WHATSAPP_PHONE_NUMBER_ID&&env.WHATSAPP_WORK_TEMPLATE_NAME);}
async function enqueue(env,notification){
 const specific=notification!==undefined;
 if(specific&&(!notification||typeof notification.id!=='string'||typeof notification.user_id!=='string'))return {inserted:0};
 const statements=[];
 for(const channel of ['email','whatsapp']){
  const verified=channel==='email'?verifiedEmail:verifiedPhone;
  const configured=channel==='email'?"EXISTS(SELECT 1 FROM integration_status WHERE provider='gmail' AND status='active_chatgpt_job' AND account_label=?)":'?=1';
  const args=channel==='email'?[GMAIL_SENDER]:[whatsappConfigured(env)?1:0];
  const where=specific?' AND n.id=? AND n.user_id=?':'';
  if(specific)args.push(notification.id,notification.user_id);
  const unverified=channel==='email'?'Connect and verify your Google email for work notifications.':'Connect and verify your WhatsApp number for work notifications.';
  const unconfigured=channel==='email'?'The company Operations Gmail sender connection is required.':'The company WhatsApp work template is not configured.';
  // One bounded INSERT...SELECT per provider also captures reminders inserted in bulk.
  const sql=`WITH readiness AS(SELECT ${configured} AS configured), eligible AS(
   SELECT n.id,n.user_id,n.created_at,${categorySQL} AS category FROM notifications n JOIN users u ON u.id=n.user_id
   WHERE u.status IN ('active','on_leave') AND (${routeSQL} NOT IN ('founder-updates','monitor') OR u.role='founder') AND n.created_at>=${enabledAt}${where}
   AND NOT EXISTS(SELECT 1 FROM work_notification_deliveries d WHERE d.notification_id=n.id AND d.user_id=n.user_id AND d.channel='${channel}')
  ), candidates AS(SELECT * FROM eligible WHERE category IS NOT NULL ORDER BY created_at,id LIMIT ${specific?1:50})
  INSERT OR IGNORE INTO work_notification_deliveries(id,notification_id,user_id,channel,category,status,recipient,error,created_at)
  SELECT lower(hex(randomblob(16))),n.id,n.user_id,'${channel}',n.category,
   CASE WHEN ${verified} AND r.configured=1 THEN 'queued' ELSE 'blocked' END,
   CASE WHEN ${verified} THEN trim(c.account) ELSE '' END,
   CASE WHEN NOT COALESCE((${verified}),0) THEN '${unverified}' WHEN r.configured<>1 THEN '${unconfigured}' ELSE '' END,
   strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM candidates n CROSS JOIN readiness r LEFT JOIN member_connections c ON c.user_id=n.user_id AND c.provider='${channel==='email'?'gmail':'whatsapp'}'`;
  statements.push(env.DB.prepare(sql).bind(...args));
 }
 const results=await env.DB.batch(statements);
 return {inserted:results.reduce((sum,result)=>sum+(result.meta?.changes||0),0)};
}

// Only IDs from a saved notification are used; caller-supplied title/body/link are ignored.
export async function queueWorkDeliveries(env,notification){return enqueue(env,notification);}
export async function queuePendingWorkDeliveries(env){return enqueue(env);}

export async function deliverWorkWhatsApp(env){
 if(!whatsappConfigured(env))return {configured:false,accepted:0,needs_review:0};
 const result=await env.DB.prepare(`SELECT d.id,d.notification_id,d.user_id,d.category,n.link,c.account
  FROM work_notification_deliveries d JOIN notifications n ON n.id=d.notification_id AND n.user_id=d.user_id
  JOIN users u ON u.id=d.user_id JOIN member_connections c ON c.user_id=d.user_id AND c.provider='whatsapp'
  WHERE d.channel='whatsapp' AND d.status IN ('queued','blocked') AND u.status IN ('active','on_leave')
  AND ${verifiedPhone} AND (${routeSQL} NOT IN ('founder-updates','monitor') OR u.role='founder') AND n.created_at>=${enabledAt} ORDER BY d.created_at,d.id LIMIT 10`).all();
 let accepted=0,needs_review=0;
 for(const job of result.results||[]){
  const work=workRoute(job.link);
  if(!work||!categories.has(job.category)||work.category!==job.category){
   await env.DB.prepare("UPDATE work_notification_deliveries SET status='needs_review',error='This work update needs review before it can be sent.' WHERE id=? AND status IN ('queued','blocked')").bind(job.id).run();
   needs_review++;continue;
  }
  const claim=await env.DB.prepare(`UPDATE work_notification_deliveries SET status='sending',recipient=?,error=''
   WHERE id=? AND status IN ('queued','blocked') AND EXISTS(
    SELECT 1 FROM member_connections c JOIN users u ON u.id=c.user_id
    WHERE c.user_id=? AND c.provider='whatsapp' AND c.account=? AND ${verifiedPhone} AND u.status IN ('active','on_leave') AND (work_notification_deliveries.category<>'Company overview' OR u.role='founder'))`)
   .bind(job.account,job.id,job.user_id,job.account).run();
  if(!claim.meta?.changes)continue;
  try{
   const response=await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION||'v23.0'}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{
    method:'POST',headers:{Authorization:'Bearer '+env.WHATSAPP_TOKEN,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',to:job.account.slice(1),type:'template',template:{name:env.WHATSAPP_WORK_TEMPLATE_NAME,language:{code:'en_US'},components:[{type:'body',parameters:[{type:'text',text:work.category},{type:'text',text:APP_ORIGIN+'/#'+work.route}]}]}})
   });
   if(!response.ok)throw Error('Provider rejected this work update.');
   const data=await response.json(),providerId=data.messages?.[0]?.id;
   if(typeof providerId!=='string'||!providerId.trim()||providerId.length>200)throw Error('Provider did not confirm this work update.');
   await env.DB.prepare("UPDATE work_notification_deliveries SET status='accepted',provider_id=?,sent_at=?,error='' WHERE id=? AND status='sending'")
    .bind(providerId,new Date().toISOString(),job.id).run();
   accepted++;
  }catch{
   await env.DB.prepare("UPDATE work_notification_deliveries SET status='needs_review',error='WhatsApp did not confirm this work update. Review before retrying.' WHERE id=? AND status='sending'").bind(job.id).run();
   needs_review++;
  }
 }
 return {configured:true,accepted,needs_review};
}
