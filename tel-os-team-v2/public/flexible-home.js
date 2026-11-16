'use strict';

// Home uses the same records and actions as Tasks, Meetings and Attendance.
(() => {
  const previousHome = homePage;
  const previousShell = shell;
  const previousScheduleSummary = scheduleSummary;
  const previousScheduleManagement = scheduleManagement;
  const previousAttendancePage = attendancePage;
  const previousGuidePage = guidePage;
  const previousClockWidget = clockWidget;
  const isFlexible = data => data?.flexible === true || data?.attendance_mode === 'flexible' || data?.policy?.flexible === true || data?.policy?.attendance_mode === 'flexible';
  const dayOf = value => new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(value));
  const members = () => people.filter(member => !['exited', 'suspended'].includes(member.status));

  clockWidget = function (data) {
    const template = document.createElement('template');
    template.innerHTML = previousClockWidget(data);
    const status = template.content.querySelector('.clock-panel > .btn-row .badge');
    if (status && !data.current && !onLeaveToday()) status.outerHTML = badge('not_clocked_in');
    return template.innerHTML;
  };

  scheduleSummary = function (data) {
    if (!isFlexible(data)) return previousScheduleSummary(data);
    const state = data.today || ownSchedule(data)?.today || {}, target = Number(data.target_hours || data.policy?.target_hours) || 4;
    const leave = state.status === 'exempt';
    return `<section class="panel panel-pad schedule-summary flexible-schedule-summary"><div class="schedule-top"><span class="section-title">Your working plan</span><span class="badge">${leave ? 'Availability recorded' : 'Flexible hours'}</span></div><h2>${leave ? 'Make room for your time away.' : 'Your day, at your pace.'}</h2><p>${leave ? esc(human(state.reason || 'Approved time away')) + '. Your availability is taken into account.' : `Choose when you begin and aim for around ${esc(target)} active hours. Pause for breaks and clock out when you finish.`}</p>${state.first_clock_in ? `<p class="small muted">First clock-in today: <strong>${esc(time(state.first_clock_in))} IST</strong>.</p>` : '<p class="small muted">Signing in opens TEL OS. Press <strong>Clock in</strong> when you begin working to record attendance.</p>'}<a class="link-btn" href="#calendar">Plan your availability ${icon('arrow')}</a></section>`;
  };

  scheduleManagement = function (data) {
    if (!isFlexible(data)) return previousScheduleManagement(data);
    const rows = data.schedules || [], holidays = data.holidays || [];
    if (!isHR() && rows.length < 2) return '';
    const roster = `<div class="table-wrap"><table class="table"><thead><tr><th>Team member</th><th>Working plan</th><th>Today</th></tr></thead><tbody>${rows.map(row => `<tr><td><strong>${esc(row.name)}</strong><small>${esc(row.department === 'Marketing' ? 'Team ARC' : row.department)}</small></td><td>Flexible hours<small>Around ${esc(row.target_hours || 4)} active hours</small></td><td>${row.today?.status === 'exempt' ? esc(human(row.today.reason || 'Time away')) : row.today?.first_clock_in ? 'Clock-in recorded' : 'Begin when ready'}</td></tr>`).join('')}</tbody></table></div>`;
    if (!isHR()) return `<section class="panel flexible-arrangements" style="margin-top:24px"><div class="panel-header"><h2>Your team’s working plan</h2></div>${roster}</section>`;
    return `<details class="schedule-admin panel flexible-arrangements" style="margin-top:24px"><summary><span>${icon('settings')}Working plans & company holidays<small>HR and founder controls</small></span>${icon('chevron')}</summary><div class="panel-body"><div class="schedule-policy"><div><h3>Flexible working</h3><p>The team chooses when to begin and records active work, breaks and clock-out. Keep shared availability current so everyone can plan together.</p></div></div>${roster}<section class="holiday-section"><div class="panel-header"><h3>Company holidays</h3>${button('Add holiday', 'new-holiday', 'small')}</div>${holidays.length ? holidays.map(holiday => `<div class="row"><div class="row-main"><strong>${esc(holiday.title)}</strong><small>${esc(date(holiday.date, true))}</small></div>${button('Remove', 'remove-holiday', 'small', `data-id="${esc(holiday.id)}"`)}</div>`).join('') : '<p class="hint">No company holidays have been added. Add shared dates here to help the team plan.</p>'}</section></div></details>`;
  };

  attendancePage = async function () {
    const html = await previousAttendancePage();
    if (!isFlexible(records.schedules)) return html;
    const template = document.createElement('template'); template.innerHTML = html;
    const subtitle = template.content.querySelector('.page-title p');
    if (subtitle) subtitle.textContent = 'Clock in when you begin, pause for breaks, and clock out when you finish.';
    return template.innerHTML;
  };

  guidePage = async function () {
    const html = await previousGuidePage();
    if (!isFlexible(records.schedules)) return html;
    const template = document.createElement('template'); template.innerHTML = html;
    const root = template.content, first = root.querySelector('.guide-step');
    const firstTitle = first?.querySelector('h2'), firstCopy = first?.querySelector('p');
    if (firstTitle) firstTitle.textContent = 'Begin when you’re ready';
    if (firstCopy) firstCopy.textContent = 'Open Attendance and press Clock in when you begin working. Aim for around four active hours, with room for classes, exams and breaks. Signing in alone does not record attendance.';
    const intro = root.querySelector('.guide-intro > p');
    if (intro) intro.textContent = 'Start on Home for your tasks, upcoming meetings and active time. The menu on the left opens each part of the workspace; on a phone, use the menu button at the top.';
    const reminder = root.querySelector('.guide-reminders');
    if (reminder) reminder.innerHTML = `<h2>A working rhythm that fits your day.</h2><p>Your hours are flexible. Choose when you start, pause for breaks, and clock out when you finish. Aim for around four active hours and focus on the work you deliver.</p><div class="note">${icon('heart')}<span>Have classes, exams or time away? Update your availability or request time off so your lead can plan with you.</span></div>`;
    const roleCopy = root.querySelector('.guide-role p');
    if (roleCopy) roleCopy.textContent = roleCopy.textContent.replace('Open Attendance to manage start times, working days and company holidays.', 'Open Attendance to review working plans and company holidays.');
    for (const link of root.querySelectorAll('a[href="#attendance"]')) if (link.textContent === 'Manage schedules') link.textContent = 'Working plans';
    return template.innerHTML;
  };

  function supportShortcut() {
    return `<section class="flexible-hr-shortcut" aria-label="Private help from HR"><span class="flexible-hr-icon">${icon('shield')}</span><div><strong>A little support, whenever you need it.</strong><p>Ask HR a question or register a complaint. Private to you and authorised reviewers.</p></div><a class="btn" href="#grievances">Contact HR ${icon('arrow')}</a></section>`;
  }

  function policyNote(data) {
    const target = Number(data.target_hours || data.policy?.target_hours) || 4;
    return `<section class="flexible-policy-note" aria-label="Flexible working policy">${icon('calendar')}<div><strong>Work around your day.</strong><p>Choose when you begin. Aim for around ${esc(target)} active hours, with breaks whenever you need them. Keep your availability up to date.</p><a class="link-btn" href="#calendar">Plan your availability ${icon('arrow')}</a></div></section>`;
  }

  function taskLine(task) {
    const own = task.assignee_id === user.id;
    const due = task.deadline === today() ? 'Due today' : task.deadline < today() ? 'Due ' + date(task.deadline) : 'Due ' + date(task.deadline);
    return `<li><button class="flexible-task-link" data-action="task-details" data-id="${esc(task.id)}"><span><strong>${esc(task.title)}</strong><small>${esc(due)}${own ? '' : ' · ' + esc(task.assignee_name || nameOf(task.assignee_id))}</small></span><span class="flexible-task-state">${esc(task.status === 'review' ? own ? 'With your reviewer' : 'Ready for your review' : task.status === 'working' ? 'In progress' : task.status === 'revision' ? 'Revision requested' : task.status === 'approved' ? 'Approved' : 'To do')}${icon('chevron')}</span></button></li>`;
  }

  function timeline(data) {
    const attendance = records.attendance || {}, current = attendance.current;
    const sessions = (attendance.attendance || []).filter(session => session.user_id === user.id && session.work_date === today() && session.source !== 'correction').sort((a, b) => a.clock_in.localeCompare(b.clock_in));
    const first = sessions[0], last = sessions.at(-1);
    const open = (records.tasks || []).filter(task => task.status !== 'done');
    const own = open.filter(task => task.assignee_id === user.id);
    const review = open.filter(task => task.assignee_id !== user.id && task.status === 'review' && (isFounder() || task.leader_id === user.id));
    const work = [...own, ...review].sort((a, b) => (a.deadline || '').localeCompare(b.deadline || '') || a.title.localeCompare(b.title));
    const upcoming = (records.meetings || []).filter(meeting => Date.parse(meeting.starts_at) >= Date.now()).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const meetings = upcoming.slice(0, 2);
    const flexible = isFlexible(data), onLeave = onLeaveToday();
    let startTitle = onLeave ? 'Take the time you need.' : flexible ? 'Begin when you’re ready.' : 'Your start, your next step.';
    let startCopy = onLeave ? 'You’re on leave. Your work and team will be here when you return.' : flexible ? 'Clock in when you start working. Your active time is recorded beside this plan.' : 'Use your attendance card to record your work. Check Attendance for your schedule.';
    if (current) {
      startTitle = current.state === 'break' ? 'A moment to recharge.' : 'Your workday is under way.';
      startCopy = `Clocked in at ${time(current.clock_in)} IST. ${current.state === 'break' ? 'Your active timer is paused until you resume.' : 'Pause for a break whenever you need one.'}`;
    } else if (first) {
      startTitle = 'You’ve made time for your work.';
      startCopy = `First clock-in at ${time(first.clock_in)} IST${last?.clock_out ? ' · last clock-out at ' + time(last.clock_out) + ' IST' : ''}. You can clock in again if you return today.`;
    }
    return `<section class="panel flexible-timeline" aria-labelledby="flexible-today-title"><div class="flexible-timeline-heading"><div><span class="eyebrow">A LITTLE CLARITY FOR YOUR DAY</span><h2 id="flexible-today-title">Your work today</h2><p>Your tasks and upcoming meetings, in one calm place.</p></div><span class="flexible-today-date">${esc(new Intl.DateTimeFormat('en-IN', {timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short'}).format(new Date()))}</span></div><ol class="flexible-timeline-list"><li class="flexible-timeline-step"><span class="flexible-timeline-marker">${icon('clock')}</span><div class="flexible-timeline-content"><h3>${esc(startTitle)}</h3><p>${esc(startCopy)}</p></div></li><li class="flexible-timeline-step"><span class="flexible-timeline-marker">${icon('task')}</span><div class="flexible-timeline-content"><div class="flexible-step-heading"><h3>${own.length ? 'Make room for your next task.' : review.length ? 'A fresh pair of eyes can help.' : 'Room for what comes next.'}</h3><a class="link-btn" href="#tasks">My tasks ${icon('arrow')}</a></div>${work.length ? `<ul class="flexible-task-list">${work.slice(0, 3).map(taskLine).join('')}</ul>${work.length > 3 ? `<p class="flexible-more-copy">${work.length - 3} more open ${work.length - 3 === 1 ? 'task' : 'tasks'} in My tasks.</p>` : ''}` : `<p>${isFounder() ? 'Your personal task queue is clear. The company overview below has your team’s work and reviews.' : isHR() ? 'Your personal task queue is clear. People reviews are listed below when they need your attention.' : 'No open tasks are assigned to you. New briefs and feedback will appear here.'}</p>`}</div></li><li class="flexible-timeline-step"><span class="flexible-timeline-marker">${icon('meeting')}</span><div class="flexible-timeline-content"><div class="flexible-step-heading"><h3>${meetings.length ? 'Next time together.' : 'A little breathing room.'}</h3><a class="link-btn" href="#meetings">Meetings ${icon('arrow')}</a></div>${meetings.length ? `<ul class="flexible-meeting-list">${meetings.map(meeting => `<li><button class="flexible-meeting-link" data-action="meeting-details" data-id="${esc(meeting.id)}"><span class="flexible-meeting-time">${esc(dayOf(meeting.starts_at) === today() ? 'Today' : date(meeting.starts_at))}<strong>${esc(time(meeting.starts_at))}<small>IST</small></strong></span><span class="flexible-meeting-copy"><strong>${esc(meeting.title)}</strong><small>${meeting.participants?.includes(user.id) ? 'You’re invited' : 'Team meeting'} · ${meeting.participants?.length || 0} participants</small></span>${icon('chevron')}</button></li>`).join('')}</ul>` : '<p>No upcoming meetings are scheduled in your view. Check the team calendar before planning shared work.</p>'}</div></li></ol></section>`;
  }

  function personLine(member) {
    const status = member.crew_status || 'not_clocked_in';
    const work = status === 'working' ? 'Working' : status === 'on_break' || status === 'break' ? 'On a break' : status === 'on_leave' ? 'On leave' : status === 'unavailable' ? 'Unavailable' : 'Not clocked in';
    return `<li data-home-presence-user="${esc(member.id)}">${avatar(member)}<span class="flexible-member-name"><strong>${esc(member.name)}</strong><small>${esc(work)}</small></span><span class="flexible-login-status ${member.presence === 'online' ? 'is-online' : ''}">${member.presence === 'online' ? 'Signed in' : member.presence === 'offline' ? 'Signed out' : 'Login unknown'}</span></li>`;
  }

  function presenceGroup(title, group, kind) {
    const preview = group.slice(0, 4), rest = group.slice(4);
    return `<section class="flexible-presence-group ${kind}" aria-label="${esc(title)}"><h3><span>${esc(title)}</span><span>${group.length}</span></h3>${group.length ? `<ul>${preview.map(personLine).join('')}</ul>${rest.length ? `<details class="flexible-presence-more"><summary>Show ${rest.length} more ${rest.length === 1 ? 'person' : 'people'} ${icon('chevron')}</summary><ul>${rest.map(personLine).join('')}</ul></details>` : ''}` : `<p>${kind === 'clocked-in' ? 'No one is clocked in right now.' : 'Everyone in this view is clocked in.'}</p>`}</section>`;
  }

  function teamPresence() {
    const roster = members().sort((a, b) => a.name.localeCompare(b.name));
    const clocked = roster.filter(member => ['working', 'on_break', 'break'].includes(member.crew_status));
    const out = roster.filter(member => !['working', 'on_break', 'break'].includes(member.crew_status));
    const online = roster.filter(member => member.presence === 'online').length;
    return `<section class="panel flexible-team-presence" data-flexible-home-presence aria-labelledby="flexible-team-title"><div class="panel-header"><div><h2 id="flexible-team-title">Team right now</h2><p>${online} signed in to TEL OS</p></div><a class="link-btn" href="#people">People ${icon('arrow')}</a></div><div class="flexible-presence-groups">${presenceGroup('Clocked in', clocked, 'clocked-in')}${presenceGroup('Not clocked in', out, 'clocked-out')}</div><p class="flexible-presence-note">Signing in opens TEL OS. Clocking in records work; breaks pause active time.</p></section>`;
  }

  function applyPresence(data) {
    const byId = new Map((data.people || []).map(member => [member.id, member]));
    people = people.map(member => {
      const state = byId.get(member.id);
      return state ? {...member, presence: state.presence, crew_status: state.work_status} : member;
    });
  }

  homePage = async function () {
    // Presence has a separate meaning from recorded attendance and is fetched explicitly.
    const [html, presence] = await Promise.all([previousHome(), api('/api/presence').catch(() => null)]);
    if (presence) applyPresence(presence);
    const template = document.createElement('template');
    template.innerHTML = html;
    const root = template.content, title = root.querySelector('.page-title'), daily = root.querySelector('.workspace-workday'), hero = root.querySelector('.workspace-hero');
    if (!title || !daily || !hero) return html;
    const subtitle = title.querySelector('p');
    if (subtitle) subtitle.textContent = isFounder() ? 'A clear day for you, and a thoughtful view of your team.' : user.department === 'Marketing' ? 'A little space to plan, create, and move your Team ARC work forward.' : user.department === 'HR' ? 'A little space for your work, and the people you support.' : 'Your work, your team, and a little clarity for the day ahead.';
    const top = document.createElement('div');
    top.className = 'flexible-home-intro';
    top.innerHTML = supportShortcut();
    title.after(top);
    const todayGrid = document.createElement('div');
    todayGrid.className = 'flexible-today-grid';
    todayGrid.innerHTML = timeline(records.schedules || {});
    daily.classList.add('flexible-workday');
    daily.setAttribute('aria-label', 'Your live attendance and working plan');
    if (isFlexible(records.schedules)) {
      const fixed = daily.querySelector('.schedule-summary');
      if (fixed) fixed.outerHTML = policyNote(records.schedules);
    }
    const clockHeading = daily.querySelector('.clock-panel .section-title');
    if (clockHeading) clockHeading.textContent = 'Your active time';
    const clockStatus = daily.querySelector('.clock-panel > .btn-row .badge');
    if (clockStatus && !records.attendance?.current && !onLeaveToday()) clockStatus.outerHTML = badge('not_clocked_in');
    todayGrid.append(daily);
    top.after(todayGrid);
    hero.classList.add('flexible-role-intro');
    for (const panel of root.querySelectorAll('.workspace-primary > .panel')) {
      const heading = panel.querySelector('.panel-header h2')?.textContent?.trim();
      if (heading === 'Upcoming meetings' || heading === 'Upcoming team meetings') panel.remove();
    }
    const crew = root.querySelector('.mini-people')?.closest('.panel');
    if (crew) crew.outerHTML = teamPresence();
    return template.innerHTML;
  };

  function promoteHR() {
    if (!user) return;
    const nav = document.querySelector('.nav-scroll'), link = nav?.querySelector('a[href="#grievances"]');
    if (!nav || !link || link.classList.contains('flexible-hr-nav')) return;
    link.classList.add('flexible-hr-nav');
    const label = link.querySelector('span');
    if (label) label.textContent = 'Contact HR';
    link.setAttribute('title', 'Contact HR or register a private complaint');
    const attendance = nav.querySelector('a[href="#attendance"]');
    if (attendance) attendance.after(link);
  }
  shell = function () { previousShell(); promoteHR(); };

  let updating = false;
  window.refreshFlexibleHomePresence = async function () {
    if (updating || !user || user.must_change_password || route !== 'home' || document.hidden || !document.querySelector('[data-flexible-home-presence]')) return;
    const owner = user.id;
    updating = true;
    try {
      const data = await api('/api/presence');
      if (!user || user.id !== owner || route !== 'home') return;
      applyPresence(data);
      const current = document.querySelector('[data-flexible-home-presence]');
      if (!current || current.contains(document.activeElement)) return;
      const open = [...current.querySelectorAll('details')].map(detail => detail.open);
      const updated = document.createElement('template');
      updated.innerHTML = teamPresence();
      [...updated.content.querySelectorAll('details')].forEach((detail, index) => { detail.open = open[index] || false; });
      current.replaceWith(updated.content);
    } catch {} finally { updating = false; }
  };
  setInterval(window.refreshFlexibleHomePresence, 15000);
  window.addEventListener('focus', window.refreshFlexibleHomePresence);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.refreshFlexibleHomePresence(); });
})();
