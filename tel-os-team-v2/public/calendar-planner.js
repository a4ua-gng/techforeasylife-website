'use strict';

// Calendar data comes only from the existing, permission-scoped workspace APIs.
(() => {
 const previousAction=handleAction,previousLogin=renderLogin;
 let state=null,feeds=null,requestVersion=0;
 renderLogin=function(){state=null;feeds=null;requestVersion++;return previousLogin();};
 const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 const dayDate=value=>new Date(value+'T12:00:00Z');
 const iso=value=>value.toISOString().slice(0,10);
 const monthOf=value=>value.slice(0,7)+'-01';
 const dayOf=value=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):'';
 const longDay=value=>new Intl.DateTimeFormat('en-IN',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(dayDate(value));
 const monthLabel=value=>new Intl.DateTimeFormat('en-IN',{timeZone:'UTC',month:'long',year:'numeric'}).format(dayDate(value));
 const department=value=>value==='Marketing'?'TeMark':value;
 const availabilityLabel=kind=>({exam:'Exam period',unavailable:'Unavailable',available:'Available',weekly_schedule:'Working schedule'}[kind]||'Shared availability');
 const categories={meeting:'Meeting',task:'Task due',leave:'Approved leave',availability:'Availability',holiday:'Company holiday'};
 function ensureState(){
  if(!state||state.userId!==user.id)state={userId:user.id,month:monthOf(today()),selected:today(),view:'month',mine:false,meeting:true,task:true,away:true};
 }
 function eventList(){
  const result=[],self=user.id;
  if(state.meeting)for(const item of feeds.meetings){
   const day=dayOf(item.starts_at);if(!day||state.mine&&item.created_by!==self&&!item.participants?.includes(self))continue;
   result.push({key:'meeting-'+item.id,kind:'meeting',start:day,end:day,title:item.title,when:time(item.starts_at)+' IST',detail:department(item.department||'Company'),sort:item.starts_at,action:'meeting-details',id:item.id});
  }
  if(state.task)for(const item of feeds.tasks){
   if(!validDay(item.deadline)||['approved','done'].includes(item.status)||state.mine&&item.assignee_id!==self)continue;
   const extension=feeds.extensions.find(entry=>entry.task_id===item.id&&entry.extended_deadline===item.deadline);
   result.push({key:'task-'+item.id,kind:'task',start:item.deadline,end:item.deadline,title:item.title,when:'Due by end of day IST',detail:(item.assignee_name||nameOf(item.assignee_id))+' · '+human(item.status),extension:extension?'Original due '+date(extension.original_deadline)+' · +1 calendar day'+(extension.escalated_at?' · Missed extended deadline':''):null,sort:'2',action:'task-details',id:item.id});
  }
  if(state.away){
   for(const item of feeds.calendar.leaves||[]){
    if(!validDay(item.start_date)||!validDay(item.end_date)||state.mine&&item.user_id!==self)continue;
    // Leave categories and private reasons do not belong in this shared view.
    result.push({key:'leave-'+item.id,kind:'leave',start:item.start_date,end:item.end_date,title:item.name||nameOf(item.user_id),when:'Approved leave',detail:date(item.start_date)+' – '+date(item.end_date)+(item.handover_to?' · Cover: '+(item.handover_name||nameOf(item.handover_to)):''),notes:item.handover_notes,sort:'3'});
   }
   for(const item of feeds.calendar.availability||[]){
    if(!validDay(item.start_date)||!validDay(item.end_date)||state.mine&&item.user_id!==self)continue;
    result.push({key:'availability-'+item.id,kind:'availability',start:item.start_date,end:item.end_date,title:item.name||nameOf(item.user_id),when:availabilityLabel(item.kind),detail:date(item.start_date)+' – '+date(item.end_date),notes:item.notes,sort:'4',remove:item.user_id===self,id:item.id});
   }
   for(const item of feeds.holidays){
    if(!validDay(item.date))continue;
    result.push({key:'holiday-'+item.id,kind:'holiday',start:item.date,end:item.date,title:item.title,when:'Company holiday',detail:'All day',sort:'0'});
   }
  }
  return result.sort((a,b)=>a.sort.localeCompare(b.sort)||a.title.localeCompare(b.title));
 }
 const eventsOn=(events,day)=>events.filter(item=>item.start<=day&&item.end>=day);
 function eventHTML(item){
  const content=`<span class="planner-event-type planner-tone-${item.kind}">${esc(categories[item.kind])}</span><strong>${esc(item.title)}</strong><span class="planner-event-time">${esc(item.when)}</span><small>${esc(item.detail)}</small>${item.extension?`<small class="planner-extension">${esc(item.extension)}</small>`:''}`;
  return `<li class="planner-agenda-item" data-calendar-kind="${item.kind}" data-calendar-event="${esc(item.key)}">${item.action?`<button class="planner-event-open" data-action="${item.action}" data-id="${esc(item.id)}" aria-label="Open ${esc(categories[item.kind].toLowerCase())}: ${esc(item.title)}">${content}<span class="planner-open-label">Open ${item.kind==='task'?'task':'meeting'} ${icon('chevron')}</span></button>`:`<div class="planner-event-copy">${content}${item.notes?`<p class="planner-shared-note">${esc(item.notes)}</p>`:''}${item.remove?button('Remove my entry','remove-availability','small',`data-id="${esc(item.id)}"`):''}</div>`}</li>`;
 }
 function agendaHTML(events,day,selected=false){
  const items=eventsOn(events,day);
  return `<section ${selected?'id="calendar-selected-day"':''} class="planner-day-agenda ${selected?'planner-selected-agenda panel':''}" aria-label="${esc(longDay(day))} agenda"><header><div><span class="planner-section-label">${selected?'Selected day':'Agenda'}</span><h2 ${selected?'tabindex="-1"':''}>${esc(longDay(day))}${day===today()?'<span class="planner-today-label">Today</span>':''}</h2></div><span class="planner-day-total">${items.length} ${items.length===1?'item':'items'}</span></header>${items.length?`<ul class="planner-agenda-list">${items.map(eventHTML).join('')}</ul>`:`<div class="planner-empty"><strong>No items for this day</strong><p>${!state.meeting&&!state.task&&!state.away?'Choose a calendar filter to show items.':state.mine?'Your selected calendars are clear. Turn off My items to see the wider team.':'Try another date or change the calendar filters.'}</p></div>`}</section>`;
 }
 function monthHTML(events){
  const base=dayDate(state.month),year=base.getUTCFullYear(),month=base.getUTCMonth(),offset=(base.getUTCDay()+6)%7;
  const start=new Date(Date.UTC(year,month,1-offset,12));
  const count=Math.ceil((offset+new Date(Date.UTC(year,month+1,0)).getUTCDate())/7)*7;
  const cells=Array.from({length:count},(_,index)=>{
   const current=new Date(start);current.setUTCDate(current.getUTCDate()+index);const day=iso(current),items=eventsOn(events,day),outside=current.getUTCMonth()!==month;
   return `<button class="planner-day ${outside?'is-outside':''} ${day===today()?'is-today':''} ${day===state.selected?'is-selected':''}" data-action="planner-day" data-date="${day}" aria-pressed="${day===state.selected}" ${day===today()?'aria-current="date"':''} aria-label="${esc(longDay(day)+', '+current.getUTCFullYear()+', '+items.length+' '+(items.length===1?'item':'items'))}"><span class="planner-day-number">${current.getUTCDate()}</span>${items.length?`<span class="planner-cell-count">${items.length}<span class="planner-count-word"> ${items.length===1?'item':'items'}</span></span><span class="planner-cell-preview" aria-hidden="true">${items.slice(0,2).map(item=>`<span class="planner-preview planner-tone-${item.kind}">${esc(item.kind==='meeting'?time(item.sort)+' '+item.title:item.title)}</span>`).join('')}${items.length>2?`<span class="planner-more">+${items.length-2} more</span>`:''}</span>`:'<span class="planner-cell-empty" aria-hidden="true"></span>'}</button>`;
  }).join('');
  return `<div class="planner-month-layout"><section class="panel planner-month" id="calendar-month-view" aria-label="${esc(monthLabel(state.month))} month"><div class="planner-weekdays" aria-hidden="true">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=>`<span>${day}</span>`).join('')}</div><div class="planner-month-grid">${cells}</div><p class="planner-grid-hint">Select a date to see every item and open its details.</p></section>${agendaHTML(events,state.selected,true)}</div>`;
 }
 function monthAgendaHTML(events){
  const start=dayDate(state.month),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0,12)),days=[];
  for(let day=new Date(start);day<=end;day.setUTCDate(day.getUTCDate()+1)){const value=iso(day);if(eventsOn(events,value).length)days.push(value);}
  return `<section class="panel planner-month-agenda" id="calendar-agenda-view" aria-label="${esc(monthLabel(state.month))} agenda">${days.length?days.map(day=>agendaHTML(events,day)).join(''):`<div class="planner-empty"><strong>No items in ${esc(monthLabel(state.month))}</strong><p>${!state.meeting&&!state.task&&!state.away?'Choose a calendar filter to show items.':'Try another month or change the calendar filters.'}</p></div>`}</section>`;
 }
 function ongoingHTML(){
  const members=state.away?(feeds.calendar.on_leave||[]).filter(member=>!state.mine||member.id===user.id):[];
  return members.length?`<details class="planner-ongoing" id="calendar-ongoing-leave"><summary>Ongoing leave · ${members.length} ${members.length===1?'person':'people'}</summary><ul>${members.map(member=>`<li><strong>${esc(member.name)}</strong><span>${esc(department(member.department||''))} · Return date not set</span></li>`).join('')}</ul></details>`:'';
 }
 function contentHTML(){
  const events=eventList(),base=dayDate(state.month),last=iso(new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0,12))),monthEvents=events.filter(item=>item.start<=last&&item.end>=state.month);
  const counts=['meeting','task','away'].map(kind=>{const count=monthEvents.filter(item=>kind==='away'?['leave','availability','holiday'].includes(item.kind):item.kind===kind).length;return `${count} ${kind==='meeting'?'meetings':kind==='task'?'task deadlines':'time-away entries'}`;}).join(' · ');
  const warnings=feeds.missing.length?`<p class="planner-load-warning" role="alert">Could not load ${esc(feeds.missing.join(', '))}. ${button('Refresh','refresh','small')}</p>`:'';
  return `<div class="planner-toolbar"><div class="planner-month-navigation"><button class="btn planner-arrow" data-action="planner-prev" aria-label="Previous month">${icon('chevron')}</button><h2 id="calendar-month-title">${esc(monthLabel(state.month))}</h2><button class="btn planner-arrow" data-action="planner-next" aria-label="Next month">${icon('chevron')}</button>${button('Today','planner-today')}</div><div class="planner-view-switch" role="group" aria-label="Calendar view">${[['month','Month'],['agenda','Agenda']].map(([value,label])=>`<button class="btn ${state.view===value?'is-active':''}" data-action="planner-view" data-value="${value}" aria-pressed="${state.view===value}">${label}</button>`).join('')}</div></div><div class="planner-controls"><fieldset class="planner-filters"><legend class="sr-only">Show calendars</legend>${[['meeting','Meetings'],['task','Task deadlines'],['away','Time away']].map(([key,label])=>`<label class="planner-filter"><input type="checkbox" data-calendar-filter="${key}" ${state[key]?'checked':''}><span>${label}</span></label>`).join('')}<label class="planner-filter planner-mine"><input type="checkbox" data-calendar-filter="mine" ${state.mine?'checked':''}><span>My items</span></label></fieldset><label class="planner-jump" for="calendar-jump-date"><span>Jump to date</span><input id="calendar-jump-date" type="date" value="${esc(state.selected)}" min="1900-01-01" max="9999-12-31"></label></div><p class="planner-scope">${state.mine?'Your meetings, assigned tasks and time away; company holidays stay visible.':'Meetings and active task deadlines visible to you, with shared team availability.'}</p>${warnings}<div class="planner-legend" aria-label="Calendar legend">${Object.entries(categories).map(([key,label])=>`<span><i class="planner-tone-${key}" aria-hidden="true"></i>${label}</span>`).join('')}</div>${state.view==='month'?monthHTML(events):monthAgendaHTML(events)}${ongoingHTML()}<p class="planner-data-note">Times and task due dates use IST. Completed tasks stay in My tasks. Shared leave and availability cover today onward; company holidays cover the next 120 days.</p><span data-planner-summary hidden>${esc(monthLabel(state.month)+' · '+counts+(state.view==='month'?' · '+longDay(state.selected)+' selected':''))}</span>`;
 }
 function render(focusSelector){
  const host=$('#team-calendar-planner [data-calendar-ui]');if(!host||!feeds)return;
  host.innerHTML=contentHTML();const status=$('#calendar-planner-status');if(status)status.textContent=$('[data-planner-summary]')?.textContent||'';
  if(focusSelector)$(focusSelector)?.focus({preventScroll:true});
 }
 calendarPage=async function(){
  ensureState();const account=user.id,version=++requestVersion;
  const requests=[['shared availability','/api/calendar'],['meetings','/api/meetings'],['task deadlines','/api/tasks'],['deadline extensions','/api/deadline-policy'],['company holidays','/api/schedules']];
  const responses=await Promise.allSettled(requests.map(([,path])=>api(path))),values=responses.map(response=>response.status==='fulfilled'?response.value:{});
  if(!user||user.id!==account||version!==requestVersion)return '';
  feeds={calendar:values[0].calendar||{},meetings:values[1].meetings||[],tasks:values[2].tasks||[],extensions:values[3].extensions||[],holidays:values[4].holidays||[],missing:requests.filter((_,index)=>responses[index].status==='rejected').map(([name])=>name)};
  records.calendar=feeds.calendar;records.meetings=feeds.meetings;records.tasks=feeds.tasks;records.deadlineExtensions=feeds.extensions;
  return pageHeading('Team calendar','Plan meetings, deadlines and time away in one place.',plusButton('Share availability','new-availability'),'TEAM PLANNING')+`<section class="calendar-planner" id="calendar-content" tabindex="-1" aria-labelledby="calendar-month-title"><div id="team-calendar-planner"><div data-calendar-ui>${contentHTML()}</div></div><p id="calendar-planner-status" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p></section>`;
 };
 function shiftMonth(delta){
  const current=dayDate(state.month),target=new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+delta,1,12));
  if(target.getUTCFullYear()<1900||target.getUTCFullYear()>9999)return;
  const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0,12)).getUTCDate(),selected=dayDate(state.selected).getUTCDate();
  state.month=iso(target);target.setUTCDate(Math.min(selected,last));state.selected=iso(target);
 }
 handleAction=async function(element){
  const action=element.dataset.action;if(!action?.startsWith('planner-'))return previousAction(element);
  if(!state||!feeds||route!=='calendar')return;
  if(action==='planner-prev'||action==='planner-next'){shiftMonth(action==='planner-prev'?-1:1);render(`[data-action="${action}"]`);}
  else if(action==='planner-today'){state.selected=today();state.month=monthOf(today());render('[data-action="planner-today"]');}
  else if(action==='planner-view'&&['month','agenda'].includes(element.dataset.value)){state.view=element.dataset.value;render(`[data-action="planner-view"][data-value="${state.view}"]`);}
  else if(action==='planner-day'&&validDay(element.dataset.date)){
   state.selected=element.dataset.date;state.month=monthOf(state.selected);render(`[data-action="planner-day"][data-date="${state.selected}"]`);
  }
 };
 document.addEventListener('change',event=>{
  const control=event.target;if(!(control instanceof HTMLInputElement)||!control.closest('#team-calendar-planner')||!state||!feeds)return;
  const filter=control.dataset.calendarFilter;
  if(['meeting','task','away','mine'].includes(filter)){state[filter]=control.checked;render(`[data-calendar-filter="${filter}"]`);}
  else if(control.id==='calendar-jump-date'&&control.validity.valid&&validDay(control.value)){state.selected=control.value;state.month=monthOf(control.value);render('#calendar-jump-date');}
 });
})();
