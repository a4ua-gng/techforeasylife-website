import {helpers,json,fail,readBody,authenticate,authRoutes,id,rows,requireRole} from './core.js';
import {handleAdmin} from './admin.js';
import {handleWorkflows,runAutomations} from './workflows.js';
import {handleCollaboration} from './collaboration.js';
import {handleSchedules} from './schedules.js';
import {handleExtensions} from './extensions.js';
import {handleMedia} from './media.js';
import {handleConnections,googleCallback,connectionState} from './connections.js';
import {handleWebsite} from './website.js';
const binaries=typeof __BINARY_ASSETS__==='undefined'?{}:__BINARY_ASSETS__;
const assets={'/':{type:'text/html; charset=utf-8',value:__HTML__},'/index.html':{type:'text/html; charset=utf-8',value:__HTML__},'/styles.css':{type:'text/css; charset=utf-8',value:__CSS__},'/app.js':{type:'application/javascript; charset=utf-8',value:__APP__}};
function secure(response,requestId){const h=new Headers(response.headers);h.set('X-Content-Type-Options','nosniff');h.set('X-Frame-Options','DENY');h.set('Referrer-Policy','same-origin');h.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');h.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");h.set('Cache-Control','no-store');h.set('X-Request-ID',requestId);return new Response(response.body,{status:response.status,headers:h});}
export default {
 async fetch(request,env){const requestId=id();try{
  const url=new URL(request.url),mutating=!['GET','HEAD'].includes(request.method);
  if(mutating){const origin=request.headers.get('Origin');if(origin!==url.origin)fail(403,'Requests must originate from this TEL OS workspace.');}
  if(url.pathname==='/api/health'&&request.method==='GET')return secure(json({service:'TEL OS',version:'2.2.0'}),requestId);
  if(['GET','HEAD'].includes(request.method)&&assets[url.pathname]){const asset=assets[url.pathname];return secure(new Response(request.method==='HEAD'?null:asset.value,{headers:{'Content-Type':asset.type}}),requestId);}
  if(url.pathname==='/favicon.ico')return secure(new Response(null,{status:204}),requestId);
  if(['GET','HEAD'].includes(request.method)&&binaries[url.pathname]){const a=binaries[url.pathname];return secure(new Response(request.method==='HEAD'?null:Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0)),{headers:{'Content-Type':a.type}}),requestId);}
  if(!url.pathname.startsWith('/api/'))fail(404,'Page not found.');
  if(url.pathname==='/api/connections/google/callback'&&request.method==='GET')return secure(await googleCallback(request,env),requestId);
  const body=mutating&&url.pathname!=='/api/uploads'?await readBody(request):{};
  const user=await authenticate(request,env),context={request,url,env,user,body,helpers};
  let response=await authRoutes(context);
  if(!response&&url.pathname.startsWith('/api/connections'))response=await handleConnections(context);
  if(!response&&user.role!=='founder'){const setting=await env.DB.prepare("SELECT value FROM app_settings WHERE key='require_connections'").first();if(setting?.value==='true'&&!(await connectionState(env,user)).complete)fail(428,'Connect your verified Google email and WhatsApp before using the workspace.');}
  if(!response&&url.pathname==='/api/automations'&&request.method==='GET'){requireRole(user,'founder');response=json({schedule:'Every 5 minutes',timezone:'Asia/Kolkata',delivery:'In-app notification centre',runs:await rows(env,'SELECT * FROM automation_runs ORDER BY created_at DESC LIMIT 30')});}
  if(!response&&url.pathname==='/api/automations/run'&&request.method==='POST'){requireRole(user,'founder');response=json(await runAutomations(env));}
  if(!response)response=await handleAdmin(context);
  if(!response)response=await handleWebsite(context);
  if(!response)response=await handleMedia(context);
  if(!response)response=await handleExtensions(context);
  if(!response)response=await handleSchedules(context);
  if(!response)response=await handleWorkflows(context);
  if(!response)response=await handleCollaboration(context);
  if(!response)fail(404,'API endpoint not found.');
  return secure(response,requestId);
 }catch(e){const status=Number.isInteger(e.status)?e.status:500;if(status===500)console.error(JSON.stringify({event:'request_failed',request_id:requestId,path:new URL(request.url).pathname,error:String(e.message).slice(0,250)}));return secure(json({error:status===500?'An unexpected error occurred. Please retry.':e.message,request_id:requestId},status),requestId);}},
 async scheduled(event,env,ctx){ctx.waitUntil(runAutomations(env).then(result=>console.log(JSON.stringify({event:'automation_completed',...result}))).catch(error=>{console.error(JSON.stringify({event:'automation_failed',error:String(error.message)}));throw error;}));}
};
