'use strict';

presenceLabel=function(value){const online=value==='online';return `<span class="presence-label ${online?'online':'offline'}">${online?'Online · signed in':'Offline'}</span>`;};
const personCardBeforeSessionPresence=personCard;
personCard=function(person){return personCardBeforeSessionPresence(person).replace('<article class="person-card"',`<article class="person-card" data-presence-user="${esc(person.id)}"`);};
const activityInfoBeforeSessionPresence=handleAction;
handleAction=async function(element){
 if(element.dataset.action==='activity-info'){
  openDialog('What TEL OS records','<p><strong>Online</strong> means you are signed in to a valid TEL OS session. Switching tabs, leaving this page or being idle does not mark you Away. Sign out when you are finished using a shared device.</p><p><strong>Working</strong> means you have clocked in and are not on a break. Clocking out and signing out are separate actions.</p><p>TEL OS records its own section visits, app tab visibility and heartbeat times. Founders can review this app activity for 30 days. It does not read other browser tabs, other websites, passwords, typed text or private ticket contents.</p>');return;
 }
 return activityInfoBeforeSessionPresence(element);
};

function sessionPresenceStats(data){return `${stat('Online',data.people.filter(p=>p.presence==='online').length,'Signed in to TEL OS','people')}${stat('Working',data.people.filter(p=>p.work_status==='working').length,'Clocked in and not on a break','clock')}${stat('Overdue work',data.tasks.overdue||0,'Actual active assignments','task')}${stat('Pending leave',data.pending_leaves,'Awaiting review','calendar')}`;}

monitorPage=async function(){
 if(!isFounder())throw Error('Activity reports are restricted to founders.');
 const data=await api('/api/activity/report');records.monitor=data;
 return pageHeading('Activity & status','Login status, clocked-in work and recorded app activity.',button('Refresh now','refresh'),'FOUNDER OVERVIEW')+
 `<div class="note"><span>${esc(data.scope)} Activity history is retained for ${data.retention_days} days.</span></div><div class="stats" data-session-presence-stats style="margin-top:20px">${sessionPresenceStats(data)}</div>`+
 `<section class="panel" id="team-presence" tabindex="-1" aria-label="Team presence and last heartbeats"><div class="panel-header"><h2>Team presence</h2></div><div class="table-wrap"><table class="table"><thead><tr><th>Member</th><th>Department</th><th>Login status</th><th>Work status</th><th>Last heartbeat</th></tr></thead><tbody>${data.people.map(p=>`<tr data-heartbeat-user="${esc(p.id)}"><td>${esc(p.name)}</td><td>${esc(departmentLabel(p.department))}</td><td data-session-presence>${presenceLabel(p.presence)}</td><td data-work-presence>${badge(p.work_status)}</td><td data-last-heartbeat>${esc(datetime(p.last_seen))}</td></tr>`).join('')}</tbody></table></div></section>`+
 `<section class="panel" style="margin-top:24px"><div class="panel-header"><h2>Sections opened · last24hours</h2></div>${data.events.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Member</th><th>TEL OS section</th><th>Activity</th><th>Time</th></tr></thead><tbody>${data.events.map(event=>`<tr><td>${esc(event.name)}</td><td>${esc(human(event.section))}</td><td>${esc(human(event.event))}</td><td>${esc(datetime(event.created_at))}</td></tr>`).join('')}</tbody></table></div>`:empty('No recorded activity yet','Activity appears as members use TEL OS. There are no simulated records.')}</section>`+
 `<section class="panel panel-pad" style="margin-top:24px"><h2>Automation health</h2>${data.automation_runs.map(run=>`<div class="key-value"><span>${esc(human(run.key))}</span><strong>${esc(datetime(run.created_at))}</strong></div>`).join('')||'<p>No run recorded.</p>'}</section>`;
};

let sessionPresenceUpdating=false;
async function refreshSessionPresence(){
 if(sessionPresenceUpdating||!user||user.must_change_password||document.hidden||!['people','monitor'].includes(route)||!document.querySelector('.workspace'))return;
 const owner=user.id,pageRoute=route;sessionPresenceUpdating=true;
 try{
  const data=await api('/api/presence');
  if(!user||user.id!==owner||route!==pageRoute)return;
  const byId=new Map(data.people.map(person=>[person.id,person]));
  people=people.map(person=>{const state=byId.get(person.id);return state?{...person,presence:state.presence,crew_status:state.work_status}:person;});
  if(route==='people')for(const state of data.people){
   const card=document.querySelector(`[data-presence-user="${CSS.escape(state.id)}"]`);if(!card)continue;
   const presence=card.querySelector('.presence-label'),work=card.querySelector('.person-card-head .badge');
   if(presence)presence.outerHTML=presenceLabel(state.presence);
   if(work)work.outerHTML=badge(state.work_status);
  }
  if(route==='monitor'&&records.monitor){
   records.monitor.people=records.monitor.people.map(person=>({...person,...(byId.get(person.id)||{})}));
   for(const state of data.people){
    const row=document.querySelector(`[data-heartbeat-user="${CSS.escape(state.id)}"]`);if(!row)continue;
    row.querySelector('[data-session-presence]').innerHTML=presenceLabel(state.presence);
    row.querySelector('[data-work-presence]').innerHTML=badge(state.work_status);
    row.querySelector('[data-last-heartbeat]').textContent=datetime(state.last_seen);
   }
   const stats=document.querySelector('[data-session-presence-stats]');if(stats)stats.innerHTML=sessionPresenceStats(records.monitor);
  }
 }catch{}finally{sessionPresenceUpdating=false;}
}
setInterval(refreshSessionPresence,15000);
window.addEventListener('focus',refreshSessionPresence);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSessionPresence();});
