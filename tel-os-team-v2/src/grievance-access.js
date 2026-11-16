import {rows,one,fail} from './core.js';

// Read paths support old databases and old tickets. New writes require the
// additive migration, so a missing migration can never broaden a new ticket.
async function schemaState(env){const tables=await rows(env,"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('grievance_access','grievance_founder_recipients')");return {config:tables.some(row=>row.name==='grievance_access'),recipients:tables.some(row=>row.name==='grievance_founder_recipients')};}
export async function grievanceAccessReady(env){const state=await schemaState(env);return state.config&&state.recipients;}

export async function grievanceScope(env,user,alias='g'){
 if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(alias))throw Error('Invalid ticket alias.');
 const legacy=`(v.role='founder' OR (v.role IN ('hr_lead','hr_member') AND ${alias}.founder_only=0))`;
 const state=await schemaState(env);
 const access=state.config?`(
  (NOT EXISTS(SELECT 1 FROM grievance_access ga WHERE ga.ticket_id=${alias}.id) AND ${legacy}) OR
  EXISTS(SELECT 1 FROM grievance_access ga WHERE ga.ticket_id=${alias}.id AND (
   (ga.hr_visible=1 AND v.role IN ('hr_lead','hr_member')) OR
   (${state.recipients?"v.role='founder' AND EXISTS(SELECT 1 FROM grievance_founder_recipients gf WHERE gf.ticket_id=ga.ticket_id AND gf.founder_id=v.id)":'0'})
  )))`:state.recipients?'0':legacy;
 return {sql:`EXISTS(SELECT 1 FROM users v WHERE v.id=? AND v.status IN ('active','on_leave') AND (${alias}.user_id=v.id OR ${access}))`,params:[user?.id||'']};
}

export async function canAccessGrievance(env,user,ticketId,{review=false}={}){
 const scope=await grievanceScope(env,user);
 return !!await one(env,`SELECT g.id FROM grievances g WHERE g.id=? AND ${scope.sql}${review?" AND g.user_id<>? AND EXISTS(SELECT 1 FROM users r WHERE r.id=? AND r.role IN ('founder','hr_lead','hr_member'))":''}`,ticketId,...scope.params,...(review?[user?.id||'',user?.id||'']:[]));
}

export async function validateGrievanceRecipients(env,user,body){
 if(!await one(env,"SELECT id FROM users WHERE id=? AND status IN ('active','on_leave')",user.id))fail(403,'This account cannot open a private ticket.');
 if(typeof body.hr_visible!=='boolean')fail(400,'Choose whether the HR team can see this ticket.');
 if(!Array.isArray(body.founder_ids)||body.founder_ids.length>50||body.founder_ids.some(value=>typeof value!=='string'||!value||value.length>80)||new Set(body.founder_ids).size!==body.founder_ids.length)fail(400,'Choose founders from the available reviewer list.');
 if(body.founder_only!==undefined&&(typeof body.founder_only!=='boolean'||body.founder_only===body.hr_visible))fail(400,'Ticket visibility choices conflict.');
 const founders=body.founder_ids.length?await rows(env,`SELECT id FROM users WHERE role='founder' AND status='active' AND id IN (${body.founder_ids.map(()=>'?').join(',')})`,...body.founder_ids):[];
 if(founders.length!==body.founder_ids.length)fail(400,'Choose only currently active founders.');
 const independentFounder=founders.some(founder=>founder.id!==user.id);
 const independentHR=body.hr_visible&&await one(env,"SELECT id FROM users WHERE role IN ('hr_lead','hr_member') AND status IN ('active','on_leave') AND id<>? LIMIT 1",user.id);
 if(!independentFounder&&!independentHR)fail(400,'Choose at least one other reviewer: the HR team or an active founder.');
 if(!await grievanceAccessReady(env))fail(503,'Private ticket routing needs the latest database migration.');
 return {hr_visible:body.hr_visible,founder_ids:body.founder_ids};
}

export async function grievanceReviewers(env,ticketId){
 const scope=await grievanceScope(env,{id:''});
 // Substitute the viewer parameter with each actual account. This keeps
 // notifications tied to the same current-role rules as reads and attachments.
 const sql=scope.sql.replace('v.id=?','v.id=r.id');
 return rows(env,`SELECT r.id FROM users r JOIN grievances g ON g.id=? WHERE r.role IN ('founder','hr_lead','hr_member') AND r.id<>g.user_id AND ${sql}`,ticketId);
}

export async function withGrievanceVisibility(env,tickets,user){
 if(!tickets.length)return tickets;
 const state=await schemaState(env),ids=tickets.map(ticket=>ticket.id),configs=[],recipients=[],owners=[];
 // D1 accepts at most 100 bound values per statement. A ticket list has 200.
 for(let offset=0;offset<ids.length;offset+=80){
  const chunk=ids.slice(offset,offset+80),marks=chunk.map(()=>'?').join(',');
  if(state.config)configs.push(...await rows(env,`SELECT * FROM grievance_access WHERE ticket_id IN (${marks})`,...chunk));
  if(state.config&&state.recipients)recipients.push(...await rows(env,`SELECT gf.ticket_id,gf.founder_id,u.name,u.role,u.status FROM grievance_founder_recipients gf JOIN users u ON u.id=gf.founder_id WHERE gf.ticket_id IN (${marks}) ORDER BY u.name,u.id`,...chunk));
  owners.push(...await rows(env,`SELECT g.id ticket_id,u.id,u.name FROM grievances g JOIN users u ON u.id=g.user_id WHERE g.id IN (${marks})`,...chunk));
 }
 const actor=await one(env,'SELECT role,status FROM users WHERE id=?',user.id);
 return tickets.map(ticket=>{
  const config=configs.find(row=>row.ticket_id===ticket.id),founders=recipients.filter(row=>row.ticket_id===ticket.id).map(row=>({id:row.founder_id,name:row.name,available:row.role==='founder'&&['active','on_leave'].includes(row.status)}));
  const owner=owners.find(row=>row.ticket_id===ticket.id);
  return {...ticket,can_review:ticket.user_id!==user.id&&['founder','hr_lead','hr_member'].includes(actor?.role)&&['active','on_leave'].includes(actor?.status),visibility:{explicit:!!config,owner:owner?{id:owner.id,name:owner.name}:undefined,hr_visible:config?!!config.hr_visible:!ticket.founder_only,founders,founder_ids:founders.map(founder=>founder.id),legacy_all_founders:!config}};
 });
}
