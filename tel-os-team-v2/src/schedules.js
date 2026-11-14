import {rows,one,run,json,fail,id,now,audit,notify} from './core.js';

const TZ='Asia/Kolkata',HR=['founder','hr_lead','hr_member'],HEADS=['team_lead','finance_head'];
const dateAt=at=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
const instant=(date,time)=>new Date(`${date}T${time}:00+05:30`).toISOString();
const weekday=date=>{const n=new Date(date+'T12:00:00Z').getUTCDay();return n===0?7:n;};
const plusDays=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function checkedTime(value){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))fail(400,'Use a start time in HH:mm format.');return value;}
function checkedDays(value){if(!Array.isArray(value)||!value.length||value.length>7||value.some(x=>!Number.isInteger(x)||x<1||x>7)||new Set(value).size!==value.length)fail(400,'Choose unique working weekdays from Monday to Sunday.');return [...value].sort((a,b)=>a-b);}
function checkedText(value,max,label){if(value===undefined)return '';if(typeof value!=='string'||value.length>max)fail(400,`${label} must be text, at most ${max} characters.`);return value.trim();}
const decoded=row=>row?{...row,enabled:!!row.enabled,weekdays:JSON.parse(row.weekdays_json),weekdays_json:undefined}:null;
const publicPolicy=row=>{const p=decoded(row);return p?{timezone:TZ,start_time:p.start_time,weekdays:p.weekdays,enabled:p.enabled,effective_date:p.effective_date,reminder_minutes:p.reminder_minutes,grace_minutes:p.grace_minutes,escalation_minutes:p.escalation_minutes}:null;};

