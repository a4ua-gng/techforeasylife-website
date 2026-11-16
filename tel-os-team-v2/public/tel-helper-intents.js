export function normaliseRequest(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function helperDestinations({role, department, channels = []}) {
  const founder = role === 'founder';
  const hr = ['founder', 'hr_lead', 'hr_member'].includes(role);
  const reports = hr || ['team_lead', 'finance_head'].includes(role);
  const items = [
    ['home', 'Home', 'Your daily overview', ['home', 'dashboard', 'overview', 'welcome']],
    ['tasks', 'My tasks', 'Assignments and reviews', ['tasks', 'task', 'assignments', 'my work', 'deadlines', 'deliverables']],
    ['attendance', 'Attendance', 'Clock in, breaks and working times', ['attendance', 'clock in', 'clock out', 'check in', 'check out', 'break', 'clockin', 'clockout', 'start time', 'working hours', 'clock in schedule']],
    ['leave', 'Time off', 'Leave requests and decisions', ['time off', 'leave', 'holiday request', 'vacation']],
    ['calendar', 'Team calendar', 'Dates and team availability', ['calendar', 'team availability']],
    ['announcements', 'Announcements', 'Official company announcements', ['announcements', 'announcement', 'company news', 'notice board']],
    ['people', 'People', 'Find teammates and reporting lines', ['people', 'directory', 'team members', 'crew', 'who reports to']],
    ['meetings', 'Meetings', 'Meeting invitations and call details', ['meetings', 'meeting', 'calls', 'schedule meeting', 'upcoming meeting']],
    ['documents', 'Policies & documents', 'Company policies and shared documents', ['policies', 'policy', 'documents', 'handbook']],
    ['grievances', 'Contact HR', 'Private HR support and complaints', ['hr', 'contact hr', 'hr help', 'hr support', 'complaint', 'complaints', 'ticket', 'tickets', 'grievance']],
    ['performance', 'Feedback', 'Work feedback', ['feedback', 'performance']],
    ['notifications', 'Notifications', 'Your new updates', ['notifications', 'notification', 'alerts', 'updates']],
    ['account', 'My account', 'Profile, password and identity documents', ['account', 'profile', 'password', 'my identity card', 'my id card', 'profile picture', 'profile photo']],
    ['guide', 'Start here', 'Beginner navigation guide', ['guide', 'help', 'how to use', 'start here', 'tutorial']],
    ['images', 'Images & uploads', 'Your accessible shared images', ['images', 'uploads', 'pictures', 'photos']],
    ['connections', 'Email setup', 'Register and verify your notification email', ['email', 'email setup', 'verify email', 'register email', 'connections', 'verification']],
    ['exits', 'Leaving the team', 'Exit requests', ['exit', 'resignation', 'leaving the team']],
    ['hr', 'People admin', 'Employee administration', ['people admin', 'hr admin', 'employee records', 'manage employees'], hr],
    ['reports', 'Team reports', 'Authorised team reports', ['reports', 'team reports'], reports],
    ['marketing-reports', 'TeMark reports', 'TeMark updates to Harsh', ['reports', 'marketing reports', 'marketing report', 'marketing updates', 'temark reports', 'temark updates'], founder || department === 'Marketing'],
    ['website-team', 'Website Team editor', 'Public team entries', ['website team', 'website editor', 'team editor'], hr],
    ['founder-updates', 'Founder text updates', 'Company operational summaries', ['founder updates', 'founder text updates', 'company updates', 'company overview', 'operational summary'], founder],
    ['monitor', 'Activity & status', 'Team presence and last heartbeats', ['activity', 'monitor', 'monitoring', 'presence', 'online', 'heartbeat', 'heartbeats', 'heart beat', 'last seen', 'who is online'], founder]
  ].map(([route, label, description, terms, available = true]) => ({route, label, description, terms, available}));
  for (const channel of channels) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(channel.id)) continue;
    const name = channel.id === 'marketing' ? 'TeMark' : channel.name;
    const terms = [`${channel.name} chat`, `${channel.name} channel`, `channel ${channel.name}`, `${name} chat`, `${name} channel`, `channel ${name}`];
    if (channel.id === 'marketing-reports') terms.push('report chat', 'reports chat', 'marketing report chat');
    items.push({route: `channel/${channel.id}`, label: `#${name}`, description: 'Team channel', terms, available: true});
  }
  return items;
}

