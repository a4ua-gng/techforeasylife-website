// Maintenance changes access only; authentication and attendance records remain intact.
export async function maintenanceMode(env) {
 if(env.TEL_OS_MAINTENANCE==='full')return 'full';
 const setting=await env.DB.prepare("SELECT value FROM app_settings WHERE key='tel_maintenance_mode'").first();
 if(setting?.value==='full')return 'full';
 return env.TEL_OS_MAINTENANCE==='enabled'||setting?.value==='on'?'on':'off';
}
export async function maintenanceEnabled(env) { return await maintenanceMode(env)!=='off'; }
export async function maintenanceStatus(env) {
 const mode=await maintenanceMode(env),maintenance=mode!=='off',full_maintenance=mode==='full';
 return {service:'TEL OS',maintenance,full_maintenance,retry_after:maintenance?60:0,message:full_maintenance?'TEL OS is under maintenance. Access is paused for every account.':maintenance?'We’re making a few improvements. Founders and team members already clocked in can continue using TEL OS.':'TEL OS is available.'};
}
export function maintenanceResponse(full=false) {
 return new Response(JSON.stringify({maintenance:true,full_maintenance:full,error:full?'TEL OS is temporarily under maintenance. Access is paused for every account, including founders. Please try again shortly.':'TEL OS is temporarily under maintenance. Please try again shortly. If you are already clocked in, you can continue with your usual account.',retry_after:60}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Retry-After':'60'}});
}
export async function maintenanceAccess(env,user) {
 const mode=await maintenanceMode(env);
 if(mode==='off')return null;
 if(mode==='full')return maintenanceResponse(true);
 if(user?.role==='founder')return null;
 if(user?.id){
  const current=await env.DB.prepare("SELECT id FROM attendance_sessions WHERE user_id=? AND clock_out IS NULL AND state IN ('working','break') LIMIT 1").bind(user.id).first();
  if(current)return null;
 }
 return maintenanceResponse();
}
