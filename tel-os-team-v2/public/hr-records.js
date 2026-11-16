'use strict';

let hrRecordsFilters={};
function hrRecordsTable(label,columns,items,render,emptyCopy){
 return `<section class="panel hr-record-section"><div class="panel-header"><h2>${esc(label)}</h2><span class="small muted">${items.records.length} shown</span></div>${items.records.length?`<div class="table-wrap"><table class="table hr-record-table"><caption class="sr-only">${esc(label)}</caption><thead><tr>${columns.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${items.records.map(row=>`<tr>${render(row).map((value,i)=>`<td data-label="${esc(columns[i])}">${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:`<div class="hr-record-empty">${esc(emptyCopy)}</div>`}${items.truncated?'<p class="note warning">This section has more records. Narrow the date range or choose a team member to review the remaining records.</p>':''}</section>`;
}
async function hrRecordsPage(){
 if(!isHR())throw Error('HR records are restricted to HR and founders.');
 const query=new URLSearchParams(hrRecordsFilters),data=await api('/api/hr-records'+(query.size?'?'+query.toString():''));records.hrRecords=data;
 const {filters,people:staff,meeting_attendance:meetings,meeting_history:history,work_presence:work,task_deadlines:deadlines,deadline_extensions:extensions}=data;
 const selected=filters.user_id?staff.filter(p=>p.id===filters.user_id):staff;
 return pageHeading('HR control panel','People, attendance and deadlines in one private workspace.','<a class="btn" href="#hr">'+icon('people')+'People admin</a>','HR · PRIVATE RECORDS')+
 `<section class="hr-control-intro panel panel-pad"><div><span class="department-tag">HR & founders</span><h2>Keep the people details in place.</h2><p>Review reported meeting attendance, official work sessions and task deadlines. Open the existing review tools when someone needs support.</p></div><div class="hr-control-links"><a href="#hr">${icon('people')}Staff records</a><a href="#leave">${icon('leave')}Leave reviews</a><a href="#attendance">${icon('clock')}Attendance & schedules</a><a href="#grievances">${icon('shield')}Confidential HR desk</a><a href="#channel/hr">${icon('hash')}HR team chat</a><a href="#documents">${icon('document')}Policies</a></div></section>`+
 `<form class="panel panel-pad hr-record-filters" data-hr-record-filter><div class="field"><label for="hr-record-from">From · IST</label><input id="hr-record-from" name="from" type="date" value="${esc(filters.from)}" required></div><div class="field"><label for="hr-record-to">To · IST</label><input id="hr-record-to" name="to" type="date" value="${esc(filters.to)}" required></div><div class="field"><label for="hr-record-person">Team member</label><select id="hr-record-person" name="user_id"><option value="">Everyone</option>${staff.map(p=>`<option value="${esc(p.id)}" ${filters.user_id===p.id?'selected':''}>${esc(p.name+' · '+departmentLabel(p.department))}</option>`).join('')}</select></div><button class="btn primary" type="submit">Apply filters</button><p class="form-error" role="alert" data-hr-filter-error></p></form>`+
 `<div class="stats hr-control-stats">${stat('Team members',selected.length,'Current account records','people')}${stat('Attendance records',meetings.records.length,'Reported meeting participants shown','meeting')}${stat('Workdays recorded',work.records.length,'Clock-in records shown','clock')}${stat('Task deadlines',deadlines.records.length,'Assignments in this date range','task')}</div>`+
 `<p class="hint hr-record-scope">${esc(data.scope)} Dates filter meeting days, workdays and task due dates in IST. Current staff status is shown separately.</p>`+
 hrRecordsTable('Current staff status',['Team member','Department','Account','Login','Work status'],{records:selected,truncated:false},p=>[esc(p.name),esc(departmentLabel(p.department)),badge(p.status),badge(p.login_status),badge(p.work_status)],'No team member matches this filter.')+
 hrRecordsTable('Reported meeting attendance',['Meeting','Member','Attendance','Recorded by','Last recorded'],meetings,m=>[`<strong>${esc(m.meeting_title)}</strong><small>${esc(datetime(m.starts_at))} IST</small>`,esc(m.name),badge(m.status),esc(m.recorder_name),`${esc(datetime(m.recorded_at))}<small>Revision ${esc(m.revision)}</small>`],'No meeting attendance has been reported in this date range. Meeting organisers can record it from Meetings.')+
 hrRecordsTable('Recorded work presence',['Member','Workday','First clock-in','Last clock-out','Active time','Session state'],work,w=>[esc(w.name),esc(date(w.work_date)),esc(datetime(w.first_clock_in)),w.last_clock_out?esc(datetime(w.last_clock_out)):'Open session',esc(Math.floor(w.active_seconds/3600)+'h '+Math.floor(w.active_seconds%3600/60)+'m'),badge(w.state)],'No clock-in sessions match these filters.')+
 hrRecordsTable('Task deadlines',['Assignment','Member','Department','Reviewer','Due date','Work stage'],deadlines,t=>[esc(t.task_title),esc(t.name),esc(departmentLabel(t.department)),esc(t.reviewer_name),esc(date(t.deadline)),badge(t.status)],'No task deadlines match these filters.')+
 hrRecordsTable('Deadline extensions',['Assignment','Member','Original deadline','Extended deadline','Follow-up','Recorded'],extensions,e=>[esc(e.task_title),esc(e.name),esc(date(e.original_deadline)),esc(date(e.extended_deadline)),e.escalated_at?'Escalated for review':'Extension recorded',esc(datetime(e.created_at))],extensions.available?'No deadline extensions match these filters.':'Deadline extension records are not yet available.')+
 `<details class="hr-record-history"><summary>Meeting attendance correction history</summary>${hrRecordsTable('Attendance audit history',['Meeting','Member','Change','Recorded by','Time'],history,h=>[esc(h.meeting_title),esc(h.name),`${esc(h.previous_status?human(h.previous_status):'Unrecorded')} → ${esc(human(h.status))}`,esc(h.recorder_name),esc(datetime(h.recorded_at))],'No attendance changes match these filters.')}</details>`;
}

(() => {
 const previousShell=shell,previousMeetingsPage=meetingsPage,previousAction=handleAction;
 shell=function(){previousShell();if(isHR())$('.nav-scroll')?.insertAdjacentHTML('beforeend',navLink('hr-records','HR control panel','shield'));if(route==='hr-records'){const crumb=$('.breadcrumb strong');if(crumb)crumb.textContent='HR control panel';}};
 const eligible=meeting=>isHR()||meeting.created_by===user.id||meeting.participants?.includes(user.id);
 meetingsPage=async function(){
  const template=document.createElement('template');template.innerHTML=await previousMeetingsPage();
  for(const meeting of records.meetings||[]){
   if(!eligible(meeting))continue;
   const opener=[...template.content.querySelectorAll('[data-action="meeting-details"]')].find(el=>el.dataset.id===meeting.id),card=opener?.closest('article');if(!card)continue;
   const section=document.createElement('section');section.className='meeting-attendance-panel';section.dataset.meetingAttendance=meeting.id;
   section.innerHTML=`<div class="meeting-attendance-heading"><div><h4>Attendance roster</h4><p class="hint">Reported by the organiser or HR. Call joins are not tracked.</p></div>${button('Open roster','meeting-attendance-open','small',`data-id="${esc(meeting.id)}" aria-expanded="false"`)}</div><div data-meeting-roster hidden></div>`;card.append(section);
  }
  return template.innerHTML;
 };
 function rosterHTML(data){
  return `${!data.started?'<p class="note">Attendance can be recorded after this meeting starts.</p>':''}<div class="meeting-attendance-rows">${data.participants.map(p=>`<div class="meeting-attendance-row"><div><strong>${esc(p.name)}</strong><small class="muted">${esc(departmentLabel(p.department))}${p.recorded_at?' · '+esc(p.recorder_name)+' · '+esc(datetime(p.recorded_at)):''}</small></div>${p.can_record?`<label class="meeting-attendance-choice"><span class="sr-only">Attendance for ${esc(p.name)}</span><select data-attendance-user="${esc(p.user_id)}"><option value="" ${p.status==='unrecorded'?'selected':''}>Unrecorded</option>${['present','absent','excused'].map(status=>`<option value="${status}" ${p.status===status?'selected':''}>${esc(human(status))}</option>`).join('')}</select></label>`:badge(p.status)}</div>`).join('')||'<p class="hint">No participants were invited.</p>'}</div>${data.can_record&&data.participants.some(p=>p.can_record)?`<div class="meeting-attendance-save">${button('Save & report to HR','meeting-attendance-save','primary',`data-id="${esc(data.meeting.id)}"`)}<span class="hint">Unrecorded participants stay unrecorded. Corrections retain their history.</span></div>`:''}<p class="form-error" role="alert" data-attendance-error></p><p class="hint" role="status" data-attendance-result></p>${data.history.length?`<details class="meeting-attendance-history"><summary>Recent record history</summary>${data.history.slice(0,8).map(h=>`<p class="small">${esc(h.name)}: ${esc(h.previous_status?human(h.previous_status):'Unrecorded')} → ${esc(human(h.status))} · ${esc(h.recorder_name)} · ${esc(datetime(h.recorded_at))}</p>`).join('')}</details>`:''}`;
 }
 handleAction=async function(element){
  if(element.dataset.action==='meeting-attendance-open'){
   const host=element.closest('[data-meeting-attendance]'),region=host?.querySelector('[data-meeting-roster]');if(!region)return;
   if(element.getAttribute('aria-expanded')==='true'){region.hidden=true;element.setAttribute('aria-expanded','false');element.textContent='Open roster';return;}
   region.hidden=false;region.innerHTML='<p class="hint" role="status">Loading attendance roster…</p>';element.setAttribute('aria-expanded','true');element.textContent='Close roster';
   try{const data=await api('/api/meetings/'+encodeURIComponent(element.dataset.id)+'/attendance');if(region.isConnected)region.innerHTML=rosterHTML(data);}catch(error){if(region.isConnected)region.innerHTML='<p class="form-error" role="alert">'+esc(error.message)+'</p>';}
   return;
  }
  if(element.dataset.action==='meeting-attendance-save'){
   const region=element.closest('[data-meeting-roster]');if(!region)return;
   const entries=[...region.querySelectorAll('[data-attendance-user]')].filter(el=>el.value).map(el=>({user_id:el.dataset.attendanceUser,status:el.value}));
   const error=region.querySelector('[data-attendance-error]');error.textContent='';if(!entries.length){error.textContent='Choose an attendance status for at least one participant.';return;}
   try{
    const data=await api('/api/meetings/'+encodeURIComponent(element.dataset.id)+'/attendance','PUT',{entries});
    if(region.isConnected){region.innerHTML=rosterHTML(data);region.querySelector('[data-attendance-result]').textContent=data.unchanged?'Attendance is unchanged. HR already has this summary.':'Attendance saved and reported to HR in TEL OS.';}
    const meeting=records.meetings?.find(m=>m.id===element.dataset.id);if(meeting)meeting.attended=data.participants.filter(p=>p.status==='present').map(p=>p.user_id);
   }catch(failure){error.textContent=failure.message;}
   return;
  }
  return previousAction(element);
 };
 document.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-hr-record-filter]');if(!form)return;event.preventDefault();
  const button=form.querySelector('button[type="submit"]'),error=form.querySelector('[data-hr-filter-error]'),fields=new FormData(form);error.textContent='';
  if(fields.get('from')>fields.get('to')){error.textContent='Choose a start date before the end date.';return;}
  hrRecordsFilters={from:String(fields.get('from')),to:String(fields.get('to')),user_id:String(fields.get('user_id')||'')};button.disabled=true;button.textContent='Loading records…';
  try{await navigate();}catch(failure){error.textContent=failure.message;}finally{if(button.isConnected){button.disabled=false;button.textContent='Apply filters';}}
 });
})();