async function context(env,at){
 const date=dateAt(at);
 const [policies,overrides,people,holidays,leaves,availability,clockIns,corrections]=await Promise.all([
  rows(env,'SELECT * FROM attendance_policy ORDER BY effective_date DESC,updated_at DESC,id DESC'),
  rows(env,'SELECT * FROM work_schedules ORDER BY effective_date DESC,updated_at DESC,id DESC'),
  rows(env,'SELECT id,name,department,role,manager_id,status,created_at FROM users ORDER BY name'),
  rows(env,'SELECT id,date,title FROM work_holidays WHERE date>=? AND date<=? ORDER BY date',date,plusDays(date,120)),
  rows(env,"SELECT user_id,start_date,end_date FROM leave_requests WHERE status='approved' AND end_date>=?",date),
  rows(env,"SELECT user_id,start_date,end_date,kind FROM availability WHERE kind IN ('exam','unavailable') AND end_date>=?",date),
  rows(env,'SELECT user_id,MIN(occurred_at) first_clock_in FROM clock_in_events WHERE occurred_at>=? AND occurred_at<? GROUP BY user_id',instant(date,'00:00'),instant(plusDays(date,1),'00:00')),
  rows(env,"SELECT DISTINCT user_id FROM attendance_corrections WHERE work_date=? AND status='approved'",date)
 ]);
 if(!policies.length)fail(503,'Clock-in schedules are being configured. Please retry shortly.');
 return {date,at,policies,overrides,people,holidays,leaves,availability,clockIns,corrections};
}
function policyFor(ctx,date){return ctx.policies.find(p=>p.effective_date<=date)||ctx.policies[ctx.policies.length-1];}
function configuration(ctx,user,date){
 const policy=decoded(policyFor(ctx,date));
 const override=decoded(ctx.overrides.find(s=>s.user_id===user.id&&s.effective_date<=date));
 return {...policy,...(override||{}),timezone:TZ,enabled:policy.enabled&&(override?override.enabled:true),effective_date:override?[policy.effective_date,override.effective_date].sort().at(-1):policy.effective_date,inherited:!override,reminder_minutes:policy.reminder_minutes,grace_minutes:policy.grace_minutes,escalation_minutes:policy.escalation_minutes};
}
function exemption(ctx,user,date){
 if(user.status==='on_leave')return 'On leave';
 if(['suspended','exited'].includes(user.status))return 'Account is inactive';
 const holiday=ctx.holidays.find(h=>h.date===date);if(holiday)return holiday.title;
 if(ctx.leaves.some(l=>l.user_id===user.id&&l.start_date<=date&&l.end_date>=date))return 'Approved leave';
 if(ctx.availability.some(a=>a.user_id===user.id&&a.start_date<=date&&a.end_date>=date))return 'Academic or unavailable calendar entry';
 if(date===ctx.date&&ctx.corrections.some(c=>c.user_id===user.id))return 'Attendance correction approved';
 return '';
}
function todayState(ctx,user,config){
 const scheduled_at=instant(ctx.date,config.start_time),first_clock_in=ctx.clockIns.find(c=>c.user_id===user.id)?.first_clock_in||null;
 const base={date:ctx.date,status:'not_scheduled',reason:'',scheduled_at,first_clock_in,minutes_late:first_clock_in?Math.max(0,Math.ceil((Date.parse(first_clock_in)-Date.parse(scheduled_at))/60000)):0};
 const exempt=exemption(ctx,user,ctx.date);if(exempt)return {...base,status:'exempt',reason:exempt};
 if(!config.enabled)return {...base,reason:'Clock-in reminders are disabled for this schedule'};
 if(ctx.date<config.effective_date)return {...base,reason:`Schedule begins ${config.effective_date}`};
 if(!config.weekdays.includes(weekday(ctx.date)))return {...base,reason:'Not a scheduled working day'};
 if(Date.parse(config.activated_at)>Date.parse(scheduled_at)&&dateAt(config.activated_at)===ctx.date)return {...base,reason:'Schedule was activated after today’s scheduled start'};
 if(Date.parse(user.created_at)>Date.parse(scheduled_at)&&dateAt(user.created_at)===ctx.date)return {...base,reason:'Account was created after today’s scheduled start'};
 const graceAt=Date.parse(scheduled_at)+config.grace_minutes*60000;
 if(first_clock_in)return {...base,status:Date.parse(first_clock_in)<=graceAt?'on_time':'late',reason:Date.parse(first_clock_in)<=graceAt?'Clock-in recorded within the grace period':'Clock-in recorded after the grace period'};
 const t=Date.parse(ctx.at);return {...base,status:t<Date.parse(scheduled_at)?'upcoming':t<graceAt?'due':'missing',reason:t<Date.parse(scheduled_at)?'Clock in at your scheduled start':t<graceAt?'Your clock-in is due':'No clock-in recorded after the grace period'};
}
function nextShift(ctx,user){
 for(let n=0;n<=90;n++){const date=plusDays(ctx.date,n),config=configuration(ctx,user,date);if(!config.enabled||date<config.effective_date||!config.weekdays.includes(weekday(date))||exemption(ctx,user,date))continue;const scheduled_at=instant(date,config.start_time);if(Date.parse(scheduled_at)<=Date.parse(ctx.at))continue;return {date,scheduled_at,start_time:config.start_time};}
 return null;
}
function scheduleView(ctx,user){const c=configuration(ctx,user,ctx.date),pending=decoded([...ctx.overrides].reverse().find(s=>s.user_id===user.id&&s.effective_date>ctx.date));return {user_id:user.id,name:user.name,department:user.department,manager_id:user.manager_id,inherited:c.inherited,start_time:c.start_time,weekdays:c.weekdays,enabled:c.enabled,effective_date:c.effective_date,note:c.note||'',today:todayState(ctx,user,c),next_shift:nextShift(ctx,user),pending_change:pending?{start_time:pending.start_time,weekdays:pending.weekdays,enabled:pending.enabled,effective_date:pending.effective_date,note:pending.note}:null};}
function validateChange(body,current,at){
 const start_time=checkedTime(body.start_time===undefined?current.start_time:body.start_time),weekdays=checkedDays(body.weekdays===undefined?current.weekdays:body.weekdays);
 if(body.enabled!==undefined&&typeof body.enabled!=='boolean')fail(400,'Enabled must be true or false.');
 const enabled=body.enabled===undefined?current.enabled:body.enabled,effective_date=body.effective_date===undefined?current.effective_date:body.effective_date;
 if(!validDate(effective_date)||effective_date<dateAt(at))fail(400,'Choose today or a future effective date.');
 if(enabled&&effective_date===dateAt(at)&&Date.parse(instant(effective_date,start_time))<=Date.parse(at))fail(400,'Today’s start has passed. Choose a future start or a future effective date.');
 return {start_time,weekdays,enabled,effective_date};
}
function writable(user){if(!HR.includes(user.role))fail(403,'HR or a founder must update clock-in schedules.');}

