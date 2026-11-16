// Maintenance is an access gate only. It never changes authentication or attendance.
export async function maintenanceEnabled(env) {
 if(env.TEL_OS_MAINTENANCE==='enabled')return true;
 const setting=await env.DB.prepare("SELECT value FROM app_settings WHERE key='tel_maintenance_mode'").first();
 return setting?.value==='on';
}

export async function maintenanceStatus(env) {
 const maintenance=await maintenanceEnabled(env);
 return {service:'TEL OS',maintenance,retry_after:maintenance?60:0,message:maintenance?'We’re making a few improvements. Founders and team members already clocked in can continue using TEL OS.':'TEL OS is available.'};
}

export function maintenanceResponse() {
 return new Response(JSON.stringify({maintenance:true,error:'TEL OS is temporarily under maintenance. Please try again shortly. If you are already clocked in, you can continue with your usual account.',retry_after:60}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Retry-After':'60'}});
}

export async function maintenanceAccess(env,user) {
 if(!await maintenanceEnabled(env))return null;
 if(user?.role==='founder')return null;
 if(user?.id){
  const current=await env.DB.prepare("SELECT id FROM attendance_sessions WHERE user_id=? AND clock_out IS NULL AND state IN ('working','break') LIMIT 1").bind(user.id).first();
  if(current)return null;
 }
 return maintenanceResponse();
}
