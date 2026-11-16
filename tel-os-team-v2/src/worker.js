import {helpers,json,fail,readBody,authenticate,authRoutes,id,rows,requireRole} from './core.js';
import {maintenanceStatus,maintenanceAccess} from './maintenance.js';
import {handleHRRecords} from './hr-records.js';
import {handleDeadlinePolicy,runDeadlinePolicy} from './deadline-policy.js';
import {handleAdmin} from './admin.js';
import {handleWorkflows,runAutomations} from './workflows.js';
import {handleCollaboration} from './collaboration.js';
import {handleSchedules} from './schedules.js';
import {handleExtensions} from './extensions.js';
import {handleMedia} from './media.js';
import {handleConnections,googleCallback,connectionState} from './connections.js';
import {handleWebsite} from './website.js';
import {handleEmailVerification} from './email-verification.js';
import {handleIdentity} from './identity.js';
import {handleFounderUpdates} from './founder-updates.js';
import {handleTaskTransfers} from './task-transfers.js';
import {runOperationalEmails,getOperationalEmailStatus,verifyOperationalEmailDomain} from './operational-emails.js';
const binaries=typeof __BINARY_ASSETS__==='undefined'?{}:__BINARY_ASSETS__;
const assets={'/':{type:'text/html; charset=utf-8',value:__HTML__},'/index.html':{type:'text/html; charset=utf-8',value:__HTML__},'/styles.css':{type:'text/css; charset=utf-8',value:__CSS__},'/app.js':{type:'application/javascript; charset=utf-8',value:__APP__}};
function secure(response,requestId){const h=new Headers(response.headers);h.set('X-Content-Type-Options','nosniff');h.set('X-Frame-Options','DENY');h.set('Referrer-Policy','same-origin');h.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');h.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");h.set('Cache-Control','no-store');h.set('X-Request-ID',requestId);return new Response(response.body,{status:response.status,headers:h});}
export default {
 async fetch(request,env,ctx){const requestId=id();try{
  const url=new URL(request.url),mutating=!['GET','HEAD'].includes(request.method);
  if(mutating){const origin=request.headers.get('Origin');if(origin!==url.origin)fail(403,'Requests must originate from this TEL OS workspace.');}
  if(url.pathname==='/api/status'&&request.method==='GET')return secure(json(await maintenanceStatus(env)),requestId);
  if(url.pathname==='/api/health'&&request.method==='GET')return secure(json({service:'TEL OS',version:'2.7.0'}),requestId);
  if(['GET','HEAD'].includes(request.method)&&assets[url.pathname]){const asset=assets[url.pathname];return secure(new Response(request.method==='HEAD'?null:asset.value,{headers:{'Content-Type':asset.type}}),requestId);}
  if(url.pathname==='/favicon.ico')return secure(new Response(null,{status:204}),requestId);
  if(['GET','HEAD'].includes(request.method)&&binaries[url.pathname]){const a=binaries[url.pathname];return secure(new Response(request.method==='HEAD'?null:Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0)),{headers:{'Content-Type':a.type}}),requestId);}
  if(!url.pathname.startsWith('/api/'))fail(404,'Page not found.');
  const user=await authenticate(request,env);
  if(!(request.method==='POST'&&['/api/auth/login','/api/auth/logout'].includes(url.pathname))){const maintenance=await maintenanceAccess(env,user);if(maintenance)return secure(maintenance,requestId);}
  if(url.pathname==='/api/connections/google/callback'&&request.method==='GET'){if(env.NOTIFICATION_CHANNELS==='email')fail(410,'Use email verification instead.');return secure(await googleCallback(request,env),requestId);}
  const body=mutating&&url.pathname!=='/api/uploads'?await readBody(request):{};
  const context={request,url,env,user,body,helpers};
  let response=await authRoutes(context);
  if(!response&&url.pathname.startsWith('/api/connections'))response=await handleEmailVerification(context)||await handleConnections(context);
  if(!response&&user.role!=='founder'){const setting=await env.DB.prepare("SELECT value FROM app_settings WHERE key='require_connections'").first();if((env.NOTIFICATION_CHANNELS==='email'||setting?.value==='true')&&!(await connectionState(env,user)).complete)fail(428,'Verify your notification email before using the workspace.');}
  if(!response&&url.pathname==='/api/automations'&&request.method==='GET'){requireRole(user,'founder');response=json({schedule:'Every 5 minutes',timezone:'Asia/Kolkata',delivery:'In-app notification centre',runs:await rows(env,'SELECT * FROM automation_runs ORDER BY created_at DESC LIMIT 30')});}
  if(!response&&url.pathname==='/api/automations/run'&&request.method==='POST'){requireRole(user,'founder');response=json(await runAutomations(env));}
  if(!response&&url.pathname==='/api/operational-emails/status'&&request.method==='GET'){requireRole(user,'founder');response=json({...await getOperationalEmailStatus(env),...(url.searchParams.get('verify')==='domain'?{domain:await verifyOperationalEmailDomain(env)}:{})});}
  if(!response)response=await handleHRRecords(context);
  if(!response)response=await handleDeadlinePolicy(context);
  if(!response)response=await handleAdmin(context);
  if(!response)response=await handleWebsite(context);
  if(!response)response=await handleMedia(context);
  if(!response)response=await handleIdentity(context);
  if(!response)response=await handleFounderUpdates(context);
  if(!response)response=await handleExtensions(context);
  if(!response)response=await handleSchedules(context);
  if(!response)response=await handleTaskTransfers(context);
  if(!response)response=await handleWorkflows(context);
  if(!response)response=await handleCollaboration(context);
  if(!response)fail(404,'API endpoint not found.');
  if(response.ok&&env.TEL_OS_OPERATIONAL_EMAILS==='enabled'&&request.method!=='GET'){
   const types=url.pathname==='/api/tasks'&&request.method==='POST'&&body.priority==='urgent'?['urgent_task_assigned']:url.pathname==='/api/meetings'&&request.method==='POST'?['meeting_invitation']:/^\/api\/(?:tasks\/[^/]+\/transfers|task-transfers\/[^/]+)$/.test(url.pathname)?['task_transfer_requested','task_transfer_approved']:null;
   if(types){const work=runOperationalEmails(env,{deliveryOnly:true,types}).catch(()=>console.error(JSON.stringify({event:'operational_email_dispatch_needs_retry'})));if(ctx?.waitUntil)ctx.waitUntil(work);else await work;}
  }
  return secure(response,requestId);
 }catch(e){const status=Number.isInteger(e.status)?e.status:500;if(status===500)console.error(JSON.stringify({event:'request_failed',request_id:requestId,path:new URL(request.url).pathname,error:String(e.message).slice(0,250)}));return secure(json({error:status===500?'An unexpected error occurred. Please retry.':e.message,request_id:requestId},status),requestId);}},
 async scheduled(event,env,ctx){ctx.waitUntil((async()=>{await runDeadlinePolicy(env);const jobs=[['operational_emails',()=>runOperationalEmails(env)]];if(new Date(event.scheduledTime??Date.now()).getUTCMinutes()%5===0)jobs.push(['attendance_and_workflows',()=>runAutomations(env)]);const results=await Promise.allSettled(jobs.map(([,run])=>run()));for(let i=0;i<results.length;i++){const result=results[i];console[result.status==='fulfilled'?'log':'error'](JSON.stringify({event:result.status==='fulfilled'?'automation_completed':'automation_failed',service:jobs[i][0],...(result.status==='fulfilled'?{result:result.value}:{error:'Scheduled operation needs review.'})}));}if(results.some(result=>result.status==='rejected'))throw Error('Scheduled operation needs review.');})());}
};