export async function handleSchedules({request,url,env,user,body={}}){
 const path=url.pathname,method=request.method;
 if(path==='/api/schedules'&&method==='GET'){
  const ctx=await context(env,now());
  const visible=ctx.people.filter(p=>HR.includes(user.role)||p.id===user.id||(HEADS.includes(user.role)&&p.department===user.department));
  const schedules=visible.map(p=>scheduleView(ctx,p)),self=schedules.find(s=>s.user_id===user.id);
  const pendingPolicy=[...ctx.policies].reverse().find(p=>p.effective_date>ctx.date);
  return json({policy:publicPolicy(policyFor(ctx,ctx.date)),pending_policy:pendingPolicy?publicPolicy(pendingPolicy):null,schedules,today:self?.today||null,next_shift:self?.next_shift||null,holidays:ctx.holidays});
 }
 if(path==='/api/schedules/policy'&&method==='PATCH'){
  if(!['founder','hr_lead'].includes(user.role))fail(403,'Only founders and the HR lead can change the company clock-in policy.');
  const at=now(),ctx=await context(env,at),current=publicPolicy(policyFor(ctx,ctx.date)),change=validateChange(body,current,at);
  const timings={};for(const [key,max] of [['reminder_minutes',120],['grace_minutes',60],['escalation_minutes',240]]){const value=body[key]===undefined?current[key]:body[key];if(!Number.isInteger(value)||value<0||value>max)fail(400,`${key.replaceAll('_',' ')} must be an integer from 0 to ${max}.`);timings[key]=value;}
  if(timings.escalation_minutes<timings.grace_minutes)fail(400,'Escalation must follow the grace period.');
  if(body.timezone!==undefined&&body.timezone!==TZ)fail(400,'The company schedule uses Asia/Kolkata.');
  const pid=id();await run(env,'INSERT INTO attendance_policy(id,timezone,start_time,weekdays_json,enabled,effective_date,reminder_minutes,grace_minutes,escalation_minutes,activated_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',pid,TZ,change.start_time,JSON.stringify(change.weekdays),change.enabled?1:0,change.effective_date,timings.reminder_minutes,timings.grace_minutes,timings.escalation_minutes,at,at,user.id);
  await audit(env,user,'clock_in_policy_updated','attendance_policy',pid,`Effective ${change.effective_date} at ${change.start_time} IST`);
  const people=ctx.people.filter(p=>['active','on_leave'].includes(p.status));for(const person of people)await notify(env,person.id,'Company clock-in schedule updated',`The default start is ${change.start_time} IST from ${change.effective_date}. Open your schedule for working days and personal exceptions.`,'schedule');
  return json({policy:{timezone:TZ,...change,...timings}});
 }
 const match=path.match(/^\/api\/schedules\/([^/]+)$/);
 if(match&&['PUT','DELETE'].includes(method)){
  writable(user);const target=await one(env,'SELECT id,name,department,role,manager_id,status,created_at FROM users WHERE id=?',match[1]);if(!target)fail(404,'Team member not found.');
  if(method==='DELETE'){
   const ctx=await context(env,now()),policy=decoded(policyFor(ctx,ctx.date)),alreadyClocked=ctx.clockIns.some(c=>c.user_id===target.id);
   if(policy.enabled&&policy.effective_date<=ctx.date&&policy.weekdays.includes(weekday(ctx.date))&&!exemption(ctx,target,ctx.date)&&!alreadyClocked&&Date.parse(instant(ctx.date,policy.start_time))<=Date.parse(ctx.at))fail(409,'Today’s company start has passed. Set a future personal schedule, or reset before the next company start to avoid a retroactive missed-clock-in alert.');
   await run(env,'DELETE FROM work_schedules WHERE user_id=?',target.id);await audit(env,user,'clock_in_schedule_reset','user',target.id);await notify(env,target.id,'Clock-in schedule reset','Your schedule now follows the company default. Check your next working day.','schedule');const updated=await context(env,now());return json({schedule:scheduleView(updated,target)});
  }
  const at=now(),ctx=await context(env,at),current=configuration(ctx,target,ctx.date),change=validateChange(body,current,at),note=checkedText(body.note,1000,'Schedule note');
  await run(env,'INSERT INTO work_schedules(id,user_id,start_time,weekdays_json,enabled,effective_date,note,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,effective_date) DO UPDATE SET start_time=excluded.start_time,weekdays_json=excluded.weekdays_json,enabled=excluded.enabled,note=excluded.note,updated_by=excluded.updated_by,updated_at=excluded.updated_at',id(),target.id,change.start_time,JSON.stringify(change.weekdays),change.enabled?1:0,change.effective_date,note,user.id,at);
  await audit(env,user,'clock_in_schedule_updated','user',target.id,`Effective ${change.effective_date} at ${change.start_time} IST`);
  await notify(env,target.id,'Your clock-in schedule changed',`Clock in at ${change.start_time} IST on your scheduled weekdays from ${change.effective_date}. Open your schedule for details.`,'schedule');
  const updated=await context(env,at);return json({schedule:scheduleView(updated,target)});
 }
 if(path==='/api/holidays'&&method==='POST'){
  writable(user);if(!validDate(body.date)||body.date<dateAt(now()))fail(400,'Choose today or a future holiday date.');const title=checkedText(body.title,150,'Holiday title');if(!title)fail(400,'Enter a holiday title.');const hid=id();
  try{await run(env,'INSERT INTO work_holidays(id,date,title,created_by,created_at) VALUES(?,?,?,?,?)',hid,body.date,title,user.id,now());}catch(e){if(String(e).includes('UNIQUE'))fail(409,'A company holiday already exists on this date.');throw e;}
  await audit(env,user,'company_holiday_added','holiday',hid,body.date);return json({holiday:{id:hid,date:body.date,title}},201);
 }
 const holidayMatch=path.match(/^\/api\/holidays\/([^/]+)$/);
 if(holidayMatch&&method==='DELETE'){
  writable(user);const holiday=await one(env,'SELECT id,date FROM work_holidays WHERE id=?',holidayMatch[1]);if(!holiday)fail(404,'Holiday not found.');
  if(holiday.date===dateAt(now())){const ctx=await context(env,now()),without={...ctx,holidays:ctx.holidays.filter(h=>h.id!==holiday.id)};if(ctx.people.some(person=>['due','missing'].includes(todayState(without,person,configuration(without,person,ctx.date)).status)))fail(409,'Today’s working start has passed for a team member. Keep this holiday to avoid retroactive missed-clock-in alerts; update future holidays instead.');}
  await run(env,'DELETE FROM work_holidays WHERE id=?',holiday.id);await audit(env,user,'company_holiday_removed','holiday',holiday.id,holiday.date);return json({ok:true});
 }
 return null;
}