export function resolveHelperRequest(value, destinations) {
  const query = normaliseRequest(value);
  if (!query) return {type: 'empty', choices: []};
  const contains = phrase => (` ${query} `).includes(` ${normaliseRequest(phrase)} `);
  if (/^(hi|hello|hey|thanks|thank you|what can you do|help me)$/.test(query)) return {type: 'conversation', message: /thank/.test(query) ? 'You’re welcome. What would help next?' : 'I can check your current tasks, upcoming meetings and work status, or open a workspace section. What would help?'};
  if (/^(how (do|can|should) i|how to)\b/.test(query)) {
    const guides = [
      [/\b(tasks?|assignments?|deliverables?|submission)\b|\bsubmit work\b/, 'tasks', 'Open My tasks, choose your assignment and use Submit deliverable when your work is ready. Your reviewer can approve it or request a revision. Sending a chat message does not submit the assignment.'],
      [/\b(meetings?|calls?)\b/, 'meetings', 'Open Meetings and choose your meeting to review its time, participants and call link. Use the call link when one is provided. Organisers and authorised roles see the available meeting controls there.'],
      [/\b(clock|attendance|break|hours)\b/, 'attendance', 'Open Attendance and press Clock in when you begin. Pause for breaks, resume when you return and clock out when you finish. Your working hours are flexible; signing in alone does not clock you in.'],
      [/\b(hr|complaint|ticket|grievance)\b/, 'grievances', 'Open Contact HR, then choose an HR question or a complaint. You select the authorised recipient in the form. Add private details there; I do not read HR tickets.'],
      [/\b(leave|time off|vacation)\b/, 'leave', 'Open Time off to request leave and review its decision. Add your dates, reason and handover in the form. Your request follows the review steps shown there.'],
      [/\b(calendar|availability)\b/, 'calendar', 'Open Team calendar to review dates, your availability, meeting times and task deadlines. Use its labelled controls to plan availability; changes are saved only when you submit the relevant form.'],
      [/\b(announcement|announcements)\b/, 'announcements', 'Open Announcements to read official company notices. Authorised publishers have a separate publish control on that page.']
    ];
    const matches = guides.filter(([pattern]) => pattern.test(query));
    if (matches.length > 1) return {type: 'choose', choices: destinations.filter(item => item.available && matches.some(guide => guide[1] === item.route))};
    const guide = matches[0];
    if (guide) return {type: 'conversation', message: guide[2], choices: destinations.filter(item => item.route === guide[1] && item.available)};
  }
  const navigation = /(^| )(open|go|navigate|take me|where|find)( |$)/.test(query);
  const personal = /(^| )(my|me|i|next|upcoming)( |$)/.test(query);
  const question = /(^| )(what|when|how|am|do i|summary|summarise|summarize|check|due|upcoming|next)( |$)/.test(query);
  const topics = [];
  if (/\b(tasks?|assignments?|deadlines?|deliverables?)\b/.test(query)) topics.push('tasks');
  if (/\b(meetings?|calls?)\b/.test(query)) topics.push('meetings');
  if (/\b(work status|attendance status|working now|clocked in|clocked out|active time|hours today|workday|work summary)\b/.test(query) || /\bhours\b/.test(query) && /\b(today|worked|work)\b/.test(query) || /^(what is |whats |check )?my status$/.test(query)) topics.push('status');
  if (!navigation && personal && question && topics.length === 1) return {type: 'answer', topic: topics[0]};
  if (!navigation && topics.length > 1) return {type: 'choose', choices: topics.map(topic => ({query: topic === 'status' ? 'What is my work status?' : topic === 'tasks' ? 'What are my tasks?' : 'What are my upcoming meetings?', label: topic === 'status' ? 'My work status' : topic === 'tasks' ? 'My task summary' : 'My upcoming meetings', available: true}))};
  if (query === 'status') return {type: 'choose', choices: [{query: 'What is my work status?', label: 'My work status'}, ...destinations.filter(item => item.available && ['tasks', 'attendance'].includes(item.route))]};
  const heartbeat = ['heartbeat', 'heartbeats', 'heart beat', 'last seen'].some(contains);
  if (heartbeat) {
    const target = destinations.find(item => item.route === 'monitor');
    return target?.available ? {type: 'open', target, focus: 'heartbeat'} : {type: 'denied', message: 'Team heartbeats are available to founders. You can open Attendance to check your own work times.'};
  }
  const scored = destinations.map(target => {
    const phrases = target.route.startsWith('channel/') ? target.terms : [target.label, ...target.terms];
    const score = Math.max(0, ...phrases.filter(contains).map(phrase => {
      const normal = normaliseRequest(phrase);
      return query === normal ? 1000 : normal.split(' ').length * 20 + Math.min(normal.length, 16);
    }));
    return {target, score};
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return {type: 'unknown', choices: destinations.filter(item => item.available && ['guide', 'tasks', 'attendance', 'connections'].includes(item.route))};
  const best = scored[0].score;
  if (/\b(and|or)\b/.test(query)) {
    const requested = scored.filter(item => item.target.available).map(item => item.target);
    if (requested.length > 1) return {type: 'choose', choices: requested.slice(0, 6)};
  }
  const choices = scored.filter(item => item.score >= best - 2 && item.target.available).map(item => item.target);
  if (choices.length > 1) return {type: 'choose', choices};
  if (choices.length === 1) return {type: 'open', target: choices[0]};
  return {type: 'denied', message: 'That section is restricted for your role. Choose one of the sections available to you.'};
}

// Only these personal summaries are supported. Callers supply freshly fetched
// records, never private tickets, messages, deliverables or HR notes.
export function helperPersonalAnswer(topic, data, userId, now = new Date()) {
  const format = (value, timed = false) => {
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00+05:30' : value);
    if (!Number.isFinite(parsed.getTime())) return 'date not recorded';
    return new Intl.DateTimeFormat('en-IN', {timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', ...(timed ? {hour: 'numeric', minute: '2-digit', second: '2-digit'} : {})}).format(parsed) + (timed ? ' IST' : '');
  };
  const checked = 'Checked ' + format(now, true) + '.';
  if (topic === 'tasks') {
    const own = (data.tasks || []).filter(task => task.assignee_id === userId && task.status !== 'done').sort((a, b) => String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')));
    const labels = {todo: 'To do', working: 'In progress', review: 'In review', revision: 'Revision required', approved: 'Approved'};
    return {text: own.length ? `${own.length} active assignment${own.length === 1 ? '' : 's'} assigned to you.${own.length > 3 ? ' Here are the next three by deadline.' : ''}` : 'You have no active assignments assigned to you.', lines: own.slice(0, 3).map(task => `${String(task.title || 'Untitled assignment').slice(0, 180)} · ${labels[task.status] || 'Status not recorded'} · Due ${format(task.deadline)}${task.overdue ? ' · Overdue' : ''}`), checked};
  }
  if (topic === 'meetings') {
    const own = (data.meetings || []).filter(meeting => (meeting.participants?.includes(userId) || meeting.created_by === userId) && Date.parse(meeting.starts_at) >= now.getTime()).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    return {text: own.length ? `${own.length} upcoming meeting${own.length === 1 ? '' : 's'} for you as a participant or organiser.${own.length > 3 ? ' Here are the next three.' : ''}` : 'No upcoming meetings list you as a participant or organiser.', lines: own.slice(0, 3).map(meeting => `${String(meeting.title || 'Untitled meeting').slice(0, 180)} · ${format(meeting.starts_at, true)}`), checked};
  }
  if (topic === 'status') {
    const day = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
    const current = data.attendance?.current;
    const own = (data.attendance?.attendance || []).filter(entry => entry.user_id === userId && entry.work_date === day);
    const seconds = own.reduce((sum, entry) => sum + Math.max(0, Number(entry.active_seconds) || 0), 0);
    const state = current?.user_id === userId ? ({working: 'You are clocked in and working.', break: 'You are clocked in and on a break.'}[current.state] || 'Your current attendance state is not recorded.') : data.user?.id === userId && data.user.status === 'on_leave' ? 'Your account is marked on leave.' : own.length ? 'You are clocked out.' : 'You have not clocked in today.';
    return {text: state, lines: [`Active time recorded today: ${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m · ${format(day)} IST.`], checked};
  }
  throw new Error('Unsupported helper summary.');
}