export async function runAttendanceReminders(env,at=now()){
 if(!Number.isFinite(Date.parse(at)))fail(400,'Invalid schedule check time.');const ctx=await context(env,at);let count=0,missing=0;
 const pending=[];
 const notice=(userId,title,body,key)=>pending.push([id(),userId,title,body,'schedule',at,key]);
 for(const user of ctx.people){
  const config=configuration(ctx,user,ctx.date),state=todayState(ctx,user,config);if(['not_scheduled','exempt','on_time','late'].includes(state.status))continue;
  const start=Date.parse(state.scheduled_at),t=Date.parse(at),key=`clock-in:${ctx.date}:${user.id}:${config.start_time}`;
  if(t<start-config.reminder_minutes*60000)continue;
  if(state.status==='upcoming')notice(user.id,'Your scheduled start is coming up',`Clock in at ${config.start_time} IST today. If you have an exam or approved leave, keep your availability up to date.`,key+':reminder');
  else if(state.status==='due')notice(user.id,'It is time to clock in',`Your scheduled start is ${config.start_time} IST. Open Attendance and clock in when you begin.`,key+':due');
  else if(state.status==='missing'){
   missing++;notice(user.id,'Scheduled clock-in missed',`No clock-in was recorded within ${config.grace_minutes} minutes of ${config.start_time} IST. Clock in now, or contact HR if your schedule needs correcting.`,key+':missing');
   if(t>=start+config.escalation_minutes*60000){const recipients=new Set(ctx.people.filter(p=>['hr_lead','hr_member'].includes(p.role)&&p.status==='active').map(p=>p.id));const manager=ctx.people.find(p=>p.id===user.manager_id&&p.status==='active');if(manager)recipients.add(manager.id);recipients.delete(user.id);for(const recipient of recipients)notice(recipient,'Scheduled clock-in needs follow-up',`${user.name} has not clocked in for the ${config.start_time} IST start. Check their availability and offer support before deciding next steps.`,key+':follow-up:'+recipient);}
  }
 }
 // Each ten-row insert uses70 parameters, below D1's100-parameter limit.
 // Keep scheduled checks within the Free Workers query budget as the team grows.
 for(let offset=0;offset<pending.length;offset+=10){const chunk=pending.slice(offset,offset+10),placeholders=chunk.map(()=>'(?,?,?,?,?,?,?)').join(',');const result=await run(env,`INSERT OR IGNORE INTO notifications(id,user_id,title,body,link,created_at,dedupe_key) VALUES ${placeholders}`,...chunk.flat());count+=result.meta?.changes||0;}
 return {schedule_notifications:count,missing_clock_ins:missing,checked_at:at};
}
